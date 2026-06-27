import type {
  LocalRuntimeProviderLifecycleControls,
  VoiceOutputFormat,
  VoiceProviderCloningMetadata,
  VoiceProviderDiscoveryMetadata,
} from "../../shared/localRuntimeTypes";
import type {
  CommandDevicePolicy,
  CommandDeviceSelection,
  CommandTimeoutProfile,
  MaterializedTextOutput,
} from "./ambientCliToolRuntimeFacade";
import type { AmbientCliPiCatalogResolution } from "./ambientCliPiCatalogAdapter";
import { ambientCliSkillSummarySchemaVersion } from "./ambientCliPackageSkillSummaries";

export interface AmbientCliPackageCommand {
  name: string;
  description?: string;
  command: string;
  args: string[];
  cwd: "workspace" | "package";
  healthCheck?: string[];
  timeoutProfile?: CommandTimeoutProfile;
  progressPatterns?: string[];
  devicePolicy?: CommandDevicePolicy;
  voiceProvider?: AmbientCliVoiceProviderCommandMetadata;
  sttProvider?: AmbientCliSttProviderCommandMetadata;
  embeddingProvider?: AmbientCliEmbeddingProviderCommandMetadata;
}

export interface AmbientCliVoiceProviderCommandMetadata {
  label?: string;
  defaultFormat: VoiceOutputFormat;
  formats: VoiceOutputFormat[];
  voices: Array<{ id: string; label?: string }>;
  local?: boolean;
  voiceDiscovery?: VoiceProviderDiscoveryMetadata;
  voiceCloning?: VoiceProviderCloningMetadata;
  runtimeLifecycle?: LocalRuntimeProviderLifecycleControls;
}

export interface AmbientCliSttProviderCommandMetadata {
  label?: string;
  languages: string[];
  defaultLanguage?: string;
  local?: boolean;
}

export interface AmbientCliEmbeddingProviderCommandMetadata {
  label?: string;
  modelId?: string;
  dimensions?: number;
  local?: boolean;
  runtimeLifecycle?: LocalRuntimeProviderLifecycleControls;
}

export interface AmbientCliPackageEnvRequirement {
  name: string;
  description?: string;
  required: boolean;
}

export interface AmbientCliPackageEnvStatus extends AmbientCliPackageEnvRequirement {
  configured: boolean;
  source?: "process" | "file" | "managed-secret";
  filePath?: string;
  secretRef?: string;
  error?: string;
}

export interface AmbientCliPackageEnvBindingInput {
  packageName: string;
  envName: string;
  filePath: string;
}

export interface AmbientCliPackageSecretInput {
  packageName: string;
  envName: string;
  value: string;
}

export interface AmbientCliPackageHealthCheckResult {
  commandName: string;
  command: string[];
  cwd: string;
  passed: boolean;
  stdout?: string;
  stderr?: string;
  stdoutOutput?: MaterializedTextOutput;
  stderrOutput?: MaterializedTextOutput;
  error?: string;
  timeoutProfile?: CommandTimeoutProfile;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  lastProgressAt?: string;
  deviceSelection?: CommandDeviceSelection;
  cached?: boolean;
  checkedAt?: string;
  cacheAgeMs?: number;
}

export interface AmbientCliPackageDependencyInstallResult {
  manager: "npm";
  command: string[];
  cwd: string;
  attempted: boolean;
  passed: boolean;
  skipped?: boolean;
  reason?: string;
  stdout?: string;
  stderr?: string;
  stdoutOutput?: MaterializedTextOutput;
  stderrOutput?: MaterializedTextOutput;
  error?: string;
}

export interface AmbientCliPackageSkill {
  name: string;
  description?: string;
  path: string;
}

export type AmbientCliCapabilitySourceKind = "ambient-cli";
export type AmbientCliCapabilityKind = "package" | "skill" | "tool";

export function ambientCliCapabilityId(packageId: string, kind: AmbientCliCapabilityKind, key: string): string {
  return `${packageId}:${kind}:${key}`;
}

export function ambientCliRegistryPluginId(packageId: string): string {
  return `cli:${packageId}`;
}

export type AmbientCliSkillSummaryStatus = "available" | "missing" | "stale" | "failed" | "not_requested";

export interface AmbientCliSkillSummary {
  schemaVersion: typeof ambientCliSkillSummarySchemaVersion;
  packageId: string;
  packageName: string;
  packageSource: string;
  packageVersion?: string;
  skillPath: string;
  rawSkillHash: string;
  generatedAt: string;
  capabilityBrief: string;
  whenToUse: string[];
  commands: Record<string, string>;
  arguments: string[];
  safety: string[];
  fallbacks: string[];
}

export interface AmbientCliSkillSummaryFailure {
  schemaVersion: typeof ambientCliSkillSummarySchemaVersion;
  status: "failed";
  packageId: string;
  packageName: string;
  packageSource: string;
  packageVersion?: string;
  skillPath: string;
  rawSkillHash: string;
  failedAt: string;
  retryAfter: string;
  error: string;
}

export interface AmbientCliPackageSummary {
  id: string;
  name: string;
  version?: string;
  description?: string;
  rootPath: string;
  source: string;
  installed: boolean;
  skills: AmbientCliPackageSkill[];
  commands: AmbientCliPackageCommand[];
  healthChecks?: AmbientCliPackageHealthCheckResult[];
  envRequirements: AmbientCliPackageEnvRequirement[];
  errors: string[];
  generated?: AmbientCliGeneratedPackageMetadata;
}

export interface AmbientCliGeneratedPackageMetadata {
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

export interface AmbientCliPackageCatalog {
  packages: AmbientCliPackageSummary[];
  errors: string[];
}

export interface FirstPartyAmbientCliPackageInstallStatus {
  packageName: string;
  source: string;
  status: "installed" | "already_installed" | "failed";
  packageId?: string;
  error?: string;
}

export interface EnsureFirstPartyAmbientCliPackagesOptions {
  onStatus?: (status: FirstPartyAmbientCliPackageInstallStatus) => void;
  packageNames?: string[];
  bundledPackageRootPath?: string;
}

export interface BundledAmbientCliPackageRootCandidateOptions {
  bundledPackageRootPath?: string;
  cwd?: string;
  env?: Partial<Pick<NodeJS.ProcessEnv, "INIT_CWD" | "PWD">>;
  moduleFilePath?: string;
  resourcesPath?: string;
}

export type AmbientCliPackageHealthCommandFilter = (pkg: AmbientCliPackageSummary, command: AmbientCliPackageCommand) => boolean;

export interface DiscoverAmbientCliPackagesOptions {
  includeHealth?: boolean;
  healthCommandFilter?: AmbientCliPackageHealthCommandFilter;
}

export interface InstallAmbientCliPackageInput {
  source: string;
  path?: string;
  ref?: string;
  sha?: string;
  descriptor?: unknown;
  installDependencies?: boolean;
}

export type PreviewAmbientCliPackageInput = InstallAmbientCliPackageInput;

export interface AmbientCliPackageInstallPreview {
  source: string;
  path?: string;
  ref?: string;
  sha?: string;
  contentHash?: string;
  candidate?: AmbientCliPackageSummary;
  dependencyInstall?: AmbientCliPackageDependencyInstallResult;
  envStatus: AmbientCliPackageEnvStatus[];
  healthChecks: AmbientCliPackageHealthCheckResult[];
  installable: boolean;
  errors: string[];
}

export interface AmbientCliPiCatalogInstallPreview extends AmbientCliPackageInstallPreview {
  resolution?: AmbientCliPiCatalogResolution;
}

export interface UninstallAmbientCliPackageInput {
  packageId: string;
}

export interface RunAmbientCliInput {
  packageId?: string;
  packageName?: string;
  command: string;
  args?: string[];
  cwd?: string;
  executionWorkspacePath?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  env?: Record<string, string | undefined>;
}

export type AmbientCliCapabilitySearchKind = "any" | "package" | "skill" | "command";

export interface AmbientCliCapabilitySearchInput {
  query?: string;
  limit?: number;
  includeUnavailable?: boolean;
  includeHealth?: boolean;
  kind?: AmbientCliCapabilitySearchKind;
  packageId?: string;
  packageName?: string;
  command?: string;
}

export interface AmbientCliCapabilitySearchCommandResult {
  capabilityId: string;
  sourceKind: AmbientCliCapabilitySourceKind;
  name: string;
  description?: string;
  cwd: "workspace" | "package";
  health?: "passed" | "failed" | "unknown";
  risk: string[];
  voiceProvider?: AmbientCliVoiceProviderCommandMetadata;
  sttProvider?: AmbientCliSttProviderCommandMetadata;
  embeddingProvider?: AmbientCliEmbeddingProviderCommandMetadata;
}

export interface AmbientCliCapabilitySearchSkillResult {
  capabilityId: string;
  sourceKind: AmbientCliCapabilitySourceKind;
  name: string;
  description?: string;
  path: string;
}

export interface AmbientCliCapabilitySearchResult {
  packageId: string;
  registryPluginId: string;
  sourceKind: AmbientCliCapabilitySourceKind;
  packageName: string;
  version?: string;
  description?: string;
  installed: boolean;
  availability: "available" | "unavailable";
  availabilityReason: string;
  commands: AmbientCliCapabilitySearchCommandResult[];
  skills: AmbientCliCapabilitySearchSkillResult[];
  missingEnv: string[];
  whyMatched: string[];
  score: number;
}

export interface AmbientCliCapabilitySearchResponse {
  results: AmbientCliCapabilitySearchResult[];
  truncated: boolean;
  catalogVersion: string;
}

export interface DescribeAmbientCliPackageInput {
  packageId?: string;
  packageName?: string;
  command?: string;
  includeSkill?: boolean;
  includeSummary?: boolean;
  maxSkillChars?: number;
}

export interface DescribeAmbientCliPackageOptions {
  includeHealth?: boolean;
  generateMissingSummaries?: boolean;
  modelComplete?: (prompt: string, signal?: AbortSignal) => Promise<string>;
  signal?: AbortSignal;
  now?: () => Date;
}

export type AmbientCliPackageSummaryHydrationOptions = DescribeAmbientCliPackageOptions;

export interface AmbientCliPackageSummaryHydrationResult {
  packageId: string;
  packageName: string;
  attempted: boolean;
  reason?: string;
  summaryStatuses: Array<{
    skillName: string;
    skillPath: string;
    status: AmbientCliSkillSummaryStatus;
    error?: string;
    retryAfter?: string;
  }>;
  availableCount: number;
  failedCount: number;
}

export interface AmbientCliCommandDescription {
  capabilityId: string;
  sourceKind: AmbientCliCapabilitySourceKind;
  name: string;
  description?: string;
  command: string;
  descriptorArgs: string[];
  cwd: "workspace" | "package";
  health?: "passed" | "failed" | "unknown";
  timeoutProfile?: CommandTimeoutProfile;
  progressPatterns?: string[];
  devicePolicy?: CommandDevicePolicy;
  risk: string[];
  voiceProvider?: AmbientCliVoiceProviderCommandMetadata;
  sttProvider?: AmbientCliSttProviderCommandMetadata;
  embeddingProvider?: AmbientCliEmbeddingProviderCommandMetadata;
  invocation: {
    tool: "ambient_cli";
    packageName: string;
    command: string;
    args: string[];
  };
}

export interface AmbientCliSkillDescription {
  capabilityId: string;
  sourceKind: AmbientCliCapabilitySourceKind;
  name: string;
  description?: string;
  path: string;
  summaryStatus: AmbientCliSkillSummaryStatus;
  summary?: AmbientCliSkillSummary;
  summaryError?: string;
  summaryRetryAfter?: string;
  text?: string;
  truncated?: boolean;
}

export interface AmbientCliPackageDescription {
  package: {
    id: string;
    name: string;
    version?: string;
    description?: string;
    source: string;
    installed: boolean;
    availability: "available" | "unavailable";
    availabilityReason: string;
  };
  commands: AmbientCliCommandDescription[];
  skills: AmbientCliSkillDescription[];
  env: AmbientCliPackageEnvStatus[];
  guidance: string[];
  diagnostics: string[];
}

export interface AmbientCliRunResult {
  packageId: string;
  packageName: string;
  commandName: string;
  command: string[];
  cwd: string;
  durationMs: number;
  stdout?: string;
  stderr?: string;
  stdoutOutput?: MaterializedTextOutput;
  stderrOutput?: MaterializedTextOutput;
  timeoutProfile?: CommandTimeoutProfile;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  lastProgressAt?: string;
  deviceSelection?: CommandDeviceSelection;
}
