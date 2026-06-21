import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DesktopEvent } from "../../shared/desktopTypes";
import { describe, expect, it, vi } from "vitest";
import { AgentRuntimeToolRunnerController } from "./agentRuntimeToolRunnerController";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { AgentRuntimeAsyncBashJobService, type AsyncBashJobSnapshot } from "./tools/agentRuntimeAsyncBashJobs";

describe("AgentRuntimeToolRunnerController", () => {
  it("creates and updates async bash tool messages with tool events", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-tool-runner-owner-"));
    const store = new ProjectStore();
    const events: DesktopEvent[] = [];
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("async bash");
      const controller = new AgentRuntimeToolRunnerController({
        store,
        asyncBashJobs: () => new AgentRuntimeAsyncBashJobService(),
        getRunId: () => undefined,
        scheduleThreadWake: vi.fn(),
        fileAuthorityRootPathsForThread: () => [workspacePath],
        includeWorkspaceRootAuthorityForThread: () => true,
        requestFileAuthorityForThread: async () => true,
        emit: (event) => events.push(event),
      });

      controller.upsertAsyncBashToolMessage(snapshot({
        threadId: thread.id,
        workspacePath,
        status: "running",
        latestSeq: 1,
        events: [{ seq: 1, at: "2026-06-21T00:00:00.000Z", kind: "stdout", text: "hello" }],
      }));
      controller.upsertAsyncBashToolMessage(snapshot({
        threadId: thread.id,
        workspacePath,
        status: "exited",
        exitCode: 0,
        latestSeq: 2,
        nextSinceSeq: 2,
        events: [{ seq: 2, at: "2026-06-21T00:00:01.000Z", kind: "status", text: "exit 0" }],
        completedAt: "2026-06-21T00:00:01.000Z",
      }));

      const toolMessages = store.listMessages(thread.id).filter((message) => message.role === "tool");
      expect(toolMessages).toHaveLength(1);
      expect(toolMessages[0]).toEqual(expect.objectContaining({
        content: expect.stringContaining("status: exited"),
        metadata: expect.objectContaining({
          status: "done",
          toolName: "bash_async",
        }),
      }));
      expect(events.map((event) => event.type)).toEqual([
        "message-created",
        "tool-event",
        "message-updated",
        "tool-event",
      ]);
      expect(events[1]).toEqual(expect.objectContaining({
        type: "tool-event",
        threadId: thread.id,
        label: "bash_async",
        status: "running",
      }));
      expect(events[3]).toEqual(expect.objectContaining({
        type: "tool-event",
        threadId: thread.id,
        label: "bash_async",
        status: "done",
      }));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function snapshot(input: {
  threadId: string;
  workspacePath: string;
  status: AsyncBashJobSnapshot["status"];
  latestSeq: number;
  nextSinceSeq?: number;
  events: AsyncBashJobSnapshot["events"];
  exitCode?: number | null;
  completedAt?: string;
}): AsyncBashJobSnapshot {
  return {
    jobId: "job-1",
    kind: "bash",
    threadId: input.threadId,
    command: "printf hello",
    cwd: input.workspacePath,
    status: input.status,
    tty: false,
    ...(input.exitCode !== undefined ? { exitCode: input.exitCode } : {}),
    idleTimeoutMs: 30_000,
    maxRunMs: null,
    artifactByteLimit: 1_000_000,
    artifactLimitReached: false,
    startedAt: "2026-06-21T00:00:00.000Z",
    ...(input.completedAt ? { completedAt: input.completedAt } : {}),
    latestSeq: input.latestSeq,
    firstAvailableSeq: 1,
    nextSinceSeq: input.nextSinceSeq ?? input.latestSeq,
    events: input.events,
    eventsPruned: false,
    outputPreview: input.events.map((event) => event.text).join("\n"),
    stdoutPreview: input.events.filter((event) => event.kind === "stdout").map((event) => event.text).join("\n"),
    stderrPreview: input.events.filter((event) => event.kind === "stderr").map((event) => event.text).join("\n"),
    outputTruncated: false,
    stdoutTruncated: false,
    stderrTruncated: false,
    totalOutputChars: input.events.reduce((sum, event) => sum + event.text.length, 0),
    stdoutChars: input.events.filter((event) => event.kind === "stdout").reduce((sum, event) => sum + event.text.length, 0),
    stderrChars: input.events.filter((event) => event.kind === "stderr").reduce((sum, event) => sum + event.text.length, 0),
    artifacts: {},
  };
}
