import type { PlannerPlanArtifact, ProjectSummary } from "../../shared/types";

const CURRENT_PLANNER_SOURCE_KINDS = new Set(["plan_artifact", "implementation_plan"]);

export function projectBoardMatchesCurrentPlannerArtifact(
  board: ProjectSummary["board"],
  threadId: string,
  currentPlannerArtifact: PlannerPlanArtifact | undefined,
): boolean {
  if (!board || !threadId || !currentPlannerArtifact) return true;

  const includedPlannerSources = board.sources.filter(
    (source) =>
      source.includeInSynthesis !== false &&
      CURRENT_PLANNER_SOURCE_KINDS.has(source.kind) &&
      source.threadId === threadId,
  );
  if (includedPlannerSources.length === 0) {
    return board.sources.length === 0 && board.cards.length === 0;
  }
  const sourceMatches =
    includedPlannerSources.some((source) => source.artifactId === currentPlannerArtifact.id) &&
    includedPlannerSources.every((source) => source.artifactId === currentPlannerArtifact.id);
  if (!sourceMatches) return false;
  return !projectBoardHasOnlyStalePlanningForCurrentPlannerArtifact(board, currentPlannerArtifact.createdAt);
}

function projectBoardHasOnlyStalePlanningForCurrentPlannerArtifact(
  board: ProjectSummary["board"],
  currentPlannerCreatedAt: string,
): boolean {
  if (!board) return false;
  if (board.cards.some((card) => card.status !== "draft" || card.orchestrationTaskId)) return false;
  const planningTimestamps = [
    ...board.cards.map((card) => card.createdAt),
    ...board.questions.map((question) => question.createdAt),
    ...board.proposals.map((proposal) => proposal.createdAt),
    ...(board.synthesisRuns ?? []).map((run) => run.startedAt),
  ].filter(Boolean);
  if (planningTimestamps.length === 0) return false;
  return planningTimestamps.every((timestamp) => timestamp < currentPlannerCreatedAt);
}
