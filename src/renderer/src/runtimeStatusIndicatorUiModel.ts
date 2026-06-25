import { isRunStatusRunning } from "../../shared/runStatus";
import type { RunStatus, RuntimeActivity, RuntimeContinuationSource, ThreadGoal } from "../../shared/threadTypes";

type RuntimeGoalActivity = Extract<RuntimeActivity, { kind: "goal" }>;

export const RUNTIME_STATUS_FINISHED_VISIBLE_MS = 5_000;
export const GOAL_CONTINUATION_START_GRACE_MS = 8_000;

export type RuntimeStatusIndicatorTone = "working" | "success" | "warning";
export type RuntimeStatusIndicatorKind = "compaction" | RuntimeContinuationSource;

export type RuntimeStatusIndicator = {
  id: string;
  threadId: string;
  kind: RuntimeStatusIndicatorKind;
  phase: "scheduled" | "running" | "finished";
  tone: RuntimeStatusIndicatorTone;
  title: string;
  message: string;
  startedAt: number;
  updatedAt: number;
  expiresAt?: number;
  startGraceUntil?: number;
  goalId?: string;
  continuationTurns?: number;
};

export type ThreadRuntimeStatusIndicators = {
  compaction?: RuntimeStatusIndicator;
  continuation?: RuntimeStatusIndicator;
};

export type RuntimeStatusIndicatorsByThread = Record<string, ThreadRuntimeStatusIndicators | undefined>;

export function runtimeStatusIndicatorsAfterRunStatus(
  current: RuntimeStatusIndicatorsByThread,
  input: { threadId: string; status: RunStatus; now: number },
): RuntimeStatusIndicatorsByThread {
  return updateThreadRuntimeStatusIndicators(current, input.threadId, (existing) => {
    const next: ThreadRuntimeStatusIndicators = { ...existing };
    if (input.status === "compacting") {
      next.compaction = compactionRunningIndicator(input.threadId, input.now, existing.compaction);
    } else if ((input.status === "idle" || input.status === "error") && existing.compaction?.phase === "running") {
      next.compaction = compactionFinishedIndicator({
        threadId: input.threadId,
        previous: existing.compaction,
        now: input.now,
        tone: input.status === "error" ? "warning" : "success",
        title: input.status === "error" ? "Context compaction stopped" : "Context compacted",
        message: input.status === "error"
          ? "Ambient stopped context compaction before the run finished."
          : "Ambient compacted the conversation and is continuing.",
      });
    }

    if (existing.continuation) {
      if (isRunStatusRunning(input.status)) {
        next.continuation = continuationRunningIndicator(existing.continuation, input.now);
      } else if (input.status === "idle" || input.status === "error") {
        const stillWaitingForInternalRun =
          existing.continuation.phase === "scheduled" &&
          input.now < (existing.continuation.startGraceUntil ?? 0);
        if (!stillWaitingForInternalRun && existing.continuation.phase !== "finished") {
          next.continuation = continuationFinishedIndicator(existing.continuation, input.now, input.status);
        }
      }
    }

    return next;
  });
}

export function runtimeStatusIndicatorsAfterRuntimeActivity(
  current: RuntimeStatusIndicatorsByThread,
  activity: RuntimeActivity,
  now: number,
): RuntimeStatusIndicatorsByThread {
  if (activity.kind === "compaction") {
    return updateThreadRuntimeStatusIndicators(current, activity.threadId, (existing) => ({
      ...existing,
      compaction: activity.status === "starting"
        ? compactionRunningIndicator(activity.threadId, now, existing.compaction, activity.reason)
        : compactionFinishedIndicator({
          threadId: activity.threadId,
          previous: existing.compaction,
          now,
          tone: activity.aborted || activity.willRetry ? "warning" : "success",
          title: activity.aborted
            ? "Context compaction stopped"
            : activity.willRetry
              ? "Context compaction retrying"
              : "Context compacted",
          message: activity.message || (
            activity.aborted
              ? "Ambient stopped context compaction before it finished."
              : activity.willRetry
                ? "Ambient will retry context compaction before continuing."
                : "Ambient compacted the conversation and is continuing."
          ),
        }),
    }));
  }

  if (activity.kind !== "goal") return current;
  if (activity.status === "continuing") {
    return updateThreadRuntimeStatusIndicators(current, activity.threadId, (existing) => ({
      ...existing,
      continuation: continuationScheduledIndicator(activity, now, existing.continuation),
    }));
  }

  return updateThreadRuntimeStatusIndicators(current, activity.threadId, (existing) => {
    if (!existing.continuation || !goalActivityMatchesContinuation(activity, existing.continuation)) return existing;
    return {
      ...existing,
      continuation: continuationFinishedIndicator(existing.continuation, now, "idle", activity.message),
    };
  });
}

export function runtimeStatusIndicatorsAfterGoalUpdated(
  current: RuntimeStatusIndicatorsByThread,
  goal: ThreadGoal,
  now: number,
): RuntimeStatusIndicatorsByThread {
  return updateThreadRuntimeStatusIndicators(current, goal.threadId, (existing) => {
    const continuation = existing.continuation;
    if (!continuation || continuation.kind !== "goal-continuation" || (continuation.goalId && continuation.goalId !== goal.goalId)) {
      return existing;
    }
    if (goal.status === "active") {
      return {
        ...existing,
        continuation: {
          ...continuation,
          continuationTurns: goal.continuationTurns,
          updatedAt: now,
        },
      };
    }
    return {
      ...existing,
      continuation: continuationFinishedGoalIndicator(continuation, now, goal),
    };
  });
}

export function visibleRuntimeStatusIndicatorsForThread(
  indicatorsByThread: RuntimeStatusIndicatorsByThread,
  threadId: string,
  goal: ThreadGoal | undefined,
  now = Date.now(),
): RuntimeStatusIndicator[] {
  const indicators = indicatorsByThread[threadId];
  if (!indicators) return [];
  return [indicators.compaction, indicators.continuation]
    .filter((indicator): indicator is RuntimeStatusIndicator => Boolean(indicator))
    .filter((indicator) => runtimeStatusIndicatorIsVisible(indicator, goal, now));
}

export function pruneExpiredRuntimeStatusIndicators(
  current: RuntimeStatusIndicatorsByThread,
  now: number,
): RuntimeStatusIndicatorsByThread {
  let changed = false;
  const next: RuntimeStatusIndicatorsByThread = {};
  for (const [threadId, indicators] of Object.entries(current)) {
    if (!indicators) continue;
    const pruned: ThreadRuntimeStatusIndicators = {};
    if (indicators.compaction && !runtimeStatusIndicatorIsExpired(indicators.compaction, now)) {
      pruned.compaction = indicators.compaction;
    } else if (indicators.compaction) {
      changed = true;
    }
    if (indicators.continuation && !runtimeStatusIndicatorIsExpired(indicators.continuation, now)) {
      pruned.continuation = indicators.continuation;
    } else if (indicators.continuation) {
      changed = true;
    }
    if (pruned.compaction || pruned.continuation) next[threadId] = pruned;
  }
  return changed ? next : current;
}

export function nextRuntimeStatusIndicatorExpiry(
  current: RuntimeStatusIndicatorsByThread,
  now: number,
): number | undefined {
  const expiries = Object.values(current)
    .flatMap((indicators) => [indicators?.compaction, indicators?.continuation])
    .flatMap((indicator) => indicator ? [indicator.expiresAt, indicator.startGraceUntil] : [])
    .filter((value): value is number => typeof value === "number" && value > now);
  return expiries.length > 0 ? Math.min(...expiries) : undefined;
}

export function runtimeStatusIndicatorMessage(
  indicator: RuntimeStatusIndicator,
  goal?: ThreadGoal,
): string {
  if (indicator.kind !== "goal-continuation") return indicator.message;
  const goalTurns = goal && goal.goalId === indicator.goalId ? goal.continuationTurns : undefined;
  const turns = goalTurns ?? indicator.continuationTurns;
  if (!turns || indicator.phase === "finished") return indicator.message;
  return `${indicator.message} Turn ${turns}.`;
}

function updateThreadRuntimeStatusIndicators(
  current: RuntimeStatusIndicatorsByThread,
  threadId: string,
  update: (existing: ThreadRuntimeStatusIndicators) => ThreadRuntimeStatusIndicators,
): RuntimeStatusIndicatorsByThread {
  const existing = current[threadId] ?? {};
  const nextThread = update(existing);
  const next: RuntimeStatusIndicatorsByThread = { ...current };
  if (nextThread.compaction || nextThread.continuation) {
    next[threadId] = nextThread;
  } else {
    delete next[threadId];
  }
  return next;
}

function compactionRunningIndicator(
  threadId: string,
  now: number,
  previous?: RuntimeStatusIndicator,
  reason?: Extract<RuntimeActivity, { kind: "compaction" }>["reason"],
): RuntimeStatusIndicator {
  return {
    id: `compaction:${threadId}`,
    threadId,
    kind: "compaction",
    phase: "running",
    tone: "working",
    title: "Compacting context",
    message: compactionRunningMessage(reason),
    startedAt: previous?.startedAt ?? now,
    updatedAt: now,
  };
}

function compactionFinishedIndicator(input: {
  threadId?: string;
  previous?: RuntimeStatusIndicator;
  now: number;
  tone: RuntimeStatusIndicatorTone;
  title: string;
  message: string;
}): RuntimeStatusIndicator {
  return {
    id: input.previous?.id ?? "compaction",
    threadId: input.previous?.threadId ?? input.threadId ?? "",
    kind: "compaction",
    phase: "finished",
    tone: input.tone,
    title: input.title,
    message: input.message,
    startedAt: input.previous?.startedAt ?? input.now,
    updatedAt: input.now,
    expiresAt: input.now + RUNTIME_STATUS_FINISHED_VISIBLE_MS,
  };
}

function continuationScheduledIndicator(
  activity: RuntimeGoalActivity,
  now: number,
  previous?: RuntimeStatusIndicator,
): RuntimeStatusIndicator {
  const source = continuationSourceForActivity(activity);
  const content = continuationScheduledContent(source, activity.message);
  return {
    id: `${source}:${activity.goalId ?? activity.threadId}`,
    threadId: activity.threadId,
    kind: source,
    phase: "scheduled",
    tone: "working",
    title: content.title,
    message: content.message,
    startedAt: previous?.startedAt ?? now,
    updatedAt: now,
    startGraceUntil: now + GOAL_CONTINUATION_START_GRACE_MS,
    goalId: activity.goalId,
    continuationTurns: previous?.continuationTurns,
  };
}

function continuationRunningIndicator(previous: RuntimeStatusIndicator, now: number): RuntimeStatusIndicator {
  if (!runtimeStatusIndicatorIsContinuation(previous)) return previous;
  const content = continuationRunningContent(previous.kind);
  return {
    ...previous,
    phase: "running",
    tone: "working",
    title: content.title,
    message: content.message,
    updatedAt: now,
    startGraceUntil: undefined,
    expiresAt: undefined,
  };
}

function continuationFinishedIndicator(
  previous: RuntimeStatusIndicator,
  now: number,
  status: Extract<RunStatus, "idle" | "error">,
  message?: string,
): RuntimeStatusIndicator {
  const source = runtimeStatusIndicatorIsContinuation(previous) ? previous.kind : "goal-continuation";
  const content = continuationFinishedContent(source, status, message);
  return {
    ...previous,
    phase: "finished",
    tone: status === "error" ? "warning" : "success",
    title: content.title,
    message: content.message,
    updatedAt: now,
    startGraceUntil: undefined,
    expiresAt: now + RUNTIME_STATUS_FINISHED_VISIBLE_MS,
  };
}

function continuationFinishedGoalIndicator(
  previous: RuntimeStatusIndicator,
  now: number,
  goal: ThreadGoal,
): RuntimeStatusIndicator {
  if (goal.status === "complete") {
    return continuationFinishedIndicator(previous, now, "idle", goalStatusMessage(goal));
  }
  return {
    ...continuationFinishedIndicator(previous, now, "error", goalStatusMessage(goal)),
    title: goalContinuationStoppedTitle(goal),
  };
}

function compactionRunningMessage(reason?: Extract<RuntimeActivity, { kind: "compaction" }>["reason"]): string {
  if (reason === "manual") return "Manual context compaction is running.";
  if (reason === "overflow") return "Ambient is recovering from context overflow before continuing.";
  return "Ambient is compressing this chat before continuing.";
}

function runtimeStatusIndicatorIsVisible(
  indicator: RuntimeStatusIndicator,
  goal: ThreadGoal | undefined,
  now: number,
): boolean {
  if (runtimeStatusIndicatorIsExpired(indicator, now)) return false;
  if (indicator.kind !== "goal-continuation") return true;
  if (goal && indicator.goalId && goal.goalId !== indicator.goalId) return false;
  return true;
}

function runtimeStatusIndicatorIsExpired(indicator: RuntimeStatusIndicator, now: number): boolean {
  if (indicator.expiresAt !== undefined && indicator.expiresAt <= now) return true;
  return indicator.phase === "scheduled" && indicator.startGraceUntil !== undefined && indicator.startGraceUntil <= now;
}

function goalActivityMatchesContinuation(
  activity: RuntimeGoalActivity,
  continuation: RuntimeStatusIndicator,
): boolean {
  if (continuation.kind !== continuationSourceForActivity(activity)) return false;
  return !activity.goalId || !continuation.goalId || activity.goalId === continuation.goalId;
}

function continuationSourceForActivity(activity: RuntimeGoalActivity): RuntimeContinuationSource {
  return activity.continuationSource ?? (activity.goalId ? "goal-continuation" : "post-tool-continuation");
}

function runtimeStatusIndicatorIsContinuation(indicator: RuntimeStatusIndicator): indicator is RuntimeStatusIndicator & { kind: RuntimeContinuationSource } {
  return indicator.kind !== "compaction";
}

function continuationScheduledContent(
  source: RuntimeContinuationSource,
  message: string | undefined,
): Pick<RuntimeStatusIndicator, "title" | "message"> {
  if (source === "thread-wake") {
    return {
      title: "Scheduled wake",
      message: message || "Ambient queued a scheduled wake continuation.",
    };
  }
  if (source === "post-tool-continuation") {
    return {
      title: "Continuing after tool output",
      message: message || "Ambient queued a continuation after tool output.",
    };
  }
  if (source === "compaction-continuation") {
    return {
      title: "Compacting context",
      message: message || "Ambient queued a continuation after context compaction.",
    };
  }
  return {
    title: "Continuing goal",
    message: message || "Ambient queued an automatic goal continuation turn.",
  };
}

function continuationRunningContent(
  source: RuntimeContinuationSource,
): Pick<RuntimeStatusIndicator, "title" | "message"> {
  if (source === "thread-wake") {
    return {
      title: "Scheduled wake",
      message: "Ambient is running the scheduled wake continuation.",
    };
  }
  if (source === "post-tool-continuation") {
    return {
      title: "Continuing after tool output",
      message: "Ambient is continuing after tool output.",
    };
  }
  if (source === "compaction-continuation") {
    return {
      title: "Compacting context",
      message: "Ambient is continuing after context compaction.",
    };
  }
  return {
    title: "Continuing goal",
    message: "Ambient is running an automatic goal continuation turn.",
  };
}

function continuationFinishedContent(
  source: RuntimeContinuationSource,
  status: Extract<RunStatus, "idle" | "error">,
  message: string | undefined,
): Pick<RuntimeStatusIndicator, "title" | "message"> {
  const failed = status === "error";
  if (source === "thread-wake") {
    return {
      title: failed ? "Scheduled wake stopped" : "Scheduled wake finished",
      message: message || (
        failed
          ? "The scheduled wake continuation stopped before the run finished."
          : "Ambient finished the scheduled wake continuation."
      ),
    };
  }
  if (source === "post-tool-continuation") {
    return {
      title: failed ? "Post-tool continuation stopped" : "Post-tool continuation finished",
      message: message || (
        failed
          ? "The post-tool continuation stopped before the run finished."
          : "Ambient finished continuing after tool output."
      ),
    };
  }
  if (source === "compaction-continuation") {
    return {
      title: failed ? "Context continuation stopped" : "Context continuation finished",
      message: message || (
        failed
          ? "The context continuation stopped before the run finished."
          : "Ambient finished continuing after context compaction."
      ),
    };
  }
  return {
    title: failed ? "Continuation stopped" : "Continuation turn finished",
    message: message || (
      failed
        ? "The automatic goal continuation stopped before the run finished."
        : "Ambient finished the automatic goal continuation turn."
    ),
  };
}

function goalStatusMessage(goal: ThreadGoal): string {
  if (goal.status === "complete") return "Ambient completed the goal.";
  if (goal.status === "blocked") return goal.statusReason || "Ambient marked the goal blocked.";
  if (goal.status === "paused") return goal.statusReason || "Ambient paused the goal.";
  if (goal.status === "budget_limited") return goal.statusReason || "Ambient stopped at the goal budget.";
  if (goal.status === "usage_limited") return goal.statusReason || "Ambient stopped at the goal usage limit.";
  return goal.statusReason || "Ambient stopped the goal continuation.";
}

function goalContinuationStoppedTitle(goal: ThreadGoal): string {
  if (goal.status === "blocked") return "Goal blocked";
  if (goal.status === "paused") return "Goal paused";
  if (goal.status === "budget_limited") return "Goal budget hit";
  if (goal.status === "usage_limited") return "Goal limit hit";
  return "Continuation stopped";
}
