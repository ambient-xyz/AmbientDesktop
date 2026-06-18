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
import {
  callableWorkflowIpcChannels,
  registerCallableWorkflowIpc,
} from "./registerCallableWorkflowIpc";
import {
  registerWorkflowAgentCapabilityIpc,
  registerWorkflowAgentDiscoveryAccessIpc,
  registerWorkflowAgentDiscoveryAnswerIpc,
  registerWorkflowAgentDiscoveryStartIpc,
  registerWorkflowAgentExplorationIpc,
  registerWorkflowAgentNativeToolIpc,
  registerWorkflowAgentRevisionDiscoveryStartIpc,
  registerWorkflowAgentRevisionIpc,
  registerWorkflowAgentThreadIpc,
  registerWorkflowAgentTraceIpc,
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
import type { DesktopEvent } from "../../shared/desktopTypes";

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
    AmbientWorkflowExplorationProvider,
    activeWorkflowRunController,
    activeWorkflowRunHost,
    ambientCliCapabilityGrantsForWorkflowRequest,
    ambientRetryPolicyFromCurrentSettings,
    answerWorkflowDiscoveryQuestion,
    buildWorkflowDebugRewritePromptSection,
    buildWorkflowRecoveryPlan,
    compileWorkflowArtifact,
    createWorkflowDebugRewriteRevision,
    createWorkflowDiscoveryProvider,
    createWorkflowSampleArtifact,
    describeWorkflowDiscoveryCapability,
    emitPermissionGrantCreated,
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
    invokeWorkflowNativeTool,
    listGlobalWorkflowAgentFolders,
    mainWindow,
    markStaleWorkflowRunForRecoveryIfNeeded,
    normalizeWorkspacePath,
    pluginHost,
    pluginMcpRegistrationsForThread,
    pluginStateReaderForStore,
    projectRuntimeHostForWorkflowRun,
    readAmbientApiKey,
    readWorkflowDashboard,
    readWorkflowRunDetail,
    recordWorkflowRevisionDecisionInChat,
    rememberActiveWorkflowRun,
    requestPermissionWithGrantRegistry,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForAutomationSchedule,
    requireProjectRuntimeHostForAutomationScheduleTarget,
    requireProjectRuntimeHostForAutomationThread,
    requireProjectRuntimeHostForCallableWorkflowTask,
    requireProjectRuntimeHostForWorkflowArtifact,
    requireProjectRuntimeHostForWorkflowRevision,
    requireProjectRuntimeHostForWorkflowRun,
    requireProjectRuntimeHostForWorkflowThread,
    requireProjectRuntimeHostForWorkflowVersion,
    resolveWorkflowDiscoveryAccessRequest,
    restoreWorkflowVersion,
    revalidateWorkflowArtifact,
    reviewWorkflowArtifact,
    runWorkflowArtifact,
    runWorkflowThreadExploration,
    searchRoutingSettings,
    searchWorkflowDiscoveryCapabilities,
    startWorkflowDiscovery,
    startWorkflowRevisionDiscovery,
    store,
    updateWorkflowArtifactSource,
    updateWorkflowConnectorGrant,
    workflowAgentControlThread,
    workflowAgentIpcContextForDiscoveryQuestion,
    workflowAgentIpcContextForWorkflowThread,
    workflowArtifactIpcContext,
    workflowArtifactIpcContextForHost,
    workflowCompileIpcContext,
    workflowDebugRewriteIpcContext,
    workflowDebugRewriteUserRequest,
    workflowDiscoveryPolicyContextForCapabilityLookup,
    workflowProjectIpcContext,
    workflowToolDescriptorsFromPluginRegistry,
    workspaceInventoryConnector,
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

  registerWorkflowAgentThreadIpc<any, any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForWorkflowThread,
    workflowProjectIpcContext,
    listGlobalWorkflowAgentFolders,
  });

  registerWorkflowAgentDiscoveryStartIpc<any, any>({
    handleIpc,
    workflowProjectIpcContext,
    startWorkflowDiscovery: async ({ targetStore, thread, projectPath }: any, input: any) => {
      const workflowThread = { ...thread, workspacePath: projectPath };
      const providerStatus = getAmbientProviderStatus(workflowThread.model);
      const pluginRegistrations = await pluginMcpRegistrationsForThread(workflowThread, targetStore);
      return startWorkflowDiscovery(targetStore, input, {
        pluginRegistrations,
        connectorDescriptors: firstPartyWorkflowConnectorDescriptors(),
        searchRoutingSettings,
        permissionMode: thread.permissionMode,
        permissionAuditThreadId: thread.id,
        workspacePath: projectPath,
        provider: createWorkflowDiscoveryProvider(providerStatus, targetStore),
        onProgress: (progress: any) => emitWorkflowEvent({ type: "workflow-discovery-progress", progress }, projectPath),
      });
    },
  });

  registerWorkflowAgentRevisionDiscoveryStartIpc<any, any>({
    handleIpc,
    workflowAgentIpcContextForWorkflowThread,
    startWorkflowRevisionDiscovery: async ({ targetStore, thread, workflowThread, projectPath }: any, input: any) => {
      const workflowContextThread = { ...thread, workspacePath: projectPath };
      const providerStatus = getAmbientProviderStatus(workflowContextThread.model);
      const pluginRegistrations = await pluginMcpRegistrationsForThread(workflowContextThread, targetStore);
      return startWorkflowRevisionDiscovery(targetStore, input, {
        pluginRegistrations,
        connectorDescriptors: firstPartyWorkflowConnectorDescriptors(),
        searchRoutingSettings,
        permissionMode: thread.permissionMode,
        permissionAuditThreadId: workflowThread.chatThreadId ?? thread.id,
        workspacePath: projectPath,
        provider: createWorkflowDiscoveryProvider(providerStatus, targetStore),
        onProgress: (progress: any) => emitWorkflowEvent({ type: "workflow-discovery-progress", progress }, projectPath),
      });
    },
    emitWorkflowUpdated,
  });

  registerWorkflowAgentDiscoveryAnswerIpc<any, any>({
    handleIpc,
    workflowAgentIpcContextForDiscoveryQuestion,
    answerWorkflowDiscoveryQuestion: async ({ targetStore, thread, workflowThread, projectPath }: any, input: any) => {
      const workflowContextThread = { ...thread, workspacePath: projectPath };
      const providerStatus = getAmbientProviderStatus(workflowContextThread.model);
      const pluginRegistrations = await pluginMcpRegistrationsForThread(workflowContextThread, targetStore);
      return answerWorkflowDiscoveryQuestion(targetStore, input, {
        pluginRegistrations,
        connectorDescriptors: firstPartyWorkflowConnectorDescriptors(),
        searchRoutingSettings,
        permissionMode: thread.permissionMode,
        permissionAuditThreadId: workflowThread.chatThreadId ?? thread.id,
        workspacePath: projectPath,
        provider: createWorkflowDiscoveryProvider(providerStatus, targetStore),
        onProgress: (progress: any) => emitWorkflowEvent({ type: "workflow-discovery-progress", progress }, projectPath),
      });
    },
  });

  registerWorkflowAgentDiscoveryAccessIpc<any, any>({
    handleIpc,
    workflowAgentIpcContextForDiscoveryQuestion,
    connectorDescriptors: firstPartyWorkflowConnectorDescriptors,
    resolveWorkflowDiscoveryAccessRequest,
    emitPermissionGrantCreated,
    emitWorkflowUpdated,
  });

  registerWorkflowAgentCapabilityIpc({
    handleIpc,
    workflowAgentIpcContextForWorkflowThread,
    workflowProjectIpcContext,
    workflowDiscoveryPolicyContextForCapabilityLookup,
    searchWorkflowDiscoveryCapabilities,
    describeWorkflowDiscoveryCapability,
  });

  registerWorkflowAgentNativeToolIpc<any, any>({
    handleIpc,
    workflowAgentIpcContextForWorkflowThread,
    workflowProjectIpcContext,
    invokeWorkflowNativeTool: async (activeContext: any, input: any) => {
      const workflowContext = "workflowThread" in activeContext ? activeContext : undefined;
      const { targetStore, targetBrowserService, projectPath } = activeContext;
      const thread = workflowContext
        ? workflowAgentControlThread(targetStore, activeContext.thread, workflowContext.workflowThread, projectPath)
        : { ...activeContext.thread, workspacePath: projectPath };
      return invokeWorkflowNativeTool(
        {
          store: targetStore,
          workspacePath: projectPath,
          permissionMode: thread.permissionMode,
          defaultWorkflowThreadId: workflowContext?.workflowThread.id,
          runWorkflowArtifact: async (runInput: any) => {
            const artifact = targetStore.getWorkflowArtifact(runInput.artifactId);
            const artifactWorkflowThread = artifact.workflowThreadId
              ? targetStore.getWorkflowAgentThreadSummary(artifact.workflowThreadId)
              : workflowContext?.workflowThread;
            const artifactWorkspacePath = normalizeWorkspacePath(artifactWorkflowThread?.projectPath || projectPath);
            const artifactThread = artifactWorkflowThread
              ? workflowAgentControlThread(targetStore, thread, artifactWorkflowThread, artifactWorkspacePath)
              : { ...thread, workspacePath: artifactWorkspacePath };
            const provider = getAmbientProviderStatus(artifactThread.model);
            const abortController = new AbortController();
            const pluginRegistrations = await pluginMcpRegistrationsForThread(artifactThread, targetStore);
            const pluginRegistry = await pluginHost.listRegistry(artifactWorkspacePath, pluginStateReaderForStore(targetStore));
            try {
              return await runWorkflowArtifact({
                store: targetStore,
                artifactId: runInput.artifactId,
                workspacePath: artifactWorkspacePath,
                permissionMode: artifactThread.permissionMode,
                browser: targetBrowserService,
                requestPermission: async (request: any) =>
                  (
                    await requestPermissionWithGrantRegistry(request, {
                      thread: artifactThread,
                      permissionMode: artifactThread.permissionMode,
                      workspacePath: artifactWorkspacePath,
                      workflowThreadId: artifact.workflowThreadId,
                      store: targetStore,
                    })
                  ).allowed,
                pluginRegistrations,
                pluginRegistry,
                ensurePluginTrusted: (registration: any) => ensureWorkflowPluginTrusted(artifactThread, registration, targetStore),
                pluginCaller: (plan: any, invocation: any, options: any) => pluginHost.callCodexPluginMcpTool(plan, invocation, options),
                connectorRegistrations: firstPartyWorkflowConnectorRegistrations(),
                connectorAccountAuthorizer: firstPartyWorkflowConnectorAccountAuthorizer(),
                model: artifactThread.model,
                baseUrl: provider.baseUrl,
                mode: runInput.mode,
                runtime: runInput.runtime,
                runLimits: runInput.runLimits,
                abortSignal: abortController.signal,
                onRunStarted: (runId: string) => {
                  rememberActiveWorkflowRun(runId, abortController, artifactWorkspacePath);
                  mainWindow?.webContents.send("desktop:event", {
                    type: "workflow-run-started",
                    runId,
                    artifactId: artifact.id,
                    workflowThreadId: artifact.workflowThreadId,
                    workspacePath: artifactWorkspacePath,
                  } satisfies DesktopEvent);
                  emitWorkflowUpdated(artifactWorkspacePath);
                },
                onEvent: () => emitWorkflowUpdated(artifactWorkspacePath),
              });
            } finally {
              forgetActiveWorkflowRunsForController(abortController);
            }
          },
          connectorDescriptors: () => firstPartyWorkflowConnectorDescriptors(),
          pluginRegistrationsForWorkspace: (workspacePath: string) =>
            pluginMcpRegistrationsForThread({ ...thread, workspacePath }, targetStore),
          searchRoutingSettings,
        },
        input,
      );
    },
  });

  registerWorkflowAgentTraceIpc<any, any>({
    handleIpc,
    requireProjectRuntimeHostForWorkflowThread,
  });

  registerWorkflowAgentExplorationIpc<any, any>({
    handleIpc,
    workflowAgentIpcContextForWorkflowThread,
    runWorkflowThreadExploration: async ({ targetStore, targetBrowserService, thread, workflowThread, projectPath }: any, input: any) => {
      const workflowWorkspacePath = projectPath;
      const workflowThreadContext = workflowAgentControlThread(targetStore, thread, workflowThread, workflowWorkspacePath);
      const providerStatus = getAmbientProviderStatus(workflowThreadContext.model);
      const pluginRegistrations = await pluginMcpRegistrationsForThread(workflowThreadContext, targetStore);
      const pluginRegistry = await pluginHost.listRegistry(workflowWorkspacePath, pluginStateReaderForStore(targetStore));
      return runWorkflowThreadExploration({
        store: targetStore,
        workflowThreadId: input.workflowThreadId,
        toolDescriptors: workflowToolDescriptorsFromPluginRegistry(pluginRegistry, pluginRegistrations),
        connectorDescriptors: firstPartyWorkflowConnectorDescriptors(),
        connectorRegistrations: [workspaceInventoryConnector(workflowWorkspacePath), ...firstPartyWorkflowConnectorRegistrations()],
        connectorAccountAuthorizer: firstPartyWorkflowConnectorAccountAuthorizer(),
        pluginRegistrations,
        ambientCliCapabilities: await ambientCliCapabilityGrantsForWorkflowRequest(workflowWorkspacePath, workflowThread.initialRequest),
        workspacePath: workflowWorkspacePath,
        permissionMode: workflowThreadContext.permissionMode,
        model: providerStatus.model,
        baseUrl: providerStatus.baseUrl,
        retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
        browser: targetBrowserService,
        requestPermission: async (request: any) =>
          (
            await requestPermissionWithGrantRegistry(request, {
              thread: workflowThreadContext,
              permissionMode: workflowThreadContext.permissionMode,
              workspacePath: workflowWorkspacePath,
              workflowThreadId: input.workflowThreadId,
              store: targetStore,
            })
          ).allowed,
        ensurePluginTrusted: (registration: any) => ensureWorkflowPluginTrusted(workflowThreadContext, registration, targetStore),
        pluginCaller: (plan: any, invocation: any, options: any) => pluginHost.callCodexPluginMcpTool(plan, invocation, options),
        provider: new AmbientWorkflowExplorationProvider({
          apiKey: readAmbientApiKey(),
          baseUrl: providerStatus.baseUrl,
          retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
        }),
        onProgress: (progress: any) =>
          emitWorkflowEvent({ type: "workflow-exploration-progress", progress }, workflowWorkspacePath),
        budgets: {
          maxModelTurns: input.maxModelTurns,
          maxToolCalls: input.maxToolCalls,
          maxConnectorCalls: input.maxConnectorCalls,
          maxAmbientCalls: input.maxAmbientCalls,
          maxElapsedMs: input.maxElapsedMs,
        },
      });
    },
    emitWorkflowUpdated,
  });

  registerWorkflowAgentRevisionIpc<any, any>({
    handleIpc,
    requireProjectRuntimeHostForWorkflowThread,
    requireProjectRuntimeHostForWorkflowVersion,
    requireProjectRuntimeHostForWorkflowRevision,
    restoreWorkflowVersion: (host: any, input: any) =>
      restoreWorkflowVersion(host.store, input, {
        connectorDescriptors: firstPartyWorkflowConnectorDescriptors(),
      }),
    emitWorkflowUpdated,
    recordWorkflowRevisionDecisionInChat,
  });

  registerAutomationsListSchedulesIpc({
    handleIpc,
    listAutomationSchedules: () => requireActiveProjectRuntimeHost().store.listAutomationSchedules(),
  });

  registerAutomationsCreateScheduleIpc({
    handleIpc,
    createAutomationSchedule: (input) => {
      const host = requireProjectRuntimeHostForAutomationScheduleTarget(input);
      return host.store.createAutomationSchedule(input);
    },
  });

  registerAutomationsUpdateScheduleIpc({
    handleIpc,
    updateAutomationSchedule: (input) => {
      const host = requireProjectRuntimeHostForAutomationSchedule(input.id);
      return host.store.updateAutomationSchedule(input);
    },
  });

  registerAutomationsListScheduleExceptionsIpc({
    handleIpc,
    listAutomationScheduleExceptions: (input) => {
      const host = input.scheduleId
        ? requireProjectRuntimeHostForAutomationSchedule(input.scheduleId)
        : requireActiveProjectRuntimeHost();
      return host.store.listAutomationScheduleExceptions(input);
    },
  });

  registerAutomationsSkipScheduleOccurrenceIpc({
    handleIpc,
    skipAutomationScheduleOccurrence: (input) => {
      const host = requireProjectRuntimeHostForAutomationSchedule(input.scheduleId);
      return host.store.skipAutomationScheduleOccurrence(input);
    },
  });

  registerAutomationsRescheduleScheduleOccurrenceIpc({
    handleIpc,
    rescheduleAutomationScheduleOccurrence: (input) => {
      const host = requireProjectRuntimeHostForAutomationSchedule(input.scheduleId);
      return host.store.rescheduleAutomationScheduleOccurrence(input);
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
    listPluginRegistry: (projectPath: string, targetStore: any) => pluginHost.listRegistry(projectPath, pluginStateReaderForStore(targetStore)),
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
    listPluginRegistry: (projectPath: string, targetStore: any) => pluginHost.listRegistry(projectPath, pluginStateReaderForStore(targetStore)),
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
    listPluginRegistry: (projectPath: string, targetStore: any) => pluginHost.listRegistry(projectPath, pluginStateReaderForStore(targetStore)),
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
    listPluginRegistry: (projectPath: string, targetStore: any) => pluginHost.listRegistry(projectPath, pluginStateReaderForStore(targetStore)),
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
