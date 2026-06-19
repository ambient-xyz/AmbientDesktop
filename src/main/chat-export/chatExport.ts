import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import JSZip from "jszip";
import type { SubagentPatternGraphSnapshot } from "../../shared/subagentPatternGraph";
import type { SubagentMailboxEventSummary, SubagentParentMailboxEventSummary, SubagentRunEventSummary, SubagentRunSummary, SubagentToolScopeSnapshotSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { ChatExportSource, ChatMessage, ContextUsageSnapshot, ThreadSummary, ToolExternalModelResponseArtifact, ToolLargeOutputPreviewItem } from "../../shared/threadTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { getRestorablePiSessionFile, isPathInside } from "./chatExportSessionFacade";
import { isSecretKey, REDACTED_SECRET, redactSensitiveText, redactSensitiveTextWithMetadata } from "./chatExportSecurityFacade";
import { compactSubagentToolScopeSnapshot } from "./chatExportSubagentsFacade";

export interface ChatExportDataSource {
  getWorkspace(): WorkspaceState;
  getThread(threadId: string): ThreadSummary;
  listMessages(threadId: string): ChatMessage[];
  getLatestContextUsageSnapshot?(threadId: string): ContextUsageSnapshot | undefined;
  listSubagentRunsForParentThread?(parentThreadId: string): SubagentRunSummary[];
  listSubagentRunEvents?(runId: string): SubagentRunEventSummary[];
  listSubagentMailboxEvents?(runId: string): SubagentMailboxEventSummary[];
  listSubagentParentMailboxEventsForParentThread?(parentThreadId: string): SubagentParentMailboxEventSummary[];
  listSubagentToolScopeSnapshots?(runId: string): SubagentToolScopeSnapshotSummary[];
  listSubagentWaitBarriersForParentRun?(parentRunId: string): SubagentWaitBarrierSummary[];
  listCallableWorkflowTasksForParentThread?(parentThreadId: string): CallableWorkflowTaskSummary[];
}

export interface ChatExportOptions {
  appName: string;
  appVersion: string;
  now?: Date;
  includePiSessionContent?: boolean;
}

export interface ChatExportPayload {
  fileName: string;
  archive: Buffer;
  createdAt: string;
  source: ChatExportSource;
  fallbackReason?: string;
}

interface ChatExportManifest {
  schemaVersion: 1;
  createdAt: string;
  app: {
    name: string;
    version: string;
  };
  workspace: {
    path: string;
    name: string;
    statePath: string;
    sessionPath: string;
  };
  thread: {
    id: string;
    title: string;
    workspacePath: string;
    createdAt: string;
    updatedAt: string;
    permissionMode: ThreadSummary["permissionMode"];
    collaborationMode: ThreadSummary["collaborationMode"];
    model: string;
    thinkingLevel: ThreadSummary["thinkingLevel"];
  };
  export: {
    source: ChatExportSource;
    fallbackReason?: string;
    originalPiSessionFile?: string;
    originalPiSessionFileExists: boolean;
    includedFiles: string[];
    visibleMessageCount: number;
    hiddenMessageCount: number;
    artifactCount: number;
    childThreadCount: number;
    childVisibleMessageCount: number;
    childHiddenMessageCount: number;
    childArtifactCount: number;
    childPiSessionCount: number;
    callableWorkflowTaskCount: number;
    patternGraphCount: number;
    patternGraphLinkedChildCount: number;
    pointInTime: true;
  };
  redaction: {
    applied: true;
    replacementCount: number;
  };
}

interface ChatExportArtifactIndex {
  schemaVersion: 1;
  artifacts: ChatExportArtifact[];
}

export interface ChatExportArtifact {
  kind: "tool-output" | "stdout" | "stderr" | "long-log" | "external-model-response";
  messageId: string;
  toolName?: string;
  toolCallId?: string;
  label: string;
  chars?: number;
  previewChars?: number;
  truncated?: boolean;
  verbatim?: boolean;
  artifactPath?: string;
  artifactBytes?: number;
  model?: string;
  provider?: string;
  usage?: Record<string, unknown>;
}

export interface ChatExportChildThreadBundle {
  dir: string;
  run: SubagentRunSummary;
  thread: ThreadSummary;
  rawMessages: ChatMessage[];
  messages: ChatMessage[];
  artifacts: ChatExportArtifact[];
  runEvents: SubagentRunEventSummary[];
  mailboxEvents: SubagentMailboxEventSummary[];
  toolScopeSnapshots: SubagentToolScopeSnapshotSummary[];
  waitBarriers: SubagentWaitBarrierSummary[];
  piSession: {
    content?: string;
    fallbackReason?: string;
    originalPiSessionFile?: string;
    originalPiSessionFileExists: boolean;
  };
}

export interface VisibleChatExportSnapshot {
  createdAt: string;
  workspace: WorkspaceState;
  thread: ThreadSummary;
  rawMessages: ChatMessage[];
  messages: ChatMessage[];
  artifacts: ChatExportArtifact[];
  contextUsage?: ContextUsageSnapshot;
  piSession: {
    content?: string;
    fallbackReason?: string;
  };
  childThreadBundles: ChatExportChildThreadBundle[];
  parentMailboxEvents: SubagentParentMailboxEventSummary[];
  callableWorkflowTasks: CallableWorkflowTaskSummary[];
  source: ChatExportSource;
}

interface ChatExportPatternGraphIndex {
  schemaVersion: 1;
  parentThreadId: string;
  patternGraphCount: number;
  linkedChildCount: number;
  graphs: ChatExportPatternGraphRecord[];
}

interface ChatExportPatternGraphRecord {
  workflowTaskId: string;
  workflowRunId?: string;
  workflowThreadId?: string;
  workflowArtifactId?: string;
  task: CallableWorkflowTaskSummary;
  snapshot: SubagentPatternGraphSnapshot;
  childTranscriptLinks: ChatExportPatternGraphChildTranscriptLink[];
}

interface ChatExportPatternGraphChildTranscriptLink {
  nodeId: string;
  nodeLabel: string;
  childRunId?: string;
  childThreadId?: string;
  childDir?: string;
  manifestPath?: string;
  transcriptPath?: string;
  transcriptJsonPath?: string;
  status: string;
  statusLabel: string;
  blockingParent: boolean;
  approvalState: string;
  exportState: "included" | "missing_child_bundle";
}

interface ChatExportChildEvidenceSummaryIndex {
  schemaVersion: 1;
  parentThread: {
    id: string;
    title: string;
  };
  childThreadCount: number;
  approvalBridgeEventCount: number;
  waitEvidence: {
    waitBarrierCount: number;
    waitSessionCount: number;
    progressReturnCount: number;
    barrierTransitionCount: number;
    runtimeTimeoutTransitionCount: number;
    runtimeTimeoutKindCounts: Record<string, number>;
    finalizationBlockCount: number;
    rawToolArgumentMessageCount: number;
    childrenWithProgressReturns: string[];
    childrenWithRuntimeTimeouts: string[];
    childrenWithFinalizationBlocks: string[];
  };
  children: ChatExportChildEvidenceSummary[];
}

interface ChatExportChildEvidenceSummary {
  runId: string;
  childThreadId: string;
  title: string;
  canonicalTaskPath: string;
  status: SubagentRunSummary["status"];
  dependencyMode: SubagentRunSummary["dependencyMode"];
  files: {
    manifest: string;
    fullTranscriptJson: string;
    fullTranscriptMarkdown: string;
    visibleTranscriptJson: string;
    visibleTranscriptMarkdown: string;
    runEvents: string;
    mailboxEvents: string;
    toolScopeSnapshots: string;
    waitBarriers: string;
    piSession?: string;
  };
  transcript: {
    sourceMessageCount: number;
    visibleMessageCount: number;
    hiddenMessageCount: number;
    hiddenThinkingMessageCount: number;
    hiddenEmptyAssistantMessageCount: number;
    artifactCount: number;
    piSessionIncluded: boolean;
  };
  role: {
    roleId: string;
    roleProfileSource: SubagentRunSummary["roleProfileSnapshotSource"];
    effectiveRole?: {
      baseRole: string;
      patternRole: string;
      displayLabel: string;
      roleOverlayIds: string[];
      overlayLabels: string[];
      nonWidening: boolean;
      outputContract?: string;
    };
  };
  authority: {
    toolScopeSnapshotCount: number;
    latestToolScopeSnapshot?: ReturnType<typeof compactSubagentToolScopeSnapshot>;
  };
  approvals: {
    childMailboxApprovalEventCount: number;
    runApprovalEventCount: number;
    parentApprovalBridgeEventCount: number;
    parentApprovalBridgeEventIds: string[];
  };
  barriers: Array<{
    id: string;
    status: string;
    dependencyMode: string;
    failurePolicy: string;
    timeoutMs?: number;
    resolvedAt?: string;
    transitionKind?: string;
    timeoutKind?: string;
    runtimeTimeoutKind?: string;
    resolutionArtifactPresent: boolean;
  }>;
  waitEvidence: {
    rawToolArguments: ChatExportRawToolArgumentEvidence[];
    waitSessions: ChatExportWaitSessionEvidence[];
    progressReturns: ChatExportProgressReturnEvidence[];
    barrierTransitions: ChatExportBarrierTransitionEvidence[];
    livenessSnapshots: ChatExportLivenessEvidence[];
    waitCompletionEvents: ChatExportEventPointer[];
    attentionEvents: ChatExportEventPointer[];
    decisionEvents: ChatExportEventPointer[];
    finalizationBlocks: ChatExportEventPointer[];
  };
  resultArtifact: {
    present: boolean;
    status?: string;
    summary?: string;
    partial?: boolean;
    artifactPath?: string;
  };
  patternGraphLinks: ChatExportPatternGraphChildTranscriptLink[];
  evidenceGaps: string[];
}

interface ChatExportEventPointer {
  source: "parent_mailbox" | "child_mailbox" | "child_run_event" | "parent_transcript" | "child_transcript" | "wait_barrier";
  id: string;
  type?: string;
  createdAt?: string;
  waitBarrierId?: string;
  childRunIds?: string[];
  path: string;
}

interface ChatExportRawToolArgumentEvidence extends ChatExportEventPointer {
  messageId: string;
  threadId: string;
  role: ChatMessage["role"];
  messageVisibleInTranscript: boolean;
  toolName?: string;
  toolCallId?: string;
  action?: string;
  inputSource: string;
  inputChars: number;
  inputPreview: string;
  inputTruncated: boolean;
  rawInput: unknown;
}

interface ChatExportWaitSessionEvidence {
  sourceMessageId: string;
  createdAt: string;
  toolName?: string;
  toolCallId?: string;
  action?: string;
  waitBarrierId?: string;
  childRunIds: string[];
  timeoutMs?: number;
  idempotencyKey?: string;
  rawToolArgumentIndex: number;
  path: string;
}

interface ChatExportProgressReturnEvidence extends ChatExportEventPointer {
  reason?: string;
  waitOutcome?: unknown;
}

interface ChatExportBarrierTransitionEvidence extends ChatExportEventPointer {
  status: string;
  resolvedAt?: string;
  transitionKind?: string;
  transitionReason?: string;
  timeoutKind?: string;
  runtimeTimeoutKind?: string;
  waitBarrierEvaluation?: unknown;
  terminalEvidence?: unknown;
  details?: unknown;
  transitionEvidence?: unknown;
  userDecision?: unknown;
  synthesisAllowed?: boolean;
}

interface ChatExportLivenessEvidence {
  source: string;
  at: string;
  detail?: string;
  path: string;
}

export async function createChatExportBundle(
  store: ChatExportDataSource,
  threadId: string,
  options: ChatExportOptions,
): Promise<ChatExportPayload> {
  const now = options.now ?? new Date();
  const snapshot = await createVisibleChatExportSnapshot(store, threadId, { ...options, now });
  const {
    artifacts,
    callableWorkflowTasks,
    childThreadBundles,
    contextUsage,
    createdAt,
    messages,
    parentMailboxEvents,
    piSession,
    rawMessages,
    source,
    thread,
    workspace,
  } = snapshot;
  const patternGraphRecords = collectPatternGraphExportRecords(callableWorkflowTasks, childThreadBundles);
  const childEvidenceSummary = buildChildEvidenceSummaryIndex(
    thread,
    rawMessages,
    messages,
    childThreadBundles,
    parentMailboxEvents,
    patternGraphRecords,
  );
  const includedFiles = ["manifest.json", "visible-transcript.json", "visible-transcript.md", "artifacts.json"];
  if (contextUsage) includedFiles.push("context-usage.json");
  if (piSession.content !== undefined) includedFiles.push("pi-session.jsonl");
  if (childThreadBundles.length > 0 || parentMailboxEvents.length > 0 || callableWorkflowTasks.length > 0 || patternGraphRecords.length > 0) {
    includedFiles.push("child-threads/index.json");
    if (childThreadBundles.length > 0) includedFiles.push("child-threads/evidence-summary.json");
    if (parentMailboxEvents.length > 0) includedFiles.push("child-threads/parent-mailbox-events.json");
    if (callableWorkflowTasks.length > 0) includedFiles.push("child-threads/callable-workflow-tasks.json");
    if (patternGraphRecords.length > 0) includedFiles.push("child-threads/pattern-graphs.json");
    for (const child of childThreadBundles) {
      includedFiles.push(
        `${child.dir}/manifest.json`,
        `${child.dir}/full-transcript.json`,
        `${child.dir}/full-transcript.md`,
        `${child.dir}/visible-transcript.json`,
        `${child.dir}/visible-transcript.md`,
        `${child.dir}/artifacts.json`,
        `${child.dir}/run-events.json`,
        `${child.dir}/mailbox-events.json`,
        `${child.dir}/tool-scope-snapshots.json`,
        `${child.dir}/wait-barriers.json`,
      );
      if (child.piSession.content !== undefined) includedFiles.push(`${child.dir}/pi-session.jsonl`);
    }
  }

  const zip = new JSZip();
  let replacementCount = 0;
  const addRedactedText = (path: string, content: string) => {
    const redacted = redactSensitiveTextWithMetadata(content);
    replacementCount += redacted.replacementCount;
    zip.file(path, redacted.text);
  };
  const addRedactedJson = (path: string, value: unknown) => {
    addRedactedText(path, `${JSON.stringify(redactStructuredValue(value), null, 2)}\n`);
  };

  if (piSession.content !== undefined) addRedactedText("pi-session.jsonl", piSession.content);
  addRedactedJson("visible-transcript.json", {
    thread,
    messages,
    artifacts,
    exportStats: visibleExportStats(rawMessages, messages, artifacts),
  });
  addRedactedText("visible-transcript.md", renderVisibleTranscriptMarkdown(thread, messages, artifacts));
  addRedactedJson("artifacts.json", { schemaVersion: 1, artifacts } satisfies ChatExportArtifactIndex);
  if (contextUsage) addRedactedJson("context-usage.json", contextUsage);
  if (childThreadBundles.length > 0 || parentMailboxEvents.length > 0 || callableWorkflowTasks.length > 0 || patternGraphRecords.length > 0) {
    addRedactedJson("child-threads/index.json", {
      schemaVersion: 1,
      parentThread: {
        id: thread.id,
        title: thread.title,
      },
      childThreadCount: childThreadBundles.length,
      childVisibleMessageCount: childThreadBundles.reduce((sum, child) => sum + child.messages.length, 0),
      childHiddenMessageCount: childThreadBundles.reduce((sum, child) => sum + child.rawMessages.length - child.messages.length, 0),
      childArtifactCount: childThreadBundles.reduce((sum, child) => sum + child.artifacts.length, 0),
      callableWorkflowTaskCount: callableWorkflowTasks.length,
      patternGraphCount: patternGraphRecords.length,
      patternGraphLinkedChildCount: patternGraphRecords.reduce((sum, graph) => sum + graph.childTranscriptLinks.length, 0),
      parentMailboxEvents,
      callableWorkflowTasks: callableWorkflowTasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        statusLabel: task.statusLabel,
        blocking: task.blocking,
        toolName: task.toolName,
        sourceKind: task.sourceKind,
        workflowThreadId: task.workflowThreadId,
        workflowArtifactId: task.workflowArtifactId,
        workflowRunId: task.workflowRunId,
        hasPatternGraph: Boolean(task.patternGraphSnapshot),
      })),
      patternGraphs: patternGraphRecords.map((graph) => ({
        workflowTaskId: graph.workflowTaskId,
        workflowRunId: graph.workflowRunId,
        workflowThreadId: graph.workflowThreadId,
        workflowArtifactId: graph.workflowArtifactId,
        patternId: graph.snapshot.patternId,
        label: graph.snapshot.label,
        updatedAt: graph.snapshot.updatedAt,
        childTranscriptLinks: graph.childTranscriptLinks,
      })),
      children: childThreadBundles.map((child) => ({
        dir: child.dir,
        run: child.run,
        thread: child.thread,
        exportStats: visibleExportStats(child.rawMessages, child.messages, child.artifacts),
        piSession: {
          ...(child.piSession.fallbackReason ? { fallbackReason: child.piSession.fallbackReason } : {}),
          ...(child.piSession.originalPiSessionFile ? { originalPiSessionFile: child.piSession.originalPiSessionFile } : {}),
          originalPiSessionFileExists: child.piSession.originalPiSessionFileExists,
          included: child.piSession.content !== undefined,
        },
      })),
    });
    if (childThreadBundles.length > 0) addRedactedJson("child-threads/evidence-summary.json", childEvidenceSummary);
    if (parentMailboxEvents.length > 0) {
      addRedactedJson("child-threads/parent-mailbox-events.json", {
        schemaVersion: 1,
        parentThreadId: thread.id,
        events: parentMailboxEvents,
      });
    }
    if (callableWorkflowTasks.length > 0) {
      addRedactedJson("child-threads/callable-workflow-tasks.json", {
        schemaVersion: 1,
        parentThreadId: thread.id,
        tasks: callableWorkflowTasks,
      });
    }
    if (patternGraphRecords.length > 0) {
      addRedactedJson("child-threads/pattern-graphs.json", {
        schemaVersion: 1,
        parentThreadId: thread.id,
        patternGraphCount: patternGraphRecords.length,
        linkedChildCount: patternGraphRecords.reduce((sum, graph) => sum + graph.childTranscriptLinks.length, 0),
        graphs: patternGraphRecords,
      } satisfies ChatExportPatternGraphIndex);
    }
    for (const child of childThreadBundles) {
      if (child.piSession.content !== undefined) addRedactedText(`${child.dir}/pi-session.jsonl`, child.piSession.content);
      addRedactedJson(`${child.dir}/manifest.json`, {
        schemaVersion: 1,
        parentThread: {
          id: thread.id,
          title: thread.title,
        },
        run: child.run,
        thread: child.thread,
        exportStats: visibleExportStats(child.rawMessages, child.messages, child.artifacts),
        piSession: {
          ...(child.piSession.fallbackReason ? { fallbackReason: child.piSession.fallbackReason } : {}),
          ...(child.piSession.originalPiSessionFile ? { originalPiSessionFile: child.piSession.originalPiSessionFile } : {}),
          originalPiSessionFileExists: child.piSession.originalPiSessionFileExists,
          included: child.piSession.content !== undefined,
        },
      });
      addRedactedJson(`${child.dir}/visible-transcript.json`, {
        thread: child.thread,
        run: child.run,
        messages: child.messages,
        artifacts: child.artifacts,
        exportStats: visibleExportStats(child.rawMessages, child.messages, child.artifacts),
      });
      addRedactedText(`${child.dir}/visible-transcript.md`, renderVisibleTranscriptMarkdown(child.thread, child.messages, child.artifacts));
      addRedactedJson(`${child.dir}/full-transcript.json`, {
        thread: child.thread,
        run: child.run,
        messages: child.rawMessages,
        artifacts: child.artifacts,
        exportStats: visibleExportStats(child.rawMessages, child.messages, child.artifacts),
      });
      addRedactedText(`${child.dir}/full-transcript.md`, renderFullTranscriptMarkdown(child.thread, child.rawMessages, child.artifacts));
      addRedactedJson(`${child.dir}/artifacts.json`, { schemaVersion: 1, artifacts: child.artifacts } satisfies ChatExportArtifactIndex);
      addRedactedJson(`${child.dir}/run-events.json`, { schemaVersion: 1, runId: child.run.id, events: child.runEvents });
      addRedactedJson(`${child.dir}/mailbox-events.json`, { schemaVersion: 1, runId: child.run.id, events: child.mailboxEvents });
      addRedactedJson(`${child.dir}/tool-scope-snapshots.json`, { schemaVersion: 1, runId: child.run.id, snapshots: child.toolScopeSnapshots });
      addRedactedJson(`${child.dir}/wait-barriers.json`, { schemaVersion: 1, runId: child.run.id, barriers: child.waitBarriers });
    }
  }

  const manifest: ChatExportManifest = {
    schemaVersion: 1,
    createdAt,
    app: {
      name: options.appName,
      version: options.appVersion,
    },
    workspace,
    thread: {
      id: thread.id,
      title: thread.title,
      workspacePath: thread.workspacePath,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      permissionMode: thread.permissionMode,
      collaborationMode: thread.collaborationMode,
      model: thread.model,
      thinkingLevel: thread.thinkingLevel,
    },
    export: {
      source,
      ...(piSession.fallbackReason ? { fallbackReason: piSession.fallbackReason } : {}),
      ...(thread.piSessionFile ? { originalPiSessionFile: displayPath(workspace, thread.piSessionFile) } : {}),
      originalPiSessionFileExists: thread.piSessionFile ? existsSync(thread.piSessionFile) : false,
      includedFiles,
      visibleMessageCount: messages.length,
      hiddenMessageCount: rawMessages.length - messages.length,
      artifactCount: artifacts.length,
      childThreadCount: childThreadBundles.length,
      childVisibleMessageCount: childThreadBundles.reduce((sum, child) => sum + child.messages.length, 0),
      childHiddenMessageCount: childThreadBundles.reduce((sum, child) => sum + child.rawMessages.length - child.messages.length, 0),
      childArtifactCount: childThreadBundles.reduce((sum, child) => sum + child.artifacts.length, 0),
      childPiSessionCount: childThreadBundles.filter((child) => child.piSession.content !== undefined).length,
      callableWorkflowTaskCount: callableWorkflowTasks.length,
      patternGraphCount: patternGraphRecords.length,
      patternGraphLinkedChildCount: patternGraphRecords.reduce((sum, graph) => sum + graph.childTranscriptLinks.length, 0),
      pointInTime: true,
    },
    redaction: {
      applied: true,
      replacementCount,
    },
  };
  addRedactedJson("manifest.json", manifest);

  const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return {
    fileName: chatExportFileName(thread, now),
    archive,
    createdAt,
    source,
    ...(piSession.fallbackReason ? { fallbackReason: piSession.fallbackReason } : {}),
  };
}

export async function createVisibleChatExportSnapshot(
  store: ChatExportDataSource,
  threadId: string,
  options: ChatExportOptions,
): Promise<VisibleChatExportSnapshot> {
  const now = options.now ?? new Date();
  const createdAt = now.toISOString();
  const includePiSessionContent = options.includePiSessionContent ?? true;
  const workspace = store.getWorkspace();
  const thread = store.getThread(threadId);
  const rawMessages = store.listMessages(thread.id);
  const messages = visibleExportMessages(rawMessages);
  const artifacts = collectVisibleTranscriptArtifacts(messages);
  const contextUsage = store.getLatestContextUsageSnapshot?.(thread.id);
  const piSession = includePiSessionContent ? await readThreadPiSession(workspace, thread) : {};
  const childThreadBundles = await collectChildThreadBundles(store, workspace, thread, { includePiSessionContent });
  const parentMailboxEvents = store.listSubagentParentMailboxEventsForParentThread?.(thread.id) ?? [];
  const callableWorkflowTasks = store.listCallableWorkflowTasksForParentThread?.(thread.id) ?? [];
  const source: ChatExportSource = piSession.content === undefined ? "visible-chat-fallback" : "pi-session";
  return {
    artifacts,
    callableWorkflowTasks,
    childThreadBundles,
    contextUsage,
    createdAt,
    messages,
    parentMailboxEvents,
    piSession,
    rawMessages,
    source,
    thread,
    workspace,
  };
}

function visibleExportMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => {
    if (message.metadata?.kind === "thinking") return false;
    if (message.role === "assistant" && !message.content.trim()) return false;
    return true;
  });
}

function visibleExportStats(rawMessages: ChatMessage[], messages: ChatMessage[], artifacts: ChatExportArtifact[]) {
  return {
    sourceMessageCount: rawMessages.length,
    visibleMessageCount: messages.length,
    hiddenMessageCount: rawMessages.length - messages.length,
    hiddenThinkingMessageCount: rawMessages.filter((message) => message.metadata?.kind === "thinking").length,
    hiddenEmptyAssistantMessageCount: rawMessages.filter((message) => message.role === "assistant" && !message.content.trim()).length,
    artifactCount: artifacts.length,
  };
}

async function collectChildThreadBundles(
  store: ChatExportDataSource,
  workspace: WorkspaceState,
  parentThread: ThreadSummary,
  options: { includePiSessionContent: boolean },
): Promise<ChatExportChildThreadBundle[]> {
  const runs = store.listSubagentRunsForParentThread?.(parentThread.id) ?? [];
  const bundles: ChatExportChildThreadBundle[] = [];
  for (const [index, run] of runs.entries()) {
    const thread = getChildThreadForExport(store, parentThread, run);
    const rawMessages = store.listMessages(thread.id);
    const messages = visibleExportMessages(rawMessages);
    const artifacts = collectVisibleTranscriptArtifacts(messages);
    const piSession = options.includePiSessionContent ? await readThreadPiSession(workspace, thread) : {};
    const waitBarriers = (store.listSubagentWaitBarriersForParentRun?.(run.parentRunId) ?? [])
      .filter((barrier) => barrier.childRunIds.includes(run.id) || barrier.parentRunId === run.id);
    bundles.push({
      dir: childThreadExportDir(run, index),
      run,
      thread,
      rawMessages,
      messages,
      artifacts,
      runEvents: store.listSubagentRunEvents?.(run.id) ?? [],
      mailboxEvents: store.listSubagentMailboxEvents?.(run.id) ?? [],
      toolScopeSnapshots: store.listSubagentToolScopeSnapshots?.(run.id) ?? [],
      waitBarriers,
      piSession: {
        ...(piSession.content !== undefined ? { content: piSession.content } : {}),
        ...(piSession.fallbackReason ? { fallbackReason: piSession.fallbackReason } : {}),
        ...(thread.piSessionFile ? { originalPiSessionFile: displayPath(workspace, thread.piSessionFile) } : {}),
        originalPiSessionFileExists: thread.piSessionFile ? existsSync(thread.piSessionFile) : false,
      },
    });
  }
  return bundles;
}

function collectPatternGraphExportRecords(
  tasks: CallableWorkflowTaskSummary[],
  childThreadBundles: ChatExportChildThreadBundle[],
): ChatExportPatternGraphRecord[] {
  const childByRunId = new Map(childThreadBundles.map((child) => [child.run.id, child]));
  const childByThreadId = new Map(childThreadBundles.map((child) => [child.thread.id, child]));
  return tasks.flatMap((task) => {
    const snapshot = task.patternGraphSnapshot;
    if (!snapshot) return [];
    return [{
      workflowTaskId: task.id,
      ...(task.workflowRunId ? { workflowRunId: task.workflowRunId } : {}),
      ...(task.workflowThreadId ? { workflowThreadId: task.workflowThreadId } : {}),
      ...(task.workflowArtifactId ? { workflowArtifactId: task.workflowArtifactId } : {}),
      task,
      snapshot,
      childTranscriptLinks: patternGraphChildTranscriptLinks(snapshot, childByRunId, childByThreadId),
    }];
  });
}

function patternGraphChildTranscriptLinks(
  snapshot: SubagentPatternGraphSnapshot,
  childByRunId: Map<string, ChatExportChildThreadBundle>,
  childByThreadId: Map<string, ChatExportChildThreadBundle>,
): ChatExportPatternGraphChildTranscriptLink[] {
  return snapshot.nodes.flatMap((node) => {
    if (!node.childRunId && !node.childThreadId) return [];
    const child = (node.childRunId ? childByRunId.get(node.childRunId) : undefined)
      ?? (node.childThreadId ? childByThreadId.get(node.childThreadId) : undefined);
    return [{
      nodeId: node.id,
      nodeLabel: node.label,
      ...(node.childRunId ?? child?.run.id ? { childRunId: node.childRunId ?? child?.run.id } : {}),
      ...(node.childThreadId ?? child?.thread.id ? { childThreadId: node.childThreadId ?? child?.thread.id } : {}),
      ...(child ? {
        childDir: child.dir,
        manifestPath: `${child.dir}/manifest.json`,
        transcriptPath: `${child.dir}/visible-transcript.md`,
        transcriptJsonPath: `${child.dir}/visible-transcript.json`,
      } : {}),
      status: node.status,
      statusLabel: node.statusLabel,
      blockingParent: node.blockingParent,
      approvalState: node.approvalState,
      exportState: child ? "included" : "missing_child_bundle",
    }];
  });
}

function buildChildEvidenceSummaryIndex(
  parentThread: ThreadSummary,
  parentRawMessages: ChatMessage[],
  parentMessages: ChatMessage[],
  childThreadBundles: ChatExportChildThreadBundle[],
  parentMailboxEvents: SubagentParentMailboxEventSummary[],
  patternGraphRecords: ChatExportPatternGraphRecord[],
): ChatExportChildEvidenceSummaryIndex {
  const visibleParentMessageIds = new Set(parentMessages.map((message) => message.id));
  const children = childThreadBundles.map((child) =>
    buildChildEvidenceSummary(child, parentRawMessages, visibleParentMessageIds, parentMailboxEvents, patternGraphRecords)
  );
  return {
    schemaVersion: 1,
    parentThread: {
      id: parentThread.id,
      title: parentThread.title,
    },
    childThreadCount: children.length,
    approvalBridgeEventCount: children.reduce((sum, child) => sum + child.approvals.parentApprovalBridgeEventCount, 0),
    waitEvidence: {
      waitBarrierCount: children.reduce((sum, child) => sum + child.barriers.length, 0),
      waitSessionCount: children.reduce((sum, child) => sum + child.waitEvidence.waitSessions.length, 0),
      progressReturnCount: children.reduce((sum, child) => sum + child.waitEvidence.progressReturns.length, 0),
      barrierTransitionCount: children.reduce((sum, child) => sum + child.waitEvidence.barrierTransitions.length, 0),
      runtimeTimeoutTransitionCount: children.reduce(
        (sum, child) => sum + child.waitEvidence.barrierTransitions.filter((transition) => transition.transitionKind === "child_runtime_timeout").length,
        0,
      ),
      runtimeTimeoutKindCounts: timeoutKindCounts(children.flatMap((child) => child.waitEvidence.barrierTransitions)),
      finalizationBlockCount: children.reduce((sum, child) => sum + child.waitEvidence.finalizationBlocks.length, 0),
      rawToolArgumentMessageCount: children.reduce((sum, child) => sum + child.waitEvidence.rawToolArguments.length, 0),
      childrenWithProgressReturns: children
        .filter((child) => child.waitEvidence.progressReturns.length > 0)
        .map((child) => child.runId),
      childrenWithRuntimeTimeouts: children
        .filter((child) => child.waitEvidence.barrierTransitions.some((transition) => transition.transitionKind === "child_runtime_timeout"))
        .map((child) => child.runId),
      childrenWithFinalizationBlocks: children
        .filter((child) => child.waitEvidence.finalizationBlocks.length > 0)
        .map((child) => child.runId),
    },
    children,
  };
}

function buildChildEvidenceSummary(
  child: ChatExportChildThreadBundle,
  parentRawMessages: ChatMessage[],
  visibleParentMessageIds: Set<string>,
  parentMailboxEvents: SubagentParentMailboxEventSummary[],
  patternGraphRecords: ChatExportPatternGraphRecord[],
): ChatExportChildEvidenceSummary {
  const latestToolScopeSnapshot = child.toolScopeSnapshots.at(-1);
  const childParentApprovalEvents = parentMailboxEvents.filter((event) =>
    isApprovalEventType(event.type) && parentMailboxEventReferencesChild(event, child)
  );
  const resultArtifact = resultArtifactSummary(child.run.resultArtifact);
  const visibleStats = visibleExportStats(child.rawMessages, child.messages, child.artifacts);
  const waitEvidence = buildChildWaitEvidence(child, parentRawMessages, visibleParentMessageIds, parentMailboxEvents);
  return {
    runId: child.run.id,
    childThreadId: child.thread.id,
    title: child.thread.title || child.run.canonicalTaskPath,
    canonicalTaskPath: child.run.canonicalTaskPath,
    status: child.run.status,
    dependencyMode: child.run.dependencyMode,
    files: {
      manifest: `${child.dir}/manifest.json`,
      fullTranscriptJson: `${child.dir}/full-transcript.json`,
      fullTranscriptMarkdown: `${child.dir}/full-transcript.md`,
      visibleTranscriptJson: `${child.dir}/visible-transcript.json`,
      visibleTranscriptMarkdown: `${child.dir}/visible-transcript.md`,
      runEvents: `${child.dir}/run-events.json`,
      mailboxEvents: `${child.dir}/mailbox-events.json`,
      toolScopeSnapshots: `${child.dir}/tool-scope-snapshots.json`,
      waitBarriers: `${child.dir}/wait-barriers.json`,
      ...(child.piSession.content !== undefined ? { piSession: `${child.dir}/pi-session.jsonl` } : {}),
    },
    transcript: {
      sourceMessageCount: visibleStats.sourceMessageCount,
      visibleMessageCount: visibleStats.visibleMessageCount,
      hiddenMessageCount: visibleStats.hiddenMessageCount,
      hiddenThinkingMessageCount: visibleStats.hiddenThinkingMessageCount,
      hiddenEmptyAssistantMessageCount: visibleStats.hiddenEmptyAssistantMessageCount,
      artifactCount: child.artifacts.length,
      piSessionIncluded: child.piSession.content !== undefined,
    },
    role: {
      roleId: child.run.roleId,
      roleProfileSource: child.run.roleProfileSnapshotSource,
      ...(child.run.effectiveRoleSnapshot ? { effectiveRole: effectiveRoleEvidence(child.run.effectiveRoleSnapshot) } : {}),
    },
    authority: {
      toolScopeSnapshotCount: child.toolScopeSnapshots.length,
      ...(latestToolScopeSnapshot ? { latestToolScopeSnapshot: compactSubagentToolScopeSnapshot(latestToolScopeSnapshot) } : {}),
    },
    approvals: {
      childMailboxApprovalEventCount: child.mailboxEvents.filter((event) => isApprovalEventType(event.type)).length,
      runApprovalEventCount: child.runEvents.filter((event) => isApprovalEventType(event.type)).length,
      parentApprovalBridgeEventCount: childParentApprovalEvents.length,
      parentApprovalBridgeEventIds: childParentApprovalEvents.map((event) => event.id),
    },
    barriers: child.waitBarriers.map((barrier) => ({
      id: barrier.id,
      status: barrier.status,
      dependencyMode: barrier.dependencyMode,
      failurePolicy: barrier.failurePolicy,
      ...(barrier.timeoutMs !== undefined ? { timeoutMs: barrier.timeoutMs } : {}),
      ...(barrier.resolvedAt ? { resolvedAt: barrier.resolvedAt } : {}),
      ...barrierResolutionClassification(barrier),
      resolutionArtifactPresent: barrier.resolutionArtifact !== undefined,
    })),
    waitEvidence,
    resultArtifact,
    patternGraphLinks: patternGraphRecords.flatMap((graph) =>
      graph.childTranscriptLinks.filter((link) =>
        link.childRunId === child.run.id || link.childThreadId === child.thread.id
      )
    ),
    evidenceGaps: childEvidenceGaps({ child, resultArtifact }),
  };
}

function buildChildWaitEvidence(
  child: ChatExportChildThreadBundle,
  parentRawMessages: ChatMessage[],
  visibleParentMessageIds: Set<string>,
  parentMailboxEvents: SubagentParentMailboxEventSummary[],
): ChatExportChildEvidenceSummary["waitEvidence"] {
  const parentMessagesForChild = parentRawMessages.filter((message) =>
    messageReferencesChild(message, child) || parentAmbientSubagentToolMessageLikelyReferencesChild(message, child)
  );
  const parentEventsForChild = parentMailboxEvents.filter((event) => parentMailboxEventReferencesChild(event, child));
  const rawToolArguments = [
    ...rawToolArgumentEvidenceFromMessages({
      messages: parentMessagesForChild,
      visibleMessageIds: visibleParentMessageIds,
      source: "parent_transcript",
      path: "visible-transcript.json",
      hiddenPath: "child-threads/evidence-summary.json",
    }),
    ...rawToolArgumentEvidenceFromMessages({
      messages: child.rawMessages,
      visibleMessageIds: new Set(child.messages.map((message) => message.id)),
      source: "child_transcript",
      path: `${child.dir}/full-transcript.json`,
    }).filter((item) => messageReferencesChildIdOrThread(item.rawInput, child)),
  ];
  const waitSessions = rawToolArguments
    .map((evidence, rawToolArgumentIndex) => waitSessionEvidenceFromRawToolArgument(evidence, rawToolArgumentIndex))
    .filter((evidence): evidence is ChatExportWaitSessionEvidence => Boolean(evidence));
  const waitCompletionEvents = [
    ...child.mailboxEvents
      .filter((event) => event.type === "subagent.wait_completed")
      .map((event) => mailboxEventPointer(event, "child_mailbox", `${child.dir}/mailbox-events.json`)),
    ...child.runEvents
      .filter((event) => event.type === "subagent.wait_completed")
      .map((event) => runEventPointer(event, `${child.dir}/run-events.json`)),
  ];
  const attentionEvents = parentEventsForChild
    .filter((event) => event.type === "subagent.wait_barrier_attention")
    .map((event) => parentMailboxEventPointer(event, "child-threads/parent-mailbox-events.json"));
  const decisionEvents = parentEventsForChild
    .filter((event) => event.type === "subagent.wait_barrier_decision")
    .map((event) => parentMailboxEventPointer(event, "child-threads/parent-mailbox-events.json"));
  const finalizationBlocks = parentEventsForChild
    .filter((event) => parentMailboxEventIsFinalizationBlock(event))
    .map((event) => parentMailboxEventPointer(event, "child-threads/parent-mailbox-events.json"));
  return {
    rawToolArguments,
    waitSessions,
    progressReturns: dedupeProgressReturnEvidence([
      ...progressReturnEvidenceFromMessages(parentMessagesForChild, "parent_transcript", "visible-transcript.json"),
      ...progressReturnEvidenceFromMessages(child.rawMessages, "child_transcript", `${child.dir}/full-transcript.json`),
      ...parentEventsForChild
        .filter((event) => structuredValueContainsString(event.payload, "progress_return"))
        .map((event) => progressReturnEvidenceFromParentMailbox(event, "child-threads/parent-mailbox-events.json")),
      ...child.mailboxEvents
        .filter((event) => structuredValueContainsString(event.payload, "progress_return"))
        .map((event) => progressReturnEvidenceFromMailbox(event, "child_mailbox", `${child.dir}/mailbox-events.json`)),
      ...child.runEvents
        .filter((event) => structuredValueContainsString(event.preview, "progress_return"))
        .map((event) => progressReturnEvidenceFromRunEvent(event, `${child.dir}/run-events.json`)),
    ]),
    barrierTransitions: child.waitBarriers.flatMap((barrier) => barrierTransitionEvidenceFromBarrier(barrier, `${child.dir}/wait-barriers.json`)),
    livenessSnapshots: [latestChildLivenessEvidence(child)],
    waitCompletionEvents,
    attentionEvents,
    decisionEvents,
    finalizationBlocks,
  };
}

function rawToolArgumentEvidenceFromMessages(input: {
  messages: ChatMessage[];
  visibleMessageIds: Set<string>;
  source: "parent_transcript" | "child_transcript";
  path: string;
  hiddenPath?: string;
}): ChatExportRawToolArgumentEvidence[] {
  return input.messages.flatMap((message) => {
    const metadata = recordValue(message.metadata);
    const toolName = stringValue(metadata?.toolName);
    const toolCallId = stringValue(metadata?.toolCallId);
    if (!toolName && !toolCallId) return [];
    const rawInput = rawToolInputFromMetadata(metadata);
    if (!rawInput) return [];
    const inputText = rawInput.text;
    const messageVisibleInTranscript = input.visibleMessageIds.has(message.id);
    return [{
      source: input.source,
      id: message.id,
      type: "tool_arguments",
      createdAt: message.createdAt,
      path: messageVisibleInTranscript ? input.path : input.hiddenPath ?? input.path,
      messageId: message.id,
      threadId: message.threadId,
      role: message.role,
      messageVisibleInTranscript,
      ...(toolName ? { toolName } : {}),
      ...(toolCallId ? { toolCallId } : {}),
      ...(actionFromToolInput(rawInput.value) ? { action: actionFromToolInput(rawInput.value) } : {}),
      inputSource: rawInput.source,
      inputChars: inputText.length,
      inputPreview: truncateSummary(inputText, 1000),
      inputTruncated: inputText.length > 1000,
      rawInput: rawInput.value,
      ...(waitBarrierIdFromValue(rawInput.value) ? { waitBarrierId: waitBarrierIdFromValue(rawInput.value) } : {}),
      ...(childRunIdsFromValue(rawInput.value).length ? { childRunIds: childRunIdsFromValue(rawInput.value) } : {}),
    }];
  });
}

function rawToolInputFromMetadata(
  metadata: Record<string, unknown> | undefined,
): { source: string; value: unknown; text: string } | undefined {
  if (!metadata) return undefined;
  const candidates: Array<{ source: string; value: unknown }> = [
    { source: "inputContent", value: metadata.inputContent },
    { source: "rawInput", value: metadata.rawInput },
    { source: "toolInput", value: metadata.toolInput },
    { source: "input", value: metadata.input },
    { source: "arguments", value: metadata.arguments },
    { source: "params", value: metadata.params },
  ];
  const details = recordValue(metadata.toolResultDetails);
  if (details) {
    candidates.push(
      { source: "toolResultDetails.inputContent", value: details.inputContent },
      { source: "toolResultDetails.rawInput", value: details.rawInput },
      { source: "toolResultDetails.toolInput", value: details.toolInput },
      { source: "toolResultDetails.arguments", value: details.arguments },
    );
  }
  for (const candidate of candidates) {
    if (candidate.value === undefined || candidate.value === null) continue;
    const value = typeof candidate.value === "string" ? parsePossiblyJson(candidate.value) : candidate.value;
    return {
      source: candidate.source,
      value,
      text: typeof candidate.value === "string" ? candidate.value : JSON.stringify(candidate.value, null, 2),
    };
  }
  return undefined;
}

function waitSessionEvidenceFromRawToolArgument(
  evidence: ChatExportRawToolArgumentEvidence,
  rawToolArgumentIndex: number,
): ChatExportWaitSessionEvidence | undefined {
  const action = actionFromToolInput(evidence.rawInput) ?? evidence.action;
  if (action !== "wait_agent") return undefined;
  return {
    sourceMessageId: evidence.messageId,
    createdAt: evidence.createdAt ?? "",
    ...(evidence.toolName ? { toolName: evidence.toolName } : {}),
    ...(evidence.toolCallId ? { toolCallId: evidence.toolCallId } : {}),
    action,
    ...(evidence.waitBarrierId ? { waitBarrierId: evidence.waitBarrierId } : {}),
    childRunIds: childRunIdsFromValue(evidence.rawInput),
    ...(numberFieldDeep(evidence.rawInput, "timeoutMs") !== undefined ? { timeoutMs: numberFieldDeep(evidence.rawInput, "timeoutMs") } : {}),
    ...(stringFieldDeep(evidence.rawInput, "idempotencyKey") ? { idempotencyKey: stringFieldDeep(evidence.rawInput, "idempotencyKey") } : {}),
    rawToolArgumentIndex,
    path: evidence.path,
  };
}

function progressReturnEvidenceFromMessages(
  messages: ChatMessage[],
  source: "parent_transcript" | "child_transcript",
  path: string,
): ChatExportProgressReturnEvidence[] {
  return messages
    .filter((message) => structuredValueContainsString({ content: message.content, metadata: message.metadata }, "progress_return"))
    .map((message) => {
      const waitOutcome = valueForKeyDeep({ content: message.content, metadata: message.metadata }, "waitOutcome");
      return {
        source,
        id: message.id,
        type: "progress_return",
        createdAt: message.createdAt,
        path,
        ...(waitBarrierIdFromValue({ content: message.content, metadata: message.metadata }) ? {
          waitBarrierId: waitBarrierIdFromValue({ content: message.content, metadata: message.metadata }),
        } : {}),
        ...(childRunIdsFromValue({ content: message.content, metadata: message.metadata }).length ? {
          childRunIds: childRunIdsFromValue({ content: message.content, metadata: message.metadata }),
        } : {}),
        ...(stringFieldDeep(waitOutcome, "reason") ?? stringFieldDeep(message.metadata, "reason") ? {
          reason: stringFieldDeep(waitOutcome, "reason") ?? stringFieldDeep(message.metadata, "reason"),
        } : {}),
        ...(waitOutcome ? { waitOutcome } : {}),
      };
    });
}

function progressReturnEvidenceFromParentMailbox(
  event: SubagentParentMailboxEventSummary,
  path: string,
): ChatExportProgressReturnEvidence {
  return {
    ...parentMailboxEventPointer(event, path),
    type: event.type,
    ...(stringFieldDeep(event.payload, "reason") ? { reason: stringFieldDeep(event.payload, "reason") } : {}),
    ...(valueForKeyDeep(event.payload, "waitOutcome") ? { waitOutcome: valueForKeyDeep(event.payload, "waitOutcome") } : {}),
  };
}

function progressReturnEvidenceFromMailbox(
  event: SubagentMailboxEventSummary,
  source: "child_mailbox",
  path: string,
): ChatExportProgressReturnEvidence {
  return {
    ...mailboxEventPointer(event, source, path),
    type: event.type,
    ...(stringFieldDeep(event.payload, "reason") ? { reason: stringFieldDeep(event.payload, "reason") } : {}),
    ...(valueForKeyDeep(event.payload, "waitOutcome") ? { waitOutcome: valueForKeyDeep(event.payload, "waitOutcome") } : {}),
  };
}

function progressReturnEvidenceFromRunEvent(
  event: SubagentRunEventSummary,
  path: string,
): ChatExportProgressReturnEvidence {
  return {
    ...runEventPointer(event, path),
    type: event.type,
    ...(stringFieldDeep(event.preview, "reason") ? { reason: stringFieldDeep(event.preview, "reason") } : {}),
    ...(valueForKeyDeep(event.preview, "waitOutcome") ? { waitOutcome: valueForKeyDeep(event.preview, "waitOutcome") } : {}),
  };
}

function barrierTransitionEvidenceFromBarrier(
  barrier: SubagentWaitBarrierSummary,
  path: string,
): ChatExportBarrierTransitionEvidence[] {
  const artifact = recordValue(barrier.resolutionArtifact);
  const transitionEvidence = recordValue(artifact?.transitionEvidence);
  const waitBarrierEvaluation = recordValue(artifact?.waitBarrierEvaluation);
  const terminalEvidence = waitBarrierEvaluation?.terminalEvidence;
  const userDecision = artifact?.userDecision;
  if (barrier.status === "waiting_on_children" && !transitionEvidence && !userDecision) return [];
  const transitionKind = stringValue(transitionEvidence?.kind);
  const transitionReason = stringValue(transitionEvidence?.reason) ?? stringValue(waitBarrierEvaluation?.reason);
  const timeoutKind = stringValue(transitionEvidence?.timeoutKind) ?? stringFieldDeep(terminalEvidence, "timeoutKind");
  const runtimeTimeoutKind = stringValue(waitBarrierEvaluation?.runtimeTimeoutKind) ?? timeoutKind;
  const details = transitionEvidence?.details ?? recordValue(terminalEvidence)?.details;
  return [{
    source: "wait_barrier",
    id: barrier.id,
    type: "wait_barrier_transition",
    createdAt: barrier.updatedAt,
    waitBarrierId: barrier.id,
    childRunIds: barrier.childRunIds,
    path,
    status: barrier.status,
    ...(barrier.resolvedAt ? { resolvedAt: barrier.resolvedAt } : {}),
    ...(transitionKind ? { transitionKind } : {}),
    ...(transitionReason ? { transitionReason } : {}),
    ...(timeoutKind ? { timeoutKind } : {}),
    ...(runtimeTimeoutKind ? { runtimeTimeoutKind } : {}),
    ...(waitBarrierEvaluation ? { waitBarrierEvaluation } : {}),
    ...(terminalEvidence ? { terminalEvidence } : {}),
    ...(details ? { details } : {}),
    ...(transitionEvidence ? { transitionEvidence } : {}),
    ...(userDecision ? { userDecision } : {}),
    ...(typeof artifact?.synthesisAllowed === "boolean" ? { synthesisAllowed: artifact.synthesisAllowed } : {}),
  }];
}

function barrierResolutionClassification(barrier: SubagentWaitBarrierSummary): {
  transitionKind?: string;
  timeoutKind?: string;
  runtimeTimeoutKind?: string;
} {
  const artifact = recordValue(barrier.resolutionArtifact);
  const transitionEvidence = recordValue(artifact?.transitionEvidence);
  const waitBarrierEvaluation = recordValue(artifact?.waitBarrierEvaluation);
  const terminalEvidence = waitBarrierEvaluation?.terminalEvidence;
  const transitionKind = stringValue(transitionEvidence?.kind);
  const timeoutKind = stringValue(transitionEvidence?.timeoutKind) ?? stringFieldDeep(terminalEvidence, "timeoutKind");
  const runtimeTimeoutKind = stringValue(waitBarrierEvaluation?.runtimeTimeoutKind) ?? timeoutKind;
  return {
    ...(transitionKind ? { transitionKind } : {}),
    ...(timeoutKind ? { timeoutKind } : {}),
    ...(runtimeTimeoutKind ? { runtimeTimeoutKind } : {}),
  };
}

function timeoutKindCounts(transitions: ChatExportBarrierTransitionEvidence[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const transition of transitions) {
    const key = transition.runtimeTimeoutKind ?? transition.timeoutKind;
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function latestChildLivenessEvidence(child: ChatExportChildThreadBundle): ChatExportLivenessEvidence {
  let latest: ChatExportLivenessEvidence = {
    at: child.run.updatedAt ?? child.run.createdAt,
    source: "subagent_run",
    detail: "run updated",
    path: `${child.dir}/manifest.json`,
  };
  for (const value of [child.run.completedAt, child.run.closedAt, child.run.startedAt, child.run.createdAt]) {
    latest = newerLiveness(latest, value, "subagent_run", value === child.run.completedAt ? "run completed" : "run timestamp", `${child.dir}/manifest.json`);
  }
  for (const event of child.runEvents) {
    latest = newerLiveness(latest, event.createdAt, `run_event:${event.type}`, `run event ${event.sequence}`, `${child.dir}/run-events.json`);
  }
  for (const mailbox of child.mailboxEvents) {
    latest = newerLiveness(latest, mailbox.deliveredAt ?? mailbox.createdAt, `mailbox:${mailbox.type}`, mailbox.deliveryState, `${child.dir}/mailbox-events.json`);
  }
  return latest;
}

function newerLiveness(
  current: ChatExportLivenessEvidence,
  at: string | undefined,
  source: string,
  detail: string,
  path: string,
): ChatExportLivenessEvidence {
  if (!at) return current;
  const currentMs = Date.parse(current.at);
  const nextMs = Date.parse(at);
  if (!Number.isFinite(nextMs)) return current;
  if (!Number.isFinite(currentMs) || nextMs >= currentMs) return { at, source, detail, path };
  return current;
}

function parentMailboxEventPointer(event: SubagentParentMailboxEventSummary, path: string): ChatExportEventPointer {
  return {
    source: "parent_mailbox",
    id: event.id,
    type: event.type,
    createdAt: event.createdAt,
    path,
    ...(waitBarrierIdFromValue(event.payload) ? { waitBarrierId: waitBarrierIdFromValue(event.payload) } : {}),
    ...(childRunIdsFromValue(event.payload).length ? { childRunIds: childRunIdsFromValue(event.payload) } : {}),
  };
}

function mailboxEventPointer(
  event: SubagentMailboxEventSummary,
  source: "child_mailbox",
  path: string,
): ChatExportEventPointer {
  return {
    source,
    id: event.id,
    type: event.type,
    createdAt: event.createdAt,
    path,
    ...(waitBarrierIdFromValue(event.payload) ? { waitBarrierId: waitBarrierIdFromValue(event.payload) } : {}),
    ...(childRunIdsFromValue(event.payload).length ? { childRunIds: childRunIdsFromValue(event.payload) } : {}),
  };
}

function runEventPointer(event: SubagentRunEventSummary, path: string): ChatExportEventPointer {
  return {
    source: "child_run_event",
    id: `${event.runId}:${event.sequence}`,
    type: event.type,
    createdAt: event.createdAt,
    path,
    ...(waitBarrierIdFromValue(event.preview) ? { waitBarrierId: waitBarrierIdFromValue(event.preview) } : {}),
    ...(childRunIdsFromValue(event.preview).length ? { childRunIds: childRunIdsFromValue(event.preview) } : {}),
  };
}

function parentMailboxEventIsFinalizationBlock(event: SubagentParentMailboxEventSummary): boolean {
  return event.type === "callable_workflow.parent_finalization_blocked" ||
    Boolean(recordValue(event.payload)?.parentFinalizationBlocked);
}

function messageReferencesChild(message: ChatMessage, child: ChatExportChildThreadBundle): boolean {
  return messageReferencesChildIdOrThread({ content: message.content, metadata: message.metadata }, child);
}

function messageReferencesChildIdOrThread(value: unknown, child: ChatExportChildThreadBundle): boolean {
  return structuredValueContainsString(value, child.run.id) ||
    structuredValueContainsString(value, child.thread.id) ||
    structuredValueContainsString(value, child.run.canonicalTaskPath);
}

function parentAmbientSubagentToolMessageLikelyReferencesChild(
  message: ChatMessage,
  child: ChatExportChildThreadBundle,
): boolean {
  const metadata = recordValue(message.metadata);
  const toolName = stringValue(metadata?.toolName);
  if (toolName !== "ambient_subagent") return false;
  const rawInput = rawToolInputFromMetadata(metadata);
  if (!rawInput) return false;
  return messageReferencesChildIdOrThread(rawInput.value, child);
}

function actionFromToolInput(value: unknown): string | undefined {
  return stringFieldDeep(value, "action");
}

function waitBarrierIdFromValue(value: unknown): string | undefined {
  const direct = stringFieldDeep(value, "waitBarrierId") ?? stringFieldDeep(value, "barrierId");
  if (direct) return direct;
  const nestedWaitBarrier = recordValue(valueForKeyDeep(value, "waitBarrier"));
  return stringValue(nestedWaitBarrier?.id);
}

function childRunIdsFromValue(value: unknown): string[] {
  const direct = stringArrayFieldDeep(value, "childRunIds");
  const single = stringFieldDeep(value, "childRunId") ?? stringFieldDeep(value, "runId");
  return [...new Set([...direct, ...(single ? [single] : [])])];
}

function stringFieldDeep(value: unknown, key: string): string | undefined {
  const found = valueForKeyDeep(value, key);
  return stringValue(found);
}

function numberFieldDeep(value: unknown, key: string): number | undefined {
  const found = valueForKeyDeep(value, key);
  return numberValue(found);
}

function stringArrayFieldDeep(value: unknown, key: string): string[] {
  const found = valueForKeyDeep(value, key);
  if (Array.isArray(found)) return found.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  const single = stringValue(found);
  return single ? [single] : [];
}

function valueForKeyDeep(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = valueForKeyDeep(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = recordValue(value);
  if (!record) return undefined;
  if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  for (const entry of Object.values(record)) {
    const found = valueForKeyDeep(entry, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function parsePossiblyJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function dedupeProgressReturnEvidence(items: ChatExportProgressReturnEvidence[]): ChatExportProgressReturnEvidence[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = [item.source, item.id, item.waitBarrierId ?? "", item.reason ?? ""].join("\0");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function effectiveRoleEvidence(snapshot: NonNullable<SubagentRunSummary["effectiveRoleSnapshot"]>) {
  return {
    baseRole: snapshot.baseRole,
    patternRole: snapshot.patternRole,
    displayLabel: snapshot.displayLabel,
    roleOverlayIds: snapshot.roleOverlayIds,
    overlayLabels: snapshot.overlays.map((overlay) => overlay.label),
    nonWidening: snapshot.nonWidening,
    ...(snapshot.outputContract ? { outputContract: snapshot.outputContract } : {}),
  };
}

function childEvidenceGaps(input: {
  child: ChatExportChildThreadBundle;
  resultArtifact: ChatExportChildEvidenceSummary["resultArtifact"];
}): string[] {
  const gaps: string[] = [];
  if (!input.child.run.effectiveRoleSnapshot) gaps.push("missing_effective_role_snapshot");
  if (input.child.toolScopeSnapshots.length === 0) gaps.push("missing_tool_scope_snapshot");
  if (input.child.rawMessages.length === 0) gaps.push("missing_full_child_transcript");
  if (input.child.messages.length === 0) gaps.push("missing_visible_child_transcript");
  if (input.child.piSession.content === undefined) gaps.push("missing_child_pi_session");
  if (input.child.waitBarriers.length === 0) gaps.push("missing_wait_barrier");
  if (subagentStatusIsTerminal(input.child.run.status) && !input.resultArtifact.present) gaps.push("missing_result_artifact");
  return gaps;
}

function resultArtifactSummary(value: unknown): ChatExportChildEvidenceSummary["resultArtifact"] {
  const record = recordValue(value);
  if (!record) return { present: value !== undefined };
  const summary = stringValue(record.summary);
  return {
    present: true,
    ...(stringValue(record.status) ? { status: stringValue(record.status) } : {}),
    ...(summary ? { summary: truncateSummary(summary, 320) } : {}),
    ...(typeof record.partial === "boolean" ? { partial: record.partial } : {}),
    ...(stringValue(record.artifactPath) ? { artifactPath: stringValue(record.artifactPath) } : {}),
  };
}

function parentMailboxEventReferencesChild(
  event: SubagentParentMailboxEventSummary,
  child: ChatExportChildThreadBundle,
): boolean {
  if (event.parentRunId !== child.run.parentRunId) return false;
  return structuredValueContainsString(event.payload, child.run.id) ||
    structuredValueContainsString(event.payload, child.thread.id) ||
    structuredValueContainsString(event.payload, child.run.canonicalTaskPath);
}

function isApprovalEventType(type: string): boolean {
  return type.toLowerCase().includes("approval");
}

function subagentStatusIsTerminal(status: SubagentRunSummary["status"]): boolean {
  return ["completed", "failed", "stopped", "cancelled", "timed_out", "detached", "aborted_partial"].includes(status);
}

function structuredValueContainsString(value: unknown, needle: string): boolean {
  if (!needle) return false;
  if (typeof value === "string") return value.includes(needle);
  if (Array.isArray(value)) return value.some((item) => structuredValueContainsString(item, needle));
  const record = recordValue(value);
  if (!record) return false;
  return Object.values(record).some((entry) => structuredValueContainsString(entry, needle));
}

function truncateSummary(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function getChildThreadForExport(
  store: ChatExportDataSource,
  parentThread: ThreadSummary,
  run: SubagentRunSummary,
): ThreadSummary {
  try {
    return store.getThread(run.childThreadId);
  } catch {
    return {
      id: run.childThreadId,
      title: run.canonicalTaskPath || run.roleId || "Sub-agent child thread",
      workspacePath: parentThread.workspacePath,
      kind: "subagent_child",
      parentThreadId: run.parentThreadId,
      parentMessageId: run.parentMessageId,
      parentRunId: run.parentRunId,
      subagentRunId: run.id,
      canonicalTaskPath: run.canonicalTaskPath,
      collapsedByDefault: true,
      childStatus: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      lastMessagePreview: "",
      permissionMode: parentThread.permissionMode,
      collaborationMode: parentThread.collaborationMode,
      model: run.modelRuntimeSnapshot.profile.modelId,
      thinkingLevel: parentThread.thinkingLevel,
    };
  }
}

function childThreadExportDir(run: SubagentRunSummary, index: number): string {
  const ordinal = String(index + 1).padStart(2, "0");
  const label = slugify(run.canonicalTaskPath || run.roleId || run.childThreadId) || "child";
  return `child-threads/${ordinal}-${label}-${run.id.slice(0, 8)}`;
}

function collectVisibleTranscriptArtifacts(messages: ChatMessage[]): ChatExportArtifact[] {
  return messages.flatMap((message) => {
    const metadata = recordValue(message.metadata);
    const toolName = stringValue(metadata?.toolName);
    const toolCallId = stringValue(metadata?.toolCallId);
    const details = recordValue(metadata?.toolResultDetails);
    if (!details) return [];
    const artifacts: ChatExportArtifact[] = [];
    const largeOutputPreview = recordValue(details.largeOutputPreview);
    const items = Array.isArray(largeOutputPreview?.items) ? largeOutputPreview.items : [];
    for (const item of items) {
      const artifact = artifactFromLargeOutputItem(message, item, toolName, toolCallId);
      if (artifact) artifacts.push(artifact);
    }
    const externalModelResponse = externalModelResponseFromDetails(details.externalModelResponse);
    if (externalModelResponse) {
      artifacts.push({
        kind: "external-model-response",
        messageId: message.id,
        ...(toolName ? { toolName } : {}),
        ...(toolCallId ? { toolCallId } : {}),
        label: externalModelResponse.label,
        chars: externalModelResponse.chars,
        previewChars: externalModelResponse.previewChars,
        truncated: externalModelResponse.truncated,
        verbatim: true,
        ...(externalModelResponse.artifactPath ? { artifactPath: externalModelResponse.artifactPath } : {}),
        ...(externalModelResponse.artifactBytes !== undefined ? { artifactBytes: externalModelResponse.artifactBytes } : {}),
        ...(externalModelResponse.model ? { model: externalModelResponse.model } : {}),
        ...(externalModelResponse.provider ? { provider: externalModelResponse.provider } : {}),
        ...(externalModelResponse.usage ? { usage: externalModelResponse.usage } : {}),
      });
    }
    return dedupeArtifacts(artifacts);
  });
}

function artifactFromLargeOutputItem(
  message: ChatMessage,
  value: unknown,
  toolName: string | undefined,
  toolCallId: string | undefined,
): ChatExportArtifact | undefined {
  const item = largeOutputItemFromValue(value);
  if (!item) return undefined;
  const kind = item.artifactKind ?? inferArtifactKind(item.label);
  return {
    kind,
    messageId: message.id,
    ...(toolName ? { toolName } : {}),
    ...(toolCallId ? { toolCallId } : {}),
    label: item.label,
    chars: item.chars,
    previewChars: item.previewChars,
    truncated: item.truncated,
    ...(item.verbatim ? { verbatim: true } : {}),
    ...(item.artifactPath ? { artifactPath: item.artifactPath } : {}),
    ...(item.artifactBytes !== undefined ? { artifactBytes: item.artifactBytes } : {}),
  };
}

function largeOutputItemFromValue(value: unknown): ToolLargeOutputPreviewItem | undefined {
  const record = recordValue(value);
  const label = stringValue(record?.label);
  const chars = numberValue(record?.chars);
  const previewChars = numberValue(record?.previewChars);
  if (!label || chars === undefined || previewChars === undefined) return undefined;
  const kind = artifactKind(record?.artifactKind);
  return {
    label,
    chars,
    previewChars,
    truncated: record?.truncated === true,
    ...(kind ? { artifactKind: kind } : {}),
    ...(record?.verbatim === true ? { verbatim: true } : {}),
    ...(stringValue(record?.artifactPath) ? { artifactPath: stringValue(record?.artifactPath) } : {}),
    ...(numberValue(record?.artifactBytes) !== undefined ? { artifactBytes: numberValue(record?.artifactBytes) } : {}),
  };
}

function externalModelResponseFromDetails(value: unknown): ToolExternalModelResponseArtifact | undefined {
  const record = recordValue(value);
  if (!record || record.kind !== "external-model-response") return undefined;
  const label = stringValue(record.label);
  const chars = numberValue(record.chars);
  const previewChars = numberValue(record.previewChars);
  if (!label || chars === undefined || previewChars === undefined) return undefined;
  const usage = recordValue(record.usage);
  return {
    kind: "external-model-response",
    label,
    verbatim: true,
    chars,
    previewChars,
    truncated: record.truncated === true,
    ...(stringValue(record.text) ? { text: stringValue(record.text) } : {}),
    ...(stringValue(record.artifactPath) ? { artifactPath: stringValue(record.artifactPath) } : {}),
    ...(numberValue(record.artifactBytes) !== undefined ? { artifactBytes: numberValue(record.artifactBytes) } : {}),
    ...(stringValue(record.model) ? { model: stringValue(record.model) } : {}),
    ...(stringValue(record.provider) ? { provider: stringValue(record.provider) } : {}),
    ...(usage ? { usage } : {}),
  };
}

function dedupeArtifacts(artifacts: ChatExportArtifact[]): ChatExportArtifact[] {
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    const key = [artifact.kind, artifact.messageId, artifact.label, artifact.artifactPath ?? "", artifact.chars ?? ""].join("\0");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferArtifactKind(label: string): ChatExportArtifact["kind"] {
  const normalized = label.trim().toLowerCase();
  if (normalized === "stdout") return "stdout";
  if (normalized === "stderr") return "stderr";
  return "tool-output";
}

function artifactKind(value: unknown): ChatExportArtifact["kind"] | undefined {
  const kind = stringValue(value);
  if (kind === "tool-output" || kind === "stdout" || kind === "stderr" || kind === "long-log" || kind === "external-model-response") return kind;
  return undefined;
}

async function readThreadPiSession(
  workspace: WorkspaceState,
  thread: ThreadSummary,
): Promise<{ content?: string; fallbackReason?: string }> {
  const sessionDir = join(workspace.sessionPath, thread.id);
  if (!thread.piSessionFile) {
    return { fallbackReason: "No Pi session file is recorded for this chat." };
  }
  const sessionFile = getRestorablePiSessionFile(thread.piSessionFile, sessionDir);
  if (!sessionFile) {
    return {
      fallbackReason: existsSync(thread.piSessionFile)
        ? "The recorded Pi session file is outside the expected thread session directory."
        : "The recorded Pi session file is missing.",
    };
  }
  try {
    const info = await stat(sessionFile);
    if (!info.isFile()) return { fallbackReason: "The recorded Pi session path is not a file." };
    return { content: await readFile(sessionFile, "utf8") };
  } catch (error) {
    return { fallbackReason: `The recorded Pi session file could not be read: ${errorMessage(error)}` };
  }
}

function renderVisibleTranscriptMarkdown(thread: ThreadSummary, messages: ChatMessage[], artifacts: ChatExportArtifact[]): string {
  const lines = [
    `# ${thread.title || "Chat Export"}`,
    "",
    `Thread: ${thread.id}`,
    `Exported visible messages: ${messages.length}`,
    `Linked tool artifacts: ${artifacts.length}`,
    "",
  ];
  for (const message of messages) {
    lines.push(`## ${message.role} - ${message.createdAt}`, "");
    lines.push(message.content || "(empty)", "");
    if (message.metadata) {
      lines.push("<details><summary>metadata</summary>", "");
      lines.push("```json", JSON.stringify(message.metadata, null, 2), "```", "", "</details>", "");
    }
  }
  if (artifacts.length) {
    lines.push("## artifacts", "");
    for (const artifact of artifacts) {
      lines.push([
        `- ${artifact.kind}: ${artifact.label}`,
        artifact.toolName ? `tool ${artifact.toolName}` : undefined,
        artifact.artifactPath ? `path ${artifact.artifactPath}` : undefined,
        artifact.verbatim ? "verbatim" : undefined,
      ].filter(Boolean).join(" - "));
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function renderFullTranscriptMarkdown(thread: ThreadSummary, messages: ChatMessage[], artifacts: ChatExportArtifact[]): string {
  const lines = [
    `# ${thread.title || "Chat Export"} - Full Transcript`,
    "",
    `Thread: ${thread.id}`,
    `Exported source messages: ${messages.length}`,
    `Linked tool artifacts: ${artifacts.length}`,
    "",
  ];
  for (const message of messages) {
    const metadata = recordValue(message.metadata);
    const kind = stringValue(metadata?.kind);
    const label = kind ? `${message.role} (${kind})` : message.role;
    lines.push(`## ${label} - ${message.createdAt}`, "");
    lines.push(message.content || "(empty)", "");
    if (message.metadata) {
      lines.push("<details><summary>metadata</summary>", "");
      lines.push("```json", JSON.stringify(message.metadata, null, 2), "```", "", "</details>", "");
    }
  }
  if (artifacts.length) {
    lines.push("## artifacts", "");
    for (const artifact of artifacts) {
      lines.push([
        `- ${artifact.kind}: ${artifact.label}`,
        artifact.toolName ? `tool ${artifact.toolName}` : undefined,
        artifact.artifactPath ? `path ${artifact.artifactPath}` : undefined,
        artifact.verbatim ? "verbatim" : undefined,
      ].filter(Boolean).join(" - "));
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function chatExportFileName(thread: ThreadSummary, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const slug = slugify(thread.title || thread.id) || "chat";
  return `ambient-chat-export-${slug}-${stamp}.zip`;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function displayPath(workspace: WorkspaceState, filePath: string): string {
  if (isPathInside(workspace.path, filePath)) return relative(workspace.path, filePath) || ".";
  return basename(filePath);
}

function redactStructuredValue(value: unknown, key = ""): unknown {
  if (typeof value === "string") return isSecretKey(key) ? REDACTED_SECRET : redactSensitiveText(value);
  if (Array.isArray(value)) return value.map((item) => redactStructuredValue(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      typeof entryValue === "string" && isSecretKey(entryKey)
        ? REDACTED_SECRET
        : redactStructuredValue(entryValue, entryKey),
    ]),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
