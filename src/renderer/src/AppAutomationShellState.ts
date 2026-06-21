import { useState } from "react";

import type { AutomationFolderSummary } from "../../shared/automationTypes";
import type { WorkflowAgentFolderSummary } from "../../shared/workflowTypes";
import type { AutomationPane } from "./AutomationsWorkspace";
import type { AutomationPopover, SidebarOrganizeSettings } from "./AppSidebar";

export function useAppAutomationShellState() {
  const [automationPopover, setAutomationPopover] = useState<AutomationPopover | undefined>();
  const [automationsCollapsed, setAutomationsCollapsed] = useState(false);
  const [automationFolders, setAutomationFolders] = useState<AutomationFolderSummary[]>([]);
  const [, setAutomationNavigationError] = useState<string | undefined>();
  const [selectedAutomationPane, setSelectedAutomationPane] = useState<AutomationPane>("home");
  const [selectedAutomationFolderId, setSelectedAutomationFolderId] = useState("home");
  const [selectedAutomationThreadId, setSelectedAutomationThreadId] = useState<string | undefined>();
  const [workflowAgentFolders, setWorkflowAgentFolders] = useState<WorkflowAgentFolderSummary[]>([]);
  const [workflowAgentNavigationError, setWorkflowAgentNavigationError] = useState<string | undefined>();
  const [selectedWorkflowAgentFolderId, setSelectedWorkflowAgentFolderId] = useState("home");
  const [selectedWorkflowAgentThreadId, setSelectedWorkflowAgentThreadId] = useState<string | undefined>();
  const [sidebarOrganize, setSidebarOrganize] = useState<SidebarOrganizeSettings>({
    organize: "project",
    sort: "updated",
    show: "all",
  });
  const [sidebarAgeNow, setSidebarAgeNow] = useState(() => Date.now());

  function updateSidebarOrganize(input: Partial<SidebarOrganizeSettings>) {
    setSidebarOrganize((current) => ({ ...current, ...input }));
  }

  return {
    automationPopover,
    setAutomationPopover,
    automationsCollapsed,
    setAutomationsCollapsed,
    automationFolders,
    setAutomationFolders,
    setAutomationNavigationError,
    selectedAutomationPane,
    setSelectedAutomationPane,
    selectedAutomationFolderId,
    setSelectedAutomationFolderId,
    selectedAutomationThreadId,
    setSelectedAutomationThreadId,
    workflowAgentFolders,
    setWorkflowAgentFolders,
    workflowAgentNavigationError,
    setWorkflowAgentNavigationError,
    selectedWorkflowAgentFolderId,
    setSelectedWorkflowAgentFolderId,
    selectedWorkflowAgentThreadId,
    setSelectedWorkflowAgentThreadId,
    sidebarOrganize,
    setSidebarOrganize,
    updateSidebarOrganize,
    sidebarAgeNow,
    setSidebarAgeNow,
  };
}
