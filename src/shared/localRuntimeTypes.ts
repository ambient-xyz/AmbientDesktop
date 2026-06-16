import type { WebResearchAmbientCliBinding, WebResearchFallbackPolicy, WebResearchMcpBinding, WebResearchProviderConfig } from "./desktopTypes";

export type MessageVoiceStatus = "queued" | "synthesizing" | "ready" | "playing" | "paused" | "failed" | "skipped" | "canceled";

export type MessageVoiceSource = "assistant-text" | "summary";

export interface MessageVoiceState {
  messageId: string;
  threadId: string;
  status: MessageVoiceStatus;
  source: MessageVoiceSource;
  sourceMessageId: string;
  providerCapabilityId?: string;
  providerId?: string;
  voiceId?: string;
  spokenText?: string;
  spokenTextChars: number;
  sourceTextChars: number;
  audioPath?: string;
  lastAudioPath?: string;
  mediaUrl?: string;
  mimeType?: string;
  durationMs?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaPlaybackSettings {
  generatedMediaAutoplay: boolean;
}

export type LocalDeepResearchProviderRole = "research";

export type LocalDeepResearchProviderKind = "first-party" | "ambient-cli" | "mcp" | "test-adapter";

export type LocalDeepResearchProviderConfigStatus = "enabled" | "disabled";

export type LocalDeepResearchFinalSynthesisMode = "local" | "evidence_only";

export interface LocalDeepResearchFinalSynthesisConfig {
  schemaVersion: "ambient-local-deep-research-final-synthesis-v1";
  mode: LocalDeepResearchFinalSynthesisMode;
  sourceLimit: number;
  evidencePreviewChars: number;
}

export type LocalDeepResearchEffort = "quick" | "balanced" | "deep" | "exhaustive" | "custom";

export type LocalDeepResearchBudgetSource = "user_default" | "run_override" | "tool_input";

export type LocalDeepResearchBudgetExhaustionBehavior = "summarize" | "ask_to_continue";

export interface LocalDeepResearchRunBudgetSettings {
  schemaVersion: "ambient-local-deep-research-run-budget-v1";
  defaultEffort: LocalDeepResearchEffort;
  customMaxToolCalls?: number;
  onExhausted: LocalDeepResearchBudgetExhaustionBehavior;
}

export interface LocalDeepResearchRunBudget {
  schemaVersion: "ambient-local-deep-research-run-budget-v1";
  enabled: true;
  effort: LocalDeepResearchEffort;
  maxToolCalls: number;
  source: LocalDeepResearchBudgetSource;
  onExhausted: LocalDeepResearchBudgetExhaustionBehavior;
}

export interface LocalDeepResearchToolBudgetState {
  schemaVersion: "ambient-local-deep-research-tool-budget-v1";
  effort: LocalDeepResearchEffort;
  maxToolCalls: number;
  usedToolCalls: number;
  remainingToolCalls: number;
  exhausted: boolean;
  source: LocalDeepResearchBudgetSource;
  onExhausted: LocalDeepResearchBudgetExhaustionBehavior;
}

export interface LocalDeepResearchProviderConfig {
  providerId: string;
  label: string;
  kind: LocalDeepResearchProviderKind;
  roles: LocalDeepResearchProviderRole[];
  status: LocalDeepResearchProviderConfigStatus;
  capabilityId?: string;
  privacyLabel?: string;
  optionalSecretRefs?: string[];
  finalSynthesis?: LocalDeepResearchFinalSynthesisConfig;
  ambientCli?: WebResearchAmbientCliBinding;
  mcp?: WebResearchMcpBinding;
}

export interface LocalDeepResearchProviderStackSettings {
  schemaVersion: "ambient-local-deep-research-provider-stack-v1";
  providers: LocalDeepResearchProviderConfig[];
  preferences: Partial<Record<LocalDeepResearchProviderRole, string[]>>;
  updatedAt?: string;
}

export type LocalModelMemoryLimitBehavior = "warn" | "refuse" | "unload-idle" | "ask-to-exceed";

export interface LocalModelResourceSettings {
  schemaVersion: "ambient-local-model-resource-settings-v1";
  maxResidentMemoryBytes?: number;
  maxProjectedMemoryUtilization?: number;
  minFreeMemoryRatioAfterLaunch?: number;
  comfortableFreeMemoryRatio?: number;
  memoryLimitBehavior: LocalModelMemoryLimitBehavior;
}

export interface LocalDeepResearchSettings {
  providerStack: LocalDeepResearchProviderStackSettings;
  localModelResources: LocalModelResourceSettings;
  runBudget: LocalDeepResearchRunBudgetSettings;
}

export type LocalModelResourceCapability =
  | "local-deep-research"
  | "minicpm-v"
  | "local-text"
  | "voice"
  | "embeddings";

export interface LocalModelResourceRegistryEntry {
  capability: LocalModelResourceCapability;
  id: string;
  pid?: number;
  running: boolean;
  statePath?: string;
  providerId?: string;
  runtimeId?: string;
  trackingStatus?: "managed" | "tracked" | "untracked";
  ownerThreadId?: string;
  parentThreadId?: string;
  subagentThreadId?: string;
  ownerDisplayName?: string;
  activeLeaseIds?: string[];
  endpointUrl?: string;
  port?: number;
  modelId?: string;
  profileId?: string;
  quantization?: LocalDeepResearchQuantization;
  contextTokens?: number;
  estimatedResidentMemoryBytes?: number;
  actualResidentMemoryBytes?: number;
  memorySampledAt?: string;
  startedAt?: string;
  lastUsedAt?: string;
  idleTimeMs?: number;
  logPath?: string;
  stderrPath?: string;
  providerLifecycle?: LocalRuntimeProviderLifecycleControls;
}

export type LocalModelResourcePolicyOutcome =
  | "unlimited"
  | "within-limit"
  | "warn"
  | "refuse"
  | "unload-idle"
  | "ask-to-exceed";

export interface LocalModelResourcePolicyDecision {
  outcome: LocalModelResourcePolicyOutcome;
  reason: string;
  requestedEstimatedResidentMemoryBytes?: number;
  activeEstimatedResidentMemoryBytes: number;
  projectedEstimatedResidentMemoryBytes: number;
  activeActualResidentMemoryBytes?: number;
  activeResidentMemoryBasis?: "actual-rss" | "estimated" | "mixed" | "none";
  projectedResidentMemoryBytes?: number;
  projectedSystemMemoryUtilization?: number;
  maxProjectedMemoryUtilization?: number;
  projectedFreeMemoryBytes?: number;
  projectedFreeMemoryRatio?: number;
  minFreeMemoryRatioAfterLaunch?: number;
  comfortableFreeMemoryRatio?: number;
  uncertaintyReasons?: string[];
  maxResidentMemoryBytes?: number;
  exceededByBytes?: number;
  unloadCandidateIds: string[];
}

export interface LocalModelHostMemorySnapshot {
  schemaVersion: "ambient-local-model-host-memory-v1";
  sampledAt: string;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  availableMemoryBytes?: number;
}

export interface LocalModelResourceRequestedLaunch {
  capability: LocalModelResourceRegistryEntry["capability"];
  id: string;
  ownerThreadId?: string;
  modelId?: string;
  profileId?: string;
  contextTokens?: number;
  estimatedResidentMemoryBytes?: number;
}

export interface LocalModelResourceRegistrySnapshot {
  schemaVersion: "ambient-local-model-resource-registry-v1";
  capturedAt: string;
  settings: LocalModelResourceSettings;
  entries: LocalModelResourceRegistryEntry[];
  requestedLaunch?: LocalModelResourceRequestedLaunch;
  hostMemory?: LocalModelHostMemorySnapshot;
  activeCount: number;
  activeEstimatedResidentMemoryBytes: number;
  activeActualResidentMemoryBytes?: number;
  policyDecision: LocalModelResourcePolicyDecision;
}

export type LocalRuntimeLeaseStatus = "acquiring" | "running" | "idle" | "releasing" | "released" | "crashed";

export interface LocalRuntimeLeaseRecord {
  schemaVersion: "ambient-local-runtime-lease-v1";
  leaseId: string;
  parentThreadId?: string;
  subagentThreadId?: string;
  subagentRunId?: string;
  ownerDisplayName?: string;
  modelRuntimeId?: string;
  modelProfileId?: string;
  modelId?: string;
  providerId?: string;
  capabilityKind: LocalModelResourceRegistryEntry["capability"];
  estimatedResidentMemoryBytes?: number;
  actualResidentMemoryBytes?: number;
  pid?: number;
  endpoint?: string;
  acquiredAt: string;
  lastHeartbeatAt: string;
  status: LocalRuntimeLeaseStatus;
}

export interface LocalRuntimeOwnerSummary {
  leaseId: string;
  parentThreadId?: string;
  subagentThreadId?: string;
  subagentRunId?: string;
  displayName: string;
  status: LocalRuntimeLeaseStatus;
}

export interface LocalRuntimeAffectedSubagent {
  leaseId: string;
  parentThreadId?: string;
  subagentThreadId: string;
  subagentRunId?: string;
  displayName: string;
  status: LocalRuntimeLeaseStatus;
  modelRuntimeId?: string;
  modelProfileId?: string;
  modelId?: string;
  providerId?: string;
  capabilityKind: LocalModelResourceRegistryEntry["capability"];
}

export interface LocalRuntimeLeaseStateSummary {
  activeLeaseIds: string[];
  staleLeaseIds: string[];
  releasedLeaseIds: string[];
  crashedLeaseIds: string[];
  inactiveLeaseIds: string[];
}

export interface LocalRuntimeStopDecision {
  ordinaryStopAllowed: boolean;
  reason: string;
  blockerLeaseIds: string[];
  affectedSubagents: LocalRuntimeAffectedSubagent[];
  forceTerminationAllowed: boolean;
  forceRequiresSubagentCancellation: boolean;
  untracked: boolean;
}

export interface LocalRuntimeLifecycleActionDecision {
  allowed: boolean;
  reason: string;
  blockerLeaseIds: string[];
  affectedSubagents: LocalRuntimeAffectedSubagent[];
  forceAllowed: boolean;
  forceRequiresSubagentCancellation: boolean;
  untracked: boolean;
}

export interface LocalRuntimeLifecycleDecision {
  schemaVersion: "ambient-local-runtime-lifecycle-decision-v1";
  stop: LocalRuntimeLifecycleActionDecision;
  restart: LocalRuntimeLifecycleActionDecision;
  load: LocalRuntimeLifecycleActionDecision;
  unload: LocalRuntimeLifecycleActionDecision;
}

export type LocalRuntimeProviderLifecycleActionKind = "start" | "stop" | "restart";

export interface LocalRuntimeProviderLifecycleAction {
  schemaVersion: "ambient-local-runtime-provider-lifecycle-action-v1";
  kind: LocalRuntimeProviderLifecycleActionKind;
  providerKind: "ambient-cli";
  command: string;
  packageId?: string;
  packageName?: string;
  label?: string;
  description?: string;
  timeoutMs?: number;
}

export interface LocalRuntimeProviderLifecycleControls {
  schemaVersion: "ambient-local-runtime-provider-lifecycle-v1";
  providerKind: "ambient-cli";
  packageId?: string;
  packageName?: string;
  start?: LocalRuntimeProviderLifecycleAction;
  stop?: LocalRuntimeProviderLifecycleAction;
  restart?: LocalRuntimeProviderLifecycleAction;
}

export interface LocalRuntimeInventoryEntry {
  schemaVersion: "ambient-local-runtime-inventory-entry-v1";
  id: string;
  capability: LocalModelResourceRegistryEntry["capability"];
  providerId?: string;
  modelRuntimeId?: string;
  modelProfileId?: string;
  modelId?: string;
  trackingStatus: "managed" | "tracked" | "untracked";
  running: boolean;
  pid?: number;
  endpoint?: string;
  estimatedResidentMemoryBytes?: number;
  actualResidentMemoryBytes?: number;
  memorySampledAt?: string;
  owners: LocalRuntimeOwnerSummary[];
  leases: LocalRuntimeLeaseRecord[];
  leaseState: LocalRuntimeLeaseStateSummary;
  lifecycleDecision: LocalRuntimeLifecycleDecision;
  stopDecision: LocalRuntimeStopDecision;
  providerLifecycle?: LocalRuntimeProviderLifecycleControls;
  startedAt?: string;
  lastUsedAt?: string;
  lastHeartbeatAt?: string;
}

export interface LocalRuntimeInventorySnapshot {
  schemaVersion: "ambient-local-runtime-inventory-v1";
  capturedAt: string;
  entries: LocalRuntimeInventoryEntry[];
  activeLeases: LocalRuntimeLeaseRecord[];
  memoryPolicy?: LocalModelResourcePolicyDecision;
}

export type LocalRuntimePolicyHandoffActionKind = "stop" | "restart" | "load" | "unload";

export interface LocalRuntimePolicyHandoffRuntime {
  runtimeEntryId: string;
  capability: LocalModelResourceRegistryEntry["capability"];
  trackingStatus: "managed" | "tracked" | "untracked";
  running: boolean;
  providerId?: string;
  modelRuntimeId?: string;
  modelProfileId?: string;
  modelId?: string;
  pid?: number;
  endpoint?: string;
  estimatedResidentMemoryBytes?: number;
  actualResidentMemoryBytes?: number;
  memorySampledAt?: string;
  activeLeaseIds: string[];
  staleLeaseIds: string[];
  releasedLeaseIds: string[];
  crashedLeaseIds: string[];
  ordinaryStopAllowed: boolean;
  ordinaryRestartAllowed: boolean;
  untracked: boolean;
}

export interface LocalRuntimePolicyHandoffOwner {
  runtimeEntryId: string;
  leaseId: string;
  parentThreadId?: string;
  subagentThreadId?: string;
  subagentRunId?: string;
  displayName: string;
  status: LocalRuntimeLeaseStatus;
  capabilityKind: LocalModelResourceRegistryEntry["capability"];
  providerId?: string;
  modelRuntimeId?: string;
  modelProfileId?: string;
  modelId?: string;
  estimatedResidentMemoryBytes?: number;
  actualResidentMemoryBytes?: number;
  pid?: number;
  endpoint?: string;
  acquiredAt: string;
  lastHeartbeatAt: string;
}

export interface LocalRuntimePolicyHandoffBlockedAction {
  runtimeEntryId: string;
  action: LocalRuntimePolicyHandoffActionKind;
  reason: string;
  blockerLeaseIds: string[];
  affectedSubagents: LocalRuntimeAffectedSubagent[];
  forceAllowed: boolean;
  forceRequiresSubagentCancellation: boolean;
  untracked: boolean;
}

export interface LocalRuntimePolicyHandoffMemoryEvidence {
  activeEstimatedResidentMemoryBytes: number;
  activeActualResidentMemoryBytes?: number;
  activeResidentMemoryBasis?: LocalModelResourcePolicyDecision["activeResidentMemoryBasis"];
  requestedEstimatedResidentMemoryBytes?: number;
  projectedEstimatedResidentMemoryBytes?: number;
  projectedResidentMemoryBytes?: number;
  projectedSystemMemoryUtilization?: number;
  projectedFreeMemoryBytes?: number;
  projectedFreeMemoryRatio?: number;
  uncertaintyReasons: string[];
  entryCountWithActualRss: number;
  entryCountWithOnlyEstimate: number;
  entryCountWithUnknownMemory: number;
}

export type LocalRuntimePolicyHandoffNextSafeActionKind =
  | "inspect-status"
  | "start-runtime"
  | "stop-runtime"
  | "restart-runtime"
  | "force-stop-runtime"
  | "force-restart-runtime"
  | "wait-for-owner"
  | "ask-user-to-stop-untracked"
  | "review-memory-policy";

export type LocalRuntimePolicyHandoffNextSafeActionSafety =
  | "safe"
  | "requires-approval"
  | "blocked"
  | "external";

export interface LocalRuntimePolicyHandoffOwnershipResolution {
  schemaVersion: "ambient-local-runtime-policy-handoff-ownership-resolution-v1";
  required: true;
  lifecycleAction: "stop" | "restart";
  resolution: "cancel-or-mark-affected-subagents";
  requiresInventoryRefresh: true;
  reason: string;
  blockerLeaseIds: string[];
  affectedSubagents: LocalRuntimeAffectedSubagent[];
}

export interface LocalRuntimePolicyHandoffNextSafeAction {
  action: LocalRuntimePolicyHandoffNextSafeActionKind;
  safety: LocalRuntimePolicyHandoffNextSafeActionSafety;
  reason: string;
  runtimeEntryId?: string;
  runtimeId?: string;
  capability?: LocalModelResourceRegistryEntry["capability"];
  toolName?:
    | "ambient_local_model_runtime_status"
    | "ambient_local_model_runtime_start"
    | "ambient_local_model_runtime_stop"
    | "ambient_local_model_runtime_restart";
  toolParams?: {
    includeStopped?: boolean;
    limit?: number;
    runtimeId?: string;
    dryRun?: boolean;
    force?: boolean;
  };
  blockerLeaseIds?: string[];
  affectedSubagents?: LocalRuntimeAffectedSubagent[];
  ownershipResolution?: LocalRuntimePolicyHandoffOwnershipResolution;
  untracked?: boolean;
}

export interface LocalRuntimePolicyHandoffSnapshot {
  schemaVersion: "ambient-local-runtime-policy-handoff-v1";
  capturedAt: string;
  runtimeCount: number;
  runningCount: number;
  activeLeaseCount: number;
  blockedActionCount: number;
  stopBlockedRuntimeIds: string[];
  restartBlockedRuntimeIds: string[];
  untrackedRuntimeIds: string[];
  memoryPolicy?: LocalModelResourcePolicyDecision;
  memoryEvidence: LocalRuntimePolicyHandoffMemoryEvidence;
  runtimes: LocalRuntimePolicyHandoffRuntime[];
  activeOwners: LocalRuntimePolicyHandoffOwner[];
  blockedActions: LocalRuntimePolicyHandoffBlockedAction[];
  stopBlockers: LocalRuntimePolicyHandoffBlockedAction[];
  nextSafeActions: LocalRuntimePolicyHandoffNextSafeAction[];
}

export type LocalModelRuntimeLifecycleActionKind = "start" | "stop" | "restart";

export type LocalModelRuntimeLifecycleActionStatus =
  | "ready"
  | "started"
  | "stopped"
  | "restarted"
  | "blocked"
  | "not-found"
  | "failed"
  | "unavailable";

export interface LocalModelRuntimeLifecycleActionInput {
  action: LocalModelRuntimeLifecycleActionKind;
  runtimeId: string;
  force?: boolean;
  dryRun?: boolean;
}

export interface LocalModelRuntimeLifecycleActionSnapshot {
  inventory: LocalRuntimeInventorySnapshot;
  localModelResources: LocalModelResourceRegistrySnapshot;
}

export interface LocalModelRuntimeLifecycleActionResult {
  schemaVersion: "ambient-local-model-runtime-lifecycle-action-v1";
  action: LocalModelRuntimeLifecycleActionKind;
  runtimeId: string;
  status: LocalModelRuntimeLifecycleActionStatus;
  message: string;
  dryRun: boolean;
  forceRequested: boolean;
  before: LocalModelRuntimeLifecycleActionSnapshot;
  after?: LocalModelRuntimeLifecycleActionSnapshot;
}

export type VoiceMode = "off" | "assistant-final" | "always" | "tagged";

export type VoiceLongReplyBehavior = "summarize" | "skip" | "ask";

export type VoiceOutputFormat = "mp3" | "wav" | "ogg";

export interface VoiceSettings {
  enabled: boolean;
  mode: VoiceMode;
  autoplay: boolean;
  providerCapabilityId?: string;
  voiceId?: string;
  preferredVoicesByProvider?: Record<string, string>;
  maxChars: number;
  longReply: VoiceLongReplyBehavior;
  format: VoiceOutputFormat;
  artifactCacheMaxMb: number;
}

export type VoiceSettingsAuditSource = "settings-ui" | "chat-tool" | "system";

export interface VoiceSettingsAuditChange {
  field: keyof VoiceSettings;
  previous?: string;
  next?: string;
}

export interface VoiceSettingsAuditEntry {
  id: string;
  createdAt: string;
  source: VoiceSettingsAuditSource;
  summary: string;
  changes: VoiceSettingsAuditChange[];
  toolName?: string;
  threadId?: string;
}

export type VoiceProviderVoiceSource = "declared" | "dynamic-cache";

export interface VoiceProviderVoiceCandidate {
  id: string;
  label?: string;
  source?: VoiceProviderVoiceSource;
  locale?: string;
  language?: string;
  style?: string[];
}

export interface VoiceProviderVoiceCatalogSummary {
  cacheStatus: "none" | "fresh" | "stale";
  refreshedAt?: string;
  expiresAt?: string;
  source?: VoiceProviderDiscoverySource;
  voiceCount: number;
  dynamicVoiceCount: number;
}

export interface VoiceProviderCandidate {
  packageId: string;
  packageName: string;
  command: string;
  capabilityId: string;
  providerId: string;
  label: string;
  description?: string;
  format: VoiceOutputFormat;
  formats: VoiceOutputFormat[];
  voices: VoiceProviderVoiceCandidate[];
  voiceCatalog?: VoiceProviderVoiceCatalogSummary;
  local?: boolean;
  voiceDiscovery?: VoiceProviderDiscoveryMetadata;
  voiceCloning?: VoiceProviderCloningMetadata;
  providerLifecycle?: LocalRuntimeProviderLifecycleControls;
  installed: boolean;
  available: boolean;
  availabilityReason: string;
  diagnostics?: VoiceProviderDiagnostics;
}

export interface RefreshVoiceProviderVoicesInput {
  providerCapabilityId: string;
}

export interface RefreshVoiceProviderVoicesResult {
  providerCapabilityId: string;
  providerLabel: string;
  source?: VoiceProviderDiscoverySource;
  refreshedAt: string;
  expiresAt?: string;
  voiceCount: number;
  durationMs: number;
  stdoutArtifactPath?: string;
  stderrArtifactPath?: string;
}

export type VoiceProviderDiscoverySource = "cloud-api" | "local-model-directory" | "local-runtime" | "custom";

export interface VoiceProviderDynamicVoice {
  id: string;
  label?: string;
  locale?: string;
  language?: string;
  gender?: string;
  style?: string[];
  description?: string;
  previewText?: string;
  cloned?: boolean;
  providerMetadata?: Record<string, unknown>;
}

export interface VoiceProviderDiscoveryMetadata {
  command: string;
  cacheTtlSeconds?: number;
  requiresNetwork?: boolean;
  requiresSecret?: string[];
  source?: VoiceProviderDiscoverySource;
}

export type VoiceProviderCloningMode = "cloud" | "local";

export type VoiceProviderCloneOutputKind = "provider-voice-id" | "local-model-asset" | "dynamic-cache-voice";

export interface VoiceProviderCloningInputMetadata {
  audioFormats: string[];
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  minSamples?: number;
  maxSamples?: number;
  transcript?: "required" | "optional" | "unsupported";
}

export interface VoiceProviderCloningMetadata {
  supported: boolean;
  createCommand?: string;
  statusCommand?: string;
  deleteCommand?: string;
  mode?: VoiceProviderCloningMode;
  inputs?: VoiceProviderCloningInputMetadata;
  requiresConsent?: boolean;
  requiresSecret?: string[];
  networkHosts?: string[];
  costNote?: string;
  privacyNote?: string;
  output?: {
    creates: VoiceProviderCloneOutputKind[];
    appearsInDynamicCatalog?: boolean;
  };
}

export type VoiceProviderHealthStatus = "passed" | "failed" | "unknown";

export type VoiceProviderRuntimeStateStatus = "running" | "stopped" | "unavailable" | "unknown";

export interface VoiceProviderRuntimeState {
  schemaVersion: "ambient-voice-provider-runtime-state-v1";
  status: VoiceProviderRuntimeStateStatus;
  running: boolean;
  trackingStatus?: "managed" | "tracked" | "untracked";
  modelRuntimeId?: string;
  modelProfileId?: string;
  modelId?: string;
  pid?: number;
  endpoint?: string;
  statePath?: string;
  estimatedResidentMemoryBytes?: number;
  actualResidentMemoryBytes?: number;
  memorySampledAt?: string;
  startedAt?: string;
  lastUsedAt?: string;
  lastHeartbeatAt?: string;
  reason?: string;
  providerLifecycle?: LocalRuntimeProviderLifecycleControls;
}

export interface VoiceProviderDiagnostics {
  healthStatus: VoiceProviderHealthStatus;
  healthCommand?: string[];
  healthCwd?: string;
  healthError?: string;
  stdoutArtifactPath?: string;
  stderrArtifactPath?: string;
  missingHints: string[];
  runtimeState?: VoiceProviderRuntimeState;
}

export type EmbeddingProviderHealthStatus = VoiceProviderHealthStatus;

export type EmbeddingProviderRuntimeStateStatus = VoiceProviderRuntimeStateStatus;

export interface EmbeddingProviderRuntimeState {
  schemaVersion: "ambient-embedding-provider-runtime-state-v1";
  status: EmbeddingProviderRuntimeStateStatus;
  running: boolean;
  trackingStatus?: "managed" | "tracked" | "untracked";
  modelRuntimeId?: string;
  modelProfileId?: string;
  modelId?: string;
  pid?: number;
  endpoint?: string;
  statePath?: string;
  estimatedResidentMemoryBytes?: number;
  actualResidentMemoryBytes?: number;
  memorySampledAt?: string;
  startedAt?: string;
  lastUsedAt?: string;
  lastHeartbeatAt?: string;
  reason?: string;
  providerLifecycle?: LocalRuntimeProviderLifecycleControls;
}

export interface EmbeddingProviderDiagnostics {
  healthStatus: EmbeddingProviderHealthStatus;
  healthCommand?: string[];
  healthCwd?: string;
  healthError?: string;
  stdoutArtifactPath?: string;
  stderrArtifactPath?: string;
  missingHints: string[];
  runtimeState?: EmbeddingProviderRuntimeState;
}

export interface EmbeddingProviderCandidate {
  packageId: string;
  packageName: string;
  command: string;
  capabilityId: string;
  providerId: string;
  label: string;
  description?: string;
  modelId?: string;
  dimensions?: number;
  local?: boolean;
  providerLifecycle?: LocalRuntimeProviderLifecycleControls;
  installed: boolean;
  available: boolean;
  availabilityReason: string;
  diagnostics?: EmbeddingProviderDiagnostics;
}

export type SttMode = "push-to-talk";

export interface SttNoSpeechGateSettings {
  enabled: boolean;
  rmsThresholdDbfs: number;
}

export interface SttBargeInSettings {
  stopTtsOnSpeech: boolean;
  queueWhileAgentRuns: boolean;
}

export interface SttMicrophoneSettings {
  deviceId?: string;
  label?: string;
}

export interface SttSettings {
  enabled: boolean;
  providerCapabilityId?: string;
  spokenLanguage: string;
  pushToTalkShortcut?: string;
  microphone?: SttMicrophoneSettings;
  mode: SttMode;
  autoSendAfterTranscription: boolean;
  silenceFinalizeSeconds: number;
  noSpeechGate: SttNoSpeechGateSettings;
  bargeIn: SttBargeInSettings;
}

export type SttProviderHealthStatus = VoiceProviderHealthStatus;

export type SttProviderSetupProvider = "qwen3-asr";

export type SttProviderSetupAction = "install" | "repair" | "validate";

export type SttProviderSetupStatus = "installed" | "ready" | "needs-runtime" | "validation-failed" | "failed";

export type SttProviderValidationStatus = "not-run" | "runtime-ready" | "passed" | "needs-runtime" | "failed";

export interface SttProviderRuntimeCandidate {
  path: string;
  source: "process-env" | "path" | "known-location" | "user" | "installer";
  available: boolean;
  reason?: string;
}

export type SttProviderRuntimeInstallStatus = "skipped" | "already-installed" | "installed" | "failed" | "unsupported";

export interface SttProviderRuntimeInstallResult {
  attempted: boolean;
  status: SttProviderRuntimeInstallStatus;
  manager?: "homebrew";
  packageName?: string;
  binaryPath?: string;
  command?: string[];
  stdoutPreview?: string;
  stderrPreview?: string;
  durationMs?: number;
  error?: string;
  missingHints: string[];
}

export interface SttProviderAssetFileSummary {
  role: "model" | "mmproj" | "runtime";
  filename: string;
  sizeBytes: number;
  sha256: string;
}

export interface SttProviderAssetManifestSummary {
  schemaVersion: "ambient-stt-qwen3-asr-assets-v1";
  version: string;
  model: {
    id: string;
    repo: string;
    revision: string;
    files: SttProviderAssetFileSummary[];
  };
  runtime: {
    directDownloadsEnabled: boolean;
    lanes: string[];
  };
}

export interface SttProviderValidationMetadata {
  schemaVersion: "ambient-stt-provider-validation-v1";
  provider: SttProviderSetupProvider;
  packageName: string;
  providerCapabilityId?: string;
  status: SttProviderValidationStatus;
  updatedAt: string;
  platform: string;
  arch: string;
  lane: string;
  binaryPath?: string;
  runtimeVersion?: string;
  model?: string;
  modelSource?: string;
  assetManifest?: SttProviderAssetManifestSummary;
  validationAudioPath?: string;
  validationTranscript?: string;
  durationMs?: number;
  error?: string;
  missingHints: string[];
}

export interface SttProviderSetupInput {
  provider: SttProviderSetupProvider;
  action?: SttProviderSetupAction;
  installRuntime?: boolean;
  runtimeBinaryPath?: string;
  validationAudioPath?: string;
  spokenLanguage?: string;
  selectProvider?: boolean;
  enable?: boolean;
}

export interface SttProviderSetupResult {
  provider: SttProviderSetupProvider;
  action: SttProviderSetupAction;
  status: SttProviderSetupStatus;
  packageName: string;
  installStatuses: Array<{
    packageName: string;
    source: string;
    status: "installed" | "already_installed" | "failed";
    packageId?: string;
    error?: string;
  }>;
  runtimeInstall?: SttProviderRuntimeInstallResult;
  selectedProvider?: SttProviderCandidate;
  providers: SttProviderCandidate[];
  validation: SttProviderValidationMetadata;
  runtimeCandidates: SttProviderRuntimeCandidate[];
  nextSteps: string[];
}

export type MiniCpmVisionProvider = "minicpm-v";

export type MiniCpmVisionSetupAction = "install" | "repair" | "validate" | "stop" | "uninstall";

export type MiniCpmVisionSetupStatus = "ready" | "stopped" | "needs-runtime" | "validation-failed" | "failed" | "uninstalled";

export type MiniCpmVisionValidationStatus = "not-run" | "runtime-ready" | "passed" | "stopped" | "needs-runtime" | "failed" | "uninstalled";

export type MiniCpmVisionDiagnosticCode =
  | "missing-runtime-binary"
  | "missing-ffmpeg"
  | "endpoint-refused"
  | "remote-endpoint-blocked"
  | "timeout-or-stall"
  | "invalid-model-output-schema"
  | "image-preprocessor-failure"
  | "unsupported-model-format"
  | "model-download-failed"
  | "insufficient-disk"
  | "insufficient-memory"
  | "accelerator-unavailable"
  | "input-permission-or-path"
  | "package-install-failed"
  | "unknown-failure";

export type MiniCpmVisionDiagnosticSeverity = "info" | "warning" | "error";

export interface MiniCpmVisionDiagnosticItem {
  code: MiniCpmVisionDiagnosticCode;
  severity: MiniCpmVisionDiagnosticSeverity;
  title: string;
  detail: string;
  nextAction: string;
}

export type MiniCpmVisionTask =
  | "ui_review"
  | "game_visual_review"
  | "screenshot_ocr"
  | "image_description"
  | "design_comparison"
  | "video_frame_review";

export interface MiniCpmVisionRuntimeCandidate {
  path: string;
  source: "process-env" | "path" | "known-location" | "user" | "ambient-managed-runtime";
  available: boolean;
  reason?: string;
}

export type MiniCpmVisionRuntimeAcquisitionMode =
  | "user-managed-runtime"
  | "ambient-managed-runtime"
  | "ambient-managed-download"
  | "existing-local-endpoint";

export type MiniCpmVisionRuntimeContractStatus = "active" | "planned" | "blocked";

export type MiniCpmVisionRuntimeReleaseSupportTier = "conditional" | "experimental";

export type MiniCpmVisionRuntimeReleasePinStatus = "candidate" | "pinned" | "blocked";

export type MiniCpmVisionRuntimeReleaseCheckStatus = "passed" | "warning" | "failed" | "blocked" | "not-run";

export interface MiniCpmVisionRuntimeReleaseArtifact {
  id: string;
  platform: "darwin" | "linux" | "win32";
  arch: string;
  lane: string;
  supportTier: MiniCpmVisionRuntimeReleaseSupportTier;
  acceleration: string;
  defaultDownloadEnabled: boolean;
  releaseTag: string;
  sourceUrl: string;
  archiveName: string;
  archiveFormat: "zip" | "tar.gz" | "tgz";
  archiveSha256: string;
  archiveSizeBytes?: number;
  binaryRelativePath: string;
  binarySha256?: string;
  expectedBinaryNames: string[];
  cacheSubdir: string;
  license: string;
  pinStatus: MiniCpmVisionRuntimeReleasePinStatus;
  smokeRequirements: string[];
}

export interface MiniCpmVisionRuntimeReleaseManifest {
  schemaVersion: "ambient-minicpm-v-runtime-release-manifest-v1";
  manifestId: string;
  downloadEnabled: boolean;
  checksumAlgorithm: "sha256";
  requiredArtifactFields: string[];
  artifacts: MiniCpmVisionRuntimeReleaseArtifact[];
  blockers: string[];
  notes: string[];
}

export interface MiniCpmVisionRuntimeReleaseManifestCheck {
  id: string;
  label: string;
  status: MiniCpmVisionRuntimeReleaseCheckStatus;
  detail: string;
}

export interface MiniCpmVisionRuntimeReleaseManifestVerification {
  schemaVersion: "ambient-minicpm-v-runtime-release-manifest-v1";
  manifestId: string;
  status: "passed" | "warning" | "failed" | "blocked";
  downloadEnabled: boolean;
  checksumAlgorithm: "sha256";
  selectedArtifactId?: string;
  requiredArtifactFields: string[];
  artifacts: MiniCpmVisionRuntimeReleaseArtifact[];
  checks: MiniCpmVisionRuntimeReleaseManifestCheck[];
  blockers: string[];
  verifiedArchivePath?: string;
  verifiedArchiveSha256?: string;
  verifiedBinaryPath?: string;
  verifiedBinarySha256?: string;
}

export interface MiniCpmVisionRuntimePreflightCheck {
  id: string;
  label: string;
  status: "passed" | "warning" | "failed" | "not-run";
  detail: string;
}

export interface MiniCpmVisionRuntimeContract {
  mode: MiniCpmVisionRuntimeAcquisitionMode;
  status: MiniCpmVisionRuntimeContractStatus;
  runtime: string;
  binaryPath?: string;
  binarySource?: MiniCpmVisionRuntimeCandidate["source"];
  endpoint?: string;
  version?: string;
  runtimeCacheRoot: string;
  modelCacheRoots: string[];
  modelAssets: string[];
  installPlan: string[];
  preflight: MiniCpmVisionRuntimePreflightCheck[];
  ambientManagedDownload: {
    status: MiniCpmVisionRuntimeContractStatus;
    cacheRoot: string;
    requirements: string[];
    blockers: string[];
    manifestVerification?: MiniCpmVisionRuntimeReleaseManifestVerification;
  };
}

export interface MiniCpmVisionImageSummary {
  path: string;
  basename: string;
  bytes: number;
  sha256: string;
  role?: "primary" | "reference";
  source?: MiniCpmVisionImageSummarySource;
  label?: string;
  copiedFromExternalPath?: boolean;
}

export type MiniCpmVisionImageSummarySource = MiniCpmVisionImageInputSource | "video_frame";

export type MiniCpmVisionImageInputSource =
  | "workspace_file"
  | "browser_screenshot"
  | "chat_attachment"
  | "media_artifact"
  | "selected_screenshot"
  | "external_file";

export interface MiniCpmVisionImageInputReference {
  path: string;
  absolute?: boolean;
  source?: MiniCpmVisionImageInputSource;
  label?: string;
}

export interface MiniCpmVisionBrowserScreenshotInputReference {
  ref?: "latest";
  artifactRef?: "latest_browser_screenshot";
  label?: string;
}

export type MiniCpmVisionVideoInputSource =
  | "workspace_file"
  | "chat_attachment"
  | "media_artifact"
  | "external_file";

export interface MiniCpmVisionVideoInputReference {
  path: string;
  absolute?: boolean;
  source?: MiniCpmVisionVideoInputSource;
  label?: string;
  frameTimestampMs?: number;
}

export interface MiniCpmVisionVideoSummary {
  path: string;
  basename: string;
  bytes: number;
  sha256: string;
  source?: MiniCpmVisionVideoInputSource;
  label?: string;
  copiedFromExternalPath?: boolean;
  frameTimestampMs: number;
  frameImagePath?: string;
}

export interface MiniCpmVisionCleanupPathResult {
  path: string;
  status: "removed" | "not-found" | "failed";
  error?: string;
}

export interface MiniCpmVisionRuntimeState {
  status: "running" | "stopped" | "not_running" | "starting_or_unhealthy" | "unknown";
  running: boolean;
  recordedAt: string;
  pid?: number;
  previousPid?: number;
  endpoint?: string;
  endpointMode?: "managed-local-server" | "existing-local-endpoint";
  model?: string;
  reason?: string;
  logPath?: string;
  stderrPath?: string;
  stoppedAt?: string;
}

export interface MiniCpmVisionCleanupResult {
  stopStatus: "stopped" | "not-installed" | "failed";
  stopError?: string;
  packageStatus: "uninstalled" | "not-installed" | "failed";
  packageId?: string;
  packageRootPath?: string;
  packageError?: string;
  paths: MiniCpmVisionCleanupPathResult[];
  preserved: string[];
}

export interface MiniCpmVisionRuntimeInstallResult {
  attempted: boolean;
  status: "installed" | "already-installed" | "failed" | "unsupported";
  source: "local-archive" | "managed-download";
  artifactId?: string;
  downloadUrl?: string;
  downloadStatus?: "downloaded" | "reused";
  downloadBytes?: number;
  downloadDurationMs?: number;
  downloadPreResponseTimeoutMs?: number;
  downloadIdleTimeoutMs?: number;
  archivePath?: string;
  archiveSha256?: string;
  binaryPath?: string;
  binarySha256?: string;
  cacheSubdir?: string;
  installRoot?: string;
  receiptPath?: string;
  rollback?: "not-needed" | "restored-previous-install" | "failed";
  macosQuarantine?: "present" | "not-present" | "not-checked";
  macosSecurity?: MiniCpmVisionRuntimeMacosSecurity;
  manifestVerification?: MiniCpmVisionRuntimeReleaseManifestVerification;
  error?: string;
  missingHints: string[];
}

export interface MiniCpmVisionRuntimeMacosSecurity {
  platform: "darwin";
  quarantineBefore: "present" | "not-present" | "not-checked";
  quarantineAction: "not-needed" | "removed-after-checksum" | "failed";
  quarantineAfter: "present" | "not-present" | "not-checked";
  codeSignature: "valid" | "unsigned" | "invalid" | "not-run";
  codeSignatureDetail?: string;
  gatekeeperAssessment: "accepted" | "rejected" | "not-run";
  gatekeeperDetail?: string;
  defaultDownloadPromotion: "blocked" | "eligible";
  promotionPolicy?: "gatekeeper-accepted" | "ambient-managed-valid-signature";
  promotionBlocker?: string;
}

export interface MiniCpmVisionValidationMetadata {
  schemaVersion: "ambient-minicpm-v-provider-validation-v1";
  provider: MiniCpmVisionProvider;
  packageName: string;
  status: MiniCpmVisionValidationStatus;
  updatedAt: string;
  platform: string;
  arch: string;
  lane: string;
  binaryPath?: string;
  runtimeVersion?: string;
  model?: string;
  experimentalModel?: string;
  endpoint?: string;
  endpointMode?: "managed-local-server" | "existing-local-endpoint";
  endpointModelIds?: string[];
  artifactPath?: string;
  image?: MiniCpmVisionImageSummary;
  summary?: string;
  durationMs?: number;
  error?: string;
  missingHints: string[];
  diagnostics?: MiniCpmVisionDiagnosticItem[];
  runtimeContract?: MiniCpmVisionRuntimeContract;
  runtimeState?: MiniCpmVisionRuntimeState;
  cleanup?: MiniCpmVisionCleanupResult;
  runtimeInstall?: MiniCpmVisionRuntimeInstallResult;
}

export interface MiniCpmVisionSetupInput {
  provider: MiniCpmVisionProvider;
  action?: MiniCpmVisionSetupAction;
  installRuntime?: boolean;
  runtimeBinaryPath?: string;
  runtimeArchivePath?: string;
  runtimeArtifactId?: string;
  endpointUrl?: string;
  validationImagePath?: string;
  validationTask?: MiniCpmVisionTask;
  validationPrompt?: string;
}

export interface MiniCpmVisionSetupResult {
  provider: MiniCpmVisionProvider;
  action: MiniCpmVisionSetupAction;
  status: MiniCpmVisionSetupStatus;
  packageName: string;
  installStatuses: Array<{
    packageName: string;
    source: string;
    status: "installed" | "already_installed" | "failed";
    packageId?: string;
    error?: string;
  }>;
  runtimeCandidates: MiniCpmVisionRuntimeCandidate[];
  validation: MiniCpmVisionValidationMetadata;
  diagnostics: MiniCpmVisionDiagnosticItem[];
  runtimeContract?: MiniCpmVisionRuntimeContract;
  cleanup?: MiniCpmVisionCleanupResult;
  runtimeInstall?: MiniCpmVisionRuntimeInstallResult;
  statusPayload?: Record<string, unknown>;
  nextSteps: string[];
}

export interface MiniCpmVisionAnalyzeInput {
  imagePath?: string;
  image?: MiniCpmVisionImageInputReference;
  browserScreenshot?: MiniCpmVisionBrowserScreenshotInputReference;
  videoPath?: string;
  video?: MiniCpmVisionVideoInputReference;
  frameTimestampMs?: number;
  referenceImagePath?: string;
  referenceImage?: MiniCpmVisionImageInputReference;
  task?: MiniCpmVisionTask;
  prompt?: string;
  outputJsonPath?: string;
  runtimeBinaryPath?: string;
  endpointUrl?: string;
  allowExternalImagePaths?: boolean;
  allowExternalMediaPaths?: boolean;
  startServer?: boolean;
  stopAfter?: boolean;
  offline?: boolean;
  waitMs?: number;
  requestTimeoutMs?: number;
  maxTokens?: number;
}

export type MiniCpmVisionObservationKind =
  | "layout"
  | "text"
  | "affordance"
  | "defect"
  | "visual_quality"
  | "accessibility"
  | "gameplay"
  | "uncertainty";

export interface MiniCpmVisionObservation {
  kind: MiniCpmVisionObservationKind;
  description: string;
  confidence: "low" | "medium" | "high";
  evidence: string;
}

export interface MiniCpmVisionAnalysisCommandSummary {
  command: "status" | "start" | "analyze" | "stop";
  durationMs?: number;
  stdoutArtifactPath?: string;
  stderrArtifactPath?: string;
}

export interface MiniCpmVisionAnalysisResult {
  provider: MiniCpmVisionProvider;
  status: "passed";
  packageName: string;
  task: MiniCpmVisionTask;
  prompt: string;
  model?: string;
  endpoint?: string;
  latencyMs?: number;
  durationMs: number;
  summary: string;
  observations: MiniCpmVisionObservation[];
  limitations: string[];
  image: MiniCpmVisionImageSummary;
  video?: MiniCpmVisionVideoSummary;
  referenceImage?: MiniCpmVisionImageSummary;
  inputImages?: MiniCpmVisionImageSummary[];
  sampledFrames?: MiniCpmVisionImageSummary[];
  artifacts: {
    jsonPath: string;
    fullJsonPath?: string;
  };
  installStatuses: MiniCpmVisionSetupResult["installStatuses"];
  commands: MiniCpmVisionAnalysisCommandSummary[];
  validation: {
    valid: boolean;
    errors: string[];
  };
  redaction: {
    returnedImagePathIsWorkspaceRelative: boolean;
    stdoutDoesNotContainAbsoluteImagePath: boolean;
    artifactPathIsWorkspaceRelative: boolean;
  };
}

export type LocalDeepResearchSetupAction = "status" | "install" | "repair" | "validate" | "smoke";

export type LocalDeepResearchSetupStatus = "ready" | "needs-install" | "blocked";

export type LocalDeepResearchInstallState = "installed" | "missing";

export type LocalDeepResearchModelProfileId = "literesearcher-4b-q4-k-m" | "literesearcher-4b-q8-0";

export type LocalDeepResearchQuantization = "Q4_K_M" | "Q8_0";

export type LocalDeepResearchMemoryTier = "unknown" | "constrained" | "standard" | "high" | "workstation";

export type LocalDeepResearchContextMode = "safe-8k" | "target-16k" | "target-32k" | "target-48k" | "target-64k";

export type LocalDeepResearchQ8OverrideDecision = "not-requested" | "accepted" | "warned" | "rejected";

export interface LocalDeepResearchSetupInput {
  action?: LocalDeepResearchSetupAction;
  q8Override?: boolean;
  installModel?: boolean;
  installRuntime?: boolean;
  runtimeArtifactId?: string;
}

export interface LocalDeepResearchModelProfileSummary {
  id: LocalDeepResearchModelProfileId;
  displayName: string;
  repoId: string;
  revision: string;
  filename: string;
  quantization: LocalDeepResearchQuantization;
  role: "everyday" | "high-quality";
  sourceUrl: string;
  sizeBytes: number;
  sha256: string;
  xetHash: string;
  licenseNote: string;
  defaultContextTokens: number;
  safeContextTokens: number;
  minimumMemoryBytes: number;
  recommendedMemoryBytes: number;
  estimatedResidentMemoryBytes: {
    safe8k: number;
    target16k: number;
  };
  notes: string[];
}

export interface LocalDeepResearchModelSelectionSummary {
  profile: LocalDeepResearchModelProfileSummary;
  fallbackProfile?: LocalDeepResearchModelProfileSummary;
  memoryTier: LocalDeepResearchMemoryTier;
  contextMode: LocalDeepResearchContextMode;
  contextTokens: number;
  q8OverrideDecision: LocalDeepResearchQ8OverrideDecision;
  warnings: string[];
  blockers: string[];
  rationale: string[];
}

export interface LocalDeepResearchModelInstallSummary {
  status: LocalDeepResearchInstallState;
  selectedProfileId: LocalDeepResearchModelProfileId;
  filename: string;
  sourceUrl: string;
  sizeBytes: number;
  sha256: string;
  contextTokens: number;
}

export interface LocalDeepResearchRuntimeSummary {
  status: "ready" | "needs-install" | "blocked";
  source: "shared-llama-cpp-runtime";
  manifestId: string;
  selectedArtifactId?: string;
  verification: MiniCpmVisionRuntimeReleaseManifestVerification;
}

export interface LocalDeepResearchInstallerShape {
  schemaVersion: "ambient-local-model-installer-shape-v1";
  installerKind: "local-model";
  capabilityId: "local.deep-research.literesearcher";
  modelFamily: "LiteResearcher-4B";
  modelProfileId: LocalDeepResearchModelProfileId;
  modelDisplayName: string;
  quantization: LocalDeepResearchQuantization;
  runtime: {
    source: "shared-llama-cpp-runtime";
    manifestId: string;
    status: "ready" | "needs-install" | "blocked";
    selectedArtifactId?: string;
    downloadBytes?: number;
  };
  disk: {
    managedRootKind: "workspace-managed-state";
    modelDownloadBytes: number;
    runtimeDownloadBytes?: number;
    expectedDiskBytes: number;
    cacheRoots: string[];
  };
  memory: {
    memoryTier: LocalDeepResearchMemoryTier;
    contextMode: LocalDeepResearchContextMode;
    contextTokens: number;
    estimatedResidentMemoryBytes: number;
    activeLocalModelCount: number;
    activeLocalModelEstimatedResidentMemoryBytes: number;
    fit: "selected" | "warning" | "blocked";
    warnings: string[];
    blockers: string[];
  };
  server: {
    host: "127.0.0.1";
    port: "auto";
    portAllocation: "loopback-auto-on-launch";
    lifecycle: "lease-managed";
    idleTimeoutMs: number;
    startsOnActions: Array<Extract<LocalDeepResearchSetupAction, "smoke"> | "run">;
  };
  confirmation: {
    required: true;
    requiredForActions: Array<Extract<LocalDeepResearchSetupAction, "install" | "repair" | "smoke">>;
    reasons: string[];
  };
  lifecycle: {
    progressEvent: "local-deep-research-install-progress";
    progressPhases: LocalDeepResearchInstallProgressPhase[];
    cancellation: {
      supported: true;
      mechanism: "tool-abort-signal";
      resumableDownloads: true;
    };
    logs: {
      installJobRoot: ".ambient/local-deep-research/install-jobs";
      serverStateRoot: ".ambient/local-deep-research/llama-server";
    };
    cleanup: {
      managedModelRoot: ".ambient/local-deep-research/models";
      managedRuntimeRoot: ".ambient/vision/minicpm-v/runtime";
      action: "settings-managed-cleanup";
    };
    smokeTest: {
      setupAction: Extract<LocalDeepResearchSetupAction, "smoke">;
      queryKind: "tiny-local-chat";
    };
  };
}

export interface LocalDeepResearchProviderSnapshot {
  schemaVersion: "ambient-local-deep-research-provider-snapshot-v1";
  capturedAt: string;
  activeProvider?: LocalDeepResearchProviderConfig;
  providerOrder: string[];
  skippedProviders: Array<{
    providerId: string;
    reason: string;
  }>;
  providers: WebResearchProviderConfig[];
  searchOrder: string[];
  fetchOrder: string[];
  skippedSearchProviders: Array<{
    providerId: string;
    reason: string;
  }>;
  skippedFetchProviders: Array<{
    providerId: string;
    reason: string;
  }>;
  fallbackPolicy: WebResearchFallbackPolicy;
}

export interface LocalDeepResearchModelCacheDetection {
  status: "missing" | "present" | "mismatch";
  profileId: LocalDeepResearchModelProfileId;
  filename: string;
  cachePath: string;
  expectedSizeBytes: number;
  expectedSha256: string;
  sizeBytes?: number;
  verification: "not-run" | "size-matched" | "size-mismatch" | "path-invalid";
  reason?: string;
}

export interface LocalDeepResearchRuntimeCacheDetection {
  status: "missing" | "present" | "mismatch" | "unsupported";
  source: "shared-llama-cpp-runtime";
  manifestId: string;
  artifactId?: string;
  cacheSubdir?: string;
  binaryPath?: string;
  receiptPath?: string;
  verification: "not-supported" | "binary-present" | "binary-missing" | "path-invalid";
  reason?: string;
}

export interface LocalDeepResearchManagedAssetDetection {
  schemaVersion: "ambient-local-deep-research-managed-assets-v1";
  managedRoot: string;
  model: LocalDeepResearchModelCacheDetection;
  runtime: LocalDeepResearchRuntimeCacheDetection;
  warnings: string[];
}

export interface LocalDeepResearchModelInstallResult {
  attempted: boolean;
  status: "installed" | "already-installed" | "failed" | "skipped";
  profileId: LocalDeepResearchModelProfileId;
  filename: string;
  sourceUrl: string;
  cachePath: string;
  bytes?: number;
  sha256?: string;
  downloadStatus?: "downloaded" | "resumed" | "reused";
  downloadDurationMs?: number;
  error?: string;
  missingHints: string[];
}

export type LocalDeepResearchInstallProgressPhase =
  | "preflight"
  | "model-cache-check"
  | "model-download-started"
  | "model-download-progress"
  | "model-download-verified"
  | "model-installed"
  | "model-reused"
  | "runtime-install-started"
  | "runtime-install-completed"
  | "validation-ready"
  | "failed";

export interface LocalDeepResearchInstallProgress {
  schemaVersion: "ambient-local-deep-research-install-progress-v1";
  jobId?: string;
  action: Extract<LocalDeepResearchSetupAction, "install" | "repair">;
  component: "setup" | "model" | "runtime" | "validation";
  phase: LocalDeepResearchInstallProgressPhase;
  status: "running" | "completed" | "failed";
  message: string;
  profileId?: LocalDeepResearchModelProfileId;
  filename?: string;
  artifactId?: string;
  bytesReceived?: number;
  totalBytes?: number;
  percent?: number;
  recordedAt: string;
}

export interface LocalDeepResearchInstallResult {
  schemaVersion: "ambient-local-deep-research-install-result-v1";
  status: "installed" | "already-installed" | "partial" | "failed" | "skipped";
  modelInstall?: LocalDeepResearchModelInstallResult;
  runtimeInstall?: MiniCpmVisionRuntimeInstallResult;
  managedAssets: LocalDeepResearchManagedAssetDetection;
  nextActions: string[];
}

export type LocalDeepResearchValidationStatus = "passed" | "needs-install" | "blocked" | "failed";

export type LocalDeepResearchValidationCheckStatus = "passed" | "warning" | "failed" | "blocked";

export interface LocalDeepResearchValidationCheck {
  id: string;
  title: string;
  status: LocalDeepResearchValidationCheckStatus;
  detail: string;
  nextAction?: string;
}

export type LocalDeepResearchValidationMemoryTelemetryStatus = "recorded" | "blocked";

export type LocalDeepResearchValidationPhysicalMemoryClass = "16gb" | "32gb" | "64gb" | "128gb-plus" | "unknown";

export type LocalDeepResearchValidationTargetPhysicalMemoryClass = Exclude<LocalDeepResearchValidationPhysicalMemoryClass, "unknown">;

export interface LocalDeepResearchValidationMemoryTelemetrySummary {
  status: LocalDeepResearchValidationMemoryTelemetryStatus;
  capturedAt: string;
  physicalMemoryClass: LocalDeepResearchValidationPhysicalMemoryClass;
  memoryTier: LocalDeepResearchMemoryTier;
  memoryPressure: string;
  selectedProfileId: LocalDeepResearchModelProfileId;
  fallbackProfileId?: LocalDeepResearchModelProfileId;
  contextTokens: number;
  q8OverrideDecision: LocalDeepResearchQ8OverrideDecision;
  reservationStatus: string;
  reservationReason: string;
  activeLocalModelCount: number;
  activeLocalModelEstimatedResidentMemoryBytes: number;
  activeLocalModelActualResidentMemoryBytes?: number;
  coverageMissingPhysicalMemoryClasses: LocalDeepResearchValidationTargetPhysicalMemoryClass[];
  artifactPath: string;
  markdownPath: string;
}

export interface LocalDeepResearchValidationProviderPreferenceSmokeSummary {
  status: "passed" | "failed";
  checkedAt: string;
  checkCount: number;
  artifactPath: string;
  markdownPath: string;
}

export interface LocalDeepResearchValidationResult {
  schemaVersion: "ambient-local-deep-research-validation-v1";
  checkedAt: string;
  status: LocalDeepResearchValidationStatus;
  setupStatus: LocalDeepResearchSetupStatus;
  modelProfileId: LocalDeepResearchModelProfileId;
  contextTokens: number;
  providerSnapshot: LocalDeepResearchProviderSnapshot;
  checks: LocalDeepResearchValidationCheck[];
  memoryTelemetry?: LocalDeepResearchValidationMemoryTelemetrySummary;
  providerPreferenceSmoke?: LocalDeepResearchValidationProviderPreferenceSmokeSummary;
  artifactPath: string;
}

export type LocalDeepResearchSmokeStatus = "passed" | "needs-install" | "blocked" | "failed";

export type LocalDeepResearchSmokeCheckStatus = "passed" | "warning" | "failed" | "blocked";

export interface LocalDeepResearchSmokeCheck {
  id: string;
  title: string;
  status: LocalDeepResearchSmokeCheckStatus;
  detail: string;
  nextAction?: string;
}

export interface LocalDeepResearchSmokeResult {
  schemaVersion: "ambient-local-deep-research-smoke-v1";
  checkedAt: string;
  status: LocalDeepResearchSmokeStatus;
  setupStatus: LocalDeepResearchSetupStatus;
  modelProfileId: LocalDeepResearchModelProfileId;
  contextTokens: number;
  providerSnapshot: LocalDeepResearchProviderSnapshot;
  checks: LocalDeepResearchSmokeCheck[];
  artifactPath: string;
  markdownPath: string;
  llamaServer?: {
    endpointUrl: string;
    pid: number;
    profileId: string;
    modelPath: string;
    runtimeBinaryPath: string;
    stateDir: string;
    logPath: string;
    stdoutPath: string;
    stderrPath: string;
  };
  chat?: {
    prompt: string;
    response: string;
    durationMs: number;
    requestTimeoutMs: number;
  };
  release?: {
    status: "released" | "stopped" | "failed";
    detail?: string;
  };
  error?: string;
}

export interface LocalDeepResearchSetupResult {
  schemaVersion: "ambient-local-deep-research-setup-result-v1";
  action: LocalDeepResearchSetupAction;
  capabilityId: "local.deep-research.literesearcher";
  setupStatus: LocalDeepResearchSetupStatus;
  modelSelection: LocalDeepResearchModelSelectionSummary;
  modelInstall: LocalDeepResearchModelInstallSummary;
  llamaRuntime: LocalDeepResearchRuntimeSummary;
  installerShape: LocalDeepResearchInstallerShape;
  localModelResources: LocalModelResourceRegistrySnapshot;
  localRuntimeInventory: LocalRuntimeInventorySnapshot;
  providerSnapshot: LocalDeepResearchProviderSnapshot;
  managedAssets: LocalDeepResearchManagedAssetDetection;
  installResult?: LocalDeepResearchInstallResult;
  validation?: LocalDeepResearchValidationResult;
  smoke?: LocalDeepResearchSmokeResult;
  warnings: string[];
  blockers: string[];
  nextActions: string[];
}

export interface LocalDeepResearchRunHistoryInput {
  limit?: number;
}

export interface LocalDeepResearchRunHistoryEntry {
  id: string;
  createdAt: string;
  status: string;
  question: string;
  finalTextPreview?: string;
  error?: string;
  modelProfileId?: string;
  contextTokens?: number;
  providerSnapshot?: LocalDeepResearchProviderSnapshot;
  finalSynthesis?: Record<string, unknown>;
  toolCallCount: number;
  jsonPath: string;
  markdownPath?: string;
  jsonBytes: number;
  markdownBytes?: number;
  updatedAt?: string;
}

export interface LocalDeepResearchRunHistoryResult {
  schemaVersion: "ambient-local-deep-research-run-history-v1";
  runsRootPath: string;
  entries: LocalDeepResearchRunHistoryEntry[];
  truncated: boolean;
}

export interface SttTestAudioInput {
  source: "settings-microphone" | "composer-push-to-talk";
  audioBase64: string;
  threadId?: string;
  durationMs?: number;
  sampleRate?: number;
  channels?: number;
  microphoneDeviceId?: string;
  microphoneDeviceLabel?: string;
}

export interface SttTestAudioResult {
  threadId: string;
  utteranceId: string;
  audioPath: string;
  bytes: number;
  durationMs: number;
  sampleRate: number;
  channels: number;
  microphoneDeviceId?: string;
  microphoneDeviceLabel?: string;
  createdAt: string;
}

export interface SttTranscribeAudioInput {
  threadId: string;
  audioPath: string;
  utteranceId?: string;
}

export interface SttTranscribeAudioResult {
  state: SttTranscriptionState;
  queue: SttQueueState;
}

export interface SetSttTtsSpeakingInput {
  speaking: boolean;
}

export interface SttProviderDiagnostics {
  healthStatus: SttProviderHealthStatus;
  healthCommand?: string[];
  healthCwd?: string;
  healthError?: string;
  stdoutArtifactPath?: string;
  stderrArtifactPath?: string;
  missingHints: string[];
  distribution?: {
    packageType?: string;
    bundledRuntimeBinaries?: boolean;
    bundledPythonWheels?: boolean;
    bundledModelWeights?: boolean;
    bundledModelAssets?: boolean;
  };
  installPlan?: {
    resolver?: string;
    pythonVersion?: string;
    packages?: string[];
    defaultModel?: string;
    defaultDevice?: string;
    defaultComputeType?: string;
    firstRunBehavior?: string;
  };
  validation?: SttProviderValidationMetadata;
}

export interface SttProviderCandidate {
  packageId: string;
  packageName: string;
  command: string;
  capabilityId: string;
  providerId: string;
  label: string;
  description?: string;
  languages: string[];
  defaultLanguage?: string;
  local?: boolean;
  installed: boolean;
  available: boolean;
  availabilityReason: string;
  diagnostics?: SttProviderDiagnostics;
  validation?: SttProviderValidationMetadata;
}

export type SttTranscriptionStatus = "queued" | "transcribing" | "ready" | "no-speech" | "failed";

export interface SttNoSpeechGateResult {
  enabled: boolean;
  skipped: boolean;
  rmsDbfs?: number;
  peakDbfs?: number;
  thresholdDbfs?: number;
  sampleCount?: number;
  durationMs?: number;
  reason?: string;
}

export interface SttTranscriptionState {
  utteranceId: string;
  threadId: string;
  status: SttTranscriptionStatus;
  audioPath: string;
  normalizedAudioPath?: string;
  providerCapabilityId?: string;
  providerId?: string;
  language?: string;
  text?: string;
  durationMs?: number;
  noSpeechGate?: SttNoSpeechGateResult;
  transcriptPath?: string;
  jsonPath?: string;
  stdoutPath?: string;
  stderrPath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type SttDiagnosticErrorCategory =
  | "configuration"
  | "missing-runtime"
  | "missing-model"
  | "validation-failed"
  | "no-speech"
  | "provider-error"
  | "permission"
  | "unknown";

export interface SttDiagnosticNoSpeechGateSummary {
  enabled: boolean;
  skipped: boolean;
  rmsDbfs?: number;
  peakDbfs?: number;
  thresholdDbfs?: number;
  durationMs?: number;
}

export interface SttSetupDiagnosticSummary {
  id: string;
  kind: "setup";
  createdAt: string;
  provider: SttProviderSetupProvider;
  action: SttProviderSetupAction;
  status: SttProviderSetupStatus;
  durationMs: number;
  packageName: string;
  platform: string;
  arch: string;
  lane: string;
  providerCapabilityId?: string;
  runtimeVersion?: string;
  model?: string;
  modelSource?: string;
  assetManifestVersion?: string;
  runtimeInstallStatus?: SttProviderRuntimeInstallStatus;
  runtimeInstallDurationMs?: number;
  selectedProviderAvailable?: boolean;
  missingHintCount: number;
  errorCategory?: SttDiagnosticErrorCategory;
}

export interface SttTranscriptionDiagnosticSummary {
  id: string;
  kind: "transcription";
  createdAt: string;
  utteranceId: string;
  threadId: string;
  status: SttTranscriptionStatus;
  providerCapabilityId?: string;
  providerId?: string;
  language?: string;
  audioDurationMs?: number;
  transcriptionElapsedMs: number;
  transcriptChars?: number;
  noSpeechGate?: SttDiagnosticNoSpeechGateSummary;
  artifacts: {
    audio: boolean;
    normalizedAudio: boolean;
    transcript: boolean;
    json: boolean;
    stdout: boolean;
    stderr: boolean;
  };
  queuePhase?: SttQueuePhase;
  queuedUtteranceCount?: number;
  errorCategory?: SttDiagnosticErrorCategory;
}

export type SttDiagnosticSummary = SttSetupDiagnosticSummary | SttTranscriptionDiagnosticSummary;

export interface SttMessageArtifactMetadata {
  audioPath?: string;
  normalizedAudioPath?: string;
  transcriptPath?: string;
  jsonPath?: string;
  stdoutPath?: string;
  stderrPath?: string;
}

export interface SttMessageMetadata {
  source: "stt";
  utteranceId: string;
  threadId: string;
  status: SttTranscriptionStatus;
  providerCapabilityId?: string;
  providerId?: string;
  language?: string;
  durationMs?: number;
  noSpeechGate?: SttNoSpeechGateResult;
  artifacts: SttMessageArtifactMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface SttUtterance {
  id: string;
  threadId: string;
  audioPath: string;
  language: string;
  durationMs?: number;
  createdAt: string;
}

export type SttQueuePhase = "idle" | "recording" | "transcribing" | "ready_to_send" | "agent_running" | "speaking";

export interface SttQueueState {
  phase: SttQueuePhase;
  activeUtteranceId?: string;
  queuedUtteranceIds: string[];
}

export interface RegenerateMessageVoiceInput {
  messageId: string;
}

export interface MessageVoiceArtifactInput {
  messageId: string;
}

export interface VoiceArtifactRetentionInput {
  threadId?: string;
  providerCapabilityId?: string;
}

export interface VoiceArtifactRetentionSummary {
  threadId: string;
  providerCapabilityId?: string;
  rootPath: string;
  managedFileCount: number;
  managedBytes: number;
  referencedFileCount: number;
  referencedBytes: number;
  orphanedFileCount: number;
  orphanedBytes: number;
  referencedPreview: string[];
  orphanedPreview: string[];
}

export interface VoiceArtifactPruneResult extends VoiceArtifactRetentionSummary {
  deletedFileCount: number;
  deletedBytes: number;
  deletedPreview: string[];
}

export interface VoiceOnboardingRuntimeFact {
  name: string;
  command: string;
  available: boolean;
  version?: string;
  detail?: string;
}

export interface VoiceOnboardingHostFacts {
  os: {
    platform: string;
    release?: string;
    arch: string;
    appMode: "packaged" | "development";
  };
  hardware: {
    cpuModel?: string;
    cpuCount?: number;
    memoryBytes?: number;
    accelerator?: string;
  };
  runtimes: VoiceOnboardingRuntimeFact[];
}
