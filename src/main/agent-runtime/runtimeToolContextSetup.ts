import type { ChatMessage, DesktopEvent, PermissionMode } from "../../shared/types";
import {
  interruptedToolCallRecoveryThresholdFromEnv,
} from "../interruptedToolCallRecovery";
import { ToolArgumentProgressTracker } from "../tool-runtime/toolArgumentProgress";
import type { RuntimeTextOutputState } from "./runtimeTextOutputState";
import {
  createRuntimeToolMessageController,
  type RuntimeToolMessageController,
  type RuntimeToolMessageControllerInput,
} from "./runtimeToolMessageController";
import {
  createRuntimeToolRecoveryContext,
  type RuntimeToolRecoveryContext,
  type RuntimeToolRecoveryContextInput,
} from "./runtimeToolRecoveryContext";

export interface RuntimeToolContextSetupInput {
  threadId: string;
  workspacePath: string;
  permissionMode: PermissionMode;
  runId: string;
  outputState: RuntimeTextOutputState;
  visibleUserContent: string;
  isRunStoreActive: () => boolean;
  retrySourceUserMessageId: () => string | undefined;
  listMessages: () => readonly ChatMessage[];
  addToolMessage: RuntimeToolMessageControllerInput["addToolMessage"];
  replaceMessage: RuntimeToolMessageControllerInput["replaceMessage"];
  updateRunDiagnostics: RuntimeToolRecoveryContextInput["updateRunDiagnostics"];
  emitRunEvent: (event: DesktopEvent) => void;
  createToolArgumentProgress?: () => ToolArgumentProgressTracker;
  recoveryThresholdChars?: number;
  createToolMessageController?: typeof createRuntimeToolMessageController;
  createToolRecoveryContext?: typeof createRuntimeToolRecoveryContext;
}

export interface RuntimeToolContextSetup {
  toolArgumentProgress: ToolArgumentProgressTracker;
  startedToolCallIds: Set<string>;
  toolMessages: RuntimeToolMessageController;
  toolRecovery: RuntimeToolRecoveryContext;
}

export function createRuntimeToolContextSetup(
  input: RuntimeToolContextSetupInput,
): RuntimeToolContextSetup {
  const toolArgumentProgress = input.createToolArgumentProgress?.() ?? new ToolArgumentProgressTracker();
  const startedToolCallIds = new Set<string>();
  const toolMessages = (input.createToolMessageController ?? createRuntimeToolMessageController)({
    threadId: input.threadId,
    workspacePath: input.workspacePath,
    permissionMode: input.permissionMode,
    progressForToolCall: (toolCallId) => toolArgumentProgress.current(toolCallId),
    startedToolCallIds,
    listMessages: input.listMessages,
    addToolMessage: input.addToolMessage,
    replaceMessage: input.replaceMessage,
    emitRunEvent: input.emitRunEvent,
  });
  const toolRecovery = (input.createToolRecoveryContext ?? createRuntimeToolRecoveryContext)({
    workspacePath: input.workspacePath,
    runId: input.runId,
    thresholdChars: input.recoveryThresholdChars ?? interruptedToolCallRecoveryThresholdFromEnv(),
    toolArgumentProgress,
    isRunStoreActive: input.isRunStoreActive,
    updateRunDiagnostics: input.updateRunDiagnostics,
    retrySourceUserMessageId: input.retrySourceUserMessageId,
    turnGoal: () => input.visibleUserContent,
    assistantLeadIn: input.outputState.currentAssistantFinalText,
    recoveryInput: (toolCallId) => toolMessages.recoveryInput(toolCallId),
    inputContent: (toolCallId) => toolMessages.inputContent(toolCallId),
    recoveryInputSource: (toolCallId) => toolMessages.recoveryInputSource(toolCallId),
  });
  return {
    toolArgumentProgress,
    startedToolCallIds,
    toolMessages,
    toolRecovery,
  };
}
