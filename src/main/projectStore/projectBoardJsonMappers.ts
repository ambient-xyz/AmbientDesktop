import type { ProjectBoardCardTestPlan, ProjectBoardCardTouchedField } from "../../shared/projectBoardTypes";
import { normalizeProjectBoardCardTestPlan } from "./projectBoardCardNormalizationMappers";

const PROJECT_BOARD_CARD_TOUCHED_FIELDS = new Set<ProjectBoardCardTouchedField>([
  "title",
  "description",
  "candidateStatus",
  "priority",
  "phase",
  "labels",
  "dependencies",
  "acceptanceCriteria",
  "testPlan",
  "sourceRefs",
  "clarificationQuestions",
  "clarificationSuggestions",
  "clarificationAnswers",
  "clarificationDecisions",
  "uiMockMetadata",
]);

export function parseProjectBoardStringList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch (error) {
    warnCorruptProjectBoardJson("parseProjectBoardStringList", value, error);
    return [];
  }
}

export function parseProjectBoardCardTouchedFields(value: string | null | undefined): ProjectBoardCardTouchedField[] {
  return parseProjectBoardStringList(value).filter((field): field is ProjectBoardCardTouchedField =>
    PROJECT_BOARD_CARD_TOUCHED_FIELDS.has(field as ProjectBoardCardTouchedField),
  );
}

export function parseProjectBoardCardTestPlan(value: string | null | undefined): ProjectBoardCardTestPlan {
  if (!value) return { unit: [], integration: [], visual: [], manual: [] };
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { unit: [], integration: [], visual: [], manual: [] };
    const candidate = parsed as Partial<ProjectBoardCardTestPlan>;
    return normalizeProjectBoardCardTestPlan({
      unit: Array.isArray(candidate.unit) ? candidate.unit.filter((item): item is string => typeof item === "string") : [],
      integration: Array.isArray(candidate.integration)
        ? candidate.integration.filter((item): item is string => typeof item === "string")
        : [],
      visual: Array.isArray(candidate.visual) ? candidate.visual.filter((item): item is string => typeof item === "string") : [],
      manual: Array.isArray(candidate.manual) ? candidate.manual.filter((item): item is string => typeof item === "string") : [],
    });
  } catch {
    return { unit: [], integration: [], visual: [], manual: [] };
  }
}

export function parseProjectBoardJsonObject<T>(json: string, fallback: T): T {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch (error) {
    warnCorruptProjectBoardJson("parseProjectBoardJsonObject", json, error);
    return fallback;
  }
}

export function parseProjectBoardJsonArray<T>(json: string | null | undefined): T[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (error) {
    warnCorruptProjectBoardJson("parseProjectBoardJsonArray", json, error);
    return [];
  }
}

// Corrupted persisted JSON falls back to an empty value, and the next
// read-modify-write persists that emptiness permanently; log loudly so the
// corruption is at least diagnosable from logs.
function warnCorruptProjectBoardJson(parser: string, json: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(`[project-board] ${parser}: corrupted persisted JSON treated as empty (${reason}): ${json.slice(0, 200)}`);
}
