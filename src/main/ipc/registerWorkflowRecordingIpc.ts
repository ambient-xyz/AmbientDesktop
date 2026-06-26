import type { IpcMain } from "electron";
import { z } from "zod";

import { isAmbientSubagentsEnabled, type AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import {
  missingRequiredSymphonyMetricTemplateLabels,
  requiredSymphonyMetricTemplateErrorMessage,
  SYMPHONY_WORKFLOW_PATTERN_IDS,
} from "../../shared/symphonyWorkflowRecipes";
import type { ApplyWorkflowRecordingSummaryInput, DesktopState } from "../../shared/desktopTypes";
import type {
  AdoptWorkflowLabVariantInput,
  ArchiveWorkflowRecordingInput,
  ConfirmWorkflowRecordingInput,
  CreateWorkflowLabRunInput,
  DescribeWorkflowRecordingInput,
  GetWorkflowLabRunInput,
  ListWorkflowLabRunsInput,
  RequestWorkflowRecordingReviewInput,
  RestoreWorkflowRecordingVersionInput,
  SaveSymphonyWorkflowRecipeInput,
  SearchWorkflowRecordingsInput,
  SetWorkflowRecordingEnabledInput,
  StartWorkflowLabRunInput,
  StartWorkflowRecordingInput,
  StopWorkflowLabRunInput,
  StopWorkflowRecordingInput,
  UnarchiveWorkflowRecordingInput,
  UpdateWorkflowRecordingPlaybookInput,
  UpdateWorkflowRecordingReviewInput,
  WorkflowDashboard,
  WorkflowLabRun,
  WorkflowRecordingLibraryDescription,
  WorkflowRecordingLibraryEntry,
  WorkflowRecordingReviewDraftUpdate,
  WorkflowRunDetail,
  WorkflowRunDetailInput,
} from "../../shared/workflowTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const workflowRecorderIpcChannels = [
  "workflow-recorder:start",
  "workflow-recorder:stop",
  "workflow-recorder:request-review",
  "workflow-recorder:update-review",
  "workflow-recorder:confirm",
  "workflow-recorder:apply-summary",
  "workflow-recorder:search",
  "workflow-recorder:describe",
  "workflow-recorder:set-enabled",
  "workflow-recorder:update-playbook",
  "workflow-recorder:save-symphony-recipe",
  "workflow-recorder:archive",
  "workflow-recorder:unarchive",
  "workflow-recorder:restore-version",
] as const;

export const workflowLabIpcChannels = [
  "workflow-lab:create-run",
  "workflow-lab:list-runs",
  "workflow-lab:get-run",
  "workflow-lab:start-run",
  "workflow-lab:stop-run",
  "workflow-lab:adopt-variant",
] as const;

export const workflowDashboardIpcChannels = ["workflow:list-dashboard", "workflow:run-detail", "workflow:create-sample"] as const;

interface WorkflowRecorderThread {
  id: string;
  workspacePath: string;
  gitWorktree?: unknown;
}

interface WorkflowRecorderWorkspace {
  path: string;
}

interface WorkflowRecorderStore<Thread extends WorkflowRecorderThread> {
  getWorkspace(): WorkflowRecorderWorkspace;
  createWorkflowRecordingThread(input: { goal?: string; workspacePath: string }): Thread;
  stopWorkflowRecording(threadId: string): void;
  updateWorkflowRecordingReviewDraft(threadId: string, draft: WorkflowRecordingReviewDraftUpdate): void;
  confirmWorkflowRecordingReview(threadId: string): void;
  applyWorkflowRecordingSummary(threadId: string, messageId?: string): void;
  describeWorkflowRecording(id: string, options: { includeArchived?: boolean }): WorkflowRecordingLibraryDescription;
  setWorkflowRecordingEnabled(id: string, enabled: boolean): void;
  updateWorkflowRecordingPlaybook(
    id: string,
    input: {
      baseVersion: number;
      draft: WorkflowRecordingReviewDraftUpdate;
      title?: string;
    },
  ): void;
  saveSymphonyWorkflowRecipe(
    input: SaveSymphonyWorkflowRecipeInput,
    options: { featureFlagSnapshot: AmbientFeatureFlagSnapshot },
  ): WorkflowRecordingLibraryDescription;
  archiveWorkflowRecording(
    id: string,
    input: {
      baseVersion: number;
      reason?: string;
    },
  ): void;
  unarchiveWorkflowRecording(id: string, input: { baseVersion: number }): void;
  restoreWorkflowRecordingVersion(id: string, version: number): void;
}

interface WorkflowRecorderRuntime {
  requestWorkflowRecordingReview(input: RequestWorkflowRecordingReviewInput): MaybePromise<void>;
}

interface WorkflowRecorderHost<Thread extends WorkflowRecorderThread, Store extends WorkflowRecorderStore<Thread>> {
  activeThreadId: string;
  runtime: WorkflowRecorderRuntime;
  store: Store;
}

interface WorkflowLabStore {
  createWorkflowLabRun(input: CreateWorkflowLabRunInput): WorkflowLabRun;
  listWorkflowLabRuns(input: ListWorkflowLabRunsInput): WorkflowLabRun[];
  getWorkflowLabRun(runId: string): WorkflowLabRun;
  updateWorkflowLabRunStatus(runId: string, status: "stopped"): WorkflowLabRun;
  adoptWorkflowLabVariant(runId: string, variantId: string): WorkflowRecordingLibraryDescription;
}

interface WorkflowLabHost<Store extends WorkflowLabStore> {
  activeThreadId: string;
  store: Store;
}

interface WorkflowDashboardWorkspace {
  path: string;
}

interface WorkflowDashboardStore {
  getWorkspace(): WorkflowDashboardWorkspace;
}

interface WorkflowDashboardHost<Store extends WorkflowDashboardStore> {
  store: Store;
  workspacePath: string;
}

export interface RegisterWorkflowRecorderIpcDependencies<
  Thread extends WorkflowRecorderThread,
  Store extends WorkflowRecorderStore<Thread>,
  Host extends WorkflowRecorderHost<Thread, Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  requireProjectRuntimeHostForThreadAction(input: { threadId: string; projectId?: string }, activeHostSnapshot: Host): Host;
  requireProjectRuntimeHostForWorkflowRecording(workflowRecordingId: string): Host;
  prepareWorktreeForThread(thread: Thread, targetStore: Store): MaybePromise<Thread>;
  setProjectHostActiveThreadId(host: Host, threadId: string): void;
  emitProjectStateIfActive(host: Host, threadId?: string): void;
  emitWorkflowRecordingLibraryStateChanged(host: Host, threadId?: string): void;
  readStateForProjectHostAction(host: Host, threadId?: string): DesktopState;
  listGlobalWorkflowRecordingLibrary(input?: SearchWorkflowRecordingsInput): WorkflowRecordingLibraryEntry[];
  getFeatureFlagSnapshot(store: Store): AmbientFeatureFlagSnapshot;
}

export interface RegisterWorkflowLabIpcDependencies<Store extends WorkflowLabStore, Host extends WorkflowLabHost<Store>> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  requireProjectRuntimeHostForWorkflowRecording(workflowRecordingId: string): Host;
  requireProjectRuntimeHostForWorkflowLabRun(runId: string): Host;
  emitProjectStateIfActive(host: Host, threadId?: string): void;
  emitWorkflowRecordingLibraryStateChanged(host: Host, threadId?: string): void;
  readStateForProjectHostAction(host: Host, threadId?: string): DesktopState;
  startWorkflowLabRun(host: Host, input: StartWorkflowLabRunInput): MaybePromise<WorkflowLabRun>;
}

export interface RegisterWorkflowDashboardIpcDependencies<Store extends WorkflowDashboardStore, Host extends WorkflowDashboardHost<Store>> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  requireProjectRuntimeHostForWorkflowRun(runId: string): Host;
  readWorkflowDashboard(store: Store): WorkflowDashboard;
  readWorkflowRunDetail(store: Store, runId: string): WorkflowRunDetail;
  createWorkflowSampleArtifact(store: Store, workspacePath: string): WorkflowDashboard;
  emitWorkflowUpdated(workspacePath: string): void;
}

const workflowRecorderThreadActionSchema = z.object({
  threadId: z.string().min(1),
  projectId: z.string().min(1).max(128).optional(),
});
const startWorkflowRecordingSchema = z.object({
  goal: z.string().trim().max(4000).optional(),
  workspacePath: z.string().min(1).max(4096).optional(),
});
const stopWorkflowRecordingSchema = workflowRecorderThreadActionSchema;
const requestWorkflowRecordingReviewSchema = workflowRecorderThreadActionSchema.extend({
  feedback: z.string().trim().max(4000).optional(),
});
const confirmWorkflowRecordingSchema = workflowRecorderThreadActionSchema;
const workflowRecordingToolExampleSchema = z.object({
  toolName: z.string().trim().min(1).max(120),
  inputPreview: z.string().trim().max(1000).optional(),
  resultPreview: z.string().trim().max(1000).optional(),
  artifactPath: z.string().trim().max(500).optional(),
});
const workflowRecordingAvoidPatternSchema = z.object({
  toolName: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["failed", "skipped", "permission_blocked"]),
  reason: z.string().trim().min(1).max(1000),
});
const updateWorkflowRecordingReviewSchema = workflowRecorderThreadActionSchema.extend({
  draft: z.object({
    intent: z.string().trim().min(1).max(1000),
    inputs: z.array(z.string().trim().min(1).max(1000)).max(12),
    successfulExamples: z.array(workflowRecordingToolExampleSchema).max(12),
    doNot: z.array(workflowRecordingAvoidPatternSchema).max(12),
    validation: z.array(z.string().trim().min(1).max(1000)).max(12),
    outputShape: z.array(z.string().trim().min(1).max(1000)).max(12),
  }),
});
const applyWorkflowRecordingSummarySchema = workflowRecorderThreadActionSchema.extend({
  messageId: z.string().min(1).optional(),
});
const searchWorkflowRecordingsSchema = z
  .object({
    query: z.string().trim().max(1000).optional(),
    includeDisabled: z.boolean().optional(),
    includeArchived: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .optional();
const describeWorkflowRecordingSchema = z.object({
  id: z.string().trim().min(1).max(200),
  includeArchived: z.boolean().optional(),
});
const setWorkflowRecordingEnabledSchema = z.object({
  id: z.string().trim().min(1).max(200),
  enabled: z.boolean(),
});
const updateWorkflowRecordingPlaybookSchema = z.object({
  id: z.string().trim().min(1).max(200),
  baseVersion: z.number().int().min(1),
  title: z.string().trim().min(1).max(1000).optional(),
  draft: updateWorkflowRecordingReviewSchema.shape.draft,
});
const saveSymphonyWorkflowRecipeSchema = workflowRecorderThreadActionSchema
  .extend({
    patternId: z.enum(SYMPHONY_WORKFLOW_PATTERN_IDS),
    goal: z.string().trim().min(1).max(4000),
    blocking: z.boolean().optional(),
    stepAnswers: z
      .record(
        z.string().trim().min(1).max(160),
        z.object({
          choiceId: z.string().trim().min(1).max(160).optional(),
          customText: z.string().trim().min(1).max(4000).optional(),
        }),
      )
      .optional(),
    metricCustomizations: z.record(z.string().trim().min(1).max(160), z.string().trim().min(1).max(4000)).optional(),
  })
  .superRefine((input, ctx) => {
    const missingLabels = missingRequiredSymphonyMetricTemplateLabels({
      patternId: input.patternId,
      metricCustomizations: input.metricCustomizations,
    });
    const message = requiredSymphonyMetricTemplateErrorMessage({
      missingLabels,
      actionLabel: "saving the Symphony recipe",
    });
    if (!message) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["metricCustomizations"],
      message,
    });
  }) satisfies z.ZodType<SaveSymphonyWorkflowRecipeInput>;
const archiveWorkflowRecordingSchema = z.object({
  id: z.string().trim().min(1).max(200),
  baseVersion: z.number().int().min(1),
  reason: z.string().trim().max(1000).optional(),
});
const unarchiveWorkflowRecordingSchema = z.object({
  id: z.string().trim().min(1).max(200),
  baseVersion: z.number().int().min(1),
});
const restoreWorkflowRecordingVersionSchema = z.object({
  id: z.string().trim().min(1).max(200),
  version: z.number().int().min(1),
});
const workflowLabMetricEmphasisSchema = z.enum(["reliability", "speed", "recovery", "clarity", "balanced"]);
const createWorkflowLabRunSchema = z.object({
  workflowId: z.string().trim().min(1).max(200),
  goal: z.string().trim().min(1).max(1000),
  metricEmphasis: workflowLabMetricEmphasisSchema.optional(),
  attemptBudget: z.number().int().min(1).max(10).optional(),
  plateauThreshold: z.number().min(0).max(1).optional(),
  heldOutEnabled: z.boolean().optional(),
});
const listWorkflowLabRunsSchema = z
  .object({
    workflowId: z.string().trim().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .optional();
const workflowLabRunIdSchema = z.object({
  runId: z.string().trim().min(1).max(200),
});
const adoptWorkflowLabVariantSchema = workflowLabRunIdSchema.extend({
  variantId: z.string().trim().min(1).max(240),
});
const workflowRunDetailSchema = z.object({
  runId: z.string().min(1),
});
export function registerWorkflowRecorderIpc<
  Thread extends WorkflowRecorderThread,
  Store extends WorkflowRecorderStore<Thread>,
  Host extends WorkflowRecorderHost<Thread, Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForThreadAction,
  requireProjectRuntimeHostForWorkflowRecording,
  prepareWorktreeForThread,
  setProjectHostActiveThreadId,
  emitProjectStateIfActive,
  emitWorkflowRecordingLibraryStateChanged,
  readStateForProjectHostAction,
  listGlobalWorkflowRecordingLibrary,
  getFeatureFlagSnapshot,
}: RegisterWorkflowRecorderIpcDependencies<Thread, Store, Host>): void {
  handleIpc("workflow-recorder:start", async (_event, raw: StartWorkflowRecordingInput) => {
    const input = startWorkflowRecordingSchema.parse(raw);
    const host = requireActiveProjectRuntimeHost();
    const targetStore = host.store;
    let thread = targetStore.createWorkflowRecordingThread({
      goal: input.goal,
      workspacePath: input.workspacePath ?? targetStore.getWorkspace().path,
    });
    if (!thread.gitWorktree && thread.workspacePath === targetStore.getWorkspace().path) {
      thread = await prepareWorktreeForThread(thread, targetStore);
    }
    setProjectHostActiveThreadId(host, thread.id);
    emitProjectStateIfActive(host, thread.id);
    return readStateForProjectHostAction(host, thread.id);
  });

  handleIpc("workflow-recorder:stop", (_event, raw: StopWorkflowRecordingInput) => {
    const input = stopWorkflowRecordingSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    host.store.stopWorkflowRecording(input.threadId);
    emitProjectStateIfActive(host, input.threadId);
    return readStateForProjectHostAction(host, input.threadId);
  });

  handleIpc("workflow-recorder:request-review", async (_event, raw: RequestWorkflowRecordingReviewInput) => {
    const input = requestWorkflowRecordingReviewSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    await host.runtime.requestWorkflowRecordingReview({ threadId: input.threadId, feedback: input.feedback });
  });

  handleIpc("workflow-recorder:update-review", (_event, raw: UpdateWorkflowRecordingReviewInput) => {
    const input = updateWorkflowRecordingReviewSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    host.store.updateWorkflowRecordingReviewDraft(input.threadId, input.draft);
    emitProjectStateIfActive(host, input.threadId);
    return readStateForProjectHostAction(host, input.threadId);
  });

  handleIpc("workflow-recorder:confirm", (_event, raw: ConfirmWorkflowRecordingInput) => {
    const input = confirmWorkflowRecordingSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    host.store.confirmWorkflowRecordingReview(input.threadId);
    emitProjectStateIfActive(host, input.threadId);
    return readStateForProjectHostAction(host, input.threadId);
  });

  handleIpc("workflow-recorder:apply-summary", (_event, raw: ApplyWorkflowRecordingSummaryInput) => {
    const input = applyWorkflowRecordingSummarySchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    host.store.applyWorkflowRecordingSummary(input.threadId, input.messageId);
    emitProjectStateIfActive(host, input.threadId);
    return readStateForProjectHostAction(host, input.threadId);
  });

  handleIpc("workflow-recorder:search", (_event, raw?: SearchWorkflowRecordingsInput) => {
    const input = searchWorkflowRecordingsSchema.parse(raw) ?? {};
    return listGlobalWorkflowRecordingLibrary(input);
  });

  handleIpc("workflow-recorder:describe", (_event, raw: DescribeWorkflowRecordingInput) => {
    const input = describeWorkflowRecordingSchema.parse(raw);
    return requireProjectRuntimeHostForWorkflowRecording(input.id).store.describeWorkflowRecording(input.id, {
      includeArchived: input.includeArchived,
    });
  });

  handleIpc("workflow-recorder:set-enabled", (_event, raw: SetWorkflowRecordingEnabledInput) => {
    const input = setWorkflowRecordingEnabledSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRecording(input.id);
    host.store.setWorkflowRecordingEnabled(input.id, input.enabled);
    emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
    return readStateForProjectHostAction(host, host.activeThreadId);
  });

  handleIpc("workflow-recorder:update-playbook", (_event, raw: UpdateWorkflowRecordingPlaybookInput) => {
    const input = updateWorkflowRecordingPlaybookSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRecording(input.id);
    host.store.updateWorkflowRecordingPlaybook(input.id, {
      baseVersion: input.baseVersion,
      draft: input.draft,
      ...(input.title ? { title: input.title } : {}),
    });
    emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
    return readStateForProjectHostAction(host, host.activeThreadId);
  });

  handleIpc("workflow-recorder:save-symphony-recipe", (_event, raw: SaveSymphonyWorkflowRecipeInput) => {
    const input = saveSymphonyWorkflowRecipeSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    const featureFlagSnapshot = getFeatureFlagSnapshot(host.store);
    if (!isAmbientSubagentsEnabled(featureFlagSnapshot)) {
      throw new Error("Symphony workflow recipes are disabled while ambient.subagents is off.");
    }
    host.store.saveSymphonyWorkflowRecipe(input, { featureFlagSnapshot });
    emitWorkflowRecordingLibraryStateChanged(host, input.threadId);
    return readStateForProjectHostAction(host, input.threadId);
  });

  handleIpc("workflow-recorder:archive", (_event, raw: ArchiveWorkflowRecordingInput) => {
    const input = archiveWorkflowRecordingSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRecording(input.id);
    host.store.archiveWorkflowRecording(input.id, {
      baseVersion: input.baseVersion,
      ...(input.reason ? { reason: input.reason } : {}),
    });
    emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
    return readStateForProjectHostAction(host, host.activeThreadId);
  });

  handleIpc("workflow-recorder:unarchive", (_event, raw: UnarchiveWorkflowRecordingInput) => {
    const input = unarchiveWorkflowRecordingSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRecording(input.id);
    host.store.unarchiveWorkflowRecording(input.id, { baseVersion: input.baseVersion });
    emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
    return readStateForProjectHostAction(host, host.activeThreadId);
  });

  handleIpc("workflow-recorder:restore-version", (_event, raw: RestoreWorkflowRecordingVersionInput) => {
    const input = restoreWorkflowRecordingVersionSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRecording(input.id);
    host.store.restoreWorkflowRecordingVersion(input.id, input.version);
    emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
    return readStateForProjectHostAction(host, host.activeThreadId);
  });
}

export function registerWorkflowLabIpc<Store extends WorkflowLabStore, Host extends WorkflowLabHost<Store>>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForWorkflowRecording,
  requireProjectRuntimeHostForWorkflowLabRun,
  emitProjectStateIfActive,
  emitWorkflowRecordingLibraryStateChanged,
  readStateForProjectHostAction,
  startWorkflowLabRun,
}: RegisterWorkflowLabIpcDependencies<Store, Host>): void {
  handleIpc("workflow-lab:create-run", (_event, raw: CreateWorkflowLabRunInput) => {
    const input = createWorkflowLabRunSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRecording(input.workflowId);
    return host.store.createWorkflowLabRun(input);
  });

  handleIpc("workflow-lab:list-runs", (_event, raw?: ListWorkflowLabRunsInput) => {
    const input = listWorkflowLabRunsSchema.parse(raw) ?? {};
    if (input.workflowId) {
      return requireProjectRuntimeHostForWorkflowRecording(input.workflowId).store.listWorkflowLabRuns(input);
    }
    return requireActiveProjectRuntimeHost().store.listWorkflowLabRuns(input);
  });

  handleIpc("workflow-lab:get-run", (_event, raw: GetWorkflowLabRunInput) => {
    const input = workflowLabRunIdSchema.parse(raw);
    return requireProjectRuntimeHostForWorkflowLabRun(input.runId).store.getWorkflowLabRun(input.runId);
  });

  handleIpc("workflow-lab:start-run", async (_event, raw: StartWorkflowLabRunInput) => {
    const input = workflowLabRunIdSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowLabRun(input.runId);
    const run = await startWorkflowLabRun(host, input);
    emitProjectStateIfActive(host, host.activeThreadId);
    return run;
  });

  handleIpc("workflow-lab:stop-run", (_event, raw: StopWorkflowLabRunInput) => {
    const input = workflowLabRunIdSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowLabRun(input.runId);
    return host.store.updateWorkflowLabRunStatus(input.runId, "stopped");
  });

  handleIpc("workflow-lab:adopt-variant", (_event, raw: AdoptWorkflowLabVariantInput) => {
    const input = adoptWorkflowLabVariantSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowLabRun(input.runId);
    host.store.adoptWorkflowLabVariant(input.runId, input.variantId);
    emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
    return readStateForProjectHostAction(host, host.activeThreadId);
  });
}

export function registerWorkflowDashboardIpc<Store extends WorkflowDashboardStore, Host extends WorkflowDashboardHost<Store>>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForWorkflowRun,
  readWorkflowDashboard,
  readWorkflowRunDetail,
  createWorkflowSampleArtifact,
  emitWorkflowUpdated,
}: RegisterWorkflowDashboardIpcDependencies<Store, Host>): void {
  handleIpc("workflow:list-dashboard", () => readWorkflowDashboard(requireActiveProjectRuntimeHost().store));

  handleIpc("workflow:run-detail", (_event, raw: WorkflowRunDetailInput) => {
    const input = workflowRunDetailSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRun(input.runId);
    return readWorkflowRunDetail(host.store, input.runId);
  });

  handleIpc("workflow:create-sample", () => {
    const host = requireActiveProjectRuntimeHost();
    const workspacePath = host.store.getWorkspace().path;
    const dashboard = createWorkflowSampleArtifact(host.store, workspacePath);
    emitWorkflowUpdated(host.workspacePath);
    return dashboard;
  });
}
