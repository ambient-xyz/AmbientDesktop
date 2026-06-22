import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import {
  createAppShellLayoutProps,
  createAppShellLayoutPropsForApp,
  type AppShellLayoutPropsForAppInput,
  type AppShellLayoutPropsInput,
} from "./AppShellLayout";

describe("AppShellLayout props", () => {
  it("adapts update actions, project title, memory toggle, and workflow review focus", () => {
    const runUpdateAction = vi.fn();
    const setUpdatePopoverOpen = vi.fn();
    const setSidebarOpen = vi.fn();
    const updateThreadSettings = vi.fn();
    const focusEnd = vi.fn();
    const props = createAppShellLayoutProps(
      baseInput({
        activeThread: {
          title: "Build thread",
          memoryEnabled: true,
          workflowRecording: { id: "recording-1" } as unknown as AppShellLayoutPropsInput["activeThread"]["workflowRecording"],
        },
        composerInputRef: { current: { focusEnd, getValue: () => "", setValue: vi.fn() } },
        runUpdateAction,
        setSidebarOpen,
        setUpdatePopoverOpen,
        showTopbarThreadMemoryToggle: true,
        updateThreadSettings,
        workflowRecordingReviewFeedbackActive: true,
      }),
    );

    expect(props.topbarProps.title).toBe("Build thread");
    expect(props.topbarProps.memoryMode).toBe("per_thread");
    expect(props.topbarProps.threadMemoryEnabled).toBe(true);
    props.topbarProps.onShowSidebar();
    props.topbarProps.onOpenApiKey();
    props.topbarProps.onToggleThreadMemory?.(false);
    props.updateNoticeProps.onCheck();
    props.updateNoticeProps.onDownload();
    props.updateNoticeProps.onInstall();
    props.updateNoticeProps.onDismiss();
    props.workspaceRouterProps.workflowReviewPanelProps.onFocusFeedback();

    expect(setSidebarOpen).toHaveBeenCalledWith(true);
    expect(updateThreadSettings).toHaveBeenCalledWith({ memoryEnabled: false });
    expect(runUpdateAction.mock.calls).toEqual([["check"], ["download"], ["install"], ["dismiss"]]);
    expect(focusEnd).toHaveBeenCalled();
    expect(props.workspaceRouterProps.workflowReviewPanelProps.recording).toEqual({ id: "recording-1" });
  });

  it("uses workflow thread, folder, then home titles for automation shells", () => {
    expect(
      createAppShellLayoutProps(
        baseInput({
          sidebarArea: "automations",
          selectedWorkflowAgentThread: { title: "Workflow thread" } as AppShellLayoutPropsInput["selectedWorkflowAgentThread"],
        }),
      ).topbarProps.title,
    ).toBe("Workflow thread");
    expect(
      createAppShellLayoutProps(
        baseInput({
          sidebarArea: "automations",
          selectedWorkflowAgentFolder: { name: "Workflow folder" } as AppShellLayoutPropsInput["selectedWorkflowAgentFolder"],
        }),
      ).topbarProps.title,
    ).toBe("Workflow folder");
    expect(createAppShellLayoutProps(baseInput({ sidebarArea: "automations" })).topbarProps.title).toBe("Workflow Recordings");
  });

  it("adapts grouped App owner state into shell layout props", () => {
    const runUpdateAction = vi.fn();
    const setUpdatePopoverOpen = vi.fn();
    const props = createAppShellLayoutPropsForApp(appInputFromBase(baseInput({
      sidebarArea: "automations",
      selectedWorkflowAgentFolder: { name: "Folder" } as AppShellLayoutPropsInput["selectedWorkflowAgentFolder"],
      showTopbarThreadMemoryToggle: true,
    }), {
      runUpdateAction,
      setUpdatePopoverOpen,
    }));

    expect(props.topbarProps.title).toBe("Folder");
    expect(props.isMac).toBe(true);
    expect(props.topbarProps.memoryMode).toBe("per_thread");
    props.updateNoticeProps.onCheck();
    props.updateNoticeProps.onToggle();
    expect(runUpdateAction).toHaveBeenCalledWith("check");
    expect(setUpdatePopoverOpen).toHaveBeenCalled();
  });
});

function baseInput(input: Partial<AppShellLayoutPropsInput> = {}): AppShellLayoutPropsInput {
  const noop = vi.fn();
  return {
    activeGitReview: undefined,
    activeGitReviewError: undefined,
    activeProjectBoardTopbarAction: undefined,
    activeThread: { title: "Thread", memoryEnabled: false, workflowRecording: undefined },
    automationsWorkspaceProps: {} as AppShellLayoutPropsInput["automationsWorkspaceProps"],
    beginWorkflowRecorderReviewResize: noop,
    composerInputRef: { current: null },
    composerProps: {} as AppShellLayoutPropsInput["composerProps"],
    confirmActiveWorkflowRecordingReview: noop,
    conversationMessagesProps: {} as AppShellLayoutPropsInput["conversationMessagesProps"],
    conversationReviewPanelDocked: false,
    isMac: false,
    modalHostProps: {} as AppShellLayoutPropsInput["modalHostProps"],
    openApiKeyDialog: noop,
    openGitSummaryPanel: noop,
    projectBoardWorkspaceProps: undefined,
    rightPanel: undefined,
    rightPanelHostProps: {} as AppShellLayoutPropsInput["rightPanelHostProps"],
    runUpdateAction: noop,
    running: false,
    selectedWorkflowAgentFolder: undefined,
    selectedWorkflowAgentThread: undefined,
    sendWorkflowRecordingReviewPrompt: noop,
    setError: noop,
    setSidebarOpen: noop,
    setUpdatePopoverOpen: noop,
    setWorkflowRecordingReviewPanelOpen: noop,
    showTopbarThreadMemoryToggle: false,
    sidebarArea: "projects",
    sidebarOpen: true,
    sidebarProps: {} as AppShellLayoutPropsInput["sidebarProps"],
    state: desktopState(),
    togglePanel: noop,
    updateActiveWorkflowRecordingReview: noop,
    updateBusy: false,
    updatePopoverOpen: false,
    updateThreadSettings: noop,
    workflowRecorderReviewPanelWidth: 360,
    workflowRecordingReviewFeedbackActive: false,
    workflowRecordingReviewPanelOpen: false,
    applyLatestWorkflowRecordingSummary: noop,
    ...input,
  } as AppShellLayoutPropsInput;
}

function appInputFromBase(
  base: AppShellLayoutPropsInput,
  overrides: {
    runUpdateAction?: AppShellLayoutPropsForAppInput["updateActions"]["runUpdateAction"];
    setUpdatePopoverOpen?: AppShellLayoutPropsInput["setUpdatePopoverOpen"];
  } = {},
): AppShellLayoutPropsForAppInput {
  return {
    activeProjectBoardTopbarAction: base.activeProjectBoardTopbarAction,
    activeThread: base.activeThread,
    activeThreadModel: {
      isMac: true,
      showTopbarThreadMemoryToggle: base.showTopbarThreadMemoryToggle,
    },
    automationsWorkspaceProps: base.automationsWorkspaceProps,
    beginWorkflowRecorderReviewResize: base.beginWorkflowRecorderReviewResize,
    composerInputRef: base.composerInputRef,
    composerProps: base.composerProps,
    confirmActiveWorkflowRecordingReview: base.confirmActiveWorkflowRecordingReview,
    conversationMessagesProps: base.conversationMessagesProps,
    modalHostProps: base.modalHostProps,
    openApiKeyDialog: base.openApiKeyDialog,
    openGitSummaryPanel: base.openGitSummaryPanel,
    projectBoardWorkspaceProps: base.projectBoardWorkspaceProps,
    rightPanelHostProps: base.rightPanelHostProps,
    rightPanelState: {
      rightPanel: base.rightPanel,
      togglePanel: base.togglePanel,
    },
    running: base.running,
    selectedWorkflowAgentFolder: base.selectedWorkflowAgentFolder,
    selectedWorkflowAgentThread: base.selectedWorkflowAgentThread,
    sendWorkflowRecordingReviewPrompt: base.sendWorkflowRecordingReviewPrompt,
    setError: base.setError,
    shellUiState: {
      setSidebarOpen: base.setSidebarOpen,
      setUpdatePopoverOpen: overrides.setUpdatePopoverOpen ?? base.setUpdatePopoverOpen,
      sidebarArea: base.sidebarArea,
      sidebarOpen: base.sidebarOpen,
      updateBusy: base.updateBusy,
      updatePopoverOpen: base.updatePopoverOpen,
      workflowRecorderReviewPanelWidth: base.workflowRecorderReviewPanelWidth,
    },
    sidebarProps: base.sidebarProps,
    state: base.state,
    updateActions: {
      runUpdateAction: overrides.runUpdateAction ?? base.runUpdateAction,
    },
    updateActiveWorkflowRecordingReview: base.updateActiveWorkflowRecordingReview,
    updateThreadSettings: base.updateThreadSettings,
    workflowRecordingReviewControls: {
      conversationReviewPanelDocked: base.conversationReviewPanelDocked,
      setWorkflowRecordingReviewPanelOpen: base.setWorkflowRecordingReviewPanelOpen,
      workflowRecordingReviewFeedbackActive: base.workflowRecordingReviewFeedbackActive,
      workflowRecordingReviewPanelOpen: base.workflowRecordingReviewPanelOpen,
    },
    workspaceShellState: {
      activeGitReview: base.activeGitReview,
      activeGitReviewError: base.activeGitReviewError,
    },
    applyLatestWorkflowRecordingSummary: base.applyLatestWorkflowRecordingSummary,
  } as AppShellLayoutPropsForAppInput;
}

function desktopState(): DesktopState {
  return {
    app: { update: { status: "idle" } },
    provider: { hasApiKey: true, providerLabel: "Ambient" },
    settings: {
      memory: { mode: "per_thread" },
    },
  } as DesktopState;
}
