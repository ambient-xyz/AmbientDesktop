import { describe, expect, it } from "vitest";
import type { SubagentRunStatus } from "../shared/subagentProtocol";
import type { SubagentWaitBarrierSummary } from "../shared/types";
import {
  evaluateSubagentWaitBarrierForSynthesis,
  requiredSynthesisCountForBarrier,
  SUBAGENT_WAIT_BARRIER_EVALUATION_SCHEMA_VERSION,
  waitBarrierStatusFromEvaluation,
  type SubagentWaitBarrierChildResult,
} from "./subagentWaitBarrierEvaluation";

describe("subagentWaitBarrierEvaluation", () => {
  it("keeps required_all barriers blocked until every child is synthesis-safe", () => {
    const evaluation = evaluateSubagentWaitBarrierForSynthesis({
      barrier: barrier({ dependencyMode: "required_all", childRunIds: ["a", "b"] }),
      childResults: [
        child({ childRunId: "a", synthesisAllowed: true }),
        child({ childRunId: "b", status: "running", synthesisAllowed: false }),
      ],
    });

    expect(evaluation).toMatchObject({
      schemaVersion: SUBAGENT_WAIT_BARRIER_EVALUATION_SCHEMA_VERSION,
      requiredSynthesisCount: 2,
      validSynthesisCount: 1,
      potentialSynthesisCount: 2,
      synthesisAllowed: false,
      impossible: false,
      activeChildRunIds: ["b"],
      terminalUnsafeChildRunIds: [],
      reason: "required_all barrier is still waiting for child work; 1/2 synthesis-safe results are available and 1 child run may still finish.",
    });
    expect(waitBarrierStatusFromEvaluation(evaluation)).toBe("waiting_on_children");
  });

  it("marks required_all synthesis as partial when any required child is partial", () => {
    const evaluation = evaluateSubagentWaitBarrierForSynthesis({
      barrier: barrier({ dependencyMode: "required_all", childRunIds: ["a", "b"] }),
      childResults: [
        child({ childRunId: "a", synthesisAllowed: true, partial: true, status: "aborted_partial" }),
        child({ childRunId: "b", synthesisAllowed: true }),
      ],
    });

    expect(evaluation).toMatchObject({
      requiredSynthesisCount: 2,
      validSynthesisCount: 2,
      synthesisAllowed: true,
      partial: true,
      reason: "required_all barrier has 2/2 synthesis-safe child results.",
    });
    expect(waitBarrierStatusFromEvaluation(evaluation)).toBe("satisfied");
  });

  it("allows required_any from one validated child while preserving unsafe sibling provenance", () => {
    const evaluation = evaluateSubagentWaitBarrierForSynthesis({
      barrier: barrier({ dependencyMode: "required_any", childRunIds: ["safe", "unsafe"] }),
      childResults: [
        child({ childRunId: "safe", synthesisAllowed: true }),
        child({ childRunId: "unsafe", status: "failed", synthesisAllowed: false, reason: "Failed without artifact." }),
      ],
    });

    expect(evaluation).toMatchObject({
      requiredSynthesisCount: 1,
      validSynthesisCount: 1,
      synthesisAllowed: true,
      partial: false,
      terminalUnsafeChildRunIds: ["unsafe"],
      childStatuses: [
        { childRunId: "safe", status: "completed" },
        { childRunId: "unsafe", status: "failed" },
      ],
    });
    expect(waitBarrierStatusFromEvaluation(evaluation)).toBe("satisfied");
  });

  it("uses explicit quorum thresholds and detects impossible quorum barriers", () => {
    const quorum = barrier({
      dependencyMode: "quorum",
      quorumThreshold: 3,
      childRunIds: ["a", "b", "c", "d"],
    });
    const waiting = evaluateSubagentWaitBarrierForSynthesis({
      barrier: quorum,
      childResults: [
        child({ childRunId: "a", synthesisAllowed: true }),
        child({ childRunId: "b", synthesisAllowed: true }),
        child({ childRunId: "c", status: "running", synthesisAllowed: false }),
        child({ childRunId: "d", status: "failed", synthesisAllowed: false }),
      ],
    });
    const impossible = evaluateSubagentWaitBarrierForSynthesis({
      barrier: quorum,
      childResults: [
        child({ childRunId: "a", synthesisAllowed: true }),
        child({ childRunId: "b", synthesisAllowed: true }),
        child({ childRunId: "c", status: "failed", synthesisAllowed: false }),
        child({ childRunId: "d", status: "stopped", synthesisAllowed: false }),
      ],
    });

    expect(requiredSynthesisCountForBarrier(quorum, 4)).toBe(3);
    expect(waiting).toMatchObject({
      quorumThreshold: 3,
      requiredSynthesisCount: 3,
      validSynthesisCount: 2,
      potentialSynthesisCount: 3,
      impossible: false,
      activeChildRunIds: ["c"],
    });
    expect(waitBarrierStatusFromEvaluation(waiting)).toBe("waiting_on_children");
    expect(impossible).toMatchObject({
      requiredSynthesisCount: 3,
      validSynthesisCount: 2,
      potentialSynthesisCount: 2,
      impossible: true,
      terminalUnsafeChildRunIds: ["c", "d"],
    });
    expect(waitBarrierStatusFromEvaluation(impossible)).toBe("failed");
  });

  it("resolves all-cancelled impossible barriers as cancelled", () => {
    const evaluation = evaluateSubagentWaitBarrierForSynthesis({
      barrier: barrier({ dependencyMode: "required_all", childRunIds: ["a", "b"] }),
      childResults: [
        child({ childRunId: "a", status: "cancelled", synthesisAllowed: false }),
        child({ childRunId: "b", status: "cancelled", synthesisAllowed: false }),
      ],
    });

    expect(evaluation).toMatchObject({
      impossible: true,
      terminalUnsafeChildRunIds: ["a", "b"],
      reason: "required_all barrier cannot reach 2 synthesis-safe child results; 2 child results are terminal and unsafe for synthesis.",
    });
    expect(waitBarrierStatusFromEvaluation(evaluation)).toBe("cancelled");
  });

  it("resolves unsatisfied timed-out barriers as timed_out", () => {
    const evaluation = evaluateSubagentWaitBarrierForSynthesis({
      barrier: barrier({ dependencyMode: "required_all", childRunIds: ["a", "b"] }),
      timedOut: true,
      childResults: [
        child({ childRunId: "a", synthesisAllowed: true }),
        child({ childRunId: "b", status: "running", synthesisAllowed: false }),
      ],
    });

    expect(evaluation).toMatchObject({
      timedOut: true,
      synthesisAllowed: false,
      reason: "required_all barrier timed out with 1/2 synthesis-safe child results.",
    });
    expect(waitBarrierStatusFromEvaluation(evaluation)).toBe("timed_out");
  });
});

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

function child(overrides: {
  childRunId: string;
  status?: SubagentRunStatus;
  synthesisAllowed?: boolean;
  partial?: boolean;
  reason?: string;
}): SubagentWaitBarrierChildResult<Record<string, unknown>> {
  const childRunId = overrides.childRunId;
  return {
    childRunId,
    childThreadId: `${childRunId}-thread`,
    status: overrides.status ?? "completed",
    synthesisAllowed: overrides.synthesisAllowed ?? false,
    partial: overrides.partial ?? false,
    ...(overrides.reason ? { reason: overrides.reason } : {}),
    resultValidation: {
      synthesisAllowed: overrides.synthesisAllowed ?? false,
      partial: overrides.partial ?? false,
    },
  };
}
