import type {
  ProjectBoardEvent,
  ProjectBoardEventKind,
  ProjectBoardExecutionArtifact,
  ProjectBoardExecutionArtifactHandoff,
  ProjectBoardExecutionArtifactProof,
  ProjectBoardSynthesisRunStage,
  ProjectBoardSynthesisRunStatus,
} from "../../shared/projectBoardTypes";
import { parseProjectBoardJsonObject } from "./projectBoardJsonMappers";
import type {
  BoardEventArtifact,
  ProposalManifestArtifact,
  RunHandoffArtifact,
  RunManifestArtifact,
  RunProofArtifact,
} from "./projectStoreProjectBoardFacade";

const projectBoardEventKinds = new Set<ProjectBoardEventKind>([
  "board_created",
  "board_revision_started",
  "status_changed",
  "sources_refreshed",
  "board_synthesized",
  "synthesis_proposal_created",
  "synthesis_proposal_answered",
  "synthesis_proposal_card_reviewed",
  "synthesis_proposal_applied",
  "source_updated",
  "question_answered",
  "kickoff_defaults_suggested",
  "charter_finalized",
  "charter_summary_refreshed",
  "plan_promoted",
  "card_updated",
  "candidate_status_changed",
  "card_split",
  "card_ticketized",
  "card_execution_session_assigned",
  "card_run_prepared",
  "card_run_started",
  "card_run_progress",
  "card_run_completed",
  "card_run_failed",
  "card_run_blocked",
  "card_run_canceled",
  "card_run_stalled",
  "card_run_handoff_created",
  "card_claimed",
  "card_heartbeat",
  "card_claim_released",
  "card_claim_expired",
  "execution_readiness_blocked",
  "workflow_created",
  "workflow_impact_resolved",
  "workflow_repaired",
  "workflow_settings_updated",
  "workflow_raw_updated",
  "ready_tasks_created",
  "run_follow_up_created",
  "card_proof_reviewed",
  "card_proof_review_ignored",
  "manual_card_created",
  "local_task_attached",
  "local_task_imported_as_evidence",
  "deliverable_integration_resolved",
]);

const projectBoardEventKindByArtifactType: Partial<Record<BoardEventArtifact["type"], ProjectBoardEventKind>> = {
  "board.created": "board_created",
  "board.status_changed": "status_changed",
  "board.synthesized": "board_synthesized",
  "board.ready_tasks_created": "ready_tasks_created",
  "charter.revision_started": "board_revision_started",
  "charter.question_answered": "question_answered",
  "charter.kickoff_defaults_suggested": "kickoff_defaults_suggested",
  "charter.applied": "charter_finalized",
  "charter.summary_refreshed": "charter_summary_refreshed",
  "sources.refreshed": "sources_refreshed",
  "source.classified": "source_updated",
  "source.changed": "source_updated",
  "plan.promoted": "plan_promoted",
  "proposal.completed": "synthesis_proposal_created",
  "proposal.question_answered": "synthesis_proposal_answered",
  "proposal.card_reviewed": "synthesis_proposal_card_reviewed",
  "proposal.applied": "synthesis_proposal_applied",
  "proposal.failed": "synthesis_proposal_created",
  "card.created": "manual_card_created",
  "card.updated": "card_updated",
  "card.status_changed": "candidate_status_changed",
  "card.split": "card_split",
  "card.ticketized": "card_ticketized",
  "card.execution_session_assigned": "card_execution_session_assigned",
  "run.prepared": "card_run_prepared",
  "run.started": "card_run_started",
  "run.progress": "card_run_progress",
  "run.completed": "card_run_completed",
  "run.failed": "card_run_failed",
  "run.blocked": "card_run_blocked",
  "run.canceled": "card_run_canceled",
  "run.stalled": "card_run_stalled",
  "run.handoff_created": "card_run_handoff_created",
  "card.claimed": "card_claimed",
  "card.heartbeat": "card_heartbeat",
  "card.claim_released": "card_claim_released",
  "card.claim_expired": "card_claim_expired",
  "board.execution_readiness_blocked": "execution_readiness_blocked",
  "board.workflow_created": "workflow_created",
  "board.workflow_impact_resolved": "workflow_impact_resolved",
  "board.workflow_repaired": "workflow_repaired",
  "board.workflow_settings_updated": "workflow_settings_updated",
  "board.workflow_raw_updated": "workflow_raw_updated",
  "card.proof_reviewed": "card_proof_reviewed",
  "card.followup_created": "run_follow_up_created",
  "local_task.attached": "local_task_attached",
  "local_task.imported_as_evidence": "local_task_imported_as_evidence",
  "run.deliverable_integration_resolved": "deliverable_integration_resolved",
};

export interface ProjectBoardExecutionArtifactStoreRow {
  id: string;
  board_id: string;
  card_id: string;
  status: string;
  source: string;
  agent_id: string | null;
  pi_session_id: string | null;
  workspace_branch: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  proof_json: string | null;
  handoff_json: string | null;
  created_at: string;
}

export interface ProjectBoardEventStoreRow {
  id: string;
  board_id: string;
  event_kind: ProjectBoardEventKind;
  title: string;
  summary: string;
  entity_kind: string | null;
  entity_id: string | null;
  metadata_json: string;
  created_at: string;
}

export function projectBoardEventKindFromArtifact(event: BoardEventArtifact): ProjectBoardEventKind {
  const currentKind = event.payload.currentKind;
  if (typeof currentKind === "string" && projectBoardEventKinds.has(currentKind as ProjectBoardEventKind)) {
    return currentKind as ProjectBoardEventKind;
  }
  return projectBoardEventKindByArtifactType[event.type] ?? "card_updated";
}

export function projectBoardEventTitleFromArtifact(event: BoardEventArtifact): string {
  const title = event.payload.title;
  if (typeof title === "string" && title.trim()) return title.trim().slice(0, 180);
  if (event.type === "run.prepared") return "Run prepared";
  if (event.type === "run.started") return "Run started";
  if (event.type === "run.progress") return "Run progress";
  if (event.type === "run.completed") return "Run completed";
  if (event.type === "run.failed") return "Run failed";
  if (event.type === "run.blocked") return "Run blocked";
  if (event.type === "run.canceled") return "Run canceled";
  if (event.type === "run.stalled") return "Run stalled";
  if (event.type === "run.handoff_created") return "Run handoff created";
  if (event.type === "card.claimed") return "Card claimed";
  if (event.type === "card.heartbeat") return "Card claim heartbeat";
  if (event.type === "card.claim_released") return "Card claim released";
  if (event.type === "card.claim_expired") return "Card claim expired";
  return event.type;
}

export function projectBoardEventSummaryFromArtifact(event: BoardEventArtifact): string {
  const summary = event.payload.summary;
  if (typeof summary !== "string" && event.type.startsWith("run.")) {
    const runId = typeof event.payload.runId === "string" ? event.payload.runId : event.entityId;
    const cardId = typeof event.payload.cardId === "string" ? event.payload.cardId : "unknown card";
    const status = typeof event.payload.normalizedStatus === "string" ? event.payload.normalizedStatus : event.type.replace("run.", "");
    return `Imported ${status.replace(/_/g, " ")} run ${runId} for ${cardId}.`;
  }
  if (typeof summary !== "string" && event.type === "card.claimed") {
    const agent = typeof event.payload.agentId === "string" ? event.payload.agentId : (event.actor?.agentId ?? "another desktop");
    const leaseUntil = typeof event.payload.leaseUntil === "string" ? ` until ${event.payload.leaseUntil}` : "";
    return `Card claim recorded for ${event.entityId} by ${agent}${leaseUntil}.`;
  }
  if (typeof summary !== "string" && event.type === "card.heartbeat") {
    return `Claim heartbeat recorded for ${event.entityId}.`;
  }
  if (typeof summary !== "string" && event.type === "card.claim_released") {
    return `Card claim released for ${event.entityId}.`;
  }
  if (typeof summary !== "string" && event.type === "card.claim_expired") {
    return `Card claim expired for ${event.entityId}.`;
  }
  return typeof summary === "string" ? summary.slice(0, 1000) : "";
}

export function projectBoardEventMetadataFromArtifact(event: BoardEventArtifact): Record<string, unknown> {
  const metadata = event.payload.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) return metadata as Record<string, unknown>;
  return { ...event.payload, artifactEventType: event.type, artifactPayload: event.payload, artifactActor: event.actor };
}

export function projectBoardExecutionArtifactStatus(
  manifest?: RunManifestArtifact,
  proof?: RunProofArtifact,
  handoff?: RunHandoffArtifact,
): string {
  if (manifest?.status) return manifest.status;
  if (handoff) return "completed";
  if (proof) return "review";
  return "prepared";
}

export function projectBoardExecutionArtifactCardId(
  manifest?: RunManifestArtifact,
  proof?: RunProofArtifact,
  handoff?: RunHandoffArtifact,
): string | undefined {
  return manifest?.cardId ?? proof?.cardId ?? handoff?.cardId;
}

export function projectBoardExecutionArtifactStartedAt(
  manifest?: RunManifestArtifact,
  proof?: RunProofArtifact,
  handoff?: RunHandoffArtifact,
): string {
  return manifest?.startedAt ?? proof?.createdAt ?? handoff?.createdAt ?? new Date().toISOString();
}

export function projectBoardExecutionArtifactUpdatedAt(
  manifest?: RunManifestArtifact,
  proof?: RunProofArtifact,
  handoff?: RunHandoffArtifact,
): string {
  return manifest?.updatedAt ?? handoff?.createdAt ?? proof?.createdAt ?? projectBoardExecutionArtifactStartedAt(manifest, proof, handoff);
}

export function projectBoardExecutionArtifactProofFromArtifact(proof: RunProofArtifact): ProjectBoardExecutionArtifactProof {
  return {
    summary: proof.summary,
    commands: proof.commands,
    changedFiles: proof.changedFiles,
    screenshots: proof.screenshots,
    browserTraces: proof.browserTraces,
    visualChecks: proof.visualChecks,
    manualChecks: proof.manualChecks,
    createdAt: proof.createdAt,
  };
}

export function projectBoardExecutionArtifactHandoffFromArtifact(handoff: RunHandoffArtifact): ProjectBoardExecutionArtifactHandoff {
  return {
    summary: handoff.summary,
    completed: handoff.completed,
    remaining: handoff.remaining,
    risks: handoff.risks,
    followUps: handoff.followUps,
    createdAt: handoff.createdAt,
  };
}

export function projectBoardRunStageFromManifest(manifest: ProposalManifestArtifact): ProjectBoardSynthesisRunStage {
  if (manifest.status === "failed" || manifest.stage === "failed") return "failed";
  if (manifest.status === "abandoned") return "paused";
  if (manifest.status === "paused" || manifest.stage === "paused") return "paused";
  if (manifest.stage === "source_scan") return "source_scan";
  if (manifest.stage === "source_classification") return "source_classification";
  if (manifest.stage === "importing") return "schema_validation";
  if (manifest.stage === "completed") return "proposal_created";
  return "model_request";
}

export function projectBoardRunStageFromArtifactProgress(stage: string): ProjectBoardSynthesisRunStage {
  const normalized = stage.trim().toLowerCase();
  if (normalized === "source_scan") return "source_scan";
  if (normalized === "sources_persisted") return "sources_persisted";
  if (normalized === "source_classification") return "source_classification";
  if (normalized === "deterministic_baseline") return "deterministic_baseline";
  if (normalized === "model_request") return "model_request";
  if (normalized === "model_response") return "model_response";
  if (normalized === "schema_validation" || normalized === "importing") return "schema_validation";
  if (normalized === "board_applied") return "board_applied";
  if (normalized === "proposal_created" || normalized === "completed") return "proposal_created";
  if (normalized === "paused" || normalized === "planning_paused") return "paused";
  if (normalized === "failed") return "failed";
  return "model_response";
}

export function projectBoardRunStatusFromProposalManifest(manifest: ProposalManifestArtifact): ProjectBoardSynthesisRunStatus {
  if (manifest.status === "abandoned") return "abandoned";
  if (manifest.status === "pause_requested" || manifest.status === "paused") return manifest.status;
  if (manifest.status === "failed") return "failed";
  if (manifest.status === "running") return "running";
  return "succeeded";
}

export function mapProjectBoardExecutionArtifactRow(row: ProjectBoardExecutionArtifactStoreRow): ProjectBoardExecutionArtifact {
  return {
    id: row.id,
    boardId: row.board_id,
    cardId: row.card_id,
    status: row.status,
    source: row.source === "local_export" ? "local_export" : "git",
    agentId: row.agent_id ?? undefined,
    piSessionId: row.pi_session_id ?? undefined,
    workspaceBranch: row.workspace_branch ?? undefined,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    proof: row.proof_json
      ? normalizeProjectBoardExecutionProof(parseProjectBoardJsonObject<Record<string, unknown> | undefined>(row.proof_json, undefined))
      : undefined,
    handoff: row.handoff_json
      ? normalizeProjectBoardExecutionHandoff(parseProjectBoardJsonObject<Record<string, unknown> | undefined>(row.handoff_json, undefined))
      : undefined,
    createdAt: row.created_at,
  };
}

export function mapProjectBoardEventRow(row: ProjectBoardEventStoreRow): ProjectBoardEvent {
  return {
    id: row.id,
    boardId: row.board_id,
    kind: row.event_kind,
    title: row.title,
    summary: row.summary,
    entityKind: row.entity_kind ?? undefined,
    entityId: row.entity_id ?? undefined,
    metadata: parseProjectBoardJsonObject<Record<string, unknown>>(row.metadata_json, {}),
    createdAt: row.created_at,
  };
}

function normalizeProjectBoardExecutionProof(value: Record<string, unknown> | undefined): ProjectBoardExecutionArtifactProof | undefined {
  if (!value || typeof value.summary !== "string") return undefined;
  return {
    ...value,
    summary: value.summary,
    commands: toStringArray(value.commands),
    changedFiles: toStringArray(value.changedFiles),
  } as ProjectBoardExecutionArtifactProof;
}

function normalizeProjectBoardExecutionHandoff(
  value: Record<string, unknown> | undefined,
): ProjectBoardExecutionArtifactHandoff | undefined {
  if (!value || typeof value.summary !== "string") return undefined;
  return {
    ...value,
    summary: value.summary,
    completed: toStringArray(value.completed),
    remaining: toStringArray(value.remaining),
  } as ProjectBoardExecutionArtifactHandoff;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
