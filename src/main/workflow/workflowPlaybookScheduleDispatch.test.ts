import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkflowRecordingSavedPlaybook } from "../../shared/workflowTypes";
import { ProjectStore } from "./workflowProjectStoreFacade";
import { runDueWorkflowPlaybookSchedules } from "./workflowPlaybookScheduleDispatch";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("workflow playbook schedule dispatch", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-playbook-schedule-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("runs due recorded workflow schedules in their dedicated thread using the current enabled version", async () => {
    const first = savePlaybook("Summarize weekly customer emails.", "gmail.search");
    const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
    const dueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_playbook",
        targetId: first.id,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      createdAt,
    )[0];
    const dedicatedThreadId = schedule.dedicatedThreadId!;

    const second = savePlaybook("Summarize weekly customer emails with support-risk grouping.", "gmail.search", first.id);
    expect(second.version).toBe(2);

    const results = await runDueWorkflowPlaybookSchedules(store, dueAt, async ({ schedule: runnerSchedule, thread, injection, prompt }) => {
      expect(runnerSchedule.id).toBe(schedule.id);
      expect(thread.id).toBe(dedicatedThreadId);
      expect(injection.playbook.id).toBe(first.id);
      expect(injection.playbook.version).toBe(2);
      expect(prompt).toContain("Target mode: current enabled playbook version");
      expect(prompt).toContain("Treat the recorded workflow playbook below as bounded guidance, not as runnable code.");
      store.addMessage({ threadId: thread.id, role: "user", content: prompt, metadata: { source: "test-scheduler" } });
      return { runId: "chat-run-1" };
    });

    expect(results).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        threadId: dedicatedThreadId,
        workflowId: first.id,
        version: 2,
        outcome: "started",
        runId: "chat-run-1",
      }),
    ]);
    expect(store.listAutomationSchedules()[0]).toMatchObject({
      id: schedule.id,
      dedicatedThreadId,
      targetVersion: undefined,
      lastRunAt: dueAt.toISOString(),
      nextRunAt: new Date(2026, 0, 2, 9, 0, 0, 0).toISOString(),
    });
  });

  it("skips disabled recorded workflow schedules without invoking the runner", async () => {
    const saved = savePlaybook("Build a daily account summary.", "browser_search");
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_playbook",
        targetId: saved.id,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      new Date(2026, 0, 1, 8, 0, 0, 0),
    )[0];
    store.setWorkflowRecordingEnabled(saved.id, false);

    const results = await runDueWorkflowPlaybookSchedules(store, new Date(2026, 0, 1, 10, 0, 0, 0), async () => {
      throw new Error("Disabled playbook schedule should not run.");
    });

    expect(results).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        threadId: schedule.dedicatedThreadId,
        outcome: "skipped",
        reason: `Workflow playbook is disabled and cannot be injected: ${saved.id}`,
      }),
    ]);
    expect(store.listMessages(schedule.dedicatedThreadId!).at(-1)).toMatchObject({
      role: "assistant",
      content: `Scheduled workflow playbook occurrence skipped: Workflow playbook is disabled and cannot be injected: ${saved.id}`,
    });
  });

  function savePlaybook(intent: string, toolName: string, existingWorkflowId?: string): WorkflowRecordingSavedPlaybook {
    const thread = existingWorkflowId
      ? store
          .listThreads()
          .find((candidate) => candidate.workflowRecording?.review?.savedPlaybook?.id === existingWorkflowId)
      : undefined;
    const recordingThread =
      thread ??
      store.createWorkflowRecordingThread({
        goal: intent,
        workspacePath,
      });
    if (!thread) {
      store.addMessage({ threadId: recordingThread.id, role: "user", content: intent });
      store.addMessage({
        threadId: recordingThread.id,
        role: "tool",
        content: `${toolName} completed\nRecorded successful workflow evidence.`,
        metadata: { toolName, toolCallId: `${toolName}-1`, status: "done" },
      });
      store.stopWorkflowRecording(recordingThread.id);
    }
    store.updateWorkflowRecordingReviewDraft(recordingThread.id, {
      intent,
      inputs: ["Schedule window", "Relevant account scope"],
      successfulExamples: [{ toolName, inputPreview: '{"query":"scheduled workflow"}', resultPreview: "Recorded successful workflow evidence." }],
      doNot: [],
      validation: ["Final answer validates current facts before finalizing."],
      outputShape: ["Concise scheduled workflow result with evidence notes."],
    });
    return store.confirmWorkflowRecordingReview(recordingThread.id).review!.savedPlaybook!;
  }
});
