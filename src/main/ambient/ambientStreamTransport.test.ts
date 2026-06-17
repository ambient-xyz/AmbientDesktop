import { describe, expect, it } from "vitest";
import { AmbientStreamFailureError, isRetryableAmbientProviderError } from "../aggressiveRetries";
import { readAmbientEventStreamText } from "./ambientStreamTransport";

describe("readAmbientEventStreamText", () => {
  it("assembles streamed chat-completion text and reports character counts", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "hello" } }] })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: " world" } }] })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const counts: number[] = [];

    await expect(readAmbientEventStreamText(stream, { idleTimeoutMs: 100, onText: (_text, total) => counts.push(total) })).resolves.toBe("hello world");
    expect(counts).toEqual([5, 11]);
  });

  it("treats stream activity as the idle-timeout heartbeat", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        void (async () => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "a" } }] })}\n\n`));
          await new Promise((resolve) => setTimeout(resolve, 20));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "b" } }] })}\n\n`));
          await new Promise((resolve) => setTimeout(resolve, 20));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        })().catch((error) => controller.error(error));
      },
    });

    await expect(readAmbientEventStreamText(stream, { idleTimeoutMs: 35 })).resolves.toBe("ab");
  });

  it("fails clearly when the stream stalls", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "partial" } }] })}\n\n`));
      },
    });

    let failure: unknown;
    try {
      await readAmbientEventStreamText(stream, {
        idleTimeoutMs: 5,
        stalledMessage: ({ idleTimeoutMs, responseCharCount }) => `test stream stalled after ${idleTimeoutMs}ms with ${responseCharCount} chars`,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AmbientStreamFailureError);
    expect(failure).toMatchObject({ kind: "stream_idle_timeout", responseCharCount: 7 });
    expect(failure).toHaveProperty("message", "test stream stalled after 5ms with 7 chars");
    expect(isRetryableAmbientProviderError(failure)).toBe(false);
  });

  it("fails distinctly when the stream never starts", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start() {
        // Leave the reader pending until the pre-stream timeout fires.
      },
    });

    let failure: unknown;
    try {
      await readAmbientEventStreamText(stream, { idleTimeoutMs: 5 });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AmbientStreamFailureError);
    expect(failure).toMatchObject({ kind: "pre_stream_timeout", responseCharCount: 0 });
    expect(failure).toHaveProperty("message", "Ambient stream did not start streaming within 5ms.");
    expect(isRetryableAmbientProviderError(failure)).toBe(true);
  });

  it("fails when the stream closes before a terminal event", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "partial" } }] })}\n\n`));
        controller.close();
      },
    });

    let failure: unknown;
    try {
      await readAmbientEventStreamText(stream, { idleTimeoutMs: 100 });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AmbientStreamFailureError);
    expect(failure).toMatchObject({ kind: "stream_closed_before_done", responseCharCount: 7 });
    expect(isRetryableAmbientProviderError(failure)).toBe(false);
  });

  it("treats blank keepalives as transport activity but not content progress", async () => {
    let canceled = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "partial" } }] })}\n\n`));
        interval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            if (interval) clearInterval(interval);
          }
        }, 5);
      },
      cancel() {
        canceled = true;
        if (interval) clearInterval(interval);
      },
    });

    await expect(
      readAmbientEventStreamText(stream, {
        idleTimeoutMs: 100,
        contentIdleTimeoutMs: 15,
        contentStalledMessage: ({ contentIdleTimeoutMs, responseCharCount }) =>
          `test content stalled after ${contentIdleTimeoutMs}ms with ${responseCharCount} chars`,
      }),
    ).rejects.toThrow("test content stalled after 15ms with 7 chars");
    expect(canceled).toBe(true);
  });

  it("allows external content activity to reset the content-idle window", async () => {
    let activityToken = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        void (async () => {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
          await new Promise((resolve) => setTimeout(resolve, 10));
          activityToken += 1;
          controller.enqueue(encoder.encode(": planner-workspace-record\n\n"));
          await new Promise((resolve) => setTimeout(resolve, 10));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "done" } }] })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        })().catch((error) => controller.error(error));
      },
    });

    await expect(
      readAmbientEventStreamText(stream, {
        idleTimeoutMs: 100,
        contentIdleTimeoutMs: 15,
        contentActivityToken: () => activityToken,
      }),
    ).resolves.toBe("done");
  });
});
