import { createHash } from "node:crypto";
import type { AmbientPermissionGrant, CreateAmbientPermissionGrantInput, PermissionGrantActionKind, PermissionGrantScopeKind, PermissionGrantTargetKind, PermissionMode, PermissionPromptResolution, PermissionPromptResponseMode, PermissionRequest } from "../../shared/permissionTypes";
import { googleWorkspaceGrantTargetIdentityCondition } from "../../shared/googleWorkspaceGrantTargets";
import type { ProjectStore } from "./permissionsProjectStoreFacade";
import { grantIncludesDescendants, permissionGrantAllowsRequestPath } from "./localFolderAllowlistGrants";

export interface PermissionGrantContext {
  permissionMode: PermissionMode;
  threadId: string;
  workflowThreadId?: string;
  projectPath?: string;
  workspacePath?: string;
}

export interface PermissionGrantResolution {
  allowed: boolean;
  decisionSource:
    | "prompt_allow_once"
    | "prompt_always_thread"
    | "prompt_always_workflow"
    | "prompt_always_project"
    | "prompt_always_workspace"
    | "persistent_grant"
    | "denied_by_user";
  grant?: AmbientPermissionGrant;
  response: PermissionPromptResponseMode;
}

export interface PermissionPromptRequester {
  request(input: Omit<PermissionRequest, "id">): Promise<PermissionPromptResolution>;
}

export async function resolvePermissionWithGrants(input: {
  store: ProjectStore;
  requester: PermissionPromptRequester;
  request: Omit<PermissionRequest, "id">;
  context: PermissionGrantContext;
  requireFreshPrompt?: boolean;
}): Promise<PermissionGrantResolution> {
  const request = input.requireFreshPrompt
    ? { ...enrichPermissionRequest(input.request, input.context), reusableScopes: [] }
    : enrichPermissionRequest(input.request, input.context);
  if (!input.requireFreshPrompt) {
    const existingGrant = findMatchingPermissionGrant(input.store.listPermissionGrants(), request, input.context);
    if (existingGrant) {
      return { allowed: true, decisionSource: "persistent_grant", grant: existingGrant, response: grantResponseMode(existingGrant.scopeKind) };
    }
  }

  const response = await input.requester.request(request);
  if (!response.allowed) {
    return { allowed: false, decisionSource: "denied_by_user", response: response.mode };
  }
  if (input.requireFreshPrompt) {
    return { allowed: true, decisionSource: "prompt_allow_once", response: response.mode };
  }

  const grantInput = grantInputFromPromptResponse(request, input.context, response.mode);
  if (!grantInput) {
    return { allowed: true, decisionSource: "prompt_allow_once", response: response.mode };
  }
  const grant = input.store.createPermissionGrant(grantInput);
  return { allowed: true, decisionSource: promptDecisionSource(response.mode), response: response.mode, grant };
}

export function enrichPermissionRequest(
  request: Omit<PermissionRequest, "id">,
  context: PermissionGrantContext,
): Omit<PermissionRequest, "id"> {
  const actionKind = request.grantActionKind ?? permissionGrantActionKind(request);
  const targetKind = request.grantTargetKind ?? permissionGrantTargetKind(request);
  const targetLabel = request.grantTargetLabel ?? permissionGrantTargetLabel(request);
  return {
    ...request,
    workspacePath: request.workspacePath ?? context.workspacePath,
    projectPath: request.projectPath ?? context.projectPath,
    workflowThreadId: request.workflowThreadId ?? context.workflowThreadId,
    reusableScopes: request.reusableScopes ?? reusableScopesForRequest(request, context),
    grantActionKind: actionKind,
    grantTargetKind: targetKind,
    grantTargetLabel: targetLabel,
    grantTargetHash: request.grantTargetHash ?? permissionGrantTargetHash(actionKind, targetKind, targetLabel),
  };
}

export function findMatchingPermissionGrant(
  grants: AmbientPermissionGrant[],
  request: Omit<PermissionRequest, "id">,
  context: PermissionGrantContext,
  now = new Date(),
): AmbientPermissionGrant | undefined {
  const enriched = enrichPermissionRequest(request, context);
  if (enriched.risk === "privileged-action") return undefined;
  return grants.find((grant) => {
    const grantActionKind = enriched.grantActionKind;
    if (!grantActionKind) return false;
    if (grant.revokedAt) return false;
    if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= now.getTime()) return false;
    if (grant.actionKind !== grantActionKind || grant.targetKind !== enriched.grantTargetKind) return false;
    const requestedPaths = requestedPathsFromGrantRequest(enriched);
    const matchedByPathGrant =
      grantIncludesDescendants(grant) &&
      requestedPaths.length > 0 &&
      requestedPaths.every((requestedPath) =>
        permissionGrantAllowsRequestPath(grant, context, requestedPath, grantActionKind, now),
      );
    if (grant.targetHash !== enriched.grantTargetHash && !matchedByPathGrant) return false;
    if (
      !matchedByPathGrant &&
      !permissionGrantConditionsEqual(
        grant.conditions,
        enriched.grantConditions,
        { actionKind: grant.actionKind, targetKind: grant.targetKind },
      )
    ) {
      return false;
    }
    if (grant.scopeKind === "thread") return Boolean(context.threadId && grant.threadId === context.threadId);
    if (grant.scopeKind === "workflow_thread") return Boolean(context.workflowThreadId && grant.workflowThreadId === context.workflowThreadId);
    if (grant.scopeKind === "project") return Boolean(context.projectPath && grant.projectPath === context.projectPath);
    if (grant.scopeKind === "workspace") return Boolean(context.workspacePath && grant.workspacePath === context.workspacePath);
    return grant.scopeKind === "global_plugin" && grant.targetKind === "plugin";
  });
}

export function grantInputFromPromptResponse(
  request: Omit<PermissionRequest, "id">,
  context: PermissionGrantContext,
  response: PermissionPromptResponseMode,
): CreateAmbientPermissionGrantInput | undefined {
  const enriched = enrichPermissionRequest(request, context);
  if (enriched.risk === "privileged-action") return undefined;
  const scopeKind = scopeKindFromResponse(response);
  if (!scopeKind || !(enriched.reusableScopes ?? []).includes(scopeKind)) return undefined;
  return {
    permissionModeAtCreation: context.permissionMode,
    scopeKind,
    threadId: scopeKind === "thread" ? context.threadId : undefined,
    workflowThreadId: scopeKind === "workflow_thread" ? context.workflowThreadId : undefined,
    projectPath: scopeKind === "project" ? context.projectPath : undefined,
    workspacePath: scopeKind === "workspace" ? context.workspacePath : undefined,
    actionKind: enriched.grantActionKind ?? permissionGrantActionKind(enriched),
    targetKind: enriched.grantTargetKind ?? permissionGrantTargetKind(enriched),
    targetHash: enriched.grantTargetHash ?? permissionGrantTargetHash(permissionGrantActionKind(enriched), permissionGrantTargetKind(enriched), permissionGrantTargetLabel(enriched)),
    targetLabel: enriched.grantTargetLabel ?? permissionGrantTargetLabel(enriched),
    conditions: enriched.grantConditions,
    source: "permission_prompt",
    reason: `Allowed from permission prompt: ${enriched.title}`,
  };
}

export function permissionGrantTargetHash(actionKind: PermissionGrantActionKind, targetKind: PermissionGrantTargetKind, targetLabel: string): string {
  return createHash("sha256").update(`${actionKind}\0${targetKind}\0${targetLabel}`).digest("hex");
}

export function permissionGrantConditionsEqual(
  left: unknown,
  right: unknown,
  context?: Pick<AmbientPermissionGrant, "actionKind" | "targetKind">,
): boolean {
  if (!context) return stableConditionString(left) === stableConditionString(right);
  return stableConditionString(permissionGrantConditionIdentity(left, context)) ===
    stableConditionString(permissionGrantConditionIdentity(right, context));
}

function stableConditionString(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(stableConditionValue(value));
}

function permissionGrantConditionIdentity(value: unknown, context: Pick<AmbientPermissionGrant, "actionKind" | "targetKind">): unknown {
  const record = recordConditionValue(value);
  if (!record) return value;
  if (isChildBrowserAuthorityConditions(record, context)) {
    return pickConditionIdentity(record, ["provider", "source", "operation", "domain"]);
  }
  if (isFileAuthorityAdapterConditions(record, context)) {
    return pickConditionIdentity(record, ["provider", "source", "path", "canonicalPath", "access"]);
  }
  if (record.discoveryOnly === true) {
    return pickConditionIdentity(record, ["discoveryOnly"]);
  }
  if (isGoogleWorkspaceConditions(record)) {
    return googleWorkspaceConditionIdentity(record);
  }
  if (record.kind === "ambient-mcp-tool-call" && record.schemaVersion === "ambient-mcp-permission-policy-v1") {
    return omitConditionIdentity(record, ["profileReason", "observedPriorHosts", "observedPriorEndpoints", "observedPriorPaths"]);
  }
  if (isPathGrantConditions(record, context)) {
    return pathGrantConditionIdentity(record);
  }
  return record;
}

function isChildBrowserAuthorityConditions(
  conditions: Record<string, unknown>,
  context: Pick<AmbientPermissionGrant, "actionKind" | "targetKind">,
): boolean {
  return conditions.provider === "ambient.desktop" &&
    conditions.source === "subagent-child-browser-authority" &&
    (context.actionKind === "browser_network" ||
      context.actionKind === "browser_control" ||
      context.actionKind === "browser_profile" ||
      context.actionKind === "browser_login") &&
    (context.targetKind === "browser_origin" || context.targetKind === "tool");
}

function isFileAuthorityAdapterConditions(
  conditions: Record<string, unknown>,
  context: Pick<AmbientPermissionGrant, "actionKind" | "targetKind">,
): boolean {
  return conditions.source === "file-authority-adapter" &&
    context.targetKind === "path" &&
    (context.actionKind === "file_content_read" || context.actionKind === "local_file_write");
}

function isGoogleWorkspaceConditions(conditions: Record<string, unknown>): boolean {
  return conditions.provider === "google.workspace" ||
    conditions.provider === "google.workspace.cli" ||
    typeof conditions[googleWorkspaceGrantTargetIdentityCondition] === "string";
}

function isPathGrantConditions(
  conditions: Record<string, unknown>,
  context: Pick<AmbientPermissionGrant, "actionKind" | "targetKind">,
): boolean {
  return context.targetKind === "path" &&
    (context.actionKind === "file_content_read" ||
      context.actionKind === "local_file_write" ||
      context.actionKind === "secret_path_read") &&
    (typeof conditions.path === "string" ||
      typeof conditions.canonicalPath === "string" ||
      typeof conditions.requestedPath === "string" ||
      Array.isArray(conditions.paths));
}

function pathGrantConditionIdentity(record: Record<string, unknown>): Record<string, unknown> {
  const identity = omitConditionIdentity(record, ["requestedPath", "requestedPaths"]);
  if (typeof record.canonicalPath === "string") {
    identity.path = record.canonicalPath;
  }
  return identity;
}

function googleWorkspaceConditionIdentity(record: Record<string, unknown>): Record<string, unknown> {
  if (typeof record[googleWorkspaceGrantTargetIdentityCondition] === "string") {
    return pickConditionIdentity(record, [
      "provider",
      googleWorkspaceGrantTargetIdentityCondition,
      "googleWorkspaceConnectorId",
      "googleWorkspaceAccountId",
      "googleWorkspaceAccess",
      "operation",
      "methodId",
      "sideEffect",
    ]);
  }
  const identity = omitConditionIdentity(record, ["requestedAccountHint"]);
  if (record.resolvedAccountHint !== undefined) identity.accountHint = record.resolvedAccountHint;
  return identity;
}

function pickConditionIdentity(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (record[key] !== undefined) picked[key] = record[key];
  }
  return picked;
}

function omitConditionIdentity(record: Record<string, unknown>, omittedKeys: string[]): Record<string, unknown> {
  const omitted = new Set(omittedKeys);
  const picked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!omitted.has(key) && value !== undefined) picked[key] = value;
  }
  return picked;
}

function recordConditionValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stableConditionValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableConditionValue);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const item = record[key];
    if (item !== undefined) sorted[key] = stableConditionValue(item);
  }
  return sorted;
}

function requestedPathsFromGrantRequest(request: Omit<PermissionRequest, "id">): string[] {
  if (request.grantTargetKind !== "path") return [];
  const conditionsPaths = request.grantConditions &&
    Array.isArray(request.grantConditions.paths) &&
    request.grantConditions.paths.every((path): path is string => typeof path === "string")
    ? request.grantConditions.paths
    : undefined;
  if (conditionsPaths?.length) return conditionsPaths;
  const canonicalConditionsPath = request.grantConditions && typeof request.grantConditions.canonicalPath === "string"
    ? request.grantConditions.canonicalPath
    : undefined;
  const conditionsPath = request.grantConditions && typeof request.grantConditions.path === "string"
    ? request.grantConditions.path
    : undefined;
  const path = canonicalConditionsPath ?? conditionsPath ?? request.grantTargetLabel;
  return path ? [path] : [];
}

function permissionGrantActionKind(request: Omit<PermissionRequest, "id">): PermissionGrantActionKind {
  if (request.risk === "secret-path") return "secret_path_read";
  if (request.risk === "browser-network") return "browser_network";
  if (request.risk === "browser-control") return "browser_control";
  if (request.risk === "browser-profile") return "browser_profile";
  if (request.risk === "browser-login" || request.risk === "browser-credential") return "browser_login";
  if (request.risk === "plugin-tool" || request.risk === "privileged-action") return "plugin_tool_execute";
  if (request.risk === "network-command" || request.risk === "destructive-command" || request.risk === "workspace-command") return "shell_command";
  if (request.toolName.includes("write") || request.toolName.includes("edit")) return "local_file_write";
  return "file_content_read";
}

function permissionGrantTargetKind(request: Omit<PermissionRequest, "id">): PermissionGrantTargetKind {
  if (request.risk === "plugin-tool" || request.risk === "privileged-action") return "tool";
  if (request.risk === "browser-network") return "browser_origin";
  if (request.risk === "browser-control" || request.risk === "browser-profile") return "risk";
  if (request.risk === "browser-login" || request.risk === "browser-credential") return "browser_origin";
  if (request.risk === "network-command" || request.risk === "destructive-command" || request.risk === "workspace-command") return "shell_command_prefix";
  if (request.risk === "secret-path" || request.risk === "outside-workspace") return "path";
  return "risk";
}

function permissionGrantTargetLabel(request: Omit<PermissionRequest, "id">): string {
  if (request.risk === "browser-profile") return "copied-chrome-profile";
  if (request.risk === "browser-control") return "browser-page-control";
  if (request.risk === "network-command" && isLoopbackNetworkCommandDetail(request.detail)) return "loopback shell network commands";
  const detail = request.detail?.split("\n")[0]?.trim();
  return (detail || `${request.toolName}:${request.risk}`).slice(0, 240);
}

function isLoopbackNetworkCommandDetail(detail: string | undefined): boolean {
  const command = detail?.trim();
  if (!command) return false;
  const lower = command.toLowerCase();
  if (/\b(scp|sftp|ssh|rsync|rclone|nmap)\b/.test(lower)) return false;
  if (!/\b(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[?::1\]?)\b/.test(lower)) return false;

  const urlHosts = [...command.matchAll(/\bhttps?:\/\/(\[[^\]]+\]|[^/\s:?#"'`]+)/gi)].map((match) => match[1] ?? "");
  return urlHosts.every(isLoopbackHost);
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  return normalized === "localhost" || normalized === "::1" || normalized === "0.0.0.0" || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function reusableScopesForRequest(request: Omit<PermissionRequest, "id">, context: PermissionGrantContext): PermissionGrantScopeKind[] {
  if (request.risk === "privileged-action") return [];
  if (request.risk === "browser-login" || request.risk === "browser-credential" || request.risk === "secret-path") {
    return context.workflowThreadId ? ["thread", "workflow_thread"] : ["thread"];
  }
  const scopes: PermissionGrantScopeKind[] = ["thread"];
  if (context.workflowThreadId) scopes.push("workflow_thread");
  if (context.projectPath) scopes.push("project");
  if (context.workspacePath) scopes.push("workspace");
  return scopes;
}

function scopeKindFromResponse(response: PermissionPromptResponseMode): PermissionGrantScopeKind | undefined {
  if (response === "always_thread") return "thread";
  if (response === "always_workflow") return "workflow_thread";
  if (response === "always_project") return "project";
  if (response === "always_workspace") return "workspace";
  return undefined;
}

function grantResponseMode(scopeKind: PermissionGrantScopeKind): PermissionPromptResponseMode {
  if (scopeKind === "workflow_thread") return "always_workflow";
  if (scopeKind === "project") return "always_project";
  if (scopeKind === "workspace") return "always_workspace";
  return "always_thread";
}

function promptDecisionSource(response: PermissionPromptResponseMode): PermissionGrantResolution["decisionSource"] {
  if (response === "always_workflow") return "prompt_always_workflow";
  if (response === "always_project") return "prompt_always_project";
  if (response === "always_workspace") return "prompt_always_workspace";
  if (response === "always_thread") return "prompt_always_thread";
  return "prompt_allow_once";
}
