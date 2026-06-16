import type { ChatMessage, DesktopEvent } from "../../shared/types";
import type { ToolArgumentProgressTracker } from "../toolArgumentProgress";
import {
  createRuntimePermissionWaitController,
  type RuntimePermissionWaitController,
  type RuntimePermissionWaitControllerInput,
} from "./runtimePermissionWaitController";
import type { RuntimeStreamWatchdogController } from "./runtimeStreamWatchdogController";
import type { RuntimeToolArgumentWatchdog } from "./runtimeToolArgumentWatchdog";
import type { RuntimeToolExecutionWatchdog } from "./runtimeToolExecutionWatchdog";
import type { RuntimeToolMessageController } from "./runtimeToolMessageController";

export interface RuntimePermissionWaitSetupInput {
  threadId: string;
  toolMessages: RuntimeToolMessageController;
  toolArgumentProgress: ToolArgumentProgressTracker;
  getToolExecutionWatchdog: () => RuntimeToolExecutionWatchdog | undefined;
  getToolArgumentWatchdog: () => RuntimeToolArgumentWatchdog | undefined;
  getStreamWatchdog: () => RuntimeStreamWatchdogController | undefined;
  markRunActivity: () => boolean;
  replaceMessage: (messageId: string, content: string, metadata: Record<string, unknown>) => ChatMessage;
  emitRunEvent: (event: DesktopEvent) => void;
  createPermissionWaitController?: typeof createRuntimePermissionWaitController;
}

export function createRuntimePermissionWaitSetup(
  input: RuntimePermissionWaitSetupInput,
): RuntimePermissionWaitController {
  return (input.createPermissionWaitController ?? createRuntimePermissionWaitController)({
    threadId: input.threadId,
    getActiveToolExecution: () => input.getToolExecutionWatchdog()?.active(),
    getActiveToolExecutionCount: () => input.getToolExecutionWatchdog()?.count() ?? 0,
    getToolMessageId: (toolCallId) => input.toolMessages.messageId(toolCallId),
    getToolInputContent: (toolCallId) => input.toolMessages.inputContent(toolCallId),
    getToolLongformInputPreview: (toolCallId) => input.toolMessages.longformInputPreview(toolCallId),
    getToolEditInputPreview: (toolCallId) => input.toolMessages.editInputPreview(toolCallId),
    getToolArgumentProgress: (toolCallId) => input.toolArgumentProgress.current(toolCallId),
    markRunActivity: input.markRunActivity,
    markToolExecutionActivity: (toolCallId, toolName) => {
      input.getToolExecutionWatchdog()?.mark(toolCallId, toolName);
    },
    pauseStreamWatchdog: () => {
      input.getStreamWatchdog()?.pause();
    },
    resumeStreamWatchdog: () => {
      input.getStreamWatchdog()?.resume();
    },
    clearToolArgumentWatchdog: () => {
      input.getToolArgumentWatchdog()?.clear();
    },
    scheduleToolArgumentWatchdog: () => {
      input.getToolArgumentWatchdog()?.schedule();
    },
    clearToolExecutionWatchdog: () => {
      input.getToolExecutionWatchdog()?.clear();
    },
    scheduleToolExecutionWatchdog: () => {
      input.getToolExecutionWatchdog()?.schedule();
    },
    replaceMessage: input.replaceMessage,
    emitRunEvent: input.emitRunEvent,
  } satisfies RuntimePermissionWaitControllerInput);
}
