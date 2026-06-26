import type {
  ProjectBoardAddCardsObjectiveProvenance,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardClarificationDecision,
  ProjectBoardCardClarificationSuggestion,
  ProjectBoardCardTestPlan,
  ProjectBoardPmReviewGitState,
  ProjectBoardPmReviewReport,
  ProjectBoardSourceAuthorityRole,
  ProjectBoardSourceChangeState,
  ProjectBoardSourceKind,
  ProjectBoardUiMockRole,
} from "../../shared/projectBoardTypes";

export interface ProjectBoardSynthesisSource {
  id?: string;
  kind: ProjectBoardSourceKind;
  sourceKey?: string;
  contentHash?: string;
  title: string;
  summary: string;
  excerpt?: string;
  path?: string;
  threadId?: string;
  artifactId?: string;
  messageId?: string;
  changeState?: ProjectBoardSourceChangeState;
  classificationConfidence?: number;
  authorityRole?: ProjectBoardSourceAuthorityRole;
  includeInSynthesis?: boolean;
  relevance: number;
}

export interface ProjectBoardPmReviewGitContext {
  mode: ProjectBoardPmReviewGitState;
  isGitRepository: boolean;
  hasRemote: boolean;
  branch?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  dirtyBoardFileCount?: number;
  dirtyBoardFiles?: string[];
  projectionValid?: boolean;
  projectionDifferenceCount?: number;
  lastBoardCommit?: { shortHash: string; subject: string; committedAt: string };
  message?: string;
}

export interface ProjectBoardSynthesisCardInput {
  sourceId: string;
  title: string;
  description: string;
  candidateStatus: ProjectBoardCardCandidateStatus;
  priority?: number;
  phase?: string;
  labels: string[];
  blockedBy: string[];
  acceptanceCriteria: string[];
  testPlan: ProjectBoardCardTestPlan;
  sourceRefs: string[];
  clarificationQuestions?: string[];
  clarificationSuggestions?: ProjectBoardCardClarificationSuggestion[];
  clarificationDecisions?: ProjectBoardCardClarificationDecision[];
  objectiveProvenance?: ProjectBoardAddCardsObjectiveProvenance;
  uiMockRole?: ProjectBoardUiMockRole;
  requiresUiMockApproval?: boolean;
}

export interface ProjectBoardSynthesisDraft {
  summary: string;
  goal: string;
  currentState: string;
  targetUser: string;
  qualityBar: string;
  assumptions: string[];
  questions: string[];
  sourceNotes: string[];
  cards: ProjectBoardSynthesisCardInput[];
}

export type ProjectBoardSynthesisRefinementAnswerSource = "charter" | "pm_review" | "card_clarification" | "source_scope" | "manual";

export interface ProjectBoardSynthesisRefinementAnswer {
  question: string;
  answer: string;
  source?: ProjectBoardSynthesisRefinementAnswerSource;
  cardId?: string;
  cardTitle?: string;
}

export interface ProjectBoardSettledClarificationDecision {
  id: string;
  canonicalKey: string;
  question: string;
  answer: string;
  source: ProjectBoardSynthesisRefinementAnswerSource;
  cardId?: string;
  cardTitle?: string;
}

export interface ProjectBoardClarificationQuestionCandidate {
  question: string;
  questionId?: string;
  location?: string;
  cardId?: string;
  cardTitle?: string;
  sourceId?: string;
}

export interface ProjectBoardSettledClarificationReopenViolation {
  question: string;
  questionId?: string;
  location?: string;
  cardId?: string;
  cardTitle?: string;
  sourceId?: string;
  matchedDecisionId: string;
  matchedCanonicalKey: string;
  matchedQuestion: string;
  matchedAnswer: string;
  matchedSource: ProjectBoardSynthesisRefinementAnswerSource;
  matchedCardId?: string;
  matchedCardTitle?: string;
}

export interface ProjectBoardDuplicateClarificationQuestionViolation {
  canonicalKey: string;
  duplicateReason: "question_id" | "canonical_key" | "near_duplicate";
  firstQuestion: string;
  duplicateQuestion: string;
  firstQuestionId?: string;
  duplicateQuestionId?: string;
  firstLocation?: string;
  duplicateLocation?: string;
  firstCardId?: string;
  duplicateCardId?: string;
  firstCardTitle?: string;
  duplicateCardTitle?: string;
  firstSourceId?: string;
  duplicateSourceId?: string;
}

export interface ProjectBoardCardTitleQualityCandidate {
  title: string;
  location?: string;
  cardId?: string;
  sourceId?: string;
}

export interface ProjectBoardCardTitleQualityViolation extends ProjectBoardCardTitleQualityCandidate {
  reason: string;
  guidance: string;
}

export interface ProjectBoardSynthesisRefinementContext {
  previousDraft: ProjectBoardSynthesisDraft;
  answers: ProjectBoardSynthesisRefinementAnswer[];
  /** Set by the caller, which knows which flow it built: "additive" for Add Cards
   * (net-new cards only, duplicate-filtered against the previous draft), "refine" for
   * a normal board revision. When absent, a narrow legacy text fallback applies. */
  mode?: "refine" | "additive";
  settledClarificationDecisions?: ProjectBoardSettledClarificationDecision[];
  pmReviewReport?: ProjectBoardPmReviewReport;
}
