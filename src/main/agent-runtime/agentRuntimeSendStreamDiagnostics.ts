import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AmbientStreamFailureKind } from "./agentRuntimeAmbientFacade";
import type { ProviderInterruptionToolSnapshot } from "./provider-continuation/agentRuntimeProviderContinuationHelpers";
import {
  approximateDiagnosticPayloadBytes,
  buildChatStreamInterruptionNotice,
  buildRuntimeProviderFailureDiagnostic,
  normalizedPiEventType,
  piStreamTraceEventDetails,
  runtimeProviderFailureIdleSource,
  type PiStreamTraceReference,
  type RuntimeProviderErrorDiagnostic,
  type RuntimeProviderFailureDiagnostic,
} from "./provider-continuation/agentRuntimeProviderDiagnostics";
import { runtimePiStreamFailureKind, runtimePiStreamTimeoutMessage } from "./agentRuntimeStreamState";
import { getAmbientProviderStatus } from "../provider/providerStatus";

export interface ChatStreamInterruptionDiagnostic {
  kind: AmbientStreamFailureKind;
  message: string;
  retryScheduled: boolean;
  replaySafe: boolean;
  continuationSafe?: boolean;
  retryUsesFreshSession?: boolean;
  retryAttempt?: number;
  maxRetries?: number;
  retryReason?: string;
  retryDelayMs?: number;
  runStartedAt: string;
  firstStreamEventAt?: string;
  firstVisibleTextAt?: string;
  firstToolArgumentAt?: string;
  firstToolExecutionStartedAt?: string;
  providerRetryAttemptCount?: number;
  providerRetryLastError?: string;
  semanticOutputSeen: boolean;
  toolCallSeen: boolean;
  assistantOutputChars: number;
  thinkingOutputChars: number;
  toolMessageCount: number;
  currentAssistantFinalTextChars: number;
  streamEventCount: number;
  streamTrace?: PiStreamTraceReference;
  sessionFile?: string;
  providerErrorDiagnostic?: RuntimeProviderErrorDiagnostic;
  providerFailureDiagnostic?: RuntimeProviderFailureDiagnostic;
  interruptedToolCalls?: ProviderInterruptionToolSnapshot[];
  completedToolMessageCount?: number;
  receivedAnyText?: boolean;
}

export interface PiStreamTraceEvent {
  sequence: number;
  at: string;
  elapsedMs: number;
  eventType?: string;
  normalizedKind: string;
  payloadBytes: number;
  assistantOutputChars: number;
  thinkingOutputChars: number;
  currentAssistantFinalTextChars: number;
  receivedAnyText: boolean;
  currentAssistantReceivedText: boolean;
  currentThinkingReceivedText: boolean;
  toolMessageCount: number;
  details?: Record<string, unknown>;
}

interface RuntimeSendStreamDiagnosticsState {
  piStreamEventCount: number;
  streamWatchdogTimeoutMessage: string | undefined;
  piPreStreamTimeoutMs: number;
  piStreamIdleTimeoutMs: number;
  runStartedAt: string;
  assistantOutputChars: number;
  thinkingOutputChars: number;
  currentAssistantFinalText: string;
  currentThinkingFinalText: string;
  receivedAnyText: boolean;
  currentAssistantReceivedText: boolean;
  currentThinkingReceivedText: boolean;
  toolMessageCount: number;
  sessionFile: string | undefined;
  piPromptStartLine: number | undefined;
  piPromptUserLine: number | undefined;
  promptContentSha256: string | undefined;
  promptContentLength: number;
  currentAssistantMessageId: string | undefined;
  runtimeModel: string | undefined;
  piStreamApproximatePayloadBytes: number;
  firstPiStreamEventAt: string | undefined;
  firstPiStreamEventType: string | undefined;
  lastPiStreamEventAt: string | undefined;
  lastPiStreamEventType: string | undefined;
  firstAssistantVisibleTextAt: string | undefined;
  firstToolArgumentAt: string | undefined;
  firstToolExecutionStartedAt: string | undefined;
  providerRetryAttemptCount: number;
  providerRetryLastError: string | undefined;
}

interface RuntimeSendStreamDiagnosticsOptions {
  runId: string;
  threadId: string;
  recentEventLimit: number;
  recentEvents: PiStreamTraceEvent[];
  getWorkspaceStatePath: () => string;
  getTraceReference: () => PiStreamTraceReference | undefined;
  setTraceReference: (reference: PiStreamTraceReference) => void;
  updateRunDiagnostics: (diagnostics: { piStreamTrace: PiStreamTraceReference }) => void;
  getState: () => RuntimeSendStreamDiagnosticsState;
}

export function createRuntimeSendStreamDiagnostics(options: RuntimeSendStreamDiagnosticsOptions) {
  const currentPiStreamFailureKind = (): AmbientStreamFailureKind =>
    runtimePiStreamFailureKind(options.getState().piStreamEventCount);
  const currentPiStreamTimeoutMessage = () => {
    const state = options.getState();
    return runtimePiStreamTimeoutMessage(
      state.piStreamEventCount,
      state.piPreStreamTimeoutMs,
      state.piStreamIdleTimeoutMs,
      state.streamWatchdogTimeoutMessage,
    );
  };
  const currentPiStreamIdleSource = (kind: AmbientStreamFailureKind = currentPiStreamFailureKind()) =>
    runtimeProviderFailureIdleSource(kind);
  const chatStreamSemanticOutputSeen = () => {
    const state = options.getState();
    return state.receivedAnyText ||
      state.currentAssistantReceivedText ||
      state.assistantOutputChars > 0 ||
      state.currentAssistantFinalText.trim().length > 0 ||
      state.currentThinkingReceivedText ||
      state.thinkingOutputChars > 0 ||
      state.currentThinkingFinalText.trim().length > 0;
  };
  const recordPiStreamTraceEvent = (event: unknown, normalized: { kind: string }) => {
    const state = options.getState();
    const payloadBytes = approximateDiagnosticPayloadBytes(event);
    const traceEvent: PiStreamTraceEvent = {
      sequence: state.piStreamEventCount + 1,
      at: new Date().toISOString(),
      elapsedMs: Math.max(0, Date.now() - Date.parse(state.runStartedAt)),
      eventType: normalizedPiEventType(event),
      normalizedKind: normalized.kind,
      payloadBytes,
      assistantOutputChars: state.assistantOutputChars,
      thinkingOutputChars: state.thinkingOutputChars,
      currentAssistantFinalTextChars: state.currentAssistantFinalText.length,
      receivedAnyText: state.receivedAnyText,
      currentAssistantReceivedText: state.currentAssistantReceivedText,
      currentThinkingReceivedText: state.currentThinkingReceivedText,
      toolMessageCount: state.toolMessageCount,
      details: piStreamTraceEventDetails(event),
    };
    options.recentEvents.push(traceEvent);
    if (options.recentEvents.length > options.recentEventLimit) options.recentEvents.shift();
  };
  const persistPiStreamTrace = (reason: string): PiStreamTraceReference | undefined => {
    const existingReference = options.getTraceReference();
    if (existingReference) return existingReference;
    const state = options.getState();
    if (!options.recentEvents.length && !state.sessionFile) return undefined;
    const recordedAt = new Date().toISOString();
    const dir = join(options.getWorkspaceStatePath(), "diagnostics", "pi-stream-traces", options.threadId);
    const path = join(dir, `${options.runId}-${recordedAt.replace(/[:.]/g, "-")}.json`);
    const reference: PiStreamTraceReference = {
      path,
      eventCount: state.piStreamEventCount,
      recentEventCount: options.recentEvents.length,
      reason,
      recordedAt,
      ...(state.piPromptStartLine !== undefined ? { promptStartLine: state.piPromptStartLine } : {}),
      ...(state.piPromptUserLine !== undefined ? { promptUserLine: state.piPromptUserLine } : {}),
      ...(state.promptContentSha256 ? { promptContentSha256: state.promptContentSha256 } : {}),
    };
    const trace = {
      schemaVersion: "ambient-pi-stream-trace-v1",
      reason,
      recordedAt,
      runId: options.runId,
      threadId: options.threadId,
      assistantMessageId: state.currentAssistantMessageId,
      provider: "ambient",
      model: state.runtimeModel,
      sessionFile: state.sessionFile,
      prompt: {
        ...(state.piPromptStartLine !== undefined ? { startLine: state.piPromptStartLine } : {}),
        ...(state.piPromptUserLine !== undefined ? { userLine: state.piPromptUserLine } : {}),
        ...(state.promptContentSha256 ? { sha256: state.promptContentSha256 } : {}),
        contentChars: state.promptContentLength,
      },
      stream: {
        eventCount: state.piStreamEventCount,
        approximatePayloadBytes: state.piStreamApproximatePayloadBytes,
        preStreamTimeoutMs: state.piPreStreamTimeoutMs,
        streamIdleTimeoutMs: state.piStreamIdleTimeoutMs,
        firstEventAt: state.firstPiStreamEventAt,
        lastEventAt: state.lastPiStreamEventAt,
        lastEventType: state.lastPiStreamEventType,
        assistantOutputChars: state.assistantOutputChars,
        thinkingOutputChars: state.thinkingOutputChars,
        currentAssistantFinalTextChars: state.currentAssistantFinalText.length,
        semanticOutputSeen: chatStreamSemanticOutputSeen(),
        receivedAnyText: state.receivedAnyText,
      },
      recentEvents: options.recentEvents,
    };
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path, JSON.stringify(trace, null, 2), "utf8");
      options.setTraceReference(reference);
      options.updateRunDiagnostics({ piStreamTrace: reference });
      return reference;
    } catch (error) {
      console.warn(`Failed to write Pi stream trace: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  };
  const chatStreamInterruptionDiagnostic = (
    message: string,
    input: Partial<
      Pick<
        ChatStreamInterruptionDiagnostic,
        | "kind"
        | "retryScheduled"
        | "replaySafe"
        | "continuationSafe"
        | "retryUsesFreshSession"
        | "retryAttempt"
        | "maxRetries"
        | "retryReason"
        | "retryDelayMs"
        | "providerErrorDiagnostic"
        | "interruptedToolCalls"
        | "completedToolMessageCount"
        | "receivedAnyText"
      >
    > = {},
  ): ChatStreamInterruptionDiagnostic => {
    const state = options.getState();
    const kind = input.kind ?? currentPiStreamFailureKind();
    const retryScheduled = input.retryScheduled ?? false;
    const replaySafe = input.replaySafe ?? false;
    const semanticOutputSeen = chatStreamSemanticOutputSeen();
    const receivedAnyTextValue = input.receivedAnyText ?? state.receivedAnyText;
    const openToolCallCount = input.interruptedToolCalls?.length ?? 0;
    const completedToolMessageCount = input.completedToolMessageCount ?? Math.max(0, state.toolMessageCount - openToolCallCount);
    const traceReference = options.getTraceReference();
    const providerFailureDiagnostic = input.providerErrorDiagnostic
      ? buildRuntimeProviderFailureDiagnostic({
          providerStatus: getAmbientProviderStatus(state.runtimeModel),
          kind,
          message,
          runStartedAt: state.runStartedAt,
          error: input.providerErrorDiagnostic,
          retryScheduled,
          replaySafe,
          ...(input.continuationSafe !== undefined ? { continuationSafe: input.continuationSafe } : {}),
          ...(input.retryUsesFreshSession !== undefined ? { usesFreshSession: input.retryUsesFreshSession } : {}),
          ...(input.retryAttempt !== undefined ? { retryAttempt: input.retryAttempt } : {}),
          ...(input.maxRetries !== undefined ? { maxRetries: input.maxRetries } : {}),
          ...(input.retryReason ? { retryReason: input.retryReason } : {}),
          ...(input.retryDelayMs !== undefined ? { retryDelayMs: input.retryDelayMs } : {}),
          ...(state.providerRetryAttemptCount > 0 ? { providerRetryAttemptCount: state.providerRetryAttemptCount } : {}),
          ...(state.providerRetryLastError ? { providerRetryLastError: state.providerRetryLastError } : {}),
          stream: {
            eventCount: state.piStreamEventCount,
            approximatePayloadBytes: state.piStreamApproximatePayloadBytes,
            preStreamTimeoutMs: state.piPreStreamTimeoutMs,
            streamIdleTimeoutMs: state.piStreamIdleTimeoutMs,
            ...(state.firstPiStreamEventAt ? { firstEventAt: state.firstPiStreamEventAt } : {}),
            ...(state.firstPiStreamEventType ? { firstEventType: state.firstPiStreamEventType } : {}),
            ...(state.lastPiStreamEventAt ? { lastEventAt: state.lastPiStreamEventAt } : {}),
            ...(state.lastPiStreamEventType ? { lastEventType: state.lastPiStreamEventType } : {}),
            idleSource: currentPiStreamIdleSource(kind),
            ...(state.firstAssistantVisibleTextAt ? { firstVisibleTextAt: state.firstAssistantVisibleTextAt } : {}),
            ...(state.firstToolArgumentAt ? { firstToolArgumentAt: state.firstToolArgumentAt } : {}),
            ...(state.firstToolExecutionStartedAt ? { firstToolExecutionStartedAt: state.firstToolExecutionStartedAt } : {}),
            assistantOutputChars: state.assistantOutputChars,
            thinkingOutputChars: state.thinkingOutputChars,
            currentAssistantFinalTextChars: state.currentAssistantFinalText.length,
            semanticOutputSeen,
            receivedAnyText: receivedAnyTextValue,
            ...(traceReference ? { trace: traceReference } : {}),
          },
          transcript: {
            toolCallSeen: state.toolMessageCount > 0,
            toolMessageCount: state.toolMessageCount,
            openToolCallCount,
            completedToolMessageCount,
            ...(input.interruptedToolCalls ? { interruptedToolCalls: input.interruptedToolCalls } : {}),
          },
          ...(state.sessionFile ? { sessionFile: state.sessionFile } : {}),
        })
      : undefined;
    return {
      kind,
      message,
      retryScheduled,
      replaySafe,
      ...(input.continuationSafe !== undefined ? { continuationSafe: input.continuationSafe } : {}),
      ...(input.retryUsesFreshSession !== undefined ? { retryUsesFreshSession: input.retryUsesFreshSession } : {}),
      ...(input.retryAttempt !== undefined ? { retryAttempt: input.retryAttempt } : {}),
      ...(input.maxRetries !== undefined ? { maxRetries: input.maxRetries } : {}),
      ...(input.retryReason ? { retryReason: input.retryReason } : {}),
      ...(input.retryDelayMs !== undefined ? { retryDelayMs: input.retryDelayMs } : {}),
      runStartedAt: state.runStartedAt,
      ...(state.firstPiStreamEventAt ? { firstStreamEventAt: state.firstPiStreamEventAt } : {}),
      ...(state.firstAssistantVisibleTextAt ? { firstVisibleTextAt: state.firstAssistantVisibleTextAt } : {}),
      ...(state.firstToolArgumentAt ? { firstToolArgumentAt: state.firstToolArgumentAt } : {}),
      ...(state.firstToolExecutionStartedAt ? { firstToolExecutionStartedAt: state.firstToolExecutionStartedAt } : {}),
      ...(state.providerRetryAttemptCount > 0 ? { providerRetryAttemptCount: state.providerRetryAttemptCount } : {}),
      ...(state.providerRetryLastError ? { providerRetryLastError: state.providerRetryLastError } : {}),
      semanticOutputSeen,
      toolCallSeen: state.toolMessageCount > 0,
      assistantOutputChars: state.assistantOutputChars,
      thinkingOutputChars: state.thinkingOutputChars,
      toolMessageCount: state.toolMessageCount,
      currentAssistantFinalTextChars: state.currentAssistantFinalText.length,
      streamEventCount: state.piStreamEventCount,
      ...(traceReference ? { streamTrace: traceReference } : {}),
      ...(state.sessionFile ? { sessionFile: state.sessionFile } : {}),
      ...(input.providerErrorDiagnostic ? { providerErrorDiagnostic: input.providerErrorDiagnostic } : {}),
      ...(providerFailureDiagnostic ? { providerFailureDiagnostic } : {}),
      ...(input.interruptedToolCalls ? { interruptedToolCalls: input.interruptedToolCalls } : {}),
      ...(input.completedToolMessageCount !== undefined ? { completedToolMessageCount: input.completedToolMessageCount } : {}),
      ...(input.receivedAnyText !== undefined ? { receivedAnyText: input.receivedAnyText } : {}),
    };
  };
  const chatStreamInterruptionNotice = (message: string): string =>
    buildChatStreamInterruptionNotice({
      message,
      toolMessageCount: options.getState().toolMessageCount,
      semanticOutputSeen: chatStreamSemanticOutputSeen(),
    });

  return {
    currentPiStreamFailureKind,
    currentPiStreamTimeoutMessage,
    currentPiStreamIdleSource,
    chatStreamSemanticOutputSeen,
    recordPiStreamTraceEvent,
    persistPiStreamTrace,
    chatStreamInterruptionDiagnostic,
    chatStreamInterruptionNotice,
  };
}
