import { describe, expect, it } from "vitest";
import {
  AmbientProjectBoardClarificationDefaultProvider,
  buildProjectBoardClarificationDefaultPrompt,
  deterministicProjectBoardClarificationDefaultSuggestionForTarget,
  normalizeProjectBoardClarificationDefaultSuggestions,
  parseProjectBoardClarificationDefaultJson,
  projectBoardClarificationDefaultSuggestionTargets,
  type AmbientProjectBoardClarificationDefaultProgress,
} from "./projectBoardClarificationDefaultProvider";
import { aggressiveAmbientRetryPolicy } from "./projectBoardAmbientFacade";
import type { ProjectBoardCard } from "../../shared/projectBoardTypes";

describe("AmbientProjectBoardClarificationDefaultProvider", () => {
  const animatedCard = card({
    id: "card-animated",
    title: "Create animated hello-world page",
    description: "Build a browser page that renders Hello from Ambient with a subtle animation.",
    labels: ["html", "animation"],
    acceptanceCriteria: ["Greeting renders.", "Animation is visible and not distracting."],
    clarificationQuestions: ["Should the animation use pulse or confetti?"],
  });

  it("targets open legacy decisions that do not already have suggestions", () => {
    const [target] = projectBoardClarificationDefaultSuggestionTargets([animatedCard]);

    expect(target).toMatchObject({
      cardId: animatedCard.id,
      question: "Should the animation use pulse or confetti?",
      decisionId: expect.stringContaining("clarification:"),
    });

    const alreadySuggested = card({
      ...animatedCard,
      clarificationSuggestions: [
        {
          question: "Should the animation use pulse or confetti?",
          suggestedAnswer: "Use a pulse animation.",
          rationale: "Simple.",
          confidence: "high",
          safeToAccept: true,
          questionKind: "expert_default",
        },
      ],
    });
    expect(projectBoardClarificationDefaultSuggestionTargets([alreadySuggested])).toEqual([]);
  });

  it("does not target decisions that overlap answered decisions on other cards", () => {
    const answeredCard = card({
      id: "card-ui",
      title: "Implement ui.js",
      clarificationDecisions: [
        {
          id: "clarification:test-runner",
          canonicalKey: "test framework runner",
          question:
            "No test framework or runner is specified in the durable plan. Which testing approach should be used for integration proof of ui.js DOM wiring and cross-module behavior?",
          source: "card",
          state: "answered",
          answer:
            "Use a lightweight browser-based test runner with no external test framework dependency, consistent with the zero-external-dependency constraint.",
          answeredAt: "2026-05-19T00:00:00.000Z",
        },
      ],
    });
    const overlappingCard = card({
      id: "card-engine",
      title: "Implement engine.js",
      clarificationQuestions: [
        "Which test framework or runner should be used for unit and integration tests? The charter identifies this as an unresolved decision that affects proof paths for all pure-module and integration cards.",
      ],
    });

    expect(projectBoardClarificationDefaultSuggestionTargets([answeredCard, overlappingCard])).toEqual([]);
  });

  it("calls Ambient chat completions and normalizes expert defaults", async () => {
    const [target] = projectBoardClarificationDefaultSuggestionTargets([animatedCard]);
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const provider = new AmbientProjectBoardClarificationDefaultProvider({
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
                        cardId: target.cardId,
                        decisionId: target.decisionId,
                        question: target.question,
                        suggestedAnswer: "Use a subtle pulse animation.",
                        rationale: "Pulse is cheap to implement and easy to prove visually.",
                        confidence: "high",
                        safeToAccept: true,
                        questionKind: "expert_default",
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

    const result = await provider.suggest({ boardTitle: "Tiny board", targets: [target] });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://ambient.example/v1/chat/completions");
    expect(calls[0].body.stream).toBe(true);
    expect(JSON.stringify(calls[0].body)).toContain("expert UX designer");
    expect(result.suggestions).toEqual([
      expect.objectContaining({
        cardId: animatedCard.id,
        decisionId: target.decisionId,
        suggestedAnswer: "Use a subtle pulse animation.",
        confidence: "high",
        safeToAccept: true,
        questionKind: "expert_default",
      }),
    ]);
    expect(result.telemetry.promptCharCount).toBeGreaterThan(100);
    expect(result.telemetry.responseCharCount).toBeGreaterThan(10);
  });

  it("falls back to PM-review-only suggestions when model output is missing", () => {
    const [target] = projectBoardClarificationDefaultSuggestionTargets([animatedCard]);
    const [suggestion] = normalizeProjectBoardClarificationDefaultSuggestions({ suggestions: [] }, [target]);

    expect(suggestion).toEqual(deterministicProjectBoardClarificationDefaultSuggestionForTarget(target));
    expect(suggestion.safeToAccept).toBe(false);
    expect(suggestion.questionKind).toBe("user_preference");
  });

  it("falls back to non-stream chat completion when the provider closes a semantic stream before DONE", async () => {
    const [target] = projectBoardClarificationDefaultSuggestionTargets([animatedCard]);
    const calls: Array<Record<string, unknown>> = [];
    const provider = new AmbientProjectBoardClarificationDefaultProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        calls.push(body);
        if (body.stream === true) {
          return new Response(
            `data: ${JSON.stringify({ choices: [{ delta: { content: "{\"suggestions\":" } }] })}\n\n`,
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
                        cardId: target.cardId,
                        decisionId: target.decisionId,
                        question: target.question,
                        suggestedAnswer: "Use a subtle pulse animation.",
                        rationale: "Simple and testable.",
                        confidence: "medium",
                        safeToAccept: true,
                        questionKind: "expert_default",
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

    const result = await provider.suggest({ targets: [target] });

    expect(calls.map((call) => call.stream)).toEqual([true, false]);
    expect(result.suggestions[0]).toMatchObject({
      suggestedAnswer: "Use a subtle pulse animation.",
      confidence: "medium",
      safeToAccept: true,
    });
  });

  it("falls back to non-stream chat completion when streamed defaults JSON is malformed", async () => {
    const [target] = projectBoardClarificationDefaultSuggestionTargets([animatedCard]);
    const calls: Array<Record<string, unknown>> = [];
    const provider = new AmbientProjectBoardClarificationDefaultProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        calls.push(body);
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
                        cardId: target.cardId,
                        decisionId: target.decisionId,
                        question: target.question,
                        suggestedAnswer: "Use a subtle pulse animation.",
                        rationale: "Recovered through the non-stream fallback after malformed streamed JSON.",
                        confidence: "medium",
                        safeToAccept: true,
                        questionKind: "expert_default",
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

    const result = await provider.suggest({ targets: [target] });

    expect(calls.map((call) => call.stream)).toEqual([true, false]);
    expect(result.suggestions[0]).toMatchObject({
      suggestedAnswer: "Use a subtle pulse animation.",
      confidence: "medium",
      safeToAccept: true,
    });
  });

  it("builds a prompt with safe-acceptance guardrails", () => {
    const [target] = projectBoardClarificationDefaultSuggestionTargets([animatedCard]);
    const prompt = buildProjectBoardClarificationDefaultPrompt({ boardTitle: "Tiny board", targets: [target] });

    expect(prompt).toContain("safeToAccept true only");
    expect(prompt).toContain("Do not rewrite cards");
    expect(prompt).toContain("Should the animation use pulse or confetti?");
  });

  it("parses fenced JSON clarification defaults", () => {
    expect(parseProjectBoardClarificationDefaultJson('```json\n{"suggestions":[]}\n```')).toEqual({ suggestions: [] });
  });

  it("reports retry progress for transient provider failures", async () => {
    const [target] = projectBoardClarificationDefaultSuggestionTargets([animatedCard]);
    let calls = 0;
    const retryDelays: number[] = [];
    const progressEvents: AmbientProjectBoardClarificationDefaultProgress[] = [];
    const provider = new AmbientProjectBoardClarificationDefaultProvider({
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
                        cardId: target.cardId,
                        decisionId: target.decisionId,
                        question: target.question,
                        suggestedAnswer: "Use a subtle pulse animation.",
                        rationale: "Simple and testable.",
                        confidence: "high",
                        safeToAccept: true,
                        questionKind: "expert_default",
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

    await provider.suggest({ targets: [target], onProgress: (event) => progressEvents.push(event) });

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
    boardId: input.boardId ?? "board-clarification-defaults",
    title: input.title,
    description: input.description ?? "Implement this card.",
    status: input.status ?? "draft",
    candidateStatus: input.candidateStatus ?? "needs_clarification",
    priority: input.priority,
    phase: input.phase,
    labels: input.labels ?? [],
    blockedBy: input.blockedBy ?? [],
    acceptanceCriteria: input.acceptanceCriteria ?? ["Acceptance condition exists."],
    testPlan: input.testPlan ?? { unit: [], integration: [], visual: [], manual: ["Manual proof."] },
    sourceKind: input.sourceKind ?? "board_synthesis",
    sourceId: input.sourceId ?? input.id,
    sourceRefs: input.sourceRefs,
    clarificationQuestions: input.clarificationQuestions,
    clarificationSuggestions: input.clarificationSuggestions,
    clarificationAnswers: input.clarificationAnswers,
    clarificationDecisions: input.clarificationDecisions,
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
