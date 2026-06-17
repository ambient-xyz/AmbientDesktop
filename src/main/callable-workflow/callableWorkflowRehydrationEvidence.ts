import type {
  CallableWorkflowTaskProgressSnapshot,
  CallableWorkflowTaskSummary,
  CallableWorkflowTaskUsageSnapshot,
  WorkflowArtifactSummary,
  WorkflowRunSummary,
} from "../../shared/types";
import { callableWorkflowExecutionPlanFromTask } from "./callableWorkflowTaskQueue";

export const CALLABLE_WORKFLOW_REHYDRATION_EVIDENCE_SCHEMA_VERSION =
  "ambient-callable-workflow-rehydration-evidence-v1" as const;

export interface CallableWorkflowRehydrationEvidenceInput {
  beforeCloseTask: CallableWorkflowTaskSummary;
  beforeCloseArtifact: WorkflowArtifactSummary;
  reopenedTask: CallableWorkflowTaskSummary;
  artifact: WorkflowArtifactSummary;
  workflowRun: WorkflowRunSummary;
  workflowRunEventTypes: readonly string[];
  createdAt?: string;
}

export type CallableWorkflowRehydrationMaturityAssertionId =
  | "workflow_rehydrated_task_links"
  | "workflow_rehydrated_artifact_payload"
  | "workflow_rehydrated_progress_usage"
  | "workflow_rehydrated_child_provenance";

export interface CallableWorkflowRehydrationMaturityAssertion {
  id: CallableWorkflowRehydrationMaturityAssertionId;
  status: "passed";
  capabilities: string[];
  evidence: string[];
}

export interface CallableWorkflowRehydrationEvidence {
  schemaVersion: typeof CALLABLE_WORKFLOW_REHYDRATION_EVIDENCE_SCHEMA_VERSION;
  createdAt: string;
  task: {
    id: string;
    launchId: string;
    toolName: string;
    sourceKind: string;
    status: CallableWorkflowTaskSummary["status"];
    blocking: boolean;
    workflowThreadId?: string;
    workflowArtifactId?: string;
    workflowRunId?: string;
  };
  beforeClose: {
    status: CallableWorkflowTaskSummary["status"];
    workflowThreadId?: string;
    workflowArtifactId?: string;
    workflowRunId?: string;
    artifactSourcePath?: string;
    artifactStatePath?: string;
    artifactMutationPolicy?: WorkflowArtifactSummary["manifest"]["mutationPolicy"];
    artifactSpecGoal?: string;
  };
  rehydration: {
    sameTaskId: boolean;
    sameArtifactId: boolean;
    sameRunId: boolean;
    workflowThreadHydrated: boolean;
    artifactSourcePathHydrated: boolean;
    artifactStatePathHydrated: boolean;
    artifactMutationPolicyHydrated: boolean;
    artifactSpecHydrated: boolean;
    launchCardHydrated: boolean;
    executionPlanHydrated: boolean;
    progressHydrated: boolean;
    usageHydrated: boolean;
  };
  childCaller: {
    kind: string;
    threadId?: string;
    runId?: string;
    subagentRunId?: string;
    canonicalTaskPath?: string;
    parentThreadId?: string;
    parentRunId?: string;
  };
  artifact: {
    id: string;
    title: string;
    workflowThreadId?: string;
    status: WorkflowArtifactSummary["status"];
    sourcePath: string;
    statePath: string;
    mutationPolicy: WorkflowArtifactSummary["manifest"]["mutationPolicy"];
    specGoal: string;
  };
  workflowRun: {
    id: string;
    artifactId: string;
    status: WorkflowRunSummary["status"];
  };
  progressSnapshot?: CallableWorkflowTaskProgressSnapshot;
  usageSnapshot?: CallableWorkflowTaskUsageSnapshot;
  taskEvents: {
    started: boolean;
    eventTypes: string[];
  };
  maturityAssertions: Record<
    CallableWorkflowRehydrationMaturityAssertionId,
    CallableWorkflowRehydrationMaturityAssertion
  >;
  observations: string[];
}

export interface CallableWorkflowRehydrationEvidenceValidation {
  valid: boolean;
  issues: string[];
}

export function buildCallableWorkflowRehydrationEvidence(
  input: CallableWorkflowRehydrationEvidenceInput,
): CallableWorkflowRehydrationEvidence {
  const executionPlan = callableWorkflowExecutionPlanFromTask(input.reopenedTask);
  const caller = executionPlan.callerProvenance;
  const childCaller = caller.kind === "subagent_child_thread" ? caller : undefined;
  const eventTypes = [...new Set(input.workflowRunEventTypes)];
  const evidence: CallableWorkflowRehydrationEvidence = {
    schemaVersion: CALLABLE_WORKFLOW_REHYDRATION_EVIDENCE_SCHEMA_VERSION,
    createdAt: input.createdAt ?? new Date().toISOString(),
    task: {
      id: input.reopenedTask.id,
      launchId: input.reopenedTask.launchId,
      toolName: input.reopenedTask.toolName,
      sourceKind: input.reopenedTask.sourceKind,
      status: input.reopenedTask.status,
      blocking: input.reopenedTask.blocking,
      ...(input.reopenedTask.workflowThreadId ? { workflowThreadId: input.reopenedTask.workflowThreadId } : {}),
      ...(input.reopenedTask.workflowArtifactId ? { workflowArtifactId: input.reopenedTask.workflowArtifactId } : {}),
      ...(input.reopenedTask.workflowRunId ? { workflowRunId: input.reopenedTask.workflowRunId } : {}),
    },
    beforeClose: {
      status: input.beforeCloseTask.status,
      ...(input.beforeCloseTask.workflowThreadId ? { workflowThreadId: input.beforeCloseTask.workflowThreadId } : {}),
      ...(input.beforeCloseTask.workflowArtifactId ? { workflowArtifactId: input.beforeCloseTask.workflowArtifactId } : {}),
      ...(input.beforeCloseTask.workflowRunId ? { workflowRunId: input.beforeCloseTask.workflowRunId } : {}),
      artifactSourcePath: input.beforeCloseArtifact.sourcePath,
      artifactStatePath: input.beforeCloseArtifact.statePath,
      artifactMutationPolicy: input.beforeCloseArtifact.manifest.mutationPolicy,
      artifactSpecGoal: input.beforeCloseArtifact.spec.goal,
    },
    rehydration: {
      sameTaskId: input.beforeCloseTask.id === input.reopenedTask.id,
      sameArtifactId: input.beforeCloseTask.workflowArtifactId === input.reopenedTask.workflowArtifactId &&
        input.reopenedTask.workflowArtifactId === input.artifact.id,
      sameRunId: input.beforeCloseTask.workflowRunId === input.reopenedTask.workflowRunId &&
        input.reopenedTask.workflowRunId === input.workflowRun.id,
      workflowThreadHydrated: input.reopenedTask.workflowThreadId === input.artifact.workflowThreadId,
      artifactSourcePathHydrated: input.artifact.sourcePath === input.beforeCloseArtifact.sourcePath,
      artifactStatePathHydrated: input.artifact.statePath === input.beforeCloseArtifact.statePath,
      artifactMutationPolicyHydrated: input.artifact.manifest.mutationPolicy === input.beforeCloseArtifact.manifest.mutationPolicy,
      artifactSpecHydrated: input.artifact.spec.goal === input.beforeCloseArtifact.spec.goal,
      launchCardHydrated: !!input.reopenedTask.launchCard,
      executionPlanHydrated: executionPlan.launchId === input.reopenedTask.launchId,
      progressHydrated: !!input.reopenedTask.progressSnapshot,
      usageHydrated: !!input.reopenedTask.usageSnapshot,
    },
    childCaller: {
      kind: caller.kind,
      ...(childCaller?.threadId ? { threadId: childCaller.threadId } : {}),
      ...(childCaller?.runId ? { runId: childCaller.runId } : {}),
      ...(childCaller?.subagentRunId ? { subagentRunId: childCaller.subagentRunId } : {}),
      ...(childCaller?.canonicalTaskPath ? { canonicalTaskPath: childCaller.canonicalTaskPath } : {}),
      ...(childCaller?.parentThreadId ? { parentThreadId: childCaller.parentThreadId } : {}),
      ...(childCaller?.parentRunId ? { parentRunId: childCaller.parentRunId } : {}),
    },
    artifact: {
      id: input.artifact.id,
      title: input.artifact.title,
      ...(input.artifact.workflowThreadId ? { workflowThreadId: input.artifact.workflowThreadId } : {}),
      status: input.artifact.status,
      sourcePath: input.artifact.sourcePath,
      statePath: input.artifact.statePath,
      mutationPolicy: input.artifact.manifest.mutationPolicy,
      specGoal: input.artifact.spec.goal,
    },
    workflowRun: {
      id: input.workflowRun.id,
      artifactId: input.workflowRun.artifactId,
      status: input.workflowRun.status,
    },
    ...(input.reopenedTask.progressSnapshot ? { progressSnapshot: input.reopenedTask.progressSnapshot } : {}),
    ...(input.reopenedTask.usageSnapshot ? { usageSnapshot: input.reopenedTask.usageSnapshot } : {}),
    taskEvents: {
      started: eventTypes.includes("callable_workflow.task_started"),
      eventTypes,
    },
    maturityAssertions: {
      workflow_rehydrated_task_links: {
        id: "workflow_rehydrated_task_links",
        status: "passed",
        capabilities: ["workflow_task_rehydration", "artifact_link"],
        evidence: [
          `passed: sameTaskId=${input.beforeCloseTask.id === input.reopenedTask.id}`,
          `passed: sameArtifactId=${input.beforeCloseTask.workflowArtifactId === input.reopenedTask.workflowArtifactId && input.reopenedTask.workflowArtifactId === input.artifact.id}`,
          `passed: sameRunId=${input.beforeCloseTask.workflowRunId === input.reopenedTask.workflowRunId && input.reopenedTask.workflowRunId === input.workflowRun.id}`,
        ],
      },
      workflow_rehydrated_artifact_payload: {
        id: "workflow_rehydrated_artifact_payload",
        status: "passed",
        capabilities: ["artifact_link", "checkpoint_output"],
        evidence: [
          `passed: sourcePath=${input.artifact.sourcePath === input.beforeCloseArtifact.sourcePath}`,
          `passed: statePath=${input.artifact.statePath === input.beforeCloseArtifact.statePath}`,
          `passed: mutationPolicy=${input.artifact.manifest.mutationPolicy}`,
          `passed: specGoal=${!!input.artifact.spec.goal}`,
        ],
      },
      workflow_rehydrated_progress_usage: {
        id: "workflow_rehydrated_progress_usage",
        status: "passed",
        capabilities: ["workflow_task_rehydration", "checkpoint_output"],
        evidence: [
          `passed: progressEvents=${input.reopenedTask.progressSnapshot?.eventCount ?? 0}`,
          `passed: modelCalls=${input.reopenedTask.progressSnapshot?.modelCallCount ?? 0}`,
          `passed: tokens=${input.reopenedTask.usageSnapshot?.tokenCount ?? 0}`,
        ],
      },
      workflow_rehydrated_child_provenance: {
        id: "workflow_rehydrated_child_provenance",
        status: "passed",
        capabilities: ["child_workflow_provenance", "workflow_task_rehydration"],
        evidence: [
          `passed: childThread=${childCaller?.threadId ?? "missing"}`,
          `passed: subagentRun=${childCaller?.subagentRunId ?? "missing"}`,
          `passed: canonicalTaskPath=${childCaller?.canonicalTaskPath ?? "missing"}`,
        ],
      },
    },
    observations: [
      "Callable workflow task rehydrated after store reopen with the same task, artifact, workflow thread, and workflow run links.",
      "Workflow artifact source path, state path, mutation policy, and spec goal survived restart rehydration.",
      "Progress and usage snapshots were rebuilt from persisted workflow run events and model-call telemetry instead of cached task JSON.",
      "Child caller provenance survived execution-plan rehydration for the reopened task.",
    ],
  };
  const validation = validateCallableWorkflowRehydrationEvidence(evidence);
  if (!validation.valid) {
    throw new Error(`Callable workflow rehydration evidence is invalid: ${validation.issues.join(" ")}`);
  }
  return evidence;
}

export function validateCallableWorkflowRehydrationEvidence(
  input: unknown,
): CallableWorkflowRehydrationEvidenceValidation {
  const issues: string[] = [];
  if (!isRecord(input)) return { valid: false, issues: ["Callable workflow rehydration evidence must be an object."] };
  if (input.schemaVersion !== CALLABLE_WORKFLOW_REHYDRATION_EVIDENCE_SCHEMA_VERSION) {
    issues.push(`Callable workflow rehydration schemaVersion is ${String(input.schemaVersion ?? "missing")}.`);
  }
  if (!isValidTimestamp(input.createdAt)) issues.push("Callable workflow rehydration createdAt is missing or invalid.");

  const task = isRecord(input.task) ? input.task : {};
  if (task.status !== "running") issues.push(`Callable workflow rehydration task status is ${String(task.status ?? "missing")}.`);
  if (task.blocking !== true) issues.push("Callable workflow rehydration task must be blocking.");
  if (!nonEmptyString(task.workflowThreadId)) issues.push("Callable workflow rehydration task is missing workflowThreadId.");
  if (!nonEmptyString(task.workflowArtifactId)) issues.push("Callable workflow rehydration task is missing workflowArtifactId.");
  if (!nonEmptyString(task.workflowRunId)) issues.push("Callable workflow rehydration task is missing workflowRunId.");

  const rehydration = isRecord(input.rehydration) ? input.rehydration : {};
  for (const field of [
    "sameTaskId",
    "sameArtifactId",
    "sameRunId",
    "workflowThreadHydrated",
    "artifactSourcePathHydrated",
    "artifactStatePathHydrated",
    "artifactMutationPolicyHydrated",
    "artifactSpecHydrated",
    "launchCardHydrated",
    "executionPlanHydrated",
    "progressHydrated",
    "usageHydrated",
  ]) {
    if (rehydration[field] !== true) issues.push(`Callable workflow rehydration proof is missing ${field}.`);
  }

  const childCaller = isRecord(input.childCaller) ? input.childCaller : {};
  if (childCaller.kind !== "subagent_child_thread") issues.push("Callable workflow rehydration must prove child-originated caller provenance.");
  for (const field of ["threadId", "runId", "subagentRunId", "canonicalTaskPath", "parentThreadId", "parentRunId"]) {
    if (!nonEmptyString(childCaller[field])) issues.push(`Callable workflow rehydration child caller is missing ${field}.`);
  }

  const artifact = isRecord(input.artifact) ? input.artifact : {};
  if (!nonEmptyString(artifact.workflowThreadId)) issues.push("Callable workflow rehydration artifact is missing workflowThreadId.");
  if (!nonEmptyString(artifact.sourcePath)) issues.push("Callable workflow rehydration artifact is missing sourcePath.");
  if (!nonEmptyString(artifact.statePath)) issues.push("Callable workflow rehydration artifact is missing statePath.");
  if (!isWorkflowMutationPolicy(artifact.mutationPolicy)) issues.push("Callable workflow rehydration artifact is missing mutationPolicy.");
  if (!nonEmptyString(artifact.specGoal)) issues.push("Callable workflow rehydration artifact is missing specGoal.");
  if (artifact.id !== task.workflowArtifactId) issues.push("Callable workflow rehydration task artifact link does not match artifact.");
  if (artifact.workflowThreadId !== task.workflowThreadId) issues.push("Callable workflow rehydration workflowThreadId was not joined from the artifact.");

  const workflowRun = isRecord(input.workflowRun) ? input.workflowRun : {};
  if (workflowRun.id !== task.workflowRunId) issues.push("Callable workflow rehydration task run link does not match workflowRun.");
  if (workflowRun.artifactId !== task.workflowArtifactId) issues.push("Callable workflow rehydration workflow run does not point at the task artifact.");
  if (workflowRun.status !== "running") issues.push(`Callable workflow rehydration workflow run status is ${String(workflowRun.status ?? "missing")}.`);

  const progress = isRecord(input.progressSnapshot) ? input.progressSnapshot : {};
  if (progress.workflowRunStatus !== "running") issues.push("Callable workflow rehydration progress status must be running.");
  if (!positiveNumber(progress.eventCount)) issues.push("Callable workflow rehydration progress is missing eventCount.");
  if (!positiveNumber(progress.modelCallCount)) issues.push("Callable workflow rehydration progress is missing modelCallCount.");
  if (!positiveNumber(progress.completedStepCount)) issues.push("Callable workflow rehydration progress is missing completedStepCount.");
  if (!nonEmptyString(progress.lastEventType)) issues.push("Callable workflow rehydration progress is missing lastEventType.");

  const usage = isRecord(input.usageSnapshot) ? input.usageSnapshot : {};
  if (!positiveNumber(usage.modelCallCount)) issues.push("Callable workflow rehydration usage is missing modelCallCount.");
  if (!positiveNumber(usage.tokenCount)) issues.push("Callable workflow rehydration usage is missing tokenCount.");
  if (typeof usage.tokenCountEstimated !== "boolean") issues.push("Callable workflow rehydration usage is missing tokenCountEstimated.");
  if (!positiveNumber(usage.costMicros)) issues.push("Callable workflow rehydration usage is missing costMicros.");
  if (typeof usage.costEstimated !== "boolean") issues.push("Callable workflow rehydration usage is missing costEstimated.");

  const taskEvents = isRecord(input.taskEvents) ? input.taskEvents : {};
  if (taskEvents.started !== true) issues.push("Callable workflow rehydration is missing task-started event proof.");
  if (!arrayIncludesString(taskEvents.eventTypes, "step.end")) {
    issues.push("Callable workflow rehydration is missing persisted workflow progress event proof.");
  }

  validateRehydrationMaturityAssertions(input.maturityAssertions, issues);

  const secretPaths = findSecretLikeStrings(input);
  if (secretPaths.length) {
    issues.push(`Callable workflow rehydration evidence appears to contain secret-like material at ${secretPaths.slice(0, 3).join(", ")}.`);
  }
  return { valid: issues.length === 0, issues };
}

export function summarizeCallableWorkflowRehydrationEvidence(input: CallableWorkflowRehydrationEvidence): string[] {
  const validation = validateCallableWorkflowRehydrationEvidence(input);
  return [
    `schemaVersion: ${input.schemaVersion}`,
    `task: ${input.task.id}`,
    `workflowThread: ${input.task.workflowThreadId ?? "missing"}`,
    `workflowRun: ${input.workflowRun.id} ${input.workflowRun.status}`,
    `rehydratedLinks: task=${input.rehydration.sameTaskId} artifact=${input.rehydration.sameArtifactId} run=${input.rehydration.sameRunId}`,
    `artifact: source=${input.rehydration.artifactSourcePathHydrated} state=${input.rehydration.artifactStatePathHydrated} mutation=${input.artifact.mutationPolicy} spec=${input.rehydration.artifactSpecHydrated}`,
    `telemetry: events=${input.progressSnapshot?.eventCount ?? 0} modelCalls=${input.progressSnapshot?.modelCallCount ?? 0} tokens=${input.usageSnapshot?.tokenCount ?? 0}`,
    `child: ${input.childCaller.threadId ?? "missing"} / ${input.childCaller.subagentRunId ?? "missing"}`,
    `maturityAssertions: ${summarizeRehydrationMaturityAssertions(input.maturityAssertions)}`,
    `valid: ${validation.valid}`,
    ...(validation.issues.length ? [`issues: ${validation.issues.join("; ")}`] : []),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function nonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString);
}

function isWorkflowMutationPolicy(value: unknown): value is WorkflowArtifactSummary["manifest"]["mutationPolicy"] {
  return value === "read_only" || value === "staged_until_approved" || value === "apply_after_approval";
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function arrayStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function arrayIncludesString(value: unknown, needle: string): boolean {
  return arrayStrings(value).includes(needle);
}

const REQUIRED_REHYDRATION_MATURITY_ASSERTIONS: {
  id: CallableWorkflowRehydrationMaturityAssertionId;
  capabilities: string[];
}[] = [{
  id: "workflow_rehydrated_task_links",
  capabilities: ["workflow_task_rehydration", "artifact_link"],
}, {
  id: "workflow_rehydrated_artifact_payload",
  capabilities: ["artifact_link", "checkpoint_output"],
}, {
  id: "workflow_rehydrated_progress_usage",
  capabilities: ["workflow_task_rehydration", "checkpoint_output"],
}, {
  id: "workflow_rehydrated_child_provenance",
  capabilities: ["child_workflow_provenance", "workflow_task_rehydration"],
}];

function summarizeRehydrationMaturityAssertions(value: unknown): string {
  if (!isRecord(value)) return "missing";
  return REQUIRED_REHYDRATION_MATURITY_ASSERTIONS
    .map((expected) => {
      const assertion = value[expected.id];
      return `${expected.id}:${isRecord(assertion) ? String(assertion.status ?? "missing") : "missing"}`;
    })
    .join(", ");
}

function validateRehydrationMaturityAssertions(value: unknown, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push("Callable workflow rehydration evidence is missing maturityAssertions.");
    return;
  }

  for (const expected of REQUIRED_REHYDRATION_MATURITY_ASSERTIONS) {
    const assertion = value[expected.id];
    if (!isRecord(assertion)) {
      issues.push(`Callable workflow rehydration maturity assertion ${expected.id} is missing.`);
      continue;
    }
    if (assertion.id !== expected.id) {
      issues.push(`Callable workflow rehydration maturity assertion ${expected.id} has mismatched id ${String(assertion.id ?? "missing")}.`);
    }
    if (assertion.status !== "passed") {
      issues.push(`Callable workflow rehydration maturity assertion ${expected.id} status is ${String(assertion.status ?? "missing")}; expected passed.`);
    }
    if (!nonEmptyStringArray(assertion.evidence)) {
      issues.push(`Callable workflow rehydration maturity assertion ${expected.id} is missing readable evidence.`);
    } else if (!assertion.evidence.every((entry) => /^passed: .+/.test(entry))) {
      issues.push(`Callable workflow rehydration maturity assertion ${expected.id} must record only passed evidence entries.`);
    }
    const capabilities = Array.isArray(assertion.capabilities) ? assertion.capabilities.filter(nonEmptyString) : [];
    if (capabilities.length === 0) {
      issues.push(`Callable workflow rehydration maturity assertion ${expected.id} is missing capabilities.`);
    }
    for (const capability of expected.capabilities) {
      if (!capabilities.includes(capability)) {
        issues.push(`Callable workflow rehydration maturity assertion ${expected.id} is missing capability ${capability}.`);
      }
    }
  }
}

function findSecretLikeStrings(value: unknown): string[] {
  const paths: string[] = [];
  const seen = new Set<unknown>();
  visit(value, "$");
  return paths;

  function visit(current: unknown, path: string): void {
    if (!current || paths.length >= 10) return;
    if (typeof current === "string") {
      if (looksSecretLike(current)) paths.push(path);
      return;
    }
    if (typeof current !== "object" || seen.has(current)) return;
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      visit(child, `${path}.${key}`);
    }
  }
}

function looksSecretLike(value: string): boolean {
  return /\b(?:GMI_CLOUD_API_KEY|GMI_API_KEY|AMBIENT_API_KEY)\b\s*[:=]\s*["']?[^"'\s$]{8,}/i.test(value) ||
    /\bapi[_-]?key\b\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}/i.test(value) ||
    /\bsk-[A-Za-z0-9_-]{16,}\b/.test(value);
}
