import { describe, expect, it } from "vitest";
import { compactExpiredWorkflowTraceData } from "./workflowTraceRetention";

describe("workflow trace retention", () => {
  it("marks sweeps changed only when trace rows were compacted", () => {
    const store = {
      compactExpiredWorkflowTraceData: () => ({
        cutoff: "2026-04-02T00:00:00.000Z",
        eventsCompacted: 2,
        modelCallsCompacted: 0,
      }),
    };

    expect(compactExpiredWorkflowTraceData(store)).toEqual({
      cutoff: "2026-04-02T00:00:00.000Z",
      eventsCompacted: 2,
      modelCallsCompacted: 0,
      changed: true,
    });
  });

  it("preserves explicit retention inputs for deterministic compaction", () => {
    const calls: unknown[] = [];
    const store = {
      compactExpiredWorkflowTraceData: (input: unknown) => {
        calls.push(input);
        return {
          cutoff: "2026-05-01T00:00:00.000Z",
          eventsCompacted: 0,
          modelCallsCompacted: 0,
        };
      },
    };

    expect(compactExpiredWorkflowTraceData(store, { now: "2026-05-02T00:00:00.000Z", debugRetentionDays: 1 })).toMatchObject({
      changed: false,
    });
    expect(calls).toEqual([{ now: "2026-05-02T00:00:00.000Z", debugRetentionDays: 1 }]);
  });
});
