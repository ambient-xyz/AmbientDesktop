import type { DesktopEvent } from "../../shared/desktopTypes";
import type { PermissionPromptResponseMode, PermissionRequest } from "../../shared/permissionTypes";
import type { SubagentParentMailboxEventSummary, SubagentRunSummary } from "../../shared/subagentTypes";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type { SubagentRuntimeEventEmitter } from "./agentRuntimePiFacade";
import type { RuntimeSendMessageInput } from "./agentRuntimeSendPreparationController";
import type { SubagentChildTurnCompletion } from "./agentRuntimeSubagentChildTurnCoordinator";

export interface SubagentChildExecutionRecord {
  childThreadId: string;
  promise: Promise<void>;
  startedAt: string;
}

export type AgentRuntimeSubagentChildLifecycleStore = Pick<
  ProjectStore,
  | "appendSubagentLifecycleInterruptionParentMailboxEvent"
  | "appendSubagentMailboxEvent"
  | "appendSubagentRunEvent"
  | "getSubagentRun"
  | "getThread"
  | "getWorkspace"
  | "listMessages"
  | "listSubagentRunEvents"
  | "listSubagentWaitBarriersForParentRun"
  | "markSubagentRunStatus"
  | "recordSubagentPromptSnapshot"
  | "updateSubagentMailboxEventDeliveryState"
>;

export interface AgentRuntimeSubagentChildLifecycleCoordinatorOptions {
  store: AgentRuntimeSubagentChildLifecycleStore;
  executions: Map<string, SubagentChildExecutionRecord>;
  permissions: {
    listPending?: () => PermissionRequest[];
    respond?: (id: string, response: PermissionPromptResponseMode) => void;
  };
  send: (
    input: RuntimeSendMessageInput,
    hooks?: { awaitInternalRetryCompletion?: boolean },
  ) => Promise<unknown>;
  abortChildThread: (threadId: string, options?: { skipSubagentChildCancellation?: boolean }) => Promise<void>;
  emit: (event: DesktopEvent) => void;
  emitSubagentParentMailboxEventUpdated: (event: SubagentParentMailboxEventSummary) => void;
  resolveTerminalChildWaitBarriers: (run: SubagentRunSummary, reason: string) => void;
  completeTurnAfterSend: (input: {
    run: SubagentRunSummary;
    role: SubagentRunSummary["roleProfileSnapshot"];
    childMessageCountBeforeSend: number;
    emitEvent: SubagentRuntimeEventEmitter;
  }) => SubagentChildTurnCompletion;
  recordFollowupExhausted: (input: {
    run: SubagentRunSummary;
    completion: Extract<SubagentChildTurnCompletion, { status: "needs_followup" }>;
  }) => void;
  recordGroupedCompletionIfNeeded: (run: SubagentRunSummary, summary: string) => void;
  now?: () => Date;
}
