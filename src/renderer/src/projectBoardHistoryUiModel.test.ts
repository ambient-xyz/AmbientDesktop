import { describe, expect, it } from "vitest";

import type { ProjectBoardEvent } from "../../shared/projectBoardTypes";
import {
  projectBoardEventGroups,
  projectBoardEventHasSupersededCardReview,
  projectBoardEventKindLabel,
  projectBoardEventSummary,
  projectBoardSupersededCardReview,
} from "./projectBoardHistoryUiModel";

describe("projectBoardHistoryUiModel", () => {
  it("groups and summarizes board history events", () => {
    const events: ProjectBoardEvent[] = [
      boardEvent({ id: "event-1", kind: "plan_promoted", createdAt: "2026-01-01T10:00:00.000Z" }),
      boardEvent({ id: "event-2", kind: "card_run_completed", createdAt: "2026-01-01T11:00:00.000Z" }),
      boardEvent({ id: "event-3", kind: "card_run_failed", createdAt: "2026-01-02T10:00:00.000Z" }),
    ];

    const groups = projectBoardEventGroups(events);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.events.map((event) => event.id)).toEqual(["event-1", "event-2"]);
    expect(projectBoardEventKindLabel("plan_promoted")).toBe("Plan");
    expect(projectBoardEventKindLabel("card_run_completed")).toBe("Run");
    expect(projectBoardEventSummary(events)).toBe("1 plan event, 2 run events");
    expect(projectBoardEventSummary()).toBe("No board history has been recorded yet.");
  });

  it("models Start Fresh superseded and demoted card reviews", () => {
    const event = boardEvent({
      id: "event-start-fresh",
      kind: "board_synthesized",
      entityId: "run-abandoned",
      metadata: {
        decision: "start_fresh_supersede_drafts",
        abandonedRunId: "run-abandoned",
        supersededDraftCards: [
          {
            cardId: "card-superseded",
            title: "Old generated shell",
            sourceId: "synthesis:shell",
            status: "draft",
            candidateStatus: "needs_review",
            clarificationQuestionCount: 2,
          },
        ],
        preservedCards: [
          {
            cardId: "card-preserved",
            title: "User edited gameplay loop",
            sourceId: "synthesis:gameplay",
            status: "ready",
            candidateStatus: "ready_to_create",
            userTouchedFields: ["description"],
            orchestrationTaskId: "task-1",
          },
        ],
        demotedPreservedCardIds: ["card-preserved"],
      },
    });

    expect(projectBoardEventHasSupersededCardReview(event)).toBe(true);
    expect(projectBoardSupersededCardReview([event])).toMatchObject({
      eventCount: 1,
      supersededCount: 1,
      demotedCount: 1,
      preservedCount: 0,
      summary: "1 superseded draft card, 1 preserved card moved back to review",
      items: [
        {
          category: "superseded",
          cardId: "card-superseded",
          title: "Old generated shell",
          sourceId: "synthesis:shell",
          runId: "run-abandoned",
          clarificationQuestionCount: 2,
        },
        {
          category: "demoted",
          cardId: "card-preserved",
          title: "User edited gameplay loop",
          userTouchedFields: ["description"],
          orchestrationTaskId: "task-1",
        },
      ],
    });
  });

  it("falls back to recorded card ids when Start Fresh snapshots are missing", () => {
    const event = boardEvent({
      id: "event-start-fresh-ids",
      kind: "board_synthesized",
      metadata: {
        decision: "start_fresh_supersede_drafts",
        supersededDraftCardIds: ["card-1"],
        preservedCardIds: ["card-2"],
      },
    });

    expect(projectBoardSupersededCardReview([event])).toMatchObject({
      eventCount: 1,
      supersededCount: 1,
      preservedCount: 1,
      items: [
        { category: "superseded", cardId: "card-1", title: "card-1" },
        { category: "preserved", cardId: "card-2", title: "card-2" },
      ],
    });
    expect(projectBoardSupersededCardReview([{ ...event, metadata: {} }]).summary).toBe("No Start Fresh superseded cards have been recorded yet.");
  });
});

function boardEvent(overrides: Partial<ProjectBoardEvent> = {}): ProjectBoardEvent {
  return {
    id: "event-1",
    boardId: "board-1",
    kind: "board_created",
    title: "Board event",
    summary: "Board event summary.",
    metadata: {},
    createdAt: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}
