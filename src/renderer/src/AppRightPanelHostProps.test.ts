import type {
  Dispatch,
  SetStateAction,
} from "react";
import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import {
  createAppRightPanelHostProps,
  type AppRightPanelHostActions,
  type AppRightPanelHostPropsInput,
} from "./AppRightPanelHostProps";
import type { UtilityPanel } from "./RightPanel";

type CreatedRightPanelHostProps = ReturnType<typeof createAppRightPanelHostProps>;

describe("App right panel host props", () => {
  it("derives right-panel host state from grouped App owners", () => {
    const artifactPreviewRequest = { path: "artifact.html", nonce: 1 };
    const contextAttachment = {
      kind: "file",
      name: "notes.md",
      path: "/workspace/notes.md",
    } as CreatedRightPanelHostProps["contextAttachments"][number];
    const permissionAudit = { id: "audit-1" } as CreatedRightPanelHostProps["permissionAudit"][number];
    const permissionGrant = { id: "grant-1" } as CreatedRightPanelHostProps["permissionGrants"][number];
    const voiceProvider = { capabilityId: "voice-1" } as CreatedRightPanelHostProps["voiceProviders"][number];
    const props = createAppRightPanelHostProps(baseInput({
      providerRuntimeState: {
        ...baseProviderRuntimeState(),
        voiceProviders: [voiceProvider],
        voiceProvidersLoading: true,
        agentMemoryDiagnosticsError: "diagnostics failed",
      },
      rightPanelState: {
        ...baseRightPanelState(),
        rightPanel: "settings",
        rightPanelWidth: 640,
        artifactPreviewRequest,
      },
      securityPromptState: {
        ...baseSecurityPromptState(),
        permissionAuditRevision: 7,
        permissionAudit: [permissionAudit],
        permissionGrants: [permissionGrant],
      },
      shellUiState: {
        searchRoutingHydrating: true,
        searchRoutingHydrationError: "search failed",
        updateBusy: true,
      },
      workflowRuntimeState: {
        ...baseWorkflowRuntimeState(),
        orchestrationRevision: 11,
        contextAttachments: [contextAttachment],
      },
      workspaceShellState: {
        ...baseWorkspaceShellState(),
        workspaceRevision: 13,
        pluginCatalogRevision: 17,
        browserRevision: 19,
      },
      running: true,
    }));

    expect(props.panel).toBe("settings");
    expect(props.panelWidth).toBe(640);
    expect(props.artifactPreviewRequest).toBe(artifactPreviewRequest);
    expect(props.workspaceRevision).toBe(13);
    expect(props.pluginCatalogRevision).toBe(17);
    expect(props.permissionAuditRevision).toBe(7);
    expect(props.browserRevision).toBe(19);
    expect(props.orchestrationRevision).toBe(11);
    expect(props.contextAttachments).toEqual([contextAttachment]);
    expect(props.permissionAudit).toEqual([permissionAudit]);
    expect(props.permissionGrants).toEqual([permissionGrant]);
    expect(props.voiceProviders).toEqual([voiceProvider]);
    expect(props.voiceProvidersLoading).toBe(true);
    expect(props.searchRoutingHydrating).toBe(true);
    expect(props.searchRoutingHydrationError).toBe("search failed");
    expect(props.agentMemoryDiagnosticsError).toBe("diagnostics failed");
    expect(props.updateBusy).toBe(true);
    expect(props.running).toBe(true);
  });

  it("keeps right-panel callback adapters stable", () => {
    const currentState = stateSetter<DesktopState | undefined>(desktopState());
    const rightPanel = stateSetter<UtilityPanel | undefined>("settings");
    const workspaceRevision = stateSetter(3);
    const mcpContainerRuntimeInstallProgress =
      stateSetter<AppRightPanelHostPropsInput["providerRuntimeState"]["mcpContainerRuntimeInstallProgress"]>(
        { phase: "running" } as unknown as AppRightPanelHostPropsInput["providerRuntimeState"]["mcpContainerRuntimeInstallProgress"],
      );
    const mcpDefaultCapabilityInstallProgress =
      stateSetter<AppRightPanelHostPropsInput["providerRuntimeState"]["mcpDefaultCapabilityInstallProgress"]>(
        { phase: "running" } as unknown as AppRightPanelHostPropsInput["providerRuntimeState"]["mcpDefaultCapabilityInstallProgress"],
      );
    const openApiKeyDialog = vi.fn();
    const runUpdateAction = vi.fn();
    const updateThreadSettings = vi.fn();
    const updateMemorySettings = vi.fn();
    const loadSttMicrophoneDeviceList = vi.fn();
    const openLocalDeepResearchFollowupIfSetupNeeded = vi.fn();
    const props = createAppRightPanelHostProps(baseInput({
      actions: baseActions({
        loadSttMicrophoneDeviceList,
        openApiKeyDialog,
        openLocalDeepResearchFollowupIfSetupNeeded,
        runUpdateAction,
        updateMemorySettings,
        updateThreadSettings,
      }),
      providerRuntimeState: {
        ...baseProviderRuntimeState(),
        mcpContainerRuntimeInstallProgress: mcpContainerRuntimeInstallProgress.get(),
        setMcpContainerRuntimeInstallProgress: mcpContainerRuntimeInstallProgress.set,
        mcpDefaultCapabilityInstallProgress: mcpDefaultCapabilityInstallProgress.get(),
        setMcpDefaultCapabilityInstallProgress: mcpDefaultCapabilityInstallProgress.set,
      },
      rightPanelState: {
        ...baseRightPanelState(),
        setRightPanel: rightPanel.set,
      },
      setState: currentState.set,
      workspaceShellState: {
        ...baseWorkspaceShellState(),
        setWorkspaceRevision: workspaceRevision.set,
      },
    }));

    props.onOpenApiKey();
    props.onCheckUpdates();
    props.onThinkingLevelChange("high");
    props.onActiveThreadMemoryEnabledChange(false);
    const memorySnapshot = { mode: "project" } as unknown as DesktopState["settings"]["memory"];
    props.onMemorySettingsChange(memorySnapshot);
    props.onApplyMemorySettingsSnapshot(memorySnapshot);
    props.onLoadSttMicrophoneDevices(true);
    props.onClearMcpContainerRuntimeInstallProgress();
    props.onClearMcpDefaultCapabilityInstallProgress();
    props.onWorkspaceChanged();
    props.onOpenPluginCapabilities();
    props.onClose();
    props.onDefaultCapabilityInstalled();

    expect(openApiKeyDialog).toHaveBeenCalled();
    expect(runUpdateAction).toHaveBeenCalledWith("check");
    expect(updateThreadSettings).toHaveBeenCalledWith({ thinkingLevel: "high" });
    expect(updateThreadSettings).toHaveBeenCalledWith({ memoryEnabled: false });
    expect(updateMemorySettings).toHaveBeenCalledWith({ mode: "project" });
    expect(currentState.get()?.settings.memory).toEqual({ mode: "project" });
    expect(loadSttMicrophoneDeviceList).toHaveBeenCalledWith({ requestPermission: true });
    expect(mcpContainerRuntimeInstallProgress.get()).toBeUndefined();
    expect(mcpDefaultCapabilityInstallProgress.get()).toBeUndefined();
    expect(workspaceRevision.get()).toBe(4);
    expect(rightPanel.get()).toBeUndefined();
    expect(openLocalDeepResearchFollowupIfSetupNeeded).toHaveBeenCalled();
  });
});

function baseInput(input: Partial<AppRightPanelHostPropsInput> = {}): AppRightPanelHostPropsInput {
  return {
    actions: baseActions(),
    onBeginResize: vi.fn(),
    providerRuntimeState: baseProviderRuntimeState(),
    rightPanelState: baseRightPanelState(),
    running: false,
    securityPromptState: baseSecurityPromptState(),
    setState: vi.fn(),
    shellUiState: {
      searchRoutingHydrating: false,
      searchRoutingHydrationError: undefined,
      updateBusy: false,
    },
    state: desktopState(),
    workflowRuntimeState: baseWorkflowRuntimeState(),
    workspaceShellState: baseWorkspaceShellState(),
    ...input,
  } as unknown as AppRightPanelHostPropsInput;
}

function baseActions(input: Partial<AppRightPanelHostActions> = {}): AppRightPanelHostActions {
  const asyncNoop = vi.fn(async () => undefined);
  const noop = vi.fn();
  return {
    addContextAttachments: noop,
    cancelSttMicTest: noop,
    clearAgentMemory: vi.fn(async () => ({ cleared: true })),
    clearContextAttachments: noop,
    continueAfterBrowserUserActionIfReady: asyncNoop,
    exportDiagnostics: vi.fn(async () => undefined),
    hydrateSearchRoutingSettingsForSettingsPanel: asyncNoop,
    importDiagnostics: vi.fn(async () => undefined),
    installModelProviderEndpoint: vi.fn(async () => ({})),
    loadLocalDeepResearchRunHistory: asyncNoop,
    loadPermissionAudit: asyncNoop,
    loadPermissionGrants: asyncNoop,
    loadSttMicrophoneDeviceList: asyncNoop,
    loadSttProviders: asyncNoop,
    loadVoiceProviders: asyncNoop,
    openAmbientCliSecretDialog: noop,
    openApiKeyDialog: asyncNoop,
    openLocalDeepResearchFollowupIfSetupNeeded: asyncNoop,
    refreshAgentMemoryDiagnostics: asyncNoop,
    refreshVoiceCatalog: asyncNoop,
    removeContextAttachment: noop,
    revokePermissionGrant: asyncNoop,
    revokePermissionGrantIds: asyncNoop,
    runAgentMemoryEmbeddingLifecycleAction: vi.fn(async () => undefined),
    runLocalModelRuntimeLifecycleAction: vi.fn(async () => ({})),
    runUpdateAction: asyncNoop,
    saveModelProviderCredential: vi.fn(async () => ({})),
    selectThread: asyncNoop,
    setupLocalDeepResearchFromSettings: asyncNoop,
    setupMiniCpmVisionProviderFromSettings: asyncNoop,
    setupSttProvider: asyncNoop,
    startCapabilityBuilderPrompt: vi.fn(async () => ({})),
    startSttMicTest: asyncNoop,
    stopSttMicTestAndValidate: asyncNoop,
    updateFeatureFlagSettings: asyncNoop,
    updateLocalDeepResearchSettings: asyncNoop,
    updateMediaPlaybackSettings: asyncNoop,
    updateMemorySettings: asyncNoop,
    updateModelRuntimeSettings: asyncNoop,
    updatePlannerSettings: asyncNoop,
    updateSearchRoutingSettings: asyncNoop,
    updateSttSettings: asyncNoop,
    updateThemePreference: asyncNoop,
    updateThinkingDisplaySettings: asyncNoop,
    updateThreadSettings: asyncNoop,
    updateVoiceSettings: asyncNoop,
    ...input,
  } as unknown as AppRightPanelHostActions;
}

function baseRightPanelState(): AppRightPanelHostPropsInput["rightPanelState"] {
  return {
    rightPanel: "settings",
    rightPanelWidth: 520,
    settingsFocusRequest: undefined,
    artifactPreviewRequest: undefined,
    localFilePreviewRequest: undefined,
    gitPanelTabRequest: { tab: "summary" as const, nonce: 0 },
    setRightPanel: vi.fn(),
    openMcpRuntimeSettings: vi.fn(),
  };
}

function baseWorkspaceShellState(): AppRightPanelHostPropsInput["workspaceShellState"] {
  return {
    workspaceRevision: 1,
    pluginCatalogRevision: 2,
    browserRevision: 3,
    setWorkspaceRevision: vi.fn(),
    setActiveGitReview: vi.fn(),
  };
}

function baseSecurityPromptState(): AppRightPanelHostPropsInput["securityPromptState"] {
  return {
    permissionAuditRevision: 1,
    permissionAudit: [],
    permissionGrants: [],
    permissionAuditError: undefined,
    permissionGrantError: undefined,
    permissionGrantRevoking: undefined,
  };
}

function baseProviderRuntimeState(): AppRightPanelHostPropsInput["providerRuntimeState"] {
  return {
    voiceProviders: [],
    voiceProvidersLoading: false,
    voiceProvidersError: undefined,
    voiceProviderCacheStatus: { providerCount: 0 },
    voiceProviderCacheActivity: [],
    voiceCatalogRefresh: undefined,
    sttProviders: [],
    sttProvidersLoading: false,
    sttProvidersError: undefined,
    sttProviderCacheStatus: { providerCount: 0 },
    sttProviderCacheActivity: [],
    sttProviderSetup: { status: "idle" },
    sttMicrophoneDevices: [],
    sttMicrophoneDevicesLoading: false,
    sttMicrophoneDevicesError: undefined,
    miniCpmVisionSetup: { status: "idle" },
    miniCpmVisionRuntimePath: "",
    setMiniCpmVisionRuntimePath: vi.fn(),
    miniCpmVisionEndpointUrl: "",
    setMiniCpmVisionEndpointUrl: vi.fn(),
    localDeepResearchSetup: { status: "idle" },
    localDeepResearchQ8Override: false,
    setLocalDeepResearchQ8Override: vi.fn(),
    localDeepResearchRunHistory: { status: "idle" },
    sttMicTest: { status: "idle" },
    mcpContainerRuntimeInstallProgress: undefined,
    setMcpContainerRuntimeInstallProgress: vi.fn(),
    mcpDefaultCapabilityInstallProgress: undefined,
    setMcpDefaultCapabilityInstallProgress: vi.fn(),
    agentMemoryDiagnostics: undefined,
    agentMemoryDiagnosticsLoading: false,
    agentMemoryDiagnosticsError: undefined,
    agentMemoryEmbeddingActionLoading: undefined,
    agentMemoryEmbeddingActionResult: undefined,
    agentMemoryEmbeddingActionError: undefined,
  };
}

function baseWorkflowRuntimeState(): AppRightPanelHostPropsInput["workflowRuntimeState"] {
  return {
    orchestrationRevision: 1,
    orchestrationAutoRevision: 2,
    workflowRevision: 3,
    contextAttachments: [],
    setContextError: vi.fn(),
  };
}

function stateSetter<T>(initial: T): {
  get: () => T;
  set: Dispatch<SetStateAction<T>>;
} {
  let value = initial;
  return {
    get: () => value,
    set: (next) => {
      value = typeof next === "function" ? (next as (current: T) => T)(value) : next;
    },
  };
}

function desktopState(input: Partial<DesktopState> = {}): DesktopState {
  return {
    activeThreadId: "thread-1",
    settings: {
      memory: { mode: "off" },
    },
    ...input,
  } as DesktopState;
}
