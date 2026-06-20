import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { ThreadGoal } from "../../shared/threadTypes";

export type ActiveGoalUpdateInput = {
  objective?: string;
  status?: ThreadGoal["status"];
  tokenBudget?: number | null;
  statusReason?: string | null;
};

export type GoalBudgetPromptResult =
  | { kind: "clear" }
  | { kind: "invalid"; message: string }
  | { kind: "set"; tokenBudget: number };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function desktopStateWithActiveGoal(state: DesktopState, goal: ThreadGoal | undefined): DesktopState {
  return { ...state, activeThreadGoal: goal };
}

export function pauseResumeGoalUpdate(goal: Pick<ThreadGoal, "status">): ActiveGoalUpdateInput {
  return {
    status: goal.status === "active" ? "paused" : "active",
    statusReason: goal.status === "active" ? "Paused by user." : null,
  };
}

export function parseGoalBudgetPromptValue(value: string): GoalBudgetPromptResult {
  const trimmed = value.trim();
  if (!trimmed) return { kind: "clear" };
  const tokenBudget = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(tokenBudget) || tokenBudget <= 0) {
    return { kind: "invalid", message: "Goal token budget must be a positive number." };
  }
  return { kind: "set", tokenBudget: Math.floor(tokenBudget) };
}

export function createAppGoalActions({
  goalModeArmed,
  onGoalCleared,
  setError,
  setGoalBusy,
  setGoalMenuOpen,
  setGoalModeArmed,
  setLocalDeepResearchModeArmed,
  setSymphonyBuilderOpen,
  setState,
  state,
}: {
  goalModeArmed: boolean;
  onGoalCleared?: (threadId: string, goalId: string) => void;
  setError: (message: string | undefined) => void;
  setGoalBusy: Dispatch<SetStateAction<boolean>>;
  setGoalMenuOpen: Dispatch<SetStateAction<boolean>>;
  setGoalModeArmed: Dispatch<SetStateAction<boolean>>;
  setLocalDeepResearchModeArmed: (next: boolean) => void;
  setSymphonyBuilderOpen?: (open: boolean) => void;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  state: DesktopState | undefined;
}): {
  clearActiveGoal: (options?: { confirm?: boolean }) => Promise<void>;
  editActiveGoalObjective: () => Promise<void>;
  pauseOrResumeActiveGoal: () => Promise<void>;
  setActiveGoalBudget: () => Promise<void>;
  toggleGoalMode: () => Promise<void>;
  updateActiveGoal: (input: ActiveGoalUpdateInput) => Promise<void>;
} {
  function applyActiveGoal(goal: ThreadGoal | undefined): void {
    setState((current) => current ? desktopStateWithActiveGoal(current, goal) : current);
  }

  async function updateActiveGoal(input: ActiveGoalUpdateInput): Promise<void> {
    if (!state?.activeThreadId) return;
    const currentGoal = state.activeThreadGoal;
    setGoalBusy(true);
    setError(undefined);
    try {
      const goal = await window.ambientDesktop.setThreadGoal({
        threadId: state.activeThreadId,
        ...input,
        ...(currentGoal ? { expectedGoalId: currentGoal.goalId } : {}),
      });
      applyActiveGoal(goal);
      setGoalMenuOpen(false);
      setGoalModeArmed(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGoalBusy(false);
    }
  }

  async function clearActiveGoal(options: { confirm?: boolean } = {}): Promise<void> {
    const goal = state?.activeThreadGoal;
    if (!state?.activeThreadId || !goal) return;
    if (options.confirm !== false && !window.confirm("Clear this thread goal?")) return;
    setGoalBusy(true);
    setError(undefined);
    try {
      await window.ambientDesktop.clearThreadGoal({ threadId: state.activeThreadId, expectedGoalId: goal.goalId });
      onGoalCleared?.(state.activeThreadId, goal.goalId);
      applyActiveGoal(undefined);
      setGoalModeArmed(false);
      setGoalMenuOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGoalBusy(false);
    }
  }

  async function toggleGoalMode(): Promise<void> {
    if (!state?.activeThreadId || state.settings.collaborationMode === "planner") return;
    const goal = state.activeThreadGoal;
    if (!goal) {
      const next = !goalModeArmed;
      setGoalModeArmed(next);
      if (next) {
        setLocalDeepResearchModeArmed(false);
        setSymphonyBuilderOpen?.(false);
      }
      setGoalMenuOpen(false);
      return;
    }
    if (goal.status === "complete") {
      await clearActiveGoal({ confirm: false });
      return;
    }
    await updateActiveGoal(pauseResumeGoalUpdate(goal));
  }

  async function pauseOrResumeActiveGoal(): Promise<void> {
    const goal = state?.activeThreadGoal;
    if (!goal) return;
    if (goal.status === "complete") {
      await clearActiveGoal({ confirm: false });
      return;
    }
    await updateActiveGoal(pauseResumeGoalUpdate(goal));
  }

  async function editActiveGoalObjective(): Promise<void> {
    const goal = state?.activeThreadGoal;
    if (!goal) return;
    const next = window.prompt("Goal objective", goal.objective);
    if (next === null) return;
    const objective = next.trim();
    if (!objective) return;
    await updateActiveGoal({ objective });
  }

  async function setActiveGoalBudget(): Promise<void> {
    const goal = state?.activeThreadGoal;
    if (!goal) return;
    const next = window.prompt("Estimated token budget. Leave blank for no budget.", goal.tokenBudget?.toString() ?? "");
    if (next === null) return;
    const parsed = parseGoalBudgetPromptValue(next);
    if (parsed.kind === "clear") {
      await updateActiveGoal({ tokenBudget: null });
      return;
    }
    if (parsed.kind === "invalid") {
      setError(parsed.message);
      return;
    }
    await updateActiveGoal({ tokenBudget: parsed.tokenBudget });
  }

  return {
    clearActiveGoal,
    editActiveGoalObjective,
    pauseOrResumeActiveGoal,
    setActiveGoalBudget,
    toggleGoalMode,
    updateActiveGoal,
  };
}
