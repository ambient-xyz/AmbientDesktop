import type { CallableWorkflowLaunchCardSummary, CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import type { CallableWorkflowSymphonyLaunchBridgeContract } from "../callable-workflow/callableWorkflowTaskQueue";
import {
  callableWorkflowExecutionPlanFromTask,
  type CallableWorkflowCallerProvenance,
  type CallableWorkflowCompilerHandoffPlan,
  type CallableWorkflowSourceContext,
} from "../callable-workflow/callableWorkflowCompilerContract";
import { workflowCompilerPromptModule, type WorkflowCompilerPromptModule } from "./workflowCompilerPromptModules";

export const WORKFLOW_COMPILER_CALLABLE_INVOCATION_CONTEXT_SCHEMA_VERSION =
  "ambient-workflow-compiler-callable-invocation-context-v1" as const;

export interface WorkflowCompilerCallableInvocationContext {
  schemaVersion: typeof WORKFLOW_COMPILER_CALLABLE_INVOCATION_CONTEXT_SCHEMA_VERSION;
  taskId: string;
  launchId: string;
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  toolName: string;
  toolId: string;
  sourceKind: string;
  blocking: boolean;
  input: Record<string, unknown>;
  launchCard?: CallableWorkflowLaunchCardSummary;
  sourceContext?: CallableWorkflowSourceContext;
  callerProvenance?: CallableWorkflowCallerProvenance;
  launchBridgeContract?: CallableWorkflowSymphonyLaunchBridgeContract;
  launchBridgeEvidence?: unknown;
}

export function workflowCompilerCallableInvocationContextFromRunnerInput(input: {
  task: CallableWorkflowTaskSummary;
  handoffPlan: CallableWorkflowCompilerHandoffPlan;
  launchBridgeEvidence?: unknown;
}): WorkflowCompilerCallableInvocationContext {
  const executionPlan = callableWorkflowExecutionPlanFromTask(input.task);
  return {
    schemaVersion: WORKFLOW_COMPILER_CALLABLE_INVOCATION_CONTEXT_SCHEMA_VERSION,
    taskId: input.task.id,
    launchId: input.task.launchId,
    parentThreadId: input.handoffPlan.parent.threadId,
    parentRunId: input.handoffPlan.parent.runId,
    ...(input.handoffPlan.parent.messageId ? { parentMessageId: input.handoffPlan.parent.messageId } : {}),
    toolName: input.handoffPlan.compiler.toolName,
    toolId: input.handoffPlan.compiler.toolId,
    sourceKind: input.handoffPlan.compiler.sourceKind,
    blocking: input.handoffPlan.compiler.blocking,
    input: { ...input.handoffPlan.compiler.input },
    launchCard: workflowCompilerJsonClone(input.handoffPlan.compiler.launchCard),
    sourceContext: workflowCompilerJsonClone(executionPlan.workflowRunPlan.sourceContext),
    callerProvenance: workflowCompilerJsonClone(input.handoffPlan.callerProvenance),
    ...(input.handoffPlan.compiler.launchBridgeContract
      ? { launchBridgeContract: workflowCompilerJsonClone(input.handoffPlan.compiler.launchBridgeContract) }
      : {}),
    ...(input.launchBridgeEvidence ? { launchBridgeEvidence: workflowCompilerJsonClone(input.launchBridgeEvidence) } : {}),
  };
}

export function workflowCompilerCallableInvocationPromptModules(
  invocation: WorkflowCompilerCallableInvocationContext | undefined,
): WorkflowCompilerPromptModule[] {
  if (!invocation) return [];
  return [
    workflowCompilerPromptModule({
      id: "dynamic-callable-workflow-invocation",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Callable workflow runs provide task, parent, launch-card, and compact recorder invocation context.",
      content: workflowCompilerCallableInvocationPromptSection(invocation),
    }),
  ];
}

function workflowCompilerCallableInvocationPromptSection(invocation: WorkflowCompilerCallableInvocationContext): string[] {
  const sourceLines = workflowCompilerCallableInvocationSourceContextLines(invocation.sourceContext);
  return [
    "",
    "Callable workflow invocation context:",
    `- Schema: ${invocation.schemaVersion}`,
    `- Task: ${invocation.taskId} / launch ${invocation.launchId}`,
    `- Parent: thread ${invocation.parentThreadId}, run ${invocation.parentRunId}${invocation.parentMessageId ? `, message ${invocation.parentMessageId}` : ""}`,
    ...workflowCompilerCallableInvocationCallerLines(invocation.callerProvenance),
    `- Tool: ${invocation.toolName} (${invocation.toolId})`,
    `- Source kind: ${invocation.sourceKind}`,
    `- Blocking: ${invocation.blocking ? "parent waits for this workflow result" : "background result may arrive later"}`,
    invocation.launchCard
      ? `- Launch card: risk ${invocation.launchCard.riskLevel}, max fanout ${invocation.launchCard.maxFanout}, max depth ${invocation.launchCard.maxDepth}, token budget ${invocation.launchCard.estimatedTokenBudget}`
      : "- Launch card: unavailable",
    ...sourceLines,
    ...workflowCompilerCallableInvocationLaunchBridgeLines(invocation.launchBridgeContract),
    ...workflowCompilerCallableInvocationLaunchBridgeEvidenceLines(invocation.launchBridgeEvidence),
    "- Compile a fresh workflow artifact for this invocation. Preserve callable workflow task identity in summaries, checkpoints, and final output.",
    "- For recorded workflows, use the compact invocation and confirmed playbook as reusable guidance. Treat full recorder traces as diagnostics evidence, not replay instructions.",
    "Callable workflow invocation input:",
    JSON.stringify(invocation.input, null, 2),
  ];
}

function workflowCompilerCallableInvocationLaunchBridgeLines(
  contract: WorkflowCompilerCallableInvocationContext["launchBridgeContract"],
): string[] {
  if (!contract) return [];
  return [
    `- Symphony launch bridge: ${contract.schemaVersion}`,
    `- Bridge pattern: ${contract.pattern.label} (${contract.pattern.id})`,
    `- Bridge children: ${contract.childLaunches.map((child) => `${child.roleNodeId}:${child.roleId}`).join(", ") || "none"}`,
    `- Bridge wait: ${contract.wait.mode}, failure ${contract.wait.failurePolicy}, timeout ${contract.wait.timeoutMs}ms`,
    "- Bridge runtime obligation: visible Ambient child threads are created from this contract before workflow synthesis; preserve the task id, child role ids, and wait policy in workflow summaries.",
    "- Bridge compiler boundary: do not emit, repair, or ask for ambient_subagent_spawn_agent, ambient_subagent_wait_agent, or other internal sub-agent bridge tools in WorkflowProgramIR. Ambient runtime owns child launch/wait; the compiler receives only contract/evidence.",
    "Symphony launch bridge contract JSON:",
    JSON.stringify(contract, null, 2),
  ];
}

function workflowCompilerCallableInvocationLaunchBridgeEvidenceLines(evidence: unknown): string[] {
  if (!evidence) return [];
  return [
    "- Symphony launch bridge evidence: required children have already run through Ambient child threads; use this evidence and the referenced child result artifacts when compiling/synthesizing.",
    "- Treat launch bridge child results as input evidence. Do not re-run, re-spawn, or re-wait the same child work inside the compiled workflow artifact.",
    "Symphony launch bridge evidence JSON:",
    JSON.stringify(evidence, null, 2),
  ];
}

function workflowCompilerCallableInvocationCallerLines(
  provenance: WorkflowCompilerCallableInvocationContext["callerProvenance"],
): string[] {
  if (!provenance) return ["- Caller provenance: unavailable"];
  return [
    `- Caller: ${provenance.kind} thread ${provenance.threadId}, run ${provenance.runId}${provenance.messageId ? `, message ${provenance.messageId}` : ""}`,
    ...(provenance.kind === "subagent_child_thread"
      ? [
          `- Child bridge: sub-agent run ${provenance.subagentRunId ?? "unknown"}${provenance.canonicalTaskPath ? `, task path ${provenance.canonicalTaskPath}` : ""}`,
          `- Worktree isolation: ${provenance.worktree.required ? "required" : "not required"}, ${provenance.worktree.isolated ? "isolated" : "not isolated"}${provenance.worktree.worktreePath ? `, path ${provenance.worktree.worktreePath}` : ""}`,
          `- Approval provenance: ${provenance.approval.required ? "required" : "not required"} via ${provenance.approval.source}, scope ${provenance.approval.scopeHint ?? "unknown"}, failure handling ${provenance.approval.failureHandling}`,
          `- Nested fanout provenance: ${provenance.nestedFanout.required ? "required" : "not required"} via ${provenance.nestedFanout.source}`,
        ]
      : [
          `- Approval provenance: ${provenance.approval.required ? "required" : "not required"} via ${provenance.approval.source}, failure handling ${provenance.approval.failureHandling}`,
        ]),
  ];
}

function workflowCompilerCallableInvocationSourceContextLines(
  context: WorkflowCompilerCallableInvocationContext["sourceContext"],
): string[] {
  if (!context) return ["- Source context: unavailable"];
  if (context.kind === "recorded_workflow") {
    return [
      `- Recorded playbook: ${context.playbookId} v${context.playbookVersion} (${context.playbookSource})`,
      `- Recorded intent: ${workflowCompilerPromptCompactText(context.intent)}`,
      `- Recorded summary: ${workflowCompilerPromptCompactText(context.summary)}`,
      ...workflowCompilerCallableSourcePreviewLines(context.sourcePreview),
      context.callableInvocation
        ? `- Compact invocation artifact: ${context.callableInvocation.invocationArtifact} (${context.callableInvocation.schemaVersion}; ${context.callableInvocation.mode}; default ${context.callableInvocation.defaultInvocation})`
        : "- Compact invocation artifact: unavailable",
      context.callableInvocation
        ? `- Diagnostics trace artifact: ${context.callableInvocation.diagnosticsTraceArtifact} (diagnostics only)`
        : "- Diagnostics trace artifact: unavailable",
      context.callableInvocation
        ? `- Invocation schema hint keys: ${context.callableInvocation.inputSchemaHintKeys.join(", ") || "none"}`
        : "- Invocation schema hint keys: none",
      context.validation.length
        ? `- Recorded validation: ${context.validation.map(workflowCompilerPromptCompactText).join(" | ")}`
        : "- Recorded validation: none",
      context.outputShape.length
        ? `- Recorded output shape: ${context.outputShape.map(workflowCompilerPromptCompactText).join(" | ")}`
        : "- Recorded output shape: none",
    ];
  }
  return [
    `- Symphony recipe: ${context.recipeId} (${context.recipeSchemaVersion})`,
    `- Recipe summary: ${workflowCompilerPromptCompactText(context.summary)}`,
    ...workflowCompilerCallableSourcePreviewLines(context.sourcePreview),
    `- Default roles: ${context.defaultRoles.join(", ") || "none"}`,
    `- Hard limits: fanout ${context.hardLimits.maxFanout}, depth ${context.hardLimits.maxDepth}, token budget ${context.hardLimits.maxTokenBudget}, local memory ${context.hardLimits.maxLocalMemoryBytes}`,
    context.metricTemplates.length
      ? `- Metric templates: ${context.metricTemplates.map((metric) => `${metric.id}:${metric.kind}`).join(", ")}`
      : "- Metric templates: none",
    ...workflowCompilerSymphonyInvocationLines(context.invocationCustomization),
  ];
}

function workflowCompilerCallableSourcePreviewLines(
  preview: NonNullable<WorkflowCompilerCallableInvocationContext["sourceContext"]>["sourcePreview"],
): string[] {
  if (!preview) return ["- Callable source preview: unavailable"];
  return [
    `- Callable source preview: ${preview.label} (${preview.format}, ${preview.dslStatus}, executable no)`,
    `- Callable source preview text: ${workflowCompilerPromptCompactText(preview.text, 900)}`,
  ];
}

function workflowCompilerSymphonyInvocationLines(
  invocation: Extract<
    NonNullable<WorkflowCompilerCallableInvocationContext["sourceContext"]>,
    { kind: "symphony_recipe" }
  >["invocationCustomization"],
): string[] {
  if (!invocation) return ["- Symphony invocation customization: none"];
  return [
    `- Symphony invocation customization: ${invocation.schemaVersion}`,
    invocation.stepSelections.length
      ? `- Selected builder choices: ${invocation.stepSelections.map((selection) => `${selection.stepId}=${workflowCompilerPromptCompactText(selection.resolvedText)}`).join(" | ")}`
      : "- Selected builder choices: none",
    invocation.metricCriteria.length
      ? `- Required metric criteria: ${invocation.metricCriteria.map((criterion) => `${criterion.templateId}=${workflowCompilerPromptCompactText(criterion.value)}`).join(" | ")}`
      : "- Required metric criteria: none",
  ];
}

function workflowCompilerPromptCompactText(value: string, maxLength = 360): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function workflowCompilerJsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
