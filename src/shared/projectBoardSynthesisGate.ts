import type { ProjectBoardQuestion, ProjectBoardSummary, ProjectBoardSynthesisRun } from "./projectBoardTypes";

type BoardForKickoffGate = Pick<ProjectBoardSummary, "status" | "questions">;
type RunForPlanningGate = Pick<ProjectBoardSynthesisRun, "status" | "stage">;

export interface ProjectBoardKickoffAnswerState {
  answeredCount: number;
  questionCount: number;
  complete: boolean;
}

export interface ProjectBoardSynthesisGate {
  allowed: boolean;
  reason?: string;
}

export function projectBoardKickoffAnswerState(questions: Pick<ProjectBoardQuestion, "answer">[]): ProjectBoardKickoffAnswerState {
  const questionCount = questions.length;
  const answeredCount = questions.filter((question) => question.answer?.trim()).length;
  return {
    answeredCount,
    questionCount,
    complete: questionCount > 0 && answeredCount === questionCount,
  };
}

export function projectBoardRunIsKickoffDefaults(run?: RunForPlanningGate): boolean {
  return run?.stage === "kickoff_defaults";
}

export function projectBoardRunBlocksPlanning(run?: RunForPlanningGate): boolean {
  if (!run || projectBoardRunIsKickoffDefaults(run)) return false;
  return run.status === "running" || run.status === "pause_requested";
}

export function projectBoardRunCanProvidePlanningSnapshot(run?: RunForPlanningGate): boolean {
  if (!run || projectBoardRunIsKickoffDefaults(run)) return false;
  return run.status === "paused" || run.status === "succeeded";
}

export function projectBoardCharterReviewGate(board: BoardForKickoffGate): ProjectBoardSynthesisGate {
  if (board.status === "active") return { allowed: true };
  if (board.status !== "draft") {
    return {
      allowed: false,
      reason: "Only draft or active project board charters can be reviewed with Pi.",
    };
  }

  const kickoff = projectBoardKickoffAnswerState(board.questions);
  if (kickoff.complete) return { allowed: true };
  return {
    allowed: false,
    reason:
      kickoff.questionCount === 0
        ? "Kickoff questions are still being prepared. Answer kickoff questions before asking Pi to review the charter."
        : `Answer all kickoff questions before asking Pi to review the charter (${kickoff.answeredCount}/${kickoff.questionCount} answered).`,
  };
}

export function projectBoardCardGenerationGate(board: BoardForKickoffGate, actionLabel = "Board synthesis"): ProjectBoardSynthesisGate {
  if (board.status === "active") return { allowed: true };
  return {
    allowed: false,
    reason: `${actionLabel} requires an active project board charter. Answer kickoff questions and activate the board first.`,
  };
}

export function assertProjectBoardCharterReviewAllowed(board: BoardForKickoffGate): void {
  const gate = projectBoardCharterReviewGate(board);
  if (!gate.allowed) throw new Error(gate.reason ?? "Project board charter review is not available yet.");
}

export function assertProjectBoardCardGenerationAllowed(board: BoardForKickoffGate, actionLabel?: string): void {
  const gate = projectBoardCardGenerationGate(board, actionLabel);
  if (!gate.allowed) throw new Error(gate.reason ?? "Project board synthesis is not available yet.");
}
