import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { ProjectBoardCardTestPlan } from "../../shared/projectBoardTypes";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import type { ProjectBoardCardMutationEventInput } from "./projectBoardCardMutationEvents";
import {
  normalizeCardTextList,
  normalizeProjectBoardClarificationDecisions,
  normalizeProjectBoardClarificationQuestions,
  normalizeRunFollowUps,
  parseProjectBoardStringList,
  projectBoardExecutionArtifactCardId,
  type ProjectBoardCardStoreRow,
  type ProjectBoardProofReviewDraft,
  type ProjectBoardRunFollowUpInsertOptions,
} from "./projectBoardMappers";
import type { ProjectBoardRunArtifactProjection } from "./projectStoreProjectBoardFacade";
import { stableBoardArtifactId } from "./projectStoreProjectBoardFacade";

export interface ProjectStoreProjectBoardRunFollowUpRepositoryDeps {
  appendProjectBoardEvent(input: ProjectBoardCardMutationEventInput): void;
}

export class ProjectStoreProjectBoardRunFollowUpRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardRunFollowUpRepositoryDeps,
  ) {}

  createProjectBoardProofFollowUpForRun(
    run: OrchestrationRun,
    parent: ProjectBoardCardStoreRow,
    review: ProjectBoardProofReviewDraft,
    options: ProjectBoardRunFollowUpInsertOptions = {},
  ): string[] {
    const now = new Date().toISOString();
    const sourceId = `${run.id}#${options.sourceIdSuffix ?? "proof-review"}`;
    const existing = this.db
      .prepare("SELECT id FROM project_board_cards WHERE board_id = ? AND source_kind = 'run_follow_up' AND source_id = ?")
      .get(parent.board_id, sourceId) as { id: string } | undefined;
    if (existing) return [existing.id];
    const cardId = randomUUID();
    const labels = [...new Set(["proof-follow-up", ...(options.labels ?? []), ...parseProjectBoardStringList(parent.labels_json)])];
    const title = options.title ?? `Complete proof for ${parent.title}`.slice(0, 180);
    const description = options.description ?? review.missing.join("\n").slice(0, 4000);
    const acceptanceCriteria = options.acceptanceCriteria?.length
      ? normalizeCardTextList(options.acceptanceCriteria, 30)
      : review.missing.length
        ? review.missing
        : ["Resolve missing proof before closing the parent card."];
    const clarificationQuestions = options.clarificationQuestions?.length
      ? normalizeProjectBoardClarificationQuestions(options.clarificationQuestions, 8)
      : [];
    const testPlan = options.testPlan ?? {
      unit: [],
      integration: [],
      visual: [],
      manual: ["Review the parent run proof packet and add the missing evidence."],
    };
    this.db
      .prepare(
        `INSERT INTO project_board_cards
         (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
          acceptance_criteria_json, test_plan_json, clarification_questions_json, clarification_decisions_json, source_kind, source_id, source_thread_id, source_message_id,
          orchestration_task_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        cardId,
        parent.board_id,
        title,
        description,
        "draft",
        "needs_clarification",
        parent.priority === null ? null : parent.priority + 1,
        parent.phase,
        JSON.stringify(labels),
        JSON.stringify(options.blockByParent === false ? [] : [parent.id]),
        JSON.stringify(acceptanceCriteria),
        JSON.stringify(testPlan),
        JSON.stringify(clarificationQuestions),
        JSON.stringify(normalizeProjectBoardClarificationDecisions(undefined, { clarificationQuestions, createdAt: now, updatedAt: now })),
        "run_follow_up",
        sourceId,
        run.threadId ?? parent.source_thread_id,
        null,
        null,
        now,
        now,
      );
    this.touchBoard(parent.board_id, now);
    this.deps.appendProjectBoardEvent({
      boardId: parent.board_id,
      kind: "run_follow_up_created",
      title: "Proof follow-up proposed",
      summary: "Missing proof created a follow-up card in the draft inbox.",
      entityKind: "orchestration_run",
      entityId: run.id,
      metadata: {
        runId: run.id,
        parentCardId: parent.id,
        followUpCardIds: [cardId],
        proofReviewStatus: review.status,
        derivedFromParent: options.blockByParent === false,
        labels: options.labels ?? [],
        piSuggestedFollowUp: Boolean(options.labels?.includes("pi-suggested-follow-up")),
        suggestedTitle: options.title,
      },
      createdAt: now,
    });
    return [cardId];
  }

  createProjectBoardFollowUpCandidatesForRun(
    run: OrchestrationRun,
    parentRow?: ProjectBoardCardStoreRow,
    options: ProjectBoardRunFollowUpInsertOptions = {},
  ): string[] {
    const followUps = normalizeRunFollowUps(run.proofOfWork?.followUps);
    if (followUps.length === 0) return [];
    const parent =
      parentRow ??
      (this.db
        .prepare(
          "SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1",
        )
        .get(run.taskId) as ProjectBoardCardStoreRow | undefined);
    if (!parent) return [];

    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT INTO project_board_cards
       (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
        acceptance_criteria_json, test_plan_json, clarification_questions_json, clarification_decisions_json, source_kind, source_id, source_thread_id, source_message_id,
        orchestration_task_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const existing = this.db.prepare(
      "SELECT id FROM project_board_cards WHERE board_id = ? AND source_kind = 'run_follow_up' AND source_id = ?",
    );
    const labels = [...new Set(["run-follow-up", ...(options.labels ?? []), ...parseProjectBoardStringList(parent.labels_json)])];
    const blockByParent = options.blockByParent !== false;
    const clarificationQuestions = options.clarificationQuestions?.length
      ? normalizeProjectBoardClarificationQuestions(options.clarificationQuestions, 8)
      : [];
    const clarificationDecisions = normalizeProjectBoardClarificationDecisions(undefined, {
      clarificationQuestions,
      createdAt: now,
      updatedAt: now,
    });
    let insertedIds: string[] = [];
    const transaction = this.db.transaction(() => {
      insertedIds = [];
      followUps.forEach((followUp, index) => {
        const sourceId = `${run.id}#follow-up:${index + 1}`;
        if (existing.get(parent.board_id, sourceId)) return;
        const cardId = randomUUID();
        insert.run(
          cardId,
          parent.board_id,
          followUp.title,
          followUp.description,
          "draft",
          "needs_clarification",
          parent.priority === null ? null : parent.priority + index + 1,
          parent.phase,
          JSON.stringify(labels),
          JSON.stringify(blockByParent ? [parent.id] : []),
          JSON.stringify(followUp.acceptanceCriteria),
          JSON.stringify(followUp.testPlan),
          JSON.stringify(clarificationQuestions),
          JSON.stringify(clarificationDecisions),
          "run_follow_up",
          sourceId,
          run.threadId ?? parent.source_thread_id,
          null,
          null,
          now,
          now,
        );
        insertedIds.push(cardId);
      });
      if (insertedIds.length > 0) {
        this.touchBoard(parent.board_id, now);
        this.deps.appendProjectBoardEvent({
          boardId: parent.board_id,
          kind: "run_follow_up_created",
          title: "Run follow-ups proposed",
          summary: `${insertedIds.length} follow-up card${insertedIds.length === 1 ? "" : "s"} entered the draft inbox.`,
          entityKind: "orchestration_run",
          entityId: run.id,
          metadata: {
            runId: run.id,
            parentCardId: parent.id,
            followUpCardIds: insertedIds,
            derivedFromParent: !blockByParent,
            labels: options.labels ?? [],
          },
          createdAt: now,
        });
      }
    });
    transaction();
    return insertedIds;
  }

  materializeProjectBoardPulledHandoffFollowUps(boardId: string, runArtifacts: ProjectBoardRunArtifactProjection[]): string[] {
    const artifactsWithFollowUps = runArtifacts.filter((artifact) => artifact.handoff?.followUps.length);
    if (artifactsWithFollowUps.length === 0) return [];

    const parentById = new Map(
      (
        this.db
          .prepare("SELECT * FROM project_board_cards WHERE board_id = ? AND status != 'archived'")
          .all(boardId) as ProjectBoardCardStoreRow[]
      ).map((row) => [row.id, row]),
    );
    const existing = this.db.prepare(
      "SELECT id FROM project_board_cards WHERE board_id = ? AND source_kind = 'run_follow_up' AND source_id = ?",
    );
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO project_board_cards
       (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
        acceptance_criteria_json, test_plan_json, source_kind, source_id, source_thread_id, source_message_id, orchestration_task_id,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertEvent = this.db.prepare(
      `INSERT OR IGNORE INTO project_board_events
       (id, board_id, event_kind, title, summary, entity_kind, entity_id, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertedIds: string[] = [];
    let latestCreatedAt: string | undefined;

    for (const runArtifact of artifactsWithFollowUps) {
      const handoff = runArtifact.handoff;
      if (!handoff) continue;
      const runId = runArtifact.manifest?.runId ?? runArtifact.proof?.runId ?? handoff.runId ?? runArtifact.runPathId;
      const parentCardId = projectBoardExecutionArtifactCardId(runArtifact.manifest, runArtifact.proof, handoff);
      if (!parentCardId) continue;
      const parent = parentById.get(parentCardId);
      if (!parent) continue;

      const parentLabels = parseProjectBoardStringList(parent.labels_json);
      const labels = [...new Set(["run-follow-up", "pulled-handoff", ...parentLabels])];
      const runInsertedIds: string[] = [];
      handoff.followUps.forEach((followUp, index) => {
        const sourceId = `${runId}#follow-up:${index + 1}`;
        const existingCard = existing.get(boardId, sourceId) as { id: string } | undefined;
        if (existingCard) return;
        const cardId = stableBoardArtifactId("card", [boardId, "run_follow_up", sourceId]);
        const blockers = [...new Set([parent.id, ...followUp.blockedBy.filter((ref) => ref !== parent.id)])];
        const reason = followUp.reason.trim();
        const description = reason
          ? `Pulled handoff follow-up from ${parent.title}.\n\n${reason}`.slice(0, 4000)
          : `Pulled handoff follow-up from ${parent.title}.`;
        const acceptanceCriteria = reason
          ? [`Resolve follow-up: ${followUp.title}`, `Address handoff reason: ${reason}`]
          : [`Resolve follow-up: ${followUp.title}`];
        const testPlan: ProjectBoardCardTestPlan = {
          unit: [],
          integration: [],
          visual: [],
          manual: ["Review the pulled run handoff, confirm the follow-up scope, and attach proof before closing."],
        };
        const createdAt = handoff.createdAt;
        insert.run(
          cardId,
          boardId,
          followUp.title,
          description,
          "draft",
          "needs_clarification",
          parent.priority === null ? null : parent.priority + index + 1,
          parent.phase,
          JSON.stringify(labels),
          JSON.stringify(blockers),
          JSON.stringify(acceptanceCriteria),
          JSON.stringify(testPlan),
          "run_follow_up",
          sourceId,
          parent.source_thread_id,
          null,
          null,
          createdAt,
          createdAt,
        );
        insertedIds.push(cardId);
        runInsertedIds.push(cardId);
        latestCreatedAt = !latestCreatedAt || createdAt.localeCompare(latestCreatedAt) > 0 ? createdAt : latestCreatedAt;
      });

      if (runInsertedIds.length > 0) {
        insertEvent.run(
          stableBoardArtifactId("event", [boardId, "run_follow_up_created", runId]),
          boardId,
          "run_follow_up_created",
          "Pulled handoff follow-ups proposed",
          `${runInsertedIds.length} pulled handoff follow-up card${runInsertedIds.length === 1 ? "" : "s"} entered the draft inbox.`,
          "run",
          runId,
          JSON.stringify({ runId, parentCardId: parent.id, followUpCardIds: runInsertedIds, source: "pulled_handoff" }),
          handoff.createdAt,
        );
      }
    }

    if (insertedIds.length > 0) this.touchBoard(boardId, latestCreatedAt ?? new Date().toISOString());
    return insertedIds;
  }

  private touchBoard(boardId: string, updatedAt: string): void {
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(updatedAt, boardId);
  }
}
