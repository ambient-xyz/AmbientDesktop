import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import type { CallableWorkflowRunnerLaunchInput } from "./agentRuntimeCallableWorkflowFacade";
import type { SubagentRuntimeEventEmitter } from "./agentRuntimePiFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type {
  createSubagentPiToolDefinitions,
  executeSubagentBarrierDecision,
  executeSubagentCancelAgent,
  CreateSubagentPiToolDefinitionsOptions,
} from "./agentRuntimeSubagentsFacade";

export type AgentRuntimeCallableWorkflowSymphonyBridgeStore = Pick<
  ProjectStore,
  | "getCallableWorkflowTask"
  | "listSubagentWaitBarriersForParentRun"
  | "getSubagentRun"
  | "listSubagentRunEvents"
  | "getSubagentWaitBarrier"
  | "updateSubagentWaitBarrierStatus"
  | "pauseCallableWorkflowTask"
  | "cancelCallableWorkflowTask"
  | "failCallableWorkflowTask"
>;
export type ExecuteSubagentCancelAgent = typeof executeSubagentCancelAgent;
export type ExecuteSubagentBarrierDecision = typeof executeSubagentBarrierDecision;
export type CallableWorkflowSymphonyBridgeEventingStore = CreateSubagentPiToolDefinitionsOptions["store"] &
  Parameters<ExecuteSubagentCancelAgent>[0]["store"] &
  Parameters<ExecuteSubagentBarrierDecision>[0]["store"];
export type CallableWorkflowSymphonyBridgeRuntime = Required<
  Pick<
    NonNullable<CreateSubagentPiToolDefinitionsOptions["runtime"]>,
    "startChildRun" | "waitForChildRun" | "cancelChildRun" | "followupChildRun" | "retryChildRun" | "resolveChildApprovalResponse"
  >
>;

export interface AgentRuntimeCallableWorkflowSymphonyBridgeDependencies {
  createSubagentPiToolDefinitions: typeof createSubagentPiToolDefinitions;
  executeSubagentBarrierDecision: ExecuteSubagentBarrierDecision;
  executeSubagentCancelAgent: ExecuteSubagentCancelAgent;
}

export interface AgentRuntimeCallableWorkflowSymphonyBridgeControllerOptions {
  store: AgentRuntimeCallableWorkflowSymphonyBridgeStore;
  createSubagentEventingStore: () => CallableWorkflowSymphonyBridgeEventingStore;
  getFeatureFlagSnapshot: CreateSubagentPiToolDefinitionsOptions["getFeatureFlagSnapshot"];
  resolveSymphonyLaunchContract?: CreateSubagentPiToolDefinitionsOptions["resolveSymphonyLaunchContract"];
  resolveModelRuntimeProfile: NonNullable<CreateSubagentPiToolDefinitionsOptions["resolveModelRuntimeProfile"]>;
  resolveCapacityLease: NonNullable<CreateSubagentPiToolDefinitionsOptions["resolveCapacityLease"]>;
  prepareChildWorktree: NonNullable<CreateSubagentPiToolDefinitionsOptions["prepareChildWorktree"]>;
  runtime: CallableWorkflowSymphonyBridgeRuntime;
  createRuntimeCancelEventEmitter: (run: SubagentRunSummary) => SubagentRuntimeEventEmitter;
  createRuntimeRetryEventEmitter: (run: SubagentRunSummary) => SubagentRuntimeEventEmitter;
  emitCallableWorkflowTaskUpdated: (task: CallableWorkflowTaskSummary) => void;
  emitSubagentWaitBarrierUpdated: (barrier: SubagentWaitBarrierSummary) => void;
  dependencies?: Partial<AgentRuntimeCallableWorkflowSymphonyBridgeDependencies>;
}

export type CallableWorkflowSymphonyLaunchBridgeContract = NonNullable<
  CallableWorkflowRunnerLaunchInput["handoffPlan"]["compiler"]["launchBridgeContract"]
>;
