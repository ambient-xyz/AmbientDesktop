import type Database from "better-sqlite3";
import type { ThreadWorktreeSummary } from "../../shared/threadTypes";
import type { ThreadWorktreeInput } from "./projectStoreFacadeHelpers";
import { mapThreadWorktreeRow, type ThreadWorktreeRow } from "./threadMappers";

export class ProjectStoreThreadWorktreeRepository {
  constructor(private readonly db: Database.Database) {}

  getThreadWorktree(threadId: string): ThreadWorktreeSummary | undefined {
    const row = this.db.prepare("SELECT * FROM thread_worktrees WHERE thread_id = ?").get(threadId) as ThreadWorktreeRow | undefined;
    return row ? mapThreadWorktreeRow(row) : undefined;
  }

  setThreadWorktree(input: ThreadWorktreeInput): ThreadWorktreeSummary {
    const now = new Date().toISOString();
    const createdAt = input.createdAt ?? now;
    const updatedAt = input.updatedAt ?? now;
    this.db
      .prepare(
        `INSERT INTO thread_worktrees
          (thread_id, project_root, worktree_path, branch_name, base_ref, upstream, worktree_status, created_at, updated_at, last_checkpoint_id, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(thread_id) DO UPDATE SET
          project_root = excluded.project_root,
          worktree_path = excluded.worktree_path,
          branch_name = excluded.branch_name,
          base_ref = excluded.base_ref,
          upstream = excluded.upstream,
          worktree_status = excluded.worktree_status,
          updated_at = excluded.updated_at,
          last_checkpoint_id = excluded.last_checkpoint_id,
          error = excluded.error`,
      )
      .run(
        input.threadId,
        input.projectRoot,
        input.worktreePath,
        input.branchName,
        input.baseRef ?? null,
        input.upstream ?? null,
        input.status,
        createdAt,
        updatedAt,
        input.lastCheckpointId ?? null,
        input.error ?? null,
      );
    return this.getThreadWorktree(input.threadId)!;
  }

  updateThreadWorktreeCheckpoint(threadId: string, checkpointId: string): void {
    this.db
      .prepare("UPDATE thread_worktrees SET last_checkpoint_id = ?, updated_at = ? WHERE thread_id = ?")
      .run(checkpointId, new Date().toISOString(), threadId);
  }
}
