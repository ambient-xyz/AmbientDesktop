import type { ProjectBoardCard, ProjectBoardEvent } from "../../shared/projectBoardTypes";
import { projectBoardClaimSummaryFromEvents } from "./projectBoardMappers";

export function assertProjectBoardCardClaimAllowsLocalTicketization(card: ProjectBoardCard, events: ProjectBoardEvent[]): void {
  const claims = projectBoardClaimSummaryFromEvents(events);
  const conflicts = claims.conflicts.filter((claim) => claim.cardId === card.id);
  if (conflicts.length > 0) {
    throw new Error(
      `Project board card ${card.title} has ${conflicts.length} claim conflict${conflicts.length === 1 ? "" : "s"}. Pull the board and resolve ownership before creating a Local Task.`,
    );
  }
  const activeClaim = claims.active.find((claim) => claim.cardId === card.id);
  if (!activeClaim || activeClaim.ownedByLocal) return;
  throw new Error(
    `Project board card ${card.title} is claimed by ${activeClaim.displayName || activeClaim.agentId} until ${
      activeClaim.leaseUntil ?? "the lease expires"
    }. Pull the board, wait for expiry, or release the claim before creating a Local Task.`,
  );
}
