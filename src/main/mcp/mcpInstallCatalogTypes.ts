import type {
  McpAutowireCandidate,
  McpAutowireValidationReport,
  McpInstallReview,
  ToolHiveRunPlan,
} from "./mcpAutowireFacade";
import type { McpDefaultCatalogDescriptor } from "./mcpDefaultCatalog";
import type { McpSecretBinding, McpStandardImportPreview } from "./mcpInstallCatalogStandardImportPreview";
import type { ToolHiveRunVolume, ToolHiveSecretDerivedBindingKind } from "./mcpToolRuntimeFacade";

export interface McpServerSearchInput {
  query?: string;
  limit?: number;
  refresh?: boolean;
}

export interface McpServerSearchResult {
  serverId: string;
  title: string;
  description: string;
  catalogSource: McpCatalogSource;
  status?: string;
  tier?: string;
  transport?: string;
  repositoryUrl?: string;
  tags: string[];
  tools: string[];
  installed: boolean;
  workloadName?: string;
  riskHints: string[];
  nextAction?: string;
}

export interface McpRegistryInstallPreviewInput {
  serverId: string;
  refresh?: boolean;
  secretBindings?: McpSecretBinding[];
  runtimeVolumes?: ToolHiveRunVolume[];
}

export interface McpRegistryInstallPreview {
  serverId: string;
  catalogSource: McpCatalogSource;
  defaultDescriptor?: McpDefaultCatalogDescriptor;
  registryInfo: Record<string, unknown>;
  candidate: McpAutowireCandidate;
  validation: McpAutowireValidationReport;
  review: McpInstallReview;
  runPlan?: ToolHiveRunPlan;
  toolHiveVolumes: ToolHiveRunVolume[];
  permissionProfile: {
    path: string;
    sha256: string;
    profile: Record<string, unknown>;
  };
}

export interface McpRemoteMcpProxyPreviewInput {
  candidate: unknown;
  expectedCandidateHash?: string;
  secretBindings?: McpSecretBinding[];
}

export interface McpRemoteMcpProxyPreview {
  serverId: string;
  catalogSource: "remote-mcp-proxy";
  candidate: McpAutowireCandidate;
  validation: McpAutowireValidationReport;
  review: McpInstallReview;
  runPlan?: ToolHiveRunPlan;
  toolHiveRemoteUrl?: string;
  permissionProfile: {
    path: string;
    sha256: string;
    profile: Record<string, unknown>;
  };
}

export interface McpDefaultCapabilityInstallPreview {
  serverId: string;
  capabilityId: "scrapling";
  catalogSource: "ambient-default";
  defaultDescriptor: McpDefaultCatalogDescriptor;
  registryInfo: Record<string, unknown>;
  candidate: McpAutowireCandidate;
  validation: McpAutowireValidationReport;
  review: McpInstallReview;
  runPlan?: ToolHiveRunPlan;
  toolHiveRunSource?: string;
  toolHiveServerArgs: string[];
  permissionProfile: {
    path: string;
    sha256: string;
    profile: Record<string, unknown>;
  };
}

export type McpInstallPreview = McpRegistryInstallPreview | McpStandardImportPreview | McpRemoteMcpProxyPreview;

export type McpCatalogSource =
  | "ambient-default"
  | "toolhive-registry"
  | "ambient-default+toolhive-registry"
  | "ambient-recommended-standard-import";

export interface McpInstalledServerSummary {
  serverId: string;
  workloadName: string;
  activeRevisionId?: string;
  registrySource?: string;
  runtimeLane?: string;
  sourceKind?: string;
  sourceUrl?: string;
  sourceResolvedCommit?: string;
  registryId?: string;
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
  riskLevel?: string;
  defaultCatalogUpdateStatus?: "current" | "update-available" | "untracked";
  defaultCatalogDescriptorHash?: string;
  installedDefaultCatalogDescriptorHash?: string;
  defaultCatalogReviewedAt?: string;
  installReviewStatus?: string;
  installReviewOutcome?: string;
  installReviewSummary?: string;
  imageVerificationPolicy?: string;
  secretBindingCount?: number;
  secretBindingEnvNames?: string[];
  derivedSecretBindingCount?: number;
  derivedSecretBindingKinds?: ToolHiveSecretDerivedBindingKind[];
  permissionProfilePath: string;
  permissionProfileSha256: string;
  createdAt: string;
  updatedAt: string;
  workloadStatus?: string;
  endpoint?: string;
  installValidationStatus?: string;
  installValidationError?: string;
  installValidationAt?: string;
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

export interface McpUnmanagedToolHiveWorkloadSummary {
  workloadName: string;
  status?: string;
  endpoint?: string;
  group?: string;
  reason: string;
  nextAction: string;
}

export interface McpInstalledServerInventory {
  servers: McpInstalledServerSummary[];
  unmanagedWorkloads: McpUnmanagedToolHiveWorkloadSummary[];
}

export interface McpDefaultCatalogUpdateDiff {
  field: string;
  installed?: string;
  current: string;
  impact: "runtime" | "source" | "permissions" | "tools" | "secrets" | "review" | "state";
}

export interface McpDefaultCatalogUpdatePreview {
  serverId: string;
  workloadName: string;
  status: "current" | "update-available" | "untracked";
  currentDescriptorHash: string;
  installedDescriptorHash?: string;
  currentReviewedAt: string;
  installedReviewedAt?: string;
  title: string;
  description: string;
  sourceUrl?: string;
  registrySource?: string;
  runtimeLane?: string;
  diffs: McpDefaultCatalogUpdateDiff[];
  nextAction: string;
}
