import type {
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardStatus,
  ProjectBoardSummary,
} from "../../shared/types";
import {
  type ProjectBoardClarificationDecision,
  projectBoardClarificationDecisions,
} from "../../shared/projectBoardClarificationDecisions";
import { projectBoardDecisionImpactPreview, type ProjectBoardDecisionImpactPreview } from "../../shared/projectBoardDecisionImpact";
import { projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";
import { truncateProjectBoardLedgerText } from "./projectBoardProofEvidenceUiModel";

export type ProjectBoardDecisionQueueRowState = "open" | "answered" | "duplicate";
export type ProjectBoardDecisionQueueRowTone = "warning" | "success" | "neutral";
export type ProjectBoardDecisionQueueAuditFilterId = "all" | "answered" | "duplicate" | "suggested";

export interface ProjectBoardDecisionQueueRow {
  id: string;
  cardId: string;
  cardTitle: string;
  cardStatus: ProjectBoardCardStatus;
  candidateStatus: ProjectBoardCardCandidateStatus;
  decisionId: string;
  canonicalKey: string;
  question: string;
  answer?: string;
  answeredAt?: string;
  suggestedAnswer?: string;
  rationale?: string;
  confidence?: ProjectBoardClarificationDecision["confidence"];
  safeToAccept?: boolean;
  questionKind?: ProjectBoardClarificationDecision["questionKind"];
  sourceLabel: string;
  state: ProjectBoardDecisionQueueRowState;
  duplicateOf?: string;
  impact?: ProjectBoardDecisionImpactPreview;
  actionLabel: string;
  detail: string;
  tone: ProjectBoardDecisionQueueRowTone;
}

export interface ProjectBoardDecisionQueueProposalGap {
  proposalId: string;
  proposalSummary: string;
  questionIndex: number;
  question: string;
  answered: boolean;
  answer?: string;
}

export interface ProjectBoardDecisionQueueAuditFilterItem {
  id: ProjectBoardDecisionQueueAuditFilterId;
  label: string;
  count: number;
}

export interface ProjectBoardDecisionQueueModel {
  rows: ProjectBoardDecisionQueueRow[];
  openRows: ProjectBoardDecisionQueueRow[];
  answeredRows: ProjectBoardDecisionQueueRow[];
  duplicateRows: ProjectBoardDecisionQueueRow[];
  auditRows: ProjectBoardDecisionQueueRow[];
  auditFilterItems: ProjectBoardDecisionQueueAuditFilterItem[];
  proposalGaps: ProjectBoardDecisionQueueProposalGap[];
  openCount: number;
  answeredCount: number;
  duplicateCount: number;
  suggestedAuditCount: number;
  suggestedCount: number;
  missingSuggestionCount: number;
  safeSuggestionCount: number;
  userOwnedCount: number;
  ticketizedImpactCount: number;
  proposalGapCount: number;
  actionCount: number;
  summary: string;
  detail: string;
}

export function projectBoardDecisionQueue(board: ProjectBoardSummary): ProjectBoardDecisionQueueModel {
  const rows = board.cards
    .filter((card) => card.status !== "archived")
    .flatMap((card) => projectBoardDecisionQueueRowsForCard(board, card))
    .sort(compareProjectBoardDecisionQueueRows);
  const openRows = rows.filter((row) => row.state === "open");
  const answeredRows = rows.filter((row) => row.state === "answered");
  const duplicateRows = rows.filter((row) => row.state === "duplicate");
  const auditRows = [...answeredRows, ...duplicateRows];
  const proposalGaps = projectBoardDecisionQueueProposalGaps(board);
  const suggestedCount = openRows.filter((row) => Boolean(row.suggestedAnswer)).length;
  const suggestedAuditCount = auditRows.filter((row) => Boolean(row.suggestedAnswer)).length;
  const missingSuggestionCount = openRows.filter((row) => !row.suggestedAnswer?.trim()).length;
  const safeSuggestionCount = openRows.filter((row) => Boolean(row.suggestedAnswer && row.safeToAccept)).length;
  const userOwnedCount = openRows.filter((row) => row.questionKind === "user_preference" || row.questionKind === "external_constraint").length;
  const ticketizedImpactCount = openRows.filter((row) => row.impact?.readyFeedbackCount).length;
  const actionCount = openRows.length + proposalGaps.filter((gap) => !gap.answered).length;
  const auditFilterItems = ([
    { id: "all", label: "All audit", count: auditRows.length },
    { id: "answered", label: "Answered", count: answeredRows.length },
    { id: "duplicate", label: "Duplicates", count: duplicateRows.length },
    { id: "suggested", label: "Suggestion trail", count: suggestedAuditCount },
  ] satisfies ProjectBoardDecisionQueueAuditFilterItem[]).filter((item) => item.id === "all" || item.count > 0);
  return {
    rows,
    openRows,
    answeredRows,
    duplicateRows,
    auditRows,
    auditFilterItems,
    proposalGaps,
    openCount: openRows.length,
    answeredCount: answeredRows.length,
    duplicateCount: duplicateRows.length,
    suggestedAuditCount,
    suggestedCount,
    missingSuggestionCount,
    safeSuggestionCount,
    userOwnedCount,
    ticketizedImpactCount,
    proposalGapCount: proposalGaps.filter((gap) => !gap.answered).length,
    actionCount,
    summary:
      actionCount > 0
        ? `${actionCount} decision${actionCount === 1 ? "" : "s"} need PM attention before smooth ticketization`
        : "No open PM decisions are blocking ticketization",
    detail:
      actionCount > 0
        ? `${openRows.length} card clarification gate${openRows.length === 1 ? "" : "s"} and ${proposalGaps.filter((gap) => !gap.answered).length} charter/proposal gap${
            proposalGaps.filter((gap) => !gap.answered).length === 1 ? "" : "s"
          } are open. Answer once, then refresh affected drafts or create additive run feedback when needed.`
        : `${answeredRows.length} answered decision${answeredRows.length === 1 ? "" : "s"} and ${duplicateRows.length} duplicate variant${
            duplicateRows.length === 1 ? "" : "s"
          } remain available for audit.`,
  };
}

function projectBoardDecisionQueueRowsForCard(board: ProjectBoardSummary, card: ProjectBoardCard): ProjectBoardDecisionQueueRow[] {
  const decisions = projectBoardClarificationDecisions({
    clarificationDecisions: card.clarificationDecisions,
    clarificationQuestions: card.clarificationQuestions,
    clarificationSuggestions: card.clarificationSuggestions,
    clarificationAnswers: card.clarificationAnswers,
    description: card.description,
    acceptanceCriteria: card.acceptanceCriteria,
    // Synthesis cards carry questions through the structured clarification channel;
    // their prose is full of technical "?" usage (URLs, optional fields) and is never mined.
    includeInlineQuestions: card.sourceKind !== "board_synthesis",
  });
  return decisions
    .filter((decision) => decision.state === "open" || decision.state === "answered" || decision.state === "duplicate")
    .map((decision): ProjectBoardDecisionQueueRow => {
      const state = decision.state as ProjectBoardDecisionQueueRowState;
      const open = decision.state === "open";
      const impact = open ? projectBoardDecisionImpactPreview(board, { question: decision.question, answeredCardId: card.id }) : undefined;
      return {
        id: `${card.id}:${decision.id}`,
        cardId: card.id,
        cardTitle: card.title,
        cardStatus: card.status,
        candidateStatus: card.candidateStatus,
        decisionId: decision.id,
        canonicalKey: decision.canonicalKey,
        question: decision.question,
        answer: decision.answer,
        answeredAt: decision.answeredAt,
        suggestedAnswer: decision.suggestedAnswer,
        rationale: decision.rationale,
        confidence: decision.confidence,
        safeToAccept: decision.safeToAccept,
        questionKind: decision.questionKind,
        sourceLabel: projectBoardDecisionSourceLabel(decision.source),
        state,
        duplicateOf: decision.duplicateOf,
        impact,
        actionLabel: projectBoardDecisionQueueActionLabel(card, decision, impact),
        detail: projectBoardDecisionQueueRowDetail(card, decision, impact),
        tone: state === "open" ? "warning" : state === "answered" ? "success" : "neutral",
      };
    });
}

function projectBoardDecisionQueueProposalGaps(board: ProjectBoardSummary): ProjectBoardDecisionQueueProposalGap[] {
  const proposal = (board.proposals ?? []).find((candidate) => candidate.status === "pending") ?? board.proposals?.[0];
  if (!proposal) return [];
  return proposal.questions.map((question, questionIndex) => {
    const answer = proposal.answers.find((candidate) => candidate.questionIndex === questionIndex);
    const cardAnswer = answer?.answer.trim() ? undefined : projectBoardAnsweredCardDecisionForQuestion(board, question);
    return {
      proposalId: proposal.id,
      proposalSummary: proposal.summary || "Pi board proposal",
      questionIndex,
      question,
      answered: Boolean(answer?.answer.trim() || cardAnswer?.trim()),
      answer: answer?.answer ?? cardAnswer,
    };
  });
}

function projectBoardAnsweredCardDecisionForQuestion(board: ProjectBoardSummary, question: string): string | undefined {
  for (const card of board.cards) {
    if (card.status === "archived") continue;
    const decisions = projectBoardClarificationDecisions({
      clarificationDecisions: card.clarificationDecisions,
      clarificationQuestions: card.clarificationQuestions,
      clarificationSuggestions: card.clarificationSuggestions,
      clarificationAnswers: card.clarificationAnswers,
      description: card.description,
      acceptanceCriteria: card.acceptanceCriteria,
      includeInlineQuestions: card.sourceKind !== "board_synthesis",
    });
    const answered = decisions.find((decision) => decision.state === "answered" && decision.answer?.trim() && projectBoardQuestionsAreNearDuplicates(decision.question, question));
    if (answered?.answer?.trim()) return answered.answer;
  }
  return undefined;
}

function projectBoardDecisionQueueActionLabel(
  card: ProjectBoardCard,
  decision: ProjectBoardClarificationDecision,
  impact?: ProjectBoardDecisionImpactPreview,
): string {
  if (decision.state === "answered") return card.orchestrationTaskId ? "Audit answer" : "Answer applied";
  if (decision.state === "duplicate") return "Hidden duplicate";
  if (card.orchestrationTaskId && (impact?.readyFeedbackCount ?? 0) > 0) return "Answer + create feedback";
  if (decision.suggestedAnswer && decision.safeToAccept) return "Accept suggested default";
  if (decision.suggestedAnswer) return "Review suggestion";
  if ((impact?.readyFeedbackCount ?? 0) > 0) return "Answer + create feedback";
  return "Answer decision";
}

function projectBoardDecisionQueueRowDetail(
  card: ProjectBoardCard,
  decision: ProjectBoardClarificationDecision,
  impact?: ProjectBoardDecisionImpactPreview,
): string {
  if (decision.state === "answered") {
    return decision.answer
      ? `Answered${decision.answeredAt ? ` ${decision.answeredAt.slice(0, 10)}` : ""}: ${truncateProjectBoardLedgerText(decision.answer, 160)}`
      : "Answered and retained for audit.";
  }
  if (decision.state === "duplicate") {
    return decision.duplicateOf
      ? `Duplicate of ${decision.duplicateOf}; hidden from open gates but retained for audit.`
      : "Duplicate clarification variant hidden from open gates.";
  }
  const parts = [
    decision.suggestedAnswer
      ? decision.safeToAccept
        ? `Expert default available: ${truncateProjectBoardLedgerText(decision.suggestedAnswer, 140)}`
        : `Suggestion needs PM review: ${truncateProjectBoardLedgerText(decision.suggestedAnswer, 140)}`
      : "",
    impact?.visible ? impact.detail : "",
    card.orchestrationTaskId ? "Ticketized card: apply changes as additive next-run feedback." : "Draft card: answer here, then refresh affected drafts before ticketization if needed.",
  ].filter(Boolean);
  return parts.join(" ");
}

function projectBoardDecisionSourceLabel(source: ProjectBoardClarificationDecision["source"]): string {
  if (source === "answer_history") return "Answered history";
  if (source === "acceptance_criteria") return "Acceptance criteria";
  if (source === "description") return "Card text";
  return "Card question";
}

function compareProjectBoardDecisionQueueRows(left: ProjectBoardDecisionQueueRow, right: ProjectBoardDecisionQueueRow): number {
  const stateRank: Record<ProjectBoardDecisionQueueRowState, number> = { open: 0, answered: 1, duplicate: 2 };
  const state = stateRank[left.state] - stateRank[right.state];
  if (state !== 0) return state;
  const ticketized = Number(left.cardStatus !== "draft") - Number(right.cardStatus !== "draft");
  if (ticketized !== 0) return ticketized;
  const safeSuggestion = Number(Boolean(right.safeToAccept && right.suggestedAnswer)) - Number(Boolean(left.safeToAccept && left.suggestedAnswer));
  if (safeSuggestion !== 0) return safeSuggestion;
  return left.cardTitle.localeCompare(right.cardTitle);
}
