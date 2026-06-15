import { describe, expect, it } from "vitest";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { SYMPHONY_WORKFLOW_PATTERN_IDS } from "../../shared/symphonyWorkflowRecipes";
import {
  symphonyWorkflowBuilderComposerUiModel,
  symphonyWorkflowBuilderUiModel,
} from "./symphonyWorkflowBuilderUiModel";

describe("symphony workflow builder UI model", () => {
  it("hides Symphony controls while ambient.subagents is disabled", () => {
    const model = symphonyWorkflowBuilderUiModel({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: false } }),
      draft: { open: true, patternId: "map_reduce" },
    });

    expect(model).toMatchObject({
      schemaVersion: "ambient-symphony-workflow-builder-ui-v1",
      featureFlagEnabled: false,
      visible: false,
      toggle: {
        visible: false,
        disabled: true,
        active: false,
        green: false,
        icon: "symphony",
        tone: "hidden",
      },
      patternCards: [],
      steps: [],
      metrics: [],
    });
    expect(model.launchCard).toBeUndefined();
  });

  it("models the active green Symphony toggle and all six graphical presets", () => {
    const model = symphonyWorkflowBuilderUiModel({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      draft: { open: true, patternId: "pipeline" },
    });

    expect(model.toggle).toMatchObject({
      visible: true,
      disabled: false,
      active: true,
      green: true,
      ariaLabel: "Close Symphony workflow builder",
      tone: "active",
    });
    expect(model.patternCards.map((card) => card.id)).toEqual([...SYMPHONY_WORKFLOW_PATTERN_IDS]);
    expect(model.patternCards.every((card) => card.diagramSvg.includes("<svg"))).toBe(true);
    expect(model.selectedPattern).toMatchObject({
      id: "pipeline",
      label: "Pipeline",
      selected: true,
      roleLabels: ["Explorer", "Worker", "Reviewer", "Summarizer"],
      budgetLabel: "Up to 180,000 tokens",
    });
  });

  it("adds Custom choices, selected answers, and customizable metric templates", () => {
    const model = symphonyWorkflowBuilderUiModel({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      draft: {
        open: true,
        patternId: "adversarial_debate",
        stepAnswers: {
          "pattern-scope": { choiceId: "risk-benefit" },
          "limits-and-policy": { customText: "Read-only debate with two reviewers and no connector writes." },
        },
        metricCustomizations: {
          "adversarial_debate-metric": "Score evidence, uncertainty, and unresolved dissent.",
        },
      },
    });

    expect(model.steps[0]).toMatchObject({
      id: "pattern-scope",
      choices: expect.arrayContaining([
        expect.objectContaining({ id: "risk-benefit", selected: true, recommended: true }),
      ]),
      customChoice: expect.objectContaining({ selected: false, label: "Custom" }),
    });
    expect(model.steps[1]?.customChoice).toMatchObject({
      selected: true,
      value: "Read-only debate with two reviewers and no connector writes.",
    });
    expect(model.metrics).toEqual([
      expect.objectContaining({
        id: "adversarial_debate-metric",
        kind: "rubric",
        required: true,
        customizable: true,
        value: "Score evidence, uncertainty, and unresolved dissent.",
        placeholder: "Score criteria, weights, and tie-breakers.",
      }),
    ]);
  });

  it("builds launch-card confirmation state from the selected preset and goal", () => {
    const model = symphonyWorkflowBuilderUiModel({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      draft: {
        open: true,
        patternId: "map_reduce",
        goal: "Audit the plan file against implementation evidence.",
        blocking: true,
        metricCustomizations: {
          "map_reduce-metric": "Every mapped slice reports cited implementation evidence or an explicit miss.",
        },
      },
    });

    expect(model.launchCard).toMatchObject({
      riskLabel: "High risk",
      agentLabel: "Up to 12 agents",
      tokenBudgetLabel: "Budget: 180,000 tokens",
      memoryLabel: "Local memory: 8 GiB",
      confirmationLabel: "Launch card confirmation required",
      confirmDisabled: false,
      requirementLabels: [
        "Estimated agents",
        "Token and cost budget",
        "Tool and mutation scope",
        "Checkpoint and resume behavior",
        "Approval failure handling",
      ],
      metricRequirementLabels: ["Reducer success metric"],
      missingMetricRequirementLabels: [],
      card: {
        title: "Symphony Map-Reduce",
        sourceKind: "symphony_recipe",
        blocking: true,
        riskLevel: "high",
        requireConfirmation: true,
        sourcePreview: expect.objectContaining({
          label: "Readable source preview for Symphony Map-Reduce",
          dslStatus: "readable_preview_only",
          text: expect.stringContaining("symphony_recipe map_reduce"),
        }),
      },
      policyWarningLabels: expect.arrayContaining([
        "Parent final synthesis is blocked until this workflow reaches a synthesis-safe terminal state.",
      ]),
    });
  });

  it("derives submit readiness from the live composer goal", () => {
    const model = symphonyWorkflowBuilderComposerUiModel({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      composerGoal: "Audit every implementation phase.",
      draft: {
        open: true,
        patternId: "map_reduce",
        metricCustomizations: {
          "map_reduce-metric": "Every phase has cited implementation evidence.",
        },
      },
    });

    expect(model.launchCard).toMatchObject({
      confirmDisabled: false,
      confirmationLabel: "Launch card confirmation required",
      card: {
        title: "Symphony Map-Reduce",
        sourceKind: "symphony_recipe",
      },
    });
    expect(model.launchCard?.confirmDisabledReason).toBeUndefined();
  });

  it("preserves the builder open state when merging the live composer goal", () => {
    const model = symphonyWorkflowBuilderComposerUiModel({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      composerGoal: "Audit every implementation phase.",
      draft: {
        open: false,
        patternId: "map_reduce",
        metricCustomizations: {
          "map_reduce-metric": "Every phase has cited implementation evidence.",
        },
      },
    });

    expect(model.toggle.active).toBe(false);
    expect(model.launchCard).toBeUndefined();
  });

  it("requires preset metrics or rubrics before launch-card confirmation", () => {
    const model = symphonyWorkflowBuilderUiModel({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      draft: {
        open: true,
        patternId: "imitate_and_verify",
        goal: "Draft and independently verify the implementation slice.",
      },
    });

    expect(model.launchCard).toMatchObject({
      confirmDisabled: true,
      confirmDisabledReason: "Complete required verifier criteria before confirming the launch card.",
      metricRequirementLabels: ["Verifier criteria"],
      missingMetricRequirementLabels: ["Verifier criteria"],
    });
  });

  it("keeps launch confirmation disabled until a goal exists", () => {
    const model = symphonyWorkflowBuilderUiModel({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      draft: { open: true, patternId: "ensemble", goal: "   " },
    });

    expect(model.launchCard).toMatchObject({
      confirmDisabled: true,
      confirmDisabledReason: "Describe the workflow goal before confirming the launch card.",
      missingMetricRequirementLabels: ["Selection rubric"],
    });
  });
});
