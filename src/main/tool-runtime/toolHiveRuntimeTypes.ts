import type { ResolveToolHiveExecutableOptions } from "./toolHiveBundle";
import type { McpManagedFileExchange } from "./toolRuntimeMcpManagedFileExchangeFacade";
import type {
  ToolHiveCommandExecutor,
  ToolHiveCommandResult,
  ToolHiveOperationProgress,
} from "./toolHiveCommandRunner";

export interface ToolHiveRuntimeServiceOptions extends ResolveToolHiveExecutableOptions {
  userDataPath: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  executor?: ToolHiveCommandExecutor;
  now?: () => Date;
  timeoutMs?: number;
}

export interface ToolHivePermissionProfileWriteInput {
  serverId: string;
  workloadName: string;
  profile: Record<string, unknown>;
}

export interface ToolHivePermissionProfileWriteResult {
  path: string;
  sha256: string;
}

export interface ToolHivePermissionProfileReadResult {
  server: ToolHiveInstalledServerState;
  profile: Record<string, unknown>;
  path: string;
  sha256: string;
  expectedSha256: string;
  sha256Verified: boolean;
}

export interface ToolHiveRunRegistryServerInput {
  serverId: string;
  workloadName: string;
  permissionProfile: Record<string, unknown>;
  registrySource?: string;
  sourceIdentity?: ToolHiveInstalledServerSourceIdentity;
  defaultCatalogDescriptorHash?: string;
  defaultCatalogReviewedAt?: string;
  installReview?: ToolHiveInstallReviewState;
  secretBindings?: ToolHiveSecretBindingState[];
  transport?: "stdio" | "streamable-http" | "sse";
  proxyMode?: "streamable-http" | "sse";
  imageVerificationPolicy?: ToolHiveImageVerificationPolicy;
  serverArgs?: string[];
  volumes?: ToolHiveRunVolume[];
}

export interface ToolHiveRunStandardMcpImportInput {
  serverId: string;
  workloadName: string;
  sourceRef: string;
  registrySource?: string;
  sourceIdentity?: ToolHiveInstalledServerSourceIdentity;
  defaultCatalogDescriptorHash?: string;
  defaultCatalogReviewedAt?: string;
  installReview?: ToolHiveInstallReviewState;
  secretBindings?: ToolHiveSecretBindingState[];
  permissionProfile: Record<string, unknown>;
  transport?: "stdio" | "streamable-http" | "sse";
  proxyMode?: "streamable-http" | "sse";
  imageVerificationPolicy?: ToolHiveImageVerificationPolicy;
  serverArgs?: string[];
  runtimeImage?: string;
  envVars?: ToolHivePlainEnvVar[];
  volumes?: ToolHiveRunVolume[];
  onProgress?: (progress: ToolHiveOperationProgress) => void;
}

export interface ToolHiveAdoptStandardMcpImportWorkloadInput extends ToolHiveRunStandardMcpImportInput {
  endpoint?: string;
}

export interface ToolHiveBuildProtocolImageInput {
  sourceRef: string;
  tag: string;
  serverArgs?: string[];
  runtimeImage?: string;
}

export interface ToolHiveRunRemoteMcpProxyInput {
  serverId: string;
  workloadName: string;
  remoteUrl: string;
  registrySource?: string;
  sourceIdentity?: ToolHiveInstalledServerSourceIdentity;
  installReview?: ToolHiveInstallReviewState;
  secretBindings?: ToolHiveSecretBindingState[];
  permissionProfile: Record<string, unknown>;
  transport: "streamable-http" | "sse";
  proxyMode?: "streamable-http" | "sse";
}

export interface ToolHiveRegisterGuidedLocalBridgeInput {
  serverId: string;
  workloadName: string;
  endpoint: string;
  registrySource?: string;
  sourceIdentity?: ToolHiveInstalledServerSourceIdentity;
  installReview?: ToolHiveInstallReviewState;
  secretBindings?: ToolHiveSecretBindingState[];
  permissionProfile: Record<string, unknown>;
}

export interface ToolHiveRegistryListOptions {
  refresh?: boolean;
}

export interface ToolHiveRegistryInfoOptions {
  refresh?: boolean;
}

export interface ToolHiveListWorkloadsOptions {
  all?: boolean;
  group?: string;
}

export interface ToolHiveWaitForWorkloadOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  requireEndpoint?: boolean;
}

export interface ToolHiveRuntimePreflight {
  ok: boolean;
  message: string;
  command: ToolHiveCommandResult;
}

export interface ToolHiveWorkloadSummary {
  name?: string;
  status?: string;
  group?: string;
  endpoint?: string;
  raw: unknown;
}

export type ToolHiveToolDescriptorReviewStatus = "trusted" | "needs-review";
export type ToolHiveMcpToolVisibility = "visible" | "hidden";
export type ToolHiveMcpToolCallPolicy = "default" | "blocked" | "approval-required";
export type ToolHiveInstalledRuntimeLane =
  | "ambient-default-oci"
  | "toolhive-registry"
  | "standard-mcp-import"
  | "remote-mcp-proxy"
  | "guided-local-bridge"
  | "unknown";
export type ToolHiveInstalledReviewStatus = "reviewed" | "needs-review";
export type ToolHiveInstallValidationStatus = "validation_pending" | "ready" | "validation_failed";
export type ToolHiveImageVerificationPolicy = "strict" | "warn" | "ambient-reviewed" | "disabled";

export interface ToolHivePlainEnvVar {
  name: string;
  value: string;
}

export interface ToolHiveRunVolume {
  hostPath: string;
  containerPath: string;
  mode: "ro" | "rw";
  purpose?: string;
}

export interface ToolHiveMcpToolPolicy {
  visibility?: ToolHiveMcpToolVisibility;
  callPolicy?: ToolHiveMcpToolCallPolicy;
  reason?: string;
  updatedAt: string;
}

export interface ToolHiveInstalledServerSourceIdentity {
  runtimeLane: ToolHiveInstalledRuntimeLane;
  sourceKind?: string;
  sourceUrl?: string;
  sourceResolvedCommit?: string;
  registryId?: string;
  packageName?: string;
  packageRegistryType?: string;
  packageIdentifier?: string;
  packageVersion?: string;
  packageDigest?: string;
  packageSha256?: string;
  sourceBuildRecipeKind?: string;
  sourceBuildRecipeHash?: string;
  toolHiveRunSource?: string;
  candidateId?: string;
  candidateRef?: string;
  candidateHash?: string;
  riskLevel?: "low" | "medium" | "high";
}

export type ToolHiveSecretDerivedBindingKind = "container-env-file" | "remote-bearer-token-file";

export interface ToolHiveSecretDerivedBindingState {
  id: string;
  kind: ToolHiveSecretDerivedBindingKind;
  envName: string;
  secretRef: string;
  runtimeName: string;
  target?: string;
}

export interface ToolHiveSecretBindingState {
  envName: string;
  secretRef: string;
  derivedBindings?: ToolHiveSecretDerivedBindingState[];
}

export interface ToolHiveInstallReviewState {
  status: ToolHiveInstalledReviewStatus;
  outcome?: string;
  reviewedAt?: string;
  summary?: string;
  warningCount?: number;
  blockerCount?: number;
}

export interface ToolHiveInstalledServerState {
  serverId: string;
  workloadName: string;
  activeRevisionId?: string;
  endpoint?: string;
  registrySource?: string;
  sourceIdentity?: ToolHiveInstalledServerSourceIdentity;
  defaultCatalogDescriptorHash?: string;
  defaultCatalogReviewedAt?: string;
  installReview?: ToolHiveInstallReviewState;
  secretBindings?: ToolHiveSecretBindingState[];
  imageVerificationPolicy?: ToolHiveImageVerificationPolicy;
  permissionProfilePath: string;
  permissionProfileSha256: string;
  lastKnownToolDescriptors?: unknown[];
  lastKnownToolDescriptorHash?: string;
  lastToolDiscoveryAt?: string;
  installValidationStatus?: ToolHiveInstallValidationStatus;
  installValidationError?: string;
  installValidationAt?: string;
  toolDescriptorReviewStatus?: ToolHiveToolDescriptorReviewStatus;
  toolDescriptorReviewReason?: string;
  toolPolicies?: Record<string, ToolHiveMcpToolPolicy>;
  runtimeVolumes?: ToolHiveRunVolume[];
  managedFileExchange?: McpManagedFileExchange;
  createdAt: string;
  updatedAt: string;
  lastRunCommand?: string[];
}

export interface ToolHiveToolDescriptorSnapshotResult {
  state: ToolHiveInstalledServerState;
  changed: boolean;
  previousHash?: string;
  descriptorHash: string;
}

export interface ToolHiveToolDescriptorTrustResult {
  state: ToolHiveInstalledServerState;
  descriptorHash: string;
  wasReviewRequired: boolean;
}

export interface ToolHiveRuntimeState {
  schemaVersion: "ambient-toolhive-runtime-state-v1";
  installedServers: ToolHiveInstalledServerState[];
}
