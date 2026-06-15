import type { WorkflowGraphNodeReviewAction } from "./workflowGraphNodeReviewUiModel";

export function workflowGraphNodeReviewActionSelectors(action: Pick<WorkflowGraphNodeReviewAction, "targetSection">): string[] {
  const selectorsByTarget: Record<WorkflowGraphNodeReviewAction["targetSection"], string[]> = {
    source: ['[data-workflow-artifact-panel="source"]', '[data-workflow-review-section="source"]', '[data-workflow-review-tile="source"]'],
    audit: ['[data-workflow-artifact-panel="run_console"]', '[data-workflow-review-section="audit"]', '[data-workflow-review-tile="dry_run"]'],
    connectors: ['[data-workflow-artifact-panel="permissions"] [data-workflow-review-section="connectors"]', '[data-workflow-review-section="connectors"]', '[data-workflow-review-tile="connectors"]'],
    mutation_policy: ['[data-workflow-artifact-panel="manifest"] [data-workflow-review-section="mutation_policy"]', '[data-workflow-review-tile="mutation_policy"]'],
  };
  return selectorsByTarget[action.targetSection];
}

export function findWorkflowGraphNodeReviewActionTarget(
  documentRef: Pick<Document, "querySelector">,
  action: Pick<WorkflowGraphNodeReviewAction, "targetSection">,
): Element | null {
  for (const selector of workflowGraphNodeReviewActionSelectors(action)) {
    const target = documentRef.querySelector(selector);
    if (target) return target;
  }
  return null;
}
