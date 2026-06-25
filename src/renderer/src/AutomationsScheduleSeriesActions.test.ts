import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AutomationScheduleExceptionSummary, AutomationScheduleSummary } from "../../shared/automationTypes";
import { googleWorkspaceGrantTargetIdentityCondition } from "../../shared/googleWorkspaceGrantTargets";
import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary } from "../../shared/workflowTypes";
import { createAutomationScheduleSeriesActions, type AutomationScheduleSeriesActionsInput } from "./AutomationsScheduleSeriesActions";

describe("createAutomationScheduleSeriesActions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves focused workflow schedules with the existing occurrence scope and run-limit payload", async () => {
    const saved = schedule({ id: "schedule-1", targetKind: "workflow_thread", targetId: "workflow-thread-1" });
    const nextSchedules = [saved];
    const ambientDesktop = {
      createAutomationSchedule: vi.fn(),
      updateAutomationSchedule: vi.fn(async () => nextSchedules),
      listAutomationScheduleExceptions: vi.fn(async () => [] as AutomationScheduleExceptionSummary[]),
    };
    vi.stubGlobal("window", { ambientDesktop });
    const schedules = stateCell<AutomationScheduleSummary[]>([schedule({ id: "schedule-1", nextRunAt: "2026-06-14T10:00:00.000Z" })]);
    const exceptions = stateCell<AutomationScheduleExceptionSummary[]>([]);
    const setScheduleTarget = vi.fn();

    const actions = createAutomationScheduleSeriesActions(
      baseInput({
        automationSchedules: schedules.current,
        focusedScheduleId: "schedule-1",
        scheduleEditScope: "this_and_following",
        schedulePreset: "advanced",
        scheduleExpression: "15 10 * * *",
        scheduleEnabled: false,
        scheduleRunIdleTimeoutMs: 120_000,
        scheduleRunTotalLimitMode: "disabled",
        setAutomationSchedules: schedules.set,
        setAutomationScheduleExceptions: exceptions.set,
        setScheduleTarget,
      }),
    );

    await actions.saveWorkflowSchedule("workflow_thread", "workflow-thread-1", workflowArtifact());

    expect(setScheduleTarget).toHaveBeenCalledWith("workflow_thread", "workflow-thread-1");
    expect(ambientDesktop.createAutomationSchedule).not.toHaveBeenCalled();
    expect(ambientDesktop.updateAutomationSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "schedule-1",
        editScope: "this_and_following",
        occurrenceAt: "2026-06-14T10:00:00.000Z",
        targetKind: "workflow_thread",
        targetId: "workflow-thread-1",
        preset: "advanced",
        cronExpression: "15 10 * * *",
        enabled: false,
        skipIfActive: true,
        runLimits: {
          idleTimeoutMs: 120_000,
          maxRunMs: null,
        },
      }),
    );
    expect(schedules.current).toBe(nextSchedules);
    expect(exceptions.current).toEqual([]);
  });

  it("creates scheduled workflow connector grants with the existing identity condition", async () => {
    const createPermissionGrantTargetHash = vi.fn(async () => "target-hash");
    const ambientDesktop = {
      createPermissionGrant: vi.fn(async () => undefined),
    };
    vi.stubGlobal("window", { ambientDesktop });
    const actions = createAutomationScheduleSeriesActions(
      baseInput({
        activeThreadId: "chat-thread-1",
        workspacePath: "/workspace",
        createPermissionGrantTargetHash,
      }),
    );

    await actions.createWorkflowScheduleGrantAction(workflowThread(), {
      label: "Grant Drive read",
      connectorId: "google-drive",
      operation: "docs.read",
      accountId: "acct-1",
      targetLabel: "Google Drive",
      targetIdentity: "person@example.com",
      scopeKind: "workflow_thread",
      reason: "Scheduled workflow needs source docs.",
    });

    expect(createPermissionGrantTargetHash).toHaveBeenCalledWith("connector_content_read", "connector", "person@example.com");
    expect(ambientDesktop.createPermissionGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionModeAtCreation: "workspace",
        scopeKind: "workflow_thread",
        threadId: "chat-thread-1",
        workflowThreadId: "workflow-thread-1",
        projectPath: "/project",
        workspacePath: "/workspace",
        actionKind: "connector_content_read",
        targetKind: "connector",
        targetHash: "target-hash",
        targetLabel: "Google Drive",
        source: "workflow_review",
        reason: "Scheduled workflow needs source docs.",
        conditions: expect.objectContaining({
          scheduledWorkflow: true,
          connectorId: "google-drive",
          operation: "docs.read",
          accountId: "acct-1",
          [googleWorkspaceGrantTargetIdentityCondition]: "person@example.com",
        }),
      }),
    );
  });
});

function baseInput(overrides: Partial<AutomationScheduleSeriesActionsInput> = {}): AutomationScheduleSeriesActionsInput {
  return {
    activeThreadId: undefined,
    workspacePath: "/workspace",
    createPermissionGrantTargetHash: vi.fn(async () => "target-hash"),
    scheduleTargetType: "local_task",
    scheduleTargetId: "",
    schedulePreset: "daily",
    scheduleExpression: "0 9 * * *",
    scheduleEnabled: true,
    scheduleRunIdleTimeoutMs: 30_000,
    scheduleRunTotalLimitMode: "manifest",
    automationSchedules: [],
    focusedScheduleId: undefined,
    scheduleEditScope: "all_occurrences",
    setScheduleTarget: vi.fn(),
    setAutomationSchedules: vi.fn(),
    setAutomationScheduleExceptions: vi.fn(),
    setFocusedScheduleId: vi.fn(),
    setScheduleTargetType: vi.fn(),
    setScheduleTargetId: vi.fn(),
    setSchedulePreset: vi.fn(),
    setScheduleExpression: vi.fn(),
    setScheduleEnabled: vi.fn(),
    setScheduleRunIdleTimeoutMs: vi.fn(),
    setScheduleRunTotalLimitMode: vi.fn(),
    setScheduleEditScope: vi.fn(),
    setScheduleOccurrenceEditor: vi.fn(),
    setWorkflowSchedulePanel: vi.fn(),
    setScheduleBusy: vi.fn(),
    setScheduleError: vi.fn(),
    ...overrides,
  };
}

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

function workflowArtifact(): Pick<WorkflowArtifactSummary, "manifest"> {
  return {
    manifest: {
      tools: [],
      pluginCapabilities: [],
      ambientCliCapabilities: [],
      connectors: [],
      mutationPolicy: "staged_until_approved",
      maxRunMs: 600_000,
    },
  };
}

function workflowThread(): WorkflowAgentThreadSummary {
  return {
    id: "workflow-thread-1",
    projectPath: "/project",
  } as WorkflowAgentThreadSummary;
}

function stateCell<T>(initial: T): { readonly current: T; set: Dispatch<SetStateAction<T>> } {
  let current = initial;
  return {
    get current() {
      return current;
    },
    set(next) {
      current = typeof next === "function" ? (next as (currentValue: T) => T)(current) : next;
    },
  };
}
