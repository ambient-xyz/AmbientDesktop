import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { SubagentRuntimeEventEmitter } from "./agentRuntimePiFacade";
import type { RuntimeSendMessageInput } from "./agentRuntimeSendPreparationController";
import type { AgentRuntimeSubagentChildLifecycleCoordinatorOptions } from "./agentRuntimeSubagentChildLifecycleTypes";
import { buildSubagentFollowupPrompt } from "./agentRuntimeSubagentsFacade";
import type { SubagentChildTurnCompletion } from "./agentRuntimeSubagentChildTurnCoordinator";
import { previewForSubagentRuntime } from "./subagents/agentRuntimeSubagentRuntimeHelpers";

const MAX_SUBAGENT_POST_TOOL_FINALIZATION_FOLLOWUPS = 3;

type SubagentChildPostToolFinalizationOptions = Pick<
  AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  "completeTurnAfterSend" | "recordFollowupExhausted" | "send" | "store"
>;

export interface RunSubagentChildPostToolFinalizationInput {
  options: SubagentChildPostToolFinalizationOptions;
  run: SubagentRunSummary;
  role: SubagentRunSummary["roleProfileSnapshot"];
  childThread: Pick<ThreadSummary, "permissionMode" | "thinkingLevel">;
  completion: SubagentChildTurnCompletion;
  childMessageCountBeforeSend: number;
  emitEvent: SubagentRuntimeEventEmitter;
  visibleUserContentPrefix: string;
  sourceMailboxEventId?: string;
}

export async function runSubagentChildPostToolFinalizationFollowups({
  childMessageCountBeforeSend,
  childThread,
  completion,
  emitEvent,
  options,
  role,
  run,
  sourceMailboxEventId,
  visibleUserContentPrefix,
}: RunSubagentChildPostToolFinalizationInput): Promise<void> {
  let latestCompletion = completion;
  let latestChildMessageCountBeforeSend = childMessageCountBeforeSend;
  for (
    let attempt = 1;
    latestCompletion.status === "needs_followup" && attempt <= MAX_SUBAGENT_POST_TOOL_FINALIZATION_FOLLOWUPS;
    attempt += 1
  ) {
    const latestRun = options.store.getSubagentRun(run.id);
    if (latestRun.status !== "running") return;
    const followupPrompt = buildSubagentFollowupPrompt({
      message: latestCompletion.message,
      role,
      run: latestRun,
    });
    latestChildMessageCountBeforeSend = options.store.listMessages(latestRun.childThreadId).length;
    options.store.appendSubagentRunEvent(latestRun.id, {
      type: "subagent.internal_post_tool_followup_started",
      preview: {
        attempt,
        maxAttempts: MAX_SUBAGENT_POST_TOOL_FINALIZATION_FOLLOWUPS,
        reason: latestCompletion.reason,
        ...(sourceMailboxEventId ? { sourceMailboxEventId } : {}),
        promptChars: followupPrompt.length,
      },
    });
    await options.send({
      threadId: latestRun.childThreadId,
      content: followupPrompt,
      visibleUserContent: `${visibleUserContentPrefix}: ${previewForSubagentRuntime(latestCompletion.reason, 240)}`,
      modelContentOverride: followupPrompt,
      permissionMode: childThread.permissionMode,
      collaborationMode: "agent",
      model: latestRun.modelRuntimeSnapshot.profile.modelId,
      thinkingLevel: childThread.thinkingLevel,
      delivery: "follow-up",
      preserveActiveThread: true,
      internal: true,
    } as RuntimeSendMessageInput, { awaitInternalRetryCompletion: true });
    latestCompletion = options.completeTurnAfterSend({
      run: latestRun,
      role,
      childMessageCountBeforeSend: latestChildMessageCountBeforeSend,
      emitEvent,
    });
  }
  if (latestCompletion.status === "needs_followup") {
    options.recordFollowupExhausted({
      run: options.store.getSubagentRun(run.id),
      completion: latestCompletion,
    });
    throw new Error(`${latestCompletion.reason} Ambient exhausted automatic child post-tool finalization follow-ups.`);
  }
}
