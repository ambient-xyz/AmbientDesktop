import { useRef, useState } from "react";

import type {
  AgentMemoryEmbeddingLifecycleActionKind,
  AgentMemoryEmbeddingLifecycleActionResult,
  AgentMemoryStorageDiagnostics,
} from "../../shared/agentMemoryDiagnostics";
import type {
  AmbientMcpContainerRuntimeManagedInstallProgress,
  AmbientMcpDefaultCapabilityInstallProgress,
} from "../../shared/pluginTypes";
import type {
  SttProviderCandidate,
  VoiceProviderCandidate,
} from "../../shared/localRuntimeTypes";
import type { SttDraftMetadataState } from "./sttUiModel";
import type {
  SttMicrophoneDevice,
  SttMicrophoneRecorder,
  SttTrailingSilenceState,
} from "./sttMicrophoneRecorder";
import type { SttComposerUiState } from "./AppComposerShell";
import type {
  LocalDeepResearchRunHistoryUiState,
  LocalDeepResearchSetupUiState,
  MiniCpmVisionSetupUiState,
  SttMicTestUiState,
  SttProviderCacheActivity,
  SttProviderCacheStatus,
  SttProviderSetupUiState,
  VoiceCatalogRefreshState,
  VoiceProviderCacheActivity,
  VoiceProviderCacheStatus,
} from "./RightPanel";

export function useAppProviderRuntimeState() {
  const [agentMemoryDiagnostics, setAgentMemoryDiagnostics] = useState<AgentMemoryStorageDiagnostics | undefined>();
  const [agentMemoryDiagnosticsLoading, setAgentMemoryDiagnosticsLoading] = useState(false);
  const [agentMemoryDiagnosticsError, setAgentMemoryDiagnosticsError] = useState<string | undefined>();
  const agentMemoryDiagnosticsRequestSeqRef = useRef(0);
  const [agentMemoryEmbeddingActionLoading, setAgentMemoryEmbeddingActionLoading] =
    useState<AgentMemoryEmbeddingLifecycleActionKind | undefined>();
  const [agentMemoryEmbeddingActionResult, setAgentMemoryEmbeddingActionResult] =
    useState<AgentMemoryEmbeddingLifecycleActionResult | undefined>();
  const [agentMemoryEmbeddingActionError, setAgentMemoryEmbeddingActionError] = useState<string | undefined>();
  const [voiceProviders, setVoiceProviders] = useState<VoiceProviderCandidate[]>([]);
  const [voiceProvidersLoading, setVoiceProvidersLoading] = useState(false);
  const [voiceProvidersError, setVoiceProvidersError] = useState<string | undefined>();
  const [voiceProviderCacheStatus, setVoiceProviderCacheStatus] =
    useState<VoiceProviderCacheStatus>({ providerCount: 0 });
  const [voiceProviderCacheActivity, setVoiceProviderCacheActivity] = useState<VoiceProviderCacheActivity[]>([]);
  const [voiceCatalogRefresh, setVoiceCatalogRefresh] = useState<VoiceCatalogRefreshState | undefined>();
  const [sttProviders, setSttProviders] = useState<SttProviderCandidate[]>([]);
  const [sttProvidersLoading, setSttProvidersLoading] = useState(false);
  const [sttProvidersError, setSttProvidersError] = useState<string | undefined>();
  const [sttProviderCacheStatus, setSttProviderCacheStatus] =
    useState<SttProviderCacheStatus>({ providerCount: 0 });
  const [sttProviderCacheActivity, setSttProviderCacheActivity] = useState<SttProviderCacheActivity[]>([]);
  const [sttProviderSetup, setSttProviderSetup] = useState<SttProviderSetupUiState>({ status: "idle" });
  const [sttMicrophoneDevices, setSttMicrophoneDevices] = useState<SttMicrophoneDevice[]>([]);
  const [sttMicrophoneDevicesLoading, setSttMicrophoneDevicesLoading] = useState(false);
  const [sttMicrophoneDevicesError, setSttMicrophoneDevicesError] = useState<string | undefined>();
  const [miniCpmVisionSetup, setMiniCpmVisionSetup] = useState<MiniCpmVisionSetupUiState>({ status: "idle" });
  const [miniCpmVisionRuntimePath, setMiniCpmVisionRuntimePath] = useState("");
  const [miniCpmVisionEndpointUrl, setMiniCpmVisionEndpointUrl] = useState("");
  const [localDeepResearchSetup, setLocalDeepResearchSetup] =
    useState<LocalDeepResearchSetupUiState>({ status: "idle" });
  const [localDeepResearchQ8Override, setLocalDeepResearchQ8Override] = useState(false);
  const [localDeepResearchRunHistory, setLocalDeepResearchRunHistory] =
    useState<LocalDeepResearchRunHistoryUiState>({ status: "idle" });
  const [localDeepResearchFollowupOpen, setLocalDeepResearchFollowupOpen] = useState(false);
  const [sttMicTest, setSttMicTest] = useState<SttMicTestUiState>({ status: "idle" });
  const [sttComposer, setSttComposer] = useState<SttComposerUiState>({ status: "idle" });
  const [sttDraftMetadata, setSttDraftMetadata] = useState<SttDraftMetadataState | undefined>();
  const voiceProviderRefreshTimerRef = useRef<number | undefined>(undefined);
  const voiceProviderLoadPromiseRef = useRef<Promise<void> | undefined>(undefined);
  const voiceProviderQueuedRefreshTriggerRef = useRef<string | undefined>(undefined);
  const voiceProviderRequestIdRef = useRef(0);
  const voiceProvidersRef = useRef<VoiceProviderCandidate[]>([]);
  const sttProviderRefreshTimerRef = useRef<number | undefined>(undefined);
  const sttProviderLoadPromiseRef = useRef<Promise<void> | undefined>(undefined);
  const sttProviderQueuedRefreshTriggerRef = useRef<string | undefined>(undefined);
  const sttProviderRequestIdRef = useRef(0);
  const sttProvidersRef = useRef<SttProviderCandidate[]>([]);
  const sttMicRecorderRef = useRef<SttMicrophoneRecorder | undefined>(undefined);
  const sttComposerRecorderRef = useRef<SttMicrophoneRecorder | undefined>(undefined);
  const sttComposerSilenceRef = useRef<SttTrailingSilenceState>({
    speechDetected: false,
    autoStopping: false,
  });
  const sttComposerShortcutActiveRef = useRef(false);
  const sttComposerOperationIdRef = useRef(0);
  const sttComposerThreadRef = useRef<string | undefined>(undefined);
  const [mcpContainerRuntimeInstallProgress, setMcpContainerRuntimeInstallProgress] =
    useState<AmbientMcpContainerRuntimeManagedInstallProgress | undefined>();
  const [mcpDefaultCapabilityInstallProgress, setMcpDefaultCapabilityInstallProgress] =
    useState<AmbientMcpDefaultCapabilityInstallProgress | undefined>();

  return {
    agentMemoryDiagnostics,
    setAgentMemoryDiagnostics,
    agentMemoryDiagnosticsLoading,
    setAgentMemoryDiagnosticsLoading,
    agentMemoryDiagnosticsError,
    setAgentMemoryDiagnosticsError,
    agentMemoryDiagnosticsRequestSeqRef,
    agentMemoryEmbeddingActionLoading,
    setAgentMemoryEmbeddingActionLoading,
    agentMemoryEmbeddingActionResult,
    setAgentMemoryEmbeddingActionResult,
    agentMemoryEmbeddingActionError,
    setAgentMemoryEmbeddingActionError,
    voiceProviders,
    setVoiceProviders,
    voiceProvidersLoading,
    setVoiceProvidersLoading,
    voiceProvidersError,
    setVoiceProvidersError,
    voiceProviderCacheStatus,
    setVoiceProviderCacheStatus,
    voiceProviderCacheActivity,
    setVoiceProviderCacheActivity,
    voiceCatalogRefresh,
    setVoiceCatalogRefresh,
    sttProviders,
    setSttProviders,
    sttProvidersLoading,
    setSttProvidersLoading,
    sttProvidersError,
    setSttProvidersError,
    sttProviderCacheStatus,
    setSttProviderCacheStatus,
    sttProviderCacheActivity,
    setSttProviderCacheActivity,
    sttProviderSetup,
    setSttProviderSetup,
    sttMicrophoneDevices,
    setSttMicrophoneDevices,
    sttMicrophoneDevicesLoading,
    setSttMicrophoneDevicesLoading,
    sttMicrophoneDevicesError,
    setSttMicrophoneDevicesError,
    miniCpmVisionSetup,
    setMiniCpmVisionSetup,
    miniCpmVisionRuntimePath,
    setMiniCpmVisionRuntimePath,
    miniCpmVisionEndpointUrl,
    setMiniCpmVisionEndpointUrl,
    localDeepResearchSetup,
    setLocalDeepResearchSetup,
    localDeepResearchQ8Override,
    setLocalDeepResearchQ8Override,
    localDeepResearchRunHistory,
    setLocalDeepResearchRunHistory,
    localDeepResearchFollowupOpen,
    setLocalDeepResearchFollowupOpen,
    sttMicTest,
    setSttMicTest,
    sttComposer,
    setSttComposer,
    sttDraftMetadata,
    setSttDraftMetadata,
    voiceProviderRefreshTimerRef,
    voiceProviderLoadPromiseRef,
    voiceProviderQueuedRefreshTriggerRef,
    voiceProviderRequestIdRef,
    voiceProvidersRef,
    sttProviderRefreshTimerRef,
    sttProviderLoadPromiseRef,
    sttProviderQueuedRefreshTriggerRef,
    sttProviderRequestIdRef,
    sttProvidersRef,
    sttMicRecorderRef,
    sttComposerRecorderRef,
    sttComposerSilenceRef,
    sttComposerShortcutActiveRef,
    sttComposerOperationIdRef,
    sttComposerThreadRef,
    mcpContainerRuntimeInstallProgress,
    setMcpContainerRuntimeInstallProgress,
    mcpDefaultCapabilityInstallProgress,
    setMcpDefaultCapabilityInstallProgress,
  };
}
