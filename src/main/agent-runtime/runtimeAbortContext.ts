import type {
  DesktopEvent,
  SubagentWaitBarrierSummary,
} from "../../shared/types";
import type { SubagentParentControlAbortIntent } from "../agentRuntimeToolMessageMetadata";
import { runtimeSubagentParentControlAbortActivity } from "../agentRuntimeSubagentParentControlActivity";
import type { RuntimeActiveRunHandoffActiveRun } from "./runtimeActiveRunHandoff";
import type { RuntimeQueuedMessageSnapshot } from "./runtimeQueuedMessageController";

type RuntimeFinishableRunStatus = "done" | "error" | "aborted" | "interrupted";

export interface RuntimeAbortContextActiveRun extends RuntimeActiveRunHandoffActiveRun {
  abort: () => Promise<void>;
  detach: () => void;
  queue: (message: RuntimeQueuedMessageSnapshot) => Promise<void>;
}

export interface RuntimeAbortContextInput<Session> {
  threadId: string;
  runId: string;
  dedicatedSessionKind?: "workflow-recording-review";
  activeRunSettled: Promise<void>;
  addActivityListener?: (listener: () => void) => () => void;
  queueMessage: (message: RuntimeQueuedMessageSnapshot) => Promise<void>;
  isRunStoreActive: () => boolean;
  finishRun: (runId: string, status: RuntimeFinishableRunStatus, errorMessage?: string) => unknown;
  markQueuedMessagesAborted: () => void;
  denyThread: (threadId: string) => void;
  detachFromWorkspace: () => void;
  getSession: () => Session | undefined;
  abortSessionRun: (session: Session, threadId: string) => Promise<void>;
  markSubagentParentControlBarrierReconciled: (input: {
    waitBarrierId: string;
    source: "runtime_parent_abort";
  }) => SubagentWaitBarrierSummary;
  cascadeSubagentsForStoppedParentRun: (threadId: string, runId: string, reason: string) => Promise<void>;
  getOutputChars: () => number;
  getThinkingChars: () => number;
  signalParentControlAbort: () => void;
  emitRunEvent: (event: DesktopEvent) => void;
}

export interface RuntimeAbortContext {
  activeRun: RuntimeAbortContextActiveRun;
  abortRequested: () => boolean;
  subagentParentControlAbortIntent: () => SubagentParentControlAbortIntent | undefined;
  finishParentRun: (status: RuntimeFinishableRunStatus, errorMessage?: string) => void;
  consumeSubagentParentControlAbort: () => Promise<void>;
  requestSubagentParentControlAbort: (intent: SubagentParentControlAbortIntent) => void;
}

export function createRuntimeAbortContext<Session>(
  input: RuntimeAbortContextInput<Session>,
): RuntimeAbortContext {
  let abortRequested = false;
  let subagentParentControlAbortIntent: SubagentParentControlAbortIntent | undefined;
  let subagentParentControlAbortConsumed = false;
  let subagentParentControlBarrierReconciled = false;

  const abortCurrentSession = () => {
    const session = input.getSession();
    if (session) void input.abortSessionRun(session, input.threadId).catch(() => undefined);
  };

  const markAbortRequested = () => {
    abortRequested = true;
    input.markQueuedMessagesAborted();
    input.denyThread(input.threadId);
  };

  const markSubagentParentControlBarrierReconciled = () => {
    const waitBarrierId = subagentParentControlAbortIntent?.waitBarrierId;
    if (!waitBarrierId || subagentParentControlBarrierReconciled || !input.isRunStoreActive()) return;
    try {
      const barrier = input.markSubagentParentControlBarrierReconciled({
        waitBarrierId,
        source: "runtime_parent_abort",
      });
      subagentParentControlBarrierReconciled = true;
      input.emitRunEvent({ type: "subagent-wait-barrier-updated", barrier });
    } catch {
      // Best-effort marker; startup reconciliation can still recover from the persisted barrier.
    }
  };

  const finishParentRun = (
    status: RuntimeFinishableRunStatus,
    errorMessage?: string,
  ) => {
    input.finishRun(input.runId, status, errorMessage);
    if (subagentParentControlAbortIntent) markSubagentParentControlBarrierReconciled();
  };

  const activeRun: RuntimeAbortContextActiveRun = {
    abort: async () => {
      markAbortRequested();
      if (input.isRunStoreActive()) finishParentRun("aborted");
      const session = input.getSession();
      if (session) await input.abortSessionRun(session, input.threadId);
    },
    detach: () => {
      markAbortRequested();
      input.detachFromWorkspace();
      abortCurrentSession();
    },
    queue: (queuedMessage) => input.queueMessage(queuedMessage),
    settled: input.activeRunSettled,
    dedicatedSessionKind: input.dedicatedSessionKind,
    addActivityListener: input.addActivityListener,
  };

  const consumeSubagentParentControlAbort = async () => {
    if (!subagentParentControlAbortIntent || subagentParentControlAbortConsumed || !input.isRunStoreActive()) return;
    subagentParentControlAbortConsumed = true;
    await input.cascadeSubagentsForStoppedParentRun(
      input.threadId,
      input.runId,
      subagentParentControlAbortIntent.reason,
    );
  };

  const requestSubagentParentControlAbort = (intent: SubagentParentControlAbortIntent) => {
    if (subagentParentControlAbortIntent) return;
    subagentParentControlAbortIntent = intent;
    markAbortRequested();
    input.emitRunEvent({
      type: "runtime-activity",
      activity: runtimeSubagentParentControlAbortActivity({
        threadId: input.threadId,
        outputChars: input.getOutputChars(),
        thinkingChars: input.getThinkingChars(),
        intent,
      }),
    });
    abortCurrentSession();
    input.signalParentControlAbort();
  };

  return {
    activeRun,
    abortRequested: () => abortRequested,
    subagentParentControlAbortIntent: () => subagentParentControlAbortIntent,
    finishParentRun,
    consumeSubagentParentControlAbort,
    requestSubagentParentControlAbort,
  };
}
