import { describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardEvent } from "../../shared/projectBoardTypes";
import { assertProjectBoardCardClaimAllowsLocalTicketization } from "./projectBoardCardTicketizationClaimGuard";
import { defaultProjectBoardClaimAgentId } from "./projectStoreProjectBoardFacade";

function projectBoardCard(input: { id: string; title?: string }): ProjectBoardCard {
  return {
    id: input.id,
    title: input.title ?? "Implement claim guard",
  } as ProjectBoardCard;
}

function claimEvent(input: {
  id: string;
  kind?: ProjectBoardEvent["kind"];
  cardId: string;
  runId: string;
  agentId: string;
  createdAt: string;
  leaseUntil?: string;
  displayName?: string;
}): ProjectBoardEvent {
  return {
    id: input.id,
    boardId: "board-claims",
    kind: input.kind ?? "card_claimed",
    title: "Card claimed",
    summary: "Claim event summary",
    entityKind: "project_board_card",
    entityId: input.cardId,
    metadata: {
      cardId: input.cardId,
      runId: input.runId,
      agentId: input.agentId,
      ...(input.leaseUntil ? { leaseUntil: input.leaseUntil } : {}),
      ...(input.displayName ? { displayName: input.displayName } : {}),
    },
    createdAt: input.createdAt,
  };
}

describe("assertProjectBoardCardClaimAllowsLocalTicketization", () => {
  it("allows unclaimed and locally claimed cards", () => {
    const card = projectBoardCard({ id: "card-local" });
    const localClaim = claimEvent({
      id: "event-local",
      cardId: card.id,
      runId: "run-local",
      agentId: defaultProjectBoardClaimAgentId(),
      createdAt: "2026-01-01T00:00:00.000Z",
      leaseUntil: "2099-01-01T00:15:00.000Z",
    });

    expect(() => assertProjectBoardCardClaimAllowsLocalTicketization(card, [])).not.toThrow();
    expect(() => assertProjectBoardCardClaimAllowsLocalTicketization(card, [localClaim])).not.toThrow();
  });

  it("blocks active remote claims", () => {
    const card = projectBoardCard({ id: "card-remote", title: "Implement remote-owned work" });
    const remoteClaim = claimEvent({
      id: "event-remote",
      cardId: card.id,
      runId: "run-remote",
      agentId: "remote-agent",
      displayName: "Remote Desktop",
      createdAt: "2026-01-01T00:00:00.000Z",
      leaseUntil: "2099-01-01T00:15:00.000Z",
    });

    expect(() => assertProjectBoardCardClaimAllowsLocalTicketization(card, [remoteClaim])).toThrow(
      "Project board card Implement remote-owned work is claimed by Remote Desktop until 2099-01-01T00:15:00.000Z.",
    );
  });

  it("blocks claim conflicts before checking active ownership", () => {
    const card = projectBoardCard({ id: "card-conflict", title: "Implement conflicted work" });
    const localClaim = claimEvent({
      id: "event-local",
      cardId: card.id,
      runId: "run-local",
      agentId: defaultProjectBoardClaimAgentId(),
      createdAt: "2026-01-01T00:00:00.000Z",
      leaseUntil: "2099-01-01T00:15:00.000Z",
    });
    const conflictingClaim = claimEvent({
      id: "event-conflict",
      cardId: card.id,
      runId: "run-conflict",
      agentId: "remote-agent",
      createdAt: "2026-01-01T00:01:00.000Z",
      leaseUntil: "2099-01-01T00:16:00.000Z",
    });

    expect(() => assertProjectBoardCardClaimAllowsLocalTicketization(card, [localClaim, conflictingClaim])).toThrow(
      "Project board card Implement conflicted work has 1 claim conflict.",
    );
  });
});
