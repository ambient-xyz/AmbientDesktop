import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "../projectStore/projectStore";
import { runDueWorkflowArtifactSchedules, workflowArtifactScheduleBlockReason, workflowScheduleRunStartedEventData } from "./workflowScheduleDispatch";
import type { PermissionAuditEntry } from "../../shared/permissionTypes"; import type { WorkflowManifest } from "../../shared/workflowTypes";
import { workflowThreadScheduleState } from "../../renderer/src/workflowReviewUiModel";
import { permissionGrantTargetHash } from "../permissions/permissionGrants";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("workflow schedule dispatch", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-schedule-dispatch-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("skips due workflow schedules until their artifact is approved", async () => {
    const artifact = createArtifact("approved");
    const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
    const dueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_artifact",
        targetId: artifact.id,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      createdAt,
    )[0];
    store.updateWorkflowArtifact({ id: artifact.id, status: "ready_for_preview" });

    const results = await runDueWorkflowArtifactSchedules(store, dueAt, async () => {
      throw new Error("Unapproved workflow artifact should not run.");
    });

    expect(results).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        artifactId: artifact.id,
        outcome: "skipped",
        reason: "Workflow preview needs approval before scheduled execution.",
      }),
    ]);
    const run = store.listWorkflowRuns(artifact.id)[0];
    expect(run).toMatchObject({
      status: "skipped",
      error: "Workflow preview needs approval before scheduled execution.",
      scheduledBy: {
        scheduleId: schedule.id,
        outcome: "skipped",
      },
    });
    expect(store.listWorkflowRunEvents(run.id)).toEqual([
      expect.objectContaining({
        type: "workflow.schedule.skipped",
        message: "Workflow preview needs approval before scheduled execution.",
        data: expect.objectContaining({ scheduleId: schedule.id, artifactStatus: "ready_for_preview" }),
      }),
    ]);
    expect(store.listAutomationSchedules()[0]).toMatchObject({
      id: schedule.id,
      lastRunAt: dueAt.toISOString(),
      nextRunAt: new Date(2026, 0, 2, 9, 0, 0, 0).toISOString(),
    });
  });

  it("runs approved due workflow schedules through the provided runner", async () => {
    const artifact = createArtifact("approved");
    const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
    const dueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_artifact",
        targetId: artifact.id,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      createdAt,
    )[0];

    const results = await runDueWorkflowArtifactSchedules(store, dueAt, async ({ schedule: runnerSchedule, artifact: runnerArtifact, grantDecision, versionId }) => {
      expect(runnerSchedule.id).toBe(schedule.id);
      expect(runnerArtifact.id).toBe(artifact.id);
      expect(versionId).toBeUndefined();
      expect(grantDecision).toEqual({ source: "none", connectorTargets: [], grantIds: [], grantTargets: [] });
      const run = store.startWorkflowRun({ artifactId: artifact.id, status: "succeeded" });
      store.appendWorkflowRunEvent({
        runId: run.id,
        type: "workflow.schedule.started",
        message: schedule.id,
        data: workflowScheduleRunStartedEventData({ schedule: runnerSchedule, artifact: runnerArtifact, now: dueAt, grantDecision, versionId }),
      });
      return { runId: run.id };
    });

    expect(results).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        artifactId: artifact.id,
        outcome: "started",
        runId: store.listWorkflowRuns(artifact.id)[0].id,
      }),
    ]);
    expect(store.listAutomationSchedules()[0]).toMatchObject({
      id: schedule.id,
      lastRunAt: dueAt.toISOString(),
      nextRunAt: new Date(2026, 0, 2, 9, 0, 0, 0).toISOString(),
    });
  });

  it("passes schedule and occurrence run-limit overrides into due workflow dispatch", async () => {
    const artifact = createArtifact("approved");
    const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
    const dueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_artifact",
        targetId: artifact.id,
        preset: "daily",
        timezone: "America/Phoenix",
        runLimits: { idleTimeoutMs: 120_000, maxRunMs: null },
      },
      createdAt,
    )[0];
    const edited = store.updateAutomationScheduleOccurrenceRunLimits({
      scheduleId: schedule.id,
      occurrenceAt: schedule.nextRunAt,
      runLimits: { idleTimeoutMs: 600_000, maxRunMs: 600_000 },
      reason: "Give this occurrence more room.",
    });
    const occurrenceException = edited.exceptions.find((exception) => exception.exceptionKind === "run_limits")!;

    const results = await runDueWorkflowArtifactSchedules(store, dueAt, async (scheduleInput) => {
      expect(scheduleInput.runLimits).toEqual({ idleTimeoutMs: 600_000, maxRunMs: 600_000 });
      expect(scheduleInput.occurrenceExceptionId).toBe(occurrenceException.id);
      const run = store.startWorkflowRun({ artifactId: artifact.id, status: "succeeded" });
      store.appendWorkflowRunEvent({
        runId: run.id,
        type: "workflow.schedule.started",
        message: schedule.id,
        data: workflowScheduleRunStartedEventData(scheduleInput),
      });
      return { runId: run.id };
    });

    expect(results).toEqual([expect.objectContaining({ scheduleId: schedule.id, outcome: "started" })]);
    expect(store.listWorkflowRunEvents(results[0].runId!)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "workflow.schedule.started",
          data: expect.objectContaining({
            runLimits: { idleTimeoutMs: 600_000, maxRunMs: 600_000 },
            occurrenceExceptionId: occurrenceException.id,
          }),
        }),
      ]),
    );
    expect(store.listAutomationScheduleExceptions({ scheduleId: schedule.id })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: occurrenceException.id, exceptionKind: "run_limits", status: "consumed" })]),
    );
  });

  it("runs workflow thread schedules against the latest approved version", async () => {
    const artifact = createArtifact("approved");
    const version = store.createWorkflowVersion({
      workflowThreadId: artifact.workflowThreadId!,
      artifactId: artifact.id,
      sourcePath: artifact.sourcePath,
      repoPath: workspacePath,
      status: "approved",
      createdBy: "compiler",
    });
    const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
    const dueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_thread",
        targetId: artifact.workflowThreadId!,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      createdAt,
    )[0];
    expect(schedule).toMatchObject({ createdTargetVersionId: version.id });

    const results = await runDueWorkflowArtifactSchedules(store, dueAt, async ({ artifact: runnerArtifact, workflowThreadId, versionId, grantDecision }) => {
      expect(runnerArtifact.id).toBe(artifact.id);
      expect(workflowThreadId).toBe(artifact.workflowThreadId);
      expect(versionId).toBe(version.id);
      expect(grantDecision.source).toBe("none");
      const run = store.startWorkflowRun({ artifactId: runnerArtifact.id, status: "succeeded" });
      return { runId: run.id };
    });

    expect(results).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        artifactId: artifact.id,
        workflowThreadId: artifact.workflowThreadId,
        versionId: version.id,
        outcome: "started",
      }),
    ]);
  });

  it("updates workflow schedules as all-occurrence calendar edits", () => {
    const artifact = createArtifact("approved");
    const version = store.createWorkflowVersion({
      workflowThreadId: artifact.workflowThreadId!,
      artifactId: artifact.id,
      sourcePath: artifact.sourcePath,
      repoPath: workspacePath,
      status: "approved",
      createdBy: "compiler",
    });
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_thread",
        targetId: artifact.workflowThreadId!,
        preset: "daily",
        timezone: "America/Phoenix",
        enabled: true,
      },
      new Date(2026, 0, 1, 8, 0, 0, 0),
    )[0];

    const updated = store
      .updateAutomationSchedule(
        {
          id: schedule.id,
          targetKind: "workflow_version",
          targetId: version.id,
          preset: "weekly",
          timezone: "America/Phoenix",
          enabled: false,
          skipIfActive: true,
          editScope: "all_occurrences",
        },
        new Date(2026, 0, 1, 12, 0, 0, 0),
      )
      .find((candidate) => candidate.id === schedule.id);

    expect(updated).toMatchObject({
      id: schedule.id,
      targetKind: "workflow_version",
      targetId: version.id,
      targetLabel: expect.stringContaining("pinned"),
      preset: "weekly",
      enabled: false,
      nextRunAt: undefined,
      createdTargetVersionId: version.id,
    });
    expect(() => store.updateAutomationSchedule({ id: schedule.id, editScope: "this_occurrence" })).toThrow(
      "Use Skip next occurrence or Reschedule next occurrence for one-off schedule changes.",
    );
  });

  it("stores workflow schedule occurrence skip, reschedule, and this-and-following edits", async () => {
    const artifact = createArtifact("approved");
    const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_artifact",
        targetId: artifact.id,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      createdAt,
    )[0];
    expect(schedule.nextRunAt).toBe(new Date(2026, 0, 1, 9, 0, 0, 0).toISOString());

    const skipped = store.skipAutomationScheduleOccurrence({
      scheduleId: schedule.id,
      occurrenceAt: schedule.nextRunAt,
      reason: "User is traveling.",
    });
    expect(skipped.schedules.find((candidate) => candidate.id === schedule.id)).toMatchObject({
      nextRunAt: new Date(2026, 0, 2, 9, 0, 0, 0).toISOString(),
      lastRunAt: undefined,
    });
    expect(skipped.exceptions).toEqual([
      expect.objectContaining({ exceptionKind: "skip", occurrenceAt: schedule.nextRunAt, status: "consumed", reason: "User is traveling." }),
    ]);

    const deferredRunAt = new Date(2026, 0, 2, 12, 0, 0, 0).toISOString();
    const deferred = store.rescheduleAutomationScheduleOccurrence(
      {
        scheduleId: schedule.id,
        occurrenceAt: new Date(2026, 0, 2, 9, 0, 0, 0).toISOString(),
        replacementRunAt: deferredRunAt,
      },
      new Date(2026, 0, 1, 12, 0, 0, 0),
    );
    expect(deferred.schedules.find((candidate) => candidate.id === schedule.id)).toMatchObject({ nextRunAt: deferredRunAt });
    expect(deferred.exceptions).toEqual(
      expect.arrayContaining([expect.objectContaining({ exceptionKind: "reschedule", occurrenceAt: new Date(2026, 0, 2, 9, 0, 0, 0).toISOString(), status: "consumed", replacementRunAt: deferredRunAt })]),
    );

    store.updateAutomationSchedule(
      {
        id: schedule.id,
        editScope: "this_and_following",
        occurrenceAt: deferredRunAt,
        preset: "weekly",
        enabled: true,
      },
      new Date(2026, 0, 2, 10, 0, 0, 0),
    );
    expect(store.listAutomationScheduleExceptions({ scheduleId: schedule.id })).toEqual(
      expect.arrayContaining([expect.objectContaining({ exceptionKind: "series_update", occurrenceAt: deferredRunAt, status: "consumed" })]),
    );
  });

  it("honors pending workflow schedule occurrence exceptions during dispatch", async () => {
    const artifact = createArtifact("approved");
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_artifact",
        targetId: artifact.id,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      new Date(2026, 0, 1, 8, 0, 0, 0),
    )[0];
    const occurrenceAt = new Date(2026, 0, 3, 9, 0, 0, 0).toISOString();
    store.skipAutomationScheduleOccurrence({ scheduleId: schedule.id, occurrenceAt, reason: "One-off blackout." });

    const current = store.listAutomationSchedules().find((candidate) => candidate.id === schedule.id)!;
    store.rescheduleAutomationScheduleOccurrence(
      {
        scheduleId: current.id,
        occurrenceAt: current.nextRunAt,
        replacementRunAt: occurrenceAt,
      },
      new Date(2026, 0, 1, 8, 30, 0, 0),
    );

    const results = await runDueWorkflowArtifactSchedules(store, new Date(occurrenceAt), async () => {
      throw new Error("Skipped workflow occurrence should not run.");
    });

    expect(results).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        outcome: "skipped",
        reason: "One-off blackout.",
      }),
    ]);
  });

  it("skips workflow thread schedules without an approved version", async () => {
    const artifact = createArtifact("approved");
    store.createWorkflowVersion({
      workflowThreadId: artifact.workflowThreadId!,
      artifactId: artifact.id,
      sourcePath: artifact.sourcePath,
      repoPath: workspacePath,
      status: "approved",
      createdBy: "compiler",
    });
    const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
    const dueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_thread",
        targetId: artifact.workflowThreadId!,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      createdAt,
    )[0];
    store.updateWorkflowVersionStatusForArtifact(artifact.id, "ready_for_review");
    store.updateWorkflowArtifact({ id: artifact.id, status: "ready_for_preview" });

    const results = await runDueWorkflowArtifactSchedules(store, dueAt, async () => {
      throw new Error("Workflow thread without an approved version should not run.");
    });

    expect(results).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        artifactId: artifact.id,
        workflowThreadId: artifact.workflowThreadId,
        outcome: "skipped",
        reason: "Workflow Agent has no approved version to schedule.",
      }),
    ]);
  });

  it("runs pinned workflow version schedules", async () => {
    const artifact = createArtifact("approved");
    const version = store.createWorkflowVersion({
      workflowThreadId: artifact.workflowThreadId!,
      artifactId: artifact.id,
      sourcePath: artifact.sourcePath,
      repoPath: workspacePath,
      status: "approved",
      createdBy: "compiler",
    });
    const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
    const dueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_version",
        targetId: version.id,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      createdAt,
    )[0];

    const results = await runDueWorkflowArtifactSchedules(store, dueAt, async ({ artifact: runnerArtifact }) => {
      expect(runnerArtifact.id).toBe(artifact.id);
      const run = store.startWorkflowRun({ artifactId: runnerArtifact.id, status: "succeeded" });
      return { runId: run.id };
    });

    expect(results).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        artifactId: artifact.id,
        workflowThreadId: artifact.workflowThreadId,
        versionId: version.id,
        outcome: "started",
      }),
    ]);
  });

  it("skips pinned workflow version schedules until that version is approved", async () => {
    const artifact = createArtifact("approved");
    const version = store.createWorkflowVersion({
      workflowThreadId: artifact.workflowThreadId!,
      artifactId: artifact.id,
      sourcePath: artifact.sourcePath,
      repoPath: workspacePath,
      status: "approved",
      createdBy: "compiler",
    });
    const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
    const dueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_version",
        targetId: version.id,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      createdAt,
    )[0];
    store.updateWorkflowVersionStatusForArtifact(artifact.id, "ready_for_review");
    store.updateWorkflowArtifact({ id: artifact.id, status: "ready_for_preview" });

    const results = await runDueWorkflowArtifactSchedules(store, dueAt, async () => {
      throw new Error("Unapproved pinned version should not run.");
    });

    expect(results).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        artifactId: artifact.id,
        workflowThreadId: artifact.workflowThreadId,
        versionId: version.id,
        outcome: "skipped",
        reason: "Pinned workflow version is ready_for_review and cannot be scheduled until approved.",
      }),
    ]);
  });

  it("skips approved workflow schedules with missing connector accounts", async () => {
    const artifact = createArtifact("approved", {
      tools: ["gmail.search"],
      connectors: [{ connectorId: "gmail.mail", scopes: ["mail.read"], operations: ["search"], dataRetention: "redacted_audit" }],
      mutationPolicy: "read_only",
    });
    const version = store.createWorkflowVersion({
      workflowThreadId: artifact.workflowThreadId!,
      artifactId: artifact.id,
      sourcePath: artifact.sourcePath,
      repoPath: workspacePath,
      status: "approved",
      createdBy: "compiler",
    });
    const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
    const dueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_thread",
        targetId: artifact.workflowThreadId!,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      createdAt,
    )[0];

    const results = await runDueWorkflowArtifactSchedules(store, dueAt, async () => {
      throw new Error("Workflow missing a connector account should not run.");
    });

    expect(results).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        artifactId: artifact.id,
        workflowThreadId: artifact.workflowThreadId,
        versionId: version.id,
        outcome: "skipped",
        reason: "Workflow schedule requires connector account for gmail.mail.",
      }),
    ]);
  });

  it("dogfoods persistent connector grant reuse and revoked-grant schedule blocking", async () => {
    const artifact = createArtifact("approved", {
      tools: ["gmail.search"],
      connectors: [
        {
          connectorId: "gmail.mail",
          accountId: "primary",
          scopes: ["mail.read"],
          operations: ["search"],
          dataRetention: "redacted_audit",
        },
      ],
      mutationPolicy: "read_only",
    });
    const version = store.createWorkflowVersion({
      workflowThreadId: artifact.workflowThreadId!,
      artifactId: artifact.id,
      sourcePath: artifact.sourcePath,
      repoPath: workspacePath,
      status: "approved",
      createdBy: "compiler",
    });
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_thread",
        targetId: artifact.workflowThreadId!,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      new Date(2026, 0, 1, 8, 0, 0, 0),
    )[0];

    const firstDueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
    const first = await runDueWorkflowArtifactSchedules(store, firstDueAt, async () => {
      throw new Error("Schedule without a persistent connector grant should not run.");
    });
    expect(first).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        artifactId: artifact.id,
        versionId: version.id,
        outcome: "skipped",
	        reason: "Workflow schedule requires persistent connector grant for gmail.mail:search.",
      }),
    ]);

    const grant = store.createPermissionGrant({
      permissionModeAtCreation: "workspace",
      scopeKind: "workflow_thread",
      workflowThreadId: artifact.workflowThreadId,
      actionKind: "connector_content_read",
      targetKind: "connector",
      targetHash: permissionGrantTargetHash("connector_content_read", "connector", "gmail.mail:search"),
      targetLabel: "gmail.mail:search",
      conditions: { scheduledWorkflow: true },
      source: "permission_prompt",
      reason: "Allow scheduled Gmail read for this workflow.",
    });

    const secondDueAt = new Date(2026, 0, 2, 10, 0, 0, 0);
    const auditThread = store.createThread("Schedule audit receipts");
    const auditEntries: PermissionAuditEntry[] = [];
    const second = await runDueWorkflowArtifactSchedules(store, secondDueAt, async (scheduleInput) => {
      const { artifact: runnerArtifact, grantDecision, versionId } = scheduleInput;
      expect(runnerArtifact.id).toBe(artifact.id);
      expect(versionId).toBe(version.id);
      expect(grantDecision).toEqual({
        source: "persistent_grant",
        connectorTargets: ["gmail.mail:search"],
        grantIds: [grant.id],
        grantTargets: ["gmail.mail:search"],
      });
      const run = store.startWorkflowRun({ artifactId: artifact.id, status: "succeeded" });
      store.appendWorkflowRunEvent({
        runId: run.id,
        type: "workflow.schedule.started",
        message: schedule.id,
        data: workflowScheduleRunStartedEventData(scheduleInput),
      });
      return { runId: run.id };
    }, { threadId: auditThread.id, onPermissionAuditCreated: (entry) => auditEntries.push(entry) });
    expect(second).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        outcome: "started",
      }),
    ]);
    expect(auditEntries).toEqual([
      expect.objectContaining({
        toolName: "gmail.mail.search",
        decision: "allowed",
        decisionSource: "persistent_grant",
        grantId: grant.id,
        reason: "Scheduled workflow preflight reused a persistent connector grant.",
      }),
    ]);
    expect(store.listPermissionAudit()).toEqual([expect.objectContaining({ id: auditEntries[0].id, grantId: grant.id })]);
    expect(store.listWorkflowRunEvents(second[0].runId!)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "workflow.schedule.started",
          data: expect.objectContaining({
            scheduleId: schedule.id,
            targetKind: "workflow_thread",
            workflowThreadId: artifact.workflowThreadId,
            targetVersionId: version.id,
            grantDecisionSource: "persistent_grant",
            grantIds: [grant.id],
            grantTargets: ["gmail.mail:search"],
          }),
        }),
      ]),
    );
    expect(store.getWorkflowRun(second[0].runId!)).toMatchObject({
      scheduledBy: {
        scheduleId: schedule.id,
        targetKind: "workflow_thread",
        targetVersionId: version.id,
        createdTargetVersionId: version.id,
        grantDecisionSource: "persistent_grant",
      },
    });

    store.revokePermissionGrant(grant.id);
    const thirdDueAt = new Date(2026, 0, 3, 10, 0, 0, 0);
    const third = await runDueWorkflowArtifactSchedules(store, thirdDueAt, async () => {
      throw new Error("Schedule with a revoked persistent connector grant should not run.");
    });
    expect(third).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        outcome: "skipped",
	        reason: "Workflow schedule requires persistent connector grant for gmail.mail:search.",
      }),
    ]);
    expect(store.listPermissionGrants()).toEqual([]);
    expect(store.listPermissionGrants({ includeRevoked: true })).toEqual([expect.objectContaining({ id: grant.id, revokedAt: expect.any(String) })]);
  });

  it("blocks full-access schedules until a persistent connector grant exists", async () => {
    const artifact = createArtifact("approved", {
      tools: ["gmail.search"],
      connectors: [
        {
          connectorId: "gmail.mail",
          accountId: "primary",
          scopes: ["mail.read"],
          operations: ["search"],
          dataRetention: "redacted_audit",
        },
      ],
      mutationPolicy: "read_only",
    });
    const version = store.createWorkflowVersion({
      workflowThreadId: artifact.workflowThreadId!,
      artifactId: artifact.id,
      sourcePath: artifact.sourcePath,
      repoPath: workspacePath,
      status: "approved",
      createdBy: "compiler",
    });
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_thread",
        targetId: artifact.workflowThreadId!,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      new Date(2026, 0, 1, 8, 0, 0, 0),
    )[0];

    const results = await runDueWorkflowArtifactSchedules(
      store,
      new Date(2026, 0, 1, 10, 0, 0, 0),
      async () => {
        throw new Error("Full Access should not bypass scheduled connector grants.");
      },
      { permissionMode: "full-access" },
    );

    expect(results).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        artifactId: artifact.id,
        versionId: version.id,
        outcome: "skipped",
        reason: "Workflow schedule requires persistent connector grant for gmail.mail:search.",
      }),
    ]);
  });

  it("dogfoods latest-approved drift, pinned stability, and missing-grant schedule state", async () => {
    const artifact = createArtifact("approved");
    const firstVersion = store.createWorkflowVersion({
      workflowThreadId: artifact.workflowThreadId!,
      artifactId: artifact.id,
      sourcePath: artifact.sourcePath,
      repoPath: workspacePath,
      status: "approved",
      createdBy: "compiler",
    });
    const latestSchedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_thread",
        targetId: artifact.workflowThreadId!,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      new Date(2026, 0, 1, 8, 0, 0, 0),
    )[0];
    const pinnedSchedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_version",
        targetId: firstVersion.id,
        preset: "weekly",
        timezone: "America/Phoenix",
      },
      new Date(2026, 0, 1, 8, 5, 0, 0),
    )[0];
    const secondVersion = store.createWorkflowVersion({
      workflowThreadId: artifact.workflowThreadId!,
      artifactId: artifact.id,
      sourcePath: artifact.sourcePath,
      repoPath: workspacePath,
      status: "approved",
      createdBy: "compiler",
    });
    const driftState = workflowThreadScheduleState({
      thread: store.getWorkflowAgentThreadSummary(artifact.workflowThreadId!),
      artifact: store.getWorkflowArtifact(artifact.id),
      versions: store.listWorkflowVersions(artifact.workflowThreadId!),
      schedules: store.listAutomationSchedules(),
    });

    expect(driftState.schedules.find((scheduleItem) => scheduleItem.id === latestSchedule.id)).toMatchObject({
      versionLabel: "Runs latest approved v2",
      driftLabel: "Drifted from created v1 to latest approved v2",
      dispatchLabel: "Dispatchable",
    });
    expect(driftState.schedules.find((scheduleItem) => scheduleItem.id === pinnedSchedule.id)).toMatchObject({
      versionLabel: "Pinned to v1",
      driftLabel: "No latest-approved drift",
      dispatchLabel: "Dispatchable",
    });

    store.updateWorkflowArtifact({
      id: artifact.id,
      status: "approved",
      manifest: {
        tools: ["gmail.search"],
        connectors: [{ connectorId: "gmail.mail", scopes: ["mail.read"], operations: ["search"], dataRetention: "redacted_audit" }],
        mutationPolicy: "read_only",
      },
    });
    const blockedState = workflowThreadScheduleState({
      thread: store.getWorkflowAgentThreadSummary(artifact.workflowThreadId!),
      artifact: store.getWorkflowArtifact(artifact.id),
      versions: store.listWorkflowVersions(artifact.workflowThreadId!),
      schedules: store.listAutomationSchedules(),
    });

    expect(blockedState.schedules.find((scheduleItem) => scheduleItem.id === latestSchedule.id)).toMatchObject({
      driftLabel: "Drifted from created v1 to latest approved v2",
      dispatchLabel: "Blocked: connector account needed for gmail.mail",
      dispatchTone: "blocked",
    });
    expect(store.listAutomationSchedules()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: latestSchedule.id, createdTargetVersionId: firstVersion.id }),
        expect.objectContaining({ id: pinnedSchedule.id, createdTargetVersionId: firstVersion.id }),
      ]),
    );

    await writeScheduleStateDogfoodArtifact({
      versions: [
        { id: firstVersion.id, version: firstVersion.version },
        { id: secondVersion.id, version: secondVersion.version },
      ],
      driftState: driftState.schedules.map((scheduleItem) => ({
        id: scheduleItem.id,
        mode: scheduleItem.mode,
        versionLabel: scheduleItem.versionLabel,
        driftLabel: scheduleItem.driftLabel,
        dispatchLabel: scheduleItem.dispatchLabel,
      })),
      blockedState: blockedState.schedules.map((scheduleItem) => ({
        id: scheduleItem.id,
        mode: scheduleItem.mode,
        versionLabel: scheduleItem.versionLabel,
        driftLabel: scheduleItem.driftLabel,
        dispatchLabel: scheduleItem.dispatchLabel,
        dispatchTone: scheduleItem.dispatchTone,
      })),
    });
  });

  it("classifies workflow schedule approval blockers", () => {
    expect(workflowArtifactScheduleBlockReason(createArtifact("approved"))).toBeUndefined();
    expect(
      workflowArtifactScheduleBlockReason(
        createArtifact("approved", {
          tools: ["gmail.search"],
          connectors: [{ connectorId: "gmail.mail", scopes: ["mail.read"], operations: ["search"], dataRetention: "redacted_audit" }],
          mutationPolicy: "read_only",
        }),
      ),
    ).toBe("Workflow schedule requires connector account for gmail.mail.");
    const ambientCliArtifact = createArtifact("approved", {
      tools: ["ambient_cli"],
      ambientCliCapabilities: [
        {
          capabilityId: "pkg-youtube:tool:youtube_transcript",
          registryPluginId: "cli:pkg-youtube",
          packageId: "pkg-youtube",
          packageName: "youtube-transcript",
          command: "youtube_transcript",
        },
      ],
      mutationPolicy: "read_only",
    });
    expect(workflowArtifactScheduleBlockReason(ambientCliArtifact)).toBe("Workflow schedule requires reviewed Ambient CLI grant for youtube-transcript:youtube_transcript.");
    expect(
      workflowArtifactScheduleBlockReason(ambientCliArtifact, {
        workflowThreadId: ambientCliArtifact.workflowThreadId,
        workspacePath,
        permissionGrants: [
          {
            id: "grant-cli",
            createdAt: "2026-05-02T00:00:00.000Z",
            updatedAt: "2026-05-02T00:00:00.000Z",
            createdBy: "user",
            permissionModeAtCreation: "workspace",
            scopeKind: "workspace",
            workspacePath,
            actionKind: "plugin_tool_execute",
            targetKind: "tool",
            targetHash: permissionGrantTargetHash("plugin_tool_execute", "tool", "Run Ambient CLI youtube-transcript:youtube_transcript"),
            targetLabel: "Run Ambient CLI youtube-transcript:youtube_transcript",
            source: "permission_prompt",
            reason: "Allowed from test.",
          },
        ],
      }),
    ).toBeUndefined();
    expect(workflowArtifactScheduleBlockReason(createArtifact("rejected"))).toBe("Workflow artifact is rejected and cannot be scheduled until approved.");
  });

  function createArtifact(status: "approved" | "ready_for_preview" | "rejected", manifest: WorkflowManifest = { tools: [], mutationPolicy: "read_only" }) {
    return store.createWorkflowArtifact({
      title: `${status} workflow`,
      status,
      manifest,
      spec: { goal: "Scheduled workflow test." },
      sourcePath: join(workspacePath, `${status}.ts`),
      statePath: join(workspacePath, `${status}.json`),
    });
  }
});

async function writeScheduleStateDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-schedule-state-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
