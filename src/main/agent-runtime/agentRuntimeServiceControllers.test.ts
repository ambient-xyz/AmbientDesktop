import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import type { AgentMemoryRuntimeSnapshot } from "../../shared/agentMemoryDiagnostics";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { ContextUsageSnapshot, ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import type { AmbientCliSkillMountDiagnostics } from "./agentRuntimeAmbientCliSkillMount";
import type { BrowserCredentialStore, BrowserService, LocalPreviewServerManager } from "./agentRuntimeBrowserFacade";
import type { AgentRuntimeInstallRouteGuard } from "./agentRuntimeInstallRouteGuard";
import type { AgentRuntimeLocalDeepResearchController } from "./agentRuntimeLocalDeepResearchController";
import type { AgentRuntimeMessagingGatewayController } from "./agentRuntimeMessagingGatewayController";
import type { AgentRuntimeMcpToolOrchestration } from "./mcp/agentRuntimeMcpToolBridge";
import type { AgentRuntimeModelContextController } from "./agentRuntimeModelContextController";
import type { AgentRuntimeProviderRuntimeController } from "./agentRuntimeProviderRuntimeController";
import type { AmbientPluginHost } from "./agentRuntimePluginsFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type { AgentRuntimeWebResearchController } from "./agentRuntimeWebResearchController";
import { AgentRuntimeBrowserToolController } from "./agentRuntimeBrowserToolController";
import { AgentRuntimeExtensionAssemblyController } from "./agentRuntimeExtensionAssemblyController";
import { AgentRuntimeGoalContinuationController } from "./agentRuntimeGoalContinuationController";
import { AgentRuntimePluginSetupToolController } from "./agentRuntimePluginSetupToolController";
import { AgentRuntimeSessionFactoryController, type AgentRuntimePiSession } from "./agentRuntimeSessionFactoryController";
import { createAgentRuntimeServiceControllers, type AgentRuntimeServiceControllerOptions } from "./agentRuntimeServiceControllers";
import { AgentRuntimeSessionRegistry } from "./agentRuntimeSessionRegistry";
import { AgentRuntimeSettingsSessionController } from "./agentRuntimeSettingsSessionController";
import { AgentRuntimeThreadWakeContinuationController } from "./agentRuntimeThreadWakeContinuationController";
import { AgentRuntimeToolRunnerController } from "./agentRuntimeToolRunnerController";
import { AgentRuntimeAsyncBashJobService } from "./tools/agentRuntimeAsyncBashJobs";
import { AgentRuntimeAsyncLongContextJobService } from "./tools/agentRuntimeAsyncLongContextJobs";

describe("AgentRuntime service controllers", () => {
  it("creates the service/controller set from explicit runtime dependencies", () => {
    const callbacks = callbackStubs();
    const store = storeStub();
    const controllers = createAgentRuntimeServiceControllers({
      activeRunIds: new Map(),
      activeRuns: new Map(),
      ambientCliPackageDescriptionState: {} as AgentRuntimeServiceControllerOptions["ambientCliPackageDescriptionState"],
      ambientCliSkillMountDiagnostics: new Map<string, AmbientCliSkillMountDiagnostics>(),
      ambientWorkflowDescriptionState: {} as AgentRuntimeServiceControllerOptions["ambientWorkflowDescriptionState"],
      browser: {} as BrowserService,
      browserCredentials: {} as BrowserCredentialStore,
      callbacks,
      downloadService: {} as AgentRuntimeServiceControllerOptions["downloadService"],
      features: {},
      installRouteGuard: {} as AgentRuntimeInstallRouteGuard,
      localDeepResearch: {} as AgentRuntimeLocalDeepResearchController,
      localPreviewServers: {} as LocalPreviewServerManager,
      mcpToolOrchestration: {} as AgentRuntimeMcpToolOrchestration,
      messagingGateway: {} as AgentRuntimeMessagingGatewayController,
      modelContext: {} as AgentRuntimeModelContextController,
      permissions: {
        request: vi.fn(),
      } as AgentRuntimeServiceControllerOptions["permissions"],
      pluginHost: {} as AmbientPluginHost,
      providerRuntime: {} as AgentRuntimeProviderRuntimeController,
      sessions: new AgentRuntimeSessionRegistry<AgentRuntimePiSession>(),
      store,
      tencentMemoryRuntimeSnapshots: new Map<string, AgentMemoryRuntimeSnapshot>(),
      webResearch: {} as AgentRuntimeWebResearchController,
      workflowPlanEditIntentByThreadId: new Map(),
      workflowPlanEditWorkflowThreadByThreadId: new Map(),
    });

    expect(controllers.asyncBashJobs).toBeInstanceOf(AgentRuntimeAsyncBashJobService);
    expect(controllers.asyncLongContextJobs).toBeInstanceOf(AgentRuntimeAsyncLongContextJobService);
    expect(controllers.browserTools).toBeInstanceOf(AgentRuntimeBrowserToolController);
    expect(controllers.extensionAssembly).toBeInstanceOf(AgentRuntimeExtensionAssemblyController);
    expect(controllers.goalContinuations).toBeInstanceOf(AgentRuntimeGoalContinuationController);
    expect(controllers.pluginSetupTools).toBeInstanceOf(AgentRuntimePluginSetupToolController);
    expect(controllers.sessionFactory).toBeInstanceOf(AgentRuntimeSessionFactoryController);
    expect(controllers.settingsSessions).toBeInstanceOf(AgentRuntimeSettingsSessionController);
    expect(controllers.threadWakeContinuations).toBeInstanceOf(AgentRuntimeThreadWakeContinuationController);
    expect(controllers.toolRunner).toBeInstanceOf(AgentRuntimeToolRunnerController);
    expect(store.listPendingThreadWakeContinuations).toHaveBeenCalledTimes(1);
    expect(callbacks.currentFeatureFlagSnapshot).not.toHaveBeenCalled();
    expect(callbacks.send).not.toHaveBeenCalled();
  });
});

function callbackStubs(): AgentRuntimeServiceControllerOptions["callbacks"] {
  return {
    commitThreadPiSessionFile: vi.fn(async () => undefined),
    createCallableWorkflowToolExtension: vi.fn(() => extensionFactory()),
    createInterruptedToolCallRecoveryToolExtension: vi.fn(() => extensionFactory()),
    createPermissionGateExtension: vi.fn(() => extensionFactory()),
    createSubagentToolExtension: vi.fn(() => extensionFactory()),
    currentFeatureFlagSnapshot: vi.fn(() => featureFlagSnapshot()),
    emit: vi.fn(),
    ensurePluginMcpToolTrusted: vi.fn(async () => true),
    fileAuthorityRootPathsForThread: vi.fn(() => []),
    includeWorkspaceRootAuthorityForThread: vi.fn(() => false),
    markPluginToolsStale: vi.fn(),
    recordContextUsageSnapshot: vi.fn((threadId, _session, message) => contextUsageSnapshot(threadId, message ?? "recorded")),
    recordUnavailableContextUsageSnapshot: vi.fn((thread, message) => contextUsageSnapshot(thread.id, message)),
    requestFileAuthorityForThread: vi.fn(async () => true),
    resolveFirstPartyPluginPermission: vi.fn(async () => true),
    resolveToolCallPermission: vi.fn(async () => undefined),
    revokePluginGrantsForLabels: vi.fn(() => 0),
    runCapabilityBuilderValidationWithPermission: vi.fn(async () => undefined),
    send: vi.fn(async () => undefined),
    tryRouteBrowserContentThroughScrapling: vi.fn(),
  } as unknown as AgentRuntimeServiceControllerOptions["callbacks"];
}

function storeStub(): ProjectStore & { listPendingThreadWakeContinuations: ReturnType<typeof vi.fn> } {
  return {
    getThread: vi.fn(() => thread()),
    getWorkspace: vi.fn(() => workspace()),
    listPendingThreadWakeContinuations: vi.fn(() => []),
  } as unknown as ProjectStore & { listPendingThreadWakeContinuations: ReturnType<typeof vi.fn> };
}

function thread(): ThreadSummary {
  return {
    id: "thread-1",
    title: "Thread",
    workspacePath: "/workspace",
  } as ThreadSummary;
}

function workspace(): WorkspaceState {
  return {
    name: "workspace",
    path: "/workspace",
    sessionPath: "/workspace/.ambient/session",
    statePath: "/workspace/.ambient/state",
  };
}

function contextUsageSnapshot(threadId: string, message: string): ContextUsageSnapshot {
  return {
    threadId,
    source: "unavailable",
    compactionCount: 0,
    updatedAt: "2026-06-21T00:00:00.000Z",
    diagnostics: {
      activeSession: false,
      message,
    },
  };
}

function featureFlagSnapshot(): AmbientFeatureFlagSnapshot {
  return {
    flags: {
      "ambient.memory.tencentdb": {
        id: "ambient.memory.tencentdb",
        enabled: true,
        source: "default",
        defaultEnabled: true,
      },
      "ambient.slashCommands": {
        id: "ambient.slashCommands",
        enabled: false,
        source: "default",
        defaultEnabled: false,
      },
      "ambient.subagents": {
        id: "ambient.subagents",
        enabled: false,
        source: "default",
        defaultEnabled: false,
      },
    },
    generatedAt: "2026-06-21T00:00:00.000Z",
    schemaVersion: "ambient-feature-flags-v1",
  };
}

function extensionFactory(): ExtensionFactory {
  return (() => undefined) as unknown as ExtensionFactory;
}
