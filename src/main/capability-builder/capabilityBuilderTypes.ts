import type { AmbientCliPackageCatalog, AmbientCliPackageSummary } from "./capabilityBuilderAmbientCliFacade";
import type { CapabilityBuilderInstallerShape } from "./capabilityBuilderScaffold";
import type {
  CommandDevicePolicy,
  CommandDeviceSelection,
  CommandTimeoutProfile,
} from "./capabilityBuilderToolRuntimeFacade";
import type {
  VoiceOutputFormat,
  VoiceProviderCloningMetadata,
  VoiceProviderDiscoveryMetadata,
} from "../../shared/localRuntimeTypes";

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
  timeoutProfile?: CommandTimeoutProfile;
  progressPatterns?: string[];
  devicePolicy?: CommandDevicePolicy;
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
  timeoutProfile?: CommandTimeoutProfile;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  timeoutPhase?: "process" | "process-idle";
  lastProgressAt?: string;
  lastProgressMs?: number;
  recommendedRetryProfile?: CommandTimeoutProfile;
  progressPatterns?: string[];
  matchedProgressPatterns?: string[];
  deviceSelection?: CommandDeviceSelection;
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

export type CapabilityBuilderRegisterInput = CapabilityBuilderPreviewInput;

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

export interface CapabilityBuilderRegistrationRepairInput extends CapabilityBuilderPreviewInput {
  reason?: string;
}

export interface CapabilityBuilderRegistrationRepairResult {
  packageName: string;
  rootPath: string;
  relativeRootPath: string;
  gitSha?: string;
  repairedAt: string;
  previousStatus?: string;
  staleInstalledPackageId?: string;
  staleInstalledSource?: string;
  staleInstalledRef?: string;
  installedPresent: boolean;
  changed: boolean;
  refs: Record<string, string | null>;
  reason?: string;
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
