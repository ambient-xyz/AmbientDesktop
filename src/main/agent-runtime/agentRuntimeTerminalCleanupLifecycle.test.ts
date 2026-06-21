import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

describe("AgentRuntime terminal cleanup lifecycle", () => {
  it("keeps a completed post-tool assistant answer when cleanup aborts the Pi session", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-terminal-cleanup-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("terminal cleanup");
      const threadSessionDir = join(workspace.sessionPath, thread.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const desktopEvents: any[] = [];
      const windowSend = vi.fn((_channel: string, event: any) => {
        desktopEvents.push(event);
      });
      const getWindow = () => ({
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          isCrashed: () => false,
          send: windowSend,
        },
      }) as any;

      const subscribers: Array<(event: any) => void> = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
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
              type: "tool_execution_start",
              toolCallId: "call-provider-status",
              toolName: "ambient_search_preference_status",
              args: {},
            });
            emit({
              type: "tool_execution_end",
              toolCallId: "call-provider-status",
              toolName: "ambient_search_preference_status",
              result: [{ type: "text", text: "No installed Ambient CLI search providers found." }],
            });
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "stop",
                content: [{ type: "text", text: "Brave Search is available. Enter BRAVE_API_KEY through the secure Desktop dialog to continue." }],
              },
            });
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "aborted",
                errorMessage: "Request was aborted.",
                content: [{ type: "text", text: "" }],
              },
            });
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      const runtime = new AgentRuntime(store, {} as any, {} as any, getWindow, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Can we add Brave Search as a provider?",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(15_000);
      await sendPromise;

      const messages = store.listMessages(thread.id);
      const finalAssistant = messages.filter((message) => message.role === "assistant").at(-1);
      expect(finalAssistant).toMatchObject({
        content: "Brave Search is available. Enter BRAVE_API_KEY through the secure Desktop dialog to continue.",
        metadata: expect.objectContaining({
          status: "done",
          runtime: "pi",
          provider: "ambient",
          piTerminalCleanup: expect.objectContaining({
            reason: "assistant-terminal-before-prompt-resolved",
            cleanupAction: "abort-and-dispose-session",
            sessionFile,
            lastAssistantTerminalEvent: expect.objectContaining({
              eventType: "message_end",
              stopReason: "stop",
              contentBlockCount: 1,
              finalTextChars: "Brave Search is available. Enter BRAVE_API_KEY through the secure Desktop dialog to continue.".length,
            }),
          }),
        }),
      });
      const cleanupActivity = desktopEvents.find((event) =>
        event.type === "runtime-activity" &&
        event.activity?.kind === "stream" &&
        event.activity?.diagnostic?.reason === "assistant-terminal-before-prompt-resolved");
      expect(cleanupActivity?.activity.diagnostic).toMatchObject({
        cleanupAction: "abort-and-dispose-session",
        sessionFile,
        outputChars: "Brave Search is available. Enter BRAVE_API_KEY through the secure Desktop dialog to continue.".length,
        receivedAnyText: true,
        lastAssistantTerminalEvent: expect.objectContaining({
          eventType: "message_end",
          stopReason: "stop",
          contentBlockCount: 1,
        }),
      });
      expect(messages.map((message) => message.content).join("\n")).not.toContain("Request was aborted");
      expect(store.listActiveRuns()).toEqual([]);
      expect(session.agent.abort).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("resets terminal cleanup while Pi activity continues after assistant terminal output", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-terminal-cleanup-activity-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("terminal cleanup activity");
      const threadSessionDir = join(workspace.sessionPath, thread.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");

      const subscribers: Array<(event: any) => void> = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
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
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "stop",
                content: [{ type: "text", text: "I have a final answer, but Pi is still flushing terminal state." }],
              },
            });
          }, 0);
          setTimeout(() => {
            emit({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 250, errorMessage: "provider retry heartbeat" });
          }, 14_000);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "aborted",
                errorMessage: "Request was aborted.",
                content: [],
              },
            });
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Can we add Brave Search as a provider?",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(14_000);
      expect(session.agent.abort).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(14_999);
      expect(session.agent.abort).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await sendPromise;
      expect(session.agent.abort).toHaveBeenCalledTimes(1);

      const finalAssistant = store.listMessages(thread.id).filter((message) => message.role === "assistant").at(-1);
      expect(finalAssistant).toMatchObject({
        content: "I have a final answer, but Pi is still flushing terminal state.",
        metadata: expect.objectContaining({
          status: "done",
          piTerminalCleanup: expect.objectContaining({
            assistantTerminalGraceMs: 15_000,
            receivedAnyText: true,
          }),
        }),
      });
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("clears a transient assistant runtime error once Pi auto-retry recovers", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-pi-auto-retry-recovery-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("auto retry recovery");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });
      const finalText = "Brave Search install finished after the provider retry recovered.";
      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
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
        prompt: vi.fn(() => new Promise<void>((resolve) => {
          setTimeout(() => {
            emit({ type: "message_start", message: { role: "assistant" } });
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "error",
                errorMessage: "429 Upstream request failed",
                content: [],
              },
            });
            emit({
              type: "agent_end",
              messages: [
                {
                  role: "assistant",
                  stopReason: "error",
                  errorMessage: "429 Upstream request failed",
                  content: [],
                },
              ],
            });
            emit({ type: "auto_retry_start", attempt: 1, maxAttempts: 10, delayMs: 1000, errorMessage: "429 Upstream request failed" });
            emit({ type: "auto_retry_end", success: true, attempt: 1 });
            emit({ type: "message_start", message: { role: "assistant" } });
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "stop",
                content: [{ type: "text", text: finalText }],
              },
            });
            resolve();
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      const runtimeEvents: any[] = [];
      const windowSend = vi.fn((_channel: string, event: any) => {
        runtimeEvents.push(event);
      });
      const getWindow = () => ({
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          isCrashed: () => false,
          send: windowSend,
        },
      }) as any;
      const runtime = new AgentRuntime(store, {} as any, {} as any, getWindow, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Install Brave Search",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await sendPromise;

      const finalAssistant = store.listMessages(thread.id).filter((message) => message.role === "assistant").at(-1);
      expect(finalAssistant).toMatchObject({
        content: finalText,
        metadata: expect.objectContaining({
          status: "done",
          piProviderRetry: expect.objectContaining({
            beforeVisibleOutput: true,
            recovered: true,
            attemptCount: 1,
            lastError: "429 Upstream request failed",
          }),
        }),
      });
      expect(runtimeEvents).toContainEqual(expect.objectContaining({
        type: "runtime-activity",
        activity: expect.objectContaining({ kind: "retry", status: "starting", message: "429 Upstream request failed" }),
      }));
      expect(runtimeEvents).not.toContainEqual(expect.objectContaining({
        type: "error",
        message: "429 Upstream request failed",
      }));
      expect(store.listActiveRuns()).toEqual([]);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
