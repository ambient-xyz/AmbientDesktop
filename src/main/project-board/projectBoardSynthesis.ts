import type {
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardClarificationDecision,
  ProjectBoardCardClarificationSuggestion,
  ProjectBoardCardTestPlan,
  ProjectBoardAddCardsObjectiveProvenance,
  ProjectBoardCharterProjectSummary,
  ProjectBoardGitSyncStatus,
  ProjectBoardPmReviewGitState,
  ProjectBoardPmReviewReadiness,
  ProjectBoardPmReviewReport,
  ProjectBoardPmReviewSourceConfidence,
  ProjectBoardSourceAuthorityRole,
  ProjectBoardSourceChangeState,
  ProjectBoardSourceKind,
  ProjectBoardSynthesisProposal,
  ProjectBoardUiMockRole
} from "../../shared/projectBoardTypes";
import {
  buildProjectBoardPlanningContract,
  projectBoardPlanningDepthFromScopeContract,
  projectBoardScopeContractFromTexts,
  type ProjectBoardPlanningProfileName,
} from "./projectBoardPlanningContract";
import {
  projectBoardPlanDisplayTitle,
  projectBoardPlanGoalFromText,
} from "../../shared/projectBoardPlanIdentity";
import {
  projectBoardClarificationCanonicalKey,
  projectBoardClarificationDecisionId,
  projectBoardStructuredClarificationDecisions,
} from "../../shared/projectBoardClarificationDecisions";
import { projectBoardSourceIncludedInSynthesis } from "./projectBoardSourceIdentity";
import { projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";
import {
  PROJECT_BOARD_PLANNER_SYNTHESIS_LAMBDA_RLM_RULE,
  PROJECT_BOARD_PLANNER_SYNTHESIS_PROOF_EXPECTATION_RULE,
  projectBoardPlannerPmReviewActivationPromptBlock,
  projectBoardPlannerPmReviewGitStatePromptLines,
  projectBoardPlannerPmReviewPromptRules,
  projectBoardPlannerPmReviewReadinessPromptLines,
  projectBoardPlannerPmReviewReportPromptExample,
  projectBoardPlannerPmReviewSourceConfidencePromptLines,
  projectBoardPlannerProofScopePromptRuleLines,
  projectBoardPlannerScopeCapabilityPromptRules,
  projectBoardPlannerSynthesisCardPromptExample,
  projectBoardPlannerSynthesisClarificationPromptRules,
} from "./projectBoardPlannerPromptContracts";

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

export type ProjectBoardSynthesisRefinementAnswerSource =
  | "charter"
  | "pm_review"
  | "card_clarification"
  | "source_scope"
  | "manual";

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

export class ProjectBoardCardTitleQualityValidationError extends Error {
  readonly violations: ProjectBoardCardTitleQualityViolation[];
  readonly context: Record<string, unknown>;

  constructor(violations: ProjectBoardCardTitleQualityViolation[], context: Record<string, unknown> = {}) {
    const first = violations[0];
    super(
      first
        ? `Ambient/Pi emitted ${violations.length} implementation-detail card title${
            violations.length === 1 ? "" : "s"
          } in ${String(context.surface ?? "project-board synthesis")}: "${first.title}" looks like ${first.reason}. Card titles must name user-meaningful work packages; move raw HTML/CSS selectors, property declarations, visual-state snippets, and token values into descriptions or acceptance criteria.`
        : "Ambient/Pi emitted an implementation-detail card title.",
    );
    this.name = "ProjectBoardCardTitleQualityValidationError";
    this.violations = violations;
    this.context = context;
  }
}

export function projectBoardCardTitleQualityPromptRules(): string[] {
  return [
    "- Card titles must name user-meaningful work packages or deliverables, not raw HTML/CSS selectors, DOM wrappers, CSS declarations, visual-state fragments, or property/value snippets.",
    "- Put implementation details such as <main>, :root, .light-mode, background: rgba(...), font-size, grid-template, hover/active transforms, and px/rem/ms values in descriptions, acceptance criteria, or test plans; merge those details into coherent cards.",
  ];
}

export function projectBoardCardTitleQualityViolations(
  candidates: ProjectBoardCardTitleQualityCandidate[],
): ProjectBoardCardTitleQualityViolation[] {
  return candidates.flatMap((candidate) => {
    const title = candidate.title.trim();
    if (!title) return [];
    const reason = projectBoardCardTitleImplementationDetailReason(title);
    if (!reason) return [];
    return [
      {
        ...candidate,
        title,
        reason,
        guidance:
          "Rename the card as a coherent deliverable, for example 'Build calculator layout shell' or 'Implement theme toggle'; keep raw HTML/CSS details in the description or acceptance criteria.",
      },
    ];
  });
}

export function assertProjectBoardCardTitleQuality(
  candidates: ProjectBoardCardTitleQualityCandidate[],
  context: Record<string, unknown> = {},
): void {
  const violations = projectBoardCardTitleQualityViolations(candidates);
  if (violations.length > 0) throw new ProjectBoardCardTitleQualityValidationError(violations, context);
}

function projectBoardCardTitleImplementationDetailReason(title: string): string | undefined {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (/(^|[\s([{"'`])<\/?[a-z][a-z0-9-]*(?:\s|>|:)/i.test(normalized)) return "a raw HTML tag or DOM wrapper";
  if (/(^|[\s([{"'`])(?:[.#][a-z_-][\w-]*|:[a-z][\w-]*|--[a-z][\w-]*)\b/.test(normalized)) return "a raw CSS selector or token";
  if (
    /\b(?:align-items|background(?:-color)?|border(?:-(?:bottom|top|left|right|radius|color))?|box-shadow|color|display|font(?:-size|-weight|-family)?|gap|grid(?:-template(?:-columns|-rows)?|-column|-row)?|height|justify-content|line-height|margin|opacity|padding|position|transform|transition|width)\s*:/i.test(
      normalized,
    )
  ) {
    return "a CSS property declaration";
  }
  if (/\b(?:rgba?|hsla?|color-mix|linear-gradient|var|scale|translate|rotate)\(/i.test(normalized)) return "a CSS value or transform snippet";
  if (/:\s*[^,;]*\b\d+(?:px|rem|em|vh|vw|ms)\b/i.test(normalized)) return "a CSS measurement or timing token";
  if (/^\s*(?:hover|active|focus|disabled|separator|result|expression|grid):/i.test(normalized)) return "a visual-state or layout fragment";
  return undefined;
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

interface ProjectProfile {
  hasGame: boolean;
  hasWebGl: boolean;
  hasUserInterface: boolean;
  hasThree: boolean;
  hasPixi: boolean;
  hasMatter: boolean;
  hasTests: boolean;
  mentionsArcadeAndInertia: boolean;
  mentionsKeyboardAndTouch: boolean;
  mentionsWavesAndEndless: boolean;
}

const MAX_SOURCE_NOTES = 8;
const SYNTHESIS_SOURCE_PREFIX = "synthesis:";
const PROJECT_BOARD_CARD_CANDIDATE_STATUSES = new Set<ProjectBoardCardCandidateStatus>([
  "needs_clarification",
  "ready_to_create",
  "evidence",
  "duplicate",
  "rejected",
]);
const PROJECT_BOARD_PM_REVIEW_READINESS = new Set<ProjectBoardPmReviewReadiness>([
  "ready_for_activation",
  "ready_for_card_generation",
  "needs_answers",
  "needs_source_refresh",
  "blocked",
]);
const PROJECT_BOARD_PM_REVIEW_SOURCE_CONFIDENCE = new Set<ProjectBoardPmReviewSourceConfidence>(["high", "medium", "low", "unknown"]);
const PROJECT_BOARD_PM_REVIEW_GIT_STATE = new Set<ProjectBoardPmReviewGitState>(["local_only", "git_no_remote", "git_ready", "unknown"]);

export function synthesizeProjectBoardDraft(sources: ProjectBoardSynthesisSource[]): ProjectBoardSynthesisDraft {
  const usefulSources = sources
    .filter((source) => projectBoardSourceIncludedInSynthesis(source) && Boolean(source.title.trim() || source.summary.trim() || source.excerpt?.trim()))
    .sort((left, right) => right.relevance - left.relevance || left.title.localeCompare(right.title));
  const sourceNotes = usefulSources.slice(0, MAX_SOURCE_NOTES).map(formatSourceNote);
  const corpus = usefulSources.map((source) => `${source.kind}\n${source.title}\n${source.summary}\n${source.excerpt ?? ""}\n${source.path ?? ""}`).join("\n\n");
  const profile = detectProjectProfile(corpus, usefulSources);

  if (projectBoardSynthesisShouldUseCompactLocalDraft(usefulSources)) {
    return synthesizeCompactLocalProjectBoard(usefulSources, sourceNotes);
  }

  if (profile.hasGame && profile.hasWebGl) {
    return projectBoardSynthesisDraftWithUxMockGate(synthesizeWebGlGameBoard(usefulSources, sourceNotes, profile), profile);
  }

  return synthesizeNonCreativeProjectBoardFallback(usefulSources, sourceNotes);
}

function projectBoardSynthesisShouldUseCompactLocalDraft(sources: ProjectBoardSynthesisSource[]): boolean {
  const scopeContract = projectBoardScopeContractFromTexts(projectBoardScopeContractTexts({ sources }));
  const planningDepth = projectBoardPlanningDepthFromScopeContract(scopeContract);
  const heavyIncluded = scopeContract.included.some((feature) =>
    ["auth", "accounts", "analytics", "sync", "collaboration", "backend", "payments", "deployment", "admin_reporting"].includes(feature),
  );
  return (
    planningDepth.level === "shallow" &&
    scopeContract.openQuestions.length === 0 &&
    !heavyIncluded &&
    sources.length <= 2 &&
    scopeContract.planningDepthHints.some((hint) =>
      /\b(small|simple|single[-\s]?file|single[-\s]?page|local|client[-\s]?side|static|utility|compact|lightweight)\b/i.test(hint),
    )
  );
}

function synthesizeCompactLocalProjectBoard(
  sources: ProjectBoardSynthesisSource[],
  sourceNotes: string[],
): ProjectBoardSynthesisDraft {
  const firstSource = sources[0];
  const title = projectBoardPlanDisplayTitle({
    artifactTitle: firstSource?.title,
    summary: firstSource?.summary,
    content: firstSource?.excerpt,
    fallback: "single-page app",
  });
  const sourceText = sources.map((source) => `${source.title}\n${source.summary}\n${source.excerpt ?? ""}`).join("\n\n");
  const goal = projectBoardPlanGoalFromText(sourceText) ?? `Implement ${title} from the saved durable plan.`;
  const sourceRefs = sources.slice(0, MAX_SOURCE_NOTES).map(sourceRef).filter(Boolean);
  const sourceBasis = withSourceBasis(
    [
      `Build the requested ${title} as the smallest useful local implementation from the saved plan.`,
      "Keep excluded and optional next-step features out of this first board increment.",
    ],
    sourceNotes,
  );

  return {
    summary: `Prepared a compact board for ${title}.`,
    goal,
    currentState: "A final durable plan exists; no executable board task has been created from it yet.",
    targetUser: "A user who wants the requested small browser utility implemented with minimal project-board overhead.",
    qualityBar: "Prove the local app implements the saved plan with a focused browser/manual smoke test and any available build check.",
    assumptions: ["Treat the saved durable plan as the source of truth for this compact increment."],
    questions: [],
    sourceNotes,
    cards: firstSource
      ? [
          {
            sourceId: `${SYNTHESIS_SOURCE_PREFIX}compact-local-app`,
            title: `Implement ${title}`,
            description: sourceBasis,
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Implementation",
            labels: ["implementation", "single-page-app", "scope:required"],
            blockedBy: [],
            acceptanceCriteria: [
              "The requested app behavior from the durable plan is implemented.",
              "Optional next steps and excluded features from the plan are not added.",
              "The app can be opened locally and verified against the saved plan's validation notes.",
            ],
            testPlan: {
              unit: [],
              integration: ["Run any available static/build check, or document that the app is plain browser HTML/CSS/JS."],
              visual: ["Open the app in a browser and confirm the visible workflow matches the plan."],
              manual: ["Exercise the main user workflow described by the durable plan."],
            },
            sourceRefs,
          },
        ]
      : [],
  };
}

function synthesizeNonCreativeProjectBoardFallback(
  sources: ProjectBoardSynthesisSource[],
  sourceNotes: string[],
): ProjectBoardSynthesisDraft {
  const firstSource = sources[0];
  const sourceLabel = firstSource?.path || firstSource?.title.trim() || "the included sources";
  return {
    summary: sources.length
      ? "Prepared source evidence for semantic Ambient/Pi board synthesis."
      : "No substantive sources were found for board synthesis.",
    goal: sources.length
      ? `Ask Ambient/Pi to derive executable cards semantically from ${sourceLabel}.`
      : "Wait for source material or user scope before creating executable board cards.",
    currentState: sources.length
      ? `Included source scan contains ${sources.length} source${sources.length === 1 ? "" : "s"}, but deterministic fallback did not create product cards.`
      : "No included source material is available.",
    targetUser: "Project contributors reviewing source-grounded board planning.",
    qualityBar: "Only create executable cards from semantic scope extraction or an explicitly saved durable plan; do not decompose product work from keyword fallback.",
    assumptions: ["Deterministic fallback intentionally does not infer product systems, features, dependencies, or card decomposition from source wording."],
    questions: [],
    sourceNotes,
    cards: [],
  };
}

export function buildProjectBoardSynthesisPrompt(input: {
  sources: ProjectBoardSynthesisSource[];
  projectName?: string;
  deterministicDraft?: ProjectBoardSynthesisDraft;
  refinement?: ProjectBoardSynthesisRefinementContext;
  planningProfileName?: ProjectBoardPlanningProfileName;
  plannerWorkspaceBlock?: string;
  charterProjectSummary?: ProjectBoardCharterProjectSummary;
}): string {
  const sources = input.sources
    .filter((source) => projectBoardSourceIncludedInSynthesis(source) && Boolean(source.title.trim() || source.summary.trim() || source.excerpt?.trim()))
    .sort((left, right) => right.relevance - left.relevance || left.title.localeCompare(right.title));
  const corpus = sources.map((source) => `${source.kind}\n${source.title}\n${source.summary}\n${source.excerpt ?? ""}\n${source.path ?? ""}`).join("\n\n");
  const inferredProfileName =
    input.planningProfileName ??
    (detectProjectProfile(corpus, sources).hasGame ? "gameplay-design" : undefined);
  const contract = buildProjectBoardPlanningContract({
    operation: input.refinement && isAdditiveProjectBoardRefinement(input.refinement) ? "source_elaboration" : "board_synthesis",
    projectName: input.projectName,
    profileName: inferredProfileName,
    charter: {
      goal: input.refinement?.previousDraft.goal ?? input.deterministicDraft?.goal,
      proofPolicy: input.refinement?.previousDraft.qualityBar ?? input.deterministicDraft?.qualityBar,
      decisionPolicy: input.refinement
        ? "Treat the supplied charter and PM Review answers as already settled unless they are incomplete or contradictory."
        : undefined,
      ...(input.charterProjectSummary ? { projectSummary: input.charterProjectSummary } : {}),
    },
    scopeContract: projectBoardScopeContractFromTexts(projectBoardScopeContractTexts({ sources, refinement: input.refinement })),
  });
  const excerptLimit = contract.planningDepth.level === "shallow" ? 6_000 : 20_000;
  const sourceLines = sources.map((source, index) =>
    [
      "",
      `--- SOURCE ${index + 1}: ${source.path || source.title} (${source.kind}, relevance ${source.relevance}) ---`,
      `Title: ${source.title}`,
      `Summary: ${source.summary}`,
      source.excerpt?.trim() ? `Excerpt:\n${source.excerpt.trim().slice(0, excerptLimit)}` : "",
    ].join("\n"),
  );
  const settledDecisionLedgerBlock = projectBoardSettledClarificationDecisionLedgerPromptBlock(input.refinement);
  return [
    contract.stablePromptHeader,
    "",
    "Build a project-board synthesis draft for the project corpus below.",
    input.projectName ? `Project: ${input.projectName}` : "",
    "",
    "Return JSON matching this exact shape:",
    JSON.stringify(
      {
        summary: "short synthesis summary",
        goal: "project goal",
        currentState: "what appears to exist now",
        targetUser: "who this is for",
        qualityBar: "proof/testing bar for board cards",
        assumptions: ["assumption"],
        questions: ["ambiguity question"],
        sourceNotes: ["source evidence note"],
        cards: [projectBoardPlannerSynthesisCardPromptExample()],
      },
      null,
      2,
    ),
    "",
    "Rules:",
    "- Propose several cards, not one broad task.",
    "- Respect the Scope contract in the stable planning header. Complexity may justify a slower phased plan, extra clarification, and smaller proofable cards, but it must not add capabilities or platform surfaces outside the structured scope contract.",
    ...projectBoardPlannerScopeCapabilityPromptRules({
      noun: "card",
      action: "Propose",
      optionalScopeTarget: "sourceNotes or questions",
    }),
    "- Keep generated cards inside the structured scope contract. Mention excluded or optional items only as out-of-scope notes or concrete questions.",
    "- For a nontrivial app/game board, the complete board should eventually cover the major source-described systems. It is acceptable for an initial batch to emit the next 2-3 highest-leverage executable cards when that lets Ambient start useful work immediately; sourceNotes should name important systems left for follow-up elaboration.",
    "- Prefer self-contained Local Task cards that can execute with little user interaction after approval.",
    ...projectBoardCardTitleQualityPromptRules(),
    "- Ask questions when the sources conflict instead of guessing final product decisions.",
    "- Use dependencies for true execution order, not vague preference.",
    PROJECT_BOARD_PLANNER_SYNTHESIS_PROOF_EXPECTATION_RULE,
    "- If the board includes user-facing UI, visual interaction, dashboard/forms, game canvas/HUD, or workflow screens, include an early UX mock approval card with sourceId synthesis:ux-mock-approval and uiMockRole mock_gate before implementation cards.",
    "- The UX mock approval card should require a self-contained HTML mock/spec artifact, desktop and narrow viewport review notes, and explicit user approval or revision feedback.",
    "- UI implementation cards that depend on that design should include synthesis:ux-mock-approval in blockedBy, uiMockRole gated_implementation, and requiresUiMockApproval true until the mock is approved; do not add this ceremony for backend-only, CLI-only, refactor-only, or test-only boards.",
    ...projectBoardPlannerProofScopePromptRuleLines(),
    "- Treat architecture, implementation plans, and functional specs as more authoritative than scratch TODO notes.",
    "- Treat long design documents and PRDs as authoritative product scope. Do not collapse them into generic charter/proof cards when they specify concrete systems.",
    "- For game projects, decompose named mechanics, engine stack, content systems, progression, input, combat, audio/visual, and proof paths into concrete cards grounded in the source text.",
    "- Do not merge separately described foundation, renderer, state/model, input/control, hazards/combat, HUD/session, and proof/regression work into a single broad card when the sources describe those systems independently.",
    "- Preserve the major system coverage of the deterministic baseline across the board plan or explicit follow-up elaboration notes unless source evidence proves two cards are truly duplicate work.",
    "- Keep the primary response compact. If you emit recovery artifacts, use an optional top-level progressiveRecords array with compact candidate_card/question/proposal_final/source_coverage/dependency_edge records; do not duplicate long card text there.",
    PROJECT_BOARD_PLANNER_SYNTHESIS_LAMBDA_RLM_RULE,
    "- Do not propose a generic 'clarify the charter' card when the kickoff answers and source corpus already specify the product direction.",
    ...projectBoardPlannerSynthesisClarificationPromptRules(),
    "- Keep sourceId values stable, lowercase, and prefixed with synthesis:.",
    ...contract.operationRules.map((rule) => `- ${rule}`),
    projectBoardPlannerPmReviewActivationPromptBlock(input.refinement?.pmReviewReport),
    settledDecisionLedgerBlock,
    input.plannerWorkspaceBlock ? ["", input.plannerWorkspaceBlock].join("\n") : "",
    input.deterministicDraft
      ? [
          "",
          "Deterministic baseline to refine, merge, or replace if you can do better:",
          JSON.stringify(input.deterministicDraft, null, 2),
        ].join("\n")
      : "",
    input.refinement
      ? [
          "",
          "Previous PM Review proposal or deterministic baseline to refine:",
          JSON.stringify(input.refinement.previousDraft, null, 2),
          "",
          "Settled charter and PM Review answers. Treat these as already answered unless they are incomplete or contradictory:",
          ...input.refinement.answers.map((item, index) => `${index + 1}. Q: ${item.question}\n   A: ${item.answer}`),
          "",
          "Refinement rules:",
          "- Incorporate these answers as stronger evidence than unresolved ambiguity in the raw corpus.",
          "- Do not ask the same charter question again when an answer already resolves it.",
          "- If an existing answer is insufficient, ask only for the missing delta and explain the remaining gap.",
          "- Remove questions that are fully answered, but keep or rewrite questions for any remaining ambiguity.",
          "- Update assumptions, card scope, dependencies, and proof expectations to reflect the answers.",
          "- Preserve the major system coverage of the deterministic baseline unless source evidence proves two cards are truly duplicate work.",
          "- Prefer stable sourceId values from the previous proposal when a card still represents the same work.",
          "- For additive Add Cards/source-scope passes, return only net-new cards. Do not repeat cards whose title or sourceId already appears in the previous draft.",
          "- If selected-source work depends on an existing card, reference that existing card in blockedBy instead of emitting a duplicate card.",
        ].join("\n")
      : "",
    "",
    "Project corpus:",
    ...sourceLines,
  ]
    .filter(Boolean)
    .join("\n");
}

export function projectBoardSettledClarificationDecisionLedger(
  refinement: ProjectBoardSynthesisRefinementContext | undefined,
  options: { limit?: number } = {},
): ProjectBoardSettledClarificationDecision[] {
  const limit = Math.max(1, Math.min(40, options.limit ?? 24));
  const ledger: ProjectBoardSettledClarificationDecision[] = [];
  for (const decision of refinement?.settledClarificationDecisions ?? []) {
    pushSettledClarificationDecision(ledger, decision, limit);
  }
  for (const answer of refinement?.answers ?? []) {
    pushSettledClarificationDecision(
      ledger,
      {
        id: projectBoardClarificationDecisionId(answer.question),
        canonicalKey: projectBoardClarificationCanonicalKey(answer.question),
        question: answer.question,
        answer: answer.answer,
        source: answer.source ?? projectBoardRefinementAnswerSource(answer.question),
        ...(answer.cardId ? { cardId: answer.cardId } : {}),
        ...(answer.cardTitle ? { cardTitle: answer.cardTitle } : {}),
      },
      limit,
    );
  }
  return ledger;
}

export function projectBoardSettledClarificationDecisionLedgerPromptBlock(
  refinement: ProjectBoardSynthesisRefinementContext | undefined,
  options: { limit?: number } = {},
): string {
  const ledger = projectBoardSettledClarificationDecisionLedger(refinement, options);
  if (ledger.length === 0) return "";
  return [
    "",
    "Settled clarification decision ledger:",
    "These canonical decisions have already been answered by the user or accepted through PM review. Treat them as stable planning context.",
    JSON.stringify(ledger, null, 2),
    "Settled-decision rules:",
    "- Do not ask any clarification question that has the same canonicalKey, same id, or near-duplicate wording as a settled decision above.",
    "- If materially changed source evidence reopens a settled decision, cite that changed source and ask only for the missing delta.",
    "- Reuse the settled decision id or canonicalKey when referring to the same ambiguity in candidate cards, source coverage, or question records.",
    "- If the settled answer removes the last blocker for a card, use ready_to_create instead of needs_clarification.",
    "- Keep new needs_clarification questions source-backed and implementation-blocking; do not ask generic preference questions when a professional default is defensible.",
  ].join("\n");
}

export function projectBoardSettledClarificationReopenViolations(
  refinement: ProjectBoardSynthesisRefinementContext | undefined,
  candidates: ProjectBoardClarificationQuestionCandidate[],
  options: { limit?: number } = {},
): ProjectBoardSettledClarificationReopenViolation[] {
  const ledger = projectBoardSettledClarificationDecisionLedger(refinement);
  if (ledger.length === 0) return [];
  const limit = Math.max(1, Math.min(40, options.limit ?? 20));
  const violations: ProjectBoardSettledClarificationReopenViolation[] = [];
  for (const candidate of candidates) {
    if (violations.length >= limit) break;
    const question = normalizeSettledClarificationQuestion(candidate.question).slice(0, 500);
    if (!question) continue;
    const candidateId = candidate.questionId?.trim() || projectBoardClarificationDecisionId(question);
    const candidateKey = projectBoardClarificationCanonicalKey(question);
    const match = ledger.find(
      (decision) =>
        decision.id === candidateId ||
        decision.canonicalKey === candidateKey ||
        projectBoardQuestionsAreNearDuplicates(decision.question, question),
    );
    if (!match) continue;
    violations.push({
      question,
      ...(candidate.questionId ? { questionId: candidate.questionId } : {}),
      ...(candidate.location ? { location: candidate.location } : {}),
      ...(candidate.cardId ? { cardId: candidate.cardId } : {}),
      ...(candidate.cardTitle ? { cardTitle: candidate.cardTitle } : {}),
      ...(candidate.sourceId ? { sourceId: candidate.sourceId } : {}),
      matchedDecisionId: match.id,
      matchedCanonicalKey: match.canonicalKey,
      matchedQuestion: match.question,
      matchedAnswer: match.answer,
      matchedSource: match.source,
      ...(match.cardId ? { matchedCardId: match.cardId } : {}),
      ...(match.cardTitle ? { matchedCardTitle: match.cardTitle } : {}),
    });
  }
  return violations;
}

export function projectBoardDuplicateClarificationQuestionViolations(
  candidates: ProjectBoardClarificationQuestionCandidate[],
  options: { limit?: number } = {},
): ProjectBoardDuplicateClarificationQuestionViolation[] {
  const limit = Math.max(1, Math.min(40, options.limit ?? 20));
  const seen: Array<{
    candidate: ProjectBoardClarificationQuestionCandidate;
    question: string;
    questionId?: string;
    canonicalKey: string;
  }> = [];
  const violations: ProjectBoardDuplicateClarificationQuestionViolation[] = [];
  for (const candidate of candidates) {
    if (violations.length >= limit) break;
    const question = normalizeSettledClarificationQuestion(candidate.question).slice(0, 500);
    if (!question) continue;
    const questionId = candidate.questionId?.trim() || undefined;
    const canonicalKey = projectBoardClarificationCanonicalKey(question);
    const match = seen.find((existing) => {
      if (questionId && existing.questionId && questionId === existing.questionId) return true;
      if (canonicalKey && existing.canonicalKey === canonicalKey) return true;
      return projectBoardQuestionsAreNearDuplicates(existing.question, question);
    });
    if (match) {
      const duplicateReason =
        questionId && match.questionId && questionId === match.questionId
          ? "question_id"
          : canonicalKey && match.canonicalKey === canonicalKey
            ? "canonical_key"
            : "near_duplicate";
      violations.push({
        canonicalKey,
        duplicateReason,
        firstQuestion: match.question,
        duplicateQuestion: question,
        ...(match.questionId ? { firstQuestionId: match.questionId } : {}),
        ...(questionId ? { duplicateQuestionId: questionId } : {}),
        ...(match.candidate.location ? { firstLocation: match.candidate.location } : {}),
        ...(candidate.location ? { duplicateLocation: candidate.location } : {}),
        ...(match.candidate.cardId ? { firstCardId: match.candidate.cardId } : {}),
        ...(candidate.cardId ? { duplicateCardId: candidate.cardId } : {}),
        ...(match.candidate.cardTitle ? { firstCardTitle: match.candidate.cardTitle } : {}),
        ...(candidate.cardTitle ? { duplicateCardTitle: candidate.cardTitle } : {}),
        ...(match.candidate.sourceId ? { firstSourceId: match.candidate.sourceId } : {}),
        ...(candidate.sourceId ? { duplicateSourceId: candidate.sourceId } : {}),
      });
      continue;
    }
    seen.push({ candidate, question, ...(questionId ? { questionId } : {}), canonicalKey });
  }
  return violations;
}

export function buildProjectBoardPmReviewReportPrompt(input: {
  sources: ProjectBoardSynthesisSource[];
  projectName?: string;
  deterministicDraft: ProjectBoardSynthesisDraft;
  refinement?: ProjectBoardSynthesisRefinementContext;
  charterProjectSummary?: ProjectBoardCharterProjectSummary;
  gitContext?: ProjectBoardPmReviewGitContext;
}): string {
  const sources = input.sources
    .filter((source) => projectBoardSourceIncludedInSynthesis(source) && Boolean(source.title.trim() || source.summary.trim() || source.excerpt?.trim()))
    .sort((left, right) => right.relevance - left.relevance || left.title.localeCompare(right.title));
  const sourceConfidenceInput = projectBoardPmReviewSourceConfidenceInput(input.sources);
  const contract = buildProjectBoardPlanningContract({
    operation: "charter_review",
    projectName: input.projectName,
    profileName: detectProjectProfile(
      sources.map((source) => `${source.kind}\n${source.title}\n${source.summary}\n${source.excerpt ?? ""}\n${source.path ?? ""}`).join("\n\n"),
      sources,
    ).hasGame
      ? "gameplay-design"
      : undefined,
    charter: {
      goal: input.refinement?.previousDraft.goal ?? input.deterministicDraft.goal,
      proofPolicy: input.refinement?.previousDraft.qualityBar ?? input.deterministicDraft.qualityBar,
      decisionPolicy: input.refinement
        ? "Treat supplied kickoff, charter, and prior PM Review answers as settled unless they are incomplete or contradictory."
        : "Review kickoff/charter readiness without generating cards.",
      ...(input.charterProjectSummary ? { projectSummary: input.charterProjectSummary } : {}),
    },
    scopeContract: projectBoardScopeContractFromTexts(projectBoardScopeContractTexts({ sources, refinement: input.refinement })),
  });
  const sourceLines = sources.slice(0, 40).map((source, index) =>
    [
      "",
      `--- SOURCE ${index + 1}: ${source.path || source.title} (${source.kind}, relevance ${source.relevance}) ---`,
      `Title: ${source.title}`,
      `Summary: ${source.summary}`,
      source.excerpt?.trim() ? `Excerpt:\n${source.excerpt.trim()}` : "",
    ].join("\n"),
  );
  const settledAnswers = input.refinement?.answers.map((item, index) => `${index + 1}. Q: ${item.question}\n   A: ${item.answer}`) ?? [];
  const settledDecisionLedgerBlock = projectBoardSettledClarificationDecisionLedgerPromptBlock(input.refinement);
  return [
    contract.stablePromptHeader,
    "",
    "Review the project charter and source evidence for PM readiness.",
    input.projectName ? `Project: ${input.projectName}` : "",
    "",
    "Return JSON matching this exact shape:",
    JSON.stringify(projectBoardPlannerPmReviewReportPromptExample(), null, 2),
    "",
    ...projectBoardPlannerPmReviewReadinessPromptLines(),
    "",
    ...projectBoardPlannerPmReviewSourceConfidencePromptLines(),
    "",
    ...projectBoardPlannerPmReviewGitStatePromptLines(),
    "",
    "Rules:",
    ...projectBoardPlannerPmReviewPromptRules(),
    "",
    "Deterministic baseline context:",
    JSON.stringify(
      {
        summary: input.deterministicDraft.summary,
        goal: input.deterministicDraft.goal,
        currentState: input.deterministicDraft.currentState,
        targetUser: input.deterministicDraft.targetUser,
        qualityBar: input.deterministicDraft.qualityBar,
        assumptions: input.deterministicDraft.assumptions,
        questions: input.deterministicDraft.questions,
        sourceNotes: input.deterministicDraft.sourceNotes,
        cardTitlesOnly: input.deterministicDraft.cards.map((card) => card.title),
      },
      null,
      2,
    ),
    settledAnswers.length > 0 ? ["", "Settled kickoff/charter/PM Review answers:", ...settledAnswers].join("\n") : "",
    settledDecisionLedgerBlock,
    "",
    "Source confidence input:",
    JSON.stringify(sourceConfidenceInput, null, 2),
    "",
    "Git coordination input:",
    JSON.stringify(input.gitContext ?? { mode: "unknown", message: "Git coordination status was not available to PM Review." }, null, 2),
    "",
    "Project source evidence:",
    ...sourceLines,
  ]
    .filter(Boolean)
    .join("\n");
}

function pushSettledClarificationDecision(
  ledger: ProjectBoardSettledClarificationDecision[],
  decision: ProjectBoardSettledClarificationDecision,
  limit: number,
): void {
  if (ledger.length >= limit) return;
  if (decision.source === "source_scope") return;
  const question = normalizeSettledClarificationQuestion(decision.question).slice(0, 500);
  const answer = decision.answer.trim().slice(0, 1500);
  if (!question || !answer) return;
  const canonicalKey = projectBoardClarificationCanonicalKey(question);
  if (
    ledger.some(
      (existing) =>
        existing.id === decision.id ||
        existing.canonicalKey === canonicalKey ||
        projectBoardQuestionsAreNearDuplicates(existing.question, question),
    )
  ) {
    return;
  }
  ledger.push({
    id: projectBoardClarificationDecisionId(question),
    canonicalKey,
    question,
    answer,
    source: decision.source,
    ...(decision.cardId ? { cardId: decision.cardId } : {}),
    ...(decision.cardTitle ? { cardTitle: decision.cardTitle.slice(0, 180) } : {}),
  });
}

function normalizeSettledClarificationQuestion(question: string): string {
  return question
    .trim()
    .replace(/^(?:charter kickoff|pm review|add cards objective|add cards source scope|add cards source context|existing board cards to avoid duplicating):\s*/i, "")
    .replace(/^card clarification(?:\s+\([^)]+\))?:\s*/i, "")
    .replace(/^q:\s*/i, "")
    .replace(/\s+/g, " ");
}

function projectBoardRefinementAnswerSource(question: string): ProjectBoardSynthesisRefinementAnswerSource {
  if (/^charter kickoff:/i.test(question)) return "charter";
  if (/^pm review:/i.test(question)) return "pm_review";
  if (/^card clarification/i.test(question)) return "card_clarification";
  if (/^add cards|^existing board cards to avoid duplicating:/i.test(question)) return "source_scope";
  return "manual";
}

export function projectBoardSynthesisDraftFromPmReviewReport(input: {
  report: ProjectBoardPmReviewReport;
  baseline: ProjectBoardSynthesisDraft;
}): ProjectBoardSynthesisDraft {
  return {
    ...input.baseline,
    summary: input.report.summary || "Pi charter review ready.",
    questions: input.report.blockingQuestions,
    sourceNotes: [
      `Source confidence: ${input.report.sourceConfidence}`,
      ...input.report.sourceConfidenceNotes.map((note) => `Source confidence: ${note}`),
      `Git state: ${input.report.gitState}`,
      ...input.report.gitStateNotes.map((note) => `Git state: ${note}`),
      ...input.report.sourceAuthorityNotes.map((note) => `Authority: ${note}`),
      ...input.report.sourceConflicts.map((conflict) => `Conflict: ${conflict}`),
      ...input.report.risks.map((risk) => `Risk: ${risk}`),
      input.report.recommendedActivationScope ? `Recommendation: ${input.report.recommendedActivationScope}` : "",
    ].filter(Boolean),
    cards: [],
  };
}

export function projectBoardPmReviewGitContextFromStatus(status: ProjectBoardGitSyncStatus): ProjectBoardPmReviewGitContext {
  return {
    mode: status.mode,
    isGitRepository: status.isGitRepository,
    hasRemote: status.hasRemote,
    ahead: status.ahead,
    behind: status.behind,
    dirtyBoardFileCount: status.dirtyBoardFileCount,
    dirtyBoardFiles: status.dirtyBoardFiles.slice(0, 20),
    ...(status.branch ? { branch: status.branch } : {}),
    ...(status.upstream ? { upstream: status.upstream } : {}),
    ...(status.projection ? { projectionValid: status.projection.valid, projectionDifferenceCount: status.projection.differences.length } : {}),
    ...(status.lastBoardCommit
      ? {
          lastBoardCommit: {
            shortHash: status.lastBoardCommit.shortHash,
            subject: status.lastBoardCommit.subject,
            committedAt: status.lastBoardCommit.committedAt,
          },
        }
      : {}),
    ...(status.message ? { message: status.message } : {}),
  };
}

function projectBoardPmReviewSourceConfidenceInput(sources: ProjectBoardSynthesisSource[]) {
  const included = sources.filter(projectBoardSourceIncludedInSynthesis);
  const confidenceValues = included
    .map((source) => source.classificationConfidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const changedSourceCount = included.filter((source) => source.changeState === "changed").length;
  const removedSourceCount = sources.filter((source) => source.changeState === "removed").length;
  const newSourceCount = included.filter((source) => source.changeState === "new").length;
  const primarySourceCount = included.filter((source) => source.authorityRole === "primary").length;
  const proofSourceCount = included.filter((source) => source.authorityRole === "proof" || source.kind === "test_artifact").length;
  const averageClassificationConfidence =
    confidenceValues.length > 0
      ? Math.round((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length) * 100) / 100
      : undefined;

  return {
    sourceCount: sources.length,
    includedSourceCount: included.length,
    ignoredSourceCount: sources.length - included.length,
    primarySourceCount,
    proofSourceCount,
    newSourceCount,
    changedSourceCount,
    removedSourceCount,
    averageClassificationConfidence,
    highRelevanceSources: included
      .slice()
      .sort((left, right) => right.relevance - left.relevance || left.title.localeCompare(right.title))
      .slice(0, 12)
      .map((source) => ({
        id: source.id ?? source.sourceKey ?? source.path ?? source.title,
        title: source.title,
        path: source.path,
        kind: source.kind,
        relevance: source.relevance,
        authorityRole: source.authorityRole,
        classificationConfidence: source.classificationConfidence,
        changeState: source.changeState,
      })),
  };
}

export function projectBoardSynthesisDraftFromProposal(proposal: ProjectBoardSynthesisProposal): ProjectBoardSynthesisDraft {
  return {
    summary: proposal.summary,
    goal: proposal.goal,
    currentState: proposal.currentState,
    targetUser: proposal.targetUser,
    qualityBar: proposal.qualityBar,
    assumptions: proposal.assumptions,
    questions: proposal.questions,
    sourceNotes: proposal.sourceNotes,
    cards: proposal.cards.map((card) => ({
      sourceId: card.sourceId,
      title: card.title,
      description: card.description,
      candidateStatus: card.candidateStatus,
      priority: card.priority,
      phase: card.phase,
      labels: card.labels,
      blockedBy: card.blockedBy,
      acceptanceCriteria: card.acceptanceCriteria,
      testPlan: card.testPlan,
      sourceRefs: card.sourceRefs,
      clarificationQuestions: card.clarificationQuestions ?? [],
      clarificationSuggestions: card.clarificationSuggestions ?? [],
      clarificationDecisions: card.clarificationDecisions ?? [],
      objectiveProvenance: card.objectiveProvenance,
      // Dropping these degraded UX-mock gating to text heuristics on refinement
      // round trips (the progressive-record mapper already carries both).
      uiMockRole: card.uiMockRole,
      requiresUiMockApproval: card.requiresUiMockApproval,
    })),
  };
}

function fallbackProjectBoardClarificationQuestionsForCandidate(input: {
  title: string;
  candidateStatus: ProjectBoardCardCandidateStatus;
  clarificationQuestions?: string[];
  clarificationDecisions?: ProjectBoardCardClarificationDecision[];
  acceptanceCriteria?: string[];
  testPlan?: Partial<ProjectBoardCardTestPlan>;
}): string[] {
  const explicitQuestions = stringArray(input.clarificationQuestions, "clarificationQuestions", 8, 500);
  const hasDecisionQuestions = (input.clarificationDecisions ?? []).some(
    (decision) => typeof decision?.question === "string" && decision.question.trim(),
  );
  if (hasDecisionQuestions) return explicitQuestions;
  if (input.candidateStatus !== "needs_clarification" || explicitQuestions.length > 0) return explicitQuestions;
  const title = input.title.trim() || "this card";
  const proofCount = Object.values(input.testPlan ?? {}).reduce(
    (sum, value) => sum + (Array.isArray(value) ? value.length : 0),
    0,
  );
  if ((input.acceptanceCriteria ?? []).length === 0 || proofCount === 0) {
    return [`What acceptance criteria and proof should make "${title}" complete enough to move to Ready To Create?`];
  }
  return [`What PM decision is still required before "${title}" can move to Ready To Create?`];
}

export function projectBoardClarificationDecisionsForCandidate(input: {
  title: string;
  candidateStatus: ProjectBoardCardCandidateStatus;
  description?: string;
  clarificationDecisions?: ProjectBoardCardClarificationDecision[];
  clarificationQuestions?: string[];
  clarificationSuggestions?: ProjectBoardCardClarificationSuggestion[];
  acceptanceCriteria?: string[];
  testPlan?: Partial<ProjectBoardCardTestPlan>;
}): ProjectBoardCardClarificationDecision[] {
  return projectBoardStructuredClarificationDecisions({
    clarificationDecisions: input.clarificationDecisions,
    clarificationQuestions: fallbackProjectBoardClarificationQuestionsForCandidate(input),
    clarificationSuggestions: input.clarificationSuggestions,
    description: input.description,
    acceptanceCriteria: input.acceptanceCriteria,
    includeInlineQuestions: false,
    limit: 20,
  });
}

export function projectBoardClarificationQuestionsForCandidate(input: {
  title: string;
  candidateStatus: ProjectBoardCardCandidateStatus;
  description?: string;
  clarificationDecisions?: ProjectBoardCardClarificationDecision[];
  clarificationQuestions?: string[];
  clarificationSuggestions?: ProjectBoardCardClarificationSuggestion[];
  acceptanceCriteria?: string[];
  testPlan?: Partial<ProjectBoardCardTestPlan>;
}): string[] {
  return projectBoardClarificationDecisionsForCandidate(input)
    .filter((decision) => decision.state === "open")
    .map((decision) => decision.question)
    .slice(0, 8);
}

export function projectBoardClarificationSuggestionsForCandidate(input: {
  title: string;
  candidateStatus: ProjectBoardCardCandidateStatus;
  description?: string;
  clarificationDecisions?: ProjectBoardCardClarificationDecision[];
  clarificationQuestions?: string[];
  clarificationSuggestions?: ProjectBoardCardClarificationSuggestion[];
  acceptanceCriteria?: string[];
  testPlan?: Partial<ProjectBoardCardTestPlan>;
}): ProjectBoardCardClarificationSuggestion[] {
  const decisions = projectBoardClarificationDecisionsForCandidate(input);
  const questions = decisions.filter((decision) => decision.state === "open").map((decision) => decision.question);
  return clarificationSuggestionsForQuestions(
    dedupeClarificationSuggestions([
      ...(input.clarificationSuggestions ?? []),
      ...clarificationSuggestionsFromDecisions(decisions),
    ]),
    questions,
  );
}

export function isAdditiveProjectBoardRefinement(refinement: ProjectBoardSynthesisRefinementContext): boolean {
  if (refinement.mode) return refinement.mode === "additive";
  // Legacy fallback for refinement contexts persisted before the explicit mode flag.
  // Match only the exact system-authored Add Cards prompt markers — loose phrases like
  // "avoid duplicating" appear in organic user answers and would silently switch the
  // run to additive, where duplicate filtering can drop every refined card.
  const text = refinement.answers.map((answer) => `${answer.question}\n${answer.answer}`).join("\n").toLowerCase();
  return text.includes("this is an additive add cards operation") || text.includes("existing board cards to avoid duplicating");
}

export function projectBoardScopeContractTexts(input: {
  sources?: ProjectBoardSynthesisSource[];
  refinement?: ProjectBoardSynthesisRefinementContext;
  pmReviewReport?: ProjectBoardPmReviewReport;
}): string[] {
  const report = input.pmReviewReport ?? input.refinement?.pmReviewReport;
  const sources = input.sources?.filter(projectBoardSourceIncludedInSynthesis) ?? [];
  return [
    ...sources.map((source) => `${source.title}\n${source.summary}\n${source.excerpt ?? ""}`),
    input.refinement?.previousDraft.goal ?? "",
    input.refinement?.previousDraft.summary ?? "",
    ...(input.refinement?.previousDraft.assumptions ?? []),
    ...(input.refinement?.previousDraft.sourceNotes ?? []),
    ...(input.refinement?.answers.map((answer) => `${answer.question}\n${answer.answer}`) ?? []),
    report?.recommendedActivationScope ?? "",
    ...(report?.cardGenerationConstraints ?? []),
    ...(report?.sourceAuthorityNotes ?? []),
  ];
}

export function normalizeProjectBoardSynthesisDraft(
  value: unknown,
  options: { uxMockGate?: "auto" | "preserve" | "off" } = {},
): ProjectBoardSynthesisDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Project board synthesis output must be an object.");
  }
  const input = value as Record<string, unknown>;
  const cards = arrayValue(input.cards, "cards").map(normalizeProjectBoardSynthesisCard);
  if (cards.length === 0) throw new Error("Project board synthesis output must include at least one card.");
  const cardClarificationQuestions = cards.flatMap((card) => card.clarificationQuestions ?? []);
  const questions = stringArray(input.questions, "questions", 12, 500).filter(
    (question) => !cardClarificationQuestions.some((cardQuestion) => projectBoardQuestionsAreNearDuplicates(cardQuestion, question)),
  );
  const draft: ProjectBoardSynthesisDraft = {
    summary: requiredString(input.summary, "summary").slice(0, 500),
    goal: requiredString(input.goal, "goal").slice(0, 2000),
    currentState: requiredString(input.currentState, "currentState").slice(0, 2000),
    targetUser: requiredString(input.targetUser, "targetUser").slice(0, 1000),
    qualityBar: requiredString(input.qualityBar, "qualityBar").slice(0, 2000),
    assumptions: stringArray(input.assumptions, "assumptions", 20, 500),
    questions,
    sourceNotes: stringArray(input.sourceNotes, "sourceNotes", 20, 500),
    cards,
  };
  if (options.uxMockGate === "off") return draft;
  if (options.uxMockGate === "preserve") {
    const existingMockCard = draft.cards.find(projectBoardCardIsUxMockGate);
    return existingMockCard ? projectBoardSynthesisDraftWithCanonicalUxMockDependencies(draft, existingMockCard.sourceId) : draft;
  }
  return projectBoardSynthesisDraftWithUxMockGate(draft);
}

export function normalizeProjectBoardPmReviewReport(value: unknown): ProjectBoardPmReviewReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Project board PM review report must be an object.");
  }
  const input = value as Record<string, unknown>;
  const readiness =
    typeof input.readiness === "string" && PROJECT_BOARD_PM_REVIEW_READINESS.has(input.readiness as ProjectBoardPmReviewReadiness)
      ? (input.readiness as ProjectBoardPmReviewReadiness)
      : "needs_answers";
  const sourceConfidence =
    typeof input.sourceConfidence === "string" &&
    PROJECT_BOARD_PM_REVIEW_SOURCE_CONFIDENCE.has(input.sourceConfidence as ProjectBoardPmReviewSourceConfidence)
      ? (input.sourceConfidence as ProjectBoardPmReviewSourceConfidence)
      : "unknown";
  const gitState =
    typeof input.gitState === "string" && PROJECT_BOARD_PM_REVIEW_GIT_STATE.has(input.gitState as ProjectBoardPmReviewGitState)
      ? (input.gitState as ProjectBoardPmReviewGitState)
      : "unknown";
  return {
    readiness,
    summary: requiredString(input.summary, "summary").slice(0, 1000),
    sourceConfidence,
    sourceConfidenceNotes: stringArray(input.sourceConfidenceNotes, "sourceConfidenceNotes", 20, 500),
    gitState,
    gitStateNotes: stringArray(input.gitStateNotes, "gitStateNotes", 20, 500),
    blockingQuestions: stringArray(input.blockingQuestions, "blockingQuestions", 12, 500),
    risks: stringArray(input.risks, "risks", 20, 500),
    sourceConflicts: stringArray(input.sourceConflicts, "sourceConflicts", 20, 500),
    sourceAuthorityNotes: stringArray(input.sourceAuthorityNotes, "sourceAuthorityNotes", 20, 500),
    recommendedActivationScope: requiredString(input.recommendedActivationScope, "recommendedActivationScope").slice(0, 1200),
    cardGenerationConstraints: stringArray(input.cardGenerationConstraints, "cardGenerationConstraints", 20, 500),
  };
}

function normalizeProjectBoardSynthesisCard(value: unknown, index: number): ProjectBoardSynthesisCardInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`cards[${index}] must be an object.`);
  }
  const input = value as Record<string, unknown>;
  const rawSourceId = stableSynthesisSourceId(requiredString(input.sourceId, `cards[${index}].sourceId`));
  const labels = stringArray(input.labels, `cards[${index}].labels`, 20, 60);
  const rawUiMockRole = normalizeProjectBoardUiMockRole(input.uiMockRole);
  const isUxMockGate =
    rawUiMockRole === "mock_gate" ||
    rawSourceId === UX_MOCK_GATE_SOURCE_ID ||
    labels.some((label) => label.toLowerCase() === UX_MOCK_GATE_LABEL);
  const sourceId = isUxMockGate ? UX_MOCK_GATE_SOURCE_ID : rawSourceId;
  const title = requiredString(input.title, `cards[${index}].title`).slice(0, 180);
  assertProjectBoardCardTitleQuality([{ title, sourceId, location: `cards[${index}].title` }], {
    surface: "board_synthesis",
  });
  const rawCandidateStatus = typeof input.candidateStatus === "string" && PROJECT_BOARD_CARD_CANDIDATE_STATUSES.has(input.candidateStatus as ProjectBoardCardCandidateStatus)
    ? (input.candidateStatus as ProjectBoardCardCandidateStatus)
    : "needs_clarification";
  const candidateStatus = isUxMockGate ? "ready_to_create" : rawCandidateStatus;
  const explicitClarificationQuestions = isUxMockGate ? [] : stringArray(input.clarificationQuestions, `cards[${index}].clarificationQuestions`, 8, 500);
  const explicitClarificationDecisions = isUxMockGate ? [] : clarificationDecisionsArray(input.clarificationDecisions, `cards[${index}].clarificationDecisions`, 20);
  const uiMockRole: ProjectBoardUiMockRole | undefined = isUxMockGate ? "mock_gate" : rawUiMockRole;
  const testPlanInput = input.testPlan && typeof input.testPlan === "object" && !Array.isArray(input.testPlan)
    ? (input.testPlan as Record<string, unknown>)
    : {};
  const normalized = {
    sourceId,
    title,
    description: requiredString(input.description, `cards[${index}].description`).slice(0, 4000),
    candidateStatus,
    priority: typeof input.priority === "number" && Number.isFinite(input.priority) ? Math.max(1, Math.round(input.priority)) : undefined,
    phase: typeof input.phase === "string" && input.phase.trim() ? input.phase.trim().slice(0, 120) : undefined,
    labels,
    blockedBy: stringArray(input.blockedBy, `cards[${index}].blockedBy`, 50, 120).map(stableSynthesisSourceId),
    acceptanceCriteria: stringArray(input.acceptanceCriteria, `cards[${index}].acceptanceCriteria`, 30, 500),
    testPlan: {
      unit: stringArray(testPlanInput.unit, `cards[${index}].testPlan.unit`, 20, 500),
      integration: stringArray(testPlanInput.integration, `cards[${index}].testPlan.integration`, 20, 500),
      visual: stringArray(testPlanInput.visual, `cards[${index}].testPlan.visual`, 20, 500),
      manual: stringArray(testPlanInput.manual, `cards[${index}].testPlan.manual`, 20, 500),
    },
    sourceRefs: stringArray(input.sourceRefs, `cards[${index}].sourceRefs`, 20, 500),
    clarificationQuestions: explicitClarificationQuestions,
    clarificationSuggestions: clarificationSuggestionsArray(input.clarificationSuggestions, `cards[${index}].clarificationSuggestions`, 8),
    clarificationDecisions: explicitClarificationDecisions,
    uiMockRole,
    requiresUiMockApproval: isUxMockGate ? false : typeof input.requiresUiMockApproval === "boolean" ? input.requiresUiMockApproval : undefined,
  };
  const clarificationDecisions = projectBoardClarificationDecisionsForCandidate(normalized);
  const clarificationQuestions = projectBoardClarificationQuestionsForCandidate({
    ...normalized,
    clarificationDecisions,
  });
  return {
    ...normalized,
    clarificationDecisions,
    clarificationQuestions,
    clarificationSuggestions: projectBoardClarificationSuggestionsForCandidate({
      ...normalized,
      clarificationDecisions,
      clarificationQuestions,
    }),
  };
}

function synthesizeWebGlGameBoard(
  sources: ProjectBoardSynthesisSource[],
  sourceNotes: string[],
  profile: ProjectProfile,
): ProjectBoardSynthesisDraft {
  const sourceRefs = sources.slice(0, MAX_SOURCE_NOTES).map(sourceRef).filter(Boolean);
  const architectureRefs = sourceRefsForKinds(sources, ["architecture_artifact", "implementation_plan", "functional_spec"]);
  const proofRefs = sourceRefsForKinds(sources, ["test_artifact", "implementation_file"]);
  const candidateStatus: ProjectBoardCardCandidateStatus = "needs_clarification";
  const renderStack = profile.hasPixi ? "PixiJS/HTML5 canvas" : profile.hasThree ? "Three.js/WebGL" : "WebGL/canvas";
  const physicsStack = profile.hasMatter ? " with Matter.js physics boundaries" : "";
  const shellId = `${SYNTHESIS_SOURCE_PREFIX}${profile.hasPixi ? "pixijs-game-shell" : "webgl-game-shell"}`;
  const controlsId = `${SYNTHESIS_SOURCE_PREFIX}ship-controls`;
  const encounterId = `${SYNTHESIS_SOURCE_PREFIX}enemy-encounters`;
  const loopId = `${SYNTHESIS_SOURCE_PREFIX}game-loop-hud`;
  const proofId = `${SYNTHESIS_SOURCE_PREFIX}playable-proof`;

  const questions = [
    profile.mentionsArcadeAndInertia
      ? "Should the ship use immediate arcade controls or inertia-based thrust as the authoritative feel?"
      : "",
    profile.mentionsKeyboardAndTouch ? "Is keyboard-only acceptable for the first board pass, or should touch/gamepad input be in scope now?" : "",
    profile.mentionsWavesAndEndless ? "Should the first playable slice use discrete waves or endless spawning?" : "",
    profile.hasTests ? "" : "Which proof command should be authoritative for the first playable game slice?",
  ].filter(Boolean);

  const assumptions = [
    `${renderStack} is the intended rendering stack unless the kickoff interview says otherwise.`,
    "Prioritize a playable vertical slice over broad content creation.",
    "Cards should remain self-contained enough for Local Task execution with minimal user intervention.",
  ];

  return {
    summary: `Synthesized a draft board for a browser spaceship-game project using ${renderStack}.`,
    goal: `Build a playable browser-based ${renderStack} spaceship game through independently executable project-board cards.`,
    currentState: currentStateSummary(sources, "The project already has enough artifacts to infer a game shell, controls, encounter loop, HUD, and proof path."),
    targetUser: "A developer or designer iterating on a browser game prototype.",
    qualityBar:
      "Each card should define playable behavior, acceptance criteria, and proof commands or visual/manual checks before ticketization.",
    assumptions,
    questions,
    sourceNotes,
    cards: [
      {
        sourceId: shellId,
        title: profile.hasPixi ? "Create the PixiJS game shell" : "Create the WebGL game shell",
        description: withSourceBasis(
          [
            `Set up the ${renderStack} application shell, render loop, resize handling, and a nonblank space scene that can host the rest of the game.`,
            `Keep the shell narrow: canvas mount, renderer lifecycle, initial scene/camera, and a minimal update loop${physicsStack}.`,
          ],
          sourceNotes,
        ),
        candidateStatus,
        priority: 1,
        phase: "Foundation",
        labels: [profile.hasPixi ? "pixijs" : "webgl", "game", "foundation"],
        blockedBy: [],
        sourceRefs: architectureRefs.length ? architectureRefs : sourceRefs,
        clarificationQuestions: [`Should ${renderStack} be treated as the authoritative first-slice rendering stack?`],
        acceptanceCriteria: [
          "The app starts without runtime errors and mounts exactly one game canvas.",
          "The canvas renders a nonblank space scene with stable resize behavior.",
          "The render loop exposes a clear update boundary for future gameplay systems.",
        ],
        testPlan: {
          unit: ["Cover pure game-state initialization or render-loop helpers where practical."],
          integration: ["Run the app/test command and verify the game canvas mounts successfully."],
          visual: ["Capture a desktop screenshot proving the canvas is nonblank and correctly framed."],
          manual: ["Open the game locally and confirm the scene remains stable while resizing the window."],
        },
      },
      {
        sourceId: controlsId,
        title: "Implement ship controls and motion",
        description: withSourceBasis(
          [
            "Add the player ship, input mapping, motion update, bounds handling, and any chosen thrust/arcade behavior.",
            "This card should settle only the first playable control model; later tuning can become follow-up cards.",
          ],
          sourceNotes,
        ),
        candidateStatus,
        priority: 2,
        phase: "Core Gameplay",
        labels: ["controls", "gameplay", "player-ship"],
        blockedBy: [shellId],
        sourceRefs: architectureRefs.length ? architectureRefs : sourceRefs,
        clarificationQuestions: [
          profile.mentionsArcadeAndInertia
            ? "Should the ship use immediate arcade controls or inertia-based thrust as the authoritative feel?"
            : "What should the first playable ship control feel optimize for: arcade responsiveness, physical drift, or another model?",
        ],
        acceptanceCriteria: [
          "Keyboard input moves the ship consistently within the playable area.",
          "Motion behavior matches the kickoff answer or the documented default assumption.",
          "Ship position/state can be tested without depending on a full browser render.",
        ],
        testPlan: {
          unit: ["Test input-to-motion updates, bounds clamping, and reset behavior."],
          integration: ["Exercise input events through the game-loop boundary and verify ship state changes without depending on screenshot proof."],
          visual: [],
          manual: ["Confirm controls feel responsive enough for the first playable slice."],
        },
      },
      {
        sourceId: encounterId,
        title: "Add enemy encounters and collisions",
        description: withSourceBasis(
          [
            "Introduce the first enemy/obstacle system, spawn pacing, collision detection, and damage or failure state.",
            "Keep content minimal so the result is testable and does not balloon into a full game design pass.",
          ],
          sourceNotes,
        ),
        candidateStatus,
        priority: 3,
        phase: "Core Gameplay",
        labels: ["combat", "collisions", "encounters"],
        blockedBy: [controlsId],
        sourceRefs: architectureRefs.length ? architectureRefs : sourceRefs,
        clarificationQuestions: ["What is the minimal enemy or obstacle behavior that should define the first playable encounter?"],
        acceptanceCriteria: [
          "Enemies or obstacles spawn in a predictable first-pass pattern.",
          "Collision logic changes game state in a visible and testable way.",
          "The implementation leaves spawn tuning data isolated from rendering details.",
        ],
        testPlan: {
          unit: ["Test spawn scheduling, collision detection, and damage/failure state updates."],
          integration: ["Run the app and verify an encounter can occur in the playable scene."],
          visual: ["Capture proof of enemy/obstacle rendering and collision feedback."],
          manual: ["Play through one short encounter and record any tuning follow-ups."],
        },
      },
      {
        sourceId: loopId,
        title: "Build the game loop HUD and session states",
        description: withSourceBasis(
          [
            "Add start/play/game-over state transitions, score or survival-time HUD, and restart behavior.",
            "This should make the prototype feel like a complete loop without adding broad progression systems.",
          ],
          sourceNotes,
        ),
        candidateStatus,
        priority: 4,
        phase: "Playable Slice",
        labels: ["hud", "game-loop", "session-state"],
        blockedBy: [encounterId],
        sourceRefs: sourceRefs,
        clarificationQuestions: [
          profile.mentionsWavesAndEndless ? "Should the first playable loop use discrete waves or endless spawning?" : "What HUD metric best proves the first playable loop: score, survival time, health, or another metric?",
        ],
        acceptanceCriteria: [
          "The game has clear start, active, and terminal states.",
          "HUD communicates the current score, time, health, or equivalent first-pass metric.",
          "Restarting returns gameplay to a clean initial state.",
        ],
        testPlan: {
          unit: ["Test session-state transitions and restart/reset helpers."],
          integration: ["Verify the HUD updates during a local playable run."],
          visual: ["Capture start/play/game-over or equivalent state screenshots."],
          manual: ["Play one complete loop from start through restart."],
        },
      },
      {
        sourceId: proofId,
        title: "Add playable-slice proof and regression checks",
        description: withSourceBasis(
          [
            "Create the proof path for the board: deterministic tests, browser smoke coverage where possible, and a repeatable manual/visual checklist.",
            "This card should make future Local Task execution able to prove game behavior rather than relying on narrative completion.",
          ],
          sourceNotes,
        ),
        candidateStatus,
        priority: 5,
        phase: "Proof",
        labels: ["tests", "proof", "quality"],
        blockedBy: [loopId],
        sourceRefs: proofRefs.length ? proofRefs : sourceRefs,
        clarificationQuestions: ["Which local command or manual checklist should be authoritative for proving the playable slice works?"],
        acceptanceCriteria: [
          "There is a documented command or checklist for proving the playable slice works.",
          "Core pure logic has automated test coverage.",
          "Visual/manual proof expectations are captured for future board cards.",
        ],
        testPlan: {
          unit: ["Run the unit test command for game-state and helper logic."],
          integration: ["Run the local smoke path that starts the app and verifies the playable slice entry point."],
          visual: ["Keep visual proof optional but documented for desktop and narrow viewport checks."],
          manual: ["Record the exact manual playthrough expected before a card can move to Done."],
        },
      },
    ],
  };
}


const UX_MOCK_GATE_SOURCE_ID = `${SYNTHESIS_SOURCE_PREFIX}ux-mock-approval`;
const UX_MOCK_GATE_LABEL = "ux-mock-approval";

function projectBoardSynthesisDraftWithUxMockGate(
  draft: ProjectBoardSynthesisDraft,
  profile?: Pick<ProjectProfile, "hasUserInterface" | "hasGame" | "hasWebGl">,
): ProjectBoardSynthesisDraft {
  if (draft.cards.length === 0) return draft;
  const existingMockCard = draft.cards.find(projectBoardCardIsUxMockGate);
  if (existingMockCard) {
    return projectBoardSynthesisDraftWithCanonicalUxMockDependencies(draft, existingMockCard.sourceId);
  }
  if (!projectBoardDraftNeedsUxMockGate(draft, profile)) return draft;

  const mockCard = projectBoardUxMockGateCard(draft);
  const gatedCards = projectBoardSynthesisCardsWithUxMockDependencies(draft.cards, mockCard.sourceId);
  return {
    ...draft,
    assumptions: [
      ...draft.assumptions,
      "User-facing UI implementation should wait for a reviewable UX mock/spec artifact before downstream cards are ticketized.",
    ].slice(0, 20),
    sourceNotes: [
      ...draft.sourceNotes,
      "UX mock approval gate: UI-affecting implementation cards depend on synthesis:ux-mock-approval until the mock is reviewed.",
    ].slice(0, 20),
    cards: [mockCard, ...gatedCards],
  };
}

function projectBoardSynthesisDraftWithCanonicalUxMockDependencies(
  draft: ProjectBoardSynthesisDraft,
  mockGateSourceId: string,
): ProjectBoardSynthesisDraft {
  return {
    ...draft,
    cards: projectBoardSynthesisCardsWithUxMockDependencies(draft.cards, mockGateSourceId),
  };
}

function projectBoardSynthesisCardsWithUxMockDependencies(
  cards: ProjectBoardSynthesisCardInput[],
  mockGateSourceId: string,
): ProjectBoardSynthesisCardInput[] {
  return cards.map((card) => {
    if (card.sourceId === mockGateSourceId || projectBoardCardIsUxMockGate(card)) return card;
    if (!projectBoardSynthesisCardRequiresUxMockDependency(card)) return card;
    return {
      ...card,
      blockedBy: [...new Set([mockGateSourceId, ...card.blockedBy])],
      labels: [...new Set([...card.labels, "ux-mock-gated"])],
      uiMockRole: "gated_implementation",
      requiresUiMockApproval: true,
    };
  });
}

function projectBoardSynthesisCardRequiresUxMockDependency(card: ProjectBoardSynthesisCardInput): boolean {
  return Boolean(card.uiMockRole === "gated_implementation" || card.requiresUiMockApproval || projectBoardSynthesisCardTouchesUi(card));
}

function projectBoardUxMockGateCard(draft: ProjectBoardSynthesisDraft): ProjectBoardSynthesisCardInput {
  const sourceRefs = [...new Set(draft.cards.flatMap((card) => card.sourceRefs).filter(Boolean))].slice(0, 8);
  return {
    sourceId: UX_MOCK_GATE_SOURCE_ID,
    title: "Create UX mock for approval",
    description: [
      "Create a self-contained HTML mock/spec artifact for the user-facing surface before downstream UI implementation is ticketized.",
      "The mock should show the intended layout, primary states, interaction affordances, responsive/narrow viewport treatment, and any visual acceptance notes needed for implementation.",
      "Downstream UI cards should remain blocked until the user approves the mock or provides revision feedback.",
    ].join(" "),
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "UX Review",
    labels: [UX_MOCK_GATE_LABEL, "ux", "html"],
    blockedBy: [],
    uiMockRole: "mock_gate",
    requiresUiMockApproval: false,
    acceptanceCriteria: [
      "A self-contained HTML mock/spec artifact exists and can be previewed locally without remote assets.",
      "The mock covers desktop and narrow viewport layouts for the primary user-facing flow.",
      "The artifact includes enough visual and interaction detail for downstream implementation cards to follow.",
      "User approval, rejection, or revision feedback is recorded before UI implementation proceeds.",
    ],
    testPlan: {
      unit: [],
      integration: ["Open the generated HTML mock locally and verify it renders without external dependencies."],
      visual: ["Capture desktop and narrow viewport screenshots of the mock for review."],
      manual: ["User reviews the mock and records approve, reject, or revision feedback."],
    },
    sourceRefs,
    clarificationQuestions: [],
    clarificationSuggestions: [],
    clarificationDecisions: [],
  };
}

function projectBoardCardIsUxMockGate(card: Pick<ProjectBoardSynthesisCardInput, "sourceId" | "title" | "labels" | "description"> & { uiMockRole?: ProjectBoardUiMockRole }): boolean {
  if (card.uiMockRole === "mock_gate") return true;
  const haystack = `${card.sourceId}\n${card.title}\n${card.description}`.toLowerCase();
  return (
    card.sourceId === UX_MOCK_GATE_SOURCE_ID ||
    card.labels.some((label) => label.toLowerCase() === UX_MOCK_GATE_LABEL) ||
    /\b(ux|ui|user interface)\b.{0,40}\b(mock|prototype|wireframe|approval|review)\b/.test(haystack) ||
    /\b(mock|prototype|wireframe)\b.{0,40}\b(ux|ui|user interface|approval|review)\b/.test(haystack)
  );
}

function normalizeProjectBoardUiMockRole(value: unknown): ProjectBoardUiMockRole | undefined {
  return value === "mock_gate" || value === "gated_implementation" ? value : undefined;
}

function projectBoardDraftNeedsUxMockGate(
  draft: ProjectBoardSynthesisDraft,
  profile?: Pick<ProjectProfile, "hasUserInterface" | "hasGame" | "hasWebGl">,
): boolean {
  if (profile?.hasUserInterface || (profile?.hasGame && profile?.hasWebGl)) return true;
  return draft.cards.some(projectBoardSynthesisCardTouchesUi) || projectBoardUiSurfacePattern().test(
    `${draft.goal}\n${draft.summary}\n${draft.currentState}\n${draft.targetUser}\n${draft.sourceNotes.join("\n")}`,
  );
}

function projectBoardSynthesisCardTouchesUi(card: ProjectBoardSynthesisCardInput): boolean {
  const text = [
    card.title,
    card.description,
    card.phase ?? "",
    ...card.labels,
    ...card.acceptanceCriteria,
    ...card.testPlan.integration,
    ...card.testPlan.visual,
    ...card.testPlan.manual,
  ].join("\n");
  return projectBoardUiSurfacePattern().test(text);
}

function projectBoardUiSurfacePattern(): RegExp {
  return /\b(user interface|ui\b|ux\b|frontend|front-end|screen|dashboard|form|modal|layout|responsive|viewport|browser UI|canvas|webgl|pixi\.?js|three\.?js|hud|renderer|render loop|visual editor|landing page|settings page|workflow screen|kanban board|game shell|game loop)\b/i;
}

function detectProjectProfile(corpus: string, sources: ProjectBoardSynthesisSource[]): ProjectProfile {
  const normalized = corpus.toLowerCase();
  return {
    hasGame: /\b(game|spaceship|space ship|player ship|enemy|asteroid|hud|collision|combat|spawn|wave)\b/.test(normalized),
    hasWebGl: /\b(webgl|three\.?js|threejs|canvas|renderer|render loop|pixi\.?js|pixijs|html5)\b/.test(normalized),
    hasUserInterface: projectBoardUiSurfacePattern().test(corpus),
    hasThree: /\b(three\.?js|threejs)\b/.test(normalized),
    hasPixi: /\b(pixi\.?js|pixijs)\b/.test(normalized),
    hasMatter: /\b(matter\.?js|matterjs)\b/.test(normalized),
    hasTests: sources.some((source) => source.kind === "test_artifact" || /\b(test|vitest|playwright|jest|smoke)\b/i.test(`${source.summary}\n${source.excerpt ?? ""}`)),
    mentionsArcadeAndInertia: /\barcade\b/.test(normalized) && /\b(inertia|thrust|momentum)\b/.test(normalized),
    mentionsKeyboardAndTouch: /\bkeyboard\b/.test(normalized) && /\b(touch|mobile|gamepad)\b/.test(normalized),
    mentionsWavesAndEndless: /\b(wave|waves)\b/.test(normalized) && /\bendless\b/.test(normalized),
  };
}

function currentStateSummary(sources: ProjectBoardSynthesisSource[], fallback: string): string {
  const counts = sources.reduce<Record<string, number>>((acc, source) => {
    acc[source.kind] = (acc[source.kind] ?? 0) + 1;
    return acc;
  }, {});
  const countSummary = Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => `${count} ${kind.replace(/_/g, " ")}`)
    .join(", ");
  return countSummary ? `${fallback} Scanned sources: ${countSummary}.` : fallback;
}

function sourceRefsForKinds(sources: ProjectBoardSynthesisSource[], kinds: ProjectBoardSourceKind[]): string[] {
  const wanted = new Set(kinds);
  return sources.filter((source) => wanted.has(source.kind)).map(sourceRef).filter(Boolean).slice(0, MAX_SOURCE_NOTES);
}

function sourceRef(source: ProjectBoardSynthesisSource): string {
  return source.id || source.path || source.artifactId || source.threadId || source.title.trim();
}

function formatSourceNote(source: ProjectBoardSynthesisSource): string {
  const label = source.kind.replace(/_/g, " ");
  const location = source.path || source.title;
  const summary = (source.summary.trim() || source.excerpt?.trim() || "").slice(0, 220);
  return `${label}: ${location}${summary ? ` - ${summary}` : ""}`.slice(0, 240);
}

function withSourceBasis(intro: string[], sourceNotes: string[]): string {
  const basis = sourceNotes.slice(0, 4);
  return [
    ...intro,
    basis.length ? "Source basis:" : "",
    ...basis.map((note) => `- ${note}`),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function stringArray(value: unknown, label: string, limit: number, maxLength: number): string[] {
  if (value === undefined || value === null) return [];
  return arrayValue(value, label)
    .map((item) => (typeof item === "string" ? item.trim().slice(0, maxLength) : ""))
    .filter(Boolean)
    .slice(0, limit);
}

function clarificationSuggestionsArray(value: unknown, label: string, limit: number): ProjectBoardCardClarificationSuggestion[] {
  if (value === undefined || value === null) return [];
  return arrayValue(value, label)
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
      const record = item as Record<string, unknown>;
      const question = typeof record.question === "string" ? record.question.trim().slice(0, 500) : "";
      const suggestedAnswer = typeof record.suggestedAnswer === "string" ? record.suggestedAnswer.trim().slice(0, 1500) : "";
      const rationale = typeof record.rationale === "string" ? record.rationale.trim().slice(0, 1000) : "";
      if (!question || !suggestedAnswer) return undefined;
      const confidence = record.confidence === "high" || record.confidence === "medium" || record.confidence === "low" ? record.confidence : "low";
      const questionKind =
        record.questionKind === "expert_default" || record.questionKind === "user_preference" || record.questionKind === "external_constraint"
          ? record.questionKind
          : "user_preference";
      return {
        question,
        suggestedAnswer,
        rationale: rationale || `Suggested default for clarification ${index + 1}.`,
        confidence,
        safeToAccept: Boolean(record.safeToAccept) && questionKind === "expert_default",
        questionKind,
      };
    })
    .filter((item): item is ProjectBoardCardClarificationSuggestion => Boolean(item))
    .slice(0, limit);
}

function clarificationDecisionsArray(value: unknown, label: string, limit: number): ProjectBoardCardClarificationDecision[] {
  if (value === undefined || value === null) return [];
  return arrayValue(value, label)
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
      const record = item as Record<string, unknown>;
      const question = typeof record.question === "string" ? record.question.trim().slice(0, 500) : "";
      if (!question) return undefined;
      const questionKind =
        record.questionKind === "expert_default" || record.questionKind === "user_preference" || record.questionKind === "external_constraint"
          ? record.questionKind
          : undefined;
      const state =
        record.state === "answered" || record.state === "duplicate" || record.state === "dismissed" || record.state === "open"
          ? record.state
          : "open";
      const source =
        record.source === "description" || record.source === "acceptance_criteria" || record.source === "answer_history" || record.source === "card"
          ? record.source
          : "card";
      const answer = typeof record.answer === "string" ? record.answer.trim().slice(0, 1500) : "";
      const answeredAt = typeof record.answeredAt === "string" ? record.answeredAt.trim().slice(0, 80) : "";
      const suggestedAnswer = typeof record.suggestedAnswer === "string" ? record.suggestedAnswer.trim().slice(0, 1500) : "";
      const rationale = typeof record.rationale === "string" ? record.rationale.trim().slice(0, 1000) : "";
      const decision: ProjectBoardCardClarificationDecision = {
        id: typeof record.id === "string" && record.id.trim() ? record.id.trim().slice(0, 140) : projectBoardClarificationDecisionId(question),
        question,
        canonicalKey:
          typeof record.canonicalKey === "string" && record.canonicalKey.trim()
            ? record.canonicalKey.trim().slice(0, 180)
            : projectBoardClarificationCanonicalKey(question),
        source,
        state,
        ...(typeof record.duplicateOf === "string" && record.duplicateOf.trim() ? { duplicateOf: record.duplicateOf.trim().slice(0, 140) } : {}),
        ...(answer ? { answer } : {}),
        ...(answeredAt ? { answeredAt } : {}),
        ...(suggestedAnswer ? { suggestedAnswer } : {}),
        ...(rationale ? { rationale } : {}),
        ...(record.confidence === "high" || record.confidence === "medium" || record.confidence === "low" ? { confidence: record.confidence } : {}),
        safeToAccept: Boolean(record.safeToAccept) && questionKind === "expert_default",
        ...(questionKind ? { questionKind } : {}),
        ...(typeof record.createdAt === "string" && record.createdAt.trim() ? { createdAt: record.createdAt.trim().slice(0, 80) } : {}),
        ...(typeof record.updatedAt === "string" && record.updatedAt.trim() ? { updatedAt: record.updatedAt.trim().slice(0, 80) } : {}),
      };
      return decision;
    })
    .filter((item): item is ProjectBoardCardClarificationDecision => Boolean(item))
    .slice(0, limit);
}

function clarificationSuggestionsFromDecisions(
  decisions: ProjectBoardCardClarificationDecision[],
): ProjectBoardCardClarificationSuggestion[] {
  return decisions.flatMap((decision) => {
    if (decision.state !== "open" || !decision.suggestedAnswer?.trim()) return [];
    const questionKind = decision.questionKind ?? "user_preference";
    return [
      {
        question: decision.question,
        suggestedAnswer: decision.suggestedAnswer.trim().slice(0, 1500),
        rationale: decision.rationale?.trim().slice(0, 1000) || "Suggested default from the structured clarification decision.",
        confidence: decision.confidence ?? "low",
        safeToAccept: Boolean(decision.safeToAccept) && questionKind === "expert_default",
        questionKind,
      },
    ];
  });
}

function dedupeClarificationSuggestions(
  suggestions: ProjectBoardCardClarificationSuggestion[],
): ProjectBoardCardClarificationSuggestion[] {
  const normalized: ProjectBoardCardClarificationSuggestion[] = [];
  for (const suggestion of suggestions) {
    const question = suggestion.question.trim();
    const suggestedAnswer = suggestion.suggestedAnswer.trim();
    if (!question || !suggestedAnswer) continue;
    const candidate: ProjectBoardCardClarificationSuggestion = {
      question,
      suggestedAnswer,
      rationale: suggestion.rationale.trim() || "Suggested default for this clarification.",
      confidence: suggestion.confidence,
      safeToAccept: Boolean(suggestion.safeToAccept) && suggestion.questionKind === "expert_default",
      questionKind: suggestion.questionKind,
    };
    const index = normalized.findIndex((item) => projectBoardQuestionsAreNearDuplicates(item.question, question));
    if (index >= 0) normalized[index] = candidate;
    else normalized.push(candidate);
  }
  return normalized;
}

function clarificationSuggestionsForQuestions(
  suggestions: ProjectBoardCardClarificationSuggestion[],
  questions: string[],
): ProjectBoardCardClarificationSuggestion[] {
  if (questions.length === 0) return [];
  return suggestions.filter((suggestion) =>
    questions.some((question) => projectBoardQuestionsAreNearDuplicates(question, suggestion.question)),
  );
}

function stableSynthesisSourceId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith(SYNTHESIS_SOURCE_PREFIX)) return trimmed.slice(0, 160);
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
  return `${SYNTHESIS_SOURCE_PREFIX}${slug || "card"}`;
}
