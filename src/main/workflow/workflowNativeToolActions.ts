import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  WorkflowArtifactSummary,
  WorkflowManifest,
  WorkflowRevisionSummary,
  WorkflowVersionStatus,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import type { WorkflowGraphDiff } from "../../shared/workflowGraphDiff";
import {
  type WorkflowNativeToolRuntime,
  isRecord,
  requiredString,
  requireWorkflowThreadId,
  summarizeArtifact,
} from "./workflowNativeToolShared";
import {
  assertRevisionBelongsToThread,
  graphSnapshotById,
  isWorkflowGraphDiff,
  manifestFromUnknown,
  validateWorkflowRevisionCandidate,
  workflowRevisionCandidate,
} from "./workflowNativeToolRevisionActions";
import {
  validateWorkflowGraphOutput,
  validateWorkflowSourceConnectorReferences,
  validateWorkflowSourceGraphMappings,
  validateWorkflowSourceReferences,
} from "./workflowWorkflowCompilerFacade";

export async function workflowApplyRevision(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const workflowThreadId = requireWorkflowThreadId(args);
  const revisionId = requiredString(args.revisionId, "revisionId");
  const revision = runtime.store.getWorkflowRevision(revisionId);
  assertRevisionBelongsToThread(revision, workflowThreadId);

  if (revision.status === "rejected") {
    return {
      applied: false,
      reason: "Rejected workflow revisions cannot be applied. Create a new proposal instead.",
      revision,
    };
  }
  if (revision.status === "applied") {
    return workflowApplyRevisionPayload(runtime, revision, { alreadyApplied: true });
  }

  const materialized = await ensureWorkflowRevisionHasProposedVersion(runtime, revision);
  const validation = validateWorkflowRevisionCandidate(runtime, workflowRevisionCandidate(runtime, { workflowThreadId, revisionId }), {
    storedRevisionOnlyWarning: false,
  });
  if (!validation.valid) {
    return {
      applied: false,
      reason: "Stored workflow revision did not pass validation.",
      revision: materialized.revision,
      validation,
    };
  }

  const applied = runtime.store.resolveWorkflowRevision({ id: materialized.revision.id, decision: "applied" });
  const audit = recordWorkflowApplyFullAccessAudit(runtime, applied, materialized);
  return workflowApplyRevisionPayload(runtime, applied, {
    materializedVersion: materialized.created ? materialized.version : undefined,
    auditId: audit?.id,
  });
}

function workflowApplyRevisionPayload(
  runtime: WorkflowNativeToolRuntime,
  revision: WorkflowRevisionSummary,
  options: { alreadyApplied?: boolean; materializedVersion?: WorkflowVersionSummary; auditId?: string } = {},
) {
  const thread = runtime.store.getWorkflowAgentThreadSummary(revision.workflowThreadId);
  const activeArtifact = thread.activeArtifactId ? runtime.store.getWorkflowArtifact(thread.activeArtifactId) : undefined;
  return {
    applied: true,
    alreadyApplied: options.alreadyApplied ?? false,
    revision,
    thread: {
      id: thread.id,
      phase: thread.phase,
      status: thread.status,
      activeArtifactId: thread.activeArtifactId,
      activeGraphSnapshotId: thread.activeGraphSnapshotId,
    },
    activeArtifact: activeArtifact ? summarizeArtifact(activeArtifact) : undefined,
    latestVersion: thread.latestVersion,
    materializedVersion: options.materializedVersion,
    auditId: options.auditId,
    note: options.alreadyApplied
      ? "Revision was already applied; no workflow state changed."
      : "Revision applied and active workflow state now points at the applied version.",
  };
}

async function ensureWorkflowRevisionHasProposedVersion(
  runtime: WorkflowNativeToolRuntime,
  revision: WorkflowRevisionSummary,
): Promise<{ revision: WorkflowRevisionSummary; created: boolean; version?: WorkflowVersionSummary }> {
  if (revision.proposedVersionId) return { revision, created: false };
  const graphDiff = isWorkflowGraphDiff(revision.graphDiff) ? revision.graphDiff : undefined;
  if (!graphDiff) {
    throw new Error("Cannot apply workflow revision because it has no proposed version and no recognized manifest/graph diff.");
  }
  if (revision.sourceDiff) {
    throw new Error("Cannot apply diff-only source revisions without a materialized proposed workflow version.");
  }
  if (hasStructuralGraphDiff(graphDiff)) {
    throw new Error("Cannot apply diff-only graph revisions without a materialized proposed workflow version.");
  }
  const baseArtifact = revision.baseArtifactId ? runtime.store.getWorkflowArtifact(revision.baseArtifactId) : undefined;
  if (!baseArtifact) throw new Error("Cannot apply manifest-only revision without a base artifact.");
  const baseVersion = revision.baseVersionId
    ? runtime.store.getWorkflowVersion(revision.baseVersionId)
    : latestVersionForArtifact(runtime, baseArtifact.id);
  const baseGraph = baseVersion?.graphSnapshotId
    ? graphSnapshotById(runtime.store, revision.workflowThreadId, baseVersion.graphSnapshotId)
    : graphSnapshotById(runtime.store, revision.workflowThreadId, graphDiff.currentGraphId);
  if (!baseGraph) throw new Error("Cannot apply manifest-only revision without a base graph snapshot.");

  const manifest = workflowManifestWithDiff(baseArtifact.manifest, graphDiff);
  validateWorkflowGraphOutput({ summary: baseGraph.summary, nodes: baseGraph.nodes, edges: baseGraph.edges }, manifest);
  const baseSource = await readFile(baseArtifact.sourcePath, "utf8");
  validateWorkflowSourceReferences(baseSource, manifest);
  validateWorkflowSourceConnectorReferences(baseSource, manifest, runtime.connectorDescriptors?.() ?? []);
  validateWorkflowSourceGraphMappings(baseSource, { nodes: baseGraph.nodes });

  const artifact = runtime.store.createWorkflowArtifact({
    workflowThreadId: revision.workflowThreadId,
    title: baseArtifact.title,
    status: baseArtifact.status,
    manifest,
    spec: baseArtifact.spec,
    sourcePath: baseArtifact.sourcePath,
    statePath: baseArtifact.statePath,
  });
  const version = runtime.store.createWorkflowVersion({
    workflowThreadId: revision.workflowThreadId,
    artifactId: artifact.id,
    graphSnapshotId: baseGraph.id,
    sourcePath: baseArtifact.sourcePath,
    repoPath: baseVersion?.repoPath ?? dirname(baseArtifact.sourcePath),
    gitCommitHash: baseVersion?.gitCommitHash,
    status: baseVersion?.status ?? workflowVersionStatusForArtifactStatus(artifact.status),
    createdBy: "workflow_revision",
  });
  const updatedRevision = runtime.store.updateWorkflowRevision({
    id: revision.id,
    proposedGraphSnapshotId: baseGraph.id,
    status: "proposed",
  });
  return { revision: updatedRevision, created: true, version };
}

function workflowVersionStatusForArtifactStatus(status: WorkflowArtifactSummary["status"]): WorkflowVersionStatus {
  if (status === "approved" || status === "rejected" || status === "archived") return status;
  return "ready_for_review";
}

export function latestVersionForArtifact(runtime: WorkflowNativeToolRuntime, artifactId: string): WorkflowVersionSummary | undefined {
  for (const folder of runtime.store.listWorkflowAgentFolders()) {
    for (const thread of folder.threads) {
      const version = runtime.store.listWorkflowVersions(thread.id).find((candidate) => candidate.artifactId === artifactId);
      if (version) return version;
    }
  }
  return undefined;
}

function hasStructuralGraphDiff(diff: WorkflowGraphDiff): boolean {
  return (
    diff.addedNodes.length > 0 ||
    diff.removedNodes.length > 0 ||
    diff.changedNodes.length > 0 ||
    diff.addedEdges.length > 0 ||
    diff.removedEdges.length > 0 ||
    diff.changedEdges.length > 0
  );
}

function workflowManifestWithDiff(base: WorkflowManifest, diff: WorkflowGraphDiff): WorkflowManifest {
  const manifest: WorkflowManifest = cloneWorkflowManifest(base);
  for (const change of diff.manifest.fieldChanges) {
    if (change.field === "manifest") {
      const fullManifest = manifestFromUnknown(change.after, "manifest");
      if (!fullManifest) throw new Error("Manifest diff contains an invalid full manifest replacement.");
      return fullManifest;
    }
    applyManifestFieldChange(manifest, change.field, change.after);
  }
  manifest.connectors = applyManifestGrantDiffs(
    manifest.connectors ?? [],
    diff.manifest.addedConnectors,
    diff.manifest.removedConnectors,
    diff.manifest.changedConnectors,
  );
  manifest.pluginCapabilities = applyManifestGrantDiffs(
    manifest.pluginCapabilities ?? [],
    diff.manifest.addedPluginCapabilities,
    diff.manifest.removedPluginCapabilities,
    diff.manifest.changedPluginCapabilities,
  );
  if (!manifest.connectors.length) delete manifest.connectors;
  if (!manifest.pluginCapabilities.length) delete manifest.pluginCapabilities;
  return manifest;
}

function cloneWorkflowManifest(manifest: WorkflowManifest): WorkflowManifest {
  return {
    ...manifest,
    tools: [...manifest.tools],
    connectors: manifest.connectors ? manifest.connectors.map((connector) => ({ ...connector })) : undefined,
    pluginCapabilities: manifest.pluginCapabilities ? manifest.pluginCapabilities.map((capability) => ({ ...capability })) : undefined,
    ambientCliCapabilities: manifest.ambientCliCapabilities
      ? manifest.ambientCliCapabilities.map((capability) => ({ ...capability }))
      : undefined,
  };
}

function applyManifestFieldChange(manifest: WorkflowManifest, field: string, after: unknown): void {
  if (
    ![
      "tools",
      "mutationPolicy",
      "defaultIdleTimeoutMs",
      "maxToolCalls",
      "maxModelCalls",
      "maxConnectorCalls",
      "maxRunMs",
      "requiresReviewBelowConfidence",
    ].includes(field)
  ) {
    throw new Error(`Unsupported manifest diff field: ${field}`);
  }
  const manifestRecord = manifest as unknown as Record<string, unknown>;
  if (after === undefined) {
    delete manifestRecord[field];
    return;
  }
  manifestRecord[field] = after;
}

function applyManifestGrantDiffs<T extends { connectorId?: string; toolName?: string; capabilityId?: string }>(
  current: T[],
  added: Array<{ id: string; after?: unknown }>,
  removed: Array<{ id: string }>,
  changed: Array<{ id: string; after?: unknown }>,
): T[] {
  const byId = new Map(current.map((item) => [manifestGrantId(item), { ...item } as T]));
  for (const diff of removed) byId.delete(diff.id);
  for (const diff of [...added, ...changed]) {
    if (!isRecord(diff.after)) throw new Error(`Manifest grant diff ${diff.id} is missing a valid replacement grant.`);
    byId.set(diff.id, diff.after as T);
  }
  return [...byId.values()];
}

function manifestGrantId(value: { connectorId?: string; toolName?: string; capabilityId?: string }): string {
  return value.connectorId ?? value.toolName ?? value.capabilityId ?? JSON.stringify(value);
}

function recordWorkflowApplyFullAccessAudit(
  runtime: WorkflowNativeToolRuntime,
  revision: WorkflowRevisionSummary,
  materialized: { created: boolean; version?: WorkflowVersionSummary },
) {
  if (runtime.permissionMode !== "full-access") return undefined;
  const thread = runtime.store.getWorkflowAgentThreadSummary(revision.workflowThreadId);
  if (!thread.chatThreadId) return undefined;
  return runtime.store.addPermissionAudit({
    threadId: thread.chatThreadId,
    permissionMode: runtime.permissionMode,
    toolName: "workflow_apply_revision",
    risk: "workspace-command",
    decision: "allowed",
    detail: [
      `Workflow thread: ${revision.workflowThreadId}`,
      `Revision: ${revision.id}`,
      materialized.created ? `Materialized version: ${materialized.version?.id ?? "unknown"}` : "Materialized version: existing",
    ].join("\n"),
    reason: "Allowed by Full Access workflow-native apply policy.",
    decisionSource: "allowed_by_full_access",
  });
}
