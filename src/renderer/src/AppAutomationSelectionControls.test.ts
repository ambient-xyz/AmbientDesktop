import { describe, expect, it, vi } from "vitest";

import type {
  AutomationThreadSummary,
  WorkflowAgentThreadSummary,
  WorkflowRecordingLibraryEntry,
} from "../../shared/types";
import {
  automationPaneForSelectedThread,
  automationPaneKeepsWorkflowAgentThread,
  automationPaneKeepsWorkflowRecording,
  createAppAutomationSelectionControls,
} from "./AppAutomationSelectionControls";

describe("AppAutomationSelectionControls", () => {
  it("derives the active automation pane from a selected automation thread", () => {
    expect(automationPaneForSelectedThread(undefined, "workflow_agent")).toBe("workflow_agent");
    expect(automationPaneForSelectedThread({ id: "thread-1" } as AutomationThreadSummary, "workflow_agent")).toBe("folder");
  });

  it("keeps the existing pane-specific selection reset rules", () => {
    expect(automationPaneKeepsWorkflowAgentThread("schedules")).toBe(true);
    expect(automationPaneKeepsWorkflowAgentThread("runs_reviews")).toBe(true);
    expect(automationPaneKeepsWorkflowAgentThread("workflow_agent")).toBe(false);
    expect(automationPaneKeepsWorkflowRecording("workflow_agent")).toBe(true);
    expect(automationPaneKeepsWorkflowRecording("workflow_lab")).toBe(false);
  });

  it("routes workflow agent and recording selections with existing reset side effects", () => {
    const controls = createControls();
    const workflowThread = { id: "wf-thread", folderId: "wf-folder" } as WorkflowAgentThreadSummary;
    const playbook = { id: "playbook-1" } as WorkflowRecordingLibraryEntry;

    controls.selectWorkflowAgentFolder("folder-1");
    controls.selectWorkflowAgentThread(workflowThread);
    controls.selectWorkflowRecordingForSidebar(playbook);
    controls.selectWorkflowRecordingForLab(playbook);

    expect(controls.setSelectedWorkflowAgentFolderId.mock.calls).toEqual([["folder-1"], ["wf-folder"]]);
    expect(controls.setSelectedWorkflowAgentThreadId.mock.calls).toEqual([
      [undefined],
      ["wf-thread"],
      [undefined],
      [undefined],
    ]);
    expect(controls.setSelectedWorkflowRecordingId.mock.calls).toEqual([
      [undefined],
      [undefined],
      ["playbook-1"],
      ["playbook-1"],
    ]);
    expect(controls.setSelectedAutomationPane.mock.calls).toEqual([
      ["workflow_agent"],
      ["workflow_agent"],
      ["workflow_agent"],
      ["workflow_lab"],
    ]);
    expect(controls.setSelectedAutomationThreadId.mock.calls).toEqual([
      [undefined],
      [undefined],
      [undefined],
      [undefined],
    ]);
  });

  it("selects automation panes and threads with the previous reset behavior", () => {
    const controls = createControls();
    const automationThread = { id: "auto-thread", folderId: "auto-folder" } as AutomationThreadSummary;

    controls.selectAutomationPane("schedules");
    controls.selectAutomationPane("workflow_agent");
    controls.selectAutomationThread(automationThread);

    expect(controls.setSelectedAutomationPane.mock.calls).toEqual([
      ["schedules"],
      ["workflow_agent"],
      ["folder"],
    ]);
    expect(controls.setSelectedAutomationThreadId.mock.calls).toEqual([
      [undefined],
      [undefined],
      ["auto-thread"],
    ]);
    expect(controls.setSelectedWorkflowAgentThreadId.mock.calls).toEqual([[undefined]]);
    expect(controls.setSelectedWorkflowRecordingId.mock.calls).toEqual([
      [undefined],
      [undefined],
    ]);
    expect(controls.setSelectedAutomationFolderId.mock.calls).toEqual([["auto-folder"]]);
  });

  it("returns to the project sidebar before opening a run thread", async () => {
    const controls = createControls();
    controls.selectThread.mockResolvedValue(undefined);

    await controls.openAutomationRunThread("thread-1", "/workspace");

    expect(controls.setSidebarArea).toHaveBeenCalledWith("projects");
    expect(controls.selectThread).toHaveBeenCalledWith("thread-1", "/workspace");
  });
});

function createControls() {
  const setSidebarArea = vi.fn();
  const setSelectedAutomationPane = vi.fn();
  const setSelectedAutomationFolderId = vi.fn();
  const setSelectedAutomationThreadId = vi.fn();
  const setSelectedWorkflowAgentFolderId = vi.fn();
  const setSelectedWorkflowAgentThreadId = vi.fn();
  const setSelectedWorkflowRecordingId = vi.fn();
  const selectThread = vi.fn();
  const controls = createAppAutomationSelectionControls({
    setSidebarArea,
    setSelectedAutomationPane,
    setSelectedAutomationFolderId,
    setSelectedAutomationThreadId,
    setSelectedWorkflowAgentFolderId,
    setSelectedWorkflowAgentThreadId,
    setSelectedWorkflowRecordingId,
    selectThread,
  });
  return {
    ...controls,
    setSidebarArea,
    setSelectedAutomationPane,
    setSelectedAutomationFolderId,
    setSelectedAutomationThreadId,
    setSelectedWorkflowAgentFolderId,
    setSelectedWorkflowAgentThreadId,
    setSelectedWorkflowRecordingId,
    selectThread,
  };
}
