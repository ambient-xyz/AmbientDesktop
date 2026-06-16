import { describe, expect, it, vi } from "vitest";
import { getDefaultSubagentRoleProfile, type SubagentRoleProfile } from "../shared/subagentRoles";
import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../shared/types";
import {
  SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE,
  SUBAGENT_CHILD_APPROVAL_REQUEST_MAILBOX_TYPE,
  SUBAGENT_PARENT_APPROVAL_REQUEST_MAILBOX_TYPE,
} from "./subagentApprovalBridge";
import {
  SUBAGENT_CHILD_SUPERVISOR_REQUEST_MAILBOX_TYPE,
  SUBAGENT_PARENT_SUPERVISOR_REQUEST_MAILBOX_TYPE,
} from "./subagentSupervisorRequest";
import { subagentStructuredResultTemplate } from "./subagentStructuredOutput";
import {
  executeSubagentWaitAgent,
  SUBAGENT_WAIT_AGENT_EXECUTOR_SCHEMA_VERSION,
  type SubagentWaitAgentExecutorStore,
} from "./subagentWaitAgentExecutor";

describe("subagentWaitAgentExecutor", () => {
  it("inspects status without recording wait side effects", async () => {
    const completed = run({ status: "completed", resultArtifact: completedArtifact() });
    const store = new FakeWaitAgentStore([completed]);

    const result = await executeSubagentWaitAgent({
      store,
      action: "status_agent",
      run: completed,
      timeoutMs: 1000,
    });

    expect(SUBAGENT_WAIT_AGENT_EXECUTOR_SCHEMA_VERSION).toBe("ambient-subagent-wait-agent-executor-v1");
    expect(result).toMatchObject({
      action: "status_agent",
      waitTimedOut: false,
      waitSatisfied: true,
      parentSynthesisAllowed: true,
      resultValidation: {
        valid: true,
        synthesisAllowed: true,
        partial: false,
      },
    });
    expect(store.appendSubagentMailboxEvent).not.toHaveBeenCalled();
    expect(store.appendSubagentParentMailboxEvent).not.toHaveBeenCalled();
    expect(store.upsertSubagentGroupedCompletionNotification).not.toHaveBeenCalled();
  });

  it("waits on the latest reservation state without fabricating output when no runtime is attached", async () => {
    const active = run({ status: "running" });
    const barrier = waitBarrier({ status: "waiting_on_children" });
    const store = new FakeWaitAgentStore([active], [barrier]);

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: active,
      waitBarrier: barrier,
      waitChildRuns: [active],
      timeoutMs: 1000,
    });

    expect(result.waitSatisfied).toBe(false);
    expect(result.waitTimedOut).toBe(false);
    expect(result.waitNotice).toBe("No live child executor is attached; wait_agent returns the latest reservation/mailbox state without fabricating a result.");
    expect(result.waitBarrier).toMatchObject({ id: "barrier", status: "waiting_on_children" });
    expect(result.parentResolution).toMatchObject({
      status: "blocked",
      action: "wait_for_child",
      canSynthesize: false,
    });
    expect(result.waitCompletionMailbox).toBeUndefined();
    expect(result.waitBarrierAttentionParentMailbox).toBeUndefined();
    expect(store.appendSubagentMailboxEvent).not.toHaveBeenCalled();
    expect(store.appendSubagentParentMailboxEvent).not.toHaveBeenCalled();
  });

  it("inspects a terminal barrier without attaching to the child runtime or reopening the wait", async () => {
    const active = run({ status: "running" });
    const barrier = waitBarrier({ status: "timed_out" });
    const store = new FakeWaitAgentStore([active], [barrier]);
    const waitForChildRun = vi.fn(async () => ({
      run: active,
      timedOut: false,
    }));

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: active,
      waitBarrier: barrier,
      waitChildRuns: [active],
      timeoutMs: 1000,
      waitForChildRun,
      createRuntimeWaitEventEmitter: () => vi.fn(),
    });

    expect(waitForChildRun).not.toHaveBeenCalled();
    expect(result.waitBarrierTerminalInspection).toBe(true);
    expect(result.waitOutcome).toBeUndefined();
    expect(result.waitTimedOut).toBe(false);
    expect(result.waitSessionExpired).toBe(false);
    expect(result.waitSatisfied).toBe(true);
    expect(result.waitBarrier).toMatchObject({ id: "barrier", status: "timed_out" });
    expect(result.waitNotice).toContain("already-terminal wait barrier");
    expect(result.parentResolution).toMatchObject({
      status: "blocked",
      action: "ask_user",
      canSynthesize: false,
      barrierStatus: "timed_out",
    });
    expect(store.waitBarriers.get("barrier")).toEqual(barrier);
  });

  it("records durable turn-budget wrap-up steering while a required child is still running", async () => {
    const active = run({ status: "running" });
    const barrier = waitBarrier({ status: "waiting_on_children" });
    const store = new FakeWaitAgentStore([active], [barrier]);
    for (let index = 0; index < 7; index += 1) {
      store.appendSubagentRunEvent(active.id, {
        type: "subagent.runtime_event",
        preview: { schemaVersion: "ambient-subagent-runtime-event-v1", type: "started" },
      });
    }

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: active,
      waitBarrier: barrier,
      waitChildRuns: [active],
      timeoutMs: 1000,
    });

    expect(result.waitSatisfied).toBe(false);
    expect(result.waitNotice).toBe("Child is at its turn-budget wrap-up threshold; a wrap-up follow-up is queued for the child and the parent remains blocked until a synthesis-safe result or partial policy resolves.");
    expect(result.turnBudgetState).toMatchObject({
      state: "wrap_up_due",
      observedTurnCount: 7,
      shouldSteerWrapUp: true,
      exhausted: false,
      reason: "wrap_up_turn_reached",
      policy: {
        maxTurns: 8,
        wrapUpAtTurn: 7,
        terminalStatusOnExhaustion: "aborted_partial",
      },
    });
    expect(result.turnBudgetWrapUpSteering).toMatchObject({
      schemaVersion: "ambient-subagent-turn-budget-wrap-up-recorder-v1",
      replay: false,
      mailboxEvent: {
        type: "subagent.followup",
        direction: "parent_to_child",
        deliveryState: "queued",
      },
      runEvent: {
        type: "subagent.followup_agent.queued",
      },
    });
    expect(result.mailboxEvents.map((event) => event.type)).toContain("subagent.followup");
    expect(result.events.map((event) => event.type)).toContain("subagent.followup_agent.queued");
    expect(store.appendSubagentMailboxEvent).toHaveBeenCalledTimes(1);
    expect(store.appendSubagentParentMailboxEvent).not.toHaveBeenCalled();

    const replay = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: active,
      waitBarrier: barrier,
      waitChildRuns: [active],
      timeoutMs: 1000,
    });
    expect(replay.turnBudgetWrapUpSteering).toMatchObject({
      replay: true,
      mailboxEvent: { id: result.turnBudgetWrapUpSteering?.mailboxEvent?.id },
      runEvent: { sequence: result.turnBudgetWrapUpSteering?.runEvent?.sequence },
    });
    expect(store.listSubagentMailboxEvents(active.id).filter((event) => event.type === "subagent.followup")).toHaveLength(1);
  });

  it("delivers turn-budget wrap-up steering to an attached child follow-up runtime", async () => {
    const active = run({ status: "running" });
    const barrier = waitBarrier({ status: "waiting_on_children" });
    const store = new FakeWaitAgentStore([active], [barrier]);
    for (let index = 0; index < 7; index += 1) {
      store.appendSubagentRunEvent(active.id, {
        type: "subagent.runtime_event",
        preview: { schemaVersion: "ambient-subagent-runtime-event-v1", type: "started" },
      });
    }
    const emitEvent = vi.fn((event) => store.appendSubagentRunEvent(active.id, { type: "runtime", preview: event }));
    const followupChildRun = vi.fn(({ run: runtimeRun, mailboxEvent, markMailboxDelivered, markMailboxConsumed, emitEvent: runtimeEmit }) => {
      markMailboxDelivered("2026-06-06T00:01:10.000Z");
      runtimeEmit({
        type: "status",
        source: "followup_agent",
        status: runtimeRun.status,
        message: `Wrap-up follow-up ${mailboxEvent.id} delivered.`,
      });
      const consumed = markMailboxConsumed("2026-06-06T00:01:11.000Z");
      return {
        run: store.getSubagentRun(runtimeRun.id),
        accepted: true,
        mailboxEvent: consumed,
        message: "Runtime accepted wrap-up follow-up.",
      };
    });

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: active,
      waitBarrier: barrier,
      waitChildRuns: [active],
      timeoutMs: 1000,
      followupChildRun,
      createRuntimeWaitEventEmitter: () => emitEvent,
    });

    expect(followupChildRun).toHaveBeenCalledTimes(1);
    expect(followupChildRun).toHaveBeenCalledWith(expect.objectContaining({
      run: active,
      message: expect.stringContaining("Turn-budget wrap-up for root/0:explorer."),
      mailboxEvent: expect.objectContaining({
        type: "subagent.followup",
        deliveryState: "queued",
      }),
      idempotencyKey: expect.stringContaining("subagent:turn-budget-wrap-up:"),
    }));
    expect(result.waitNotice).toBe("Child is at its turn-budget wrap-up threshold; the wrap-up follow-up was delivered to the child runtime and the parent remains blocked until a synthesis-safe result or partial policy resolves.");
    expect(result.turnBudgetWrapUpDelivery).toMatchObject({
      accepted: true,
      message: "Runtime accepted wrap-up follow-up.",
      mailboxEvent: {
        type: "subagent.followup",
        deliveryState: "consumed",
        deliveredAt: "2026-06-06T00:01:10.000Z",
      },
    });
    expect(result.turnBudgetWrapUpSteering).toMatchObject({
      mailboxEvent: {
        type: "subagent.followup",
        deliveryState: "consumed",
        deliveredAt: "2026-06-06T00:01:10.000Z",
      },
    });
    expect(store.updateSubagentMailboxEventDeliveryState).toHaveBeenNthCalledWith(
      1,
      "mailbox-1",
      "delivered",
      { now: "2026-06-06T00:01:10.000Z" },
    );
    expect(store.updateSubagentMailboxEventDeliveryState).toHaveBeenNthCalledWith(
      2,
      "mailbox-1",
      "consumed",
      { now: "2026-06-06T00:01:11.000Z" },
    );
    expect(emitEvent).toHaveBeenCalledWith({
      type: "status",
      source: "followup_agent",
      status: "running",
      message: "Wrap-up follow-up mailbox-1 delivered.",
    });
  });

  it("keeps turn-budget wrap-up steering queued when the runtime cannot accept it yet", async () => {
    const active = run({ status: "running" });
    const barrier = waitBarrier({ status: "waiting_on_children" });
    const store = new FakeWaitAgentStore([active], [barrier]);
    for (let index = 0; index < 7; index += 1) {
      store.appendSubagentRunEvent(active.id, {
        type: "subagent.runtime_event",
        preview: { schemaVersion: "ambient-subagent-runtime-event-v1", type: "started" },
      });
    }
    const followupChildRun = vi.fn(({ run: runtimeRun, mailboxEvent }) => ({
      run: runtimeRun,
      accepted: false,
      mailboxEvent,
      message: "Child runtime is active; the follow-up remains queued for the next idle turn.",
    }));

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: active,
      waitBarrier: barrier,
      waitChildRuns: [active],
      timeoutMs: 1000,
      followupChildRun,
      createRuntimeWaitEventEmitter: () => (event) =>
        store.appendSubagentRunEvent(active.id, { type: "runtime", preview: event }),
    });

    expect(result.waitNotice).toBe("Child is at its turn-budget wrap-up threshold; the wrap-up follow-up remains queued. Child runtime is active; the follow-up remains queued for the next idle turn.");
    expect(result.turnBudgetWrapUpDelivery).toMatchObject({
      accepted: false,
      message: "Child runtime is active; the follow-up remains queued for the next idle turn.",
      mailboxEvent: {
        type: "subagent.followup",
        deliveryState: "queued",
      },
    });
    expect(store.updateSubagentMailboxEventDeliveryState).not.toHaveBeenCalled();
    expect(store.listSubagentMailboxEvents(active.id).filter((event) => event.type === "subagent.followup")).toHaveLength(1);
  });

  it("settles exhausted turn budget as aborted_partial without fabricating synthesis-safe output", async () => {
    const active = run({ status: "running" });
    const barrier = waitBarrier({ status: "waiting_on_children" });
    const store = new FakeWaitAgentStore([active], [barrier]);
    for (let index = 0; index < 8; index += 1) {
      store.appendSubagentRunEvent(active.id, {
        type: "subagent.runtime_event",
        preview: { schemaVersion: "ambient-subagent-runtime-event-v1", type: "completed" },
      });
    }

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: active,
      waitBarrier: barrier,
      waitChildRuns: [active],
      timeoutMs: 1000,
    });

    expect(result.run.status).toBe("aborted_partial");
    expect(result.run.resultArtifact).toMatchObject({
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: active.id,
      status: "aborted_partial",
      partial: true,
      childThreadId: active.childThreadId,
      artifactPath: "ambient://threads/child-thread/transcript",
      summary: expect.stringContaining("8-turn role budget"),
    });
    expect(result.waitSatisfied).toBe(true);
    expect(result.parentSynthesisAllowed).toBe(false);
    expect(result.waitNotice).toBe("Child turn budget is exhausted; child was settled as aborted_partial with the transcript retained at ambient://threads/child-thread/transcript.");
    expect(result.waitBarrier).toMatchObject({
      id: "barrier",
      status: "failed",
      resolutionArtifact: expect.objectContaining({
        synthesisAllowed: false,
        waitBarrierEvaluation: expect.objectContaining({
          impossible: true,
          terminalUnsafeChildRunIds: [active.id],
        }),
      }),
    });
    expect(result.parentResolution).toMatchObject({
      status: "blocked",
      action: "ask_user",
      canSynthesize: false,
      requiresUserInput: true,
    });
    expect(result.resultValidation).toMatchObject({
      synthesisAllowed: false,
      artifactValidation: {
        valid: true,
        synthesisAllowed: true,
        partial: true,
        status: "aborted_partial",
      },
      structuredOutputValidation: {
        valid: false,
        synthesisAllowed: false,
        reason: "Structured sub-agent result JSON is missing or not an object.",
      },
    });
    expect(result.turnBudgetState).toMatchObject({
      state: "exhausted",
      completedTurnCount: 8,
      remainingTurns: 0,
      shouldSteerWrapUp: false,
      exhausted: true,
      reason: "max_turns_exceeded",
      policy: {
        terminalStatusOnExhaustion: "aborted_partial",
        partialAllowed: true,
      },
    });
    expect(result.turnBudgetExhaustionSettlement).toMatchObject({
      schemaVersion: "ambient-subagent-turn-budget-exhaustion-recorder-v1",
      replay: false,
      status: "aborted_partial",
      partial: true,
      artifactPath: "ambient://threads/child-thread/transcript",
      waitBarrierIds: ["barrier"],
      mailboxEvent: {
        direction: "child_to_parent",
        type: "subagent.result",
        deliveryState: "delivered",
      },
      parentMailboxEvent: {
        type: "subagent.lifecycle_interrupted",
      },
      runEvent: {
        type: "subagent.turn_budget_exhausted",
        artifactPath: "ambient://threads/child-thread/transcript",
      },
    });
    expect(result.waitBarrierAttentionParentMailbox).toMatchObject({
      type: "subagent.wait_barrier_attention",
    });
    expect(result.waitCompletionMailbox).toMatchObject({
      type: "subagent.wait_completed",
      direction: "child_to_parent",
      deliveryState: "delivered",
    });
    expect(result.turnBudgetWrapUpSteering).toBeUndefined();
    expect(store.listSubagentMailboxEvents(active.id).filter((event) => event.type === "subagent.followup")).toHaveLength(0);
    expect(store.listSubagentRunEvents(active.id).filter((event) => event.type === "subagent.turn_budget_exhausted")).toHaveLength(1);
    expect(store.appendSubagentParentMailboxEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "subagent.lifecycle_interrupted",
      payload: expect.objectContaining({
        source: "max_turns_exceeded",
        previousStatus: "running",
        status: "aborted_partial",
        waitBarrierIds: ["barrier"],
        resultArtifact: expect.objectContaining({
          status: "aborted_partial",
          partial: true,
          artifactPath: "ambient://threads/child-thread/transcript",
        }),
      }),
    }));

    const replay = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: active,
      waitBarrier: barrier,
      waitChildRuns: [active],
      timeoutMs: 1000,
    });
    expect(replay.turnBudgetExhaustionSettlement).toMatchObject({
      replay: true,
      run: {
        id: active.id,
        status: "aborted_partial",
      },
    });
    expect(store.listSubagentRunEvents(active.id).filter((event) => event.type === "subagent.turn_budget_exhausted")).toHaveLength(1);
    expect(store.listSubagentMailboxEvents(active.id).filter((event) => event.type === "subagent.result")).toHaveLength(1);
  });

  it("settles exhausted turn budget as failed when the role forbids partial output", async () => {
    const reviewerRole = getDefaultSubagentRoleProfile("reviewer");
    const active = run({ status: "running", role: reviewerRole });
    const barrier = waitBarrier({ status: "waiting_on_children" });
    const store = new FakeWaitAgentStore([active], [barrier]);
    for (let index = 0; index < 6; index += 1) {
      store.appendSubagentRunEvent(active.id, {
        type: "subagent.runtime_event",
        preview: { schemaVersion: "ambient-subagent-runtime-event-v1", type: "completed" },
      });
    }

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: active,
      waitBarrier: barrier,
      waitChildRuns: [active],
      timeoutMs: 1000,
    });

    expect(result.run.status).toBe("failed");
    expect(result.run.resultArtifact).toMatchObject({
      status: "failed",
      partial: false,
      childThreadId: active.childThreadId,
      artifactPath: "ambient://threads/child-thread/transcript",
      summary: expect.stringContaining("does not allow partial success"),
    });
    expect(result.waitSatisfied).toBe(true);
    expect(result.parentSynthesisAllowed).toBe(false);
    expect(result.turnBudgetExhaustionSettlement).toMatchObject({
      status: "failed",
      partial: false,
      mailboxEvent: {
        type: "subagent.failed",
        deliveryState: "delivered",
      },
    });
    expect(result.turnBudgetState).toMatchObject({
      state: "exhausted",
      completedTurnCount: 6,
      policy: {
        terminalStatusOnExhaustion: "failed",
        partialAllowed: false,
      },
    });
    expect(result.waitBarrier).toMatchObject({ status: "failed" });
  });

  it("records completed waits after runtime completion and barrier resolution", async () => {
    const active = run({ status: "running" });
    const completed = run({
      status: "completed",
      resultArtifact: completedArtifact(),
      completedAt: "2026-06-06T00:00:10.000Z",
    });
    const barrier = waitBarrier({ status: "waiting_on_children" });
    const store = new FakeWaitAgentStore([active], [barrier]);
    const waitForChildRun = vi.fn(async () => {
      store.setRun(completed);
      return { run: completed, timedOut: false };
    });

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: active,
      waitBarrier: barrier,
      waitChildRuns: [active],
      timeoutMs: 2500,
      explicitIdempotencyKey: "wait:key",
      waitForChildRun,
      createRuntimeWaitEventEmitter: () => (event) =>
        store.appendSubagentRunEvent(completed.id, { type: "runtime", preview: event }),
    });

    expect(waitForChildRun).toHaveBeenCalledWith(expect.objectContaining({
      run: active,
      timeoutMs: 2500,
      emitEvent: expect.any(Function),
    }));
    expect(result.waitSatisfied).toBe(true);
    expect(result.waitTimedOut).toBe(false);
    expect(result.parentSynthesisAllowed).toBe(true);
    expect(result.waitBarrier).toMatchObject({
      id: "barrier",
      status: "satisfied",
      resolutionArtifact: expect.objectContaining({
        schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
        synthesisAllowed: true,
      }),
    });
    expect(result.parentResolution).toMatchObject({
      status: "ready",
      action: "synthesize",
      canSynthesize: true,
    });
    expect(result.waitCompletionMailbox).toMatchObject({
      runId: completed.id,
      type: "subagent.wait_completed",
      deliveryState: "delivered",
      payload: expect.objectContaining({
        idempotencyKey: "wait:key",
        runId: completed.id,
        status: "completed",
        synthesisAllowed: true,
      }),
    });
    expect(result.events.map((event) => event.type)).toContain("subagent.wait_completed");
    expect(result.mailboxEvents.map((event) => event.type)).toContain("subagent.wait_completed");
    expect(store.appendSubagentParentMailboxEvent).not.toHaveBeenCalled();
  });

  it("treats parent wait-window expiry as a progress return without resolving the barrier", async () => {
    const active = run({ status: "running" });
    const barrier = waitBarrier({ status: "waiting_on_children" });
    const store = new FakeWaitAgentStore([active], [barrier]);
    const waitForChildRun = vi.fn(({ run: waitedRun }) => ({
      run: waitedRun,
      timedOut: false,
      outcome: { kind: "progress_return" as const, reason: "parent_wait_window_elapsed" },
    }));

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: active,
      waitBarrier: barrier,
      waitChildRuns: [active],
      timeoutMs: 2500,
      explicitIdempotencyKey: "wait:progress",
      waitForChildRun,
      createRuntimeWaitEventEmitter: () => (event) =>
        store.appendSubagentRunEvent(active.id, { type: "runtime", preview: event }),
    });

    expect(result.waitOutcome).toEqual({ kind: "progress_return", reason: "parent_wait_window_elapsed" });
    expect(result.waitSessionExpired).toBe(true);
    expect(result.waitTimedOut).toBe(false);
    expect(result.waitSatisfied).toBe(false);
    expect(result.parentSynthesisAllowed).toBe(false);
    expect(result.waitNotice).toBe("wait_agent returned a progress update while the child runtime remains active; the parent remains blocked on this child.");
    expect(result.waitBarrier).toMatchObject({
      id: "barrier",
      status: "waiting_on_children",
    });
    expect(result.parentResolution).toMatchObject({
      status: "blocked",
      action: "wait_for_child",
      canSynthesize: false,
      requiresUserInput: false,
    });
    expect(result.waitCompletionMailbox).toBeUndefined();
    expect(result.waitBarrierAttentionParentMailbox).toBeUndefined();
    expect(store.waitBarriers.get("barrier")).toEqual(barrier);
  });

  it("keeps result-contract repair-pending children as active barrier blockers", async () => {
    const active = run({ status: "running" });
    const barrier = waitBarrier({ status: "waiting_on_children" });
    const store = new FakeWaitAgentStore([active], [barrier]);
    store.appendSubagentRunEvent(active.id, {
      type: "subagent.result_contract_followup_required",
      createdAt: "2026-06-06T00:00:06.000Z",
      preview: {
        reason: "Structured result roleId must match child role explorer.",
        hadAssistantText: true,
      },
    });
    store.appendSubagentRunEvent(active.id, {
      type: "subagent.internal_post_tool_followup_started",
      createdAt: "2026-06-06T00:00:07.000Z",
      preview: {
        attempt: 1,
        maxAttempts: 2,
        reason: "Structured result roleId must match child role explorer.",
      },
    });

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: active,
      waitBarrier: barrier,
      waitChildRuns: [active],
      timeoutMs: 2500,
    });

    expect(result.waitSatisfied).toBe(false);
    expect(result.waitBarrier).toMatchObject({ id: "barrier", status: "waiting_on_children" });
    expect(result.parentResolution).toMatchObject({
      status: "blocked",
      action: "wait_for_child",
      canSynthesize: false,
    });
    expect(result.waitBarrierEvaluation).toMatchObject({
      synthesisAllowed: false,
      activeChildRunIds: [active.id],
      terminalUnsafeChildRunIds: [],
    });
    expect(result.waitBarrierBlockers).toEqual([
      expect.objectContaining({
        childRunId: active.id,
        status: "running",
        blockingState: "active",
        lastActivityAt: "2026-06-06T00:00:07.000Z",
        lastActivitySource: "run_event:subagent.internal_post_tool_followup_started",
        resultRepairState: {
          schemaVersion: "ambient-subagent-result-repair-state-v1",
          state: "result_contract_repair_pending",
          reason: "Structured result roleId must match child role explorer.",
          detectedAt: "2026-06-06T00:00:06.000Z",
          eventSequence: 1,
          hadAssistantText: true,
          latestInternalFollowupAt: "2026-06-06T00:00:07.000Z",
          latestInternalFollowupSequence: 2,
          latestInternalFollowupAttempt: 1,
          maxAttempts: 2,
        },
      }),
    ]);
    expect(store.waitBarriers.get("barrier")).toBe(barrier);
  });

  it("treats child runtime timeout as terminal barrier evidence", async () => {
    const active = run({ status: "running" });
    const timedOut = run({ status: "timed_out" });
    const barrier = waitBarrier({ status: "waiting_on_children" });
    const store = new FakeWaitAgentStore([active], [barrier]);
    const waitForChildRun = vi.fn(() => {
      store.setRun(timedOut);
      return {
        run: timedOut,
        timedOut: true,
        outcome: {
          kind: "child_runtime_timeout" as const,
          reason: "runtime_idle_timeout",
          details: {
            lastChildActivityAt: "2026-06-06T00:00:05.000Z",
            lastChildActivitySource: "run_event:subagent.runtime_event",
            childIdleElapsedMs: 600_001,
            childIdleTimeoutMs: 600_000,
          },
        },
      };
    });

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: active,
      waitBarrier: barrier,
      waitChildRuns: [active],
      timeoutMs: 2500,
      explicitIdempotencyKey: "wait:child-timeout",
      waitForChildRun,
      createRuntimeWaitEventEmitter: () => (event) =>
        store.appendSubagentRunEvent(timedOut.id, { type: "runtime", preview: event }),
    });

    expect(result.waitOutcome).toMatchObject({
      kind: "child_runtime_timeout",
      reason: "runtime_idle_timeout",
      details: {
        lastChildActivityAt: "2026-06-06T00:00:05.000Z",
        childIdleElapsedMs: 600_001,
        childIdleTimeoutMs: 600_000,
      },
    });
    expect(result.waitSessionExpired).toBe(false);
    expect(result.waitTimedOut).toBe(true);
    expect(result.waitSatisfied).toBe(true);
    expect(result.parentSynthesisAllowed).toBe(false);
    expect(result.waitNotice).toBe("wait_agent timed out before the child reached a terminal status.");
    expect(result.waitBarrier).toMatchObject({
      id: "barrier",
      status: "timed_out",
      resolutionArtifact: expect.objectContaining({
        schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
        timedOut: true,
        transitionEvidence: expect.objectContaining({
          schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
          kind: "child_runtime_timeout",
          source: "child_runtime",
          childRunId: timedOut.id,
          reason: "runtime_idle_timeout",
          details: {
            lastChildActivityAt: "2026-06-06T00:00:05.000Z",
            lastChildActivitySource: "run_event:subagent.runtime_event",
            childIdleElapsedMs: 600_001,
            childIdleTimeoutMs: 600_000,
          },
        }),
        synthesisAllowed: false,
      }),
    });
    expect(result.parentResolution).toMatchObject({
      status: "blocked",
      action: "ask_user",
      canSynthesize: false,
      requiresUserInput: true,
    });
    expect(result.waitCompletionMailbox).toMatchObject({
      type: "subagent.wait_completed",
      deliveryState: "delivered",
      payload: expect.objectContaining({
        idempotencyKey: "wait:child-timeout",
        waitTimedOut: true,
        status: "timed_out",
        synthesisAllowed: false,
      }),
    });
  });

  it("reports every active required-all blocker instead of only the focused child", async () => {
    const completed = run({
      id: "child-safe",
      status: "completed",
      resultArtifact: completedArtifact("child-safe"),
      completedAt: "2026-06-06T00:00:04.000Z",
    });
    const runningA = run({
      id: "child-running-a",
      status: "running",
      canonicalTaskPath: "root/1:explorer",
    });
    const runningB = run({
      id: "child-running-b",
      status: "running",
      canonicalTaskPath: "root/2:explorer",
    });
    const barrier = waitBarrier({
      status: "waiting_on_children",
      childRunIds: ["child-safe", "child-running-a", "child-running-b"],
    });
    const store = new FakeWaitAgentStore([completed, runningA, runningB], [barrier]);
    store.appendSubagentRunEvent(runningA.id, {
      type: "subagent.runtime_event",
      preview: { type: "assistant_delta" },
      createdAt: "2026-06-06T00:00:05.000Z",
    });
    store.appendSubagentRunEvent(runningB.id, {
      type: "subagent.runtime_event",
      preview: { type: "tool_call" },
      createdAt: "2026-06-06T00:00:07.000Z",
    });

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: runningA,
      waitBarrier: barrier,
      waitChildRuns: [completed, runningA, runningB],
      timeoutMs: 2500,
      waitForChildRun: ({ run: waitedRun }) => ({
        run: waitedRun,
        timedOut: false,
        outcome: { kind: "progress_return", reason: "parent_wait_window_elapsed" },
      }),
      createRuntimeWaitEventEmitter: () => (event) =>
        store.appendSubagentRunEvent(runningA.id, { type: "runtime", preview: event }),
    });

    expect(result.waitSatisfied).toBe(false);
    expect(result.waitBarrier).toMatchObject({ status: "waiting_on_children" });
    expect(result.waitBarrierEvaluation).toMatchObject({
      requiredSynthesisCount: 3,
      validSynthesisCount: 1,
      activeChildRunIds: ["child-running-a", "child-running-b"],
    });
    expect(result.waitBarrierBlockers).toEqual([
      expect.objectContaining({
        childRunId: "child-running-a",
        childThreadId: "child-running-a-thread",
        canonicalTaskPath: "root/1:explorer",
        status: "running",
        blockingState: "active",
        lastActivityAt: "2026-06-06T00:00:05.000Z",
        lastActivitySource: "run_event:subagent.runtime_event",
      }),
      expect.objectContaining({
        childRunId: "child-running-b",
        childThreadId: "child-running-b-thread",
        canonicalTaskPath: "root/2:explorer",
        status: "running",
        blockingState: "active",
        lastActivityAt: "2026-06-06T00:00:07.000Z",
        lastActivitySource: "run_event:subagent.runtime_event",
      }),
    ]);
  });

  it("waits on an active barrier sibling when the focused child is already terminal", async () => {
    const completed = run({
      id: "child-safe",
      status: "completed",
      resultArtifact: completedArtifact("child-safe"),
      completedAt: "2026-06-06T00:00:04.000Z",
    });
    const runningA = run({
      id: "child-running-a",
      status: "running",
      canonicalTaskPath: "root/1:explorer",
    });
    const runningB = run({
      id: "child-running-b",
      status: "running",
      canonicalTaskPath: "root/2:explorer",
    });
    const barrier = waitBarrier({
      status: "waiting_on_children",
      childRunIds: ["child-safe", "child-running-a", "child-running-b"],
    });
    const store = new FakeWaitAgentStore([completed, runningA, runningB], [barrier]);
    const waitForChildRun = vi.fn(({ run: waitedRun }) => ({
      run: waitedRun,
      timedOut: false,
      outcome: { kind: "progress_return" as const, reason: "parent_wait_window_elapsed" },
    }));

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: completed,
      waitBarrier: barrier,
      waitChildRuns: [completed, runningA, runningB],
      timeoutMs: 2500,
      waitForChildRun,
      createRuntimeWaitEventEmitter: () => (event) =>
        store.appendSubagentRunEvent(runningA.id, { type: "runtime", preview: event }),
    });

    expect(waitForChildRun).toHaveBeenCalledWith(expect.objectContaining({
      run: expect.objectContaining({ id: "child-running-a" }),
      timeoutMs: 2500,
    }));
    expect(result.run.id).toBe("child-running-a");
    expect(result.waitChildRuns.map((child) => child.id)).toEqual([
      "child-safe",
      "child-running-a",
      "child-running-b",
    ]);
    expect(result.waitOutcome).toMatchObject({
      kind: "progress_return",
      reason: "parent_wait_window_elapsed",
    });
    expect(result.waitSatisfied).toBe(false);
    expect(result.waitBarrier).toMatchObject({ status: "waiting_on_children" });
    expect(result.waitBarrierEvaluation).toMatchObject({
      requiredSynthesisCount: 3,
      validSynthesisCount: 1,
      activeChildRunIds: ["child-running-a", "child-running-b"],
    });
    expect(store.waitBarriers.get("barrier")).toMatchObject({ status: "waiting_on_children" });
  });

  it("continues waiting across active barrier siblings until required-all is satisfied", async () => {
    const runningA = run({
      id: "child-running-a",
      status: "running",
      canonicalTaskPath: "root/1:explorer",
    });
    const runningB = run({
      id: "child-running-b",
      status: "running",
      canonicalTaskPath: "root/2:explorer",
    });
    const barrier = waitBarrier({
      status: "waiting_on_children",
      childRunIds: ["child-running-a", "child-running-b"],
    });
    const store = new FakeWaitAgentStore([runningA, runningB], [barrier]);
    const waitForChildRun = vi.fn(({ run: waitedRun }) => {
      const completedRun: SubagentRunSummary = {
        ...waitedRun,
        status: "completed",
        completedAt: waitedRun.id === "child-running-a"
          ? "2026-06-06T00:00:05.000Z"
          : "2026-06-06T00:00:06.000Z",
        updatedAt: waitedRun.id === "child-running-a"
          ? "2026-06-06T00:00:05.000Z"
          : "2026-06-06T00:00:06.000Z",
        resultArtifact: completedArtifact(waitedRun.id),
      };
      store.setRun(completedRun);
      store.appendSubagentRunEvent(completedRun.id, {
        type: "subagent.runtime_event",
        preview: { type: "assistant_delta" },
        createdAt: completedRun.completedAt,
      });
      return {
        run: completedRun,
        timedOut: false,
        outcome: { kind: "child_terminal" as const },
      };
    });

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: runningA,
      waitBarrier: barrier,
      waitChildRuns: [runningA, runningB],
      timeoutMs: 2500,
      waitForChildRun,
      createRuntimeWaitEventEmitter: (emittedRun) => (event) =>
        store.appendSubagentRunEvent(emittedRun.id, { type: "runtime", preview: event }),
    });

    expect(waitForChildRun).toHaveBeenCalledTimes(2);
    expect(waitForChildRun).toHaveBeenNthCalledWith(1, expect.objectContaining({
      run: expect.objectContaining({ id: "child-running-a" }),
      timeoutMs: 2500,
    }));
    expect(waitForChildRun).toHaveBeenNthCalledWith(2, expect.objectContaining({
      run: expect.objectContaining({ id: "child-running-b" }),
      timeoutMs: expect.any(Number),
    }));
    const secondTimeout = waitForChildRun.mock.calls[1]?.[0].timeoutMs;
    expect(secondTimeout).toBeGreaterThan(0);
    expect(secondTimeout).toBeLessThanOrEqual(2500);
    expect(result.run.id).toBe("child-running-b");
    expect(result.waitChildRuns.map((child) => [child.id, child.status])).toEqual([
      ["child-running-a", "completed"],
      ["child-running-b", "completed"],
    ]);
    expect(result.waitOutcome).toEqual({ kind: "child_terminal" });
    expect(result.waitSatisfied).toBe(true);
    expect(result.parentSynthesisAllowed).toBe(true);
    expect(result.waitBarrier).toMatchObject({
      id: "barrier",
      status: "satisfied",
      resolutionArtifact: expect.objectContaining({
        synthesisAllowed: true,
        transitionEvidence: expect.objectContaining({
          kind: "child_terminal",
          childRunId: "child-running-b",
        }),
        waitBarrierEvaluation: expect.objectContaining({
          requiredSynthesisCount: 2,
          validSynthesisCount: 2,
          activeChildRunIds: [],
        }),
      }),
    });
    expect(result.waitBarrierBlockers).toEqual([]);
    expect(store.waitBarriers.get("barrier")).toMatchObject({ status: "satisfied" });
  });

  it("records child approval requests and leaves the parent blocked on the child wait barrier", async () => {
    const active = run({ status: "running" });
    const needsAttention = run({ status: "needs_attention" });
    const barrier = waitBarrier({ status: "waiting_on_children" });
    const store = new FakeWaitAgentStore([active], [barrier]);
    const waitForChildRun = vi.fn(async () => {
      store.setRun(needsAttention);
      return {
        run: needsAttention,
        timedOut: false,
        approvalRequests: [{
          approvalId: "approval-child-write",
          title: "Allow child write",
          prompt: "Child needs permission to write in its isolated worktree.",
          requestedToolId: "builtin:write_file",
          requestedToolCategory: "workspace.write",
          requestedScope: "always",
          createdAt: "2026-06-06T00:00:11.000Z",
        }],
      };
    });

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: active,
      waitBarrier: barrier,
      waitChildRuns: [active],
      timeoutMs: 2500,
      waitForChildRun,
      createRuntimeWaitEventEmitter: () => (event) =>
        store.appendSubagentRunEvent(needsAttention.id, { type: "runtime", preview: event }),
    });

    expect(result.run.status).toBe("needs_attention");
    expect(result.waitSatisfied).toBe(false);
    expect(result.parentSynthesisAllowed).toBe(false);
    expect(result.parentResolution).toMatchObject({
      status: "blocked",
      action: "ask_user",
      childRunId: needsAttention.id,
    });
    expect(result.waitNotice).toBe("Child requested approval; parent approval was forwarded to the parent mailbox and the parent remains blocked on this child.");
    expect(result.approvalRequestRecords).toHaveLength(1);
    expect(result.approvalRequestRecords[0]).toMatchObject({
      replay: false,
      childMailboxEvent: {
        type: SUBAGENT_CHILD_APPROVAL_REQUEST_MAILBOX_TYPE,
        deliveryState: "delivered",
        payload: expect.objectContaining({
          childRunId: needsAttention.id,
          childThreadId: needsAttention.childThreadId,
          approvalId: "approval-child-write",
          effectiveScope: "this_child_thread",
          childAlwaysDefaulted: true,
          parentBlockingState: expect.objectContaining({
            action: "forward_child_approval_then_wait",
            resumeParentBlocking: true,
            waitBarrierId: barrier.id,
          }),
        }),
      },
      parentMailboxEvent: {
        type: SUBAGENT_PARENT_APPROVAL_REQUEST_MAILBOX_TYPE,
        deliveryState: "queued",
        payload: expect.objectContaining({
          childRunId: needsAttention.id,
          approvalId: "approval-child-write",
          instruction: expect.stringContaining("return the parent to waiting on this child"),
        }),
      },
      runEvent: {
        type: SUBAGENT_CHILD_APPROVAL_REQUEST_MAILBOX_TYPE,
        preview: expect.objectContaining({
          approvalId: "approval-child-write",
          resumeParentBlocking: true,
          childMailboxEventId: "mailbox-1",
          parentMailboxEventId: "parent-mailbox-1",
        }),
      },
    });
    expect(result.waitCompletionMailbox).toMatchObject({
      type: "subagent.wait_completed",
      deliveryState: "delivered",
      payload: expect.objectContaining({
        status: "needs_attention",
        synthesisAllowed: false,
      }),
    });
    expect(result.waitBarrierAttentionParentMailbox).toMatchObject({
      type: "subagent.wait_barrier_attention",
      deliveryState: "queued",
      payload: expect.objectContaining({
        childRunId: needsAttention.id,
        parentResolution: expect.objectContaining({ action: "ask_user" }),
      }),
    });
  });

  it("records child supervisor requests without treating them as child completion", async () => {
    const active = run({ status: "running" });
    const needsAttention = run({ status: "needs_attention" });
    const barrier = waitBarrier({ status: "waiting_on_children" });
    const store = new FakeWaitAgentStore([active], [barrier]);
    const waitForChildRun = vi.fn(async () => {
      store.setRun(needsAttention);
      return {
        run: needsAttention,
        timedOut: false,
        supervisorRequests: [{
          kind: "need_decision" as const,
          title: "Choose source strategy",
          message: "The child can continue with docs only or inspect source before summarizing.",
          requestedChoices: [
            { id: "docs-only", label: "Docs only", description: "Use the existing docs corpus." },
            { id: "inspect-source", label: "Inspect source", description: "Read code before synthesizing." },
          ],
          createdAt: "2026-06-06T00:00:12.000Z",
        }],
      };
    });

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: active,
      waitBarrier: barrier,
      waitChildRuns: [active],
      timeoutMs: 2500,
      waitForChildRun,
      createRuntimeWaitEventEmitter: () => (event) =>
        store.appendSubagentRunEvent(needsAttention.id, { type: "runtime", preview: event }),
    });

    expect(result.run.status).toBe("needs_attention");
    expect(result.waitSatisfied).toBe(false);
    expect(result.parentSynthesisAllowed).toBe(false);
    expect(result.waitNotice).toBe("Child requested supervisor attention; parent mailbox records the request and the parent remains blocked until the child is synthesis-safe.");
    expect(result.supervisorRequestRecords).toHaveLength(1);
    expect(result.supervisorRequestRecords[0]).toMatchObject({
      replay: false,
      parentRequiresAttention: true,
      childMailboxEvent: {
        type: SUBAGENT_CHILD_SUPERVISOR_REQUEST_MAILBOX_TYPE,
        deliveryState: "delivered",
        payload: expect.objectContaining({
          childRunId: needsAttention.id,
          childThreadId: needsAttention.childThreadId,
          kind: "need_decision",
          title: "Choose source strategy",
          parentRequiresAttention: true,
          marksChildComplete: false,
          parentBlockingState: expect.objectContaining({
            action: "answer_child_request_then_wait",
            resumeParentBlocking: true,
            completionStatus: "not_complete",
          }),
        }),
      },
      parentMailboxEvent: {
        type: SUBAGENT_PARENT_SUPERVISOR_REQUEST_MAILBOX_TYPE,
        deliveryState: "queued",
        payload: expect.objectContaining({
          childRunId: needsAttention.id,
          kind: "need_decision",
          instruction: expect.stringContaining("return the parent to waiting on this child"),
          requestedChoices: [
            { id: "docs-only", label: "Docs only", description: "Use the existing docs corpus." },
            { id: "inspect-source", label: "Inspect source", description: "Read code before synthesizing." },
          ],
        }),
      },
      runEvent: {
        type: SUBAGENT_CHILD_SUPERVISOR_REQUEST_MAILBOX_TYPE,
        preview: expect.objectContaining({
          kind: "need_decision",
          resumeParentBlocking: true,
          completionStatus: "not_complete",
          childMailboxEventId: "mailbox-1",
          parentMailboxEventId: "parent-mailbox-1",
        }),
      },
    });
    expect(result.waitCompletionMailbox).toMatchObject({
      type: "subagent.wait_completed",
      deliveryState: "delivered",
      payload: expect.objectContaining({
        status: "needs_attention",
        synthesisAllowed: false,
      }),
    });
  });

  it("delivers queued approval responses to the child runtime before waiting again", async () => {
    const needsAttention = run({ status: "needs_attention" });
    const running = run({ status: "running" });
    const barrier = waitBarrier({ status: "waiting_on_children" });
    const store = new FakeWaitAgentStore([needsAttention], [barrier]);
    store.mailboxEvents.set(needsAttention.id, [
      approvalResponseMailbox({
        payload: {
          schemaVersion: "ambient-subagent-approval-bridge-v1",
          idempotencyKey: "approval-response:key",
          childRunId: needsAttention.id,
          childThreadId: needsAttention.childThreadId,
          approvalId: "approval-child-write",
          decision: "approved",
          effectiveScope: "this_child_thread",
          resumeParentBlocking: true,
        },
      }),
    ]);
    const emitEvent = vi.fn((event) => store.appendSubagentRunEvent(needsAttention.id, { type: "runtime", preview: event }));
    const createRuntimeWaitEventEmitter = vi.fn(() => emitEvent);
    const resolveChildApprovalResponse = vi.fn(({ run: currentRun, mailboxEvent, markMailboxDelivered, markMailboxConsumed, emitEvent: runtimeEmit }) => {
      markMailboxDelivered("2026-06-06T00:01:00.000Z");
      runtimeEmit({
        type: "status",
        source: "approval_response",
        status: "running",
        message: `Approval ${mailboxEvent.id} delivered back to child runtime.`,
      });
      const consumed = markMailboxConsumed("2026-06-06T00:01:01.000Z");
      store.setRun(running);
      return {
        run: store.getSubagentRun(currentRun.id),
        accepted: true,
        mailboxEvent: consumed,
        message: "Runtime resumed child approval waiter.",
      };
    });
    const waitForChildRun = vi.fn(({ run: waitedRun }) => ({
      run: waitedRun,
      timedOut: true,
    }));

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: needsAttention,
      waitBarrier: barrier,
      waitChildRuns: [needsAttention],
      timeoutMs: 2500,
      waitForChildRun,
      resolveChildApprovalResponse,
      createRuntimeWaitEventEmitter,
    });

    expect(resolveChildApprovalResponse).toHaveBeenCalledWith(expect.objectContaining({
      run: needsAttention,
      mailboxEvent: expect.objectContaining({
        id: "mailbox-approval-response",
        type: SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE,
        deliveryState: "queued",
      }),
      approvalId: "approval-child-write",
      decision: "approved",
      effectiveScope: "this_child_thread",
      idempotencyKey: "approval-response:key",
      emitEvent,
    }));
    expect(waitForChildRun).toHaveBeenCalledWith(expect.objectContaining({
      run: expect.objectContaining({ status: "running" }),
      timeoutMs: 2500,
    }));
    expect(store.updateSubagentMailboxEventDeliveryState).toHaveBeenNthCalledWith(
      1,
      "mailbox-approval-response",
      "delivered",
      { now: "2026-06-06T00:01:00.000Z" },
    );
    expect(store.updateSubagentMailboxEventDeliveryState).toHaveBeenNthCalledWith(
      2,
      "mailbox-approval-response",
      "consumed",
      { now: "2026-06-06T00:01:01.000Z" },
    );
    expect(result.approvalResponseDeliveries).toEqual([
      expect.objectContaining({
        accepted: true,
        message: "Runtime resumed child approval waiter.",
        mailboxEvent: expect.objectContaining({
          type: SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE,
          deliveryState: "consumed",
          deliveredAt: "2026-06-06T00:01:00.000Z",
        }),
      }),
    ]);
    expect(result.approvalResponsePendingEvents).toEqual([]);
    expect(result.waitNotice).toBe("Child approval response was delivered to the child runtime; the parent remains blocked until the child reaches a synthesis-safe result.");
    expect(result.waitTimedOut).toBe(true);
    expect(result.waitBarrier).toMatchObject({
      status: "waiting_on_children",
    });
    expect(result.parentResolution).toMatchObject({
      action: "wait_for_child",
      canSynthesize: false,
      requiresUserInput: false,
    });
    expect(emitEvent).toHaveBeenCalledWith({
      type: "status",
      source: "approval_response",
      status: "running",
      message: "Approval mailbox-approval-response delivered back to child runtime.",
    });
  });

  it("leaves approval responses queued when no child approval-response resolver is attached", async () => {
    const needsAttention = run({ status: "needs_attention" });
    const barrier = waitBarrier({ status: "waiting_on_children" });
    const store = new FakeWaitAgentStore([needsAttention], [barrier]);
    const queued = approvalResponseMailbox();
    store.mailboxEvents.set(needsAttention.id, [queued]);

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: needsAttention,
      waitBarrier: barrier,
      waitChildRuns: [needsAttention],
      timeoutMs: 2500,
      waitForChildRun: ({ run: waitedRun }) => ({ run: waitedRun, timedOut: false }),
      createRuntimeWaitEventEmitter: () => (event) =>
        store.appendSubagentRunEvent(needsAttention.id, { type: "runtime", preview: event }),
    });

    expect(result.approvalResponseDeliveries).toEqual([]);
    expect(result.approvalResponsePendingEvents).toEqual([queued]);
    expect(result.waitNotice).toBe("Child approval response is queued, but no live child approval-response runtime is attached; parent remains blocked on this child.");
    expect(store.updateSubagentMailboxEventDeliveryState).not.toHaveBeenCalled();
  });

  it("refuses approval responses whose payload does not match the target child identity", async () => {
    const needsAttention = run({ status: "needs_attention" });
    const barrier = waitBarrier({ status: "waiting_on_children" });
    const store = new FakeWaitAgentStore([needsAttention], [barrier]);
    const mismatched = approvalResponseMailbox({
      payload: {
        schemaVersion: "ambient-subagent-approval-bridge-v1",
        idempotencyKey: "approval-response:mismatched-child",
        childRunId: "other-child-run",
        childThreadId: needsAttention.childThreadId,
        approvalId: "approval-child-write",
        decision: "approved",
        effectiveScope: "this_child_thread",
        resumeParentBlocking: true,
      },
    });
    store.mailboxEvents.set(needsAttention.id, [mismatched]);
    const resolveChildApprovalResponse = vi.fn();

    const result = await executeSubagentWaitAgent({
      store,
      action: "wait_agent",
      run: needsAttention,
      waitBarrier: barrier,
      waitChildRuns: [needsAttention],
      timeoutMs: 2500,
      waitForChildRun: ({ run: waitedRun }) => ({ run: waitedRun, timedOut: false }),
      resolveChildApprovalResponse,
      createRuntimeWaitEventEmitter: () => (event) =>
        store.appendSubagentRunEvent(needsAttention.id, { type: "runtime", preview: event }),
    });

    expect(resolveChildApprovalResponse).not.toHaveBeenCalled();
    expect(result.approvalResponseDeliveries).toEqual([
      expect.objectContaining({
        accepted: false,
        mailboxEvent: expect.objectContaining({
          id: mismatched.id,
          deliveryState: "failed",
        }),
        message: "Child approval response payload was malformed and could not be delivered.",
      }),
    ]);
    expect(store.listSubagentRunEvents(needsAttention.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "subagent.approval_response.delivery_failed",
        preview: expect.objectContaining({
          mailboxEventId: mismatched.id,
          reason: "malformed_approval_response_payload",
        }),
      }),
    ]));
  });
});

class FakeWaitAgentStore implements SubagentWaitAgentExecutorStore {
  readonly runs = new Map<string, SubagentRunSummary>();
  readonly runEvents = new Map<string, SubagentRunEventSummary[]>();
  readonly mailboxEvents = new Map<string, SubagentMailboxEventSummary[]>();
  readonly waitBarriers = new Map<string, SubagentWaitBarrierSummary>();

  readonly appendSubagentMailboxEvent = vi.fn((
    runId: string,
    input: {
      direction: "parent_to_child" | "child_to_parent";
      type: string;
      payload: unknown;
      deliveryState?: SubagentMailboxDeliveryState;
      createdAt?: string;
      deliveredAt?: string;
    },
  ): SubagentMailboxEventSummary => {
    const events = this.mailboxEvents.get(runId) ?? [];
    const createdAt = input.createdAt ?? "2026-06-06T00:00:20.000Z";
    const event: SubagentMailboxEventSummary = {
      id: `mailbox-${events.length + 1}`,
      runId,
      direction: input.direction,
      type: input.type,
      payload: input.payload,
      deliveryState: input.deliveryState ?? "queued",
      createdAt,
      ...(input.deliveredAt ? { deliveredAt: input.deliveredAt } : {}),
    };
    events.push(event);
    this.mailboxEvents.set(runId, events);
    return event;
  });

  readonly appendSubagentParentMailboxEvent = vi.fn((input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    type: string;
    payload: unknown;
    deliveryState?: "queued" | "delivered" | "consumed" | "failed" | "cancelled";
    idempotencyKey?: string;
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentParentMailboxEventSummary => ({
    id: "parent-mailbox-1",
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    type: input.type,
    payload: input.payload,
    deliveryState: input.deliveryState ?? "queued",
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    createdAt: input.createdAt ?? "2026-06-06T00:00:30.000Z",
    updatedAt: input.createdAt ?? "2026-06-06T00:00:30.000Z",
    ...(input.deliveredAt ? { deliveredAt: input.deliveredAt } : {}),
  }));

  readonly upsertSubagentGroupedCompletionNotification = vi.fn((input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    child: {
      runId: string;
      childThreadId: string;
      canonicalTaskPath: string;
      roleId: string;
      status: SubagentRunSummary["status"];
      summary: string;
      completedAt?: string;
    };
    createdAt?: string;
  }): SubagentParentMailboxEventSummary => ({
    id: "grouped-1",
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    type: "subagent.grouped_completion",
    payload: input,
    deliveryState: "queued",
    createdAt: input.createdAt ?? "2026-06-06T00:00:40.000Z",
    updatedAt: input.createdAt ?? "2026-06-06T00:00:40.000Z",
  }));

  constructor(runs: SubagentRunSummary[], barriers: SubagentWaitBarrierSummary[] = []) {
    for (const childRun of runs) this.setRun(childRun);
    for (const barrier of barriers) this.waitBarriers.set(barrier.id, barrier);
  }

  setRun(run: SubagentRunSummary): void {
    this.runs.set(run.id, run);
    if (!this.runEvents.has(run.id)) this.runEvents.set(run.id, []);
    if (!this.mailboxEvents.has(run.id)) this.mailboxEvents.set(run.id, []);
  }

  getSubagentRun(runId: string): SubagentRunSummary {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Unknown run: ${runId}`);
    return run;
  }

  markSubagentRunStatus(
    runId: string,
    status: SubagentRunSummary["status"],
    options?: { resultArtifact?: unknown; now?: string },
  ): SubagentRunSummary {
    const current = this.getSubagentRun(runId);
    const now = options?.now ?? "2026-06-06T00:00:25.000Z";
    const terminal = ["completed", "failed", "stopped", "cancelled", "timed_out", "detached", "aborted_partial"].includes(status);
    const updated: SubagentRunSummary = {
      ...current,
      status,
      updatedAt: now,
      ...(current.startedAt || ["starting", "running", "waiting"].includes(status)
        ? { startedAt: current.startedAt ?? now }
        : {}),
      ...(terminal ? { completedAt: current.completedAt ?? now, closedAt: current.closedAt ?? now } : {}),
      ...(options?.resultArtifact !== undefined ? { resultArtifact: options.resultArtifact } : {}),
    };
    this.runs.set(runId, updated);
    this.appendSubagentRunEvent(runId, {
      type: "subagent.status_changed",
      preview: { status },
      createdAt: now,
    });
    if (terminal) {
      this.appendSubagentRunEvent(runId, {
        type: "subagent.lifecycle_stopped",
        preview: {
          hook: "SubagentStop",
          runId,
          status,
          finalStatus: status,
        },
        createdAt: now,
      });
      this.appendSubagentRunEvent(runId, {
        type: "subagent.lifecycle_closed",
        preview: {
          hook: "SubagentClose",
          runId,
          status,
        },
        createdAt: now,
      });
    }
    return updated;
  }

  listSubagentRunEvents(runId: string): SubagentRunEventSummary[] {
    return [...(this.runEvents.get(runId) ?? [])];
  }

  listSubagentMailboxEvents(runId: string): SubagentMailboxEventSummary[] {
    return [...(this.mailboxEvents.get(runId) ?? [])];
  }

  listSubagentWaitBarriersForParentRun(parentRunId: string): SubagentWaitBarrierSummary[] {
    return [...this.waitBarriers.values()].filter((barrier) => barrier.parentRunId === parentRunId);
  }

  updateSubagentWaitBarrierStatus(
    id: string,
    status: SubagentWaitBarrierSummary["status"],
    options?: { resolutionArtifact?: unknown; now?: string },
  ): SubagentWaitBarrierSummary {
    const current = this.waitBarriers.get(id);
    if (!current) throw new Error(`Unknown wait barrier: ${id}`);
    const updated: SubagentWaitBarrierSummary = {
      ...current,
      status,
      updatedAt: options?.now ?? "2026-06-06T00:00:15.000Z",
      ...(status !== "waiting_on_children" ? { resolvedAt: options?.now ?? "2026-06-06T00:00:15.000Z" } : {}),
      ...(options?.resolutionArtifact ? { resolutionArtifact: options.resolutionArtifact } : {}),
    };
    this.waitBarriers.set(id, updated);
    return updated;
  }

  appendSubagentRunEvent(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary {
    const events = this.runEvents.get(runId) ?? [];
    const event: SubagentRunEventSummary = {
      runId,
      sequence: events.length + 1,
      type: input.type,
      createdAt: input.createdAt ?? "2026-06-06T00:00:20.000Z",
      ...(input.preview !== undefined ? { preview: input.preview } : {}),
      ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
    };
    events.push(event);
    this.runEvents.set(runId, events);
    return event;
  }

  readonly updateSubagentMailboxEventDeliveryState = vi.fn((
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: { now?: string; deliveredAt?: string | null },
  ): SubagentMailboxEventSummary => {
    for (const [runId, events] of this.mailboxEvents.entries()) {
      const index = events.findIndex((event) => event.id === id);
      if (index < 0) continue;
      const current = events[index];
      const updated: SubagentMailboxEventSummary = {
        ...current,
        deliveryState,
        deliveredAt: deliveryState === "delivered"
          ? options?.deliveredAt ?? options?.now ?? current.deliveredAt
          : current.deliveredAt,
      };
      events[index] = updated;
      this.mailboxEvents.set(runId, events);
      return updated;
    }
    throw new Error(`Unknown mailbox event: ${id}`);
  });
}

const explorerRole = getDefaultSubagentRoleProfile("explorer");

function run(input: {
  id?: string;
  status: SubagentRunSummary["status"];
  resultArtifact?: unknown;
  dependencyMode?: SubagentRunSummary["dependencyMode"];
  completedAt?: string;
  role?: SubagentRoleProfile;
  childThreadId?: string;
  canonicalTaskPath?: string;
}): SubagentRunSummary {
  const role = input.role ?? explorerRole;
  const id = input.id ?? "child-run";
  const childThreadId = input.childThreadId ?? (id === "child-run" ? "child-thread" : `${id}-thread`);
  return {
    id,
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "assistant-message",
    childThreadId,
    canonicalTaskPath: input.canonicalTaskPath ?? `root/0:${role.id}`,
    roleId: role.id,
    roleProfileSnapshot: role,
    roleProfileSnapshotSource: "resolved",
    dependencyMode: input.dependencyMode ?? "required",
    status: input.status,
    featureFlagSnapshot: { subagents: true },
    modelRuntimeSnapshot: { modelId: "glm-5.1" },
    capacityLeaseSnapshot: { status: "reserved" },
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    ...(input.completedAt ? { completedAt: input.completedAt } : {}),
    ...(input.resultArtifact ? { resultArtifact: input.resultArtifact } : {}),
  } as unknown as SubagentRunSummary;
}

function waitBarrier(input: {
  status: SubagentWaitBarrierSummary["status"];
  childRunIds?: string[];
}): SubagentWaitBarrierSummary {
  return {
    id: "barrier",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: input.childRunIds ?? ["child-run"],
    dependencyMode: "required_all",
    status: input.status,
    failurePolicy: "ask_user",
    timeoutMs: 60_000,
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
  };
}

function completedArtifact(runId = "child-run"): Record<string, unknown> {
  const structuredOutput = subagentStructuredResultTemplate(explorerRole);
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId,
    status: "completed",
    partial: false,
    summary: "Child result is ready.",
    childThreadId: runId === "child-run" ? "child-thread" : `${runId}-thread`,
    structuredOutput: {
      ...structuredOutput,
      summary: "Child result is ready.",
      evidence: ["executor test"],
      roleOutput: {
        findings: [{ summary: "Child result is ready.", provenance: ["executor test"] }],
        openQuestions: [],
      },
    },
  };
}

function approvalResponseMailbox(overrides: Partial<SubagentMailboxEventSummary> = {}): SubagentMailboxEventSummary {
  return {
    id: "mailbox-approval-response",
    runId: "child-run",
    direction: "parent_to_child",
    type: SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE,
    payload: {
      schemaVersion: "ambient-subagent-approval-bridge-v1",
      idempotencyKey: "approval-response:key",
      childRunId: "child-run",
      childThreadId: "child-thread",
      approvalId: "approval-child-write",
      decision: "approved",
      effectiveScope: "this_child_thread",
      resumeParentBlocking: true,
    },
    deliveryState: "queued",
    createdAt: "2026-06-06T00:00:45.000Z",
    ...overrides,
  };
}
