import type { AgentToolResult, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../shared/featureFlags";
import { SYMPHONY_WORKFLOW_PATTERN_IDS } from "../shared/symphonyWorkflowRecipes";
import type { ThreadSummary, WorkflowRecordingLibraryDescription } from "../shared/types";
import {
  callableWorkflowToolName,
  recordedWorkflowToolName,
} from "./callableWorkflowRegistry";
import { callableWorkflowQueuedTaskDraftFromExecutionPlan } from "./callableWorkflowTaskQueue";
import {
  CALLABLE_WORKFLOW_CATALOG_DESCRIBE_TOOL_NAME,
  CALLABLE_WORKFLOW_CATALOG_SEARCH_TOOL_NAME,
  CALLABLE_WORKFLOW_PI_TOOLS_PHASE,
  CALLABLE_WORKFLOW_PI_TOOLS_RUNTIME,
  callableWorkflowActiveToolNamesForThread,
  createCallableWorkflowPiToolDefinitions,
} from "./callableWorkflowPiTools";

const disabledFlags = resolveAmbientFeatureFlags({ generatedAt: "2026-06-06T00:00:00.000Z" });
const enabledFlags = resolveAmbientFeatureFlags({
  startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
  generatedAt: "2026-06-06T00:00:00.000Z",
});

describe("callable workflow Pi tools", () => {
  it("exposes no parent-Pi workflow tools when ambient.subagents is off or the thread is a child", () => {
    const parent = thread("chat");
    const child = thread("subagent_child");
    const playbook = workflowPlaybook();

    expect(callableWorkflowActiveToolNamesForThread({
      thread: parent,
      featureFlagSnapshot: disabledFlags,
      recordedWorkflowPlaybooks: [playbook],
    })).toEqual([]);
    expect(callableWorkflowActiveToolNamesForThread({
      thread: child,
      featureFlagSnapshot: enabledFlags,
      recordedWorkflowPlaybooks: [playbook],
    })).toEqual([]);
    expect(createCallableWorkflowPiToolDefinitions({
      getThread: () => parent,
      getFeatureFlagSnapshot: () => disabledFlags,
      getRecordedWorkflowPlaybooks: () => [playbook],
    })).toEqual([]);
    expect(createCallableWorkflowPiToolDefinitions({
      getThread: () => child,
      getFeatureFlagSnapshot: () => enabledFlags,
      getRecordedWorkflowPlaybooks: () => [playbook],
    })).toEqual([]);
  });

  it("exposes only exact child-granted callable workflow tools and queues them against the child run", async () => {
    const child = thread("subagent_child");
    const playbook = workflowPlaybook({ id: "date-night", version: 2 });
    const childCallableWorkflowToolNames = [
      callableWorkflowToolName("map_reduce"),
      "ambient_workflow_recorded_date_night_v2",
      "ambient_workflow_symphony_pipeline_not_registered",
    ];
    const names = callableWorkflowActiveToolNamesForThread({
      thread: child,
      featureFlagSnapshot: enabledFlags,
      recordedWorkflowPlaybooks: [playbook],
      childCallableWorkflowToolNames,
    });
    const tools = createCallableWorkflowPiToolDefinitions({
      getThread: () => child,
      getFeatureFlagSnapshot: () => enabledFlags,
      getChildCallableWorkflowToolNames: () => childCallableWorkflowToolNames,
      getParentRun: () => ({ id: "child-run", assistantMessageId: "child-message" }),
      getCallerProvenance: ({ thread: callerThread, parentRun, toolName }) => ({
        kind: "subagent_child_thread",
        threadId: callerThread.id,
        runId: parentRun.id,
        messageId: parentRun.assistantMessageId,
        subagentRunId: "subagent-run",
        canonicalTaskPath: "parent/1",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        approval: {
          required: true,
          source: "child_bridge_policy",
          failureHandling: "forward to parent",
          scopeHint: "this_child_thread",
        },
        worktree: {
          required: true,
          isolated: true,
          status: "active",
          workspacePath: "/tmp/child-worktree",
          worktreePath: "/tmp/child-worktree",
        },
        nestedFanout: {
          required: toolName === "ambient_workflow_symphony_map_reduce",
          source: "child_bridge_policy",
        },
      }),
      enqueueCallableWorkflowTask: ({ executionPlan }) => ({
        ...callableWorkflowQueuedTaskDraftFromExecutionPlan(executionPlan),
        createdAt: executionPlan.createdAt,
        updatedAt: executionPlan.createdAt,
      }),
      getRecordedWorkflowPlaybooks: () => [playbook],
    });

    expect(names).toEqual([
      ...callableWorkflowCatalogDiscoveryToolNames(),
      "ambient_workflow_symphony_map_reduce",
      "ambient_workflow_recorded_date_night_v2",
    ]);
    expect(tools.map((tool) => tool.name)).toEqual(names);
    expect(tools.map((tool) => tool.name)).not.toContain("ambient_workflow_symphony_pipeline");

    const result = await executeTool(
      toolByName(tools, "ambient_workflow_symphony_map_reduce"),
      "child-map-reduce",
      symphonyMapReduceInput("Summarize child findings"),
    );

    expect(toolResultText(result)).toContain("Status: queued_not_started.");
    expect(result.details).toMatchObject({
      status: "queued_not_started",
      toolName: "ambient_workflow_symphony_map_reduce",
      workflowExecutionPlan: {
        parent: {
          threadId: "subagent_child-thread",
          runId: "child-run",
          assistantMessageId: "child-message",
        },
        callerProvenance: {
          kind: "subagent_child_thread",
          subagentRunId: "subagent-run",
          canonicalTaskPath: "parent/1",
          approval: {
            required: true,
            source: "child_bridge_policy",
            scopeHint: "this_child_thread",
          },
          worktree: {
            required: true,
            isolated: true,
            worktreePath: "/tmp/child-worktree",
          },
          nestedFanout: {
            required: true,
            source: "child_bridge_policy",
          },
        },
      },
      workflowTask: {
        parentThreadId: "subagent_child-thread",
        parentRunId: "child-run",
        parentMessageId: "child-message",
      },
    });
  });

  it("refuses stale child callable workflow tools after the child grant is revoked", async () => {
    let childCallableWorkflowToolNames = [callableWorkflowToolName("map_reduce")];
    const child = thread("subagent_child");
    const tools = createCallableWorkflowPiToolDefinitions({
      getThread: () => child,
      getFeatureFlagSnapshot: () => enabledFlags,
      getChildCallableWorkflowToolNames: () => childCallableWorkflowToolNames,
      getRecordedWorkflowPlaybooks: () => [],
      getParentRun: () => ({ id: "child-run", assistantMessageId: "child-message" }),
      enqueueCallableWorkflowTask: ({ executionPlan }) => ({
        ...callableWorkflowQueuedTaskDraftFromExecutionPlan(executionPlan),
        createdAt: executionPlan.createdAt,
        updatedAt: executionPlan.createdAt,
      }),
    });
    const tool = toolByName(tools, callableWorkflowToolName("map_reduce"));

    childCallableWorkflowToolNames = [];

    await expect(executeTool(tool, "stale-child-grant", symphonyMapReduceInput("Summarize notes")))
      .rejects
      .toThrow(/not granted to this child session/);
  });

  it("creates parent-visible Symphony and recorded workflow tools with run-plan execution contracts", async () => {
    const parent = thread("chat");
    const playbook = workflowPlaybook({ id: "date-night", version: 2 });
    const names = callableWorkflowActiveToolNamesForThread({
      thread: parent,
      featureFlagSnapshot: enabledFlags,
      recordedWorkflowPlaybooks: [playbook],
    });
    const tools = createCallableWorkflowPiToolDefinitions({
      getThread: () => parent,
      getFeatureFlagSnapshot: () => enabledFlags,
      getParentRun: () => ({ id: "parent-run", assistantMessageId: "assistant-message" }),
      enqueueCallableWorkflowTask: ({ executionPlan }) => ({
        ...callableWorkflowQueuedTaskDraftFromExecutionPlan(executionPlan),
        createdAt: executionPlan.createdAt,
        updatedAt: executionPlan.createdAt,
      }),
      getRecordedWorkflowPlaybooks: () => [playbook],
    });
    const updates: string[] = [];
    const mapReduce = toolByName(tools, callableWorkflowToolName("map_reduce"));
    const recorded = toolByName(tools, recordedWorkflowToolName(playbook));

    expect(names).toEqual([
      ...callableWorkflowCatalogDiscoveryToolNames(),
      ...SYMPHONY_WORKFLOW_PATTERN_IDS.map(callableWorkflowToolName),
      "ambient_workflow_recorded_date_night_v2",
    ]);
    expect(tools.map((tool) => tool.name)).toEqual(names);
    expect(mapReduce.promptGuidelines?.join("\n")).toContain("starts Ambient's workflow runner");
    expect(mapReduce.promptGuidelines?.join("\n")).toContain("provide metricCriteria entries");
    expect(mapReduce.parameters).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["goal", "metricCriteria"],
    });
    expect(recorded.parameters).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["goal"],
    });

    const result = await executeTool(mapReduce, "map-reduce", symphonyMapReduceInput("Summarize release notes"), (update) => {
      updates.push(toolResultText(update));
    });

    expect(updates).toEqual(["Preparing callable workflow background task for Symphony Map-Reduce."]);
    expect(toolResultText(result)).toContain("Status: queued_not_started.");
    expect(toolResultText(result)).toContain("Workflow task: callable-workflow:");
    expect(toolResultText(result)).toContain("Launch card: high risk, up to 12 agents, up to 180,000 tokens.");
    expect(toolResultText(result)).toContain("Policy warnings: May fan out to as many as 12 child threads.");
    expect(toolResultText(result)).toContain("Ambient queued a visible workflow background-task handoff");
    expect(result.details).toMatchObject({
      runtime: CALLABLE_WORKFLOW_PI_TOOLS_RUNTIME,
      phase: CALLABLE_WORKFLOW_PI_TOOLS_PHASE,
      status: "queued_not_started",
      runnerBridgeStatus: "not_configured",
      toolName: "ambient_workflow_symphony_map_reduce",
      inputRepaired: false,
      launchCard: {
        schemaVersion: "ambient-callable-workflow-launch-card-v1",
        title: "Symphony Map-Reduce",
        sourceKind: "symphony_recipe",
        riskLevel: "high",
        estimatedAgents: 12,
        estimatedTokenBudget: 180_000,
        blocking: false,
        requireConfirmation: true,
      },
      workflowRunPlan: {
        schemaVersion: "ambient-callable-workflow-run-plan-v1",
        input: {
          goal: "Summarize release notes",
          metricCriteria: [
            {
              templateId: "map_reduce-metric",
              value: "Every mapped item has reducer evidence.",
            },
          ],
        },
        blocking: false,
        launchCard: expect.objectContaining({
          riskLevel: "high",
          estimatedAgents: 12,
        }),
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
      },
      workflowExecutionPlan: {
        schemaVersion: "ambient-callable-workflow-execution-plan-v1",
        status: "queued_not_started",
        parent: {
          threadId: "chat-thread",
          runId: "parent-run",
          assistantMessageId: "assistant-message",
        },
        visibleTask: {
          kind: "callable_workflow_background_task",
          title: "Symphony Map-Reduce",
          statusLabel: "Queued",
          defaultCollapsed: true,
          blocking: false,
          progressVisible: true,
          tokenCostTracking: true,
          pauseResumeCancel: true,
          cancelHandle: expect.stringMatching(/^callable-workflow-cancel:callable-workflow:[a-f0-9]{20}$/),
          launchCard: expect.objectContaining({
            title: "Symphony Map-Reduce",
            requireConfirmation: true,
          }),
        },
        runnerHandoff: {
          target: "workflowCompilerService",
          deferredReason: "callable_workflow_runner_not_connected",
        },
      },
      workflowTask: {
        id: expect.stringMatching(/^callable-workflow:[a-f0-9]{20}$/),
        status: "queued",
        parentThreadId: "chat-thread",
        parentRunId: "parent-run",
        parentMessageId: "assistant-message",
        title: "Symphony Map-Reduce",
        blocking: false,
        defaultCollapsed: true,
        launchCard: expect.objectContaining({
          riskLevel: "high",
        }),
        runnerTarget: "workflowCompilerService",
        runnerDeferredReason: "callable_workflow_runner_not_connected",
      },
    });
  });

  it("exposes read-only callable workflow catalog search for parent and child scopes", async () => {
    const parent = thread("chat");
    const child = thread("subagent_child");
    const playbook = workflowPlaybook({ id: "date-night", version: 2 });
    const parentTools = createCallableWorkflowPiToolDefinitions({
      getThread: () => parent,
      getFeatureFlagSnapshot: () => enabledFlags,
      getRecordedWorkflowPlaybooks: () => [playbook],
    });
    const childTools = createCallableWorkflowPiToolDefinitions({
      getThread: () => child,
      getFeatureFlagSnapshot: () => enabledFlags,
      getChildCallableWorkflowToolNames: () => [callableWorkflowToolName("map_reduce")],
      getRecordedWorkflowPlaybooks: () => [playbook],
    });

    const parentSearch = await executeTool(
      toolByName(parentTools, CALLABLE_WORKFLOW_CATALOG_SEARCH_TOOL_NAME),
      "catalog-parent",
      { query: "debate", limit: 2 },
    );
    const childSearch = await executeTool(
      toolByName(childTools, CALLABLE_WORKFLOW_CATALOG_SEARCH_TOOL_NAME),
      "catalog-child",
      { includeUnavailable: true },
    );

    expect(toolResultText(parentSearch)).toContain("Callable workflow catalog search returned");
    expect(parentSearch.details).toMatchObject({
      status: "catalog_ready",
      toolName: CALLABLE_WORKFLOW_CATALOG_SEARCH_TOOL_NAME,
      catalogSearch: {
        schemaVersion: "ambient-callable-workflow-catalog-search-v1",
        query: "debate",
        scope: "parent_pi_visible",
        resultCount: 1,
        results: [
          expect.objectContaining({
            toolName: "ambient_workflow_symphony_adversarial_debate",
            readinessLabels: expect.arrayContaining([
              "Parent Pi visible",
              "Metric/rubric criteria required",
            ]),
          }),
        ],
      },
    });
    expect(childSearch.details).toMatchObject({
      status: "catalog_ready",
      catalogSearch: {
        scope: "child_granted",
        includeUnavailable: false,
        searchedEntryCount: 1,
        resultCount: 1,
        results: [
          expect.objectContaining({
            toolName: "ambient_workflow_symphony_map_reduce",
            nextActionLabel: expect.stringContaining("ambient_workflow_symphony_map_reduce"),
          }),
        ],
        guidance: expect.arrayContaining([
          "Child results list only exact workflow tools granted by launch-time child role policy.",
        ]),
      },
    });
  });

  it("describes callable workflow catalog entries without launching, scoped for parent and child threads", async () => {
    const parent = thread("chat");
    const child = thread("subagent_child");
    const parentTools = createCallableWorkflowPiToolDefinitions({
      getThread: () => parent,
      getFeatureFlagSnapshot: () => enabledFlags,
    });
    const childTools = createCallableWorkflowPiToolDefinitions({
      getThread: () => child,
      getFeatureFlagSnapshot: () => enabledFlags,
      getChildCallableWorkflowToolNames: () => [callableWorkflowToolName("map_reduce")],
    });

    const parentDescription = await executeTool(
      toolByName(parentTools, CALLABLE_WORKFLOW_CATALOG_DESCRIBE_TOOL_NAME),
      "catalog-describe-parent",
      { toolName: callableWorkflowToolName("map_reduce") },
    );
    const childDescription = await executeTool(
      toolByName(childTools, CALLABLE_WORKFLOW_CATALOG_DESCRIBE_TOOL_NAME),
      "catalog-describe-child",
      { query: "map reduce", includeUnavailable: true },
    );
    const deniedChildDescription = await executeTool(
      toolByName(childTools, CALLABLE_WORKFLOW_CATALOG_DESCRIBE_TOOL_NAME),
      "catalog-describe-child-denied",
      { toolName: callableWorkflowToolName("pipeline") },
    );

    expect(toolResultText(parentDescription)).toContain("Callable workflow catalog description for Symphony Map-Reduce");
    expect(parentDescription.details).toMatchObject({
      status: "catalog_described",
      toolName: CALLABLE_WORKFLOW_CATALOG_DESCRIBE_TOOL_NAME,
      catalogDescription: {
        schemaVersion: "ambient-callable-workflow-catalog-describe-v1",
        status: "described",
        scope: "parent_pi_visible",
        description: {
          toolName: callableWorkflowToolName("map_reduce"),
          inputSchema: {
            required: ["goal", "metricCriteria"],
            properties: expect.objectContaining({
              goal: expect.objectContaining({ type: "string" }),
              metricCriteria: expect.objectContaining({ type: "array" }),
            }),
          },
          policySnapshot: expect.objectContaining({
            maxFanout: 12,
            maxDepth: 2,
            childRolePolicyRequired: true,
          }),
          sourceContext: expect.objectContaining({
            kind: "symphony_recipe",
            recipeId: "map_reduce",
            metricTemplates: expect.arrayContaining([
              expect.objectContaining({ id: "map_reduce-metric" }),
            ]),
          }),
          sourcePreview: expect.objectContaining({
            text: expect.stringContaining("symphony_recipe map_reduce"),
          }),
        },
      },
    });
    expect(childDescription.details).toMatchObject({
      status: "catalog_described",
      catalogDescription: {
        scope: "child_granted",
        includeUnavailable: false,
        description: {
          toolName: callableWorkflowToolName("map_reduce"),
        },
        guidance: expect.arrayContaining([
          "This child can describe only exact callable workflow tools granted by its role policy.",
        ]),
      },
    });
    expect((deniedChildDescription as AgentToolResult<any> & { isError?: boolean }).isError).toBe(true);
    expect(deniedChildDescription.details).toMatchObject({
      status: "catalog_entry_not_found",
      catalogDescription: {
        status: "not_found",
        scope: "child_granted",
        guidance: expect.arrayContaining([
          "Child descriptions are limited to exact workflow tools granted by launch-time child role policy.",
        ]),
      },
    });
  });

  it("starts the configured runner bridge after queueing the persistent workflow task", async () => {
    const parent = thread("chat");
    const startedTaskIds: string[] = [];
    const tools = createCallableWorkflowPiToolDefinitions({
      getThread: () => parent,
      getFeatureFlagSnapshot: () => enabledFlags,
      getParentRun: () => ({ id: "parent-run", assistantMessageId: "assistant-message" }),
      enqueueCallableWorkflowTask: ({ executionPlan }) => ({
        ...callableWorkflowQueuedTaskDraftFromExecutionPlan(executionPlan),
        createdAt: executionPlan.createdAt,
        updatedAt: executionPlan.createdAt,
      }),
      startCallableWorkflowTask: ({ taskId, workflowTask }) => {
        startedTaskIds.push(taskId);
        expect(taskId).toBe(workflowTask.id);
      },
    });
    const tool = toolByName(tools, callableWorkflowToolName("map_reduce"));

    const result = await executeTool(tool!, "map-reduce-start", symphonyMapReduceInput("Summarize release notes"));

    expect(startedTaskIds).toEqual([expect.stringMatching(/^callable-workflow:[a-f0-9]{20}$/)]);
    expect(toolResultText(result)).toContain("started the workflow runner bridge");
    expect(result.details).toMatchObject({
      status: "queued_not_started",
      runnerBridgeStatus: "started",
      workflowTask: {
        status: "queued",
      },
    });
  });

  it("refuses launchable workflow calls without an active parent run", async () => {
    const parent = thread("chat");
    const tools = createCallableWorkflowPiToolDefinitions({
      getThread: () => parent,
      getFeatureFlagSnapshot: () => enabledFlags,
    });
    const tool = toolByName(tools, callableWorkflowToolName("map_reduce"));

    await expect(executeTool(tool, "missing-parent-run", symphonyMapReduceInput("Summarize notes")))
      .rejects
      .toThrow(/active parent run/);
  });

  it("refuses launchable workflow calls without a persistent task queue", async () => {
    const parent = thread("chat");
    const tools = createCallableWorkflowPiToolDefinitions({
      getThread: () => parent,
      getFeatureFlagSnapshot: () => enabledFlags,
      getParentRun: () => ({ id: "parent-run", assistantMessageId: "assistant-message" }),
    });
    const tool = toolByName(tools, callableWorkflowToolName("map_reduce"));

    await expect(executeTool(tool, "missing-queue", symphonyMapReduceInput("Summarize notes")))
      .rejects
      .toThrow(/persistent workflow task queue/);
  });

  it("refuses stale workflow execution after the feature flag is disabled", async () => {
    let flags = enabledFlags;
    const parent = thread("chat");
    const tools = createCallableWorkflowPiToolDefinitions({
      getThread: () => parent,
      getFeatureFlagSnapshot: () => flags,
    });
    const tool = toolByName(tools, callableWorkflowToolName("map_reduce"));

    flags = disabledFlags;

    await expect(executeTool(tool, "stale", { goal: "Summarize notes" })).rejects.toThrow(/unavailable or disabled/);
  });

  it("refuses stale callable workflow catalog search after the feature flag is disabled", async () => {
    let flags = enabledFlags;
    const parent = thread("chat");
    const tools = createCallableWorkflowPiToolDefinitions({
      getThread: () => parent,
      getFeatureFlagSnapshot: () => flags,
    });
    const tool = toolByName(tools, CALLABLE_WORKFLOW_CATALOG_SEARCH_TOOL_NAME);

    flags = disabledFlags;

    const result = await executeTool(tool, "stale-catalog", {});

    expect((result as AgentToolResult<any> & { isError?: boolean }).isError).toBe(true);
    expect(result.details).toMatchObject({
      status: "catalog_unavailable",
      reason: "ambient.subagents disabled",
    });
  });

  it("refuses stale callable workflow catalog describe after the feature flag is disabled", async () => {
    let flags = enabledFlags;
    const parent = thread("chat");
    const tools = createCallableWorkflowPiToolDefinitions({
      getThread: () => parent,
      getFeatureFlagSnapshot: () => flags,
    });
    const tool = toolByName(tools, CALLABLE_WORKFLOW_CATALOG_DESCRIBE_TOOL_NAME);

    flags = disabledFlags;

    const result = await executeTool(tool, "stale-catalog-describe", {
      toolName: callableWorkflowToolName("map_reduce"),
    });

    expect((result as AgentToolResult<any> & { isError?: boolean }).isError).toBe(true);
    expect(result.details).toMatchObject({
      status: "catalog_unavailable",
      reason: "ambient.subagents disabled",
    });
  });

  it("returns schema validation errors instead of executing irreparable workflow input", async () => {
    const parent = thread("chat");
    const tools = createCallableWorkflowPiToolDefinitions({
      getThread: () => parent,
      getFeatureFlagSnapshot: () => enabledFlags,
    });
    const tool = toolByName(tools, callableWorkflowToolName("map_reduce"));

    const result = await executeTool(tool, "invalid", { scope: "docs" });

    expect((result as AgentToolResult<any> & { isError?: boolean }).isError).toBe(true);
    expect(toolResultText(result)).toContain("failed validation");
    expect(result.details).toMatchObject({
      status: "validation_failed",
      validation: {
        valid: false,
        errors: expect.arrayContaining([
          "ambient_workflow_symphony_map_reduce input is missing required field: goal",
          "ambient_workflow_symphony_map_reduce input is missing required field: metricCriteria",
        ]),
      },
    });
  });

  it("rejects direct Symphony workflow calls without required metric criteria", async () => {
    const parent = thread("chat");
    const tools = createCallableWorkflowPiToolDefinitions({
      getThread: () => parent,
      getFeatureFlagSnapshot: () => enabledFlags,
    });
    const tool = toolByName(tools, callableWorkflowToolName("map_reduce"));

    const result = await executeTool(tool, "missing-criteria", { goal: "Summarize notes", metricCriteria: [] });

    expect((result as AgentToolResult<any> & { isError?: boolean }).isError).toBe(true);
    expect(result.details).toMatchObject({
      status: "validation_failed",
      validation: {
        valid: false,
        errors: expect.arrayContaining([
          "ambient_workflow_symphony_map_reduce input is missing required Symphony metric criteria: Reducer success metric",
        ]),
      },
    });
  });
});

function thread(kind: ThreadSummary["kind"]): Pick<ThreadSummary, "id" | "kind"> {
  return { id: `${kind}-thread`, kind };
}

function callableWorkflowCatalogDiscoveryToolNames(): string[] {
  return [
    CALLABLE_WORKFLOW_CATALOG_SEARCH_TOOL_NAME,
    CALLABLE_WORKFLOW_CATALOG_DESCRIBE_TOOL_NAME,
  ];
}

function executeTool(
  tool: ToolDefinition<any, any, any>,
  toolCallId: string,
  params: unknown,
  onUpdate?: Parameters<ToolDefinition<any, any, any>["execute"]>[3],
): Promise<AgentToolResult<any>> {
  return tool.execute(toolCallId, params, undefined, onUpdate, {} as any);
}

function toolResultText(result: AgentToolResult<any>): string {
  return result.content
    .map((item) => item.type === "text" ? item.text : "")
    .filter(Boolean)
    .join("\n");
}

function toolByName(
  tools: ToolDefinition<any, any, any>[],
  name: string,
): ToolDefinition<any, any, any> {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing callable workflow tool: ${name}`);
  return tool;
}

function symphonyMapReduceInput(goal: string): Record<string, unknown> {
  return {
    goal,
    metricCriteria: [
      {
        templateId: "map_reduce-metric",
        value: "Every mapped item has reducer evidence.",
      },
    ],
  };
}

function workflowPlaybook(input: {
  id?: string;
  version?: number;
  playbook?: Partial<NonNullable<WorkflowRecordingLibraryDescription["playbook"]>>;
} = {}): WorkflowRecordingLibraryDescription {
  const id = input.id ?? "recorded-workflow";
  return {
    id,
    title: "Recorded Workflow",
    version: input.version ?? 1,
    enabled: true,
    savedAt: "2026-06-06T18:00:00.000Z",
    threadId: `${id}-thread`,
    manifestPath: `/tmp/${id}/manifest.json`,
    markdownPath: `/tmp/${id}/workflow.md`,
    sidecarPath: `/tmp/${id}/workflow.json`,
    transcriptPath: `/tmp/${id}/transcript.jsonl`,
    markdownPreview: "# Recorded Workflow\n\nPreview.",
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
  };
}
