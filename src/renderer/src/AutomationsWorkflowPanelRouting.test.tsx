import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  WORKFLOW_SPLIT_MAX_PERCENT,
  WORKFLOW_SPLIT_MIN_PERCENT,
  WorkflowSplitHandle,
  workflowArtifactPanelStateForBuildPanel,
  workflowPanelFocusSelectorForArtifactPanel,
  workflowPersistentStatusTargetRoute,
  workflowSplitLayoutStyle,
  workflowSplitPercentFromClientX,
} from "./AutomationsWorkflowPanelRouting";

describe("AutomationsWorkflowPanelRouting", () => {
  it("models workflow split layout and handle bounds", () => {
    expect(workflowSplitLayoutStyle(58)).toEqual({ "--workflow-split-primary": "58%" });
    expect(workflowSplitPercentFromClientX(68, { left: 20, width: 100 } as DOMRect)).toBe(48);
    expect(workflowSplitPercentFromClientX(-100, { left: 20, width: 100 } as DOMRect)).toBe(WORKFLOW_SPLIT_MIN_PERCENT);
    expect(workflowSplitPercentFromClientX(1000, { left: 20, width: 100 } as DOMRect)).toBe(WORKFLOW_SPLIT_MAX_PERCENT);

    const markup = renderToStaticMarkup(<WorkflowSplitHandle splitPercent={58} onSplitPercentChange={vi.fn()} />);

    expect(markup).toContain("workflow-discovery-resize-handle");
    expect(markup).toContain('role="separator"');
    expect(markup).toContain('aria-valuemin="36"');
    expect(markup).toContain('aria-valuemax="76"');
    expect(markup).toContain('aria-valuenow="58"');
  });

  it("updates artifact panel state when build tabs route to artifact panels", () => {
    const current = {
      "thread-1": "source",
      "thread-2": "manifest",
    } as const;

    expect(workflowArtifactPanelStateForBuildPanel(current, "thread-1", "build-permissions")).toEqual({
      "thread-1": "permissions",
      "thread-2": "manifest",
    });
    expect(workflowArtifactPanelStateForBuildPanel(current, "thread-1", "build-overview")).toEqual({
      "thread-2": "manifest",
    });
    expect(workflowArtifactPanelStateForBuildPanel(current, undefined, "build-source")).toBe(current);
  });

  it("keeps transcript panel focus selectors stable", () => {
    expect(workflowPanelFocusSelectorForArtifactPanel("diagram")).toBe(".workflow-persistent-diagram-pane");
    expect(workflowPanelFocusSelectorForArtifactPanel("run_console")).toBe("#runs-live");
    expect(workflowPanelFocusSelectorForArtifactPanel("runtime_input")).toBe("#runs-input");
    expect(workflowPanelFocusSelectorForArtifactPanel("outputs")).toBe("#runs-outputs");
    expect(workflowPanelFocusSelectorForArtifactPanel("source")).toBe("#build-source");
  });

  it("routes persistent status actions to the same panels and focus targets", () => {
    expect(workflowPersistentStatusTargetRoute("discovery")).toMatchObject({
      buildPanel: "build-discovery",
      focusSelector: "#build-discovery, .workflow-discovery-questions",
    });
    expect(workflowPersistentStatusTargetRoute("compile")).toMatchObject({
      buildPanel: "build-overview",
      focusSelector: ".workflow-compile-activity, .workflow-chat-first-panel",
    });
    expect(workflowPersistentStatusTargetRoute("overview")).toMatchObject({
      buildPanel: "build-overview",
      focusSelector: ".workflow-chat-first-panel",
    });
    expect(workflowPersistentStatusTargetRoute("permissions")).toMatchObject({
      buildPanel: "build-permissions",
      focusSelector: "#build-permissions",
    });
    expect(workflowPersistentStatusTargetRoute("versions")).toMatchObject({
      buildPanel: "build-versions",
      focusSelector: "#build-versions",
    });
    expect(workflowPersistentStatusTargetRoute("runs-live")).toMatchObject({
      artifactPanel: "run_console",
      focusSelector: "#runs-live",
      runsPanel: "runs-live",
    });
    expect(workflowPersistentStatusTargetRoute("runs-input")).toMatchObject({
      artifactPanel: "runtime_input",
      focusSelector: "#runs-input",
      runsPanel: "runs-input",
    });
    expect(workflowPersistentStatusTargetRoute("schedules-grants")).toMatchObject({
      focusSelector: "#schedules-grants",
      schedulePanel: "schedules-grants",
      selectPane: "schedules",
    });
    expect(workflowPersistentStatusTargetRoute("schedules-overview")).toMatchObject({
      focusSelector: "#schedules-overview",
      schedulePanel: "schedules-overview",
      selectPane: "schedules",
    });
  });
});
