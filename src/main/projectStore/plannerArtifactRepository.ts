import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  PlannerDecisionQuestion,
  PlannerDurableArtifactValidationResult,
  PlannerPlanArtifact,
  PlannerPlanArtifactStatus,
  PlannerPlanFinalizationAttempt,
  PlannerPlanFinalizationAttemptStatus,
  PlannerPlanWorkflowState,
} from "../../shared/types";
import {
  mapPlannerDecisionQuestionRow,
  mapPlannerPlanArtifactRow,
  parsePlannerDecisionOptions,
  plannerPlanWorkflowStateForQuestions,
  type PlannerDecisionQuestionRow,
  type PlannerPlanArtifactRow,
} from "./plannerMappers";

export type PlannerPlanArtifactInput = Omit<PlannerPlanArtifact, "id" | "status" | "workflowState" | "createdAt" | "updatedAt" | "decisionQuestions"> & {
  status?: PlannerPlanArtifactStatus;
  workflowState?: PlannerPlanWorkflowState;
  decisionQuestions?: PlannerDecisionQuestion[];
};

export class ProjectStorePlannerArtifactRepository {
  constructor(private readonly db: Database.Database) {}

  createPlannerPlanArtifact(input: PlannerPlanArtifactInput): PlannerPlanArtifact {
    const id = randomUUID();
    const now = new Date().toISOString();
    const status = input.status ?? "ready";
    const decisionQuestions = input.decisionQuestions ?? [];
    const workflowState = input.workflowState ?? plannerPlanWorkflowStateForQuestions(decisionQuestions);
    const insert = this.db.transaction(() => {
      if (status === "ready") {
        this.db
          .prepare("UPDATE planner_plan_artifacts SET status = 'superseded', updated_at = ? WHERE thread_id = ? AND status = 'ready'")
          .run(now, input.threadId);
      }
      this.db
        .prepare(
          `INSERT INTO planner_plan_artifacts
            (id, thread_id, source_message_id, status, workflow_state, finalization_attempt_json, durable_artifact_path, durable_artifact_generated_at, durable_artifact_validation_json, title, summary, content, steps_json, open_questions_json, risks_json, verification_json, diagrams_json, warnings_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.threadId,
          input.sourceMessageId,
          status,
          workflowState,
          null,
          null,
          null,
          null,
          input.title,
          input.summary,
          input.content,
          JSON.stringify(input.steps),
          JSON.stringify(input.openQuestions),
          JSON.stringify(input.risks),
          JSON.stringify(input.verification),
          JSON.stringify(input.diagrams ?? []),
          JSON.stringify(input.warnings ?? []),
          now,
          now,
        );
      const insertQuestion = this.db.prepare(
        `INSERT INTO planner_decision_questions
          (id, artifact_id, question_order, question, recommended_option_id, required, options_json, answer_kind, answer_option_id, answer_custom_text, answered_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      decisionQuestions.forEach((question, index) => {
        insertQuestion.run(
          question.id,
          id,
          index,
          question.question,
          question.recommendedOptionId,
          question.required ? 1 : 0,
          JSON.stringify(question.options),
          question.answer?.kind ?? null,
          question.answer?.kind === "option" ? question.answer.optionId : null,
          question.answer?.kind === "custom" ? question.answer.customText : null,
          question.answer?.answeredAt ?? null,
          now,
          now,
        );
      });
    });
    insert();
    return this.getPlannerPlanArtifact(id);
  }

  getPlannerPlanArtifact(artifactId: string): PlannerPlanArtifact {
    const row = this.db.prepare("SELECT * FROM planner_plan_artifacts WHERE id = ?").get(artifactId) as PlannerPlanArtifactRow | undefined;
    if (!row) throw new Error(`Planner plan artifact not found: ${artifactId}`);
    return this.mapPlannerPlanArtifact(row);
  }

  listPlannerPlanArtifacts(threadId: string): PlannerPlanArtifact[] {
    const rows = this.db
      .prepare("SELECT * FROM planner_plan_artifacts WHERE thread_id = ? ORDER BY created_at DESC, rowid DESC")
      .all(threadId) as PlannerPlanArtifactRow[];
    return rows.map((row) => this.mapPlannerPlanArtifact(row));
  }

  updatePlannerPlanArtifact(
    artifactId: string,
    input: { status?: PlannerPlanArtifactStatus; workflowState?: PlannerPlanWorkflowState },
  ): PlannerPlanArtifact {
    if (!input.status && !input.workflowState) return this.getPlannerPlanArtifact(artifactId);
    const current = this.getPlannerPlanArtifact(artifactId);
    const now = new Date().toISOString();
    let finalizationAttempt = current.finalizationAttempt;
    if (input.workflowState === "finalizing" && finalizationAttempt?.status !== "running") {
      finalizationAttempt = {
        id: randomUUID(),
        status: "running",
        startedAt: now,
      };
    } else if (input.workflowState === "failed" && finalizationAttempt?.status === "running") {
      finalizationAttempt = {
        ...finalizationAttempt,
        status: "failed",
        completedAt: now,
      };
    }
    this.db
      .prepare("UPDATE planner_plan_artifacts SET status = ?, workflow_state = ?, finalization_attempt_json = ?, updated_at = ? WHERE id = ?")
      .run(
        input.status ?? current.status,
        input.workflowState ?? current.workflowState,
        finalizationAttempt ? JSON.stringify(finalizationAttempt) : null,
        now,
        artifactId,
      );
    return this.getPlannerPlanArtifact(artifactId);
  }

  updatePlannerPlanArtifactStatus(artifactId: string, status: PlannerPlanArtifactStatus): PlannerPlanArtifact {
    return this.updatePlannerPlanArtifact(artifactId, { status });
  }

  finishPlannerPlanFinalizationAttempt(
    artifactId: string,
    input: { status: Exclude<PlannerPlanFinalizationAttemptStatus, "running">; workflowState?: PlannerPlanWorkflowState; error?: string },
  ): PlannerPlanArtifact {
    const current = this.getPlannerPlanArtifact(artifactId);
    if (current.finalizationAttempt?.status !== "running") return current;
    const now = new Date().toISOString();
    const workflowState =
      input.workflowState ??
      (input.status === "failed" ? "failed" : current.workflowState === "finalizing" ? "answers_complete" : current.workflowState);
    const finalizationAttempt: PlannerPlanFinalizationAttempt = {
      ...current.finalizationAttempt,
      status: input.status,
      completedAt: now,
      ...(input.error ? { error: input.error } : {}),
    };
    this.db
      .prepare("UPDATE planner_plan_artifacts SET workflow_state = ?, finalization_attempt_json = ?, updated_at = ? WHERE id = ?")
      .run(workflowState, JSON.stringify(finalizationAttempt), now, artifactId);
    return this.getPlannerPlanArtifact(artifactId);
  }

  updatePlannerPlanArtifactContent(
    artifactId: string,
    input: Pick<
      PlannerPlanArtifact,
      "sourceMessageId" | "title" | "summary" | "content" | "steps" | "openQuestions" | "risks" | "verification" | "warnings" | "diagrams"
    > & { workflowState?: PlannerPlanWorkflowState },
  ): PlannerPlanArtifact {
    const current = this.getPlannerPlanArtifact(artifactId);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE planner_plan_artifacts
         SET source_message_id = ?, title = ?, summary = ?, content = ?, steps_json = ?, open_questions_json = ?,
             risks_json = ?, verification_json = ?, diagrams_json = ?, warnings_json = ?, workflow_state = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.sourceMessageId,
        input.title,
        input.summary,
        input.content,
        JSON.stringify(input.steps),
        JSON.stringify(input.openQuestions),
        JSON.stringify(input.risks),
        JSON.stringify(input.verification),
        JSON.stringify(input.diagrams ?? []),
        JSON.stringify(input.warnings ?? []),
        input.workflowState ?? current.workflowState,
        now,
        artifactId,
      );
    return this.getPlannerPlanArtifact(artifactId);
  }

  setPlannerPlanDurableArtifact(
    artifactId: string,
    input: { path: string; generatedAt: string; validation?: PlannerDurableArtifactValidationResult; workflowState?: PlannerPlanWorkflowState },
  ): PlannerPlanArtifact {
    const current = this.getPlannerPlanArtifact(artifactId);
    const now = new Date().toISOString();
    const finalizationAttempt =
      current.finalizationAttempt?.status === "running"
        ? JSON.stringify({
            ...current.finalizationAttempt,
            status: "completed",
            completedAt: now,
          })
        : current.finalizationAttempt
          ? JSON.stringify(current.finalizationAttempt)
          : null;
    this.db
      .prepare(
        `UPDATE planner_plan_artifacts
         SET durable_artifact_path = ?, durable_artifact_generated_at = ?, durable_artifact_validation_json = ?, workflow_state = ?, finalization_attempt_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.path,
        input.generatedAt,
        input.validation ? JSON.stringify(input.validation) : null,
        input.workflowState ?? "durable_ready",
        finalizationAttempt,
        now,
        artifactId,
      );
    return this.getPlannerPlanArtifact(artifactId);
  }

  setPlannerPlanDurableArtifactValidation(
    artifactId: string,
    validation: PlannerDurableArtifactValidationResult,
    workflowState?: PlannerPlanWorkflowState,
  ): PlannerPlanArtifact {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE planner_plan_artifacts
         SET durable_artifact_validation_json = ?, workflow_state = COALESCE(?, workflow_state), updated_at = ?
         WHERE id = ?`,
      )
      .run(JSON.stringify(validation), workflowState ?? null, now, artifactId);
    return this.getPlannerPlanArtifact(artifactId);
  }

  answerPlannerDecisionQuestion(
    artifactId: string,
    questionId: string,
    answer: { kind: "option"; optionId: string } | { kind: "custom"; customText: string },
  ): PlannerPlanArtifact {
    const row = this.db
      .prepare("SELECT * FROM planner_decision_questions WHERE artifact_id = ? AND id = ?")
      .get(artifactId, questionId) as PlannerDecisionQuestionRow | undefined;
    if (!row) throw new Error(`Planner decision question not found: ${artifactId}/${questionId}`);
    const options = parsePlannerDecisionOptions(row.options_json);
    if (answer.kind === "option" && !options.some((option) => option.id === answer.optionId)) {
      throw new Error(`Planner decision option not found: ${questionId}/${answer.optionId}`);
    }
    if (answer.kind === "custom" && !answer.customText.trim()) {
      throw new Error("Planner decision custom answer cannot be empty.");
    }
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE planner_decision_questions
             SET answer_kind = ?, answer_option_id = ?, answer_custom_text = ?, answered_at = ?, updated_at = ?
           WHERE artifact_id = ? AND id = ?`,
        )
        .run(
          answer.kind,
          answer.kind === "option" ? answer.optionId : null,
          answer.kind === "custom" ? answer.customText.trim() : null,
          now,
          now,
          artifactId,
          questionId,
        );
      this.db.prepare("UPDATE planner_plan_artifacts SET updated_at = ? WHERE id = ?").run(now, artifactId);
    })();
    const artifact = this.getPlannerPlanArtifact(artifactId);
    const workflowState = plannerPlanWorkflowStateForQuestions(artifact.decisionQuestions);
    if (artifact.workflowState !== workflowState) {
      this.db.prepare("UPDATE planner_plan_artifacts SET workflow_state = ?, updated_at = ? WHERE id = ?").run(workflowState, now, artifactId);
      return this.getPlannerPlanArtifact(artifactId);
    }
    return artifact;
  }

  private mapPlannerPlanArtifact(row: PlannerPlanArtifactRow): PlannerPlanArtifact {
    return mapPlannerPlanArtifactRow(row, this.listPlannerDecisionQuestions(row.id));
  }

  private listPlannerDecisionQuestions(artifactId: string): PlannerDecisionQuestion[] {
    const rows = this.db
      .prepare("SELECT * FROM planner_decision_questions WHERE artifact_id = ? ORDER BY question_order ASC, rowid ASC")
      .all(artifactId) as PlannerDecisionQuestionRow[];
    return rows.map((row, index) => mapPlannerDecisionQuestionRow(row, index));
  }
}
