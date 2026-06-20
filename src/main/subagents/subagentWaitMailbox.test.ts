import { describe, expect, it } from "vitest";
import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { SubagentParentPolicyResolution } from "./subagentParentPolicyResolution";
import { evaluateSubagentWaitBarrierForSynthesis } from "./subagentWaitBarrierEvaluation";
import {
  buildSubagentWaitBarrierAttentionParentMailboxDraft,
  buildSubagentWaitCompletionMailboxDraft,
  createSubagentWaitCompletionIdempotencyKey,
  shouldRecordSubagentWaitBarrierAttention,
  shouldRecordSubagentWaitCompletion,
  SUBAGENT_WAIT_BARRIER_ATTENTION_PARENT_MAILBOX_TYPE,
  SUBAGENT_WAIT_BARRIER_ATTENTION_SCHEMA_VERSION,
  SUBAGENT_WAIT_COMPLETION_MAILBOX_TYPE,
  SUBAGENT_WAIT_COMPLETION_SCHEMA_VERSION,
} from "./subagentWaitMailbox";

describe("subagentWaitMailbox", () => {
  it("records wait completion only for terminal, attention, timed-out, or resolved barrier states", () => {
    expect(shouldRecordSubagentWaitCompletion({
      runStatus: "running",
      waitBarrier: { status: "waiting_on_children" },
      waitTimedOut: false,
    })).toBe(false);
    expect(shouldRecordSubagentWaitCompletion({ runStatus: "running", waitTimedOut: true })).toBe(true);
    expect(shouldRecordSubagentWaitCompletion({ runStatus: "needs_attention", waitTimedOut: false })).toBe(true);
    expect(shouldRecordSubagentWaitCompletion({ runStatus: "completed", waitTimedOut: false })).toBe(true);
    expect(shouldRecordSubagentWaitCompletion({
      runStatus: "running",
      waitBarrier: { status: "satisfied" },
      waitTimedOut: false,
    })).toBe(true);
  });

  it("builds stable delivered wait-completion mailbox and run-event drafts", () => {
    const run = childRun({
      status: "completed",
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: "child-run",
        status: "completed",
        partial: false,
        summary: "Child result is ready.",
        childThreadId: "child-thread",
      },
    });
    const waitBarrier = barrier({ status: "satisfied" });
    const resultValidation = validation({ status: "completed", synthesisAllowed: true });
    const waitBarrierEvaluation = evaluateSubagentWaitBarrierForSynthesis({
      barrier: waitBarrier,
      childResults: [{
        childRunId: run.id,
        childThreadId: run.childThreadId,
        status: "completed",
        synthesisAllowed: true,
        partial: false,
        resultValidation,
      }],
    });
    const parentResolution = parentPolicyResolution({
      action: "synthesize",
      status: "ready",
      canSynthesize: true,
      requiresUserInput: false,
      requiresExplicitPartial: false,
    });

    const draft = buildSubagentWaitCompletionMailboxDraft({
      run,
      waitBarrier,
      waitTimedOut: false,
      resultValidation,
      waitBarrierEvaluation,
      parentResolution,
      createdAt: "2026-06-05T12:00:00.000Z",
    });
    const replayDraft = buildSubagentWaitCompletionMailboxDraft({
      run,
      waitBarrier,
      waitTimedOut: false,
      resultValidation,
      waitBarrierEvaluation,
      parentResolution,
      createdAt: "2026-06-05T12:01:00.000Z",
    });

    expect(draft.idempotencyKey).toBe(createSubagentWaitCompletionIdempotencyKey({
      run,
      waitBarrier,
      waitTimedOut: false,
      resultValidation,
      waitBarrierEvaluation,
    }));
    expect(replayDraft.idempotencyKey).toBe(draft.idempotencyKey);
    expect(draft.mailboxInput).toMatchObject({
      direction: "child_to_parent",
      type: SUBAGENT_WAIT_COMPLETION_MAILBOX_TYPE,
      deliveryState: "delivered",
      createdAt: "2026-06-05T12:00:00.000Z",
      deliveredAt: "2026-06-05T12:00:00.000Z",
      payload: {
        schemaVersion: SUBAGENT_WAIT_COMPLETION_SCHEMA_VERSION,
        idempotencyKey: draft.idempotencyKey,
        runId: run.id,
        parentRunId: run.parentRunId,
        childThreadId: run.childThreadId,
        canonicalTaskPath: run.canonicalTaskPath,
        status: "completed",
        waitTimedOut: false,
        synthesisAllowed: true,
        summary: "Child result is ready.",
        waitBarrier: expect.objectContaining({ id: waitBarrier.id, status: "satisfied" }),
        waitBarrierEvaluation: expect.objectContaining({ validSynthesisCount: 1 }),
        parentResolution: expect.objectContaining({ action: "synthesize" }),
      },
    });
    expect(draft.runEventInput).toEqual({
      type: SUBAGENT_WAIT_COMPLETION_MAILBOX_TYPE,
      createdAt: "2026-06-05T12:00:00.000Z",
      preview: {
        idempotencyKey: draft.idempotencyKey,
        status: "completed",
        waitTimedOut: false,
        synthesisAllowed: true,
        waitBarrierStatus: "satisfied",
        requiredSynthesisCount: 1,
        validSynthesisCount: 1,
      },
    });
  });

  it("records wait-barrier attention only for blocked required barriers that need user-visible attention", () => {
    expect(shouldRecordSubagentWaitBarrierAttention({
      waitBarrier: { dependencyMode: "optional_background" },
      waitTimedOut: true,
      parentResolution: { status: "blocked", action: "ask_user" },
    })).toBe(false);
    expect(shouldRecordSubagentWaitBarrierAttention({
      waitBarrier: { dependencyMode: "required_all" },
      waitTimedOut: false,
      parentResolution: { status: "ready", action: "synthesize" },
    })).toBe(false);
    expect(shouldRecordSubagentWaitBarrierAttention({
      waitBarrier: { dependencyMode: "required_all" },
      waitTimedOut: false,
      parentResolution: { status: "blocked", action: "wait_for_child" },
    })).toBe(false);
    expect(shouldRecordSubagentWaitBarrierAttention({
      waitBarrier: { dependencyMode: "required_all" },
      waitTimedOut: true,
      parentResolution: { status: "blocked", action: "wait_for_child" },
    })).toBe(true);
  });

  it("builds compact queued parent attention mailbox drafts with allowed choices", () => {
    const longReason = `reason ${"x".repeat(800)}`;
    const longInstruction = `instruction ${"y".repeat(800)}`;
    const run = childRun({ status: "failed", symphonyLaunchContracts: symphonyLaunchContracts() });
    const waitBarrier = barrier({ status: "timed_out", failurePolicy: "degrade_partial" });
    const resultValidation = validation({
      status: "failed",
      synthesisAllowed: false,
      reason: longReason,
      completionGuardValidation: { valid: false, reason: "Missing mutation evidence." },
    });
    const parentResolution = parentPolicyResolution({
      status: "blocked",
      action: "ask_user",
      canSynthesize: false,
      requiresUserInput: true,
      requiresExplicitPartial: true,
      reason: longReason,
      instruction: longInstruction,
      barrierStatus: "timed_out",
      failurePolicy: "degrade_partial",
    });
    const waitBarrierEvaluation = evaluateSubagentWaitBarrierForSynthesis({
      barrier: waitBarrier,
      terminalEvidence: {
        kind: "child_runtime_timeout",
        childRunId: run.id,
        reason: "runtime_idle_timeout",
      },
      childResults: [{
        childRunId: run.id,
        childThreadId: run.childThreadId,
        status: "failed",
        synthesisAllowed: false,
        partial: false,
        reason: longReason,
        resultValidation,
      }],
    });

    const draft = buildSubagentWaitBarrierAttentionParentMailboxDraft({
      run,
      waitBarrier,
      waitTimedOut: true,
      resultValidation,
      waitBarrierEvaluation,
      parentResolution,
    });
    const payload = draft.parentMailboxInput.payload as Record<string, any>;

    expect(draft.parentMailboxInput).toMatchObject({
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      type: SUBAGENT_WAIT_BARRIER_ATTENTION_PARENT_MAILBOX_TYPE,
      deliveryState: "queued",
      idempotencyKey: draft.idempotencyKey,
    });
    expect(draft.parentMailboxInput).not.toHaveProperty("parentMessageId");
    expect(payload).toMatchObject({
      schemaVersion: SUBAGENT_WAIT_BARRIER_ATTENTION_SCHEMA_VERSION,
      idempotencyKey: draft.idempotencyKey,
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      parentMessageId: null,
      childRunId: run.id,
      waitBarrierId: waitBarrier.id,
      barrierStatus: "timed_out",
      failurePolicy: "degrade_partial",
      childStatuses: [{ childRunId: run.id, status: "failed" }],
      waitTimedOut: true,
      parentResolution: expect.objectContaining({ action: "ask_user" }),
      childDecisionRequest: {
        schemaVersion: "ambient-symphony-child-decision-request-v1",
        requestId: "symphony-child-decision:parent-run:barrier:timed_out:2026-06-05T12-00-00-000Z",
        barrierId: waitBarrier.id,
        parentRunId: run.parentRunId,
        childRunIds: [run.id],
        reason: "timed_out",
        options: ["retry_child", "accept_partial", "cancel_group", "exit_symphony_mode"],
        recommendedOption: "retry_child",
        optionActions: [
          { option: "retry_child", toolAction: "resolve_barrier", decision: "retry_child" },
          { option: "accept_partial", toolAction: "resolve_barrier", decision: "continue_with_partial", requiresUserDecision: true, requiresPartialSummary: true },
          { option: "cancel_group", toolAction: "resolve_barrier", decision: "cancel_parent", requiresUserDecision: true },
          { option: "exit_symphony_mode", toolAction: "resolve_barrier", decision: "fail_parent" },
        ],
        evidenceRefs: [`wait-barrier:${waitBarrier.id}`, `subagent-run:${run.id}`],
      },
      symphonyDecisionOptions: [
        { id: "retry_child", label: "Retry child", recommended: true },
        { id: "accept_partial", label: "Accept partial", recommended: false },
        { id: "cancel_group", label: "Cancel group", recommended: false },
        { id: "exit_symphony_mode", label: "Exit Symphony", recommended: false },
      ],
      allowedUserChoices: expect.arrayContaining([
        expect.objectContaining({ id: "continue_with_partial", requiresPartialSummary: true }),
        expect.objectContaining({ id: "retry_child", decision: "retry_child" }),
        expect.objectContaining({ id: "detach_child", decision: "detach_child" }),
      ]),
      waitBarrier: expect.objectContaining({ id: waitBarrier.id, status: "timed_out" }),
    });
    expect(payload.reason.length).toBeLessThanOrEqual(600);
    expect(payload.reason.endsWith("...")).toBe(true);
    expect(payload.instruction.length).toBeLessThanOrEqual(600);
    expect(payload.waitBarrierEvaluation).toMatchObject({
      timedOut: true,
      terminalEvidence: {
        kind: "child_runtime_timeout",
        childRunId: run.id,
        reason: "runtime_idle_timeout",
      },
      terminalUnsafeChildRunIds: [run.id],
      reason: "required_all barrier timed out with 0/1 synthesis-safe child results.",
    });
    expect(payload.resultValidation).toMatchObject({
      valid: true,
      synthesisAllowed: false,
      partial: false,
      status: "failed",
      reason: expect.stringMatching(/\.\.\.$/),
      completionGuardValidation: { valid: false, reason: "Missing mutation evidence." },
    });
  });

  it("derives Symphony decision reason and evidence from every child in aggregate barriers", () => {
    const childA = childRun({ id: "child-a", status: "cancelled" });
    const childB = childRun({ id: "child-b", status: "failed", symphonyLaunchContracts: symphonyLaunchContracts() });
    const waitBarrier = barrier({
      status: "failed",
      childRunIds: [childA.id, childB.id],
      failurePolicy: "ask_user",
    });
    const resultValidation = validation({
      status: "cancelled",
      synthesisAllowed: false,
      reason: "The waited child was cancelled, but a sibling failed.",
    });
    const waitBarrierEvaluation = evaluateSubagentWaitBarrierForSynthesis({
      barrier: waitBarrier,
      childResults: [
        {
          childRunId: childA.id,
          childThreadId: childA.childThreadId,
          status: "cancelled",
          synthesisAllowed: false,
          partial: false,
          reason: "cancelled by parent",
          resultValidation,
        },
        {
          childRunId: childB.id,
          childThreadId: childB.childThreadId,
          status: "failed",
          synthesisAllowed: false,
          partial: false,
          reason: "tool execution failed",
          resultValidation: validation({ status: "failed", synthesisAllowed: false }),
        },
      ],
    });
    const parentResolution = parentPolicyResolution({
      status: "blocked",
      action: "ask_user",
      canSynthesize: false,
      requiresUserInput: true,
      requiresExplicitPartial: false,
      reason: "One required child failed.",
      instruction: "Ask the user whether to retry, cancel, or exit Symphony.",
      barrierStatus: "failed",
      failurePolicy: "ask_user",
    });

    const draft = buildSubagentWaitBarrierAttentionParentMailboxDraft({
      run: childA,
      waitBarrier,
      waitTimedOut: false,
      resultValidation,
      waitChildRuns: [childA, childB],
      waitBarrierEvaluation,
      parentResolution,
    });
    const payload = draft.parentMailboxInput.payload as Record<string, any>;

    expect(payload.childStatuses).toEqual([
      { childRunId: "child-a", status: "cancelled" },
      { childRunId: "child-b", status: "failed" },
    ]);
    expect(payload.childDecisionRequest).toMatchObject({
      childRunIds: ["child-a", "child-b"],
      reason: "failed",
      recommendedOption: "retry_child",
      evidenceRefs: [
        `wait-barrier:${waitBarrier.id}`,
        "subagent-run:child-a",
        "subagent-run:child-b",
      ],
    });
  });

  it("does not attach Symphony decision requests to ordinary non-Symphony attention drafts", () => {
    const run = childRun({ status: "failed" });
    const waitBarrier = barrier({ status: "failed", failurePolicy: "ask_user" });
    const resultValidation = validation({ status: "failed", synthesisAllowed: false });
    const parentResolution = parentPolicyResolution({
      status: "blocked",
      action: "ask_user",
      canSynthesize: false,
      requiresUserInput: true,
      requiresExplicitPartial: false,
      reason: "Ordinary required child failed.",
      instruction: "Ask the user whether to retry or cancel.",
      barrierStatus: "failed",
      failurePolicy: "ask_user",
    });

    const draft = buildSubagentWaitBarrierAttentionParentMailboxDraft({
      run,
      waitBarrier,
      waitTimedOut: false,
      resultValidation,
      parentResolution,
    });
    const payload = draft.parentMailboxInput.payload as Record<string, unknown>;

    expect(payload).not.toHaveProperty("childDecisionRequest");
    expect(payload).not.toHaveProperty("symphonyDecisionOptions");
  });

  it("does not attach Symphony decision requests to active wait/steer attention drafts", () => {
    const run = childRun({ status: "running" });
    const waitBarrier = barrier({ status: "waiting_on_children", failurePolicy: "ask_user" });
    const resultValidation = validation({ status: "running", synthesisAllowed: false });
    const parentResolution = parentPolicyResolution({
      status: "blocked",
      action: "wait_for_child",
      canSynthesize: false,
      requiresUserInput: false,
      requiresExplicitPartial: false,
      reason: "Child is still running.",
      instruction: "Wait again or send child steering.",
      barrierStatus: "waiting_on_children",
      failurePolicy: "ask_user",
    });

    const draft = buildSubagentWaitBarrierAttentionParentMailboxDraft({
      run,
      waitBarrier,
      waitTimedOut: true,
      resultValidation,
      parentResolution,
    });
    const payload = draft.parentMailboxInput.payload as Record<string, unknown>;

    expect(payload).toMatchObject({
      parentResolution: expect.objectContaining({ action: "wait_for_child" }),
      allowedUserChoices: [
        expect.objectContaining({ id: "wait_again" }),
        expect.objectContaining({ id: "send_child_steering" }),
        expect.objectContaining({ id: "cancel_parent" }),
      ],
    });
    expect(payload).not.toHaveProperty("childDecisionRequest");
    expect(payload).not.toHaveProperty("symphonyDecisionOptions");
  });

  it("filters parent-level barrier actions from background callable workflow attention drafts", () => {
    const run = childRun({ status: "failed" });
    const waitBarrier = barrier({
      status: "failed",
      failurePolicy: "ask_user",
      ownerKind: "callable_workflow_symphony_launch_bridge",
      ownerId: "callable-task-1",
    });
    const resultValidation = validation({ status: "failed", synthesisAllowed: false });
    const parentResolution = parentPolicyResolution({
      status: "blocked",
      action: "ask_user",
      canSynthesize: false,
      requiresUserInput: true,
      requiresExplicitPartial: true,
      reason: "Child failed.",
      instruction: "Retry the child, accept partial evidence, or cancel the workflow task.",
      barrierStatus: "failed",
      failurePolicy: "ask_user",
    });

    const draft = buildSubagentWaitBarrierAttentionParentMailboxDraft({
      run,
      waitBarrier,
      waitTimedOut: false,
      resultValidation,
      parentResolution,
      backgroundCallableWorkflowTask: true,
    });
    const payload = draft.parentMailboxInput.payload as Record<string, any>;

    expect(payload.workflowTaskScopedAttention).toBe(true);
    expect(payload).not.toHaveProperty("childDecisionRequest");
    expect(payload).not.toHaveProperty("symphonyDecisionOptions");
    expect(payload.allowedUserChoices).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "continue_with_partial" }),
      expect.objectContaining({ id: "send_child_steering" }),
      expect.objectContaining({ id: "retry_child" }),
    ]));
    expect(payload.allowedUserChoices).toEqual(expect.not.arrayContaining([
      expect.objectContaining({ id: "detach_child" }),
      expect.objectContaining({ id: "cancel_parent" }),
      expect.objectContaining({ id: "fail_parent" }),
    ]));
  });
});

function childRun(overrides: {
  id?: string;
  parentMessageId?: string;
  childThreadId?: string;
  status?: SubagentRunStatus;
  resultArtifact?: unknown;
  symphonyLaunchContracts?: SubagentRunSummary["symphonyLaunchContracts"];
} = {}): SubagentRunSummary {
  return {
    id: overrides.id ?? "child-run",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    ...(overrides.parentMessageId ? { parentMessageId: overrides.parentMessageId } : {}),
    childThreadId: overrides.childThreadId ?? "child-thread",
    canonicalTaskPath: "root/1:reviewer",
    roleId: "reviewer",
    status: overrides.status ?? "running",
    resultArtifact: overrides.resultArtifact,
    ...(overrides.symphonyLaunchContracts ? { symphonyLaunchContracts: overrides.symphonyLaunchContracts } : {}),
  } as SubagentRunSummary;
}

function symphonyLaunchContracts(): NonNullable<SubagentRunSummary["symphonyLaunchContracts"]> {
  return { schemaVersion: "ambient-symphony-child-launch-contract-bundle-v1" } as NonNullable<SubagentRunSummary["symphonyLaunchContracts"]>;
}

function barrier(overrides: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-run"],
    dependencyMode: "required_all",
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    createdAt: "2026-06-05T12:00:00.000Z",
    updatedAt: "2026-06-05T12:00:00.000Z",
    ...overrides,
  };
}

function validation(overrides: Partial<{
  valid: boolean;
  synthesisAllowed: boolean;
  partial: boolean;
  status: SubagentRunStatus;
  reason: string;
  structuredOutputValidation: Record<string, unknown>;
  completionGuardValidation: Record<string, unknown>;
}> = {}) {
  return {
    valid: overrides.valid ?? true,
    synthesisAllowed: overrides.synthesisAllowed ?? false,
    partial: overrides.partial ?? false,
    ...(overrides.status ? { status: overrides.status } : {}),
    ...(overrides.reason ? { reason: overrides.reason } : {}),
    ...(overrides.structuredOutputValidation ? { structuredOutputValidation: overrides.structuredOutputValidation } : {}),
    ...(overrides.completionGuardValidation ? { completionGuardValidation: overrides.completionGuardValidation } : {}),
  };
}

function parentPolicyResolution(
  overrides: Partial<SubagentParentPolicyResolution> & {
    action: SubagentParentPolicyResolution["action"];
    status: SubagentParentPolicyResolution["status"];
    canSynthesize: boolean;
    requiresUserInput: boolean;
    requiresExplicitPartial: boolean;
  },
): SubagentParentPolicyResolution {
  return {
    schemaVersion: "ambient-subagent-parent-policy-resolution-v1",
    childRunId: "child-run",
    childStatus: "running",
    reason: "Child result is ready.",
    instruction: "You may synthesize from this child result with provenance.",
    ...overrides,
  };
}
