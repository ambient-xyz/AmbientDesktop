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

export interface ProjectStoreProjectBoardArtifactProjectionRepositoryDeps {
  mapProjectBoard(row: ProjectBoardRow): ProjectBoardSummary;
  materializeProjectBoardPulledHandoffFollowUps(
    boardId: string,
    runArtifacts: ProjectBoardArtifactProjection["runArtifacts"],
  ): void;
}

export class ProjectStoreProjectBoardArtifactProjectionRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardArtifactProjectionRepositoryDeps,
  ) {}

  applyProjectBoardArtifactProjection(projectPath: string, projection: ProjectBoardArtifactProjection): ProjectBoardSummary {
    const config = projection.config;
    const boardId = config.boardId;
    const existingBoard = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardRow | undefined;
    const latestSnapshot = projection.sourceSnapshots.at(-1);
    const classificationsBySourceId = new Map(projection.sourceClassifications.map((classification) => [classification.sourceId, classification]));
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
    // Board artifacts do not carry local-only edit protection, so preserve it from the
    // existing rows; otherwise an export/apply round trip would let the next synthesis
    // run silently overwrite user-edited cards.
    // Run metadata and source relevance are also local-only (not carried by board
    // artifacts), so preserve them from existing rows like the protected card fields:
    // otherwise every export->apply cycle nulls planning snapshots / retry lineage and
    // drifts relevance through the confidence round trip.
    const preservedRunFieldsById = new Map(
      (
        this.db
          .prepare("SELECT id, planning_snapshots_json, retry_of_run_id FROM project_board_synthesis_runs WHERE board_id = ?")
          .all(boardId) as Array<{ id: string; planning_snapshots_json: string | null; retry_of_run_id: string | null }>
      ).map((row) => [row.id, row]),
    );
    const preservedSourceRelevanceById = new Map(
      (
        this.db.prepare("SELECT id, relevance FROM project_board_sources WHERE board_id = ?").all(boardId) as Array<{
          id: string;
          relevance: number | null;
        }>
      ).map((row) => [row.id, row.relevance]),
    );
    const protectedCardFieldsById = new Map(
      (
        this.db
          .prepare("SELECT id, user_touched_fields_json, user_touched_at, pending_pi_update_json FROM project_board_cards WHERE board_id = ?")
          .all(boardId) as Array<{
          id: string;
          user_touched_fields_json: string | null;
          user_touched_at: string | null;
          pending_pi_update_json: string | null;
        }>
      )
        .filter(
          (row) =>
            row.user_touched_at ||
            (row.user_touched_fields_json && row.user_touched_fields_json !== "[]") ||
            row.pending_pi_update_json,
        )
        .map((row) => [row.id, row]),
    );

    const transaction = this.db.transaction(() => {
      this.db.prepare("DELETE FROM project_board_synthesis_runs WHERE board_id = ?").run(boardId);
      this.db.prepare("DELETE FROM project_board_synthesis_proposals WHERE board_id = ?").run(boardId);
      this.db.prepare("DELETE FROM project_board_execution_artifacts WHERE board_id = ?").run(boardId);
      this.db.prepare("DELETE FROM project_board_events WHERE board_id = ?").run(boardId);
      this.db.prepare("DELETE FROM project_board_sources WHERE board_id = ?").run(boardId);
      this.db.prepare("DELETE FROM project_board_cards WHERE board_id = ?").run(boardId);
      this.db.prepare("DELETE FROM project_board_charters WHERE board_id = ?").run(boardId);

      if (existingBoard) {
        this.db
          .prepare(
            `UPDATE project_boards
             SET project_path = ?, source_thread_id = ?, status = ?, title = ?, summary = ?, charter_id = ?, active_draft_id = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(projectPath, sourceThreadId, config.status, config.title, config.summary, charterId, null, boardUpdatedAt, boardId);
      } else {
        this.db
          .prepare(
            `INSERT INTO project_boards
             (id, project_path, source_thread_id, status, title, summary, charter_id, active_draft_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(boardId, projectPath, sourceThreadId, config.status, config.title, config.summary, charterId, null, boardCreatedAt, boardUpdatedAt);
      }

      if (projection.charter) {
        const charter = projection.charter;
        this.db
          .prepare(
            `INSERT INTO project_board_charters
             (id, board_id, version, status, goal, current_state, target_user, non_goals_json, quality_bar,
              test_policy_json, decision_policy_json, dependency_policy_json, budget_policy_json, source_policy_json,
              markdown, project_summary_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            charter.charterId,
            boardId,
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

      const insertSource = this.db.prepare(
        `INSERT INTO project_board_sources
         (id, board_id, source_kind, source_key, content_hash, change_state, title, summary, excerpt, path, thread_id, artifact_id, message_id,
          byte_size, mtime, classification_reason, classified_by, classification_confidence, authority_role, include_in_synthesis, relevance, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      if (latestSnapshot) {
        for (const source of latestSnapshot.sources) {
          const classification = classificationsBySourceId.get(source.sourceId);
          const kind = classification?.effectiveKind ?? source.kind;
          const includeInSynthesis = classification ? classification.includeInSynthesis : kind !== "ignored";
          const preservedRelevance = preservedSourceRelevanceById.get(source.sourceId);
          const relevance =
            kind === "ignored"
              ? 0
              : typeof preservedRelevance === "number"
                ? preservedRelevance
                : Math.max(0, Math.min(100, Math.round((classification?.confidence ?? 0.75) * 100)));
          insertSource.run(
            source.sourceId,
            boardId,
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
            latestSnapshot.createdAt,
            classification?.classifiedAt ?? latestSnapshot.createdAt,
          );
        }
      }

      const insertCard = this.db.prepare(
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
        const primaryRef = card.sourceRefs.find((ref) => ref.sourceId && insertedSourceIds.has(ref.sourceId));
        const primarySource = primaryRef?.sourceId ? sourcesById.get(primaryRef.sourceId) : undefined;
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
          boardId,
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
          protectedCardFieldsById.get(card.cardId)?.user_touched_fields_json ?? "[]",
          protectedCardFieldsById.get(card.cardId)?.user_touched_at ?? null,
          protectedCardFieldsById.get(card.cardId)?.pending_pi_update_json ?? null,
          card.createdAt,
          card.updatedAt,
        );
      }

      const insertProposal = this.db.prepare(
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
          boardId,
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

      const insertRun = this.db.prepare(
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
                  summary: manifest.error ?? `Imported ${manifest.cardCount ?? 0} card${manifest.cardCount === 1 ? "" : "s"} from board artifacts.`,
                  metadata: { proposalRunId: manifest.proposalRunId },
                  createdAt: manifest.updatedAt,
                },
              ];
        insertRun.run(
          manifest.proposalRunId,
          boardId,
          proposalRun.final?.proposalId ?? null,
          preservedRunFieldsById.get(manifest.proposalRunId)?.retry_of_run_id ?? null,
          projectBoardRunStatusFromProposalManifest(manifest),
          projectBoardRunStageFromManifest(manifest),
          manifest.model ?? null,
          manifest.sourceCount,
          latestSnapshot?.sources.filter((source) => classificationsBySourceId.get(source.sourceId)?.includeInSynthesis ?? source.kind !== "ignored").length ??
            manifest.sourceCount,
          manifest.sourceCharCount,
          manifest.promptCharCount ?? null,
          manifest.responseCharCount ?? null,
          manifest.cardCount ?? proposalRun.candidateCards.length,
          manifest.questionCount ?? proposalRun.questions.length,
          manifest.warningCount ?? proposalRun.warnings.length,
          manifest.error ?? proposalRun.errors.at(-1)?.message ?? null,
          JSON.stringify(runEvents),
          JSON.stringify(progressiveRecords),
          preservedRunFieldsById.get(manifest.proposalRunId)?.planning_snapshots_json ?? "[]",
          manifest.startedAt,
          manifest.updatedAt,
          manifest.completedAt ?? null,
        );
      }

      const insertExecutionArtifact = this.db.prepare(
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
          boardId,
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

      const insertEvent = this.db.prepare(
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
      this.deps.materializeProjectBoardPulledHandoffFollowUps(boardId, projection.runArtifacts);
    });

    transaction();
    const row = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardRow | undefined;
    if (!row) throw new Error(`Project board not found after applying artifact projection: ${boardId}`);
    return this.deps.mapProjectBoard(row);
  }
}
