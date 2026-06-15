import { useState } from "react";

import type {
  AmbientPluginRegistry,
  AutomationFolderSummary,
  OrchestrationAutoDispatchStatus,
  OrchestrationBoard,
  WorkflowAgentFolderSummary,
} from "../../shared/types";

export type AutomationsWorkspaceSurfaceDesktop = {
  getOrchestrationAutoDispatchStatus: () => Promise<OrchestrationAutoDispatchStatus>;
  listAmbientPluginRegistry: () => Promise<AmbientPluginRegistry>;
  listAutomationFolders: () => Promise<AutomationFolderSummary[]>;
  listOrchestrationBoard: () => Promise<OrchestrationBoard>;
  listWorkflowAgentFolders: () => Promise<WorkflowAgentFolderSummary[]>;
};

export function automationSurfaceErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function automationAutoDispatchStatusFromError(error: unknown): OrchestrationAutoDispatchStatus {
  return {
    enabled: false,
    workflowAllows: true,
    inFlight: false,
    lastError: automationSurfaceErrorMessage(error),
    lastStartedRunIds: [],
    lastStartedRuns: [],
  };
}

function defaultAutomationsWorkspaceSurfaceDesktop(): AutomationsWorkspaceSurfaceDesktop {
  return window.ambientDesktop;
}

export function useAutomationsWorkspaceSurfaceController({
  desktop = defaultAutomationsWorkspaceSurfaceDesktop(),
  onFoldersChanged,
  onWorkflowAgentFoldersChanged,
}: {
  desktop?: AutomationsWorkspaceSurfaceDesktop;
  onFoldersChanged: (folders: AutomationFolderSummary[]) => void;
  onWorkflowAgentFoldersChanged: (folders: WorkflowAgentFolderSummary[]) => void;
}) {
  const [orchestrationBoard, setOrchestrationBoard] = useState<OrchestrationBoard | undefined>();
  const [orchestrationError, setOrchestrationError] = useState<string | undefined>();
  const [autoDispatchStatus, setAutoDispatchStatus] = useState<OrchestrationAutoDispatchStatus | undefined>();
  const [automationPluginRegistry, setAutomationPluginRegistry] = useState<AmbientPluginRegistry | undefined>();

  async function refreshAutomationFolders() {
    const [nextAutomationFolders, nextWorkflowAgentFolders] = await Promise.all([
      desktop.listAutomationFolders(),
      desktop.listWorkflowAgentFolders(),
    ]);
    onFoldersChanged(nextAutomationFolders);
    onWorkflowAgentFoldersChanged(nextWorkflowAgentFolders);
    return { automationFolders: nextAutomationFolders, workflowAgentFolders: nextWorkflowAgentFolders };
  }

  async function loadAutomationPluginRegistry() {
    try {
      setAutomationPluginRegistry(await desktop.listAmbientPluginRegistry());
    } catch {
      setAutomationPluginRegistry(undefined);
    }
  }

  async function loadOrchestrationBoard() {
    setOrchestrationError(undefined);
    try {
      setOrchestrationBoard(await desktop.listOrchestrationBoard());
    } catch (error) {
      setOrchestrationError(automationSurfaceErrorMessage(error));
    }
  }

  async function loadAutoDispatchStatus() {
    try {
      setAutoDispatchStatus(await desktop.getOrchestrationAutoDispatchStatus());
    } catch (error) {
      setAutoDispatchStatus(automationAutoDispatchStatusFromError(error));
    }
  }

  return {
    orchestrationBoard,
    setOrchestrationBoard,
    orchestrationError,
    setOrchestrationError,
    autoDispatchStatus,
    setAutoDispatchStatus,
    automationPluginRegistry,
    refreshAutomationFolders,
    loadAutomationPluginRegistry,
    loadOrchestrationBoard,
    loadAutoDispatchStatus,
  };
}
