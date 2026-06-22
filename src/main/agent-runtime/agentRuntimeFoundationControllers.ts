import type { DesktopEvent } from "../../shared/desktopTypes";
import type {
  PermissionPromptResolution,
  PermissionPromptResponseMode,
  PermissionRequest,
} from "../../shared/permissionTypes";
import type {
  AmbientFeatureFlagSnapshot,
} from "../../shared/featureFlags";
import type { RuntimeSurfaceWorkflowRecoveryEvent } from "../../shared/messagingGateway";
import type { LocalModelRuntimeRestartPlan, LocalModelRuntimeStopPlan, LocalRuntimeOwnershipResolutionRequest, LocalRuntimeOwnershipResolutionResult } from "./agentRuntimeLocalRuntimeFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type { AgentRuntimeFeatures } from "./agentRuntimeFeatures";
import { BrowserService } from "./agentRuntimeBrowserFacade";
import { GlmTokenizerService } from "./agentRuntimeTokenizationFacade";
import { LocalModelRuntimeManager } from "./agentRuntimeLocalRuntimeFacade";
import {
  createMessagingBindingStore,
  createDefaultMessagingProviderRegistry,
} from "./agentRuntimeMessagingFacade";
import {
  AgentRuntimeRemoteSurfaceRuntimeEventStore,
} from "./messaging/agentRuntimeRemoteSurfaceRuntimeEvents";
import {
  createAgentRuntimeMcpToolOrchestration,
} from "./mcp/agentRuntimeMcpToolBridge";
import { AgentRuntimeSessionRegistry } from "./agentRuntimeSessionRegistry";
import type { AgentRuntimePiSession } from "./agentRuntimeSessionFactoryController";
import { AgentRuntimeModelContextController } from "./agentRuntimeModelContextController";
import {
  AgentRuntimeProviderRuntimeController,
  type AgentRuntimeProviderRuntimeControllerOptions,
} from "./agentRuntimeProviderRuntimeController";
import {
  AgentRuntimeMessagingGatewayController,
  type AgentRuntimeMessagingGatewayControllerOptions,
} from "./agentRuntimeMessagingGatewayController";
import {
  AgentRuntimeWebResearchController,
  type AgentRuntimeWebResearchControllerOptions,
} from "./agentRuntimeWebResearchController";
import {
  AgentRuntimeLocalDeepResearchController,
} from "./agentRuntimeLocalDeepResearchController";
import type { AgentRuntimePluginMcpDescriptorDriftInput } from "./agentRuntimePluginPermissionController";
import type { ResolveFirstPartyPluginPermissionInput } from "./agentRuntimeFirstPartyPluginPermission";
import type { RuntimePermissionWaitControl } from "./runtimePermissionWaitController";

export interface AgentRuntimeFoundationControllerOptions {
  store: ProjectStore;
  browser: BrowserService;
  features: AgentRuntimeFeatures;
  permissions: {
    request: (
      request: Omit<PermissionRequest, "id">,
      options?: { onRequest?: (request: PermissionRequest) => void },
    ) => Promise<PermissionPromptResolution>;
    listPending?: () => PermissionRequest[];
    respond?: (id: string, response: PermissionPromptResponseMode) => void;
  };
  sessions: AgentRuntimeSessionRegistry<AgentRuntimePiSession>;
  activeRuns: AgentRuntimeMessagingGatewayControllerOptions["activeRuns"];
  pendingProjectSwitchByThreadId: AgentRuntimeMessagingGatewayControllerOptions["pendingProjectSwitchByThreadId"];
  permissionWaitControls: Map<string, RuntimePermissionWaitControl>;
  localModelRuntimeManager: LocalModelRuntimeManager;
  callbacks: {
    completePendingProjectSwitch: AgentRuntimeMessagingGatewayControllerOptions["completePendingProjectSwitch"];
    currentFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot;
    emit: (event: DesktopEvent) => void;
    emitBrowserState: AgentRuntimeWebResearchControllerOptions["emitBrowserState"];
    prepareBrowserToolProfile: AgentRuntimeWebResearchControllerOptions["prepareBrowserToolProfile"];
    recordBrowserAudit: AgentRuntimeWebResearchControllerOptions["recordBrowserAudit"];
    resolveFirstPartyPluginPermission: AgentRuntimeProviderRuntimeControllerOptions["resolveFirstPartyPluginPermission"];
    resolveLocalRuntimeOwnershipForForcedAction: (
      request: LocalRuntimeOwnershipResolutionRequest,
    ) => Promise<LocalRuntimeOwnershipResolutionResult>;
    resolveLocalRuntimeOwnershipForRestartPlan: (
      plan: LocalModelRuntimeRestartPlan,
    ) => Promise<LocalRuntimeOwnershipResolutionResult | undefined>;
    resolveLocalRuntimeOwnershipForStopPlan: (
      plan: LocalModelRuntimeStopPlan,
    ) => Promise<LocalRuntimeOwnershipResolutionResult | undefined>;
    revokeMcpPermissionGrantsForDescriptorDrift: (event: AgentRuntimePluginMcpDescriptorDriftInput) => void;
    workflowRecoveryEvents: () => RuntimeSurfaceWorkflowRecoveryEvent[];
  };
}

export function createAgentRuntimeFoundationControllers({
  activeRuns,
  browser,
  callbacks,
  features,
  localModelRuntimeManager,
  pendingProjectSwitchByThreadId,
  permissionWaitControls,
  permissions,
  sessions,
  store,
}: AgentRuntimeFoundationControllerOptions) {
  const glmTokenizer = new GlmTokenizerService(() => store.getWorkspace().statePath);
  const mcpToolOrchestration = createAgentRuntimeMcpToolOrchestration({
    userDataPath: () => features.mcp?.userDataPath,
    env: () => features.mcp?.env,
    onDescriptorDrift: (event) => {
      callbacks.revokeMcpPermissionGrantsForDescriptorDrift(event);
    },
  });
  const remoteSurfaceRuntimeEvents = new AgentRuntimeRemoteSurfaceRuntimeEventStore({
    listRemoteSurfaceBindings: () => createMessagingBindingStore({
      stateRoot: store.getWorkspace().statePath,
      providers: createDefaultMessagingProviderRegistry(),
    }).list({ purpose: "remote_ambient_surface", includeInactive: true }).bindings,
  });
  const modelContext = new AgentRuntimeModelContextController({
    store,
    getActiveSession: (threadId) => sessions.get(threadId),
    getBrowserState: () => browser.getState(),
    countSerializedPayload: (payload, fallbackTokens) => glmTokenizer.countSerializedPayload(payload, fallbackTokens),
    recordContextUsageSnapshot: (snapshot) => store.recordContextUsageSnapshot(snapshot),
    emitContextUsageUpdated: (snapshot) => callbacks.emit({ type: "context-usage-updated", snapshot }),
    modelReasoningEvidencePath: () => process.env.AMBIENT_MODEL_REASONING_EVIDENCE_PATH,
  });
  const providerRuntime = new AgentRuntimeProviderRuntimeController({
    store,
    features,
    localModelRuntimeManager: () => localModelRuntimeManager,
    resolveFirstPartyPluginPermission: (input) => callbacks.resolveFirstPartyPluginPermission(input),
    resolveLocalRuntimeOwnershipForForcedAction: (request) =>
      callbacks.resolveLocalRuntimeOwnershipForForcedAction(request),
    resolveLocalRuntimeOwnershipForStopPlan: (plan) => callbacks.resolveLocalRuntimeOwnershipForStopPlan(plan),
    resolveLocalRuntimeOwnershipForRestartPlan: (plan) =>
      callbacks.resolveLocalRuntimeOwnershipForRestartPlan(plan),
  });
  const messagingGateway = new AgentRuntimeMessagingGatewayController({
    store,
    remoteSurfaceRuntimeEvents,
    activeRuns,
    pendingProjectSwitchByThreadId,
    completePendingProjectSwitch: callbacks.completePendingProjectSwitch,
    readVoiceSettings: () => features.voice?.readSettings(),
    readSttSettings: () => features.stt?.readSettings(),
    readSearchSettings: () => features.search?.readSettings(),
    readMediaSettings: () => features.media?.readSettings(),
    readPlannerSettings: () => features.planner?.readSettings?.(),
    listPermissionRequests: () => permissions.listPending?.() ?? [],
    workflowRecoveryEvents: () => callbacks.workflowRecoveryEvents(),
    ...(features.projects?.listProjects ? { listProjects: () => features.projects!.listProjects!() } : {}),
    resolveFirstPartyPluginPermission: (input) =>
      callbacks.resolveFirstPartyPluginPermission(input as ResolveFirstPartyPluginPermissionInput),
    secureInputs: features.secureInputs,
    createProject: features.projects?.createProject,
    switchProjectAvailable: () => Boolean(features.projects?.switchProject),
    workflowAgents: features.workflowAgents,
    emit: (event) => callbacks.emit(event),
    voice: features.voice,
    stt: features.stt,
    listSttProviders: (workspacePath) => providerRuntime.listSttProvidersForTools(workspacePath),
    media: features.media,
    planner: features.planner,
    search: features.search,
    ...(permissions.respond ? {
      respondToPermissionPrompt: (requestId, response) => permissions.respond?.(requestId, response),
    } : {}),
  });
  const webResearch = new AgentRuntimeWebResearchController({
    store,
    createMcpRuntime: mcpToolOrchestration.createMcpRuntime,
    readSearchSettings: () => features.search?.readSettings(),
    mcpEnv: () => features.mcp?.env,
    prepareBrowserToolProfile: (input, sourceThreadId, onUpdate) =>
      callbacks.prepareBrowserToolProfile(input, sourceThreadId, onUpdate),
    browserSearch: (input) => browser.search(input),
    browserContent: (input) => browser.content(input),
    emitBrowserState: () => callbacks.emitBrowserState(),
    recordBrowserAudit: (threadId, toolName, risk, detail) =>
      callbacks.recordBrowserAudit(threadId, toolName, risk, detail),
    resolveFirstPartyPluginPermission: (input) =>
      callbacks.resolveFirstPartyPluginPermission(input as ResolveFirstPartyPluginPermissionInput),
  });
  const localDeepResearch = new AgentRuntimeLocalDeepResearchController({
    store,
    features: {
      localDeepResearch: features.localDeepResearch,
      localModelResidentProcesses: features.localModelResidentProcesses,
      search: features.search,
    },
    providerRuntime,
    webResearch,
    permissions,
    beginPermissionWait: (threadId, input) => permissionWaitControls.get(threadId)?.begin(input),
    resolveFirstPartyPluginPermission: (input) => callbacks.resolveFirstPartyPluginPermission(input),
    emit: (event) => callbacks.emit(event),
  });

  return {
    glmTokenizer,
    localDeepResearch,
    mcpToolOrchestration,
    messagingGateway,
    modelContext,
    providerRuntime,
    remoteSurfaceRuntimeEvents,
    webResearch,
  };
}
