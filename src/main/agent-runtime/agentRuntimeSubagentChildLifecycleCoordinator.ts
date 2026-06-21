import type { SubagentRuntimeEventSource } from "../../shared/subagentProtocol";
import type {
  SubagentMailboxEventSummary,
  SubagentRunSummary,
} from "../../shared/subagentTypes";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type {
  SubagentChildRuntimeApprovalResponseInput,
  SubagentChildRuntimeApprovalResponseResult,
  SubagentChildRuntimeCancelInput,
  SubagentChildRuntimeCancelResult,
  SubagentChildRuntimeFollowupInput,
  SubagentChildRuntimeFollowupResult,
  SubagentChildRuntimeRetryInput,
  SubagentChildRuntimeRetryResult,
  SubagentChildRuntimeStartInput,
  SubagentChildRuntimeStartResult,
  SubagentChildRuntimeWaitInput,
  SubagentChildRuntimeWaitResult,
} from "./agentRuntimePiFacade";
import type { RuntimeSendMessageInput } from "./agentRuntimeSendPreparationController";
import type {
  AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  SubagentChildExecutionRecord,
} from "./agentRuntimeSubagentChildLifecycleTypes";
import {
  buildSubagentChildPrompt,
  buildSubagentFollowupPrompt,
  buildSubagentPromptSnapshot,
  subagentParentContextForMessages,
} from "./agentRuntimeSubagentsFacade";
import {
  childSessionErrorShouldPreserveTerminalStatus,
  isSubagentTerminalStatus,
  previewForSubagentRuntime,
} from "./subagents/agentRuntimeSubagentRuntimeHelpers";
import {
  refuseSubagentChildLifecycleApprovalResponseBecauseFeatureDisabled,
  refuseSubagentChildLifecycleFollowupBecauseFeatureDisabled,
  refuseSubagentChildLifecycleRetryBecauseFeatureDisabled,
  refuseSubagentChildLifecycleStartBecauseFeatureDisabled,
} from "./agentRuntimeSubagentChildLifecycleRefusals";
import {
  cancelSubagentChildLifecycleRun,
  resolveSubagentChildLifecycleApprovalResponse,
  waitForSubagentChildLifecycleRun,
} from "./agentRuntimeSubagentChildLifecycleWait";

const MAX_SUBAGENT_POST_TOOL_FINALIZATION_FOLLOWUPS = 3;

export type {
  AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  SubagentChildExecutionRecord,
} from "./agentRuntimeSubagentChildLifecycleTypes";

export class AgentRuntimeSubagentChildLifecycleCoordinator {
  constructor(private readonly options: AgentRuntimeSubagentChildLifecycleCoordinatorOptions) {}

  refuseStartBecauseFeatureDisabled(
    input: SubagentChildRuntimeStartInput,
    featureFlagSnapshot: AmbientFeatureFlagSnapshot,
  ): SubagentChildRuntimeStartResult {
    return refuseSubagentChildLifecycleStartBecauseFeatureDisabled(this.options, input, featureFlagSnapshot);
  }

  refuseFollowupBecauseFeatureDisabled(
    input: SubagentChildRuntimeFollowupInput,
    featureFlagSnapshot: AmbientFeatureFlagSnapshot,
  ): SubagentChildRuntimeFollowupResult {
    return refuseSubagentChildLifecycleFollowupBecauseFeatureDisabled(this.options, input, featureFlagSnapshot);
  }

  refuseRetryBecauseFeatureDisabled(
    input: SubagentChildRuntimeRetryInput,
    featureFlagSnapshot: AmbientFeatureFlagSnapshot,
  ): SubagentChildRuntimeRetryResult {
    return refuseSubagentChildLifecycleRetryBecauseFeatureDisabled(this.options, input, featureFlagSnapshot);
  }

  refuseApprovalResponseBecauseFeatureDisabled(
    input: SubagentChildRuntimeApprovalResponseInput,
    featureFlagSnapshot: AmbientFeatureFlagSnapshot,
  ): SubagentChildRuntimeApprovalResponseResult {
    return refuseSubagentChildLifecycleApprovalResponseBecauseFeatureDisabled(this.options, input, featureFlagSnapshot);
  }

  resolveApprovalResponse(
    input: SubagentChildRuntimeApprovalResponseInput,
  ): SubagentChildRuntimeApprovalResponseResult {
    return resolveSubagentChildLifecycleApprovalResponse(this.options, input);
  }

  followupChildRun(input: SubagentChildRuntimeFollowupInput): SubagentChildRuntimeFollowupResult {
    const current = this.options.store.getSubagentRun(input.run.id);
    if (current.closedAt || isSubagentTerminalStatus(current.status)) {
      return {
        run: current,
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: `Child runtime did not accept the follow-up because the sub-agent is ${current.closedAt ? "closed" : current.status}.`,
      };
    }
    if (this.options.executions.has(current.id)) {
      return {
        run: current,
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: "Child runtime is active; the follow-up remains queued for the next idle turn.",
      };
    }
    const deliveredMailbox = input.markMailboxDelivered();
    const running = this.options.store.markSubagentRunStatus(current.id, "running");
    input.emitEvent({
      type: "status",
      source: "followup_agent",
      status: "running",
      message: "Child Pi session accepted an idle follow-up turn.",
      details: {
        mailboxEventId: deliveredMailbox.id,
        previousStatus: current.status,
      },
    });
    this.options.store.appendSubagentRunEvent(running.id, {
      type: "subagent.followup_child_session_starting",
      preview: {
        mailboxEventId: deliveredMailbox.id,
        idempotencyKey: input.idempotencyKey,
        previousStatus: current.status,
        messagePreview: previewForSubagentRuntime(input.message, 500),
      },
    });
    const promise = this.runChildFollowupSession({
      ...input,
      run: running,
      mailboxEvent: deliveredMailbox,
      sessionKind: "followup",
    })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.emitError({
          message: `Sub-agent child follow-up failed: ${message}`,
          threadId: running.childThreadId,
        });
      })
      .finally(() => {
        this.options.executions.delete(running.id);
      });
    this.options.executions.set(running.id, {
      childThreadId: running.childThreadId,
      promise,
      startedAt: this.nowIso(),
    });
    return {
      run: this.options.store.getSubagentRun(running.id),
      accepted: true,
      mailboxEvent: deliveredMailbox,
      message: "Child Pi session follow-up started in the visible child thread.",
    };
  }

  retryChildRun(input: SubagentChildRuntimeRetryInput): SubagentChildRuntimeRetryResult {
    const current = this.options.store.getSubagentRun(input.run.id);
    if (current.closedAt) {
      return {
        run: current,
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: "Child runtime did not accept the retry because the sub-agent is closed.",
      };
    }
    if (this.options.executions.has(current.id)) {
      return {
        run: current,
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: "Child runtime is already active; the retry request remains queued.",
      };
    }
    if (!subagentStatusCanRetryInSameChildThread(current.status)) {
      return {
        run: current,
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: `Child runtime did not accept the retry because the sub-agent is ${current.status}.`,
      };
    }
    const deliveredMailbox = input.markMailboxDelivered();
    const running = this.options.store.markSubagentRunStatus(current.id, "running");
    input.emitEvent({
      type: "status",
      source: "retry_child",
      status: "running",
      message: "Child Pi session accepted a retry turn in the visible child thread.",
      details: {
        mailboxEventId: deliveredMailbox.id,
        previousStatus: current.status,
      },
    });
    this.options.store.appendSubagentRunEvent(running.id, {
      type: "subagent.retry_child_session_starting",
      preview: {
        mailboxEventId: deliveredMailbox.id,
        idempotencyKey: input.idempotencyKey,
        previousStatus: current.status,
        messagePreview: previewForSubagentRuntime(input.message, 500),
      },
    });
    const promise = this.runChildFollowupSession({
      ...input,
      run: running,
      mailboxEvent: deliveredMailbox,
    })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.emitError({
          message: `Sub-agent child retry failed: ${message}`,
          threadId: running.childThreadId,
        });
      })
      .finally(() => {
        this.options.executions.delete(running.id);
      });
    this.options.executions.set(running.id, {
      childThreadId: running.childThreadId,
      promise,
      startedAt: this.nowIso(),
    });
    return {
      run: this.options.store.getSubagentRun(running.id),
      accepted: true,
      mailboxEvent: deliveredMailbox,
      message: "Child Pi session retry started in the visible child thread.",
    };
  }

  startChildRun(input: SubagentChildRuntimeStartInput): SubagentChildRuntimeStartResult {
    const current = this.options.store.getSubagentRun(input.run.id);
    if (current.closedAt) throw new Error(`Cannot start closed sub-agent run ${current.id}.`);
    if (this.options.executions.has(current.id)) {
      return {
        started: false,
        run: current,
        message: "Child runtime is already active for this sub-agent run.",
      };
    }
    if (isSubagentTerminalStatus(current.status)) {
      return {
        started: false,
        run: current,
        message: `Child runtime was not started because the sub-agent is already ${current.status}.`,
      };
    }

    const starting = this.options.store.markSubagentRunStatus(current.id, "starting");
    input.emitEvent({
      type: "status",
      source: "child_runtime",
      status: "starting",
      message: "Child Pi session is starting.",
    });
    this.options.store.appendSubagentRunEvent(starting.id, {
      type: "subagent.child_session_starting",
      preview: {
        childThreadId: starting.childThreadId,
        roleId: input.role.id,
        dependencyMode: input.dependencyMode,
        forkMode: input.forkMode,
        promptMode: input.promptMode,
        idempotencyKey: input.idempotencyKey,
      },
    });
    const promise = this.runChildSession({ ...input, run: starting })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.emitError({
          message: `Sub-agent child run failed: ${message}`,
          threadId: starting.childThreadId,
        });
      })
      .finally(() => {
        this.options.executions.delete(starting.id);
      });
    this.options.executions.set(starting.id, {
      childThreadId: starting.childThreadId,
      promise,
      startedAt: this.nowIso(),
    });
    return {
      started: true,
      run: this.options.store.getSubagentRun(starting.id),
      message: "Child Pi session started in the visible child thread.",
    };
  }

  async waitForChildRun(input: SubagentChildRuntimeWaitInput): Promise<SubagentChildRuntimeWaitResult> {
    return waitForSubagentChildLifecycleRun(this.options, input);
  }

  async cancelChildRun(input: SubagentChildRuntimeCancelInput): Promise<SubagentChildRuntimeCancelResult> {
    return cancelSubagentChildLifecycleRun(this.options, input);
  }

  private async runChildSession(input: SubagentChildRuntimeStartInput): Promise<void> {
    const running = this.options.store.markSubagentRunStatus(input.run.id, "running");
    input.emitEvent({
      type: "started",
      source: "child_runtime",
      status: "running",
      message: "Child Pi session is running in the visible child thread.",
    });
    const childThread = this.options.store.getThread(running.childThreadId);
    const parentContext = subagentParentContextForMessages(this.options.store.listMessages(input.parentThread.id), input.forkMode);
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
    this.options.store.recordSubagentPromptSnapshot(running.id, {
      prompt,
      snapshot: buildSubagentPromptSnapshot(promptInput),
    });
    this.options.store.appendSubagentRunEvent(running.id, {
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
      let childMessageCountBeforeSend = this.options.store.listMessages(running.childThreadId).length;
      await this.options.send({
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
      } as RuntimeSendMessageInput, { awaitInternalRetryCompletion: true });

      let completion = this.options.completeTurnAfterSend({
        run: running,
        role: input.role,
        childMessageCountBeforeSend,
        emitEvent: input.emitEvent,
      });
      for (let attempt = 1; completion.status === "needs_followup" && attempt <= MAX_SUBAGENT_POST_TOOL_FINALIZATION_FOLLOWUPS; attempt += 1) {
        const latestRun = this.options.store.getSubagentRun(running.id);
        if (latestRun.status !== "running") return;
        const followupPrompt = buildSubagentFollowupPrompt({
          message: completion.message,
          role: input.role,
          run: latestRun,
        });
        childMessageCountBeforeSend = this.options.store.listMessages(latestRun.childThreadId).length;
        this.options.store.appendSubagentRunEvent(latestRun.id, {
          type: "subagent.internal_post_tool_followup_started",
          preview: {
            attempt,
            maxAttempts: MAX_SUBAGENT_POST_TOOL_FINALIZATION_FOLLOWUPS,
            reason: completion.reason,
            promptChars: followupPrompt.length,
          },
        });
        await this.options.send({
          threadId: latestRun.childThreadId,
          content: followupPrompt,
          visibleUserContent: `Sub-agent runtime follow-up: ${previewForSubagentRuntime(completion.reason, 240)}`,
          modelContentOverride: followupPrompt,
          permissionMode: childThread.permissionMode,
          collaborationMode: "agent",
          model: latestRun.modelRuntimeSnapshot.profile.modelId,
          thinkingLevel: childThread.thinkingLevel,
          delivery: "follow-up",
          preserveActiveThread: true,
          internal: true,
        } as RuntimeSendMessageInput, { awaitInternalRetryCompletion: true });
        completion = this.options.completeTurnAfterSend({
          run: latestRun,
          role: input.role,
          childMessageCountBeforeSend,
          emitEvent: input.emitEvent,
        });
      }
      if (completion.status === "needs_followup") {
        this.options.recordFollowupExhausted({
          run: this.options.store.getSubagentRun(running.id),
          completion,
        });
        throw new Error(`${completion.reason} Ambient exhausted automatic child post-tool finalization follow-ups.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const latest = this.options.store.getSubagentRun(running.id);
      if (childSessionErrorShouldPreserveTerminalStatus(latest.status)) return;
      const failed = this.options.store.markSubagentRunStatus(running.id, "failed", {
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
      this.options.store.appendSubagentMailboxEvent(failed.id, {
        direction: "child_to_parent",
        type: "subagent.failed",
        payload: {
          status: "failed",
          error: message,
          childThreadId: failed.childThreadId,
        },
      });
      this.options.store.appendSubagentRunEvent(failed.id, {
        type: "subagent.child_session_failed",
        preview: {
          error: message,
        },
      });
      this.options.recordGroupedCompletionIfNeeded(failed, message);
      throw error;
    }
  }

  private async runChildFollowupSession(
    input: SubagentChildRuntimeFollowupInput & {
      run: SubagentRunSummary;
      mailboxEvent: SubagentMailboxEventSummary;
      sessionKind?: "followup" | "retry";
    },
  ): Promise<void> {
    const role = input.run.roleProfileSnapshot;
    const childThread = this.options.store.getThread(input.run.childThreadId);
    const sessionKind = input.sessionKind ?? "followup";
    const runtimeEventSource: SubagentRuntimeEventSource = sessionKind === "retry" ? "retry_child" : "followup_agent";
    const sessionLabel = sessionKind === "retry" ? "retry" : "follow-up";
    const followupPrompt = buildSubagentFollowupPrompt({
      message: input.message,
      role,
      run: input.run,
    });
    try {
      let childMessageCountBeforeSend = this.options.store.listMessages(input.run.childThreadId).length;
      this.options.store.appendSubagentRunEvent(input.run.id, {
        type: sessionKind === "retry" ? "subagent.retry_child_session_started" : "subagent.followup_child_session_started",
        preview: {
          mailboxEventId: input.mailboxEvent.id,
          promptChars: followupPrompt.length,
          messagePreview: previewForSubagentRuntime(input.message, 500),
        },
      });
      await this.options.send({
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
      } as RuntimeSendMessageInput, { awaitInternalRetryCompletion: true });
      const consumedMailbox = input.markMailboxConsumed();
      this.options.store.appendSubagentRunEvent(input.run.id, {
        type: sessionKind === "retry" ? "subagent.retry_consumed" : "subagent.followup_consumed",
        preview: {
          mailboxEventId: consumedMailbox.id,
          deliveryState: consumedMailbox.deliveryState,
          deliveredAt: consumedMailbox.deliveredAt,
        },
      });
      let completion = this.options.completeTurnAfterSend({
        run: input.run,
        role,
        childMessageCountBeforeSend,
        emitEvent: input.emitEvent,
      });
      for (let attempt = 1; completion.status === "needs_followup" && attempt <= MAX_SUBAGENT_POST_TOOL_FINALIZATION_FOLLOWUPS; attempt += 1) {
        const latestRun = this.options.store.getSubagentRun(input.run.id);
        if (latestRun.status !== "running") return;
        const internalFollowupPrompt = buildSubagentFollowupPrompt({
          message: completion.message,
          role,
          run: latestRun,
        });
        childMessageCountBeforeSend = this.options.store.listMessages(latestRun.childThreadId).length;
        this.options.store.appendSubagentRunEvent(latestRun.id, {
          type: "subagent.internal_post_tool_followup_started",
          preview: {
            attempt,
            maxAttempts: MAX_SUBAGENT_POST_TOOL_FINALIZATION_FOLLOWUPS,
            reason: completion.reason,
            sourceMailboxEventId: input.mailboxEvent.id,
            promptChars: internalFollowupPrompt.length,
          },
        });
        await this.options.send({
          threadId: latestRun.childThreadId,
          content: internalFollowupPrompt,
          visibleUserContent: `Child runtime follow-up: ${previewForSubagentRuntime(completion.reason, 240)}`,
          modelContentOverride: internalFollowupPrompt,
          permissionMode: childThread.permissionMode,
          collaborationMode: "agent",
          model: latestRun.modelRuntimeSnapshot.profile.modelId,
          thinkingLevel: childThread.thinkingLevel,
          delivery: "follow-up",
          preserveActiveThread: true,
          internal: true,
        } as RuntimeSendMessageInput, { awaitInternalRetryCompletion: true });
        completion = this.options.completeTurnAfterSend({
          run: latestRun,
          role,
          childMessageCountBeforeSend,
          emitEvent: input.emitEvent,
        });
      }
      if (completion.status === "needs_followup") {
        this.options.recordFollowupExhausted({
          run: this.options.store.getSubagentRun(input.run.id),
          completion,
        });
        throw new Error(`${completion.reason} Ambient exhausted automatic child post-tool finalization follow-ups.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const latest = this.options.store.getSubagentRun(input.run.id);
      if (childSessionErrorShouldPreserveTerminalStatus(latest.status)) return;
      const failedMailbox = this.options.store.updateSubagentMailboxEventDeliveryState(input.mailboxEvent.id, "failed");
      const failed = this.options.store.markSubagentRunStatus(input.run.id, "failed", {
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
      this.options.store.appendSubagentMailboxEvent(failed.id, {
        direction: "child_to_parent",
        type: "subagent.failed",
        payload: {
          status: "failed",
          error: message,
          childThreadId: failed.childThreadId,
          sourceMailboxEventId: failedMailbox.id,
        },
      });
      this.options.store.appendSubagentRunEvent(failed.id, {
        type: "subagent.followup_child_session_failed",
        preview: {
          mailboxEventId: failedMailbox.id,
          deliveryState: failedMailbox.deliveryState,
          error: message,
        },
      });
      this.options.recordGroupedCompletionIfNeeded(failed, message);
      throw error;
    }
  }

  private emitError(input: { message: string; threadId: string }): void {
    this.options.emit({
      type: "error",
      message: input.message,
      threadId: input.threadId,
      workspacePath: threadWorkspacePath(this.options.store, input.threadId),
    });
  }

  private nowIso(): string {
    return (this.options.now?.() ?? new Date()).toISOString();
  }
}

function subagentStatusCanRetryInSameChildThread(status: SubagentRunSummary["status"]): boolean {
  return status === "failed" ||
    status === "stopped" ||
    status === "cancelled" ||
    status === "timed_out" ||
    status === "aborted_partial";
}

function threadWorkspacePath(
  store: Pick<ProjectStore, "getThread" | "getWorkspace">,
  threadId: string,
): string | undefined {
  try {
    return store.getThread(threadId).workspacePath;
  } catch {
    try {
      return store.getWorkspace().path;
    } catch {
      return undefined;
    }
  }
}
