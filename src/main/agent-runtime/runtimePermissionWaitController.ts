import type {
  ChatMessage,
  DesktopEvent,
  PermissionPromptResponseMode,
  PermissionRisk,
  ToolArgumentProgressSnapshot,
  ToolEditInputPreview,
  ToolLongformInputPreview,
} from "../../shared/types";
import { runtimePermissionWaitActivity, runtimePermissionWaitToolResult } from "../agent-runtime/agentRuntimePermissionMessages";
import { toolMessageMetadata } from "./tools/agentRuntimeToolMessageMetadata";
import { formatToolTranscript } from "./tools/agentRuntimeToolTranscript";

export interface RuntimePermissionWaitStart {
  toolName: string;
  requestId?: string;
  title?: string;
  detail?: string;
  risk?: PermissionRisk;
}

export interface RuntimePermissionWaitFinish {
  allowed?: boolean;
  mode?: PermissionPromptResponseMode;
  error?: string;
}

export interface RuntimePermissionWaitControl {
  begin(input: RuntimePermissionWaitStart): (finish?: RuntimePermissionWaitFinish) => void;
}

export interface RuntimePermissionWaitActiveToolExecution {
  toolCallId: string;
  toolName: string;
}

export interface RuntimePermissionWaitControllerInput {
  threadId: string;
  getActiveToolExecution: () => RuntimePermissionWaitActiveToolExecution | undefined;
  getActiveToolExecutionCount: () => number;
  getToolMessageId: (toolCallId: string) => string | undefined;
  getToolInputContent: (toolCallId: string) => string | undefined;
  getToolLongformInputPreview: (toolCallId: string) => ToolLongformInputPreview | undefined;
  getToolEditInputPreview: (toolCallId: string) => ToolEditInputPreview | undefined;
  getToolArgumentProgress: (toolCallId: string) => ToolArgumentProgressSnapshot | undefined;
  markRunActivity: () => boolean;
  markToolExecutionActivity: (toolCallId: string, toolName: string) => void;
  pauseStreamWatchdog: () => void;
  resumeStreamWatchdog: () => void;
  clearToolArgumentWatchdog: () => void;
  scheduleToolArgumentWatchdog: () => void;
  clearToolExecutionWatchdog: () => void;
  scheduleToolExecutionWatchdog: () => void;
  replaceMessage: (messageId: string, content: string, metadata: Record<string, unknown>) => ChatMessage;
  emitRunEvent: (event: DesktopEvent) => void;
  now?: () => number;
  setInterval?: (callback: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval?: (timer: ReturnType<typeof setInterval>) => void;
}

export interface RuntimePermissionWaitController extends RuntimePermissionWaitControl {
  isWaiting: () => boolean;
}

export function createRuntimePermissionWaitController(
  input: RuntimePermissionWaitControllerInput,
): RuntimePermissionWaitController {
  let permissionWaitDepth = 0;
  const now = input.now ?? Date.now;
  const scheduleInterval = input.setInterval ?? setInterval;
  const clearScheduledInterval = input.clearInterval ?? clearInterval;

  const updateActiveToolPermissionWaitCard = (
    wait: RuntimePermissionWaitStart,
    waitStartedMs: number,
    finish?: RuntimePermissionWaitFinish,
  ) => {
    const activeToolExecution = input.getActiveToolExecution();
    const toolCallId = activeToolExecution?.toolCallId;
    if (!toolCallId) return;
    const messageId = input.getToolMessageId(toolCallId);
    if (!messageId) return;
    const toolName = activeToolExecution?.toolName || wait.toolName;
    const inputContent = input.getToolInputContent(toolCallId) ?? "";
    const longformInputPreview = input.getToolLongformInputPreview(toolCallId);
    const editInputPreview = input.getToolEditInputPreview(toolCallId);
    const argumentProgress = input.getToolArgumentProgress(toolCallId);
    const elapsedMs = Math.max(0, now() - waitStartedMs);
    const { resultText, details } = runtimePermissionWaitToolResult({ wait, finish, toolName, elapsedMs });
    const updated = input.replaceMessage(
      messageId,
      formatToolTranscript(toolName, "running", inputContent, resultText),
      toolMessageMetadata(
        "running",
        toolCallId,
        toolName,
        undefined,
        details,
        longformInputPreview,
        editInputPreview,
        argumentProgress,
      ),
    );
    input.emitRunEvent({ type: "message-updated", message: updated });
  };

  const markPermissionWaitActivity = (wait: RuntimePermissionWaitStart) => {
    input.markRunActivity();
    const activeToolExecution = input.getActiveToolExecution();
    const toolCallId = activeToolExecution?.toolCallId;
    const toolName = activeToolExecution?.toolName || wait.toolName;
    if (toolCallId) input.markToolExecutionActivity(toolCallId, toolName);
  };

  return {
    isWaiting: () => permissionWaitDepth > 0,
    begin: (wait) => {
      let finished = false;
      const waitStartedMs = now();
      permissionWaitDepth += 1;
      if (permissionWaitDepth === 1) {
        input.pauseStreamWatchdog();
        input.clearToolArgumentWatchdog();
        input.clearToolExecutionWatchdog();
      }
      markPermissionWaitActivity(wait);
      updateActiveToolPermissionWaitCard(wait, waitStartedMs);
      const waitHeartbeat = scheduleInterval(() => {
        markPermissionWaitActivity(wait);
        updateActiveToolPermissionWaitCard(wait, waitStartedMs);
      }, 5_000);
      waitHeartbeat.unref?.();
      input.emitRunEvent({
        type: "runtime-activity",
        activity: runtimePermissionWaitActivity({
          threadId: input.threadId,
          wait,
        }),
      });
      return (finish: RuntimePermissionWaitFinish = {}) => {
        if (finished) return;
        finished = true;
        clearScheduledInterval(waitHeartbeat);
        permissionWaitDepth = Math.max(0, permissionWaitDepth - 1);
        markPermissionWaitActivity(wait);
        if (permissionWaitDepth === 0) {
          if (input.getActiveToolExecutionCount() > 0) input.scheduleToolExecutionWatchdog();
          else {
            input.scheduleToolArgumentWatchdog();
            input.resumeStreamWatchdog();
          }
        }
        updateActiveToolPermissionWaitCard(wait, waitStartedMs, finish);
        input.emitRunEvent({
          type: "runtime-activity",
          activity: runtimePermissionWaitActivity({
            threadId: input.threadId,
            wait,
            finish,
          }),
        });
      };
    },
  };
}
