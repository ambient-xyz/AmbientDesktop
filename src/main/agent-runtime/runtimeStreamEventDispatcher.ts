import type { DesktopEvent } from "../../shared/types";
import {
  assistantTerminalEventDiagnostic,
  type AssistantTerminalEventDiagnostic,
} from "../agentRuntimeAssistantTerminalDiagnostics";
import type { NormalizedPiEvent } from "../piEventMapper";
import { runtimeAgentEndEventModel, type RuntimeAgentEndEvent } from "./agentEndEvents";
import { runtimeAssistantEndEventModel, type RuntimeAssistantEndEvent } from "./assistantEndEvents";
import { runtimeAssistantUpdateEventModel, type RuntimeAssistantUpdateEvent } from "./assistantUpdateEvents";
import { runtimeCompactionEventModel, type RuntimeCompactionEvent } from "./compactionEvents";
import { runtimeProviderRetryEventModel, type RuntimeProviderRetryEvent } from "./providerRetryEvents";
import type { RuntimeAssistantMessageController } from "./runtimeAssistantMessageController";
import type { RuntimeAssistantTerminalCompletion } from "./runtimeAssistantTerminalCompletion";
import type { RuntimeEmptyAssistantStallWatchdog } from "./runtimeEmptyAssistantStallWatchdog";
import type { RuntimePostToolContinuationController } from "./runtimePostToolContinuationController";
import type { RuntimeToolMessageController } from "./runtimeToolMessageController";
import { runtimeThinkingEventModel, type RuntimeThinkingEvent } from "./thinkingEvents";

export interface RuntimeStreamEventStateAccessors {
  receivedAnyText: () => boolean;
  setReceivedAnyText: (value: boolean) => void;
  currentAssistantReceivedText: () => boolean;
  setCurrentAssistantReceivedText: (value: boolean) => void;
  currentAssistantFinalText: () => string;
  setCurrentAssistantFinalText: (value: string) => void;
  assistantOutputChars: () => number;
  setAssistantOutputChars: (value: number) => void;
  assistantTextObservedAfterLastToolEnd: () => boolean;
  setAssistantTextObservedAfterLastToolEnd: (value: boolean) => void;
  hasLastCompletedTool: () => boolean;
  lastAssistantTerminalEvent: () => AssistantTerminalEventDiagnostic | undefined;
  setLastAssistantTerminalEvent: (value: AssistantTerminalEventDiagnostic | undefined) => void;
  currentThinkingReceivedText: () => boolean;
  setCurrentThinkingReceivedText: (value: boolean) => void;
  currentThinkingFinalText: () => string;
  setCurrentThinkingFinalText: (value: string) => void;
  thinkingOutputChars: () => number;
  setThinkingOutputChars: (value: number) => void;
  setRuntimeError: (value: string | undefined) => void;
  providerRetryAttemptCount: () => number;
  setProviderRetryAttemptCount: (value: number) => void;
  providerRetryLastError: () => string | undefined;
  setProviderRetryLastError: (value: string | undefined) => void;
  providerRetryBeforeVisibleOutput: () => boolean;
  setProviderRetryBeforeVisibleOutput: (value: boolean) => void;
  providerRetryRecovered: () => boolean;
  setProviderRetryRecovered: (value: boolean) => void;
}

export interface RuntimeStreamEventDispatcherInput {
  threadId: string;
  assistantTerminalGraceMs: number;
  state: RuntimeStreamEventStateAccessors;
  runtimeMessages: RuntimeAssistantMessageController;
  emptyAssistantStallWatchdog: Pick<RuntimeEmptyAssistantStallWatchdog, "clear" | "schedule">;
  assistantTerminalCompletion: Pick<RuntimeAssistantTerminalCompletion, "schedule">;
  postToolContinuation: Pick<RuntimePostToolContinuationController, "markAgentEnd">;
  toolMessages: Pick<RuntimeToolMessageController, "size">;
  shouldIgnoreAssistantTerminalCleanupError: (error: string) => boolean;
  pushAssistantVisibleDelta: (delta: string) => string | undefined;
  flushAssistantVisibleText: () => string | undefined;
  markFirstAssistantVisibleText: () => void;
  markPiStreamActivity: () => void;
  setActiveRunStatus: (status: "streaming" | "compacting" | "retrying") => void;
  reconcileQueueUpdate: (steering: string[], followUp: string[]) => void;
  recordContextUsageSnapshot: (snapshotMessage?: string) => void;
  emitRunEvent: (event: DesktopEvent) => void;
}

export interface RuntimeStreamEventDispatcher {
  handle(event: NormalizedPiEvent, rawEvent: unknown, input?: { assistantStartEvent?: boolean }): boolean;
}

export function createRuntimeStreamEventDispatcher(
  input: RuntimeStreamEventDispatcherInput,
): RuntimeStreamEventDispatcher {
  const clearEmptyAssistantStallWatchdog = () => {
    input.emptyAssistantStallWatchdog.clear();
  };

  const applyRuntimeAssistantEndEvent = (event: RuntimeAssistantEndEvent, rawEvent: unknown, trailingVisibleText?: string) => {
    const cleanupAbort = event.error ? input.shouldIgnoreAssistantTerminalCleanupError(event.error) : false;
    const assistantEnd = runtimeAssistantEndEventModel(event, {
      cleanupAbort,
      trailingVisibleText,
      receivedAnyText: input.state.receivedAnyText(),
      currentAssistantReceivedText: input.state.currentAssistantReceivedText(),
      currentAssistantFinalText: input.state.currentAssistantFinalText(),
      assistantOutputChars: input.state.assistantOutputChars(),
      assistantTextObservedAfterLastToolEnd: input.state.assistantTextObservedAfterLastToolEnd(),
      hasLastCompletedTool: input.state.hasLastCompletedTool(),
      hasLastAssistantTerminalEvent: Boolean(input.state.lastAssistantTerminalEvent()),
    });
    if (assistantEnd.runtimeError.kind === "set") input.state.setRuntimeError(assistantEnd.runtimeError.message);
    if (assistantEnd.shouldRecordTerminalDiagnostic) {
      input.state.setLastAssistantTerminalEvent(assistantTerminalEventDiagnostic(rawEvent, event.finalText ?? "", event.error));
    }
    input.state.setReceivedAnyText(assistantEnd.receivedAnyText);
    input.state.setCurrentAssistantReceivedText(assistantEnd.currentAssistantReceivedText);
    input.state.setCurrentAssistantFinalText(assistantEnd.currentAssistantFinalText);
    input.state.setAssistantOutputChars(assistantEnd.assistantOutputChars);
    input.state.setAssistantTextObservedAfterLastToolEnd(assistantEnd.assistantTextObservedAfterLastToolEnd);
    if (assistantEnd.markFirstAssistantVisibleText) input.markFirstAssistantVisibleText();
    if (assistantEnd.primaryMessageOperation.kind === "replace") {
      const updated = input.runtimeMessages.replaceCurrentAssistant(
        assistantEnd.primaryMessageOperation.content,
        assistantEnd.primaryMessageOperation.metadata,
      );
      input.emitRunEvent({ type: "message-updated", message: updated });
    } else {
      input.runtimeMessages.finishCurrentAssistantMessage(
        assistantEnd.primaryMessageOperation.status,
        input.state.currentAssistantFinalText(),
      );
    }
    if (assistantEnd.trailingMessageOperation) {
      input.runtimeMessages.appendAssistantDelta(assistantEnd.trailingMessageOperation.delta);
    }
    input.assistantTerminalCompletion.schedule(input.assistantTerminalGraceMs);
  };

  const applyRuntimeAssistantUpdateEvent = (event: RuntimeAssistantUpdateEvent, visibleDelta?: string) => {
    const assistantUpdate = runtimeAssistantUpdateEventModel(event, {
      cleanupAbort: event.error ? input.shouldIgnoreAssistantTerminalCleanupError(event.error) : false,
      visibleDelta,
      receivedAnyText: input.state.receivedAnyText(),
      currentAssistantReceivedText: input.state.currentAssistantReceivedText(),
      currentAssistantFinalText: input.state.currentAssistantFinalText(),
      assistantOutputChars: input.state.assistantOutputChars(),
      assistantTextObservedAfterLastToolEnd: input.state.assistantTextObservedAfterLastToolEnd(),
      hasLastCompletedTool: input.state.hasLastCompletedTool(),
    });
    if (assistantUpdate.runtimeError.kind === "set") input.state.setRuntimeError(assistantUpdate.runtimeError.message);
    input.state.setReceivedAnyText(assistantUpdate.receivedAnyText);
    input.state.setCurrentAssistantReceivedText(assistantUpdate.currentAssistantReceivedText);
    input.state.setCurrentAssistantFinalText(assistantUpdate.currentAssistantFinalText);
    input.state.setAssistantOutputChars(assistantUpdate.assistantOutputChars);
    input.state.setAssistantTextObservedAfterLastToolEnd(assistantUpdate.assistantTextObservedAfterLastToolEnd);
    if (assistantUpdate.markFirstAssistantVisibleText) input.markFirstAssistantVisibleText();
    if (assistantUpdate.messageOperation?.kind === "append") {
      input.runtimeMessages.appendAssistantDelta(assistantUpdate.messageOperation.delta);
    }
    if (assistantUpdate.markPiStreamActivity) input.markPiStreamActivity();
    if (assistantUpdate.activeRunStatus) input.setActiveRunStatus(assistantUpdate.activeRunStatus);
  };

  const applyRuntimeThinkingEvent = (event: RuntimeThinkingEvent) => {
    const thinkingEvent = runtimeThinkingEventModel(event, {
      currentThinkingReceivedText: input.state.currentThinkingReceivedText(),
      currentThinkingFinalText: input.state.currentThinkingFinalText(),
      thinkingOutputChars: input.state.thinkingOutputChars(),
    });
    input.state.setCurrentThinkingReceivedText(thinkingEvent.currentThinkingReceivedText);
    input.state.setCurrentThinkingFinalText(thinkingEvent.currentThinkingFinalText);
    input.state.setThinkingOutputChars(thinkingEvent.thinkingOutputChars);
    if (thinkingEvent.messageOperation?.kind === "ensure") {
      input.runtimeMessages.ensureThinkingMessage();
    } else if (thinkingEvent.messageOperation?.kind === "append") {
      input.runtimeMessages.appendThinkingDelta(thinkingEvent.messageOperation.delta);
    } else if (thinkingEvent.messageOperation?.kind === "replace") {
      const updated = input.runtimeMessages.replaceCurrentThinking(
        thinkingEvent.messageOperation.content,
        thinkingEvent.messageOperation.metadata,
      );
      input.emitRunEvent({ type: "message-updated", message: updated });
    }
    if (thinkingEvent.markPiStreamActivity) input.markPiStreamActivity();
    if (thinkingEvent.activeRunStatus) input.setActiveRunStatus(thinkingEvent.activeRunStatus);
    if (thinkingEvent.finish) input.runtimeMessages.finishCurrentThinkingMessage("done", input.state.currentThinkingFinalText());
  };

  const applyRuntimeCompactionEvent = (event: RuntimeCompactionEvent) => {
    const compactionEvent = runtimeCompactionEventModel(event, {
      threadId: input.threadId,
    });
    if (compactionEvent.kind === "start") input.setActiveRunStatus(compactionEvent.activeRunStatus);
    input.recordContextUsageSnapshot(compactionEvent.snapshotMessage);
    input.emitRunEvent({
      type: "runtime-activity",
      activity: compactionEvent.activity,
    });
    if (compactionEvent.kind === "end") {
      if (compactionEvent.runtimeError.kind === "set") input.state.setRuntimeError(compactionEvent.runtimeError.message);
      if (compactionEvent.activeRunStatus) input.setActiveRunStatus(compactionEvent.activeRunStatus);
    }
  };

  const applyRuntimeProviderRetryEvent = (event: RuntimeProviderRetryEvent) => {
    const retryEvent = runtimeProviderRetryEventModel(event, {
      threadId: input.threadId,
      providerRetryAttemptCount: input.state.providerRetryAttemptCount(),
      providerRetryLastError: input.state.providerRetryLastError(),
      providerRetryBeforeVisibleOutput: input.state.providerRetryBeforeVisibleOutput(),
      providerRetryRecovered: input.state.providerRetryRecovered(),
      receivedAnyText: input.state.receivedAnyText(),
      assistantOutputChars: input.state.assistantOutputChars(),
      thinkingOutputChars: input.state.thinkingOutputChars(),
      activeToolMessageCount: input.toolMessages.size(),
    });
    input.state.setProviderRetryAttemptCount(retryEvent.providerRetryAttemptCount);
    input.state.setProviderRetryLastError(retryEvent.providerRetryLastError);
    input.state.setProviderRetryBeforeVisibleOutput(retryEvent.providerRetryBeforeVisibleOutput);
    input.state.setProviderRetryRecovered(retryEvent.providerRetryRecovered);
    if (retryEvent.kind === "start") {
      if (retryEvent.runtimeError.kind === "clear") input.state.setRuntimeError(undefined);
      input.setActiveRunStatus(retryEvent.activeRunStatus);
    } else if (retryEvent.runtimeError.kind === "clear") {
      input.state.setRuntimeError(undefined);
    }
    input.emitRunEvent({
      type: "runtime-activity",
      activity: retryEvent.activity,
    });
    if (retryEvent.kind === "end") {
      if (retryEvent.runtimeError.kind === "set") input.state.setRuntimeError(retryEvent.runtimeError.message);
      if (retryEvent.activeRunStatus) input.setActiveRunStatus(retryEvent.activeRunStatus);
    }
  };

  const applyRuntimeAgentEndEvent = (event: RuntimeAgentEndEvent, rawEvent: unknown) => {
    clearEmptyAssistantStallWatchdog();
    input.postToolContinuation.markAgentEnd();
    const agentEnd = runtimeAgentEndEventModel(event, {
      rawEvent,
      shouldIgnoreError: input.shouldIgnoreAssistantTerminalCleanupError,
      receivedAnyText: input.state.receivedAnyText(),
      currentAssistantFinalText: input.state.currentAssistantFinalText(),
      assistantTextObservedAfterLastToolEnd: input.state.assistantTextObservedAfterLastToolEnd(),
      hasLastCompletedTool: input.state.hasLastCompletedTool(),
    });
    input.state.setLastAssistantTerminalEvent(agentEnd.terminalDiagnostic);
    if (agentEnd.runtimeError.kind === "set") input.state.setRuntimeError(agentEnd.runtimeError.message);
    input.state.setCurrentAssistantFinalText(agentEnd.currentAssistantFinalText);
    input.state.setAssistantTextObservedAfterLastToolEnd(agentEnd.assistantTextObservedAfterLastToolEnd);
    input.assistantTerminalCompletion.schedule(input.assistantTerminalGraceMs);
  };

  return {
    handle(event, rawEvent, handleInput = {}) {
      if (handleInput.assistantStartEvent) {
        input.runtimeMessages.startAssistantMessage();
        input.emptyAssistantStallWatchdog.schedule();
        return true;
      }

      if (event.kind === "queue-update") {
        clearEmptyAssistantStallWatchdog();
        input.reconcileQueueUpdate(event.steering, event.followUp);
        return true;
      }

      if (event.kind === "compaction-start" || event.kind === "compaction-end") {
        clearEmptyAssistantStallWatchdog();
        applyRuntimeCompactionEvent(event);
        return true;
      }

      if (event.kind === "auto-retry-start" || event.kind === "auto-retry-end") {
        clearEmptyAssistantStallWatchdog();
        applyRuntimeProviderRetryEvent(event);
        return true;
      }

      if (isRuntimeThinkingEvent(event)) {
        clearEmptyAssistantStallWatchdog();
        applyRuntimeThinkingEvent(event);
        return true;
      }

      if (event.kind === "assistant-update") {
        if (event.error) clearEmptyAssistantStallWatchdog();
        let visibleDelta: string | undefined;
        if (event.delta) {
          clearEmptyAssistantStallWatchdog();
          visibleDelta = input.pushAssistantVisibleDelta(event.delta);
        }
        if (event.finalText && !input.state.currentAssistantReceivedText()) {
          clearEmptyAssistantStallWatchdog();
        }
        applyRuntimeAssistantUpdateEvent(event, visibleDelta);
        return true;
      }

      if (event.kind === "assistant-end") {
        clearEmptyAssistantStallWatchdog();
        const trailingVisibleText = input.flushAssistantVisibleText();
        applyRuntimeAssistantEndEvent(event, rawEvent, trailingVisibleText);
        return true;
      }

      if (event.kind === "agent-end") {
        applyRuntimeAgentEndEvent(event, rawEvent);
        return true;
      }

      return false;
    },
  };
}

function isRuntimeThinkingEvent(event: NormalizedPiEvent): event is RuntimeThinkingEvent {
  return event.kind === "thinking-start" ||
    event.kind === "thinking-update" ||
    event.kind === "thinking-end";
}
