import { describe, expect, it } from "vitest";
import { z } from "zod";
import { aggressiveAmbientRetryPolicy } from "./aggressiveRetries";
import type { WorkflowRuntimeEvent } from "./workflowAgentRuntime";
import { createWorkflowAmbientClient, MemoryWorkflowAmbientCache, workflowAmbientCallCacheCheckpoint, workflowAmbientCallPromptParts } from "./workflowAmbientClient";

describe("createWorkflowAmbientClient", () => {
  it("validates structured Ambient outputs", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const client = createWorkflowAmbientClient({
      provider: {
        call: () => ({ category: "bug", confidence: 0.8 }),
      },
      eventSink: { append: (event) => void events.push(event) },
      transientRetryBaseDelayMs: 0,
    });

    await expect(
      client.call({
        task: "classify.failure",
        input: { text: "test failed" },
        nodeId: "classify-node",
        schema: z.object({
          category: z.enum(["bug", "flake"]),
          confidence: z.number().min(0).max(1),
        }),
      }),
    ).resolves.toEqual({ category: "bug", confidence: 0.8 });
    expect(events.map((event) => event.type)).toEqual(["ambient.call.start", "ambient.call.end"]);
    expect(events[0]).toMatchObject({ graphNodeId: "classify-node", data: { attempt: 1, graphNodeId: "classify-node" } });
    expect(events[0].data?.cacheCheckpoint).toMatchObject({
      stage: "runtime_call",
      stablePrefixHash: expect.any(String),
      mutableSuffixHash: expect.any(String),
    });
  });

  it("keeps runtime task instructions in the stable cache prefix", () => {
    const baseSpec = {
      task: "classify.failure",
      schema: z.object({ category: z.enum(["bug", "flake"]) }),
    };
    const first = workflowAmbientCallCacheCheckpoint({ ...baseSpec, input: { text: "expected true" } }, 1);
    const second = workflowAmbientCallCacheCheckpoint({ ...baseSpec, input: { text: "expected false" } }, 1);

    expect(first.stablePrefixHash).toBe(second.stablePrefixHash);
    expect(first.mutableSuffixHash).not.toBe(second.mutableSuffixHash);
  });

  it("pins runtime model calls to structured input evidence", () => {
    const promptParts = workflowAmbientCallPromptParts({
      task: "categorize.directory.metadata",
      input: {
        entries: [{ path: "tax-receipts-2025.pdf" }],
        outputContract: { categories: "array" },
      },
      attempt: 1,
    });

    expect(promptParts.prompt).toContain("Treat the Structured input as the sole source of truth");
    expect(promptParts.prompt).toContain("Do not invent placeholder examples");
    expect(promptParts.prompt).toContain("tax-receipts-2025.pdf");
  });

  it("attaches runtime cache metadata to provider calls and trace events", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const providerCalls: unknown[] = [];
    const progressEvents: unknown[] = [];
    const client = createWorkflowAmbientClient({
      provider: {
        call: (input) => {
          providerCalls.push(input);
          input.onProgress?.({
            stage: "streaming",
            outputChars: 42,
            thinkingChars: 7,
            elapsedMs: 1_200,
            idleElapsedMs: 10,
            idleTimeoutMs: 60_000,
          });
          return { category: "bug" };
        },
      },
      cacheMetadata: { workflowThreadId: "workflow-thread-1" },
      eventSink: { append: (event) => void events.push(event) },
      onProgress: (event) => progressEvents.push(event),
    });

    await client.call({
      task: "classify.failure",
      input: { text: "expected true" },
      schema: z.object({ category: z.enum(["bug", "flake"]) }),
    });

    expect(providerCalls[0]).toMatchObject({
      cacheCheckpoint: expect.objectContaining({ workflowThreadId: "workflow-thread-1" }),
      onProgress: expect.any(Function),
    });
    expect(events[0].data?.cacheCheckpoint).toMatchObject({ workflowThreadId: "workflow-thread-1" });
    expect(progressEvents[0]).toMatchObject({
      attempt: 1,
      spec: expect.objectContaining({ task: "classify.failure" }),
      cacheCheckpoint: expect.objectContaining({ workflowThreadId: "workflow-thread-1" }),
      progress: expect.objectContaining({ stage: "streaming", outputChars: 42, idleTimeoutMs: 60_000 }),
    });
  });

  it("retries invalid model output when requested", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const inputs: unknown[] = [];
    let calls = 0;
    const client = createWorkflowAmbientClient({
      provider: {
        call: (input) => {
          inputs.push(input.input);
          calls += 1;
          return calls === 1 ? { category: "unknown" } : { category: "flake" };
        },
      },
      eventSink: { append: (event) => void events.push(event) },
    });

    await expect(
      client.call({
        task: "classify.failure",
        input: {},
        schema: z.object({ category: z.enum(["bug", "flake"]) }),
        retry: { maxAttempts: 2, onInvalid: "retry" },
      }),
    ).resolves.toEqual({ category: "flake" });
    expect(calls).toBe(2);
    expect(inputs[1]).toMatchObject({
      retryFeedback: {
        attempt: 2,
        previousError: expect.any(String),
        instruction: expect.stringContaining("Top-level property names must match exactly"),
      },
    });
    expect(events.map((event) => event.type)).toEqual([
      "ambient.call.start",
      "ambient.call.invalid",
      "ambient.call.start",
      "ambient.call.end",
    ]);
    expect(events[1].data).toMatchObject({ failureKind: "validation", invalidAttemptCount: 1 });
  });

  it("retries transient provider errors and records the failed attempt", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    let calls = 0;
    const client = createWorkflowAmbientClient({
      provider: {
        call: () => {
          calls += 1;
          if (calls === 1) throw new Error("429 Upstream request failed");
          return { category: "flake" };
        },
      },
      eventSink: { append: (event) => void events.push(event) },
    });

    await expect(
      client.call({
        task: "classify.failure",
        input: {},
        schema: z.object({ category: z.enum(["bug", "flake"]) }),
      }),
    ).resolves.toEqual({ category: "flake" });
    expect(calls).toBe(2);
    expect(events.map((event) => event.type)).toEqual(["ambient.call.start", "ambient.call.error", "ambient.call.start", "ambient.call.end"]);
    expect(events[1].data).toMatchObject({ attempt: 1, failureKind: "provider", retryable: true, willRetry: true, error: "429 Upstream request failed" });
  });

  it("retries empty provider responses as transient runtime failures", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    let calls = 0;
    const client = createWorkflowAmbientClient({
      provider: {
        call: () => {
          calls += 1;
          if (calls === 1) throw new Error("Ambient workflow compiler returned an empty response.");
          return { category: "flake" };
        },
      },
      eventSink: { append: (event) => void events.push(event) },
      transientRetryBaseDelayMs: 0,
    });

    await expect(
      client.call({
        task: "classify.failure",
        input: {},
        schema: z.object({ category: z.enum(["bug", "flake"]) }),
      }),
    ).resolves.toEqual({ category: "flake" });
    expect(calls).toBe(2);
    expect(events.map((event) => event.type)).toEqual(["ambient.call.start", "ambient.call.error", "ambient.call.start", "ambient.call.end"]);
    expect(events[1].data).toMatchObject({
      attempt: 1,
      failureKind: "provider",
      retryable: true,
      willRetry: true,
      error: "Ambient workflow compiler returned an empty response.",
    });
  });

  it("uses a runtime transient retry floor even when generated workflow requests fewer attempts", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    let calls = 0;
    const client = createWorkflowAmbientClient({
      provider: {
        call: () => {
          calls += 1;
          if (calls < 4) throw new Error("429 Upstream request failed");
          return { category: "flake" };
        },
      },
      eventSink: { append: (event) => void events.push(event) },
      transientRetryBaseDelayMs: 0,
    });

    await expect(
      client.call({
        task: "classify.failure",
        input: {},
        schema: z.object({ category: z.enum(["bug", "flake"]) }),
        retry: { maxAttempts: 2, onInvalid: "retry" },
      }),
    ).resolves.toEqual({ category: "flake" });
    expect(calls).toBe(4);
    expect(events.map((event) => event.type)).toEqual([
      "ambient.call.start",
      "ambient.call.error",
      "ambient.call.start",
      "ambient.call.error",
      "ambient.call.start",
      "ambient.call.error",
      "ambient.call.start",
      "ambient.call.end",
    ]);
    expect(events[5].data).toMatchObject({ attempt: 3, failureKind: "provider", retryable: true, willRetry: true, retryDelayMs: 0 });
  });

  it("uses the aggressive retry schedule exactly when policy is enabled", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const delays: number[] = [];
    let calls = 0;
    const client = createWorkflowAmbientClient({
      provider: {
        call: () => {
          calls += 1;
          if (calls <= 10) throw new Error("429 rate limit");
          return { category: "flake" };
        },
      },
      eventSink: { append: (event) => void events.push(event) },
      retryPolicy: aggressiveAmbientRetryPolicy(),
      waitForRetry: async (delayMs) => void delays.push(delayMs),
    });

    await expect(
      client.call({
        task: "classify.failure",
        input: {},
        schema: z.object({ category: z.enum(["bug", "flake"]) }),
      }),
    ).resolves.toEqual({ category: "flake" });

    expect(calls).toBe(11);
    expect(delays).toEqual([1_000, 2_000, 3_000, 4_000, 5_000, 5_000, 5_000, 5_000, 5_000, 5_000]);
    expect(events.filter((event) => event.type === "ambient.call.error").at(-1)?.data).toMatchObject({
      attempt: 10,
      retryable: true,
      willRetry: true,
      retryDelayMs: 5_000,
      transientFailureCount: 10,
      transientProviderMaxAttempts: 11,
      transientProviderMaxRetries: 10,
    });
  });

  it("does not spend structured-output retries on transient provider failures", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const inputs: unknown[] = [];
    let calls = 0;
    const client = createWorkflowAmbientClient({
      provider: {
        call: (input) => {
          inputs.push(input.input);
          calls += 1;
          if (calls <= 2) throw new Error("stream timeout after 30000ms without stream activity");
          return calls === 3 ? { category: "unknown" } : { category: "flake" };
        },
      },
      eventSink: { append: (event) => void events.push(event) },
      transientRetryBaseDelayMs: 0,
    });

    await expect(
      client.call({
        task: "classify.failure",
        input: {},
        schema: z.object({ category: z.enum(["bug", "flake"]) }),
        retry: { maxAttempts: 2, onInvalid: "retry" },
      }),
    ).resolves.toEqual({ category: "flake" });
    expect(calls).toBe(4);
    expect(inputs[3]).toMatchObject({
      retryFeedback: {
        attempt: 4,
        previousError: expect.stringContaining("Invalid option"),
      },
    });
    expect(events.map((event) => event.type)).toEqual([
      "ambient.call.start",
      "ambient.call.error",
      "ambient.call.start",
      "ambient.call.error",
      "ambient.call.start",
      "ambient.call.invalid",
      "ambient.call.start",
      "ambient.call.end",
    ]);
    expect(events[1].data).toMatchObject({ attempt: 1, failureKind: "provider", retryable: true, willRetry: true, transientFailureCount: 1 });
    expect(events[5].data).toMatchObject({ attempt: 3, failureKind: "validation", invalidAttemptCount: 1, maxInvalidAttempts: 2 });
  });

  it("does not retry non-transient provider errors", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    let calls = 0;
    const client = createWorkflowAmbientClient({
      provider: {
        call: () => {
          calls += 1;
          throw new Error("Ambient API key is not configured.");
        },
      },
      eventSink: { append: (event) => void events.push(event) },
    });

    await expect(
      client.call({
        task: "classify.failure",
        input: {},
        schema: z.object({ category: z.enum(["bug", "flake"]) }),
      }),
    ).rejects.toThrow("Ambient API key is not configured");
    expect(calls).toBe(1);
    expect(events.map((event) => event.type)).toEqual(["ambient.call.start", "ambient.call.error"]);
    expect(events[1].data).toMatchObject({ attempt: 1, failureKind: "provider", retryable: false, willRetry: false });
  });

  it("fails with a validation error when invalid output cannot be repaired", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const client = createWorkflowAmbientClient({
      provider: {
        call: () => ({ category: "unknown" }),
      },
      eventSink: { append: (event) => void events.push(event) },
    });

    await expect(
      client.call({
        task: "classify.failure",
        input: {},
        schema: z.object({ category: z.enum(["bug", "flake"]) }),
      }),
    ).rejects.toThrow();
    expect(events.map((event) => event.type)).toEqual(["ambient.call.start", "ambient.call.invalid", "ambient.call.error"]);
    expect(events[1].data).toMatchObject({
      failureKind: "validation",
      rawOutputPreview: expect.stringContaining("unknown"),
      rawOutputChars: expect.any(Number),
    });
    expect(events[2].data).toMatchObject({ failureKind: "validation" });
  });

  it("uses validated cached output without calling the provider", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const cache = new MemoryWorkflowAmbientCache();
    cache.set(JSON.stringify(["task", "1"]), { category: "bug" });
    const client = createWorkflowAmbientClient({
      provider: {
        call: () => {
          throw new Error("provider should not be called");
        },
      },
      cache,
      eventSink: { append: (event) => void events.push(event) },
    });

    await expect(
      client.call({
        task: "classify.failure",
        input: {},
        schema: z.object({ category: z.enum(["bug", "flake"]) }),
        cacheKey: ["task", "1"],
      }),
    ).resolves.toEqual({ category: "bug" });
    expect(events.map((event) => event.type)).toEqual(["ambient.call.cache_hit"]);
  });
});
