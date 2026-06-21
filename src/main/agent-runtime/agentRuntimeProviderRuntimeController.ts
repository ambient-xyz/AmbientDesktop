import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { ProviderStatus, UpdateSttSettingsInput, UpdateVoiceSettingsInput } from "../../shared/desktopTypes";
import type {
  EmbeddingProviderCandidate,
  LocalDeepResearchSettings,
  LocalModelHostMemorySnapshot,
  LocalModelRuntimeLifecycleActionInput,
  LocalModelRuntimeLifecycleActionResult,
  SttProviderCandidate,
  SttSettings,
  VoiceProviderCandidate,
  VoiceSettings,
  VoiceSettingsAuditSource,
} from "../../shared/localRuntimeTypes";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceMediaUrlInput } from "../../shared/workspaceMedia";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { runAmbientCliPackageCommand } from "./agentRuntimeAmbientCliFacade";
import {
  AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
  AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
  installAmbientMemoryEmbeddingAssets,
  startAmbientMemoryEmbeddingRuntime,
  type AmbientTencentMemoryEmbeddingPrepareInput,
  type AmbientTencentMemoryEmbeddingPrepareResult,
  type AmbientTencentMemoryEmbeddingStartInput,
  type AmbientTencentMemoryEmbeddingStartResult,
} from "./agentRuntimeMemoryFacade";
import { getAmbientProviderStatus } from "./agentRuntimeProviderFacade";
import {
  agentRuntimeProviderDiscoveryOptions,
  listEmbeddingProvidersForTools as listAgentRuntimeEmbeddingProvidersForTools,
  listSttProvidersForTools as listAgentRuntimeSttProvidersForTools,
  listVoiceProvidersForTools as listAgentRuntimeVoiceProvidersForTools,
  listVoiceProvidersWithCachedVoices as listAgentRuntimeVoiceProvidersWithCachedVoices,
  voiceProviderWorkspacePathForCapabilityId as agentRuntimeVoiceProviderWorkspacePathForCapabilityId,
} from "./agentRuntimeProviderDiscovery";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { readAmbientApiKey } from "./agentRuntimeSecurityFacade";
import { createSttSettingsToolExtension, type AmbientCliSttRunner } from "./agentRuntimeSttFacade";
import {
  buildLocalModelRuntimeStatusSnapshot,
  createLocalRuntimeToolExtension,
  DEFAULT_LOCAL_RUNTIME_LEASE_STALE_MS,
  type LocalModelRuntimeManager,
  runAgentRuntimeLocalModelRuntimeLifecycleAction,
  type LocalModelRequestedLaunch,
  type LocalModelRuntimeRestartPlan,
  type LocalModelRuntimeStatusSnapshot,
  type LocalModelRuntimeStopPlan,
  type LocalRuntimeOwnershipResolutionRequest,
  type LocalRuntimeOwnershipResolutionResult,
} from "./agentRuntimeLocalRuntimeFacade";
import type { LocalLlamaResidentProcess } from "./agentRuntimeLocalLlamaFacade";
import {
  completeAgentRuntimeRegisteredVoiceProviderSetup,
  createVoiceSettingsToolExtension,
  dogfoodAgentRuntimeSelectedVoiceProvider,
  recordAgentRuntimeVoiceDispatch,
  type AmbientCliVoiceRunner,
} from "./agentRuntimeVoiceFacade";
import type { ResolveFirstPartyPluginPermissionInput } from "./agentRuntimeFirstPartyPluginPermission";

interface VoiceSettingsAuditContext {
  source: VoiceSettingsAuditSource;
  reason?: string;
}

interface AgentRuntimeProviderRuntimeFeatures {
  localModelHostMemory?: () => LocalModelHostMemorySnapshot;
  localModelResidentProcesses?: (workspacePath: string) => Promise<LocalLlamaResidentProcess[]> | LocalLlamaResidentProcess[];
  voice?: {
    readSettings: () => VoiceSettings;
    updateSettings?: (input: UpdateVoiceSettingsInput, audit?: VoiceSettingsAuditContext) => Promise<VoiceSettings> | VoiceSettings;
    listProviders?: (workspacePath: string) => Promise<VoiceProviderCandidate[]> | VoiceProviderCandidate[];
    testRunner?: AmbientCliVoiceRunner;
    onStateUpdated?: () => void;
    enforceArtifactBudget?: (workspacePath: string) => Promise<void> | void;
    createMediaUrl?: (input: WorkspaceMediaUrlInput) => string;
  };
  embeddings?: {
    listProviders?: (workspacePath: string) => Promise<EmbeddingProviderCandidate[]> | EmbeddingProviderCandidate[];
  };
  stt?: {
    readSettings: () => SttSettings;
    updateSettings?: (input: UpdateSttSettingsInput) => Promise<SttSettings> | SttSettings;
    listProviders?: (workspacePath: string) => Promise<SttProviderCandidate[]> | SttProviderCandidate[];
    testRunner?: AmbientCliSttRunner;
  };
  localDeepResearch?: {
    readSettings?: () => LocalDeepResearchSettings;
  };
}

export interface AgentRuntimeProviderRuntimeControllerOptions {
  store: ProjectStore;
  features: AgentRuntimeProviderRuntimeFeatures;
  localModelRuntimeManager: LocalModelRuntimeManager;
  resolveFirstPartyPluginPermission: (input: ResolveFirstPartyPluginPermissionInput) => Promise<boolean>;
  resolveLocalRuntimeOwnershipForForcedAction: (
    request: LocalRuntimeOwnershipResolutionRequest,
  ) => Promise<LocalRuntimeOwnershipResolutionResult>;
  resolveLocalRuntimeOwnershipForStopPlan: (
    plan: LocalModelRuntimeStopPlan,
  ) => Promise<LocalRuntimeOwnershipResolutionResult | undefined>;
  resolveLocalRuntimeOwnershipForRestartPlan: (
    plan: LocalModelRuntimeRestartPlan,
  ) => Promise<LocalRuntimeOwnershipResolutionResult | undefined>;
  getProviderStatus?: (model: string) => Pick<ProviderStatus, "baseUrl">;
}

export class AgentRuntimeProviderRuntimeController {
  constructor(private readonly options: AgentRuntimeProviderRuntimeControllerOptions) {}

  createVoiceSettingsToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return createVoiceSettingsToolExtension({
      threadId,
      workspace,
      getThread: (id) => this.options.store.getThread(id),
      listProviders: (workspacePath) => this.listVoiceProvidersForTools(workspacePath),
      voiceProviderWorkspacePathForCapabilityId: (providerCapabilityId) =>
        this.voiceProviderWorkspacePathForCapabilityId(providerCapabilityId),
      resolveFirstPartyPluginPermission: (input) => this.options.resolveFirstPartyPluginPermission(input),
      dogfoodSelectedVoiceProvider: (voiceThread, voiceWorkspace, settings, options) =>
        this.dogfoodSelectedVoiceProvider(voiceThread, voiceWorkspace, settings, options),
      voice: this.options.features.voice,
    });
  }

  createSttSettingsToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return createSttSettingsToolExtension({
      threadId,
      workspace,
      getThread: (id) => this.options.store.getThread(id),
      listProviders: (workspacePath) => this.listSttProvidersForTools(workspacePath),
      resolveFirstPartyPluginPermission: (input) => this.options.resolveFirstPartyPluginPermission(input),
      stt: this.options.features.stt,
    });
  }

  createLocalRuntimeToolExtension(workspace: WorkspaceState): ExtensionFactory {
    return createLocalRuntimeToolExtension({
      workspace,
      getLocalModelResourceSettings: () => this.options.features.localDeepResearch?.readSettings?.()?.localModelResources,
      getHostMemory: () => this.options.features.localModelHostMemory?.(),
      getActiveRuntimeLeases: () => this.options.localModelRuntimeManager.activeRuntimeLeases(),
      getVoiceProviders: () => this.listVoiceProvidersWithCachedVoices(workspace.path),
      getEmbeddingProviders: () => this.listEmbeddingProvidersForTools(workspace.path),
      startRuntime: (input) => this.options.localModelRuntimeManager.startRuntime(input),
      stopRuntime: (input) => this.options.localModelRuntimeManager.stopRuntime(input),
      restartRuntime: (input) => this.options.localModelRuntimeManager.restartRuntime(input),
      resolveLocalRuntimeOwnership: (request) => this.options.resolveLocalRuntimeOwnershipForForcedAction(request),
    });
  }

  listVoiceProvidersForTools(workspacePath: string): Promise<VoiceProviderCandidate[]> | VoiceProviderCandidate[] {
    return listAgentRuntimeVoiceProvidersForTools(this.providerDiscoveryOptions(), workspacePath);
  }

  voiceProviderWorkspacePathForCapabilityId(providerCapabilityId: string | undefined): Promise<string> {
    return agentRuntimeVoiceProviderWorkspacePathForCapabilityId(this.providerDiscoveryOptions(), providerCapabilityId);
  }

  listVoiceProvidersWithCachedVoices(workspacePath: string): Promise<VoiceProviderCandidate[]> {
    return listAgentRuntimeVoiceProvidersWithCachedVoices(this.providerDiscoveryOptions(), workspacePath);
  }

  listEmbeddingProvidersForTools(workspacePath: string): Promise<EmbeddingProviderCandidate[]> {
    return listAgentRuntimeEmbeddingProvidersForTools(this.providerDiscoveryOptions(), workspacePath);
  }

  async prepareEmbeddingProviderRuntimeForMemory(
    input: AmbientTencentMemoryEmbeddingPrepareInput,
    workspacePath: string,
  ): Promise<AmbientTencentMemoryEmbeddingPrepareResult> {
    if (
      input.provider.providerId !== AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID &&
      input.provider.capabilityId !== AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID &&
      input.runtimeId !== `embeddings:${AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID}`
    ) {
      return {
        status: "skipped",
        reason: `Embedding provider ${input.provider.providerId} is not managed by Agent Memory.`,
      };
    }
    const result = await installAmbientMemoryEmbeddingAssets({
      workspacePath,
      action: "repair",
    });
    const ready = result.managedAssets.model.status === "present" && result.managedAssets.runtime.status === "present";
    return {
      status: ready ? "ready" : result.status,
      reason: result.nextActions[0] ?? `Agent Memory embedding asset repair ${result.status}.`,
    };
  }

  async startEmbeddingProviderRuntimeForMemory(
    input: AmbientTencentMemoryEmbeddingStartInput,
    workspacePath: string,
  ): Promise<AmbientTencentMemoryEmbeddingStartResult> {
    if (
      input.provider.providerId === AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID ||
      input.runtimeId === `embeddings:${AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID}`
    ) {
      const result = await startAmbientMemoryEmbeddingRuntime({ workspacePath });
      return {
        status: result.status,
        reason: result.reason,
        ...(result.release ? { release: result.release } : {}),
      };
    }
    const result = await this.runLocalModelRuntimeLifecycleAction({
      action: "start",
      runtimeId: input.runtimeId,
    });
    return {
      status: result.status,
      reason: result.message,
    };
  }

  listSttProvidersForTools(workspacePath: string): Promise<SttProviderCandidate[]> {
    return listAgentRuntimeSttProvidersForTools(this.providerDiscoveryOptions(), workspacePath);
  }

  runLocalModelRuntimeLifecycleAction(
    input: LocalModelRuntimeLifecycleActionInput,
  ): Promise<LocalModelRuntimeLifecycleActionResult> {
    const workspace = this.options.store.getWorkspace();
    return runAgentRuntimeLocalModelRuntimeLifecycleAction({
      input,
      workspacePath: workspace.path,
      readStatus: (workspacePath, requestedLaunch) => this.readLocalModelRuntimeLifecycleStatus(workspacePath, requestedLaunch),
      startRuntime: (startInput) => this.options.localModelRuntimeManager.startRuntime(startInput),
      stopRuntime: (stopInput) => this.options.localModelRuntimeManager.stopRuntime(stopInput),
      restartRuntime: (restartInput) => this.options.localModelRuntimeManager.restartRuntime(restartInput),
      resolveOwnershipForStopPlan: (plan) => this.options.resolveLocalRuntimeOwnershipForStopPlan(plan),
      resolveOwnershipForRestartPlan: (plan) => this.options.resolveLocalRuntimeOwnershipForRestartPlan(plan),
    });
  }

  readLocalModelRuntimeStatus(workspacePath = this.options.store.getWorkspace().path): Promise<LocalModelRuntimeStatusSnapshot> {
    return this.readLocalModelRuntimeLifecycleStatus(workspacePath);
  }

  readLocalModelRuntimeLifecycleStatus(
    workspacePath: string,
    requestedLaunch?: LocalModelRequestedLaunch,
    options: { residentProcesses?: LocalLlamaResidentProcess[] } = {},
  ): Promise<LocalModelRuntimeStatusSnapshot> {
    return Promise.all([
      this.listVoiceProvidersWithCachedVoices(workspacePath).catch(() => []),
      this.listEmbeddingProvidersForTools(workspacePath).catch(() => []),
      options.residentProcesses
        ? Promise.resolve(options.residentProcesses)
        : (
          this.options.features.localModelResidentProcesses
            ? Promise.resolve(this.options.features.localModelResidentProcesses(workspacePath)).catch(() => [])
            : Promise.resolve(undefined)
        ),
    ]).then(([voiceProviders, embeddingProviders, residentProcesses]) => buildLocalModelRuntimeStatusSnapshot({
      workspacePath,
      settings: this.options.features.localDeepResearch?.readSettings?.()?.localModelResources,
      hostMemory: this.options.features.localModelHostMemory?.(),
      requestedLaunch,
      leases: this.options.localModelRuntimeManager.activeRuntimeLeases(),
      voiceProviders,
      embeddingProviders,
      ...(residentProcesses ? { residentProcesses } : {}),
      includeStopped: true,
      leaseStaleMs: DEFAULT_LOCAL_RUNTIME_LEASE_STALE_MS,
    }));
  }

  recordVoiceDispatch(message: ChatMessage): void {
    void recordAgentRuntimeVoiceDispatch(message, {
      readSettings: () => this.options.features.voice?.readSettings(),
      store: this.options.store,
      voiceProviderWorkspacePathForCapabilityId: (providerCapabilityId) =>
        this.voiceProviderWorkspacePathForCapabilityId(providerCapabilityId),
      getProviderStatus: (model) => this.options.getProviderStatus?.(model) ?? getAmbientProviderStatus(model),
      readAmbientApiKey,
      runner: this.options.features.voice?.testRunner ?? runAmbientCliPackageCommand,
      createMediaUrl: this.options.features.voice?.createMediaUrl,
      onStateUpdated: () => this.options.features.voice?.onStateUpdated?.(),
      enforceArtifactBudget: (workspacePath) => this.options.features.voice?.enforceArtifactBudget?.(workspacePath),
    });
  }

  completeRegisteredVoiceProviderSetup(
    thread: ThreadSummary,
    workspace: WorkspaceState,
    provider: {
      capabilityId: string;
      label: string;
      format: VoiceSettings["format"];
      voices: Array<{ id: string; label?: string }>;
    },
  ): Promise<{ text: string; details: Record<string, unknown> }> {
    const voice = this.options.features.voice;
    return completeAgentRuntimeRegisteredVoiceProviderSetup(thread, workspace, provider, {
      readSettings: () => voice?.readSettings(),
      updateSettings: voice?.updateSettings ? (input) => voice.updateSettings!(input) : undefined,
      dogfoodSelectedVoiceProvider: (voiceThread, voiceWorkspace, settings) =>
        this.dogfoodSelectedVoiceProvider(voiceThread, voiceWorkspace, settings),
    });
  }

  dogfoodSelectedVoiceProvider(
    thread: ThreadSummary,
    workspace: WorkspaceState,
    settings: VoiceSettings,
    options: { text?: string } = {},
  ): Promise<{ status: "succeeded"; audioPath?: string; mimeType?: string; durationMs?: number }> {
    return dogfoodAgentRuntimeSelectedVoiceProvider(thread, workspace, settings, {
      voiceProviderWorkspacePathForCapabilityId: (providerCapabilityId) =>
        this.voiceProviderWorkspacePathForCapabilityId(providerCapabilityId),
      runner: this.options.features.voice?.testRunner ?? runAmbientCliPackageCommand,
      createMediaUrl: this.options.features.voice?.createMediaUrl,
      enforceArtifactBudget: (workspacePath) => this.options.features.voice?.enforceArtifactBudget?.(workspacePath),
    }, options);
  }

  private providerDiscoveryOptions() {
    return agentRuntimeProviderDiscoveryOptions({
      store: this.options.store,
      features: this.options.features,
    });
  }
}
