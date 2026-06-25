import { describe, expect, it, vi } from "vitest";

import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { ChatMessage, ContextUsageSnapshot, ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import type { AgentRuntimeProviderRuntimeController } from "./agentRuntimeProviderRuntimeController";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import {
  createAgentRuntimePromptPipelineControllers,
  type AgentRuntimePromptPipelineControllerOptions,
} from "./agentRuntimePromptPipelineControllers";
import type { AgentRuntimeRemoteSurfaceRuntimeEventStore } from "./messaging/agentRuntimeRemoteSurfaceRuntimeEvents";
import type { AgentRuntimePromptOutcomeControllerOptions } from "./agentRuntimePromptOutcomeController";
import type { AgentRuntimePiSession } from "./agentRuntimeSessionFactoryController";
import { AgentRuntimeSessionRegistry } from "./agentRuntimeSessionRegistry";
import type { RuntimeAbortContextActiveRun } from "./runtimeAbortContext";

describe("AgentRuntime prompt pipeline controllers", () => {
  it("creates the prompt-path controller set from explicit runtime dependencies", () => {
    const callbacks = callbackStubs();
    const activeRuns = new Map<string, RuntimeAbortContextActiveRun>();
    const activeRunIds = new Map<string, string>();
    const controllers = createAgentRuntimePromptPipelineControllers({
      activeRunIds: {
        get: (threadId) => activeRunIds.get(threadId),
        set: (threadId, runId) => activeRunIds.set(threadId, runId),
        delete: (threadId) => activeRunIds.delete(threadId),
      },
      activeRuns: {
        has: (threadId) => activeRuns.has(threadId),
        set: (threadId, run) => activeRuns.set(threadId, run),
        delete: (threadId) => activeRuns.delete(threadId),
      },
      ambientCliSkillMountDiagnostics: new Map(),
      callbacks,
      features: {},
      goalContinuations: {
        accountFinishedGoalRun: vi.fn(),
        scheduleGoalContinuation: vi.fn(),
      } as unknown as AgentRuntimePromptPipelineControllerOptions["goalContinuations"],
      localModelRuntimeManager: {} as AgentRuntimePromptPipelineControllerOptions["localModelRuntimeManager"],
      permissionWaitControls: new Map(),
      permissions: {
        request: vi.fn(),
      },
      providerRuntime: providerRuntimeStub(),
      remoteSurfaceRuntimeEvents: remoteSurfaceRuntimeEventsStub(),
      sessions: new AgentRuntimeSessionRegistry<AgentRuntimePiSession>(),
      store: storeStub(),
      timeouts: {
        chatPiEmptyAssistantStallTimeoutMs: 30_000,
        defaultInterruptedToolCallRecoveryMaxRetries: 3,
        localToolIdleTimeoutMs: () => 30_000,
        workflowRecordingReviewStreamIdleTimeoutMs: 30_000,
      },
      transientFileAuthorityRoots: new Map(),
    });

    expect(controllers.contextRecovery).toBeDefined();
    expect(controllers.plannerFinalization).toBeDefined();
    expect(controllers.sendPreparation).toBeDefined();
    expect(controllers.sendPreflight).toBeDefined();
    expect(controllers.activeRunHandoff).toBeDefined();
    expect(controllers.promptOutcomes).toBeDefined();
    expect(controllers.promptExecutions).toBeDefined();
    expect(controllers.fileAuthority).toBeDefined();
    expect(controllers.pluginPermissions).toBeDefined();
    expect(callbacks.currentFeatureFlagSnapshot).not.toHaveBeenCalled();
  });

  it("forwards Planner Mode run-start snapshot options into planner finalization", async () => {
    const activeRuns = new Map<string, RuntimeAbortContextActiveRun>();
    const activeRunIds = new Map<string, string>();
    const controllers = createAgentRuntimePromptPipelineControllers({
      activeRunIds: {
        get: (threadId) => activeRunIds.get(threadId),
        set: (threadId, runId) => activeRunIds.set(threadId, runId),
        delete: (threadId) => activeRunIds.delete(threadId),
      },
      activeRuns: {
        has: (threadId) => activeRuns.has(threadId),
        set: (threadId, run) => activeRuns.set(threadId, run),
        delete: (threadId) => activeRuns.delete(threadId),
      },
      ambientCliSkillMountDiagnostics: new Map(),
      callbacks: callbackStubs(),
      features: {},
      goalContinuations: {
        accountFinishedGoalRun: vi.fn(),
        scheduleGoalContinuation: vi.fn(),
      } as unknown as AgentRuntimePromptPipelineControllerOptions["goalContinuations"],
      localModelRuntimeManager: {} as AgentRuntimePromptPipelineControllerOptions["localModelRuntimeManager"],
      permissionWaitControls: new Map(),
      permissions: {
        request: vi.fn(),
      },
      providerRuntime: providerRuntimeStub(),
      remoteSurfaceRuntimeEvents: remoteSurfaceRuntimeEventsStub(),
      sessions: new AgentRuntimeSessionRegistry<AgentRuntimePiSession>(),
      store: storeStub(),
      timeouts: {
        chatPiEmptyAssistantStallTimeoutMs: 30_000,
        defaultInterruptedToolCallRecoveryMaxRetries: 3,
        localToolIdleTimeoutMs: () => 30_000,
        workflowRecordingReviewStreamIdleTimeoutMs: 30_000,
      },
      transientFileAuthorityRoots: new Map(),
    });
    const finalMessage = { id: "assistant-1", threadId: "thread-1" } as ChatMessage;
    const createPlannerPlanArtifactFromMessage = vi
      .spyOn(controllers.plannerFinalization, "createPlannerPlanArtifactFromMessage")
      .mockResolvedValue(undefined);
    const promptOutcomeOptions = (controllers.promptOutcomes as unknown as {
      options: Pick<AgentRuntimePromptOutcomeControllerOptions, "createPlannerPlanArtifactFromMessage">;
    }).options;

    await promptOutcomeOptions.createPlannerPlanArtifactFromMessage(finalMessage, { startedInPlannerMode: true });

    expect(createPlannerPlanArtifactFromMessage).toHaveBeenCalledWith(finalMessage, { startedInPlannerMode: true });
  });
});

function callbackStubs(): AgentRuntimePromptPipelineControllerOptions["callbacks"] {
  return {
    abortSessionRun: vi.fn(async () => undefined),
    applyThreadModelSettings: vi.fn(async () => undefined),
    clearWorkflowPlanEditIntent: vi.fn(),
    commitThreadPiSessionFile: vi.fn(async () => undefined),
    completePendingProjectSwitch: vi.fn(),
    currentFeatureFlagSnapshot: vi.fn(() => featureFlagSnapshot()),
    deletePendingProjectSwitch: vi.fn(),
    emit: vi.fn(),
    generateTitleIfNeeded: vi.fn(),
    getRunRecord: vi.fn(() => undefined),
    getSession: vi.fn(async () => sessionStub()),
    preflightBeforePrompt: vi.fn(async () => undefined),
    recordCallableWorkflowFinalizationBlockedParentMailbox: vi.fn(),
    recordContextUsageSnapshot: vi.fn((threadId, _session, message) => contextUsageSnapshot(threadId, message ?? "recorded")),
    recordSubagentFinalizationBlockedParentMailbox: vi.fn(),
    refreshBrowsersForArtifactChange: vi.fn(async () => undefined),
    resolveCallableWorkflowFinalizationBlock: vi.fn(() => undefined),
    resolveSubagentFinalizationBlock: vi.fn(() => undefined),
    send: vi.fn(async () => undefined),
    setWorkflowPlanEditIntent: vi.fn(),
    suppressCallableWorkflowParentAssistantMessages: vi.fn(),
    takePendingProjectSwitch: vi.fn(() => undefined),
  } as unknown as AgentRuntimePromptPipelineControllerOptions["callbacks"];
}

function providerRuntimeStub(): AgentRuntimeProviderRuntimeController {
  return {
    recordVoiceDispatch: vi.fn(),
  } as unknown as AgentRuntimeProviderRuntimeController;
}

function remoteSurfaceRuntimeEventsStub(): AgentRuntimeRemoteSurfaceRuntimeEventStore {
  return {
    update: vi.fn(),
  } as unknown as AgentRuntimeRemoteSurfaceRuntimeEventStore;
}

function storeStub(): ProjectStore {
  return {
    getLatestContextUsageSnapshot: vi.fn(() => undefined),
    getThread: vi.fn(() => thread()),
    getWorkspace: vi.fn(() => workspace()),
    recordContextUsageSnapshot: vi.fn((snapshot) => ({
      ...snapshot,
      updatedAt: "2026-06-21T00:00:00.000Z",
    })),
  } as unknown as ProjectStore;
}

function sessionStub(): AgentRuntimePiSession {
  return {} as AgentRuntimePiSession;
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
