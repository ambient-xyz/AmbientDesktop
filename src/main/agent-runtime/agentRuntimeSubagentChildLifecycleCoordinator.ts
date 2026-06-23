import type { SubagentRunSummary } from "../../shared/subagentTypes";
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
import type {
  AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  SubagentChildExecutionRecord,
} from "./agentRuntimeSubagentChildLifecycleTypes";
import { isSubagentTerminalStatus, previewForSubagentRuntime } from "./subagents/agentRuntimeSubagentRuntimeHelpers";
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
import { runSubagentChildFollowupSession, runSubagentChildSession } from "./agentRuntimeSubagentChildSessionRunner";

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

  resolveApprovalResponse(input: SubagentChildRuntimeApprovalResponseInput): SubagentChildRuntimeApprovalResponseResult {
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
    const promise = runSubagentChildFollowupSession(this.options, {
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
    const promise = runSubagentChildFollowupSession(this.options, {
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
    const promise = runSubagentChildSession(this.options, { ...input, run: starting })
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
  return status === "failed" || status === "stopped" || status === "cancelled" || status === "timed_out" || status === "aborted_partial";
}

function threadWorkspacePath(store: Pick<ProjectStore, "getThread" | "getWorkspace">, threadId: string): string | undefined {
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
