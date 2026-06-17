import type { AutomationScheduleSummary, ThreadSummary } from "../../shared/types";
import { injectAmbientWorkflowPlaybook, type AmbientWorkflowPlaybookInjection } from "../ambient/ambientWorkflows";
import type { ProjectStore, RunRecord } from "../projectStore/projectStore";

export interface WorkflowPlaybookScheduleRunnerInput {
  schedule: AutomationScheduleSummary;
  thread: ThreadSummary;
  injection: AmbientWorkflowPlaybookInjection;
  prompt: string;
  now: Date;
  occurrenceExceptionId?: string;
}

export interface WorkflowPlaybookScheduleRunnerResult {
  runId?: string;
}

export interface WorkflowPlaybookScheduleDispatchResult {
  scheduleId: string;
  threadId?: string;
  workflowId?: string;
  version?: number;
  outcome: "started" | "skipped";
  runId?: string;
  reason?: string;
}

export async function runDueWorkflowPlaybookSchedules(
  store: ProjectStore,
  now = new Date(),
  runner: (input: WorkflowPlaybookScheduleRunnerInput) => Promise<WorkflowPlaybookScheduleRunnerResult>,
): Promise<WorkflowPlaybookScheduleDispatchResult[]> {
  const dueSchedules = store.listDueAutomationSchedules(now).filter((schedule) => schedule.targetKind === "workflow_playbook");
  const results: WorkflowPlaybookScheduleDispatchResult[] = [];

  for (const schedule of dueSchedules) {
    const occurrenceException = store.consumePendingAutomationScheduleOccurrenceException(schedule.id, schedule.nextRunAt, now);
    if (occurrenceException?.exceptionKind === "reschedule") {
      results.push({
        scheduleId: schedule.id,
        outcome: "skipped",
        reason: occurrenceException.replacementRunAt
          ? `Schedule occurrence was rescheduled to ${occurrenceException.replacementRunAt}.`
          : "Schedule occurrence was rescheduled.",
      });
      continue;
    }

    let thread: ThreadSummary | undefined;
    try {
      thread = store.ensureAutomationScheduleDedicatedThread(schedule.id);
    } catch {
      thread = undefined;
    }

    const recordSkip = (reason: string) => {
      if (thread) recordWorkflowPlaybookScheduleNote(store, thread.id, schedule, reason, now, occurrenceException?.id);
      store.advanceAutomationSchedule(schedule.id, now);
      results.push({ scheduleId: schedule.id, threadId: thread?.id, outcome: "skipped", reason });
    };

    if (occurrenceException?.exceptionKind === "skip") {
      recordSkip(occurrenceException.reason ?? "Schedule occurrence skipped by user.");
      continue;
    }

    if (!thread) {
      store.advanceAutomationSchedule(schedule.id, now);
      results.push({
        scheduleId: schedule.id,
        outcome: "skipped",
        reason: "Workflow playbook schedule has no available dedicated thread.",
      });
      continue;
    }

    if (schedule.skipIfActive && activeRunForThread(store, thread.id)) {
      recordSkip("Dedicated workflow playbook schedule thread already has an active run.");
      continue;
    }

    let injection: AmbientWorkflowPlaybookInjection;
    try {
      injection = injectAmbientWorkflowPlaybook(store, {
        id: schedule.targetId,
        ...(schedule.targetVersion !== undefined ? { version: schedule.targetVersion } : {}),
      });
    } catch (error) {
      recordSkip(error instanceof Error ? error.message : String(error));
      continue;
    }

    const prompt = workflowPlaybookSchedulePrompt({ schedule, injection, now, occurrenceExceptionId: occurrenceException?.id });
    const started = await runner({ schedule, thread, injection, prompt, now, occurrenceExceptionId: occurrenceException?.id });
    store.advanceAutomationSchedule(schedule.id, now);
    results.push({
      scheduleId: schedule.id,
      threadId: thread.id,
      workflowId: injection.playbook.id,
      version: injection.playbook.version,
      outcome: "started",
      runId: started.runId,
    });
  }

  return results;
}

export function workflowPlaybookSchedulePrompt(input: {
  schedule: AutomationScheduleSummary;
  injection: AmbientWorkflowPlaybookInjection;
  now: Date;
  occurrenceExceptionId?: string;
}): string {
  const { schedule, injection } = input;
  const targetMode = schedule.targetVersion === undefined ? "current enabled playbook version" : `pinned playbook version ${schedule.targetVersion}`;
  return [
    "# Scheduled Workflow Playbook Run",
    "",
    `Schedule id: ${schedule.id}`,
    `Scheduled at: ${input.now.toISOString()}`,
    `Schedule target: ${schedule.targetLabel}`,
    `Target mode: ${targetMode}`,
    `Workflow id: ${injection.playbook.id}`,
    `Workflow version: ${injection.playbook.version}`,
    input.occurrenceExceptionId ? `Occurrence exception id: ${input.occurrenceExceptionId}` : undefined,
    "",
    "Run this scheduled workflow now through the normal Ambient chat/tool loop.",
    "Treat the recorded workflow playbook below as bounded guidance, not as runnable code.",
    "Use the successful examples for tool argument shape and sequencing, respect Do Not patterns, and validate live/current facts before finalizing.",
    "If required inputs are missing, ask for the smallest useful clarification in this dedicated schedule thread.",
    "",
    injection.guidanceMarkdown,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function recordWorkflowPlaybookScheduleNote(
  store: ProjectStore,
  threadId: string,
  schedule: AutomationScheduleSummary,
  reason: string,
  now: Date,
  occurrenceExceptionId?: string,
): void {
  store.addMessage({
    threadId,
    role: "assistant",
    content: `Scheduled workflow playbook occurrence skipped: ${reason}`,
    metadata: {
      runtime: "ambient-workflows-scheduler",
      status: "skipped",
      workflowPlaybookSchedule: {
        scheduleId: schedule.id,
        workflowId: schedule.targetId,
        targetVersion: schedule.targetVersion,
        targetLabel: schedule.targetLabel,
        skippedAt: now.toISOString(),
        reason,
        occurrenceExceptionId,
      },
    },
  });
}

function activeRunForThread(store: ProjectStore, threadId: string): RunRecord | undefined {
  return store.listActiveRuns().find((run) => run.threadId === threadId);
}
