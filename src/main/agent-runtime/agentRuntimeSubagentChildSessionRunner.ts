import type { SubagentRuntimeEventSource } from "../../shared/subagentProtocol";
import type { SubagentMailboxEventSummary, SubagentRunSummary } from "../../shared/subagentTypes";
import type { SubagentChildRuntimeFollowupInput, SubagentChildRuntimeStartInput } from "./agentRuntimePiFacade";
import type { RuntimeSendMessageInput } from "./agentRuntimeSendPreparationController";
import type { AgentRuntimeSubagentChildLifecycleCoordinatorOptions } from "./agentRuntimeSubagentChildLifecycleTypes";
import { runSubagentChildPostToolFinalizationFollowups } from "./agentRuntimeSubagentChildPostToolFinalization";
import {
  buildSubagentChildPrompt,
  buildSubagentFollowupPrompt,
  buildSubagentPromptSnapshot,
  subagentParentContextForMessages,
} from "./agentRuntimeSubagentsFacade";
import { childSessionErrorShouldPreserveTerminalStatus, previewForSubagentRuntime } from "./subagents/agentRuntimeSubagentRuntimeHelpers";

export async function runSubagentChildSession(
  options: AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  input: SubagentChildRuntimeStartInput,
): Promise<void> {
  const running = options.store.markSubagentRunStatus(input.run.id, "running");
  input.emitEvent({
    type: "started",
    source: "child_runtime",
    status: "running",
    message: "Child Pi session is running in the visible child thread.",
  });
  const childThread = options.store.getThread(running.childThreadId);
  const parentContext = subagentParentContextForMessages(options.store.listMessages(input.parentThread.id), input.forkMode);
  const promptInput = {
    run: running,
    role: input.role,
    task: input.task,
    forkMode: input.forkMode,
    promptMode: input.promptMode,
    toolScope: input.toolScope,
    inheritedContext: parentContext.inherited,
    strippedRefs: parentContext.stripped,
    parentThreadTitle: input.parentThread.title,
  };
  const prompt = buildSubagentChildPrompt(promptInput);
  options.store.recordSubagentPromptSnapshot(running.id, {
    prompt,
    snapshot: buildSubagentPromptSnapshot(promptInput),
  });
  options.store.appendSubagentRunEvent(running.id, {
    type: "subagent.child_session_started",
    preview: {
      childThreadId: running.childThreadId,
      promptChars: prompt.length,
      inheritedContextCount: parentContext.inherited.length,
      strippedRefCount: parentContext.stripped.length,
      toolScopeSnapshotSequence: input.toolScopeSnapshot.sequence,
    },
  });
  input.emitEvent({
    type: "status",
    source: "child_runtime",
    status: "running",
    message: "Child prompt prepared and stored.",
    details: {
      promptChars: prompt.length,
      inheritedContextCount: parentContext.inherited.length,
      strippedRefCount: parentContext.stripped.length,
      toolScopeSnapshotSequence: input.toolScopeSnapshot.sequence,
    },
  });

  try {
    const childMessageCountBeforeSend = options.store.listMessages(running.childThreadId).length;
    await options.send(
      {
        threadId: running.childThreadId,
        content: prompt,
        visibleUserContent: `Sub-agent task: ${previewForSubagentRuntime(input.task, 240)}`,
        modelContentOverride: prompt,
        permissionMode: childThread.permissionMode,
        collaborationMode: "agent",
        model: running.modelRuntimeSnapshot.profile.modelId,
        thinkingLevel: childThread.thinkingLevel,
        delivery: "prompt",
        preserveActiveThread: true,
        internal: true,
      } as RuntimeSendMessageInput,
      { awaitInternalRetryCompletion: true },
    );

    const completion = options.completeTurnAfterSend({
      run: running,
      role: input.role,
      childMessageCountBeforeSend,
      emitEvent: input.emitEvent,
    });
    await runSubagentChildPostToolFinalizationFollowups({
      options,
      run: running,
      role: input.role,
      childThread,
      completion,
      childMessageCountBeforeSend,
      emitEvent: input.emitEvent,
      visibleUserContentPrefix: "Sub-agent runtime follow-up",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const latest = options.store.getSubagentRun(running.id);
    if (childSessionErrorShouldPreserveTerminalStatus(latest.status)) return;
    const failed = options.store.markSubagentRunStatus(running.id, "failed", {
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: running.id,
        status: "failed",
        partial: false,
        summary: message,
        childThreadId: running.childThreadId,
      },
    });
    input.emitEvent({
      type: "error",
      source: "child_runtime",
      status: "failed",
      message,
    });
    options.store.appendSubagentMailboxEvent(failed.id, {
      direction: "child_to_parent",
      type: "subagent.failed",
      payload: {
        status: "failed",
        error: message,
        childThreadId: failed.childThreadId,
      },
    });
    options.store.appendSubagentRunEvent(failed.id, {
      type: "subagent.child_session_failed",
      preview: {
        error: message,
      },
    });
    options.recordGroupedCompletionIfNeeded(failed, message);
    throw error;
  }
}

export type RunSubagentChildFollowupSessionInput = SubagentChildRuntimeFollowupInput & {
  run: SubagentRunSummary;
  mailboxEvent: SubagentMailboxEventSummary;
  sessionKind?: "followup" | "retry";
};

export async function runSubagentChildFollowupSession(
  options: AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  input: RunSubagentChildFollowupSessionInput,
): Promise<void> {
  const role = input.run.roleProfileSnapshot;
  const childThread = options.store.getThread(input.run.childThreadId);
  const sessionKind = input.sessionKind ?? "followup";
  const runtimeEventSource: SubagentRuntimeEventSource = sessionKind === "retry" ? "retry_child" : "followup_agent";
  const sessionLabel = sessionKind === "retry" ? "retry" : "follow-up";
  const followupPrompt = buildSubagentFollowupPrompt({
    message: input.message,
    role,
    run: input.run,
  });
  try {
    const childMessageCountBeforeSend = options.store.listMessages(input.run.childThreadId).length;
    options.store.appendSubagentRunEvent(input.run.id, {
      type: sessionKind === "retry" ? "subagent.retry_child_session_started" : "subagent.followup_child_session_started",
      preview: {
        mailboxEventId: input.mailboxEvent.id,
        promptChars: followupPrompt.length,
        messagePreview: previewForSubagentRuntime(input.message, 500),
      },
    });
    await options.send(
      {
        threadId: input.run.childThreadId,
        content: followupPrompt,
        visibleUserContent: `Child ${sessionLabel}: ${previewForSubagentRuntime(input.message, 240)}`,
        modelContentOverride: followupPrompt,
        permissionMode: childThread.permissionMode,
        collaborationMode: "agent",
        model: input.run.modelRuntimeSnapshot.profile.modelId,
        thinkingLevel: childThread.thinkingLevel,
        delivery: "follow-up",
        preserveActiveThread: true,
        internal: true,
      } as RuntimeSendMessageInput,
      { awaitInternalRetryCompletion: true },
    );
    const consumedMailbox = input.markMailboxConsumed();
    options.store.appendSubagentRunEvent(input.run.id, {
      type: sessionKind === "retry" ? "subagent.retry_consumed" : "subagent.followup_consumed",
      preview: {
        mailboxEventId: consumedMailbox.id,
        deliveryState: consumedMailbox.deliveryState,
        deliveredAt: consumedMailbox.deliveredAt,
      },
    });
    const completion = options.completeTurnAfterSend({
      run: input.run,
      role,
      childMessageCountBeforeSend,
      emitEvent: input.emitEvent,
    });
    await runSubagentChildPostToolFinalizationFollowups({
      options,
      run: input.run,
      role,
      childThread,
      completion,
      childMessageCountBeforeSend,
      emitEvent: input.emitEvent,
      visibleUserContentPrefix: "Child runtime follow-up",
      sourceMailboxEventId: input.mailboxEvent.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const latest = options.store.getSubagentRun(input.run.id);
    if (childSessionErrorShouldPreserveTerminalStatus(latest.status)) return;
    const failedMailbox = options.store.updateSubagentMailboxEventDeliveryState(input.mailboxEvent.id, "failed");
    const failed = options.store.markSubagentRunStatus(input.run.id, "failed", {
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: input.run.id,
        status: "failed",
        partial: false,
        summary: message,
        childThreadId: input.run.childThreadId,
      },
    });
    input.emitEvent({
      type: "error",
      source: runtimeEventSource,
      status: "failed",
      message,
    });
    options.store.appendSubagentMailboxEvent(failed.id, {
      direction: "child_to_parent",
      type: "subagent.failed",
      payload: {
        status: "failed",
        error: message,
        childThreadId: failed.childThreadId,
        sourceMailboxEventId: failedMailbox.id,
      },
    });
    options.store.appendSubagentRunEvent(failed.id, {
      type: "subagent.followup_child_session_failed",
      preview: {
        mailboxEventId: failedMailbox.id,
        deliveryState: failedMailbox.deliveryState,
        error: message,
      },
    });
    options.recordGroupedCompletionIfNeeded(failed, message);
    throw error;
  }
}
