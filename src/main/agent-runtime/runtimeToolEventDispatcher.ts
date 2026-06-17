import type {
  PermissionMode,
  ToolArgumentProgressSnapshot,
  ToolArgumentStreamEventType,
  ToolIntentSnapshot,
  ToolLongformInputPreview,
} from "../../shared/types";
import { subagentParentControlAbortIntentFromToolEnd, type SubagentParentControlAbortIntent } from "./tools/agentRuntimeToolMessageMetadata";
import type { NormalizedPiEvent } from "../pi/piEventMapper";
import {
  toolContinuationLinesFromToolContent,
  type CompletedToolSnapshot,
} from "./post-tool/postToolContinuationScheduler";
import { runtimeToolInputEventModel, type RuntimeToolInputEvent } from "./toolInputEvents";
import { runtimeToolStartEventModel, type RuntimeToolStartEvent } from "./toolStartEvents";
import { runtimeToolUpdateEventModel, type RuntimeToolUpdateEvent } from "./toolUpdateEvents";
import { runtimeToolEndEventModel, type RuntimeToolEndEvent } from "./toolEndEvents";
import { runtimeToolResultMessageUpdate } from "./toolResultUpdates";
import type { RuntimePostToolContinuationController } from "./runtimePostToolContinuationController";
import type { RuntimeToolArgumentWatchdog } from "./runtimeToolArgumentWatchdog";
import type { RuntimeToolExecutionWatchdog } from "./runtimeToolExecutionWatchdog";
import type { RuntimeToolMessageController } from "./runtimeToolMessageController";

export type RuntimeToolDispatchEvent =
  | RuntimeToolInputEvent
  | RuntimeToolStartEvent
  | RuntimeToolUpdateEvent
  | RuntimeToolEndEvent;

export interface RuntimeToolArgumentProgressController {
  current(toolCallId: string): ToolArgumentProgressSnapshot | undefined;
  recordArgumentEvent(input: {
    toolCallId: string;
    toolName: string;
    eventType: ToolArgumentStreamEventType;
    inputContent: string;
    longformInputPreview?: ToolLongformInputPreview;
  }): ToolArgumentProgressSnapshot;
  markExecutionStart(input: {
    toolCallId: string;
    toolName: string;
    inputContent?: string;
    longformInputPreview?: ToolLongformInputPreview;
  }): ToolArgumentProgressSnapshot;
  markExecutionEnd(input: {
    toolCallId: string;
    toolName: string;
  }): ToolArgumentProgressSnapshot;
}

export interface RuntimeToolEventDispatcherInput {
  runId: string;
  workspacePath: string;
  permissionMode: PermissionMode;
  toolMessages: RuntimeToolMessageController;
  toolArgumentProgress: RuntimeToolArgumentProgressController;
  toolArgumentWatchdog: Pick<RuntimeToolArgumentWatchdog, "schedule">;
  toolExecutionWatchdog: Pick<RuntimeToolExecutionWatchdog, "begin" | "mark" | "finish">;
  postToolContinuation: Pick<RuntimePostToolContinuationController, "markToolStart" | "markToolEnd">;
  startedToolCallIds: Set<string>;
  clearEmptyAssistantStallWatchdog: () => void;
  clearAssistantTerminalCompletion: () => void;
  markFirstToolArgumentObserved: () => void;
  markFirstToolExecutionObserved: () => void;
  rememberToolIntent: (
    toolCallId: string,
    toolName: string,
    rawInput: unknown,
    visibleInput: string,
  ) => ToolIntentSnapshot;
  trackInterruptedToolCallRecovery: (
    toolCallId: string,
    toolName: string,
    rawInput: unknown,
    visibleInput: string,
    argumentProgress: ToolArgumentProgressSnapshot,
  ) => ToolArgumentProgressSnapshot;
  markInterruptedToolCallNoLongerRecoverable: (
    toolCallId: string,
    argumentProgress: ToolArgumentProgressSnapshot,
  ) => ToolArgumentProgressSnapshot;
  persistToolArgumentDiagnostics: (force?: boolean) => void;
  setActiveRunToolStatus: () => void;
  setLastCompletedTool: (tool: CompletedToolSnapshot) => void;
  markAssistantTextNotObservedAfterLastToolEnd: () => void;
  requestSubagentParentControlAbort: (intent: SubagentParentControlAbortIntent) => void;
  refreshBrowsersForArtifactChange: (artifactPath: string) => void;
}

export interface RuntimeToolEventDispatcher {
  handle(event: NormalizedPiEvent, rawEvent: unknown, eventSeq: number): boolean;
}

export function createRuntimeToolEventDispatcher(
  input: RuntimeToolEventDispatcherInput,
): RuntimeToolEventDispatcher {
  const clearToolStreamState = () => {
    input.clearEmptyAssistantStallWatchdog();
    input.clearAssistantTerminalCompletion();
  };

  const handleToolInputEvent = (event: RuntimeToolInputEvent) => {
    clearToolStreamState();
    const inputEvent = runtimeToolInputEventModel(event, {
      previousInputContent: input.toolMessages.inputContent(event.toolCallId),
      previousLongformInputPreview: input.toolMessages.longformInputPreview(event.toolCallId),
      previousEditInputPreview: input.toolMessages.editInputPreview(event.toolCallId),
    });
    input.markFirstToolArgumentObserved();
    input.rememberToolIntent(inputEvent.toolCallId, inputEvent.label, event.input, inputEvent.inputContent);
    if (inputEvent.recoveryCapture.text.trim()) {
      input.toolMessages.rememberRecoveryInput(
        inputEvent.toolCallId,
        inputEvent.recoveryCapture.text,
        inputEvent.recoveryCapture.source,
      );
    }
    let argumentProgress = input.toolArgumentProgress.recordArgumentEvent({
      toolCallId: inputEvent.toolCallId,
      toolName: inputEvent.label,
      eventType: inputEvent.argumentEventType,
      inputContent: inputEvent.inputContent,
      ...(inputEvent.longformInputPreview ? { longformInputPreview: inputEvent.longformInputPreview } : {}),
    });
    argumentProgress = input.trackInterruptedToolCallRecovery(
      inputEvent.toolCallId,
      inputEvent.label,
      event.input,
      inputEvent.inputContent,
      argumentProgress,
    );
    input.persistToolArgumentDiagnostics(
      event.kind !== "tool-input-update" || argumentProgress.observedArgumentChars >= 10_000 || argumentProgress.deltaChars >= 10_000,
    );
    input.toolArgumentWatchdog.schedule();
    const toolMessage = input.toolMessages.upsertInputMessage({
      toolCallId: inputEvent.toolCallId,
      label: inputEvent.label,
      statusLabel: inputEvent.statusLabel,
      inputContent: inputEvent.inputContent,
      longformInputPreview: inputEvent.longformInputPreview,
      editInputPreview: inputEvent.editInputPreview,
      argumentProgress,
    });
    input.setActiveRunToolStatus();
    if (inputEvent.shouldEmitRunningToolEvent) {
      input.toolMessages.emitRunningToolEvent({
        label: inputEvent.label,
        status: "running",
        argumentProgress,
        message: toolMessage,
      });
    }
  };

  const handleToolStartEvent = (event: RuntimeToolStartEvent) => {
    clearToolStreamState();
    input.toolExecutionWatchdog.begin(event.toolCallId, event.label);
    input.postToolContinuation.markToolStart(event.toolCallId);
    input.startedToolCallIds.add(event.toolCallId);
    input.markFirstToolExecutionObserved();
    const startEvent = runtimeToolStartEventModel(event, {
      previousLongformInputPreview: input.toolMessages.longformInputPreview(event.toolCallId),
      previousEditInputPreview: input.toolMessages.editInputPreview(event.toolCallId),
    });
    input.rememberToolIntent(startEvent.toolCallId, startEvent.label, undefined, startEvent.inputContent);
    let argumentProgress = input.toolArgumentProgress.markExecutionStart(startEvent.argumentProgressInput);
    argumentProgress = input.markInterruptedToolCallNoLongerRecoverable(event.toolCallId, argumentProgress);
    input.persistToolArgumentDiagnostics(true);
    input.toolArgumentWatchdog.schedule();
    const toolMessage = input.toolMessages.upsertInputMessage({
      toolCallId: startEvent.toolCallId,
      label: startEvent.label,
      statusLabel: startEvent.statusLabel,
      inputContent: startEvent.inputContent,
      longformInputPreview: startEvent.longformInputPreview,
      editInputPreview: startEvent.editInputPreview,
      argumentProgress,
    });
    input.setActiveRunToolStatus();
    input.toolMessages.emitRunningToolEvent({
      label: startEvent.label,
      status: startEvent.toolEventStatus,
      details: event.details,
      argumentProgress,
      message: toolMessage,
    });
  };

  const handleToolUpdateEvent = (event: RuntimeToolUpdateEvent) => {
    clearToolStreamState();
    input.toolExecutionWatchdog.mark(event.toolCallId, event.label);
    input.toolMessages.rememberLongformInputPreview(event.toolCallId, event.longformInputPreview);
    input.toolMessages.rememberEditInputPreview(event.toolCallId, event.editInputPreview);
    const updateEvent = runtimeToolUpdateEventModel(event, {
      workspacePath: input.workspacePath,
      permissionMode: input.permissionMode,
      messageId: input.toolMessages.messageId(event.toolCallId),
      previousInputContent: input.toolMessages.inputContent(event.toolCallId),
      previousLongformInputPreview: input.toolMessages.longformInputPreview(event.toolCallId),
      previousEditInputPreview: input.toolMessages.editInputPreview(event.toolCallId),
      argumentProgress: input.toolArgumentProgress.current(event.toolCallId),
    });
    if (!updateEvent.shouldUpdateMessage) return;
    const resultUpdate = runtimeToolResultMessageUpdate(updateEvent.resultUpdateInput);
    input.toolMessages.applyResultUpdate(resultUpdate, updateEvent.toolEventStatus);
  };

  const handleToolEndEvent = (event: RuntimeToolEndEvent, rawEvent: unknown, eventSeq: number) => {
    clearToolStreamState();
    input.toolExecutionWatchdog.finish(event.toolCallId);
    input.postToolContinuation.markToolEnd(event.toolCallId);
    const messageId = input.toolMessages.messageId(event.toolCallId);
    const inputContent = input.toolMessages.inputContent(event.toolCallId) ?? "";
    input.toolMessages.rememberLongformInputPreview(event.toolCallId, event.longformInputPreview);
    input.toolMessages.rememberEditInputPreview(event.toolCallId, event.editInputPreview);
    const longformInputPreview = event.longformInputPreview ?? input.toolMessages.longformInputPreview(event.toolCallId);
    const editInputPreview = event.editInputPreview ?? input.toolMessages.editInputPreview(event.toolCallId);
    let argumentProgress = input.toolArgumentProgress.markExecutionEnd({
      toolCallId: event.toolCallId,
      toolName: event.label,
    });
    argumentProgress = input.markInterruptedToolCallNoLongerRecoverable(event.toolCallId, argumentProgress);
    input.persistToolArgumentDiagnostics(true);
    input.toolArgumentWatchdog.schedule();
    const endEvent = runtimeToolEndEventModel(event, {
      workspacePath: input.workspacePath,
      permissionMode: input.permissionMode,
      messageId,
      previousInputContent: inputContent,
      previousLongformInputPreview: longformInputPreview,
      previousEditInputPreview: editInputPreview,
      argumentProgress,
    });
    const completedTool: CompletedToolSnapshot = {
      label: endEvent.label,
      status: endEvent.terminalStatus,
      runId: input.runId,
      toolCallId: endEvent.toolCallId,
      eventSeqAtEnd: eventSeq,
      continuationLines: toolContinuationLinesFromToolContent(endEvent.resultContent),
    };
    input.setLastCompletedTool(completedTool);
    input.markAssistantTextNotObservedAfterLastToolEnd();
    const resultUpdate = runtimeToolResultMessageUpdate(endEvent.resultUpdateInput);
    const toolMessage = input.toolMessages.applyResultUpdate(resultUpdate, endEvent.terminalStatus);
    completedTool.messageId = toolMessage.id;
    input.toolMessages.cleanupToolCall(event.toolCallId);
    if (endEvent.terminalStatus === "done") {
      const controlIntent = subagentParentControlAbortIntentFromToolEnd(event, rawEvent);
      if (controlIntent) {
        input.requestSubagentParentControlAbort(controlIntent);
        return;
      }
    }
    if (endEvent.terminalStatus === "done" && resultUpdate.artifactPath) {
      input.refreshBrowsersForArtifactChange(resultUpdate.artifactPath);
    }
  };

  return {
    handle(event, rawEvent, eventSeq) {
      if (isRuntimeToolInputEvent(event)) {
        handleToolInputEvent(event);
        return true;
      }
      if (event.kind === "tool-start") {
        handleToolStartEvent(event);
        return true;
      }
      if (event.kind === "tool-update") {
        handleToolUpdateEvent(event);
        return true;
      }
      if (event.kind === "tool-end") {
        handleToolEndEvent(event, rawEvent, eventSeq);
        return true;
      }
      return false;
    },
  };
}

function isRuntimeToolInputEvent(event: NormalizedPiEvent): event is RuntimeToolInputEvent {
  return event.kind === "tool-input-start" ||
    event.kind === "tool-input-update" ||
    event.kind === "tool-input-end";
}
