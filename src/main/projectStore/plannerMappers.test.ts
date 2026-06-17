import { describe, expect, it } from "vitest";
import {
  mapPlannerDecisionQuestionRow,
  mapPlannerPlanArtifactRow,
  parsePlannerDecisionOptions,
  plannerPlanWorkflowStateForQuestions,
  type PlannerDecisionQuestionRow,
  type PlannerPlanArtifactRow,
} from "./plannerMappers";
import { mapPlannerPlanArtifactRow as legacyMapPlannerPlanArtifactRow } from "./projectStorePlannerMappers";

describe("project store planner mappers", () => {
  it("keeps the legacy mapper import path as a re-export", () => {
    expect(legacyMapPlannerPlanArtifactRow).toBe(mapPlannerPlanArtifactRow);
  });

  it("maps planner decision question rows without store state", () => {
    const row: PlannerDecisionQuestionRow = {
      id: "question-1",
      artifact_id: "artifact-1",
      question_order: 2,
      question: "Which deployment path should the plan use?",
      recommended_option_id: "staged",
      required: 1,
      options_json: JSON.stringify([
        {
          id: "staged",
          label: "Staged rollout",
          description: "Ship to a small audience first.",
        },
        {
          id: "big-bang",
          label: "All at once",
          description: "Release to everyone.",
        },
      ]),
      answer_kind: "option",
      answer_option_id: "staged",
      answer_custom_text: null,
      answered_at: "2026-06-06T20:10:00.000Z",
      created_at: "2026-06-06T20:00:00.000Z",
      updated_at: "2026-06-06T20:10:00.000Z",
    };

    expect(mapPlannerDecisionQuestionRow(row, 1)).toEqual({
      id: "question-1",
      question: "Which deployment path should the plan use?",
      recommendedOptionId: "staged",
      required: true,
      options: [
        {
          id: "staged",
          label: "Staged rollout",
          description: "Ship to a small audience first.",
        },
        {
          id: "big-bang",
          label: "All at once",
          description: "Release to everyone.",
        },
      ],
      answer: {
        kind: "option",
        optionId: "staged",
        answeredAt: "2026-06-06T20:10:00.000Z",
      },
    });
  });

  it("preserves planner decision nullable and fallback behavior", () => {
    const mapped = mapPlannerDecisionQuestionRow(
      {
        ...basePlannerDecisionQuestionRow(),
        recommended_option_id: "missing",
        required: 0,
        answer_kind: null,
        answer_option_id: null,
        answer_custom_text: null,
        answered_at: null,
      },
      2,
    );

    expect(mapped.recommendedOptionId).toBe("approve");
    expect(mapped.required).toBe(false);
    expect(mapped.answer).toBeUndefined();

    expect(mapPlannerDecisionQuestionRow({ ...basePlannerDecisionQuestionRow(), options_json: "not-json" }, 2)).toMatchObject({
      recommendedOptionId: "option-3",
      options: [],
    });
  });

  it("maps custom planner decision answers", () => {
    const mapped = mapPlannerDecisionQuestionRow(
      {
        ...basePlannerDecisionQuestionRow(),
        answer_kind: "custom",
        answer_option_id: null,
        answer_custom_text: "Use the canary path.",
        answered_at: "2026-06-06T20:15:00.000Z",
      },
      0,
    );

    expect(mapped.answer).toEqual({
      kind: "custom",
      customText: "Use the canary path.",
      answeredAt: "2026-06-06T20:15:00.000Z",
    });
  });

  it("preserves planner decision option parsing behavior", () => {
    expect(
      parsePlannerDecisionOptions(
        JSON.stringify([
          { label: " Ship Now ", description: " Go fast " },
          { id: "  keep-safe  ", label: "Keep Safe", description: 12 },
          { id: "ignored" },
          null,
        ]),
      ),
    ).toEqual([
      {
        id: "ship-now",
        label: "Ship Now",
        description: "Go fast",
      },
      {
        id: "keep-safe",
        label: "Keep Safe",
        description: "",
      },
    ]);

    expect(parsePlannerDecisionOptions("not-json")).toEqual([]);
    expect(parsePlannerDecisionOptions(JSON.stringify({ label: "nope" }))).toEqual([]);
  });

  it("maps planner plan artifact rows without store state", () => {
    const decisionQuestions = [
      {
        id: "question-1",
        question: "Which rollout path should this use?",
        recommendedOptionId: "staged",
        required: true,
        options: [
          {
            id: "staged",
            label: "Staged",
            description: "Ship to a small audience first.",
          },
        ],
        answer: {
          kind: "option" as const,
          optionId: "staged",
          answeredAt: "2026-06-06T20:30:00.000Z",
        },
      },
    ];

    const mapped = mapPlannerPlanArtifactRow(basePlannerPlanArtifactRow(), decisionQuestions);

    expect(mapped).toEqual({
      id: "artifact-1",
      threadId: "thread-1",
      sourceMessageId: "message-1",
      status: "ready",
      workflowState: "durable_ready_with_fallbacks",
      finalizationAttempt: {
        id: "attempt-1",
        status: "completed",
        startedAt: "2026-06-06T20:00:00.000Z",
        completedAt: "2026-06-06T20:02:00.000Z",
        error: "Recovered with fallback.",
      },
      durableArtifactPath: "plans/durable-plan.md",
      durableArtifactGeneratedAt: "2026-06-06T20:03:00.000Z",
      durableArtifactValidation: {
        ok: false,
        checkedAt: "2026-06-06T20:04:00.000Z",
        errors: [
          {
            code: "missing-verification",
            message: "Add verification details.",
            section: "verification",
          },
        ],
        warnings: [
          {
            code: "fallback-used",
            message: "Used a fallback diagram.",
          },
        ],
      },
      title: "Simplification plan",
      summary: "Extract mapper behavior.",
      content: "Plan content",
      steps: [
        {
          id: "step-1",
          title: "Move mapper",
          detail: "Extract row mapping.",
        },
        {
          id: "step-2",
          title: "Verify parity",
        },
      ],
      openQuestions: ["Question one?", "Question two?"],
      risks: ["Risk one"],
      verification: ["Run focused tests"],
      diagrams: [
        {
          id: "diagram-1",
          title: "Flow",
          kind: "custom",
          purpose: "Show artifact flow.",
          nodes: [
            {
              id: "source",
              label: "Source",
              role: "input",
            },
            {
              id: "mapper",
              label: "Mapper",
            },
          ],
          edges: [
            {
              from: "source",
              to: "mapper",
              label: "maps",
            },
          ],
          layoutHint: "left-to-right",
          fallbackSummary: "Fallback diagram summary.",
        },
      ],
      warnings: ["Warning one"],
      decisionQuestions,
      createdAt: "2026-06-06T20:00:00.000Z",
      updatedAt: "2026-06-06T20:05:00.000Z",
    });
  });

  it("preserves planner plan artifact fallback behavior", () => {
    const mapped = mapPlannerPlanArtifactRow(
      {
        ...basePlannerPlanArtifactRow(),
        workflow_state: "draft",
        finalization_attempt_json: "not-json",
        durable_artifact_path: null,
        durable_artifact_generated_at: null,
        durable_artifact_validation_json: JSON.stringify({ ok: "nope", checkedAt: "2026-06-06T20:04:00.000Z" }),
        steps_json: "not-json",
        open_questions_json: JSON.stringify({ question: "nope" }),
        risks_json: JSON.stringify([false, 1]),
        verification_json: "not-json",
        diagrams_json: null,
        warnings_json: null,
      },
      [
        {
          id: "question-1",
          question: "Still required?",
          recommendedOptionId: "yes",
          required: true,
          options: [
            {
              id: "yes",
              label: "Yes",
              description: "",
            },
          ],
        },
      ],
    );

    expect(mapped.workflowState).toBe("questions_pending");
    expect(mapped.finalizationAttempt).toBeUndefined();
    expect(mapped.durableArtifactPath).toBeUndefined();
    expect(mapped.durableArtifactGeneratedAt).toBeUndefined();
    expect(mapped.durableArtifactValidation).toBeUndefined();
    expect(mapped.steps).toEqual([]);
    expect(mapped.openQuestions).toEqual([]);
    expect(mapped.risks).toEqual([]);
    expect(mapped.verification).toEqual([]);
    expect(mapped.diagrams).toEqual([]);
    expect(mapped.warnings).toEqual([]);
  });

  it("derives planner workflow state from decision questions", () => {
    expect(plannerPlanWorkflowStateForQuestions([])).toBe("draft");
    expect(
      plannerPlanWorkflowStateForQuestions([
        {
          id: "question-1",
          question: "Optional?",
          recommendedOptionId: "skip",
          required: false,
          options: [],
        },
      ]),
    ).toBe("answers_complete");
    expect(
      plannerPlanWorkflowStateForQuestions([
        {
          id: "question-1",
          question: "Required?",
          recommendedOptionId: "yes",
          required: true,
          options: [],
        },
      ]),
    ).toBe("questions_pending");
  });
});

function basePlannerDecisionQuestionRow(): PlannerDecisionQuestionRow {
  return {
    id: "question-1",
    artifact_id: "artifact-1",
    question_order: 1,
    question: "Should this plan be approved?",
    recommended_option_id: "approve",
    required: 1,
    options_json: JSON.stringify([
      {
        id: "approve",
        label: "Approve",
        description: "Move forward.",
      },
    ]),
    answer_kind: "option",
    answer_option_id: "approve",
    answer_custom_text: null,
    answered_at: "2026-06-06T20:05:00.000Z",
    created_at: "2026-06-06T20:00:00.000Z",
    updated_at: "2026-06-06T20:05:00.000Z",
  };
}

function basePlannerPlanArtifactRow(): PlannerPlanArtifactRow {
  return {
    id: "artifact-1",
    thread_id: "thread-1",
    source_message_id: "message-1",
    status: "ready",
    workflow_state: "durable_ready_with_fallbacks",
    finalization_attempt_json: JSON.stringify({
      id: "attempt-1",
      status: "completed",
      startedAt: "2026-06-06T20:00:00.000Z",
      completedAt: "2026-06-06T20:02:00.000Z",
      error: "Recovered with fallback.",
    }),
    durable_artifact_path: "plans/durable-plan.md",
    durable_artifact_generated_at: "2026-06-06T20:03:00.000Z",
    durable_artifact_validation_json: JSON.stringify({
      ok: false,
      checkedAt: "2026-06-06T20:04:00.000Z",
      errors: [
        {
          code: "missing-verification",
          message: "Add verification details.",
          section: "verification",
        },
        {
          code: "ignored",
        },
      ],
      warnings: [
        {
          code: "fallback-used",
          message: "Used a fallback diagram.",
        },
        null,
      ],
    }),
    title: "Simplification plan",
    summary: "Extract mapper behavior.",
    content: "Plan content",
    steps_json: JSON.stringify([
      {
        id: "step-1",
        title: "Move mapper",
        detail: "Extract row mapping.",
      },
      {
        title: "Verify parity",
      },
      {
        detail: "Ignored without a title.",
      },
    ]),
    open_questions_json: JSON.stringify(["Question one?", 12, "Question two?"]),
    risks_json: JSON.stringify(["Risk one", false]),
    verification_json: JSON.stringify(["Run focused tests", null]),
    diagrams_json: JSON.stringify([
      {
        id: "diagram-1",
        title: "Flow",
        kind: "unknown-kind",
        purpose: "Show artifact flow.",
        nodes: [
          {
            id: "source",
            label: "Source",
            role: "input",
          },
          {
            id: "mapper",
            label: "Mapper",
          },
        ],
        edges: [
          {
            from: "source",
            to: "mapper",
            label: "maps",
          },
          {
            from: "source",
            to: "missing",
          },
        ],
        layoutHint: "left-to-right",
        fallbackSummary: "Fallback diagram summary.",
      },
      {
        id: "diagram-2",
        title: "Empty",
        kind: "architecture",
        nodes: [],
        edges: [],
      },
    ]),
    warnings_json: JSON.stringify(["Warning one", 5]),
    created_at: "2026-06-06T20:00:00.000Z",
    updated_at: "2026-06-06T20:05:00.000Z",
  };
}
