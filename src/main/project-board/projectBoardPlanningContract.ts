import { projectBoardProofScopePromptRules } from "./projectBoardProofScope";
import {
  projectBoardPlanningDepthFromScopeContract,
  projectBoardScopeContractFromTexts,
} from "../../shared/projectBoardScopeContract";
import type {
  ProjectBoardCharterProjectSummary,
  ProjectBoardPlanningDepthAssessment,
  ProjectBoardScopeContract,
  ProjectBoardScopeFeature,
} from "../../shared/types";

export {
  mergeProjectBoardScopeContracts,
  projectBoardPlanningDepthFromScopeContract,
  projectBoardScopeContractFromTexts,
} from "../../shared/projectBoardScopeContract";

export type ProjectBoardPlanningProfileName =
  | "strict-pm"
  | "startup-mvp"
  | "implementation-first"
  | "research-heavy"
  | "quality-gate"
  | "maintenance-refactor"
  | "gameplay-design";

export type ProjectBoardPlanningOperation =
  | "source_classification"
  | "kickoff_defaults"
  | "charter_summary"
  | "charter_review"
  | "board_synthesis"
  | "section_elaboration"
  | "source_elaboration"
  | "dependency_ordering"
  | "card_review"
  | "proof_judgment"
  | "follow_up_generation";

export interface ProjectBoardPlanningProfile {
  name: ProjectBoardPlanningProfileName;
  label: string;
  planningStyle: string;
  cardGranularity: string;
  proofStrictness: string;
  proofScopeWarningPolicy: "advisory" | "acknowledgement_required";
  clarificationThreshold: string;
  autonomyLevel: string;
  executionBias: string;
  tone: string;
}

export interface ProjectBoardPlanningReasoningConfig {
  effort?: "xhigh" | "high" | "medium" | "low" | "minimal" | "none";
  max_tokens?: number;
  exclude?: boolean;
  enabled?: boolean;
}

export interface ProjectBoardPlanningContract {
  profile: ProjectBoardPlanningProfile;
  operation: ProjectBoardPlanningOperation;
  systemPrompt: string;
  stablePromptHeader: string;
  operationRules: string[];
  lambdaRlmGuidance: string[];
  scopeContract: ProjectBoardScopeContract;
  planningDepth: ProjectBoardPlanningDepthAssessment;
  reasoning?: ProjectBoardPlanningReasoningConfig | false;
}

const DEFAULT_PROFILE_NAME: ProjectBoardPlanningProfileName = "strict-pm";

const PROJECT_BOARD_PLANNING_PROFILES: Record<ProjectBoardPlanningProfileName, ProjectBoardPlanningProfile> = {
  "strict-pm": {
    name: "strict-pm",
    label: "Strict PM",
    planningStyle: "Conservative project-manager pass that preserves source authority, asks concrete questions, and avoids speculative scope.",
    cardGranularity: "Small self-contained cards with explicit dependencies and a clear execution boundary.",
    proofStrictness: "Every card needs observable acceptance criteria plus at least one realistic proof path.",
    proofScopeWarningPolicy: "acknowledgement_required",
    clarificationThreshold: "Ask only when a missing answer changes implementation, priority, dependency order, or proof.",
    autonomyLevel: "High autonomy after scope and proof are settled; block with precise questions when they are not.",
    executionBias: "Prepare the first safe unblocked card quickly, but never hide unresolved risks.",
    tone: "Direct, concise, source-grounded.",
  },
  "startup-mvp": {
    name: "startup-mvp",
    label: "Startup MVP",
    planningStyle: "Optimize for the shortest coherent user-visible slice while preserving future extensibility.",
    cardGranularity: "Thin vertical slices that can ship or demo independently.",
    proofStrictness: "Favor fast product proof, smoke tests, and regression hooks over exhaustive coverage.",
    proofScopeWarningPolicy: "advisory",
    clarificationThreshold: "Default minor unknowns pragmatically, but ask about product-defining choices.",
    autonomyLevel: "Prefer making documented assumptions and moving to execution.",
    executionBias: "Prioritize cards that unlock demo value or reduce launch risk.",
    tone: "Pragmatic, momentum-oriented, explicit about tradeoffs.",
  },
  "implementation-first": {
    name: "implementation-first",
    label: "Implementation First",
    planningStyle: "Turn settled requirements into executable engineering tasks with minimal extra discovery.",
    cardGranularity: "Implementation-sized cards that map cleanly to files, modules, commands, and tests.",
    proofStrictness: "Require unit/integration proof for behavior changes and manual proof only when automation is impractical.",
    proofScopeWarningPolicy: "advisory",
    clarificationThreshold: "Ask when code ownership, data contracts, or test expectations are unclear.",
    autonomyLevel: "Assume the current architecture should be followed unless sources explicitly say otherwise.",
    executionBias: "Start foundation and dependency-unblocking cards as soon as they are ready.",
    tone: "Engineering-focused and terse.",
  },
  "research-heavy": {
    name: "research-heavy",
    label: "Research Heavy",
    planningStyle: "Separate discovery, comparison, decision, and implementation into traceable steps.",
    cardGranularity: "Cards can be research or proof-of-concept tasks when source confidence is low.",
    proofStrictness: "Require citations, decision records, or reproducible experiments before implementation cards depend on research outcomes.",
    proofScopeWarningPolicy: "advisory",
    clarificationThreshold: "Ask when unknowns would cause premature implementation or lock-in.",
    autonomyLevel: "Proceed with bounded research loops and summarize uncertainty explicitly.",
    executionBias: "Prioritize evidence-gathering cards that unblock durable decisions.",
    tone: "Analytical and careful.",
  },
  "quality-gate": {
    name: "quality-gate",
    label: "Quality Gate",
    planningStyle: "Optimize for correctness, reliability, security, and reviewability.",
    cardGranularity: "Cards should isolate risk and include validation gates before downstream work proceeds.",
    proofStrictness: "Strong proof required: automated checks, negative cases, artifacts, and review criteria where appropriate.",
    proofScopeWarningPolicy: "acknowledgement_required",
    clarificationThreshold: "Ask whenever quality policy, acceptance criteria, or risk tolerance is ambiguous.",
    autonomyLevel: "Autonomous execution is allowed only after proof policy is explicit.",
    executionBias: "Prefer risk-reducing and test-enabling cards before feature expansion.",
    tone: "Precise, skeptical, and evidence-oriented.",
  },
  "maintenance-refactor": {
    name: "maintenance-refactor",
    label: "Maintenance Refactor",
    planningStyle: "Prefer small reversible improvements that preserve behavior and reduce system complexity.",
    cardGranularity: "Narrow cards by module or ownership boundary with explicit regression proof.",
    proofStrictness: "Require before/after behavior checks and low-blast-radius test coverage.",
    proofScopeWarningPolicy: "advisory",
    clarificationThreshold: "Ask when behavior preservation or migration policy is unclear.",
    autonomyLevel: "Operate conservatively within existing architecture.",
    executionBias: "Start with characterization tests, dependency cleanup, or low-risk seams that unblock later refactors.",
    tone: "Calm, careful, and codebase-sympathetic.",
  },
  "gameplay-design": {
    name: "gameplay-design",
    label: "Gameplay Design",
    planningStyle: "Translate design docs into playable systems, tuning loops, content slices, and proofable gameplay behavior.",
    cardGranularity: "Cards should map to concrete mechanics, engine scaffolding, controls, encounters, UI/HUD, audio/visual feel, progression, and regression proof.",
    proofStrictness: "Require gameplay-observable proof: deterministic logic checks, browser/canvas smoke, traces, screenshots, or manual play notes.",
    proofScopeWarningPolicy: "advisory",
    clarificationThreshold: "Ask about player-facing feel, controls, progression, and scope when sources conflict or leave a design-defining gap.",
    autonomyLevel: "Make documented implementation assumptions for technical glue, but ask before changing core gameplay intent.",
    executionBias: "Build the smallest playable slice that validates feel, then layer systems in dependency order.",
    tone: "Concrete, design-literate, and implementation-ready.",
  },
};

const OPERATION_LABELS: Record<ProjectBoardPlanningOperation, string> = {
  source_classification: "Source Classification",
  kickoff_defaults: "Kickoff Default Answers",
  charter_summary: "Charter Project Summary",
  charter_review: "Lightweight Charter Review",
  board_synthesis: "Whole Board Synthesis",
  section_elaboration: "Section Elaboration",
  source_elaboration: "Add Cards From Sources",
  dependency_ordering: "Dependency Ordering",
  card_review: "Card Review",
  proof_judgment: "Proof Judgment",
  follow_up_generation: "Follow-up Generation",
};

const OPERATION_RULES: Record<ProjectBoardPlanningOperation, string[]> = {
  source_classification: [
    "Classify by semantic project-management role, not filename alone.",
    "Preserve each source identity exactly and explain inclusion, authority, and risk briefly.",
    "Use primary authority only for material that should win if sources disagree.",
  ],
  kickoff_defaults: [
    "Suggest editable source-derived default answers for the kickoff charter questions before board activation.",
    "Use included source authority, ignored-source state, and question wording as evidence; do not activate the charter or rewrite cards.",
    "When sources do not settle a user-owned preference, provide a conservative low-confidence default and explain what the user may edit.",
  ],
  charter_summary: [
    "Summarize project shape from the active charter and current source scan without inventing new product decisions.",
    "Separate source-backed context from unresolved decisions and coverage gaps.",
    "Keep the summary compact enough to reuse as stable prompt prefix context.",
  ],
  charter_review: [
    "Review the kickoff answers, active charter, current source scan, and existing board context without generating proposal cards.",
    "Identify only blocking PM questions, source conflicts, source-authority notes, risks, and constraints for later card generation.",
    "Recommend whether the board is ready for activation or card generation, but leave card creation to the explicit board-synthesis operation.",
  ],
  board_synthesis: [
    "Create a source-grounded project board, not a generic TODO list.",
    "Split work into cards that can become Local Tasks with little user intervention.",
    "Preserve dependencies and proof expectations on every card.",
  ],
  section_elaboration: [
    "Emit only records grounded in the current source section.",
    "Prefer two or three highest-leverage cards over a giant section summary.",
    "Use questions and source coverage records when the section remains unresolved.",
  ],
  source_elaboration: [
    "Add net-new cards from the selected source scope without replacing existing board cards.",
    "Reference existing cards as blockers instead of duplicating them.",
    "Attach source ranges and concrete proof clauses from the selected sources.",
  ],
  dependency_ordering: [
    "Order by true implementation blockers, not preference or aesthetics.",
    "Identify the first safe unblocked card and the downstream cards it enables.",
    "Keep dependency chains short enough to execute incrementally.",
  ],
  card_review: [
    "Judge whether a card is executable, duplicated, underspecified, or already represented.",
    "Name the exact missing question when a card needs clarification.",
    "Respect user edits and prior review decisions as authoritative.",
  ],
  proof_judgment: [
    "Compare submitted proof to the card's acceptance criteria and proof policy.",
    "Return pass, retry, block, follow-up, or ask-user recommendations with concrete reasons.",
    "Do not infer screenshot contents directly when the model is not multimodal; use traces, metrics, logs, and text summaries.",
  ],
  follow_up_generation: [
    "Create follow-ups only for work that is real, source-grounded, and not already represented.",
    "Carry parent-card context and proof gaps into the follow-up description.",
    "Keep follow-ups reviewable in Draft Inbox before execution.",
  ],
};

const LAMBDA_RLM_GUIDANCE: Record<ProjectBoardPlanningOperation, string[]> = {
  source_classification: [
    "Use Lambda RLM task type classification for source kind, source authority, inclusion, ambiguity, and risk labels.",
  ],
  kickoff_defaults: [
    "Use Lambda RLM qa over the source scan to answer each kickoff question.",
    "Use Lambda RLM summarization to extract source authority, scope boundaries, proof expectations, and dependency cues.",
    "Use Lambda RLM analysis to separate source-backed defaults from PM/user-owned preferences.",
  ],
  charter_summary: [
    "Use Lambda RLM summarization for project shape, source coverage, risks, and gaps.",
    "Use Lambda RLM extraction for major systems and dependency hints.",
    "Use Lambda RLM qa only to identify unresolved questions, not to answer product preferences.",
  ],
  charter_review: [
    "Use Lambda RLM qa for source-backed conflicts and unresolved charter questions.",
    "Use Lambda RLM summarization for source-authority notes and activation readiness.",
    "Do not use extraction to emit candidate cards during this operation.",
  ],
  board_synthesis: [
    "Use Lambda RLM extraction for candidate card material and proof clauses.",
    "Use Lambda RLM summarization for source coverage ledgers.",
    "Use Lambda RLM qa for unresolved charter or card questions.",
    "Use Lambda RLM analysis for dependency ordering and execution readiness.",
  ],
  section_elaboration: [
    "Use Lambda RLM extraction for section-specific systems, requirements, proof clauses, and candidate cards.",
    "Use Lambda RLM summarization for section coverage.",
    "Use Lambda RLM qa for section-level ambiguity.",
    "Use Lambda RLM analysis for local dependency edges.",
  ],
  source_elaboration: [
    "Use Lambda RLM extraction for new card candidates in the selected source/excerpt scope.",
    "Use Lambda RLM analysis for duplicate detection against existing cards.",
    "Use Lambda RLM qa for any missing information needed before execution.",
  ],
  dependency_ordering: ["Use Lambda RLM analysis for blocker chains, critical path, and ready-now reasoning."],
  card_review: ["Use Lambda RLM analysis for review disposition and qa for missing clarification questions."],
  proof_judgment: ["Use Lambda RLM analysis for proof sufficiency and qa for unresolved evidence gaps."],
  follow_up_generation: ["Use Lambda RLM extraction for handoff follow-ups and analysis for duplicate/risk screening."],
};

const REASONING_POLICY: Record<ProjectBoardPlanningOperation, ProjectBoardPlanningReasoningConfig | false | undefined> = {
  source_classification: { effort: "minimal", max_tokens: 500, exclude: true, enabled: true },
  kickoff_defaults: { effort: "low", max_tokens: 800, exclude: true, enabled: true },
  charter_summary: { effort: "low", max_tokens: 900, exclude: true, enabled: true },
  charter_review: { effort: "low", max_tokens: 900, exclude: true, enabled: true },
  board_synthesis: undefined,
  section_elaboration: { effort: "low", max_tokens: 900, exclude: true, enabled: true },
  source_elaboration: { effort: "low", max_tokens: 900, exclude: true, enabled: true },
  dependency_ordering: { effort: "medium", max_tokens: 1_000, exclude: true, enabled: true },
  card_review: { effort: "low", max_tokens: 750, exclude: true, enabled: true },
  proof_judgment: { effort: "medium", max_tokens: 1_000, exclude: true, enabled: true },
  follow_up_generation: { effort: "low", max_tokens: 750, exclude: true, enabled: true },
};

export function projectBoardPlanningProfileNames(): ProjectBoardPlanningProfileName[] {
  return Object.keys(PROJECT_BOARD_PLANNING_PROFILES) as ProjectBoardPlanningProfileName[];
}

export function getProjectBoardPlanningProfile(name?: ProjectBoardPlanningProfileName): ProjectBoardPlanningProfile {
  return PROJECT_BOARD_PLANNING_PROFILES[name ?? DEFAULT_PROFILE_NAME] ?? PROJECT_BOARD_PLANNING_PROFILES[DEFAULT_PROFILE_NAME];
}

export function projectBoardPlanningReasoningForOperation(
  operation: ProjectBoardPlanningOperation,
): ProjectBoardPlanningReasoningConfig | false | undefined {
  return REASONING_POLICY[operation];
}

export function buildProjectBoardPlanningContract(input: {
  operation: ProjectBoardPlanningOperation;
  projectName?: string;
  charter?: {
    goal?: string;
    sourceAuthority?: string;
    decisionPolicy?: string;
    proofPolicy?: string;
    projectSummary?: ProjectBoardCharterProjectSummary;
  };
  scopeContract?: ProjectBoardScopeContract;
  profileName?: ProjectBoardPlanningProfileName;
}): ProjectBoardPlanningContract {
  const profile = getProjectBoardPlanningProfile(input.profileName);
  const operationRules = OPERATION_RULES[input.operation];
  const lambdaRlmGuidance = LAMBDA_RLM_GUIDANCE[input.operation];
  const projectSummaryLines = input.charter?.projectSummary ? formatCharterProjectSummaryForPrompt(input.charter.projectSummary) : [];
  const scopeContract = input.scopeContract ?? projectBoardScopeContractFromTexts([]);
  const scopeContractLines = formatProjectBoardScopeContractForPrompt(scopeContract);
  const planningDepth = projectBoardPlanningDepthFromScopeContract(scopeContract);
  const stablePromptHeader = [
    "Ambient/Pi project-board planning contract",
    input.projectName ? `Project: ${input.projectName}` : "Project: unspecified",
    "",
    "Project charter:",
    `- Goal: ${input.charter?.goal?.trim() || "Use the project corpus and kickoff answers to infer the working goal; do not invent unrelated scope."}`,
    `- Source authority: ${input.charter?.sourceAuthority?.trim() || "Functional specs, architecture docs, implementation plans, and explicit user answers outrank scratch notes and generated output."}`,
    `- Decision policy: ${input.charter?.decisionPolicy?.trim() || "Make documented implementation assumptions for minor gaps; ask concise questions for product-defining uncertainty."}`,
    `- Proof policy: ${input.charter?.proofPolicy?.trim() || "Every executable card needs observable acceptance criteria and at least one viable proof path."}`,
    ...projectSummaryLines,
    "",
    "Scope contract:",
    "- Plan only the product scope explicitly requested by the user, active charter, PM Review constraints, and authoritative sources.",
    ...scopeContractLines.map((line) => `- ${line}`),
    `- Planning depth assessment: ${planningDepth.level} (${planningDepth.score}/100). ${planningDepth.guidance}`,
    planningDepth.signals.length ? `- Planning depth signals: ${planningDepth.signals.join("; ")}` : "",
    planningDepth.level === "shallow"
      ? "- Shallow board workflow limit: keep this to one compact planning pass and target 1-2 candidate cards. Do not split a single-file/local utility into separate HTML, CSS, JS, proof, deployment, or enhancement cards unless the user explicitly requested that decomposition."
      : "",
    "- Explicit user constraints in the scope contract override inferred complexity and remain hard exclusions until the user expands scope.",
    "- Build the simplest useful version that satisfies the user's request. Ask clarifying questions only when a decision would materially change the product, and offer extra features as optional next steps instead of silently adding them.",
    "- Use the capability contract as the product boundary: executable cards may implement required capabilities and necessary supporting capabilities only. Optional/excluded capabilities belong in notes or follow-up suggestions, not initial executable cards.",
    "- For every candidate card, classify its relationship to the capability contract by adding exactly one label: scope:required, scope:supporting, scope:optional, or scope:excluded.",
    "- Complexity, risk, ambiguity, and source volume control planning depth: slow down, clarify assumptions, phase the work, and produce smaller proofable cards. They must not expand product scope by adding platform features.",
    "- Exclude any capability or platform surface the structured scope contract does not classify as required or necessary supporting scope.",
    "- When excluded scope appears in scratch notes or generic domain expectations, record it as out of scope or a question instead of creating implementation cards for it.",
    "",
    "Board planning profile:",
    `- Name: ${profile.name} (${profile.label})`,
    `- Planning style: ${profile.planningStyle}`,
    `- Card granularity: ${profile.cardGranularity}`,
    `- Proof strictness: ${profile.proofStrictness}`,
    `- Proof-scope warning policy: ${profile.proofScopeWarningPolicy === "acknowledgement_required" ? "require explicit PM acknowledgement before ticketizing warned cards" : "advisory warning before ticketization"}`,
    `- Clarification threshold: ${profile.clarificationThreshold}`,
    `- Autonomy level: ${profile.autonomyLevel}`,
    `- Execution bias: ${profile.executionBias}`,
    `- Tone: ${profile.tone}`,
    "",
    "Proof ownership rules:",
    ...projectBoardProofScopePromptRules().map((rule) => `- ${rule}`),
    "",
    `Operation overlay: ${OPERATION_LABELS[input.operation]}`,
    ...operationRules.map((rule) => `- ${rule}`),
    "",
    "Lambda RLM capability guidance:",
    ...lambdaRlmGuidance.map((guidance) => `- ${guidance}`),
  ].join("\n");

  return {
    profile,
    operation: input.operation,
    systemPrompt: [
      "You are Ambient/Pi running Ambient Desktop's project-board planning contract.",
      "Follow the project charter, board planning profile, and operation overlay exactly.",
      "Prefer source-grounded PM judgment over generic assistant behavior.",
      "Return valid JSON only. Do not use markdown unless the user prompt explicitly asks for JSONL records inside JSON strings.",
    ].join(" "),
    stablePromptHeader,
    operationRules,
    lambdaRlmGuidance,
    scopeContract,
    planningDepth,
    reasoning: projectBoardPlanningReasoningForOperation(input.operation),
  };
}

function formatCharterProjectSummaryForPrompt(summary: ProjectBoardCharterProjectSummary): string[] {
  return [
    "- Project summary authority: derived context from the active charter and source scan. Use it for orientation, but let explicit sources and user answers override it.",
    `- Project summary: ${summary.summary}`,
    summary.majorSystems.length ? `- Major systems: ${summary.majorSystems.join("; ")}` : "",
    summary.sourceCoverage.length ? `- Source coverage: ${summary.sourceCoverage.slice(0, 8).join("; ")}` : "",
    summary.risks.length ? `- Known risks: ${summary.risks.join("; ")}` : "",
    summary.dependencyHints.length ? `- Dependency hints: ${summary.dependencyHints.join("; ")}` : "",
    summary.unresolvedDecisions.length ? `- Unresolved decisions: ${summary.unresolvedDecisions.join("; ")}` : "",
    summary.coverageGaps.length ? `- Coverage gaps: ${summary.coverageGaps.join("; ")}` : "",
    summary.citations.length ? `- Summary citations: ${summary.citations.slice(0, 8).join("; ")}` : "",
    summary.kickoffContextBrief ? `- Kickoff context brief: ${summary.kickoffContextBrief.summary}` : "",
    summary.kickoffContextBrief?.sourceNotes.length
      ? `- Kickoff source notes: ${summary.kickoffContextBrief.sourceNotes
          .slice(0, 6)
          .map((source) => `${source.title}: ${source.summary}`)
          .join("; ")}`
      : "",
  ].filter(Boolean);
}

export function formatProjectBoardScopeContractForPrompt(contract: ProjectBoardScopeContract): string[] {
  return [
    `Included scope: ${contract.included.length ? contract.included.map(featureLabel).join("; ") : "No platform expansions explicitly included."}`,
    `Excluded scope: ${contract.excluded.length ? contract.excluded.map(featureLabel).join("; ") : "No explicit platform exclusions detected."}`,
    `Required capabilities: ${contract.requiredCapabilities?.length ? contract.requiredCapabilities.join("; ") : "Infer directly requested user-visible capabilities from source text; do not add adjacent conveniences."}`,
    contract.supportingCapabilities?.length ? `Supporting capabilities: ${contract.supportingCapabilities.join("; ")}` : "",
    contract.optionalCapabilities?.length ? `Optional capabilities: ${contract.optionalCapabilities.join("; ")}` : "",
    contract.excludedCapabilities?.length ? `Excluded capabilities: ${contract.excludedCapabilities.join("; ")}` : "",
    contract.planningDepthHints.length ? `Planning-depth hints: ${contract.planningDepthHints.join(" ")}` : "",
    contract.openQuestions.length ? `Open scope questions: ${contract.openQuestions.join(" ")}` : "",
    contract.evidence.length ? `Scope evidence: ${contract.evidence.join(" | ")}` : "",
  ].filter(Boolean);
}

function featureLabel(feature: ProjectBoardScopeFeature): string {
  return feature.replace(/_/g, "/");
}
