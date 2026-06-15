import { basename, isAbsolute, resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  FirstPartyGoogleIntegrationState,
  GoogleWorkspaceCallInput,
  GoogleWorkspaceCallResult,
  GoogleWorkspaceCliInstallState,
  GoogleWorkspaceDescribeMethodInput,
  GoogleWorkspaceMaterializeFileInput,
  GoogleWorkspaceMaterializeFileResult,
  GoogleWorkspaceMethodSummary,
  GoogleWorkspaceOAuthClientImportInput,
  GoogleWorkspaceSearchMethodsInput,
  GoogleWorkspaceSearchMethodsResult,
  GoogleWorkspaceSetupInput,
  GoogleWorkspaceSetupState,
  GoogleWorkspaceValidationInput,
  GoogleWorkspaceValidationResult,
  ToolLongformInputPreview,
  WorkspaceState,
} from "../shared/types";
import { googleWorkspaceSetupToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import { isPathInside } from "./sessionPaths";
import { buildToolLongformInputPreview as defaultBuildToolLongformInputPreview } from "./toolLongformInputPreview";
import {
  materializeTextOutput as defaultMaterializeTextOutput,
  materializedTextNotice,
  type MaterializedTextOutput,
  type MaterializeTextOutputInput,
} from "./toolOutputArtifacts";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

type MaterializeTextOutput = (
  workspacePath: string,
  input: MaterializeTextOutputInput,
) => Promise<MaterializedTextOutput> | MaterializedTextOutput;

export interface AgentRuntimeGoogleWorkspaceTools {
  readIntegration: () => FirstPartyGoogleIntegrationState;
  installCli: () => Promise<GoogleWorkspaceCliInstallState>;
  startSetup: (input: GoogleWorkspaceSetupInput) => GoogleWorkspaceSetupState;
  importOAuthClient: (input: GoogleWorkspaceOAuthClientImportInput & { sourcePath: string }) => Promise<GoogleWorkspaceSetupState>;
  cancelSetup: () => GoogleWorkspaceSetupState;
  validate: (input: GoogleWorkspaceValidationInput) => Promise<GoogleWorkspaceValidationResult>;
  searchMethods: (input: GoogleWorkspaceSearchMethodsInput) => GoogleWorkspaceSearchMethodsResult | Promise<GoogleWorkspaceSearchMethodsResult>;
  describeMethod: (input: GoogleWorkspaceDescribeMethodInput) => Promise<GoogleWorkspaceMethodSummary>;
  call: (input: GoogleWorkspaceCallInput & { workspacePath?: string }) => Promise<GoogleWorkspaceCallResult>;
  materializeFile: (input: GoogleWorkspaceMaterializeFileInput & { workspacePath: string }) => Promise<GoogleWorkspaceMaterializeFileResult>;
}

export interface GoogleWorkspaceSetupToolsRegistrationOptions {
  workspace: Pick<WorkspaceState, "path">;
  googleWorkspace?: AgentRuntimeGoogleWorkspaceTools;
  buildToolLongformInputPreview?: typeof defaultBuildToolLongformInputPreview;
  materializeTextOutput?: MaterializeTextOutput;
}

export function registerGoogleWorkspaceSetupTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: GoogleWorkspaceSetupToolsRegistrationOptions,
): void {
  const { googleWorkspace, workspace } = options;
  if (!googleWorkspace) return;
  const buildToolLongformInputPreview = options.buildToolLongformInputPreview ?? defaultBuildToolLongformInputPreview;
  const materializeTextOutput = options.materializeTextOutput ?? defaultMaterializeTextOutput;

  registerDesktopTool(pi, googleWorkspaceSetupToolDescriptor("google_workspace_status"), {
    executionMode: "sequential",
    execute: async () => {
      const integration = googleWorkspace.readIntegration();
      return googleWorkspaceToolResult(googleWorkspaceStatusText(integration), {
        toolName: "google_workspace_status",
        action: "status",
        integration: googleWorkspaceIntegrationSummary(integration),
      });
    },
  });

  registerDesktopTool(pi, googleWorkspaceSetupToolDescriptor("google_workspace_install_gws"), {
    executionMode: "sequential",
    execute: async (_toolCallId, _params, _signal, onUpdate?: ToolUpdateHandler) => {
      onUpdate?.(googleWorkspaceToolUpdate("google_workspace_install_gws", "Installing the managed Google Workspace CLI binary."));
      const installState = await googleWorkspace.installCli();
      const integration = googleWorkspace.readIntegration();
      return googleWorkspaceToolResult(googleWorkspaceInstallText(installState, integration), {
        toolName: "google_workspace_install_gws",
        action: "install",
        install: googleWorkspaceInstallSummary(installState),
        integration: googleWorkspaceIntegrationSummary(integration),
      });
    },
  });

  registerDesktopTool(pi, googleWorkspaceSetupToolDescriptor("google_workspace_start_login"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const accountHint = optionalString(input.accountHint);
      onUpdate?.(googleWorkspaceToolUpdate("google_workspace_start_login", `Starting Google sign-in for ${accountHint ?? "default"}.`));
      const setup = googleWorkspace.startSetup({ ...(accountHint ? { accountHint } : {}), command: "login", openAuthUrl: true });
      return googleWorkspaceToolResult(googleWorkspaceSetupText(setup), {
        toolName: "google_workspace_start_login",
        action: "startLogin",
        setup: googleWorkspaceSetupSummary(setup),
      });
    },
  });

  registerDesktopTool(pi, googleWorkspaceSetupToolDescriptor("google_workspace_import_oauth_client"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const input = googleWorkspaceOAuthClientImportToolInput(params as Record<string, unknown>, workspace.path);
      onUpdate?.(googleWorkspaceToolUpdate("google_workspace_import_oauth_client", `Importing Google Workspace OAuth client config from ${basename(input.sourcePath)}.`));
      const setup = await googleWorkspace.importOAuthClient(input);
      return googleWorkspaceToolResult(googleWorkspaceOAuthClientImportText(setup), {
        toolName: "google_workspace_import_oauth_client",
        action: "importOAuthClient",
        setup: googleWorkspaceSetupSummary(setup),
      });
    },
  });

  registerDesktopTool(pi, googleWorkspaceSetupToolDescriptor("google_workspace_validate_account"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const accountHint = optionalString(input.accountHint);
      onUpdate?.(googleWorkspaceToolUpdate("google_workspace_validate_account", `Validating Google account ${accountHint ?? "default"}.`));
      const validation = await googleWorkspace.validate({ ...(accountHint ? { accountHint } : {}) });
      const integration = googleWorkspace.readIntegration();
      return googleWorkspaceToolResult(googleWorkspaceValidationText(validation), {
        toolName: "google_workspace_validate_account",
        action: "validate",
        validation: googleWorkspaceValidationSummary(validation),
        integration: googleWorkspaceIntegrationSummary(integration),
      });
    },
  });

  registerDesktopTool(pi, googleWorkspaceSetupToolDescriptor("google_workspace_cancel_setup"), {
    executionMode: "sequential",
    execute: async () => {
      const setup = googleWorkspace.cancelSetup();
      return googleWorkspaceToolResult(googleWorkspaceSetupText(setup), {
        toolName: "google_workspace_cancel_setup",
        action: "cancel",
        setup: googleWorkspaceSetupSummary(setup),
      });
    },
  });

  registerDesktopTool(pi, googleWorkspaceSetupToolDescriptor("google_workspace_search_methods"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = googleWorkspaceSearchMethodsInput(params as Record<string, unknown>);
      const result = await googleWorkspace.searchMethods(input);
      return googleWorkspaceMaterializedToolResult(
        workspace.path,
        "google-workspace-search-methods",
        googleWorkspaceSearchMethodsText(result),
        {
          toolName: "google_workspace_search_methods",
          action: "searchMethods",
          search: input,
          result,
        },
        materializeTextOutput,
      );
    },
  });

  registerDesktopTool(pi, googleWorkspaceSetupToolDescriptor("google_workspace_call"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const input = googleWorkspaceCallInput(params as Record<string, unknown>);
      const longformInputPreview = buildToolLongformInputPreview("google_workspace_call", input);
      onUpdate?.(
        googleWorkspaceToolUpdate(
          "google_workspace_call",
          `Calling Google Workspace method ${input.methodId}.`,
          longformInputPreview,
        ),
      );
      const result = await googleWorkspace.call({ ...input, workspacePath: workspace.path });
      return googleWorkspaceMaterializedToolResult(
        workspace.path,
        "google-workspace-call",
        googleWorkspaceCallModelText(result),
        {
          toolName: "google_workspace_call",
          action: "call",
          displayText: googleWorkspaceCallText(result),
          call: googleWorkspaceCallSummary(result),
          ...(longformInputPreview ? { toolLongformInputPreview: longformInputPreview } : {}),
        },
        materializeTextOutput,
      );
    },
  });

  registerDesktopTool(pi, googleWorkspaceSetupToolDescriptor("google_workspace_materialize_file"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const input = googleWorkspaceMaterializeFileInput(params as Record<string, unknown>);
      onUpdate?.(googleWorkspaceToolUpdate("google_workspace_materialize_file", `Saving Google Workspace file to ${input.path ?? "Google Workspace Downloads"}.`));
      const result = await googleWorkspace.materializeFile({ ...input, workspacePath: workspace.path });
      return googleWorkspaceToolResult(googleWorkspaceMaterializeFileText(result), {
        toolName: "google_workspace_materialize_file",
        action: "materializeFile",
        result,
      });
    },
  });
}

function googleWorkspaceToolUpdate(
  toolName: string,
  text: string,
  longformInputPreview?: ToolLongformInputPreview,
): { content: { type: "text"; text: string }[]; details: Record<string, unknown> } {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "google-workspace-setup",
      toolName,
      status: "running",
      ...(longformInputPreview ? { toolLongformInputPreview: longformInputPreview } : {}),
    },
  };
}

function googleWorkspaceToolResult(text: string, details: Record<string, unknown>): { content: { type: "text"; text: string }[]; details: Record<string, unknown> } {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "google-workspace-setup",
      ...details,
    },
  };
}

async function googleWorkspaceMaterializedToolResult(
  workspacePath: string,
  label: string,
  text: string,
  details: Record<string, unknown>,
  materializeOutput: MaterializeTextOutput,
): Promise<{ content: { type: "text"; text: string }[]; details: Record<string, unknown> }> {
  const output = await materializeOutput(workspacePath, {
    label,
    text,
    maxPreviewChars: 12_000,
    extension: "txt",
  });
  if (!output.truncated) return googleWorkspaceToolResult(output.text, output.redacted ? { ...details, outputOutput: output } : details);
  return googleWorkspaceToolResult(`${output.text}\n\n${materializedTextNotice("Google Workspace output", output)}`, {
    ...details,
    outputOutput: output,
  });
}

export function googleWorkspaceStatusText(integration: FirstPartyGoogleIntegrationState): string {
  const accounts = googleWorkspaceAccountDetails(integration);
  return [
    "Google Workspace setup status",
    `Enabled: ${integration.enabled ? "yes" : "no"}`,
    `Auth mode: ${integration.authMode}`,
    `gws install: ${integration.install?.status ?? "unknown"}`,
    `gws sidecar: ${integration.sidecar.state}`,
    `Setup: ${integration.setup?.status ?? "unknown"}`,
    accounts.length ? "Accounts:" : "Accounts: none validated",
    ...accounts.map((account) =>
      [
        `- handle ${account.accountId}: ${account.email ?? account.label}`,
        `status ${account.status}`,
        account.services.length ? `services ${account.services.join(", ")}` : "services none",
        account.lastValidatedAt ? `last validated ${account.lastValidatedAt}` : undefined,
        account.validationError ? `error ${account.validationError}` : undefined,
      ]
        .filter(Boolean)
        .join("; "),
    ),
    accounts.length > 1 ? "Multiple accounts: pass accountHint exactly as one listed handle when validating or calling Google methods." : undefined,
    `Available actions: ${googleWorkspaceAvailableActions(integration).join(", ") || "none"}`,
    integration.unavailableReason ? `Unavailable reason: ${integration.unavailableReason}` : undefined,
    integration.setup?.error ? `Setup error: ${integration.setup.error}` : undefined,
    integration.setup?.requiredAction === "oauth_client_config"
      ? "OAuth client config needed: attach or provide the downloaded client_secret JSON, then use google_workspace_import_oauth_client."
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function googleWorkspaceInstallText(install: GoogleWorkspaceCliInstallState, integration: FirstPartyGoogleIntegrationState): string {
  return [
    "Google Workspace CLI install",
    `Status: ${install.status}`,
    install.version ? `Version: ${install.version}` : undefined,
    install.binaryPath ? `Binary: ${install.binaryPath}` : undefined,
    install.error ? `Error: ${install.error}` : undefined,
    `Next actions: ${googleWorkspaceAvailableActions(integration).join(", ") || "none"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function googleWorkspaceSetupText(setup: GoogleWorkspaceSetupState): string {
  return [
    "Google Workspace setup",
    `Status: ${setup.status}`,
    setup.command ? `Command: ${setup.command}` : undefined,
    setup.accountHint ? `Account handle: ${setup.accountHint}` : undefined,
    setup.requiredAction ? `Required action: ${setup.requiredAction}` : undefined,
    setup.oauthClientConfigured !== undefined ? `OAuth client configured: ${setup.oauthClientConfigured ? "yes" : "no"}` : undefined,
    setup.openedAuthUrl ? "Browser handoff: opened" : setup.authUrl ? "Browser handoff: URL captured, not opened" : undefined,
    setup.requiredAction === "oauth_client_config"
      ? "Next: provide the downloaded client_secret JSON path or attachment, then call google_workspace_import_oauth_client."
      : undefined,
    setup.status === "running" ? "Next: complete Google sign-in, 2FA, and consent in the browser." : undefined,
    setup.discoveredEmail ? `Discovered account: ${setup.discoveredEmail}` : undefined,
    setup.error ? `Error: ${setup.error}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function googleWorkspaceOAuthClientImportText(setup: GoogleWorkspaceSetupState): string {
  return [
    "Google Workspace OAuth client import",
    `Status: ${setup.status}`,
    setup.accountHint ? `Account handle: ${setup.accountHint}` : undefined,
    setup.oauthClientConfigured !== undefined ? `OAuth client configured: ${setup.oauthClientConfigured ? "yes" : "no"}` : undefined,
    setup.status === "completed" ? "Next: call google_workspace_start_login for this account." : undefined,
    setup.error ? `Error: ${setup.error}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function googleWorkspaceValidationText(validation: GoogleWorkspaceValidationResult): string {
  return [
    "Google Workspace validation",
    `Account: ${validation.account.email ?? validation.account.label ?? validation.account.accountId}`,
    `Status: ${validation.account.status}`,
    ...validation.checks.map((check) => `- ${check.label}: ${check.ok ? "ok" : `failed${check.message ? ` (${check.message})` : ""}`}`),
  ].join("\n");
}

function googleWorkspaceSearchMethodsText(result: GoogleWorkspaceSearchMethodsResult): string {
  return [
    "Google Workspace method search",
    `Catalog: ${result.catalogVersion}`,
    `Matches: ${result.methods.length}${result.truncated ? " (truncated)" : ""}`,
    ...result.methods.map((method) =>
      `- ${method.id}: ${method.label}; ${method.httpMethod}; ${method.sideEffect}; requiredParams=${googleWorkspaceRequiredParamNames(method)}; body=${method.requestBody?.schemaRef ?? (method.requestBody ? "object" : "none")}; scopes=${method.scopes.length || "unknown"}`,
    ),
  ].join("\n");
}

function googleWorkspaceCallText(result: GoogleWorkspaceCallResult): string {
  return [
    "Google Workspace method call",
    `Method: ${result.method.id}`,
    `Account: ${result.accountHint ?? "default"}`,
    `HTTP: ${result.method.httpMethod}${result.method.path ? ` ${result.method.path}` : ""}`,
    `Side effect: ${result.method.sideEffect}`,
    `Dry run: ${result.dryRun ? "yes" : "no"}`,
    `Result: ${formatGoogleWorkspaceResultForMethod(result.method.id, result.result)}`,
  ].join("\n");
}

function googleWorkspaceCallModelText(result: GoogleWorkspaceCallResult): string {
  return [
    "Google Workspace method call",
    `Method: ${result.method.id}`,
    `Account: ${result.accountHint ?? "default"}`,
    `HTTP: ${result.method.httpMethod}${result.method.path ? ` ${result.method.path}` : ""}`,
    `Side effect: ${result.method.sideEffect}`,
    `Dry run: ${result.dryRun ? "yes" : "no"}`,
    `Result: ${formatGoogleWorkspaceModelResult(result.result)}`,
  ].join("\n");
}

function googleWorkspaceAvailableActions(integration: FirstPartyGoogleIntegrationState): string[] {
  const actions = ["google_workspace_status"];
  if (integration.install?.status !== "completed") actions.push("google_workspace_install_gws");
  if (integration.sidecar.state !== "missing") {
    actions.push("google_workspace_start_login", "google_workspace_import_oauth_client", "google_workspace_validate_account", "google_workspace_search_methods");
    if (googleWorkspaceAccountDetails(integration).some((account) => account.status === "available")) actions.push("google_workspace_call", "google_workspace_materialize_file");
  }
  if (integration.setup?.status === "running" || integration.setup?.status === "validating") actions.push("google_workspace_cancel_setup");
  return actions;
}

type GoogleWorkspaceIntegrationAccount = FirstPartyGoogleIntegrationState["connectors"][number]["accounts"][number];

type GoogleWorkspaceAccountDetail = GoogleWorkspaceIntegrationAccount & {
  services: string[];
};

function googleWorkspaceAccountDetails(integration: FirstPartyGoogleIntegrationState): GoogleWorkspaceAccountDetail[] {
  const accountsById = new Map<string, GoogleWorkspaceAccountDetail>();
  for (const connector of integration.connectors) {
    for (const account of connector.accounts) {
      const existing = accountsById.get(account.accountId);
      if (existing) {
        existing.services = [...new Set([...existing.services, googleWorkspaceConnectorServiceLabel(connector.connectorId)])];
        continue;
      }
      accountsById.set(account.accountId, {
        ...account,
        services: [googleWorkspaceConnectorServiceLabel(connector.connectorId)],
      });
    }
  }
  return [...accountsById.values()];
}

function googleWorkspaceConnectorServiceLabel(connectorId: string): string {
  if (connectorId === "google.gmail") return "Gmail";
  if (connectorId === "google.calendar") return "Calendar";
  if (connectorId === "google.drive") return "Drive";
  return connectorId;
}

function googleWorkspaceIntegrationSummary(integration: FirstPartyGoogleIntegrationState): Record<string, unknown> {
  return {
    enabled: integration.enabled,
    authMode: integration.authMode,
    install: integration.install ? googleWorkspaceInstallSummary(integration.install) : undefined,
    setup: integration.setup ? googleWorkspaceSetupSummary(integration.setup) : undefined,
    sidecar: {
      adapter: integration.sidecar.adapter,
      state: integration.sidecar.state,
      pending: integration.sidecar.pending,
      hasSetupCommands: Boolean(integration.sidecar.setupCommands?.length),
    },
    accounts: googleWorkspaceAccountDetails(integration).map((account) => ({
      accountId: account.accountId,
      label: account.label,
      email: account.email,
      status: account.status,
      services: account.services,
      lastValidatedAt: account.lastValidatedAt,
      validationError: account.validationError,
    })),
    connectors: integration.connectors.map((connector) => ({
      connectorId: connector.connectorId,
      status: connector.status,
      accountCount: connector.accounts.length,
      accounts: connector.accounts.map((account) => ({
        accountId: account.accountId,
        label: account.label,
        email: account.email,
        status: account.status,
        lastValidatedAt: account.lastValidatedAt,
        validationError: account.validationError,
      })),
    })),
    unavailableReason: integration.unavailableReason,
    availableActions: googleWorkspaceAvailableActions(integration),
  };
}

function googleWorkspaceInstallSummary(install: GoogleWorkspaceCliInstallState): Record<string, unknown> {
  return {
    status: install.status,
    version: install.version,
    platform: install.platform,
    arch: install.arch,
    binaryPath: install.binaryPath,
    checksum: install.checksum,
    startedAt: install.startedAt,
    finishedAt: install.finishedAt,
    error: install.error,
  };
}

function googleWorkspaceSetupSummary(setup: GoogleWorkspaceSetupState): Record<string, unknown> {
  return {
    status: setup.status,
    command: setup.command,
    accountHint: setup.accountHint,
    configDir: setup.configDir,
    oauthClientConfigured: setup.oauthClientConfigured,
    requiredAction: setup.requiredAction,
    hasOAuthClientConfigUrl: Boolean(setup.oauthClientConfigUrl),
    startedAt: setup.startedAt,
    finishedAt: setup.finishedAt,
    openedAuthUrl: setup.openedAuthUrl,
    hasAuthUrl: Boolean(setup.authUrl),
    exitCode: setup.exitCode,
    signal: setup.signal,
    error: setup.error,
    discoveredEmail: setup.discoveredEmail,
    validation: setup.validation ? googleWorkspaceValidationSummary(setup.validation) : undefined,
  };
}

function googleWorkspaceValidationSummary(validation: GoogleWorkspaceValidationResult): Record<string, unknown> {
  return {
    account: {
      accountId: validation.account.accountId,
      label: validation.account.label,
      email: validation.account.email,
      status: validation.account.status,
      lastValidatedAt: validation.account.lastValidatedAt,
      validationError: validation.account.validationError,
    },
    checks: validation.checks,
    identity: validation.identity,
  };
}

function googleWorkspaceSearchMethodsInput(input: Record<string, unknown>): GoogleWorkspaceSearchMethodsInput {
  return {
    ...(optionalString(input.query) ? { query: optionalString(input.query) } : {}),
    ...(optionalString(input.service) ? { service: optionalString(input.service) } : {}),
    ...(optionalString(input.sideEffect) ? { sideEffect: optionalString(input.sideEffect) as GoogleWorkspaceSearchMethodsInput["sideEffect"] } : {}),
    ...(optionalString(input.httpMethod) ? { httpMethod: optionalString(input.httpMethod) } : {}),
    ...(optionalString(input.scope) ? { scope: optionalString(input.scope) } : {}),
    ...(optionalNumber(input.limit) ? { limit: optionalNumber(input.limit) } : {}),
  };
}

function googleWorkspaceCallInput(input: Record<string, unknown>): GoogleWorkspaceCallInput {
  const params = googleWorkspaceJsonObjectInput(input.params);
  const body = googleWorkspaceJsonValueInput(input.body);
  const upload = googleWorkspaceUploadInput(input.upload);
  const gmailDraft = googleWorkspaceGmailDraftInput(input.gmailDraft);
  return {
    methodId: requiredString(input, "methodId"),
    ...(optionalString(input.accountHint) ? { accountHint: optionalString(input.accountHint) } : {}),
    ...(params ? { params } : {}),
    ...(body === undefined ? {} : { body }),
    ...(upload ? { upload } : {}),
    ...(gmailDraft ? { gmailDraft } : {}),
    ...(input.dryRun === true ? { dryRun: true } : {}),
    ...(optionalString(input.idempotencyKey) ? { idempotencyKey: optionalString(input.idempotencyKey) } : {}),
  };
}

function googleWorkspaceUploadInput(value: unknown): GoogleWorkspaceCallInput["upload"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const path = optionalString(record.path);
  if (!path) return undefined;
  const mimeType = optionalString(record.mimeType);
  return {
    path,
    ...(mimeType ? { mimeType } : {}),
  };
}

function googleWorkspaceGmailDraftInput(value: unknown): GoogleWorkspaceCallInput["gmailDraft"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const attachments = googleWorkspaceGmailDraftAttachmentsInput(record.attachments);
  return {
    ...(optionalStringOrStringArray(record.to) ? { to: optionalStringOrStringArray(record.to) } : {}),
    ...(optionalStringOrStringArray(record.cc) ? { cc: optionalStringOrStringArray(record.cc) } : {}),
    ...(optionalStringOrStringArray(record.bcc) ? { bcc: optionalStringOrStringArray(record.bcc) } : {}),
    ...(optionalStringOrStringArray(record.from) ? { from: optionalStringOrStringArray(record.from) } : {}),
    ...(optionalStringOrStringArray(record.replyTo) ? { replyTo: optionalStringOrStringArray(record.replyTo) } : {}),
    ...(optionalString(record.subject) ? { subject: optionalString(record.subject) } : {}),
    ...(optionalString(record.textBody) ? { textBody: optionalString(record.textBody) } : {}),
    ...(optionalString(record.htmlBody) ? { htmlBody: optionalString(record.htmlBody) } : {}),
    ...(optionalString(record.body) ? { body: optionalString(record.body) } : {}),
    ...(attachments.length ? { attachments } : {}),
  };
}

function googleWorkspaceGmailDraftAttachmentsInput(value: unknown): NonNullable<NonNullable<GoogleWorkspaceCallInput["gmailDraft"]>["attachments"]> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const path = optionalString(record.path);
    if (!path) return [];
    return [{
      path,
      ...(optionalString(record.fileName) ? { fileName: optionalString(record.fileName) } : {}),
      ...(optionalString(record.mimeType) ? { mimeType: optionalString(record.mimeType) } : {}),
    }];
  });
}

function googleWorkspaceMaterializeFileInput(input: Record<string, unknown>): GoogleWorkspaceMaterializeFileInput {
  return {
    handle: requiredString(input, "handle"),
    ...(optionalString(input.path) ? { path: optionalString(input.path) } : {}),
    ...(input.overwrite === true ? { overwrite: true } : {}),
  };
}

function googleWorkspaceOAuthClientImportToolInput(
  input: Record<string, unknown>,
  workspacePath: string,
): GoogleWorkspaceOAuthClientImportInput & { sourcePath: string } {
  const requestedPath = optionalString(input.path) ?? optionalString(input.sourcePath) ?? optionalString(input.filePath);
  if (!requestedPath) throw new Error("google_workspace_import_oauth_client requires path.");
  const sourcePath = isAbsolute(requestedPath) ? requestedPath : resolve(workspacePath, requestedPath);
  if (!isAbsolute(requestedPath) && !isPathInside(workspacePath, sourcePath)) {
    throw new Error("google_workspace_import_oauth_client path must stay inside the workspace when it is workspace-relative.");
  }
  const accountHint = optionalString(input.accountHint);
  return {
    ...(accountHint ? { accountHint } : {}),
    sourcePath,
  };
}

export function googleWorkspaceJsonObjectInput(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string" && value.trim()) {
    const parsed = parseJsonString(value);
    return optionalRecord(parsed);
  }
  return optionalRecord(value);
}

export function googleWorkspaceJsonValueInput(value: unknown): unknown {
  if (typeof value === "string" && value.trim()) {
    return parseJsonString(value) ?? value;
  }
  return value;
}

function googleWorkspaceCallSummary(result: GoogleWorkspaceCallResult): Record<string, unknown> {
  return {
    accountHint: result.accountHint,
    dryRun: result.dryRun,
    method: result.method,
    resultSummary: formatGoogleWorkspaceResultForMethod(result.method.id, result.result),
  };
}

function googleWorkspaceMaterializeFileText(result: GoogleWorkspaceMaterializeFileResult): string {
  return [
    "Google Workspace file saved",
    `Handle: ${result.handle}`,
    `Path: ${result.path}`,
    `File: ${result.fileName}`,
    `Bytes: ${result.bytes}`,
    ...(result.mimeType ? [`MIME type: ${result.mimeType}`] : []),
    `Overwritten: ${result.overwritten ? "yes" : "no"}`,
  ].join("\n");
}

function formatGoogleWorkspaceResultForMethod(methodId: string, value: unknown): string {
  if (methodId === "calendar.events.list") {
    const summary = formatGoogleCalendarEventsList(value);
    if (summary) return summary;
  }
  return formatGoogleWorkspaceResult(value);
}

function formatGoogleCalendarEventsList(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return undefined;
  const events = items.map(googleCalendarEventLine).filter((line): line is string => Boolean(line));
  if (!events.length) return "Calendar events: none";
  const visible = events.length > 60 ? [...events.slice(0, 20), `... ${events.length - 40} event(s) omitted ...`, ...events.slice(-20)] : events;
  return [`Calendar events (${events.length})`, ...visible].join("\n");
}

function googleCalendarEventLine(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const summary = typeof record.summary === "string" && record.summary.trim() ? record.summary.trim() : "(no title)";
  const start = googleCalendarDateValue(record.start);
  const end = googleCalendarDateValue(record.end);
  if (!start && !end) return `- ${summary}`;
  return `- ${summary}; start=${start ?? "unknown"}; end=${end ?? "unknown"}`;
}

function googleCalendarDateValue(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as { dateTime?: unknown; date?: unknown };
  if (typeof record.dateTime === "string" && record.dateTime.trim()) return record.dateTime.trim();
  if (typeof record.date === "string" && record.date.trim()) return record.date.trim();
  return undefined;
}

function formatGoogleWorkspaceResult(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 497)}...` : value;
  const managedFileSummary = googleWorkspaceManagedFileSummary(value);
  if (managedFileSummary) return managedFileSummary;
  const driveWriteSummary = googleWorkspaceDriveFileContentWriteSummary(value);
  if (driveWriteSummary) return driveWriteSummary;
  const gmailDraftSummary = googleWorkspaceGmailDraftWriteSummary(value);
  if (gmailDraftSummary) return gmailDraftSummary;
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 700 ? `${serialized.slice(0, 697)}...` : serialized;
  } catch {
    return String(value);
  }
}

function formatGoogleWorkspaceModelResult(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function googleWorkspaceGmailDraftWriteSummary(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.kind !== "google_workspace_gmail_draft_write") return undefined;
  const response = record.response && typeof record.response === "object" && !Array.isArray(record.response) ? record.response as Record<string, unknown> : undefined;
  const attachments = Array.isArray(record.attachments) ? record.attachments : [];
  const attachmentBytes = attachments.reduce((sum, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return sum;
    const bytes = (item as Record<string, unknown>).bytes;
    return sum + (typeof bytes === "number" ? bytes : 0);
  }, 0);
  const parts = [
    "Google Gmail draft write",
    typeof record.operation === "string" ? `operation=${record.operation}` : undefined,
    typeof record.subject === "string" ? `subject=${record.subject}` : undefined,
    `attachments=${attachments.length}`,
    attachmentBytes ? `attachmentBytes=${attachmentBytes}` : undefined,
    response && typeof response.id === "string" ? `draftId=${response.id}` : undefined,
  ].filter(Boolean);
  return parts.join("; ");
}

function googleWorkspaceDriveFileContentWriteSummary(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.kind !== "google_workspace_drive_file_content_write") return undefined;
  const upload = record.upload && typeof record.upload === "object" && !Array.isArray(record.upload) ? record.upload as Record<string, unknown> : {};
  const response = record.response && typeof record.response === "object" && !Array.isArray(record.response) ? record.response as Record<string, unknown> : undefined;
  const parts = [
    "Google Drive file content write",
    typeof record.operation === "string" ? `operation=${record.operation}` : undefined,
    typeof upload.path === "string" ? `uploadPath=${upload.path}` : undefined,
    typeof upload.fileName === "string" ? `fileName=${upload.fileName}` : undefined,
    typeof upload.mimeType === "string" ? `mimeType=${upload.mimeType}` : undefined,
    typeof upload.bytes === "number" ? `bytes=${upload.bytes}` : undefined,
    response && typeof response.id === "string" ? `driveFileId=${response.id}` : undefined,
    response && typeof response.name === "string" ? `driveFileName=${response.name}` : undefined,
  ].filter(Boolean);
  return parts.join("; ");
}

function googleWorkspaceManagedFileSummary(value: unknown): string | undefined {
  const file = googleWorkspaceManagedFileRecord(value);
  if (!file) return undefined;
  const parts = [
    "Managed Google Workspace file",
    `handle=${file.handle}`,
    `fileName=${file.fileName}`,
    typeof file.mimeType === "string" ? `mimeType=${file.mimeType}` : undefined,
    typeof file.bytes === "number" ? `bytes=${file.bytes}` : undefined,
    "storage=Ambient managed temp",
    "materializeWith=google_workspace_materialize_file",
  ].filter(Boolean);
  return parts.join("; ");
}

function googleWorkspaceManagedFileRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const direct = value as Record<string, unknown>;
  if (direct.kind === "google_workspace_managed_file") return direct;
  const nested = direct.file;
  if (nested && typeof nested === "object" && !Array.isArray(nested) && (nested as Record<string, unknown>).kind === "google_workspace_managed_file") {
    return nested as Record<string, unknown>;
  }
  return undefined;
}

function googleWorkspaceRequiredParamNames(method: GoogleWorkspaceMethodSummary): string {
  const names = (method.parameters ?? []).filter((parameter) => parameter.required).map((parameter) => parameter.name);
  return names.length ? names.join(",") : "none";
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalStringOrStringArray(value: unknown): string | string[] | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  return items.length ? items : undefined;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}

function parseJsonString(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
