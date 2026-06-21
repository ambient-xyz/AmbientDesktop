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

describe("AgentRuntime provider stream interruption", () => {
  it("asks Pi to continue when a prompt resolves after a tool result without post-tool text", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-resolved-post-tool-continuation-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("resolved post-tool continuation");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });
      const preToolText = "The provider catalog should be checked first.";
      const finalText = "Brave Search is available after the provider catalog check.";
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
            emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: preToolText } });
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "toolUse",
                content: [
                  { type: "text", text: preToolText },
                  { type: "toolCall", id: "call-provider-catalog", name: "ambient_provider_catalog", arguments: {} },
                ],
              },
            });
            emit({
              type: "tool_execution_start",
              toolCallId: "call-provider-catalog",
              toolName: "ambient_provider_catalog",
              args: {},
            });
            emit({
              type: "tool_execution_end",
              toolCallId: "call-provider-catalog",
              toolName: "ambient_provider_catalog",
              result: [{ type: "text", text: "Brave Search API (search.brave)" }],
            });
            resolve();
          }, 0);
        })),
        steer: vi.fn(() => new Promise<void>((resolve) => {
          setTimeout(() => {
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
      const getSession = vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

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
      for (let attempt = 0; attempt < 16; attempt += 1) {
        await vi.advanceTimersByTimeAsync(1);
        if (store.listMessages(thread.id).some((message) => message.content.includes(finalText))) break;
      }
      await sendPromise;

      expect(getSession).toHaveBeenCalledTimes(1);
      expect(session.steer).toHaveBeenCalledTimes(1);
      expect(session.agent.abort).not.toHaveBeenCalled();
      const finalAssistant = store.listMessages(thread.id).filter((message) => message.role === "assistant").at(-1);
      expect(finalAssistant).toMatchObject({
        content: finalText,
        metadata: expect.objectContaining({ status: "done" }),
      });
      expect(runtimeEvents).toContainEqual(expect.objectContaining({
        type: "runtime-activity",
        activity: expect.objectContaining({
          kind: "stream",
          status: "running",
          message: expect.stringContaining("after the prompt resolved without a final answer"),
        }),
      }));
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("surfaces post-output stream stalls without replaying or overwriting partial assistant text", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-post-output-stall-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("post-output stream stall");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });
      const partialText = "I found the provider path and will update the settings";

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
            emit({ type: "message_start", message: { role: "assistant" } });
            emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: partialText } });
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

      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const getSession = vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

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
      await vi.advanceTimersByTimeAsync(30_000);
      await sendPromise;

      const assistantMessages = store.listMessages(thread.id).filter((message) => message.role === "assistant");
      expect(assistantMessages).toHaveLength(1);
      expect(assistantMessages[0].content).toContain(partialText);
      expect(assistantMessages[0].content).toContain(
        "Ambient/Pi provider stream was interrupted. Ambient is starting a continuation turn from the durable recovery state instead of stopping the task.",
      );
      expect(assistantMessages[0].content).toContain("Ambient/Pi stream stalled after 30000ms without stream activity.");
      expect(assistantMessages[0].content).not.toContain("Retrying assistant finalization");
      expect(assistantMessages[0]).toMatchObject({
        metadata: expect.objectContaining({
          status: "done",
          runtime: "pi",
          provider: "ambient",
          providerInterruptionContinuation: true,
          piStreamInterruption: expect.objectContaining({
            kind: "stream_idle_timeout",
            message: "Ambient/Pi stream stalled after 30000ms without stream activity.",
            retryScheduled: true,
            replaySafe: false,
            continuationSafe: true,
            retryReason: "provider_interruption_continuation",
            semanticOutputSeen: true,
            toolCallSeen: false,
            assistantOutputChars: partialText.length,
            thinkingOutputChars: 0,
            toolMessageCount: 0,
            currentAssistantFinalTextChars: partialText.length,
            sessionFile,
          }),
        }),
      });
      expect(getSession).toHaveBeenCalledTimes(1);
      expect(session.prompt).toHaveBeenCalledTimes(1);
      expect(session.agent.abort).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("settles post-output stream stalls when provider continuation setup fails", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-continuation-setup-fails-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("post-output continuation setup failure");
      const threadSessionDir = join(workspace.sessionPath, thread.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const partialText = "I started writing the implementation and will continue from the transcript";

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
            emit({ type: "message_start", message: { role: "assistant" } });
            emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: partialText } });
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

      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);
      vi.spyOn(runtime as any, "commitThreadPiSessionFile").mockRejectedValue(new Error("session pointer write failed"));

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Implement the approved plan.",
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

      const assistantMessages = store.listMessages(thread.id).filter((message) => message.role === "assistant");
      expect(assistantMessages).toHaveLength(1);
      expect(assistantMessages[0].content).toContain(partialText);
      expect(assistantMessages[0].content).toContain("Ambient/Pi stream stalled after 30000ms without stream activity.");
      expect(assistantMessages[0].content).toContain("Ambient could not schedule the provider continuation: session pointer write failed");
      expect(assistantMessages[0]).toMatchObject({
        metadata: expect.objectContaining({
          status: "error",
          providerInterruptionContinuation: true,
          piStreamInterruption: expect.objectContaining({
            kind: "stream_idle_timeout",
            retryScheduled: false,
            continuationSafe: false,
            continuationSetupError: "session pointer write failed",
          }),
        }),
      });
      expect(store.listActiveRuns()).toEqual([]);
      expect(session.agent.abort).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps provider stream idle recovery paused during tool activity and surfaces local tool stalls", async () => {
    vi.useFakeTimers();
    const originalToolIdleTimeout = process.env.AMBIENT_LOCAL_TOOL_IDLE_TIMEOUT_MS;
    process.env.AMBIENT_LOCAL_TOOL_IDLE_TIMEOUT_MS = "30000";
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-post-tool-stall-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("post-tool stream stall");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });

      const subscribers: Array<(event: any) => void> = [];
      const runtimeEvents: any[] = [];
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

      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => runtimeEvents.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(store, {} as any, {} as any, getWindow, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const getSession = vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Check the provider status.",
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
      const toolTimeout = runtimeEvents.find((event) =>
        event.type === "runtime-activity" &&
        event.activity.kind === "tool" &&
        event.activity.status === "timeout"
      );
      expect(toolMessage?.content).toContain("ambient_search_preference_status");
      expect(toolTimeout?.activity.message).toContain("Local tool ambient_search_preference_status stalled after 30000ms without progress.");
      expect(runtimeEvents).not.toContainEqual(expect.objectContaining({
        type: "runtime-activity",
        activity: expect.objectContaining({
          kind: "stream",
          status: "timeout",
          message: "Ambient/Pi stream stalled after 30000ms without stream activity.",
        }),
      }));
      expect(finalAssistant).toMatchObject({
        metadata: expect.objectContaining({
          status: "error",
          runtime: "pi",
          provider: "ambient",
        }),
      });
      expect(getSession).toHaveBeenCalledTimes(1);
      expect(session.prompt).toHaveBeenCalledTimes(1);
      expect(session.agent.abort).toHaveBeenCalledTimes(1);
    } finally {
      if (originalToolIdleTimeout === undefined) delete process.env.AMBIENT_LOCAL_TOOL_IDLE_TIMEOUT_MS;
      else process.env.AMBIENT_LOCAL_TOOL_IDLE_TIMEOUT_MS = originalToolIdleTimeout;
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("pauses Pi stream idle recovery while a Desktop permission prompt is waiting", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-permission-wait-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("permission wait");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile, permissionMode: "workspace" });

      const runtimeEvents: any[] = [];
      const subscribers: Array<(event: any) => void> = [];
      let resolvePermission!: (resolution: { allowed: boolean; mode: "allow_once" }) => void;
      const permissionPrompt = new Promise<{ allowed: boolean; mode: "allow_once" }>((resolve) => {
        resolvePermission = resolve;
      });
      const permissionRequester = vi.fn(async () => permissionPrompt);
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      let runtime!: AgentRuntime;
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
        prompt: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              setTimeout(async () => {
                emit({
                  type: "tool_execution_start",
                  toolCallId: "call-scrapling-fetch",
                  toolName: "ambient_mcp_tool_call",
                  args: { toolName: "fetch", arguments: { url: "https://monsoonpcs.com/store/" } },
                });
                const allowed = await (runtime as any).resolveFirstPartyPluginPermission({
                  thread: store.getThread(thread.id),
                  workspace,
                  toolName: "ambient_mcp_tool_call",
                  title: "Read https://monsoonpcs.com/store/ with Scrapling?",
                  message: "Ambient wants to call the configured MCP-backed page-read provider.",
                  detail: "Call Ambient MCP tool io.github.d4vinci/scrapling/fetch for https://monsoonpcs.com/store/.",
                  grantTargetLabel: "Call MCP tool io.github.d4vinci/scrapling/fetch",
                  grantTargetIdentity: "io.github.d4vinci/scrapling/fetch\0https://monsoonpcs.com/store/",
                  allowedReason: "MCP tool call approved by Ambient permission grant policy.",
                  deniedReason: "MCP tool call prompt denied or timed out.",
                });
                emit({
                  type: "tool_execution_end",
                  toolCallId: "call-scrapling-fetch",
                  toolName: "ambient_mcp_tool_call",
                  isError: !allowed,
                  result: [{ type: "text", text: allowed ? "Scrapling returned current store inventory." : "Permission denied." }],
                });
                emit({
                  type: "message_end",
                  message: {
                    role: "assistant",
                    stopReason: "stop",
                    content: [{ type: "text", text: "I checked the current store page after approval." }],
                  },
                });
                resolve();
              }, 0);
            }),
        ),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      runtime = new AgentRuntime(
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
          request: permissionRequester,
          denyThread: () => undefined,
        },
      );
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Check whether Monsoon PCs has the latest workstation card in stock.",
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(permissionRequester).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(session.agent.abort).not.toHaveBeenCalled();
      expect(store.listMessages(thread.id).map((message) => message.content).join("\n")).not.toContain("Ambient/Pi stream stalled");

      resolvePermission({ allowed: true, mode: "allow_once" });
      await vi.advanceTimersByTimeAsync(0);
      await sendPromise;

      const messages = store.listMessages(thread.id);
      const finalAssistant = messages.filter((message) => message.role === "assistant").at(-1);
      expect(finalAssistant?.content).toBe("I checked the current store page after approval.");
      expect(finalAssistant?.metadata?.providerInterruptionContinuation).not.toBe(true);
      expect(session.agent.abort).not.toHaveBeenCalled();
      expect(runtimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "runtime-activity",
          activity: expect.objectContaining({
            kind: "permission",
            status: "waiting",
            toolName: "ambient_mcp_tool_call",
          }),
        }),
        expect.objectContaining({
          type: "runtime-activity",
          activity: expect.objectContaining({
            kind: "permission",
            status: "finished",
            toolName: "ambient_mcp_tool_call",
            allowed: true,
            mode: "allow_once",
          }),
        }),
      ]));
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
