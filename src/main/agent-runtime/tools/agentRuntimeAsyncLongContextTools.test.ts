import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import type { CreateLambdaRlmToolOptions } from "../agentRuntimeToolRuntimeFacade";
import {
  type AsyncLongContextJobSnapshot,
  type AgentRuntimeAsyncLongContextJobService,
} from "./agentRuntimeAsyncLongContextJobs";
import { registerAgentRuntimeAsyncLongContextTools } from "./agentRuntimeAsyncLongContextTools";

type RegisteredTool = {
  name: string;
  executionMode?: string;
  execute: (...args: any[]) => Promise<AgentToolResult<Record<string, unknown>>>;
};

describe("registerAgentRuntimeAsyncLongContextTools", () => {
  it("registers async long-context tools as sequential desktop tools", () => {
    const registeredTools: RegisteredTool[] = [];

    registerAgentRuntimeAsyncLongContextTools({ registerTool: (tool: any) => registeredTools.push(tool) }, {
      threadId: "thread-1",
      workspacePath: "/workspace",
      asyncLongContextJobs: service(),
      toolOptions: toolOptions(),
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "long_context_start",
      "long_context_poll",
      "long_context_cancel",
    ]);
    expect(registeredTools.every((tool) => tool.executionMode === "sequential")).toBe(true);
  });

  it("forwards start, poll, and cancel calls to the async job service", async () => {
    const registeredTools: RegisteredTool[] = [];
    const start = vi.fn(async () => snapshot("running", { latestSeq: 2, nextSinceSeq: 2 }));
    const pollForThread = vi.fn(async () => snapshot("completed", { latestSeq: 4, nextSinceSeq: 4, resultPreview: "done" }));
    const cancelForThread = vi.fn(async () => snapshot("cancelled", { latestSeq: 5, nextSinceSeq: 5 }));

    registerAgentRuntimeAsyncLongContextTools({ registerTool: (tool: any) => registeredTools.push(tool) }, {
      threadId: "thread-1",
      workspacePath: "/workspace",
      getRunId: () => "run-1",
      asyncLongContextJobs: service({ start, pollForThread, cancelForThread }),
      toolOptions: toolOptions(),
    });

    const abortController = new AbortController();
    const startResult = await registeredTools[0]!.execute("call-start", {
      text: "large text",
      taskType: "summarization",
      maxModelCalls: 2,
      yield_ms: 10,
      poll_hint_ms: 500,
    }, abortController.signal, () => undefined, { recentToolResults: [] });

    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1",
      runId: "run-1",
      workspacePath: "/workspace",
      params: expect.objectContaining({ text: "large text" }),
      yieldMs: 10,
      pollHintMs: 500,
      signal: abortController.signal,
    }));
    expect(startResult.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("job_id: job-1"),
    });
    expect(startResult.details).toMatchObject({
      runtime: "ambient-async-long-context",
      toolName: "long_context_async",
      status: "running",
      jobId: "job-1",
    });

    await registeredTools[1]!.execute("call-poll", {
      job_id: "job-1",
      since_seq: 2,
      wait_ms: 1000,
      max_bytes: 4096,
    });
    expect(pollForThread).toHaveBeenCalledWith("thread-1", "job-1", {
      sinceSeq: 2,
      waitMs: 1000,
      maxBytes: 4096,
    });

    await registeredTools[2]!.execute("call-cancel", {
      job_id: "job-1",
      reason: "no longer needed",
    });
    expect(cancelForThread).toHaveBeenCalledWith("thread-1", "job-1", "no longer needed");
  });
});

function service(overrides: Partial<AgentRuntimeAsyncLongContextJobService> = {}): AgentRuntimeAsyncLongContextJobService {
  return {
    start: vi.fn(async () => snapshot("running")),
    pollForThread: vi.fn(async () => snapshot("running")),
    cancelForThread: vi.fn(async () => snapshot("cancelled")),
    ...overrides,
  } as unknown as AgentRuntimeAsyncLongContextJobService;
}

function toolOptions(): CreateLambdaRlmToolOptions {
  return {
    workspacePath: "/workspace",
    authorityRootPaths: () => ["/workspace"],
    model: {} as CreateLambdaRlmToolOptions["model"],
  };
}

function snapshot(
  status: AsyncLongContextJobSnapshot["status"],
  overrides: Partial<AsyncLongContextJobSnapshot> = {},
): AsyncLongContextJobSnapshot {
  return {
    jobId: "job-1",
    kind: "long_context",
    threadId: "thread-1",
    status,
    latestSeq: 1,
    firstAvailableSeq: 1,
    nextSinceSeq: 1,
    events: [{ seq: 1, at: "2026-01-01T00:00:00.000Z", kind: "status", text: status }],
    eventsPruned: false,
    resultPreview: "",
    resultTruncated: false,
    resultChars: 0,
    inputSources: [],
    artifacts: {},
    ...overrides,
  };
}
