import { describe, expect, it } from "vitest";
import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import {
  buildProjectBoardCandidateConsolidationPrompt,
  parseProjectBoardCandidateConsolidationResponse,
  projectBoardConsolidationCandidates,
  runProjectBoardCandidateConsolidation,
} from "./projectBoardCandidateConsolidation";

function candidateCard(overrides: Partial<ProjectBoardCard> & { id: string; title: string }): ProjectBoardCard {
  return {
    boardId: "board-1",
    description: `${overrides.title} description`,
    status: "draft",
    candidateStatus: "ready_to_create",
    labels: [],
    blockedBy: [],
    acceptanceCriteria: [],
    testPlan: { unit: [], integration: [], visual: [], manual: [] },
    sourceKind: "board_synthesis",
    sourceId: `synthesis:${overrides.id}`,
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("projectBoardConsolidationCandidates", () => {
  it("keeps only untouched synthesis draft candidates", () => {
    const cards = [
      candidateCard({ id: "a", title: "Stats API" }),
      candidateCard({ id: "b", title: "Stats queries", candidateStatus: "needs_clarification" }),
      candidateCard({ id: "manual", title: "User card", sourceKind: "manual" }),
      candidateCard({ id: "evidence", title: "Plan card", candidateStatus: "evidence" }),
      candidateCard({ id: "dup", title: "Already duplicate", candidateStatus: "duplicate" }),
      candidateCard({ id: "ticketized", title: "Running card", orchestrationTaskId: "LOCAL-1" }),
      candidateCard({ id: "done", title: "Done card", status: "done" }),
    ];

    expect(projectBoardConsolidationCandidates(cards).map((card) => card.id)).toEqual(["a", "b"]);
  });
});

describe("buildProjectBoardCandidateConsolidationPrompt", () => {
  it("includes ids, titles, and truncated descriptions for every candidate", () => {
    const prompt = buildProjectBoardCandidateConsolidationPrompt({
      projectName: "BookTrack",
      candidates: [
        candidateCard({ id: "card-a", title: "Stats API endpoints", description: `Build five stats routes. ${"x".repeat(600)}` }),
        candidateCard({ id: "card-b", title: "Stats SQL queries" }),
      ],
    });

    expect(prompt).toContain('"BookTrack"');
    expect(prompt).toContain("card-a");
    expect(prompt).toContain("Stats API endpoints");
    expect(prompt).toContain("card-b");
    expect(prompt).toContain("survivorCardId");
    expect(prompt).not.toContain("x".repeat(401));
  });
});

describe("parseProjectBoardCandidateConsolidationResponse", () => {
  const validIds = new Set(["card-a", "card-b", "card-c", "card-d"]);

  it("keeps valid groups and drops unknown ids", () => {
    const groups = parseProjectBoardCandidateConsolidationResponse(
      JSON.stringify({
        groups: [
          { survivorCardId: "card-a", duplicateCardIds: ["card-b", "card-missing"], reason: "Same stats routes" },
        ],
      }),
      validIds,
    );

    expect(groups).toEqual([{ survivorCardId: "card-a", duplicateCardIds: ["card-b"], reason: "Same stats routes" }]);
  });

  it("drops groups whose survivor is unknown or whose duplicates collapse to nothing", () => {
    const groups = parseProjectBoardCandidateConsolidationResponse(
      JSON.stringify({
        groups: [
          { survivorCardId: "card-missing", duplicateCardIds: ["card-b"], reason: "bad survivor" },
          { survivorCardId: "card-a", duplicateCardIds: ["card-a"], reason: "self duplicate" },
        ],
      }),
      validIds,
    );

    expect(groups).toEqual([]);
  });

  it("lets each card appear in at most one group", () => {
    const groups = parseProjectBoardCandidateConsolidationResponse(
      JSON.stringify({
        groups: [
          { survivorCardId: "card-a", duplicateCardIds: ["card-b"], reason: "first" },
          { survivorCardId: "card-b", duplicateCardIds: ["card-c"], reason: "claimed survivor" },
          { survivorCardId: "card-c", duplicateCardIds: ["card-d"], reason: "claimed survivor again" },
        ],
      }),
      validIds,
    );

    expect(groups).toEqual([
      { survivorCardId: "card-a", duplicateCardIds: ["card-b"], reason: "first" },
      { survivorCardId: "card-c", duplicateCardIds: ["card-d"], reason: "claimed survivor again" },
    ]);
  });

  it("parses fenced JSON responses", () => {
    const groups = parseProjectBoardCandidateConsolidationResponse(
      ['Here is the result:', "```json", JSON.stringify({ groups: [{ survivorCardId: "card-a", duplicateCardIds: ["card-b"], reason: "fenced" }] }), "```"].join("\n"),
      validIds,
    );

    expect(groups).toHaveLength(1);
  });
});

describe("runProjectBoardCandidateConsolidation", () => {
  it("skips the model call entirely with fewer than two candidates", async () => {
    let called = false;
    const groups = await runProjectBoardCandidateConsolidation({
      boardId: "board-1",
      candidates: [candidateCard({ id: "only", title: "Only card" })],
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "test-key",
      piTextCall: async () => {
        called = true;
        return JSON.stringify({ groups: [] });
      },
    });

    expect(groups).toEqual([]);
    expect(called).toBe(false);
  });

  it("sends every candidate to the model and validates the returned groups", async () => {
    let seenPrompt = "";
    const groups = await runProjectBoardCandidateConsolidation({
      boardId: "board-1",
      projectName: "BookTrack",
      candidates: [
        candidateCard({ id: "card-a", title: "Stats API endpoints" }),
        candidateCard({ id: "card-b", title: "Stats SQL queries" }),
        candidateCard({ id: "card-c", title: "Auth backend" }),
      ],
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "test-key",
      piTextCall: async (input) => {
        seenPrompt = input.prompt;
        return JSON.stringify({
          groups: [{ survivorCardId: "card-a", duplicateCardIds: ["card-b", "card-unknown"], reason: "Same five stats routes" }],
        });
      },
    });

    expect(seenPrompt).toContain("card-a");
    expect(seenPrompt).toContain("card-c");
    expect(groups).toEqual([{ survivorCardId: "card-a", duplicateCardIds: ["card-b"], reason: "Same five stats routes" }]);
  });
});
