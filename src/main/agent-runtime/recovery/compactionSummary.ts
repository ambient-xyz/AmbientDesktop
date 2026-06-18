import type { BrowserCapabilityState } from "../../../shared/browserTypes";
import type { ChatMessage, ThreadSummary } from "../../../shared/threadTypes";
import type { WorkspaceGitStatus } from "../../../shared/workspaceTypes";

export interface AmbientCompactionSummaryInput {
  thread: ThreadSummary;
  visibleMessages: ChatMessage[];
  summarizedMessages?: unknown[];
  previousSummary?: string;
  gitStatus?: WorkspaceGitStatus;
  browserState?: BrowserCapabilityState;
  fileOps?: {
    read?: Iterable<string>;
    written?: Iterable<string>;
    edited?: Iterable<string>;
  };
  queuedMessages?: string[];
  reason?: string;
}

export interface VisibleTranscriptRecoveryInput {
  thread: ThreadSummary;
  visibleMessages: ChatMessage[];
  reason: string;
}

export interface VisibleTranscriptRecoveryReasonInput {
  requestedReason?: string;
  threadSessionFile?: string | null;
  restorableSessionFile?: string;
}

export interface VisibleTranscriptRecoveryCustomMessageInput {
  content: string;
  reason: string;
  recoveredAt: string;
  extraDetails?: Record<string, unknown>;
}

export interface VisibleTranscriptRecoverySummaryCustomMessageInput {
  thread: ThreadSummary;
  visibleMessages: ChatMessage[];
  reason: string;
  recoveredAt: string;
  summaryReason?: string;
  extraDetails?: Record<string, unknown>;
}

export interface VisibleTranscriptRecoveryManualMessagesInput {
  thread: ThreadSummary;
  visibleMessages: ChatMessage[];
  reason: string;
  recoveredAt: string;
  includeSystemMessage: boolean;
}

export interface VisibleTranscriptRecoveryRestorableSessionPlanInput {
  hasRecoveryMessage: boolean;
}

export type VisibleTranscriptRecoveryRestorableSessionPlan =
  | {
      kind: "already-recovered";
      snapshotMessage: string;
    }
  | {
      kind: "normal-compaction-required";
      errorMessage: string;
    };

export type VisibleTranscriptRecoveryUnavailableContextKind = "missing-or-unreadable" | "unreadable";

export interface VisibleTranscriptRecoveryMissingSessionPlanInput {
  threadSessionFile?: string | null;
  restorableSessionFile?: string;
  forceFreshSessionForRecovery: boolean;
  hasVisibleTranscript: boolean;
}

export type VisibleTranscriptRecoveryMissingSessionPlan =
  | {
      kind: "unchanged";
    }
  | {
      kind: "clear-thread-session-file";
    }
  | {
      kind: "unavailable-context";
      unavailableContextKind: VisibleTranscriptRecoveryUnavailableContextKind;
    };

export interface VisibleTranscriptRecoveryUnavailableContextMessagesInput {
  kind: VisibleTranscriptRecoveryUnavailableContextKind;
  sessionErrorMessage?: string;
}

export interface VisibleTranscriptRecoveryUnavailableContextMessages {
  snapshotMessage: string;
  errorMessage: string;
}

export interface VisibleTranscriptRecoverySessionOpenFailurePlanInput {
  hasRecovery: boolean;
  threadSessionFile?: string | null;
  restorableSessionFile?: string;
  recoveryTranscriptMessages: ChatMessage[];
}

export interface VisibleTranscriptRecoverySessionOpenUnavailablePlanInput {
  hasVisibleTranscript: boolean;
  sessionErrorMessage: string;
}

export type VisibleTranscriptRecoverySessionOpenFailurePlan =
  | {
      kind: "recoverable";
      shouldClearThreadSessionFile: boolean;
      shouldSeedVisibleTranscript: boolean;
    }
  | {
      kind: "unavailable";
    };

export type VisibleTranscriptRecoverySessionOpenUnavailablePlan =
  | {
      kind: "unavailable-context";
      unavailableContext: VisibleTranscriptRecoveryUnavailableContextMessages;
    }
  | {
      kind: "clear-thread-session-file";
    };

export interface VisibleTranscriptRecoverySystemMessageOptions {
  reason?: string;
  recoveryDetails?: string;
  metadata?: Record<string, unknown>;
}

export interface VisibleTranscriptRecoverySessionSeedRecovery {
  kind: string;
  reason: string;
  previousSessionFile?: string;
  previousSessionFileExists?: boolean;
  providerContinuationStateId?: string;
}

export interface VisibleTranscriptRecoverySessionSeedInput {
  fallbackReason: string;
  recovery?: VisibleTranscriptRecoverySessionSeedRecovery;
}

export interface VisibleTranscriptRecoverySessionSeedMessagesInput extends VisibleTranscriptRecoverySessionSeedInput {
  thread: ThreadSummary;
  visibleMessages: ChatMessage[];
  recoveredAt: string;
}

export interface VisibleTranscriptRecoveryDefaultSessionSeedMessagesInput
  extends Omit<VisibleTranscriptRecoverySessionSeedMessagesInput, "fallbackReason"> {}

export interface VisibleTranscriptRecoverySessionSeed {
  reason: string;
  summaryReason: string;
  customMessageExtraDetails?: Record<string, unknown>;
  systemMessageOptions: VisibleTranscriptRecoverySystemMessageOptions;
}

export interface VisibleTranscriptRecoveryMessageSelection {
  visibleTranscriptMessages: ChatMessage[];
  recoveryTranscriptMessages: ChatMessage[];
}

export interface VisibleTranscriptRecoverySessionTranscriptContext extends VisibleTranscriptRecoveryMessageSelection {
  hasVisibleTranscript: boolean;
}

export interface VisibleTranscriptRecoverySessionSeedDecisionInput {
  threadSessionFile?: string | null;
  restorableSessionFile?: string;
  hasRecovery: boolean;
  recoveryTranscriptMessages: ChatMessage[];
}

export interface VisibleTranscriptRecoverySessionSeedDecision {
  forceFreshSessionForRecovery: boolean;
  shouldSeedVisibleTranscript: boolean;
}

export interface AmbientCompactionFileLists {
  readFiles: string[];
  modifiedFiles: string[];
}

const MAX_LINES_PER_SECTION = 12;
const MAX_SNIPPET_CHARS = 360;
const VISIBLE_TRANSCRIPT_RECOVERY_ALREADY_REBUILT_CONTEXT_MESSAGE =
  "Model context was already rebuilt from the visible transcript.";
const VISIBLE_TRANSCRIPT_RECOVERY_NORMAL_COMPACTION_REQUIRED_ERROR =
  "This chat's Pi session file is available. Use normal compaction instead of lossy recovery.";
const VISIBLE_TRANSCRIPT_RECOVERY_DEFAULT_SESSION_SEED_REASON =
  "No Pi session file was recorded for this chat, so Ambient rebuilt model context from the visible transcript.";
export const VISIBLE_TRANSCRIPT_RECOVERY_SYSTEM_MESSAGE =
  "Model context was rebuilt from the visible transcript. This recovery is lossy; hidden tool state and exact prior model context were not available.";

export function buildAmbientCompactionSummary(input: AmbientCompactionSummaryInput): string {
  const latestUser = latestMessage(input.visibleMessages, "user");
  const recentAssistant = recentMessages(input.visibleMessages, "assistant", 3)
    .map((message) => redactedSnippet(message.content))
    .filter(Boolean);
  const toolErrors = input.visibleMessages
    .filter((message) => message.role === "tool" && message.metadata?.status === "error")
    .slice(-5)
    .map((message) => `${metadataString(message.metadata?.toolName) ?? "tool"}: ${redactedSnippet(message.content)}`);
  const contextReferences = collectContextReferences(input.visibleMessages);
  const { readFiles, modifiedFiles } = collectAmbientCompactionFileLists(input);
  const canonicalSnippets = (input.summarizedMessages ?? []).map(messageSnippet).filter(Boolean).slice(-6);

  return [
    "# Ambient Compaction Summary",
    "",
    "## Goal",
    latestUser ? `- ${redactedSnippet(latestUser.content)}` : "- Continue the current Ambient Desktop task.",
    "",
    "## Constraints and Preferences",
    `- Workspace: ${input.thread.workspacePath}`,
    `- Permission mode: ${input.thread.permissionMode}`,
    `- Model: ${input.thread.model}`,
    `- Thinking level: ${input.thread.thinkingLevel}`,
    input.reason ? `- Compaction reason: ${input.reason}` : undefined,
    "",
    "## Previous Summary",
    input.previousSummary ? redactedSnippet(input.previousSummary, 1_200) : "- None recorded.",
    "",
    "## Progress",
    ...listOrFallback(
      [
        ...recentAssistant.map((item) => `- ${item}`),
        ...canonicalSnippets.map((item) => `- Canonical span: ${item}`),
      ].slice(0, MAX_LINES_PER_SECTION),
      "- Recent progress was not visible in the local transcript.",
    ),
    "",
    "## Current Workspace State",
    ...workspaceStateLines(input.gitStatus),
    "",
    "## Files Read",
    ...listOrFallback(readFiles.map((file) => `- ${file}`), "- No read files were detected."),
    "",
    "## Files Modified",
    ...listOrFallback(modifiedFiles.map((file) => `- ${file}`), "- No modified files were detected."),
    "",
    "## Selected Context",
    ...listOrFallback(contextReferences.map((item) => `- ${item}`), "- No selected workspace context was detected."),
    "",
    "## Browser State",
    ...browserStateLines(input.browserState),
    "",
    "## Open Questions",
    ...listOrFallback(toolErrors, "- No unresolved tool errors were detected."),
    "",
    "## Queued Follow-Up",
    ...listOrFallback((input.queuedMessages ?? []).map((message) => `- ${redactedSnippet(message)}`), "- None."),
    "",
    "## Next Steps",
    "- Continue from this summary plus the recent unsummarized Pi session messages.",
    "- Preserve concrete file paths, tool failures, and user constraints when planning the next action.",
    "",
    "## Critical Context",
    "- Pi session history remains canonical. This summary exists to preserve Ambient workspace state across compaction.",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

export function collectAmbientCompactionFileLists(input: {
  visibleMessages: ChatMessage[];
  fileOps?: AmbientCompactionSummaryInput["fileOps"];
}): AmbientCompactionFileLists {
  const toolFiles = collectToolFiles(input.visibleMessages);
  return {
    readFiles: uniqueStrings([...iterableValues(input.fileOps?.read), ...toolFiles.read]).slice(0, MAX_LINES_PER_SECTION),
    modifiedFiles: uniqueStrings([
      ...iterableValues(input.fileOps?.written),
      ...iterableValues(input.fileOps?.edited),
      ...toolFiles.modified,
    ]).slice(0, MAX_LINES_PER_SECTION),
  };
}

export function buildVisibleTranscriptRecoverySummary(input: VisibleTranscriptRecoveryInput): string {
  const messages = input.visibleMessages
    .map((message) => ({ message, content: visibleTranscriptRecoveryContent(message) }))
    .filter((entry): entry is { message: ChatMessage; content: string } => Boolean(entry.content))
    .slice(-30);
  return [
    "# Ambient Visible Transcript Recovery",
    "",
    "This is a lossy recovery summary. The original Pi model-visible session file was missing or unreadable, so hidden tool state and exact model context are not available.",
    "",
    "## Recovery Reason",
    `- ${redactedSnippet(input.reason)}`,
    "",
    "## Thread",
    `- Title: ${input.thread.title}`,
    `- Workspace: ${input.thread.workspacePath}`,
    `- Historical permission mode at recovery time, diagnostic only: ${input.thread.permissionMode}`,
    `- Model: ${input.thread.model}`,
    "",
    "## Recent Visible Transcript",
    ...listOrFallback(
      messages.map((entry) => `- ${entry.message.role}: ${redactedSnippet(entry.content)}`),
      "- No visible messages were available.",
    ),
    "",
    "## Recovery Caveats",
    "- Treat this as approximate continuity only.",
    "- Treat thread settings in this recovery summary as historical recovered context. Current Desktop thread settings take precedence for permission-sensitive actions.",
    "- Ask the user or inspect the workspace before relying on details that may have existed only in hidden tool state.",
  ].join("\n");
}

export function visibleTranscriptRecoveryReason(input: VisibleTranscriptRecoveryReasonInput): string {
  return input.requestedReason ??
    (!input.threadSessionFile
      ? VISIBLE_TRANSCRIPT_RECOVERY_DEFAULT_SESSION_SEED_REASON
      : input.restorableSessionFile
      ? "The previous Pi session file exists but could not be read."
      : "The previous Pi session file is missing or outside the thread session directory.");
}

export function visibleTranscriptRecoveryRestorableSessionPlan(
  input: VisibleTranscriptRecoveryRestorableSessionPlanInput,
): VisibleTranscriptRecoveryRestorableSessionPlan {
  if (input.hasRecoveryMessage) {
    return {
      kind: "already-recovered",
      snapshotMessage: VISIBLE_TRANSCRIPT_RECOVERY_ALREADY_REBUILT_CONTEXT_MESSAGE,
    };
  }
  return {
    kind: "normal-compaction-required",
    errorMessage: VISIBLE_TRANSCRIPT_RECOVERY_NORMAL_COMPACTION_REQUIRED_ERROR,
  };
}

export function isVisibleTranscriptRecoveryNormalCompactionRequiredError(message: string): boolean {
  return message.includes("Use normal compaction");
}

export function selectVisibleTranscriptRecoveryMessages(messages: ChatMessage[]): VisibleTranscriptRecoveryMessageSelection {
  const visibleTranscriptMessages = messages.filter((message) => message.content.trim() || message.role === "tool");
  const recoveryTranscriptMessages =
    visibleTranscriptMessages.at(-1)?.role === "user" ? visibleTranscriptMessages.slice(0, -1) : visibleTranscriptMessages;
  return { visibleTranscriptMessages, recoveryTranscriptMessages };
}

export function visibleTranscriptRecoverySessionTranscriptContext(
  messages: ChatMessage[],
): VisibleTranscriptRecoverySessionTranscriptContext {
  return {
    ...selectVisibleTranscriptRecoveryMessages(messages),
    hasVisibleTranscript: messages.length > 0,
  };
}

export function hasSeedableVisibleTranscriptRecoveryMessages(messages: ChatMessage[]): boolean {
  return messages.some((message) => {
    if (message.role === "tool") return true;
    if (message.role !== "assistant") return false;
    return Boolean(visibleTranscriptRecoveryContent(message));
  });
}

export function visibleTranscriptRecoverySessionSeedDecision(
  input: VisibleTranscriptRecoverySessionSeedDecisionInput,
): VisibleTranscriptRecoverySessionSeedDecision {
  const forceFreshSessionForRecovery = Boolean(input.threadSessionFile && !input.restorableSessionFile && input.hasRecovery);
  return {
    forceFreshSessionForRecovery,
    shouldSeedVisibleTranscript:
      !input.restorableSessionFile &&
      (!input.threadSessionFile || forceFreshSessionForRecovery) &&
      hasSeedableVisibleTranscriptRecoveryMessages(input.recoveryTranscriptMessages),
  };
}

export function visibleTranscriptRecoveryMissingSessionPlan(
  input: VisibleTranscriptRecoveryMissingSessionPlanInput,
): VisibleTranscriptRecoveryMissingSessionPlan {
  if (!input.threadSessionFile || input.restorableSessionFile) return { kind: "unchanged" };
  if (input.forceFreshSessionForRecovery || !input.hasVisibleTranscript) return { kind: "clear-thread-session-file" };
  return { kind: "unavailable-context", unavailableContextKind: "missing-or-unreadable" };
}

export function isVisibleTranscriptRecoveryMessage(message: ChatMessage): boolean {
  return message.role === "system" && message.metadata?.runtime === "ambient-recovery" && message.metadata?.lossy === true;
}

export function hasVisibleTranscriptRecoveryMessage(messages: ChatMessage[]): boolean {
  return messages.some(isVisibleTranscriptRecoveryMessage);
}

export function visibleTranscriptRecoveryCustomMessage(input: VisibleTranscriptRecoveryCustomMessageInput) {
  return {
    customType: "ambient-visible-transcript-recovery",
    content: input.content,
    display: true,
    details: {
      lossy: true,
      recoveredAt: input.recoveredAt,
      reason: input.reason,
      source: "ambient-desktop",
      ...input.extraDetails,
    },
  };
}

export function visibleTranscriptRecoverySummaryCustomMessage(input: VisibleTranscriptRecoverySummaryCustomMessageInput) {
  return visibleTranscriptRecoveryCustomMessage({
    content: buildVisibleTranscriptRecoverySummary({
      thread: input.thread,
      visibleMessages: input.visibleMessages,
      reason: input.summaryReason ?? input.reason,
    }),
    reason: input.reason,
    recoveredAt: input.recoveredAt,
    extraDetails: input.extraDetails,
  });
}

export function visibleTranscriptRecoveryManualMessages(input: VisibleTranscriptRecoveryManualMessagesInput) {
  return {
    customMessage: visibleTranscriptRecoverySummaryCustomMessage({
      thread: input.thread,
      visibleMessages: input.visibleMessages,
      reason: input.reason,
      recoveredAt: input.recoveredAt,
    }),
    systemMessage: input.includeSystemMessage ? visibleTranscriptRecoverySystemMessage(input.thread.id) : undefined,
  };
}

export function visibleTranscriptRecoveryUnavailableContextMessages(
  input: VisibleTranscriptRecoveryUnavailableContextMessagesInput,
): VisibleTranscriptRecoveryUnavailableContextMessages {
  if (input.kind === "unreadable") {
    return {
      snapshotMessage: `Model context is not available for this chat because the Pi session file is unreadable: ${input.sessionErrorMessage ?? ""}`,
      errorMessage:
        "Model context is not available for this chat because the Pi session file is unreadable. Start a new chat for exact continuity, or rebuild context from the visible transcript in a recovery flow.",
    };
  }
  return {
    snapshotMessage:
      "Model context is not available for this chat because the Pi session file is missing or unreadable. The visible transcript is still available.",
    errorMessage:
      "Model context is not available for this chat because the Pi session file is missing or unreadable. Start a new chat for exact continuity, or rebuild context from the visible transcript in a recovery flow.",
  };
}

export function visibleTranscriptRecoverySessionOpenFailurePlan(
  input: VisibleTranscriptRecoverySessionOpenFailurePlanInput,
): VisibleTranscriptRecoverySessionOpenFailurePlan {
  if (!input.hasRecovery || !input.restorableSessionFile) return { kind: "unavailable" };
  return {
    kind: "recoverable",
    shouldClearThreadSessionFile: input.threadSessionFile === input.restorableSessionFile,
    shouldSeedVisibleTranscript: hasSeedableVisibleTranscriptRecoveryMessages(input.recoveryTranscriptMessages),
  };
}

export function visibleTranscriptRecoverySessionOpenUnavailablePlan(
  input: VisibleTranscriptRecoverySessionOpenUnavailablePlanInput,
): VisibleTranscriptRecoverySessionOpenUnavailablePlan {
  if (!input.hasVisibleTranscript) return { kind: "clear-thread-session-file" };
  return {
    kind: "unavailable-context",
    unavailableContext: visibleTranscriptRecoveryUnavailableContextMessages({
      kind: "unreadable",
      sessionErrorMessage: input.sessionErrorMessage,
    }),
  };
}

export function visibleTranscriptRecoverySystemMessage(
  threadId: string,
  options: VisibleTranscriptRecoverySystemMessageOptions = {},
) {
  const content = options.reason || options.recoveryDetails
    ? [
        `Model context was rebuilt from the visible transcript.${options.reason ? ` ${options.reason}` : ""}`,
        options.recoveryDetails,
        "This recovery is lossy; hidden tool state and exact prior model context were not available.",
      ].filter(Boolean).join(" ")
    : VISIBLE_TRANSCRIPT_RECOVERY_SYSTEM_MESSAGE;
  return {
    threadId,
    role: "system" as const,
    content,
    metadata: { status: "done" as const, runtime: "ambient-recovery", lossy: true, ...options.metadata },
  };
}

export function buildVisibleTranscriptRecoverySessionSeed(
  input: VisibleTranscriptRecoverySessionSeedInput,
): VisibleTranscriptRecoverySessionSeed {
  const recovery = input.recovery;
  const reason = recovery?.reason ?? input.fallbackReason;
  const recoveryDetails = recovery
    ? [
        `Recovery kind: ${recovery.kind}.`,
        recovery.previousSessionFile
          ? `Previous Pi session file: ${
              recovery.previousSessionFileExists
                ? "unavailable for replay during this recovery; rebuilding from visible transcript"
                : "missing or unreadable"
            }.`
          : undefined,
        recovery.providerContinuationStateId ? `Provider continuation state: ${recovery.providerContinuationStateId}.` : undefined,
      ].filter(Boolean).join(" ")
    : undefined;
  return {
    reason,
    summaryReason: recoveryDetails ? `${reason} ${recoveryDetails}` : reason,
    customMessageExtraDetails: recovery
      ? {
          recoveryKind: recovery.kind,
          previousSessionFileExists: recovery.previousSessionFileExists ?? false,
          ...(recovery.providerContinuationStateId ? { providerContinuationStateId: recovery.providerContinuationStateId } : {}),
        }
      : undefined,
    systemMessageOptions: {
      reason,
      recoveryDetails,
      metadata: recovery
        ? {
            recoveryKind: recovery.kind,
            previousPiSessionFileExists: recovery.previousSessionFileExists ?? false,
            ...(recovery.providerContinuationStateId ? { providerContinuationStateId: recovery.providerContinuationStateId } : {}),
          }
        : undefined,
    },
  };
}

export function visibleTranscriptRecoverySessionSeedMessages(input: VisibleTranscriptRecoverySessionSeedMessagesInput) {
  const seed = buildVisibleTranscriptRecoverySessionSeed(input);
  return {
    customMessage: visibleTranscriptRecoverySummaryCustomMessage({
      thread: input.thread,
      visibleMessages: input.visibleMessages,
      summaryReason: seed.summaryReason,
      recoveredAt: input.recoveredAt,
      reason: seed.reason,
      extraDetails: seed.customMessageExtraDetails,
    }),
    systemMessage: visibleTranscriptRecoverySystemMessage(input.thread.id, seed.systemMessageOptions),
  };
}

export function visibleTranscriptRecoveryDefaultSessionSeedMessages(
  input: VisibleTranscriptRecoveryDefaultSessionSeedMessagesInput,
) {
  return visibleTranscriptRecoverySessionSeedMessages({
    ...input,
    fallbackReason: VISIBLE_TRANSCRIPT_RECOVERY_DEFAULT_SESSION_SEED_REASON,
  });
}

function visibleTranscriptRecoveryContent(message: ChatMessage): string | undefined {
  if (isRecoveryNoiseMessage(message)) return undefined;
  const content = message.content.trim();
  if (!content) return undefined;
  if (message.role === "assistant" && content.length <= 2) return undefined;
  return content;
}

function isRecoveryNoiseMessage(message: ChatMessage): boolean {
  const metadata = message.metadata;
  if (!metadata || typeof metadata !== "object") return false;
  if (metadata.runtime === "ambient-recovery") return true;
  return Boolean(
    metadata.piStreamInterruption ||
      metadata.piStreamTimeout ||
      metadata.providerInterruptionContinuation ||
      metadata.providerContinuationState ||
      metadata.retryingProviderError ||
      metadata.retryingStreamStall ||
      metadata.retryingEmptyAssistantResponse ||
      metadata.piEmptyAssistantResponse,
  );
}

function workspaceStateLines(status: WorkspaceGitStatus | undefined): string[] {
  if (!status) return ["- Git status unavailable."];
  if (!status.isGitRepository) return [`- Git unavailable: ${status.error ?? "not a git repository"}`];
  return [
    `- Branch: ${status.branch}`,
    `- Dirty files: ${status.dirtyCount}`,
    `- Ahead/behind: ${status.ahead}/${status.behind}`,
    `- Changed counts: added ${status.counts.added}, modified ${status.counts.modified}, deleted ${status.counts.deleted}, renamed ${status.counts.renamed}, untracked ${status.counts.untracked}`,
  ];
}

function browserStateLines(state: BrowserCapabilityState | undefined): string[] {
  if (!state?.running) return ["- Browser not running."];
  const userAction = state.userAction;
  const lastSession = state.lastSessionEvent;
  return [
    `- Runtime: ${state.runtime}`,
    `- Profile mode: ${state.profileMode}`,
    state.sessionId ? `- Session id: ${state.sessionId}${state.attachedToExistingSession ? " (reattached)" : ""}` : undefined,
    lastSession ? `- Last session event: ${lastSession.action} (${lastSession.reason})` : undefined,
    state.activeTab?.url ? `- Active tab: ${redactedSnippet(state.activeTab.url)}` : "- Active tab unavailable.",
    userAction
      ? `- Browser user action: ${userAction.status} ${userAction.kind}${userAction.provider ? `/${userAction.provider}` : ""} for ${userAction.toolName}. Reuse this browser session after completion; do not navigate away or switch providers unless the user asks.`
      : undefined,
    state.lastActivity ? `- Last browser activity: ${state.lastActivity}` : undefined,
  ].filter((line): line is string => Boolean(line));
}

function collectContextReferences(messages: ChatMessage[]): string[] {
  const references: string[] = [];
  for (const message of messages) {
    const context = message.metadata?.context;
    if (!Array.isArray(context)) continue;
    for (const item of context) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      if (typeof record.path === "string") references.push(record.path);
    }
  }
  return uniqueStrings(references).slice(0, MAX_LINES_PER_SECTION);
}

function collectToolFiles(messages: ChatMessage[]): { read: string[]; modified: string[] } {
  const read: string[] = [];
  const modified: string[] = [];
  for (const message of messages) {
    if (message.role !== "tool") continue;
    const toolName = metadataString(message.metadata?.toolName)?.toLowerCase();
    const artifactPath = metadataString(message.metadata?.artifactPath);
    if (!artifactPath) continue;
    if (toolName === "read" || toolName === "grep" || toolName === "find" || toolName === "ls") read.push(artifactPath);
    if (toolName === "write" || toolName === "edit") modified.push(artifactPath);
  }
  return { read: uniqueStrings(read), modified: uniqueStrings(modified) };
}

function latestMessage(messages: ChatMessage[], role: ChatMessage["role"]): ChatMessage | undefined {
  return [...messages].reverse().find((message) => message.role === role && message.content.trim());
}

function recentMessages(messages: ChatMessage[], role: ChatMessage["role"], limit: number): ChatMessage[] {
  return messages.filter((message) => message.role === role && message.content.trim()).slice(-limit);
}

function messageSnippet(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const record = message as Record<string, unknown>;
  const role = typeof record.role === "string" ? record.role : "message";
  const content = messageContent(record.content);
  return content ? `${role}: ${redactedSnippet(content)}` : "";
}

function messageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      if (typeof record.text === "string") return record.text;
      if (typeof record.content === "string") return record.content;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function redactedSnippet(value: string, maxChars = MAX_SNIPPET_CHARS): string {
  const redacted = value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|zai|ambient|glm)-[A-Za-z0-9._-]{20,}\b/gi, "[REDACTED]")
    .replace(/\b((?:api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*["']?)([^"',}\s]{8,})/gi, "$1[REDACTED]");
  const compact = redacted.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars)}...`;
}

function listOrFallback(lines: string[], fallback: string): string[] {
  return lines.length ? lines : [fallback];
}

function iterableValues(values: Iterable<string> | undefined): string[] {
  return values ? [...values].filter(Boolean) : [];
}

function metadataString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
