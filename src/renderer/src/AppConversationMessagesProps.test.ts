import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import {
  createAppConversationMessagesProps,
  createAppConversationMessagesPropsForApp,
  type AppConversationMessagesPropsInput,
  type AppConversationMessagesPropsForAppInput,
} from "./AppConversationMessagesProps";

describe("App conversation message props", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("derives conversation state props and routes panel callbacks", async () => {
    const abortRun = vi.fn(async () => undefined);
    vi.stubGlobal("window", { ambientDesktop: { abortRun } });
    const onOpenPanel = vi.fn();
    const props = createAppConversationMessagesProps(
      baseInput({
        activeProjectHasBoard: true,
        canRetryContextRecovery: true,
        messageTailVisible: false,
        onOpenPanel,
        state: desktopState({
          activeThreadId: "thread-2",
          activeWorkspace: { path: "/workspace-copy" },
          provider: { providerLabel: "Ambient" },
          providerCatalog: { cards: [] },
          settings: {
            media: { generatedMediaAutoplay: true },
            modelRuntime: { showPromptCacheStatus: false },
          },
          workspace: { path: "/project-root" },
        }),
      }),
    );

    expect(props.activeThreadId).toBe("thread-2");
    expect(props.activeWorkspacePath).toBe("/workspace-copy");
    expect(props.projectRootPath).toBe("/project-root");
    expect(props.provider.providerLabel).toBe("Ambient");
    expect(props.providerCatalog).toEqual({ cards: [] });
    expect(props.generatedMediaAutoplay).toBe(true);
    expect(props.hasProjectBoard).toBe(true);
    expect(props.canRetryContextRecovery).toBe(true);
    expect(props.messageTailVisible).toBe(false);

    props.onOpenSettingsPanel();
    props.onOpenPluginsPanel();
    props.onOpenBrowserPanel();
    await props.onAbortRun("thread-2");

    expect(onOpenPanel.mock.calls).toEqual([["settings"], ["plugins"], ["browser"]]);
    expect(abortRun).toHaveBeenCalledWith("thread-2");
  });

  it("keeps project-board and subagent callback adapters stable", () => {
    const addPlannerPlanToBoard = vi.fn();
    const generatePlannerDurableArtifact = vi.fn();
    const onCancelSubagentChild = vi.fn();
    const onOpenCallableWorkflowThread = vi.fn();
    const onOpenBrowserForUserAction = vi.fn();
    const onResolveSubagentApprovalAction = vi.fn();
    const onSelectThread = vi.fn();
    const props = createAppConversationMessagesProps(
      baseInput({
        onCancelSubagentChild,
        onOpenBrowserForUserAction,
        onOpenCallableWorkflowThread,
        onResolveSubagentApprovalAction,
        onSelectThread,
        projectBoardActions: { addPlannerPlanToBoard, generatePlannerDurableArtifact },
        state: desktopState({
          activeWorkspace: { path: "/workspace-fallback" },
          projects: [{ id: "project-1", path: "/parent-workspace" }],
          threads: [{ id: "parent-thread-1", workspacePath: "/parent-workspace" }],
        }),
      }),
    );
    const child = { childThreadId: "child-thread-1" };
    const childInspector = {
      runId: "child-run-1",
      parentThreadId: "parent-thread-1",
      parentWorkspacePath: "/child-workspace",
    };
    const task = { id: "task-1" };
    const approvalAction = { approvalId: "approval-1" };
    const browserAction = { id: "browser-action-1" };
    const artifact = { id: "artifact-1" };

    props.onAddPlannerPlanToBoard(artifact as Parameters<typeof addPlannerPlanToBoard>[0]);
    props.onGeneratePlannerDurableArtifact(artifact as Parameters<typeof generatePlannerDurableArtifact>[0]);
    props.onOpenSubagentThread(child as Parameters<typeof props.onOpenSubagentThread>[0]);
    props.onOpenSubagentParentThread(childInspector as Parameters<typeof props.onOpenSubagentParentThread>[0]);
    props.onCancelSubagentChild(child as Parameters<typeof props.onCancelSubagentChild>[0]);
    props.onOpenCallableWorkflowThread(task as Parameters<typeof props.onOpenCallableWorkflowThread>[0]);
    props.onResolveSubagentApprovalAction(approvalAction as Parameters<typeof props.onResolveSubagentApprovalAction>[0]);
    props.onOpenBrowserForUserAction(browserAction as Parameters<typeof props.onOpenBrowserForUserAction>[0]);

    expect(addPlannerPlanToBoard).toHaveBeenCalledWith(artifact);
    expect(generatePlannerDurableArtifact).toHaveBeenCalledWith(artifact);
    expect(onSelectThread).toHaveBeenCalledWith("child-thread-1", "/workspace-fallback");
    expect(onSelectThread).toHaveBeenCalledWith("parent-thread-1", "/parent-workspace");
    expect(onCancelSubagentChild).toHaveBeenCalledWith(child);
    expect(onOpenCallableWorkflowThread).toHaveBeenCalledWith(task);
    expect(onResolveSubagentApprovalAction).toHaveBeenCalledWith(approvalAction);
    expect(onOpenBrowserForUserAction).toHaveBeenCalledWith(browserAction);
  });

  it("packs App owner groups into conversation message props", () => {
    const onOpenPanel = vi.fn();
    const retryFailedPrompt = vi.fn();
    const openExternalUrl = vi.fn();
    const input = baseInput({
      activeProjectHasBoard: true,
      canRetryContextRecovery: true,
      onOpenPanel,
      onOpenUrl: openExternalUrl,
      onRetryMessage: retryFailedPrompt,
      state: desktopState({
        activeThreadId: "thread-2",
        activeWorkspace: { path: "/workspace-copy" },
        workspace: { path: "/project-root" },
      }),
    });
    const props = createAppConversationMessagesPropsForApp(appInputFromBase(input));

    expect(props.activeThreadId).toBe("thread-2");
    expect(props.activeWorkspacePath).toBe("/workspace-copy");
    expect(props.projectRootPath).toBe("/project-root");
    expect(props.hasProjectBoard).toBe(true);
    expect(props.canRetryContextRecovery).toBe(true);

    const retryMessage = { id: "message-1" } as Parameters<typeof props.onRetryMessage>[0];
    props.onOpenSettingsPanel();
    props.onOpenPluginsPanel();
    props.onOpenBrowserPanel();
    props.onRetryMessage(retryMessage);
    props.onOpenUrl("https://example.com");

    expect(onOpenPanel.mock.calls).toEqual([["settings"], ["plugins"], ["browser"]]);
    expect(retryFailedPrompt).toHaveBeenCalledWith(retryMessage);
    expect(openExternalUrl).toHaveBeenCalledWith("https://example.com");
  });

  it("loads older thread messages through the paged desktop API", async () => {
    const oldMessage = {
      id: "message-old",
      threadId: "thread-1",
      role: "assistant",
      content: "Earlier result",
      createdAt: "2026-06-13T00:00:00.000Z",
    };
    const currentMessage = {
      id: "message-current",
      threadId: "thread-1",
      role: "assistant",
      content: "Current result",
      createdAt: "2026-06-13T00:01:00.000Z",
    };
    const listThreadMessagesBefore = vi.fn(async () => ({
      threadId: "thread-1",
      order: "ascending",
      limit: 100,
      messages: [oldMessage],
      hasMoreBefore: false,
    }));
    const setState = vi.fn((updater: Parameters<AppConversationMessagesPropsInput["setState"]>[0]) => {
      if (typeof updater !== "function") throw new Error("Expected functional state update.");
      const next = updater(
        desktopState({
          activeThreadId: "thread-1",
          messages: [currentMessage],
          messageWindow: { threadId: "thread-1", order: "latest", limit: 250, loadedCount: 250, hasMoreBefore: true },
        }),
      );
      expect(next?.messages.map((message) => message.id)).toEqual(["message-old", "message-current"]);
      expect(next?.messageWindow?.loadedCount).toBe(2);
      expect(next?.messageWindow?.hasMoreBefore).toBe(false);
    });
    vi.stubGlobal("window", { ambientDesktop: { listThreadMessagesBefore } });

    const props = createAppConversationMessagesProps(
      baseInput({
        setState,
        state: desktopState({
          activeThreadId: "thread-1",
          messages: [currentMessage],
          messageWindow: { threadId: "thread-1", order: "latest", limit: 250, loadedCount: 250, hasMoreBefore: true },
        }),
      }),
    );

    await props.onLoadOlderMessages();

    expect(listThreadMessagesBefore).toHaveBeenCalledWith({
      threadId: "thread-1",
      beforeMessageId: "message-current",
      limit: 100,
    });
    expect(setState).toHaveBeenCalledTimes(1);
  });

  it("opens subagent parent threads in-place when the child worktree path is not a registered project", () => {
    const onSelectThread = vi.fn();
    const props = createAppConversationMessagesProps(
      baseInput({
        onSelectThread,
        state: desktopState({
          activeWorkspace: { path: "/workspace/.ambient-codex/worktrees/child" },
          projects: [{ id: "project-1", path: "/workspace" }],
          threads: [{ id: "parent-thread-1", workspacePath: "/workspace/.ambient-codex/worktrees/child" }],
        }),
      }),
    );

    props.onOpenSubagentParentThread({
      runId: "child-run-1",
      parentThreadId: "parent-thread-1",
      parentWorkspacePath: "/workspace/.ambient-codex/worktrees/child",
    } as Parameters<typeof props.onOpenSubagentParentThread>[0]);

    expect(onSelectThread).toHaveBeenCalledWith("parent-thread-1", undefined);
  });
});

function baseInput(input: Partial<AppConversationMessagesPropsInput> = {}): AppConversationMessagesPropsInput {
  const noop = vi.fn();
  return {
    abortArmed: false,
    activeActivity: undefined,
    activeChatBrowserUserAction: undefined,
    activeProjectHasBoard: false,
    activeRunActivityLines: [],
    activeSubagentInspector: undefined,
    activeThread: {},
    activeThreadVoiceStatus: undefined,
    activeThreadVoiceStatusDismissKey: undefined,
    activeThreadVoiceStatusVisible: false,
    activeVoiceMessageId: undefined,
    activeWorkspaceIsPreparedLocalTask: false,
    artifactPathHints: {},
    autoplayVoiceKey: undefined,
    callableWorkflowTaskCancelBusy: undefined,
    callableWorkflowTaskPauseBusy: undefined,
    callableWorkflowTaskResumeBusy: undefined,
    canRetryContextRecovery: false,
    chatBrowserUserActionBusy: undefined,
    chatExportBusy: false,
    chatFindCount: 0,
    chatFindIndex: 0,
    chatFindInputRef: { current: null },
    chatFindOpen: false,
    chatFindQuery: "",
    contextRecoveryBusy: false,
    error: undefined,
    errorNeedsSessionRecovery: false,
    goalCompletionCelebrationId: undefined,
    latestReadyVoiceAutoplay: undefined,
    messageVoiceStates: {},
    onActiveVoiceMessageChange: noop,
    onAnswerPlannerDecisionQuestion: noop,
    onCancelBrowserUserAction: noop,
    onCancelCallableWorkflowTask: noop,
    onCancelSubagentChild: noop,
    onChatFindClose: noop,
    onChatFindNext: noop,
    onChatFindPrevious: noop,
    onChatFindQueryChange: noop,
    onClearVoiceArtifact: noop,
    onCloseSubagentChild: noop,
    onDismissActiveThreadVoiceStatus: noop,
    onDismissError: noop,
    onDuplicateActiveThreadFromTranscript: noop,
    onExportActiveChat: noop,
    onImplementPlannerPlan: noop,
    onJumpToLatestMessage: noop,
    onMessagesScroll: noop,
    onOpenAmbientKeys: noop,
    onOpenApiKeyDialog: noop,
    onOpenBrowserForUserAction: noop,
    onOpenBrowserUrl: noop,
    onOpenCallableWorkflowThread: noop,
    onOpenMediaModal: noop,
    onOpenPanel: noop,
    onOpenUrl: noop,
    onPauseCallableWorkflowTask: noop,
    onPreviewLocalPath: noop,
    onPreviewPath: noop,
    onRecoverActiveThreadContext: noop,
    onRecoverAndRetryLatest: noop,
    onRefinePlannerPlan: noop,
    onRegenerateVoice: noop,
    onResolveSubagentApprovalAction: noop,
    onResolveSubagentBarrierAction: noop,
    onResumeBrowserUserAction: noop,
    onResumeCallableWorkflowTask: noop,
    onRetryMessage: noop,
    onRetryPlannerFinalization: noop,
    onRetryWorkflowRecordingReview: noop,
    onRevealVoiceArtifact: noop,
    onSelectThread: noop,
    onSendRemoteSurfaceActivationPrompt: noop,
    onSendTelegramSessionSetupPrompt: noop,
    onStartWelcomeFirstRunCapabilityOnboarding: noop,
    onStartWelcomeProviderCatalogCardOnboarding: noop,
    onStartWelcomeRemoteSurfaceActivation: noop,
    onStopWorkflowRecording: noop,
    plannerArtifactByMessageId: new Map(),
    projectBoardActions: {
      addPlannerPlanToBoard: noop,
      generatePlannerDurableArtifact: noop,
    },
    setState: noop,
    retryStats: undefined,
    retryableMessageIds: new Set(),
    runActivityLinesByThread: {},
    running: false,
    runStatus: "idle",
    runStatusCardVisible: false,
    runtimeStatusIndicators: [],
    scrollRef: { current: null },
    messageTailVisible: true,
    showScrollToBottom: false,
    state: desktopState(),
    streamingAssistantId: undefined,
    subagentApprovalActionBusy: undefined,
    subagentBarrierActionBusy: undefined,
    subagentChildCancelBusy: undefined,
    subagentChildCloseBusy: undefined,
    subagentParentClustersByMessageId: new Map(),
    thinkingDisplayMode: "full",
    threadRunStatuses: {},
    transientThinkingActivityLines: [],
    visibleChatMessages: [],
    visibleRunActivityLines: [],
    voiceProviderLabels: {},
    welcomeAmbientPluginRegistry: undefined,
    workflowRecorderEmptyChatState: undefined,
    workflowRecordingReviewRunning: false,
    ...input,
  } as unknown as AppConversationMessagesPropsInput;
}

function appInputFromBase(input: AppConversationMessagesPropsInput): AppConversationMessagesPropsForAppInput {
  return {
    activeThreadModel: {
      activeActivity: input.activeActivity,
      activeChatBrowserUserAction: input.activeChatBrowserUserAction,
      activeThread: input.activeThread,
    },
    browserActionControls: {
      cancelBrowserUserActionFromChat: input.onCancelBrowserUserAction,
      openBrowserForUserAction: input.onOpenBrowserForUserAction,
      openExternalUrl: input.onOpenUrl,
      openUrlInAmbientBrowser: input.onOpenBrowserUrl,
      resumeBrowserUserActionFromChat: input.onResumeBrowserUserAction,
    },
    capabilityPromptActions: {
      sendRemoteSurfaceActivationPrompt: input.onSendRemoteSurfaceActivationPrompt,
      sendTelegramSessionSetupPrompt: input.onSendTelegramSessionSetupPrompt,
      startWelcomeFirstRunCapabilityOnboarding: input.onStartWelcomeFirstRunCapabilityOnboarding,
      startWelcomeProviderCatalogCardOnboarding: input.onStartWelcomeProviderCatalogCardOnboarding,
      startWelcomeRemoteSurfaceActivation: input.onStartWelcomeRemoteSurfaceActivation,
    },
    chatFindControls: {
      chatFindCount: input.chatFindCount,
      chatFindIndex: input.chatFindIndex,
      chatFindInputRef: input.chatFindInputRef,
      chatFindOpen: input.chatFindOpen,
      chatFindQuery: input.chatFindQuery,
      onChatFindClose: input.onChatFindClose,
      onChatFindNext: input.onChatFindNext,
      onChatFindPrevious: input.onChatFindPrevious,
      setChatFindQuery: input.onChatFindQueryChange,
    },
    composerRetryActions: {
      retryFailedPrompt: input.onRetryMessage,
    },
    conversationDisplayModel: {
      artifactPathHints: input.artifactPathHints,
      latestRecoveryPrompt: input.canRetryContextRecovery ? { id: "recovery-prompt" } : undefined,
      plannerArtifactByMessageId: input.plannerArtifactByMessageId,
      retryableMessageIds: input.retryableMessageIds,
      streamingAssistantId: input.streamingAssistantId,
      transientThinkingActivityLines: input.transientThinkingActivityLines,
      visibleChatMessages: input.visibleChatMessages,
      visibleRunActivityLines: input.visibleRunActivityLines,
    },
    coreLifecycleControls: {
      handleMessagesScroll: input.onMessagesScroll,
      jumpToLatestMessage: input.onJumpToLatestMessage,
      messageTailVisible: input.messageTailVisible,
      scrollRef: input.scrollRef,
      showScrollToBottom: input.showScrollToBottom,
    },
    credentialDialogActions: {
      openAmbientKeys: input.onOpenAmbientKeys,
      openApiKeyDialog: input.onOpenApiKeyDialog,
    },
    messageVoiceActions: {
      clearMessageVoiceArtifact: input.onClearVoiceArtifact,
      regenerateMessageVoice: input.onRegenerateVoice,
      revealMessageVoiceArtifact: input.onRevealVoiceArtifact,
    },
    plannerActions: {
      answerPlannerDecisionQuestion: input.onAnswerPlannerDecisionQuestion,
      finalizePlannerPlan: input.onRetryPlannerFinalization,
      implementPlannerPlan: input.onImplementPlannerPlan,
      openPlannerRevisionDialog: input.onRefinePlannerPlan,
    },
    previewActions: {
      onOpenMediaModal: input.onOpenMediaModal,
      onPreviewLocalPath: input.onPreviewLocalPath,
      onPreviewPath: input.onPreviewPath,
    },
    projectBoardControls: {
      activeProject: input.activeProjectHasBoard ? { board: {} } : undefined,
      activeWorkspaceIsPreparedLocalTask: input.activeWorkspaceIsPreparedLocalTask,
      errorNeedsSessionRecovery: input.errorNeedsSessionRecovery,
      projectBoardActions: input.projectBoardActions,
    },
    rightPanelState: {
      openPanel: input.onOpenPanel,
    },
    runActivityState: {
      abortArmed: input.abortArmed,
      retryStatsByThread: { [input.state.activeThreadId]: input.retryStats },
      runActivityLinesByThread: input.runActivityLinesByThread,
      runStatus: input.runStatus,
      runtimeStatusIndicatorsByThread: {},
      threadRunStatuses: input.threadRunStatuses,
    },
    runDerivedState: {
      activeRunActivityLines: input.activeRunActivityLines,
      running: input.running,
      thinkingDisplayMode: input.thinkingDisplayMode,
    },
    shellUiState: {
      clearError: input.onDismissError,
      error: input.error,
    },
    setState: input.setState,
    state: input.state,
    subagentParentClusterActions: {
      cancelCallableWorkflowTask: input.onCancelCallableWorkflowTask,
      cancelSubagentChild: input.onCancelSubagentChild,
      closeSubagentChild: input.onCloseSubagentChild,
      openCallableWorkflowThread: input.onOpenCallableWorkflowThread,
      pauseCallableWorkflowTask: input.onPauseCallableWorkflowTask,
      resolveSubagentApprovalAction: input.onResolveSubagentApprovalAction,
      resolveSubagentBarrierAction: input.onResolveSubagentBarrierAction,
      resumeCallableWorkflowTask: input.onResumeCallableWorkflowTask,
    },
    subagentShellControls: {
      activeSubagentInspector: input.activeSubagentInspector,
      subagentParentClustersByMessageId: input.subagentParentClustersByMessageId,
    },
    threadMaintenanceActions: {
      duplicateActiveThreadFromTranscript: input.onDuplicateActiveThreadFromTranscript,
      exportActiveChat: input.onExportActiveChat,
      recoverActiveThreadContext: input.onRecoverActiveThreadContext,
      recoverActiveThreadContextAndRetryLatest: input.onRecoverAndRetryLatest,
    },
    voiceThreadControls: {
      activeThreadVoiceStatus: input.activeThreadVoiceStatus,
      activeThreadVoiceStatusDismissKey: input.activeThreadVoiceStatusDismissKey,
      activeThreadVoiceStatusVisible: input.activeThreadVoiceStatusVisible,
      activeVoiceMessageId: input.activeVoiceMessageId,
      autoplayVoiceKey: input.autoplayVoiceKey,
      dismissActiveThreadVoiceStatus: input.onDismissActiveThreadVoiceStatus,
      latestReadyVoiceAutoplay: input.latestReadyVoiceAutoplay,
      setActiveVoiceMessageId: input.onActiveVoiceMessageChange,
      voiceProviderLabels: input.voiceProviderLabels,
    },
    workflowRecordingActions: {
      retryWorkflowRecordingReview: input.onRetryWorkflowRecordingReview,
      stopActiveWorkflowRecording: input.onStopWorkflowRecording,
    },
    workflowRecordingReviewControls: {
      runStatusCardVisible: input.runStatusCardVisible,
      workflowRecorderEmptyChatState: input.workflowRecorderEmptyChatState,
      workflowRecordingReviewRunning: input.workflowRecordingReviewRunning,
    },
    workflowRuntimeState: {
      callableWorkflowTaskCancelBusy: input.callableWorkflowTaskCancelBusy,
      callableWorkflowTaskPauseBusy: input.callableWorkflowTaskPauseBusy,
      callableWorkflowTaskResumeBusy: input.callableWorkflowTaskResumeBusy,
      chatExportBusy: input.chatExportBusy,
      contextRecoveryBusy: input.contextRecoveryBusy,
      goalCompletionCelebrationId: input.goalCompletionCelebrationId,
      subagentApprovalActionBusy: input.subagentApprovalActionBusy,
      subagentBarrierActionBusy: input.subagentBarrierActionBusy,
      subagentChildCancelBusy: input.subagentChildCancelBusy,
      subagentChildCloseBusy: input.subagentChildCloseBusy,
    },
    workspaceNavigationControls: {
      selectThread: input.onSelectThread,
    },
    workspaceShellState: {
      chatBrowserUserActionBusy: input.chatBrowserUserActionBusy,
      welcomeAmbientPluginRegistry: input.welcomeAmbientPluginRegistry,
    },
  } as unknown as AppConversationMessagesPropsForAppInput;
}

function desktopState(input: Record<string, unknown> = {}): DesktopState {
  return {
    activeThreadId: "thread-1",
    activeWorkspace: { path: "/workspace" },
    childMessagesByThreadId: {},
    messageVoiceStates: {},
    provider: { providerLabel: "Provider" },
    providerCatalog: {},
    settings: {
      media: { generatedMediaAutoplay: false },
      modelRuntime: { showPromptCacheStatus: false },
    },
    subagentRunEvents: [],
    subagentMailboxEvents: [],
    threads: [],
    workspace: { path: "/project" },
    ...input,
  } as unknown as DesktopState;
}
