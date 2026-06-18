import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import type { PermissionMode } from "../../shared/permissionTypes";
import type { ChatMessage, RuntimeActivity, ThinkingLevel } from "../../shared/threadTypes";
import type { WorkflowAgentThreadSummary, WorkflowRecoveryAction, WorkflowRunDetail, WorkflowUserInputResponse } from "../../shared/workflowTypes";
import type { WorkflowGraphEventCard } from "./workflowAgentGraphUiModel";
import type { WorkflowRuntimeInputCard } from "./workflowRuntimeInputUiModel";
import {
  workflowThreadComposerModel,
  workflowThreadComposerRecoveryCard,
  type WorkflowThreadComposerRuntimeAction,
} from "./workflowThreadComposerUiModel";
import {
  workflowDecisionRecoveryAction,
  workflowGraphRecoveryDecisionCard,
} from "./workflowRuntimeDecisionUiModel";

export type WorkflowThreadComposerDrafts = Record<string, string>;

export type WorkflowThreadComposerDraftForSendResult =
  | { kind: "ready"; draft: string }
  | { kind: "skip" };

export function workflowThreadComposerDraftForSend({
  drafts,
  threadId,
  composerBusy,
  sessionBusy,
}: {
  drafts: WorkflowThreadComposerDrafts;
  threadId: string;
  composerBusy?: string;
  sessionBusy?: string;
}): WorkflowThreadComposerDraftForSendResult {
  const draft = drafts[threadId]?.trim();
  if (!draft || composerBusy || sessionBusy) return { kind: "skip" };
  return { kind: "ready", draft };
}

export function workflowThreadComposerDraftsAfterSendStart(
  drafts: WorkflowThreadComposerDrafts,
  threadId: string,
): WorkflowThreadComposerDrafts {
  return { ...drafts, [threadId]: "" };
}

export function workflowThreadComposerDraftsAfterSendFailure(
  drafts: WorkflowThreadComposerDrafts,
  threadId: string,
  draft: string,
): WorkflowThreadComposerDrafts {
  return { ...drafts, [threadId]: drafts[threadId]?.trim() ? drafts[threadId] : draft };
}

export function workflowThreadPlanEditActivityAfterRunStatus(
  activities: Record<string, RuntimeActivity | undefined>,
  threadId: string,
  status: string,
): Record<string, RuntimeActivity | undefined> {
  if (status !== "idle" && status !== "error") return activities;
  return { ...activities, [threadId]: undefined };
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useAutomationsWorkflowThreadController({
  selectedWorkflowAgentThread,
  workflowRevision,
  workflowBusy,
  workflowDiscoveryBusy,
  permissionMode,
  model,
  thinkingLevel,
  refreshAutomationFolders,
  loadWorkflowRevisions,
  loadWorkflowVersions,
  loadWorkflowDashboard,
  onWorkflowErrorChanged,
  onSelectWorkflowAgentThread,
  onWorkflowRevisionChanged,
  onAnswerWorkflowRuntimeInput,
  onResumeWorkflowTotalRuntimePause,
  onRecoverWorkflowRun,
  onDebugRewriteWorkflowRun,
}: {
  selectedWorkflowAgentThread?: WorkflowAgentThreadSummary;
  workflowRevision: unknown;
  workflowBusy?: string;
  workflowDiscoveryBusy?: string;
  permissionMode: PermissionMode;
  model: string;
  thinkingLevel: ThinkingLevel;
  refreshAutomationFolders: () => Promise<unknown>;
  loadWorkflowRevisions: (workflowThreadId?: string) => Promise<unknown>;
  loadWorkflowVersions: (workflowThreadId?: string) => Promise<unknown>;
  loadWorkflowDashboard: () => Promise<unknown>;
  onWorkflowErrorChanged: (message: string | undefined) => void;
  onSelectWorkflowAgentThread: (thread: WorkflowAgentThreadSummary) => void;
  onWorkflowRevisionChanged: () => void;
  onAnswerWorkflowRuntimeInput: (
    detail: WorkflowRunDetail,
    card: WorkflowRuntimeInputCard,
    response: Omit<WorkflowUserInputResponse, "requestId">,
  ) => Promise<boolean>;
  onResumeWorkflowTotalRuntimePause: (
    detail: WorkflowRunDetail,
    action: WorkflowThreadComposerRuntimeAction,
  ) => Promise<boolean>;
  onRecoverWorkflowRun: (card: WorkflowGraphEventCard, action: WorkflowRecoveryAction) => Promise<boolean>;
  onDebugRewriteWorkflowRun: (card: WorkflowGraphEventCard) => Promise<boolean>;
}) {
  const [workflowThreadComposerDrafts, setWorkflowThreadComposerDrafts] = useState<WorkflowThreadComposerDrafts>({});
  const [workflowThreadComposerBusy, setWorkflowThreadComposerBusy] = useState<string | undefined>();
  const [workflowThreadSessionBusy, setWorkflowThreadSessionBusy] = useState<string | undefined>();
  const [workflowThreadChatMessagesByThreadId, setWorkflowThreadChatMessagesByThreadId] = useState<Record<string, ChatMessage[]>>({});
  const [workflowThreadPlanEditActivityByThreadId, setWorkflowThreadPlanEditActivityByThreadId] = useState<Record<string, RuntimeActivity | undefined>>({});

  useEffect(() => {
    return window.ambientDesktop.onEvent((event) => {
      if (event.type !== "e2e-workflow-chat-fixture") return;
      setWorkflowThreadChatMessagesByThreadId((current) => ({ ...current, [event.workflowThreadId]: event.messages }));
    });
  }, []);

  useEffect(() => {
    void loadWorkflowThreadChatMessages(selectedWorkflowAgentThread?.id);
  }, [selectedWorkflowAgentThread?.id, selectedWorkflowAgentThread?.chatThreadId, workflowRevision]);

  useEffect(() => {
    return window.ambientDesktop.onEvent((event) => {
      if (!selectedWorkflowAgentThread?.chatThreadId) return;
      if ((event.type === "message-created" || event.type === "message-updated") && event.message.threadId === selectedWorkflowAgentThread.chatThreadId) {
        void loadWorkflowThreadChatMessages(selectedWorkflowAgentThread.id);
      }
      if (event.type === "run-status" && event.threadId === selectedWorkflowAgentThread.chatThreadId) {
        setWorkflowThreadPlanEditActivityByThreadId((current) =>
          workflowThreadPlanEditActivityAfterRunStatus(current, selectedWorkflowAgentThread.id, event.status),
        );
        void loadWorkflowThreadChatMessages(selectedWorkflowAgentThread.id);
      }
      if (event.type === "runtime-activity" && event.activity.threadId === selectedWorkflowAgentThread.chatThreadId) {
        setWorkflowThreadPlanEditActivityByThreadId((current) => ({ ...current, [selectedWorkflowAgentThread.id]: event.activity }));
      }
    });
  }, [selectedWorkflowAgentThread?.id, selectedWorkflowAgentThread?.chatThreadId]);

  async function loadWorkflowThreadChatMessages(workflowThreadId?: string) {
    if (!workflowThreadId) return;
    try {
      const messages = await window.ambientDesktop.listWorkflowAgentChatMessages({ workflowThreadId });
      setWorkflowThreadChatMessagesByThreadId((current) => ({ ...current, [workflowThreadId]: messages }));
    } catch {
      setWorkflowThreadChatMessagesByThreadId((current) => ({ ...current, [workflowThreadId]: [] }));
    }
  }

  async function prepareWorkflowThreadSession(thread: WorkflowAgentThreadSummary) {
    if (workflowThreadSessionBusy || thread.chatThreadId) return;
    setWorkflowThreadSessionBusy(thread.id);
    onWorkflowErrorChanged(undefined);
    try {
      const ensuredThread = await window.ambientDesktop.ensureWorkflowAgentChatThread({ workflowThreadId: thread.id });
      await Promise.all([loadWorkflowThreadChatMessages(thread.id), refreshAutomationFolders()]);
      onSelectWorkflowAgentThread(ensuredThread);
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      setWorkflowThreadSessionBusy(undefined);
    }
  }

  async function sendWorkflowThreadComposer(thread: WorkflowAgentThreadSummary, detail?: WorkflowRunDetail) {
    const draftResult = workflowThreadComposerDraftForSend({
      drafts: workflowThreadComposerDrafts,
      threadId: thread.id,
      composerBusy: workflowThreadComposerBusy,
      sessionBusy: workflowThreadSessionBusy,
    });
    if (draftResult.kind === "skip") return;
    const { draft } = draftResult;
    const recoveryCard = workflowThreadComposerRecoveryCard(thread, detail);
    const recoveryDecision = recoveryCard ? workflowGraphRecoveryDecisionCard(recoveryCard) : undefined;
    const composer = workflowThreadComposerModel({
      draft,
      detail,
      workflowBusy,
      workflowDiscoveryBusy,
      composerBusy: workflowThreadComposerBusy === thread.id,
      recoveryDecision,
    });
    if (composer.mode === "run_input" && composer.runtimeInputCard && composer.runtimeInputFreeform && detail) {
      setWorkflowThreadComposerBusy(thread.id);
      onWorkflowErrorChanged(undefined);
      setWorkflowThreadComposerDrafts((current) => workflowThreadComposerDraftsAfterSendStart(current, thread.id));
      try {
        const succeeded = await onAnswerWorkflowRuntimeInput(detail, composer.runtimeInputCard, { text: draft });
        if (!succeeded) setWorkflowThreadComposerDrafts((current) => workflowThreadComposerDraftsAfterSendFailure(current, thread.id, draft));
      } catch (error) {
        setWorkflowThreadComposerDrafts((current) => workflowThreadComposerDraftsAfterSendFailure(current, thread.id, draft));
        onWorkflowErrorChanged(messageForError(error));
      } finally {
        setWorkflowThreadComposerBusy(undefined);
      }
      return;
    }
    if (composer.mode === "run_recovery" && composer.runtimeAction && detail) {
      setWorkflowThreadComposerBusy(thread.id);
      onWorkflowErrorChanged(undefined);
      setWorkflowThreadComposerDrafts((current) => workflowThreadComposerDraftsAfterSendStart(current, thread.id));
      try {
        const succeeded = await onResumeWorkflowTotalRuntimePause(detail, composer.runtimeAction);
        if (!succeeded) setWorkflowThreadComposerDrafts((current) => workflowThreadComposerDraftsAfterSendFailure(current, thread.id, draft));
      } catch (error) {
        setWorkflowThreadComposerDrafts((current) => workflowThreadComposerDraftsAfterSendFailure(current, thread.id, draft));
        onWorkflowErrorChanged(messageForError(error));
      } finally {
        setWorkflowThreadComposerBusy(undefined);
      }
      return;
    }
    if (composer.mode === "graph_recovery" && composer.recoveryAction && recoveryCard) {
      setWorkflowThreadComposerBusy(thread.id);
      onWorkflowErrorChanged(undefined);
      setWorkflowThreadComposerDrafts((current) => workflowThreadComposerDraftsAfterSendStart(current, thread.id));
      try {
        const recoveryAction = workflowDecisionRecoveryAction(composer.recoveryAction);
        const succeeded =
          recoveryAction !== undefined
            ? await onRecoverWorkflowRun(recoveryCard, recoveryAction)
            : composer.recoveryAction === "debug_rewrite"
              ? await onDebugRewriteWorkflowRun(recoveryCard)
              : false;
        if (!succeeded) setWorkflowThreadComposerDrafts((current) => workflowThreadComposerDraftsAfterSendFailure(current, thread.id, draft));
      } catch (error) {
        setWorkflowThreadComposerDrafts((current) => workflowThreadComposerDraftsAfterSendFailure(current, thread.id, draft));
        onWorkflowErrorChanged(messageForError(error));
      } finally {
        setWorkflowThreadComposerBusy(undefined);
      }
      return;
    }
    setWorkflowThreadComposerBusy(thread.id);
    onWorkflowErrorChanged(undefined);
    try {
      const ensuredThread = thread.chatThreadId ? thread : await window.ambientDesktop.ensureWorkflowAgentChatThread({ workflowThreadId: thread.id });
      const chatThreadId = ensuredThread.chatThreadId;
      if (!chatThreadId) throw new Error("Workflow Agent chat thread could not be prepared.");
      setWorkflowThreadComposerDrafts((current) => workflowThreadComposerDraftsAfterSendStart(current, thread.id));
      if (!thread.chatThreadId) {
        await refreshAutomationFolders();
        onSelectWorkflowAgentThread(ensuredThread);
      }
      await loadWorkflowThreadChatMessages(thread.id);
      await window.ambientDesktop.sendMessage({
        threadId: chatThreadId,
        content: draft,
        permissionMode,
        collaborationMode: "planner",
        model,
        thinkingLevel,
        delivery: "prompt",
        workflowThreadId: thread.id,
        preserveActiveThread: true,
      });
      await Promise.all([loadWorkflowRevisions(thread.id), loadWorkflowVersions(thread.id), loadWorkflowDashboard(), loadWorkflowThreadChatMessages(thread.id), refreshAutomationFolders()]);
      onWorkflowRevisionChanged();
    } catch (error) {
      setWorkflowThreadComposerDrafts((current) => workflowThreadComposerDraftsAfterSendFailure(current, thread.id, draft));
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      setWorkflowThreadComposerBusy(undefined);
    }
  }

  return {
    workflowThreadComposerDrafts,
    setWorkflowThreadComposerDrafts: setWorkflowThreadComposerDrafts as Dispatch<SetStateAction<WorkflowThreadComposerDrafts>>,
    workflowThreadComposerBusy,
    workflowThreadSessionBusy,
    workflowThreadChatMessagesByThreadId,
    workflowThreadPlanEditActivityByThreadId,
    loadWorkflowThreadChatMessages,
    prepareWorkflowThreadSession,
    sendWorkflowThreadComposer,
  };
}
