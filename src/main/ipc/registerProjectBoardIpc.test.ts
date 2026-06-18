import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type {
  AnswerProjectBoardQuestionInput,
  AnswerProjectBoardSynthesisProposalQuestionInput,
  ApplyProjectBoardDecisionImpactFeedbackInput,
  ApplyProjectBoardSynthesisProposalInput,
  ApproveProjectBoardCardInput,
  CreateProjectBoardInput,
  CreateReadyProjectBoardTasksInput,
  DeferProjectBoardSynthesisSectionsInput,
  FinalizeProjectBoardKickoffInput,
  PauseProjectBoardSynthesisInput,
  ProjectBoardGitSyncStatus,
  PromotePlannerPlanToBoardInput,
  RefineProjectBoardSynthesisInput,
  RefreshProjectBoardSourcesInput,
  RegenerateProjectBoardSourceDraftsInput,
  ResolveProjectBoardProofDecisionInput,
  RetryProjectBoardSynthesisInput,
  ReviewProjectBoardSynthesisProposalCardInput,
  SeedProjectBoardCanonicalProjectionDogfoodInput,
  SeedProjectBoardDeliverableIntegrationDogfoodInput,
  SeedProjectBoardProofJudgmentDogfoodInput,
  SeedProjectBoardSemanticIdleDogfoodInput,
  SuggestProjectBoardClarificationDefaultsInput,
  SuggestProjectBoardKickoffDefaultsInput,
  UpdateProjectBoardSourceInput,
  UpdateProjectBoardStatusInput,
} from "../../shared/projectBoardTypes";
import {
  projectBoardCardIpcChannels,
  projectBoardCreateIpcChannels,
  projectBoardDefaultsIpcChannels,
  projectBoardDeferIpcChannels,
  projectBoardDogfoodIpcChannels,
  projectBoardFeedbackIpcChannels,
  projectBoardGitIpcChannels,
  projectBoardKickoffIpcChannels,
  projectBoardLifecycleIpcChannels,
  projectBoardPauseIpcChannels,
  projectBoardProposalIpcChannels,
  projectBoardPromoteIpcChannels,
  projectBoardProofIpcChannels,
  projectBoardSourceRefreshIpcChannels,
  projectBoardSourceQuestionIpcChannels,
  projectBoardSynthesisRefinementIpcChannels,
  projectBoardSynthesisRetryIpcChannels,
  registerProjectBoardCardIpc,
  registerProjectBoardCreateIpc,
  registerProjectBoardDefaultsIpc,
  registerProjectBoardDeferIpc,
  registerProjectBoardDogfoodIpc,
  registerProjectBoardFeedbackIpc,
  registerProjectBoardGitIpc,
  registerProjectBoardKickoffIpc,
  registerProjectBoardLifecycleIpc,
  registerProjectBoardPauseIpc,
  registerProjectBoardProposalIpc,
  registerProjectBoardPromoteIpc,
  registerProjectBoardProofIpc,
  registerProjectBoardSourceRefreshIpc,
  registerProjectBoardSourceQuestionIpc,
  registerProjectBoardSynthesisRefinementIpc,
  registerProjectBoardSynthesisRetryIpc,
  type RegisterProjectBoardCardIpcDependencies,
  type RegisterProjectBoardCreateIpcDependencies,
  type RegisterProjectBoardDefaultsIpcDependencies,
  type RegisterProjectBoardDeferIpcDependencies,
  type RegisterProjectBoardDogfoodIpcDependencies,
  type RegisterProjectBoardFeedbackIpcDependencies,
  type RegisterProjectBoardGitIpcDependencies,
  type RegisterProjectBoardKickoffIpcDependencies,
  type RegisterProjectBoardLifecycleIpcDependencies,
  type RegisterProjectBoardPauseIpcDependencies,
  type RegisterProjectBoardProposalIpcDependencies,
  type RegisterProjectBoardPromoteIpcDependencies,
  type RegisterProjectBoardProofIpcDependencies,
  type RegisterProjectBoardSourceRefreshIpcDependencies,
  type RegisterProjectBoardSourceQuestionIpcDependencies,
  type RegisterProjectBoardSynthesisRefinementIpcDependencies,
  type RegisterProjectBoardSynthesisRetryIpcDependencies,
} from "./registerProjectBoardIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

interface FakeHost {
  id: string;
}

describe("registerProjectBoardCreateIpc", () => {
  it("registers the project-board create channels", () => {
    const { handlers } = registerCreateWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardCreateIpcChannels]);
  });

  it("parses and dispatches project-board create input", async () => {
    const { deps, invoke, state } = registerCreateWithFakes();

    await expect(
      invoke("project-board:create", {
        projectId: "project-1",
        title: " New board ",
        summary: " Use the existing workspace. ",
      }),
    ).resolves.toBe(state);

    expect(deps.createProjectBoard).toHaveBeenCalledWith({
      projectId: "project-1",
      title: "New board",
      summary: "Use the existing workspace.",
    } satisfies CreateProjectBoardInput);
  });

  it("rejects invalid create input before dispatch", async () => {
    const { deps, invoke } = registerCreateWithFakes();

    await expect(invoke("project-board:create", { projectId: "", title: "New board" })).rejects.toThrow();
    expect(deps.createProjectBoard).not.toHaveBeenCalled();
  });
});

describe("registerProjectBoardLifecycleIpc", () => {
  it("registers the project-board lifecycle channels", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardLifecycleIpcChannels]);
  });

  it("parses and dispatches project-board status updates", async () => {
    const { deps, host, invoke, state } = registerWithFakes();

    await expect(invoke("project-board:update-status", { boardId: "board-1", status: "paused" })).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForProjectBoard).toHaveBeenCalledWith("board-1");
    expect(deps.updateProjectBoardStatus).toHaveBeenCalledWith(host, { boardId: "board-1", status: "paused" } satisfies UpdateProjectBoardStatusInput);
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host);
  });

  it("rejects invalid lifecycle input before resolving a host", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("project-board:update-status", { boardId: "board-1", status: "missing" })).rejects.toThrow();
    expect(deps.requireProjectRuntimeHostForProjectBoard).not.toHaveBeenCalled();
    expect(deps.updateProjectBoardStatus).not.toHaveBeenCalled();
  });
});

describe("registerProjectBoardGitIpc", () => {
  it("registers the project-board Git channels", () => {
    const { handlers } = registerGitWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardGitIpcChannels]);
  });

  it("parses and dispatches Git commit input", async () => {
    const { deps, host, invoke, status } = registerGitWithFakes();

    await expect(invoke("project-board:git-commit", { boardId: "board-1", message: " Sync board " })).resolves.toBe(status);

    expect(deps.requireProjectRuntimeHostForProjectBoard).toHaveBeenCalledWith("board-1");
    expect(deps.commitProjectBoardGitArtifacts).toHaveBeenCalledWith(host, { boardId: "board-1", message: "Sync board" });
  });

  it("rejects invalid projection resolutions before resolving a host", async () => {
    const { deps, invoke } = registerGitWithFakes();

    await expect(
      invoke("project-board:git-apply-pulled", {
        boardId: "board-1",
        resolutions: [{ resolution: "apply_pulled" }],
      }),
    ).rejects.toThrow();
    expect(deps.requireProjectRuntimeHostForProjectBoard).not.toHaveBeenCalled();
    expect(deps.applyProjectBoardGitProjection).not.toHaveBeenCalled();
  });
});

describe("registerProjectBoardCardIpc", () => {
  it("registers the project-board card channels", () => {
    const { handlers } = registerCardWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardCardIpcChannels]);
  });

  it("schedules auto-dispatch when ready cards create local tasks", async () => {
    const { deps, host, invoke, state } = registerCardWithFakes();

    await expect(invoke("project-board:create-ready-tasks", { boardId: "board-1" })).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForProjectBoard).toHaveBeenCalledWith("board-1");
    expect(deps.createReadyProjectBoardTasks).toHaveBeenCalledWith(host, { boardId: "board-1" } satisfies CreateReadyProjectBoardTasksInput);
    expect(deps.scheduleAutoDispatch).toHaveBeenCalledWith(host);
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
  });

  it("switches to the copied thread after copying a project-board session", async () => {
    const { deps, host, invoke, state } = registerCardWithFakes();

    await expect(invoke("project-board:copy-session-to-thread", { cardId: "card-1", runId: "run-1" })).resolves.toBe(state);

    expect(deps.copyProjectBoardSessionToThread).toHaveBeenCalledWith(host, { cardId: "card-1", runId: "run-1" });
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(host, "thread-copy");
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "thread-copy");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host, "thread-copy");
  });

  it("rejects invalid card updates before resolving a host", async () => {
    const { deps, invoke } = registerCardWithFakes();

    await expect(invoke("project-board:update-card-candidate", { cardId: "card-1", candidateStatus: "missing" })).rejects.toThrow();
    expect(deps.requireProjectRuntimeHostForProjectBoardCard).not.toHaveBeenCalled();
    expect(deps.updateProjectBoardCardCandidate).not.toHaveBeenCalled();
  });
});

describe("registerProjectBoardProofIpc", () => {
  it("registers the project-board proof channels", () => {
    const { handlers } = registerProofWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardProofIpcChannels]);
  });

  it("schedules auto-dispatch when approving a card creates a local task", async () => {
    const { deps, host, invoke, state } = registerProofWithFakes();

    await expect(invoke("project-board:approve-card", { cardId: "card-1" })).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForProjectBoardCard).toHaveBeenCalledWith("card-1");
    expect(deps.approveProjectBoardCard).toHaveBeenCalledWith(host, { cardId: "card-1" } satisfies ApproveProjectBoardCardInput);
    expect(deps.scheduleAutoDispatch).toHaveBeenCalledWith(host);
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
  });

  it("schedules auto-dispatch when retrying a proof decision on a local task card", async () => {
    const { deps, host, invoke, state } = registerProofWithFakes();

    await expect(invoke("project-board:resolve-proof-decision", { cardId: "card-1", action: "retry" })).resolves.toBe(state);

    expect(deps.resolveProjectBoardProofDecision).toHaveBeenCalledWith(
      host,
      { cardId: "card-1", action: "retry" } satisfies ResolveProjectBoardProofDecisionInput,
    );
    expect(deps.scheduleAutoDispatch).toHaveBeenCalledWith(host);
  });

  it("passes rerun proof progress through project state emission", async () => {
    const { deps, host, invoke, state } = registerProofWithFakes();

    await expect(invoke("project-board:rerun-proof", { cardId: "card-1", reason: " Try again " })).resolves.toBe(state);

    expect(deps.rerunProjectBoardProof).toHaveBeenCalledWith(host, { cardId: "card-1", reason: "Try again" }, expect.any(Function));
    const onProgress = vi.mocked(deps.rerunProjectBoardProof).mock.calls[0]?.[2];
    expect(onProgress).toBeDefined();
    onProgress?.();
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
  });

  it("rejects invalid proof suggestions before resolving a host", async () => {
    const { deps, invoke } = registerProofWithFakes();

    await expect(invoke("project-board:suggest-proof", { boardId: "board-1", cardIds: Array.from({ length: 13 }, (_, index) => `card-${index}`) })).rejects.toThrow();
    expect(deps.requireProjectRuntimeHostForProjectBoard).not.toHaveBeenCalled();
    expect(deps.suggestProjectBoardProof).not.toHaveBeenCalled();
  });
});

describe("registerProjectBoardFeedbackIpc", () => {
  it("registers the project-board feedback channels", () => {
    const { handlers } = registerFeedbackWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardFeedbackIpcChannels]);
  });

  it("applies decision impact feedback through the card host", async () => {
    const { deps, host, invoke, state } = registerFeedbackWithFakes();

    await expect(
      invoke("project-board:apply-decision-impact-feedback", {
        cardId: "card-1",
        question: " What changed? ",
        answer: " Use the narrow helper. ",
      }),
    ).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForProjectBoardCard).toHaveBeenCalledWith("card-1");
    expect(deps.applyProjectBoardDecisionImpactFeedback).toHaveBeenCalledWith(
      host,
      {
        cardId: "card-1",
        question: "What changed?",
        answer: "Use the narrow helper.",
      } satisfies ApplyProjectBoardDecisionImpactFeedbackInput,
    );
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
  });

  it("regenerates source drafts through the board host", async () => {
    const { deps, host, invoke, state } = registerFeedbackWithFakes();

    await expect(invoke("project-board:regenerate-source-drafts", { boardId: "board-1", sourceIds: ["source-1"] })).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForProjectBoard).toHaveBeenCalledWith("board-1");
    expect(deps.regenerateProjectBoardSourceDrafts).toHaveBeenCalledWith(
      host,
      { boardId: "board-1", sourceIds: ["source-1"] } satisfies RegenerateProjectBoardSourceDraftsInput,
    );
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
  });

  it("rejects invalid source draft refresh input before resolving a host", async () => {
    const { deps, invoke } = registerFeedbackWithFakes();

    await expect(
      invoke("project-board:refresh-source-drafts", {
        boardId: "board-1",
        sourceIds: Array.from({ length: 101 }, (_, index) => `source-${index}`),
      }),
    ).rejects.toThrow();
    expect(deps.requireProjectRuntimeHostForProjectBoard).not.toHaveBeenCalled();
    expect(deps.refreshProjectBoardSourceDrafts).not.toHaveBeenCalled();
  });
});

describe("registerProjectBoardDefaultsIpc", () => {
  it("registers the project-board defaults channels", () => {
    const { handlers } = registerDefaultsWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardDefaultsIpcChannels]);
  });

  it("suggests clarification defaults and emits project state afterward", async () => {
    const { deps, host, invoke, state } = registerDefaultsWithFakes();

    await expect(invoke("project-board:suggest-clarification-defaults", { boardId: "board-1", cardIds: ["card-1"] })).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForProjectBoard).toHaveBeenCalledWith("board-1");
    expect(deps.suggestProjectBoardClarificationDefaults).toHaveBeenCalledWith(
      host,
      { boardId: "board-1", cardIds: ["card-1"] } satisfies SuggestProjectBoardClarificationDefaultsInput,
    );
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
  });

  it("suggests kickoff defaults without adding a post-helper project state emit", async () => {
    const { deps, host, invoke, state } = registerDefaultsWithFakes();

    await expect(invoke("project-board:suggest-kickoff-defaults", { boardId: "board-1", questionIds: ["question-1"] })).resolves.toBe(state);

    expect(deps.suggestProjectBoardKickoffDefaults).toHaveBeenCalledWith(
      host,
      { boardId: "board-1", questionIds: ["question-1"] } satisfies SuggestProjectBoardKickoffDefaultsInput,
    );
    expect(deps.emitProjectStateIfActive).not.toHaveBeenCalled();
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host);
  });

  it("rejects invalid kickoff defaults input before resolving a host", async () => {
    const { deps, invoke } = registerDefaultsWithFakes();

    await expect(
      invoke("project-board:suggest-kickoff-defaults", {
        boardId: "board-1",
        questionIds: Array.from({ length: 21 }, (_, index) => `question-${index}`),
      }),
    ).rejects.toThrow();
    expect(deps.requireProjectRuntimeHostForProjectBoard).not.toHaveBeenCalled();
    expect(deps.suggestProjectBoardKickoffDefaults).not.toHaveBeenCalled();
  });
});

describe("registerProjectBoardProposalIpc", () => {
  it("registers the project-board proposal channels", () => {
    const { handlers } = registerProposalWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardProposalIpcChannels]);
  });

  it("answers synthesis proposal questions through the proposal host", async () => {
    const { deps, host, invoke, state } = registerProposalWithFakes();

    await expect(
      invoke("project-board:answer-synthesis-proposal-question", {
        proposalId: "proposal-1",
        questionIndex: 2,
        answer: " Keep the source scope. ",
      }),
    ).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForProjectBoardSynthesisProposal).toHaveBeenCalledWith("proposal-1");
    expect(deps.answerProjectBoardSynthesisProposalQuestion).toHaveBeenCalledWith(
      host,
      {
        proposalId: "proposal-1",
        questionIndex: 2,
        answer: "Keep the source scope.",
      } satisfies AnswerProjectBoardSynthesisProposalQuestionInput,
    );
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
  });

  it("applies synthesis proposals and emits project state", async () => {
    const { deps, host, invoke, state } = registerProposalWithFakes();

    await expect(invoke("project-board:apply-synthesis-proposal", { proposalId: "proposal-1", replaceExistingDraft: true })).resolves.toBe(state);

    expect(deps.applyProjectBoardSynthesisProposal).toHaveBeenCalledWith(
      host,
      { proposalId: "proposal-1", replaceExistingDraft: true } satisfies ApplyProjectBoardSynthesisProposalInput,
    );
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
  });

  it("rejects invalid proposal card reviews before resolving a host", async () => {
    const { deps, invoke } = registerProposalWithFakes();

    await expect(
      invoke("project-board:review-synthesis-proposal-card", {
        proposalId: "proposal-1",
        sourceId: "source-1",
        reviewStatus: "missing",
      }),
    ).rejects.toThrow();
    expect(deps.requireProjectRuntimeHostForProjectBoardSynthesisProposal).not.toHaveBeenCalled();
    expect(deps.reviewProjectBoardSynthesisProposalCard).not.toHaveBeenCalled();
  });

  it("trims review reasons before dispatch", async () => {
    const { deps, host, invoke } = registerProposalWithFakes();

    await invoke("project-board:review-synthesis-proposal-card", {
      proposalId: "proposal-1",
      sourceId: " source-1 ",
      reviewStatus: "merged",
      reason: " Combine with the existing card. ",
      mergeTargetCardId: " card-2 ",
    });

    expect(deps.reviewProjectBoardSynthesisProposalCard).toHaveBeenCalledWith(
      host,
      {
        proposalId: "proposal-1",
        sourceId: "source-1",
        reviewStatus: "merged",
        reason: "Combine with the existing card.",
        mergeTargetCardId: "card-2",
      } satisfies ReviewProjectBoardSynthesisProposalCardInput,
    );
  });
});

describe("registerProjectBoardSourceQuestionIpc", () => {
  it("registers the project-board source/question channels", () => {
    const { handlers } = registerSourceQuestionWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardSourceQuestionIpcChannels]);
  });

  it("updates project-board sources through the source host", async () => {
    const { deps, host, invoke, state } = registerSourceQuestionWithFakes();

    await expect(invoke("project-board:update-source", { sourceId: "source-1", kind: "markdown", includeInSynthesis: false })).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForProjectBoardSource).toHaveBeenCalledWith("source-1");
    expect(deps.updateProjectBoardSource).toHaveBeenCalledWith(
      host,
      { sourceId: "source-1", kind: "markdown", includeInSynthesis: false } satisfies UpdateProjectBoardSourceInput,
    );
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
  });

  it("answers project-board questions through the question host", async () => {
    const { deps, host, invoke, state } = registerSourceQuestionWithFakes();

    await expect(invoke("project-board:answer-question", { questionId: "question-1", answer: " Ship the narrow slice. " })).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForProjectBoardQuestion).toHaveBeenCalledWith("question-1");
    expect(deps.answerProjectBoardQuestion).toHaveBeenCalledWith(
      host,
      { questionId: "question-1", answer: "Ship the narrow slice." } satisfies AnswerProjectBoardQuestionInput,
    );
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
  });

  it("rejects invalid source updates before resolving a host", async () => {
    const { deps, invoke } = registerSourceQuestionWithFakes();

    await expect(invoke("project-board:update-source", { sourceId: "source-1", kind: "missing" })).rejects.toThrow();
    expect(deps.requireProjectRuntimeHostForProjectBoardSource).not.toHaveBeenCalled();
    expect(deps.updateProjectBoardSource).not.toHaveBeenCalled();
  });
});

describe("registerProjectBoardPromoteIpc", () => {
  it("registers the project-board promote channels", () => {
    const { handlers } = registerPromoteWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardPromoteIpcChannels]);
  });

  it("guards and promotes planner plans through the artifact host", async () => {
    const { deps, host, invoke, state } = registerPromoteWithFakes();

    await expect(invoke("project-board:promote-plan", { artifactId: "artifact-1" })).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForPlannerPlanArtifact).toHaveBeenCalledWith("artifact-1");
    expect(deps.assertProjectBoardMutationAllowedForActiveThread).toHaveBeenCalledWith(host, "add a plan to a project board");
    expect(deps.promotePlannerPlanToBoard).toHaveBeenCalledWith(host, { artifactId: "artifact-1" } satisfies PromotePlannerPlanToBoardInput);
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host);
  });

  it("rejects invalid promote input before resolving a host", async () => {
    const { deps, invoke } = registerPromoteWithFakes();

    await expect(invoke("project-board:promote-plan", { artifactId: "" })).rejects.toThrow();
    expect(deps.requireProjectRuntimeHostForPlannerPlanArtifact).not.toHaveBeenCalled();
    expect(deps.promotePlannerPlanToBoard).not.toHaveBeenCalled();
  });
});

describe("registerProjectBoardDeferIpc", () => {
  it("registers the project-board defer channels", () => {
    const { handlers } = registerDeferWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardDeferIpcChannels]);
  });

  it("defers failed synthesis sections through the board host", async () => {
    const { deps, host, invoke, state } = registerDeferWithFakes();

    await expect(
      invoke("project-board:defer-synthesis-sections", { boardId: "board-1", runId: "run-1", reason: "Try later" }),
    ).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForProjectBoard).toHaveBeenCalledWith("board-1");
    expect(deps.deferProjectBoardSynthesisSections).toHaveBeenCalledWith(host, {
      boardId: "board-1",
      runId: "run-1",
      reason: "Try later",
    } satisfies DeferProjectBoardSynthesisSectionsInput);
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host);
  });

  it("rejects invalid defer input before resolving a host", async () => {
    const { deps, invoke } = registerDeferWithFakes();

    await expect(invoke("project-board:defer-synthesis-sections", { boardId: "", runId: "run-1" })).rejects.toThrow();
    expect(deps.requireProjectRuntimeHostForProjectBoard).not.toHaveBeenCalled();
    expect(deps.deferProjectBoardSynthesisSections).not.toHaveBeenCalled();
  });
});

describe("registerProjectBoardPauseIpc", () => {
  it("registers the project-board pause channels", () => {
    const { handlers } = registerPauseWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardPauseIpcChannels]);
  });

  it("pauses synthesis runs through the board host", async () => {
    const { deps, host, invoke, state } = registerPauseWithFakes();

    await expect(
      invoke("project-board:pause-synthesis", { boardId: "board-1", runId: "run-1", reason: "Need review" }),
    ).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForProjectBoard).toHaveBeenCalledWith("board-1");
    expect(deps.pauseProjectBoardSynthesis).toHaveBeenCalledWith(host, {
      boardId: "board-1",
      runId: "run-1",
      reason: "Need review",
    } satisfies PauseProjectBoardSynthesisInput);
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host);
  });

  it("rejects invalid pause input before resolving a host", async () => {
    const { deps, invoke } = registerPauseWithFakes();

    await expect(invoke("project-board:pause-synthesis", { boardId: "board-1", runId: "" })).rejects.toThrow();
    expect(deps.requireProjectRuntimeHostForProjectBoard).not.toHaveBeenCalled();
    expect(deps.pauseProjectBoardSynthesis).not.toHaveBeenCalled();
  });
});

describe("registerProjectBoardDogfoodIpc", () => {
  it("registers the project-board dogfood channels", () => {
    const { handlers } = registerDogfoodWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardDogfoodIpcChannels]);
  });

  it("guards and seeds semantic-idle dogfood runs through the board host", async () => {
    const { deps, host, invoke, state } = registerDogfoodWithFakes();

    await expect(invoke("project-board:dogfood-seed-semantic-idle-section", { boardId: "board-1" })).resolves.toBe(state);

    expect(deps.requireProjectBoardDogfoodTestHook).toHaveBeenCalledWith("project-board:dogfood-seed-semantic-idle-section");
    expect(deps.requireProjectRuntimeHostForProjectBoard).toHaveBeenCalledWith("board-1");
    expect(deps.seedProjectBoardSemanticIdleDogfood).toHaveBeenCalledWith(host, {
      boardId: "board-1",
    } satisfies SeedProjectBoardSemanticIdleDogfoodInput);
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host);
  });

  it("checks the dogfood hook before rejecting invalid semantic-idle input", async () => {
    const { deps, invoke } = registerDogfoodWithFakes();

    await expect(invoke("project-board:dogfood-seed-semantic-idle-section", { boardId: "" })).rejects.toThrow();
    expect(deps.requireProjectBoardDogfoodTestHook).toHaveBeenCalledWith("project-board:dogfood-seed-semantic-idle-section");
    expect(deps.requireProjectRuntimeHostForProjectBoard).not.toHaveBeenCalled();
    expect(deps.seedProjectBoardSemanticIdleDogfood).not.toHaveBeenCalled();
  });

  it("guards and seeds proof-judgment dogfood runs through the board host", async () => {
    const { deps, host, invoke, proofResult } = registerDogfoodWithFakes();

    await expect(invoke("project-board:dogfood-seed-proof-judgment", { boardId: "board-1" })).resolves.toBe(proofResult);

    expect(deps.requireProjectBoardDogfoodTestHook).toHaveBeenCalledWith("project-board:dogfood-seed-proof-judgment");
    expect(deps.requireProjectRuntimeHostForProjectBoard).toHaveBeenCalledWith("board-1");
    expect(deps.seedProjectBoardProofJudgmentDogfood).toHaveBeenCalledWith(host, {
      boardId: "board-1",
    } satisfies SeedProjectBoardProofJudgmentDogfoodInput);
  });

  it("checks the dogfood hook before rejecting invalid proof-judgment input", async () => {
    const { deps, invoke } = registerDogfoodWithFakes();

    await expect(invoke("project-board:dogfood-seed-proof-judgment", { boardId: "" })).rejects.toThrow();
    expect(deps.requireProjectBoardDogfoodTestHook).toHaveBeenCalledWith("project-board:dogfood-seed-proof-judgment");
    expect(deps.requireProjectRuntimeHostForProjectBoard).not.toHaveBeenCalled();
    expect(deps.seedProjectBoardProofJudgmentDogfood).not.toHaveBeenCalled();
  });

  it("guards and seeds canonical projection dogfood runs through the board host", async () => {
    const { canonicalResult, deps, host, invoke } = registerDogfoodWithFakes();

    await expect(invoke("project-board:dogfood-seed-canonical-projection", { boardId: "board-1" })).resolves.toBe(canonicalResult);

    expect(deps.requireProjectBoardDogfoodTestHook).toHaveBeenCalledWith("project-board:dogfood-seed-canonical-projection");
    expect(deps.requireProjectRuntimeHostForProjectBoard).toHaveBeenCalledWith("board-1");
    expect(deps.seedProjectBoardCanonicalProjectionDogfood).toHaveBeenCalledWith(host, {
      boardId: "board-1",
    } satisfies SeedProjectBoardCanonicalProjectionDogfoodInput);
  });

  it("checks the dogfood hook before rejecting invalid canonical projection input", async () => {
    const { deps, invoke } = registerDogfoodWithFakes();

    await expect(invoke("project-board:dogfood-seed-canonical-projection", { boardId: "" })).rejects.toThrow();
    expect(deps.requireProjectBoardDogfoodTestHook).toHaveBeenCalledWith("project-board:dogfood-seed-canonical-projection");
    expect(deps.requireProjectRuntimeHostForProjectBoard).not.toHaveBeenCalled();
    expect(deps.seedProjectBoardCanonicalProjectionDogfood).not.toHaveBeenCalled();
  });

  it("guards and seeds deliverable integration dogfood runs through the board host", async () => {
    const { deliverableResult, deps, host, invoke } = registerDogfoodWithFakes();

    await expect(invoke("project-board:dogfood-seed-deliverable-integration", { boardId: "board-1" })).resolves.toBe(deliverableResult);

    expect(deps.requireProjectBoardDogfoodTestHook).toHaveBeenCalledWith("project-board:dogfood-seed-deliverable-integration");
    expect(deps.requireProjectRuntimeHostForProjectBoard).toHaveBeenCalledWith("board-1");
    expect(deps.seedProjectBoardDeliverableIntegrationDogfood).toHaveBeenCalledWith(host, {
      boardId: "board-1",
    } satisfies SeedProjectBoardDeliverableIntegrationDogfoodInput);
  });

  it("checks the dogfood hook before rejecting invalid deliverable integration input", async () => {
    const { deps, invoke } = registerDogfoodWithFakes();

    await expect(invoke("project-board:dogfood-seed-deliverable-integration", { boardId: "" })).rejects.toThrow();
    expect(deps.requireProjectBoardDogfoodTestHook).toHaveBeenCalledWith("project-board:dogfood-seed-deliverable-integration");
    expect(deps.requireProjectRuntimeHostForProjectBoard).not.toHaveBeenCalled();
    expect(deps.seedProjectBoardDeliverableIntegrationDogfood).not.toHaveBeenCalled();
  });
});

describe("registerProjectBoardKickoffIpc", () => {
  it("registers the project-board kickoff channels", () => {
    const { handlers } = registerKickoffWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardKickoffIpcChannels]);
  });

  it("finalizes kickoff through the board host", async () => {
    const { deps, host, invoke, state } = registerKickoffWithFakes();

    await expect(invoke("project-board:finalize-kickoff", { boardId: "board-1" })).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForProjectBoard).toHaveBeenCalledWith("board-1");
    expect(deps.finalizeProjectBoardKickoff).toHaveBeenCalledWith(host, {
      boardId: "board-1",
    } satisfies FinalizeProjectBoardKickoffInput);
  });

  it("rejects invalid kickoff input before resolving a host", async () => {
    const { deps, invoke } = registerKickoffWithFakes();

    await expect(invoke("project-board:finalize-kickoff", { boardId: "" })).rejects.toThrow();
    expect(deps.requireProjectRuntimeHostForProjectBoard).not.toHaveBeenCalled();
    expect(deps.finalizeProjectBoardKickoff).not.toHaveBeenCalled();
  });
});

describe("registerProjectBoardSourceRefreshIpc", () => {
  it("registers the project-board source refresh channels", () => {
    const { handlers } = registerSourceRefreshWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardSourceRefreshIpcChannels]);
  });

  it("refreshes sources through the board host", async () => {
    const { deps, host, invoke, state } = registerSourceRefreshWithFakes();

    await expect(invoke("project-board:refresh-sources", { boardId: "board-1" })).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForProjectBoard).toHaveBeenCalledWith("board-1");
    expect(deps.refreshProjectBoardSources).toHaveBeenCalledWith(host, {
      boardId: "board-1",
    } satisfies RefreshProjectBoardSourcesInput);
  });

  it("rejects invalid source refresh input before resolving a host", async () => {
    const { deps, invoke } = registerSourceRefreshWithFakes();

    await expect(invoke("project-board:refresh-sources", { boardId: "" })).rejects.toThrow();
    expect(deps.requireProjectRuntimeHostForProjectBoard).not.toHaveBeenCalled();
    expect(deps.refreshProjectBoardSources).not.toHaveBeenCalled();
  });
});

describe("registerProjectBoardSynthesisRetryIpc", () => {
  it("registers the project-board synthesis retry channels", () => {
    const { handlers } = registerSynthesisRetryWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardSynthesisRetryIpcChannels]);
  });

  it("retries synthesis through the board host", async () => {
    const { deps, host, invoke, state } = registerSynthesisRetryWithFakes();

    await expect(
      invoke("project-board:retry-synthesis", { boardId: "board-1", retryOfRunId: "run-1", mode: "failed_sections" }),
    ).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForProjectBoard).toHaveBeenCalledWith("board-1");
    expect(deps.retryProjectBoardSynthesis).toHaveBeenCalledWith(host, {
      boardId: "board-1",
      retryOfRunId: "run-1",
      mode: "failed_sections",
    } satisfies RetryProjectBoardSynthesisInput);
  });

  it("rejects invalid synthesis retry input before resolving a host", async () => {
    const { deps, invoke } = registerSynthesisRetryWithFakes();

    await expect(invoke("project-board:retry-synthesis", { boardId: "board-1", mode: "missing" })).rejects.toThrow();
    expect(deps.requireProjectRuntimeHostForProjectBoard).not.toHaveBeenCalled();
    expect(deps.retryProjectBoardSynthesis).not.toHaveBeenCalled();
  });
});

describe("registerProjectBoardSynthesisRefinementIpc", () => {
  it("registers the project-board synthesis refinement channels", () => {
    const { handlers } = registerSynthesisRefinementWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardSynthesisRefinementIpcChannels]);
  });

  it("refines synthesis through the board host", async () => {
    const { deps, host, invoke, state } = registerSynthesisRefinementWithFakes();

    await expect(
      invoke("project-board:refine-synthesis", {
        boardId: "board-1",
        mode: "source_elaboration",
        sourceIds: ["source-1"],
        objective: " Add cards from the selected source. ",
      }),
    ).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForProjectBoard).toHaveBeenCalledWith("board-1");
    expect(deps.refineProjectBoardSynthesis).toHaveBeenCalledWith(host, {
      boardId: "board-1",
      mode: "source_elaboration",
      sourceIds: ["source-1"],
      objective: "Add cards from the selected source.",
    } satisfies RefineProjectBoardSynthesisInput);
  });

  it("rejects invalid synthesis refinement input before resolving a host", async () => {
    const { deps, invoke } = registerSynthesisRefinementWithFakes();

    await expect(invoke("project-board:refine-synthesis", { boardId: "board-1", mode: "missing" })).rejects.toThrow();
    expect(deps.requireProjectRuntimeHostForProjectBoard).not.toHaveBeenCalled();
    expect(deps.refineProjectBoardSynthesis).not.toHaveBeenCalled();
  });
});

function registerCreateWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const state = { activeThreadId: "thread-1" } as DesktopState;
  const deps: RegisterProjectBoardCreateIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    createProjectBoard: vi.fn(async () => state),
  };
  registerProjectBoardCreateIpc(deps);

  return {
    deps,
    handlers,
    state,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const state = { activeThreadId: "thread-1" } as DesktopState;
  const deps: RegisterProjectBoardLifecycleIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForProjectBoard: vi.fn(() => host),
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => state),
    updateProjectBoardStatus: vi.fn(),
    startProjectBoardRevision: vi.fn(),
    cancelProjectBoardRevision: vi.fn(),
    resetProjectBoard: vi.fn(),
  };
  registerProjectBoardLifecycleIpc(deps);

  return {
    deps,
    handlers,
    host,
    state,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerCardWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const state = { activeThreadId: "thread-copy" } as DesktopState;
  const deps: RegisterProjectBoardCardIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForProjectBoard: vi.fn(() => host),
    requireProjectRuntimeHostForProjectBoardCard: vi.fn(() => host),
    requireProjectRuntimeHostForOrchestrationTask: vi.fn(() => host),
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => state),
    setProjectHostActiveThreadId: vi.fn(),
    resolveProjectBoardSplitDecision: vi.fn(),
    createReadyProjectBoardTasks: vi.fn(() => 2),
    isAutoDispatchEnabled: vi.fn(() => true),
    scheduleAutoDispatch: vi.fn(),
    splitProjectBoardCard: vi.fn(),
    createProjectBoardCard: vi.fn(),
    attachProjectBoardLocalTask: vi.fn(),
    updateProjectBoardCard: vi.fn(),
    updateProjectBoardCardCandidate: vi.fn(),
    resolveProjectBoardCardPiUpdate: vi.fn(),
    addProjectBoardCardRunFeedback: vi.fn(),
    copyProjectBoardSessionToThread: vi.fn(() => ({ id: "thread-copy" })),
  };
  registerProjectBoardCardIpc(deps);

  return {
    deps,
    handlers,
    host,
    state,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerProofWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const state = { activeThreadId: "thread-1" } as DesktopState;
  const cardWithTask = { orchestrationTaskId: "task-1" };
  const deps: RegisterProjectBoardProofIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForProjectBoard: vi.fn(() => host),
    requireProjectRuntimeHostForProjectBoardCard: vi.fn(() => host),
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => state),
    approveProjectBoardCard: vi.fn(() => cardWithTask),
    resolveProjectBoardProofDecision: vi.fn(() => cardWithTask),
    isAutoDispatchEnabled: vi.fn(() => true),
    scheduleAutoDispatch: vi.fn(),
    rerunProjectBoardProof: vi.fn(async () => undefined),
    resolveProjectBoardDeliverableIntegration: vi.fn(async () => undefined),
    recomputeProjectBoardProofCoverage: vi.fn(),
    suggestProjectBoardProof: vi.fn(async () => undefined),
  };
  registerProjectBoardProofIpc(deps);

  return {
    deps,
    handlers,
    host,
    state,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerFeedbackWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const state = { activeThreadId: "thread-1" } as DesktopState;
  const deps: RegisterProjectBoardFeedbackIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForProjectBoard: vi.fn(() => host),
    requireProjectRuntimeHostForProjectBoardCard: vi.fn(() => host),
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => state),
    applyProjectBoardDecisionImpactFeedback: vi.fn(),
    refreshProjectBoardDecisionDrafts: vi.fn(),
    regenerateProjectBoardDecisionDrafts: vi.fn(async () => undefined),
    refreshProjectBoardSourceDrafts: vi.fn(),
    regenerateProjectBoardSourceDrafts: vi.fn(async () => undefined),
    applyProjectBoardSourceImpactFeedback: vi.fn(),
  };
  registerProjectBoardFeedbackIpc(deps);

  return {
    deps,
    handlers,
    host,
    state,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerDefaultsWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const state = { activeThreadId: "thread-1" } as DesktopState;
  const deps: RegisterProjectBoardDefaultsIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForProjectBoard: vi.fn(() => host),
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => state),
    suggestProjectBoardClarificationDefaults: vi.fn(async () => undefined),
    suggestProjectBoardKickoffDefaults: vi.fn(async () => undefined),
  };
  registerProjectBoardDefaultsIpc(deps);

  return {
    deps,
    handlers,
    host,
    state,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerProposalWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const state = { activeThreadId: "thread-1" } as DesktopState;
  const deps: RegisterProjectBoardProposalIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForProjectBoardSynthesisProposal: vi.fn(() => host),
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => state),
    answerProjectBoardSynthesisProposalQuestion: vi.fn(),
    reviewProjectBoardSynthesisProposalCard: vi.fn(),
    applyProjectBoardSynthesisProposal: vi.fn(),
  };
  registerProjectBoardProposalIpc(deps);

  return {
    deps,
    handlers,
    host,
    state,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerSourceQuestionWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const state = { activeThreadId: "thread-1" } as DesktopState;
  const deps: RegisterProjectBoardSourceQuestionIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForProjectBoardSource: vi.fn(() => host),
    requireProjectRuntimeHostForProjectBoardQuestion: vi.fn(() => host),
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => state),
    updateProjectBoardSource: vi.fn(),
    answerProjectBoardQuestion: vi.fn(),
  };
  registerProjectBoardSourceQuestionIpc(deps);

  return {
    deps,
    handlers,
    host,
    state,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerPromoteWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const state = { activeThreadId: "thread-1" } as DesktopState;
  const deps: RegisterProjectBoardPromoteIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForPlannerPlanArtifact: vi.fn(() => host),
    assertProjectBoardMutationAllowedForActiveThread: vi.fn(),
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => state),
    promotePlannerPlanToBoard: vi.fn(),
  };
  registerProjectBoardPromoteIpc(deps);

  return {
    deps,
    handlers,
    host,
    state,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerDeferWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const state = { activeThreadId: "thread-1" } as DesktopState;
  const deps: RegisterProjectBoardDeferIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForProjectBoard: vi.fn(() => host),
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => state),
    deferProjectBoardSynthesisSections: vi.fn(),
  };
  registerProjectBoardDeferIpc(deps);

  return {
    deps,
    handlers,
    host,
    state,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerPauseWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const state = { activeThreadId: "thread-1" } as DesktopState;
  const deps: RegisterProjectBoardPauseIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForProjectBoard: vi.fn(() => host),
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => state),
    pauseProjectBoardSynthesis: vi.fn(),
  };
  registerProjectBoardPauseIpc(deps);

  return {
    deps,
    handlers,
    host,
    state,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerDogfoodWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const state = { activeThreadId: "thread-1" } as DesktopState;
  const canonicalResult = {
    state,
    boardId: "board-1",
    scenarios: [{ name: "stopwatch_retry_cleanup", cardId: "card-1", taskId: "task-1", runIds: ["run-1", "run-2"] }],
  };
  const deliverableResult = {
    state,
    boardId: "board-1",
    scenarios: [{ name: "pomodoro_root_apply", cardId: "card-2", taskId: "task-2", runId: "run-3" }],
  };
  const proofResult = {
    state,
    boardId: "board-1",
    cardId: "card-1",
    runId: "run-1",
    proofReview: { status: "accepted" },
  };
  const deps: RegisterProjectBoardDogfoodIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectBoardDogfoodTestHook: vi.fn(),
    requireProjectRuntimeHostForProjectBoard: vi.fn(() => host),
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => state),
    seedProjectBoardSemanticIdleDogfood: vi.fn(),
    seedProjectBoardProofJudgmentDogfood: vi.fn(async () => proofResult),
    seedProjectBoardCanonicalProjectionDogfood: vi.fn(() => canonicalResult),
    seedProjectBoardDeliverableIntegrationDogfood: vi.fn(async () => deliverableResult),
  };
  registerProjectBoardDogfoodIpc(deps);

  return {
    canonicalResult,
    deliverableResult,
    deps,
    handlers,
    host,
    proofResult,
    state,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerKickoffWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const state = { activeThreadId: "thread-1" } as DesktopState;
  const deps: RegisterProjectBoardKickoffIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForProjectBoard: vi.fn(() => host),
    finalizeProjectBoardKickoff: vi.fn(async () => state),
  };
  registerProjectBoardKickoffIpc(deps);

  return {
    deps,
    handlers,
    host,
    state,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerSourceRefreshWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const state = { activeThreadId: "thread-1" } as DesktopState;
  const deps: RegisterProjectBoardSourceRefreshIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForProjectBoard: vi.fn(() => host),
    refreshProjectBoardSources: vi.fn(async () => state),
  };
  registerProjectBoardSourceRefreshIpc(deps);

  return {
    deps,
    handlers,
    host,
    state,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerSynthesisRetryWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const state = { activeThreadId: "thread-1" } as DesktopState;
  const deps: RegisterProjectBoardSynthesisRetryIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForProjectBoard: vi.fn(() => host),
    retryProjectBoardSynthesis: vi.fn(async () => state),
    abandonProjectBoardSynthesisRun: vi.fn(async () => state),
  };
  registerProjectBoardSynthesisRetryIpc(deps);

  return {
    deps,
    handlers,
    host,
    state,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerSynthesisRefinementWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const state = { activeThreadId: "thread-1" } as DesktopState;
  const deps: RegisterProjectBoardSynthesisRefinementIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForProjectBoard: vi.fn(() => host),
    refineProjectBoardSynthesis: vi.fn(async () => state),
  };
  registerProjectBoardSynthesisRefinementIpc(deps);

  return {
    deps,
    handlers,
    host,
    state,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerGitWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const state = { activeThreadId: "thread-1" } as DesktopState;
  const status: ProjectBoardGitSyncStatus = {
    boardId: "board-1",
    projectRoot: "/workspace",
    artifactRoot: "/workspace/.ambient/board",
    isGitRepository: true,
    hasRemote: true,
    ahead: 0,
    behind: 0,
    dirtyBoardFileCount: 0,
    dirtyBoardFiles: [],
    mode: "git_ready",
  };
  const deps: RegisterProjectBoardGitIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForProjectBoard: vi.fn(() => host),
    getProjectBoardGitSyncStatus: vi.fn(async () => status),
    exportProjectBoardGitArtifacts: vi.fn(async () => status),
    commitProjectBoardGitArtifacts: vi.fn(async () => status),
    pushProjectBoardGitArtifacts: vi.fn(async () => status),
    pullProjectBoardGitArtifacts: vi.fn(async () => status),
    applyProjectBoardGitProjection: vi.fn(async () => state),
    claimProjectBoardGitCard: vi.fn(async () => state),
    releaseProjectBoardGitCardClaim: vi.fn(async () => state),
    expireProjectBoardGitCardClaim: vi.fn(async () => state),
    resolveProjectBoardGitCardClaimConflicts: vi.fn(async () => state),
  };
  registerProjectBoardGitIpc(deps);

  return {
    deps,
    handlers,
    host,
    state,
    status,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}
