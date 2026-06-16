import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStorePlannerArtifactRepository, type PlannerPlanArtifactInput } from "./plannerArtifactRepository";

describe("ProjectStorePlannerArtifactRepository", () => {
  let db: Database.Database;
  let repository: ProjectStorePlannerArtifactRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE planner_plan_artifacts (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        source_message_id TEXT NOT NULL,
        status TEXT NOT NULL,
        workflow_state TEXT NOT NULL DEFAULT 'draft',
        finalization_attempt_json TEXT,
        durable_artifact_path TEXT,
        durable_artifact_generated_at TEXT,
        durable_artifact_validation_json TEXT,
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        steps_json TEXT NOT NULL DEFAULT '[]',
        open_questions_json TEXT NOT NULL DEFAULT '[]',
        risks_json TEXT NOT NULL DEFAULT '[]',
        verification_json TEXT NOT NULL DEFAULT '[]',
        diagrams_json TEXT NOT NULL DEFAULT '[]',
        warnings_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE planner_decision_questions (
        id TEXT NOT NULL,
        artifact_id TEXT NOT NULL,
        question_order INTEGER NOT NULL,
        question TEXT NOT NULL,
        recommended_option_id TEXT NOT NULL,
        required INTEGER NOT NULL DEFAULT 0,
        options_json TEXT NOT NULL DEFAULT '[]',
        answer_kind TEXT,
        answer_option_id TEXT,
        answer_custom_text TEXT,
        answered_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(artifact_id, id)
      );
    `);
    repository = new ProjectStorePlannerArtifactRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("persists planner artifacts, questions, finalization state, and durable artifact metadata", () => {
    const artifact = repository.createPlannerPlanArtifact({
      ...plannerArtifactInput(),
      decisionQuestions: [
        {
          id: "asset-strategy",
          question: "How should assets work?",
          recommendedOptionId: "canvas",
          required: true,
          options: [
            { id: "canvas", label: "Canvas", description: "Draw everything in code." },
            { id: "sprites", label: "Sprites", description: "Use image assets." },
          ],
        },
      ],
    });

    expect(repository.listPlannerPlanArtifacts("thread-1")).toEqual([
      expect.objectContaining({
        id: artifact.id,
        status: "ready",
        workflowState: "questions_pending",
        decisionQuestions: [expect.objectContaining({ id: "asset-strategy", recommendedOptionId: "canvas", required: true })],
      }),
    ]);

    const answered = repository.answerPlannerDecisionQuestion(artifact.id, "asset-strategy", { kind: "option", optionId: "canvas" });
    expect(answered.workflowState).toBe("answers_complete");
    expect(answered.decisionQuestions[0].answer).toEqual(expect.objectContaining({ kind: "option", optionId: "canvas" }));

    const finalizing = repository.updatePlannerPlanArtifact(answered.id, { workflowState: "finalizing" });
    expect(finalizing.finalizationAttempt).toEqual(expect.objectContaining({ status: "running", id: expect.any(String) }));
    const repeatedFinalizing = repository.updatePlannerPlanArtifact(answered.id, { workflowState: "finalizing" });
    expect(repeatedFinalizing.finalizationAttempt?.id).toBe(finalizing.finalizationAttempt?.id);
    const completed = repository.finishPlannerPlanFinalizationAttempt(answered.id, { status: "completed" });
    expect(completed.finalizationAttempt).toEqual(expect.objectContaining({ id: finalizing.finalizationAttempt?.id, status: "completed" }));

    const durable = repository.setPlannerPlanDurableArtifact(answered.id, {
      path: ".ambient/board/plans/Plan-DurablePlan.html",
      generatedAt: "2026-05-11T00:00:00.000Z",
      validation: { ok: true, checkedAt: "2026-05-11T00:00:00.000Z", errors: [], warnings: [] },
    });
    expect(durable).toMatchObject({
      workflowState: "durable_ready",
      durableArtifactPath: ".ambient/board/plans/Plan-DurablePlan.html",
      durableArtifactGeneratedAt: "2026-05-11T00:00:00.000Z",
      durableArtifactValidation: { ok: true },
    });
  });

  it("supersedes the previous ready plan for a thread", () => {
    const first = repository.createPlannerPlanArtifact(plannerArtifactInput({ title: "Plan v1" }));
    const second = repository.createPlannerPlanArtifact(plannerArtifactInput({ title: "Plan v2" }));

    expect(repository.getPlannerPlanArtifact(first.id).status).toBe("superseded");
    expect(repository.getPlannerPlanArtifact(second.id).status).toBe("ready");
  });

  it("rejects invalid decision answers explicitly", () => {
    const artifact = repository.createPlannerPlanArtifact({
      ...plannerArtifactInput(),
      decisionQuestions: [
        {
          id: "rollout",
          question: "Which rollout path?",
          recommendedOptionId: "staged",
          required: true,
          options: [{ id: "staged", label: "Staged", description: "Ship gradually." }],
        },
      ],
    });

    expect(() => repository.answerPlannerDecisionQuestion(artifact.id, "rollout", { kind: "option", optionId: "missing" })).toThrow(
      "Planner decision option not found: rollout/missing",
    );
    expect(() => repository.answerPlannerDecisionQuestion(artifact.id, "rollout", { kind: "custom", customText: "   " })).toThrow(
      "Planner decision custom answer cannot be empty.",
    );
    expect(() => repository.answerPlannerDecisionQuestion(artifact.id, "missing", { kind: "option", optionId: "staged" })).toThrow(
      `Planner decision question not found: ${artifact.id}/missing`,
    );
  });

  it("updates content and validation state without losing existing workflow state", () => {
    const artifact = repository.createPlannerPlanArtifact(plannerArtifactInput());
    const finalizing = repository.updatePlannerPlanArtifact(artifact.id, { workflowState: "finalizing" });

    const updated = repository.updatePlannerPlanArtifactContent(finalizing.id, {
      sourceMessageId: "message-2",
      title: "Repaired plan",
      summary: "Updated summary.",
      content: "Updated content.",
      steps: [{ id: "step-2", title: "Repair content." }],
      openQuestions: ["Question?"],
      risks: ["Risk."],
      verification: ["Verify."],
      warnings: ["Warning."],
      diagrams: [],
    });
    expect(updated).toMatchObject({
      sourceMessageId: "message-2",
      title: "Repaired plan",
      workflowState: "finalizing",
    });

    const validation = repository.setPlannerPlanDurableArtifactValidation(
      updated.id,
      {
        ok: false,
        checkedAt: "2026-05-11T00:00:01.000Z",
        errors: [{ code: "missing-section", section: "verification", message: "Missing verification." }],
        warnings: [],
      },
      "failed",
    );
    expect(validation.workflowState).toBe("failed");
    expect(validation.durableArtifactValidation?.errors[0]).toEqual({
      code: "missing-section",
      section: "verification",
      message: "Missing verification.",
    });
  });
});

function plannerArtifactInput(input: Partial<PlannerPlanArtifactInput> = {}): PlannerPlanArtifactInput {
  return {
    threadId: "thread-1",
    sourceMessageId: "message-1",
    title: "Plan",
    summary: "Inspect first.",
    content: "## Plan\n1. Inspect files.",
    steps: [{ id: "step-1", title: "Inspect files." }],
    openQuestions: [],
    risks: [],
    verification: ["Run tests."],
    warnings: [],
    diagrams: [],
    ...input,
  };
}
