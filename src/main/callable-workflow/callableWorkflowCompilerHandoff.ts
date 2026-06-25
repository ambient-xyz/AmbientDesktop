import type {
  SubagentEffectiveRoleSnapshot,
  SubagentPatternGraphApprovalState,
  SubagentPatternRoleId,
} from "../../shared/subagentPatternGraph";
import { buildDefaultSymphonyPatternRoleGraph, effectiveSubagentRoleSnapshot } from "../../shared/subagentPatternGraph";
import type {
  SubagentDependencyMode,
  SubagentForkMode,
  SubagentPromptMode,
  SubagentWaitBarrierFailurePolicy,
  SubagentWaitBarrierMode,
} from "../../shared/subagentProtocol";
import { getDefaultSubagentRoleProfile, type SubagentRoleId } from "../../shared/subagentRoles";
import { SYMPHONY_WORKFLOW_PATTERN_IDS, type SymphonyWorkflowPatternId } from "../../shared/symphonyWorkflowRecipes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import {
  cloneCallableWorkflowCallerProvenance,
  defaultCallableWorkflowCallerProvenance,
  type CallableWorkflowCallerProvenance,
  type CallableWorkflowExecutionPlan,
} from "./callableWorkflowExecutionPlan";

export const CALLABLE_WORKFLOW_COMPILER_HANDOFF_SCHEMA_VERSION = "ambient-callable-workflow-compiler-handoff-v1" as const;
export const CALLABLE_WORKFLOW_SYMPHONY_LAUNCH_BRIDGE_SCHEMA_VERSION = "ambient-callable-workflow-symphony-launch-bridge-v1" as const;
export const CALLABLE_WORKFLOW_SYMPHONY_LAUNCH_BRIDGE_WAIT_TIMEOUT_MS = 10 * 60_000;

export interface CallableWorkflowCompilerHandoffPlan {
  schemaVersion: typeof CALLABLE_WORKFLOW_COMPILER_HANDOFF_SCHEMA_VERSION;
  taskId: string;
  launchId: string;
  createdAt: string;
  parent: {
    threadId: string;
    runId: string;
    messageId?: string;
  };
  callerProvenance: CallableWorkflowCallerProvenance;
  compiler: {
    target: "workflowCompilerService";
    userRequest: string;
    workflowThreadTitle: string;
    workflowThreadInitialRequest: string;
    sourceKind: string;
    toolName: string;
    toolId: string;
    input: Record<string, unknown>;
    blocking: boolean;
    launchCard: NonNullable<CallableWorkflowTaskSummary["launchCard"]>;
    requiredBeforeStart: readonly string[];
    launchBridgeContract?: CallableWorkflowSymphonyLaunchBridgeContract;
  };
  runStart: {
    mode: "compile_then_start_workflow_run";
    desktopEventType: "workflow-run-started";
    requiresArtifactBeforeRun: true;
    allowUnapprovedOneOff: true;
  };
}

export interface CallableWorkflowSymphonyLaunchBridgeContract {
  schemaVersion: typeof CALLABLE_WORKFLOW_SYMPHONY_LAUNCH_BRIDGE_SCHEMA_VERSION;
  workflowTaskId: string;
  launchId: string;
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  expectedWorkflowToolName: string;
  expectedWorkflowToolId: string;
  sourceKind: "symphony_recipe";
  pattern: {
    id: SymphonyWorkflowPatternId;
    label: string;
    blocking: boolean;
  };
  childLaunches: CallableWorkflowSymphonyChildLaunchContract[];
  wait: {
    mode: SubagentWaitBarrierMode;
    failurePolicy: SubagentWaitBarrierFailurePolicy;
    timeoutMs: number;
    blocking: boolean;
    childRoleNodeIds: string[];
  };
  expectedEvidence: string[];
}

export interface CallableWorkflowSymphonyChildLaunchContract {
  roleNodeId: string;
  label: string;
  title: string;
  task: string;
  roleId: SubagentRoleId;
  dependencyMode: SubagentDependencyMode;
  forkMode: SubagentForkMode;
  promptMode: SubagentPromptMode;
  effectiveRole: SubagentEffectiveRoleSnapshot;
  patternRole: SubagentPatternRoleId;
  patternGraphBinding: {
    workflowTaskId: string;
    roleNodeId: string;
    label: string;
    approvalState: SubagentPatternGraphApprovalState;
    blockingParent: boolean;
  };
  toolScope: {
    mode: "role_defaults";
    rationale: string;
  };
  idempotencyKey: string;
}

export type CallableWorkflowSymphonyLaunchBridgeTaskContext = Pick<
  CallableWorkflowTaskSummary,
  "id" | "launchId" | "parentThreadId" | "parentRunId" | "parentMessageId" | "toolName" | "toolId" | "sourceKind" | "title"
>;

type CallableWorkflowExecutionPlanWithDurableHandoff = CallableWorkflowExecutionPlan & {
  handoff?: {
    compiler?: {
      launchBridgeContract?: CallableWorkflowSymphonyLaunchBridgeContract;
    };
  };
};

export function callableWorkflowExecutionPlanWithDurableLaunchBridge(
  task: CallableWorkflowSymphonyLaunchBridgeTaskContext,
  executionPlan: CallableWorkflowExecutionPlan,
): CallableWorkflowExecutionPlan {
  const launchBridgeContract = callableWorkflowSymphonyLaunchBridgeContractFromExecutionPlan(task, executionPlan);
  if (!launchBridgeContract) return executionPlan;
  const existing = executionPlan as CallableWorkflowExecutionPlanWithDurableHandoff;
  return {
    ...executionPlan,
    handoff: {
      ...existing.handoff,
      compiler: {
        ...existing.handoff?.compiler,
        launchBridgeContract,
      },
    },
  } as CallableWorkflowExecutionPlan;
}

export function buildCallableWorkflowCompilerHandoffPlan(input: {
  task: CallableWorkflowTaskSummary;
  createdAt?: string;
}): CallableWorkflowCompilerHandoffPlan {
  const executionPlan = callableWorkflowExecutionPlanFromTask(input.task);
  const launchBridgeContract = callableWorkflowDurableLaunchBridgeContractFromExecutionPlan(input.task, executionPlan);
  const userRequest = callableWorkflowCompilerUserRequest(input.task, executionPlan, launchBridgeContract);
  return {
    schemaVersion: CALLABLE_WORKFLOW_COMPILER_HANDOFF_SCHEMA_VERSION,
    taskId: input.task.id,
    launchId: input.task.launchId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    parent: {
      threadId: input.task.parentThreadId,
      runId: input.task.parentRunId,
      messageId: input.task.parentMessageId,
    },
    callerProvenance: cloneCallableWorkflowCallerProvenance(executionPlan.callerProvenance),
    compiler: {
      target: executionPlan.runnerHandoff.target,
      userRequest,
      workflowThreadTitle: input.task.title,
      workflowThreadInitialRequest: userRequest,
      sourceKind: input.task.sourceKind,
      toolName: input.task.toolName,
      toolId: input.task.toolId,
      input: { ...executionPlan.workflowRunPlan.input },
      blocking: executionPlan.workflowRunPlan.blocking,
      launchCard: executionPlan.workflowRunPlan.launchCard,
      requiredBeforeStart: [...executionPlan.runnerHandoff.requiredBeforeStart],
      ...(launchBridgeContract ? { launchBridgeContract } : {}),
    },
    runStart: {
      mode: "compile_then_start_workflow_run",
      desktopEventType: "workflow-run-started",
      requiresArtifactBeforeRun: true,
      allowUnapprovedOneOff: true,
    },
  };
}

export function callableWorkflowSymphonyLaunchBridgeContractFromExecutionPlan(
  task: CallableWorkflowSymphonyLaunchBridgeTaskContext,
  executionPlan: CallableWorkflowExecutionPlan,
): CallableWorkflowSymphonyLaunchBridgeContract | undefined {
  const sourceContext = executionPlan.workflowRunPlan.sourceContext;
  if (sourceContext.kind !== "symphony_recipe") return undefined;
  if (executionPlan.callerProvenance.kind === "subagent_child_thread") return undefined;
  const roleGraph = buildDefaultSymphonyPatternRoleGraph(sourceContext.recipeId);
  const requiredNodes = roleGraph.nodes.filter((node) => node.required);
  const blocking = executionPlan.workflowRunPlan.blocking;
  const childLaunches: CallableWorkflowSymphonyChildLaunchContract[] = requiredNodes.map((node) => {
    const role = getDefaultSubagentRoleProfile(node.baseRole);
    const effectiveRole = effectiveSubagentRoleSnapshot({
      baseRole: node.baseRole,
      patternRole: node.patternRole,
      overlayLabels: node.overlayLabels,
      outputContract: callableWorkflowSymphonyChildOutputContract(task, executionPlan, node.id),
    });
    return {
      roleNodeId: node.id,
      label: node.label,
      title: `${node.label} sub-agent`,
      task: callableWorkflowSymphonyChildTaskText(task, executionPlan, node.id),
      roleId: node.baseRole,
      dependencyMode: blocking ? "required" : "optional_background",
      forkMode: role.defaultForkMode,
      promptMode: role.promptMode,
      effectiveRole,
      patternRole: node.patternRole,
      patternGraphBinding: {
        workflowTaskId: task.id,
        roleNodeId: node.id,
        label: node.label,
        approvalState: "none",
        blockingParent: blocking,
      },
      toolScope: {
        mode: "role_defaults",
        rationale: "Use the selected role's least-privilege defaults; Ambient policy may narrow further at launch.",
      },
      idempotencyKey: `callable-workflow:${task.id}:symphony-child:${node.id}`,
    };
  });
  return {
    schemaVersion: CALLABLE_WORKFLOW_SYMPHONY_LAUNCH_BRIDGE_SCHEMA_VERSION,
    workflowTaskId: task.id,
    launchId: task.launchId,
    parentThreadId: task.parentThreadId,
    parentRunId: task.parentRunId,
    ...(task.parentMessageId ? { parentMessageId: task.parentMessageId } : {}),
    expectedWorkflowToolName: task.toolName,
    expectedWorkflowToolId: task.toolId,
    sourceKind: "symphony_recipe",
    pattern: {
      id: sourceContext.recipeId,
      label: roleGraph.label,
      blocking,
    },
    childLaunches,
    wait: {
      mode: "required_all",
      failurePolicy: "ask_user",
      timeoutMs: CALLABLE_WORKFLOW_SYMPHONY_LAUNCH_BRIDGE_WAIT_TIMEOUT_MS,
      blocking: true,
      childRoleNodeIds: childLaunches.map((child) => child.roleNodeId),
    },
    expectedEvidence: [
      "Every required child launch has a childRunId bound to this workflow task's pattern graph.",
      "The workflow launch bridge wait names all required child runs before compiler synthesis.",
      "Parent synthesis uses only synthesis-safe child results or an explicit partial-result decision.",
    ],
  };
}

export function callableWorkflowExecutionPlanFromTask(task: CallableWorkflowTaskSummary): CallableWorkflowExecutionPlan {
  const plan = recordValue(task.executionPlan);
  if (plan.schemaVersion !== "ambient-callable-workflow-execution-plan-v1") {
    throw new Error(`Callable workflow task ${task.id} has an invalid execution plan.`);
  }
  const workflowRunPlan = recordValue(plan.workflowRunPlan);
  const source = recordValue(workflowRunPlan.source);
  const input = recordValue(workflowRunPlan.input);
  const runnerHandoff = recordValue(plan.runnerHandoff);
  const sourceContext = callableWorkflowSourceContextFromTask(task, source, workflowRunPlan.sourceContext);
  if (
    typeof plan.launchId !== "string" ||
    plan.launchId !== task.launchId ||
    typeof workflowRunPlan.toolName !== "string" ||
    workflowRunPlan.toolName !== task.toolName ||
    typeof workflowRunPlan.toolId !== "string" ||
    workflowRunPlan.toolId !== task.toolId ||
    typeof source.kind !== "string" ||
    source.kind !== task.sourceKind ||
    typeof runnerHandoff.target !== "string"
  ) {
    throw new Error(`Callable workflow task ${task.id} execution plan does not match the queued task.`);
  }
  if (typeof workflowRunPlan.blocking !== "boolean") {
    throw new Error(`Callable workflow task ${task.id} execution plan is missing blocking metadata.`);
  }
  return {
    ...(plan as unknown as CallableWorkflowExecutionPlan),
    callerProvenance: callerProvenanceFromTask(
      task,
      plan.callerProvenance,
      workflowRunPlan as unknown as CallableWorkflowExecutionPlan["workflowRunPlan"],
    ),
    workflowRunPlan: {
      ...(workflowRunPlan as unknown as CallableWorkflowExecutionPlan["workflowRunPlan"]),
      source: source as unknown as CallableWorkflowExecutionPlan["workflowRunPlan"]["source"],
      sourceContext,
      input,
    },
  };
}

function callableWorkflowDurableLaunchBridgeContractFromExecutionPlan(
  task: CallableWorkflowSymphonyLaunchBridgeTaskContext,
  executionPlan: CallableWorkflowExecutionPlan,
): CallableWorkflowSymphonyLaunchBridgeContract | undefined {
  const expected = callableWorkflowSymphonyLaunchBridgeContractFromExecutionPlan(task, executionPlan);
  if (!expected) return undefined;
  const contract = (executionPlan as CallableWorkflowExecutionPlanWithDurableHandoff).handoff?.compiler?.launchBridgeContract;
  if (!contract) {
    throw new Error(`Callable workflow task ${task.id} is missing a durable Symphony launch bridge contract.`);
  }
  assertCallableWorkflowSymphonyLaunchBridgeContractMatchesTask(task, contract, expected);
  return contract;
}

function assertCallableWorkflowSymphonyLaunchBridgeContractMatchesTask(
  task: CallableWorkflowSymphonyLaunchBridgeTaskContext,
  contract: CallableWorkflowSymphonyLaunchBridgeContract,
  expected: CallableWorkflowSymphonyLaunchBridgeContract,
): void {
  const matches =
    contract.schemaVersion === CALLABLE_WORKFLOW_SYMPHONY_LAUNCH_BRIDGE_SCHEMA_VERSION &&
    contract.workflowTaskId === task.id &&
    contract.launchId === task.launchId &&
    contract.parentThreadId === task.parentThreadId &&
    contract.parentRunId === task.parentRunId &&
    contract.parentMessageId === task.parentMessageId &&
    contract.parentMessageId === expected.parentMessageId &&
    contract.expectedWorkflowToolName === task.toolName &&
    contract.expectedWorkflowToolId === task.toolId &&
    contract.sourceKind === "symphony_recipe" &&
    contract.pattern.id === expected.pattern.id &&
    contract.pattern.label === expected.pattern.label &&
    contract.pattern.blocking === expected.pattern.blocking &&
    JSON.stringify(contract.childLaunches) === JSON.stringify(expected.childLaunches) &&
    JSON.stringify(contract.wait) === JSON.stringify(expected.wait) &&
    JSON.stringify(contract.expectedEvidence) === JSON.stringify(expected.expectedEvidence);
  if (matches) return;
  throw new Error(`Callable workflow task ${task.id} has a durable Symphony launch bridge contract that does not match the queued task.`);
}

function callerProvenanceFromTask(
  task: CallableWorkflowTaskSummary,
  rawProvenance: unknown,
  runPlan: CallableWorkflowExecutionPlan["workflowRunPlan"],
): CallableWorkflowCallerProvenance {
  const provenance = recordValue(rawProvenance);
  if (
    (provenance.kind === "parent_thread" || provenance.kind === "subagent_child_thread") &&
    typeof provenance.threadId === "string" &&
    typeof provenance.runId === "string"
  ) {
    return cloneCallableWorkflowCallerProvenance(provenance as unknown as CallableWorkflowCallerProvenance);
  }
  return defaultCallableWorkflowCallerProvenance(
    {
      threadId: task.parentThreadId,
      runId: task.parentRunId,
      assistantMessageId: task.parentMessageId,
    },
    runPlan,
  );
}

function callableWorkflowSourceContextFromTask(
  task: CallableWorkflowTaskSummary,
  source: Record<string, unknown>,
  rawContext: unknown,
): CallableWorkflowExecutionPlan["workflowRunPlan"]["sourceContext"] {
  const context = recordValue(rawContext);
  if (context.kind === "symphony_recipe" || context.kind === "recorded_workflow") {
    return context as CallableWorkflowExecutionPlan["workflowRunPlan"]["sourceContext"];
  }
  if (source.kind === "recorded_workflow") {
    return {
      kind: "recorded_workflow",
      title: task.title,
      summary: task.title,
      playbookId: typeof source.playbookId === "string" ? source.playbookId : task.toolId,
      playbookVersion: typeof source.playbookVersion === "number" ? source.playbookVersion : 1,
      playbookSource: "user_edit",
      intent: task.title,
      inputs: [],
      successfulExamples: [],
      doNot: [],
      validation: [],
      outputShape: [],
      markdownPreview: "",
      recorderCompactInvocationByDefault: true,
      fullTraceArtifact: true,
    };
  }
  return {
    kind: "symphony_recipe",
    title: task.title,
    summary: task.title,
    recipeId: symphonyRecipeIdOrFallback(source.recipeId),
    recipeSchemaVersion: typeof source.recipeSchemaVersion === "string" ? source.recipeSchemaVersion : "unknown",
    defaultRoles: [],
    builderSteps: [],
    metricTemplates: [],
    hardLimits: {
      maxFanout: 1,
      maxDepth: 1,
      maxTokenBudget: 60_000,
      maxLocalMemoryBytes: 0,
      allowSmallSliceRun: true,
    },
    recorderPolicy: {
      compactInvocationByDefault: true,
      fullTraceArtifact: true,
    },
  };
}

function symphonyRecipeIdOrFallback(value: unknown): SymphonyWorkflowPatternId {
  return typeof value === "string" && (SYMPHONY_WORKFLOW_PATTERN_IDS as readonly string[]).includes(value)
    ? (value as SymphonyWorkflowPatternId)
    : "map_reduce";
}

function callableWorkflowCompilerUserRequest(
  task: CallableWorkflowTaskSummary,
  executionPlan: CallableWorkflowExecutionPlan,
  launchBridgeContract?: CallableWorkflowSymphonyLaunchBridgeContract,
): string {
  return [
    `Callable workflow: ${task.title}`,
    `Tool: ${task.toolName}`,
    `Source: ${task.sourceKind}`,
    `Blocking: ${executionPlan.workflowRunPlan.blocking ? "parent waits for this workflow result" : "background workflow result may arrive later"}.`,
    "Launch card:",
    ...callableWorkflowLaunchCardLines(executionPlan.workflowRunPlan.launchCard),
    "Source recipe context:",
    ...callableWorkflowSourceContextLines(executionPlan.workflowRunPlan.sourceContext),
    ...callableWorkflowSymphonyLaunchBridgeLines(launchBridgeContract),
    "Compile this callable workflow invocation into a reviewable Ambient workflow artifact, then start a visible workflow run only after the artifact is persisted.",
    "Input:",
    JSON.stringify(executionPlan.workflowRunPlan.input, null, 2),
  ].join("\n");
}

function callableWorkflowSymphonyLaunchBridgeLines(contract: CallableWorkflowSymphonyLaunchBridgeContract | undefined): string[] {
  if (!contract) return [];
  return [
    "Symphony launch bridge contract:",
    `- Schema: ${contract.schemaVersion}`,
    `- Pattern: ${contract.pattern.label} (${contract.pattern.id})`,
    `- Required child roles: ${contract.childLaunches.map((child) => `${child.roleNodeId}:${child.roleId}`).join(", ") || "none"}`,
    `- Wait: ${contract.wait.mode}, failure ${contract.wait.failurePolicy}, timeout ${contract.wait.timeoutMs}ms`,
    "- Ambient runtime, not the workflow compiler, must create visible child threads from this contract exactly once before workflow synthesis.",
    "- The compiler must not emit or repair WorkflowProgramIR with ambient_subagent_spawn_agent, ambient_subagent_wait_agent, or other internal bridge tools; those operations are already owned by this launch bridge.",
    "- After required child launches, Ambient runtime waits on the childRunIds using the bridge wait policy; do not synthesize from failed, timed-out, or detached children without an explicit partial-result decision.",
    "Symphony launch bridge JSON:",
    JSON.stringify(contract, null, 2),
  ];
}

function callableWorkflowSymphonyChildOutputContract(
  task: CallableWorkflowSymphonyLaunchBridgeTaskContext,
  executionPlan: CallableWorkflowExecutionPlan,
  roleNodeId: string,
): string {
  const sourceContext = executionPlan.workflowRunPlan.sourceContext;
  const metricCriteria = sourceContext.kind === "symphony_recipe" ? (sourceContext.invocationCustomization?.metricCriteria ?? []) : [];
  const metricText = metricCriteria.length
    ? metricCriteria.map((criterion) => `${criterion.templateId}: ${criterion.value}`).join(" | ")
    : "Use the launch card, user input, and role overlays as the acceptance criteria.";
  return [
    `Return a compact, structured result for role node ${roleNodeId} on callable workflow task ${task.id}.`,
    `Include: summary, evidence used, uncertainties, blockers, and synthesis-ready recommendation or handoff.`,
    `Metric/rubric: ${metricText}`,
  ].join(" ");
}

function callableWorkflowSymphonyChildTaskText(
  task: CallableWorkflowSymphonyLaunchBridgeTaskContext,
  executionPlan: CallableWorkflowExecutionPlan,
  roleNodeId: string,
): string {
  const sourceContext = executionPlan.workflowRunPlan.sourceContext;
  const roleGraph = sourceContext.kind === "symphony_recipe" ? buildDefaultSymphonyPatternRoleGraph(sourceContext.recipeId) : undefined;
  const roleNode = roleGraph?.nodes.find((node) => node.id === roleNodeId);
  const upstreamEdges = roleGraph?.edges.filter((edge) => edge.to === roleNodeId) ?? [];
  const downstreamEdges = roleGraph?.edges.filter((edge) => edge.from === roleNodeId) ?? [];
  return [
    `You are the ${roleNode?.label ?? roleNodeId} child in the ${roleGraph?.label ?? "Symphony"} pattern for parent callable workflow task ${task.id}.`,
    `Parent objective: ${task.title}.`,
    `Current invocation input: ${JSON.stringify(executionPlan.workflowRunPlan.input)}.`,
    roleNode?.overlayLabels.length ? `Role overlays: ${roleNode.overlayLabels.join("; ")}.` : undefined,
    upstreamEdges.length
      ? `Upstream contracts: ${upstreamEdges.map((edge) => `${edge.from} -> ${edge.to} (${edge.label})`).join("; ")}.`
      : "Upstream contracts: none at launch.",
    downstreamEdges.length
      ? `Downstream handoff: ${downstreamEdges.map((edge) => `${edge.from} -> ${edge.to} (${edge.label})`).join("; ")}.`
      : "Downstream handoff: parent synthesis.",
    "Stay within the role defaults and do not spawn nested sub-agents. Return a synthesis-safe, compact result with evidence and blockers.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function callableWorkflowSourceContextLines(context: CallableWorkflowExecutionPlan["workflowRunPlan"]["sourceContext"]): string[] {
  if (context.kind === "symphony_recipe") {
    return [
      `- Source kind: Symphony recipe preset (${context.recipeId}, ${context.recipeSchemaVersion})`,
      `- Summary: ${context.summary}`,
      ...callableWorkflowSourcePreviewLines(context.sourcePreview),
      `- Default roles: ${context.defaultRoles.join(", ") || "none"}`,
      `- Hard limits: max fanout ${context.hardLimits.maxFanout}, max depth ${context.hardLimits.maxDepth}, max token budget ${context.hardLimits.maxTokenBudget}, max local memory ${formatBytes(context.hardLimits.maxLocalMemoryBytes)}`,
      `- Recorder policy: compact invocation ${context.recorderPolicy.compactInvocationByDefault ? "yes" : "no"}, full trace artifact ${context.recorderPolicy.fullTraceArtifact ? "yes" : "no"}`,
      ...context.builderSteps.map(
        (step) => `- Builder step ${step.id}: ${step.question} Impact: ${step.impact} Choices: ${step.choices.join(" | ")}`,
      ),
      ...context.metricTemplates.map((metric) => `- Metric ${metric.id}: ${metric.kind} ${metric.label}. ${metric.prompt}`),
      ...callableWorkflowSymphonyInvocationLines(context.invocationCustomization),
    ];
  }
  return [
    `- Source kind: recorded workflow playbook (${context.playbookId} v${context.playbookVersion}, source ${context.playbookSource})`,
    `- Summary: ${context.summary}`,
    ...callableWorkflowSourcePreviewLines(context.sourcePreview),
    `- Intent: ${context.intent}`,
    `- Recorder policy: compact invocation ${context.recorderCompactInvocationByDefault ? "yes" : "no"}, full trace artifact ${context.fullTraceArtifact ? "yes" : "no"}`,
    ...callableWorkflowRecordedInvocationLines(context.callableInvocation),
    ...context.inputs.map((item, index) => `- Input ${index + 1}: ${item}`),
    ...context.successfulExamples.map((example) => {
      const detail = [example.inputPreview, example.resultPreview, example.artifactPath ? `artifact ${example.artifactPath}` : undefined]
        .filter(Boolean)
        .join(" | ");
      return `- Successful example ${example.toolName}: ${detail || "No preview."}`;
    }),
    ...context.doNot.map((pattern) => `- Avoid ${pattern.toolName ? `${pattern.toolName} ` : ""}${pattern.status}: ${pattern.reason}`),
    ...context.validation.map((item, index) => `- Validation ${index + 1}: ${item}`),
    ...context.outputShape.map((item, index) => `- Output ${index + 1}: ${item}`),
    context.markdownPreview ? `- Markdown preview: ${context.markdownPreview}` : "- Markdown preview: none",
    "- Compile the current invocation from this confirmed playbook. Do not replay stale recorded traces as if they were fresh results.",
  ];
}

function callableWorkflowSourcePreviewLines(
  preview: CallableWorkflowExecutionPlan["workflowRunPlan"]["sourceContext"]["sourcePreview"],
): string[] {
  if (!preview) return ["- Source preview: unavailable"];
  return [
    `- Source preview: ${preview.label} (${preview.format}, ${preview.dslStatus}, executable no)`,
    ...preview.text
      .split(/\r?\n/g)
      .filter(Boolean)
      .slice(0, 16)
      .map((line) => `  ${line}`),
  ];
}

function callableWorkflowSymphonyInvocationLines(
  invocation: Extract<
    CallableWorkflowExecutionPlan["workflowRunPlan"]["sourceContext"],
    { kind: "symphony_recipe" }
  >["invocationCustomization"],
): string[] {
  if (!invocation) return ["- Symphony invocation customization: none"];
  return [
    `- Symphony invocation customization: ${invocation.schemaVersion}`,
    ...invocation.stepSelections.map((selection) => `- Selected builder step ${selection.stepId}: ${selection.resolvedText}`),
    ...invocation.metricCriteria.map((criterion) => `- Required ${criterion.kind} ${criterion.templateId}: ${criterion.value}`),
  ];
}

function callableWorkflowRecordedInvocationLines(
  invocation: Extract<
    CallableWorkflowExecutionPlan["workflowRunPlan"]["sourceContext"],
    { kind: "recorded_workflow" }
  >["callableInvocation"],
): string[] {
  if (!invocation) {
    return ["- Compact invocation artifact: unavailable; compile from the confirmed playbook and current live input."];
  }
  return [
    `- Compact invocation artifact: ${invocation.invocationArtifact} (${invocation.schemaVersion}, ${invocation.mode}; default ${invocation.defaultInvocation})`,
    `- Diagnostics trace artifact: ${invocation.diagnosticsTraceArtifact} (diagnostics only; do not replay by default)`,
    `- Invocation input keys: ${invocation.inputKeys.join(", ") || "none"}`,
    `- Invocation schema hint keys: ${invocation.inputSchemaHintKeys.join(", ") || "none"}`,
  ];
}

function callableWorkflowLaunchCardLines(launchCard: NonNullable<CallableWorkflowTaskSummary["launchCard"]>): string[] {
  return [
    `- Risk: ${launchCard.riskLevel}`,
    `- Agents: up to ${launchCard.estimatedAgents} estimated, max fanout ${launchCard.maxFanout}, max depth ${launchCard.maxDepth}`,
    `- Token budget: up to ${launchCard.estimatedTokenBudget.toLocaleString("en-US")} tokens`,
    `- Local memory: up to ${formatBytes(launchCard.estimatedLocalMemoryBytes)} estimated`,
    `- Cost: ${launchCard.costEstimateLabel}`,
    `- Tool/mutation scope: ${launchCard.toolMutationScope}`,
    `- Checkpoint/resume: ${launchCard.checkpointResume}`,
    `- Approval failures: ${launchCard.approvalFailureHandling}`,
    `- Requires confirmation: ${launchCard.requireConfirmation ? "yes" : "no"}`,
    launchCard.metricTemplateIds.length
      ? `- Metric/rubric templates: ${launchCard.metricTemplateIds.join(", ")}`
      : "- Metric/rubric templates: none",
    launchCard.policyWarnings.length ? `- Policy warnings: ${launchCard.policyWarnings.join(" | ")}` : "- Policy warnings: none",
  ];
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 bytes";
  const gib = value / (1024 * 1024 * 1024);
  if (gib >= 1) return `${formatDecimal(gib)} GiB`;
  const mib = value / (1024 * 1024);
  if (mib >= 1) return `${formatDecimal(mib)} MiB`;
  return `${Math.floor(value).toLocaleString("en-US")} bytes`;
}

function formatDecimal(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
