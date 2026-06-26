export function projectBoardTaskPauseLedgerState(state?: string): "review" | "blocked" | undefined {
  if (state === "needs_review") return "review";
  if (state === "needs_info" || state === "budget_exhausted" || state === "terminal_blocker") return "blocked";
  return undefined;
}

export function projectBoardTaskPauseDetail(state?: string): string | undefined {
  if (state === "needs_info") return "Collect the missing information or credentials before retrying this task.";
  if (state === "needs_review") return "Review the latest proof packet and decide whether the card can close or needs another pass.";
  if (state === "budget_exhausted") return "Increase budget, reduce scope, or split the card before retrying.";
  if (state === "terminal_blocker") return "Inspect the terminal blocker and update the card before another attempt.";
  return undefined;
}
