import { createRef } from "react";
import { vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { ChatMessage, ThreadGoal } from "../../shared/threadTypes";
import type { AppConversationMessagesProps } from "./AppConversationMessagesTypes";
import type { SubagentThreadInspectorModel } from "./subagentThreadInspectorUiModel";

export function baseProps(overrides: Partial<AppConversationMessagesProps> = {}): AppConversationMessagesProps {
  const noop = vi.fn();
  return {
    goalCompletionCelebrationId: undefined,
    chatFindOpen: false,
    chatFindInputRef: createRef<HTMLInputElement>(),
    chatFindQuery: "",
    chatFindCount: 0,
    chatFindIndex: 0,
    onChatFindQueryChange: noop,
    onChatFindPrevious: noop,
    onChatFindNext: noop,
    onChatFindClose: noop,
    activeThreadVoiceStatusVisible: false,
    activeThreadVoiceStatus: undefined,
    activeThreadVoiceStatusDismissKey: undefined,
    onDismissActiveThreadVoiceStatus: noop,
    activeSubagentInspector: undefined,
    workflowRecording: undefined,
    workflowRecordingReviewRunning: false,
    running: false,
    abortArmed: false,
    activeThreadId: "thread-1",
    activeThreadGoal: undefined,
    activeRunActivityLines: [],
    runStatus: "idle",
    retryStats: undefined,
    chatExportBusy: false,
    onRetryWorkflowRecordingReview: noop,
    onAbortRun: noop,
    onStopWorkflowRecording: noop,
    onExportActiveChat: noop,
    scrollRef: createRef<HTMLDivElement>(),
    onMessagesScroll: noop,
    visibleChatMessages: [],
    messageWindow: undefined,
    onLoadOlderMessages: noop,
    activeChatBrowserUserAction: undefined,
    workflowRecorderEmptyChatState: undefined,
    provider: provider(),
    providerCatalog: {
      cards: [],
      catalogVersion: "test-catalog",
      generatedAt: "2026-06-13T00:00:00.000Z",
    } as DesktopState["providerCatalog"],
    welcomeAmbientPluginRegistry: undefined,
    onOpenAmbientKeys: noop,
    onOpenApiKeyDialog: noop,
    onStartWelcomeFirstRunCapabilityOnboarding: noop,
    onStartWelcomeProviderCatalogCardOnboarding: noop,
    onStartWelcomeRemoteSurfaceActivation: noop,
    onOpenSettingsPanel: noop,
    onOpenPluginsPanel: noop,
    messageVoiceStates: {},
    voiceProviderLabels: {},
    streamingAssistantId: undefined,
    retryableMessageIds: new Set(),
    onRetryMessage: noop,
    onSendTelegramSessionSetupPrompt: noop,
    onSendRemoteSurfaceActivationPrompt: noop,
    activeWorkspacePath: "/workspace",
    onPreviewPath: noop,
    onPreviewLocalPath: noop,
    onOpenMediaModal: noop,
    generatedMediaAutoplay: false,
    latestReadyVoiceAutoplay: undefined,
    autoplayVoiceKey: undefined,
    activeVoiceMessageId: undefined,
    onActiveVoiceMessageChange: noop,
    onRegenerateVoice: noop,
    onRevealVoiceArtifact: noop,
    onClearVoiceArtifact: noop,
    onOpenUrl: noop,
    onOpenBrowserUrl: noop,
    onOpenBrowserPanel: noop,
    artifactPathHints: new Map(),
    plannerArtifactByMessageId: new Map(),
    onImplementPlannerPlan: noop,
    onRefinePlannerPlan: noop,
    onRetryPlannerFinalization: noop,
    onAddPlannerPlanToBoard: noop,
    onGeneratePlannerDurableArtifact: noop,
    hasProjectBoard: false,
    onAnswerPlannerDecisionQuestion: noop,
    contextRecoveryBusy: false,
    canRetryContextRecovery: false,
    onRecoverActiveThreadContext: noop,
    onRecoverAndRetryLatest: noop,
    onDuplicateActiveThreadFromTranscript: noop,
    childMessagesByThreadId: {},
    threads: [] as DesktopState["threads"],
    subagentRunEvents: [] as DesktopState["subagentRunEvents"],
    subagentMailboxEvents: [] as DesktopState["subagentMailboxEvents"],
    threadRunStatuses: {},
    thinkingDisplayMode: "transient",
    runActivityLinesByThread: {},
    subagentParentClustersByMessageId: new Map(),
    onOpenSubagentThread: noop,
    onOpenSubagentParentThread: noop,
    onCancelSubagentChild: noop,
    onCloseSubagentChild: noop,
    onOpenCallableWorkflowThread: noop,
    onPauseCallableWorkflowTask: noop,
    onResumeCallableWorkflowTask: noop,
    onCancelCallableWorkflowTask: noop,
    onResolveSubagentBarrierAction: noop,
    onResolveSubagentApprovalAction: noop,
    subagentChildCancelBusy: undefined,
    subagentChildCloseBusy: undefined,
    callableWorkflowTaskPauseBusy: undefined,
    callableWorkflowTaskResumeBusy: undefined,
    callableWorkflowTaskCancelBusy: undefined,
    subagentBarrierActionBusy: undefined,
    subagentApprovalActionBusy: undefined,
    chatBrowserUserActionBusy: undefined,
    onResumeBrowserUserAction: noop,
    onCancelBrowserUserAction: noop,
    onOpenBrowserForUserAction: noop,
    transientThinkingActivityLines: [],
    visibleRunActivityLines: [],
    runStatusCardVisible: false,
    messageTailVisible: true,
    showScrollToBottom: false,
    onJumpToLatestMessage: noop,
    errorNeedsSessionRecovery: false,
    error: undefined,
    onDismissError: noop,
    activeWorkspaceIsPreparedLocalTask: false,
    projectRootPath: "/workspace",
    runtimeStatusIndicators: [],
    activeActivity: undefined,
    ...overrides,
  };
}

export function parentAssistantMessage(metadata?: ChatMessage["metadata"]): ChatMessage {
  return {
    id: "message-1",
    threadId: "parent-thread",
    role: "assistant",
    content: "Ambient is coordinating the parent task while required child work stays inspectable.",
    createdAt: "2026-06-13T00:00:00.000Z",
    metadata,
  };
}

export function childAssistantMessage(metadata?: ChatMessage["metadata"]): ChatMessage {
  return {
    id: "child-inline-message-1",
    threadId: "child-thread-1",
    role: "assistant",
    content: "Child transcript rendered inline for Reviewer.",
    createdAt: "2026-06-13T00:00:02.000Z",
    metadata,
  };
}

export function childToolMessage(): ChatMessage {
  return {
    id: "child-inline-tool-1",
    threadId: "child-thread-1",
    role: "tool",
    content: [
      "Workspace Read done",
      "",
      "Input",
      '{"path":"src/example.ts"}',
      "",
      "Result",
      "Child tool result rendered with parent tool-card chrome.",
    ].join("\n"),
    createdAt: "2026-06-13T00:00:02.500Z",
    metadata: { toolName: "Workspace Read", status: "done" },
  };
}

export function activeGoal(input: Partial<ThreadGoal> = {}): ThreadGoal {
  return {
    threadId: "thread-1",
    goalId: "goal-1",
    objective: "Test durable goal",
    status: "active",
    tokensUsed: 0,
    timeUsedSeconds: 0,
    continuationTurns: 1,
    noProgressTurns: 0,
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
    ...input,
  };
}

export function activeSubagentInspector(): SubagentThreadInspectorModel {
  return {
    runId: "child-run-1",
    parentThreadId: "parent-thread",
    parentWorkspacePath: "/workspace",
    title: "Reviewer sub-agent",
    status: "Running",
    statusTone: "active",
    parentBarrier: {
      label: "Parent waiting on this child",
      detail: "Blocking: child running · Required all",
      tone: "active",
    },
    badges: ["Required", "Cloud", "Tool-capable", "Open"],
    rows: [{ label: "Parent thread", value: "parent-thread" }],
    recentEvents: [{ key: "child-run-1:1", label: "Session Started", value: "Visible child thread is running." }],
    toolScopeRows: [],
    modelScopeRows: [],
    waitBarrierRows: [],
    repairRows: [],
  };
}

export function provider(overrides: Partial<DesktopState["provider"]> = {}): DesktopState["provider"] {
  return {
    providerId: "ambient",
    providerLabel: "Ambient",
    hasApiKey: false,
    checking: false,
    error: undefined,
    ...overrides,
  } as DesktopState["provider"];
}
