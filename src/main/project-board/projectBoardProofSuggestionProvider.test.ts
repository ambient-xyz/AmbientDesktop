import { describe, expect, it } from "vitest";
import {
  AmbientProjectBoardProofSuggestionProvider,
  buildProjectBoardProofSuggestionPrompt,
  deterministicProjectBoardProofSuggestionForCard,
  normalizeProjectBoardProofSuggestions,
  parseProjectBoardProofSuggestionJson,
  type AmbientProjectBoardProofSuggestionProgress,
} from "./projectBoardProofSuggestionProvider";
import { aggressiveAmbientRetryPolicy } from "../aggressiveRetries";
import type { ProjectBoardCard } from "../../shared/types";

describe("AmbientProjectBoardProofSuggestionProvider", () => {
  const visualCard = card({
    id: "card-visual",
    title: "Implement responsive animation viewport",
    description: "Build the browser-visible animated hello-world shell with desktop and mobile layouts.",
    labels: ["layout"],
    acceptanceCriteria: ["Greeting renders on desktop and mobile.", "Animation is visible and non-jarring."],
  });
  const moduleCard = card({
    id: "card-module",
    title: "Implement parser state model",
    description: "Create pure parser state helpers and reducer logic.",
    labels: ["state-model"],
    acceptanceCriteria: ["Parser state transitions are deterministic."],
  });

  it("calls Ambient chat completions and normalizes proof suggestions", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const provider = new AmbientProjectBoardProofSuggestionProvider({
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
                    suggestions: [
                      {
                        cardId: visualCard.id,
                        unit: [],
                        integration: ["Run a browser smoke check for the animated viewport."],
                        visual: ["Capture desktop and mobile screenshots proving the greeting is visible and nonblank."],
                        manual: [],
                        rationale: "The card owns visible layout and animation behavior.",
                        confidence: "high",
                      },
                      {
                        cardId: moduleCard.id,
                        unit: ["Run reducer unit tests for parser state transitions."],
                        integration: [],
                        visual: ["Capture a screenshot even though this is a module."],
                        manual: [],
                        rationale: "The card owns pure module behavior.",
                        confidence: "medium",
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

    const result = await provider.suggest({ boardTitle: "Tiny board", cards: [visualCard, moduleCard] });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://ambient.example/v1/chat/completions");
    expect(calls[0].body.stream).toBe(true);
    expect(JSON.stringify(calls[0].body)).toContain("Implement responsive animation viewport");
    expect(result.suggestions).toEqual([
      expect.objectContaining({
        cardId: visualCard.id,
        confidence: "high",
        testPlan: expect.objectContaining({
          integration: ["Run a browser smoke check for the animated viewport."],
          visual: ["Capture desktop and mobile screenshots proving the greeting is visible and nonblank."],
        }),
      }),
      expect.objectContaining({
        cardId: moduleCard.id,
        proofOwnership: "pure_module",
        testPlan: expect.objectContaining({
          unit: ["Run reducer unit tests for parser state transitions."],
          visual: [],
        }),
      }),
    ]);
    expect(result.telemetry).toMatchObject({
      promptCharCount: expect.any(Number),
      responseCharCount: expect.any(Number),
      requestDurationMs: expect.any(Number),
    });
  });

  it("falls back to deterministic proof expectations when Pi output is incomplete", () => {
    const [suggestion] = normalizeProjectBoardProofSuggestions({ suggestions: [{ cardId: visualCard.id, unit: [], integration: [], visual: [], manual: [] }] }, [
      visualCard,
    ]);

    expect(suggestion).toEqual(deterministicProjectBoardProofSuggestionForCard(visualCard));
    expect(suggestion.testPlan.visual[0]).toContain("desktop and mobile visual proof");
  });

  it("falls back to non-stream proof suggestions when streamed JSON is malformed", async () => {
    const bodies: Record<string, unknown>[] = [];
    const provider = new AmbientProjectBoardProofSuggestionProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        bodies.push(body);
        if (body.stream === true) {
          return new Response(
            `data: ${JSON.stringify({ choices: [{ delta: { content: "not json" } }] })}\n\ndata: [DONE]\n\n`,
            { status: 200, headers: { "Content-Type": "text/event-stream" } },
          );
        }
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    suggestions: [
                      {
                        cardId: visualCard.id,
                        unit: [],
                        integration: ["Run browser smoke after recovering from malformed streamed JSON."],
                        visual: ["Capture desktop and mobile screenshots after recovery."],
                        manual: [],
                        rationale: "The non-stream fallback still returns reviewable proof expectations.",
                        confidence: "medium",
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

    const result = await provider.suggest({ cards: [visualCard] });

    expect(bodies.map((body) => body.stream)).toEqual([true, false]);
    expect(result.suggestions[0]).toMatchObject({
      cardId: visualCard.id,
      confidence: "medium",
      testPlan: expect.objectContaining({
        integration: ["Run browser smoke after recovering from malformed streamed JSON."],
      }),
    });
  });

  it("builds a prompt with proof-scope rules and card ownership", () => {
    const prompt = buildProjectBoardProofSuggestionPrompt({ boardTitle: "Tiny board", cards: [visualCard, moduleCard] });

    expect(prompt).toContain("proofOwnership");
    expect(prompt).toContain("pure_module");
    expect(prompt).toContain("visible_surface");
    expect(prompt).toContain("do not add screenshot");
    expect(prompt).toContain("Return one suggestion for every input card id");
  });

  it("parses fenced JSON proof suggestions", () => {
    expect(parseProjectBoardProofSuggestionJson('```json\n{"suggestions":[]}\n```')).toEqual({ suggestions: [] });
  });

  it("reports retry progress for transient provider failures", async () => {
    let calls = 0;
    const retryDelays: number[] = [];
    const progressEvents: AmbientProjectBoardProofSuggestionProgress[] = [];
    const provider = new AmbientProjectBoardProofSuggestionProvider({
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
                    suggestions: [
                      {
                        cardId: visualCard.id,
                        unit: [],
                        integration: ["Run browser smoke."],
                        visual: ["Capture screenshot proof."],
                        manual: [],
                        rationale: "Visible surface.",
                        confidence: "high",
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

    await provider.suggest({ cards: [visualCard], onProgress: (event) => progressEvents.push(event) });

    expect(calls).toBe(2);
    expect(retryDelays).toEqual([1_000]);
    expect(progressEvents.filter((event) => event.transientRetry)).toEqual([
      expect.objectContaining({
        responseCharCount: 0,
        retryAttempt: 1,
        maxRetries: 10,
        retryDelayMs: 1_000,
        aggressiveRetries: true,
        retryError: expect.stringContaining("429"),
      }),
    ]);
  });
});

function card(input: Partial<ProjectBoardCard> & Pick<ProjectBoardCard, "id" | "title">): ProjectBoardCard {
  return {
    id: input.id,
    boardId: input.boardId ?? "board-proof",
    title: input.title,
    description: input.description ?? "Implement this card.",
    status: input.status ?? "draft",
    candidateStatus: input.candidateStatus ?? "ready_to_create",
    priority: input.priority,
    phase: input.phase,
    labels: input.labels ?? [],
    blockedBy: input.blockedBy ?? [],
    acceptanceCriteria: input.acceptanceCriteria ?? ["Acceptance condition exists."],
    testPlan: input.testPlan ?? { unit: [], integration: [], visual: [], manual: [] },
    sourceKind: input.sourceKind ?? "board_synthesis",
    sourceId: input.sourceId ?? "source-proof",
    sourceRefs: input.sourceRefs,
    clarificationQuestions: input.clarificationQuestions,
    clarificationAnswers: input.clarificationAnswers,
    objectiveProvenance: input.objectiveProvenance,
    sourceThreadId: input.sourceThreadId,
    sourceMessageId: input.sourceMessageId,
    orchestrationTaskId: input.orchestrationTaskId,
    executionThreadId: input.executionThreadId,
    executionSessionPolicy: input.executionSessionPolicy,
    proofReview: input.proofReview,
    splitOutcome: input.splitOutcome,
    claim: input.claim,
    claimConflicts: input.claimConflicts,
    userTouchedFields: input.userTouchedFields,
    userTouchedAt: input.userTouchedAt,
    pendingPiUpdate: input.pendingPiUpdate,
    createdAt: input.createdAt ?? "2026-05-16T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-05-16T00:00:00.000Z",
  };
}
