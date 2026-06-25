import { randomUUID } from "node:crypto";

import type { ProjectBoardCardRunFeedback, ProjectBoardCardRunFeedbackSource } from "../../shared/projectBoardTypes";

const PROJECT_BOARD_CARD_RUN_FEEDBACK_SOURCES = new Set<ProjectBoardCardRunFeedbackSource>([
  "manual",
  "decision_impact",
  "proof_review",
  "source_impact",
]);
export function normalizeProjectBoardCardRunFeedbackSource(value: unknown): ProjectBoardCardRunFeedbackSource {
  return typeof value === "string" && PROJECT_BOARD_CARD_RUN_FEEDBACK_SOURCES.has(value as ProjectBoardCardRunFeedbackSource)
    ? (value as ProjectBoardCardRunFeedbackSource)
    : "manual";
}

export function normalizeProjectBoardCardRunFeedback(
  value: ProjectBoardCardRunFeedback[] | undefined,
  fallback: ProjectBoardCardRunFeedback[] = [],
): ProjectBoardCardRunFeedback[] {
  const source = value ?? fallback;
  const feedback: ProjectBoardCardRunFeedback[] = [];
  const seen = new Set<string>();
  for (const item of source) {
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim().slice(0, 120) : randomUUID();
    const text = typeof item.feedback === "string" ? item.feedback.trim().slice(0, 1500) : "";
    if (!text || seen.has(id)) continue;
    const sourceKind = normalizeProjectBoardCardRunFeedbackSource(item.source);
    const createdAt =
      typeof item.createdAt === "string" && item.createdAt.trim() ? item.createdAt.trim().slice(0, 80) : new Date().toISOString();
    const decisionQuestion =
      typeof item.decisionQuestion === "string" && item.decisionQuestion.trim() ? item.decisionQuestion.trim().slice(0, 500) : undefined;
    const decisionAnswer =
      typeof item.decisionAnswer === "string" && item.decisionAnswer.trim() ? item.decisionAnswer.trim().slice(0, 1500) : undefined;
    const sourceImpactEventId =
      typeof item.sourceImpactEventId === "string" && item.sourceImpactEventId.trim()
        ? item.sourceImpactEventId.trim().slice(0, 120)
        : undefined;
    const sourceImpactEventIds = Array.isArray(item.sourceImpactEventIds)
      ? [
          ...new Set(
            item.sourceImpactEventIds
              .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
              .map((id) => id.trim().slice(0, 120)),
          ),
        ].slice(0, 100)
      : undefined;
    const sourceIds = Array.isArray(item.sourceIds)
      ? [
          ...new Set(
            item.sourceIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim().slice(0, 200)),
          ),
        ].slice(0, 100)
      : undefined;
    const createdBy = typeof item.createdBy === "string" && item.createdBy.trim() ? item.createdBy.trim().slice(0, 120) : undefined;
    seen.add(id);
    feedback.push({
      id,
      feedback: text,
      source: sourceKind,
      decisionQuestion,
      decisionAnswer,
      sourceImpactEventId,
      ...(sourceImpactEventIds?.length ? { sourceImpactEventIds } : {}),
      ...(sourceIds?.length ? { sourceIds } : {}),
      createdAt,
      createdBy,
    });
  }
  // New feedback is appended at the end, so cap by keeping the newest entries —
  // keeping the first 20 would silently drop every new item once a card hits the cap.
  return feedback.slice(-20);
}

export function parseProjectBoardCardRunFeedback(value: string | null | undefined): ProjectBoardCardRunFeedback[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return normalizeProjectBoardCardRunFeedback(
      parsed.filter(
        (item): item is ProjectBoardCardRunFeedback =>
          Boolean(item) && typeof item === "object" && typeof item.feedback === "string" && typeof item.source === "string",
      ),
    );
  } catch {
    return [];
  }
}
