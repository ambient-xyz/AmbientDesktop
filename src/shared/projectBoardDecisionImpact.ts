import type { ProjectBoardCard, ProjectBoardSummary } from "./projectBoardTypes";
import {
  projectBoardClarificationCanonicalKey,
  projectBoardClarificationDecisions,
  type ProjectBoardClarificationDecision,
} from "./projectBoardClarificationDecisions";
import { projectBoardQuestionsAreNearDuplicates } from "./projectBoardQuestionDedupe";

export type ProjectBoardDecisionImpactCardState =
  | "draft_unblocked"
  | "draft_still_blocked"
  | "ready_needs_next_run_feedback"
  | "done_audit_only"
  | "duplicate_hidden";

export interface ProjectBoardDecisionImpactMetric {
  label: string;
  value: string;
  title?: string;
}

export interface ProjectBoardDecisionImpactCard {
  cardId: string;
  title: string;
  status: ProjectBoardCard["status"];
  candidateStatus: ProjectBoardCard["candidateStatus"];
  state: ProjectBoardDecisionImpactCardState;
  openBefore: number;
  openAfter: number;
  matchedQuestions: string[];
  duplicateQuestions: string[];
  recommendedAction: string;
}

export interface ProjectBoardDecisionImpactPreview {
  visible: boolean;
  question: string;
  answer?: string;
  canonicalKey: string;
  answeredCardId?: string;
  affectedCardIds: string[];
  unblockedDraftCount: number;
  stillBlockedDraftCount: number;
  duplicateHiddenCount: number;
  readyFeedbackCount: number;
  auditOnlyCount: number;
  targetedRefreshOptional: boolean;
  modelCallRequired: boolean;
  headline: string;
  detail: string;
  metrics: ProjectBoardDecisionImpactMetric[];
  cards: ProjectBoardDecisionImpactCard[];
  recommendedActions: string[];
}

export function projectBoardDecisionImpactPreview(
  board: Pick<ProjectBoardSummary, "cards"> | undefined,
  input: { question: string; answer?: string; answeredCardId?: string },
): ProjectBoardDecisionImpactPreview {
  const question = input.question.trim();
  const answer = input.answer?.trim() || undefined;
  const canonicalKey = projectBoardClarificationCanonicalKey(question);
  const empty = emptyDecisionImpactPreview({ question, answer, canonicalKey, answeredCardId: input.answeredCardId });
  if (!board || !question) return empty;

  const cards: ProjectBoardDecisionImpactCard[] = [];
  for (const card of board.cards) {
    const decisions = projectBoardClarificationDecisions({
      clarificationDecisions: card.clarificationDecisions,
      clarificationQuestions: card.clarificationQuestions,
      clarificationAnswers: card.clarificationAnswers,
      description: card.description,
      acceptanceCriteria: card.acceptanceCriteria,
      // Synthesis cards carry questions through the structured clarification channel;
      // their prose is full of technical "?" usage (URLs, optional fields) and is never mined.
      includeInlineQuestions: card.sourceKind !== "board_synthesis",
      limit: 20,
    });
    const matches = decisions.filter((decision) => projectBoardDecisionMatchesQuestion(decision, question, canonicalKey));
    if (matches.length === 0) continue;

    const openDecisions = decisions.filter((decision) => decision.state === "open");
    const matchingOpen = matches.filter((decision) => decision.state === "open");
    const matchingDuplicates = matches.filter((decision) => decision.state === "duplicate");
    if (matchingOpen.length === 0 && matchingDuplicates.length === 0) continue;

    const openAfter = Math.max(0, openDecisions.length - matchingOpen.length);
    const duplicateQuestions = uniqueStrings(matchingDuplicates.map((decision) => decision.question));
    const matchedQuestions = uniqueStrings(matchingOpen.map((decision) => decision.question));
    const base = {
      cardId: card.id,
      title: card.title,
      status: card.status,
      candidateStatus: card.candidateStatus,
      openBefore: openDecisions.length,
      openAfter,
      matchedQuestions,
      duplicateQuestions,
    };

    if (card.status === "draft") {
      if (matchingOpen.length > 0) {
        cards.push({
          ...base,
          state: openAfter === 0 ? "draft_unblocked" : "draft_still_blocked",
          recommendedAction:
            openAfter === 0
              ? "Draft gate clears immediately; targeted refresh is optional if the answer should reshape the card text."
              : "One decision clears, but other clarification gates still block this draft.",
        });
        continue;
      }
      cards.push({
        ...base,
        state: "duplicate_hidden",
        recommendedAction: "Duplicate wording is hidden from open gates and kept only for audit.",
      });
      continue;
    }

    if (card.status === "done" || card.status === "archived") {
      cards.push({
        ...base,
        state: "done_audit_only",
        recommendedAction: "Completed work is not reopened automatically; keep this as audit unless proof is explicitly invalidated.",
      });
      continue;
    }

    cards.push({
      ...base,
      state: "ready_needs_next_run_feedback",
      recommendedAction: "Do not rewrite the ticketized card silently; add next-run feedback or explicitly reopen it to draft.",
    });
  }

  const unblockedDraftCount = cards.filter((card) => card.state === "draft_unblocked").length;
  const stillBlockedDraftCount = cards.filter((card) => card.state === "draft_still_blocked").length;
  const duplicateHiddenCount = cards.reduce((total, card) => total + card.duplicateQuestions.length, 0);
  const readyFeedbackCount = cards.filter((card) => card.state === "ready_needs_next_run_feedback").length;
  const auditOnlyCount = cards.filter((card) => card.state === "done_audit_only").length;
  const affectedCardIds = uniqueStrings(cards.map((card) => card.cardId));
  const targetedRefreshOptional = unblockedDraftCount + stillBlockedDraftCount > 0;
  const visible = cards.length > 0;

  return {
    visible,
    question,
    answer,
    canonicalKey,
    answeredCardId: input.answeredCardId,
    affectedCardIds,
    unblockedDraftCount,
    stillBlockedDraftCount,
    duplicateHiddenCount,
    readyFeedbackCount,
    auditOnlyCount,
    targetedRefreshOptional,
    modelCallRequired: false,
    headline: visible ? decisionImpactHeadline(cards.length, unblockedDraftCount, readyFeedbackCount) : "No linked card impact",
    detail: visible
      ? decisionImpactDetail({ unblockedDraftCount, stillBlockedDraftCount, duplicateHiddenCount, readyFeedbackCount, auditOnlyCount })
      : "This answer does not match another open or duplicate clarification on the board.",
    metrics: [
      { label: "Affected", value: String(cards.length), title: "Cards with matching open or duplicate clarification decisions." },
      { label: "Unblocks", value: String(unblockedDraftCount), title: "Draft cards whose last clarification gate clears immediately." },
      { label: "Still blocked", value: String(stillBlockedDraftCount), title: "Draft cards that retain other clarification gates." },
      { label: "Ready feedback", value: String(readyFeedbackCount), title: "Ticketized cards that need additive next-run feedback instead of a silent rewrite." },
      { label: "Model calls", value: "0", title: "Saving the answer and computing this preview does not call Pi." },
    ],
    cards,
    recommendedActions: decisionImpactRecommendedActions({ targetedRefreshOptional, readyFeedbackCount, duplicateHiddenCount }),
  };
}

function emptyDecisionImpactPreview(input: {
  question: string;
  answer?: string;
  canonicalKey: string;
  answeredCardId?: string;
}): ProjectBoardDecisionImpactPreview {
  return {
    visible: false,
    question: input.question,
    answer: input.answer,
    canonicalKey: input.canonicalKey,
    answeredCardId: input.answeredCardId,
    affectedCardIds: [],
    unblockedDraftCount: 0,
    stillBlockedDraftCount: 0,
    duplicateHiddenCount: 0,
    readyFeedbackCount: 0,
    auditOnlyCount: 0,
    targetedRefreshOptional: false,
    modelCallRequired: false,
    headline: "No linked card impact",
    detail: "This answer does not match another open or duplicate clarification on the board.",
    metrics: [
      { label: "Affected", value: "0" },
      { label: "Model calls", value: "0" },
    ],
    cards: [],
    recommendedActions: [],
  };
}

function projectBoardDecisionMatchesQuestion(
  decision: ProjectBoardClarificationDecision,
  question: string,
  canonicalKey: string,
): boolean {
  return decision.canonicalKey === canonicalKey || projectBoardQuestionsAreNearDuplicates(decision.question, question);
}

function decisionImpactHeadline(affectedCount: number, unblockedDraftCount: number, readyFeedbackCount: number): string {
  if (unblockedDraftCount > 0 && readyFeedbackCount > 0) {
    return `${affectedCount} linked cards; ${unblockedDraftCount} draft gates clear, ${readyFeedbackCount} ticketized cards need feedback`;
  }
  if (unblockedDraftCount > 0) return `${unblockedDraftCount} draft gate${unblockedDraftCount === 1 ? "" : "s"} clear immediately`;
  if (readyFeedbackCount > 0) return `${readyFeedbackCount} ticketized card${readyFeedbackCount === 1 ? "" : "s"} need next-run feedback`;
  return `${affectedCount} linked clarification variant${affectedCount === 1 ? "" : "s"} affected`;
}

function decisionImpactDetail(input: {
  unblockedDraftCount: number;
  stillBlockedDraftCount: number;
  duplicateHiddenCount: number;
  readyFeedbackCount: number;
  auditOnlyCount: number;
}): string {
  const parts: string[] = [];
  if (input.unblockedDraftCount > 0) parts.push(`${input.unblockedDraftCount} draft card(s) can leave clarification review`);
  if (input.stillBlockedDraftCount > 0) parts.push(`${input.stillBlockedDraftCount} draft card(s) still have other questions`);
  if (input.readyFeedbackCount > 0) parts.push(`${input.readyFeedbackCount} ticketized card(s) need additive next-run feedback`);
  if (input.duplicateHiddenCount > 0) parts.push(`${input.duplicateHiddenCount} duplicate variant(s) collapse out of the open gate`);
  if (input.auditOnlyCount > 0) parts.push(`${input.auditOnlyCount} completed card(s) stay audit-only`);
  return parts.join(". ") + ".";
}

function decisionImpactRecommendedActions(input: {
  targetedRefreshOptional: boolean;
  readyFeedbackCount: number;
  duplicateHiddenCount: number;
}): string[] {
  const actions: string[] = ["Save answer and clear duplicate gates"];
  if (input.targetedRefreshOptional) actions.push("Optionally refresh affected draft cards only");
  if (input.readyFeedbackCount > 0) actions.push("Create next-run feedback for ticketized cards");
  if (input.duplicateHiddenCount > 0) actions.push("Keep duplicate variants visible in History for audit");
  return actions;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
