import type {
  PermissionMode,
  ToolArgumentProgressSnapshot,
  ToolEditInputPreview,
  ToolLongformInputPreview,
} from "../../shared/types";
import type { NormalizedPiEvent } from "../pi/piEventMapper";
import type { RuntimeToolResultMessageUpdateInput } from "./toolResultUpdates";

export type RuntimeToolUpdateEvent = Extract<NormalizedPiEvent, { kind: "tool-update" }>;

export interface RuntimeToolUpdateEventContext {
  workspacePath: string;
  permissionMode: PermissionMode;
  messageId?: string | undefined;
  previousInputContent?: string | undefined;
  previousLongformInputPreview?: ToolLongformInputPreview | undefined;
  previousEditInputPreview?: ToolEditInputPreview | undefined;
  argumentProgress?: ToolArgumentProgressSnapshot | undefined;
}

export type RuntimeToolUpdateEventModel =
  | {
      shouldUpdateMessage: false;
      reason: "missing-message" | "empty-result";
      toolCallId: string;
      label: string;
      resultContent: string;
    }
  | {
      shouldUpdateMessage: true;
      toolCallId: string;
      label: string;
      messageId: string;
      resultContent: string;
      toolEventStatus: "running";
      resultUpdateInput: RuntimeToolResultMessageUpdateInput;
      longformInputPreview?: ToolLongformInputPreview;
      editInputPreview?: ToolEditInputPreview;
    };

export function runtimeToolUpdateEventModel(
  input: RuntimeToolUpdateEvent,
  context: RuntimeToolUpdateEventContext,
): RuntimeToolUpdateEventModel {
  if (!context.messageId) {
    return skipToolUpdate(input, "missing-message");
  }
  if (!input.content) {
    return skipToolUpdate(input, "empty-result");
  }

  const longformInputPreview = input.longformInputPreview ?? context.previousLongformInputPreview;
  const editInputPreview = input.editInputPreview ?? context.previousEditInputPreview;
  const resultUpdateInput: RuntimeToolResultMessageUpdateInput = {
    toolCallId: input.toolCallId,
    label: input.label,
    inputContent: context.previousInputContent ?? "",
    resultContent: input.content,
    workspacePath: context.workspacePath,
    permissionMode: context.permissionMode,
    messageStatus: "running",
    statusLabel: "running",
    eventStatus: "running",
    existingMessageId: context.messageId,
    ...(input.details ? { details: input.details } : {}),
    ...(input.resultDetails ? { resultDetails: input.resultDetails } : {}),
    ...(longformInputPreview ? { longformInputPreview } : {}),
    ...(editInputPreview ? { editInputPreview } : {}),
    ...(context.argumentProgress ? { argumentProgress: context.argumentProgress } : {}),
  };

  return {
    shouldUpdateMessage: true,
    toolCallId: input.toolCallId,
    label: input.label,
    messageId: context.messageId,
    resultContent: input.content,
    toolEventStatus: "running",
    resultUpdateInput,
    ...(longformInputPreview ? { longformInputPreview } : {}),
    ...(editInputPreview ? { editInputPreview } : {}),
  };
}

function skipToolUpdate(
  input: RuntimeToolUpdateEvent,
  reason: "missing-message" | "empty-result",
): RuntimeToolUpdateEventModel {
  return {
    shouldUpdateMessage: false,
    reason,
    toolCallId: input.toolCallId,
    label: input.label,
    resultContent: input.content,
  };
}
