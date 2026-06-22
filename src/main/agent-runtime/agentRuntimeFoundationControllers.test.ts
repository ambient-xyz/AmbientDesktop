import { describe, expect, it, vi } from "vitest";

import type { WorkspaceState } from "../../shared/workspaceTypes";
import type { BrowserService } from "./agentRuntimeBrowserFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import {
  createAgentRuntimeFoundationControllers,
  type AgentRuntimeFoundationControllerOptions,
} from "./agentRuntimeFoundationControllers";
import { AgentRuntimeSessionRegistry } from "./agentRuntimeSessionRegistry";
import type { AgentRuntimePiSession } from "./agentRuntimeSessionFactoryController";

describe("AgentRuntime foundation controllers", () => {
  it("creates the front-half controller set from explicit runtime dependencies", () => {
    const callbacks = callbackStubs();
    const controllers = createAgentRuntimeFoundationControllers({
      activeRuns: new Map(),
      browser: browserStub(),
      callbacks,
      features: {},
      localModelRuntimeManager: {} as AgentRuntimeFoundationControllerOptions["localModelRuntimeManager"],
      pendingProjectSwitchByThreadId: new Map(),
      permissionWaitControls: new Map(),
      permissions: {
        request: vi.fn(),
      },
      sessions: new AgentRuntimeSessionRegistry<AgentRuntimePiSession>(),
      store: storeStub(),
    });

    expect(controllers.glmTokenizer).toBeDefined();
    expect(controllers.localDeepResearch).toBeDefined();
    expect(controllers.mcpToolOrchestration.createMcpRuntime(workspace())).toBeUndefined();
    expect(controllers.messagingGateway).toBeDefined();
    expect(controllers.modelContext).toBeDefined();
    expect(controllers.providerRuntime).toBeDefined();
    expect(controllers.remoteSurfaceRuntimeEvents).toBeDefined();
    expect(controllers.webResearch).toBeDefined();
    expect(callbacks.revokeMcpPermissionGrantsForDescriptorDrift).not.toHaveBeenCalled();
  });
});

function callbackStubs(): AgentRuntimeFoundationControllerOptions["callbacks"] {
  return {
    completePendingProjectSwitch: vi.fn(),
    currentFeatureFlagSnapshot: vi.fn(() => ({
      flags: {},
      generatedAt: "2026-06-21T00:00:00.000Z",
      schemaVersion: "ambient-feature-flags-v1",
    })),
    emit: vi.fn(),
    emitBrowserState: vi.fn(async () => undefined),
    prepareBrowserToolProfile: vi.fn(),
    recordBrowserAudit: vi.fn(),
    resolveFirstPartyPluginPermission: vi.fn(async () => true),
    resolveLocalRuntimeOwnershipForForcedAction: vi.fn(async () => ({ allowed: true })),
    resolveLocalRuntimeOwnershipForRestartPlan: vi.fn(async () => undefined),
    resolveLocalRuntimeOwnershipForStopPlan: vi.fn(async () => undefined),
    revokeMcpPermissionGrantsForDescriptorDrift: vi.fn(),
    workflowRecoveryEvents: vi.fn(() => []),
  } as unknown as AgentRuntimeFoundationControllerOptions["callbacks"];
}

function storeStub(): ProjectStore {
  return {
    getWorkspace: () => workspace(),
    recordContextUsageSnapshot: (snapshot) => ({
      ...snapshot,
      updatedAt: "2026-06-21T00:00:00.000Z",
    }),
  } as ProjectStore;
}

function browserStub(): BrowserService {
  return {
    content: vi.fn(),
    getState: vi.fn(),
    search: vi.fn(),
  } as unknown as BrowserService;
}

function workspace(): WorkspaceState {
  return {
    name: "workspace",
    path: "/workspace",
    sessionPath: "/workspace/.ambient/session",
    statePath: "/workspace/.ambient/state",
  };
}
