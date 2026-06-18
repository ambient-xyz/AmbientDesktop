import { useMemo } from "react";

import type { ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { ChatMessage, MessageDelivery } from "../../shared/threadTypes";
import {
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
  thinkingDisplayMode: ThinkingDisplayMode;
  workspacePath?: string;
}): AppConversationDisplayModel {
  const displayMessages = messages ?? [];
  const visibleDisplayMessages = messagesWithPendingSubmittedPrompts({
    activeThreadId,
    messages: displayMessages,
    pendingSubmittedPrompts,
  });
  return {
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
      lines: activeRunActivityLines,
      messages: displayMessages,
      mode: thinkingDisplayMode,
      running,
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
  thinkingDisplayMode: ThinkingDisplayMode;
  workspacePath?: string;
}): AppConversationDisplayModel {
  return useMemo(
    () => appConversationDisplayModel(input),
    [
      input.activeRunActivityLines,
      input.activeThreadId,
      input.activeWorkspacePath,
      input.messages,
      input.pendingSubmittedPrompts,
      input.plannerPlanArtifacts,
      input.running,
      input.thinkingDisplayMode,
      input.workspacePath,
    ],
  );
}
