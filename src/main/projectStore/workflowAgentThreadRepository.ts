import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  CreateWorkflowAgentFolderInput,
  CreateWorkflowAgentThreadInput,
  MoveWorkflowAgentThreadInput,
  WorkflowAgentThreadPhase,
} from "../../shared/workflowTypes";
import {
  type WorkflowAgentFolderRow,
  type WorkflowAgentThreadRow,
} from "./projectStoreWorkflowMappers";

export const WORKFLOW_AGENT_HOME_FOLDER_ID = "workflow-agent-home";

export interface ProjectStoreWorkflowAgentThreadRepositoryDeps {
  workspacePath(): string;
  createThread(title: string, workspacePath: string): { id: string };
}

export class ProjectStoreWorkflowAgentThreadRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreWorkflowAgentThreadRepositoryDeps,
  ) {}

  createWorkflowAgentFolder(input: CreateWorkflowAgentFolderInput): void {
    const name = input.name.trim();
    if (!name) throw new Error("Workflow Agent folder name is required.");
    const now = new Date().toISOString();
    this.ensureDefaultWorkflowAgentFolder();
    this.db
      .prepare("INSERT INTO workflow_agent_folders (id, name, folder_kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(randomUUID(), name, "custom", now, now);
  }

  moveWorkflowAgentThread(input: MoveWorkflowAgentThreadInput): void {
    const folder = this.requireWorkflowAgentFolder(input.folderId);
    const thread = this.requireWorkflowAgentThread(input.threadId);
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE workflow_agent_threads SET folder_id = ?, updated_at = ? WHERE id = ?")
      .run(folder.id, now, thread.id);
    this.db.prepare("UPDATE workflow_agent_folders SET updated_at = ? WHERE id = ?").run(now, folder.id);
  }

  createWorkflowAgentThreadRecord(input: CreateWorkflowAgentThreadInput): WorkflowAgentThreadRow {
    this.ensureDefaultWorkflowAgentFolder();
    const now = new Date().toISOString();
    const workspacePath = this.deps.workspacePath();
    const folderId = input.folderId && this.tryGetWorkflowAgentFolder(input.folderId) ? input.folderId : WORKFLOW_AGENT_HOME_FOLDER_ID;
    const title = (input.title?.trim() || input.initialRequest.trim().split(/\r?\n/)[0] || "Untitled workflow").slice(0, 160);
    const projectPath = input.projectPath?.trim() || workspacePath;
    const chatThread = this.deps.createThread(`Workflow: ${title}`, projectPath);
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO workflow_agent_threads
          (id, folder_id, chat_thread_id, project_path, title, phase, initial_request, active_artifact_id, active_graph_snapshot_id, trace_mode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        folderId,
        chatThread.id,
        projectPath,
        title,
        input.phase ?? "discovery",
        input.initialRequest.trim(),
        null,
        null,
        input.traceMode ?? "production",
        now,
        now,
      );
    return this.requireWorkflowAgentThread(id);
  }

  ensureDefaultWorkflowAgentFolder(): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO workflow_agent_folders (id, name, folder_kind, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      )
      .run(WORKFLOW_AGENT_HOME_FOLDER_ID, "Home", "home", now, now);
  }

  listWorkflowAgentFolderRows(): WorkflowAgentFolderRow[] {
    this.ensureDefaultWorkflowAgentFolder();
    return this.db.prepare("SELECT * FROM workflow_agent_folders").all() as WorkflowAgentFolderRow[];
  }

  listWorkflowAgentThreadRows(): WorkflowAgentThreadRow[] {
    this.ensureDefaultWorkflowAgentFolder();
    return this.db
      .prepare("SELECT * FROM workflow_agent_threads ORDER BY updated_at DESC, created_at DESC")
      .all() as WorkflowAgentThreadRow[];
  }

  updateWorkflowAgentThreadChatThread(threadId: string, chatThreadId: string, updatedAt = new Date().toISOString()): void {
    this.requireWorkflowAgentThread(threadId);
    this.db
      .prepare("UPDATE workflow_agent_threads SET chat_thread_id = ?, updated_at = ? WHERE id = ?")
      .run(chatThreadId, updatedAt, threadId);
  }

  updateWorkflowAgentThreadPhase(threadId: string, phase: WorkflowAgentThreadPhase, updatedAt = new Date().toISOString()): void {
    this.requireWorkflowAgentThread(threadId);
    this.db.prepare("UPDATE workflow_agent_threads SET phase = ?, updated_at = ? WHERE id = ?").run(phase, updatedAt, threadId);
  }

  updateWorkflowAgentThreadActiveArtifact(input: {
    threadId: string;
    artifactId: string | null;
    phase: WorkflowAgentThreadPhase;
    updatedAt?: string;
  }): void {
    this.requireWorkflowAgentThread(input.threadId);
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    this.db
      .prepare("UPDATE workflow_agent_threads SET active_artifact_id = ?, phase = ?, updated_at = ? WHERE id = ?")
      .run(input.artifactId, input.phase, updatedAt, input.threadId);
  }

  requireWorkflowAgentFolder(folderId: string): WorkflowAgentFolderRow {
    const row = this.tryGetWorkflowAgentFolder(folderId);
    if (!row) throw new Error(`Workflow Agent folder not found: ${folderId}`);
    return row;
  }

  tryGetWorkflowAgentFolder(folderId: string): WorkflowAgentFolderRow | undefined {
    return this.db.prepare("SELECT * FROM workflow_agent_folders WHERE id = ?").get(folderId) as WorkflowAgentFolderRow | undefined;
  }

  requireWorkflowAgentThread(threadId: string): WorkflowAgentThreadRow {
    const row = this.tryGetWorkflowAgentThread(threadId);
    if (!row) throw new Error(`Workflow Agent thread not found: ${threadId}`);
    return row;
  }

  tryGetWorkflowAgentThread(threadId: string): WorkflowAgentThreadRow | undefined {
    return this.db.prepare("SELECT * FROM workflow_agent_threads WHERE id = ?").get(threadId) as WorkflowAgentThreadRow | undefined;
  }
}
