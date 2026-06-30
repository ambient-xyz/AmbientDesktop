import type {
  WorkflowLabCandidatePatch,
  WorkflowLabEvaluationResult,
  WorkflowLabRun,
  WorkflowLabRunStatus,
  WorkflowLabVariant,
  WorkflowLabVariantStatus,
  WorkflowRecordingLibraryDescription,
} from "../../shared/workflowTypes";

export interface WorkflowLabProjectStore {
  updateWorkflowLabRunStatus(runId: string, status: WorkflowLabRunStatus, error?: string): WorkflowLabRun;
  describeWorkflowRecording(id: string): WorkflowRecordingLibraryDescription;
  getWorkflowLabRun(runId: string): WorkflowLabRun;
  appendWorkflowLabVariant(
    runId: string,
    input: {
      parentVariantId?: string;
      hypothesis: string;
      patch: WorkflowLabCandidatePatch;
      status?: WorkflowLabVariantStatus;
    },
  ): WorkflowLabVariant;
  recordWorkflowLabEvaluation(
    runId: string,
    variantId: string,
    evaluation: WorkflowLabEvaluationResult,
    status: WorkflowLabVariantStatus,
  ): WorkflowLabRun;
  saveWorkflowLabRun(run: WorkflowLabRun): WorkflowLabRun;
}
