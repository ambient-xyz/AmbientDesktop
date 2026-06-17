import type {
  ProjectBoardAddCardsGroundingMode,
  ProjectBoardAddCardsObjectiveProvenance,
  ProjectBoardSource,
  ProjectBoardSummary,
  RefineProjectBoardSynthesisInput,
} from "../../shared/types";
import {
  validateProposalJsonlRecordArtifact,
  type ProposalJsonlRecordArtifact,
} from "./projectBoardArtifacts";
import { projectBoardSourceIncludedInSynthesis } from "./projectBoardSourceIdentity";
import type { ProjectBoardSynthesisDraft } from "./projectBoardSynthesis";
import { projectBoardProofScopePromptRules } from "./projectBoardProofScope";

export interface ProjectBoardSelectedSourceScope {
  selectedSourceIds: string[];
  sources: ProjectBoardSource[];
  selected: boolean;
}

export interface ProjectBoardSourceScopeAnswerInput {
  boardId: string;
  board?: ProjectBoardSummary;
  sources: ProjectBoardSource[];
  mode?: RefineProjectBoardSynthesisInput["mode"];
  selectedSourceScope?: boolean;
  objective?: string;
}

export interface ProjectBoardObjectiveProvenanceContext {
  objective?: string;
  selectedSourceScope?: boolean;
  selectedSourceIds?: string[];
  sourceContextAvailable?: boolean;
}

export interface ProjectBoardObjectiveProvenanceAnnotation {
  draft: ProjectBoardSynthesisDraft;
  warningRecords: ProposalJsonlRecordArtifact[];
}

export interface ProjectBoardObjectiveProvenanceRecordAnnotation {
  records: ProposalJsonlRecordArtifact[];
  warningRecords: ProposalJsonlRecordArtifact[];
}

export function deterministicProjectBoardSourceElaborationDraft(input: {
  sources: ProjectBoardSource[];
  objective?: string;
  projectName?: string;
}): ProjectBoardSynthesisDraft {
  const sources = input.sources.filter(projectBoardSourceIncludedInSynthesis);
  const sourceNotes = sources.map((source) => `${source.kind}: ${source.path || source.title} - ${source.summary}`).slice(0, 8);
  const recommendations = sources.flatMap((source) =>
    deterministicSourceRecommendations(source).map((recommendation, index) => ({ source, recommendation, index })),
  );
  const cardInputs =
    recommendations.length > 0
      ? recommendations.slice(0, 8)
      : sources.slice(0, 4).map((source, index) => ({
          source,
          recommendation: `Review and convert ${source.path || source.title} into source-grounded follow-up work.`,
          index,
        }));
  const cards = cardInputs.map(({ source, recommendation, index }) => {
    const sourceLabel = source.path || source.title;
    const title = deterministicSourceRecommendationTitle(recommendation);
    const sourceRefs = [source.id, source.path, source.sourceKey].filter((value): value is string => Boolean(value?.trim()));
    const promotionReason = source.classifiedBy === "user" ? source.classificationReason || "User promoted this source for synthesis." : undefined;
    return {
      sourceId: `source-elaboration:${slugForSourceId(sourceLabel)}:${index + 1}`,
      title,
      description: [
        `Create a follow-up card from the selected source ${sourceLabel}.`,
        `Source recommendation: ${recommendation}`,
        promotionReason ? `Promotion decision: ${promotionReason}` : "",
        input.objective?.trim() ? `Add Cards objective: ${input.objective.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      candidateStatus: "ready_to_create" as const,
      priority: Math.min(5, index + 1),
      phase: "Source follow-up",
      labels: ["source-elaboration", source.kind === "report_artifact" ? "report" : "source"],
      blockedBy: [],
      sourceRefs,
      clarificationQuestions: [],
      acceptanceCriteria: [
        `The remediation implied by "${recommendation}" is implemented or captured as a narrower follow-up.`,
        `The card cites ${sourceLabel} and preserves the explicit source promotion decision when present.`,
      ],
      testPlan: {
        unit: [],
        integration: ["Run the smallest deterministic proof command available for the changed surface."],
        visual: [],
        manual: [`Review the result against ${sourceLabel}.`],
      },
    };
  });
  return {
    summary: "Recovered deterministic Add Cards proposal from selected source recommendations.",
    goal: input.objective?.trim() || `Elaborate follow-up cards from ${sources.length} selected source${sources.length === 1 ? "" : "s"}.`,
    currentState:
      sources.length > 0
        ? `Selected source scope contains ${sources.map((source) => source.path || source.title).join(", ")}.`
        : "No included selected sources were available.",
    targetUser: "Project contributors using Ambient source promotion to turn generated artifacts into reviewable work.",
    qualityBar: "Every recovered card must cite its selected source and retain deterministic proof expectations.",
    assumptions: ["Ambient/Pi did not provide usable live planner cards, so Ambient recovered a bounded deterministic proposal from selected source text."],
    questions: [],
    sourceNotes,
    cards,
  };
}

export function selectProjectBoardSynthesisSources(
  persistedSources: ProjectBoardSource[],
  sourceIds: string[] | undefined,
): ProjectBoardSelectedSourceScope {
  const selectedSourceIds = [...new Set((sourceIds ?? []).map((sourceId) => sourceId.trim()).filter(Boolean))];
  if (selectedSourceIds.length === 0) {
    return { selectedSourceIds: [], sources: persistedSources, selected: false };
  }
  const selected = new Set(selectedSourceIds);
  const matchedSources = persistedSources.filter((source) => selected.has(source.id));
  if (matchedSources.length === 0) {
    throw new Error("Selected source scope was not found after refreshing project sources.");
  }
  const sources = matchedSources.filter(projectBoardSourceIncludedInSynthesis);
  if (sources.length === 0) {
    throw new Error("Selected source scope is ignored for synthesis. Promote the source before running Add Cards.");
  }
  return { selectedSourceIds: sources.map((source) => source.id), sources, selected: true };
}

function deterministicSourceRecommendations(source: ProjectBoardSource): string[] {
  const lines = (source.excerpt || source.summary || "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line.length >= 12)
    .slice(0, 6);
}

function deterministicSourceRecommendationTitle(recommendation: string): string {
  const cleaned = recommendation
    .replace(/^[A-Z][A-Za-z ]{2,24}:\s+/, "")
    .replace(/[.]+$/g, "")
    .trim();
  const titled = /^(add|create|write|implement|cover|capture|verify|review|require|document|fix|harden)\b/i.test(cleaned)
    ? cleaned
    : `Address ${cleaned}`;
  return titled.slice(0, 96).replace(/^./, (char) => char.toUpperCase());
}

function slugForSourceId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "source";
}

export function projectBoardSourceScopeAnswersForRefinement(input: ProjectBoardSourceScopeAnswerInput) {
  const objective = input.objective?.trim();
  if (input.mode !== "source_elaboration" || (input.sources.length === 0 && !objective)) return [];
  const existingCardSummary =
    input.board?.id === input.boardId
      ? input.board.cards
          .filter((card) => card.status !== "archived")
          .slice(0, 80)
          .map((card, index) => {
            const phase = card.phase ? `, phase ${card.phase}` : "";
            const blockers = card.blockedBy.length ? `, blocked by ${card.blockedBy.join(", ")}` : "";
            const sourceRefs = card.sourceRefs?.length ? `, sources ${card.sourceRefs.join(", ")}` : "";
            return `${index + 1}. ${card.title} (${card.candidateStatus}${phase}${blockers}${sourceRefs})`;
          })
          .join("\n")
      : "";
  const sourceSummary = input.sources
    .map((source, index) =>
      [
        `${index + 1}. ${source.path || source.title} (${source.kind})`,
        source.changeState ? `change=${source.changeState}` : "",
        source.authorityRole ? `authority=${source.authorityRole}` : "",
        source.includeInSynthesis === false ? "include=false" : "",
        source.classifiedBy ? `classifiedBy=${source.classifiedBy}` : "",
        source.classificationReason ? `classificationReason: ${source.classificationReason}` : "",
        `summary: ${source.summary}`,
      ]
        .filter(Boolean)
        .join(" - "),
    )
    .join("\n");
  const scopeIntro = input.selectedSourceScope
    ? [
        "Elaborate candidate cards only from the selected source scope below.",
        "Prefer concrete cards that cover named systems, mechanics, screens, data structures, tests, and proof paths in the selected source.",
      ]
    : [
        "Use the recent source scan context below as grounding evidence for the Add Cards objective.",
        "Do not treat the entire source scan as a request to revise or replace the whole board.",
      ];
  const answers = [
    ...(objective
      ? [
          {
            question: "Add Cards objective",
            answer: [
              "The user supplied this high-level objective for additive card elaboration.",
              "Generate net-new candidate cards that advance this objective without replacing existing board cards.",
              "If source grounding is weak or missing, label the gap with a clarification question or source-gap note instead of inventing source evidence.",
              "",
              objective,
            ].join("\n"),
          },
        ]
      : []),
    {
      question: input.selectedSourceScope ? "Add Cards source scope" : "Add Cards source context",
      answer: [
        ...scopeIntro,
        "This is an additive Add Cards operation, not a global board revision.",
        "Do not replace, reinterpret, or summarize the whole board.",
        ...projectBoardProofScopePromptRules(),
        "Split large sections into multiple self-contained cards when a single Local Task would be too broad.",
        "Use sourceRefs that identify the selected source path or title when source evidence supports a card.",
        "",
        sourceSummary || "No source scan records were available for this Add Cards objective.",
      ].join("\n"),
    },
    {
      question: "Existing board cards to avoid duplicating",
      answer: existingCardSummary || "No existing board cards were found. Add objective-scoped cards normally.",
    },
  ];
  return answers;
}

export function annotateProjectBoardDraftWithObjectiveProvenance(
  draft: ProjectBoardSynthesisDraft,
  context: ProjectBoardObjectiveProvenanceContext,
): ProjectBoardObjectiveProvenanceAnnotation {
  const objective = context.objective?.trim();
  if (!objective) return { draft, warningRecords: [] };
  const cards = draft.cards.map((card) => ({
    ...card,
    objectiveProvenance: projectBoardObjectiveProvenanceForSourceRefs(card.sourceRefs, context),
  }));
  return {
    draft: { ...draft, cards },
    warningRecords: projectBoardObjectiveWeakGroundingWarningRecords(
      cards.flatMap((card) => (card.objectiveProvenance?.weakGrounding ? [{ id: card.sourceId, title: card.title }] : [])),
      context,
    ),
  };
}

export function annotateProjectBoardProgressiveRecordsWithObjectiveProvenance(
  records: ProposalJsonlRecordArtifact[],
  context: ProjectBoardObjectiveProvenanceContext,
): ProjectBoardObjectiveProvenanceRecordAnnotation {
  const objective = context.objective?.trim();
  if (!objective) return { records, warningRecords: [] };
  const weakCards: Array<{ id: string; title: string }> = [];
  const annotatedRecords = records.map((record) => {
    if (record.type !== "candidate_card") return record;
    const sourceRefs = record.sourceRefs.map((sourceRef) =>
      [sourceRef.sourceId, sourceRef.path, sourceRef.range, sourceRef.note].filter(Boolean).join("#"),
    );
    const objectiveProvenance = projectBoardObjectiveProvenanceForSourceRefs(sourceRefs, context);
    if (objectiveProvenance.weakGrounding) weakCards.push({ id: record.sourceId, title: record.title });
    return validateProposalJsonlRecordArtifact({
      ...record,
      objectiveProvenance,
    });
  });
  return {
    records: annotatedRecords,
    warningRecords: projectBoardObjectiveWeakGroundingWarningRecords(weakCards, context),
  };
}

export function projectBoardObjectiveProvenanceForSourceRefs(
  sourceRefs: string[],
  context: ProjectBoardObjectiveProvenanceContext,
): ProjectBoardAddCardsObjectiveProvenance {
  const objective = context.objective?.trim() ?? "";
  const selectedSourceIds = [...new Set((context.selectedSourceIds ?? []).map((sourceId) => sourceId.trim()).filter(Boolean))];
  const sourceRefCount = sourceRefs.filter((sourceRef) => sourceRef.trim()).length;
  const groundingMode = projectBoardAddCardsGroundingMode(context, selectedSourceIds);
  const weakGrounding = sourceRefCount === 0 || groundingMode === "objective_only";
  return {
    objective,
    groundingMode,
    selectedSourceIds,
    sourceRefCount,
    weakGrounding,
    sourceGap: weakGrounding
      ? "Pi emitted this objective card without enough source references. Review the card's grounding before accepting it."
      : undefined,
  };
}

function projectBoardAddCardsGroundingMode(
  context: ProjectBoardObjectiveProvenanceContext,
  selectedSourceIds: string[],
): ProjectBoardAddCardsGroundingMode {
  if (context.selectedSourceScope || selectedSourceIds.length > 0) return "selected_sources";
  if (context.sourceContextAvailable) return "source_scan";
  return "objective_only";
}

function projectBoardObjectiveWeakGroundingWarningRecords(
  weakCards: Array<{ id: string; title: string }>,
  context: ProjectBoardObjectiveProvenanceContext,
): ProposalJsonlRecordArtifact[] {
  const objective = context.objective?.trim();
  if (!objective || weakCards.length === 0) return [];
  const groundingMode = projectBoardAddCardsGroundingMode(
    context,
    [...new Set((context.selectedSourceIds ?? []).map((sourceId) => sourceId.trim()).filter(Boolean))],
  );
  return [
    validateProposalJsonlRecordArtifact({
      type: "warning",
      code: "add_cards_objective_weak_grounding",
      message: `Objective Add Cards produced ${weakCards.length} candidate card${
        weakCards.length === 1 ? "" : "s"
      } with weak source grounding.`,
      createdAt: new Date().toISOString(),
      metadata: {
        objective,
        groundingMode,
        weakCardIds: weakCards.map((card) => card.id),
        weakCardTitles: weakCards.map((card) => card.title),
        selectedSourceIds: context.selectedSourceIds ?? [],
      },
    }),
  ];
}
