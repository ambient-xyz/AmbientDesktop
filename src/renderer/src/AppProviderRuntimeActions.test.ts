import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppLocalDeepResearchLifecycle } from "./AppLocalDeepResearchLifecycle";
import { createAppLocalRuntimeActionsForRuntimeState } from "./AppLocalRuntimeActions";
import { createAppMessageVoiceActions } from "./AppMessageVoiceActions";
import {
  type AppProviderRuntimeActionsForAppInput,
  useAppProviderRuntimeActionsForApp,
} from "./AppProviderRuntimeActions";
import { createAppSpeechProviderActionsForRuntimeState } from "./AppSpeechProviderActions";
import { createAppSttComposerActions } from "./AppSttComposerActions";
import { createAppSttMicrophoneActionsForRuntimeState } from "./AppSttMicrophoneActions";
import { useAppVoiceThreadControls } from "./AppVoiceThreadControls";

vi.mock("./AppLocalDeepResearchLifecycle", () => ({
  useAppLocalDeepResearchLifecycle: vi.fn(),
}));

vi.mock("./AppLocalRuntimeActions", () => ({
  createAppLocalRuntimeActionsForRuntimeState: vi.fn(),
}));

vi.mock("./AppMessageVoiceActions", () => ({
  createAppMessageVoiceActions: vi.fn(),
}));

vi.mock("./AppSpeechProviderActions", () => ({
  createAppSpeechProviderActionsForRuntimeState: vi.fn(),
}));

vi.mock("./AppSttComposerActions", () => ({
  createAppSttComposerActions: vi.fn(),
}));

vi.mock("./AppSttMicrophoneActions", () => ({
  createAppSttMicrophoneActionsForRuntimeState: vi.fn(),
}));

vi.mock("./AppVoiceThreadControls", () => ({
  useAppVoiceThreadControls: vi.fn(),
}));

function createInput() {
  const providerRuntimeState = {
    localDeepResearchSetup: { status: "success", result: { setupStatus: "ready" } },
    setLocalDeepResearchSetup: vi.fn(),
    setSttComposer: vi.fn(),
    setSttDraftMetadata: vi.fn(),
    sttComposer: { status: "idle" },
    sttComposerOperationIdRef: { current: 0 },
    sttComposerRecorderRef: { current: undefined },
    sttComposerShortcutActiveRef: { current: false },
    sttComposerSilenceRef: { current: { speechDetected: false, autoStopping: false } },
    sttComposerThreadRef: { current: undefined },
    sttProvidersRef: { current: [] },
    voiceProviders: [{ capabilityId: "voice-1", label: "Voice One", available: true }],
  };
  return {
    appendRunActivityLine: vi.fn(),
    composerShellState: {
      getComposerDraft: vi.fn(() => "draft"),
      setComposerDraft: vi.fn(),
    },
    providerRuntimeState,
    resetPromptHistory: vi.fn(),
    resetRunActivityLines: vi.fn(),
    rightPanelState: {
      rightPanel: "settings",
    },
    runActivityState: {
      setRunStatus: vi.fn(),
      setThreadRunStatuses: vi.fn(),
    },
    running: true,
    setError: vi.fn(),
    setState: vi.fn(),
    state: {
      activeThreadId: "thread-1",
      messages: [{ id: "message-1" }],
      messageVoiceStates: { "message-1": { status: "idle" } },
      settings: {
        voice: { enabled: true },
      },
      workspace: {
        path: "/repo",
      },
    },
    workflowRuntimeState: {
      localRuntimeInventorySettingsRefreshKeyRef: { current: undefined },
      setContextError: vi.fn(),
    },
  } as unknown as AppProviderRuntimeActionsForAppInput;
}

describe("App provider runtime actions", () => {
  const cancelSttMicTest = vi.fn();
  const clearMessageVoiceArtifact = vi.fn();
  const loadLocalDeepResearchRunHistory = vi.fn();
  const loadSttProviders = vi.fn();
  const openLocalDeepResearchFollowupIfSetupNeeded = vi.fn();
  const regenerateMessageVoice = vi.fn();
  const retrySttComposerTranscription = vi.fn();
  const scheduleVoiceProviderRefresh = vi.fn();
  const setActiveVoiceMessageId = vi.fn();
  const setupLocalDeepResearchFromSettings = vi.fn();
  const setupMiniCpmVisionProviderFromSettings = vi.fn();
  const setupSttProvider = vi.fn();
  const startSttComposerRecording = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAppVoiceThreadControls).mockReturnValue({
      activeVoiceMessageId: "message-1",
      setActiveVoiceMessageId,
    } as unknown as ReturnType<typeof useAppVoiceThreadControls>);
    vi.mocked(createAppSpeechProviderActionsForRuntimeState).mockReturnValue({
      loadSttProviders,
      loadVoiceProviders: vi.fn(),
      refreshVoiceCatalog: vi.fn(),
      scheduleSttProviderRefresh: vi.fn(),
      scheduleVoiceProviderRefresh,
      setupSttProvider,
    } as unknown as ReturnType<typeof createAppSpeechProviderActionsForRuntimeState>);
    vi.mocked(createAppSttMicrophoneActionsForRuntimeState).mockReturnValue({
      cancelSttMicTest,
      loadSttMicrophoneDeviceList: vi.fn(),
      startSttMicTest: vi.fn(),
      stopSttMicTestAndValidate: vi.fn(),
    } as unknown as ReturnType<typeof createAppSttMicrophoneActionsForRuntimeState>);
    vi.mocked(createAppLocalRuntimeActionsForRuntimeState).mockReturnValue({
      loadLocalDeepResearchRunHistory,
      openLocalDeepResearchFollowupIfSetupNeeded,
      setupLocalDeepResearchFromSettings,
      setupMiniCpmVisionProviderFromSettings,
    } as unknown as ReturnType<typeof createAppLocalRuntimeActionsForRuntimeState>);
    vi.mocked(createAppSttComposerActions).mockReturnValue({
      cancelSttComposerRecording: vi.fn(),
      discardSttComposerResult: vi.fn(),
      retrySttComposerTranscription,
      startSttComposerRecording,
      stopSttComposerRecording: vi.fn(),
      transcribeSavedSttComposerAudio: vi.fn(),
    } as unknown as ReturnType<typeof createAppSttComposerActions>);
    vi.mocked(createAppMessageVoiceActions).mockReturnValue({
      clearMessageVoiceArtifact,
      regenerateMessageVoice,
      revealMessageVoiceArtifact: vi.fn(),
    } as unknown as ReturnType<typeof createAppMessageVoiceActions>);
  });

  it("constructs provider runtime owners with App state owner dependencies", () => {
    const input = createInput();

    useAppProviderRuntimeActionsForApp(input);

    expect(useAppVoiceThreadControls).toHaveBeenCalledWith({
      activeThreadId: "thread-1",
      messages: input.state?.messages,
      messageVoiceStates: input.state?.messageVoiceStates,
      settings: input.state?.settings.voice,
      voiceProviders: input.providerRuntimeState.voiceProviders,
    });
    expect(createAppSpeechProviderActionsForRuntimeState).toHaveBeenCalledWith({
      providerRuntimeState: input.providerRuntimeState,
      setState: input.setState,
      state: input.state,
    });
    expect(createAppSttMicrophoneActionsForRuntimeState).toHaveBeenCalledWith({
      providerRuntimeState: input.providerRuntimeState,
      setupSttProvider,
      state: input.state,
    });
    expect(createAppLocalRuntimeActionsForRuntimeState).toHaveBeenCalledWith(input.providerRuntimeState);
    expect(useAppLocalDeepResearchLifecycle).toHaveBeenCalledWith({
      localDeepResearchSetup: input.providerRuntimeState.localDeepResearchSetup,
      localRuntimeInventorySettingsRefreshKeyRef: input.workflowRuntimeState.localRuntimeInventorySettingsRefreshKeyRef,
      panel: input.rightPanelState.rightPanel,
      setLocalDeepResearchSetup: input.providerRuntimeState.setLocalDeepResearchSetup,
      setupLocalDeepResearchFromSettings,
      workspacePath: "/repo",
    });
    expect(createAppSttComposerActions).toHaveBeenCalledWith(expect.objectContaining({
      activeVoiceMessageId: "message-1",
      appendRunActivityLine: input.appendRunActivityLine,
      getComposerDraft: input.composerShellState.getComposerDraft,
      resetPromptHistory: input.resetPromptHistory,
      resetRunActivityLines: input.resetRunActivityLines,
      running: true,
      setActiveVoiceMessageId,
      setComposerDraft: input.composerShellState.setComposerDraft,
      setContextError: input.workflowRuntimeState.setContextError,
      setError: input.setError,
      setRunStatus: input.runActivityState.setRunStatus,
      setSttComposer: input.providerRuntimeState.setSttComposer,
      setSttDraftMetadata: input.providerRuntimeState.setSttDraftMetadata,
      setThreadRunStatuses: input.runActivityState.setThreadRunStatuses,
      state: input.state,
      sttComposer: input.providerRuntimeState.sttComposer,
      sttProvidersRef: input.providerRuntimeState.sttProvidersRef,
    }));
    expect(createAppMessageVoiceActions).toHaveBeenCalledWith({
      scheduleVoiceProviderRefresh,
      setError: input.setError,
      setState: input.setState,
    });
  });

  it("returns the grouped owners and flattened action surface", () => {
    const input = createInput();

    const actions = useAppProviderRuntimeActionsForApp(input);

    expect(actions.voiceThreadControls.activeVoiceMessageId).toBe("message-1");
    expect(actions.activeVoiceMessageId).toBe("message-1");
    expect(actions.loadSttProviders).toBe(loadSttProviders);
    expect(actions.cancelSttMicTest).toBe(cancelSttMicTest);
    expect(actions.loadLocalDeepResearchRunHistory).toBe(loadLocalDeepResearchRunHistory);
    expect(actions.openLocalDeepResearchFollowupIfSetupNeeded).toBe(openLocalDeepResearchFollowupIfSetupNeeded);
    expect(actions.setupMiniCpmVisionProviderFromSettings).toBe(setupMiniCpmVisionProviderFromSettings);
    expect(actions.retrySttComposerTranscription).toBe(retrySttComposerTranscription);
    expect(actions.startSttComposerRecording).toBe(startSttComposerRecording);
    expect(actions.clearMessageVoiceArtifact).toBe(clearMessageVoiceArtifact);
    expect(actions.regenerateMessageVoice).toBe(regenerateMessageVoice);
  });
});
