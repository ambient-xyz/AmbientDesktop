import { describe, expect, it } from "vitest";
import {
  AmbientProjectBoardProofJudgeProvider,
  buildProjectBoardProofJudgmentPrompt,
  normalizeProjectBoardProofJudgment,
  parseProjectBoardProofJudgmentJson,
  type AmbientProjectBoardProofJudgmentProgress,
} from "./projectBoardProofJudgeProvider";
import type { ProjectBoardCard, ProjectBoardCardProofReview, OrchestrationRun } from "../shared/types";
import { aggressiveAmbientRetryPolicy } from "./aggressiveRetries";

describe("AmbientProjectBoardProofJudgeProvider", () => {
  const card: ProjectBoardCard = {
    id: "card-1",
    boardId: "board-1",
    title: "Create the WebGL shell",
    description: "Render a nonblank Three.js scene and HUD.",
    status: "in_progress",
    candidateStatus: "ready_to_create",
    labels: ["webgl"],
    blockedBy: [],
    acceptanceCriteria: ["Canvas renders a nonblank scene.", "HUD shows score and health."],
    testPlan: {
      unit: ["Run reducer unit tests."],
      integration: ["Run app smoke test."],
      visual: ["Capture canvas screenshot."],
      manual: [],
    },
    sourceKind: "board_synthesis",
    sourceId: "synthesis:shell",
    createdAt: "2026-05-03T00:00:00.000Z",
    updatedAt: "2026-05-03T00:00:00.000Z",
  };
  const run: OrchestrationRun = {
    id: "run-1",
    taskId: "task-1",
    attemptNumber: 1,
    status: "completed",
    workspacePath: "/tmp/worktree",
    startedAt: "2026-05-03T00:00:00.000Z",
    proofOfWork: {
      changedFiles: ["src/App.tsx", "src/game.test.ts"],
      lastAssistantText: "Implemented the acceptance criteria. Unit tests passed and a visual screenshot was captured.",
      screenshots: ["canvas.png"],
      afterRunHook: { ok: true },
    },
  };
  const deterministicReview: ProjectBoardCardProofReview = {
    status: "ready_for_review",
    summary: "Deterministic proof is satisfied.",
    satisfied: ["Implementation evidence recorded.", "Unit proof recorded."],
    missing: [],
    followUpCardIds: [],
    runId: run.id,
    reviewedAt: "2026-05-03T00:00:01.000Z",
    reviewer: "deterministic",
  };

  it("calls Ambient chat completions and normalizes PM proof judgment", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const provider = new AmbientProjectBoardProofJudgeProvider({
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
                    status: "done",
                    summary: "The shell card is complete with strong implementation and visual proof.",
                    satisfied: ["Canvas criterion satisfied.", "Unit and visual proof are present."],
                    missing: [],
                    evidenceQuality: "strong",
                    recommendedAction: "close",
                    confidence: 0.91,
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.judge({ card, run, deterministicReview });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://ambient.example/v1/chat/completions");
    expect(calls[0].body.stream).toBe(true);
    expect(calls[0].body.max_tokens).toBe(2_000);
    expect(JSON.stringify(calls[0].body)).toContain("Create the WebGL shell");
    expect(JSON.stringify(calls[0].body)).toContain("Deterministic proof review fallback");
    expect(result.judgment).toEqual({
      status: "done",
      summary: "The shell card is complete with strong implementation and visual proof.",
      satisfied: ["Canvas criterion satisfied.", "Unit and visual proof are present."],
      missing: [],
      evidenceQuality: "strong",
      recommendedAction: "close",
      confidence: 0.91,
    });
    expect(result.telemetry).toMatchObject({
      promptCharCount: expect.any(Number),
      responseCharCount: expect.any(Number),
      requestDurationMs: expect.any(Number),
    });
  });

  it("retries proof judgment when a side-effect-free stream fails after semantic output", async () => {
    let calls = 0;
    const retryDelays: number[] = [];
    const progressEvents: AmbientProjectBoardProofJudgmentProgress[] = [];
    const provider = new AmbientProjectBoardProofJudgeProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      retryPolicy: aggressiveAmbientRetryPolicy(),
      waitForRetry: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      fetchImpl: async () => {
        calls += 1;
        if (calls === 2) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      status: "done",
                      summary: "The shell card is complete after stream recovery.",
                      satisfied: ["Canvas criterion satisfied."],
                      missing: [],
                      evidenceQuality: "strong",
                      recommendedAction: "close",
                      confidence: 0.87,
                    }),
                  },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content: "{\"status\":\"done\"" } }] })}\n\n`,
                ),
              );
              controller.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        );
      },
    });

    const result = await provider.judge({ card, run, deterministicReview, onProgress: (event) => progressEvents.push(event) });

    expect(calls).toBe(2);
    expect(retryDelays).toEqual([1_000]);
    expect(progressEvents.filter((event) => event.transientRetry)).toEqual([
      expect.objectContaining({
        responseCharCount: "{\"status\":\"done\"".length,
        transientRetry: true,
        retryAttempt: 1,
        maxRetries: 10,
        retryDelayMs: 1_000,
        aggressiveRetries: true,
        retryError: "Ambient stream ended before completion.",
      }),
    ]);
    expect(result.judgment.summary).toBe("The shell card is complete after stream recovery.");
  });

  it("reports retry progress for zero-output transient proof judgment failures", async () => {
    let calls = 0;
    const retryDelays: number[] = [];
    const progressEvents: AmbientProjectBoardProofJudgmentProgress[] = [];
    const provider = new AmbientProjectBoardProofJudgeProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      retryPolicy: aggressiveAmbientRetryPolicy(),
      waitForRetry: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return new Response("rate limited", { status: 429, headers: { "Content-Type": "text/plain" } });
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    status: "done",
                    summary: "The shell card is complete after a retry.",
                    satisfied: ["Canvas criterion satisfied."],
                    missing: [],
                    evidenceQuality: "strong",
                    recommendedAction: "close",
                    confidence: 0.86,
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.judge({
      card,
      run,
      deterministicReview,
      onProgress: (event) => progressEvents.push(event),
    });

    expect(calls).toBe(2);
    expect(retryDelays).toEqual([1_000]);
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
    ]);
    expect(result.judgment.summary).toBe("The shell card is complete after a retry.");
  });

  it("keeps proof judgment on streaming retries before the non-stream last resort", async () => {
    let calls = 0;
    const requestStreams: unknown[] = [];
    const retryDelays: number[] = [];
    const progressEvents: AmbientProjectBoardProofJudgmentProgress[] = [];
    const provider = new AmbientProjectBoardProofJudgeProvider({
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
        if (calls <= 2) return streamingProofTextResponse(["{\"status\":\"done\""], false);
        return streamingProofTextResponse([
          JSON.stringify({
            status: "done",
            summary: "The proof judgment completed through streaming retry.",
            satisfied: ["Canvas criterion satisfied."],
            missing: [],
            evidenceQuality: "strong",
            recommendedAction: "close",
            confidence: 0.9,
          }),
        ], true);
      },
    });

    const result = await provider.judge({
      card,
      run,
      deterministicReview,
      onProgress: (event) => progressEvents.push(event),
    });

    expect(calls).toBe(3);
    expect(requestStreams).toEqual([true, true, true]);
    expect(retryDelays).toEqual([1_000, 2_000]);
    expect(progressEvents.filter((event) => event.transientRetry)).toEqual([
      expect.objectContaining({ retryAttempt: 1, fallbackToNonStream: false }),
      expect.objectContaining({ retryAttempt: 2, fallbackToNonStream: false }),
    ]);
    expect(result.judgment.summary).toBe("The proof judgment completed through streaming retry.");
  });

  it("retries invalid proof JSON inside the proof retry envelope", async () => {
    let calls = 0;
    const requestStreams: unknown[] = [];
    const retryDelays: number[] = [];
    const progressEvents: AmbientProjectBoardProofJudgmentProgress[] = [];
    const provider = new AmbientProjectBoardProofJudgeProvider({
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
        if (calls === 1) return jsonProofChatCompletionTextResponse("not json");
        return jsonProofChatCompletionResponse({
          status: "done",
          summary: "The proof judgment recovered after invalid JSON.",
          satisfied: ["Canvas criterion satisfied."],
          missing: [],
          evidenceQuality: "strong",
          recommendedAction: "close",
          confidence: 0.9,
        });
      },
    });

    const result = await provider.judge({
      card,
      run,
      deterministicReview,
      onProgress: (event) => progressEvents.push(event),
    });

    expect(calls).toBe(2);
    expect(requestStreams).toEqual([true, true]);
    expect(retryDelays).toEqual([1_000]);
    expect(progressEvents.filter((event) => event.transientRetry)).toEqual([
      expect.objectContaining({
        retryAttempt: 1,
        fallbackToNonStream: false,
        retryError: expect.stringContaining("response validation failed"),
      }),
    ]);
    expect(result.judgment.summary).toBe("The proof judgment recovered after invalid JSON.");
  });

  it("falls back to a non-stream proof judgment when streaming closes before content", async () => {
    const bodies: Record<string, unknown>[] = [];
    const provider = new AmbientProjectBoardProofJudgeProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        bodies.push(body);
        if (bodies.length === 1) {
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.close();
              },
            }),
            { status: 200, headers: { "Content-Type": "text/event-stream" } },
          );
        }
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    status: "done",
                    summary: "The proof judgment completed through the non-stream fallback.",
                    satisfied: ["Canvas criterion satisfied."],
                    missing: [],
                    evidenceQuality: "strong",
                    recommendedAction: "close",
                    confidence: 0.9,
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.judge({ card, run, deterministicReview });

    expect(bodies.map((body) => body.stream)).toEqual([true, false]);
    expect(result.judgment.summary).toBe("The proof judgment completed through the non-stream fallback.");
  });

  it("streams proof judgment output and reports response character progress", async () => {
    const content = JSON.stringify({
      status: "done",
      summary: "The shell card is complete with streamed proof judgment.",
      satisfied: ["Canvas criterion satisfied."],
      missing: [],
      evidenceQuality: "strong",
      recommendedAction: "close",
      confidence: 0.89,
    });
    const progress: number[] = [];
    const provider = new AmbientProjectBoardProofJudgeProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(0, 30) } }] })}\n\n`));
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(30) } }] })}\n\n`));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
    });

    const result = await provider.judge({
      card,
      run,
      deterministicReview,
      onProgress: (event) => progress.push(event.responseCharCount),
    });

    expect(result.judgment.summary).toBe("The shell card is complete with streamed proof judgment.");
    expect(progress.at(-1)).toBe(content.length);
    expect(result.telemetry.responseCharCount).toBe(content.length);
  });

  it("builds a prompt with acceptance criteria, proof expectations, and proof packet", () => {
    const prompt = buildProjectBoardProofJudgmentPrompt({ card, run, deterministicReview });

    expect(prompt).toContain("Canvas renders a nonblank scene.");
    expect(prompt).toContain("Capture canvas screenshot.");
    expect(prompt).toContain("src/App.tsx");
    expect(prompt).toContain("GLM 5.1 cannot inspect image pixels directly");
    expect(prompt).toContain("ask_user must include the direct question to ask the user");
    expect(prompt).toContain("followUpSuggestion");
    expect(prompt).toContain("ticket-ready draft card");
    expect(prompt).toContain("Deterministic proof review fallback");
  });

  it("projects task-action files and commands before the raw proof packet", () => {
    const noisyRun: OrchestrationRun = {
      ...run,
      proofOfWork: {
        changedFiles: Array.from({ length: 300 }, (_item, index) => `../../../../parent-file-${index}.md`),
        taskToolActions: [
          {
            actionId: "proof-actual-files",
            action: "task_report_proof",
            createdAt: "2026-05-03T00:00:02.000Z",
            summary: "Pomodoro files were created and verified.",
            changedFiles: ["index.html", "app.js", "style.css", "tests/checklist.md", "tests/verify-pomodoro.mjs"],
            commands: ["node --check app.js", "node tests/verify-pomodoro.mjs"],
          },
          {
            actionId: "complete-actual-files",
            action: "task_complete",
            createdAt: "2026-05-03T00:00:03.000Z",
            summary: "Pomodoro files complete.",
            completed: ["Created and verified all required Pomodoro files."],
            remaining: [],
            risks: [],
            changedFiles: ["index.html", "app.js", "style.css", "tests/checklist.md", "tests/verify-pomodoro.mjs"],
            commands: ["node --check app.js", "node tests/verify-pomodoro.mjs"],
          },
        ],
      },
    };

    const prompt = buildProjectBoardProofJudgmentPrompt({ card, run: noisyRun, deterministicReview });
    const projectionIndex = prompt.indexOf("Structured task-action evidence projection:");
    const proofPacketIndex = prompt.indexOf("Proof packet:");

    expect(projectionIndex).toBeGreaterThan(-1);
    expect(proofPacketIndex).toBeGreaterThan(projectionIndex);
    expect(prompt.slice(projectionIndex, proofPacketIndex)).toContain("tests/verify-pomodoro.mjs");
    expect(prompt.slice(projectionIndex, proofPacketIndex)).toContain("node tests/verify-pomodoro.mjs");
  });

  it("normalizes follow-up suggestions only for follow-up proof judgments", () => {
    expect(
      normalizeProjectBoardProofJudgment(
        {
          status: "needs_follow_up",
          summary: "The shell is partially implemented, but mobile visual proof is missing.",
          satisfied: ["Implementation evidence recorded."],
          missing: ["Collect mobile and desktop screenshot evidence."],
          evidenceQuality: "mixed",
          recommendedAction: "follow_up",
          confidence: 0.84,
          followUpSuggestion: {
            title: "Collect viewport screenshot proof for WebGL shell",
            description: "Capture the missing viewport evidence for the completed shell work.",
            acceptanceCriteria: ["Desktop and mobile screenshots show the canvas and HUD."],
            testPlan: {
              unit: [],
              integration: ["Run the browser smoke check before capture."],
              visual: ["Capture 1280px desktop and 390px mobile screenshots."],
              manual: ["Inspect screenshots for canvas, ship placeholder, and HUD visibility."],
            },
            clarificationQuestions: ["Which viewport is release-blocking if only one screenshot can be captured?"],
            labels: [" Visual Proof ", "Viewport"],
            rationale: "The implementation is useful, but evidence is incomplete.",
          },
        },
        deterministicReview,
      ),
    ).toMatchObject({
      recommendedAction: "follow_up",
      followUpSuggestion: {
        title: "Collect viewport screenshot proof for WebGL shell",
        description: "Capture the missing viewport evidence for the completed shell work.",
        acceptanceCriteria: ["Desktop and mobile screenshots show the canvas and HUD."],
        testPlan: {
          integration: ["Run the browser smoke check before capture."],
          visual: ["Capture 1280px desktop and 390px mobile screenshots."],
          manual: ["Inspect screenshots for canvas, ship placeholder, and HUD visibility."],
        },
        clarificationQuestions: ["Which viewport is release-blocking if only one screenshot can be captured?"],
        labels: ["visual-proof", "viewport"],
      },
    });

    expect(
      normalizeProjectBoardProofJudgment(
        {
          status: "retry_recommended",
          summary: "Retry with the same card.",
          missing: ["Run the command."],
          recommendedAction: "retry",
          followUpSuggestion: {
            title: "This should be ignored for retry.",
            acceptanceCriteria: ["Do not create a follow-up."],
          },
        },
        deterministicReview,
      ).followUpSuggestion,
    ).toBeUndefined();
  });

  it("falls back safely when judgment fields are malformed", () => {
    expect(
      normalizeProjectBoardProofJudgment(
        {
          status: "ship_it",
          summary: "",
          satisfied: [" Model-satisfied "],
          missing: "nope",
          evidenceQuality: "unknown",
          recommendedAction: "do_magic",
          confidence: 2,
        },
        deterministicReview,
      ),
    ).toEqual({
      status: "ready_for_review",
      summary: "Deterministic proof is satisfied.",
      satisfied: ["Model-satisfied"],
      missing: [],
      evidenceQuality: "strong",
      recommendedAction: "close",
      confidence: 1,
    });
  });

  it("parses fenced JSON proof judgments", () => {
    expect(parseProjectBoardProofJudgmentJson('```json\n{"status":"done"}\n```')).toEqual({ status: "done" });
  });
});

function streamingProofTextResponse(chunks: string[], done: boolean): Response {
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

function jsonProofChatCompletionResponse(content: Record<string, unknown>): Response {
  return jsonProofChatCompletionTextResponse(JSON.stringify(content));
}

function jsonProofChatCompletionTextResponse(content: string): Response {
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
