import type {
  ToolArgumentProgressSnapshot,
  ToolEditInputPreview,
  ToolLongformInputPreview,
} from "../../shared/types";
import { workspaceArtifactPathFromTool } from "../agentRuntimeMediaArtifacts";
import { formatToolTranscript } from "../agentRuntimeToolTranscript";
import { toolMessageMetadata } from "../agentRuntimeToolMessageMetadata";

export interface RuntimeToolInputMessageUpsertInput {
  toolCallId: string;
  label: string;
  statusLabel: string;
  inputContent: string;
  workspacePath: string;
  existingMessageId?: string;
  longformInputPreview?: ToolLongformInputPreview;
  editInputPreview?: ToolEditInputPreview;
  previousLongformInputPreview?: ToolLongformInputPreview;
  previousEditInputPreview?: ToolEditInputPreview;
  argumentProgress?: ToolArgumentProgressSnapshot;
}

export interface RuntimeToolInputMessageUpsert {
  toolCallId: string;
  label: string;
  inputContent: string;
  existingMessageId?: string;
  artifactPath?: string;
  content: string;
  metadata: Record<string, unknown>;
  persistedLongformInputPreview?: ToolLongformInputPreview;
  persistedEditInputPreview?: ToolEditInputPreview;
}

export function runtimeToolInputMessageUpsert({
  toolCallId,
  label,
  statusLabel,
  inputContent,
  workspacePath,
  existingMessageId,
  longformInputPreview,
  editInputPreview,
  previousLongformInputPreview,
  previousEditInputPreview,
  argumentProgress,
}: RuntimeToolInputMessageUpsertInput): RuntimeToolInputMessageUpsert {
  const persistedLongformInputPreview = longformInputPreview ?? previousLongformInputPreview;
  const persistedEditInputPreview = editInputPreview ?? previousEditInputPreview;
  const artifactPath = workspaceArtifactPathFromTool(label, inputContent, "", workspacePath);
  return {
    toolCallId,
    label,
    inputContent,
    ...(existingMessageId ? { existingMessageId } : {}),
    ...(artifactPath ? { artifactPath } : {}),
    content: formatToolTranscript(label, statusLabel, inputContent),
    metadata: toolMessageMetadata(
      "running",
      toolCallId,
      label,
      artifactPath,
      undefined,
      persistedLongformInputPreview,
      persistedEditInputPreview,
      argumentProgress,
    ),
    ...(persistedLongformInputPreview ? { persistedLongformInputPreview } : {}),
    ...(persistedEditInputPreview ? { persistedEditInputPreview } : {}),
  };
}
