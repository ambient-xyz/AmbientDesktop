import type { IpcMain } from "electron";

import {
  automationsCreateFolderIpcChannels,
  automationsCreateScheduleIpcChannels,
  automationsListFoldersIpcChannels,
  automationsListScheduleExceptionsIpcChannels,
  automationsListSchedulesIpcChannels,
  automationsMoveThreadIpcChannels,
  automationsRescheduleScheduleOccurrenceIpcChannels,
  automationsSkipScheduleOccurrenceIpcChannels,
  automationsUpdateScheduleIpcChannels,
  automationsUpdateScheduleOccurrenceRunLimitsIpcChannels,
  registerAutomationsCreateFolderIpc,
  registerAutomationsCreateScheduleIpc,
  registerAutomationsListFoldersIpc,
  registerAutomationsListScheduleExceptionsIpc,
  registerAutomationsListSchedulesIpc,
  registerAutomationsMoveThreadIpc,
  registerAutomationsRescheduleScheduleOccurrenceIpc,
  registerAutomationsSkipScheduleOccurrenceIpc,
  registerAutomationsUpdateScheduleIpc,
  registerAutomationsUpdateScheduleOccurrenceRunLimitsIpc,
} from "./registerAutomationsIpc";
import { callableWorkflowIpcChannels, registerCallableWorkflowIpc } from "./registerCallableWorkflowIpc";
import { registerWorkflowAutomationAgentIpc } from "./registerWorkflowAutomationAgentIpc";
import {
  registerWorkflowArtifactReviewIpc,
  registerWorkflowArtifactRevalidationIpc,
  registerWorkflowArtifactSourceIpc,
  registerWorkflowCancelRunIpc,
  registerWorkflowCompilePreviewIpc,
  registerWorkflowConnectorGrantIpc,
  registerWorkflowDashboardIpc,
  registerWorkflowDebugRewriteIpc,
  registerWorkflowRecoverRunIpc,
  registerWorkflowRunArtifactIpc,
  workflowAgentCapabilityIpcChannels,
  workflowAgentDiscoveryAccessIpcChannels,
  workflowAgentDiscoveryAnswerIpcChannels,
  workflowAgentDiscoveryStartIpcChannels,
  workflowAgentExplorationIpcChannels,
  workflowAgentNativeToolIpcChannels,
  workflowAgentRevisionDiscoveryStartIpcChannels,
  workflowAgentRevisionIpcChannels,
  workflowAgentThreadIpcChannels,
  workflowAgentTraceIpcChannels,
  workflowArtifactReviewIpcChannels,
  workflowArtifactRevalidationIpcChannels,
  workflowArtifactSourceIpcChannels,
  workflowCancelRunIpcChannels,
  workflowCompilePreviewIpcChannels,
  workflowConnectorGrantIpcChannels,
  workflowDashboardIpcChannels,
  workflowDebugRewriteIpcChannels,
  workflowRecoverRunIpcChannels,
  workflowRunArtifactIpcChannels,
} from "./registerWorkflowIpc";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;

export const workflowAutomationDomainIpcChannels = [
  ...automationsListFoldersIpcChannels,
  ...automationsCreateFolderIpcChannels,
  ...automationsMoveThreadIpcChannels,
  ...workflowAgentThreadIpcChannels,
  ...workflowAgentDiscoveryStartIpcChannels,
  ...workflowAgentRevisionDiscoveryStartIpcChannels,
  ...workflowAgentDiscoveryAnswerIpcChannels,
  ...workflowAgentDiscoveryAccessIpcChannels,
  ...workflowAgentCapabilityIpcChannels,
  ...workflowAgentNativeToolIpcChannels,
  ...workflowAgentTraceIpcChannels,
  ...workflowAgentExplorationIpcChannels,
  ...workflowAgentRevisionIpcChannels,
  ...automationsListSchedulesIpcChannels,
  ...automationsCreateScheduleIpcChannels,
  ...automationsUpdateScheduleIpcChannels,
  ...automationsListScheduleExceptionsIpcChannels,
  ...automationsSkipScheduleOccurrenceIpcChannels,
  ...automationsRescheduleScheduleOccurrenceIpcChannels,
  ...automationsUpdateScheduleOccurrenceRunLimitsIpcChannels,
  ...workflowDashboardIpcChannels,
  ...workflowCompilePreviewIpcChannels,
  ...workflowDebugRewriteIpcChannels,
  ...workflowArtifactReviewIpcChannels,
  ...workflowConnectorGrantIpcChannels,
  ...workflowArtifactRevalidationIpcChannels,
  ...workflowArtifactSourceIpcChannels,
  ...workflowRunArtifactIpcChannels,
  ...workflowRecoverRunIpcChannels,
  ...workflowCancelRunIpcChannels,
  ...callableWorkflowIpcChannels,
] as const;

export interface RegisterWorkflowAutomationDomainIpcDependencies extends Record<string, any> {
  handleIpc: HandleIpc;
}

export function registerWorkflowAutomationDomainIpc(deps: RegisterWorkflowAutomationDomainIpcDependencies): void {
  const {
    activeWorkflowRunController,
    activeWorkflowRunHost,
    ambientRetryPolicyFromCurrentSettings,
    buildWorkflowDebugRewritePromptSection,
    buildWorkflowRecoveryPlan,
    compileWorkflowArtifact,
    createWorkflowDebugRewriteRevision,
    createWorkflowSampleArtifact,
    emitProjectStateIfActive,
    emitWorkflowEvent,
    emitWorkflowUpdated,
    ensureWorkflowPluginTrusted,
    firstPartyWorkflowConnectorAccountAuthorizer,
    firstPartyWorkflowConnectorDescriptors,
    firstPartyWorkflowConnectorRegistrations,
    forgetActiveWorkflowRunsForController,
    getAmbientProviderStatus,
    getFeatureFlagSnapshot,
    handleIpc,
    mainWindow,
    markStaleWorkflowRunForRecoveryIfNeeded,
    pluginHost,
    pluginMcpRegistrationsForThread,
    pluginStateReaderForStore,
    projectRuntimeHostForWorkflowRun,
    readWorkflowDashboard,
    readWorkflowRunDetail,
    rememberActiveWorkflowRun,
    requestPermissionWithGrantRegistry,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForAutomationSchedule,
    requireProjectRuntimeHostForAutomationScheduleTarget,
    requireProjectRuntimeHostForAutomationThread,
    requireProjectRuntimeHostForCallableWorkflowTask,
    requireProjectRuntimeHostForWorkflowArtifact,
    requireProjectRuntimeHostForWorkflowRun,
    revalidateWorkflowArtifact,
    reviewWorkflowArtifact,
    runWorkflowArtifact,
    searchRoutingSettings,
    store,
    updateWorkflowArtifactSource,
    updateWorkflowConnectorGrant,
    workflowArtifactIpcContext,
    workflowArtifactIpcContextForHost,
    workflowCompileIpcContext,
    workflowDebugRewriteIpcContext,
    workflowDebugRewriteUserRequest,
    workflowToolDescriptorsFromPluginRegistry,
    workspaceStateForThread,
  } = deps;

  registerAutomationsListFoldersIpc({
    handleIpc,
    listAutomationFolders: () => requireActiveProjectRuntimeHost().store.listAutomationFolders(),
  });

  registerAutomationsCreateFolderIpc({
    handleIpc,
    createAutomationFolder: (input) => {
      const host = requireActiveProjectRuntimeHost();
      return host.store.createAutomationFolder(input);
    },
  });

  registerAutomationsMoveThreadIpc({
    handleIpc,
    moveAutomationThread: (input) => {
      const host = requireProjectRuntimeHostForAutomationThread(input.threadId);
      return host.store.moveAutomationThread(input);
    },
  });

  registerWorkflowAutomationAgentIpc(deps);

  registerAutomationsListSchedulesIpc({
    handleIpc,
    listAutomationSchedules: () => requireActiveProjectRuntimeHost().store.listAutomationSchedules(),
  });

  registerAutomationsCreateScheduleIpc({
    handleIpc,
    createAutomationSchedule: (input) => {
      const host = requireProjectRuntimeHostForAutomationScheduleTarget(input);
      const schedules = host.store.createAutomationSchedule(input);
      emitProjectStateIfActive(host);
      return schedules;
    },
  });

  registerAutomationsUpdateScheduleIpc({
    handleIpc,
    updateAutomationSchedule: (input) => {
      const host = requireProjectRuntimeHostForAutomationSchedule(input.id);
      const schedules = host.store.updateAutomationSchedule(input);
      emitProjectStateIfActive(host);
      return schedules;
    },
  });

  registerAutomationsListScheduleExceptionsIpc({
    handleIpc,
    listAutomationScheduleExceptions: (input) => {
      const host = input.scheduleId ? requireProjectRuntimeHostForAutomationSchedule(input.scheduleId) : requireActiveProjectRuntimeHost();
      return host.store.listAutomationScheduleExceptions(input);
    },
  });

  registerAutomationsSkipScheduleOccurrenceIpc({
    handleIpc,
    skipAutomationScheduleOccurrence: (input) => {
      const host = requireProjectRuntimeHostForAutomationSchedule(input.scheduleId);
      const result = host.store.skipAutomationScheduleOccurrence(input);
      emitProjectStateIfActive(host);
      return result;
    },
  });

  registerAutomationsRescheduleScheduleOccurrenceIpc({
    handleIpc,
    rescheduleAutomationScheduleOccurrence: (input) => {
      const host = requireProjectRuntimeHostForAutomationSchedule(input.scheduleId);
      const result = host.store.rescheduleAutomationScheduleOccurrence(input);
      emitProjectStateIfActive(host);
      return result;
    },
  });

  registerAutomationsUpdateScheduleOccurrenceRunLimitsIpc({
    handleIpc,
    updateAutomationScheduleOccurrenceRunLimits: (input) => {
      const host = requireProjectRuntimeHostForAutomationSchedule(input.scheduleId);
      return host.store.updateAutomationScheduleOccurrenceRunLimits(input);
    },
  });

  registerWorkflowDashboardIpc<any, any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForWorkflowRun,
    readWorkflowDashboard,
    readWorkflowRunDetail,
    createWorkflowSampleArtifact,
    emitWorkflowUpdated,
  });

  registerWorkflowCompilePreviewIpc<any, any, any, any>({
    handleIpc,
    workflowCompileIpcContext,
    workspaceStateForThread,
    getAmbientProviderStatus,
    pluginMcpRegistrationsForThread,
    listPluginRegistry: (projectPath: string, targetStore: any) =>
      pluginHost.listRegistry(projectPath, pluginStateReaderForStore(targetStore)),
    workflowToolDescriptorsFromPluginRegistry,
    connectorDescriptors: firstPartyWorkflowConnectorDescriptors,
    readSearchRoutingSettings: () => searchRoutingSettings,
    ambientRetryPolicyFromCurrentSettings,
    compileWorkflowArtifact,
    emitWorkflowEvent,
    emitWorkflowUpdated,
  });

  registerWorkflowDebugRewriteIpc<any, any, any, any, any, any>({
    handleIpc,
    readE2eEnabled: () => process.env.AMBIENT_E2E === "1",
    emitE2eWorkflowDebugRewriteInput: (input: any) =>
      mainWindow?.webContents.send("desktop:event", { type: "e2e-workflow-debug-rewrite-input", input }),
    readE2eWorkflowDashboard: () => readWorkflowDashboard(store),
    workflowDebugRewriteIpcContext,
    workflowDebugRewriteUserRequest,
    workspaceStateForThread,
    getAmbientProviderStatus,
    pluginMcpRegistrationsForThread,
    listPluginRegistry: (projectPath: string, targetStore: any) =>
      pluginHost.listRegistry(projectPath, pluginStateReaderForStore(targetStore)),
    workflowToolDescriptorsFromPluginRegistry,
    connectorDescriptors: firstPartyWorkflowConnectorDescriptors,
    readSearchRoutingSettings: () => searchRoutingSettings,
    ambientRetryPolicyFromCurrentSettings,
    buildWorkflowDebugRewritePromptSection,
    compileWorkflowArtifact,
    createWorkflowDebugRewriteRevision,
    emitWorkflowEvent,
    emitWorkflowUpdated,
  });

  registerWorkflowArtifactReviewIpc<any, any>({
    handleIpc,
    requireProjectRuntimeHostForWorkflowArtifact,
    reviewWorkflowArtifact,
    emitWorkflowUpdated,
  });

  registerWorkflowConnectorGrantIpc<any, any>({
    handleIpc,
    requireProjectRuntimeHostForWorkflowArtifact,
    updateWorkflowConnectorGrant,
    emitWorkflowUpdated,
  });

  registerWorkflowArtifactRevalidationIpc<any, any>({
    handleIpc,
    requireProjectRuntimeHostForWorkflowArtifact,
    revalidateWorkflowArtifact,
    connectorDescriptors: firstPartyWorkflowConnectorDescriptors,
    emitWorkflowUpdated,
  });

  registerWorkflowArtifactSourceIpc<any, any>({
    handleIpc,
    requireProjectRuntimeHostForWorkflowArtifact,
    updateWorkflowArtifactSource,
    connectorDescriptors: firstPartyWorkflowConnectorDescriptors,
    emitWorkflowUpdated,
  });

  registerWorkflowRunArtifactIpc<any, any, any, any>({
    handleIpc,
    workflowArtifactIpcContext,
    getAmbientProviderStatus,
    pluginMcpRegistrationsForThread,
    listPluginRegistry: (projectPath: string, targetStore: any) =>
      pluginHost.listRegistry(projectPath, pluginStateReaderForStore(targetStore)),
    requestPermissionWithGrantRegistry,
    ensureWorkflowPluginTrusted,
    pluginCaller: (plan: any, invocation: any, options: any) => pluginHost.callCodexPluginMcpTool(plan, invocation, options),
    connectorRegistrations: firstPartyWorkflowConnectorRegistrations,
    connectorAccountAuthorizer: firstPartyWorkflowConnectorAccountAuthorizer,
    runWorkflowArtifact,
    rememberActiveWorkflowRun,
    forgetActiveWorkflowRunsForController,
    emitWorkflowEvent,
    emitWorkflowUpdated,
  });

  registerWorkflowRecoverRunIpc<any, any, any, any, any>({
    handleIpc,
    requireProjectRuntimeHostForWorkflowRun,
    buildWorkflowRecoveryPlan,
    workflowArtifactIpcContextForHost,
    markStaleWorkflowRunForRecoveryIfNeeded,
    getAmbientProviderStatus,
    pluginMcpRegistrationsForThread,
    listPluginRegistry: (projectPath: string, targetStore: any) =>
      pluginHost.listRegistry(projectPath, pluginStateReaderForStore(targetStore)),
    requestPermissionWithGrantRegistry,
    ensureWorkflowPluginTrusted,
    pluginCaller: (runPlan: any, invocation: any, options: any) => pluginHost.callCodexPluginMcpTool(runPlan, invocation, options),
    connectorRegistrations: firstPartyWorkflowConnectorRegistrations,
    connectorAccountAuthorizer: firstPartyWorkflowConnectorAccountAuthorizer,
    runWorkflowArtifact,
    rememberActiveWorkflowRun,
    forgetActiveWorkflowRunsForController,
    emitWorkflowEvent,
    emitWorkflowUpdated,
  });

  registerWorkflowCancelRunIpc<any, any>({
    handleIpc,
    projectRuntimeHostForWorkflowRun,
    activeWorkflowRunHost,
    activeWorkflowRunController,
    readWorkflowDashboard,
    emitWorkflowUpdated,
  });

  registerCallableWorkflowIpc<any, any>({
    handleIpc,
    requireProjectRuntimeHostForCallableWorkflowTask,
    getFeatureFlagSnapshot,
  });
}
