import { describe, expect, it } from "vitest";
import {
  AmbientProjectBoardSourceClassifierProvider,
  batchProjectBoardSourcesForClassification,
  normalizeProjectBoardSourceClassifications,
  parseProjectBoardSourceClassificationJson,
  type AmbientProjectBoardSourceClassificationProgress,
} from "./projectBoardSourceClassifierProvider";
import type { ProjectBoardSource } from "../../shared/types";
import { aggressiveAmbientRetryPolicy } from "../aggressiveRetries";

describe("AmbientProjectBoardSourceClassifierProvider", () => {
  it("calls Ambient chat completions and normalizes source classifications", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const provider = new AmbientProjectBoardSourceClassifierProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    classifications: [
                      {
                        sourceId: "source-gdd",
                        sourceKey: "file:GAME_DESIGN_DOCUMENT.md",
                        effectiveKind: "functional_spec",
                        classificationReason: "Detailed game design document defines product scope and mechanics.",
                        classificationConfidence: 0.94,
                        authorityRole: "primary",
                        includeInSynthesis: true,
                      },
                      {
                        sourceId: "source-thread",
                        sourceKey: "thread:thread-1",
                        effectiveKind: "thread",
                        classificationReason: "Discussion context supports but should not override the spec.",
                        classificationConfidence: 0.72,
                        authorityRole: "context",
                        includeInSynthesis: true,
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.classify({
      projectName: "Starfall Courier",
      sources: [
        sourceFixture({
          id: "source-gdd",
          kind: "markdown",
          sourceKey: "file:GAME_DESIGN_DOCUMENT.md",
          title: "Starfall Courier",
          summary: "A browser WebGL spaceship game design document.",
          path: "GAME_DESIGN_DOCUMENT.md",
          relevance: 82,
        }),
        sourceFixture({
          id: "source-thread",
          kind: "thread",
          sourceKey: "thread:thread-1",
          title: "Planning thread",
          summary: "Chat about the first playable slice.",
          threadId: "thread-1",
          relevance: 70,
        }),
      ],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://ambient.example/v1/chat/completions");
    expect(calls[0].body.stream).toBe(true);
    expect(calls[0].body.response_format).toEqual({ type: "json_object" });
    expect(calls[0].body.reasoning).toEqual({ effort: "minimal", max_tokens: 500, exclude: true, enabled: true });
    expect(JSON.stringify(calls[0].body)).toContain("project-board planning contract");
    expect(JSON.stringify(calls[0].body)).toContain("Project: Starfall Courier");
    expect(JSON.stringify(calls[0].body)).toContain("GAME_DESIGN_DOCUMENT.md");
    expect(JSON.stringify(calls[0].body)).toContain("Operation overlay: Source Classification");
    expect(result.classifications).toEqual([
      expect.objectContaining({
        sourceId: "source-gdd",
        sourceKey: "file:GAME_DESIGN_DOCUMENT.md",
        effectiveKind: "functional_spec",
        authorityRole: "primary",
        classificationConfidence: 0.94,
        includeInSynthesis: true,
      }),
      expect.objectContaining({
        sourceId: "source-thread",
        effectiveKind: "thread",
        authorityRole: "context",
      }),
    ]);
    expect(result.telemetry).toMatchObject({
      sourceCount: 2,
      piDecisionCount: 2,
      promptCharCount: expect.any(Number),
      responseCharCount: expect.any(Number),
      requestDurationMs: expect.any(Number),
    });
    expect(result.telemetry.promptCharCount).toBeGreaterThan(1000);
  });

  it("uses the aggressive retry schedule for zero-output transient classification failures", async () => {
    let calls = 0;
    const retryDelays: number[] = [];
    const progressEvents: AmbientProjectBoardSourceClassificationProgress[] = [];
    const provider = new AmbientProjectBoardSourceClassifierProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      retryPolicy: aggressiveAmbientRetryPolicy(),
      waitForRetry: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      fetchImpl: async () => {
        calls += 1;
        if (calls <= 2) return new Response("rate limited", { status: 429, headers: { "Content-Type": "text/plain" } });
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    classifications: [
                      {
                        sourceId: "source-gdd",
                        sourceKey: "file:GAME_DESIGN_DOCUMENT.md",
                        effectiveKind: "functional_spec",
                        classificationReason: "The design document defines the product scope.",
                        classificationConfidence: 0.9,
                        authorityRole: "primary",
                        includeInSynthesis: true,
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.classifyBatched({
      sources: [
        sourceFixture({
          id: "source-gdd",
          kind: "markdown",
          sourceKey: "file:GAME_DESIGN_DOCUMENT.md",
          title: "Starfall Courier",
          summary: "A browser WebGL spaceship game design document.",
          path: "GAME_DESIGN_DOCUMENT.md",
          relevance: 82,
        }),
      ],
      onProgress: (event) => progressEvents.push(event),
    });

    expect(calls).toBe(3);
    expect(retryDelays).toEqual([1_000, 2_000]);
    expect(progressEvents.filter((event) => event.transientRetry)).toEqual([
      expect.objectContaining({
        responseCharCount: 0,
        transientRetry: true,
        retryAttempt: 1,
        maxRetries: 10,
        retryDelayMs: 1_000,
        aggressiveRetries: true,
        retryError: expect.stringContaining("429"),
      }),
      expect.objectContaining({
        responseCharCount: 0,
        transientRetry: true,
        retryAttempt: 2,
        maxRetries: 10,
        retryDelayMs: 2_000,
        aggressiveRetries: true,
        retryError: expect.stringContaining("429"),
      }),
    ]);
    expect(result.classifications[0]).toMatchObject({ sourceId: "source-gdd", effectiveKind: "functional_spec" });
  });

  it("retries interrupted partial stream classifications without stitching failed JSON", async () => {
    let calls = 0;
    const retryDelays: number[] = [];
    const progressEvents: AmbientProjectBoardSourceClassificationProgress[] = [];
    const content = JSON.stringify({
      classifications: [
        {
          sourceId: "source-gdd",
          sourceKey: "file:GAME_DESIGN_DOCUMENT.md",
          effectiveKind: "functional_spec",
          classificationReason: "The design document defines the product scope.",
          classificationConfidence: 0.9,
          authorityRole: "primary",
          includeInSynthesis: true,
        },
      ],
    });
    const partialContent = "{\"classifications\":[";
    const provider = new AmbientProjectBoardSourceClassifierProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      retryPolicy: aggressiveAmbientRetryPolicy(),
      waitForRetry: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return streamingTextResponse([partialContent], false);
        return streamingTextResponse([content], true);
      },
    });

    const result = await provider.classifyBatched({
      sources: [
        sourceFixture({
          id: "source-gdd",
          kind: "markdown",
          sourceKey: "file:GAME_DESIGN_DOCUMENT.md",
          title: "Starfall Courier",
          summary: "A browser WebGL spaceship game design document.",
          path: "GAME_DESIGN_DOCUMENT.md",
          relevance: 82,
        }),
      ],
      onProgress: (event) => progressEvents.push(event),
    });

    expect(calls).toBe(2);
    expect(retryDelays).toEqual([1_000]);
    expect(progressEvents.filter((event) => event.transientRetry)).toEqual([
      expect.objectContaining({
        responseCharCount: partialContent.length,
        transientRetry: true,
        retryAttempt: 1,
        maxRetries: 10,
        retryDelayMs: 1_000,
        aggressiveRetries: true,
        retryError: "Ambient stream ended before completion.",
      }),
    ]);
    expect(result.classifications[0]).toMatchObject({ sourceId: "source-gdd", effectiveKind: "functional_spec" });
    expect(result.telemetry.responseCharCount).toBe(content.length);
  });

  it("switches source classification to non-stream fallback after repeated stream interruptions", async () => {
    let calls = 0;
    const requestStreams: unknown[] = [];
    const retryDelays: number[] = [];
    const progressEvents: AmbientProjectBoardSourceClassificationProgress[] = [];
    const content = JSON.stringify({
      classifications: [
        {
          sourceId: "source-gdd",
          sourceKey: "file:GAME_DESIGN_DOCUMENT.md",
          effectiveKind: "functional_spec",
          classificationReason: "The design document defines the product scope.",
          classificationConfidence: 0.9,
          authorityRole: "primary",
          includeInSynthesis: true,
        },
      ],
    });
    const provider = new AmbientProjectBoardSourceClassifierProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      retryPolicy: aggressiveAmbientRetryPolicy(),
      waitForRetry: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      fetchImpl: async (_url, init) => {
        calls += 1;
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requestStreams.push(body.stream);
        if (calls <= 2) return streamingTextResponse(["{\"classifications\":["], false);
        return jsonChatCompletionResponse(content);
      },
    });

    const result = await provider.classifyBatched({
      sources: [
        sourceFixture({
          id: "source-gdd",
          kind: "markdown",
          sourceKey: "file:GAME_DESIGN_DOCUMENT.md",
          title: "Starfall Courier",
          summary: "A browser WebGL spaceship game design document.",
          path: "GAME_DESIGN_DOCUMENT.md",
          relevance: 82,
        }),
      ],
      onProgress: (event) => progressEvents.push(event),
    });

    expect(calls).toBe(3);
    expect(requestStreams).toEqual([true, true, false]);
    expect(retryDelays).toEqual([1_000, 2_000]);
    expect(progressEvents.filter((event) => event.transientRetry)).toEqual([
      expect.objectContaining({ retryAttempt: 1, fallbackToNonStream: false }),
      expect.objectContaining({ retryAttempt: 2, fallbackToNonStream: true }),
    ]);
    expect(result.classifications[0]).toMatchObject({ sourceId: "source-gdd", effectiveKind: "functional_spec" });
  });

  it("streams source classification output and reports response character progress", async () => {
    const content = JSON.stringify({
      classifications: [
        {
          sourceId: "source-gdd",
          sourceKey: "file:GAME_DESIGN_DOCUMENT.md",
          effectiveKind: "functional_spec",
          classificationReason: "The design document defines the product scope.",
          classificationConfidence: 0.9,
          authorityRole: "primary",
          includeInSynthesis: true,
        },
      ],
    });
    const progress: number[] = [];
    const provider = new AmbientProjectBoardSourceClassifierProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(0, 40) } }] })}\n\n`));
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(40) } }] })}\n\n`));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
    });

    const result = await provider.classify({
      projectName: "Starfall Courier",
      sources: [
        sourceFixture({
          id: "source-gdd",
          kind: "markdown",
          sourceKey: "file:GAME_DESIGN_DOCUMENT.md",
          title: "Starfall Courier",
          summary: "A browser WebGL spaceship game design document.",
          path: "GAME_DESIGN_DOCUMENT.md",
          relevance: 82,
        }),
      ],
      onProgress: (event) => progress.push(event.responseCharCount),
    });

    expect(result.classifications[0]).toMatchObject({ sourceId: "source-gdd", effectiveKind: "functional_spec" });
    expect(progress.at(-1)).toBe(content.length);
    expect(result.telemetry.responseCharCount).toBe(content.length);
  });

  it("batches source classification by source count while preserving order", () => {
    const sources = Array.from({ length: 25 }, (_, index) =>
      sourceFixture({
        id: `source-${index + 1}`,
        sourceKey: `file:SOURCE_${index + 1}.md`,
        title: `Source ${index + 1}`,
        summary: `Summary ${index + 1}`,
        path: `SOURCE_${index + 1}.md`,
      }),
    );

    const batches = batchProjectBoardSourcesForClassification({ sources, maxSourcesPerBatch: 10 });

    expect(batches.map((batch) => batch.map((source) => source.id))).toEqual([
      ["source-1", "source-2", "source-3", "source-4", "source-5", "source-6", "source-7", "source-8", "source-9", "source-10"],
      [
        "source-11",
        "source-12",
        "source-13",
        "source-14",
        "source-15",
        "source-16",
        "source-17",
        "source-18",
        "source-19",
        "source-20",
      ],
      ["source-21", "source-22", "source-23", "source-24", "source-25"],
    ]);
  });

  it("retries malformed classification batches smaller and falls back only terminal failed sources", async () => {
    const calls: string[][] = [];
    const provider = new AmbientProjectBoardSourceClassifierProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
        const prompt = body.messages.find((message) => message.role === "user")?.content ?? "";
        const sourceIds = Array.from(prompt.matchAll(/sourceId: (source-\d+)/g)).map((match) => match[1]);
        calls.push(sourceIds);
        if (sourceIds.length > 1 || sourceIds[0] === "source-3") {
          return new Response(JSON.stringify({ choices: [{ message: { content: '{"classifications": [' } }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        const sourceId = sourceIds[0];
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    classifications: [
                      {
                        sourceId,
                        sourceKey: `file:${sourceId}.md`,
                        effectiveKind: sourceId === "source-1" ? "functional_spec" : "implementation_plan",
                        classificationReason: `${sourceId} classified by Pi.`,
                        classificationConfidence: 0.88,
                        authorityRole: sourceId === "source-1" ? "primary" : "supporting",
                        includeInSynthesis: true,
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.classifyBatched({
      projectName: "Retry Board",
      maxSourcesPerBatch: 3,
      sources: [
        sourceFixture({ id: "source-1", sourceKey: "file:source-1.md", title: "Source 1", summary: "Primary spec." }),
        sourceFixture({ id: "source-2", sourceKey: "file:source-2.md", title: "Source 2", summary: "Implementation plan." }),
        sourceFixture({ id: "source-3", sourceKey: "file:source-3.md", title: "Source 3", summary: "Malformed terminal source." }),
      ],
    });

    expect(calls).toEqual([["source-1", "source-2", "source-3"], ["source-1"], ["source-2", "source-3"], ["source-2"], ["source-3"]]);
    expect(result.classifications.map((classification) => classification.sourceId)).toEqual(["source-1", "source-2"]);
    expect(result.fallbackSourceIds).toEqual(["source-3"]);
    expect(result.failures.map((failure) => ({ sourceIds: failure.sourceIds, terminal: failure.terminal }))).toEqual([
      { sourceIds: ["source-1", "source-2", "source-3"], terminal: false },
      { sourceIds: ["source-2", "source-3"], terminal: false },
      { sourceIds: ["source-3"], terminal: true },
    ]);
    expect(result.telemetry).toMatchObject({
      sourceCount: 3,
      piDecisionCount: 2,
      batchCount: 5,
      failedBatchCount: 3,
      retriedBatchCount: 2,
      fallbackSourceCount: 1,
    });
  });

  it("times out pre-stream source classification without recursively splitting transient failures", async () => {
    const calls: string[][] = [];
    const provider = new AmbientProjectBoardSourceClassifierProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      preStreamResponseTimeoutMs: 5,
      fetchImpl: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
          const prompt = body.messages.find((message) => message.role === "user")?.content ?? "";
          calls.push(Array.from(prompt.matchAll(/sourceId: (source-\d+)/g)).map((match) => match[1]));
          const signal = init?.signal as AbortSignal | undefined;
          signal?.addEventListener("abort", () => reject(signal.reason instanceof Error ? signal.reason : new Error("aborted")), { once: true });
        }),
    });

    const result = await provider.classifyBatched({
      projectName: "Transient Board",
      maxSourcesPerBatch: 4,
      sources: [
        sourceFixture({ id: "source-1", sourceKey: "file:source-1.md", title: "Source 1", summary: "Primary spec." }),
        sourceFixture({ id: "source-2", sourceKey: "file:source-2.md", title: "Source 2", summary: "Implementation plan." }),
        sourceFixture({ id: "source-3", sourceKey: "file:source-3.md", title: "Source 3", summary: "Architecture." }),
        sourceFixture({ id: "source-4", sourceKey: "file:source-4.md", title: "Source 4", summary: "Test notes." }),
      ],
    });

    expect(calls).toEqual([["source-1", "source-2", "source-3", "source-4"]]);
    expect(result.classifications).toEqual([]);
    expect(result.fallbackSourceIds).toEqual(["source-1", "source-2", "source-3", "source-4"]);
    expect(result.failures).toEqual([
      expect.objectContaining({
        sourceIds: ["source-1", "source-2", "source-3", "source-4"],
        terminal: true,
        error: "Ambient project-board source classification did not start streaming within 5ms.",
      }),
    ]);
    expect(result.telemetry).toMatchObject({
      sourceCount: 4,
      piDecisionCount: 0,
      batchCount: 1,
      failedBatchCount: 1,
      retriedBatchCount: 0,
      fallbackSourceCount: 4,
    });
  });

  it("matches records by stable key and falls back safely for malformed fields", () => {
    const classifications = normalizeProjectBoardSourceClassifications(
      {
        classifications: [
          {
            sourceKey: "file:README.md",
            effectiveKind: "functional_spec",
            classificationConfidence: 2,
            authorityRole: "not-a-role",
            includeInSynthesis: true,
            classificationReason: "README is the only product spec.",
          },
          {
            sourceKey: "thread:thread-1",
            effectiveKind: "not-a-kind",
            classificationConfidence: -1,
            authorityRole: "primary",
            includeInSynthesis: false,
          },
        ],
      },
      [
        sourceFixture({
          id: "readme-source",
          sourceKey: "file:README.md",
          kind: "markdown",
          title: "README",
          summary: "Product requirements.",
          path: "README.md",
          relevance: 90,
        }),
        sourceFixture({
          id: "thread-source",
          sourceKey: "thread:thread-1",
          kind: "thread",
          title: "Thread",
          summary: "Project context.",
          threadId: "thread-1",
          relevance: 70,
        }),
      ],
    );

    expect(classifications[0]).toMatchObject({
      sourceId: "readme-source",
      effectiveKind: "functional_spec",
      classificationConfidence: 1,
      authorityRole: "primary",
      includeInSynthesis: true,
    });
    expect(classifications[1]).toMatchObject({
      sourceId: "thread-source",
      effectiveKind: "thread",
      classificationConfidence: 0,
      authorityRole: "primary",
      includeInSynthesis: false,
    });
  });

  it("parses fenced JSON responses", () => {
    expect(parseProjectBoardSourceClassificationJson('```json\n{"classifications":[]}\n```')).toEqual({ classifications: [] });
  });
});

function sourceFixture(input: Partial<ProjectBoardSource>): ProjectBoardSource {
  return {
    id: input.id ?? "source-1",
    boardId: input.boardId ?? "board-1",
    kind: input.kind ?? "markdown",
    sourceKey: input.sourceKey,
    contentHash: input.contentHash ?? "hash",
    changeState: input.changeState ?? "new",
    title: input.title ?? "Source",
    summary: input.summary ?? "Summary",
    excerpt: input.excerpt,
    path: input.path,
    threadId: input.threadId,
    artifactId: input.artifactId,
    messageId: input.messageId,
    classificationReason: input.classificationReason,
    classifiedBy: input.classifiedBy ?? "fallback_heuristic",
    classificationConfidence: input.classificationConfidence ?? 0.7,
    authorityRole: input.authorityRole ?? "supporting",
    includeInSynthesis: input.includeInSynthesis ?? true,
    relevance: input.relevance ?? 70,
    createdAt: input.createdAt ?? "2026-05-04T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-05-04T00:00:00.000Z",
  };
}

function streamingTextResponse(chunks: string[], done: boolean): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
        }
        if (done) controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

function jsonChatCompletionResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content,
          },
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
