import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type {
  EmbeddingProviderCandidate,
  LocalRuntimeProviderLifecycleActionKind,
  LocalRuntimeProviderLifecycleControls,
  SttProviderCandidate,
  VoiceOutputFormat,
  VoiceProviderCandidate,
  VoiceProviderCloningMetadata,
  VoiceProviderDiscoveryMetadata,
} from "../../shared/localRuntimeTypes";
import { isPathInside } from "./ambientCliSessionFacade";
import { executeLambdaRlm, materializeTextOutput, type MaterializedTextOutput } from "../tool-runtime/toolRuntimeAmbientCliContract";
import { ambientRuntimeEnv, managedInstallWorkspacePath, migrateWorkspaceManagedInstallPath } from "../setup/setupAmbientCliContract";
import {
  buildSafeProcessEnv,
  hardenedGitEnv,
  redactGitSourceCredentials,
  safeGitCloneSource,
} from "../security/securityAmbientCliContract";
import {
  piCatalogAdapterDescriptor,
  resolvePiCatalogCliAdapter,
  writePiCatalogAdapterFiles,
  type AmbientCliPiCatalogResolution,
} from "./ambientCliPiCatalogAdapter";
import { createAmbientCliEnvBindingServices } from "./ambientCliEnvBindings";
import { createAmbientCliPackageInstallSafetyServices } from "./ambientCliPackageInstallSafety";
import {
  commandTimeoutProfileNames,
  executeProfiledCommand,
  type CommandDevicePolicy,
  type CommandDeviceSelection,
  type CommandTimeoutProfile,
} from "../tool-runtime/commandExecutionProfiles";
import {
  ambientCliCommandHealth,
  ambientCliEmbeddingProviderAvailabilityReason,
  ambientCliEmbeddingProviderDiagnostics,
  ambientCliEmbeddingProviderHealthPayload,
  ambientCliProviderLifecycleWithPackage,
  ambientCliSttProviderAvailabilityReason,
  ambientCliSttProviderDiagnostics,
  ambientCliSttProviderHealthPayload,
  ambientCliVoiceProviderAvailabilityReason,
  ambientCliVoiceProviderDiagnostics,
  ambientCliVoiceProviderHealthPayload,
  providerFallbackLabel,
  voiceProviderFallbackLabel,
} from "./ambientCliProviderDiagnostics";

export type { AmbientCliPiCatalogResolution } from "./ambientCliPiCatalogAdapter";
export { ambientCliWorkspaceProviderMarkerPath } from "./ambientCliEnvBindings";

const cliPackageConfigPath = ".ambient/cli-packages/packages.json";
const cliPackageImportRoot = ".ambient/cli-packages/imported";
const cliSkillSummaryCacheRoot = ".ambient/cli-packages/summaries";
const cliPackageDescriptorName = "ambient-cli.json";
const packageJsonName = "package.json";
const cliSkillSummarySchemaVersion = "ambient-cli-skill-summary-v1";
const ambientCliPackageHealthCacheTtlMs = 20_000;
const healthCacheIgnoredEnvNames = new Set(["AMBIENT_WORKSPACE_PATH", "AMBIENT_DESKTOP_WORKSPACE"]);

const cliRuntimeLifecycleActionSchema = z
  .object({
    command: z.string().min(1),
    label: z.string().optional(),
    description: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
  })
  .passthrough();

const cliRuntimeLifecycleSchema = z
  .object({
    start: cliRuntimeLifecycleActionSchema.optional(),
    stop: cliRuntimeLifecycleActionSchema.optional(),
    restart: cliRuntimeLifecycleActionSchema.optional(),
  })
  .passthrough();

const cliCommandDevicePolicySchema = z
  .object({
    prefer: z.array(z.string().min(1)).optional(),
    requireReasonWhenCpuForced: z.boolean().optional(),
    cpuReason: z.string().optional(),
    forceCpuReason: z.string().optional(),
    argName: z.string().optional(),
  })
  .passthrough();

const cliCommandSchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    description: z.string().optional(),
    cwd: z.enum(["workspace", "package"]).default("workspace"),
    healthCheck: z.array(z.string()).optional(),
    timeoutProfile: z.enum(commandTimeoutProfileNames).optional(),
    progressPatterns: z.array(z.string().min(1)).optional(),
    devicePolicy: cliCommandDevicePolicySchema.optional(),
    voiceProvider: z
      .object({
        label: z.string().optional(),
        defaultFormat: z.enum(["mp3", "wav", "ogg"]).default("wav"),
        formats: z.array(z.enum(["mp3", "wav", "ogg"])).default(["wav"]),
        voices: z.array(z.object({ id: z.string().min(1), label: z.string().optional() }).passthrough()).default([{ id: "default" }]),
        local: z.boolean().optional(),
        voiceDiscovery: z
          .object({
            command: z.string().min(1),
            cacheTtlSeconds: z.number().int().positive().optional(),
            requiresNetwork: z.boolean().optional(),
            requiresSecret: z.array(z.string().min(1)).optional(),
            source: z.enum(["cloud-api", "local-model-directory", "local-runtime", "custom"]).optional(),
          })
          .passthrough()
          .optional(),
        voiceCloning: z
          .object({
            supported: z.boolean(),
            createCommand: z.string().min(1).optional(),
            statusCommand: z.string().min(1).optional(),
            deleteCommand: z.string().min(1).optional(),
            mode: z.enum(["cloud", "local"]).optional(),
            inputs: z
              .object({
                audioFormats: z.array(z.string().min(1)).default([]),
                minDurationSeconds: z.number().positive().optional(),
                maxDurationSeconds: z.number().positive().optional(),
                minSamples: z.number().int().positive().optional(),
                maxSamples: z.number().int().positive().optional(),
                transcript: z.enum(["required", "optional", "unsupported"]).optional(),
              })
              .passthrough()
              .optional(),
            requiresConsent: z.boolean().optional(),
            requiresSecret: z.array(z.string().min(1)).optional(),
            networkHosts: z.array(z.string().min(1)).optional(),
            costNote: z.string().optional(),
            privacyNote: z.string().optional(),
            output: z
              .object({
                creates: z.array(z.enum(["provider-voice-id", "local-model-asset", "dynamic-cache-voice"])).default([]),
                appearsInDynamicCatalog: z.boolean().optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough()
          .optional(),
        runtimeLifecycle: cliRuntimeLifecycleSchema.optional(),
      })
      .passthrough()
      .optional(),
    sttProvider: z
      .object({
        label: z.string().optional(),
        languages: z.array(z.string().min(1)).default([]),
        defaultLanguage: z.string().optional(),
        local: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    embeddingProvider: z
      .object({
        label: z.string().optional(),
        modelId: z.string().optional(),
        dimensions: z.number().int().positive().optional(),
        local: z.boolean().optional(),
        runtimeLifecycle: cliRuntimeLifecycleSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const cliEnvRequirementSchema = z.union([
  z.string().min(1),
  z
    .object({
      name: z.string().min(1),
      description: z.string().optional(),
      required: z.boolean().default(true),
    })
    .passthrough(),
]);

const cliDescriptorSchema = z
  .object({
    name: z.string().min(1).optional(),
    version: z.string().optional(),
    description: z.string().optional(),
    skills: z.string().default("./skills"),
    env: z.array(cliEnvRequirementSchema).default([]),
    commands: z.record(z.string().min(1), cliCommandSchema).default({}),
  })
  .passthrough();

const packageJsonSchema = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
    description: z.string().optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
    optionalDependencies: z.record(z.string(), z.string()).optional(),
    peerDependencies: z.record(z.string(), z.string()).optional(),
    ambient: z
      .object({
        cli: cliDescriptorSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const cliPackageConfigSchema = z
  .object({
    packages: z.array(z.object({ source: z.string().min(1) })).default([]),
  })
  .passthrough();

const cliSkillSummarySchema = z
  .object({
    schemaVersion: z.literal(cliSkillSummarySchemaVersion),
    packageId: z.string().min(1),
    packageName: z.string().min(1),
    packageSource: z.string().min(1),
    packageVersion: z.string().optional(),
    skillPath: z.string().min(1),
    rawSkillHash: z.string().min(1),
    generatedAt: z.string().min(1),
    capabilityBrief: z.string().min(1),
    whenToUse: z.array(z.string()).default([]),
    commands: z.record(z.string(), z.string()).default({}),
    arguments: z.array(z.string()).default([]),
    safety: z.array(z.string()).default([]),
    fallbacks: z.array(z.string()).default([]),
  })
  .passthrough();

const cliSkillSummaryFailureSchema = z
  .object({
    schemaVersion: z.literal(cliSkillSummarySchemaVersion),
    status: z.literal("failed"),
    packageId: z.string().min(1),
    packageName: z.string().min(1),
    packageSource: z.string().min(1),
    packageVersion: z.string().optional(),
    skillPath: z.string().min(1),
    rawSkillHash: z.string().min(1),
    failedAt: z.string().min(1),
    retryAfter: z.string().min(1),
    error: z.string().min(1),
  })
  .passthrough();

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
  schemaVersion: typeof cliSkillSummarySchemaVersion;
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
  schemaVersion: typeof cliSkillSummarySchemaVersion;
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

export interface PreviewAmbientCliPackageInput extends InstallAmbientCliPackageInput {}

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

export interface AmbientCliPackageSummaryHydrationOptions extends DescribeAmbientCliPackageOptions {}

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

type CliDescriptor = z.infer<typeof cliDescriptorSchema>;
type NormalizedInstallInput = Required<Pick<InstallAmbientCliPackageInput, "source">> &
  Pick<InstallAmbientCliPackageInput, "path" | "ref" | "sha" | "descriptor" | "installDependencies">;

type FirstPartyAmbientCliPackage =
  | {
      packageName: string;
      source: string;
      kind: "pi-catalog";
    }
  | {
      packageName: string;
      source: string;
      kind: "bundled";
      packageDir: string;
      autoInstall?: boolean;
    };
type BundledFirstPartyAmbientCliPackage = Extract<FirstPartyAmbientCliPackage, { kind: "bundled" }>;

const firstPartyAmbientCliPackages: FirstPartyAmbientCliPackage[] = [
  {
    packageName: "youtube-transcript",
    source: "https://github.com/badlogic/pi-skills/blob/main/youtube-transcript/SKILL.md",
    kind: "pi-catalog",
  },
  {
    packageName: "brave-search",
    source: "https://github.com/badlogic/pi-skills/blob/main/brave-search/SKILL.md",
    kind: "pi-catalog",
  },
  {
    packageName: "pi-arxiv",
    source: "https://pi.dev/packages/pi-arxiv?name=arxiv",
    kind: "pi-catalog",
  },
  {
    packageName: "ambient-qwen3-asr",
    source: "bundled:ambient-qwen3-asr",
    kind: "bundled",
    packageDir: "ambient-qwen3-asr",
  },
  {
    packageName: "ambient-faster-whisper-stt",
    source: "bundled:ambient-faster-whisper-stt",
    kind: "bundled",
    packageDir: "ambient-faster-whisper-stt",
  },
  {
    packageName: "ambient-hyperframes",
    source: "bundled:ambient-hyperframes",
    kind: "bundled",
    packageDir: "ambient-hyperframes",
  },
  {
    packageName: "ambient-imagegen",
    source: "bundled:ambient-imagegen",
    kind: "bundled",
    packageDir: "ambient-imagegen",
  },
  {
    packageName: "ambient-tinystyler",
    source: "bundled:ambient-tinystyler",
    kind: "bundled",
    packageDir: "ambient-tinystyler",
    autoInstall: false,
  },
  {
    packageName: "ambient-blockchain",
    source: "bundled:ambient-blockchain",
    kind: "bundled",
    packageDir: "ambient-blockchain",
  },
  {
    packageName: "ambient-minicpm-v-vision",
    source: "bundled:ambient-minicpm-v-vision",
    kind: "bundled",
    packageDir: "ambient-minicpm-v-vision",
    autoInstall: false,
  },
];
const firstPartyAmbientCliPackageInstallLocks = new Map<string, Promise<FirstPartyAmbientCliPackageInstallStatus>>();
const ambientCliPackageDiscoveryLocks = new Map<string, Promise<AmbientCliPackageCatalog>>();
const ambientCliPackageHealthLocks = new Map<string, Promise<AmbientCliPackageHealthCheckResult>>();
const ambientCliPackageHealthCache = new Map<
  string,
  { checkedAt: string; checkedAtMs: number; result: AmbientCliPackageHealthCheckResult }
>();

async function ensureAmbientCliManagedInstallWorkspace(workspacePath: string): Promise<string> {
  await migrateWorkspaceManagedInstallPath(workspacePath, ".ambient/cli-packages");
  return managedInstallWorkspacePath(workspacePath);
}

const ambientCliEnvBindingServices = createAmbientCliEnvBindingServices({
  cliPackageConfigPath,
  ensureAmbientCliManagedInstallWorkspace,
  normalizeEnvName,
  readJson,
  errorMessage,
});

const ambientCliProcessEnv = ambientCliEnvBindingServices.ambientCliProcessEnv;
export const hasAmbientCliWorkspaceProviderDiscoverySignal = ambientCliEnvBindingServices.hasAmbientCliWorkspaceProviderDiscoverySignal;
export const hasAmbientCliWorkspaceProviderMarker = ambientCliEnvBindingServices.hasAmbientCliWorkspaceProviderMarker;
const markAmbientCliWorkspaceProviderState = ambientCliEnvBindingServices.markAmbientCliWorkspaceProviderState;
export const removeAmbientCliPackageEnvBindings = ambientCliEnvBindingServices.removeAmbientCliPackageEnvBindings;
const requiredMissingEnv = ambientCliEnvBindingServices.requiredMissingEnv;
const resolveAmbientCliEnvStatus = ambientCliEnvBindingServices.resolveAmbientCliEnvStatus;
export const saveAmbientCliPackageEnvSecret = ambientCliEnvBindingServices.saveAmbientCliPackageEnvSecret;
export const setAmbientCliPackageEnvBinding = ambientCliEnvBindingServices.setAmbientCliPackageEnvBinding;
export const setAmbientCliPackageSecretBinding = ambientCliEnvBindingServices.setAmbientCliPackageSecretBinding;

const ambientCliPackageInstallSafetyServices = createAmbientCliPackageInstallSafetyServices({
  cliPackageDescriptorName,
  packageJsonName,
  ambientRuntimeEnv: () => ambientRuntimeEnv(),
  gitEnv: () => hardenedGitEnv(ambientRuntimeEnv(process.env, { GIT_TERMINAL_PROMPT: "0" })),
  materializeTextOutput,
  parseDescriptorOverlay: (descriptorOverlay) => cliDescriptorSchema.parse(descriptorOverlay),
  parsePackageJson: (value) => packageJsonSchema.parse(value),
  readJson,
  contentHash,
  stableJson,
  errorMessage,
  isErrno,
  isBundledAmbientCliInstallSource,
  safeGitCloneSource,
});
const ambientCliInstallPinPolicyError = ambientCliPackageInstallSafetyServices.ambientCliInstallPinPolicyError;
const ambientCliPackageIgnoredPathReferenceError = ambientCliPackageInstallSafetyServices.ambientCliPackageIgnoredPathReferenceError;
const ambientCliPackageInstallContentHash = ambientCliPackageInstallSafetyServices.ambientCliPackageInstallContentHash;
const ambientCliPackageInstallContentHashResult = ambientCliPackageInstallSafetyServices.ambientCliPackageInstallContentHashResult;
const ambientCliPackageRootSymlinkError = ambientCliPackageInstallSafetyServices.ambientCliPackageRootSymlinkError;
const ambientCliPackageSymlinkPreflightError = ambientCliPackageInstallSafetyServices.ambientCliPackageSymlinkPreflightError;
const assertAmbientCliPackageRootIsNotSymlink = ambientCliPackageInstallSafetyServices.assertAmbientCliPackageRootIsNotSymlink;
const assertApprovedInstallPreviewInput = ambientCliPackageInstallSafetyServices.assertApprovedInstallPreviewInput;
const assertApprovedInstallPreviewPackage = ambientCliPackageInstallSafetyServices.assertApprovedInstallPreviewPackage;
const gitSourceLabel = ambientCliPackageInstallSafetyServices.gitSourceLabel;
const installAmbientCliPackageDependencies = ambientCliPackageInstallSafetyServices.installAmbientCliPackageDependencies;
const isGitLikeInstallSource = ambientCliPackageInstallSafetyServices.isGitLikeInstallSource;
const previewAmbientCliPackageDependencies = ambientCliPackageInstallSafetyServices.previewAmbientCliPackageDependencies;
const removeAmbientCliPackageIgnoredContent = ambientCliPackageInstallSafetyServices.removeAmbientCliPackageIgnoredContent;
const withClonedCliPackage = ambientCliPackageInstallSafetyServices.withClonedCliPackage;
const withPreviewPackageRoot = ambientCliPackageInstallSafetyServices.withPreviewPackageRoot;
const writeDescriptorOverlay = ambientCliPackageInstallSafetyServices.writeDescriptorOverlay;

function resolveAmbientCliInstallSourcePath(workspacePath: string, installWorkspace: string, source: string): string {
  const fromManagedState = resolve(installWorkspace, source);
  if (source.startsWith("./.ambient/") || source.startsWith(".ambient/") || existsSync(fromManagedState)) return fromManagedState;
  return resolve(workspacePath, source);
}

function resolveAmbientCliPackageSourcePath(workspacePath: string, installWorkspace: string, source: string): string {
  const fromManagedState = resolve(installWorkspace, source);
  if (existsSync(fromManagedState) || source.startsWith("./.ambient/") || source.startsWith(".ambient/")) return fromManagedState;
  return resolve(workspacePath, source);
}

export async function discoverAmbientCliPackages(
  workspacePath: string,
  options: DiscoverAmbientCliPackagesOptions = {},
): Promise<AmbientCliPackageCatalog> {
  const lockKey = options.includeHealth && !options.healthCommandFilter ? resolve(workspacePath) : undefined;
  if (lockKey) {
    const existing = ambientCliPackageDiscoveryLocks.get(lockKey);
    if (existing) return existing;
    const pending = discoverAmbientCliPackagesUncached(workspacePath, options);
    ambientCliPackageDiscoveryLocks.set(lockKey, pending);
    try {
      return await pending;
    } finally {
      if (ambientCliPackageDiscoveryLocks.get(lockKey) === pending) {
        ambientCliPackageDiscoveryLocks.delete(lockKey);
      }
    }
  }
  return discoverAmbientCliPackagesUncached(workspacePath, options);
}

async function discoverAmbientCliPackagesUncached(
  workspacePath: string,
  options: DiscoverAmbientCliPackagesOptions,
): Promise<AmbientCliPackageCatalog> {
  const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
  const configPath = join(installWorkspace, cliPackageConfigPath);
  if (!existsSync(configPath)) return { packages: [], errors: [] };
  const packages: AmbientCliPackageSummary[] = [];
  const errors: string[] = [];
  try {
    const config = cliPackageConfigSchema.parse(await readJson(configPath));
    for (const entry of config.packages) {
      const rootPath = resolveAmbientCliPackageSourcePath(workspacePath, installWorkspace, entry.source);
      if (!isPathInside(installWorkspace, rootPath) && !isPathInside(resolve(workspacePath), rootPath)) {
        errors.push(`${entry.source}: CLI package source resolves outside Ambient-managed or workspace package state.`);
        continue;
      }
      const inspected = await inspectAmbientCliPackage(workspacePath, rootPath, entry.source);
      packages.push(
        options.includeHealth ? await withAmbientCliPackageHealth(workspacePath, inspected, options.healthCommandFilter) : inspected,
      );
    }
  } catch (error) {
    errors.push(`Ambient CLI package config: ${errorMessage(error)}`);
  }
  packages.sort((left, right) => left.name.localeCompare(right.name));
  return { packages, errors };
}

export async function ensureFirstPartyAmbientCliPackages(
  workspacePath: string,
  options: EnsureFirstPartyAmbientCliPackagesOptions = {},
): Promise<FirstPartyAmbientCliPackageInstallStatus[]> {
  const statuses: FirstPartyAmbientCliPackageInstallStatus[] = [];
  const push = (status: FirstPartyAmbientCliPackageInstallStatus): void => {
    statuses.push(status);
    options.onStatus?.(status);
  };

  const requestedPackageNames = options.packageNames ? new Set(options.packageNames) : undefined;
  for (const firstParty of firstPartyAmbientCliPackages) {
    if (requestedPackageNames && !requestedPackageNames.has(firstParty.packageName)) continue;
    if (!requestedPackageNames && firstParty.kind === "bundled" && firstParty.autoInstall === false) continue;
    const status = await withFirstPartyAmbientCliPackageInstallLock(workspacePath, firstParty, () =>
      ensureFirstPartyAmbientCliPackage(workspacePath, firstParty, options),
    );
    push(status);
  }

  return statuses;
}

async function ensureFirstPartyAmbientCliPackage(
  workspacePath: string,
  firstParty: FirstPartyAmbientCliPackage,
  options: EnsureFirstPartyAmbientCliPackagesOptions,
): Promise<FirstPartyAmbientCliPackageInstallStatus> {
  const catalog = await discoverAmbientCliPackages(workspacePath);
  const existing = catalog.packages.find((pkg) => pkg.name === firstParty.packageName);
  if (existing?.installed) {
    if (firstParty.kind === "bundled") {
      try {
        const sourcePath = resolveBundledAmbientCliPackageRoot(firstParty.packageDir, options);
        const bundled = await inspectAmbientCliPackage(workspacePath, sourcePath, firstParty.source);
        if (bundled.errors.length) {
          return {
            packageName: firstParty.packageName,
            source: firstParty.source,
            status: "failed",
            packageId: existing.id,
            error: `Bundled Ambient CLI package is invalid: ${bundled.errors.join("; ")}`,
          };
        }
        if (existing.version === bundled.version) {
          return {
            packageName: firstParty.packageName,
            source: firstParty.source,
            status: "already_installed",
            packageId: existing.id,
          };
        }
      } catch (error) {
        return {
          packageName: firstParty.packageName,
          source: firstParty.source,
          status: "failed",
          packageId: existing.id,
          error: errorMessage(error),
        };
      }
    } else {
      return {
        packageName: firstParty.packageName,
        source: firstParty.source,
        status: "already_installed",
        packageId: existing.id,
      };
    }
  }

  try {
    const installed =
      firstParty.kind === "pi-catalog"
        ? await installAmbientCliPackagePiCatalogSource(workspacePath, firstParty.source)
        : await installBundledAmbientCliPackageSource(workspacePath, firstParty, options);
    return {
      packageName: firstParty.packageName,
      source: firstParty.source,
      status: "installed",
      packageId: installed.id,
    };
  } catch (error) {
    return {
      packageName: firstParty.packageName,
      source: firstParty.source,
      status: "failed",
      error: errorMessage(error),
    };
  }
}

function withFirstPartyAmbientCliPackageInstallLock(
  workspacePath: string,
  firstParty: FirstPartyAmbientCliPackage,
  install: () => Promise<FirstPartyAmbientCliPackageInstallStatus>,
): Promise<FirstPartyAmbientCliPackageInstallStatus> {
  const lockKey = `${managedInstallWorkspacePath(workspacePath)}\0${firstParty.packageName}`;
  const pending = firstPartyAmbientCliPackageInstallLocks.get(lockKey);
  if (pending) return pending;
  const next = install().finally(() => {
    if (firstPartyAmbientCliPackageInstallLocks.get(lockKey) === next) {
      firstPartyAmbientCliPackageInstallLocks.delete(lockKey);
    }
  });
  firstPartyAmbientCliPackageInstallLocks.set(lockKey, next);
  return next;
}

async function installBundledAmbientCliPackageSource(
  workspacePath: string,
  firstParty: Extract<FirstPartyAmbientCliPackage, { kind: "bundled" }>,
  options: EnsureFirstPartyAmbientCliPackagesOptions,
  sourcePathOverride?: string,
): Promise<AmbientCliPackageSummary> {
  const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
  const sourcePath = sourcePathOverride ?? resolveBundledAmbientCliPackageRoot(firstParty.packageDir, options);
  const inspected = await inspectAmbientCliPackage(workspacePath, sourcePath, firstParty.source);
  if (inspected.errors.length) throw new Error(`Ambient CLI package is invalid: ${inspected.errors.join("; ")}`);
  const ignoredReferenceError = ambientCliPackageIgnoredPathReferenceError(inspected);
  if (ignoredReferenceError) throw new Error(ignoredReferenceError);
  if (inspected.name !== firstParty.packageName)
    throw new Error(`Bundled Ambient CLI package identity mismatch: expected "${firstParty.packageName}", got "${inspected.name}".`);
  if (!inspected.commands.length) throw new Error("Ambient CLI package descriptor does not declare any commands.");

  const importName = safeName(`${inspected.name}-${inspected.version ?? "bundled"}-${shortHash(sourcePath)}`);
  const destination = resolve(installWorkspace, cliPackageImportRoot, importName);
  if (!isPathInside(installWorkspace, destination))
    throw new Error("Resolved Ambient CLI import path is outside Ambient-managed install state.");
  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  try {
    await cp(sourcePath, destination, { recursive: true, force: true, dereference: false });
    await removeAmbientCliPackageIgnoredContent(destination);
    const relativeSource = `./${relative(installWorkspace, destination).split(sep).join("/")}`;
    const imported = await inspectAmbientCliPackage(workspacePath, destination, relativeSource);
    if (imported.name !== firstParty.packageName)
      throw new Error(
        `Bundled Ambient CLI package identity mismatch after import: expected "${firstParty.packageName}", got "${imported.name}".`,
      );
    const health = await checkAmbientCliPackageHealth(imported, { workspacePath });
    const hardFailed = health.find((check) => !check.passed);
    if (hardFailed)
      throw new Error(
        `Ambient CLI package health check failed for "${hardFailed.commandName}": ${hardFailed.error ?? hardFailed.stderr ?? "unknown error"}`,
      );
    await upsertCliPackageConfig(workspacePath, relativeSource, imported.name);
    return inspectAmbientCliPackage(workspacePath, destination, relativeSource);
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}

async function withAmbientCliPackageHealth(
  workspacePath: string,
  pkg: AmbientCliPackageSummary,
  commandFilter?: AmbientCliPackageHealthCommandFilter,
): Promise<AmbientCliPackageSummary> {
  if (pkg.errors.length > 0) return pkg;
  const healthChecks = await checkAmbientCliPackageHealth(pkg, { workspacePath, commandFilter });
  return healthChecks.length ? { ...pkg, healthChecks } : pkg;
}

export async function installAmbientCliPackageSource(
  workspacePath: string,
  input: InstallAmbientCliPackageInput,
  approvedPreview?: AmbientCliPackageInstallPreview,
): Promise<AmbientCliPackageSummary> {
  const normalized = normalizeInstallInput(input);
  assertApprovedInstallPreviewInput(normalized, approvedPreview);
  const bundled = resolveFirstPartyBundledAmbientCliPackage(normalized.source);
  if (bundled) {
    const unsupported = bundledAmbientCliInstallUnsupportedFields(normalized);
    if (unsupported.length) throw new Error(`Bundled Ambient CLI package installs do not accept ${unsupported.join(", ")}.`);
    const sourcePath = resolveReviewedBundledAmbientCliPackageRoot(bundled);
    return installBundledAmbientCliPackageSource(workspacePath, bundled, {}, sourcePath);
  }
  if (isBundledAmbientCliInstallSource(normalized.source)) {
    throw new Error(`Unknown bundled Ambient CLI package source: ${normalized.source}`);
  }
  if (normalized.sha) return installAmbientCliPackageGitSource(workspacePath, normalized);
  const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
  const sourcePath = resolveAmbientCliInstallSourcePath(workspacePath, installWorkspace, normalized.source);
  if (!isPathInside(resolve(workspacePath), sourcePath) && !isPathInside(installWorkspace, sourcePath)) {
    throw new Error("Ambient CLI package source must be inside the workspace or Ambient-managed install state.");
  }
  if (!existsSync(sourcePath)) throw new Error("Ambient CLI package source was not found.");
  assertAmbientCliPackageRootIsNotSymlink(sourcePath);
  const symlinkPreflightError = await ambientCliPackageSymlinkPreflightError(sourcePath);
  if (symlinkPreflightError) throw new Error(symlinkPreflightError);
  const inspected = await inspectAmbientCliPackage(workspacePath, sourcePath, normalized.source, normalized.descriptor);
  if (inspected.errors.length) throw new Error(`Ambient CLI package is invalid: ${inspected.errors.join("; ")}`);
  const ignoredReferenceError = ambientCliPackageIgnoredPathReferenceError(inspected);
  if (ignoredReferenceError) throw new Error(ignoredReferenceError);
  if (!inspected.commands.length) throw new Error("Ambient CLI package descriptor does not declare any commands.");
  const dependencyPreview = normalized.installDependencies ? await previewAmbientCliPackageDependencies(sourcePath) : undefined;
  const pinPolicyError = ambientCliInstallPinPolicyError(normalized, dependencyPreview);
  if (pinPolicyError) throw new Error(pinPolicyError);
  const sourceContentHash = await ambientCliPackageInstallContentHash(sourcePath, normalized.descriptor);
  assertApprovedInstallPreviewPackage(approvedPreview, {
    candidate: inspected,
    contentHash: sourceContentHash,
    dependencyInstall: dependencyPreview,
  });

  const importName = safeName(`${inspected.name}-${inspected.version ?? "local"}-${shortHash(sourcePath)}`);
  const destination = resolve(installWorkspace, cliPackageImportRoot, importName);
  if (!isPathInside(installWorkspace, destination))
    throw new Error("Resolved Ambient CLI import path is outside Ambient-managed install state.");
  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  try {
    await cp(sourcePath, destination, { recursive: true, force: true, dereference: false });
    await removeAmbientCliPackageIgnoredContent(destination);
    await writeDescriptorOverlay(destination, normalized.descriptor);
    const relativeSource = `./${relative(installWorkspace, destination).split(sep).join("/")}`;
    const importedBeforeDependencyInstall = await inspectAmbientCliPackage(workspacePath, destination, relativeSource);
    const importedContentHash = await ambientCliPackageInstallContentHash(destination);
    assertApprovedInstallPreviewPackage(approvedPreview, {
      candidate: importedBeforeDependencyInstall,
      contentHash: importedContentHash,
      dependencyInstall: dependencyPreview,
    });
    if (normalized.installDependencies) {
      const dependencyInstall = await installAmbientCliPackageDependencies(destination);
      if (!dependencyInstall.passed)
        throw new Error(
          `Ambient CLI package dependency install failed: ${dependencyInstall.error ?? dependencyInstall.stderr ?? dependencyInstall.reason ?? "unknown error"}`,
        );
    }
    const imported = await inspectAmbientCliPackage(workspacePath, destination, relativeSource);
    await upsertCliPackageConfig(workspacePath, relativeSource, imported.name);
    return inspectAmbientCliPackage(workspacePath, destination, relativeSource);
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}

export async function previewAmbientCliPackageInstallSource(
  workspacePath: string,
  input: PreviewAmbientCliPackageInput,
): Promise<AmbientCliPackageInstallPreview> {
  const normalized = normalizeInstallInput(input);
  const displayInput = redactedInstallInput(normalized);
  const bundled = resolveFirstPartyBundledAmbientCliPackage(normalized.source);
  if (bundled) {
    const unsupported = bundledAmbientCliInstallUnsupportedFields(normalized);
    if (unsupported.length) {
      return {
        ...displayInput,
        envStatus: [],
        healthChecks: [],
        installable: false,
        errors: [`Bundled Ambient CLI package previews do not accept ${unsupported.join(", ")}.`],
      };
    }
    try {
      const sourcePath = resolveReviewedBundledAmbientCliPackageRoot(bundled);
      return previewPreparedAmbientCliPackage(workspacePath, sourcePath, bundled.source, normalized, bundled.packageName);
    } catch (error) {
      return { ...displayInput, envStatus: [], healthChecks: [], installable: false, errors: [errorMessage(error)] };
    }
  }
  if (isBundledAmbientCliInstallSource(normalized.source)) {
    return {
      ...displayInput,
      envStatus: [],
      healthChecks: [],
      installable: false,
      errors: [`Unknown bundled Ambient CLI package source: ${displayInput.source}`],
    };
  }
  if (!normalized.sha && displayInput.source !== normalized.source && isGitLikeInstallSource(normalized.source)) {
    return {
      ...displayInput,
      envStatus: [],
      healthChecks: [],
      installable: false,
      errors: ["Git URL preview sources must not contain credentials, query strings, or fragments."],
    };
  }
  if (!normalized.sha) {
    const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
    const sourcePath = resolveAmbientCliInstallSourcePath(workspacePath, installWorkspace, normalized.source);
    if (!isPathInside(resolve(workspacePath), sourcePath) && !isPathInside(installWorkspace, sourcePath)) {
      return {
        ...displayInput,
        envStatus: [],
        healthChecks: [],
        installable: false,
        errors: ["Local Ambient CLI package preview source must be inside the workspace or Ambient-managed install state."],
      };
    }
    const symlinkError = ambientCliPackageRootSymlinkError(sourcePath);
    if (symlinkError) {
      return {
        ...displayInput,
        envStatus: [],
        healthChecks: [],
        installable: false,
        errors: [symlinkError],
      };
    }
    return withPreviewPackageRoot(sourcePath, normalized, async (packageRoot) =>
      previewPreparedAmbientCliPackage(workspacePath, packageRoot, normalized.source, normalized),
    );
  }

  try {
    return await withClonedCliPackage(normalized, async ({ packageRoot }) => {
      return previewPreparedAmbientCliPackage(workspacePath, packageRoot, gitSourceLabel(normalized), normalized);
    });
  } catch (error) {
    return {
      ...displayInput,
      envStatus: [],
      healthChecks: [],
      installable: false,
      errors: [errorMessage(error)],
    };
  }
}

export async function previewAmbientCliPackagePiCatalogSource(
  workspacePath: string,
  source: string,
): Promise<AmbientCliPiCatalogInstallPreview> {
  try {
    const resolution = await resolvePiCatalogCliAdapter(source);
    const normalized: NormalizedInstallInput = {
      source: resolution.repositoryUrl,
      path: resolution.repositoryDirectory,
      sha: resolution.sha,
      descriptor: piCatalogAdapterDescriptor(resolution),
      ...(resolution.installDependencies ? { installDependencies: true } : {}),
    };
    return withClonedCliPackage(normalized, async ({ packageRoot }) => {
      await writePiCatalogAdapterFiles(packageRoot, resolution);
      const preview = await previewPreparedAmbientCliPackage(workspacePath, packageRoot, gitSourceLabel(normalized), normalized);
      return { ...preview, source, resolution };
    });
  } catch (error) {
    return {
      source,
      envStatus: [],
      healthChecks: [],
      installable: false,
      errors: [errorMessage(error)],
    };
  }
}

export async function installAmbientCliPackagePiCatalogSource(
  workspacePath: string,
  source: string,
  approvedPreview?: AmbientCliPiCatalogInstallPreview,
): Promise<AmbientCliPackageSummary> {
  const preview = approvedPreview ?? (await previewAmbientCliPackagePiCatalogSource(workspacePath, source));
  if (preview.source !== source) throw new Error("Approved Pi catalog package preview does not match the requested source.");
  if (!preview.installable || !preview.resolution)
    throw new Error(`Pi catalog package is not installable as Ambient CLI: ${preview.errors.join("; ")}`);
  const resolution = preview.resolution;
  const normalized: NormalizedInstallInput = {
    source: resolution.repositoryUrl,
    path: resolution.repositoryDirectory,
    sha: resolution.sha,
    descriptor: piCatalogAdapterDescriptor(resolution),
    ...(resolution.installDependencies ? { installDependencies: true } : {}),
  };

  return withClonedCliPackage(normalized, async ({ packageRoot }) => {
    const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
    await writePiCatalogAdapterFiles(packageRoot, resolution);
    const inspected = await inspectAmbientCliPackage(workspacePath, packageRoot, gitSourceLabel(normalized), normalized.descriptor);
    const ignoredReferenceError = ambientCliPackageIgnoredPathReferenceError(inspected);
    if (ignoredReferenceError) throw new Error(ignoredReferenceError);
    const importName = safeName(`${inspected.name}-${inspected.version ?? "pi"}-${shortHash([source, resolution.sha].join(":"))}`);
    const destination = resolve(installWorkspace, cliPackageImportRoot, importName);
    if (!isPathInside(installWorkspace, destination))
      throw new Error("Resolved Ambient CLI import path is outside Ambient-managed install state.");
    await rm(destination, { recursive: true, force: true });
    await mkdir(dirname(destination), { recursive: true });
    try {
      await cp(packageRoot, destination, { recursive: true, force: true, dereference: false });
      await removeAmbientCliPackageIgnoredContent(destination);
      await writeDescriptorOverlay(destination, normalized.descriptor);
      if (normalized.installDependencies) {
        const dependencyInstall = await installAmbientCliPackageDependencies(destination);
        if (!dependencyInstall.passed)
          throw new Error(
            `Ambient CLI package dependency install failed: ${dependencyInstall.error ?? dependencyInstall.stderr ?? dependencyInstall.reason ?? "unknown error"}`,
          );
      }
      const relativeSource = `./${relative(installWorkspace, destination).split(sep).join("/")}`;
      const imported = await inspectAmbientCliPackage(workspacePath, destination, relativeSource);
      const health = await checkAmbientCliPackageHealth(imported, { workspacePath });
      const failed = health.find((check) => !check.passed);
      if (failed)
        throw new Error(
          `Ambient CLI package health check failed for "${failed.commandName}": ${failed.error ?? failed.stderr ?? "unknown error"}`,
        );
      await upsertCliPackageConfig(workspacePath, relativeSource, imported.name);
      return inspectAmbientCliPackage(workspacePath, destination, relativeSource);
    } catch (error) {
      await rm(destination, { recursive: true, force: true });
      throw error;
    }
  });
}

async function installAmbientCliPackageGitSource(
  workspacePath: string,
  input: InstallAmbientCliPackageInput,
): Promise<AmbientCliPackageSummary> {
  const normalized = normalizeInstallInput(input);
  if (!normalized.sha) throw new Error("Pinned Git Ambient CLI package installs require sha.");
  const preview = await previewAmbientCliPackageInstallSource(workspacePath, normalized);
  if (!preview.installable) throw new Error(`Ambient CLI package is not installable: ${preview.errors.join("; ")}`);

  return withClonedCliPackage(normalized, async ({ packageRoot }) => {
    const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
    const inspected = await inspectAmbientCliPackage(workspacePath, packageRoot, gitSourceLabel(normalized), normalized.descriptor);
    const ignoredReferenceError = ambientCliPackageIgnoredPathReferenceError(inspected);
    if (ignoredReferenceError) throw new Error(ignoredReferenceError);
    const importName = safeName(
      `${inspected.name}-${inspected.version ?? "git"}-${shortHash([normalized.source, normalized.path, normalized.sha].filter(Boolean).join(":"))}`,
    );
    const destination = resolve(installWorkspace, cliPackageImportRoot, importName);
    if (!isPathInside(installWorkspace, destination))
      throw new Error("Resolved Ambient CLI import path is outside Ambient-managed install state.");
    await rm(destination, { recursive: true, force: true });
    await mkdir(dirname(destination), { recursive: true });
    try {
      await cp(packageRoot, destination, { recursive: true, force: true, dereference: false });
      await removeAmbientCliPackageIgnoredContent(destination);
      await writeDescriptorOverlay(destination, normalized.descriptor);
      if (normalized.installDependencies) {
        const dependencyInstall = await installAmbientCliPackageDependencies(destination);
        if (!dependencyInstall.passed)
          throw new Error(
            `Ambient CLI package dependency install failed: ${dependencyInstall.error ?? dependencyInstall.stderr ?? dependencyInstall.reason ?? "unknown error"}`,
          );
      }
      const relativeSource = `./${relative(installWorkspace, destination).split(sep).join("/")}`;
      const imported = await inspectAmbientCliPackage(workspacePath, destination, relativeSource);
      const health = await checkAmbientCliPackageHealth(imported, { workspacePath });
      const failed = health.find((check) => !check.passed);
      if (failed)
        throw new Error(
          `Ambient CLI package health check failed for "${failed.commandName}": ${failed.error ?? failed.stderr ?? "unknown error"}`,
        );
      await upsertCliPackageConfig(workspacePath, relativeSource, imported.name);
      return inspectAmbientCliPackage(workspacePath, destination, relativeSource);
    } catch (error) {
      await rm(destination, { recursive: true, force: true });
      throw error;
    }
  });
}

async function previewPreparedAmbientCliPackage(
  workspacePath: string,
  packageRoot: string,
  source: string,
  input: NormalizedInstallInput,
  expectedPackageName?: string,
): Promise<AmbientCliPackageInstallPreview> {
  const symlinkPreflightError = await ambientCliPackageSymlinkPreflightError(packageRoot);
  if (symlinkPreflightError) {
    return {
      ...input,
      envStatus: [],
      healthChecks: [],
      installable: false,
      errors: [symlinkPreflightError],
    };
  }
  const candidate = await inspectAmbientCliPackage(workspacePath, packageRoot, source, input.descriptor);
  const ignoredReferenceError = ambientCliPackageIgnoredPathReferenceError(candidate);
  if (ignoredReferenceError) {
    return {
      ...input,
      envStatus: [],
      healthChecks: [],
      installable: false,
      errors: [ignoredReferenceError],
    };
  }
  const identityErrors =
    expectedPackageName && candidate.name !== expectedPackageName
      ? [`Bundled Ambient CLI package identity mismatch: expected "${expectedPackageName}", got "${candidate.name}".`]
      : [];
  const dependencyInstall =
    input.installDependencies && candidate.errors.length === 0 && identityErrors.length === 0
      ? await previewAmbientCliPackageDependencies(packageRoot)
      : undefined;
  const envStatus = await resolveAmbientCliEnvStatus(workspacePath, candidate);
  const healthChecks: AmbientCliPackageHealthCheckResult[] = [];
  const pinPolicyError = ambientCliInstallPinPolicyError(input, dependencyInstall);
  const contentHashResult =
    candidate.errors.length === 0 ? await ambientCliPackageInstallContentHashResult(packageRoot, input.descriptor) : {};
  const errors = [
    ...candidate.errors,
    ...identityErrors,
    ...(ignoredReferenceError ? [ignoredReferenceError] : []),
    ...(contentHashResult.error ? [contentHashResult.error] : []),
    ...envStatus.filter((env) => env.error).map((env) => `env: ${env.name}: ${env.error}`),
    ...(pinPolicyError ? [pinPolicyError] : []),
    ...(dependencyInstall && !dependencyInstall.passed
      ? [`dependencies: ${dependencyInstall.error ?? dependencyInstall.stderr ?? dependencyInstall.reason ?? "failed"}`]
      : []),
    ...healthChecks.filter((check) => !check.passed).map((check) => `${check.commandName}: ${check.error ?? check.stderr ?? "failed"}`),
  ];
  if (!candidate.commands.length) errors.push("Ambient CLI package descriptor does not declare any commands.");
  return {
    ...input,
    ...(contentHashResult.contentHash ? { contentHash: contentHashResult.contentHash } : {}),
    candidate,
    ...(dependencyInstall ? { dependencyInstall } : {}),
    envStatus,
    healthChecks,
    installable: errors.length === 0 && candidate.commands.length > 0,
    errors,
  };
}

export async function uninstallAmbientCliPackageSource(
  workspacePath: string,
  input: UninstallAmbientCliPackageInput,
): Promise<AmbientCliPackageCatalog> {
  const catalog = await discoverAmbientCliPackages(workspacePath);
  const pkg = catalog.packages.find((candidate) => candidate.id === input.packageId);
  if (!pkg) throw new Error("Ambient CLI package was not found.");
  if (!pkg.installed) throw new Error("Only Ambient-installed CLI packages can be uninstalled.");
  await removeCliPackageConfig(workspacePath, pkg.source);
  const importRoot = resolve(managedInstallWorkspacePath(workspacePath), cliPackageImportRoot);
  if (isPathInside(importRoot, pkg.rootPath)) await rm(pkg.rootPath, { recursive: true, force: true });
  return discoverAmbientCliPackages(workspacePath);
}

export async function checkAmbientCliPackageHealth(
  pkg: AmbientCliPackageSummary,
  options: { workspacePath?: string; commandFilter?: AmbientCliPackageHealthCommandFilter } = {},
): Promise<AmbientCliPackageHealthCheckResult[]> {
  const checks = pkg.commands.filter(
    (command) => command.healthCheck?.length && (!options.commandFilter || options.commandFilter(pkg, command)),
  );
  const results: AmbientCliPackageHealthCheckResult[] = [];
  for (const command of checks) {
    const result = await checkAmbientCliPackageCommandHealth(pkg, command, options.workspacePath ?? pkg.rootPath);
    if (result) results.push(result);
  }
  return results;
}

async function checkAmbientCliPackageCommandHealth(
  pkg: AmbientCliPackageSummary,
  command: AmbientCliPackageCommand,
  workspacePath: string,
): Promise<AmbientCliPackageHealthCheckResult | undefined> {
  const healthCheck = command.healthCheck ?? [];
  const [rawExecutable, ...rawArgs] = healthCheck;
  if (!rawExecutable) return undefined;
  const executable = resolveCliExecutable(pkg.rootPath, rawExecutable);
  const args = rawArgs.map((arg) => resolveDescriptorArg(pkg.rootPath, arg));
  const cwd = pkg.rootPath;
  let env: NodeJS.ProcessEnv | undefined;
  try {
    env = await ambientCliProcessEnv(workspacePath, pkg);
    const cacheKey = ambientCliPackageHealthCacheKey(pkg, command, {
      executable,
      args,
      cwd,
      env,
      workspacePath,
    });
    return await withAmbientCliPackageHealthCache(cacheKey, () =>
      runAmbientCliPackageCommandHealth({
        pkg,
        command,
        rawExecutable,
        executable,
        args,
        cwd,
        env: env!,
        workspacePath,
      }),
    );
  } catch (error) {
    const checkedAt = new Date().toISOString();
    return {
      commandName: command.name,
      command: [rawExecutable, ...rawArgs],
      cwd,
      passed: false,
      error: errorMessage(error),
      cached: false,
      checkedAt,
      cacheAgeMs: 0,
    };
  }
}

async function withAmbientCliPackageHealthCache(
  cacheKey: string,
  run: () => Promise<AmbientCliPackageHealthCheckResult>,
): Promise<AmbientCliPackageHealthCheckResult> {
  const now = Date.now();
  const cached = ambientCliPackageHealthCache.get(cacheKey);
  if (cached && now - cached.checkedAtMs <= ambientCliPackageHealthCacheTtlMs) {
    return {
      ...cached.result,
      cached: true,
      checkedAt: cached.checkedAt,
      cacheAgeMs: now - cached.checkedAtMs,
    };
  }
  const existing = ambientCliPackageHealthLocks.get(cacheKey);
  if (existing) return existing;
  const pending = (async () => {
    const result = await run();
    const checkedAtMs = Date.now();
    const checkedAt = new Date(checkedAtMs).toISOString();
    const fresh = {
      ...result,
      cached: false,
      checkedAt,
      cacheAgeMs: 0,
    };
    ambientCliPackageHealthCache.set(cacheKey, { checkedAt, checkedAtMs, result: fresh });
    pruneAmbientCliPackageHealthCache(checkedAtMs);
    return fresh;
  })();
  ambientCliPackageHealthLocks.set(cacheKey, pending);
  try {
    return await pending;
  } finally {
    if (ambientCliPackageHealthLocks.get(cacheKey) === pending) ambientCliPackageHealthLocks.delete(cacheKey);
  }
}

async function runAmbientCliPackageCommandHealth(input: {
  pkg: AmbientCliPackageSummary;
  command: AmbientCliPackageCommand;
  rawExecutable: string;
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  workspacePath: string;
}): Promise<AmbientCliPackageHealthCheckResult> {
  try {
    const output = await executeProfiledCommand({
      command: input.executable,
      args: input.args,
      cwd: input.cwd,
      env: input.env,
      maxBuffer: 1024 * 1024,
      timeoutProfile: input.command.timeoutProfile ?? "healthCheck",
      progressPatterns: input.command.progressPatterns,
      devicePolicy: input.command.devicePolicy,
      phase: `ambient-cli healthCheck ${input.pkg.name}:${input.command.name}`,
    });
    const { stdout, stderr } = output;
    const stdoutOutput = stdout
      ? await materializeTextOutput(input.workspacePath, {
          label: `ambient-cli-health-${input.pkg.name}-${input.command.name}-stdout`,
          text: stdout,
          maxPreviewChars: 4_000,
        })
      : undefined;
    const stderrOutput = stderr
      ? await materializeTextOutput(input.workspacePath, {
          label: `ambient-cli-health-${input.pkg.name}-${input.command.name}-stderr`,
          text: stderr,
          maxPreviewChars: 4_000,
        })
      : undefined;
    return {
      commandName: input.command.name,
      command: [input.rawExecutable, ...output.args],
      cwd: input.cwd,
      passed: true,
      ...(stdoutOutput ? { stdout: stdoutOutput.text, stdoutOutput } : {}),
      ...(stderrOutput ? { stderr: stderrOutput.text, stderrOutput } : {}),
      timeoutProfile: output.timeoutProfile,
      timeoutMs: output.timeoutMs,
      idleTimeoutMs: output.idleTimeoutMs,
      ...(output.lastProgressAt ? { lastProgressAt: output.lastProgressAt } : {}),
      ...(output.deviceSelection ? { deviceSelection: output.deviceSelection } : {}),
    };
  } catch (error) {
    return {
      commandName: input.command.name,
      command: input.command.healthCheck ?? [input.rawExecutable],
      cwd: input.cwd,
      passed: false,
      error: errorMessage(error),
    };
  }
}

function ambientCliPackageHealthCacheKey(
  pkg: AmbientCliPackageSummary,
  command: AmbientCliPackageCommand,
  input: { executable: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; workspacePath: string },
): string {
  return contentHash(
    JSON.stringify({
      packageId: pkg.id,
      packageName: pkg.name,
      packageVersion: pkg.version ?? "",
      rootPath: resolve(pkg.rootPath),
      source: pkg.source,
      commandName: command.name,
      healthCheck: command.healthCheck ?? [],
      executable: input.executable,
      args: input.args,
      cwd: resolve(input.cwd),
      workspacePath: resolve(input.workspacePath),
      files: ambientCliPackageHealthFileSignature(pkg, input),
      timeoutProfile: command.timeoutProfile ?? "healthCheck",
      progressPatterns: command.progressPatterns ?? [],
      devicePolicy: command.devicePolicy ?? {},
      env: ambientCliHealthEnvSignature(input.env),
    }),
  );
}

function ambientCliPackageHealthFileSignature(pkg: AmbientCliPackageSummary, input: { executable: string; args: string[] }): string {
  const packageRoot = resolve(pkg.rootPath);
  const candidates = new Set([resolve(packageRoot, cliPackageDescriptorName), input.executable, ...input.args]);
  const entries: AmbientCliPackageHealthFileSignatureEntry[] = Array.from(candidates)
    .flatMap((candidate): AmbientCliPackageHealthFileSignatureEntry[] => {
      const absolutePath = resolve(candidate);
      if (!isPathInside(packageRoot, absolutePath) && absolutePath !== packageRoot) return [];
      const relativePath = relative(packageRoot, absolutePath).split(sep).join("/") || ".";
      try {
        const stat = statSync(absolutePath);
        return [
          {
            path: relativePath,
            kind: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
            size: stat.size,
            mtimeMs: stat.mtimeMs,
          },
        ];
      } catch (error) {
        if (isErrno(error, "ENOENT")) return [{ path: relativePath, missing: true }];
        throw error;
      }
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  return contentHash(JSON.stringify(entries));
}

interface AmbientCliPackageHealthFileSignatureEntry {
  path: string;
  kind?: "directory" | "file" | "other";
  size?: number;
  mtimeMs?: number;
  missing?: boolean;
}

function ambientCliHealthEnvSignature(env: NodeJS.ProcessEnv): string {
  const entries = Object.entries(env)
    .filter(([name, value]) => typeof value === "string" && !healthCacheIgnoredEnvNames.has(name))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => [name, contentHash(value ?? "")]);
  return contentHash(JSON.stringify(entries));
}

function pruneAmbientCliPackageHealthCache(now: number): void {
  for (const [key, value] of ambientCliPackageHealthCache) {
    if (now - value.checkedAtMs > ambientCliPackageHealthCacheTtlMs * 3) ambientCliPackageHealthCache.delete(key);
  }
}

export async function enabledAmbientCliSkillPaths(workspacePath: string): Promise<string[]> {
  const catalog = await discoverAmbientCliPackages(workspacePath, { includeHealth: false });
  return catalog.packages.flatMap((pkg) => (pkg.errors.length ? [] : pkg.skills.map((skill) => dirname(skill.path))));
}

export async function searchAmbientCliCapabilities(
  workspacePath: string,
  input: AmbientCliCapabilitySearchInput = {},
): Promise<AmbientCliCapabilitySearchResponse> {
  const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 8), 200));
  const query = normalizeSearchText(input.query);
  const kind = input.kind ?? "any";
  const requestedPackageId = input.packageId?.trim();
  const requestedPackageName = input.packageName?.trim();
  const requestedCommand = input.command?.trim();
  const catalog = await discoverAmbientCliPackages(workspacePath, { includeHealth: input.includeHealth !== false });
  const candidates: AmbientCliCapabilitySearchResult[] = [];

  for (const pkg of catalog.packages) {
    if (!pkg.installed) continue;
    if (!input.includeUnavailable && pkg.errors.length > 0) continue;
    if (requestedPackageId && pkg.id !== requestedPackageId) continue;
    if (requestedPackageName && pkg.name !== requestedPackageName) continue;
    const envStatus = await resolveAmbientCliEnvStatus(workspacePath, pkg);
    const result = ambientCliCapabilitySearchResult(pkg, {
      envStatus,
      query,
      kind,
      command: requestedCommand,
    });
    if (!result) continue;
    if (!input.includeUnavailable && result.availability !== "available") continue;
    candidates.push(result);
  }

  const sorted = candidates.sort((left, right) => right.score - left.score || left.packageName.localeCompare(right.packageName));
  return {
    results: sorted.slice(0, limit),
    truncated: sorted.length > limit,
    catalogVersion: `ambient-cli-v1:${shortHash(catalog.packages.map((pkg) => `${pkg.id}:${pkg.source}:${pkg.commands.map((command) => command.name).join(",")}`).join("|"))}`,
  };
}

export async function describeAmbientCliPackage(
  workspacePath: string,
  input: DescribeAmbientCliPackageInput,
  options: DescribeAmbientCliPackageOptions = {},
): Promise<AmbientCliPackageDescription> {
  const catalog = await discoverAmbientCliPackages(workspacePath, { includeHealth: options.includeHealth === true });
  const pkg = selectCliPackageByIdentity(catalog.packages, input);
  if (!pkg.installed) throw new Error("Only installed Ambient CLI packages can be described.");
  const requestedCommand = input.command?.trim();
  const commands = requestedCommand ? pkg.commands.filter((command) => command.name === requestedCommand) : pkg.commands;
  if (requestedCommand && commands.length === 0)
    throw new Error(`Ambient CLI package "${pkg.name}" does not declare command "${requestedCommand}".`);
  const env = await resolveAmbientCliEnvStatus(workspacePath, pkg);
  const maxSkillChars = Math.max(0, Math.min(Math.floor(input.maxSkillChars ?? 8_000), 24_000));
  const includeSkill = input.includeSkill === true;
  const includeSummary = input.includeSummary !== false;
  const skills = await Promise.all(
    pkg.skills.map((skill) =>
      ambientCliSkillDescription(workspacePath, pkg, skill, {
        includeSkill,
        includeSummary,
        maxSkillChars,
        generateMissingSummaries: options.generateMissingSummaries === true,
        modelComplete: options.modelComplete,
        signal: options.signal,
        now: options.now ?? (() => new Date()),
      }),
    ),
  );
  const missingEnv = requiredMissingEnv(env);
  return {
    package: {
      id: pkg.id,
      name: pkg.name,
      ...(pkg.version ? { version: pkg.version } : {}),
      ...(pkg.description ? { description: pkg.description } : {}),
      source: pkg.source,
      installed: pkg.installed,
      availability: pkg.errors.length === 0 ? "available" : "unavailable",
      availabilityReason: pkg.errors[0] ?? "Installed Ambient CLI package is available; execution still requires ambient_cli approval.",
    },
    commands: commands.map((command) => ambientCliCommandDescription(pkg, command, missingEnv)),
    skills,
    env,
    guidance: ambientCliDescribeGuidance(pkg, commands, missingEnv),
    diagnostics: [`Package root: ${pkg.rootPath}`, `Package source: ${pkg.source}`, ...pkg.errors],
  };
}

export async function runAmbientCliPackageCommand(workspacePath: string, input: RunAmbientCliInput): Promise<AmbientCliRunResult> {
  const catalog = await discoverAmbientCliPackages(workspacePath);
  const pkg = selectCliPackage(catalog, input);
  if (pkg.errors.length) throw new Error(`Ambient CLI package "${pkg.name}" has errors: ${pkg.errors.join("; ")}`);
  const command = pkg.commands.find((candidate) => candidate.name === input.command);
  if (!command) throw new Error(`Ambient CLI package "${pkg.name}" does not declare command "${input.command}".`);
  const extraArgs = (input.args ?? []).map((arg) => {
    if (typeof arg !== "string") throw new Error("Ambient CLI args must be strings.");
    return arg;
  });
  const executionWorkspacePath = input.executionWorkspacePath ? resolve(input.executionWorkspacePath) : workspacePath;
  const cwd = resolveCliCwd(executionWorkspacePath, pkg.rootPath, command.cwd, input.cwd);
  const executable = resolveCliExecutable(pkg.rootPath, command.command);
  const args = [...command.args.map((arg) => resolveDescriptorArg(pkg.rootPath, arg)), ...extraArgs];
  const startedAt = Date.now();
  const envStatus = await resolveAmbientCliEnvStatus(workspacePath, pkg);
  const missingEnv = requiredMissingEnv(envStatus);
  if (missingEnv.length)
    throw new Error(`Ambient CLI package env requirements are missing: ${missingEnv.map((env) => env.name).join(", ")}`);
  const env: NodeJS.ProcessEnv = {
    ...buildSafeProcessEnv({}, input.env),
    ...(await ambientCliProcessEnv(workspacePath, pkg)),
  };
  const legacyTimeoutMs = input.timeoutMs ?? 120_000;
  const output = await executeProfiledCommand({
    command: executable,
    args,
    cwd,
    env,
    maxBuffer: 1024 * 1024 * 4,
    signal: input.signal,
    timeoutMs: command.timeoutProfile ? input.timeoutMs : legacyTimeoutMs,
    ...(command.timeoutProfile ? {} : { idleTimeoutMs: legacyTimeoutMs }),
    timeoutProfile: command.timeoutProfile ?? "quickProbe",
    progressPatterns: command.progressPatterns,
    devicePolicy: command.devicePolicy,
    phase: `ambient-cli command ${pkg.name}:${command.name}`,
  });
  const { stdout, stderr } = output;
  const stdoutOutput = stdout
    ? await materializeTextOutput(executionWorkspacePath, {
        label: `ambient-cli-${pkg.name}-${command.name}-stdout`,
        text: stdout,
        maxPreviewChars: 12_000,
      })
    : undefined;
  const stderrOutput = stderr
    ? await materializeTextOutput(executionWorkspacePath, {
        label: `ambient-cli-${pkg.name}-${command.name}-stderr`,
        text: stderr,
        maxPreviewChars: 12_000,
      })
    : undefined;
  return {
    packageId: pkg.id,
    packageName: pkg.name,
    commandName: command.name,
    command: [command.command, ...output.args],
    cwd,
    durationMs: Date.now() - startedAt,
    ...(stdoutOutput ? { stdout: stdoutOutput.text, stdoutOutput } : {}),
    ...(stderrOutput ? { stderr: stderrOutput.text, stderrOutput } : {}),
    timeoutProfile: output.timeoutProfile,
    timeoutMs: output.timeoutMs,
    idleTimeoutMs: output.idleTimeoutMs,
    ...(output.lastProgressAt ? { lastProgressAt: output.lastProgressAt } : {}),
    ...(output.deviceSelection ? { deviceSelection: output.deviceSelection } : {}),
  };
}

export async function hydrateAmbientCliPackageSummaries(
  workspacePath: string,
  selector: Pick<DescribeAmbientCliPackageInput, "packageId" | "packageName">,
  options: AmbientCliPackageSummaryHydrationOptions = {},
): Promise<AmbientCliPackageSummaryHydrationResult> {
  const packageIdentity = selector.packageId ? { packageId: selector.packageId } : { packageName: selector.packageName ?? "" };
  if (!options.generateMissingSummaries) {
    const description = await describeAmbientCliPackage(workspacePath, packageIdentity, { ...options, generateMissingSummaries: false });
    return ambientCliSummaryHydrationResult(description, false, "Summary generation policy is disabled.");
  }
  if (!options.modelComplete) {
    const description = await describeAmbientCliPackage(workspacePath, packageIdentity, { ...options, generateMissingSummaries: false });
    return ambientCliSummaryHydrationResult(description, false, "No RLM model completer is configured.");
  }
  const description = await describeAmbientCliPackage(workspacePath, { ...packageIdentity, includeSummary: true }, options);
  return ambientCliSummaryHydrationResult(description, true);
}

function ambientCliSummaryHydrationResult(
  description: AmbientCliPackageDescription,
  attempted: boolean,
  reason?: string,
): AmbientCliPackageSummaryHydrationResult {
  const summaryStatuses = description.skills.map((skill) => ({
    skillName: skill.name,
    skillPath: skill.path,
    status: skill.summaryStatus,
    ...(skill.summaryError ? { error: skill.summaryError } : {}),
    ...(skill.summaryRetryAfter ? { retryAfter: skill.summaryRetryAfter } : {}),
  }));
  return {
    packageId: description.package.id,
    packageName: description.package.name,
    attempted,
    ...(reason ? { reason } : {}),
    summaryStatuses,
    availableCount: summaryStatuses.filter((item) => item.status === "available").length,
    failedCount: summaryStatuses.filter((item) => item.status === "failed").length,
  };
}

export async function writeAmbientCliSkillSummary(workspacePath: string, summary: AmbientCliSkillSummary): Promise<string> {
  const parsed = cliSkillSummarySchema.parse(summary);
  const cachePath = ambientCliSkillSummaryCachePath(workspacePath, parsed.packageId, parsed.skillPath);
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return cachePath;
}

async function inspectAmbientCliPackage(
  workspacePath: string,
  rootPath: string,
  source: string,
  descriptorOverlay?: unknown,
): Promise<AmbientCliPackageSummary> {
  const errors: string[] = [];
  const descriptor = await readCliDescriptor(rootPath, descriptorOverlay).catch((error) => {
    errors.push(errorMessage(error));
    return undefined;
  });
  const name = descriptor?.name ?? basename(rootPath);
  const commands = Object.entries(descriptor?.commands ?? {}).map(([name, command]) => ({
    name,
    description: command.description,
    command: command.command,
    args: command.args,
    cwd: command.cwd,
    ...(command.healthCheck ? { healthCheck: command.healthCheck } : {}),
    ...(command.timeoutProfile ? { timeoutProfile: command.timeoutProfile } : {}),
    ...(command.progressPatterns ? { progressPatterns: command.progressPatterns } : {}),
    ...(command.devicePolicy ? { devicePolicy: normalizeCommandDevicePolicy(command.devicePolicy) } : {}),
    ...(command.voiceProvider ? { voiceProvider: normalizeVoiceProviderCommandMetadata(command.voiceProvider) } : {}),
    ...(command.sttProvider ? { sttProvider: normalizeSttProviderCommandMetadata(command.sttProvider) } : {}),
    ...(command.embeddingProvider ? { embeddingProvider: normalizeEmbeddingProviderCommandMetadata(command.embeddingProvider) } : {}),
  }));
  for (const command of commands) {
    validateCliExecutableReference(rootPath, `Command "${command.name}" executable`, command.command, errors);
    const healthExecutable = command.healthCheck?.[0];
    if (healthExecutable)
      validateCliExecutableReference(rootPath, `Command "${command.name}" healthCheck executable`, healthExecutable, errors);
  }
  validateCliProviderLifecycleCommands(commands, errors);
  const envRequirements = normalizeEnvRequirements(descriptor?.env ?? []);
  const generated = await readAmbientCliGeneratedMetadata(rootPath);
  return {
    id: `ambient-cli:${source}:${name}`,
    name,
    version: descriptor?.version,
    description: descriptor?.description,
    rootPath,
    source,
    installed: isPathInside(resolve(managedInstallWorkspacePath(workspacePath), cliPackageImportRoot), rootPath),
    skills: descriptor ? await discoverCliSkills(rootPath, descriptor.skills) : [],
    commands,
    envRequirements,
    errors,
    ...(generated ? { generated } : {}),
  };
}

export async function discoverAmbientCliVoiceProviders(workspacePath: string): Promise<VoiceProviderCandidate[]> {
  const catalog = await discoverAmbientCliPackages(workspacePath, {
    includeHealth: true,
    healthCommandFilter: (_pkg, command) => Boolean(command.voiceProvider),
  });
  return catalog.packages.flatMap((pkg) => {
    return pkg.commands.flatMap((command) => {
      if (!command.voiceProvider) return [];
      const capabilityId = ambientCliCapabilityId(pkg.id, "tool", command.name);
      const health = ambientCliCommandHealth(pkg, command);
      const healthPayload = ambientCliVoiceProviderHealthPayload(pkg, command);
      const availabilityReason = ambientCliVoiceProviderAvailabilityReason(pkg, command);
      const diagnostics = ambientCliVoiceProviderDiagnostics(pkg, command);
      const providerLifecycle = command.voiceProvider.runtimeLifecycle
        ? ambientCliProviderLifecycleWithPackage(command.voiceProvider.runtimeLifecycle, pkg)
        : undefined;
      return [
        {
          packageId: pkg.id,
          packageName: pkg.name,
          command: command.name,
          capabilityId,
          providerId: capabilityId,
          label: command.voiceProvider.label ?? voiceProviderFallbackLabel(pkg.name, command.name),
          ...(command.description ? { description: command.description } : {}),
          format: command.voiceProvider.defaultFormat,
          formats: command.voiceProvider.formats,
          voices: command.voiceProvider.voices,
          ...(command.voiceProvider.local !== undefined ? { local: command.voiceProvider.local } : {}),
          ...(command.voiceProvider.voiceDiscovery ? { voiceDiscovery: command.voiceProvider.voiceDiscovery } : {}),
          ...(command.voiceProvider.voiceCloning ? { voiceCloning: command.voiceProvider.voiceCloning } : {}),
          ...(providerLifecycle ? { providerLifecycle } : {}),
          installed: pkg.installed,
          available: pkg.errors.length === 0 && health !== "failed" && healthPayload?.available !== false,
          availabilityReason,
          diagnostics,
        },
      ];
    });
  });
}

export async function discoverAmbientCliEmbeddingProviders(workspacePath: string): Promise<EmbeddingProviderCandidate[]> {
  const catalog = await discoverAmbientCliPackages(workspacePath, {
    includeHealth: true,
    healthCommandFilter: (_pkg, command) => Boolean(command.embeddingProvider),
  });
  return catalog.packages.flatMap((pkg) => {
    return pkg.commands.flatMap((command) => {
      if (!command.embeddingProvider) return [];
      const capabilityId = ambientCliCapabilityId(pkg.id, "tool", command.name);
      const health = ambientCliCommandHealth(pkg, command);
      const healthPayload = ambientCliEmbeddingProviderHealthPayload(pkg, command);
      const availabilityReason = ambientCliEmbeddingProviderAvailabilityReason(pkg, command);
      const diagnostics = ambientCliEmbeddingProviderDiagnostics(pkg, command);
      const providerLifecycle = command.embeddingProvider.runtimeLifecycle
        ? ambientCliProviderLifecycleWithPackage(command.embeddingProvider.runtimeLifecycle, pkg)
        : undefined;
      return [
        {
          packageId: pkg.id,
          packageName: pkg.name,
          command: command.name,
          capabilityId,
          providerId: capabilityId,
          label: command.embeddingProvider.label ?? providerFallbackLabel(pkg.name, command.name),
          ...(command.description ? { description: command.description } : {}),
          ...(command.embeddingProvider.modelId ? { modelId: command.embeddingProvider.modelId } : {}),
          ...(command.embeddingProvider.dimensions !== undefined ? { dimensions: command.embeddingProvider.dimensions } : {}),
          ...(command.embeddingProvider.local !== undefined ? { local: command.embeddingProvider.local } : {}),
          ...(providerLifecycle ? { providerLifecycle } : {}),
          installed: pkg.installed,
          available: pkg.errors.length === 0 && health !== "failed" && healthPayload?.available !== false,
          availabilityReason,
          diagnostics,
        },
      ];
    });
  });
}

export async function discoverAmbientCliSttProviders(workspacePath: string): Promise<SttProviderCandidate[]> {
  const catalog = await discoverAmbientCliPackages(workspacePath, {
    includeHealth: true,
    healthCommandFilter: (_pkg, command) => Boolean(command.sttProvider),
  });
  return catalog.packages.flatMap((pkg) => {
    return pkg.commands.flatMap((command) => {
      if (!command.sttProvider) return [];
      const capabilityId = ambientCliCapabilityId(pkg.id, "tool", command.name);
      const health = ambientCliCommandHealth(pkg, command);
      const healthPayload = ambientCliSttProviderHealthPayload(pkg, command);
      const availabilityReason = ambientCliSttProviderAvailabilityReason(pkg, command);
      const diagnostics = ambientCliSttProviderDiagnostics(pkg, command);
      return [
        {
          packageId: pkg.id,
          packageName: pkg.name,
          command: command.name,
          capabilityId,
          providerId: capabilityId,
          label: command.sttProvider.label ?? providerFallbackLabel(pkg.name, command.name),
          ...(command.description ? { description: command.description } : {}),
          languages: command.sttProvider.languages,
          ...(command.sttProvider.defaultLanguage ? { defaultLanguage: command.sttProvider.defaultLanguage } : {}),
          ...(command.sttProvider.local !== undefined ? { local: command.sttProvider.local } : {}),
          installed: pkg.installed,
          available: pkg.errors.length === 0 && health !== "failed" && healthPayload?.available !== false,
          availabilityReason,
          diagnostics,
        },
      ];
    });
  });
}

async function readAmbientCliGeneratedMetadata(rootPath: string): Promise<AmbientCliGeneratedPackageMetadata | undefined> {
  const manifestPath = join(rootPath, "capability-build.json");
  if (!existsSync(manifestPath)) return undefined;
  try {
    const manifest = await readJson(manifestPath);
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return undefined;
    const record = manifest as Record<string, unknown>;
    if (record.schemaVersion !== "ambient-capability-builder-v1") return undefined;
    const refs = recordField(record.refs);
    return {
      schemaVersion: "ambient-capability-builder-v1",
      ...(stringField(record.status) ? { status: stringField(record.status) } : {}),
      ...(stringField(record.goal) ? { goal: stringField(record.goal) } : {}),
      ...(stringField(record.installerShape) ? { installerShape: stringField(record.installerShape) } : {}),
      ...(stringField(record.kind) ? { kind: stringField(record.kind) } : {}),
      ...(stringField(record.provider) ? { provider: stringField(record.provider) } : {}),
      outputArtifactTypes: stringArrayField(record.outputArtifactTypes),
      ...(stringField(record.locality) ? { locality: stringField(record.locality) } : {}),
      ...(stringField(record.sourcePath) ? { sourcePath: stringField(record.sourcePath) } : {}),
      ...(stringField(record.lastValidatedAt) ? { lastValidatedAt: stringField(record.lastValidatedAt) } : {}),
      ...(stringField(record.registeredAt) ? { registeredAt: stringField(record.registeredAt) } : {}),
      ...(stringField(record.installedPackageId) ? { installedPackageId: stringField(record.installedPackageId) } : {}),
      ...(stringField(record.installedSource) ? { installedSource: stringField(record.installedSource) } : {}),
      ...(stringField(record.installedVersion) ? { installedVersion: stringField(record.installedVersion) } : {}),
      refs: {
        ...(stringField(refs.latest) ? { latest: stringField(refs.latest) } : {}),
        ...(stringField(refs.installed) ? { installed: stringField(refs.installed) } : {}),
        ...(stringField(refs.lastValidated) ? { lastValidated: stringField(refs.lastValidated) } : {}),
        ...(stringField(refs.lastValidatedHash) ? { lastValidatedHash: stringField(refs.lastValidatedHash) } : {}),
      },
    };
  } catch {
    return undefined;
  }
}

async function readCliDescriptor(rootPath: string, descriptorOverlay?: unknown): Promise<CliDescriptor> {
  if (descriptorOverlay !== undefined) return cliDescriptorSchema.parse(descriptorOverlay);
  const descriptorPath = join(rootPath, cliPackageDescriptorName);
  if (existsSync(descriptorPath)) return cliDescriptorSchema.parse(await readJson(descriptorPath));
  const packageJsonPath = join(rootPath, packageJsonName);
  if (!existsSync(packageJsonPath)) throw new Error(`Missing ${cliPackageDescriptorName} or package.json ambient.cli descriptor.`);
  const pkg = packageJsonSchema.parse(await readJson(packageJsonPath));
  if (!pkg.ambient?.cli && existsSync(join(rootPath, "SKILL.md"))) {
    return cliDescriptorSchema.parse({
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      skills: "./SKILL.md",
      env: [],
      commands: {},
    });
  }
  if (!pkg.ambient?.cli) throw new Error("Missing package.json ambient.cli descriptor.");
  return cliDescriptorSchema.parse({
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    ...pkg.ambient.cli,
  });
}

async function discoverCliSkills(rootPath: string, configuredPath: string): Promise<AmbientCliPackageSkill[]> {
  const skillsRoot = resolve(rootPath, configuredPath);
  if (!isPathInside(rootPath, skillsRoot) || !existsSync(skillsRoot)) return [];
  if (basename(skillsRoot) === "SKILL.md") {
    return [{ ...parseSkillHeader(await readFile(skillsRoot, "utf8")), path: skillsRoot }];
  }
  const rootSkillPath = join(skillsRoot, "SKILL.md");
  if (existsSync(rootSkillPath)) {
    return [{ ...parseSkillHeader(await readFile(rootSkillPath, "utf8")), path: rootSkillPath }];
  }
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const skills: AmbientCliPackageSkill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(skillsRoot, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    skills.push({ ...parseSkillHeader(await readFile(skillPath, "utf8")), path: skillPath });
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

function selectCliPackage(catalog: AmbientCliPackageCatalog, selector: RunAmbientCliInput): AmbientCliPackageSummary {
  return selectCliPackageByIdentity(catalog.packages, selector);
}

function selectCliPackageByIdentity(
  packages: AmbientCliPackageSummary[],
  selector: { packageId?: string; packageName?: string },
): AmbientCliPackageSummary {
  if (selector.packageId) {
    const pkg = packages.find((candidate) => candidate.id === selector.packageId);
    if (!pkg) throw new Error(`Ambient CLI package "${selector.packageId}" was not found.`);
    return pkg;
  }
  if (selector.packageName) {
    const matches = packages.filter((candidate) => candidate.name === selector.packageName);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1)
      throw new Error(`Ambient CLI package name "${selector.packageName}" matched multiple packages. Specify packageId.`);
    throw new Error(`Ambient CLI package "${selector.packageName}" was not found.`);
  }
  throw new Error("packageId or packageName is required.");
}

function resolveCliCwd(
  workspacePath: string,
  packageRoot: string,
  policy: "workspace" | "package",
  requestedCwd: string | undefined,
): string {
  const base = policy === "package" ? packageRoot : workspacePath;
  const cwd = requestedCwd ? resolve(base, requestedCwd) : base;
  if (!isPathInside(base, cwd)) throw new Error("Ambient CLI cwd is outside the descriptor cwd policy.");
  return cwd;
}

function resolveCliExecutable(packageRoot: string, command: string): string {
  if (!command.startsWith(".") && !command.includes("/") && !command.includes("\\")) return command;
  if (isAbsolute(command)) {
    throw new Error(
      `Ambient CLI command uses absolute host path "${command}". Use a bare executable name such as "node" or a package-relative executable such as "./bin/tool"; Ambient adds managed runtime directories to PATH during health checks and execution.`,
    );
  }
  const executable = resolve(packageRoot, command);
  if (!isPathInside(packageRoot, executable)) throw new Error("Ambient CLI command resolves outside the package root.");
  return executable;
}

function validateCliExecutableReference(packageRoot: string, label: string, command: string, errors: string[]): void {
  const executable = command.trim();
  if (!executable) return;
  if (!executable.startsWith(".") && !executable.includes("/") && !executable.includes("\\")) return;
  if (isAbsolute(executable)) {
    errors.push(
      `${label} must not use absolute host path "${executable}". Use a bare executable such as "node" and rely on Ambient's managed runtime PATH, or use a package-relative executable such as "./bin/tool".`,
    );
    return;
  }
  const resolved = resolve(packageRoot, executable);
  if (!isPathInside(packageRoot, resolved)) {
    errors.push(`${label} resolves outside the package root: ${executable}`);
  }
}

function validateCliProviderLifecycleCommands(commands: AmbientCliPackageCommand[], errors: string[]): void {
  const commandNames = new Set(commands.map((command) => command.name));
  for (const command of commands) {
    const lifecycleSources = [
      ["voiceProvider", command.voiceProvider?.runtimeLifecycle],
      ["embeddingProvider", command.embeddingProvider?.runtimeLifecycle],
    ] satisfies Array<[string, LocalRuntimeProviderLifecycleControls | undefined]>;
    for (const [field, lifecycle] of lifecycleSources) {
      if (!lifecycle) continue;
      for (const action of [lifecycle.start, lifecycle.stop, lifecycle.restart]) {
        if (!action) continue;
        if (commandNames.has(action.command)) continue;
        errors.push(
          `Command "${command.name}" ${field}.runtimeLifecycle.${action.kind}.command references undeclared command "${action.command}".`,
        );
      }
    }
  }
}

function normalizeCommandDevicePolicy(input: CommandDevicePolicy): CommandDevicePolicy {
  const prefer = input.prefer?.map((item) => item.trim()).filter(Boolean);
  const cpuReason = input.cpuReason?.trim();
  const forceCpuReason = input.forceCpuReason?.trim();
  const argName = input.argName?.trim();
  return {
    ...(prefer?.length ? { prefer } : {}),
    ...(input.requireReasonWhenCpuForced !== undefined ? { requireReasonWhenCpuForced: input.requireReasonWhenCpuForced } : {}),
    ...(cpuReason ? { cpuReason } : {}),
    ...(forceCpuReason ? { forceCpuReason } : {}),
    ...(argName ? { argName } : {}),
  };
}

function resolveDescriptorArg(packageRoot: string, arg: string): string {
  if (!arg.startsWith("./") && !arg.startsWith("../")) return arg;
  const resolved = resolve(packageRoot, arg);
  if (!isPathInside(packageRoot, resolved)) throw new Error("Ambient CLI descriptor arg resolves outside the package root.");
  return resolved;
}

function ambientCliCommandDescription(
  pkg: AmbientCliPackageSummary,
  command: AmbientCliPackageCommand,
  missingEnv: AmbientCliPackageEnvStatus[],
): AmbientCliCommandDescription {
  return {
    capabilityId: ambientCliCapabilityId(pkg.id, "tool", command.name),
    sourceKind: "ambient-cli",
    name: command.name,
    ...(command.description ? { description: command.description } : {}),
    command: command.command,
    descriptorArgs: command.args,
    cwd: command.cwd,
    health: ambientCliCommandHealth(pkg, command),
    ...(command.timeoutProfile ? { timeoutProfile: command.timeoutProfile } : {}),
    ...(command.progressPatterns?.length ? { progressPatterns: command.progressPatterns } : {}),
    ...(command.devicePolicy ? { devicePolicy: command.devicePolicy } : {}),
    risk: [
      "run_process",
      ...(command.voiceProvider ? ["tts_provider"] : []),
      ...(command.sttProvider ? ["stt_provider"] : []),
      ...(command.embeddingProvider ? ["embedding_provider"] : []),
      ...(missingEnv.length ? ["secret_env_required"] : []),
    ],
    ...(command.voiceProvider ? { voiceProvider: command.voiceProvider } : {}),
    ...(command.sttProvider ? { sttProvider: command.sttProvider } : {}),
    ...(command.embeddingProvider ? { embeddingProvider: command.embeddingProvider } : {}),
    invocation: {
      tool: "ambient_cli",
      packageName: pkg.name,
      command: command.name,
      args: [],
    },
  };
}

async function ambientCliSkillDescription(
  workspacePath: string,
  pkg: AmbientCliPackageSummary,
  skill: AmbientCliPackageSkill,
  input: {
    includeSkill: boolean;
    includeSummary: boolean;
    maxSkillChars: number;
    generateMissingSummaries: boolean;
    modelComplete?: (prompt: string, signal?: AbortSignal) => Promise<string>;
    signal?: AbortSignal;
    now: () => Date;
  },
): Promise<AmbientCliSkillDescription> {
  const skillPath = resolve(skill.path);
  if (!isPathInside(pkg.rootPath, skillPath)) throw new Error(`Ambient CLI skill path is outside the package root: ${skill.path}`);
  const skillRelativePath = relative(pkg.rootPath, skillPath).split(sep).join("/");
  const description: AmbientCliSkillDescription = {
    capabilityId: ambientCliCapabilityId(pkg.id, "skill", skillPath),
    sourceKind: "ambient-cli",
    name: skill.name,
    ...(skill.description ? { description: skill.description } : {}),
    path: skillRelativePath,
    summaryStatus: input.includeSummary ? "missing" : "not_requested",
  };
  if (!input.includeSummary && !input.includeSkill) return description;
  const text = await readFile(skillPath, "utf8");
  const rawSkillHash = contentHash(text);
  if (input.includeSummary) {
    let cached = await readAmbientCliSkillSummary(workspacePath, pkg, skillRelativePath, rawSkillHash, input.now());
    if ((cached.summaryStatus === "missing" || cached.summaryStatus === "stale") && input.generateMissingSummaries && input.modelComplete) {
      cached = await generateAndCacheAmbientCliSkillSummary(workspacePath, pkg, skill, skillRelativePath, text, rawSkillHash, {
        modelComplete: input.modelComplete,
        signal: input.signal,
        now: input.now,
      });
    }
    Object.assign(description, cached);
  }
  if (!input.includeSkill) return description;
  return {
    ...description,
    text: truncateText(text, input.maxSkillChars),
    truncated: text.length > input.maxSkillChars,
  };
}

async function readAmbientCliSkillSummary(
  workspacePath: string,
  pkg: AmbientCliPackageSummary,
  skillRelativePath: string,
  rawSkillHash: string,
  now: Date,
): Promise<Pick<AmbientCliSkillDescription, "summaryStatus" | "summary" | "summaryError" | "summaryRetryAfter">> {
  const cachePath = ambientCliSkillSummaryCachePath(workspacePath, pkg.id, skillRelativePath);
  const installWorkspace = managedInstallWorkspacePath(workspacePath);
  if (!isPathInside(installWorkspace, cachePath))
    return { summaryStatus: "failed", summaryError: "Summary cache path resolves outside Ambient-managed install state." };
  if (!existsSync(cachePath)) return { summaryStatus: "missing" };
  try {
    const value = await readJson(cachePath);
    const failed = cliSkillSummaryFailureSchema.safeParse(value);
    if (failed.success) {
      if (!ambientCliSummaryIdentityMatches(failed.data, pkg, skillRelativePath) || failed.data.rawSkillHash !== rawSkillHash) {
        return { summaryStatus: "missing", summaryError: "Previous summary failure record no longer matches the installed skill." };
      }
      if (Date.parse(failed.data.retryAfter) > now.getTime()) {
        return {
          summaryStatus: "failed",
          summaryError: `Cached summary generation failed: ${failed.data.error}`,
          summaryRetryAfter: failed.data.retryAfter,
        };
      }
      return { summaryStatus: "missing", summaryError: "Previous summary failure retry window has elapsed." };
    }
    const summary = cliSkillSummarySchema.parse(value);
    if (!ambientCliSummaryIdentityMatches(summary, pkg, skillRelativePath)) {
      return { summaryStatus: "stale", summaryError: "Cached summary package identity no longer matches the installed skill." };
    }
    if (summary.rawSkillHash !== rawSkillHash) {
      return { summaryStatus: "stale", summaryError: "Cached summary was generated for older SKILL.md content." };
    }
    return { summaryStatus: "available", summary };
  } catch (error) {
    return { summaryStatus: "failed", summaryError: errorMessage(error) };
  }
}

async function generateAndCacheAmbientCliSkillSummary(
  workspacePath: string,
  pkg: AmbientCliPackageSummary,
  skill: AmbientCliPackageSkill,
  skillRelativePath: string,
  skillText: string,
  rawSkillHash: string,
  options: {
    modelComplete: (prompt: string, signal?: AbortSignal) => Promise<string>;
    signal?: AbortSignal;
    now: () => Date;
  },
): Promise<Pick<AmbientCliSkillDescription, "summaryStatus" | "summary" | "summaryError" | "summaryRetryAfter">> {
  try {
    const result = await executeLambdaRlm({
      text: ambientCliSkillSummaryPrompt(pkg, skill, skillRelativePath, skillText),
      taskType: "extraction",
      contextWindowChars: 100_000,
      maxModelCalls: 6,
      signal: options.signal,
      modelComplete: options.modelComplete,
    });
    const parsed = parseAmbientCliSkillSummaryJson(result.response);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("RLM summary response JSON must be an object.");
    const summary = cliSkillSummarySchema.parse({
      ...parsed,
      schemaVersion: cliSkillSummarySchemaVersion,
      packageId: pkg.id,
      packageName: pkg.name,
      packageSource: pkg.source,
      ...(pkg.version ? { packageVersion: pkg.version } : {}),
      skillPath: skillRelativePath,
      rawSkillHash,
      generatedAt: options.now().toISOString(),
    });
    await writeAmbientCliSkillSummary(workspacePath, summary);
    return { summaryStatus: "available", summary };
  } catch (error) {
    const failedAt = options.now();
    const retryAfter = new Date(failedAt.getTime() + 6 * 60 * 60 * 1000).toISOString();
    const failure: AmbientCliSkillSummaryFailure = {
      schemaVersion: cliSkillSummarySchemaVersion,
      status: "failed",
      packageId: pkg.id,
      packageName: pkg.name,
      packageSource: pkg.source,
      ...(pkg.version ? { packageVersion: pkg.version } : {}),
      skillPath: skillRelativePath,
      rawSkillHash,
      failedAt: failedAt.toISOString(),
      retryAfter,
      error: truncateText(errorMessage(error), 1_000),
    };
    await writeAmbientCliSkillSummaryFailure(workspacePath, failure);
    return {
      summaryStatus: "failed",
      summaryError: `RLM summary generation failed: ${failure.error}`,
      summaryRetryAfter: retryAfter,
    };
  }
}

async function writeAmbientCliSkillSummaryFailure(workspacePath: string, failure: AmbientCliSkillSummaryFailure): Promise<string> {
  const parsed = cliSkillSummaryFailureSchema.parse(failure);
  const cachePath = ambientCliSkillSummaryCachePath(workspacePath, parsed.packageId, parsed.skillPath);
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return cachePath;
}

function ambientCliSummaryIdentityMatches(
  summary: Pick<AmbientCliSkillSummary, "packageId" | "packageName" | "packageSource" | "packageVersion" | "skillPath">,
  pkg: AmbientCliPackageSummary,
  skillRelativePath: string,
): boolean {
  return (
    summary.packageId === pkg.id &&
    summary.packageName === pkg.name &&
    summary.packageSource === pkg.source &&
    summary.packageVersion === pkg.version &&
    summary.skillPath === skillRelativePath
  );
}

function ambientCliSkillSummaryPrompt(
  pkg: AmbientCliPackageSummary,
  skill: AmbientCliPackageSkill,
  skillRelativePath: string,
  skillText: string,
): string {
  return [
    "Create a concise Ambient CLI skill summary for model-facing capability discovery.",
    "Return ONLY a JSON object with these keys: capabilityBrief, whenToUse, commands, arguments, safety, fallbacks.",
    "Rules:",
    "- capabilityBrief: one or two concise sentences.",
    "- whenToUse, arguments, safety, fallbacks: arrays of short strings.",
    "- commands: object keyed by descriptor command name with short usage notes.",
    "- Do not include secrets, raw env values, markdown fences, or commentary outside JSON.",
    "",
    `Package: ${pkg.name}`,
    pkg.version ? `Version: ${pkg.version}` : undefined,
    pkg.description ? `Package description: ${pkg.description}` : undefined,
    `Skill: ${skill.name}`,
    skill.description ? `Skill description: ${skill.description}` : undefined,
    `Skill path: ${skillRelativePath}`,
    "Descriptor commands:",
    JSON.stringify(
      pkg.commands.map((command) => ({ name: command.name, description: command.description, args: command.args, cwd: command.cwd })),
      null,
      2,
    ),
    "Env requirements:",
    JSON.stringify(
      pkg.envRequirements.map((env) => ({ name: env.name, description: env.description, required: env.required })),
      null,
      2,
    ),
    "SKILL.md:",
    skillText,
  ]
    .filter(Boolean)
    .join("\n");
}

function parseAmbientCliSkillSummaryJson(value: string): unknown {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("RLM summary response was not valid JSON.");
  }
}

function ambientCliSkillSummaryCachePath(workspacePath: string, packageId: string, skillRelativePath: string): string {
  return resolve(
    managedInstallWorkspacePath(workspacePath),
    cliSkillSummaryCacheRoot,
    `${shortHash(`${packageId}:${skillRelativePath}`)}.json`,
  );
}

function ambientCliDescribeGuidance(
  pkg: AmbientCliPackageSummary,
  commands: AmbientCliPackageCommand[],
  missingEnv: AmbientCliPackageEnvStatus[],
): string[] {
  return [
    "Use ambient_cli with the exact packageName and command from this description.",
    ...commands.map((command) => `ambient_cli packageName="${pkg.name}" command="${command.name}" args=[...]`),
    ...(missingEnv.length
      ? [
          `Missing required env: ${missingEnv.map((env) => env.name).join(", ")}.`,
          "Use ambient_cli_secret_request or ambient_cli_env_bind before ambient_cli. Never pass secret values as args.",
        ]
      : []),
    "ambient_cli execution still requires Desktop approval unless an existing grant applies.",
  ];
}

function ambientCliCapabilitySearchResult(
  pkg: AmbientCliPackageSummary,
  input: {
    envStatus: AmbientCliPackageEnvStatus[];
    query: string;
    kind: AmbientCliCapabilitySearchKind;
    command?: string;
  },
): AmbientCliCapabilitySearchResult | undefined {
  const selectedCommands = input.command ? pkg.commands.filter((command) => command.name === input.command) : pkg.commands;
  if (input.command && selectedCommands.length === 0) return undefined;
  const missingEnv = requiredMissingEnv(input.envStatus).map((env) => env.name);
  const commands =
    input.kind === "skill"
      ? []
      : selectedCommands.map((command) => ({
          capabilityId: ambientCliCapabilityId(pkg.id, "tool", command.name),
          sourceKind: "ambient-cli" as const,
          name: command.name,
          ...(command.description ? { description: truncateText(command.description, 220) } : {}),
          cwd: command.cwd,
          health: ambientCliCommandHealth(pkg, command),
          risk: [
            "run_process",
            ...(command.voiceProvider ? ["tts_provider"] : []),
            ...(command.sttProvider ? ["stt_provider"] : []),
            ...(command.embeddingProvider ? ["embedding_provider"] : []),
            ...(missingEnv.length ? ["secret_env_required"] : []),
          ],
          ...(command.voiceProvider ? { voiceProvider: command.voiceProvider } : {}),
          ...(command.sttProvider ? { sttProvider: command.sttProvider } : {}),
          ...(command.embeddingProvider ? { embeddingProvider: command.embeddingProvider } : {}),
        }));
  const skills =
    input.kind === "command"
      ? []
      : pkg.skills.map((skill) => ({
          capabilityId: ambientCliCapabilityId(pkg.id, "skill", skill.path),
          sourceKind: "ambient-cli" as const,
          name: skill.name,
          ...(skill.description ? { description: truncateText(skill.description, 220) } : {}),
          path: relative(pkg.rootPath, resolve(skill.path)).split(sep).join("/"),
        }));
  if (input.kind === "command" && commands.length === 0) return undefined;
  if (input.kind === "skill" && skills.length === 0) return undefined;

  const availability = pkg.errors.length === 0 ? "available" : "unavailable";
  const availabilityReason = pkg.errors[0] ?? "Installed Ambient CLI package is available; execution still requires ambient_cli approval.";
  const score = scoreAmbientCliPackage(pkg, { query: input.query, kind: input.kind, command: input.command });
  if (input.query && score <= 0) return undefined;
  return {
    packageId: pkg.id,
    registryPluginId: ambientCliRegistryPluginId(pkg.id),
    sourceKind: "ambient-cli",
    packageName: pkg.name,
    ...(pkg.version ? { version: pkg.version } : {}),
    ...(pkg.description ? { description: truncateText(pkg.description, 260) } : {}),
    installed: pkg.installed,
    availability,
    availabilityReason,
    commands,
    skills,
    missingEnv,
    whyMatched: ambientCliWhyMatched(pkg, { query: input.query, command: input.command }).slice(0, 5),
    score,
  };
}

function normalizeVoiceProviderCommandMetadata(
  input: z.infer<typeof cliCommandSchema>["voiceProvider"],
): AmbientCliVoiceProviderCommandMetadata {
  return {
    ...(input?.label?.trim() ? { label: input.label.trim() } : {}),
    defaultFormat: input?.defaultFormat ?? "wav",
    formats: input?.formats?.length ? input.formats : ["wav"],
    voices: input?.voices?.length
      ? input.voices.map((voice) => ({ id: voice.id, ...(voice.label ? { label: voice.label } : {}) }))
      : [{ id: "default" }],
    ...(input?.local !== undefined ? { local: input.local } : {}),
    ...(input?.voiceDiscovery ? { voiceDiscovery: normalizeVoiceDiscoveryMetadata(input.voiceDiscovery) } : {}),
    ...(input?.voiceCloning ? { voiceCloning: normalizeVoiceCloningMetadata(input.voiceCloning) } : {}),
    ...(input?.runtimeLifecycle ? { runtimeLifecycle: normalizeProviderLifecycleControls(input.runtimeLifecycle) } : {}),
  };
}

function normalizeEmbeddingProviderCommandMetadata(
  input: z.infer<typeof cliCommandSchema>["embeddingProvider"],
): AmbientCliEmbeddingProviderCommandMetadata {
  return {
    ...(input?.label?.trim() ? { label: input.label.trim() } : {}),
    ...(input?.modelId?.trim() ? { modelId: input.modelId.trim() } : {}),
    ...(input?.dimensions !== undefined ? { dimensions: input.dimensions } : {}),
    ...(input?.local !== undefined ? { local: input.local } : {}),
    ...(input?.runtimeLifecycle ? { runtimeLifecycle: normalizeProviderLifecycleControls(input.runtimeLifecycle) } : {}),
  };
}

function normalizeProviderLifecycleControls(input: z.infer<typeof cliRuntimeLifecycleSchema>): LocalRuntimeProviderLifecycleControls {
  const start = normalizeProviderLifecycleAction("start", input.start);
  const stop = normalizeProviderLifecycleAction("stop", input.stop);
  const restart = normalizeProviderLifecycleAction("restart", input.restart);
  return {
    schemaVersion: "ambient-local-runtime-provider-lifecycle-v1",
    providerKind: "ambient-cli",
    ...(start ? { start } : {}),
    ...(stop ? { stop } : {}),
    ...(restart ? { restart } : {}),
  };
}

function normalizeProviderLifecycleAction(
  kind: LocalRuntimeProviderLifecycleActionKind,
  input: z.infer<typeof cliRuntimeLifecycleActionSchema> | undefined,
): LocalRuntimeProviderLifecycleControls[LocalRuntimeProviderLifecycleActionKind] | undefined {
  if (!input) return undefined;
  const command = input?.command.trim();
  if (!command) return undefined;
  return {
    schemaVersion: "ambient-local-runtime-provider-lifecycle-action-v1",
    kind,
    providerKind: "ambient-cli",
    command,
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
  };
}

function normalizeSttProviderCommandMetadata(input: z.infer<typeof cliCommandSchema>["sttProvider"]): AmbientCliSttProviderCommandMetadata {
  const languages = Array.from(new Set((input?.languages ?? []).map((language) => language.trim()).filter(Boolean)));
  return {
    ...(input?.label?.trim() ? { label: input.label.trim() } : {}),
    languages,
    ...(input?.defaultLanguage?.trim() ? { defaultLanguage: input.defaultLanguage.trim() } : {}),
    ...(input?.local !== undefined ? { local: input.local } : {}),
  };
}

function normalizeVoiceDiscoveryMetadata(
  input: NonNullable<NonNullable<z.infer<typeof cliCommandSchema>["voiceProvider"]>["voiceDiscovery"]>,
): VoiceProviderDiscoveryMetadata {
  return {
    command: input.command.trim(),
    ...(input.cacheTtlSeconds !== undefined ? { cacheTtlSeconds: input.cacheTtlSeconds } : {}),
    ...(input.requiresNetwork !== undefined ? { requiresNetwork: input.requiresNetwork } : {}),
    ...(input.requiresSecret?.length ? { requiresSecret: input.requiresSecret.map((name) => name.trim()).filter(Boolean) } : {}),
    ...(input.source ? { source: input.source } : {}),
  };
}

function normalizeVoiceCloningMetadata(
  input: NonNullable<NonNullable<z.infer<typeof cliCommandSchema>["voiceProvider"]>["voiceCloning"]>,
): VoiceProviderCloningMetadata {
  return {
    supported: input.supported,
    ...(input.createCommand?.trim() ? { createCommand: input.createCommand.trim() } : {}),
    ...(input.statusCommand?.trim() ? { statusCommand: input.statusCommand.trim() } : {}),
    ...(input.deleteCommand?.trim() ? { deleteCommand: input.deleteCommand.trim() } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.inputs
      ? {
          inputs: {
            audioFormats: Array.from(
              new Set((input.inputs.audioFormats ?? []).map((format) => format.trim().replace(/^\./, "").toLowerCase()).filter(Boolean)),
            ),
            ...(input.inputs.minDurationSeconds !== undefined ? { minDurationSeconds: input.inputs.minDurationSeconds } : {}),
            ...(input.inputs.maxDurationSeconds !== undefined ? { maxDurationSeconds: input.inputs.maxDurationSeconds } : {}),
            ...(input.inputs.minSamples !== undefined ? { minSamples: input.inputs.minSamples } : {}),
            ...(input.inputs.maxSamples !== undefined ? { maxSamples: input.inputs.maxSamples } : {}),
            ...(input.inputs.transcript ? { transcript: input.inputs.transcript } : {}),
          },
        }
      : {}),
    requiresConsent: input.requiresConsent ?? true,
    ...(input.requiresSecret?.length ? { requiresSecret: input.requiresSecret.map((name) => name.trim()).filter(Boolean) } : {}),
    ...(input.networkHosts?.length ? { networkHosts: input.networkHosts.map((host) => host.trim()).filter(Boolean) } : {}),
    ...(input.costNote?.trim() ? { costNote: input.costNote.trim() } : {}),
    ...(input.privacyNote?.trim() ? { privacyNote: input.privacyNote.trim() } : {}),
    ...(input.output
      ? {
          output: {
            creates: Array.from(new Set(input.output.creates ?? [])),
            ...(input.output.appearsInDynamicCatalog !== undefined
              ? { appearsInDynamicCatalog: input.output.appearsInDynamicCatalog }
              : {}),
          },
        }
      : {}),
  };
}

function scoreAmbientCliPackage(
  pkg: AmbientCliPackageSummary,
  input: { query: string; kind: AmbientCliCapabilitySearchKind; command?: string },
): number {
  let score = pkg.errors.length === 0 ? 2 : 0;
  if (input.command) score += 8;
  if (!input.query) return score + 1;
  const terms = searchTerms(input.query);
  const packageText = searchBlob([pkg.name, pkg.description, pkg.version]);
  const commandText = searchBlob(
    pkg.commands.map((command) => [command.name, command.description, command.command, command.args.join(" ")].join(" ")),
  );
  const skillText = searchBlob(pkg.skills.map((skill) => [skill.name, skill.description].join(" ")));
  const envText = searchBlob(pkg.envRequirements.map((env) => [env.name, env.description].join(" ")));
  for (const term of terms) {
    if (packageText.includes(term)) score += 5;
    if (input.kind !== "skill" && commandText.includes(term)) score += 4;
    if (input.kind !== "command" && skillText.includes(term)) score += 4;
    if (envText.includes(term)) score += 2;
  }
  return score;
}

function ambientCliWhyMatched(pkg: AmbientCliPackageSummary, input: { query: string; command?: string }): string[] {
  const reasons: string[] = [];
  if (input.command) reasons.push(`command:${input.command}`);
  if (!input.query) return reasons.length ? reasons : ["installed package"];
  const terms = searchTerms(input.query);
  for (const term of terms) {
    if (normalizeSearchText(pkg.name).includes(term)) reasons.push(`package:${pkg.name}`);
    for (const command of pkg.commands) {
      if (searchBlob([command.name, command.description]).includes(term)) reasons.push(`command:${command.name}`);
    }
    for (const skill of pkg.skills) {
      if (searchBlob([skill.name, skill.description]).includes(term)) reasons.push(`skill:${skill.name}`);
    }
    for (const env of pkg.envRequirements) {
      if (searchBlob([env.name, env.description]).includes(term)) reasons.push(`env:${env.name}`);
    }
  }
  return [...new Set(reasons)];
}

function searchTerms(value: string): string[] {
  return normalizeSearchText(value).split(/\s+/).filter(Boolean);
}

function searchBlob(values: Array<string | undefined>): string {
  return normalizeSearchText(values.filter(Boolean).join(" "));
}

function normalizeSearchText(value: unknown): string {
  return typeof value === "string"
    ? value
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[_./:-]+/g, " ")
        .trim()
        .toLowerCase()
    : "";
}

export function bundledAmbientCliPackageRootCandidates(
  packageDir: string,
  options: BundledAmbientCliPackageRootCandidateOptions = {},
): string[] {
  const moduleDir = dirname(options.moduleFilePath ?? fileURLToPath(import.meta.url));
  const env = options.env ?? process.env;
  const resourcesPath = options.resourcesPath ?? process.resourcesPath;
  const candidates = [
    ...(options.bundledPackageRootPath ? [resolve(options.bundledPackageRootPath, packageDir)] : []),
    ...(env.INIT_CWD ? [resolve(env.INIT_CWD, "resources", "ambient-cli-packages", packageDir)] : []),
    ...(env.PWD ? [resolve(env.PWD, "resources", "ambient-cli-packages", packageDir)] : []),
    resolve(options.cwd ?? process.cwd(), "resources", "ambient-cli-packages", packageDir),
    resolve(moduleDir, "..", "resources", "ambient-cli-packages", packageDir),
    resolve(moduleDir, "..", "..", "resources", "ambient-cli-packages", packageDir),
    resolve(moduleDir, "..", "..", "..", "resources", "ambient-cli-packages", packageDir),
    ...(resourcesPath ? [resolve(resourcesPath, "ambient-cli-packages", packageDir)] : []),
  ];
  return [...new Set(candidates)];
}

function resolveBundledAmbientCliPackageRoot(packageDir: string, options: EnsureFirstPartyAmbientCliPackagesOptions): string {
  const candidates = bundledAmbientCliPackageRootCandidates(packageDir, options);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`Bundled Ambient CLI package "${packageDir}" was not found. Checked: ${candidates.join(", ")}`);
  }
  return found;
}

function reviewedBundledAmbientCliPackageRootCandidates(packageDir: string): string[] {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const resourcesPath = process.resourcesPath;
  const candidates = [
    ...(resourcesPath ? [resolve(resourcesPath, "ambient-cli-packages", packageDir)] : []),
    resolve(moduleDir, "..", "resources", "ambient-cli-packages", packageDir),
    resolve(moduleDir, "..", "..", "resources", "ambient-cli-packages", packageDir),
    resolve(moduleDir, "..", "..", "..", "resources", "ambient-cli-packages", packageDir),
  ];
  return [...new Set(candidates)];
}

function resolveReviewedBundledAmbientCliPackageRoot(firstParty: BundledFirstPartyAmbientCliPackage): string {
  const candidates = reviewedBundledAmbientCliPackageRootCandidates(firstParty.packageDir);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Reviewed bundled Ambient CLI package "${firstParty.packageName}" was not found. Checked trusted locations: ${candidates.join(", ")}`,
    );
  }
  return found;
}

function isBundledAmbientCliInstallSource(source: string): boolean {
  return source.trim().startsWith("bundled:");
}

function resolveFirstPartyBundledAmbientCliPackage(source: string): BundledFirstPartyAmbientCliPackage | undefined {
  const trimmed = source.trim();
  if (!isBundledAmbientCliInstallSource(trimmed)) return undefined;
  const name = trimmed.slice("bundled:".length).trim();
  const found = firstPartyAmbientCliPackages.find(
    (pkg) => pkg.kind === "bundled" && (pkg.source === trimmed || pkg.packageName === name || pkg.packageDir === name),
  );
  return found?.kind === "bundled" ? found : undefined;
}

function bundledAmbientCliInstallUnsupportedFields(input: NormalizedInstallInput): string[] {
  return [
    input.path ? "path" : undefined,
    input.ref ? "ref" : undefined,
    input.sha ? "sha" : undefined,
    input.descriptor !== undefined ? "descriptor" : undefined,
    input.installDependencies ? "installDependencies" : undefined,
  ].filter((value): value is string => Boolean(value));
}

function normalizeInstallInput(input: InstallAmbientCliPackageInput): NormalizedInstallInput {
  return {
    source: input.source.trim(),
    ...(input.path?.trim() ? { path: input.path.trim() } : {}),
    ...(input.ref?.trim() ? { ref: input.ref.trim() } : {}),
    ...(input.sha?.trim() ? { sha: input.sha.trim() } : {}),
    ...(input.descriptor !== undefined ? { descriptor: input.descriptor } : {}),
    ...(input.installDependencies ? { installDependencies: true } : {}),
  };
}

function redactedInstallInput(input: NormalizedInstallInput): NormalizedInstallInput {
  return { ...input, source: redactGitSourceCredentials(input.source) };
}

async function upsertCliPackageConfig(workspacePath: string, source: string, packageName?: string): Promise<void> {
  const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
  const configPath = join(installWorkspace, cliPackageConfigPath);
  await mkdir(dirname(configPath), { recursive: true });
  const existing = existsSync(configPath) ? cliPackageConfigSchema.parse(await readJson(configPath)) : { packages: [] };
  const packages: z.infer<typeof cliPackageConfigSchema>["packages"] = [];
  for (const entry of existing.packages) {
    if (entry.source === source) continue;
    if (packageName && (await cliPackageEntryName(workspacePath, installWorkspace, entry.source)) === packageName) continue;
    packages.push(entry);
  }
  packages.push({ source });
  await writeFile(configPath, `${JSON.stringify({ packages }, null, 2)}\n`, "utf8");
  await markAmbientCliWorkspaceProviderState(workspacePath, { reason: "package-config", packageName });
}

async function cliPackageEntryName(workspacePath: string, installWorkspace: string, source: string): Promise<string | undefined> {
  const rootPath = resolveAmbientCliPackageSourcePath(workspacePath, installWorkspace, source);
  if (!isPathInside(installWorkspace, rootPath) && !isPathInside(resolve(workspacePath), rootPath)) return undefined;
  const descriptorPath = join(rootPath, "ambient-cli.json");
  if (!existsSync(descriptorPath)) return undefined;
  try {
    const descriptor = await readJson(descriptorPath);
    return typeof descriptor === "object" &&
      descriptor &&
      !Array.isArray(descriptor) &&
      typeof (descriptor as { name?: unknown }).name === "string"
      ? (descriptor as { name: string }).name
      : undefined;
  } catch {
    return undefined;
  }
}

async function removeCliPackageConfig(workspacePath: string, source: string): Promise<void> {
  const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
  const configPath = join(installWorkspace, cliPackageConfigPath);
  const existing = existsSync(configPath) ? cliPackageConfigSchema.parse(await readJson(configPath)) : { packages: [] };
  const packages = existing.packages.filter((entry) => entry.source !== source);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify({ packages }, null, 2)}\n`, "utf8");
  await markAmbientCliWorkspaceProviderState(workspacePath, { reason: "package-config-removed" });
}

function parseSkillHeader(content: string): Pick<AmbientCliPackageSkill, "name" | "description"> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: "unknown" };
  const header = match[1];
  const name = header.match(/^name:\s*(.+)$/m)?.[1]?.trim() || "unknown";
  const description = header.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return { name, ...(description ? { description } : {}) };
}

function normalizeEnvRequirements(value: z.infer<typeof cliEnvRequirementSchema>[]): AmbientCliPackageEnvRequirement[] {
  return value.map((item) => {
    if (typeof item === "string") return { name: normalizeEnvName(item), required: true };
    return {
      name: normalizeEnvName(item.name),
      ...(item.description ? { description: item.description } : {}),
      required: item.required,
    };
  });
}

function normalizeEnvName(value: string): string {
  const name = value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Invalid environment variable name: ${value}`);
  return name;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function recordField(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function safeName(value: string): string {
  return (
    value
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "cli-package"
  );
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function contentHash(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isErrno(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === code);
}
