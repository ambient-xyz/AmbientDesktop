import type { CallableWorkflowParentBlockingBlock } from "./agentRuntimeCallableWorkflowFacade";
import type { AssistantTerminalCleanupDiagnostic } from "../agent-runtime/agentRuntimeAssistantTerminalDiagnostics";
import type { SubagentFinalizationBarrierBlock } from "../agent-runtime/agentRuntimeFinalizationBlocking";
import type { SubagentParentControlAbortIntent } from "./tools/agentRuntimeToolMessageMetadata";
import type { EmptyAssistantResponseMetadata } from "./emptyAssistantFinalization";

export type FinalAssistantMessageStatus = "done" | "error" | "aborted" | "awaiting-input";

export interface FinalAssistantMessageInput {
  currentAssistantVisibleContent: string;
  abortRequested: boolean;
  abortMessage: string;
  receivedAnyText: boolean;
  finalizedAfterToolIdle: boolean;
  awaitingInputAfterTools: boolean;
  emptyAssistantResponse: boolean;
  retryEmptyAssistantResponse: boolean;
  emptyResponseText: string;
  emptyAssistantResponseMetadata?: EmptyAssistantResponseMetadata | undefined;
  assistantTerminalCleanupInterrupted: boolean;
  assistantTerminalCleanupDiagnostic?: AssistantTerminalCleanupDiagnostic | undefined;
  subagentParentControlAbortIntent?: SubagentParentControlAbortIntent | undefined;
  parentFinalizationBlockMessage: string;
  subagentFinalizationBlock?: SubagentFinalizationBarrierBlock | undefined;
  subagentFinalizationParentMailboxEventIds: string[];
  callableWorkflowFinalizationBlock?: CallableWorkflowParentBlockingBlock | undefined;
  callableWorkflowFinalizationParentMailboxEventId?: string | undefined;
  providerRetryBeforeVisibleOutput: boolean;
  providerRetryRecovered: boolean;
  providerRetryAttemptCount: number;
  discardProviderRetrySession: boolean;
  providerRetrySessionFile?: string | undefined;
  providerRetryLastError?: string | undefined;
}

export interface FinalAssistantMessageModel {
  status: FinalAssistantMessageStatus;
  content: string;
  metadata: Record<string, unknown>;
  finalizationErrorText: string;
  parentFinalizationBlocked: boolean;
}

export function finalAssistantMessageModel(input: FinalAssistantMessageInput): FinalAssistantMessageModel {
  const parentFinalizationBlocked = Boolean(input.subagentFinalizationBlock || input.callableWorkflowFinalizationBlock);
  const status =
    input.abortRequested
      ? "aborted"
      : input.assistantTerminalCleanupInterrupted
        ? "aborted"
        : (input.emptyAssistantResponse && !input.retryEmptyAssistantResponse) || parentFinalizationBlocked
          ? "error"
          : input.awaitingInputAfterTools
            ? "awaiting-input"
            : "done";
  const finalizationErrorText = input.parentFinalizationBlockMessage || input.emptyResponseText;
  const content =
    input.parentFinalizationBlockMessage ||
    input.currentAssistantVisibleContent ||
    (input.abortRequested
      ? input.abortMessage
      : input.emptyAssistantResponse
        ? input.emptyResponseText
        : input.awaitingInputAfterTools
          ? "Tool calls completed. Ambient is awaiting your next instruction."
          : input.receivedAnyText
            ? ""
            : "Ambient finished without assistant text.");

  return {
    status,
    content,
    finalizationErrorText,
    parentFinalizationBlocked,
    metadata: {
      status,
      runtime: "pi",
      provider: "ambient",
      finalizedAfterToolIdle: input.finalizedAfterToolIdle,
      awaitingInputAfterTools: input.awaitingInputAfterTools,
      ...(input.subagentParentControlAbortIntent ? { subagentParentControlAbort: input.subagentParentControlAbortIntent } : {}),
      ...(input.assistantTerminalCleanupInterrupted ? { terminalCleanupInterrupted: true } : {}),
      ...(input.assistantTerminalCleanupDiagnostic ? { piTerminalCleanup: input.assistantTerminalCleanupDiagnostic } : {}),
      ...(input.emptyAssistantResponseMetadata ? { piEmptyAssistantResponse: input.emptyAssistantResponseMetadata } : {}),
      ...(input.retryEmptyAssistantResponse ? { retryingEmptyAssistantResponse: true } : {}),
      ...(input.subagentFinalizationBlock
        ? {
            subagentFinalizationBlocked: {
              reason: "required_wait_barrier_not_satisfied",
              barrierIds: input.subagentFinalizationBlock.barrierIds,
              childRunIds: input.subagentFinalizationBlock.childRunIds,
              childBlockers: input.subagentFinalizationBlock.childBlockers,
              barriers: input.subagentFinalizationBlock.barriers,
              parentMailboxEventIds: input.subagentFinalizationParentMailboxEventIds,
            },
          }
        : {}),
      ...(input.callableWorkflowFinalizationBlock
        ? {
            callableWorkflowFinalizationBlocked: {
              reason: input.callableWorkflowFinalizationBlock.reason,
              taskIds: input.callableWorkflowFinalizationBlock.taskIds,
              launchIds: input.callableWorkflowFinalizationBlock.launchIds,
              workflowArtifactIds: input.callableWorkflowFinalizationBlock.workflowArtifactIds,
              workflowRunIds: input.callableWorkflowFinalizationBlock.workflowRunIds,
              waitingTaskIds: input.callableWorkflowFinalizationBlock.waitingTaskIds,
              attentionTaskIds: input.callableWorkflowFinalizationBlock.attentionTaskIds,
              tasks: input.callableWorkflowFinalizationBlock.tasks,
              parentMailboxEventId: input.callableWorkflowFinalizationParentMailboxEventId,
            },
          }
        : {}),
      ...(input.providerRetryBeforeVisibleOutput
        ? {
            piProviderRetry: {
              beforeVisibleOutput: true,
              recovered: input.providerRetryRecovered,
              attemptCount: input.providerRetryAttemptCount,
              sessionDiscarded: input.discardProviderRetrySession,
              ...(input.providerRetrySessionFile ? { sessionFile: input.providerRetrySessionFile } : {}),
              ...(input.providerRetryLastError ? { lastError: input.providerRetryLastError.slice(0, 240) } : {}),
            },
          }
        : {}),
    },
  };
}
