import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";

import type { WorkflowPersistentStatusTarget } from "./workflowPersistentStatusUiModel";
import type { WorkflowSchedulePanelId } from "./workflowReviewUiModel";
import type { WorkflowRunsPanelId } from "./workflowRunsPanelUiModel";
import {
  workflowArtifactPanelIdForBuildPanel,
  workflowBuildPanelIdForArtifactPanel,
  type WorkflowArtifactPanelId,
  type WorkflowBuildPanelId,
} from "./workflowArtifactPanelUiModel";

export const WORKFLOW_SPLIT_MIN_PERCENT = 36;
export const WORKFLOW_SPLIT_MAX_PERCENT = 76;

export type WorkflowSplitLayoutStyle = CSSProperties & { "--workflow-split-primary": string };

export type WorkflowPanelRoute = {
  artifactPanel?: WorkflowArtifactPanelId;
  buildPanel?: WorkflowBuildPanelId;
  focusSelector: string;
  runsPanel?: WorkflowRunsPanelId;
  schedulePanel?: WorkflowSchedulePanelId;
  selectPane?: "schedules";
};

export function workflowSplitLayoutStyle(splitPercent: number): WorkflowSplitLayoutStyle {
  return { "--workflow-split-primary": `${splitPercent}%` };
}

export function workflowSplitPercentFromClientX(clientX: number, rect: Pick<DOMRect, "left" | "width">): number {
  const rawPercent = ((clientX - rect.left) / rect.width) * 100;
  return Math.max(WORKFLOW_SPLIT_MIN_PERCENT, Math.min(WORKFLOW_SPLIT_MAX_PERCENT, Math.round(rawPercent)));
}

export function WorkflowSplitHandle({
  splitPercent,
  onSplitPercentChange,
}: {
  splitPercent: number;
  onSplitPercentChange: (splitPercent: number) => void;
}) {
  function beginWorkflowSplitResize(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const updateSplit = (clientX: number) => onSplitPercentChange(workflowSplitPercentFromClientX(clientX, rect));
    updateSplit(event.clientX);
    const onMouseMove = (moveEvent: MouseEvent) => updateSplit(moveEvent.clientX);
    const onMouseUp = () => {
      document.body.classList.remove("workflow-split-resizing");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    document.body.classList.add("workflow-split-resizing");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      className="workflow-discovery-resize-handle"
      role="separator"
      aria-label="Resize workflow diagram pane"
      aria-orientation="vertical"
      aria-valuemin={WORKFLOW_SPLIT_MIN_PERCENT}
      aria-valuemax={WORKFLOW_SPLIT_MAX_PERCENT}
      aria-valuenow={splitPercent}
      onMouseDown={beginWorkflowSplitResize}
    >
      <span />
    </div>
  );
}

export function workflowArtifactPanelStateForBuildPanel(
  current: Record<string, WorkflowArtifactPanelId>,
  workflowThreadId: string | undefined,
  panel: WorkflowBuildPanelId,
): Record<string, WorkflowArtifactPanelId> {
  if (!workflowThreadId) return current;
  const artifactPanel = workflowArtifactPanelIdForBuildPanel(panel);
  if (artifactPanel) return { ...current, [workflowThreadId]: artifactPanel };
  const next = { ...current };
  delete next[workflowThreadId];
  return next;
}

export function workflowPanelFocusSelectorForArtifactPanel(panel: WorkflowArtifactPanelId): string {
  if (panel === "diagram") return ".workflow-persistent-diagram-pane";
  if (panel === "run_console") return "#runs-live";
  if (panel === "runtime_input") return "#runs-input";
  if (panel === "outputs") return "#runs-outputs";
  return `#${workflowBuildPanelIdForArtifactPanel(panel)}`;
}

export function workflowPersistentStatusTargetRoute(target: WorkflowPersistentStatusTarget): WorkflowPanelRoute {
  if (target === "discovery") {
    return {
      buildPanel: "build-discovery",
      focusSelector: "#build-discovery, .workflow-discovery-questions",
    };
  }
  if (target === "compile") {
    return {
      buildPanel: "build-overview",
      focusSelector: ".workflow-compile-activity, .workflow-chat-first-panel",
    };
  }
  if (target === "overview") {
    return {
      buildPanel: "build-overview",
      focusSelector: ".workflow-chat-first-panel",
    };
  }
  if (target === "permissions") {
    return {
      buildPanel: "build-permissions",
      focusSelector: "#build-permissions",
    };
  }
  if (target === "versions") {
    return {
      buildPanel: "build-versions",
      focusSelector: "#build-versions",
    };
  }
  if (target === "runs-live") {
    return {
      artifactPanel: "run_console",
      focusSelector: "#runs-live",
      runsPanel: "runs-live",
    };
  }
  if (target === "runs-input") {
    return {
      artifactPanel: "runtime_input",
      focusSelector: "#runs-input",
      runsPanel: "runs-input",
    };
  }
  return {
    focusSelector: `#${target === "schedules-grants" ? "schedules-grants" : "schedules-overview"}`,
    schedulePanel: target === "schedules-grants" ? "schedules-grants" : "schedules-overview",
    selectPane: "schedules",
  };
}

export function focusWorkflowPanelSelector(selector: string) {
  window.setTimeout(() => {
    const element = document.querySelector(selector);
    if (!element) return;
    element.scrollIntoView({ block: "start", behavior: "smooth" });
    if (element instanceof HTMLElement) {
      element.tabIndex = -1;
      element.focus({ preventScroll: true });
    }
  }, 0);
}
