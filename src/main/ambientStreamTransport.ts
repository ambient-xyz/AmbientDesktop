import { AmbientStreamFailureError } from "./aggressiveRetries";

export interface AmbientStreamReadOptions {
  idleTimeoutMs: number;
  contentIdleTimeoutMs?: number;
  signal?: AbortSignal;
  onText?: (text: string, totalChars: number) => void;
  onPayload?: (payload: unknown) => void;
  parseText?: (payload: unknown) => string;
  contentActivityToken?: () => unknown;
  stalledMessage?: (input: { idleTimeoutMs: number; responseCharCount: number }) => string;
  contentStalledMessage?: (input: { contentIdleTimeoutMs: number; responseCharCount: number }) => string;
}

export async function readAmbientEventStreamText(
  body: ReadableStream<Uint8Array>,
  options: AmbientStreamReadOptions,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const idleTimeoutMs = Math.max(1, Math.floor(options.idleTimeoutMs));
  const contentIdleTimeoutMs =
    typeof options.contentIdleTimeoutMs === "number" && Number.isFinite(options.contentIdleTimeoutMs)
      ? Math.max(1, Math.floor(options.contentIdleTimeoutMs))
      : undefined;
  let buffer = "";
  let responseText = "";
  let bodyActivitySeen = false;
  let sawTerminalEvent = false;
  let contentTimeout: ReturnType<typeof setTimeout> | undefined;
  let rejectContentIdle: ((error: Error) => void) | undefined;
  let rejectAbort: ((error: Error) => void) | undefined;
  let lastExternalContentActivityToken = options.contentActivityToken?.();
  const abortPromise = options.signal
    ? new Promise<never>((_resolve, reject) => {
        rejectAbort = reject;
      })
    : undefined;
  const contentIdlePromise = contentIdleTimeoutMs
    ? new Promise<never>((_resolve, reject) => {
        rejectContentIdle = reject;
      })
    : undefined;

  const clearContentTimeout = () => {
    if (contentTimeout) clearTimeout(contentTimeout);
    contentTimeout = undefined;
  };

  const resetContentTimeout = () => {
    if (!contentIdleTimeoutMs || !rejectContentIdle) return;
    clearContentTimeout();
    lastExternalContentActivityToken = options.contentActivityToken?.();
    contentTimeout = setTimeout(() => {
      const nextExternalContentActivityToken = options.contentActivityToken?.();
      if (nextExternalContentActivityToken !== lastExternalContentActivityToken) {
        resetContentTimeout();
        return;
      }
      const error = new AmbientStreamFailureError(
        "stream_idle_timeout",
        options.contentStalledMessage?.({
          contentIdleTimeoutMs,
          responseCharCount: responseText.length,
        }) ??
          `Ambient stream stalled after ${contentIdleTimeoutMs.toLocaleString()}ms without model content ` +
            `(${responseText.length.toLocaleString()} response characters received).`,
        { responseCharCount: responseText.length },
      );
      void reader.cancel(error).catch(() => undefined);
      rejectContentIdle?.(error);
    }, contentIdleTimeoutMs);
  };

  const abortError = () =>
    new AmbientStreamFailureError(
      "user_abort",
      options.signal?.reason instanceof Error ? options.signal.reason.message : "Ambient stream read canceled.",
      { responseCharCount: responseText.length, cause: options.signal?.reason },
    );
  const onAbort = () => {
    const error = abortError();
    void reader.cancel(error).catch(() => undefined);
    rejectAbort?.(error);
  };

  const appendText = (chunkText: string) => {
    if (!chunkText) return;
    responseText += chunkText;
    resetContentTimeout();
    options.onText?.(chunkText, responseText.length);
  };

  const consumeEvent = (eventText: string) => {
    for (const line of eventText.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice("data:".length).trim();
      if (!data) continue;
      if (data === "[DONE]") {
        sawTerminalEvent = true;
        continue;
      }
      try {
        const payload = JSON.parse(data);
        options.onPayload?.(payload);
        appendText((options.parseText ?? ambientChatCompletionChunkText)(payload));
      } catch {
        // Ignore malformed stream keepalives; final schema/JSON validation reports malformed model output.
      }
    }
  };

  try {
    if (options.signal?.aborted) throw abortError();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    resetContentTimeout();
    while (true) {
      const read = readAmbientStreamChunk(reader, {
        idleTimeoutMs,
        responseCharCount: responseText.length,
        streamStarted: bodyActivitySeen,
        stalledMessage: options.stalledMessage,
      });
      const races: Array<Promise<ReadableStreamReadResult<Uint8Array>> | Promise<never>> = [read];
      if (contentIdlePromise) races.push(contentIdlePromise);
      if (abortPromise) races.push(abortPromise);
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race(races);
      } catch (error) {
        if (error instanceof AmbientStreamFailureError) throw error;
        if (options.signal?.aborted) throw abortError();
        throw new AmbientStreamFailureError("network_abort", `Ambient stream read failed: ${errorMessage(error)}`, {
          responseCharCount: responseText.length,
          cause: error,
        });
      }
      const { done, value } = result;
      if (value) {
        bodyActivitySeen = true;
        buffer += decoder.decode(value, { stream: !done });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";
        events.forEach(consumeEvent);
      }
      if (done) break;
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeEvent(buffer);
    if (!sawTerminalEvent) {
      throw new AmbientStreamFailureError("stream_closed_before_done", "Ambient stream ended before completion.", {
        responseCharCount: responseText.length,
      });
    }
    return responseText;
  } finally {
    clearContentTimeout();
    options.signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

export function ambientChatCompletionChunkText(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  return choices
    .map((choice) => {
      if (!choice || typeof choice !== "object" || Array.isArray(choice)) return "";
      const record = choice as {
        delta?: { content?: unknown };
        message?: { content?: unknown };
        text?: unknown;
      };
      return stringValue(record.delta?.content) ?? stringValue(record.message?.content) ?? stringValue(record.text) ?? "";
    })
    .join("");
}

async function readAmbientStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  input: {
    idleTimeoutMs: number;
    responseCharCount: number;
    streamStarted: boolean;
    stalledMessage?: AmbientStreamReadOptions["stalledMessage"];
  },
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(
            new AmbientStreamFailureError(
              input.streamStarted ? "stream_idle_timeout" : "pre_stream_timeout",
              input.stalledMessage?.({
                idleTimeoutMs: input.idleTimeoutMs,
                responseCharCount: input.responseCharCount,
              }) ??
                (input.streamStarted
                  ? `Ambient stream stalled after ${input.idleTimeoutMs.toLocaleString()}ms without stream activity ` +
                    `(${input.responseCharCount.toLocaleString()} response characters received).`
                  : `Ambient stream did not start streaming within ${input.idleTimeoutMs.toLocaleString()}ms.`),
              { responseCharCount: input.responseCharCount },
            ),
          );
        }, input.idleTimeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
