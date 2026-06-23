import type Database from "better-sqlite3";
import { plannerPlanWorkflowStateForQuestions, type PlannerPlanArtifactRow } from "./plannerMappers";
import { extractPlannerPlanArtifactFields } from "./projectStorePlannerFacade";

export class ProjectStorePlannerQuestionBlockRepairRepository {
  constructor(private readonly db: Database.Database) {}

  repairPlannerPlanQuestionBlocks(): void {
    const rows = this.db
      .prepare(
        `SELECT a.*, m.content AS message_content
         FROM planner_plan_artifacts a
         JOIN messages m ON m.id = a.source_message_id
         WHERE a.content LIKE '%ambient-planner-questions%'
           AND NOT EXISTS (
             SELECT 1 FROM planner_decision_questions q
             WHERE q.artifact_id = a.id
           )`,
      )
      .all() as Array<PlannerPlanArtifactRow & { message_content: string }>;
    if (!rows.length) return;

    const updateArtifact = this.db.prepare(
      `UPDATE planner_plan_artifacts
       SET title = ?, summary = ?, content = ?, steps_json = ?, open_questions_json = ?, risks_json = ?, verification_json = ?, warnings_json = ?, workflow_state = ?, updated_at = ?
       WHERE id = ?`,
    );
    const updateMessageContent = this.db.prepare("UPDATE messages SET content = ? WHERE id = ?");
    const insertQuestion = this.db.prepare(
      `INSERT INTO planner_decision_questions
        (id, artifact_id, question_order, question, recommended_option_id, required, options_json, answer_kind, answer_option_id, answer_custom_text, answered_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
    );

    this.db.transaction((repairRows: typeof rows) => {
      for (const row of repairRows) {
        const fields = extractPlannerPlanArtifactFields(row.content);
        if (!fields.decisionQuestions.length || fields.content === row.content) continue;
        const now = new Date().toISOString();
        updateArtifact.run(
          fields.title,
          fields.summary,
          fields.content,
          JSON.stringify(fields.steps),
          JSON.stringify(fields.openQuestions),
          JSON.stringify(fields.risks),
          JSON.stringify(fields.verification),
          JSON.stringify(fields.warnings ?? []),
          plannerPlanWorkflowStateForQuestions(fields.decisionQuestions),
          now,
          row.id,
        );
        fields.decisionQuestions.forEach((question, index) => {
          insertQuestion.run(
            question.id,
            row.id,
            index,
            question.question,
            question.recommendedOptionId,
            question.required ? 1 : 0,
            JSON.stringify(question.options),
            now,
            now,
          );
        });
        if (row.message_content.includes("ambient-planner-questions")) {
          updateMessageContent.run(fields.content, row.source_message_id);
        }
      }
    })(rows);
  }
}
