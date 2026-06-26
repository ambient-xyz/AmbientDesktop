import type { ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import {
  extractProjectBoardProposalJsonlRecordsFromText,
  projectBoardProgressiveRecordsFromDraft,
  projectBoardSynthesisDraftFromProgressiveRecords,
} from "./projectBoardProgressivePlanning";
import {
  normalizeProjectBoardSynthesisDraft,
  type ProjectBoardSynthesisDraft,
  type ProjectBoardSynthesisSource,
} from "./projectBoardSynthesis";
import { parseProjectBoardSynthesisJson } from "./projectBoardSynthesisPlannerPrompts";
import { dedupeProgressiveRecords } from "./projectBoardSynthesisProviderSectionRecords";

export function normalizePlannerBatchRecords(
  responseText: string,
  fallback: { projectName?: string; sources: ProjectBoardSynthesisSource[]; batchWorkspaceRecordCount: number },
): ProposalJsonlRecordArtifact[] {
  const records = extractProjectBoardProposalJsonlRecordsFromText(responseText);
  if (records.length > 0) return dedupeProgressiveRecords(records.filter((record) => record.type !== "proposal_final"));
  if (fallback.batchWorkspaceRecordCount > 0) return [];
  return projectBoardProgressiveRecordsFromDraft({
    draft: normalizeProjectBoardSynthesisResponse(responseText, {
      projectName: fallback.projectName,
      sources: fallback.sources,
    }),
    sources: fallback.sources,
    includeProgress: false,
  }).filter((record) => record.type !== "proposal_final");
}

export function normalizeProjectBoardSynthesisResponse(
  responseText: string,
  fallback: { projectName?: string; sources: ProjectBoardSynthesisSource[] },
  options: { uxMockGate?: "auto" | "preserve" | "off" } = {},
): ProjectBoardSynthesisDraft {
  let parsed: unknown;
  try {
    parsed = parseProjectBoardSynthesisJson(responseText);
    return normalizeProjectBoardSynthesisDraft(parsed, options);
  } catch (error) {
    const records = extractProjectBoardProposalJsonlRecordsFromParsedValue(parsed);
    if (records.length > 0) {
      return projectBoardSynthesisDraftFromProgressiveRecords(records, {
        projectName: fallback.projectName,
        summary: "Recovered a board proposal from progressive planning records in the Ambient/Pi response.",
      });
    }
    const textRecords = extractProjectBoardProposalJsonlRecordsFromText(responseText);
    if (textRecords.length > 0) {
      return projectBoardSynthesisDraftFromProgressiveRecords(textRecords, {
        projectName: fallback.projectName,
        summary: "Recovered a board proposal from progressive planning JSONL in the Ambient/Pi response.",
      });
    }
    throw error;
  }
}

export function extractProjectBoardProposalJsonlRecordsFromParsedValue(parsed: unknown) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const record = parsed as Record<string, unknown>;
  const source = Array.isArray(record.progressiveRecords) ? record.progressiveRecords : Array.isArray(record.records) ? record.records : [];
  return extractProjectBoardProposalJsonlRecordsFromText(source.map((item) => JSON.stringify(item)).join("\n"));
}

export function lastCandidateTitle(records: ProposalJsonlRecordArtifact[]): string | undefined {
  return records.filter((record) => record.type === "candidate_card").at(-1)?.title;
}

export function lastQuestion(records: ProposalJsonlRecordArtifact[]): string | undefined {
  return records.filter((record) => record.type === "question").at(-1)?.question;
}
