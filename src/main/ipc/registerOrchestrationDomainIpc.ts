import type { IpcMain } from "electron";

import {
  orchestrationAutoDispatchIpcChannels,
  orchestrationBoardIpcChannels,
  orchestrationCancelRunIpcChannels,
  orchestrationPrepareIpcChannels,
  orchestrationRevealWorkspaceIpcChannels,
  orchestrationStartRunIpcChannels,
  orchestrationTaskIpcChannels,
  orchestrationWorkflowImpactIpcChannels,
  orchestrationWorkflowRawIpcChannels,
  orchestrationWorkflowRepairIpcChannels,
  orchestrationWorkflowSettingsIpcChannels,
  registerOrchestrationAutoDispatchIpc,
  registerOrchestrationBoardIpc,
  registerOrchestrationCancelRunIpc,
  registerOrchestrationPrepareIpc,
  registerOrchestrationRevealWorkspaceIpc,
  registerOrchestrationStartRunIpc,
  registerOrchestrationTaskIpc,
  registerOrchestrationWorkflowImpactIpc,
  registerOrchestrationWorkflowRawIpc,
  registerOrchestrationWorkflowRepairIpc,
  registerOrchestrationWorkflowSettingsIpc,
} from "./registerOrchestrationIpc";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;

export const orchestrationDomainIpcChannels = [
  ...orchestrationBoardIpcChannels,
  ...orchestrationTaskIpcChannels,
  ...orchestrationPrepareIpcChannels,
  ...orchestrationWorkflowImpactIpcChannels,
  ...orchestrationWorkflowRepairIpcChannels,
  ...orchestrationWorkflowSettingsIpcChannels,
  ...orchestrationWorkflowRawIpcChannels,
  ...orchestrationStartRunIpcChannels,
  ...orchestrationCancelRunIpcChannels,
  ...orchestrationRevealWorkspaceIpcChannels,
  ...orchestrationAutoDispatchIpcChannels,
] as const;

export interface RegisterOrchestrationDomainIpcDependencies {
  handleIpc: HandleIpc;
  activeThreadIdForHost: any;
  emitOrchestrationUpdated: any;
  emitProjectStateIfActive: any;
  ensureProjectRuntimeHostForWorkspacePath: any;
  openPath(workspacePath: string): Promise<string> | string;
  prepareAndRecordNextOrchestrationRuns: any;
  readAutoDispatchStatus: any;
  readCurrentOrchestrationBoard: any;
  readOrchestrationWorkflowReadiness: any;
  recordActiveProjectBoardExecutionReadinessBlocker: any;
  repairProjectBoardWorkflow: any;
  requireActiveProjectRuntimeHost: any;
  requireProjectRuntimeHostForOrchestrationRun: any;
  requireProjectRuntimeHostForOrchestrationTask: any;
  requireProjectRuntimeHostForOrchestrationWorkspace: any;
  requireProjectRuntimeHostForThread: any;
  reviewFinishedProjectBoardRun: any;
  setAutoDispatchEnabled: any;
  setProjectHostActiveThreadId: any;
  startPreparedOrchestrationRun: any;
  updateProjectBoardWorkflowRaw: any;
  updateProjectBoardWorkflowSettings: any;
}

export function registerOrchestrationDomainIpc({
  handleIpc,
  activeThreadIdForHost,
  emitOrchestrationUpdated,
  emitProjectStateIfActive,
  ensureProjectRuntimeHostForWorkspacePath,
  openPath,
  prepareAndRecordNextOrchestrationRuns,
  readAutoDispatchStatus,
  readCurrentOrchestrationBoard,
  readOrchestrationWorkflowReadiness,
  recordActiveProjectBoardExecutionReadinessBlocker,
  repairProjectBoardWorkflow,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForOrchestrationRun,
  requireProjectRuntimeHostForOrchestrationTask,
  requireProjectRuntimeHostForOrchestrationWorkspace,
  requireProjectRuntimeHostForThread,
  reviewFinishedProjectBoardRun,
  setAutoDispatchEnabled,
  setProjectHostActiveThreadId,
  startPreparedOrchestrationRun,
  updateProjectBoardWorkflowRaw,
  updateProjectBoardWorkflowSettings,
}: RegisterOrchestrationDomainIpcDependencies): void {
  registerOrchestrationBoardIpc({
    handleIpc,
    readCurrentOrchestrationBoard,
  });

  registerOrchestrationTaskIpc<any, any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    ensureProjectRuntimeHostForWorkspacePath,
    requireProjectRuntimeHostForOrchestrationTask,
    emitOrchestrationUpdated,
    readCurrentOrchestrationBoard,
  });

  registerOrchestrationPrepareIpc<any, any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    prepareAndRecordNextOrchestrationRuns,
    emitProjectStateIfActive,
    recordActiveProjectBoardExecutionReadinessBlocker,
  });

  registerOrchestrationWorkflowImpactIpc<any, any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    readOrchestrationWorkflowReadiness,
    prepareAndRecordNextOrchestrationRuns,
    recordActiveProjectBoardExecutionReadinessBlocker,
    readCurrentOrchestrationBoard,
    emitProjectStateIfActive,
    emitOrchestrationUpdated,
  });

  registerOrchestrationWorkflowRepairIpc<any, any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    repairProjectBoardWorkflow,
    readCurrentOrchestrationBoard,
    emitProjectStateIfActive,
    emitOrchestrationUpdated,
  });

  registerOrchestrationWorkflowSettingsIpc<any, any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    updateProjectBoardWorkflowSettings,
    readCurrentOrchestrationBoard,
    emitProjectStateIfActive,
    emitOrchestrationUpdated,
  });

  registerOrchestrationWorkflowRawIpc<any, any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    updateProjectBoardWorkflowRaw,
    readCurrentOrchestrationBoard,
    emitProjectStateIfActive,
    emitOrchestrationUpdated,
  });

  registerOrchestrationStartRunIpc<any, any>({
    handleIpc,
    requireProjectRuntimeHostForOrchestrationRun,
    activeThreadIdForHost,
    startPreparedOrchestrationRun,
    reviewFinishedProjectBoardRun,
    setProjectHostActiveThreadId,
    emitProjectStateIfActive,
    emitOrchestrationUpdated,
    readCurrentOrchestrationBoard,
  });

  registerOrchestrationCancelRunIpc<any, any>({
    handleIpc,
    requireProjectRuntimeHostForOrchestrationRun,
    requireProjectRuntimeHostForThread,
    emitOrchestrationUpdated,
    readCurrentOrchestrationBoard,
  });

  registerOrchestrationRevealWorkspaceIpc({
    handleIpc,
    requireProjectRuntimeHostForOrchestrationWorkspace,
    openPath,
  });

  registerOrchestrationAutoDispatchIpc({
    handleIpc,
    readAutoDispatchStatus,
    setAutoDispatchEnabled,
  });
}
