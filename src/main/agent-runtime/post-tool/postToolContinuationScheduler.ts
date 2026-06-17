import type { ChatMessage, RuntimeActivity } from "../../../shared/types";

type RuntimeStreamActivity = Extract<RuntimeActivity, { kind: "stream" }>;

export interface CompletedToolSnapshot {
  label: string;
  status: "done" | "error";
  runId?: string;
  toolCallId?: string;
  messageId?: string;
  eventSeqAtEnd?: number;
  continuationLines?: string[];
}

export interface InternalContinuationRequest {
  id: string;
  kind: "post-tool-idle";
  runId: string;
  attempt: number;
  idleMs: number;
  scheduledAt: string;
  eventSeqAtSchedule: number;
  snapshot?: CompletedToolSnapshot;
}

export type PostToolContinuationSkipReason =
  | "missing-request"
  | "missing-snapshot"
  | "run-mismatch"
  | "event-seq-advanced"
  | "missing-latest-transcript-tool"
  | "tool-mismatch";

export interface PostToolContinuationValidationDiagnostic {
  requestId?: string;
  reason: PostToolContinuationSkipReason;
  currentRunId: string;
  currentEventSeq: number;
  requestRunId?: string;
  requestEventSeqAtSchedule?: number;
  snapshotRunId?: string;
  snapshotToolCallId?: string;
  snapshotMessageId?: string;
  snapshotEventSeqAtEnd?: number;
  latestToolCallId?: string;
  latestMessageId?: string;
}

export interface PostToolContinuationValidation {
  deliver: boolean;
  snapshot?: CompletedToolSnapshot;
  diagnostic?: PostToolContinuationValidationDiagnostic;
}

export interface PostToolContinuationPlanInput {
  messages: ChatMessage[];
  lastCompletedTool: CompletedToolSnapshot | undefined;
  runId: string;
  attempt: number;
  idleMs: number;
  currentEventSeq: number;
}

export interface PostToolContinuationPlan {
  latestTranscriptTool?: CompletedToolSnapshot;
  continuationSnapshot?: CompletedToolSnapshot;
  request: InternalContinuationRequest;
  validation: PostToolContinuationValidation;
}

export type PostToolContinuationTrigger = "post-tool-idle" | "prompt-resolved-after-tool";

export interface PostToolContinuationActivityInput {
  threadId: string;
  outputChars: number;
  thinkingChars: number;
  idleElapsedMs: number;
  idleTimeoutMs: number;
  trigger: PostToolContinuationTrigger;
  attempt: number;
  maxAttempts: number;
}

export interface StalePostToolContinuationActivityInput {
  threadId: string;
  outputChars: number;
  thinkingChars: number;
  idleElapsedMs: number;
  idleTimeoutMs: number;
  diagnostic: PostToolContinuationValidationDiagnostic | undefined;
}

export function createPostToolContinuationRequest(input: {
  runId: string;
  attempt: number;
  idleMs: number;
  eventSeqAtSchedule: number;
  snapshot?: CompletedToolSnapshot;
  scheduledAt?: string;
}): InternalContinuationRequest {
  return {
    id: `post-tool-continuation:${input.runId}:${input.attempt}:${input.eventSeqAtSchedule}`,
    kind: "post-tool-idle",
    runId: input.runId,
    attempt: input.attempt,
    idleMs: input.idleMs,
    eventSeqAtSchedule: input.eventSeqAtSchedule,
    scheduledAt: input.scheduledAt ?? new Date().toISOString(),
    ...(input.snapshot ? { snapshot: input.snapshot } : {}),
  };
}

export function validatePostToolContinuationRequest(input: {
  request: InternalContinuationRequest | undefined;
  latestTranscriptTool: CompletedToolSnapshot | undefined;
  currentRunId: string;
  currentEventSeq: number;
}): PostToolContinuationValidation {
  const request = input.request;
  const snapshot = request?.snapshot;
  const diagnosticBase = (): Omit<PostToolContinuationValidationDiagnostic, "reason"> => ({
    ...(request?.id ? { requestId: request.id } : {}),
    currentRunId: input.currentRunId,
    currentEventSeq: input.currentEventSeq,
    ...(request?.runId ? { requestRunId: request.runId } : {}),
    ...(request?.eventSeqAtSchedule !== undefined ? { requestEventSeqAtSchedule: request.eventSeqAtSchedule } : {}),
    ...(snapshot?.runId ? { snapshotRunId: snapshot.runId } : {}),
    ...(snapshot?.toolCallId ? { snapshotToolCallId: snapshot.toolCallId } : {}),
    ...(snapshot?.messageId ? { snapshotMessageId: snapshot.messageId } : {}),
    ...(snapshot?.eventSeqAtEnd !== undefined ? { snapshotEventSeqAtEnd: snapshot.eventSeqAtEnd } : {}),
    ...(input.latestTranscriptTool?.toolCallId ? { latestToolCallId: input.latestTranscriptTool.toolCallId } : {}),
    ...(input.latestTranscriptTool?.messageId ? { latestMessageId: input.latestTranscriptTool.messageId } : {}),
  });

  if (!request) return { deliver: false, diagnostic: { ...diagnosticBase(), reason: "missing-request" } };
  if (!snapshot?.runId || !snapshot.toolCallId || !snapshot.messageId || snapshot.eventSeqAtEnd === undefined) {
    return { deliver: false, diagnostic: { ...diagnosticBase(), reason: "missing-snapshot" } };
  }
  if (request.runId !== input.currentRunId || snapshot.runId !== input.currentRunId) {
    return { deliver: false, diagnostic: { ...diagnosticBase(), reason: "run-mismatch" } };
  }
  if (request.eventSeqAtSchedule !== input.currentEventSeq || snapshot.eventSeqAtEnd !== input.currentEventSeq) {
    return { deliver: false, diagnostic: { ...diagnosticBase(), reason: "event-seq-advanced" } };
  }
  const latest = input.latestTranscriptTool;
  if (!latest?.toolCallId || !latest.messageId) {
    return { deliver: false, diagnostic: { ...diagnosticBase(), reason: "missing-latest-transcript-tool" } };
  }
  if (latest.toolCallId !== snapshot.toolCallId || latest.messageId !== snapshot.messageId) {
    return { deliver: false, diagnostic: { ...diagnosticBase(), reason: "tool-mismatch" } };
  }
  return { deliver: true, snapshot: { ...snapshot, ...latest } };
}

export function shouldDeliverPostToolContinuation(input: {
  snapshot: CompletedToolSnapshot | undefined;
  latestTranscriptTool: CompletedToolSnapshot | undefined;
  currentRunId: string;
  currentEventSeq: number;
}): boolean {
  const snapshot = input.snapshot;
  const request = snapshot?.runId && snapshot.eventSeqAtEnd !== undefined
    ? createPostToolContinuationRequest({
      runId: snapshot.runId,
      attempt: 1,
      idleMs: 0,
      eventSeqAtSchedule: snapshot.eventSeqAtEnd,
      snapshot,
    })
    : undefined;
  return validatePostToolContinuationRequest({
    request,
    latestTranscriptTool: input.latestTranscriptTool,
    currentRunId: input.currentRunId,
    currentEventSeq: input.currentEventSeq,
  }).deliver;
}

export function planPostToolContinuation(input: PostToolContinuationPlanInput): PostToolContinuationPlan {
  const latestTranscriptTool = latestCompletedToolSnapshotFromMessages(input.messages);
  const continuationSnapshot =
    latestTranscriptTool?.toolCallId && latestTranscriptTool.toolCallId === input.lastCompletedTool?.toolCallId
      ? { ...input.lastCompletedTool, ...latestTranscriptTool }
      : input.lastCompletedTool;
  const request = createPostToolContinuationRequest({
    runId: input.runId,
    attempt: input.attempt,
    idleMs: input.idleMs,
    eventSeqAtSchedule: input.currentEventSeq,
    snapshot: continuationSnapshot,
  });
  return {
    ...(latestTranscriptTool ? { latestTranscriptTool } : {}),
    ...(continuationSnapshot ? { continuationSnapshot } : {}),
    request,
    validation: validatePostToolContinuationRequest({
      request,
      latestTranscriptTool,
      currentRunId: input.runId,
      currentEventSeq: input.currentEventSeq,
    }),
  };
}

export function postToolContinuationActivity(input: PostToolContinuationActivityInput): RuntimeStreamActivity {
  return {
    threadId: input.threadId,
    kind: "stream",
    status: "running",
    outputChars: input.outputChars,
    thinkingChars: input.thinkingChars,
    idleElapsedMs: input.idleElapsedMs,
    idleTimeoutMs: input.idleTimeoutMs,
    message: input.trigger === "prompt-resolved-after-tool"
      ? `Ambient is asking Pi to continue from the completed tool result after the prompt resolved without a final answer (attempt ${input.attempt}/${input.maxAttempts}).`
      : `Ambient is asking Pi to continue from the completed tool result (attempt ${input.attempt}/${input.maxAttempts}).`,
  };
}

export function stalePostToolContinuationActivity(input: StalePostToolContinuationActivityInput): RuntimeStreamActivity {
  return {
    threadId: input.threadId,
    kind: "stream",
    status: "running",
    outputChars: input.outputChars,
    thinkingChars: input.thinkingChars,
    idleElapsedMs: input.idleElapsedMs,
    idleTimeoutMs: input.idleTimeoutMs,
    message: "Ambient skipped a stale post-tool continuation because newer run activity arrived before delivery.",
    diagnostic: input.diagnostic,
  };
}

export function postToolIdleContinuationPrompt(tool: CompletedToolSnapshot | undefined): string {
  return [
    "Ambient completed the most recent tool call, but no assistant-visible response followed.",
    "Continue after the latest completed tool result identified below if it is still current.",
    "Do not wait for a new user instruction unless the tool result is explicitly blocked on user input, approval, credentials, or an external action.",
    "If blocked, explain the exact next user action. Otherwise, summarize what happened and take the next required step.",
    tool?.toolCallId ? `Tool call id: ${tool.toolCallId}` : undefined,
    tool ? `Validated completed tool: ${tool.label} (${tool.status}).` : undefined,
    tool?.continuationLines?.length ? ["Validated tool continuation:", ...tool.continuationLines].join("\n") : undefined,
  ].filter(Boolean).join("\n");
}

export function latestCompletedToolSnapshotFromMessages(messages: ChatMessage[]): CompletedToolSnapshot | undefined {
  for (const message of [...messages].reverse()) {
    if (message.role !== "tool") continue;
    const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata as Record<string, unknown> : {};
    const rawStatus = metadata.status;
    if (rawStatus !== "done" && rawStatus !== "error") continue;
    const toolName = typeof metadata.toolName === "string" && metadata.toolName.trim()
      ? metadata.toolName.trim()
      : toolLabelFromTranscript(message.content);
    if (!toolName) continue;
    return {
      label: toolName,
      status: rawStatus,
      ...(typeof metadata.toolCallId === "string" && metadata.toolCallId.trim() ? { toolCallId: metadata.toolCallId.trim() } : {}),
      messageId: message.id,
      continuationLines: toolContinuationLinesFromToolContent(message.content),
    };
  }
  return undefined;
}

function toolLabelFromTranscript(content: string): string | undefined {
  const firstLine = content.split(/\r?\n/, 1)[0]?.trim();
  if (!firstLine) return undefined;
  return firstLine.replace(/\s+(completed|failed|running|prepared|preparing)$/i, "").trim() || undefined;
}

export function privilegedContinuationLinesFromToolContent(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "Continuation:");
  if (start < 0) return [];
  const continuation: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) break;
    if (!line.trimStart().startsWith("- ")) break;
    continuation.push(line.trim());
  }
  return continuation.slice(0, 12);
}

export function browserUserActionContinuationLinesFromToolContent(content: string): string[] {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const first = lines[0] ?? "";
  if (!/^Browser (needs user action|timed out while waiting for user action|was canceled while waiting for user action)\.$/.test(first)) return [];
  const action = lines.find((line) => line.startsWith("Action:"));
  const provider = lines.find((line) => line.startsWith("Provider:"));
  const title = lines.find((line) => line.startsWith("Title:"));
  const url = lines.find((line) => line.startsWith("URL:"));
  const browserState =
    first.includes("needs user action")
      ? "waiting-for-browser-user-action"
      : first.includes("timed out")
        ? "browser-user-action-timed-out"
        : "browser-user-action-canceled";
  return [
    `- browserState: ${browserState}`,
    action ? `- ${action}` : undefined,
    provider ? `- ${provider}` : undefined,
    title ? `- ${title}` : undefined,
    url ? `- ${url}` : undefined,
    "- next: tell the user the browser challenge is blocking progress; after they complete it, retry the same browser operation against the preserved browser session instead of navigating away or switching providers.",
  ].filter((line): line is string => Boolean(line));
}

export function toolContinuationLinesFromToolContent(content: string): string[] {
  return [
    ...privilegedContinuationLinesFromToolContent(content),
    ...browserUserActionContinuationLinesFromToolContent(content),
  ];
}
