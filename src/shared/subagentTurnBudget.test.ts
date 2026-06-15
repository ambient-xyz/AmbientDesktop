import { describe, expect, it } from "vitest";
import { getDefaultSubagentRoleProfile } from "./subagentRoles";
import {
  compactSubagentTurnBudgetStateForPi,
  compactSubagentTurnBudgetPolicyForPi,
  evaluateSubagentTurnBudgetForEvents,
  resolveSubagentTurnBudgetPolicy,
  SUBAGENT_TURN_BUDGET_POLICY_SCHEMA_VERSION,
} from "./subagentTurnBudget";
import type { SubagentRunEventSummary } from "./types";

describe("subagentTurnBudget", () => {
  it("derives wrap-up and partial exhaustion policy from role guard limits", () => {
    expect(resolveSubagentTurnBudgetPolicy(getDefaultSubagentRoleProfile("explorer"))).toEqual({
      schemaVersion: SUBAGENT_TURN_BUDGET_POLICY_SCHEMA_VERSION,
      roleId: "explorer",
      maxTurns: 8,
      wrapUpAtTurn: 7,
      graceTurns: 1,
      wrapUpMode: "single_steer_then_grace",
      exhaustionReason: "max_turns_exceeded",
      terminalStatusOnExhaustion: "aborted_partial",
      partialAllowed: true,
      transcriptRetained: true,
    });
  });

  it("fails strict roles on max-turn exhaustion instead of allowing partial synthesis", () => {
    expect(resolveSubagentTurnBudgetPolicy(getDefaultSubagentRoleProfile("reviewer"))).toMatchObject({
      roleId: "reviewer",
      maxTurns: 6,
      wrapUpAtTurn: 5,
      graceTurns: 1,
      terminalStatusOnExhaustion: "failed",
      partialAllowed: false,
    });
  });

  it("normalizes invalid role limits to a one-turn hard budget", () => {
    const role = {
      ...getDefaultSubagentRoleProfile("summarizer"),
      guardPolicy: {
        ...getDefaultSubagentRoleProfile("summarizer").guardPolicy,
        maxTurns: 0,
      },
    };

    expect(resolveSubagentTurnBudgetPolicy(role)).toMatchObject({
      maxTurns: 1,
      wrapUpAtTurn: 1,
      graceTurns: 0,
    });
  });

  it("compacts the policy for Pi-visible launch evidence", () => {
    const policy = resolveSubagentTurnBudgetPolicy(getDefaultSubagentRoleProfile("worker"));

    expect(compactSubagentTurnBudgetPolicyForPi(policy)).toEqual({
      schemaVersion: SUBAGENT_TURN_BUDGET_POLICY_SCHEMA_VERSION,
      roleId: "worker",
      maxTurns: 12,
      wrapUpAtTurn: 11,
      graceTurns: 1,
      wrapUpMode: "single_steer_then_grace",
      exhaustionReason: "max_turns_exceeded",
      terminalStatusOnExhaustion: "failed",
      partialAllowed: false,
      transcriptRetained: true,
    });
  });

  it("keeps active children within budget before the wrap-up turn", () => {
    expect(evaluateSubagentTurnBudgetForEvents({
      role: getDefaultSubagentRoleProfile("explorer"),
      events: [
        runtimeEvent(1, "started"),
        runtimeEvent(2, "completed"),
        runtimeEvent(3, "started"),
        runtimeEvent(4, "completed"),
      ],
    })).toMatchObject({
      startedTurnCount: 2,
      completedTurnCount: 2,
      observedTurnCount: 2,
      remainingTurns: 6,
      state: "within_budget",
      shouldSteerWrapUp: false,
      exhausted: false,
    });
  });

  it("signals wrap-up once observed turns reach the role wrap-up threshold", () => {
    const events = Array.from({ length: 7 }, (_, index) => runtimeEvent(index + 1, "started"));

    expect(compactSubagentTurnBudgetStateForPi(evaluateSubagentTurnBudgetForEvents({
      role: getDefaultSubagentRoleProfile("explorer"),
      events,
    }))).toMatchObject({
      schemaVersion: "ambient-subagent-turn-budget-state-v1",
      policy: {
        schemaVersion: SUBAGENT_TURN_BUDGET_POLICY_SCHEMA_VERSION,
        roleId: "explorer",
        maxTurns: 8,
        wrapUpAtTurn: 7,
      },
      startedTurnCount: 7,
      completedTurnCount: 0,
      observedTurnCount: 7,
      remainingTurns: 8,
      state: "wrap_up_due",
      shouldSteerWrapUp: true,
      exhausted: false,
      reason: "wrap_up_turn_reached",
      instruction: expect.stringContaining("schema-valid result"),
    });
  });

  it("reports exhausted budgets from completed turns and preserves partial policy", () => {
    const events = Array.from({ length: 4 }, (_, index) => ({
      runId: "child-run",
      sequence: index + 1,
      type: "subagent.runtime_event",
      createdAt: "2026-06-07T00:00:00.000Z",
      preview: {
        schemaVersion: "ambient-subagent-runtime-event-v1",
        type: "completed",
      },
    } as SubagentRunEventSummary));

    expect(evaluateSubagentTurnBudgetForEvents({
      role: getDefaultSubagentRoleProfile("summarizer"),
      events,
    })).toMatchObject({
      completedTurnCount: 4,
      observedTurnCount: 4,
      remainingTurns: 0,
      state: "exhausted",
      shouldSteerWrapUp: false,
      exhausted: true,
      reason: "max_turns_exceeded",
      policy: {
        terminalStatusOnExhaustion: "aborted_partial",
        partialAllowed: true,
      },
    });
  });
});

function runtimeEvent(sequence: number, type: "started" | "completed"): SubagentRunEventSummary {
  return {
    runId: "child-run",
    sequence,
    type: "subagent.runtime_event",
    createdAt: "2026-06-07T00:00:00.000Z",
    preview: {
      event: {
        schemaVersion: "ambient-subagent-runtime-event-v1",
        type,
      },
    },
  };
}
