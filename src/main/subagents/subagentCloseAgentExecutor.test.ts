import { describe, expect, it, vi } from "vitest";

import { AMBIENT_DEFAULT_MODEL, resolveAmbientModelRuntimeProfile } from "../../shared/ambientModels";
import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import { subagentCapacityProviderProfileSnapshot } from "../../shared/subagentCapacity";
import type { SubagentRunEventSummary, SubagentRunSummary } from "../../shared/subagentTypes";
import {
  executeSubagentCloseAgent,
  SUBAGENT_CLOSE_AGENT_EXECUTOR_SCHEMA_VERSION,
  type SubagentCloseAgentExecutorStore,
} from "./subagentCloseAgentExecutor";

describe("subagentCloseAgentExecutor", () => {
  it("records close requests, releases capacity, and writes a retained-history child message", () => {
    const child = run({ id: "child-a", childThreadId: "thread-a", canonicalTaskPath: "root/0:reviewer" });
    const store = fakeStore({ runs: [child] });

    const result = executeSubagentCloseAgent({
      store,
      run: child,
      reason: "Release capacity after review.",
      idempotencyKey: "close:review",
      toolCallId: "tool-close",
    });

    expect(SUBAGENT_CLOSE_AGENT_EXECUTOR_SCHEMA_VERSION)
      .toBe("ambient-subagent-close-agent-executor-v1");
    expect(store.appendSubagentRunEvent).toHaveBeenCalledWith("child-a", {
      type: "subagent.close_requested",
      preview: {
        childRunId: "child-a",
        childThreadId: "thread-a",
        parentRunId: "parent-run",
        parentThreadId: "parent-thread",
        canonicalTaskPath: "root/0:reviewer",
        idempotencyKey: "close:review",
        reason: "Release capacity after review.",
        toolCallId: "tool-close",
      },
    });
    expect(store.closeSubagentRun).toHaveBeenCalledWith("child-a");
    expect(store.addMessage).toHaveBeenCalledWith({
      threadId: "thread-a",
      role: "system",
      content: "Sub-agent closed by parent. Capacity is released; transcript and artifacts are retained.\n\nReason: Release capacity after review.",
      metadata: {
        runtime: "ambient-subagents",
        phase: "phase-2-pi-tool-surface",
        status: "closed",
        subagentRunId: "child-a",
      },
    });
    expect(result).toMatchObject({
      schemaVersion: SUBAGENT_CLOSE_AGENT_EXECUTOR_SCHEMA_VERSION,
      replay: false,
      run: expect.objectContaining({
        id: "child-a",
        closedAt: "2026-06-06T12:00:00.000Z",
      }),
      reason: "Release capacity after review.",
      idempotencyKey: "close:review",
      runEvent: expect.objectContaining({ type: "subagent.close_requested" }),
    });
  });

  it("replays existing close run events without repeating side effects", () => {
    const child = run({ id: "child-a" });
    const store = fakeStore({
      runs: [child],
      runEvents: [runEvent({
        runId: "child-a",
        type: "subagent.close_requested",
        preview: { idempotencyKey: "close:review" },
      })],
    });

    const result = executeSubagentCloseAgent({
      store,
      run: child,
      reason: "Release capacity after review.",
      idempotencyKey: "close:review",
      toolCallId: "tool-close",
    });

    expect(result).toMatchObject({
      replay: true,
      run: child,
      idempotencyKey: "close:review",
    });
    expect(store.appendSubagentRunEvent).not.toHaveBeenCalled();
    expect(store.closeSubagentRun).not.toHaveBeenCalled();
    expect(store.addMessage).not.toHaveBeenCalled();
  });

  it("replays already closed runs without creating duplicate close events", () => {
    const child = run({ id: "child-a", closedAt: "2026-06-06T12:00:00.000Z" });
    const store = fakeStore({ runs: [child] });

    const result = executeSubagentCloseAgent({
      store,
      run: child,
      idempotencyKey: "close:already",
      toolCallId: "tool-close",
    });

    expect(result.replay).toBe(true);
    expect(result.run).toBe(child);
    expect(store.appendSubagentRunEvent).not.toHaveBeenCalled();
    expect(store.closeSubagentRun).not.toHaveBeenCalled();
    expect(store.addMessage).not.toHaveBeenCalled();
  });

  it("throws before writing the retained-history message if close does not release capacity", () => {
    const child = run({ id: "child-a" });
    const store = fakeStore({
      runs: [child],
      closeRun: (current) => ({
        ...current,
        closedAt: "2026-06-06T12:00:00.000Z",
      }),
    });

    expect(() => executeSubagentCloseAgent({
      store,
      run: child,
      idempotencyKey: "close:no-release",
      toolCallId: "tool-close",
    })).toThrow("Closing a sub-agent must release its capacity lease");
    expect(store.addMessage).not.toHaveBeenCalled();
  });

  it("throws if close mutates retained child identity or drops result artifacts", () => {
    const child = run({
      id: "child-a",
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        artifactPath: ".ambient/subagents/child-a/result.json",
      },
    });
    const store = fakeStore({
      runs: [child],
      closeRun: (current) => ({
        ...current,
        childThreadId: "other-thread",
        closedAt: "2026-06-06T12:00:00.000Z",
        resultArtifact: undefined,
        capacityLeaseSnapshot: {
          ...current.capacityLeaseSnapshot,
          childThreadId: "other-thread",
          status: "released",
          releasedAt: "2026-06-06T12:00:00.000Z",
          releaseReason: "close_agent released live sub-agent capacity while preserving transcript history.",
        },
      }),
    });

    expect(() => executeSubagentCloseAgent({
      store,
      run: child,
      idempotencyKey: "close:mutated-history",
      toolCallId: "tool-close",
    })).toThrow("Closing a sub-agent must preserve run/thread history identity");
    expect(store.addMessage).not.toHaveBeenCalled();
  });
});

function fakeStore(input: {
  runs: SubagentRunSummary[];
  runEvents?: SubagentRunEventSummary[];
  closeRun?: (run: SubagentRunSummary, now?: string) => SubagentRunSummary;
}): SubagentCloseAgentExecutorStore & {
  getSubagentRun: ReturnType<typeof vi.fn>;
  listSubagentRunEvents: ReturnType<typeof vi.fn>;
  appendSubagentRunEvent: ReturnType<typeof vi.fn>;
  closeSubagentRun: ReturnType<typeof vi.fn>;
  addMessage: ReturnType<typeof vi.fn>;
} {
  const runs = new Map(input.runs.map((childRun) => [childRun.id, childRun]));
  const runEvents = [...(input.runEvents ?? [])];

  const getSubagentRun = vi.fn((runId: string): SubagentRunSummary => {
    const childRun = runs.get(runId);
    if (!childRun) throw new Error(`Unknown run ${runId}`);
    return childRun;
  });
  const listSubagentRunEvents = vi.fn((runId: string): SubagentRunEventSummary[] => {
    return runEvents.filter((event) => event.runId === runId);
  });
  const appendSubagentRunEvent = vi.fn((runId: string, eventInput: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string }): SubagentRunEventSummary => {
    const event = {
      runId,
      sequence: runEvents.length + 1,
      type: eventInput.type,
      ...(eventInput.preview !== undefined ? { preview: eventInput.preview } : {}),
      ...(eventInput.artifactPath ? { artifactPath: eventInput.artifactPath } : {}),
      createdAt: eventInput.createdAt ?? "2026-06-06T12:00:00.000Z",
    } as SubagentRunEventSummary;
    runEvents.push(event);
    return event;
  });
  const closeSubagentRun = vi.fn((runId: string, now?: string): SubagentRunSummary => {
    const current = getSubagentRun(runId);
    const closed = input.closeRun
      ? input.closeRun(current, now)
      : {
          ...current,
          closedAt: now ?? "2026-06-06T12:00:00.000Z",
          capacityLeaseSnapshot: {
            ...current.capacityLeaseSnapshot,
            status: "released",
            releasedAt: now ?? "2026-06-06T12:00:00.000Z",
            releaseReason: "close_agent released live sub-agent capacity while preserving transcript history.",
          },
        } as SubagentRunSummary;
    runs.set(runId, closed);
    return closed;
  });
  const addMessage = vi.fn((message: {
    threadId: string;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    metadata?: Record<string, unknown>;
  }) => message);

  return {
    getSubagentRun,
    listSubagentRunEvents,
    appendSubagentRunEvent,
    closeSubagentRun,
    addMessage,
  };
}

function run(overrides: {
  id?: string;
  childThreadId?: string;
  canonicalTaskPath?: string;
  status?: SubagentRunStatus;
  closedAt?: string;
  resultArtifact?: unknown;
} = {}): SubagentRunSummary {
  const id = overrides.id ?? "child-run";
  const childThreadId = overrides.childThreadId ?? "child-thread";
  const canonicalTaskPath = overrides.canonicalTaskPath ?? `root/${id}:reviewer`;
  return {
    id,
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId,
    canonicalTaskPath,
    roleId: "reviewer",
    dependencyMode: "required",
    status: overrides.status ?? "completed",
    capacityLeaseSnapshot: capacityLease({ childRunId: id, childThreadId, canonicalTaskPath }),
    ...(overrides.resultArtifact !== undefined ? { resultArtifact: overrides.resultArtifact } : {}),
    ...(overrides.closedAt ? { closedAt: overrides.closedAt } : {}),
  } as SubagentRunSummary;
}

function capacityLease(input: {
  childRunId: string;
  childThreadId: string;
  canonicalTaskPath: string;
}): SubagentRunSummary["capacityLeaseSnapshot"] {
  return {
    schemaVersion: "ambient-subagent-capacity-lease-v1",
    leaseId: `lease-${input.childRunId}`,
    status: "reserved",
    resolvedAt: "2026-06-06T11:59:00.000Z",
    canonicalTaskPath: input.canonicalTaskPath,
    roleId: "reviewer",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunId: input.childRunId,
    childThreadId: input.childThreadId,
    depth: {
      depth: 1,
      maxDepth: 1,
      allowed: true,
      reason: "Within sub-agent depth budget.",
    },
    provider: {
      providerId: "ambient",
      modelId: AMBIENT_DEFAULT_MODEL,
      locality: "cloud",
      profile: subagentCapacityProviderProfileSnapshot(resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL)),
      openRunCount: 0,
      projectedOpenRunCount: 1,
      allowed: true,
      reason: "Within provider concurrency limit.",
    },
    localMemory: {
      outcome: "not_applicable",
      allowed: true,
      reason: "Cloud sub-agent models do not reserve local resident memory.",
    },
    blockingReasons: [],
  };
}

function runEvent(overrides: {
  runId?: string;
  type: string;
  preview?: unknown;
}): SubagentRunEventSummary {
  return {
    runId: overrides.runId ?? "child-run",
    sequence: 1,
    type: overrides.type,
    ...(overrides.preview !== undefined ? { preview: overrides.preview } : {}),
    createdAt: "2026-06-06T12:00:00.000Z",
  } as SubagentRunEventSummary;
}
