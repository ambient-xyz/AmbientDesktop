import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import { createAppProjectBoardProofActions } from "./AppProjectBoardProofActions";

describe("App project board proof actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies returned project board state for proof action calls", async () => {
    const nextState = desktopState();
    const approveProjectBoardCard = vi.fn(async () => nextState);
    const splitProjectBoardCard = vi.fn(async () => nextState);
    const { actions, appliedStates, errors } = createController({
      approveProjectBoardCard,
      splitProjectBoardCard,
    });

    await actions.approveProjectBoardCard({ id: "card-1" } as ProjectBoardCard);
    await actions.splitProjectBoardCard({ cardId: "card-1" });

    expect(approveProjectBoardCard).toHaveBeenCalledWith({ cardId: "card-1" });
    expect(splitProjectBoardCard).toHaveBeenCalledWith({ cardId: "card-1" });
    expect(appliedStates).toEqual([nextState, nextState]);
    expect(errors).toEqual([undefined, undefined]);
  });

  it("preserves throwing proof action errors after surfacing them", async () => {
    const failure = new Error("proof rerun failed");
    const rerunProjectBoardProof = vi.fn(async () => {
      throw failure;
    });
    const { actions, appliedStates, errors } = createController({
      rerunProjectBoardProof,
    });

    await expect(actions.rerunProjectBoardProof({ cardId: "card-1" })).rejects.toBe(failure);

    expect(rerunProjectBoardProof).toHaveBeenCalledWith({ cardId: "card-1" });
    expect(appliedStates).toEqual([]);
    expect(errors).toEqual([undefined, "proof rerun failed"]);
  });
});

type AmbientDesktopMock = Partial<typeof window.ambientDesktop>;

function createController(ambientDesktop: AmbientDesktopMock) {
  vi.stubGlobal("window", { ambientDesktop });
  const appliedStates: DesktopState[] = [];
  const errors: Array<string | undefined> = [];
  const actions = createAppProjectBoardProofActions({
    applyProjectBoardState: (next) => appliedStates.push(next),
    setError: (message) => errors.push(message),
  });
  return { actions, appliedStates, errors };
}

function desktopState(): DesktopState {
  return {
    activeThreadId: "thread-1",
    activeWorkspace: { path: "/repo" },
    workspace: { path: "/repo", name: "Repo" },
    plannerPlanArtifacts: [],
  } as unknown as DesktopState;
}
