import type {
  PermissionMode,
  ToolArgumentProgressSnapshot,
  ToolEditInputPreview,
  ToolEventDetails,
  ToolLongformInputPreview,
} from "../../shared/types";
import { workspaceArtifactPathFromTool } from "../agent-runtime/agentRuntimeMediaArtifacts";
import { chatToolEventDetails, formatToolTranscript, toolEventLabel } from "./tools/agentRuntimeToolTranscript";
import { toolMessageMetadata } from "./tools/agentRuntimeToolMessageMetadata";

export interface RuntimeOpenToolFailureContext {
  toolCallId: string;
  label: string;
  executionStarted: boolean;
  progress?: ToolArgumentProgressSnapshot;
}

export type RuntimeOpenToolFailureReason = string | ((context: RuntimeOpenToolFailureContext) => string);

export interface RuntimeOpenToolFailureUpdate {
  toolCallId: string;
  messageId: string;
  label: string;
  resolvedReason: string;
  visibleInput: string;
  artifactPath?: string;
  messageContent: string;
  messageMetadata: Record<string, unknown>;
  toolEventLabel: string;
  toolEventDetails: ToolEventDetails;
}

export interface RuntimeOpenToolFailureUpdatesInput {
  toolMessageIds: ReadonlyMap<string, string>;
  workspacePath: string;
  permissionMode: PermissionMode;
  progressForToolCall: (toolCallId: string) => ToolArgumentProgressSnapshot | undefined;
  toolInputs: ReadonlyMap<string, string>;
  toolLabels: ReadonlyMap<string, string>;
  toolLongformInputPreviews: ReadonlyMap<string, ToolLongformInputPreview>;
  toolEditInputPreviews: ReadonlyMap<string, ToolEditInputPreview>;
  startedToolCallIds: ReadonlySet<string>;
  reason: RuntimeOpenToolFailureReason;
}

export function runtimeOpenToolFailureUpdates({
  toolMessageIds,
  workspacePath,
  permissionMode,
  progressForToolCall,
  toolInputs,
  toolLabels,
  toolLongformInputPreviews,
  toolEditInputPreviews,
  startedToolCallIds,
  reason,
}: RuntimeOpenToolFailureUpdatesInput): RuntimeOpenToolFailureUpdate[] {
  const updates: RuntimeOpenToolFailureUpdate[] = [];
  for (const [toolCallId, messageId] of [...toolMessageIds]) {
    const progress = progressForToolCall(toolCallId);
    const inputContent = toolInputs.get(toolCallId);
    if (!progress && inputContent === undefined) continue;
    const label = progress?.toolName ?? toolLabels.get(toolCallId) ?? "tool";
    const executionStarted = startedToolCallIds.has(toolCallId) || Boolean(progress?.executionStartedAt);
    const resolvedReason =
      typeof reason === "function" ? reason({ toolCallId, label, executionStarted, ...(progress ? { progress } : {}) }) : reason;
    const visibleInput = inputContent ?? "";
    const longformInputPreview = toolLongformInputPreviews.get(toolCallId);
    const editInputPreview = toolEditInputPreviews.get(toolCallId);
    const artifactPath = workspaceArtifactPathFromTool(label, visibleInput, resolvedReason, workspacePath);
    const details = chatToolEventDetails(undefined, permissionMode, "error", label, progress);
    updates.push({
      toolCallId,
      messageId,
      label,
      resolvedReason,
      visibleInput,
      ...(artifactPath ? { artifactPath } : {}),
      messageContent: formatToolTranscript(label, "interrupted", visibleInput, resolvedReason),
      messageMetadata: toolMessageMetadata(
        "error",
        toolCallId,
        label,
        artifactPath,
        undefined,
        longformInputPreview,
        editInputPreview,
        progress,
      ),
      toolEventLabel: toolEventLabel(label, details),
      toolEventDetails: details,
    });
  }
  return updates;
}
