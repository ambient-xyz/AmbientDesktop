import type { IpcMain } from "electron";

import type { DesktopEvent } from "../../shared/desktopTypes";
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
} from "./registerWorkflowIpc";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;

export interface RegisterWorkflowAutomationAgentIpcDependencies extends Record<string, any> {
  handleIpc: HandleIpc;
}

export function registerWorkflowAutomationAgentIpc(deps: RegisterWorkflowAutomationAgentIpcDependencies): void {
  registerWorkflowAutomationAgentThreadDomainIpc(deps);
  registerWorkflowAutomationAgentDiscoveryDomainIpc(deps);
  registerWorkflowAutomationAgentRuntimeDomainIpc(deps);
  registerWorkflowAutomationAgentRevisionDomainIpc(deps);
}

function registerWorkflowAutomationAgentThreadDomainIpc(deps: RegisterWorkflowAutomationAgentIpcDependencies): void {
  const {
    handleIpc,
    listGlobalWorkflowAgentFolders,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForWorkflowThread,
    workflowProjectIpcContext,
  } = deps;

  registerWorkflowAgentThreadIpc<any, any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForWorkflowThread,
    workflowProjectIpcContext,
    listGlobalWorkflowAgentFolders,
  });
}

function registerWorkflowAutomationAgentDiscoveryDomainIpc(deps: RegisterWorkflowAutomationAgentIpcDependencies): void {
  const {
    answerWorkflowDiscoveryQuestion,
    createWorkflowDiscoveryProvider,
    describeWorkflowDiscoveryCapability,
    emitPermissionGrantCreated,
    emitWorkflowEvent,
    emitWorkflowUpdated,
    firstPartyWorkflowConnectorDescriptors,
    getAmbientProviderStatus,
    handleIpc,
    pluginMcpRegistrationsForThread,
    resolveWorkflowDiscoveryAccessRequest,
    searchRoutingSettings,
    searchWorkflowDiscoveryCapabilities,
    startWorkflowDiscovery,
    startWorkflowRevisionDiscovery,
    workflowAgentIpcContextForDiscoveryQuestion,
    workflowAgentIpcContextForWorkflowThread,
    workflowDiscoveryPolicyContextForCapabilityLookup,
    workflowProjectIpcContext,
  } = deps;

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
}

function registerWorkflowAutomationAgentRuntimeDomainIpc(deps: RegisterWorkflowAutomationAgentIpcDependencies): void {
  const {
    AmbientWorkflowExplorationProvider,
    ambientCliCapabilityGrantsForWorkflowRequest,
    ambientRetryPolicyFromCurrentSettings,
    emitWorkflowEvent,
    emitWorkflowUpdated,
    ensureWorkflowPluginTrusted,
    firstPartyWorkflowConnectorAccountAuthorizer,
    firstPartyWorkflowConnectorDescriptors,
    firstPartyWorkflowConnectorRegistrations,
    forgetActiveWorkflowRunsForController,
    getAmbientProviderStatus,
    handleIpc,
    invokeWorkflowNativeTool,
    mainWindow,
    normalizeWorkspacePath,
    pluginHost,
    pluginMcpRegistrationsForThread,
    pluginStateReaderForStore,
    readAmbientApiKey,
    rememberActiveWorkflowRun,
    requestPermissionWithGrantRegistry,
    requireProjectRuntimeHostForWorkflowThread,
    runWorkflowArtifact,
    runWorkflowThreadExploration,
    searchRoutingSettings,
    workflowAgentControlThread,
    workflowAgentIpcContextForWorkflowThread,
    workflowProjectIpcContext,
    workflowToolDescriptorsFromPluginRegistry,
    workspaceInventoryConnector,
  } = deps;

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
        onProgress: (progress: any) => emitWorkflowEvent({ type: "workflow-exploration-progress", progress }, workflowWorkspacePath),
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
}

function registerWorkflowAutomationAgentRevisionDomainIpc(deps: RegisterWorkflowAutomationAgentIpcDependencies): void {
  const {
    emitWorkflowUpdated,
    firstPartyWorkflowConnectorDescriptors,
    handleIpc,
    recordWorkflowRevisionDecisionInChat,
    requireProjectRuntimeHostForWorkflowRevision,
    requireProjectRuntimeHostForWorkflowThread,
    requireProjectRuntimeHostForWorkflowVersion,
    restoreWorkflowVersion,
  } = deps;

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
}
