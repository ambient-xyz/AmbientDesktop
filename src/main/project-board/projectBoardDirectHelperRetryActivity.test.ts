import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aggressiveAmbientRetryPolicy } from "./projectBoardAmbientFacade";
import { recordProjectBoardDirectHelperRetryActivity } from "./projectBoardDirectHelperRetryActivity";
import { AmbientProjectBoardSourceClassifierProvider } from "./projectBoardSourceClassifierProvider";
import { ProjectStore } from "../projectStore/projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("project-board direct helper retry activity", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-direct-helper-retry-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("records source-classification retry activity when a partial stream closes before a successful retry", async () => {
    const board = store.createProjectBoard({ title: "Retry activity board" });
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "zai-org/GLM-5.1-FP8" });
    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "markdown",
        title: "Game Design Document",
        summary: "Defines the browser spaceship game's product scope.",
        path: "GAME_DESIGN_DOCUMENT.md",
        relevance: 91,
      },
    ]);
    const source = sources[0];
    const partialContent = "{\"classifications\":[";
    const recoveredContent = JSON.stringify({
      classifications: [
        {
          sourceId: source.id,
          sourceKey: source.sourceKey,
          effectiveKind: "functional_spec",
          classificationReason: "The design document defines gameplay scope and acceptance evidence.",
          classificationConfidence: 0.92,
          authorityRole: "primary",
          includeInSynthesis: true,
        },
      ],
    });
    let calls = 0;
    let flushCount = 0;
    const retryDelays: number[] = [];
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
        return streamingTextResponse([recoveredContent], true);
      },
    });

    const result = await provider.classifyBatched({
      projectName: "Retry Activity Board",
      sources,
      onProgress: (progress) => {
        recordProjectBoardDirectHelperRetryActivity({
          store,
          runId: run.id,
          stage: "source_classification",
          title: "Retrying Pi source classification",
          helperLabel: "source classification",
          progress,
          flushProgress: () => {
            flushCount += 1;
          },
        });
      },
    });

    expect(calls).toBe(2);
    expect(retryDelays).toEqual([1_000]);
    expect(result.classifications).toEqual([
      expect.objectContaining({
        sourceId: source.id,
        effectiveKind: "functional_spec",
        authorityRole: "primary",
      }),
    ]);
    expect(flushCount).toBe(1);
    const updatedRun = store.getProjectBoardSynthesisRun(run.id);
    const retryEvent = updatedRun?.events.find((event) => event.title === "Retrying Pi source classification");
    expect(updatedRun).toMatchObject({
      stage: "source_classification",
      responseCharCount: partialContent.length,
    });
    expect(retryEvent).toMatchObject({
      stage: "source_classification",
      summary: "Transient Ambient/Pi source classification failure (Ambient stream ended before completion.); retrying attempt 1/10 after 1,000ms.",
      metadata: {
        transientRetry: true,
        aggressiveRetries: true,
        retryAttempt: 1,
        maxRetries: 10,
        retryDelayMs: 1_000,
        error: "Ambient stream ended before completion.",
        rawErrorLength: "Ambient stream ended before completion.".length,
        responseCharCount: partialContent.length,
        requestDurationMs: expect.any(Number),
      },
    });
  });
});

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
