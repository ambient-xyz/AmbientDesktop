import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RestoreWorkflowVersionInput, WorkflowDashboard, WorkflowGraphEdge, WorkflowGraphNode, WorkflowManifest, WorkflowSpec } from "../shared/types";
import { workflowGraphFromSpec } from "../shared/workflowAgentGraph";
import type { ProjectStore } from "./projectStore";
import { validateWorkflowSourceConnectorReferences, validateWorkflowSourceReferences } from "./workflow-compiler/workflowCompiler";
import type { WorkflowConnectorDescriptor } from "./workflowConnectors";
import { readWorkflowDashboard } from "./workflowDashboard";
import { commitWorkflowVersionRepo, restoreWorkflowVersionFiles } from "./workflowVersioning";

export async function restoreWorkflowVersion(
  store: ProjectStore,
  input: RestoreWorkflowVersionInput,
  options: { connectorDescriptors?: WorkflowConnectorDescriptor[] } = {},
): Promise<WorkflowDashboard> {
  const targetVersion = store.getWorkflowVersion(input.versionId);
  const targetArtifact = store.getWorkflowArtifact(targetVersion.artifactId);
  if (!targetVersion.gitCommitHash) throw new Error(`Workflow version ${targetVersion.version} has no git commit to restore.`);
  if (targetVersion.status === "archived") throw new Error("Archived workflow versions cannot be restored.");
  if (targetArtifact.status === "archived") throw new Error("Archived workflow artifacts cannot be restored.");

  await restoreWorkflowVersionFiles({
    repoPath: targetVersion.repoPath,
    commitHash: targetVersion.gitCommitHash,
  });

  const restored = readRestoredWorkflowFiles(targetVersion.repoPath, targetArtifact.title);
  validateWorkflowSourceReferences(restored.source, restored.manifest);
  validateWorkflowSourceConnectorReferences(restored.source, restored.manifest, options.connectorDescriptors ?? []);
  const restoredStatus = input.approveRestored ? "approved" : "ready_for_preview";
  const restoredVersionStatus = input.approveRestored ? "approved" : "ready_for_review";

  const updatedArtifact = store.updateWorkflowArtifact({
    id: targetArtifact.id,
    title: targetArtifact.title,
    status: restoredStatus,
    manifest: restored.manifest,
    spec: restored.spec,
    sourcePath: join(targetVersion.repoPath, "main.ts"),
    statePath: targetArtifact.statePath,
  });
  const graphSnapshot = store.createWorkflowGraphSnapshot({
    workflowThreadId: targetVersion.workflowThreadId,
    source: "revision",
    summary: restored.graph.summary,
    nodes: restored.graph.nodes,
    edges: restored.graph.edges,
    artifactPath: join(targetVersion.repoPath, "graph.json"),
  });
  const commit = await commitWorkflowVersionRepo({
    repoPath: targetVersion.repoPath,
    message: `Revert workflow to version ${targetVersion.version}`,
    allowEmpty: true,
  });
  const restoredVersion = store.createWorkflowVersion({
    workflowThreadId: targetVersion.workflowThreadId,
    artifactId: updatedArtifact.id,
    graphSnapshotId: graphSnapshot.id,
    sourcePath: updatedArtifact.sourcePath,
    repoPath: targetVersion.repoPath,
    gitCommitHash: commit.commitHash,
    status: restoredVersionStatus,
    createdBy: "version_revert",
  });
  const run = store.startWorkflowRun({ artifactId: updatedArtifact.id, status: "previewed" });
  store.appendWorkflowRunEvent({
    runId: run.id,
    type: "workflow.version_restored",
    message: input.approveRestored ? `Restored workflow version ${targetVersion.version} and approved it as latest.` : `Restored workflow version ${targetVersion.version} for review.`,
    data: {
      targetVersionId: targetVersion.id,
      targetVersion: targetVersion.version,
      restoredVersionId: restoredVersion.id,
      restoredVersion: restoredVersion.version,
      approved: input.approveRestored === true,
      restoredCommitHash: restoredVersion.gitCommitHash,
      sourcePath: updatedArtifact.sourcePath,
      graphSnapshotId: graphSnapshot.id,
    },
  });
  store.appendWorkflowRunEvent({
    runId: run.id,
    type: "workflow.validate",
    message: "Restored source and manifest passed static validation.",
    data: { tools: updatedArtifact.manifest.tools },
  });
  if (input.approveRestored) {
    store.appendWorkflowRunEvent({
      runId: run.id,
      type: "workflow.artifact_review",
      message: "approved",
      data: { artifactId: updatedArtifact.id, decision: "approved", versionId: restoredVersion.id },
    });
  }

  return readWorkflowDashboard(store);
}

function readRestoredWorkflowFiles(
  repoPath: string,
  title: string,
): {
  manifest: WorkflowManifest;
  spec: WorkflowSpec;
  source: string;
  graph: { summary: string; nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[] };
} {
  const manifest = readJsonFile<WorkflowManifest>(join(repoPath, "manifest.json"));
  const spec = readJsonFile<WorkflowSpec>(join(repoPath, "spec.json"));
  const source = readFileSync(join(repoPath, "main.ts"), "utf8");
  const graph = readGraphFile(repoPath, title, spec, manifest);
  return { manifest, spec, source, graph };
}

function readGraphFile(
  repoPath: string,
  title: string,
  spec: WorkflowSpec,
  manifest: WorkflowManifest,
): { summary: string; nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[] } {
  try {
    const parsed = readJsonFile<{ summary?: unknown; nodes?: unknown; edges?: unknown }>(join(repoPath, "graph.json"));
    if (typeof parsed.summary === "string" && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      return {
        summary: parsed.summary,
        nodes: parsed.nodes as WorkflowGraphNode[],
        edges: parsed.edges as WorkflowGraphEdge[],
      };
    }
  } catch {
    // Older experimental versions may not have graph.json; rebuild the explanatory graph from the restored spec.
  }
  const fallback = workflowGraphFromSpec({ title, spec, manifest });
  return { summary: fallback.summary, nodes: fallback.nodes, edges: fallback.edges };
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
