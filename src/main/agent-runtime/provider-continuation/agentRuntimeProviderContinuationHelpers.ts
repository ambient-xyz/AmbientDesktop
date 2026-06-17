import type {
  InterruptedToolCallRecoverySnapshot,
  MessageDelivery,
  PermissionMode,
  ProviderContinuationState,
  ProviderContinuationToolState,
  SendMessageInput,
  ToolIntentSnapshot,
} from "../../../shared/types";
import type { AssistantFinalizationRetryState, RuntimeSessionRecoveryContext } from "../agentRuntimeAssistantRetryInput";

const RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME = "recovery_apply_interrupted_write_suffix";

export interface ProviderInterruptionDiagnostic {
  name?: string;
  message: string;
  code?: string;
  type?: string;
  status?: string | number;
  statusCode?: string | number;
  requestId?: string;
  traceId?: string;
  retryAfter?: string | number;
  cause?: {
    name?: string;
    message: string;
  };
  bodyPreview?: string;
  detailPreview?: string;
}

export type ProviderInterruptionToolPhase =
  | "argument_stream_not_executed"
  | "arguments_prepared_not_executed"
  | "execution_started_unknown";

export interface ProviderInterruptionToolSnapshot {
  toolCallId: string;
  toolName: string;
  phase: ProviderInterruptionToolPhase;
  certainty: ProviderContinuationToolState["certainty"];
  executionStarted: boolean;
  argumentComplete: boolean;
  inputChars: number;
  inputPreview?: string;
  recoveryArgumentPath?: string;
  workspaceRelativeRecoveryArgumentPath?: string;
  recoveryArgumentSha256?: string;
  recoveryArgumentParseStatus?: InterruptedToolCallRecoverySnapshot["parseStatus"];
  executionStartedAt?: string;
  intent?: ToolIntentSnapshot;
}

export type ProviderInterruptionContinuationSendInput =
  SendMessageInput & {
    internal: true;
    permissionMode: PermissionMode;
    retryOfMessageId: string;
    delivery: Extract<MessageDelivery, "prompt">;
    preserveActiveThread: true;
    modelContentOverride: string;
    sessionRecovery: RuntimeSessionRecoveryContext;
    assistantFinalizationRetry: AssistantFinalizationRetryState;
  };

export function runtimeProviderDiagnosticDisplayLines(diagnostic: ProviderInterruptionDiagnostic | undefined): string[] {
  if (!diagnostic) return [];
  const lines = [
    diagnostic.name && diagnostic.name !== "Error" ? `Name: ${diagnostic.name}` : undefined,
    diagnostic.status !== undefined ? `Status: ${diagnostic.status}` : undefined,
    diagnostic.statusCode !== undefined && diagnostic.statusCode !== diagnostic.status ? `Status code: ${diagnostic.statusCode}` : undefined,
    diagnostic.code ? `Code: ${diagnostic.code}` : undefined,
    diagnostic.type ? `Type: ${diagnostic.type}` : undefined,
    diagnostic.requestId ? `Request id: ${diagnostic.requestId}` : undefined,
    diagnostic.traceId ? `Trace id: ${diagnostic.traceId}` : undefined,
    diagnostic.retryAfter !== undefined ? `Retry after: ${diagnostic.retryAfter}` : undefined,
    diagnostic.cause?.message ? `Cause: ${diagnostic.cause.message}` : undefined,
    diagnostic.detailPreview ? `Detail: ${diagnostic.detailPreview}` : undefined,
    diagnostic.bodyPreview && diagnostic.bodyPreview !== diagnostic.detailPreview ? `Body: ${diagnostic.bodyPreview}` : undefined,
  ].filter(Boolean) as string[];
  return lines.filter((line) => !line.endsWith(": undefined"));
}

export function buildProviderInterruptionContinuationNotice(input: {
  message: string;
  diagnostic: ProviderInterruptionDiagnostic;
  tools: ProviderInterruptionToolSnapshot[];
  completedToolMessageCount: number;
  attempt: number;
  maxRetries: number;
  continuationScheduled?: boolean;
}): string {
  const toolLines = input.tools.length
    ? input.tools.map((tool) => {
        const exactArgs = tool.workspaceRelativeRecoveryArgumentPath
          ? `; exact args: ${tool.workspaceRelativeRecoveryArgumentPath}`
          : "";
        const intent = tool.intent ? `; intent: ${toolIntentPromptLine(tool.intent)}` : "";
        return `- ${tool.toolName}: ${providerToolPhaseLabel(tool)}; certainty=${tool.certainty} (${tool.inputChars.toLocaleString()} input chars${exactArgs}${intent})`;
      })
    : ["- No open tool call was left in-flight."];
  const diagnosticLines = runtimeProviderDiagnosticDisplayLines(input.diagnostic);
  return [
    input.continuationScheduled === false
      ? "Ambient/Pi provider stream was interrupted. Ambient stopped before replaying the original request because the transcript contains durable recovery state and possible tool side effects."
      : "Ambient/Pi provider stream was interrupted. Ambient is starting a continuation turn from the durable recovery state instead of stopping the task.",
    "",
    `Error: ${input.message}`,
    diagnosticLines.length ? "" : undefined,
    diagnosticLines.length ? "Diagnostic detail:" : undefined,
    ...diagnosticLines,
    "",
    `Continuation attempt: ${input.attempt}/${input.maxRetries}`,
    `Completed tool messages already in transcript: ${input.completedToolMessageCount}`,
    "Open tool calls:",
    ...toolLines,
  ].filter((line) => line !== undefined).join("\n");
}

export function buildProviderInterruptionContinuationPrompt(input: {
  message: string;
  diagnostic: ProviderInterruptionDiagnostic;
  tools: ProviderInterruptionToolSnapshot[];
  completedToolMessageCount: number;
  hadVisibleAssistantOutput: boolean;
  continuationState?: ProviderContinuationState;
}): string {
  const toolLines = input.tools.length
    ? input.tools.map((tool, index) => {
        const recoveryApplyInterrupted = tool.toolName === RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME;
        const suffixPlaceholder = recoveryApplyInterrupted
          ? "<only the missing tail after the saved recovery suffix prefix>"
          : "<only the missing suffix after the saved content prefix>";
        const lines = [
          `${index + 1}. ${tool.toolName}`,
          `   - status: ${providerToolPhaseLabel(tool)}`,
          `   - certainty: ${tool.certainty}`,
          `   - execution started: ${tool.executionStarted ? "yes, completion unknown" : "no"}`,
          `   - arguments complete: ${tool.argumentComplete ? "yes" : "no"}`,
          `   - input chars: ${tool.inputChars}`,
          tool.intent ? `   - intent: ${toolIntentPromptLine(tool.intent)}` : undefined,
          tool.executionStartedAt ? `   - execution started at: ${tool.executionStartedAt}` : undefined,
          tool.workspaceRelativeRecoveryArgumentPath
            ? `   - exact-args tool: recovery_read_interrupted_tool_call`
            : undefined,
          tool.workspaceRelativeRecoveryArgumentPath
            ? `   - exact-args input: ${JSON.stringify({
                runId: input.continuationState?.runId ?? "",
                toolCallId: tool.toolCallId,
                sha256: tool.recoveryArgumentSha256 ?? "",
              })}`
            : undefined,
          tool.workspaceRelativeRecoveryArgumentPath
            ? `   - write-suffix tool: recovery_apply_interrupted_write_suffix`
            : undefined,
          tool.workspaceRelativeRecoveryArgumentPath && recoveryApplyInterrupted
            ? `   - interrupted recovery apply: pass only the missing tail after the saved recovery suffix prefix; Ambient will compose the original saved write prefix, saved recovery suffix prefix, and provided tail`
            : undefined,
          tool.workspaceRelativeRecoveryArgumentPath
            ? `   - write-suffix input: ${JSON.stringify({
                runId: input.continuationState?.runId ?? "",
                toolCallId: tool.toolCallId,
                sha256: tool.recoveryArgumentSha256 ?? "",
                suffix: suffixPlaceholder,
                overlapStrategy: "auto",
              })}`
            : undefined,
          tool.workspaceRelativeRecoveryArgumentPath
            ? `   - normal write fallback: ${JSON.stringify({
                path: recoveryApplyInterrupted
                  ? "<same target path from original saved write args>"
                  : "<same target path from saved write args>",
                content: "",
                recoveryMode: "interrupted_write_suffix",
                recoveryRunId: input.continuationState?.runId ?? "",
                recoveryToolCallId: tool.toolCallId,
                recoverySha256: tool.recoveryArgumentSha256 ?? "",
                recoverySuffix: suffixPlaceholder,
                recoveryOverlapStrategy: "auto",
              })}`
            : undefined,
          tool.workspaceRelativeRecoveryArgumentPath
            ? `   - exact prepared arguments path: ${tool.workspaceRelativeRecoveryArgumentPath}`
            : undefined,
          tool.recoveryArgumentSha256 ? `   - exact prepared arguments sha256: ${tool.recoveryArgumentSha256}` : undefined,
          tool.recoveryArgumentParseStatus ? `   - exact prepared arguments parse status: ${tool.recoveryArgumentParseStatus}` : undefined,
          tool.inputPreview ? `   - input preview: ${tool.inputPreview}` : undefined,
        ];
        return lines.filter(Boolean).join("\n");
      })
    : ["No open tool call was left in-flight."];
  const diagnosticLines = runtimeProviderDiagnosticDisplayLines(input.diagnostic);
  return [
    "Ambient/Pi provider stream was interrupted. Continue the same user request from the durable recovery state below.",
    "",
    "Important recovery rules:",
    "- Do not restart the whole task from scratch.",
    "- Treat the durable recovery state as authoritative. Use visible transcript details only as fallback context.",
    "- Completed tool results already visible in the transcript are observations. Use them; do not repeat them unless the next step genuinely requires it.",
    "- If the stream had already moved into final answer text, finish the answer from the completed transcript and avoid repeating completed tools.",
    "- Tool calls marked as not executed may be retried if still useful.",
    "- For write-like JSON arguments, call recovery_apply_interrupted_write_suffix and pass only the missing suffix after the saved content prefix; if that recovery tool is unavailable, call normal write with recoveryMode interrupted_write_suffix, content empty, and recoverySuffix only.",
    "- If the interrupted call is itself recovery_apply_interrupted_write_suffix, call it again with only the missing tail after the saved recovery suffix prefix; Ambient will compose the original saved write prefix, saved recovery suffix prefix, and provided tail.",
    "- Do not use ambient_tool_search to find recovery_* tools because they are Pi-session tools, not Ambient catalog tools.",
    "- If recovery_read_interrupted_tool_call input is listed for a not-executed non-write tool call, use that recovery tool and retry with those exact arguments instead of reconstructing them from memory.",
    "- Tool calls marked as execution started/completion unknown may have caused side effects. Verify state before retrying or changing anything further.",
    "- Tool intent is part of the durable recovery state. If an interrupted or unknown tool is marked required_before_final_answer, retry it or obtain equivalent evidence for the same target before giving a final answer.",
    "- For search, fetch, and verification tools, do not answer from stale earlier results when a newer interrupted tool targets a specific URL, source, product, or claim unless completed evidence covers that same target.",
    "- If substitute_allowed is true, an equivalent completed source may replace the interrupted tool only when it supports the same targetSummary and declaredPurpose.",
    "- If the safest next step needs user input, ask a concise question. Otherwise keep working.",
    "",
    `Provider error: ${input.message}`,
    diagnosticLines.length ? "Diagnostic detail:" : undefined,
    ...diagnosticLines,
    "",
    `Completed tool messages already in transcript: ${input.completedToolMessageCount}`,
    `Visible assistant output before interruption: ${input.hadVisibleAssistantOutput ? "yes" : "no"}`,
    input.continuationState ? "" : undefined,
    input.continuationState ? "Durable recovery state:" : undefined,
    input.continuationState ? JSON.stringify(providerContinuationStatePromptView(input.continuationState), null, 2) : undefined,
    "",
    "Interrupted/open tool calls:",
    ...toolLines,
  ].filter((line) => line !== undefined).join("\n");
}

export function buildProviderInterruptionContinuationInput(input: {
  baseInput: SendMessageInput;
  permissionMode: PermissionMode;
  retrySourceUserMessageId: string;
  attempt: number;
  maxRetries: number;
  sessionRecovery: RuntimeSessionRecoveryContext;
  message: string;
  diagnostic: ProviderInterruptionDiagnostic;
  tools: ProviderInterruptionToolSnapshot[];
  completedToolMessageCount: number;
  hadVisibleAssistantOutput: boolean;
  continuationState: ProviderContinuationState;
  model?: string | undefined;
}): ProviderInterruptionContinuationSendInput {
  const content = buildProviderInterruptionContinuationPrompt({
    message: input.message,
    diagnostic: input.diagnostic,
    tools: input.tools,
    completedToolMessageCount: input.completedToolMessageCount,
    hadVisibleAssistantOutput: input.hadVisibleAssistantOutput,
    continuationState: input.continuationState,
  });
  return {
    ...input.baseInput,
    internal: true,
    permissionMode: input.permissionMode,
    ...(input.model ? { model: input.model } : {}),
    retryOfMessageId: input.retrySourceUserMessageId,
    delivery: "prompt",
    preserveActiveThread: true,
    modelContentOverride: content,
    sessionRecovery: input.sessionRecovery,
    assistantFinalizationRetry: {
      sourceUserMessageId: input.retrySourceUserMessageId,
      attempt: input.attempt,
      maxRetries: input.maxRetries,
      reason: "provider_interruption_continuation",
      recoveryStateId: input.continuationState.stateId,
    },
  };
}

export function providerContinuationStatePromptView(state: ProviderContinuationState): Record<string, unknown> {
  return {
    stateId: state.stateId,
    runId: state.runId,
    threadId: state.threadId,
    failure: state.failure,
    retry: state.retry,
    stream: state.stream,
    assistant: state.assistant,
    tools: {
      completedToolMessageCount: state.tools.completedToolMessageCount,
      open: state.tools.open.map(providerContinuationToolPromptView),
      completed: state.tools.completed.map(providerContinuationToolPromptView),
      mayHaveSideEffects: state.tools.mayHaveSideEffects.map(providerContinuationToolPromptView),
    },
    ...(state.sessionFile ? { sessionFile: state.sessionFile } : {}),
  };
}

export function providerContinuationToolPromptView(tool: ProviderContinuationToolState): Record<string, unknown> {
  return {
    toolCallId: tool.toolCallId,
    toolName: tool.toolName,
    status: tool.status,
    certainty: tool.certainty,
    phase: tool.phase,
    executionStarted: tool.executionStarted,
    mayHaveSideEffects: tool.mayHaveSideEffects,
    argumentComplete: tool.argumentComplete,
    inputChars: tool.inputChars,
    observedArgumentChars: tool.observedArgumentChars,
    ...(tool.inputPreview ? { inputPreview: tool.inputPreview } : {}),
    ...(tool.artifactPath ? { artifactPath: tool.artifactPath } : {}),
    ...(tool.executionStartedAt ? { executionStartedAt: tool.executionStartedAt } : {}),
    ...(tool.executionCompletedAt ? { executionCompletedAt: tool.executionCompletedAt } : {}),
    ...(tool.failureReason ? { failureReason: tool.failureReason } : {}),
    ...(tool.workspaceRelativeRecoveryArgumentPath ? { recoveryArgumentPath: tool.workspaceRelativeRecoveryArgumentPath } : {}),
    ...(tool.intent ? { intent: providerContinuationToolIntentPromptView(tool.intent) } : {}),
  };
}

export function providerContinuationToolIntentPromptView(intent: ToolIntentSnapshot): Record<string, unknown> {
  return {
    operationKind: intent.operationKind,
    materiality: intent.materiality,
    substituteAllowed: intent.substituteAllowed,
    ...(intent.targetSummary ? { targetSummary: intent.targetSummary } : {}),
    ...(intent.declaredPurpose ? { declaredPurpose: intent.declaredPurpose } : {}),
    ...(intent.turnGoal ? { turnGoal: intent.turnGoal } : {}),
    ...(intent.assistantLeadIn ? { assistantLeadIn: intent.assistantLeadIn } : {}),
  };
}

export function toolIntentPromptLine(intent: ToolIntentSnapshot): string {
  return [
    intent.operationKind,
    intent.materiality,
    intent.targetSummary ? `target=${intent.targetSummary}` : undefined,
    intent.declaredPurpose ? `purpose=${intent.declaredPurpose}` : undefined,
    intent.substituteAllowed ? "substitute_allowed" : "no_substitute",
  ].filter(Boolean).join("; ");
}

export function providerToolPhaseLabel(tool: ProviderInterruptionToolSnapshot): string {
  if (tool.phase === "execution_started_unknown") return "execution started; completion unknown";
  if (tool.phase === "arguments_prepared_not_executed") return "arguments prepared; tool did not execute";
  return "arguments were still streaming; tool did not execute";
}
