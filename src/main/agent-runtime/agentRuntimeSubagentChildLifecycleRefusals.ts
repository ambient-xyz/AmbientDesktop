import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type {
  SubagentChildRuntimeApprovalResponseInput,
  SubagentChildRuntimeApprovalResponseResult,
  SubagentChildRuntimeFollowupInput,
  SubagentChildRuntimeFollowupResult,
  SubagentChildRuntimeRetryInput,
  SubagentChildRuntimeRetryResult,
  SubagentChildRuntimeStartInput,
  SubagentChildRuntimeStartResult,
} from "./agentRuntimePiFacade";
import type { AgentRuntimeSubagentChildLifecycleCoordinatorOptions } from "./agentRuntimeSubagentChildLifecycleTypes";
import { isSubagentTerminalStatus } from "./subagents/agentRuntimeSubagentRuntimeHelpers";

export function refuseSubagentChildLifecycleStartBecauseFeatureDisabled(
  options: AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  input: SubagentChildRuntimeStartInput,
  featureFlagSnapshot: AmbientFeatureFlagSnapshot,
): SubagentChildRuntimeStartResult {
  const current = options.store.getSubagentRun(input.run.id);
  const message = "ambient.subagents is disabled; refusing to start sub-agent child runtime.";
  if (current.closedAt || isSubagentTerminalStatus(current.status)) {
    return {
      started: false,
      run: current,
      message: current.closedAt
        ? "ambient.subagents is disabled; the sub-agent is closed and no child runtime will be started."
        : `ambient.subagents is disabled; the sub-agent is already ${current.status} and no child runtime will be started.`,
    };
  }
  if (current.status === "starting" || current.status === "running") {
    input.emitEvent({
      type: "status",
      source: "child_runtime",
      status: current.status,
      message: "ambient.subagents is disabled; existing active child runtime state is preserved, but no new child execution will be started.",
      details: {
        reason: "ambient_subagents_disabled",
        featureFlagSnapshot,
      },
    });
    options.store.appendSubagentRunEvent(current.id, {
      type: "subagent.child_runtime_refused",
      preview: subagentRuntimeFeatureDisabledRunEventPreview(current, {
        status: current.status,
        preservedActiveState: true,
        idempotencyKey: input.idempotencyKey,
        featureFlagSnapshot,
      }),
    });
    return {
      started: false,
      run: current,
      message: "ambient.subagents is disabled; existing active child runtime state was preserved and no new child execution was started.",
    };
  }
  const resultArtifact = {
    schemaVersion: "ambient-subagent-result-artifact-v1" as const,
    runId: current.id,
    status: "failed" as const,
    partial: false,
    summary: message,
    childThreadId: current.childThreadId,
  };
  const failed = options.store.markSubagentRunStatus(current.id, "failed", { resultArtifact });
  input.emitEvent({
    type: "error",
    source: "child_runtime",
    status: "failed",
    message,
    details: {
      reason: "ambient_subagents_disabled",
      featureFlagSnapshot,
    },
  });
  options.store.appendSubagentMailboxEvent(failed.id, {
    direction: "child_to_parent",
    type: "subagent.failed",
    payload: {
      status: "failed",
      error: message,
      reason: "ambient_subagents_disabled",
      childThreadId: failed.childThreadId,
    },
  });
  options.store.appendSubagentRunEvent(failed.id, {
    type: "subagent.child_runtime_refused",
    preview: subagentRuntimeFeatureDisabledRunEventPreview(failed, {
      status: "failed",
      idempotencyKey: input.idempotencyKey,
      featureFlagSnapshot,
    }),
  });
  options.recordGroupedCompletionIfNeeded(failed, message);
  return {
    started: false,
    run: failed,
    message,
  };
}

export function refuseSubagentChildLifecycleFollowupBecauseFeatureDisabled(
  options: AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  input: SubagentChildRuntimeFollowupInput,
  featureFlagSnapshot: AmbientFeatureFlagSnapshot,
): SubagentChildRuntimeFollowupResult {
  const current = options.store.getSubagentRun(input.run.id);
  const message = "ambient.subagents is disabled; refusing to deliver sub-agent follow-up. The follow-up remains queued.";
  input.emitEvent({
    type: "status",
    source: "followup_agent",
    status: current.status,
    message,
    details: {
      reason: "ambient_subagents_disabled",
      mailboxEventId: input.mailboxEvent.id,
      featureFlagSnapshot,
    },
  });
  options.store.appendSubagentRunEvent(current.id, {
    type: "subagent.followup_refused",
    preview: subagentRuntimeFeatureDisabledRunEventPreview(current, {
      mailboxEventId: input.mailboxEvent.id,
      idempotencyKey: input.idempotencyKey,
      featureFlagSnapshot,
    }),
  });
  return {
    run: current,
    accepted: false,
    mailboxEvent: input.mailboxEvent,
    message,
  };
}

export function refuseSubagentChildLifecycleRetryBecauseFeatureDisabled(
  options: AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  input: SubagentChildRuntimeRetryInput,
  featureFlagSnapshot: AmbientFeatureFlagSnapshot,
): SubagentChildRuntimeRetryResult {
  const current = options.store.getSubagentRun(input.run.id);
  const message = "ambient.subagents is disabled; refusing to retry sub-agent child work. The retry request remains queued.";
  input.emitEvent({
    type: "status",
    source: "retry_child",
    status: current.status,
    message,
    details: {
      reason: "ambient_subagents_disabled",
      mailboxEventId: input.mailboxEvent.id,
      featureFlagSnapshot,
    },
  });
  options.store.appendSubagentRunEvent(current.id, {
    type: "subagent.retry_refused",
    preview: subagentRuntimeFeatureDisabledRunEventPreview(current, {
      mailboxEventId: input.mailboxEvent.id,
      idempotencyKey: input.idempotencyKey,
      featureFlagSnapshot,
    }),
  });
  return {
    run: current,
    accepted: false,
    mailboxEvent: input.mailboxEvent,
    message,
  };
}

export function refuseSubagentChildLifecycleApprovalResponseBecauseFeatureDisabled(
  options: AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  input: SubagentChildRuntimeApprovalResponseInput,
  featureFlagSnapshot: AmbientFeatureFlagSnapshot,
): SubagentChildRuntimeApprovalResponseResult {
  const current = options.store.getSubagentRun(input.run.id);
  const message = "ambient.subagents is disabled; refusing to deliver child approval response. The approval response remains queued.";
  input.emitEvent({
    type: "status",
    source: "approval_response",
    status: current.status,
    message,
    details: {
      reason: "ambient_subagents_disabled",
      mailboxEventId: input.mailboxEvent.id,
      approvalId: input.approvalId,
      effectiveScope: input.effectiveScope,
      featureFlagSnapshot,
    },
  });
  options.store.appendSubagentRunEvent(current.id, {
    type: "subagent.approval_response.refused",
    preview: subagentRuntimeFeatureDisabledRunEventPreview(current, {
      mailboxEventId: input.mailboxEvent.id,
      approvalId: input.approvalId,
      effectiveScope: input.effectiveScope,
      idempotencyKey: input.idempotencyKey,
      featureFlagSnapshot,
    }),
  });
  return {
    run: current,
    accepted: false,
    mailboxEvent: input.mailboxEvent,
    message,
  };
}

function subagentRuntimeFeatureDisabledRunEventPreview(
  run: SubagentRunSummary,
  details: Record<string, unknown>,
): Record<string, unknown> {
  return {
    childRunId: run.id,
    childThreadId: run.childThreadId,
    parentRunId: run.parentRunId,
    parentThreadId: run.parentThreadId,
    canonicalTaskPath: run.canonicalTaskPath,
    reason: "ambient_subagents_disabled",
    ...details,
  };
}
