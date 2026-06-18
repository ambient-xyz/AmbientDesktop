import { describe, expect, it } from "vitest";
import {
  AmbientProjectBoardDecisionDraftRefreshProvider,
  buildProjectBoardDecisionDraftRefreshPrompt,
  deterministicProjectBoardDecisionDraftRefreshSuggestionForCard,
  normalizeProjectBoardDecisionDraftRefreshSuggestions,
  parseProjectBoardDecisionDraftRefreshJson,
} from "./projectBoardDecisionDraftRefreshProvider";
import type { ProjectBoardCard } from "../../shared/projectBoardTypes";

describe("AmbientProjectBoardDecisionDraftRefreshProvider", () => {
  const animatedCard = card({
    id: "card-animated",
    title: "Create animated hello-world page",
    description: "Build a browser page that renders Hello from Ambient.",
    labels: ["html"],
    acceptanceCriteria: ["Greeting renders."],
    clarificationQuestions: ["Should the greeting use a pulse or confetti animation?"],
    testPlan: { unit: [], integration: ["Run browser smoke."], visual: [], manual: [] },
  });

  it("calls Ambient chat completions and normalizes targeted draft refresh suggestions", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const provider = new AmbientProjectBoardDecisionDraftRefreshProvider({
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
                    cards: [
                      {
                        cardId: animatedCard.id,
                        description: "Build a browser page that renders Hello from Ambient with a subtle pulse animation.",
                        labels: ["html", "animation"],
                        acceptanceCriteria: ["Greeting renders.", "Pulse animation is visible but not distracting."],
                        testPlan: {
                          unit: [],
                          integration: ["Run browser smoke."],
                          visual: ["Capture desktop and mobile screenshots showing the pulse animation."],
                          manual: [],
                        },
                        clarificationQuestions: ["Should the greeting use a pulse or confetti animation?"],
                        rationale: "The PM chose pulse, so visual proof should cover the animation.",
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

    const result = await provider.refresh({
      boardTitle: "Tiny animated board",
      question: "Should the greeting use a pulse or confetti animation?",
      answer: "Use a subtle pulse animation.",
      cards: [animatedCard],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://ambient.example/v1/chat/completions");
    expect(calls[0].body.stream).toBe(true);
    expect(JSON.stringify(calls[0].body)).toContain("Do not change title, status, candidateStatus");
    expect(result.suggestions).toEqual([
      expect.objectContaining({
        cardId: animatedCard.id,
        confidence: "high",
        description: expect.stringContaining("subtle pulse"),
        labels: ["html", "animation"],
        clarificationQuestions: [],
        testPlan: expect.objectContaining({
          visual: ["Capture desktop and mobile screenshots showing the pulse animation."],
        }),
      }),
    ]);
    expect(result.telemetry.promptCharCount).toBeGreaterThan(100);
    expect(result.telemetry.responseCharCount).toBeGreaterThan(10);
  });

  it("falls back to a non-stream targeted refresh when a JSON stream closes before done", async () => {
    const bodies: Record<string, unknown>[] = [];
    const provider = new AmbientProjectBoardDecisionDraftRefreshProvider({
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
                const encoder = new TextEncoder();
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "{\"cards\":[{\"cardId\":\"card-animated\"" } }] })}\n\n`),
                );
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
                    cards: [
                      {
                        cardId: animatedCard.id,
                        description: "Build a browser page that renders Hello from Ambient with the recovered subtle pulse animation.",
                        labels: ["html", "animation"],
                        acceptanceCriteria: ["Greeting renders.", "Recovered pulse animation is visible."],
                        testPlan: { unit: [], integration: ["Run browser smoke."], visual: ["Capture pulse screenshot."], manual: [] },
                        clarificationQuestions: [],
                        rationale: "The non-stream fallback completed the same side-effect-free refresh.",
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

    const result = await provider.refresh({
      question: "Should the greeting use a pulse or confetti animation?",
      answer: "Use a subtle pulse animation.",
      cards: [animatedCard],
    });

    expect(bodies.map((body) => body.stream)).toEqual([true, false]);
    expect(result.suggestions[0]).toMatchObject({
      cardId: animatedCard.id,
      description: expect.stringContaining("recovered subtle pulse"),
      clarificationQuestions: [],
      confidence: "high",
    });
  });

  it("falls back to non-stream when streamed targeted-refresh JSON is malformed", async () => {
    const bodies: Record<string, unknown>[] = [];
    const provider = new AmbientProjectBoardDecisionDraftRefreshProvider({
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
                    cards: [
                      {
                        cardId: animatedCard.id,
                        description: "Build a browser page that renders Hello from Ambient with the recovered pulse decision.",
                        labels: ["html", "animation"],
                        acceptanceCriteria: ["Greeting renders.", "Recovered pulse decision is reflected."],
                        testPlan: { unit: [], integration: ["Run browser smoke."], visual: ["Capture recovered pulse screenshot."], manual: [] },
                        clarificationQuestions: [],
                        rationale: "The malformed stream was retried through the side-effect-free non-stream path.",
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

    const result = await provider.refresh({
      question: "Should the greeting use a pulse or confetti animation?",
      answer: "Use a subtle pulse animation.",
      cards: [animatedCard],
    });

    expect(bodies.map((body) => body.stream)).toEqual([true, false]);
    expect(result.suggestions[0]).toMatchObject({
      cardId: animatedCard.id,
      description: expect.stringContaining("recovered pulse decision"),
      confidence: "medium",
    });
  });

  it("falls back to deterministic clarification-note updates for missing model records", () => {
    const [suggestion] = normalizeProjectBoardDecisionDraftRefreshSuggestions(
      { cards: [] },
      {
        question: "Should the greeting use a pulse or confetti animation?",
        answer: "Use a subtle pulse animation.",
        cards: [animatedCard],
      },
    );

    expect(suggestion).toEqual(deterministicProjectBoardDecisionDraftRefreshSuggestionForCard(animatedCard, {
      question: "Should the greeting use a pulse or confetti animation?",
      answer: "Use a subtle pulse animation.",
    }));
    expect(suggestion.description).toContain("## Clarifications");
    expect(suggestion.clarificationQuestions).toEqual([]);
  });

  it("builds a bounded prompt with draft-refresh guardrails", () => {
    const prompt = buildProjectBoardDecisionDraftRefreshPrompt({
      question: "Should the greeting use a pulse or confetti animation?",
      answer: "Use a subtle pulse animation.",
      cards: [animatedCard],
    });

    expect(prompt).toContain("PM decision");
    expect(prompt).toContain("Remove the answered question");
    expect(prompt).toContain("Do not change title, status, candidateStatus");
    expect(prompt).toContain("Create animated hello-world page");
  });

  it("parses fenced JSON refresh suggestions", () => {
    expect(parseProjectBoardDecisionDraftRefreshJson('```json\n{"cards":[]}\n```')).toEqual({ cards: [] });
  });
});

function card(input: Partial<ProjectBoardCard> & Pick<ProjectBoardCard, "id" | "title">): ProjectBoardCard {
  return {
    id: input.id,
    boardId: input.boardId ?? "board-decision-refresh",
    title: input.title,
    description: input.description ?? "Card description.",
    status: input.status ?? "draft",
    candidateStatus: input.candidateStatus ?? "needs_clarification",
    priority: input.priority,
    phase: input.phase,
    labels: input.labels ?? [],
    blockedBy: input.blockedBy ?? [],
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    testPlan: input.testPlan ?? { unit: [], integration: [], visual: [], manual: [] },
    sourceKind: input.sourceKind ?? "board_synthesis",
    sourceId: input.sourceId ?? input.id,
    sourceRefs: input.sourceRefs,
    clarificationQuestions: input.clarificationQuestions,
    clarificationAnswers: input.clarificationAnswers,
    createdAt: input.createdAt ?? "2026-05-16T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-05-16T00:00:00.000Z",
  };
}
