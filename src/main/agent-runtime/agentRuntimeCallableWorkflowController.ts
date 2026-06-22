import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import { isCallableWorkflowSymphonyChildWaitPreCompilePause } from "../../shared/callableWorkflowTaskGuards";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type {
  CallableWorkflowTaskSummary,
  CancelCallableWorkflowTaskInput,
  PauseCallableWorkflowTaskInput,
  ResumeCallableWorkflowTaskInput,
  WorkflowRecordingLibraryDescription,
} from "../../shared/workflowTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  type CallableWorkflowRunnerLaunchInput,
  type CallableWorkflowSubagentLaunchResult,
} from "./agentRuntimeCallableWorkflowFacade";
import {
  cancelAgentRuntimeCallableWorkflowTask,
  createAgentRuntimeCallableWorkflowRuntimeBridge,
  createAgentRuntimeCallableWorkflowRunnerStore,
  executeAgentRuntimeCallableWorkflowTaskForThread,
  pauseAgentRuntimeCallableWorkflowTask,
  resumeAgentRuntimeCallableWorkflowTask,
  startAgentRuntimeCallableWorkflowTaskForThread,
} from "./agentRuntimeCallableWorkflowExecution";
import { createAgentRuntimeCallableWorkflowToolExtension } from "./agentRuntimeCallableWorkflowTools";
import { shouldCancelCallableWorkflowSymphonyLaunchChildren } from "./agentRuntimeCallableWorkflowSymphonyBridgeController";
import type { PermissionPromptRequester } from "./agentRuntimePermissionsFacade";
import type { AmbientPluginHost, PluginMcpToolRegistration } from "./agentRuntimePluginsFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import {
  validateSymphonyParentModeCallableWorkflowPrelaunch,
  type SymphonyParentModePolicy,
  type SymphonyParentModeVerifiedLaunch,
} from "./agentRuntimeSymphonyParentMode";
import type {
  WorkflowConnectorAccountAuthorizer,
  WorkflowConnectorDescriptor,
  WorkflowConnectorRegistration,
} from "./agentRuntimeWorkflowFacade";
import type { RunWorkflowArtifactInput } from "./agentRuntimeWorkflowFacade";
import type { SearchRoutingSettings } from "../../shared/webResearchTypes";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";

interface AgentRuntimeCallableWorkflowNativeTools {
  connectorDescriptors?: () => WorkflowConnectorDescriptor[];
  connectorRegistrations?: () => WorkflowConnectorRegistration[];
  connectorAccountAuthorizer?: () => WorkflowConnectorAccountAuthorizer | undefined;
}

export interface AgentRuntimeCallableWorkflowControllerOptions {
  store: ProjectStore;
  browser: RunWorkflowArtifactInput["browser"];
  permissionRequester: PermissionPromptRequester;
  pluginHost: Pick<
    AmbientPluginHost,
    "enabledCodexPlugins" | "buildCodexPluginMcpToolRegistrations" | "listRegistry" | "callCodexPluginMcpTool"
  >;
  activeRunIds: Pick<Map<string, string>, "get">;
  taskAbortControllers: Map<string, AbortController>;
  runTaskIds: Map<string, string>;
  workflowNativeTools?: AgentRuntimeCallableWorkflowNativeTools | undefined;
  readSearchRoutingSettings?: () => SearchRoutingSettings | undefined;
  getFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot;
  ensurePluginMcpToolTrusted: (
    threadId: string,
    workspace: WorkspaceState,
    registration: PluginMcpToolRegistration,
  ) => Promise<boolean>;
  executeCallableWorkflowTaskForThread: (
    threadId: string,
    taskId: string,
    workspace: WorkspaceState,
  ) => Promise<void>;
  cancelCallableWorkflowSymphonyChildWait: (
    task: CallableWorkflowTaskSummary,
    reason?: string,
  ) => Promise<void>;
  launchWorkflowSubagents: (
    input: CallableWorkflowRunnerLaunchInput,
  ) => Promise<CallableWorkflowSubagentLaunchResult | void>;
  emitCallableWorkflowTaskUpdated: (task: CallableWorkflowTaskSummary) => void;
  emit: (event: DesktopEvent) => void;
}

export class AgentRuntimeCallableWorkflowController {
  constructor(private readonly options: AgentRuntimeCallableWorkflowControllerOptions) {}

  createToolExtension(
    threadId: string,
    workspace: WorkspaceState,
    initialRecordedWorkflowPlaybooks: readonly WorkflowRecordingLibraryDescription[] = [],
    childCallableWorkflowToolNames: readonly string[] = [],
    symphonyParentModePolicy?: SymphonyParentModePolicy | undefined,
    symphonyParentModeVerifiedLaunch?: SymphonyParentModeVerifiedLaunch | undefined,
  ): ExtensionFactory {
    return createAgentRuntimeCallableWorkflowToolExtension({
      threadId,
      workspace,
      initialRecordedWorkflowPlaybooks,
      childCallableWorkflowToolNames,
      activeRunIds: this.options.activeRunIds,
      store: this.options.store,
      getFeatureFlagSnapshot: this.options.getFeatureFlagSnapshot,
      beforeEnqueueCallableWorkflowTask: ({ executionPlan }) => {
        const validation = validateSymphonyParentModeCallableWorkflowPrelaunch({
          policy: symphonyParentModePolicy,
          launchVerified: Boolean(symphonyParentModeVerifiedLaunch),
          request: {
            parentThreadId: executionPlan.parent.threadId,
            parentRunId: executionPlan.parent.runId,
            toolName: executionPlan.workflowRunPlan.toolName,
            sourceKind: executionPlan.workflowRunPlan.source.kind,
          },
          existingTasks: this.options.store.listCallableWorkflowTasksForParentRun(executionPlan.parent.runId),
        });
        if (!validation.allowed) throw new Error(validation.reason);
      },
      startCallableWorkflowTaskForThread: (threadId, taskId, workspace) =>
        this.startTaskForThread(threadId, taskId, workspace),
      emitCallableWorkflowTaskUpdated: this.options.emitCallableWorkflowTaskUpdated,
    });
  }

  startTaskForThread(
    threadId: string,
    taskId: string,
    workspace: WorkspaceState,
  ): void {
    startAgentRuntimeCallableWorkflowTaskForThread(threadId, taskId, workspace, {
      store: this.options.store,
      executeCallableWorkflowTaskForThread: this.options.executeCallableWorkflowTaskForThread,
      emitCallableWorkflowTaskUpdated: this.options.emitCallableWorkflowTaskUpdated,
      emit: this.options.emit,
    });
  }

  async cancelTask(input: CancelCallableWorkflowTaskInput): Promise<CallableWorkflowTaskSummary> {
    const current = this.options.store.getCallableWorkflowTask(input.taskId);
    const canceled = cancelAgentRuntimeCallableWorkflowTask(input, {
      store: this.options.store,
      taskAbortControllers: this.options.taskAbortControllers,
      runTaskIds: this.options.runTaskIds,
      emitCallableWorkflowTaskUpdated: this.options.emitCallableWorkflowTaskUpdated,
      emit: this.options.emit,
    });
    if (shouldCancelCallableWorkflowSymphonyLaunchChildren(current)) {
      try {
        await this.options.cancelCallableWorkflowSymphonyChildWait(current, input.reason);
      } catch (error) {
        console.warn("Callable workflow Symphony child cleanup failed after task cancellation.", {
          taskId: current.id,
          error,
        });
      }
    }
    return canceled;
  }

  pauseTask(input: PauseCallableWorkflowTaskInput): CallableWorkflowTaskSummary {
    return pauseAgentRuntimeCallableWorkflowTask(input, {
      store: this.options.store,
      taskAbortControllers: this.options.taskAbortControllers,
      runTaskIds: this.options.runTaskIds,
      emitCallableWorkflowTaskUpdated: this.options.emitCallableWorkflowTaskUpdated,
      emit: this.options.emit,
    });
  }

  async resumeTask(input: ResumeCallableWorkflowTaskInput): Promise<CallableWorkflowTaskSummary> {
    const current = this.options.store.getCallableWorkflowTask(input.taskId);
    if (isCallableWorkflowSymphonyChildWaitPreCompilePause(current)) {
      await this.options.executeCallableWorkflowTaskForThread(
        current.parentThreadId,
        current.id,
        this.options.store.getWorkspace(),
      );
      return this.options.store.getCallableWorkflowTask(current.id);
    }
    return resumeAgentRuntimeCallableWorkflowTask(input, {
      store: this.options.store,
      browser: this.options.browser,
      permissionRequester: this.options.permissionRequester,
      pluginHost: this.options.pluginHost,
      connectorRegistrations: this.options.workflowNativeTools?.connectorRegistrations,
      connectorAccountAuthorizer: this.options.workflowNativeTools?.connectorAccountAuthorizer,
      ensurePluginMcpToolTrusted: this.options.ensurePluginMcpToolTrusted,
      ...this.runtimeBridge(),
    });
  }

  async executeTaskForThread(
    threadId: string,
    taskId: string,
    workspace: WorkspaceState,
  ): Promise<void> {
    return executeAgentRuntimeCallableWorkflowTaskForThread(threadId, taskId, workspace, {
      store: this.options.store,
      browser: this.options.browser,
      permissionRequester: this.options.permissionRequester,
      pluginHost: this.options.pluginHost,
      callableWorkflowStore: createAgentRuntimeCallableWorkflowRunnerStore(
        this.options.store,
        this.options.emitCallableWorkflowTaskUpdated,
      ),
      connectorDescriptors: this.options.workflowNativeTools?.connectorDescriptors,
      connectorRegistrations: this.options.workflowNativeTools?.connectorRegistrations,
      connectorAccountAuthorizer: this.options.workflowNativeTools?.connectorAccountAuthorizer,
      readSearchRoutingSettings: this.options.readSearchRoutingSettings,
      ensurePluginMcpToolTrusted: this.options.ensurePluginMcpToolTrusted,
      launchWorkflowSubagents: this.options.launchWorkflowSubagents,
      ...this.runtimeBridge(),
    });
  }

  private runtimeBridge() {
    return createAgentRuntimeCallableWorkflowRuntimeBridge({
      taskAbortControllers: this.options.taskAbortControllers,
      runTaskIds: this.options.runTaskIds,
      emitCallableWorkflowTaskUpdated: this.options.emitCallableWorkflowTaskUpdated,
      emit: this.options.emit,
    });
  }
}
