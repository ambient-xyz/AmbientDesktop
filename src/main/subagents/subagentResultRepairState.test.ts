import { describe, expect, it } from "vitest";

import type { SubagentRunEventSummary } from "../../shared/subagentTypes";
import { subagentResultRepairStateForRun } from "./subagentResultRepairState";

describe("subagentResultRepairState", () => {
  it("surfaces pending structured-result repair state for active children", () => {
    const state = subagentResultRepairStateForRun({
      run: { status: "running" },
      events: [
        event(1, "subagent.result_contract_followup_required", {
          reason: "Structured result roleId must match child role explorer.",
          hadAssistantText: true,
        }),
        event(2, "subagent.internal_post_tool_followup_started", {
          attempt: 1,
          maxAttempts: 3,
          reason: "Structured result roleId must match child role explorer.",
        }),
      ],
    });

    expect(state).toMatchObject({
      schemaVersion: "ambient-subagent-result-repair-state-v1",
      state: "result_contract_repair_pending",
      reason: "Structured result roleId must match child role explorer.",
      detectedAt: "2026-06-06T00:00:01.000Z",
      eventSequence: 1,
      hadAssistantText: true,
      latestInternalFollowupAt: "2026-06-06T00:00:02.000Z",
      latestInternalFollowupSequence: 2,
      latestInternalFollowupAttempt: 1,
      maxAttempts: 3,
    });
  });

  it("preserves bounded repair-exhaustion evidence for terminal failed children", () => {
    const state = subagentResultRepairStateForRun({
      run: { status: "failed" },
      events: [
        event(1, "subagent.result_contract_followup_required", {
          reason: "Structured-output role result is missing the SUBAGENT_RESULT_STATUS status line.",
          hadAssistantText: true,
        }),
        event(2, "subagent.internal_post_tool_followup_started", {
          attempt: 3,
          maxAttempts: 3,
          reason: "Structured-output role result is missing the SUBAGENT_RESULT_STATUS status line.",
        }),
        event(3, "subagent.result_contract_repair_exhausted", {
          reason: "Structured-output role result is missing the SUBAGENT_RESULT_STATUS status line.",
          followupKind: "result_contract",
          maxAttempts: 3,
          terminalStatus: "failed",
        }),
        event(4, "subagent.child_session_failed", {
          error: "Structured-output role result is missing the SUBAGENT_RESULT_STATUS status line. Ambient exhausted automatic child post-tool finalization follow-ups.",
        }),
      ],
    });

    expect(state).toMatchObject({
      schemaVersion: "ambient-subagent-result-repair-state-v1",
      state: "result_contract_repair_exhausted",
      reason: "Structured-output role result is missing the SUBAGENT_RESULT_STATUS status line.",
      detectedAt: "2026-06-06T00:00:01.000Z",
      eventSequence: 1,
      exhaustedAt: "2026-06-06T00:00:03.000Z",
      exhaustedSequence: 3,
      latestInternalFollowupAttempt: 3,
      maxAttempts: 3,
    });
  });

  it("clears repair state after a later valid terminal result", () => {
    expect(subagentResultRepairStateForRun({
      run: { status: "completed" },
      events: [
        event(1, "subagent.result_contract_followup_required", {
          reason: "Structured result roleId must match child role explorer.",
        }),
        event(2, "subagent.result_ready", { status: "completed" }),
      ],
    })).toBeUndefined();
  });
});

function event(
  sequence: number,
  type: string,
  preview: unknown,
): SubagentRunEventSummary {
  return {
    runId: "child-run",
    sequence,
    type,
    preview,
    createdAt: `2026-06-06T00:00:0${sequence}.000Z`,
  };
}
