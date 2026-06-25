import { randomUUID } from "node:crypto";
import type {
  CreateWorkflowLabRunInput,
  ListWorkflowLabRunsInput,
  WorkflowLabCandidatePatch,
  WorkflowLabEvaluationResult,
  WorkflowLabRun,
  WorkflowLabRunStatus,
  WorkflowLabVariant,
  WorkflowLabVariantStatus,
  WorkflowRecordingLibraryDescription,
  WorkflowRecordingReviewDraftUpdate,
} from "../../shared/workflowTypes";
import {
  workflowLabApplyRunStatus,
  workflowLabApplyVariantAdoption,
  workflowLabAppendVariant,
  workflowLabCreateRun,
  workflowLabListRuns,
  workflowLabReadRun,
  workflowLabRecordEvaluation,
  workflowLabRequireAcceptedVariant,
  workflowLabRequireBaseVersion,
  workflowLabRunArtifactPath,
  workflowLabWriteRun,
} from "./projectStoreWorkflowFacade";

export interface ProjectStoreWorkflowLabRepositoryDeps {
  workspacePath(): string;
  describeWorkflowRecording(id: string): WorkflowRecordingLibraryDescription;
  updateWorkflowRecordingPlaybook(
    id: string,
    input: {
      baseVersion: number;
      draft: WorkflowRecordingReviewDraftUpdate;
      title?: string;
    },
  ): WorkflowRecordingLibraryDescription;
}

export class ProjectStoreWorkflowLabRepository {
  constructor(private readonly deps: ProjectStoreWorkflowLabRepositoryDeps) {}

  listWorkflowLabRuns(input: ListWorkflowLabRunsInput = {}): WorkflowLabRun[] {
    return workflowLabListRuns(this.deps.workspacePath(), input);
  }

  getWorkflowLabRun(runId: string): WorkflowLabRun {
    const run = workflowLabReadRun(workflowLabRunArtifactPath(this.deps.workspacePath(), runId));
    if (!run) throw new Error(`Workflow Lab run not found: ${runId}`);
    return run;
  }

  createWorkflowLabRun(input: CreateWorkflowLabRunInput): WorkflowLabRun {
    const workflow = this.deps.describeWorkflowRecording(input.workflowId);
    const run = workflowLabCreateRun({
      workspacePath: this.deps.workspacePath(),
      workflow,
      request: input,
      runId: `workflow_lab_${randomUUID()}`,
      createdAt: new Date().toISOString(),
    });
    return this.saveWorkflowLabRun(run);
  }

  saveWorkflowLabRun(run: WorkflowLabRun): WorkflowLabRun {
    return workflowLabWriteRun(this.deps.workspacePath(), run);
  }

  updateWorkflowLabRunStatus(runId: string, status: WorkflowLabRunStatus, error?: string): WorkflowLabRun {
    const run = this.getWorkflowLabRun(runId);
    const now = new Date().toISOString();
    return this.saveWorkflowLabRun(workflowLabApplyRunStatus(run, status, { updatedAt: now, error }));
  }

  appendWorkflowLabVariant(
    runId: string,
    input: {
      parentVariantId?: string;
      hypothesis: string;
      patch: WorkflowLabCandidatePatch;
      status?: WorkflowLabVariantStatus;
    },
  ): WorkflowLabVariant {
    const run = this.getWorkflowLabRun(runId);
    const now = new Date().toISOString();
    const appended = workflowLabAppendVariant({
      run,
      variantId: `workflow_lab_variant_${randomUUID()}`,
      createdAt: now,
      ...input,
    });
    this.saveWorkflowLabRun(appended.run);
    return appended.variant;
  }

  recordWorkflowLabEvaluation(
    runId: string,
    variantId: string,
    evaluation: WorkflowLabEvaluationResult,
    status: WorkflowLabVariantStatus,
  ): WorkflowLabRun {
    const run = this.getWorkflowLabRun(runId);
    const now = new Date().toISOString();
    return this.saveWorkflowLabRun(workflowLabRecordEvaluation({ run, variantId, evaluation, status, evaluatedAt: now }));
  }

  adoptWorkflowLabVariant(runId: string, variantId: string): WorkflowRecordingLibraryDescription {
    const run = this.getWorkflowLabRun(runId);
    const variant = workflowLabRequireAcceptedVariant(run, variantId);
    const current = this.deps.describeWorkflowRecording(run.workflowId);
    workflowLabRequireBaseVersion(run, current.version);
    const updated = this.deps.updateWorkflowRecordingPlaybook(run.workflowId, {
      baseVersion: run.baseVersion,
      ...(variant.patch.title ? { title: variant.patch.title } : {}),
      draft: variant.patch.draft,
    });
    const now = new Date().toISOString();
    this.saveWorkflowLabRun(workflowLabApplyVariantAdoption({ run, variant, adoptedVersion: updated.version, adoptedAt: now }));
    return updated;
  }
}
