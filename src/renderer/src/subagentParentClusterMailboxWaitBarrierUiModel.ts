import type {
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierDecision,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import type {
  SubagentParentClusterChildBlockerDraft,
  SubagentParentClusterLifecycleEffectModel,
  SubagentParentClusterMailboxActionModel,
  SubagentParentClusterMailboxActivityModel,
} from "./subagentParentClusterMailboxTypes";
import type { SubagentParentClusterTone } from "./subagentParentClusterWorkflowTaskUiModel";
import {
  arrayValue,
  booleanValue,
  childSourceLabel,
  numberValue,
  recordValue,
  statusLabelFromString,
  stringArrayValue,
  stringValue,
  titleCase,
  truncate,
  uniqueStrings,
} from "./subagentParentClusterSharedUiModel";

type BarrierBackgroundPredicate = (barrier: SubagentWaitBarrierSummary, workflowTasks: CallableWorkflowTaskSummary[]) => boolean;

export function latestQueuedWaitBarrierAttentionForRun(
  run: SubagentRunSummary,
  parentMailboxEvents: SubagentParentMailboxEventSummary[],
  barriers: SubagentWaitBarrierSummary[],
  workflowTasks: CallableWorkflowTaskSummary[],
  barrierBelongsToBackgroundCallableWorkflow: BarrierBackgroundPredicate,
): SubagentParentMailboxEventSummary | undefined {
  return parentMailboxEvents.find((event) => {
    if (event.type !== "subagent.wait_barrier_attention" || event.deliveryState !== "queued") return false;
    const payload = recordValue(event.payload);
    if (payload?.schemaVersion !== "ambient-subagent-wait-barrier-attention-v1") return false;
    if (stringValue(payload.childRunId) !== run.id) return false;
    const waitBarrierId = stringValue(payload.waitBarrierId);
    if (!waitBarrierId) return true;
    const barrier = barriers.find((candidate) => candidate.id === waitBarrierId);
    return !barrier || !barrierBelongsToBackgroundCallableWorkflow(barrier, workflowTasks);
  });
}

export function waitBarrierAttentionParentBlocker(event: SubagentParentMailboxEventSummary): SubagentParentClusterChildBlockerDraft {
  const payload = recordValue(event.payload) ?? {};
  const parentResolution = recordValue(payload.parentResolution);
  const action = stringValue(parentResolution?.action);
  const barrierStatus = stringValue(payload.barrierStatus);
  const dependencyMode = stringValue(payload.dependencyMode);
  const reason = stringValue(payload.reason);
  const choices = arrayValue(payload.allowedUserChoices)
    .map(recordValue)
    .map((choice) => stringValue(choice?.label))
    .filter((label): label is string => Boolean(label));
  const completionGuardBlocked = waitBarrierCompletionGuardBlocked(payload);
  return {
    kind: "attention",
    label: completionGuardBlocked ? "Blocking: completion guard" : "Blocking: barrier attention",
    statusTone: waitBarrierAttentionTone(action, barrierStatus),
    detail: truncate(
      [
        action ? waitBarrierActionLabel(action) : "Needs decision",
        barrierStatus ? statusLabelFromString(barrierStatus) : undefined,
        dependencyMode ? barrierDependencyLabelFromString(dependencyMode) : undefined,
        waitBarrierResultValidationDetail(payload),
        reason,
        choices.length ? `Choices: ${choices.slice(0, 4).join(", ")}` : undefined,
      ]
        .filter(Boolean)
        .join(" / "),
      260,
    ),
  };
}

export function waitBarrierAttentionActivity(
  event: SubagentParentMailboxEventSummary,
): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.wait_barrier_attention") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-wait-barrier-attention-v1") return undefined;
  const parentResolution = recordValue(payload.parentResolution);
  const action = stringValue(parentResolution?.action);
  const barrierStatus = stringValue(payload.barrierStatus);
  const dependencyMode = stringValue(payload.dependencyMode);
  const reason = stringValue(payload.reason);
  const choiceRecords = arrayValue(payload.allowedUserChoices)
    .map(recordValue)
    .filter((choice): choice is Record<string, unknown> => Boolean(choice));
  const choices = choiceRecords.map((choice) => stringValue(choice?.label)).filter((label): label is string => Boolean(label));
  const symphonyOptions = symphonyDecisionOptionLabels(payload);
  const actionLabels = uniqueStrings([...choices, ...symphonyOptions]);
  const actions = choiceRecords
    .map((choice) => waitBarrierChoiceAction(payload, choice))
    .filter((action): action is SubagentParentClusterMailboxActionModel => Boolean(action));
  return {
    id: event.id,
    label: "Barrier attention",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: waitBarrierAttentionTone(action, barrierStatus),
    summary: truncate(
      [
        action ? waitBarrierActionLabel(action) : "Needs decision",
        barrierStatus ? statusLabelFromString(barrierStatus) : undefined,
        dependencyMode ? barrierDependencyLabelFromString(dependencyMode) : undefined,
      ]
        .filter(Boolean)
        .join(" / "),
      160,
    ),
    detail: truncate(
      [
        reason,
        waitBarrierResultValidationDetail(payload),
        choices.length ? `Choices: ${choices.slice(0, 4).join(", ")}` : undefined,
        symphonyOptions.length ? `Symphony options: ${symphonyOptions.slice(0, 5).join(", ")}` : undefined,
      ]
        .filter(Boolean)
        .join(" | "),
      240,
    ),
    ...(actionLabels.length ? { actionLabels: actionLabels.slice(0, 5) } : {}),
    ...(actions.length ? { actions: actions.slice(0, 4) } : {}),
    updatedAt: event.updatedAt,
  };
}

function symphonyDecisionOptionLabels(payload: Record<string, unknown>): string[] {
  const explicit = arrayValue(payload.symphonyDecisionOptions)
    .map(recordValue)
    .map((option) => {
      const label = stringValue(option?.label);
      if (!label) return undefined;
      return option?.recommended === true ? `${label} (recommended)` : label;
    })
    .filter((label): label is string => Boolean(label));
  if (explicit.length) return uniqueStrings(explicit);
  const request = recordValue(payload.childDecisionRequest);
  const recommendedOption = stringValue(request?.recommendedOption);
  return uniqueStrings(
    stringArrayValue(request?.options).map((option) => {
      const label = symphonyDecisionOptionLabel(option);
      return option === recommendedOption ? `${label} (recommended)` : label;
    }),
  );
}

function symphonyDecisionOptionLabel(option: string): string {
  switch (option) {
    case "grant_scope":
      return "Grant or re-scope child authority";
    case "retry_child":
      return "Retry child";
    case "retry_with_verifier":
      return "Retry with verifier";
    case "accept_partial":
      return "Accept partial";
    case "cancel_group":
      return "Cancel group";
    case "exit_symphony_mode":
      return "Exit Symphony";
    default:
      return option
        .split(/[._-]+/g)
        .map(titleCase)
        .join(" ");
  }
}

function waitBarrierResultValidationDetail(payload: Record<string, unknown>): string | undefined {
  const resultValidation = recordValue(payload.resultValidation);
  if (!resultValidation) return undefined;
  const completionGuard = recordValue(resultValidation.completionGuardValidation);
  const detail = completionGuard ? completionGuardDetail(completionGuard) : undefined;
  const reason = stringValue(completionGuard?.reason) ?? stringValue(resultValidation.reason);
  const parts = [detail, reason].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  const synthesisAllowed = booleanValue(resultValidation.synthesisAllowed);
  return synthesisAllowed === false ? "Result validation blocked synthesis" : undefined;
}

function waitBarrierCompletionGuardBlocked(payload: Record<string, unknown>): boolean {
  const resultValidation = recordValue(payload.resultValidation);
  const completionGuard = recordValue(resultValidation?.completionGuardValidation);
  return Boolean(
    completionGuard && (booleanValue(completionGuard.valid) === false || booleanValue(completionGuard.synthesisAllowed) === false),
  );
}

export function completionGuardDetail(completionGuard: Record<string, unknown>): string | undefined {
  const status = completionGuardStatusLabel(completionGuard);
  const evidence = completionGuardEvidenceLabel(completionGuard);
  return [status, evidence ? `Mutation evidence: ${evidence}` : undefined].filter(Boolean).join(" / ") || undefined;
}

function completionGuardStatusLabel(completionGuard: Record<string, unknown>): string | undefined {
  const required = booleanValue(completionGuard.required);
  const valid = booleanValue(completionGuard.valid);
  const synthesisAllowed = booleanValue(completionGuard.synthesisAllowed);
  if (required === false && valid !== false && synthesisAllowed !== false) return undefined;
  if (valid === true && synthesisAllowed === true) return "Completion guard passed";
  if (valid === false || synthesisAllowed === false) return "Completion guard blocked";
  return "Completion guard recorded";
}

function completionGuardEvidenceLabel(completionGuard: Record<string, unknown>): string | undefined {
  const structured = numberValue(completionGuard.structuredEvidenceCount);
  const ambient = numberValue(completionGuard.ambientEvidenceCount);
  const isolatedWorktree = numberValue(completionGuard.isolatedWorktreeEvidenceCount);
  const approval = numberValue(completionGuard.approvalEvidenceCount);
  const parts = [
    structured !== undefined ? `structured ${structured}` : undefined,
    ambient !== undefined ? `Ambient ${ambient}` : undefined,
    isolatedWorktree !== undefined ? `isolated worktree ${isolatedWorktree}` : undefined,
    approval !== undefined ? `approval ${approval}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : undefined;
}

function waitBarrierChoiceAction(
  payload: Record<string, unknown>,
  choice: Record<string, unknown>,
): SubagentParentClusterMailboxActionModel | undefined {
  if (stringValue(choice.toolAction) !== "resolve_barrier") return undefined;
  const label = stringValue(choice.label);
  const waitBarrierId = stringValue(choice.waitBarrierId) ?? stringValue(payload.waitBarrierId);
  const decision = waitBarrierDecisionValue(choice.decision ?? choice.id);
  if (!label || !waitBarrierId || !decision) return undefined;
  const requiresPartialSummary = choice.requiresPartialSummary === true || decision === "continue_with_partial";
  const requiresUserDecision =
    choice.requiresUserDecision === true || requiresPartialSummary || decision === "detach_child" || decision === "cancel_parent";
  return {
    label,
    title: waitBarrierActionTitle(label, decision, waitBarrierId),
    waitBarrierId,
    decision,
    requiresUserDecision,
    requiresPartialSummary,
    ...(waitBarrierActionChildRunIds(payload).length ? { childRunIds: waitBarrierActionChildRunIds(payload) } : {}),
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
  };
}

function waitBarrierActionChildRunIds(payload: Record<string, unknown>): string[] {
  return uniqueStrings([
    ...(stringValue(payload.childRunId) ? [stringValue(payload.childRunId)!] : []),
    ...stringArrayValue(payload.childRunIds),
  ]);
}

function waitBarrierDecisionValue(value: unknown): SubagentWaitBarrierDecision | undefined {
  const decision = stringValue(value);
  switch (decision) {
    case "continue_with_partial":
    case "fail_parent":
    case "retry_child":
    case "detach_child":
    case "cancel_parent":
      return decision;
    default:
      return undefined;
  }
}

function waitBarrierActionTitle(label: string, decision: SubagentWaitBarrierDecision, waitBarrierId: string): string {
  return `${label}: resolve wait barrier ${waitBarrierId} with ${waitBarrierDecisionLabel(decision)}`;
}

export function waitBarrierDecisionActivity(
  event: SubagentParentMailboxEventSummary,
): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.wait_barrier_decision") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-wait-barrier-decision-v1") return undefined;
  const decision = stringValue(payload.decision);
  const partialSummary = stringValue(payload.partialSummaryPreview);
  const userDecision = stringValue(payload.userDecisionPreview);
  const barrierStatus = stringValue(payload.barrierStatus);
  const controlSummary = lifecycleEffectSummary(payload);
  const detail = [partialSummary, userDecision, controlSummary].filter(Boolean).join(" | ");
  const effectRows = lifecycleEffectRows(payload);
  return {
    id: event.id,
    label: "Barrier decision",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: waitBarrierDecisionTone(decision),
    summary: truncate(
      [
        decision ? waitBarrierDecisionDisplayLabel(decision, payload) : "Decision recorded",
        barrierStatus ? statusLabelFromString(barrierStatus) : undefined,
      ]
        .filter(Boolean)
        .join(" / "),
      160,
    ),
    ...(detail ? { detail: truncate(detail, 240) } : {}),
    ...(effectRows.length ? { effectRows } : {}),
    updatedAt: event.updatedAt,
  };
}

function waitBarrierAttentionTone(action: string | undefined, barrierStatus: string | undefined): SubagentParentClusterTone {
  if (action === "fail_parent") return "danger";
  if (barrierStatus === "failed") return "danger";
  if (action === "wait_for_child") return "active";
  return "warning";
}

function waitBarrierDecisionTone(decision: string | undefined): SubagentParentClusterTone {
  if (decision === "continue_with_partial") return "warning";
  if (decision === "retry_child") return "active";
  if (decision === "detach_child") return "warning";
  if (decision === "fail_parent" || decision === "cancel_parent") return "danger";
  return "neutral";
}

function waitBarrierActionLabel(action: string): string {
  if (action === "ask_user") return "Ask user";
  if (action === "retry_child") return "Retry needed";
  if (action === "fail_parent") return "Fail parent";
  if (action === "wait_for_child") return "Wait for child";
  if (action === "continue_with_explicit_partial") return "Partial allowed";
  return action
    .split(/[._-]+/g)
    .map(titleCase)
    .join(" ");
}

function waitBarrierDecisionLabel(decision: string): string {
  if (decision === "continue_with_partial") return "Partial approved";
  if (decision === "retry_child") return "Retry requested";
  if (decision === "detach_child") return "Child detached";
  if (decision === "cancel_parent") return "Parent cancelled";
  if (decision === "fail_parent") return "Fail parent";
  return decision
    .split(/[._-]+/g)
    .map(titleCase)
    .join(" ");
}

export function waitBarrierDecisionDisplayLabel(decision: string, record: Record<string, unknown> | undefined): string {
  if (decision === "retry_child" && stringArrayValue(record?.retryAcceptedRunIds).length > 0) {
    return "Retry accepted";
  }
  return waitBarrierDecisionLabel(decision);
}

function barrierDependencyLabelFromString(mode: string): string {
  if (mode === "required_all") return "Required all";
  if (mode === "required_any") return "Required any";
  if (mode === "optional_background") return "Background";
  if (mode === "quorum") return "Quorum";
  return mode
    .split(/[._-]+/g)
    .map(titleCase)
    .join(" ");
}

export function lifecycleEffectSummary(record: Record<string, unknown>): string | undefined {
  const parts = lifecycleEffectRows(record).map((row) => row.label);
  return parts.length ? parts.join(" / ") : undefined;
}

export function lifecycleEffectRows(record: Record<string, unknown>): SubagentParentClusterLifecycleEffectModel[] {
  const retryRequestedRunIds = stringArrayValue(record.retryRequestedRunIds);
  const retryAcceptedRunIds = stringArrayValue(record.retryAcceptedRunIds);
  const retryMailboxEventIds = stringArrayValue(record.retryMailboxEventIds);
  const detachedRunIds = stringArrayValue(record.detachedRunIds);
  const cancelledRunIds = stringArrayValue(record.cancelledRunIds);
  const stoppedChildRunIds = stringArrayValue(record.stoppedChildRunIds);
  const unchangedRunIds = stringArrayValue(record.unchangedRunIds);
  const cancelledWaitBarrierIds = stringArrayValue(record.cancelledWaitBarrierIds);
  const failedWaitBarrierIds = stringArrayValue(record.failedWaitBarrierIds);
  const partialWaitBarrierIds = stringArrayValue(record.partialWaitBarrierIds);
  const cancelledMailboxEventIds = stringArrayValue(record.cancelledMailboxEventIds);
  return [
    lifecycleChildRunEffectRow("retry-requested-runs", "Retry requested", retryRequestedRunIds, "active"),
    lifecycleChildRunEffectRow("retry-accepted-runs", "Retry accepted", retryAcceptedRunIds, "active"),
    lifecycleIdEffectRow(
      "retry-mailbox-events",
      retryMailboxEventCountSummary(retryMailboxEventIds.length),
      "Mailbox events",
      retryMailboxEventIds,
      "active",
    ),
    lifecycleChildRunEffectRow("detached-runs", "Detached", detachedRunIds, "warning"),
    lifecycleChildRunEffectRow("cancelled-runs", "Cancelled", cancelledRunIds, "danger"),
    lifecycleChildRunEffectRow("stopped-runs", "Stopped", stoppedChildRunIds, "danger"),
    lifecycleChildRunEffectRow("unchanged-runs", "Unchanged", unchangedRunIds, "neutral"),
    lifecycleIdEffectRow(
      "cancelled-wait-barriers",
      cancelledWaitBarrierCountSummary(cancelledWaitBarrierIds.length),
      "Wait barriers",
      cancelledWaitBarrierIds,
      "warning",
    ),
    lifecycleIdEffectRow(
      "failed-wait-barriers",
      failedWaitBarrierCountSummary(failedWaitBarrierIds.length),
      "Wait barriers",
      failedWaitBarrierIds,
      "danger",
    ),
    lifecycleIdEffectRow(
      "partial-wait-barriers",
      partialWaitBarrierCountSummary(partialWaitBarrierIds.length),
      "Wait barriers",
      partialWaitBarrierIds,
      "warning",
    ),
    record.parentCancellationRequested === true
      ? {
          key: "parent-cancellation-requested",
          label: "Parent cancellation requested",
          detail:
            record.parentStopped === true
              ? "Parent run cancellation was requested by the parent-stop cascade."
              : "Parent run cancellation was requested by the barrier decision.",
          statusTone: "danger" as const,
        }
      : undefined,
    lifecycleIdEffectRow(
      "cancelled-mailbox-events",
      cancelledMailboxEventCountSummary(cancelledMailboxEventIds.length),
      "Mailbox events",
      cancelledMailboxEventIds,
      "warning",
    ),
  ].filter((row): row is SubagentParentClusterLifecycleEffectModel => Boolean(row));
}

function lifecycleChildRunEffectRow(
  key: string,
  label: string,
  runIds: string[],
  statusTone: SubagentParentClusterTone,
): SubagentParentClusterLifecycleEffectModel | undefined {
  const rowLabel = childRunCountSummary(label, runIds.length);
  return lifecycleIdEffectRow(key, rowLabel, "Runs", runIds, statusTone);
}

function lifecycleIdEffectRow(
  key: string,
  label: string | undefined,
  detailPrefix: string,
  ids: string[],
  statusTone: SubagentParentClusterTone,
): SubagentParentClusterLifecycleEffectModel | undefined {
  if (!label) return undefined;
  return {
    key,
    label,
    detail: ids.length ? `${detailPrefix}: ${compactEffectIdList(ids)}` : label,
    statusTone,
  };
}

function compactEffectIdList(ids: string[]): string {
  return `${ids.slice(0, 4).join(", ")}${ids.length > 4 ? ` +${ids.length - 4}` : ""}`;
}

function childRunCountSummary(label: string, count: number): string | undefined {
  return count ? `${label} ${count} ${count === 1 ? "child" : "children"}` : undefined;
}

export function cancelledWaitBarrierCountSummary(count: number): string | undefined {
  return count ? `${count} wait ${count === 1 ? "barrier" : "barriers"} cancelled` : undefined;
}

function failedWaitBarrierCountSummary(count: number): string | undefined {
  return count ? `${count} wait ${count === 1 ? "barrier" : "barriers"} failed` : undefined;
}

function partialWaitBarrierCountSummary(count: number): string | undefined {
  return count ? `${count} partial wait ${count === 1 ? "barrier" : "barriers"} available` : undefined;
}

export function cancelledMailboxEventCountSummary(count: number): string | undefined {
  return count ? `${count} pending mailbox ${count === 1 ? "event" : "events"} cancelled` : undefined;
}

function retryMailboxEventCountSummary(count: number): string | undefined {
  return count ? `${count} retry mailbox ${count === 1 ? "event" : "events"} queued` : undefined;
}
