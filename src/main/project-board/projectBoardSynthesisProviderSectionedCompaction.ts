import type { ProjectBoardCharterProjectSummary } from "../../shared/projectBoardTypes";
import type { ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import { projectBoardPromptBudgetAssessmentMetadata, type ProjectBoardPromptBudgetAssessment } from "./projectBoardModelBudgetProfile";
import {
  appendProjectBoardPlannerWorkspaceRecords,
  markProjectBoardPlannerWorkspaceTailRecords,
  type ProjectBoardPlannerWorkspace,
  type ProjectBoardPlannerWorkspaceTailState,
} from "./projectBoardPlannerWorkspace";
import type { ProjectBoardPlanningSection } from "./projectBoardSectionedPlanning";
import type { ProjectBoardSynthesisRefinementContext, ProjectBoardSynthesisSource } from "./projectBoardSynthesis";
import {
  buildSectionedContextCompactionPrompt,
  plannerLedgerCompactionCacheKey,
  projectBoardSectionedContextCompactionDecision,
  readCachedPlannerLedgerCompaction,
  type ProjectBoardPlannerLedgerCompaction,
  type ProjectBoardSectionedContextCompactionReason,
} from "./projectBoardSynthesisPlannerPrompts";
import {
  plannerLedgerCompactionTelemetryMetadata,
  projectBoardPromptBudgetRunMetadata,
  sectionedContextCompactionProgressRecord,
  type AmbientProjectBoardSynthesisProgress,
  type AmbientProjectBoardSynthesisProgressiveBatch,
} from "./projectBoardSynthesisProviderSupport";

export interface ProjectBoardSectionedPlannerLedgerCompactionInput {
  apiKey: string;
  prompt: string;
  sources: ProjectBoardSynthesisSource[];
  priorRecords: ProposalJsonlRecordArtifact[];
  rawPromptBudget: ProjectBoardPromptBudgetAssessment;
  cacheKey: string;
  batchNumber: number;
  maxBatches: number;
  maxCardsPerBatch: number;
  plannerSessionId?: string;
  signal?: AbortSignal;
}

export interface ProjectBoardSectionedContextCompactionInput {
  apiKey: string;
  section: ProjectBoardPlanningSection;
  sectionNumber: number;
  sectionCount: number;
  sources: ProjectBoardSynthesisSource[];
  projectName: string | undefined;
  refinement: ProjectBoardSynthesisRefinementContext | undefined;
  charterProjectSummary: ProjectBoardCharterProjectSummary | undefined;
  rawBasePrompt: string;
  rawBasePromptBudget: ProjectBoardPromptBudgetAssessment;
  currentPromptCharCount: number;
  totalResponseCharCount: number;
  maxCardsPerSection: number;
  records: ProposalJsonlRecordArtifact[];
  plannerWorkspace: ProjectBoardPlannerWorkspace | undefined;
  workspaceTailState: ProjectBoardPlannerWorkspaceTailState;
  onProgress: ((progress: AmbientProjectBoardSynthesisProgress) => void) | undefined;
  onProgressiveRecords: ((batch: AmbientProjectBoardSynthesisProgressiveBatch) => void) | undefined;
  compactPlannerBatchLedger: (input: ProjectBoardSectionedPlannerLedgerCompactionInput) => Promise<ProjectBoardPlannerLedgerCompaction>;
  signal: AbortSignal | undefined;
}

export interface ProjectBoardSectionedContextCompactionResult {
  compaction?: ProjectBoardPlannerLedgerCompaction;
  reason?: ProjectBoardSectionedContextCompactionReason;
  promptCharCount: number;
  cacheHit: boolean;
}

export async function maybeCompactProjectBoardSectionedContext(
  input: ProjectBoardSectionedContextCompactionInput,
): Promise<ProjectBoardSectionedContextCompactionResult> {
  const compactionDecision = projectBoardSectionedContextCompactionDecision({
    section: input.section,
    sectionNumber: input.sectionNumber,
    sectionCount: input.sectionCount,
    rawPrompt: input.rawBasePrompt,
    rawPromptBudget: input.rawBasePromptBudget,
    cumulativePromptCharCount: input.currentPromptCharCount + input.rawBasePrompt.length,
    sources: input.sources,
  });
  if (!compactionDecision.compact) {
    return { promptCharCount: 0, cacheHit: false };
  }

  const compactionReason = compactionDecision.reason ?? "repeated_stable_context";
  const compactionCacheKey = plannerLedgerCompactionCacheKey({
    sources: input.sources,
    projectName: input.projectName,
    priorRecords: input.records,
    refinement: input.refinement,
    charterProjectSummary: input.charterProjectSummary,
    rawPromptBudget: input.rawBasePromptBudget,
    batchNumber: input.sectionNumber,
    maxBatches: input.sectionCount,
    maxCardsPerBatch: input.maxCardsPerSection,
  });
  const cachedCompaction = readCachedPlannerLedgerCompaction(input.records, compactionCacheKey, input.rawBasePromptBudget);
  const compactionStartedAt = Date.now();
  let sectionContextCompaction = cachedCompaction;
  if (!sectionContextCompaction) {
    const compactionPrompt = buildSectionedContextCompactionPrompt({
      section: input.section,
      sectionNumber: input.sectionNumber,
      sectionCount: input.sectionCount,
      sources: input.sources,
      projectName: input.projectName,
      priorRecords: input.records,
      rawPromptBudget: input.rawBasePromptBudget,
      reason: compactionReason,
      maxCardsPerSection: input.maxCardsPerSection,
    });
    input.onProgress?.({
      stage: "model_request",
      title: `Compacting section context ${input.sectionNumber}/${input.sectionCount}`,
      summary: `The sectioned planner reached ${compactionReason.replace(/_/g, " ")}; compacting repeated source and rendered-card context before asking for ${input.section.heading}.`,
      metadata: {
        sectionId: input.section.id,
        sectionIndex: input.sectionNumber,
        sectionCount: input.sectionCount,
        sectionHeading: input.section.heading,
        sourceId: input.section.sourceId,
        sourcePath: input.section.sourcePath,
        plannerSessionId: input.plannerWorkspace?.sessionId,
        promptCharCount: input.currentPromptCharCount + compactionPrompt.length,
        ...projectBoardPromptBudgetRunMetadata({
          latestPromptCharCount: compactionPrompt.length,
          cumulativePromptCharCount: input.currentPromptCharCount + compactionPrompt.length,
          promptBudget: input.rawBasePromptBudget,
          plannerLedgerCompactionStatus: "started",
        }),
        sectionContextCompactionReason: compactionReason,
        compactionPromptCharCount: compactionPrompt.length,
        compactionCacheKey,
        rawPromptCharCount: input.rawBasePrompt.length,
        rawPromptBudgetAssessment: projectBoardPromptBudgetAssessmentMetadata(input.rawBasePromptBudget),
      },
      promptCharCount: input.currentPromptCharCount + compactionPrompt.length,
      cardCount: input.records.filter((record) => record.type === "candidate_card").length,
      questionCount: input.records.filter((record) => record.type === "question").length,
    });
    sectionContextCompaction = await input.compactPlannerBatchLedger({
      apiKey: input.apiKey,
      prompt: compactionPrompt,
      sources: input.sources,
      priorRecords: input.records,
      rawPromptBudget: input.rawBasePromptBudget,
      cacheKey: compactionCacheKey,
      batchNumber: input.sectionNumber,
      maxBatches: input.sectionCount,
      maxCardsPerBatch: input.maxCardsPerSection,
      plannerSessionId: input.plannerWorkspace?.sessionId,
      signal: input.signal,
    });
  }

  const promptCharCount = sectionContextCompaction.promptCharCount;
  const promptCharCountAfterCompaction = input.currentPromptCharCount + promptCharCount;
  const compactionRecord = sectionedContextCompactionProgressRecord({
    compaction: sectionContextCompaction,
    section: input.section,
    sectionNumber: input.sectionNumber,
    sectionCount: input.sectionCount,
    maxCardsPerSection: input.maxCardsPerSection,
    reason: compactionReason,
    plannerSessionId: input.plannerWorkspace?.sessionId,
    durationMs: Date.now() - compactionStartedAt,
  });
  markProjectBoardPlannerWorkspaceTailRecords(input.workspaceTailState, [compactionRecord]);
  await appendProjectBoardPlannerWorkspaceRecords(input.plannerWorkspace, [compactionRecord]);
  input.records.push(compactionRecord);
  input.onProgressiveRecords?.({
    records: [compactionRecord],
    section: input.section,
    sectionIndex: input.sectionNumber,
    sectionCount: input.sectionCount,
    promptCharCount: promptCharCountAfterCompaction,
    responseCharCount: input.totalResponseCharCount,
    accumulatedRecordCount: input.records.length,
  });
  input.onProgress?.({
    stage: "model_response",
    title: sectionContextCompaction.cacheHit
      ? `Reused cached section context compaction ${input.sectionNumber}/${input.sectionCount}`
      : `Compacted section context ${input.sectionNumber}/${input.sectionCount}`,
    summary: sectionContextCompaction.cacheHit
      ? `Reused cached section-context compaction for ${input.section.heading}.`
      : `Compacted repeated source and rendered-card context for ${input.section.heading} using ${sectionContextCompaction.source}.`,
    metadata: {
      sectionId: input.section.id,
      sectionIndex: input.sectionNumber,
      sectionCount: input.sectionCount,
      plannerSessionId: input.plannerWorkspace?.sessionId,
      plannerLedgerCompactionStatus: sectionContextCompaction.cacheHit ? "cache_hit" : "used",
      plannerLedgerCompaction: plannerLedgerCompactionTelemetryMetadata(sectionContextCompaction),
      sectionContextCompactionReason: compactionReason,
      compactionDurationMs: Date.now() - compactionStartedAt,
    },
    promptCharCount: promptCharCountAfterCompaction,
    cardCount: input.records.filter((record) => record.type === "candidate_card").length,
    questionCount: input.records.filter((record) => record.type === "question").length,
  });
  return {
    compaction: sectionContextCompaction,
    reason: compactionReason,
    promptCharCount,
    cacheHit: Boolean(cachedCompaction),
  };
}
