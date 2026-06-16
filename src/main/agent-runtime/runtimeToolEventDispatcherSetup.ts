import type { PermissionMode } from "../../shared/types";
import type { RuntimeAssistantTerminalCompletion } from "./runtimeAssistantTerminalCompletion";
import type { RuntimeEmptyAssistantStallWatchdog } from "./runtimeEmptyAssistantStallWatchdog";
import type { RuntimePostToolContinuationController } from "./runtimePostToolContinuationController";
import type { RuntimePromptLifecycleControls } from "./runtimePromptLifecycleControls";
import type { RuntimePromptRunState } from "./runtimePromptRunState";
import type { RuntimeStreamTraceState } from "./runtimeStreamTraceState";
import type { RuntimeToolArgumentWatchdog } from "./runtimeToolArgumentWatchdog";
import {
  createRuntimeToolEventDispatcher,
  type RuntimeToolArgumentProgressController,
  type RuntimeToolEventDispatcher,
  type RuntimeToolEventDispatcherInput,
} from "./runtimeToolEventDispatcher";
import type { RuntimeToolExecutionWatchdog } from "./runtimeToolExecutionWatchdog";
import type { RuntimeToolMessageController } from "./runtimeToolMessageController";
import type { RuntimeToolRecoveryContext } from "./runtimeToolRecoveryContext";

export interface RuntimeToolEventDispatcherSetupInput {
  threadId: string;
  runId: string;
  workspacePath: string;
  permissionMode: PermissionMode;
  toolMessages: RuntimeToolMessageController;
  toolArgumentProgress: RuntimeToolArgumentProgressController;
  toolArgumentWatchdog: Pick<RuntimeToolArgumentWatchdog, "schedule">;
  toolExecutionWatchdog: Pick<RuntimeToolExecutionWatchdog, "begin" | "mark" | "finish">;
  postToolContinuation: Pick<RuntimePostToolContinuationController, "markToolStart" | "markToolEnd">;
  startedToolCallIds: Set<string>;
  emptyAssistantStallWatchdog: Pick<RuntimeEmptyAssistantStallWatchdog, "clear">;
  assistantTerminalCompletion: Pick<RuntimeAssistantTerminalCompletion, "clear">;
  streamTraceState: Pick<RuntimeStreamTraceState, "markFirstToolArgumentObserved" | "markFirstToolExecutionObserved">;
  toolRecovery: Pick<
    RuntimeToolRecoveryContext,
    | "rememberToolIntent"
    | "trackInterruptedToolCallRecovery"
    | "markInterruptedToolCallNoLongerRecoverable"
    | "persistToolArgumentDiagnostics"
  >;
  promptLifecycleControls: Pick<RuntimePromptLifecycleControls, "setActiveRunStatus">;
  promptRunState: Pick<
    RuntimePromptRunState,
    "setLastCompletedTool" | "markAssistantTextNotObservedAfterLastToolEnd"
  >;
  requestSubagentParentControlAbort: RuntimeToolEventDispatcherInput["requestSubagentParentControlAbort"];
  refreshBrowsersForArtifactChange: (
    threadId: string,
    workspacePath: string,
    artifactPath: string,
  ) => unknown;
  createToolEventDispatcher?: (input: RuntimeToolEventDispatcherInput) => RuntimeToolEventDispatcher;
}

export function createRuntimeToolEventDispatcherSetup(
  input: RuntimeToolEventDispatcherSetupInput,
): RuntimeToolEventDispatcher {
  const createToolEventDispatcher = input.createToolEventDispatcher ?? createRuntimeToolEventDispatcher;
  return createToolEventDispatcher({
    runId: input.runId,
    workspacePath: input.workspacePath,
    permissionMode: input.permissionMode,
    toolMessages: input.toolMessages,
    toolArgumentProgress: input.toolArgumentProgress,
    toolArgumentWatchdog: input.toolArgumentWatchdog,
    toolExecutionWatchdog: input.toolExecutionWatchdog,
    postToolContinuation: input.postToolContinuation,
    startedToolCallIds: input.startedToolCallIds,
    clearEmptyAssistantStallWatchdog: input.emptyAssistantStallWatchdog.clear,
    clearAssistantTerminalCompletion: input.assistantTerminalCompletion.clear,
    markFirstToolArgumentObserved: input.streamTraceState.markFirstToolArgumentObserved,
    markFirstToolExecutionObserved: input.streamTraceState.markFirstToolExecutionObserved,
    rememberToolIntent: input.toolRecovery.rememberToolIntent,
    trackInterruptedToolCallRecovery: input.toolRecovery.trackInterruptedToolCallRecovery,
    markInterruptedToolCallNoLongerRecoverable: input.toolRecovery.markInterruptedToolCallNoLongerRecoverable,
    persistToolArgumentDiagnostics: input.toolRecovery.persistToolArgumentDiagnostics,
    setActiveRunToolStatus: () => {
      input.promptLifecycleControls.setActiveRunStatus("tool");
    },
    setLastCompletedTool: input.promptRunState.setLastCompletedTool,
    markAssistantTextNotObservedAfterLastToolEnd: input.promptRunState.markAssistantTextNotObservedAfterLastToolEnd,
    requestSubagentParentControlAbort: input.requestSubagentParentControlAbort,
    refreshBrowsersForArtifactChange: (artifactPath) => {
      void input.refreshBrowsersForArtifactChange(input.threadId, input.workspacePath, artifactPath);
    },
  });
}
