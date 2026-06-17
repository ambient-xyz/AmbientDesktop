import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

import type {
  ChatMessage,
  ThreadSummary,
  WorkflowRecordingCapture,
  WorkflowRecordingCallableInvocationSummary,
  WorkflowRecordingLibraryDescription,
  WorkflowRecordingLibraryEntry,
  WorkflowRecordingLibraryVersion,
  WorkflowRecordingPlaybookDraft,
  WorkflowRecordingReviewDraftUpdate,
  WorkflowRecordingSavedPlaybook,
  WorkflowRecordingState,
  SearchWorkflowRecordingsInput,
} from "../../shared/types";
import {
  assertWorkflowRecordingReviewDraftReusable,
  updateWorkflowRecordingReviewDraftState,
} from "../../shared/workflowRecorder";

export const WORKFLOW_RECORDING_CALLABLE_INVOCATION_SCHEMA_VERSION =
  "ambient-workflow-recording-callable-invocation-v1" as const;
export const WORKFLOW_RECORDING_DIAGNOSTICS_TRACE_SCHEMA_VERSION =
  "ambient-workflow-recording-diagnostics-trace-v1" as const;

export type WorkflowRecordingThreadReference = Pick<ThreadSummary, "id" | "title">;
export type WorkflowRecordingStoppedReviewDraftState = WorkflowRecordingState & {
  status: "stopped";
  review: NonNullable<WorkflowRecordingState["review"]>;
};

export function workflowRecordingRequireStoppedReviewDraft(
  current: WorkflowRecordingState | undefined,
  message: string,
): WorkflowRecordingStoppedReviewDraftState {
  if (!current || current.status !== "stopped" || !current.review?.draft) throw new Error(message);
  return current as WorkflowRecordingStoppedReviewDraftState;
}

export function workflowRecordingFindSummaryMessage(
  messages: readonly Pick<ChatMessage, "id" | "role" | "content">[],
  messageId?: string,
): Pick<ChatMessage, "id" | "role" | "content"> | undefined {
  return messageId
    ? messages.find((message) => message.id === messageId && message.role === "assistant")
    : [...messages].reverse().find((message) => message.role === "assistant" && message.content.includes("## Intent"));
}

export function workflowRecordingThreadReference(
  record: Pick<WorkflowRecordingIndexRecord, "threadId">,
  fallbackTitle: string,
  resolveThread?: (threadId: string) => WorkflowRecordingThreadReference | undefined,
): WorkflowRecordingThreadReference {
  if (record.threadId) {
    try {
      const thread = resolveThread?.(record.threadId);
      if (thread) return { id: thread.id, title: thread.title };
    } catch {
      // Stale index records should still write restorable workflow package metadata.
    }
    return { id: record.threadId, title: fallbackTitle };
  }
  return { id: "unknown", title: fallbackTitle };
}

export function workflowRecordingPlaybookId(threadId: string, intent: string): string {
  const slug = (intent || "workflow-recording")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "workflow-recording"}-${createHash("sha256").update(threadId).digest("hex").slice(0, 10)}`;
}

export function workflowRecordingSavedPlaybook(input: {
  id: string;
  title: string;
  version: number;
  enabled: boolean;
  savedAt: string;
  updatedAt?: string;
  archivedAt?: string;
  archivedReason?: string;
  indexPath: string;
}): WorkflowRecordingSavedPlaybook {
  const rootPath = join(dirname(input.indexPath), input.id);
  return {
    id: input.id,
    title: input.title,
    version: input.version,
    enabled: input.enabled,
    savedAt: input.savedAt,
    updatedAt: input.updatedAt ?? input.savedAt,
    ...(input.archivedAt ? { archivedAt: input.archivedAt } : {}),
    ...(input.archivedReason ? { archivedReason: input.archivedReason } : {}),
    rootPath,
    manifestPath: join(rootPath, "ambient-workflow.json"),
    markdownPath: join(rootPath, "workflow.md"),
    sidecarPath: join(rootPath, "workflow.json"),
    transcriptPath: join(rootPath, "transcript.jsonl"),
    indexPath: input.indexPath,
  };
}

export function workflowRecordingSavedPlaybookForWorkspace(input: {
  workspacePath: string;
  id: string;
  title: string;
  version: number;
  enabled: boolean;
  savedAt: string;
  updatedAt?: string;
  archivedAt?: string;
  archivedReason?: string;
}): WorkflowRecordingSavedPlaybook {
  return workflowRecordingSavedPlaybook({
    id: input.id,
    title: input.title,
    version: input.version,
    enabled: input.enabled,
    savedAt: input.savedAt,
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
    ...(input.archivedAt ? { archivedAt: input.archivedAt } : {}),
    ...(input.archivedReason ? { archivedReason: input.archivedReason } : {}),
    indexPath: workflowRecordingLibraryIndexPath(input.workspacePath),
  });
}

export function workflowRecordingSaveConfirmedPlaybook(input: {
  thread: Pick<ThreadSummary, "id" | "title" | "workspacePath">;
  recording: WorkflowRecordingState;
  savedAt: string;
}): WorkflowRecordingSavedPlaybook {
  const confirmed = input.recording.review?.confirmed;
  if (!confirmed) throw new Error("Confirm the workflow recording review before saving its playbook files.");
  const previous = input.recording.review?.savedPlaybook;
  const id = previous?.id ?? workflowRecordingPlaybookId(input.thread.id, confirmed.intent);
  const version = (previous?.version ?? 0) + 1;
  const title = confirmed.intent || input.thread.title || "Workflow Recording";
  const savedPlaybook = workflowRecordingSavedPlaybookForWorkspace({
    workspacePath: input.thread.workspacePath,
    id,
    title,
    version,
    enabled: true,
    savedAt: input.savedAt,
    updatedAt: input.savedAt,
  });
  workflowRecordingWritePlaybookPackageWithIndex({
    savedPlaybook,
    confirmed,
    capture: input.recording.capture,
    thread: input.thread,
  });
  return savedPlaybook;
}

export function workflowRecordingApplySavedPlaybookReviewState(
  recording: WorkflowRecordingState,
  savedPlaybook: WorkflowRecordingSavedPlaybook,
): WorkflowRecordingState {
  return {
    ...recording,
    review: recording.review
      ? {
          ...recording.review,
          savedPlaybook,
        }
      : recording.review,
  };
}

export function workflowRecordingNextSavedPlaybook(input: {
  id: string;
  title: string;
  savedAt: string;
  indexPath: string;
  record: WorkflowRecordingIndexRecord;
  versions: WorkflowRecordingLibraryVersion[];
}): WorkflowRecordingSavedPlaybook {
  return workflowRecordingSavedPlaybook({
    id: input.id,
    title: input.title,
    version: Math.max(input.record.version, ...input.versions.map((candidate) => candidate.version)) + 1,
    enabled: input.record.enabled,
    savedAt: input.savedAt,
    updatedAt: input.savedAt,
    ...(input.record.archivedAt ? { archivedAt: input.record.archivedAt } : {}),
    ...(input.record.archivedReason ? { archivedReason: input.record.archivedReason } : {}),
    indexPath: input.indexPath,
  });
}

export interface WorkflowRecordingPreparedPlaybookEdit {
  confirmed: WorkflowRecordingPlaybookDraft;
  title: string;
}

export function workflowRecordingPreparePlaybookEdit(input: {
  id: string;
  record: Pick<WorkflowRecordingIndexRecord, "title" | "savedAt">;
  currentPlaybook: WorkflowRecordingPlaybookDraft | undefined;
  draft: WorkflowRecordingReviewDraftUpdate;
  updatedAt: string;
  title?: string;
}): WorkflowRecordingPreparedPlaybookEdit {
  if (!input.currentPlaybook) throw new Error(`Workflow recording has no editable playbook: ${input.id}`);
  const currentState: WorkflowRecordingState = {
    status: "stopped",
    startedAt: input.currentPlaybook.sourceCapturedAt || input.record.savedAt,
    stoppedAt: input.record.savedAt,
    review: {
      status: "draft",
      draft: input.currentPlaybook,
    },
  };
  const editedState = updateWorkflowRecordingReviewDraftState({
    current: currentState,
    draft: input.draft,
    now: input.updatedAt,
    source: "user_edit",
  });
  const editedDraft = editedState.review?.draft;
  if (!editedDraft) throw new Error(`Workflow recording edit did not produce a playbook draft: ${input.id}`);
  assertWorkflowRecordingReviewDraftReusable({ current: currentState, draft: editedDraft });
  const confirmed: WorkflowRecordingPlaybookDraft = {
    ...editedDraft,
    status: "confirmed",
    confirmedAt: input.updatedAt,
  };
  return {
    confirmed,
    title: input.title?.trim() || confirmed.intent || input.record.title,
  };
}

export function workflowRecordingManifest(saved: WorkflowRecordingSavedPlaybook, thread: WorkflowRecordingThreadReference): Record<string, unknown> {
  return {
    kind: "ambient-workflow",
    schemaVersion: 1,
    id: saved.id,
    title: saved.title,
    version: saved.version,
    enabled: saved.enabled,
    savedAt: saved.savedAt,
    updatedAt: saved.updatedAt ?? saved.savedAt,
    ...(saved.archivedAt ? { archivedAt: saved.archivedAt } : {}),
    ...(saved.archivedReason ? { archivedReason: saved.archivedReason } : {}),
    source: "./workflow.md",
    sidecar: "./workflow.json",
    transcript: "./transcript.jsonl",
    callableWorkflow: workflowRecordingCallablePolicy(),
    recorder: {
      threadId: thread.id,
      threadTitle: thread.title,
    },
  };
}

export function workflowRecordingSidecar(
  saved: WorkflowRecordingSavedPlaybook,
  confirmed: NonNullable<WorkflowRecordingState["review"]>["confirmed"],
  capture: WorkflowRecordingCapture | undefined,
  thread: WorkflowRecordingThreadReference,
): Record<string, unknown> {
  return {
    kind: "ambient-workflow-sidecar",
    schemaVersion: 1,
    id: saved.id,
    title: saved.title,
    version: saved.version,
    enabled: saved.enabled,
    savedAt: saved.savedAt,
    updatedAt: saved.updatedAt ?? saved.savedAt,
    ...(saved.archivedAt ? { archivedAt: saved.archivedAt } : {}),
    ...(saved.archivedReason ? { archivedReason: saved.archivedReason } : {}),
    threadId: thread.id,
    files: {
      manifest: "ambient-workflow.json",
      markdown: "workflow.md",
      sidecar: "workflow.json",
      transcript: "transcript.jsonl",
      invocation: "workflow-invocation.json",
      diagnosticsTrace: "diagnostics/full-trace.jsonl",
    },
    callableWorkflow: workflowRecordingCallableInvocation(saved, confirmed, capture, thread),
    playbook: confirmed,
    evidenceSummary: capture
      ? {
          messageCount: capture.messageCount,
          userMessageCount: capture.userMessageCount,
          assistantMessageCount: capture.assistantMessageCount,
          toolResultCount: capture.toolResultCount,
          successfulToolResultCount: capture.successfulToolResultCount,
          failedToolResultCount: capture.failedToolResultCount,
          skippedToolResultCount: capture.skippedToolResultCount,
          permissionBlockedToolResultCount: capture.permissionBlockedToolResultCount,
          userCorrectedEventCount: capture.userCorrectedEventCount,
          redactionCount: capture.redactionCount,
          capturedAt: capture.capturedAt,
        }
      : undefined,
  };
}

export function workflowRecordingMarkdown(
  saved: WorkflowRecordingSavedPlaybook,
  confirmed: NonNullable<WorkflowRecordingState["review"]>["confirmed"],
  capture: WorkflowRecordingCapture | undefined,
  thread: WorkflowRecordingThreadReference,
): string {
  const toolExamples = confirmed?.successfulExamples.map((example) => {
    const detail = [example.inputPreview, example.resultPreview, example.artifactPath ? `artifact: ${example.artifactPath}` : undefined]
      .filter(Boolean)
      .join(" | ");
    return `- \`${example.toolName}\`${detail ? `: ${detail}` : ""}`;
  });
  const doNot = confirmed?.doNot.map((pattern) => {
    const tool = pattern.toolName ? ` \`${pattern.toolName}\`` : "";
    return `- ${pattern.status}${tool}: ${pattern.reason}`;
  });
  return [
    `# ${saved.title}`,
    "",
    "## Intent",
    "",
    confirmed?.intent ?? "No confirmed intent.",
    "",
    "## Inputs",
    "",
    workflowRecordingMarkdownList(confirmed?.inputs),
    "",
    "## Successful tool examples",
    "",
    workflowRecordingMarkdownList(toolExamples),
    "",
    "## Do Not",
    "",
    workflowRecordingMarkdownList(doNot),
    "",
    "## Validation",
    "",
    workflowRecordingMarkdownList(confirmed?.validation),
    "",
    "## Output shape",
    "",
    workflowRecordingMarkdownList(confirmed?.outputShape),
    "",
    "## Callable invocation",
    "",
    "- Default invocation: compact callable workflow.",
    "- Invocation artifact: workflow-invocation.json.",
    "- Full trace diagnostics artifact: diagnostics/full-trace.jsonl.",
    "- Recorder policy: compact invocation by default; full internal traces are diagnostics artifacts.",
    "",
    "## Provenance",
    "",
    `- Workflow id: ${saved.id}`,
    `- Version: ${saved.version}`,
    `- Saved at: ${saved.savedAt}`,
    `- Source thread: ${thread.title} (${thread.id})`,
    `- Captured messages: ${capture?.messageCount ?? confirmed?.evidenceSummary.messageCount ?? 0}`,
    `- Successful tool results: ${capture?.successfulToolResultCount ?? confirmed?.evidenceSummary.successfulToolResultCount ?? 0}`,
    `- Failed tool results: ${capture?.failedToolResultCount ?? confirmed?.evidenceSummary.failedToolResultCount ?? 0}`,
    `- Redactions: ${capture?.redactionCount ?? confirmed?.evidenceSummary.redactionCount ?? 0}`,
    "",
  ].join("\n");
}

export function workflowRecordingMarkdownList(items: string[] | undefined): string {
  return items?.length ? items.map((item) => (item.startsWith("- ") ? item : `- ${item}`)).join("\n") : "- None recorded.";
}

export function workflowRecordingTranscriptJsonl(capture: WorkflowRecordingCapture | undefined): string {
  const events = capture?.events ?? [];
  return events.length ? `${events.map((event) => JSON.stringify(event)).join("\n")}\n` : "";
}

export function workflowRecordingCallableInvocationPath(saved: Pick<WorkflowRecordingSavedPlaybook, "rootPath">): string {
  return join(saved.rootPath, "workflow-invocation.json");
}

export function workflowRecordingDiagnosticsTracePath(saved: Pick<WorkflowRecordingSavedPlaybook, "rootPath">): string {
  return join(saved.rootPath, "diagnostics", "full-trace.jsonl");
}

export function workflowRecordingCallableInvocation(
  saved: Pick<WorkflowRecordingSavedPlaybook, "id" | "title" | "version" | "enabled" | "savedAt" | "updatedAt" | "archivedAt" | "archivedReason">,
  confirmed: NonNullable<WorkflowRecordingState["review"]>["confirmed"],
  capture: WorkflowRecordingCapture | undefined,
  thread: WorkflowRecordingThreadReference,
): Record<string, unknown> {
  const inputs = confirmed?.inputs ?? [];
  const toolNames = uniqueStrings((confirmed?.successfulExamples ?? []).map((example) => example.toolName));
  return {
    schemaVersion: WORKFLOW_RECORDING_CALLABLE_INVOCATION_SCHEMA_VERSION,
    mode: "compact_callable_invocation",
    source: "workflow_recorder",
    workflowId: saved.id,
    workflowVersion: saved.version,
    title: saved.title,
    enabled: saved.enabled,
    savedAt: saved.savedAt,
    ...(saved.updatedAt ? { updatedAt: saved.updatedAt } : {}),
    ...(saved.archivedAt ? { archivedAt: saved.archivedAt } : {}),
    ...(saved.archivedReason ? { archivedReason: saved.archivedReason } : {}),
    thread: {
      id: thread.id,
      title: thread.title,
    },
    input: {
      goal: confirmed?.intent ?? saved.title,
      blocking: false,
      ...Object.fromEntries(inputs.slice(0, 8).map((value, index) => [`input_${index + 1}`, value])),
    },
    inputSchemaHints: {
      required: ["goal"],
      properties: {
        goal: "Concrete goal for this recorded playbook invocation.",
        blocking: "Whether parent final synthesis must wait for this workflow run.",
        ...Object.fromEntries(inputs.slice(0, 8).map((value, index) => [`input_${index + 1}`, truncateText(value, 240)])),
      },
    },
    playbook: confirmed
      ? {
          status: confirmed.status,
          source: confirmed.source,
          generatedAt: confirmed.generatedAt,
          ...(confirmed.confirmedAt ? { confirmedAt: confirmed.confirmedAt } : {}),
          sourceCapturedAt: confirmed.sourceCapturedAt,
          intent: confirmed.intent,
          inputs: confirmed.inputs,
          validation: confirmed.validation,
          outputShape: confirmed.outputShape,
          successfulToolNames: toolNames,
          doNotCount: confirmed.doNot.length,
          evidenceSummary: confirmed.evidenceSummary,
        }
      : undefined,
    captureSummary: capture
      ? {
          capturedAt: capture.capturedAt,
          messageCount: capture.messageCount,
          toolResultCount: capture.toolResultCount,
          successfulToolResultCount: capture.successfulToolResultCount,
          failedToolResultCount: capture.failedToolResultCount,
          skippedToolResultCount: capture.skippedToolResultCount ?? 0,
          permissionBlockedToolResultCount: capture.permissionBlockedToolResultCount ?? 0,
          redactionCount: capture.redactionCount ?? 0,
        }
      : undefined,
    callableWorkflow: workflowRecordingCallablePolicy(),
  };
}

function workflowRecordingCallablePolicy(): Record<string, unknown> {
  return {
    defaultInvocation: "compact",
    invocation: "./workflow-invocation.json",
    diagnosticsTrace: "./diagnostics/full-trace.jsonl",
    recorderCompactInvocationByDefault: true,
    fullTraceArtifact: true,
  };
}

export function workflowRecordingWritePlaybookPackage(
  savedPlaybook: WorkflowRecordingSavedPlaybook,
  confirmed: NonNullable<WorkflowRecordingState["review"]>["confirmed"],
  capture: WorkflowRecordingCapture | undefined,
  thread: WorkflowRecordingThreadReference,
  transcriptOverride?: string,
): void {
  const manifest = `${JSON.stringify(workflowRecordingManifest(savedPlaybook, thread), null, 2)}\n`;
  const markdown = workflowRecordingMarkdown(savedPlaybook, confirmed, capture, thread);
  const sidecar = `${JSON.stringify(workflowRecordingSidecar(savedPlaybook, confirmed, capture, thread), null, 2)}\n`;
  const transcript = transcriptOverride ?? workflowRecordingTranscriptJsonl(capture);
  workflowRecordingWritePlaybookFiles(savedPlaybook, manifest, markdown, sidecar, transcript);
  workflowRecordingWriteCallableInvocationArtifacts(savedPlaybook, confirmed, capture, thread, transcript);
  const version = workflowRecordingSavedPlaybookVersion(savedPlaybook);
  workflowRecordingWritePlaybookFiles(version, manifest, markdown, sidecar, transcript);
  workflowRecordingWriteCallableInvocationArtifacts(version, confirmed, capture, thread, transcript);
}

export function workflowRecordingWritePlaybookPackageWithIndex(input: {
  savedPlaybook: WorkflowRecordingSavedPlaybook;
  confirmed: NonNullable<WorkflowRecordingState["review"]>["confirmed"];
  capture: WorkflowRecordingCapture | undefined;
  thread: WorkflowRecordingThreadReference;
  transcriptOverride?: string;
}): void {
  const { savedPlaybook, confirmed, capture, thread, transcriptOverride } = input;
  workflowRecordingWritePlaybookPackage(savedPlaybook, confirmed, capture, thread, transcriptOverride);
  workflowRecordingWriteIndex(savedPlaybook.indexPath, workflowRecordingIndexWithEntry(savedPlaybook.indexPath, savedPlaybook, thread));
}

export function workflowRecordingWriteEditedPlaybookPackageWithIndex(input: {
  savedPlaybook: WorkflowRecordingSavedPlaybook;
  confirmed: NonNullable<WorkflowRecordingState["review"]>["confirmed"];
  sourceTranscriptPath: string;
  thread: WorkflowRecordingThreadReference;
}): void {
  workflowRecordingWritePlaybookPackageWithIndex({
    savedPlaybook: input.savedPlaybook,
    confirmed: input.confirmed,
    capture: undefined,
    thread: input.thread,
    transcriptOverride: workflowRecordingReadText(input.sourceTranscriptPath),
  });
}

export function workflowRecordingWritePlaybookFiles(
  savedPlaybook: Pick<WorkflowRecordingSavedPlaybook, "rootPath" | "manifestPath" | "markdownPath" | "sidecarPath" | "transcriptPath">,
  manifest: string,
  markdown: string,
  sidecar: string,
  transcript: string,
): void {
  mkdirSync(savedPlaybook.rootPath, { recursive: true });
  writeFileSync(savedPlaybook.manifestPath, manifest, "utf8");
  writeFileSync(savedPlaybook.markdownPath, markdown, "utf8");
  writeFileSync(savedPlaybook.sidecarPath, sidecar, "utf8");
  writeFileSync(savedPlaybook.transcriptPath, transcript, "utf8");
}

function workflowRecordingWriteCallableInvocationArtifacts(
  savedPlaybook: WorkflowRecordingSavedPlaybook,
  confirmed: NonNullable<WorkflowRecordingState["review"]>["confirmed"],
  capture: WorkflowRecordingCapture | undefined,
  thread: WorkflowRecordingThreadReference,
  diagnosticsTraceJsonl: string,
): void {
  const invocationPath = workflowRecordingCallableInvocationPath(savedPlaybook);
  const diagnosticsTracePath = workflowRecordingDiagnosticsTracePath(savedPlaybook);
  mkdirSync(dirname(invocationPath), { recursive: true });
  mkdirSync(dirname(diagnosticsTracePath), { recursive: true });
  writeFileSync(
    invocationPath,
    `${JSON.stringify(workflowRecordingCallableInvocation(savedPlaybook, confirmed, capture, thread), null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    diagnosticsTracePath,
    `${JSON.stringify({
      schemaVersion: WORKFLOW_RECORDING_DIAGNOSTICS_TRACE_SCHEMA_VERSION,
      source: "workflow_recorder",
      workflowId: savedPlaybook.id,
      workflowVersion: savedPlaybook.version,
    })}\n${diagnosticsTraceJsonl}`,
    "utf8",
  );
}

export interface WorkflowRecordingRestorableVersionSource {
  playbook: WorkflowRecordingPlaybookDraft;
  sourceSidecarRecord: Record<string, unknown>;
  sourceMarkdown: string;
  transcript: string;
}

export function workflowRecordingReadRestorableVersionSource(
  id: string,
  sourceVersion: WorkflowRecordingLibraryVersion,
): WorkflowRecordingRestorableVersionSource {
  const sourceSidecar = workflowRecordingReadJson(sourceVersion.sidecarPath);
  if (!sourceSidecar || typeof sourceSidecar !== "object" || Array.isArray(sourceSidecar)) {
    throw new Error(`Workflow recording version has no readable sidecar: ${id} v${sourceVersion.version}`);
  }
  const sourceSidecarRecord = sourceSidecar as Record<string, unknown>;
  const playbook = sourceSidecarRecord.playbook as WorkflowRecordingPlaybookDraft | undefined;
  if (!playbook || typeof playbook !== "object" || Array.isArray(playbook)) {
    throw new Error(`Workflow recording version has no playbook: ${id} v${sourceVersion.version}`);
  }
  return {
    playbook,
    sourceSidecarRecord,
    sourceMarkdown: workflowRecordingReadText(sourceVersion.markdownPath),
    transcript: workflowRecordingReadText(sourceVersion.transcriptPath),
  };
}

export function workflowRecordingWriteRestoredPlaybookPackage(input: {
  savedPlaybook: WorkflowRecordingSavedPlaybook;
  playbook: WorkflowRecordingPlaybookDraft;
  sourceSidecarRecord: Record<string, unknown>;
  sourceMarkdown: string;
  transcript: string;
  thread: WorkflowRecordingThreadReference;
  restoredFromVersion: number;
}): void {
  const { savedPlaybook, playbook, sourceSidecarRecord, sourceMarkdown, transcript, thread, restoredFromVersion } = input;
  const manifest = `${JSON.stringify(workflowRecordingManifest(savedPlaybook, thread), null, 2)}\n`;
  const restoredAt = savedPlaybook.savedAt;
  const markdown = [
    sourceMarkdown.trimEnd() || workflowRecordingMarkdown(savedPlaybook, playbook, undefined, thread).trimEnd(),
    "",
    "## Restore",
    "",
    `- Restored as version: ${savedPlaybook.version}`,
    `- Restored from version: ${restoredFromVersion}`,
    `- Restored at: ${restoredAt}`,
    "",
  ].join("\n");
  const sidecar = `${JSON.stringify(
    {
      ...sourceSidecarRecord,
      id: savedPlaybook.id,
      title: savedPlaybook.title,
      version: savedPlaybook.version,
      enabled: savedPlaybook.enabled,
      savedAt: savedPlaybook.savedAt,
      updatedAt: savedPlaybook.updatedAt ?? savedPlaybook.savedAt,
      ...(savedPlaybook.archivedAt ? { archivedAt: savedPlaybook.archivedAt } : {}),
      ...(savedPlaybook.archivedReason ? { archivedReason: savedPlaybook.archivedReason } : {}),
      threadId: thread.id,
      restoredFromVersion,
      files: {
        ...recordFromUnknown(sourceSidecarRecord.files),
        invocation: "workflow-invocation.json",
        diagnosticsTrace: "diagnostics/full-trace.jsonl",
      },
      callableWorkflow: workflowRecordingCallableInvocation(savedPlaybook, playbook, undefined, thread),
      playbook,
    },
    null,
    2,
  )}\n`;
  workflowRecordingWritePlaybookFiles(savedPlaybook, manifest, markdown, sidecar, transcript);
  workflowRecordingWriteCallableInvocationArtifacts(savedPlaybook, playbook, undefined, thread, transcript);
  const version = workflowRecordingSavedPlaybookVersion(savedPlaybook);
  workflowRecordingWritePlaybookFiles(version, manifest, markdown, sidecar, transcript);
  workflowRecordingWriteCallableInvocationArtifacts(version, playbook, undefined, thread, transcript);
}

export function workflowRecordingWriteRestoredPlaybookPackageWithIndex(input: {
  savedPlaybook: WorkflowRecordingSavedPlaybook;
  playbook: WorkflowRecordingPlaybookDraft;
  sourceSidecarRecord: Record<string, unknown>;
  sourceMarkdown: string;
  transcript: string;
  thread: WorkflowRecordingThreadReference;
  restoredFromVersion: number;
}): void {
  workflowRecordingWriteRestoredPlaybookPackage(input);
  workflowRecordingWriteIndex(
    input.savedPlaybook.indexPath,
    workflowRecordingIndexWithEntry(input.savedPlaybook.indexPath, input.savedPlaybook, input.thread, input.restoredFromVersion),
  );
}

export function workflowRecordingIndexWithEntry(
  indexPath: string,
  saved: WorkflowRecordingSavedPlaybook,
  thread: WorkflowRecordingThreadReference,
  restoredFromVersion?: number,
): Record<string, unknown> {
  const previous = workflowRecordingReadIndex(indexPath);
  const root = dirname(indexPath);
  const previousRecord = previous.workflows.find((workflow) => workflow.id === saved.id);
  const versionRecord = workflowRecordingIndexVersionRecord(saved, indexPath, restoredFromVersion);
  const entry = {
    id: saved.id,
    title: saved.title,
    version: saved.version,
    enabled: saved.enabled,
    savedAt: saved.savedAt,
    updatedAt: saved.updatedAt ?? saved.savedAt,
    ...(saved.archivedAt ? { archivedAt: saved.archivedAt } : {}),
    ...(saved.archivedReason ? { archivedReason: saved.archivedReason } : {}),
    threadId: thread.id,
    manifestPath: relative(root, saved.manifestPath),
    markdownPath: relative(root, saved.markdownPath),
    sidecarPath: relative(root, saved.sidecarPath),
    transcriptPath: relative(root, saved.transcriptPath),
    versions: [
      versionRecord,
      ...(previousRecord?.versions ?? []).filter((version) => version.version !== saved.version),
    ].sort((left, right) => right.version - left.version),
  };
  const workflows = [
    entry,
    ...previous.workflows.filter((workflow) => workflow.id !== saved.id),
  ].sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  return {
    kind: "ambient-workflow-index",
    schemaVersion: 1,
    updatedAt: saved.savedAt,
    workflows,
  };
}

export function workflowRecordingWriteIndex(indexPath: string, index: Record<string, unknown>): void {
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

export function workflowRecordingWriteIndexRecords(
  indexPath: string,
  workflows: WorkflowRecordingIndexRecord[],
  updatedAt: string,
): void {
  workflowRecordingWriteIndex(indexPath, {
    kind: "ambient-workflow-index",
    schemaVersion: 1,
    updatedAt,
    workflows,
  });
}

export interface WorkflowRecordingIndexVersionRecord {
  version: number;
  title: string;
  savedAt: string;
  manifestPath: string;
  markdownPath: string;
  sidecarPath: string;
  transcriptPath: string;
  restoredFromVersion?: number;
}

export interface WorkflowRecordingIndexRecord {
  id: string;
  title: string;
  version: number;
  enabled: boolean;
  savedAt: string;
  updatedAt?: string;
  archivedAt?: string;
  archivedReason?: string;
  threadId?: string;
  manifestPath: string;
  markdownPath: string;
  sidecarPath: string;
  transcriptPath: string;
  versions: WorkflowRecordingIndexVersionRecord[];
}

export interface WorkflowRecordingLibraryIndex {
  indexPath: string;
  index: { workflows: WorkflowRecordingIndexRecord[] };
}

export interface WorkflowRecordingLibraryRecordMatch {
  indexPath: string;
  index: { workflows: WorkflowRecordingIndexRecord[] };
  record: WorkflowRecordingIndexRecord;
  entry: WorkflowRecordingLibraryEntry;
}

export interface WorkflowRecordingLifecyclePatch {
  enabled?: boolean;
  updatedAt?: string;
  archivedAt?: string;
  archivedReason?: string;
  clearArchived?: boolean;
}

export type WorkflowRecordingVersionGuardAction = "edit" | "archive" | "unarchive";

export function workflowRecordingAssertBaseVersion(input: {
  record: Pick<WorkflowRecordingIndexRecord, "version">;
  baseVersion: number;
  action: WorkflowRecordingVersionGuardAction;
}): void {
  if (input.record.version === input.baseVersion) return;
  const retryLabel: Record<WorkflowRecordingVersionGuardAction, string> = {
    edit: "the edit",
    archive: "archive",
    unarchive: "unarchive",
  };
  throw new Error(
    `Workflow recording version changed: expected v${input.baseVersion}, current v${input.record.version}. Describe the workflow again and retry ${retryLabel[input.action]}.`,
  );
}

export function workflowRecordingArchiveLifecyclePatch(
  record: Pick<WorkflowRecordingIndexRecord, "archivedAt" | "archivedReason">,
  input: { updatedAt: string; reason?: string },
): WorkflowRecordingLifecyclePatch & { updatedAt: string; archivedAt: string; archivedReason: string } {
  return {
    updatedAt: input.updatedAt,
    archivedAt: record.archivedAt ?? input.updatedAt,
    archivedReason: input.reason?.trim() || record.archivedReason || "Archived by user request.",
  };
}

export function workflowRecordingUnarchiveLifecyclePatch(
  updatedAt: string,
): WorkflowRecordingLifecyclePatch & { updatedAt: string; clearArchived: true } {
  return {
    updatedAt,
    clearArchived: true,
  };
}

export function workflowRecordingLibraryIndexPaths(input: {
  workspacePaths: readonly (string | null | undefined)[];
  workflowRecordingJsonValues?: readonly (string | null | undefined)[];
}): string[] {
  const indexPaths = new Set<string>();
  const workspacePaths = new Set<string>();
  for (const workspacePath of input.workspacePaths) {
    if (typeof workspacePath === "string" && workspacePath.trim()) workspacePaths.add(workspacePath);
  }
  for (const workspacePath of workspacePaths) indexPaths.add(workflowRecordingLibraryIndexPath(workspacePath));
  for (const value of input.workflowRecordingJsonValues ?? []) {
    if (typeof value !== "string") continue;
    try {
      const recording = JSON.parse(value) as WorkflowRecordingState;
      const indexPath = recording.review?.savedPlaybook?.indexPath;
      if (typeof indexPath === "string" && indexPath.trim()) indexPaths.add(indexPath);
    } catch {
      // Ignore stale or partially written thread recording state.
    }
  }
  return Array.from(indexPaths);
}

export function workflowRecordingReadLibraryIndexes(indexPaths: readonly string[]): WorkflowRecordingLibraryIndex[] {
  return indexPaths.map((indexPath) => ({
    indexPath,
    index: workflowRecordingReadIndex(indexPath),
  }));
}

export function workflowRecordingApplySavedPlaybookLifecycle(
  recording: WorkflowRecordingState | undefined,
  workflowId: string,
  patch: WorkflowRecordingLifecyclePatch,
): WorkflowRecordingState | undefined {
  const savedPlaybook = recording?.review?.savedPlaybook;
  if (!recording?.review || savedPlaybook?.id !== workflowId) return undefined;
  const nextSavedPlaybook: WorkflowRecordingSavedPlaybook = {
    ...savedPlaybook,
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.updatedAt ? { updatedAt: patch.updatedAt } : {}),
    ...(patch.archivedAt ? { archivedAt: patch.archivedAt } : {}),
    ...(patch.archivedReason ? { archivedReason: patch.archivedReason } : {}),
  };
  if (patch.clearArchived) {
    delete nextSavedPlaybook.archivedAt;
    delete nextSavedPlaybook.archivedReason;
  }
  return {
    ...recording,
    review: {
      ...recording.review,
      savedPlaybook: nextSavedPlaybook,
    },
  };
}

export function workflowRecordingApplyRestoredPlaybookState(
  recording: WorkflowRecordingState | undefined,
  savedPlaybook: WorkflowRecordingSavedPlaybook,
  playbook: WorkflowRecordingPlaybookDraft,
): WorkflowRecordingState | undefined {
  if (!recording?.review) return undefined;
  return {
    ...recording,
    review: {
      ...recording.review,
      confirmed: {
        ...playbook,
        status: "confirmed",
      },
      savedPlaybook,
    },
  };
}

export function workflowRecordingListLibraryEntries(
  indexes: WorkflowRecordingLibraryIndex[],
  input: SearchWorkflowRecordingsInput = {},
): WorkflowRecordingLibraryEntry[] {
  const query = input.query?.trim() ?? "";
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const entriesById = new Map<string, WorkflowRecordingLibraryEntry>();
  for (const { indexPath, index } of indexes) {
    for (const record of index.workflows) {
      if (!input.includeArchived && record.archivedAt) continue;
      if (!input.includeDisabled && !record.enabled) continue;
      const entry = workflowRecordingLibraryEntry(indexPath, record);
      const existing = entriesById.get(entry.id);
      if (
        !existing ||
        entry.version > existing.version ||
        (entry.version === existing.version && entry.savedAt.localeCompare(existing.savedAt) > 0)
      ) {
        entriesById.set(entry.id, entry);
      }
    }
  }
  const entries = Array.from(entriesById.values());
  const matchedEntries = query
    ? entries
        .map((entry) => ({ ...entry, score: workflowRecordingSearchScore(entry, query) }))
        .filter((entry) => (entry.score ?? 0) > 0)
        .sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || right.savedAt.localeCompare(left.savedAt))
    : entries.sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  return matchedEntries.slice(0, limit);
}

export function workflowRecordingFindLibraryEntry(
  indexes: WorkflowRecordingLibraryIndex[],
  id: string,
  input: Pick<SearchWorkflowRecordingsInput, "includeDisabled" | "includeArchived"> = {},
): WorkflowRecordingLibraryEntry | undefined {
  return workflowRecordingFindLibraryRecord(indexes, id, input)?.entry;
}

export function workflowRecordingRequireLibraryEntry(
  indexes: WorkflowRecordingLibraryIndex[],
  id: string,
  input: Pick<SearchWorkflowRecordingsInput, "includeDisabled" | "includeArchived"> = {},
): WorkflowRecordingLibraryEntry {
  const entry = workflowRecordingFindLibraryEntry(indexes, id, input);
  if (!entry) throw new Error(`Workflow recording not found: ${id}`);
  return entry;
}

export function workflowRecordingFindLibraryRecord(
  indexes: WorkflowRecordingLibraryIndex[],
  id: string,
  input: Pick<SearchWorkflowRecordingsInput, "includeDisabled" | "includeArchived"> = {},
): WorkflowRecordingLibraryRecordMatch | undefined {
  for (const { indexPath, index } of indexes) {
    const record = index.workflows.find((workflow) => workflow.id === id);
    if (!record || (!input.includeDisabled && !record.enabled) || (!input.includeArchived && record.archivedAt)) continue;
    return {
      indexPath,
      index,
      record,
      entry: workflowRecordingLibraryEntry(indexPath, record),
    };
  }
  return undefined;
}

export function workflowRecordingRequireLibraryRecord(
  indexes: WorkflowRecordingLibraryIndex[],
  id: string,
  input: Pick<SearchWorkflowRecordingsInput, "includeDisabled" | "includeArchived"> = {},
): WorkflowRecordingLibraryRecordMatch {
  const found = workflowRecordingFindLibraryRecord(indexes, id, input);
  if (!found) throw new Error(`Workflow recording not found: ${id}`);
  return found;
}

export function workflowRecordingApplyLibraryLifecycleUpdate(
  match: WorkflowRecordingLibraryRecordMatch,
  patch: WorkflowRecordingLifecyclePatch & { updatedAt: string },
): WorkflowRecordingLibraryEntry {
  const nextRecord: WorkflowRecordingIndexRecord = {
    ...match.record,
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.updatedAt ? { updatedAt: patch.updatedAt } : {}),
    ...(patch.archivedAt ? { archivedAt: patch.archivedAt } : {}),
    ...(patch.archivedReason ? { archivedReason: patch.archivedReason } : {}),
  };
  if (patch.clearArchived) {
    delete nextRecord.archivedAt;
    delete nextRecord.archivedReason;
  }
  const entry = workflowRecordingLibraryEntry(match.indexPath, nextRecord);
  workflowRecordingWriteIndexRecords(
    match.indexPath,
    match.index.workflows.map((workflow) =>
      workflow.id === match.record.id ? workflowRecordingIndexRecordFromEntry(entry, match.indexPath) : workflow,
    ),
    patch.updatedAt,
  );
  workflowRecordingWriteLifecycleJson(entry.manifestPath, patch);
  workflowRecordingWriteLifecycleJson(entry.sidecarPath, patch);
  return entry;
}

export function workflowRecordingReadIndex(indexPath: string): { workflows: WorkflowRecordingIndexRecord[] } {
  try {
    const parsed = JSON.parse(readFileSync(indexPath, "utf8")) as { workflows?: unknown };
    if (!Array.isArray(parsed.workflows)) return { workflows: [] };
    return {
      workflows: parsed.workflows.flatMap((workflow): WorkflowRecordingIndexRecord[] => {
        if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) return [];
        const record = workflow as Record<string, unknown>;
        if (
          typeof record.id === "string" &&
          typeof record.title === "string" &&
          typeof record.version === "number" &&
          typeof record.enabled === "boolean" &&
          typeof record.savedAt === "string" &&
          typeof record.manifestPath === "string" &&
          typeof record.markdownPath === "string" &&
          typeof record.sidecarPath === "string" &&
          typeof record.transcriptPath === "string"
        ) {
          return [
            {
              id: record.id,
              title: record.title,
              version: record.version,
              enabled: record.enabled,
              savedAt: record.savedAt,
              ...(typeof record.updatedAt === "string" ? { updatedAt: record.updatedAt } : {}),
              ...(typeof record.archivedAt === "string" ? { archivedAt: record.archivedAt } : {}),
              ...(typeof record.archivedReason === "string" ? { archivedReason: record.archivedReason } : {}),
              ...(typeof record.threadId === "string" ? { threadId: record.threadId } : {}),
              manifestPath: record.manifestPath,
              markdownPath: record.markdownPath,
              sidecarPath: record.sidecarPath,
              transcriptPath: record.transcriptPath,
              versions: workflowRecordingReadIndexVersions(record.versions),
            },
          ];
        }
        return [];
      }),
    };
  } catch {
    return { workflows: [] };
  }
}

function workflowRecordingReadIndexVersions(rawVersions: unknown): WorkflowRecordingIndexVersionRecord[] {
  if (!Array.isArray(rawVersions)) return [];
  return rawVersions.flatMap((version): WorkflowRecordingIndexVersionRecord[] => {
    if (!version || typeof version !== "object" || Array.isArray(version)) return [];
    const record = version as Record<string, unknown>;
    if (
      typeof record.version === "number" &&
      typeof record.title === "string" &&
      typeof record.savedAt === "string" &&
      typeof record.manifestPath === "string" &&
      typeof record.markdownPath === "string" &&
      typeof record.sidecarPath === "string" &&
      typeof record.transcriptPath === "string"
    ) {
      return [
        {
          version: record.version,
          title: record.title,
          savedAt: record.savedAt,
          manifestPath: record.manifestPath,
          markdownPath: record.markdownPath,
          sidecarPath: record.sidecarPath,
          transcriptPath: record.transcriptPath,
          ...(typeof record.restoredFromVersion === "number" ? { restoredFromVersion: record.restoredFromVersion } : {}),
        },
      ];
    }
    return [];
  });
}

export function workflowRecordingLibraryIndexPath(workspacePath: string): string {
  return join(workspacePath, ".ambient", "workflows", "index.json");
}

function workflowRecordingVersionRootPath(rootPath: string, version: number): string {
  return join(rootPath, "versions", `v${version}`);
}

export function workflowRecordingSavedPlaybookVersion(saved: WorkflowRecordingSavedPlaybook): WorkflowRecordingSavedPlaybook {
  const rootPath = workflowRecordingVersionRootPath(saved.rootPath, saved.version);
  return {
    ...saved,
    rootPath,
    manifestPath: join(rootPath, "ambient-workflow.json"),
    markdownPath: join(rootPath, "workflow.md"),
    sidecarPath: join(rootPath, "workflow.json"),
    transcriptPath: join(rootPath, "transcript.jsonl"),
  };
}

function workflowRecordingIndexVersionRecord(
  saved: WorkflowRecordingSavedPlaybook,
  indexPath: string,
  restoredFromVersion?: number,
): WorkflowRecordingIndexVersionRecord {
  const root = dirname(indexPath);
  const versionSaved = workflowRecordingSavedPlaybookVersion(saved);
  return {
    version: saved.version,
    title: saved.title,
    savedAt: saved.savedAt,
    manifestPath: relative(root, versionSaved.manifestPath),
    markdownPath: relative(root, versionSaved.markdownPath),
    sidecarPath: relative(root, versionSaved.sidecarPath),
    transcriptPath: relative(root, versionSaved.transcriptPath),
    ...(typeof restoredFromVersion === "number" ? { restoredFromVersion } : {}),
  };
}

function workflowRecordingLibraryVersion(indexPath: string, record: WorkflowRecordingIndexVersionRecord): WorkflowRecordingLibraryVersion {
  const root = dirname(indexPath);
  return {
    version: record.version,
    title: record.title,
    savedAt: record.savedAt,
    manifestPath: workflowRecordingResolveIndexPath(root, record.manifestPath),
    markdownPath: workflowRecordingResolveIndexPath(root, record.markdownPath),
    sidecarPath: workflowRecordingResolveIndexPath(root, record.sidecarPath),
    transcriptPath: workflowRecordingResolveIndexPath(root, record.transcriptPath),
    ...(typeof record.restoredFromVersion === "number" ? { restoredFromVersion: record.restoredFromVersion } : {}),
  };
}

export function workflowRecordingLibraryEntry(indexPath: string, record: WorkflowRecordingIndexRecord): WorkflowRecordingLibraryEntry {
  const root = dirname(indexPath);
  const manifestPath = workflowRecordingResolveIndexPath(root, record.manifestPath);
  const markdownPath = workflowRecordingResolveIndexPath(root, record.markdownPath);
  const sidecarPath = workflowRecordingResolveIndexPath(root, record.sidecarPath);
  const transcriptPath = workflowRecordingResolveIndexPath(root, record.transcriptPath);
  const sidecar = workflowRecordingReadJson(sidecarPath) as { playbook?: WorkflowRecordingPlaybookDraft } | undefined;
  const playbook = sidecar?.playbook;
  const toolNames = Array.from(new Set((playbook?.successfulExamples ?? []).map((example) => example.toolName).filter(Boolean))).sort();
  return {
    id: record.id,
    title: record.title,
    version: record.version,
    enabled: record.enabled,
    savedAt: record.savedAt,
    ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
    ...(record.archivedAt ? { archivedAt: record.archivedAt } : {}),
    ...(record.archivedReason ? { archivedReason: record.archivedReason } : {}),
    ...(record.threadId ? { threadId: record.threadId } : {}),
    manifestPath,
    markdownPath,
    sidecarPath,
    transcriptPath,
    summary: playbook?.intent ?? record.title,
    toolNames,
    outputShape: playbook?.outputShape ?? [],
    versions: workflowRecordingLibraryVersions(indexPath, record),
  };
}

export function workflowRecordingLibraryVersions(indexPath: string, record: WorkflowRecordingIndexRecord): WorkflowRecordingLibraryVersion[] {
  const records = record.versions.length
    ? record.versions
    : [
        {
          version: record.version,
          title: record.title,
          savedAt: record.savedAt,
          manifestPath: record.manifestPath,
          markdownPath: record.markdownPath,
          sidecarPath: record.sidecarPath,
          transcriptPath: record.transcriptPath,
        },
      ];
  return records.map((version) => workflowRecordingLibraryVersion(indexPath, version)).sort((left, right) => right.version - left.version);
}

export function workflowRecordingRequireLibraryVersion(
  id: string,
  versions: readonly WorkflowRecordingLibraryVersion[],
  version: number,
): WorkflowRecordingLibraryVersion {
  const found = versions.find((candidate) => candidate.version === version);
  if (!found) throw new Error(`Workflow recording version not found: ${id} v${version}`);
  return found;
}

function workflowRecordingResolveIndexPath(root: string, storedPath: string): string {
  return isAbsolute(storedPath) ? storedPath : join(root, storedPath);
}

export function workflowRecordingLibraryDescription(entry: WorkflowRecordingLibraryEntry): WorkflowRecordingLibraryDescription {
  const sidecar = workflowRecordingReadJson(entry.sidecarPath) as { playbook?: WorkflowRecordingPlaybookDraft } | undefined;
  const sidecarRecord = recordFromUnknown(sidecar);
  const sidecarFiles = recordFromUnknown(sidecarRecord.files);
  const callableInvocationPath = workflowRecordingResolvePackageArtifactPath(
    entry,
    sidecarFiles.invocation,
    "workflow-invocation.json",
  );
  const diagnosticsTracePath = workflowRecordingResolvePackageArtifactPath(
    entry,
    sidecarFiles.diagnosticsTrace,
    join("diagnostics", "full-trace.jsonl"),
  );
  const callableInvocation =
    workflowRecordingCallableInvocationSummaryFromUnknown(workflowRecordingReadJson(callableInvocationPath)) ??
    workflowRecordingCallableInvocationSummaryFromUnknown(sidecarRecord.callableWorkflow);
  const manifest = workflowRecordingReadJson(entry.manifestPath) as Record<string, unknown> | undefined;
  const markdown = workflowRecordingReadText(entry.markdownPath);
  return {
    ...entry,
    markdownPreview: markdown.length > 4000 ? `${markdown.slice(0, 3997).trimEnd()}...` : markdown,
    ...(sidecar?.playbook ? { playbook: sidecar.playbook } : {}),
    ...(manifest ? { manifest } : {}),
    ...(callableInvocation ? { callableInvocation, callableInvocationPath, diagnosticsTracePath } : {}),
  };
}

function workflowRecordingResolvePackageArtifactPath(
  entry: Pick<WorkflowRecordingLibraryEntry, "sidecarPath">,
  storedPath: unknown,
  fallback: string,
): string {
  const packageRoot = dirname(entry.sidecarPath);
  const value = typeof storedPath === "string" && storedPath.trim() ? storedPath.trim() : fallback;
  const normalized = isAbsolute(value) ? fallback : value.replace(/^\.\//, "");
  const resolved = join(packageRoot, normalized);
  const packageRelative = relative(packageRoot, resolved);
  return packageRelative.startsWith("..") || isAbsolute(packageRelative) ? join(packageRoot, fallback) : resolved;
}

function workflowRecordingCallableInvocationSummaryFromUnknown(
  value: unknown,
): WorkflowRecordingCallableInvocationSummary | undefined {
  const record = recordFromUnknown(value);
  if (
    record.schemaVersion !== WORKFLOW_RECORDING_CALLABLE_INVOCATION_SCHEMA_VERSION ||
    record.mode !== "compact_callable_invocation" ||
    record.source !== "workflow_recorder" ||
    typeof record.workflowId !== "string" ||
    typeof record.workflowVersion !== "number" ||
    typeof record.title !== "string" ||
    typeof record.savedAt !== "string"
  ) {
    return undefined;
  }
  const callableWorkflow = workflowRecordingCallableWorkflowPolicyFromUnknown(record.callableWorkflow);
  if (!callableWorkflow) return undefined;
  return {
    schemaVersion: WORKFLOW_RECORDING_CALLABLE_INVOCATION_SCHEMA_VERSION,
    mode: "compact_callable_invocation",
    source: "workflow_recorder",
    workflowId: record.workflowId,
    workflowVersion: record.workflowVersion,
    title: record.title,
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    savedAt: record.savedAt,
    ...(typeof record.updatedAt === "string" ? { updatedAt: record.updatedAt } : {}),
    ...(typeof record.archivedAt === "string" ? { archivedAt: record.archivedAt } : {}),
    ...(typeof record.archivedReason === "string" ? { archivedReason: record.archivedReason } : {}),
    ...workflowRecordingCallableThreadFromUnknown(record.thread),
    input: recordFromUnknown(record.input),
    ...workflowRecordingInputSchemaHintsFromUnknown(record.inputSchemaHints),
    ...workflowRecordingCallablePlaybookFromUnknown(record.playbook),
    ...workflowRecordingCaptureSummaryFromUnknown(record.captureSummary),
    callableWorkflow,
  };
}

function workflowRecordingCallableWorkflowPolicyFromUnknown(
  value: unknown,
): WorkflowRecordingCallableInvocationSummary["callableWorkflow"] | undefined {
  const record = recordFromUnknown(value);
  if (
    typeof record.defaultInvocation !== "string" ||
    typeof record.invocation !== "string" ||
    typeof record.diagnosticsTrace !== "string"
  ) {
    return undefined;
  }
  return {
    defaultInvocation: record.defaultInvocation,
    invocation: record.invocation,
    diagnosticsTrace: record.diagnosticsTrace,
    recorderCompactInvocationByDefault: record.recorderCompactInvocationByDefault === true,
    fullTraceArtifact: record.fullTraceArtifact === true,
  };
}

function workflowRecordingCallableThreadFromUnknown(
  value: unknown,
): Pick<WorkflowRecordingCallableInvocationSummary, "thread"> {
  const record = recordFromUnknown(value);
  return typeof record.id === "string" && typeof record.title === "string"
    ? { thread: { id: record.id, title: record.title } }
    : {};
}

function workflowRecordingInputSchemaHintsFromUnknown(
  value: unknown,
): Pick<WorkflowRecordingCallableInvocationSummary, "inputSchemaHints"> {
  const record = recordFromUnknown(value);
  const properties = workflowRecordingStringRecord(record.properties);
  const required = workflowRecordingStringArray(record.required);
  if (!Object.keys(properties).length && !required.length) return {};
  return {
    inputSchemaHints: {
      ...(required.length ? { required } : {}),
      ...(Object.keys(properties).length ? { properties } : {}),
    },
  };
}

function workflowRecordingCallablePlaybookFromUnknown(
  value: unknown,
): Pick<WorkflowRecordingCallableInvocationSummary, "playbook"> {
  const record = recordFromUnknown(value);
  const playbook: NonNullable<WorkflowRecordingCallableInvocationSummary["playbook"]> = {
    ...(typeof record.status === "string" ? { status: record.status as WorkflowRecordingPlaybookDraft["status"] } : {}),
    ...(typeof record.source === "string" ? { source: record.source as WorkflowRecordingPlaybookDraft["source"] } : {}),
    ...(typeof record.intent === "string" ? { intent: record.intent } : {}),
    ...workflowRecordingOptionalStringArray("inputs", record.inputs),
    ...workflowRecordingOptionalStringArray("validation", record.validation),
    ...workflowRecordingOptionalStringArray("outputShape", record.outputShape),
    ...workflowRecordingOptionalStringArray("successfulToolNames", record.successfulToolNames),
    ...(typeof record.doNotCount === "number" ? { doNotCount: record.doNotCount } : {}),
  };
  return Object.keys(playbook).length ? { playbook } : {};
}

function workflowRecordingCaptureSummaryFromUnknown(
  value: unknown,
): Pick<WorkflowRecordingCallableInvocationSummary, "captureSummary"> {
  const record = recordFromUnknown(value);
  const captureSummary: NonNullable<WorkflowRecordingCallableInvocationSummary["captureSummary"]> = {
    ...(typeof record.capturedAt === "string" ? { capturedAt: record.capturedAt } : {}),
    ...workflowRecordingOptionalNumber("messageCount", record.messageCount),
    ...workflowRecordingOptionalNumber("toolResultCount", record.toolResultCount),
    ...workflowRecordingOptionalNumber("successfulToolResultCount", record.successfulToolResultCount),
    ...workflowRecordingOptionalNumber("failedToolResultCount", record.failedToolResultCount),
    ...workflowRecordingOptionalNumber("skippedToolResultCount", record.skippedToolResultCount),
    ...workflowRecordingOptionalNumber("permissionBlockedToolResultCount", record.permissionBlockedToolResultCount),
    ...workflowRecordingOptionalNumber("redactionCount", record.redactionCount),
  };
  return Object.keys(captureSummary).length ? { captureSummary } : {};
}

function workflowRecordingOptionalStringArray(key: string, value: unknown): Record<string, string[]> {
  const array = workflowRecordingStringArray(value);
  return array.length ? { [key]: array } : {};
}

function workflowRecordingOptionalNumber(key: string, value: unknown): Record<string, number> {
  return typeof value === "number" && Number.isFinite(value) ? { [key]: value } : {};
}

function workflowRecordingStringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(recordFromUnknown(value)).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function workflowRecordingStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function workflowRecordingReadJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

export function workflowRecordingReadText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

export function workflowRecordingWriteLifecycleJson(
  path: string,
  patch: WorkflowRecordingLifecyclePatch,
): void {
  const parsed = workflowRecordingReadJson(path);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
  const next: Record<string, unknown> = {
    ...(parsed as Record<string, unknown>),
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.updatedAt ? { updatedAt: patch.updatedAt } : {}),
    ...(patch.archivedAt ? { archivedAt: patch.archivedAt } : {}),
    ...(patch.archivedReason ? { archivedReason: patch.archivedReason } : {}),
  };
  if (patch.clearArchived) {
    delete next.archivedAt;
    delete next.archivedReason;
  }
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export function workflowRecordingSearchScore(entry: WorkflowRecordingLibraryEntry, query: string): number {
  const tokens = query.toLowerCase().split(/[^a-z0-9_.:-]+/).filter(Boolean);
  if (!tokens.length) return 1;
  const description = workflowRecordingLibraryDescription(entry);
  const playbook = description.playbook;
  const haystack = [
    entry.id,
    entry.title,
    entry.summary,
    entry.toolNames.join(" "),
    entry.outputShape.join(" "),
    playbook?.inputs.join(" "),
    playbook?.validation.join(" "),
    playbook?.successfulExamples.map((example) => [example.toolName, example.inputPreview, example.resultPreview].filter(Boolean).join(" ")).join(" "),
    playbook?.doNot.map((pattern) => [pattern.toolName, pattern.status, pattern.reason].filter(Boolean).join(" ")).join(" "),
    description.markdownPreview,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

export function workflowRecordingIndexRecordFromEntry(entry: WorkflowRecordingLibraryEntry, indexPath: string): WorkflowRecordingIndexRecord {
  const root = dirname(indexPath);
  return {
    id: entry.id,
    title: entry.title,
    version: entry.version,
    enabled: entry.enabled,
    savedAt: entry.savedAt,
    ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}),
    ...(entry.archivedAt ? { archivedAt: entry.archivedAt } : {}),
    ...(entry.archivedReason ? { archivedReason: entry.archivedReason } : {}),
    ...(entry.threadId ? { threadId: entry.threadId } : {}),
    manifestPath: relative(root, entry.manifestPath),
    markdownPath: relative(root, entry.markdownPath),
    sidecarPath: relative(root, entry.sidecarPath),
    transcriptPath: relative(root, entry.transcriptPath),
    versions: entry.versions.map((version) => ({
      version: version.version,
      title: version.title,
      savedAt: version.savedAt,
      manifestPath: relative(root, version.manifestPath),
      markdownPath: relative(root, version.markdownPath),
      sidecarPath: relative(root, version.sidecarPath),
      transcriptPath: relative(root, version.transcriptPath),
      ...(typeof version.restoredFromVersion === "number" ? { restoredFromVersion: version.restoredFromVersion } : {}),
    })),
  };
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

function truncateText(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...` : value;
}
