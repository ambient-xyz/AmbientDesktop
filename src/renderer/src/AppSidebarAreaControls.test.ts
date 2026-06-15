import { describe, expect, it, vi } from "vitest";

import type { SidebarOrganizeSettings } from "./AppSidebar";
import {
  automationPaneForWorkflowRecordings,
  createAppSidebarAreaControls,
  rightPanelForOpenedSidebarArea,
  sidebarOrganizeForOpenedProjects,
} from "./AppSidebarAreaControls";

describe("AppSidebarAreaControls", () => {
  it("keeps project organization when returning from automations", () => {
    const current: SidebarOrganizeSettings = { organize: "chronological", sort: "updated", show: "all" };
    expect(sidebarOrganizeForOpenedProjects(current, "projects")).toBe(current);
    expect(sidebarOrganizeForOpenedProjects({ ...current, organize: "project" }, "automations")).toEqual({
      organize: "project",
      sort: "updated",
      show: "all",
    });
    expect(sidebarOrganizeForOpenedProjects(current, "automations")).toEqual({
      organize: "project",
      sort: "updated",
      show: "all",
    });
  });

  it("only keeps search and settings open when opening automations", () => {
    expect(rightPanelForOpenedSidebarArea("search", "automations")).toBe("search");
    expect(rightPanelForOpenedSidebarArea("settings", "automations")).toBe("settings");
    expect(rightPanelForOpenedSidebarArea("files", "automations")).toBeUndefined();
    expect(rightPanelForOpenedSidebarArea("files", "projects")).toBe("files");
  });

  it("maps workflow recordings away from the workflow lab pane only", () => {
    expect(automationPaneForWorkflowRecordings("workflow_lab")).toBe("home");
    expect(automationPaneForWorkflowRecordings("workflow_agent")).toBe("workflow_agent");
  });

  it("opens automation areas with the existing panel and selection side effects", () => {
    const setSidebarArea = vi.fn();
    const setProjectPopover = vi.fn();
    const setAutomationPopover = vi.fn();
    const setSidebarOrganize = vi.fn();
    const setRightPanel = vi.fn();
    const setSelectedAutomationPane = vi.fn();
    const setSelectedAutomationThreadId = vi.fn();
    const setSelectedWorkflowAgentThreadId = vi.fn();
    const setSelectedWorkflowRecordingId = vi.fn();
    const loadAutomationFolders = vi.fn();
    const controls = createAppSidebarAreaControls({
      sidebarArea: "projects",
      setSidebarArea,
      setProjectPopover,
      setAutomationPopover,
      setSidebarOrganize,
      setRightPanel,
      setSelectedAutomationPane,
      setSelectedAutomationThreadId,
      setSelectedWorkflowAgentThreadId,
      setSelectedWorkflowRecordingId,
      loadAutomationFolders,
    });

    controls.openWorkflowRecordingsArea();
    controls.openWorkflowLabArea();

    expect(setSidebarArea.mock.calls).toEqual([["automations"], ["automations"]]);
    expect(setProjectPopover.mock.calls).toEqual([[undefined], [undefined]]);
    expect(setRightPanel).toHaveBeenCalledTimes(2);
    expect(loadAutomationFolders).toHaveBeenCalledTimes(2);
    expect(setSelectedAutomationPane.mock.calls[0][0]("workflow_lab")).toBe("home");
    expect(setSelectedAutomationPane.mock.calls[1]).toEqual(["workflow_lab"]);
    expect(setSelectedAutomationThreadId.mock.calls).toEqual([[undefined], [undefined]]);
    expect(setSelectedWorkflowAgentThreadId.mock.calls).toEqual([[undefined], [undefined]]);
    expect(setSelectedWorkflowRecordingId.mock.calls).toEqual([[undefined], [undefined]]);
  });
});
