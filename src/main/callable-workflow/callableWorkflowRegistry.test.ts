import { describe, expect, it } from "vitest";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { SYMPHONY_WORKFLOW_PATTERN_IDS } from "../../shared/symphonyWorkflowRecipes";
import { buildDefaultSymphonyPatternRoleGraph } from "../../shared/subagentPatternGraph";
import type { WorkflowRecordingLibraryDescription } from "../../shared/workflowTypes";
import {
  buildCallableWorkflowRegistry,
  buildCallableWorkflowRunPlan,
  callableWorkflowToolName,
  childVisibleCallableWorkflowTools,
  compileRecordedWorkflowPlaybookToCallableWorkflowTool,
  compileSymphonyRecipeToCallableWorkflowTool,
  describeCallableWorkflowCatalogEntry,
  parentPiVisibleCallableWorkflowTools,
  repairCallableWorkflowToolInput,
  recordedWorkflowToolName,
  searchCallableWorkflowCatalog,
  validateCallableWorkflowToolInput,
} from "./callableWorkflowRegistry";

describe("callable workflow registry", () => {
  it("hides all Symphony workflow tools when ambient.subagents is off", () => {
    const registry = buildCallableWorkflowRegistry({
      featureFlagSnapshot: resolveAmbientFeatureFlags({
        settings: { subagents: false },
        generatedAt: "2026-06-06T18:00:00.000Z",
      }),
    });
    const diagnosticRegistry = buildCallableWorkflowRegistry({
      featureFlagSnapshot: registry.featureFlagSnapshot,
      includeHiddenWhenDisabled: true,
    });

    expect(registry).toMatchObject({
      schemaVersion: "ambient-callable-workflow-registry-v1",
      featureFlagEnabled: false,
      hiddenToolCount: SYMPHONY_WORKFLOW_PATTERN_IDS.length,
      tools: [],
      catalogStatus: {
        schemaVersion: "ambient-callable-workflow-catalog-status-v1",
        featureFlagEnabled: false,
        callableToolCount: SYMPHONY_WORKFLOW_PATTERN_IDS.length,
        visibleParentToolCount: 0,
        hiddenFeatureDisabledCount: SYMPHONY_WORKFLOW_PATTERN_IDS.length,
        childRolePolicyRequiredCount: 0,
        excludedRecordedWorkflowCount: 0,
        symphonyRecipeCount: SYMPHONY_WORKFLOW_PATTERN_IDS.length,
        recordedWorkflowCount: 0,
        entries: expect.arrayContaining([
          expect.objectContaining({
            id: "symphony:map_reduce",
            status: "hidden_feature_disabled",
            parentPiVisible: false,
            childAccessStatus: "not_available",
            exclusionReasons: ["ambient.subagents"],
          }),
        ]),
      },
    });
    expect(parentPiVisibleCallableWorkflowTools(registry)).toEqual([]);
    expect(childVisibleCallableWorkflowTools(registry, {
      roleId: "worker",
      allowCallableWorkflowTools: true,
      nestedFanoutLimit: 1,
    })).toEqual([]);
    expect(diagnosticRegistry.tools).toHaveLength(SYMPHONY_WORKFLOW_PATTERN_IDS.length);
    expect(diagnosticRegistry.tools.every((tool) => tool.visibility === "hidden_feature_disabled")).toBe(true);
  });

  it("compiles Symphony presets into parent-visible callable workflow tools when enabled", () => {
    const registry = buildCallableWorkflowRegistry({
      featureFlagSnapshot: resolveAmbientFeatureFlags({
        settings: { subagents: true },
        generatedAt: "2026-06-06T18:01:00.000Z",
      }),
    });
    const parentTools = parentPiVisibleCallableWorkflowTools(registry);

    expect(parentTools.map((tool) => tool.name)).toEqual(
      SYMPHONY_WORKFLOW_PATTERN_IDS.map(callableWorkflowToolName),
    );
    expect(parentTools[0]).toMatchObject({
      schemaVersion: "ambient-callable-workflow-tool-v1",
      source: {
        kind: "symphony_recipe",
        recipeId: "map_reduce",
        recipeSchemaVersion: "ambient-symphony-workflow-recipe-v1",
      },
      sourceContext: {
        kind: "symphony_recipe",
        sourcePreview: expect.objectContaining({
          label: "Readable source preview for Symphony Map-Reduce",
          format: "ambient_symphony_recipe_preview",
          executable: false,
          dslStatus: "readable_preview_only",
          text: expect.stringContaining("symphony_recipe map_reduce"),
          searchTerms: expect.arrayContaining(["map_reduce", "symphony recipe"]),
        }),
      },
      requiredFeatureFlag: "ambient.subagents",
      visibility: "parent_pi_visible",
      validationRepair: "json_schema_then_repair",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["goal", "metricCriteria"],
        properties: expect.objectContaining({
          goal: expect.objectContaining({ type: "string" }),
          scope: expect.objectContaining({ type: "string" }),
          blocking: expect.objectContaining({ type: "boolean" }),
          builderSelections: expect.objectContaining({ type: "array" }),
          metricCriteria: expect.objectContaining({ type: "array" }),
        }),
      },
      execution: {
        mode: "visible_background_task",
        defaultBlocking: false,
        progressVisible: true,
        tokenCostTracking: true,
        pauseResumeCancel: true,
      },
      policySnapshot: {
        parentPiVisible: true,
        childAccess: "blocked_by_default",
        childRolePolicyRequired: true,
        nestedFanoutLimitRequired: true,
        defaultCollapsedChildThreads: true,
        launchCardRequirementIds: [
          "estimated_agents",
          "token_cost_budget",
          "tool_mutation_scope",
          "checkpoint_resume",
          "approval_failure_handling",
        ],
        recorderCompactInvocationByDefault: true,
        fullTraceArtifact: true,
      },
    });
  });

  it("compiles confirmed recorded playbooks into gated callable workflow tools", () => {
    const playbook = workflowPlaybook({
      id: "date-night",
      title: "Date Night Theatre Finder",
      playbook: {
        intent: "Find current theatre options for a date night.",
        inputs: ["City or neighborhood.", "Date range.", "Budget or accessibility constraints."],
        validation: ["Confirm sources are current.", "Preserve ticket links."],
        outputShape: ["Ranked options", "Citations"],
      },
    });
    const disabled = buildCallableWorkflowRegistry({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: false } }),
      recordedWorkflowPlaybooks: [playbook],
    });
    const diagnosticDisabled = buildCallableWorkflowRegistry({
      featureFlagSnapshot: disabled.featureFlagSnapshot,
      recordedWorkflowPlaybooks: [playbook],
      includeHiddenWhenDisabled: true,
    });
    const enabled = buildCallableWorkflowRegistry({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      recordedWorkflowPlaybooks: [
        playbook,
        workflowPlaybook({ id: "draft", playbook: { status: "draft" } }),
        workflowPlaybook({ id: "disabled", enabled: false }),
        workflowPlaybook({ id: "archived", archivedAt: "2026-06-06T18:02:00.000Z" }),
      ],
    });
    const recorded = parentPiVisibleCallableWorkflowTools(enabled).find((tool) => tool.source.kind === "recorded_workflow")!;

    expect(disabled.tools).toEqual([]);
    expect(disabled.hiddenToolCount).toBe(SYMPHONY_WORKFLOW_PATTERN_IDS.length + 1);
    expect(diagnosticDisabled.tools.find((tool) => tool.source.kind === "recorded_workflow")).toMatchObject({
      name: "ambient_workflow_recorded_date_night_v3",
      visibility: "hidden_feature_disabled",
      policySnapshot: {
        parentPiVisible: false,
      },
    });
    expect(recorded).toMatchObject({
      schemaVersion: "ambient-callable-workflow-tool-v1",
      id: "recorded:date-night:v3",
      name: "ambient_workflow_recorded_date_night_v3",
      label: "Workflow Date Night Theatre Finder",
      source: {
        kind: "recorded_workflow",
        playbookId: "date-night",
        playbookVersion: 3,
        playbookStatus: "confirmed",
      },
      sourceContext: {
        kind: "recorded_workflow",
        playbookId: "date-night",
        playbookVersion: 3,
        playbookSource: "user_edit",
        intent: "Find current theatre options for a date night.",
        inputs: ["City or neighborhood.", "Date range.", "Budget or accessibility constraints."],
        validation: ["Confirm sources are current.", "Preserve ticket links."],
        outputShape: ["Ranked options", "Citations"],
        recorderCompactInvocationByDefault: true,
        fullTraceArtifact: true,
      },
      requiredFeatureFlag: "ambient.subagents",
      visibility: "parent_pi_visible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["goal"],
        properties: expect.objectContaining({
          goal: expect.objectContaining({ type: "string" }),
          context: expect.objectContaining({ type: "string" }),
          input1: expect.objectContaining({ description: "City or neighborhood." }),
          input2: expect.objectContaining({ description: "Date range." }),
          input3: expect.objectContaining({ description: "Budget or accessibility constraints." }),
          blocking: expect.objectContaining({ type: "boolean" }),
        }),
      },
      policySnapshot: {
        parentPiVisible: true,
        childAccess: "blocked_by_default",
        launchCardRequirementIds: [
          "recorded_playbook_confirmed",
          "input_schema_confirmed",
          "trace_diagnostics_artifact",
        ],
        metricTemplateIds: ["recorded-validation-1", "recorded-validation-2"],
        recorderCompactInvocationByDefault: true,
        fullTraceArtifact: true,
      },
    });
    expect(parentPiVisibleCallableWorkflowTools(enabled).filter((tool) => tool.source.kind === "recorded_workflow")).toHaveLength(1);
  });

  it("builds callable workflow catalog status with child-gated tools and excluded recorded playbook reasons", () => {
    const playbook = workflowPlaybook({
      id: "date-night",
      title: "Date Night Theatre Finder",
      playbook: {
        intent: "Find current theatre options for a date night.",
        inputs: ["City or neighborhood.", "Date range."],
        validation: ["Confirm sources are current."],
      },
    });
    const registry = buildCallableWorkflowRegistry({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      recordedWorkflowPlaybooks: [
        playbook,
        workflowPlaybook({ id: "draft", playbook: { status: "draft" } }),
        workflowPlaybook({ id: "disabled", enabled: false }),
        workflowPlaybook({ id: "archived", archivedAt: "2026-06-06T18:02:00.000Z" }),
      ],
    });

    expect(registry.catalogStatus).toMatchObject({
      schemaVersion: "ambient-callable-workflow-catalog-status-v1",
      featureFlagEnabled: true,
      callableToolCount: SYMPHONY_WORKFLOW_PATTERN_IDS.length + 1,
      visibleParentToolCount: SYMPHONY_WORKFLOW_PATTERN_IDS.length + 1,
      hiddenFeatureDisabledCount: 0,
      childRolePolicyRequiredCount: SYMPHONY_WORKFLOW_PATTERN_IDS.length + 1,
      excludedRecordedWorkflowCount: 3,
      symphonyRecipeCount: SYMPHONY_WORKFLOW_PATTERN_IDS.length,
      recordedWorkflowCount: 4,
    });
    expect(registry.catalogStatus.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "symphony:map_reduce",
        sourceKind: "symphony_recipe",
        sourceId: "map_reduce",
        status: "parent_pi_visible",
        toolName: "ambient_workflow_symphony_map_reduce",
        parentPiVisible: true,
        childAccessStatus: "role_policy_required",
        nestedFanoutLimitRequired: true,
        executionMode: "visible_background_task",
        inputSchemaRequired: ["goal", "metricCriteria"],
        launchCardRequirementIds: expect.arrayContaining(["estimated_agents"]),
        metricTemplateIds: ["map_reduce-metric"],
        sourcePreview: expect.objectContaining({
          label: "Readable source preview for Symphony Map-Reduce",
          dslStatus: "readable_preview_only",
          text: expect.stringContaining("symphony_recipe map_reduce"),
        }),
        sourceSearchTerms: expect.arrayContaining(["map_reduce", "readable dsl"]),
        exclusionReasons: [],
      }),
      expect.objectContaining({
        id: "recorded:date-night:v3",
        sourceKind: "recorded_workflow",
        sourceId: "date-night",
        sourceVersion: 3,
        status: "parent_pi_visible",
        toolName: "ambient_workflow_recorded_date_night_v3",
        parentPiVisible: true,
        childAccessStatus: "role_policy_required",
        inputSchemaRequired: ["goal"],
        launchCardRequirementIds: [
          "recorded_playbook_confirmed",
          "input_schema_confirmed",
          "trace_diagnostics_artifact",
        ],
        metricTemplateIds: ["recorded-validation-1"],
        sourcePreview: expect.objectContaining({
          format: "recorded_workflow_markdown_preview",
          dslStatus: "recorded_invocation_preview",
          text: expect.stringContaining("recorded_workflow date-night"),
        }),
        sourceSearchTerms: expect.arrayContaining(["date-night", "Date Night Theatre Finder"]),
      }),
      expect.objectContaining({
        id: "recorded:draft:v3",
        status: "excluded_not_callable",
        parentPiVisible: false,
        childAccessStatus: "not_available",
        exclusionReasons: ["recorded_playbook_draft_not_confirmed"],
      }),
      expect.objectContaining({
        id: "recorded:disabled:v3",
        status: "excluded_not_callable",
        exclusionReasons: ["recorded_workflow_disabled"],
      }),
      expect.objectContaining({
        id: "recorded:archived:v3",
        status: "excluded_not_callable",
        exclusionReasons: ["recorded_workflow_archived"],
      }),
    ]));
  });

  it("searches callable workflow catalog entries with readiness labels and child-granted scope", () => {
    const playbook = workflowPlaybook({
      id: "date-night",
      title: "Date Night Theatre Finder",
      playbook: {
        intent: "Find current theatre options for a date night.",
        inputs: ["City or neighborhood.", "Date range."],
        validation: ["Confirm sources are current."],
      },
    });
    const registry = buildCallableWorkflowRegistry({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      recordedWorkflowPlaybooks: [
        playbook,
        workflowPlaybook({ id: "draft", playbook: { status: "draft" } }),
      ],
    });

    const parentSearch = searchCallableWorkflowCatalog({
      catalogStatus: registry.catalogStatus,
      query: "theatre tickets",
      includeUnavailable: true,
      limit: 4,
    });
    const childSearch = searchCallableWorkflowCatalog({
      catalogStatus: registry.catalogStatus,
      query: "map reduce",
      scope: "child_granted",
      childGrantedToolNames: [callableWorkflowToolName("map_reduce")],
    });

    expect(parentSearch).toMatchObject({
      schemaVersion: "ambient-callable-workflow-catalog-search-v1",
      query: "theatre tickets",
      scope: "parent_pi_visible",
      includeUnavailable: true,
      totalEntryCount: SYMPHONY_WORKFLOW_PATTERN_IDS.length + 2,
      resultCount: 1,
      results: [
        expect.objectContaining({
          id: "recorded:date-night:v3",
          label: "Workflow Date Night Theatre Finder",
          sourceKind: "recorded_workflow",
          status: "parent_pi_visible",
          toolName: "ambient_workflow_recorded_date_night_v3",
          readinessLabels: expect.arrayContaining([
            "Parent Pi visible",
            "Child access requires exact role policy",
            "Recorded playbook confirmed",
            "Readable source preview available",
          ]),
          nextActionLabel: expect.stringContaining("ambient_workflow_recorded_date_night_v3"),
          sourcePreviewSnippet: expect.stringContaining("Date Night Theatre Finder"),
          searchText: expect.stringContaining("theatre options"),
        }),
      ],
    });
    expect(childSearch).toMatchObject({
      scope: "child_granted",
      searchedEntryCount: 1,
      resultCount: 1,
      guidance: expect.arrayContaining([
        "Child results list only exact workflow tools granted by launch-time child role policy.",
      ]),
      results: [
        expect.objectContaining({
          id: "symphony:map_reduce",
          toolName: "ambient_workflow_symphony_map_reduce",
          readinessLabels: expect.arrayContaining([
            "Parent Pi visible",
            "Nested fanout budget required",
            "Metric/rubric criteria required",
          ]),
        }),
      ],
    });
    expect(childSearch.results.map((result) => result.toolName)).toEqual([
      "ambient_workflow_symphony_map_reduce",
    ]);
  });

  it("describes one callable workflow catalog entry with full launch and source context", () => {
    const playbook = workflowPlaybook({
      id: "date-night",
      title: "Date Night Theatre Finder",
      playbook: {
        intent: "Find current theatre options for a date night.",
        inputs: ["City or neighborhood.", "Date range."],
        validation: ["Confirm sources are current."],
      },
    });
    const registry = buildCallableWorkflowRegistry({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      recordedWorkflowPlaybooks: [
        playbook,
        workflowPlaybook({ id: "draft", playbook: { status: "draft" } }),
      ],
    });

    const parentDescription = describeCallableWorkflowCatalogEntry({
      registry,
      toolName: callableWorkflowToolName("map_reduce"),
    });
    const childDescription = describeCallableWorkflowCatalogEntry({
      registry,
      query: "map reduce",
      scope: "child_granted",
      childGrantedToolNames: [callableWorkflowToolName("map_reduce")],
      includeUnavailable: true,
    });
    const unavailableDescription = describeCallableWorkflowCatalogEntry({
      registry,
      sourceId: "draft",
      includeUnavailable: true,
    });

    expect(parentDescription).toMatchObject({
      schemaVersion: "ambient-callable-workflow-catalog-describe-v1",
      status: "described",
      toolName: callableWorkflowToolName("map_reduce"),
      scope: "parent_pi_visible",
      description: {
        id: "symphony:map_reduce",
        toolName: callableWorkflowToolName("map_reduce"),
        defaultBlocking: false,
        inputSchema: {
          required: ["goal", "metricCriteria"],
          properties: expect.objectContaining({
            goal: expect.objectContaining({ type: "string" }),
            metricCriteria: expect.objectContaining({ type: "array" }),
          }),
        },
        execution: {
          mode: "visible_background_task",
          progressVisible: true,
          tokenCostTracking: true,
          pauseResumeCancel: true,
        },
        policySnapshot: expect.objectContaining({
          parentPiVisible: true,
          childRolePolicyRequired: true,
          maxFanout: 12,
          maxDepth: 2,
          maxTokenBudget: 180_000,
        }),
        sourceContext: expect.objectContaining({
          kind: "symphony_recipe",
          recipeId: "map_reduce",
          builderSteps: expect.arrayContaining([
            expect.objectContaining({ id: "pattern-scope" }),
          ]),
          metricTemplates: expect.arrayContaining([
            expect.objectContaining({ id: "map_reduce-metric" }),
          ]),
        }),
        sourcePreview: expect.objectContaining({
          dslStatus: "readable_preview_only",
          text: expect.stringContaining("symphony_recipe map_reduce"),
        }),
      },
      guidance: expect.arrayContaining([
        "This catalog description is read-only and does not queue or start a workflow task.",
      ]),
    });
    expect(childDescription).toMatchObject({
      status: "described",
      scope: "child_granted",
      includeUnavailable: true,
      description: {
        toolName: callableWorkflowToolName("map_reduce"),
      },
      guidance: expect.arrayContaining([
        "This child can describe only exact callable workflow tools granted by its role policy.",
      ]),
    });
    expect(unavailableDescription).toMatchObject({
      status: "described",
      sourceId: "draft",
      description: {
        id: "recorded:draft:v3",
        status: "excluded_not_callable",
        exclusionReasons: ["recorded_playbook_draft_not_confirmed"],
      },
      guidance: expect.arrayContaining([
        "Unavailable catalog entries are diagnostic context only and must not be called.",
      ]),
    });
    expect(unavailableDescription.description).not.toHaveProperty("inputSchema");
    expect(unavailableDescription.description).not.toHaveProperty("policySnapshot");
  });

  it("keeps child callable workflow tools blocked unless role policy and nested fanout limit allow them", () => {
    const registry = buildCallableWorkflowRegistry({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
    });

    expect(childVisibleCallableWorkflowTools(registry)).toEqual([]);
    expect(childVisibleCallableWorkflowTools(registry, {
      roleId: "worker",
      allowCallableWorkflowTools: false,
      nestedFanoutLimit: 1,
    })).toEqual([]);
    expect(childVisibleCallableWorkflowTools(registry, {
      roleId: "worker",
      allowCallableWorkflowTools: true,
      nestedFanoutLimit: 0,
    })).toEqual([]);

    const [tool] = childVisibleCallableWorkflowTools(registry, {
      roleId: "worker",
      allowCallableWorkflowTools: true,
      allowedToolNames: [callableWorkflowToolName("self_healing_loop")],
      nestedFanoutLimit: 1,
    });
    expect(tool).toMatchObject({
      name: "ambient_workflow_symphony_self_healing_loop",
      visibility: "child_role_policy_required",
      policySnapshot: {
        childRolePolicyRequired: true,
        nestedFanoutLimitRequired: true,
      },
    });
  });

  it("validates and deterministically repairs callable workflow input before building a run plan", () => {
    const registry = buildCallableWorkflowRegistry({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
    });
    const tool = parentPiVisibleCallableWorkflowTools(registry).find((candidate) =>
      candidate.name === "ambient_workflow_symphony_map_reduce"
    )!;

    expect(validateCallableWorkflowToolInput(tool, { goal: "Summarize notes", unexpected: true })).toMatchObject({
      valid: false,
      errors: expect.arrayContaining(["ambient_workflow_symphony_map_reduce input has unexpected field: unexpected"]),
    });
    expect(validateCallableWorkflowToolInput(tool, { scope: "docs" })).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "ambient_workflow_symphony_map_reduce input is missing required field: goal",
        "ambient_workflow_symphony_map_reduce input is missing required field: metricCriteria",
      ]),
    });
    expect(validateCallableWorkflowToolInput(tool, { goal: "Summarize notes", metricCriteria: [] })).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "ambient_workflow_symphony_map_reduce input is missing required Symphony metric criteria: Reducer success metric",
      ]),
    });

    const repaired = repairCallableWorkflowToolInput(tool, "  Summarize all notes  ");
    expect(repaired).toMatchObject({
      repaired: false,
      validation: {
        valid: false,
        errors: expect.arrayContaining([
          "ambient_workflow_symphony_map_reduce input is missing required field: metricCriteria",
        ]),
      },
    });
    const runPlan = buildCallableWorkflowRunPlan(tool, {
      goal: "Summarize notes",
      scope: "docs",
      blocking: true,
      builderSelections: [
        {
          stepId: "pattern-scope",
          selectedChoiceId: "files",
          selectedChoiceLabel: "Files",
          selectedChoiceDescription: "Split across selected workspace files or search results.",
          resolvedText: "Files: Split across selected workspace files or search results.",
        },
      ],
      metricCriteria: [
        {
          templateId: "map_reduce-metric",
          value: "Every mapped document has a reducer citation.",
        },
      ],
    });
    expect(runPlan).toMatchObject({
      schemaVersion: "ambient-callable-workflow-run-plan-v1",
      toolName: "ambient_workflow_symphony_map_reduce",
      blocking: true,
      sourceContext: {
        kind: "symphony_recipe",
        recipeId: "map_reduce",
        builderSteps: expect.arrayContaining([
          expect.objectContaining({
            id: "pattern-scope",
            question: expect.stringContaining("collection"),
          }),
        ]),
        metricTemplates: expect.arrayContaining([
          expect.objectContaining({ id: "map_reduce-metric" }),
        ]),
        invocationCustomization: {
          schemaVersion: "ambient-callable-workflow-symphony-invocation-v1",
          stepSelections: [
            expect.objectContaining({
              stepId: "pattern-scope",
              selectedChoiceId: "files",
              resolvedText: "Files: Split across selected workspace files or search results.",
            }),
          ],
          metricCriteria: [
            expect.objectContaining({
              templateId: "map_reduce-metric",
              label: "Reducer success metric",
              value: "Every mapped document has a reducer citation.",
            }),
          ],
        },
        sourcePreview: expect.objectContaining({
          label: "Readable source preview for Symphony Map-Reduce",
          text: expect.stringContaining("symphony_recipe map_reduce"),
        }),
      },
      execution: {
        mode: "visible_background_task",
        progressVisible: true,
        tokenCostTracking: true,
        pauseResumeCancel: true,
      },
      policySnapshot: {
        parentPiVisible: true,
        defaultCollapsedChildThreads: true,
      },
      launchCard: {
        schemaVersion: "ambient-callable-workflow-launch-card-v1",
        title: "Symphony Map-Reduce",
        sourceKind: "symphony_recipe",
        riskLevel: "high",
        estimatedAgents: 12,
        maxFanout: 12,
        maxDepth: 2,
        estimatedTokenBudget: 180_000,
        tokenBudgetEstimated: true,
        estimatedLocalMemoryBytes: 8 * 1024 * 1024 * 1024,
        localMemoryEstimated: true,
        defaultCollapsed: true,
        blocking: true,
        smallSliceRecommended: true,
        requireConfirmation: true,
        requirementIds: [
          "estimated_agents",
          "token_cost_budget",
          "tool_mutation_scope",
          "checkpoint_resume",
          "approval_failure_handling",
        ],
        metricTemplateIds: ["map_reduce-metric"],
        sourcePreview: expect.objectContaining({
          label: "Readable source preview for Symphony Map-Reduce",
          dslStatus: "readable_preview_only",
        }),
        policyWarnings: expect.arrayContaining([
          "May fan out to as many as 12 child threads.",
          "Parent final synthesis is blocked until this workflow reaches a synthesis-safe terminal state.",
        ]),
      },
    });
  });

  it("keeps compiled descriptors immutable from caller mutations", () => {
    const registry = buildCallableWorkflowRegistry({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
    });
    const first = parentPiVisibleCallableWorkflowTools(registry)[0]!;
    first.inputSchema.required.push("mutated");
    first.policySnapshot.launchCardRequirementIds.push("mutated");

    expect(parentPiVisibleCallableWorkflowTools(registry)[0]?.inputSchema.required).toEqual(["goal", "metricCriteria"]);
    expect(parentPiVisibleCallableWorkflowTools(registry)[0]?.policySnapshot.launchCardRequirementIds).not.toContain("mutated");
  });

  it("can compile one Symphony recipe without registry state for focused launch cards", () => {
    const registry = buildCallableWorkflowRegistry({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
    });
    const mapReduce = parentPiVisibleCallableWorkflowTools(registry)[0]!;
    const direct = compileSymphonyRecipeToCallableWorkflowTool({
      schemaVersion: "ambient-symphony-workflow-recipe-v1",
      id: "map_reduce",
      label: "Map-Reduce",
      summary: "Focused direct compile.",
      requiredFeatureFlag: "ambient.subagents",
      defaultCollapsedChildThreads: true,
      diagramSvg: "<svg></svg>",
      sourcePreview: {
        schemaVersion: "ambient-callable-workflow-source-preview-v1",
        label: "Readable source preview for Symphony Map-Reduce",
        format: "ambient_symphony_recipe_preview",
        executable: false,
        dslStatus: "readable_preview_only",
        text: "symphony_recipe map_reduce\nsummary: Focused direct compile.",
        searchTerms: ["map_reduce", "direct compile"],
      },
      defaultRoles: ["explorer"],
      defaultRoleGraph: buildDefaultSymphonyPatternRoleGraph("map_reduce"),
      builderSteps: [],
      metricTemplates: [{ id: "metric", kind: "objective_metric", label: "Metric", prompt: "Metric?", required: true, customizable: true }],
      launchCardRequirements: [{ id: "estimated_agents", label: "Estimated agents", required: true }],
      hardLimits: { maxFanout: 2, maxDepth: 1, maxTokenBudget: 1000, maxLocalMemoryBytes: 100, allowSmallSliceRun: true },
      callableToolPolicy: {
        parentVisibility: "parent_pi_visible_by_default",
        childVisibility: "child_role_policy_required",
        inputSchema: mapReduce.inputSchema,
        validationRepair: "json_schema_then_repair",
      },
      recorderPolicy: { compactInvocationByDefault: true, fullTraceArtifact: true },
    }, true);

    expect(direct).toMatchObject({
      name: "ambient_workflow_symphony_map_reduce",
      visibility: "parent_pi_visible",
      policySnapshot: {
        maxFanout: 2,
        maxDepth: 1,
        maxTokenBudget: 1000,
        maxLocalMemoryBytes: 100,
      },
    });
  });

  it("compiles one confirmed recorded playbook for compact recorder invocation previews", () => {
    const playbook = workflowPlaybook({ id: "Quarterly Review!", version: 7 });
    const tool = compileRecordedWorkflowPlaybookToCallableWorkflowTool(playbook, true);

    expect(recordedWorkflowToolName(playbook)).toBe("ambient_workflow_recorded_quarterly_review_v7");
    expect(tool).toMatchObject({
      name: "ambient_workflow_recorded_quarterly_review_v7",
      visibility: "parent_pi_visible",
      source: {
        kind: "recorded_workflow",
        playbookStatus: "confirmed",
      },
      sourceContext: {
        kind: "recorded_workflow",
        playbookId: "Quarterly Review!",
        playbookVersion: 7,
        callableInvocation: {
          schemaVersion: "ambient-workflow-recording-callable-invocation-v1",
          mode: "compact_callable_invocation",
          invocationArtifact: "./workflow-invocation.json",
          diagnosticsTraceArtifact: "./diagnostics/full-trace.jsonl",
          inputKeys: ["goal", "blocking", "input_1"],
          inputSchemaHintKeys: ["goal", "blocking", "input_1"],
        },
      },
    });
    expect(() =>
      compileRecordedWorkflowPlaybookToCallableWorkflowTool(workflowPlaybook({ playbook: { status: "draft" } }), true)
    ).toThrow(/not callable/i);
  });
});

function workflowPlaybook(input: {
  id?: string;
  title?: string;
  version?: number;
  enabled?: boolean;
  archivedAt?: string;
  playbook?: Partial<NonNullable<WorkflowRecordingLibraryDescription["playbook"]>>;
} = {}): WorkflowRecordingLibraryDescription {
  const id = input.id ?? "recorded-workflow";
  return {
    id,
    title: input.title ?? "Recorded Workflow",
    version: input.version ?? 3,
    enabled: input.enabled ?? true,
    savedAt: "2026-06-06T18:00:00.000Z",
    ...(input.archivedAt ? { archivedAt: input.archivedAt } : {}),
    threadId: `${id}-thread`,
    manifestPath: `/tmp/${id}/manifest.json`,
    markdownPath: `/tmp/${id}/workflow.md`,
    sidecarPath: `/tmp/${id}/workflow.json`,
    transcriptPath: `/tmp/${id}/transcript.jsonl`,
    markdownPreview: `# ${input.title ?? "Recorded Workflow"}\n\nCompact invocation preview.`,
    summary: input.playbook?.intent ?? "Run a recorded workflow playbook.",
    toolNames: [],
    outputShape: input.playbook?.outputShape ?? [],
    versions: [],
    playbook: {
      status: input.playbook?.status ?? "confirmed",
      source: "user_edit",
      generatedAt: "2026-06-06T17:50:00.000Z",
      confirmedAt: "2026-06-06T17:55:00.000Z",
      sourceCapturedAt: "2026-06-06T17:40:00.000Z",
      intent: input.playbook?.intent ?? "Run the reusable recorded workflow.",
      inputs: input.playbook?.inputs ?? ["Workflow target."],
      successfulExamples: [],
      doNot: [],
      validation: input.playbook?.validation ?? ["Confirm the output is current."],
      outputShape: input.playbook?.outputShape ?? ["A concise result."],
      evidenceSummary: {
        messageCount: 3,
        toolResultCount: 1,
        successfulToolResultCount: 1,
        failedToolResultCount: 0,
        skippedToolResultCount: 0,
        permissionBlockedToolResultCount: 0,
        redactionCount: 0,
      },
      ...input.playbook,
    },
    callableInvocation: {
      schemaVersion: "ambient-workflow-recording-callable-invocation-v1",
      mode: "compact_callable_invocation",
      source: "workflow_recorder",
      workflowId: id,
      workflowVersion: input.version ?? 3,
      title: input.title ?? "Recorded Workflow",
      enabled: input.enabled ?? true,
      savedAt: "2026-06-06T18:00:00.000Z",
      input: {
        goal: input.playbook?.intent ?? "Run the reusable recorded workflow.",
        blocking: false,
        input_1: input.playbook?.inputs?.[0] ?? "Workflow target.",
      },
      inputSchemaHints: {
        required: ["goal"],
        properties: {
          goal: "Concrete goal for this recorded playbook invocation.",
          blocking: "Whether parent final synthesis must wait for this workflow run.",
          input_1: input.playbook?.inputs?.[0] ?? "Workflow target.",
        },
      },
      callableWorkflow: {
        defaultInvocation: "compact",
        invocation: "./workflow-invocation.json",
        diagnosticsTrace: "./diagnostics/full-trace.jsonl",
        recorderCompactInvocationByDefault: true,
        fullTraceArtifact: true,
      },
    },
  };
}
