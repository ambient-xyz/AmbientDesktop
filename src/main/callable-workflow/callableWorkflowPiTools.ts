import type { AgentToolResult, ToolDefinition } from "@mariozechner/pi-coding-agent";
import {
  isAmbientSubagentsEnabled,
  type AmbientFeatureFlagSnapshot,
} from "../../shared/featureFlags";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { CallableWorkflowTaskSummary, WorkflowRecordingLibraryDescription } from "../../shared/workflowTypes";
import {
  buildCallableWorkflowRegistry,
  buildCallableWorkflowRunPlan,
  describeCallableWorkflowCatalogEntry,
  parentPiVisibleCallableWorkflowTools,
  repairCallableWorkflowToolInput,
  searchCallableWorkflowCatalog,
  type CallableWorkflowRegistry,
  type CallableWorkflowToolDescriptor,
} from "./callableWorkflowRegistry";
import {
  buildCallableWorkflowExecutionPlan,
  type CallableWorkflowCallerProvenance,
  type CallableWorkflowExecutionPlan,
} from "./callableWorkflowExecutionPlan";

export const CALLABLE_WORKFLOW_PI_TOOLS_RUNTIME = "ambient-callable-workflow-pi-tools" as const;
export const CALLABLE_WORKFLOW_PI_TOOLS_PHASE = "phase-4-callable-workflow-discovery" as const;
export const CALLABLE_WORKFLOW_CATALOG_SEARCH_TOOL_NAME = "ambient_callable_workflow_catalog_search" as const;
export const CALLABLE_WORKFLOW_CATALOG_DESCRIBE_TOOL_NAME = "ambient_callable_workflow_catalog_describe" as const;

export interface CallableWorkflowPiToolContext {
  thread: Pick<ThreadSummary, "id" | "kind">;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  recordedWorkflowPlaybooks?: readonly WorkflowRecordingLibraryDescription[];
  childCallableWorkflowToolNames?: readonly string[];
}

export interface CreateCallableWorkflowPiToolDefinitionsOptions {
  getThread: () => Pick<ThreadSummary, "id" | "kind">;
  getFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot;
  getChildCallableWorkflowToolNames?: () => readonly string[];
  getParentRun?: () => { id: string; assistantMessageId?: string } | undefined;
  getCallerProvenance?: (input: {
    thread: Pick<ThreadSummary, "id" | "kind">;
    parentRun: { id: string; assistantMessageId?: string };
    toolName: string;
    workflowRunPlan: ReturnType<typeof buildCallableWorkflowRunPlan>;
  }) => CallableWorkflowCallerProvenance | undefined;
  enqueueCallableWorkflowTask?: (input: { executionPlan: CallableWorkflowExecutionPlan }) => CallableWorkflowTaskSummary;
  startCallableWorkflowTask?: (input: {
    taskId: string;
    executionPlan: CallableWorkflowExecutionPlan;
    workflowTask: CallableWorkflowTaskSummary;
  }) => Promise<void> | void;
  getRecordedWorkflowPlaybooks?: () => readonly WorkflowRecordingLibraryDescription[];
}

export function callableWorkflowActiveToolNamesForThread(input: CallableWorkflowPiToolContext): string[] {
  const descriptors = callableWorkflowPiVisibleToolDescriptors(input);
  if (descriptors.length === 0) return [];
  return [
    CALLABLE_WORKFLOW_CATALOG_SEARCH_TOOL_NAME,
    CALLABLE_WORKFLOW_CATALOG_DESCRIBE_TOOL_NAME,
    ...descriptors.map((tool) => tool.name),
  ];
}

export function createCallableWorkflowPiToolDefinitions(
  options: CreateCallableWorkflowPiToolDefinitionsOptions,
): ToolDefinition<any, any, any>[] {
  const descriptors = callableWorkflowPiVisibleToolDescriptors({
    thread: options.getThread(),
    featureFlagSnapshot: options.getFeatureFlagSnapshot(),
    recordedWorkflowPlaybooks: options.getRecordedWorkflowPlaybooks?.() ?? [],
    childCallableWorkflowToolNames: options.getChildCallableWorkflowToolNames?.() ?? [],
  });
  if (descriptors.length === 0) return [];
  return [
    callableWorkflowCatalogSearchToolDefinition(options),
    callableWorkflowCatalogDescribeToolDefinition(options),
    ...descriptors.map((descriptor) =>
      callableWorkflowPiToolDefinition(descriptor, options)
    ),
  ];
}

function callableWorkflowPiVisibleToolDescriptors(
  input: CallableWorkflowPiToolContext,
): CallableWorkflowToolDescriptor[] {
  const registry = buildCallableWorkflowRegistry({
    featureFlagSnapshot: input.featureFlagSnapshot,
    recordedWorkflowPlaybooks: [...(input.recordedWorkflowPlaybooks ?? [])],
  });
  const parentVisibleTools = parentPiVisibleCallableWorkflowTools(registry);
  if (input.thread.kind !== "subagent_child") return parentVisibleTools;
  const childToolNames = new Set(input.childCallableWorkflowToolNames ?? []);
  if (!childToolNames.size) return [];
  return parentVisibleTools.filter((tool) => childToolNames.has(tool.name));
}

function callableWorkflowPiToolDefinition(
  descriptor: CallableWorkflowToolDescriptor,
  options: CreateCallableWorkflowPiToolDefinitionsOptions,
): ToolDefinition<any, any, any> {
  return {
    name: descriptor.name,
    label: descriptor.label,
    description: [
      descriptor.description,
      "Queues a typed visible workflow background task behind ambient.subagents and starts Ambient's workflow runner when a runner bridge is available.",
    ].join(" "),
    promptSnippet:
      `${descriptor.name}: Queue a typed visible workflow background task for ${descriptor.label}. ` +
      "Set blocking=true when the parent must wait for the workflow before synthesizing.",
    promptGuidelines: [
      "This callable workflow tool is parent-Pi visible only while ambient.subagents is enabled.",
      "Child sessions receive only exact callable workflow tools granted by launch-time child bridge policy and registered in the current callable workflow catalog.",
      "Calling this tool validates and repairs JSON input, persists a queued workflow task, and starts Ambient's workflow runner when this runtime provides a runner bridge.",
      "Do not claim the workflow completed unless a later workflow runner returns a result artifact.",
      "Use the returned launchCard, token budget, risk, approval handling, and blocking flag when explaining what still needs to run.",
      ...callableWorkflowMetricCriteriaPromptGuidelines(descriptor),
    ],
    parameters: descriptor.inputSchema as any,
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate) => {
      const freshDescriptor = resolveFreshCallableWorkflowDescriptor(descriptor.name, options);
      const repaired = repairCallableWorkflowToolInput(freshDescriptor, params);
      if (!repaired.validation.valid || !repaired.value) {
        return callableWorkflowToolResult(
          [
            `Callable workflow input for ${freshDescriptor.name} failed validation.`,
            ...repaired.validation.errors.map((error) => `- ${error}`),
          ].join("\n"),
          {
            status: "validation_failed",
            toolName: freshDescriptor.name,
            toolId: freshDescriptor.id,
            validation: repaired.validation,
          },
          true,
        );
      }

      onUpdate?.({
        content: [{ type: "text", text: `Preparing callable workflow background task for ${freshDescriptor.label}.` }],
        details: {
          runtime: CALLABLE_WORKFLOW_PI_TOOLS_RUNTIME,
          phase: CALLABLE_WORKFLOW_PI_TOOLS_PHASE,
          toolName: freshDescriptor.name,
          status: "queueing",
        },
      });

      const runPlan = buildCallableWorkflowRunPlan(freshDescriptor, repaired.value);
      const thread = options.getThread();
      const parentRun = options.getParentRun?.();
      if (!parentRun) {
        throw new Error("Cannot launch a callable workflow without an active parent run.");
      }
      const executionPlan = buildCallableWorkflowExecutionPlan({
        descriptor: freshDescriptor,
        runPlan,
        parent: {
          threadId: thread.id,
          runId: parentRun.id,
          assistantMessageId: parentRun.assistantMessageId,
        },
        toolCallId: _toolCallId,
        callerProvenance: options.getCallerProvenance?.({
          thread,
          parentRun,
          toolName: freshDescriptor.name,
          workflowRunPlan: runPlan,
        }),
      });
      const workflowTask = options.enqueueCallableWorkflowTask?.({ executionPlan });
      if (!workflowTask) {
        throw new Error("Cannot launch a callable workflow without a persistent workflow task queue.");
      }
      const runnerBridgeStatus = startCallableWorkflowTaskIfAvailable(options, {
        taskId: workflowTask.id,
        executionPlan,
        workflowTask,
      });
      return callableWorkflowToolResult(
        callableWorkflowRunPlanText(
          freshDescriptor,
          executionPlan.visibleTask.blocking,
          workflowTask.id,
          runnerBridgeStatus,
          runPlan.launchCard,
        ),
        {
          status: executionPlan.status,
          runnerBridgeStatus,
          toolName: freshDescriptor.name,
          toolId: freshDescriptor.id,
          source: freshDescriptor.source,
          workflowRunPlan: runPlan,
          workflowExecutionPlan: executionPlan,
          workflowTask,
          inputRepaired: repaired.repaired,
          repairNotes: repaired.repairNotes,
          launchCard: runPlan.launchCard,
          launchCardRequirementIds: freshDescriptor.policySnapshot.launchCardRequirementIds,
          metricTemplateIds: freshDescriptor.policySnapshot.metricTemplateIds,
          maxTokenBudget: freshDescriptor.policySnapshot.maxTokenBudget,
        },
      );
    },
  };
}

function callableWorkflowCatalogSearchToolDefinition(
  options: CreateCallableWorkflowPiToolDefinitionsOptions,
): ToolDefinition<any, any, any> {
  return {
    name: CALLABLE_WORKFLOW_CATALOG_SEARCH_TOOL_NAME,
    label: "Callable workflow catalog search",
    description:
      "Search Ambient's feature-gated callable workflow catalog without launching anything. " +
      "Use this before selecting a Symphony or recorded workflow tool when the right workflow shape is unclear.",
    promptSnippet:
      `${CALLABLE_WORKFLOW_CATALOG_SEARCH_TOOL_NAME}: Search the callable workflow catalog for matching Symphony recipes or recorded workflow tools. ` +
      "This is read-only and does not queue a workflow task.",
    promptGuidelines: [
      "This catalog search tool is visible only while ambient.subagents is enabled and at least one callable workflow tool is visible for the current thread.",
      "Use it for progressive discovery before choosing a workflow tool; do not treat a search result as a completed workflow run.",
      "Parent searches return parent-visible tools by default. Child searches return only exact workflow tools granted by launch-time child role policy.",
      "Unavailable entries are diagnostic context only when explicitly requested, and must not be called.",
    ],
    parameters: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        query: {
          type: "string",
          description: "Optional search text such as map reduce, verify, debate, recorded workflow title, or required output shape.",
        },
        limit: {
          type: "number",
          description: "Maximum results to return, from 1 to 25. Defaults to 8.",
        },
        includeUnavailable: {
          type: "boolean",
          description: "Parent-only diagnostic option to include hidden or excluded entries with reasons. Defaults to false.",
        },
      },
    } as any,
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const featureFlagSnapshot = options.getFeatureFlagSnapshot();
      if (!isAmbientSubagentsEnabled(featureFlagSnapshot)) {
        return callableWorkflowToolResult(
          "Callable workflow catalog search is unavailable because ambient.subagents is disabled.",
          {
            status: "catalog_unavailable",
            toolName: CALLABLE_WORKFLOW_CATALOG_SEARCH_TOOL_NAME,
            reason: "ambient.subagents disabled",
          },
          true,
        );
      }

      const thread = options.getThread();
      const childCallableWorkflowToolNames = options.getChildCallableWorkflowToolNames?.() ?? [];
      const scope = thread.kind === "subagent_child" ? "child_granted" : "parent_pi_visible";
      const includeUnavailable = thread.kind === "subagent_child" ? false : Boolean(recordParam(params, "includeUnavailable"));
      const registry = buildRegistryFromOptions(options);
      const search = searchCallableWorkflowCatalog({
        catalogStatus: registry.catalogStatus,
        query: stringParam(params, "query"),
        limit: numberParam(params, "limit"),
        scope,
        childGrantedToolNames: childCallableWorkflowToolNames,
        includeUnavailable,
      });

      return callableWorkflowToolResult(
        callableWorkflowCatalogSearchText(search),
        {
          status: "catalog_ready",
          toolName: CALLABLE_WORKFLOW_CATALOG_SEARCH_TOOL_NAME,
          catalogSearch: search,
        },
      );
    },
  };
}

function callableWorkflowCatalogDescribeToolDefinition(
  options: CreateCallableWorkflowPiToolDefinitionsOptions,
): ToolDefinition<any, any, any> {
  return {
    name: CALLABLE_WORKFLOW_CATALOG_DESCRIBE_TOOL_NAME,
    label: "Callable workflow catalog describe",
    description:
      "Describe one callable workflow catalog entry without launching it. " +
      "Use this after catalog search to inspect the full input schema, launch-card policy, metrics, and source preview.",
    promptSnippet:
      `${CALLABLE_WORKFLOW_CATALOG_DESCRIBE_TOOL_NAME}: Describe a selected callable workflow catalog entry by toolName, entryId, sourceId, or query. ` +
      "This is read-only and does not queue a workflow task.",
    promptGuidelines: [
      "This describe tool is visible only while ambient.subagents is enabled and at least one callable workflow tool is visible for the current thread.",
      "Use it after catalog search and before launch when you need the input schema, metric templates, launch-card requirements, or readable source preview.",
      "Child descriptions are limited to exact workflow tools granted by launch-time child role policy.",
      "Do not treat a catalog description as a completed workflow run.",
    ],
    parameters: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        toolName: {
          type: "string",
          description: "Exact callable workflow tool name from catalog search, such as ambient_workflow_symphony_map_reduce.",
        },
        entryId: {
          type: "string",
          description: "Exact catalog entry id from search, such as symphony:map_reduce or recorded:date-night:v3.",
        },
        sourceId: {
          type: "string",
          description: "Recipe or recorded workflow source id when a tool name is not yet known.",
        },
        query: {
          type: "string",
          description: "Optional fallback search text used to pick the highest-scoring in-scope entry.",
        },
        includeUnavailable: {
          type: "boolean",
          description: "Parent-only diagnostic option to describe hidden or excluded entries. Defaults to false.",
        },
      },
    } as any,
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const featureFlagSnapshot = options.getFeatureFlagSnapshot();
      if (!isAmbientSubagentsEnabled(featureFlagSnapshot)) {
        return callableWorkflowToolResult(
          "Callable workflow catalog describe is unavailable because ambient.subagents is disabled.",
          {
            status: "catalog_unavailable",
            toolName: CALLABLE_WORKFLOW_CATALOG_DESCRIBE_TOOL_NAME,
            reason: "ambient.subagents disabled",
          },
          true,
        );
      }

      const thread = options.getThread();
      const childCallableWorkflowToolNames = options.getChildCallableWorkflowToolNames?.() ?? [];
      const scope = thread.kind === "subagent_child" ? "child_granted" : "parent_pi_visible";
      const includeUnavailable = thread.kind === "subagent_child" ? false : Boolean(recordParam(params, "includeUnavailable"));
      const description = describeCallableWorkflowCatalogEntry({
        registry: buildRegistryFromOptions(options),
        entryId: stringParam(params, "entryId"),
        toolName: stringParam(params, "toolName"),
        sourceId: stringParam(params, "sourceId"),
        query: stringParam(params, "query"),
        scope,
        childGrantedToolNames: childCallableWorkflowToolNames,
        includeUnavailable,
      });

      return callableWorkflowToolResult(
        callableWorkflowCatalogDescribeText(description),
        {
          status: description.status === "described" ? "catalog_described" : "catalog_entry_not_found",
          toolName: CALLABLE_WORKFLOW_CATALOG_DESCRIBE_TOOL_NAME,
          catalogDescription: description,
        },
        description.status !== "described",
      );
    },
  };
}

function callableWorkflowMetricCriteriaPromptGuidelines(descriptor: CallableWorkflowToolDescriptor): string[] {
  if (descriptor.sourceContext.kind !== "symphony_recipe" || descriptor.sourceContext.metricTemplates.length === 0) return [];
  const criteria = descriptor.sourceContext.metricTemplates
    .map((template) => `${template.id} (${template.label})`)
    .join(", ");
  return [
    `For Symphony workflow tools, provide metricCriteria entries for every required template before launch: ${criteria}.`,
  ];
}

function resolveFreshCallableWorkflowDescriptor(
  toolName: string,
  options: CreateCallableWorkflowPiToolDefinitionsOptions,
): CallableWorkflowToolDescriptor {
  const thread = options.getThread();
  const registry = buildRegistryFromOptions(options);
  const descriptor = parentPiVisibleCallableWorkflowTools(registry).find((tool) => tool.name === toolName);
  if (!descriptor) {
    throw new Error(`Callable workflow tool is unavailable or disabled: ${toolName}`);
  }
  if (thread.kind === "subagent_child" && !(options.getChildCallableWorkflowToolNames?.() ?? []).includes(toolName)) {
    throw new Error(`Callable workflow tool is not granted to this child session: ${toolName}`);
  }
  return descriptor;
}

function buildRegistryFromOptions(options: CreateCallableWorkflowPiToolDefinitionsOptions): CallableWorkflowRegistry {
  const featureFlagSnapshot = options.getFeatureFlagSnapshot();
  if (!isAmbientSubagentsEnabled(featureFlagSnapshot)) {
    return buildCallableWorkflowRegistry({ featureFlagSnapshot });
  }
  return buildCallableWorkflowRegistry({
    featureFlagSnapshot,
    recordedWorkflowPlaybooks: [...(options.getRecordedWorkflowPlaybooks?.() ?? [])],
  });
}

function callableWorkflowRunPlanText(
  descriptor: CallableWorkflowToolDescriptor,
  blocking: boolean,
  workflowTaskId: string,
  runnerBridgeStatus: "started" | "not_configured",
  launchCard: NonNullable<CallableWorkflowTaskSummary["launchCard"]>,
): string {
  return [
    `Callable workflow run plan prepared for ${descriptor.label}.`,
    `Status: queued_not_started.`,
    `Workflow task: ${workflowTaskId}.`,
    `Blocking: ${blocking ? "parent waits for this workflow result" : "background workflow may complete without blocking parent synthesis"}.`,
    `Launch card: ${launchCard.riskLevel} risk, up to ${launchCard.estimatedAgents} agents, up to ${launchCard.estimatedTokenBudget.toLocaleString("en-US")} tokens.`,
    `Tool/mutation scope: ${launchCard.toolMutationScope}`,
    `Approval failures: ${launchCard.approvalFailureHandling}`,
    `Launch card requirements: ${launchCard.requirementIds.join(", ")}.`,
    launchCard.metricTemplateIds.length
      ? `Metric/rubric templates: ${launchCard.metricTemplateIds.join(", ")}.`
      : "Metric/rubric templates: none.",
    launchCard.policyWarnings.length ? `Policy warnings: ${launchCard.policyWarnings.join(" | ")}.` : "Policy warnings: none.",
    runnerBridgeStatus === "started"
      ? "Ambient queued a visible workflow background-task handoff and started the workflow runner bridge; do not report workflow output as completed until a result artifact exists."
      : "Ambient queued a visible workflow background-task handoff, but this runtime did not provide a runner bridge; do not report workflow output as completed until a result artifact exists.",
  ].join("\n");
}

function startCallableWorkflowTaskIfAvailable(
  options: CreateCallableWorkflowPiToolDefinitionsOptions,
  input: {
    taskId: string;
    executionPlan: CallableWorkflowExecutionPlan;
    workflowTask: CallableWorkflowTaskSummary;
  },
): "started" | "not_configured" {
  if (!options.startCallableWorkflowTask) return "not_configured";
  void Promise.resolve(options.startCallableWorkflowTask(input)).catch((error) => {
    console.warn(`Callable workflow runner bridge failed to start task ${input.taskId}: ${error instanceof Error ? error.message : String(error)}`);
  });
  return "started";
}

function callableWorkflowToolResult(
  text: string,
  details: Record<string, unknown>,
  isError = false,
): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
    details: {
      runtime: CALLABLE_WORKFLOW_PI_TOOLS_RUNTIME,
      phase: CALLABLE_WORKFLOW_PI_TOOLS_PHASE,
      ...details,
    },
  };
}

function callableWorkflowCatalogSearchText(
  search: ReturnType<typeof searchCallableWorkflowCatalog>,
): string {
  const lines = [
    `Callable workflow catalog search returned ${search.resultCount} of ${search.searchedEntryCount} entries for ${search.scope}.`,
    search.query ? `Query: ${search.query}.` : "Query: none.",
    ...search.results.map((result) => [
      `- ${result.label}${result.toolName ? ` (${result.toolName})` : ""}`,
      `  Status: ${result.status}; ${result.readinessLabels.join("; ") || "No readiness labels"}.`,
      `  Next: ${result.nextActionLabel}`,
    ].join("\n")),
    ...search.guidance.map((item) => `Guidance: ${item}`),
  ];
  return lines.join("\n");
}

function callableWorkflowCatalogDescribeText(
  description: ReturnType<typeof describeCallableWorkflowCatalogEntry>,
): string {
  if (!description.description) {
    return [
      "Callable workflow catalog description was not found.",
      description.query ? `Query: ${description.query}.` : "Query: none.",
      `Scope: ${description.scope}.`,
      ...description.guidance.map((item) => `Guidance: ${item}`),
    ].join("\n");
  }
  const entry = description.description;
  const inputFields = entry.inputSchema
    ? Object.entries(entry.inputSchema.properties).map(([key, schema]) => `${key}:${schema.type}`).join(", ")
    : entry.inputSchemaRequired.join(", ");
  const sourcePreview = entry.sourcePreview?.text
    ? entry.sourcePreview.text.replace(/\s+/g, " ").trim().slice(0, 1200)
    : undefined;
  return [
    `Callable workflow catalog description for ${entry.label}${entry.toolName ? ` (${entry.toolName})` : ""}.`,
    `Status: ${entry.status}; ${entry.readinessLabels.join("; ") || "No readiness labels"}.`,
    `Source: ${entry.sourceKind} ${entry.sourceId}${entry.sourceVersion ? ` v${entry.sourceVersion}` : ""}.`,
    `Input required: ${entry.inputSchemaRequired.join(", ") || "none"}.`,
    `Input fields: ${inputFields || "none"}.`,
    `Launch requirements: ${entry.launchCardRequirementIds.join(", ") || "none"}.`,
    `Metric/rubric templates: ${entry.metricTemplateIds.join(", ") || "none"}.`,
    `Default blocking: ${entry.defaultBlocking === true ? "yes" : "no"}.`,
    `Next: ${entry.nextActionLabel}`,
    ...(sourcePreview ? [`Source preview: ${sourcePreview}`] : []),
    ...description.guidance.map((item) => `Guidance: ${item}`),
  ].join("\n");
}

function recordParam(params: unknown, key: string): unknown {
  if (!params || typeof params !== "object" || Array.isArray(params)) return undefined;
  return (params as Record<string, unknown>)[key];
}

function stringParam(params: unknown, key: string): string | undefined {
  const value = recordParam(params, key);
  return typeof value === "string" ? value : undefined;
}

function numberParam(params: unknown, key: string): number | undefined {
  const value = recordParam(params, key);
  return typeof value === "number" ? value : undefined;
}
