import { createHash } from "node:crypto";
import { readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

function fakePiSession(sessionFile: string) {
  return {
    sessionFile,
    sessionManager: {
      getEntries: () => [],
    },
    model: {
      contextWindow: 128_000,
    },
    getContextUsage: () => ({
      tokens: 512,
      contextWindow: 128_000,
      percent: 0.4,
    }),
    sendCustomMessage: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
}

describe("AgentRuntime interrupted tool-call recovery", () => {
  it("saves a long interrupted write tool argument and schedules a continuation turn before execution", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-interrupted-tool-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("interrupted long write");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });

      const subscribers: Array<(event: any) => void> = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const longContent = "section\n".repeat(2_500);
      const toolArguments = { path: "long-report.md", content: longContent };
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<never>((_resolve, reject) => {
          rejectPrompt = reject;
          setTimeout(() => {
            emit({
              type: "message_update",
              assistantMessageEvent: {
                type: "toolcall_delta",
                toolCall: {
                  id: "call-long-write",
                  name: "write",
                  arguments: JSON.stringify(toolArguments),
                },
              },
            });
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const getSession = vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Write a long report.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30_000);
      await sendPromise;

      const messages = store.listMessages(thread.id);
      const finalAssistant = messages.filter((message) => message.role === "assistant").at(-1);
      const toolMessage = messages.find((message) => message.role === "tool");
      const recovery = (toolMessage?.metadata?.toolArgumentProgress as any)?.interruptedToolCallRecovery;
      expect(toolMessage?.content).toContain("write interrupted");
      expect(toolMessage?.metadata?.status).toBe("error");
      expect(recovery).toMatchObject({
        status: "recoverable",
        toolCallId: "call-long-write",
        toolName: "write",
        source: "raw_tool_input",
        parseStatus: "valid_json",
      });
      const recoveredArguments = JSON.parse(await readFile(recovery.argumentPath, "utf8"));
      expect(recoveredArguments.content).toBe(longContent);
      expect(finalAssistant?.content).toContain("Ambient/Pi stream interrupted while preparing a large tool call.");
      expect(finalAssistant?.content).toContain("Ambient is starting a continuation turn");
      expect(finalAssistant).toMatchObject({
        metadata: expect.objectContaining({
          status: "done",
          recoveringInterruptedToolCall: true,
          piStreamInterruption: expect.objectContaining({
            retryScheduled: true,
            replaySafe: true,
            retryReason: "interrupted_tool_call_recovery",
          }),
        }),
      });
      expect(store.getThread(thread.id).piSessionFile).toBeUndefined();
      expect(getSession).toHaveBeenCalledTimes(1);
      expect(session.prompt).toHaveBeenCalledTimes(1);
      expect(session.agent.abort).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("recovers unchanged partial tool arguments when keep-alive deltas keep the stream active", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-stalled-tool-args-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("stalled long write arguments");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });

      const subscribers: Array<(event: any) => void> = [];
      const runtimeEvents: any[] = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const longContent = "section\n".repeat(500);
      const toolArguments = { path: "long-report.md", content: longContent };
      const toolCallEvent = () => ({
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_delta",
          toolCall: {
            id: "call-stalled-long-write",
            name: "write",
            arguments: JSON.stringify(toolArguments),
          },
        },
      });
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<never>((_resolve, reject) => {
          rejectPrompt = reject;
          setTimeout(() => {
            emit(toolCallEvent());
            keepAliveTimer = setInterval(() => emit(toolCallEvent()), 5_000);
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            if (keepAliveTimer) clearInterval(keepAliveTimer);
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => runtimeEvents.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
      );
      const getSession = vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Write a long report.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(35_000);
      await sendPromise;

      const messages = store.listMessages(thread.id);
      const recoveryAssistant = messages.filter((message) => message.role === "assistant").find((message) =>
        message.content.includes("Ambient/Pi tool argument stream for write stalled after 30000ms without meaningful argument growth.")
      );
      const toolMessage = messages.find((message) => message.role === "tool");
      const recovery = (toolMessage?.metadata?.toolArgumentProgress as any)?.interruptedToolCallRecovery;
      const argumentTimeout = runtimeEvents.find((event) =>
        event.type === "runtime-activity" &&
        event.activity.kind === "stream" &&
        event.activity.status === "timeout" &&
        event.activity.diagnostic?.timeoutMode === "tool_argument_no_growth"
      );

      expect(argumentTimeout?.activity.message).toBe(
        "Ambient/Pi tool argument stream for write stalled after 30000ms without meaningful argument growth.",
      );
      expect(argumentTimeout?.activity.diagnostic).toMatchObject({
        toolCallId: "call-stalled-long-write",
        toolName: "write",
        timeoutMode: "tool_argument_no_growth",
      });
      expect(toolMessage?.content).toContain("write interrupted");
      expect(toolMessage?.metadata?.status).toBe("error");
      expect(recovery).toMatchObject({
        status: "recoverable",
        toolCallId: "call-stalled-long-write",
        toolName: "write",
        source: "raw_tool_input",
        parseStatus: "valid_json",
      });
      const recoveredArguments = JSON.parse(await readFile(recovery.argumentPath, "utf8"));
      expect(recoveredArguments.content).toBe(longContent);
      expect(recoveryAssistant?.content).toContain(
        "Ambient/Pi tool argument stream for write stalled after 30000ms without meaningful argument growth.",
      );
      expect(recoveryAssistant?.content).toContain("Ambient/Pi stream interrupted while preparing a large tool call.");
      expect(recoveryAssistant?.content).toContain("Ambient is starting a continuation turn");
      expect(recoveryAssistant).toMatchObject({
        metadata: expect.objectContaining({
          status: "done",
          recoveringInterruptedToolCall: true,
          piStreamInterruption: expect.objectContaining({
            kind: "stream_idle_timeout",
            retryScheduled: true,
            replaySafe: true,
            retryReason: "interrupted_tool_call_recovery",
          }),
        }),
      });
      expect(getSession).toHaveBeenCalled();
      expect(session.prompt).toHaveBeenCalled();
      expect(session.agent.abort).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("allows a second interrupted tool-call recovery when a recovery follow-up stalls again", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-stalled-tool-retry-budget-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("stalled recovery follow-up");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });

      const subscribers: Array<(event: any) => void> = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const longContent = "section\n".repeat(600);
      const toolArguments = { path: "long-report.md", content: longContent };
      const toolCallEvent = () => ({
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_delta",
          toolCall: {
            id: "call-second-stalled-write",
            name: "write",
            arguments: JSON.stringify(toolArguments),
          },
        },
      });
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<never>((_resolve, reject) => {
          rejectPrompt = reject;
          setTimeout(() => {
            emit(toolCallEvent());
            keepAliveTimer = setInterval(() => emit(toolCallEvent()), 5_000);
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            if (keepAliveTimer) clearInterval(keepAliveTimer);
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const getSession = vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Continue the interrupted tool call from the saved partial arguments.",
        visibleUserContent: "Continue the interrupted tool call from the saved partial arguments.",
        modelContentOverride: "Continue the interrupted tool call from the saved partial arguments.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "follow-up",
        preserveActiveThread: true,
        internal: true,
        context: [],
        sessionRecovery: {
          kind: "interrupted_tool_call_recovery",
          reason: "Continuing after Ambient/Pi interrupted while preparing tool arguments.",
          previousSessionFile: sessionFile,
          previousSessionFileExists: true,
        },
        interruptedToolCallRecovery: {
          attempt: 1,
          maxRetries: 3,
          sourceToolCallIds: ["call-prior-stalled-write"],
        },
      } as any);

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(35_000);
      await sendPromise;

      const messages = store.listMessages(thread.id);
      const recoveryAssistant = messages.find((message) =>
        message.role === "assistant" &&
        message.metadata?.recoveringInterruptedToolCall === true
      );
      const toolMessage = messages.find((message) => message.role === "tool");
      const recovery = (toolMessage?.metadata?.toolArgumentProgress as any)?.interruptedToolCallRecovery;

      expect(toolMessage?.content).toContain("write interrupted");
      expect(recovery).toMatchObject({
        status: "recoverable",
        toolCallId: "call-second-stalled-write",
        toolName: "write",
        source: "raw_tool_input",
        parseStatus: "valid_json",
      });
      expect(recoveryAssistant?.content).toContain("Ambient is starting a continuation turn");
      expect(recoveryAssistant).toMatchObject({
        metadata: expect.objectContaining({
          status: "done",
          recoveringInterruptedToolCall: true,
          piStreamInterruption: expect.objectContaining({
            retryScheduled: true,
            retryReason: "interrupted_tool_call_recovery",
            retryAttempt: 2,
            maxRetries: 3,
          }),
        }),
      });
      expect(getSession).toHaveBeenCalled();
      expect(session.prompt).toHaveBeenCalled();
      expect(session.agent.abort).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("reads interrupted tool-call recovery artifacts by stable ids with sha verification", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-recovery-reader-"));
    const projectRoot = join(root, "project");
    const activeWorktree = join(projectRoot, ".ambient-codex", "worktrees", "thread-1");
    const store = new ProjectStore();
    try {
      await mkdir(join(activeWorktree, ".ambient-codex", "interrupted-tool-calls", "run-1"), { recursive: true });
      const artifactPath = join(activeWorktree, ".ambient-codex", "interrupted-tool-calls", "run-1", "call-write.partial-args.txt");
      const exactArgs = JSON.stringify({ path: "report.md", content: "x".repeat(200) });
      await writeFile(artifactPath, exactArgs, "utf8");
      const sha256 = createHash("sha256").update(exactArgs).digest("hex");

      store.openWorkspace(projectRoot);
      const thread = store.createThread("recovery reader", activeWorktree);
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      const result = (runtime as any).readInterruptedToolCallRecoveryArtifact(thread.id, {
        runId: "run-1",
        toolCallId: "call-write",
        sha256,
      });

      expect(result.content).toEqual([{ type: "text", text: exactArgs }]);
      expect(result.details).toMatchObject({
        status: "done",
        toolName: "recovery_read_interrupted_tool_call",
        runId: "run-1",
        toolCallId: "call-write",
        sha256,
        artifactPath,
      });
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
