import type Database from "better-sqlite3";

import type { ProjectBoardSummary } from "../../shared/projectBoardTypes";
import {
  normalizeProjectBoardCardRunFeedback,
  normalizeProjectBoardClarificationAnswers,
  normalizeProjectBoardClarificationDecisions,
  normalizeProjectBoardClarificationQuestions,
  normalizeProjectBoardClarificationSuggestions,
  objectiveProvenanceJson,
  projectBoardEventKindFromArtifact,
  projectBoardEventMetadataFromArtifact,
  projectBoardEventSummaryFromArtifact,
  projectBoardEventTitleFromArtifact,
  projectBoardExecutionArtifactCardId,
  projectBoardExecutionArtifactHandoffFromArtifact,
  projectBoardExecutionArtifactProofFromArtifact,
  projectBoardExecutionArtifactStartedAt,
  projectBoardExecutionArtifactStatus,
  projectBoardExecutionArtifactUpdatedAt,
  projectBoardRunStageFromArtifactProgress,
  projectBoardRunStageFromManifest,
  projectBoardRunStatusFromProposalManifest,
  sourceRefArtifactStrings,
} from "./projectBoardMappers";
import type { ProjectBoardRow } from "./projectStoreFacadeHelpers";
import type { ProjectBoardArtifactProjection } from "./projectStoreProjectBoardFacade";

export interface ProjectBoardArtifactProjectionApplyDeps {
  mapProjectBoard(row: ProjectBoardRow): ProjectBoardSummary;
  materializeProjectBoardPulledHandoffFollowUps(boardId: string, runArtifacts: ProjectBoardArtifactProjection["runArtifacts"]): void;
}

type ProjectBoardSourceProjection = ProjectBoardArtifactProjection["sourceSnapshots"][number]["sources"][number];
type ProjectBoardSourceClassificationProjection = ProjectBoardArtifactProjection["sourceClassifications"][number];

interface PreservedSynthesisRunFields {
  id: string;
  planning_snapshots_json: string | null;
  retry_of_run_id: string | null;
}

interface ProtectedCardFields {
  id: string;
  user_touched_fields_json: string | null;
  user_touched_at: string | null;
  pending_pi_update_json: string | null;
}

interface ProjectBoardArtifactProjectionApplyContext {
  boardId: string;
  existingBoard: ProjectBoardRow | undefined;
  latestSnapshot: ProjectBoardArtifactProjection["sourceSnapshots"][number] | undefined;
  classificationsBySourceId: Map<string, ProjectBoardSourceClassificationProjection>;
  sourcesById: Map<string, ProjectBoardSourceProjection>;
  boardCreatedAt: string;
  boardUpdatedAt: string;
  charterId: string | null;
  insertedSourceIds: Set<string>;
  sourceThreadId: string | null;
  preservedRunFieldsById: Map<string, PreservedSynthesisRunFields>;
  preservedSourceRelevanceById: Map<string, number | null>;
  protectedCardFieldsById: Map<string, ProtectedCardFields>;
}

export function applyProjectBoardArtifactProjectionToStore(
  db: Database.Database,
  deps: ProjectBoardArtifactProjectionApplyDeps,
  projectPath: string,
  projection: ProjectBoardArtifactProjection,
): ProjectBoardSummary {
  const context = buildArtifactProjectionApplyContext(db, projection);
  const transaction = db.transaction(() => {
    deleteExistingBoardRows(db, context.boardId);
    upsertProjectBoardRow(db, projectPath, projection, context);
    insertProjectBoardCharter(db, projection, context);
    insertProjectBoardSources(db, projection, context);
    insertProjectBoardCards(db, projection, context);
    insertProjectBoardSynthesisProposals(db, projection, context);
    insertProjectBoardSynthesisRuns(db, projection, context);
    insertProjectBoardExecutionArtifacts(db, projection, context);
    insertProjectBoardEvents(db, projection, context.boardId);
    deps.materializeProjectBoardPulledHandoffFollowUps(context.boardId, projection.runArtifacts);
  });

  transaction();
  const row = db.prepare("SELECT * FROM project_boards WHERE id = ?").get(context.boardId) as ProjectBoardRow | undefined;
  if (!row) throw new Error(`Project board not found after applying artifact projection: ${context.boardId}`);
  return deps.mapProjectBoard(row);
}

function buildArtifactProjectionApplyContext(
  db: Database.Database,
  projection: ProjectBoardArtifactProjection,
): ProjectBoardArtifactProjectionApplyContext {
  const config = projection.config;
  const boardId = config.boardId;
  const existingBoard = db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardRow | undefined;
  const latestSnapshot = projection.sourceSnapshots.at(-1);
  const classificationsBySourceId = new Map(
    projection.sourceClassifications.map((classification) => [classification.sourceId, classification]),
  );
  const sourcesById = new Map(latestSnapshot?.sources.map((source) => [source.sourceId, source]) ?? []);
  const now = new Date().toISOString();
  const boardCreatedAt = config.createdAt || existingBoard?.created_at || now;
  const boardUpdatedAt = config.updatedAt || now;
  const charterId = projection.charter?.charterId ?? config.activeCharterId ?? existingBoard?.charter_id ?? null;
  const insertedSourceIds = new Set(latestSnapshot?.sources.map((source) => source.sourceId) ?? []);
  const sourceThreadId =
    latestSnapshot?.sources.find((source) => source.kind === "plan_artifact" && source.threadId)?.threadId ??
    latestSnapshot?.sources.find((source) => source.threadId)?.threadId ??
    existingBoard?.source_thread_id ??
    null;

  return {
    boardId,
    existingBoard,
    latestSnapshot,
    classificationsBySourceId,
    sourcesById,
    boardCreatedAt,
    boardUpdatedAt,
    charterId,
    insertedSourceIds,
    sourceThreadId,
    // Board artifacts omit local-only edit protection, source relevance, and run retry/planning metadata.
    // Preserve those fields across export/apply round trips.
    preservedRunFieldsById: readPreservedRunFieldsById(db, boardId),
    preservedSourceRelevanceById: readPreservedSourceRelevanceById(db, boardId),
    protectedCardFieldsById: readProtectedCardFieldsById(db, boardId),
  };
}

function readPreservedRunFieldsById(db: Database.Database, boardId: string): Map<string, PreservedSynthesisRunFields> {
  const rows = db
    .prepare("SELECT id, planning_snapshots_json, retry_of_run_id FROM project_board_synthesis_runs WHERE board_id = ?")
    .all(boardId) as PreservedSynthesisRunFields[];
  return new Map(rows.map((row) => [row.id, row]));
}

function readPreservedSourceRelevanceById(db: Database.Database, boardId: string): Map<string, number | null> {
  const rows = db.prepare("SELECT id, relevance FROM project_board_sources WHERE board_id = ?").all(boardId) as Array<{
    id: string;
    relevance: number | null;
  }>;
  return new Map(rows.map((row) => [row.id, row.relevance]));
}

function readProtectedCardFieldsById(db: Database.Database, boardId: string): Map<string, ProtectedCardFields> {
  const rows = db
    .prepare("SELECT id, user_touched_fields_json, user_touched_at, pending_pi_update_json FROM project_board_cards WHERE board_id = ?")
    .all(boardId) as ProtectedCardFields[];
  return new Map(
    rows
      .filter(
        (row) =>
          row.user_touched_at || (row.user_touched_fields_json && row.user_touched_fields_json !== "[]") || row.pending_pi_update_json,
      )
      .map((row) => [row.id, row]),
  );
}

function deleteExistingBoardRows(db: Database.Database, boardId: string): void {
  db.prepare("DELETE FROM project_board_synthesis_runs WHERE board_id = ?").run(boardId);
  db.prepare("DELETE FROM project_board_synthesis_proposals WHERE board_id = ?").run(boardId);
  db.prepare("DELETE FROM project_board_execution_artifacts WHERE board_id = ?").run(boardId);
  db.prepare("DELETE FROM project_board_events WHERE board_id = ?").run(boardId);
  db.prepare("DELETE FROM project_board_sources WHERE board_id = ?").run(boardId);
  db.prepare("DELETE FROM project_board_cards WHERE board_id = ?").run(boardId);
  db.prepare("DELETE FROM project_board_charters WHERE board_id = ?").run(boardId);
}

function upsertProjectBoardRow(
  db: Database.Database,
  projectPath: string,
  projection: ProjectBoardArtifactProjection,
  context: ProjectBoardArtifactProjectionApplyContext,
): void {
  const config = projection.config;
  if (context.existingBoard) {
    db.prepare(
      `UPDATE project_boards
       SET project_path = ?, source_thread_id = ?, status = ?, title = ?, summary = ?, charter_id = ?, active_draft_id = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      projectPath,
      context.sourceThreadId,
      config.status,
      config.title,
      config.summary,
      context.charterId,
      null,
      context.boardUpdatedAt,
      context.boardId,
    );
    return;
  }

  db.prepare(
    `INSERT INTO project_boards
     (id, project_path, source_thread_id, status, title, summary, charter_id, active_draft_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    context.boardId,
    projectPath,
    context.sourceThreadId,
    config.status,
    config.title,
    config.summary,
    context.charterId,
    null,
    context.boardCreatedAt,
    context.boardUpdatedAt,
  );
}

function insertProjectBoardCharter(
  db: Database.Database,
  projection: ProjectBoardArtifactProjection,
  context: ProjectBoardArtifactProjectionApplyContext,
): void {
  if (!projection.charter) return;
  const charter = projection.charter;
  db.prepare(
    `INSERT INTO project_board_charters
     (id, board_id, version, status, goal, current_state, target_user, non_goals_json, quality_bar,
      test_policy_json, decision_policy_json, dependency_policy_json, budget_policy_json, source_policy_json,
      markdown, project_summary_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    charter.charterId,
    context.boardId,
    charter.version,
    charter.status,
    charter.goal,
    charter.currentState,
    charter.targetUser,
    JSON.stringify(charter.nonGoals),
    charter.qualityBar,
    JSON.stringify(charter.testPolicy),
    JSON.stringify(charter.decisionPolicy),
    JSON.stringify(charter.dependencyPolicy),
    JSON.stringify(charter.budgetPolicy),
    JSON.stringify(charter.sourcePolicy),
    charter.markdown,
    charter.projectSummary ? JSON.stringify(charter.projectSummary) : null,
    charter.createdAt,
    charter.updatedAt,
  );
}

function insertProjectBoardSources(
  db: Database.Database,
  projection: ProjectBoardArtifactProjection,
  context: ProjectBoardArtifactProjectionApplyContext,
): void {
  if (!context.latestSnapshot) return;
  const insertSource = db.prepare(
    `INSERT INTO project_board_sources
     (id, board_id, source_kind, source_key, content_hash, change_state, title, summary, excerpt, path, thread_id, artifact_id, message_id,
      byte_size, mtime, classification_reason, classified_by, classification_confidence, authority_role, include_in_synthesis, relevance, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const source of context.latestSnapshot.sources) {
    const classification = context.classificationsBySourceId.get(source.sourceId);
    const kind = classification?.effectiveKind ?? source.kind;
    const includeInSynthesis = classification ? classification.includeInSynthesis : kind !== "ignored";
    const preservedRelevance = context.preservedSourceRelevanceById.get(source.sourceId);
    const relevance =
      kind === "ignored"
        ? 0
        : typeof preservedRelevance === "number"
          ? preservedRelevance
          : Math.max(0, Math.min(100, Math.round((classification?.confidence ?? 0.75) * 100)));
    insertSource.run(
      source.sourceId,
      context.boardId,
      kind,
      source.sourceKey,
      classification?.contentHash ?? source.contentHash ?? null,
      source.changeState,
      source.title,
      source.summary,
      source.excerpt ?? null,
      source.path ?? null,
      source.threadId ?? null,
      source.artifactId ?? null,
      source.messageId ?? null,
      source.byteSize ?? null,
      source.mtime ?? null,
      classification?.classificationReason ?? null,
      classification?.classifiedBy ?? null,
      classification?.confidence ?? null,
      classification?.authorityRole ?? null,
      includeInSynthesis ? 1 : 0,
      relevance,
      context.latestSnapshot.createdAt,
      classification?.classifiedAt ?? context.latestSnapshot.createdAt,
    );
  }
}

function insertProjectBoardCards(
  db: Database.Database,
  projection: ProjectBoardArtifactProjection,
  context: ProjectBoardArtifactProjectionApplyContext,
): void {
  const insertCard = db.prepare(
    `INSERT INTO project_board_cards
     (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
      acceptance_criteria_json, test_plan_json, source_refs_json, clarification_questions_json, clarification_suggestions_json, clarification_answers_json,
      clarification_decisions_json, run_feedback_json,
      source_kind, source_id, source_thread_id, source_message_id, orchestration_task_id, execution_thread_id, execution_session_policy,
      proof_review_json, split_outcome_json, objective_provenance_json, ui_mock_role, requires_ui_mock_approval,
      user_touched_fields_json, user_touched_at, pending_pi_update_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const card of projection.cards) {
    const primaryRef = card.sourceRefs.find((ref) => ref.sourceId && context.insertedSourceIds.has(ref.sourceId));
    const primarySource = primaryRef?.sourceId ? context.sourcesById.get(primaryRef.sourceId) : undefined;
    const clarificationQuestions = normalizeProjectBoardClarificationQuestions(card.clarificationQuestions ?? [], 8);
    const clarificationSuggestions = normalizeProjectBoardClarificationSuggestions(card.clarificationSuggestions ?? [], []);
    const clarificationAnswers = normalizeProjectBoardClarificationAnswers(card.clarificationAnswers ?? []);
    const clarificationDecisions = normalizeProjectBoardClarificationDecisions(card.clarificationDecisions, {
      clarificationQuestions,
      clarificationSuggestions,
      clarificationAnswers,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    });
    insertCard.run(
      card.cardId,
      context.boardId,
      card.title,
      card.description,
      card.status,
      card.candidateStatus,
      card.priority ?? null,
      card.phase ?? null,
      JSON.stringify(card.labels),
      JSON.stringify([...card.blockedBy, ...card.unresolvedBlockers]),
      JSON.stringify(card.acceptanceCriteria),
      JSON.stringify(card.testPlan),
      JSON.stringify(sourceRefArtifactStrings(card.sourceRefs)),
      JSON.stringify(clarificationQuestions),
      JSON.stringify(clarificationSuggestions),
      JSON.stringify(clarificationAnswers),
      JSON.stringify(clarificationDecisions),
      JSON.stringify(normalizeProjectBoardCardRunFeedback(card.runFeedback)),
      card.sourceKind,
      card.sourceId,
      primarySource?.threadId ?? null,
      primarySource?.messageId ?? null,
      card.orchestrationTaskId ?? null,
      card.executionThreadId ?? null,
      card.executionSessionPolicy ?? "reuse_card_session",
      card.proofReview ? JSON.stringify(card.proofReview) : null,
      card.splitOutcome ? JSON.stringify(card.splitOutcome) : null,
      objectiveProvenanceJson(card.objectiveProvenance),
      card.uiMockRole ?? null,
      card.requiresUiMockApproval ? 1 : 0,
      context.protectedCardFieldsById.get(card.cardId)?.user_touched_fields_json ?? "[]",
      context.protectedCardFieldsById.get(card.cardId)?.user_touched_at ?? null,
      context.protectedCardFieldsById.get(card.cardId)?.pending_pi_update_json ?? null,
      card.createdAt,
      card.updatedAt,
    );
  }
}

function insertProjectBoardSynthesisProposals(
  db: Database.Database,
  projection: ProjectBoardArtifactProjection,
  context: ProjectBoardArtifactProjectionApplyContext,
): void {
  const insertProposal = db.prepare(
    `INSERT INTO project_board_synthesis_proposals
     (id, board_id, status, summary, goal, current_state, target_user, quality_bar,
      assumptions_json, questions_json, answers_json, source_notes_json, cards_json, review_report_json, model, duration_ms, created_at, updated_at, applied_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const proposalRun of projection.proposalRuns) {
    const final = proposalRun.final;
    if (!final) continue;
    insertProposal.run(
      final.proposalId,
      context.boardId,
      final.status,
      final.summary,
      final.goal,
      final.currentState,
      final.targetUser,
      final.qualityBar,
      JSON.stringify(final.assumptions),
      JSON.stringify(final.questions),
      JSON.stringify(final.answers),
      JSON.stringify(final.sourceNotes),
      JSON.stringify(final.cards),
      final.reviewReport ? JSON.stringify(final.reviewReport) : null,
      final.model ?? null,
      final.durationMs ?? null,
      final.createdAt,
      final.updatedAt,
      final.appliedAt ?? null,
    );
  }
}

function insertProjectBoardSynthesisRuns(
  db: Database.Database,
  projection: ProjectBoardArtifactProjection,
  context: ProjectBoardArtifactProjectionApplyContext,
): void {
  const insertRun = db.prepare(
    `INSERT INTO project_board_synthesis_runs
     (id, board_id, proposal_id, retry_of_run_id, status, stage, model, source_count, included_source_count,
      source_char_count, prompt_char_count, response_char_count, card_count, question_count, warning_count, error,
      events_json, progressive_records_json, planning_snapshots_json, started_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const proposalRun of projection.proposalRuns) {
    const manifest = proposalRun.manifest;
    if (!manifest) continue;
    const progressiveRecords = [
      ...proposalRun.progress,
      ...proposalRun.candidateCards,
      ...proposalRun.questions,
      ...proposalRun.sourceCoverage,
      ...proposalRun.dependencyEdges,
      ...proposalRun.warnings,
      ...proposalRun.errors,
    ];
    const runEvents =
      proposalRun.progress.length > 0
        ? proposalRun.progress.map((record) => ({
            stage: projectBoardRunStageFromArtifactProgress(record.stage),
            title: record.title,
            summary: record.summary,
            metadata: record.metadata,
            createdAt: record.createdAt,
          }))
        : [
            {
              stage: projectBoardRunStageFromManifest(manifest),
              title: "Imported Git board proposal run",
              summary:
                manifest.error ?? `Imported ${manifest.cardCount ?? 0} card${manifest.cardCount === 1 ? "" : "s"} from board artifacts.`,
              metadata: { proposalRunId: manifest.proposalRunId },
              createdAt: manifest.updatedAt,
            },
          ];
    insertRun.run(
      manifest.proposalRunId,
      context.boardId,
      proposalRun.final?.proposalId ?? null,
      context.preservedRunFieldsById.get(manifest.proposalRunId)?.retry_of_run_id ?? null,
      projectBoardRunStatusFromProposalManifest(manifest),
      projectBoardRunStageFromManifest(manifest),
      manifest.model ?? null,
      manifest.sourceCount,
      context.latestSnapshot?.sources.filter(
        (source) => context.classificationsBySourceId.get(source.sourceId)?.includeInSynthesis ?? source.kind !== "ignored",
      ).length ?? manifest.sourceCount,
      manifest.sourceCharCount,
      manifest.promptCharCount ?? null,
      manifest.responseCharCount ?? null,
      manifest.cardCount ?? proposalRun.candidateCards.length,
      manifest.questionCount ?? proposalRun.questions.length,
      manifest.warningCount ?? proposalRun.warnings.length,
      manifest.error ?? proposalRun.errors.at(-1)?.message ?? null,
      JSON.stringify(runEvents),
      JSON.stringify(progressiveRecords),
      context.preservedRunFieldsById.get(manifest.proposalRunId)?.planning_snapshots_json ?? "[]",
      manifest.startedAt,
      manifest.updatedAt,
      manifest.completedAt ?? null,
    );
  }
}

function insertProjectBoardExecutionArtifacts(
  db: Database.Database,
  projection: ProjectBoardArtifactProjection,
  context: ProjectBoardArtifactProjectionApplyContext,
): void {
  const insertExecutionArtifact = db.prepare(
    `INSERT INTO project_board_execution_artifacts
     (id, board_id, card_id, status, source, agent_id, pi_session_id, workspace_branch,
      started_at, updated_at, completed_at, proof_json, handoff_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const runArtifact of projection.runArtifacts) {
    const manifest = runArtifact.manifest;
    const proof = runArtifact.proof;
    const handoff = runArtifact.handoff;
    const runId = manifest?.runId ?? proof?.runId ?? handoff?.runId ?? runArtifact.runPathId;
    const cardId = projectBoardExecutionArtifactCardId(manifest, proof, handoff);
    if (!cardId) continue;
    const startedAt = projectBoardExecutionArtifactStartedAt(manifest, proof, handoff);
    const updatedAt = projectBoardExecutionArtifactUpdatedAt(manifest, proof, handoff);
    insertExecutionArtifact.run(
      runId,
      context.boardId,
      cardId,
      projectBoardExecutionArtifactStatus(manifest, proof, handoff),
      "git",
      manifest?.agentId ?? null,
      manifest?.piSessionId ?? null,
      manifest?.workspaceBranch ?? null,
      startedAt,
      updatedAt,
      manifest?.completedAt ?? handoff?.createdAt ?? null,
      proof ? JSON.stringify(projectBoardExecutionArtifactProofFromArtifact(proof)) : null,
      handoff ? JSON.stringify(projectBoardExecutionArtifactHandoffFromArtifact(handoff)) : null,
      updatedAt,
    );
  }
}

function insertProjectBoardEvents(db: Database.Database, projection: ProjectBoardArtifactProjection, boardId: string): void {
  const insertEvent = db.prepare(
    `INSERT INTO project_board_events
     (id, board_id, event_kind, title, summary, entity_kind, entity_id, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const event of projection.events) {
    insertEvent.run(
      event.eventId,
      boardId,
      projectBoardEventKindFromArtifact(event),
      projectBoardEventTitleFromArtifact(event),
      projectBoardEventSummaryFromArtifact(event),
      event.entityKind ?? null,
      event.entityId ?? null,
      JSON.stringify(projectBoardEventMetadataFromArtifact(event)),
      event.createdAt,
    );
  }
}
