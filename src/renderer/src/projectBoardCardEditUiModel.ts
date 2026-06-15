import type {
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardClarificationAnswer,
  ProjectBoardQuestion,
  ProjectBoardSummary,
  UpdateProjectBoardCardInput,
} from "../../shared/types";
import {
  projectBoardClarificationDecisions,
  projectBoardOpenClarificationQuestions,
  projectBoardStructuredClarificationDecisions,
  type ProjectBoardClarificationDecision,
} from "../../shared/projectBoardClarificationDecisions";
import { projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";
import {
  projectBoardCardHasProofSpec,
  projectBoardRequiresProofSpec,
} from "./projectBoardActiveCardUiModel";
import { projectBoardCardMatchesRef } from "./projectBoardDependencyUiModel";
import {
  projectBoardSourceInclusion,
  projectBoardSourceIsDurablePrimary,
} from "./projectBoardSourceUiModel";

export interface ProjectBoardCardEditDraft {
  title: string;
  description: string;
  candidateStatus: ProjectBoardCardCandidateStatus;
  priority: string;
  phase: string;
  labels: string;
  blockedBy: string;
  acceptanceCriteria: string;
  unitTests: string;
  integrationTests: string;
  visualTests: string;
  manualTests: string;
}

export interface ProjectBoardCandidateClarificationItem {
  label: string;
  detail: string;
  tone: "warning" | "neutral";
}

function projectBoardDraftProofCount(draft: ProjectBoardCardEditDraft): number {
  return (
    parseProjectBoardLines(draft.unitTests).length +
    parseProjectBoardLines(draft.integrationTests).length +
    parseProjectBoardLines(draft.visualTests).length +
    parseProjectBoardLines(draft.manualTests).length
  );
}

export function projectBoardCardEditDraft(card: ProjectBoardCard): ProjectBoardCardEditDraft {
  return {
    title: card.title,
    description: card.description,
    candidateStatus: card.candidateStatus,
    priority: card.priority === undefined ? "" : String(card.priority),
    phase: card.phase ?? "",
    labels: card.labels.join(", "),
    blockedBy: card.blockedBy.join("\n"),
    acceptanceCriteria: card.acceptanceCriteria.join("\n"),
    unitTests: card.testPlan.unit.join("\n"),
    integrationTests: card.testPlan.integration.join("\n"),
    visualTests: card.testPlan.visual.join("\n"),
    manualTests: card.testPlan.manual.join("\n"),
  };
}

export function projectBoardCardEditInput(cardId: string, draft: ProjectBoardCardEditDraft): UpdateProjectBoardCardInput {
  return {
    cardId,
    title: draft.title.trim(),
    description: draft.description.trim(),
    candidateStatus: draft.candidateStatus,
    // Non-numeric input must not silently become priority 0 (top of the board);
    // keep the card's saved priority instead.
    priority: draft.priority.trim()
      ? Number.isNaN(Number.parseInt(draft.priority, 10))
        ? undefined
        : Math.max(0, Math.min(100, Number.parseInt(draft.priority, 10)))
      : null,
    phase: draft.phase.trim() || null,
    labels: parseProjectBoardCsv(draft.labels),
    blockedBy: parseProjectBoardLines(draft.blockedBy, 50),
    acceptanceCriteria: parseProjectBoardLines(draft.acceptanceCriteria, 30),
    testPlan: {
      unit: parseProjectBoardLines(draft.unitTests),
      integration: parseProjectBoardLines(draft.integrationTests),
      visual: parseProjectBoardLines(draft.visualTests),
      manual: parseProjectBoardLines(draft.manualTests),
    },
  };
}

function projectBoardClarificationAnswerSection(question: string, answer: string): string {
  return [`- Q: ${question.trim()}`, `  A: ${answer.trim()}`].join("\n");
}

function projectBoardDescriptionWithClarificationAnswer(description: string, question: string, answer: string): string {
  const trimmed = description.trim();
  const entry = projectBoardClarificationAnswerSection(question, answer);
  if (!trimmed) return `## Clarifications\n${entry}`;
  if (trimmed.includes(entry)) return trimmed;
  if (/^##\s+Clarifications\s*$/im.test(trimmed)) return `${trimmed}\n${entry}`;
  return `${trimmed}\n\n## Clarifications\n${entry}`;
}

function projectBoardClarificationAnswersWithAnswer(
  answers: ProjectBoardCardClarificationAnswer[] | undefined,
  question: string,
  answer: string,
): ProjectBoardCardClarificationAnswer[] {
  const normalizedQuestion = question.trim();
  const nextAnswer = answer.trim();
  const answeredAt = new Date().toISOString();
  const existing = answers ?? [];
  const replacement = { question: normalizedQuestion, answer: nextAnswer, answeredAt };
  const index = existing.findIndex((item) => projectBoardQuestionsAreNearDuplicates(item.question, normalizedQuestion));
  // Keep the newest answers at the cap: slicing from the front discarded the answer
  // the user just typed once a card reached 20 (while the question disappeared).
  if (index < 0) return [...existing, replacement].slice(-20);
  return existing.map((item, candidateIndex) => (candidateIndex === index ? replacement : item)).slice(-20);
}

function projectBoardClarificationDecisionsWithAnswer(card: ProjectBoardCard, question: string, answer: string): ProjectBoardClarificationDecision[] {
  const answeredAt = new Date().toISOString();
  return projectBoardStructuredClarificationDecisions({
    clarificationDecisions: card.clarificationDecisions,
    clarificationQuestions: (card.clarificationQuestions ?? []).filter((candidate) => !projectBoardQuestionsAreNearDuplicates(candidate, question)),
    clarificationSuggestions: card.clarificationSuggestions,
    clarificationAnswers: projectBoardClarificationAnswersWithAnswer(card.clarificationAnswers, question, answer),
    includeInlineQuestions: false,
    createdAt: card.createdAt,
    updatedAt: answeredAt,
    limit: 20,
  });
}

export function projectBoardClarificationAnswerInput(card: ProjectBoardCard, question: string, answer: string): UpdateProjectBoardCardInput {
  const normalizedQuestion = question.trim();
  const normalizedAnswer = answer.trim();
  return {
    cardId: card.id,
    description: projectBoardDescriptionWithClarificationAnswer(card.description, normalizedQuestion, normalizedAnswer).slice(0, 4000),
    clarificationQuestions: (card.clarificationQuestions ?? []).filter((candidate) => !projectBoardQuestionsAreNearDuplicates(candidate, normalizedQuestion)),
    clarificationAnswers: projectBoardClarificationAnswersWithAnswer(card.clarificationAnswers, normalizedQuestion, normalizedAnswer),
    clarificationDecisions: projectBoardClarificationDecisionsWithAnswer(card, normalizedQuestion, normalizedAnswer),
  };
}

export function projectBoardCardEditWithClarificationAnswerInput(
  card: ProjectBoardCard,
  draft: ProjectBoardCardEditDraft,
  question: string,
  answer: string,
): UpdateProjectBoardCardInput {
  const editInput = projectBoardCardEditInput(card.id, draft);
  const updatedCard = {
    ...card,
    description: editInput.description ?? card.description,
    clarificationQuestions: editInput.clarificationQuestions ?? card.clarificationQuestions,
    clarificationAnswers: editInput.clarificationAnswers ?? card.clarificationAnswers,
    clarificationDecisions: editInput.clarificationDecisions ?? card.clarificationDecisions,
  };
  const answerInput = projectBoardClarificationAnswerInput(updatedCard, question, answer);
  return {
    ...editInput,
    ...answerInput,
  };
}

export function projectBoardCardEditHasChanges(card: ProjectBoardCard, draft: ProjectBoardCardEditDraft): boolean {
  return JSON.stringify(projectBoardCardEditInput(card.id, draft)) !== JSON.stringify(projectBoardCardEditInput(card.id, projectBoardCardEditDraft(card)));
}

export function projectBoardKickoffDefaultAnswer(board: ProjectBoardSummary, question: ProjectBoardQuestion, index: number): string {
  if (question.answer?.trim()) return question.answer.trim();
  const text = question.question.toLowerCase();
  const includedSources = board.sources.filter((source) => projectBoardSourceInclusion(source).included);
  const ignoredThreads = board.sources.filter((source) => source.kind === "thread" && !projectBoardSourceInclusion(source).included);
  const durablePlan = includedSources.find(projectBoardSourceIsDurablePrimary);
  const topSources = includedSources.slice(0, 3).map((source) => source.title.trim()).filter(Boolean);
  const title = board.title.trim() || "this project";
  if (text.includes("primary outcome") || text.includes("goal")) {
    return board.charter?.goal?.trim() || `Ship the next coherent, testable increment for ${title}, using the included project sources as the scope boundary.`;
  }
  if (text.includes("source") || text.includes("authority")) {
    const authority = durablePlan
      ? `Treat ${durablePlan.title} as the durable source of truth and use included sources for additive context.`
      : topSources.length > 0
        ? `Use the included source set as authoritative, prioritizing ${topSources.join(", ")}.`
        : "Use the current project source scan as authoritative and call out conflicts before ticketization.";
    return ignoredThreads.length > 0
      ? `${authority} ${ignoredThreads.length} ignored thread${ignoredThreads.length === 1 ? " is" : "s are"} available for inclusion before activation if their context should affect synthesis.`
      : authority;
  }
  if (text.includes("proof") || text.includes("test") || text.includes("quality")) {
    return "Require concrete proof for each executable card: relevant unit or integration checks when code changes behavior, visual/browser proof for UI changes, and a short manual note for judgment-based acceptance.";
  }
  if (text.includes("decision") || text.includes("judgment") || text.includes("ambiguous")) {
    return "Prefer the narrowest implementation that satisfies the accepted source material. When sources conflict or intent is ambiguous, surface the decision before generating or ticketizing more work.";
  }
  if (text.includes("sequence") || text.includes("retry") || text.includes("blocked") || text.includes("incomplete")) {
    return "Sequence foundation and blocking work first, retry transient failures with a small bounded budget, and pause for user review when work is blocked by missing context, permissions, failing proof, or ambiguous product decisions. Do not advance dependent cards until prerequisite proof is complete.";
  }
  if (text.includes("dependency") || text.includes("order")) {
    return "Sequence foundation and blocking work first, keep dependent cards blocked until their prerequisites are done, and avoid dispatching cards whose acceptance proof depends on unfinished parents.";
  }
  if (text.includes("scope") || text.includes("non-goal")) {
    return "Stay inside the included sources and charter answers. Defer speculative enhancements, unrelated refactors, and broad rewrites unless they are required to satisfy an accepted card.";
  }
  return `Use the current source scan and charter context for ${projectBoardQuestionSectionLabelForDefault(index)}; edit this suggested answer before saving if the board should behave differently.`;
}

export function projectBoardKickoffDefaultProviderErrorMessage(error?: string): string | undefined {
  const raw = error?.trim();
  if (!raw) return undefined;
  const normalized = raw.replace(/\s+/g, " ");
  const jsonStart = normalized.indexOf("{");
  if (jsonStart >= 0) {
    const prefix = projectBoardKickoffDefaultProviderErrorPrefix(normalized.slice(0, jsonStart));
    try {
      const parsed = JSON.parse(normalized.slice(jsonStart)) as {
        error?: { message?: unknown; type?: unknown };
        message?: unknown;
        type?: unknown;
      };
      const message = typeof parsed.error?.message === "string" ? parsed.error.message.trim() : typeof parsed.message === "string" ? parsed.message.trim() : "";
      const type = typeof parsed.error?.type === "string" ? parsed.error.type : typeof parsed.type === "string" ? parsed.type : "";
      if (message) {
        const suffix = projectBoardKickoffDefaultProviderErrorTypeLabel(type);
        return projectBoardTruncateProviderError(`${prefix}: ${message}${suffix ? ` (${suffix})` : ""}`);
      }
    } catch {
      // Fall through to the compact raw text when a provider response only looks like JSON.
    }
  }
  return projectBoardTruncateProviderError(normalized);
}

function projectBoardKickoffDefaultProviderErrorPrefix(prefix: string): string {
  const trimmed = prefix.trim().replace(/[:\s]+$/, "");
  const status = trimmed.match(/\((\d{3})\)/)?.[1];
  if (/kickoff default suggestion failed/i.test(trimmed)) {
    return `Ambient/Pi default suggestion failed${status ? ` (HTTP ${status})` : ""}`;
  }
  return trimmed || "Ambient/Pi default suggestion failed";
}

function projectBoardKickoffDefaultProviderErrorTypeLabel(type: string): string {
  if (!type) return "";
  if (type === "insufficient_quota_error") return "quota limit";
  return type.replace(/_/g, " ");
}

function projectBoardTruncateProviderError(message: string): string {
  const maxLength = 600;
  return message.length > maxLength ? `${message.slice(0, maxLength - 3)}...` : message;
}

function projectBoardQuestionSectionLabelForDefault(index: number): string {
  return ["project goal", "source authority", "judgment policy", "proof expectations", "execution policy"][index] ?? "this charter section";
}

export function projectBoardPendingClarificationQuestions(card: ProjectBoardCard): string[] {
  return projectBoardOpenClarificationQuestions({
    clarificationDecisions: card.clarificationDecisions,
    clarificationQuestions: card.clarificationQuestions,
    clarificationSuggestions: card.clarificationSuggestions,
    clarificationAnswers: card.clarificationAnswers,
    includeInlineQuestions: false,
    limit: 8,
  });
}

export function projectBoardPendingClarificationDecisions(card: ProjectBoardCard): ProjectBoardClarificationDecision[] {
  return projectBoardClarificationDecisions({
    clarificationDecisions: card.clarificationDecisions,
    clarificationQuestions: card.clarificationQuestions,
    clarificationSuggestions: card.clarificationSuggestions,
    clarificationAnswers: card.clarificationAnswers,
    includeInlineQuestions: false,
    limit: 8,
  }).filter((decision) => decision.state === "open");
}

export function projectBoardCardHasUnansweredClarifications(card: ProjectBoardCard): boolean {
  return projectBoardPendingClarificationQuestions(card).length > 0;
}

export function projectBoardCardCanMarkReady(card: ProjectBoardCard, board?: ProjectBoardSummary): boolean {
  if (projectBoardCardHasUnansweredClarifications(card)) return false;
  if (board && projectBoardRunFollowUpClosedParent(card, board.cards)) return false;
  return !board || !projectBoardRequiresProofSpec(board) || projectBoardCardHasProofSpec(card);
}

function projectBoardRunFollowUpClosedParent(card: ProjectBoardCard, boardCards: ProjectBoardCard[]): ProjectBoardCard | undefined {
  if (card.sourceKind !== "run_follow_up") return undefined;
  return boardCards.find(
    (candidate) =>
      candidate.id !== card.id &&
      card.blockedBy.some((ref) => projectBoardCardMatchesRef(candidate, ref)) &&
      (candidate.status === "done" || candidate.proofReview?.status === "done" || candidate.candidateStatus === "evidence"),
  );
}

export function projectBoardCandidateClarificationItems(card: ProjectBoardCard, board?: ProjectBoardSummary): ProjectBoardCandidateClarificationItem[] {
  if (card.candidateStatus !== "needs_clarification") return [];

  const items: ProjectBoardCandidateClarificationItem[] = [];
  const decisions = projectBoardClarificationDecisions({
    clarificationDecisions: card.clarificationDecisions,
    clarificationQuestions: card.clarificationQuestions,
    clarificationSuggestions: card.clarificationSuggestions,
    clarificationAnswers: card.clarificationAnswers,
    description: card.description,
    acceptanceCriteria: card.acceptanceCriteria,
    // Synthesis cards carry questions through the structured clarification channel;
    // mining their prose turns URL query strings (GET /api/reviews?bookId=) and
    // optional-field notation (currentPage?) into phantom decision gates.
    includeInlineQuestions: card.sourceKind !== "board_synthesis",
    limit: 12,
  });
  for (const decision of decisions) {
    if (decision.state !== "open") continue;
    const label = decision.source === "card" ? "Clarification question" : "Question from card";
    items.push({ label, detail: decision.question, tone: "warning" });
    if (items.length >= 8) break;
  }
  const hasAnsweredClarification = decisions.some((decision) => decision.state === "answered");
  const blockedByNonQuestionReadinessGate = Boolean(board && !projectBoardCardHasUnansweredClarifications(card) && !projectBoardCardCanMarkReady(card, board));

  if (!card.description.trim()) {
    items.push({
      label: "Scope missing",
      detail: "Add a self-contained description of the work before this can become an executable Local Task.",
      tone: "warning",
    });
  }

  if (card.acceptanceCriteria.length === 0) {
    items.push({
      label: "Acceptance criteria missing",
      detail: "Add at least one concrete done condition so the PM loop can judge completion.",
      tone: "warning",
    });
  }

  if (items.length === 0 && !board && !hasAnsweredClarification && !blockedByNonQuestionReadinessGate) {
    items.push({
      label: "No explicit question attached",
      detail:
        "Pi marked this candidate as needing clarification but did not attach a specific question. Review scope, dependencies, acceptance criteria, and proof expectations; then mark ready when the PM contract is complete.",
      tone: "neutral",
    });
  }

  return items;
}

export function projectBoardCardEditCanSave(card: ProjectBoardCard, draft: ProjectBoardCardEditDraft, board?: ProjectBoardSummary): boolean {
  if (draft.title.trim().length === 0 || !projectBoardCardEditHasChanges(card, draft)) return false;
  if (board && draft.candidateStatus === "ready_to_create" && projectBoardRequiresProofSpec(board) && projectBoardDraftProofCount(draft) === 0) return false;
  return true;
}

export function projectBoardCardCanSplit(card: ProjectBoardCard): boolean {
  return !card.orchestrationTaskId && card.status === "draft" && card.acceptanceCriteria.filter((item) => item.trim()).length >= 2;
}

function parseProjectBoardLines(value: string, limit = 20): string[] {
  return [...new Set(value.split(/\r?\n/g).map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

function parseProjectBoardCsv(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}
