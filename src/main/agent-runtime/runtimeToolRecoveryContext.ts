import type {
  InterruptedToolCallRecoveryDiagnostics,
  InterruptedToolCallRecoverySnapshot,
  ToolArgumentProgressSnapshot,
  ToolArgumentStreamDiagnostics,
  ToolIntentSnapshot,
} from "../../shared/types";
import {
  InterruptedToolCallRecoveryTracker,
  serializeToolInputForInterruptedRecovery,
} from "../interruptedToolCallRecovery";
import { buildToolIntentSnapshot } from "./tools/agentRuntimeToolIntentSnapshot";
import type { ToolArgumentProgressTracker } from "../tool-runtime/toolArgumentProgress";

type RecoverySource = InterruptedToolCallRecoverySnapshot["source"];

export interface RuntimeToolRecoveryDiagnosticsPatch extends Record<string, unknown> {
  toolArgumentStreams: ToolArgumentStreamDiagnostics;
  interruptedToolCallRecovery: InterruptedToolCallRecoveryDiagnostics;
}

export interface RuntimeToolRecoveryContextInput {
  workspacePath: string;
  runId: string;
  thresholdChars: number;
  toolArgumentProgress: ToolArgumentProgressTracker;
  isRunStoreActive: () => boolean;
  updateRunDiagnostics: (diagnostics: RuntimeToolRecoveryDiagnosticsPatch) => void;
  retrySourceUserMessageId: () => string | undefined;
  turnGoal: () => string;
  assistantLeadIn: () => string;
  recoveryInput: (toolCallId: string) => string | undefined;
  inputContent: (toolCallId: string) => string | undefined;
  recoveryInputSource: (toolCallId: string) => RecoverySource | undefined;
  nowMs?: () => number;
}

export interface RuntimeToolRecoveryContext {
  interruptedToolCallRecovery: InterruptedToolCallRecoveryTracker;
  toolIntentSnapshots: Map<string, ToolIntentSnapshot>;
  persistToolArgumentDiagnostics: (force?: boolean) => void;
  trackInterruptedToolCallRecovery: (
    toolCallId: string,
    toolName: string,
    rawInput: unknown,
    visibleInput: string,
    argumentProgress: ToolArgumentProgressSnapshot,
  ) => ToolArgumentProgressSnapshot;
  markInterruptedToolCallNoLongerRecoverable: (
    toolCallId: string,
    argumentProgress: ToolArgumentProgressSnapshot,
  ) => ToolArgumentProgressSnapshot;
  forceInterruptedToolCallRecovery: (
    argumentProgress: ToolArgumentProgressSnapshot,
  ) => ToolArgumentProgressSnapshot;
  rememberToolIntent: (
    toolCallId: string,
    toolName: string,
    rawInput: unknown,
    visibleInput: string,
  ) => ToolIntentSnapshot;
}

export function createRuntimeToolRecoveryContext(
  input: RuntimeToolRecoveryContextInput,
): RuntimeToolRecoveryContext {
  const interruptedToolCallRecovery = new InterruptedToolCallRecoveryTracker({
    workspacePath: input.workspacePath,
    runId: input.runId,
    thresholdChars: input.thresholdChars,
  });
  const toolIntentSnapshots = new Map<string, ToolIntentSnapshot>();
  let lastToolArgumentDiagnosticsPersistAt = 0;
  const nowMs = () => input.nowMs?.() ?? Date.now();

  const persistToolArgumentDiagnostics = (force = false) => {
    if (!input.isRunStoreActive()) return;
    const now = nowMs();
    if (!force && now - lastToolArgumentDiagnosticsPersistAt < 1_000) return;
    lastToolArgumentDiagnosticsPersistAt = now;
    input.updateRunDiagnostics({
      toolArgumentStreams: input.toolArgumentProgress.diagnostics(now),
      interruptedToolCallRecovery: interruptedToolCallRecovery.diagnostics(now),
    });
  };

  const trackInterruptedToolCallRecovery = (
    toolCallId: string,
    toolName: string,
    rawInput: unknown,
    visibleInput: string,
    argumentProgress: ToolArgumentProgressSnapshot,
  ): ToolArgumentProgressSnapshot => {
    const hasRawInput = rawInput !== undefined;
    if (
      argumentProgress.observedArgumentChars < interruptedToolCallRecovery.thresholdChars &&
      visibleInput.length < interruptedToolCallRecovery.thresholdChars
    ) {
      return argumentProgress;
    }
    if (!hasRawInput && visibleInput.length < interruptedToolCallRecovery.thresholdChars) return argumentProgress;
    const capture = serializeToolInputForInterruptedRecovery(rawInput, visibleInput);
    const recovery = interruptedToolCallRecovery.observe({
      toolCallId,
      toolName,
      inputText: capture.text,
      source: capture.source,
      progress: argumentProgress,
      intent: toolIntentSnapshots.get(toolCallId),
    });
    return recovery ? { ...argumentProgress, interruptedToolCallRecovery: recovery } : argumentProgress;
  };

  const markInterruptedToolCallNoLongerRecoverable = (
    toolCallId: string,
    argumentProgress: ToolArgumentProgressSnapshot,
  ): ToolArgumentProgressSnapshot => {
    const recovery = interruptedToolCallRecovery.markExecutionStarted(toolCallId);
    return recovery ? { ...argumentProgress, interruptedToolCallRecovery: recovery } : argumentProgress;
  };

  const forceInterruptedToolCallRecovery = (
    argumentProgress: ToolArgumentProgressSnapshot,
  ): ToolArgumentProgressSnapshot => {
    const inputText = input.recoveryInput(argumentProgress.toolCallId) ??
      input.inputContent(argumentProgress.toolCallId) ??
      "";
    if (!inputText.trim()) return argumentProgress;
    const recovery = interruptedToolCallRecovery.observe({
      toolCallId: argumentProgress.toolCallId,
      toolName: argumentProgress.toolName,
      inputText,
      source: input.recoveryInputSource(argumentProgress.toolCallId) ?? "visible_tool_input",
      progress: argumentProgress,
      intent: toolIntentSnapshots.get(argumentProgress.toolCallId),
      force: true,
    });
    return recovery ? { ...argumentProgress, interruptedToolCallRecovery: recovery } : argumentProgress;
  };

  const rememberToolIntent = (
    toolCallId: string,
    toolName: string,
    rawInput: unknown,
    visibleInput: string,
  ): ToolIntentSnapshot => {
    const existing = toolIntentSnapshots.get(toolCallId);
    if (existing) return existing;
    const snapshot = buildToolIntentSnapshot({
      toolCallId,
      toolName,
      rawInput,
      visibleInput,
      sourceUserMessageId: input.retrySourceUserMessageId(),
      turnGoal: input.turnGoal(),
      assistantLeadIn: input.assistantLeadIn(),
    });
    toolIntentSnapshots.set(toolCallId, snapshot);
    return snapshot;
  };

  return {
    interruptedToolCallRecovery,
    toolIntentSnapshots,
    persistToolArgumentDiagnostics,
    trackInterruptedToolCallRecovery,
    markInterruptedToolCallNoLongerRecoverable,
    forceInterruptedToolCallRecovery,
    rememberToolIntent,
  };
}
