import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  AutomationScheduleExceptionKind,
  AutomationScheduleExceptionStatus,
  AutomationScheduleExceptionSummary,
  AutomationScheduleOccurrenceActionInput,
  AutomationScheduleOccurrenceActionResult,
  AutomationScheduleSummary,
  AutomationScheduleTargetKind,
  CreateAutomationScheduleInput,
  UpdateAutomationScheduleInput,
} from "../../shared/automationTypes";
import type {
  OrchestrationTask,
  WorkflowArtifactSummary,
  WorkflowAgentThreadSummary,
  WorkflowRecordingLibraryDescription,
  WorkflowRunLimitOverrides,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { computeAutomationScheduleNextRunAt, normalizeAutomationScheduleCronExpression } from "./automationSchedules";
import { stringifyWorkflowRunLimitOverrides } from "./projectStoreWorkflowFacade";
import {
  mapAutomationScheduleExceptionRow,
  mapAutomationScheduleRow,
  type AutomationFolderRow,
  type AutomationScheduleExceptionRow,
  type AutomationScheduleRow,
} from "./automationMappers";

export interface ProjectStoreAutomationScheduleRepositoryDeps {
  getWorkspace(): WorkspaceState;
  getOrchestrationTask(taskId: string): OrchestrationTask;
  getWorkflowArtifact(artifactId: string): WorkflowArtifactSummary;
  requireWorkflowRecordingScheduleTarget(id: string, targetVersion?: number): WorkflowRecordingLibraryDescription;
  getLatestApprovedWorkflowVersion(workflowThreadId: string): WorkflowVersionSummary | undefined;
  getWorkflowVersion(versionId: string): WorkflowVersionSummary;
  getWorkflowAgentThreadSummary(threadId: string): WorkflowAgentThreadSummary;
  createThread(title: string, workspacePath: string): ThreadSummary;
  getThread(threadId: string): ThreadSummary;
}

export class ProjectStoreAutomationScheduleRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreAutomationScheduleRepositoryDeps,
  ) {}

  listAutomationSchedules(): AutomationScheduleSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM automation_schedules ORDER BY updated_at DESC, created_at DESC, rowid DESC")
      .all() as AutomationScheduleRow[];
    return rows.map(this.mapAutomationSchedule);
  }

  listAutomationScheduleExceptions(input: { scheduleId?: string } = {}): AutomationScheduleExceptionSummary[] {
    const rows = input.scheduleId
      ? (this.db
          .prepare(
            `SELECT * FROM automation_schedule_exceptions
             WHERE schedule_id = ?
             ORDER BY occurrence_at DESC, created_at DESC, rowid DESC`,
          )
          .all(input.scheduleId) as AutomationScheduleExceptionRow[])
      : (this.db
          .prepare(
            `SELECT * FROM automation_schedule_exceptions
             ORDER BY updated_at DESC, occurrence_at DESC, rowid DESC`,
          )
          .all() as AutomationScheduleExceptionRow[]);
    return rows.map(this.mapAutomationScheduleException);
  }

  createAutomationSchedule(input: CreateAutomationScheduleInput, nowDate = new Date()): AutomationScheduleSummary[] {
    const targetVersion = this.automationScheduleTargetVersion(input.targetKind, input.targetId, input.targetVersion);
    this.requireAutomationScheduleTarget(input.targetKind, input.targetId, targetVersion ?? undefined);
    const blocker = this.automationScheduleCreationBlockReason(input.targetKind, input.targetId, targetVersion ?? undefined);
    if (blocker) throw new Error(blocker);
    const now = nowDate.toISOString();
    const preset = input.preset;
    const cronExpression = normalizeAutomationScheduleCronExpression(preset, input.cronExpression);
    const enabled = input.enabled ?? true;
    const nextRunAt = computeAutomationScheduleNextRunAt({ preset, cronExpression, enabled, now: nowDate });
    const createdTargetVersionId = this.automationScheduleCreatedTargetVersionId(input.targetKind, input.targetId, targetVersion ?? undefined);
    const dedicatedThreadId = this.automationScheduleDedicatedThreadId(input.targetKind, input.targetId, targetVersion ?? undefined);
    const runLimitsJson = stringifyWorkflowRunLimitOverrides(input.runLimits);
    this.db
      .prepare(
        `INSERT INTO automation_schedules
        (id, target_kind, target_id, target_version, created_target_version_id, dedicated_thread_id, preset, cron_expression, timezone, enabled, skip_if_active, concurrency_policy, next_run_at, last_run_at, run_limits_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.targetKind,
        input.targetId,
        targetVersion,
        createdTargetVersionId,
        dedicatedThreadId,
        preset,
        cronExpression ?? null,
        input.timezone?.trim() || "local",
        enabled ? 1 : 0,
        input.skipIfActive === false ? 0 : 1,
        "skip_if_active",
        nextRunAt ?? null,
        null,
        runLimitsJson,
        now,
        now,
      );
    return this.listAutomationSchedules();
  }

  updateAutomationSchedule(input: UpdateAutomationScheduleInput, nowDate = new Date()): AutomationScheduleSummary[] {
    const current = this.db.prepare("SELECT * FROM automation_schedules WHERE id = ?").get(input.id) as
      | AutomationScheduleRow
      | undefined;
    if (!current) throw new Error(`Automation schedule not found: ${input.id}`);
    const editScope = input.editScope ?? "all_occurrences";
    if (editScope === "this_occurrence") {
      throw new Error("Use Skip next occurrence or Reschedule next occurrence for one-off schedule changes.");
    }
    const scopedOccurrenceAt =
      editScope === "this_and_following"
        ? this.normalizeAutomationScheduleOccurrenceAt(input.occurrenceAt ?? current.next_run_at ?? nowDate.toISOString(), "schedule occurrence")
        : undefined;
    const targetKind = input.targetKind ?? current.target_kind;
    const targetId = input.targetId ?? current.target_id;
    const requestedTargetVersion =
      input.targetVersion ?? (targetKind === current.target_kind && targetKind === "workflow_playbook" ? current.target_version ?? undefined : undefined);
    const targetVersion = this.automationScheduleTargetVersion(targetKind, targetId, requestedTargetVersion);
    this.requireAutomationScheduleTarget(targetKind, targetId, targetVersion ?? undefined);
    const blocker = this.automationScheduleCreationBlockReason(targetKind, targetId, targetVersion ?? undefined);
    if (blocker) throw new Error(blocker);
    const preset = input.preset ?? current.preset;
    const cronExpression = normalizeAutomationScheduleCronExpression(preset, input.cronExpression ?? current.cron_expression ?? undefined);
    const enabled = input.enabled ?? (current.enabled === 1);
    const nextRunAt = computeAutomationScheduleNextRunAt({ preset, cronExpression, enabled, now: nowDate });
    const createdTargetVersionId = this.automationScheduleCreatedTargetVersionId(targetKind, targetId, targetVersion ?? undefined);
    const dedicatedThreadId = this.automationScheduleDedicatedThreadId(targetKind, targetId, targetVersion ?? undefined, current.dedicated_thread_id ?? undefined);
    const runLimitsJson = input.runLimits === undefined ? current.run_limits_json : stringifyWorkflowRunLimitOverrides(input.runLimits);
    const now = nowDate.toISOString();
    this.db
      .prepare(
        `UPDATE automation_schedules
         SET target_kind = ?, target_id = ?, target_version = ?, created_target_version_id = ?, dedicated_thread_id = ?, preset = ?, cron_expression = ?, timezone = ?, enabled = ?,
             skip_if_active = ?, concurrency_policy = ?, next_run_at = ?, run_limits_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        targetKind,
        targetId,
        targetVersion,
        createdTargetVersionId,
        dedicatedThreadId,
        preset,
        cronExpression ?? null,
        input.timezone?.trim() || current.timezone || "local",
        enabled ? 1 : 0,
        input.skipIfActive === undefined ? current.skip_if_active : input.skipIfActive ? 1 : 0,
        "skip_if_active",
        nextRunAt ?? null,
        runLimitsJson,
        now,
        input.id,
      );
    if (scopedOccurrenceAt) {
      this.insertAutomationScheduleException({
        scheduleId: input.id,
        occurrenceAt: scopedOccurrenceAt,
        exceptionKind: "series_update",
        status: "consumed",
        replacementRunAt: nextRunAt ?? undefined,
        reason: "Schedule series updated from this occurrence forward.",
        consumedAt: now,
        now,
      });
    }
    return this.listAutomationSchedules();
  }

  skipAutomationScheduleOccurrence(
    input: AutomationScheduleOccurrenceActionInput,
    nowDate = new Date(),
  ): AutomationScheduleOccurrenceActionResult {
    const schedule = this.requireAutomationScheduleRow(input.scheduleId);
    const occurrenceAt = this.normalizeAutomationScheduleOccurrenceAt(input.occurrenceAt ?? schedule.next_run_at, "schedule occurrence");
    const now = nowDate.toISOString();
    const isCurrentNext = schedule.next_run_at === occurrenceAt;
    this.insertAutomationScheduleException({
      scheduleId: schedule.id,
      occurrenceAt,
      exceptionKind: "skip",
      status: isCurrentNext ? "consumed" : "pending",
      reason: input.reason,
      consumedAt: isCurrentNext ? now : undefined,
      now,
    });
    if (isCurrentNext) {
      this.advanceAutomationScheduleNextRun(schedule, new Date(occurrenceAt), now, { markLastRun: false });
    }
    return {
      schedules: this.listAutomationSchedules(),
      exceptions: this.listAutomationScheduleExceptions({ scheduleId: schedule.id }),
    };
  }

  rescheduleAutomationScheduleOccurrence(
    input: AutomationScheduleOccurrenceActionInput,
    nowDate = new Date(),
  ): AutomationScheduleOccurrenceActionResult {
    const schedule = this.requireAutomationScheduleRow(input.scheduleId);
    const occurrenceAt = this.normalizeAutomationScheduleOccurrenceAt(input.occurrenceAt ?? schedule.next_run_at, "schedule occurrence");
    const replacementRunAt = this.normalizeAutomationScheduleOccurrenceAt(input.replacementRunAt, "replacement occurrence");
    const replacementTime = new Date(replacementRunAt).getTime();
    if (Number.isFinite(replacementTime) && replacementTime <= nowDate.getTime()) {
      throw new Error("Replacement occurrence must be in the future.");
    }
    const now = nowDate.toISOString();
    const isCurrentNext = schedule.next_run_at === occurrenceAt;
    this.insertAutomationScheduleException({
      scheduleId: schedule.id,
      occurrenceAt,
      exceptionKind: "reschedule",
      status: isCurrentNext ? "consumed" : "pending",
      replacementRunAt,
      reason: input.reason,
      consumedAt: isCurrentNext ? now : undefined,
      now,
    });
    if (isCurrentNext) {
      this.db
        .prepare("UPDATE automation_schedules SET next_run_at = ?, updated_at = ? WHERE id = ?")
        .run(replacementRunAt, now, schedule.id);
    }
    return {
      schedules: this.listAutomationSchedules(),
      exceptions: this.listAutomationScheduleExceptions({ scheduleId: schedule.id }),
    };
  }

  updateAutomationScheduleOccurrenceRunLimits(
    input: AutomationScheduleOccurrenceActionInput,
    nowDate = new Date(),
  ): AutomationScheduleOccurrenceActionResult {
    if (!input.runLimits) throw new Error("Run limits are required for a schedule occurrence run-limit edit.");
    const schedule = this.requireAutomationScheduleRow(input.scheduleId);
    const occurrenceAt = this.normalizeAutomationScheduleOccurrenceAt(input.occurrenceAt ?? schedule.next_run_at, "schedule occurrence");
    const now = nowDate.toISOString();
    this.insertAutomationScheduleException({
      scheduleId: schedule.id,
      occurrenceAt,
      exceptionKind: "run_limits",
      status: "pending",
      runLimits: input.runLimits,
      reason: input.reason,
      now,
    });
    return {
      schedules: this.listAutomationSchedules(),
      exceptions: this.listAutomationScheduleExceptions({ scheduleId: schedule.id }),
    };
  }

  consumePendingAutomationScheduleOccurrenceException(
    scheduleId: string,
    occurrenceAt: string | undefined,
    nowDate = new Date(),
  ): AutomationScheduleExceptionSummary | undefined {
    if (!occurrenceAt) return undefined;
    const row = this.db
      .prepare(
        `SELECT * FROM automation_schedule_exceptions
         WHERE schedule_id = ? AND occurrence_at = ? AND status = 'pending' AND exception_kind IN ('skip', 'reschedule', 'run_limits')
         ORDER BY created_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(scheduleId, occurrenceAt) as AutomationScheduleExceptionRow | undefined;
    if (!row) return undefined;
    const now = nowDate.toISOString();
    this.db
      .prepare("UPDATE automation_schedule_exceptions SET status = 'consumed', consumed_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, row.id);
    if (row.exception_kind === "reschedule" && row.replacement_run_at) {
      this.db
        .prepare("UPDATE automation_schedules SET next_run_at = ?, updated_at = ? WHERE id = ?")
        .run(row.replacement_run_at, now, scheduleId);
    }
    return this.mapAutomationScheduleException({
      ...row,
      status: "consumed",
      consumed_at: now,
      updated_at: now,
    });
  }

  listDueAutomationSchedules(nowDate = new Date()): AutomationScheduleSummary[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM automation_schedules
         WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
         ORDER BY next_run_at ASC, created_at ASC`,
      )
      .all(nowDate.toISOString()) as AutomationScheduleRow[];
    return rows.map(this.mapAutomationSchedule);
  }

  advanceAutomationSchedule(scheduleId: string, nowDate = new Date()): AutomationScheduleSummary {
    const now = nowDate.toISOString();
    const row = this.requireAutomationScheduleRow(scheduleId);
    this.advanceAutomationScheduleNextRun(row, nowDate, now, { markLastRun: true });
    return this.mapAutomationSchedule(this.db.prepare("SELECT * FROM automation_schedules WHERE id = ?").get(scheduleId) as AutomationScheduleRow);
  }

  ensureAutomationScheduleDedicatedThread(scheduleId: string): ThreadSummary {
    const row = this.requireAutomationScheduleRow(scheduleId);
    if (row.target_kind !== "workflow_playbook") throw new Error("Only workflow playbook schedules have dedicated chat threads.");
    if (row.dedicated_thread_id) {
      try {
        return this.deps.getThread(row.dedicated_thread_id);
      } catch {
        // Fall through and create a replacement thread for schedules restored from older state.
      }
    }
    const threadId = this.automationScheduleDedicatedThreadId(row.target_kind, row.target_id, row.target_version ?? undefined);
    if (!threadId) throw new Error(`Could not create a dedicated thread for schedule ${scheduleId}.`);
    this.db
      .prepare("UPDATE automation_schedules SET dedicated_thread_id = ?, updated_at = ? WHERE id = ?")
      .run(threadId, new Date().toISOString(), scheduleId);
    return this.deps.getThread(threadId);
  }

  private requireAutomationScheduleTarget(kind: AutomationScheduleTargetKind, id: string, targetVersion?: number): void {
    if (!id.trim()) throw new Error("Automation schedule target is required.");
    if (kind === "local_task") {
      this.deps.getOrchestrationTask(id);
      return;
    }
    if (kind === "workflow_playbook") {
      this.deps.requireWorkflowRecordingScheduleTarget(id, targetVersion);
      return;
    }
    if (kind === "workflow_artifact") {
      this.deps.getWorkflowArtifact(id);
      return;
    }
    if (kind === "workflow_thread") {
      this.deps.getWorkflowAgentThreadSummary(id);
      return;
    }
    if (kind === "workflow_version") {
      this.deps.getWorkflowVersion(id);
      return;
    }
    this.requireAutomationFolder(id);
  }

  private requireAutomationScheduleRow(scheduleId: string): AutomationScheduleRow {
    const row = this.db.prepare("SELECT * FROM automation_schedules WHERE id = ?").get(scheduleId) as AutomationScheduleRow | undefined;
    if (!row) throw new Error(`Automation schedule not found: ${scheduleId}`);
    return row;
  }

  private normalizeAutomationScheduleOccurrenceAt(value: string | null | undefined, label: string): string {
    const trimmed = value?.trim();
    if (!trimmed) throw new Error(`${label} is required.`);
    const date = new Date(trimmed);
    if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid date/time.`);
    return date.toISOString();
  }

  private insertAutomationScheduleException(input: {
    scheduleId: string;
    occurrenceAt: string;
    exceptionKind: AutomationScheduleExceptionKind;
    status: AutomationScheduleExceptionStatus;
    replacementRunAt?: string;
    runLimits?: WorkflowRunLimitOverrides;
    reason?: string;
    consumedAt?: string;
    now: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO automation_schedule_exceptions
         (id, schedule_id, occurrence_at, exception_kind, status, replacement_run_at, run_limits_json, reason, consumed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.scheduleId,
        input.occurrenceAt,
        input.exceptionKind,
        input.status,
        input.replacementRunAt ?? null,
        stringifyWorkflowRunLimitOverrides(input.runLimits),
        input.reason?.trim() || null,
        input.consumedAt ?? null,
        input.now,
        input.now,
      );
  }

  private advanceAutomationScheduleNextRun(
    schedule: AutomationScheduleRow,
    occurrenceDate: Date,
    updatedAt: string,
    options: { markLastRun: boolean },
  ): void {
    const nextRunAt = computeAutomationScheduleNextRunAt({
      preset: schedule.preset,
      cronExpression: schedule.cron_expression ?? undefined,
      enabled: schedule.enabled === 1,
      now: occurrenceDate,
    });
    this.db
      .prepare(`UPDATE automation_schedules SET next_run_at = ?, last_run_at = COALESCE(?, last_run_at), updated_at = ? WHERE id = ?`)
      .run(nextRunAt ?? null, options.markLastRun ? occurrenceDate.toISOString() : null, updatedAt, schedule.id);
  }

  private automationScheduleTargetVersion(kind: AutomationScheduleTargetKind, id: string, targetVersion?: number): number | null {
    if (targetVersion !== undefined && kind !== "workflow_playbook") {
      throw new Error("Pinned schedule target versions are only supported for workflow playbook schedules.");
    }
    if (kind !== "workflow_playbook" || targetVersion === undefined) return null;
    if (!Number.isInteger(targetVersion) || targetVersion < 1) throw new Error("Workflow playbook schedule target version must be a positive integer.");
    this.deps.requireWorkflowRecordingScheduleTarget(id, targetVersion);
    return targetVersion;
  }

  private automationScheduleCreationBlockReason(kind: AutomationScheduleTargetKind, id: string, targetVersion?: number): string | undefined {
    if (kind === "workflow_playbook") {
      const playbook = this.deps.requireWorkflowRecordingScheduleTarget(id, targetVersion);
      return playbook.enabled ? undefined : "Workflow playbook is disabled and cannot be scheduled.";
    }
    if (kind === "workflow_artifact") {
      const artifact = this.deps.getWorkflowArtifact(id);
      return artifact.status === "approved" ? undefined : `Workflow artifact is ${artifact.status} and cannot be scheduled until approved.`;
    }
    if (kind === "workflow_thread") {
      return this.deps.getLatestApprovedWorkflowVersion(id) ? undefined : "Workflow Agent has no approved version to schedule.";
    }
    if (kind === "workflow_version") {
      const version = this.deps.getWorkflowVersion(id);
      if (version.status !== "approved") return `Pinned workflow version is ${version.status} and cannot be scheduled until approved.`;
      const artifact = this.deps.getWorkflowArtifact(version.artifactId);
      return artifact.status === "approved" ? undefined : `Workflow artifact is ${artifact.status} and cannot be scheduled until approved.`;
    }
    return undefined;
  }

  private automationScheduleCreatedTargetVersionId(kind: AutomationScheduleTargetKind, id: string, targetVersion?: number): string | null {
    if (kind === "workflow_playbook") return String(targetVersion ?? this.deps.requireWorkflowRecordingScheduleTarget(id).version);
    if (kind === "workflow_thread") return this.deps.getLatestApprovedWorkflowVersion(id)?.id ?? null;
    if (kind === "workflow_version") return this.deps.getWorkflowVersion(id).id;
    return null;
  }

  private automationScheduleDedicatedThreadId(
    kind: AutomationScheduleTargetKind,
    id: string,
    targetVersion?: number,
    existingThreadId?: string,
  ): string | null {
    if (kind !== "workflow_playbook") return null;
    if (existingThreadId) {
      try {
        this.deps.getThread(existingThreadId);
        return existingThreadId;
      } catch {
        // The schedule is valid, but the old dedicated thread was removed.
      }
    }
    const playbook = this.deps.requireWorkflowRecordingScheduleTarget(id, targetVersion);
    const suffix = targetVersion ? ` v${targetVersion}` : " (current)";
    return this.deps.createThread(`Scheduled: ${playbook.title}${suffix}`, this.deps.getWorkspace().path).id;
  }

  private automationScheduleTargetLabel(kind: AutomationScheduleTargetKind, id: string, targetVersion?: number): string {
    try {
      if (kind === "local_task") {
        const task = this.deps.getOrchestrationTask(id);
        return `${task.identifier}: ${task.title}`;
      }
      if (kind === "workflow_playbook") {
        const playbook = this.deps.requireWorkflowRecordingScheduleTarget(id);
        const versionLabel = targetVersion ? `v${targetVersion} (pinned)` : `current v${playbook.version}`;
        return `${playbook.title} (${versionLabel})`;
      }
      if (kind === "workflow_thread") {
        return `${this.deps.getWorkflowAgentThreadSummary(id).title} (latest approved)`;
      }
      if (kind === "workflow_version") {
        const version = this.deps.getWorkflowVersion(id);
        const thread = this.deps.getWorkflowAgentThreadSummary(version.workflowThreadId);
        return `${thread.title} v${version.version} (pinned)`;
      }
      if (kind === "workflow_artifact") return this.deps.getWorkflowArtifact(id).title;
      return this.requireAutomationFolder(id).name;
    } catch {
      return `Missing ${kind} ${id}`;
    }
  }

  private requireAutomationFolder(folderId: string): AutomationFolderRow {
    const row = this.db.prepare("SELECT * FROM automation_folders WHERE id = ?").get(folderId) as
      | AutomationFolderRow
      | undefined;
    if (!row) throw new Error(`Automation folder not found: ${folderId}`);
    return row;
  }

  private mapAutomationSchedule = (row: AutomationScheduleRow): AutomationScheduleSummary =>
    mapAutomationScheduleRow(row, this.automationScheduleTargetLabel(row.target_kind, row.target_id, row.target_version ?? undefined));

  private mapAutomationScheduleException = mapAutomationScheduleExceptionRow;
}
