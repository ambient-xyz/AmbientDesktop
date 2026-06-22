import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type {
  LocalDeepResearchSettings,
  LocalDeepResearchSmokeResult,
  LocalDeepResearchValidationResult,
  LocalModelResourcePolicyDecision,
} from "../../shared/localRuntimeTypes";
import type {
  PermissionPromptResolution,
  PermissionRequest,
} from "../../shared/permissionTypes";
import type {
  SearchRoutingSettings,
} from "../../shared/webResearchTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { discoverAmbientCliPackages } from "./agentRuntimeAmbientCliFacade";
import { firstPartyPluginPermissionGrantHash, type ResolveFirstPartyPluginPermissionInput } from "./agentRuntimeFirstPartyPluginPermission";
import {
  buildLocalDeepResearchSetupContract,
  createAgentRuntimeLocalDeepResearchToolExtension,
  detectLocalDeepResearchManagedAssets,
  formatLocalDeepResearchBytes,
  localDeepResearchInstallJobWarnings,
  localDeepResearchRequestedLaunchFromContract,
  reconcileLocalDeepResearchInstallJob,
  type LocalDeepResearchInstallRequest,
  type LocalDeepResearchInstallServiceResult,
  type LocalDeepResearchManagedAssetDetection,
  type LocalDeepResearchModelProfileId,
  type LocalDeepResearchRunRequest,
  type LocalDeepResearchRunServiceResult,
  type LocalDeepResearchSetupContract,
  type LocalDeepResearchSetupInput,
  type LocalDeepResearchSmokeRequest,
} from "./agentRuntimeLocalDeepResearchFacade";
import { detectLocalLlamaResidentProcesses, type LocalLlamaResidentProcess } from "./agentRuntimeLocalLlamaFacade";
import type { AgentRuntimeProviderRuntimeController } from "./agentRuntimeProviderRuntimeController";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { webResearchSettingsWithDynamicProviderCatalogs } from "./agentRuntimeWebResearchFacade";
import type {
  AgentRuntimeLocalDeepResearchWebBrokerInput,
  AgentRuntimeWebResearchController,
} from "./agentRuntimeWebResearchController";
import type {
  RuntimePermissionWaitFinish,
  RuntimePermissionWaitStart,
} from "./runtimePermissionWaitController";

type AgentRuntimeLocalDeepResearchStore = Pick<ProjectStore, "getThread" | "getWorkspace">;
type AgentRuntimeLocalDeepResearchProviderRuntime = Pick<AgentRuntimeProviderRuntimeController, "readLocalModelRuntimeLifecycleStatus">;
type AgentRuntimeLocalDeepResearchWebResearch = Pick<
  AgentRuntimeWebResearchController,
  "createLocalDeepResearchWebBroker" | "discoverWebResearchMcpProviderTools"
>;

export interface AgentRuntimeLocalDeepResearchFeatures {
  localDeepResearch?: {
    readSettings?: () => LocalDeepResearchSettings;
    updateSettings?: (input: LocalDeepResearchSettings) => Promise<LocalDeepResearchSettings> | LocalDeepResearchSettings;
    buildSetupContract?: (workspacePath: string, input: LocalDeepResearchSetupInput) => Promise<LocalDeepResearchSetupContract> | LocalDeepResearchSetupContract;
    install?: (input: LocalDeepResearchInstallRequest) => Promise<LocalDeepResearchInstallServiceResult> | LocalDeepResearchInstallServiceResult;
    smoke?: (input: LocalDeepResearchSmokeRequest) => Promise<LocalDeepResearchSmokeResult> | LocalDeepResearchSmokeResult;
    validate?: (input: {
      workspacePath: string;
      setup: LocalDeepResearchSetupContract;
      managedAssets: LocalDeepResearchManagedAssetDetection;
    }) => Promise<LocalDeepResearchValidationResult> | LocalDeepResearchValidationResult;
    run?: (input: LocalDeepResearchRunRequest) => Promise<LocalDeepResearchRunServiceResult> | LocalDeepResearchRunServiceResult;
  };
  localModelResidentProcesses?: (workspacePath: string) => Promise<LocalLlamaResidentProcess[]> | LocalLlamaResidentProcess[];
  search?: {
    readSettings?: () => SearchRoutingSettings;
  };
}

export interface AgentRuntimeLocalDeepResearchControllerDependencies {
  detectManagedAssets: typeof detectLocalDeepResearchManagedAssets;
  detectResidentProcesses: typeof detectLocalLlamaResidentProcesses;
  discoverAmbientCliPackages: typeof discoverAmbientCliPackages;
  reconcileInstallJob: typeof reconcileLocalDeepResearchInstallJob;
}

export interface AgentRuntimeLocalDeepResearchControllerOptions {
  store: AgentRuntimeLocalDeepResearchStore;
  features: AgentRuntimeLocalDeepResearchFeatures;
  providerRuntime: AgentRuntimeLocalDeepResearchProviderRuntime;
  webResearch: AgentRuntimeLocalDeepResearchWebResearch;
  permissions: {
    request: (
      request: Omit<PermissionRequest, "id">,
      options?: { onRequest?: (request: PermissionRequest) => void },
    ) => Promise<PermissionPromptResolution>;
  };
  beginPermissionWait: (
    threadId: string,
    input: RuntimePermissionWaitStart,
  ) => ((finish?: RuntimePermissionWaitFinish) => void) | undefined;
  resolveFirstPartyPluginPermission: (input: ResolveFirstPartyPluginPermissionInput) => Promise<boolean>;
  emit: (event: DesktopEvent) => void;
  dependencies?: Partial<AgentRuntimeLocalDeepResearchControllerDependencies>;
}

const defaultDependencies: AgentRuntimeLocalDeepResearchControllerDependencies = {
  detectManagedAssets: detectLocalDeepResearchManagedAssets,
  detectResidentProcesses: detectLocalLlamaResidentProcesses,
  discoverAmbientCliPackages,
  reconcileInstallJob: reconcileLocalDeepResearchInstallJob,
};

export class AgentRuntimeLocalDeepResearchController {
  private readonly dependencies: AgentRuntimeLocalDeepResearchControllerDependencies;

  constructor(private readonly options: AgentRuntimeLocalDeepResearchControllerOptions) {
    this.dependencies = {
      ...defaultDependencies,
      ...options.dependencies,
    };
  }

  createToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return createAgentRuntimeLocalDeepResearchToolExtension({
      threadId,
      workspace,
      getThread: (id) => this.options.store.getThread(id),
      readSettings: () => this.options.features.localDeepResearch?.readSettings?.(),
      updateSettings: this.options.features.localDeepResearch?.updateSettings
        ? (input) => this.options.features.localDeepResearch!.updateSettings!(input)
        : undefined,
      resolveFirstPartyPluginPermission: (input) => this.options.resolveFirstPartyPluginPermission(input),
      readReadiness: (workspace, input, signal) => this.readReadiness(workspace, input, signal),
      emit: (event) => this.options.emit(event),
      install: this.options.features.localDeepResearch?.install,
      validate: this.options.features.localDeepResearch?.validate,
      smoke: this.options.features.localDeepResearch?.smoke,
      createBroker: (input) => this.createWebBroker(input),
      run: this.options.features.localDeepResearch?.run,
      approveResourceLimitExceed: (decision) => this.approveResourceLimitExceed({ threadId, workspace, decision }),
    });
  }

  async readReadiness(
    workspace: WorkspaceState,
    input: LocalDeepResearchSetupInput,
    signal?: AbortSignal,
  ): Promise<{ contract: LocalDeepResearchSetupContract; managedAssets: LocalDeepResearchManagedAssetDetection }> {
    const baseSettings = this.options.features.search?.readSettings?.() ?? {};
    const catalog = await this.dependencies.discoverAmbientCliPackages(workspace.path, { includeHealth: true }).catch(() => ({ packages: [], errors: [] }));
    const mcpTools = await this.options.webResearch.discoverWebResearchMcpProviderTools(workspace, signal);
    const searchSettings = webResearchSettingsWithDynamicProviderCatalogs(baseSettings, { ambientCliCatalog: catalog, mcpTools });
    const residentProcesses = await Promise.resolve(
      this.options.features.localModelResidentProcesses
        ? this.options.features.localModelResidentProcesses(workspace.path)
        : this.dependencies.detectResidentProcesses(workspace.path),
    ).catch(() => []);
    const machineFacts = {
      ...input.machineFacts,
      activeLocalModelCount: residentProcesses.length,
      activeLocalModelEstimatedResidentMemoryBytes: residentProcesses.reduce((sum, resident) => sum + Math.max(0, resident.estimatedResidentMemoryBytes ?? 0), 0),
    };
    const localDeepResearchSettings = this.options.features.localDeepResearch?.readSettings?.();
    const preliminaryContract = buildLocalDeepResearchSetupContract({
      ...input,
      localDeepResearchSettings,
      machineFacts,
      searchSettings,
    });
    const managedAssets = await this.dependencies.detectManagedAssets(workspace.path, {
      selectedProfileId: preliminaryContract.modelInstall.selectedProfileId as LocalDeepResearchModelProfileId,
    });
    const installJob = await this.dependencies.reconcileInstallJob(workspace.path).catch(() => undefined);
    const localRuntimeStatus = await this.options.providerRuntime.readLocalModelRuntimeLifecycleStatus(
      workspace.path,
      localDeepResearchRequestedLaunchFromContract(preliminaryContract),
      { residentProcesses },
    );
    const localModelResources = localRuntimeStatus.registry;
    const setupInput: LocalDeepResearchSetupInput = {
      ...input,
      localDeepResearchSettings,
      machineFacts,
      searchSettings,
      localModelResources,
      localRuntimeInventory: localRuntimeStatus.inventory,
      modelInstallState: managedAssets.model.status === "present" ? "installed" : "missing",
      runtimeInstalled: managedAssets.runtime.status === "present",
      ...(managedAssets.runtime.artifactId ? { runtimeArtifactId: managedAssets.runtime.artifactId } : {}),
      ...(managedAssets.runtime.status === "present" && managedAssets.runtime.binaryPath ? { runtimeBinaryPath: managedAssets.runtime.binaryPath } : {}),
      assetWarnings: [
        ...managedAssets.warnings,
        ...localDeepResearchInstallJobWarnings(installJob),
      ],
    };
    const contract = await (
      this.options.features.localDeepResearch?.buildSetupContract
        ? this.options.features.localDeepResearch.buildSetupContract(workspace.path, setupInput)
        : buildLocalDeepResearchSetupContract(setupInput)
    );
    return { contract, managedAssets };
  }

  createWebBroker(input: AgentRuntimeLocalDeepResearchWebBrokerInput) {
    return this.options.webResearch.createLocalDeepResearchWebBroker(input);
  }

  async approveResourceLimitExceed(input: {
    threadId: string;
    workspace: WorkspaceState;
    decision: LocalModelResourcePolicyDecision;
  }): Promise<boolean> {
    const overBy = input.decision.exceededByBytes !== undefined
      ? `Exceeds ceiling by ${formatLocalDeepResearchBytes(input.decision.exceededByBytes)}.`
      : "Exceeds the configured ceiling.";
    const detail = [
      overBy,
      `Ceiling: ${input.decision.maxResidentMemoryBytes !== undefined ? formatLocalDeepResearchBytes(input.decision.maxResidentMemoryBytes) : "not configured"}.`,
      `Active estimate: ${formatLocalDeepResearchBytes(input.decision.activeEstimatedResidentMemoryBytes)}.`,
      `Requested estimate: ${input.decision.requestedEstimatedResidentMemoryBytes !== undefined ? formatLocalDeepResearchBytes(input.decision.requestedEstimatedResidentMemoryBytes) : "unknown"}.`,
      `Projected estimate: ${formatLocalDeepResearchBytes(input.decision.projectedEstimatedResidentMemoryBytes)}.`,
      input.decision.activeActualResidentMemoryBytes !== undefined
        ? `Actual sampled resident memory: ${formatLocalDeepResearchBytes(input.decision.activeActualResidentMemoryBytes)}.`
        : undefined,
    ].filter((line): line is string => Boolean(line)).join("\n");
    let finishPermissionWait: ((finish?: RuntimePermissionWaitFinish) => void) | undefined;
    try {
      const response = await this.options.permissions.request({
        threadId: input.threadId,
        workspacePath: input.workspace.path,
        projectPath: this.options.store.getWorkspace().path,
        toolName: "ambient_local_deep_research_run",
        title: "Exceed local model memory ceiling?",
        message: "A Local Deep Research llama.cpp launch would exceed the configured local-model resident-memory ceiling.",
        detail,
        risk: "plugin-tool",
        reusableScopes: ["thread"],
        grantActionKind: "plugin_tool_execute",
        grantTargetKind: "risk",
        grantTargetLabel: "local-model-memory-ceiling",
        grantTargetHash: firstPartyPluginPermissionGrantHash("local-model-memory-ceiling"),
      }, {
        onRequest: (createdRequest) => {
          finishPermissionWait = this.options.beginPermissionWait(input.threadId, {
            toolName: "ambient_local_deep_research_run",
            requestId: createdRequest.id,
            title: createdRequest.title,
            detail: createdRequest.detail,
            risk: createdRequest.risk,
          });
        },
      });
      finishPermissionWait?.({ allowed: response.allowed, mode: response.mode });
      return response.allowed;
    } catch (error) {
      finishPermissionWait?.({ error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
}
