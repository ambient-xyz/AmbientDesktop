import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  ThreadGoal,
  ThreadGoalAccountInput,
  ThreadGoalCreateInput,
  ThreadGoalSetInput,
  ThreadGoalStatus,
} from "../../shared/types";
import { mapThreadGoalRow, type ThreadGoalRow } from "./threadGoalMappers";

const terminalThreadGoalStatuses = new Set<ThreadGoalStatus>(["blocked", "usage_limited", "budget_limited", "complete"]);

export class ProjectStoreThreadGoalRepository {
  constructor(private readonly db: Database.Database) {}

  getThreadGoal(threadId: string): ThreadGoal | undefined {
    this.requireThread(threadId);
    return this.getThreadGoalIfThreadExists(threadId);
  }

  setThreadGoal(input: ThreadGoalSetInput): ThreadGoal {
    this.requireThread(input.threadId);
    const current = this.getThreadGoalIfThreadExists(input.threadId);
    if (input.expectedGoalId && current?.goalId !== input.expectedGoalId) {
      throw new Error("Thread goal changed before this update could be applied.");
    }
    const objective = input.objective?.trim() ?? current?.objective;
    if (!objective) throw new Error("Goal objective is required.");
    const status = input.status ?? current?.status ?? "active";
    const resumedFromInactive = Boolean(current && current.status !== "active" && status === "active");
    const now = new Date().toISOString();
    const tokenBudget = Object.hasOwn(input, "tokenBudget")
      ? positiveIntegerOrNull(input.tokenBudget ?? null)
      : (current?.tokenBudget ?? null);
    const statusReason = Object.hasOwn(input, "statusReason")
      ? normalizedOptionalText(input.statusReason ?? null)
      : resumedFromInactive
        ? null
        : (current?.statusReason ?? null);
    const completedAt = status === "complete"
      ? (current?.completedAt ?? now)
      : terminalThreadGoalStatuses.has(status)
        ? current?.completedAt ?? null
        : null;

    if (current) {
      this.db
        .prepare(
          `UPDATE thread_goals
           SET objective = ?, status = ?, token_budget = ?, no_progress_turns = ?,
               status_reason = ?, updated_at = ?, completed_at = ?
           WHERE thread_id = ?`,
        )
        .run(
          objective,
          status,
          tokenBudget,
          resumedFromInactive ? 0 : current.noProgressTurns,
          statusReason,
          now,
          completedAt,
          input.threadId,
        );
    } else {
      this.db
        .prepare(
          `INSERT INTO thread_goals
          (thread_id, goal_id, objective, status, token_budget, tokens_used, time_used_seconds,
           continuation_turns, no_progress_turns, status_reason, created_at, updated_at, completed_at, last_continued_at)
           VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?, NULL)`,
        )
        .run(input.threadId, randomUUID(), objective, status, tokenBudget, statusReason, now, now, completedAt);
    }
    return this.getThreadGoalIfThreadExists(input.threadId)!;
  }

  createThreadGoalIfAbsent(input: ThreadGoalCreateInput): ThreadGoal {
    if (this.getThreadGoal(input.threadId)) throw new Error("Thread already has a goal.");
    return this.setThreadGoal({
      threadId: input.threadId,
      objective: input.objective,
      status: "active",
      tokenBudget: input.tokenBudget ?? null,
    });
  }

  clearThreadGoal(threadId: string, expectedGoalId?: string): ThreadGoal | undefined {
    const current = this.getThreadGoal(threadId);
    if (!current) return undefined;
    if (expectedGoalId && current.goalId !== expectedGoalId) {
      throw new Error("Thread goal changed before it could be cleared.");
    }
    this.db.prepare("DELETE FROM thread_goals WHERE thread_id = ?").run(threadId);
    return current;
  }

  accountThreadGoalUsage(input: ThreadGoalAccountInput): ThreadGoal | undefined {
    const current = this.getThreadGoal(input.threadId);
    if (!current || current.goalId !== input.goalId) return current;
    const tokensUsedDelta = Math.max(0, Math.floor(input.tokensUsedDelta ?? 0));
    const timeUsedSecondsDelta = Math.max(0, Math.floor(input.timeUsedSecondsDelta ?? 0));
    const continuationTurnDelta = Math.max(0, Math.floor(input.continuationTurnDelta ?? 0));
    const noProgressTurnDelta = Math.max(0, Math.floor(input.noProgressTurnDelta ?? 0));
    const tokensUsed = current.tokensUsed + tokensUsedDelta;
    const nextStatus = current.tokenBudget !== undefined && tokensUsed >= current.tokenBudget && current.status === "active"
      ? "budget_limited"
      : current.status;
    const statusReason = nextStatus === "budget_limited"
      ? "Goal token budget reached."
      : Object.hasOwn(input, "statusReason")
        ? normalizedOptionalText(input.statusReason ?? null)
        : (current.statusReason ?? null);
    const now = new Date().toISOString();
    const lastContinuedAt = continuationTurnDelta > 0 ? now : (current.lastContinuedAt ?? null);
    this.db
      .prepare(
        `UPDATE thread_goals
         SET tokens_used = ?, time_used_seconds = ?, continuation_turns = ?, no_progress_turns = ?,
             status = ?, status_reason = ?, updated_at = ?, last_continued_at = ?
         WHERE thread_id = ? AND goal_id = ?`,
      )
      .run(
        tokensUsed,
        current.timeUsedSeconds + timeUsedSecondsDelta,
        current.continuationTurns + continuationTurnDelta,
        current.noProgressTurns + noProgressTurnDelta,
        nextStatus,
        statusReason,
        now,
        lastContinuedAt,
        input.threadId,
        input.goalId,
      );
    return this.getThreadGoalIfThreadExists(input.threadId);
  }

  markThreadGoalStatus(
    threadId: string,
    status: ThreadGoalStatus,
    options: { expectedGoalId?: string; statusReason?: string | null } = {},
  ): ThreadGoal {
    return this.setThreadGoal({
      threadId,
      status,
      expectedGoalId: options.expectedGoalId,
      statusReason: options.statusReason ?? null,
    });
  }

  private getThreadGoalIfThreadExists(threadId: string): ThreadGoal | undefined {
    const row = this.db.prepare("SELECT * FROM thread_goals WHERE thread_id = ?").get(threadId) as ThreadGoalRow | undefined;
    return row ? mapThreadGoalRow(row) : undefined;
  }

  private requireThread(threadId: string): void {
    const row = this.db.prepare("SELECT id FROM threads WHERE id = ?").get(threadId) as { id: string } | undefined;
    if (!row) throw new Error(`Thread not found: ${threadId}`);
  }
}

function positiveIntegerOrNull(value: number | null): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : null;
}

function normalizedOptionalText(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
