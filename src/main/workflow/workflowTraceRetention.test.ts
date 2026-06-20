import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compactExpiredWorkflowTraceData,
  createWorkflowTraceRetentionService,
  WORKFLOW_TRACE_RETENTION_MIN_SWEEP_MS,
} from "./workflowTraceRetention";

function createHost(workspacePath: string, compactExpiredWorkflowTraceData: () => {
  cutoff: string;
  eventsCompacted: number;
  modelCallsCompacted: number;
}) {
  return {
    workspacePath,
    store: {
      compactExpiredWorkflowTraceData,
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

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

  it("logs and emits workflow updates only when a sweep changes stored trace data", () => {
    const compacted = createHost("/workspace/changed", () => ({
      cutoff: "2026-04-02T00:00:00.000Z",
      eventsCompacted: 1,
      modelCallsCompacted: 2,
    }));
    const unchanged = createHost("/workspace/unchanged", () => ({
      cutoff: "2026-04-02T00:00:00.000Z",
      eventsCompacted: 0,
      modelCallsCompacted: 0,
    }));
    const emitWorkflowUpdated = vi.fn();
    const log = vi.fn();
    const warn = vi.fn();
    const service = createWorkflowTraceRetentionService({
      projectRuntimeHostList: () => [compacted, unchanged],
      emitWorkflowUpdated,
      setTimeout,
      clearTimeout,
      log,
      warn,
    });

    service.runWorkflowTraceRetentionSweep("startup", compacted);
    service.runWorkflowTraceRetentionSweep("workspace-switch", unchanged);

    expect(emitWorkflowUpdated).toHaveBeenCalledWith("/workspace/changed");
    expect(emitWorkflowUpdated).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "[workflow-retention] startup sweep compacted 1 event payload(s) and 2 model call payload(s) for /workspace/changed before 2026-04-02T00:00:00.000Z.",
    );
    expect(log).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns without throwing when a sweep fails", () => {
    const host = createHost("/workspace/project", () => {
      throw new Error("database locked");
    });
    const warn = vi.fn();
    const service = createWorkflowTraceRetentionService({
      projectRuntimeHostList: () => [host],
      emitWorkflowUpdated: vi.fn(),
      setTimeout,
      clearTimeout,
      log: vi.fn(),
      warn,
    });

    service.runWorkflowTraceRetentionSweep("scheduled", host);

    expect(warn).toHaveBeenCalledWith("[workflow-retention] scheduled sweep failed for /workspace/project: database locked");
  });

  it("schedules recurring sweeps for all current runtime hosts with a minimum delay", () => {
    vi.useFakeTimers();
    const first = createHost("/workspace/first", vi.fn(() => ({
      cutoff: "2026-04-02T00:00:00.000Z",
      eventsCompacted: 1,
      modelCallsCompacted: 0,
    })));
    const second = createHost("/workspace/second", vi.fn(() => ({
      cutoff: "2026-04-02T00:00:00.000Z",
      eventsCompacted: 0,
      modelCallsCompacted: 1,
    })));
    const emitWorkflowUpdated = vi.fn();
    const service = createWorkflowTraceRetentionService({
      projectRuntimeHostList: () => [first, second],
      emitWorkflowUpdated,
      sweepIntervalMs: 90_000,
      setTimeout,
      clearTimeout,
      log: vi.fn(),
      warn: vi.fn(),
    });

    service.scheduleWorkflowTraceRetentionSweep(10);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(WORKFLOW_TRACE_RETENTION_MIN_SWEEP_MS - 1);
    expect(first.store.compactExpiredWorkflowTraceData).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(first.store.compactExpiredWorkflowTraceData).toHaveBeenCalledTimes(1);
    expect(second.store.compactExpiredWorkflowTraceData).toHaveBeenCalledTimes(1);
    expect(emitWorkflowUpdated).toHaveBeenCalledWith("/workspace/first");
    expect(emitWorkflowUpdated).toHaveBeenCalledWith("/workspace/second");
    expect(vi.getTimerCount()).toBe(1);

    service.stopWorkflowTraceRetentionSweep();
    expect(vi.getTimerCount()).toBe(0);
  });
});
