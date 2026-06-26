import type {
  ProjectBoardPlanningDepthAssessment,
  ProjectBoardPmReviewReport,
  ProjectBoardScopeContract,
} from "../../shared/projectBoardTypes";
import type { ProjectBoardModelBudgetProfile, ProjectBoardPromptBudgetAssessment } from "./projectBoardModelBudgetProfile";
import type { ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import type { ProjectBoardPlanningSection } from "./projectBoardSectionedPlanning";
import type { ProjectBoardSynthesisDraft } from "./projectBoardSynthesis";
import type { ProjectBoardPlannerLedgerCompactionTelemetry } from "./projectBoardSynthesisPlannerPrompts";
import type { PlannerLastValidRecord } from "./projectBoardSynthesisProviderPlannerProgress";

export interface AmbientProjectBoardSynthesisProgress {
  stage: "model_request" | "model_response" | "schema_validation";
  title: string;
  summary: string;
  metadata: Record<string, unknown>;
  promptCharCount?: number;
  responseCharCount?: number;
  cardCount?: number;
  questionCount?: number;
}

export interface AmbientProjectBoardSynthesisTelemetry {
  promptCharCount: number;
  responseCharCount: number;
  requestDurationMs: number;
  cardCount: number;
  questionCount: number;
  progressiveRecordCount?: number;
  sectionCount?: number;
  plannerBatchCount?: number;
  batchCardLimit?: number;
  skippedSectionCount?: number;
  failedSectionCount?: number;
  semanticIdleSectionCount?: number;
  finishReason?: string;
  plannerBatchFinishReasons?: string[];
  recoverableOutputStopCount?: number;
  outputTokenBudget?: number;
  modelBudgetProfile?: ProjectBoardModelBudgetProfile;
  promptBudgetStatus?: ProjectBoardPromptBudgetAssessment["status"];
  promptBudgetWarningCount?: number;
  maxPromptBudgetUtilization?: number;
  lastPromptBudgetAssessment?: ProjectBoardPromptBudgetAssessment;
  plannerLedgerCompactionCount?: number;
  plannerLedgerCompactionCacheHitCount?: number;
  lastPlannerLedgerCompaction?: ProjectBoardPlannerLedgerCompactionTelemetry;
  lastValidRecordId?: string;
  lastValidRecordType?: string;
  paused?: boolean;
  pauseReason?: string;
  renderedCardDuplicateFilterCount?: number;
  scopeContractFilterCount?: number;
  partial?: boolean;
}

export interface AmbientProjectBoardSynthesisResult {
  draft: ProjectBoardSynthesisDraft;
  telemetry: AmbientProjectBoardSynthesisTelemetry;
  progressiveRecords?: ProposalJsonlRecordArtifact[];
  scopeContract?: ProjectBoardScopeContract;
  planningDepth?: ProjectBoardPlanningDepthAssessment;
}

export interface AmbientProjectBoardPmReviewResult {
  draft: ProjectBoardSynthesisDraft;
  reviewReport: ProjectBoardPmReviewReport;
  telemetry: AmbientProjectBoardSynthesisTelemetry;
}

export interface AmbientProjectBoardSynthesisProgressiveBatch {
  records: ProposalJsonlRecordArtifact[];
  section: ProjectBoardPlanningSection;
  sectionIndex: number;
  sectionCount: number;
  promptCharCount: number;
  responseCharCount: number;
  accumulatedRecordCount: number;
}

export interface ProjectBoardSynthesisPauseCheckInput {
  phase: "section" | "planner_batch";
  sectionIndex?: number;
  sectionCount?: number;
  batchNumber?: number;
  batchCount?: number;
  recordCount: number;
  lastValidRecord?: PlannerLastValidRecord;
}
