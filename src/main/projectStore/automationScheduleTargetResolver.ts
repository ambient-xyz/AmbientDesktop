import type Database from "better-sqlite3";
import type { AutomationScheduleTargetKind } from "../../shared/automationTypes";
import type {
  OrchestrationTask,
  WorkflowArtifactSummary,
  WorkflowAgentThreadSummary,
  WorkflowRecordingLibraryDescription,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import type { AutomationFolderRow } from "./automationMappers";

export interface ProjectStoreAutomationScheduleRepositoryDeps {
  getWorkspace(): WorkspaceState;
  getOrchestrationTask(taskId: string): OrchestrationTask;
  getWorkflowArtifact(artifactId: string): WorkflowArtifactSummary;
  requireWorkflowRecordingScheduleTarget(id: string, targetVersion?: number): WorkflowRecordingLibraryDescription;
  getLatestApprovedWorkflowVersion(workflowThreadId: string): WorkflowVersionSummary | undefined;
  getWorkflowVersion(versionId: string): WorkflowVersionSummary;
  getWorkflowAgentThreadSummary(threadId: string): WorkflowAgentThreadSummary;
  createThread(title: string, workspacePath: string): ThreadSummary;
  getThread(threadId: string): ThreadSummary;
}

export class ProjectStoreAutomationScheduleTargetResolver {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreAutomationScheduleRepositoryDeps,
  ) {}

  requireAutomationScheduleTarget(kind: AutomationScheduleTargetKind, id: string, targetVersion?: number): void {
    if (!id.trim()) throw new Error("Automation schedule target is required.");
    if (kind === "local_task") {
      this.deps.getOrchestrationTask(id);
      return;
    }
    if (kind === "workflow_playbook") {
      this.deps.requireWorkflowRecordingScheduleTarget(id, targetVersion);
      return;
    }
    if (kind === "workflow_artifact") {
      this.deps.getWorkflowArtifact(id);
      return;
    }
    if (kind === "workflow_thread") {
      this.deps.getWorkflowAgentThreadSummary(id);
      return;
    }
    if (kind === "workflow_version") {
      this.deps.getWorkflowVersion(id);
      return;
    }
    this.requireAutomationFolder(id);
  }

  automationScheduleTargetVersion(kind: AutomationScheduleTargetKind, id: string, targetVersion?: number): number | null {
    if (targetVersion !== undefined && kind !== "workflow_playbook") {
      throw new Error("Pinned schedule target versions are only supported for workflow playbook schedules.");
    }
    if (kind !== "workflow_playbook" || targetVersion === undefined) return null;
    if (!Number.isInteger(targetVersion) || targetVersion < 1) {
      throw new Error("Workflow playbook schedule target version must be a positive integer.");
    }
    this.deps.requireWorkflowRecordingScheduleTarget(id, targetVersion);
    return targetVersion;
  }

  automationScheduleCreationBlockReason(kind: AutomationScheduleTargetKind, id: string, targetVersion?: number): string | undefined {
    if (kind === "workflow_playbook") {
      const playbook = this.deps.requireWorkflowRecordingScheduleTarget(id, targetVersion);
      return playbook.enabled ? undefined : "Workflow playbook is disabled and cannot be scheduled.";
    }
    if (kind === "workflow_artifact") {
      const artifact = this.deps.getWorkflowArtifact(id);
      return artifact.status === "approved" ? undefined : `Workflow artifact is ${artifact.status} and cannot be scheduled until approved.`;
    }
    if (kind === "workflow_thread") {
      return this.deps.getLatestApprovedWorkflowVersion(id) ? undefined : "Workflow Agent has no approved version to schedule.";
    }
    if (kind === "workflow_version") {
      const version = this.deps.getWorkflowVersion(id);
      if (version.status !== "approved") return `Pinned workflow version is ${version.status} and cannot be scheduled until approved.`;
      const artifact = this.deps.getWorkflowArtifact(version.artifactId);
      return artifact.status === "approved" ? undefined : `Workflow artifact is ${artifact.status} and cannot be scheduled until approved.`;
    }
    return undefined;
  }

  automationScheduleCreatedTargetVersionId(kind: AutomationScheduleTargetKind, id: string, targetVersion?: number): string | null {
    if (kind === "workflow_playbook") return String(targetVersion ?? this.deps.requireWorkflowRecordingScheduleTarget(id).version);
    if (kind === "workflow_thread") return this.deps.getLatestApprovedWorkflowVersion(id)?.id ?? null;
    if (kind === "workflow_version") return this.deps.getWorkflowVersion(id).id;
    return null;
  }

  automationScheduleDedicatedThreadId(
    kind: AutomationScheduleTargetKind,
    id: string,
    targetVersion?: number,
    existingThreadId?: string,
  ): string | null {
    if (kind !== "workflow_playbook") return null;
    if (existingThreadId) {
      try {
        this.deps.getThread(existingThreadId);
        return existingThreadId;
      } catch {
        // The schedule is valid, but the old dedicated thread was removed.
      }
    }
    const playbook = this.deps.requireWorkflowRecordingScheduleTarget(id, targetVersion);
    const suffix = targetVersion ? ` v${targetVersion}` : " (current)";
    return this.deps.createThread(`Scheduled: ${playbook.title}${suffix}`, this.deps.getWorkspace().path).id;
  }

  automationScheduleTargetLabel(kind: AutomationScheduleTargetKind, id: string, targetVersion?: number): string {
    try {
      if (kind === "local_task") {
        const task = this.deps.getOrchestrationTask(id);
        return `${task.identifier}: ${task.title}`;
      }
      if (kind === "workflow_playbook") {
        const playbook = this.deps.requireWorkflowRecordingScheduleTarget(id);
        const versionLabel = targetVersion ? `v${targetVersion} (pinned)` : `current v${playbook.version}`;
        return `${playbook.title} (${versionLabel})`;
      }
      if (kind === "workflow_thread") {
        return `${this.deps.getWorkflowAgentThreadSummary(id).title} (latest approved)`;
      }
      if (kind === "workflow_version") {
        const version = this.deps.getWorkflowVersion(id);
        const thread = this.deps.getWorkflowAgentThreadSummary(version.workflowThreadId);
        return `${thread.title} v${version.version} (pinned)`;
      }
      if (kind === "workflow_artifact") return this.deps.getWorkflowArtifact(id).title;
      return this.requireAutomationFolder(id).name;
    } catch {
      return `Missing ${kind} ${id}`;
    }
  }

  private requireAutomationFolder(folderId: string): AutomationFolderRow {
    const row = this.db.prepare("SELECT * FROM automation_folders WHERE id = ?").get(folderId) as
      | AutomationFolderRow
      | undefined;
    if (!row) throw new Error(`Automation folder not found: ${folderId}`);
    return row;
  }
}
