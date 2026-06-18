import type Database from "better-sqlite3";
import type { WorkspaceSearchResult, WorkspaceSearchScope } from "../../shared/workspaceTypes";
import { mapWorkspaceSearchMessageRow, type SearchMessageRow } from "./messageMappers";
import { mapWorkspaceSearchThreadRow, type ThreadRow } from "./threadMappers";

export interface ProjectStoreWorkspaceSearchInput {
  query: string;
  scope?: Exclude<WorkspaceSearchScope, "all-projects">;
  threadId?: string;
  limit?: number;
  projectName: string;
  workspacePath: string;
}

export class ProjectStoreWorkspaceSearchRepository {
  constructor(private readonly db: Database.Database) {}

  searchWorkspace(input: ProjectStoreWorkspaceSearchInput): WorkspaceSearchResult[] {
    const needle = input.query.trim();
    if (!needle) return [];
    const boundedLimit = Math.max(1, Math.min(input.limit ?? 50, 100));
    const perKindLimit = Math.ceil(boundedLimit / 2);
    const like = `%${needle}%`;
    const scope = input.scope ?? "project";
    const threadId = scope === "chat" ? input.threadId : undefined;
    const threadRows = threadId
      ? (this.db
          .prepare(
            `SELECT * FROM threads
             WHERE id = ?
               AND (archived_at IS NULL OR archived_at = '')
               AND (title LIKE ? OR last_message_preview LIKE ?)
             ORDER BY updated_at DESC
             LIMIT ?`,
          )
          .all(threadId, like, like, perKindLimit) as ThreadRow[])
      : (this.db
          .prepare(
            `SELECT * FROM threads
             WHERE (archived_at IS NULL OR archived_at = '')
               AND (title LIKE ? OR last_message_preview LIKE ?)
             ORDER BY updated_at DESC
             LIMIT ?`,
          )
          .all(like, like, perKindLimit) as ThreadRow[]);
    const messageRows = threadId
      ? (this.db
          .prepare(
            `SELECT messages.id, messages.thread_id, messages.role, messages.content, messages.created_at, threads.title AS thread_title
             FROM messages
             JOIN threads ON threads.id = messages.thread_id
             WHERE messages.thread_id = ?
               AND (threads.archived_at IS NULL OR threads.archived_at = '')
               AND messages.content LIKE ?
             ORDER BY messages.created_at DESC
             LIMIT ?`,
          )
          .all(threadId, like, perKindLimit) as SearchMessageRow[])
      : (this.db
          .prepare(
            `SELECT messages.id, messages.thread_id, messages.role, messages.content, messages.created_at, threads.title AS thread_title
             FROM messages
             JOIN threads ON threads.id = messages.thread_id
             WHERE (threads.archived_at IS NULL OR threads.archived_at = '')
               AND messages.content LIKE ?
             ORDER BY messages.created_at DESC
             LIMIT ?`,
          )
          .all(like, perKindLimit) as SearchMessageRow[]);

    return [
      ...threadRows.map((row) =>
        mapWorkspaceSearchThreadRow(row, {
          workspacePath: input.workspacePath,
          projectName: input.projectName,
          scope,
        }),
      ),
      ...messageRows.map((row) =>
        mapWorkspaceSearchMessageRow(row, {
          workspacePath: input.workspacePath,
          projectName: input.projectName,
          scope,
        }),
      ),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, boundedLimit);
  }
}
