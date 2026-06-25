import type {
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardExecutionSessionPolicy,
  ProjectBoardCardStatus,
  ProjectBoardUiMockRole,
} from "../../shared/projectBoardTypes";
import type { ProjectBoardSynthesisCardInput } from "./projectStoreProjectBoardFacade";

export function normalizeTaskLabels(labels: string[]): string[] {
  return [...new Set(labels.map((label) => label.trim().toLowerCase()).filter(Boolean))];
}

export function normalizeTaskReferences(refs: string[]): string[] {
  return [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))].slice(0, 50);
}

export function normalizeProjectBoardUiMockRole(value: unknown): ProjectBoardUiMockRole | undefined {
  return value === "mock_gate" || value === "gated_implementation" ? value : undefined;
}

export function projectBoardCardIsUxMockGate(
  card: Pick<ProjectBoardSynthesisCardInput, "sourceId" | "title" | "labels" | "description"> & { uiMockRole?: ProjectBoardUiMockRole },
): boolean {
  if (card.uiMockRole === "mock_gate") return true;
  const haystack = `${card.sourceId}\n${card.title}\n${card.description}`.toLowerCase();
  return (
    card.sourceId === "synthesis:ux-mock-approval" ||
    card.labels.some((label) => label.toLowerCase() === "ux-mock-approval") ||
    /\b(ux|ui|user interface)\b.{0,40}\b(mock|prototype|wireframe|approval|review)\b/.test(haystack) ||
    /\b(mock|prototype|wireframe)\b.{0,40}\b(ux|ui|user interface|approval|review)\b/.test(haystack)
  );
}

export function projectBoardUxMockGateSatisfied(card: {
  status: ProjectBoardCardStatus;
  candidateStatus: ProjectBoardCardCandidateStatus;
}): boolean {
  return card.status === "done" || card.candidateStatus === "evidence";
}

export function projectBoardUiMockRoleForSynthesisCard(card: ProjectBoardSynthesisCardInput): ProjectBoardUiMockRole | undefined {
  return normalizeProjectBoardUiMockRole(card.uiMockRole) ?? (projectBoardCardIsUxMockGate(card) ? "mock_gate" : undefined);
}

export function projectBoardRequiresUiMockApprovalForSynthesisCard(card: ProjectBoardSynthesisCardInput): boolean {
  if (typeof card.requiresUiMockApproval === "boolean") return card.requiresUiMockApproval;
  return Boolean(
    projectBoardUiMockRoleForSynthesisCard(card) === "gated_implementation" || card.blockedBy.includes("synthesis:ux-mock-approval"),
  );
}

export function projectBoardCardMatchesRef(card: ProjectBoardCard, ref: string): boolean {
  const normalized = ref.trim();
  if (!normalized) return false;
  return [card.id, card.sourceId, card.orchestrationTaskId ?? "", `card:${card.id}`, `project-board-card:${card.id}`]
    .filter(Boolean)
    .includes(normalized);
}

export function projectBoardCardBlockedByOpenUxMockGate(card: ProjectBoardCard, boardCards: ProjectBoardCard[]): boolean {
  return Boolean(projectBoardOpenUxMockGateBlocker(card, boardCards) || projectBoardCardMissingRequiredUxMockGate(card, boardCards));
}

export function projectBoardOpenUxMockGateBlocker(card: ProjectBoardCard, boardCards: ProjectBoardCard[]): ProjectBoardCard | undefined {
  if (projectBoardCardIsUxMockGate(card)) return undefined;
  const blockers = card.blockedBy
    .map((ref) => boardCards.find((candidate) => projectBoardCardMatchesRef(candidate, ref)))
    .filter((candidate): candidate is ProjectBoardCard => Boolean(candidate));
  return blockers.find((candidate) => projectBoardCardIsUxMockGate(candidate) && !projectBoardUxMockGateSatisfied(candidate));
}

export function projectBoardCardMissingRequiredUxMockGate(card: ProjectBoardCard, boardCards: ProjectBoardCard[]): boolean {
  if (projectBoardCardIsUxMockGate(card)) return false;
  if (card.uiMockRole !== "gated_implementation" && !card.requiresUiMockApproval) return false;
  const blockers = card.blockedBy
    .map((ref) => boardCards.find((candidate) => projectBoardCardMatchesRef(candidate, ref)))
    .filter((candidate): candidate is ProjectBoardCard => Boolean(candidate));
  return !blockers.some((candidate) => projectBoardCardIsUxMockGate(candidate) && projectBoardUxMockGateSatisfied(candidate));
}

export function normalizeProjectBoardCardExecutionSessionPolicy(policy: string | null | undefined): ProjectBoardCardExecutionSessionPolicy {
  return policy === "fresh_context" ? "fresh_context" : "reuse_card_session";
}
