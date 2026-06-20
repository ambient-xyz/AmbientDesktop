import type { AmbientPermissionGrant, PermissionMode, PermissionRequest } from "../../shared/permissionTypes";
import type { SearchRoutingSettings } from "../../shared/webResearchTypes";
import { AmbientWorkflowDiscoveryProvider } from "./workflowDiscoveryProvider";
import type { AmbientRetryPolicy } from "./workflowDiscoveryAmbientFacade";
import {
  buildWorkflowDiscoveryPolicyContext,
  type WorkflowDiscoveryPolicyContext,
  type WorkflowDiscoveryPolicyInput,
} from "./workflowDiscoveryPolicy";
import type { PluginMcpToolRegistration } from "./workflowDiscoveryPluginsFacade";
import type { WorkflowConnectorDescriptor } from "./workflowDiscoveryWorkflowFacade";

type WorkflowDiscoveryProviderInput = ConstructorParameters<typeof AmbientWorkflowDiscoveryProvider>[0];

interface WorkflowDiscoveryModelRuntimeSettings {
  aggressiveRetries?: boolean;
}

interface WorkflowDiscoveryWorkspace {
  path: string;
}

interface WorkflowDiscoveryThread {
  id: string;
  workspacePath?: string;
  permissionMode?: PermissionMode;
}

interface WorkflowDiscoveryWorkflowThread {
  projectPath?: string;
}

export interface WorkflowDiscoveryDesktopStore<
  ModelRuntimeSettings extends WorkflowDiscoveryModelRuntimeSettings = WorkflowDiscoveryModelRuntimeSettings,
> {
  getModelRuntimeSettings(): ModelRuntimeSettings;
  getWorkflowAgentThreadSummary(workflowThreadId: string): WorkflowDiscoveryWorkflowThread | undefined;
  getWorkspace(): WorkflowDiscoveryWorkspace;
  listPermissionGrants(): AmbientPermissionGrant[];
  isPluginTrusted(pluginId: string, pluginFingerprint?: string): boolean;
  setPluginTrusted(pluginId: string, trusted: boolean, pluginFingerprint?: string): void;
}

export interface WorkflowDiscoveryDesktopContext<
  Store extends WorkflowDiscoveryDesktopStore = WorkflowDiscoveryDesktopStore,
  Thread extends WorkflowDiscoveryThread = WorkflowDiscoveryThread,
> {
  targetStore: Store;
  thread: Thread;
}

export interface WorkflowDiscoveryDesktopProviderStatus {
  baseUrl?: string;
  model: string;
}

export interface WorkflowDiscoveryDesktopServiceDependencies<
  Store extends WorkflowDiscoveryDesktopStore<ModelRuntimeSettings>,
  Thread extends WorkflowDiscoveryThread,
  ModelRuntimeSettings extends WorkflowDiscoveryModelRuntimeSettings,
  Provider = AmbientWorkflowDiscoveryProvider,
> {
  defaultStore(): Store;
  defaultContext(): WorkflowDiscoveryDesktopContext<Store, Thread>;
  readAmbientApiKey(): string | undefined;
  retryPolicyFromSettings(input: { modelRuntime: ModelRuntimeSettings }): AmbientRetryPolicy;
  pluginMcpRegistrationsForThread(thread: Thread & { workspacePath: string }, store: Store): Promise<PluginMcpToolRegistration[]>;
  connectorDescriptors(): WorkflowConnectorDescriptor[];
  searchRoutingSettings(): SearchRoutingSettings;
  requestPermission(request: Omit<PermissionRequest, "id">): Promise<{ allowed: boolean }>;
  buildPolicyContext?(input: WorkflowDiscoveryPolicyInput): WorkflowDiscoveryPolicyContext;
  createProvider?(input: WorkflowDiscoveryProviderInput): Provider;
}

export function createWorkflowDiscoveryDesktopService<
  Store extends WorkflowDiscoveryDesktopStore<ModelRuntimeSettings>,
  Thread extends WorkflowDiscoveryThread,
  ModelRuntimeSettings extends WorkflowDiscoveryModelRuntimeSettings = ReturnType<Store["getModelRuntimeSettings"]>,
  Provider = AmbientWorkflowDiscoveryProvider,
>(
  dependencies: WorkflowDiscoveryDesktopServiceDependencies<Store, Thread, ModelRuntimeSettings, Provider>,
) {
  function ambientRetryPolicyFromCurrentSettings(targetStore: Store = dependencies.defaultStore()): AmbientRetryPolicy | undefined {
    const modelRuntimeSettings = targetStore.getModelRuntimeSettings();
    return modelRuntimeSettings.aggressiveRetries
      ? dependencies.retryPolicyFromSettings({ modelRuntime: modelRuntimeSettings })
      : undefined;
  }

  function createWorkflowDiscoveryProvider(
    providerStatus: WorkflowDiscoveryDesktopProviderStatus,
    targetStore: Store = dependencies.defaultStore(),
  ): Provider {
    const createProvider = dependencies.createProvider ?? ((input: WorkflowDiscoveryProviderInput) =>
      new AmbientWorkflowDiscoveryProvider(input) as Provider);
    return createProvider({
      apiKey: dependencies.readAmbientApiKey(),
      baseUrl: providerStatus.baseUrl,
      model: providerStatus.model,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
    });
  }

  async function workflowDiscoveryPolicyContextForCapabilityLookup(
    input: {
      workflowThreadId?: string;
      projectPath?: string;
    },
    context: WorkflowDiscoveryDesktopContext<Store, Thread> = dependencies.defaultContext(),
  ): Promise<WorkflowDiscoveryPolicyContext> {
    const targetStore = context.targetStore;
    const thread = context.thread;
    const workflowThread = input.workflowThreadId
      ? targetStore.getWorkflowAgentThreadSummary(input.workflowThreadId)
      : undefined;
    const projectPath = input.projectPath ?? workflowThread?.projectPath ?? thread.workspacePath ?? targetStore.getWorkspace().path;
    const pluginThread = { ...thread, workspacePath: projectPath };
    const pluginRegistrations = await dependencies.pluginMcpRegistrationsForThread(pluginThread, targetStore);
    const buildPolicyContext = dependencies.buildPolicyContext ?? buildWorkflowDiscoveryPolicyContext;
    return buildPolicyContext({
      projectPath,
      workspacePath: thread.workspacePath,
      permissionMode: thread.permissionMode,
      stage: "initial_discovery",
      workflowThreadId: input.workflowThreadId,
      threadId: thread.id,
      grants: targetStore.listPermissionGrants(),
      connectorDescriptors: dependencies.connectorDescriptors(),
      pluginRegistrations,
      searchRoutingSettings: dependencies.searchRoutingSettings(),
    });
  }

  async function ensureWorkflowPluginTrusted(
    thread: Thread,
    registration: PluginMcpToolRegistration,
    targetStore: Store = dependencies.defaultStore(),
  ): Promise<boolean> {
    if (targetStore.isPluginTrusted(registration.tool.pluginId, registration.launchPlan.pluginFingerprint)) return true;
    const response = await dependencies.requestPermission({
      threadId: thread.id,
      toolName: registration.registeredName,
      title: `Trust Codex plugin "${registration.tool.pluginName}"?`,
      message: "Ambient wants to run a local MCP tool from this plugin in a workflow. Trusting it allows future tool calls from this plugin without another first-use prompt.",
      detail: [
        `Workspace: ${thread.workspacePath}`,
        `Plugin: ${registration.tool.pluginName}`,
        `MCP server: ${registration.tool.serverName}`,
        `Tool: ${registration.originalName}`,
        `Registered as: ${registration.registeredName}`,
      ].join("\n"),
      risk: "plugin-tool",
    });
    const allowed = response.allowed;
    if (allowed) targetStore.setPluginTrusted(registration.tool.pluginId, true, registration.launchPlan.pluginFingerprint);
    return allowed;
  }

  return {
    ambientRetryPolicyFromCurrentSettings,
    createWorkflowDiscoveryProvider,
    ensureWorkflowPluginTrusted,
    workflowDiscoveryPolicyContextForCapabilityLookup,
  };
}
