import { describe, expect, it, vi } from "vitest";
import { Type, type Context, type SimpleStreamOptions, type ToolCall } from "@mariozechner/pi-ai";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { AmbientStreamFailureError, aggressiveAmbientRetryPolicy, isRetryableAmbientProviderError } from "./workflowAmbientFacade";
import {
  ambientJsonSchemaResponseFormat,
  callWorkflowPiJson,
  callWorkflowPiText,
  DEFAULT_WORKFLOW_PI_IDLE_TIMEOUT_MS,
  normalizeAmbientResponseSchemaName,
} from "./workflowPiTransport";

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason ?? new Error("aborted"));
      },
      { once: true },
    );
  });
}

describe("callWorkflowPiText", () => {
  it("omits reasoning when thinking is disabled", async () => {
    let capturedOptions: SimpleStreamOptions | undefined;
    await callWorkflowPiText({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      prompt: "Return OK",
      reasoning: false,
      streamFactory: async function* (_model, _context, options) {
        capturedOptions = options;
        yield { type: "text_delta", delta: "OK" };
        yield { type: "done" };
      },
    });

    expect(capturedOptions).not.toHaveProperty("reasoning");
    expect(capturedOptions?.onPayload?.({ model: AMBIENT_DEFAULT_MODEL }, {} as never)).toEqual({
      model: AMBIENT_DEFAULT_MODEL,
      thinking: { type: "disabled" },
      reasoning: { effort: "none", enabled: false, exclude: true },
      enable_thinking: false,
    });
  });

  it("can request JSON-object responses through the Pi transport payload", async () => {
    let capturedOptions: SimpleStreamOptions | undefined;
    await callWorkflowPiText({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      prompt: "Return JSON",
      responseFormat: { type: "json_object" },
      streamFactory: async function* (_model, _context, options) {
        capturedOptions = options;
        yield { type: "text_delta", delta: "{\"ok\":true}" };
        yield { type: "done" };
      },
    });

    expect(capturedOptions?.onPayload?.({ model: AMBIENT_DEFAULT_MODEL }, {} as never)).toEqual({
      model: AMBIENT_DEFAULT_MODEL,
      response_format: { type: "json_object" },
    });
  });

  it("defaults provider stream idle progress to thirty seconds", async () => {
    const progress: Array<{ idleTimeoutMs?: number }> = [];
    await callWorkflowPiText({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      prompt: "Return OK",
      onProgress: (event) => progress.push({ idleTimeoutMs: event.idleTimeoutMs }),
      streamFactory: async function* () {
        yield { type: "text_delta", delta: "OK" };
        yield { type: "done" };
      },
    });

    expect(DEFAULT_WORKFLOW_PI_IDLE_TIMEOUT_MS).toBe(30_000);
    expect(progress.some((event) => event.idleTimeoutMs === 30_000)).toBe(true);
  });

  it("can request strict JSON-schema responses through the Pi transport payload", async () => {
    let capturedOptions: SimpleStreamOptions | undefined;
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["ok"],
      properties: { ok: { type: "boolean" } },
    };

    await callWorkflowPiText({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      prompt: "Return JSON",
      responseFormat: ambientJsonSchemaResponseFormat({ name: "Workflow Program IR!", schema }),
      streamFactory: async function* (_model, _context, options) {
        capturedOptions = options;
        yield { type: "text_delta", delta: "{\"ok\":true}" };
        yield { type: "done" };
      },
    });

    expect(normalizeAmbientResponseSchemaName("Workflow Program IR!")).toBe("Workflow_Program_IR");
    expect(capturedOptions?.onPayload?.({ model: AMBIENT_DEFAULT_MODEL }, {} as never)).toEqual({
      model: AMBIENT_DEFAULT_MODEL,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "Workflow_Program_IR",
          strict: true,
          schema,
        },
      },
    });
  });

  it("calls Pi for JSON with schema format, strict parsing, and validator retry feedback", async () => {
    const prompts: string[] = [];
    const payloads: unknown[] = [];
    let attempts = 0;
    const result = await callWorkflowPiJson<{ ok: true }>({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      prompt: "Return the object.",
      schemaName: "retry schema",
      responseSchema: {
        type: "object",
        additionalProperties: false,
        required: ["ok"],
        properties: { ok: { const: true } },
      },
      validate: (value) => {
        if (!value || typeof value !== "object" || Array.isArray(value) || (value as { ok?: unknown }).ok !== true) {
          throw new Error("ok must be true");
        }
        return value as { ok: true };
      },
      maxValidationRetries: 1,
      streamFactory: async function* (_model, context, options) {
        attempts += 1;
        prompts.push(String(context.messages[0]?.content ?? ""));
        payloads.push(options.onPayload?.({ model: AMBIENT_DEFAULT_MODEL }, {} as never));
        yield { type: "text_delta", delta: attempts === 1 ? "{\"ok\":false}" : "{\"ok\":true}" };
        yield { type: "done" };
      },
    });

    expect(result).toEqual({ ok: true });
    expect(attempts).toBe(2);
    expect(prompts[1]).toContain("Previous response failed deterministic JSON validation");
    expect(payloads[0]).toEqual({
      model: AMBIENT_DEFAULT_MODEL,
      thinking: { type: "disabled" },
      reasoning: { effort: "none", enabled: false, exclude: true },
      enable_thinking: false,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "retry_schema",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["ok"],
            properties: { ok: { const: true } },
          },
        },
      },
    });
  });

  it("repairs fenced, prose-wrapped, and trailing-comma JSON before schema validation", async () => {
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["ok"],
      properties: { ok: { const: true } },
    };
    const responses = [
      "```json\n{\"ok\":true}\n```",
      "Here is the repaired object:\n{\"ok\":true}\nDone.",
      "{\"ok\":true,}",
    ];

    for (const response of responses) {
      let attempts = 0;
      const result = await callWorkflowPiJson<{ ok: true }>({
        apiKey: "test-key",
        model: AMBIENT_DEFAULT_MODEL,
        prompt: "Return the object.",
        schemaName: "repair schema",
        responseSchema: schema,
        validate: (value) => {
          if (!value || typeof value !== "object" || Array.isArray(value) || (value as { ok?: unknown }).ok !== true) {
            throw new Error("ok must be true");
          }
          return value as { ok: true };
        },
        maxValidationRetries: 1,
        streamFactory: async function* () {
          attempts += 1;
          yield { type: "text_delta", delta: response };
          yield { type: "done" };
        },
      });

      expect(result).toEqual({ ok: true });
      expect(attempts).toBe(1);
    }
  });

  it("reports completion metadata from the final Pi assistant message", async () => {
    const completed: unknown[] = [];
    const text = await callWorkflowPiText({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      prompt: "Return JSON",
      maxTokens: 128,
      onCompleted: (metadata) => completed.push(metadata),
      streamFactory: async function* () {
        yield { type: "text_delta", delta: "{\"partial\":true}" };
        yield {
          type: "done",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "{\"partial\":true}" }],
            api: "openai-completions",
            provider: "ambient",
            model: AMBIENT_DEFAULT_MODEL,
            usage: emptyUsage(),
            stopReason: "length",
            timestamp: Date.now(),
          },
        };
      },
    });

    expect(text).toBe("{\"partial\":true}");
    expect(completed).toEqual([
      expect.objectContaining({
        finishReason: "length",
        stopReason: "length",
        outputChars: 16,
        maxTokens: 128,
        toolRound: 0,
      }),
    ]);
  });

  it("executes tool calls and continues the same Pi request context with tool results", async () => {
    const contexts: Context[] = [];
    const toolProgress: string[] = [];
    const toolCall: ToolCall = {
      type: "toolCall",
      id: "tool-1",
      name: "echo_tool",
      arguments: { text: "hello" },
    };
    const text = await callWorkflowPiText({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      prompt: "Use the tool, then return JSON.",
      tools: [
        {
          name: "echo_tool",
          description: "Echo text.",
          parameters: Type.Object({
            text: Type.String(),
          }),
        },
      ],
      executeTool: async (_toolCall, args) => ({ text: JSON.stringify({ ok: true, args }) }),
      onToolProgress: (progress) => toolProgress.push(`${progress.toolName}:${progress.status}`),
      streamFactory: async function* (_model, context) {
        contexts.push(context);
        if (context.messages.some((message) => message.role === "toolResult")) {
          yield { type: "text_delta", delta: "{\"done\":true}" };
          yield { type: "done" };
          return;
        }
        yield { type: "toolcall_end", toolCall };
        yield {
          type: "done",
          message: {
            role: "assistant",
            content: [toolCall],
            api: "openai-completions",
            provider: "ambient",
            model: AMBIENT_DEFAULT_MODEL,
            usage: emptyUsage(),
            stopReason: "toolUse",
            timestamp: Date.now(),
          },
        };
      },
    });

    expect(text).toBe("{\"done\":true}");
    expect(contexts).toHaveLength(2);
    expect(contexts[0].tools?.map((tool) => tool.name)).toEqual(["echo_tool"]);
    expect(contexts[1].messages.map((message) => message.role)).toEqual(["user", "assistant", "toolResult"]);
    expect(toolProgress).toEqual(["echo_tool:running", "echo_tool:done"]);
  });

  it("emits running heartbeats while a tool call is still executing", async () => {
    vi.useFakeTimers();
    try {
      const progress: Array<{ toolName: string; status: string; elapsedMs?: number; resultSummary?: string }> = [];
      let releaseTool!: () => void;
      const toolCall: ToolCall = {
        type: "toolCall",
        id: "tool-1",
        name: "slow_tool",
        arguments: { url: "https://example.com" },
      };
      const request = callWorkflowPiText({
        apiKey: "test-key",
        model: AMBIENT_DEFAULT_MODEL,
        prompt: "Use the slow tool, then return DONE.",
        tools: [
          {
            name: "slow_tool",
            description: "Waits until the test releases it.",
            parameters: Type.Object({
              url: Type.String(),
            }),
          },
        ],
        executeTool: async () => {
          await new Promise<void>((resolve) => {
            releaseTool = resolve;
          });
          return "slow result";
        },
        onToolProgress: (event) => progress.push(event),
        streamFactory: async function* (_model, context) {
          if (context.messages.some((message) => message.role === "toolResult")) {
            yield { type: "text_delta", delta: "DONE" };
            yield { type: "done" };
            return;
          }
          yield { type: "toolcall_end", toolCall };
          yield {
            type: "done",
            message: {
              role: "assistant",
              content: [toolCall],
              api: "openai-completions",
              provider: "ambient",
              model: AMBIENT_DEFAULT_MODEL,
              usage: emptyUsage(),
              stopReason: "toolUse",
              timestamp: Date.now(),
            },
          };
        },
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(progress.map((event) => `${event.toolName}:${event.status}`)).toEqual(["slow_tool:running"]);

      await vi.advanceTimersByTimeAsync(5_000);
      expect(progress.map((event) => `${event.toolName}:${event.status}`)).toEqual([
        "slow_tool:running",
        "slow_tool:running",
      ]);
      expect(progress[1]).toMatchObject({
        elapsedMs: 5_000,
        resultSummary: "Still running after 5s.",
      });

      releaseTool();
      await expect(request).resolves.toBe("DONE");
      expect(progress.map((event) => `${event.toolName}:${event.status}`)).toEqual([
        "slow_tool:running",
        "slow_tool:running",
        "slow_tool:done",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows bounded multi-step tool workflows above the historical eight-round cap", async () => {
    const targetToolExecutions = 12;
    const contexts: Context[] = [];
    let toolExecutions = 0;
    const text = await callWorkflowPiText({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      prompt: "Use the counter tool until the workflow is complete.",
      tools: [
        {
          name: "counter_tool",
          description: "Advances a deterministic counter.",
          parameters: Type.Object({
            step: Type.Number(),
          }),
        },
      ],
      maxToolRounds: targetToolExecutions,
      executeTool: async (_toolCall, args) => {
        toolExecutions += 1;
        return JSON.stringify({ ok: true, args, toolExecutions });
      },
      streamFactory: async function* (_model, context) {
        contexts.push(context);
        const completedSteps = context.messages.filter((message) => message.role === "toolResult").length;
        if (completedSteps >= targetToolExecutions) {
          yield { type: "text_delta", delta: "DONE" };
          yield { type: "done" };
          return;
        }
        const toolCall: ToolCall = {
          type: "toolCall",
          id: `tool-${completedSteps + 1}`,
          name: "counter_tool",
          arguments: { step: completedSteps + 1 },
        };
        yield { type: "toolcall_end", toolCall };
        yield {
          type: "done",
          message: {
            role: "assistant",
            content: [toolCall],
            api: "openai-completions",
            provider: "ambient",
            model: AMBIENT_DEFAULT_MODEL,
            usage: emptyUsage(),
            stopReason: "toolUse",
            timestamp: Date.now(),
          },
        };
      },
    });

    expect(text).toBe("DONE");
    expect(toolExecutions).toBe(targetToolExecutions);
    expect(contexts).toHaveLength(targetToolExecutions + 1);
  });

  it("keeps the idle watchdog alive while thinking deltas arrive", async () => {
    const progress: Array<{ outputChars: number; thinkingChars: number; stage: string; idleElapsedMs?: number; idleTimeoutMs?: number; timeoutMode?: string }> = [];
    const text = await callWorkflowPiText({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      prompt: "Return JSON",
      reasoning: "low",
      idleTimeoutMs: 25,
      absoluteTimeoutMs: 250,
      onProgress: (event) =>
        progress.push({
          outputChars: event.outputChars,
          thinkingChars: event.thinkingChars,
          stage: event.stage,
          idleElapsedMs: event.idleElapsedMs,
          idleTimeoutMs: event.idleTimeoutMs,
          timeoutMode: event.timeoutMode,
        }),
      streamFactory: async function* (_model, _context, options) {
        const signal = options.signal as AbortSignal | undefined;
        yield { type: "thinking_delta", delta: "thinking " };
        await delay(10, signal);
        yield { type: "thinking_delta", delta: "more " };
        await delay(10, signal);
        yield { type: "text_delta", delta: "{\"ok\":true}" };
        yield { type: "done" };
      },
    });

    expect(text).toBe("{\"ok\":true}");
    expect(progress.some((event) => event.stage === "thinking" && event.thinkingChars > 0)).toBe(true);
    expect(progress.every((event) => event.idleTimeoutMs === 25)).toBe(true);
    expect(progress.every((event) => event.timeoutMode === "idle_watchdog")).toBe(true);
    expect(progress.some((event) => event.idleElapsedMs !== undefined && event.idleElapsedMs < 25)).toBe(true);
    expect(progress.at(-1)).toMatchObject({ stage: "completed", outputChars: 11 });
  });

  it("does not enforce elapsed absolute timeouts unless explicitly requested", async () => {
    let capturedOptions: SimpleStreamOptions | undefined;
    const text = await callWorkflowPiText({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      prompt: "Return JSON",
      reasoning: "low",
      idleTimeoutMs: 40,
      absoluteTimeoutMs: 15,
      streamFactory: async function* (_model, _context, options) {
        capturedOptions = options;
        const signal = options.signal as AbortSignal | undefined;
        yield { type: "thinking_delta", delta: "still active " };
        await delay(20, signal);
        yield { type: "text_delta", delta: "{\"ok\":true}" };
        yield { type: "done" };
      },
    });

    expect(text).toBe("{\"ok\":true}");
    expect(capturedOptions?.timeoutMs).toBeUndefined();
  });

  it("can still enforce an explicit elapsed absolute timeout", async () => {
    const progress: Array<{ timeoutMode?: string; absoluteTimeoutMs?: number }> = [];
    await expect(
      callWorkflowPiText({
        apiKey: "test-key",
        model: AMBIENT_DEFAULT_MODEL,
        prompt: "Return JSON",
        idleTimeoutMs: 250,
        absoluteTimeoutMs: 15,
        enforceAbsoluteTimeout: true,
        onProgress: (event) => progress.push({ timeoutMode: event.timeoutMode, absoluteTimeoutMs: event.absoluteTimeoutMs }),
        streamFactory: async function* (_model, _context, options) {
          const signal = options.signal as AbortSignal | undefined;
          yield { type: "thinking_delta", delta: "thinking" };
          await delay(40, signal);
          yield { type: "text_delta", delta: "{\"ok\":true}" };
        },
      }),
    ).rejects.toThrow("absolute progress deadline");
    expect(progress.some((event) => event.timeoutMode === "elapsed_hard_limit" && event.absoluteTimeoutMs === 15)).toBe(true);
  });

  it("fails with an idle timeout when the stream stops producing activity", async () => {
    let failure: unknown;
    try {
      await callWorkflowPiText({
        apiKey: "test-key",
        model: AMBIENT_DEFAULT_MODEL,
        prompt: "Return JSON",
        idleTimeoutMs: 15,
        absoluteTimeoutMs: 250,
        streamFactory: async function* (_model, _context, options) {
          const signal = options.signal as AbortSignal | undefined;
          yield { type: "thinking_delta", delta: "thinking" };
          await delay(60, signal);
          yield { type: "text_delta", delta: "{\"ok\":true}" };
        },
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AmbientStreamFailureError);
    expect(failure).toMatchObject({ kind: "stream_idle_timeout", semanticOutputSeen: true, responseCharCount: 8 });
    expect(failure).toHaveProperty("message", "Ambient/Pi stream stalled after 15ms without stream activity.");
    expect(isRetryableAmbientProviderError(failure)).toBe(false);
  });

  it("fails with an idle timeout when the stream never yields an event", async () => {
    let failure: unknown;
    try {
      await callWorkflowPiText({
        apiKey: "test-key",
        model: AMBIENT_DEFAULT_MODEL,
        prompt: "Return JSON",
        idleTimeoutMs: 15,
        absoluteTimeoutMs: 250,
        streamFactory: async function* () {
          await new Promise(() => undefined);
        },
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AmbientStreamFailureError);
    expect(failure).toMatchObject({ kind: "pre_stream_timeout", semanticOutputSeen: false, responseCharCount: 0 });
    expect(failure).toHaveProperty("message", "Ambient/Pi did not start streaming within 15ms.");
    expect(isRetryableAmbientProviderError(failure)).toBe(true);
  });

  it("classifies a pre-output stream close as replay-safe", async () => {
    let failure: unknown;
    try {
      await callWorkflowPiText({
        apiKey: "test-key",
        model: AMBIENT_DEFAULT_MODEL,
        prompt: "Return JSON",
        idleTimeoutMs: 250,
        streamFactory: async function* () {
          return;
        },
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AmbientStreamFailureError);
    expect(failure).toMatchObject({ kind: "stream_closed_before_done", semanticOutputSeen: false, responseCharCount: 0 });
    expect(isRetryableAmbientProviderError(failure)).toBe(true);
  });

  it("retries replay-safe pre-output stream failures with the supplied retry policy", async () => {
    const retryDelays: number[] = [];
    let attempts = 0;
    const text = await callWorkflowPiText({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      prompt: "Return JSON",
      idleTimeoutMs: 250,
      retryPolicy: aggressiveAmbientRetryPolicy({ maxRetries: 2, backoffMs: [1, 2] }),
      waitForRetry: async (delayMs) => void retryDelays.push(delayMs),
      streamFactory: async function* () {
        attempts += 1;
        if (attempts < 3) {
          yield { type: "error", error: { errorMessage: "429 Upstream request failed" } as never };
          return;
        }
        yield { type: "text_delta", delta: "{\"ok\":true}" };
        yield { type: "done" };
      },
    });

    expect(text).toBe("{\"ok\":true}");
    expect(attempts).toBe(3);
    expect(retryDelays).toEqual([1, 2]);
  });

  it("does not retry interrupted streams after assistant output", async () => {
    let attempts = 0;
    await expect(
      callWorkflowPiText({
        apiKey: "test-key",
        model: AMBIENT_DEFAULT_MODEL,
        prompt: "Return JSON",
        idleTimeoutMs: 250,
        retryPolicy: aggressiveAmbientRetryPolicy({ maxRetries: 2, backoffMs: [1, 2] }),
        waitForRetry: async () => undefined,
        streamFactory: async function* () {
          attempts += 1;
          yield { type: "text_delta", delta: "{\"partial\":" };
          yield { type: "error", error: { errorMessage: "429 Upstream request failed" } as never };
        },
      }),
    ).rejects.toMatchObject({ kind: "provider_error_event", semanticOutputSeen: true });
    expect(attempts).toBe(1);
  });

  it("does not classify an interrupted post-tool stream as replay-safe", async () => {
    const toolCall: ToolCall = {
      type: "toolCall",
      id: "tool-1",
      name: "echo_tool",
      arguments: { text: "hello" },
    };
    let toolExecutions = 0;
    let failure: unknown;
    try {
      await callWorkflowPiText({
        apiKey: "test-key",
        model: AMBIENT_DEFAULT_MODEL,
        prompt: "Use the tool, then return JSON.",
        tools: [
          {
            name: "echo_tool",
            description: "Echo text.",
            parameters: Type.Object({
              text: Type.String(),
            }),
          },
        ],
        executeTool: async () => {
          toolExecutions += 1;
          return JSON.stringify({ ok: true });
        },
        streamFactory: async function* (_model, context) {
          if (context.messages.some((message) => message.role === "toolResult")) return;
          yield { type: "toolcall_end", toolCall };
          yield {
            type: "done",
            message: {
              role: "assistant",
              content: [toolCall],
              api: "openai-completions",
              provider: "ambient",
              model: AMBIENT_DEFAULT_MODEL,
              usage: emptyUsage(),
              stopReason: "toolUse",
              timestamp: Date.now(),
            },
          };
        },
      });
    } catch (error) {
      failure = error;
    }

    expect(toolExecutions).toBe(1);
    expect(failure).toBeInstanceOf(AmbientStreamFailureError);
    expect(failure).toMatchObject({ kind: "stream_closed_before_done", toolCallSeen: true });
    expect(isRetryableAmbientProviderError(failure)).toBe(false);
  });

  it("adds stream progress context to Ambient/Pi error events", async () => {
    await expect(
      callWorkflowPiText({
        apiKey: "test-key",
        model: AMBIENT_DEFAULT_MODEL,
        prompt: "Return JSON",
        idleTimeoutMs: 250,
        streamFactory: async function* () {
          yield { type: "thinking_delta", delta: "plan" };
          yield { type: "text_delta", delta: "{\"partial\":" };
          yield { type: "error", error: { errorMessage: "terminated" } as never };
        },
      }),
    ).rejects.toThrow(/terminated after .*11 output chars, 4 thinking chars/);
  });

  it("cancels the stream when an external abort signal fires", async () => {
    const controller = new AbortController();
    const request = callWorkflowPiText({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      prompt: "Return JSON",
      idleTimeoutMs: 250,
      absoluteTimeoutMs: 1_000,
      signal: controller.signal,
      streamFactory: async function* (_model, _context, options) {
        const signal = options.signal as AbortSignal | undefined;
        yield { type: "thinking_delta", delta: "thinking" };
        await delay(1_000, signal);
        yield { type: "text_delta", delta: "{\"ok\":true}" };
      },
    });

    controller.abort(new Error("run aborted"));
    await expect(request).rejects.toThrow("run aborted");
  });
});

function emptyUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}
