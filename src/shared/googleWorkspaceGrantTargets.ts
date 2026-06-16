import type {
  AmbientPermissionGrant,
  PermissionGrantActionKind,
  PermissionGrantTargetKind,
} from "./permissionTypes";
import type {
  GoogleWorkspaceMethodSideEffect,
  GoogleWorkspaceMethodSummary,
} from "./pluginTypes";

export const googleWorkspaceGrantTargetIdentityCondition = "googleWorkspaceGrantTargetIdentity";

export interface GoogleWorkspaceGrantTarget {
  actionKind: PermissionGrantActionKind;
  targetKind: Extract<PermissionGrantTargetKind, "connector">;
  connectorId: string;
  accountId: string;
  access: string;
  identity: string;
  label: string;
}

export interface GoogleWorkspaceMethodGrantTargetInput {
  accountHint?: string;
  resolvedAccountHint?: string;
}

export function googleWorkspaceGrantAccountId(accountHint?: string): string {
  return accountHint?.trim() || "default";
}

export function googleWorkspaceMethodGrantTarget(
  method: Pick<GoogleWorkspaceMethodSummary, "id" | "service" | "sideEffect">,
  input: GoogleWorkspaceMethodGrantTargetInput = {},
): GoogleWorkspaceGrantTarget | undefined {
  const connectorId = googleWorkspaceConnectorIdForService(method.service || method.id.split(".")[0]);
  if (!connectorId) return undefined;
  const access = googleWorkspaceAccessForMethod(method.id, method.sideEffect);
  return googleWorkspaceGrantTarget({
    connectorId,
    accountId: input.resolvedAccountHint ?? input.accountHint,
    access,
    actionKind: googleWorkspaceGrantActionKind(access, method.sideEffect),
  });
}

export function googleWorkspaceConnectorGrantTarget(input: {
  connectorId: string;
  operation?: string;
  accountId?: string;
  sideEffect?: "none" | "read_personal_data" | "write_external";
}): GoogleWorkspaceGrantTarget | undefined {
  const connectorId = normalizeGoogleWorkspaceConnectorId(input.connectorId);
  if (!connectorId) return undefined;
  const access = googleWorkspaceAccessForConnectorOperation(connectorId, input.operation, input.sideEffect);
  return googleWorkspaceGrantTarget({
    connectorId,
    accountId: input.accountId,
    access,
    actionKind: googleWorkspaceGrantActionKind(access, input.sideEffect === "write_external" ? "data_mutation" : "personal_content_read"),
  });
}

export function googleWorkspaceGrantConditions(
  target: GoogleWorkspaceGrantTarget,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...extra,
    provider: "google.workspace",
    [googleWorkspaceGrantTargetIdentityCondition]: target.identity,
    googleWorkspaceConnectorId: target.connectorId,
    googleWorkspaceAccountId: target.accountId,
    googleWorkspaceAccess: target.access,
  };
}

export function googleWorkspaceGrantMatchesTarget(grant: AmbientPermissionGrant, target: GoogleWorkspaceGrantTarget): boolean {
  if (grant.actionKind !== target.actionKind || grant.targetKind !== target.targetKind) return false;
  return googleWorkspaceGrantIdentityFromConditions(grant) === target.identity;
}

export function googleWorkspaceGrantIdentityFromConditions(grant: AmbientPermissionGrant): string | undefined {
  const value = grant.conditions?.[googleWorkspaceGrantTargetIdentityCondition];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function googleWorkspaceGrantTarget(input: {
  connectorId: string;
  accountId?: string;
  access: string;
  actionKind: PermissionGrantActionKind;
}): GoogleWorkspaceGrantTarget {
  const accountId = googleWorkspaceGrantAccountId(input.accountId);
  const identity = ["google.workspace.connector", input.connectorId, accountId, input.access].join("\0");
  return {
    actionKind: input.actionKind,
    targetKind: "connector",
    connectorId: input.connectorId,
    accountId,
    access: input.access,
    identity,
    label: `${googleWorkspaceConnectorLabel(input.connectorId)} ${googleWorkspaceAccessLabel(input.access)} (${accountId})`,
  };
}

function googleWorkspaceConnectorIdForService(service: string | undefined): string | undefined {
  const normalized = service?.trim().toLowerCase();
  if (normalized === "gmail") return "google.gmail";
  if (normalized === "calendar") return "google.calendar";
  if (normalized === "drive") return "google.drive";
  return undefined;
}

function normalizeGoogleWorkspaceConnectorId(connectorId: string): string | undefined {
  const normalized = connectorId.trim().toLowerCase();
  if (normalized === "google.gmail" || normalized === "gmail") return "google.gmail";
  if (normalized === "google.calendar" || normalized === "calendar") return "google.calendar";
  if (normalized === "google.drive" || normalized === "drive") return "google.drive";
  return undefined;
}

function googleWorkspaceAccessForMethod(methodId: string, sideEffect: GoogleWorkspaceMethodSideEffect): string {
  if (methodId === "gmail.users.messages.attachments.get") return "read_attachment";
  if (methodId === "gmail.users.threads.get" || methodId === "gmail.users.messages.get") return "read_thread";
  if (
    methodId === "gmail.users.messages.list" ||
    methodId === "gmail.users.threads.list" ||
    methodId === "gmail.users.labels.list" ||
    methodId === "gmail.users.getProfile"
  ) {
    return "metadata_search";
  }
  if (methodId === "gmail.users.drafts.send" || methodId === "gmail.users.messages.send") return "send_mail";
  if (methodId.startsWith("gmail.users.drafts.")) {
    if (sideEffect === "draft_write" || sideEffect === "data_mutation") return "write_draft";
    return "read_thread";
  }
  if (methodId.startsWith("gmail.")) {
    if (sideEffect === "metadata_read") return "metadata_search";
    if (sideEffect === "external_communication") return "send_mail";
    if (sideEffect === "draft_write") return "write_draft";
    if (sideEffect === "data_mutation" || sideEffect === "sharing_mutation") return "mutate_mail";
    return "read_thread";
  }
  if (methodId.startsWith("calendar.")) {
    if (sideEffect === "data_mutation") return "write_calendar";
    if (sideEffect === "sharing_mutation") return "share_calendar";
    return "read_calendar";
  }
  if (methodId === "drive.files.export" || methodId === "drive.files.get") return "read_file";
  if (methodId === "drive.files.list" || methodId === "drive.drives.list" || methodId === "drive.about.get") return "search_files";
  if (methodId.startsWith("drive.")) {
    if (sideEffect === "sharing_mutation") return "share_file";
    if (sideEffect === "data_mutation" || sideEffect === "draft_write" || sideEffect === "external_communication") return "write_file";
    return "read_file";
  }
  if (sideEffect === "metadata_read") return "metadata_read";
  if (sideEffect === "personal_content_read") return "read_content";
  if (sideEffect === "external_communication") return "send";
  if (sideEffect === "sharing_mutation") return "share";
  return "mutate";
}

function googleWorkspaceAccessForConnectorOperation(
  connectorId: string,
  operation: string | undefined,
  sideEffect: "none" | "read_personal_data" | "write_external" | undefined,
): string {
  if (connectorId === "google.calendar") {
    return sideEffect === "write_external" || /^(create|update|delete)/i.test(operation ?? "") ? "write_calendar" : "read_calendar";
  }
  if (connectorId === "google.gmail") {
    if (operation === "readAttachment") return "read_attachment";
    if (operation === "readThread") return "read_thread";
    if (operation === "search" || operation === "listLabels" || !operation) return "metadata_search";
    if (operation === "sendDraft") return "send_mail";
    if (/Draft$/.test(operation) || operation.includes("Draft")) return "write_draft";
    return sideEffect === "write_external" ? "mutate_mail" : "read_thread";
  }
  if (connectorId === "google.drive") {
    if (operation === "search" || operation === "listSharedDrives" || !operation) return "search_files";
    if (operation === "readFile" || operation === "listPermissions") return "read_file";
    if (operation?.includes("Permission")) return "share_file";
    return sideEffect === "write_external" ? "write_file" : "read_file";
  }
  return operation ?? "all";
}

function googleWorkspaceGrantActionKind(access: string, sideEffect: GoogleWorkspaceMethodSideEffect): PermissionGrantActionKind {
  if (
    sideEffect === "metadata_read" ||
    sideEffect === "personal_content_read" ||
    access.startsWith("read_") ||
    access === "metadata_search" ||
    access === "search_files"
  ) {
    return "connector_content_read";
  }
  return "remote_mutation";
}

function googleWorkspaceConnectorLabel(connectorId: string): string {
  if (connectorId === "google.gmail") return "Gmail";
  if (connectorId === "google.calendar") return "Google Calendar";
  if (connectorId === "google.drive") return "Google Drive";
  return connectorId;
}

function googleWorkspaceAccessLabel(access: string): string {
  if (access === "read_calendar") return "read access";
  if (access === "write_calendar") return "write access";
  if (access === "share_calendar") return "sharing access";
  if (access === "metadata_search") return "metadata search";
  if (access === "read_thread") return "thread read";
  if (access === "read_attachment") return "attachment read";
  if (access === "write_draft") return "draft write";
  if (access === "send_mail") return "send access";
  if (access === "mutate_mail") return "mutation access";
  if (access === "search_files") return "file search";
  if (access === "read_file") return "file read";
  if (access === "write_file") return "file write";
  if (access === "share_file") return "file sharing";
  return access.replace(/_/g, " ");
}
