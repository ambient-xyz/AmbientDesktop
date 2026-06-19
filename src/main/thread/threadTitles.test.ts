import { afterEach, describe, expect, it, vi } from "vitest";
import { aggressiveAmbientRetryPolicy } from "./threadAmbientFacade";
import { fallbackThreadTitleFromPrompt, generateThreadTitle, sanitizeThreadTitle } from "./threadTitles";

describe("thread title generation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sanitizes model title output", () => {
    expect(sanitizeThreadTitle('Title: "Build Calculator UI."')).toBe("Build Calculator UI");
    expect(sanitizeThreadTitle("FINAL_CHAT_TITLE=Build Calculator UI")).toBe("Build Calculator UI");
    expect(sanitizeThreadTitle("FINAL_CHAT_TITLE")).toBeUndefined();
    expect(sanitizeThreadTitle("   ")).toBeUndefined();
    expect(sanitizeThreadTitle("Continuation Request")).toBeUndefined();
    expect(sanitizeThreadTitle("Create a very long title for a task that should be trimmed before it reaches the sidebar")).toBe(
      "Create a very long title for a task that should",
    );
  });

  it("falls back to the first user request when Ambient returns a generic title", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "FINAL_CHAT_TITLE=Continuation Request" } }] }), { status: 200 });

    await expect(
      generateThreadTitle({
        prompt: "Can we add brave search as a provider to Ambient?",
        workspaceName: "AmbientDesktop",
        model: "glm-5.1",
        apiKey: "ambient-test-key",
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toBe("Can we add brave search as a provider to Ambient");
  });

  it("can derive a fallback title directly from a prompt", () => {
    expect(fallbackThreadTitleFromPrompt("Please keep going\n\nMore details")).toBe("keep going");
  });

  it("calls Ambient chat completions and returns a sanitized title", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ choices: [{ message: { content: '"Build Todo Tool."' } }] }), { status: 200 });
    };

    await expect(
      generateThreadTitle({
        prompt: "Please build a todo tool.",
        workspaceName: "AmbientDesktop",
        model: "glm-5.1",
        baseUrl: "https://api.ambient.xyz",
        apiKey: "ambient-test-key",
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toBe("Build Todo Tool");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.ambient.xyz/v1/chat/completions");
    expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer ambient-test-key" });
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      model: "zai-org/GLM-5.1-FP8",
      stream: false,
    });
  });

  it("retries transient Ambient title failures when a retry policy is supplied", async () => {
    const retryDelays: number[] = [];
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) return new Response("rate limited", { status: 429 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "FINAL_CHAT_TITLE=Build Retry UI" } }] }), { status: 200 });
    };

    await expect(
      generateThreadTitle({
        prompt: "Please build a retry UI.",
        workspaceName: "AmbientDesktop",
        model: "glm-5.1",
        apiKey: "ambient-test-key",
        fetchImpl: fetchImpl as typeof fetch,
        retryPolicy: aggressiveAmbientRetryPolicy({ maxRetries: 2, backoffMs: [1, 2] }),
        waitForRetry: async (delayMs) => void retryDelays.push(delayMs),
      }),
    ).resolves.toBe("Build Retry UI");

    expect(calls).toBe(2);
    expect(retryDelays).toEqual([1]);
  });

  it("does not call Ambient without an API key", async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return new Response("{}", { status: 200 });
    };

    await expect(
      generateThreadTitle({
        prompt: "Build something.",
        workspaceName: "AmbientDesktop",
        model: "glm-5.1",
        apiKey: "",
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toBeUndefined();
    expect(called).toBe(false);
  });

  it("aborts Ambient title generation when the fetch seam exceeds the title timeout", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    };

    const promise = generateThreadTitle({
      prompt: "Build something.",
      workspaceName: "AmbientDesktop",
      model: "glm-5.1",
      apiKey: "ambient-test-key",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const expectation = expect(promise).rejects.toThrow("Ambient title request timed out after 45000ms.");
    await vi.advanceTimersByTimeAsync(45_000);
    await expectation;
    expect(signal?.aborted).toBe(true);
  });
});
