import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { RefineProjectBoardSynthesisInput } from "../../shared/projectBoardTypes";
import {
  createAppProjectBoardSynthesisActions,
  projectBoardProposalCardReviewBusyKey,
  projectBoardProposalQuestionBusyKey,
  projectBoardSynthesisPauseReason,
} from "./AppProjectBoardSynthesisActions";

describe("App project board synthesis actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps synthesis busy keys and pause reason stable", () => {
    expect(projectBoardProposalQuestionBusyKey("proposal-1", 2)).toBe("proposal-1:2");
    expect(projectBoardProposalCardReviewBusyKey("proposal-1", "source-1")).toBe("proposal-1:source-1");
    expect(projectBoardSynthesisPauseReason()).toBe("Pause requested from the project-board progress panel.");
  });

  it("refines a project board with the same busy, mode, and apply sequence", async () => {
    const nextState = desktopState();
    const refineProjectBoardSynthesis = vi.fn(async () => nextState);
    const { actions, appliedStates, calls } = createController({
      ambientDesktop: { refineProjectBoardSynthesis },
    });

    await actions.refineProjectBoardWithPi("board-1", "proposal-1", {
      mode: "source_elaboration",
      sourceIds: ["source-1"],
      objective: "expand source coverage",
    });

    expect(refineProjectBoardSynthesis).toHaveBeenCalledWith({
      boardId: "board-1",
      proposalId: "proposal-1",
      mode: "source_elaboration",
      sourceIds: ["source-1"],
      objective: "expand source coverage",
    });
    expect(calls.errors).toEqual([undefined]);
    expect(calls.refineBusy).toEqual([true, false]);
    expect(calls.refineMode).toEqual(["source_elaboration", undefined]);
    expect(appliedStates).toEqual([nextState]);
  });

  it("tracks proposal question and review-card busy keys around desktop calls", async () => {
    const answerState = desktopState();
    const reviewState = desktopState();
    const answerProjectBoardSynthesisProposalQuestion = vi.fn(async () => answerState);
    const reviewProjectBoardSynthesisProposalCard = vi.fn(async () => reviewState);
    const { actions, appliedStates, calls } = createController({
      ambientDesktop: {
        answerProjectBoardSynthesisProposalQuestion,
        reviewProjectBoardSynthesisProposalCard,
      },
    });

    await actions.answerProjectBoardSynthesisProposalQuestion("proposal-1", 2, "answer");
    await actions.reviewProjectBoardSynthesisProposalCard("proposal-1", "source-1", "accepted", "good", "card-merge");

    expect(answerProjectBoardSynthesisProposalQuestion).toHaveBeenCalledWith({
      proposalId: "proposal-1",
      questionIndex: 2,
      answer: "answer",
    });
    expect(reviewProjectBoardSynthesisProposalCard).toHaveBeenCalledWith({
      proposalId: "proposal-1",
      sourceId: "source-1",
      reviewStatus: "accepted",
      reason: "good",
      mergeTargetCardId: "card-merge",
    });
    expect(calls.proposalAnswerBusy).toEqual(["proposal-1:2", undefined]);
    expect(calls.proposalCardReviewBusy).toEqual(["proposal-1:source-1", undefined]);
    expect(appliedStates).toEqual([answerState, reviewState]);
  });

  it("preserves synthesis apply and pause inputs", async () => {
    const applyState = desktopState();
    const pauseState = desktopState();
    const applyProjectBoardSynthesisProposal = vi.fn(async () => applyState);
    const pauseProjectBoardSynthesis = vi.fn(async () => pauseState);
    const { actions, appliedStates, calls } = createController({
      ambientDesktop: {
        applyProjectBoardSynthesisProposal,
        pauseProjectBoardSynthesis,
      },
    });

    await actions.applyProjectBoardSynthesisProposal("proposal-1");
    await actions.pauseProjectBoardSynthesis("board-1", "run-1");

    expect(applyProjectBoardSynthesisProposal).toHaveBeenCalledWith({
      proposalId: "proposal-1",
      replaceExistingDraft: true,
    });
    expect(pauseProjectBoardSynthesis).toHaveBeenCalledWith({
      boardId: "board-1",
      runId: "run-1",
      reason: projectBoardSynthesisPauseReason(),
    });
    expect(calls.proposalApplyBusy).toEqual([true, false]);
    expect(calls.synthesisPauseBusy).toEqual([true, false]);
    expect(appliedStates).toEqual([applyState, pauseState]);
  });
});

type AmbientDesktopMock = Partial<typeof window.ambientDesktop>;

function createController({ ambientDesktop }: { ambientDesktop: AmbientDesktopMock }) {
  vi.stubGlobal("window", { ambientDesktop });

  const appliedStates: DesktopState[] = [];
  const proposalAnswerBusy = statefulSetter<string | undefined>(undefined);
  const proposalApplyBusy = statefulSetter(false);
  const proposalCardReviewBusy = statefulSetter<string | undefined>(undefined);
  const refineBusy = statefulSetter(false);
  const refineMode = statefulSetter<RefineProjectBoardSynthesisInput["mode"] | undefined>(undefined);
  const synthesisDeferBusy = statefulSetter(false);
  const synthesisPauseBusy = statefulSetter(false);
  const synthesisRetryBusy = statefulSetter(false);
  const calls: {
    errors: Array<string | undefined>;
    proposalAnswerBusy: Array<string | undefined>;
    proposalApplyBusy: boolean[];
    proposalCardReviewBusy: Array<string | undefined>;
    refineBusy: boolean[];
    refineMode: Array<RefineProjectBoardSynthesisInput["mode"] | undefined>;
    synthesisPauseBusy: boolean[];
  } = {
    errors: [],
    proposalAnswerBusy: proposalAnswerBusy.calls,
    proposalApplyBusy: proposalApplyBusy.calls,
    proposalCardReviewBusy: proposalCardReviewBusy.calls,
    refineBusy: refineBusy.calls,
    refineMode: refineMode.calls,
    synthesisPauseBusy: synthesisPauseBusy.calls,
  };

  const actions = createAppProjectBoardSynthesisActions({
    applyProjectBoardState: (next) => appliedStates.push(next),
    setError: (message) => calls.errors.push(message),
    setProjectBoardProposalAnswerBusy: proposalAnswerBusy.set,
    setProjectBoardProposalApplyBusy: proposalApplyBusy.set,
    setProjectBoardProposalCardReviewBusy: proposalCardReviewBusy.set,
    setProjectBoardRefineBusy: refineBusy.set,
    setProjectBoardRefineMode: refineMode.set,
    setProjectBoardSynthesisDeferBusy: synthesisDeferBusy.set,
    setProjectBoardSynthesisPauseBusy: synthesisPauseBusy.set,
    setProjectBoardSynthesisRetryBusy: synthesisRetryBusy.set,
  });

  return { actions, appliedStates, calls };
}

function statefulSetter<T>(initial: T): {
  calls: T[];
  set: Dispatch<SetStateAction<T>>;
  value: T;
} {
  const state = {
    calls: [] as T[],
    value: initial,
  };
  return {
    calls: state.calls,
    get value() {
      return state.value;
    },
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
  } as unknown as DesktopState;
}

