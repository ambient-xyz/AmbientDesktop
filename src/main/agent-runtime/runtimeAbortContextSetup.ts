import type { DesktopEvent } from "../../shared/desktopTypes";
import type { SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { RuntimePromptLifecycleControls } from "./runtimePromptLifecycleControls";
import type { RuntimeQueuedMessageController, RuntimeQueuedMessageSnapshot } from "./runtimeQueuedMessageController";
import type { RuntimeRunEventScope } from "./runtimeRunEventScope";
import type { RuntimeTextOutputState } from "./runtimeTextOutputState";
import {
  createRuntimeAbortContext,
  type RuntimeAbortContext,
  type RuntimeAbortContextInput,
} from "./runtimeAbortContext";

type RuntimeFinishableRunStatus = "done" | "error" | "aborted" | "interrupted";

export interface RuntimeAbortContextSetupInput<Session> {
  threadId: string;
  runId: string;
  dedicatedSessionKind?: "workflow-recording-review";
  activeRunSettled: Promise<void>;
  runEventScope: Pick<RuntimeRunEventScope, "addActivityListener" | "detachFromWorkspace">;
  queuedMessages: Pick<RuntimeQueuedMessageController, "enqueue" | "markQueuedMessagesAborted">;
  outputState: Pick<RuntimeTextOutputState, "assistantOutputChars" | "thinkingOutputChars">;
  promptLifecycleControls: Pick<RuntimePromptLifecycleControls, "signalParentControlAbort">;
  isRunStoreActive: () => boolean;
  finishRun: (runId: string, status: RuntimeFinishableRunStatus, errorMessage?: string) => unknown;
  denyThread: (threadId: string) => void;
  getSession: () => Session | undefined;
  abortSessionRun: (session: Session, threadId: string) => Promise<void>;
  markSubagentParentControlBarrierReconciled: (input: {
    waitBarrierId: string;
    source: "runtime_parent_abort";
  }) => SubagentWaitBarrierSummary;
  cascadeSubagentsForStoppedParentRun: (threadId: string, runId: string, reason: string) => Promise<void>;
  emitRunEvent: (event: DesktopEvent) => void;
  createAbortContext?: (input: RuntimeAbortContextInput<Session>) => RuntimeAbortContext;
}

export function createRuntimeAbortContextSetup<Session>(
  input: RuntimeAbortContextSetupInput<Session>,
): RuntimeAbortContext {
  const createAbortContext = input.createAbortContext ?? createRuntimeAbortContext;
  return createAbortContext({
    threadId: input.threadId,
    runId: input.runId,
    dedicatedSessionKind: input.dedicatedSessionKind,
    activeRunSettled: input.activeRunSettled,
    addActivityListener: input.runEventScope.addActivityListener,
    queueMessage: (queuedMessage: RuntimeQueuedMessageSnapshot) => input.queuedMessages.enqueue(queuedMessage),
    isRunStoreActive: input.isRunStoreActive,
    finishRun: input.finishRun,
    markQueuedMessagesAborted: input.queuedMessages.markQueuedMessagesAborted,
    denyThread: input.denyThread,
    detachFromWorkspace: input.runEventScope.detachFromWorkspace,
    getSession: input.getSession,
    abortSessionRun: input.abortSessionRun,
    markSubagentParentControlBarrierReconciled: input.markSubagentParentControlBarrierReconciled,
    cascadeSubagentsForStoppedParentRun: input.cascadeSubagentsForStoppedParentRun,
    getOutputChars: input.outputState.assistantOutputChars,
    getThinkingChars: input.outputState.thinkingOutputChars,
    signalParentControlAbort: input.promptLifecycleControls.signalParentControlAbort,
    emitRunEvent: input.emitRunEvent,
  });
}
