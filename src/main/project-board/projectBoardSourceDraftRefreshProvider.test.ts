import { describe, expect, it } from "vitest";
import {
  AmbientProjectBoardSourceDraftRefreshProvider,
  buildProjectBoardSourceDraftRefreshPrompt,
  deterministicProjectBoardSourceDraftRefreshSuggestionForCard,
  normalizeProjectBoardSourceDraftRefreshSuggestions,
  parseProjectBoardSourceDraftRefreshJson,
} from "./projectBoardSourceDraftRefreshProvider";
import type { ProjectBoardCard, ProjectBoardSource } from "../../shared/projectBoardTypes";

describe("AmbientProjectBoardSourceDraftRefreshProvider", () => {
  const durableSource: ProjectBoardSource = {
    id: "source-durable",
    boardId: "board-source-refresh",
    kind: "plan_artifact",
    title: "Tiny Hello Durable Plan",
    summary: "Primary durable plan requires a subtle hello-world animation.",
    relevance: 99,
    authorityRole: "primary",
    includeInSynthesis: true,
    path: ".ambient/board/plans/Tiny-Hello-DurablePlan.html",
    createdAt: "2026-05-16T00:00:00.000Z",
    updatedAt: "2026-05-16T00:00:00.000Z",
  };
  const chatSource: ProjectBoardSource = {
    id: "source-chat",
    boardId: "board-source-refresh",
    kind: "thread",
    title: "Animation notes",
    summary: "Newly included chat asks for a calm blue pulse, not confetti.",
    relevance: 70,
    authorityRole: "context",
    includeInSynthesis: true,
    threadId: "thread-animation-notes",
    createdAt: "2026-05-16T00:00:00.000Z",
    updatedAt: "2026-05-16T00:00:00.000Z",
  };
  const animatedCard = card({
    id: "card-animated",
    title: "Create animated hello-world page",
    description: "Build a browser page that renders Hello from Ambient.",
    labels: ["html"],
    sourceRefs: [durableSource.id, chatSource.id],
    acceptanceCriteria: ["Greeting renders."],
    testPlan: { unit: [], integration: ["Run browser smoke."], visual: [], manual: [] },
  });

  it("calls Ambient chat completions and normalizes source-targeted draft suggestions", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const provider = new AmbientProjectBoardSourceDraftRefreshProvider({
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
                        description: "Build a browser page that renders Hello from Ambient with the newly included calm blue pulse.",
                        labels: ["html", "animation", "source-refresh"],
                        acceptanceCriteria: ["Greeting renders.", "Calm blue pulse is visible and non-distracting."],
                        testPlan: {
                          unit: [],
                          integration: ["Run browser smoke."],
                          visual: ["Capture desktop and mobile screenshots of the calm pulse."],
                          manual: [],
                        },
                        clarificationQuestions: [],
                        rationale: "The newly included chat adds color and animation constraints.",
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
      boardTitle: "Tiny source refresh board",
      sources: [durableSource, chatSource],
      sourceChangeSummary: "Animation notes changed from ignored chat to included context.",
      cards: [animatedCard],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://ambient.example/v1/chat/completions");
    expect(calls[0].body.stream).toBe(true);
    expect(JSON.stringify(calls[0].body)).toContain("Treat primary durable-plan sources as authoritative");
    expect(result.suggestions).toEqual([
      expect.objectContaining({
        cardId: animatedCard.id,
        confidence: "high",
        description: expect.stringContaining("calm blue pulse"),
        labels: ["html", "animation", "source-refresh"],
        clarificationQuestions: [],
        testPlan: expect.objectContaining({
          visual: ["Capture desktop and mobile screenshots of the calm pulse."],
        }),
      }),
    ]);
    expect(result.telemetry.promptCharCount).toBeGreaterThan(100);
    expect(result.telemetry.responseCharCount).toBeGreaterThan(10);
  });

  it("falls back to a non-stream source refresh when a JSON stream closes before done", async () => {
    const bodies: Record<string, unknown>[] = [];
    const provider = new AmbientProjectBoardSourceDraftRefreshProvider({
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
                        description: "Build a browser page that renders Hello from Ambient with the recovered calm blue pulse.",
                        labels: ["html", "animation", "source-refresh"],
                        acceptanceCriteria: ["Greeting renders.", "Recovered calm blue pulse is visible."],
                        testPlan: { unit: [], integration: ["Run browser smoke."], visual: ["Capture recovered pulse screenshot."], manual: [] },
                        clarificationQuestions: [],
                        rationale: "The non-stream fallback completed the same side-effect-free source refresh.",
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
      sources: [durableSource, chatSource],
      sourceChangeSummary: "Animation notes changed from ignored chat to included context.",
      cards: [animatedCard],
    });

    expect(bodies.map((body) => body.stream)).toEqual([true, false]);
    expect(result.suggestions[0]).toMatchObject({
      cardId: animatedCard.id,
      description: expect.stringContaining("recovered calm blue pulse"),
      clarificationQuestions: [],
      confidence: "high",
    });
  });

  it("falls back to non-stream when streamed source-refresh JSON is malformed", async () => {
    const bodies: Record<string, unknown>[] = [];
    const provider = new AmbientProjectBoardSourceDraftRefreshProvider({
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
                        description: "Build a browser page that renders Hello from Ambient with the recovered source-impact pulse.",
                        labels: ["html", "animation", "source-refresh"],
                        acceptanceCriteria: ["Greeting renders.", "Recovered source-impact pulse is visible."],
                        testPlan: { unit: [], integration: ["Run browser smoke."], visual: ["Capture recovered source screenshot."], manual: [] },
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
      sources: [durableSource, chatSource],
      sourceChangeSummary: "Animation notes changed from ignored chat to included context.",
      cards: [animatedCard],
    });

    expect(bodies.map((body) => body.stream)).toEqual([true, false]);
    expect(result.suggestions[0]).toMatchObject({
      cardId: animatedCard.id,
      description: expect.stringContaining("recovered source-impact pulse"),
      confidence: "medium",
    });
  });

  it("falls back to deterministic source-impact notes for missing model records", () => {
    const [suggestion] = normalizeProjectBoardSourceDraftRefreshSuggestions(
      { cards: [] },
      {
        sourceChangeSummary: "Animation notes changed from ignored chat to included context.",
        cards: [animatedCard],
      },
    );

    expect(suggestion).toEqual(
      deterministicProjectBoardSourceDraftRefreshSuggestionForCard(animatedCard, {
        sourceChangeSummary: "Animation notes changed from ignored chat to included context.",
      }),
    );
    expect(suggestion.description).toContain("## Source impact refresh");
    expect(suggestion.acceptanceCriteria).toEqual(animatedCard.acceptanceCriteria);
  });

  it("builds a bounded prompt with source-refresh guardrails", () => {
    const prompt = buildProjectBoardSourceDraftRefreshPrompt({
      boardTitle: "Tiny source refresh board",
      sources: [durableSource, chatSource],
      sourceChangeSummary: "Animation notes changed from ignored chat to included context.",
      cards: [animatedCard],
    });

    expect(prompt).toContain("source authority or inclusion changed");
    expect(prompt).toContain("Treat primary durable-plan sources as authoritative");
    expect(prompt).toContain("Do not change title, status, candidateStatus");
    expect(prompt).toContain("Create animated hello-world page");
  });

  it("parses fenced JSON refresh suggestions", () => {
    expect(parseProjectBoardSourceDraftRefreshJson('```json\n{"cards":[]}\n```')).toEqual({ cards: [] });
  });
});

function card(input: Partial<ProjectBoardCard> & Pick<ProjectBoardCard, "id" | "title">): ProjectBoardCard {
  return {
    id: input.id,
    boardId: input.boardId ?? "board-source-refresh",
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
