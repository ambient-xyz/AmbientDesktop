import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { ThreadGoal } from "../../shared/threadTypes";
import {
  createAppGoalActions,
  desktopStateWithActiveGoal,
  parseGoalBudgetPromptValue,
  pauseResumeGoalUpdate,
} from "./AppGoalActions";

describe("App goal actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps active-goal state replacement scoped to the active goal", () => {
    const state = desktopState({ activeThreadGoal: threadGoal({ goalId: "goal-old" }) });
    const goal = threadGoal({ goalId: "goal-new" });

    expect(desktopStateWithActiveGoal(state, goal)).toEqual({
      ...state,
      activeThreadGoal: goal,
    });
    expect(desktopStateWithActiveGoal(state, undefined)).toEqual({
      ...state,
      activeThreadGoal: undefined,
    });
  });

  it("keeps pause/resume and budget parsing decisions stable", () => {
    expect(pauseResumeGoalUpdate(threadGoal({ status: "active" }))).toEqual({
      status: "paused",
      statusReason: "Paused by user.",
    });
    expect(pauseResumeGoalUpdate(threadGoal({ status: "paused" }))).toEqual({
      status: "active",
      statusReason: null,
    });
    expect(parseGoalBudgetPromptValue("")).toEqual({ kind: "clear" });
    expect(parseGoalBudgetPromptValue(" 1,234.9 ")).toEqual({ kind: "set", tokenBudget: 1234 });
    expect(parseGoalBudgetPromptValue("0")).toEqual({
      kind: "invalid",
      message: "Goal token budget must be a positive number.",
    });
  });

  it("arms goal mode without touching Desktop when no active goal exists", async () => {
    const controller = createController({ state: desktopState() });

    await controller.actions.toggleGoalMode();

    expect(controller.goalModeArmed.value).toBe(true);
    expect(controller.goalMenuOpen.value).toBe(false);
    expect(controller.setLocalDeepResearchModeArmed).toHaveBeenCalledWith(false);
    expect(controller.setError).not.toHaveBeenCalled();
  });

  it("closes Symphony when goal mode arms", async () => {
    const controller = createController({ state: desktopState() });

    await controller.actions.toggleGoalMode();

    expect(controller.goalModeArmed.value).toBe(true);
    expect(controller.setSymphonyBuilderOpen).toHaveBeenCalledWith(false);
  });

  it("does not arm goal mode while planner collaboration mode is active", async () => {
    const controller = createController({
      state: desktopState({ settings: { collaborationMode: "planner" } }),
    });

    await controller.actions.toggleGoalMode();

    expect(controller.goalModeArmed.value).toBe(false);
    expect(controller.setLocalDeepResearchModeArmed).not.toHaveBeenCalled();
  });

  it("pauses active goals through the Desktop goal API", async () => {
    const returnedGoal = threadGoal({ goalId: "goal-1", status: "paused" });
    const setThreadGoal = vi.fn(async () => returnedGoal);
    vi.stubGlobal("window", { ambientDesktop: { setThreadGoal } });
    const controller = createController({
      state: desktopState({ activeThreadGoal: threadGoal({ goalId: "goal-1", status: "active" }) }),
      goalMenuOpen: true,
      goalModeArmed: true,
    });

    await controller.actions.pauseOrResumeActiveGoal();

    expect(setThreadGoal).toHaveBeenCalledWith({
      threadId: "thread-1",
      status: "paused",
      statusReason: "Paused by user.",
      expectedGoalId: "goal-1",
    });
    expect(controller.state.value?.activeThreadGoal).toBe(returnedGoal);
    expect(controller.goalBusy.value).toBe(false);
    expect(controller.goalMenuOpen.value).toBe(false);
    expect(controller.goalModeArmed.value).toBe(false);
    expect(controller.setError).toHaveBeenCalledWith(undefined);
  });

  it("sets a parsed goal budget from the prompt", async () => {
    const setThreadGoal = vi.fn(async () => threadGoal({ goalId: "goal-1", tokenBudget: 1234 }));
    vi.stubGlobal("window", {
      ambientDesktop: { setThreadGoal },
      prompt: vi.fn(() => "1,234.9"),
    });
    const controller = createController({
      state: desktopState({ activeThreadGoal: threadGoal({ goalId: "goal-1", tokenBudget: 100 }) }),
    });

    await controller.actions.setActiveGoalBudget();

    expect(setThreadGoal).toHaveBeenCalledWith({
      threadId: "thread-1",
      tokenBudget: 1234,
      expectedGoalId: "goal-1",
    });
  });

  it("sets a parsed goal budget from an explicit value without opening a prompt", async () => {
    const setThreadGoal = vi.fn(async () => threadGoal({ goalId: "goal-1", tokenBudget: 2500 }));
    const prompt = vi.fn(() => "100");
    vi.stubGlobal("window", {
      ambientDesktop: { setThreadGoal },
      prompt,
    });
    const controller = createController({
      state: desktopState({ activeThreadGoal: threadGoal({ goalId: "goal-1", tokenBudget: 100 }) }),
    });

    const applied = await controller.actions.setActiveGoalBudget("2,500");

    expect(applied).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    expect(setThreadGoal).toHaveBeenCalledWith({
      threadId: "thread-1",
      tokenBudget: 2500,
      expectedGoalId: "goal-1",
    });
  });

  it("reports invalid goal budgets without calling Desktop", async () => {
    const setThreadGoal = vi.fn();
    vi.stubGlobal("window", {
      ambientDesktop: { setThreadGoal },
      prompt: vi.fn(() => "not a number"),
    });
    const controller = createController({
      state: desktopState({ activeThreadGoal: threadGoal({ goalId: "goal-1" }) }),
    });

    await controller.actions.setActiveGoalBudget();

    expect(setThreadGoal).not.toHaveBeenCalled();
    expect(controller.setError).toHaveBeenCalledWith("Goal token budget must be a positive number.");
  });

  it("clears active goals without confirmation when requested", async () => {
    const clearThreadGoal = vi.fn(async () => undefined);
    const confirm = vi.fn(() => true);
    vi.stubGlobal("window", { ambientDesktop: { clearThreadGoal }, confirm });
    const controller = createController({
      state: desktopState({ activeThreadGoal: threadGoal({ goalId: "goal-1" }) }),
      goalMenuOpen: true,
      goalModeArmed: true,
    });

    await controller.actions.clearActiveGoal({ confirm: false });

    expect(confirm).not.toHaveBeenCalled();
    expect(clearThreadGoal).toHaveBeenCalledWith({
      threadId: "thread-1",
      expectedGoalId: "goal-1",
    });
    expect(controller.onGoalCleared).toHaveBeenCalledWith("thread-1", "goal-1");
    expect(controller.state.value?.activeThreadGoal).toBeUndefined();
    expect(controller.goalBusy.value).toBe(false);
    expect(controller.goalMenuOpen.value).toBe(false);
    expect(controller.goalModeArmed.value).toBe(false);
  });
});

function createController({
  goalMenuOpen = false,
  goalModeArmed = false,
  state = desktopState(),
}: {
  goalMenuOpen?: boolean;
  goalModeArmed?: boolean;
  state?: DesktopState | undefined;
} = {}) {
  const stateValue = statefulSetter<DesktopState | undefined>(state);
  const goalBusy = statefulSetter(false);
  const goalMenuOpenState = statefulSetter(goalMenuOpen);
  const goalModeArmedState = statefulSetter(goalModeArmed);
  const setError = vi.fn();
  const setLocalDeepResearchModeArmed = vi.fn();
  const setSymphonyBuilderOpen = vi.fn();
  const onGoalCleared = vi.fn();
  return {
    actions: createAppGoalActions({
      goalModeArmed,
      onGoalCleared,
      setError,
      setGoalBusy: goalBusy.set,
      setGoalMenuOpen: goalMenuOpenState.set,
      setGoalModeArmed: goalModeArmedState.set,
      setLocalDeepResearchModeArmed,
      setSymphonyBuilderOpen,
      setState: stateValue.set,
      state: stateValue.value,
    }),
    goalBusy,
    goalMenuOpen: goalMenuOpenState,
    goalModeArmed: goalModeArmedState,
    onGoalCleared,
    setError,
    setLocalDeepResearchModeArmed,
    setSymphonyBuilderOpen,
    state: stateValue,
  };
}

function statefulSetter<T>(initial: T): {
  set: Dispatch<SetStateAction<T>>;
  value: T;
} {
  const state = { value: initial };
  return {
    get value() {
      return state.value;
    },
    set(next) {
      state.value = typeof next === "function" ? (next as (current: T) => T)(state.value) : next;
    },
  };
}

function desktopState(input: {
  activeThreadGoal?: ThreadGoal;
  settings?: Partial<DesktopState["settings"]>;
} = {}): DesktopState {
  return {
    activeThreadId: "thread-1",
    activeThreadGoal: input.activeThreadGoal,
    settings: {
      collaborationMode: "agent",
      model: "ambient",
      permissionMode: "full-access",
      thinkingLevel: "medium",
      ...input.settings,
    },
  } as DesktopState;
}

function threadGoal(input: Partial<ThreadGoal> = {}): ThreadGoal {
  return {
    threadId: "thread-1",
    goalId: "goal-id",
    objective: "Finish the simplification plan",
    status: "active",
    tokensUsed: 0,
    timeUsedSeconds: 0,
    continuationTurns: 0,
    noProgressTurns: 0,
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
    ...input,
  };
}
