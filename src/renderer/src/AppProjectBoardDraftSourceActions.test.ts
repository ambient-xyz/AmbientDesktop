import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import { createAppProjectBoardDraftSourceActions } from "./AppProjectBoardDraftSourceActions";

describe("App project board draft/source actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies returned state for decision and source draft calls", async () => {
    const nextState = desktopState();
    const applyProjectBoardDecisionImpactFeedback = vi.fn(async () => nextState);
    const refreshProjectBoardDecisionDrafts = vi.fn(async () => nextState);
    const updateProjectBoardSource = vi.fn(async () => nextState);
    const { actions, appliedStates, calls } = createController({
      ambientDesktop: {
        applyProjectBoardDecisionImpactFeedback,
        refreshProjectBoardDecisionDrafts,
        updateProjectBoardSource,
      },
    });

    await actions.applyProjectBoardDecisionImpactFeedback({ cardId: "card-1", action: "accepted" } as never);
    await actions.refreshProjectBoardDecisionDrafts({ boardId: "board-1" } as never);
    await actions.updateProjectBoardSource({ sourceId: "source-1", title: "Updated source" } as never);

    expect(applyProjectBoardDecisionImpactFeedback).toHaveBeenCalledWith({ cardId: "card-1", action: "accepted" });
    expect(refreshProjectBoardDecisionDrafts).toHaveBeenCalledWith({ boardId: "board-1" });
    expect(updateProjectBoardSource).toHaveBeenCalledWith({ sourceId: "source-1", title: "Updated source" });
    expect(calls.errors).toEqual([undefined, undefined, undefined]);
    expect(appliedStates).toEqual([nextState, nextState, nextState]);
  });

  it("tracks source-impact busy state and rethrows normalized failures", async () => {
    const nextState = desktopState();
    const applyProjectBoardSourceImpactFeedback = vi.fn(async () => nextState);
    const failure = "source impact failed";
    const regenerateProjectBoardSourceDrafts = vi.fn(async () => {
      throw failure;
    });
    const { actions, appliedStates, calls } = createController({
      ambientDesktop: {
        applyProjectBoardSourceImpactFeedback,
        regenerateProjectBoardSourceDrafts,
      },
    });

    await actions.applyProjectBoardSourceImpactFeedback({ sourceId: "source-1", action: "accepted" } as never);
    await expect(actions.regenerateProjectBoardSourceDrafts({ boardId: "board-1" } as never)).rejects.toThrow(failure);

    expect(applyProjectBoardSourceImpactFeedback).toHaveBeenCalledWith({ sourceId: "source-1", action: "accepted" });
    expect(regenerateProjectBoardSourceDrafts).toHaveBeenCalledWith({ boardId: "board-1" });
    expect(calls.sourceImpactBusy).toEqual([true, false, true, false]);
    expect(calls.errors).toEqual([undefined, undefined, failure]);
    expect(appliedStates).toEqual([nextState]);
  });

  it("preserves kickoff defaults busy suppression", async () => {
    const skipped = vi.fn(async () => desktopState());
    const skippedController = createController({
      ambientDesktop: { suggestProjectBoardKickoffDefaults: skipped },
      projectBoardKickoffDefaultsBusy: true,
    });

    await skippedController.actions.suggestProjectBoardKickoffDefaults({ boardId: "board-1" } as never);

    expect(skipped).not.toHaveBeenCalled();
    expect(skippedController.calls.kickoffBusy).toEqual([]);
    expect(skippedController.calls.errors).toEqual([]);

    const nextState = desktopState();
    const suggestProjectBoardKickoffDefaults = vi.fn(async () => nextState);
    const { actions, appliedStates, calls } = createController({
      ambientDesktop: { suggestProjectBoardKickoffDefaults },
    });

    await actions.suggestProjectBoardKickoffDefaults({ boardId: "board-1" } as never);

    expect(suggestProjectBoardKickoffDefaults).toHaveBeenCalledWith({ boardId: "board-1" });
    expect(calls.kickoffBusy).toEqual([true, false]);
    expect(calls.errors).toEqual([undefined]);
    expect(appliedStates).toEqual([nextState]);
  });
});

type AmbientDesktopMock = Partial<typeof window.ambientDesktop>;

function createController({
  ambientDesktop,
  projectBoardKickoffDefaultsBusy = false,
}: {
  ambientDesktop: AmbientDesktopMock;
  projectBoardKickoffDefaultsBusy?: boolean;
}) {
  vi.stubGlobal("window", { ambientDesktop });

  const appliedStates: DesktopState[] = [];
  const kickoffBusy = statefulSetter(false);
  const sourceBusy = statefulSetter(false);
  const sourceImpactBusy = statefulSetter(false);
  const calls = {
    errors: [] as Array<string | undefined>,
    kickoffBusy: kickoffBusy.calls,
    sourceBusy: sourceBusy.calls,
    sourceImpactBusy: sourceImpactBusy.calls,
  };

  const actions = createAppProjectBoardDraftSourceActions({
    applyProjectBoardState: (next) => appliedStates.push(next),
    projectBoardKickoffDefaultsBusy,
    setError: (message) => calls.errors.push(message),
    setProjectBoardKickoffDefaultsBusy: kickoffBusy.set,
    setProjectBoardSourceBusy: sourceBusy.set,
    setProjectBoardSourceImpactBusy: sourceImpactBusy.set,
  });

  return { actions, appliedStates, calls };
}

function statefulSetter<T>(initial: T): {
  calls: T[];
  set: Dispatch<SetStateAction<T>>;
} {
  const state = {
    calls: [] as T[],
    value: initial,
  };
  return {
    calls: state.calls,
    set(next) {
      state.value = typeof next === "function" ? (next as (current: T) => T)(state.value) : next;
      state.calls.push(state.value);
    },
  };
}

function desktopState(): DesktopState {
  return {
    activeThreadId: "thread-1",
    activeWorkspace: { path: "/repo" },
    workspace: { path: "/repo", name: "Repo" },
    plannerPlanArtifacts: [],
  } as unknown as DesktopState;
}
