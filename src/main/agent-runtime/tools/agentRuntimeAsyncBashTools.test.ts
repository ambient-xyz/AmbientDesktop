import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { AgentRuntimeAsyncBashJobService } from "./agentRuntimeAsyncBashJobs";
import { registerAgentRuntimeAsyncBashTools } from "./agentRuntimeAsyncBashTools";

type RegisteredTool = {
  name: string;
  executionMode?: string;
  execute: (...args: any[]) => Promise<AgentToolResult<Record<string, unknown>>>;
};

describe("registerAgentRuntimeAsyncBashTools", () => {
  it("registers async bash and thread wake tools", () => {
    const registeredTools: RegisteredTool[] = [];

    registerAgentRuntimeAsyncBashTools({ registerTool: (tool: any) => registeredTools.push(tool) }, {
      threadId: "thread-1",
      workspacePath: "/workspace",
      asyncBashJobs: new AgentRuntimeAsyncBashJobService(),
      getPolicy: () => ({
        permissionMode: "full-access",
        workspacePath: "/workspace",
        subject: "pi-bash",
      }),
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "bash_start",
      "bash_poll",
      "bash_write",
      "bash_cancel",
      "thread_wake_schedule",
    ]);
    expect(registeredTools.every((tool) => tool.executionMode === "sequential")).toBe(true);
  });

  it("schedules thread wake continuations through the runtime callback", async () => {
    const registeredTools: RegisteredTool[] = [];
    const scheduleThreadWake = vi.fn(async () => ({
      wakeId: "wake-1",
      threadId: "thread-1",
      dueAt: "2026-01-01T00:00:01.000Z",
      reason: "check job",
      jobId: "job-1",
    }));

    registerAgentRuntimeAsyncBashTools({ registerTool: (tool: any) => registeredTools.push(tool) }, {
      threadId: "thread-1",
      workspacePath: "/workspace",
      asyncBashJobs: new AgentRuntimeAsyncBashJobService(),
      scheduleThreadWake,
      getPolicy: () => ({
        permissionMode: "full-access",
        workspacePath: "/workspace",
        subject: "pi-bash",
      }),
    });

    const wakeTool = registeredTools.find((tool) => tool.name === "thread_wake_schedule")!;
    const result = await wakeTool.execute("call-wake", {
      after_ms: 1000,
      reason: "check job",
      job_id: "job-1",
      payload: { next_since_seq: 2 },
    }, new AbortController().signal, () => undefined);

    expect(scheduleThreadWake).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1",
      reason: "check job",
      jobId: "job-1",
      payload: { next_since_seq: 2 },
    }));
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("wake_id: wake-1"),
    });
  });

  it("rejects async bash reads of interrupted tool-call recovery artifacts", async () => {
    const registeredTools: RegisteredTool[] = [];

    registerAgentRuntimeAsyncBashTools({ registerTool: (tool: any) => registeredTools.push(tool) }, {
      threadId: "thread-1",
      workspacePath: "/workspace",
      asyncBashJobs: new AgentRuntimeAsyncBashJobService(),
      interruptedToolCallRecoveryToolsAvailable: () => true,
      getPolicy: () => ({
        permissionMode: "full-access",
        workspacePath: "/workspace",
        subject: "pi-bash",
      }),
    });

    const startTool = registeredTools.find((tool) => tool.name === "bash_start")!;
    const result = await startTool.execute("call-start", {
      cmd: "cat .ambient-codex/interrupted-tool-calls/run-1/call-write.partial-args.txt",
    }, new AbortController().signal, () => undefined);

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("recovery_read_interrupted_tool_call"),
    });
    expect(result.details).toMatchObject({
      status: "error",
      toolName: "bash_start",
      recoveryToolsAvailable: true,
      recoveryTool: "recovery_read_interrupted_tool_call",
    });
  });
});
