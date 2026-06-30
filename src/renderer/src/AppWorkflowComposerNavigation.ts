import type { Dispatch, SetStateAction } from "react";

import type { AutomationPopover, ProjectPopover } from "./AppSidebar";
import type { SidebarArea } from "./AppShellSidebar";
import type { AutomationPane } from "./AutomationsWorkspace";
import type { UtilityPanel } from "./RightPanel";

type Setter<T> = Dispatch<SetStateAction<T>>;
type MaybePromise<T = unknown> = T | Promise<T>;

export function createAppWorkflowComposerNavigation({
  loadWorkflowAgentFolders,
  setAutomationPopover,
  setProjectPopover,
  setRightPanel,
  setSelectedAutomationPane,
  setSelectedAutomationThreadId,
  setSelectedWorkflowAgentFolderId,
  setSelectedWorkflowAgentThreadId,
  setSelectedWorkflowRecordingId,
  setSidebarArea,
}: {
  loadWorkflowAgentFolders: () => MaybePromise;
  setAutomationPopover: Setter<AutomationPopover | undefined>;
  setProjectPopover: Setter<ProjectPopover | undefined>;
  setRightPanel: Setter<UtilityPanel | undefined>;
  setSelectedAutomationPane: Setter<AutomationPane>;
  setSelectedAutomationThreadId: Setter<string | undefined>;
  setSelectedWorkflowAgentFolderId: Setter<string>;
  setSelectedWorkflowAgentThreadId: Setter<string | undefined>;
  setSelectedWorkflowRecordingId: Setter<string | undefined>;
  setSidebarArea: Setter<SidebarArea>;
}): {
  openNewWorkflowComposer: (folderId?: string) => void;
} {
  function openNewWorkflowComposer(folderId?: string): void {
    setSidebarArea("automations");
    setProjectPopover(undefined);
    setAutomationPopover(undefined);
    setSelectedAutomationPane("workflow_agent");
    if (folderId) setSelectedWorkflowAgentFolderId(folderId);
    setSelectedWorkflowAgentThreadId(undefined);
    setSelectedWorkflowRecordingId(undefined);
    setSelectedAutomationThreadId(undefined);
    setRightPanel((current) => (current === "search" || current === "settings" ? current : undefined));
    void loadWorkflowAgentFolders();
  }

  return { openNewWorkflowComposer };
}
