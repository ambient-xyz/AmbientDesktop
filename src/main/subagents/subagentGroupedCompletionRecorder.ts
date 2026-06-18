import type {
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
} from "../../shared/subagentTypes";
import { SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES } from "./subagentWaitBarrierEvaluation";
import { previewSubagentSpawnText } from "./subagentSpawnFailure";

export const SUBAGENT_GROUPED_COMPLETION_RECORDER_SCHEMA_VERSION =
  "ambient-subagent-grouped-completion-recorder-v1" as const;

export interface SubagentGroupedCompletionRecorderStore {
  upsertSubagentGroupedCompletionNotification(input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    child: {
      runId: string;
      childThreadId: string;
      canonicalTaskPath: string;
      roleId: string;
      status: SubagentRunSummary["status"];
      summary: string;
      completedAt?: string;
    };
    createdAt?: string;
  }): SubagentParentMailboxEventSummary;
}

export function recordSubagentGroupedCompletionNotificationIfNeeded(input: {
  store: SubagentGroupedCompletionRecorderStore;
  run: SubagentRunSummary;
  synthesisAllowed: boolean;
}): SubagentParentMailboxEventSummary | undefined {
  if (input.run.dependencyMode !== "optional_background") return undefined;
  if (!SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(input.run.status)) return undefined;
  if (input.run.status === "completed" && !input.synthesisAllowed) return undefined;
  return input.store.upsertSubagentGroupedCompletionNotification({
    parentThreadId: input.run.parentThreadId,
    parentRunId: input.run.parentRunId,
    ...(input.run.parentMessageId ? { parentMessageId: input.run.parentMessageId } : {}),
    child: {
      runId: input.run.id,
      childThreadId: input.run.childThreadId,
      canonicalTaskPath: input.run.canonicalTaskPath,
      roleId: input.run.roleId,
      status: input.run.status,
      summary: subagentGroupedCompletionSummary(input.run),
      ...(input.run.completedAt ? { completedAt: input.run.completedAt } : {}),
    },
  });
}

export function subagentGroupedCompletionSummary(run: SubagentRunSummary): string {
  const artifact = objectInput(run.resultArtifact);
  const summary = typeof artifact.summary === "string" ? artifact.summary : "";
  return previewSubagentSpawnText(summary || `${run.canonicalTaskPath} finished with status ${run.status}.`, 1200);
}

function objectInput(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
