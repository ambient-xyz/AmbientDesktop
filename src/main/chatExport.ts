import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import JSZip from "jszip";
import type {
  CallableWorkflowTaskSummary,
  ChatExportSource,
  ChatMessage,
  ContextUsageSnapshot,
  SubagentPatternGraphSnapshot,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
  ThreadSummary,
  ToolExternalModelResponseArtifact,
  ToolLargeOutputPreviewItem,
  WorkspaceState,
} from "../shared/types";
import { getRestorablePiSessionFile, isPathInside } from "./sessionPaths";
import { isSecretKey, REDACTED_SECRET, redactSensitiveText, redactSensitiveTextWithMetadata } from "./secretRedaction";
import { compactSubagentToolScopeSnapshot } from "./subagentToolScopeSnapshot";

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

interface ChatExportArtifact {
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

interface ChatExportChildThreadBundle {
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
    resolutionArtifactPresent: boolean;
  }>;
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

export async function createChatExportBundle(
  store: ChatExportDataSource,
  threadId: string,
  options: ChatExportOptions,
): Promise<ChatExportPayload> {
  const now = options.now ?? new Date();
  const createdAt = now.toISOString();
  const workspace = store.getWorkspace();
  const thread = store.getThread(threadId);
  const rawMessages = store.listMessages(thread.id);
  const messages = visibleExportMessages(rawMessages);
  const artifacts = collectVisibleTranscriptArtifacts(messages);
  const contextUsage = store.getLatestContextUsageSnapshot?.(thread.id);
  const piSession = await readThreadPiSession(workspace, thread);
  const childThreadBundles = await collectChildThreadBundles(store, workspace, thread);
  const parentMailboxEvents = store.listSubagentParentMailboxEventsForParentThread?.(thread.id) ?? [];
  const callableWorkflowTasks = store.listCallableWorkflowTasksForParentThread?.(thread.id) ?? [];
  const patternGraphRecords = collectPatternGraphExportRecords(callableWorkflowTasks, childThreadBundles);
  const childEvidenceSummary = buildChildEvidenceSummaryIndex(thread, childThreadBundles, parentMailboxEvents, patternGraphRecords);
  const source: ChatExportSource = piSession.content === undefined ? "visible-chat-fallback" : "pi-session";
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
): Promise<ChatExportChildThreadBundle[]> {
  const runs = store.listSubagentRunsForParentThread?.(parentThread.id) ?? [];
  const bundles: ChatExportChildThreadBundle[] = [];
  for (const [index, run] of runs.entries()) {
    const thread = getChildThreadForExport(store, parentThread, run);
    const rawMessages = store.listMessages(thread.id);
    const messages = visibleExportMessages(rawMessages);
    const artifacts = collectVisibleTranscriptArtifacts(messages);
    const piSession = await readThreadPiSession(workspace, thread);
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
  childThreadBundles: ChatExportChildThreadBundle[],
  parentMailboxEvents: SubagentParentMailboxEventSummary[],
  patternGraphRecords: ChatExportPatternGraphRecord[],
): ChatExportChildEvidenceSummaryIndex {
  const children = childThreadBundles.map((child) =>
    buildChildEvidenceSummary(child, parentMailboxEvents, patternGraphRecords)
  );
  return {
    schemaVersion: 1,
    parentThread: {
      id: parentThread.id,
      title: parentThread.title,
    },
    childThreadCount: children.length,
    approvalBridgeEventCount: children.reduce((sum, child) => sum + child.approvals.parentApprovalBridgeEventCount, 0),
    children,
  };
}

function buildChildEvidenceSummary(
  child: ChatExportChildThreadBundle,
  parentMailboxEvents: SubagentParentMailboxEventSummary[],
  patternGraphRecords: ChatExportPatternGraphRecord[],
): ChatExportChildEvidenceSummary {
  const latestToolScopeSnapshot = child.toolScopeSnapshots.at(-1);
  const childParentApprovalEvents = parentMailboxEvents.filter((event) =>
    isApprovalEventType(event.type) && parentMailboxEventReferencesChild(event, child)
  );
  const resultArtifact = resultArtifactSummary(child.run.resultArtifact);
  const visibleStats = visibleExportStats(child.rawMessages, child.messages, child.artifacts);
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
      resolutionArtifactPresent: barrier.resolutionArtifact !== undefined,
    })),
    resultArtifact,
    patternGraphLinks: patternGraphRecords.flatMap((graph) =>
      graph.childTranscriptLinks.filter((link) =>
        link.childRunId === child.run.id || link.childThreadId === child.thread.id
      )
    ),
    evidenceGaps: childEvidenceGaps({ child, resultArtifact }),
  };
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
