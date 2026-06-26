import type { AmbientModelRuntimeProfile, AmbientProviderDescriptor } from "./ambientModels";
import type { ModelProviderCapabilityEligibility, ModelProviderCapabilityProbePlan, ModelProviderCapabilityProbeReport } from "./modelProviderInstallTemplates";
import type { PermissionMode, PrivilegedActionAdapterResultStatus } from "./permissionTypes";
import type { InstallModelProviderEndpointCredentialRefInput, ModelRuntimeInstalledProviderEndpointConfig } from "./threadTypes";

export interface ModelProviderCredentialSaveResult {
  schemaVersion: "ambient-model-provider-credential-save-v1";
  templateId: string;
  providerId: string;
  modelId: string;
  baseUrl: string;
  configured: true;
  credentialRef: InstallModelProviderEndpointCredentialRefInput;
}

export interface ModelProviderEndpointProbeServiceResult {
  schemaVersion: "ambient-model-provider-endpoint-probe-service-v1";
  templateId: string;
  provider: AmbientProviderDescriptor;
  endpoint: ModelRuntimeInstalledProviderEndpointConfig;
  candidateProfile: AmbientModelRuntimeProfile;
  profile: AmbientModelRuntimeProfile;
  probePlan: ModelProviderCapabilityProbePlan;
  probeReport: ModelProviderCapabilityProbeReport;
  eligibility: ModelProviderCapabilityEligibility;
}

export interface CodexPluginSkill {
  name: string;
  description?: string;
  path: string;
}

export interface CodexPluginMcpServer {
  name: string;
  command?: string;
  args: string[];
  envKeys: string[];
}

export interface CodexPluginDependencyStatus {
  packageJsonPath: string;
  manager: "npm" | "pnpm" | "yarn";
  installCommand: string[];
  required: boolean;
  installed: boolean;
  missingPackages: string[];
  reason?: string;
}

export interface CodexPluginMcpTool {
  pluginId: string;
  pluginName: string;
  serverName: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface CodexPluginMcpServerInspection {
  pluginId: string;
  pluginName: string;
  serverName: string;
  status: "ready" | "skipped" | "error";
  tools: CodexPluginMcpTool[];
  reason?: string;
  stderr?: string;
}

export interface CodexPluginMcpInspectionCatalog {
  servers: CodexPluginMcpServerInspection[];
}

export type PluginMcpRuntimeStatus = "starting" | "ready" | "unhealthy" | "crashed" | "stopped";

export interface PluginMcpRuntimeEvent {
  sequence: number;
  method: string;
  toolName?: string;
  status: "started" | "succeeded" | "failed";
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
}

export interface PluginMcpRuntimeSnapshot {
  key: string;
  pluginId: string;
  pluginName: string;
  pluginVersion: string;
  pluginFingerprint: string;
  serverName: string;
  status: PluginMcpRuntimeStatus;
  permissionMode: PermissionMode;
  workspacePath: string;
  cwd: string;
  command?: string;
  args: string[];
  envKeys: string[];
  pid?: number;
  startedAt?: string;
  requestCount: number;
  toolCount?: number;
  failureCount?: number;
  backoffUntil?: string;
  lastError?: string;
  stderr?: string;
  recentEvents?: PluginMcpRuntimeEvent[];
}

export interface PluginMcpRuntimeActionInput {
  key: string;
}

export type CodexPluginSourceKind = "workspace" | "codex-cache" | "remote-marketplace";

export type CodexPluginCompatibilityTier = "supported" | "partial" | "unsupported";

export type CodexMarketplaceSourceKind = "workspace" | "remote" | "ambient-curated" | "hosted-codex";

export interface CodexPluginApp {
  name: string;
  connectorId: string;
  path: string;
}

export interface CodexPluginSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  marketplaceName: string;
  marketplacePath: string;
  marketplaceKind?: CodexMarketplaceSourceKind;
  rootPath: string;
  sourceKind: CodexPluginSourceKind;
  compatibilityTier: CodexPluginCompatibilityTier;
  compatibilityNotes: string[];
  supportLabels: string[];
  category?: string;
  displayName?: string;
  authPolicy?: string;
  skills: CodexPluginSkill[];
  mcpServers: CodexPluginMcpServer[];
  appsPath?: string;
  apps?: CodexPluginApp[];
  dependencyStatus?: CodexPluginDependencyStatus;
  sourceType?: string;
  sourceUrl?: string;
  sourcePath?: string;
  sourceRef?: string;
  sourceSha?: string;
  sourceChecksum?: string;
  sourceBundleChecksum?: string;
  author?: string;
  publisher?: string;
  license?: string;
  ambientCompatibility?: string;
  ambientCompatibilityTier?: CodexPluginCompatibilityTier;
  ambientCompatibilityNotes?: string[];
  ambientSupportLabels?: string[];
  capabilitySummary?: string[];
  imported?: boolean;
  updateAvailable?: boolean;
  enabled: boolean;
  trusted: boolean;
  errors: string[];
}

export interface CodexMarketplaceSourceSummary {
  id: string;
  label: string;
  source: string;
  kind: CodexMarketplaceSourceKind;
  removable: boolean;
  pluginCount?: number;
  contentChecksum?: string;
  signatureStatus?: "verified" | "unsigned-dev" | "missing" | "invalid";
  signatureKeyId?: string;
  signatureGeneratedAt?: string;
  signatureError?: string;
}

export interface CodexPluginCatalog {
  marketplaces: string[];
  marketplaceSources?: CodexMarketplaceSourceSummary[];
  plugins: CodexPluginSummary[];
  importCandidates: CodexPluginSummary[];
  errors: string[];
}

export type CodexHostedMarketplaceStatus = "sidecar-required" | "available" | "error";

export interface CodexHostedMarketplacePluginSummary {
  id?: string;
  name: string;
  marketplaceName: string;
  marketplaceKind: CodexMarketplaceSourceKind;
  displayName?: string;
  installed?: boolean;
  enabled?: boolean;
  sourceType?: string;
  authPolicy?: string;
}

export interface CodexHostedMarketplaceSummary {
  name: string;
  marketplaceKind: CodexMarketplaceSourceKind;
  displayName?: string;
  path?: string;
  source?: string;
  pluginCount: number;
  plugins: CodexHostedMarketplacePluginSummary[];
}

export interface CodexHostedMarketplaceReadComparison {
  pluginName: string;
  marketplaceName: string;
  ambientPluginId: string;
  hostedPluginId?: string;
  status: "matched" | "mismatch" | "error";
  readName?: string;
  displayName?: string;
  skillCount?: number;
  mcpServerCount?: number;
  appCount?: number;
  error?: string;
}

export interface CodexHostedMarketplaceReport {
  status: CodexHostedMarketplaceStatus;
  checkedAt: string;
  message: string;
  source: "ambient" | "codex-app-server";
  protocolMethods: string[];
  command?: string;
  codexHome?: string;
  platformFamily?: string;
  marketplaceCount: number;
  pluginCount: number;
  featuredPluginIds: string[];
  marketplaceLoadErrors: string[];
  marketplaces: CodexHostedMarketplaceSummary[];
  ambientCandidateCount: number;
  matchedPluginCount: number;
  missingInAmbient: string[];
  extraInAmbient: string[];
  readComparisonCount: number;
  readComparisons: CodexHostedMarketplaceReadComparison[];
  notes: string[];
}

export type PiPackageSourceKind = "workspace" | "ambient-workspace" | "ambient-global" | "project-settings" | "user-settings" | "pi-gallery";

export type PiPackageResourceKind = "extension" | "skill" | "prompt" | "theme";

export type PiPackageResourceSource = "manifest" | "convention" | "settings-filter" | "gallery";

export type PiPackageInstallScope = "workspace" | "global";

export interface PiPackageResourceSummary {
  kind: PiPackageResourceKind;
  path: string;
  source: PiPackageResourceSource;
}

export interface PiPackageDependencyStatus {
  packageJsonPath: string;
  required: boolean;
  installed: boolean;
  packageNames: string[];
  missingPackages: string[];
  reason?: string;
}

export interface PiPackageSummary {
  id: string;
  name: string;
  version?: string;
  description?: string;
  sourceKind: PiPackageSourceKind;
  sourceLabel: string;
  sourceUrl?: string;
  packageSpec?: string;
  installCommand?: string;
  installed?: boolean;
  enabled?: boolean;
  installScope?: PiPackageInstallScope;
  rootPath?: string;
  packageJsonPath?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  author?: string;
  keywords: string[];
  publishedAt?: string;
  downloadsPerMonth?: number;
  image?: string;
  video?: string;
  dependencyStatus?: PiPackageDependencyStatus;
  resourceCounts: Record<PiPackageResourceKind, number>;
  resources: PiPackageResourceSummary[];
  compatibilityTier: CodexPluginCompatibilityTier;
  compatibilityNotes: string[];
  supportLabels: string[];
  errors: string[];
}

export interface PiPackageCatalog {
  packages: PiPackageSummary[];
  errors: string[];
  sourceNotes: string[];
}

export interface InstallPiPackageInput {
  source: string;
  scope?: PiPackageInstallScope;
}

export interface PreviewPiPackageInstallInput extends InstallPiPackageInput {}

export interface PiPackageInstallPreview {
  source: string;
  normalizedSource: string;
  scope: PiPackageInstallScope;
  candidate?: PiPackageSummary;
  installable: boolean;
  errors: string[];
  notes: string[];
}

export interface UninstallPiPackageInput {
  packageId: string;
}

export interface SetPiPackageEnabledInput {
  packageId: string;
  enabled: boolean;
}

export interface PiExtensionSandboxToolSummary {
  name: string;
  label?: string;
  description?: string;
  parameters?: unknown;
}

export interface PiExtensionSandboxPackageSummary {
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  resolvedSource: string;
  packagePath: string;
  sha: string;
  rootPath: string;
  entrypoint: string;
  allowedNetworkHosts: string[];
  tools: PiExtensionSandboxToolSummary[];
  installed: boolean;
  errors: string[];
}

export interface PiExtensionSandboxHistoryEntry extends PiExtensionSandboxPackageSummary {
  removedAt: string;
  removalReason: string;
}

export interface PiExtensionSandboxCatalog {
  packages: PiExtensionSandboxPackageSummary[];
  history: PiExtensionSandboxHistoryEntry[];
  errors: string[];
}

export interface InstallPiExtensionSandboxPackageInput {
  source: string;
  allowedNetworkHosts?: string[];
}

export interface PreviewPiExtensionSandboxPackageInput extends InstallPiExtensionSandboxPackageInput {}

export interface PiExtensionSandboxInstallPreview {
  source: string;
  resolvedSource?: string;
  packagePath?: string;
  sha?: string;
  packageName?: string;
  version?: string;
  entrypoint?: string;
  allowedNetworkHosts: string[];
  candidate?: PiExtensionSandboxPackageSummary;
  installable: boolean;
  errors: string[];
}

export interface UninstallPiExtensionSandboxPackageInput {
  packageId?: string;
  packageName?: string;
}

export interface PiPrivilegedSecurityFinding {
  severity: "info" | "warning" | "high";
  category: string;
  message: string;
  files: string[];
}

export type PiPrivilegedScanOrigin = "explicit" | "sandbox-fallback";

export interface PiPrivilegedSecurityScan {
  source: string;
  scanOrigin: PiPrivilegedScanOrigin;
  packageName: string;
  version?: string;
  description?: string;
  license?: string;
  repositoryUrl?: string;
  npmTarball?: string;
  integrity?: string;
  shasum?: string;
  descriptorHash: string;
  packageTreeHash: string;
  fingerprint: string;
  resources: {
    piExtensions: string[];
    piSkills: string[];
    piPrompts: string[];
    piThemes: string[];
    bins: string[];
    mcpServers: string[];
    hookConfigs: string[];
  };
  riskSummary: {
    lifecycleHooks: boolean;
    commands: boolean;
    mcpServers: boolean;
    hostConfigMutation: boolean;
    filesystemWrites: boolean;
    homeDirectoryAccess: boolean;
    processExecution: boolean;
    network: boolean;
    envOrSecrets: boolean;
    nativeDependencies: boolean;
    installScripts: boolean;
    dynamicCode: boolean;
  };
  findings: PiPrivilegedSecurityFinding[];
  recommendation: "sandboxed-tool-supported" | "privileged-review-required";
  caveat: string;
}

export interface PiPrivilegedInstallSummary {
  id: string;
  source: string;
  packageName: string;
  version?: string;
  rootPath: string;
  status: "disabled" | "active" | "removal_failed";
  installedAt: string;
  disabledAt?: string;
  scan: PiPrivilegedSecurityScan;
}

export interface PiPrivilegedInstallHistoryEntry extends PiPrivilegedInstallSummary {
  removedAt: string;
  manualCleanup: string[];
}

export interface PiPrivilegedCatalog {
  packages: PiPrivilegedInstallSummary[];
  history: PiPrivilegedInstallHistoryEntry[];
  errors: string[];
}

export interface ScanPiPrivilegedPackageInput {
  source: string;
  scanOrigin?: PiPrivilegedScanOrigin;
}

export interface InstallPiPrivilegedPackageInput {
  source: string;
  scanOrigin?: PiPrivilegedScanOrigin;
}

export interface PiPrivilegedPackageActionInput {
  packageId?: string;
  packageName?: string;
}

export interface UninstallPiPrivilegedPackageInput extends PiPrivilegedPackageActionInput {
  deleteData?: boolean;
}

export type AmbientPluginSourceKind =
  | "codex-workspace"
  | "codex-cache"
  | "codex-ambient-curated"
  | "codex-remote-marketplace"
  | "pi-workspace"
  | "pi-ambient-workspace"
  | "pi-ambient-global"
  | "pi-project-settings"
  | "pi-user-settings"
  | "pi-gallery"
  | "ambient-cli"
  | "ambient-built-in";

export type AmbientPluginCapabilityKind =
  | "skill"
  | "tool"
  | "mcp-tool"
  | "app"
  | "connector"
  | "prompt"
  | "theme"
  | "runtime-extension";

export type AmbientPluginRuntime = "chat" | "workflow" | "automation" | "ui";

export type AmbientPluginInstallState = "discovered" | "installed" | "importable";

export type AmbientPluginAvailability = "available" | "disabled" | "untrusted" | "auth-required" | "unsupported" | "error";

export type AmbientPluginAuthStatus = "not_configured" | "connecting" | "available" | "expired" | "revoked" | "error" | "unavailable";

export interface AmbientPluginAuthAccountSummary {
  id: string;
  accountId: string;
  label: string;
  email?: string;
  status: AmbientPluginAuthStatus;
  grantedScopes: string[];
  connectedAt: string;
  updatedAt: string;
  lastValidatedAt?: string;
  validationError?: string;
}

export interface AmbientPluginAppAuthSummary {
  connectorId: string;
  providerId?: string;
  providerLabel?: string;
  status: AmbientPluginAuthStatus;
  accounts: AmbientPluginAuthAccountSummary[];
  unavailableReason?: string;
}

export interface StartPluginAppAuthInput {
  connectorId: string;
  scopes?: string[];
}

export interface CompletePluginAppAuthInput {
  state: string;
  code: string;
}

export interface PluginAuthAccountActionInput {
  accountId: string;
}

export interface AmbientPluginAuthStartResult {
  connectorId: string;
  providerId: string;
  requestedScopes: string[];
  authorizationUrl: string;
  state: string;
  expiresAt: string;
}

export interface FirstPartyGoogleIntegrationState {
  enabled: boolean;
  authMode: "gws" | "ambient_oauth" | "disabled";
  connectors: AmbientPluginAppAuthSummary[];
  install?: GoogleWorkspaceCliInstallState;
  setup?: GoogleWorkspaceSetupState;
  sidecar: {
    adapter?: "gws" | "ambient-go";
    state: "missing" | "available" | "stopped" | "running";
    binaryPath: string;
    configDir?: string;
    pending: number;
    setupCommands?: string[];
  };
  unavailableReason?: string;
}

export type GoogleWorkspaceSetupCommand = "setup" | "login";

export type GoogleWorkspaceSetupStatus = "idle" | "running" | "validating" | "completed" | "error" | "canceled";

export type GoogleWorkspaceSetupRequiredAction = "oauth_client_config";

export type GoogleWorkspaceCliInstallStatus = "idle" | "running" | "completed" | "error" | "unsupported";

export interface GoogleWorkspaceCliInstallState {
  status: GoogleWorkspaceCliInstallStatus;
  version: string;
  platform: string;
  arch: string;
  binaryPath?: string;
  downloadUrl?: string;
  checksum?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface GoogleWorkspaceSetupInput {
  accountHint?: string;
  command?: GoogleWorkspaceSetupCommand;
  openAuthUrl?: boolean;
}

export interface GoogleWorkspaceOAuthClientImportInput {
  accountHint?: string;
}

export interface GoogleWorkspaceValidationInput {
  accountHint?: string;
}

export interface GoogleWorkspaceValidationCheck {
  service: "identity" | "gmail" | "calendar" | "drive";
  label: string;
  ok: boolean;
  message?: string;
}

export interface GoogleWorkspaceAccountIdentity {
  email?: string;
  displayName?: string;
  source: "gmail.profile" | "drive.about" | "hint";
}

export interface GoogleWorkspaceValidationResult {
  account: AmbientPluginAuthAccountSummary;
  checks: GoogleWorkspaceValidationCheck[];
  identity?: GoogleWorkspaceAccountIdentity;
}

export type GoogleWorkspaceMethodSideEffect =
  | "metadata_read"
  | "personal_content_read"
  | "draft_write"
  | "data_mutation"
  | "sharing_mutation"
  | "external_communication"
  | "unknown";

export interface GoogleWorkspaceMethodParameterSummary {
  name: string;
  location?: string;
  type?: string;
  required: boolean;
  description?: string;
  enum?: string[];
  deprecated?: boolean;
  default?: string;
}

export interface GoogleWorkspaceMethodRequestBodyFieldSummary {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
  deprecated?: boolean;
}

export interface GoogleWorkspaceMethodRequestBodySummary {
  schemaRef?: string;
  description?: string;
  required?: boolean;
  fields: GoogleWorkspaceMethodRequestBodyFieldSummary[];
}

export interface GoogleWorkspaceMethodSummary {
  id: string;
  service: string;
  resource: string;
  method: string;
  label: string;
  description: string;
  httpMethod: string;
  path?: string;
  scopes: string[];
  sideEffect: GoogleWorkspaceMethodSideEffect;
  dryRunSupported: boolean;
  parameters?: GoogleWorkspaceMethodParameterSummary[];
  requestBody?: GoogleWorkspaceMethodRequestBodySummary;
}

export interface GoogleWorkspaceSearchMethodsInput {
  query?: string;
  service?: string;
  sideEffect?: GoogleWorkspaceMethodSideEffect;
  httpMethod?: string;
  scope?: string;
  limit?: number;
}

export interface GoogleWorkspaceSearchMethodsResult {
  methods: GoogleWorkspaceMethodSummary[];
  truncated: boolean;
  catalogVersion: string;
}

export interface GoogleWorkspaceDescribeMethodInput {
  methodId: string;
}

export interface GoogleWorkspaceCallInput {
  accountHint?: string;
  methodId: string;
  params?: Record<string, unknown>;
  body?: unknown;
  upload?: GoogleWorkspaceUploadInput;
  gmailDraft?: GoogleWorkspaceGmailDraftInput;
  dryRun?: boolean;
  idempotencyKey?: string;
}

export interface GoogleWorkspaceCallResult {
  accountHint?: string;
  method: GoogleWorkspaceMethodSummary;
  dryRun: boolean;
  result: unknown;
}

export interface GoogleWorkspaceUploadInput {
  path: string;
  mimeType?: string;
}

export interface GoogleWorkspaceGmailDraftInput {
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  from?: string | string[];
  replyTo?: string | string[];
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  body?: string;
  attachments?: GoogleWorkspaceGmailDraftAttachmentInput[];
}

export interface GoogleWorkspaceGmailDraftAttachmentInput {
  path: string;
  fileName?: string;
  mimeType?: string;
}

export interface GoogleWorkspaceGmailDraftAttachmentSummary {
  path: string;
  fileName: string;
  bytes: number;
  mimeType: string;
}

export interface GoogleWorkspaceDriveFileContentWriteResult {
  kind: "google_workspace_drive_file_content_write";
  sourceMethodId: string;
  operation: "create" | "update";
  upload: {
    path: string;
    fileName: string;
    bytes: number;
    mimeType?: string;
  };
  response: unknown;
  createdAt: string;
}

export interface GoogleWorkspaceGmailDraftWriteResult {
  kind: "google_workspace_gmail_draft_write";
  sourceMethodId: string;
  operation: "create" | "update";
  subject?: string;
  attachments: GoogleWorkspaceGmailDraftAttachmentSummary[];
  response: unknown;
  createdAt: string;
}

export interface GoogleWorkspaceManagedFileResult {
  kind: "google_workspace_managed_file";
  handle: string;
  fileName: string;
  mimeType?: string;
  bytes: number;
  storage: "ambient_managed_temp";
  sourceMethodId: string;
  availableToModel: false;
  materializeWith: "google_workspace_materialize_file";
  createdAt: string;
}

export interface GoogleWorkspaceMaterializeFileInput {
  handle: string;
  path?: string;
  overwrite?: boolean;
}

export interface GoogleWorkspaceMaterializeFileResult {
  handle: string;
  path: string;
  bytes: number;
  fileName: string;
  mimeType?: string;
  overwritten: boolean;
}

export interface GoogleWorkspaceSetupState {
  status: GoogleWorkspaceSetupStatus;
  command?: GoogleWorkspaceSetupCommand;
  accountHint?: string;
  configDir?: string;
  oauthClientConfigured?: boolean;
  requiredAction?: GoogleWorkspaceSetupRequiredAction;
  oauthClientConfigUrl?: string;
  openedOAuthClientConfigUrl?: boolean;
  startedAt?: string;
  finishedAt?: string;
  authUrl?: string;
  openedAuthUrl?: boolean;
  exitCode?: number;
  signal?: string;
  outputTail?: string;
  error?: string;
  validation?: GoogleWorkspaceValidationResult;
  discoveredEmail?: string;
}

export interface AmbientPluginCapabilitySummary {
  id: string;
  pluginId: string;
  pluginName: string;
  pluginDisplayName?: string;
  kind: AmbientPluginCapabilityKind;
  name: string;
  displayName?: string;
  description?: string;
  sourceKind: AmbientPluginSourceKind;
  runtimeSupport: AmbientPluginRuntime[];
  enabled: boolean;
  trusted: boolean;
  availability: AmbientPluginAvailability;
  availabilityReason?: string;
  path?: string;
  toolName?: string;
  serverName?: string;
  connectorId?: string;
  authStatus?: AmbientPluginAuthStatus;
  authProviderId?: string;
  authAccountCount?: number;
  authAccounts?: AmbientPluginAuthAccountSummary[];
  inputSchema?: unknown;
  supportLabels: string[];
  diagnostics: string[];
  generated?: AmbientGeneratedCapabilitySummary;
}

export interface AmbientPluginSummary {
  id: string;
  sourcePluginId: string;
  sourceKind: AmbientPluginSourceKind;
  sourceLabel: string;
  name: string;
  displayName?: string;
  description?: string;
  version?: string;
  installState: AmbientPluginInstallState;
  compatibilityTier: CodexPluginCompatibilityTier;
  enabled: boolean;
  trusted: boolean;
  capabilityCount: number;
  supportLabels: string[];
  diagnostics: string[];
  generated?: AmbientGeneratedCapabilitySummary;
}

export interface AmbientGeneratedCapabilitySummary {
  schemaVersion: "ambient-capability-builder-v1";
  status?: string;
  goal?: string;
  installerShape?: string;
  kind?: string;
  provider?: string;
  outputArtifactTypes: string[];
  locality?: string;
  sourcePath?: string;
  lastValidatedAt?: string;
  registeredAt?: string;
  installedPackageId?: string;
  installedSource?: string;
  installedVersion?: string;
  refs: {
    latest?: string;
    installed?: string;
    lastValidated?: string;
    lastValidatedHash?: string;
    lastRepair?: string;
  };
}

export interface CapabilityBuilderHistoryInput {
  includeRegistered?: boolean;
  includeDrafts?: boolean;
  packageName?: string;
}

export interface CapabilityBuilderValidationArtifact {
  path: string;
  sizeBytes: number;
}

export interface CapabilityBuilderHistoryEntry {
  packageName: string;
  rootPath: string;
  relativeRootPath: string;
  gitSha?: string;
  valid: boolean;
  status: string;
  goal?: string;
  installerShape?: string;
  kind?: string;
  provider?: string;
  version?: string;
  sourcePath?: string;
  installedPackageId?: string;
  installedSource?: string;
  installedPresent: boolean;
  lastValidatedAt?: string;
  registeredAt?: string;
  unregisteredAt?: string;
  validationLogPath?: string;
  validationArtifacts: CapabilityBuilderValidationArtifact[];
  refs: Record<string, string | null>;
  commandNames: string[];
  envNames: string[];
  artifactOutputTypes: string[];
  logFiles: string[];
  possibleArtifactFiles: string[];
  errors: string[];
  warnings: string[];
}

export interface CapabilityBuilderHistoryResult {
  rootPath: string;
  relativeRootPath: string;
  entries: CapabilityBuilderHistoryEntry[];
  errors: string[];
}

export interface AmbientPluginRegistry {
  plugins: AmbientPluginSummary[];
  capabilities: AmbientPluginCapabilitySummary[];
  sources: string[];
  errors: string[];
  sourceNotes: string[];
}

export interface AmbientMcpServerSearchInput {
  query?: string;
  limit?: number;
  refresh?: boolean;
}

export interface AmbientMcpServerDescribeInput {
  serverId: string;
  refresh?: boolean;
  secretBindings?: AmbientMcpSecretBindingInput[];
}

export interface AmbientMcpServerInstallInput {
  serverId: string;
  refresh?: boolean;
  secretBindings?: AmbientMcpSecretBindingInput[];
}

export interface AmbientMcpSecretBindingInput {
  envName: string;
  secretRef: string;
}

export interface AmbientMcpServerUninstallInput {
  serverId?: string;
  workloadName?: string;
}

export interface AmbientMcpToolReviewAcceptInput {
  serverId?: string;
  workloadName?: string;
  expectedDescriptorHash?: string;
}

export interface AmbientMcpServerSearchResult {
  serverId: string;
  title: string;
  description: string;
  status?: string;
  tier?: string;
  transport?: string;
  repositoryUrl?: string;
  tags: string[];
  tools: string[];
  installed: boolean;
  workloadName?: string;
  riskHints: string[];
}

export interface AmbientMcpInstalledServerSummary {
  serverId: string;
  workloadName: string;
  registrySource?: string;
  permissionProfilePath: string;
  permissionProfileSha256: string;
  createdAt: string;
  updatedAt: string;
  workloadStatus?: string;
  endpoint?: string;
  lastKnownToolCount?: number;
  lastKnownToolDescriptorHash?: string;
  toolDescriptorReviewStatus?: "trusted" | "needs-review";
  toolDescriptorReviewReason?: string;
  lastToolDiscoveryAt?: string;
  toolPolicyCount?: number;
  hiddenToolPolicyCount?: number;
  blockedToolPolicyCount?: number;
  runtimeListError?: string;
}

export interface ManagedDevServerSummary {
  id: string;
  command: string;
  cwd: string;
  pid?: number;
  startedAt: string;
  readyAt: string;
  sandboxKind: "none" | "macos-sandbox-exec" | "policy-only";
  sandboxReason?: string;
}

export interface StopManagedDevServerInput {
  id: string;
}

export interface AmbientMcpInstallPreview {
  serverId: string;
  title: string;
  summary: string;
  sourceSummary: string;
  runtimeSummary: string;
  permissionSummary: string;
  secretSummary: string;
  validationSummary: string;
  blockers: string[];
  warnings: string[];
  riskLevel: string;
  riskReasons: string[];
  runPlan?: {
    serverId: string;
    workloadName: string;
    group: string;
    isolateNetwork: boolean;
    transport: string;
    permissionProfilePath: string;
    sourceRef: string;
  };
  permissionProfile: {
    path: string;
    sha256: string;
  };
  expectedTools: string[];
  reviewText: string;
}

export interface AmbientMcpServerInstallResult {
  status: "installed" | "already-installed" | "blocked" | "runtime-preflight-failed" | "default-capability-gate-failed";
  serverId: string;
  workloadName?: string;
  message: string;
  installed?: AmbientMcpInstalledServerSummary[];
  defaultCapabilities?: AmbientMcpDefaultCapabilitySummary[];
  adoptedExistingWorkload?: boolean;
  runtimeStatus?: AmbientMcpContainerRuntimeStatusKind;
  permissionProfile?: {
    path: string;
    sha256: string;
  };
  exitCode?: number;
  durationMs?: number;
}

export interface AmbientMcpDefaultCapabilityInstallInput {
  capabilityId: "scrapling";
}

export type AmbientMcpDefaultCapabilityInstallProgressPhase =
  | "approval-requested"
  | "approval-granted"
  | "state-updated"
  | "image-resolving"
  | "image-resolved"
  | "image-pull-started"
  | "image-pull-succeeded"
  | "toolhive-run-started"
  | "waiting-workload"
  | "completed"
  | "failed";

export interface AmbientMcpDefaultCapabilityInstallProgress {
  schemaVersion: "ambient-mcp-default-capability-install-progress-v1";
  capabilityId: "scrapling";
  title: string;
  workloadName: string;
  phase: AmbientMcpDefaultCapabilityInstallProgressPhase;
  status: "running" | "succeeded" | "failed";
  message: string;
  image?: string;
  resolvedImage?: string;
  runtime?: string;
  recordedAt: string;
}

export type AmbientMcpContainerRuntimeStatusKind =
  | "ready"
  | "installed-not-running"
  | "missing"
  | "unsupported"
  | "blocked-by-permissions"
  | "blocked-by-policy";

export type AmbientMcpContainerRuntimeProbeReason =
  | "none"
  | "runtime-missing"
  | "toolhive-unavailable"
  | "permission-denied"
  | "probe-timeout"
  | "daemon-unreachable"
  | "desktop-app-not-responding"
  | "machine-stopped"
  | "wsl-unavailable"
  | "toolhive-runtime-unavailable"
  | "policy-blocked"
  | "unknown-error";

export type AmbientMcpContainerRuntimeNextAction =
  | "none"
  | "install-runtime"
  | "start-runtime"
  | "repair-permissions"
  | "repair-toolhive"
  | "open-settings";

export type AmbientMcpContainerRuntimeInstallActionKind = "open-installer" | "open-documentation" | "open-runtime" | "managed-install";

export type AmbientMcpContainerRuntimeInstallRuntime = "podman" | "docker";

export type AmbientMcpContainerRuntimeManagedInstallExecution = "user-command" | "privileged-action";

export interface AmbientMcpContainerRuntimeManagedInstallCommand {
  exe: string;
  args: string[];
  cwd?: string;
  rationale: string;
}

export type AmbientMcpContainerRuntimeManagedInstallProgressPhase =
  | "dry-run-ready"
  | "starting"
  | "privileged-boundary"
  | "command-started"
  | "command-succeeded"
  | "command-failed"
  | "log-written"
  | "completed";

export interface AmbientMcpContainerRuntimeManagedInstallSpec {
  schemaVersion: "ambient-container-runtime-managed-install-v1";
  execution: AmbientMcpContainerRuntimeManagedInstallExecution;
  strategy: string;
  packageName: string;
  platform: "darwin" | "linux" | "win32";
  requiresCredential: boolean;
  commands: AmbientMcpContainerRuntimeManagedInstallCommand[];
  fallbackActionIds: string[];
}

export interface AmbientMcpContainerRuntimeManagedInstallResult {
  status: PrivilegedActionAdapterResultStatus;
  message: string;
  adapter?: string;
  requestId?: string;
  commandCount?: number;
  credentialCapture?: string;
  logPath?: string;
  stdoutPreview?: string;
  stderrPreview?: string;
  redactedCommands?: AmbientMcpContainerRuntimeManagedInstallCommand[];
}

export interface AmbientMcpContainerRuntimeManagedInstallProgress {
  schemaVersion: "ambient-container-runtime-managed-install-progress-v1";
  actionId: string;
  actionLabel: string;
  runtime: AmbientMcpContainerRuntimeInstallRuntime;
  phase: AmbientMcpContainerRuntimeManagedInstallProgressPhase;
  message: string;
  adapter?: string;
  requestId?: string;
  commandIndex?: number;
  commandCount?: number;
  command?: AmbientMcpContainerRuntimeManagedInstallCommand;
  status?: PrivilegedActionAdapterResultStatus;
  logPath?: string;
  recordedAt: string;
}

export interface AmbientMcpContainerRuntimeInstallAction {
  id: string;
  label: string;
  kind: AmbientMcpContainerRuntimeInstallActionKind;
  runtime: AmbientMcpContainerRuntimeInstallRuntime;
  url: string;
  reason: string;
  applicationNames?: string[];
  managedInstall?: AmbientMcpContainerRuntimeManagedInstallSpec;
}

export interface AmbientMcpContainerRuntimeInstallPlan {
  schemaVersion: "ambient-container-runtime-install-plan-v1";
  platform: string;
  arch: string;
  status: AmbientMcpContainerRuntimeStatusKind | "unknown";
  preferredRuntime: AmbientMcpContainerRuntimeInstallRuntime;
  summary: string;
  primaryAction: AmbientMcpContainerRuntimeInstallAction;
  alternatives: AmbientMcpContainerRuntimeInstallAction[];
  prerequisites: string[];
  warnings: string[];
  postInstallSteps: string[];
}

export interface AmbientMcpContainerRuntimeInstallLaunchInput {
  actionId?: string;
  mode?: "execute" | "dry-run";
}

export interface AmbientMcpContainerRuntimeInstallLaunchResult {
  schemaVersion: "ambient-container-runtime-install-launch-v1";
  launched: true;
  action: AmbientMcpContainerRuntimeInstallAction;
  plan: AmbientMcpContainerRuntimeInstallPlan;
  message: string;
  managedResult?: AmbientMcpContainerRuntimeManagedInstallResult;
}

export type AmbientMcpContainerRuntimeLifecycleAction =
  | "restart"
  | "force-quit-and-restart"
  | "open-recovery";

export type AmbientMcpContainerRuntimeLifecyclePhase =
  | "previewed"
  | "graceful-stop-started"
  | "graceful-stop-failed"
  | "force-stop-started"
  | "launch-started"
  | "probe-poll"
  | "ready"
  | "failed";

export type AmbientMcpContainerRuntimeLifecycleStatus =
  | "preview"
  | "running"
  | "ready"
  | "blocked"
  | "failed";

export interface AmbientMcpContainerRuntimeLifecycleCommand {
  exe: string;
  candidateExecutables?: string[];
  args: string[];
  cwd?: string;
  rationale: string;
  destructive: boolean;
}

export interface AmbientMcpContainerRuntimeLifecycleTarget {
  kind: "application" | "process" | "machine" | "service" | "documentation";
  runtime: "docker" | "podman" | "colima";
  label: string;
  identifier: string;
  platform: string;
  verified: boolean;
  reason: string;
}

export interface AmbientMcpContainerRuntimeLifecyclePreview {
  schemaVersion: "ambient-container-runtime-lifecycle-preview-v1";
  previewId: string;
  action: AmbientMcpContainerRuntimeLifecycleAction;
  runtime: "docker" | "podman" | "colima";
  platform: string;
  status: "available" | "blocked";
  reason: AmbientMcpContainerRuntimeProbeReason;
  summary: string;
  requiresConfirmation: boolean;
  warnings: string[];
  targets: AmbientMcpContainerRuntimeLifecycleTarget[];
  commands: AmbientMcpContainerRuntimeLifecycleCommand[];
  expectedInterruption: string;
  createdAt: string;
}

export interface AmbientMcpContainerRuntimeLifecyclePreviewInput {
  action: AmbientMcpContainerRuntimeLifecycleAction;
  runtime?: "docker" | "podman" | "colima";
}

export interface AmbientMcpContainerRuntimeLifecycleRunInput {
  action: AmbientMcpContainerRuntimeLifecycleAction;
  runtime?: "docker" | "podman" | "colima";
  expectedPreviewId?: string;
  confirmForce?: boolean;
}

export interface AmbientMcpContainerRuntimeLifecycleProgress {
  schemaVersion: "ambient-container-runtime-lifecycle-progress-v1";
  action: AmbientMcpContainerRuntimeLifecycleAction;
  runtime: "docker" | "podman" | "colima";
  phase: AmbientMcpContainerRuntimeLifecyclePhase;
  status: "running" | "succeeded" | "failed";
  message: string;
  command?: AmbientMcpContainerRuntimeLifecycleCommand;
  target?: AmbientMcpContainerRuntimeLifecycleTarget;
  pollCount?: number;
  logPath?: string;
  recordedAt: string;
}

export interface AmbientMcpContainerRuntimeLifecycleResult {
  schemaVersion: "ambient-container-runtime-lifecycle-result-v1";
  action: AmbientMcpContainerRuntimeLifecycleAction;
  runtime: "docker" | "podman" | "colima";
  status: AmbientMcpContainerRuntimeLifecycleStatus;
  reason: AmbientMcpContainerRuntimeProbeReason;
  message: string;
  preview?: AmbientMcpContainerRuntimeLifecyclePreview;
  before?: AmbientMcpContainerRuntimeStatus;
  after?: AmbientMcpContainerRuntimeStatus;
  progress: AmbientMcpContainerRuntimeLifecycleProgress[];
  logPath?: string;
  durationMs: number;
}

export type AmbientMcpContainerRuntimeSetupDecision = "none" | "deferred" | "install-launched";

export interface AmbientMcpContainerRuntimeSetupState {
  userDecision: AmbientMcpContainerRuntimeSetupDecision;
  shouldPrompt: boolean;
  promptSuppressed: boolean;
  reason: "runtime-ready" | "runtime-not-missing" | "user-deferred" | "install-launched" | "runtime-missing" | "toolhive-needs-repair";
  lastDecisionAt?: string;
  installActionId?: string;
  installRuntime?: string;
  installUrl?: string;
  upgradeReconciledAppVersion?: string;
}

export interface AmbientMcpContainerRuntimeHostStatus {
  kind: "docker" | "podman" | "colima" | "wsl2";
  status: "ready" | "installed" | "installed-not-running" | "permission-blocked" | "missing" | "error";
  reason?: AmbientMcpContainerRuntimeProbeReason;
  version?: string;
  message: string;
}

export interface AmbientMcpContainerRuntimeProcessHint {
  kind: "docker" | "podman" | "colima" | "wsl2";
  pid?: number;
  processName: string;
  executablePath?: string;
  applicationPath?: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export type AmbientMcpDefaultCapabilityStatus =
  | "not_configured"
  | "blocked_runtime"
  | "blocked_descriptor"
  | "blocked_approval"
  | "warming_up"
  | "installing"
  | "installed"
  | "needs_review"
  | "failed";

export type AmbientMcpDefaultCapabilityNextAction =
  | "none"
  | "install-runtime"
  | "approve-default-capability"
  | "install-default-capability"
  | "review-descriptor"
  | "inspect-failure";

export interface AmbientMcpDefaultCapabilitySummary {
  schemaVersion: "ambient-mcp-default-capability-v1";
  capabilityId: "scrapling";
  title: string;
  status: AmbientMcpDefaultCapabilityStatus;
  nextAction: AmbientMcpDefaultCapabilityNextAction;
  message: string;
  serverId?: string;
  workloadName: string;
  descriptorHash?: string;
  image?: string;
  imageDigest?: string;
  runtimeStatus: AmbientMcpContainerRuntimeStatusKind;
  installedWorkloadStatus?: string;
  installedEndpoint?: string;
  unhealthySince?: string;
  retryAfter?: string;
  lastReconciledAt: string;
  appVersion: string;
}

export interface AmbientMcpContainerRuntimeStatus {
  schemaVersion: "ambient-container-runtime-probe-v1";
  status: AmbientMcpContainerRuntimeStatusKind;
  runtime?: "docker" | "podman" | "colima" | "unknown";
  platform: string;
  arch: string;
  checkedAt: string;
  durationMs: number;
  message: string;
  reason?: AmbientMcpContainerRuntimeProbeReason;
  nextAction: AmbientMcpContainerRuntimeNextAction;
  toolHive: {
    status: "ready" | "missing" | "error";
    message: string;
    preflightOk?: boolean;
    versionLine?: string;
  };
  hosts: AmbientMcpContainerRuntimeHostStatus[];
  processHints?: AmbientMcpContainerRuntimeProcessHint[];
  setup: AmbientMcpContainerRuntimeSetupState;
  postInstallQueue: Array<{
    kind: "default-capability";
    capabilityId: "scrapling";
    status: "queued" | "blocked";
  }>;
  defaultCapabilities: AmbientMcpDefaultCapabilitySummary[];
  installPlan?: AmbientMcpContainerRuntimeInstallPlan;
}

export interface AmbientMcpServerUninstallResult {
  status: "removed";
  serverId: string;
  workloadName: string;
  message: string;
  installed: AmbientMcpInstalledServerSummary[];
  stopExitCode?: number;
  removeExitCode?: number;
  durationMs?: number;
}

export interface AmbientMcpToolReviewAcceptResult {
  status: "trusted" | "already-trusted";
  serverId: string;
  workloadName: string;
  message: string;
  descriptorHash?: string;
  installed: AmbientMcpInstalledServerSummary[];
}

export interface ListAmbientPluginRuntimeCapabilitiesInput {
  runtime: AmbientPluginRuntime;
}

export interface GetAmbientPluginCapabilityDiagnosticsInput {
  capabilityId: string;
}

export interface AmbientPluginCapabilityDiagnostics {
  capabilityId: string;
  capability?: AmbientPluginCapabilitySummary;
  plugin?: AmbientPluginSummary;
  diagnostics: string[];
  availabilityReason?: string;
}

export interface SetCodexPluginEnabledInput {
  pluginId: string;
  enabled: boolean;
}

export interface SetCodexPluginTrustedInput {
  pluginId: string;
  trusted: boolean;
}

export interface ImportCodexPluginInput {
  pluginId: string;
}

export interface ReadCodexPluginInput {
  pluginId: string;
}

export interface AddCodexMarketplaceInput {
  source: string;
  name?: string;
  allowExperimental?: boolean;
}

export interface RemoveCodexMarketplaceInput {
  source: string;
}

export interface UninstallCodexPluginInput {
  pluginId: string;
}

export interface InstallCodexPluginDependenciesInput {
  pluginId: string;
}

export interface CodexPluginDependencyInstallResult {
  pluginId: string;
  pluginName: string;
  manager: CodexPluginDependencyStatus["manager"];
  command: string[];
  cwd: string;
  installedAt: string;
  stdout?: string;
  stderr?: string;
  stdoutArtifactPath?: string;
  stdoutArtifactBytes?: number;
  stdoutChars?: number;
  stdoutPreviewChars?: number;
  stderrArtifactPath?: string;
  stderrArtifactBytes?: number;
  stderrChars?: number;
  stderrPreviewChars?: number;
}

export interface SaveAmbientCliSecretInput {
  packageId?: string;
  packageName?: string;
  builderSourcePath?: string;
  mcpServerId?: string;
  mcpCandidateId?: string;
  mcpCandidateRef?: string;
  envName: string;
  value: string;
}

export interface AmbientCliSecretSaveResult {
  packageId?: string;
  packageName: string;
  builderSourcePath?: string;
  mcpServerId?: string;
  mcpCandidateId?: string;
  mcpCandidateRef?: string;
  ownerId?: string;
  envName: string;
  source: "file" | "managed-secret";
  filePath?: string;
  secretRef?: string;
  configured: boolean;
}
