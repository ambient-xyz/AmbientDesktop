import { describe, expect, it } from "vitest";
import {
  assertProjectBoardCardClaimAvailable,
  createProjectBoardClaimEvent,
  createProjectBoardClaimExpiredEvent,
  createProjectBoardClaimReleaseEvent,
  createProjectBoardHeartbeatEvent,
  projectBoardClaimProjectionFromProjectBoardEvents,
  projectBoardClaimProjectionFromEvents,
} from "./projectBoardClaims";

describe("project board claim protocol", () => {
  it("lets the earliest unexpired card claim win and records later conflicts", () => {
    const first = createProjectBoardClaimEvent({
      boardId: "board-1",
      cardId: "card-1",
      runId: "run-a",
      agentId: "agent-a",
      now: "2026-05-04T12:00:00.000Z",
      leaseMs: 10 * 60 * 1000,
    });
    const second = createProjectBoardClaimEvent({
      boardId: "board-1",
      cardId: "card-1",
      runId: "run-b",
      agentId: "agent-b",
      now: "2026-05-04T12:01:00.000Z",
      leaseMs: 10 * 60 * 1000,
    });

    const projection = projectBoardClaimProjectionFromEvents([second, first], { now: "2026-05-04T12:02:00.000Z" });

    expect(projection.activeClaims).toEqual([expect.objectContaining({ cardId: "card-1", runId: "run-a", agentId: "agent-a" })]);
    expect(projection.conflicts).toEqual([expect.objectContaining({ runId: "run-b", blockedByRunId: "run-a" })]);
    expect(() => assertProjectBoardCardClaimAvailable([first, second], "card-1", { now: "2026-05-04T12:02:00.000Z" })).toThrow(
      /already claimed by agent-a/,
    );
  });

  it("expires losing claim conflicts without releasing the winning active claim", () => {
    const first = createProjectBoardClaimEvent({
      boardId: "board-1",
      cardId: "card-1",
      runId: "run-a",
      agentId: "agent-a",
      now: "2026-05-04T12:00:00.000Z",
      leaseMs: 10 * 60 * 1000,
    });
    const second = createProjectBoardClaimEvent({
      boardId: "board-1",
      cardId: "card-1",
      runId: "run-b",
      agentId: "agent-b",
      now: "2026-05-04T12:01:00.000Z",
      leaseMs: 10 * 60 * 1000,
    });
    const expiredConflict = createProjectBoardClaimExpiredEvent({
      boardId: "board-1",
      cardId: "card-1",
      runId: "run-b",
      agentId: "agent-a",
      now: "2026-05-04T12:03:00.000Z",
      expiredClaimEventId: second.eventId,
    });

    const projection = projectBoardClaimProjectionFromEvents([first, second, expiredConflict], { now: "2026-05-04T12:04:00.000Z" });

    expect(projection.activeClaims).toEqual([expect.objectContaining({ cardId: "card-1", runId: "run-a", agentId: "agent-a" })]);
    expect(projection.conflicts).toEqual([]);
    expect(projection.expiredClaims).toEqual([
      expect.objectContaining({
        cardId: "card-1",
        runId: "run-b",
        agentId: "agent-b",
        eventId: expiredConflict.eventId,
        expirationRecorded: true,
        expiredAt: "2026-05-04T12:03:00.000Z",
      }),
    ]);
  });

  it("extends a lease with heartbeat and expires stale claims", () => {
    const claim = createProjectBoardClaimEvent({
      boardId: "board-1",
      cardId: "card-1",
      runId: "run-a",
      agentId: "agent-a",
      now: "2026-05-04T12:00:00.000Z",
      leaseMs: 60_000,
    });
    const heartbeat = createProjectBoardHeartbeatEvent({
      boardId: "board-1",
      cardId: "card-1",
      runId: "run-a",
      agentId: "agent-a",
      now: "2026-05-04T12:00:30.000Z",
      leaseMs: 5 * 60_000,
    });

    const active = projectBoardClaimProjectionFromEvents([claim, heartbeat], { now: "2026-05-04T12:04:00.000Z" });
    const expired = projectBoardClaimProjectionFromEvents([claim, heartbeat], { now: "2026-05-04T12:07:00.000Z" });

    expect(active.activeClaims[0]).toMatchObject({
      runId: "run-a",
      lastHeartbeatAt: "2026-05-04T12:00:30.000Z",
      leaseUntil: "2026-05-04T12:05:30.000Z",
    });
    expect(active.expiredClaims).toEqual([]);
    expect(expired.activeClaims).toEqual([]);
    expect(expired.expiredClaims).toEqual([expect.objectContaining({ runId: "run-a", expirationRecorded: false })]);
  });

  it("audits release and explicit expiry events", () => {
    const claim = createProjectBoardClaimEvent({
      boardId: "board-1",
      cardId: "card-1",
      runId: "run-a",
      agentId: "agent-a",
      now: "2026-05-04T12:00:00.000Z",
    });
    const release = createProjectBoardClaimReleaseEvent({
      boardId: "board-1",
      cardId: "card-1",
      runId: "run-a",
      agentId: "agent-a",
      now: "2026-05-04T12:05:00.000Z",
      reason: "User force released the card.",
    });
    const secondClaim = createProjectBoardClaimEvent({
      boardId: "board-1",
      cardId: "card-2",
      runId: "run-b",
      agentId: "agent-b",
      now: "2026-05-04T12:00:00.000Z",
    });
    const expired = createProjectBoardClaimExpiredEvent({
      boardId: "board-1",
      cardId: "card-2",
      runId: "run-b",
      agentId: "agent-c",
      now: "2026-05-04T12:20:00.000Z",
      expiredClaimEventId: secondClaim.eventId,
    });

    const projection = projectBoardClaimProjectionFromEvents([claim, release, secondClaim, expired], { now: "2026-05-04T12:21:00.000Z" });

    expect(projection.activeClaims).toEqual([]);
    expect(projection.expiredClaims).toEqual([
      expect.objectContaining({
        cardId: "card-2",
        runId: "run-b",
        eventId: expired.eventId,
        expirationRecorded: true,
        expiredAt: "2026-05-04T12:20:00.000Z",
      }),
    ]);
  });

  it("projects imported project board claim history events", () => {
    const projection = projectBoardClaimProjectionFromProjectBoardEvents(
      [
        {
          id: "evt-claim",
          boardId: "board-1",
          kind: "card_claimed",
          title: "Card claimed",
          summary: "Claimed remotely.",
          entityKind: "project_board_card",
          entityId: "card-1",
          metadata: {
            cardId: "card-1",
            runId: "run-a",
            agentId: "desktop-a",
            leaseUntil: "2026-05-04T12:10:00.000Z",
            artifactEventType: "card.claimed",
          },
          createdAt: "2026-05-04T12:00:00.000Z",
        },
      ],
      { now: "2026-05-04T12:01:00.000Z" },
    );

    expect(projection.activeClaims).toEqual([expect.objectContaining({ cardId: "card-1", runId: "run-a", agentId: "desktop-a" })]);
  });
});
