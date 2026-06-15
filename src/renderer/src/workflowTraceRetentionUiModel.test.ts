import { describe, expect, it } from "vitest";
import { workflowTraceRetentionReviewModel } from "./workflowTraceRetentionUiModel";

describe("workflowTraceRetentionUiModel", () => {
  it("describes production retention with retained audit evidence", () => {
    const model = workflowTraceRetentionReviewModel({
      traceMode: "production",
      events: [event({ id: "event-1" })],
      modelCalls: [modelCall({ id: "call-1" })],
    });

    expect(model).toEqual({
      modeLabel: "Production trace",
      windowLabel: "Essentials retained",
      value: "Production trace, Essentials retained",
      detail: "2 retained evidence items available; old batch-item payloads are compacted by the retention cleanup.",
      tone: "ready",
      retainedEvidenceCount: 2,
      compactedPayloadCount: 0,
    });
  });

  it("describes debug cleanup and compacted expired payloads", () => {
    const model = workflowTraceRetentionReviewModel({
      traceMode: "debug",
      debugRetentionDays: 14,
      events: [
        event({ id: "fresh", data: { retained: "fresh debug input" } }),
        event({ id: "compacted", data: compacted() }),
      ],
      modelCalls: [modelCall({ id: "call-1", input: compacted(), output: { label: "kept" } })],
    });

    expect(model).toEqual({
      modeLabel: "Debug trace",
      windowLabel: "14-day debug cleanup",
      value: "Debug trace, 14-day debug cleanup",
      detail: "2 expired payloads compacted; 1 audit evidence item remains visible.",
      tone: "review",
      retainedEvidenceCount: 1,
      compactedPayloadCount: 2,
    });
  });

  it("explains an empty debug trace before a run exists", () => {
    expect(workflowTraceRetentionReviewModel({ traceMode: "debug" })).toMatchObject({
      value: "Debug trace, 30-day debug cleanup",
      detail: "Debug mode can retain richer inputs and outputs; cleanup compacts payloads after 30 days.",
      tone: "review",
    });
  });
});

function event(overrides: Record<string, unknown>) {
  return {
    id: "event",
    runId: "run-1",
    artifactId: "artifact-1",
    seq: 1,
    type: "step.end",
    createdAt: "2026-05-05T00:00:00.000Z",
    ...overrides,
  } as never;
}

function modelCall(overrides: Record<string, unknown>) {
  return {
    id: "call",
    runId: "run-1",
    artifactId: "artifact-1",
    task: "classify",
    status: "succeeded",
    input: {},
    output: {},
    startedAt: "2026-05-05T00:00:00.000Z",
    ...overrides,
  } as never;
}

function compacted() {
  return {
    retention: "compacted",
    compactedAt: "2026-05-05T00:00:00.000Z",
    reason: "workflow_trace_retention_expired",
  };
}
