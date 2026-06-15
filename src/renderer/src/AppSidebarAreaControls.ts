import type { Dispatch, SetStateAction } from "react";

import type {
  AutomationPopover,
  ProjectPopover,
  SidebarOrganizeSettings,
} from "./AppSidebar";
import type { SidebarArea } from "./AppShellSidebar";
import type { AutomationPane } from "./AutomationsWorkspace";
import type { UtilityPanel } from "./RightPanel";

type OptionalStringSetter = Dispatch<SetStateAction<string | undefined>>;

export function sidebarOrganizeForOpenedProjects(
  current: SidebarOrganizeSettings,
  previousArea: SidebarArea,
): SidebarOrganizeSettings {
  if (previousArea !== "automations" || current.organize === "project") return current;
  return { ...current, organize: "project" };
}

export function rightPanelForOpenedSidebarArea(
  current: UtilityPanel | undefined,
  area: SidebarArea,
): UtilityPanel | undefined {
  if (area !== "automations") return current;
  return current === "search" || current === "settings" ? current : undefined;
}

export function automationPaneForWorkflowRecordings(pane: AutomationPane): AutomationPane {
  return pane === "workflow_lab" ? "home" : pane;
}

export function createAppSidebarAreaControls({
  sidebarArea,
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
}: {
  sidebarArea: SidebarArea;
  setSidebarArea: Dispatch<SetStateAction<SidebarArea>>;
  setProjectPopover: Dispatch<SetStateAction<ProjectPopover | undefined>>;
  setAutomationPopover: Dispatch<SetStateAction<AutomationPopover | undefined>>;
  setSidebarOrganize: Dispatch<SetStateAction<SidebarOrganizeSettings>>;
  setRightPanel: Dispatch<SetStateAction<UtilityPanel | undefined>>;
  setSelectedAutomationPane: Dispatch<SetStateAction<AutomationPane>>;
  setSelectedAutomationThreadId: OptionalStringSetter;
  setSelectedWorkflowAgentThreadId: OptionalStringSetter;
  setSelectedWorkflowRecordingId: OptionalStringSetter;
  loadAutomationFolders: () => void | Promise<void>;
}) {
  function clearAutomationSelection() {
    setSelectedAutomationThreadId(undefined);
    setSelectedWorkflowAgentThreadId(undefined);
    setSelectedWorkflowRecordingId(undefined);
  }

  function openSidebarArea(area: SidebarArea) {
    setSidebarArea(area);
    if (area === "projects") {
      setAutomationPopover(undefined);
      if (sidebarArea === "automations") {
        setSidebarOrganize((current) => sidebarOrganizeForOpenedProjects(current, sidebarArea));
      }
      return;
    }
    if (area === "automations") {
      setProjectPopover(undefined);
      setRightPanel((current) => rightPanelForOpenedSidebarArea(current, area));
      void loadAutomationFolders();
    }
  }

  return {
    openSidebarArea,
    openWorkflowRecordingsArea() {
      openSidebarArea("automations");
      setSelectedAutomationPane((pane) => automationPaneForWorkflowRecordings(pane));
      clearAutomationSelection();
    },
    openWorkflowLabArea() {
      openSidebarArea("automations");
      setSelectedAutomationPane("workflow_lab");
      clearAutomationSelection();
    },
  };
}
