import { useMemo } from "react";

import type {
  ChatMessage,
  PlannerPlanArtifact,
  ThinkingDisplayMode,
} from "../../shared/types";
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

export function appConversationDisplayModel({
  activeRunActivityLines,
  activeWorkspacePath,
  messages,
  plannerPlanArtifacts,
  running,
  thinkingDisplayMode,
  workspacePath,
}: {
  activeRunActivityLines: RunActivityLine[];
  activeWorkspacePath?: string;
  messages: ChatMessage[] | undefined;
  plannerPlanArtifacts: PlannerPlanArtifact[] | undefined;
  running: boolean;
  thinkingDisplayMode: ThinkingDisplayMode;
  workspacePath?: string;
}): AppConversationDisplayModel {
  const displayMessages = messages ?? [];
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
    visibleChatMessages: visibleMessages(displayMessages, running, thinkingDisplayMode),
    visibleRunActivityLines: visibleRunActivityLinesForThinkingDisplay(activeRunActivityLines, thinkingDisplayMode),
  };
}

export function useAppConversationDisplayModel(input: {
  activeRunActivityLines: RunActivityLine[];
  activeWorkspacePath?: string;
  messages: ChatMessage[] | undefined;
  plannerPlanArtifacts: PlannerPlanArtifact[] | undefined;
  running: boolean;
  thinkingDisplayMode: ThinkingDisplayMode;
  workspacePath?: string;
}): AppConversationDisplayModel {
  return useMemo(
    () => appConversationDisplayModel(input),
    [
      input.activeRunActivityLines,
      input.activeWorkspacePath,
      input.messages,
      input.plannerPlanArtifacts,
      input.running,
      input.thinkingDisplayMode,
      input.workspacePath,
    ],
  );
}
