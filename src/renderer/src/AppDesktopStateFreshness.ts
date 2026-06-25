import type { DesktopState } from "../../shared/desktopTypes";
import type { ChatMessage, ThreadGoal } from "../../shared/threadTypes";

export function desktopStateRevision(state: Pick<DesktopState, "stateRevision">): number | undefined {
  return typeof state.stateRevision === "number" && Number.isFinite(state.stateRevision)
    ? state.stateRevision
    : undefined;
}

export function desktopStateFreshnessDecision(
  latestRevision: number | undefined,
  state: Pick<DesktopState, "stateRevision">,
): { apply: boolean; latestRevision: number | undefined } {
  const revision = desktopStateRevision(state);
  if (revision === undefined) return { apply: true, latestRevision };
  if (latestRevision !== undefined && revision < latestRevision) {
    return { apply: false, latestRevision };
  }
  return { apply: true, latestRevision: revision };
}

export function threadGoalKey(goal: Pick<ThreadGoal, "threadId" | "goalId">): string {
  return `${goal.threadId}:${goal.goalId}`;
}

export function desktopStateWithoutClearedGoal(
  state: DesktopState,
  clearedGoalKeys: ReadonlySet<string>,
): DesktopState {
  return state.activeThreadGoal && clearedGoalKeys.has(threadGoalKey(state.activeThreadGoal))
    ? { ...state, activeThreadGoal: undefined }
    : state;
}

export function desktopStateCommitDecision(
  latestRevision: number | undefined,
  state: DesktopState,
  clearedGoalKeys: ReadonlySet<string>,
  currentState?: DesktopState | undefined,
): { apply: boolean; state: DesktopState } {
  let nextState = desktopStateForFullSnapshotCommit(
    desktopStateWithoutClearedGoal(state, clearedGoalKeys),
    currentState,
  );
  nextState = desktopStateWithoutClearedGoal(nextState, clearedGoalKeys);
  const revision = desktopStateRevision(nextState);
  if (revision !== undefined && latestRevision !== undefined && revision < latestRevision) {
    return { apply: false, state: nextState };
  }
  return { apply: true, state: nextState };
}

export function desktopStateForFullSnapshotCommit(
  snapshot: DesktopState,
  currentState: DesktopState | undefined,
): DesktopState {
  if (
    !currentState ||
    currentState.activeWorkspace.path !== snapshot.activeWorkspace.path ||
    currentState.activeThreadId !== snapshot.activeThreadId
  ) {
    return snapshot;
  }
  const messages = desktopStateRebasedMessages(snapshot.messages, currentState.messages);
  return {
    ...snapshot,
    activeThreadGoal: currentState.activeThreadGoal,
    callableWorkflowTasks: currentState.callableWorkflowTasks,
    childMessagesByThreadId: desktopStateRebasedChildMessages(
      snapshot.childMessagesByThreadId,
      currentState.childMessagesByThreadId,
    ),
    messages,
    messageWindow: desktopStateRebasedMessageWindow(snapshot.messageWindow, currentState.messageWindow, messages.length),
    plannerPlanArtifacts: currentState.plannerPlanArtifacts,
    subagentMailboxEvents: currentState.subagentMailboxEvents,
    subagentParentMailboxEvents: currentState.subagentParentMailboxEvents,
    subagentRunEvents: currentState.subagentRunEvents,
    subagentRuns: currentState.subagentRuns,
    subagentToolScopeSnapshots: currentState.subagentToolScopeSnapshots,
    subagentWaitBarriers: currentState.subagentWaitBarriers,
  };
}

function desktopStateRebasedMessages(snapshot: ChatMessage[], current: ChatMessage[]): ChatMessage[] {
  const currentById = new Map(current.map((message) => [message.id, message]));
  const snapshotIds = new Set(snapshot.map((message) => message.id));
  const firstSnapshotIndexInCurrent = current.findIndex((message) => snapshotIds.has(message.id));
  const preservedPrefix = firstSnapshotIndexInCurrent > 0 ? current.slice(0, firstSnapshotIndexInCurrent) : [];
  return [
    ...preservedPrefix,
    ...snapshot.map((message) => currentById.get(message.id) ?? message),
  ];
}

function desktopStateRebasedMessageWindow(
  snapshot: DesktopState["messageWindow"],
  current: DesktopState["messageWindow"],
  loadedCount: number,
): DesktopState["messageWindow"] {
  if (!snapshot) return snapshot;
  if (current?.threadId === snapshot.threadId && current.loadedCount > snapshot.loadedCount) {
    return {
      ...snapshot,
      limit: current.limit,
      loadedCount,
      hasMoreBefore: current.hasMoreBefore,
    };
  }
  return {
    ...snapshot,
    loadedCount,
  };
}

function desktopStateRebasedChildMessages(
  snapshot: Record<string, ChatMessage[]> | undefined,
  current: Record<string, ChatMessage[]> | undefined,
): Record<string, ChatMessage[]> | undefined {
  if (!snapshot || !current) return snapshot;
  return Object.fromEntries(
    Object.entries(snapshot).map(([threadId, messages]) => [
      threadId,
      desktopStateRebasedMessages(messages, current[threadId] ?? []),
    ]),
  );
}
