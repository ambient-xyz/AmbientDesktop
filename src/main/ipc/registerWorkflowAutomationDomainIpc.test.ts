import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
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
} from "./registerAutomationsIpc";
import { callableWorkflowIpcChannels } from "./registerCallableWorkflowIpc";
import {
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
import {
  registerWorkflowAutomationDomainIpc,
  workflowAutomationDomainIpcChannels,
} from "./registerWorkflowAutomationDomainIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerWorkflowAutomationDomainIpc", () => {
  it("registers automation and workflow channels in the previous main registrar order", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAutomationDomainIpcChannels]);
    expect([...workflowAutomationDomainIpcChannels]).toEqual([
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
    ]);
  });

  it("routes automation schedule updates through the schedule host resolver", () => {
    const { deps, host, invoke, schedules } = registerWithFakes();

    expect(invoke("automations:update-schedule", { id: "schedule-1", enabled: false })).toBe(schedules);

    expect(deps.requireProjectRuntimeHostForAutomationSchedule).toHaveBeenCalledWith("schedule-1");
    expect(host.store.updateAutomationSchedule).toHaveBeenCalledWith({ id: "schedule-1", enabled: false });
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
  });

  it("emits project state after schedule occurrence mutations that can clear timer indicators", () => {
    const { deps, host, invoke } = registerWithFakes();

    expect(invoke("automations:skip-schedule-occurrence", { scheduleId: "schedule-1" })).toEqual({ scheduleId: "schedule-1" });
    expect(invoke("automations:reschedule-schedule-occurrence", { scheduleId: "schedule-1" })).toEqual({ scheduleId: "schedule-1" });

    expect(deps.emitProjectStateIfActive).toHaveBeenCalledTimes(2);
    expect(deps.emitProjectStateIfActive).toHaveBeenNthCalledWith(1, host);
    expect(deps.emitProjectStateIfActive).toHaveBeenNthCalledWith(2, host);
  });

  it("creates workflow samples through the active host and emits workflow updates", () => {
    const { deps, host, invoke, workflowDashboard } = registerWithFakes();

    expect(invoke("workflow:create-sample")).toBe(workflowDashboard);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.createWorkflowSampleArtifact).toHaveBeenCalledWith(host.store, "/workspace/project");
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith("/workspace/project");
  });

  it("cancels active workflow runs through the active controller", () => {
    const { controller, deps, host, invoke, workflowDashboard } = registerWithFakes();

    expect(invoke("workflow:cancel-run", { runId: "run-1" })).toBe(workflowDashboard);

    expect(deps.projectRuntimeHostForWorkflowRun).toHaveBeenCalledWith("run-1");
    expect(deps.activeWorkflowRunController).toHaveBeenCalledWith("run-1");
    expect(controller.abort).toHaveBeenCalledOnce();
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
    expect(deps.readWorkflowDashboard).toHaveBeenCalledWith(host.store);
  });

  it("routes callable workflow controls through the callable task host and feature flag gate", async () => {
    const { deps, host, invoke } = registerWithFakes();

    await expect(invoke("callable-workflow:cancel-task", {
      taskId: "task-1",
      reason: "No longer needed",
    })).resolves.toEqual({ status: "cancelled" });

    expect(deps.requireProjectRuntimeHostForCallableWorkflowTask).toHaveBeenCalledWith("task-1");
    expect(deps.getFeatureFlagSnapshot).toHaveBeenCalledWith(host.store);
    expect(host.runtime.cancelCallableWorkflowTask).toHaveBeenCalledWith({
      taskId: "task-1",
      reason: "No longer needed",
    });
  });
});

function registerWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const schedules = [{ id: "schedule-1", enabled: false }];
  const workflowDashboard = { runs: [], artifacts: [] };
  const controller = { abort: vi.fn() };
  const host = {
    workspacePath: "/workspace/project",
    runtime: {
      cancelCallableWorkflowTask: vi.fn(async () => ({ status: "cancelled" })),
      pauseCallableWorkflowTask: vi.fn(async () => ({ status: "paused" })),
      resumeCallableWorkflowTask: vi.fn(async () => ({ status: "resumed" })),
    },
    store: {
      getWorkspace: vi.fn(() => ({ path: "/workspace/project", statePath: "/workspace/project/.ambient" })),
      listAutomationFolders: vi.fn(() => []),
      createAutomationFolder: vi.fn(() => []),
      moveAutomationThread: vi.fn(() => []),
      listAutomationSchedules: vi.fn(() => schedules),
      createAutomationSchedule: vi.fn(() => schedules),
      updateAutomationSchedule: vi.fn(() => schedules),
      listAutomationScheduleExceptions: vi.fn(() => []),
      skipAutomationScheduleOccurrence: vi.fn(() => ({ scheduleId: "schedule-1" })),
      rescheduleAutomationScheduleOccurrence: vi.fn(() => ({ scheduleId: "schedule-1" })),
      updateAutomationScheduleOccurrenceRunLimits: vi.fn(() => ({ scheduleId: "schedule-1" })),
      createWorkflowAgentFolder: vi.fn(),
      moveWorkflowAgentThread: vi.fn(),
      listMessages: vi.fn(() => []),
      getThread: vi.fn(() => ({ id: "chat-1" })),
      ensureWorkflowAgentChatThread: vi.fn(() => "chat-1"),
      getWorkflowAgentThreadSummary: vi.fn(() => ({ id: "workflow-thread-1", chatThreadId: "chat-1" })),
      listWorkflowGraphSnapshots: vi.fn(() => []),
      listWorkflowExplorationTraces: vi.fn(() => []),
      listWorkflowRevisions: vi.fn(() => []),
      listWorkflowVersions: vi.fn(() => []),
    },
  };
  const deps = {
    AmbientWorkflowExplorationProvider: vi.fn(),
    activeWorkflowRunController: vi.fn(() => controller),
    activeWorkflowRunHost: vi.fn(() => host),
    ambientCliCapabilityGrantsForWorkflowRequest: vi.fn(async () => []),
    ambientRetryPolicyFromCurrentSettings: vi.fn(),
    answerWorkflowDiscoveryQuestion: vi.fn(),
    buildWorkflowDebugRewritePromptSection: vi.fn(),
    buildWorkflowRecoveryPlan: vi.fn(),
    compileWorkflowArtifact: vi.fn(),
    createWorkflowDebugRewriteRevision: vi.fn(),
    createWorkflowDiscoveryProvider: vi.fn(() => ({ providerId: "ambient" })),
    createWorkflowSampleArtifact: vi.fn(() => workflowDashboard),
    describeWorkflowDiscoveryCapability: vi.fn(),
    emitPermissionGrantCreated: vi.fn(),
    emitProjectStateIfActive: vi.fn(),
    emitWorkflowEvent: vi.fn(),
    emitWorkflowUpdated: vi.fn(),
    ensureWorkflowPluginTrusted: vi.fn(),
    firstPartyWorkflowConnectorAccountAuthorizer: vi.fn(),
    firstPartyWorkflowConnectorDescriptors: vi.fn(() => []),
    firstPartyWorkflowConnectorRegistrations: vi.fn(() => []),
    forgetActiveWorkflowRunsForController: vi.fn(),
    getAmbientProviderStatus: vi.fn(() => ({ model: "example/model-id", baseUrl: "https://ambient.example" })),
    getFeatureFlagSnapshot: vi.fn(() =>
      resolveAmbientFeatureFlags({
        settings: { subagents: true },
        generatedAt: "2026-06-16T00:00:00.000Z",
      }),
    ),
    handleIpc: (channel: string, listener: IpcListener) => handlers.set(channel, listener),
    invokeWorkflowNativeTool: vi.fn(),
    listGlobalWorkflowAgentFolders: vi.fn(() => []),
    mainWindow: { webContents: { send: vi.fn() } },
    markStaleWorkflowRunForRecoveryIfNeeded: vi.fn(),
    normalizeWorkspacePath: vi.fn((workspacePath: string) => workspacePath),
    pluginHost: {
      callCodexPluginMcpTool: vi.fn(),
      listRegistry: vi.fn(async () => ({})),
    },
    pluginMcpRegistrationsForThread: vi.fn(async () => []),
    pluginStateReaderForStore: vi.fn(),
    projectRuntimeHostForWorkflowRun: vi.fn(() => host),
    readAmbientApiKey: vi.fn(() => "test-key"),
    readWorkflowDashboard: vi.fn(() => workflowDashboard),
    readWorkflowRunDetail: vi.fn(),
    recordWorkflowRevisionDecisionInChat: vi.fn(),
    rememberActiveWorkflowRun: vi.fn(),
    requestPermissionWithGrantRegistry: vi.fn(async () => ({ allowed: true })),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    requireProjectRuntimeHostForAutomationSchedule: vi.fn(() => host),
    requireProjectRuntimeHostForAutomationScheduleTarget: vi.fn(() => host),
    requireProjectRuntimeHostForAutomationThread: vi.fn(() => host),
    requireProjectRuntimeHostForCallableWorkflowTask: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowArtifact: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowRevision: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowRun: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowThread: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowVersion: vi.fn(() => host),
    resolveWorkflowDiscoveryAccessRequest: vi.fn(),
    restoreWorkflowVersion: vi.fn(),
    revalidateWorkflowArtifact: vi.fn(),
    reviewWorkflowArtifact: vi.fn(),
    runWorkflowArtifact: vi.fn(),
    runWorkflowThreadExploration: vi.fn(),
    searchRoutingSettings: { enabled: true },
    searchWorkflowDiscoveryCapabilities: vi.fn(),
    startWorkflowDiscovery: vi.fn(),
    startWorkflowRevisionDiscovery: vi.fn(),
    store: host.store,
    updateWorkflowArtifactSource: vi.fn(),
    updateWorkflowConnectorGrant: vi.fn(),
    workflowAgentControlThread: vi.fn((_store, thread) => thread),
    workflowAgentIpcContextForDiscoveryQuestion: vi.fn(),
    workflowAgentIpcContextForWorkflowThread: vi.fn(),
    workflowArtifactIpcContext: vi.fn(),
    workflowArtifactIpcContextForHost: vi.fn(),
    workflowCompileIpcContext: vi.fn(),
    workflowDebugRewriteIpcContext: vi.fn(),
    workflowDebugRewriteUserRequest: vi.fn(),
    workflowDiscoveryPolicyContextForCapabilityLookup: vi.fn(),
    workflowProjectIpcContext: vi.fn(),
    workflowToolDescriptorsFromPluginRegistry: vi.fn(() => []),
    workspaceInventoryConnector: vi.fn(),
    workspaceStateForThread: vi.fn(() => ({ name: "Project", path: "/workspace/project" })),
  };

  registerWorkflowAutomationDomainIpc(deps);

  return {
    controller,
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return handler({} as IpcMainInvokeEvent, raw);
    },
    schedules,
    workflowDashboard,
  };
}
