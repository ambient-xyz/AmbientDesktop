import type {
  AgentMemoryClearResult,
  AgentMemoryEmbeddingLifecycleActionKind,
  AgentMemoryEmbeddingLifecycleActionResult,
  AgentMemoryStorageDiagnostics,
} from "../../shared/agentMemoryDiagnostics";
import type { BrowserCapabilityState, BrowserUserActionState } from "../../shared/browserTypes";
import type { DesktopState, ThemePreference } from "../../shared/desktopTypes";
import type { DiagnosticExportResult } from "../../shared/diagnosticTypes";
import type {
  LocalDeepResearchInstallProgress,
  LocalDeepResearchRunHistoryResult,
  LocalModelRuntimeLifecycleActionInput,
  LocalModelRuntimeLifecycleActionResult,
  MiniCpmVisionDiagnosticItem,
  MiniCpmVisionSetupAction,
  MiniCpmVisionSetupResult,
  SttProviderCandidate,
  SttProviderSetupResult,
  SttTestAudioResult,
  VoiceProviderCandidate,
} from "../../shared/localRuntimeTypes";
import type { AmbientPermissionGrant, PermissionAuditEntry } from "../../shared/permissionTypes";
import type {
  AmbientMcpContainerRuntimeManagedInstallProgress,
  AmbientMcpDefaultCapabilityInstallProgress,
  ModelProviderCredentialSaveResult,
} from "../../shared/pluginTypes";
import type {
  InstallModelProviderEndpointInput,
  InstallModelProviderEndpointResult,
  SaveModelProviderCredentialInput,
  ThinkingLevel,
} from "../../shared/threadTypes";
import type { GitReviewSummary, WorkspaceContextReference } from "../../shared/workspaceTypes";
import type { CapabilityBuilderPromptResult } from "./AppCapabilityPromptActions";
import type {
  LocalDeepResearchDiagnosticItem,
  LocalDeepResearchSetupAction,
  LocalDeepResearchSetupResult,
} from "./localDeepResearchUiModel";
import type { SttMicrophoneDevice, SttMicrophoneLevel } from "./sttMicrophoneRecorder";

export type UtilityPanel =
  | "terminal"
  | "files"
  | "diff"
  | "search"
  | "browser"
  | "plugins"
  | "settings"
  | "attachments"
  | "performance";

export type SettingsFocusRequest = {
  section: "voice" | "mcp-runtime" | "search-web";
  nonce: number;
};

export type ArtifactPreviewRequest = { path: string; nonce: number };

export type GitPanelTabRequest = { tab: "summary" | "review"; nonce: number };

export type VoiceProviderCacheStatus = {
  lastRequestedAt?: string;
  lastCompletedAt?: string;
  lastTrigger?: string;
  providerCount: number;
  lastCatalogRefresh?: {
    providerLabel: string;
    voiceCount: number;
    refreshedAt: string;
    durationMs: number;
  };
  error?: string;
};

export type VoiceProviderCacheActivity = {
  id: string;
  at: string;
  trigger: string;
  status: "success" | "error";
  providerCount: number;
  availableCount: number;
  unavailableCount: number;
  changes: string[];
  error?: string;
};

export type VoiceCatalogRefreshState = {
  providerCapabilityId: string;
  status: "running" | "success" | "error";
  message?: string;
};

export type SttProviderCacheStatus = {
  lastRequestedAt?: string;
  lastCompletedAt?: string;
  lastTrigger?: string;
  providerCount: number;
  error?: string;
};

export type SttProviderCacheActivity = {
  id: string;
  at: string;
  trigger: string;
  status: "success" | "error";
  providerCount: number;
  availableCount: number;
  unavailableCount: number;
  changes: string[];
  error?: string;
};

export type SttProviderSetupUiState = {
  status: "idle" | "running" | "success" | "error";
  action?: "install" | "repair" | "validate";
  message?: string;
  result?: SttProviderSetupResult;
};

export type MiniCpmVisionSetupUiState = {
  status: "idle" | "running" | "success" | "error";
  action?: MiniCpmVisionSetupAction;
  message?: string;
  result?: MiniCpmVisionSetupResult;
  diagnostics?: MiniCpmVisionDiagnosticItem[];
};

export type LocalDeepResearchSetupUiState = {
  status: "idle" | "running" | "success" | "error";
  action?: LocalDeepResearchSetupAction;
  message?: string;
  result?: LocalDeepResearchSetupResult;
  diagnostics?: LocalDeepResearchDiagnosticItem[];
  progress?: LocalDeepResearchInstallProgress;
};

export type LocalDeepResearchRunHistoryUiState = {
  status: "idle" | "loading" | "success" | "error";
  message?: string;
  result?: LocalDeepResearchRunHistoryResult;
};

export type SttMicTestUiState = {
  status: "idle" | "recording" | "saving" | "validating" | "success" | "error";
  message?: string;
  audio?: SttTestAudioResult;
  level?: SttMicrophoneLevel;
};

export type RightPanelProps = {
  panel: UtilityPanel;
  panelWidth: number;
  state: DesktopState;
  workspaceRevision: number;
  pluginCatalogRevision: number;
  permissionAuditRevision: number;
  browserRevision: number;
  orchestrationRevision: number;
  orchestrationAutoRevision: number;
  workflowRevision: number;
  artifactPreviewRequest?: ArtifactPreviewRequest;
  localFilePreviewRequest?: ArtifactPreviewRequest;
  gitPanelTabRequest: GitPanelTabRequest;
  settingsFocusRequest?: SettingsFocusRequest;
  contextAttachments: WorkspaceContextReference[];
  permissionAudit: PermissionAuditEntry[];
  permissionGrants: AmbientPermissionGrant[];
  permissionAuditError?: string;
  permissionGrantError?: string;
  permissionGrantRevoking?: string;
  voiceProviders: VoiceProviderCandidate[];
  voiceProvidersLoading: boolean;
  voiceProvidersError?: string;
  voiceProviderCacheStatus: VoiceProviderCacheStatus;
  voiceProviderCacheActivity: VoiceProviderCacheActivity[];
  voiceCatalogRefresh?: VoiceCatalogRefreshState;
  sttProviders: SttProviderCandidate[];
  sttProvidersLoading: boolean;
  sttProvidersError?: string;
  sttProviderCacheStatus: SttProviderCacheStatus;
  sttProviderCacheActivity: SttProviderCacheActivity[];
  sttProviderSetup: SttProviderSetupUiState;
  sttMicrophoneDevices: SttMicrophoneDevice[];
  sttMicrophoneDevicesLoading: boolean;
  sttMicrophoneDevicesError?: string;
  miniCpmVisionSetup: MiniCpmVisionSetupUiState;
  miniCpmVisionRuntimePath: string;
  miniCpmVisionEndpointUrl: string;
  localDeepResearchSetup: LocalDeepResearchSetupUiState;
  localDeepResearchQ8Override: boolean;
  localDeepResearchRunHistory: LocalDeepResearchRunHistoryUiState;
  sttMicTest: SttMicTestUiState;
  mcpContainerRuntimeInstallProgress?: AmbientMcpContainerRuntimeManagedInstallProgress;
  mcpDefaultCapabilityInstallProgress?: AmbientMcpDefaultCapabilityInstallProgress;
  searchRoutingHydrating: boolean;
  searchRoutingHydrationError?: string;
  agentMemoryDiagnostics?: AgentMemoryStorageDiagnostics;
  agentMemoryDiagnosticsLoading: boolean;
  agentMemoryDiagnosticsError?: string;
  agentMemoryEmbeddingActionLoading?: AgentMemoryEmbeddingLifecycleActionKind;
  agentMemoryEmbeddingActionResult?: AgentMemoryEmbeddingLifecycleActionResult;
  agentMemoryEmbeddingActionError?: string;
  updateBusy: boolean;
  running: boolean;
  onLoadPermissionAudit: () => Promise<void>;
  onLoadPermissionGrants: () => Promise<void>;
  onRevokePermissionGrant: (id: string) => Promise<void>;
  onRevokePermissionGrantIds: (ids: string[], busyId: string) => Promise<void>;
  onOpenApiKey: () => void;
  onCheckUpdates: () => void;
  onThemePreferenceChange: (themePreference: ThemePreference) => Promise<void>;
  onMediaPlaybackSettingsChange: (media: DesktopState["settings"]["media"]) => void;
  onThinkingDisplaySettingsChange: (thinkingDisplay: DesktopState["settings"]["thinkingDisplay"]) => void;
  onThinkingLevelChange: (thinkingLevel: ThinkingLevel) => void;
  onModelRuntimeSettingsChange: (modelRuntime: DesktopState["settings"]["modelRuntime"]) => void;
  onSaveModelProviderCredential: (input: SaveModelProviderCredentialInput) => Promise<ModelProviderCredentialSaveResult>;
  onInstallModelProviderEndpoint: (input: InstallModelProviderEndpointInput) => Promise<InstallModelProviderEndpointResult>;
  onRunLocalModelRuntimeLifecycleAction: (input: LocalModelRuntimeLifecycleActionInput) => Promise<LocalModelRuntimeLifecycleActionResult>;
  onFeatureFlagSettingsChange: (featureFlags: DesktopState["settings"]["featureFlags"]) => void;
  onMemorySettingsChange: (memory: DesktopState["settings"]["memory"]) => void;
  onApplyMemorySettingsSnapshot: (memory: DesktopState["settings"]["memory"]) => void;
  onActiveThreadMemoryEnabledChange: (enabled: boolean) => void;
  onRefreshAgentMemoryDiagnostics: () => Promise<void>;
  onRunAgentMemoryEmbeddingLifecycleAction: (action: AgentMemoryEmbeddingLifecycleActionKind) => Promise<AgentMemoryEmbeddingLifecycleActionResult | undefined>;
  onClearAgentMemory: () => Promise<AgentMemoryClearResult>;
  onPlannerSettingsChange: (planner: DesktopState["settings"]["planner"]) => void;
  onHydrateSearchRoutingSettings: () => void;
  onSearchRoutingSettingsChange: (search: DesktopState["settings"]["search"]) => void;
  onLocalDeepResearchSettingsChange: (localDeepResearch: DesktopState["settings"]["localDeepResearch"]) => void;
  onOpenAmbientCliSecretDialog: (input?: { packageId?: string; packageName?: string; envName?: string }) => void;
  onVoiceSettingsChange: (voice: DesktopState["settings"]["voice"]) => void;
  onLoadVoiceProviders: (trigger?: string) => Promise<void>;
  onRefreshVoiceCatalog: (providerCapabilityId: string) => void;
  onSttSettingsChange: (stt: DesktopState["settings"]["stt"]) => void;
  onLoadSttProviders: (trigger?: string) => Promise<void>;
  onLoadSttMicrophoneDevices: (requestPermission?: boolean) => void;
  onSetupSttProvider: (action: "install" | "repair" | "validate") => void;
  onSetupMiniCpmVisionProvider: (action: MiniCpmVisionSetupAction) => void;
  onMiniCpmVisionRuntimePathChange: (value: string) => void;
  onMiniCpmVisionEndpointUrlChange: (value: string) => void;
  onSetupLocalDeepResearch: (action: LocalDeepResearchSetupAction) => void;
  onLocalDeepResearchQ8OverrideChange: (value: boolean) => void;
  onLoadLocalDeepResearchRunHistory: () => void;
  onStartSttMicTest: () => void;
  onStopSttMicTest: () => void;
  onCancelSttMicTest: () => void;
  onClearMcpContainerRuntimeInstallProgress: () => void;
  onClearMcpDefaultCapabilityInstallProgress: () => void;
  onExportDiagnostics: () => Promise<DiagnosticExportResult | undefined>;
  onImportDiagnostics: () => Promise<DiagnosticExportResult | undefined>;
  onSelectThread: (threadId: string, workspacePath?: string) => Promise<void>;
  onAddContext: (items: WorkspaceContextReference[]) => void;
  onRemoveContext: (item: WorkspaceContextReference) => void;
  onClearContext: () => void;
  onContextError: (message: string | undefined) => void;
  onGitReviewChanged: (review: GitReviewSummary | undefined) => void;
  onWorkspaceChanged: () => void;
  onStartCapabilityBuilder: (prompt: string, newChat: boolean, activityLine?: string) => Promise<CapabilityBuilderPromptResult>;
  onOpenPluginCapabilities: () => void;
  onOpenMcpRuntimeSettings: () => void;
  onDefaultCapabilityInstalled: () => void;
  onBrowserUserActionCompleted: (action: BrowserUserActionState, browserState: BrowserCapabilityState) => Promise<void>;
  onClose: () => void;
};
