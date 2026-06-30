import { describe, expect, it, vi } from "vitest";

import type { AppProjectBoardActions } from "./AppProjectBoardActions";
import {
  createAppProjectBoardWorkspaceProps,
  createAppProjectBoardWorkspacePropsForApp,
  type AppProjectBoardWorkspacePropsInput,
} from "./AppProjectBoardWorkspaceProps";
import type { ProjectBoardWorkspaceProps } from "./ProjectBoardWorkspaceTypes";

describe("App project-board workspace props", () => {
  it("is hidden until the board route is open with an active, unsuppressed project", () => {
    expect(createAppProjectBoardWorkspaceProps(baseInput({ projectBoardOpen: false }))).toBeUndefined();
    expect(createAppProjectBoardWorkspaceProps(baseInput({ activeProject: undefined }))).toBeUndefined();
    expect(createAppProjectBoardWorkspaceProps(baseInput({ activeThreadSuppressesProjectBoard: true }))).toBeUndefined();
  });

  it("passes state props through and binds active-project actions", () => {
    const actions = projectBoardActions();
    const onClose = vi.fn();
    const project = projectSummary({ id: "project-1" });
    const props = createAppProjectBoardWorkspaceProps(baseInput({
      actions,
      activeProject: project,
      busy: true,
      orchestrationRevision: 7,
      onClose,
      sourceBusy: true,
    }));

    expect(props).toMatchObject({
      project,
      busy: true,
      sourceBusy: true,
      orchestrationRevision: 7,
    });

    props?.onBuild();
    props?.onResetBoard();
    props?.onClose();

    expect(actions.buildProjectBoard).toHaveBeenCalledWith(project);
    expect(actions.requestProjectBoardReset).toHaveBeenCalledWith(project);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps project-board workspace callback payload adapters stable", () => {
    const actions = projectBoardActions();
    const props = createAppProjectBoardWorkspaceProps(baseInput({ actions }));
    const card = { id: "card-1" } as Parameters<ProjectBoardWorkspaceProps["onApproveCard"]>[0];
    const question = { id: "question-1" } as Parameters<ProjectBoardWorkspaceProps["onAnswerQuestion"]>[0];

    props?.onRecomputeProofCoverage("board-1");
    props?.onCreateReadyTasks("board-1");
    props?.onSplitCard("card-1");
    props?.onRefineWithPi("board-1");
    props?.onRefineProposal("board-1", "proposal-1");
    props?.onElaborateSources("board-1", ["source-1"], "Explain sources");
    props?.onAnswerProposalQuestion("proposal-1", 2, "answer");
    props?.onReviewProposalCard("proposal-1", "source-1", "accepted", "good", "card-merge");
    props?.onRetrySynthesis("board-1", "run-1");
    props?.onDeferSynthesisSections("board-1", "run-1");
    props?.onApproveCard(card);
    props?.onResolveProofDecision("card-1", "retry", "Needs stronger proof");
    props?.onResolveSplitDecision("card-1", "approve_split");
    props?.onAnswerQuestion(question, "yes");

    expect(actions.recomputeProjectBoardProofCoverage).toHaveBeenCalledWith({ boardId: "board-1" });
    expect(actions.createReadyProjectBoardTasks).toHaveBeenCalledWith({ boardId: "board-1" });
    expect(actions.splitProjectBoardCard).toHaveBeenCalledWith({ cardId: "card-1" });
    expect(actions.refineProjectBoardWithPi).toHaveBeenCalledWith("board-1", undefined, { mode: "charter_review" });
    expect(actions.refineProjectBoardWithPi).toHaveBeenCalledWith("board-1", "proposal-1", { mode: "charter_review" });
    expect(actions.refineProjectBoardWithPi).toHaveBeenCalledWith("board-1", undefined, {
      mode: "source_elaboration",
      sourceIds: ["source-1"],
      objective: "Explain sources",
    });
    expect(actions.answerProjectBoardSynthesisProposalQuestion).toHaveBeenCalledWith("proposal-1", 2, "answer");
    expect(actions.reviewProjectBoardSynthesisProposalCard).toHaveBeenCalledWith("proposal-1", "source-1", "accepted", "good", "card-merge");
    expect(actions.retryProjectBoardSynthesis).toHaveBeenCalledWith({ boardId: "board-1", retryOfRunId: "run-1", mode: undefined });
    expect(actions.deferProjectBoardSynthesisSections).toHaveBeenCalledWith({ boardId: "board-1", runId: "run-1" });
    expect(actions.approveProjectBoardCard).toHaveBeenCalledWith(card);
    expect(actions.resolveProjectBoardProofDecision).toHaveBeenCalledWith("card-1", "retry", "Needs stronger proof");
    expect(actions.resolveProjectBoardSplitDecision).toHaveBeenCalledWith("card-1", "approve_split");
    expect(actions.answerProjectBoardQuestion).toHaveBeenCalledWith(question, "yes");
  });

  it("maps grouped App owner objects into project-board workspace props", () => {
    const actions = projectBoardActions();
    const setProjectBoardOpen = vi.fn();
    const project = projectSummary({ id: "project-grouped" });
    const props = createAppProjectBoardWorkspacePropsForApp({
      projectBoardControls: {
        activeProject: project,
        activeProjectBoardBusy: true,
        activeThreadSuppressesProjectBoard: false,
        projectBoardActions: actions,
        projectBoardOpen: true,
        setProjectBoardOpen,
      },
      projectShellState: {
        projectBoardSourceBusy: true,
        projectBoardSourceImpactBusy: false,
        projectBoardKickoffDefaultsBusy: true,
        projectBoardRefineBusy: true,
        projectBoardRefineMode: "charter_review",
        projectBoardProposalAnswerBusy: "question-1",
        projectBoardProposalCardReviewBusy: "source-1",
        projectBoardProposalApplyBusy: true,
        projectBoardFinalizeBusy: false,
        projectBoardSynthesisRetryBusy: true,
        projectBoardSynthesisDeferBusy: false,
        projectBoardSynthesisPauseBusy: true,
        projectBoardRevisionBusy: false,
      },
      runActivityState: {
        runActivityLinesByThread: { "thread-1": [] },
        threadRunStatuses: { "thread-1": "streaming" },
      },
      workflowRuntimeState: {
        orchestrationRevision: 42,
      },
    });

    expect(props).toMatchObject({
      project,
      busy: true,
      sourceBusy: true,
      kickoffDefaultsBusy: true,
      refineBusy: true,
      refineMode: "charter_review",
      proposalAnswerBusy: "question-1",
      proposalCardReviewBusy: "source-1",
      proposalApplyBusy: true,
      synthesisRetryBusy: true,
      synthesisPauseBusy: true,
      orchestrationRevision: 42,
      threadRunStatuses: { "thread-1": "streaming" },
    });

    props?.onBuild();
    props?.onClose();

    expect(actions.buildProjectBoard).toHaveBeenCalledWith(project);
    expect(setProjectBoardOpen).toHaveBeenCalledWith(false);
  });
});

function baseInput(input: Partial<AppProjectBoardWorkspacePropsInput> = {}): AppProjectBoardWorkspacePropsInput {
  return {
    actions: projectBoardActions(),
    activeProject: projectSummary(),
    activeThreadSuppressesProjectBoard: false,
    busy: false,
    finalizeBusy: false,
    kickoffDefaultsBusy: false,
    onClose: vi.fn(),
    orchestrationRevision: 1,
    projectBoardOpen: true,
    proposalApplyBusy: false,
    refineBusy: false,
    revisionBusy: false,
    runActivityLinesByThread: {},
    sourceBusy: false,
    sourceImpactBusy: false,
    synthesisDeferBusy: false,
    synthesisPauseBusy: false,
    synthesisRetryBusy: false,
    threadRunStatuses: {},
    ...input,
  };
}

function projectSummary(input: Partial<ProjectBoardWorkspaceProps["project"]> = {}): ProjectBoardWorkspaceProps["project"] {
  return {
    id: "project-1",
    name: "Project",
    path: "/repo",
    ...input,
  } as ProjectBoardWorkspaceProps["project"];
}

function projectBoardActions(): AppProjectBoardActions {
  const calls = new Map<PropertyKey, ReturnType<typeof vi.fn>>();
  return new Proxy({}, {
    get(_, property) {
      const existing = calls.get(property);
      if (existing) return existing;
      const next = vi.fn();
      calls.set(property, next);
      return next;
    },
  }) as AppProjectBoardActions;
}
