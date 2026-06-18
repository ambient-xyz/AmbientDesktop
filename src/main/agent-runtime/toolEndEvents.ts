import type { PermissionMode } from "../../shared/permissionTypes";
import type { ToolArgumentProgressSnapshot, ToolEditInputPreview, ToolLongformInputPreview } from "../../shared/threadTypes";
import type { NormalizedPiEvent } from "./agentRuntimePiFacade";
import type {
  RuntimeToolResultEventStatus,
  RuntimeToolResultMessageUpdateInput,
} from "./toolResultUpdates";

export type RuntimeToolEndEvent = Extract<NormalizedPiEvent, { kind: "tool-end" }>;
export type RuntimeToolEndTerminalStatus = "done" | "error";

export interface RuntimeToolEndEventContext {
  workspacePath: string;
  permissionMode: PermissionMode;
  messageId?: string | undefined;
  previousInputContent?: string | undefined;
  previousLongformInputPreview?: ToolLongformInputPreview | undefined;
  previousEditInputPreview?: ToolEditInputPreview | undefined;
  argumentProgress?: ToolArgumentProgressSnapshot | undefined;
}

export interface RuntimeToolEndEventModel {
  toolCallId: string;
  label: string;
  terminalStatus: RuntimeToolEndTerminalStatus;
  statusLabel: "completed" | "failed";
  toolEventStatus: RuntimeToolResultEventStatus;
  resultContent: string;
  resultUpdateInput: RuntimeToolResultMessageUpdateInput;
  longformInputPreview?: ToolLongformInputPreview;
  editInputPreview?: ToolEditInputPreview;
}

export function runtimeToolEndEventModel(
  input: RuntimeToolEndEvent,
  context: RuntimeToolEndEventContext,
): RuntimeToolEndEventModel {
  const terminalStatus = input.status === "error" ? "error" : "done";
  const statusLabel = terminalStatus === "error" ? "failed" : "completed";
  const toolEventStatus = terminalStatus === "done" ? "completed" : "error";
  const longformInputPreview = input.longformInputPreview ?? context.previousLongformInputPreview;
  const editInputPreview = input.editInputPreview ?? context.previousEditInputPreview;

  const resultUpdateInput: RuntimeToolResultMessageUpdateInput = {
    toolCallId: input.toolCallId,
    label: input.label,
    inputContent: context.previousInputContent ?? "",
    resultContent: input.content,
    workspacePath: context.workspacePath,
    permissionMode: context.permissionMode,
    messageStatus: terminalStatus,
    statusLabel,
    eventStatus: toolEventStatus,
    ...(context.messageId ? { existingMessageId: context.messageId } : {}),
    ...(input.details ? { details: input.details } : {}),
    ...(input.resultDetails ? { resultDetails: input.resultDetails } : {}),
    ...(longformInputPreview ? { longformInputPreview } : {}),
    ...(editInputPreview ? { editInputPreview } : {}),
    ...(context.argumentProgress ? { argumentProgress: context.argumentProgress } : {}),
  };

  return {
    toolCallId: input.toolCallId,
    label: input.label,
    terminalStatus,
    statusLabel,
    toolEventStatus,
    resultContent: input.content,
    resultUpdateInput,
    ...(longformInputPreview ? { longformInputPreview } : {}),
    ...(editInputPreview ? { editInputPreview } : {}),
  };
}
