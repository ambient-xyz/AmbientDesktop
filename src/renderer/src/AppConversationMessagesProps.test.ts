import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/types";
import {
  createAppConversationMessagesProps,
  type AppConversationMessagesPropsInput,
} from "./AppConversationMessagesProps";

describe("App conversation message props", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("derives conversation state props and routes panel callbacks", async () => {
    const abortRun = vi.fn(async () => undefined);
    vi.stubGlobal("window", { ambientDesktop: { abortRun } });
    const onOpenPanel = vi.fn();
    const props = createAppConversationMessagesProps(baseInput({
      activeProjectHasBoard: true,
      canRetryContextRecovery: true,
      onOpenPanel,
      state: desktopState({
        activeThreadId: "thread-2",
        activeWorkspace: { path: "/workspace-copy" },
        provider: { providerLabel: "Ambient" },
        providerCatalog: { cards: [] },
        settings: { media: { generatedMediaAutoplay: true } },
        workspace: { path: "/project-root" },
      }),
    }));

    expect(props.activeThreadId).toBe("thread-2");
    expect(props.activeWorkspacePath).toBe("/workspace-copy");
    expect(props.projectRootPath).toBe("/project-root");
    expect(props.provider.providerLabel).toBe("Ambient");
    expect(props.providerCatalog).toEqual({ cards: [] });
    expect(props.generatedMediaAutoplay).toBe(true);
    expect(props.hasProjectBoard).toBe(true);
    expect(props.canRetryContextRecovery).toBe(true);

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
    const props = createAppConversationMessagesProps(baseInput({
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
    }));
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

  it("opens subagent parent threads in-place when the child worktree path is not a registered project", () => {
    const onSelectThread = vi.fn();
    const props = createAppConversationMessagesProps(baseInput({
      onSelectThread,
      state: desktopState({
        activeWorkspace: { path: "/workspace/.ambient-codex/worktrees/child" },
        projects: [{ id: "project-1", path: "/workspace" }],
        threads: [{ id: "parent-thread-1", workspacePath: "/workspace/.ambient-codex/worktrees/child" }],
      }),
    }));

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
    retryStats: undefined,
    retryableMessageIds: new Set(),
    runActivityLinesByThread: {},
    running: false,
    runStatus: "idle",
    runStatusCardVisible: false,
    scrollRef: { current: null },
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

function desktopState(input: Record<string, unknown> = {}): DesktopState {
  return {
    activeThreadId: "thread-1",
    activeWorkspace: { path: "/workspace" },
    childMessagesByThreadId: {},
    messageVoiceStates: {},
    provider: { providerLabel: "Provider" },
    providerCatalog: {},
    settings: { media: { generatedMediaAutoplay: false } },
    subagentRunEvents: [],
    subagentMailboxEvents: [],
    threads: [],
    workspace: { path: "/project" },
    ...input,
  } as unknown as DesktopState;
}
