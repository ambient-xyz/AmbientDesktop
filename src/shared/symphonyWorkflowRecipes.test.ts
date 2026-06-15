import { describe, expect, it } from "vitest";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG } from "./featureFlags";
import {
  getSymphonyWorkflowRecipePreset,
  listSymphonyWorkflowRecipePresets,
  missingRequiredSymphonyMetricTemplateLabels,
  requiredSymphonyMetricTemplateErrorMessage,
  SYMPHONY_WORKFLOW_PATTERN_IDS,
  SYMPHONY_WORKFLOW_RECIPE_SCHEMA_VERSION,
  symphonyMetricTemplateKindForPattern,
} from "./symphonyWorkflowRecipes";

describe("Symphony workflow recipe presets", () => {
  it("defines all six planned Symphony patterns behind ambient.subagents", () => {
    const presets = listSymphonyWorkflowRecipePresets();

    expect(presets.map((preset) => preset.id)).toEqual([...SYMPHONY_WORKFLOW_PATTERN_IDS]);
    expect(presets.map((preset) => preset.label)).toEqual([
      "Map-Reduce",
      "Adversarial Debate",
      "Imitate and Verify",
      "Pipeline",
      "Ensemble",
      "Self-Healing Loop",
    ]);
    for (const preset of presets) {
      expect(preset.schemaVersion).toBe(SYMPHONY_WORKFLOW_RECIPE_SCHEMA_VERSION);
      expect(preset.requiredFeatureFlag).toBe(AMBIENT_SUBAGENTS_FEATURE_FLAG);
      expect(preset.defaultCollapsedChildThreads).toBe(true);
      expect(preset.diagramSvg).toContain("<svg");
      expect(preset.defaultRoleGraph).toMatchObject({
        schemaVersion: "ambient-subagent-pattern-role-graph-v1",
        patternId: preset.id,
        nodes: expect.any(Array),
        edges: expect.any(Array),
      });
      expect(preset.defaultRoleGraph.nodes.every((node) => node.roleOverlayIds.length > 0)).toBe(true);
      expect(preset.sourcePreview).toMatchObject({
        schemaVersion: "ambient-callable-workflow-source-preview-v1",
        format: "ambient_symphony_recipe_preview",
        executable: false,
        dslStatus: "readable_preview_only",
      });
      expect(preset.sourcePreview.text).toContain(`symphony_recipe ${preset.id}`);
      expect(preset.sourcePreview.text).toContain("dsl_status: readable_preview_only");
      expect(preset.sourcePreview.text).toContain("role_graph:");
      expect(preset.sourcePreview.text).toContain("role_graph_edges:");
      expect(preset.sourcePreview.searchTerms).toEqual(expect.arrayContaining([
        preset.id,
        preset.label,
        "symphony recipe",
        "callable workflow",
      ]));
      expect(preset.defaultRoles.length).toBeGreaterThan(0);
    }
  });

  it("requires conversational Custom choices and metric or rubric templates for every pattern", () => {
    const presets = listSymphonyWorkflowRecipePresets();

    for (const preset of presets) {
      expect(preset.builderSteps.length).toBeGreaterThanOrEqual(2);
      expect(preset.builderSteps.every((step) => step.allowCustom === true)).toBe(true);
      expect(preset.builderSteps.every((step) => step.choices.some((choice) => choice.recommended))).toBe(true);
      expect(preset.metricTemplates).toEqual([
        expect.objectContaining({
          required: true,
          customizable: true,
        }),
      ]);
    }
    expect(symphonyMetricTemplateKindForPattern("map_reduce")).toBe("objective_metric");
    expect(symphonyMetricTemplateKindForPattern("pipeline")).toBe("objective_metric");
    expect(symphonyMetricTemplateKindForPattern("self_healing_loop")).toBe("objective_metric");
    expect(symphonyMetricTemplateKindForPattern("adversarial_debate")).toBe("rubric");
    expect(symphonyMetricTemplateKindForPattern("ensemble")).toBe("rubric");
    expect(symphonyMetricTemplateKindForPattern("imitate_and_verify")).toBe("verifier_criteria");
  });

  it("reports missing required metric or rubric customizations from the shared contract", () => {
    const missing = missingRequiredSymphonyMetricTemplateLabels({
      patternId: "imitate_and_verify",
      metricCustomizations: {
        "imitate_and_verify-metric": "   ",
      },
    });

    expect(missing).toEqual(["Verifier criteria"]);
    expect(requiredSymphonyMetricTemplateErrorMessage({
      missingLabels: missing,
      actionLabel: "launching the Symphony workflow",
    })).toBe("Complete required verifier criteria before launching the Symphony workflow.");
    expect(missingRequiredSymphonyMetricTemplateLabels({
      patternId: "imitate_and_verify",
      metricCustomizations: {
        "imitate_and_verify-metric": "Run the generated tests and inspect the verification result.",
      },
    })).toEqual([]);
  });

  it("keeps launch cards, callable workflow tools, and recorder policy aligned with the plan", () => {
    const preset = getSymphonyWorkflowRecipePreset("self_healing_loop");

    expect(preset.launchCardRequirements.map((item) => item.id)).toEqual([
      "estimated_agents",
      "token_cost_budget",
      "tool_mutation_scope",
      "checkpoint_resume",
      "approval_failure_handling",
    ]);
    expect(preset.hardLimits).toMatchObject({
      maxFanout: expect.any(Number),
      maxDepth: expect.any(Number),
      maxTokenBudget: expect.any(Number),
      maxLocalMemoryBytes: expect.any(Number),
      allowSmallSliceRun: true,
    });
    expect(preset.callableToolPolicy).toMatchObject({
      parentVisibility: "parent_pi_visible_by_default",
      childVisibility: "child_role_policy_required",
      validationRepair: "json_schema_then_repair",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["goal"],
      },
    });
    expect(preset.recorderPolicy).toEqual({
      compactInvocationByDefault: true,
      fullTraceArtifact: true,
    });
  });

  it("returns defensive copies so later UI customization cannot mutate defaults", () => {
    const first = getSymphonyWorkflowRecipePreset("map_reduce");
    first.builderSteps[0]?.choices.push({
      id: "test-mutation",
      label: "Test",
      description: "Should not mutate the shared preset.",
    });
    first.sourcePreview.searchTerms.push("mutated");
    first.defaultRoleGraph.nodes[0]?.overlayLabels.push("mutated overlay");

    expect(getSymphonyWorkflowRecipePreset("map_reduce").builderSteps[0]?.choices).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "test-mutation" })]),
    );
    expect(getSymphonyWorkflowRecipePreset("map_reduce").sourcePreview.searchTerms).not.toContain("mutated");
    expect(getSymphonyWorkflowRecipePreset("map_reduce").defaultRoleGraph.nodes[0]?.overlayLabels).not.toContain("mutated overlay");
  });
});
