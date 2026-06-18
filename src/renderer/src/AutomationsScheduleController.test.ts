import { describe, expect, it } from "vitest";

import type { AutomationFolderSummary, AutomationScheduleSummary } from "../../shared/automationTypes";
import type { OrchestrationTask, WorkflowArtifactSummary, WorkflowRecordingLibraryEntry } from "../../shared/workflowTypes";
import { datetimeLocalValueFromIso } from "./AutomationsScheduleViews";
import {
  automationScheduleEditFormState,
  type AutomationScheduleControllerTargetSourcesInput,
  automationScheduleTargetSourcesModel,
  automationScheduleTotalLimitMode,
  workflowScheduleOccurrenceEditorForSchedule,
  workflowScheduleOccurrenceReplacementError,
  workflowScheduleRunLimitOverridesForArtifact,
} from "./AutomationsScheduleController";

describe("Automations schedule controller", () => {
  it("groups schedule target sources beside the schedule controller", () => {
    const sources = automationScheduleTargetSourcesModel({
      workflowRecordingLibrary: [playbook()],
      workflowArtifacts: [workflowArtifact()],
      workflowAgentFolders: [workflowFolder()],
      folders: [automationFolder()],
      tasks: [task()],
    });

    expect(sources.workflowRecordingLibrary[0]?.title).toBe("Research Recording");
    expect(sources.workflowArtifacts[0]?.title).toBe("Inbox Workflow Artifact");
    expect(sources.workflowAgentFolders[0]?.threads[0]?.latestVersion?.version).toBe(3);
    expect(sources.folders[0]?.name).toBe("Ops");
    expect(sources.tasks[0]?.identifier).toBe("LT-1");
  });

  it("derives edit and duplicate schedule form state without mutating schedule ownership", () => {
    const saved = schedule({
      runLimits: { idleTimeoutMs: 300_000, maxRunMs: null },
      cronExpression: undefined,
    });

    expect(automationScheduleTotalLimitMode(saved)).toBe("disabled");
    expect(automationScheduleEditFormState(saved)).toMatchObject({
      focusedScheduleId: "schedule-1",
      scheduleTargetType: "workflow_thread",
      scheduleTargetId: "workflow-thread-1",
      schedulePreset: "daily",
      scheduleExpression: "0 9 * * *",
      scheduleEnabled: true,
      scheduleRunIdleTimeoutMs: 300_000,
      scheduleRunTotalLimitMode: "disabled",
      scheduleEditScope: "all_occurrences",
      workflowSchedulePanel: "schedules-overview",
    });
    expect(automationScheduleEditFormState(saved, true).focusedScheduleId).toBeUndefined();
  });

  it("builds occurrence editor state and validates replacement times", () => {
    const saved = schedule({ nextRunAt: "2026-06-14T10:00:00.000Z" });
    const editor = workflowScheduleOccurrenceEditorForSchedule(saved);

    expect(editor).toMatchObject({
      scheduleId: "schedule-1",
      occurrenceAt: "2026-06-14T10:00:00.000Z",
      reason: "Rescheduled from Workflow Agent schedule history.",
    });
    expect(editor?.replacementLocal).toMatch(/^2026-06-14T\d{2}:00$/);
    expect(workflowScheduleOccurrenceEditorForSchedule({ ...saved, nextRunAt: undefined })).toBeUndefined();
    expect(workflowScheduleOccurrenceReplacementError({ ...editor!, replacementLocal: "" })).toBe("Choose a valid replacement date and time.");
    expect(workflowScheduleOccurrenceReplacementError({
      ...editor!,
      replacementLocal: datetimeLocalValueFromIso(saved.nextRunAt!),
    })).toBe("Choose a replacement time that differs from the current occurrence.");
  });

  it("keeps schedule run-limit overrides in the schedule owner", () => {
    const artifact = workflowArtifact();

    expect(workflowScheduleRunLimitOverridesForArtifact({ idleTimeoutMs: 120_000, totalLimitMode: "manifest" }, artifact)).toEqual({
      idleTimeoutMs: 120_000,
    });
    expect(workflowScheduleRunLimitOverridesForArtifact({ idleTimeoutMs: 120_000, totalLimitMode: "disabled" }, artifact)).toEqual({
      idleTimeoutMs: 120_000,
      maxRunMs: null,
    });
  });
});

function schedule(overrides: Partial<AutomationScheduleSummary> = {}): AutomationScheduleSummary {
  return {
    id: "schedule-1",
    targetKind: "workflow_thread",
    targetId: "workflow-thread-1",
    targetLabel: "Nightly inbox workflow",
    preset: "daily",
    cronExpression: "0 9 * * *",
    timezone: "America/Phoenix",
    enabled: true,
    skipIfActive: true,
    concurrencyPolicy: "skip_if_active",
    createdAt: "2026-06-14T09:00:00.000Z",
    updatedAt: "2026-06-14T09:00:00.000Z",
    nextRunAt: "2026-06-14T10:00:00.000Z",
    ...overrides,
  };
}

function playbook(): WorkflowRecordingLibraryEntry {
  return {
    id: "playbook-1",
    title: "Research Recording",
    version: 4,
    enabled: true,
    savedAt: "2026-06-14T10:00:00.000Z",
    manifestPath: "/tmp/workspace/workflow.json",
    markdownPath: "/tmp/workspace/workflow.md",
    sidecarPath: "/tmp/workspace/workflow.sidecar.json",
    transcriptPath: "/tmp/workspace/transcript.json",
    summary: "Research queue",
    toolNames: ["web_search"],
    outputShape: ["summary"],
    versions: [],
  };
}

function workflowArtifact(overrides: Partial<WorkflowArtifactSummary> = {}): WorkflowArtifactSummary {
  return {
    id: "artifact-1",
    workflowThreadId: "workflow-thread-1",
    title: "Inbox Workflow Artifact",
    status: "approved",
    createdAt: "2026-06-14T09:00:00.000Z",
    updatedAt: "2026-06-14T09:00:00.000Z",
    manifest: {
      tools: [],
      pluginCapabilities: [],
      ambientCliCapabilities: [],
      connectors: [],
      mutationPolicy: "staged_until_approved",
      maxRunMs: 600_000,
    },
    spec: {
      goal: "Triage inbox",
      successCriteria: ["Inbox is summarized."],
    },
    sourcePath: "/tmp/workflow.ts",
    statePath: "/tmp/workflow-state.json",
    ...overrides,
  };
}

function workflowFolder(): AutomationScheduleControllerTargetSourcesInput["workflowAgentFolders"][number] {
  return {
    threads: [
      {
        id: "workflow-thread-1",
        title: "Nightly inbox workflow",
        latestVersion: { id: "version-3", version: 3, status: "approved" },
      },
    ],
  };
}

function automationFolder(): AutomationFolderSummary {
  return {
    id: "folder-1",
    name: "Ops",
    kind: "custom",
    createdAt: "2026-06-14T09:00:00.000Z",
    updatedAt: "2026-06-14T09:00:00.000Z",
    threads: [],
  };
}

function task(): OrchestrationTask {
  return {
    id: "task-1",
    identifier: "LT-1",
    title: "Review queue",
    state: "todo",
    priority: 2,
    labels: [],
    blockedBy: [],
    sourceKind: "manual",
    createdAt: "2026-06-14T09:00:00.000Z",
    updatedAt: "2026-06-14T09:00:00.000Z",
  };
}
