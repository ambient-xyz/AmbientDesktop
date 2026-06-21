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

describe("AgentRuntime provider error continuation", () => {
  it("schedules a continuation turn when the provider errors during a long tool argument stream", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-interrupted-tool-provider-error-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("interrupted long write provider error");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });

      const subscribers: Array<(event: any) => void> = [];
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
        prompt: vi.fn(
          () =>
            new Promise<never>((_resolve, reject) => {
              setTimeout(() => {
                emit({
                  type: "message_update",
                  assistantMessageEvent: {
                    type: "toolcall_delta",
                    toolCall: {
                      id: "call-long-write-provider-error",
                      name: "write",
                      arguments: JSON.stringify(toolArguments),
                    },
                  },
                });
                reject(new Error("Upstream error"));
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
      await sendPromise;

      const messages = store.listMessages(thread.id);
      const finalAssistant = messages.filter((message) => message.role === "assistant").at(-1);
      const toolMessage = messages.find((message) => message.role === "tool");
      const recovery = (toolMessage?.metadata?.toolArgumentProgress as any)?.interruptedToolCallRecovery;
      expect(toolMessage?.content).toContain("write interrupted");
      expect(toolMessage?.metadata?.status).toBe("error");
      expect(recovery).toMatchObject({
        status: "recoverable",
        toolCallId: "call-long-write-provider-error",
        toolName: "write",
        source: "raw_tool_input",
        parseStatus: "valid_json",
      });
      const recoveredArguments = JSON.parse(await readFile(recovery.argumentPath, "utf8"));
      expect(recoveredArguments.content).toBe(longContent);
      expect(finalAssistant?.content).toContain("Upstream error");
      expect(finalAssistant?.content).toContain("Ambient/Pi stream interrupted while preparing a large tool call.");
      expect(finalAssistant?.content).toContain("Ambient is starting a continuation turn");
      expect(finalAssistant).toMatchObject({
        metadata: expect.objectContaining({
          status: "done",
          recoveringInterruptedToolCall: true,
          piStreamInterruption: expect.objectContaining({
            kind: "provider_error_event",
            message: "Upstream error",
            retryScheduled: true,
            replaySafe: true,
            retryReason: "interrupted_tool_call_recovery",
          }),
        }),
      });
      expect(store.getThread(thread.id).piSessionFile).toBeUndefined();
      expect(getSession).toHaveBeenCalledTimes(1);
      expect(session.prompt).toHaveBeenCalledTimes(1);
      expect(session.agent.abort).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("continues from durable state when a retryable provider error happens before a short tool call executes", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-short-tool-provider-error-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("short tool provider error");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });

      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const toolArguments = { targetUrl: "https://github.com/firecrawl/firecrawl-mcp-server" };
      const fetchArguments = {
        url: "https://monsoonpcs.com/store/",
        purpose: "verify current Monsoon PCs inventory",
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
        prompt: vi.fn(
          () =>
            new Promise<never>((_resolve, reject) => {
              setTimeout(() => {
                emit({
                  type: "message_update",
                  assistantMessageEvent: {
                    type: "toolcall_end",
                    toolCall: {
                      id: "call-autowire-provider-error",
                      name: "ambient_mcp_autowire_plan",
                      arguments: JSON.stringify(toolArguments),
                    },
                  },
                });
                emit({
                  type: "message_update",
                  assistantMessageEvent: {
                    type: "toolcall_end",
                    toolCall: {
                      id: "call-fetch-provider-error",
                      name: "web_research_fetch",
                      arguments: JSON.stringify(fetchArguments),
                    },
                  },
                });
                reject(
                  Object.assign(new Error("Upstream error"), {
                    status: 502,
                    code: "bad_gateway",
                    requestId: "req_123",
                    body: "model overloaded Bearer abcdefghijklmnop",
                    headers: {
                      "cf-ray": "cf-ray-123",
                      "retry-after": "3",
                      authorization: "Bearer should-not-leak",
                    },
                  }),
                );
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

      const runtimeEvents: any[] = [];
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
      const updateRunDiagnostics = vi.spyOn(store, "updateRunDiagnostics");

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Plan this MCP autowire.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await sendPromise;

      const messages = store.listMessages(thread.id);
      const finalAssistant = messages.filter((message) => message.role === "assistant").at(-1);
      const toolMessage = messages.find((message) => message.role === "tool");
      expect(toolMessage?.content).toContain("ambient_mcp_autowire_plan interrupted");
      expect(toolMessage?.content).toContain("failed before this tool executed");
      expect(toolMessage?.metadata?.status).toBe("error");
      expect(finalAssistant?.content).toContain("Ambient/Pi provider stream was interrupted");
      expect(finalAssistant?.content).toContain("Status: 502");
      expect(finalAssistant?.content).toContain("Code: bad_gateway");
      expect(finalAssistant?.content).toContain("Request id: req_123");
      expect(finalAssistant?.content).toContain("Trace id: cf-ray-123");
      expect(finalAssistant?.content).toContain("Retry after: 3");
      expect(finalAssistant?.content).toContain("Detail: model overloaded Bearer [REDACTED]");
      expect(finalAssistant?.content).not.toContain("abcdefghijklmnop");
      expect(JSON.stringify(finalAssistant?.metadata)).not.toContain("should-not-leak");
      expect(finalAssistant?.metadata?.providerContinuationState).toMatchObject({
        version: 1,
        provider: "ambient",
        failure: { kind: "provider_error_event", message: "Upstream error" },
        retry: expect.objectContaining({
          scheduled: true,
          replaySafe: true,
          continuationSafe: true,
          usesFreshSession: false,
          reason: "provider_interruption_continuation",
        }),
        stream: expect.objectContaining({
          firstEventType: "message_update",
          idleSource: "provider_error_event",
        }),
        tools: expect.objectContaining({
          completedToolMessageCount: 0,
          open: expect.arrayContaining([
            expect.objectContaining({
              toolCallId: "call-autowire-provider-error",
              toolName: "ambient_mcp_autowire_plan",
              status: "interrupted",
              certainty: "prepared_only",
              executionStarted: false,
              mayHaveSideEffects: false,
              argumentComplete: true,
              inputPreview: expect.stringContaining("firecrawl"),
              intent: expect.objectContaining({
                version: 1,
                toolCallId: "call-autowire-provider-error",
                toolName: "ambient_mcp_autowire_plan",
                operationKind: "tool_execution",
                targetSummary: "https://github.com/firecrawl/firecrawl-mcp-server",
                materiality: "important",
                substituteAllowed: false,
              }),
              workspaceRelativeRecoveryArgumentPath: expect.stringMatching(
                /^\.ambient-codex\/interrupted-tool-calls\/.*\/call-autowire-provider-error\.prepared-args\.txt$/,
              ),
            }),
            expect.objectContaining({
              toolCallId: "call-fetch-provider-error",
              toolName: "web_research_fetch",
              status: "interrupted",
              certainty: "prepared_only",
              executionStarted: false,
              mayHaveSideEffects: false,
              argumentComplete: true,
              inputPreview: expect.stringContaining("monsoonpcs"),
              intent: expect.objectContaining({
                version: 1,
                toolCallId: "call-fetch-provider-error",
                toolName: "web_research_fetch",
                declaredPurpose: "verify current Monsoon PCs inventory",
                operationKind: "verify_specific_source",
                targetSummary: "https://monsoonpcs.com/store/",
                materiality: "required_before_final_answer",
                substituteAllowed: true,
              }),
              workspaceRelativeRecoveryArgumentPath: expect.stringMatching(
                /^\.ambient-codex\/interrupted-tool-calls\/.*\/call-fetch-provider-error\.prepared-args\.txt$/,
              ),
            }),
          ]),
          interrupted: expect.arrayContaining([
            expect.objectContaining({
              toolCallId: "call-autowire-provider-error",
              status: "interrupted",
            }),
            expect.objectContaining({
              toolCallId: "call-fetch-provider-error",
              status: "interrupted",
            }),
          ]),
        }),
      });
      expect(updateRunDiagnostics).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          providerContinuationState: expect.objectContaining({
            stateId: expect.stringMatching(/^provider-continuation-/),
            tools: expect.objectContaining({
              mayHaveSideEffects: [],
            }),
          }),
        }),
      );
      expect(finalAssistant).toMatchObject({
        metadata: expect.objectContaining({
          status: "done",
          retryingProviderError: true,
          providerInterruptionContinuation: true,
          piStreamInterruption: expect.objectContaining({
            kind: "provider_error_event",
            retryScheduled: true,
            replaySafe: true,
            continuationSafe: true,
            retryReason: "provider_interruption_continuation",
            runStartedAt: expect.any(String),
            firstStreamEventAt: expect.any(String),
            firstToolArgumentAt: expect.any(String),
            providerRetryAttemptCount: 1,
            providerRetryLastError: "Upstream error",
            providerErrorDiagnostic: expect.objectContaining({
              status: 502,
              code: "bad_gateway",
              requestId: "req_123",
              traceId: "cf-ray-123",
              retryAfter: "3",
              bodyPreview: "model overloaded Bearer [REDACTED]",
              detailPreview: "model overloaded Bearer [REDACTED]",
              headers: expect.objectContaining({
                "cf-ray": "cf-ray-123",
                "retry-after": "3",
              }),
            }),
            providerFailureDiagnostic: expect.objectContaining({
              diagnosticId: expect.stringMatching(/^provider-failure-/),
              providerId: "ambient",
              model: expect.any(String),
              kind: "provider_error_event",
              message: "Upstream error",
              httpStatus: 502,
              errorCode: "bad_gateway",
              requestId: "req_123",
              traceId: "cf-ray-123",
              retryAfter: "3",
              providerErrorBodyPreview: "model overloaded Bearer [REDACTED]",
              stream: expect.objectContaining({
                eventCount: expect.any(Number),
                approximatePayloadBytes: expect.any(Number),
                firstEventAt: expect.any(String),
                firstEventType: "message_update",
                lastEventAt: expect.any(String),
                lastEventType: "message_update",
                idleSource: "provider_error_event",
                firstToolArgumentAt: expect.any(String),
                assistantOutputChars: 0,
                thinkingOutputChars: 0,
                semanticOutputSeen: false,
                receivedAnyText: false,
              }),
              retry: expect.objectContaining({
                scheduled: true,
                replaySafe: true,
                continuationSafe: true,
                usesFreshSession: false,
                attempt: 1,
                maxRetries: expect.any(Number),
                reason: "provider_interruption_continuation",
                providerRetryAttemptCount: 1,
                providerRetryLastError: "Upstream error",
              }),
              transcript: expect.objectContaining({
                toolCallSeen: true,
                toolMessageCount: 2,
                openToolCallCount: 2,
                completedToolMessageCount: 0,
              }),
            }),
          }),
        }),
      });
      expect(runtimeEvents).toContainEqual(expect.objectContaining({
        type: "runtime-activity",
        activity: expect.objectContaining({
          kind: "retry",
          status: "starting",
          attempt: 1,
          message: "Provider interrupted the stream; continuing from transcript: Upstream error",
        }),
      }));
      const openTools = (finalAssistant?.metadata?.providerContinuationState as any)?.tools?.open ?? [];
      const openToolState = openTools.find((tool: any) => tool.toolCallId === "call-autowire-provider-error");
      const fetchToolState = openTools.find((tool: any) => tool.toolCallId === "call-fetch-provider-error");
      expect(finalAssistant?.content).toContain("certainty=prepared_only");
      expect(finalAssistant?.content).toContain("intent: tool_execution; important; target=https://github.com/firecrawl/firecrawl-mcp-server; no_substitute");
      expect(finalAssistant?.content).toContain("intent: verify_specific_source; required_before_final_answer; target=https://monsoonpcs.com/store/; purpose=verify current Monsoon PCs inventory; substitute_allowed");
      expect(openToolState?.recoveryArgumentPath).toEqual(expect.stringContaining("call-autowire-provider-error.prepared-args.txt"));
      expect(await readFile(openToolState.recoveryArgumentPath, "utf8")).toContain(toolArguments.targetUrl);
      expect(fetchToolState?.recoveryArgumentPath).toEqual(expect.stringContaining("call-fetch-provider-error.prepared-args.txt"));
      expect(await readFile(fetchToolState.recoveryArgumentPath, "utf8")).toContain(fetchArguments.purpose);
      expect(store.getThread(thread.id).piSessionFile).toBe(sessionFile);
      expect(getSession).toHaveBeenCalledTimes(1);
      expect(session.prompt).toHaveBeenCalledTimes(1);
      expect(session.dispose).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("drops a reused Pi session after a pre-output provider retry recovers", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-provider-retry-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("provider retry");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });
      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const finalText = "Brave Search is available. I can start the plan once the API key is captured.";
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
            emit({
              type: "auto_retry_start",
              attempt: 1,
              maxAttempts: 3,
              delayMs: 250,
              errorMessage: "429 Upstream request failed",
            });
            emit({
              type: "auto_retry_end",
              success: true,
              attempt: 1,
            });
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
            sessionDiscarded: true,
            sessionFile,
            lastError: "429 Upstream request failed",
          }),
        }),
      });
      expect(store.getThread(thread.id).piSessionFile).toBeUndefined();
      expect(session.dispose).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });});
