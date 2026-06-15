import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  InterruptedToolCallRecoveryDiagnostics,
  InterruptedToolCallRecoverySnapshot,
  ToolIntentSnapshot,
  ToolArgumentProgressSnapshot,
} from "../shared/types";
import {
  parseRecoveryApplyWriteSuffixArgs,
  parseSavedWriteArgs,
} from "./interruptedWriteRecoveryArgs";

export const DEFAULT_INTERRUPTED_TOOL_CALL_RECOVERY_THRESHOLD_CHARS = 16_000;

const RECOVERY_DIRECTORY = ".ambient-codex/interrupted-tool-calls";
const WRITE_TOOL_NAME = "write";
const RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME = "recovery_apply_interrupted_write_suffix";
const PERSIST_DELTA_CHARS = 4_000;
const SUFFIX_PREVIEW_CHARS = 1_200;

type RecoverySource = InterruptedToolCallRecoverySnapshot["source"];

interface RecoveryRecord {
  snapshot: InterruptedToolCallRecoverySnapshot;
  latestText: string;
  lastPersistedChars: number;
}

export class InterruptedToolCallRecoveryTracker {
  readonly thresholdChars: number;

  private readonly active = new Map<string, RecoveryRecord>();
  private readonly completed: InterruptedToolCallRecoverySnapshot[] = [];

  constructor(private readonly input: { workspacePath: string; runId: string; thresholdChars?: number }) {
    this.thresholdChars = normalizeThreshold(input.thresholdChars);
  }

  observe(input: {
    toolCallId: string;
    toolName: string;
    inputText: string;
    source: RecoverySource;
    progress: ToolArgumentProgressSnapshot;
    intent?: ToolIntentSnapshot;
    force?: boolean;
    nowMs?: number;
  }): InterruptedToolCallRecoverySnapshot | undefined {
    const capturedChars = input.inputText.length;
    const observedArgumentChars = Math.max(input.progress.observedArgumentChars, capturedChars);
    if (!input.force && capturedChars < this.thresholdChars && observedArgumentChars < this.thresholdChars) return undefined;
    if (!input.inputText.trim()) return undefined;
    const nowMs = input.nowMs ?? Date.now();
    const existing = this.active.get(input.toolCallId);
    const record: RecoveryRecord =
      existing ??
      ({
        latestText: "",
        lastPersistedChars: 0,
        snapshot: this.createSnapshot(input, capturedChars, observedArgumentChars, nowMs),
      } satisfies RecoveryRecord);

    record.latestText = input.inputText;
    const writeMetadata = writeRecoveryMetadata(input.toolName || record.snapshot.toolName, input.inputText);
    record.snapshot = {
      ...record.snapshot,
      status: "capturing",
      toolName: input.toolName || record.snapshot.toolName,
      source: input.source,
      capturedChars,
      observedArgumentChars,
      updatedAt: iso(nowMs),
      argumentSha256: sha256(input.inputText),
      parseStatus: parseStatus(input.inputText),
      suffixPreview: suffixPreview(input.inputText),
      ...writeMetadata,
      resumeInstruction: resumeInstruction(record.snapshot.workspaceRelativeArgumentPath, writeMetadata),
      ...(input.intent ? { intent: input.intent } : record.snapshot.intent ? { intent: record.snapshot.intent } : {}),
    };

    this.active.set(input.toolCallId, record);
    if (!existing || capturedChars - record.lastPersistedChars >= PERSIST_DELTA_CHARS) {
      this.persist(record);
    }
    return record.snapshot;
  }

  markExecutionStarted(toolCallId: string): InterruptedToolCallRecoverySnapshot | undefined {
    const record = this.active.get(toolCallId);
    if (!record) return undefined;
    this.persist(record);
    const snapshot = { ...record.snapshot, status: "completed" as const, updatedAt: iso(Date.now()) };
    this.active.delete(toolCallId);
    this.completed.push(snapshot);
    if (this.completed.length > 20) this.completed.splice(0, this.completed.length - 20);
    return snapshot;
  }

  recoverable(): InterruptedToolCallRecoverySnapshot[] {
    const snapshots: InterruptedToolCallRecoverySnapshot[] = [];
    for (const record of this.active.values()) {
      this.persist(record);
      record.snapshot = { ...record.snapshot, status: "recoverable", updatedAt: iso(Date.now()) };
      snapshots.push(record.snapshot);
    }
    return snapshots;
  }

  diagnostics(nowMs = Date.now()): InterruptedToolCallRecoveryDiagnostics {
    return {
      version: 1,
      lastUpdatedAt: iso(nowMs),
      active: [...this.active.values()].map((record) => record.snapshot),
      completed: [...this.completed],
    };
  }

  private createSnapshot(
    input: {
      toolCallId: string;
      toolName: string;
      inputText: string;
      source: RecoverySource;
      progress: ToolArgumentProgressSnapshot;
      intent?: ToolIntentSnapshot;
    },
    capturedChars: number,
    observedArgumentChars: number,
    nowMs: number,
  ): InterruptedToolCallRecoverySnapshot {
    const argumentPath = join(
      this.input.workspacePath,
      RECOVERY_DIRECTORY,
      safePathSegment(this.input.runId),
      `${safePathSegment(input.toolCallId)}.partial-args.txt`,
    );
    const workspaceRelativeArgumentPath = relative(this.input.workspacePath, argumentPath);
    const writeMetadata = writeRecoveryMetadata(input.toolName, input.inputText);
    return {
      version: 1,
      status: "capturing",
      runId: this.input.runId,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      source: input.source,
      thresholdChars: this.thresholdChars,
      capturedChars,
      observedArgumentChars,
      updatedAt: iso(nowMs),
      argumentPath,
      workspaceRelativeArgumentPath,
      argumentSha256: sha256(input.inputText),
      parseStatus: parseStatus(input.inputText),
      suffixPreview: suffixPreview(input.inputText),
      ...writeMetadata,
      resumeInstruction: resumeInstruction(workspaceRelativeArgumentPath, writeMetadata),
      ...(input.intent ? { intent: input.intent } : {}),
    };
  }

  private persist(record: RecoveryRecord): void {
    mkdirSync(join(this.input.workspacePath, RECOVERY_DIRECTORY, safePathSegment(this.input.runId)), { recursive: true });
    writeFileSync(record.snapshot.argumentPath, record.latestText, "utf8");
    record.lastPersistedChars = record.latestText.length;
  }
}

export function interruptedToolCallRecoveryThresholdFromEnv(
  env: { AMBIENT_INTERRUPTED_TOOL_CALL_RECOVERY_THRESHOLD_CHARS?: string } = process.env,
): number {
  return normalizeThreshold(Number(env.AMBIENT_INTERRUPTED_TOOL_CALL_RECOVERY_THRESHOLD_CHARS));
}

export function serializeToolInputForInterruptedRecovery(
  rawInput: unknown,
  visibleInput: string,
): { text: string; source: RecoverySource } {
  if (rawInput !== undefined) {
    try {
      return { text: JSON.stringify(rawInput, null, 2), source: "raw_tool_input" };
    } catch {
      return { text: String(rawInput), source: "raw_tool_input" };
    }
  }
  return { text: visibleInput, source: "visible_tool_input" };
}

export function buildInterruptedToolCallRecoveryNotice(
  message: string,
  snapshots: InterruptedToolCallRecoverySnapshot[],
): string {
  const lines = [
    "Ambient/Pi stream interrupted while preparing a large tool call. The tool had not started executing, so Ambient saved the partial arguments and will ask Pi to continue from the interruption point.",
    "",
    message,
    "",
    ...snapshots.flatMap((snapshot) => [
      `Tool: ${snapshot.toolName}`,
      `Captured: ${formatChars(snapshot.capturedChars)} chars`,
      `Partial args: ${snapshot.workspaceRelativeArgumentPath}`,
      `Status: ${snapshot.parseStatus}`,
      "",
    ]),
  ];
  return lines.join("\n").trim();
}

export function buildInterruptedToolCallRecoveryPrompt(snapshots: InterruptedToolCallRecoverySnapshot[]): string {
  const snapshotLines = snapshots
    .map((snapshot, index) => interruptedToolCallSnapshotPromptBlock(snapshot, index))
    .join("\n\n");

  return `Ambient/Pi was interrupted while preparing a large tool call. Continue the same user request from the saved partial tool argument instead of restarting from scratch.

Recoverable tool calls:
${snapshotLines}

For write-like JSON arguments, call recovery_apply_interrupted_write_suffix and pass only the missing suffix after the saved content prefix; if that interrupted tool is itself recovery_apply_interrupted_write_suffix, pass only the missing tail after the saved recovery suffix prefix and Ambient will compose the original saved write prefix, saved recovery suffix prefix, and provided tail. If that recovery tool is unavailable, call the normal write tool with recoveryMode interrupted_write_suffix, content empty, and recoverySuffix only. The target file may not exist because the interrupted write did not execute; do not treat a missing target file as a lost prefix or a reason to restart the whole write. Do not use ambient_tool_search to find recovery_* tools because they are Pi-session tools, not Ambient catalog tools. Use recovery_read_interrupted_tool_call when you need to inspect the exact partial argument text first. Do not use bash output previews or guessed filesystem paths for exact recovery. Do not duplicate the captured prefix. Treat captured intent as authoritative: required_before_final_answer tools must be retried or satisfied with equivalent evidence for the same target before answering. If the partial argument is unusable, explain that briefly and ask for the next instruction.`;
}

function interruptedToolCallSnapshotPromptBlock(snapshot: InterruptedToolCallRecoverySnapshot, index: number): string {
  const suffixPlaceholder = recoverySuffixPlaceholder(snapshot);
  const targetPath = snapshot.recoveryApplyOriginalRunId
    ? "<same target path from original saved write args>"
    : snapshot.writeTargetPath ?? "<same target path from saved write args>";
  const commonPrefix = `${index + 1}. ${snapshot.toolName}
   - exact-args tool: recovery_read_interrupted_tool_call
   - exact-args input: {"runId":"${escapeJsonString(snapshot.runId)}","toolCallId":"${escapeJsonString(snapshot.toolCallId)}","sha256":"${snapshot.argumentSha256}"}
   - write-suffix tool: recovery_apply_interrupted_write_suffix
   - write-suffix input: {"runId":"${escapeJsonString(snapshot.runId)}","toolCallId":"${escapeJsonString(snapshot.toolCallId)}","sha256":"${snapshot.argumentSha256}","suffix":"${suffixPlaceholder}","overlapStrategy":"auto"}
   - normal write fallback: {"path":"${escapeJsonString(targetPath)}","content":"","recoveryMode":"interrupted_write_suffix","recoveryRunId":"${escapeJsonString(snapshot.runId)}","recoveryToolCallId":"${escapeJsonString(snapshot.toolCallId)}","recoverySha256":"${snapshot.argumentSha256}","recoverySuffix":"${suffixPlaceholder}","recoveryOverlapStrategy":"auto"}
   - partial argument file: ${snapshot.workspaceRelativeArgumentPath}`;

  const recoveryApplyMetadata = snapshot.recoveryApplyOriginalRunId
    ? `
   - interrupted recovery apply: this interrupted tool call is recovery_apply_interrupted_write_suffix
   - original write artifact: {"runId":"${escapeJsonString(snapshot.recoveryApplyOriginalRunId)}","toolCallId":"${escapeJsonString(snapshot.recoveryApplyOriginalToolCallId ?? "")}","sha256":"${snapshot.recoveryApplyOriginalSha256 ?? ""}"}
   - saved recovery suffix prefix chars: ${snapshot.recoveryApplySuffixPrefixChars ?? "unknown"}
   - saved recovery suffix total chars: ${snapshot.recoveryApplySuffixTotalChars ?? "unknown"}
   - saved recovery suffix prefix truncated: ${snapshot.recoveryApplySuffixPrefixTruncated === undefined ? "unknown" : snapshot.recoveryApplySuffixPrefixTruncated ? "yes" : "no"}
   - saved recovery suffix omitted chars: ${snapshot.recoveryApplySuffixPrefixOmittedChars ?? "unknown"}
   - saved recovery suffix prefix tail (decoded raw text; continue after this exact suffix prefix and pass only the missing tail):
${indentPreview(snapshot.recoveryApplySuffixPrefixPreview ?? snapshot.suffixPreview)}`
    : `
   - saved write target path: ${snapshot.writeTargetPath ?? "unknown; use exact-args tool if needed"}
   - saved content prefix chars: ${snapshot.writeContentPrefixChars ?? "unknown"}
   - saved content prefix tail (decoded raw text; continue after this exact text and use actual newlines in recoverySuffix):
${indentPreview(snapshot.writeContentPrefixPreview ?? snapshot.suffixPreview)}`;

  return `${commonPrefix}${recoveryApplyMetadata}
   - captured chars: ${snapshot.capturedChars}
   - observed argument chars: ${snapshot.observedArgumentChars}
   - sha256: ${snapshot.argumentSha256}
   - parse status: ${snapshot.parseStatus}
   - intent: ${snapshot.intent ? interruptedToolIntentLine(snapshot.intent) : "not captured"}
   - instruction: ${snapshot.resumeInstruction}`;
}

function interruptedToolIntentLine(intent: ToolIntentSnapshot): string {
  return [
    intent.operationKind,
    intent.materiality,
    intent.targetSummary ? `target=${intent.targetSummary}` : undefined,
    intent.declaredPurpose ? `purpose=${intent.declaredPurpose}` : undefined,
    intent.substituteAllowed ? "substitute_allowed" : "no_substitute",
  ].filter(Boolean).join("; ");
}

function normalizeThreshold(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(numberValue) || numberValue <= 0) return DEFAULT_INTERRUPTED_TOOL_CALL_RECOVERY_THRESHOLD_CHARS;
  return Math.max(1_000, Math.floor(numberValue));
}

function parseStatus(value: string): InterruptedToolCallRecoverySnapshot["parseStatus"] {
  if (!value.trim().startsWith("{") && !value.trim().startsWith("[")) return "text";
  try {
    JSON.parse(value);
    return "valid_json";
  } catch {
    return "invalid_json";
  }
}

function recoverySuffixPlaceholder(snapshot: InterruptedToolCallRecoverySnapshot): string {
  return snapshot.recoveryApplyOriginalRunId
    ? "<only the missing tail after the saved recovery suffix prefix>"
    : "<only the missing suffix after the saved content prefix>";
}

function resumeInstruction(path: string, metadata: Partial<InterruptedToolCallRecoverySnapshot> = {}): string {
  if (metadata.recoveryApplyOriginalRunId) {
    return `For interrupted recovery_apply_interrupted_write_suffix JSON at ${path}, call recovery_apply_interrupted_write_suffix with only the missing tail after the saved recovery suffix prefix. Ambient will compose the original saved write prefix, saved recovery suffix prefix, and provided tail. Use recovery_read_interrupted_tool_call first if you need the exact saved arguments.`;
  }
  return `For write-like JSON at ${path}, call recovery_apply_interrupted_write_suffix with only the missing suffix after the saved content prefix. If that tool is unavailable, call normal write with recoveryMode interrupted_write_suffix, content empty, and recoverySuffix only. The target file may not exist because the interrupted write did not execute; recover from the saved prefix instead of restarting the full write. Use recovery_read_interrupted_tool_call first if you need the exact saved arguments.`;
}

function suffixPreview(value: string): string {
  if (value.length <= SUFFIX_PREVIEW_CHARS) return value;
  return value.slice(-SUFFIX_PREVIEW_CHARS);
}

function indentPreview(value: string): string {
  if (!value) return "     <empty>";
  return value.split(/\r?\n/).map((line) => `     ${line}`).join("\n");
}

function writeRecoveryMetadata(toolName: string, value: string): Partial<InterruptedToolCallRecoverySnapshot> {
  if (toolName === WRITE_TOOL_NAME) {
    const parsed = parseSavedWriteArgs(value);
    if (!parsed) return {};
    return {
      writeTargetPath: parsed.path,
      writeContentPrefixChars: parsed.content.length,
      writeContentPrefixPreview: suffixPreview(parsed.content),
    };
  }
  if (toolName === RECOVERY_APPLY_WRITE_SUFFIX_TOOL_NAME) {
    const parsed = parseRecoveryApplyWriteSuffixArgs(value);
    if (!parsed) return {};
    return {
      recoveryApplyOriginalRunId: parsed.runId,
      recoveryApplyOriginalToolCallId: parsed.toolCallId,
      recoveryApplyOriginalSha256: parsed.sha256,
      recoveryApplySuffixPrefixChars: parsed.suffixPrefix.length,
      recoveryApplySuffixTotalChars: parsed.suffixChars,
      recoveryApplySuffixPrefixPreview: suffixPreview(parsed.suffixPrefix),
      recoveryApplySuffixPrefixTruncated: parsed.suffixTruncated,
      ...(parsed.suffixOmittedChars !== undefined ? { recoveryApplySuffixPrefixOmittedChars: parsed.suffixOmittedChars } : {}),
    };
  }
  return {};
}

function escapeJsonString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safePathSegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96);
  return cleaned || "tool-call";
}

function formatChars(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}
