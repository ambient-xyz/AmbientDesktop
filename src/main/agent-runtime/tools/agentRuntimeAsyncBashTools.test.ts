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
      "thread_wake_cancel",
      "thread_wake_resolve",
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
      operationKey: "bash:job-1",
      supersedesWakeIds: ["wake-old"],
    }));
    const cancelThreadWake = vi.fn(async () => ({
      wakeId: "wake-1",
      threadId: "thread-1",
      status: "cancelled",
      reason: "Cancelled before delivery.",
      operationKey: "bash:job-1",
    }));
    const resolveThreadWake = vi.fn(async () => ({
      wakeId: "wake-1",
      threadId: "thread-1",
      status: "resolved",
      reason: "job complete",
      operationKey: "bash:job-1",
    }));

    registerAgentRuntimeAsyncBashTools({ registerTool: (tool: any) => registeredTools.push(tool) }, {
      threadId: "thread-1",
      workspacePath: "/workspace",
      asyncBashJobs: new AgentRuntimeAsyncBashJobService(),
      scheduleThreadWake,
      cancelThreadWake,
      resolveThreadWake,
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
      payload: { job_kind: "bash", next_since_seq: 2 },
    }, new AbortController().signal, () => undefined);

    expect(scheduleThreadWake).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1",
      reason: "check job",
      jobId: "job-1",
      operationKey: "bash:job-1",
      payload: { job_kind: "bash", next_since_seq: 2 },
    }));
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("wake_id: wake-1"),
    });
    expect(toolText(result)).toContain("superseded_wake_ids: wake-old");

    const cancelTool = registeredTools.find((tool) => tool.name === "thread_wake_cancel")!;
    const cancelResult = await cancelTool.execute("call-cancel", { wake_id: "wake-1" });
    expect(cancelThreadWake).toHaveBeenCalledWith({ threadId: "thread-1", wakeId: "wake-1" });
    expect(toolText(cancelResult)).toContain("status: cancelled");

    const resolveTool = registeredTools.find((tool) => tool.name === "thread_wake_resolve")!;
    const resolveResult = await resolveTool.execute("call-resolve", { wake_id: "wake-1", reason: "job complete" });
    expect(resolveThreadWake).toHaveBeenCalledWith({ threadId: "thread-1", wakeId: "wake-1", reason: "job complete" });
    expect(toolText(resolveResult)).toContain("status: resolved");
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

function toolText(result: AgentToolResult<Record<string, unknown>>): string {
  return result.content.map((part) => part.type === "text" ? part.text : "").join("\n");
}
