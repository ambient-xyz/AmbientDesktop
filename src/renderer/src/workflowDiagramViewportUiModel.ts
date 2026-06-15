export interface WorkflowDiagramAutoFitInput {
  snapshotId: string;
  lastAutoFitSnapshotId?: string;
  userAdjustedViewport: boolean;
}

export function workflowDiagramShouldAutoFit(input: WorkflowDiagramAutoFitInput): boolean {
  return input.snapshotId !== input.lastAutoFitSnapshotId && !input.userAdjustedViewport;
}

export function workflowDiagramShouldFollowActiveNode(input: { followExecution: boolean; activeNodeId?: string }): boolean {
  return Boolean(input.followExecution && input.activeNodeId);
}

export function workflowDiagramFollowToggle(input: { followExecution: boolean; activeNodeId?: string }): {
  nextFollowExecution: boolean;
  shouldCenterActiveNode: boolean;
} {
  if (input.followExecution) return { nextFollowExecution: false, shouldCenterActiveNode: false };
  return {
    nextFollowExecution: Boolean(input.activeNodeId),
    shouldCenterActiveNode: Boolean(input.activeNodeId),
  };
}
