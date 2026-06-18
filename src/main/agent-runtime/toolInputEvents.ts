import type { InterruptedToolCallRecoverySnapshot, ToolArgumentStreamEventType, ToolEditInputPreview, ToolLongformInputPreview } from "../../shared/threadTypes";
import { serializeToolInputForInterruptedRecovery } from "./recovery/interruptedToolCallRecovery";
import type { NormalizedPiEvent } from "./agentRuntimePiFacade";

export type RuntimeToolInputEventKind = "tool-input-start" | "tool-input-update" | "tool-input-end";
export type RuntimeToolInputEvent = Extract<NormalizedPiEvent, { kind: RuntimeToolInputEventKind }>;

export interface PreviousRuntimeToolInputEventState {
  previousInputContent?: string | undefined;
  previousLongformInputPreview?: ToolLongformInputPreview | undefined;
  previousEditInputPreview?: ToolEditInputPreview | undefined;
}

export interface RuntimeToolInputEventModel {
  toolCallId: string;
  label: string;
  statusLabel: "preparing" | "prepared";
  argumentEventType: ToolArgumentStreamEventType;
  inputContent: string;
  shouldEmitRunningToolEvent: boolean;
  recoveryCapture: {
    text: string;
    source: InterruptedToolCallRecoverySnapshot["source"];
  };
  longformInputPreview?: ToolLongformInputPreview;
  editInputPreview?: ToolEditInputPreview;
}

export function runtimeToolInputEventModel(
  input: RuntimeToolInputEvent,
  previous: PreviousRuntimeToolInputEventState = {},
): RuntimeToolInputEventModel {
  const inputContent = input.content.trim()
    ? input.kind === "tool-input-update" && input.contentDelta && input.input === undefined
      ? `${previous.previousInputContent ?? ""}${input.content}`
      : input.content
    : (previous.previousInputContent ?? "");
  const recoveryCapture = serializeToolInputForInterruptedRecovery(input.input, inputContent);
  const longformInputPreview = input.longformInputPreview ?? previous.previousLongformInputPreview;
  const editInputPreview = input.editInputPreview ?? previous.previousEditInputPreview;

  return {
    toolCallId: input.toolCallId,
    label: input.label,
    statusLabel: input.kind === "tool-input-end" ? "prepared" : "preparing",
    argumentEventType: argumentEventTypeForToolInputKind(input.kind),
    inputContent,
    shouldEmitRunningToolEvent: input.kind !== "tool-input-update",
    recoveryCapture,
    ...(longformInputPreview ? { longformInputPreview } : {}),
    ...(editInputPreview ? { editInputPreview } : {}),
  };
}

function argumentEventTypeForToolInputKind(kind: RuntimeToolInputEventKind): ToolArgumentStreamEventType {
  if (kind === "tool-input-start") return "toolcall_start";
  if (kind === "tool-input-end") return "toolcall_end";
  return "toolcall_delta";
}
