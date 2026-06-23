import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";

import {
  AgentRuntimeAsyncLongContextJobService,
  formatAsyncLongContextOrphanedSnapshotForTool,
  type AsyncLongContextJobSnapshot,
} from "./agentRuntimeAsyncLongContextJobs";

describe("AgentRuntimeAsyncLongContextJobService", () => {
  it("starts, polls, completes, and writes final long-context artifacts", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-async-long-context-"));
    const snapshots: AsyncLongContextJobSnapshot[] = [];
    let completeModel!: (value: string) => void;
    try {
      const service = new AgentRuntimeAsyncLongContextJobService({
        onSnapshot: (snapshot) => snapshots.push(snapshot),
      });

      const started = await service.start({
        threadId: "thread-1",
        workspacePath,
        toolOptions: {
          workspacePath,
          model: testModel(),
          modelComplete: async () => new Promise<string>((resolve) => {
            completeModel = resolve;
          }),
        },
        params: {
          taskType: "summarization",
          text: "Alpha beta gamma",
          maxModelCalls: 2,
        },
        yieldMs: 10,
      });

      expect(started.status).toBe("running");
      expect(started.kind).toBe("long_context");
      expect(started.events.map((event) => event.kind)).toEqual(expect.arrayContaining(["status", "progress"]));
      expect(snapshots.some((snapshot) => snapshot.status === "running")).toBe(true);

      completeModel("Async summary");
      const completed = await pollUntilTerminal(service, "thread-1", started.jobId, started.nextSinceSeq);

      expect(completed.status).toBe("completed");
      expect(completed.resultPreview).toContain("Async summary");
      expect(completed.taskType).toBe("summarization");
      expect(completed.inputLength).toBeGreaterThan(0);
      expect(completed.modelCalls).toBe(1);
      expect(completed.artifacts.result?.path).toMatch(/async-long-context-.+-result\.txt$/);
      expect(completed.artifacts.metadata?.path).toMatch(/async-long-context-.+-metadata\.json$/);
      expect(await readFile(join(workspacePath, completed.artifacts.result!.path), "utf8")).toContain("Async summary");
      expect(await readFile(join(workspacePath, completed.artifacts.metadata!.path), "utf8")).toContain(completed.jobId);
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("writes untruncated final responses to async result artifacts", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-async-long-context-full-artifact-"));
    const fullResponse = "0123456789".repeat(20);
    try {
      const service = new AgentRuntimeAsyncLongContextJobService();
      const started = await service.start({
        threadId: "thread-1",
        workspacePath,
        toolOptions: {
          workspacePath,
          model: testModel(),
          modelComplete: async () => fullResponse,
        },
        params: {
          taskType: "summarization",
          text: "Alpha beta gamma",
          maxModelCalls: 2,
          maxOutputChars: 12,
        },
        yieldMs: 0,
      });

      const completed = await pollUntilTerminal(service, "thread-1", started.jobId, started.nextSinceSeq);

      expect(completed.status).toBe("completed");
      expect(completed.resultPreview).toContain(fullResponse);
      expect(completed.resultPreview).not.toContain("... truncated ...");
      expect(await readFile(join(workspacePath, completed.artifacts.result!.path), "utf8")).toBe(fullResponse);
      const metadata = JSON.parse(await readFile(join(workspacePath, completed.artifacts.metadata!.path), "utf8")) as {
        details: { truncated?: boolean };
      };
      expect(metadata.details.truncated).toBe(true);
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("enforces thread ownership for polling", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-async-long-context-owner-"));
    try {
      const service = new AgentRuntimeAsyncLongContextJobService();
      const started = await service.start({
        threadId: "thread-1",
        workspacePath,
        toolOptions: {
          workspacePath,
          model: testModel(),
          modelComplete: async () => "summary",
        },
        params: {
          taskType: "summarization",
          text: "Alpha beta gamma",
          maxModelCalls: 2,
        },
        yieldMs: 0,
      });

      await expect(service.pollForThread("thread-2", started.jobId)).rejects.toThrow(/does not belong to this thread/);
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("cancels running jobs through the job abort signal", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-async-long-context-cancel-"));
    try {
      const service = new AgentRuntimeAsyncLongContextJobService();
      const started = await service.start({
        threadId: "thread-1",
        workspacePath,
        toolOptions: {
          workspacePath,
          model: testModel(),
          modelComplete: async (_prompt, signal) =>
            new Promise<string>((_resolve, reject) => {
              signal?.addEventListener("abort", () => reject(new Error("model call aborted")), { once: true });
            }),
        },
        params: {
          taskType: "summarization",
          text: "Alpha beta gamma",
          maxModelCalls: 2,
        },
        yieldMs: 10,
      });

      const cancelled = await service.cancelForThread("thread-1", started.jobId, "not needed");
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.events.map((event) => event.text).join("\n")).toContain("cancelling: not needed");
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("formats orphaned wake snapshots without requiring in-memory jobs", () => {
    expect(formatAsyncLongContextOrphanedSnapshotForTool("thread-1", "job-1")).toContain("status: orphaned");
    expect(formatAsyncLongContextOrphanedSnapshotForTool("thread-1", "job-1")).toContain("long_context_poll");
  });
});

function testModel(): Model<"openai-completions"> {
  return {
    id: "test-model",
    name: "test-model",
    api: "openai-completions",
    provider: "ambient",
    baseUrl: "https://api.ambient.xyz/v1",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 131072,
  };
}

async function pollUntilTerminal(
  service: AgentRuntimeAsyncLongContextJobService,
  threadId: string,
  jobId: string,
  sinceSeq: number,
): Promise<AsyncLongContextJobSnapshot> {
  let nextSinceSeq = sinceSeq;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const snapshot = await service.pollForThread(threadId, jobId, {
      sinceSeq: nextSinceSeq,
      waitMs: 1000,
    });
    if (snapshot.status !== "queued" && snapshot.status !== "running") return snapshot;
    nextSinceSeq = snapshot.nextSinceSeq;
  }
  throw new Error("Timed out waiting for async long-context terminal snapshot.");
}
