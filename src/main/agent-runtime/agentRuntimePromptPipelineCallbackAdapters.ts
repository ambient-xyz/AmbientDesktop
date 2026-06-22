import type { WorkflowPlanEditIntentKind } from "../../shared/workflowThreadPlanEdit";
import type { AgentRuntimePromptPipelineControllerOptions } from "./agentRuntimePromptPipelineControllers";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type { AgentRuntimeRemoteSurfaceControls } from "./agentRuntimeRemoteSurfaceControls";

type PromptPipelineCallbacks = AgentRuntimePromptPipelineControllerOptions["callbacks"];
type PromptPipelinePreflightInput = Parameters<PromptPipelineCallbacks["preflightBeforePrompt"]>[0];
type AdapterOwnedCallback =
  | "clearWorkflowPlanEditIntent"
  | "completePendingProjectSwitch"
  | "deletePendingProjectSwitch"
  | "getRunRecord"
  | "preflightBeforePrompt"
  | "setWorkflowPlanEditIntent"
  | "takePendingProjectSwitch";

export type AgentRuntimePromptPipelineRuntimeCallbacks = Omit<
  PromptPipelineCallbacks,
  AdapterOwnedCallback
> & {
  preflightBeforePrompt: (
    thread: PromptPipelinePreflightInput["thread"],
    session: PromptPipelinePreflightInput["session"],
    promptContent: PromptPipelinePreflightInput["promptContent"],
    setActiveRunStatus: PromptPipelinePreflightInput["setActiveRunStatus"],
    isRunStoreActive: PromptPipelinePreflightInput["isRunStoreActive"],
    emitRunEvent: PromptPipelinePreflightInput["emitRunEvent"],
  ) => ReturnType<PromptPipelineCallbacks["preflightBeforePrompt"]>;
};

export interface AgentRuntimePromptPipelineCallbackAdapterInput {
  store: Pick<ProjectStore, "getRunRecord">;
  workflowPlanEditIntentByThreadId: Pick<Map<string, WorkflowPlanEditIntentKind>, "delete" | "set">;
  workflowPlanEditWorkflowThreadByThreadId: Pick<Map<string, string>, "delete" | "set">;
  pendingProjectSwitches: Pick<
    AgentRuntimeRemoteSurfaceControls,
    "completePendingProjectSwitch" | "deletePendingProjectSwitch" | "takePendingProjectSwitch"
  >;
  runtime: AgentRuntimePromptPipelineRuntimeCallbacks;
}

export function createAgentRuntimePromptPipelineCallbackAdapters({
  pendingProjectSwitches,
  runtime,
  store,
  workflowPlanEditIntentByThreadId,
  workflowPlanEditWorkflowThreadByThreadId,
}: AgentRuntimePromptPipelineCallbackAdapterInput): PromptPipelineCallbacks {
  const { preflightBeforePrompt, ...runtimeCallbacks } = runtime;
  return {
    ...runtimeCallbacks,
    clearWorkflowPlanEditIntent: (threadId) => {
      workflowPlanEditIntentByThreadId.delete(threadId);
      workflowPlanEditWorkflowThreadByThreadId.delete(threadId);
    },
    completePendingProjectSwitch: (projectSwitch, switchInput) =>
      pendingProjectSwitches.completePendingProjectSwitch(projectSwitch, switchInput),
    deletePendingProjectSwitch: (threadId) => {
      pendingProjectSwitches.deletePendingProjectSwitch(threadId);
    },
    getRunRecord: (runId) => {
      try {
        return store.getRunRecord(runId);
      } catch {
        return undefined;
      }
    },
    preflightBeforePrompt: (preflightInput) =>
      preflightBeforePrompt(
        preflightInput.thread,
        preflightInput.session,
        preflightInput.promptContent,
        preflightInput.setActiveRunStatus,
        preflightInput.isRunStoreActive,
        preflightInput.emitRunEvent,
      ),
    setWorkflowPlanEditIntent: (threadId, intent, workflowThreadId) => {
      workflowPlanEditIntentByThreadId.set(threadId, intent);
      workflowPlanEditWorkflowThreadByThreadId.set(threadId, workflowThreadId);
    },
    takePendingProjectSwitch: (threadId) => pendingProjectSwitches.takePendingProjectSwitch(threadId),
  };
}
