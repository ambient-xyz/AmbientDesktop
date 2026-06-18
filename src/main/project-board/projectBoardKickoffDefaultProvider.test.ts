import { describe, expect, it } from "vitest";
import { projectBoardKickoffDefaultContextFingerprint } from "../../shared/projectBoardKickoffDefaults";
import type { ProjectBoardQuestion, ProjectBoardSource } from "../../shared/projectBoardTypes";
import { aggressiveAmbientRetryPolicy } from "./projectBoardAmbientFacade";
import {
  AmbientProjectBoardKickoffDefaultProvider,
  buildProjectBoardKickoffContextBrief,
  buildProjectBoardKickoffDefaultPrompt,
  normalizeProjectBoardKickoffDefaultSuggestions,
  parseProjectBoardKickoffDefaultJson,
  projectBoardKickoffDefaultSuggestionTargets,
} from "./projectBoardKickoffDefaultProvider";

describe("AmbientProjectBoardKickoffDefaultProvider", () => {
  const sources = [
    source({
      id: "source-plan",
      kind: "plan_artifact",
      title: "Durable Plan",
      summary: "Build a browser Asteroids game with gravity weapons and proof for each gameplay system.",
      excerpt: "Stage 1 builds ship movement. Stage 2 adds asteroid collisions. Stage 3 requires screenshot proof and manual playtest notes. ".repeat(60),
      path: ".ambient/board/plans/asteroids.html",
      authorityRole: "primary",
      includeInSynthesis: true,
      relevance: 99,
    }),
    source({
      id: "source-thread",
      kind: "thread",
      title: "Brainstorm thread",
      summary: "Optional ideas about extra particle polish.",
      threadId: "thread-1",
      authorityRole: "ignored",
      includeInSynthesis: false,
      relevance: 40,
    }),
  ];
  const questions = [
    question({
      id: "question-goal",
      question: "What is the primary outcome this project board should optimize for?",
    }),
    question({
      id: "question-proof",
      question: "What proof should be required before a card is considered review-ready?",
      answer: "Require runnable proof.",
    }),
  ];

  it("targets unanswered kickoff questions and fingerprints the current source context", () => {
    const [target] = projectBoardKickoffDefaultSuggestionTargets(questions, sources);

    expect(target).toMatchObject({
      questionId: "question-goal",
      sectionLabel: "Primary outcome",
    });
    expect(target.contextFingerprint).toBe(projectBoardKickoffDefaultContextFingerprint({ question: questions[0].question, sources }));
  });

  it("calls Ambient chat completions and normalizes source-derived defaults", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const progressEvents: Array<{ promptCharCount?: number; responseCharCount: number }> = [];
    const provider = new AmbientProjectBoardKickoffDefaultProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        calls.push(body);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    suggestions: [
                      {
                        questionId: "question-goal",
                        question: questions[0].question,
                        suggestedAnswer: "Ship the durable Asteroids gameplay slice described by the primary plan.",
                        rationale: "The durable plan is the primary included source.",
                        confidence: "high",
                        sourceIds: ["source-plan"],
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

    const result = await provider.suggest({
      boardTitle: "Asteroids board",
      questions,
      sources,
      onProgress: (progress) => progressEvents.push({ promptCharCount: progress.promptCharCount, responseCharCount: progress.responseCharCount }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].stream).toBe(true);
    expect(calls[0].max_tokens).toBe(1000);
    expect(JSON.stringify(calls[0])).toContain("Kickoff Default Answers");
    expect(result.suggestions).toEqual([
      expect.objectContaining({
        questionId: "question-goal",
        suggestedAnswer: "Ship the durable Asteroids gameplay slice described by the primary plan.",
        confidence: "high",
        sourceIds: ["source-plan"],
      }),
    ]);
    expect(result.telemetry.promptCharCount).toBeGreaterThan(100);
    expect(result.telemetry.contextBriefCharCount).toBeGreaterThan(100);
    expect(progressEvents[0]).toMatchObject({ promptCharCount: result.telemetry.promptCharCount, responseCharCount: 0 });
  });

  it("falls back to non-stream after repeated kickoff default stream stalls", async () => {
    const requestStreams: unknown[] = [];
    const retryEvents: Array<{ retryAttempt?: number; fallbackToNonStream?: boolean; retryError?: string }> = [];
    const recovered = JSON.stringify({
      suggestions: [
        {
          questionId: "question-goal",
          question: questions[0].question,
          suggestedAnswer: "Keep the first pass focused on the durable Asteroids gameplay scope with reviewable proof.",
          rationale: "The included durable plan defines gameplay scope and proof expectations.",
          confidence: "high",
          sourceIds: ["source-plan"],
        },
      ],
    });
    const provider = new AmbientProjectBoardKickoffDefaultProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      retryPolicy: aggressiveAmbientRetryPolicy(),
      waitForRetry: async () => undefined,
      streamIdleTimeoutMs: 100,
      streamContentIdleTimeoutMs: 10,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requestStreams.push(body.stream);
        if (requestStreams.length <= 2) return keepaliveOnlyStreamingResponse();
        return jsonTextResponse(recovered);
      },
    });

    const result = await provider.suggest({
      boardTitle: "Asteroids board",
      questions,
      sources,
      onProgress: (progress) => {
        if (progress.transientRetry) {
          retryEvents.push({
            retryAttempt: progress.retryAttempt,
            fallbackToNonStream: progress.fallbackToNonStream,
            retryError: progress.retryError,
          });
        }
      },
    });

    expect(requestStreams).toEqual([true, true, false]);
    expect(retryEvents).toEqual([
      expect.objectContaining({
        retryAttempt: 1,
        fallbackToNonStream: false,
        retryError: expect.stringContaining("without model content"),
      }),
      expect.objectContaining({
        retryAttempt: 2,
        fallbackToNonStream: true,
        retryError: expect.stringContaining("without model content"),
      }),
    ]);
    expect(result.suggestions[0]).toMatchObject({
      questionId: "question-goal",
      suggestedAnswer: "Keep the first pass focused on the durable Asteroids gameplay scope with reviewable proof.",
    });
  });

  it("does not invent deterministic defaults when model output omits a target", () => {
    const targets = projectBoardKickoffDefaultSuggestionTargets(questions, sources);

    expect(normalizeProjectBoardKickoffDefaultSuggestions({ suggestions: [] }, targets)).toEqual([]);
  });

  it("builds a prompt that distinguishes included and ignored sources", () => {
    const prompt = buildProjectBoardKickoffDefaultPrompt({ boardTitle: "Asteroids board", questions, sources });

    expect(prompt).toContain("ignored");
    expect(prompt).toContain("source-plan");
    expect(prompt).toContain("source-thread");
    expect(prompt).toContain("the user can edit each answer before saving.");
    expect(prompt).toContain("aim for 35-90 words");
    expect(prompt).toContain("Kickoff context brief");
    expect(prompt).not.toContain("Stage 1 builds ship movement. Stage 2 adds asteroid collisions. Stage 3 requires screenshot proof and manual playtest notes. Stage 1 builds");
  });

  it("builds a bounded kickoff context brief from durable plans and ignored sources", () => {
    const brief = buildProjectBoardKickoffContextBrief({ questions, sources, generatedAt: "2026-05-18T00:00:00.000Z" });

    expect(brief).toMatchObject({
      generator: "source_digest",
      includedSourceCount: 1,
      ignoredSourceCount: 1,
      durablePlanSourceIds: ["source-plan"],
    });
    expect(brief.sourceNotes.find((source) => source.sourceId === "source-plan")).toMatchObject({
      includeInSynthesis: true,
      proofExpectations: expect.arrayContaining([expect.stringContaining("screenshot proof")]),
    });
    expect(JSON.stringify(brief).length).toBeLessThan(5000);
  });

  it("parses fenced JSON kickoff defaults", () => {
    expect(parseProjectBoardKickoffDefaultJson('```json\n{"suggestions":[]}\n```')).toEqual({ suggestions: [] });
  });
});

function question(input: Partial<ProjectBoardQuestion> & Pick<ProjectBoardQuestion, "id" | "question">): ProjectBoardQuestion {
  return {
    boardId: "board-1",
    required: true,
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    ...input,
  };
}

function source(input: Partial<ProjectBoardSource> & Pick<ProjectBoardSource, "id" | "kind" | "title">): ProjectBoardSource {
  return {
    boardId: "board-1",
    summary: "",
    relevance: 50,
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    ...input,
  };
}

function keepaliveOnlyStreamingResponse(): Response {
  let interval: ReturnType<typeof setInterval> | undefined;
  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        interval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            if (interval) clearInterval(interval);
          }
        }, 2);
      },
      cancel() {
        if (interval) clearInterval(interval);
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

function jsonTextResponse(content: string): Response {
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
