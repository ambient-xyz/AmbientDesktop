import type { DesktopEvent } from "../../shared/desktopTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import type { ChatMessage, InterruptedToolCallRecoverySnapshot, ToolArgumentProgressSnapshot, ToolEditInputPreview, ToolLongformInputPreview } from "../../shared/threadTypes";
import { chatToolEventDetails, toolEventLabel } from "./tools/agentRuntimeToolTranscript";
import { stringMetadata } from "./tools/agentRuntimeToolMessageMetadata";
import {
  runtimeOpenToolFailureUpdates,
  type RuntimeOpenToolFailureReason,
} from "./openToolFailureUpdates";
import { runtimeToolInputMessageUpsert } from "./toolMessageUpserts";
import type { RuntimeToolResultMessageUpdate } from "./toolResultUpdates";

type RuntimeToolDesktopEventStatus = "running" | "done" | "error";

export interface RuntimeToolMessageControllerInput {
  threadId: string;
  workspacePath: string;
  permissionMode: PermissionMode;
  progressForToolCall: (toolCallId: string) => ToolArgumentProgressSnapshot | undefined;
  startedToolCallIds: ReadonlySet<string>;
  listMessages: () => readonly ChatMessage[];
  getMessage: (messageId: string) => ChatMessage | undefined;
  addToolMessage: (input: { threadId: string; content: string; metadata: Record<string, unknown> }) => ChatMessage;
  replaceMessage: (messageId: string, content: string, metadata?: Record<string, unknown>) => ChatMessage;
  emitRunEvent: (event: DesktopEvent) => void;
}

export interface RuntimeToolMessageController {
  size(): number;
  toolCallIds(): IterableIterator<string>;
  inputs(): ReadonlyMap<string, string>;
  recoveryInputs(): ReadonlyMap<string, string>;
  labels(): ReadonlyMap<string, string>;
  messageId(toolCallId: string): string | undefined;
  inputContent(toolCallId: string): string | undefined;
  recoveryInput(toolCallId: string): string | undefined;
  recoveryInputSource(toolCallId: string): InterruptedToolCallRecoverySnapshot["source"] | undefined;
  longformInputPreview(toolCallId: string): ToolLongformInputPreview | undefined;
  editInputPreview(toolCallId: string): ToolEditInputPreview | undefined;
  metadataFor(toolCallId: string): Record<string, unknown>;
  rememberRecoveryInput(toolCallId: string, inputText: string, source: InterruptedToolCallRecoverySnapshot["source"]): void;
  rememberLongformInputPreview(toolCallId: string, preview: ToolLongformInputPreview | undefined): void;
  rememberEditInputPreview(toolCallId: string, preview: ToolEditInputPreview | undefined): void;
  upsertInputMessage(input: {
    toolCallId: string;
    label: string;
    statusLabel: string;
    inputContent: string;
    longformInputPreview?: ToolLongformInputPreview;
    editInputPreview?: ToolEditInputPreview;
    argumentProgress?: ToolArgumentProgressSnapshot;
  }): ChatMessage;
  emitRunningToolEvent(input: {
    label: string;
    status: "running";
    details?: Record<string, string>;
    argumentProgress?: ToolArgumentProgressSnapshot;
    message: Pick<ChatMessage, "metadata">;
  }): void;
  applyResultUpdate(resultUpdate: RuntimeToolResultMessageUpdate, status: RuntimeToolDesktopEventStatus): ChatMessage;
  markOpenToolMessagesFailed(reason: RuntimeOpenToolFailureReason): number;
  cleanupToolCall(toolCallId: string): void;
}

export function createRuntimeToolMessageController(
  input: RuntimeToolMessageControllerInput,
): RuntimeToolMessageController {
  const toolMessageIds = new Map<string, string>();
  const toolMessageInputs = new Map<string, string>();
  const toolMessageRecoveryInputs = new Map<string, string>();
  const toolMessageRecoveryInputSources = new Map<string, InterruptedToolCallRecoverySnapshot["source"]>();
  const toolMessageLabels = new Map<string, string>();
  const toolMessageLongformInputPreviews = new Map<string, ToolLongformInputPreview>();
  const toolMessageEditInputPreviews = new Map<string, ToolEditInputPreview>();

  const emitToolEvent = (
    label: string,
    status: RuntimeToolDesktopEventStatus,
    artifactPath: string | undefined,
    details: ReturnType<typeof chatToolEventDetails>,
  ) => {
    input.emitRunEvent({
      type: "tool-event",
      threadId: input.threadId,
      label: toolEventLabel(label, details),
      status,
      ...(artifactPath ? { artifactPath } : {}),
      details,
    });
  };

  const cleanupToolCall = (toolCallId: string) => {
    toolMessageInputs.delete(toolCallId);
    toolMessageRecoveryInputs.delete(toolCallId);
    toolMessageRecoveryInputSources.delete(toolCallId);
    toolMessageLabels.delete(toolCallId);
    toolMessageLongformInputPreviews.delete(toolCallId);
    toolMessageEditInputPreviews.delete(toolCallId);
  };

  const getMessage = (messageId: string): ChatMessage | undefined => {
    try {
      return input.getMessage(messageId);
    } catch {
      return undefined;
    }
  };

  const upsertInputMessage: RuntimeToolMessageController["upsertInputMessage"] = (messageInput) => {
    toolMessageInputs.set(messageInput.toolCallId, messageInput.inputContent);
    toolMessageLabels.set(messageInput.toolCallId, messageInput.label);
    if (messageInput.longformInputPreview) toolMessageLongformInputPreviews.set(messageInput.toolCallId, messageInput.longformInputPreview);
    if (messageInput.editInputPreview) toolMessageEditInputPreviews.set(messageInput.toolCallId, messageInput.editInputPreview);
    const upsert = runtimeToolInputMessageUpsert({
      toolCallId: messageInput.toolCallId,
      label: messageInput.label,
      statusLabel: messageInput.statusLabel,
      inputContent: messageInput.inputContent,
      workspacePath: input.workspacePath,
      existingMessageId: toolMessageIds.get(messageInput.toolCallId),
      longformInputPreview: messageInput.longformInputPreview,
      editInputPreview: messageInput.editInputPreview,
      previousLongformInputPreview: toolMessageLongformInputPreviews.get(messageInput.toolCallId),
      previousEditInputPreview: toolMessageEditInputPreviews.get(messageInput.toolCallId),
      argumentProgress: messageInput.argumentProgress,
    });
    if (upsert.existingMessageId) {
      const updated = input.replaceMessage(upsert.existingMessageId, upsert.content, upsert.metadata);
      input.emitRunEvent({ type: "message-updated", message: updated });
      return updated;
    }
    const toolMessage = input.addToolMessage({
      threadId: input.threadId,
      content: upsert.content,
      metadata: upsert.metadata,
    });
    toolMessageIds.set(messageInput.toolCallId, toolMessage.id);
    input.emitRunEvent({ type: "message-created", message: toolMessage });
    return toolMessage;
  };

  return {
    size: () => toolMessageIds.size,
    toolCallIds: () => toolMessageIds.keys(),
    inputs: () => toolMessageInputs,
    recoveryInputs: () => toolMessageRecoveryInputs,
    labels: () => toolMessageLabels,
    messageId: (toolCallId) => toolMessageIds.get(toolCallId),
    inputContent: (toolCallId) => toolMessageInputs.get(toolCallId),
    recoveryInput: (toolCallId) => toolMessageRecoveryInputs.get(toolCallId),
    recoveryInputSource: (toolCallId) => toolMessageRecoveryInputSources.get(toolCallId),
    longformInputPreview: (toolCallId) => toolMessageLongformInputPreviews.get(toolCallId),
    editInputPreview: (toolCallId) => toolMessageEditInputPreviews.get(toolCallId),
    metadataFor: (toolCallId) => {
      const messageId = toolMessageIds.get(toolCallId);
      if (!messageId) return {};
      const message = getMessage(messageId);
      const metadata = message?.metadata;
      return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
    },
    rememberRecoveryInput: (toolCallId, inputText, source) => {
      toolMessageRecoveryInputs.set(toolCallId, inputText);
      toolMessageRecoveryInputSources.set(toolCallId, source);
    },
    rememberLongformInputPreview: (toolCallId, preview) => {
      if (preview) toolMessageLongformInputPreviews.set(toolCallId, preview);
    },
    rememberEditInputPreview: (toolCallId, preview) => {
      if (preview) toolMessageEditInputPreviews.set(toolCallId, preview);
    },
    upsertInputMessage,
    emitRunningToolEvent: (eventInput) => {
      const details = chatToolEventDetails(
        eventInput.details,
        input.permissionMode,
        eventInput.status,
        eventInput.label,
        eventInput.argumentProgress,
      );
      const artifactPath = stringMetadata(eventInput.message.metadata?.artifactPath);
      emitToolEvent(eventInput.label, eventInput.status, artifactPath, details);
    },
    applyResultUpdate: (resultUpdate, status) => {
      const message = resultUpdate.existingMessageId
        ? input.replaceMessage(resultUpdate.existingMessageId, resultUpdate.content, resultUpdate.metadata)
        : input.addToolMessage({
            threadId: input.threadId,
            content: resultUpdate.content,
            metadata: resultUpdate.metadata,
          });
      input.emitRunEvent({
        type: resultUpdate.existingMessageId ? "message-updated" : "message-created",
        message,
      });
      input.emitRunEvent({
        type: "tool-event",
        threadId: input.threadId,
        label: resultUpdate.toolEventLabel,
        status,
        artifactPath: resultUpdate.artifactPath,
        details: resultUpdate.toolEventDetails,
      });
      return message;
    },
    markOpenToolMessagesFailed: (reason) => {
      const failureUpdates = runtimeOpenToolFailureUpdates({
        toolMessageIds,
        workspacePath: input.workspacePath,
        permissionMode: input.permissionMode,
        progressForToolCall: input.progressForToolCall,
        toolInputs: toolMessageInputs,
        toolLabels: toolMessageLabels,
        toolLongformInputPreviews: toolMessageLongformInputPreviews,
        toolEditInputPreviews: toolMessageEditInputPreviews,
        startedToolCallIds: input.startedToolCallIds,
        reason,
      });
      for (const failureUpdate of failureUpdates) {
        const updated = input.replaceMessage(
          failureUpdate.messageId,
          failureUpdate.messageContent,
          failureUpdate.messageMetadata,
        );
        input.emitRunEvent({ type: "message-updated", message: updated });
        input.emitRunEvent({
          type: "tool-event",
          threadId: input.threadId,
          label: failureUpdate.toolEventLabel,
          status: "error",
          artifactPath: failureUpdate.artifactPath,
          details: failureUpdate.toolEventDetails,
        });
        cleanupToolCall(failureUpdate.toolCallId);
      }
      return failureUpdates.length;
    },
    cleanupToolCall,
  };
}
