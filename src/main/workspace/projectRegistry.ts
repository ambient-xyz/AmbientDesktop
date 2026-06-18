import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { ProjectSummary } from "../../shared/projectBoardTypes";
import type { MessageRole, ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceSearchResult } from "../../shared/workspaceTypes";
import { normalizeAmbientModelId } from "../../shared/ambientModels";
import { normalizeWorkspacePath, projectIdFromWorkspacePath } from "../../shared/projectIdentity";
import { formatThreadPreview } from "../../shared/threadPreview";
import { workspaceAuthorityStatePaths } from "./workspaceAuthorityState";

export { normalizeWorkspacePath, projectIdFromWorkspacePath } from "../../shared/projectIdentity";

const REGISTRY_VERSION = 1;

interface RegistryFile {
  version: number;
  paths: string[];
  projects?: ProjectRegistryEntry[];
}

interface ProjectRegistryEntry {
  path: string;
  name?: string;
  pinned?: boolean;
}

interface ThreadRow {
  id: string;
  title: string;
  workspace_path: string;
  created_at: string;
  updated_at: string;
  last_read_at?: string | null;
  last_message_preview: string;
  permission_mode: ThreadSummary["permissionMode"];
  collaboration_mode?: ThreadSummary["collaborationMode"];
  model: string;
  thinking_level: ThreadSummary["thinkingLevel"];
  pi_session_file: string | null;
  pinned?: number | null;
}

interface SearchMessageRow {
  id: string;
  thread_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  thread_title: string;
}

export class ProjectRegistry {
  constructor(private readonly filePath: string) {}

  register(workspacePath: string): void {
    const normalized = normalizeWorkspacePath(workspacePath);
    const registry = this.readRegistry();
    const paths = registry.paths.filter((path) => path !== normalized);
    this.writeRegistry({ ...registry, paths: [normalized, ...paths] });
  }

  registerPinnedProject(workspacePath: string, input: { name: string; pinned: boolean }): void {
    const normalized = normalizeWorkspacePath(workspacePath);
    const registry = this.readRegistry();
    const paths = registry.paths.some((path) => normalizeWorkspacePath(path) === normalized)
      ? registry.paths
      : [...registry.paths, normalized];
    const entries = registry.projects?.filter((entry) => normalizeWorkspacePath(entry.path) !== normalized) ?? [];
    const current = registry.projects?.find((entry) => normalizeWorkspacePath(entry.path) === normalized);
    const next: ProjectRegistryEntry = {
      path: normalized,
      ...current,
      name: input.name.trim() || undefined,
      pinned: input.pinned,
    };
    this.writeRegistry({ ...registry, paths, projects: [...entries, next] });
  }

  remove(workspacePath: string): void {
    const normalized = normalizeWorkspacePath(workspacePath);
    const registry = this.readRegistry();
    this.writeRegistry({
      ...registry,
      paths: registry.paths.filter((path) => path !== normalized),
      projects: registry.projects?.filter((entry) => normalizeWorkspacePath(entry.path) !== normalized),
    });
  }

  setPinned(workspacePath: string, pinned: boolean): void {
    this.updateProjectEntry(workspacePath, { pinned });
  }

  setDisplayName(workspacePath: string, name: string | undefined): void {
    this.updateProjectEntry(workspacePath, { name: name?.trim() || undefined });
  }

  listRegisteredPaths(): string[] {
    return this.listPaths();
  }

  resolveProjectId(projectId: string, activeWorkspacePath: string): string {
    const paths = uniquePaths([normalizeWorkspacePath(activeWorkspacePath), ...this.listPaths()]);
    const match = paths.find((workspacePath) => projectIdFromWorkspacePath(workspacePath) === projectId);
    if (!match) throw new Error("Project is not registered.");
    if (!existsSync(match)) throw new Error("Registered project path no longer exists.");
    return match;
  }

  listProjects(activeWorkspacePath: string, activeProject?: ProjectSummary): ProjectSummary[] {
    const activePath = normalizeWorkspacePath(activeWorkspacePath);
    const registry = this.readRegistry();
    const metadataByPath = new Map(registry.projects?.map((entry) => [normalizeWorkspacePath(entry.path), entry]) ?? []);
    const paths = uniquePaths([activePath, ...registry.paths]);
    const projects = paths
      .map((workspacePath) => {
        const metadata = metadataByPath.get(workspacePath);
        const project = workspacePath === activePath && activeProject ? activeProject : readProjectSummary(workspacePath);
        return project ? applyProjectMetadata(project, metadata) : undefined;
      })
      .filter((project): project is ProjectSummary => Boolean(project));
    return projects.sort((a, b) => {
      if (a.path === activePath) return -1;
      if (b.path === activePath) return 1;
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name);
    });
  }

  private listPaths(): string[] {
    return this.readRegistry().paths;
  }

  private readRegistry(): RegistryFile {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<RegistryFile>;
      const legacyPaths = Array.isArray(parsed.paths) ? parsed.paths : [];
      const projectEntries = Array.isArray(parsed.projects)
        ? parsed.projects
            .filter((entry): entry is ProjectRegistryEntry => Boolean(entry && typeof entry.path === "string"))
            .map((entry) => ({
              path: normalizeWorkspacePath(entry.path),
              ...(typeof entry.name === "string" && entry.name.trim() ? { name: entry.name.trim() } : {}),
              ...(typeof entry.pinned === "boolean" ? { pinned: entry.pinned } : {}),
            }))
        : [];
      return {
        version: REGISTRY_VERSION,
        paths: uniquePaths([...legacyPaths, ...projectEntries.map((entry) => entry.path)]),
        projects: dedupeProjectEntries(projectEntries),
      };
    } catch {
      return { version: REGISTRY_VERSION, paths: [] };
    }
  }

  private writeRegistry(registry: RegistryFile): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const projects = dedupeProjectEntries(registry.projects ?? []).filter((entry) => entry.name || entry.pinned);
    const payload: RegistryFile = { version: REGISTRY_VERSION, paths: uniquePaths(registry.paths), ...(projects.length ? { projects } : {}) };
    writeFileSync(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  private updateProjectEntry(workspacePath: string, patch: Partial<Omit<ProjectRegistryEntry, "path">>): void {
    const normalized = normalizeWorkspacePath(workspacePath);
    const registry = this.readRegistry();
    const entries = registry.projects?.filter((entry) => normalizeWorkspacePath(entry.path) !== normalized) ?? [];
    const current = registry.projects?.find((entry) => normalizeWorkspacePath(entry.path) === normalized);
    const next: ProjectRegistryEntry = { path: normalized, ...current, ...patch };
    this.writeRegistry({ ...registry, paths: uniquePaths([normalized, ...registry.paths]), projects: [...entries, next] });
  }
}

export function readProjectSummary(workspacePath: string): ProjectSummary | undefined {
  const normalized = normalizeWorkspacePath(workspacePath);
  if (!existsSync(normalized)) return undefined;

  const { statePath, sessionPath, dbPath } = workspaceAuthorityStatePaths(normalized);
  const threads = readProjectThreads(normalized, dbPath);
  const timestamps = threads.flatMap((thread) => [thread.createdAt, thread.updatedAt]).filter(Boolean);
  const fallbackTime = new Date(0).toISOString();
  return {
    id: projectIdFromWorkspacePath(normalized),
    path: normalized,
    name: basename(normalized) || normalized,
    statePath,
    sessionPath,
    createdAt: timestamps.length ? timestamps.reduce((earliest, item) => (item < earliest ? item : earliest)) : fallbackTime,
    updatedAt: timestamps.length ? timestamps.reduce((latest, item) => (item > latest ? item : latest)) : fallbackTime,
    threads,
  };
}

export function archiveProjectChats(workspacePath: string): number {
  const normalized = normalizeWorkspacePath(workspacePath);
  const { dbPath } = workspaceAuthorityStatePaths(normalized);
  if (!existsSync(dbPath)) return 0;
  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath);
    ensureThreadArchiveColumn(db);
    if (!tableExists(db, "threads")) return 0;
    const now = new Date().toISOString();
    const automationExclusion = tableExists(db, "orchestration_runs")
      ? `NOT EXISTS (
             SELECT 1 FROM orchestration_runs
             WHERE orchestration_runs.thread_id = threads.id
           )`
      : "1 = 1";
    const result = db
      .prepare(
        `UPDATE threads
         SET archived_at = ?, updated_at = ?
         WHERE (archived_at IS NULL OR archived_at = '')
           AND ${automationExclusion}`,
      )
      .run(now, now);
    return Number(result.changes || 0);
  } finally {
    db?.close();
  }
}

export function readProjectSearchResults(workspacePath: string, query: string, limit = 50): WorkspaceSearchResult[] {
  const normalized = normalizeWorkspacePath(workspacePath);
  const { dbPath } = workspaceAuthorityStatePaths(normalized);
  const needle = query.trim();
  if (!needle || !existsSync(dbPath)) return [];

  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const boundedLimit = Math.max(1, Math.min(limit, 100));
    const perKindLimit = Math.ceil(boundedLimit / 2);
    const like = `%${needle}%`;
    const projectName = basename(normalized) || normalized;
    const hiddenThreadIds = readHiddenThreadIds(db);
    const archiveClause = threadArchiveClause(db, "threads");
    const threadRows = db
      .prepare(
        `SELECT * FROM threads
         WHERE (${archiveClause})
           AND (title LIKE ? OR last_message_preview LIKE ?)
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .all(like, like, perKindLimit * 2) as ThreadRow[];
    const messageRows = tableExists(db, "messages")
      ? (db
          .prepare(
            `SELECT messages.id, messages.thread_id, messages.role, messages.content, messages.created_at, threads.title AS thread_title
             FROM messages
             JOIN threads ON threads.id = messages.thread_id
             WHERE (${archiveClause})
               AND messages.content LIKE ?
             ORDER BY messages.created_at DESC
             LIMIT ?`,
          )
	          .all(like, perKindLimit * 2) as SearchMessageRow[])
      : [];
    return [
      ...threadRows.filter((row) => !hiddenThreadIds.has(row.id)).slice(0, perKindLimit).map((row): WorkspaceSearchResult => ({
        id: `thread:${normalized}:${row.id}`,
        kind: "thread",
        threadId: row.id,
        workspacePath: normalized,
        projectName,
        title: row.title,
        excerpt: row.last_message_preview,
        createdAt: row.updated_at,
        scope: "all-projects",
      })),
      ...messageRows
        .filter((row) => !hiddenThreadIds.has(row.thread_id))
        .slice(0, perKindLimit)
        .map((row): WorkspaceSearchResult => ({
        id: `message:${normalized}:${row.id}`,
        kind: "message",
        threadId: row.thread_id,
        workspacePath: normalized,
        projectName,
        title: row.thread_title,
        excerpt: formatThreadPreview(row.content),
        createdAt: row.created_at,
        role: row.role,
        scope: "all-projects",
      })),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, boundedLimit);
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

function readProjectThreads(workspacePath: string, dbPath: string): ThreadSummary[] {
  if (!existsSync(dbPath)) return [];
  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const hiddenThreadIds = readHiddenThreadIds(db);
    const orderBy = hasColumn(db, "threads", "pinned") ? "pinned DESC, updated_at DESC" : "updated_at DESC";
    const rows = db.prepare(`SELECT * FROM threads WHERE ${threadArchiveClause(db, "threads")} ORDER BY ${orderBy}`).all() as ThreadRow[];
    return rows
      .filter((row) => !hiddenThreadIds.has(row.id))
      .map((row) => ({
        id: row.id,
        title: row.title,
        workspacePath: row.workspace_path || workspacePath,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastReadAt: row.last_read_at ?? row.updated_at,
        lastMessagePreview: row.last_message_preview,
        permissionMode: row.permission_mode,
        collaborationMode: row.collaboration_mode === "planner" ? "planner" : "agent",
        model: normalizeAmbientModelId(row.model),
        thinkingLevel: row.thinking_level,
        piSessionFile: row.pi_session_file ?? undefined,
        pinned: Boolean(row.pinned),
      }));
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

function applyProjectMetadata(project: ProjectSummary, metadata: ProjectRegistryEntry | undefined): ProjectSummary {
  return {
    ...project,
    ...(metadata?.name ? { name: metadata.name } : {}),
    pinned: Boolean(metadata?.pinned),
  };
}

function ensureThreadArchiveColumn(db: Database.Database): void {
  if (!tableExists(db, "threads")) return;
  if (hasColumn(db, "threads", "archived_at")) return;
  db.prepare("ALTER TABLE threads ADD COLUMN archived_at TEXT").run();
}

function threadArchiveClause(db: Database.Database, tableName: string): string {
  return hasColumn(db, tableName, "archived_at") ? `${tableName}.archived_at IS NULL OR ${tableName}.archived_at = ''` : "1 = 1";
}

function hasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

function readAutomationThreadIds(db: Database.Database): Set<string> {
  if (!tableExists(db, "orchestration_runs")) return new Set();
  const rows = db
    .prepare("SELECT DISTINCT thread_id FROM orchestration_runs WHERE thread_id IS NOT NULL")
    .all() as Array<{ thread_id: string }>;
  return new Set(rows.map((row) => row.thread_id));
}

function readWorkflowAgentThreadChatIds(db: Database.Database): Set<string> {
  if (!tableExists(db, "workflow_agent_threads")) return new Set();
  const rows = db
    .prepare("SELECT DISTINCT chat_thread_id FROM workflow_agent_threads WHERE chat_thread_id IS NOT NULL AND chat_thread_id != ''")
    .all() as Array<{ chat_thread_id: string }>;
  return new Set(rows.map((row) => row.chat_thread_id));
}

function readHiddenThreadIds(db: Database.Database): Set<string> {
  return new Set([...readAutomationThreadIds(db), ...readWorkflowAgentThreadChatIds(db)]);
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const normalized = normalizeWorkspacePath(path);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function dedupeProjectEntries(entries: ProjectRegistryEntry[]): ProjectRegistryEntry[] {
  const byPath = new Map<string, ProjectRegistryEntry>();
  for (const entry of entries) {
    const normalized = normalizeWorkspacePath(entry.path);
    byPath.set(normalized, {
      path: normalized,
      ...(entry.name?.trim() ? { name: entry.name.trim() } : {}),
      ...(entry.pinned ? { pinned: true } : {}),
    });
  }
  return [...byPath.values()];
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { name: string } | undefined;
  return Boolean(row);
}
