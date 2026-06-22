import type { MutableRefObject } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import { desktopStateFreshnessDecision, desktopStateWithoutClearedGoal } from "./AppDesktopStateFreshness";
import { rememberAppDesktopStateRefs, type AppDesktopStateRefs } from "./AppThreadLifecycleEffects";

export interface AppDesktopStateMemoryControlsOptions extends AppDesktopStateRefs {
  clearedGoalKeysRef: MutableRefObject<Set<string>>;
  latestDesktopStateRevisionRef: MutableRefObject<number | undefined>;
}

export function createAppDesktopStateMemoryControls({
  activeProjectRootRef,
  activeThreadIdRef,
  clearedGoalKeysRef,
  latestDesktopStateRevisionRef,
  workspaceProjectAliasesRef,
}: AppDesktopStateMemoryControlsOptions): {
  rememberClearedGoal: (threadId: string, goalId: string | undefined) => void;
  rememberDesktopState: (next: DesktopState) => DesktopState | false;
  rememberCommittedDesktopState: (next: DesktopState) => void;
} {
  function applyDesktopStateFreshness(next: DesktopState): boolean {
    const decision = desktopStateFreshnessDecision(latestDesktopStateRevisionRef.current, next);
    latestDesktopStateRevisionRef.current = decision.latestRevision;
    return decision.apply;
  }

  return {
    rememberClearedGoal(threadId, goalId) {
      if (goalId) clearedGoalKeysRef.current.add(`${threadId}:${goalId}`);
    },
    rememberDesktopState(next) {
      const nextState = desktopStateWithoutClearedGoal(next, clearedGoalKeysRef.current);
      if (!applyDesktopStateFreshness(nextState)) return false;
      rememberAppDesktopStateRefs(nextState, {
        activeProjectRootRef,
        activeThreadIdRef,
        workspaceProjectAliasesRef,
      });
      return nextState;
    },
    rememberCommittedDesktopState(next) {
      const decision = desktopStateFreshnessDecision(latestDesktopStateRevisionRef.current, next);
      latestDesktopStateRevisionRef.current = decision.latestRevision;
      rememberAppDesktopStateRefs(next, {
        activeProjectRootRef,
        activeThreadIdRef,
        workspaceProjectAliasesRef,
      });
    },
  };
}
