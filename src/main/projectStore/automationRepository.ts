import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  AutomationFolderSummary,
  AutomationScheduleExceptionSummary,
  AutomationScheduleOccurrenceActionInput,
  AutomationScheduleOccurrenceActionResult,
  AutomationScheduleSummary,
  AutomationThreadKind,
  CreateAutomationFolderInput,
  CreateAutomationScheduleInput,
  MoveAutomationThreadInput,
  UpdateAutomationScheduleInput
} from "../../shared/automationTypes";
import type {
  OrchestrationRun,
  OrchestrationTask,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowRecordingLibraryDescription,
  WorkflowRunEvent,
  WorkflowRunSummary,
  WorkflowVersionSummary
} from "../../shared/workflowTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { AUTOMATION_HOME_FOLDER_ID } from "./projectStoreFacadeHelpers";
import {
  ProjectStoreAutomationScheduleRepository,
  type ProjectStoreAutomationScheduleRepositoryDeps,
} from "./automationScheduleRepository";
import {
  automationThreadId,
  compareAutomationFolders,
  compareAutomationThreads,
  latestOrchestrationRunForTask,
  latestWorkflowRunForArtifact,
  mapAutomationFolderRow,
  mapAutomationOrchestrationTaskThread,
  mapAutomationWorkflowArtifactThread,
  parseAutomationThreadId,
  type AutomationFolderRow,
  type AutomationThreadFolderRow,
} from "./automationMappers";

export interface ProjectStoreAutomationRepositoryDeps extends ProjectStoreAutomationScheduleRepositoryDeps {
  getWorkspace(): WorkspaceState;
  listOrchestrationTasks(): OrchestrationTask[];
  listOrchestrationRuns(limit?: number): OrchestrationRun[];
  getOrchestrationTask(taskId: string): OrchestrationTask;
  listWorkflowArtifacts(): WorkflowArtifactSummary[];
  getWorkflowArtifact(artifactId: string): WorkflowArtifactSummary;
  listWorkflowRuns(artifactId?: string, limit?: number): WorkflowRunSummary[];
  listWorkflowRunEvents(runId: string): WorkflowRunEvent[];
  requireWorkflowRecordingScheduleTarget(id: string, targetVersion?: number): WorkflowRecordingLibraryDescription;
  getLatestApprovedWorkflowVersion(workflowThreadId: string): WorkflowVersionSummary | undefined;
  getWorkflowVersion(versionId: string): WorkflowVersionSummary;
  getWorkflowAgentThreadSummary(threadId: string): WorkflowAgentThreadSummary;
  createThread(title: string, workspacePath: string): ThreadSummary;
  getThread(threadId: string): ThreadSummary;
}

export class ProjectStoreAutomationRepository {
  private readonly schedules: ProjectStoreAutomationScheduleRepository;

  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreAutomationRepositoryDeps,
  ) {
    this.schedules = new ProjectStoreAutomationScheduleRepository(db, deps);
  }

  ensureDefaultAutomationFolder(): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO automation_folders (id, name, folder_kind, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(AUTOMATION_HOME_FOLDER_ID, "Home", "home", now, now);
  }

  listAutomationFolders(): AutomationFolderSummary[] {
    this.ensureAutomationThreadLinks();
    const project = this.deps.getWorkspace();
    const folders = this.listAutomationFolderRows();
    const folderSummaries = new Map<string, AutomationFolderSummary>();
    for (const folder of folders) {
      folderSummaries.set(folder.id, mapAutomationFolderRow(folder));
    }
    const home = folderSummaries.get(AUTOMATION_HOME_FOLDER_ID) ?? {
      id: AUTOMATION_HOME_FOLDER_ID,
      name: "Home",
      kind: "home" as const,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      threads: [],
    };
    folderSummaries.set(home.id, home);

    const folderForSource = new Map(
      this.db
        .prepare("SELECT * FROM automation_thread_folders")
        .all()
        .map((row) => {
          const item = row as AutomationThreadFolderRow;
          return [automationThreadId(item.source_kind, item.source_id), item.folder_id] as const;
        }),
    );
    const orchestrationRuns = this.deps.listOrchestrationRuns(200);
    const workflowRuns = this.deps.listWorkflowRuns(undefined, 200);

    for (const task of this.deps.listOrchestrationTasks()) {
      const latestRun = latestOrchestrationRunForTask(orchestrationRuns, task.id);
      const thread = mapAutomationOrchestrationTaskThread(task, {
        folderId: AUTOMATION_HOME_FOLDER_ID,
        latestRun,
        projectName: project.name,
        projectPath: project.path,
      });
      const folder = folderSummaries.get(folderForSource.get(thread.id) ?? "") ?? home;
      folder.threads.push({ ...thread, folderId: folder.id });
    }
    for (const artifact of this.deps.listWorkflowArtifacts()) {
      const latestRun = latestWorkflowRunForArtifact(workflowRuns, artifact.id);
      const latestRunEvents = latestRun ? this.deps.listWorkflowRunEvents(latestRun.id) : [];
      const thread = mapAutomationWorkflowArtifactThread(artifact, {
        folderId: AUTOMATION_HOME_FOLDER_ID,
        latestRun,
        latestRunEvents,
        projectName: project.name,
        projectPath: project.path,
      });
      const folder = folderSummaries.get(folderForSource.get(thread.id) ?? "") ?? home;
      folder.threads.push({ ...thread, folderId: folder.id });
    }

    return [...folderSummaries.values()]
      .map((folder) => ({
        ...folder,
        threads: folder.threads.sort(compareAutomationThreads),
      }))
      .sort(compareAutomationFolders);
  }

  createAutomationFolder(input: CreateAutomationFolderInput): AutomationFolderSummary[] {
    const name = input.name.trim();
    if (!name) throw new Error("Automation folder name is required.");
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO automation_folders (id, name, folder_kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(randomUUID(), name, "custom", now, now);
    return this.listAutomationFolders();
  }

  moveAutomationThread(input: MoveAutomationThreadInput): AutomationFolderSummary[] {
    const folder = this.requireAutomationFolder(input.folderId);
    const source = parseAutomationThreadId(input.threadId);
    this.requireAutomationSource(source.kind, source.id);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO automation_thread_folders (source_kind, source_id, folder_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(source_kind, source_id) DO UPDATE SET folder_id = excluded.folder_id, updated_at = excluded.updated_at`,
      )
      .run(source.kind, source.id, folder.id, now, now);
    this.db.prepare("UPDATE automation_folders SET updated_at = ? WHERE id = ?").run(now, folder.id);
    return this.listAutomationFolders();
  }

  listAutomationSchedules(): AutomationScheduleSummary[] {
    return this.schedules.listAutomationSchedules();
  }

  listAutomationScheduleExceptions(input: { scheduleId?: string } = {}): AutomationScheduleExceptionSummary[] {
    return this.schedules.listAutomationScheduleExceptions(input);
  }

  createAutomationSchedule(input: CreateAutomationScheduleInput, nowDate = new Date()): AutomationScheduleSummary[] {
    return this.schedules.createAutomationSchedule(input, nowDate);
  }

  updateAutomationSchedule(input: UpdateAutomationScheduleInput, nowDate = new Date()): AutomationScheduleSummary[] {
    return this.schedules.updateAutomationSchedule(input, nowDate);
  }

  skipAutomationScheduleOccurrence(
    input: AutomationScheduleOccurrenceActionInput,
    nowDate = new Date(),
  ): AutomationScheduleOccurrenceActionResult {
    return this.schedules.skipAutomationScheduleOccurrence(input, nowDate);
  }

  rescheduleAutomationScheduleOccurrence(
    input: AutomationScheduleOccurrenceActionInput,
    nowDate = new Date(),
  ): AutomationScheduleOccurrenceActionResult {
    return this.schedules.rescheduleAutomationScheduleOccurrence(input, nowDate);
  }

  updateAutomationScheduleOccurrenceRunLimits(
    input: AutomationScheduleOccurrenceActionInput,
    nowDate = new Date(),
  ): AutomationScheduleOccurrenceActionResult {
    return this.schedules.updateAutomationScheduleOccurrenceRunLimits(input, nowDate);
  }

  consumePendingAutomationScheduleOccurrenceException(
    scheduleId: string,
    occurrenceAt: string | undefined,
    nowDate = new Date(),
  ): AutomationScheduleExceptionSummary | undefined {
    return this.schedules.consumePendingAutomationScheduleOccurrenceException(scheduleId, occurrenceAt, nowDate);
  }

  listDueAutomationSchedules(nowDate = new Date()): AutomationScheduleSummary[] {
    return this.schedules.listDueAutomationSchedules(nowDate);
  }

  advanceAutomationSchedule(scheduleId: string, nowDate = new Date()): AutomationScheduleSummary {
    return this.schedules.advanceAutomationSchedule(scheduleId, nowDate);
  }

  ensureAutomationScheduleDedicatedThread(scheduleId: string): ThreadSummary {
    return this.schedules.ensureAutomationScheduleDedicatedThread(scheduleId);
  }

  listAutomationThreadChatIds(): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT thread_id FROM orchestration_runs WHERE thread_id IS NOT NULL")
      .all() as Array<{ thread_id: string }>;
    return rows.map((row) => row.thread_id);
  }

  private ensureAutomationThreadLinks(): void {
    this.ensureDefaultAutomationFolder();
    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO automation_thread_folders (source_kind, source_id, folder_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const task of this.deps.listOrchestrationTasks()) {
      insert.run("orchestration_task", task.id, AUTOMATION_HOME_FOLDER_ID, now, now);
    }
    for (const artifact of this.deps.listWorkflowArtifacts()) {
      insert.run("workflow_artifact", artifact.id, AUTOMATION_HOME_FOLDER_ID, now, now);
    }
  }

  private listAutomationFolderRows(): AutomationFolderRow[] {
    this.ensureDefaultAutomationFolder();
    return this.db.prepare("SELECT * FROM automation_folders").all() as AutomationFolderRow[];
  }

  private requireAutomationFolder(folderId: string): AutomationFolderRow {
    const row = this.db.prepare("SELECT * FROM automation_folders WHERE id = ?").get(folderId) as
      | AutomationFolderRow
      | undefined;
    if (!row) throw new Error(`Automation folder not found: ${folderId}`);
    return row;
  }

  private requireAutomationSource(kind: AutomationThreadKind, id: string): void {
    if (kind === "orchestration_task") {
      this.deps.getOrchestrationTask(id);
      return;
    }
    this.deps.getWorkflowArtifact(id);
  }
}
