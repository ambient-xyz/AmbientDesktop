import { describe, expect, it } from "vitest";

import type { SendMessageInput } from "../../shared/desktopTypes";
import { createRuntimeSendPendingFollowUps } from "./runtimeSendPendingFollowUps";

const followUp = (content: string): SendMessageInput => ({
  threadId: "thread-1",
  content,
  permissionMode: "full-access",
  collaborationMode: "agent",
  model: "ambient-preview",
  thinkingLevel: "medium",
  delivery: "follow-up",
  context: [],
});

describe("createRuntimeSendPendingFollowUps", () => {
  it("starts with only the configured empty-response retry delay", () => {
    const state = createRuntimeSendPendingFollowUps({ emptyResponseRetryDelayMs: 25 });

    expect(state.pendingEmptyResponseRetryDelayMs()).toBe(25);
    expect(state.snapshot()).toEqual({
      pendingPlannerRepairFollowUp: undefined,
      pendingEmptyResponseRetry: undefined,
      pendingInterruptedToolCallRecoveryFollowUp: undefined,
      pendingProviderInterruptionContinuation: undefined,
      pendingEmptyResponseRetryDelayMs: 25,
    });
  });

  it("applies successful prompt follow-ups", () => {
    const state = createRuntimeSendPendingFollowUps({ emptyResponseRetryDelayMs: 0 });
    const plannerRepair = followUp("planner repair");
    const emptyRetry = followUp("empty retry");

    state.applyPromptSuccess({
      pendingPlannerRepairFollowUp: plannerRepair,
      pendingEmptyResponseRetry: emptyRetry,
    });

    expect(state.snapshot()).toMatchObject({
      pendingPlannerRepairFollowUp: plannerRepair,
      pendingEmptyResponseRetry: emptyRetry,
    });
  });

  it("tracks failure follow-ups and provider continuation clearing", () => {
    const state = createRuntimeSendPendingFollowUps({ emptyResponseRetryDelayMs: 0 });
    const emptyRetry = followUp("empty retry");
    const interruptedRecovery = followUp("interrupted recovery");
    const providerContinuation = followUp("provider continuation");

    state.setPendingEmptyResponseRetry(emptyRetry);
    state.setPendingInterruptedToolCallRecoveryFollowUp(interruptedRecovery);
    state.setPendingProviderInterruptionContinuation(providerContinuation);
    expect(state.snapshot()).toMatchObject({
      pendingEmptyResponseRetry: emptyRetry,
      pendingInterruptedToolCallRecoveryFollowUp: interruptedRecovery,
      pendingProviderInterruptionContinuation: providerContinuation,
    });

    state.setPendingProviderInterruptionContinuation(undefined);
    expect(state.snapshot().pendingProviderInterruptionContinuation).toBeUndefined();
  });

  it("lets prompt success replace only the success-owned follow-ups", () => {
    const state = createRuntimeSendPendingFollowUps({ emptyResponseRetryDelayMs: 5 });
    const interruptedRecovery = followUp("interrupted recovery");
    state.setPendingInterruptedToolCallRecoveryFollowUp(interruptedRecovery);

    state.applyPromptSuccess({
      pendingPlannerRepairFollowUp: followUp("planner repair"),
    });

    expect(state.snapshot()).toMatchObject({
      pendingPlannerRepairFollowUp: expect.objectContaining({ content: "planner repair" }),
      pendingEmptyResponseRetry: undefined,
      pendingInterruptedToolCallRecoveryFollowUp: interruptedRecovery,
      pendingEmptyResponseRetryDelayMs: 5,
    });
  });
});
