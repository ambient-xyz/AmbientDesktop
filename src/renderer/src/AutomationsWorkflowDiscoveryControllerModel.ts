import type {
  WorkflowAgentThreadSummary,
  WorkflowExplorationTraceSummary,
  WorkflowRevisionSummary,
  WorkflowRunSummary,
} from "../../shared/workflowTypes";
import type { WorkflowExplorationBudgets } from "../../shared/workflowExplorationBudgets";
import { workflowExplorationBudgetWithField } from "./workflowExplorationBudgetUiModel";

export const workflowExplorationSkipStorageKey = "ambient.workflowExplorationSkips.v1";

export type WorkflowDiscoveryRestartDrafts = Record<string, string>;
export type WorkflowDiscoveryAnswers = Record<string, string>;
export type WorkflowDiscoveryOptimisticAnswers = Record<string, true>;
export type WorkflowExplorationSkippedByThreadId = Record<string, string>;
export type WorkflowExplorationBudgetsByThreadId = Record<string, WorkflowExplorationBudgets>;
export type WorkflowExplorationTracesByThreadId = Record<string, WorkflowExplorationTraceSummary[]>;

export function decodeWorkflowExplorationSkips(raw: string | null): WorkflowExplorationSkippedByThreadId {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string" && Boolean(entry[0]),
      ),
    );
  } catch {
    return {};
  }
}

export function activeDraftWorkflowRevisionForThread<TRevision extends Pick<WorkflowRevisionSummary, "workflowThreadId" | "status">>(
  revisions: TRevision[],
  workflowThreadId?: string,
): TRevision | undefined {
  if (!workflowThreadId) return undefined;
  return revisions.find((revision) => revision.workflowThreadId === workflowThreadId && revision.status === "draft");
}

export function workflowDiscoveryRestartRequest(
  drafts: WorkflowDiscoveryRestartDrafts,
  thread: Pick<WorkflowAgentThreadSummary, "id" | "initialRequest">,
): string {
  return (drafts[thread.id] ?? thread.initialRequest).trim();
}

export function workflowDiscoveryRestartDraftsAfterRestart(
  drafts: WorkflowDiscoveryRestartDrafts,
  threadId: string,
): WorkflowDiscoveryRestartDrafts {
  const next = { ...drafts };
  delete next[threadId];
  return next;
}

export function workflowDiscoveryAnswersAfterAnswered(answers: WorkflowDiscoveryAnswers, questionId: string): WorkflowDiscoveryAnswers {
  return { ...answers, [questionId]: "" };
}

export function workflowDiscoveryOptimisticAnswersWithoutQuestion(
  answers: WorkflowDiscoveryOptimisticAnswers,
  questionId: string,
): WorkflowDiscoveryOptimisticAnswers {
  const next = { ...answers };
  delete next[questionId];
  return next;
}

export function workflowExplorationBudgetsAfterUpdate(
  budgetsByThreadId: WorkflowExplorationBudgetsByThreadId,
  threadId: string,
  field: keyof WorkflowExplorationBudgets,
  value: unknown,
): WorkflowExplorationBudgetsByThreadId {
  return {
    ...budgetsByThreadId,
    [threadId]: workflowExplorationBudgetWithField(budgetsByThreadId[threadId] ?? {}, field, value),
  };
}

export function workflowExplorationBudgetsAfterReset(
  budgetsByThreadId: WorkflowExplorationBudgetsByThreadId,
  threadId: string,
): WorkflowExplorationBudgetsByThreadId {
  if (!budgetsByThreadId[threadId]) return budgetsByThreadId;
  const next = { ...budgetsByThreadId };
  delete next[threadId];
  return next;
}

export function workflowExplorationSkipsAfterRunStart(
  skippedByThreadId: WorkflowExplorationSkippedByThreadId,
  threadId: string,
): WorkflowExplorationSkippedByThreadId {
  const next = { ...skippedByThreadId };
  delete next[threadId];
  return next;
}

export function workflowExplorationSkipsAfterSkip(
  skippedByThreadId: WorkflowExplorationSkippedByThreadId,
  threadId: string,
  skippedAtIso = new Date().toISOString(),
): WorkflowExplorationSkippedByThreadId {
  return { ...skippedByThreadId, [threadId]: skippedAtIso };
}

export function workflowExplorationTracesAfterRunResult(
  tracesByThreadId: WorkflowExplorationTracesByThreadId,
  threadId: string,
  trace: WorkflowExplorationTraceSummary,
): WorkflowExplorationTracesByThreadId {
  return {
    ...tracesByThreadId,
    [threadId]: [trace, ...(tracesByThreadId[threadId] ?? []).filter((existingTrace) => existingTrace.id !== trace.id)],
  };
}

export function latestWorkflowRunForArtifact(runs: WorkflowRunSummary[], artifactId: string): WorkflowRunSummary | undefined {
  return runs.find((run) => run.artifactId === artifactId);
}

export function workflowDiscoveryErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
