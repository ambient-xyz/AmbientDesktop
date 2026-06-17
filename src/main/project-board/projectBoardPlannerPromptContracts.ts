import type { ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import { projectBoardProofScopePromptRules } from "./projectBoardProofScope";

type CandidateCardPromptRecord = Extract<ProposalJsonlRecordArtifact, { type: "candidate_card" }>;

export const PROJECT_BOARD_PLANNER_JSON_ONLY_RULE = "- Return JSON only. Do not use markdown.";

export const PROJECT_BOARD_PLANNER_LAMBDA_RLM_RULE =
  "- If Lambda RLM plugin tools are available, use extraction for card material, qa for ambiguity, summarization for coverage, and analysis for dependencies.";

export const PROJECT_BOARD_PLANNER_SYNTHESIS_LAMBDA_RLM_RULE =
  "- If Lambda RLM plugin tools are available, use classification for source authority, extraction for card material and proof clauses, summarization for source coverage, qa for unresolved questions, and analysis for dependency ordering.";

export const PROJECT_BOARD_PLANNER_CANDIDATE_STATUS_RULE =
  "- candidateStatus must be exactly needs_clarification or ready_to_create. The schema rejects ready, ready_to_start, approved, todo, and other aliases.";

export const PROJECT_BOARD_PLANNER_SYNTHESIS_PROOF_EXPECTATION_RULE = "- Include proof expectations on every card.";

export function projectBoardPlannerCandidateCardPromptExample(input: {
  sourceRefs: CandidateCardPromptRecord["sourceRefs"];
  suggestedAnswer: string;
  rationale: string;
}): CandidateCardPromptRecord {
  return {
    type: "candidate_card",
    sourceId: "synthesis:stable-card-id",
    title: "self-contained card title",
    description: "card scope with source basis",
    candidateStatus: "needs_clarification",
    priority: 1,
    phase: "Foundation",
    labels: ["scope:required", "label"],
    blockedBy: [],
    sourceRefs: input.sourceRefs,
    clarificationDecisions: [
      {
        id: "clarification:stable-decision-id",
        canonicalKey: "stable canonical key for this ambiguity",
        question: "specific unresolved question for this card when candidateStatus is needs_clarification",
        source: "card",
        state: "open",
        suggestedAnswer: input.suggestedAnswer,
        rationale: input.rationale,
        confidence: "medium",
        safeToAccept: true,
        questionKind: "expert_default",
      },
    ],
    clarificationQuestions: ["same open decision question, mirrored only for compatibility"],
    clarificationSuggestions: [
      {
        question: "same text as an open clarificationDecisions entry",
        suggestedAnswer: "same suggestedAnswer as the matching clarificationDecisions entry",
        rationale: "same rationale as the matching clarificationDecisions entry",
        confidence: "medium",
        safeToAccept: true,
        questionKind: "expert_default",
      },
    ],
    acceptanceCriteria: ["observable done condition"],
    testPlan: {
      unit: ["unit proof expectation"],
      integration: ["integration proof expectation"],
      visual: ["visual/browser/screenshot expectation only when this card directly changes visible UI, canvas, HUD, scene, or rendered pixels"],
      manual: ["manual proof expectation"],
    },
  };
}

export function projectBoardPlannerSynthesisCardPromptExample(): {
  sourceId: string;
  title: string;
  description: string;
  candidateStatus: "needs_clarification";
  priority: number;
  phase: string;
  labels: string[];
  blockedBy: string[];
  acceptanceCriteria: string[];
  testPlan: {
    unit: string[];
    integration: string[];
    visual: string[];
    manual: string[];
  };
  sourceRefs: string[];
  uiMockRole: "gated_implementation";
  requiresUiMockApproval: boolean;
  clarificationDecisions: Array<{
    id: string;
    canonicalKey: string;
    question: string;
    source: "card";
    state: "open";
    suggestedAnswer: string;
    rationale: string;
    confidence: "medium";
    safeToAccept: boolean;
    questionKind: "expert_default";
  }>;
  clarificationQuestions: string[];
  clarificationSuggestions: Array<{
    question: string;
    suggestedAnswer: string;
    rationale: string;
    confidence: "medium";
    safeToAccept: boolean;
    questionKind: "expert_default";
  }>;
} {
  return {
    sourceId: "synthesis:stable-id",
    title: "self-contained card title",
    description: "card scope and source basis",
    candidateStatus: "needs_clarification",
    priority: 1,
    phase: "Foundation",
    labels: ["scope:required", "label"],
    blockedBy: [],
    acceptanceCriteria: ["observable done condition"],
    testPlan: {
      unit: ["unit proof expectation"],
      integration: ["integration proof expectation"],
      visual: ["visual/browser/screenshot expectation only when this card directly changes visible UI, canvas, HUD, scene, or rendered pixels"],
      manual: ["manual proof expectation"],
    },
    sourceRefs: ["path-or-source-title"],
    uiMockRole: "gated_implementation",
    requiresUiMockApproval: true,
    clarificationDecisions: [
      {
        id: "clarification:stable-decision-id",
        canonicalKey: "stable canonical key for this ambiguity",
        question: "specific unresolved question for this card when candidateStatus is needs_clarification",
        source: "card",
        state: "open",
        suggestedAnswer: "professionally defensible default answer when safe",
        rationale: "why an expert UX designer/software architect would choose this default from the source evidence",
        confidence: "medium",
        safeToAccept: true,
        questionKind: "expert_default",
      },
    ],
    clarificationQuestions: ["same open decision question, mirrored only for compatibility"],
    clarificationSuggestions: [
      {
        question: "same text as an open clarificationDecisions question",
        suggestedAnswer: "same suggestedAnswer as the matching clarificationDecisions entry",
        rationale: "same rationale as the matching clarificationDecisions entry",
        confidence: "medium",
        safeToAccept: true,
        questionKind: "expert_default",
      },
    ],
  };
}

export function projectBoardPlannerScopeCapabilityPromptRules(input: {
  optionalScopeTarget: string;
  noun?: "card" | "candidate_card";
  action?: "Emit" | "Propose";
}): string[] {
  const noun = input.noun ?? "candidate_card";
  const action = input.action ?? "Emit";
  return [
    `- Classify every ${noun} against the capability contract with exactly one label: scope:required, scope:supporting, scope:optional, or scope:excluded.`,
    `- ${action} scope:required and scope:supporting cards only. ${
      action === "Propose" ? "Put" : "If a useful idea is scope:optional, mention"
    } ${
      action === "Propose" ? `optional ideas in ${input.optionalScopeTarget}` : `it in ${input.optionalScopeTarget}`
    } instead of ${action === "Propose" ? "executable cards" : "creating a candidate_card"}.`,
  ];
}

export function projectBoardPlannerClarificationContractPromptRules(input: {
  canonicalRule: string;
  needsClarificationRule?: string;
  defaultRule: string;
  includeVagueLaneRule?: boolean;
}): string[] {
  return [
    input.needsClarificationRule ?? "",
    input.canonicalRule,
    input.includeVagueLaneRule ? "- Do not use needs_clarification as a vague holding lane. Name the missing implementation, product, dependency, or proof decision." : "",
    input.defaultRule,
  ].filter(Boolean);
}

export function projectBoardPlannerProofExpectationPromptRules(): string[] {
  return [
    "- Include unit, integration, visual, or manual proof expectations on every candidate card.",
    ...projectBoardPlannerProofScopePromptRuleLines(),
  ];
}

export function projectBoardPlannerSynthesisProofExpectationPromptRules(): string[] {
  return [PROJECT_BOARD_PLANNER_SYNTHESIS_PROOF_EXPECTATION_RULE, ...projectBoardPlannerProofScopePromptRuleLines()];
}

export function projectBoardPlannerProofScopePromptRuleLines(): string[] {
  return projectBoardProofScopePromptRules().map((rule) => `- ${rule}`);
}

export function projectBoardPlannerSynthesisClarificationPromptRules(): string[] {
  return [
    "- Keep candidateStatus as needs_clarification unless the card is fully specified and proof-ready.",
    "- Emit clarificationDecisions as the canonical clarification model for every card ambiguity. Use stable id and canonicalKey values so repeated planning passes update the same decision instead of creating duplicates.",
    "- Mirror each open clarificationDecisions entry into clarificationQuestions and clarificationSuggestions for compatibility only; do not create extra variants in those legacy arrays.",
    "- Every needs_clarification card must include at least one open clarificationDecisions entry with a concrete, answerable missing decision. If there is no specific question left, use ready_to_create instead.",
    "- Keep clarificationDecisions about implementation-blocking PM decisions, not generic requests for more detail.",
    "- For each open clarification decision, include suggestedAnswer/rationale/confidence/safeToAccept/questionKind when an experienced UX designer and software architect can propose a safe default. Use questionKind expert_default for implementation/UX defaults, user_preference for product taste/scope choices, and external_constraint when outside facts or credentials are needed.",
    "- Set safeToAccept true only for expert defaults that can be accepted without inventing product intent. Do not auto-resolve user preference or external constraint questions.",
  ];
}

export function projectBoardPlannerPmReviewReportPromptExample(): {
  readiness: "ready_for_card_generation";
  summary: string;
  sourceConfidence: "high";
  sourceConfidenceNotes: string[];
  gitState: "git_ready";
  gitStateNotes: string[];
  blockingQuestions: string[];
  risks: string[];
  sourceConflicts: string[];
  sourceAuthorityNotes: string[];
  recommendedActivationScope: string;
  cardGenerationConstraints: string[];
} {
  return {
    readiness: "ready_for_card_generation",
    summary: "brief PM review finding",
    sourceConfidence: "high",
    sourceConfidenceNotes: ["why the source set is strong, weak, stale, or incomplete"],
    gitState: "git_ready",
    gitStateNotes: ["branch, remote/upstream, ahead/behind, dirty board artifacts, or local-only coordination notes"],
    blockingQuestions: ["specific question that must be answered before activation or card generation"],
    risks: ["source-backed planning or execution risk"],
    sourceConflicts: ["conflict between kickoff, charter, or source evidence"],
    sourceAuthorityNotes: ["which source should win if sources disagree"],
    recommendedActivationScope: "what can safely be activated or planned next",
    cardGenerationConstraints: ["constraints the later board-synthesis pass must obey"],
  };
}

export function projectBoardPlannerPmReviewReadinessPromptLines(): string[] {
  return [
    "Readiness values:",
    "- ready_for_activation: kickoff answers and source evidence look coherent enough to activate the charter.",
    "- ready_for_card_generation: the active charter can safely proceed to explicit board-synthesis/card generation.",
    "- needs_answers: the user needs to answer blocking PM questions first.",
    "- needs_source_refresh: source evidence is missing, stale, or contradictory enough that refresh/reclassification should happen first.",
    "- blocked: the charter cannot safely proceed until a serious conflict is resolved.",
  ];
}

export function projectBoardPlannerPmReviewSourceConfidencePromptLines(): string[] {
  return [
    "Source confidence values:",
    "- high: primary/authoritative sources cover the requested scope and no major stale, missing, or contradictory evidence blocks planning.",
    "- medium: sources are usable, but scope gaps, lower confidence classifications, stale files, or conflicts should constrain later cards.",
    "- low: source evidence is missing, stale, contradictory, or too weak for confident card generation.",
    "- unknown: there is not enough source or classification context to judge.",
  ];
}

export function projectBoardPlannerPmReviewGitStatePromptLines(): string[] {
  return [
    "Git state values:",
    "- git_ready: workspace is a Git repository with a remote/upstream path suitable for board artifact coordination.",
    "- git_no_remote: workspace is a Git repository, but board artifacts do not yet have remote coordination.",
    "- local_only: workspace is not in a Git repository.",
    "- unknown: Git state was unavailable. Do not infer a stronger state.",
  ];
}

export function projectBoardPlannerPmReviewPromptRules(): string[] {
  return [
    "- Do not generate candidate cards.",
    "- Do not include a cards field.",
    "- Keep blockingQuestions concrete and answerable; do not ask for generic more detail.",
    "- Separate source conflicts from risks. Conflicts name contradictory evidence; risks name execution or planning hazards.",
    "- Source authority notes should cite titles/paths when possible and should mention ignored sources only when they explain why something was excluded.",
    "- Source confidence notes should cite titles/paths, classification confidence, authority roles, change states, and source coverage gaps when available.",
    "- Git state must match the provided Git coordination input exactly. If Git coordination input is missing, use unknown.",
    "- Git state notes should mention branch, remote/upstream, ahead/behind counts, dirty board artifact count, and projection validity when provided.",
    "- Recommended activation scope should state whether to activate, ask questions, refresh sources, or run full board synthesis.",
    "- Card generation constraints are instructions for the later explicit board-synthesis pass, not cards.",
    PROJECT_BOARD_PLANNER_JSON_ONLY_RULE,
  ];
}

export interface ProjectBoardPlannerPmReviewActivationPromptReport {
  readiness: string;
  summary: string;
  sourceConfidence: string;
  sourceConfidenceNotes: string[];
  gitState: string;
  gitStateNotes: string[];
  recommendedActivationScope: string;
  cardGenerationConstraints: string[];
  blockingQuestions: string[];
  risks: string[];
  sourceConflicts: string[];
  sourceAuthorityNotes: string[];
}

export function projectBoardPlannerPmReviewActivationPromptBlock(report?: ProjectBoardPlannerPmReviewActivationPromptReport): string {
  if (!report) return "";
  return [
    "",
    "PM Review activation context:",
    JSON.stringify(
      {
        readiness: report.readiness,
        summary: report.summary,
        sourceConfidence: report.sourceConfidence,
        sourceConfidenceNotes: report.sourceConfidenceNotes,
        gitState: report.gitState,
        gitStateNotes: report.gitStateNotes,
        recommendedActivationScope: report.recommendedActivationScope,
        cardGenerationConstraints: report.cardGenerationConstraints,
        blockingQuestions: report.blockingQuestions,
        risks: report.risks,
        sourceConflicts: report.sourceConflicts,
        sourceAuthorityNotes: report.sourceAuthorityNotes,
      },
      null,
      2,
    ),
    "",
    "PM Review activation rules:",
    "- This board-synthesis pass was explicitly launched from the lightweight PM Review recommendation.",
    "- Treat recommendedActivationScope as the activation brief for the next generated cards.",
    "- Treat cardGenerationConstraints as hard planning constraints unless a settled user answer contradicts them.",
    "- Treat sourceConfidence and sourceConfidenceNotes as the source-quality boundary for card scope and evidence expectations.",
    "- Treat gitState and gitStateNotes as coordination context; prefer cards that preserve or improve safe local board coordination.",
    "- Carry risks, source conflicts, and source authority notes into sourceNotes and card scope when they affect execution.",
    "- If readiness is needs_answers, needs_source_refresh, or blocked and the settled answers do not resolve the blocker, ask only the remaining concrete blocking question instead of inventing scope.",
  ].join("\n");
}
