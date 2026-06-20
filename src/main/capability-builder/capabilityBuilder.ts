import { execFile, type ExecFileException } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, chmod, mkdir, opendir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { isPathInside } from "./capabilityBuilderSessionFacade";
import {
  discoverAmbientCliPackages,
  discoverAmbientCliVoiceProviders,
  installAmbientCliPackageSource,
  setAmbientCliPackageEnvBinding,
  setAmbientCliPackageSecretBinding,
  uninstallAmbientCliPackageSource,
  type AmbientCliPackageCatalog,
  type AmbientCliPackageSummary,
} from "./capabilityBuilderAmbientCliFacade";
import type { ToolLargeOutputPreview, ToolLargeOutputPreviewItem } from "../../shared/threadTypes";
import type {
  VoiceOutputFormat,
  VoiceProviderCandidate,
  VoiceProviderCloningMetadata,
  VoiceProviderDiscoveryMetadata,
} from "../../shared/localRuntimeTypes";
import { ambientRuntimeEnv, managedInstallWorkspacePath, migrateWorkspaceManagedInstallPath } from "./capabilityBuilderSetupFacade";
import { isSecretReference, readSecretReference, redactSensitiveText, saveSecretReference } from "../security/securityCapabilityBuilderContract";
import { materializeTextOutput, type MaterializedTextOutput } from "../tool-runtime/toolOutputArtifacts";

const execFileAsync = promisify(execFile);
const builderRoot = ".ambient/capability-builder/packages";
const dependencyOutputPreviewChars = 4_000;
const dependencyCommandTimeoutMs = 120_000;
const validationCommandTimeoutMs = 120_000;
const builderFileReadPreviewChars = 120_000;
const builderListDefaultMaxEntries = 200;
const builderListMaxEntries = 1_000;
const builderListInventoryArtifactMaxEntries = 20_000;
const builderListInventoryArtifactPreviewChars = 12_000;
const builderListDefaultMaxDepth = 12;
const builderListMaxDepth = 24;
const builderListMaxOmittedDirectories = 50;
const builderListOmittedSummaryMaxFiles = 1_000;
const builderListOmittedSummaryMaxDirectories = 250;
const builderListMaxCursorOffset = 50_000;
const builderListCursorVersion = 1;
const builderListSortOrder = "filesystem-stream-depth-first-v1";
const builderListGeneratedDirectoryNames = new Set([
  ".cache",
  ".mypy_cache",
  ".next",
  ".parcel-cache",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".turbo",
  ".venv",
  "build",
  "coverage",
  "dist",
  "env",
  "node_modules",
  "site-packages",
  "venv",
  "__pycache__",
]);

async function ensureCapabilityBuilderManagedWorkspace(workspacePath: string): Promise<string> {
  await migrateWorkspaceManagedInstallPath(workspacePath, ".ambient/capability-builder");
  return managedInstallWorkspacePath(workspacePath);
}

interface CapabilityBuilderFileMetadata {
  sizeBytes: number;
  mtimeMs: number;
}

export type CapabilityBuilderInstallerShape =
  | "tts-provider"
  | "artifact-generator"
  | "file-converter"
  | "search-provider"
  | "browser-tooling"
  | "connector"
  | "custom-cli";

export interface CapabilityBuilderScaffoldInput {
  name?: string;
  goal: string;
  installerShape?: CapabilityBuilderInstallerShape;
  kind?: string;
  provider?: string;
  outputArtifactTypes?: string[];
  responseFormats?: string[];
  locality?: "local" | "network" | "either";
  envNames?: string[];
  networkHosts?: string[];
  modelAssets?: string[];
}

export interface CapabilityBuilderSourceRef {
  kind: "capability-builder-source";
  packageName: string;
  workspacePath: string;
  rootPath: string;
  relativeRootPath: string;
  sourcePath: string;
}

export interface CapabilityBuilderScaffoldResult {
  name: string;
  installerShape?: CapabilityBuilderInstallerShape;
  rootPath: string;
  relativeRootPath: string;
  sourceRef: CapabilityBuilderSourceRef;
  descriptorPath: string;
  skillPath: string;
  scriptPath: string;
  testPath: string;
  manifestPath: string;
  gitSha?: string;
  files: string[];
}

export interface CapabilityBuilderPreviewInput {
  packageName?: string;
  path?: string;
  sourcePath?: string;
}

export interface CapabilityBuilderListFilesInput extends CapabilityBuilderPreviewInput {
  pathPrefix?: string;
  maxEntries?: number;
  maxDepth?: number;
  includeGenerated?: boolean;
  cursor?: string;
}

export interface CapabilityBuilderOmittedDirectorySummary {
  path: string;
  reason: "generated" | "maxDepth";
  fileCount: number;
  totalBytes: number;
  truncated: boolean;
}

export interface CapabilityBuilderListInventoryArtifact {
  path: string;
  bytes?: number;
  chars: number;
  previewChars: number;
  truncated: boolean;
  redacted: boolean;
  redactionCount: number;
  inventoryFileCount: number;
  inventoryFileCountTruncated: boolean;
  fileReadInput: {
    path: string;
  };
  longContextProcessInput: {
    taskType: "analysis";
    instruction: string;
    workspacePaths: string[];
    maxModelCalls: number;
  };
}

export interface CapabilityBuilderListFilesResult {
  packageName: string;
  rootPath: string;
  relativeRootPath: string;
  sourceRef: CapabilityBuilderSourceRef;
  pathPrefix?: string;
  maxEntries: number;
  maxDepth: number;
  includeGenerated: boolean;
  totalFileCount: number;
  totalFileCountTruncated: boolean;
  omittedDirectoryCount: number;
  omittedDirectories: CapabilityBuilderOmittedDirectorySummary[];
  nextCursor?: string;
  inventoryArtifact?: CapabilityBuilderListInventoryArtifact;
  files: Array<{
    path: string;
    sizeBytes: number;
    mtimeMs: number;
  }>;
}

export interface CapabilityBuilderReadFileInput extends CapabilityBuilderPreviewInput {
  filePath: string;
  maxChars?: number;
}

export interface CapabilityBuilderReadFileResult {
  packageName: string;
  rootPath: string;
  relativeRootPath: string;
  sourceRef: CapabilityBuilderSourceRef;
  filePath: string;
  sizeBytes: number;
  content: string;
  truncated: boolean;
  maxChars: number;
}

export interface CapabilityBuilderWriteFileInput extends CapabilityBuilderPreviewInput {
  filePath: string;
  content: string;
  reason: string;
}

export interface CapabilityBuilderWriteFileResult {
  packageName: string;
  rootPath: string;
  relativeRootPath: string;
  sourceRef: CapabilityBuilderSourceRef;
  filePath: string;
  sizeBytes: number;
  created: boolean;
  gitSha?: string;
  reason: string;
  nextSteps: string[];
}

export interface CapabilityBuilderUpdatePlanInput extends CapabilityBuilderPreviewInput {
  requestedChanges?: string;
  targetVersion?: string;
  notes?: string;
}

export interface CapabilityBuilderRemovalPlanInput extends CapabilityBuilderPreviewInput {
  installedPackageId?: string;
  installedSource?: string;
  reason?: string;
  notes?: string;
}

export interface CapabilityBuilderRepairPlanInput extends CapabilityBuilderPreviewInput {
  requestedRepair?: string;
  notes?: string;
}

export interface CapabilityBuilderRepairFileInput {
  path: string;
  content: string;
  rationale: string;
}

export interface CapabilityBuilderApplyRepairInput extends CapabilityBuilderPreviewInput {
  reason: string;
  files: CapabilityBuilderRepairFileInput[];
}

export interface CapabilityBuilderApplyRepairFileResult {
  path: string;
  sizeBytes: number;
  created: boolean;
  rationale: string;
}

export interface CapabilityBuilderApplyRepairResult {
  packageName: string;
  rootPath: string;
  relativeRootPath: string;
  gitSha?: string;
  repairGitSha?: string;
  repairedAt: string;
  reason: string;
  files: CapabilityBuilderApplyRepairFileResult[];
  nextSteps: string[];
}

export interface CapabilityBuilderDependencyCommand {
  command: string;
  args?: string[];
  cwd?: string;
  rationale: string;
}

export interface CapabilityBuilderInstallDepsInput extends CapabilityBuilderPreviewInput {
  commands: CapabilityBuilderDependencyCommand[];
}

export interface CapabilityBuilderDependencyCommandResult {
  command: string;
  args: string[];
  cwd: string;
  rationale: string;
  status: "succeeded" | "failed";
  durationMs: number;
  exitCode?: number | string;
  error?: string;
  stdoutPreview: string;
  stderrPreview: string;
  stdoutLength: number;
  stderrLength: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

export interface CapabilityBuilderInstallDepsResult {
  packageName: string;
  rootPath: string;
  relativeRootPath: string;
  gitSha?: string;
  succeeded: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  logPath: string;
  relativeLogPath: string;
  commands: CapabilityBuilderDependencyCommandResult[];
}

export interface CapabilityBuilderValidateInput extends CapabilityBuilderPreviewInput {
  includeSmokeTests?: boolean;
}

export interface CapabilityBuilderSecretSaveInput extends CapabilityBuilderPreviewInput {
  envName: string;
  value: string;
}

export interface CapabilityBuilderSecretSaveResult {
  packageName: string;
  rootPath: string;
  relativeRootPath: string;
  sourcePath: string;
  envName: string;
  source: "managed-secret";
  secretRef: string;
  filePath?: string;
  configured: boolean;
}

export interface CapabilityBuilderRegisterInput extends CapabilityBuilderPreviewInput {}

export interface CapabilityBuilderUnregisterInput extends CapabilityBuilderRemovalPlanInput {
  preserveBuilderSource?: boolean;
}

export interface CapabilityBuilderHistoryInput {
  includeRegistered?: boolean;
  includeDrafts?: boolean;
  packageName?: string;
}

export interface CapabilityBuilderValidationCommand extends CapabilityBuilderDependencyCommand {
  source: "healthCheck" | "smokeTest" | "providerContract";
  commandName?: string;
}

export interface CapabilityBuilderValidationArtifact {
  path: string;
  sizeBytes: number;
}

export interface CapabilityBuilderValidationEvidence {
  validatedAt?: string;
  sourceGitSha?: string;
  sourceHash?: string;
  logPath?: string;
  artifacts: CapabilityBuilderValidationArtifact[];
}

export interface CapabilityBuilderEnvRequirement {
  name: string;
  description?: string;
  required: boolean;
}

export interface CapabilityBuilderModelAsset {
  name: string;
  url?: string;
  expectedSizeBytes?: number;
  sha256?: string;
  license?: string;
  cachePath?: string;
}

export interface CapabilityBuilderValidateResult {
  packageName: string;
  rootPath: string;
  relativeRootPath: string;
  gitSha?: string;
  succeeded: boolean;
  validatedAt?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  logPath: string;
  relativeLogPath: string;
  envRequirements: CapabilityBuilderEnvRequirement[];
  networkHosts: string[];
  commands: Array<CapabilityBuilderDependencyCommandResult & { source: CapabilityBuilderValidationCommand["source"]; commandName?: string }>;
  artifacts: CapabilityBuilderValidationArtifact[];
}

export interface CapabilityBuilderRegisterResult {
  packageName: string;
  rootPath: string;
  relativeRootPath: string;
  gitSha?: string;
  sourceRef: CapabilityBuilderSourceRef;
  validationEvidence: CapabilityBuilderValidationEvidence;
  registeredAt: string;
  installedPackage: AmbientCliPackageSummary;
  voiceProvider?: CapabilityBuilderRegisteredVoiceProvider;
}

export interface CapabilityBuilderRegisteredVoiceProvider {
  capabilityId: string;
  label: string;
  command: string;
  format: VoiceOutputFormat;
  formats: VoiceOutputFormat[];
  voices: Array<{ id: string; label?: string }>;
  voiceDiscovery?: VoiceProviderDiscoveryMetadata;
  voiceCloning?: VoiceProviderCloningMetadata;
  available: boolean;
  availabilityReason: string;
  healthStatus: string;
}

export interface CapabilityBuilderUnregisterResult {
  packageName: string;
  rootPath: string;
  relativeRootPath: string;
  gitSha?: string;
  unregisteredAt: string;
  removedPackage: AmbientCliPackageSummary;
  catalog: AmbientCliPackageCatalog;
  removalPlan: CapabilityBuilderRemovalPlanResult;
  preserved: {
    builderSource: boolean;
    logs: boolean;
    artifacts: boolean;
    envSecrets: boolean;
  };
}

export interface CapabilityBuilderHistoryEntry {
  packageName: string;
  rootPath: string;
  relativeRootPath: string;
  gitSha?: string;
  valid: boolean;
  status: string;
  goal?: string;
  installerShape?: CapabilityBuilderInstallerShape;
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

export interface CapabilityBuilderUpdatePlanResult {
  packageName: string;
  rootPath: string;
  relativeRootPath: string;
  gitSha?: string;
  requestedChanges?: string;
  targetVersion?: string;
  notes?: string;
  preview: CapabilityBuilderPreviewResult;
  buildManifest?: {
    status?: string;
    goal?: string;
    installerShape?: CapabilityBuilderInstallerShape;
    kind?: string;
    provider?: string;
    version?: string;
    sourcePath?: string;
    installedPackageId?: string;
    installedSource?: string;
    refs: Record<string, string | null>;
  };
  recommendedSteps: string[];
  approvalCheckpoints: string[];
  rollbackPlan: string[];
  warnings: string[];
  errors: string[];
  mutationProhibited: true;
}

export interface CapabilityBuilderRemovalPlanResult {
  packageName: string;
  rootPath: string;
  relativeRootPath: string;
  gitSha?: string;
  sourceExists: boolean;
  installedPackageId?: string;
  installedSource?: string;
  reason?: string;
  notes?: string;
  preview?: CapabilityBuilderPreviewResult;
  buildManifest?: {
    status?: string;
    goal?: string;
    installerShape?: CapabilityBuilderInstallerShape;
    kind?: string;
    provider?: string;
    version?: string;
    sourcePath?: string;
    installedPackageId?: string;
    installedSource?: string;
    refs: Record<string, string | null>;
  };
  sourceInventory: {
    packageFiles: string[];
    logFiles: string[];
    metadataFiles: string[];
    possibleArtifactFiles: string[];
  };
  recommendedSteps: string[];
  approvalCheckpoints: string[];
  rollbackPlan: string[];
  preserveByDefault: string[];
  warnings: string[];
  errors: string[];
  mutationProhibited: true;
}

export interface CapabilityBuilderRepairDiagnosticEvidence {
  logFiles: string[];
  recommendedReads: string[];
  recentLogEntries: Array<{
    path: string;
    lineCount: number;
    entries: string[];
  }>;
}

export interface CapabilityBuilderRepairPlanResult {
  packageName: string;
  rootPath: string;
  relativeRootPath: string;
  gitSha?: string;
  requestedRepair?: string;
  notes?: string;
  preview: CapabilityBuilderPreviewResult;
  buildManifest?: {
    status?: string;
    goal?: string;
    installerShape?: CapabilityBuilderInstallerShape;
    kind?: string;
    provider?: string;
    version?: string;
    sourcePath?: string;
    installedPackageId?: string;
    installedSource?: string;
    refs: Record<string, string | null>;
  };
  sourceInventory: {
    packageFiles: string[];
    logFiles: string[];
    metadataFiles: string[];
    possibleArtifactFiles: string[];
  };
  diagnosticEvidence: CapabilityBuilderRepairDiagnosticEvidence;
  recommendedSteps: string[];
  installerRecoveryGuidance: string[];
  installerRecoveryTemplates: CapabilityBuilderInstallerRecoveryTemplate[];
  approvalCheckpoints: string[];
  validationPlan: string[];
  rollbackPlan: string[];
  warnings: string[];
  errors: string[];
  mutationProhibited: true;
}

export interface CapabilityBuilderInstallerRecoveryTemplate {
  id: string;
  label: string;
  appliesWhen: string;
  steps: string[];
  privilegedBoundary: string;
}

export interface CapabilityBuilderPreviewResult {
  packageName: string;
  rootPath: string;
  relativeRootPath: string;
  gitSha?: string;
  valid: boolean;
  installerShape?: CapabilityBuilderInstallerShape;
  errors: string[];
  warnings: string[];
  risks: string[];
  files: {
    descriptor: boolean;
    skill: boolean;
    buildManifest: boolean;
    packageJson: boolean;
  };
  descriptor?: {
    name?: string;
    version?: string;
    description?: string;
    commandNames: string[];
    voiceProviderCommandNames: string[];
    voiceDiscoveryCommandNames: string[];
    voiceCloningCommandNames: string[];
    envNames: string[];
    envRequirements: CapabilityBuilderEnvRequirement[];
    networkHosts: string[];
    modelAssets: CapabilityBuilderModelAsset[];
    artifactOutputTypes: string[];
    responseFormats: string[];
  };
  packageJson?: {
    dependencies: string[];
    devDependencies: string[];
    lifecycleScripts: string[];
  };
}

export async function scaffoldCapabilityBuilderPackage(
  workspacePath: string,
  input: CapabilityBuilderScaffoldInput,
): Promise<CapabilityBuilderScaffoldResult> {
  const name = capabilityPackageName(input.name ?? (input.provider ? `${input.provider} ${input.goal}` : input.goal));
  const workspace = resolve(workspacePath);
  const managedWorkspace = await ensureCapabilityBuilderManagedWorkspace(workspace);
  const rootPath = resolve(managedWorkspace, builderRoot, name);
  const relativeRootPath = toWorkspaceRelative(managedWorkspace, rootPath);
  if (!isPathInside(resolve(managedWorkspace, builderRoot), rootPath)) throw new Error("Capability package path escaped the managed builder root.");
  if (existsSync(rootPath)) throw new Error(`Capability builder package already exists: ${relativeRootPath}`);

  const files = scaffoldFiles(name, input);
  await mkdir(join(rootPath, "scripts"), { recursive: true });
  await mkdir(join(rootPath, "tests"), { recursive: true });
  for (const file of files) {
    await writeFile(join(rootPath, file.path), file.content, "utf8");
  }
  await chmod(join(rootPath, "scripts", "run.mjs"), 0o755);
  const gitSha = await initializePackageGit(rootPath);
  const result: CapabilityBuilderScaffoldResult = {
    name,
    ...(normalizedInstallerShape(input) ? { installerShape: normalizedInstallerShape(input) } : {}),
    rootPath,
    relativeRootPath,
    sourceRef: capabilityBuilderSourceRef(managedWorkspace, rootPath, name),
    descriptorPath: join(rootPath, "ambient-cli.json"),
    skillPath: join(rootPath, "SKILL.md"),
    scriptPath: join(rootPath, "scripts", "run.mjs"),
    testPath: join(rootPath, "tests", "smoke.test.mjs"),
    manifestPath: join(rootPath, "capability-build.json"),
    gitSha,
    files: files.map((file) => file.path),
  };
  await writeFile(result.manifestPath, `${JSON.stringify(buildManifest(name, input, gitSha), null, 2)}\n`, "utf8");
  if (gitSha) {
    await execFileAsync("git", ["add", "capability-build.json"], { cwd: rootPath, env: gitEnv() });
    await execFileAsync("git", ["commit", "--amend", "--no-edit"], { cwd: rootPath, env: gitEnv() });
    result.gitSha = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: rootPath, env: gitEnv() })).stdout.trim();
  }
  return result;
}

export async function listCapabilityBuilderFiles(
  workspacePath: string,
  input: CapabilityBuilderListFilesInput,
): Promise<CapabilityBuilderListFilesResult> {
  const workspace = resolve(workspacePath);
  const managedWorkspace = await ensureCapabilityBuilderManagedWorkspace(workspace);
  const preview = await previewCapabilityBuilderPackage(workspace, input);
  const listing = await listCapabilityBuilderSourceFiles(preview.rootPath, input, {
    packageName: preview.packageName,
    sourcePath: preview.relativeRootPath,
    gitSha: preview.gitSha,
  });
  const inventoryListing = await listCapabilityBuilderSourceFiles(preview.rootPath, {
    ...input,
    cursor: undefined,
    maxEntries: builderListInventoryArtifactMaxEntries,
  }, {
    packageName: preview.packageName,
    sourcePath: preview.relativeRootPath,
    gitSha: preview.gitSha,
  }, builderListInventoryArtifactMaxEntries);
  const inventoryArtifact = await materializeCapabilityBuilderListInventoryArtifact(workspace, preview, inventoryListing);
  return {
    packageName: preview.packageName,
    rootPath: preview.rootPath,
    relativeRootPath: preview.relativeRootPath,
    sourceRef: capabilityBuilderSourceRef(managedWorkspace, preview.rootPath, preview.packageName),
    ...(listing.pathPrefix ? { pathPrefix: listing.pathPrefix } : {}),
    maxEntries: listing.maxEntries,
    maxDepth: listing.maxDepth,
    includeGenerated: listing.includeGenerated,
    totalFileCount: listing.totalFileCount,
    totalFileCountTruncated: listing.totalFileCountTruncated,
    omittedDirectoryCount: listing.omittedDirectoryCount,
    omittedDirectories: listing.omittedDirectories,
    ...(listing.nextCursor ? { nextCursor: listing.nextCursor } : {}),
    ...(inventoryArtifact ? { inventoryArtifact } : {}),
    files: listing.files,
  };
}

export async function readCapabilityBuilderFile(
  workspacePath: string,
  input: CapabilityBuilderReadFileInput,
): Promise<CapabilityBuilderReadFileResult> {
  const workspace = resolve(workspacePath);
  const managedWorkspace = await ensureCapabilityBuilderManagedWorkspace(workspace);
  const preview = await previewCapabilityBuilderPackage(workspace, input);
  const file = normalizeBuilderTextFilePath(preview.rootPath, input.filePath, { allowBuilderMetadata: true });
  if (!existsSync(file.absolutePath)) throw new Error(`Capability Builder file does not exist: ${file.path}`);
  const fileStat = await stat(file.absolutePath);
  if (!fileStat.isFile()) throw new Error(`Capability Builder path is not a file: ${file.path}`);
  const maxChars = Math.min(Math.max(Math.floor(input.maxChars ?? builderFileReadPreviewChars), 1), builderFileReadPreviewChars);
  const content = await readFile(file.absolutePath, "utf8");
  return {
    packageName: preview.packageName,
    rootPath: preview.rootPath,
    relativeRootPath: preview.relativeRootPath,
    sourceRef: capabilityBuilderSourceRef(managedWorkspace, preview.rootPath, preview.packageName),
    filePath: file.path,
    sizeBytes: fileStat.size,
    content: content.slice(0, maxChars),
    truncated: content.length > maxChars,
    maxChars,
  };
}

export async function writeCapabilityBuilderFile(
  workspacePath: string,
  input: CapabilityBuilderWriteFileInput,
): Promise<CapabilityBuilderWriteFileResult> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Write reason is required.");
  const workspace = resolve(workspacePath);
  const managedWorkspace = await ensureCapabilityBuilderManagedWorkspace(workspace);
  const preview = await previewCapabilityBuilderPackage(workspace, input);
  const file = normalizeBuilderTextFilePath(preview.rootPath, input.filePath);
  await mkdir(dirname(file.absolutePath), { recursive: true });
  const created = !existsSync(file.absolutePath);
  await writeFile(file.absolutePath, input.content, "utf8");
  await invalidateValidationManifest(preview.rootPath);
  const gitSha = await commitPackageGitRevision(preview.rootPath, `Edit ${file.path}`);
  return {
    packageName: preview.packageName,
    rootPath: preview.rootPath,
    relativeRootPath: preview.relativeRootPath,
    sourceRef: capabilityBuilderSourceRef(managedWorkspace, preview.rootPath, preview.packageName),
    filePath: file.path,
    sizeBytes: Buffer.byteLength(input.content, "utf8"),
    created,
    ...(gitSha ? { gitSha } : {}),
    reason,
    nextSteps: [
      "Run ambient_capability_builder_preview and confirm static errors are resolved.",
      "Validate before registration if the edit changed executable behavior, descriptor metadata, dependencies, env requirements, or artifact contracts.",
      "Register or re-register only after validation succeeds and the user approves installed Ambient CLI package state changes.",
    ],
  };
}

export async function previewCapabilityBuilderPackage(
  workspacePath: string,
  input: CapabilityBuilderPreviewInput,
): Promise<CapabilityBuilderPreviewResult> {
  const workspace = resolve(workspacePath);
  const managedWorkspace = await ensureCapabilityBuilderManagedWorkspace(workspace);
  const rootPath = await resolveManagedPackagePath(workspace, managedWorkspace, input);
  const relativeRootPath = toWorkspaceRelative(managedWorkspace, rootPath);
  if (!existsSync(rootPath)) throw new Error(`Capability builder package does not exist: ${relativeRootPath}`);

  const descriptorPath = join(rootPath, "ambient-cli.json");
  const skillPath = join(rootPath, "SKILL.md");
  const buildManifestPath = join(rootPath, "capability-build.json");
  const packageJsonPath = join(rootPath, "package.json");
  const errors: string[] = [];
  const warnings: string[] = [];
  const risks: string[] = [];
  const descriptor = existsSync(descriptorPath) ? parseJsonObject(await readFile(descriptorPath, "utf8"), "ambient-cli.json", errors) : undefined;
  const buildManifest = existsSync(buildManifestPath) ? parseJsonObject(await readFile(buildManifestPath, "utf8"), "capability-build.json", warnings) : undefined;
  const packageJson = existsSync(packageJsonPath) ? parseJsonObject(await readFile(packageJsonPath, "utf8"), "package.json", errors) : undefined;
  const installerShape = installerShapeFromManifest(buildManifest);
  const parsedDescriptor = descriptor ? inspectDescriptor(descriptor, errors, warnings, risks, rootPath, { installerShape }) : undefined;
  if (!descriptor) errors.push("ambient-cli.json is missing.");
  if (!existsSync(skillPath)) errors.push("SKILL.md is missing.");
  if (!existsSync(buildManifestPath)) warnings.push("capability-build.json is missing.");
  const packageJsonSummary = packageJson ? inspectPackageJson(packageJson, risks) : undefined;
  const gitSha = await currentGitSha(rootPath);
  return {
    packageName: parsedDescriptor?.name ?? basename(rootPath),
    rootPath,
    relativeRootPath,
    gitSha,
    valid: errors.length === 0,
    ...(installerShape ? { installerShape } : {}),
    errors,
    warnings,
    risks,
    files: {
      descriptor: existsSync(descriptorPath),
      skill: existsSync(skillPath),
      buildManifest: existsSync(buildManifestPath),
      packageJson: existsSync(packageJsonPath),
    },
    descriptor: parsedDescriptor,
    packageJson: packageJsonSummary,
  };
}

export async function discoverCapabilityBuilderHistory(
  workspacePath: string,
  input: CapabilityBuilderHistoryInput = {},
): Promise<CapabilityBuilderHistoryResult> {
  const workspace = resolve(workspacePath);
  const managedWorkspace = await ensureCapabilityBuilderManagedWorkspace(workspace);
  const rootPath = resolve(managedWorkspace, builderRoot);
  const relativeRootPath = toWorkspaceRelative(managedWorkspace, rootPath);
  if (!existsSync(rootPath)) return { rootPath, relativeRootPath, entries: [], errors: [] };
  const catalog = await discoverAmbientCliPackages(workspace);
  const installedById = new Set(catalog.packages.filter((pkg) => pkg.installed).map((pkg) => pkg.id));
  const installedBySource = new Set(catalog.packages.filter((pkg) => pkg.installed).map((pkg) => pkg.source));
  const errors = [...catalog.errors];
  const entries: CapabilityBuilderHistoryEntry[] = [];
  const children = await readdir(rootPath, { withFileTypes: true });
  for (const child of children) {
    if (!child.isDirectory()) continue;
    const packageInput = { packageName: child.name };
    try {
      const preview = await previewCapabilityBuilderPackage(workspace, packageInput);
      const manifest = await readBuildManifestIfPresent(preview.rootPath);
      const summary = manifest ? summarizeBuildManifest(manifest) : undefined;
      const validationEvidence = validationEvidenceFromManifest(manifest);
      if (input.packageName && !capabilityBuilderPackageMatches(input.packageName, child.name, preview, summary)) continue;
      const inventory = await capabilityBuilderSourceInventory(preview.rootPath);
      const status = summary?.status ?? (preview.valid ? "unknown" : "invalid");
      if (status === "registered" && input.includeRegistered === false) continue;
      if ((status === "draft" || status === "unknown") && input.includeDrafts === false) continue;
      const installedPackageId = summary?.installedPackageId;
      const installedSource = summary?.installedSource;
      entries.push({
        packageName: preview.packageName,
        rootPath: preview.rootPath,
        relativeRootPath: preview.relativeRootPath,
        ...(preview.gitSha ? { gitSha: preview.gitSha } : {}),
        valid: preview.valid,
        status,
        ...(summary?.goal ? { goal: summary.goal } : {}),
        ...(summary?.installerShape ? { installerShape: summary.installerShape } : {}),
        ...(summary?.kind ? { kind: summary.kind } : {}),
        ...(summary?.provider ? { provider: summary.provider } : {}),
        ...(summary?.version ? { version: summary.version } : {}),
        ...(summary?.sourcePath ? { sourcePath: summary.sourcePath } : {}),
        ...(installedPackageId ? { installedPackageId } : {}),
        ...(installedSource ? { installedSource } : {}),
        installedPresent: Boolean((installedPackageId && installedById.has(installedPackageId)) || (installedSource && installedBySource.has(installedSource))),
        ...(stringField(manifest?.lastValidatedAt) ? { lastValidatedAt: stringField(manifest?.lastValidatedAt) } : {}),
        ...(stringField(manifest?.registeredAt) ? { registeredAt: stringField(manifest?.registeredAt) } : {}),
        ...(stringField(manifest?.unregisteredAt) ? { unregisteredAt: stringField(manifest?.unregisteredAt) } : {}),
        ...(validationEvidence.logPath ? { validationLogPath: validationEvidence.logPath } : {}),
        validationArtifacts: validationEvidence.artifacts,
        refs: summary?.refs ?? {},
        commandNames: preview.descriptor?.commandNames ?? [],
        envNames: preview.descriptor?.envNames ?? [],
        artifactOutputTypes: preview.descriptor?.artifactOutputTypes ?? [],
        logFiles: inventory.logFiles,
        possibleArtifactFiles: inventory.possibleArtifactFiles,
        errors: preview.errors,
        warnings: [...preview.warnings, ...preview.risks],
      });
    } catch (error) {
      errors.push(`${child.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  entries.sort((a, b) => a.packageName.localeCompare(b.packageName));
  return { rootPath, relativeRootPath, entries, errors };
}

export async function planCapabilityBuilderUpdate(
  workspacePath: string,
  input: CapabilityBuilderUpdatePlanInput,
): Promise<CapabilityBuilderUpdatePlanResult> {
  const preview = await previewCapabilityBuilderPackage(workspacePath, input);
  const manifest = await readBuildManifestIfPresent(preview.rootPath);
  const buildManifest = manifest ? summarizeBuildManifest(manifest) : undefined;
  const commandNames = preview.descriptor?.commandNames ?? [];
  const dependencyNames = [
    ...(preview.packageJson?.dependencies ?? []),
    ...(preview.packageJson?.devDependencies ?? []),
  ];
  const warnings = [
    ...preview.warnings,
    ...preview.risks,
    ...(!preview.files.buildManifest ? ["capability-build.json is missing; update provenance and registration refs may be incomplete."] : []),
    ...(dependencyNames.length ? [`Existing package dependencies require an explicit dependency preview before install/update: ${dependencyNames.join(", ")}.`] : []),
  ];
  const errors = [...preview.errors];
  return {
    packageName: preview.packageName,
    rootPath: preview.rootPath,
    relativeRootPath: preview.relativeRootPath,
    ...(preview.gitSha ? { gitSha: preview.gitSha } : {}),
    ...(input.requestedChanges ? { requestedChanges: input.requestedChanges } : {}),
    ...(input.targetVersion ? { targetVersion: input.targetVersion } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    preview,
    ...(buildManifest ? { buildManifest } : {}),
    recommendedSteps: [
      "Inspect the static preview, descriptor commands, SKILL.md guidance, dependency declarations, env requirements, artifact rules, and builder provenance before proposing edits.",
      input.requestedChanges
        ? `Plan file changes needed for the requested update: ${input.requestedChanges}`
        : "Ask the user for the concrete update goal before proposing file mutations.",
      commandNames.length
        ? `Preserve or intentionally migrate descriptor command contracts: ${commandNames.join(", ")}.`
        : "Add or repair descriptor command contracts before dependency installation, validation, or registration.",
      "List any dependency/setup commands with executable, args, cwd, and rationale; for Python dependencies, default to a package-local .venv via `uv venv --python <version> .venv` plus `uv pip install --python .venv/bin/python ...`, or `.venv/bin/python -m pip install ...`; wait for explicit user approval before running ambient_capability_builder_install_deps.",
      "Update SKILL.md, command descriptors, wrapper scripts, tests, health checks, env declarations, and artifact handling together so Pi guidance and executable behavior stay aligned.",
      input.targetVersion
        ? `Set the package version/update metadata to ${input.targetVersion} only after the implementation plan is approved.`
        : "Choose a version bump strategy during implementation and record it in package metadata.",
      "Run ambient_capability_builder_preview again after edits, then run ambient_capability_builder_validate after user approval.",
      "Register only after validation succeeds and the user approves making the rebuilt capability searchable/describable through Ambient CLI.",
      "Live-test from a fresh Pi turn with ambient_cli_search, ambient_cli_describe, and the mediated ambient_cli command path.",
    ],
    approvalCheckpoints: [
      "User approves the update plan before any file edits.",
      "User approves exact dependency/setup commands, including the target environment for any Python package install, before ambient_capability_builder_install_deps runs.",
      "User approves validation before ambient_capability_builder_validate runs.",
      "User approves registration before ambient_capability_builder_register updates installed Ambient CLI package state.",
      "User separately approves any destructive cleanup, secret/env binding change, external network/API use, or artifact deletion.",
    ],
    rollbackPlan: [
      `Keep the current source package at ${preview.relativeRootPath} and its package-local Git history until the update is validated.`,
      `Record the current source Git SHA before edits: ${preview.gitSha ?? "unavailable"}.`,
      buildManifest?.installedPackageId
        ? `Keep installed package ${buildManifest.installedPackageId} active until the rebuilt package is validated and registered.`
        : "Do not unregister or replace any installed package until the rebuilt source validates.",
      "If validation or live testing fails, restore the prior source Git ref or re-register the previous validated installed package.",
      "Preserve validation logs, dependency logs, generated artifacts, and env/secret metadata unless the user explicitly approves deletion.",
    ],
    warnings,
    errors,
    mutationProhibited: true,
  };
}

export async function planCapabilityBuilderRemoval(
  workspacePath: string,
  input: CapabilityBuilderRemovalPlanInput,
): Promise<CapabilityBuilderRemovalPlanResult> {
  const workspace = resolve(workspacePath);
  const managedWorkspace = await ensureCapabilityBuilderManagedWorkspace(workspace);
  const rootPath = await resolveManagedPackagePath(workspace, managedWorkspace, input);
  const relativeRootPath = toWorkspaceRelative(managedWorkspace, rootPath);
  const sourceExists = existsSync(rootPath);
  const preview = sourceExists ? await previewCapabilityBuilderPackage(workspacePath, input) : undefined;
  const manifest = sourceExists ? await readBuildManifestIfPresent(rootPath) : undefined;
  const buildManifest = manifest ? summarizeBuildManifest(manifest) : undefined;
  const sourceInventory = sourceExists ? await capabilityBuilderSourceInventory(rootPath) : emptySourceInventory();
  const packageName = preview?.packageName ?? buildManifest?.installedPackageId ?? capabilityPackageName(input.packageName ?? basename(rootPath));
  const installedPackageId = input.installedPackageId ?? buildManifest?.installedPackageId;
  const installedSource = input.installedSource ?? buildManifest?.installedSource ?? buildManifest?.sourcePath;
  const warnings = [
    ...(preview?.warnings ?? []),
    ...(preview?.risks ?? []),
    ...(!sourceExists ? [`Managed builder source does not exist at ${relativeRootPath}; removal planning is limited to installed metadata supplied in the request.`] : []),
    ...(sourceExists && !buildManifest ? ["capability-build.json is missing or unreadable; installed refs and validation provenance may be incomplete."] : []),
    ...(!installedPackageId && !installedSource ? ["No installed package id or installed source was provided or found in builder metadata. Confirm the installed package target before unregistering."] : []),
  ];
  const errors = [...(preview?.errors ?? [])];
  return {
    packageName,
    rootPath,
    relativeRootPath,
    ...(preview?.gitSha ? { gitSha: preview.gitSha } : {}),
    sourceExists,
    ...(installedPackageId ? { installedPackageId } : {}),
    ...(installedSource ? { installedSource } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    ...(preview ? { preview } : {}),
    ...(buildManifest ? { buildManifest } : {}),
    sourceInventory,
    recommendedSteps: [
      "Confirm whether the user wants to disable/unregister the installed Ambient CLI package, remove managed builder source, remove artifacts/logs, remove env/secret bindings, or only hide the capability from search.",
      installedPackageId || installedSource
        ? `Treat the installed package target as ${installedPackageId ?? installedSource}; do not remove it until the user approves the exact uninstall/unregister action.`
        : "Identify the installed package target before proposing any uninstall/unregister action.",
      sourceExists
        ? `Preserve managed builder source at ${relativeRootPath} by default, including package-local Git history and capability-build.json provenance.`
        : "If builder source is missing, do not attempt source deletion; limit the plan to installed package state and registry visibility.",
      "List validation logs, dependency logs, generated artifacts, and metadata separately so the user can choose what to preserve or delete.",
      "Check env and secret requirements from descriptor/provenance before removal; never delete or alter secrets without separate explicit approval.",
      "If the goal is temporary deactivation, prefer disabling/unregistering installed visibility while preserving source, logs, artifacts, and env bindings.",
      "If the goal is permanent deletion, require separate approvals for installed package removal, builder source deletion, artifact deletion, log deletion, and env/secret cleanup.",
      "After any approved removal step, refresh capability search/describe state and report what remains on disk and in registry metadata.",
    ],
    approvalCheckpoints: [
      "User approves installed package unregister/removal target before Ambient CLI package state changes.",
      "User separately approves managed builder source deletion before any source files or package-local Git history are removed.",
      "User separately approves validation/dependency log deletion.",
      "User separately approves generated artifact deletion.",
      "User separately approves env binding or secret metadata cleanup.",
      "User approves the rollback/reinstall path before any destructive action.",
    ],
    rollbackPlan: [
      preview?.gitSha
        ? `Use current builder source Git SHA ${preview.gitSha} as the rollback source ref.`
        : "Record any available installed package source/ref before removal because builder source Git SHA is unavailable.",
      installedSource
        ? `Keep installed source reference ${installedSource} until the removal succeeds and the user confirms no rollback is needed.`
        : "Capture installed source/package metadata before unregistering so the package can be reinstalled if needed.",
      "Preserve builder source and package-local Git history unless the user explicitly approves permanent source deletion.",
      "Preserve logs and generated artifacts until after installed package removal is verified.",
      "To roll back, re-register or reinstall the previous package source, then verify with ambient_cli_search and ambient_cli_describe in a fresh Pi turn.",
    ],
    preserveByDefault: [
      "managed builder source",
      "package-local Git history",
      "capability-build.json provenance",
      "validation logs",
      "dependency logs",
      "generated artifacts",
      "env bindings and secret metadata",
    ],
    warnings,
    errors,
    mutationProhibited: true,
  };
}

export async function planCapabilityBuilderRepair(
  workspacePath: string,
  input: CapabilityBuilderRepairPlanInput,
): Promise<CapabilityBuilderRepairPlanResult> {
  const preview = await previewCapabilityBuilderPackage(workspacePath, input);
  const manifest = await readBuildManifestIfPresent(preview.rootPath);
  const buildManifest = manifest ? summarizeBuildManifest(manifest) : undefined;
  const sourceInventory = await capabilityBuilderSourceInventory(preview.rootPath);
  const diagnosticEvidence = await capabilityBuilderRepairDiagnosticEvidence(preview.rootPath, sourceInventory);
  const descriptor = preview.descriptor;
  const artifactOutputTypes = descriptor?.artifactOutputTypes ?? [];
  const requiredEnvNames = requiredEnvRequirementNames(descriptor?.envRequirements ?? []);
  const dependencyNames = [
    ...(preview.packageJson?.dependencies ?? []),
    ...(preview.packageJson?.devDependencies ?? []),
  ];
  const warnings = [
    ...preview.warnings,
    ...preview.risks,
    ...(!preview.files.buildManifest ? ["capability-build.json is missing; repair should restore builder provenance before validation/registration."] : []),
    ...(dependencyNames.length ? [`Package dependencies may need an explicit dependency preview before repair validation: ${dependencyNames.join(", ")}.`] : []),
    ...(artifactOutputTypes.length && !sourceInventory.packageFiles.includes("tests/smoke.test.mjs")
      ? ["Artifact outputs are declared but tests/smoke.test.mjs is missing; repair must add a primary-command smoke test that creates a declared artifact."]
      : []),
  ];
  const errors = [...preview.errors];
  const ttsProviderConversion = needsTtsProviderRepairConversion(preview, buildManifest, input.requestedRepair);
  const installerRecoveryGuidance = capabilityBuilderInstallerRecoveryGuidance();
  const installerRecoveryTemplates = capabilityBuilderInstallerRecoveryTemplates();
  return {
    packageName: preview.packageName,
    rootPath: preview.rootPath,
    relativeRootPath: preview.relativeRootPath,
    ...(preview.gitSha ? { gitSha: preview.gitSha } : {}),
    ...(input.requestedRepair ? { requestedRepair: input.requestedRepair } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    preview,
    ...(buildManifest ? { buildManifest } : {}),
    sourceInventory,
    diagnosticEvidence,
    recommendedSteps: [
      "Treat this as repair planning only; do not edit files, install dependencies, validate, register, unregister, or remove package state during this step.",
      errors.length
        ? `Repair static preview errors first: ${errors.join("; ")}.`
        : "Preserve the currently valid static descriptor shape while addressing the requested repair.",
      ...(ttsProviderConversion
        ? [
          "Convert the package into the Ambient tts-provider installer shape instead of leaving it as a one-off audio artifact generator.",
          "Update ambient-cli.json so the primary synthesis command declares voiceProvider metadata with label, formats, defaultFormat, voices, and local/cloud behavior aligned with the wrapper.",
          "Update the wrapper to implement the normalized provider contract: accept --text, --output, --format, and optional --voice; write audio to the exact requested output path; print concise JSON metadata only.",
          "Keep or add artifact declarations for the supported audio formats so validation can prove a real audio artifact was produced.",
        ]
        : []),
      input.requestedRepair
        ? `Plan the smallest file changes needed for the requested repair: ${input.requestedRepair}`
        : "Ask the user for the concrete repair goal if the preview findings are not sufficient.",
      "Align ambient-cli.json, SKILL.md, wrapper scripts, health checks, smoke tests, artifact declarations, and env requirements so Pi guidance and executable behavior agree.",
      "Keep descriptor command and healthCheck executables portable: use bare names like `node`, `uv`, or `python`, or package-relative executables; do not repair runtime PATH issues by writing absolute host paths such as `/usr/local/bin/node` into ambient-cli.json.",
      requiredEnvNames.length
        ? `Preserve required env declarations (${requiredEnvNames.join(", ")}) and treat missing-secret failures as setup/secret-binding blockers, not reasons to ask for secrets in chat or remove env checks.`
        : "If the repaired package adds cloud/API behavior, declare required env names and exact networkHosts before validation.",
      artifactOutputTypes.length
        ? `Ensure tests/smoke.test.mjs runs the primary command on tiny input and writes at least one declared artifact: ${artifactOutputTypes.join(", ")}.`
        : "Add or update smoke tests for the repaired primary command path.",
      "If dependency changes are needed, list exact executable, args, cwd, and rationale; for Python dependencies, default to a package-local .venv via `uv venv --python <version> .venv` plus `uv pip install --python .venv/bin/python ...`, or `.venv/bin/python -m pip install ...`; wait for explicit approval before ambient_capability_builder_install_deps.",
      diagnosticEvidence.recommendedReads.length
        ? `Before proposing another edit, inspect the preserved evidence with file_read: ${diagnosticEvidence.recommendedReads.join("; ")}.`
        : "If validation or dependency logs exist after the next attempt, inspect them with file_read before proposing another edit.",
      "Run ambient_capability_builder_preview after approved edits, then ambient_capability_builder_validate after user approval.",
      "Register or re-register only after validation succeeds and the user approves making the repaired capability searchable/describable through Ambient CLI.",
      "Live-test from a fresh Pi turn with ambient_cli_search, ambient_cli_describe, and the mediated ambient_cli command path.",
    ],
    installerRecoveryGuidance,
    installerRecoveryTemplates,
    approvalCheckpoints: [
      "User approves the repair plan before any file edits.",
      "User approves exact dependency/setup commands, including the target environment for any Python package install, before ambient_capability_builder_install_deps runs.",
      "User approves validation before ambient_capability_builder_validate runs.",
      "User approves registration or re-registration before installed Ambient CLI package state changes.",
      "User separately approves any destructive cleanup, env/secret binding change, external network/API use, or artifact deletion.",
      requiredEnvNames.length
        ? "For missing required cloud/API secrets on Builder-managed source, use Ambient-managed secret flows only: ambient_capability_builder_secret_request for Desktop-owned entry or an approved Builder-scoped env binding; never paste or reveal secret values in chat."
        : "If repair diagnosis reaches a system path, protected directory, service install, driver, or privileged package-manager boundary, stop and call ambient_privileged_action_request with a typed template instead of asking the user to copy sudo/admin commands.",
      "If the same failure class recurs after one repair attempt, stop and reclassify using validation logs and path discovery outputs before applying another code edit.",
      "If a local install needs paths, prefer provider-local assets, documented env/config/CLI path controls, workspace-local shims/caches, then approved dependency plans before considering privileged system mutation.",
    ].filter((step): step is string => Boolean(step)),
    validationPlan: [
      "Run ambient_capability_builder_preview and confirm static errors are resolved.",
      ...(ttsProviderConversion
        ? [
          "Confirm preview reports installerShape tts-provider and at least one descriptor voice provider command before validation.",
          "Validation must include the providerContract command so registration cannot succeed on smoke-test output alone.",
        ]
        : []),
      artifactOutputTypes.length
        ? "Run ambient_capability_builder_validate with smoke tests enabled; validation must produce a declared artifact file."
        : "Run ambient_capability_builder_validate with health checks and smoke tests enabled.",
      requiredEnvNames.length
        ? `If validation fails only because required env is missing (${requiredEnvNames.join(", ")}), stop and route through Ambient-managed secret capture/binding before retrying; do not rewrite the package to bypass the check.`
        : undefined,
      "Inspect capability-validation-log.jsonl for command status, stderr/stdout previews, output lengths, and artifact records.",
      "Classify validation failures as missing binary, missing model/data asset, missing dynamic library, wrong architecture, unsupported platform, permission boundary, hardcoded path, package-manager/runtime mismatch, or stdout/file-artifact contract mismatch before proposing repair edits.",
      "After registration, verify discovery and use through ambient_cli_search, ambient_cli_describe, and ambient_cli.",
    ].filter((step): step is string => Boolean(step)),
    rollbackPlan: [
      `Record the current source Git SHA before repair edits: ${preview.gitSha ?? "unavailable"}.`,
      buildManifest?.installedPackageId
        ? `Keep installed package ${buildManifest.installedPackageId} active until the repaired source validates and is registered.`
        : "Do not unregister or replace any installed package until the repaired source validates.",
      "If repair validation fails, restore the prior source Git ref and preserve validation/dependency logs for diagnosis.",
      "Preserve generated artifacts, logs, env bindings, and secret metadata unless the user explicitly approves cleanup.",
    ],
    warnings,
    errors,
    mutationProhibited: true,
  };
}

export async function applyCapabilityBuilderRepair(
  workspacePath: string,
  input: CapabilityBuilderApplyRepairInput,
): Promise<CapabilityBuilderApplyRepairResult> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Repair reason is required.");
  if (!input.files.length) throw new Error("At least one approved repair file is required.");
  const workspace = resolve(workspacePath);
  const preview = await previewCapabilityBuilderPackage(workspace, input);
  const files = input.files.map((file, index) => normalizeRepairFile(preview.rootPath, file, index));
  const repairedAt = new Date().toISOString();
  const results: CapabilityBuilderApplyRepairFileResult[] = [];

  for (const file of files) {
    await mkdir(dirname(file.absolutePath), { recursive: true });
    const created = !existsSync(file.absolutePath);
    await writeFile(file.absolutePath, file.content, "utf8");
    results.push({
      path: file.path,
      sizeBytes: Buffer.byteLength(file.content, "utf8"),
      created,
      rationale: file.rationale,
    });
  }

  await updateRepairManifest(preview.rootPath, {
    packageName: preview.packageName,
    version: preview.descriptor?.version,
    repairedAt,
    reason,
  });
  const repairGitSha = await commitPackageGitRevision(preview.rootPath, "Apply approved repair");
  if (repairGitSha) {
    await updateRepairManifest(preview.rootPath, {
      packageName: preview.packageName,
      version: preview.descriptor?.version,
      repairedAt,
      reason,
      repairGitSha,
    });
    await commitPackageGitRevision(preview.rootPath, "Record repair metadata");
  }

  return {
    packageName: preview.packageName,
    rootPath: preview.rootPath,
    relativeRootPath: preview.relativeRootPath,
    gitSha: await currentGitSha(preview.rootPath),
    ...(repairGitSha ? { repairGitSha } : {}),
    repairedAt,
    reason,
    files: results,
    nextSteps: [
      "Run ambient_capability_builder_preview and confirm static errors are resolved.",
      "If dependency changes are needed, present exact commands and target environments; for Python package installs, prefer package-local .venv commands before asking for approval to run ambient_capability_builder_install_deps.",
      "Run ambient_capability_builder_validate after the preview is clean and the user approves validation.",
      "Register or re-register only after validation succeeds and the user approves installed Ambient CLI package state changes.",
      "Remember that the installed Ambient CLI copy remains stale until ambient_capability_builder_register completes after successful validation.",
      "Live-test from a fresh Pi turn with ambient_cli_search, ambient_cli_describe, and the mediated ambient_cli command path.",
    ],
  };
}

export async function installCapabilityBuilderDependencies(
  workspacePath: string,
  input: CapabilityBuilderInstallDepsInput,
): Promise<CapabilityBuilderInstallDepsResult> {
  if (!input.commands.length) throw new Error("At least one dependency command is required.");
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const workspace = resolve(workspacePath);
  const preview = await previewCapabilityBuilderPackage(workspace, input);
  if (!preview.valid) throw new Error(`Capability package preview has errors: ${preview.errors.join("; ")}`);
  const rootPath = preview.rootPath;
  const logPath = join(rootPath, "capability-deps-log.jsonl");
  const commands = input.commands.map((command) => normalizeDependencyCommand(rootPath, command));
  const results: CapabilityBuilderDependencyCommandResult[] = [];

  for (const command of commands) {
    const start = Date.now();
    let result: CapabilityBuilderDependencyCommandResult;
    try {
      const output = await execFileAsync(command.command, command.args, {
        cwd: command.resolvedCwd,
        timeout: dependencyCommandTimeoutMs,
        maxBuffer: 2 * 1024 * 1024,
        env: ambientRuntimeEnv(),
      });
      result = dependencyCommandResult(command, "succeeded", Date.now() - start, output.stdout, output.stderr);
    } catch (error) {
      const execError = error as ExecFileException & { stdout?: string | Buffer; stderr?: string | Buffer };
      result = dependencyCommandResult(
        command,
        "failed",
        Date.now() - start,
        execError.stdout,
        execError.stderr,
        execError.code ?? undefined,
        execError.message,
      );
    }
    results.push(result);
    await appendFile(logPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...result })}\n`, "utf8");
    if (result.status === "failed") break;
  }
  const completedAtMs = Date.now();

  return {
    packageName: preview.packageName,
    rootPath,
    relativeRootPath: preview.relativeRootPath,
    gitSha: await currentGitSha(rootPath),
    succeeded: results.every((result) => result.status === "succeeded"),
    startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: completedAtMs - startedAtMs,
    logPath,
    relativeLogPath: toManagedInstallRelative(workspace, logPath),
    commands: results,
  };
}

export async function validateCapabilityBuilderPackage(
  workspacePath: string,
  input: CapabilityBuilderValidateInput,
): Promise<CapabilityBuilderValidateResult> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const workspace = resolve(workspacePath);
  const preview = await previewCapabilityBuilderPackage(workspace, input);
  if (!preview.valid) throw new Error(`Capability package preview has errors: ${preview.errors.join("; ")}`);
  const rootPath = preview.rootPath;
  const envRequirements = preview.descriptor?.envRequirements ?? [];
  const networkHosts = preview.descriptor?.networkHosts ?? [];
  const artifactOutputTypes = preview.descriptor?.artifactOutputTypes ?? [];
  const smokeTestPath = join(rootPath, "tests", "smoke.test.mjs");
  if (artifactOutputTypes.length && input.includeSmokeTests === false) {
    throw new Error("Artifact-generating capability packages must run smoke tests during validation.");
  }
  if (artifactOutputTypes.length && !existsSync(smokeTestPath)) {
    throw new Error("Artifact-generating capability packages must include tests/smoke.test.mjs that exercises the primary command and writes a declared artifact.");
  }
  const beforeFiles = await listPackageFileMetadata(rootPath);
  const commands = await capabilityBuilderValidationCommands(workspace, rootPath, input);
  if (!commands.length) throw new Error("No validation commands are available. Add descriptor healthCheck entries or a tests/smoke.test.mjs file.");
  const logPath = join(rootPath, "capability-validation-log.jsonl");
  const results: CapabilityBuilderValidateResult["commands"] = [];
  const validationEnv = await capabilityBuilderValidationProcessEnv(workspace, preview);

  for (const command of commands) {
    const start = Date.now();
    let result: CapabilityBuilderDependencyCommandResult;
    try {
      const output = await execFileAsync(command.command, command.args ?? [], {
        cwd: command.resolvedCwd,
        timeout: validationCommandTimeoutMs,
        maxBuffer: 2 * 1024 * 1024,
        env: validationEnv,
      });
      result = dependencyCommandResult({ ...command, args: command.args ?? [] }, "succeeded", Date.now() - start, output.stdout, output.stderr);
      if (command.source === "providerContract") {
        const providerContractError = await validateProviderContractCommandOutput(workspace, command, output.stdout);
        if (providerContractError) {
          result = {
            ...dependencyCommandResult(
              { ...command, args: command.args ?? [] },
              "failed",
              Date.now() - start,
              output.stdout,
              output.stderr,
              "provider-contract-invalid",
              providerContractError,
            ),
          };
        }
      }
    } catch (error) {
      const execError = error as ExecFileException & { stdout?: string | Buffer; stderr?: string | Buffer };
      result = dependencyCommandResult(
        { ...command, args: command.args ?? [] },
        "failed",
        Date.now() - start,
        execError.stdout,
        execError.stderr,
        execError.code ?? undefined,
        execError.message,
      );
    }
    const validationResult = { ...result, source: command.source, ...(command.commandName ? { commandName: command.commandName } : {}) };
    results.push(validationResult);
    await appendFile(logPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...validationResult })}\n`, "utf8");
    if (result.status === "failed") break;
  }

  const afterFiles = await listPackageFileMetadata(rootPath);
  const artifacts = validationArtifactFiles(beforeFiles, afterFiles, artifactOutputTypes);
  if (results.every((result) => result.status === "succeeded") && artifactOutputTypes.length && !artifacts.length) {
    const existingCandidates = existingDeclaredArtifactCandidates(beforeFiles, afterFiles, artifactOutputTypes);
    const artifactError = missingDeclaredArtifactError(preview, artifactOutputTypes, existingCandidates);
    const artifactResult = {
      ...dependencyCommandResult(
        {
          command: "ambient-artifact-check",
          args: [],
          cwd: ".",
          rationale: `Verify validation produced at least one declared artifact: ${artifactOutputTypes.join(", ")}.`,
        },
        "failed",
        0,
        "",
        "",
        "artifact-missing",
        artifactError,
      ),
      source: "smokeTest" as const,
    };
    results.push(artifactResult);
    await appendFile(logPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...artifactResult })}\n`, "utf8");
  }
  const succeeded = results.every((result) => result.status === "succeeded");
  const validatedAt = succeeded ? new Date().toISOString() : undefined;
  const providerContractCommands = results.filter((result) => result.source === "providerContract");
  const providerContractValidated = providerContractCommands.length > 0 && providerContractCommands.every((result) => result.status === "succeeded");
  if (validatedAt) {
    await updateValidationManifest(rootPath, validatedAt, await packageContentHash(rootPath), {
      providerContractValidated,
      logPath: toManagedInstallRelative(workspace, logPath),
      artifacts,
    });
  }
  const completedAtMs = Date.now();

  return {
    packageName: preview.packageName,
    rootPath,
    relativeRootPath: preview.relativeRootPath,
    gitSha: await currentGitSha(rootPath),
    succeeded,
    ...(validatedAt ? { validatedAt } : {}),
    startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: completedAtMs - startedAtMs,
    logPath,
    relativeLogPath: toManagedInstallRelative(workspace, logPath),
    envRequirements,
    networkHosts,
    commands: results,
    artifacts,
  };
}

export async function saveCapabilityBuilderEnvSecret(
  workspacePath: string,
  input: CapabilityBuilderSecretSaveInput,
): Promise<CapabilityBuilderSecretSaveResult> {
  const workspace = resolve(workspacePath);
  const preview = await previewCapabilityBuilderPackage(workspace, input);
  const envName = normalizeCapabilityEnvName(input.envName);
  const requirement = preview.descriptor?.envRequirements.find((env) => env.name === envName);
  if (!requirement) throw new Error(`Capability Builder package "${preview.packageName}" does not declare env requirement "${envName}".`);
  const value = input.value.trim();
  if (!value) throw new Error("Capability Builder secret value is empty.");
  const secretRef = await saveSecretReference({
    scope: "capability-builder",
    workspacePath: workspace,
    ownerId: `${preview.packageName}\0${preview.relativeRootPath}`,
    envName,
    value,
  });
  await setCapabilityBuilderSecretBinding(workspace, preview, envName, secretRef);
  return {
    packageName: preview.packageName,
    rootPath: preview.rootPath,
    relativeRootPath: preview.relativeRootPath,
    sourcePath: preview.relativeRootPath,
    envName,
    source: "managed-secret",
    secretRef,
    configured: true,
  };
}

export async function registerCapabilityBuilderPackage(
  workspacePath: string,
  input: CapabilityBuilderRegisterInput,
): Promise<CapabilityBuilderRegisterResult> {
  const workspace = resolve(workspacePath);
  const managedWorkspace = await ensureCapabilityBuilderManagedWorkspace(workspace);
  const preview = await previewCapabilityBuilderPackage(workspace, input);
  if (!preview.valid) throw new Error(`Capability package preview has errors: ${preview.errors.join("; ")}`);
  const manifest = await readBuildManifest(preview.rootPath);
  const manifestStatus = stringField(manifest.status);
  if (manifestStatus !== "validated" && manifestStatus !== "unregistered") {
    throw new Error("Capability package must be validated before registration.");
  }
  const refs = recordField(manifest.refs);
  if (installerShapeFromManifest(manifest) === "tts-provider" && !stringField(refs.voiceProviderContractValidatedAt)) {
    throw new Error("TTS provider packages must pass provider-contract synthesis validation before registration.");
  }
  const validatedHash = stringField(refs.lastValidatedHash);
  if (!validatedHash) throw new Error("Capability package validation metadata is missing lastValidatedHash.");
  const currentHash = await packageContentHash(preview.rootPath);
  if (currentHash !== validatedHash) throw new Error("Capability package has changed since validation. Re-run validation before registration.");
  const sourceRef = capabilityBuilderSourceRef(managedWorkspace, preview.rootPath, preview.packageName);
  const validationEvidence = validationEvidenceFromManifest(manifest);
  await copyBuilderEnvBindingsToInstalledPackage(workspace, preview);
  const installedPackage = await installAmbientCliPackageSource(workspace, { source: preview.relativeRootPath });
  const registeredVoiceProvider = installerShapeFromManifest(manifest) === "tts-provider"
    ? await requireRegisteredVoiceProvider(workspace, installedPackage)
    : undefined;
  const registeredAt = new Date().toISOString();
  await updateRegistrationManifest(preview.rootPath, {
    registeredAt,
    installedPackageId: installedPackage.id,
    installedSource: installedPackage.source,
    installedVersion: installedPackage.version,
    gitSha: await currentGitSha(preview.rootPath),
    sourcePath: preview.relativeRootPath,
  });
  await updateRegistrationManifest(installedPackage.rootPath, {
    registeredAt,
    installedPackageId: installedPackage.id,
    installedSource: installedPackage.source,
    installedVersion: installedPackage.version,
    gitSha: await currentGitSha(preview.rootPath),
    sourcePath: preview.relativeRootPath,
  });
  return {
    packageName: preview.packageName,
    rootPath: preview.rootPath,
    relativeRootPath: preview.relativeRootPath,
    gitSha: await currentGitSha(preview.rootPath),
    sourceRef,
    validationEvidence,
    registeredAt,
    installedPackage,
    ...(registeredVoiceProvider ? { voiceProvider: registeredVoiceProvider } : {}),
  };
}

async function copyBuilderEnvBindingsToInstalledPackage(
  workspace: string,
  preview: CapabilityBuilderPreviewResult,
): Promise<void> {
  const bindings = await readCapabilityBuilderEnvBindings(workspace, preview);
  for (const requirement of preview.descriptor?.envRequirements ?? []) {
    const binding = bindings[requirement.name];
    if (!binding) continue;
    if (binding.source === "managed-secret") {
      await setAmbientCliPackageSecretBinding(workspace, {
        packageName: preview.packageName,
        envName: requirement.name,
        secretRef: binding.secretRef,
      });
    } else {
      await setAmbientCliPackageEnvBinding(workspace, {
        packageName: preview.packageName,
        envName: requirement.name,
        filePath: binding.filePath,
      });
    }
  }
}

async function requireRegisteredVoiceProvider(
  workspace: string,
  installedPackage: AmbientCliPackageSummary,
): Promise<CapabilityBuilderRegisteredVoiceProvider> {
  const providers = await discoverAmbientCliVoiceProviders(workspace);
  const matches = providers.filter((provider) => provider.packageId === installedPackage.id);
  if (!matches.length) {
    throw new Error(`Registered TTS provider package ${installedPackage.name} did not appear in Ambient voice provider discovery.`);
  }
  const available = matches.find((provider) => provider.available);
  const provider = available ?? matches[0];
  if (!provider.available) {
    throw new Error(`Registered TTS provider ${provider.label} is not available: ${provider.availabilityReason}`);
  }
  return summarizeRegisteredVoiceProvider(provider);
}

function summarizeRegisteredVoiceProvider(provider: VoiceProviderCandidate): CapabilityBuilderRegisteredVoiceProvider {
  return {
    capabilityId: provider.capabilityId,
    label: provider.label,
    command: provider.command,
    format: provider.format,
    formats: provider.formats,
    voices: provider.voices,
    ...(provider.voiceDiscovery ? { voiceDiscovery: provider.voiceDiscovery } : {}),
    ...(provider.voiceCloning ? { voiceCloning: provider.voiceCloning } : {}),
    available: provider.available,
    availabilityReason: provider.availabilityReason,
    healthStatus: provider.diagnostics?.healthStatus ?? "unknown",
  };
}

export async function unregisterCapabilityBuilderPackage(
  workspacePath: string,
  input: CapabilityBuilderUnregisterInput,
): Promise<CapabilityBuilderUnregisterResult> {
  if (input.preserveBuilderSource === false) {
    throw new Error("Capability Builder unregister preserves builder source. Use a future explicit deletion tool for source removal.");
  }
  const workspace = resolve(workspacePath);
  const removalPlan = await planCapabilityBuilderRemoval(workspace, input);
  if (removalPlan.errors.length) throw new Error(`Capability removal plan has errors: ${removalPlan.errors.join("; ")}`);
  const catalog = await discoverAmbientCliPackages(workspace);
  const removedPackage = selectGeneratedInstalledPackage(catalog.packages, {
    packageId: removalPlan.installedPackageId,
    packageName: removalPlan.packageName,
    installedSource: removalPlan.installedSource,
  });
  await uninstallAmbientCliPackageSource(workspace, { packageId: removedPackage.id });
  const unregisteredAt = new Date().toISOString();
  if (removalPlan.sourceExists) {
    await updateUnregistrationManifest(removalPlan.rootPath, {
      unregisteredAt,
      removedPackageId: removedPackage.id,
      removedSource: removedPackage.source,
      gitSha: await currentGitSha(removalPlan.rootPath),
    });
  }
  return {
    packageName: removalPlan.packageName,
    rootPath: removalPlan.rootPath,
    relativeRootPath: removalPlan.relativeRootPath,
    ...(await currentGitSha(removalPlan.rootPath) ? { gitSha: await currentGitSha(removalPlan.rootPath) } : {}),
    unregisteredAt,
    removedPackage,
    catalog: await discoverAmbientCliPackages(workspace),
    removalPlan,
    preserved: {
      builderSource: true,
      logs: true,
      artifacts: true,
      envSecrets: true,
    },
  };
}

export function capabilityBuilderScaffoldText(result: CapabilityBuilderScaffoldResult): string {
  return [
    "Ambient Capability Builder scaffold created",
    `Package: ${result.name}`,
    result.installerShape ? `Installer shape: ${result.installerShape}` : undefined,
    `Path: ${result.relativeRootPath}`,
    `Canonical sourcePath: ${result.sourceRef.sourcePath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    "",
    "Files:",
    ...result.files.map((file) => `- ${file}`),
    "- capability-build.json",
    "",
    "Next: use ambient_capability_builder_read_file, ambient_capability_builder_write_file, and ambient_capability_builder_list_files to inspect or edit this Builder-managed source, then run preview before dependency installation or registration.",
    "Python setup guidance: default to a package-local .venv, for example `uv venv --python <version> .venv` followed by `uv pip install --python .venv/bin/python ...`, or `.venv/bin/python -m pip install ...`; avoid bare/global pip unless the user explicitly approves that risk.",
    `Use this exact sourcePath in later Capability Builder tools: ${result.sourceRef.sourcePath}`,
    "Invariant: this is Builder-managed source. It is not installed until validation succeeds and ambient_capability_builder_register runs.",
    "Do not pass this sourcePath to generic workspace file tools; use Capability Builder tools for Builder-managed source.",
  ].filter(Boolean).join("\n");
}

export function capabilityBuilderHistoryText(result: CapabilityBuilderHistoryResult): string {
  return [
    "Ambient Capability Builder history",
    `Root: ${result.relativeRootPath}`,
    `Packages: ${result.entries.length}`,
    "",
    result.entries.length
      ? result.entries.flatMap((entry, index) => {
        const validationArtifacts = entry.validationArtifacts ?? [];
        return [
          `${index + 1}. ${entry.packageName}`,
          `   status: ${entry.status}; valid: ${entry.valid ? "yes" : "no"}; installed present: ${entry.installedPresent ? "yes" : "no"}`,
          `   path: ${entry.relativeRootPath}`,
          `   sourcePath: ${entry.relativeRootPath}`,
          `   git: ${entry.gitSha ?? "unavailable"}`,
          entry.goal ? `   goal: ${entry.goal}` : undefined,
          entry.installerShape ? `   installer shape: ${entry.installerShape}` : undefined,
          entry.provider ? `   provider/runtime: ${entry.provider}` : undefined,
          `   commands: ${entry.commandNames.length ? entry.commandNames.join(", ") : "none"}`,
          `   artifacts: ${entry.artifactOutputTypes.length ? entry.artifactOutputTypes.join(", ") : "none declared"}`,
          entry.installedPackageId ? `   installed package id: ${entry.installedPackageId}` : undefined,
          entry.refs.lastRepair ? `   repair ref: ${entry.refs.lastRepair}` : undefined,
          entry.refs.lastValidated ? `   validated ref: ${entry.refs.lastValidated}` : undefined,
          entry.validationLogPath ? `   validation log: ${entry.validationLogPath}` : undefined,
          validationArtifacts.length ? `   validation artifacts: ${validationArtifacts.map((artifact) => artifact.path).join(", ")}` : undefined,
          entry.refs.installed ? `   installed ref: ${entry.refs.installed}` : undefined,
          entry.unregisteredAt ? `   unregistered at: ${entry.unregisteredAt}` : undefined,
          entry.logFiles.length ? `   logs: ${entry.logFiles.join(", ")}` : undefined,
          entry.possibleArtifactFiles.length ? `   possible artifacts: ${entry.possibleArtifactFiles.join(", ")}` : undefined,
          entry.errors.length ? `   errors: ${entry.errors.join("; ")}` : undefined,
          entry.warnings.length ? `   warnings: ${entry.warnings.join("; ")}` : undefined,
        ].filter((line): line is string => Boolean(line));
      })
      : ["- no managed capability builder packages found"],
    result.errors.length ? ["", "Discovery errors:", ...result.errors.map((error) => `- ${error}`)].join("\n") : undefined,
    "",
    "Next: use ambient_capability_builder_preview, ambient_capability_builder_update_plan, ambient_capability_builder_removal_plan, validate, register, or unregister against the preserved builder source path/package as appropriate.",
    "Reminder: use Capability Builder tools for Builder-managed sources; avoid generic Ambient CLI install/uninstall unless the user explicitly asks for generic package operations.",
  ].flat().filter(Boolean).join("\n");
}

export function capabilityBuilderRegisterText(result: CapabilityBuilderRegisterResult): string {
  return [
    "Ambient Capability Builder registration",
    `Package: ${result.packageName}`,
    `Path: ${result.relativeRootPath}`,
    `Canonical sourcePath: ${result.relativeRootPath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    `Registered at: ${result.registeredAt}`,
    "",
    "Validation evidence:",
    `- source path: ${result.sourceRef.sourcePath}`,
    `- validated ref: ${result.validationEvidence.sourceGitSha ?? "unavailable"}`,
    `- source hash: ${result.validationEvidence.sourceHash ?? "unavailable"}`,
    result.validationEvidence.validatedAt ? `- validated at: ${result.validationEvidence.validatedAt}` : undefined,
    result.validationEvidence.logPath ? `- log: ${result.validationEvidence.logPath}` : undefined,
    result.validationEvidence.artifacts.length
      ? `- artifacts: ${result.validationEvidence.artifacts.map((artifact) => `${artifact.path} (${artifact.sizeBytes} bytes)`).join(", ")}`
      : "- artifacts: none recorded",
    "",
    "Installed Ambient CLI package:",
    `- id: ${result.installedPackage.id}`,
    `- name: ${result.installedPackage.name}`,
    `- source: ${result.installedPackage.source}`,
    `- commands: ${result.installedPackage.commands.map((command) => command.name).join(", ") || "none"}`,
    `- skills: ${result.installedPackage.skills.map((skill) => skill.name).join(", ") || "none"}`,
    result.voiceProvider
      ? [
        "",
        "Registered voice provider:",
        `- label: ${result.voiceProvider.label}`,
        `- capability id: ${result.voiceProvider.capabilityId}`,
        `- command: ${result.voiceProvider.command}`,
        `- formats: ${result.voiceProvider.formats.join(", ")}`,
        `- voices: ${result.voiceProvider.voices.map((voice) => voice.label ? `${voice.id} (${voice.label})` : voice.id).join(", ") || "none"}`,
        `- voice discovery: ${result.voiceProvider.voiceDiscovery ? formatVoiceDiscovery(result.voiceProvider.voiceDiscovery) : "none"}`,
        `- voice cloning: ${result.voiceProvider.voiceCloning ? formatVoiceCloning(result.voiceProvider.voiceCloning) : "none"}`,
        `- health: ${result.voiceProvider.healthStatus}`,
        `- availability: ${result.voiceProvider.available ? "available" : "unavailable"} - ${result.voiceProvider.availabilityReason}`,
      ].join("\n")
      : undefined,
    "",
    "Installed-copy note: future edits to the Builder-managed source will not update this installed copy until validation succeeds and ambient_capability_builder_register runs again.",
    result.voiceProvider
      ? "Next: refresh Settings/voice provider state, select this provider if desired, then synthesize a real assistant reply through Ambient voice runtime."
      : "Next: start a fresh Pi turn and use ambient_cli_search, then ambient_cli_describe, then ambient_cli to live-test the installed capability.",
    "For text-heavy commands, preserve exact user text; prefer file-input flags when CLI args risk changing punctuation, quotes, whitespace, or long text.",
    "For artifact-generating commands, write final user artifacts to user-visible workspace paths when possible.",
  ].filter(Boolean).join("\n");
}

export function capabilityBuilderUnregisterText(result: CapabilityBuilderUnregisterResult): string {
  return [
    "Ambient Capability Builder unregister",
    `Package: ${result.packageName}`,
    `Builder source: ${result.relativeRootPath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    `Unregistered at: ${result.unregisteredAt}`,
    "",
    "Removed installed Ambient CLI package:",
    `- id: ${result.removedPackage.id}`,
    `- name: ${result.removedPackage.name}`,
    `- source: ${result.removedPackage.source}`,
    "",
    "Preserved by default:",
    `- builder source: ${result.preserved.builderSource ? "yes" : "no"}`,
    `- logs: ${result.preserved.logs ? "yes" : "no"}`,
    `- artifacts: ${result.preserved.artifacts ? "yes" : "no"}`,
    `- env/secret metadata: ${result.preserved.envSecrets ? "yes" : "no"}`,
    "",
    `Remaining installed Ambient CLI packages: ${result.catalog.packages.length}`,
    "Next: refresh Pi capability search/describe state. The managed builder source can be re-validated and registered again if rollback is needed.",
    "Rollback note: use ambient_capability_builder_register on the preserved source after validation; do not reinstall the preserved Builder-managed source with generic Ambient CLI package install unless the user explicitly requests generic package operations.",
  ].join("\n");
}

export function capabilityBuilderValidateText(result: CapabilityBuilderValidateResult): string {
  const runtimeGuidance = capabilityBuilderDependencyRuntimeGuidance(result.commands);
  const requiredEnvNames = requiredEnvRequirementNames(result.envRequirements);
  const missingEnvNames = missingEnvNamesFromValidation(result.commands, requiredEnvNames);
  return [
    "Ambient Capability Builder validation",
    `Package: ${result.packageName}`,
    `Path: ${result.relativeRootPath}`,
    `Canonical sourcePath: ${result.relativeRootPath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    `Status: ${result.succeeded ? "succeeded" : "failed"}`,
    result.validatedAt ? `Validated at: ${result.validatedAt}` : undefined,
    `Started: ${result.startedAt}`,
    `Completed: ${result.completedAt}`,
    `Total duration: ${formatDurationMs(result.durationMs)}`,
    `Log: ${result.relativeLogPath}`,
    "Log policy: stdout/stderr are shown as bounded previews below; the log records actual output lengths and truncation flags.",
    requiredEnvNames.length ? `Required env: ${requiredEnvNames.join(", ")}` : undefined,
    result.networkHosts.length ? `Network hosts: ${result.networkHosts.join(", ")}` : undefined,
    missingEnvNames.length
      ? `Missing secret/env blocker: validation output references missing required env ${missingEnvNames.join(", ")}. Use ambient_capability_builder_secret_request for Desktop-owned entry or an approved Builder-scoped env binding, then retry; never ask the user to paste secret values into chat.`
      : undefined,
    "",
    "Runtime guidance:",
    ...runtimeGuidance.map((note) => `- ${note}`),
    "",
    "Commands:",
    ...result.commands.flatMap((command, index) => [
      `${index + 1}. ${formatCommand(command.command, command.args)}`,
      `   source: ${command.source}${command.commandName ? ` (${command.commandName})` : ""}`,
      `   cwd: ${command.cwd}`,
      `   rationale: ${command.rationale}`,
      `   status: ${command.status}${command.exitCode !== undefined ? ` (exit ${command.exitCode})` : ""}, ${formatDurationMs(command.durationMs)}`,
      `   stdout: ${formatOutputPreview(command.stdoutPreview, command.stdoutLength, command.stdoutTruncated)}`,
      `   stderr: ${formatOutputPreview(command.stderrPreview, command.stderrLength, command.stderrTruncated)}`,
      command.error ? `   error: ${command.error}` : undefined,
    ].filter((line): line is string => Boolean(line))),
    "",
    "Artifacts:",
    ...(result.artifacts.length ? result.artifacts.map((artifact) => `- ${artifact.path} (${artifact.sizeBytes} bytes)`) : ["- none detected"]),
    "",
    result.succeeded
      ? "Next: register with ambient_capability_builder_register before installed live testing. Do not use generic Ambient CLI package install for this Builder-managed source."
      : missingEnvNames.length
        ? "Next: stop. Do not register, re-register, reinstall, or activate this package. Resolve the missing required env through ambient_capability_builder_secret_request or approved Builder-scoped env binding, then retry validation/use without exposing the secret value."
        : "Next: stop. Do not register, re-register, reinstall, or activate this package. Repair the Builder-managed source, run preview if package shape changed, then validate again.",
  ].filter(Boolean).join("\n");
}

function requiredEnvRequirementNames(envRequirements: CapabilityBuilderEnvRequirement[]): string[] {
  return envRequirements.filter((env) => env.required).map((env) => env.name);
}

function missingEnvNamesFromValidation(
  commands: CapabilityBuilderValidateResult["commands"],
  requiredEnvNames: string[],
): string[] {
  if (!requiredEnvNames.length) return [];
  const failedOutput = commands
    .filter((command) => command.status === "failed")
    .map((command) => `${command.stdoutPreview}\n${command.stderrPreview}\n${command.error ?? ""}`)
    .join("\n");
  if (!/\b(missing|required|not configured|not set|env|environment|secret|api key)\b/i.test(failedOutput)) return [];
  return requiredEnvNames.filter((name) => failedOutput.includes(name));
}

async function capabilityBuilderValidationProcessEnv(
  workspace: string,
  preview: CapabilityBuilderPreviewResult,
): Promise<NodeJS.ProcessEnv> {
  const env = ambientRuntimeEnv();
  const bindings = await readCapabilityBuilderEnvBindings(workspace, preview);
  for (const requirement of preview.descriptor?.envRequirements ?? []) {
    const binding = bindings[requirement.name];
    if (!binding) continue;
    const value = binding.source === "managed-secret"
      ? (await readSecretReference(binding.secretRef))?.trim()
      : await readCapabilityBuilderEnvFile(workspace, requirement.name, binding.filePath);
    if (value) env[requirement.name] = value;
  }
  return env;
}

async function setCapabilityBuilderEnvBinding(
  workspace: string,
  preview: Pick<CapabilityBuilderPreviewResult, "packageName" | "relativeRootPath">,
  envName: string,
  filePath: string,
): Promise<void> {
  const bindingsPath = capabilityBuilderEnvBindingsPath(workspace);
  const existing = await readCapabilityBuilderEnvBindingRows(workspace);
  const rows = [
    ...existing.filter((binding) =>
      normalizeCapabilityEnvName(binding.envName) !== envName ||
      (binding.packageName !== preview.packageName && binding.sourcePath !== preview.relativeRootPath)
    ),
    { packageName: preview.packageName, sourcePath: preview.relativeRootPath, envName, filePath },
  ].sort((left, right) => left.packageName.localeCompare(right.packageName) || left.envName.localeCompare(right.envName));
  await mkdir(dirname(bindingsPath), { recursive: true });
  await writeFile(bindingsPath, `${JSON.stringify({ bindings: rows }, null, 2)}\n`, "utf8");
}

async function setCapabilityBuilderSecretBinding(
  workspace: string,
  preview: Pick<CapabilityBuilderPreviewResult, "packageName" | "relativeRootPath">,
  envName: string,
  secretRef: string,
): Promise<void> {
  if (!isSecretReference(secretRef)) throw new Error("Capability Builder secret reference is invalid.");
  const value = (await readSecretReference(secretRef))?.trim();
  if (!value) throw new Error("Capability Builder secret reference is empty or missing.");
  const bindingsPath = capabilityBuilderEnvBindingsPath(workspace);
  const existing = await readCapabilityBuilderEnvBindingRows(workspace);
  const rows = [
    ...existing.filter((binding) =>
      normalizeCapabilityEnvName(binding.envName) !== envName ||
      (binding.packageName !== preview.packageName && binding.sourcePath !== preview.relativeRootPath)
    ),
    { packageName: preview.packageName, sourcePath: preview.relativeRootPath, envName, secretRef },
  ].sort((left, right) => left.packageName.localeCompare(right.packageName) || left.envName.localeCompare(right.envName));
  await mkdir(dirname(bindingsPath), { recursive: true });
  await writeFile(bindingsPath, `${JSON.stringify({ bindings: rows }, null, 2)}\n`, "utf8");
}

async function readCapabilityBuilderEnvBindings(
  workspace: string,
  preview: Pick<CapabilityBuilderPreviewResult, "packageName" | "relativeRootPath">,
): Promise<Record<string, CapabilityBuilderEnvBindingResolution>> {
  const entries: Record<string, CapabilityBuilderEnvBindingResolution> = {};
  for (const binding of await readCapabilityBuilderEnvBindingRows(workspace)) {
    if (binding.packageName !== preview.packageName && binding.sourcePath !== preview.relativeRootPath) continue;
    const envName = normalizeCapabilityEnvName(binding.envName);
    if (binding.secretRef) entries[envName] = { source: "managed-secret", secretRef: binding.secretRef };
    else if (binding.filePath) entries[envName] = { source: "file", filePath: binding.filePath };
  }
  return entries;
}

type CapabilityBuilderEnvBindingResolution =
  | { source: "file"; filePath: string }
  | { source: "managed-secret"; secretRef: string };

type CapabilityBuilderEnvBindingRow = {
  packageName: string;
  sourcePath?: string;
  envName: string;
  filePath?: string;
  secretRef?: string;
};

async function readCapabilityBuilderEnvBindingRows(workspace: string): Promise<CapabilityBuilderEnvBindingRow[]> {
  const bindingsPath = capabilityBuilderEnvBindingsPath(workspace);
  if (!existsSync(bindingsPath)) return [];
  const errors: string[] = [];
  const parsed = parseJsonObject(await readFile(bindingsPath, "utf8"), "capability-builder env bindings", errors);
  if (!parsed || errors.length) return [];
  const rows = Array.isArray(parsed.bindings) ? parsed.bindings : [];
  const parsedRows = rows.flatMap((item) => {
    const record = recordField(item);
    const packageName = stringField(record.packageName);
    const envName = stringField(record.envName);
    const filePath = stringField(record.filePath);
    const secretRef = stringField(record.secretRef);
    if (!packageName || !envName || (!filePath && !secretRef)) return [];
    return [{
      packageName,
      ...(stringField(record.sourcePath) ? { sourcePath: stringField(record.sourcePath) } : {}),
      envName: normalizeCapabilityEnvName(envName),
      ...(filePath ? { filePath } : {}),
      ...(secretRef ? { secretRef } : {}),
    }];
  });
  const migrated = await migrateCapabilityBuilderLegacySecretBindings(workspace, parsedRows);
  if (migrated.changed) await writeFile(bindingsPath, `${JSON.stringify({ bindings: migrated.bindings }, null, 2)}\n`, "utf8");
  return migrated.bindings;
}

async function readCapabilityBuilderEnvFile(workspace: string, envName: string, filePath: string): Promise<string> {
  const absolutePath = resolve(workspace, filePath);
  if (!isPathInside(workspace, absolutePath)) throw new Error(`Capability Builder env file for ${envName} must stay inside the workspace.`);
  return (await readFile(absolutePath, "utf8")).trim();
}

async function migrateCapabilityBuilderLegacySecretBindings(
  workspace: string,
  bindings: CapabilityBuilderEnvBindingRow[],
): Promise<{ bindings: CapabilityBuilderEnvBindingRow[]; changed: boolean }> {
  let changed = false;
  const migrated: CapabilityBuilderEnvBindingRow[] = [];
  for (const binding of bindings) {
    if (!binding.filePath || binding.secretRef || !isLegacyCapabilityBuilderSecretBinding(workspace, binding.filePath)) {
      migrated.push(binding);
      continue;
    }
    try {
      const absolutePath = resolve(workspace, binding.filePath);
      const value = (await readFile(absolutePath, "utf8")).trim();
      if (!value) {
        migrated.push(binding);
        continue;
      }
      const envName = normalizeCapabilityEnvName(binding.envName);
      const secretRef = await saveSecretReference({
        scope: "capability-builder",
        workspacePath: workspace,
        ownerId: `${binding.packageName}\0${binding.sourcePath ?? ""}`,
        envName,
        value,
      });
      await rm(absolutePath, { force: true });
      migrated.push({ packageName: binding.packageName, ...(binding.sourcePath ? { sourcePath: binding.sourcePath } : {}), envName, secretRef });
      changed = true;
    } catch {
      migrated.push(binding);
    }
  }
  return { bindings: migrated, changed };
}

function isLegacyCapabilityBuilderSecretBinding(workspace: string, filePath: string): boolean {
  const absolutePath = resolve(workspace, filePath);
  const legacyRoot = resolve(workspace, ".ambient", "capability-builder", "secrets");
  return isPathInside(legacyRoot, absolutePath) && absolutePath.endsWith(".secret");
}

function capabilityBuilderEnvBindingsPath(workspace: string): string {
  return resolve(managedInstallWorkspacePath(workspace), ".ambient", "capability-builder", "env-bindings.json");
}

function normalizeCapabilityEnvName(value: string): string {
  const name = value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Invalid env name: ${value}`);
  return name;
}

export function capabilityBuilderInstallDepsText(result: CapabilityBuilderInstallDepsResult): string {
  const runtimeGuidance = capabilityBuilderDependencyRuntimeGuidance(result.commands);
  return [
    "Ambient Capability Builder dependency installation",
    `Package: ${result.packageName}`,
    `Path: ${result.relativeRootPath}`,
    `Canonical sourcePath: ${result.relativeRootPath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    `Status: ${result.succeeded ? "succeeded" : "failed"}`,
    `Started: ${result.startedAt}`,
    `Completed: ${result.completedAt}`,
    `Total duration: ${formatDurationMs(result.durationMs)}`,
    `Log: ${result.relativeLogPath}`,
    "Log policy: stdout/stderr are shown as bounded previews below; the log records actual output lengths and truncation flags.",
    "",
    "Runtime guidance:",
    ...runtimeGuidance.map((note) => `- ${note}`),
    "",
    "Commands:",
    ...result.commands.flatMap((command, index) => [
      `${index + 1}. ${formatCommand(command.command, command.args)}`,
      `   cwd: ${command.cwd}`,
      `   rationale: ${command.rationale}`,
      `   status: ${command.status}${command.exitCode !== undefined ? ` (exit ${command.exitCode})` : ""}, ${formatDurationMs(command.durationMs)}`,
      `   stdout: ${formatOutputPreview(command.stdoutPreview, command.stdoutLength, command.stdoutTruncated)}`,
      `   stderr: ${formatOutputPreview(command.stderrPreview, command.stderrLength, command.stderrTruncated)}`,
      command.error ? `   error: ${command.error}` : undefined,
    ].filter((line): line is string => Boolean(line))),
    "",
    result.succeeded
      ? "Next: run static preview again, then validate health checks and smoke behavior before registration."
      : "Next: fix the failed command or package shape before validation, registration, or activation. Do not register or reinstall the Builder-managed package after failed dependency setup.",
  ].join("\n");
}

export function capabilityBuilderInstallDepsOutputPreview(result: CapabilityBuilderInstallDepsResult): ToolLargeOutputPreview | undefined {
  const items = result.commands.flatMap((command, index): ToolLargeOutputPreviewItem[] => {
    const commandLabel = `command ${index + 1}`;
    return [
      {
        label: `${commandLabel} stdout`,
        chars: command.stdoutLength,
        previewChars: command.stdoutPreview.length,
        truncated: command.stdoutTruncated,
        artifactPath: result.relativeLogPath,
        suggestedTools: ["file_read"],
      },
      {
        label: `${commandLabel} stderr`,
        chars: command.stderrLength,
        previewChars: command.stderrPreview.length,
        truncated: command.stderrTruncated,
        artifactPath: result.relativeLogPath,
        suggestedTools: ["file_read"],
      },
    ].filter((item) => item.chars > 0 || item.previewChars > 0);
  });
  if (!items.length) return undefined;
  const stdoutChars = result.commands.reduce((sum, command) => sum + command.stdoutLength, 0);
  const stderrChars = result.commands.reduce((sum, command) => sum + command.stderrLength, 0);
  return {
    kind: "large-output",
    summary: [
      `${result.commands.length.toLocaleString()} ${result.commands.length === 1 ? "command" : "commands"}`,
      stdoutChars ? `stdout ${stdoutChars.toLocaleString()} chars` : undefined,
      stderrChars ? `stderr ${stderrChars.toLocaleString()} chars` : undefined,
      `log: ${result.relativeLogPath}`,
    ].filter(Boolean).join(" · "),
    items,
  };
}

export async function capabilityBuilderValidationPreviewText(workspacePath: string, input: CapabilityBuilderValidateInput): Promise<string> {
  const workspace = resolve(workspacePath);
  const preview = await previewCapabilityBuilderPackage(workspace, input);
  if (!preview.valid) throw new Error(`Capability package preview has errors: ${preview.errors.join("; ")}`);
  const commands = await capabilityBuilderValidationCommands(workspace, preview.rootPath, input);
  return [
    `Package: ${preview.packageName}`,
    `Managed root: ${preview.relativeRootPath}`,
    `Canonical sourcePath: ${preview.relativeRootPath}`,
    `Git SHA: ${preview.gitSha ?? "unavailable"}`,
    "Effect: runs the validation commands below without a shell and writes capability-validation-log.jsonl in the package root.",
    "No registration, activation, or installed Ambient CLI execution happens in this step.",
    "",
    "Commands:",
    ...commands.map((command, index) => [
      `${index + 1}. ${formatCommand(command.command, command.args ?? [])}`,
      `   source: ${command.source}${command.commandName ? ` (${command.commandName})` : ""}`,
      `   cwd: ${command.cwd}`,
      `   rationale: ${command.rationale}`,
    ].join("\n")),
  ].join("\n");
}

export function capabilityBuilderPreviewText(result: CapabilityBuilderPreviewResult): string {
  const descriptor = result.descriptor;
  return [
    "Ambient Capability Builder preview",
    `Package: ${result.packageName}`,
    `Path: ${result.relativeRootPath}`,
    `Canonical sourcePath: ${result.relativeRootPath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    `Status: ${result.valid ? "valid for static preview" : "blocked by static preview errors"}`,
    "",
    "Files:",
    `- ambient-cli.json: ${result.files.descriptor ? "present" : "missing"}`,
    `- SKILL.md: ${result.files.skill ? "present" : "missing"}`,
    `- capability-build.json: ${result.files.buildManifest ? "present" : "missing"}`,
    `- package.json: ${result.files.packageJson ? "present" : "absent"}`,
    descriptor
      ? [
        "",
        "Descriptor:",
        `- version: ${descriptor.version ?? "unspecified"}`,
        `- commands: ${descriptor.commandNames.length ? descriptor.commandNames.join(", ") : "none"}`,
        `- voice providers: ${descriptor.voiceProviderCommandNames.length ? descriptor.voiceProviderCommandNames.join(", ") : "none"}`,
        `- voice discovery: ${descriptor.voiceDiscoveryCommandNames.length ? descriptor.voiceDiscoveryCommandNames.join(", ") : "none"}`,
        `- voice cloning: ${descriptor.voiceCloningCommandNames.length ? descriptor.voiceCloningCommandNames.join(", ") : "none"}`,
        `- env: ${descriptor.envRequirements.length ? descriptor.envRequirements.map(formatEnvRequirement).join(", ") : "none"}`,
        `- network hosts: ${descriptor.networkHosts.length ? descriptor.networkHosts.join(", ") : "none"}`,
        `- model assets: ${descriptor.modelAssets.length ? descriptor.modelAssets.map(formatModelAsset).join(", ") : "none"}`,
        `- artifacts: ${descriptor.artifactOutputTypes.length ? descriptor.artifactOutputTypes.join(", ") : "none declared"}`,
        `- response formats: ${descriptor.responseFormats.length ? descriptor.responseFormats.join(", ") : "none declared"}`,
      ].join("\n")
      : undefined,
    result.packageJson
      ? [
        "",
        "Package dependencies:",
        `- dependencies: ${result.packageJson.dependencies.length ? result.packageJson.dependencies.join(", ") : "none"}`,
        `- devDependencies: ${result.packageJson.devDependencies.length ? result.packageJson.devDependencies.join(", ") : "none"}`,
        `- lifecycle scripts: ${result.packageJson.lifecycleScripts.length ? result.packageJson.lifecycleScripts.join(", ") : "none"}`,
      ].join("\n")
      : undefined,
    result.errors.length ? ["", "Errors:", ...result.errors.map((item) => `- ${item}`)].join("\n") : undefined,
    result.warnings.length ? ["", "Warnings:", ...result.warnings.map((item) => `- ${item}`)].join("\n") : undefined,
    result.risks.length ? ["", "Risks:", ...result.risks.map((item) => `- ${item}`)].join("\n") : undefined,
    "",
    result.valid
      ? `Next: review the findings with the user before dependency installation, validation, registration, or activation. Use this exact sourcePath in later Capability Builder tools: ${result.relativeRootPath}. Use Capability Builder file tools, not generic workspace file tools, to edit this source. For text commands, prefer file-input flags when exact text may be hard to pass as args; for artifact commands, ensure final outputs are user-visible workspace files.`
      : "Next: fix the preview errors before dependency installation, validation, registration, or activation. Use Capability Builder file tools, not generic workspace file tools, to edit this source. Do not register or reinstall a Builder-managed package with preview errors.",
  ].filter(Boolean).join("\n");
}

export function capabilityBuilderListFilesText(result: CapabilityBuilderListFilesResult): string {
  const inventoryArtifact = result.inventoryArtifact;
  return [
    "Ambient Capability Builder files",
    `Package: ${result.packageName}`,
    `Canonical sourcePath: ${result.sourceRef.sourcePath}`,
    result.pathPrefix ? `Path prefix: ${result.pathPrefix}` : "Path prefix: package root",
    `Generated content: ${result.includeGenerated ? "included for this scoped request" : "omitted by default"}`,
    `Depth limit: ${result.maxDepth}`,
    result.totalFileCountTruncated
      ? `Files shown: ${result.files.length}; matched at least ${result.totalFileCount} files`
      : `Files shown: ${result.files.length} of ${result.totalFileCount}`,
    `Page size: ${result.maxEntries}`,
    result.nextCursor ? `Next cursor: ${result.nextCursor}` : undefined,
    "",
    ...result.files.map((file) => `- ${file.path} (${file.sizeBytes} bytes)`),
    result.omittedDirectories.length ? "" : undefined,
    result.omittedDirectories.length ? `Omitted directory summaries shown: ${result.omittedDirectories.length} of ${result.omittedDirectoryCount}` : undefined,
    ...result.omittedDirectories.map((directory) => `- ${directory.path}/ (${directory.reason}; ${directory.fileCount}${directory.truncated ? "+" : ""} files; ${directory.totalBytes}${directory.truncated ? "+ scanned" : ""} bytes)`),
    result.nextCursor ? "" : undefined,
    result.nextCursor ? "For the next page, call this tool again with the same selector/filter fields and the next cursor." : undefined,
    result.includeGenerated ? undefined : "",
    result.includeGenerated
      ? undefined
      : "Generated/dependency directories are summarized, not listed. To inspect one, use includeGenerated=true with a narrow pathPrefix plus bounded maxEntries/maxDepth.",
    inventoryArtifact ? "" : undefined,
    inventoryArtifact ? "Inventory artifact:" : undefined,
    inventoryArtifact ? `- Filtered inventory saved at: ${inventoryArtifact.path}` : undefined,
    inventoryArtifact
      ? `- Captured ${inventoryArtifact.inventoryFileCount}${inventoryArtifact.inventoryFileCountTruncated ? "+" : ""} files; artifact ${inventoryArtifact.chars} chars${inventoryArtifact.bytes === undefined ? "" : `, ${inventoryArtifact.bytes} bytes`}.`
      : undefined,
    inventoryArtifact?.inventoryFileCountTruncated ? "- Inventory hit the artifact cap; narrow pathPrefix/maxDepth for exhaustive coverage." : undefined,
    inventoryArtifact?.redacted ? `- Sensitive values redacted: ${inventoryArtifact.redactionCount}` : undefined,
    inventoryArtifact
      ? `- Use file_read with ${JSON.stringify(inventoryArtifact.fileReadInput)} for exact inventory text.`
      : undefined,
    inventoryArtifact
      ? `- Use long_context_process with ${JSON.stringify(inventoryArtifact.longContextProcessInput)} for summarization, extraction, or QA over the filtered inventory.`
      : undefined,
    inventoryArtifact
      ? `Structured next step: ${JSON.stringify(capabilityBuilderListInventoryStructuredNextStep(inventoryArtifact))}`
      : undefined,
    "",
    "Use ambient_capability_builder_read_file for exact file contents and ambient_capability_builder_write_file for approved Builder-managed edits.",
  ].filter((line) => line !== undefined).join("\n");
}

export function capabilityBuilderListFilesOutputPreview(result: CapabilityBuilderListFilesResult): ToolLargeOutputPreview | undefined {
  const artifact = result.inventoryArtifact;
  if (!artifact) return undefined;
  const item: ToolLargeOutputPreviewItem = {
    label: `${result.packageName} filtered file inventory`,
    chars: artifact.chars,
    previewChars: artifact.previewChars,
    truncated: artifact.truncated || artifact.inventoryFileCountTruncated,
    artifactKind: "tool-output",
    artifactPath: artifact.path,
    ...(artifact.bytes === undefined ? {} : { artifactBytes: artifact.bytes }),
    suggestedTools: ["file_read", "long_context_process"],
  };
  return {
    kind: "large-output",
    summary: `Capability Builder filtered inventory artifact: ${artifact.path}`,
    items: [item],
  };
}

async function materializeCapabilityBuilderListInventoryArtifact(
  workspace: string,
  preview: Pick<CapabilityBuilderPreviewResult, "packageName" | "relativeRootPath" | "gitSha">,
  listing: CapabilityBuilderSourceListing,
): Promise<CapabilityBuilderListInventoryArtifact | undefined> {
  const output = await materializeTextOutput(workspace, {
    label: `capability-builder-${preview.packageName}-filtered-inventory`,
    text: capabilityBuilderListInventoryArtifactText(preview, listing),
    maxPreviewChars: builderListInventoryArtifactPreviewChars,
    extension: "txt",
    alwaysWriteArtifact: true,
  });
  if (!output.artifactPath) return undefined;
  return capabilityBuilderListInventoryArtifactFromOutput(preview, listing, { ...output, artifactPath: output.artifactPath });
}

function capabilityBuilderListInventoryArtifactFromOutput(
  preview: Pick<CapabilityBuilderPreviewResult, "packageName" | "relativeRootPath">,
  listing: CapabilityBuilderSourceListing,
  output: MaterializedTextOutput & { artifactPath: string },
): CapabilityBuilderListInventoryArtifact {
  const instruction = [
    `Analyze the filtered Ambient Capability Builder file inventory for ${preview.packageName}.`,
    `Treat ${preview.relativeRootPath} as Builder-managed source.`,
    "The inventory follows the same generated-content filter policy as ambient_capability_builder_list_files.",
    listing.includeGenerated
      ? "Generated/dependency content is included only for the explicit pathPrefix in this artifact."
      : "Generated/dependency directories are summarized but not recursively listed.",
    listing.nextCursor
      ? "The inventory reached its artifact cap; use a narrower pathPrefix before claiming exhaustive file coverage."
      : "Use the inventory for exhaustive file-name QA within this filtered scope.",
  ].join(" ");
  return {
    path: output.artifactPath,
    ...(output.artifactBytes === undefined ? {} : { bytes: output.artifactBytes }),
    chars: output.totalChars,
    previewChars: output.previewChars,
    truncated: output.truncated,
    redacted: output.redacted,
    redactionCount: output.redactionCount,
    inventoryFileCount: listing.files.length,
    inventoryFileCountTruncated: listing.totalFileCountTruncated,
    fileReadInput: { path: output.artifactPath },
    longContextProcessInput: {
      taskType: "analysis",
      instruction,
      workspacePaths: [output.artifactPath],
      maxModelCalls: 4,
    },
  };
}

function capabilityBuilderListInventoryArtifactText(
  preview: Pick<CapabilityBuilderPreviewResult, "packageName" | "relativeRootPath" | "gitSha">,
  listing: CapabilityBuilderSourceListing,
): string {
  return [
    "Ambient Capability Builder filtered file inventory",
    `Package: ${preview.packageName}`,
    `Canonical sourcePath: ${preview.relativeRootPath}`,
    listing.pathPrefix ? `Path prefix: ${listing.pathPrefix}` : "Path prefix: package root",
    `Generated content: ${listing.includeGenerated ? "included for this scoped request" : "omitted by default"}`,
    `Depth limit: ${listing.maxDepth}`,
    `Inventory cap: ${listing.maxEntries}`,
    preview.gitSha ? `Git SHA: ${preview.gitSha}` : undefined,
    listing.totalFileCountTruncated
      ? `Files captured: ${listing.files.length}+; artifact cap reached, narrow pathPrefix/maxDepth before relying on exhaustive coverage`
      : `Files captured: ${listing.files.length} of ${listing.totalFileCount}`,
    `Omitted directories summarized: ${listing.omittedDirectories.length} of ${listing.omittedDirectoryCount}`,
    "",
    "Filter policy:",
    "- This artifact uses the same selector/filter policy as ambient_capability_builder_list_files.",
    "- Generated/dependency directories remain summarized unless includeGenerated=true is paired with a narrow pathPrefix.",
    "- Use ambient_capability_builder_read_file for exact file contents after choosing package-relative paths from this inventory.",
    listing.nextCursor
      ? "- This inventory hit its artifact cap. Narrow pathPrefix/maxDepth before relying on exhaustive coverage."
      : "- This inventory is complete for the filtered scope shown above.",
    "",
    "Files:",
    ...(listing.files.length ? listing.files.map((file) => `- ${file.path} (${file.sizeBytes} bytes)`) : ["- none"]),
    "",
    "Omitted directories:",
    ...(listing.omittedDirectories.length
      ? listing.omittedDirectories.map((directory) => `- ${directory.path}/ (${directory.reason}; ${directory.fileCount}${directory.truncated ? "+" : ""} files; ${directory.totalBytes}${directory.truncated ? "+ scanned" : ""} bytes)`)
      : ["- none"]),
  ].filter((line): line is string => line !== undefined).join("\n");
}

function capabilityBuilderListInventoryStructuredNextStep(artifact: CapabilityBuilderListInventoryArtifact) {
  return {
    artifactPath: artifact.path,
    chars: artifact.chars,
    previewChars: artifact.previewChars,
    truncated: artifact.truncated,
    inventoryFileCount: artifact.inventoryFileCount,
    inventoryFileCountTruncated: artifact.inventoryFileCountTruncated,
    recommendedNextTools: ["file_read", "long_context_process"],
    fileRead: artifact.fileReadInput,
    longContextProcess: artifact.longContextProcessInput,
  };
}

export function capabilityBuilderReadFileText(result: CapabilityBuilderReadFileResult): string {
  return [
    "Ambient Capability Builder file",
    `Package: ${result.packageName}`,
    `Canonical sourcePath: ${result.sourceRef.sourcePath}`,
    `File: ${result.filePath}`,
    `Size: ${result.sizeBytes} bytes`,
    result.truncated ? `Content preview truncated at ${result.maxChars} characters.` : "Content:",
    "",
    result.content,
  ].join("\n");
}

export function capabilityBuilderWriteFileText(result: CapabilityBuilderWriteFileResult): string {
  return [
    "Ambient Capability Builder file written",
    `Package: ${result.packageName}`,
    `Canonical sourcePath: ${result.sourceRef.sourcePath}`,
    `File: ${result.filePath}`,
    `Size: ${result.sizeBytes} bytes`,
    `Status: ${result.created ? "created" : "updated"}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    `Reason: ${result.reason}`,
    "",
    "Next steps:",
    ...result.nextSteps.map((step, index) => `${index + 1}. ${step}`),
  ].join("\n");
}

function formatEnvRequirement(env: CapabilityBuilderEnvRequirement): string {
  const required = env.required ? "required" : "optional";
  return `${env.name} (${required}${env.description ? `, ${env.description}` : ""})`;
}

function formatModelAsset(asset: CapabilityBuilderModelAsset): string {
  const details = [
    asset.url ? `url=${asset.url}` : undefined,
    asset.expectedSizeBytes !== undefined ? `size=${asset.expectedSizeBytes} bytes` : undefined,
    asset.license ? `license=${asset.license}` : undefined,
    asset.cachePath ? `cache=${asset.cachePath}` : undefined,
  ].filter(Boolean);
  return `${asset.name}${details.length ? ` (${details.join(", ")})` : ""}`;
}

function formatVoiceDiscovery(discovery: VoiceProviderDiscoveryMetadata): string {
  const details = [
    `command=${discovery.command}`,
    discovery.source ? `source=${discovery.source}` : undefined,
    discovery.cacheTtlSeconds !== undefined ? `ttl=${discovery.cacheTtlSeconds}s` : undefined,
    discovery.requiresNetwork !== undefined ? `network=${discovery.requiresNetwork}` : undefined,
    discovery.requiresSecret?.length ? `secrets=${discovery.requiresSecret.join(",")}` : undefined,
  ].filter(Boolean);
  return details.join(", ");
}

function formatVoiceCloning(cloning: VoiceProviderCloningMetadata): string {
  if (!cloning.supported) return "not supported";
  const details = [
    "supported",
    cloning.mode ? `mode=${cloning.mode}` : undefined,
    cloning.inputs?.audioFormats.length ? `audio=${cloning.inputs.audioFormats.join("/")}` : undefined,
    cloning.inputs?.minDurationSeconds !== undefined ? `min=${cloning.inputs.minDurationSeconds}s` : undefined,
    cloning.inputs?.maxDurationSeconds !== undefined ? `max=${cloning.inputs.maxDurationSeconds}s` : undefined,
    cloning.inputs?.minSamples !== undefined ? `minSamples=${cloning.inputs.minSamples}` : undefined,
    cloning.inputs?.transcript ? `transcript=${cloning.inputs.transcript}` : undefined,
    cloning.requiresConsent !== undefined ? `consent=${cloning.requiresConsent}` : undefined,
    cloning.requiresSecret?.length ? `secrets=${cloning.requiresSecret.join(",")}` : undefined,
    cloning.networkHosts?.length ? `network=${cloning.networkHosts.join(",")}` : undefined,
    cloning.output?.creates.length ? `creates=${cloning.output.creates.join(",")}` : undefined,
  ].filter(Boolean);
  return details.join(", ");
}

export function capabilityBuilderUpdatePlanText(result: CapabilityBuilderUpdatePlanResult): string {
  const descriptor = result.preview.descriptor;
  const manifest = result.buildManifest;
  return [
    "Ambient Capability Builder update plan",
    `Package: ${result.packageName}`,
    `Path: ${result.relativeRootPath}`,
    `Canonical sourcePath: ${result.relativeRootPath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    "Mode: read-only planning; no files, dependencies, validation, registration, or installed package state were changed.",
    result.requestedChanges ? `Requested changes: ${result.requestedChanges}` : undefined,
    result.targetVersion ? `Target version: ${result.targetVersion}` : undefined,
    result.notes ? `Notes: ${result.notes}` : undefined,
    "",
    "Current package:",
    `- static preview: ${result.preview.valid ? "valid" : "blocked by errors"}`,
    `- descriptor commands: ${descriptor?.commandNames.length ? descriptor.commandNames.join(", ") : "none"}`,
    `- env: ${descriptor?.envRequirements.length ? descriptor.envRequirements.map(formatEnvRequirement).join(", ") : "none"}`,
    `- network hosts: ${descriptor?.networkHosts.length ? descriptor.networkHosts.join(", ") : "none"}`,
    `- model assets: ${descriptor?.modelAssets.length ? descriptor.modelAssets.map(formatModelAsset).join(", ") : "none"}`,
    `- artifacts: ${descriptor?.artifactOutputTypes.length ? descriptor.artifactOutputTypes.join(", ") : "none declared"}`,
    manifest
      ? [
        `- builder status: ${manifest.status ?? "unknown"}`,
        `- installer shape: ${manifest.installerShape ?? "unspecified"}`,
        `- provider/runtime: ${manifest.provider ?? "unspecified"}`,
        `- installed package: ${manifest.installedPackageId ?? "not recorded"}`,
        `- refs: ${Object.entries(manifest.refs).map(([key, value]) => `${key}=${value ?? "null"}`).join(", ") || "none"}`,
      ].join("\n")
      : "- builder manifest: missing or unreadable",
    "",
    "Recommended steps:",
    ...result.recommendedSteps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "Approval checkpoints:",
    ...result.approvalCheckpoints.map((step) => `- ${step}`),
    "",
    "Rollback plan:",
    ...result.rollbackPlan.map((step) => `- ${step}`),
    result.errors.length ? ["", "Errors:", ...result.errors.map((item) => `- ${item}`)].join("\n") : undefined,
    result.warnings.length ? ["", "Warnings:", ...result.warnings.map((item) => `- ${item}`)].join("\n") : undefined,
    "",
    result.errors.length
      ? "Next: fix preview errors before any update implementation, dependency installation, validation, or registration."
      : "Next: present this update plan to the user and wait for approval before any mutation.",
  ].filter(Boolean).join("\n");
}

export function capabilityBuilderRemovalPlanText(result: CapabilityBuilderRemovalPlanResult): string {
  const descriptor = result.preview?.descriptor;
  const manifest = result.buildManifest;
  return [
    "Ambient Capability Builder removal plan",
    `Package: ${result.packageName}`,
    `Path: ${result.relativeRootPath}`,
    `Canonical sourcePath: ${result.relativeRootPath}`,
    `Source exists: ${result.sourceExists ? "yes" : "no"}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    "Mode: read-only planning; no files, logs, artifacts, env/secret metadata, registry state, or installed package state were changed.",
    result.installedPackageId ? `Installed package id: ${result.installedPackageId}` : undefined,
    result.installedSource ? `Installed source: ${result.installedSource}` : undefined,
    result.reason ? `Reason: ${result.reason}` : undefined,
    result.notes ? `Notes: ${result.notes}` : undefined,
    "",
    "Current package:",
    result.preview ? `- static preview: ${result.preview.valid ? "valid" : "blocked by errors"}` : "- static preview: unavailable",
    `- descriptor commands: ${descriptor?.commandNames.length ? descriptor.commandNames.join(", ") : "none"}`,
    `- env: ${descriptor?.envRequirements.length ? descriptor.envRequirements.map(formatEnvRequirement).join(", ") : "none"}`,
    `- network hosts: ${descriptor?.networkHosts.length ? descriptor.networkHosts.join(", ") : "none"}`,
    `- model assets: ${descriptor?.modelAssets.length ? descriptor.modelAssets.map(formatModelAsset).join(", ") : "none"}`,
    `- artifacts: ${descriptor?.artifactOutputTypes.length ? descriptor.artifactOutputTypes.join(", ") : "none declared"}`,
    manifest
      ? [
        `- builder status: ${manifest.status ?? "unknown"}`,
        `- provider/runtime: ${manifest.provider ?? "unspecified"}`,
        `- installed package: ${manifest.installedPackageId ?? "not recorded"}`,
        `- refs: ${Object.entries(manifest.refs).map(([key, value]) => `${key}=${value ?? "null"}`).join(", ") || "none"}`,
      ].join("\n")
      : "- builder manifest: missing or unreadable",
    "",
    "Source inventory:",
    `- package files: ${result.sourceInventory.packageFiles.length}`,
    `- metadata files: ${result.sourceInventory.metadataFiles.length ? result.sourceInventory.metadataFiles.join(", ") : "none"}`,
    `- log files: ${result.sourceInventory.logFiles.length ? result.sourceInventory.logFiles.join(", ") : "none"}`,
    `- possible artifact files: ${result.sourceInventory.possibleArtifactFiles.length ? result.sourceInventory.possibleArtifactFiles.join(", ") : "none detected"}`,
    "",
    "Recommended steps:",
    ...result.recommendedSteps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "Approval checkpoints:",
    ...result.approvalCheckpoints.map((step) => `- ${step}`),
    "",
    "Preserve by default:",
    ...result.preserveByDefault.map((step) => `- ${step}`),
    "",
    "Rollback plan:",
    ...result.rollbackPlan.map((step) => `- ${step}`),
    result.errors.length ? ["", "Errors:", ...result.errors.map((item) => `- ${item}`)].join("\n") : undefined,
    result.warnings.length ? ["", "Warnings:", ...result.warnings.map((item) => `- ${item}`)].join("\n") : undefined,
    "",
    result.errors.length
      ? "Next: fix preview errors or confirm installed package metadata before any removal, deletion, unregistering, or secret cleanup."
      : "Next: present this removal plan to the user and wait for approval before any destructive or registry-changing action.",
  ].filter(Boolean).join("\n");
}

export function capabilityBuilderRepairPlanText(result: CapabilityBuilderRepairPlanResult): string {
  const descriptor = result.preview.descriptor;
  const manifest = result.buildManifest;
  return [
    "Ambient Capability Builder repair plan",
    `Package: ${result.packageName}`,
    `Path: ${result.relativeRootPath}`,
    `Canonical sourcePath: ${result.relativeRootPath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    "Mode: read-only planning; no files, dependencies, validation, registration, or installed package state were changed.",
    result.requestedRepair ? `Requested repair: ${result.requestedRepair}` : undefined,
    result.notes ? `Notes: ${result.notes}` : undefined,
    "",
    "Current package:",
    `- static preview: ${result.preview.valid ? "valid" : "blocked by errors"}`,
    `- descriptor commands: ${descriptor?.commandNames.length ? descriptor.commandNames.join(", ") : "none"}`,
    `- env: ${descriptor?.envRequirements.length ? descriptor.envRequirements.map(formatEnvRequirement).join(", ") : "none"}`,
    `- network hosts: ${descriptor?.networkHosts.length ? descriptor.networkHosts.join(", ") : "none"}`,
    `- model assets: ${descriptor?.modelAssets.length ? descriptor.modelAssets.map(formatModelAsset).join(", ") : "none"}`,
    `- artifacts: ${descriptor?.artifactOutputTypes.length ? descriptor.artifactOutputTypes.join(", ") : "none declared"}`,
    manifest
      ? [
        `- builder status: ${manifest.status ?? "unknown"}`,
        `- provider/runtime: ${manifest.provider ?? "unspecified"}`,
        `- installed package: ${manifest.installedPackageId ?? "not recorded"}`,
        `- refs: ${Object.entries(manifest.refs).map(([key, value]) => `${key}=${value ?? "null"}`).join(", ") || "none"}`,
      ].join("\n")
      : "- builder manifest: missing or unreadable",
    "",
    "Source inventory:",
    `- package files: ${result.sourceInventory.packageFiles.length}`,
    `- metadata files: ${result.sourceInventory.metadataFiles.length ? result.sourceInventory.metadataFiles.join(", ") : "none"}`,
    `- log files: ${result.sourceInventory.logFiles.length ? result.sourceInventory.logFiles.join(", ") : "none"}`,
    `- possible artifact files: ${result.sourceInventory.possibleArtifactFiles.length ? result.sourceInventory.possibleArtifactFiles.join(", ") : "none detected"}`,
    "",
    "Diagnostic evidence:",
    `- recommended reads: ${result.diagnosticEvidence.recommendedReads.length ? result.diagnosticEvidence.recommendedReads.join("; ") : "none yet"}`,
    ...(result.diagnosticEvidence.recentLogEntries.length
      ? result.diagnosticEvidence.recentLogEntries.flatMap((log) => [
        `- ${log.path}: ${log.lineCount} line${log.lineCount === 1 ? "" : "s"}`,
        ...log.entries.map((entry) => `  - ${entry}`),
      ])
      : ["- no log excerpts available"]),
    "",
    "Recommended steps:",
    ...result.recommendedSteps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "Installer recovery guidance:",
    ...result.installerRecoveryGuidance.map((step) => `- ${step}`),
    "",
    "Installer recovery templates:",
    ...result.installerRecoveryTemplates.flatMap((template) => [
      `- ${template.id}: ${template.label}`,
      `  applies when: ${template.appliesWhen}`,
      `  privileged boundary: ${template.privilegedBoundary}`,
      ...template.steps.map((step, index) => `  ${index + 1}. ${step}`),
    ]),
    "",
    "Approval checkpoints:",
    ...result.approvalCheckpoints.map((step) => `- ${step}`),
    "",
    "Validation plan:",
    ...result.validationPlan.map((step) => `- ${step}`),
    "",
    "Rollback plan:",
    ...result.rollbackPlan.map((step) => `- ${step}`),
    result.errors.length ? ["", "Errors:", ...result.errors.map((item) => `- ${item}`)].join("\n") : undefined,
    result.warnings.length ? ["", "Warnings:", ...result.warnings.map((item) => `- ${item}`)].join("\n") : undefined,
    "",
    "Next: present this repair plan to the user and wait for approval before any mutation.",
  ].filter(Boolean).join("\n");
}

export function capabilityBuilderApplyRepairText(result: CapabilityBuilderApplyRepairResult): string {
  return [
    "Ambient Capability Builder repair applied",
    `Package: ${result.packageName}`,
    `Path: ${result.relativeRootPath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    `Repair Git SHA: ${result.repairGitSha ?? "unavailable"}`,
    `Repaired at: ${result.repairedAt}`,
    `Reason: ${result.reason}`,
    "",
    "Files written:",
    ...result.files.map((file) => `- ${file.path} (${file.sizeBytes} bytes, ${file.created ? "created" : "updated"}): ${file.rationale}`),
    "",
    "Validation state: prior validation metadata was cleared; this package must be previewed and validated again before registration.",
    "",
    "Next steps:",
    ...result.nextSteps.map((step, index) => `${index + 1}. ${step}`),
  ].join("\n");
}

function normalizeDependencyCommand(
  rootPath: string,
  command: CapabilityBuilderDependencyCommand,
): CapabilityBuilderDependencyCommand & { args: string[]; cwd: string; resolvedCwd: string } {
  const executable = command.command.trim();
  if (!executable) throw new Error("Dependency command executable is required.");
  if (executable.includes("\0") || executable.includes("\n")) throw new Error(`Dependency command contains unsupported characters: ${executable}`);
  const args = command.args ?? [];
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) throw new Error(`Dependency command args must be strings: ${executable}`);
  if (args.some((arg) => arg.includes("\0"))) throw new Error(`Dependency command args contain unsupported characters: ${executable}`);
  const cwd = command.cwd?.trim() || ".";
  const resolvedCwd = resolve(rootPath, cwd);
  if (!isPathInside(rootPath, resolvedCwd)) throw new Error(`Dependency command cwd escapes the package root: ${cwd}`);
  const rationale = command.rationale.trim();
  if (!rationale) throw new Error(`Dependency command rationale is required: ${executable}`);
  return { command: executable, args, cwd, resolvedCwd, rationale };
}

function dependencyCommandResult(
  command: CapabilityBuilderDependencyCommand & { args: string[]; cwd: string },
  status: CapabilityBuilderDependencyCommandResult["status"],
  durationMs: number,
  stdoutValue: string | Buffer | undefined,
  stderrValue: string | Buffer | undefined,
  exitCode?: number | string,
  error?: string,
): CapabilityBuilderDependencyCommandResult {
  const stdout = outputText(stdoutValue);
  const stderr = outputText(stderrValue);
  const safeStdout = redactSensitiveText(stdout);
  const safeStderr = redactSensitiveText(stderr);
  return {
    command: command.command,
    args: command.args.map(redactSensitiveText),
    cwd: command.cwd,
    rationale: command.rationale,
    status,
    durationMs,
    ...(exitCode !== undefined ? { exitCode } : {}),
    ...(error ? { error: redactSensitiveText(error) } : {}),
    stdoutPreview: safeStdout.slice(0, dependencyOutputPreviewChars),
    stderrPreview: safeStderr.slice(0, dependencyOutputPreviewChars),
    stdoutLength: safeStdout.length,
    stderrLength: safeStderr.length,
    stdoutTruncated: safeStdout.length > dependencyOutputPreviewChars,
    stderrTruncated: safeStderr.length > dependencyOutputPreviewChars,
  };
}

function outputText(value: string | Buffer | undefined): string {
  if (value === undefined) return "";
  return Buffer.isBuffer(value) ? value.toString("utf8") : value;
}

export function capabilityBuilderDependencyRuntimeGuidance(commands: Array<Pick<CapabilityBuilderDependencyCommandResult, "command" | "args"> | CapabilityBuilderDependencyCommand>): string[] {
  const notes = [
    "When every command has a terminal succeeded/failed status, the dependency or validation step is complete; do not add arbitrary post-command wait padding.",
  ];
  if (commands.some((command) => isPythonPipInstallCommand(command.command, command.args ?? []))) {
    notes.push(
      "Python package install detected: the approval rationale should state the target environment. Prefer package-local .venv commands such as `uv venv --python <version> .venv` followed by `uv pip install --python .venv/bin/python ...`, or `.venv/bin/python -m pip install ...`.",
    );
  }
  if (commands.some((command) => isPythonPipInstallCommand(command.command, command.args ?? []) && !isPackageLocalPythonPipInstallCommand(command.command, command.args ?? []))) {
    notes.push("Bare/global pip install forms should be rewritten to target a package-local .venv unless the user explicitly approves global/user-site installation risk.");
  }
  if (commands.some((command) => isUvRunWithRuntime(command.command, command.args ?? []))) {
    notes.push(
      "`uv run --with ...` is a package-manager mediated runtime: the first run may resolve/cache packages and later runs may be faster, but the command result is still the completion signal.",
    );
    notes.push("If this capability depends on this mediated runtime at execution time, describe that in SKILL.md and preserve the exact package-manager command in the descriptor.");
  }
  if (commands.some((command) => isPackageManagerCommand(command.command))) {
    notes.push("Package-manager output can be verbose; use the log path plus actual stdout/stderr lengths instead of asking Pi to wait or rerun just to inspect full output.");
  }
  return [...new Set(notes)];
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map((part) => JSON.stringify(part)).join(" ");
}

function formatDurationMs(durationMs: number): string {
  return `${durationMs.toLocaleString()} ms`;
}

function formatOutputPreview(preview: string, length: number, truncated: boolean): string {
  if (!length) return "(empty, 0 chars)";
  const suffix = truncated ? `... (truncated, ${length} chars total)` : `(${length} chars)`;
  return `${JSON.stringify(preview)} ${suffix}`;
}

function isUvRunWithRuntime(command: string, args: string[]): boolean {
  return basename(command) === "uv" && args[0] === "run" && args.includes("--with");
}

function isPythonPipInstallCommand(command: string, args: string[]): boolean {
  const executable = basename(command);
  if (/^pip(?:\d+(?:\.\d+)*)?$/.test(executable) && args[0] === "install") return true;
  if (/^python(?:\d+(?:\.\d+)*)?$/.test(executable) && args[0] === "-m" && args[1] === "pip" && args[2] === "install") return true;
  return executable === "uv" && args[0] === "pip" && args[1] === "install";
}

function isPackageLocalPythonPipInstallCommand(command: string, args: string[]): boolean {
  const executable = basename(command);
  if (executable === "uv" && args[0] === "pip" && args[1] === "install") {
    return args.some((arg, index) => arg === "--python" && hasPackageLocalVenvPath(args[index + 1] ?? ""))
      || args.some((arg) => arg.startsWith("--python=") && hasPackageLocalVenvPath(arg.slice("--python=".length)));
  }
  return hasPackageLocalVenvPath(command);
}

function hasPackageLocalVenvPath(value: string): boolean {
  return value === ".venv" || value.startsWith(".venv/") || value.startsWith(".venv\\") || /[/\\]\.venv([/\\]|$)/.test(value);
}

function isPackageManagerCommand(command: string): boolean {
  return ["uv", "pip", "pip3", "python", "python3", "npm", "pnpm", "yarn", "bun", "cargo", "go"].includes(basename(command));
}

async function capabilityBuilderValidationCommands(
  workspace: string,
  rootPath: string,
  input: CapabilityBuilderValidateInput,
): Promise<Array<CapabilityBuilderValidationCommand & { args: string[]; cwd: string; resolvedCwd: string; providerContract?: ProviderContractValidationMetadata }>> {
  const errors: string[] = [];
  const descriptorPath = join(rootPath, "ambient-cli.json");
  const descriptor = parseJsonObject(await readFile(descriptorPath, "utf8"), "ambient-cli.json", errors);
  if (!descriptor || errors.length) throw new Error(`ambient-cli.json is invalid: ${errors.join("; ")}`);
  const commands = recordField(descriptor.commands);
  const validationCommands: Array<CapabilityBuilderValidationCommand & { args: string[]; cwd: string; resolvedCwd: string; providerContract?: ProviderContractValidationMetadata }> = [];
  for (const [commandName, value] of Object.entries(commands)) {
    const command = recordField(value);
    const healthCheck = stringArrayField(command.healthCheck);
    if (!healthCheck.length) continue;
    const cwdPolicy = stringField(command.cwd) ?? "workspace";
    const cwdRoot = cwdPolicy === "package" ? rootPath : workspace;
    const normalized = normalizeDependencyCommand(cwdRoot, {
      command: healthCheck[0],
      args: healthCheck.slice(1),
      cwd: ".",
      rationale: `Run descriptor health check for ${commandName}.`,
    });
    validationCommands.push({ ...normalized, source: "healthCheck", commandName });
  }
  if (input.includeSmokeTests !== false && existsSync(join(rootPath, "tests", "smoke.test.mjs"))) {
    validationCommands.push({
      ...normalizeDependencyCommand(rootPath, {
        command: "node",
        args: ["tests/smoke.test.mjs"],
        cwd: ".",
        rationale: "Run package smoke test.",
      }),
      source: "smokeTest",
    });
  }
  const manifest = await readBuildManifestIfPresent(rootPath);
  if (installerShapeFromManifest(manifest) === "tts-provider") {
    for (const [commandName, value] of Object.entries(commands)) {
      const providerCommand = providerContractValidationCommand(workspace, rootPath, commandName, recordField(value));
      if (providerCommand) validationCommands.push(providerCommand);
    }
  }
  return validationCommands;
}

interface ProviderContractValidationMetadata {
  outputPath: string;
  format: "mp3" | "wav" | "ogg";
  expectedMimeType: string;
  maxSizeBytes: number;
}

function providerContractValidationCommand(
  workspace: string,
  rootPath: string,
  commandName: string,
  command: Record<string, unknown>,
): (CapabilityBuilderValidationCommand & { args: string[]; cwd: string; resolvedCwd: string; providerContract: ProviderContractValidationMetadata }) | undefined {
  const voiceProvider = recordField(command.voiceProvider);
  if (!Object.keys(voiceProvider).length) return undefined;
  const executable = stringField(command.command);
  if (!executable) return undefined;
  const format = normalizeVoiceOutputFormat(stringField(voiceProvider.defaultFormat) ?? "wav") ?? "wav";
  const voices = Array.isArray(voiceProvider.voices) ? voiceProvider.voices : [];
  const voiceId = stringField(recordField(voices[0]).id);
  const outputPath = join(rootPath, "validation-artifacts", `ambient-voice-test-${Date.now()}-${process.pid}.${format}`);
  const cwdPolicy = stringField(command.cwd) ?? "workspace";
  const cwdRoot = cwdPolicy === "package" ? rootPath : workspace;
  const commandArgs = [
    ...stringArrayField(command.args),
    "--text",
    "Ambient voice test.",
    "--output",
    outputPath,
    "--format",
    format,
    ...(voiceId ? ["--voice", voiceId] : []),
  ];
  const normalized = normalizeDependencyCommand(cwdRoot, {
    command: executable,
    args: commandArgs,
    cwd: ".",
    rationale: `Run Ambient tts-provider contract synthesis for ${commandName}.`,
  });
  return {
    ...normalized,
    source: "providerContract",
    commandName,
    providerContract: {
      outputPath,
      format,
      expectedMimeType: mimeTypeForVoiceFormat(format),
      maxSizeBytes: 25 * 1024 * 1024,
    },
  };
}

async function validateProviderContractCommandOutput(
  workspace: string,
  command: { providerContract?: ProviderContractValidationMetadata },
  stdoutValue: string | Buffer | undefined,
): Promise<string | undefined> {
  const contract = command.providerContract;
  if (!contract) return undefined;
  const stdout = outputText(stdoutValue).trim();
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(stdout);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "Provider contract stdout must be a JSON object.";
    payload = parsed as Record<string, unknown>;
  } catch (error) {
    return `Provider contract stdout must be concise JSON metadata: ${error instanceof Error ? error.message : String(error)}`;
  }
  const audioPathValue = stringField(payload.audioPath) ?? contract.outputPath;
  const resolvedAudioPath = resolve(workspace, audioPathValue);
  if (!isPathInside(workspace, resolvedAudioPath)) return "Provider contract audioPath must stay inside the workspace.";
  if (resolvedAudioPath !== contract.outputPath) {
    return `Provider contract must write audio to the exact requested --output path. Expected ${toWorkspaceRelative(workspace, contract.outputPath)}, got ${toWorkspaceRelative(workspace, resolvedAudioPath)}.`;
  }
  if (extname(resolvedAudioPath).toLowerCase() !== `.${contract.format}`) {
    return `Provider contract audio extension must match --format ${contract.format}.`;
  }
  const mimeType = stringField(payload.mimeType);
  if (mimeType && mimeType !== contract.expectedMimeType) {
    return `Provider contract mimeType must match --format ${contract.format}: expected ${contract.expectedMimeType}, got ${mimeType}.`;
  }
  let file;
  try {
    file = await stat(resolvedAudioPath);
  } catch {
    return `Provider contract did not create audio at ${toWorkspaceRelative(workspace, contract.outputPath)}.`;
  }
  if (!file.isFile()) return "Provider contract audioPath is not a file.";
  if (file.size <= 0) return "Provider contract created a zero-byte audio file.";
  if (file.size > contract.maxSizeBytes) {
    return `Provider contract tiny synthesis output is too large: ${file.size} bytes exceeds ${contract.maxSizeBytes} bytes.`;
  }
  return undefined;
}

interface CapabilityBuilderSourceListing {
  pathPrefix?: string;
  maxEntries: number;
  maxDepth: number;
  includeGenerated: boolean;
  totalFileCount: number;
  totalFileCountTruncated: boolean;
  omittedDirectoryCount: number;
  omittedDirectories: CapabilityBuilderOmittedDirectorySummary[];
  nextCursor?: string;
  files: Array<{
    path: string;
    sizeBytes: number;
    mtimeMs: number;
  }>;
}

interface CapabilityBuilderListCollection {
  files: CapabilityBuilderSourceListing["files"];
  omittedDirectories: CapabilityBuilderOmittedDirectorySummary[];
  omittedDirectoryCount: number;
  matchedFileCount: number;
  hasMoreFiles: boolean;
}

interface CapabilityBuilderListCursorScope {
  packageName: string;
  sourcePath: string;
  rootKey: string;
  pathPrefix: string;
  includeGenerated: boolean;
  maxEntries: number;
  maxDepth: number;
  sortOrder: string;
  gitSha: string;
  targetMtimeMs: number;
  targetKind: "file" | "directory";
}

interface CapabilityBuilderListPackageIdentity {
  packageName: string;
  sourcePath: string;
  gitSha?: string;
}

async function listCapabilityBuilderSourceFiles(
  rootPath: string,
  input: CapabilityBuilderListFilesInput,
  identity: CapabilityBuilderListPackageIdentity,
  maxEntriesCap = builderListMaxEntries,
): Promise<CapabilityBuilderSourceListing> {
  const pathPrefix = normalizeCapabilityBuilderListPathPrefix(rootPath, input.pathPrefix);
  const maxEntries = boundedCapabilityBuilderListInteger(input.maxEntries, builderListDefaultMaxEntries, maxEntriesCap, "maxEntries");
  const maxDepth = boundedCapabilityBuilderListInteger(input.maxDepth, builderListDefaultMaxDepth, builderListMaxDepth, "maxDepth");
  const includeGenerated = input.includeGenerated === true;
  if (includeGenerated && !pathPrefix.path) {
    throw new Error("includeGenerated=true requires a narrow pathPrefix inside the Builder package.");
  }

  const targetStat = await stat(pathPrefix.absolutePath).catch(() => undefined);
  if (!targetStat) throw new Error(`Capability Builder list path does not exist: ${pathPrefix.path ?? "."}`);
  const targetKind = targetStat.isFile() ? "file" : targetStat.isDirectory() ? "directory" : undefined;
  if (!targetKind) throw new Error(`Capability Builder list path is not a file or directory: ${pathPrefix.path ?? "."}`);
  const cursorScope = capabilityBuilderListCursorScope(rootPath, identity, pathPrefix.path, includeGenerated, maxEntries, maxDepth, targetStat.mtimeMs, targetKind);
  const offset = decodeCapabilityBuilderListCursor(input.cursor, cursorScope);
  if (offset > builderListMaxCursorOffset) throw new Error(`Capability Builder list cursor is too deep; narrow pathPrefix or filters before continuing past ${builderListMaxCursorOffset} files.`);

  const collection: CapabilityBuilderListCollection = {
    files: [],
    omittedDirectories: [],
    omittedDirectoryCount: 0,
    matchedFileCount: 0,
    hasMoreFiles: false,
  };
  if (!includeGenerated && pathPrefix.path && capabilityBuilderGeneratedDirectoryRoot(pathPrefix.path)) {
    if (targetStat.isDirectory()) {
      await recordCapabilityBuilderOmittedDirectory(collection, pathPrefix.absolutePath, pathPrefix.path, "generated");
    }
    return {
      ...(pathPrefix.path ? { pathPrefix: pathPrefix.path } : {}),
      maxEntries,
      maxDepth,
      includeGenerated,
      totalFileCount: 0,
      totalFileCountTruncated: false,
      omittedDirectoryCount: collection.omittedDirectoryCount,
      omittedDirectories: collection.omittedDirectories,
      files: [],
    };
  }

  if (targetKind === "file") {
    appendCapabilityBuilderListedFile(collection, offset, maxEntries, {
      path: pathPrefix.path!,
      sizeBytes: targetStat.size,
      mtimeMs: targetStat.mtimeMs,
    });
  } else {
    await collectCapabilityBuilderListedFiles(rootPath, pathPrefix.absolutePath, maxDepth, includeGenerated, offset, maxEntries, collection);
  }

  collection.omittedDirectories.sort((left, right) => left.path.localeCompare(right.path));
  const nextOffset = offset + collection.files.length;
  return {
    ...(pathPrefix.path ? { pathPrefix: pathPrefix.path } : {}),
    maxEntries,
    maxDepth,
    includeGenerated,
    totalFileCount: collection.hasMoreFiles ? nextOffset + 1 : collection.matchedFileCount,
    totalFileCountTruncated: collection.hasMoreFiles,
    omittedDirectoryCount: collection.omittedDirectoryCount,
    omittedDirectories: collection.omittedDirectories.slice(0, builderListMaxOmittedDirectories),
    ...(collection.hasMoreFiles ? { nextCursor: encodeCapabilityBuilderListCursor(nextOffset, cursorScope) } : {}),
    files: collection.files,
  };
}

async function collectCapabilityBuilderListedFiles(
  rootPath: string,
  directory: string,
  maxDepth: number,
  includeGenerated: boolean,
  offset: number,
  maxEntries: number,
  collection: CapabilityBuilderListCollection,
  depth = 0,
): Promise<void> {
  if (collection.hasMoreFiles) return;
  const entries = await opendir(directory);
  for await (const entry of entries) {
    if (collection.hasMoreFiles) return;
    const absolutePath = join(directory, entry.name);
    const relativePath = normalizeCapabilityBuilderRelativePath(relative(rootPath, absolutePath));
    if (relativePath === ".git" || relativePath.startsWith(".git/")) continue;
    if (entry.isDirectory()) {
      const generatedRoot = capabilityBuilderGeneratedDirectoryRoot(relativePath);
      if (!includeGenerated && generatedRoot === relativePath) {
        await recordCapabilityBuilderOmittedDirectory(collection, absolutePath, relativePath, "generated");
        continue;
      }
      if (depth >= maxDepth) {
        await recordCapabilityBuilderOmittedDirectory(collection, absolutePath, relativePath, "maxDepth");
        continue;
      }
      await collectCapabilityBuilderListedFiles(rootPath, absolutePath, maxDepth, includeGenerated, offset, maxEntries, collection, depth + 1);
    } else if (entry.isFile()) {
      const file = await stat(absolutePath);
      appendCapabilityBuilderListedFile(collection, offset, maxEntries, { path: relativePath, sizeBytes: file.size, mtimeMs: file.mtimeMs });
    }
  }
}

function appendCapabilityBuilderListedFile(
  collection: CapabilityBuilderListCollection,
  offset: number,
  maxEntries: number,
  file: CapabilityBuilderSourceListing["files"][number],
): void {
  collection.matchedFileCount += 1;
  if (collection.matchedFileCount <= offset) return;
  if (collection.files.length < maxEntries) {
    collection.files.push(file);
    return;
  }
  collection.hasMoreFiles = true;
}

async function recordCapabilityBuilderOmittedDirectory(
  collection: CapabilityBuilderListCollection,
  absolutePath: string,
  relativePath: string,
  reason: CapabilityBuilderOmittedDirectorySummary["reason"],
): Promise<void> {
  collection.omittedDirectoryCount += 1;
  if (collection.omittedDirectories.length >= builderListMaxOmittedDirectories) return;
  collection.omittedDirectories.push(await summarizeCapabilityBuilderOmittedDirectory(absolutePath, relativePath, reason));
}

async function summarizeCapabilityBuilderOmittedDirectory(
  absolutePath: string,
  relativePath: string,
  reason: CapabilityBuilderOmittedDirectorySummary["reason"],
): Promise<CapabilityBuilderOmittedDirectorySummary> {
  let fileCount = 0;
  let totalBytes = 0;
  let directoryCount = 0;
  let truncated = false;
  async function visit(directory: string): Promise<void> {
    if (truncated) return;
    directoryCount += 1;
    if (directoryCount > builderListOmittedSummaryMaxDirectories) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await opendir(directory);
    } catch {
      return;
    }
    for await (const entry of entries) {
      if (truncated) return;
      const childPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(childPath);
      } else if (entry.isFile()) {
        if (fileCount >= builderListOmittedSummaryMaxFiles) {
          truncated = true;
          return;
        }
        const file = await stat(childPath).catch(() => undefined);
        if (!file) continue;
        fileCount += 1;
        totalBytes += file.size;
      }
    }
  }
  await visit(absolutePath);
  return { path: relativePath, reason, fileCount, totalBytes, truncated };
}

function normalizeCapabilityBuilderListPathPrefix(rootPath: string, pathPrefix: string | undefined): { path?: string; absolutePath: string } {
  const trimmed = pathPrefix?.trim();
  if (!trimmed || trimmed === ".") return { absolutePath: rootPath };
  if (trimmed.includes("\0")) throw new Error(`Capability Builder list path contains unsupported characters: ${trimmed}`);
  if (isAbsolute(trimmed)) throw new Error(`Capability Builder list path must be package-relative: ${trimmed}`);
  const absolutePath = resolve(rootPath, trimmed);
  const relativePath = relative(rootPath, absolutePath);
  if (!relativePath || relativePath === "." || relativePath.startsWith("..") || !isPathInside(rootPath, absolutePath)) {
    throw new Error(`Capability Builder list path escapes the package root: ${trimmed}`);
  }
  if (relativePath === ".git" || relativePath.startsWith(".git/")) {
    throw new Error(`Capability Builder file tools cannot access package Git metadata: ${trimmed}`);
  }
  return { path: normalizeCapabilityBuilderRelativePath(relativePath), absolutePath };
}

function capabilityBuilderGeneratedDirectoryRoot(relativePath: string): string | undefined {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  const rootSegments: string[] = [];
  for (const segment of segments) {
    rootSegments.push(segment);
    if (builderListGeneratedDirectoryNames.has(segment)) return rootSegments.join("/");
  }
  return undefined;
}

function normalizeCapabilityBuilderRelativePath(relativePath: string): string {
  return relativePath.split(/[\\/]+/).join("/");
}

function boundedCapabilityBuilderListInteger(value: number | undefined, defaultValue: number, maxValue: number, label: string): number {
  if (value === undefined) return defaultValue;
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  const integer = Math.floor(value);
  if (integer < 1) throw new Error(`${label} must be at least 1.`);
  return Math.min(integer, maxValue);
}

function capabilityBuilderListCursorScope(
  rootPath: string,
  identity: CapabilityBuilderListPackageIdentity,
  pathPrefix: string | undefined,
  includeGenerated: boolean,
  maxEntries: number,
  maxDepth: number,
  targetMtimeMs: number,
  targetKind: "file" | "directory",
): CapabilityBuilderListCursorScope {
  return {
    packageName: identity.packageName,
    sourcePath: identity.sourcePath,
    rootKey: createHash("sha256").update(resolve(rootPath)).digest("hex"),
    pathPrefix: pathPrefix ?? "",
    includeGenerated,
    maxEntries,
    maxDepth,
    sortOrder: builderListSortOrder,
    gitSha: identity.gitSha ?? "",
    targetMtimeMs,
    targetKind,
  };
}

function decodeCapabilityBuilderListCursor(cursor: string | undefined, expectedScope: CapabilityBuilderListCursorScope): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      v?: unknown;
      offset?: unknown;
      scope?: unknown;
    };
    if (parsed.v !== builderListCursorVersion) throw new Error("unsupported cursor version");
    if (typeof parsed.offset !== "number" || !Number.isInteger(parsed.offset) || parsed.offset < 0) throw new Error("invalid offset");
    if (JSON.stringify(parsed.scope) !== JSON.stringify(expectedScope)) throw new Error("cursor scope mismatch");
    return parsed.offset;
  } catch {
    throw new Error("Capability Builder list cursor is invalid or does not match the current package, pathPrefix, filters, sort order, or snapshot.");
  }
}

function encodeCapabilityBuilderListCursor(offset: number, scope: CapabilityBuilderListCursorScope): string {
  return Buffer.from(JSON.stringify({ v: builderListCursorVersion, offset, scope }), "utf8").toString("base64url");
}

async function listPackageFiles(rootPath: string): Promise<Map<string, number>> {
  const metadata = await listPackageFileMetadata(rootPath);
  return new Map([...metadata.entries()].map(([path, file]) => [path, file.sizeBytes]));
}

async function listPackageFileMetadata(rootPath: string): Promise<Map<string, CapabilityBuilderFileMetadata>> {
  const files = new Map<string, CapabilityBuilderFileMetadata>();
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(rootPath, absolutePath);
      if (relativePath === ".git" || relativePath.startsWith(".git/")) continue;
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        const file = await stat(absolutePath);
        files.set(relativePath, { sizeBytes: file.size, mtimeMs: file.mtimeMs });
      }
    }
  }
  await visit(rootPath);
  return files;
}

function validationArtifactFiles(
  beforeFiles: Map<string, CapabilityBuilderFileMetadata>,
  afterFiles: Map<string, CapabilityBuilderFileMetadata>,
  artifactOutputTypes: string[],
): CapabilityBuilderValidationArtifact[] {
  return [...afterFiles.entries()]
    .filter(([file]) => isCapabilityBuilderValidationArtifactCandidate(file))
    .filter(([file]) => !artifactOutputTypes.length || artifactPathMatchesOutputTypes(file, artifactOutputTypes))
    .filter(([file, metadata]) => {
      const before = beforeFiles.get(file);
      if (!before) return true;
      if (!artifactOutputTypes.length) return false;
      return before.sizeBytes !== metadata.sizeBytes || before.mtimeMs !== metadata.mtimeMs;
    })
    .map(([path, metadata]) => ({ path, sizeBytes: metadata.sizeBytes }));
}

function existingDeclaredArtifactCandidates(
  beforeFiles: Map<string, CapabilityBuilderFileMetadata>,
  afterFiles: Map<string, CapabilityBuilderFileMetadata>,
  artifactOutputTypes: string[],
): string[] {
  return [...afterFiles.keys()]
    .filter((file) => beforeFiles.has(file))
    .filter((file) => isCapabilityBuilderValidationArtifactCandidate(file))
    .filter((file) => artifactPathMatchesOutputTypes(file, artifactOutputTypes))
    .sort();
}

function missingDeclaredArtifactError(
  preview: CapabilityBuilderPreviewResult,
  artifactOutputTypes: string[],
  existingCandidates: string[],
): string {
  const responseFormats = preview.descriptor?.responseFormats ?? [];
  const stdoutContractHint = preview.installerShape === "search-provider" || responseFormats.length
    ? ` This looks like a stdout/API response contract${preview.installerShape === "search-provider" ? " for a search-provider" : ""}${responseFormats.length ? ` (${responseFormats.join(", ")})` : ""}. For search/API/text providers, put JSON/Markdown/text response shape in responseFormats and remove artifacts.outputTypes/outputFileArtifactTypes unless the command intentionally writes files.`
    : " If this capability returns concise stdout instead of file artifacts, remove artifacts.outputTypes/outputFileArtifactTypes and describe stdout/API shape in responseFormats.";
  const artifactRepairHint = "If it is a file artifact generator, update tests/smoke.test.mjs to run the primary command and create or update a fresh declared artifact file.";
  const base = existingCandidates.length
    ? `Validation did not create or update any declared artifact files (${artifactOutputTypes.join(", ")}). Matching declared artifact file(s) already existed before validation: ${existingCandidates.join(", ")}.`
    : `Validation did not create any declared artifact files (${artifactOutputTypes.join(", ")}).`;
  return `${base}${stdoutContractHint} ${artifactRepairHint}`;
}

function isCapabilityBuilderValidationArtifactCandidate(file: string): boolean {
  if (file.startsWith(".git/")) return false;
  if (isCapabilityBuilderMetadataFile(file)) return false;
  if (/^(ambient-cli\.json|SKILL\.md|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(file)) return false;
  if (file.startsWith("scripts/") || file.startsWith("tests/")) return false;
  return true;
}

async function capabilityBuilderSourceInventory(rootPath: string): Promise<CapabilityBuilderRemovalPlanResult["sourceInventory"]> {
  const files = [...(await listPackageFiles(rootPath)).keys()].sort();
  const metadataFiles = files.filter((file) => isCapabilityBuilderMetadataFile(file));
  const logFiles = files.filter((file) => file.endsWith(".log") || file.endsWith(".jsonl") || file.includes("log"));
  const packageFiles = files.filter((file) => !metadataFiles.includes(file) && !logFiles.includes(file));
  const possibleArtifactFiles = files.filter((file) => {
    if (metadataFiles.includes(file) || logFiles.includes(file)) return false;
    if (/^(ambient-cli\.json|SKILL\.md|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(file)) return false;
    if (file.startsWith("scripts/") || file.startsWith("tests/")) return false;
    return /\.(wav|mp3|mp4|mov|png|jpe?g|webp|gif|pdf|csv|tsv|xlsx|docx|pptx|html|json|jsonl|txt|xml|zip)$/i.test(file);
  });
  return { packageFiles, logFiles, metadataFiles, possibleArtifactFiles };
}

async function capabilityBuilderRepairDiagnosticEvidence(
  rootPath: string,
  sourceInventory: CapabilityBuilderRemovalPlanResult["sourceInventory"],
): Promise<CapabilityBuilderRepairDiagnosticEvidence> {
  const logFiles = sourceInventory.logFiles;
  const recentLogEntries: CapabilityBuilderRepairDiagnosticEvidence["recentLogEntries"] = [];
  for (const path of logFiles.slice(0, 5)) {
    const absolutePath = resolve(rootPath, path);
    if (!isPathInside(rootPath, absolutePath)) continue;
    try {
      const content = await readFile(absolutePath, "utf8");
      const lines = content.split(/\r?\n/).filter((line) => line.trim());
      recentLogEntries.push({
        path,
        lineCount: lines.length,
        entries: lines.slice(-3).map(summarizeRepairDiagnosticLogLine),
      });
    } catch {
      recentLogEntries.push({ path, lineCount: 0, entries: ["unreadable log file"] });
    }
  }
  return {
    logFiles,
    recommendedReads: logFiles.map((path) => `./${path}`),
    recentLogEntries,
  };
}

function summarizeRepairDiagnosticLogLine(line: string): string {
  const trimmed = line.trim();
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const parts = [
      stringField(parsed.source) ? `source=${stringField(parsed.source)}` : undefined,
      stringField(parsed.status) ? `status=${stringField(parsed.status)}` : undefined,
      parsed.exitCode !== undefined ? `exitCode=${String(parsed.exitCode)}` : undefined,
      stringField(parsed.commandName) ? `commandName=${stringField(parsed.commandName)}` : undefined,
      stringField(parsed.command) ? `command=${stringField(parsed.command)}` : undefined,
      stringField(parsed.error) ? `error=${stringField(parsed.error)}` : undefined,
      stringField(parsed.stderrPreview) ? `stderr=${stringField(parsed.stderrPreview)}` : undefined,
      stringField(parsed.stdoutPreview) ? `stdout=${stringField(parsed.stdoutPreview)}` : undefined,
    ].filter((part): part is string => Boolean(part));
    return redactRepairDiagnosticEvidence(parts.length ? parts.join("; ") : trimmed).slice(0, 800);
  } catch {
    return redactRepairDiagnosticEvidence(trimmed).slice(0, 800);
  }
}

function redactRepairDiagnosticEvidence(value: string): string {
  return redactSensitiveText(value);
}

function emptySourceInventory(): CapabilityBuilderRemovalPlanResult["sourceInventory"] {
  return { packageFiles: [], logFiles: [], metadataFiles: [], possibleArtifactFiles: [] };
}

async function updateValidationManifest(
  rootPath: string,
  validatedAt: string,
  validatedHash: string,
  options: { providerContractValidated?: boolean; logPath?: string; artifacts?: CapabilityBuilderValidationArtifact[] } = {},
): Promise<void> {
  const manifestPath = join(rootPath, "capability-build.json");
  if (!existsSync(manifestPath)) return;
  const errors: string[] = [];
  const manifest = parseJsonObject(await readFile(manifestPath, "utf8"), "capability-build.json", errors);
  if (!manifest || errors.length) return;
  const refs = recordField(manifest.refs);
  manifest.status = "validated";
  manifest.lastValidatedAt = validatedAt;
  if (options.logPath) manifest.lastValidationLogPath = options.logPath;
  manifest.lastValidationArtifacts = options.artifacts ?? [];
  manifest.refs = {
    ...refs,
    lastValidated: await currentGitSha(rootPath),
    lastValidatedHash: validatedHash,
    ...(options.providerContractValidated
      ? { voiceProviderContractValidatedAt: validatedAt, voiceProviderContractValidatedHash: validatedHash }
      : {}),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function updateRegistrationManifest(
  rootPath: string,
  registration: {
    registeredAt: string;
    installedPackageId: string;
    installedSource: string;
    installedVersion?: string;
    gitSha?: string;
    sourcePath: string;
  },
): Promise<void> {
  const manifestPath = join(rootPath, "capability-build.json");
  if (!existsSync(manifestPath)) return;
  const manifest = await readBuildManifest(rootPath);
  const refs = recordField(manifest.refs);
  manifest.status = "registered";
  manifest.registeredAt = registration.registeredAt;
  manifest.installedPackageId = registration.installedPackageId;
  manifest.installedSource = registration.installedSource;
  manifest.sourcePath = registration.sourcePath;
  if (registration.installedVersion) manifest.installedVersion = registration.installedVersion;
  manifest.refs = { ...refs, installed: registration.gitSha ?? null };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function updateUnregistrationManifest(
  rootPath: string,
  unregistration: {
    unregisteredAt: string;
    removedPackageId: string;
    removedSource: string;
    gitSha?: string;
  },
): Promise<void> {
  const manifestPath = join(rootPath, "capability-build.json");
  if (!existsSync(manifestPath)) return;
  const manifest = await readBuildManifest(rootPath);
  const refs = recordField(manifest.refs);
  manifest.status = "unregistered";
  manifest.unregisteredAt = unregistration.unregisteredAt;
  manifest.removedPackageId = unregistration.removedPackageId;
  manifest.removedSource = unregistration.removedSource;
  manifest.installedPackageId = null;
  manifest.installedSource = null;
  manifest.refs = { ...refs, installed: null, lastUnregistered: unregistration.gitSha ?? null };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function updateRepairManifest(
  rootPath: string,
  repair: {
    packageName: string;
    version?: string;
    repairedAt: string;
    reason: string;
    repairGitSha?: string;
  },
): Promise<void> {
  const manifestPath = join(rootPath, "capability-build.json");
  const manifest = await readBuildManifestIfPresent(rootPath) ?? {
    schemaVersion: "ambient-capability-builder-v1",
    name: repair.packageName,
    version: repair.version ?? "0.1.0",
    refs: {},
  };
  const refs = recordField(manifest.refs);
  const repairedInstallerShape = await inferInstallerShapeFromRepairedSource(rootPath);
  manifest.status = "draft";
  if (repairedInstallerShape) manifest.installerShape = repairedInstallerShape;
  manifest.lastRepairedAt = repair.repairedAt;
  manifest.lastRepairReason = repair.reason;
  clearValidationManifestFields(manifest);
  manifest.registeredAt = null;
  manifest.refs = {
    ...refs,
    latest: repair.repairGitSha ?? refs.latest ?? null,
    lastValidated: null,
    lastValidatedHash: null,
    voiceProviderContractValidatedAt: null,
    voiceProviderContractValidatedHash: null,
    lastRepair: repair.repairGitSha ?? refs.lastRepair ?? null,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function invalidateValidationManifest(rootPath: string): Promise<void> {
  const manifestPath = join(rootPath, "capability-build.json");
  const manifest = await readBuildManifestIfPresent(rootPath);
  if (!manifest) return;
  manifest.status = "draft";
  clearValidationManifestFields(manifest);
  const refs = recordField(manifest.refs);
  manifest.refs = {
    ...refs,
    lastValidated: null,
    lastValidatedHash: null,
    voiceProviderContractValidatedAt: null,
    voiceProviderContractValidatedHash: null,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function clearValidationManifestFields(manifest: Record<string, unknown>): void {
  manifest.lastValidatedAt = null;
  manifest.lastValidationLogPath = null;
  manifest.lastValidationArtifacts = [];
}

async function inferInstallerShapeFromRepairedSource(rootPath: string): Promise<CapabilityBuilderInstallerShape | undefined> {
  const descriptorPath = join(rootPath, "ambient-cli.json");
  if (!existsSync(descriptorPath)) return undefined;
  const errors: string[] = [];
  const descriptor = parseJsonObject(await readFile(descriptorPath, "utf8"), "ambient-cli.json", errors);
  if (!descriptor || errors.length) return undefined;
  const commands = recordField(descriptor.commands);
  if (Object.values(commands).some((command) => Object.keys(recordField(recordField(command).voiceProvider)).length > 0)) {
    return "tts-provider";
  }
  return undefined;
}

function selectGeneratedInstalledPackage(
  packages: AmbientCliPackageSummary[],
  selector: { packageId?: string; packageName?: string; installedSource?: string },
): AmbientCliPackageSummary {
  const matches = packages.filter((pkg) => {
    if (!pkg.installed || !pkg.generated) return false;
    if (selector.packageId && pkg.id === selector.packageId) return true;
    if (selector.installedSource && pkg.source === selector.installedSource) return true;
    return Boolean(selector.packageName && pkg.name === selector.packageName);
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Generated Ambient CLI package matched multiple installed packages. Specify installedPackageId.`);
  const target = selector.packageId ?? selector.installedSource ?? selector.packageName ?? "unknown";
  throw new Error(`Generated installed Ambient CLI package was not found: ${target}`);
}

async function readBuildManifest(rootPath: string): Promise<Record<string, unknown>> {
  const manifestPath = join(rootPath, "capability-build.json");
  if (!existsSync(manifestPath)) throw new Error("capability-build.json is required before registration.");
  const errors: string[] = [];
  const manifest = parseJsonObject(await readFile(manifestPath, "utf8"), "capability-build.json", errors);
  if (!manifest || errors.length) throw new Error(`capability-build.json is invalid: ${errors.join("; ")}`);
  return manifest;
}

async function readBuildManifestIfPresent(rootPath: string): Promise<Record<string, unknown> | undefined> {
  const manifestPath = join(rootPath, "capability-build.json");
  if (!existsSync(manifestPath)) return undefined;
  const errors: string[] = [];
  const manifest = parseJsonObject(await readFile(manifestPath, "utf8"), "capability-build.json", errors);
  return manifest && !errors.length ? manifest : undefined;
}

function summarizeBuildManifest(manifest: Record<string, unknown>): NonNullable<CapabilityBuilderUpdatePlanResult["buildManifest"]> {
  const refs = Object.fromEntries(
    Object.entries(recordField(manifest.refs))
      .filter(([, value]) => value === null || typeof value === "string")
      .map(([key, value]) => [key, value as string | null]),
  );
  return {
    ...(stringField(manifest.status) ? { status: stringField(manifest.status) } : {}),
    ...(stringField(manifest.goal) ? { goal: stringField(manifest.goal) } : {}),
    ...(installerShapeFromManifest(manifest) ? { installerShape: installerShapeFromManifest(manifest) } : {}),
    ...(stringField(manifest.kind) ? { kind: stringField(manifest.kind) } : {}),
    ...(stringField(manifest.provider) ? { provider: stringField(manifest.provider) } : {}),
    ...(stringField(manifest.version) ? { version: stringField(manifest.version) } : {}),
    ...(stringField(manifest.sourcePath) ? { sourcePath: stringField(manifest.sourcePath) } : {}),
    ...(stringField(manifest.installedPackageId) ? { installedPackageId: stringField(manifest.installedPackageId) } : {}),
    ...(stringField(manifest.installedSource) ? { installedSource: stringField(manifest.installedSource) } : {}),
    refs,
  };
}

function validationEvidenceFromManifest(manifest: Record<string, unknown> | undefined): CapabilityBuilderValidationEvidence {
  if (!manifest) return { artifacts: [] };
  const refs = recordField(manifest.refs);
  const validatedAt = stringField(manifest.lastValidatedAt);
  const sourceGitSha = stringField(refs.lastValidated);
  const sourceHash = stringField(refs.lastValidatedHash);
  if (!validatedAt || !sourceHash) return { artifacts: [] };
  return {
    validatedAt,
    ...(sourceGitSha ? { sourceGitSha } : {}),
    sourceHash,
    ...(stringField(manifest.lastValidationLogPath) ? { logPath: stringField(manifest.lastValidationLogPath) } : {}),
    artifacts: validationArtifactsFromManifest(manifest.lastValidationArtifacts),
  };
}

function validationArtifactsFromManifest(value: unknown): CapabilityBuilderValidationArtifact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = recordField(item);
    const path = stringField(record.path);
    const sizeBytes = typeof record.sizeBytes === "number" && Number.isFinite(record.sizeBytes) ? Math.max(0, Math.floor(record.sizeBytes)) : undefined;
    return path && sizeBytes !== undefined ? [{ path, sizeBytes }] : [];
  });
}

function installerShapeFromManifest(manifest: Record<string, unknown> | undefined): CapabilityBuilderInstallerShape | undefined {
  const value = stringField(manifest?.installerShape);
  return parseCapabilityBuilderInstallerShape(value);
}

function parseCapabilityBuilderInstallerShape(value: string | undefined): CapabilityBuilderInstallerShape | undefined {
  if (
    value === "tts-provider" ||
    value === "artifact-generator" ||
    value === "file-converter" ||
    value === "search-provider" ||
    value === "browser-tooling" ||
    value === "connector" ||
    value === "custom-cli"
  ) {
    return value;
  }
  return undefined;
}

function capabilityBuilderInstallerRecoveryGuidance(): string[] {
  return [
    "Classify the failure before repair: missing binary, missing model/data asset, missing dynamic library, wrong architecture, unsupported platform, permission/privilege boundary, hardcoded or compiled-in path, package-manager/runtime mismatch, or stdout/file-artifact contract mismatch.",
    "Discover paths with exact executable locations and versions, dynamic-library dependencies, package/module install paths, model/data cache paths, documented environment variables/config/CLI flags, and generated validation/dependency logs.",
    "Prefer provider-local paths under the Builder package when supported, then documented env/config/CLI path controls, then workspace-local shims/symlinks/caches/vendored assets that avoid system mutation.",
    "Use system package managers only through an approved dependency plan with exact executable, args, cwd, and rationale.",
    "If repair requires a protected system path, service install, driver, package-manager privilege, or admin/sudo credential, stop and call ambient_privileged_action_request with a typed template; do not ask the user to copy commands into Terminal or expose credentials to Pi.",
    "After one failed repair for the same failure class, stop repeated guessing and re-run diagnosis against capability-validation-log.jsonl and dependency stdout/stderr artifacts.",
  ];
}

function capabilityBuilderInstallerRecoveryTemplates(): CapabilityBuilderInstallerRecoveryTemplate[] {
  return [
    {
      id: "python-native-data-path",
      label: "Python native library/data path",
      appliesWhen: "A Python package, wheel, or native dynamic library cannot find bundled data files, shared libraries, or compiled-in runtime paths.",
      steps: [
        "Inspect the exact Python executable, package import path, site-packages path, dynamic library path, and data directory expected by the failing stack trace.",
        "Prefer provider-local model/data/library paths under the Builder package and documented environment variables before patching wrapper code.",
        "If the runtime path is compiled in, try a wrapper-level documented data-path API or workspace-local shim before requesting system path mutation.",
        "If only a protected system path or admin symlink can satisfy the runtime, call ambient_privileged_action_request with the exact source/target paths and rationale.",
      ],
      privilegedBoundary: "protected system path, system package install, dynamic-library loader path requiring admin write",
    },
    {
      id: "node-native-module",
      label: "Node native module rebuild",
      appliesWhen: "A Node package fails because a native module is missing, built for the wrong architecture, or incompatible with the current Node ABI.",
      steps: [
        "Inspect node version, platform, architecture, package manager lockfile, native module package name, and the exact ABI error from stdout/stderr artifacts.",
        "Prefer package-local reinstall/rebuild commands with explicit cwd and rationale through ambient_capability_builder_install_deps.",
        "Pin compatible dependency versions in package metadata instead of post-processing generated output or hiding the error.",
        "Request a privileged handoff only for true system package prerequisites or protected install locations.",
      ],
      privilegedBoundary: "system build tools/package install requiring admin rights",
    },
    {
      id: "local-model-assets",
      label: "Local model runtime assets",
      appliesWhen: "A local model provider is missing model weights, tokenizers, voice/style files, caches, or runtime asset metadata.",
      steps: [
        "Inspect declared modelAssets, actual package model/cache directories, download URLs, file sizes, checksums when available, and validation logs.",
        "Prefer deterministic provider-local downloads into the Builder package or a documented Ambient cache path, not hidden global caches.",
        "Update health checks and smoke tests to fail clearly when assets are absent and to validate tiny real inference when assets are present.",
        "Do not request privileged setup for model downloads unless a platform runtime genuinely requires protected-path installation.",
      ],
      privilegedBoundary: "rare; only protected runtime/model install locations or driver/service setup",
    },
    {
      id: "system-binary-wrapper",
      label: "System binary wrapper",
      appliesWhen: "A capability wraps an existing platform binary, package-manager executable, browser/runtime binary, or CLI installed outside the Builder package.",
      steps: [
        "Inspect executable location, version, architecture, license/source expectation, and whether the binary can be bundled or installed locally.",
        "Prefer a managed local binary under the Builder package when licensing and size allow, otherwise declare the dependency and health-check the exact binary.",
        "Use approved dependency plans for user-level package-manager installs and show exact executable, args, cwd, and rationale.",
        "If installation needs admin rights, service registration, driver setup, or protected directories, call ambient_privileged_action_request instead of shelling out to sudo.",
      ],
      privilegedBoundary: "admin package install, service registration, driver setup, protected binary directory",
    },
    {
      id: "stdout-vs-file-artifact-contract",
      label: "Stdout versus file artifact contract",
      appliesWhen: "Validation expects a declared file artifact but the command intentionally returns concise JSON, Markdown, or text on stdout.",
      steps: [
        "Inspect ambient-cli.json artifacts.outputTypes, responseFormats, command stdout behavior, and smoke test output paths.",
        "For search/API/text providers, put JSON/Markdown/text response shape in responseFormats and remove file artifact declarations unless files are intentionally written.",
        "For artifact generators, make the smoke test write or update a fresh declared artifact path and return concise metadata.",
        "Re-run validation only after the descriptor and smoke test agree on whether output is stdout or a file artifact.",
      ],
      privilegedBoundary: "none; this is a contract repair, not an admin-action case",
    },
  ];
}

async function packageContentHash(rootPath: string): Promise<string> {
  const hash = createHash("sha256");
  const files = [...(await listPackageFiles(rootPath)).keys()]
    .filter((file) => !isCapabilityBuilderMetadataFile(file))
    .sort();
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(await readFile(join(rootPath, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function isCapabilityBuilderMetadataFile(file: string): boolean {
  return file === "capability-build.json" || file === "capability-deps-log.jsonl" || file === "capability-validation-log.jsonl";
}

function normalizeRepairFile(
  rootPath: string,
  file: CapabilityBuilderRepairFileInput,
  index: number,
): CapabilityBuilderRepairFileInput & { absolutePath: string } {
  const path = file.path.trim();
  if (!path) throw new Error(`files[${index}].path is required.`);
  if (path.includes("\0")) throw new Error(`Repair file path contains unsupported characters: ${path}`);
  if (resolve(path) === path) throw new Error(`Repair file path must be package-relative: ${path}`);
  const absolutePath = resolve(rootPath, path);
  const relativePath = relative(rootPath, absolutePath);
  if (!relativePath || relativePath.startsWith("..") || relativePath === "." || !isPathInside(rootPath, absolutePath)) {
    throw new Error(`Repair file path escapes the package root: ${path}`);
  }
  if (relativePath === ".git" || relativePath.startsWith(".git/")) throw new Error(`Repair cannot edit package Git metadata: ${path}`);
  if (isCapabilityBuilderMetadataFile(relativePath)) {
    throw new Error(`Repair cannot directly edit Capability Builder metadata or logs: ${path}`);
  }
  if (relativePath.startsWith("node_modules/")) throw new Error(`Repair cannot write node_modules content directly: ${path}`);
  const rationale = file.rationale.trim();
  if (!rationale) throw new Error(`files[${index}].rationale is required.`);
  return { path: relativePath, content: file.content, rationale, absolutePath };
}

function normalizeBuilderTextFilePath(
  rootPath: string,
  filePath: string,
  options: { allowBuilderMetadata?: boolean } = {},
): { path: string; absolutePath: string } {
  const path = filePath.trim();
  if (!path) throw new Error("filePath is required.");
  if (path.includes("\0")) throw new Error(`Capability Builder file path contains unsupported characters: ${path}`);
  if (isAbsolute(path)) throw new Error(`Capability Builder file path must be package-relative: ${path}`);
  const absolutePath = resolve(rootPath, path);
  const relativePath = relative(rootPath, absolutePath);
  if (!relativePath || relativePath.startsWith("..") || relativePath === "." || !isPathInside(rootPath, absolutePath)) {
    throw new Error(`Capability Builder file path escapes the package root: ${path}`);
  }
  if (relativePath === ".git" || relativePath.startsWith(".git/")) {
    throw new Error(`Capability Builder file tools cannot access package Git metadata: ${path}`);
  }
  if (!options.allowBuilderMetadata && isCapabilityBuilderMetadataFile(relativePath)) {
    throw new Error(`Capability Builder file tools cannot directly edit Builder metadata or logs: ${path}`);
  }
  if (relativePath.startsWith("node_modules/")) {
    throw new Error(`Capability Builder file tools cannot access node_modules content directly: ${path}`);
  }
  return { path: relativePath, absolutePath };
}

function capabilityBuilderSourceRef(managedWorkspace: string, rootPath: string, packageName: string): CapabilityBuilderSourceRef {
  const relativeRootPath = toWorkspaceRelative(managedWorkspace, rootPath);
  return {
    kind: "capability-builder-source",
    packageName,
    workspacePath: managedWorkspace,
    rootPath,
    relativeRootPath,
    sourcePath: relativeRootPath,
  };
}

function scaffoldFiles(name: string, input: CapabilityBuilderScaffoldInput): Array<{ path: string; content: string }> {
  const commandName = commandNameFromPackage(name);
  const description = input.goal.trim();
  if (isPiperVoiceProviderScaffold(input)) return piperVoiceProviderScaffoldFiles(name, commandName, description, input);
  if (isKokoroOnnxVoiceProviderScaffold(input)) return kokoroOnnxVoiceProviderScaffoldFiles(name, commandName, description, input);
  if (isElevenLabsVoiceProviderScaffold(input)) return elevenLabsVoiceProviderScaffoldFiles(name, commandName, description);
  if (isCartesiaVoiceProviderScaffold(input)) return cartesiaVoiceProviderScaffoldFiles(name, commandName, description);
  if (normalizedInstallerShape(input) === "tts-provider") return genericTtsProviderScaffoldFiles(name, commandName, description, input);
  const outputTypes = input.outputArtifactTypes ?? [];
  const isSearchProvider = normalizedInstallerShape(input) === "search-provider";
  const responseFormats = input.responseFormats?.length ? input.responseFormats : isSearchProvider ? defaultSearchProviderResponseFormats(input) : [];
  return [
    {
      path: "ambient-cli.json",
      content: `${JSON.stringify(
        {
          name,
          version: "0.1.0",
          description,
          skills: "./SKILL.md",
          commands: {
            [commandName]: {
              description: `Draft command for ${description}`,
              command: "node",
              args: ["./scripts/run.mjs"],
              cwd: "package",
              healthCheck: ["node", "./scripts/run.mjs", "--health"],
            },
          },
          env: [],
          ...(responseFormats.length ? { responseFormats } : {}),
          artifacts: {
            outputTypes,
            policy: isSearchProvider && !outputTypes.length
              ? "return concise JSON/text in stdout; only write files for explicit export or large-output requests"
              : "write large or binary outputs to files and return artifact paths",
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      content: [
        "---",
        `name: ${name}`,
        `description: ${description}`,
        "---",
        "",
        `Use this capability when the user asks to ${description.toLowerCase()}.`,
        "",
        `Run the \`${commandName}\` command through \`ambient_cli\` after describing this package.`,
        isSearchProvider && !outputTypes.length
          ? `Return concise search results on stdout by default${responseFormats.length ? ` (${responseFormats.join(", ")})` : ""}. Do not declare file artifacts unless the command intentionally writes output files.`
          : "Keep stdout concise. For generated media or large outputs, write files and return artifact paths.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/run.mjs",
      content: [
        "#!/usr/bin/env node",
        "if (process.argv.includes('--health')) {",
        "  process.stdout.write('ok\\n');",
        "  process.exit(0);",
        "}",
        "process.stdout.write('Draft capability scaffold. Implement command behavior before registration.\\n');",
        "",
      ].join("\n"),
    },
    {
      path: "tests/smoke.test.mjs",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { execFileSync } from 'node:child_process';",
        "",
        "const output = execFileSync(process.execPath, ['./scripts/run.mjs', '--health'], { encoding: 'utf8' });",
        "assert.equal(output, 'ok\\n');",
        "",
      ].join("\n"),
    },
  ];
}

function defaultSearchProviderResponseFormats(input: Pick<CapabilityBuilderScaffoldInput, "goal">): string[] {
  return /\bjson\b/i.test(input.goal) ? ["JSON"] : ["text"];
}

function normalizedInstallerShape(input: Pick<CapabilityBuilderScaffoldInput, "installerShape" | "kind" | "goal">): CapabilityBuilderInstallerShape | undefined {
  if (input.installerShape) return input.installerShape;
  const kindText = (input.kind ?? "").toLowerCase();
  const goalText = input.goal.toLowerCase();
  if (kindText.includes("tts-provider") || kindText.includes("voice provider") || goalText.includes("tts-provider") || goalText.includes("voice provider")) {
    return "tts-provider";
  }
  if (kindText.includes("search-provider") || kindText.includes("search provider")) return "search-provider";
  if (kindText.includes("connector")) return "connector";
  if (kindText.includes("artifact")) return "artifact-generator";
  return undefined;
}

function isPiperVoiceProviderScaffold(input: CapabilityBuilderScaffoldInput): boolean {
  const providerText = (input.provider ?? "").toLowerCase();
  const kindText = (input.kind ?? "").toLowerCase();
  const goalText = input.goal.toLowerCase();
  return (
    (providerText.includes("piper") || goalText.includes("piper")) &&
    (normalizedInstallerShape(input) === "tts-provider" || kindText.includes("voice provider") || kindText.includes("tts-provider") || goalText.includes("voice provider") || goalText.includes("tts-provider"))
  );
}

function isKokoroOnnxVoiceProviderScaffold(input: CapabilityBuilderScaffoldInput): boolean {
  const providerText = (input.provider ?? "").toLowerCase();
  const kindText = (input.kind ?? "").toLowerCase();
  const goalText = input.goal.toLowerCase();
  return (
    (providerText.includes("kokoro") || providerText.includes("onnx") || goalText.includes("kokoro onnx") || goalText.includes("kokoro-onnx")) &&
    (normalizedInstallerShape(input) === "tts-provider" || kindText.includes("voice provider") || kindText.includes("tts-provider") || goalText.includes("voice provider") || goalText.includes("tts-provider"))
  );
}

function isElevenLabsVoiceProviderScaffold(input: CapabilityBuilderScaffoldInput): boolean {
  const providerText = (input.provider ?? "").toLowerCase();
  const goalText = input.goal.toLowerCase();
  return normalizedInstallerShape(input) === "tts-provider" && (providerText.includes("eleven") || goalText.includes("elevenlabs") || goalText.includes("eleven labs"));
}

function isCartesiaVoiceProviderScaffold(input: CapabilityBuilderScaffoldInput): boolean {
  const providerText = (input.provider ?? "").toLowerCase();
  const goalText = input.goal.toLowerCase();
  return normalizedInstallerShape(input) === "tts-provider" && (providerText.includes("cartesia") || goalText.includes("cartesia"));
}

function genericTtsProviderScaffoldFiles(
  name: string,
  commandName: string,
  description: string,
  input: CapabilityBuilderScaffoldInput,
): Array<{ path: string; content: string }> {
  const providerLabel = input.provider?.trim() || name.replace(/^ambient-/, "").split("-").map(capitalize).join(" ");
  const format = defaultVoiceFormat(input.outputArtifactTypes);
  const env = (input.envNames ?? []).map((envName) => ({ name: envName, required: true, description: `${providerLabel} credential or runtime setting.` }));
  const local = input.locality === "local" ? true : input.locality === "network" ? false : undefined;
  return [
    {
      path: "ambient-cli.json",
      content: `${JSON.stringify(
        {
          name,
          version: "0.1.0",
          description,
          skills: "./SKILL.md",
          commands: {
            [commandName]: {
              description: `Synthesize assistant voice audio with ${providerLabel}.`,
              command: "node",
              args: ["./scripts/run.mjs"],
              cwd: "package",
              healthCheck: ["node", "./scripts/run.mjs", "--health"],
              voiceProvider: {
                label: `${providerLabel} Voice Provider`,
                defaultFormat: format,
                formats: [format],
                voices: [{ id: "default", label: "Default voice" }],
                ...(local !== undefined ? { local } : {}),
              },
            },
          },
          ...(env.length ? { env } : {}),
          artifacts: {
            outputTypes: [format.toUpperCase()],
            policy: "write audio to the requested output path and return concise JSON metadata",
          },
          ...(input.networkHosts?.length ? { networkHosts: input.networkHosts } : {}),
          ...(input.modelAssets?.length ? { modelAssets: input.modelAssets } : {}),
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      content: [
        "---",
        `name: ${name}`,
        `description: ${description}`,
        "---",
        "",
        `Use this Ambient voice provider when the user wants Ambient to speak assistant replies through ${providerLabel}.`,
        "",
        "## Contract",
        "",
        `The \`${commandName}\` command must implement Ambient's tts-provider contract:`,
        "",
        "- accept `--text <text>` or `--text-file <path>`, `--output <path>`, `--format <wav|mp3|ogg>`, and optional `--voice <id>`",
        "- write audio to the exact requested output path",
        "- print concise JSON metadata with `audioPath`, `mimeType`, optional `durationMs`, `providerId`, and `voiceId`",
        "- never print API keys, base64 audio, long provider responses, or transcript-sized content",
        "",
        "This generated package is a provider scaffold. Keep the descriptor `voiceProvider` metadata aligned with the wrapper behavior before validation and registration.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/run.mjs",
      content: genericTtsProviderRunScript(providerLabel, format, input.envNames ?? []),
    },
    {
      path: "tests/smoke.test.mjs",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { execFileSync } from 'node:child_process';",
        "",
        "const output = execFileSync(process.execPath, ['./scripts/run.mjs', '--health'], { encoding: 'utf8' });",
        "assert.match(output, /ok/);",
        "",
      ].join("\n"),
    },
  ];
}

function elevenLabsVoiceProviderScaffoldFiles(
  name: string,
  commandName: string,
  description: string,
): Array<{ path: string; content: string }> {
  return cloudVoiceProviderScaffoldFiles({
    name,
    commandName,
    description,
    providerId: "elevenlabs",
    providerLabel: "ElevenLabs",
    envName: "ELEVENLABS_API_KEY",
    host: "api.elevenlabs.io",
    defaultFormat: "mp3",
    outputType: "MP3",
    defaultVoiceId: "21m00Tcm4TlvDq8ikWAM",
    defaultVoiceLabel: "Rachel",
    script: elevenLabsVoiceProviderRunScript(),
    notes: [
      "Uses `POST /v1/text-to-speech/{voice_id}` with the smallest practical validation text.",
      "Default output is MP3 (`mp3_44100_128`) because ElevenLabs returns MP3 bytes directly for this endpoint.",
    ],
  });
}

function cartesiaVoiceProviderScaffoldFiles(
  name: string,
  commandName: string,
  description: string,
): Array<{ path: string; content: string }> {
  return cloudVoiceProviderScaffoldFiles({
    name,
    commandName,
    description,
    providerId: "cartesia",
    providerLabel: "Cartesia",
    envName: "CARTESIA_API_KEY",
    host: "api.cartesia.ai",
    defaultFormat: "wav",
    outputType: "WAV",
    defaultVoiceId: "a0e99841-438c-4a64-b679-ae501e7d6091",
    defaultVoiceLabel: "Default Cartesia voice",
    script: cartesiaVoiceProviderRunScript(),
    notes: [
      "Uses `POST /tts/bytes` with `Cartesia-Version: 2025-04-16` and a tiny transcript.",
      "Default output is WAV/PCM so Ambient can validate a simple non-empty audio artifact.",
    ],
  });
}

function cloudVoiceProviderScaffoldFiles(input: {
  name: string;
  commandName: string;
  description: string;
  providerId: string;
  providerLabel: string;
  envName: string;
  host: string;
  defaultFormat: "mp3" | "wav" | "ogg";
  outputType: string;
  defaultVoiceId: string;
  defaultVoiceLabel: string;
  script: string;
  notes: string[];
}): Array<{ path: string; content: string }> {
  return [
    {
      path: "ambient-cli.json",
      content: `${JSON.stringify(
        {
          name: input.name,
          version: "0.1.0",
          description: input.description,
          skills: "./SKILL.md",
          commands: {
            [input.commandName]: {
              description: `Synthesize assistant voice audio with ${input.providerLabel}.`,
              command: "node",
              args: ["./scripts/run.mjs"],
              cwd: "package",
              healthCheck: ["node", "./scripts/run.mjs", "--health"],
              voiceProvider: {
                label: `${input.providerLabel} Voice Provider`,
                defaultFormat: input.defaultFormat,
                formats: [input.defaultFormat],
                voices: [{ id: input.defaultVoiceId, label: input.defaultVoiceLabel }],
                local: false,
                voiceDiscovery: {
                  command: input.commandName,
                  cacheTtlSeconds: 86400,
                  requiresNetwork: true,
                  requiresSecret: [input.envName],
                  source: "cloud-api",
                },
                voiceCloning: {
                  supported: true,
                  createCommand: input.commandName,
                  statusCommand: input.commandName,
                  deleteCommand: input.commandName,
                  mode: "cloud",
                  inputs: {
                    audioFormats: ["mp3", "wav", "m4a", "webm"],
                    minDurationSeconds: 30,
                    maxDurationSeconds: 1800,
                    minSamples: 1,
                    transcript: "optional",
                  },
                  requiresConsent: true,
                  requiresSecret: [input.envName],
                  networkHosts: [input.host],
                  costNote: "Voice cloning may consume provider credits depending on account plan and provider policy.",
                  privacyNote: "Source audio is uploaded to the cloud provider only during a separately approved clone workflow.",
                  output: {
                    creates: ["provider-voice-id", "dynamic-cache-voice"],
                    appearsInDynamicCatalog: true,
                  },
                },
              },
            },
          },
          env: [{ name: input.envName, required: true, description: `${input.providerLabel} API key.` }],
          networkHosts: [input.host],
          artifacts: {
            outputTypes: [input.outputType],
            policy: "write audio to the requested output path and return concise JSON metadata",
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      content: [
        "---",
        `name: ${input.name}`,
        `description: ${input.description}`,
        "---",
        "",
        `Use this Ambient voice provider when the user wants Ambient to speak assistant replies through ${input.providerLabel}.`,
        "",
        "## Contract",
        "",
        `Run \`${input.commandName}\` through Ambient's voice runtime or \`ambient_cli\` with \`--text <text>\` or \`--text-file <path>\`, \`--output <path>\`, \`--format ${input.defaultFormat}\`, and optional \`--voice <id>\`.`,
        `Requires Ambient-managed secret binding for \`${input.envName}\`; never ask the user to paste API keys into chat.`,
        ...input.notes,
        "Keep stdout to concise JSON metadata: `audioPath`, `mimeType`, `providerId`, and `voiceId`. Put binary audio in the requested output path.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/run.mjs",
      content: input.script,
    },
    {
      path: "tests/smoke.test.mjs",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { execFileSync, spawnSync } from 'node:child_process';",
        "",
        "if (process.env.AMBIENT_LIVE_TTS_SMOKE === '1') {",
        `  const format = process.env.AMBIENT_LIVE_TTS_FORMAT || ${JSON.stringify(input.defaultFormat)};`,
        "  const result = spawnSync(process.execPath, ['./scripts/run.mjs', '--text', 'Ambient smoke.', '--output', `ambient-live-smoke.${format}`, '--format', format], { encoding: 'utf8' });",
        "  assert.equal(result.status, 0, result.stderr);",
        "  assert.match(result.stdout, /audioPath/);",
        "} else {",
        "  const output = execFileSync(process.execPath, ['./scripts/run.mjs', '--health'], { encoding: 'utf8' });",
        "  assert.match(output, /ok/);",
        "}",
        "",
      ].join("\n"),
    },
  ];
}

function defaultVoiceFormat(outputArtifactTypes: string[] | undefined): "mp3" | "wav" | "ogg" {
  for (const type of outputArtifactTypes ?? []) {
    const normalized = normalizeVoiceOutputFormat(type);
    if (normalized) return normalized;
  }
  return "wav";
}

function capitalize(value: string): string {
  return value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : value;
}

function genericTtsProviderRunScript(providerLabel: string, defaultFormat: "mp3" | "wav" | "ogg", envNames: string[]): string {
  return [
    "#!/usr/bin/env node",
    "import { existsSync, readFileSync } from 'node:fs';",
    "import { isAbsolute, resolve } from 'node:path';",
    "",
    `const PROVIDER_LABEL = ${JSON.stringify(providerLabel)};`,
    `const DEFAULT_FORMAT = ${JSON.stringify(defaultFormat)};`,
    `const REQUIRED_ENV = ${JSON.stringify(envNames)};`,
    "",
    "function parseArgs(argv) {",
    "  const options = { text: '', textFile: '', output: '', format: DEFAULT_FORMAT, voice: 'default', health: false, help: false };",
    "  for (let i = 2; i < argv.length; i += 1) {",
    "    const arg = argv[i];",
    "    if (arg === '--health') options.health = true;",
    "    else if (arg === '--help' || arg === '-h') options.help = true;",
    "    else if (arg === '--text') options.text = argv[++i] ?? '';",
    "    else if (arg === '--text-file') options.textFile = argv[++i] ?? '';",
    "    else if (arg === '--output') options.output = argv[++i] ?? '';",
    "    else if (arg === '--format') options.format = argv[++i] ?? DEFAULT_FORMAT;",
    "    else if (arg === '--voice') options.voice = argv[++i] ?? 'default';",
    "  }",
    "  return options;",
    "}",
    "",
    "function resolveInputPath(path) {",
    "  const roots = [process.cwd(), process.env.AMBIENT_WORKSPACE_PATH, process.env.AMBIENT_DESKTOP_WORKSPACE].filter(Boolean);",
    "  const candidates = isAbsolute(path) ? [path] : [path, ...roots.map((root) => resolve(root, path))];",
    "  for (const candidate of [...new Set(candidates)]) {",
    "    if (existsSync(candidate)) return candidate;",
    "  }",
    "  return resolve(path);",
    "}",
    "",
    "function loadTextInput(options) {",
    "  if (options.text) return options.text;",
    "  if (!options.textFile) return '';",
    "  try {",
    "    return readFileSync(resolveInputPath(options.textFile), 'utf8');",
    "  } catch (error) {",
    "    process.stderr.write(`Unable to read --text-file ${options.textFile}: ${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(2);",
    "  }",
    "}",
    "",
    "function missingEnv() {",
    "  return REQUIRED_ENV.filter((name) => !process.env[name]);",
    "}",
    "",
    "function mimeType(format) {",
    "  if (format === 'mp3') return 'audio/mpeg';",
    "  if (format === 'ogg') return 'audio/ogg';",
    "  return 'audio/wav';",
    "}",
    "",
    "const options = parseArgs(process.argv);",
    "if (options.help) {",
    "  process.stdout.write('Usage: provider (--text <text> | --text-file <path>) --output <path> --format <wav|mp3|ogg> [--voice <id>]\\n');",
    "  process.exit(0);",
    "}",
    "",
    "const missing = missingEnv();",
    "if (options.health) {",
    "  if (missing.length) {",
    "    process.stderr.write(`Missing required env ${missing.join(', ')}; use Ambient-managed secret binding before validation.\\n`);",
    "    process.exit(7);",
    "  }",
    "  process.stdout.write('ok\\n');",
    "  process.exit(0);",
    "}",
    "",
    "const synthesisText = loadTextInput(options);",
    "if (!synthesisText) {",
    "  process.stderr.write('Missing --text or --text-file for Ambient tts-provider synthesis.\\n');",
    "  process.exit(2);",
    "}",
    "if (!options.output) {",
    "  process.stderr.write('Missing --output for Ambient tts-provider synthesis.\\n');",
    "  process.exit(2);",
    "}",
    "if (!['wav', 'mp3', 'ogg'].includes(options.format)) {",
    "  process.stderr.write(`Unsupported --format: ${options.format}\\n`);",
    "  process.exit(2);",
    "}",
    "if (missing.length) {",
    "  process.stderr.write(`Missing required env ${missing.join(', ')}; use Ambient-managed secret binding before validation.\\n`);",
    "  process.exit(7);",
    "}",
    "",
    "const audioPath = resolve(options.output);",
    "process.stderr.write(`${PROVIDER_LABEL} scaffold has not implemented provider synthesis yet. Fill in scripts/run.mjs with the provider API/binary call, write audio to ${audioPath}, then return JSON metadata.\\n`);",
    "process.stdout.write(JSON.stringify({ audioPath, mimeType: mimeType(options.format), providerId: PROVIDER_LABEL.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), voiceId: options.voice, implemented: false }) + '\\n');",
    "process.exit(3);",
    "",
  ].join("\n");
}

function cloudProviderSharedRunScript(): string[] {
  return [
    "#!/usr/bin/env node",
    "import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';",
    "import { basename, dirname, isAbsolute, resolve } from 'node:path';",
    "",
    "function parseArgs(argv) {",
    "  const options = { text: '', textFile: '', output: '', format: '', voice: '', health: false, listVoices: false, cloneCreate: false, cloneStatus: false, cloneDelete: false, cloneName: '', voiceId: '', sourceAudio: [], notes: '', help: false };",
    "  for (let i = 2; i < argv.length; i += 1) {",
    "    const arg = argv[i];",
    "    if (arg === '--health') options.health = true;",
    "    else if (arg === '--list-voices') options.listVoices = true;",
    "    else if (arg === '--clone-create') options.cloneCreate = true;",
    "    else if (arg === '--clone-status') options.cloneStatus = true;",
    "    else if (arg === '--clone-delete') options.cloneDelete = true;",
    "    else if (arg === '--help' || arg === '-h') options.help = true;",
    "    else if (arg === '--text') options.text = argv[++i] ?? '';",
    "    else if (arg === '--text-file') options.textFile = argv[++i] ?? '';",
    "    else if (arg === '--output') options.output = argv[++i] ?? '';",
    "    else if (arg === '--format') options.format = argv[++i] ?? '';",
    "    else if (arg === '--voice') options.voice = argv[++i] ?? '';",
    "    else if (arg === '--voice-id') options.voiceId = argv[++i] ?? '';",
    "    else if (arg === '--clone-name') options.cloneName = argv[++i] ?? '';",
    "    else if (arg === '--source-audio') options.sourceAudio.push(argv[++i] ?? '');",
    "    else if (arg === '--notes') options.notes = argv[++i] ?? '';",
    "  }",
    "  return options;",
    "}",
    "",
    "function resolveInputPath(path) {",
    "  const roots = [process.cwd(), process.env.AMBIENT_WORKSPACE_PATH, process.env.AMBIENT_DESKTOP_WORKSPACE].filter(Boolean);",
    "  const candidates = isAbsolute(path) ? [path] : [path, ...roots.map((root) => resolve(root, path))];",
    "  for (const candidate of [...new Set(candidates)]) {",
    "    if (existsSync(candidate)) return candidate;",
    "  }",
    "  return resolve(path);",
    "}",
    "",
    "function loadTextInput(options) {",
    "  if (options.text) return options.text;",
    "  if (!options.textFile) return '';",
    "  try {",
    "    return readFileSync(resolveInputPath(options.textFile), 'utf8');",
    "  } catch (error) {",
    "    process.stderr.write(`Unable to read --text-file ${options.textFile}: ${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(2);",
    "  }",
    "}",
    "",
    "function requireEnv(name) {",
    "  const value = process.env[name]?.trim();",
    "  if (!value) {",
    "    process.stderr.write(`Missing required env ${name}; use Ambient-managed secret binding before validation.\\n`);",
    "    process.exit(7);",
    "  }",
    "  return value;",
    "}",
    "",
    "function requireSynthesisArgs(options, expectedFormat) {",
    "  const text = loadTextInput(options);",
    "  if (!text) { process.stderr.write('Missing --text or --text-file for Ambient tts-provider synthesis.\\n'); process.exit(2); }",
    "  if (!options.output) { process.stderr.write('Missing --output for Ambient tts-provider synthesis.\\n'); process.exit(2); }",
    "  if ((options.format || expectedFormat) !== expectedFormat) { process.stderr.write(`Unsupported --format: ${options.format}; expected ${expectedFormat}.\\n`); process.exit(2); }",
    "  return text;",
    "}",
    "",
    "async function postBytes(url, init) {",
    "  const response = await fetch(url, init);",
    "  const bytes = Buffer.from(await response.arrayBuffer());",
    "  if (!response.ok) {",
    "    const body = bytes.toString('utf8').slice(0, 800);",
    "    throw new Error(`Provider request failed (${response.status}): ${body}`);",
    "  }",
    "  return bytes;",
    "}",
    "",
    "async function getJson(url, init) {",
    "  const response = await fetch(url, init);",
    "  const text = await response.text();",
    "  if (!response.ok) {",
    "    throw new Error(`Provider request failed (${response.status}): ${text.slice(0, 800)}`);",
    "  }",
    "  return text ? JSON.parse(text) : {};",
    "}",
    "",
    "function writeAudio(output, bytes) {",
    "  const audioPath = resolve(output);",
    "  mkdirSync(dirname(audioPath), { recursive: true });",
    "  writeFileSync(audioPath, bytes);",
    "  return audioPath;",
    "}",
    "",
    "function requireCloneArgs(options) {",
    "  if (!options.cloneName) { process.stderr.write('Missing --clone-name for Ambient voice clone creation.\\n'); process.exit(2); }",
    "  if (!options.sourceAudio.length) { process.stderr.write('Missing --source-audio for Ambient voice clone creation.\\n'); process.exit(2); }",
    "}",
    "",
    "function requireVoiceId(options) {",
    "  if (!options.voiceId) { process.stderr.write('Missing --voice-id for Ambient voice clone management.\\n'); process.exit(2); }",
    "}",
    "",
    "function appendAudioFiles(form, fieldName, paths) {",
    "  for (const path of paths) {",
    "    const absolutePath = resolve(path);",
    "    const bytes = readFileSync(absolutePath);",
    "    form.append(fieldName, new Blob([bytes]), basename(absolutePath));",
    "  }",
    "}",
  ];
}

function elevenLabsVoiceProviderRunScript(): string {
  return [
    ...cloudProviderSharedRunScript(),
    "",
    "const ENV_NAME = 'ELEVENLABS_API_KEY';",
    "const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';",
    "const FORMAT = 'mp3';",
    "const options = parseArgs(process.argv);",
    "if (options.help) { process.stdout.write('Usage: elevenlabs (--text <text> | --text-file <path>) --output <path.mp3> --format mp3 [--voice <id>] [--list-voices] [--clone-create --clone-name <name> --source-audio <path>] [--clone-status --voice-id <id>] [--clone-delete --voice-id <id>]\\n'); process.exit(0); }",
    "const apiKey = requireEnv(ENV_NAME);",
    "if (options.health) { process.stdout.write(JSON.stringify({ ok: true, provider: 'elevenlabs', format: FORMAT }) + '\\n'); process.exit(0); }",
    "if (options.listVoices) {",
    "  try {",
    "    const data = await getJson('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': apiKey, 'accept': 'application/json' } });",
    "    const voices = Array.isArray(data.voices) ? data.voices.map((voice) => ({",
    "      id: String(voice.voice_id || voice.voiceId || voice.id || ''),",
    "      label: String(voice.name || voice.label || voice.voice_id || 'Unnamed voice'),",
    "      description: typeof voice.description === 'string' ? voice.description : undefined,",
    "      gender: typeof voice.labels?.gender === 'string' ? voice.labels.gender : undefined,",
    "      locale: Array.isArray(voice.verified_languages) && voice.verified_languages[0]?.locale ? String(voice.verified_languages[0].locale) : undefined,",
    "      language: Array.isArray(voice.verified_languages) && voice.verified_languages[0]?.language ? String(voice.verified_languages[0].language) : undefined,",
    "      style: typeof voice.labels?.accent === 'string' ? [voice.labels.accent] : undefined,",
    "      providerMetadata: { category: voice.category, isOwner: voice.is_owner, isLegacy: voice.is_legacy },",
    "    })).filter((voice) => voice.id) : [];",
    "    process.stdout.write(JSON.stringify({ voices }) + '\\n');",
    "  } catch (error) {",
    "    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(1);",
    "  }",
    "  process.exit(0);",
    "}",
    "if (options.cloneCreate) {",
    "  requireCloneArgs(options);",
    "  try {",
    "    const form = new FormData();",
    "    form.append('name', options.cloneName);",
    "    if (options.notes) form.append('description', options.notes);",
    "    appendAudioFiles(form, 'files', options.sourceAudio);",
    "    const data = await getJson('https://api.elevenlabs.io/v1/voices/add', {",
    "      method: 'POST',",
    "      headers: { 'xi-api-key': apiKey, 'accept': 'application/json' },",
    "      body: form,",
    "    });",
    "    const voiceId = String(data.voice_id || data.voiceId || data.id || '');",
    "    if (!voiceId) throw new Error('ElevenLabs clone response did not include voice_id.');",
    "    process.stdout.write(JSON.stringify({ voiceId, label: options.cloneName, providerId: 'elevenlabs', cloned: true, status: data.requires_verification ? 'requires-verification' : 'ready' }) + '\\n');",
    "  } catch (error) {",
    "    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(1);",
    "  }",
    "  process.exit(0);",
    "}",
    "if (options.cloneStatus) {",
    "  requireVoiceId(options);",
    "  try {",
    "    const data = await getJson(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(options.voiceId)}`, { headers: { 'xi-api-key': apiKey, 'accept': 'application/json' } });",
    "    process.stdout.write(JSON.stringify({ voiceId: String(data.voice_id || data.voiceId || options.voiceId), label: data.name ? String(data.name) : undefined, status: data.requires_verification ? 'requires-verification' : 'ready', cloned: true, providerId: 'elevenlabs' }) + '\\n');",
    "  } catch (error) {",
    "    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(1);",
    "  }",
    "  process.exit(0);",
    "}",
    "if (options.cloneDelete) {",
    "  requireVoiceId(options);",
    "  try {",
    "    const response = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(options.voiceId)}`, { method: 'DELETE', headers: { 'xi-api-key': apiKey, 'accept': 'application/json' } });",
    "    const text = await response.text();",
    "    if (!response.ok) throw new Error(`Provider request failed (${response.status}): ${text.slice(0, 800)}`);",
    "    process.stdout.write(JSON.stringify({ voiceId: options.voiceId, deleted: true, providerId: 'elevenlabs' }) + '\\n');",
    "  } catch (error) {",
    "    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(1);",
    "  }",
    "  process.exit(0);",
    "}",
    "const synthesisText = requireSynthesisArgs(options, FORMAT);",
    "const voiceId = options.voice || DEFAULT_VOICE;",
    "try {",
    "  const bytes = await postBytes(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {",
    "    method: 'POST',",
    "    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', 'accept': 'audio/mpeg' },",
    "    body: JSON.stringify({ text: synthesisText, model_id: 'eleven_multilingual_v2' }),",
    "  });",
    "  const audioPath = writeAudio(options.output, bytes);",
    "  process.stdout.write(JSON.stringify({ audioPath, mimeType: 'audio/mpeg', providerId: 'elevenlabs', voiceId }) + '\\n');",
    "} catch (error) {",
    "  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "  process.exit(1);",
    "}",
    "",
  ].join("\n");
}

function cartesiaVoiceProviderRunScript(): string {
  return [
    ...cloudProviderSharedRunScript(),
    "",
    "const ENV_NAME = 'CARTESIA_API_KEY';",
    "const DEFAULT_VOICE = 'a0e99841-438c-4a64-b679-ae501e7d6091';",
    "const FORMAT = 'wav';",
    "const options = parseArgs(process.argv);",
    "if (options.help) { process.stdout.write('Usage: cartesia (--text <text> | --text-file <path>) --output <path.wav> --format wav [--voice <id>] [--list-voices] [--clone-create --clone-name <name> --source-audio <path>] [--clone-status --voice-id <id>] [--clone-delete --voice-id <id>]\\n'); process.exit(0); }",
    "const apiKey = requireEnv(ENV_NAME);",
    "if (options.health) { process.stdout.write(JSON.stringify({ ok: true, provider: 'cartesia', format: FORMAT }) + '\\n'); process.exit(0); }",
    "if (options.listVoices) {",
    "  try {",
    "    const data = await getJson('https://api.cartesia.ai/voices', { headers: { 'X-API-Key': apiKey, 'Cartesia-Version': '2025-04-16', 'accept': 'application/json' } });",
    "    const rawVoices = Array.isArray(data) ? data : Array.isArray(data.voices) ? data.voices : Array.isArray(data.data) ? data.data : [];",
    "    const voices = rawVoices.map((voice) => ({",
    "      id: String(voice.id || voice.voice_id || voice.voiceId || ''),",
    "      label: String(voice.name || voice.label || voice.id || 'Unnamed voice'),",
    "      description: typeof voice.description === 'string' ? voice.description : undefined,",
    "      language: typeof voice.language === 'string' ? voice.language : undefined,",
    "      locale: typeof voice.locale === 'string' ? voice.locale : undefined,",
    "      gender: typeof voice.gender === 'string' ? voice.gender : undefined,",
    "      style: Array.isArray(voice.tags) ? voice.tags.map(String) : undefined,",
    "      providerMetadata: { isOwner: voice.is_owner, isPublic: voice.is_public },",
    "    })).filter((voice) => voice.id);",
    "    process.stdout.write(JSON.stringify({ voices }) + '\\n');",
    "  } catch (error) {",
    "    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(1);",
    "  }",
    "  process.exit(0);",
    "}",
    "if (options.cloneCreate) {",
    "  requireCloneArgs(options);",
    "  if (options.sourceAudio.length !== 1) { process.stderr.write('Cartesia clone creation expects exactly one --source-audio file.\\n'); process.exit(2); }",
    "  try {",
    "    const form = new FormData();",
    "    appendAudioFiles(form, 'clip', options.sourceAudio);",
    "    form.append('name', options.cloneName);",
    "    if (options.notes) form.append('description', options.notes);",
    "    form.append('language', 'en');",
    "    form.append('mode', 'similarity');",
    "    form.append('enhance', 'true');",
    "    const data = await getJson('https://api.cartesia.ai/voices/clone', {",
    "      method: 'POST',",
    "      headers: { 'X-API-Key': apiKey, 'Cartesia-Version': '2025-04-16', 'accept': 'application/json' },",
    "      body: form,",
    "    });",
    "    const voiceId = String(data.id || data.voice_id || data.voiceId || '');",
    "    if (!voiceId) throw new Error('Cartesia clone response did not include id.');",
    "    process.stdout.write(JSON.stringify({ voiceId, label: data.name || options.cloneName, providerId: 'cartesia', cloned: true, status: 'ready' }) + '\\n');",
    "  } catch (error) {",
    "    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(1);",
    "  }",
    "  process.exit(0);",
    "}",
    "if (options.cloneStatus) {",
    "  requireVoiceId(options);",
    "  try {",
    "    const data = await getJson(`https://api.cartesia.ai/voices/${encodeURIComponent(options.voiceId)}`, { headers: { 'X-API-Key': apiKey, 'Cartesia-Version': '2025-04-16', 'accept': 'application/json' } });",
    "    process.stdout.write(JSON.stringify({ voiceId: String(data.id || data.voice_id || data.voiceId || options.voiceId), label: data.name ? String(data.name) : undefined, status: 'ready', cloned: true, providerId: 'cartesia' }) + '\\n');",
    "  } catch (error) {",
    "    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(1);",
    "  }",
    "  process.exit(0);",
    "}",
    "if (options.cloneDelete) {",
    "  requireVoiceId(options);",
    "  try {",
    "    const response = await fetch(`https://api.cartesia.ai/voices/${encodeURIComponent(options.voiceId)}`, { method: 'DELETE', headers: { 'X-API-Key': apiKey, 'Cartesia-Version': '2025-04-16', 'accept': 'application/json' } });",
    "    const text = await response.text();",
    "    if (!response.ok) throw new Error(`Provider request failed (${response.status}): ${text.slice(0, 800)}`);",
    "    process.stdout.write(JSON.stringify({ voiceId: options.voiceId, deleted: true, providerId: 'cartesia' }) + '\\n');",
    "  } catch (error) {",
    "    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(1);",
    "  }",
    "  process.exit(0);",
    "}",
    "const synthesisText = requireSynthesisArgs(options, FORMAT);",
    "const voiceId = options.voice || DEFAULT_VOICE;",
    "try {",
    "  const bytes = await postBytes('https://api.cartesia.ai/tts/bytes', {",
    "    method: 'POST',",
    "    headers: { 'X-API-Key': apiKey, 'Cartesia-Version': '2025-04-16', 'content-type': 'application/json' },",
    "    body: JSON.stringify({",
    "      model_id: 'sonic-2',",
    "      transcript: synthesisText,",
    "      voice: { mode: 'id', id: voiceId },",
    "      output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 44100 },",
    "    }),",
    "  });",
    "  const audioPath = writeAudio(options.output, bytes);",
    "  process.stdout.write(JSON.stringify({ audioPath, mimeType: 'audio/wav', providerId: 'cartesia', voiceId }) + '\\n');",
    "} catch (error) {",
    "  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "  process.exit(1);",
    "}",
    "",
  ].join("\n");
}

function piperVoiceProviderScaffoldFiles(
  name: string,
  commandName: string,
  description: string,
  input: CapabilityBuilderScaffoldInput,
): Array<{ path: string; content: string }> {
  return [
    {
      path: "ambient-cli.json",
      content: `${JSON.stringify(
        {
          name,
          version: "0.1.0",
          description,
          skills: "./SKILL.md",
          commands: {
            [commandName]: {
              description: "Synthesize spoken assistant text to a WAV file with Piper TTS.",
              command: "node",
              args: ["./scripts/run.mjs"],
              cwd: "package",
              healthCheck: ["node", "./scripts/run.mjs", "--health"],
              voiceProvider: {
                defaultFormat: "wav",
                formats: ["wav"],
                voices: [{ id: "default", label: "Default Piper voice" }],
                local: true,
              },
            },
          },
          env: [],
          networkHosts: ["huggingface.co", "pypi.org", "files.pythonhosted.org"],
          modelAssets: [
            {
              name: "Piper en_US lessac medium ONNX voice",
              url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
              expectedSizeBytes: 63100000,
              license: "Piper voice model repository terms",
              cachePath: "models/en_US-lessac-medium.onnx",
            },
            {
              name: "Piper en_US lessac medium config",
              url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json",
              expectedSizeBytes: 6000,
              license: "Piper voice model repository terms",
              cachePath: "models/en_US-lessac-medium.onnx.json",
            },
          ],
          artifacts: {
            outputTypes: input.outputArtifactTypes ?? ["WAV"],
            policy: "write generated WAV files to the --output path and return JSON artifact metadata",
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      content: [
        "---",
        `name: ${name}`,
        `description: ${description}`,
        "---",
        "",
        "Use this capability when Ambient core voice dispatch or the user needs local Piper text-to-speech.",
        "",
        `Command contract: run \`${commandName}\` through \`ambient_cli\` with \`--text <text>\`, \`--output <path.wav>\`, \`--format wav\`, and optional \`--voice default\`.`,
        "The wrapper uses `uvx --from piper-tts piper` and expects the declared model assets under `models/`.",
        "Before install or repair, read Piper upstream docs/model requirements and preview dependency/model downloads for user approval.",
        "Keep stdout to JSON metadata: `audioPath`, `mimeType`, and optional `durationMs`. Put audio in the requested output path.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/run.mjs",
      content: piperVoiceProviderRunScript(),
    },
    {
      path: "tests/smoke.test.mjs",
      content: piperVoiceProviderSmokeTest(),
    },
  ];
}

function piperVoiceProviderRunScript(): string {
  return [
    "#!/usr/bin/env node",
    "import { existsSync } from 'node:fs';",
    "import { mkdirSync } from 'node:fs';",
    "import { dirname, resolve } from 'node:path';",
    "import { spawnSync } from 'node:child_process';",
    "",
    "const args = process.argv.slice(2);",
    "const model = resolve('models/en_US-lessac-medium.onnx');",
    "const config = resolve('models/en_US-lessac-medium.onnx.json');",
    "",
    "function checkAssets() {",
    "  if (!existsSync(model) || !existsSync(config)) {",
    "    console.error('Missing Piper model assets. Download the descriptor modelAssets into ./models before running synthesis.');",
    "    process.exit(3);",
    "  }",
    "}",
    "",
    "if (args.includes('--health')) {",
    "  checkAssets();",
    "  const uvx = spawnSync('uvx', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });",
    "  if (uvx.error || uvx.status !== 0) {",
    "    process.stderr.write(uvx.stderr || uvx.stdout || uvx.error?.message || 'uvx unavailable for Piper TTS. Install uv or provide a packaged Piper binary.\\n');",
    "    process.exit(4);",
    "  }",
    "  process.stdout.write(JSON.stringify({ ok: true, provider: 'piper', contract: '--text --output --format wav' }) + '\\n');",
    "  process.exit(0);",
    "}",
    "",
    "function arg(name) {",
    "  const index = args.indexOf(name);",
    "  return index >= 0 ? args[index + 1] : undefined;",
    "}",
    "",
    "const text = arg('--text');",
    "const output = arg('--output');",
    "const format = arg('--format') || 'wav';",
    "if (!text || !output) {",
    "  console.error('Usage: --text <text> --output <path.wav> --format wav [--voice default]');",
    "  process.exit(2);",
    "}",
    "if (format !== 'wav') {",
    "  console.error('Piper wrapper currently supports only wav output.');",
    "  process.exit(2);",
    "}",
    "",
    "checkAssets();",
    "",
    "const absoluteOutput = resolve(output);",
    "mkdirSync(dirname(absoluteOutput), { recursive: true });",
    "const result = spawnSync('uvx', ['--from', 'piper-tts', 'piper', '-m', model, '-c', config, '-f', absoluteOutput], {",
    "  input: text,",
    "  encoding: 'utf8',",
    "  stdio: ['pipe', 'pipe', 'pipe'],",
    "});",
    "if (result.status !== 0) {",
    "  process.stderr.write(result.stderr || result.stdout || `piper exited with ${result.status}\\n`);",
    "  process.exit(result.status || 1);",
    "}",
    "process.stdout.write(JSON.stringify({ audioPath: absoluteOutput, mimeType: 'audio/wav' }) + '\\n');",
    "",
  ].join("\n");
}

function piperVoiceProviderSmokeTest(): string {
  return [
    "import { strict as assert } from 'node:assert';",
    "import { spawnSync } from 'node:child_process';",
    "import { existsSync } from 'node:fs';",
    "",
    "const health = spawnSync(process.execPath, ['./scripts/run.mjs', '--health'], { encoding: 'utf8' });",
    "if (health.status === 3) {",
    "  assert.match(health.stderr, /Missing Piper model assets/);",
    "  process.exit(0);",
    "}",
    "assert.equal(health.status, 0, health.stderr);",
    "",
    "const output = 'ambient-piper-smoke.wav';",
    "const result = spawnSync(process.execPath, ['./scripts/run.mjs', '--text', 'Ambient Piper smoke.', '--output', output, '--format', 'wav'], { encoding: 'utf8' });",
    "assert.equal(result.status, 0, result.stderr);",
    "assert.match(result.stdout, /audio\\/wav/);",
    "assert.equal(existsSync(output), true);",
    "",
  ].join("\n");
}

function kokoroOnnxVoiceProviderScaffoldFiles(
  name: string,
  commandName: string,
  description: string,
  input: CapabilityBuilderScaffoldInput,
): Array<{ path: string; content: string }> {
  return [
    {
      path: "ambient-cli.json",
      content: `${JSON.stringify(
        {
          name,
          version: "0.1.0",
          description,
          skills: "./SKILL.md",
          commands: {
            [commandName]: {
              description: "Synthesize spoken assistant text to a WAV file with Kokoro ONNX.",
              command: "node",
              args: ["./scripts/run.mjs"],
              cwd: "package",
              healthCheck: ["node", "./scripts/run.mjs", "--health"],
              voiceProvider: {
                label: "Kokoro ONNX Voice Provider",
                defaultFormat: "wav",
                formats: ["wav"],
                voices: [{ id: "af_sarah", label: "af_sarah" }],
                local: true,
              },
            },
          },
          env: [],
          networkHosts: ["github.com", "objects.githubusercontent.com", "pypi.org", "files.pythonhosted.org"],
          modelAssets: [
            {
              name: "Kokoro ONNX v1.0 int8 model",
              url: "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx",
              expectedSizeBytes: 92361271,
              license: "Kokoro ONNX model release terms",
              cachePath: "models/kokoro-v1.0.int8.onnx",
            },
            {
              name: "Kokoro ONNX v1.0 voices",
              url: "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
              expectedSizeBytes: 28214398,
              license: "Kokoro ONNX voice asset release terms",
              cachePath: "models/voices-v1.0.bin",
            },
          ],
          artifacts: {
            outputTypes: input.outputArtifactTypes ?? ["WAV"],
            policy: "write generated WAV files to the --output path and return JSON artifact metadata",
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      content: [
        "---",
        `name: ${name}`,
        `description: ${description}`,
        "---",
        "",
        "Use this capability when Ambient core voice dispatch or the user needs local Kokoro ONNX text-to-speech.",
        "",
        `Command contract: run \`${commandName}\` through \`ambient_cli\` with \`--text <text>\`, \`--output <path.wav>\`, \`--format wav\`, and optional \`--voice af_sarah\`.`,
        "The wrapper uses `uv run --with kokoro-onnx --with soundfile python ./scripts/synthesize.py` and expects the declared model assets under `models/`.",
        "Before install or repair, preview dependency/model downloads for user approval. Do not fall back to the heavier MLX/Kokoro path unless explicitly approved.",
        "Keep stdout to JSON metadata: `audioPath`, `mimeType`, and optional `voiceId`. Put audio in the requested output path.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/run.mjs",
      content: kokoroOnnxVoiceProviderRunScript(),
    },
    {
      path: "scripts/synthesize.py",
      content: kokoroOnnxVoiceProviderPythonScript(),
    },
    {
      path: "tests/smoke.test.mjs",
      content: kokoroOnnxVoiceProviderSmokeTest(),
    },
  ];
}

function kokoroOnnxVoiceProviderRunScript(): string {
  return [
    "#!/usr/bin/env node",
    "import { existsSync } from 'node:fs';",
    "import { mkdirSync } from 'node:fs';",
    "import { dirname, resolve } from 'node:path';",
    "import { spawnSync } from 'node:child_process';",
    "",
    "const args = process.argv.slice(2);",
    "const model = resolve('models/kokoro-v1.0.int8.onnx');",
    "const voices = resolve('models/voices-v1.0.bin');",
    "",
    "function checkAssets() {",
    "  if (!existsSync(model) || !existsSync(voices)) {",
    "    console.error('Missing Kokoro ONNX model assets. Download the descriptor modelAssets into ./models before running synthesis.');",
    "    process.exit(3);",
    "  }",
    "}",
    "",
    "if (args.includes('--health')) {",
    "  checkAssets();",
    "  const uv = spawnSync('uv', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });",
    "  if (uv.error || uv.status !== 0) {",
    "    process.stderr.write(uv.stderr || uv.stdout || uv.error?.message || 'uv unavailable for Kokoro ONNX TTS. Install uv or provide a pinned Python environment.\\n');",
    "    process.exit(4);",
    "  }",
    "  process.stdout.write(JSON.stringify({ ok: true, provider: 'kokoro-onnx', contract: '--text --output --format wav' }) + '\\n');",
    "  process.exit(0);",
    "}",
    "",
    "function arg(name) {",
    "  const index = args.indexOf(name);",
    "  return index >= 0 ? args[index + 1] : undefined;",
    "}",
    "",
    "const text = arg('--text');",
    "const output = arg('--output');",
    "const format = arg('--format') || 'wav';",
    "const voice = arg('--voice') || 'af_sarah';",
    "if (!text || !output) {",
    "  console.error('Usage: --text <text> --output <path.wav> --format wav [--voice af_sarah]');",
    "  process.exit(2);",
    "}",
    "if (format !== 'wav') {",
    "  console.error('Kokoro ONNX wrapper currently supports only wav output.');",
    "  process.exit(2);",
    "}",
    "",
    "checkAssets();",
    "",
    "const absoluteOutput = resolve(output);",
    "mkdirSync(dirname(absoluteOutput), { recursive: true });",
    "const result = spawnSync('uv', ['run', '--with', 'kokoro-onnx', '--with', 'soundfile', 'python', './scripts/synthesize.py', model, voices, text, absoluteOutput, voice], {",
    "  encoding: 'utf8',",
    "  stdio: ['ignore', 'pipe', 'pipe'],",
    "});",
    "if (result.status !== 0) {",
    "  process.stderr.write(result.stderr || result.stdout || `kokoro-onnx exited with ${result.status}\\n`);",
    "  process.exit(result.status || 1);",
    "}",
    "process.stdout.write(JSON.stringify({ audioPath: absoluteOutput, mimeType: 'audio/wav', voiceId: voice }) + '\\n');",
    "",
  ].join("\n");
}

function kokoroOnnxVoiceProviderPythonScript(): string {
  return [
    "import sys",
    "import soundfile as sf",
    "from kokoro_onnx import Kokoro",
    "",
    "model_path, voices_path, text, output_path, voice = sys.argv[1:6]",
    "kokoro = Kokoro(model_path, voices_path)",
    "samples, sample_rate = kokoro.create(text, voice=voice, speed=1.0, lang='en-us')",
    "sf.write(output_path, samples, sample_rate)",
    "",
  ].join("\n");
}

function kokoroOnnxVoiceProviderSmokeTest(): string {
  return [
    "import { strict as assert } from 'node:assert';",
    "import { spawnSync } from 'node:child_process';",
    "import { existsSync } from 'node:fs';",
    "",
    "const healthMissing = spawnSync(process.execPath, ['./scripts/run.mjs', '--health'], { encoding: 'utf8' });",
    "if (healthMissing.status === 3) {",
    "  assert.match(healthMissing.stderr, /Missing Kokoro ONNX model assets/);",
    "  process.exit(0);",
    "}",
    "assert.equal(healthMissing.status, 0, healthMissing.stderr);",
    "",
    "const output = 'ambient-kokoro-onnx-smoke.wav';",
    "const result = spawnSync(process.execPath, ['./scripts/run.mjs', '--text', 'Ambient Kokoro ONNX smoke.', '--output', output, '--format', 'wav'], { encoding: 'utf8' });",
    "assert.equal(result.status, 0, result.stderr);",
    "assert.match(result.stdout, /audio\\/wav/);",
    "assert.equal(existsSync(output), true);",
    "",
  ].join("\n");
}

async function resolveManagedPackagePath(workspace: string, managedWorkspace: string, input: CapabilityBuilderPreviewInput): Promise<string> {
  if (!input.packageName && !input.path && !input.sourcePath) throw new Error("packageName, path, or sourcePath is required.");
  const root = resolve(managedWorkspace, builderRoot);
  const explicitPath = input.path ?? input.sourcePath;
  if (explicitPath) {
    const target = resolveCapabilityBuilderSourcePath(workspace, managedWorkspace, explicitPath);
    if (!isPathInside(root, target)) throw new Error("Capability package preview is limited to the managed builder root.");
    return target;
  }

  const target = resolve(root, capabilityPackageName(input.packageName!));
  if (!isPathInside(root, target)) throw new Error("Capability package preview is limited to the managed builder root.");
  if (existsSync(target) || !existsSync(root)) return target;

  const matches = await findManagedPackageRootsByName(root, input.packageName!);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const relativeMatches = matches.map((match) => toWorkspaceRelative(managedWorkspace, match)).join(", ");
    throw new Error(`Capability builder package name "${input.packageName}" matched multiple managed sources: ${relativeMatches}. Pass the exact sourcePath returned by preview or history.`);
  }
  return target;
}

function resolveCapabilityBuilderSourcePath(workspace: string, managedWorkspace: string, sourcePath: string): string {
  const managedCandidate = resolve(managedWorkspace, sourcePath);
  if (sourcePath.startsWith("./.ambient/") || sourcePath.startsWith(".ambient/") || existsSync(managedCandidate)) return managedCandidate;
  const workspaceCandidate = resolve(workspace, sourcePath);
  if (isPathInside(resolve(workspace, ".ambient", "capability-builder"), workspaceCandidate)) {
    return resolve(managedWorkspace, relative(workspace, workspaceCandidate));
  }
  return workspaceCandidate;
}

async function findManagedPackageRootsByName(root: string, packageName: string): Promise<string[]> {
  const requested = capabilityPackageIdentifierSet(packageName);
  const children = await readdir(root, { withFileTypes: true }).catch(() => []);
  const matches: string[] = [];
  for (const child of children) {
    if (!child.isDirectory()) continue;
    const candidateRoot = join(root, child.name);
    const identifiers = await managedPackageIdentifiers(candidateRoot, child.name);
    if ([...requested].some((name) => identifiers.has(name))) matches.push(candidateRoot);
  }
  return Array.from(new Set(matches));
}

async function managedPackageIdentifiers(rootPath: string, folderName: string): Promise<Set<string>> {
  const identifiers = new Set<string>();
  addCapabilityPackageIdentifiers(identifiers, folderName);
  const descriptor = await readJsonObjectIfPresent(join(rootPath, "ambient-cli.json"));
  addCapabilityPackageIdentifiers(identifiers, stringField(descriptor?.name));
  const manifest = await readJsonObjectIfPresent(join(rootPath, "capability-build.json"));
  addCapabilityPackageIdentifiers(identifiers, stringField(manifest?.name));
  const sourcePath = stringField(manifest?.sourcePath);
  if (sourcePath) addCapabilityPackageIdentifiers(identifiers, basename(sourcePath));
  return identifiers;
}

async function readJsonObjectIfPresent(path: string): Promise<Record<string, unknown> | undefined> {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function capabilityPackageIdentifierSet(value: string): Set<string> {
  const identifiers = new Set<string>();
  addCapabilityPackageIdentifiers(identifiers, value);
  return identifiers;
}

function addCapabilityPackageIdentifiers(identifiers: Set<string>, value: string | undefined): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  identifiers.add(trimmed);
  identifiers.add(basename(trimmed));
  try {
    identifiers.add(capabilityPackageName(trimmed));
    identifiers.add(capabilityPackageName(basename(trimmed)));
  } catch {
    // Ignore values that cannot be normalized into a package name.
  }
}

function capabilityBuilderPackageMatches(
  requestedPackageName: string,
  folderName: string,
  preview: Pick<CapabilityBuilderPreviewResult, "packageName" | "relativeRootPath">,
  manifest: NonNullable<CapabilityBuilderUpdatePlanResult["buildManifest"]> | undefined,
): boolean {
  const requested = capabilityPackageIdentifierSet(requestedPackageName);
  const identifiers = new Set<string>();
  addCapabilityPackageIdentifiers(identifiers, folderName);
  addCapabilityPackageIdentifiers(identifiers, preview.packageName);
  addCapabilityPackageIdentifiers(identifiers, preview.relativeRootPath);
  addCapabilityPackageIdentifiers(identifiers, manifest?.sourcePath);
  addCapabilityPackageIdentifiers(identifiers, manifest?.installedPackageId);
  addCapabilityPackageIdentifiers(identifiers, manifest?.installedSource);
  return [...requested].some((name) => identifiers.has(name));
}

function parseJsonObject(content: string, label: string, errors: string[]): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      errors.push(`${label} must contain a JSON object.`);
      return undefined;
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function inspectDescriptor(
  descriptor: Record<string, unknown>,
  errors: string[],
  warnings: string[],
  risks: string[],
  rootPath: string,
  context: { installerShape?: CapabilityBuilderInstallerShape } = {},
): CapabilityBuilderPreviewResult["descriptor"] {
  const name = stringField(descriptor.name);
  const version = stringField(descriptor.version);
  const description = stringField(descriptor.description);
  if (!name) errors.push("Descriptor name is required.");
  if (!version) warnings.push("Descriptor version is missing.");
  const commands = recordField(descriptor.commands);
  const commandNames = Object.keys(commands);
  if (!commandNames.length) errors.push("Descriptor must declare at least one command.");
  const envRequirements = envRequirementsFromDescriptor(descriptor.env, errors);
  const envNames = envRequirements.map((env) => env.name);
  const networkHosts = networkHostsFromDescriptor(descriptor, errors);
  const modelAssets = modelAssetsFromDescriptor(descriptor, errors, risks);
  const voiceProviderCommandNames: string[] = [];
  const voiceDiscoveryCommandNames: string[] = [];
  const voiceCloningCommandNames: string[] = [];
  for (const commandName of commandNames) {
    if (!/^[a-zA-Z0-9_-]+$/.test(commandName)) errors.push(`Command name "${commandName}" contains unsupported characters.`);
    const command = recordField(commands[commandName]);
    const voiceProvider = recordField(command.voiceProvider);
    if (Object.keys(voiceProvider).length) {
      voiceProviderCommandNames.push(commandName);
      if (inspectVoiceProviderMetadata(commandName, voiceProvider, commandNames, errors, warnings)) voiceDiscoveryCommandNames.push(commandName);
      if (inspectVoiceCloningMetadata(commandName, voiceProvider, commandNames, envNames, networkHosts, errors, warnings)) voiceCloningCommandNames.push(commandName);
    }
    const executable = stringField(command.command);
    if (!executable) {
      errors.push(`Command "${commandName}" must declare command.`);
    } else {
      inspectDescriptorExecutable(rootPath, `Command "${commandName}" command`, executable, errors);
    }
    const commandText = [
      commandName,
      stringField(command.description),
      stringField(command.command),
      ...stringArrayField(command.args),
      ...stringArrayField(command.healthCheck),
    ].filter(Boolean).join(" ").toLowerCase();
    const cwd = stringField(command.cwd) ?? "workspace";
    if (cwd !== "workspace" && cwd !== "package") errors.push(`Command "${commandName}" has unsupported cwd "${cwd}".`);
    const args = stringArrayField(command.args);
    for (const arg of args) {
      if (arg.includes("..")) risks.push(`Command "${commandName}" args contain parent traversal segment: ${arg}`);
    }
    const healthCheck = stringArrayField(command.healthCheck);
    if (!healthCheck.length) warnings.push(`Command "${commandName}" has no healthCheck.`);
    if (healthCheck[0]) inspectDescriptorExecutable(rootPath, `Command "${commandName}" healthCheck executable`, healthCheck[0], errors);
    if (stringField(command.command) === "bash" || stringField(command.command) === "sh") {
      risks.push(`Command "${commandName}" uses a shell entrypoint; prefer explicit binaries and args.`);
    }
    if (looksNetworked(commandText) && !networkHosts.length) {
      warnings.push(`Command "${commandName}" appears to use network/API behavior but descriptor does not declare networkHosts or allowedNetworkHosts.`);
    }
  }
  const skills = stringField(descriptor.skills) ?? "./skills";
  if (skills.includes("..")) risks.push("Descriptor skills path contains parent traversal.");
  const resolvedSkills = resolve(rootPath, skills);
  if (!isPathInside(rootPath, resolvedSkills)) errors.push("Descriptor skills path escapes the package root.");
  if (envRequirements.some((env) => env.required)) risks.push(`Descriptor declares required env secrets: ${envRequirements.filter((env) => env.required).map((env) => env.name).join(", ")}.`);
  if (networkHosts.length) risks.push(`Descriptor declares network/API hosts: ${networkHosts.join(", ")}.`);
  if (modelAssets.length) risks.push(`Descriptor declares model/data assets: ${modelAssets.map((asset) => asset.name).join(", ")}.`);
  const artifactOutputTypes = artifactTypesFromDescriptor(descriptor.artifacts);
  const responseFormats = responseFormatsFromDescriptor(descriptor.responseFormats);
  inspectTtsProviderShape({
    installerShape: context.installerShape,
    descriptor,
    description,
    commandNames,
    voiceProviderCommandNames,
    artifactOutputTypes,
    envRequirements,
    networkHosts,
    errors,
    warnings,
  });
  return { name, version, description, commandNames, voiceProviderCommandNames, voiceDiscoveryCommandNames, voiceCloningCommandNames, envNames, envRequirements, networkHosts, modelAssets, artifactOutputTypes, responseFormats };
}

function inspectDescriptorExecutable(rootPath: string, label: string, executable: string, errors: string[]): void {
  const command = executable.trim();
  if (!command) return;
  if (command.includes("\0") || command.includes("\n")) {
    errors.push(`${label} contains unsupported characters.`);
    return;
  }
  if (!command.startsWith(".") && !command.includes("/") && !command.includes("\\")) return;
  if (isAbsolute(command)) {
    errors.push(
      `${label} must not use absolute host path "${command}". Use a bare executable such as "node" and rely on Ambient's managed runtime PATH, or use a package-relative executable such as "./bin/tool".`,
    );
    return;
  }
  const resolved = resolve(rootPath, command);
  if (!isPathInside(rootPath, resolved)) errors.push(`${label} resolves outside the package root: ${command}`);
}

function inspectVoiceProviderMetadata(
  commandName: string,
  voiceProvider: Record<string, unknown>,
  commandNames: string[],
  errors: string[],
  warnings: string[],
): boolean {
  const defaultFormat = stringField(voiceProvider.defaultFormat);
  const formats = stringArrayField(voiceProvider.formats).map((format) => normalizeVoiceOutputFormat(format)).filter(Boolean);
  if (!defaultFormat) errors.push(`Command "${commandName}" voiceProvider.defaultFormat is required.`);
  if (!formats.length) errors.push(`Command "${commandName}" voiceProvider.formats must declare at least one supported audio format.`);
  const normalizedDefault = defaultFormat ? normalizeVoiceOutputFormat(defaultFormat) : undefined;
  if (defaultFormat && !normalizedDefault) errors.push(`Command "${commandName}" voiceProvider.defaultFormat is unsupported: ${defaultFormat}`);
  if (normalizedDefault && formats.length && !formats.includes(normalizedDefault)) {
    errors.push(`Command "${commandName}" voiceProvider.defaultFormat must be included in voiceProvider.formats.`);
  }
  const voices = Array.isArray(voiceProvider.voices) ? voiceProvider.voices : [];
  if (!voices.length) warnings.push(`Command "${commandName}" voiceProvider.voices is empty; Settings will have no explicit voice choices.`);
  voices.forEach((voice, index) => {
    const record = recordField(voice);
    if (!stringField(record.id)) errors.push(`Command "${commandName}" voiceProvider.voices[${index}].id is required.`);
  });
  return inspectVoiceDiscoveryMetadata(commandName, voiceProvider, commandNames, errors, warnings);
}

function inspectVoiceDiscoveryMetadata(
  commandName: string,
  voiceProvider: Record<string, unknown>,
  commandNames: string[],
  errors: string[],
  warnings: string[],
): boolean {
  const voiceDiscovery = recordField(voiceProvider.voiceDiscovery);
  if (!Object.keys(voiceDiscovery).length) return false;
  const discoveryCommand = stringField(voiceDiscovery.command);
  if (!discoveryCommand) {
    errors.push(`Command "${commandName}" voiceProvider.voiceDiscovery.command is required.`);
  } else if (!commandNames.includes(discoveryCommand)) {
    errors.push(`Command "${commandName}" voiceProvider.voiceDiscovery.command "${discoveryCommand}" does not match a descriptor command.`);
  }
  const cacheTtlSeconds = typeof voiceDiscovery.cacheTtlSeconds === "number" ? voiceDiscovery.cacheTtlSeconds : undefined;
  if (voiceDiscovery.cacheTtlSeconds !== undefined && (cacheTtlSeconds === undefined || cacheTtlSeconds <= 0 || !Number.isInteger(cacheTtlSeconds))) {
    errors.push(`Command "${commandName}" voiceProvider.voiceDiscovery.cacheTtlSeconds must be a positive integer.`);
  }
  const requiresSecret = stringArrayField(voiceDiscovery.requiresSecret);
  if (voiceDiscovery.requiresSecret !== undefined && !requiresSecret.length) {
    errors.push(`Command "${commandName}" voiceProvider.voiceDiscovery.requiresSecret must contain env names when provided.`);
  }
  if (requiresSecret.length && !requiresSecret.every((name) => /^[A-Z_][A-Z0-9_]*$/.test(name))) {
    errors.push(`Command "${commandName}" voiceProvider.voiceDiscovery.requiresSecret must use env-style names.`);
  }
  const source = stringField(voiceDiscovery.source);
  if (source && !["cloud-api", "local-model-directory", "local-runtime", "custom"].includes(source)) {
    errors.push(`Command "${commandName}" voiceProvider.voiceDiscovery.source is unsupported: ${source}`);
  }
  if (source === "cloud-api" && voiceDiscovery.requiresNetwork !== true) {
    warnings.push(`Command "${commandName}" cloud voice discovery should set voiceProvider.voiceDiscovery.requiresNetwork to true.`);
  }
  return true;
}

function inspectVoiceCloningMetadata(
  commandName: string,
  voiceProvider: Record<string, unknown>,
  commandNames: string[],
  envNames: string[],
  networkHosts: string[],
  errors: string[],
  warnings: string[],
): boolean {
  const voiceCloning = recordField(voiceProvider.voiceCloning);
  if (!Object.keys(voiceCloning).length) return false;
  if (typeof voiceCloning.supported !== "boolean") {
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.supported is required.`);
    return false;
  }
  if (voiceCloning.supported === false) return false;
  const createCommand = stringField(voiceCloning.createCommand);
  if (createCommand && !commandNames.includes(createCommand)) {
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.createCommand "${createCommand}" does not match a descriptor command.`);
  }
  const statusCommand = stringField(voiceCloning.statusCommand);
  if (statusCommand && !commandNames.includes(statusCommand)) {
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.statusCommand "${statusCommand}" does not match a descriptor command.`);
  }
  const deleteCommand = stringField(voiceCloning.deleteCommand);
  if (deleteCommand && !commandNames.includes(deleteCommand)) {
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.deleteCommand "${deleteCommand}" does not match a descriptor command.`);
  }
  const mode = stringField(voiceCloning.mode);
  if (mode !== "cloud" && mode !== "local") errors.push(`Command "${commandName}" voiceProvider.voiceCloning.mode must be cloud or local when cloning is supported.`);
  const inputs = recordField(voiceCloning.inputs);
  const audioFormats = stringArrayField(inputs.audioFormats).map((format) => format.trim().replace(/^\./, "").toLowerCase()).filter(Boolean);
  if (!audioFormats.length) errors.push(`Command "${commandName}" voiceProvider.voiceCloning.inputs.audioFormats must declare at least one audio format.`);
  const minDurationSeconds = typeof inputs.minDurationSeconds === "number" ? inputs.minDurationSeconds : undefined;
  const maxDurationSeconds = typeof inputs.maxDurationSeconds === "number" ? inputs.maxDurationSeconds : undefined;
  if (minDurationSeconds !== undefined && minDurationSeconds <= 0) errors.push(`Command "${commandName}" voiceProvider.voiceCloning.inputs.minDurationSeconds must be positive.`);
  if (maxDurationSeconds !== undefined && maxDurationSeconds <= 0) errors.push(`Command "${commandName}" voiceProvider.voiceCloning.inputs.maxDurationSeconds must be positive.`);
  if (minDurationSeconds !== undefined && maxDurationSeconds !== undefined && minDurationSeconds > maxDurationSeconds) {
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.inputs.minDurationSeconds must not exceed maxDurationSeconds.`);
  }
  const minSamples = typeof inputs.minSamples === "number" ? inputs.minSamples : undefined;
  const maxSamples = typeof inputs.maxSamples === "number" ? inputs.maxSamples : undefined;
  if (minSamples !== undefined && (!Number.isInteger(minSamples) || minSamples <= 0)) errors.push(`Command "${commandName}" voiceProvider.voiceCloning.inputs.minSamples must be a positive integer.`);
  if (maxSamples !== undefined && (!Number.isInteger(maxSamples) || maxSamples <= 0)) errors.push(`Command "${commandName}" voiceProvider.voiceCloning.inputs.maxSamples must be a positive integer.`);
  if (minSamples !== undefined && maxSamples !== undefined && minSamples > maxSamples) {
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.inputs.minSamples must not exceed maxSamples.`);
  }
  const transcript = stringField(inputs.transcript);
  if (transcript && !["required", "optional", "unsupported"].includes(transcript)) {
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.inputs.transcript is unsupported: ${transcript}`);
  }
  const requiresSecret = stringArrayField(voiceCloning.requiresSecret);
  if (voiceCloning.requiresSecret !== undefined && !requiresSecret.length) {
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.requiresSecret must contain env names when provided.`);
  }
  if (requiresSecret.length && !requiresSecret.every((name) => /^[A-Z_][A-Z0-9_]*$/.test(name))) {
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.requiresSecret must use env-style names.`);
  }
  for (const secret of requiresSecret) {
    if (!envNames.includes(secret)) warnings.push(`Command "${commandName}" voiceProvider.voiceCloning.requiresSecret references ${secret}, but descriptor env does not declare it.`);
  }
  const cloningHosts = stringArrayField(voiceCloning.networkHosts);
  if (mode === "cloud" && !cloningHosts.length && !networkHosts.length) {
    warnings.push(`Command "${commandName}" cloud voice cloning should declare voiceProvider.voiceCloning.networkHosts or descriptor networkHosts.`);
  }
  const output = recordField(voiceCloning.output);
  const creates = stringArrayField(output.creates);
  if (!creates.length) errors.push(`Command "${commandName}" voiceProvider.voiceCloning.output.creates must declare at least one clone output kind.`);
  const unsupportedCreates = creates.filter((kind) => !["provider-voice-id", "local-model-asset", "dynamic-cache-voice"].includes(kind));
  if (unsupportedCreates.length) errors.push(`Command "${commandName}" voiceProvider.voiceCloning.output.creates has unsupported values: ${unsupportedCreates.join(", ")}.`);
  if (voiceCloning.requiresConsent === false) {
    warnings.push(`Command "${commandName}" voiceProvider.voiceCloning.requiresConsent should normally be true for cloned voice creation.`);
  }
  return true;
}

function normalizeVoiceOutputFormat(format: string): "mp3" | "wav" | "ogg" | undefined {
  const normalized = format.trim().replace(/^\./, "").toLowerCase();
  if (normalized === "mp3" || normalized === "wav" || normalized === "ogg") return normalized;
  return undefined;
}

function mimeTypeForVoiceFormat(format: "mp3" | "wav" | "ogg"): string {
  switch (format) {
    case "mp3":
      return "audio/mpeg";
    case "ogg":
      return "audio/ogg";
    case "wav":
      return "audio/wav";
  }
}

function inspectTtsProviderShape(input: {
  installerShape?: CapabilityBuilderInstallerShape;
  descriptor: Record<string, unknown>;
  description?: string;
  commandNames: string[];
  voiceProviderCommandNames: string[];
  artifactOutputTypes: string[];
  envRequirements: CapabilityBuilderEnvRequirement[];
  networkHosts: string[];
  errors: string[];
  warnings: string[];
}): void {
  const descriptorText = [
    stringField(input.descriptor.name),
    input.description,
    ...input.commandNames,
    ...input.artifactOutputTypes,
  ].filter(Boolean).join(" ");
  const ttsLike = looksLikeTtsIntent(descriptorText);
  const hasVoiceProvider = input.voiceProviderCommandNames.length > 0;
  if (hasVoiceProvider && input.installerShape !== "tts-provider") {
    input.warnings.push("Descriptor declares voiceProvider metadata, but Builder installerShape is not tts-provider; repair must update Builder provenance before this package can register as a chat voice provider.");
  }
  if (input.installerShape === "tts-provider") {
    if (!hasVoiceProvider) input.errors.push("installerShape is tts-provider, but no command declares voiceProvider metadata.");
    if (!input.artifactOutputTypes.some((type) => normalizeVoiceOutputFormat(type))) {
      input.errors.push("installerShape is tts-provider, but descriptor artifacts.outputTypes does not include a supported audio format (WAV, MP3, or OGG).");
    }
    const hasRequiredEnv = input.envRequirements.some((env) => env.required);
    const cloudish = input.networkHosts.length > 0;
    if (cloudish && !hasRequiredEnv) input.warnings.push("tts-provider declares network hosts but no required env/API secret; confirm whether provider auth is needed.");
    if (hasRequiredEnv && !input.networkHosts.length) input.warnings.push("tts-provider declares required env secrets but no network hosts; declare exact API hosts for cloud providers.");
    return;
  }
  if (!input.installerShape && ttsLike && !hasVoiceProvider) {
    input.warnings.push("This package appears to implement TTS/audio voice behavior but is not shaped as an Ambient tts-provider; it will not be selectable for chat voicing unless repaired to declare installerShape \"tts-provider\" and command voiceProvider metadata.");
  }
}

function needsTtsProviderRepairConversion(
  preview: CapabilityBuilderPreviewResult,
  manifest: NonNullable<CapabilityBuilderRepairPlanResult["buildManifest"]> | undefined,
  requestedRepair: string | undefined,
): boolean {
  const requestedText = requestedRepair?.toLowerCase() ?? "";
  const descriptor = preview.descriptor;
  const previewText = [
    descriptor?.name,
    descriptor?.description,
    ...(descriptor?.commandNames ?? []),
    ...(descriptor?.artifactOutputTypes ?? []),
    ...preview.warnings,
  ].filter(Boolean).join(" ");
  const requestedProvider = /\b(tts-provider|voice provider|chat voic|read aloud|assistant voice|speak assistant)\b/i.test(requestedText);
  const previewLooksTts = looksLikeTtsIntent(previewText);
  const alreadyProvider = manifest?.installerShape === "tts-provider" && Boolean(descriptor?.voiceProviderCommandNames.length);
  return !alreadyProvider && (requestedProvider || preview.warnings.some((warning) => warning.includes("not shaped as an Ambient tts-provider")) || previewLooksTts && requestedText.includes("provider"));
}

function looksLikeTtsIntent(text: string): boolean {
  return /\b(tts|text[- ]?to[- ]?speech|speech|voice|read aloud|synthesi[sz]e|spoken|mp3|wav|ogg|audio)\b/i.test(text);
}

function inspectPackageJson(packageJson: Record<string, unknown>, risks: string[]): NonNullable<CapabilityBuilderPreviewResult["packageJson"]> {
  const scripts = recordField(packageJson.scripts);
  const lifecycleScripts = Object.keys(scripts).filter((script) => /^(pre|post)?install$|^prepare$|^prepublish/.test(script));
  if (lifecycleScripts.length) risks.push(`package.json declares lifecycle scripts: ${lifecycleScripts.join(", ")}`);
  const dependencies = Object.keys(recordField(packageJson.dependencies));
  const devDependencies = Object.keys(recordField(packageJson.devDependencies));
  if (dependencies.length || devDependencies.length) risks.push("package.json declares dependencies; dependency installation must be separately previewed and approved.");
  return { dependencies, devDependencies, lifecycleScripts };
}

function envRequirementsFromDescriptor(value: unknown, errors: string[]): CapabilityBuilderEnvRequirement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (typeof item === "string" && item.trim()) {
      const name = item.trim();
      validateEnvName(name, `env[${index}]`, errors);
      return [{ name, required: true }];
    }
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const name = stringField((item as Record<string, unknown>).name);
      if (!name) {
        errors.push(`env[${index}] must declare name.`);
        return [];
      }
      validateEnvName(name, `env[${index}].name`, errors);
      const description = stringField((item as Record<string, unknown>).description);
      const required = typeof (item as Record<string, unknown>).required === "boolean" ? Boolean((item as Record<string, unknown>).required) : true;
      return [{ name, ...(description ? { description } : {}), required }];
    }
    errors.push(`env[${index}] must be a string or object.`);
    return [];
  });
}

function validateEnvName(name: string, label: string, errors: string[]): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) errors.push(`${label} is not a valid environment variable name: ${name}`);
}

function networkHostsFromDescriptor(descriptor: Record<string, unknown>, errors: string[]): string[] {
  const direct = stringArrayField(descriptor.networkHosts).length ? stringArrayField(descriptor.networkHosts) : stringArrayField(descriptor.allowedNetworkHosts);
  const permissions = recordField(descriptor.permissions);
  const fromPermissions = stringArrayField(permissions.networkHosts).length ? stringArrayField(permissions.networkHosts) : stringArrayField(permissions.allowedNetworkHosts);
  const hosts = [...direct, ...fromPermissions].map((host) => host.trim()).filter(Boolean);
  const uniqueHosts = [...new Set(hosts)];
  for (const host of uniqueHosts) {
    if (!isValidNetworkHost(host)) errors.push(`Network host must be a bare hostname or host:port without protocol/path: ${host}`);
  }
  return uniqueHosts;
}

function isValidNetworkHost(host: string): boolean {
  return /^(?:[a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+(?::[0-9]{1,5})?$/.test(host);
}

function looksNetworked(text: string): boolean {
  return /\b(api|http|https|fetch|request|webhook|endpoint|oauth|token|bearer)\b/.test(text);
}

function modelAssetsFromDescriptor(descriptor: Record<string, unknown>, errors: string[], risks: string[]): CapabilityBuilderModelAsset[] {
  const direct = Array.isArray(descriptor.modelAssets) ? descriptor.modelAssets : undefined;
  const assetsRecord = recordField(descriptor.assets);
  const nested = Array.isArray(assetsRecord.modelAssets) ? assetsRecord.modelAssets : undefined;
  const value = direct ?? nested ?? [];
  return value.flatMap((item, index) => {
    if (typeof item === "string" && item.trim()) return [{ name: item.trim() }];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`modelAssets[${index}] must be a string or object.`);
      return [];
    }
    const record = item as Record<string, unknown>;
    const name = stringField(record.name);
    if (!name) {
      errors.push(`modelAssets[${index}] must declare name.`);
      return [];
    }
    const url = stringField(record.url);
    if (url && !isHttpUrl(url)) errors.push(`modelAssets[${index}].url must be http(s): ${url}`);
    const expectedSizeBytes = typeof record.expectedSizeBytes === "number" && Number.isFinite(record.expectedSizeBytes) ? Math.max(0, Math.floor(record.expectedSizeBytes)) : undefined;
    const sha256 = stringField(record.sha256);
    if (sha256 && !/^[a-fA-F0-9]{64}$/.test(sha256)) errors.push(`modelAssets[${index}].sha256 must be a 64-character hex digest.`);
    const license = stringField(record.license);
    const cachePath = stringField(record.cachePath);
    if (cachePath && (cachePath.startsWith("/") || cachePath.includes(".."))) errors.push(`modelAssets[${index}].cachePath must be package-relative and must not contain parent traversal.`);
    if (!url) risks.push(`modelAssets[${index}] "${name}" has no source URL; download approval cannot show provenance.`);
    if (url && !expectedSizeBytes) risks.push(`modelAssets[${index}] "${name}" has no expectedSizeBytes; large downloads need explicit size review before approval.`);
    if (url && !license) risks.push(`modelAssets[${index}] "${name}" has no license note; model/data downloads should state usage terms before approval.`);
    return [{ name, ...(url ? { url } : {}), ...(expectedSizeBytes !== undefined ? { expectedSizeBytes } : {}), ...(sha256 ? { sha256 } : {}), ...(license ? { license } : {}), ...(cachePath ? { cachePath } : {}) }];
  });
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function artifactTypesFromDescriptor(value: unknown): string[] {
  const artifacts = recordField(value);
  const outputTypes = artifacts.outputTypes;
  return Array.isArray(outputTypes) ? outputTypes.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function responseFormatsFromDescriptor(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function artifactPathMatchesOutputTypes(filePath: string, outputTypes: string[]): boolean {
  const extension = extname(filePath).replace(/^\./, "").toLowerCase();
  if (!extension) return false;
  return outputTypes.some((type) => normalizeArtifactOutputType(type) === extension);
}

function normalizeArtifactOutputType(type: string): string {
  return type.trim().replace(/^\./, "").toLowerCase();
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recordField(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function currentGitSha(rootPath: string): Promise<string | undefined> {
  try {
    return (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: rootPath, env: gitEnv() })).stdout.trim();
  } catch {
    return undefined;
  }
}

async function commitPackageGitRevision(rootPath: string, message: string): Promise<string | undefined> {
  try {
    if (!existsSync(join(rootPath, ".git"))) {
      await execFileAsync("git", ["init"], { cwd: rootPath, env: gitEnv() });
    }
    await execFileAsync("git", ["add", "."], { cwd: rootPath, env: gitEnv() });
    const status = (await execFileAsync("git", ["status", "--porcelain"], { cwd: rootPath, env: gitEnv() })).stdout.trim();
    if (!status) return currentGitSha(rootPath);
    await execFileAsync("git", ["commit", "-m", message], {
      cwd: rootPath,
      env: gitEnv(),
    });
    return (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: rootPath, env: gitEnv() })).stdout.trim();
  } catch {
    return undefined;
  }
}

function buildManifest(name: string, input: CapabilityBuilderScaffoldInput, gitSha: string | undefined): Record<string, unknown> {
  return {
    schemaVersion: "ambient-capability-builder-v1",
    name,
    version: "0.1.0",
    goal: input.goal,
    installerShape: normalizedInstallerShape(input),
    kind: input.kind,
    provider: input.provider,
    outputArtifactTypes: input.outputArtifactTypes ?? [],
    responseFormats: input.responseFormats ?? [],
    locality: input.locality ?? "either",
    createdAt: new Date().toISOString(),
    gitSha,
    status: "draft",
    refs: {
      latest: gitSha,
      installed: null,
      lastValidated: null,
    },
  };
}

async function initializePackageGit(rootPath: string): Promise<string | undefined> {
  try {
    await execFileAsync("git", ["init"], { cwd: rootPath, env: gitEnv() });
    await execFileAsync("git", ["add", "."], { cwd: rootPath, env: gitEnv() });
    await execFileAsync("git", ["commit", "-m", "Initial scaffold"], {
      cwd: rootPath,
      env: gitEnv(),
    });
    return (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: rootPath, env: gitEnv() })).stdout.trim();
  } catch {
    return undefined;
  }
}

function gitEnv(): NodeJS.ProcessEnv {
  return ambientRuntimeEnv(process.env, {
    GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || "Ambient Capability Builder",
    GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || "capability-builder@ambient.local",
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || "Ambient Capability Builder",
    GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || "capability-builder@ambient.local",
  });
}

function capabilityPackageName(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  if (!slug) throw new Error("Capability name could not be derived.");
  return slug.startsWith("ambient-") ? slug : `ambient-${slug}`;
}

function commandNameFromPackage(name: string): string {
  return name.replace(/^ambient-/, "").replace(/-+/g, "_") || "run";
}

function toWorkspaceRelative(workspacePath: string, absolutePath: string): string {
  const relativePath = relative(workspacePath, absolutePath);
  if (!relativePath || relativePath.startsWith("..")) throw new Error("Path is outside the workspace.");
  return `./${relativePath}`;
}

function toManagedInstallRelative(workspacePath: string, absolutePath: string): string {
  const managedWorkspace = managedInstallWorkspacePath(workspacePath);
  if (isPathInside(managedWorkspace, absolutePath)) return toWorkspaceRelative(managedWorkspace, absolutePath);
  return toWorkspaceRelative(workspacePath, absolutePath);
}
