import type { SubagentRunEventSummary } from "../../shared/subagentTypes";
import type { ThreadSummary, ThreadWorktreeSummary } from "../../shared/threadTypes";
import type { SubagentChildWorktreePrepareInput } from "../pi/piChildSessionAdapter";
import { compactSubagentThreadWorktreeForPi } from "./subagentSpawnFailure";

export const SUBAGENT_CHILD_WORKTREE_PREPARER_SCHEMA_VERSION =
  "ambient-subagent-child-worktree-preparer-v1" as const;

export interface SubagentChildWorktreePreparerStore {
  getThread(threadId: string): ThreadSummary;
  appendSubagentRunEvent(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary;
}

export type SubagentChildWorktreePreparer =
  (input: SubagentChildWorktreePrepareInput) => Promise<ThreadWorktreeSummary | undefined> | ThreadWorktreeSummary | undefined;

export interface PrepareSubagentChildWorktreeForLaunchInput {
  store: SubagentChildWorktreePreparerStore;
  request: SubagentChildWorktreePrepareInput;
  prepareChildWorktree?: SubagentChildWorktreePreparer;
  requiredBy?: "role" | "symphony_mutation_lease";
}

export async function prepareSubagentChildWorktreeForLaunch(
  input: PrepareSubagentChildWorktreeForLaunchInput,
): Promise<ThreadWorktreeSummary | undefined> {
  const request = input.request;
  const requiredBy = input.requiredBy ?? "role";
  if (requiredBy === "role" && request.role.mutationPolicy !== "requires_isolated_worktree") return undefined;
  if (request.run.capacityLeaseSnapshot.status === "blocked") return undefined;
  if (!input.prepareChildWorktree) {
    input.store.appendSubagentRunEvent(request.run.id, {
      type: "subagent.worktree_unavailable",
      preview: subagentWorktreeRunEventPreview(request, {
        reason: requiredBy === "symphony_mutation_lease"
          ? "Symphony mutation lease requires an isolated worktree for Git workspaces, but no child worktree preparer is configured."
          : "Role requires an isolated worktree, but no child worktree preparer is configured.",
        idempotencyKey: request.idempotencyKey,
        roleId: request.role.id,
        requiredBy,
      }),
    });
    return undefined;
  }

  try {
    const worktree = await input.prepareChildWorktree(request);
    if (!worktree) {
      input.store.appendSubagentRunEvent(request.run.id, {
        type: "subagent.worktree_unavailable",
        preview: subagentWorktreeRunEventPreview(request, {
          reason: requiredBy === "symphony_mutation_lease"
            ? "Symphony mutation lease requires an isolated worktree for Git workspaces, but worktree preparation returned no reservation."
            : "Role requires an isolated worktree, but worktree preparation returned no reservation.",
          idempotencyKey: request.idempotencyKey,
          roleId: request.role.id,
          requiredBy,
        }),
      });
      return undefined;
    }
    if (worktree.threadId !== request.run.childThreadId) {
      input.store.appendSubagentRunEvent(request.run.id, {
        type: "subagent.worktree_unavailable",
        preview: subagentWorktreeRunEventPreview(request, {
          reason: `Prepared worktree belongs to thread ${worktree.threadId}, not child thread ${request.run.childThreadId}.`,
          idempotencyKey: request.idempotencyKey,
          roleId: request.role.id,
          requiredBy,
          worktree: compactSubagentThreadWorktreeForPi(worktree),
        }),
      });
      return undefined;
    }
    if (worktree.status === "active") {
      const childThread = input.store.getThread(request.run.childThreadId);
      const persistedWorktree = childThread.gitWorktree;
      const worktreePersisted =
        persistedWorktree?.threadId === request.run.childThreadId &&
        persistedWorktree.status === "active" &&
        persistedWorktree.worktreePath === worktree.worktreePath &&
        childThread.workspacePath === worktree.worktreePath;
      if (!worktreePersisted) {
        input.store.appendSubagentRunEvent(request.run.id, {
          type: "subagent.worktree_unavailable",
          preview: subagentWorktreeRunEventPreview(request, {
            reason: "Prepared active worktree must be persisted on the child thread before mutating tools are enabled.",
            idempotencyKey: request.idempotencyKey,
            roleId: request.role.id,
            requiredBy,
            worktree: compactSubagentThreadWorktreeForPi(worktree),
            childThread: {
              id: childThread.id,
              workspacePath: childThread.workspacePath,
              gitWorktree: persistedWorktree ? compactSubagentThreadWorktreeForPi(persistedWorktree) : null,
            },
          }),
        });
        return undefined;
      }
    }
    input.store.appendSubagentRunEvent(request.run.id, {
      type: worktree.status === "active" ? "subagent.worktree_prepared" : "subagent.worktree_unavailable",
      preview: subagentWorktreeRunEventPreview(request, {
        idempotencyKey: request.idempotencyKey,
        roleId: request.role.id,
        requiredBy,
        worktree: compactSubagentThreadWorktreeForPi(worktree),
        ...(worktree.status === "active" ? {} : { reason: worktree.error ?? `Worktree status is ${worktree.status}.` }),
      }),
    });
    return worktree;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.store.appendSubagentRunEvent(request.run.id, {
      type: "subagent.worktree_unavailable",
      preview: subagentWorktreeRunEventPreview(request, {
        reason: message,
        idempotencyKey: request.idempotencyKey,
        roleId: request.role.id,
        requiredBy,
      }),
    });
    return undefined;
  }
}

function subagentWorktreeRunEventPreview(
  request: SubagentChildWorktreePrepareInput,
  preview: Record<string, unknown>,
): Record<string, unknown> {
  return {
    childRunId: request.run.id,
    childThreadId: request.run.childThreadId,
    parentRunId: request.run.parentRunId,
    parentThreadId: request.run.parentThreadId,
    canonicalTaskPath: request.run.canonicalTaskPath,
    ...preview,
  };
}
