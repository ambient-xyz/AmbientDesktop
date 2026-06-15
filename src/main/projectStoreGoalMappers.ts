import type {
  ThreadGoal,
  ThreadGoalStatus,
} from "../shared/types";

export const THREAD_GOAL_STATUSES: readonly ThreadGoalStatus[] = [
  "active",
  "paused",
  "blocked",
  "usage_limited",
  "budget_limited",
  "complete",
];

export interface ThreadGoalRow {
  thread_id: string;
  goal_id: string;
  objective: string;
  status: ThreadGoalStatus;
  token_budget: number | null;
  tokens_used: number;
  time_used_seconds: number;
  continuation_turns: number;
  no_progress_turns: number;
  status_reason: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  last_continued_at: string | null;
}

export function normalizeThreadGoalStatus(value: string): ThreadGoalStatus {
  return THREAD_GOAL_STATUSES.includes(value as ThreadGoalStatus) ? (value as ThreadGoalStatus) : "paused";
}

export function mapThreadGoalRow(row: ThreadGoalRow): ThreadGoal {
  return {
    threadId: row.thread_id,
    goalId: row.goal_id,
    objective: row.objective,
    status: normalizeThreadGoalStatus(row.status),
    tokenBudget: row.token_budget ?? undefined,
    tokensUsed: row.tokens_used,
    timeUsedSeconds: row.time_used_seconds,
    continuationTurns: row.continuation_turns,
    noProgressTurns: row.no_progress_turns,
    statusReason: row.status_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    lastContinuedAt: row.last_continued_at ?? undefined,
  };
}
