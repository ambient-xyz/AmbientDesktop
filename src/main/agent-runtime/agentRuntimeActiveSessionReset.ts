export interface RuntimeActiveSessionLike {
  dispose(): void;
}

export type RuntimeActiveSessionResetAction =
  | {
      status: "deferred";
      threadId: string;
      session: RuntimeActiveSessionLike;
    }
  | {
      status: "disposed";
      threadId: string;
      session: RuntimeActiveSessionLike;
    };

export interface RuntimeActiveSessionResetResult {
  disposedSessions: number;
  deferredSessions: number;
  disposedThreadIds: string[];
  deferredThreadIds: string[];
}

export interface RuntimeActiveSessionResetPlan {
  actions: RuntimeActiveSessionResetAction[];
  result: RuntimeActiveSessionResetResult;
}

export function runtimeActiveSessionResetPlan(
  sessions: Iterable<[string, RuntimeActiveSessionLike]>,
  activeRuns: { has(threadId: string): boolean },
): RuntimeActiveSessionResetPlan {
  const actions: RuntimeActiveSessionResetAction[] = [];
  const result: RuntimeActiveSessionResetResult = {
    disposedSessions: 0,
    deferredSessions: 0,
    disposedThreadIds: [],
    deferredThreadIds: [],
  };
  for (const [threadId, session] of sessions) {
    if (activeRuns.has(threadId)) {
      actions.push({ status: "deferred", threadId, session });
      result.deferredSessions += 1;
      result.deferredThreadIds.push(threadId);
      continue;
    }
    actions.push({ status: "disposed", threadId, session });
    result.disposedSessions += 1;
    result.disposedThreadIds.push(threadId);
  }
  return { actions, result };
}
