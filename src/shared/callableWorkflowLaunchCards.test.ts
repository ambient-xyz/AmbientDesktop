import { describe, expect, it } from "vitest";
import { buildCallableWorkflowLaunchCardSummary, formatCallableWorkflowLaunchCardBytes } from "./callableWorkflowLaunchCards";

describe("callable workflow launch cards", () => {
  it("builds high-risk Symphony launch cards with budget, memory, and approval policy", () => {
    const card = buildCallableWorkflowLaunchCardSummary({
      title: "Symphony Map-Reduce",
      sourceKind: "symphony_recipe",
      policy: {
        launchCardRequirementIds: ["estimated_agents", "token_cost_budget"],
        metricTemplateIds: ["map_reduce-metric"],
        maxFanout: 12,
        maxDepth: 2,
        maxTokenBudget: 180_000,
        maxLocalMemoryBytes: 8 * 1024 * 1024 * 1024,
        defaultCollapsedChildThreads: true,
      },
      input: { goal: "Inspect files", fanout: 4 },
      blocking: true,
      sourcePreview: {
        schemaVersion: "ambient-callable-workflow-source-preview-v1",
        label: "Readable source preview for Symphony Map-Reduce",
        format: "ambient_symphony_recipe_preview",
        executable: false,
        dslStatus: "readable_preview_only",
        text: "symphony_recipe map_reduce\nchild_threads: default_collapsed",
        searchTerms: ["map_reduce", "readable dsl"],
      },
    });

    expect(card).toMatchObject({
      schemaVersion: "ambient-callable-workflow-launch-card-v1",
      title: "Symphony Map-Reduce",
      sourceKind: "symphony_recipe",
      riskLevel: "high",
      estimatedAgents: 4,
      maxFanout: 12,
      maxDepth: 2,
      estimatedTokenBudget: 180_000,
      estimatedLocalMemoryBytes: 8 * 1024 * 1024 * 1024,
      defaultCollapsed: true,
      blocking: true,
      smallSliceRecommended: true,
      requireConfirmation: true,
      requirementIds: ["estimated_agents", "token_cost_budget"],
      metricTemplateIds: ["map_reduce-metric"],
      sourcePreview: expect.objectContaining({
        label: "Readable source preview for Symphony Map-Reduce",
        dslStatus: "readable_preview_only",
        text: expect.stringContaining("symphony_recipe map_reduce"),
      }),
      policyWarnings: expect.arrayContaining([
        "May fan out to as many as 12 child threads.",
        "Parent final synthesis is blocked until this workflow reaches a synthesis-safe terminal state.",
      ]),
    });
    expect(card.toolMutationScope).toContain("mutating child actions require approval");
    expect(card.approvalFailureHandling).toContain("must not synthesize it as complete");
  });

  it("treats recorded workflows as one-agent launch cards while preserving trace warning shape", () => {
    const card = buildCallableWorkflowLaunchCardSummary({
      title: "Workflow Date Night",
      sourceKind: "recorded_workflow",
      policy: {
        launchCardRequirementIds: ["recorded_playbook_confirmed"],
        metricTemplateIds: ["recorded-validation-1"],
        maxFanout: 1,
        maxDepth: 1,
        maxTokenBudget: 60_000,
        maxLocalMemoryBytes: 2 * 1024 * 1024 * 1024,
        defaultCollapsedChildThreads: true,
      },
      blocking: false,
    });

    expect(card).toMatchObject({
      riskLevel: "medium",
      estimatedAgents: 1,
      sourceKind: "recorded_workflow",
      smallSliceRecommended: false,
      requireConfirmation: false,
    });
    expect(card.toolMutationScope).toContain("Recorded playbook steps may include mutations");
  });

  it("formats memory labels without pretending estimates are exact", () => {
    expect(formatCallableWorkflowLaunchCardBytes(8 * 1024 * 1024 * 1024)).toBe("8 GiB");
    expect(formatCallableWorkflowLaunchCardBytes(512 * 1024 * 1024)).toBe("512 MiB");
  });
});
