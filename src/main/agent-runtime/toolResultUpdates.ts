import type { PermissionMode } from "../../shared/permissionTypes";
import type { ToolEventDetails } from "../../shared/desktopTypes";
import type { ToolArgumentProgressSnapshot, ToolEditInputPreview, ToolLongformInputPreview } from "../../shared/threadTypes";
import { workspaceArtifactPathFromTool } from "../agent-runtime/agentRuntimeMediaArtifacts";
import { chatToolEventDetails, formatToolTranscript, toolEventLabel } from "./tools/agentRuntimeToolTranscript";
import { toolMessageMetadata } from "./tools/agentRuntimeToolMessageMetadata";
import type { ToolResultDetails } from "../pi/piEventMapper";

export type RuntimeToolResultMessageStatus = "running" | "done" | "error";
export type RuntimeToolResultEventStatus = "running" | "completed" | "error";

export interface RuntimeToolResultMessageUpdateInput {
  toolCallId: string;
  label: string;
  inputContent: string;
  resultContent: string;
  workspacePath: string;
  permissionMode: PermissionMode;
  messageStatus: RuntimeToolResultMessageStatus;
  statusLabel: string;
  eventStatus: RuntimeToolResultEventStatus;
  existingMessageId?: string;
  details?: Record<string, string>;
  resultDetails?: ToolResultDetails;
  longformInputPreview?: ToolLongformInputPreview;
  editInputPreview?: ToolEditInputPreview;
  argumentProgress?: ToolArgumentProgressSnapshot;
}

export interface RuntimeToolResultMessageUpdate {
  toolCallId: string;
  label: string;
  inputContent: string;
  resultContent: string;
  existingMessageId?: string;
  artifactPath?: string;
  content: string;
  metadata: Record<string, unknown>;
  toolEventLabel: string;
  toolEventDetails: ToolEventDetails;
}

export function runtimeToolResultMessageUpdate({
  toolCallId,
  label,
  inputContent,
  resultContent,
  workspacePath,
  permissionMode,
  messageStatus,
  statusLabel,
  eventStatus,
  existingMessageId,
  details,
  resultDetails,
  longformInputPreview,
  editInputPreview,
  argumentProgress,
}: RuntimeToolResultMessageUpdateInput): RuntimeToolResultMessageUpdate {
  const artifactPath = workspaceArtifactPathFromTool(label, inputContent, resultContent, workspacePath);
  const toolEventDetails = chatToolEventDetails(details, permissionMode, eventStatus, label, argumentProgress);
  const transcriptInputContent = existingMessageId ? inputContent : "";
  return {
    toolCallId,
    label,
    inputContent,
    resultContent,
    ...(existingMessageId ? { existingMessageId } : {}),
    ...(artifactPath ? { artifactPath } : {}),
    content: formatToolTranscript(label, statusLabel, transcriptInputContent, resultContent),
    metadata: toolMessageMetadata(
      messageStatus,
      toolCallId,
      label,
      artifactPath,
      resultDetails,
      longformInputPreview,
      editInputPreview,
      argumentProgress,
    ),
    toolEventLabel: toolEventLabel(label, toolEventDetails),
    toolEventDetails,
  };
}
