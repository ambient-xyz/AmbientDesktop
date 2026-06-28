import { useMemo } from "react";

import type { ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { ChatMessage, MessageDelivery, RunStatus } from "../../shared/threadTypes";
import {
  assistantVisibleTextIsStreaming,
  retryableFailedPromptIds,
  streamingAssistantMessageId,
  visibleMessages,
} from "./AppMessages";
import { userPromptHistory } from "./AppSidebar";
import { latestUserPromptForRecovery } from "./AppSessionRecovery";
import type { RunActivityLine } from "./AppRunActivity";
import {
  transientThinkingActivityLinesForDisplay,
  visibleRunActivityLinesForThinkingDisplay,
} from "./thinkingDisplayUiModel";
import {
  collectArtifactPathHints,
  type ArtifactPathHints,
} from "./toolMessageUiModel";

export type AppConversationDisplayModel = {
  assistantVisibleTextStreaming: boolean;
  artifactPathHints: ArtifactPathHints;
  latestRecoveryPrompt?: ChatMessage;
  plannerArtifactByMessageId: Map<string, PlannerPlanArtifact>;
  promptHistory: string[];
  retryableMessageIds: Set<string>;
  streamingAssistantId?: string;
  transientThinkingActivityLines: RunActivityLine[];
  visibleChatMessages: ChatMessage[];
  visibleRunActivityLines: RunActivityLine[];
};

export type PendingSubmittedPrompt = {
  id: string;
  threadId: string;
  content: string;
  delivery: MessageDelivery;
  createdAt: string;
  afterMessageId?: string;
};

const EMPTY_CHAT_MESSAGES: ChatMessage[] = [];
const EMPTY_PENDING_SUBMITTED_PROMPTS: PendingSubmittedPrompt[] = [];

export function appConversationArtifactWorkspacePath({
  activeWorkspacePath,
  workspacePath,
}: {
  activeWorkspacePath?: string;
  workspacePath?: string;
}): string {
  return activeWorkspacePath ?? workspacePath ?? "";
}

export function appConversationPlannerArtifactByMessageId(
  artifacts: PlannerPlanArtifact[] | undefined,
): Map<string, PlannerPlanArtifact> {
  return new Map((artifacts ?? []).map((artifact) => [artifact.sourceMessageId, artifact]));
}

export function pendingSubmittedPromptHasPersistedMatch(
  prompt: PendingSubmittedPrompt,
  messages: ChatMessage[],
): boolean {
  const afterIndex = prompt.afterMessageId ? messages.findIndex((message) => message.id === prompt.afterMessageId) : -1;
  const candidateMessages = afterIndex >= 0 ? messages.slice(afterIndex + 1) : messages;
  return candidateMessages.some((message) =>
    message.threadId === prompt.threadId &&
    message.role === "user" &&
    message.content === prompt.content
  );
}

export function pendingSubmittedPromptMessage(prompt: PendingSubmittedPrompt): ChatMessage {
  return {
    id: prompt.id,
    threadId: prompt.threadId,
    role: "user",
    content: prompt.content,
    createdAt: prompt.createdAt,
    metadata: {
      pendingSubmittedPrompt: true,
      status: "sending",
      delivery: prompt.delivery,
    },
  };
}

export function messagesWithPendingSubmittedPrompts({
  activeThreadId,
  messages,
  pendingSubmittedPrompts,
}: {
  activeThreadId?: string;
  messages: ChatMessage[];
  pendingSubmittedPrompts: PendingSubmittedPrompt[];
}): ChatMessage[] {
  if (!activeThreadId || pendingSubmittedPrompts.length === 0) return messages;
  const visiblePending = pendingSubmittedPrompts
    .filter((prompt) => prompt.threadId === activeThreadId)
    .filter((prompt) => !pendingSubmittedPromptHasPersistedMatch(prompt, messages))
    .map(pendingSubmittedPromptMessage);
  return visiblePending.length ? [...messages, ...visiblePending] : messages;
}

export function appConversationDisplayModel({
  activeThreadId,
  activeRunActivityLines,
  activeWorkspacePath,
  messages,
  pendingSubmittedPrompts = [],
  plannerPlanArtifacts,
  running,
  runStatus,
  thinkingDisplayMode,
  workspacePath,
}: {
  activeThreadId?: string;
  activeRunActivityLines: RunActivityLine[];
  activeWorkspacePath?: string;
  messages: ChatMessage[] | undefined;
  pendingSubmittedPrompts?: PendingSubmittedPrompt[];
  plannerPlanArtifacts: PlannerPlanArtifact[] | undefined;
  running: boolean;
  runStatus: RunStatus;
  thinkingDisplayMode: ThinkingDisplayMode;
  workspacePath?: string;
}): AppConversationDisplayModel {
  const displayMessages = messages ?? [];
  const visibleDisplayMessages = messagesWithPendingSubmittedPrompts({
    activeThreadId,
    messages: displayMessages,
    pendingSubmittedPrompts,
  });
  const assistantVisibleTextStreaming = assistantVisibleTextIsStreaming(displayMessages, running);
  return {
    assistantVisibleTextStreaming,
    artifactPathHints: collectArtifactPathHints(
      displayMessages,
      appConversationArtifactWorkspacePath({ activeWorkspacePath, workspacePath }),
    ),
    latestRecoveryPrompt: latestUserPromptForRecovery(displayMessages),
    plannerArtifactByMessageId: appConversationPlannerArtifactByMessageId(plannerPlanArtifacts),
    promptHistory: userPromptHistory(displayMessages),
    retryableMessageIds: retryableFailedPromptIds(displayMessages),
    streamingAssistantId: streamingAssistantMessageId(displayMessages, running),
    transientThinkingActivityLines: transientThinkingActivityLinesForDisplay({
      assistantVisibleTextStreaming,
      lines: activeRunActivityLines,
      messages: displayMessages,
      mode: thinkingDisplayMode,
      running,
      runStatus,
    }),
    visibleChatMessages: visibleMessages(visibleDisplayMessages, running, thinkingDisplayMode),
    visibleRunActivityLines: visibleRunActivityLinesForThinkingDisplay(activeRunActivityLines, thinkingDisplayMode),
  };
}

export function useAppConversationDisplayModel(input: {
  activeThreadId?: string;
  activeRunActivityLines: RunActivityLine[];
  activeWorkspacePath?: string;
  messages: ChatMessage[] | undefined;
  pendingSubmittedPrompts?: PendingSubmittedPrompt[];
  plannerPlanArtifacts: PlannerPlanArtifact[] | undefined;
  running: boolean;
  runStatus: RunStatus;
  thinkingDisplayMode: ThinkingDisplayMode;
  workspacePath?: string;
}): AppConversationDisplayModel {
  const displayMessages = input.messages ?? EMPTY_CHAT_MESSAGES;
  const pendingSubmittedPrompts = input.pendingSubmittedPrompts ?? EMPTY_PENDING_SUBMITTED_PROMPTS;
  const artifactWorkspacePath = useMemo(
    () => appConversationArtifactWorkspacePath({
      activeWorkspacePath: input.activeWorkspacePath,
      workspacePath: input.workspacePath,
    }),
    [input.activeWorkspacePath, input.workspacePath],
  );
  const visibleDisplayMessages = useMemo(
    () => messagesWithPendingSubmittedPrompts({
      activeThreadId: input.activeThreadId,
      messages: displayMessages,
      pendingSubmittedPrompts,
    }),
    [input.activeThreadId, displayMessages, pendingSubmittedPrompts],
  );
  const artifactPathHints = useMemo(
    () => collectArtifactPathHints(displayMessages, artifactWorkspacePath),
    [displayMessages, artifactWorkspacePath],
  );
  const latestRecoveryPrompt = useMemo(
    () => latestUserPromptForRecovery(displayMessages),
    [displayMessages],
  );
  const plannerArtifactByMessageId = useMemo(
    () => appConversationPlannerArtifactByMessageId(input.plannerPlanArtifacts),
    [input.plannerPlanArtifacts],
  );
  const promptHistory = useMemo(
    () => userPromptHistory(displayMessages),
    [displayMessages],
  );
  const retryableMessageIds = useMemo(
    () => retryableFailedPromptIds(displayMessages),
    [displayMessages],
  );
  const streamingAssistantId = useMemo(
    () => streamingAssistantMessageId(displayMessages, input.running),
    [displayMessages, input.running],
  );
  const assistantVisibleTextStreaming = useMemo(
    () => assistantVisibleTextIsStreaming(displayMessages, input.running),
    [displayMessages, input.running],
  );
  const transientThinkingActivityLines = useMemo(
    () => transientThinkingActivityLinesForDisplay({
      assistantVisibleTextStreaming,
      lines: input.activeRunActivityLines,
      messages: displayMessages,
      mode: input.thinkingDisplayMode,
      running: input.running,
      runStatus: input.runStatus,
    }),
    [assistantVisibleTextStreaming, input.activeRunActivityLines, displayMessages, input.thinkingDisplayMode, input.running, input.runStatus],
  );
  const visibleChatMessages = useMemo(
    () => visibleMessages(visibleDisplayMessages, input.running, input.thinkingDisplayMode),
    [visibleDisplayMessages, input.running, input.thinkingDisplayMode],
  );
  const visibleRunActivityLines = useMemo(
    () => visibleRunActivityLinesForThinkingDisplay(input.activeRunActivityLines, input.thinkingDisplayMode),
    [input.activeRunActivityLines, input.thinkingDisplayMode],
  );
  return useMemo(
    () => ({
      assistantVisibleTextStreaming,
      artifactPathHints,
      latestRecoveryPrompt,
      plannerArtifactByMessageId,
      promptHistory,
      retryableMessageIds,
      streamingAssistantId,
      transientThinkingActivityLines,
      visibleChatMessages,
      visibleRunActivityLines,
    }),
    [
      assistantVisibleTextStreaming,
      artifactPathHints,
      latestRecoveryPrompt,
      plannerArtifactByMessageId,
      promptHistory,
      retryableMessageIds,
      streamingAssistantId,
      transientThinkingActivityLines,
      visibleChatMessages,
      visibleRunActivityLines,
    ],
  );
}
