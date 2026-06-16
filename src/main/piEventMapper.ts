import type {
  MediaArtifactResult,
  ToolExternalModelResponseArtifact,
  ToolEditInputPreview,
  ToolEditInputPreviewEdit,
  ToolEditTextPreview,
  ToolLargeOutputPreview,
  ToolLargeOutputPreviewItem,
  ToolLongformInputPreview,
  WorkflowInjectedPlaybookMetadata,
} from "../shared/types";
import type {
  MessagingConversationDirectorySetupCard,
  MessagingConversationDirectorySetupCardConversation,
  MessagingRemoteSurfaceActivationCard,
  MessagingRemoteSurfaceActivationCardPhase,
  TelegramSessionSetupCard,
  TelegramSessionSetupCardAction,
  TelegramSessionSetupCardStatus,
} from "../shared/messagingGateway";
import { buildToolLongformInputPreview } from "./toolLongformInputPreview";
import type { AmbientInstallRouteSummary, AmbientInstallRouteTelemetry } from "./installRoutePlanner";
import {
  createSubagentRuntimeEvent,
  type SubagentRuntimeEvent,
  type SubagentRuntimeEventInput,
  type SubagentRuntimeEventSource,
} from "../shared/subagentProtocol";
import type { SubagentRunSummary } from "../shared/types";
import {
  largeOutputPreviewItemsMissingArtifacts,
  validateLargeOutputPreviewArtifacts,
  type LargeOutputPreviewMissingArtifactItem,
} from "./subagentInvariants";

type ToolStatus = "running" | "done" | "error";
type ToolEventDetails = Record<string, string>;
const TOOL_ARGS_MAX_CHARS = 1600;
const TOOL_ARGS_IDENTITY_STRING_MAX_CHARS = 240;
const TOOL_EDIT_TEXT_PREVIEW_CHARS = 1_000;
const LARGE_OUTPUT_MIN_CHARS = 2_000;

interface ToolArgsPreviewOptions {
  maxDepth: number;
  maxArrayItems: number;
  maxObjectEntries: number;
  stringPreviewChars: number;
}

const TOOL_ARGS_PREVIEW_PROFILES: ToolArgsPreviewOptions[] = [
  { maxDepth: 5, maxArrayItems: 20, maxObjectEntries: 30, stringPreviewChars: 1000 },
  { maxDepth: 5, maxArrayItems: 20, maxObjectEntries: 24, stringPreviewChars: 240 },
  { maxDepth: 5, maxArrayItems: 20, maxObjectEntries: 24, stringPreviewChars: 120 },
  { maxDepth: 4, maxArrayItems: 10, maxObjectEntries: 16, stringPreviewChars: 80 },
  { maxDepth: 3, maxArrayItems: 6, maxObjectEntries: 10, stringPreviewChars: 40 },
  { maxDepth: 5, maxArrayItems: 20, maxObjectEntries: 12, stringPreviewChars: 0 },
];

export interface ToolResultDetails {
  runtime?: string;
  toolName?: string;
  status?: string;
  stage?: string;
  targetUrl?: string;
  elapsedMs?: number;
  outputChars?: number;
  thinkingChars?: number;
  idleElapsedMs?: number;
  idleTimeoutMs?: number;
  timeoutMode?: string;
  waitingOn?: string;
  approvalRequestId?: string;
  approvalTitle?: string;
  heartbeatCount?: number;
  progressPercent?: number;
  diff?: string;
  firstChangedLine?: number;
  mediaArtifact?: MediaArtifactResult;
  telegramSessionSetup?: TelegramSessionSetupCard;
  messagingConversationDirectorySetup?: MessagingConversationDirectorySetupCard;
  messagingRemoteSurfaceActivation?: MessagingRemoteSurfaceActivationCard;
  testStatus?: string;
  providerCapabilityId?: string;
  previousProviderCapabilityId?: string;
  selectedProviderCapabilityId?: string;
  voiceId?: string;
  selectedVoiceId?: string;
  audioPath?: string;
  mimeType?: string;
  durationMs?: number;
  largeOutputPreview?: ToolLargeOutputPreview;
  externalModelResponse?: ToolExternalModelResponseArtifact;
  workflowPlaybook?: WorkflowInjectedPlaybookMetadata;
  installRouteSummary?: AmbientInstallRouteSummary;
  installRouteTelemetry?: AmbientInstallRouteTelemetry;
}

export type NormalizedPiEvent =
  | { kind: "assistant-update"; delta?: string; finalText?: string; error?: string }
  | { kind: "assistant-end"; finalText?: string; error?: string }
  | { kind: "thinking-start" }
  | { kind: "thinking-update"; delta?: string; finalText?: string }
  | { kind: "thinking-end"; finalText?: string }
  | { kind: "agent-end"; finalTexts: string[]; errors: string[] }
  | {
      kind: "tool-input-start";
      toolCallId: string;
      label: string;
      content: string;
      input?: unknown;
      longformInputPreview?: ToolLongformInputPreview;
      editInputPreview?: ToolEditInputPreview;
    }
  | {
      kind: "tool-input-update";
      toolCallId: string;
      label: string;
      content: string;
      contentDelta?: boolean;
      input?: unknown;
      longformInputPreview?: ToolLongformInputPreview;
      editInputPreview?: ToolEditInputPreview;
    }
  | {
      kind: "tool-input-end";
      toolCallId: string;
      label: string;
      content: string;
      input?: unknown;
      longformInputPreview?: ToolLongformInputPreview;
      editInputPreview?: ToolEditInputPreview;
    }
  | {
      kind: "tool-start";
      toolCallId: string;
      label: string;
      content: string;
      input?: unknown;
      details?: ToolEventDetails;
      longformInputPreview?: ToolLongformInputPreview;
      editInputPreview?: ToolEditInputPreview;
    }
  | {
      kind: "tool-update";
      toolCallId: string;
      label: string;
      content: string;
      details?: ToolEventDetails;
      resultDetails?: ToolResultDetails;
      longformInputPreview?: ToolLongformInputPreview;
      editInputPreview?: ToolEditInputPreview;
    }
  | {
      kind: "tool-end";
      toolCallId: string;
      label: string;
      content: string;
      status: ToolStatus;
      details?: ToolEventDetails;
      resultDetails?: ToolResultDetails;
      longformInputPreview?: ToolLongformInputPreview;
      editInputPreview?: ToolEditInputPreview;
    }
  | { kind: "queue-update"; steering: string[]; followUp: string[] }
  | { kind: "compaction-start"; reason: "manual" | "threshold" | "overflow" }
  | {
      kind: "compaction-end";
      reason: "manual" | "threshold" | "overflow";
      aborted: boolean;
      willRetry: boolean;
      error?: string;
    }
  | { kind: "auto-retry-start"; attempt: number; maxAttempts: number; delayMs: number; error: string }
  | { kind: "auto-retry-end"; success: boolean; attempt: number; error?: string }
  | { kind: "unknown" };

export function normalizePiEvent(event: any): NormalizedPiEvent {
  if (event?.type === "compaction_start") {
    return {
      kind: "compaction-start",
      reason: normalizeReason(event.reason),
    };
  }

  if (event?.type === "compaction_end") {
    return {
      kind: "compaction-end",
      reason: normalizeReason(event.reason),
      aborted: Boolean(event.aborted),
      willRetry: Boolean(event.willRetry),
      ...(event.errorMessage ? { error: String(event.errorMessage) } : {}),
    };
  }

  if (event?.type === "auto_retry_start") {
    return {
      kind: "auto-retry-start",
      attempt: normalizePositiveInt(event.attempt, 1),
      maxAttempts: normalizePositiveInt(event.maxAttempts, 1),
      delayMs: normalizePositiveInt(event.delayMs, 0),
      error: String(event.errorMessage || "The previous attempt failed."),
    };
  }

  if (event?.type === "auto_retry_end") {
    return {
      kind: "auto-retry-end",
      success: Boolean(event.success),
      attempt: normalizePositiveInt(event.attempt, 1),
      ...(event.finalError ? { error: String(event.finalError) } : {}),
    };
  }

  if (event?.type === "queue_update") {
    return {
      kind: "queue-update",
      steering: Array.isArray(event.steering) ? event.steering.map((item: unknown) => String(item)) : [],
      followUp: Array.isArray(event.followUp) ? event.followUp.map((item: unknown) => String(item)) : [],
    };
  }

  const directThinkingEvent = normalizeThinkingEvent(event);
  if (directThinkingEvent) return directThinkingEvent;

  if (event?.type === "message_update") {
    const update = event.assistantMessageEvent;
    const error = extractAssistantError(update?.partial ?? event.message);
    const thinkingEvent = normalizeThinkingEvent(update);
    if (thinkingEvent) return thinkingEvent;
    const toolCallEvent = normalizeToolCallStreamEvent(update);
    if (toolCallEvent) return toolCallEvent;

    if (update?.type === "text_delta") {
      const delta = String(update.delta ?? "");
      return { kind: "assistant-update", ...(delta ? { delta } : {}), ...(error ? { error } : {}) };
    }

    if (update?.type === "text_end") {
      const finalText = String(update.content ?? "");
      return {
        kind: "assistant-update",
        ...(finalText ? { finalText } : {}),
        ...(error ? { error } : {}),
      };
    }

    return { kind: "assistant-update", ...(error ? { error } : {}) };
  }

  if (event?.type === "message_end") {
    if (event.message?.role === "toolResult") {
      const rawLabel = String(event.message.toolName || event.toolName || "tool");
      const content = formatToolDisplayResult(event.message.content, event.message.details);
      const details = toolDetails(event.message.content) ?? toolDetails(event.message.details);
      const label = routedToolDisplayLabel(rawLabel, details, event.message.content, event.message.details);
      const status = routedToolStatus(rawLabel, event.message.isError ? "error" : "done", details, event.message.content, event.message.details);
      const resultDetails = mergeToolResultDetails(label, content, event.message.content, event.message.details);
      const longformInputPreview = toolLongformInputPreview(event.message.content) ?? toolLongformInputPreview(event.message.details);
      return {
        kind: "tool-end",
        toolCallId: String(event.message.toolCallId || event.toolCallId || ""),
        label,
        content,
        status,
        ...(details ? { details } : {}),
        ...(resultDetails ? { resultDetails } : {}),
        ...(longformInputPreview ? { longformInputPreview } : {}),
      };
    }

    const error = extractAssistantError(event.message);
    const finalText = extractAssistantText(event.message);
    return {
      kind: "assistant-end",
      ...(finalText ? { finalText } : {}),
      ...(error ? { error } : {}),
    };
  }

  if (event?.type === "agent_end" && Array.isArray(event.messages)) {
    return {
      kind: "agent-end",
      finalTexts: event.messages.map(extractAssistantText).filter(Boolean),
      errors: event.messages
        .map(extractAssistantError)
        .filter((error: string | undefined): error is string => Boolean(error)),
    };
  }

  if (event?.type === "tool_execution_start") {
    const rawLabel = String(event.toolName || event.name || "tool");
    const details = toolDetails(event.details);
    const args = normalizeToolArguments(event.args ?? event.input ?? event.arguments);
    const label = routedToolDisplayLabel(rawLabel, args, details, event.details);
    const longformInputPreview = args && typeof args === "object" ? buildToolLongformInputPreview(label, args) : undefined;
    const editInputPreview = args && typeof args === "object" ? buildToolEditInputPreview(label, args) : undefined;
    return {
      kind: "tool-start",
      label,
      toolCallId: String(event.toolCallId || label),
      content: formatToolArgs(args ?? event.args),
      ...toolCaptureInput(label, args),
      ...(details ? { details } : {}),
      ...(longformInputPreview ? { longformInputPreview } : {}),
      ...(editInputPreview ? { editInputPreview } : {}),
    };
  }

  if (event?.type === "tool_execution_update") {
    const rawLabel = String(event.toolName || event.name || "tool");
    const content = formatToolDisplayResult(event.partialResult, event.details);
    const details = toolDetails(event.partialResult) ?? toolDetails(event.details);
    const label = routedToolDisplayLabel(rawLabel, details, event.partialResult, event.details);
    const resultDetails = mergeToolResultDetails(label, content, event.partialResult, event.details);
    const longformInputPreview = toolLongformInputPreview(event.partialResult) ?? toolLongformInputPreview(event.details);
    const editInputPreview = toolEditInputPreview(event.partialResult) ?? toolEditInputPreview(event.details);
    return {
      kind: "tool-update",
      label,
      toolCallId: String(event.toolCallId || event.toolName || event.name || "tool"),
      content,
      ...(details ? { details } : {}),
      ...(resultDetails ? { resultDetails } : {}),
      ...(longformInputPreview ? { longformInputPreview } : {}),
      ...(editInputPreview ? { editInputPreview } : {}),
    };
  }

  if (event?.type === "tool_execution_end") {
    const rawLabel = String(event.toolName || event.name || "tool");
    const baseStatus = event.isError ? "error" : "done";
    const content = formatToolDisplayResult(event.result, event.details);
    const details = toolDetails(event.result) ?? toolDetails(event.details);
    const label = routedToolDisplayLabel(rawLabel, details, event.result, event.details);
    const status = routedToolStatus(rawLabel, baseStatus, details, event.result, event.details);
    const resultDetails = mergeToolResultDetails(label, content, event.result, event.details);
    const longformInputPreview = toolLongformInputPreview(event.result) ?? toolLongformInputPreview(event.details);
    const editInputPreview = toolEditInputPreview(event.result) ?? toolEditInputPreview(event.details);
    return {
      kind: "tool-end",
      label,
      toolCallId: String(event.toolCallId || label),
      content,
      status,
      ...(details ? { details } : {}),
      ...(resultDetails ? { resultDetails } : {}),
      ...(longformInputPreview ? { longformInputPreview } : {}),
      ...(editInputPreview ? { editInputPreview } : {}),
    };
  }

  return { kind: "unknown" };
}

function toolDetails(value: unknown): ToolEventDetails | undefined {
  const details = value && typeof value === "object" && !Array.isArray(value) && "details" in value ? (value as { details?: unknown }).details : value;
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const record = details as Record<string, unknown>;
  const picked: ToolEventDetails = {};
  for (const key of ["source", "runtime", "permissionMode", "pluginId", "pluginName", "serverName", "toolName", "registeredName", "result", "status"]) {
    const value = record[key];
    if (typeof value === "string" && value) picked[key === "status" ? "result" : key] = value;
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
}

function routedToolDisplayLabel(rawLabel: string, ...candidates: unknown[]): string {
  if (rawLabel !== "ambient_tool_call") return rawLabel;
  for (const candidate of candidates) {
    const name = routedToolName(candidate);
    if (name && !isAmbientRouterToolName(name)) return name;
  }
  const fallback = rejectedAmbientRouterLabel(...candidates);
  if (fallback) return fallback;
  return rawLabel;
}

function routedToolStatus(rawLabel: string, status: ToolStatus, ...candidates: unknown[]): ToolStatus {
  if (rawLabel !== "ambient_tool_call") return status;
  return rejectedAmbientRouterLabel(...candidates) ? "error" : status;
}

function isAmbientRouterToolName(name: string): boolean {
  return name === "ambient_tool_call" || name === "ambient_tool_search" || name === "ambient_tool_describe";
}

function routedToolName(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const details = "details" in value ? (value as { details?: unknown }).details : undefined;
  const record = details && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : (value as Record<string, unknown>);
  const wrapped = nonEmptyString(record.wrappedTool);
  if (wrapped) return wrapped;
  const nested = record.resultDetails;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const nestedName = nonEmptyString((nested as Record<string, unknown>).toolName);
    if (nestedName) return nestedName;
  }
  const described = record.describedTool;
  if (described && typeof described === "object" && !Array.isArray(described)) {
    const describedName = nonEmptyString((described as Record<string, unknown>).name);
    if (describedName) return describedName;
  }
  const direct = nonEmptyString(record.toolName) ?? nonEmptyString(record.name);
  if (direct) return direct;
  return undefined;
}

function rejectedAmbientRouterLabel(...candidates: unknown[]): string | undefined {
  const text = candidates.map(toolResultText).filter(Boolean).join("\n");
  if (/Malformed Ambient tool router call/i.test(text)) return "malformed_tool_call";
  if (/No execution performed/i.test(text) || candidates.some(hasSkippedAmbientRouterDetails)) return "rejected_tool_call";
  return undefined;
}

function hasSkippedAmbientRouterDetails(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const details = record.details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const detailRecord = details as Record<string, unknown>;
    if (detailRecord.runtime === "ambient-tool-router" && detailRecord.executionSkipped === true) return true;
  }
  if (record.runtime === "ambient-tool-router" && record.executionSkipped === true) return true;
  return Object.values(record).some(hasSkippedAmbientRouterDetails);
}

function toolResultText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(toolResultText).filter(Boolean).join("\n") || undefined;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return toolResultText(record.content) ?? toolResultText(record.text) ?? toolResultText(record.displayText);
}

function toolResultDetails(value: unknown): ToolResultDetails | undefined {
  const details = value && typeof value === "object" && !Array.isArray(value) && "details" in value ? (value as { details?: unknown }).details : value;
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const record = details as Record<string, unknown>;
  const picked: ToolResultDetails = {};
  const stage = typeof record.stage === "string" && record.stage.trim() ? record.stage : undefined;
  const elapsedMs = typeof record.elapsedMs === "number" && Number.isFinite(record.elapsedMs) ? record.elapsedMs : undefined;
  const outputChars = numberValue(record.outputChars);
  const thinkingChars = numberValue(record.thinkingChars);
  const idleElapsedMs = numberValue(record.idleElapsedMs);
  const idleTimeoutMs = numberValue(record.idleTimeoutMs);
  const heartbeatCount = typeof record.heartbeatCount === "number" && Number.isFinite(record.heartbeatCount) ? record.heartbeatCount : undefined;
  const progressPercent = typeof record.progressPercent === "number" && Number.isFinite(record.progressPercent) ? record.progressPercent : undefined;
  if (
    stage ||
    elapsedMs !== undefined ||
    outputChars !== undefined ||
    thinkingChars !== undefined ||
    idleElapsedMs !== undefined ||
    idleTimeoutMs !== undefined ||
    heartbeatCount !== undefined ||
    progressPercent !== undefined
  ) {
    for (const key of ["runtime", "toolName", "status", "targetUrl", "timeoutMode", "waitingOn", "approvalRequestId", "approvalTitle"] as const) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) picked[key] = value;
    }
    if (stage) picked.stage = stage;
    if (elapsedMs !== undefined) picked.elapsedMs = elapsedMs;
    if (outputChars !== undefined) picked.outputChars = outputChars;
    if (thinkingChars !== undefined) picked.thinkingChars = thinkingChars;
    if (idleElapsedMs !== undefined) picked.idleElapsedMs = idleElapsedMs;
    if (idleTimeoutMs !== undefined) picked.idleTimeoutMs = idleTimeoutMs;
    if (heartbeatCount !== undefined) picked.heartbeatCount = heartbeatCount;
    if (progressPercent !== undefined) picked.progressPercent = progressPercent;
  }
  if (typeof record.diff === "string" && record.diff.trim()) picked.diff = record.diff;
  if (typeof record.firstChangedLine === "number" && Number.isFinite(record.firstChangedLine)) {
    picked.firstChangedLine = record.firstChangedLine;
  }
  const mediaArtifact = mediaArtifactResult(record.mediaArtifact) ?? mediaArtifactResult(record);
  if (mediaArtifact) picked.mediaArtifact = mediaArtifact;
  const setupCard = telegramSessionSetupCard(record.telegramSessionSetup);
  if (setupCard) picked.telegramSessionSetup = setupCard;
  const directorySetupCard = messagingConversationDirectorySetupCard(record.messagingConversationDirectorySetup);
  if (directorySetupCard) picked.messagingConversationDirectorySetup = directorySetupCard;
  const remoteSurfaceActivationCard = messagingRemoteSurfaceActivationCard(record.messagingRemoteSurfaceActivation);
  if (remoteSurfaceActivationCard) picked.messagingRemoteSurfaceActivation = remoteSurfaceActivationCard;
  for (const key of [
    "testStatus",
    "providerCapabilityId",
    "previousProviderCapabilityId",
    "selectedProviderCapabilityId",
    "voiceId",
    "selectedVoiceId",
    "audioPath",
    "mimeType",
  ] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) picked[key] = value;
  }
  if (typeof record.durationMs === "number" && Number.isFinite(record.durationMs)) {
    picked.durationMs = record.durationMs;
  }
  const workflowPlaybook = workflowInjectedPlaybookMetadata(record);
  if (workflowPlaybook) picked.workflowPlaybook = workflowPlaybook;
  const installRouteSummary = installRouteSummaryFromRecord(record.installRouteSummary);
  if (installRouteSummary) picked.installRouteSummary = installRouteSummary;
  const installRouteTelemetry = installRouteTelemetryFromRecord(record.installRouteTelemetry);
  if (installRouteTelemetry) picked.installRouteTelemetry = installRouteTelemetry;
  return Object.keys(picked).length > 0 ? picked : undefined;
}

function installRouteSummaryFromRecord(value: unknown): AmbientInstallRouteSummary | undefined {
  const record = recordValue(value);
  if (!record || record.kind !== "ambient-install-route-summary") return undefined;
  const lane = installRouteLane(record.lane);
  const confidence = installRouteConfidence(record.confidence);
  const reason = nonEmptyString(record.reason);
  const approvalBoundary = installRouteApprovalBoundary(record.approvalBoundary);
  if (!lane || !confidence || !reason || !approvalBoundary) return undefined;
  const secretHandlingRecord = recordValue(record.secretHandling);
  const requiresSecret = typeof secretHandlingRecord?.requiresSecret === "boolean" ? secretHandlingRecord.requiresSecret : undefined;
  const allowedMechanism = installRouteSecretMechanism(secretHandlingRecord?.allowedMechanism);
  const warning = nonEmptyString(secretHandlingRecord?.warning);
  const validationTargetRecord = recordValue(record.validationTarget);
  const validationKind = installRouteValidationKind(validationTargetRecord?.kind);
  const validationDescription = nonEmptyString(validationTargetRecord?.description);
  return {
    kind: "ambient-install-route-summary",
    lane,
    confidence,
    reason,
    approvalBoundary,
    nextTools: stringArray(record.nextTools),
    blockers: stringArray(record.blockers),
    warnings: stringArray(record.warnings),
    ...(requiresSecret !== undefined
      ? {
          secretHandling: {
            requiresSecret,
            ...(allowedMechanism ? { allowedMechanism } : {}),
            ...(warning ? { warning } : {}),
          },
        }
      : {}),
    ...(validationKind && validationDescription
      ? {
          validationTarget: {
            kind: validationKind,
            description: validationDescription,
          },
        }
      : {}),
  };
}

function installRouteTelemetryFromRecord(value: unknown): AmbientInstallRouteTelemetry | undefined {
  const record = recordValue(value);
  if (!record || record.kind !== "ambient-install-route-telemetry") return undefined;
  const lane = installRouteLane(record.lane);
  const confidence = installRouteConfidence(record.confidence);
  const approvalBoundary = installRouteApprovalBoundary(record.approvalBoundary);
  const nextToolCount = numberValue(record.nextToolCount);
  const blockerCount = numberValue(record.blockerCount);
  const warningCount = numberValue(record.warningCount);
  const requiresSecret = typeof record.requiresSecret === "boolean" ? record.requiresSecret : undefined;
  const status = record.status === "completed" || record.status === "failed" || record.status === "planned" ? record.status : undefined;
  if (
    !lane ||
    !confidence ||
    !approvalBoundary ||
    nextToolCount === undefined ||
    blockerCount === undefined ||
    warningCount === undefined ||
    requiresSecret === undefined ||
    !status
  ) return undefined;
  return {
    kind: "ambient-install-route-telemetry",
    lane,
    confidence,
    approvalBoundary,
    ...(nonEmptyString(record.selectedNextTool) ? { selectedNextTool: nonEmptyString(record.selectedNextTool) } : {}),
    nextToolCount: Math.max(0, Math.floor(nextToolCount)),
    blockerCount: Math.max(0, Math.floor(blockerCount)),
    warningCount: Math.max(0, Math.floor(warningCount)),
    requiresSecret,
    ...(installRouteSecretMechanism(record.secretMechanism) ? { secretMechanism: installRouteSecretMechanism(record.secretMechanism) } : {}),
    ...(installRouteValidationKind(record.validationKind) ? { validationKind: installRouteValidationKind(record.validationKind) } : {}),
    status,
  };
}

function installRouteLane(value: unknown): AmbientInstallRouteSummary["lane"] | undefined {
  return [
    "installed-capability",
    "provider-capability-builder",
    "ambient-cli-package",
    "pi-marketplace-curated-wrapper",
    "pi-marketplace-generated-wrapper",
    "pi-marketplace-privileged-review",
    "mcp-autowire",
    "normal-app-setup",
    "privileged-action",
    "unsupported",
    "needs-clarification",
  ].includes(String(value))
    ? (String(value) as AmbientInstallRouteSummary["lane"])
    : undefined;
}

function installRouteConfidence(value: unknown): AmbientInstallRouteSummary["confidence"] | undefined {
  return value === "high" || value === "medium" || value === "low" ? value : undefined;
}

function installRouteApprovalBoundary(value: unknown): AmbientInstallRouteSummary["approvalBoundary"] | undefined {
  return [
    "none-readonly",
    "user-approval-before-write",
    "user-approval-before-execute",
    "privileged-approval-required",
  ].includes(String(value))
    ? (String(value) as AmbientInstallRouteSummary["approvalBoundary"])
    : undefined;
}

function installRouteSecretMechanism(
  value: unknown,
): NonNullable<AmbientInstallRouteSummary["secretHandling"]>["allowedMechanism"] | undefined {
  return [
    "ambient_capability_builder_secret_request",
    "ambient_cli_secret_request",
    "ambient_cli_env_bind",
    "none",
  ].includes(String(value))
    ? (String(value) as NonNullable<AmbientInstallRouteSummary["secretHandling"]>["allowedMechanism"])
    : undefined;
}

function installRouteValidationKind(
  value: unknown,
): NonNullable<AmbientInstallRouteSummary["validationTarget"]>["kind"] | undefined {
  return ["route-only", "health-check", "tool-smoke", "provider-smoke", "app-launch"].includes(String(value))
    ? (String(value) as NonNullable<AmbientInstallRouteSummary["validationTarget"]>["kind"])
    : undefined;
}

function workflowInjectedPlaybookMetadata(record: Record<string, unknown>): WorkflowInjectedPlaybookMetadata | undefined {
  const runtime = nonEmptyString(record.runtime);
  const toolName = nonEmptyString(record.toolName);
  if (runtime !== "ambient-workflows" || toolName !== "ambient_workflows_inject") return undefined;
  const id = nonEmptyString(record.workflowId) ?? nonEmptyString(record.id);
  const version = numberValue(record.version);
  const status = nonEmptyString(record.status);
  if (!id || version === undefined || (status !== "preflight-description" && status !== "injected")) return undefined;
  return {
    id,
    ...(nonEmptyString(record.title) ? { title: nonEmptyString(record.title) } : {}),
    version: Math.max(1, Math.floor(version)),
    status,
    injected: record.injected === true || status === "injected",
    toolNames: stringArray(record.toolNames),
    outputShape: stringArray(record.outputShape),
    markdownTruncated: record.markdownTruncated === true,
  };
}

function telegramSessionSetupCard(value: unknown): TelegramSessionSetupCard | undefined {
  const record = recordValue(value);
  if (!record || record.kind !== "telegram-session-setup") return undefined;
  const providerId = nonEmptyString(record.providerId);
  const profileId = nonEmptyString(record.profileId);
  const action = nonEmptyString(record.action);
  const status = telegramSessionSetupStatus(record.status);
  const title = nonEmptyString(record.title);
  const summary = nonEmptyString(record.summary);
  const detail = nonEmptyString(record.detail);
  if (!providerId || !profileId || !action || !status || !title || !summary || !detail) return undefined;
  const authState = telegramSessionSetupAuthState(record.authState);
  const primaryAction = telegramSessionSetupAction(record.primaryAction);
  const secondaryActions = Array.isArray(record.secondaryActions)
    ? record.secondaryActions.flatMap((item): TelegramSessionSetupCardAction[] => {
        const parsed = telegramSessionSetupAction(item);
        return parsed ? [parsed] : [];
      })
    : [];
  return {
    kind: "telegram-session-setup",
    providerId,
    profileId,
    action,
    status,
    title,
    summary,
    detail,
    ...(nonEmptyString(record.checkedAt) ? { checkedAt: nonEmptyString(record.checkedAt) } : {}),
    ...(typeof record.applied === "boolean" ? { applied: record.applied } : {}),
    ...(authState ? { authState } : {}),
    missingInputs: stringArray(record.missingInputs),
    ...(primaryAction ? { primaryAction } : {}),
    secondaryActions,
    safety: {
      readsProviderMessages: false,
      sendsProviderMessages: false,
      createsBinding: false,
      enablesInboundIngestion: false,
    },
  };
}

function telegramSessionSetupStatus(value: unknown): TelegramSessionSetupCardStatus | undefined {
  return value === "preview" ||
    value === "pending" ||
    value === "needs_code" ||
    value === "needs_password" ||
    value === "ready" ||
    value === "blocked" ||
    value === "unknown"
    ? value
    : undefined;
}

function telegramSessionSetupAction(value: unknown): TelegramSessionSetupCardAction | undefined {
  const record = recordValue(value);
  const id = nonEmptyString(record?.id);
  const label = nonEmptyString(record?.label);
  const title = nonEmptyString(record?.title);
  const prompt = nonEmptyString(record?.prompt);
  const tone = record?.tone === "primary" || record?.tone === "secondary" ? record.tone : undefined;
  if (!id || !label || !title || !prompt || !tone) return undefined;
  return { id, label, title, prompt, tone };
}

function telegramSessionSetupAuthState(value: unknown): TelegramSessionSetupCard["authState"] | undefined {
  const record = recordValue(value);
  if (!record) return undefined;
  const state = nonEmptyString(record.state);
  if (!state) return undefined;
  const message = nonEmptyString(record.message);
  return {
    state,
    ready: record.ready === true,
    needsCode: record.needsCode === true,
    needsPassword: record.needsPassword === true,
    phoneNumberPresent: record.phoneNumberPresent === true,
    ...(message ? { message } : {}),
  };
}

function messagingConversationDirectorySetupCard(value: unknown): MessagingConversationDirectorySetupCard | undefined {
  const record = recordValue(value);
  if (!record || record.kind !== "messaging-conversation-directory-setup") return undefined;
  const providerId = nonEmptyString(record.providerId);
  const status = messagingConversationDirectorySetupStatus(record.status);
  const adapterStatus = record.adapterStatus === "available" || record.adapterStatus === "blocked" ? record.adapterStatus : undefined;
  const adapterKind = record.adapterKind === "live-metadata-only-adapter" || record.adapterKind === "blocked-contract-skeleton" ? record.adapterKind : undefined;
  const previewToolName = nonEmptyString(record.previewToolName);
  if (!providerId || !status || !adapterStatus || !adapterKind || !previewToolName) return undefined;
  if (record.metadataOnlyContractKind !== "metadata-only-routing") return undefined;
  const requiresApprovalForApply = typeof record.requiresApprovalForApply === "boolean" ? record.requiresApprovalForApply : undefined;
  const approvalRecorded = typeof record.approvalRecorded === "boolean" ? record.approvalRecorded : undefined;
  const canApplyWithReadiness = typeof record.canApplyWithReadiness === "boolean" ? record.canApplyWithReadiness : undefined;
  const canApplyNow = typeof record.canApplyNow === "boolean" ? record.canApplyNow : undefined;
  const fetchedConversationCount = numberValue(record.fetchedConversationCount);
  const returnedConversationCount = numberValue(record.returnedConversationCount);
  if (
    requiresApprovalForApply === undefined ||
    approvalRecorded === undefined ||
    canApplyWithReadiness === undefined ||
    canApplyNow === undefined ||
    fetchedConversationCount === undefined ||
    returnedConversationCount === undefined
  ) return undefined;
  return {
    kind: "messaging-conversation-directory-setup",
    providerId,
    ...(nonEmptyString(record.providerLabel) ? { providerLabel: nonEmptyString(record.providerLabel) } : {}),
    status,
    ...(nonEmptyString(record.directoryStatus) ? { directoryStatus: nonEmptyString(record.directoryStatus) } : {}),
    adapterStatus,
    adapterKind,
    previewToolName,
    ...(nonEmptyString(record.applyToolName) ? { applyToolName: nonEmptyString(record.applyToolName) } : {}),
    requiresApprovalForApply,
    approvalRecorded,
    canApplyWithReadiness,
    canApplyNow,
    metadataOnlyContractKind: "metadata-only-routing",
    fetchedConversationCount: Math.max(0, Math.floor(fetchedConversationCount)),
    returnedConversationCount: Math.max(0, Math.floor(returnedConversationCount)),
    ...(nonEmptyString(record.failureMode) ? { failureMode: nonEmptyString(record.failureMode) } : {}),
    ...(nonEmptyString(record.failureHint) ? { failureHint: nonEmptyString(record.failureHint) } : {}),
    blockers: stringArray(record.blockers),
    warnings: stringArray(record.warnings),
    nextSteps: stringArray(record.nextSteps),
    safety: {
      startsBridge: false,
      runsProviderCli: false,
      inspectsProviderDesktop: false,
      readsProviderMessages: false,
      readsProviderHistory: false,
      sendsProviderMessages: false,
      mutatesBindings: false,
    },
    conversations: messagingConversationDirectorySetupConversations(record.conversations),
  };
}

function messagingRemoteSurfaceActivationCard(value: unknown): MessagingRemoteSurfaceActivationCard | undefined {
  const record = recordValue(value);
  if (!record || record.kind !== "messaging-remote-surface-activation") return undefined;
  if (record.intent !== "remote_ambient_surface") return undefined;
  const status = messagingRemoteSurfaceActivationStatus(record.status);
  const title = nonEmptyString(record.title);
  const summary = nonEmptyString(record.summary);
  const detail = nonEmptyString(record.detail);
  const ambientSurface = messagingAmbientSurface(record.ambientSurface);
  if (!status || !title || !summary || !detail || !ambientSurface) return undefined;
  const currentPhase = messagingRemoteSurfaceActivationPhase(record.currentPhase);
  const phaseChips = Array.isArray(record.phaseChips)
    ? record.phaseChips.flatMap((item): MessagingRemoteSurfaceActivationCardPhase[] => {
        const parsed = messagingRemoteSurfaceActivationPhase(item);
        return parsed ? [parsed] : [];
      })
    : [];
  return {
    kind: "messaging-remote-surface-activation",
    intent: "remote_ambient_surface",
    ...(nonEmptyString(record.providerId) ? { providerId: nonEmptyString(record.providerId) } : {}),
    ...(nonEmptyString(record.providerLabel) ? { providerLabel: nonEmptyString(record.providerLabel) } : {}),
    ...(nonEmptyString(record.requestedProvider) ? { requestedProvider: nonEmptyString(record.requestedProvider) } : {}),
    status,
    title,
    summary,
    detail,
    ambientSurface,
    ...(currentPhase ? { currentPhase } : {}),
    phaseChips,
    ...(nonEmptyString(record.recommendedNextTool) ? { recommendedNextTool: nonEmptyString(record.recommendedNextTool) } : {}),
    ...(nonEmptyString(record.delegatedRecommendedNextTool) ? { delegatedRecommendedNextTool: nonEmptyString(record.delegatedRecommendedNextTool) } : {}),
    ...(nonEmptyString(record.activationPlanFirstTool) ? { activationPlanFirstTool: nonEmptyString(record.activationPlanFirstTool) } : {}),
    ...(nonEmptyString(record.repairPrompt) ? { repairPrompt: nonEmptyString(record.repairPrompt) } : {}),
    repairPrompts: stringArray(record.repairPrompts),
    blockedUntilActivationPlan: stringArray(record.blockedUntilActivationPlan),
    previewSendSafety: {
      commandPreviewTool: nonEmptyString(recordValue(record.previewSendSafety)?.commandPreviewTool) ?? "ambient_messaging_remote_surface_command_preview",
      replyPreviewTool: nonEmptyString(recordValue(record.previewSendSafety)?.replyPreviewTool) ?? "ambient_messaging_remote_surface_reply_preview",
      providerSendApplyTool: nonEmptyString(recordValue(record.previewSendSafety)?.providerSendApplyTool) ?? "ambient_messaging_remote_surface_reply_apply",
      previewRequiredBeforeProviderSend: true,
      providerSendRequiresSeparateApproval: true,
      providerSendReady: false,
    },
    safety: {
      startsBridge: false,
      listsProviderChats: false,
      readsProviderMessages: false,
      readsProviderHistory: false,
      mutatesBindings: false,
      startsPolling: false,
      sendsProviderMessages: false,
    },
  };
}

function messagingRemoteSurfaceActivationPhase(value: unknown): MessagingRemoteSurfaceActivationCardPhase | undefined {
  const record = recordValue(value);
  const id = nonEmptyString(record?.id);
  const title = nonEmptyString(record?.title);
  const status = messagingRemoteSurfaceActivationPhaseStatus(record?.status);
  if (!id || !title || !status) return undefined;
  const blockerCount = numberValue(record?.blockerCount);
  return {
    id,
    title,
    status,
    approvalRequired: record?.approvalRequired === true,
    ...(nonEmptyString(record?.nextTool) ? { nextTool: nonEmptyString(record?.nextTool) } : {}),
    blockerCount: blockerCount === undefined ? 0 : Math.max(0, Math.floor(blockerCount)),
  };
}

function messagingRemoteSurfaceActivationStatus(value: unknown): MessagingRemoteSurfaceActivationCard["status"] | undefined {
  return value === "route_ready" ||
    value === "needs_provider_choice" ||
    value === "unsupported_provider" ||
    value === "blocked" ||
    value === "active" ||
    value === "ready_to_start_polling" ||
    value === "needs_setup"
    ? value
    : undefined;
}

function messagingRemoteSurfaceActivationPhaseStatus(value: unknown): MessagingRemoteSurfaceActivationCardPhase["status"] | undefined {
  return value === "complete" ||
    value === "ready" ||
    value === "waiting" ||
    value === "blocked" ||
    value === "optional"
    ? value
    : undefined;
}

function messagingAmbientSurface(value: unknown): MessagingRemoteSurfaceActivationCard["ambientSurface"] | undefined {
  return value === "chat" ||
    value === "projects" ||
    value === "workflow_agents" ||
    value === "settings" ||
    value === "notifications"
    ? value
    : undefined;
}

function messagingConversationDirectorySetupStatus(value: unknown): MessagingConversationDirectorySetupCard["status"] | undefined {
  return value === "preview" ||
    value === "applied" ||
    value === "blocked" ||
    value === "denied" ||
    value === "failed"
    ? value
    : undefined;
}

function messagingConversationDirectorySetupConversations(value: unknown): MessagingConversationDirectorySetupCardConversation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): MessagingConversationDirectorySetupCardConversation[] => {
    const record = recordValue(item);
    const conversationId = nonEmptyString(record?.conversationId);
    const title = nonEmptyString(record?.title);
    if (!conversationId || !title) return [];
    const folderIds = Array.isArray(record?.folderIds)
      ? record.folderIds
        .map((folderId) => typeof folderId === "number" && Number.isFinite(folderId) ? Math.floor(folderId) : undefined)
        .filter((folderId): folderId is number => folderId !== undefined)
      : [];
    const unreadCount = numberValue(record?.unreadCount);
    return [{
      conversationId,
      title,
      ...(nonEmptyString(record?.type) ? { type: nonEmptyString(record?.type) } : {}),
      ...(unreadCount !== undefined ? { unreadCount: Math.max(0, Math.floor(unreadCount)) } : {}),
      folderIds,
      ...(nonEmptyString(record?.updatedAt) ? { updatedAt: nonEmptyString(record?.updatedAt) } : {}),
    }];
  });
}

function mergeToolResultDetails(toolName: string, content: string, ...values: unknown[]): ToolResultDetails | undefined {
  const merged: ToolResultDetails = {};
  for (const value of values) {
    Object.assign(merged, toolResultDetails(value));
  }
  const largeOutputPreview =
    values.map(toolLargeOutputPreview).find((preview): preview is ToolLargeOutputPreview => Boolean(preview)) ??
    largeOutputPreviewFromText(toolName, content);
  if (largeOutputPreview) merged.largeOutputPreview = largeOutputPreview;
  const externalModelResponse = values
    .map((value) => externalModelResponseArtifact(content, value))
    .find((artifact): artifact is ToolExternalModelResponseArtifact => Boolean(artifact));
  if (externalModelResponse) merged.externalModelResponse = externalModelResponse;
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function toolLargeOutputPreview(value: unknown): ToolLargeOutputPreview | undefined {
  const details = value && typeof value === "object" && !Array.isArray(value) && "details" in value ? (value as { details?: unknown }).details : value;
  const record = recordValue(details);
  if (!record) return undefined;

  const explicit = largeOutputPreviewFromRecord(record.largeOutputPreview) ?? largeOutputPreviewFromRecord(record.toolLargeOutputPreview);
  if (explicit) return explicit;

  const nested = recordValue(record.resultDetails);
  const nestedPreview = nested ? toolLargeOutputPreview(nested) : undefined;
  if (nestedPreview) return nestedPreview;

  const items = [
    materializedOutputItem(record.stdoutOutput, "stdout", "stdout"),
    materializedOutputItem(record.stderrOutput, "stderr", "stderr"),
    materializedOutputItem(record.outputOutput, "output"),
    materializedOutputItem(record.textOutput, "text"),
    directOutputItem(record, "stdout", "stdout", "stdout"),
    directOutputItem(record, "stderr", "stderr", "stderr"),
    directOutputItem(record, "output", "output"),
    directOutputItem(record, "text", "text"),
  ].filter((item): item is ToolLargeOutputPreviewItem => Boolean(item));

  return largeOutputPreviewFromItems(items);
}

function largeOutputPreviewFromRecord(value: unknown): ToolLargeOutputPreview | undefined {
  const record = recordValue(value);
  if (!record || record.kind !== "large-output" || !Array.isArray(record.items)) return undefined;
  const summary = stringValue(record.summary);
  const items = record.items.flatMap((item): ToolLargeOutputPreviewItem[] => {
    const itemRecord = recordValue(item);
    const label = stringValue(itemRecord?.label);
    const chars = numberValue(itemRecord?.chars);
    const previewChars = numberValue(itemRecord?.previewChars);
    if (!label || chars === undefined || previewChars === undefined) return [];
    const artifactPath = stringValue(itemRecord?.artifactPath);
    const artifactBytes = numberValue(itemRecord?.artifactBytes);
    const artifactKind = toolOutputArtifactKind(itemRecord?.artifactKind);
    const suggestedTools = Array.isArray(itemRecord?.suggestedTools)
      ? itemRecord.suggestedTools.filter((tool): tool is string => typeof tool === "string" && Boolean(tool.trim()))
      : undefined;
    return [
      {
        label,
        chars,
        previewChars,
        truncated: itemRecord?.truncated === true,
        ...(artifactKind ? { artifactKind } : {}),
        ...(itemRecord?.verbatim === true ? { verbatim: true } : {}),
        ...(artifactPath ? { artifactPath } : {}),
        ...(artifactBytes !== undefined ? { artifactBytes } : {}),
        ...(suggestedTools?.length ? { suggestedTools } : {}),
      },
    ];
  });
  if (!summary || !items.length) return undefined;
  return { kind: "large-output", summary, items };
}

function materializedOutputItem(
  value: unknown,
  label: string,
  artifactKind?: ToolLargeOutputPreviewItem["artifactKind"],
): ToolLargeOutputPreviewItem | undefined {
  const record = recordValue(value);
  if (!record) return undefined;
  const chars = numberValue(record.totalChars);
  const previewChars = numberValue(record.previewChars);
  if (chars === undefined || previewChars === undefined) return undefined;
  const artifactPath = stringValue(record.artifactPath);
  const artifactBytes = numberValue(record.artifactBytes);
  const truncated = record.truncated === true || Boolean(artifactPath) || previewChars < chars;
  if (!truncated && chars < LARGE_OUTPUT_MIN_CHARS) return undefined;
  return largeOutputPreviewItem({ label, chars, previewChars, truncated, artifactPath, artifactBytes, artifactKind });
}

function directOutputItem(
  record: Record<string, unknown>,
  prefix: string,
  label: string,
  artifactKind?: ToolLargeOutputPreviewItem["artifactKind"],
): ToolLargeOutputPreviewItem | undefined {
  const chars = numberValue(record[`${prefix}Chars`]) ?? numberValue(record[`${prefix}TotalChars`]);
  const previewChars = numberValue(record[`${prefix}PreviewChars`]) ?? chars;
  const artifactPath = stringValue(record[`${prefix}ArtifactPath`]);
  if (chars === undefined || previewChars === undefined) return undefined;
  const artifactBytes = numberValue(record[`${prefix}ArtifactBytes`]);
  const truncated = Boolean(artifactPath) || previewChars < chars;
  if (!truncated && chars < LARGE_OUTPUT_MIN_CHARS) return undefined;
  return largeOutputPreviewItem({ label, chars, previewChars, truncated, artifactPath, artifactBytes, artifactKind });
}

function largeOutputPreviewFromText(toolName: string, text: string): ToolLargeOutputPreview | undefined {
  const items = materializedNoticeOutputItems(text);
  if (items.length) return largeOutputPreviewFromItems(items);
  if (text.length < LARGE_OUTPUT_MIN_CHARS) return undefined;
  return largeOutputPreviewFromItems([
    largeOutputPreviewItem({
      label: toolName,
      chars: text.length,
      previewChars: text.length,
      truncated: false,
      artifactKind: "long-log",
    }),
  ]);
}

function materializedNoticeOutputItems(text: string): ToolLargeOutputPreviewItem[] {
  const noticePattern =
    /^\[truncated\]\s+(.+?) preview is ([\d,]+) of ([\d,]+) chars(?:,\s+([\d,]+) bytes)?\.\nFull output saved at:\s+([^\n]+)$/gm;
  return [...text.matchAll(noticePattern)].flatMap((match): ToolLargeOutputPreviewItem[] => {
    const label = match[1]?.trim();
    const previewChars = parseDelimitedNumber(match[2]);
    const chars = parseDelimitedNumber(match[3]);
    const artifactBytes = parseDelimitedNumber(match[4]);
    const artifactPath = match[5]?.trim();
    if (!label || chars === undefined || previewChars === undefined || !artifactPath) return [];
    return [
      largeOutputPreviewItem({
        label,
        chars,
        previewChars,
        truncated: true,
        artifactPath,
        artifactBytes,
      }),
    ];
  });
}

function largeOutputPreviewFromItems(rawItems: ToolLargeOutputPreviewItem[]): ToolLargeOutputPreview | undefined {
  const items = dedupeLargeOutputItems(rawItems);
  if (!items.length) return undefined;
  const totalChars = items.reduce((sum, item) => sum + item.chars, 0);
  const artifactCount = items.filter((item) => item.artifactPath).length;
  const first = items[0];
  const summary =
    items.length === 1
      ? [
          first.label,
          `${first.chars.toLocaleString()} chars`,
          first.truncated && first.previewChars < first.chars ? `${first.previewChars.toLocaleString()} preview` : undefined,
          first.artifactPath ? `full output: ${first.artifactPath}` : undefined,
        ]
          .filter(Boolean)
          .join(" · ")
      : [
          `${items.length.toLocaleString()} outputs`,
          `${totalChars.toLocaleString()} chars`,
          artifactCount ? `${artifactCount.toLocaleString()} ${artifactCount === 1 ? "artifact" : "artifacts"}` : undefined,
        ]
          .filter(Boolean)
          .join(" · ");
  return { kind: "large-output", summary, items };
}

function dedupeLargeOutputItems(items: ToolLargeOutputPreviewItem[]): ToolLargeOutputPreviewItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = [item.label, item.artifactPath ?? "", item.chars, item.previewChars].join("\0");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function largeOutputPreviewItem(input: {
  label: string;
  chars: number;
  previewChars: number;
  truncated: boolean;
  artifactPath?: string;
  artifactBytes?: number;
  artifactKind?: ToolLargeOutputPreviewItem["artifactKind"];
  verbatim?: boolean;
}): ToolLargeOutputPreviewItem {
  return {
    label: input.label,
    chars: input.chars,
    previewChars: input.previewChars,
    truncated: input.truncated,
    ...(input.artifactKind ? { artifactKind: input.artifactKind } : {}),
    ...(input.verbatim ? { verbatim: true } : {}),
    ...(input.artifactPath ? { artifactPath: input.artifactPath, suggestedTools: ["file_read", "long_context_process"] } : {}),
    ...(input.artifactBytes !== undefined ? { artifactBytes: input.artifactBytes } : {}),
  };
}

function externalModelResponseArtifact(content: string, value: unknown): ToolExternalModelResponseArtifact | undefined {
  const details = value && typeof value === "object" && !Array.isArray(value) && "details" in value ? (value as { details?: unknown }).details : value;
  const record = recordValue(details);
  if (!record) return undefined;

  const nested = recordValue(record.resultDetails);
  const nestedArtifact = nested ? externalModelResponseArtifact(content, nested) : undefined;
  if (nestedArtifact) return nestedArtifact;

  const marker = record.externalModelResponse ?? record.verbatimExternalModelResponse;
  const markerRecord = recordValue(marker);
  const marked =
    marker === true ||
    markerRecord !== undefined ||
    stringValue(record.responseKind) === "external-model" ||
    stringValue(record.artifactKind) === "external-model-response";
  if (!marked) return undefined;

  const source = markerRecord ?? record;
  const outputRecord =
    recordValue(source.output) ??
    recordValue(source.stdoutOutput) ??
    recordValue(record.stdoutOutput) ??
    recordValue(record.outputOutput) ??
    recordValue(record.textOutput);
  const text =
    stringValue(source.text) ??
    stringValue(source.response) ??
    stringValue(source.outputText) ??
    stringValue(outputRecord?.text);
  const artifactPath = stringValue(source.artifactPath) ?? stringValue(outputRecord?.artifactPath);
  const artifactBytes = numberValue(source.artifactBytes) ?? numberValue(outputRecord?.artifactBytes);
  const chars = numberValue(source.chars) ?? numberValue(source.totalChars) ?? numberValue(outputRecord?.totalChars) ?? text?.length ?? content.length;
  const previewChars = numberValue(source.previewChars) ?? numberValue(outputRecord?.previewChars) ?? text?.length ?? chars;
  const truncated = source.truncated === true || outputRecord?.truncated === true || Boolean(artifactPath) || previewChars < chars;
  const usage = recordValue(source.usage) ?? recordValue(record.usage) ?? recordValue(record.modelUsage);
  return {
    kind: "external-model-response",
    label: stringValue(source.label) ?? "external model response",
    verbatim: true,
    chars,
    previewChars,
    truncated,
    ...(text !== undefined ? { text } : {}),
    ...(artifactPath ? { artifactPath } : {}),
    ...(artifactBytes !== undefined ? { artifactBytes } : {}),
    ...(stringValue(source.model) ? { model: stringValue(source.model) } : {}),
    ...(stringValue(source.provider) ? { provider: stringValue(source.provider) } : {}),
    ...(usage ? { usage } : {}),
  };
}

function toolOutputArtifactKind(value: unknown): ToolLargeOutputPreviewItem["artifactKind"] | undefined {
  const kind = stringValue(value);
  if (kind === "tool-output" || kind === "stdout" || kind === "stderr" || kind === "long-log" || kind === "external-model-response") return kind;
  return undefined;
}

function parseDelimitedNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  return numberValue(Number(value.replace(/,/g, "")));
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toolLongformInputPreview(value: unknown): ToolLongformInputPreview | undefined {
  const details = value && typeof value === "object" && !Array.isArray(value) && "details" in value ? (value as { details?: unknown }).details : value;
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const preview = (details as Record<string, unknown>).toolLongformInputPreview;
  if (!preview || typeof preview !== "object" || Array.isArray(preview)) return undefined;
  const record = preview as Record<string, unknown>;
  if (record.kind !== "longform-input" || !Array.isArray(record.items) || typeof record.summary !== "string") return undefined;
  return preview as ToolLongformInputPreview;
}

function toolEditInputPreview(value: unknown): ToolEditInputPreview | undefined {
  const details = value && typeof value === "object" && !Array.isArray(value) && "details" in value ? (value as { details?: unknown }).details : value;
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const preview = (details as Record<string, unknown>).toolEditInputPreview;
  if (!preview || typeof preview !== "object" || Array.isArray(preview)) return undefined;
  const record = preview as Record<string, unknown>;
  if (record.kind !== "edit-input" || !Array.isArray(record.edits) || typeof record.summary !== "string") return undefined;
  return preview as ToolEditInputPreview;
}

function buildToolEditInputPreview(toolName: string, args: unknown): ToolEditInputPreview | undefined {
  if (toolName.toLowerCase() !== "edit") return undefined;
  const record = recordValue(args);
  if (!record) return undefined;

  const path = firstStringField(record, ["path", "filePath", "file_path", "file", "targetPath", "target_path"]);
  const edits = collectToolEditInputPreviewEdits(record);
  if (!edits.length) return undefined;

  const totalChars = edits.reduce((sum, edit) => sum + edit.oldText.chars + edit.newText.chars, 0);
  const replacementLabel = `${edits.length.toLocaleString()} ${edits.length === 1 ? "replacement" : "replacements"}`;
  const summary = [path, replacementLabel, `${totalChars.toLocaleString()} chars`].filter(Boolean).join(" · ");
  return {
    kind: "edit-input",
    summary,
    edits,
    ...(path ? { path } : {}),
    ...(path ? { language: languageFromPath(path) } : {}),
  };
}

function collectToolEditInputPreviewEdits(record: Record<string, unknown>): ToolEditInputPreviewEdit[] {
  const edits: ToolEditInputPreviewEdit[] = [];
  const rawEdits = normalizeEditArray(record.edits);
  for (const rawEdit of rawEdits) {
    const editRecord = recordValue(rawEdit);
    if (!editRecord) continue;
    const oldText = firstStringField(editRecord, ["oldText", "old_text", "before", "from"]);
    const newText = firstStringField(editRecord, ["newText", "new_text", "after", "to"]);
    if (oldText === undefined || newText === undefined) continue;
    edits.push({
      oldText: buildEditTextPreview(oldText),
      newText: buildEditTextPreview(newText),
    });
  }

  if (!edits.length) {
    const oldText = firstStringField(record, ["oldText", "old_text", "before", "from"]);
    const newText = firstStringField(record, ["newText", "new_text", "after", "to"]);
    if (oldText !== undefined && newText !== undefined) {
      edits.push({
        oldText: buildEditTextPreview(oldText),
        newText: buildEditTextPreview(newText),
      });
    }
  }

  return edits;
}

function normalizeEditArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildEditTextPreview(text: string): ToolEditTextPreview {
  const truncated = text.length > TOOL_EDIT_TEXT_PREVIEW_CHARS;
  const preview = truncated ? text.slice(0, TOOL_EDIT_TEXT_PREVIEW_CHARS) : text;
  return {
    preview,
    chars: text.length,
    truncated,
    ...(truncated ? { omittedChars: text.length - TOOL_EDIT_TEXT_PREVIEW_CHARS } : {}),
  };
}

function firstStringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function languageFromPath(path: string): string | undefined {
  const extension = path.split(".").pop()?.toLowerCase();
  if (!extension || extension === path.toLowerCase()) return undefined;
  const languages: Record<string, string> = {
    cjs: "javascript",
    css: "css",
    html: "html",
    js: "javascript",
    json: "json",
    jsonc: "json",
    jsx: "jsx",
    md: "markdown",
    mjs: "javascript",
    py: "python",
    ts: "typescript",
    tsx: "tsx",
    txt: "text",
    yaml: "yaml",
    yml: "yaml",
  };
  return languages[extension] ?? extension;
}

function mediaArtifactResult(value: unknown): MediaArtifactResult | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const previewEligible = record.inlinePreviewEligible === true || record.renderedInline === true;
  if (!previewEligible) return undefined;
  const artifactPath = stringField(record, "artifactPath");
  const mediaKind = stringField(record, "mediaKind");
  const bytes = numberField(record, "bytes");
  const displayInstruction = stringField(record, "displayInstruction");
  if (!artifactPath || !isMediaArtifactKind(mediaKind) || bytes === undefined || !displayInstruction) return undefined;
  const mimeType = stringField(record, "mimeType");
  const width = numberField(record, "width");
  const height = numberField(record, "height");
  const sourceUrl = stringField(record, "sourceUrl");
  const licenseNote = stringField(record, "licenseNote");
  return {
    artifactPath,
    mediaKind,
    bytes,
    ...(record.inlinePreviewEligible === true ? { inlinePreviewEligible: true } : {}),
    ...(record.renderedInline === true ? { renderedInline: true } : {}),
    displayInstruction,
    ...(mimeType ? { mimeType } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(licenseNote ? { licenseNote } : {}),
  };
}

function isMediaArtifactKind(value: string | undefined): value is MediaArtifactResult["mediaKind"] {
  return value === "image" || value === "audio" || value === "video";
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeReason(reason: unknown): "manual" | "threshold" | "overflow" {
  return reason === "manual" || reason === "threshold" || reason === "overflow" ? reason : "manual";
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function normalizeThinkingEvent(update: any): NormalizedPiEvent | undefined {
  const type = update?.type;
  if (type === "thinking_start" || type === "reasoning_start" || type === "reasoning_summary_start") {
    return { kind: "thinking-start" };
  }
  if (type === "thinking_delta" || type === "reasoning_delta" || type === "reasoning_summary_delta") {
    const delta = firstString(update.delta, update.text, update.reasoning, update.content);
    return { kind: "thinking-update", ...(delta ? { delta } : {}) };
  }
  if (type === "thinking_end" || type === "reasoning_end" || type === "reasoning_summary_end") {
    const finalText = firstString(update.content, update.thinking, update.text, update.reasoning);
    return { kind: "thinking-end", ...(finalText ? { finalText } : {}) };
  }
  return undefined;
}

function normalizeToolCallStreamEvent(update: any): NormalizedPiEvent | undefined {
  const type = update?.type;
  if (type !== "toolcall_start" && type !== "toolcall_delta" && type !== "toolcall_end") return undefined;

  const toolCall = assistantEventToolCall(update);
  const rawLabel = firstString(toolCall?.name, update.toolName, update.name) ?? "tool";
  const contentIndex = Number.isInteger(update?.contentIndex) ? Number(update.contentIndex) : undefined;
  const toolCallId = firstString(toolCall?.id, update.toolCallId, update.id) ?? `toolcall-${contentIndex ?? rawLabel}`;
  const args = normalizeToolArguments(toolCall?.arguments ?? update.arguments);
  const label = routedToolDisplayLabel(rawLabel, args, update);
  const delta = firstString(update.delta);
  const content =
    args && typeof args === "object"
      ? formatToolArgs(args)
      : firstString(delta, update.partialJson, update.arguments) ?? "";
  const contentDelta = type === "toolcall_delta" && !(args && typeof args === "object") && delta !== undefined && content === delta;
  const longformInputPreview = args && typeof args === "object" ? buildToolLongformInputPreview(label, args) : undefined;
  const editInputPreview = args && typeof args === "object" ? buildToolEditInputPreview(label, args) : undefined;

  if (type === "toolcall_start") {
    return {
      kind: "tool-input-start",
      toolCallId,
      label,
      content,
      ...toolCaptureInput(label, args),
      ...(longformInputPreview ? { longformInputPreview } : {}),
      ...(editInputPreview ? { editInputPreview } : {}),
    };
  }
  if (type === "toolcall_end") {
    return {
      kind: "tool-input-end",
      toolCallId,
      label,
      content,
      ...toolCaptureInput(label, args),
      ...(longformInputPreview ? { longformInputPreview } : {}),
      ...(editInputPreview ? { editInputPreview } : {}),
    };
  }
  return {
    kind: "tool-input-update",
    toolCallId,
    label,
    content,
    ...(contentDelta ? { contentDelta: true } : {}),
    ...toolCaptureInput(label, args),
    ...(longformInputPreview ? { longformInputPreview } : {}),
    ...(editInputPreview ? { editInputPreview } : {}),
  };
}

function toolCaptureInput(label: string, args: unknown): { input: unknown } | Record<string, never> {
  const normalized = label.toLowerCase();
  if (normalized !== "write" && normalized !== "file_write") return {};
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  if (writePayloadHasContent(args as Record<string, unknown>)) return { input: args };
  return {};
}

function writePayloadHasContent(record: Record<string, unknown>): boolean {
  if (["content", "newContent", "new_content", "replacement", "text"].some((key) => typeof record[key] === "string")) return true;
  for (const key of ["toolInput", "input", "args", "arguments", "params"]) {
    const nested = record[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested) && writePayloadHasContent(nested as Record<string, unknown>)) return true;
  }
  return false;
}

function assistantEventToolCall(update: any): any | undefined {
  if (update?.toolCall) return update.toolCall;
  const contentIndex = Number.isInteger(update?.contentIndex) ? Number(update.contentIndex) : undefined;
  const block = contentIndex === undefined ? undefined : update?.partial?.content?.[contentIndex];
  if (!block || typeof block !== "object") return undefined;
  return block.type === "toolCall" || block.name || block.id || block.arguments ? block : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

function normalizeToolArguments(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : value;
  } catch {
    return value;
  }
}

export function extractAssistantText(message: any): string {
  if (!message || message.role !== "assistant" || !Array.isArray(message.content)) return "";
  return message.content
    .map((block: any) => {
      if (block?.type === "text") return String(block.text ?? "");
      return "";
    })
    .join("");
}

export function extractAssistantError(message: any): string | undefined {
  if (!message || message.role !== "assistant") return undefined;
  if (message.stopReason === "error" || message.stopReason === "aborted") {
    return String(message.errorMessage || `Assistant stopped with reason: ${message.stopReason}`);
  }
  return undefined;
}

export function formatToolArgs(args: unknown): string {
  if (args === undefined || args === null) return "";
  const command = extractCommandArgs(args);
  if (command) return command;
  try {
    if (typeof args === "string") return previewStandaloneString(args);
    for (const profile of TOOL_ARGS_PREVIEW_PROFILES) {
      const preview = previewToolArgsValue(args, profile);
      const printable = JSON.stringify(preview, null, 2);
      if (printable.length <= TOOL_ARGS_MAX_CHARS) return printable;
      const compact = JSON.stringify(preview);
      if (compact.length <= TOOL_ARGS_MAX_CHARS) return compact;
    }
    return JSON.stringify(oversizedToolArgsSummary(args), null, 2);
  } catch {
    return String(args);
  }
}

export function formatToolResult(result: unknown): string {
  if (result === undefined || result === null) return "";
  if (typeof result === "string") return result;
  if (Array.isArray(result)) {
    return result
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) return String((item as { text: unknown }).text);
        return formatToolArgs(item);
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof result === "object" && "content" in result) {
    return formatToolResult((result as { content: unknown }).content);
  }
  return formatToolArgs(result);
}

function formatToolDisplayResult(result: unknown, details?: unknown): string {
  return toolDisplayText(result) ?? toolDisplayText(details) ?? formatToolResult(result);
}

function toolDisplayText(value: unknown): string | undefined {
  const details = value && typeof value === "object" && !Array.isArray(value) && "details" in value ? (value as { details?: unknown }).details : value;
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const displayText = (details as Record<string, unknown>).displayText;
  return typeof displayText === "string" && displayText.trim() ? displayText.trim() : undefined;
}

function previewStandaloneString(value: string): string {
  if (value.length <= TOOL_ARGS_MAX_CHARS) return value;
  return `${value.slice(0, TOOL_ARGS_MAX_CHARS - 80)}\n... (${value.length} chars total)`;
}

function previewToolArgsValue(value: unknown, options: ToolArgsPreviewOptions, depth = 0, path: string[] = []): unknown {
  if (typeof value === "string") {
    if (isIdentityStringPath(path) && value.length <= TOOL_ARGS_IDENTITY_STRING_MAX_CHARS) return value;
    if (value.length <= options.stringPreviewChars) return value;
    const preview = options.stringPreviewChars > 0 ? `${value.slice(0, options.stringPreviewChars)}\n... (${value.length} chars total)` : `... (${value.length} chars total)`;
    return {
      preview,
      chars: value.length,
      truncated: true,
      omittedChars: Math.max(0, value.length - options.stringPreviewChars),
    };
  }
  if (!value || typeof value !== "object") return value;
  if (depth >= options.maxDepth) return summarizeNestedValue(value);
  if (Array.isArray(value)) {
    const shown = value.slice(0, options.maxArrayItems).map((item, index) => previewToolArgsValue(item, options, depth + 1, [...path, `[${index}]`]));
    if (value.length > options.maxArrayItems) {
      shown.push({
        omittedItems: value.length - options.maxArrayItems,
        totalItems: value.length,
        truncated: true,
      });
    }
    return shown;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const shownEntries = entries.slice(0, options.maxObjectEntries).map(([key, entry]) => [key, previewToolArgsValue(entry, options, depth + 1, [...path, key])]);
  const object = Object.fromEntries(shownEntries);
  if (entries.length > options.maxObjectEntries) {
    return {
      ...object,
      _omittedKeys: entries.slice(options.maxObjectEntries).map(([key]) => key),
      _totalKeys: entries.length,
      _truncated: true,
    };
  }
  return object;
}

function isIdentityStringPath(path: string[]): boolean {
  const key = path[path.length - 1];
  if (!key) return false;
  const normalized = key.replace(/[-_]/g, "").toLowerCase();
  return [
    "artifactpath",
    "file",
    "filepath",
    "filename",
    "id",
    "label",
    "name",
    "outputpath",
    "packageid",
    "packagename",
    "path",
    "targetpath",
    "title",
  ].includes(normalized);
}

function summarizeNestedValue(value: object): unknown {
  if (Array.isArray(value)) return { type: "array", items: value.length, truncated: true };
  return { type: "object", keys: Object.keys(value).slice(0, 8), truncated: true };
}

function oversizedToolArgsSummary(value: unknown): unknown {
  if (Array.isArray(value)) return { type: "array", items: value.length, truncated: true };
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    return { type: "object", keys: keys.slice(0, 20), totalKeys: keys.length, truncated: true };
  }
  return String(value);
}

function extractCommandArgs(args: unknown): string | undefined {
  if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
  const record = args as Record<string, unknown>;
  const command = stringValue(record.command) ?? stringValue(record.cmd);
  if (!command) return undefined;

  const details = [command];
  const cwd = stringValue(record.cwd) ?? stringValue(record.workingDirectory);
  if (cwd) details.push(`cwd: ${cwd}`);
  const description = stringValue(record.description);
  if (description) details.push(`description: ${description}`);
  return details.join("\n");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const PI_CHILD_EVENT_MAPPER_SCHEMA_VERSION = "ambient-pi-child-event-mapper-v1" as const;

export interface PiChildRuntimeEventMapInput {
  run: SubagentRunSummary;
  source: SubagentRuntimeEventSource;
  event: SubagentRuntimeEventInput;
  messagePreviewChars?: number;
  textPreviewChars?: number;
}

export interface PiChildRuntimeEventUpdateContext {
  runtime: string;
  phase: string;
  toolName: string;
  action: SubagentRuntimeEventSource;
}

export function mapPiChildRuntimeEvent(input: PiChildRuntimeEventMapInput): SubagentRuntimeEvent {
  const messagePreviewChars = positivePiChildEventLimit(input.messagePreviewChars, 600);
  const textPreviewChars = positivePiChildEventLimit(input.textPreviewChars, 1200);
  const largeOutputValidation = validatePiChildRuntimeEventLargeOutputArtifact({
    event: input.event,
    messagePreviewChars,
    textPreviewChars,
  });
  if (!largeOutputValidation.valid) {
    throw new Error(largeOutputValidation.reason);
  }
  return createSubagentRuntimeEvent({
    run: input.run,
    source: input.source,
    event: {
      ...input.event,
      ...(input.event.message ? { message: previewPiChildRuntimeText(input.event.message, messagePreviewChars) } : {}),
      ...(input.event.textPreview ? { textPreview: previewPiChildRuntimeText(input.event.textPreview, textPreviewChars) } : {}),
    },
  });
}

export interface PiChildRuntimeLargeOutputArtifactValidation {
  schemaVersion: "ambient-pi-child-runtime-large-output-artifact-v1";
  valid: boolean;
  requiresArtifact: boolean;
  artifactPath?: string;
  clippedFields: Array<{
    field: "message" | "textPreview";
    normalizedCharCount: number;
    maxInlineChars: number;
  }>;
  missingArtifactItems: LargeOutputPreviewMissingArtifactItem[];
  reason?: string;
}

export function validatePiChildRuntimeEventLargeOutputArtifact(input: {
  event: Pick<SubagentRuntimeEventInput, "message" | "textPreview" | "artifactPath" | "details">;
  messagePreviewChars?: number;
  textPreviewChars?: number;
}): PiChildRuntimeLargeOutputArtifactValidation {
  const messagePreviewChars = positivePiChildEventLimit(input.messagePreviewChars, 600);
  const textPreviewChars = positivePiChildEventLimit(input.textPreviewChars, 1200);
  const clippedFields: PiChildRuntimeLargeOutputArtifactValidation["clippedFields"] = [];
  addClippedField(clippedFields, "message", input.event.message, messagePreviewChars);
  addClippedField(clippedFields, "textPreview", input.event.textPreview, textPreviewChars);
  const artifactPath = typeof input.event.artifactPath === "string" ? input.event.artifactPath.trim() : "";
  const largeOutputPreview = toolLargeOutputPreview(input.event.details);
  const missingArtifactItems = largeOutputPreview
    ? largeOutputPreviewItemsMissingArtifacts({ preview: largeOutputPreview, artifactPath })
    : [];
  const largeOutputRequiresArtifact = Boolean(largeOutputPreview?.items.some((item) => item.truncated || item.previewChars < item.chars));
  const largeOutputArtifactPath = artifactPath || largeOutputPreview?.items.map((item) => item.artifactPath?.trim()).find(Boolean);
  if (!clippedFields.length && missingArtifactItems.length === 0) {
    return {
      schemaVersion: "ambient-pi-child-runtime-large-output-artifact-v1",
      valid: true,
      requiresArtifact: largeOutputRequiresArtifact,
      ...(largeOutputArtifactPath ? { artifactPath: largeOutputArtifactPath } : {}),
      clippedFields,
      missingArtifactItems,
    };
  }
  if (artifactPath && missingArtifactItems.length === 0) {
    return {
      schemaVersion: "ambient-pi-child-runtime-large-output-artifact-v1",
      valid: true,
      requiresArtifact: true,
      artifactPath,
      clippedFields,
      missingArtifactItems,
    };
  }
  const largeOutputViolations = largeOutputPreview
    ? validateLargeOutputPreviewArtifacts({ preview: largeOutputPreview, artifactPath })
    : [];
  const fields = clippedFields.map((field) => `${field.field} ${field.normalizedCharCount}/${field.maxInlineChars}`);
  const missingItems = missingArtifactItems.map((item) => `${item.label} ${item.chars}/${item.previewChars}`);
  const reasonParts = [
    fields.length ? `clipped fields: ${fields.join(", ")}` : undefined,
    missingItems.length ? `large-output items: ${missingItems.join(", ")}` : undefined,
    ...largeOutputViolations.map((violation) => violation.message),
  ].filter((part): part is string => Boolean(part));
  return {
    schemaVersion: "ambient-pi-child-runtime-large-output-artifact-v1",
    valid: false,
    requiresArtifact: true,
    clippedFields,
    missingArtifactItems,
    reason: `Large child runtime output would be clipped or truncated without a full artifact path (${reasonParts.join("; ")}).`,
  };
}

export function piChildRuntimeEventUpdateText(event: SubagentRuntimeEvent): string {
  const suffix = event.message || event.textPreview || event.toolName || event.status || event.type;
  return `Sub-agent ${event.runId} ${event.type.replace(/_/g, " ")}: ${previewPiChildRuntimeText(suffix, 180)}`;
}

export function piChildRuntimeEventUpdateDetails(
  context: PiChildRuntimeEventUpdateContext,
  run: SubagentRunSummary,
  event: SubagentRuntimeEvent,
  runPreview: Record<string, unknown> = compactRunForPiChildEvent(run),
): Record<string, unknown> {
  return {
    runtime: context.runtime,
    phase: context.phase,
    toolName: context.toolName,
    action: context.action,
    type: "subagent.runtime_event",
    childRunId: event.runId,
    parentThreadId: event.parentThreadId,
    parentRunId: event.parentRunId,
    childThreadId: event.childThreadId,
    canonicalTaskPath: event.canonicalTaskPath,
    run: {
      ...runPreview,
      childRunId: event.runId,
    },
    event: compactPiChildRuntimeEvent(event),
  };
}

export function compactPiChildRuntimeEvent(event: SubagentRuntimeEvent): Record<string, unknown> {
  const provenance = compactPiChildRuntimeEventProvenance(event);
  return {
    schemaVersion: event.schemaVersion,
    type: event.type,
    source: event.source,
    runId: event.runId,
    childRunId: event.runId,
    parentThreadId: event.parentThreadId,
    parentRunId: event.parentRunId,
    childThreadId: event.childThreadId,
    canonicalTaskPath: event.canonicalTaskPath,
    createdAt: event.createdAt,
    ...(event.status ? { status: event.status } : {}),
    ...(event.message ? { message: event.message } : {}),
    ...(event.textPreview ? { textPreview: event.textPreview } : {}),
    ...(event.toolName ? { toolName: event.toolName } : {}),
    ...(event.artifactPath ? { artifactPath: event.artifactPath } : {}),
    ...(typeof event.tokenCount === "number" ? { tokenCount: event.tokenCount } : {}),
    ...(typeof event.costMicros === "number" ? { costMicros: event.costMicros } : {}),
    ...(typeof event.localMemoryBytes === "number" ? { localMemoryBytes: event.localMemoryBytes } : {}),
    ...provenance,
  };
}

function compactPiChildRuntimeEventProvenance(event: SubagentRuntimeEvent): Record<string, unknown> {
  const eventRecord = event as unknown as Record<string, unknown>;
  const details = recordValue(event.details) ?? {};
  const approvalId = firstCompactRuntimeString(eventRecord, details, ["approvalId", "approvalGrantId", "permissionGrantId"]);
  const approvalSource = firstCompactRuntimeString(eventRecord, details, ["approvalSource"]);
  const worktreePath = firstCompactRuntimeString(eventRecord, details, ["worktreePath"]);
  const toolCategory = firstCompactRuntimeString(eventRecord, details, ["toolCategory", "toolCategoryId", "category"]);
  const worktreeIsolated = typeof eventRecord.worktreeIsolated === "boolean"
    ? eventRecord.worktreeIsolated
    : typeof details.worktreeIsolated === "boolean"
    ? details.worktreeIsolated
    : undefined;
  return {
    ...(approvalId ? { approvalId } : {}),
    ...(approvalSource ? { approvalSource } : {}),
    ...(worktreeIsolated !== undefined ? { worktreeIsolated } : {}),
    ...(worktreePath ? { worktreePath } : {}),
    ...(toolCategory ? { toolCategory } : {}),
  };
}

function firstCompactRuntimeString(
  eventRecord: Record<string, unknown>,
  details: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = stringValue(eventRecord[key]) ?? stringValue(details[key]);
    if (value) return previewPiChildRuntimeText(value, 240);
  }
  return undefined;
}

function compactRunForPiChildEvent(run: SubagentRunSummary): Record<string, unknown> {
  return {
    id: run.id,
    childRunId: run.id,
    parentThreadId: run.parentThreadId,
    parentRunId: run.parentRunId,
    childThreadId: run.childThreadId,
    canonicalTaskPath: run.canonicalTaskPath,
    roleId: run.roleId,
    dependencyMode: run.dependencyMode,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.closedAt ? { closedAt: run.closedAt } : {}),
  };
}

function positivePiChildEventLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function addClippedField(
  clippedFields: PiChildRuntimeLargeOutputArtifactValidation["clippedFields"],
  field: "message" | "textPreview",
  value: string | undefined,
  maxInlineChars: number,
): void {
  if (typeof value !== "string") return;
  const normalizedCharCount = normalizePiChildRuntimeText(value).length;
  if (normalizedCharCount <= maxInlineChars) return;
  clippedFields.push({
    field,
    normalizedCharCount,
    maxInlineChars,
  });
}

function previewPiChildRuntimeText(value: string, maxChars: number): string {
  const normalized = normalizePiChildRuntimeText(value);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function normalizePiChildRuntimeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
