import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type {
  EmbeddingProviderCandidate,
  EmbeddingProviderDiagnostics,
  EmbeddingProviderRuntimeState,
  LocalRuntimeProviderLifecycleActionKind,
  LocalRuntimeProviderLifecycleControls,
  SttProviderCandidate,
  SttProviderDiagnostics,
  VoiceOutputFormat,
  VoiceProviderCandidate,
  VoiceProviderCloningMetadata,
  VoiceProviderDiagnostics,
  VoiceProviderDiscoveryMetadata,
  VoiceProviderRuntimeState,
} from "../../shared/localRuntimeTypes";
import { isPathInside } from "./ambientCliSessionFacade";
import { executeLambdaRlm, materializeTextOutput, type MaterializedTextOutput } from "../tool-runtime/toolRuntimeAmbientCliContract";
import { ambientRuntimeEnv, managedInstallWorkspacePath, migrateWorkspaceManagedInstallPath } from "../setup/setupAmbientCliContract";
import {
  buildSafeProcessEnv,
  hardenedGitEnv,
  isSecretEnvName,
  isSecretReference,
  normalizeGitRepositoryUrl,
  readSecretReference,
  redactGitSourceCredentials,
  safeGitCloneSource,
  saveSecretReference,
  secretReferenceFor,
} from "../security/securityAmbientCliContract";
import {
  commandTimeoutProfileNames,
  executeProfiledCommand,
  type CommandDevicePolicy,
  type CommandDeviceSelection,
  type CommandTimeoutProfile,
} from "../tool-runtime/commandExecutionProfiles";

const execFileAsync = promisify(execFile);
const cliPackageConfigPath = ".ambient/cli-packages/packages.json";
const cliPackageEnvBindingsPath = ".ambient/cli-packages/env-bindings.json";
export const ambientCliWorkspaceProviderMarkerPath = ".ambient/cli-packages/workspace-provider-state.json";
const legacyVoiceDiscoveryCachePath = ".ambient/voice/voice-discovery-cache.json";
const legacyQwenSttValidationMetadataPath = ".ambient/stt/qwen3-asr/validation.json";
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

const cliPackageEnvBindingSchema = z
  .object({
    packageName: z.string().min(1),
    envName: z.string().min(1),
    filePath: z.string().min(1).optional(),
    secretRef: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.filePath || value.secretRef), { message: "Ambient CLI env binding requires filePath or secretRef." });

const cliPackageEnvBindingsSchema = z
  .object({
    bindings: z.array(cliPackageEnvBindingSchema).default([]),
  })
  .passthrough();

type AmbientCliPackageEnvBindingRow = z.infer<typeof cliPackageEnvBindingSchema>;
type AmbientCliEnvBindingResolution = { source: "file"; filePath: string } | { source: "managed-secret"; secretRef: string };

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

export interface DiscoverAmbientCliPackagesOptions {
  includeHealth?: boolean;
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
  candidate?: AmbientCliPackageSummary;
  dependencyInstall?: AmbientCliPackageDependencyInstallResult;
  envStatus: AmbientCliPackageEnvStatus[];
  healthChecks: AmbientCliPackageHealthCheckResult[];
  installable: boolean;
  errors: string[];
}

export interface AmbientCliPiCatalogResolution {
  source: string;
  npmPackageName: string;
  npmVersion: string;
  repositoryUrl: string;
  repositoryDirectory: string;
  sha: string;
  adapter: "pi-arxiv" | "youtube-transcript" | "brave-search";
  installDependencies?: boolean;
  securityScan: string[];
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
type ClonedCliPackage = { repoPath: string; packageRoot: string };

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
  const lockKey = options.includeHealth ? resolve(workspacePath) : undefined;
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
      packages.push(options.includeHealth ? await withAmbientCliPackageHealth(workspacePath, inspected) : inspected);
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

async function withAmbientCliPackageHealth(workspacePath: string, pkg: AmbientCliPackageSummary): Promise<AmbientCliPackageSummary> {
  if (pkg.errors.length > 0) return pkg;
  const healthChecks = await checkAmbientCliPackageHealth(pkg, { workspacePath });
  return healthChecks.length ? { ...pkg, healthChecks } : pkg;
}

export async function installAmbientCliPackageSource(
  workspacePath: string,
  input: InstallAmbientCliPackageInput,
): Promise<AmbientCliPackageSummary> {
  const normalized = normalizeInstallInput(input);
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
  const inspected = await inspectAmbientCliPackage(workspacePath, sourcePath, normalized.source, normalized.descriptor);
  if (inspected.errors.length) throw new Error(`Ambient CLI package is invalid: ${inspected.errors.join("; ")}`);
  if (!inspected.commands.length) throw new Error("Ambient CLI package descriptor does not declare any commands.");

  const importName = safeName(`${inspected.name}-${inspected.version ?? "local"}-${shortHash(sourcePath)}`);
  const destination = resolve(installWorkspace, cliPackageImportRoot, importName);
  if (!isPathInside(installWorkspace, destination))
    throw new Error("Resolved Ambient CLI import path is outside Ambient-managed install state.");
  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  try {
    await cp(sourcePath, destination, { recursive: true, force: true, dereference: false });
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

export async function installAmbientCliPackagePiCatalogSource(workspacePath: string, source: string): Promise<AmbientCliPackageSummary> {
  const preview = await previewAmbientCliPackagePiCatalogSource(workspacePath, source);
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
    const importName = safeName(`${inspected.name}-${inspected.version ?? "pi"}-${shortHash([source, resolution.sha].join(":"))}`);
    const destination = resolve(installWorkspace, cliPackageImportRoot, importName);
    if (!isPathInside(installWorkspace, destination))
      throw new Error("Resolved Ambient CLI import path is outside Ambient-managed install state.");
    await rm(destination, { recursive: true, force: true });
    await mkdir(dirname(destination), { recursive: true });
    try {
      await cp(packageRoot, destination, { recursive: true, force: true, dereference: false });
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
  const candidate = await inspectAmbientCliPackage(workspacePath, packageRoot, source, input.descriptor);
  const identityErrors =
    expectedPackageName && candidate.name !== expectedPackageName
      ? [`Bundled Ambient CLI package identity mismatch: expected "${expectedPackageName}", got "${candidate.name}".`]
      : [];
  const dependencyInstall =
    input.installDependencies && candidate.errors.length === 0 && identityErrors.length === 0
      ? await installAmbientCliPackageDependencies(packageRoot)
      : undefined;
  const envStatus = await resolveAmbientCliEnvStatus(workspacePath, candidate);
  const healthChecks =
    candidate.errors.length || identityErrors.length || (dependencyInstall && !dependencyInstall.passed)
      ? []
      : await checkAmbientCliPackageHealth(candidate, { workspacePath });
  const errors = [
    ...candidate.errors,
    ...identityErrors,
    ...envStatus.filter((env) => env.error).map((env) => `env: ${env.name}: ${env.error}`),
    ...(dependencyInstall && !dependencyInstall.passed
      ? [`dependencies: ${dependencyInstall.error ?? dependencyInstall.stderr ?? dependencyInstall.reason ?? "failed"}`]
      : []),
    ...healthChecks.filter((check) => !check.passed).map((check) => `${check.commandName}: ${check.error ?? check.stderr ?? "failed"}`),
  ];
  if (!candidate.commands.length) errors.push("Ambient CLI package descriptor does not declare any commands.");
  return {
    ...input,
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
  options: { workspacePath?: string } = {},
): Promise<AmbientCliPackageHealthCheckResult[]> {
  const checks = pkg.commands.filter((command) => command.healthCheck?.length);
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
  const catalog = await discoverAmbientCliPackages(workspacePath);
  return catalog.packages.flatMap((pkg) => (pkg.errors.length ? [] : pkg.skills.map((skill) => dirname(skill.path))));
}

export async function searchAmbientCliCapabilities(
  workspacePath: string,
  input: AmbientCliCapabilitySearchInput = {},
): Promise<AmbientCliCapabilitySearchResponse> {
  const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 8), 20));
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
  const catalog = await discoverAmbientCliPackages(workspacePath, { includeHealth: true });
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

export async function setAmbientCliPackageEnvBinding(
  workspacePath: string,
  input: AmbientCliPackageEnvBindingInput,
): Promise<AmbientCliPackageEnvStatus> {
  const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
  const packageName = input.packageName.trim();
  if (!packageName) throw new Error("Ambient CLI env binding packageName is required.");
  const envName = normalizeEnvName(input.envName);
  const absolutePath = resolve(workspacePath, input.filePath);
  if (!isPathInside(workspacePath, absolutePath)) throw new Error("Ambient CLI env binding file must stay inside the workspace.");
  if (!existsSync(absolutePath)) throw new Error("Ambient CLI env binding file was not found.");
  const value = (await readFile(absolutePath, "utf8")).trim();
  if (!value) throw new Error("Ambient CLI env binding file is empty.");
  const filePath = `./${relative(workspacePath, absolutePath).split(sep).join("/")}`;
  const bindingsPath = join(installWorkspace, cliPackageEnvBindingsPath);
  const existing = existsSync(bindingsPath) ? cliPackageEnvBindingsSchema.parse(await readJson(bindingsPath)) : { bindings: [] };
  const bindings = [
    ...existing.bindings.filter((binding) => binding.packageName !== packageName || normalizeEnvName(binding.envName) !== envName),
    { packageName, envName, filePath },
  ].sort((left, right) => left.packageName.localeCompare(right.packageName) || left.envName.localeCompare(right.envName));
  await mkdir(dirname(bindingsPath), { recursive: true });
  await writeFile(bindingsPath, `${JSON.stringify({ bindings }, null, 2)}\n`, "utf8");
  await markAmbientCliWorkspaceProviderState(workspacePath, { reason: "env-binding", packageName });
  return {
    name: envName,
    required: true,
    configured: true,
    source: "file",
    filePath,
  };
}

export async function setAmbientCliPackageSecretBinding(
  workspacePath: string,
  input: { packageName: string; envName: string; secretRef: string },
): Promise<AmbientCliPackageEnvStatus> {
  const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
  const packageName = input.packageName.trim();
  if (!packageName) throw new Error("Ambient CLI env binding packageName is required.");
  const envName = normalizeEnvName(input.envName);
  const secretRef = input.secretRef.trim();
  if (!isSecretReference(secretRef)) throw new Error("Ambient CLI secret reference is invalid.");
  const value = (await readSecretReference(secretRef))?.trim();
  if (!value) throw new Error("Ambient CLI secret reference is empty or missing.");
  const bindingsPath = join(installWorkspace, cliPackageEnvBindingsPath);
  const existing = existsSync(bindingsPath) ? cliPackageEnvBindingsSchema.parse(await readJson(bindingsPath)) : { bindings: [] };
  const bindings = [
    ...existing.bindings.filter((binding) => binding.packageName !== packageName || normalizeEnvName(binding.envName) !== envName),
    { packageName, envName, secretRef },
  ].sort((left, right) => left.packageName.localeCompare(right.packageName) || left.envName.localeCompare(right.envName));
  await mkdir(dirname(bindingsPath), { recursive: true });
  await writeFile(bindingsPath, `${JSON.stringify({ bindings }, null, 2)}\n`, "utf8");
  await markAmbientCliWorkspaceProviderState(workspacePath, { reason: "secret-binding", packageName });
  return {
    name: envName,
    required: true,
    configured: true,
    source: "managed-secret",
    secretRef,
  };
}

export async function removeAmbientCliPackageEnvBindings(
  workspacePath: string,
  input: { packageName: string; envNames?: string[] },
): Promise<number> {
  const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
  const packageName = input.packageName.trim();
  if (!packageName) throw new Error("Ambient CLI env binding packageName is required.");
  const bindingsPath = join(installWorkspace, cliPackageEnvBindingsPath);
  if (!existsSync(bindingsPath)) return 0;
  const existing = cliPackageEnvBindingsSchema.parse(await readJson(bindingsPath));
  const envNames = input.envNames?.length ? new Set(input.envNames.map((name) => normalizeEnvName(name))) : undefined;
  const bindings = existing.bindings.filter((binding) => {
    if (binding.packageName !== packageName) return true;
    return envNames ? !envNames.has(normalizeEnvName(binding.envName)) : false;
  });
  const removed = existing.bindings.length - bindings.length;
  if (!removed) return 0;
  await mkdir(dirname(bindingsPath), { recursive: true });
  await writeFile(bindingsPath, `${JSON.stringify({ bindings }, null, 2)}\n`, "utf8");
  await markAmbientCliWorkspaceProviderState(workspacePath, { reason: "env-binding-removed", packageName });
  return removed;
}

export async function saveAmbientCliPackageEnvSecret(
  workspacePath: string,
  input: AmbientCliPackageSecretInput,
): Promise<AmbientCliPackageEnvStatus> {
  const packageName = input.packageName.trim();
  if (!packageName) throw new Error("Ambient CLI secret packageName is required.");
  const envName = normalizeEnvName(input.envName);
  const value = input.value.trim();
  if (!value) throw new Error("Ambient CLI secret value is empty.");
  const secretRef = await saveSecretReference({
    scope: "ambient-cli",
    workspacePath,
    ownerId: packageName,
    envName,
    value,
  });
  return setAmbientCliPackageSecretBinding(workspacePath, {
    packageName,
    envName,
    secretRef,
  });
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
  const catalog = await discoverAmbientCliPackages(workspacePath, { includeHealth: true });
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
  const catalog = await discoverAmbientCliPackages(workspacePath, { includeHealth: true });
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
  const catalog = await discoverAmbientCliPackages(workspacePath, { includeHealth: true });
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

function ambientCliCommandHealth(pkg: AmbientCliPackageSummary, command: AmbientCliPackageCommand): "passed" | "failed" | "unknown" {
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  if (!health) return "unknown";
  return health.passed ? "passed" : "failed";
}

function ambientCliHealthCacheDiagnostics(health: AmbientCliPackageHealthCheckResult | undefined): {
  healthCached?: boolean;
  healthCheckedAt?: string;
  healthCacheAgeMs?: number;
} {
  if (!health) return {};
  return {
    ...(health.cached !== undefined ? { healthCached: health.cached } : {}),
    ...(health.checkedAt ? { healthCheckedAt: health.checkedAt } : {}),
    ...(health.cacheAgeMs !== undefined ? { healthCacheAgeMs: health.cacheAgeMs } : {}),
  };
}

function ambientCliVoiceProviderAvailabilityReason(pkg: AmbientCliPackageSummary, command: AmbientCliPackageCommand): string {
  if (pkg.errors[0]) return pkg.errors[0];
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  if (health && !health.passed) {
    return `Voice provider health check failed: ${health.error ?? health.stderr ?? "command exited unsuccessfully"}`;
  }
  const healthPayload = ambientCliVoiceProviderHealthPayload(pkg, command);
  if (healthPayload?.available === false) {
    return `Voice provider validation pending: ${healthPayload.reason ?? "runtime or model assets are not ready"}`;
  }
  return "Installed Ambient CLI package is available; execution still requires Desktop approval.";
}

function ambientCliVoiceProviderDiagnostics(pkg: AmbientCliPackageSummary, command: AmbientCliPackageCommand): VoiceProviderDiagnostics {
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  const healthPayload = ambientCliVoiceProviderHealthPayload(pkg, command);
  const providerLifecycle = command.voiceProvider?.runtimeLifecycle
    ? ambientCliProviderLifecycleWithPackage(command.voiceProvider.runtimeLifecycle, pkg)
    : undefined;
  const healthStatus = health ? (health.passed ? "passed" : "failed") : "unknown";
  const healthCommand = health?.command ?? command.healthCheck;
  const healthCwd = health?.cwd;
  const healthError =
    health && !health.passed ? (health.error ?? health.stderr) : healthPayload?.available === false ? healthPayload.reason : undefined;
  return {
    healthStatus,
    ...(healthCommand?.length ? { healthCommand } : {}),
    ...(healthCwd ? { healthCwd } : {}),
    ...(healthError ? { healthError } : {}),
    ...ambientCliHealthCacheDiagnostics(health),
    ...(health?.stdoutOutput?.artifactPath ? { stdoutArtifactPath: health.stdoutOutput.artifactPath } : {}),
    ...(health?.stderrOutput?.artifactPath ? { stderrArtifactPath: health.stderrOutput.artifactPath } : {}),
    missingHints: Array.from(new Set([...ambientCliVoiceProviderMissingHints(pkg, healthError), ...(healthPayload?.missingHints ?? [])])),
    ...(healthPayload?.runtimeState
      ? {
          runtimeState: providerLifecycle ? { ...healthPayload.runtimeState, providerLifecycle } : healthPayload.runtimeState,
        }
      : {}),
  };
}

interface AmbientCliVoiceProviderHealthPayload {
  available?: boolean;
  reason?: string;
  missingHints?: string[];
  runtimeState?: VoiceProviderRuntimeState;
}

function ambientCliVoiceProviderHealthPayload(
  pkg: AmbientCliPackageSummary,
  command: AmbientCliPackageCommand,
): AmbientCliVoiceProviderHealthPayload | undefined {
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  if (!health?.stdout) return undefined;
  try {
    const parsed = JSON.parse(health.stdout) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const missingHints = Array.isArray(parsed.missingHints)
      ? parsed.missingHints.filter((hint): hint is string => typeof hint === "string" && Boolean(hint.trim())).map((hint) => hint.trim())
      : undefined;
    const runtimeState = voiceProviderRuntimeStatePayload(parsed.runtimeState);
    return {
      ...(typeof parsed.available === "boolean" ? { available: parsed.available } : {}),
      ...(typeof parsed.reason === "string" && parsed.reason.trim() ? { reason: parsed.reason.trim() } : {}),
      ...(missingHints?.length ? { missingHints } : {}),
      ...(runtimeState ? { runtimeState } : {}),
    };
  } catch {
    return undefined;
  }
}

function voiceProviderRuntimeStatePayload(value: unknown): VoiceProviderRuntimeState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const status = voiceProviderRuntimeStatus(record.status);
  if (!status) return undefined;
  const running = typeof record.running === "boolean" ? record.running : status === "running";
  return {
    schemaVersion: "ambient-voice-provider-runtime-state-v1",
    status,
    running,
    ...(trackingStatus(record.trackingStatus) ? { trackingStatus: trackingStatus(record.trackingStatus) } : {}),
    ...(stringPayload(record.modelRuntimeId) ? { modelRuntimeId: stringPayload(record.modelRuntimeId) } : {}),
    ...(stringPayload(record.modelProfileId) ? { modelProfileId: stringPayload(record.modelProfileId) } : {}),
    ...(stringPayload(record.modelId) ? { modelId: stringPayload(record.modelId) } : {}),
    ...(positiveIntegerPayload(record.pid) ? { pid: positiveIntegerPayload(record.pid) } : {}),
    ...(stringPayload(record.endpoint) ? { endpoint: stringPayload(record.endpoint) } : {}),
    ...(stringPayload(record.statePath) ? { statePath: stringPayload(record.statePath) } : {}),
    ...(nonNegativeNumberPayload(record.estimatedResidentMemoryBytes) !== undefined
      ? { estimatedResidentMemoryBytes: nonNegativeNumberPayload(record.estimatedResidentMemoryBytes) }
      : {}),
    ...(nonNegativeNumberPayload(record.actualResidentMemoryBytes) !== undefined
      ? { actualResidentMemoryBytes: nonNegativeNumberPayload(record.actualResidentMemoryBytes) }
      : {}),
    ...(stringPayload(record.memorySampledAt) ? { memorySampledAt: stringPayload(record.memorySampledAt) } : {}),
    ...(stringPayload(record.startedAt) ? { startedAt: stringPayload(record.startedAt) } : {}),
    ...(stringPayload(record.lastUsedAt) ? { lastUsedAt: stringPayload(record.lastUsedAt) } : {}),
    ...(stringPayload(record.lastHeartbeatAt) ? { lastHeartbeatAt: stringPayload(record.lastHeartbeatAt) } : {}),
    ...(stringPayload(record.reason) ? { reason: stringPayload(record.reason) } : {}),
  };
}

function voiceProviderRuntimeStatus(value: unknown): VoiceProviderRuntimeState["status"] | undefined {
  if (value === "running" || value === "stopped" || value === "unavailable" || value === "unknown") return value;
  return undefined;
}

function ambientCliEmbeddingProviderAvailabilityReason(pkg: AmbientCliPackageSummary, command: AmbientCliPackageCommand): string {
  if (pkg.errors[0]) return pkg.errors[0];
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  if (health && !health.passed) {
    return `Embedding provider health check failed: ${health.error ?? health.stderr ?? "command exited unsuccessfully"}`;
  }
  const healthPayload = ambientCliEmbeddingProviderHealthPayload(pkg, command);
  if (healthPayload?.available === false) {
    return `Embedding provider validation pending: ${healthPayload.reason ?? "runtime or model assets are not ready"}`;
  }
  return "Installed Ambient CLI package is available; execution still requires Desktop approval.";
}

function ambientCliEmbeddingProviderDiagnostics(
  pkg: AmbientCliPackageSummary,
  command: AmbientCliPackageCommand,
): EmbeddingProviderDiagnostics {
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  const healthPayload = ambientCliEmbeddingProviderHealthPayload(pkg, command);
  const providerLifecycle = command.embeddingProvider?.runtimeLifecycle
    ? ambientCliProviderLifecycleWithPackage(command.embeddingProvider.runtimeLifecycle, pkg)
    : undefined;
  const healthStatus = health ? (health.passed ? "passed" : "failed") : "unknown";
  const healthCommand = health?.command ?? command.healthCheck;
  const healthCwd = health?.cwd;
  const healthError =
    health && !health.passed ? (health.error ?? health.stderr) : healthPayload?.available === false ? healthPayload.reason : undefined;
  return {
    healthStatus,
    ...(healthCommand?.length ? { healthCommand } : {}),
    ...(healthCwd ? { healthCwd } : {}),
    ...(healthError ? { healthError } : {}),
    ...ambientCliHealthCacheDiagnostics(health),
    ...(health?.stdoutOutput?.artifactPath ? { stdoutArtifactPath: health.stdoutOutput.artifactPath } : {}),
    ...(health?.stderrOutput?.artifactPath ? { stderrArtifactPath: health.stderrOutput.artifactPath } : {}),
    missingHints: Array.from(
      new Set([...ambientCliEmbeddingProviderMissingHints(pkg, healthError), ...(healthPayload?.missingHints ?? [])]),
    ),
    ...(healthPayload?.runtimeState
      ? {
          runtimeState: providerLifecycle ? { ...healthPayload.runtimeState, providerLifecycle } : healthPayload.runtimeState,
        }
      : {}),
  };
}

interface AmbientCliEmbeddingProviderHealthPayload {
  available?: boolean;
  reason?: string;
  missingHints?: string[];
  runtimeState?: EmbeddingProviderRuntimeState;
}

function ambientCliEmbeddingProviderHealthPayload(
  pkg: AmbientCliPackageSummary,
  command: AmbientCliPackageCommand,
): AmbientCliEmbeddingProviderHealthPayload | undefined {
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  if (!health?.stdout) return undefined;
  try {
    const parsed = JSON.parse(health.stdout) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const missingHints = Array.isArray(parsed.missingHints)
      ? parsed.missingHints.filter((hint): hint is string => typeof hint === "string" && Boolean(hint.trim())).map((hint) => hint.trim())
      : undefined;
    const runtimeState = embeddingProviderRuntimeStatePayload(parsed.runtimeState);
    return {
      ...(typeof parsed.available === "boolean" ? { available: parsed.available } : {}),
      ...(typeof parsed.reason === "string" && parsed.reason.trim() ? { reason: parsed.reason.trim() } : {}),
      ...(missingHints?.length ? { missingHints } : {}),
      ...(runtimeState ? { runtimeState } : {}),
    };
  } catch {
    return undefined;
  }
}

function embeddingProviderRuntimeStatePayload(value: unknown): EmbeddingProviderRuntimeState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const status = voiceProviderRuntimeStatus(record.status);
  if (!status) return undefined;
  const running = typeof record.running === "boolean" ? record.running : status === "running";
  return {
    schemaVersion: "ambient-embedding-provider-runtime-state-v1",
    status,
    running,
    ...(trackingStatus(record.trackingStatus) ? { trackingStatus: trackingStatus(record.trackingStatus) } : {}),
    ...(stringPayload(record.modelRuntimeId) ? { modelRuntimeId: stringPayload(record.modelRuntimeId) } : {}),
    ...(stringPayload(record.modelProfileId) ? { modelProfileId: stringPayload(record.modelProfileId) } : {}),
    ...(stringPayload(record.modelId) ? { modelId: stringPayload(record.modelId) } : {}),
    ...(positiveIntegerPayload(record.pid) ? { pid: positiveIntegerPayload(record.pid) } : {}),
    ...(stringPayload(record.endpoint) ? { endpoint: stringPayload(record.endpoint) } : {}),
    ...(stringPayload(record.statePath) ? { statePath: stringPayload(record.statePath) } : {}),
    ...(nonNegativeNumberPayload(record.estimatedResidentMemoryBytes) !== undefined
      ? { estimatedResidentMemoryBytes: nonNegativeNumberPayload(record.estimatedResidentMemoryBytes) }
      : {}),
    ...(nonNegativeNumberPayload(record.actualResidentMemoryBytes) !== undefined
      ? { actualResidentMemoryBytes: nonNegativeNumberPayload(record.actualResidentMemoryBytes) }
      : {}),
    ...(stringPayload(record.memorySampledAt) ? { memorySampledAt: stringPayload(record.memorySampledAt) } : {}),
    ...(stringPayload(record.startedAt) ? { startedAt: stringPayload(record.startedAt) } : {}),
    ...(stringPayload(record.lastUsedAt) ? { lastUsedAt: stringPayload(record.lastUsedAt) } : {}),
    ...(stringPayload(record.lastHeartbeatAt) ? { lastHeartbeatAt: stringPayload(record.lastHeartbeatAt) } : {}),
    ...(stringPayload(record.reason) ? { reason: stringPayload(record.reason) } : {}),
  };
}

function trackingStatus(value: unknown): "managed" | "tracked" | "untracked" | undefined {
  if (value === "managed" || value === "tracked" || value === "untracked") return value;
  return undefined;
}

function stringPayload(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nonNegativeNumberPayload(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function positiveIntegerPayload(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function ambientCliVoiceProviderMissingHints(pkg: AmbientCliPackageSummary, healthError?: string): string[] {
  const hints: string[] = [];
  for (const env of pkg.envRequirements) {
    if (!env.required) continue;
    hints.push(
      env.description
        ? `Configure required environment variable ${env.name}: ${env.description}`
        : `Configure required environment variable ${env.name}.`,
    );
  }
  const normalized = healthError?.toLowerCase() ?? "";
  if (normalized.includes("model"))
    hints.push("Verify model files are downloaded and descriptor paths point at the repaired model location.");
  if (normalized.includes("enoent") || normalized.includes("not found") || normalized.includes("no such file")) {
    hints.push("Verify the provider binary or script exists after dependency installation.");
  }
  if (normalized.includes("permission") || normalized.includes("eacces"))
    hints.push("Verify executable permissions for the provider binary or script.");
  if (normalized.includes("api key") || normalized.includes("unauthorized") || normalized.includes("auth")) {
    hints.push("Verify provider credentials are configured before enabling voice.");
  }
  return Array.from(new Set(hints));
}

function ambientCliEmbeddingProviderMissingHints(pkg: AmbientCliPackageSummary, healthError?: string): string[] {
  const hints: string[] = [];
  for (const env of pkg.envRequirements) {
    if (!env.required) continue;
    hints.push(
      env.description
        ? `Configure required environment variable ${env.name}: ${env.description}`
        : `Configure required environment variable ${env.name}.`,
    );
  }
  const normalized = healthError?.toLowerCase() ?? "";
  if (normalized.includes("model"))
    hints.push("Verify embedding model files are downloaded and descriptor paths point at the repaired model location.");
  if (normalized.includes("index")) hints.push("Verify embedding index or cache paths exist and are writable.");
  if (normalized.includes("enoent") || normalized.includes("not found") || normalized.includes("no such file")) {
    hints.push("Verify the provider binary or script exists after dependency installation.");
  }
  if (normalized.includes("permission") || normalized.includes("eacces"))
    hints.push("Verify executable permissions for the provider binary or script.");
  if (normalized.includes("api key") || normalized.includes("unauthorized") || normalized.includes("auth")) {
    hints.push("Verify provider credentials are configured before enabling embeddings.");
  }
  return Array.from(new Set(hints));
}

function ambientCliSttProviderAvailabilityReason(pkg: AmbientCliPackageSummary, command: AmbientCliPackageCommand): string {
  if (pkg.errors[0]) return pkg.errors[0];
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  if (health && !health.passed) {
    return `STT provider health check failed: ${health.error ?? health.stderr ?? "command exited unsuccessfully"}`;
  }
  const healthPayload = ambientCliSttProviderHealthPayload(pkg, command);
  if (healthPayload?.available === false) {
    return `STT provider validation pending: ${healthPayload.reason ?? "runtime or model assets are not ready"}`;
  }
  return "Installed Ambient CLI package is available; execution still requires Desktop approval.";
}

function ambientCliSttProviderDiagnostics(pkg: AmbientCliPackageSummary, command: AmbientCliPackageCommand): SttProviderDiagnostics {
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  const healthPayload = ambientCliSttProviderHealthPayload(pkg, command);
  const healthStatus = health ? (health.passed ? "passed" : "failed") : "unknown";
  const healthCommand = health?.command ?? command.healthCheck;
  const healthCwd = health?.cwd;
  const healthError =
    health && !health.passed ? (health.error ?? health.stderr) : healthPayload?.available === false ? healthPayload.reason : undefined;
  return {
    healthStatus,
    ...(healthCommand?.length ? { healthCommand } : {}),
    ...(healthCwd ? { healthCwd } : {}),
    ...(healthError ? { healthError } : {}),
    ...ambientCliHealthCacheDiagnostics(health),
    ...(health?.stdoutOutput?.artifactPath ? { stdoutArtifactPath: health.stdoutOutput.artifactPath } : {}),
    ...(health?.stderrOutput?.artifactPath ? { stderrArtifactPath: health.stderrOutput.artifactPath } : {}),
    missingHints: Array.from(new Set([...ambientCliSttProviderMissingHints(pkg, healthError), ...(healthPayload?.missingHints ?? [])])),
    ...(healthPayload?.distribution ? { distribution: healthPayload.distribution } : {}),
    ...(healthPayload?.installPlan ? { installPlan: healthPayload.installPlan } : {}),
  };
}

interface AmbientCliSttProviderHealthPayload {
  available?: boolean;
  reason?: string;
  missingHints?: string[];
  distribution?: NonNullable<SttProviderDiagnostics["distribution"]>;
  installPlan?: NonNullable<SttProviderDiagnostics["installPlan"]>;
}

function ambientCliSttProviderHealthPayload(
  pkg: AmbientCliPackageSummary,
  command: AmbientCliPackageCommand,
): AmbientCliSttProviderHealthPayload | undefined {
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  if (!health?.stdout) return undefined;
  try {
    const parsed = JSON.parse(health.stdout) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const missingHints = Array.isArray(parsed.missingHints)
      ? parsed.missingHints.filter((hint): hint is string => typeof hint === "string" && Boolean(hint.trim()))
      : undefined;
    const distribution = ambientCliSttProviderDistributionPayload(parsed.distribution);
    const installPlan = ambientCliSttProviderInstallPlanPayload(parsed.installPlan);
    return {
      ...(typeof parsed.available === "boolean" ? { available: parsed.available } : {}),
      ...(typeof parsed.reason === "string" && parsed.reason.trim() ? { reason: parsed.reason.trim() } : {}),
      ...(missingHints?.length ? { missingHints } : {}),
      ...(distribution ? { distribution } : {}),
      ...(installPlan ? { installPlan } : {}),
    };
  } catch {
    return undefined;
  }
}

function ambientCliSttProviderDistributionPayload(value: unknown): NonNullable<SttProviderDiagnostics["distribution"]> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const payload = {
    ...(typeof record.packageType === "string" && record.packageType.trim() ? { packageType: record.packageType.trim() } : {}),
    ...(typeof record.bundledRuntimeBinaries === "boolean" ? { bundledRuntimeBinaries: record.bundledRuntimeBinaries } : {}),
    ...(typeof record.bundledPythonWheels === "boolean" ? { bundledPythonWheels: record.bundledPythonWheels } : {}),
    ...(typeof record.bundledModelWeights === "boolean" ? { bundledModelWeights: record.bundledModelWeights } : {}),
    ...(typeof record.bundledModelAssets === "boolean" ? { bundledModelAssets: record.bundledModelAssets } : {}),
  };
  return Object.keys(payload).length ? payload : undefined;
}

function ambientCliSttProviderInstallPlanPayload(value: unknown): NonNullable<SttProviderDiagnostics["installPlan"]> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const packages = Array.isArray(record.packages)
    ? record.packages.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : undefined;
  const payload = {
    ...(typeof record.resolver === "string" && record.resolver.trim() ? { resolver: record.resolver.trim() } : {}),
    ...(typeof record.pythonVersion === "string" && record.pythonVersion.trim() ? { pythonVersion: record.pythonVersion.trim() } : {}),
    ...(packages?.length ? { packages } : {}),
    ...(typeof record.defaultModel === "string" && record.defaultModel.trim() ? { defaultModel: record.defaultModel.trim() } : {}),
    ...(typeof record.defaultDevice === "string" && record.defaultDevice.trim() ? { defaultDevice: record.defaultDevice.trim() } : {}),
    ...(typeof record.defaultComputeType === "string" && record.defaultComputeType.trim()
      ? { defaultComputeType: record.defaultComputeType.trim() }
      : {}),
    ...(typeof record.firstRunBehavior === "string" && record.firstRunBehavior.trim()
      ? { firstRunBehavior: record.firstRunBehavior.trim() }
      : {}),
  };
  return Object.keys(payload).length ? payload : undefined;
}

function ambientCliSttProviderMissingHints(pkg: AmbientCliPackageSummary, healthError?: string): string[] {
  const hints: string[] = [];
  for (const env of pkg.envRequirements) {
    if (!env.required) continue;
    hints.push(
      env.description
        ? `Configure required environment variable ${env.name}: ${env.description}`
        : `Configure required environment variable ${env.name}.`,
    );
  }
  const normalized = healthError?.toLowerCase() ?? "";
  if (normalized.includes("model"))
    hints.push("Verify model files are downloaded and descriptor paths point at the repaired model location.");
  if (normalized.includes("gguf") || normalized.includes("projector") || normalized.includes("mmproj")) {
    hints.push("Verify Qwen3-ASR GGUF and multimodal projector assets are present and match the provider descriptor.");
  }
  if (normalized.includes("enoent") || normalized.includes("not found") || normalized.includes("no such file")) {
    hints.push("Verify the provider binary or script exists after dependency installation.");
  }
  if (normalized.includes("permission") || normalized.includes("eacces"))
    hints.push("Verify executable permissions for the provider binary or script.");
  return Array.from(new Set(hints));
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

function ambientCliProviderLifecycleWithPackage(
  lifecycle: LocalRuntimeProviderLifecycleControls,
  pkg: AmbientCliPackageSummary,
): LocalRuntimeProviderLifecycleControls {
  return {
    ...lifecycle,
    packageId: pkg.id,
    packageName: pkg.name,
    ...(lifecycle.start ? { start: { ...lifecycle.start, packageId: pkg.id, packageName: pkg.name } } : {}),
    ...(lifecycle.stop ? { stop: { ...lifecycle.stop, packageId: pkg.id, packageName: pkg.name } } : {}),
    ...(lifecycle.restart ? { restart: { ...lifecycle.restart, packageId: pkg.id, packageName: pkg.name } } : {}),
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

function voiceProviderFallbackLabel(packageName: string, commandName: string): string {
  return providerFallbackLabel(packageName, commandName);
}

function providerFallbackLabel(packageName: string, commandName: string): string {
  const packageWords = humanizeIdentifier(packageName.replace(/^ambient[-_]/i, ""));
  const commandWords = humanizeIdentifier(commandName);
  if (!packageWords) return commandWords || commandName;
  if (!commandWords) return packageWords;
  const packageLower = packageWords.toLowerCase();
  const commandLower = commandWords.toLowerCase();
  if (packageLower.includes(commandLower) || commandLower.includes(packageLower)) return packageWords;
  if (commandLower.includes("tts") && packageLower.includes("tts")) return packageWords;
  return `${packageWords} ${commandWords}`;
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\btts\b/gi, "TTS")
    .replace(/\bcli\b/gi, "CLI")
    .replace(/\be2e\b/gi, "E2E")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word === word.toUpperCase() ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
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

async function withClonedCliPackage<T>(input: NormalizedInstallInput, action: (clone: ClonedCliPackage) => Promise<T>): Promise<T> {
  const tempRoot = await mkdtemp(join(tmpdir(), "ambient-cli-git-"));
  try {
    const repoPath = join(tempRoot, "repo");
    await git(["clone", "--quiet", "--", safeGitCloneSource(input.source), repoPath], tempRoot);
    await git(["-C", repoPath, "checkout", "--quiet", input.sha ?? input.ref ?? "HEAD"], tempRoot);
    if (input.sha) await verifyGitCheckoutSha(repoPath, input.sha);
    const packageRoot = resolveGitPackageRoot(repoPath, input.path);
    return await action({ repoPath, packageRoot });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function withPreviewPackageRoot<T>(
  sourcePath: string,
  input: NormalizedInstallInput,
  action: (packageRoot: string) => Promise<T>,
): Promise<T> {
  if (!input.installDependencies) return action(sourcePath);
  const tempRoot = await mkdtemp(join(tmpdir(), "ambient-cli-preview-"));
  try {
    const packageRoot = join(tempRoot, "package");
    await cp(sourcePath, packageRoot, { recursive: true, force: true, dereference: false });
    return await action(packageRoot);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
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

function isGitLikeInstallSource(source: string): boolean {
  const trimmed = source.trim();
  return (
    /^git\+/i.test(trimmed) ||
    /^(?:ext|git-remote-ext)::/i.test(trimmed) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(trimmed) ||
    /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\s\0]+$/.test(trimmed)
  );
}

function resolveGitPackageRoot(repoPath: string, packagePath: string | undefined): string {
  const packageRoot = resolve(repoPath, packagePath ?? ".");
  if (!isPathInside(repoPath, packageRoot)) throw new Error("Ambient CLI package path resolves outside the cloned repository.");
  return packageRoot;
}

async function verifyGitCheckoutSha(repoPath: string, expectedSha: string): Promise<void> {
  const { stdout } = await execFileAsync("git", ["-C", repoPath, "rev-parse", "HEAD"], {
    timeout: 30_000,
    env: gitEnv(),
    maxBuffer: 1024 * 1024,
  });
  const actualSha = String(stdout).trim();
  if (actualSha.toLowerCase() !== expectedSha.toLowerCase()) {
    throw new Error(`Ambient CLI Git checkout SHA mismatch: expected ${expectedSha}, got ${actualSha}.`);
  }
}

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, {
    cwd,
    timeout: 60_000,
    env: gitEnv(),
    maxBuffer: 1024 * 1024,
  });
}

function gitEnv(): NodeJS.ProcessEnv {
  return hardenedGitEnv(ambientRuntimeEnv(process.env, { GIT_TERMINAL_PROMPT: "0" }));
}

function gitSourceLabel(input: NormalizedInstallInput): string {
  return ["git", input.source, input.path, input.ref, input.sha].filter(Boolean).join(":");
}

async function resolvePiCatalogCliAdapter(source: string): Promise<AmbientCliPiCatalogResolution> {
  const githubAdapter = resolveGithubCliAdapter(source);
  if (githubAdapter) return githubAdapter;

  const npmPackageName = piCatalogNpmPackageName(source);
  if (npmPackageName !== "pi-arxiv") {
    throw new Error(`No Ambient CLI adapter is currently available for Pi package "${npmPackageName}".`);
  }
  const metadata = await fetchNpmPackageMetadata(npmPackageName);
  const latest = metadata["dist-tags"]?.latest;
  if (typeof latest !== "string" || !latest) throw new Error(`npm package "${npmPackageName}" does not declare a latest version.`);
  const version = metadata.versions?.[latest];
  if (!version) throw new Error(`npm package "${npmPackageName}" metadata is missing version "${latest}".`);
  const repository = normalizeNpmRepository(version.repository ?? metadata.repository);
  if (!repository.url || !repository.directory)
    throw new Error(`npm package "${npmPackageName}" does not declare a Git repository directory.`);
  const sha = typeof version.gitHead === "string" && version.gitHead.trim() ? version.gitHead.trim() : await resolveGitHead(repository.url);
  return {
    source,
    npmPackageName,
    npmVersion: latest,
    repositoryUrl: repository.url,
    repositoryDirectory: repository.directory,
    sha,
    adapter: "pi-arxiv",
    securityScan: [
      "Resolved from pi.dev catalog URL to npm package pi-arxiv@0.1.0 and GitHub repository nicehiro/dotfiles.",
      "Package source is a small TypeScript Pi extension registering arxiv_search and arxiv_paper.",
      "No filesystem, process, shell, secret, or write APIs were found in the reviewed extension source.",
      "Network access is limited by the reviewed source to arXiv metadata lookup; the upstream uses the public arXiv export endpoint.",
      "Ambient installs a first-party adapter file instead of executing the upstream TypeScript extension directly.",
    ],
  };
}

function resolveGithubCliAdapter(source: string): AmbientCliPiCatalogResolution | undefined {
  const trimmed = source.trim();
  if (!trimmed) throw new Error("Pi catalog source is required.");
  try {
    const url = new URL(trimmed);
    if (url.hostname !== "github.com") return undefined;
    const parts = url.pathname.split("/").filter(Boolean);
    const [owner, repo] = parts;
    if (owner !== "badlogic" || repo !== "pi-skills") return undefined;
    const youtubeTranscriptIndex = parts.indexOf("youtube-transcript");
    if (youtubeTranscriptIndex !== -1) return youtubeTranscriptResolution(source);
    const braveSearchIndex = parts.indexOf("brave-search");
    if (braveSearchIndex !== -1) return braveSearchResolution(source);
    return undefined;
  } catch {
    return undefined;
  }
}

function youtubeTranscriptResolution(source: string): AmbientCliPiCatalogResolution {
  return {
    source,
    npmPackageName: "youtube-transcript",
    npmVersion: "1.0.0",
    repositoryUrl: "https://github.com/badlogic/pi-skills",
    repositoryDirectory: "youtube-transcript",
    sha: "75d32a382b0c8aafce356d68e17d2dc94c0c953b",
    adapter: "youtube-transcript",
    installDependencies: true,
    securityScan: [
      "Resolved from badlogic/pi-skills youtube-transcript to a pinned GitHub repository subdirectory.",
      "Package source is a small Node script that calls youtube-transcript-plus and prints timestamped captions.",
      "No filesystem, process, shell, secret, or write APIs were found in the reviewed script source.",
      "Network access is limited by the reviewed source and dependency purpose to fetching YouTube caption transcript data.",
      "Ambient installs the upstream script with a first-party descriptor and skill prompt instead of executing arbitrary extension hooks.",
    ],
  };
}

function braveSearchResolution(source: string): AmbientCliPiCatalogResolution {
  return {
    source,
    npmPackageName: "brave-search",
    npmVersion: "1.0.0",
    repositoryUrl: "https://github.com/badlogic/pi-skills",
    repositoryDirectory: "brave-search",
    sha: "75d32a382b0c8aafce356d68e17d2dc94c0c953b",
    adapter: "brave-search",
    securityScan: [
      "Resolved from badlogic/pi-skills brave-search to a pinned GitHub repository subdirectory.",
      "Package source is a Node script that calls the official Brave Search API and can optionally fetch page content.",
      "Ambient installs a first-party search-only adapter instead of executing arbitrary extension hooks or shell profile setup.",
      "Secret access is limited to the declared BRAVE_API_KEY env binding managed by Ambient CLI.",
      "Network access is limited by the reviewed adapter to api.search.brave.com.",
    ],
  };
}

function piCatalogNpmPackageName(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) throw new Error("Pi catalog source is required.");
  if (trimmed.startsWith("npm:")) return trimmed.slice("npm:".length).trim();
  try {
    const url = new URL(trimmed);
    if (url.hostname === "pi.dev" && url.pathname.startsWith("/packages/")) {
      const packageName = url.pathname.split("/").filter(Boolean)[1];
      if (packageName) return packageName;
    }
  } catch {
    // Fall through to bare npm package support.
  }
  return trimmed;
}

async function fetchNpmPackageMetadata(packageName: string): Promise<any> {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
  if (!response.ok) throw new Error(`Failed to fetch npm metadata for "${packageName}": HTTP ${response.status}.`);
  return response.json();
}

function normalizeNpmRepository(value: unknown): { url?: string; directory?: string } {
  if (typeof value === "string") return { url: normalizeGitUrl(value) };
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.url === "string" ? { url: normalizeGitUrl(record.url) } : {}),
    ...(typeof record.directory === "string" ? { directory: record.directory } : {}),
  };
}

function normalizeGitUrl(value: string): string {
  return normalizeGitRepositoryUrl(value);
}

async function resolveGitHead(source: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["ls-remote", "--", safeGitCloneSource(source), "HEAD"], {
    timeout: 30_000,
    env: gitEnv(),
    maxBuffer: 1024 * 1024,
  });
  const sha = String(stdout).trim().split(/\s+/)[0];
  if (!sha) throw new Error(`Unable to resolve Git HEAD for ${source}.`);
  return sha;
}

function piCatalogAdapterDescriptor(resolution: AmbientCliPiCatalogResolution): CliDescriptor {
  if (resolution.adapter === "brave-search") {
    return {
      name: "brave-search",
      version: resolution.npmVersion,
      description: "Ambient CLI adapter for Brave Search API queries.",
      skills: "./SKILL.md",
      env: [{ name: "BRAVE_API_KEY", description: "Brave Search API key.", required: true }],
      commands: {
        search: {
          command: "node",
          args: ["./ambient-brave-search-cli.mjs", "search"],
          description: "Search the web through the Brave Search API.",
          cwd: "package",
          healthCheck: ["node", "./ambient-brave-search-cli.mjs", "health"],
        },
      },
    };
  }
  if (resolution.adapter === "youtube-transcript") {
    return {
      name: "youtube-transcript",
      version: resolution.npmVersion,
      description: "Ambient CLI adapter for fetching YouTube transcripts.",
      skills: "./SKILL.md",
      env: [],
      commands: {
        youtube_transcript: {
          command: "node",
          args: ["./transcript.js"],
          description: "Fetch timestamped transcript entries for a YouTube video ID or URL.",
          cwd: "package",
          healthCheck: ["node", "--input-type=module", "-e", "await import('youtube-transcript-plus'); console.log('ok');"],
        },
      },
    };
  }

  return {
    name: "pi-arxiv",
    version: resolution.npmVersion,
    description: "Ambient CLI adapter for the Pi arXiv search package.",
    skills: "./SKILL.md",
    env: [],
    commands: {
      arxiv_search: {
        command: "node",
        args: ["./ambient-arxiv-cli.mjs", "search"],
        description: "Search arXiv papers by query, category, sort order, and result count.",
        cwd: "package",
        healthCheck: ["node", "./ambient-arxiv-cli.mjs", "health"],
      },
      arxiv_paper: {
        command: "node",
        args: ["./ambient-arxiv-cli.mjs", "paper"],
        description: "Fetch details for a specific arXiv paper ID or URL.",
        cwd: "package",
        healthCheck: ["node", "./ambient-arxiv-cli.mjs", "health"],
      },
    },
  };
}

async function writePiCatalogAdapterFiles(packageRoot: string, resolution: AmbientCliPiCatalogResolution): Promise<void> {
  if (resolution.adapter === "brave-search") {
    await writeFile(join(packageRoot, "ambient-brave-search-cli.mjs"), braveSearchAdapterScript, "utf8");
    await writeFile(join(packageRoot, "SKILL.md"), braveSearchSkillMarkdown(resolution), "utf8");
    return;
  }
  if (resolution.adapter === "youtube-transcript") {
    await writeFile(join(packageRoot, "package-lock.json"), youtubeTranscriptPackageLock, "utf8");
    await writeFile(join(packageRoot, "SKILL.md"), youtubeTranscriptSkillMarkdown(resolution), "utf8");
    return;
  }
  if (resolution.adapter !== "pi-arxiv") throw new Error(`Unsupported Pi catalog adapter: ${resolution.adapter}`);
  await writeFile(join(packageRoot, "ambient-arxiv-cli.mjs"), piArxivAdapterScript, "utf8");
  await writeFile(join(packageRoot, "SKILL.md"), piArxivSkillMarkdown(resolution), "utf8");
}

function braveSearchSkillMarkdown(resolution: AmbientCliPiCatalogResolution): string {
  return `---
name: brave-search
description: Search the web through Brave Search API via Ambient CLI.
---

Use this skill when the user asks to search the web through the reviewed Brave Search Pi skill installed from ${resolution.source}.

Command:
- Use ambient_cli with packageName "brave-search" and command "search". Pass the query as the first arg. Optional flags: -n for result count, --country for country code, and --freshness for Brave-supported freshness filters.

Secret:
- The command requires BRAVE_API_KEY. Use Ambient-managed env binding or secret request tools; never ask the user to paste the key in chat.

Examples:
- ambient_cli packageName="brave-search" command="search" args=["Ambient Desktop install routing", "-n", "2"]
- ambient_cli packageName="brave-search" command="search" args=["site:docs.ambient.xyz workflow agents", "--country", "US"]

Output:
- The command returns one JSON object with provider, host, query, resultCount, and a bounded results array.
- Base summaries on returned result titles, links, snippets, and ages without inventing missing content.
`;
}

const braveSearchAdapterScript = `const args = process.argv.slice(2);
const mode = args.shift();

if (mode === "health") {
  console.log("ok");
  process.exit(0);
}

if (mode !== "search") {
  console.error("Usage: ambient-brave-search-cli.mjs search <query> [-n count] [--country code] [--freshness period]");
  process.exit(1);
}

let count = 5;
let country = "US";
let freshness;
const queryParts = [];
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "-n" && args[index + 1]) {
    count = Math.max(1, Math.min(20, Number.parseInt(args[index + 1], 10) || 5));
    index += 1;
    continue;
  }
  if (arg === "--country" && args[index + 1]) {
    country = args[index + 1].toUpperCase();
    index += 1;
    continue;
  }
  if (arg === "--freshness" && args[index + 1]) {
    freshness = args[index + 1];
    index += 1;
    continue;
  }
  queryParts.push(arg);
}

const query = queryParts.join(" ").trim();
if (!query) {
  console.error("Brave Search query is required.");
  process.exit(1);
}

const apiKey = process.env.BRAVE_API_KEY;
if (!apiKey) {
  console.error("BRAVE_API_KEY is required. Bind it through Ambient-managed secret tools.");
  process.exit(1);
}

const params = new URLSearchParams({ q: query, count: String(count), country });
if (freshness) params.set("freshness", freshness);

const response = await fetch(\`https://api.search.brave.com/res/v1/web/search?\${params.toString()}\`, {
  headers: {
    Accept: "application/json",
    "Accept-Encoding": "gzip",
    "X-Subscription-Token": apiKey,
  },
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(\`Brave Search HTTP \${response.status}: \${body.slice(0, 300)}\`);
}

const data = await response.json();
const results = (data.web?.results ?? []).slice(0, count).map((item, index) => ({
  rank: index + 1,
  title: item.title ?? "",
  link: item.url ?? "",
  snippet: item.description ?? "",
  age: item.age ?? item.page_age ?? "",
}));

console.log(JSON.stringify({ provider: "brave-search", host: "api.search.brave.com", query, resultCount: results.length, results }, null, 2));
`;

function youtubeTranscriptSkillMarkdown(resolution: AmbientCliPiCatalogResolution): string {
  return `---
name: youtube-transcript
description: Fetch transcripts from YouTube videos through Ambient CLI.
---

Use this skill when the user asks to fetch, summarize, analyze, quote, or save a transcript from a YouTube video.

Command:
- Use ambient_cli with packageName "youtube-transcript" and command "youtube_transcript". Pass the YouTube video ID or URL as the first arg.

Examples:
- ambient_cli packageName="youtube-transcript" command="youtube_transcript" args=["EBw7gsDPAYQ"]
- ambient_cli packageName="youtube-transcript" command="youtube_transcript" args=["https://www.youtube.com/watch?v=EBw7gsDPAYQ"]

Output:
- The command returns timestamped transcript entries like "[0:00] caption text".
- If the user asks for a summary or analysis, base it on the returned transcript without inventing missing content.
- If captions are unavailable, report that the transcript could not be fetched.

Source:
- Installed from ${resolution.source}
`;
}

const youtubeTranscriptPackageLock = `{
  "name": "youtube-transcript",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "youtube-transcript",
      "version": "1.0.0",
      "dependencies": {
        "youtube-transcript-plus": "^1.0.4"
      }
    },
    "node_modules/youtube-transcript-plus": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/youtube-transcript-plus/-/youtube-transcript-plus-1.2.0.tgz",
      "integrity": "sha512-SRjVft8V+vUulMKgakgfzC+pnFLSy4tolX7xGnSvp9juUNocikMFmUx5GlhzLDILzxYrijcYtmNqz0qyklnPmA==",
      "license": "MIT",
      "engines": {
        "node": ">=18.0.0"
      }
    }
  }
}
`;

function piArxivSkillMarkdown(resolution: AmbientCliPiCatalogResolution): string {
  return `---
name: pi-arxiv
description: Search arXiv papers and fetch paper details through Ambient CLI.
---

Use this skill when the user asks to search arXiv, find papers, look up an arXiv ID, or use the Pi arXiv package installed from ${resolution.source}.

Commands:
- Use ambient_cli with packageName "pi-arxiv" and command "arxiv_search" to search. Pass the query as the first arg. Optional flags: --category, --max-results, --sort-by, --start.
- Use ambient_cli with packageName "pi-arxiv" and command "arxiv_paper" to fetch one paper. Pass the arXiv ID or arXiv URL as the first arg.

Examples:
- ambient_cli packageName="pi-arxiv" command="arxiv_search" args=["diffusion policy robotics", "--max-results", "5", "--sort-by", "relevance"]
- ambient_cli packageName="pi-arxiv" command="arxiv_paper" args=["2303.04137"]
`;
}

const piArxivAdapterScript = `const ARXIV_API = "http://export.arxiv.org/api/query";

const args = process.argv.slice(2);
const mode = args.shift();

if (mode === "health") {
  console.log("ok");
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  if (mode === "search") {
    const parsed = parseSearchArgs(args);
    const searchQuery = parsed.category ? "cat:" + parsed.category + " AND " + parsed.query : parsed.query;
    const url = ARXIV_API + "?search_query=" + encodeURIComponent(searchQuery)
      + "&start=" + parsed.start
      + "&max_results=" + parsed.maxResults
      + "&sortBy=" + encodeURIComponent(parsed.sortBy)
      + "&sortOrder=descending";
    const xml = await fetchArxiv(url);
    const feed = parseFeed(xml);
    console.log("Found " + feed.totalResults + " total results. Showing " + feed.papers.length + ".\\n");
    console.log(feed.papers.map(formatPaper).join("\\n\\n"));
    return;
  }
  if (mode === "paper") {
    const id = normalizeArxivId(args[0]);
    if (!id) throw new Error("Usage: arxiv_paper <arxiv-id-or-url>");
    const xml = await fetchArxiv(ARXIV_API + "?id_list=" + encodeURIComponent(id));
    const feed = parseFeed(xml);
    if (!feed.papers.length) throw new Error("No paper found for arXiv ID " + id + ".");
    console.log(formatPaper(feed.papers[0]));
    return;
  }
  throw new Error("Usage: ambient-arxiv-cli.mjs <health|search|paper> ...");
}

function parseSearchArgs(values) {
  const flags = { maxResults: 10, sortBy: "relevance", start: 0 };
  const queryParts = [];
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value === "--category") flags.category = requireNext(values, ++i, value);
    else if (value === "--max-results" || value === "-n") flags.maxResults = clampInt(requireNext(values, ++i, value), 1, 50);
    else if (value === "--sort-by") flags.sortBy = normalizeSortBy(requireNext(values, ++i, value));
    else if (value === "--start") flags.start = Math.max(0, clampInt(requireNext(values, ++i, value), 0, 100000));
    else queryParts.push(value);
  }
  const query = queryParts.join(" ").trim();
  if (!query) throw new Error("Usage: arxiv_search <query> [--category cs.RO] [--max-results 10] [--sort-by relevance|lastUpdatedDate|submittedDate] [--start 0]");
  return { ...flags, query };
}

function requireNext(values, index, flag) {
  const value = values[index];
  if (!value || value.startsWith("--")) throw new Error("Missing value for " + flag + ".");
  return value;
}

function clampInt(value, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeSortBy(value) {
  if (["relevance", "lastUpdatedDate", "submittedDate"].includes(value)) return value;
  throw new Error("Invalid --sort-by value. Use relevance, lastUpdatedDate, or submittedDate.");
}

function normalizeArxivId(value) {
  return String(value ?? "").trim().replace(/^https?:\\/\\/arxiv\\.org\\/abs\\//, "").replace(/^arxiv:/, "");
}

async function fetchArxiv(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "AmbientDesktop/0.1.11 (https://ambient.xyz)" },
    });
    if (response.status === 429) throw new Error("arXiv API rate limit exceeded. Retry later, narrow the query, or use arxiv_paper with a known arXiv ID.");
    if (!response.ok) throw new Error("arXiv API request failed: HTTP " + response.status);
    return response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("arXiv API request timed out after 20 seconds.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseFeed(xml) {
  const entries = matchAll(xml, /<entry>([\\s\\S]*?)<\\/entry>/g).map((entry) => parseEntry(entry));
  const total = textOf(xml, "opensearch:totalResults") || String(entries.length);
  return { papers: entries, totalResults: Number.parseInt(total, 10) || entries.length };
}

function parseEntry(xml) {
  const id = textOf(xml, "id").replace("http://arxiv.org/abs/", "");
  const title = normalizeSpace(textOf(xml, "title"));
  const abstract = normalizeSpace(textOf(xml, "summary"));
  const authors = matchAll(xml, /<author>[\\s\\S]*?<name>([\\s\\S]*?)<\\/name>[\\s\\S]*?<\\/author>/g).map(decodeXml);
  const categories = matchAll(xml, /<category[^>]*term="([^"]+)"/g).map(decodeXml);
  const primaryCategory = attrOf(xml, /<arxiv:primary_category[^>]*term="([^"]+)"/) || categories[0] || "";
  const pdfUrl = attrOf(xml, /<link[^>]*title="pdf"[^>]*href="([^"]+)"/) || "https://arxiv.org/pdf/" + id;
  const absUrl = attrOf(xml, /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) || "https://arxiv.org/abs/" + id;
  return {
    id,
    title,
    authors,
    abstract,
    published: textOf(xml, "published"),
    updated: textOf(xml, "updated"),
    categories,
    primaryCategory,
    pdfUrl,
    absUrl,
    comment: textOf(xml, "arxiv:comment"),
    journalRef: textOf(xml, "arxiv:journal_ref"),
  };
}

function formatPaper(paper, index) {
  const lines = [
    (index === undefined ? "" : "[" + (index + 1) + "] ") + paper.title,
    "    ID: " + paper.id,
    "    Authors: " + paper.authors.join(", "),
    "    Published: " + paper.published + (paper.updated && paper.updated !== paper.published ? " | Updated: " + paper.updated : ""),
    "    Categories: " + paper.categories.join(", "),
    "    PDF: " + paper.pdfUrl,
    "    Abstract: " + paper.abstract,
  ];
  if (paper.comment) lines.push("    Comment: " + paper.comment);
  if (paper.journalRef) lines.push("    Journal: " + paper.journalRef);
  return lines.join("\\n");
}

function textOf(xml, tagName) {
  const match = xml.match(new RegExp("<" + tagName + "[^>]*>([\\\\s\\\\S]*?)<\\\\/" + tagName + ">"));
  return match ? decodeXml(match[1]) : "";
}

function attrOf(xml, pattern) {
  const match = xml.match(pattern);
  return match ? decodeXml(match[1]) : "";
}

function matchAll(value, pattern) {
  return Array.from(value.matchAll(pattern), (match) => match[1]);
}

function normalizeSpace(value) {
  return value.replace(/\\s+/g, " ").trim();
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}
`;

async function writeDescriptorOverlay(rootPath: string, descriptorOverlay: unknown): Promise<void> {
  if (descriptorOverlay === undefined) return;
  const descriptor = cliDescriptorSchema.parse(descriptorOverlay);
  await writeFile(join(rootPath, cliPackageDescriptorName), `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
}

async function installAmbientCliPackageDependencies(rootPath: string): Promise<AmbientCliPackageDependencyInstallResult> {
  const command = ["npm", "ci", "--ignore-scripts"];
  const packageJsonPath = join(rootPath, packageJsonName);
  if (!existsSync(packageJsonPath)) {
    return { manager: "npm", command, cwd: rootPath, attempted: false, passed: false, skipped: true, reason: "Missing package.json." };
  }
  const pkg = packageJsonSchema.parse(await readJson(packageJsonPath));
  const packageNames = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  if (packageNames.length === 0) {
    return {
      manager: "npm",
      command,
      cwd: rootPath,
      attempted: false,
      passed: true,
      skipped: true,
      reason: "No package dependencies declared.",
    };
  }
  if (!existsSync(join(rootPath, "package-lock.json"))) {
    return {
      manager: "npm",
      command,
      cwd: rootPath,
      attempted: false,
      passed: false,
      reason: "Missing package-lock.json. Ambient CLI dependency setup only supports lockfile-backed npm packages.",
    };
  }
  try {
    const { stdout, stderr } = await execFileAsync(command[0], command.slice(1), {
      cwd: rootPath,
      timeout: 120_000,
      env: ambientRuntimeEnv(),
      maxBuffer: 1024 * 1024 * 4,
    });
    const stdoutOutput = stdout
      ? await materializeTextOutput(rootPath, {
          label: "ambient-cli-dependency-install-stdout",
          text: stdout,
          maxPreviewChars: 4_000,
        })
      : undefined;
    const stderrOutput = stderr
      ? await materializeTextOutput(rootPath, {
          label: "ambient-cli-dependency-install-stderr",
          text: stderr,
          maxPreviewChars: 4_000,
        })
      : undefined;
    return {
      manager: "npm",
      command,
      cwd: rootPath,
      attempted: true,
      passed: true,
      ...(stdoutOutput ? { stdout: stdoutOutput.text, stdoutOutput } : {}),
      ...(stderrOutput ? { stderr: stderrOutput.text, stderrOutput } : {}),
    };
  } catch (error) {
    return {
      manager: "npm",
      command,
      cwd: rootPath,
      attempted: true,
      passed: false,
      error: errorMessage(error),
    };
  }
}

async function resolveAmbientCliEnvStatus(workspacePath: string, pkg: AmbientCliPackageSummary): Promise<AmbientCliPackageEnvStatus[]> {
  const bindings = await readAmbientCliEnvBindingMap(workspacePath, pkg.name);
  return Promise.all(
    pkg.envRequirements.map(async (requirement) => {
      const binding = bindings[requirement.name];
      if (binding?.source === "file") {
        try {
          const absolutePath = resolve(workspacePath, binding.filePath);
          if (!isPathInside(workspacePath, absolutePath)) throw new Error("Env file must stay inside the workspace.");
          const value = (await readFile(absolutePath, "utf8")).trim();
          return {
            ...requirement,
            configured: value.length > 0,
            source: "file" as const,
            filePath: `./${relative(workspacePath, absolutePath).split(sep).join("/")}`,
            ...(value.length === 0 ? { error: "Env file is empty." } : {}),
          };
        } catch (error) {
          return {
            ...requirement,
            configured: false,
            source: "file" as const,
            filePath: binding.filePath,
            error: errorMessage(error),
          };
        }
      }
      if (binding?.source === "managed-secret") {
        try {
          const value = (await readSecretReference(binding.secretRef))?.trim();
          return {
            ...requirement,
            configured: Boolean(value),
            source: "managed-secret" as const,
            secretRef: binding.secretRef,
            ...(value ? {} : { error: "Managed secret reference is empty or missing." }),
          };
        } catch (error) {
          return {
            ...requirement,
            configured: false,
            source: "managed-secret" as const,
            secretRef: binding.secretRef,
            error: errorMessage(error),
          };
        }
      }
      const processValue = process.env[requirement.name];
      if (typeof processValue === "string" && processValue.length > 0 && !isSecretEnvName(requirement.name)) {
        return {
          ...requirement,
          configured: true,
          source: "process" as const,
        };
      }
      return {
        ...requirement,
        configured: false,
      };
    }),
  );
}

function requiredMissingEnv(status: AmbientCliPackageEnvStatus[]): AmbientCliPackageEnvStatus[] {
  return status.filter((env) => env.required && !env.configured);
}

async function ambientCliProcessEnv(workspacePath: string, pkg: AmbientCliPackageSummary): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = {
    ...ambientRuntimeEnv(),
    AMBIENT_WORKSPACE_PATH: workspacePath,
    AMBIENT_DESKTOP_WORKSPACE: workspacePath,
  };
  for (const status of await resolveAmbientCliEnvStatus(workspacePath, pkg)) {
    if (status.source === "file") {
      if (!status.filePath || !status.configured) continue;
      const absolutePath = resolve(workspacePath, status.filePath);
      if (!isPathInside(workspacePath, absolutePath)) throw new Error(`Env file for ${status.name} must stay inside the workspace.`);
      env[status.name] = (await readFile(absolutePath, "utf8")).trim();
    } else if (status.source === "managed-secret") {
      if (!status.secretRef || !status.configured) continue;
      const value = (await readSecretReference(status.secretRef))?.trim();
      if (value) env[status.name] = value;
    } else if (status.source === "process" && status.configured && !isSecretEnvName(status.name)) {
      const value = process.env[status.name];
      if (typeof value === "string") env[status.name] = value;
    }
  }
  for (const name of ambientCliTestHookEnvNames(pkg.name)) {
    const value = process.env[name];
    if (typeof value === "string" && !isSecretEnvName(name)) env[name] = value;
  }
  applyAmbientCliPackageDefaultEnv(workspacePath, pkg, env);
  return env;
}

function applyAmbientCliPackageDefaultEnv(workspacePath: string, pkg: AmbientCliPackageSummary, env: NodeJS.ProcessEnv): void {
  if (pkg.name !== "ambient-minicpm-v-vision") return;
  if (env.AMBIENT_MINICPM_V_STATE_DIR) return;
  const stateDir = resolve(workspacePath, ".ambient/vision/minicpm-v/state");
  if (!isPathInside(workspacePath, stateDir)) return;
  env.AMBIENT_MINICPM_V_STATE_DIR = stateDir;
}

function ambientCliTestHookEnvNames(packageName: string): string[] {
  if (packageName === "ambient-qwen3-asr") return ["AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT"];
  if (packageName === "ambient-faster-whisper-stt") return ["AMBIENT_FASTER_WHISPER_FAKE_TRANSCRIPT"];
  if (packageName === "ambient-hyperframes") return ["AMBIENT_HYPERFRAMES_FAKE_RENDER"];
  if (packageName === "ambient-imagegen") return ["AMBIENT_HOSTED_IMAGE_FAKE_GENERATION"];
  if (packageName === "ambient-tinystyler") return ["AMBIENT_TINYSTYLER_FAKE_RUNTIME"];
  if (packageName === "ambient-minicpm-v-vision") return ["AMBIENT_MINICPM_V_FAKE_ANALYSIS"];
  return [];
}

async function readAmbientCliEnvBindingMap(
  workspacePath: string,
  packageName: string,
): Promise<Record<string, AmbientCliEnvBindingResolution>> {
  const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
  const bindingsPath = join(installWorkspace, cliPackageEnvBindingsPath);
  if (!existsSync(bindingsPath)) return {};
  const parsed = cliPackageEnvBindingsSchema.parse(await readJson(bindingsPath));
  const { bindings, changed } = await migrateAmbientCliLegacySecretBindings(workspacePath, parsed.bindings);
  if (changed) await writeFile(bindingsPath, `${JSON.stringify({ bindings }, null, 2)}\n`, "utf8");
  const entries: Record<string, AmbientCliEnvBindingResolution> = {};
  for (const binding of bindings) {
    if (binding.packageName !== packageName) continue;
    const envName = normalizeEnvName(binding.envName);
    if (binding.secretRef) entries[envName] = { source: "managed-secret", secretRef: binding.secretRef };
    else if (binding.filePath) entries[envName] = { source: "file", filePath: binding.filePath };
  }
  return entries;
}

async function migrateAmbientCliLegacySecretBindings(
  workspacePath: string,
  bindings: AmbientCliPackageEnvBindingRow[],
): Promise<{ bindings: AmbientCliPackageEnvBindingRow[]; changed: boolean }> {
  let changed = false;
  const migrated: AmbientCliPackageEnvBindingRow[] = [];
  for (const binding of bindings) {
    if (!binding.filePath || binding.secretRef || !isLegacyWorkspaceSecretBinding(workspacePath, binding.filePath, ["cli-packages"])) {
      migrated.push(binding);
      continue;
    }
    try {
      const absolutePath = resolve(workspacePath, binding.filePath);
      const value = (await readFile(absolutePath, "utf8")).trim();
      if (!value) {
        migrated.push(binding);
        continue;
      }
      const envName = normalizeEnvName(binding.envName);
      const secretRef = await saveSecretReference({
        scope: "ambient-cli",
        workspacePath,
        ownerId: binding.packageName,
        envName,
        value,
      });
      await rm(absolutePath, { force: true });
      migrated.push({ packageName: binding.packageName, envName, secretRef });
      changed = true;
    } catch {
      migrated.push(binding);
    }
  }
  return { bindings: migrated, changed };
}

function isLegacyWorkspaceSecretBinding(workspacePath: string, filePath: string, namespace: string[]): boolean {
  const absolutePath = resolve(workspacePath, filePath);
  const legacyRoot = resolve(workspacePath, ".ambient", ...namespace, "secrets");
  return isPathInside(legacyRoot, absolutePath) && absolutePath.endsWith(".secret");
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

export function hasAmbientCliWorkspaceProviderMarker(workspacePath: string): boolean {
  return existsSync(resolve(workspacePath, ambientCliWorkspaceProviderMarkerPath));
}

export function hasAmbientCliWorkspaceProviderDiscoverySignal(workspacePath: string): boolean {
  const workspace = resolve(workspacePath);
  if (hasAmbientCliWorkspaceProviderMarker(workspace)) return true;
  if (existsSync(resolve(workspace, cliPackageConfigPath))) return true;
  if (!existsSync(join(managedInstallWorkspacePath(workspace), cliPackageConfigPath))) return false;
  return (
    existsSync(resolve(workspace, legacyVoiceDiscoveryCachePath)) ||
    existsSync(resolve(workspace, legacyQwenSttValidationMetadataPath)) ||
    ambientCliWorkspaceHasExistingProviderEnvBinding(workspace)
  );
}

function ambientCliWorkspaceHasExistingProviderEnvBinding(workspacePath: string): boolean {
  const workspace = resolve(workspacePath);
  const bindingsPath = join(managedInstallWorkspacePath(workspace), cliPackageEnvBindingsPath);
  if (!existsSync(bindingsPath)) return false;
  try {
    const parsed = cliPackageEnvBindingsSchema.parse(JSON.parse(readFileSync(bindingsPath, "utf8")));
    return parsed.bindings.some(
      (binding) =>
        ambientCliEnvBindingFileExistsInWorkspace(workspace, binding) || ambientCliEnvBindingSecretMatchesWorkspace(workspace, binding),
    );
  } catch {
    return false;
  }
}

function ambientCliEnvBindingFileExistsInWorkspace(workspacePath: string, binding: AmbientCliPackageEnvBindingRow): boolean {
  if (!binding.filePath) return false;
  const absolutePath = resolve(workspacePath, binding.filePath);
  return isPathInside(workspacePath, absolutePath) && existsSync(absolutePath);
}

function ambientCliEnvBindingSecretMatchesWorkspace(workspacePath: string, binding: AmbientCliPackageEnvBindingRow): boolean {
  if (!binding.secretRef) return false;
  try {
    return (
      binding.secretRef ===
      secretReferenceFor({
        scope: "ambient-cli",
        workspacePath,
        ownerId: binding.packageName,
        envName: binding.envName,
      })
    );
  } catch {
    return false;
  }
}

async function markAmbientCliWorkspaceProviderState(workspacePath: string, input: { reason: string; packageName?: string }): Promise<void> {
  const markerPath = resolve(workspacePath, ambientCliWorkspaceProviderMarkerPath);
  if (!isPathInside(resolve(workspacePath), markerPath))
    throw new Error("Ambient CLI workspace provider marker must stay inside the workspace.");
  await mkdir(dirname(markerPath), { recursive: true });
  await writeFile(
    markerPath,
    `${JSON.stringify(
      {
        schemaVersion: "ambient-cli-workspace-provider-state-v1",
        updatedAt: new Date().toISOString(),
        reason: input.reason,
        ...(input.packageName ? { packageName: input.packageName } : {}),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
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

function contentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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
