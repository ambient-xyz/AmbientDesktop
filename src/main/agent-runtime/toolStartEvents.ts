import type { ToolEditInputPreview, ToolLongformInputPreview } from "../../shared/threadTypes";
import type { NormalizedPiEvent } from "./agentRuntimePiFacade";

export type RuntimeToolStartEvent = Extract<NormalizedPiEvent, { kind: "tool-start" }>;

export interface PreviousRuntimeToolStartEventState {
  previousLongformInputPreview?: ToolLongformInputPreview | undefined;
  previousEditInputPreview?: ToolEditInputPreview | undefined;
}

export interface RuntimeToolStartEventModel {
  toolCallId: string;
  label: string;
  inputContent: string;
  statusLabel: "running";
  toolEventStatus: "running";
  longformInputPreview?: ToolLongformInputPreview;
  editInputPreview?: ToolEditInputPreview;
  argumentProgressInput: {
    toolCallId: string;
    toolName: string;
    inputContent: string;
    longformInputPreview?: ToolLongformInputPreview;
  };
}

export function runtimeToolStartEventModel(
  input: RuntimeToolStartEvent,
  previous: PreviousRuntimeToolStartEventState = {},
): RuntimeToolStartEventModel {
  const longformInputPreview = input.longformInputPreview ?? previous.previousLongformInputPreview;
  const editInputPreview = input.editInputPreview ?? previous.previousEditInputPreview;
  return {
    toolCallId: input.toolCallId,
    label: input.label,
    inputContent: input.content,
    statusLabel: "running",
    toolEventStatus: "running",
    ...(longformInputPreview ? { longformInputPreview } : {}),
    ...(editInputPreview ? { editInputPreview } : {}),
    argumentProgressInput: {
      toolCallId: input.toolCallId,
      toolName: input.label,
      inputContent: input.content,
      ...(longformInputPreview ? { longformInputPreview } : {}),
    },
  };
}
