import type { WorkflowRunLimitOverrides } from "./workflowTypes";

export type AutomationFolderKind = "home" | "custom";

export type AutomationThreadKind = "orchestration_task" | "workflow_artifact";

export interface AutomationRunSummary {
  id: string;
  status: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  workspacePath?: string;
  threadId?: string;
  attemptNumber?: number;
}

export interface AutomationThreadSummary {
  id: string;
  folderId: string;
  kind: AutomationThreadKind;
  sourceId: string;
  title: string;
  preview: string;
  status: string;
  projectName: string;
  projectPath: string;
  createdAt: string;
  updatedAt: string;
  latestRun?: AutomationRunSummary;
  underlyingThreadId?: string;
  badges: string[];
  needsReview?: boolean;
}

export interface AutomationFolderSummary {
  id: string;
  name: string;
  kind: AutomationFolderKind;
  createdAt: string;
  updatedAt: string;
  threads: AutomationThreadSummary[];
}

export type AutomationScheduleTargetKind = "local_task" | "workflow_playbook" | "workflow_thread" | "workflow_version" | "workflow_artifact" | "folder";

export type AutomationSchedulePresetKind = "manual" | "hourly" | "daily" | "weekdays" | "weekly" | "advanced";

export type AutomationScheduleConcurrencyPolicy = "skip_if_active";

export type AutomationScheduleExceptionKind = "skip" | "reschedule" | "series_update" | "run_limits";

export type AutomationScheduleExceptionStatus = "pending" | "consumed";

export interface AutomationScheduleSummary {
  id: string;
  targetKind: AutomationScheduleTargetKind;
  targetId: string;
  targetVersion?: number;
  targetLabel: string;
  preset: AutomationSchedulePresetKind;
  cronExpression?: string;
  timezone: string;
  enabled: boolean;
  skipIfActive: boolean;
  concurrencyPolicy: AutomationScheduleConcurrencyPolicy;
  nextRunAt?: string;
  lastRunAt?: string;
  runLimits?: WorkflowRunLimitOverrides;
  createdTargetVersionId?: string;
  dedicatedThreadId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAutomationScheduleInput {
  targetKind: AutomationScheduleTargetKind;
  targetId: string;
  targetVersion?: number;
  preset: AutomationSchedulePresetKind;
  cronExpression?: string;
  timezone?: string;
  enabled?: boolean;
  skipIfActive?: boolean;
  runLimits?: WorkflowRunLimitOverrides;
}

export type AutomationScheduleEditScope = "this_occurrence" | "this_and_following" | "all_occurrences";

export interface UpdateAutomationScheduleInput {
  id: string;
  targetKind?: AutomationScheduleTargetKind;
  targetId?: string;
  targetVersion?: number;
  preset?: AutomationSchedulePresetKind;
  cronExpression?: string;
  timezone?: string;
  enabled?: boolean;
  skipIfActive?: boolean;
  runLimits?: WorkflowRunLimitOverrides;
  editScope?: AutomationScheduleEditScope;
  occurrenceAt?: string;
}

export interface AutomationScheduleExceptionSummary {
  id: string;
  scheduleId: string;
  occurrenceAt: string;
  exceptionKind: AutomationScheduleExceptionKind;
  status: AutomationScheduleExceptionStatus;
  replacementRunAt?: string;
  runLimits?: WorkflowRunLimitOverrides;
  reason?: string;
  consumedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationScheduleOccurrenceActionInput {
  scheduleId: string;
  occurrenceAt?: string;
  replacementRunAt?: string;
  runLimits?: WorkflowRunLimitOverrides;
  reason?: string;
}

export interface AutomationScheduleOccurrenceActionResult {
  schedules: AutomationScheduleSummary[];
  exceptions: AutomationScheduleExceptionSummary[];
}

export interface CreateAutomationFolderInput {
  name: string;
}

export interface MoveAutomationThreadInput {
  threadId: string;
  folderId: string;
}
