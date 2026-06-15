import { useEffect, useState } from "react";

import type {
  ProjectBoardCard,
  ProjectBoardSummary,
} from "../../shared/types";
import { projectBoardKickoffAnswerState } from "../../shared/projectBoardSynthesisGate";
import type {
  ProjectBoardCardInspectorOptions,
  ProjectBoardCardInspectorRequest,
} from "./ProjectBoardActiveCardDetailViews";
import { projectBoardCardIsDraftInboxCandidate } from "./projectBoardDraftInboxUiModel";
import {
  defaultProjectBoardTab,
  type ProjectBoardTabId,
} from "./projectBoardUiModel";

export type ProjectBoardDraftInspectorMode = "candidate" | "source_picker";

export type ProjectBoardSourceReviewRequest = {
  requestId: number;
  sourceId?: string;
};

export type ProjectBoardWorkspaceNavigationInput = {
  board?: ProjectBoardSummary;
  finalizeBusy: boolean;
};

export type ProjectBoardCardNavigationTarget =
  | {
      kind: "active";
      cardId: string;
      options: ProjectBoardCardInspectorOptions;
      tab: "board";
    }
  | {
      kind: "draft";
      cardId: string;
      draftInspectorMode: "candidate";
      tab: "draft_inbox";
    };

export function projectBoardPendingProposalId(board?: Pick<ProjectBoardSummary, "proposals">): string | undefined {
  return board?.proposals?.find((proposal) => proposal.status === "pending")?.id;
}

export function projectBoardDraftKickoffComplete(board?: Pick<ProjectBoardSummary, "questions" | "status">): boolean {
  return board?.status === "draft" ? projectBoardKickoffAnswerState(board.questions).complete : false;
}

export function projectBoardSelectedDraftCard(
  board: Pick<ProjectBoardSummary, "cards"> | undefined,
  selectedDraftCardId: string | undefined,
): ProjectBoardCard | undefined {
  return board?.cards.find((card) => card.id === selectedDraftCardId);
}

export function projectBoardSelectedActiveCard(
  board: Pick<ProjectBoardSummary, "cards"> | undefined,
  selectedActiveCardId: string | undefined,
): ProjectBoardCard | undefined {
  return board?.cards.find((card) => card.id === selectedActiveCardId && (card.orchestrationTaskId || card.status !== "draft"));
}

export function projectBoardCardNavigationTarget(
  board: Pick<ProjectBoardSummary, "cards"> | undefined,
  cardId: string,
  options: ProjectBoardCardInspectorOptions = { scroll: true },
): ProjectBoardCardNavigationTarget | undefined {
  const card = board?.cards.find((candidate) => candidate.id === cardId);
  if (!card) return undefined;
  if (projectBoardCardIsDraftInboxCandidate(card)) {
    return {
      kind: "draft",
      cardId: card.id,
      draftInspectorMode: "candidate",
      tab: "draft_inbox",
    };
  }
  return {
    kind: "active",
    cardId: card.id,
    options,
    tab: "board",
  };
}

export function projectBoardActiveCardInspectorRequest(
  current: ProjectBoardCardInspectorRequest,
  options: ProjectBoardCardInspectorOptions,
): ProjectBoardCardInspectorRequest {
  if (!options.tab && !options.scroll) return current;
  return {
    requestId: current.requestId + 1,
    tab: options.tab,
    scroll: options.scroll ?? Boolean(options.tab),
  };
}

export function useProjectBoardWorkspaceNavigationController({
  board,
  finalizeBusy,
}: ProjectBoardWorkspaceNavigationInput) {
  const [activeTab, setActiveTab] = useState<ProjectBoardTabId>("board");
  const [selectedDraftCardId, setSelectedDraftCardId] = useState<string | undefined>();
  const [draftInspectorMode, setDraftInspectorMode] = useState<ProjectBoardDraftInspectorMode>("candidate");
  const [selectedActiveCardId, setSelectedActiveCardId] = useState<string | undefined>();
  const [activeCardInspectorRequest, setActiveCardInspectorRequest] = useState<ProjectBoardCardInspectorRequest>({ requestId: 0 });
  const [sourceReviewRequest, setSourceReviewRequest] = useState<ProjectBoardSourceReviewRequest>({ requestId: 0 });

  const selectedDraftCard = projectBoardSelectedDraftCard(board, selectedDraftCardId);
  const selectedActiveCard = projectBoardSelectedActiveCard(board, selectedActiveCardId);
  const pendingProposalId = projectBoardPendingProposalId(board);
  const draftKickoffComplete = projectBoardDraftKickoffComplete(board);

  useEffect(() => {
    if (!board) {
      setActiveTab("board");
      return;
    }
    if (finalizeBusy && board.status === "active") return;
    setActiveTab(defaultProjectBoardTab(board));
  }, [board?.id, board?.status, finalizeBusy]);

  useEffect(() => {
    if (pendingProposalId && (board?.status !== "draft" || draftKickoffComplete)) setActiveTab("decisions");
  }, [board?.status, draftKickoffComplete, pendingProposalId]);

  useEffect(() => {
    if (selectedDraftCardId && !selectedDraftCard) setSelectedDraftCardId(undefined);
  }, [selectedDraftCard, selectedDraftCardId]);

  useEffect(() => {
    if (selectedActiveCardId && !selectedActiveCard) setSelectedActiveCardId(undefined);
  }, [selectedActiveCard, selectedActiveCardId]);

  function selectProjectBoardDraftCard(cardId: string | undefined) {
    setDraftInspectorMode("candidate");
    setSelectedDraftCardId(cardId);
  }

  function revealProjectBoardDraftCard(cardId: string) {
    setActiveTab("draft_inbox");
    setSelectedDraftCardId(cardId);
  }

  function selectProjectBoardActiveCard(cardId: string | undefined, options: ProjectBoardCardInspectorOptions = {}) {
    setSelectedActiveCardId(cardId);
    if (!cardId) return;
    setActiveCardInspectorRequest((current) => projectBoardActiveCardInspectorRequest(current, options));
  }

  function openProjectBoardCardNavigationTarget(target: ProjectBoardCardNavigationTarget | undefined) {
    if (!target) return;
    setActiveTab(target.tab);
    if (target.kind === "draft") {
      setDraftInspectorMode(target.draftInspectorMode);
      setSelectedDraftCardId(target.cardId);
      return;
    }
    selectProjectBoardActiveCard(target.cardId, target.options);
  }

  function openProjectBoardCardInspector(cardId: string, options: ProjectBoardCardInspectorOptions = { scroll: true }) {
    openProjectBoardCardNavigationTarget(projectBoardCardNavigationTarget(board, cardId, options));
  }

  function openProjectBoardInboxDetail(cardId: string) {
    openProjectBoardCardNavigationTarget(projectBoardCardNavigationTarget(board, cardId, { scroll: false }));
  }

  function jumpProjectBoardToBlocker(cardId: string) {
    openProjectBoardCardNavigationTarget(projectBoardCardNavigationTarget(board, cardId, { scroll: true }));
  }

  function openProjectBoardSourcePicker() {
    setActiveTab("draft_inbox");
    setSelectedDraftCardId(undefined);
    setDraftInspectorMode("source_picker");
  }

  function closeProjectBoardSourcePicker() {
    setDraftInspectorMode("candidate");
  }

  function openProjectBoardSourceReview(sourceId?: string) {
    setActiveTab("charter");
    setSourceReviewRequest((current) => ({ requestId: current.requestId + 1, sourceId }));
  }

  return {
    activeCardInspectorRequest,
    activeTab,
    closeProjectBoardSourcePicker,
    draftInspectorMode,
    jumpProjectBoardToBlocker,
    openProjectBoardCardInspector,
    openProjectBoardInboxDetail,
    openProjectBoardSourcePicker,
    openProjectBoardSourceReview,
    revealProjectBoardDraftCard,
    selectProjectBoardActiveCard,
    selectProjectBoardDraftCard,
    selectedActiveCard,
    selectedActiveCardId,
    selectedDraftCard,
    selectedDraftCardId,
    setActiveTab,
    sourceReviewRequest,
  };
}
