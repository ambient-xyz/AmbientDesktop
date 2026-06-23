import type { WorkflowApprovalRequest, WorkflowUserInputRequest } from "./workflowAgentRuntime";

export class WorkflowPausedError extends Error {
  constructor(readonly approval: WorkflowApprovalRequest) {
    super(`Workflow paused for approval: ${approval.id}`);
    this.name = "WorkflowPausedError";
  }
}

export class WorkflowInputPausedError extends Error {
  constructor(readonly input: WorkflowUserInputRequest) {
    super(`Workflow paused for user input: ${input.id}`);
    this.name = "WorkflowInputPausedError";
  }
}

export class WorkflowManualPausedError extends Error {
  constructor(readonly reason = "Workflow paused by user.") {
    super(reason);
    this.name = "WorkflowManualPausedError";
  }
}

export function isWorkflowPausedError(error: unknown): error is WorkflowPausedError | WorkflowInputPausedError | WorkflowManualPausedError {
  return error instanceof WorkflowPausedError || error instanceof WorkflowInputPausedError || error instanceof WorkflowManualPausedError;
}
