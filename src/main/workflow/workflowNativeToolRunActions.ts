import type {
  WorkflowArtifactSummary,
  WorkflowManifest,
  WorkflowRevisionSummary,
  WorkflowRunLimitOverrides,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import { readWorkflowRunDetail } from "./workflowDashboard";
import { workflowApplyRevision, latestVersionForArtifact } from "./workflowNativeToolActions";
import {
  type WorkflowNativeToolRuntime,
  isRecord,
  optionalString,
  positiveIntegerValue,
  requiredString,
  requireWorkflowThreadId,
  selectWorkflowArtifact,
  summarizeArtifact,
} from "./workflowNativeToolShared";
import { manifestRevisionRequestedChange, workflowProposeManifestRevision } from "./workflowNativeToolRevisionActions";
import { restoreWorkflowVersion } from "./workflowVersionRestore";

const DEFAULT_WORKFLOW_NATIVE_IDLE_TIMEOUT_MS = 120_000;

export async function workflowUpdateRunSettings(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const workflowThreadId = requireWorkflowThreadId(args);
  const action = workflowRunSettingsAction(args.action);
  const selected = selectWorkflowArtifact(runtime.store, args);
  if (!selected.artifact) {
    return {
      updated: false,
      action,
      reason: "No active workflow artifact is selected.",
    };
  }
  const normalized = workflowRunSettingsManifestArgs(args);
  if (!normalized.ok) {
    return {
      updated: false,
      action,
      reason: normalized.error,
    };
  }

  if (action === "preview_foreground") {
    return {
      updated: false,
      action,
      workflowThreadId,
      artifact: summarizeArtifact(selected.artifact),
      runLimits: workflowRunLimitOverridesFromSettings(selected.artifact.manifest, args),
      persistentChange: false,
      note: "Foreground run settings preview only. Pass the returned runLimits to a workflow run action; no workflow revision was created.",
    };
  }

  const proposal = await workflowProposeManifestRevision(runtime, {
    workflowThreadId,
    artifactId: selected.artifact.id,
    versionId: selected.version?.id,
    requestedChange: optionalString(args.requestedChange) ?? workflowRunSettingsRequestedChange(args),
    ...normalized.args,
  });
  const proposalRevisionValue = isRecord(proposal) ? (proposal as { revision?: unknown }).revision : undefined;
  if (!isRecord(proposal) || proposal.created !== true || !isRecord(proposalRevisionValue)) {
    return {
      updated: false,
      action,
      proposal,
      reason: "Run settings proposal was not created.",
    };
  }
  const proposalRevision = proposalRevisionValue as unknown as WorkflowRevisionSummary;

  if (action === "propose_persistent") {
    return {
      updated: false,
      action,
      proposal,
      revision: proposalRevision,
      runLimits: workflowRunLimitOverridesFromSettings(selected.artifact.manifest, args),
      note: "Persistent run settings revision proposed for review. It was not applied.",
    };
  }

  const applied = await workflowApplyRevision(runtime, { workflowThreadId, revisionId: proposalRevision.id });
  return {
    updated: isRecord(applied) && applied.applied === true,
    action,
    proposal,
    applied,
    revision: isRecord(applied) ? applied.revision : proposalRevision,
    runLimits: workflowRunLimitOverridesFromSettings(selected.artifact.manifest, args),
    note: "Persistent run settings revision was proposed and applied.",
  };
}

export async function workflowRestoreVersion(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const workflowThreadId = requireWorkflowThreadId(args);
  const versionId = requiredString(args.versionId, "versionId");
  const targetVersion = runtime.store.getWorkflowVersion(versionId);
  if (targetVersion.workflowThreadId !== workflowThreadId) {
    throw new Error(`Workflow version ${versionId} does not belong to workflow thread ${workflowThreadId}.`);
  }
  const approveRestored = args.approveRestored === true;
  await restoreWorkflowVersion(
    runtime.store,
    { versionId, approveRestored },
    { connectorDescriptors: runtime.connectorDescriptors?.() ?? [] },
  );
  const restoredVersion = runtime.store.listWorkflowVersions(workflowThreadId)[0];
  const audit = recordWorkflowRestoreFullAccessAudit(runtime, {
    workflowThreadId,
    targetVersion,
    restoredVersion,
    approveRestored,
  });
  return {
    restored: true,
    workflowThreadId,
    targetVersion,
    restoredVersion,
    approveRestored,
    audit,
    note: approveRestored
      ? `Restored workflow version ${targetVersion.version} and approved the new version ${restoredVersion?.version ?? "unknown"} as latest.`
      : `Restored workflow version ${targetVersion.version} as new review version ${restoredVersion?.version ?? "unknown"}.`,
  };
}

export async function workflowRunPreview(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const workflowThreadId = requireWorkflowThreadId(args);
  const selected = selectWorkflowArtifact(runtime.store, args);
  if (!selected.artifact) {
    return {
      previewed: false,
      workflowThreadId,
      reason: "No active workflow artifact is selected.",
    };
  }
  if (!runtime.runWorkflowArtifact) {
    return {
      previewed: false,
      workflowThreadId,
      artifact: summarizeArtifact(selected.artifact),
      reason: "Workflow preview execution is not available in this runtime.",
    };
  }

  const beforeRunIds = new Set(runtime.store.listWorkflowRuns(selected.artifact.id, 100).map((run) => run.id));
  const runLimits = workflowRunLimitOverridesFromSettings(selected.artifact.manifest, args);
  const dashboard = await runtime.runWorkflowArtifact({
    artifactId: selected.artifact.id,
    mode: "dry_run",
    runtime: "workflow",
    allowUnapproved: true,
    runLimits,
  });
  const run =
    runtime.store.listWorkflowRuns(selected.artifact.id, 100).find((candidate) => !beforeRunIds.has(candidate.id)) ??
    dashboard.runs.find((candidate) => candidate.artifactId === selected.artifact?.id);
  const detail = run ? readWorkflowRunDetail(runtime.store, run.id) : undefined;
  const audit = run
    ? recordWorkflowRunPreviewFullAccessAudit(runtime, { workflowThreadId, artifact: selected.artifact, runId: run.id, runLimits })
    : undefined;
  return {
    previewed: true,
    workflowThreadId,
    artifact: summarizeArtifact(selected.artifact),
    run: detail?.run ?? run,
    runLimits,
    trace: detail
      ? {
          eventCount: detail.events.length,
          modelCallCount: detail.modelCalls.length,
          checkpointCount: detail.checkpoints.length,
          approvalCount: detail.approvals.length,
          lastEvent: detail.events.at(-1),
        }
      : undefined,
    audit,
    note: run
      ? `Dry-run preview completed with run ${run.id}.`
      : "Dry-run preview completed, but no new run was found in the workflow dashboard.",
  };
}

export async function workflowRunVersion(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const workflowThreadId = requireWorkflowThreadId(args);
  const selected = selectWorkflowArtifact(runtime.store, args);
  if (!selected.artifact) {
    return {
      ran: false,
      workflowThreadId,
      reason: "No active workflow artifact is selected.",
    };
  }
  if (!runtime.runWorkflowArtifact) {
    return {
      ran: false,
      workflowThreadId,
      artifact: summarizeArtifact(selected.artifact),
      reason: "Workflow execution is not available in this runtime.",
    };
  }

  const targetVersion = selected.version ?? latestVersionForArtifact(runtime, selected.artifact.id);
  if (selected.version && selected.thread.latestVersion?.id !== selected.version.id) {
    return {
      ran: false,
      workflowThreadId,
      artifact: summarizeArtifact(selected.artifact),
      targetVersion: selected.version,
      reason:
        "workflow_run_version can only execute the active/latest materialized version. Restore the selected version first, then run it.",
    };
  }
  const allowUnapproved = args.allowUnapproved === true;
  const approved = selected.artifact.status === "approved" && (!targetVersion || targetVersion.status === "approved");
  if (!approved && !allowUnapproved) {
    return {
      ran: false,
      workflowThreadId,
      artifact: summarizeArtifact(selected.artifact),
      targetVersion,
      reason: "Approve this workflow before running it, or pass allowUnapproved true for an audited one-off run.",
    };
  }

  const beforeRunIds = new Set(runtime.store.listWorkflowRuns(selected.artifact.id, 100).map((run) => run.id));
  const runLimits = workflowRunLimitOverridesFromSettings(selected.artifact.manifest, args);
  const dashboard = await runtime.runWorkflowArtifact({
    artifactId: selected.artifact.id,
    mode: "execute",
    runtime: "workflow",
    allowUnapproved,
    runLimits,
  });
  const run =
    runtime.store.listWorkflowRuns(selected.artifact.id, 100).find((candidate) => !beforeRunIds.has(candidate.id)) ??
    dashboard.runs.find((candidate) => candidate.artifactId === selected.artifact?.id);
  const detail = run ? readWorkflowRunDetail(runtime.store, run.id) : undefined;
  const audit = run
    ? recordWorkflowRunVersionFullAccessAudit(runtime, {
        workflowThreadId,
        artifact: selected.artifact,
        version: targetVersion,
        runId: run.id,
        allowUnapproved,
        runLimits,
      })
    : undefined;
  return {
    ran: true,
    workflowThreadId,
    artifact: summarizeArtifact(selected.artifact),
    version: targetVersion,
    run: detail?.run ?? run,
    allowUnapproved,
    runLimits,
    trace: detail
      ? {
          eventCount: detail.events.length,
          modelCallCount: detail.modelCalls.length,
          checkpointCount: detail.checkpoints.length,
          approvalCount: detail.approvals.length,
          lastEvent: detail.events.at(-1),
        }
      : undefined,
    audit,
    note: run
      ? `Workflow execution completed with run ${run.id}.`
      : "Workflow execution completed, but no new run was found in the workflow dashboard.",
  };
}

function recordWorkflowRunPreviewFullAccessAudit(
  runtime: WorkflowNativeToolRuntime,
  input: {
    workflowThreadId: string;
    artifact: WorkflowArtifactSummary;
    runId: string;
    runLimits: WorkflowRunLimitOverrides;
  },
) {
  if (runtime.permissionMode !== "full-access") return undefined;
  const thread = runtime.store.getWorkflowAgentThreadSummary(input.workflowThreadId);
  if (!thread.chatThreadId) return undefined;
  return runtime.store.addPermissionAudit({
    threadId: thread.chatThreadId,
    permissionMode: runtime.permissionMode,
    toolName: "workflow_run_preview",
    risk: "workspace-command",
    decision: "allowed",
    detail: [
      `Workflow thread: ${input.workflowThreadId}`,
      `Artifact: ${input.artifact.id}`,
      `Run: ${input.runId}`,
      `Idle timeout: ${input.runLimits.idleTimeoutMs ?? "default"}`,
      `Total runtime cap: ${input.runLimits.maxRunMs ?? "none"}`,
    ].join("\n"),
    reason: "Allowed by Full Access workflow-native run-preview policy.",
    decisionSource: "allowed_by_full_access",
  });
}

function recordWorkflowRunVersionFullAccessAudit(
  runtime: WorkflowNativeToolRuntime,
  input: {
    workflowThreadId: string;
    artifact: WorkflowArtifactSummary;
    version?: WorkflowVersionSummary;
    runId: string;
    allowUnapproved: boolean;
    runLimits: WorkflowRunLimitOverrides;
  },
) {
  if (runtime.permissionMode !== "full-access") return undefined;
  const thread = runtime.store.getWorkflowAgentThreadSummary(input.workflowThreadId);
  if (!thread.chatThreadId) return undefined;
  return runtime.store.addPermissionAudit({
    threadId: thread.chatThreadId,
    permissionMode: runtime.permissionMode,
    toolName: "workflow_run_version",
    risk: "workspace-command",
    decision: "allowed",
    detail: [
      `Workflow thread: ${input.workflowThreadId}`,
      `Artifact: ${input.artifact.id}`,
      `Version: ${input.version?.id ?? "unknown"}${input.version ? ` (v${input.version.version})` : ""}`,
      `Run: ${input.runId}`,
      `Allow unapproved: ${input.allowUnapproved ? "yes" : "no"}`,
      `Idle timeout: ${input.runLimits.idleTimeoutMs ?? "default"}`,
      `Total runtime cap: ${input.runLimits.maxRunMs ?? "none"}`,
    ].join("\n"),
    reason: "Allowed by Full Access workflow-native run-version policy.",
    decisionSource: "allowed_by_full_access",
  });
}

function recordWorkflowRestoreFullAccessAudit(
  runtime: WorkflowNativeToolRuntime,
  input: {
    workflowThreadId: string;
    targetVersion: WorkflowVersionSummary;
    restoredVersion?: WorkflowVersionSummary;
    approveRestored: boolean;
  },
) {
  if (runtime.permissionMode !== "full-access") return undefined;
  const thread = runtime.store.getWorkflowAgentThreadSummary(input.workflowThreadId);
  if (!thread.chatThreadId) return undefined;
  return runtime.store.addPermissionAudit({
    threadId: thread.chatThreadId,
    permissionMode: runtime.permissionMode,
    toolName: "workflow_restore_version",
    risk: "workspace-command",
    decision: "allowed",
    detail: [
      `Workflow thread: ${input.workflowThreadId}`,
      `Target version: ${input.targetVersion.id} (v${input.targetVersion.version})`,
      `Restored version: ${input.restoredVersion?.id ?? "unknown"}${input.restoredVersion ? ` (v${input.restoredVersion.version})` : ""}`,
      `Approved restored version: ${input.approveRestored ? "yes" : "no"}`,
    ].join("\n"),
    reason: "Allowed by Full Access workflow-native restore policy.",
    decisionSource: "allowed_by_full_access",
  });
}

function workflowRunSettingsAction(value: unknown): "preview_foreground" | "propose_persistent" | "apply_persistent" {
  if (value === "preview_foreground" || value === "propose_persistent" || value === "apply_persistent") return value;
  return "propose_persistent";
}

function workflowRunSettingsManifestArgs(
  args: Record<string, unknown>,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  const patch: Record<string, unknown> = {};
  for (const key of [
    "maxToolCalls",
    "maxModelCalls",
    "maxConnectorCalls",
    "maxRunMs",
    "clearMaxToolCalls",
    "clearMaxModelCalls",
    "clearMaxConnectorCalls",
    "clearMaxRunMs",
  ]) {
    if (args[key] !== undefined) patch[key] = args[key];
  }
  if (args.idleTimeoutMs !== undefined && args.defaultIdleTimeoutMs !== undefined) {
    return { ok: false, error: "Pass either idleTimeoutMs or defaultIdleTimeoutMs, not both." };
  }
  if (args.defaultIdleTimeoutMs !== undefined) patch.defaultIdleTimeoutMs = args.defaultIdleTimeoutMs;
  if (args.idleTimeoutMs !== undefined) patch.defaultIdleTimeoutMs = args.idleTimeoutMs;
  if (args.clearDefaultIdleTimeoutMs === true || args.clearIdleTimeoutMs === true) patch.clearDefaultIdleTimeoutMs = true;
  return { ok: true, args: patch };
}

function workflowRunLimitOverridesFromSettings(manifest: WorkflowManifest, args: Record<string, unknown>) {
  const idleTimeoutMs =
    args.clearDefaultIdleTimeoutMs === true || args.clearIdleTimeoutMs === true
      ? DEFAULT_WORKFLOW_NATIVE_IDLE_TIMEOUT_MS
      : (positiveIntegerValue(args.idleTimeoutMs) ??
        positiveIntegerValue(args.defaultIdleTimeoutMs) ??
        positiveIntegerValue(manifest.defaultIdleTimeoutMs) ??
        DEFAULT_WORKFLOW_NATIVE_IDLE_TIMEOUT_MS);
  const maxRunMs =
    args.clearMaxRunMs === true ? null : (positiveIntegerValue(args.maxRunMs) ?? positiveIntegerValue(manifest.maxRunMs) ?? null);
  return {
    idleTimeoutMs,
    maxRunMs,
  };
}

function workflowRunSettingsRequestedChange(args: Record<string, unknown>): string {
  const next = {
    ...args,
    defaultIdleTimeoutMs: args.defaultIdleTimeoutMs ?? args.idleTimeoutMs,
  };
  return `Update workflow run settings: ${manifestRevisionRequestedChange(next)
    .replace(/^Manifest-only edit:\s*/, "")
    .replace(/\.$/, "")}.`;
}
