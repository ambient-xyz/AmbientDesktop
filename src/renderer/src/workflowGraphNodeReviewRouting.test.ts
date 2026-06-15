import { describe, expect, it } from "vitest";
import { findWorkflowGraphNodeReviewActionTarget, workflowGraphNodeReviewActionSelectors } from "./workflowGraphNodeReviewRouting";
import type { WorkflowGraphNodeReviewAction } from "./workflowGraphNodeReviewUiModel";

describe("workflowGraphNodeReviewRouting", () => {
  it("prefers right artifact panels before legacy review sections and summary tiles", () => {
    expect(selectors("source")).toEqual(['[data-workflow-artifact-panel="source"]', '[data-workflow-review-section="source"]', '[data-workflow-review-tile="source"]']);
    expect(selectors("audit")).toEqual(['[data-workflow-artifact-panel="run_console"]', '[data-workflow-review-section="audit"]', '[data-workflow-review-tile="dry_run"]']);
    expect(selectors("connectors")).toEqual([
      '[data-workflow-artifact-panel="permissions"] [data-workflow-review-section="connectors"]',
      '[data-workflow-review-section="connectors"]',
      '[data-workflow-review-tile="connectors"]',
    ]);
    expect(selectors("mutation_policy")).toEqual(['[data-workflow-artifact-panel="manifest"] [data-workflow-review-section="mutation_policy"]', '[data-workflow-review-tile="mutation_policy"]']);
  });

  it("returns the first matching review target", () => {
    const sourceTile = { id: "source-tile" } as Element;
    const queries: string[] = [];
    const documentRef = {
      querySelector(selector: string) {
        queries.push(selector);
        return selector === '[data-workflow-review-tile="source"]' ? sourceTile : null;
      },
    };

    expect(findWorkflowGraphNodeReviewActionTarget(documentRef, action("source"))).toBe(sourceTile);
    expect(queries).toEqual(['[data-workflow-artifact-panel="source"]', '[data-workflow-review-section="source"]', '[data-workflow-review-tile="source"]']);
  });
});

function selectors(targetSection: WorkflowGraphNodeReviewAction["targetSection"]): string[] {
  return workflowGraphNodeReviewActionSelectors(action(targetSection));
}

function action(targetSection: WorkflowGraphNodeReviewAction["targetSection"]): Pick<WorkflowGraphNodeReviewAction, "targetSection"> {
  return { targetSection };
}
