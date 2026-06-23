import { basename } from "node:path";
import type {
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowDiscoveryQuestion,
  WorkflowGraphSnapshot,
  WorkflowRunEvent,
  WorkflowRunSummary,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { workflowGraphFromSpec } from "../../shared/workflowAgentGraph";
import { latestWorkflowRunForArtifact } from "./automationMappers";
import {
  compareWorkflowAgentFolders,
  compareWorkflowAgentThreads,
  mapWorkflowAgentFolderRow,
  mapWorkflowAgentThreadRow,
  type WorkflowAgentFolderRow,
  type WorkflowAgentThreadRow,
} from "./projectStoreWorkflowMappers";
import { WORKFLOW_AGENT_HOME_FOLDER_ID } from "./workflowAgentThreadRepository";

export interface ProjectStoreWorkflowAgentReadModelRepositoryDeps {
  ensureWorkflowAgentThreadLinks(): void;
  getWorkspace(): WorkspaceState;
  latestWorkflowVersionForThread(workflowThreadId: string): WorkflowVersionSummary | undefined;
  listWorkflowAgentFolderRows(): WorkflowAgentFolderRow[];
  listWorkflowAgentThreadRows(): WorkflowAgentThreadRow[];
  listWorkflowDiscoveryQuestions(workflowThreadId: string): WorkflowDiscoveryQuestion[];
  listWorkflowGraphSnapshots(workflowThreadId: string): WorkflowGraphSnapshot[];
  listWorkflowRunEvents(runId: string): WorkflowRunEvent[];
  listWorkflowRuns(artifactId?: string, limit?: number): WorkflowRunSummary[];
  requireWorkflowAgentThread(threadId: string): WorkflowAgentThreadRow;
  tryGetWorkflowArtifact(artifactId: string): WorkflowArtifactSummary | undefined;
  tryGetWorkflowGraphSnapshot(snapshotId: string): WorkflowGraphSnapshot | undefined;
}

export class ProjectStoreWorkflowAgentReadModelRepository {
  constructor(private readonly deps: ProjectStoreWorkflowAgentReadModelRepositoryDeps) {}

  listWorkflowAgentFolders(): WorkflowAgentFolderSummary[] {
    this.deps.ensureWorkflowAgentThreadLinks();
    const project = this.deps.getWorkspace();
    const folders = this.deps.listWorkflowAgentFolderRows();
    const folderSummaries = new Map<string, WorkflowAgentFolderSummary>();
    for (const folder of folders) {
      folderSummaries.set(folder.id, mapWorkflowAgentFolderRow(folder));
    }
    const home = folderSummaries.get(WORKFLOW_AGENT_HOME_FOLDER_ID) ?? {
      id: WORKFLOW_AGENT_HOME_FOLDER_ID,
      name: "Home",
      kind: "home" as const,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      threads: [],
    };
    folderSummaries.set(home.id, home);

    const workflowRuns = this.deps.listWorkflowRuns(undefined, 200);
    for (const thread of this.deps.listWorkflowAgentThreadRows()) {
      const artifact = thread.active_artifact_id ? this.deps.tryGetWorkflowArtifact(thread.active_artifact_id) : undefined;
      const latestRun = artifact ? latestWorkflowRunForArtifact(workflowRuns, artifact.id) : undefined;
      const summary = this.workflowAgentThreadFromRow(thread, artifact, latestRun, project.name, project.path);
      const folder = folderSummaries.get(summary.folderId) ?? home;
      folder.threads.push({ ...summary, folderId: folder.id });
    }

    return [...folderSummaries.values()]
      .map((folder) => ({
        ...folder,
        threads: folder.threads.sort(compareWorkflowAgentThreads),
      }))
      .sort(compareWorkflowAgentFolders);
  }

  workflowAgentThreadSummaryFromCreatedRow(row: WorkflowAgentThreadRow): WorkflowAgentThreadSummary {
    return this.workflowAgentThreadFromRow(row, undefined, undefined, basename(row.project_path), this.deps.getWorkspace().path);
  }

  getWorkflowAgentThreadSummary(threadId: string): WorkflowAgentThreadSummary {
    const row = this.deps.requireWorkflowAgentThread(threadId);
    const project = this.deps.getWorkspace();
    const artifact = row.active_artifact_id ? this.deps.tryGetWorkflowArtifact(row.active_artifact_id) : undefined;
    const latestRun = artifact ? latestWorkflowRunForArtifact(this.deps.listWorkflowRuns(undefined, 200), artifact.id) : undefined;
    return this.workflowAgentThreadFromRow(row, artifact, latestRun, project.name, project.path);
  }

  private workflowAgentThreadFromRow(
    row: WorkflowAgentThreadRow,
    artifact: WorkflowArtifactSummary | undefined,
    latestRun: WorkflowRunSummary | undefined,
    projectName: string,
    fallbackProjectPath: string,
  ): WorkflowAgentThreadSummary {
    const latestVersion = this.deps.latestWorkflowVersionForThread(row.id);
    const graph = this.workflowGraphSnapshotForThread(row, latestVersion, artifact);
    const latestRunEvents = latestRun ? this.deps.listWorkflowRunEvents(latestRun.id) : [];
    return mapWorkflowAgentThreadRow(row, {
      artifact,
      latestRun,
      latestRunEvents,
      latestVersion,
      graph,
      discoveryQuestions: this.deps.listWorkflowDiscoveryQuestions(row.id),
      projectName,
      fallbackProjectPath,
    });
  }

  private workflowGraphSnapshotForThread(
    row: WorkflowAgentThreadRow,
    latestVersion: WorkflowVersionSummary | undefined,
    artifact: WorkflowArtifactSummary | undefined,
  ): WorkflowGraphSnapshot | undefined {
    if (row.active_graph_snapshot_id) {
      const activeGraph = this.deps.tryGetWorkflowGraphSnapshot(row.active_graph_snapshot_id);
      if (activeGraph) return activeGraph;
    }
    if (latestVersion?.graphSnapshotId) {
      const versionGraph = this.deps.tryGetWorkflowGraphSnapshot(latestVersion.graphSnapshotId);
      if (versionGraph) return versionGraph;
    }
    const latestGraph = this.deps.listWorkflowGraphSnapshots(row.id)[0];
    if (latestGraph) return latestGraph;
    if (!artifact) return undefined;
    const fallback = workflowGraphFromSpec({ title: artifact.title, spec: artifact.spec, manifest: artifact.manifest });
    return {
      id: `artifact-derived:${artifact.id}`,
      workflowThreadId: row.id,
      version: 0,
      source: "compile",
      nodes: fallback.nodes,
      edges: fallback.edges,
      summary: fallback.summary,
      createdAt: artifact.updatedAt,
    };
  }
}
