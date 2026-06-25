import type { ProjectBoardCharterProjectSummary, ProjectBoardScopeContract } from "../../shared/projectBoardTypes";
import { stableBoardArtifactId, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import { projectBoardSourceIncludedInSynthesis } from "./projectBoardSourceIdentity";
import { buildProjectBoardRenderedCardLedger } from "./projectBoardRenderedCardLedger";
import {
  PROJECT_BOARD_PLANNER_CANDIDATE_STATUS_RULE,
  PROJECT_BOARD_PLANNER_JSON_ONLY_RULE,
  PROJECT_BOARD_PLANNER_LAMBDA_RLM_RULE,
  projectBoardPlannerCandidateCardPromptExample,
  projectBoardPlannerClarificationContractPromptRules,
  projectBoardPlannerPmReviewActivationPromptBlock,
  projectBoardPlannerProofExpectationPromptRules,
  projectBoardPlannerScopeCapabilityPromptRules,
} from "./projectBoardPlannerPromptContracts";
import {
  buildProjectBoardPlanningContract,
  projectBoardScopeContractFromTexts,
  type ProjectBoardPlanningOperation,
  type ProjectBoardPlanningProfileName,
} from "./projectBoardPlanningContract";
import {
  projectBoardPromptBudgetAssessment,
  projectBoardPromptBudgetAssessmentMetadata,
  type ProjectBoardPromptBudgetAssessment,
} from "./projectBoardModelBudgetProfile";
import type { ProjectBoardPlanningSection } from "./projectBoardSectionedPlanning";
import type { ProjectBoardPlannerBatchContinuation } from "./projectBoardPlannerContinuation";
import type { ProjectBoardPlannerWorkspace } from "./projectBoardPlannerWorkspace";
import type { ProjectBoardPlannerSourceQaAnswerInput, ProjectBoardPlannerSourceQaAnswerResult } from "./projectBoardPlannerWorkspaceTools";
import { projectBoardSettledClarificationDecisionLedgerPromptBlock } from "./projectBoardSynthesis";
import {
  isAdditiveProjectBoardRefinement,
  projectBoardCardTitleQualityPromptRules,
  projectBoardScopeContractTexts,
  type ProjectBoardSynthesisDraft,
  type ProjectBoardSynthesisRefinementContext,
  type ProjectBoardSynthesisSource,
} from "./projectBoardSynthesis";

export const DEFAULT_PROJECT_BOARD_SECTION_BATCH_CARD_LIMIT = 3;

export const DEFAULT_PROJECT_BOARD_PLANNER_BATCH_LIMIT = 8;

export interface ProjectBoardPlannerLedgerCompactionTelemetry {
  source: "pi_rlm" | "deterministic_fallback";
  cacheKey: string;
  cacheHit: boolean;
  summary: string;
  renderedCardCount: number;
  omittedRenderedCardCount: number;
  sourceCount: number;
  openQuestionCount: number;
  promptCharCount: number;
  responseCharCount: number;
  rawPromptBudgetStatus: ProjectBoardPromptBudgetAssessment["status"];
  finalPromptCharCount?: number;
  error?: string;
}

export interface ProjectBoardPlannerLedgerCompaction extends ProjectBoardPlannerLedgerCompactionTelemetry {
  renderedCardThemes: string[];
  duplicateAvoidanceNotes: string[];
  remainingCoverage: Array<{ sourceId: string; title?: string; status?: string; summary?: string }>;
  openQuestions: Array<{ questionId: string; cardId?: string; question: string }>;
  dependencyHints: string[];
  citations: string[];
  recentRenderedCards: Array<{ cardId: string; title: string; phase?: string; candidateStatus?: string }>;
}

export type ProjectBoardSectionedContextCompactionReason =
  | "section_prompt_budget"
  | "cumulative_prompt_budget"
  | "section_count_threshold"
  | "repeated_stable_context"
  | "durable_plan_source_authority";

export const PROJECT_BOARD_PLANNER_LEDGER_COMPACTION_SYSTEM_PROMPT = [
  "You are the Ambient project-board planner ledger compaction helper.",
  "Summarize already-rendered cards, source coverage, open questions, dependency hints, and duplicate risks for a later planner batch.",
  "Do not invent project scope, source facts, card ids, dependencies, or user decisions.",
  "Preserve uncertainty and tell the planner when it must use retrieval tools for exact source or duplicate checks.",
  "Return JSON only.",
].join(" ");

export const PROJECT_BOARD_PLANNER_SOURCE_QA_SYSTEM_PROMPT = [
  "You are the Ambient project-board planner source QA tool.",
  "Answer only from the supplied evidence snippets and current question.",
  "Do not invent requirements, priorities, product decisions, or source facts.",
  "If the question asks for a preference, scope choice, or decision not fully settled by evidence, set needs_user_decision true and summarize what the evidence says.",
  "Return JSON only with keys answer, confidence, needs_user_decision, and optional uncertaintyReason/failureKind.",
].join(" ");

export function buildPlannerLedgerCompactionPrompt(input: {
  sources: ProjectBoardSynthesisSource[];
  projectName?: string;
  priorRecords: ProposalJsonlRecordArtifact[];
  rawPromptBudget: ProjectBoardPromptBudgetAssessment;
  batchNumber: number;
  maxBatches: number;
  maxCardsPerBatch: number;
}): string {
  const cards = input.priorRecords.filter((record) => record.type === "candidate_card");
  const questions = input.priorRecords.filter((record) => record.type === "question");
  const coverage = input.priorRecords.filter((record) => record.type === "source_coverage");
  const dependencies = input.priorRecords.filter((record) => record.type === "dependency_edge");
  return [
    "Compact project-board planner context before the next card-batch request.",
    input.projectName ? `Project: ${input.projectName}` : "",
    `Planner batch: ${input.batchNumber}/${input.maxBatches}`,
    `Requested card count: next ${Math.max(1, input.maxCardsPerBatch - 1)}-${input.maxCardsPerBatch} cards`,
    "",
    "Return JSON matching this exact shape:",
    JSON.stringify(
      {
        summary: "compact summary of already-rendered work and remaining planning shape",
        renderedCardThemes: ["theme/workstream already represented"],
        duplicateAvoidanceNotes: ["ids, titles, intents, or source bases the planner must not recreate"],
        remainingCoverage: [{ sourceId: "source-id", title: "source title", status: "uncovered", summary: "what still needs planning" }],
        openQuestions: [{ questionId: "question-id", cardId: "synthesis:card-id", question: "unresolved user decision" }],
        dependencyHints: ["dependency or ordering hint grounded in rendered cards"],
        citations: ["source id/title/path or card id/title used by this summary"],
      },
      null,
      2,
    ),
    "",
    "Rules:",
    "- Summarize only the supplied ledgers. Do not add new cards, product decisions, or source claims.",
    "- Preserve duplicate-avoidance details. The planner will use planner_card_search for exact checks, but your summary should still name high-risk duplicates.",
    "- Preserve open questions and remaining coverage. If a source looks only partially covered, say so.",
    "- Keep the output compact enough to fit as prompt-prefix context for one 2-3 card planner batch.",
    "- Return JSON only. Do not use markdown.",
    "",
    "Raw prompt-budget pressure:",
    JSON.stringify(projectBoardPromptBudgetAssessmentMetadata(input.rawPromptBudget), null, 2),
    "",
    "Source ledger:",
    JSON.stringify(plannerBatchSourceOverview(input.sources), null, 2),
    "",
    "Rendered cards:",
    JSON.stringify(
      cards.map((record) => ({
        cardId: record.sourceId,
        title: record.title,
        phase: record.phase,
        candidateStatus: record.candidateStatus,
        blockedBy: record.blockedBy,
        sourceRefs: record.sourceRefs,
        clarificationQuestionCount: record.clarificationQuestions.length,
      })),
      null,
      2,
    ),
    "",
    "Open questions:",
    JSON.stringify(
      questions.map((record) => ({
        questionId: record.questionId,
        cardId: record.cardId,
        question: record.question,
        required: record.required,
      })),
      null,
      2,
    ),
    "",
    "Source coverage:",
    JSON.stringify(
      coverage.map((record) => ({
        sourceId: record.sourceId,
        range: record.range,
        status: record.status,
        cardIds: record.cardIds,
        note: record.note,
      })),
      null,
      2,
    ),
    "",
    "Dependency edges:",
    JSON.stringify(dependencies, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSectionedContextCompactionPrompt(input: {
  section: ProjectBoardPlanningSection;
  sectionNumber: number;
  sectionCount: number;
  sources: ProjectBoardSynthesisSource[];
  projectName?: string;
  priorRecords: ProposalJsonlRecordArtifact[];
  rawPromptBudget: ProjectBoardPromptBudgetAssessment;
  reason: ProjectBoardSectionedContextCompactionReason;
  maxCardsPerSection: number;
}): string {
  const cards = input.priorRecords.filter((record) => record.type === "candidate_card");
  const questions = input.priorRecords.filter((record) => record.type === "question");
  const coverage = input.priorRecords.filter((record) => record.type === "source_coverage");
  const dependencies = input.priorRecords.filter((record) => record.type === "dependency_edge");
  return [
    "Compact project-board sectioned planning context before the next source-section request.",
    input.projectName ? `Project: ${input.projectName}` : "",
    `Section: ${input.sectionNumber}/${input.sectionCount}`,
    `Section id: ${input.section.id}`,
    `Source id: ${input.section.sourceId}`,
    `Source: ${input.section.sourcePath || input.section.sourceTitle}`,
    `Section heading: ${input.section.heading}`,
    `Section range: ${input.section.range}`,
    `Compaction reason: ${input.reason}`,
    `Requested card count: at most ${input.maxCardsPerSection} cards for this section`,
    "",
    "Return JSON matching this exact shape:",
    JSON.stringify(
      {
        summary: "compact summary of already-rendered work, source authority, and remaining planning shape",
        renderedCardThemes: ["theme/workstream already represented"],
        duplicateAvoidanceNotes: ["ids, titles, intents, or source bases the section planner must not recreate"],
        remainingCoverage: [
          { sourceId: "source-id", title: "source title", status: "uncovered", summary: "what still needs section planning" },
        ],
        openQuestions: [{ questionId: "question-id", cardId: "synthesis:card-id", question: "unresolved user decision" }],
        dependencyHints: ["dependency or ordering hint grounded in rendered cards"],
        citations: ["source id/title/path or card id/title used by this summary"],
      },
      null,
      2,
    ),
    "",
    "Rules:",
    "- Summarize only the supplied ledgers and source inventory. Do not add new cards, product decisions, or source claims.",
    "- Preserve duplicate-avoidance details because later section prompts will omit repeated rendered-card context.",
    "- Preserve source authority. If a durable plan is primary and chats are ignored, say so without reintroducing ignored chat facts as requirements.",
    "- Preserve open questions and remaining coverage. If a source or range is partially covered, keep that uncertainty visible.",
    "- Keep this compact enough to fit as repeated prompt-prefix context for later section calls.",
    "- Return JSON only. Do not use markdown.",
    "",
    "Raw prompt-budget pressure:",
    JSON.stringify(projectBoardPromptBudgetAssessmentMetadata(input.rawPromptBudget), null, 2),
    "",
    "Source ledger:",
    JSON.stringify(plannerBatchSourceOverview(input.sources), null, 2),
    "",
    "Current section identity:",
    JSON.stringify(
      {
        sectionId: input.section.id,
        sourceId: input.section.sourceId,
        sourceKind: input.section.sourceKind,
        sourceTitle: input.section.sourceTitle,
        sourcePath: input.section.sourcePath,
        sourceSummary: input.section.sourceSummary,
        heading: input.section.heading,
        range: input.section.range,
        charCount: input.section.charCount,
      },
      null,
      2,
    ),
    "",
    "Rendered cards:",
    JSON.stringify(
      cards.map((record) => ({
        cardId: record.sourceId,
        title: record.title,
        phase: record.phase,
        candidateStatus: record.candidateStatus,
        blockedBy: record.blockedBy,
        sourceRefs: record.sourceRefs,
        clarificationQuestionCount: record.clarificationQuestions.length,
      })),
      null,
      2,
    ),
    "",
    "Open questions:",
    JSON.stringify(
      questions.map((record) => ({
        questionId: record.questionId,
        cardId: record.cardId,
        question: record.question,
        required: record.required,
      })),
      null,
      2,
    ),
    "",
    "Source coverage:",
    JSON.stringify(
      coverage.map((record) => ({
        sourceId: record.sourceId,
        range: record.range,
        status: record.status,
        cardIds: record.cardIds,
        note: record.note,
      })),
      null,
      2,
    ),
    "",
    "Dependency edges:",
    JSON.stringify(dependencies, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
}

export function normalizePlannerLedgerCompactionText(
  text: string,
  fallback: ProjectBoardPlannerLedgerCompaction,
  metadata: {
    promptCharCount: number;
    responseCharCount: number;
    rawPromptBudget: ProjectBoardPromptBudgetAssessment;
  },
): ProjectBoardPlannerLedgerCompaction {
  try {
    const parsed = parseProjectBoardSynthesisJson(text);
    const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    return {
      ...fallback,
      source: "pi_rlm",
      cacheHit: false,
      summary: compactStringField(record.summary, fallback.summary, 1_500),
      renderedCardThemes: compactStringListField(record.renderedCardThemes, fallback.renderedCardThemes, 12, 300),
      duplicateAvoidanceNotes: compactStringListField(record.duplicateAvoidanceNotes, fallback.duplicateAvoidanceNotes, 16, 360),
      remainingCoverage: compactCoverageListField(record.remainingCoverage, fallback.remainingCoverage),
      openQuestions: compactQuestionListField(record.openQuestions, fallback.openQuestions),
      dependencyHints: compactStringListField(record.dependencyHints, fallback.dependencyHints, 12, 300),
      citations: compactStringListField(record.citations, fallback.citations, 16, 220),
      promptCharCount: metadata.promptCharCount,
      responseCharCount: metadata.responseCharCount,
      rawPromptBudgetStatus: metadata.rawPromptBudget.status,
    };
  } catch (error) {
    return {
      ...fallback,
      promptCharCount: metadata.promptCharCount,
      responseCharCount: metadata.responseCharCount,
      rawPromptBudgetStatus: metadata.rawPromptBudget.status,
      error: errorMessage(error),
    };
  }
}

export function buildPlannerSourceQaPrompt(input: ProjectBoardPlannerSourceQaAnswerInput): string {
  return [
    `Question: ${input.question}`,
    `Answer mode: ${input.answerMode}`,
    `Needs-user-decision hint: ${input.needsUserDecisionHint ? "yes" : "no"}`,
    `Cache key: ${input.cacheKey}`,
    "Evidence snippets:",
    JSON.stringify(
      input.citedSnippets.map((snippet, index) => ({
        index: index + 1,
        snippetId: snippet.snippetId,
        sourceId: snippet.sourceId,
        title: snippet.title,
        range: snippet.range,
        text: snippet.text,
      })),
      null,
      2,
    ),
    "Return JSON shape:",
    JSON.stringify({
      answer: "One concise answer grounded only in the evidence.",
      confidence: 0.74,
      needs_user_decision: false,
      uncertaintyReason: "Omit when not needed.",
    }),
  ].join("\n\n");
}

export function projectBoardSectionedContextCompactionDecision(input: {
  section: ProjectBoardPlanningSection;
  sectionNumber: number;
  sectionCount: number;
  rawPrompt: string;
  rawPromptBudget: ProjectBoardPromptBudgetAssessment;
  cumulativePromptCharCount: number;
  sources: ProjectBoardSynthesisSource[];
}): { compact: boolean; reason?: ProjectBoardSectionedContextCompactionReason } {
  if (input.rawPromptBudget.summarizationRecommended) return { compact: true, reason: "section_prompt_budget" };
  const cumulativeBudget = projectBoardPromptBudgetAssessment({
    promptCharCount: input.cumulativePromptCharCount,
    profile: {
      operation: input.rawPromptBudget.operation,
      modelId: input.rawPromptBudget.modelId,
      contextWindowTokens: input.rawPromptBudget.contextWindowTokens,
      modelMaxOutputTokens: input.rawPromptBudget.contextWindowTokens,
      maxOutputTokens: Math.max(256, input.rawPromptBudget.outputReserveTokens),
      outputReserveTokens: input.rawPromptBudget.outputReserveTokens,
      softPromptBudgetTokens: input.rawPromptBudget.softPromptBudgetTokens,
      summarizationThresholdTokens: input.rawPromptBudget.summarizationThresholdTokens,
      source: "default",
    },
  });
  if (cumulativeBudget.summarizationRecommended && input.sectionNumber > 1) {
    return { compact: true, reason: "cumulative_prompt_budget" };
  }
  if (input.sectionCount > 8 && input.sectionNumber >= 8) return { compact: true, reason: "section_count_threshold" };
  const stableContextChars = Math.max(0, input.rawPrompt.length - input.section.content.length);
  if (input.sectionNumber > 3 && stableContextChars > Math.max(8_000, input.section.content.length * 2)) {
    return { compact: true, reason: "repeated_stable_context" };
  }
  if (
    input.sectionNumber > 2 &&
    hasDurablePlanSource(input.sources) &&
    hasExcludedChatSource(input.sources) &&
    stableContextChars > 6_000
  ) {
    return { compact: true, reason: "durable_plan_source_authority" };
  }
  return { compact: false };
}

function hasDurablePlanSource(sources: ProjectBoardSynthesisSource[]): boolean {
  return sources.some(
    (source) =>
      source.kind === "plan_artifact" &&
      projectBoardSourceIncludedInSynthesis(source) &&
      source.path?.replace(/\\/g, "/").startsWith(".ambient/board/plans/") === true,
  );
}

function hasExcludedChatSource(sources: ProjectBoardSynthesisSource[]): boolean {
  return sources.some((source) => source.kind === "thread" && source.includeInSynthesis === false);
}

export function parsePlannerSourceQaAnswerText(
  text: string,
  input: ProjectBoardPlannerSourceQaAnswerInput,
): ProjectBoardPlannerSourceQaAnswerResult {
  const parsed = parseProjectBoardSynthesisJson(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Planner source QA answer was not a JSON object.");
  }
  const record = parsed as Record<string, unknown>;
  const answer = typeof record.answer === "string" ? record.answer.trim() : "";
  if (!answer) throw new Error("Planner source QA answer was missing answer text.");
  const confidence =
    typeof record.confidence === "number" && Number.isFinite(record.confidence) ? Math.max(0, Math.min(1, record.confidence)) : undefined;
  const needsUserDecision =
    record.needs_user_decision === true ||
    record.needsUserDecision === true ||
    (input.needsUserDecisionHint && record.needs_user_decision !== false);
  const failureKind =
    typeof record.failureKind === "string" ? record.failureKind : typeof record.failure_kind === "string" ? record.failure_kind : undefined;
  return {
    answer,
    ...(confidence === undefined ? {} : { confidence }),
    needs_user_decision: needsUserDecision,
    ...(typeof record.uncertaintyReason === "string" && record.uncertaintyReason.trim()
      ? { uncertaintyReason: record.uncertaintyReason.trim() }
      : typeof record.uncertainty_reason === "string" && record.uncertainty_reason.trim()
        ? { uncertaintyReason: record.uncertainty_reason.trim() }
        : {}),
    ...(failureKind ? { failureKind: failureKind as ProjectBoardPlannerSourceQaAnswerResult["failureKind"] } : {}),
  };
}

export function buildProjectBoardSectionedPlanningPrompt(input: {
  section: ProjectBoardPlanningSection;
  sectionIndex: number;
  sectionCount: number;
  sources: ProjectBoardSynthesisSource[];
  projectName?: string;
  deterministicDraft: ProjectBoardSynthesisDraft;
  refinement?: ProjectBoardSynthesisRefinementContext;
  charterProjectSummary?: ProjectBoardCharterProjectSummary;
  scopeContract?: ProjectBoardScopeContract;
  priorRecords?: ProposalJsonlRecordArtifact[];
  maxCardsPerSection?: number;
  plannerWorkspaceBlock?: string;
  plannerLedgerCompaction?: ProjectBoardPlannerLedgerCompaction;
}): string {
  const maxCardsPerSection = normalizeSectionBatchCardLimit(input.maxCardsPerSection);
  const priorCards = (input.priorRecords ?? [])
    .filter((record) => record.type === "candidate_card")
    .slice(-18)
    .map((record, index) => `${index + 1}. ${record.sourceId}: ${record.title}`)
    .join("\n");
  const answers =
    input.refinement?.answers.map((item, index) => `${index + 1}. Q: ${item.question}\n   A: ${item.answer}`).join("\n") ?? "";
  const sourceOverview = input.plannerLedgerCompaction
    ? input.plannerLedgerCompaction.remainingCoverage
        .slice(0, 18)
        .map(
          (source, index) =>
            `${index + 1}. ${source.sourceId}${source.title ? ` (${source.title})` : ""}${source.status ? ` - ${source.status}` : ""}: ${
              source.summary ?? "No compact summary available."
            }`,
        )
        .join("\n")
    : input.sources
        .filter(projectBoardSourceIncludedInSynthesis)
        .slice(0, 12)
        .map(
          (source, index) =>
            `${index + 1}. ${source.path || source.title} (${source.kind}, relevance ${source.relevance}): ${source.summary}`,
        )
        .join("\n");
  const settledDecisionLedgerBlock = projectBoardSettledClarificationDecisionLedgerPromptBlock(input.refinement);
  const contract = buildProjectBoardPlanningContract({
    operation: "section_elaboration",
    projectName: input.projectName,
    profileName: inferPlanningProfileName(input.sources),
    charter: {
      goal: input.refinement?.previousDraft.goal ?? input.deterministicDraft.goal,
      proofPolicy: input.refinement?.previousDraft.qualityBar ?? input.deterministicDraft.qualityBar,
      decisionPolicy: input.refinement
        ? "Treat the supplied charter and PM Review answers as already settled unless they are incomplete or contradictory."
        : undefined,
      ...(input.charterProjectSummary ? { projectSummary: input.charterProjectSummary } : {}),
    },
    scopeContract:
      input.scopeContract ??
      projectBoardScopeContractFromTexts(projectBoardScopeContractTexts({ sources: input.sources, refinement: input.refinement })),
  });
  return [
    contract.stablePromptHeader,
    "",
    "Plan one section of a project board source corpus.",
    input.projectName ? `Project: ${input.projectName}` : "",
    `Section: ${input.sectionIndex + 1} of ${input.sectionCount}`,
    `Source id: ${input.section.sourceId}`,
    `Source: ${input.section.sourcePath || input.section.sourceTitle}`,
    `Source kind: ${input.section.sourceKind}`,
    `Source summary: ${input.section.sourceSummary}`,
    `Section heading: ${input.section.heading}`,
    `Section range: ${input.section.range}`,
    "",
    "Return JSON matching this exact shape:",
    JSON.stringify(
      {
        records: [
          projectBoardPlannerCandidateCardPromptExample({
            sourceRefs: [{ sourceId: input.section.sourceId, range: input.section.range }],
            suggestedAnswer: "expert default when the answer is professionally defensible from source context",
            rationale: "why an experienced UX designer/software architect would choose this default",
          }),
          {
            type: "question",
            questionId: "question:stable-id",
            question: "specific unresolved ambiguity",
            cardId: "synthesis:stable-card-id",
            required: true,
            createdAt: "2026-05-04T00:00:00.000Z",
          },
          {
            type: "source_coverage",
            sourceId: input.section.sourceId,
            range: input.section.range,
            status: "covered",
            cardIds: ["synthesis:stable-card-id"],
            note: "how this section is covered",
            updatedAt: "2026-05-04T00:00:00.000Z",
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Rules:",
    "- Emit only records for this section. Do not summarize the whole project unless this section asks for it.",
    "- Respect the Scope contract in the stable planning header. Complexity may justify deeper planning for this section, but it must not add excluded platform scope.",
    ...projectBoardPlannerScopeCapabilityPromptRules({ optionalScopeTarget: "source_coverage or remainingCoverageSummary" }),
    "- Keep this section's cards inside the structured scope contract.",
    `- Emit at most ${maxCardsPerSection} candidate_card records in this response so Ambient can persist and dispatch useful work immediately.`,
    "- Choose the next highest-leverage, dependency-sensible cards for this section; do not wait for a perfect whole-project plan.",
    "- Prefer multiple self-contained candidate_card records when the section names multiple concrete systems or mechanics.",
    ...projectBoardCardTitleQualityPromptRules(),
    "- Use needs_clarification when a card still needs a user decision; use ready_to_create only when scope, dependencies, and proof are settled.",
    PROJECT_BOARD_PLANNER_CANDIDATE_STATUS_RULE,
    ...projectBoardPlannerClarificationContractPromptRules({
      needsClarificationRule:
        "- Every needs_clarification candidate_card must include at least one open clarificationDecisions entry with the exact unresolved user decision(s). If you emit a question record for a card, set cardId to that card's sourceId.",
      canonicalRule:
        "- Mirror open clarificationDecisions entries into clarificationQuestions and clarificationSuggestions for compatibility only; do not emit variant wording across the decision, question record, and legacy arrays.",
      includeVagueLaneRule: true,
      defaultRule:
        "- For each open clarification decision, include suggestedAnswer/rationale/confidence/safeToAccept/questionKind when a senior UX designer/software architect can propose a safe default. Use expert_default only for implementation/UX defaults that do not invent product intent; use user_preference or external_constraint otherwise and set safeToAccept false.",
    }),
    "- Use stable lowercase sourceId values prefixed with synthesis:.",
    "- Keep blockedBy values to stable synthesis ids that are already emitted in prior sections or clearly required foundation cards.",
    "- Add source_coverage for this source section, including partial or unresolved when appropriate.",
    "- Do not emit proposal_final for ordinary section batches. Ambient adds a final record after validated section records are assembled.",
    input.plannerLedgerCompaction
      ? "- Repeated planner context has been compacted for this section. Treat compacted context as duplicate-avoidance and coverage guidance; the current section content remains the authoritative source slice."
      : "",
    "- Add question records for unresolved section-level ambiguity instead of making silent product guesses.",
    ...projectBoardPlannerProofExpectationPromptRules(),
    PROJECT_BOARD_PLANNER_LAMBDA_RLM_RULE,
    PROJECT_BOARD_PLANNER_JSON_ONLY_RULE,
    ...contract.operationRules.map((rule) => `- ${rule}`),
    projectBoardPlannerPmReviewActivationPromptBlock(input.refinement?.pmReviewReport),
    settledDecisionLedgerBlock,
    input.plannerWorkspaceBlock ? ["", input.plannerWorkspaceBlock].join("\n") : "",
    input.plannerLedgerCompaction
      ? [
          "",
          "Compacted planner context:",
          JSON.stringify(
            {
              source: input.plannerLedgerCompaction.source,
              summary: input.plannerLedgerCompaction.summary,
              renderedCardThemes: input.plannerLedgerCompaction.renderedCardThemes,
              duplicateAvoidanceNotes: input.plannerLedgerCompaction.duplicateAvoidanceNotes,
              dependencyHints: input.plannerLedgerCompaction.dependencyHints,
              citations: input.plannerLedgerCompaction.citations,
              renderedCardCount: input.plannerLedgerCompaction.renderedCardCount,
              omittedRenderedCardCount: input.plannerLedgerCompaction.omittedRenderedCardCount,
              recentRenderedCards: input.plannerLedgerCompaction.recentRenderedCards.slice(-18),
            },
            null,
            2,
          ),
          "Do not recreate omitted rendered cards. Use this as lossy context only; do not invent new source facts from it.",
        ].join("\n")
      : "",
    "",
    input.plannerLedgerCompaction ? "Compacted remaining source overview:" : "Overall source overview:",
    sourceOverview || "No additional source overview available.",
    "",
    "Deterministic baseline summary:",
    JSON.stringify(
      input.plannerLedgerCompaction
        ? {
            goal: input.deterministicDraft.goal,
            qualityBar: input.deterministicDraft.qualityBar,
            cardCount: input.deterministicDraft.cards.length,
            recentCards: input.deterministicDraft.cards.slice(0, 8).map((card) => ({
              sourceId: card.sourceId,
              title: card.title,
              phase: card.phase,
              blockedBy: card.blockedBy,
            })),
            omittedCardCount: Math.max(0, input.deterministicDraft.cards.length - 8),
          }
        : {
            goal: input.deterministicDraft.goal,
            qualityBar: input.deterministicDraft.qualityBar,
            cards: input.deterministicDraft.cards.map((card) => ({
              sourceId: card.sourceId,
              title: card.title,
              phase: card.phase,
              blockedBy: card.blockedBy,
            })),
          },
      null,
      2,
    ),
    answers ? ["", "Settled answers to honor:", answers].join("\n") : "",
    priorCards ? ["", "Already emitted candidate cards to avoid duplicating:", priorCards].join("\n") : "",
    "",
    "Section content:",
    input.section.content,
  ]
    .filter(Boolean)
    .join("\n");
}

export type PlannerBatchStatus =
  | "continue"
  | "planning_complete"
  | "needs_user_decision"
  | "budget_exhausted"
  | "stale_source_snapshot"
  | "validation_failed"
  | "user_cancelled";

export function buildProjectBoardPlannerBatchPrompt(input: {
  sources: ProjectBoardSynthesisSource[];
  projectName?: string;
  deterministicDraft: ProjectBoardSynthesisDraft;
  refinement?: ProjectBoardSynthesisRefinementContext;
  charterProjectSummary?: ProjectBoardCharterProjectSummary;
  scopeContract?: ProjectBoardScopeContract;
  priorRecords: ProposalJsonlRecordArtifact[];
  resumeContinuation?: ProjectBoardPlannerBatchContinuation;
  batchNumber: number;
  maxBatches: number;
  maxCardsPerBatch: number;
  plannerWorkspaceBlock?: string;
  plannerLedgerCompaction?: ProjectBoardPlannerLedgerCompaction;
}): string {
  const operation = synthesisOperationFromRefinement(input.refinement);
  const contract = buildProjectBoardPlanningContract({
    operation,
    projectName: input.projectName,
    profileName: inferPlanningProfileName(input.sources),
    charter: {
      goal: input.refinement?.previousDraft.goal ?? input.deterministicDraft.goal,
      proofPolicy: input.refinement?.previousDraft.qualityBar ?? input.deterministicDraft.qualityBar,
      decisionPolicy: input.refinement
        ? "Treat the supplied charter and PM Review answers as already settled unless they are incomplete or contradictory."
        : undefined,
      ...(input.charterProjectSummary ? { projectSummary: input.charterProjectSummary } : {}),
    },
    scopeContract:
      input.scopeContract ??
      projectBoardScopeContractFromTexts(projectBoardScopeContractTexts({ sources: input.sources, refinement: input.refinement })),
  });
  const sourceOverview = input.plannerLedgerCompaction?.remainingCoverage ?? plannerBatchSourceOverview(input.sources);
  const ledger = input.plannerLedgerCompaction
    ? plannerBatchCompactedLedger(input.plannerLedgerCompaction)
    : plannerBatchLedger(input.sources, input.priorRecords);
  const continuationBlock = plannerBatchContinuationPromptBlock(input.resumeContinuation);
  const answers =
    input.refinement?.answers.map((item, index) => `${index + 1}. Q: ${item.question}\n   A: ${item.answer}`).join("\n") ?? "";
  const settledDecisionLedgerBlock = projectBoardSettledClarificationDecisionLedgerPromptBlock(input.refinement);
  return [
    contract.stablePromptHeader,
    "",
    "Plan the next small batch for a project board.",
    input.projectName ? `Project: ${input.projectName}` : "",
    `Planner batch: ${input.batchNumber} of at most ${input.maxBatches}`,
    "",
    "Return JSON matching this exact shape:",
    JSON.stringify(
      {
        plannerStatus: "continue",
        records: [
          projectBoardPlannerCandidateCardPromptExample({
            sourceRefs: [{ sourceId: "source-id-from-ledger", range: "source range or section" }],
            suggestedAnswer: "expert default when safe",
            rationale: "source-grounded rationale",
          }),
          {
            type: "source_coverage",
            sourceId: "source-id-from-ledger",
            range: "covered range or full",
            status: "covered",
            cardIds: ["synthesis:stable-card-id"],
            note: "how this batch covers or partially covers this source",
            updatedAt: "2026-05-04T00:00:00.000Z",
          },
        ],
        remainingCoverageSummary: "short note on what still needs planning",
        nextBatchHint: "what to ask for next, if plannerStatus is continue",
      },
      null,
      2,
    ),
    "",
    "Planner status values:",
    "- Use continue when more card batches are needed.",
    "- Use planning_complete when all source-backed work that should become cards is represented or intentionally ignored.",
    "- Use needs_user_decision when the next card cannot be responsibly planned without a user answer.",
    "- Use budget_exhausted, stale_source_snapshot, validation_failed, or user_cancelled only when that exact stop condition applies.",
    "",
    "Rules:",
    `- Emit the next ${Math.max(1, input.maxCardsPerBatch - 1)}-${input.maxCardsPerBatch} highest-leverage candidate_card records not already represented in the rendered-card ledger unless that ledger entry has restartAction regenerate_card.`,
    "- Respect the Scope contract in the stable planning header. Do not add excluded platform scope.",
    ...projectBoardPlannerScopeCapabilityPromptRules({ optionalScopeTarget: "source_coverage or remainingCoverageSummary" }),
    "- Keep generated cards inside the structured scope contract.",
    "- Do not emit a giant whole-board response. This is one small batch in a repeated loop.",
    "- Do not duplicate card ids or titles already shown in the rendered-card ledger when the entry is valid/reusable; invalidated regenerate_card entries are eligible for a replacement candidate.",
    input.plannerLedgerCompaction
      ? "- The rendered-card ledger is compacted due to prompt pressure. Use planner_card_search for exact duplicate checks before emitting cards whose title, intent, or source basis may overlap omitted rendered cards."
      : "",
    ...projectBoardCardTitleQualityPromptRules(),
    "- Prefer dependency-unblocking foundation cards first, then cards that cover the remaining-coverage ledger.",
    "- Add source_coverage records for sources touched by this batch. Use partial or unresolved when a source still needs later planning.",
    "- Add question records when a card or source needs a user decision. Set plannerStatus to needs_user_decision if planning cannot continue safely.",
    PROJECT_BOARD_PLANNER_CANDIDATE_STATUS_RULE,
    ...projectBoardPlannerClarificationContractPromptRules({
      canonicalRule:
        "- Use clarificationDecisions as the canonical unresolved clarification shape. Give each decision a stable id and canonicalKey, and mirror open decisions into clarificationQuestions and clarificationSuggestions only for compatibility.",
      defaultRule:
        "- For each unresolved clarification, include suggestedAnswer/rationale/confidence/safeToAccept/questionKind on the clarificationDecisions entry when a safe expert default exists. Classify unsafe questions as user_preference or external_constraint and keep safeToAccept false.",
    }),
    "- Do not emit proposal_final. Ambient assembles the final proposal from validated records.",
    "- Use stable lowercase sourceId values prefixed with synthesis: for candidate cards.",
    ...projectBoardPlannerProofExpectationPromptRules(),
    PROJECT_BOARD_PLANNER_LAMBDA_RLM_RULE,
    PROJECT_BOARD_PLANNER_JSON_ONLY_RULE,
    ...contract.operationRules.map((rule) => `- ${rule}`),
    projectBoardPlannerPmReviewActivationPromptBlock(input.refinement?.pmReviewReport),
    settledDecisionLedgerBlock,
    continuationBlock,
    input.plannerWorkspaceBlock ? ["", input.plannerWorkspaceBlock].join("\n") : "",
    input.plannerLedgerCompaction
      ? [
          "",
          "Compacted planner context:",
          JSON.stringify(
            {
              source: input.plannerLedgerCompaction.source,
              summary: input.plannerLedgerCompaction.summary,
              renderedCardThemes: input.plannerLedgerCompaction.renderedCardThemes,
              duplicateAvoidanceNotes: input.plannerLedgerCompaction.duplicateAvoidanceNotes,
              dependencyHints: input.plannerLedgerCompaction.dependencyHints,
              citations: input.plannerLedgerCompaction.citations,
              renderedCardCount: input.plannerLedgerCompaction.renderedCardCount,
              omittedRenderedCardCount: input.plannerLedgerCompaction.omittedRenderedCardCount,
              recentRenderedCards: input.plannerLedgerCompaction.recentRenderedCards,
            },
            null,
            2,
          ),
          "Treat this compacted context as a lossy summary of already-rendered work, not authority to change user decisions.",
        ].join("\n")
      : "",
    "",
    input.plannerLedgerCompaction ? "Remaining source ledger:" : "Source ledger:",
    JSON.stringify(sourceOverview, null, 2),
    "",
    input.plannerLedgerCompaction ? "Compacted rendered-card and coverage ledger:" : "Rendered-card and coverage ledger:",
    JSON.stringify(ledger, null, 2),
    "",
    "Deterministic baseline summary:",
    JSON.stringify(
      {
        goal: input.deterministicDraft.goal,
        qualityBar: input.deterministicDraft.qualityBar,
        cards: input.deterministicDraft.cards.map((card) => ({
          sourceId: card.sourceId,
          title: card.title,
          phase: card.phase,
          blockedBy: card.blockedBy,
        })),
      },
      null,
      2,
    ),
    answers ? ["", "Settled answers to honor:", answers].join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function plannerBatchContinuationPromptBlock(continuation?: ProjectBoardPlannerBatchContinuation): string {
  if (!continuation) return "";
  const batchText = continuation.plannerBatchIndex
    ? `planner batch ${continuation.plannerBatchIndex}${continuation.plannerBatchCount ? `/${continuation.plannerBatchCount}` : ""}`
    : "the active planner batch";
  const stopReason =
    continuation.stopReason === "pause_requested"
      ? continuation.stopReason
      : continuation.finishReason || continuation.stopReason || "an output budget/context-window limit";
  return [
    "",
    "Continuation checkpoint:",
    `- This is a continuation of ${batchText} from run ${continuation.retryOfRunId}.`,
    `- Ambient/Pi previously stopped because of ${stopReason}.`,
    `- The last valid persisted record was ${continuation.lastValidRecordType} ${continuation.lastValidRecordId}.`,
    `- The retry prompt contains ${continuation.retainedRecordCount} validated records through that checkpoint, from ${continuation.originalRecordCount} prior records.`,
    "- Do not restate or re-emit records already present in the rendered-card and coverage ledger.",
    "- Continue with the next missing records/cards only. Do not stitch partial JSON or assume text after the checkpoint was valid.",
  ].join("\n");
}

function plannerBatchSourceOverview(sources: ProjectBoardSynthesisSource[]) {
  return sources
    .filter(projectBoardSourceIncludedInSynthesis)
    .slice(0, 24)
    .map((source, index) => ({
      sourceId: plannerSourceId(source, index),
      title: source.title,
      path: source.path,
      kind: source.kind,
      relevance: source.relevance,
      summary: source.summary,
      excerptPreview: source.excerpt?.trim().slice(0, 1800),
    }));
}

function plannerBatchLedger(sources: ProjectBoardSynthesisSource[], records: ProposalJsonlRecordArtifact[]) {
  const renderedCardLedger = buildProjectBoardRenderedCardLedger(records, { sources });
  const questions = records.filter((record) => record.type === "question");
  const coverage = records.filter((record) => record.type === "source_coverage");
  const remainingSourceIds = new Set(remainingPlannerCoverageSourceIds(sources, records));
  return {
    renderedCards: renderedCardLedger.entries,
    renderedCardLedgerChecksum: renderedCardLedger.checksum,
    renderedCardLedgerSummary: {
      cardCount: renderedCardLedger.cardCount,
      blockedCardCount: renderedCardLedger.blockedCardCount,
      duplicateCardCount: renderedCardLedger.duplicateCardCount,
      rejectedCardCount: renderedCardLedger.rejectedCardCount,
      evidenceCardCount: renderedCardLedger.evidenceCardCount,
      splitLineageCount: renderedCardLedger.splitLineageCount,
      invalidatedCardCount: renderedCardLedger.invalidatedCardCount,
    },
    openQuestions: questions.map((record) => ({
      questionId: record.questionId,
      cardId: record.cardId,
      question: record.question,
      required: record.required,
    })),
    sourceCoverage: coverage.map((record) => ({
      sourceId: record.sourceId,
      range: record.range,
      status: record.status,
      cardIds: record.cardIds,
      note: record.note,
    })),
    remainingCoverage: plannerBatchSourceOverview(sources)
      .filter((source) => remainingSourceIds.has(source.sourceId))
      .map((source) => ({
        sourceId: source.sourceId,
        title: source.title,
        path: source.path,
        summary: source.summary,
      })),
  };
}

export function plannerLedgerCompactionCacheKey(input: {
  sources: ProjectBoardSynthesisSource[];
  projectName?: string;
  priorRecords: ProposalJsonlRecordArtifact[];
  refinement?: ProjectBoardSynthesisRefinementContext;
  charterProjectSummary?: ProjectBoardCharterProjectSummary;
  rawPromptBudget: ProjectBoardPromptBudgetAssessment;
  batchNumber: number;
  maxBatches: number;
  maxCardsPerBatch: number;
}): string {
  return stableBoardArtifactId("planner-ledger-compaction", [
    stableJson({
      projectName: input.projectName,
      batchNumber: input.batchNumber,
      maxBatches: input.maxBatches,
      maxCardsPerBatch: input.maxCardsPerBatch,
      rawPromptBudgetStatus: input.rawPromptBudget.status,
      rawPromptBudgetOperation: input.rawPromptBudget.operation,
      rawPromptBudgetModelId: input.rawPromptBudget.modelId,
      sources: input.sources.filter(projectBoardSourceIncludedInSynthesis).map((source, index) => ({
        sourceId: plannerSourceId(source, index),
        title: source.title,
        path: source.path,
        kind: source.kind,
        summary: source.summary,
        excerpt: source.excerpt,
        relevance: source.relevance,
      })),
      records: input.priorRecords.filter(isPlannerLedgerCompactionRelevantRecord),
      settledAnswers: input.refinement?.answers ?? [],
      settledClarificationDecisions: input.refinement?.settledClarificationDecisions ?? [],
      pmReviewReport: input.refinement?.pmReviewReport
        ? {
            readiness: input.refinement.pmReviewReport.readiness,
            summary: input.refinement.pmReviewReport.summary,
            recommendedActivationScope: input.refinement.pmReviewReport.recommendedActivationScope,
            cardGenerationConstraints: input.refinement.pmReviewReport.cardGenerationConstraints,
            blockingQuestions: input.refinement.pmReviewReport.blockingQuestions,
          }
        : undefined,
      charterProjectSummary: input.charterProjectSummary
        ? {
            summary: input.charterProjectSummary.summary,
            sourceChecksumSet: input.charterProjectSummary.sourceChecksumSet,
            charterAnswerChecksum: input.charterProjectSummary.charterAnswerChecksum,
            unresolvedDecisions: input.charterProjectSummary.unresolvedDecisions,
          }
        : undefined,
    }),
  ]);
}

function isPlannerLedgerCompactionRelevantRecord(record: ProposalJsonlRecordArtifact): boolean {
  return (
    record.type === "candidate_card" || record.type === "question" || record.type === "source_coverage" || record.type === "dependency_edge"
  );
}

export function readCachedPlannerLedgerCompaction(
  records: ProposalJsonlRecordArtifact[],
  cacheKey: string,
  rawPromptBudget: ProjectBoardPromptBudgetAssessment,
): ProjectBoardPlannerLedgerCompaction | undefined {
  for (const record of records.slice().reverse()) {
    if (record.type !== "progress" || !["planner_ledger_compacted", "section_context_compacted"].includes(record.stage)) continue;
    const metadata = record.metadata;
    const cached = normalizeCachedPlannerLedgerCompaction(metadata.plannerLedgerCompactionCache, cacheKey, rawPromptBudget);
    if (cached) return cached;
  }
  return undefined;
}

function normalizeCachedPlannerLedgerCompaction(
  value: unknown,
  cacheKey: string,
  rawPromptBudget: ProjectBoardPromptBudgetAssessment,
): ProjectBoardPlannerLedgerCompaction | undefined {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  if (!record || record.cacheKey !== cacheKey) return undefined;
  const summary = typeof record.summary === "string" && record.summary.trim() ? record.summary.trim() : "";
  if (!summary) return undefined;
  const source = record.source === "pi_rlm" || record.source === "deterministic_fallback" ? record.source : "deterministic_fallback";
  return {
    source,
    cacheKey,
    cacheHit: true,
    summary,
    renderedCardThemes: compactStringListField(record.renderedCardThemes, [], 12, 300),
    duplicateAvoidanceNotes: compactStringListField(record.duplicateAvoidanceNotes, [], 16, 360),
    remainingCoverage: compactCoverageListField(record.remainingCoverage, []),
    openQuestions: compactQuestionListField(record.openQuestions, []),
    dependencyHints: compactStringListField(record.dependencyHints, [], 12, 300),
    citations: compactStringListField(record.citations, [], 16, 220),
    recentRenderedCards: compactRecentRenderedCardsField(record.recentRenderedCards),
    renderedCardCount: numericMetadataField(record.renderedCardCount),
    omittedRenderedCardCount: numericMetadataField(record.omittedRenderedCardCount),
    sourceCount: numericMetadataField(record.sourceCount),
    openQuestionCount: numericMetadataField(record.openQuestionCount),
    promptCharCount: 0,
    responseCharCount: 0,
    rawPromptBudgetStatus: rawPromptBudget.status,
    ...(typeof record.finalPromptCharCount === "number" && Number.isFinite(record.finalPromptCharCount)
      ? { finalPromptCharCount: record.finalPromptCharCount }
      : {}),
    ...(typeof record.error === "string" && record.error.trim() ? { error: record.error.trim() } : {}),
  };
}

export function deterministicPlannerLedgerCompaction(input: {
  sources: ProjectBoardSynthesisSource[];
  priorRecords: ProposalJsonlRecordArtifact[];
  rawPromptBudget: ProjectBoardPromptBudgetAssessment;
  cacheKey: string;
  promptCharCount: number;
  responseCharCount: number;
}): ProjectBoardPlannerLedgerCompaction {
  const cards = input.priorRecords.filter((record) => record.type === "candidate_card");
  const questions = input.priorRecords.filter((record) => record.type === "question");
  const coverage = input.priorRecords.filter((record) => record.type === "source_coverage");
  const phaseCounts = countBy(cards.map((record) => record.phase || "Unspecified"));
  const statusCounts = countBy(cards.map((record) => record.candidateStatus));
  const sourceCoverage = latestCoverageBySource(coverage);
  const remainingCoverage = plannerBatchSourceOverview(input.sources)
    .filter((source) => sourceCoverage.get(source.sourceId) !== "covered")
    .slice(0, 36)
    .map((source) => ({
      sourceId: source.sourceId,
      title: source.title,
      status: sourceCoverage.get(source.sourceId) ?? "uncovered",
      summary: source.summary,
    }));
  const recentRenderedCards = cards.slice(-60).map((record) => ({
    cardId: record.sourceId,
    title: record.title,
    phase: record.phase,
    candidateStatus: record.candidateStatus,
  }));
  const duplicateAvoidanceNotes = cards
    .slice(-120)
    .map((record) => `${record.sourceId}: ${record.title}`)
    .slice(0, 40);
  return {
    source: "deterministic_fallback",
    cacheKey: input.cacheKey,
    cacheHit: false,
    summary: [
      `${cards.length.toLocaleString()} rendered candidate card${cards.length === 1 ? "" : "s"} are already in the planner ledger.`,
      `${remainingCoverage.length.toLocaleString()} included source${remainingCoverage.length === 1 ? "" : "s"} still need coverage or verification.`,
      `Phase counts: ${formatCounts(phaseCounts)}.`,
      `Status counts: ${formatCounts(statusCounts)}.`,
    ].join(" "),
    renderedCardThemes: Object.entries(phaseCounts)
      .slice(0, 12)
      .map(([phase, count]) => `${phase}: ${count} rendered card${count === 1 ? "" : "s"}`),
    duplicateAvoidanceNotes,
    remainingCoverage,
    openQuestions: questions.slice(-24).map((record) => ({
      questionId: record.questionId,
      cardId: record.cardId,
      question: record.question,
    })),
    dependencyHints: ["Use planner_card_search before emitting cards that resemble omitted rendered cards from the compacted ledger."],
    citations: [
      ...input.sources
        .filter(projectBoardSourceIncludedInSynthesis)
        .slice(0, 12)
        .map((source, index) => `${plannerSourceId(source, index)}: ${source.path || source.title}`),
      ...recentRenderedCards.slice(-12).map((card) => `${card.cardId}: ${card.title}`),
    ],
    recentRenderedCards,
    renderedCardCount: cards.length,
    omittedRenderedCardCount: Math.max(0, cards.length - recentRenderedCards.length),
    sourceCount: input.sources.filter(projectBoardSourceIncludedInSynthesis).length,
    openQuestionCount: questions.length,
    promptCharCount: input.promptCharCount,
    responseCharCount: input.responseCharCount,
    rawPromptBudgetStatus: input.rawPromptBudget.status,
  };
}

function plannerBatchCompactedLedger(compaction: ProjectBoardPlannerLedgerCompaction) {
  return {
    compacted: true,
    source: compaction.source,
    summary: compaction.summary,
    renderedCardCount: compaction.renderedCardCount,
    omittedRenderedCardCount: compaction.omittedRenderedCardCount,
    recentRenderedCards: compaction.recentRenderedCards,
    duplicateAvoidanceNotes: compaction.duplicateAvoidanceNotes,
    openQuestions: compaction.openQuestions,
    remainingCoverage: compaction.remainingCoverage,
    dependencyHints: compaction.dependencyHints,
  };
}

function latestCoverageBySource(records: Extract<ProposalJsonlRecordArtifact, { type: "source_coverage" }>[]): Map<string, string> {
  const statuses = new Map<string, string>();
  for (const record of records) {
    if (record.status === "ignored") continue;
    statuses.set(record.sourceId, record.status);
  }
  return statuses;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return "none";
  return entries
    .slice(0, 8)
    .map(([key, count]) => `${key}=${count}`)
    .join(", ");
}

function compactStringField(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim() ? truncateText(value.trim(), maxLength) : fallback;
}

function compactStringListField(value: unknown, fallback: string[], limit: number, maxItemLength: number): string[] {
  const items = Array.isArray(value) ? value : [];
  const strings = items
    .map((item) => (typeof item === "string" ? truncateText(item.trim(), maxItemLength) : ""))
    .filter(Boolean)
    .slice(0, limit);
  return strings.length > 0 ? strings : fallback;
}

function compactCoverageListField(
  value: unknown,
  fallback: ProjectBoardPlannerLedgerCompaction["remainingCoverage"],
): ProjectBoardPlannerLedgerCompaction["remainingCoverage"] {
  if (!Array.isArray(value)) return fallback;
  const coverage = value
    .map((item) => {
      const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
      const sourceId = typeof record.sourceId === "string" ? record.sourceId.trim() : "";
      if (!sourceId) return undefined;
      return {
        sourceId,
        ...(typeof record.title === "string" && record.title.trim() ? { title: truncateText(record.title.trim(), 240) } : {}),
        ...(typeof record.status === "string" && record.status.trim() ? { status: truncateText(record.status.trim(), 80) } : {}),
        ...(typeof record.summary === "string" && record.summary.trim() ? { summary: truncateText(record.summary.trim(), 500) } : {}),
      };
    })
    .filter((item): item is ProjectBoardPlannerLedgerCompaction["remainingCoverage"][number] => Boolean(item))
    .slice(0, 36);
  return coverage.length > 0 ? coverage : fallback;
}

function compactQuestionListField(
  value: unknown,
  fallback: ProjectBoardPlannerLedgerCompaction["openQuestions"],
): ProjectBoardPlannerLedgerCompaction["openQuestions"] {
  if (!Array.isArray(value)) return fallback;
  const questions = value
    .map((item) => {
      const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
      const questionId = typeof record.questionId === "string" ? record.questionId.trim() : "";
      const question = typeof record.question === "string" ? record.question.trim() : "";
      if (!questionId || !question) return undefined;
      return {
        questionId,
        ...(typeof record.cardId === "string" && record.cardId.trim() ? { cardId: record.cardId.trim() } : {}),
        question: truncateText(question, 500),
      };
    })
    .filter((item): item is ProjectBoardPlannerLedgerCompaction["openQuestions"][number] => Boolean(item))
    .slice(0, 24);
  return questions.length > 0 ? questions : fallback;
}

function compactRecentRenderedCardsField(value: unknown): ProjectBoardPlannerLedgerCompaction["recentRenderedCards"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
      const cardId = typeof record.cardId === "string" ? record.cardId.trim() : "";
      const title = typeof record.title === "string" ? record.title.trim() : "";
      if (!cardId || !title) return undefined;
      return {
        cardId,
        title: truncateText(title, 240),
        ...(typeof record.phase === "string" && record.phase.trim() ? { phase: truncateText(record.phase.trim(), 200) } : {}),
        ...(typeof record.candidateStatus === "string" && record.candidateStatus.trim()
          ? { candidateStatus: truncateText(record.candidateStatus.trim(), 80) }
          : {}),
      };
    })
    .filter((item): item is ProjectBoardPlannerLedgerCompaction["recentRenderedCards"][number] => Boolean(item))
    .slice(0, 60);
}

function numericMetadataField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJsonValue(item)]),
  );
}

export function remainingPlannerCoverageSourceIds(
  sources: ProjectBoardSynthesisSource[],
  records: ProposalJsonlRecordArtifact[],
): string[] {
  const sourceIds = sources.filter(projectBoardSourceIncludedInSynthesis).map(plannerSourceId);
  // Last record wins, matching latestCoverageBySource: a source marked unresolved in
  // an early batch and covered in a later one is complete. Sticky-unresolved kept such
  // runs looping to maxBatches and reporting budget_exhausted for finished work.
  const statusBySource = new Map<string, "covered" | "unresolved">();
  for (const record of records) {
    if (record.type !== "source_coverage" || record.status === "ignored") continue;
    statusBySource.set(record.sourceId, record.status === "covered" ? "covered" : "unresolved");
  }
  return sourceIds.filter((sourceId) => statusBySource.get(sourceId) !== "covered");
}

function plannerSourceId(source: ProjectBoardSynthesisSource, index?: number): string {
  if (source.id?.trim()) return source.id.trim();
  return stableBoardArtifactId("source", [source.path, source.title, index]);
}

export function normalizePlannerBatchLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_PROJECT_BOARD_PLANNER_BATCH_LIMIT;
  return Math.max(1, Math.min(24, Math.floor(value)));
}

export function normalizePlannerBatchCardLimit(value: number | undefined, workspace?: ProjectBoardPlannerWorkspace): number {
  const configured = value ?? workspace?.batchPolicy.maxCandidateCardsPerBatch ?? DEFAULT_PROJECT_BOARD_SECTION_BATCH_CARD_LIMIT;
  return Math.max(1, Math.min(6, Math.floor(configured)));
}

export function parseProjectBoardSynthesisJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Ambient project-board synthesis returned an empty response.");
  let parseError: unknown;
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    parseError = error;
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch (fencedError) {
      parseError = fencedError;
    }
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch (sliceError) {
      parseError = sliceError;
    }
  }
  const detail = parseError instanceof Error && parseError.message ? ` Parser error: ${parseError.message.slice(0, 220)}` : "";
  throw new Error(
    `Ambient project-board synthesis did not return valid JSON.${detail} Response preview: ${projectBoardSynthesisInvalidJsonPreview(trimmed)}`,
    {
      cause: parseError,
    },
  );
}

function projectBoardSynthesisInvalidJsonPreview(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const preview = normalized.slice(0, 500);
  const redacted = preview
    .replace(/\b(?:sk|gmi|ambient)_[A-Za-z0-9_-]{16,}\b/g, "[redacted-secret]")
    .replace(/\b[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, "[redacted-token]");
  return JSON.stringify(`${redacted}${normalized.length > preview.length ? "..." : ""}`);
}

export function normalizeSectionBatchCardLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_PROJECT_BOARD_SECTION_BATCH_CARD_LIMIT;
  return Math.max(1, Math.min(10, Math.floor(value)));
}

export function sectionIdForRecord(record: ProposalJsonlRecordArtifact): string | undefined {
  const sectionId = "metadata" in record ? record.metadata?.sectionId : undefined;
  return typeof sectionId === "string" && sectionId.trim() ? sectionId.trim() : undefined;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function synthesisOperationFromRefinement(refinement?: ProjectBoardSynthesisRefinementContext): ProjectBoardPlanningOperation {
  return refinement && isAdditiveProjectBoardRefinement(refinement) ? "source_elaboration" : "board_synthesis";
}

export function inferPlanningProfileName(sources: ProjectBoardSynthesisSource[]): ProjectBoardPlanningProfileName | undefined {
  const includedSources = sources.filter(projectBoardSourceIncludedInSynthesis);
  const text = includedSources
    .map((source) => `${source.kind}\n${source.title}\n${source.summary}\n${source.excerpt ?? ""}\n${source.path ?? ""}`)
    .join("\n")
    .toLowerCase();
  if (/\b(game|gameplay|webgl|three\.js|pixijs|matter\.js|howler|canvas|player|enemy|combat|hud|boss|mission)\b/.test(text)) {
    return "gameplay-design";
  }
  if (/\b(refactor|migration|cleanup|debt|maintenance)\b/.test(text)) return "maintenance-refactor";
  if (/\b(security|reliability|quality|regression|test plan|proof|audit)\b/.test(text)) return "quality-gate";
  return undefined;
}
