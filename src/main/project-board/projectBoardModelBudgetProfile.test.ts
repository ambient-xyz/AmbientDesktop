import { describe, expect, it } from "vitest";
import { projectBoardModelBudgetProfile, projectBoardPromptBudgetAssessment } from "./projectBoardModelBudgetProfile";

describe("projectBoardModelBudgetProfile", () => {
  it("sizes planner batches from the requested card count", () => {
    expect(
      projectBoardModelBudgetProfile({
        model: "zai-org/GLM-5.1-FP8",
        operation: "planner_card_batch",
        maxCardsPerBatch: 2,
      }),
    ).toMatchObject({
      operation: "planner_card_batch",
      contextWindowTokens: 200_000,
      modelMaxOutputTokens: 128_000,
      maxOutputTokens: 4_800,
      softPromptBudgetTokens: 48_000,
      summarizationThresholdTokens: 36_000,
      source: "default",
    });
    expect(
      projectBoardModelBudgetProfile({
        model: "zai-org/GLM-5.1-FP8",
        operation: "planner_card_batch",
        maxCardsPerBatch: 3,
      }).maxOutputTokens,
    ).toBe(7_200);
    expect(
      projectBoardModelBudgetProfile({
        model: "zai-org/GLM-5.1-FP8",
        operation: "planner_card_batch",
        maxCardsPerBatch: 3,
      }),
    ).toMatchObject({
      softPromptBudgetTokens: 48_000,
      summarizationThresholdTokens: 36_000,
    });
  });

  it("uses live-matrix calibrated GLM planner prompt thresholds", () => {
    const profile = projectBoardModelBudgetProfile({
      model: "zai-org/GLM-5.1-FP8",
      operation: "planner_card_batch",
      maxCardsPerBatch: 2,
    });

    expect(projectBoardPromptBudgetAssessment({ promptCharCount: 45_239, profile })).toMatchObject({
      estimatedPromptTokens: 11_310,
      status: "within_budget",
      summarizationRecommended: false,
      softPromptBudgetExceeded: false,
    });
    expect(projectBoardPromptBudgetAssessment({ promptCharCount: profile.summarizationThresholdTokens * 4, profile })).toMatchObject({
      status: "summarization_recommended",
      recommendedAction: "use_ledgers_and_retrieval",
      summarizationRecommended: true,
      softPromptBudgetExceeded: false,
    });
    expect(projectBoardPromptBudgetAssessment({ promptCharCount: (profile.softPromptBudgetTokens + 1) * 4, profile })).toMatchObject({
      status: "soft_prompt_budget_exceeded",
      recommendedAction: "summarize_before_call",
      summarizationRecommended: true,
      softPromptBudgetExceeded: true,
    });
  });

  it("uses operation-specific output defaults", () => {
    expect(projectBoardModelBudgetProfile({ model: "unknown-model", operation: "legacy_full_synthesis" }).maxOutputTokens).toBe(12_000);
    expect(projectBoardModelBudgetProfile({ model: "unknown-model", operation: "section_elaboration" }).maxOutputTokens).toBe(6_000);
    expect(projectBoardModelBudgetProfile({ model: "unknown-model", operation: "planner_ledger_compaction" }).maxOutputTokens).toBe(1_800);
    expect(projectBoardModelBudgetProfile({ model: "unknown-model", operation: "planner_source_qa" }).maxOutputTokens).toBe(1_200);
  });

  it("allows operation-specific env overrides for live calibration", () => {
    expect(
      projectBoardModelBudgetProfile({
        model: "zai-org/GLM-5.1-FP8",
        operation: "planner_card_batch",
        maxCardsPerBatch: 3,
        env: { AMBIENT_PROJECT_BOARD_PLANNER_BATCH_MAX_OUTPUT_TOKENS: "3333" },
      }),
    ).toMatchObject({
      maxOutputTokens: 3_333,
      source: "env_override",
      overrideKey: "AMBIENT_PROJECT_BOARD_PLANNER_BATCH_MAX_OUTPUT_TOKENS",
    });
  });

  it("assesses prompt pressure against soft budgets and context limits", () => {
    const profile = projectBoardModelBudgetProfile({
      model: "unknown-model",
      operation: "planner_card_batch",
      maxCardsPerBatch: 3,
    });

    expect(projectBoardPromptBudgetAssessment({ promptCharCount: 4_000, profile })).toMatchObject({
      status: "within_budget",
      recommendedAction: "continue",
      summarizationRecommended: false,
      softPromptBudgetExceeded: false,
      contextWindowExceeded: false,
    });

    expect(
      projectBoardPromptBudgetAssessment({
        promptCharCount: profile.summarizationThresholdTokens * 4,
        profile,
      }),
    ).toMatchObject({
      status: "summarization_recommended",
      recommendedAction: "use_ledgers_and_retrieval",
      summarizationRecommended: true,
      softPromptBudgetExceeded: false,
      contextWindowExceeded: false,
    });

    expect(
      projectBoardPromptBudgetAssessment({
        promptCharCount: (profile.softPromptBudgetTokens + 1) * 4,
        profile,
      }),
    ).toMatchObject({
      status: "soft_prompt_budget_exceeded",
      recommendedAction: "summarize_before_call",
      summarizationRecommended: true,
      softPromptBudgetExceeded: true,
      contextWindowExceeded: false,
    });

    expect(
      projectBoardPromptBudgetAssessment({
        promptCharCount: profile.contextWindowTokens * 4,
        profile,
      }),
    ).toMatchObject({
      status: "context_budget_exceeded",
      recommendedAction: "reduce_prompt_before_call",
      summarizationRecommended: true,
      softPromptBudgetExceeded: true,
      contextWindowExceeded: true,
    });
  });
});
