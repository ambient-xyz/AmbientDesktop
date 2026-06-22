import { describe, expect, it, vi } from "vitest";

import type { AmbientModelRuntimeProfile } from "../../shared/ambientModels";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { ContextUsageSnapshot } from "../../shared/threadTypes";
import { AgentRuntimeCallableWorkflowController } from "./agentRuntimeCallableWorkflowController";
import { AgentRuntimeCallableWorkflowSymphonyBridgeController } from "./agentRuntimeCallableWorkflowSymphonyBridgeController";
import { AgentRuntimeFinalizationCoordinator } from "./agentRuntimeFinalizationCoordinator";
import type { AmbientPluginHost } from "./agentRuntimePluginsFacade";
import { AgentRuntimeSubagentActionController } from "./agentRuntimeSubagentActionController";
import { AgentRuntimeSubagentCapacityController } from "./agentRuntimeSubagentCapacityController";
import { AgentRuntimeSubagentChildLifecycleCoordinator } from "./agentRuntimeSubagentChildLifecycleCoordinator";
import { AgentRuntimeSubagentChildRuntimeRouter } from "./agentRuntimeSubagentChildRuntimeRouter";
import { AgentRuntimeSubagentChildTurnCoordinator } from "./agentRuntimeSubagentChildTurnCoordinator";
import { AgentRuntimeSubagentStopCascadeController } from "./agentRuntimeSubagentStopCascadeController";
import {
  createAgentRuntimeSubagentWorkflowControllers,
  type AgentRuntimeSubagentWorkflowControllerOptions,
} from "./agentRuntimeSubagentWorkflowControllers";
import { AgentRuntimeWorkflowRecordingReviewSessionController } from "./agentRuntimeWorkflowRecordingReviewSessionController";
import { AgentRuntimeLocalRuntimeOwnershipController } from "./agentRuntimeLocalRuntimeOwnershipController";

describe("AgentRuntime subagent/workflow controllers", () => {
  it("creates the subagent and callable-workflow controller set from explicit runtime dependencies", () => {
    const callbacks = callbackStubs();
    const controllers = createAgentRuntimeSubagentWorkflowControllers({
      activeRunIds: new Map(),
      activeRuns: new Map(),
      browser: {} as AgentRuntimeSubagentWorkflowControllerOptions["browser"],
      callableWorkflowRunTaskIds: new Map(),
      callableWorkflowTaskAbortControllers: new Map(),
      callbacks,
      features: {},
      localModelRuntimeManager: {} as AgentRuntimeSubagentWorkflowControllerOptions["localModelRuntimeManager"],
      modelContext: {} as AgentRuntimeSubagentWorkflowControllerOptions["modelContext"],
      permissions: {
        request: vi.fn(),
      },
      pluginHost: {} as AmbientPluginHost,
      store: {} as AgentRuntimeSubagentWorkflowControllerOptions["store"],
      subagentChildExecutions: new Map(),
    });

    expect(controllers.callableWorkflowSymphonyBridge).toBeInstanceOf(AgentRuntimeCallableWorkflowSymphonyBridgeController);
    expect(controllers.callableWorkflows).toBeInstanceOf(AgentRuntimeCallableWorkflowController);
    expect(controllers.finalizationCoordinator).toBeInstanceOf(AgentRuntimeFinalizationCoordinator);
    expect(controllers.localRuntimeOwnership).toBeInstanceOf(AgentRuntimeLocalRuntimeOwnershipController);
    expect(controllers.subagentActions).toBeInstanceOf(AgentRuntimeSubagentActionController);
    expect(controllers.subagentCapacity).toBeInstanceOf(AgentRuntimeSubagentCapacityController);
    expect(controllers.subagentChildLifecycle).toBeInstanceOf(AgentRuntimeSubagentChildLifecycleCoordinator);
    expect(controllers.subagentChildRuntimeRouter).toBeInstanceOf(AgentRuntimeSubagentChildRuntimeRouter);
    expect(controllers.subagentChildTurns).toBeInstanceOf(AgentRuntimeSubagentChildTurnCoordinator);
    expect(controllers.subagentStopCascade).toBeInstanceOf(AgentRuntimeSubagentStopCascadeController);
    expect(controllers.workflowRecordingReviewSessions).toBeInstanceOf(AgentRuntimeWorkflowRecordingReviewSessionController);
    expect(callbacks.currentFeatureFlagSnapshot).not.toHaveBeenCalled();
    expect(callbacks.recordContextUsageSnapshot).not.toHaveBeenCalled();
    expect(callbacks.send).not.toHaveBeenCalled();
  });
});

function callbackStubs(): AgentRuntimeSubagentWorkflowControllerOptions["callbacks"] {
  return {
    abortChildThread: vi.fn(async () => undefined),
    currentFeatureFlagSnapshot: vi.fn(() => featureFlagSnapshot()),
    emit: vi.fn(),
    emitCallableWorkflowTaskUpdated: vi.fn(),
    ensurePluginMcpToolTrusted: vi.fn(async () => true),
    prepareChildWorktree: vi.fn(async () => undefined),
    recordContextUsageSnapshot: vi.fn((threadId, _session, message) => contextUsageSnapshot(threadId, message ?? "recorded")),
    resolveModelRuntimeProfile: vi.fn(() => ({}) as AmbientModelRuntimeProfile),
    send: vi.fn(async () => undefined),
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
