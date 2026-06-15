export type PermissionMode = "full-access" | "workspace";

export type PermissionRisk =
  | "outside-workspace"
  | "browser-control"
  | "browser-credential"
  | "browser-login"
  | "browser-network"
  | "browser-profile"
  | "destructive-command"
  | "network-command"
  | "permission-mode-change"
  | "plugin-tool"
  | "privileged-action"
  | "secret-path"
  | "workspace-command";

export type PermissionAuditDecision = "allowed" | "denied";

export type PermissionAuditDecisionSource =
  | "policy"
  | "prompt_allow_once"
  | "prompt_always_thread"
  | "prompt_always_workflow"
  | "prompt_always_project"
  | "prompt_always_workspace"
  | "persistent_grant"
  | "allowed_by_full_access"
  | "denied_by_policy"
  | "denied_by_user";

export type PermissionPromptResponseMode =
  | "deny"
  | "allow_once"
  | "always_thread"
  | "always_workflow"
  | "always_project"
  | "always_workspace";

export type PrivilegedActionPlatform = "any" | "darwin" | "linux" | "win32";

export type PrivilegedActionPurpose =
  | "create_system_symlink"
  | "install_system_package"
  | "register_service"
  | "install_driver"
  | "repair_protected_path"
  | "other_privileged_setup";

export type PrivilegedActionAdapterName = "dry-run" | "macos-authorized-helper" | "linux-polkit-helper" | "windows-elevated-helper";

export type PrivilegedActionAdapterResultStatus = "not-executed" | "blocked" | "adapter-unavailable" | "succeeded" | "failed";

export type PrivilegedActionCredentialCaptureStatus = "not-requested" | "rehearsed-and-discarded" | "captured-and-discarded" | "denied" | "unavailable";

export type PrivilegedActionAdapterExecutionMode = "dry-run-only" | "planned-not-executed" | "executed";

export type PrivilegedActionContinuationState = "blocked-until-native-adapter" | "blocked-by-policy" | "ready-to-resume-validation";

export interface PrivilegedActionCommandTemplate {
  exe: string;
  args: string[];
  cwd?: string;
  rationale?: string;
}

export interface PrivilegedActionTemplate {
  kind: "privileged_action_template";
  purpose: PrivilegedActionPurpose;
  packageName?: string;
  reason: string;
  platform?: PrivilegedActionPlatform;
  commands: PrivilegedActionCommandTemplate[];
  credential?: "{{AMBIENT_PRIVILEGED_AUTH}}";
}

export interface PrivilegedActionCredentialPolicy {
  visibleToPi: false;
  persistence: "ephemeral";
  expiresAfterUse: true;
  logPolicy: "redact-all";
}

export interface PrivilegedActionAdapterReadiness {
  execution: "dry-run-only" | "executed";
  adapterStatus: "not-implemented" | "available";
  actionCategory: PrivilegedActionPurpose;
  executablePolicy: "template-reviewed-no-shell";
  futureAdapters: PrivilegedActionAdapterName[];
}

export interface PrivilegedActionUiPrompt {
  title: string;
  message: string;
  detail: string;
  responseMode: "review-only" | "native-credential-required";
  credentialPrompt: "none" | "ephemeral-native-prompt-required";
  redactedCommands: PrivilegedActionCommandTemplate[];
  warnings: string[];
}

export interface PrivilegedActionNativeRequest {
  schemaVersion: "ambient-privileged-action-v1";
  requestId: string;
  threadId?: string;
  workspacePath: string;
  createdAt: string;
  template: PrivilegedActionTemplate;
  uiPrompt: PrivilegedActionUiPrompt;
  adapterReadiness: PrivilegedActionAdapterReadiness;
  credentialPolicy: PrivilegedActionCredentialPolicy;
}

export interface PrivilegedActionAdapterExecutionPlan {
  adapter: PrivilegedActionAdapterName;
  executionMode: PrivilegedActionAdapterExecutionMode;
  allowedByPolicy: boolean;
  policyReason: string;
  platform: PrivilegedActionPlatform;
  purpose: PrivilegedActionPurpose;
  requiresCredential: boolean;
  executesPrivilegedCommands: boolean;
  executable?: string;
  args?: string[];
  cwd?: string;
  commands?: Array<{
    executable: string;
    args: string[];
    cwd?: string;
  }>;
  workspaceSourcePath?: string;
  protectedTargetPath?: string;
  warnings: string[];
}

export interface PrivilegedActionContinuation {
  state: PrivilegedActionContinuationState;
  packageName?: string;
  reason: string;
  recommendedTools: string[];
  redactedLogPath?: string;
  resumeAction?: {
    toolName: "ambient_capability_builder_validate";
    input: {
      packageName: string;
      includeSmokeTests: true;
    };
    requiresApproval: true;
    runAfter: "privileged-action-succeeded";
  };
  instructions: string[];
}

export interface PrivilegedActionNativeResult {
  schemaVersion: "ambient-privileged-action-v1";
  requestId: string;
  status: PrivilegedActionAdapterResultStatus;
  adapter: PrivilegedActionAdapterName;
  message: string;
  commandCount: number;
  redactedCommands: PrivilegedActionCommandTemplate[];
  credentialPolicy: PrivilegedActionCredentialPolicy;
  adapterReadiness: PrivilegedActionAdapterReadiness;
  credentialCapture: PrivilegedActionCredentialCaptureStatus;
  executionPlan?: PrivilegedActionAdapterExecutionPlan;
  continuation: PrivilegedActionContinuation;
  stdoutPreview?: string;
  stderrPreview?: string;
  logPath?: string;
}

export interface PrivilegedActionAdapterStatus {
  schemaVersion: "ambient-privileged-action-v1";
  execution: "dry-run-only" | "executed";
  adapterStatus: "not-implemented" | "available";
  selectedAdapter: PrivilegedActionAdapterName;
  selectedAdapterExecutesPrivilegedCommands: boolean;
  policyPlanning: "available" | "not-implemented";
  credentialCapture: "not-implemented" | "rehearsal-available" | "available";
  supportedPurposes: PrivilegedActionPurpose[];
  policyHints: Array<{
    adapter: PrivilegedActionAdapterName;
    platform: PrivilegedActionPlatform;
    purpose: PrivilegedActionPurpose;
    executionMode: PrivilegedActionAdapterExecutionMode;
    allowedByPolicy: boolean;
    commandPattern: string;
    sourcePolicy: string;
    targetPolicy: string;
    notes: string;
  }>;
  adapters: Array<{
    name: PrivilegedActionAdapterName;
    available: boolean;
    executesPrivilegedCommands: boolean;
    notes: string;
  }>;
  guidance: string[];
}

export interface PrivilegedCredentialRequest {
  id: string;
  threadId?: string;
  workspacePath?: string;
  requestId: string;
  title: string;
  message: string;
  detail: string;
  purpose: PrivilegedActionPurpose;
  packageName?: string;
  credentialLabel: string;
  createdAt: string;
  expiresAt: string;
}

export interface PrivilegedCredentialPromptResolution {
  allowed: boolean;
  credential?: string;
}

export interface PrivilegedCredentialPromptResponseInput {
  id: string;
  credential?: string;
  canceled?: boolean;
}

export type SecureInputKind = "telegram_login_code" | "telegram_password" | "generic_secret";

export interface SecureInputRequest {
  id: string;
  threadId?: string;
  workspacePath?: string;
  requestId: string;
  title: string;
  message: string;
  detail: string;
  inputLabel: string;
  inputKind: SecureInputKind;
  inputMode: "text" | "password";
  providerId?: string;
  profileId?: string;
  createdAt: string;
  expiresAt: string;
}

export interface SecureInputPromptResolution {
  allowed: boolean;
  value?: string;
}

export interface SecureInputPromptResponseInput {
  id: string;
  value?: string;
  canceled?: boolean;
}

export type PermissionGrantScopeKind = "thread" | "workflow_thread" | "project" | "workspace" | "global_plugin";

export type PermissionGrantActionKind =
  | "file_metadata_read"
  | "file_content_read"
  | "secret_path_read"
  | "connector_metadata_read"
  | "connector_account_data_read"
  | "connector_content_read"
  | "plugin_metadata_read"
  | "plugin_tool_execute"
  | "browser_network"
  | "browser_control"
  | "browser_profile"
  | "browser_login"
  | "shell_command"
  | "local_file_write"
  | "remote_mutation";

export type PermissionGrantTargetKind =
  | "path"
  | "path_glob"
  | "connector"
  | "connector_account"
  | "plugin"
  | "tool"
  | "browser_origin"
  | "shell_command_prefix"
  | "mutation_policy"
  | "risk";

export type PermissionGrantCreatedBy = "user" | "migration" | "system";

export type PermissionGrantSource = "permission_prompt" | "plugin_trust" | "settings" | "workflow_review";

export interface PermissionPromptResolution {
  allowed: boolean;
  mode: PermissionPromptResponseMode;
}

export interface PermissionRequest {
  id: string;
  threadId: string;
  toolName: string;
  title: string;
  message: string;
  detail?: string;
  risk: PermissionRisk;
  workspacePath?: string;
  projectPath?: string;
  workflowThreadId?: string;
  reusableScopes?: PermissionGrantScopeKind[];
  grantActionKind?: PermissionGrantActionKind;
  grantTargetKind?: PermissionGrantTargetKind;
  grantTargetLabel?: string;
  grantTargetHash?: string;
  grantConditions?: Record<string, unknown>;
}

export interface PermissionAuditEntry {
  id: string;
  runId?: string;
  threadId: string;
  createdAt: string;
  permissionMode: PermissionMode;
  toolName: string;
  risk: PermissionRisk;
  decision: PermissionAuditDecision;
  detail?: string;
  reason: string;
  decisionSource?: PermissionAuditDecisionSource;
  grantId?: string;
}

export interface AmbientPermissionGrant {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  createdBy: PermissionGrantCreatedBy;
  permissionModeAtCreation: PermissionMode;
  scopeKind: PermissionGrantScopeKind;
  threadId?: string;
  workflowThreadId?: string;
  projectPath?: string;
  workspacePath?: string;
  actionKind: PermissionGrantActionKind;
  targetKind: PermissionGrantTargetKind;
  targetHash: string;
  targetLabel: string;
  conditions?: Record<string, unknown>;
  source: PermissionGrantSource;
  reason: string;
}

export interface CreateAmbientPermissionGrantInput {
  expiresAt?: string;
  createdBy?: PermissionGrantCreatedBy;
  permissionModeAtCreation: PermissionMode;
  scopeKind: PermissionGrantScopeKind;
  threadId?: string;
  workflowThreadId?: string;
  projectPath?: string;
  workspacePath?: string;
  actionKind: PermissionGrantActionKind;
  targetKind: PermissionGrantTargetKind;
  targetHash: string;
  targetLabel: string;
  conditions?: Record<string, unknown>;
  source?: PermissionGrantSource;
  reason: string;
}

export interface RevokeAmbientPermissionGrantInput {
  id: string;
}
