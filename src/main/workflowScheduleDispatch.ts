import type { AutomationScheduleSummary, PermissionAuditEntry, WorkflowArtifactSummary, WorkflowRunLimitOverrides } from "../shared/types";
import {
  workflowArtifactScheduleBlockReason,
  workflowArtifactScheduleConnectorGrantUses,
  type WorkflowArtifactScheduleBlockOptions,
} from "../shared/workflowSchedulePolicy";
import type { ProjectStore } from "./projectStore";

export { workflowArtifactScheduleBlockReason } from "../shared/workflowSchedulePolicy";

export type WorkflowScheduleGrantDecisionSource = "none" | "persistent_grant" | "full_access_bypass";

export interface WorkflowScheduleGrantDecision {
  source: WorkflowScheduleGrantDecisionSource;
  connectorTargets: string[];
  grantIds: string[];
  grantTargets: string[];
}

export interface WorkflowScheduleRunnerInput {
  schedule: AutomationScheduleSummary;
  artifact: WorkflowArtifactSummary;
  now: Date;
  workflowThreadId?: string;
  versionId?: string;
  runLimits?: WorkflowRunLimitOverrides;
  occurrenceExceptionId?: string;
  grantDecision: WorkflowScheduleGrantDecision;
}

export interface WorkflowScheduleRunnerResult {
  runId?: string;
}

export interface WorkflowScheduleDispatchResult {
  scheduleId: string;
  artifactId?: string;
  workflowThreadId?: string;
  versionId?: string;
  outcome: "started" | "skipped";
  runId?: string;
  reason?: string;
}

export interface WorkflowScheduleDispatchOptions extends WorkflowArtifactScheduleBlockOptions {
  onPermissionAuditCreated?: (entry: PermissionAuditEntry) => void;
}

export function workflowScheduleRunStartedEventData(input: WorkflowScheduleRunnerInput): Record<string, unknown> {
  return {
    scheduleId: input.schedule.id,
    targetKind: input.schedule.targetKind,
    targetId: input.schedule.targetId,
    targetLabel: input.schedule.targetLabel,
    nextRunAt: input.schedule.nextRunAt,
    artifactId: input.artifact.id,
    workflowThreadId: input.workflowThreadId ?? input.artifact.workflowThreadId,
    versionId: input.versionId,
    targetVersionId: input.versionId,
    createdTargetVersionId: input.schedule.createdTargetVersionId,
    grantDecisionSource: input.grantDecision.source,
    connectorTargets: input.grantDecision.connectorTargets,
    grantIds: input.grantDecision.grantIds,
    grantTargets: input.grantDecision.grantTargets,
    runLimits: input.runLimits,
    occurrenceExceptionId: input.occurrenceExceptionId,
  };
}

export async function runDueWorkflowArtifactSchedules(
  store: ProjectStore,
  now = new Date(),
  runner: (input: WorkflowScheduleRunnerInput) => Promise<WorkflowScheduleRunnerResult>,
  options: WorkflowScheduleDispatchOptions = {},
): Promise<WorkflowScheduleDispatchResult[]> {
  const dueSchedules = store
    .listDueAutomationSchedules(now)
    .filter((schedule) => schedule.targetKind === "workflow_artifact" || schedule.targetKind === "workflow_thread" || schedule.targetKind === "workflow_version");
  const results: WorkflowScheduleDispatchResult[] = [];

  for (const schedule of dueSchedules) {
    const resolved = resolveWorkflowScheduleTarget(store, schedule);
    const occurrenceException = store.consumePendingAutomationScheduleOccurrenceException(schedule.id, schedule.nextRunAt, now);
    if (occurrenceException?.exceptionKind === "reschedule") {
      results.push({
        scheduleId: schedule.id,
        workflowThreadId: resolved.workflowThreadId,
        outcome: "skipped",
        reason: occurrenceException.replacementRunAt
          ? `Schedule occurrence was rescheduled to ${occurrenceException.replacementRunAt}.`
          : "Schedule occurrence was rescheduled.",
      });
      continue;
    }
    if (!resolved.artifact) {
      store.advanceAutomationSchedule(schedule.id, now);
      results.push({
        scheduleId: schedule.id,
        workflowThreadId: resolved.workflowThreadId,
        outcome: "skipped",
        reason: resolved.reason ?? "Workflow schedule target could not be resolved.",
      });
      continue;
    }
    const { artifact, versionId, workflowThreadId } = resolved;
    if (occurrenceException?.exceptionKind === "skip") {
      const reason = occurrenceException.reason ?? "Schedule occurrence skipped by user.";
      const run = store.startWorkflowRun({ artifactId: artifact.id, status: "skipped" });
      store.appendWorkflowRunEvent({
        runId: run.id,
        type: "workflow.schedule.skipped",
        message: reason,
        data: {
          scheduleId: schedule.id,
          artifactId: artifact.id,
          workflowThreadId,
          versionId,
          artifactStatus: artifact.status,
          nextRunAt: schedule.nextRunAt,
          scheduleExceptionId: occurrenceException.id,
        },
      });
      store.updateWorkflowRun({ id: run.id, status: "skipped", error: reason, finish: true });
      store.advanceAutomationSchedule(schedule.id, now);
      results.push({ scheduleId: schedule.id, artifactId: artifact.id, workflowThreadId, versionId, outcome: "skipped", runId: run.id, reason });
      continue;
    }
    const workspacePath = options.workspacePath ?? store.getWorkspace().path;
    const blockedReason =
      resolved.reason ??
      workflowArtifactScheduleBlockReason(artifact, {
        ...options,
        permissionGrants: options.permissionGrants ?? store.listPermissionGrants(),
        workflowThreadId,
        projectPath: options.projectPath ?? workspacePath,
        workspacePath,
      });
    if (blockedReason) {
      const run = store.startWorkflowRun({ artifactId: artifact.id, status: "skipped" });
      store.appendWorkflowRunEvent({
        runId: run.id,
        type: "workflow.schedule.skipped",
        message: blockedReason,
        data: {
          scheduleId: schedule.id,
          artifactId: artifact.id,
          workflowThreadId,
          versionId,
          artifactStatus: artifact.status,
          nextRunAt: schedule.nextRunAt,
        },
      });
      store.updateWorkflowRun({ id: run.id, status: "skipped", error: blockedReason, finish: true });
      store.advanceAutomationSchedule(schedule.id, now);
      results.push({ scheduleId: schedule.id, artifactId: artifact.id, workflowThreadId, versionId, outcome: "skipped", runId: run.id, reason: blockedReason });
      continue;
    }

    const grantUses = workflowArtifactScheduleConnectorGrantUses(artifact, {
      ...options,
      permissionGrants: options.permissionGrants ?? store.listPermissionGrants(),
      workflowThreadId,
      projectPath: options.projectPath ?? workspacePath,
      workspacePath,
    });
    const grantDecision = workflowScheduleGrantDecision(artifact, grantUses, options.permissionMode);

    for (const grantUse of grantUses) {
      const auditThreadId = options.threadId ?? store.getLastActiveThreadId();
      if (!auditThreadId) continue;
      const entry = store.addPermissionAudit({
        threadId: auditThreadId,
        permissionMode: options.permissionMode ?? "workspace",
        toolName: `${grantUse.connectorId}${grantUse.operation ? `.${grantUse.operation}` : ""}`,
        risk: "plugin-tool",
        decision: "allowed",
        detail: `Schedule ${schedule.id} reused ${grantUse.targetLabel} for ${artifact.title}.`,
        reason: "Scheduled workflow preflight reused a persistent connector grant.",
        decisionSource: "persistent_grant",
        grantId: grantUse.grant.id,
      });
      options.onPermissionAuditCreated?.(entry);
    }

    const runLimits =
      occurrenceException?.exceptionKind === "run_limits" && occurrenceException.runLimits ? occurrenceException.runLimits : schedule.runLimits;
    const started = await runner({ schedule, artifact, now, workflowThreadId, versionId, grantDecision, runLimits, occurrenceExceptionId: occurrenceException?.id });
    store.advanceAutomationSchedule(schedule.id, now);
    results.push({ scheduleId: schedule.id, artifactId: artifact.id, workflowThreadId, versionId, outcome: "started", runId: started.runId });
  }

  return results;
}

function resolveWorkflowScheduleTarget(
  store: ProjectStore,
  schedule: AutomationScheduleSummary,
): { artifact?: WorkflowArtifactSummary; workflowThreadId?: string; versionId?: string; reason?: string } {
  if (schedule.targetKind === "workflow_artifact") {
    const artifact = store.getWorkflowArtifact(schedule.targetId);
    return { artifact, workflowThreadId: artifact.workflowThreadId };
  }
  if (schedule.targetKind === "workflow_version") {
    const version = store.getWorkflowVersion(schedule.targetId);
    return {
      artifact: store.getWorkflowArtifact(version.artifactId),
      workflowThreadId: version.workflowThreadId,
      versionId: version.id,
      reason: version.status === "approved" ? undefined : `Pinned workflow version is ${version.status} and cannot be scheduled until approved.`,
    };
  }
  const thread = store.getWorkflowAgentThreadSummary(schedule.targetId);
  const version = store.getLatestApprovedWorkflowVersion(thread.id);
  if (!version) {
    const activeArtifact = thread.activeArtifactId ? store.getWorkflowArtifact(thread.activeArtifactId) : undefined;
    return {
      artifact: activeArtifact,
      workflowThreadId: thread.id,
      reason: "Workflow Agent has no approved version to schedule.",
    };
  }
  return {
    artifact: store.getWorkflowArtifact(version.artifactId),
    workflowThreadId: thread.id,
    versionId: version.id,
  };
}

function workflowScheduleGrantDecision(
  artifact: WorkflowArtifactSummary,
  grantUses: ReturnType<typeof workflowArtifactScheduleConnectorGrantUses>,
  _permissionMode: WorkflowArtifactScheduleBlockOptions["permissionMode"],
): WorkflowScheduleGrantDecision {
  const connectorTargets = workflowScheduleConnectorTargets(artifact);
  if (grantUses.length > 0) {
    return {
      source: "persistent_grant",
      connectorTargets,
      grantIds: grantUses.map((grantUse) => grantUse.grant.id),
      grantTargets: grantUses.map((grantUse) => grantUse.targetLabel),
    };
  }
  return {
    source: "none",
    connectorTargets,
    grantIds: [],
    grantTargets: [],
  };
}

function workflowScheduleConnectorTargets(artifact: WorkflowArtifactSummary): string[] {
  return [
    ...new Set(
      (artifact.manifest.connectors ?? []).flatMap((connector) =>
        connector.operations.length > 0 ? connector.operations.map((operation) => `${connector.connectorId}:${operation}`) : [connector.connectorId],
      ),
    ),
  ];
}
