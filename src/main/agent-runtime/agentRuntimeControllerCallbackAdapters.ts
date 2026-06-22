import type { ContextUsageSnapshot, ThreadSummary } from "../../shared/threadTypes";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type { AgentRuntimeServiceControllerOptions } from "./agentRuntimeServiceControllers";
import type { AgentRuntimeSubagentWorkflowControllerOptions } from "./agentRuntimeSubagentWorkflowControllers";

type ServiceControllerCallbacks = AgentRuntimeServiceControllerOptions["callbacks"];

export type AgentRuntimeServiceControllerRuntimeCallbacks = Omit<
  ServiceControllerCallbacks,
  "recordUnavailableContextUsageSnapshot"
> & {
  unavailableContextUsageSnapshot: (thread: ThreadSummary, message: string) => ContextUsageSnapshot;
};

export interface AgentRuntimeServiceControllerCallbackAdapterInput {
  store: Pick<ProjectStore, "recordContextUsageSnapshot">;
  runtime: AgentRuntimeServiceControllerRuntimeCallbacks;
}

export function createAgentRuntimeServiceControllerCallbackAdapters({
  runtime,
  store,
}: AgentRuntimeServiceControllerCallbackAdapterInput): ServiceControllerCallbacks {
  const { unavailableContextUsageSnapshot, ...callbacks } = runtime;
  return {
    ...callbacks,
    recordUnavailableContextUsageSnapshot: (thread, message) =>
      store.recordContextUsageSnapshot(unavailableContextUsageSnapshot(thread, message)),
  };
}

export function createAgentRuntimeSubagentWorkflowCallbackAdapters(
  callbacks: AgentRuntimeSubagentWorkflowControllerOptions["callbacks"],
): AgentRuntimeSubagentWorkflowControllerOptions["callbacks"] {
  return callbacks;
}
