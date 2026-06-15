import type { ProjectBoardEvent } from "../../shared/types";

export interface ProjectBoardEventGroup {
  label: string;
  events: ProjectBoardEvent[];
}

export type ProjectBoardSupersededCardReviewKind = "superseded" | "demoted" | "preserved";

export interface ProjectBoardSupersededCardReviewItem {
  eventId: string;
  runId?: string;
  category: ProjectBoardSupersededCardReviewKind;
  cardId: string;
  title: string;
  sourceId?: string;
  status?: string;
  candidateStatus?: string;
  userTouchedFields: string[];
  orchestrationTaskId?: string;
  executionThreadId?: string;
  clarificationQuestionCount?: number;
  createdAt: string;
}

export interface ProjectBoardSupersededCardReview {
  eventCount: number;
  supersededCount: number;
  demotedCount: number;
  preservedCount: number;
  items: ProjectBoardSupersededCardReviewItem[];
  summary: string;
}

export function projectBoardEventGroups(events: ProjectBoardEvent[] = []): ProjectBoardEventGroup[] {
  const groups = new Map<string, ProjectBoardEvent[]>();
  for (const event of events) {
    const label = projectBoardEventDateLabel(event.createdAt);
    groups.set(label, [...(groups.get(label) ?? []), event]);
  }
  return [...groups.entries()].map(([label, items]) => ({ label, events: items }));
}

export function projectBoardEventHasSupersededCardReview(event: ProjectBoardEvent): boolean {
  return event.metadata?.decision === "start_fresh_supersede_drafts" || projectBoardSupersededCardReview([event]).items.length > 0;
}

export function projectBoardSupersededCardReview(events: ProjectBoardEvent[] = []): ProjectBoardSupersededCardReview {
  const items: ProjectBoardSupersededCardReviewItem[] = [];
  let eventCount = 0;
  for (const event of events) {
    if (event.metadata?.decision !== "start_fresh_supersede_drafts") continue;
    eventCount += 1;
    const runId = projectBoardEventMetadataText(event, "abandonedRunId") ?? event.entityId;
    const demotedIds = new Set(projectBoardEventMetadataTextArray(event, "demotedPreservedCardIds"));
    items.push(
      ...projectBoardSupersededCardReviewItems(event, "supersededDraftCards", "supersededDraftCardIds", "superseded", runId),
      ...projectBoardSupersededCardReviewItems(event, "preservedCards", "preservedCardIds", "preserved", runId).map((item) =>
        demotedIds.has(item.cardId) ? { ...item, category: "demoted" as const } : item,
      ),
    );
  }
  const supersededCount = items.filter((item) => item.category === "superseded").length;
  const demotedCount = items.filter((item) => item.category === "demoted").length;
  const preservedCount = items.filter((item) => item.category === "preserved").length;
  const summary =
    items.length === 0
      ? "No Start Fresh superseded cards have been recorded yet."
      : [
          supersededCount ? `${supersededCount} superseded draft card${supersededCount === 1 ? "" : "s"}` : undefined,
          demotedCount ? `${demotedCount} preserved card${demotedCount === 1 ? "" : "s"} moved back to review` : undefined,
          preservedCount ? `${preservedCount} protected card${preservedCount === 1 ? "" : "s"} preserved` : undefined,
        ]
          .filter(Boolean)
          .join(", ");
  return { eventCount, supersededCount, demotedCount, preservedCount, items, summary };
}

export function projectBoardEventKindLabel(kind: ProjectBoardEvent["kind"]): string {
  if (kind === "board_created") return "Board";
  if (kind === "board_revision_started") return "Revision";
  if (kind === "status_changed") return "Status";
  if (kind === "sources_refreshed") return "Sources";
  if (kind === "board_synthesized") return "Synthesis";
  if (kind === "synthesis_proposal_created") return "Proposal";
  if (kind === "synthesis_proposal_answered") return "Proposal";
  if (kind === "synthesis_proposal_card_reviewed") return "Proposal";
  if (kind === "synthesis_proposal_applied") return "Proposal";
  if (kind === "source_updated") return "Source";
  if (kind === "question_answered") return "Kickoff";
  if (kind === "kickoff_defaults_suggested") return "Kickoff";
  if (kind === "charter_finalized") return "Charter";
  if (kind === "plan_promoted") return "Plan";
  if (kind === "card_updated") return "Card";
  if (kind === "candidate_status_changed") return "Candidate";
  if (kind === "card_split") return "Split";
  if (kind === "card_ticketized") return "Ticket";
  if (kind === "card_execution_session_assigned") return "Session";
  if (kind === "card_run_prepared") return "Run";
  if (kind === "card_run_started") return "Run";
  if (kind === "card_run_progress") return "Progress";
  if (kind === "card_run_completed") return "Run";
  if (kind === "card_run_failed") return "Run";
  if (kind === "card_run_blocked") return "Run";
  if (kind === "card_run_canceled") return "Run";
  if (kind === "card_run_stalled") return "Run";
  if (kind === "card_run_handoff_created") return "Handoff";
  if (kind === "card_claimed") return "Claim";
  if (kind === "card_heartbeat") return "Claim";
  if (kind === "card_claim_released") return "Claim";
  if (kind === "card_claim_expired") return "Claim";
  if (kind === "execution_readiness_blocked") return "Execution";
  if (kind === "workflow_created") return "Workflow";
  if (kind === "workflow_impact_resolved") return "Workflow";
  if (kind === "workflow_repaired") return "Workflow";
  if (kind === "workflow_settings_updated") return "Workflow";
  if (kind === "workflow_raw_updated") return "Workflow";
  if (kind === "ready_tasks_created") return "Ticket";
  if (kind === "card_proof_reviewed" || kind === "card_proof_review_ignored") return "Proof";
  if (kind === "manual_card_created") return "Manual";
  if (kind === "local_task_attached") return "Local Task";
  if (kind === "local_task_imported_as_evidence") return "Covered";
  if (kind === "deliverable_integration_resolved") return "Integration";
  return "Follow-up";
}

export function projectBoardEventSummary(events: ProjectBoardEvent[] = []): string {
  if (events.length === 0) return "No board history has been recorded yet.";
  const counts = events.reduce<Record<string, number>>((totals, event) => {
    const label = projectBoardEventKindLabel(event.kind);
    totals[label] = (totals[label] ?? 0) + 1;
    return totals;
  }, {});
  return Object.entries(counts)
    .map(([label, count]) => `${count} ${label.toLowerCase()} event${count === 1 ? "" : "s"}`)
    .join(", ");
}

function projectBoardEventDateLabel(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function projectBoardSupersededCardReviewItems(
  event: ProjectBoardEvent,
  snapshotKey: string,
  idKey: string,
  category: ProjectBoardSupersededCardReviewKind,
  runId?: string,
): ProjectBoardSupersededCardReviewItem[] {
  const snapshots = projectBoardEventMetadataRecordArray(event, snapshotKey);
  const snapshotItems = snapshots.map((snapshot, index) => {
    const cardId = projectBoardHistoryRecordText(snapshot, "cardId") ?? projectBoardEventMetadataTextArray(event, idKey)[index] ?? `card-${index + 1}`;
    return {
      eventId: event.id,
      runId,
      category,
      cardId,
      title: projectBoardHistoryRecordText(snapshot, "title") ?? cardId,
      sourceId: projectBoardHistoryRecordText(snapshot, "sourceId"),
      status: projectBoardHistoryRecordText(snapshot, "status"),
      candidateStatus: projectBoardHistoryRecordText(snapshot, "candidateStatus"),
      userTouchedFields: projectBoardHistoryRecordTextArray(snapshot, "userTouchedFields"),
      orchestrationTaskId: projectBoardHistoryRecordText(snapshot, "orchestrationTaskId"),
      executionThreadId: projectBoardHistoryRecordText(snapshot, "executionThreadId"),
      clarificationQuestionCount: projectBoardHistoryRecordNumber(snapshot, "clarificationQuestionCount"),
      createdAt: event.createdAt,
    };
  });
  if (snapshotItems.length > 0) return snapshotItems;
  return projectBoardEventMetadataTextArray(event, idKey).map((cardId) => ({
    eventId: event.id,
    runId,
    category,
    cardId,
    title: cardId,
    userTouchedFields: [],
    createdAt: event.createdAt,
  }));
}

function projectBoardEventMetadataText(event: ProjectBoardEvent, key: string): string | undefined {
  return projectBoardHistoryRecordText(event.metadata, key);
}

function projectBoardEventMetadataTextArray(event: ProjectBoardEvent, key: string): string[] {
  return projectBoardHistoryRecordTextArray(event.metadata, key);
}

function projectBoardEventMetadataRecordArray(event: ProjectBoardEvent, key: string): Record<string, unknown>[] {
  const value = event.metadata?.[key];
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function projectBoardHistoryRecordText(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function projectBoardHistoryRecordTextArray(record: Record<string, unknown> | undefined, key: string): string[] {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function projectBoardHistoryRecordNumber(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
