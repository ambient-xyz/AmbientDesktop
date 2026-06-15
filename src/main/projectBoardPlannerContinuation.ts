import { projectBoardSynthesisOutputCapRecovery } from "../shared/projectBoardSynthesisRecovery";
import type { ProjectBoardSynthesisRun } from "../shared/types";
import type { ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";

export interface ProjectBoardPlannerBatchContinuation {
  retryOfRunId: string;
  finishReason?: string;
  stopReason?: string;
  outputTokenBudget?: number;
  lastValidRecordId: string;
  lastValidRecordType: string;
  lastValidRecordIndex?: number;
  plannerBatchIndex?: number;
  plannerBatchCount?: number;
  originalRecordCount: number;
  retainedRecordCount: number;
  truncatedToLastValidRecord: boolean;
}

export function projectBoardPlannerContinuationForRetry(
  run: ProjectBoardSynthesisRun,
  records: ProposalJsonlRecordArtifact[],
): { records: ProposalJsonlRecordArtifact[]; continuation?: ProjectBoardPlannerBatchContinuation } {
  const recovery = projectBoardSynthesisOutputCapRecovery(run);
  if (!recovery.canContinue || !recovery.lastValidRecordId || !recovery.lastValidRecordType) {
    return { records };
  }
  const truncated = truncateProjectBoardPlannerContinuationRecords(records, {
    lastValidRecordId: recovery.lastValidRecordId,
    lastValidRecordType: recovery.lastValidRecordType,
  });
  return {
    records: truncated.records,
    continuation: {
      retryOfRunId: run.id,
      finishReason: recovery.finishReason,
      stopReason: recovery.stopReason,
      outputTokenBudget: recovery.outputTokenBudget,
      lastValidRecordId: recovery.lastValidRecordId,
      lastValidRecordType: recovery.lastValidRecordType,
      lastValidRecordIndex: recovery.lastValidRecordIndex,
      plannerBatchIndex: recovery.plannerBatchIndex,
      plannerBatchCount: recovery.plannerBatchCount,
      originalRecordCount: records.length,
      retainedRecordCount: truncated.records.length,
      truncatedToLastValidRecord: truncated.matched,
    },
  };
}

export function truncateProjectBoardPlannerContinuationRecords(
  records: ProposalJsonlRecordArtifact[],
  marker: { lastValidRecordId: string; lastValidRecordType: string },
): { records: ProposalJsonlRecordArtifact[]; matched: boolean } {
  const withoutFinal = records.filter((record) => record.type !== "proposal_final");
  const stopIndex = latestRecoverableOutputStopIndex(withoutFinal);
  const searchEnd = stopIndex >= 0 ? stopIndex : withoutFinal.length;
  let lastMatchIndex = -1;
  for (let index = 0; index < searchEnd; index += 1) {
    if (recordMatchesContinuationMarker(withoutFinal[index], marker)) lastMatchIndex = index;
  }
  if (lastMatchIndex >= 0) return { records: withoutFinal.slice(0, lastMatchIndex + 1), matched: true };
  if (stopIndex > 0) return { records: withoutFinal.slice(0, stopIndex), matched: false };
  return { records: withoutFinal, matched: false };
}

function latestRecoverableOutputStopIndex(records: ProposalJsonlRecordArtifact[]): number {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record?.type !== "progress") continue;
    const metadata = record.metadata;
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata) && metadata.recoverableOutputStop === true) {
      return index;
    }
  }
  return -1;
}

function recordMatchesContinuationMarker(
  record: ProposalJsonlRecordArtifact | undefined,
  marker: { lastValidRecordId: string; lastValidRecordType: string },
): boolean {
  if (!record || record.type !== marker.lastValidRecordType) return false;
  return plannerContinuationRecordId(record) === marker.lastValidRecordId;
}

function plannerContinuationRecordId(record: ProposalJsonlRecordArtifact): string | undefined {
  if (record.type === "candidate_card") return record.sourceId;
  if (record.type === "question") return record.questionId;
  if (record.type === "source_coverage") return record.sourceId;
  if (record.type === "dependency_edge") return `${record.fromCardId}->${record.toCardId}`;
  if (record.type === "warning") return record.code;
  if (record.type === "error") return record.code;
  if (record.type === "proposal_final") return "proposal_final";
  return undefined;
}
