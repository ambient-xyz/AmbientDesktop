import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { ChatMessage, RunStatus } from "../../shared/threadTypes";
import type { WorkspaceContextReference } from "../../shared/workspaceTypes";
import { mergeContextAttachments } from "./AppComposerControls";
import { contextReferencesFromMetadata } from "./AppMessages";
import { workflowRecordingEditContextFromMetadata } from "./AppWorkflowRecording";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function retryPromptAllowed(input: {
  message: Pick<ChatMessage, "content" | "role">;
  running: boolean;
  stateAvailable: boolean;
}): boolean {
  return input.stateAvailable && !input.running && input.message.role === "user" && Boolean(input.message.content.trim());
}

export function retryPromptContext(message: Pick<ChatMessage, "metadata">): WorkspaceContextReference[] {
  return contextReferencesFromMetadata(message.metadata?.context);
}

export function createAppComposerRetryActions({
  resetPromptHistory,
  resetRunActivityLines,
  running,
  setContextAttachments,
  setContextError,
  setError,
  setRunStatus,
  setThreadRunStatuses,
  state,
}: {
  resetPromptHistory: () => void;
  resetRunActivityLines: (initialText?: string, threadId?: string) => void;
  running: boolean;
  setContextAttachments: Dispatch<SetStateAction<WorkspaceContextReference[]>>;
  setContextError: Dispatch<SetStateAction<string | undefined>>;
  setError: (message: string | undefined) => void;
  setRunStatus: Dispatch<SetStateAction<RunStatus>>;
  setThreadRunStatuses: Dispatch<SetStateAction<Record<string, RunStatus>>>;
  state: DesktopState | undefined;
}): {
  retryFailedPrompt: (message: ChatMessage) => Promise<void>;
} {
  async function retryFailedPrompt(message: ChatMessage): Promise<void> {
    if (!retryPromptAllowed({ message, running, stateAvailable: Boolean(state) }) || !state) return;
    const context = retryPromptContext(message);
    const workflowRecordingEditContext = workflowRecordingEditContextFromMetadata(message.metadata?.workflowRecordingEditContext);
    setError(undefined);
    setContextError(undefined);
    setContextAttachments([]);
    resetPromptHistory();
    resetRunActivityLines("Retry sent to Ambient.");
    setRunStatus("starting");
    setThreadRunStatuses((statuses) => ({ ...statuses, [state.activeThreadId]: "starting" }));
    await window.ambientDesktop
      .sendMessage({
        threadId: state.activeThreadId,
        content: message.content,
        permissionMode: state.settings.permissionMode,
        collaborationMode: state.settings.collaborationMode,
        model: state.settings.model,
        thinkingLevel: state.settings.thinkingLevel,
        delivery: "prompt",
        context,
        ...(workflowRecordingEditContext ? { workflowRecordingEditContext } : {}),
        retryOfMessageId: message.id,
      })
      .catch((err) => {
        setError(errorMessage(err));
        setContextAttachments((current) => mergeContextAttachments(context, current));
        setRunStatus("error");
      });
  }

  return {
    retryFailedPrompt,
  };
}
