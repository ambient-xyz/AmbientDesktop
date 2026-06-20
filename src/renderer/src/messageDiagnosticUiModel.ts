import type { ChatMessage } from "../../shared/threadTypes";

export interface MessageDiagnosticCardModel {
  title: string;
  summary: string;
  details: string;
  tone: "warning" | "neutral";
  dismissible: boolean;
}

export function messageHasProviderDiagnostic(message: ChatMessage): boolean {
  return Boolean(providerDiagnosticMetadata(message) || message.metadata?.providerInterruptionContinuation);
}

export function messageDiagnosticCardModel(message: ChatMessage): MessageDiagnosticCardModel | undefined {
  if (messageHasProviderDiagnostic(message)) return providerDiagnosticCardModel(message);
  const symphonyRecovery = recordValue(message.metadata?.symphonyParentModeRecovery);
  if (symphonyRecovery) return symphonyRecoveryCardModel(message, symphonyRecovery);
  if (message.role === "system" && message.metadata?.runtime === "ambient-recovery") {
    return {
      title: "System recovery",
      summary: "Model context was rebuilt from visible transcript recovery state.",
      details: message.content.trim() || JSON.stringify(message.metadata ?? {}, null, 2),
      tone: "warning",
      dismissible: true,
    };
  }
  return undefined;
}

export function messageContentWithoutDiagnostic(message: ChatMessage): string {
  if (message.role === "system" && message.metadata?.runtime === "ambient-recovery") return "";
  if (recordValue(message.metadata?.symphonyParentModeRecovery)) return "";
  if (!messageHasProviderDiagnostic(message)) return message.content;
  const lines = message.content.split(/\r?\n/);
  const diagnosticStart = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith("Ambient/Pi stream stalled before assistant output")
      || trimmed.startsWith("Ambient/Pi provider")
      || trimmed.startsWith("Ambient stopped instead of retrying")
      || trimmed.startsWith("The interrupted tool calls only reached")
      || trimmed.startsWith("Error: Ambient/Pi");
  });
  if (diagnosticStart <= 0) return diagnosticStart === 0 ? "" : message.content;
  return lines.slice(0, diagnosticStart).join("\n").trimEnd();
}

function symphonyRecoveryCardModel(
  message: ChatMessage,
  recovery: Record<string, unknown>,
): MessageDiagnosticCardModel {
  const details = arrayValue(recovery.details)
    .map((item) => stringValue(item))
    .filter((item): item is string => Boolean(item));
  const actions = arrayValue(recovery.actions)
    .map((item) => {
      const action = recordValue(item);
      if (!action) return undefined;
      const label = stringValue(action.label);
      const description = stringValue(action.description);
      if (!label || !description) return undefined;
      return `- ${label}: ${description}`;
    })
    .filter((item): item is string => Boolean(item));
  return {
    title: "Symphony recovery",
    summary: "Conductor lock stopped the parent before a verified workflow launch.",
    details: [
      ...details,
      actions.length ? "Recovery choices:" : undefined,
      ...actions,
      message.content.trim() ? `Visible message:\n${message.content.trim()}` : undefined,
    ].filter((line): line is string => Boolean(line)).join("\n"),
    tone: "warning",
    dismissible: false,
  };
}

function providerDiagnosticCardModel(message: ChatMessage): MessageDiagnosticCardModel {
  const diagnostic = providerDiagnosticMetadata(message);
  const retryScheduled = booleanValue(diagnostic?.retryScheduled);
  const error = stringValue(diagnostic?.message) ?? providerErrorLine(message.content);
  const retryAttempt = numberValue(diagnostic?.retryAttempt);
  const maxRetries = numberValue(diagnostic?.maxRetries);
  const retryReason = stringValue(diagnostic?.retryReason);
  const freshSessionRetry =
    retryReason === "pre_output_stream_stall" ||
    Boolean(message.metadata?.retryingStreamStall) ||
    booleanValue(diagnostic?.retryUsesFreshSession) === true;
  const completedToolMessageCount = numberValue(diagnostic?.completedToolMessageCount);
  const toolMessageCount = numberValue(diagnostic?.toolMessageCount);
  const replaySafe = booleanValue(diagnostic?.replaySafe);
  const interruptedToolCalls = Array.isArray(diagnostic?.interruptedToolCalls) ? diagnostic.interruptedToolCalls : [];
  const nonReplaySafeToolActivity =
    !retryScheduled &&
    replaySafe !== true &&
    (booleanValue(diagnostic?.toolCallSeen) === true ||
      (toolMessageCount !== undefined && toolMessageCount > 0) ||
      (completedToolMessageCount !== undefined && completedToolMessageCount > 0) ||
      interruptedToolCalls.length > 0);
  const summary = freshSessionRetry
    ? retryScheduled
      ? "Ambient/Pi stream stalled before assistant output. Ambient is retrying with a fresh session."
      : "Ambient/Pi stream stalled before assistant output."
    : retryScheduled
      ? "Ambient/Pi stream was interrupted. Ambient is continuing from recovery state."
      : nonReplaySafeToolActivity
        ? "Ambient/Pi stream was interrupted after tool activity. Ambient stopped to avoid replaying side effects."
      : "Ambient/Pi stream was interrupted and needs attention.";
  const attemptLabel = freshSessionRetry ? "Retry attempt" : "Continuation attempt";
  const detailLines = [
    error ? `Error: ${error}` : undefined,
    retryAttempt !== undefined && maxRetries !== undefined ? `${attemptLabel}: ${retryAttempt}/${maxRetries}` : undefined,
    completedToolMessageCount !== undefined ? `Completed tool messages already in transcript: ${completedToolMessageCount}` : undefined,
    interruptedToolCalls.length ? "Open tool calls:" : undefined,
    ...interruptedToolCalls.map(formatInterruptedToolCall),
    metadataDetails(message.metadata),
  ].filter((line): line is string => Boolean(line));
  return {
    title: freshSessionRetry ? "Provider retry" : retryScheduled ? "Provider continuation" : "Provider interruption",
    summary,
    details: detailLines.join("\n"),
    tone: "warning",
    dismissible: true,
  };
}

function providerDiagnosticMetadata(message: ChatMessage): Record<string, unknown> | undefined {
  return recordValue(message.metadata?.piStreamInterruption) ?? recordValue(message.metadata?.piStreamTimeout);
}

function providerErrorLine(content: string): string | undefined {
  const line = content.split(/\r?\n/).map((item) => item.trim()).find((item) => item.startsWith("Error:"));
  return line?.replace(/^Error:\s*/, "").trim();
}

function formatInterruptedToolCall(value: unknown): string {
  const record = recordValue(value);
  if (!record) return "- Unknown tool call";
  const toolName = stringValue(record.toolName) ?? "tool";
  const certainty = stringValue(record.certainty);
  const phase = stringValue(record.phase);
  const inputChars = numberValue(record.inputChars);
  const parts = [
    toolName,
    certainty ? `certainty=${certainty}` : undefined,
    phase ? `phase=${phase}` : undefined,
    inputChars !== undefined ? `${inputChars} input chars` : undefined,
  ].filter(Boolean);
  return `- ${parts.join("; ")}`;
}

function metadataDetails(metadata: Record<string, unknown> | undefined): string | undefined {
  if (!metadata) return undefined;
  try {
    return `Metadata:\n${JSON.stringify(metadata, null, 2)}`;
  } catch {
    return undefined;
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
