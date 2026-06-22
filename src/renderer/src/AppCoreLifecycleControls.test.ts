import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import {
  useAppCoreLifecycleControls,
  type AppCoreLifecycleControls,
  type AppCoreLifecycleControlsOptions,
} from "./AppCoreLifecycleControls";

const mocks = vi.hoisted(() => ({
  applyDocumentAppearance: vi.fn(),
  appBootstrapRunStatus: vi.fn(() => "running"),
  composerMode: vi.fn(),
  messageScroll: vi.fn(() => ({
    handleMessagesScroll: vi.fn(),
    jumpToLatestMessage: vi.fn(),
    requestMessageTail: vi.fn(),
    scrollRef: { current: null },
    showScrollToBottom: false,
  })),
  runActivity: vi.fn(() => ({
    appendRunActivityLine: vi.fn(),
    appendThinkingDeltaLine: vi.fn(),
    resetRunActivityLines: vi.fn(),
  })),
  shellGlobal: vi.fn(),
  speechProvider: vi.fn(),
  startup: vi.fn(),
  statusSubscriptions: vi.fn(),
  sttLifecycle: vi.fn(),
  threadLifecycle: vi.fn(),
  unmountCleanup: vi.fn(),
  welcomeKind: vi.fn(() => "plugin_setup"),
  welcomeRegistry: vi.fn(),
}));

vi.mock("./appearance", () => ({
  applyDocumentAppearance: mocks.applyDocumentAppearance,
}));

vi.mock("./AppMessageScrollControls", () => ({
  useAppMessageScrollControls: mocks.messageScroll,
}));

vi.mock("./AppRunActivity", () => ({
  useAppRunActivityControls: mocks.runActivity,
}));

vi.mock("./AppShellGlobalEffects", () => ({
  useAppShellGlobalEffects: mocks.shellGlobal,
}));

vi.mock("./AppShellLifecycleEffects", () => ({
  useAppComposerModeThreadLifecycleEffects: mocks.composerMode,
  useAppSpeechProviderLifecycleEffects: mocks.speechProvider,
  useAppUnmountCleanupLifecycleEffect: mocks.unmountCleanup,
  useAppWelcomePluginRegistryLifecycleEffect: mocks.welcomeRegistry,
}));

vi.mock("./AppStartupLifecycleEffects", () => ({
  appBootstrapRunStatus: mocks.appBootstrapRunStatus,
  useAppStartupLifecycleEffects: mocks.startup,
}));

vi.mock("./AppStatusSubscriptions", () => ({
  useAppStatusSubscriptions: mocks.statusSubscriptions,
}));

vi.mock("./AppSttLifecycleEffects", () => ({
  useAppSttLifecycleEffects: mocks.sttLifecycle,
}));

vi.mock("./AppThreadLifecycleEffects", () => ({
  useAppThreadLifecycleEffects: mocks.threadLifecycle,
}));

vi.mock("./welcomeSetupUiModel", () => ({
  welcomeOnboardingPageKindForMessages: mocks.welcomeKind,
}));

describe("AppCoreLifecycleControls", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockClear();
  });

  it("wires core lifecycle hooks and returns scroll/run-activity controls", () => {
    let controls: AppCoreLifecycleControls | undefined;
    const options = optionsStub();

    function Harness() {
      controls = useAppCoreLifecycleControls(options);
      return React.createElement("div");
    }

    renderToStaticMarkup(React.createElement(Harness));

    expect(mocks.startup).toHaveBeenCalledWith(
      expect.objectContaining({
        loadPendingPermissionRequests: options.loadPendingPermissionRequests,
        onDesktopEvent: options.handleEvent,
        openMcpRuntimeSettings: options.openMcpRuntimeSettings,
        state: options.state,
      }),
    );
    expect(mocks.messageScroll).toHaveBeenCalledWith(
      expect.objectContaining({
        activeThreadId: "thread-1",
        chatBrowserUserActionId: "browser-action-1",
        welcomeOnboardingPageKind: "plugin_setup",
      }),
    );
    expect(mocks.runActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        requestMessageTail: controls?.requestMessageTail,
      }),
    );
    expect(mocks.statusSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({
        appendRunActivityLine: controls?.appendRunActivityLine,
        chatBrowserUserAction: options.chatBrowserUserAction,
        running: true,
        state: options.state,
      }),
    );
    expect(controls?.activeWelcomeOnboardingPageKind).toBe("plugin_setup");

    const bootstrapState = desktopState({ activeThreadId: "boot-thread" });
    mocks.startup.mock.calls[0][0].onBootstrapState(bootstrapState);
    expect(options.rememberDesktopState).toHaveBeenCalledWith(bootstrapState);
    expect(mocks.applyDocumentAppearance).toHaveBeenCalledWith("dark");
    expect(options.setThreadRunStatuses).toHaveBeenCalledWith({ "boot-thread": "running" });
    expect(options.setRunStatus).toHaveBeenCalledWith("running");
    expect(options.setState).toHaveBeenCalledWith(bootstrapState);
  });
});

function optionsStub(): AppCoreLifecycleControlsOptions {
  return {
    activeProjectRootRef: { current: undefined },
    activeRunActivityLines: [],
    activeThreadIdRef: { current: "thread-1" },
    browserRevision: 1,
    cancelSttComposerRecording: vi.fn(),
    chatBrowserUserAction: {
      id: "browser-action-1",
      status: "waiting",
      active: true,
    } as AppCoreLifecycleControlsOptions["chatBrowserUserAction"],
    chatBrowserUserActionId: "browser-action-1",
    chatBrowserUserActionStatus: "waiting",
    chatFindInputRef: { current: null },
    closeContextMenus: vi.fn(),
    contextMenusOpen: false,
    errorScope: undefined,
    goalCompletionCelebrationTimerRef: { current: undefined },
    handleEvent: vi.fn(),
    loadPendingPermissionRequests: vi.fn(),
    loadPermissionAudit: vi.fn(),
    loadPermissionGrants: vi.fn(),
    loadSttMicrophoneDeviceList: vi.fn(),
    loadSttProviders: vi.fn(),
    loadVoiceProviders: vi.fn(),
    mcpContainerRuntimeStartupCheckRef: { current: false },
    messageKindsRef: { current: {} },
    openMcpRuntimeSettings: vi.fn(),
    permissionAuditRevision: 1,
    pluginCatalogRevision: 2,
    previousRunningRef: { current: false },
    rememberDesktopState: vi.fn((next) => next),
    resetPromptHistory: vi.fn(),
    runActivityCounterRef: { current: 0 },
    runActivityHeartbeatIndexRef: { current: 0 },
    runActivityLastEventAtRef: { current: 0 },
    runActivityLinesByThreadRef: { current: {} },
    running: true,
    setAbortArmed: vi.fn(),
    setActiveGitReview: vi.fn(),
    setActiveGitReviewError: vi.fn(),
    setAutomationFolders: vi.fn(),
    setChatBrowserUserAction: vi.fn(),
    setChatFindOpen: vi.fn(),
    setCommandPaletteOpen: vi.fn(),
    setCommandPaletteQuery: vi.fn(),
    setContextAttachments: vi.fn(),
    setContextError: vi.fn(),
    setError: vi.fn(),
    setErrorScope: vi.fn(),
    setErrorState: vi.fn(),
    setGitStatus: vi.fn(),
    setGitStatusError: vi.fn(),
    setGoalMenuOpen: vi.fn(),
    setGoalModeArmed: vi.fn(),
    setLocalDeepResearchModeArmed: vi.fn(),
    setRetryStatsByThread: vi.fn(),
    setRightPanel: vi.fn(),
    setRunActivityLinesByThread: vi.fn(),
    setRunStatus: vi.fn(),
    setSidebarAgeNow: vi.fn(),
    setSidebarWidth: vi.fn(),
    setState: vi.fn(),
    setThreadRunStatuses: vi.fn(),
    setWelcomeAmbientPluginRegistry: vi.fn(),
    setWorkflowAgentFolders: vi.fn(),
    startSttComposerRecording: vi.fn(),
    state: desktopState({ activeThreadId: "thread-1" }),
    stopSttComposerRecording: vi.fn(),
    sttComposerRecorderRef: { current: undefined },
    sttComposerShortcutActiveRef: { current: false },
    sttComposerStatus: "idle",
    sttComposerThreadRef: { current: undefined },
    sttMicRecorderRef: { current: undefined },
    sttProviderRefreshTimerRef: { current: undefined },
    thinkingDeltaBuffersRef: { current: {} },
    threadRunStatuses: { "thread-1": "running" },
    voiceProviderRefreshTimerRef: { current: undefined },
    workspaceProjectAliasesRef: { current: new Map() },
    workspaceRevision: 3,
  } as unknown as AppCoreLifecycleControlsOptions;
}

function desktopState(overrides: Partial<DesktopState> = {}): DesktopState {
  return {
    activeThreadId: "thread-1",
    activeWorkspace: {
      name: "Workspace",
      path: "/workspace",
      sessionPath: "/workspace/.ambient/session",
      statePath: "/workspace/.ambient/state",
    },
    appearance: "dark",
    messages: [],
    settings: {
      collaborationMode: "agent",
    },
    threadRunStatuses: {
      [overrides.activeThreadId ?? "thread-1"]: "running",
    },
    workspace: {
      name: "Workspace",
      path: "/workspace",
      sessionPath: "/workspace/.ambient/session",
      statePath: "/workspace/.ambient/state",
    },
    ...overrides,
  } as DesktopState;
}
