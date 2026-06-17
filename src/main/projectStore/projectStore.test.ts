import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diffWorkflowGraphs } from "../../shared/workflowGraphDiff";
import { workflowTraceRetentionReviewModel } from "../../renderer/src/workflowTraceRetentionUiModel";
import { projectBoardPendingClarificationDecisions, projectBoardPiUpdateReviewQueue } from "../../renderer/src/projectBoardUiModel";
import { projectBoardKickoffDefaultContextFingerprint } from "../../shared/projectBoardKickoffDefaults";
import type { ProjectBoardSynthesisDraft } from "../project-board/projectBoardSynthesis";
import { projectBoardArtifactExportFromSummary } from "../project-board/projectBoardArtifactExport";
import { projectBoardArtifactProjectionFromFiles } from "../project-board/projectBoardArtifactImport";
import {
  GENERATED_REPORT_SOURCE_AUTHORITY_REASON,
  GENERATED_WORKFLOW_SOURCE_AUTHORITY_REASON,
  hashProjectBoardSourceContent,
} from "../project-board/projectBoardSourceIdentity";
import { previewProjectBoardWorkflowRepair, repairProjectBoardWorkflow, updateProjectBoardWorkflowRaw, updateProjectBoardWorkflowSettings } from "../project-board/projectBoardWorkflowBootstrap";
import { readOrchestrationWorkflowReadiness } from "../orchestration/orchestrationWorkflowReadiness";
import { defaultOrchestrationProjectPath, defaultProjectArtifactWorkspacePath, ProjectStore } from "./projectStore";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { ModelRuntimeInstalledProvider } from "../../shared/types";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

function setRawStoreSetting(store: ProjectStore, key: string, value: unknown): void {
  (store as unknown as { settings: () => { setSetting: (key: string, value: unknown) => void } }).settings().setSetting(key, value);
}

describeNative("ProjectStore orchestration tasks (requires Node ABI better-sqlite3 build)", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-store-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("creates local tasks with stable identifiers and normalized fields", () => {
    const task = store.createOrchestrationTask({
      title: " Build the board ",
      description: "  Durable local tasks  ",
      state: "Ready",
      priority: 2,
      labels: ["UI", "ui", " Phase6 "],
      projectPath: "/tmp/ambient-project",
    });

    expect(task).toMatchObject({
      identifier: "LOCAL-1",
      title: "Build the board",
      description: "Durable local tasks",
      state: "ready",
      priority: 2,
      labels: ["ui", "phase6"],
      projectPath: "/tmp/ambient-project",
      sourceKind: "local",
    });
  });

  it("defaults local task project paths to the owning project instead of prepared workspaces", () => {
    const preparedWorkspacePath = join(workspacePath, ".ambient-codex", "orchestration", "workspaces", "LOCAL-1");
    expect(defaultOrchestrationProjectPath(preparedWorkspacePath)).toBe(workspacePath);
  });

  it("defaults long artifact destinations to the owning project instead of internal execution worktrees", () => {
    const executionWorkspacePath = join(workspacePath, ".ambient-codex", "worktrees", "thread-1");
    const preparedWorkspacePath = join(workspacePath, ".ambient-codex", "orchestration", "workspaces", "LOCAL-1");
    expect(defaultProjectArtifactWorkspacePath(executionWorkspacePath)).toBe(workspacePath);
    expect(defaultProjectArtifactWorkspacePath(preparedWorkspacePath)).toBe(workspacePath);
    expect(defaultProjectArtifactWorkspacePath(workspacePath)).toBe(workspacePath);
  });

  it("keeps persisted active work untouched on ordinary workspace open", () => {
    const thread = store.createThread("Background run");
    const assistant = store.addMessage({
      threadId: thread.id,
      role: "assistant",
      content: "",
      metadata: { status: "streaming", runtime: "pi" },
    });
    const run = store.startRun({ threadId: thread.id, assistantMessageId: assistant.id });
    const task = store.createOrchestrationTask({ title: "Background task" });
    const orchestrationRun = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath });
    store.updateOrchestrationRun({ id: orchestrationRun.id, status: "running", threadId: thread.id });

    store.close();
    store = new ProjectStore();
    store.openWorkspace(workspacePath);

    expect(store.listActiveRuns()).toEqual([expect.objectContaining({ id: run.id, status: "starting" })]);
    expect(store.listMessages(thread.id).find((message) => message.id === assistant.id)?.metadata).toMatchObject({ status: "streaming" });
    expect(store.getOrchestrationRun(orchestrationRun.id)).toMatchObject({ status: "running", threadId: thread.id });
  });

  it("persists active run diagnostics", () => {
    const thread = store.createThread("Diagnostic run");
    const assistant = store.addMessage({
      threadId: thread.id,
      role: "assistant",
      content: "",
    });
    const run = store.startRun({ threadId: thread.id, assistantMessageId: assistant.id });

    store.updateRunDiagnostics(run.id, {
      toolArgumentStreams: {
        version: 1,
        lastUpdatedAt: "2026-05-21T10:00:00.000Z",
        active: [],
        completed: [],
      },
    });

    store.close();
    store = new ProjectStore();
    store.openWorkspace(workspacePath);

    expect(store.listActiveRuns()).toEqual([
      expect.objectContaining({
        id: run.id,
        diagnostics: expect.objectContaining({
          toolArgumentStreams: expect.objectContaining({ version: 1 }),
        }),
      }),
    ]);
  });

  it("does not treat completed runs as active even if a late status update arrives", () => {
    const thread = store.createThread("Terminal run");
    const assistant = store.addMessage({
      threadId: thread.id,
      role: "assistant",
      content: "",
      metadata: { status: "streaming", runtime: "pi" },
    });
    const run = store.startRun({ threadId: thread.id, assistantMessageId: assistant.id });

    store.finishRun(run.id, "done");
    const lateUpdate = store.updateRunStatus(run.id, "tool");

    expect(lateUpdate.status).toBe("done");
    expect(lateUpdate.completedAt).toBeTruthy();
    expect(store.listActiveRuns()).toEqual([]);
  });

  it("recovers persisted active work when workspace open recovery is explicit", () => {
    const thread = store.createThread("Restart recovery");
    const assistant = store.addMessage({
      threadId: thread.id,
      role: "assistant",
      content: "",
      metadata: { status: "streaming", runtime: "pi" },
    });
    const run = store.startRun({ threadId: thread.id, assistantMessageId: assistant.id });
    const task = store.createOrchestrationTask({ title: "Restarted task" });
    const orchestrationRun = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath });
    store.updateOrchestrationRun({ id: orchestrationRun.id, status: "running", threadId: thread.id });

    store.close();
    store = new ProjectStore();
    store.openWorkspace(workspacePath, { recoverActiveRuns: true, recoverOrchestrationRuns: true });

    expect(store.listActiveRuns().some((activeRun) => activeRun.id === run.id)).toBe(false);
    expect(store.listMessages(thread.id).find((message) => message.id === assistant.id)?.metadata).toMatchObject({ status: "interrupted" });
    expect(store.getOrchestrationRun(orchestrationRun.id)).toMatchObject({
      status: "stalled",
      error: "Ambient Desktop restarted before this Local Task run finished.",
    });
    expect(store.getOrchestrationTask(task.id).state).toBe("needs_info");
  });

  it("defaults new workspace settings and new threads to workspace permission mode", () => {
    expect(store.getDefaultSettings().permissionMode).toBe("workspace");
    expect(store.findReusableEmptyThread()?.permissionMode).toBe("workspace");
    expect(store.createThread("Fresh task").permissionMode).toBe("workspace");
  });

  it("can create a thread with explicit initial runtime settings", () => {
    const thread = store.createThread("Builder flow", store.getWorkspace().path, {
      permissionMode: "full-access",
      collaborationMode: "agent",
      model: AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "high",
    });

    expect(thread).toMatchObject({
      permissionMode: "full-access",
      collaborationMode: "agent",
      model: AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "high",
    });
    expect(store.getDefaultSettings().permissionMode).toBe("workspace");
  });

  it("persists aggressive retry runtime settings with safe defaults", () => {
    expect(store.getDefaultSettings().modelRuntime).toEqual({
      aggressiveRetries: true,
      providerPreStreamTimeoutMs: 45_000,
      providerStreamIdleTimeoutMs: 30_000,
      installedProviders: [],
    });
    expect(store.getModelRuntimeSettings()).toEqual({
      aggressiveRetries: true,
      providerPreStreamTimeoutMs: 45_000,
      providerStreamIdleTimeoutMs: 30_000,
      installedProviders: [],
    });

    expect(store.setModelRuntimeSettings({ aggressiveRetries: false, providerPreStreamTimeoutMs: 60_000, providerStreamIdleTimeoutMs: 120_000 })).toEqual({
      aggressiveRetries: false,
      providerPreStreamTimeoutMs: 60_000,
      providerStreamIdleTimeoutMs: 120_000,
      installedProviders: [],
    });
    store.close();
    store.openWorkspace(workspacePath);

    expect(store.getModelRuntimeSettings()).toEqual({
      aggressiveRetries: false,
      providerPreStreamTimeoutMs: 60_000,
      providerStreamIdleTimeoutMs: 120_000,
      installedProviders: [],
    });

    setRawStoreSetting(store, "modelRuntime", {
      aggressiveRetries: "yes",
      providerPreStreamTimeoutMs: 1,
      providerStreamIdleTimeoutMs: 999_999,
    });

    expect(store.getModelRuntimeSettings()).toEqual({
      aggressiveRetries: true,
      providerPreStreamTimeoutMs: 5_000,
      providerStreamIdleTimeoutMs: 600_000,
      installedProviders: [],
    });
  });

  it("persists Settings-installed model providers and feeds the runtime catalog without secrets", () => {
    const installed = installedProvider({
      providerId: "customer-router",
      modelId: "CUSTOM/Router Model v2",
    });

    store.setModelRuntimeSettings({ installedProviders: [installed] });
    store.close();
    store.openWorkspace(workspacePath);

    const settings = store.getModelRuntimeSettings();
    const catalog = store.getModelRuntimeCatalog("2026-06-06T01:00:00.000Z");
    const serializedSettings = JSON.stringify(settings);

    expect(settings.installedProviders).toEqual([
      expect.objectContaining({
        provider: expect.objectContaining({ id: "customer-router" }),
        profile: expect.objectContaining({
          providerId: "customer-router",
          modelId: "CUSTOM/Router Model v2",
        }),
      }),
    ]);
    expect(serializedSettings).not.toContain("sk-test-secret");
    expect(catalog.providers).toContainEqual(expect.objectContaining({
      id: "customer-router",
      label: "Customer Router",
    }));
    expect(catalog.profiles).toContainEqual(expect.objectContaining({
      profileId: "customer-router:CUSTOM/Router Model v2",
      modelId: "CUSTOM/Router Model v2",
      selectableAsMain: true,
      selectableAsSubagent: true,
    }));
    expect(catalog.selectableMainModelOptions.map((option) => option.id)).toEqual(expect.arrayContaining([
      AMBIENT_DEFAULT_MODEL,
      "CUSTOM/Router Model v2",
    ]));
    expect(catalog.selectableSubagentProfiles.map((profile) => profile.modelId)).toEqual(expect.arrayContaining([
      AMBIENT_DEFAULT_MODEL,
      "CUSTOM/Router Model v2",
    ]));
  });

  it("migrates legacy full-access defaults without changing active work threads", () => {
    const starter = store.findReusableEmptyThread();
    const workThread = store.createThread("Needs broad tools");
    store.updateThreadSettings(starter!.id, { permissionMode: "full-access" });
    store.updateThreadSettings(workThread.id, { permissionMode: "full-access" });
    setRawStoreSetting(store, "permissionMode", "full-access");

    store.close();
    store.openWorkspace(workspacePath);

    expect(store.getDefaultSettings().permissionMode).toBe("workspace");
    expect(store.listThreads().map((thread) => thread.id)).not.toContain(starter!.id);
    expect(store.getThread(workThread.id).permissionMode).toBe("full-access");
    expect(store.createThread("Post-migration task").permissionMode).toBe("workspace");
  });

  it("migrates a legacy empty starter thread to workspace permission mode", () => {
    const starter = store.findReusableEmptyThread();
    store.updateThreadSettings(starter!.id, { permissionMode: "full-access" });
    setRawStoreSetting(store, "permissionMode", "full-access");

    store.close();
    store.openWorkspace(workspacePath);

    expect(store.findReusableEmptyThread()?.id).toBe(starter!.id);
    expect(store.findReusableEmptyThread()?.permissionMode).toBe("workspace");
    expect(store.createThread("Post-migration task").permissionMode).toBe("workspace");
  });

  it("deletes messages after a retry target and restores the thread preview", () => {
    const thread = store.createThread();
    const user = store.addMessage({ threadId: thread.id, role: "user", content: "Try this request." });
    store.addMessage({ threadId: thread.id, role: "assistant", content: "The Pi/Ambient runtime returned an error.", metadata: { status: "error" } });

    const remaining = store.deleteMessagesAfter(thread.id, user.id);

    expect(remaining.map((message) => message.id)).toEqual([user.id]);
    expect(store.listMessages(thread.id).map((message) => message.id)).toEqual([user.id]);
    expect(store.getThread(thread.id).lastMessagePreview).toBe("Try this request.");
  });

  it("persists voice state in a message-keyed side table", () => {
    const thread = store.createThread();
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "Ready to speak." });

    const queued = store.setMessageVoiceState({
      messageId: message.id,
      threadId: thread.id,
      status: "queued",
      source: "assistant-text",
      sourceMessageId: message.id,
      providerCapabilityId: "voice:fixture",
      providerId: "fixture",
      spokenText: "Ready to speak.",
      spokenTextChars: 15,
      sourceTextChars: 15,
    });

    expect(queued).toMatchObject({
      messageId: message.id,
      status: "queued",
      source: "assistant-text",
      providerCapabilityId: "voice:fixture",
      spokenTextChars: 15,
    });

    const ready = store.setMessageVoiceState({
      ...queued,
      status: "ready",
      audioPath: ".ambient/voice/thread/message.wav",
      mediaUrl: "ambient-media://workspace/token/message.wav",
      mimeType: "audio/wav",
      durationMs: 1200,
    });

    expect(ready.createdAt).toBe(queued.createdAt);
    expect(ready.updatedAt >= queued.updatedAt).toBe(true);
    expect(store.getMessageVoiceState(message.id)).toMatchObject({
      status: "ready",
      audioPath: ".ambient/voice/thread/message.wav",
      mimeType: "audio/wav",
    });
    expect(store.listMessageVoiceStates(thread.id)).toHaveLength(1);

    store.close();
    store.openWorkspace(workspacePath);

    expect(store.listMessageVoiceStates(thread.id)[0]).toMatchObject({
      messageId: message.id,
      status: "ready",
      providerId: "fixture",
      durationMs: 1200,
    });
  });

  it("clears voice artifact metadata without deleting the message voice row", () => {
    const thread = store.createThread();
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "Ready to clear." });
    const ready = store.setMessageVoiceState({
      messageId: message.id,
      threadId: thread.id,
      status: "ready",
      source: "summary",
      sourceMessageId: message.id,
      providerCapabilityId: "voice:fixture",
      providerId: "fixture",
      voiceId: "default",
      spokenText: "Ready to clear.",
      spokenTextChars: 15,
      sourceTextChars: 120,
      audioPath: ".ambient/voice/thread/message.wav",
      mediaUrl: "ambient-media://workspace/token/message.wav",
      mimeType: "audio/wav",
      durationMs: 1200,
    });

    const cleared = store.clearMessageVoiceArtifact(ready.messageId);

    expect(cleared).toMatchObject({
      messageId: message.id,
      status: "canceled",
      source: "summary",
      providerCapabilityId: "voice:fixture",
      spokenText: "Ready to clear.",
      spokenTextChars: 15,
      sourceTextChars: 120,
      lastAudioPath: ".ambient/voice/thread/message.wav",
      error: "Voice artifact cleared.",
    });
    expect(cleared.audioPath).toBeUndefined();
    expect(cleared.lastAudioPath).toBe(".ambient/voice/thread/message.wav");
    expect(cleared.mediaUrl).toBeUndefined();
    expect(cleared.mimeType).toBeUndefined();
    expect(cleared.durationMs).toBeUndefined();
    expect(store.listMessages(thread.id)[0]).toMatchObject({ id: message.id, content: "Ready to clear." });
  });

  it("lists tasks in dispatch-friendly priority order", () => {
    const later = store.createOrchestrationTask({ title: "Later" });
    const urgent = store.createOrchestrationTask({ title: "Urgent", priority: 1 });

    expect(store.listOrchestrationTasks().map((task) => task.id)).toEqual([urgent.id, later.id]);
  });

  it("updates task state and exposes board data", () => {
    const task = store.createOrchestrationTask({ title: "Review me" });

    store.updateOrchestrationTask({ id: task.id, state: "In Progress", priority: null });
    const board = store.listOrchestrationBoard();

    expect(board.runs).toEqual([]);
    expect(board.tasks[0]).toMatchObject({ id: task.id, state: "in_progress" });
  });

  it("organizes automation threads into a home folder and custom folders", () => {
    const task = store.createOrchestrationTask({ title: "Ship automation", priority: 1 });
    let folders = store.listAutomationFolders();
    const home = folders.find((folder) => folder.kind === "home");
    const taskThread = home?.threads.find((thread) => thread.sourceId === task.id);

    expect(home?.name).toBe("Home");
    expect(taskThread).toMatchObject({
      kind: "orchestration_task",
      title: "Ship automation",
      status: "todo",
      badges: expect.arrayContaining(["LOCAL-1", "Priority 1"]),
    });

    folders = store.createAutomationFolder({ name: "Nightly" });
    const customFolder = folders.find((folder) => folder.name === "Nightly");
    expect(customFolder).toBeTruthy();

    folders = store.moveAutomationThread({ threadId: taskThread!.id, folderId: customFolder!.id });
    expect(folders.find((folder) => folder.kind === "home")?.threads.map((thread) => thread.id)).not.toContain(taskThread!.id);
    expect(folders.find((folder) => folder.id === customFolder!.id)?.threads.map((thread) => thread.id)).toContain(taskThread!.id);

    const run = store.recordPreparedOrchestrationRun({
      taskId: task.id,
      workspacePath: join(workspacePath, ".ambient-codex", "worktrees", task.identifier),
    });
    const runThread = store.createThread(`${task.identifier}: ${task.title}`, run.workspacePath);
    store.updateOrchestrationRun({ id: run.id, status: "running", threadId: runThread.id });

    expect(store.listAutomationThreadChatIds()).toContain(runThread.id);
    expect(store.listAutomationFolders().find((folder) => folder.id === customFolder!.id)?.threads[0].latestRun).toMatchObject({
      id: run.id,
      status: "running",
      threadId: runThread.id,
    });
  });

  it("organizes workflow agent threads separately from automation folders", () => {
    const artifact = store.createWorkflowArtifact({
      title: "Inbox workflow",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Classify messages", summary: "Read messages and produce a report." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "inbox", "main.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "inbox", "state.json"),
    });
    expect(artifact.workflowThreadId).toBeTruthy();

    let folders = store.listWorkflowAgentFolders();
    const home = folders.find((folder) => folder.kind === "home");
    const workflowThread = home?.threads.find((thread) => thread.activeArtifactId === artifact.id);

    expect(home?.name).toBe("Home");
    expect(workflowThread).toMatchObject({
      title: "Inbox workflow",
      phase: "ready_for_review",
      preview: "Read messages and produce a report.",
      badges: expect.arrayContaining(["Ready For Review", "Production traces", "read only"]),
    });
    expect(workflowThread?.chatThreadId).toBeTruthy();
    expect(store.listWorkflowAgentThreadChatIds()).toContain(workflowThread!.chatThreadId);
    expect(store.getThread(workflowThread!.chatThreadId!)).toMatchObject({
      title: "Workflow: Inbox workflow",
      workspacePath,
    });

    const graph = store.createWorkflowGraphSnapshot({
      workflowThreadId: artifact.workflowThreadId!,
      source: "compile",
      summary: "Compiled graph",
      nodes: [{ id: "request", type: "request", label: "Request" }],
      edges: [],
      artifactPath: join(workspacePath, ".ambient-codex", "workflows", "inbox", "graph.json"),
    });
    expect(store.listWorkflowGraphSnapshots(artifact.workflowThreadId!)[0]).toMatchObject({
      id: graph.id,
      version: 1,
      source: "compile",
      nodes: [{ id: "request", type: "request", label: "Request" }],
    });
    const version = store.createWorkflowVersion({
      workflowThreadId: artifact.workflowThreadId!,
      artifactId: artifact.id,
      graphSnapshotId: graph.id,
      sourcePath: artifact.sourcePath,
      repoPath: dirname(artifact.sourcePath),
      gitCommitHash: "abc123",
      status: "ready_for_review",
      createdBy: "compiler",
    });
    expect(store.listWorkflowVersions(artifact.workflowThreadId!)[0]).toMatchObject({
      id: version.id,
      version: 1,
      graphSnapshotId: graph.id,
      gitCommitHash: "abc123",
      createdBy: "compiler",
    });

    folders = store.createWorkflowAgentFolder({ name: "Mail" });
    const customFolder = folders.find((folder) => folder.name === "Mail");
    folders = store.moveWorkflowAgentThread({ threadId: artifact.workflowThreadId!, folderId: customFolder!.id });

    expect(folders.find((folder) => folder.kind === "home")?.threads.map((thread) => thread.id)).not.toContain(artifact.workflowThreadId);
    expect(folders.find((folder) => folder.id === customFolder!.id)?.threads[0]).toMatchObject({
      id: artifact.workflowThreadId,
      activeGraphSnapshotId: graph.id,
      latestVersion: expect.objectContaining({ id: version.id, version: 1 }),
      graph: expect.objectContaining({ summary: "Compiled graph" }),
    });
    expect(store.listAutomationFolders().flatMap((folder) => folder.threads).some((thread) => thread.sourceId === artifact.id)).toBe(true);
  });

  it("classifies stale workflow runs as attention instead of active sidebar work", () => {
    const artifact = store.createWorkflowArtifact({
      title: "Stale workflow",
      status: "approved",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Recover from a stale run.", summary: "Run liveness should survive refresh." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "stale", "main.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "stale", "state.json"),
    });
    const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
    store.appendWorkflowRunEvent({
      runId: run.id,
      type: "ambient.call.error",
      message: "stream stalled",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const workflowThread = store
      .listWorkflowAgentFolders()
      .flatMap((folder) => folder.threads)
      .find((thread) => thread.activeArtifactId === artifact.id);
    const automationThread = store
      .listAutomationFolders()
      .flatMap((folder) => folder.threads)
      .find((thread) => thread.sourceId === artifact.id);

    expect(workflowThread).toMatchObject({
      phase: "failed",
      status: "stale",
      latestRun: expect.objectContaining({ id: run.id, status: "stale" }),
      badges: expect.arrayContaining(["Failed", "Run stale"]),
    });
    expect(automationThread).toMatchObject({
      status: "stale",
      latestRun: expect.objectContaining({ id: run.id, status: "stale" }),
      badges: expect.arrayContaining(["Run stale"]),
    });
  });

  it("recovers workflow thread graphs from latest versions when the active graph pointer is missing", () => {
    const artifact = store.createWorkflowArtifact({
      title: "Pool research workflow",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Research public pools", summary: "Find family-friendly pools and produce a report." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "pools", "main.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "pools", "state.json"),
    });
    const workflowThreadId = artifact.workflowThreadId!;
    const graph = store.createWorkflowGraphSnapshot({
      workflowThreadId,
      source: "compile",
      summary: "Research then format pool results.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        { id: "format", type: "deterministic_step", label: "Format report" },
      ],
      edges: [{ id: "request-format", source: "request", target: "format", type: "data_flow" }],
    });
    store.createWorkflowVersion({
      workflowThreadId,
      artifactId: artifact.id,
      graphSnapshotId: graph.id,
      sourcePath: artifact.sourcePath,
      repoPath: dirname(artifact.sourcePath),
      status: "ready_for_review",
      createdBy: "compiler",
    });
    (store as unknown as { requireDb: () => { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } } })
      .requireDb()
      .prepare("UPDATE workflow_agent_threads SET active_graph_snapshot_id = NULL WHERE id = ?")
      .run(workflowThreadId);

    const recovered = store.getWorkflowAgentThreadSummary(workflowThreadId);

    expect(recovered.activeGraphSnapshotId).toBe(graph.id);
    expect(recovered.graph).toMatchObject({
      id: graph.id,
      summary: "Research then format pool results.",
      nodes: expect.arrayContaining([expect.objectContaining({ id: "format", label: "Format report" })]),
    });
  });

  it("derives a review graph for unversioned workflow artifacts without stored graph snapshots", () => {
    const artifact = store.createWorkflowArtifact({
      title: "Direct compile workflow",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Summarize local notes", summary: "Read notes and produce a concise summary." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "direct", "main.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "direct", "state.json"),
    });

    const thread = store.getWorkflowAgentThreadSummary(artifact.workflowThreadId!);

    expect(thread.latestVersion).toBeUndefined();
    expect(thread.activeGraphSnapshotId).toBe(`artifact-derived:${artifact.id}`);
    expect(thread.graph).toMatchObject({
      id: `artifact-derived:${artifact.id}`,
      version: 0,
      summary: "Read notes and produce a concise summary.",
      nodes: expect.arrayContaining([
        expect.objectContaining({ id: "request", type: "request" }),
        expect.objectContaining({ id: "ambient-model", type: "model_call" }),
      ]),
    });
  });

  it("persists workflow discovery questions and answers on workflow threads", () => {
    const thread = store.createWorkflowAgentThreadSummary({
      initialRequest: "Build a weekly markdown summary workflow.",
      phase: "discovery",
    });
    const question = store.createWorkflowDiscoveryQuestion({
      workflowThreadId: thread.id,
      category: "scope",
      context: "Request: Build a weekly markdown summary workflow.",
      question: "What should trigger this workflow?",
      choices: [{ id: "manual", label: "Manual", description: "Run on demand.", recommended: true }],
      allowFreeform: true,
      graphImpact: "Defines the trigger node.",
      capabilitySearch: {
        query: "Build a weekly markdown summary workflow.",
        policy: "Safe metadata only.",
        totalCandidateCount: 1,
        omittedCandidateCount: 0,
        results: [
          {
            id: "base-directory",
            kind: "base_directory",
            label: "Base directory files",
            description: "Safe file metadata can be considered.",
            status: "requires_grant",
            recommendation: "available",
            reason: "The request mentions local files.",
            matchedTerms: ["file"],
            permissionCapability: "file_content",
            targetLabel: "workflow base directory file contents",
          },
        ],
      },
      capabilityDescriptions: [
        {
          id: "base-directory",
          kind: "base_directory",
          label: "Base directory files",
          description: "Safe file metadata can be considered.",
          status: "requires_grant",
          recommendation: "available",
          policy: "Base-directory search exposes safe file metadata only.",
          permissionCapability: "file_content",
          targetLabel: "workflow base directory file contents",
          mutationClass: "read_only",
          inputShapeSummary: "1 safe metadata candidate; content is not included by search.",
          outputShapeSummary: "Runtime file reads return bounded previews and persisted full artifacts.",
          availabilitySummary: "1 file metadata candidate scanned.",
          examples: ["Use when the workflow should inspect files already present in the workflow base directory."],
          warnings: ["Search/describe does not read file contents."],
        },
      ],
      accessRequests: [
        {
          id: "access-notes",
          capability: "file_content",
          actionKind: "file_content_read",
          targetKind: "path",
          targetLabel: "notes.md",
          targetHash: "hash-notes",
          reason: "File contents would improve discovery.",
          auditDetail: "file_content: notes.md",
          risk: "outside-workspace",
          reusableScopes: ["workflow_thread", "project", "workspace"],
          recommendedResponse: "always_workflow",
          status: "pending",
        },
      ],
      cacheCheckpoint: {
        id: "workflow-cache-discovery-test",
        stage: "discovery",
        workflowThreadId: thread.id,
        stablePrefixHash: "stable-hash",
        stablePrefixChars: 24,
        stablePrefixEstimatedTokens: 6,
        mutableSuffixHash: "mutable-hash",
        mutableSuffixChars: 32,
        mutableSuffixEstimatedTokens: 8,
        requestHash: "request-hash",
        requestEstimatedTokens: 14,
        boundaryLabel: "Discovery boundary",
        createdAt: "2026-04-30T00:00:00.000Z",
      },
      graphPatch: {
        summary: "Manual trigger to markdown output.",
        upsertNodes: [{ id: "markdown-output", type: "output", label: "Markdown output" }],
        upsertEdges: [{ id: "scope-to-markdown-output", source: "scope", target: "markdown-output", type: "data_flow" }],
      },
    });

    expect(store.getWorkflowAgentThreadSummary(thread.id).discoveryQuestions).toEqual([
      expect.objectContaining({
        id: question.id,
        category: "scope",
        choices: [expect.objectContaining({ id: "manual", recommended: true })],
        capabilitySearch: expect.objectContaining({
          query: "Build a weekly markdown summary workflow.",
          results: [expect.objectContaining({ id: "base-directory", kind: "base_directory" })],
        }),
        capabilityDescriptions: [
          expect.objectContaining({
            id: "base-directory",
            kind: "base_directory",
            mutationClass: "read_only",
            permissionCapability: "file_content",
          }),
        ],
        cacheCheckpoint: expect.objectContaining({
          id: "workflow-cache-discovery-test",
          stage: "discovery",
          workflowThreadId: thread.id,
        }),
        graphPatch: expect.objectContaining({
          summary: "Manual trigger to markdown output.",
          upsertNodes: [expect.objectContaining({ id: "markdown-output" })],
        }),
        accessRequests: [
          expect.objectContaining({
            id: "access-notes",
            capability: "file_content",
            status: "pending",
          }),
        ],
      }),
    ]);

    const accessUpdated = store.updateWorkflowDiscoveryAccessRequests({
      questionId: question.id,
      accessRequests: [{ ...question.accessRequests![0], status: "allowed", response: "always_workflow", grantId: "grant-notes" }],
    });
    expect(accessUpdated.accessRequests?.[0]).toMatchObject({
      status: "allowed",
      response: "always_workflow",
      grantId: "grant-notes",
    });

    const answered = store.answerWorkflowDiscoveryQuestion({ questionId: question.id, choiceId: "manual", freeform: "Weekly on Mondays later." });
    expect(answered.answer).toMatchObject({ choiceId: "manual", freeform: "Weekly on Mondays later." });
    expect(store.listWorkflowDiscoveryQuestions(thread.id)[0].answeredAt).toEqual(expect.any(String));
  });

  it("persists workflow revision proposals linked to versions and graph diffs", () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Inbox workflow",
      initialRequest: "Classify incoming messages.",
    });
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Inbox workflow",
      status: "approved",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only", maxModelCalls: 2 },
      spec: { goal: "Classify incoming messages." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "inbox", "main.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "inbox", "state.json"),
    });
    const currentGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Classify messages.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        { id: "model", type: "model_call", label: "Classify", modelRole: "Categorize", retryPolicy: "same input" },
      ],
      edges: [{ id: "request-model", source: "request", target: "model", type: "control_flow" }],
    });
    const version = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: artifact.id,
      graphSnapshotId: currentGraph.id,
      sourcePath: artifact.sourcePath,
      repoPath: dirname(artifact.sourcePath),
      status: "approved",
      createdBy: "compiler",
    });
    const proposedGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "revision",
      summary: "Classify messages and review low confidence results.",
      nodes: [
        ...currentGraph.nodes,
        { id: "review", type: "review_gate", label: "Review low confidence", reviewPolicy: "requiresReviewBelowConfidence=0.7" },
      ],
      edges: [
        currentGraph.edges[0],
        { id: "model-review", source: "model", target: "review", type: "condition", label: "low confidence" },
      ],
    });
    const graphDiff = diffWorkflowGraphs({
      current: currentGraph,
      proposed: proposedGraph,
      currentManifest: artifact.manifest,
      proposedManifest: { ...artifact.manifest, mutationPolicy: "staged_until_approved", requiresReviewBelowConfidence: 0.7 },
    });

    const revision = store.createWorkflowRevision({
      workflowThreadId: thread.id,
      baseVersionId: version.id,
      baseArtifactId: artifact.id,
      requestedChange: " Add review for low-confidence classifications. ",
      proposedGraphSnapshotId: proposedGraph.id,
      graphDiff,
      sourceDiff: "diff --git a/main.ts b/main.ts\n+review gate\n",
      status: "proposed",
    });

    expect(revision).toMatchObject({
      workflowThreadId: thread.id,
      baseVersionId: version.id,
      baseArtifactId: artifact.id,
      requestedChange: "Add review for low-confidence classifications.",
      proposedGraphSnapshotId: proposedGraph.id,
      sourceDiff: expect.stringContaining("+review gate"),
      status: "proposed",
    });
    expect(revision.graphDiff).toMatchObject({
      addedNodes: [expect.objectContaining({ id: "review" })],
      manifest: expect.objectContaining({
        fieldChanges: expect.arrayContaining([expect.objectContaining({ field: "mutationPolicy" })]),
      }),
    });
    expect(store.getWorkflowAgentThreadSummary(thread.id).phase).toBe("revision");
    expect(store.listWorkflowRevisions(thread.id)).toEqual([expect.objectContaining({ id: revision.id })]);

    const updated = store.updateWorkflowRevision({
      id: revision.id,
      status: "applied",
      sourceDiff: null,
    });
    expect(updated).toMatchObject({ id: revision.id, status: "applied", sourceDiff: undefined });

    const otherThread = store.createWorkflowAgentThreadSummary({ initialRequest: "Other workflow." });
    const otherGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: otherThread.id,
      source: "revision",
      summary: "Other graph",
      nodes: [{ id: "request", type: "request", label: "Request" }],
      edges: [],
    });
    expect(() =>
      store.createWorkflowRevision({
        workflowThreadId: thread.id,
        requestedChange: "Use the wrong graph.",
        proposedGraphSnapshotId: otherGraph.id,
      }),
    ).toThrow(/does not belong to workflow thread/i);
  });

  it("resolves workflow revision proposals by activating proposed versions or restoring the base", () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Revision workflow",
      initialRequest: "Summarize local notes.",
    });
    const baseArtifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Revision workflow",
      status: "approved",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Summarize local notes." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "revision", "base.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "revision", "base-state.json"),
    });
    const baseGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Summarize notes.",
      nodes: [{ id: "summarize", type: "model_call", label: "Summarize" }],
      edges: [],
    });
    const baseVersion = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: baseArtifact.id,
      graphSnapshotId: baseGraph.id,
      sourcePath: baseArtifact.sourcePath,
      repoPath: dirname(baseArtifact.sourcePath),
      status: "approved",
      createdBy: "compiler",
    });

    const proposedArtifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Revision workflow with review",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only", requiresReviewBelowConfidence: 0.7 },
      spec: { goal: "Summarize local notes.", summary: "Adds review for uncertain summaries." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "revision", "proposed.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "revision", "proposed-state.json"),
    });
    const proposedGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "revision",
      summary: "Summarize notes with review.",
      nodes: [
        ...baseGraph.nodes,
        { id: "review", type: "review_gate", label: "Review uncertain summaries" },
      ],
      edges: [{ id: "summarize-review", source: "summarize", target: "review", type: "condition", label: "low confidence" }],
    });
    const proposedVersion = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: proposedArtifact.id,
      graphSnapshotId: proposedGraph.id,
      sourcePath: proposedArtifact.sourcePath,
      repoPath: dirname(proposedArtifact.sourcePath),
      status: "ready_for_review",
      createdBy: "ambient_debug_rewrite",
    });
    const revision = store.createWorkflowRevision({
      workflowThreadId: thread.id,
      baseVersionId: baseVersion.id,
      baseArtifactId: baseArtifact.id,
      requestedChange: "Add review for uncertain summaries.",
      proposedGraphSnapshotId: proposedGraph.id,
      status: "proposed",
    });

    expect(revision).toMatchObject({
      proposedVersionId: proposedVersion.id,
      proposedArtifactId: proposedArtifact.id,
    });
    const applied = store.resolveWorkflowRevision({ id: revision.id, decision: "applied" });
    expect(applied.status).toBe("applied");
    expect(store.getWorkflowAgentThreadSummary(thread.id)).toMatchObject({
      activeArtifactId: proposedArtifact.id,
      activeGraphSnapshotId: proposedGraph.id,
      phase: "ready_for_review",
    });

    const rejectedArtifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Rejected revision workflow",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Summarize local notes.", summary: "Experimental rejected change." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "revision", "rejected.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "revision", "rejected-state.json"),
    });
    const rejectedGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "revision",
      summary: "Experimental rejected graph.",
      nodes: [...proposedGraph.nodes, { id: "archive", type: "output", label: "Archive" }],
      edges: proposedGraph.edges,
    });
    store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: rejectedArtifact.id,
      graphSnapshotId: rejectedGraph.id,
      sourcePath: rejectedArtifact.sourcePath,
      repoPath: dirname(rejectedArtifact.sourcePath),
      status: "ready_for_review",
      createdBy: "ambient_debug_rewrite",
    });
    const rejectedRevision = store.createWorkflowRevision({
      workflowThreadId: thread.id,
      baseVersionId: proposedVersion.id,
      baseArtifactId: proposedArtifact.id,
      requestedChange: "Try an archive step.",
      proposedGraphSnapshotId: rejectedGraph.id,
      status: "proposed",
    });

    const rejected = store.resolveWorkflowRevision({ id: rejectedRevision.id, decision: "rejected" });
    expect(rejected.status).toBe("rejected");
    expect(store.getWorkflowAgentThreadSummary(thread.id)).toMatchObject({
      activeArtifactId: proposedArtifact.id,
      activeGraphSnapshotId: proposedGraph.id,
      phase: "ready_for_review",
    });
  });

  it("persists automation schedule records with target labels and next-run timestamps", () => {
    const task = store.createOrchestrationTask({ title: "Scheduled task", priority: 1 });

    let schedules = store.createAutomationSchedule({
      targetKind: "local_task",
      targetId: task.id,
      preset: "advanced",
      cronExpression: "15 8 * * 1",
      timezone: "America/Phoenix",
      enabled: true,
    });

    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({
      targetKind: "local_task",
      targetId: task.id,
      targetLabel: "LOCAL-1: Scheduled task",
      preset: "advanced",
      cronExpression: "15 8 * * 1",
      timezone: "America/Phoenix",
      enabled: true,
      skipIfActive: true,
      concurrencyPolicy: "skip_if_active",
    });
    expect(schedules[0].nextRunAt).toBeTruthy();

    store.close();
    store.openWorkspace(workspacePath);
    schedules = store.listAutomationSchedules();

    expect(schedules[0]).toMatchObject({
      targetKind: "local_task",
      targetLabel: "LOCAL-1: Scheduled task",
      preset: "advanced",
      cronExpression: "15 8 * * 1",
    });

    const thread = store.createWorkflowAgentThreadSummary({
      title: "Weekly briefing",
      initialRequest: "Build a weekly briefing workflow.",
    });
    expect(() =>
      store.createAutomationSchedule({
        targetKind: "workflow_thread",
        targetId: thread.id,
        preset: "daily",
        timezone: "America/Phoenix",
      }),
    ).toThrow("Workflow Agent has no approved version to schedule.");

    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Weekly briefing",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Build a weekly briefing workflow." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "weekly", "main.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "weekly", "state.json"),
    });
    const version = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: artifact.id,
      sourcePath: artifact.sourcePath,
      repoPath: dirname(artifact.sourcePath),
      status: "approved",
      createdBy: "compiler",
    });
    schedules = store.createAutomationSchedule({
      targetKind: "workflow_thread",
      targetId: thread.id,
      preset: "daily",
      timezone: "America/Phoenix",
    });
    expect(schedules[0]).toMatchObject({
      targetKind: "workflow_thread",
      targetId: thread.id,
      targetLabel: "Weekly briefing (latest approved)",
      preset: "daily",
    });
    schedules = store.createAutomationSchedule({
      targetKind: "workflow_version",
      targetId: version.id,
      preset: "weekly",
      timezone: "America/Phoenix",
    });
    expect(schedules[0]).toMatchObject({
      targetKind: "workflow_version",
      targetId: version.id,
      targetLabel: "Weekly briefing v1 (pinned)",
      preset: "weekly",
    });

    const recordingThread = store.createWorkflowRecordingThread({
      goal: "Summarize weekly customer emails.",
      workspacePath,
    });
    store.addMessage({ threadId: recordingThread.id, role: "user", content: "Summarize this week's customer emails." });
    store.addMessage({
      threadId: recordingThread.id,
      role: "tool",
      content: "gmail.search completed\nFound customer email threads.",
      metadata: { toolName: "gmail.search", toolCallId: "gmail-1", status: "done" },
    });
    store.stopWorkflowRecording(recordingThread.id);
    store.updateWorkflowRecordingReviewDraft(recordingThread.id, {
      intent: "Summarize weekly customer emails.",
      inputs: ["Week window", "Customer mailbox scope"],
      successfulExamples: [{ toolName: "gmail.search", inputPreview: '{"query":"newer_than:7d"}', resultPreview: "Customer email threads." }],
      doNot: [],
      validation: ["Final answer groups customer themes with source notes."],
      outputShape: ["Theme summary with representative customer threads."],
    });
    const savedPlaybook = store.confirmWorkflowRecordingReview(recordingThread.id).review!.savedPlaybook!;
    schedules = store.createAutomationSchedule({
      targetKind: "workflow_playbook",
      targetId: savedPlaybook.id,
      preset: "daily",
      timezone: "America/Phoenix",
    });
    expect(schedules[0]).toMatchObject({
      targetKind: "workflow_playbook",
      targetId: savedPlaybook.id,
      targetLabel: "Summarize weekly customer emails. (current v1)",
      createdTargetVersionId: "1",
      dedicatedThreadId: expect.any(String),
      preset: "daily",
    });
    expect(store.getThread(schedules[0].dedicatedThreadId!)).toMatchObject({
      title: "Scheduled: Summarize weekly customer emails. (current)",
    });

    const previewArtifact = store.createWorkflowArtifact({
      title: "Preview schedule target",
      status: "ready_for_preview",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Preview schedule target." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "preview", "main.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "preview", "state.json"),
    });
    expect(() =>
      store.createAutomationSchedule({
        targetKind: "workflow_artifact",
        targetId: previewArtifact.id,
        preset: "daily",
      }),
    ).toThrow("Workflow artifact is ready_for_preview and cannot be scheduled until approved.");
  });

  it("lists and advances due automation schedules", () => {
    const task = store.createOrchestrationTask({ title: "Due task", state: "ready" });
    const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
    const dueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
    const schedules = store.createAutomationSchedule(
      {
        targetKind: "local_task",
        targetId: task.id,
        preset: "daily",
        timezone: "America/Phoenix",
        enabled: true,
      },
      createdAt,
    );

    expect(store.listDueAutomationSchedules(dueAt).map((schedule) => schedule.id)).toEqual([schedules[0].id]);
    const advanced = store.advanceAutomationSchedule(schedules[0].id, dueAt);

    expect(advanced.lastRunAt).toBe(dueAt.toISOString());
    expect(advanced.nextRunAt).toBe(new Date(2026, 0, 2, 9, 0, 0, 0).toISOString());
    expect(store.listDueAutomationSchedules(dueAt)).toEqual([]);
  });

  it("surfaces workflow plugin requirements in automation thread badges", () => {
    const artifact = store.createWorkflowArtifact({
      title: "Plugin workflow",
      status: "ready_for_preview",
      manifest: {
        tools: ["fixture_tool"],
        mutationPolicy: "read_only",
        pluginCapabilities: [
          {
            capabilityId: "plugin-1:mcp-tool:server:fixture_original",
            pluginId: "plugin-1",
            pluginName: "Fixture",
            serverName: "server",
            toolName: "fixture_original",
            registeredName: "fixture_tool",
          },
        ],
      },
      spec: { goal: "Run the fixture plugin.", summary: "Uses a plugin MCP tool." },
      sourcePath: join(workspacePath, "workflow.ts"),
      statePath: join(workspacePath, "workflow-state.json"),
    });

    const home = store.listAutomationFolders().find((folder) => folder.kind === "home");
    const thread = home?.threads.find((item) => item.sourceId === artifact.id);

    expect(thread).toMatchObject({
      kind: "workflow_artifact",
      title: "Plugin workflow",
      badges: expect.arrayContaining(["1 plugin requirement", "fixture_tool"]),
    });
  });

  it("searches persisted threads and messages", () => {
    const thread = store.createThread("Searchable thread");
    const otherThread = store.createThread("Other thread");
    store.addMessage({ threadId: thread.id, role: "user", content: "Find the durable banana result." });
    store.addMessage({ threadId: otherThread.id, role: "user", content: "Find the durable banana result in another chat." });

    const results = store.searchWorkspace("banana");

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "message",
          threadId: thread.id,
          title: "Searchable thread",
          excerpt: "Find the durable banana result.",
        }),
      ]),
    );
    expect(store.searchWorkspace("banana", { scope: "chat", threadId: thread.id }).map((result) => result.threadId)).toEqual(
      expect.arrayContaining([thread.id]),
    );
    expect(store.searchWorkspace("banana", { scope: "chat", threadId: thread.id }).map((result) => result.threadId)).not.toContain(otherThread.id);
  });

  it("persists the last active thread id across workspace reopen", () => {
    const thread = store.createThread("Last used");

    store.setLastActiveThreadId("missing-thread");
    expect(store.getLastActiveThreadId()).toBeUndefined();

    store.setLastActiveThreadId(thread.id);

    store.close();
    store.openWorkspace(workspacePath);

    expect(store.getLastActiveThreadId()).toBe(thread.id);
  });

  it("persists compaction policy settings with safe defaults", () => {
    expect(store.getDefaultSettings().compaction).toMatchObject({
      autoCompactionEnabled: true,
      reserveTokens: 16384,
      keepRecentTokens: 20000,
      softWarningPercent: 80,
      hardPreflightPercent: 92,
    });

    store.setCompactionSettings({
      autoCompactionEnabled: false,
      reserveTokens: 8_000,
      keepRecentTokens: 12_000,
      softWarningPercent: 75,
      hardPreflightPercent: 90,
    });

    store.close();
    store.openWorkspace(workspacePath);

    expect(store.getCompactionSettings()).toMatchObject({
      autoCompactionEnabled: false,
      reserveTokens: 8_000,
      keepRecentTokens: 12_000,
      softWarningPercent: 75,
      hardPreflightPercent: 90,
    });
  });

  it("creates one durable project board with a draft charter", () => {
    expect(store.getActiveProjectBoard()).toBeUndefined();

    const board = store.createProjectBoard({ title: "Launch board", summary: "Coordinate the launch." });
    const duplicate = store.createProjectBoard({ title: "Second board" });

    expect(duplicate.id).toBe(board.id);
    expect(board).toMatchObject({
      projectPath: workspacePath,
      status: "draft",
      title: "Launch board",
      summary: "Coordinate the launch.",
    });
    expect(board.charterId).toBeTruthy();
    const charter = store.getProjectBoardCharter(board.charterId!);
    expect(charter).toMatchObject({
      boardId: board.id,
      version: 1,
      status: "draft",
      testPolicy: expect.objectContaining({ unit: true, integration: true, visual: true }),
      sourcePolicy: expect.objectContaining({ includeThreads: true, includeMarkdown: true }),
    });
    expect(charter.markdown).toContain("Launch board");
    expect(store.getActiveProjectBoard()?.questions).toHaveLength(5);
    expect(store.getActiveProjectBoard()?.events).toEqual([
      expect.objectContaining({
        kind: "board_created",
        title: "Board created",
        entityId: board.id,
        metadata: expect.objectContaining({ status: "draft", charterId: board.charterId }),
      }),
    ]);

    store.close();
    store.openWorkspace(workspacePath);

    expect(store.getActiveProjectBoard()).toMatchObject({ id: board.id, charterId: board.charterId });
  });

  it("records kickoff interview answers on project boards", () => {
    const board = store.createProjectBoard({ title: "Interview board" });
    const question = store.getActiveProjectBoard()?.questions[0];

    expect(question).toMatchObject({ required: true, answer: undefined });
    const answered = store.answerProjectBoardQuestion(question!.id, "Optimize for a reliable first release.");

    expect(answered).toMatchObject({
      id: question!.id,
      answer: "Optimize for a reliable first release.",
    });
    expect(answered.answeredAt).toBeTruthy();
    expect(store.getActiveProjectBoard()?.questions[0].answer).toBe("Optimize for a reliable first release.");
    expect(() => store.answerProjectBoardQuestion(question!.id, "  ")).toThrow("cannot be empty");
    expect(board.id).toBeTruthy();
  });

  it("persists Ambient/Pi kickoff defaults and marks them stale when source context changes", () => {
    const board = store.createProjectBoard({ title: "Kickoff defaults board" });
    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Durable Plan",
        summary: "Primary plan for a browser Asteroids game with gravity weapons.",
        path: ".ambient/board/plans/asteroids.html",
        relevance: 99,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "thread",
        title: "Brainstorm thread",
        summary: "Ignored thread with optional visual ideas.",
        threadId: "thread-brainstorm",
        relevance: 40,
        authorityRole: "ignored",
        includeInSynthesis: false,
      },
    ]);
    const question = store.getActiveProjectBoard()!.questions[0];
    const contextFingerprint = projectBoardKickoffDefaultContextFingerprint({ question: question.question, sources });

    const defaulted = store.applyProjectBoardKickoffDefaultSuggestions({
      boardId: board.id,
      targetQuestionIds: [question.id],
      model: "test-pi",
      telemetry: { promptCharCount: 1200, responseCharCount: 320, requestDurationMs: 44 },
      suggestions: [
        {
          questionId: question.id,
          question: question.question,
          suggestedAnswer: "Ship the source-defined Asteroids gameplay slice from the durable plan.",
          rationale: "The durable plan is the included primary source.",
          confidence: "high",
          sourceIds: [sources[0].id],
          contextFingerprint,
        },
      ],
    });

    expect(defaulted.questions[0]).toMatchObject({
      suggestedAnswer: "Ship the source-defined Asteroids gameplay slice from the durable plan.",
      suggestedAnswerRationale: "The durable plan is the included primary source.",
      suggestedAnswerConfidence: "high",
      suggestedAnswerSourceIds: [sources[0].id],
      suggestedAnswerModel: "test-pi",
      suggestedAnswerStale: false,
      answer: undefined,
    });
    expect(defaulted.events?.find((event) => event.kind === "kickoff_defaults_suggested")?.metadata.kickoffDefaults).toMatchObject({
      appliedAction: "suggest_source_derived_defaults",
      targetQuestionIds: [question.id],
      appliedQuestionIds: [question.id],
      suggestedQuestionCount: 1,
      modelCallRequired: true,
      model: "test-pi",
      promptCharCount: 1200,
    });

    store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Durable Plan",
        summary: "Primary plan changed to prioritize a mobile-first Asteroids game.",
        path: ".ambient/board/plans/asteroids.html",
        relevance: 99,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
    ]);

    expect(store.getActiveProjectBoard()?.questions[0]).toMatchObject({
      suggestedAnswer: "Ship the source-defined Asteroids gameplay slice from the durable plan.",
      suggestedAnswerStale: true,
    });
  });

  it("records kickoff default helper progress without creating planning snapshots", () => {
    const board = store.createProjectBoard({ title: "Kickoff defaults run board" });
    const run = store.createProjectBoardSynthesisRun({
      boardId: board.id,
      model: "test-pi",
      initialStage: "kickoff_defaults",
      initialTitle: "Kickoff default suggestions started",
      initialSummary: "Suggesting editable kickoff defaults one question at a time.",
      initialMetadata: { helper: "kickoff_defaults", sequential: true },
      sourceCount: 4,
      includedSourceCount: 2,
      sourceCharCount: 1200,
    });

    expect(run).toMatchObject({
      status: "running",
      stage: "kickoff_defaults",
      sourceCount: 4,
      includedSourceCount: 2,
      sourceCharCount: 1200,
      events: [
        expect.objectContaining({
          stage: "kickoff_defaults",
          title: "Kickoff default suggestions started",
          metadata: { helper: "kickoff_defaults", sequential: true },
        }),
      ],
    });

    const completed = store.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "kickoff_defaults",
      title: "Kickoff default suggestions finished",
      summary: "Applied 1 of 1 editable kickoff defaults.",
      promptCharCount: 1000,
      responseCharCount: 240,
      questionCount: 1,
      status: "succeeded",
      completedAt: new Date().toISOString(),
      skipPlanningSnapshot: true,
    });

    expect(completed).toMatchObject({
      status: "succeeded",
      stage: "kickoff_defaults",
      promptCharCount: 1000,
      responseCharCount: 240,
      questionCount: 1,
    });
    expect(completed.planningSnapshots).toBeUndefined();
  });

  it("can exclude kickoff default helper runs from the active planning lookup", () => {
    const board = store.createProjectBoard({ title: "Kickoff defaults run board" });
    const kickoffRun = store.createProjectBoardSynthesisRun({
      boardId: board.id,
      model: "test-pi",
      initialStage: "kickoff_defaults",
      initialTitle: "Kickoff default suggestions started",
    });
    const planningRun = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-pi" });
    store.recordProjectBoardSynthesisRunEvent(kickoffRun.id, {
      stage: "kickoff_defaults",
      title: "Still suggesting kickoff defaults",
      summary: "Retrying one kickoff default.",
    });

    expect(store.getRunningProjectBoardSynthesisRun(board.id, { excludeStages: ["kickoff_defaults"] })?.id).toBe(planningRun.id);
    store.recordProjectBoardSynthesisRunEvent(planningRun.id, {
      stage: "sources_persisted",
      title: "Planning run finished",
      summary: "The real planning run is no longer active.",
      status: "succeeded",
      completedAt: new Date().toISOString(),
    });
    expect(store.getRunningProjectBoardSynthesisRun(board.id, { excludeStages: ["kickoff_defaults"] })).toBeUndefined();
  });

  it("finalizes kickoff answers into an active project board charter", () => {
    const board = store.createProjectBoard({ title: "Charter board", summary: "Coordinate the first release." });
    store.replaceProjectBoardSources(board.id, [
      {
        kind: "architecture_artifact",
        title: "System architecture",
        summary: "Durable architecture notes.",
        path: "architecture.md",
        relevance: 92,
      },
      {
        kind: "thread",
        title: "Discovery thread",
        summary: "Early project discussion.",
        threadId: "thread-1",
        relevance: 81,
      },
    ]);

    expect(() => store.finalizeProjectBoardKickoff(board.id)).toThrow("Answer required kickoff questions");

    const answers = [
      "Ship a stable project board that turns approved plans into executable work.",
      "Use architecture.md as the highest authority and threads as supporting context.",
      "Ask when scope changes; otherwise choose the simplest durable implementation.",
      "Every card needs focused unit, integration, and visual proof where applicable.",
      "Sequence by dependency order and keep retrying until proof is satisfied or a blocker is explicit.",
    ];
    for (const [index, question] of store.getActiveProjectBoard()!.questions.entries()) {
      store.answerProjectBoardQuestion(question.id, answers[index]);
    }

    const finalized = store.finalizeProjectBoardKickoff(board.id);

    expect(finalized.status).toBe("active");
    expect(finalized.summary).toBe(answers[0]);
    expect(finalized.charter).toMatchObject({
      status: "active",
      goal: answers[0],
      qualityBar: answers[3],
      decisionPolicy: { defaultPolicy: answers[2] },
      testPolicy: expect.objectContaining({ defaultProof: answers[3], unit: true, integration: true, visual: true }),
      sourcePolicy: expect.objectContaining({
        policy: answers[1],
        authoritativeSources: ["architecture.md"],
      }),
    });
    expect(finalized.charter?.markdown).toContain("## Source Corpus");
    expect(finalized.charter?.markdown).toContain("System architecture (architecture_artifact: architecture.md)");
    expect(finalized.charter?.projectSummary).toMatchObject({
      generator: "fallback_heuristic",
      summary: expect.stringContaining(answers[0]),
      sourceCoverage: expect.arrayContaining([expect.stringContaining("architecture.md")]),
      citations: expect.arrayContaining([expect.stringContaining("architecture.md")]),
      sourceChecksumSet: expect.arrayContaining([expect.stringContaining(":")]),
      kickoffContextBrief: expect.objectContaining({
        includedSourceCount: 2,
        sourceNotes: expect.arrayContaining([
          expect.objectContaining({
            title: "System architecture",
            path: "architecture.md",
          }),
        ]),
      }),
    });
    expect(finalized.charter?.projectSummary?.charterAnswerChecksum).toHaveLength(64);
    expect(finalized.events?.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["charter_finalized", "question_answered", "sources_refreshed", "board_created"]),
    );
    expect(finalized.events?.[0]).toMatchObject({
      kind: "charter_finalized",
      title: "Charter finalized",
      entityId: finalized.charterId,
      metadata: expect.objectContaining({ sourceCount: 2, projectSummaryGenerator: "fallback_heuristic" }),
    });
  });

  it("refreshes active charter project summary snapshots", () => {
    const board = store.createProjectBoard({ title: "Charter summary board", summary: "Coordinate summary refresh." });
    store.replaceProjectBoardSources(board.id, [
      {
        kind: "functional_spec",
        title: "Product spec",
        summary: "Spec covers persistence, source authority, and validation.",
        path: "product.md",
        relevance: 95,
      },
    ]);
    const answers = [
      "Ship the active charter summary refresh.",
      "Use product.md as the source authority.",
      "Ask for product scope changes.",
      "Require focused persistence proof.",
      "Refresh summaries after source changes.",
    ];
    for (const [index, question] of store.getActiveProjectBoard()!.questions.entries()) {
      store.answerProjectBoardQuestion(question.id, answers[index]);
    }
    store.finalizeProjectBoardKickoff(board.id);

    const summary = store.buildActiveProjectBoardCharterProjectSummary(board.id, "2026-06-16T01:00:00.000Z");
    const refreshed = store.updateProjectBoardCharterProjectSummary({
      boardId: board.id,
      summary,
      title: "Summary refreshed",
      eventSummary: "Refreshed active charter summary.",
      metadata: { reason: "source-refresh" },
      createdAt: "2026-06-16T01:01:00.000Z",
    });

    expect(refreshed.charter?.projectSummary).toMatchObject({
      generator: "fallback_heuristic",
      generatedAt: "2026-06-16T01:00:00.000Z",
      charterAnswerChecksum: summary.charterAnswerChecksum,
    });
    expect(refreshed.events?.find((event) => event.kind === "charter_summary_refreshed")).toMatchObject({
      kind: "charter_summary_refreshed",
      title: "Summary refreshed",
      summary: "Refreshed active charter summary.",
      entityId: refreshed.charterId,
      metadata: expect.objectContaining({
        sourceChecksumCount: 1,
        charterAnswerChecksum: summary.charterAnswerChecksum,
        reason: "source-refresh",
      }),
    });
  });

  it("keeps generated workflow scaffolding out of charter authority and Pi classification until promoted", () => {
    const board = store.createProjectBoard({ title: "Unit converter board", summary: "Plan the converter from source files." });
    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "functional_spec",
        title: "Unit Converter Project",
        summary: "PROJECT.md requires a browser unit converter with length, weight, and temperature conversions.",
        excerpt: "# Unit Converter Project\n\nBuild a browser unit converter for length, weight, and temperature conversions.",
        path: "PROJECT.md",
        relevance: 92,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "workflow_artifact",
        title: "Generated workflow",
        summary: "Generated workflow scaffold says to build an unrelated chat bot.",
        excerpt: "Generated by Ambient.\n\nWorkflow scaffold for unrelated chat bot setup.",
        path: "WORKFLOW.md",
        relevance: 88,
        authorityRole: "ignored",
        includeInSynthesis: false,
        classificationReason: `${GENERATED_WORKFLOW_SOURCE_AUTHORITY_REASON}: WORKFLOW.md.`,
      },
    ]);
    const workflowSource = sources.find((source) => source.path === "WORKFLOW.md")!;

    const piAttempt = store.applyProjectBoardSourceClassifications(board.id, [
      {
        sourceId: workflowSource.id,
        sourceKey: workflowSource.sourceKey,
        kind: "workflow_artifact",
        classificationReason: "Pi attempted to promote the generated workflow scaffold.",
        classificationConfidence: 0.99,
        authorityRole: "primary",
        includeInSynthesis: true,
        model: "zai-org/GLM-5.1-FP8",
      },
    ]);
    expect(piAttempt.find((source) => source.id === workflowSource.id)).toMatchObject({
      authorityRole: "ignored",
      includeInSynthesis: false,
      classifiedBy: "fallback_heuristic",
    });

    const answers = [
      "Build the browser unit converter described by PROJECT.md.",
      "PROJECT.md is the authoritative product source; generated workflow scaffolding stays excluded unless explicitly promoted.",
      "Ask only when PROJECT.md leaves conversion behavior ambiguous.",
      "Require deterministic unit conversion tests and a simple browser smoke proof.",
      "Implement source-grounded cards in dependency order.",
    ];
    for (const [index, question] of store.getActiveProjectBoard()!.questions.entries()) {
      store.answerProjectBoardQuestion(question.id, answers[index]);
    }

    const finalized = store.finalizeProjectBoardKickoff(board.id);

    expect(finalized.charter?.sourcePolicy).toMatchObject({ authoritativeSources: ["PROJECT.md"] });
    expect(finalized.charter?.markdown).toContain("Unit Converter Project (functional_spec: PROJECT.md)");
    expect(finalized.charter?.markdown).not.toContain("Generated workflow (workflow_artifact: WORKFLOW.md)");
    expect(finalized.charter?.projectSummary?.sourceCoverage).toEqual(expect.arrayContaining([expect.stringContaining("PROJECT.md")]));
    expect(finalized.charter?.projectSummary?.sourceCoverage).not.toEqual(expect.arrayContaining([expect.stringContaining("WORKFLOW.md")]));

    const promoted = store.updateProjectBoardSource({ sourceId: workflowSource.id, kind: "workflow_artifact", includeInSynthesis: true });
    expect(promoted).toMatchObject({
      classifiedBy: "user",
      authorityRole: "primary",
      includeInSynthesis: true,
    });
  });

  it("keeps generated report artifacts ignored until explicit promotion records source provenance", () => {
    const board = store.createProjectBoard({ title: "Workspace health board", summary: "Plan work from a generated health report." });
    const [reportSource] = store.replaceProjectBoardSources(board.id, [
      {
        kind: "report_artifact",
        title: "Workspace Health Report",
        summary: "Generated report recommends accessibility, smoke, and cleanup follow-up cards.",
        excerpt: "# Workspace Health Report\n\nGenerated by Ambient.\n\nFindings: add accessibility and smoke coverage.",
        path: "reports/workspace-health-report.md",
        relevance: 78,
        authorityRole: "ignored",
        includeInSynthesis: false,
        classificationReason: `${GENERATED_REPORT_SOURCE_AUTHORITY_REASON}: reports/workspace-health-report.md.`,
      },
    ]);

    const piAttempt = store.applyProjectBoardSourceClassifications(board.id, [
      {
        sourceId: reportSource.id,
        sourceKey: reportSource.sourceKey,
        kind: "report_artifact",
        classificationReason: "Pi attempted to promote the generated health report.",
        classificationConfidence: 0.96,
        authorityRole: "primary",
        includeInSynthesis: true,
        model: "zai-org/GLM-5.1-FP8",
      },
    ]);

    expect(piAttempt[0]).toMatchObject({
      authorityRole: "ignored",
      includeInSynthesis: false,
      classifiedBy: "fallback_heuristic",
      classificationReason: expect.stringContaining(GENERATED_REPORT_SOURCE_AUTHORITY_REASON),
    });

    const promoted = store.updateProjectBoardSource({ sourceId: reportSource.id, kind: "report_artifact", includeInSynthesis: true });
    expect(promoted).toMatchObject({
      classifiedBy: "user",
      authorityRole: "supporting",
      includeInSynthesis: true,
      classificationReason: "User included report_artifact source for project-board synthesis.",
    });

    const event = (store.getActiveProjectBoard()!.events ?? []).find((candidate) => candidate.kind === "source_updated");
    expect(event).toMatchObject({
      title: "Source inclusion updated",
      entityId: reportSource.id,
      metadata: expect.objectContaining({
        sourceId: reportSource.id,
        includeInSynthesis: true,
        sourceImpact: expect.objectContaining({
          additiveSynthesisAvailable: true,
          groupSourceIds: [reportSource.id],
        }),
      }),
    });
  });

  it("applies Build Board synthesis to draft charter, questions, and candidate cards idempotently", () => {
    const board = store.createProjectBoard({ title: "Spaceship board" });
    const synthesisDraft: ProjectBoardSynthesisDraft = {
      summary: "Synthesized WebGL spaceship work.",
      goal: "Build a playable browser-based WebGL spaceship game.",
      currentState: "Scanned mixed-quality project artifacts.",
      targetUser: "Browser game prototype developer.",
      qualityBar: "Every card needs runnable proof and explicit gameplay acceptance criteria.",
      assumptions: ["Three.js/WebGL is the rendering stack.", "Keyboard input is acceptable for the first slice."],
      questions: ["Should ship controls use arcade movement or inertia-based thrust?"],
      sourceNotes: ["architecture artifact: docs/architecture.md - Three.js render loop and game-state reducer."],
      cards: [
        {
          sourceId: "synthesis:webgl-game-shell",
          title: "Create the WebGL game shell",
          description: "Set up the render loop and nonblank canvas.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["webgl", "game"],
          blockedBy: [],
          sourceRefs: ["source-architecture"],
          clarificationQuestions: ["Should the shell use Three.js or another renderer?"],
          acceptanceCriteria: ["Canvas renders a nonblank scene."],
          testPlan: {
            unit: ["Test render-loop helpers."],
            integration: ["Verify the canvas mounts."],
            visual: ["Capture a nonblank canvas screenshot."],
            manual: ["Resize the window and inspect the scene."],
          },
        },
        {
          sourceId: "synthesis:ship-controls",
          title: "Implement ship controls",
          description: "Move the player ship with keyboard input.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Core Gameplay",
          labels: ["controls"],
          blockedBy: ["synthesis:webgl-game-shell"],
          sourceRefs: ["source-architecture"],
          acceptanceCriteria: ["Keyboard input moves the player ship."],
          testPlan: {
            unit: ["Test input-to-motion updates."],
            integration: ["Verify movement in a local run."],
            visual: [],
            manual: ["Play one short movement pass."],
          },
        },
      ],
    };
    const synthesized = store.applyProjectBoardSynthesis(board.id, synthesisDraft);

    expect(synthesized.summary).toBe("Synthesized WebGL spaceship work.");
    expect(synthesized.charter).toMatchObject({
      goal: "Build a playable browser-based WebGL spaceship game.",
      currentState: "Scanned mixed-quality project artifacts.",
      targetUser: "Browser game prototype developer.",
      qualityBar: "Every card needs runnable proof and explicit gameplay acceptance criteria.",
      testPolicy: expect.objectContaining({
        requireProofSpec: true,
        unit: true,
        integration: true,
        visual: true,
        manual: true,
        proofScopeWarningPolicy: "advisory",
      }),
      decisionPolicy: expect.objectContaining({
        default: "ask_when_ambiguous",
        assumptions: ["Three.js/WebGL is the rendering stack.", "Keyboard input is acceptable for the first slice."],
      }),
    });
    expect(synthesized.charter?.markdown).toContain("## Proposed Cards");
    expect(synthesized.charter?.projectSummary).toMatchObject({
      generator: "fallback_heuristic",
      summary: expect.stringContaining("Build a playable browser-based WebGL spaceship game."),
      unresolvedDecisions: expect.arrayContaining(["Should ship controls use arcade movement or inertia-based thrust?"]),
    });
    expect(synthesized.questions.map((question) => question.question)).toEqual(
      expect.arrayContaining(["Should ship controls use arcade movement or inertia-based thrust?"]),
    );
    expect(synthesized.cards).toHaveLength(2);
    expect(synthesized.cards[0]).toMatchObject({
      sourceKind: "board_synthesis",
      sourceId: "synthesis:webgl-game-shell",
      candidateStatus: "needs_clarification",
      labels: ["webgl", "game"],
      sourceRefs: ["source-architecture"],
      clarificationQuestions: ["Should the shell use Three.js or another renderer?"],
      acceptanceCriteria: ["Canvas renders a nonblank scene."],
      testPlan: expect.objectContaining({ visual: ["Capture a nonblank canvas screenshot."] }),
    });
    expect(synthesized.cards[1]).toMatchObject({ blockedBy: ["synthesis:webgl-game-shell"] });
    expect(synthesized.events?.[0]).toMatchObject({
      kind: "board_synthesized",
      metadata: expect.objectContaining({
        cardIds: expect.arrayContaining([synthesized.cards[0].id, synthesized.cards[1].id]),
        questionIds: expect.any(Array),
        cardClarificationQuestions: expect.arrayContaining([
          expect.objectContaining({ sourceId: "synthesis:webgl-game-shell", clarificationQuestions: ["Should the shell use Three.js or another renderer?"] }),
        ]),
      }),
    });
    (store as unknown as { requireDb: () => { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } } })
      .requireDb()
      .prepare("UPDATE project_board_charters SET budget_policy_json = ? WHERE id = ?")
      .run(JSON.stringify({ maxPassesPerCard: 3, maxRuntimeMsPerCard: 780_000, pauseOnTerminalBlocker: false, runtimeSplitDogfood: true }), synthesized.charter!.id);

    const duplicate = store.applyProjectBoardSynthesis(board.id, {
      ...synthesisDraft,
      assumptions: ["Duplicate run should not duplicate cards or questions."],
      cards: synthesisDraft.cards.map((card) => ({
        sourceId: card.sourceId,
        title: card.title,
        description: card.description,
        candidateStatus: card.candidateStatus,
        priority: card.priority,
        phase: card.phase,
        labels: card.labels,
        blockedBy: card.blockedBy,
        acceptanceCriteria: card.acceptanceCriteria,
        testPlan: card.testPlan,
        sourceRefs: [],
      })),
      questions: ["Should ship controls use arcade movement or inertia-based thrust?"],
    });

    expect(duplicate.cards.filter((card) => card.sourceKind === "board_synthesis")).toHaveLength(2);
    expect(duplicate.charter?.budgetPolicy).toMatchObject({
      maxPassesPerCard: 3,
      maxRuntimeMsPerCard: 780_000,
      pauseOnTerminalBlocker: false,
      runtimeSplitDogfood: true,
    });
    expect(duplicate.questions.filter((question) => question.question === "Should ship controls use arcade movement or inertia-based thrust?")).toHaveLength(
      1,
    );

    const refined = store.applyProjectBoardSynthesis(
      board.id,
      {
        ...synthesisDraft,
        summary: "Live refined synthesis.",
        cards: [
          {
            sourceId: "synthesis:live-shell",
            title: "Live refined shell card",
            description: "Replace deterministic draft cards with the live refinement.",
            candidateStatus: "needs_clarification",
            priority: 1,
            phase: "Foundation",
            labels: ["refined"],
            blockedBy: [],
            sourceRefs: ["source-architecture"],
            acceptanceCriteria: ["Live card is the only unlinked synthesis draft."],
            testPlan: { unit: [], integration: ["Inspect board cards."], visual: [], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: true },
    );

    expect(refined.cards.filter((card) => card.sourceKind === "board_synthesis").map((card) => card.title)).toEqual([
      "Live refined shell card",
    ]);
    expect(refined.events?.[0]).toMatchObject({
      kind: "board_synthesized",
      metadata: expect.objectContaining({ replacedDraftCardCount: 2 }),
    });
  });

  it("skips synthesis candidates that only reference ignored or other-thread sources", () => {
    const board = store.createProjectBoard({ title: "Markdown board", sourceThreadId: "markdown-thread" });
    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Markdown durable plan",
        summary: "Single-page markdown previewer.",
        path: ".ambient/board/plans/Markdown-DurablePlan.html",
        threadId: "markdown-thread",
        relevance: 99,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "implementation_plan",
        title: "Unit converter durable plan",
        summary: "Separate unit converter plan from another chat.",
        path: ".ambient/board/plans/Unit-Converter-DurablePlan.html",
        threadId: "unit-thread",
        relevance: 80,
        authorityRole: "ignored",
        includeInSynthesis: false,
      },
    ]);

    const synthesized = store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Markdown plan only.",
        goal: "Build the markdown previewer.",
        currentState: "The board has one primary durable plan.",
        targetUser: "Local app user.",
        qualityBar: "Verify realtime markdown preview.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "synthesis:markdown-preview",
            title: "Implement markdown preview",
            description: "Build the core markdown previewer.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Implementation",
            labels: ["markdown"],
            blockedBy: [],
            sourceRefs: [sources[0].id],
            acceptanceCriteria: ["Markdown renders in realtime."],
            testPlan: { unit: [], integration: [], visual: ["Open preview."], manual: [] },
          },
          {
            sourceId: "synthesis:unit-converter",
            title: "Implement unit conversion",
            description: "This belongs to another thread.",
            candidateStatus: "ready_to_create",
            priority: 2,
            phase: "Implementation",
            labels: ["unit"],
            blockedBy: [],
            sourceRefs: [sources[1].id],
            acceptanceCriteria: ["Unit conversion works."],
            testPlan: { unit: ["Conversion math."], integration: [], visual: [], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );

    expect(synthesized.cards.filter((card) => card.sourceKind === "board_synthesis").map((card) => card.sourceId)).toEqual([
      "synthesis:markdown-preview",
    ]);
    expect(synthesized.cards.find((card) => card.sourceId === "synthesis:markdown-preview")).toMatchObject({
      sourceThreadId: "markdown-thread",
    });
  });

  it("persists expert clarification suggestions and keeps them through answered decisions", () => {
    const board = store.createProjectBoard({ title: "Suggestion board" });
    const synthesized = store.applyProjectBoardSynthesis(board.id, {
      summary: "Calculator board.",
      goal: "Build a calculator.",
      currentState: "Durable plan exists.",
      targetUser: "Calculator users.",
      qualityBar: "Unit proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:keyboard-input",
          title: "Implement keyboard input",
          description: "Handle calculator keyboard input.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["input"],
          blockedBy: [],
          sourceRefs: ["plan.html"],
          clarificationQuestions: ["Should numpad operators map directly to calculator operators?"],
          clarificationSuggestions: [
            {
              question: "Should numpad operators map directly to calculator operators?",
              suggestedAnswer: "Map numpad operators directly to matching calculator operators.",
              rationale: "This is standard calculator behavior and is safe as an implementation default.",
              confidence: "high",
              safeToAccept: true,
              questionKind: "expert_default",
            },
          ],
          acceptanceCriteria: ["Numpad operators can be entered from the keyboard."],
          testPlan: { unit: ["Input mapping tests."], integration: [], visual: [], manual: [] },
        },
      ],
    });

    const card = synthesized.cards[0];
    expect(card.clarificationSuggestions).toEqual([
      expect.objectContaining({
        suggestedAnswer: "Map numpad operators directly to matching calculator operators.",
        safeToAccept: true,
        questionKind: "expert_default",
      }),
    ]);
    expect(card.clarificationDecisions).toEqual([
      expect.objectContaining({
        state: "open",
        suggestedAnswer: "Map numpad operators directly to matching calculator operators.",
        safeToAccept: true,
        questionKind: "expert_default",
      }),
    ]);

    const answered = store.updateProjectBoardCard({
      cardId: card.id,
      clarificationQuestions: [],
      clarificationAnswers: [
        {
          question: "Should numpad operators map directly to calculator operators?",
          answer: "Map numpad operators directly to matching calculator operators.",
          answeredAt: new Date().toISOString(),
        },
      ],
    });

    expect(answered.clarificationSuggestions?.[0]?.suggestedAnswer).toBe("Map numpad operators directly to matching calculator operators.");
    expect(answered.clarificationAnswers?.[0]?.answer).toBe("Map numpad operators directly to matching calculator operators.");
    expect(answered.clarificationDecisions).toEqual([
      expect.objectContaining({
        state: "answered",
        answer: "Map numpad operators directly to matching calculator operators.",
      }),
    ]);
  });

  it("preserves ticketized first ready card while later incremental synthesis batches replace draft cards", () => {
    const board = store.createProjectBoard({ title: "Incremental board" });
    const firstBatch: ProjectBoardSynthesisDraft = {
      summary: "First incremental batch.",
      goal: "Build an incremental spaceship board.",
      currentState: "Pi has emitted the first small batch.",
      targetUser: "Browser game prototype developer.",
      qualityBar: "Every card needs proof.",
      assumptions: [],
      questions: [],
      sourceNotes: ["GDD section one produced a ready foundation card."],
      cards: [
        {
          sourceId: "synthesis:game-shell",
          title: "Create game shell",
          description: "Create the app shell and nonblank canvas.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["foundation"],
          blockedBy: [],
          sourceRefs: ["GAME_DESIGN_DOCUMENT.md#shell"],
          acceptanceCriteria: ["Canvas renders a nonblank scene."],
          testPlan: { unit: ["Unit proof."], integration: ["Run app."], visual: [], manual: [] },
        },
      ],
    };

    const afterFirstBatch = store.applyProjectBoardSynthesis(board.id, firstBatch, { replaceExistingDraft: true, insertQuestions: false });
    const shell = afterFirstBatch.cards.find((card) => card.sourceId === "synthesis:game-shell");
    expect(shell).toBeTruthy();
    const ticketized = store.approveProjectBoardCard(shell!.id);
    expect(ticketized).toMatchObject({ status: "ready", orchestrationTaskId: expect.any(String) });

    const secondBatch = store.applyProjectBoardSynthesis(
      board.id,
      {
        ...firstBatch,
        summary: "Second incremental batch.",
        cards: [
          firstBatch.cards[0],
          {
            sourceId: "synthesis:ship-controls",
            title: "Implement ship controls",
            description: "Use the shell to add keyboard controls.",
            candidateStatus: "ready_to_create",
            priority: 2,
            phase: "Core Gameplay",
            labels: ["controls"],
            blockedBy: ["synthesis:game-shell"],
            sourceRefs: ["GAME_DESIGN_DOCUMENT.md#controls"],
            acceptanceCriteria: ["Keyboard input moves the ship."],
            testPlan: { unit: ["Input reducer proof."], integration: [], visual: [], manual: ["Play one movement pass."] },
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );

    expect(secondBatch.cards.filter((card) => card.sourceId === "synthesis:game-shell")).toHaveLength(1);
    expect(secondBatch.cards.find((card) => card.sourceId === "synthesis:game-shell")).toMatchObject({
      id: ticketized.id,
      status: "ready",
      orchestrationTaskId: ticketized.orchestrationTaskId,
    });
    expect(secondBatch.cards.find((card) => card.sourceId === "synthesis:ship-controls")).toMatchObject({
      status: "draft",
      candidateStatus: "ready_to_create",
      blockedBy: ["synthesis:game-shell"],
    });
  });

  it("updates matching replaceable synthesis drafts in place during replacement passes", () => {
    const board = store.createProjectBoard({ title: "Stable draft identity board" });
    const firstBatch: ProjectBoardSynthesisDraft = {
      summary: "First card draft.",
      goal: "Build a stable draft board.",
      currentState: "Pi emitted the first candidate.",
      targetUser: "Project manager answering clarifications.",
      qualityBar: "Every card needs proof.",
      assumptions: [],
      questions: [],
      sourceNotes: ["Initial source pass."],
      cards: [
        {
          sourceId: "synthesis:renderer-choice",
          title: "Choose renderer",
          description: "Decide whether the game should use Canvas 2D or Three.js.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["rendering"],
          blockedBy: [],
          sourceRefs: ["GDD.md#renderer"],
          clarificationQuestions: ["Should the project use Canvas 2D or Three.js?"],
          acceptanceCriteria: ["Renderer choice is explicit."],
          testPlan: { unit: [], integration: [], visual: [], manual: ["Review renderer choice."] },
        },
      ],
    };

    const first = store.applyProjectBoardSynthesis(board.id, firstBatch, { replaceExistingDraft: true, insertQuestions: false });
    const original = first.cards.find((card) => card.sourceId === "synthesis:renderer-choice");
    expect(original).toBeTruthy();

    const second = store.applyProjectBoardSynthesis(
      board.id,
      {
        ...firstBatch,
        summary: "Refined card draft.",
        cards: [
          {
            ...firstBatch.cards[0],
            title: "Establish rendering substrate",
            description: "Resolve Canvas 2D versus Three.js before downstream visual cards are created.",
            candidateStatus: "ready_to_create",
            labels: ["rendering", "architecture"],
            acceptanceCriteria: ["The selected renderer is documented.", "Downstream rendering cards depend on the chosen substrate."],
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );

    const updated = second.cards.find((card) => card.sourceId === "synthesis:renderer-choice");
    expect(updated).toMatchObject({
      id: original!.id,
      title: "Establish rendering substrate",
      description: "Resolve Canvas 2D versus Three.js before downstream visual cards are created.",
      candidateStatus: "ready_to_create",
      labels: ["rendering", "architecture"],
      acceptanceCriteria: ["The selected renderer is documented.", "Downstream rendering cards depend on the chosen substrate."],
    });
    expect(second.cards.filter((card) => card.sourceId === "synthesis:renderer-choice")).toHaveLength(1);
    expect(second.events?.[0]).toMatchObject({
      kind: "board_synthesized",
      metadata: expect.objectContaining({
        cardIds: [],
        updatedCardIds: [original!.id],
        appliedCardIds: [original!.id],
        replacedDraftCardCount: 0,
        updatedDraftCardCount: 1,
        preservedDraftCardIds: [original!.id],
        preservedDraftCardCount: 1,
      }),
    });
  });

  it("supersedes untouched synthesis drafts and namespaces fresh Start Fresh cards", () => {
    const board = store.createProjectBoard({ title: "Start Fresh board" });
    const firstBatch: ProjectBoardSynthesisDraft = {
      summary: "Paused planning batch.",
      goal: "Build a recoverable game board.",
      currentState: "Pi emitted cards before the run paused.",
      targetUser: "Project manager restarting planning.",
      qualityBar: "Fresh planning should not reuse abandoned drafts.",
      assumptions: [],
      questions: [],
      sourceNotes: ["Initial paused run."],
      cards: [
        {
          sourceId: "synthesis:shell",
          title: "Create shell",
          description: "Create the first playable shell.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["shell"],
          blockedBy: [],
          sourceRefs: ["GDD.md#shell"],
          acceptanceCriteria: ["A shell exists."],
          testPlan: { unit: ["Shell proof."], integration: [], visual: [], manual: [] },
        },
        {
          sourceId: "synthesis:controls",
          title: "Implement controls",
          description: "Add input.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Gameplay",
          labels: ["controls"],
          blockedBy: ["synthesis:shell"],
          sourceRefs: ["GDD.md#controls"],
          clarificationQuestions: ["Should controls use inertia?"],
          acceptanceCriteria: ["Input moves the player."],
          testPlan: { unit: [], integration: [], visual: [], manual: ["Try input."] },
        },
        {
          sourceId: "synthesis:boss",
          title: "Add boss",
          description: "Add one boss encounter.",
          candidateStatus: "ready_to_create",
          priority: 3,
          phase: "Gameplay",
          labels: ["boss"],
          blockedBy: ["synthesis:controls"],
          sourceRefs: ["GDD.md#boss"],
          acceptanceCriteria: ["Boss can spawn."],
          testPlan: { unit: ["Spawn proof."], integration: [], visual: [], manual: [] },
        },
      ],
    };

    const first = store.applyProjectBoardSynthesis(board.id, firstBatch, { replaceExistingDraft: true, insertQuestions: false });
    const shell = first.cards.find((card) => card.sourceId === "synthesis:shell");
    const controls = first.cards.find((card) => card.sourceId === "synthesis:controls");
    const boss = first.cards.find((card) => card.sourceId === "synthesis:boss");
    expect(shell).toBeTruthy();
    expect(controls).toBeTruthy();
    expect(boss).toBeTruthy();
    const ticketizedShell = store.approveProjectBoardCard(shell!.id);
    store.updateProjectBoardCard({ cardId: boss!.id, title: "Manually reviewed boss card" });

    const cleanup = store.supersedeProjectBoardSynthesisCardsForStartFresh({
      boardId: board.id,
      runId: "paused-run-1",
      reason: "User chose Start Fresh.",
    });

    expect(cleanup).toMatchObject({
      supersededDraftCardIds: [controls!.id],
      preservedCardIds: expect.arrayContaining([ticketizedShell.id, boss!.id]),
      demotedPreservedCardIds: expect.arrayContaining([ticketizedShell.id, boss!.id]),
    });
    const afterCleanup = store.getProjectBoard(board.id)!;
    expect(afterCleanup.cards.find((card) => card.id === controls!.id)).toBeUndefined();
    expect(afterCleanup.cards.find((card) => card.id === ticketizedShell.id)).toMatchObject({
      status: "draft",
      candidateStatus: "needs_clarification",
      orchestrationTaskId: undefined,
    });
    expect(afterCleanup.cards.find((card) => card.id === boss!.id)).toMatchObject({
      title: "Manually reviewed boss card",
      status: "draft",
      candidateStatus: "needs_clarification",
      orchestrationTaskId: undefined,
    });
    expect(afterCleanup.events?.[0]).toMatchObject({
      kind: "card_updated",
      title: "Start Fresh cleared draft synthesis cards",
      metadata: expect.objectContaining({
        decision: "start_fresh_supersede_drafts",
        abandonedRunId: "paused-run-1",
        supersededDraftCardIds: [controls!.id],
        demotedPreservedCardIds: expect.arrayContaining([ticketizedShell.id, boss!.id]),
      }),
    });

    const fresh = store.applyProjectBoardSynthesis(
      board.id,
      {
        ...firstBatch,
        summary: "Fresh planning batch.",
        cards: [
          { ...firstBatch.cards[0], title: "Create fresh shell" },
          { ...firstBatch.cards[1], title: "Implement fresh controls" },
        ],
      },
      {
        replaceExistingDraft: true,
        insertQuestions: false,
        sourceIdNamespace: "start-fresh:fresh-run-1:",
      },
    );

    const freshCards = fresh.cards.filter((card) => card.sourceId.startsWith("start-fresh:fresh-run-1:"));
    expect(freshCards.map((card) => card.sourceId)).toEqual([
      "start-fresh:fresh-run-1:synthesis:shell",
      "start-fresh:fresh-run-1:synthesis:controls",
    ]);
    expect(freshCards.map((card) => card.id)).not.toContain(shell!.id);
    expect(freshCards.map((card) => card.id)).not.toContain(controls!.id);
    expect(fresh.cards.find((card) => card.sourceId === "start-fresh:fresh-run-1:synthesis:controls")).toMatchObject({
      blockedBy: ["start-fresh:fresh-run-1:synthesis:shell"],
      clarificationQuestions: ["Should controls use inertia?"],
    });
    expect(fresh.cards.some((card) => card.id === boss!.id)).toBe(true);
  });

  it("keeps stale replaceable drafts during partial progressive applies until the final boundary", () => {
    const board = store.createProjectBoard({ title: "Progressive stale boundary board" });
    const firstBatch: ProjectBoardSynthesisDraft = {
      summary: "Initial progressive draft.",
      goal: "Build a stable progressive board.",
      currentState: "Two cards have streamed in.",
      targetUser: "Project manager watching live cards.",
      qualityBar: "Progressive batches should not make existing cards disappear.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:shell",
          title: "Create game shell",
          description: "Create the first playable shell.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["shell"],
          blockedBy: [],
          sourceRefs: ["GDD.md#shell"],
          clarificationQuestions: ["Which shell target should ship?"],
          acceptanceCriteria: ["A shell exists."],
          testPlan: { unit: [], integration: [], visual: [], manual: ["Open the shell."] },
        },
        {
          sourceId: "synthesis:controls",
          title: "Implement controls",
          description: "Add basic input.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Gameplay",
          labels: ["controls"],
          blockedBy: ["synthesis:shell"],
          sourceRefs: ["GDD.md#controls"],
          clarificationQuestions: ["Should controls be arcade or inertia based?"],
          acceptanceCriteria: ["Input moves the ship."],
          testPlan: { unit: [], integration: [], visual: [], manual: ["Try keyboard input."] },
        },
      ],
    };

    const afterFirstBatch = store.applyProjectBoardSynthesis(board.id, firstBatch, { replaceExistingDraft: true, insertQuestions: false });
    const originalShell = afterFirstBatch.cards.find((card) => card.sourceId === "synthesis:shell");
    const originalControls = afterFirstBatch.cards.find((card) => card.sourceId === "synthesis:controls");
    expect(originalShell).toBeTruthy();
    expect(originalControls).toBeTruthy();

    const partial = store.applyProjectBoardSynthesis(
      board.id,
      {
        ...firstBatch,
        summary: "Partial progressive update.",
        cards: [
          {
            ...firstBatch.cards[0],
            title: "Create stable game shell",
            description: "Refine the streamed shell card while the controls section is absent from this partial batch.",
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false, deleteStaleDraftCards: false },
    );

    expect(partial.cards.find((card) => card.sourceId === "synthesis:shell")).toMatchObject({
      id: originalShell!.id,
      title: "Create stable game shell",
    });
    expect(partial.cards.find((card) => card.sourceId === "synthesis:controls")).toMatchObject({
      id: originalControls!.id,
      title: "Implement controls",
    });
    expect(partial.events?.[0]).toMatchObject({
      kind: "board_synthesized",
      metadata: expect.objectContaining({
        staleDraftDeletionSkipped: true,
        replacedDraftCardCount: 0,
      }),
    });

    const final = store.applyProjectBoardSynthesis(
      board.id,
      {
        ...firstBatch,
        summary: "Final progressive update.",
        cards: [
          {
            ...firstBatch.cards[0],
            title: "Create final game shell",
            description: "Final synthesis intentionally excludes the old controls card.",
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );

    expect(final.cards.find((card) => card.sourceId === "synthesis:shell")).toMatchObject({
      id: originalShell!.id,
      title: "Create final game shell",
    });
    expect(final.cards.find((card) => card.sourceId === "synthesis:controls")).toBeUndefined();
    expect(final.events?.[0]).toMatchObject({
      kind: "board_synthesized",
      metadata: expect.objectContaining({
        staleDraftDeletionSkipped: false,
        replacedDraftCardCount: 1,
      }),
    });
  });

  it("dedupes near-duplicate synthesis clarification questions", () => {
    const board = store.createProjectBoard({ title: "Clarification dedupe board" });
    const renderingQuestion =
      "The plan locks 'Canvas 2D' but the project charter specifies 'Three.js/WebGL.' Which rendering substrate should the game use? This determines the entire renderer architecture, asset pipeline, and downstream card dependencies.";
    const renderingQuestionVariant =
      "The implementation plan locks 'Canvas 2D' as the rendering substrate, but the project charter specifies a 'Three.js/WebGL spaceship game.' Which substrate should the game use? This is a foundational architecture decision that blocks the rendering card and all downstream visual cards.";
    const synthesized = store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Clarification dedupe synthesis.",
        goal: "Build a renderer-aware game board.",
        currentState: "Pi emitted near-duplicate clarification questions.",
        targetUser: "Project manager.",
        qualityBar: "Questions should be concrete and non-redundant.",
        assumptions: [],
        questions: [renderingQuestion, renderingQuestionVariant],
        sourceNotes: [],
        cards: [
          {
            sourceId: "synthesis:renderer-choice",
            title: "Resolve rendering substrate",
            description: "Choose the rendering substrate before downstream cards are created.",
            candidateStatus: "needs_clarification",
            priority: 1,
            phase: "Foundation",
            labels: ["rendering"],
            blockedBy: [],
            sourceRefs: ["GDD.md#renderer"],
            clarificationQuestions: [renderingQuestion, renderingQuestionVariant],
            acceptanceCriteria: ["Renderer choice is documented."],
            testPlan: { unit: [], integration: [], visual: [], manual: ["Review renderer choice."] },
          },
        ],
      },
      { replaceExistingDraft: true },
    );

    expect(synthesized.cards.find((card) => card.sourceId === "synthesis:renderer-choice")?.clarificationQuestions).toEqual([renderingQuestion]);
    expect(synthesized.questions.filter((question) => question.question === renderingQuestion || question.question === renderingQuestionVariant)).toHaveLength(
      1,
    );
  });

  it("keeps user-touched synthesis cards and records Pi replacements as reviewable updates", () => {
    const board = store.createProjectBoard({ title: "Progressive merge board" });
    const firstBatch: ProjectBoardSynthesisDraft = {
      summary: "First batch.",
      goal: "Build a spaceship board.",
      currentState: "Pi emitted initial cards.",
      targetUser: "Browser game prototype developer.",
      qualityBar: "Every card needs proof.",
      assumptions: [],
      questions: [],
      sourceNotes: ["Initial section."],
      cards: [
        {
          sourceId: "synthesis:shell",
          title: "Create game shell",
          description: "Create a nonblank game canvas.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["foundation"],
          blockedBy: [],
          sourceRefs: ["GDD.md#shell"],
          acceptanceCriteria: ["Canvas renders."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
        },
        {
          sourceId: "synthesis:controls",
          title: "Implement controls",
          description: "Add keyboard input.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Core",
          labels: ["controls"],
          blockedBy: ["synthesis:shell"],
          sourceRefs: ["GDD.md#controls"],
          acceptanceCriteria: ["Keyboard input moves the ship."],
          testPlan: { unit: ["Input proof."], integration: [], visual: [], manual: [] },
        },
        {
          sourceId: "synthesis:placeholder",
          title: "Placeholder card",
          description: "This untouched draft should be replaced by the next batch.",
          candidateStatus: "needs_clarification",
          priority: 99,
          phase: "Scratch",
          labels: ["placeholder"],
          blockedBy: [],
          sourceRefs: ["notes.md"],
          acceptanceCriteria: ["Placeholder exists."],
          testPlan: { unit: [], integration: [], visual: [], manual: ["Manual placeholder."] },
        },
      ],
    };

    const afterFirstBatch = store.applyProjectBoardSynthesis(board.id, firstBatch, { replaceExistingDraft: true, insertQuestions: false });
    const shell = afterFirstBatch.cards.find((card) => card.sourceId === "synthesis:shell");
    const controls = afterFirstBatch.cards.find((card) => card.sourceId === "synthesis:controls");
    expect(shell).toBeTruthy();
    expect(controls).toBeTruthy();

    store.updateProjectBoardCard({ cardId: shell!.id, title: "Create the visible game shell" });
    store.updateProjectBoardCardCandidateStatus(controls!.id, "rejected");

    const afterSecondBatch = store.applyProjectBoardSynthesis(
      board.id,
      {
        ...firstBatch,
        summary: "Second batch.",
        sourceNotes: ["Second section."],
        cards: [
          {
            ...firstBatch.cards[0],
            title: "Create the PixiJS game shell",
            description: "Create a PixiJS shell with Matter.js boundaries.",
            labels: ["foundation", "pixijs"],
          },
          {
            ...firstBatch.cards[1],
            title: "Implement hybrid Newtonian controls",
            description: "Use thrust, drift, and compensation jets.",
            candidateStatus: "ready_to_create",
          },
          {
            sourceId: "synthesis:encounters",
            title: "Add enemy encounters",
            description: "Spawn basic hostile drones after the shell and controls exist.",
            candidateStatus: "needs_clarification",
            priority: 3,
            phase: "Core",
            labels: ["encounters"],
            blockedBy: ["synthesis:controls"],
            sourceRefs: ["GDD.md#encounters"],
            acceptanceCriteria: ["A drone can spawn."],
            testPlan: { unit: ["Spawn proof."], integration: [], visual: [], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );

    expect(afterSecondBatch.cards.find((card) => card.sourceId === "synthesis:placeholder")).toBeUndefined();
    expect(afterSecondBatch.cards.find((card) => card.sourceId === "synthesis:encounters")).toMatchObject({
      title: "Add enemy encounters",
      status: "draft",
    });
    const preservedShell = afterSecondBatch.cards.find((card) => card.sourceId === "synthesis:shell");
    expect(preservedShell).toMatchObject({
      id: shell!.id,
      title: "Create the visible game shell",
      userTouchedFields: expect.arrayContaining(["title"]),
      pendingPiUpdate: expect.objectContaining({
        title: "Create the PixiJS game shell",
        description: "Create a PixiJS shell with Matter.js boundaries.",
        changedFields: expect.arrayContaining(["title", "description", "labels"]),
      }),
    });
    const preservedRejected = afterSecondBatch.cards.find((card) => card.sourceId === "synthesis:controls");
    expect(preservedRejected).toMatchObject({
      id: controls!.id,
      candidateStatus: "rejected",
      userTouchedFields: expect.arrayContaining(["candidateStatus"]),
      pendingPiUpdate: expect.objectContaining({
        title: "Implement hybrid Newtonian controls",
        candidateStatus: "ready_to_create",
        changedFields: expect.arrayContaining(["title", "description", "candidateStatus"]),
      }),
    });
    const synthesisEvent = afterSecondBatch.events?.find((event) => event.kind === "board_synthesized");
    expect(synthesisEvent).toMatchObject({
      kind: "board_synthesized",
      metadata: expect.objectContaining({
        protectedPiUpdateCount: 2,
        protectedPiUpdateSourceIds: expect.arrayContaining(["synthesis:shell", "synthesis:controls"]),
        replacedDraftCardCount: 1,
      }),
    });
  });

  it("can apply or ignore pending Pi updates on protected draft cards", () => {
    const board = store.createProjectBoard({ title: "Pi update resolution board" });
    const draft: ProjectBoardSynthesisDraft = {
      summary: "First pass.",
      goal: "Build a spaceship board.",
      currentState: "Initial card exists.",
      targetUser: "Developer.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:shell",
          title: "Create game shell",
          description: "Create a nonblank game canvas.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["foundation"],
          blockedBy: [],
          sourceRefs: ["GDD.md#shell"],
          acceptanceCriteria: ["Canvas renders."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
        },
      ],
    };
    const first = store.applyProjectBoardSynthesis(board.id, draft, { replaceExistingDraft: true, insertQuestions: false });
    const shell = first.cards.find((card) => card.sourceId === "synthesis:shell");
    expect(shell).toBeTruthy();
    store.updateProjectBoardCard({ cardId: shell!.id, title: "Manual shell title" });
    store.applyProjectBoardSynthesis(
      board.id,
      {
        ...draft,
        cards: [{ ...draft.cards[0], title: "Pi shell title", description: "Pi proposes a richer shell." }],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );

    const updated = store.resolveProjectBoardCardPiUpdate({ cardId: shell!.id, action: "apply" });
    expect(updated).toMatchObject({
      title: "Pi shell title",
      description: "Pi proposes a richer shell.",
      pendingPiUpdate: undefined,
      userTouchedFields: expect.arrayContaining(["title", "description"]),
    });

    store.applyProjectBoardSynthesis(
      board.id,
      {
        ...draft,
        cards: [{ ...draft.cards[0], title: "Ignored Pi shell title", description: "Ignored description." }],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );
    const ignored = store.resolveProjectBoardCardPiUpdate({ cardId: shell!.id, action: "ignore" });
    expect(ignored).toMatchObject({
      title: "Pi shell title",
      pendingPiUpdate: undefined,
    });
  });

  it("does not restage answered clarification defaults as planning Pi updates", () => {
    const board = store.createProjectBoard({ title: "Answered clarification resynthesis board" });
    const question = "Should numpad operators map directly to calculator operators?";
    const answer = "Map numpad operators directly to matching calculator operators.";
    const synthesisDraft: ProjectBoardSynthesisDraft = {
      summary: "Keyboard board.",
      goal: "Build keyboard support.",
      currentState: "A draft card needs one PM decision.",
      targetUser: "Calculator user.",
      qualityBar: "Every card needs proof.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:keyboard",
          title: "Implement keyboard input",
          description: "Handle calculator keyboard input.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Input",
          labels: ["input"],
          blockedBy: [],
          sourceRefs: ["plan.md#keyboard"],
          acceptanceCriteria: ["Numpad operators can be entered from the keyboard."],
          testPlan: { unit: ["Input mapping tests."], integration: [], visual: [], manual: [] },
          clarificationQuestions: [question],
          clarificationSuggestions: [
            {
              question,
              suggestedAnswer: answer,
              rationale: "This is standard calculator behavior and is safe as an implementation default.",
              confidence: "high",
              safeToAccept: true,
              questionKind: "expert_default",
            },
          ],
        },
      ],
    };
    const synthesized = store.applyProjectBoardSynthesis(board.id, synthesisDraft, { replaceExistingDraft: true, insertQuestions: false });
    const keyboard = synthesized.cards.find((card) => card.sourceId === "synthesis:keyboard")!;
    const answeredAt = "2026-01-02T00:00:00.000Z";
    const answered = store.updateProjectBoardCard({
      cardId: keyboard.id,
      candidateStatus: "ready_to_create",
      clarificationQuestions: [],
      clarificationAnswers: [{ question, answer, answeredAt }],
      clarificationDecisions: (keyboard.clarificationDecisions ?? []).map((decision) => ({
        ...decision,
        state: "answered",
        answer,
        answeredAt,
      })),
    });
    expect(answered).toMatchObject({
      candidateStatus: "ready_to_create",
      clarificationQuestions: [],
      clarificationDecisions: [expect.objectContaining({ state: "answered", answer })],
    });
    (store as unknown as { requireDb: () => { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } } })
      .requireDb()
      .prepare("UPDATE project_board_cards SET pending_pi_update_json = ? WHERE id = ?")
      .run(
        JSON.stringify({
          sourceId: "synthesis:keyboard",
          createdAt: answeredAt,
          changedFields: ["candidateStatus", "clarificationDecisions"],
          candidateStatus: "needs_clarification",
          clarificationQuestions: [question],
          clarificationDecisions: (keyboard.clarificationDecisions ?? []).map((decision) => ({
            ...decision,
            state: "open",
            suggestedAnswer: answer,
          })),
        }),
        keyboard.id,
      );
    expect(store.getProjectBoardCard(keyboard.id).pendingPiUpdate).toBeUndefined();

    store.applyProjectBoardSynthesis(board.id, synthesisDraft, { replaceExistingDraft: true, insertQuestions: false });
    expect(store.getProjectBoardCard(keyboard.id).pendingPiUpdate).toBeUndefined();

    store.applyProjectBoardSynthesis(
      board.id,
      {
        ...synthesisDraft,
        cards: [{ ...synthesisDraft.cards[0], title: "Implement keyboard input with settled operator policy" }],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );
    const staged = store.getProjectBoardCard(keyboard.id);
    expect(staged.pendingPiUpdate).toMatchObject({
      title: "Implement keyboard input with settled operator policy",
      changedFields: ["title"],
    });
    expect(staged.pendingPiUpdate?.changedFields).not.toContain("candidateStatus");
    expect(staged.pendingPiUpdate?.changedFields).not.toContain("clarificationQuestions");
    expect(staged.pendingPiUpdate?.changedFields).not.toContain("clarificationDecisions");

    const applied = store.resolveProjectBoardCardPiUpdate({ cardId: keyboard.id, action: "apply" });
    expect(applied).toMatchObject({
      title: "Implement keyboard input with settled operator policy",
      candidateStatus: "ready_to_create",
      clarificationQuestions: [],
      clarificationDecisions: [expect.objectContaining({ state: "answered", answer })],
      pendingPiUpdate: undefined,
    });
  });

  it("stages PM decision draft refreshes as reviewable Pi updates before rewriting draft specs", () => {
    const board = store.createProjectBoard({ title: "Decision refresh board" });
    const synthesisDraft: ProjectBoardSynthesisDraft = {
      summary: "Animated hello board.",
      goal: "Build a tiny animated hello-world page.",
      currentState: "No implementation exists.",
      targetUser: "Browser user.",
      qualityBar: "Every card needs proof.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:animation",
          title: "Create animated hello-world page",
          description: "Build a browser page that renders Hello from Ambient.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["html"],
          blockedBy: [],
          sourceRefs: ["DurablePlan.md#animation"],
          acceptanceCriteria: ["Greeting renders."],
          testPlan: { unit: [], integration: ["Run browser smoke."], visual: [], manual: [] },
          clarificationQuestions: ["Should the greeting use a pulse or confetti animation?"],
        },
        {
          sourceId: "synthesis:style",
          title: "Tune greeting animation style",
          description: "Tune the greeting animation style after the base page exists.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Polish",
          labels: ["animation"],
          blockedBy: ["synthesis:animation"],
          sourceRefs: ["DurablePlan.md#animation"],
          acceptanceCriteria: ["Animation style is intentional."],
          testPlan: { unit: [], integration: [], visual: ["Capture animation screenshot."], manual: [] },
          clarificationQuestions: ["Should the greeting use a pulse or confetti animation?"],
        },
        {
          sourceId: "synthesis:approved",
          title: "Prepare approved page shell",
          description: "Approved task that should not be rewritten by decision refresh.",
          candidateStatus: "ready_to_create",
          priority: 3,
          phase: "Foundation",
          labels: ["approved"],
          blockedBy: [],
          sourceRefs: ["DurablePlan.md#shell"],
          acceptanceCriteria: ["Shell task is ready."],
          testPlan: { unit: ["Validate shell helper."], integration: [], visual: [], manual: [] },
        },
      ],
    };
    const synthesized = store.applyProjectBoardSynthesis(board.id, synthesisDraft, { insertQuestions: false });
    const animation = synthesized.cards.find((card) => card.sourceId === "synthesis:animation");
    const style = synthesized.cards.find((card) => card.sourceId === "synthesis:style");
    const approvedDraft = synthesized.cards.find((card) => card.sourceId === "synthesis:approved");
    expect(animation).toBeTruthy();
    expect(style).toBeTruthy();
    expect(approvedDraft).toBeTruthy();
    const approved = store.approveProjectBoardCard(approvedDraft!.id);

    store.stageProjectBoardDecisionDraftPiUpdates({
      cardId: animation!.id,
      question: "Should the greeting use a pulse or confetti animation?",
      answer: "Use a subtle pulse animation.",
      model: "gmi-test-model",
      telemetry: { promptCharCount: 800, responseCharCount: 260, requestDurationMs: 1200 },
      suggestions: [
        {
          cardId: animation!.id,
          description: "Build a browser page that renders Hello from Ambient with a subtle pulse animation.",
          labels: ["html", "animation"],
          acceptanceCriteria: ["Greeting renders.", "Pulse animation is visible but not distracting."],
          testPlan: {
            unit: [],
            integration: ["Run browser smoke."],
            visual: ["Capture desktop and mobile screenshots showing the pulse animation."],
            manual: [],
          },
          clarificationQuestions: [],
          rationale: "The PM selected pulse.",
          confidence: "high",
        },
        {
          cardId: style!.id,
          description: "Tune the greeting pulse animation so it is subtle, accessible, and non-distracting.",
          labels: ["animation", "polish"],
          acceptanceCriteria: ["Pulse timing is subtle.", "Motion remains readable."],
          testPlan: { unit: [], integration: [], visual: ["Capture animation screenshot."], manual: [] },
          clarificationQuestions: [],
          rationale: "Duplicate animation wording resolves to the same PM decision.",
          confidence: "high",
        },
      ],
    });

    const stagedAnimation = store.getProjectBoardCard(animation!.id);
    const stagedStyle = store.getProjectBoardCard(style!.id);
    const untouchedApproved = store.getProjectBoardCard(approved.id);
    expect(stagedAnimation.description).toBe("Build a browser page that renders Hello from Ambient.");
    expect(stagedAnimation.pendingPiUpdate).toMatchObject({
      description: "Build a browser page that renders Hello from Ambient with a subtle pulse animation.",
      changedFields: expect.arrayContaining([
        "description",
        "labels",
        "acceptanceCriteria",
        "testPlan",
        "clarificationQuestions",
        "clarificationAnswers",
        "clarificationDecisions",
      ]),
      clarificationQuestions: [],
      clarificationAnswers: [expect.objectContaining({ answer: "Use a subtle pulse animation." })],
      clarificationDecisions: [expect.objectContaining({ state: "answered", answer: "Use a subtle pulse animation." })],
    });
    expect(stagedStyle.pendingPiUpdate).toMatchObject({
      description: "Tune the greeting pulse animation so it is subtle, accessible, and non-distracting.",
      clarificationQuestions: [],
      clarificationAnswers: [expect.objectContaining({ answer: "Use a subtle pulse animation." })],
      clarificationDecisions: [expect.objectContaining({ state: "answered", answer: "Use a subtle pulse animation." })],
    });
    expect(untouchedApproved.pendingPiUpdate).toBeUndefined();
    expect(untouchedApproved.runFeedback ?? []).toEqual([]);

    const applied = store.resolveProjectBoardCardPiUpdate({ cardId: animation!.id, action: "apply" });
    expect(applied).toMatchObject({
      description: "Build a browser page that renders Hello from Ambient with a subtle pulse animation.",
      labels: ["html", "animation"],
      clarificationQuestions: [],
      pendingPiUpdate: undefined,
      userTouchedFields: expect.arrayContaining(["description", "clarificationAnswers", "clarificationDecisions"]),
    });
    expect(applied.clarificationAnswers).toEqual([expect.objectContaining({ answer: "Use a subtle pulse animation." })]);
    expect(applied.clarificationDecisions).toEqual([expect.objectContaining({ state: "answered", answer: "Use a subtle pulse animation." })]);

    const event = store.getActiveProjectBoard()?.events?.find((candidate) => candidate.title === "Decision draft Pi refresh proposed");
    expect(event?.metadata).toMatchObject({
      decisionImpact: expect.objectContaining({
        appliedAction: "propose_targeted_draft_refresh",
        modelCallRequired: true,
        pendingPiUpdateCardIds: expect.arrayContaining([animation!.id, style!.id]),
        existingCardsRewritten: false,
        model: "gmi-test-model",
      }),
    });
  });

  it("stores large source-scoped synthesis batches without truncating rich design docs to 24 cards", () => {
    const board = store.createProjectBoard({ title: "Large design doc board" });
    const synthesisDraft: ProjectBoardSynthesisDraft = {
      summary: "Source-scoped elaboration from a large game design document.",
      goal: "Decompose the selected design document into source-grounded candidate cards.",
      currentState: "A rich spec contains more than two dozen distinct systems.",
      targetUser: "Project manager reviewing generated implementation cards.",
      qualityBar: "Every generated card carries proof expectations.",
      assumptions: ["The selected source is authoritative for this elaboration pass."],
      questions: [],
      sourceNotes: ["GAME_DESIGN_DOCUMENT.md is the selected source scope."],
      cards: Array.from({ length: 36 }, (_, index) => ({
        sourceId: `synthesis:design-system-${index + 1}`,
        title: `Implement design system ${index + 1}`,
        description: `Create a self-contained slice for design system ${index + 1}.`,
        candidateStatus: "needs_clarification",
        priority: index + 1,
        phase: index < 12 ? "Foundation" : index < 24 ? "Gameplay" : "Polish",
        labels: ["source-scoped", "game-design"],
        blockedBy: index === 0 ? [] : [`synthesis:design-system-${index}`],
        sourceRefs: ["GAME_DESIGN_DOCUMENT.md"],
        acceptanceCriteria: [`Design system ${index + 1} has observable behavior.`],
        testPlan: {
          unit: [`Unit proof for design system ${index + 1}.`],
          integration: [],
          visual: index % 3 === 0 ? [`Visual proof for design system ${index + 1}.`] : [],
          manual: [],
        },
      })),
    };

    const synthesized = store.applyProjectBoardSynthesis(board.id, synthesisDraft);

    expect(synthesized.cards.filter((card) => card.sourceKind === "board_synthesis")).toHaveLength(36);
    expect(synthesized.events?.[0]).toMatchObject({
      kind: "board_synthesized",
      metadata: expect.objectContaining({ cardIds: expect.arrayContaining([synthesized.cards[35].id]) }),
    });
  });

  it("stores Pi synthesis as a reviewable proposal before applying draft cards", () => {
    const board = store.createProjectBoard({ title: "Proposal board" });
    const synthesisDraft: ProjectBoardSynthesisDraft = {
      summary: "Live Pi spaceship synthesis.",
      goal: "Build a WebGL spaceship game with clear project-manager decomposition.",
      currentState: "Architecture notes and rough planning artifacts exist.",
      targetUser: "Browser game player.",
      qualityBar: "Each card needs acceptance criteria and at least one runnable proof expectation.",
      assumptions: ["Use Three.js for the initial rendering stack."],
      questions: ["Should the first control model be arcade movement or inertia-based thrust?"],
      sourceNotes: ["docs/architecture.md describes Three.js rendering and keyboard controls."],
      cards: [
        {
          sourceId: "synthesis:render-shell",
          title: "Create render shell",
          description: "Mount a nonblank WebGL canvas and isolate render-loop setup.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["webgl"],
          blockedBy: [],
          acceptanceCriteria: ["Canvas renders a visible scene."],
          testPlan: { unit: ["Test render-loop helpers."], integration: ["Mount the game scene."], visual: [], manual: [] },
          sourceRefs: ["docs/architecture.md"],
          clarificationQuestions: ["Should the shell use Three.js or PixiJS?"],
          objectiveProvenance: {
            objective: "Add accessibility follow-up cards.",
            groundingMode: "source_scan",
            selectedSourceIds: [],
            sourceRefCount: 1,
            weakGrounding: false,
          },
        },
        {
          sourceId: "synthesis:controls",
          title: "Add ship controls",
          description: "Translate keyboard input into ship motion.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Gameplay",
          labels: ["controls"],
          blockedBy: ["synthesis:render-shell"],
          acceptanceCriteria: ["Ship responds to keyboard movement."],
          testPlan: { unit: ["Test input reducer."], integration: [], visual: [], manual: ["Play one movement pass."] },
          sourceRefs: ["docs/architecture.md"],
          clarificationQuestions: ["Should controls be arcade or inertia based?"],
          objectiveProvenance: {
            objective: "Add accessibility follow-up cards.",
            groundingMode: "selected_sources",
            selectedSourceIds: ["source-architecture"],
            sourceRefCount: 1,
            weakGrounding: false,
          },
        },
        {
          sourceId: "synthesis:visual-polish",
          title: "Add visual polish",
          description: "Add particle effects after the core slice is working.",
          candidateStatus: "needs_clarification",
          priority: 3,
          phase: "Polish",
          labels: ["polish"],
          blockedBy: ["synthesis:controls"],
          acceptanceCriteria: ["Deferred polish does not block the first playable slice."],
          testPlan: { unit: [], integration: [], visual: ["Inspect particles."], manual: [] },
          sourceRefs: ["TODO.md"],
        },
        {
          sourceId: "synthesis:boss",
          title: "Prototype boss encounter",
          description: "Explore a boss encounter after MVP proof.",
          candidateStatus: "needs_clarification",
          priority: 4,
          phase: "Later",
          labels: ["later"],
          blockedBy: ["synthesis:controls"],
          acceptanceCriteria: ["Boss scope is explicitly rejected for MVP."],
          testPlan: { unit: [], integration: [], visual: [], manual: ["Review scope decision."] },
          sourceRefs: ["TODO.md"],
        },
      ],
    };
    const mergeTarget = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Existing controls draft",
      description: "Earlier manual card for controls.",
    });

    const proposal = store.createProjectBoardSynthesisProposal({
      boardId: board.id,
      synthesis: synthesisDraft,
      model: "zai-org/GLM-5.1-FP8",
      durationMs: 1234,
    });
    const proposalRun = store.createProjectBoardSynthesisRun({
      boardId: board.id,
      model: "zai-org/GLM-5.1-FP8",
    });
    store.recordProjectBoardSynthesisRunEvent(proposalRun.id, {
      stage: "proposal_created",
      title: "Created PM Review proposal",
      summary: "Created the review proposal that will later be applied to the draft board.",
      proposalId: proposal.id,
      status: "succeeded",
      cardCount: synthesisDraft.cards.length,
      questionCount: synthesisDraft.questions.length,
      completedAt: "2026-05-17T12:00:00.000Z",
    });
    let summary = store.getActiveProjectBoard()!;

    expect(proposal).toMatchObject({
      status: "pending",
      model: "zai-org/GLM-5.1-FP8",
      durationMs: 1234,
      summary: "Live Pi spaceship synthesis.",
    });
    expect(summary.proposals).toHaveLength(1);
    expect(summary.proposals[0]).toMatchObject({ id: proposal.id, cards: expect.arrayContaining([expect.objectContaining({ sourceId: "synthesis:render-shell" })]) });
    expect(summary.cards.filter((card) => card.sourceKind === "board_synthesis")).toHaveLength(0);
    expect(summary.events?.[0]).toMatchObject({
      kind: "synthesis_proposal_created",
      entityId: proposal.id,
      metadata: expect.objectContaining({ cardCount: 4, durationMs: 1234 }),
    });

    const answered = store.answerProjectBoardSynthesisProposalQuestion({
      proposalId: proposal.id,
      questionIndex: 0,
      answer: "Use arcade movement for the first playable slice; defer inertia until later.",
    });
    expect(answered.answers).toEqual([
      expect.objectContaining({
        questionIndex: 0,
        question: "Should the first control model be arcade movement or inertia-based thrust?",
        answer: "Use arcade movement for the first playable slice; defer inertia until later.",
      }),
    ]);
    summary = store.getActiveProjectBoard()!;
    expect(summary.proposals[0].answers).toHaveLength(1);
    expect(summary.events?.[0]).toMatchObject({
      kind: "synthesis_proposal_answered",
      entityId: proposal.id,
      metadata: expect.objectContaining({ questionIndex: 0 }),
    });
    expect(() => store.applyProjectBoardSynthesisProposal({ proposalId: proposal.id })).toThrow("Review every proposal card before applying accepted cards.");

    store.reviewProjectBoardSynthesisProposalCard({
      proposalId: proposal.id,
      sourceId: "synthesis:render-shell",
      reviewStatus: "accepted",
    });
    store.reviewProjectBoardSynthesisProposalCard({
      proposalId: proposal.id,
      sourceId: "synthesis:controls",
      reviewStatus: "merged",
      mergeTargetCardId: mergeTarget.id,
      reason: "Merge with existing controls draft.",
    });
    store.reviewProjectBoardSynthesisProposalCard({
      proposalId: proposal.id,
      sourceId: "synthesis:visual-polish",
      reviewStatus: "deferred",
      reason: "Keep for later polish pass.",
    });
    const reviewed = store.reviewProjectBoardSynthesisProposalCard({
      proposalId: proposal.id,
      sourceId: "synthesis:boss",
      reviewStatus: "rejected",
      reason: "Boss scope is out of MVP.",
    });
    expect(reviewed.cards.map((card) => [card.sourceId, card.reviewStatus])).toEqual([
      ["synthesis:render-shell", "accepted"],
      ["synthesis:controls", "merged"],
      ["synthesis:visual-polish", "deferred"],
      ["synthesis:boss", "rejected"],
    ]);

    summary = store.applyProjectBoardSynthesisProposal({ proposalId: proposal.id });
    expect(summary.proposals[0]).toMatchObject({ id: proposal.id, status: "applied", appliedAt: expect.any(String) });
    expect(summary.cards.filter((card) => card.sourceKind === "board_synthesis").map((card) => card.sourceId)).toEqual([
      "synthesis:render-shell",
    ]);
    expect(summary.cards.find((card) => card.sourceId === "synthesis:render-shell")).toMatchObject({
      sourceRefs: ["docs/architecture.md"],
      clarificationQuestions: ["Should the shell use Three.js or PixiJS?"],
      objectiveProvenance: expect.objectContaining({
        objective: "Add accessibility follow-up cards.",
        groundingMode: "source_scan",
      }),
    });
    expect(summary.cards.find((card) => card.id === mergeTarget.id)).toMatchObject({
      title: "Add ship controls",
      blockedBy: ["synthesis:render-shell"],
      acceptanceCriteria: ["Ship responds to keyboard movement."],
      sourceRefs: ["docs/architecture.md"],
      clarificationQuestions: ["Should controls be arcade or inertia based?"],
      objectiveProvenance: expect.objectContaining({
        objective: "Add accessibility follow-up cards.",
        groundingMode: "selected_sources",
      }),
    });
    expect(summary.cards.map((card) => card.sourceId)).not.toEqual(expect.arrayContaining(["synthesis:visual-polish", "synthesis:boss"]));
    expect(summary.events?.map((event) => event.kind).slice(0, 2)).toEqual(["synthesis_proposal_applied", "board_synthesized"]);
    expect(summary.events?.[0].metadata).toMatchObject({
      acceptedSourceIds: ["synthesis:render-shell"],
      mergedSourceIds: ["synthesis:controls"],
      deferredSourceIds: ["synthesis:visual-polish"],
      rejectedSourceIds: ["synthesis:boss"],
      planningSnapshotRunId: proposalRun.id,
      planningSnapshotKind: "final",
      planningSnapshotCardIds: [summary.cards.find((card) => card.sourceId === "synthesis:render-shell")?.id],
    });
    expect(store.getProjectBoardSynthesisRun(proposalRun.id)?.planningSnapshots?.at(-1)).toMatchObject({
      kind: "final",
      planningStatus: "succeeded",
      cardIds: [summary.cards.find((card) => card.sourceId === "synthesis:render-shell")?.id],
    });

    const nextProposal = store.createProjectBoardSynthesisProposal({
      boardId: board.id,
      synthesis: { ...synthesisDraft, summary: "Replacement Pi proposal." },
    });
    const nextSummary = store.getActiveProjectBoard()!;
    expect(nextSummary.proposals.find((candidate) => candidate.id === nextProposal.id)?.status).toBe("pending");
    expect(nextSummary.proposals.find((candidate) => candidate.id === proposal.id)?.status).toBe("applied");
  });

  it("applies additive synthesis proposals after ticketization without rewriting protected Local Task cards", () => {
    const board = store.createProjectBoard({ title: "Add Cards after ticketization board" });
    const initialDraft: ProjectBoardSynthesisDraft = {
      summary: "Initial recipe index snapshot.",
      goal: "Build a recipe index from markdown sources.",
      currentState: "Core recipe markdown exists.",
      targetUser: "Home cook.",
      qualityBar: "Every executable card must include local verification.",
      assumptions: [],
      questions: [],
      sourceNotes: ["Core recipe index source is authoritative."],
      cards: [
        {
          sourceId: "synthesis:recipe-index-core",
          title: "Build the recipe index core",
          description: "Scan recipe markdown and generate a deterministic INDEX.md.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["recipe-index"],
          blockedBy: [],
          acceptanceCriteria: ["INDEX.md includes every recipe title."],
          testPlan: { unit: ["Run node --check build-index.mjs."], integration: ["Run node build-index.mjs."], visual: [], manual: [] },
          sourceRefs: ["docs/recipe-index-core.md"],
        },
      ],
    };

    const initial = store.applyProjectBoardSynthesis(board.id, initialDraft, { replaceExistingDraft: true, insertQuestions: false });
    const core = initial.cards.find((card) => card.sourceId === "synthesis:recipe-index-core")!;
    const ticketized = store.approveProjectBoardCard(core.id);
    const taskBefore = store.getOrchestrationTask(ticketized.orchestrationTaskId!);
    expect(ticketized).toMatchObject({
      id: core.id,
      status: "ready",
      title: "Build the recipe index core",
      orchestrationTaskId: expect.any(String),
    });

    const additiveProposal = store.createProjectBoardSynthesisProposal({
      boardId: board.id,
      synthesis: {
        summary: "Add mobile sharing cards.",
        goal: initialDraft.goal,
        currentState: "The recipe index core has already been ticketized.",
        targetUser: initialDraft.targetUser,
        qualityBar: initialDraft.qualityBar,
        assumptions: [],
        questions: [],
        sourceNotes: ["New source docs/recipe-index-mobile-share.md adds shopping-list export and share-card scope."],
        cards: [
          {
            sourceId: "synthesis:recipe-shopping-list-export",
            title: "Add shopping-list export to recipe index",
            description: "Generate a shareable shopping-list view from selected recipes without changing the existing core Local Task.",
            candidateStatus: "needs_clarification",
            priority: 2,
            phase: "Add Cards",
            labels: ["recipe-index", "sharing"],
            blockedBy: ["synthesis:recipe-index-core"],
            acceptanceCriteria: ["A proposed card captures shopping-list export scope as additive work."],
            testPlan: { unit: ["Validate export data shape."], integration: [], visual: [], manual: ["Review export copy."] },
            sourceRefs: ["docs/recipe-index-mobile-share.md"],
          },
        ],
      },
      model: "test-model",
    });
    store.reviewProjectBoardSynthesisProposalCard({
      proposalId: additiveProposal.id,
      sourceId: "synthesis:recipe-shopping-list-export",
      reviewStatus: "accepted",
    });

    const summary = store.applyProjectBoardSynthesisProposal({ proposalId: additiveProposal.id, replaceExistingDraft: true });
    const protectedCore = summary.cards.find((card) => card.id === ticketized.id)!;
    const additive = summary.cards.find((card) => card.sourceId === "synthesis:recipe-shopping-list-export")!;

    expect(protectedCore).toMatchObject({
      id: ticketized.id,
      sourceId: "synthesis:recipe-index-core",
      title: "Build the recipe index core",
      description: "Scan recipe markdown and generate a deterministic INDEX.md.",
      status: "ready",
      orchestrationTaskId: ticketized.orchestrationTaskId,
      acceptanceCriteria: ["INDEX.md includes every recipe title."],
    });
    expect(additive).toMatchObject({
      status: "draft",
      orchestrationTaskId: undefined,
      blockedBy: ["synthesis:recipe-index-core"],
      sourceRefs: ["docs/recipe-index-mobile-share.md"],
    });
    expect(summary.cards.filter((card) => Boolean(card.orchestrationTaskId))).toHaveLength(1);
    expect(store.getOrchestrationTask(ticketized.orchestrationTaskId!)).toEqual(taskBefore);
    expect(summary.proposals.find((proposal) => proposal.id === additiveProposal.id)).toMatchObject({ status: "applied" });
    expect(summary.events?.[0]).toMatchObject({
      kind: "synthesis_proposal_applied",
      metadata: expect.objectContaining({
        acceptedSourceIds: ["synthesis:recipe-shopping-list-export"],
      }),
    });
  });

  it("persists lightweight PM review reports without generated cards", () => {
    const board = store.createProjectBoard({ title: "Lightweight PM review board" });
    const synthesisDraft: ProjectBoardSynthesisDraft = {
      summary: "Charter review needs one answer.",
      goal: "Build a focused editor.",
      currentState: "Kickoff answers and source scan are available.",
      targetUser: "Desktop note taker.",
      qualityBar: "Every later generated card needs proof.",
      assumptions: ["The active charter is the source of truth."],
      questions: ["Should offline sync be in scope for v1?"],
      sourceNotes: ["Authority: PRD outranks scratch notes."],
      cards: [],
    };
    const reviewReport = {
      readiness: "needs_answers" as const,
      summary: "The charter is mostly coherent, but one product-scope question blocks confident card generation.",
      sourceConfidence: "medium" as const,
      sourceConfidenceNotes: ["The PRD is primary, but scratch TODO scope conflicts remain."],
      gitState: "git_ready" as const,
      gitStateNotes: ["Board artifacts can be coordinated through Git."],
      blockingQuestions: ["Should offline sync be in scope for v1?"],
      risks: ["Offline sync would change persistence and test strategy."],
      sourceConflicts: ["Scratch TODO mentions cloud sync, but the PRD says local-first."],
      sourceAuthorityNotes: ["Treat the PRD as primary and scratch TODO as context."],
      recommendedActivationScope: "Answer the sync scope question, then generate the draft board from the recommendation.",
      cardGenerationConstraints: ["Do not generate sync cards unless the user explicitly includes offline sync."],
    };

    const proposal = store.createProjectBoardSynthesisProposal({
      boardId: board.id,
      synthesis: synthesisDraft,
      reviewReport,
      model: "test-model",
    });

    expect(proposal.cards).toEqual([]);
    expect(proposal.reviewReport).toEqual(reviewReport);
    expect(proposal.questions).toEqual(["Should offline sync be in scope for v1?"]);
    expect(() => store.applyProjectBoardSynthesisProposal({ proposalId: proposal.id })).toThrow(
      "Lightweight PM review reports do not apply cards.",
    );

    const summary = store.getActiveProjectBoard()!;
    expect(summary.proposals[0]).toMatchObject({
      id: proposal.id,
      reviewReport,
      cards: [],
    });
    expect(summary.events?.[0]).toMatchObject({
      kind: "synthesis_proposal_created",
      title: "Pi charter review ready",
      metadata: expect.objectContaining({ reviewReport: true, readiness: "needs_answers", cardCount: 0 }),
    });
  });

  it("updates pending synthesis proposals while preserving still-current card reviews", () => {
    const board = store.createProjectBoard({ title: "Progressive proposal board" });
    const initialDraft: ProjectBoardSynthesisDraft = {
      summary: "Initial partial synthesis.",
      goal: "Decompose a spaceship game.",
      currentState: "Sources have started streaming.",
      targetUser: "Player.",
      qualityBar: "Proof required.",
      assumptions: ["Use the source corpus."],
      questions: ["Which camera behavior is canonical?"],
      sourceNotes: ["First source section covered."],
      cards: [
        {
          sourceId: "synthesis:shell",
          title: "Create shell",
          description: "Create the game shell.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["shell"],
          blockedBy: [],
          acceptanceCriteria: ["Shell mounts."],
          testPlan: { unit: ["Test shell helpers."], integration: [], visual: [], manual: [] },
          sourceRefs: ["gdd.md#shell"],
        },
        {
          sourceId: "synthesis:controls",
          title: "Create controls",
          description: "Create the first control model.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Gameplay",
          labels: ["controls"],
          blockedBy: ["synthesis:shell"],
          acceptanceCriteria: ["Ship moves."],
          testPlan: { unit: ["Test controls reducer."], integration: [], visual: [], manual: [] },
          sourceRefs: ["gdd.md#controls"],
        },
      ],
    };
    const proposal = store.createProjectBoardSynthesisProposal({ boardId: board.id, synthesis: initialDraft, model: "test-model" });
    store.reviewProjectBoardSynthesisProposalCard({ proposalId: proposal.id, sourceId: "synthesis:shell", reviewStatus: "accepted" });
    store.reviewProjectBoardSynthesisProposalCard({
      proposalId: proposal.id,
      sourceId: "synthesis:controls",
      reviewStatus: "deferred",
      reason: "Wait for physics details.",
    });

    const updated = store.updateProjectBoardSynthesisProposal({
      proposalId: proposal.id,
      model: "test-model",
      durationMs: 2500,
      synthesis: {
        ...initialDraft,
        summary: "Updated progressive synthesis.",
        questions: ["Which camera behavior is canonical?", "Should dodge be a separate card?"],
        cards: [
          initialDraft.cards[0],
          {
            ...initialDraft.cards[1],
            description: "Create the first control model with hybrid Newtonian thrust.",
            acceptanceCriteria: ["Ship moves.", "Compensation jets counter overshoot."],
          },
          {
            sourceId: "synthesis:enemy-wave",
            title: "Add enemy wave",
            description: "Add the first enemy encounter.",
            candidateStatus: "needs_clarification",
            priority: 3,
            phase: "Gameplay",
            labels: ["combat"],
            blockedBy: ["synthesis:controls"],
            acceptanceCriteria: ["Enemy wave spawns."],
            testPlan: { unit: [], integration: ["Run one encounter."], visual: [], manual: [] },
            sourceRefs: ["gdd.md#enemies"],
          },
        ],
      },
    });

    expect(updated).toMatchObject({ id: proposal.id, summary: "Updated progressive synthesis.", durationMs: 2500 });
    expect(updated.questions).toHaveLength(2);
    expect(updated.cards.map((card) => [card.sourceId, card.reviewStatus, card.reviewReason])).toEqual([
      ["synthesis:shell", "accepted", undefined],
      ["synthesis:controls", "pending", undefined],
      ["synthesis:enemy-wave", "pending", undefined],
    ]);
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "synthesis_proposal_created",
      title: "Pi synthesis proposal updated",
      metadata: expect.objectContaining({ progressiveUpdate: true, cardCount: 3 }),
    });
  });

  it("records project-board synthesis run telemetry and failed diagnostics", () => {
    const board = store.createProjectBoard({ title: "Telemetry board" });
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "zai-org/GLM-5.1-FP8" });

    expect(run).toMatchObject({
      boardId: board.id,
      status: "running",
      stage: "source_scan",
      model: "zai-org/GLM-5.1-FP8",
      events: [expect.objectContaining({ title: "Synthesis run started" })],
    });

    store.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "source_scan",
      title: "Scanned project sources",
      summary: "Scanned 5 sources and kept 4 for synthesis.",
      metadata: { sourceCount: 5, includedSourceCount: 4, sourceCharCount: 2400 },
      sourceCount: 5,
      includedSourceCount: 4,
      sourceCharCount: 2400,
    });
    store.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "model_request",
      title: "Asked Ambient/Pi",
      summary: "Sent prompt to Ambient/Pi.",
      metadata: { promptCharCount: 8300 },
      promptCharCount: 8300,
    });
    const progressed = store.recordProjectBoardSynthesisRunProgressiveRecords(run.id, [
      {
        type: "candidate_card",
        sourceId: "synthesis:shell",
        title: "Create shell",
        description: "Create the project shell.",
        candidateStatus: "ready_to_create",
        labels: ["foundation"],
        blockedBy: [],
        sourceRefs: [{ sourceId: "source-1" }],
        acceptanceCriteria: ["Shell exists."],
        testPlan: { unit: [], integration: ["Run the app."], visual: ["Screenshot."], manual: [] },
      },
      {
        type: "question",
        questionId: "question:shell",
        question: "Which renderer should the shell use?",
        required: true,
        createdAt: "2026-05-02T11:59:00.000Z",
      },
      {
        type: "source_coverage",
        sourceId: "source-1",
        status: "covered",
        cardIds: ["synthesis:shell"],
        updatedAt: "2026-05-02T11:59:00.000Z",
      },
    ]);
    expect(progressed).toMatchObject({
      stage: "schema_validation",
      cardCount: 1,
      questionCount: 1,
      progressiveRecordCount: 3,
      progressiveSummary: {
        candidateCardCount: 1,
        questionCount: 1,
        sourceCoverageCount: 1,
        latestCandidateCardTitle: "Create shell",
        latestQuestion: "Which renderer should the shell use?",
        renderedCardCount: 1,
        renderedCardBlockedCount: 0,
        renderedCardDuplicateCount: 0,
        renderedCardSplitLineageCount: 0,
        renderedCardLedgerChecksum: expect.stringMatching(/^rendered-card-ledger-/),
        renderedCardLedger: [
          expect.objectContaining({
            cardId: "synthesis:shell",
            title: "Create shell",
            candidateStatus: "ready_to_create",
            clarificationState: "none",
            duplicateDecision: "unique",
            restartAction: "reuse_rendered_card",
            renderFingerprint: expect.stringMatching(/^rendered-card-/),
          }),
        ],
      },
    });
    const failed = store.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "failed",
      title: "Synthesis run failed",
      summary: "Ambient project-board synthesis did not return valid JSON.",
      metadata: { error: "invalid json" },
      status: "failed",
      error: "Ambient project-board synthesis did not return valid JSON.",
      completedAt: "2026-05-02T12:00:00.000Z",
    });

    expect(failed).toMatchObject({
      status: "failed",
      stage: "failed",
      sourceCount: 5,
      includedSourceCount: 4,
      sourceCharCount: 2400,
      promptCharCount: 8300,
      progressiveRecordCount: 3,
      error: "Ambient project-board synthesis did not return valid JSON.",
      completedAt: "2026-05-02T12:00:00.000Z",
    });
    expect(failed.events.map((event) => event.stage)).toEqual(["source_scan", "source_scan", "model_request", "schema_validation", "failed"]);

    const summary = store.getActiveProjectBoard()!;
    expect(summary.synthesisRuns?.[0]).toMatchObject({
      id: run.id,
      status: "failed",
      events: expect.arrayContaining([expect.objectContaining({ title: "Synthesis run failed" })]),
    });
  });

  it("persists planning snapshots and records chosen snapshot provenance during ticketization", () => {
    const board = store.createProjectBoard({ title: "Snapshot transaction board" });
    const [source] = store.replaceProjectBoardSources(board.id, [
      {
        kind: "functional_spec",
        title: "Expense summarizer CSV fixture",
        summary: "Summarize expenses by category and flag unusual rows.",
        path: "expenses.csv",
        excerpt: "date,category,amount\n2026-05-01,travel,42.00",
        relevance: 100,
      },
    ]);
    store.updateProjectBoardStatus(board.id, "active");
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "gmi-test-model" });

    const synthesized = store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Expense summary board.",
        goal: "Create a CSV expense summarizer.",
        currentState: "The source CSV is present.",
        targetUser: "Finance operator.",
        qualityBar: "Ticketized work must include deterministic proof.",
        assumptions: [],
        questions: [],
        sourceNotes: ["expenses.csv is the primary source."],
        cards: [
          {
            sourceId: "synthesis:expense-summary",
            title: "Implement CSV expense summary",
            description: "Read expenses.csv and summarize spending by category.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Foundation",
            labels: ["csv", "expense"],
            blockedBy: [],
            sourceRefs: [source.id],
            acceptanceCriteria: ["Summary groups rows by category."],
            testPlan: { unit: ["Run expense parser unit tests."], integration: [], visual: [], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false, snapshotRunId: run.id, snapshotKind: "incremental" },
    );
    const draftCard = synthesized.cards.find((card) => card.sourceId === "synthesis:expense-summary")!;
    const runningRun = store.getProjectBoardSynthesisRun(run.id)!;
    expect(runningRun.planningSnapshots).toHaveLength(1);
    const incrementalSnapshot = runningRun.planningSnapshots![0];
    expect(incrementalSnapshot).toMatchObject({
      kind: "incremental",
      planningStatus: "running",
      planningStage: "source_scan",
      cardCount: 1,
      readyCandidateCount: 1,
      ticketizedCount: 0,
      cardIds: [draftCard.id],
      sourceHashes: [expect.objectContaining({ sourceId: source.id, contentHash: source.contentHash })],
      cards: [expect.objectContaining({ cardId: draftCard.id, sourceId: "synthesis:expense-summary" })],
      renderFingerprint: expect.stringMatching(/^planning-snapshot-/),
    });

    const succeeded = store.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "board_applied",
      title: "Applied expense planning snapshot",
      summary: "The expense planning snapshot is ready for ticketization.",
      status: "succeeded",
      cardCount: 1,
      questionCount: 0,
      completedAt: "2026-05-17T12:00:00.000Z",
    });
    expect(succeeded.planningSnapshots).toHaveLength(2);
    expect(succeeded.planningSnapshots![0]).toEqual(incrementalSnapshot);
    const finalSnapshot = succeeded.planningSnapshots![1];
    expect(finalSnapshot).toMatchObject({
      kind: "final",
      planningStatus: "succeeded",
      planningStage: "board_applied",
      cardIds: [draftCard.id],
      readyCandidateCount: 1,
      ticketizedCount: 0,
      renderFingerprint: expect.stringMatching(/^planning-snapshot-/),
    });

    const [ticketized] = store.createReadyProjectBoardTasks(board.id);
    expect(ticketized).toMatchObject({ id: draftCard.id, status: "ready", orchestrationTaskId: expect.any(String) });
    const readyEvent = store.getActiveProjectBoard()?.events?.find((event) => event.kind === "ready_tasks_created");
    expect(readyEvent?.metadata).toMatchObject({
      planningSnapshotId: finalSnapshot.id,
      planningSnapshotRunId: run.id,
      planningSnapshotKind: "final",
      planningSnapshotFingerprint: finalSnapshot.renderFingerprint,
      planningSnapshotCardIds: [draftCard.id],
    });
  });

  it("updates project-board synthesis run progress without appending durable events", () => {
    const board = store.createProjectBoard({ title: "Progress board" });
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "zai-org/GLM-5.1-FP8" });

    const progressed = store.updateProjectBoardSynthesisRunProgress(run.id, {
      stage: "source_classification",
      responseCharCount: 1400,
      promptCharCount: 9200,
    });

    expect(progressed).toMatchObject({
      stage: "source_classification",
      promptCharCount: 9200,
      responseCharCount: 1400,
      events: [expect.objectContaining({ title: "Synthesis run started" })],
    });

    const progressedAgain = store.updateProjectBoardSynthesisRunProgress(run.id, {
      stage: "model_response",
      responseCharCount: 2600,
      cardCount: 2,
      questionCount: 1,
    });

    expect(progressedAgain).toMatchObject({
      stage: "model_response",
      promptCharCount: 9200,
      responseCharCount: 2600,
      cardCount: 2,
      questionCount: 1,
    });
    expect(progressedAgain.events.map((event) => event.title)).toEqual(["Synthesis run started"]);
  });

  it("ignores stale project-board synthesis progress for missing or terminal runs", () => {
    const board = store.createProjectBoard({ title: "Stale progress board" });
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "zai-org/GLM-5.1-FP8" });
    const paused = store.markProjectBoardSynthesisRunPaused({
      boardId: board.id,
      runId: run.id,
      reason: "Paused from the progress panel.",
    });

    expect(store.tryUpdateProjectBoardSynthesisRunProgress("missing-run", { stage: "model_response", responseCharCount: 1200 })).toBeUndefined();

    const ignored = store.tryUpdateProjectBoardSynthesisRunProgress(run.id, {
      stage: "model_response",
      responseCharCount: 1200,
      cardCount: 99,
    });

    expect(ignored).toMatchObject({
      id: run.id,
      status: "paused",
      stage: "paused",
      responseCharCount: paused.responseCharCount,
      cardCount: paused.cardCount,
    });
    expect(store.getProjectBoardSynthesisRun(run.id)).toMatchObject({
      status: "paused",
      stage: "paused",
      responseCharCount: paused.responseCharCount,
      cardCount: paused.cardCount,
    });
    expect(() => store.updateProjectBoardSynthesisRunProgress("missing-run", { stage: "model_response" })).toThrow(
      "Project board synthesis run not found: missing-run",
    );
  });

  it("summarizes semantic-idle section records for retryable synthesis recovery", () => {
    const board = store.createProjectBoard({ title: "Semantic idle board" });
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "zai-org/GLM-5.1-FP8" });

    const progressed = store.recordProjectBoardSynthesisRunProgressiveRecords(run.id, [
      {
        type: "progress",
        stage: "section_failed",
        title: "Stalled section 1/2",
        summary: "Movement stalled without model content or planner records.",
        createdAt: "2026-05-02T11:59:00.000Z",
        metadata: {
          sectionId: "section-movement",
          sectionStatus: "failed",
          failureKind: "semantic_idle_timeout",
          sectionHeading: "Movement",
          sectionIndex: 1,
          sectionCount: 2,
        },
      },
      {
        type: "error",
        code: "section_semantic_idle_timeout",
        message: "Movement stalled after 25ms without model content or planner records.",
        recoverable: true,
        createdAt: "2026-05-02T11:59:00.000Z",
        metadata: {
          sectionId: "section-movement",
          sourceId: "source-1",
          range: "lines:1-3",
          failureKind: "semantic_idle_timeout",
        },
      },
      {
        type: "source_coverage",
        sourceId: "source-1",
        range: "lines:1-3",
        status: "unresolved",
        cardIds: [],
        note: "Retry this section.",
        updatedAt: "2026-05-02T11:59:00.000Z",
      },
    ]);

    expect(progressed).toMatchObject({
      progressiveRecordCount: 3,
      progressiveSummary: {
        sectionFailedCount: 1,
        semanticIdleSectionCount: 1,
        latestSectionHeading: "Movement",
        latestError: "Movement stalled after 25ms without model content or planner records.",
      },
    });
  });

  it("finds running project-board synthesis runs and marks stale ones failed", () => {
    const board = store.createProjectBoard({ title: "Single-flight board" });
    const first = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });
    store.recordProjectBoardSynthesisRunEvent(first.id, {
      stage: "model_response",
      title: "Streaming from Ambient/Pi",
      summary: "The first run is still receiving streamed output.",
      responseCharCount: 512,
    });

    expect(store.getRunningProjectBoardSynthesisRun(board.id)).toMatchObject({
      id: first.id,
      status: "running",
      stage: "model_response",
      responseCharCount: 512,
    });

    const stale = store.failStaleProjectBoardSynthesisRuns({
      boardId: board.id,
      staleBefore: "2999-01-01T00:00:00.000Z",
      reason: "No synthesis progress was recorded.",
    });

    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatchObject({
      id: first.id,
      status: "failed",
      stage: "failed",
      error: "No synthesis progress was recorded.",
      events: expect.arrayContaining([expect.objectContaining({ title: "Synthesis run marked stale" })]),
    });
    expect(store.getRunningProjectBoardSynthesisRun(board.id)).toBeUndefined();

    const second = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });
    expect(store.getRunningProjectBoardSynthesisRun(board.id)?.id).toBe(second.id);
  });

  it("persists project-board synthesis pause requests and paused checkpoints", () => {
    const board = store.createProjectBoard({ title: "Pause board" });
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });

    const requested = store.requestProjectBoardSynthesisRunPause({
      boardId: board.id,
      runId: run.id,
      reason: "User wants to inspect the first cards.",
    });

    expect(requested).toMatchObject({
      id: run.id,
      status: "pause_requested",
      events: expect.arrayContaining([
        expect.objectContaining({
          title: "Pause requested",
          metadata: expect.objectContaining({
            decision: "pause_planning",
            checkpointPolicy: "safe_planner_boundary",
          }),
        }),
      ]),
    });
    expect(store.getRunningProjectBoardSynthesisRun(board.id)).toMatchObject({ id: run.id, status: "pause_requested" });

    const paused = store.markProjectBoardSynthesisRunPaused({
      boardId: board.id,
      runId: run.id,
      reason: "Planning paused after planner batch 1.",
      metadata: {
        lastValidRecordId: "synthesis:shell",
        lastValidRecordType: "candidate_card",
        plannerBatchIndex: 1,
      },
    });

    expect(paused).toMatchObject({
      id: run.id,
      status: "paused",
      stage: "paused",
      completedAt: expect.any(String),
    });
    expect(paused.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Planning paused",
          metadata: expect.objectContaining({
            decision: "planning_paused",
            retryable: true,
            lastValidRecordId: "synthesis:shell",
            lastValidRecordType: "candidate_card",
            plannerBatchIndex: 1,
          }),
        }),
      ]),
    );
    expect(store.getRunningProjectBoardSynthesisRun(board.id)).toBeUndefined();

    const abandoned = store.abandonProjectBoardSynthesisRunPause({
      boardId: board.id,
      runId: run.id,
      reason: "User wants a clean planning pass.",
    });

    expect(abandoned).toMatchObject({
      id: run.id,
      status: "abandoned",
      stage: "paused",
      events: expect.arrayContaining([
        expect.objectContaining({
          title: "Paused planning abandoned",
          metadata: expect.objectContaining({
            decision: "abandon_paused_planning",
            retryable: false,
            checkpointPolicy: "start_fresh",
          }),
        }),
      ]),
    });
    expect(store.getRunningProjectBoardSynthesisRun(board.id)).toBeUndefined();
  });

  it("marks a stalled synthesis run failed with resumable section metadata", () => {
    const board = store.createProjectBoard({ title: "Recoverable board" });
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });
    store.recordProjectBoardSynthesisRunProgressiveRecords(run.id, [
      {
        type: "progress",
        stage: "section_succeeded",
        title: "Completed section 1/2",
        summary: "Foundation cards planned.",
        createdAt: "2026-05-02T12:00:00.000Z",
        metadata: {
          sectionId: "section-foundation",
          sectionStatus: "succeeded",
          sectionIndex: 1,
          sectionCount: 2,
          sectionHeading: "Foundation",
        },
      },
    ]);

    const stalled = store.markProjectBoardSynthesisRunStalled({
      boardId: board.id,
      runId: run.id,
      reason: "The visible Ambient/Pi stream stopped updating.",
    });

    expect(stalled).toMatchObject({
      id: run.id,
      status: "failed",
      stage: "failed",
      error: "The visible Ambient/Pi stream stopped updating.",
      events: expect.arrayContaining([
        expect.objectContaining({
          title: "Synthesis run marked stalled",
          metadata: expect.objectContaining({
            decision: "retry_stalled_run",
            retryable: true,
            completedSectionCount: 1,
            sectionCount: 2,
          }),
        }),
      ]),
    });
    expect(store.getRunningProjectBoardSynthesisRun(board.id)).toBeUndefined();
  });

  it("archives a project board so a replacement can be created", () => {
    const first = store.createProjectBoard({ title: "First board" });
    const archived = store.updateProjectBoardStatus(first.id, "archived");
    const second = store.createProjectBoard({ title: "Second board" });

    expect(archived.status).toBe("archived");
    expect(second.id).not.toBe(first.id);
    expect(store.getActiveProjectBoard()).toMatchObject({ id: second.id, title: "Second board" });
  });

  it("resets a project board while preserving Local Task history", () => {
    const board = store.createProjectBoard({ title: "Resettable board" });
    const task = store.createOrchestrationTask({
      title: "Existing task",
      description: "Preserved outside the board.",
      state: "ready",
      labels: ["project-board"],
    });
    store.replaceProjectBoardSources(board.id, [
      {
        kind: "architecture_artifact",
        title: "Architecture notes",
        summary: "Board source context.",
        path: "architecture.md",
        relevance: 80,
      },
    ]);
    const manual = store.createProjectBoardManualCard({ boardId: board.id, title: "Manual candidate" });
    const attached = store.attachLocalTaskToProjectBoard({ taskId: task.id, mode: "attach" });
    const preparedRun = store.recordPreparedOrchestrationRun({
      taskId: task.id,
      workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", task.identifier),
    });
    const completedRun = store.updateOrchestrationRun({
      id: preparedRun.id,
      status: "completed",
      proofOfWork: {
        summary: "Proof that should reset with the board.",
        commands: ["pnpm test"],
        changedFiles: ["src/App.tsx"],
        handoff: {
          completed: ["Reset artifact was projected."],
          remaining: [],
          risks: [],
          followUps: [],
        },
      },
      finish: true,
      reviewProjectBoardProof: false,
    });
    const projectedWithArtifact = store.applyProjectBoardArtifactProjection(
      workspacePath,
      projectBoardArtifactProjectionFromFiles(
        projectBoardArtifactExportFromSummary(store.getProjectBoard(board.id)!, {
          runtime: { tasks: [store.getOrchestrationTask(task.id)], runs: [completedRun] },
        }).files,
      ),
    );
    const proposal = store.createProjectBoardSynthesisProposal({
      boardId: board.id,
      model: "test-model",
      synthesis: {
        summary: "Reset proposal.",
        goal: "Prove reset deletes proposal state.",
        currentState: "Board exists.",
        targetUser: "Project manager.",
        qualityBar: "Proof required.",
        assumptions: ["Reset should clear board-owned state."],
        questions: ["Should reset preserve Local Tasks?"],
        sourceNotes: ["Architecture notes are board-owned source review."],
        cards: [
          {
            sourceId: "reset-card",
            title: "Generated reset card",
            description: "Generated card that should be removed with the board.",
            candidateStatus: "needs_clarification",
            priority: 1,
            phase: "Reset",
            labels: ["reset"],
            blockedBy: [],
            acceptanceCriteria: ["Board reset removes this candidate."],
            testPlan: { unit: ["Exercise reset behavior."], integration: [], visual: [], manual: [] },
            sourceRefs: ["architecture.md"],
          },
        ],
      },
    });
    const synthesisRun = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });
    store.recordProjectBoardSynthesisRunEvent(synthesisRun.id, {
      stage: "proposal_created",
      title: "Proposal ready",
      summary: "Stored run state should be reset with the board.",
      status: "succeeded",
      proposalId: proposal.id,
      completedAt: "2026-05-02T12:00:00.000Z",
    });

    expect(store.getActiveProjectBoard()).toMatchObject({
      id: board.id,
      cards: expect.arrayContaining([
        expect.objectContaining({ id: manual.id }),
        expect.objectContaining({ id: attached.id, orchestrationTaskId: task.id }),
      ]),
      sources: [expect.objectContaining({ path: "architecture.md" })],
      proposals: [expect.objectContaining({ id: proposal.id })],
      synthesisRuns: [expect.objectContaining({ id: synthesisRun.id })],
      executionArtifacts: [
        expect.objectContaining({
          id: completedRun.id,
          cardId: attached.id,
          proof: expect.objectContaining({ commands: ["pnpm test"], changedFiles: ["src/App.tsx"] }),
        }),
      ],
    });
    expect(projectedWithArtifact.executionArtifacts).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: completedRun.id, cardId: attached.id })]),
    );

    store.resetProjectBoard(board.id);

    expect(store.getActiveProjectBoard()).toBeUndefined();
    expect(() => store.getProjectBoardCharter(board.charterId!)).toThrow("Project board charter not found");
    expect(store.getProjectBoardSynthesisProposal(proposal.id)).toBeUndefined();
    expect(store.listOrchestrationTasks().map((candidate) => candidate.id)).toContain(task.id);
    expect(store.getOrchestrationRun(completedRun.id)).toMatchObject({ id: completedRun.id, taskId: task.id });

    const replacement = store.createProjectBoard({ title: "Replacement board" });
    expect(replacement.id).not.toBe(board.id);
    expect(replacement.cards).toEqual([]);
    expect(replacement.executionArtifacts).toEqual([]);
    expect(() => store.resetProjectBoard(board.id)).toThrow("Project board not found");
  });

  it("starts board revisions with a new draft charter, preserved answers, and cancel support", () => {
    const board = store.createProjectBoard({ title: "Revision board" });
    const originalCharterId = board.charterId!;
    const initialAnswers = [
      "Ship the first board charter.",
      "Use existing docs first.",
      "Ask when the scope changes.",
      "Require proof for all user-visible work.",
      "Run cards in dependency order and stop only on explicit blockers.",
    ];
    for (const [index, question] of store.getActiveProjectBoard()!.questions.entries()) {
      store.answerProjectBoardQuestion(question.id, initialAnswers[index]);
    }
    const active = store.finalizeProjectBoardKickoff(board.id);
    expect(active).toMatchObject({ status: "active", charter: expect.objectContaining({ version: 1, status: "active" }) });

    const revision = store.startProjectBoardRevision({ boardId: board.id, reason: "Product direction changed." });

    expect(revision).toMatchObject({
      status: "draft",
      summary: "Product direction changed.",
      charter: expect.objectContaining({ version: 2, status: "draft" }),
    });
    expect(store.getProjectBoardCharter(originalCharterId).status).toBe("superseded");
    expect(revision.questions.map((question) => question.answer)).toEqual(initialAnswers);
    expect(revision.events?.[0]).toMatchObject({
      kind: "board_revision_started",
      title: "Board revision started",
      entityId: revision.charterId,
      metadata: expect.objectContaining({ previousCharterId: originalCharterId, version: 2 }),
    });

    const canceled = store.cancelProjectBoardRevision(board.id);
    expect(canceled).toMatchObject({
      status: "active",
      charterId: originalCharterId,
      charter: expect.objectContaining({ version: 1, status: "active" }),
    });
    expect(store.getProjectBoardCharter(revision.charterId!).status).toBe("superseded");

    store.startProjectBoardRevision({ boardId: board.id, reason: "Product direction changed again." });

    const revisedAnswers = [
      "Ship the revised board charter.",
      "Treat revised docs as authoritative.",
      "Document assumptions after one clear pass.",
      "Require unit or integration proof.",
      "Sequence revised cards by blockers before priority.",
    ];
    for (const [index, question] of store.getActiveProjectBoard()!.questions.entries()) {
      store.answerProjectBoardQuestion(question.id, revisedAnswers[index]);
    }
    const revisedActive = store.finalizeProjectBoardKickoff(board.id);
    expect(revisedActive).toMatchObject({
      status: "active",
      summary: "Ship the revised board charter.",
      charter: expect.objectContaining({ version: 3, status: "active", goal: "Ship the revised board charter." }),
    });
    expect(revisedActive.events?.[0]).toMatchObject({
      kind: "charter_finalized",
      metadata: expect.objectContaining({ version: 3 }),
    });
  });

  it("attaches existing local tasks to a project board or imports them as evidence", () => {
    const attachedTask = store.createOrchestrationTask({
      title: "Existing implementation task",
      description: "Already queued implementation.",
      state: "todo",
      priority: 4,
      labels: ["frontend"],
    });
    const evidenceTask = store.createOrchestrationTask({
      title: "Completed exploratory task",
      description: "Finished before the board existed.",
      state: "done",
      labels: ["research"],
    });
    const board = store.createProjectBoard({ title: "Import board" });

    const attached = store.attachLocalTaskToProjectBoard({ taskId: attachedTask.id, mode: "attach" });
    const attachedAgain = store.attachLocalTaskToProjectBoard({ taskId: attachedTask.id, mode: "attach" });
    const evidence = store.attachLocalTaskToProjectBoard({ taskId: evidenceTask.id, mode: "evidence" });
    const evidenceAgain = store.attachLocalTaskToProjectBoard({ taskId: evidenceTask.id, mode: "evidence" });

    expect(attachedAgain.id).toBe(attached.id);
    expect(evidenceAgain.id).toBe(evidence.id);
    expect(attached).toMatchObject({
      boardId: board.id,
      title: "Existing implementation task",
      status: "ready",
      candidateStatus: "ready_to_create",
      labels: expect.arrayContaining(["local-task", "frontend"]),
      sourceKind: "local_task_import",
      sourceId: attachedTask.id,
      orchestrationTaskId: attachedTask.id,
      testPlan: { manual: ["Review the existing Local Task proof before closing the board card."] },
    });
    expect(evidence).toMatchObject({
      status: "draft",
      candidateStatus: "evidence",
      sourceKind: "local_task_import",
      sourceId: evidenceTask.id,
      orchestrationTaskId: undefined,
      testPlan: { manual: ["Review imported Local Task history as completed evidence."] },
    });
    expect(store.getActiveProjectBoard()?.events?.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["local_task_imported_as_evidence", "local_task_attached"]),
    );
  });

  it("creates manual draft cards in the board draft inbox", () => {
    const board = store.createProjectBoard({ title: "Manual board" });
    const card = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "  Ad hoc QA pass  ",
      description: "  Check the end-to-end board flow.  ",
    });

    expect(card).toMatchObject({
      boardId: board.id,
      title: "Ad hoc QA pass",
      description: "Check the end-to-end board flow.",
      status: "draft",
      candidateStatus: "needs_clarification",
      labels: ["manual"],
      blockedBy: [],
      acceptanceCriteria: ["Define the intended outcome before ticketization."],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "manual",
      orchestrationTaskId: undefined,
    });
    expect(card.sourceId).toMatch(/^manual:/);
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "manual_card_created",
      title: "Manual draft card created",
      entityKind: "project_board_card",
      entityId: card.id,
      metadata: expect.objectContaining({ cardId: card.id, sourceKind: "manual" }),
    });

    const answers = [
      "Ship strict manual card ticketization.",
      "Use project docs as source context.",
      "Ask before making irreversible calls.",
      "Require proof before ready or approval.",
      "Execute manually approved cards in dependency order.",
    ];
    for (const [index, question] of store.getActiveProjectBoard()!.questions.entries()) {
      store.answerProjectBoardQuestion(question.id, answers[index]);
    }
    store.finalizeProjectBoardKickoff(board.id);

    expect(() => store.updateProjectBoardCardCandidateStatus(card.id, "ready_to_create")).toThrow("Strict project board proof policy");
    const ready = store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Manual card is fully scoped."],
      testPlan: { unit: [], integration: ["Run project board smoke."], visual: [], manual: [] },
    });
    expect(ready).toMatchObject({ candidateStatus: "ready_to_create", acceptanceCriteria: ["Manual card is fully scoped."] });
    expect(store.approveProjectBoardCard(card.id)).toMatchObject({ status: "ready", orchestrationTaskId: expect.any(String) });
  });

  it("assigns one reusable Pi execution thread to each ticketized project board card", () => {
    const board = store.createProjectBoard({ title: "Session board" });
    const card = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Build cached card loop",
      description: "Exercise the card-owned execution session.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["The card reuses one execution thread across attempts."],
      testPlan: { unit: ["Assert canonical thread reuse."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const task = store.getOrchestrationTask(approved.orchestrationTaskId!);

    expect(task.description).toContain("Execution session policy:");
    expect(task.description).toContain("Reuse this board card's canonical Pi session across retries and focus passes.");
    expect(task.description).toContain("provider KV cache reuse stays high");
    expect(task.description).toContain("Execution close policy:");
    expect(task.description).toContain("6 focus passes");
    expect(task.description).toContain("20m of worker runtime");
    expect(task.description).toContain("Make task_heartbeat the first observable board action");
    expect(task.description).toContain("Call task_report_proof as soon as changed files");
    expect(task.description).toContain("Do not end the run with only task_show and/or task_heartbeat");

    const workspace = join(workspacePath, ".ambient-codex", "orchestration", "workspaces", task.identifier);
    const first = store.ensureProjectBoardCardExecutionThreadForTask({ taskId: task.id, workspacePath: workspace });
    const second = store.ensureProjectBoardCardExecutionThreadForTask({ taskId: task.id, workspacePath: workspace });
    const updated = store.getProjectBoardCard(approved.id);

    expect(first).toBeTruthy();
    expect(second?.id).toBe(first?.id);
    expect(first).toMatchObject({
      title: `${task.identifier}: Build cached card loop`,
      workspacePath: workspace,
    });
    expect(updated).toMatchObject({
      executionThreadId: first?.id,
      executionSessionPolicy: "reuse_card_session",
    });
    expect(store.getProjectBoardCardForOrchestrationTask(task.id)?.id).toBe(approved.id);
    const sessionEvents = store.getActiveProjectBoard()?.events?.filter((event) => event.kind === "card_execution_session_assigned") ?? [];
    expect(sessionEvents).toHaveLength(1);

    const unrelated = store.createOrchestrationTask({ title: "Unattached task" });
    expect(store.ensureProjectBoardCardExecutionThreadForTask({ taskId: unrelated.id, workspacePath: workspace })).toBeUndefined();
  });

  it("copies terminal project-board Pi session transcripts into local project threads", () => {
    const board = store.createProjectBoard({ title: "Session copy board" });
    const card = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Copy stopped session",
      description: "Make the completed Pi transcript available as a local thread.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["The transcript can be copied after the run stops."],
      testPlan: { unit: ["Assert copied messages."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const task = store.getOrchestrationTask(approved.orchestrationTaskId!);
    const sourceThread = store.createThread("Source Pi session", workspacePath);
    store.addMessage({ threadId: sourceThread.id, role: "user", content: "Execute this board card." });
    store.addMessage({ threadId: sourceThread.id, role: "assistant", content: "The card work is complete." });
    const run = store.recordPreparedOrchestrationRun({
      taskId: task.id,
      workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", task.identifier),
    });
    const completed = store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: sourceThread.id,
      proofOfWork: { lastAssistantText: "The card work is complete." },
      finish: true,
      reviewProjectBoardProof: false,
    });

    const copied = store.copyProjectBoardSessionToThread({ cardId: approved.id, runId: completed.id });

    expect(copied.id).not.toBe(sourceThread.id);
    expect(copied.title).toBe("Session copy: Copy stopped session");
    expect(copied.workspacePath).toBe(workspacePath);
    expect(store.listMessages(copied.id).map((message) => [message.role, message.content])).toEqual([
      ["user", "Execute this board card."],
      ["assistant", "The card work is complete."],
      ["system", expect.stringContaining("Copied from project-board card")],
    ]);
    const copyEvent = store.getActiveProjectBoard()?.events?.find((event) => event.kind === "card_run_handoff_created");
    expect(copyEvent).toMatchObject({
      kind: "card_run_handoff_created",
      title: "Pi session copied to local thread",
      metadata: expect.objectContaining({
        cardId: approved.id,
        runId: completed.id,
        sourceThreadId: sourceThread.id,
        copiedThreadId: copied.id,
      }),
    });

    const activeThread = store.createThread("Active Pi session", workspacePath);
    const activeRun = store.recordPreparedOrchestrationRun({
      taskId: task.id,
      workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", `${task.identifier}-active`),
    });
    store.updateOrchestrationRun({ id: activeRun.id, status: "running", threadId: activeThread.id, reviewProjectBoardProof: false });
    expect(() => store.copyProjectBoardSessionToThread({ cardId: approved.id, runId: activeRun.id })).toThrow(
      "Copy Session to Thread is available only after",
    );
  });

  it("resolves project board proof decisions into card and task states", () => {
    const board = store.createProjectBoard({ title: "Proof decision board" });
    const createReviewedCard = (title: string) => {
      const draft = store.createProjectBoardManualCard({ boardId: board.id, title, description: `${title} description.` });
      const ready = store.updateProjectBoardCard({
        cardId: draft.id,
        candidateStatus: "ready_to_create",
        acceptanceCriteria: [`${title} acceptance criterion.`],
        testPlan: { unit: [`${title} unit proof.`], integration: [], visual: [], manual: [] },
      });
      const approved = store.approveProjectBoardCard(ready.id);
      const task = store.getOrchestrationTask(approved.orchestrationTaskId!);
      const run = store.recordPreparedOrchestrationRun({
        taskId: task.id,
        workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", task.identifier),
      });
      store.updateOrchestrationRun({
        id: run.id,
        status: "completed",
        finish: true,
        reviewProjectBoardProof: false,
        proofOfWork: { kind: "agent-run", changedFiles: ["src/App.tsx"], lastAssistantStatus: "completed" },
      });
      const reviewed = store.applyProjectBoardCardProofReview({
        runId: run.id,
        review: {
          status: "ready_for_review",
          summary: `${title} has proof ready for PM review.`,
          satisfied: [`${title} proof collected.`],
          missing: [],
          followUpCardIds: [],
          runId: run.id,
          reviewedAt: "2026-01-01T00:00:00.000Z",
          reviewer: "deterministic",
          recommendedAction: "close",
          evidenceQuality: "strong",
          confidence: 0.9,
        },
      })!;
      return { card: reviewed, task, run };
    };

    const draftPending = store.createProjectBoardManualCard({ boardId: board.id, title: "Pending proof card", description: "Not finished yet." });
    const readyPending = store.updateProjectBoardCard({
      cardId: draftPending.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Pending proof card acceptance criterion."],
      testPlan: { unit: ["Pending proof card unit proof."], integration: [], visual: [], manual: [] },
    });
    const pending = store.approveProjectBoardCard(readyPending.id);
    const pendingTask = store.getOrchestrationTask(pending.orchestrationTaskId!);
    expect(() => store.resolveProjectBoardProofDecision({ cardId: pending.id, action: "retry", reason: "Too early." })).toThrow(
      "Run the card until a proof packet or PM proof review is ready before resolving proof.",
    );
    const pendingRun = store.recordPreparedOrchestrationRun({
      taskId: pendingTask.id,
      workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", `${pendingTask.identifier}-active`),
    });
    store.updateOrchestrationRun({
      id: pendingRun.id,
      status: "running",
      reviewProjectBoardProof: false,
      proofOfWork: { kind: "agent-run", lastAssistantText: "Still running." },
    });
    expect(() => store.resolveProjectBoardProofDecision({ cardId: pending.id, action: "mark_blocked", reason: "Still running." })).toThrow(
      "Wait for the active card run to finish before resolving proof.",
    );

    const retryCase = createReviewedCard("Retry card");
    const retried = store.resolveProjectBoardProofDecision({
      cardId: retryCase.card.id,
      action: "retry",
      reason: "Add mobile screenshot proof before closing.",
    });
    expect(retried).toMatchObject({ status: "ready", proofReview: undefined });
    expect(retried.runFeedback).toEqual([
      expect.objectContaining({
        source: "proof_review",
        decisionQuestion: "Why was this proof sent back for revision?",
        decisionAnswer: "Add mobile screenshot proof before closing.",
        feedback: expect.stringContaining("Add mobile screenshot proof before closing."),
      }),
    ]);
    expect(store.getOrchestrationTask(retryCase.task.id).state).toBe("ready");
    expect(store.getOrchestrationTask(retryCase.task.id).description).toContain("Next-run feedback / additive PM instructions:");
    expect(store.getOrchestrationTask(retryCase.task.id).description).toContain("Add mobile screenshot proof before closing.");

    const doneCase = createReviewedCard("Done card");
    const done = store.resolveProjectBoardProofDecision({ cardId: doneCase.card.id, action: "accept_done", reason: "Proof is sufficient." });
    expect(done).toMatchObject({ status: "done", proofReview: { status: "done", recommendedAction: "close" } });
    expect(done.proofReview?.summary).toContain("Accepted as done");
    expect(store.getOrchestrationTask(doneCase.task.id).state).toBe("done");
    expect(() => store.resolveProjectBoardProofDecision({ cardId: done.id, action: "retry", reason: "I clicked the wrong control." })).toThrow(
      "Done project board cards cannot be sent back to Ready.",
    );
    expect(store.getProjectBoardCard(done.id).status).toBe("done");
    store.updateOrchestrationRun({
      id: doneCase.run.id,
      status: "stalled",
      finish: true,
      error: "Late stall after PM acceptance.",
      proofOfWork: { kind: "agent-run", error: "late stall" },
    });
    store.updateOrchestrationTask({ id: doneCase.task.id, state: "terminal_blocker" });
    expect(store.getOrchestrationRun(doneCase.run.id).status).toBe("completed");
    expect(store.getOrchestrationTask(doneCase.task.id).state).toBe("done");
    expect(store.getProjectBoardCard(done.id)).toMatchObject({
      status: "done",
      proofReview: { status: "done", recommendedAction: "close" },
    });

    const blockedCase = createReviewedCard("Blocked card");
    const blocked = store.resolveProjectBoardProofDecision({ cardId: blockedCase.card.id, action: "mark_blocked", reason: "Missing API key." });
    expect(blocked).toMatchObject({ status: "blocked", proofReview: { status: "terminally_blocked", recommendedAction: "block" } });
    expect(blocked.proofReview?.missing).toContain("Missing API key.");
    expect(store.getOrchestrationTask(blockedCase.task.id).state).toBe("terminal_blocker");

    const events = store
      .getActiveProjectBoard()
      ?.events?.filter((event) => event.kind === "card_updated" && typeof event.metadata.action === "string")
      ?? [];
    const actions = events.map((event) => event.metadata.action);
    expect(actions).toEqual(["mark_blocked", "accept_done", "retry"]);
    expect(events.find((event) => event.metadata.action === "retry")?.metadata.runFeedback).toMatchObject({
      source: "proof_review",
      decisionQuestion: "Why was this proof sent back for revision?",
      modelCallRequired: false,
    });
  });

  it("ignores stale proof judgments after a card is sent back or a newer run exists", () => {
    const board = store.createProjectBoard({ title: "Stale proof review board" });
    const draft = store.createProjectBoardManualCard({ boardId: board.id, title: "Stale proof card", description: "Proof can be superseded." });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Implement the feature."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: ["Manual proof captured."] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const task = store.getOrchestrationTask(approved.orchestrationTaskId!);
    const firstRun = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: join(workspacePath, "proof-run-1") });

    store.updateOrchestrationRun({
      id: firstRun.id,
      status: "completed",
      proofOfWork: {
        changedFiles: ["src/feature.ts"],
        taskToolActions: [
          {
            actionId: "proof-run-1",
            runId: firstRun.id,
            taskId: task.id,
            cardId: approved.id,
            action: "task_complete",
            createdAt: "2026-05-18T12:00:00.000Z",
            summary: "Feature implemented and proof passed.",
            completed: ["Implemented feature."],
            remaining: [],
            risks: [],
            commands: ["pnpm test"],
            changedFiles: ["src/feature.ts"],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: ["Manual proof captured."],
          },
        ],
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.proofReview?.runId).toBe(firstRun.id);
    store.resolveProjectBoardProofDecision({ cardId: reviewed.id, action: "retry", reason: "Collect stronger proof." });
    const secondRun = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: join(workspacePath, "proof-run-2") });
    const stale = store.applyProjectBoardCardProofReview({
      runId: firstRun.id,
      requireCurrentReview: true,
      review: {
        status: "done",
        summary: "Late proof judge tried to close the old run.",
        satisfied: ["Old proof."],
        missing: [],
        followUpCardIds: [],
        runId: firstRun.id,
        reviewedAt: "2026-05-18T12:05:00.000Z",
        reviewer: "ambient_pi",
        recommendedAction: "close",
        evidenceQuality: "strong",
        confidence: 0.9,
      },
    });

    expect(secondRun.id).not.toBe(firstRun.id);
    expect(stale).toMatchObject({ status: "ready", proofReview: undefined });
    expect(store.getOrchestrationTask(task.id).state).toBe("ready");
    const ignoredEvent = (store.getActiveProjectBoard()!.events ?? []).find((event) => event.kind === "card_proof_review_ignored");
    expect(ignoredEvent).toMatchObject({
      title: "Stale proof review ignored",
      metadata: expect.objectContaining({ runId: firstRun.id, staleReason: "newer_run_started" }),
    });
  });

  it("clears stale proof review state when a linked project board run starts", () => {
    const board = store.createProjectBoard({ title: "Proof restart board" });
    const draft = store.createProjectBoardManualCard({ boardId: board.id, title: "Restartable card", description: "Run can be retried." });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Retry produces fresh proof."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const task = store.getOrchestrationTask(approved.orchestrationTaskId!);
    const run = store.recordPreparedOrchestrationRun({
      taskId: task.id,
      workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", task.identifier),
    });
    store.updateOrchestrationRun({
      id: run.id,
      status: "stalled",
      finish: true,
      reviewProjectBoardProof: false,
      error: "No Ambient/Pi activity for 300000ms.",
      proofOfWork: { kind: "agent-run", error: "No Ambient/Pi activity for 300000ms." },
    });
    const reviewed = store.applyProjectBoardCardProofReview({
      runId: run.id,
      review: {
        status: "terminally_blocked",
        summary: "Ambient/Pi proof judgment was unavailable.",
        satisfied: [],
        missing: ["No Ambient/Pi activity for 300000ms."],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: "2026-01-01T00:00:00.000Z",
        reviewer: "deterministic",
        recommendedAction: "block",
        evidenceQuality: "weak",
        confidence: 0.2,
      },
    })!;
    expect(reviewed).toMatchObject({
      status: "blocked",
      proofReview: { status: "terminally_blocked", recommendedAction: "block" },
    });

    store.updateOrchestrationRun({ id: run.id, status: "running", error: null, reviewProjectBoardProof: false });
    store.updateOrchestrationTask({ id: task.id, state: "in_progress" });
    const started = store.beginProjectBoardCardRun({ runId: run.id });

    expect(started).toMatchObject({ status: "in_progress", proofReview: undefined });
    expect(store.getOrchestrationTask(task.id).state).toBe("in_progress");
  });

  it("applies material deliverables from completed Local Task workspaces and excludes runtime folders", async () => {
    const board = store.createProjectBoard({ title: "Deliverable integration board" });
    const draft = store.createProjectBoardManualCard({ boardId: board.id, title: "Build Pomodoro root" });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Pomodoro app files are generated."],
      testPlan: { unit: ["Run deterministic proof."], integration: [], visual: [], manual: [] },
    });
    const card = store.approveProjectBoardCard(ready.id);
    const task = store.getOrchestrationTask(card.orchestrationTaskId!);
    const runWorkspace = join(workspacePath, ".ambient-codex", "orchestration", "workspaces", task.identifier);
    await mkdir(join(runWorkspace, "src"), { recursive: true });
    await mkdir(join(runWorkspace, "tests"), { recursive: true });
    await mkdir(join(runWorkspace, ".ambient"), { recursive: true });
    await mkdir(join(runWorkspace, "node_modules", "cache"), { recursive: true });
    await writeFile(join(runWorkspace, "index.html"), "<main>Pomodoro</main>\n", "utf8");
    await writeFile(join(runWorkspace, "src", "timer.ts"), "export const minutes = 25;\n", "utf8");
    await writeFile(join(runWorkspace, "tests", "timer.spec.ts"), "expect(25).toBe(25);\n", "utf8");
    await writeFile(join(runWorkspace, ".ambient", "runtime.json"), "{\"runtime\":true}\n", "utf8");
    await writeFile(join(runWorkspace, "node_modules", "cache", "index.js"), "module.exports = {};\n", "utf8");
    const run = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: runWorkspace });
    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      finish: true,
      proofOfWork: {
        kind: "agent-run",
        changedFiles: ["index.html", "src/timer.ts", "tests/timer.spec.ts", ".ambient/runtime.json", "node_modules/cache/index.js"],
        commands: ["pnpm test"],
        commits: ["abc123"],
        dependencyImports: ["date-fns"],
      },
    });

    await store.resolveProjectBoardDeliverableIntegration({ boardId: board.id, runId: run.id, action: "apply_to_root" });

    await expect(readFile(join(workspacePath, "index.html"), "utf8")).resolves.toContain("Pomodoro");
    await expect(readFile(join(workspacePath, "src", "timer.ts"), "utf8")).resolves.toContain("minutes");
    await expect(readFile(join(workspacePath, "tests", "timer.spec.ts"), "utf8")).resolves.toContain("toBe");
    await expect(access(join(workspacePath, ".ambient", "runtime.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(workspacePath, "node_modules", "cache", "index.js"))).rejects.toMatchObject({ code: "ENOENT" });
    const event = store.getActiveProjectBoard()?.events?.find((candidate) => candidate.kind === "deliverable_integration_resolved");
    expect(event).toMatchObject({
      kind: "deliverable_integration_resolved",
      entityId: run.id,
      metadata: expect.objectContaining({
        action: "apply_to_root",
        status: "integrated",
        materialFiles: ["index.html", "src/timer.ts", "tests/timer.spec.ts"],
        excludedFiles: [".ambient/runtime.json", "node_modules/cache/index.js"],
        appliedFiles: ["index.html", "src/timer.ts", "tests/timer.spec.ts"],
        commands: ["pnpm test"],
        commits: ["abc123"],
        dependencyImports: ["date-fns"],
      }),
    });
  });

  it("exports deliverable bundles and records explicit defer decisions", async () => {
    const board = store.createProjectBoard({ title: "Deliverable bundle board" });
    const createCompletedRun = async (title: string, relativeFile: string, content: string) => {
      const draft = store.createProjectBoardManualCard({ boardId: board.id, title });
      const ready = store.updateProjectBoardCard({
        cardId: draft.id,
        candidateStatus: "ready_to_create",
        acceptanceCriteria: [`${title} is generated.`],
        testPlan: { unit: ["Run focused proof."], integration: [], visual: [], manual: [] },
      });
      const card = store.approveProjectBoardCard(ready.id);
      const task = store.getOrchestrationTask(card.orchestrationTaskId!);
      const runWorkspace = join(workspacePath, ".ambient-codex", "orchestration", "workspaces", task.identifier);
      await mkdir(dirname(join(runWorkspace, relativeFile)), { recursive: true });
      await writeFile(join(runWorkspace, relativeFile), content, "utf8");
      const run = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: runWorkspace });
      store.updateOrchestrationRun({
        id: run.id,
        status: "completed",
        finish: true,
        proofOfWork: { kind: "agent-run", changedFiles: [relativeFile] },
      });
      return { card, task, run, relativeFile };
    };

    const exported = await createCompletedRun("Build recipe index", "src/recipes.ts", "export const recipes = [];\n");
    await store.resolveProjectBoardDeliverableIntegration({ boardId: board.id, runId: exported.run.id, action: "export_bundle" });
    const bundleRoot = join(workspacePath, ".ambient", "project-board", "deliverable-bundles", exported.run.id);
    await expect(readFile(join(bundleRoot, "files", exported.relativeFile), "utf8")).resolves.toContain("recipes");
    const manifest = JSON.parse(await readFile(join(bundleRoot, "manifest.json"), "utf8")) as { integration?: { action?: string }; materialFiles?: Array<{ path?: string }> };
    expect(manifest.integration?.action).toBe("export_bundle");
    expect(manifest.materialFiles?.map((file) => file.path)).toEqual([exported.relativeFile]);

    const deferred = await createCompletedRun("Tune recipe theme", "theme.css", "body { color: tomato; }\n");
    await store.resolveProjectBoardDeliverableIntegration({
      boardId: board.id,
      runId: deferred.run.id,
      action: "defer",
      reason: "Waiting for product approval.",
    });
    await expect(access(join(workspacePath, deferred.relativeFile))).rejects.toMatchObject({ code: "ENOENT" });
    const events = store.getActiveProjectBoard()?.events?.filter((candidate) => candidate.kind === "deliverable_integration_resolved") ?? [];
    expect(events.map((event) => event.metadata.status)).toEqual(["deferred", "exported"]);
    expect(events.find((event) => event.metadata.status === "deferred")?.metadata.reason).toBe("Waiting for product approval.");
    expect(events.find((event) => event.metadata.status === "exported")?.metadata.exportPath).toBe(bundleRoot);
  });

  it("replaces and persists project board source reviews", () => {
    const board = store.createProjectBoard({ title: "Source board" });

    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "architecture_artifact",
        title: "Architecture",
        summary: "System design notes.",
        path: "architecture.md",
        relevance: 86,
      },
      {
        kind: "thread",
        title: "Discovery thread",
        summary: "Initial discussion.",
        threadId: "thread-1",
        relevance: 70,
      },
    ]);

    expect(sources.map((source) => source.title)).toEqual(["Architecture", "Discovery thread"]);
    expect(sources).toEqual([
      expect.objectContaining({
        sourceKey: "file:architecture.md",
        changeState: "new",
        classifiedBy: "fallback_heuristic",
        includeInSynthesis: true,
      }),
      expect.objectContaining({
        sourceKey: "thread:thread-1",
        changeState: "new",
        classifiedBy: "fallback_heuristic",
      }),
    ]);
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "sources_refreshed",
      title: "Sources refreshed",
      summary: "2 project sources scanned: 2 new.",
      metadata: {
        previousCount: 0,
        nextCount: 2,
        sourceKinds: { architecture_artifact: 1, thread: 1 },
        sourceChangeStates: { new: 2 },
        newCount: 2,
        removedCount: 0,
      },
    });
    expect(store.getActiveProjectBoard()?.sources).toEqual([
      expect.objectContaining({ kind: "architecture_artifact", path: "architecture.md" }),
      expect.objectContaining({ kind: "thread", threadId: "thread-1" }),
    ]);

    const piClassified = store.applyProjectBoardSourceClassifications(board.id, [
      {
        sourceId: sources[0].id,
        sourceKey: sources[0].sourceKey,
        kind: "architecture_artifact",
        classificationReason: "Pi judged this architecture note as the primary technical authority.",
        classificationConfidence: 0.93,
        authorityRole: "primary",
        includeInSynthesis: true,
        model: "zai-org/GLM-5.1-FP8",
      },
    ]);

    expect(piClassified.find((source) => source.id === sources[0].id)).toMatchObject({
      kind: "architecture_artifact",
      classifiedBy: "ambient_pi",
      classificationReason: "Pi judged this architecture note as the primary technical authority.",
      classificationConfidence: 0.93,
      authorityRole: "primary",
      includeInSynthesis: true,
    });
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "source_updated",
      title: "Sources classified by Pi",
      metadata: {
        classifiedBy: "ambient_pi",
        classificationCount: 1,
        sourceIds: [sources[0].id],
        sourceKinds: { architecture_artifact: 1 },
        model: "zai-org/GLM-5.1-FP8",
      },
    });

    const updated = store.updateProjectBoardSource({ sourceId: sources[1].id, kind: "functional_spec" });

    expect(updated).toMatchObject({ id: sources[1].id, kind: "functional_spec", relevance: 70 });
    expect(updated).toMatchObject({ classifiedBy: "user", classificationConfidence: 1, authorityRole: "supporting", includeInSynthesis: true });
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "source_updated",
      title: "Source reclassified",
      metadata: { sourceId: sources[1].id, from: "thread", to: "functional_spec" },
    });

    const ignored = store.updateProjectBoardSource({ sourceId: sources[0].id, kind: "ignored" });

    expect(ignored).toMatchObject({ id: sources[0].id, kind: "ignored", relevance: 0 });
    expect(ignored).toMatchObject({ classifiedBy: "user", authorityRole: "ignored", includeInSynthesis: false });

    const refreshedWithOverrides = store.replaceProjectBoardSources(board.id, [
      {
        kind: "architecture_artifact",
        title: "Architecture refreshed",
        summary: "Updated system design notes.",
        path: "architecture.md",
        relevance: 91,
      },
      {
        kind: "thread",
        title: "Discovery thread refreshed",
        summary: "Updated discussion summary.",
        threadId: "thread-1",
        relevance: 72,
      },
    ]);

    expect(refreshedWithOverrides).toEqual([
      expect.objectContaining({ id: sources[1].id, kind: "functional_spec", title: "Discovery thread refreshed", relevance: 72, changeState: "changed" }),
      expect.objectContaining({ id: sources[0].id, kind: "ignored", title: "Architecture refreshed", relevance: 0, changeState: "changed" }),
    ]);
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "sources_refreshed",
      summary: "2 project sources scanned: 2 changed. Preserved 2 existing classifications.",
      metadata: {
        previousCount: 2,
        nextCount: 2,
        sourceKinds: { functional_spec: 1, ignored: 1 },
        sourceChangeStates: { changed: 2 },
        changedCount: 2,
        unchangedCount: 0,
        removedCount: 0,
        preservedClassificationCount: 2,
      },
    });

    store.replaceProjectBoardSources(board.id, [
      {
        kind: "implementation_plan",
        title: "Plan",
        summary: "Phased build plan.",
        path: "plan.md",
        relevance: 90,
      },
    ]);

    expect(store.getActiveProjectBoard()?.sources.map((source) => source.title)).toEqual(["Plan"]);
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "sources_refreshed",
      summary: "1 project source scanned: 1 new, 2 removed.",
      metadata: {
        previousCount: 2,
        nextCount: 1,
        sourceKinds: { implementation_plan: 1 },
        sourceChangeStates: { new: 1 },
        newCount: 1,
        removedCount: 2,
      },
    });
  });

  it("refreshes same-title project board sources without reusing one previous source id", () => {
    const board = store.createProjectBoard({ title: "Same title source board" });
    const first = store.replaceProjectBoardSources(board.id, [
      {
        kind: "thread",
        title: "New chat",
        summary: "Original empty starter chat.",
        threadId: "thread-1",
        relevance: 35,
      },
    ]);

    const refreshed = store.replaceProjectBoardSources(board.id, [
      {
        kind: "thread",
        title: "New chat",
        summary: "Starter chat in the current project.",
        threadId: "thread-2",
        relevance: 35,
      },
      {
        kind: "thread",
        title: "New chat",
        summary: "Another registered project starter chat.",
        threadId: "thread-3",
        relevance: 35,
      },
    ]);

    expect(refreshed).toHaveLength(2);
    expect(new Set(refreshed.map((source) => source.id)).size).toBe(2);
    expect(refreshed.map((source) => source.id)).not.toContain(first[0].id);
    expect(refreshed.map((source) => source.sourceKey).sort()).toEqual(["thread:thread-2", "thread:thread-3"]);
  });

  it("refreshes durable plan and parent chat sources without reusing one previous source id", () => {
    const board = store.createProjectBoard({ title: "Durable plan source board" });
    const [durablePlan] = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Plan: Simple Hello World Durable Plan",
        summary: "Durable implementation plan.",
        path: ".ambient/board/plans/Hello-World-DurablePlan.html",
        threadId: "thread-1",
        artifactId: "artifact-1",
        messageId: "message-1",
        relevance: 95,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
    ]);

    const refreshed = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Plan: Simple Hello World Durable Plan",
        summary: "Durable implementation plan.",
        path: ".ambient/board/plans/Hello-World-DurablePlan.html",
        threadId: "thread-1",
        artifactId: "artifact-1",
        messageId: "message-1",
        relevance: 95,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "thread",
        title: "Simple Hello World planning chat",
        summary: "The source chat that produced the durable plan.",
        threadId: "thread-1",
        messageId: "message-1",
        relevance: 70,
        authorityRole: "ignored",
        includeInSynthesis: false,
        classificationReason: "Durable plan selected as source of truth; chat thread ignored by default.",
      },
    ]);

    const refreshedPlan = refreshed.find((source) => source.sourceKey === "file:.ambient/board/plans/Hello-World-DurablePlan.html")!;
    const refreshedThread = refreshed.find((source) => source.sourceKey === "thread:thread-1")!;
    expect(refreshed).toHaveLength(2);
    expect(refreshedPlan.id).toBe(durablePlan.id);
    expect(refreshedThread.id).not.toBe(durablePlan.id);
    expect(new Set(refreshed.map((source) => source.id)).size).toBe(2);
    expect(refreshedThread).toMatchObject({
      kind: "thread",
      authorityRole: "ignored",
      includeInSynthesis: false,
      changeState: "new",
    });
  });

  it("preserves durable-plan chat exclusion unless the user includes the chat", () => {
    const board = store.createProjectBoard({ title: "Durable authority board" });
    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Refined durable plan",
        summary: "Durable implementation plan.",
        path: ".ambient/board/plans/App-DurablePlan.html",
        relevance: 95,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "thread",
        title: "Planning chat",
        summary: "Earlier planning conversation.",
        threadId: "thread-1",
        relevance: 70,
        authorityRole: "ignored",
        includeInSynthesis: false,
        classificationReason: "Durable plan selected as source of truth; chat thread ignored by default.",
      },
    ]);
    const chat = sources.find((source) => source.threadId === "thread-1")!;

    const piAttempt = store.applyProjectBoardSourceClassifications(board.id, [
      {
        sourceId: chat.id,
        kind: "thread",
        classificationReason: "Pi wants to include the chat.",
        classificationConfidence: 0.99,
        authorityRole: "context",
        includeInSynthesis: true,
      },
    ]);
    expect(piAttempt.find((source) => source.id === chat.id)).toMatchObject({
      authorityRole: "ignored",
      includeInSynthesis: false,
    });

    const included = store.updateProjectBoardSource({ sourceId: chat.id, kind: "thread", includeInSynthesis: true });
    expect(included).toMatchObject({
      classifiedBy: "user",
      authorityRole: "context",
      includeInSynthesis: true,
    });

    const refreshed = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Refined durable plan",
        summary: "Durable implementation plan.",
        path: ".ambient/board/plans/App-DurablePlan.html",
        relevance: 95,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "thread",
        title: "Planning chat",
        summary: "Earlier planning conversation.",
        threadId: "thread-1",
        relevance: 70,
        authorityRole: "ignored",
        includeInSynthesis: false,
        classificationReason: "Durable plan selected as source of truth; chat thread ignored by default.",
      },
    ]);
    expect(refreshed.find((source) => source.id === chat.id)).toMatchObject({
      classifiedBy: "user",
      authorityRole: "context",
      includeInSynthesis: true,
    });
  });

  it("saves a durable planner plan into a fresh board when the active board belongs to another thread", () => {
    const oldThread = store.createThread("Time Zone Converter");
    const oldBoard = store.createProjectBoard({ title: "Time Zone Converter board" });
    store.replaceProjectBoardSources(oldBoard.id, [
      {
        kind: "thread",
        title: "Time Zone Converter planning chat",
        summary: "Planning chat from an earlier app.",
        threadId: oldThread.id,
        relevance: 80,
        authorityRole: "context",
        includeInSynthesis: true,
      },
    ]);

    const pickerThread = store.createThread("Local random option picker");
    const pickerMessage = store.addMessage({
      threadId: pickerThread.id,
      role: "assistant",
      content: "Plan: Local Random Option Picker\nScope Contract\nPaste options, click Pick, show one random choice.",
    });
    const pickerArtifact = store.createPlannerPlanArtifact({
      threadId: pickerThread.id,
      sourceMessageId: pickerMessage.id,
      title: "Plan: Local Random Option Picker",
      summary: "Paste options, click Pick, show one random choice.",
      content: pickerMessage.content,
      steps: [
        {
          id: "step-1",
          title: "Implement Local Random Option Picker",
          detail: "Create one self-contained HTML file with textarea input, Pick button, and result display.",
        },
      ],
      openQuestions: [],
      risks: [],
      verification: ["Open index.html and verify picking works."],
    });
    const durableArtifact = store.setPlannerPlanDurableArtifact(pickerArtifact.id, {
      path: ".ambient/board/plans/Local-Random-Option-Picker-DurablePlan.html",
      generatedAt: "2026-06-06T00:00:00.000Z",
    });

    const card = store.promotePlannerPlanToBoard(durableArtifact.id);
    const activeBoard = store.getActiveProjectBoard()!;

    expect(activeBoard.id).not.toBe(oldBoard.id);
    expect(store.getProjectBoard(oldBoard.id)).toMatchObject({ status: "draft", sourceThreadId: oldThread.id });
    expect(card.boardId).toBe(activeBoard.id);
    expect(activeBoard.title).toBe("Local Random Option Picker board");
    expect(activeBoard.sourceThreadId).toBe(pickerThread.id);
    expect(store.getActiveProjectBoard(oldThread.id)?.id).toBe(oldBoard.id);
    expect(store.getActiveProjectBoard(pickerThread.id)?.id).toBe(activeBoard.id);
    expect(activeBoard.sources).toEqual([
      expect.objectContaining({
        artifactId: durableArtifact.id,
        threadId: pickerThread.id,
        authorityRole: "primary",
        includeInSynthesis: true,
      }),
    ]);
  });

  it("records source selection impact without rewriting affected cards", () => {
    const board = store.createProjectBoard({ title: "Source impact board" });
    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Refined durable plan",
        summary: "Durable implementation plan.",
        path: ".ambient/board/plans/App-DurablePlan.html",
        relevance: 95,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "thread",
        title: "Planning chat",
        summary: "Earlier planning conversation.",
        threadId: "thread-1",
        relevance: 70,
        authorityRole: "ignored",
        includeInSynthesis: false,
        classificationReason: "Durable plan selected as source of truth; chat thread ignored by default.",
      },
    ]);
    const chat = sources.find((source) => source.threadId === "thread-1")!;

    const draft = store.updateProjectBoardCard({
      cardId: store.createProjectBoardManualCard({ boardId: board.id, title: "Draft from chat" }).id,
      description: "Still being edited by the PM.",
      sourceRefs: [chat.id],
    });
    const readyCandidate = store.updateProjectBoardCard({
      cardId: store.createProjectBoardManualCard({ boardId: board.id, title: "Ready from chat" }).id,
      description: "Already approved for execution.",
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["The executable card remains approved."],
      testPlan: { unit: ["Run the deterministic source-impact ledger check."], integration: [], visual: [], manual: [] },
      sourceRefs: [chat.id],
    });
    const approved = store.approveProjectBoardCard(readyCandidate.id);

    const included = store.updateProjectBoardSource({ sourceId: chat.id, kind: "thread", includeInSynthesis: true });
    expect(included).toMatchObject({ id: chat.id, includeInSynthesis: true, authorityRole: "context" });
    const includeEvent = store.getActiveProjectBoard()?.events?.[0];
    expect(includeEvent).toMatchObject({
      kind: "source_updated",
      title: "Source inclusion updated",
      metadata: {
        sourceId: chat.id,
        from: "thread",
        to: "thread",
        includeInSynthesis: true,
        sourceImpact: expect.objectContaining({
          schemaVersion: 1,
          sourceId: chat.id,
          existingCardsRewritten: false,
          modelCallRequired: false,
          additiveSynthesisAvailable: true,
          targetedRefreshOptional: true,
          nextRunFeedbackRecommended: true,
          affectedDraftCount: 1,
          affectedExecutableCount: 1,
          durablePlanPrimaryCount: 1,
          includedChatCount: 1,
          ignoredChatCount: 0,
          selectedObservationCount: 1,
          recommendedAction: "add_next_run_feedback",
        }),
      },
    });
    const includeImpact = includeEvent?.metadata.sourceImpact as Record<string, unknown>;
    expect(includeImpact.affectedDraftCardIds).toEqual(expect.arrayContaining([draft.id]));
    expect(includeImpact.affectedExecutableCardIds).toEqual(expect.arrayContaining([approved.id]));
    expect(includeImpact.groupSourceIds).toEqual(expect.arrayContaining([chat.id]));
    expect(includeImpact.detail).toContain("without rewriting existing cards or calling Pi");
    expect(includeImpact.detail).toContain("additive next-run feedback");
    expect(includeImpact.estimatedPromptChars).toBeGreaterThan(0);

    const excluded = store.updateProjectBoardSource({ sourceId: chat.id, kind: "thread", includeInSynthesis: false });
    expect(excluded).toMatchObject({ id: chat.id, includeInSynthesis: false, authorityRole: "ignored" });
    const excludeEvent = store.getActiveProjectBoard()?.events?.[0];
    expect(excludeEvent).toMatchObject({
      kind: "source_updated",
      title: "Source inclusion updated",
      metadata: {
        sourceId: chat.id,
        includeInSynthesis: false,
        sourceImpact: expect.objectContaining({
          schemaVersion: 1,
          sourceId: chat.id,
          existingCardsRewritten: false,
          modelCallRequired: false,
          additiveSynthesisAvailable: false,
          targetedRefreshOptional: true,
          nextRunFeedbackRecommended: true,
          affectedDraftCount: 1,
          affectedExecutableCount: 1,
          durablePlanPrimaryCount: 1,
          includedChatCount: 0,
          ignoredChatCount: 1,
          selectedObservationCount: 0,
          recommendedAction: "add_next_run_feedback",
        }),
      },
    });
    const excludeImpact = excludeEvent?.metadata.sourceImpact as Record<string, unknown>;
    expect(excludeImpact.affectedDraftCardIds).toEqual(expect.arrayContaining([draft.id]));
    expect(excludeImpact.affectedExecutableCardIds).toEqual(expect.arrayContaining([approved.id]));
    expect(excludeImpact.detail).toContain("ignored chats remain inspectable but excluded by default");
  });

  it("refreshes affected source draft notes without rewriting approved cards or calling Pi", () => {
    const board = store.createProjectBoard({ title: "Source draft refresh board" });
    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Tiny Animation Durable Plan",
        summary: "Durable source of truth for a tiny animated hello-world app.",
        path: ".ambient/board/plans/Tiny-Hello-DurablePlan.html",
        relevance: 98,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "thread",
        title: "Brainstorm chat",
        summary: "Earlier chat asks for an animated gradient greeting.",
        threadId: "thread-animated-hello",
        relevance: 65,
        authorityRole: "ignored",
        includeInSynthesis: false,
        classificationReason: "Durable plan is available; chat stays ignored unless selected.",
      },
    ]);
    const chat = sources.find((source) => source.threadId === "thread-animated-hello")!;

    const draft = store.updateProjectBoardCard({
      cardId: store.createProjectBoardManualCard({ boardId: board.id, title: "Animate hello-world hero" }).id,
      description: "Create the draft animation task from the durable plan.",
      sourceRefs: [chat.id],
      acceptanceCriteria: ["Animation copy and motion are clear."],
      testPlan: { unit: [], integration: [], visual: ["Capture animated hero at desktop width."], manual: [] },
    });
    const readyCandidate = store.updateProjectBoardCard({
      cardId: store.createProjectBoardManualCard({ boardId: board.id, title: "Wire local task scaffold" }).id,
      description: "Approved Local Task card that also cites the chat.",
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Local Task scaffold is ready."],
      testPlan: { unit: ["Check generated files exist."], integration: [], visual: [], manual: [] },
      sourceRefs: [chat.id],
    });
    const approved = store.approveProjectBoardCard(readyCandidate.id);

    store.updateProjectBoardSource({ sourceId: chat.id, kind: "thread", includeInSynthesis: true });
    const sourceEvent = store.getActiveProjectBoard()?.events?.find((event) => event.kind === "source_updated");
    expect(sourceEvent?.metadata.sourceImpact).toMatchObject({
      targetedRefreshOptional: true,
      nextRunFeedbackRecommended: true,
      affectedDraftCardIds: expect.arrayContaining([draft.id]),
      affectedExecutableCardIds: expect.arrayContaining([approved.id]),
      modelCallRequired: false,
    });

    const refreshedBoard = store.refreshProjectBoardSourceDrafts({ boardId: board.id, sourceImpactEventId: sourceEvent!.id });
    const refreshedDraft = refreshedBoard.cards.find((card) => card.id === draft.id)!;
    const untouchedApproved = refreshedBoard.cards.find((card) => card.id === approved.id)!;

    expect(refreshedDraft.description).toContain("## Source impact refresh");
    expect(refreshedDraft.description).toContain("Source authority was refreshed from 1 source-impact record.");
    expect(refreshedDraft.description).toContain("Brainstorm chat");
    expect(refreshedDraft.description).toContain("Existing draft text was not rewritten by Pi");
    expect(untouchedApproved.description).toBe("Approved Local Task card that also cites the chat.");
    expect(untouchedApproved.runFeedback ?? []).toEqual([]);

    const feedbackBoard = store.applyProjectBoardSourceImpactFeedback({ boardId: board.id, sourceImpactEventId: sourceEvent!.id });
    const feedbackApproved = feedbackBoard.cards.find((card) => card.id === approved.id)!;
    expect(feedbackApproved.description).toBe("Approved Local Task card that also cites the chat.");
    expect(feedbackApproved.runFeedback).toEqual([
      expect.objectContaining({
        source: "source_impact",
        sourceImpactEventId: sourceEvent!.id,
        sourceIds: expect.arrayContaining([chat.id]),
      }),
    ]);
    const taskAfterFeedback = store.getOrchestrationTask(approved.orchestrationTaskId!);
    expect(taskAfterFeedback.description).toContain("Next-run feedback / additive PM instructions:");
    expect(taskAfterFeedback.description).toContain("Source authority changed after this card was approved");
    expect(taskAfterFeedback.description).toContain("Brainstorm chat");
    expect(taskAfterFeedback.description).toContain("Do not rewrite the approved card scope silently");

    store.applyProjectBoardSourceImpactFeedback({ boardId: board.id, sourceImpactEventId: sourceEvent!.id });
    expect(store.getProjectBoardCard(approved.id).runFeedback).toHaveLength(1);

    const feedbackEvent = store.getActiveProjectBoard()?.events?.find((event) => event.title === "Source impact feedback added");
    expect(feedbackEvent?.metadata).toMatchObject({
      sourceImpact: {
        appliedAction: "create_next_run_feedback",
        sourceImpactEventIds: [sourceEvent!.id],
        affectedDraftCardIds: expect.arrayContaining([draft.id]),
        affectedExecutableCardIds: expect.arrayContaining([approved.id]),
        appliedCardIds: [approved.id],
        existingCardsRewritten: false,
        modelCallRequired: false,
      },
    });

    const refreshEvent = store.getActiveProjectBoard()?.events?.find((event) => event.title === "Source drafts refreshed");
    expect(refreshEvent?.metadata).toMatchObject({
      sourceImpact: {
        appliedAction: "refresh_affected_drafts",
        sourceImpactEventIds: [sourceEvent!.id],
        affectedDraftCardIds: expect.arrayContaining([draft.id]),
        affectedExecutableCardIds: expect.arrayContaining([approved.id]),
        appliedCardIds: [draft.id],
        existingCardsRewritten: false,
        modelCallRequired: false,
      },
    });

    store.refreshProjectBoardSourceDrafts({ boardId: board.id, sourceImpactEventId: sourceEvent!.id });
    const refreshedAgain = store.getProjectBoardCard(draft.id);
    expect(refreshedAgain.description.match(/## Source impact refresh/g)).toHaveLength(1);
  });

  it("stages source impact Pi draft refreshes as reviewable updates before rewriting draft specs", () => {
    const board = store.createProjectBoard({ title: "Source Pi refresh board" });
    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Tiny Animation Durable Plan",
        summary: "Durable source of truth for a tiny animated hello-world app.",
        path: ".ambient/board/plans/Tiny-Hello-DurablePlan.html",
        relevance: 98,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "thread",
        title: "Animation color chat",
        summary: "Chat says the animation should use a calm blue pulse.",
        threadId: "thread-blue-pulse",
        relevance: 65,
        authorityRole: "ignored",
        includeInSynthesis: false,
        classificationReason: "Durable plan is available; chat stays ignored unless selected.",
      },
    ]);
    const chat = sources.find((source) => source.threadId === "thread-blue-pulse")!;

    const animationDraft = store.updateProjectBoardCard({
      cardId: store.createProjectBoardManualCard({ boardId: board.id, title: "Animate hello-world hero" }).id,
      description: "Create the draft animation task from the durable plan.",
      sourceRefs: [chat.id],
      labels: ["html"],
      acceptanceCriteria: ["Animation copy and motion are clear."],
      testPlan: { unit: [], integration: [], visual: ["Capture animated hero at desktop width."], manual: [] },
    });
    const styleDraft = store.updateProjectBoardCard({
      cardId: store.createProjectBoardManualCard({ boardId: board.id, title: "Tune animation color system" }).id,
      description: "Tune the colors after the animation exists.",
      sourceRefs: [chat.id],
      labels: ["color"],
      acceptanceCriteria: ["Color treatment is intentional."],
      testPlan: { unit: [], integration: [], visual: ["Capture the color treatment."], manual: [] },
    });
    const readyCandidate = store.updateProjectBoardCard({
      cardId: store.createProjectBoardManualCard({ boardId: board.id, title: "Wire local task scaffold" }).id,
      description: "Approved Local Task card that also cites the chat.",
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Local Task scaffold is ready."],
      testPlan: { unit: ["Check generated files exist."], integration: [], visual: [], manual: [] },
      sourceRefs: [chat.id],
    });
    const approved = store.approveProjectBoardCard(readyCandidate.id);

    store.updateProjectBoardSource({ sourceId: chat.id, kind: "thread", includeInSynthesis: true });
    const sourceEvent = store.getActiveProjectBoard()?.events?.find((event) => event.kind === "source_updated");
    expect(sourceEvent?.metadata.sourceImpact).toMatchObject({
      targetedRefreshOptional: true,
      affectedDraftCardIds: expect.arrayContaining([animationDraft.id, styleDraft.id]),
      affectedExecutableCardIds: expect.arrayContaining([approved.id]),
      existingCardsRewritten: false,
      modelCallRequired: false,
    });

    const refreshedBoard = store.stageProjectBoardSourceDraftPiUpdates({
      boardId: board.id,
      sourceImpactEventId: sourceEvent!.id,
      model: "gmi-test-model",
      telemetry: { promptCharCount: 1100, responseCharCount: 420, requestDurationMs: 1900 },
      suggestions: [
        {
          cardId: animationDraft.id,
          description: "Create the draft animation task with a calm blue pulse from the included chat notes.",
          labels: ["html", "animation", "source-refresh"],
          acceptanceCriteria: ["Animation copy and motion are clear.", "Calm blue pulse is visible without confetti."],
          testPlan: {
            unit: [],
            integration: [],
            visual: ["Capture desktop and mobile screenshots showing the calm blue pulse."],
            manual: [],
          },
          clarificationQuestions: [],
          rationale: "The included chat adds a color and motion constraint.",
          confidence: "high",
        },
        {
          cardId: styleDraft.id,
          description: "Tune the animation color system around a calm blue pulse treatment.",
          labels: ["color", "animation"],
          acceptanceCriteria: ["Color treatment is calm and consistent."],
          testPlan: { unit: [], integration: [], visual: ["Capture the blue pulse treatment."], manual: [] },
          clarificationQuestions: [],
          rationale: "The included chat narrows the animation color direction.",
          confidence: "high",
        },
      ],
    });
    const stagedAnimation = refreshedBoard.cards.find((card) => card.id === animationDraft.id)!;
    const stagedStyle = refreshedBoard.cards.find((card) => card.id === styleDraft.id)!;
    const untouchedApproved = refreshedBoard.cards.find((card) => card.id === approved.id)!;

    expect(stagedAnimation.description).toBe("Create the draft animation task from the durable plan.");
    expect(stagedAnimation.pendingPiUpdate).toMatchObject({
      description: "Create the draft animation task with a calm blue pulse from the included chat notes.",
      labels: ["html", "animation", "source-refresh"],
      changedFields: expect.arrayContaining(["description", "labels", "acceptanceCriteria", "testPlan"]),
      clarificationQuestions: [],
    });
    expect(stagedStyle.pendingPiUpdate).toMatchObject({
      description: "Tune the animation color system around a calm blue pulse treatment.",
      clarificationQuestions: [],
    });
    expect(untouchedApproved.pendingPiUpdate).toBeUndefined();
    expect(untouchedApproved.runFeedback ?? []).toEqual([]);

    const applied = store.resolveProjectBoardCardPiUpdate({ cardId: animationDraft.id, action: "apply" });
    expect(applied).toMatchObject({
      description: "Create the draft animation task with a calm blue pulse from the included chat notes.",
      labels: ["html", "animation", "source-refresh"],
      pendingPiUpdate: undefined,
      userTouchedFields: expect.arrayContaining(["description", "labels", "acceptanceCriteria", "testPlan"]),
    });
    expect(store.getProjectBoardCard(styleDraft.id).pendingPiUpdate).toBeTruthy();

    const event = store.getActiveProjectBoard()?.events?.find((candidate) => candidate.title === "Source draft Pi refresh proposed");
    expect(event?.metadata).toMatchObject({
      sourceImpact: expect.objectContaining({
        appliedAction: "propose_targeted_draft_refresh",
        sourceImpactEventIds: [sourceEvent!.id],
        sourceIds: expect.arrayContaining([chat.id]),
        affectedDraftCardIds: expect.arrayContaining([animationDraft.id, styleDraft.id]),
        affectedExecutableCardIds: expect.arrayContaining([approved.id]),
        pendingPiUpdateCardIds: expect.arrayContaining([animationDraft.id, styleDraft.id]),
        existingCardsRewritten: false,
        modelCallRequired: true,
        model: "gmi-test-model",
        telemetry: {
          promptCharCount: 1100,
          responseCharCount: 420,
          requestDurationMs: 1900,
        },
      }),
    });
  });

  it("records deterministic proof coverage rechecks in the board ledger", () => {
    const board = store.createProjectBoard({ title: "Proof coverage board" });
    store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Proof coverage smoke.",
        goal: "Track proof coverage deterministically.",
        currentState: "Two cards are ready for proof review.",
        targetUser: "PM reviewer.",
        qualityBar: "Coverage counts are auditable.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "proof:covered",
            title: "Covered proof card",
            description: "Has unit proof expectations.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Proof",
            labels: [],
            blockedBy: [],
            sourceRefs: [],
            acceptanceCriteria: ["Unit proof exists."],
            testPlan: { unit: ["Run the unit proof."], integration: [], visual: [], manual: [] },
          },
          {
            sourceId: "proof:missing",
            title: "Missing proof card",
            description: "Needs proof expectations before strict dispatch.",
            candidateStatus: "needs_clarification",
            priority: 2,
            phase: "Proof",
            labels: [],
            blockedBy: [],
            sourceRefs: [],
            acceptanceCriteria: ["Proof gap is visible."],
            testPlan: { unit: [], integration: [], visual: [], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: false, insertQuestions: false },
    );

    const rechecked = store.recomputeProjectBoardProofCoverage({ boardId: board.id });
    const event = [...(rechecked.events ?? [])].reverse().find((candidate) => candidate.title === "Proof coverage rechecked");

    expect(event).toMatchObject({
      kind: "card_updated",
      summary: expect.stringContaining("0 model calls"),
      entityKind: "project_board",
      entityId: board.id,
    });
    expect(event?.metadata.proofImpact).toMatchObject({
      schemaVersion: 1,
      appliedAction: "recompute_proof_coverage",
      eligibleCardCount: 2,
      missingProofCount: 1,
      missingProofCardIds: [expect.any(String)],
      unitProofItemCount: 1,
      affectedCardIds: [],
      staleSinceLastRecheck: false,
      driftReasons: ["No proof coverage baseline has been recorded yet."],
      modelCallRequired: false,
      existingCardsRewritten: false,
    });
    expect(event?.metadata.proofImpact).not.toHaveProperty("driftBaselineEventId");
    expect(rechecked.cards.map((card) => card.title)).toEqual(["Covered proof card", "Missing proof card"]);

    const missingProofCard = rechecked.cards.find((card) => card.title === "Missing proof card")!;
    store.updateProjectBoardCard({
      cardId: missingProofCard.id,
      testPlan: { unit: [], integration: [], visual: ["Capture the proof-gap repair screenshot."], manual: [] },
    });

    const driftRechecked = store.recomputeProjectBoardProofCoverage({ boardId: board.id });
    const driftEvent = [...(driftRechecked.events ?? [])].reverse().find((candidate) => candidate.title === "Proof coverage rechecked" && candidate.id !== event?.id);

    expect(driftEvent?.summary).toContain("1 affected card since last recheck");
    expect(driftEvent?.metadata.proofImpact).toMatchObject({
      appliedAction: "recompute_proof_coverage",
      driftBaselineEventId: event?.id,
      staleSinceLastRecheck: true,
      affectedCardIds: [missingProofCard.id],
      resolvedMissingProofCardIds: [missingProofCard.id],
      proofKindChangedCardIds: [missingProofCard.id],
      proofItemCountChangedCardIds: [missingProofCard.id],
      missingProofCount: 0,
      visualProofItemCount: 1,
      modelCallRequired: false,
      existingCardsRewritten: false,
    });
  });

  it("stages proof suggestions as reviewable Pi updates only on missing-proof draft cards", () => {
    const board = store.createProjectBoard({ title: "Proof suggestion board" });
    const synthesisRun = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-pi" });
    const synthesized = store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Proof suggestion smoke.",
        goal: "Fill missing proof expectations without rewriting approved specs.",
        currentState: "One card is already ticketized and one card is still a draft.",
        targetUser: "PM reviewer.",
        qualityBar: "Only draft cards receive generated proof expectations.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "proof:ticketized",
            title: "Already ticketized card",
            description: "This card should not be rewritten after approval.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Proof",
            labels: [],
            blockedBy: [],
            sourceRefs: [],
            acceptanceCriteria: ["Ticketized scope remains unchanged."],
            testPlan: { unit: [], integration: [], visual: [], manual: [] },
          },
          {
            sourceId: "proof:draft",
            title: "Draft card missing proof",
            description: "This card needs generated proof expectations.",
            candidateStatus: "needs_clarification",
            priority: 2,
            phase: "Proof",
            labels: [],
            blockedBy: [],
            sourceRefs: [],
            acceptanceCriteria: ["Proof suggestion is visible."],
            testPlan: { unit: [], integration: [], visual: [], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: false, insertQuestions: false, snapshotRunId: synthesisRun.id, snapshotKind: "incremental" },
    );
    const ticketizedDraft = synthesized.cards.find((card) => card.sourceId === "proof:ticketized")!;
    const draft = synthesized.cards.find((card) => card.sourceId === "proof:draft")!;
    store.updateProjectBoardStatus(board.id, "active");
    store.recordProjectBoardSynthesisRunEvent(synthesisRun.id, {
      stage: "board_applied",
      title: "Applied proof suggestion planning snapshot",
      summary: "The proof suggestion board has a stable planning snapshot before ticketization.",
      status: "succeeded",
      cardCount: synthesized.cards.length,
      questionCount: 0,
      completedAt: "2026-05-17T12:01:00.000Z",
    });
    const [ticketized] = store.createReadyProjectBoardTasks(board.id);

    const next = store.applyProjectBoardProofSuggestions({
      boardId: board.id,
      targetCardIds: [ticketized.id, draft.id],
      model: "test-pi",
      telemetry: { promptCharCount: 1200, responseCharCount: 300, requestDurationMs: 42 },
      fallbackUsed: true,
      providerError: "GMI stream stalled before content.",
      suggestions: [
        {
          cardId: ticketized.id,
          proofOwnership: "integration",
          confidence: "high",
          rationale: "Should be skipped because it is already approved.",
          testPlan: { unit: [], integration: ["Do not apply this to approved cards."], visual: [], manual: [] },
        },
        {
          cardId: draft.id,
          proofOwnership: "visible_surface",
          confidence: "high",
          rationale: "Draft card needs visible proof expectations.",
          testPlan: {
            unit: [],
            integration: ["Run a browser smoke check for the proof card."],
            visual: ["Capture desktop and mobile screenshots for the proof card."],
            manual: [],
          },
        },
      ],
    });

    expect(ticketized.id).toBe(ticketizedDraft.id);
    expect(next.cards.find((card) => card.id === ticketized.id)?.testPlan).toEqual({ unit: [], integration: [], visual: [], manual: [] });
    const stagedDraft = next.cards.find((card) => card.id === draft.id)!;
    expect(stagedDraft.testPlan).toEqual({ unit: [], integration: [], visual: [], manual: [] });
    expect(stagedDraft.pendingPiUpdate).toMatchObject({
      sourceId: "proof:test-pi",
      changedFields: ["testPlan"],
      testPlan: {
        integration: ["Run a browser smoke check for the proof card."],
        visual: ["Capture desktop and mobile screenshots for the proof card."],
      },
    });
    const applied = store.resolveProjectBoardCardPiUpdate({ cardId: draft.id, action: "apply" });
    expect(applied).toMatchObject({
      pendingPiUpdate: undefined,
      testPlan: {
        integration: ["Run a browser smoke check for the proof card."],
        visual: ["Capture desktop and mobile screenshots for the proof card."],
      },
      userTouchedFields: expect.arrayContaining(["testPlan"]),
    });
    const event = (next.events ?? []).find((candidate) => candidate.title === "Proof expectations suggested");
    const proofImpact = event?.metadata.proofImpact as { skippedReasons: Record<string, string> } | undefined;
    expect(proofImpact).toMatchObject({
      schemaVersion: 1,
      appliedAction: "suggest_missing_proof",
      targetCardIds: [ticketized.id, draft.id],
      appliedCardIds: [draft.id],
      pendingPiUpdateCardIds: [draft.id],
      skippedCardIds: [ticketized.id],
      existingCardsRewritten: false,
      modelCallRequired: true,
      model: "test-pi",
      promptCharCount: 1200,
      responseCharCount: 300,
      fallbackUsed: true,
      providerError: "GMI stream stalled before content.",
    });
    expect(proofImpact?.skippedReasons[ticketized.id]).toContain("approved card specs were not rewritten");
    expect((next.events ?? []).find((candidate) => candidate.title === "Proof Pi update available")?.metadata).toMatchObject({
      cardId: draft.id,
      changedFields: ["testPlan"],
      protectedPiUpdate: true,
      modelCallRequired: true,
    });
  });

  it("applies clarification default suggestions as reviewable metadata without rewriting card specs", () => {
    const board = store.createProjectBoard({ title: "Clarification defaults board" });
    const synthesized = store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Clarification default smoke.",
        goal: "Suggest expert defaults for legacy questions without regenerating cards.",
        currentState: "One draft has an open legacy clarification question.",
        targetUser: "PM reviewer.",
        qualityBar: "Defaults are PM reviewable and card specs stay intact.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "clarification:legacy",
            title: "Create animated hello-world page",
            description: "Build src/index.html with the approved greeting.",
            candidateStatus: "needs_clarification",
            priority: 1,
            phase: "Decisions",
            labels: ["html"],
            blockedBy: [],
            sourceRefs: [],
            acceptanceCriteria: ["src/index.html renders Hello from Ambient."],
            testPlan: { unit: ["Check greeting text."], integration: [], visual: [], manual: [] },
            clarificationQuestions: ["Should the animation use pulse or confetti?"],
          },
        ],
      },
      { replaceExistingDraft: false, insertQuestions: false },
    );
    const draft = synthesized.cards.find((card) => card.sourceId === "clarification:legacy")!;
    const decision = draft.clarificationDecisions?.[0];
    expect(decision).toMatchObject({ state: "open" });
    expect(decision?.suggestedAnswer).toBeUndefined();

    const next = store.applyProjectBoardClarificationDefaultSuggestions({
      boardId: board.id,
      targetCardIds: [draft.id],
      model: "test-pi",
      telemetry: { promptCharCount: 900, responseCharCount: 240, requestDurationMs: 33 },
      suggestions: [
        {
          cardId: draft.id,
          decisionId: decision!.id,
          canonicalKey: decision!.canonicalKey,
          question: "Should the animation use pulse or confetti?",
          suggestedAnswer: "Use a subtle pulse animation.",
          rationale: "Pulse is cheap to implement and easy to verify visually.",
          confidence: "high",
          safeToAccept: true,
          questionKind: "expert_default",
        },
      ],
    });

    const suggested = next.cards.find((card) => card.id === draft.id)!;
    expect(suggested).toMatchObject({
      title: "Create animated hello-world page",
      description: "Build src/index.html with the approved greeting.",
      acceptanceCriteria: ["src/index.html renders Hello from Ambient."],
      pendingPiUpdate: undefined,
    });
    expect(suggested.userTouchedFields ?? []).toEqual([]);
    expect(suggested.clarificationSuggestions).toEqual([
      expect.objectContaining({
        question: "Should the animation use pulse or confetti?",
        suggestedAnswer: "Use a subtle pulse animation.",
        safeToAccept: true,
        questionKind: "expert_default",
      }),
    ]);
    expect(suggested.clarificationDecisions).toEqual([
      expect.objectContaining({
        id: decision!.id,
        state: "open",
        suggestedAnswer: "Use a subtle pulse animation.",
        safeToAccept: true,
        questionKind: "expert_default",
      }),
    ]);
    const event = (next.events ?? []).find((candidate) => candidate.title === "Clarification defaults suggested");
    expect(event?.metadata.clarificationDefaults).toMatchObject({
      appliedAction: "suggest_expert_defaults",
      targetCardIds: [draft.id],
      appliedCardIds: [draft.id],
      suggestedDecisionCount: 1,
      safeSuggestionCount: 1,
      existingCardsRewritten: false,
      modelCallRequired: true,
      model: "test-pi",
      promptCharCount: 900,
      responseCharCount: 240,
    });
  });

  it("runs a tiny durable-artifact board through source refresh, ticketization, and proof close", async () => {
    const durablePlanRelativePath = ".ambient/board/plans/Tiny-Hello-Animation-DurablePlan.html";
    const durablePlanPath = join(workspacePath, durablePlanRelativePath);
    await mkdir(dirname(durablePlanPath), { recursive: true });
    await writeFile(
      durablePlanPath,
      [
        "<!doctype html>",
        "<html><body>",
        "<h1>Tiny animated hello-world durable plan</h1>",
        "<p>Create a single-file app that renders Hello from Ambient with a subtle CSS animation.</p>",
        "</body></html>",
      ].join("\n"),
      "utf8",
    );

    const board = store.createProjectBoard({ title: "Tiny durable e2e board" });
    const invalidWorkflow = `---
orchestration:
  max_concurrent_agents: nope
---
Work on Local Task {{ task.identifier }}.`;
    await writeFile(join(workspacePath, "WORKFLOW.md"), invalidWorkflow, "utf8");
    const directRepairPreview = await previewProjectBoardWorkflowRepair(workspacePath);
    expect(directRepairPreview).toMatchObject({
      workspaceStrategy: "directory",
      currentText: invalidWorkflow,
      proposedText: expect.stringContaining("max_concurrent_agents: 1"),
      diff: expect.stringContaining("-  max_concurrent_agents: nope"),
      currentLineCount: 5,
    });
    const invalidReadiness = await readOrchestrationWorkflowReadiness(workspacePath);
    expect(invalidReadiness).toMatchObject({
      status: "invalid",
      code: "workflow_validation_error",
      repairPreview: expect.objectContaining({
        currentText: invalidWorkflow,
        proposedText: expect.stringContaining("Description:\n{{ task.description }}"),
        diff: expect.stringContaining("+  max_concurrent_agents: 1"),
      }),
    });
    const workflowRepair = await repairProjectBoardWorkflow(workspacePath, "restore_generated_default");
    expect(workflowRepair.error).toBeUndefined();
    expect(workflowRepair.backupPath).toBeTruthy();
    store.recordProjectBoardWorkflowRepair({
      boardId: board.id,
      action: "restore_generated_default",
      workflowPath: workflowRepair.workflowPath,
      workflowHash: workflowRepair.workflow?.contentHash,
      previousWorkflowHash: workflowRepair.previousWorkflowHash,
      backupPath: workflowRepair.backupPath,
      status: workflowRepair.workflow ? "ready" : "invalid",
    });
    await expect(readFile(workflowRepair.backupPath!, "utf8")).resolves.toBe(invalidWorkflow);
    await expect(readFile(join(workspacePath, "WORKFLOW.md"), "utf8")).resolves.toContain("Description:\n{{ task.description }}");
    await expect(readOrchestrationWorkflowReadiness(workspacePath)).resolves.toMatchObject({ status: "ready" });
    expect(store.getActiveProjectBoard()?.events?.some((event) => event.kind === "workflow_repaired")).toBe(true);

    const workflowSettings = await updateProjectBoardWorkflowSettings(workspacePath, {
      maxTurns: 24,
      requireScreenshots: true,
    });
    expect(workflowSettings.error).toBeUndefined();
    expect(workflowSettings.changedFields).toEqual(["orchestration.max_turns", "proof_of_work.require_screenshots"]);
    expect(workflowSettings.diff).toContain("+  max_turns: 24");
    store.recordProjectBoardWorkflowSettingsUpdated({
      boardId: board.id,
      workflowPath: workflowSettings.workflowPath,
      workflowHash: workflowSettings.workflow?.contentHash,
      previousWorkflowHash: workflowSettings.previousWorkflowHash,
      backupPath: workflowSettings.backupPath,
      changedFields: workflowSettings.changedFields,
      diff: workflowSettings.diff,
      status: workflowSettings.workflow ? "ready" : "invalid",
      message: workflowSettings.error?.message,
    });
    await expect(readOrchestrationWorkflowReadiness(workspacePath)).resolves.toMatchObject({
      status: "ready",
      maxTurns: 24,
      proofOfWork: expect.objectContaining({ requireScreenshots: true }),
    });
    expect(store.getActiveProjectBoard()?.events?.some((event) => event.kind === "workflow_settings_updated")).toBe(true);

    const workflowRawBefore = await readFile(join(workspacePath, "WORKFLOW.md"), "utf8");
    const workflowRaw = await updateProjectBoardWorkflowRaw(workspacePath, {
      markdown: workflowRawBefore.replace(
        "finish with changed files, commands run, proof, and blockers.",
        "finish with changed files, commands run, proof, blockers, and a viewport note when visual behavior changes.",
      ),
    });
    expect(workflowRaw.error).toBeUndefined();
    expect(workflowRaw.changed).toBe(true);
    expect(workflowRaw.diff).toContain("+Complete the task in the prepared workspace");
    store.recordProjectBoardWorkflowRawUpdated({
      boardId: board.id,
      workflowPath: workflowRaw.workflowPath,
      workflowHash: workflowRaw.workflow?.contentHash,
      previousWorkflowHash: workflowRaw.previousWorkflowHash,
      backupPath: workflowRaw.backupPath,
      changed: workflowRaw.changed,
      diff: workflowRaw.diff,
      status: workflowRaw.workflow ? "ready" : "invalid",
      message: workflowRaw.error?.message,
    });
    await expect(readOrchestrationWorkflowReadiness(workspacePath)).resolves.toMatchObject({
      status: "ready",
      rawContent: expect.stringContaining("viewport note"),
    });
    expect(store.getActiveProjectBoard()?.events?.some((event) => event.kind === "workflow_raw_updated")).toBe(true);

    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Tiny Hello Animation Durable Plan",
        summary: "Authoritative durable plan for a tiny animated hello-world app.",
        path: durablePlanRelativePath,
        relevance: 99,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "thread",
        title: "Animation brainstorming chat",
        summary: "Optional chat notes suggest a pulsing greeting and calm colors.",
        threadId: "thread-tiny-animation-chat",
        relevance: 50,
        authorityRole: "ignored",
        includeInSynthesis: false,
      },
    ]);
    const durable = sources.find((source) => source.path === durablePlanRelativePath)!;
    const chat = sources.find((source) => source.threadId === "thread-tiny-animation-chat")!;
    expect(durable).toMatchObject({ authorityRole: "primary", includeInSynthesis: true });
    expect(chat).toMatchObject({ authorityRole: "ignored", includeInSynthesis: false });
    const tinyDecisionQuestion = "Should the tiny hello animation use a subtle pulse effect or a celebratory confetti effect?";
    const synthesisDraft: ProjectBoardSynthesisDraft = {
      summary: "Tiny hello-world app plan from the durable artifact.",
      goal: "Ship a tiny animated hello-world page.",
      currentState: "Durable plan exists; optional chat notes are ignored by default.",
      targetUser: "Local smoke-test reviewer.",
      qualityBar: "Single-file implementation with visual proof.",
      assumptions: ["Use plain HTML and CSS."],
      questions: [],
      sourceNotes: [`Durable plan: ${durablePlanRelativePath}`],
      cards: [
        {
          sourceId: "tiny:animated-hello",
          title: "Create animated hello-world page",
          description: "Build src/index.html with the approved greeting and a subtle animation.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Tiny slice",
          labels: ["tiny-e2e", "html"],
          blockedBy: [],
          sourceRefs: [durable.id, durablePlanRelativePath, chat.id],
          acceptanceCriteria: ["src/index.html renders Hello from Ambient.", "The greeting has a visible CSS animation."],
          testPlan: {
            unit: ["Validate the HTML file contains the greeting text."],
            integration: [],
            visual: ["Capture desktop screenshot proof of the animated page."],
            manual: ["Open the page and confirm it is readable."],
          },
          clarificationQuestions: [tinyDecisionQuestion],
        },
      ],
    };
    const synthesisRun = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "tiny-durable-artifact-e2e-smoke" });
    const synthesized = store.applyProjectBoardSynthesis(board.id, synthesisDraft, {
      replaceExistingDraft: false,
      insertQuestions: false,
      snapshotRunId: synthesisRun.id,
      snapshotKind: "incremental",
    });
    const draft = synthesized.cards.find((card) => card.sourceId === "tiny:animated-hello")!;
    expect(draft.clarificationQuestions).toEqual([tinyDecisionQuestion]);
    expect(draft.clarificationSuggestions).toEqual([]);
    expect(draft.clarificationDecisions).toEqual([
      expect.objectContaining({
        state: "open",
      }),
    ]);
    expect(draft.clarificationDecisions?.[0].suggestedAnswer).toBeUndefined();
    const defaultedBoard = store.applyProjectBoardClarificationDefaultSuggestions({
      boardId: board.id,
      targetCardIds: [draft.id],
      model: "gmi-clarification-defaults-e2e-smoke",
      telemetry: { promptCharCount: 860, responseCharCount: 260, requestDurationMs: 1200 },
      suggestions: [
        {
          cardId: draft.id,
          decisionId: draft.clarificationDecisions![0].id,
          canonicalKey: draft.clarificationDecisions![0].canonicalKey,
          question: tinyDecisionQuestion,
          suggestedAnswer: "Use a subtle pulse animation.",
          rationale: "A pulse animation is simple to prove visually and avoids decorative scope creep.",
          confidence: "high",
          safeToAccept: true,
          questionKind: "expert_default",
        },
      ],
    });
    const defaultedDraft = defaultedBoard.cards.find((card) => card.id === draft.id)!;
    expect(defaultedDraft.clarificationSuggestions).toEqual([
      expect.objectContaining({
        suggestedAnswer: "Use a subtle pulse animation.",
        safeToAccept: true,
      }),
    ]);
    expect(defaultedDraft.clarificationDecisions).toEqual([
      expect.objectContaining({
        state: "open",
        suggestedAnswer: "Use a subtle pulse animation.",
      }),
    ]);
    store.stageProjectBoardDecisionDraftPiUpdates({
      cardId: draft.id,
      question: tinyDecisionQuestion,
      answer: "Use a subtle pulse animation.",
      model: "gmi-e2e-smoke",
      telemetry: { promptCharCount: 1000, responseCharCount: 360, requestDurationMs: 1500 },
      suggestions: [
        {
          cardId: draft.id,
          description: "Build src/index.html with the approved greeting and a subtle pulse animation.",
          labels: ["tiny-e2e", "html", "animation"],
          acceptanceCriteria: [
            "src/index.html renders Hello from Ambient.",
            "The greeting has a visible, subtle pulse animation.",
          ],
          testPlan: {
            unit: ["Validate the HTML file contains the greeting text."],
            integration: [],
            visual: ["Capture desktop screenshot proof of the pulse animation."],
            manual: ["Open the page and confirm it is readable."],
          },
          clarificationQuestions: [],
          rationale: "Tiny e2e decision selected pulse animation.",
          confidence: "high",
        },
      ],
    });
    expect(store.getProjectBoardCard(draft.id).pendingPiUpdate).toMatchObject({
      description: "Build src/index.html with the approved greeting and a subtle pulse animation.",
      clarificationQuestions: [],
      clarificationDecisions: [expect.objectContaining({ state: "answered", answer: "Use a subtle pulse animation." })],
    });
    const decisionUpdateQueue = projectBoardPiUpdateReviewQueue(store.getActiveProjectBoard()!);
    expect(decisionUpdateQueue).toMatchObject({
      visible: true,
      decisionCount: 1,
      sourceCount: 0,
      proofCount: 0,
    });
    expect(decisionUpdateQueue.actionableItems.map((item) => item.card.id)).toEqual([draft.id]);
    expect(decisionUpdateQueue.items[0]).toMatchObject({
      sourceLabel: "PM decision refresh",
      changedFieldLabels: expect.arrayContaining(["answers", "decision gates"]),
      actionable: true,
    });
    const decisionRefreshedDraft = store.resolveProjectBoardCardPiUpdate({ cardId: draft.id, action: "apply" });
    expect(decisionRefreshedDraft).toMatchObject({
      description: "Build src/index.html with the approved greeting and a subtle pulse animation.",
      clarificationQuestions: [],
      clarificationAnswers: [expect.objectContaining({ answer: "Use a subtle pulse animation." })],
      clarificationDecisions: [expect.objectContaining({ state: "answered", answer: "Use a subtle pulse animation." })],
    });
    const duplicateDecisionDraft = store.updateProjectBoardCard({
      cardId: draft.id,
      clarificationQuestions: ["Should the tiny hello animation use the subtle pulse effect instead of celebratory confetti?"],
    });
    expect(duplicateDecisionDraft.clarificationDecisions).toEqual([
      expect.objectContaining({ state: "answered", answer: "Use a subtle pulse animation." }),
      expect.objectContaining({
        state: "duplicate",
        question: "Should the tiny hello animation use the subtle pulse effect instead of celebratory confetti?",
        duplicateOf: decisionRefreshedDraft.clarificationDecisions?.[0].id,
        answer: "Use a subtle pulse animation.",
      }),
    ]);
    expect(projectBoardPendingClarificationDecisions(duplicateDecisionDraft)).toEqual([]);

    const legacyDecisionArtifactFiles = projectBoardArtifactExportFromSummary(store.getActiveProjectBoard()!).files.map((file) => {
      if (!file.path.endsWith(`cards/${draft.id}.json`)) return file;
      const artifact = JSON.parse(file.content) as Record<string, unknown>;
      const decisions = Array.isArray(artifact.clarificationDecisions) ? artifact.clarificationDecisions : [];
      artifact.clarificationDecisions = decisions.map((decision, index) => {
        if (!decision || typeof decision !== "object" || Array.isArray(decision)) return decision;
        const nextDecision = { ...(decision as Record<string, unknown>) };
        nextDecision.id = `question-${index + 1}`;
        delete nextDecision.canonicalKey;
        if (index === 1) nextDecision.duplicateOf = "question-1";
        return nextDecision;
      });
      return { ...file, content: JSON.stringify(artifact, null, 2) };
    });
    const legacyProjection = projectBoardArtifactProjectionFromFiles(legacyDecisionArtifactFiles);
    const legacyProjectionCard = legacyProjection.cards.find((card) => card.cardId === draft.id)!;
    expect(legacyProjectionCard.clarificationDecisions?.[0]).toMatchObject({
      id: "question-1",
      canonicalKey: expect.any(String),
      state: "answered",
    });
    const importedLegacyBoard = store.applyProjectBoardArtifactProjection(workspacePath, legacyProjection);
    const importedLegacyDraft = importedLegacyBoard.cards.find((card) => card.id === draft.id)!;
    expect(importedLegacyDraft.clarificationDecisions).toEqual([
      expect.objectContaining({
        state: "answered",
        id: decisionRefreshedDraft.clarificationDecisions?.[0].id,
        canonicalKey: expect.any(String),
        answer: "Use a subtle pulse animation.",
      }),
      expect.objectContaining({
        state: "duplicate",
        duplicateOf: decisionRefreshedDraft.clarificationDecisions?.[0].id,
        answer: "Use a subtle pulse animation.",
      }),
    ]);
    expect(projectBoardPendingClarificationDecisions(importedLegacyDraft)).toEqual([]);

    store.updateProjectBoardCardCandidateStatus(draft.id, "ready_to_create");

    const coverageBoard = store.recomputeProjectBoardProofCoverage({ boardId: board.id });
    const coverageEvent = [...(coverageBoard.events ?? [])].reverse().find((event) => event.title === "Proof coverage rechecked");
    expect(coverageEvent?.metadata.proofImpact).toMatchObject({
      appliedAction: "recompute_proof_coverage",
      eligibleCardCount: 1,
      missingProofCount: 0,
      visualProofItemCount: 1,
      existingCardsRewritten: false,
      modelCallRequired: false,
    });

    store.updateProjectBoardSource({ sourceId: chat.id, kind: "thread", includeInSynthesis: true });
    const sourceEvent = store.getActiveProjectBoard()?.events?.find((event) => event.kind === "source_updated");
    expect(sourceEvent?.metadata.sourceImpact).toMatchObject({
      targetedRefreshOptional: true,
      affectedDraftCardIds: expect.arrayContaining([draft.id]),
      modelCallRequired: false,
    });

    store.stageProjectBoardSourceDraftPiUpdates({
      boardId: board.id,
      sourceImpactEventId: sourceEvent!.id,
      model: "gmi-source-e2e-smoke",
      telemetry: { promptCharCount: 940, responseCharCount: 330, requestDurationMs: 1300 },
      suggestions: [
        {
          cardId: draft.id,
          description: "Build src/index.html with the approved greeting, a subtle pulse animation, and calm colors from the included chat notes.",
          labels: ["tiny-e2e", "html", "animation", "source-refresh"],
          acceptanceCriteria: [
            "src/index.html renders Hello from Ambient.",
            "The greeting has a visible, subtle pulse animation.",
            "The animation uses calm colors from the included chat notes.",
          ],
          testPlan: {
            unit: ["Validate the HTML file contains the greeting text."],
            integration: [],
            visual: ["Capture desktop and mobile screenshot proof of the calm pulse animation."],
            manual: ["Open the page and confirm it is readable."],
          },
          clarificationQuestions: [],
          rationale: "The newly included chat adds calm-color guidance without changing the durable-plan scope.",
          confidence: "high",
        },
      ],
    });
    expect(store.getProjectBoardCard(draft.id).pendingPiUpdate).toMatchObject({
      description: "Build src/index.html with the approved greeting, a subtle pulse animation, and calm colors from the included chat notes.",
      labels: ["tiny-e2e", "html", "animation", "source-refresh"],
    });
    const sourceUpdateQueue = projectBoardPiUpdateReviewQueue(store.getActiveProjectBoard()!);
    expect(sourceUpdateQueue).toMatchObject({
      visible: true,
      decisionCount: 0,
      sourceCount: 1,
      proofCount: 0,
    });
    expect(sourceUpdateQueue.items[0]).toMatchObject({
      card: expect.objectContaining({ id: draft.id }),
      sourceLabel: "Source refresh",
      changedFieldLabels: expect.arrayContaining(["description", "acceptance", "proof plan"]),
      actionable: true,
    });
    const sourcePiRefreshedDraft = store.resolveProjectBoardCardPiUpdate({ cardId: draft.id, action: "apply" });
    expect(sourcePiRefreshedDraft).toMatchObject({
      description: "Build src/index.html with the approved greeting, a subtle pulse animation, and calm colors from the included chat notes.",
      pendingPiUpdate: undefined,
    });

    const refreshed = store.refreshProjectBoardSourceDrafts({ boardId: board.id, sourceImpactEventId: sourceEvent!.id });
    const refreshedDraft = refreshed.cards.find((card) => card.id === draft.id)!;
    expect(refreshedDraft.description).toContain("## Source impact refresh");
    expect(refreshedDraft.status).toBe("draft");

    store.updateProjectBoardStatus(board.id, "active");
    store.recordProjectBoardSynthesisRunEvent(synthesisRun.id, {
      stage: "board_applied",
      title: "Applied tiny durable-artifact planning snapshot",
      summary: "The tiny durable-artifact board has a stable planning snapshot before ticketization.",
      status: "succeeded",
      cardCount: 1,
      questionCount: 0,
      completedAt: "2026-05-17T12:02:00.000Z",
    });
    const [ticketized] = store.createReadyProjectBoardTasks(board.id);
    expect(ticketized).toMatchObject({ status: "ready", orchestrationTaskId: expect.any(String) });
    const task = store.getOrchestrationTask(ticketized.orchestrationTaskId!);
    expect(task.title).toBe("Create animated hello-world page");
    expect(task.description).toContain("Build src/index.html");
    expect(task.description).toContain("Source impact refresh");

    store.updateProjectBoardSource({ sourceId: chat.id, kind: "thread", includeInSynthesis: false });
    const postTicketSourceEvent = store.getActiveProjectBoard()?.events?.find((event) => event.kind === "source_updated");
    expect(postTicketSourceEvent?.metadata.sourceImpact).toMatchObject({
      affectedExecutableCardIds: expect.arrayContaining([ticketized.id]),
      nextRunFeedbackRecommended: true,
      modelCallRequired: false,
    });
    const feedbackBoard = store.applyProjectBoardSourceImpactFeedback({ boardId: board.id, sourceImpactEventId: postTicketSourceEvent!.id });
    const feedbackCard = feedbackBoard.cards.find((card) => card.id === ticketized.id)!;
    expect(feedbackCard.runFeedback).toEqual([
      expect.objectContaining({
        source: "source_impact",
        sourceImpactEventId: postTicketSourceEvent!.id,
      }),
    ]);
    const feedbackTask = store.getOrchestrationTask(ticketized.orchestrationTaskId!);
    expect(feedbackTask.description).toContain("Source authority changed after this card was approved");
    expect(feedbackTask.description).toContain("Animation brainstorming chat");
    store.applyProjectBoardSourceImpactFeedback({ boardId: board.id, sourceImpactEventId: postTicketSourceEvent!.id });
    expect(store.getProjectBoardCard(ticketized.id).runFeedback).toHaveLength(1);

    const runWorkspace = join(workspacePath, ".ambient-codex", "orchestration", "workspaces", task.identifier);
    await mkdir(join(runWorkspace, "src"), { recursive: true });
    await writeFile(
      join(runWorkspace, "src", "index.html"),
      "<!doctype html><style>h1{animation:pulse 1s infinite alternate}@keyframes pulse{to{transform:scale(1.02)}}</style><h1>Hello from Ambient</h1>",
      "utf8",
    );
    const run = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: runWorkspace });
    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      proofOfWork: {
        changedFiles: ["src/index.html"],
        commands: [{ command: "node -e \"console.log('Hello from Ambient')\"", result: "passed", output: "Hello from Ambient" }],
        screenshots: [
          { path: "proof/animated-hello-desktop.png", width: 1280, height: 720, label: "Desktop screenshot" },
          { path: "proof/animated-hello-mobile.png", width: 390, height: 844, label: "Mobile screenshot" },
        ],
        visualChecks: [{ path: "proof/animated-hello-desktop.png", result: "nonblank_image_detected", width: 1280, height: 720 }],
        diff: "diff --git a/src/index.html b/src/index.html\n+<h1>Hello from Ambient</h1>",
        lastAssistantText:
          "Implemented src/index.html. The page renders Hello from Ambient, the CSS pulse animation is present, unit proof checked the greeting text, visual screenshot captured, and manual review passed.",
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(ticketized.id);
    expect(reviewed.status).toBe("review");
    expect(reviewed.proofReview).toMatchObject({
      status: "ready_for_review",
      missing: [],
      runId: run.id,
    });

    const done = store.resolveProjectBoardProofDecision({ cardId: reviewed.id, action: "accept_done", reason: "Tiny durable e2e proof accepted." });
    expect(done.status).toBe("done");
    expect(store.getOrchestrationTask(task.id).state).toBe("done");

    const proofGapSynthesisRun = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "tiny-proof-gap-e2e-smoke" });
    store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Tiny follow-up proof case from the same durable artifact.",
        goal: "Exercise proof rejection and follow-up materialization.",
        currentState: "The happy-path card is complete; a second small proof card intentionally returns weak evidence.",
        targetUser: "Local smoke-test reviewer.",
        qualityBar: "Missing proof produces an explicit follow-up draft.",
        assumptions: ["Use the durable plan as source authority."],
        questions: [],
        sourceNotes: [`Durable plan: ${durablePlanRelativePath}`],
        cards: [
          {
            sourceId: "tiny:animated-hello-proof-gap",
            title: "Collect missing animation proof",
            description: "Confirm the animated greeting with screenshot proof.",
            candidateStatus: "ready_to_create",
            priority: 2,
            phase: "Proof",
            labels: ["tiny-e2e", "proof-gap"],
            blockedBy: [],
            sourceRefs: [durable.id, durablePlanRelativePath],
            acceptanceCriteria: ["Screenshot evidence proves the animation page is visible."],
            testPlan: {
              unit: ["Confirm the generated page still contains Hello from Ambient."],
              integration: [],
              visual: ["Capture mobile and desktop screenshots of the animation."],
              manual: ["Review screenshot clarity."],
            },
          },
        ],
      },
      {
        replaceExistingDraft: false,
        insertQuestions: false,
        snapshotRunId: proofGapSynthesisRun.id,
        snapshotKind: "incremental",
      },
    );
    store.updateProjectBoardStatus(board.id, "active");
    store.recordProjectBoardSynthesisRunEvent(proofGapSynthesisRun.id, {
      stage: "board_applied",
      title: "Applied proof-gap planning snapshot",
      summary: "The proof-gap card has a stable planning snapshot before ticketization.",
      status: "succeeded",
      cardCount: 2,
      questionCount: 0,
      completedAt: "2026-05-17T12:03:00.000Z",
    });
    const proofGapCard = store.createReadyProjectBoardTasks(board.id).find((card) => card.sourceId === "tiny:animated-hello-proof-gap")!;
    expect(proofGapCard).toMatchObject({ status: "ready", orchestrationTaskId: expect.any(String) });
    const proofGapRun = store.recordPreparedOrchestrationRun({
      taskId: proofGapCard.orchestrationTaskId!,
      workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", "proof-gap"),
    });
    store.updateOrchestrationRun({
      id: proofGapRun.id,
      status: "completed",
      proofOfWork: {
        lastAssistantText: "I inspected the plan, but the screenshots were not captured yet.",
      },
    });
    store.applyProjectBoardCardProofReview({
      runId: proofGapRun.id,
      review: {
        status: "needs_follow_up",
        summary: "The proof run confirmed the scope but did not collect the required screenshots.",
        satisfied: ["The run inspected the durable plan scope."],
        missing: [
          "Acceptance criteria were not proven by attached evidence.",
          "No changed implementation files or meaningful diff evidence recorded.",
          "Visual proof missing: desktop and mobile screenshots were not captured.",
        ],
        followUpCardIds: [],
        runId: proofGapRun.id,
        reviewedAt: new Date().toISOString(),
        reviewer: "ambient_pi",
        model: "gmi-proof-follow-up-e2e",
        confidence: 0.86,
        evidenceQuality: "weak",
        recommendedAction: "follow_up",
        followUpSuggestion: {
          title: "Capture animation screenshot proof",
          description: "Collect the missing desktop and mobile screenshot evidence for the animated hello-world page.",
          acceptanceCriteria: [
            "Desktop screenshot shows the Hello from Ambient animation page rendered and readable.",
            "Mobile screenshot shows the compact animation page rendered and readable.",
          ],
          testPlan: {
            unit: ["Confirm the generated page still contains Hello from Ambient."],
            integration: [],
            visual: ["Capture desktop and mobile screenshots of the animation page."],
            manual: ["Inspect screenshots for readable text and no layout clipping."],
          },
          clarificationQuestions: [],
          labels: ["visual-proof", "tiny-e2e"],
          rationale: "The parent scope is valid; only evidence collection remains.",
        },
      },
    });
    const proofGapReviewed = store.getProjectBoardCard(proofGapCard.id);
    expect(proofGapReviewed.status).toBe("blocked");
    expect(proofGapReviewed.proofReview).toMatchObject({
      status: "needs_follow_up",
      recommendedAction: "follow_up",
      missing: expect.arrayContaining([
        expect.stringContaining("Acceptance criteria"),
        expect.stringContaining("No changed implementation files"),
        expect.stringContaining("Visual proof missing"),
      ]),
      followUpSuggestion: expect.objectContaining({
        title: "Capture animation screenshot proof",
      }),
    });
    const proofFollowUp = store
      .getActiveProjectBoard()!
      .cards.find((candidate) => candidate.sourceKind === "run_follow_up" && candidate.blockedBy.includes(proofGapReviewed.id));
    expect(proofFollowUp).toMatchObject({
      title: "Capture animation screenshot proof",
      status: "draft",
      candidateStatus: "needs_clarification",
      labels: expect.arrayContaining(["proof-follow-up", "pi-suggested-follow-up", "visual-proof", "tiny-e2e", "proof-gap"]),
      acceptanceCriteria: expect.arrayContaining([expect.stringContaining("Desktop screenshot"), expect.stringContaining("Mobile screenshot")]),
      testPlan: expect.objectContaining({
        visual: expect.arrayContaining([expect.stringContaining("desktop and mobile screenshots")]),
        manual: expect.arrayContaining([expect.stringContaining("layout clipping")]),
      }),
    });
    expect(proofGapReviewed.proofReview?.followUpCardIds).toEqual([proofFollowUp!.id]);

    const proofSuggestionSynthesisRun = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "tiny-proof-suggestion-e2e-smoke" });
    store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Tiny proof suggestion card from the same durable artifact.",
        goal: "Exercise generated proof expectations before ticketization.",
        currentState: "One missing-proof draft needs targeted proof suggestions.",
        targetUser: "Local smoke-test reviewer.",
        qualityBar: "Proof suggestions make a draft card eligible for ticketization without rewriting approved cards.",
        assumptions: ["Use the durable plan as source authority."],
        questions: [],
        sourceNotes: [`Durable plan: ${durablePlanRelativePath}`],
        cards: [
          {
            sourceId: "tiny:animated-hello-proof-suggestion",
            title: "Prepare visual proof checklist",
            description: "Create the proof checklist for the animated hello-world page.",
            candidateStatus: "needs_clarification",
            priority: 3,
            phase: "Proof",
            labels: ["tiny-e2e", "proof-suggestion"],
            blockedBy: [],
            sourceRefs: [durable.id, durablePlanRelativePath],
            acceptanceCriteria: ["The card has concrete visual proof expectations before ticketization."],
            testPlan: { unit: [], integration: [], visual: [], manual: [] },
          },
        ],
      },
      {
        replaceExistingDraft: false,
        insertQuestions: false,
        snapshotRunId: proofSuggestionSynthesisRun.id,
        snapshotKind: "incremental",
      },
    );
    const suggestionDraft = store.getActiveProjectBoard()!.cards.find((card) => card.sourceId === "tiny:animated-hello-proof-suggestion")!;
    const suggestedBoard = store.applyProjectBoardProofSuggestions({
      boardId: board.id,
      targetCardIds: [suggestionDraft.id],
      model: "test-pi",
      telemetry: { promptCharCount: 1600, responseCharCount: 360, requestDurationMs: 55 },
      suggestions: [
        {
          cardId: suggestionDraft.id,
          proofOwnership: "visible_surface",
          confidence: "high",
          rationale: "The card prepares visual proof for a browser-visible animated page.",
          testPlan: {
            unit: [],
            integration: ["Run a browser smoke check that opens the animated hello-world page."],
            visual: ["Capture desktop and mobile screenshots showing the greeting rendered and nonblank."],
            manual: [],
          },
        },
      ],
    });
    const proofSuggestedDraft = suggestedBoard.cards.find((card) => card.id === suggestionDraft.id)!;
    expect(proofSuggestedDraft.testPlan.visual).toEqual([]);
    expect(proofSuggestedDraft.pendingPiUpdate).toMatchObject({
      sourceId: "proof:test-pi",
      changedFields: ["testPlan"],
      testPlan: {
        integration: ["Run a browser smoke check that opens the animated hello-world page."],
        visual: ["Capture desktop and mobile screenshots showing the greeting rendered and nonblank."],
      },
    });
    const proofUpdateQueue = projectBoardPiUpdateReviewQueue(suggestedBoard);
    expect(proofUpdateQueue).toMatchObject({
      visible: true,
      decisionCount: 0,
      sourceCount: 0,
      proofCount: 1,
    });
    expect(proofUpdateQueue.items[0]).toMatchObject({
      card: expect.objectContaining({ id: suggestionDraft.id }),
      sourceLabel: "Proof suggestion",
      changedFieldLabels: ["proof plan"],
      previewLines: expect.arrayContaining(["Proof plan: 2 expectations"]),
    });
    expect((suggestedBoard.events ?? []).find((event) => event.title === "Proof expectations suggested")?.metadata.proofImpact).toMatchObject({
      appliedAction: "suggest_missing_proof",
      appliedCardIds: [suggestionDraft.id],
      pendingPiUpdateCardIds: [suggestionDraft.id],
      modelCallRequired: true,
      existingCardsRewritten: false,
    });
    const appliedProofSuggestionDraft = store.resolveProjectBoardCardPiUpdate({ cardId: suggestionDraft.id, action: "apply" });
    expect(appliedProofSuggestionDraft).toMatchObject({
      pendingPiUpdate: undefined,
      testPlan: {
        integration: ["Run a browser smoke check that opens the animated hello-world page."],
        visual: ["Capture desktop and mobile screenshots showing the greeting rendered and nonblank."],
      },
      userTouchedFields: expect.arrayContaining(["testPlan"]),
    });
    store.updateProjectBoardCardCandidateStatus(suggestionDraft.id, "ready_to_create");
    store.updateProjectBoardStatus(board.id, "active");
    store.recordProjectBoardSynthesisRunEvent(proofSuggestionSynthesisRun.id, {
      stage: "board_applied",
      title: "Applied proof-suggestion planning snapshot",
      summary: "The proof-suggestion card has a stable planning snapshot before ticketization.",
      status: "succeeded",
      cardCount: 3,
      questionCount: 0,
      completedAt: "2026-05-17T12:04:00.000Z",
    });
    const suggestedTicket = store.createReadyProjectBoardTasks(board.id).find((card) => card.sourceId === "tiny:animated-hello-proof-suggestion")!;
    expect(suggestedTicket).toMatchObject({ status: "ready", orchestrationTaskId: expect.any(String) });
    expect(store.getOrchestrationTask(suggestedTicket.orchestrationTaskId!).description).toContain("Capture desktop and mobile screenshots");

    const cardCountBeforeRepeat = store.getActiveProjectBoard()?.cards.length;
    const finalCoverageBoard = store.recomputeProjectBoardProofCoverage({ boardId: board.id });
    const finalCoverageEvent = (finalCoverageBoard.events ?? []).find((event) => event.title === "Proof coverage rechecked");
    expect(finalCoverageEvent?.metadata.proofImpact).toMatchObject({
      eligibleCardCount: 4,
      missingProofCount: 0,
      modelCallRequired: false,
      existingCardsRewritten: false,
    });
    expect(store.getActiveProjectBoard()?.cards.length).toBe(cardCountBeforeRepeat);
    expect(store.getProjectBoardCard(ticketized.id).runFeedback).toHaveLength(1);
  });

  it("promotes a ready planner plan into one idempotent compact card and auto-finalizes kickoff", () => {
    // Planner plans now always stay compact (plannerPlanShouldStayCompact returns
    // true): promotion creates a single durable-plan card instead of per-step cards,
    // and a compact plan with no open questions auto-finalizes board kickoff.
    const thread = store.createThread("Planning thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip the board." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Project board plan",
      summary: "Create the board shell.",
      content: message.content,
      steps: [
        { id: "step-1", title: "Persist board state." },
        { id: "step-2", title: "Render the board surface." },
      ],
      openQuestions: [],
        risks: [],
        verification: ["Run unit tests.", "Run integration smoke.", "Capture visual screenshots."],
        decisionQuestions: [],
      });

    const card = store.promotePlannerPlanToBoard(artifact.id);
    const board = store.getActiveProjectBoard();
    const duplicate = store.promotePlannerPlanToBoard(artifact.id);
    const cards = store.getActiveProjectBoard()?.cards ?? [];

    expect(duplicate.id).toBe(card.id);
    expect(board).toMatchObject({
      status: "active",
      title: "Project board plan board",
    });
    expect(board?.summary).toContain("Create the board shell.");
    expect(cards).toHaveLength(1);
    expect(card).toMatchObject({
      boardId: board!.id,
      title: "Project board plan",
      status: "draft",
      candidateStatus: "ready_to_create",
      sourceKind: "planner_plan",
      sourceId: artifact.id,
      sourceThreadId: thread.id,
      sourceMessageId: message.id,
      testPlan: {
        unit: ["Run unit tests."],
        integration: ["Run integration smoke."],
        visual: ["Capture visual screenshots."],
      },
    });

    const approved = store.approveProjectBoardCard(card.id);
    const task = store.getOrchestrationTask(approved.orchestrationTaskId!);
    const approvedAgain = store.approveProjectBoardCard(card.id);

    expect(approvedAgain.orchestrationTaskId).toBe(task.id);
    expect(approved).toMatchObject({ status: "ready", orchestrationTaskId: task.id });
    expect(task).toMatchObject({
      title: "Project board plan",
      state: "ready",
      sourceKind: "project_board_card",
      labels: expect.arrayContaining(["project-board", "plan"]),
    });
    expect(task.description).toContain("Acceptance criteria:");
    expect(task.description).toContain("Proof expectations:");
    expect(store.getActiveProjectBoard()?.events?.find((event) => event.kind === "plan_promoted")).toMatchObject({
      metadata: expect.objectContaining({ decomposition: "single_card", autoFinalizedCompactPlan: true }),
    });
    expect(store.getActiveProjectBoard()?.events?.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["card_ticketized", "plan_promoted", "board_created"]),
    );
  });

  it("demotes the originating planner-plan card to evidence when a PM-review proposal is applied", () => {
    const thread = store.createThread("Planning thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip the picker." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Picker plan",
      summary: "Build the picker.",
      content: message.content,
      steps: [{ id: "step-1", title: "Build the picker UI." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });
    const planCard = store.promotePlannerPlanToBoard(artifact.id);
    const board = store.getActiveProjectBoard()!;
    expect(planCard).toMatchObject({ status: "draft", candidateStatus: "ready_to_create", sourceKind: "planner_plan" });

    const proposal = store.createProjectBoardSynthesisProposal({
      boardId: board.id,
      synthesis: {
        summary: "Decomposed picker plan.",
        goal: "Build the picker app.",
        currentState: "Plan exists.",
        targetUser: "Picker users.",
        qualityBar: "Proof required.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "synthesis:picker-ui",
            title: "Implement picker UI",
            description: "Build the picker interface from the plan.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Implementation",
            labels: ["scope:required"],
            blockedBy: [],
            acceptanceCriteria: ["Picker renders options."],
            testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
            sourceRefs: ["plan"],
          },
        ],
      },
    });
    store.reviewProjectBoardSynthesisProposalCard({
      proposalId: proposal.id,
      sourceId: "synthesis:picker-ui",
      reviewStatus: "accepted",
    });
    const applied = store.applyProjectBoardSynthesisProposal({ proposalId: proposal.id });

    // The whole-app plan card must not stay ticketizable next to the step cards it
    // spawned; bulk Create Ready Tasks would dispatch it as duplicate work.
    const coveredPlanCard = applied.cards.find((card) => card.id === planCard.id);
    expect(coveredPlanCard).toMatchObject({ candidateStatus: "evidence", sourceKind: "planner_plan" });
    expect(applied.cards.some((card) => card.sourceId === "synthesis:picker-ui")).toBe(true);
    expect(applied.events?.some((event) => event.title === "Planner plan covered by synthesis")).toBe(true);
  });

  it("parks automatic planning while the compact plan card is ticketized or executing", () => {
    const thread = store.createThread("Planning thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip the picker." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Picker plan",
      summary: "Build the picker.",
      content: message.content,
      steps: [{ id: "step-1", title: "Build the picker UI." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });
    const planCard = store.promotePlannerPlanToBoard(artifact.id);
    const board = store.getActiveProjectBoard()!;

    // Fresh draft plan card: planning may proceed.
    expect(store.parkAutomaticPlanningForExecutingPlanCard(board.id)).toBeUndefined();

    // Once the card is ticketized, the automatic pass must park with an audit event.
    store.approveProjectBoardCard(planCard.id);
    const parked = store.parkAutomaticPlanningForExecutingPlanCard(board.id);
    expect(parked?.id).toBe(planCard.id);
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      title: "Automatic planning parked",
      metadata: expect.objectContaining({ planningParked: true, executingPlannerPlanCardId: planCard.id }),
    });
  });

  it("persists planner-plan clarification questions on promoted draft cards", () => {
    const thread = store.createThread("Planning thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip the board after one decision." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Project board plan",
      summary: "Create the board shell.",
      content: message.content,
      steps: [{ id: "step-1", title: "Persist board state." }],
      openQuestions: ["Should comma-separated input also be supported?"],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });

    const card = store.promotePlannerPlanToBoard(artifact.id);

    expect(card).toMatchObject({
      status: "draft",
      candidateStatus: "needs_clarification",
      clarificationQuestions: ["Should comma-separated input also be supported?"],
      clarificationDecisions: [
        expect.objectContaining({
          question: "Should comma-separated input also be supported?",
          state: "open",
        }),
      ],
    });
  });

  it("recovers stale planner step drafts from a compact durable plan when loading the board", () => {
    const thread = store.createThread("Local Random Option Picker planning");
    const message = store.addMessage({
      threadId: thread.id,
      role: "assistant",
      content: [
        "## Plan: Local Random Option Picker",
        "A single-page, zero-dependency HTML app that lets you paste options and pick one at random.",
        "No build step, no frameworks, no backend, no auth, no deployment.",
      ].join("\n"),
    });
    const steps = [
      { id: "step-1", title: "Create textarea for one option per line" },
      { id: "step-2", title: "Add Pick button" },
      { id: "step-3", title: "Split textarea by newlines and filter blanks" },
      { id: "step-4", title: "Choose one option with Math.random" },
      { id: "step-5", title: "Display the selected option" },
    ];
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Plan: Local Random Option Picker",
      summary: "A single-page, zero-dependency HTML app that lets you paste options and pick one at random.",
      content: [
        "Scope Contract",
        "Requested: A simple local app where you paste options, click Pick, and see one random choice.",
        "Constraints: No backend, no auth, no deployment.",
        "Assumed: Single HTML file with inline CSS/JS. Pure HTML + CSS + JS in one file.",
        "Out of scope: History of picks, weighted choices, saving/sharing, deployment/build step.",
      ].join("\n"),
      steps,
      openQuestions: [
        "Risk: Minimal - single-file vanilla app with no dependencies",
        'Open question: Should we add a "Clear" button or a history of past picks? (Out of scope for "simple" but easy to add later)',
      ],
      risks: [],
      verification: ["Open random-picker/index.html via browser_local_preview."],
      decisionQuestions: [],
    });
    const board = store.createProjectBoard({
      title: "Local Random Option Picker board",
      summary: artifact.summary,
    });
    const now = new Date().toISOString();
    const db = (store as unknown as { requireDb: () => { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } } }).requireDb();
    const insert = db.prepare(
      `INSERT INTO project_board_cards
       (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
        acceptance_criteria_json, test_plan_json, clarification_questions_json, clarification_decisions_json, source_kind, source_id,
        source_thread_id, source_message_id, orchestration_task_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    steps.forEach((step, index) => {
      insert.run(
        `stale-step-card-${index + 1}`,
        board.id,
        step.title,
        `Stale step ${index + 1}`,
        "draft",
        "needs_clarification",
        null,
        null,
        JSON.stringify(["plan", "step"]),
        JSON.stringify(index > 0 ? [`${artifact.id}#step:${steps[index - 1].id}`] : []),
        JSON.stringify([step.title]),
        JSON.stringify({ unit: [], integration: [], visual: ["Open random-picker/index.html via browser_local_preview."], manual: [] }),
        JSON.stringify([]),
        JSON.stringify([]),
        "planner_plan",
        `${artifact.id}#step:${step.id}`,
        thread.id,
        message.id,
        null,
        now,
        now,
      );
    });

    expect(store.getProjectBoard(board.id)?.cards).toHaveLength(5);

    const recovered = store.getActiveProjectBoard()!;

    expect(recovered.status).toBe("active");
    expect(recovered.questions.every((question) => question.answer?.trim())).toBe(true);
    expect(recovered.cards).toHaveLength(1);
    expect(recovered.cards[0]).toMatchObject({
      title: "Plan: Local Random Option Picker",
      candidateStatus: "ready_to_create",
      sourceKind: "planner_plan",
      sourceId: artifact.id,
      clarificationQuestions: [],
      acceptanceCriteria: steps.map((step) => step.title),
      labels: ["plan"],
    });
    expect(recovered.events?.find((event) => event.title === "Compact plan recovered")).toMatchObject({
      kind: "plan_promoted",
      metadata: expect.objectContaining({
        artifactId: artifact.id,
        decomposition: "single_card",
        autoFinalizedCompactPlan: true,
        replacedCardIds: steps.map((_, index) => `stale-step-card-${index + 1}`),
      }),
    });
  });

  it("links worktree-backed durable planner artifacts from the project folder as explicit board plan sources", async () => {
    const threadWorkspacePath = join(workspacePath, ".ambient-codex", "worktrees", "planning-thread");
    await mkdir(threadWorkspacePath, { recursive: true });
    const thread = store.createThread("Planning thread", threadWorkspacePath);
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip the board." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Project board plan",
      summary: "Create the board shell.",
      content: message.content,
      steps: [{ id: "step-1", title: "Persist board state." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });
    const durablePath = ".ambient/board/plans/Project-board-plan-DurablePlan.html";
    const durableHtml = "<!doctype html><html><body><main><h1>Project board plan</h1></main></body></html>";
    await mkdir(join(workspacePath, ".ambient", "board", "plans"), { recursive: true });
    await writeFile(join(workspacePath, durablePath), durableHtml, "utf8");
    await expect(access(join(threadWorkspacePath, durablePath))).rejects.toMatchObject({ code: "ENOENT" });
    const finalizing = store.updatePlannerPlanArtifact(artifact.id, { workflowState: "finalizing" });
    const durable = store.setPlannerPlanDurableArtifact(artifact.id, {
      path: durablePath,
      generatedAt: "2026-05-11T00:00:00.000Z",
      validation: { ok: true, checkedAt: "2026-05-11T00:00:00.000Z", errors: [], warnings: [] },
    });
    expect(durable.finalizationAttempt).toMatchObject({
      id: finalizing.finalizationAttempt?.id,
      status: "completed",
      completedAt: expect.any(String),
    });
    store.createProjectBoard({ title: "Execution board" });

    const source = store.promotePlannerDurableArtifactToBoardSource(durable.id);

    expect(source).toMatchObject({
      kind: "plan_artifact",
      artifactId: durable.id,
      path: durablePath,
      contentHash: hashProjectBoardSourceContent(durableHtml),
      byteSize: Buffer.byteLength(durableHtml, "utf8"),
      authorityRole: "primary",
      includeInSynthesis: true,
    });
    expect(store.getActiveProjectBoard()?.events?.find((event) => event.title === "Durable plan linked to board")).toMatchObject({
      kind: "source_updated",
      metadata: expect.objectContaining({
        artifactId: durable.id,
        durablePlanPath: durablePath,
        durablePlanContentHash: hashProjectBoardSourceContent(durableHtml),
        durablePlanGeneratedAt: "2026-05-11T00:00:00.000Z",
        durablePlanValidationOk: true,
      }),
    });

    store.promotePlannerPlanToBoard(durable.id);
    expect(store.getActiveProjectBoard()?.events?.find((event) => event.metadata?.durablePlanContentHash === hashProjectBoardSourceContent(durableHtml))).toMatchObject({
      metadata: expect.objectContaining({
        artifactId: durable.id,
        durablePlanContentHash: hashProjectBoardSourceContent(durableHtml),
      }),
    });
  });

  it("batch ticketizes ready draft cards and maps board dependencies to Local Task blockers", () => {
    const board = store.createProjectBoard({ title: "Batch ticketization board" });
    const first = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Create shared data model",
      description: "Build the project board data model.",
    });
    const second = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Render dependent UI",
      description: "Render the UI after the model exists.",
    });
    const evidence = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Completed research",
      description: "Record completed discovery work.",
    });

    store.updateProjectBoardCard({
      cardId: first.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Data model is persisted."],
      testPlan: { unit: ["Run data model tests."], integration: [], visual: [], manual: [] },
    });
    store.updateProjectBoardCard({
      cardId: second.id,
      candidateStatus: "ready_to_create",
      blockedBy: [first.id],
      acceptanceCriteria: ["Dependent UI renders after data model ticket."],
      testPlan: { unit: [], integration: ["Run project board smoke."], visual: [], manual: [] },
    });
    store.updateProjectBoardCardCandidateStatus(evidence.id, "evidence");

    store.updateProjectBoardStatus(board.id, "active");
    const ticketized = store.createReadyProjectBoardTasks(board.id);
    const ticketizedAgain = store.createReadyProjectBoardTasks(board.id);
    const firstCard = store.getProjectBoardCard(first.id);
    const secondCard = store.getProjectBoardCard(second.id);
    const firstTask = store.getOrchestrationTask(firstCard.orchestrationTaskId!);
    const secondTask = store.getOrchestrationTask(secondCard.orchestrationTaskId!);

    expect(ticketized.map((card) => card.id).sort()).toEqual([first.id, second.id].sort());
    expect(ticketizedAgain).toEqual([]);
    expect(firstCard).toMatchObject({ status: "ready", orchestrationTaskId: firstTask.id });
    expect(secondCard).toMatchObject({ status: "blocked", orchestrationTaskId: secondTask.id });
    expect(firstTask).toMatchObject({
      title: "Create shared data model",
      state: "ready",
      sourceKind: "project_board_card",
      sourceUrl: `project-board-card:${first.id}`,
    });
    expect(secondTask.blockedBy).toEqual([firstTask.identifier]);
    store.updateOrchestrationTask({ id: firstTask.id, state: "needs_review" });
    expect(store.getProjectBoardCard(second.id).status).toBe("ready");
    expect(store.getProjectBoardCard(evidence.id).orchestrationTaskId).toBeUndefined();
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "ready_tasks_created",
      title: "Ready tasks created",
      metadata: expect.objectContaining({
        cardIds: expect.arrayContaining([first.id, second.id]),
        taskIds: expect.arrayContaining([firstTask.id, secondTask.id]),
      }),
    });
    expect(store.listOrchestrationTasks().filter((task) => task.sourceKind === "project_board_card")).toHaveLength(2);
  });

  it("does not create active local task blockers from terminal draft dependencies", () => {
    const board = store.createProjectBoard({ title: "Terminal dependency board" });
    const duplicate = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Duplicate auth backend",
      description: "Already represented elsewhere.",
    });
    const dependent = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "JWT middleware",
      description: "Implement middleware without waiting on duplicate work.",
    });

    store.updateProjectBoardCardCandidateStatus(duplicate.id, "duplicate");
    store.updateProjectBoardCard({
      cardId: dependent.id,
      candidateStatus: "ready_to_create",
      blockedBy: [duplicate.id],
      acceptanceCriteria: ["Middleware is implemented."],
      testPlan: { unit: ["Run middleware tests."], integration: [], visual: [], manual: [] },
    });

    store.updateProjectBoardStatus(board.id, "active");
    const ticketized = store.createReadyProjectBoardTasks(board.id);
    const dependentCard = store.getProjectBoardCard(dependent.id);
    const dependentTask = store.getOrchestrationTask(dependentCard.orchestrationTaskId!);

    expect(ticketized.map((card) => card.id)).toEqual([dependent.id]);
    expect(store.getProjectBoardCard(duplicate.id).orchestrationTaskId).toBeUndefined();
    expect(dependentCard).toMatchObject({ status: "ready" });
    expect(dependentTask.blockedBy).toEqual([]);
  });

  it("unblocks linked tasks when a draft dependency is later marked duplicate", () => {
    const board = store.createProjectBoard({ title: "Terminal dependency resync board" });
    const pendingDependency = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Pending auth backend",
      description: "Unresolved draft dependency.",
    });
    const dependent = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "JWT middleware",
      description: "Implement middleware after auth exists.",
    });

    store.updateProjectBoardCard({
      cardId: dependent.id,
      candidateStatus: "ready_to_create",
      blockedBy: [pendingDependency.id],
      acceptanceCriteria: ["Middleware is implemented."],
      testPlan: { unit: ["Run middleware tests."], integration: [], visual: [], manual: [] },
    });

    store.updateProjectBoardStatus(board.id, "active");
    store.createReadyProjectBoardTasks(board.id);
    const blockedCard = store.getProjectBoardCard(dependent.id);
    const blockedTask = store.getOrchestrationTask(blockedCard.orchestrationTaskId!);

    expect(blockedCard.status).toBe("blocked");
    expect(blockedTask.blockedBy).toEqual([pendingDependency.id]);

    store.updateProjectBoardCardCandidateStatus(pendingDependency.id, "duplicate");
    const unblockedCard = store.getProjectBoardCard(dependent.id);
    const unblockedTask = store.getOrchestrationTask(unblockedCard.orchestrationTaskId!);

    expect(unblockedCard.status).toBe("ready");
    expect(unblockedTask.blockedBy).toEqual([]);
  });

  it("keeps synthesized UI implementation cards unticketized until the UX mock gate is satisfied", () => {
    const board = store.createProjectBoard({ title: "UX mock gate ticketization board" });
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });

    store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Build a dashboard with an explicit UX mock approval gate.",
        goal: "Create a user-facing dashboard flow.",
        currentState: "No dashboard UI exists yet.",
        targetUser: "Operations lead.",
        qualityBar: "UI work waits for approved mock artifacts.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "synthesis:ux-mock-approval",
            title: "Create UX mock for approval",
            description: "Produce the self-contained HTML mock artifact for review.",
            candidateStatus: "ready_to_create",
            labels: ["ux-mock-approval"],
            blockedBy: [],
            acceptanceCriteria: ["HTML mock artifact is ready for approval."],
            testPlan: { unit: [], integration: [], visual: ["Open the HTML mock artifact."], manual: ["Review desktop and narrow viewports."] },
            sourceRefs: [],
            uiMockRole: "mock_gate",
          },
          {
            sourceId: "synthesis:dashboard-ui",
            title: "Implement dashboard UI",
            description: "Build the approved dashboard UI.",
            candidateStatus: "ready_to_create",
            labels: ["frontend", "ux-mock-gated"],
            blockedBy: ["synthesis:ux-mock-approval"],
            acceptanceCriteria: ["Dashboard UI matches the approved mock."],
            testPlan: { unit: ["Run renderer tests."], integration: [], visual: ["Capture dashboard screenshot."], manual: [] },
            sourceRefs: [],
            uiMockRole: "gated_implementation",
            requiresUiMockApproval: true,
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false, snapshotRunId: run.id, snapshotKind: "final" },
    );
    store.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "board_applied",
      title: "Applied UX mock board synthesis",
      summary: "Completed the UX mock gate planning snapshot.",
      status: "succeeded",
      cardCount: 2,
      completedAt: new Date().toISOString(),
    });
    store.updateProjectBoardStatus(board.id, "active");

    const pendingBoard = store.getProjectBoard(board.id)!;
    const mockGate = pendingBoard.cards.find((card) => card.sourceId === "synthesis:ux-mock-approval")!;
    const dashboard = pendingBoard.cards.find((card) => card.sourceId === "synthesis:dashboard-ui")!;

    expect(() => store.approveProjectBoardCard(dashboard.id)).toThrow("Approve the UX mock before creating UI implementation tasks");

    const firstTicketized = store.createReadyProjectBoardTasks(board.id);
    expect(firstTicketized.map((card) => card.id)).toEqual([mockGate.id]);
    expect(store.getProjectBoardCard(dashboard.id)).toMatchObject({
      status: "draft",
      orchestrationTaskId: undefined,
    });

    const ticketizedMockGate = store.getProjectBoardCard(mockGate.id);
    store.updateOrchestrationTask({ id: ticketizedMockGate.orchestrationTaskId!, state: "done" });
    const released = store.createReadyProjectBoardTasks(board.id);
    expect(released.map((card) => card.id)).toEqual([dashboard.id]);
    expect(store.getProjectBoardCard(dashboard.id)).toMatchObject({
      status: "ready",
      orchestrationTaskId: expect.any(String),
    });
  });

  it("refreshes dependent Local Task prompts with completed dependency artifacts and imports material files", async () => {
    const board = store.createProjectBoard({ title: "Dependency prompt board" });
    const first = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Create shared data model",
      description: "Build the dependency output.",
    });
    const second = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Render dependent UI",
      description: "Use the dependency output.",
    });

    store.updateProjectBoardCard({
      cardId: first.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Data model is persisted."],
      testPlan: { unit: ["Run data model tests."], integration: [], visual: [], manual: [] },
    });
    store.updateProjectBoardCard({
      cardId: second.id,
      candidateStatus: "ready_to_create",
      blockedBy: [first.id],
      acceptanceCriteria: ["Dependent UI uses the shared model."],
      testPlan: { unit: [], integration: ["Run dependent smoke."], visual: [], manual: [] },
    });

    const firstTask = store.getOrchestrationTask(store.approveProjectBoardCard(first.id).orchestrationTaskId!);
    const secondTask = store.getOrchestrationTask(store.approveProjectBoardCard(second.id).orchestrationTaskId!);
    const dependencyWorkspace = join(workspacePath, "dependency-workspaces", "LOCAL-1");
    await mkdir(dependencyWorkspace, { recursive: true });
    await writeFile(join(dependencyWorkspace, "model.mjs"), "export function parseBoard(input) { return JSON.parse(input); }\n", "utf8");
    await mkdir(join(dependencyWorkspace, ".ambient"), { recursive: true });
    await writeFile(join(dependencyWorkspace, ".ambient", "scratch.json"), "{}\n", "utf8");
    await mkdir(join(dependencyWorkspace, "node_modules", "cached-package"), { recursive: true });
    await writeFile(join(dependencyWorkspace, "node_modules", "cached-package", "index.js"), "module.exports = {};\n", "utf8");
    store.setOrchestrationTaskWorkspace({
      id: firstTask.id,
      workspacePath: dependencyWorkspace,
      branchName: "ambient/LOCAL-1",
    });
    const run = store.recordPreparedOrchestrationRun({ taskId: firstTask.id, workspacePath: dependencyWorkspace });
    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      finish: true,
      reviewProjectBoardProof: false,
      proofOfWork: {
        taskToolActions: [
          {
            actionId: "proof-model",
            action: "task_report_proof",
            createdAt: "2026-05-16T00:00:00.000Z",
            summary: "Data model proof passed.",
            changedFiles: ["model.mjs", ".ambient/scratch.json", "node_modules/cached-package/index.js"],
            commands: ["node --test model.test.mjs"],
            manualChecks: ["Clean import smoke passed."],
          },
          {
            actionId: "complete-model",
            action: "task_complete",
            createdAt: "2026-05-16T00:00:01.000Z",
            summary: "Data model complete.",
            completed: ["model.mjs exports parseBoard."],
            remaining: [],
            risks: [],
            commands: ["node --test model.test.mjs"],
            changedFiles: ["model.mjs", ".ambient/scratch.json", "node_modules/cached-package/index.js"],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: ["Clean import smoke passed."],
          },
        ],
      },
    });
    store.updateOrchestrationTask({ id: firstTask.id, state: "done" });

    const refreshed = store.refreshProjectBoardTaskDescriptionForTask(secondTask.id);
    const dependentWorkspace = join(workspacePath, "dependency-workspaces", "LOCAL-3");
    const executionThread = store.ensureProjectBoardCardExecutionThreadForTask({ taskId: secondTask.id, workspacePath: dependentWorkspace });
    const imported = await store.importProjectBoardDependencyArtifactsForTask({ taskId: secondTask.id, workspacePath: dependentWorkspace });

    expect(refreshed?.description).toContain("Dependency execution context:");
    expect(refreshed?.description).toContain("Available dependency outputs:");
    expect(refreshed?.description).toContain(`${firstTask.identifier}: Create shared data model`);
    expect(refreshed?.description).toContain("Ambient imports material files from available dependencies");
    expect(refreshed?.description).toContain(`Read-only fallback dependency workspace: ${dependencyWorkspace}`);
    expect(refreshed?.description).toContain("Dependency branch: ambient/LOCAL-1");
    expect(refreshed?.description).toContain("Declared import files: model.mjs");
    expect(refreshed?.description).toContain("Proof commands: node --test model.test.mjs");
    expect(refreshed?.description).toContain("Manual checks: Clean import smoke passed.");
    expect(refreshed?.description).toContain("Completed items: model.mjs exports parseBoard.");
    expect(refreshed?.description).toContain("Proof summary: Data model complete.");
    expect(refreshed?.description).toContain("Do not infer that an available dependency is incomplete");
    expect(store.getProjectBoardDependencyWorkspacePathsForExecutionThread(executionThread!.id)).toEqual([dependencyWorkspace]);
    expect(imported.imports).toHaveLength(1);
    expect(imported.imports[0]).toMatchObject({
      dependencyRef: first.id,
      dependencyTitle: "Create shared data model",
      dependencyTaskIdentifier: firstTask.identifier,
      materialFiles: ["model.mjs"],
      skippedFiles: [],
      excludedFiles: [".ambient/scratch.json", "node_modules/cached-package/index.js"],
      commands: ["node --test model.test.mjs"],
      manualChecks: ["Clean import smoke passed."],
      completed: ["model.mjs exports parseBoard."],
      proofSummary: "Data model complete.",
    });
    await expect(readFile(join(imported.imports[0].filesRoot, "model.mjs"), "utf8")).resolves.toContain("parseBoard");
    await expect(readFile(imported.imports[0].manifestPath, "utf8")).resolves.toContain("sourceDeliverableManifest");
    await expect(readFile(imported.manifestPath, "utf8")).resolves.toContain("project_board_dependency_artifact_import_result");
    await expect(access(join(imported.imports[0].filesRoot, ".ambient", "scratch.json"))).rejects.toThrow();
    await expect(access(join(imported.imports[0].filesRoot, "node_modules", "cached-package", "index.js"))).rejects.toThrow();
  });

  it("blocks ready task creation while board planning is still running", () => {
    const board = store.createProjectBoard({ title: "Active planner board" });
    store.updateProjectBoardStatus(board.id, "active");
    const firstBatch = store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "First streamed section.",
        goal: "Build a tiny animated hello board.",
        currentState: "The first ready card is available before the rest of the plan completes.",
        targetUser: "Browser user.",
        qualityBar: "Proof required.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "synthesis:animated-shell",
            title: "Create animated shell",
            description: "Build a tiny animated hello shell.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Foundation",
            labels: ["html"],
            blockedBy: [],
            sourceRefs: ["DurablePlan.md#shell"],
            acceptanceCriteria: ["Greeting renders."],
            testPlan: { unit: ["Run shell unit tests."], integration: [], visual: ["Capture desktop screenshot."], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );
    const shell = firstBatch.cards.find((candidate) => candidate.sourceId === "synthesis:animated-shell")!;
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });

    expect(() => store.createReadyProjectBoardTasks(board.id)).toThrow("planning is still running");
    expect(store.getProjectBoardCard(shell.id)).toMatchObject({ status: "draft", orchestrationTaskId: undefined });
    expect(store.listOrchestrationTasks().filter((task) => task.sourceKind === "project_board_card")).toHaveLength(0);
    expect(store.getProjectBoardSynthesisRun(run.id)).toMatchObject({ status: "running" });

    store.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "board_applied",
      title: "Applied test board synthesis",
      summary: "Completed the active test planner run.",
      status: "succeeded",
      cardCount: 1,
      completedAt: new Date().toISOString(),
    });

    const afterLaterSection = store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Second streamed section.",
        goal: "Build a tiny animated hello board.",
        currentState: "The planner refined the first card while adding the second.",
        targetUser: "Browser user.",
        qualityBar: "Proof required.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "synthesis:animated-shell",
            title: "Create polished animated shell",
            description: "Pi proposes a richer animated shell before ticketization.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Foundation",
            labels: ["html", "animation"],
            blockedBy: [],
            sourceRefs: ["DurablePlan.md#shell"],
            acceptanceCriteria: ["Greeting renders with a pulse."],
            testPlan: { unit: ["Run shell unit tests."], integration: [], visual: ["Capture desktop screenshot."], manual: [] },
          },
          {
            sourceId: "synthesis:style-pass",
            title: "Add style pass",
            description: "Tune the animation after the shell exists.",
            candidateStatus: "ready_to_create",
            priority: 2,
            phase: "Polish",
            labels: ["css"],
            blockedBy: ["synthesis:animated-shell"],
            sourceRefs: ["DurablePlan.md#style"],
            acceptanceCriteria: ["Animation timing is documented."],
            testPlan: { unit: [], integration: [], visual: ["Capture animation screenshot."], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false, snapshotRunId: run.id, snapshotKind: "final" },
    );

    expect(afterLaterSection.cards.find((candidate) => candidate.sourceId === "synthesis:animated-shell")).toMatchObject({
      id: shell.id,
      title: "Create polished animated shell",
      description: "Pi proposes a richer animated shell before ticketization.",
      status: "draft",
      orchestrationTaskId: undefined,
    });
    expect(afterLaterSection.cards.find((candidate) => candidate.sourceId === "synthesis:style-pass")).toMatchObject({
      status: "draft",
      candidateStatus: "ready_to_create",
      blockedBy: ["synthesis:animated-shell"],
    });

    const ticketized = store.createReadyProjectBoardTasks(board.id);
    expect(ticketized.map((card) => card.sourceId).sort()).toEqual(["synthesis:animated-shell", "synthesis:style-pass"]);
    expect(ticketized.find((card) => card.sourceId === "synthesis:animated-shell")).toMatchObject({
      id: shell.id,
      status: "ready",
      orchestrationTaskId: expect.any(String),
    });
    expect(store.listOrchestrationTasks().filter((task) => task.sourceKind === "project_board_card")).toHaveLength(2);
  });

  it("blocks ready synthesis cards that are newer than the latest stable planning snapshot", () => {
    const board = store.createProjectBoard({ title: "Stale snapshot board" });
    store.updateProjectBoardStatus(board.id, "active");
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });
    store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Initial snapshot.",
        goal: "Build the initial task.",
        currentState: "Planner produced one ready card.",
        targetUser: "Operator.",
        qualityBar: "Proof required.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "synthesis:initial",
            title: "Create initial task",
            description: "Initial snapshot card.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Foundation",
            labels: [],
            blockedBy: [],
            sourceRefs: [],
            acceptanceCriteria: ["Initial task is defined."],
            testPlan: { unit: ["Inspect task."], integration: [], visual: [], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false, snapshotRunId: run.id, snapshotKind: "incremental" },
    );
    store.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "board_applied",
      title: "Applied initial snapshot",
      summary: "Initial snapshot is stable.",
      status: "succeeded",
      cardCount: 1,
      completedAt: new Date().toISOString(),
    });
    const stale = store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Uncaptured later draft.",
        goal: "Build the initial task and a later task.",
        currentState: "A later draft appeared after the stable snapshot.",
        targetUser: "Operator.",
        qualityBar: "Proof required.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "synthesis:initial",
            title: "Create initial task",
            description: "Initial snapshot card.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Foundation",
            labels: [],
            blockedBy: [],
            sourceRefs: [],
            acceptanceCriteria: ["Initial task is defined."],
            testPlan: { unit: ["Inspect task."], integration: [], visual: [], manual: [] },
          },
          {
            sourceId: "synthesis:later",
            title: "Create later task",
            description: "This ready draft was not captured in a stable snapshot.",
            candidateStatus: "ready_to_create",
            priority: 2,
            phase: "Follow-up",
            labels: [],
            blockedBy: [],
            sourceRefs: [],
            acceptanceCriteria: ["Later task is defined."],
            testPlan: { unit: ["Inspect later task."], integration: [], visual: [], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );

    expect(stale.cards.find((card) => card.sourceId === "synthesis:later")).toMatchObject({ candidateStatus: "ready_to_create" });
    expect(() => store.createReadyProjectBoardTasks(board.id)).toThrow("not part of the latest stable planning snapshot");
    expect(store.listOrchestrationTasks().filter((task) => task.sourceKind === "project_board_card")).toHaveLength(0);
  });

  it("allows ready task creation after a synthesis pause checkpoint is finalized", () => {
    const board = store.createProjectBoard({ title: "Paused planner board" });
    store.updateProjectBoardStatus(board.id, "active");
    const card = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Create contrast fixture",
      description: "Create the fixture after planner output is paused.",
    });
    store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Fixture exists."],
      testPlan: { unit: ["Inspect fixture JSON."], integration: [], visual: [], manual: [] },
    });
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });
    store.requestProjectBoardSynthesisRunPause({
      boardId: board.id,
      runId: run.id,
      reason: "The desktop process restarted after progressive cards were saved.",
    });

    expect(() => store.createReadyProjectBoardTasks(board.id)).toThrow("planning is still running");

    store.markProjectBoardSynthesisRunPaused({
      boardId: board.id,
      runId: run.id,
      reason: "No active planner stream remains after restart.",
      metadata: { orphanedPauseRequest: true },
    });

    const [ticketized] = store.createReadyProjectBoardTasks(board.id);
    expect(ticketized).toMatchObject({ id: card.id, status: "ready", orchestrationTaskId: expect.any(String) });
    expect(store.getRunningProjectBoardSynthesisRun(board.id)).toBeUndefined();
  });

  it("blocks ready task creation until the project board charter is active", () => {
    const board = store.createProjectBoard({ title: "Draft charter board" });
    const card = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Create fixtures",
      description: "Create fixture files after charter activation.",
    });
    store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Fixtures exist."],
      testPlan: { unit: ["Run fixture smoke."], integration: [], visual: [], manual: [] },
    });

    expect(() => store.createReadyProjectBoardTasks(board.id)).toThrow("charter must be active");
    expect(store.getProjectBoardCard(card.id)).toMatchObject({ status: "draft", orchestrationTaskId: undefined });

    store.updateProjectBoardStatus(board.id, "active");
    const [ticketized] = store.createReadyProjectBoardTasks(board.id);
    expect(ticketized).toMatchObject({ status: "ready", orchestrationTaskId: expect.any(String) });
  });

  it("syncs approved project board card lanes from linked task state and blockers", () => {
    const blocker = store.createOrchestrationTask({ title: "Finish prerequisite", state: "todo" });
    const thread = store.createThread("Board status thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nTrack card state." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Stateful board card",
      summary: "Exercise board lane projection.",
      content: message.content,
      steps: [{ id: "step-1", title: "Keep the board lane in sync." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Status board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const blockedDraft = store.updateProjectBoardCard({ cardId: card.id, blockedBy: [blocker.identifier] });
    const approved = store.approveProjectBoardCard(blockedDraft.id);
    const taskId = approved.orchestrationTaskId!;

    expect(approved.status).toBe("blocked");
    expect(store.getOrchestrationTask(taskId).blockedBy).toEqual([blocker.identifier]);
    expect(store.getActiveProjectBoard()?.cards.find((item) => item.id === card.id)?.status).toBe("blocked");

    store.updateOrchestrationTask({ id: blocker.id, state: "needs_review" });
    expect(store.getProjectBoardCard(card.id).status).toBe("ready");

    store.updateOrchestrationTask({ id: blocker.id, state: "todo" });
    expect(store.getProjectBoardCard(card.id).status).toBe("blocked");

    store.updateOrchestrationTask({ id: blocker.id, state: "review" });
    expect(store.getProjectBoardCard(card.id).status).toBe("ready");

    store.updateOrchestrationTask({ id: taskId, state: "In Progress" });
    expect(store.getProjectBoardCard(card.id).status).toBe("in_progress");
    expect(store.getActiveProjectBoard()?.cards.find((item) => item.id === card.id)?.status).toBe("in_progress");

    store.updateOrchestrationTask({ id: taskId, state: "review" });
    expect(store.getProjectBoardCard(card.id).status).toBe("review");

    store.updateOrchestrationTask({ id: taskId, state: "needs_info" });
    expect(store.getProjectBoardCard(card.id).status).toBe("blocked");

    store.updateOrchestrationTask({ id: taskId, state: "needs_review" });
    expect(store.getProjectBoardCard(card.id).status).toBe("review");

    store.updateOrchestrationTask({ id: taskId, state: "budget_exhausted" });
    expect(store.getProjectBoardCard(card.id).status).toBe("blocked");

    store.updateOrchestrationTask({ id: taskId, state: "terminal_blocker" });
    expect(store.getProjectBoardCard(card.id).status).toBe("blocked");

    store.updateOrchestrationTask({ id: taskId, state: "done" });
    expect(store.getProjectBoardCard(card.id).status).toBe("done");
  });

  it("creates draft inbox follow-up cards from completed project board run proof", () => {
    const thread = store.createThread("Run follow-up thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip and discover follow-ups." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Follow-up source card",
      summary: "Exercise run-discovered follow-ups.",
      content: message.content,
      steps: [{ id: "step-1", title: "Complete source work." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Follow-up board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/follow-up" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/app.ts"],
        followUps: [
          {
            title: "Add edge-case visual coverage",
            description: "The run found a missing visual coverage case.",
            acceptanceCriteria: ["Capture the edge case."],
            testPlan: { visual: ["Run visual smoke for the edge case."] },
          },
        ],
      },
      finish: true,
    });
    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/app.ts"],
        followUps: ["Add edge-case visual coverage"],
      },
      finish: true,
    });

    const followUps = store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up");
    expect(followUps).toHaveLength(1);
    expect(store.getActiveProjectBoard()?.events?.filter((event) => event.kind === "run_follow_up_created")).toEqual([
      expect.objectContaining({
        title: "Run follow-ups proposed",
        entityId: run.id,
        metadata: expect.objectContaining({ runId: run.id, parentCardId: approved.id, followUpCardIds: [followUps[0].id] }),
      }),
    ]);
    expect(followUps[0]).toMatchObject({
      title: "Add edge-case visual coverage",
      description: "The run found a missing visual coverage case.",
      status: "draft",
      candidateStatus: "needs_clarification",
      sourceThreadId: thread.id,
      blockedBy: [approved.id],
      labels: expect.arrayContaining(["run-follow-up", "plan"]),
      testPlan: { visual: ["Run visual smoke for the edge case."] },
    });

    const ready = store.updateProjectBoardCard({ cardId: followUps[0].id, candidateStatus: "ready_to_create" });
    const ticketized = store.approveProjectBoardCard(ready.id);
    expect(ticketized.orchestrationTaskId).toEqual(expect.any(String));
    expect(store.getOrchestrationTask(ticketized.orchestrationTaskId!).state).toBe("ready");
  });

  it("records PM proof review decisions for completed project board runs", () => {
    const thread = store.createThread("Proof review thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip with proof." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Proof-gated card",
      summary: "Exercise proof review.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement proof-gated behavior." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests.", "Run integration smoke.", "Capture visual screenshot.", "Manual review the result."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Proof review board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/proof-review" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/App.tsx"],
        screenshots: ["proof.png"],
        afterRunHook: { ok: true, durationMs: 42 },
        lastAssistantText:
          "Implemented the acceptance criteria. Unit tests passed, integration smoke passed, visual screenshot captured, and manual review confirmed the result.",
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("review");
    expect(reviewed.proofReview).toMatchObject({
      status: "ready_for_review",
      runId: run.id,
      missing: [],
      satisfied: expect.arrayContaining([
        "Acceptance criteria discussed in proof.",
        "Unit proof recorded.",
        "Integration proof recorded.",
        "Visual/browser proof recorded.",
        "Manual review proof recorded.",
      ]),
    });
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "card_proof_reviewed",
      entityId: approved.id,
      metadata: expect.objectContaining({ status: "ready_for_review", runId: run.id, reviewer: "deterministic" }),
    });
  });

  it("does not let copied task-action sample proof close a project board card", () => {
    const thread = store.createThread("Sample proof thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip with real proof." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Sample-proof card",
      summary: "Exercise task action proof integrity.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement task-action proof integrity." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Sample proof board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/sample-proof-review" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        taskToolActions: [
          {
            actionId: "proof-1",
            action: "task_report_proof",
            createdAt: "2026-05-05T12:00:00.000Z",
            summary: "Verification passed.",
            commands: [],
            changedFiles: [],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: [],
          },
        ],
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "needs_follow_up",
      recommendedAction: "follow_up",
      missing: expect.arrayContaining([
        "Task action proof integrity issue: task_report_proof proof-1 appears to contain copied sample value(s): actionId, summary.",
        "Task action proof integrity issue: task_report_proof proof-1 has no command, changed-file, screenshot, browser-trace, visual-check, manual-check, or completed-item evidence.",
      ]),
    });
  });

  it("does not close a project board card when the worker stopped at the runtime budget", () => {
    const thread = store.createThread("Runtime budget proof thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip with bounded execution." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Runtime-budget card",
      summary: "Exercise bounded worker closure.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement runtime-budget proof handling." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Runtime budget board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/runtime-budget-proof-review" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/runtimeBudget.ts"],
        afterRunHook: { ok: true, durationMs: 15 },
        lastAssistantText: "Implemented the acceptance criteria and unit tests passed, but the worker reached the configured runtime budget.",
        remaining: [
          "Runtime budget exceeded after 90s: Review partial workspace changes and retry the card with a smaller scope.",
          "Review partial workspace changes and retry the card with a smaller scope.",
        ],
        nextSteps: ["Review partial workspace changes and retry the card with a smaller scope."],
        projectBoardRuntimeBudget: {
          exceeded: true,
          maxRuntimeMs: 90_000,
          elapsedMs: 95_000,
          recommendedNextAction: "Review partial workspace changes and retry the card with a smaller scope.",
        },
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "needs_follow_up",
      recommendedAction: "follow_up",
      missing: expect.arrayContaining([
        "Runtime budget exceeded after 90s: Review partial workspace changes and retry the card with a smaller scope.",
      ]),
    });
    expect(reviewed.splitOutcome).toMatchObject({
      status: "proposed",
      source: "runtime_budget",
      sourceRunId: run.id,
      reason: "Runtime budget exceeded after 90s: Review partial workspace changes and retry the card with a smaller scope.",
      completedCriteria: expect.arrayContaining(["Implementation evidence recorded.", "Acceptance criteria discussed in proof.", "Unit proof recorded."]),
      remainingCriteria: expect.arrayContaining([
        "Runtime budget exceeded after 90s: Review partial workspace changes and retry the card with a smaller scope.",
      ]),
    });
    expect(
      reviewed.splitOutcome?.remainingCriteria.filter((item) =>
        /review partial workspace changes and retry the card with a smaller scope/i.test(item),
      ),
    ).toHaveLength(1);
    expect(reviewed.splitOutcome?.childCardIds).toHaveLength(1);
    const followUp = store.getProjectBoardCard(reviewed.splitOutcome!.childCardIds[0]);
    expect(followUp).toMatchObject({
      title: "Continue Runtime-budget card",
      status: "draft",
      candidateStatus: "needs_clarification",
      blockedBy: [],
      labels: expect.arrayContaining(["proof-follow-up", "runtime-split-follow-up", "derived-from-parent"]),
      acceptanceCriteria: expect.arrayContaining([
        "Runtime budget exceeded after 90s: Review partial workspace changes and retry the card with a smaller scope.",
      ]),
      clarificationQuestions: expect.arrayContaining([
        'Confirm this runtime-budget follow-up accurately captures the remaining scope for "Runtime-budget card" before ticketizing it.',
      ]),
    });
    expect(
      followUp.acceptanceCriteria.filter((item) =>
        /review partial workspace changes and retry the card with a smaller scope/i.test(item),
      ),
    ).toHaveLength(1);
    expect(reviewed.proofReview?.followUpCardIds).toEqual([followUp.id]);
    expect(store.getActiveProjectBoard()?.events?.find((event) => event.kind === "card_split")).toMatchObject({
      title: "Runtime-budget split proposed",
      entityId: approved.id,
      metadata: expect.objectContaining({ runId: run.id, childCardIds: [followUp.id] }),
    });
  });

  it("resolves runtime split decisions without losing parent audit state", () => {
    const thread = store.createThread("Runtime split decision thread");
    const board = store.createProjectBoard({ title: "Runtime split decisions" });
    const createSplitCase = (title: string) => {
      const draft = store.createProjectBoardManualCard({
        boardId: board.id,
        title,
        description: `${title} should be finished in a bounded worker pass.`,
      });
      const ready = store.updateProjectBoardCard({
        cardId: draft.id,
        candidateStatus: "ready_to_create",
        acceptanceCriteria: ["Create the working shell.", "Finish the remaining interaction polish."],
        testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
      });
      const approved = store.approveProjectBoardCard(ready.id);
      const task = store.getOrchestrationTask(approved.orchestrationTaskId!);
      const run = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: `/tmp/${task.identifier}` });
      store.updateOrchestrationRun({
        id: run.id,
        status: "completed",
        threadId: thread.id,
        proofOfWork: {
          changedFiles: ["src/shell.ts"],
          afterRunHook: { ok: true, durationMs: 10 },
          lastAssistantText:
            "Created the working shell, added unit proof, and then hit the configured runtime budget before finishing the remaining interaction polish.",
          projectBoardRuntimeBudget: {
            exceeded: true,
            maxRuntimeMs: 60_000,
            elapsedMs: 65_000,
            recommendedNextAction: "Split the remaining interaction polish into a follow-up.",
          },
        },
        finish: true,
      });
      const reviewed = store.getProjectBoardCard(approved.id);
      const child = store.getProjectBoardCard(reviewed.splitOutcome!.childCardIds[0]);
      return { reviewed, child, task };
    };

    const approvedSplit = createSplitCase("Approve split parent");
    const splitApproved = store.resolveProjectBoardSplitDecision({ cardId: approvedSplit.reviewed.id, action: "approve_split" });
    expect(splitApproved.splitOutcome).toMatchObject({ status: "approved" });
    expect(store.getProjectBoardCard(approvedSplit.child.id).candidateStatus).toBe("needs_clarification");

    const retrySplit = createSplitCase("Retry split parent");
    const retried = store.resolveProjectBoardSplitDecision({ cardId: retrySplit.reviewed.id, action: "retry_original" });
    expect(retried).toMatchObject({ status: "ready", proofReview: undefined, splitOutcome: { status: "rejected" } });
    expect(store.getProjectBoardCard(retrySplit.child.id).candidateStatus).toBe("rejected");
    expect(store.getOrchestrationTask(retrySplit.task.id).state).toBe("ready");

    const mergedSplit = createSplitCase("Merge split parent");
    const merged = store.resolveProjectBoardSplitDecision({ cardId: mergedSplit.reviewed.id, action: "merge_followups" });
    expect(merged).toMatchObject({ status: "ready", proofReview: undefined, splitOutcome: { status: "rejected" } });
    expect(merged.labels).toContain("merged-follow-up");
    expect(store.getProjectBoardCard(mergedSplit.child.id).candidateStatus).toBe("rejected");

    const replacedSplit = createSplitCase("Replace split parent");
    const replaced = store.resolveProjectBoardSplitDecision({ cardId: replacedSplit.reviewed.id, action: "mark_replaced" });
    expect(replaced).toMatchObject({ status: "done", proofReview: { status: "done" }, splitOutcome: { status: "replaced" } });
    expect(store.getOrchestrationTask(replacedSplit.task.id).state).toBe("done");

    const doneViaSplit = createSplitCase("Done via split parent");
    expect(() =>
      store.resolveProjectBoardSplitDecision({ cardId: doneViaSplit.reviewed.id, action: "accept_done_via_split" }),
    ).toThrow("Finish or mark represented split follow-up cards");
    store.updateProjectBoardCard({ cardId: doneViaSplit.child.id, candidateStatus: "evidence" });
    const closed = store.resolveProjectBoardSplitDecision({ cardId: doneViaSplit.reviewed.id, action: "accept_done_via_split" });
    expect(closed).toMatchObject({ status: "done", proofReview: { status: "done" }, splitOutcome: { status: "done_via_split" } });
    expect(store.getOrchestrationTask(doneViaSplit.task.id).state).toBe("done");
  });

  it("recommends retry instead of split when the runtime budget ends without meaningful progress", () => {
    const thread = store.createThread("Retry runtime budget proof thread");
    const board = store.createProjectBoard({ title: "Retry runtime budget board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Runtime retry card",
      description: "Exercise no-progress runtime-budget handling.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Implement the bounded task."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/runtime-budget-retry" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        lastAssistantText: "I started investigating but did not modify implementation files before the runtime budget stopped the run.",
        projectBoardRuntimeBudget: {
          exceeded: true,
          maxRuntimeMs: 30_000,
          elapsedMs: 31_000,
          recommendedNextAction: "Retry with a smaller scope.",
        },
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "retry_recommended",
      recommendedAction: "retry",
      missing: expect.arrayContaining(["Runtime budget exceeded after 30s: Retry with a smaller scope."]),
    });
    expect(reviewed.splitOutcome).toBeUndefined();
    expect(store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up")).toHaveLength(0);
  });

  it("does not split a runtime budget card from Pi satisfied text without observable implementation progress", () => {
    const thread = store.createThread("Pi false-positive runtime budget thread");
    const board = store.createProjectBoard({ title: "Pi false-positive runtime budget board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Runtime false-positive card",
      description: "Exercise strict runtime-budget split gating.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Create a real implementation file."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/runtime-budget-false-positive" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: [{ path: ".ambient/board/cards.json", status: "modified" }],
        taskToolActions: [
          {
            actionId: "unique-heartbeat-id",
            action: "task_heartbeat",
            cardId: approved.id,
            createdAt: "2026-05-05T12:00:00.000Z",
            summary: "Describe actual progress from this run.",
            completed: ["Name a concrete item actually completed."],
            remaining: ["Name concrete remaining work, or leave this array empty."],
          },
        ],
        lastAssistantText: "Run stopped.",
        projectBoardRuntimeBudget: {
          exceeded: true,
          maxRuntimeMs: 45_000,
          elapsedMs: 46_000,
          recommendedNextAction: "Review partial workspace changes and retry the card with a smaller scope.",
        },
      },
    });

    const reviewed = store.applyProjectBoardCardProofReview({
      runId: run.id,
      review: {
        status: "needs_follow_up",
        summary: "Pi inferred progress, but no implementation files changed.",
        satisfied: ["Agent correctly identified the required files and prepared content."],
        missing: ["Runtime budget exceeded after 45s."],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: "2026-05-09T12:00:00.000Z",
        reviewer: "ambient_pi",
        evidenceQuality: "weak",
        recommendedAction: "follow_up",
      },
    });

    expect(reviewed?.status).toBe("blocked");
    expect(reviewed?.splitOutcome).toBeUndefined();
    expect(reviewed?.proofReview).toMatchObject({
      status: "retry_recommended",
      reviewer: "ambient_pi",
      recommendedAction: "retry",
      followUpCardIds: [],
    });
    expect(store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up")).toHaveLength(0);
  });

  it("splits runtime budget cards when proof exists but durable completion was not recorded", () => {
    const thread = store.createThread("Runtime budget completion race thread");
    const board = store.createProjectBoard({ title: "Runtime budget completion race board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Runtime completion race card",
      description: "Exercise timeout after proof but before durable completion.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Create a runtime checkpoint."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/runtime-budget-completion-race" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/runtime-split-progress.ts", "test/runtime-split-progress.test.ts"],
        taskToolActions: [
          {
            actionId: "proof-runtime-race",
            action: "task_report_proof",
            cardId: approved.id,
            createdAt: "2026-05-09T12:00:00.000Z",
            summary: "Checkpoint file and unit test were created before timeout.",
            commands: ["pnpm test test/runtime-split-progress.test.ts"],
            changedFiles: ["src/runtime-split-progress.ts", "test/runtime-split-progress.test.ts"],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: [],
          },
        ],
        projectBoardRuntimeBudget: {
          exceeded: true,
          maxRuntimeMs: 90_000,
          elapsedMs: 91_000,
          recommendedNextAction: "Review partial workspace changes and retry the card with a smaller scope.",
        },
      },
    });

    const reviewed = store.applyProjectBoardCardProofReview({
      runId: run.id,
      review: {
        status: "done",
        summary: "Pi considered all proof complete.",
        satisfied: ["Created the runtime checkpoint.", "Unit proof recorded."],
        missing: [],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: "2026-05-09T12:00:00.000Z",
        reviewer: "ambient_pi",
        evidenceQuality: "strong",
        recommendedAction: "close",
      },
    });

    expect(reviewed?.status).toBe("blocked");
    expect(reviewed?.proofReview).toMatchObject({
      status: "needs_follow_up",
      reviewer: "ambient_pi",
      recommendedAction: "follow_up",
      evidenceQuality: "mixed",
      missing: expect.arrayContaining(["Durable task_complete action was not recorded before the runtime budget stopped the run."]),
    });
    expect(reviewed?.splitOutcome).toMatchObject({
      status: "proposed",
      source: "runtime_budget",
      childCardIds: expect.any(Array),
    });
    expect(reviewed?.splitOutcome?.childCardIds).toHaveLength(1);
  });

  it("keeps strong close recommendations reviewable when deterministic proof issues remain", () => {
    const thread = store.createThread("Strong proof issue thread");
    const board = store.createProjectBoard({ title: "Strong proof issue board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Implement reviewable proof gate",
      description: "Exercise auto-close gating when the judge is strong but proof issues remain.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Create the proof-gated behavior."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Record manual PM review."] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/strong-proof-issue" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/proof-gate.ts"],
        lastAssistantText: "Implemented the acceptance criteria and recorded implementation proof.",
      },
      finish: true,
      reviewProjectBoardProof: false,
    });

    const reviewed = store.applyProjectBoardCardProofReview({
      runId: run.id,
      review: {
        status: "done",
        summary: "Ambient/Pi judged the card complete with strong proof.",
        satisfied: ["Implementation evidence recorded."],
        missing: [],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: "2026-05-19T00:00:00.000Z",
        reviewer: "ambient_pi",
        evidenceQuality: "strong",
        confidence: 0.97,
        recommendedAction: "close",
      },
    });

    expect(reviewed).toMatchObject({
      status: "review",
      proofReview: {
        status: "ready_for_review",
        recommendedAction: "close",
        evidenceQuality: "strong",
        confidence: 0.97,
        missing: expect.arrayContaining(["Manual proof missing: Record manual PM review."]),
      },
    });
    expect(reviewed?.proofReview?.summary).toContain("PM review is required before auto-closure");
    expect(store.getOrchestrationTask(approved.orchestrationTaskId!).state).toBe("needs_review");
  });

  it("does not treat .ambient board artifacts as implementation proof", () => {
    const thread = store.createThread("Board artifact proof thread");
    const board = store.createProjectBoard({ title: "Board artifact proof board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Implement application behavior",
      description: "Change product code, not only board metadata.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Application behavior is implemented."],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/board-artifact-proof" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: [".ambient/board/cards.json"],
        lastAssistantText: "Completed the acceptance criteria by updating board metadata.",
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview?.missing).toContain("No changed implementation files or meaningful diff evidence recorded.");
  });

  it("treats absolute source paths inside a prepared run workspace as implementation proof", () => {
    const thread = store.createThread("Absolute task workspace proof thread");
    const board = store.createProjectBoard({ title: "Absolute task workspace proof board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Implement single-file app",
      description: "Build the app in the prepared local task workspace.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Single-file app is implemented."],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const workspace = "/tmp/absolute-proof/.ambient-codex/orchestration/workspaces/LOCAL-1";
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: workspace });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: [
          `${workspace}/index.html`,
          `${workspace}/.ambient-codex/browser/screenshots/proof.png`,
          `${workspace}/node_modules/cache/index.js`,
        ],
        lastAssistantText: "Implemented the acceptance criteria in the app and captured browser proof.",
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.proofReview?.satisfied).toContain("Implementation evidence recorded.");
    expect(reviewed.proofReview?.missing).not.toContain("No changed implementation files or meaningful diff evidence recorded.");
  });

  it("blocks ticketization when a ready candidate is claimed by another desktop", () => {
    const board = store.createProjectBoard({ title: "Claimed board" });
    const card = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Implement claimed work",
      description: "This work should not be ticketized while another desktop owns it.",
    });
    store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Claim gate prevents duplicate execution."],
      testPlan: { unit: ["Run claim gate test."], integration: [], visual: [], manual: [] },
    });
    (store as any).appendProjectBoardEvent({
      boardId: board.id,
      kind: "card_claimed",
      title: "Card claimed",
      summary: "Remote desktop claimed this card.",
      entityKind: "project_board_card",
      entityId: card.id,
      metadata: {
        cardId: card.id,
        runId: "run-remote",
        agentId: "remote-desktop",
        leaseUntil: "2099-05-04T12:10:00.000Z",
        artifactEventType: "card.claimed",
      },
      createdAt: "2099-05-04T12:00:00.000Z",
    });

    const claimedCard = store.getActiveProjectBoard()?.cards.find((candidate) => candidate.id === card.id);
    expect(claimedCard?.claim).toMatchObject({ status: "active", agentId: "remote-desktop", ownedByLocal: false });
    store.updateProjectBoardStatus(board.id, "active");
    expect(() => store.createReadyProjectBoardTasks(board.id)).toThrow(/claimed by remote-desktop/);
    expect(store.getProjectBoardCard(card.id).orchestrationTaskId).toBeUndefined();
  });

  it("records execution readiness blockers without spamming duplicate board history", () => {
    const board = store.createProjectBoard({ title: "Execution blocker board" });
    const workflowPath = join(workspacePath, "WORKFLOW.md");

    const first = store.recordProjectBoardExecutionReadinessBlocker({
      boardId: board.id,
      source: "auto_dispatch",
      blocker: "missing_workflow",
      title: "Execution blocked: missing WORKFLOW.md",
      summary: `Ready Local Tasks could not be prepared because ${workflowPath} is missing.`,
      workflowPath,
      error: "Workflow file not found.",
    });
    const duplicate = store.recordProjectBoardExecutionReadinessBlocker({
      boardId: board.id,
      source: "auto_dispatch",
      blocker: "missing_workflow",
      title: "Execution blocked: missing WORKFLOW.md",
      summary: `Ready Local Tasks could not be prepared because ${workflowPath} is missing.`,
      workflowPath,
      error: "Workflow file not found.",
    });
    const changed = store.recordProjectBoardExecutionReadinessBlocker({
      boardId: board.id,
      source: "manual_prepare",
      blocker: "invalid_workflow",
      title: "Execution blocked: invalid WORKFLOW.md",
      summary: "Ready Local Tasks could not be prepared because WORKFLOW.md is invalid.",
      workflowPath,
      error: "Workflow validation failed.",
    });

    expect(first.recorded).toBe(true);
    expect(duplicate.recorded).toBe(false);
    expect(changed.recorded).toBe(true);
    const events = store.getActiveProjectBoard()?.events?.filter((event) => event.kind === "execution_readiness_blocked") ?? [];
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      title: "Execution blocked: invalid WORKFLOW.md",
      metadata: {
        source: "manual_prepare",
        blocker: "invalid_workflow",
        workflowPath,
        error: "Workflow validation failed.",
      },
    });
    expect(events[1]).toMatchObject({
      title: "Execution blocked: missing WORKFLOW.md",
      metadata: {
        source: "auto_dispatch",
        blocker: "missing_workflow",
        workflowPath,
        error: "Workflow file not found.",
      },
    });
  });

  it("records workflow creation events without spamming duplicate board history", () => {
    const board = store.createProjectBoard({ title: "Workflow creation board" });
    const workflowPath = join(workspacePath, "WORKFLOW.md");

    const first = store.recordProjectBoardWorkflowCreated({
      boardId: board.id,
      workflowPath,
      workflowHash: "hash-1",
      source: "auto_dispatch",
      workspaceStrategy: "git-worktree",
      autoDispatch: true,
      maxConcurrentAgents: 3,
    });
    const duplicate = store.recordProjectBoardWorkflowCreated({
      boardId: board.id,
      workflowPath,
      workflowHash: "hash-1",
      source: "auto_dispatch",
      workspaceStrategy: "git-worktree",
      autoDispatch: true,
      maxConcurrentAgents: 3,
    });
    const changed = store.recordProjectBoardWorkflowCreated({
      boardId: board.id,
      workflowPath,
      workflowHash: "hash-2",
      source: "manual_prepare",
      workspaceStrategy: "directory",
      autoDispatch: false,
      maxConcurrentAgents: 1,
    });

    expect(first.recorded).toBe(true);
    expect(duplicate.recorded).toBe(false);
    expect(changed.recorded).toBe(true);
    const events = store.getActiveProjectBoard()?.events?.filter((event) => event.kind === "workflow_created") ?? [];
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      metadata: {
        source: "manual_prepare",
        workflowPath,
        workflowHash: "hash-2",
        workspaceStrategy: "directory",
        autoDispatch: false,
        maxConcurrentAgents: 1,
      },
    });
    expect(events[1]).toMatchObject({
      metadata: {
        source: "auto_dispatch",
        workflowPath,
        workflowHash: "hash-1",
        workspaceStrategy: "git-worktree",
        autoDispatch: true,
        maxConcurrentAgents: 3,
      },
    });
  });

  it("surfaces expired remote claims without blocking ready task creation", () => {
    const board = store.createProjectBoard({ title: "Expired claim board" });
    const card = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Reclaim expired work",
      description: "This work should explain stale ownership before this desktop claims it.",
    });
    store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Expired claims are visible but do not block execution."],
      testPlan: { unit: ["Run expired claim gate test."], integration: [], visual: [], manual: [] },
    });
    (store as any).appendProjectBoardEvent({
      boardId: board.id,
      kind: "card_claimed",
      title: "Card claimed",
      summary: "Remote desktop claimed this card and then went stale.",
      entityKind: "project_board_card",
      entityId: card.id,
      metadata: {
        cardId: card.id,
        runId: "run-stale",
        agentId: "remote-desktop",
        leaseUntil: "2026-05-04T12:10:00.000Z",
        artifactEventType: "card.claimed",
      },
      createdAt: "2026-05-04T12:00:00.000Z",
    });
    (store as any).appendProjectBoardEvent({
      boardId: board.id,
      kind: "card_claim_expired",
      title: "Card claim expired",
      summary: "Local desktop recorded the stale lease before reclaim.",
      entityKind: "project_board_card",
      entityId: card.id,
      metadata: {
        cardId: card.id,
        runId: "run-stale",
        agentId: "local-desktop",
        expiredClaimEventId: "evt-remote-claim",
        artifactEventType: "card.claim_expired",
      },
      createdAt: "2026-05-04T12:20:00.000Z",
    });

    const expiredCard = store.getActiveProjectBoard()?.cards.find((candidate) => candidate.id === card.id);
    expect(expiredCard?.claim).toMatchObject({
      status: "expired",
      agentId: "remote-desktop",
      ownedByLocal: false,
      expirationRecorded: true,
    });
    store.updateProjectBoardStatus(board.id, "active");
    const [approved] = store.createReadyProjectBoardTasks(board.id);
    expect(approved.orchestrationTaskId).toBeTruthy();
  });

  it("treats remote-claimed ticketized board cards as claimed for scheduler dispatch", () => {
    const board = store.createProjectBoard({ title: "Execution claim board" });
    const card = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Run claimed work",
      description: "This task is already ticketized but should not prepare while remotely claimed.",
    });
    store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Scheduler respects remote claim ownership."],
      testPlan: { unit: ["Run scheduler claim test."], integration: [], visual: [], manual: [] },
    });
    store.updateProjectBoardStatus(board.id, "active");
    const [approved] = store.createReadyProjectBoardTasks(board.id);
    (store as any).appendProjectBoardEvent({
      boardId: board.id,
      kind: "card_claimed",
      title: "Card claimed",
      summary: "Remote desktop claimed this ticketized card.",
      entityKind: "project_board_card",
      entityId: card.id,
      metadata: {
        cardId: card.id,
        runId: "run-remote",
        agentId: "remote-desktop",
        leaseUntil: "2099-05-04T12:10:00.000Z",
        artifactEventType: "card.claimed",
      },
      createdAt: "2099-05-04T12:00:00.000Z",
    });

    expect(store.getOrchestrationSchedulerRuntimeState().claimedTaskIds).toContain(approved.orchestrationTaskId);
  });

  it("can defer board proof review and apply a live Ambient/Pi PM judgment", () => {
    const thread = store.createThread("Live proof review thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip with live judgment." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Live-judged proof card",
      summary: "Exercise live proof judgment.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement behavior for live judgment." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Live proof judgment board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/live-proof-review" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/game.ts"],
        afterRunHook: { ok: true },
        lastAssistantText: "Implemented the acceptance criteria and unit tests passed.",
      },
      finish: true,
      reviewProjectBoardProof: false,
    });

    expect(store.getProjectBoardCard(approved.id).proofReview).toBeUndefined();
    const context = store.getProjectBoardProofReviewContextForRun(run.id);
    expect(context?.deterministicReview.status).toBe("ready_for_review");

    store.applyProjectBoardCardProofReview({
      runId: run.id,
      review: {
        status: "done",
        summary: "Ambient/Pi judged the card complete with strong unit and implementation proof.",
        satisfied: ["Implementation evidence recorded.", "Unit proof recorded."],
        missing: [],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: new Date().toISOString(),
        reviewer: "ambient_pi",
        model: "zai-org/GLM-5.1-FP8",
        confidence: 0.93,
        evidenceQuality: "strong",
        recommendedAction: "close",
        deterministicStatus: context!.deterministicReview.status,
        deterministicSummary: context!.deterministicReview.summary,
        judgeDurationMs: 1234,
      },
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("done");
    expect(reviewed.proofReview).toMatchObject({
      status: "done",
      reviewer: "ambient_pi",
      model: "zai-org/GLM-5.1-FP8",
      confidence: 0.93,
      evidenceQuality: "strong",
      recommendedAction: "close",
      deterministicStatus: "ready_for_review",
    });
    expect(store.getOrchestrationTask(approved.orchestrationTaskId!).state).toBe("done");
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "card_proof_reviewed",
      title: "Card proof reviewed by Pi",
      metadata: expect.objectContaining({ reviewer: "ambient_pi", recommendedAction: "close", confidence: 0.93 }),
    });
  });

  it("creates proof follow-up cards when run proof is too weak to close a board card", () => {
    const thread = store.createThread("Weak proof thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip then review proof." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Weak proof card",
      summary: "Exercise weak proof handling.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement behavior that needs proof." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests.", "Capture visual screenshot."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Weak proof board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/weak-proof" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: { lastAssistantText: "I made progress, but no proof is attached yet." },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "needs_follow_up",
      runId: run.id,
      missing: expect.arrayContaining([
        expect.stringContaining("Acceptance criteria"),
        expect.stringContaining("No changed implementation files"),
        expect.stringContaining("Unit proof missing"),
        expect.stringContaining("Visual proof missing"),
      ]),
    });
    const followUps = store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up");
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({
      title: "Complete proof for Weak proof card",
      status: "draft",
      candidateStatus: "needs_clarification",
      blockedBy: [approved.id],
      labels: expect.arrayContaining(["proof-follow-up", "plan"]),
    });
    expect(reviewed.proofReview?.followUpCardIds).toEqual([followUps[0].id]);
  });

  it("prevents stale run follow-up cards from becoming ready after the parent is done", () => {
    const thread = store.createThread("Stale proof follow-up thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip then review proof." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Parent proof card",
      summary: "Exercise stale proof follow-up handling.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement behavior that needs proof." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests.", "Capture visual screenshot."],
      decisionQuestions: [],
    });

    const board = store.createProjectBoard({ title: "Stale proof follow-up board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/stale-proof-follow-up" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: { lastAssistantText: "I made progress, but no proof is attached yet." },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    const followUp = store.getActiveProjectBoard()!.cards.find((candidate) => candidate.sourceKind === "run_follow_up")!;
    store.updateProjectBoardCardCandidateStatus(followUp.id, "ready_to_create");
    store.resolveProjectBoardProofDecision({ cardId: reviewed.id, action: "accept_done", reason: "Parent scope is already complete." });

    store.updateProjectBoardStatus(board.id, "active");
    expect(store.createReadyProjectBoardTasks(board.id)).toEqual([]);
    expect(() => store.approveProjectBoardCard(followUp.id)).toThrow('parent card "Parent proof card" is already done');

    store.updateProjectBoardCardCandidateStatus(followUp.id, "needs_clarification");
    expect(() => store.updateProjectBoardCardCandidateStatus(followUp.id, "ready_to_create")).toThrow(
      'parent card "Parent proof card" is already done',
    );
    expect(store.getProjectBoardCard(followUp.id)).toMatchObject({ status: "draft", candidateStatus: "needs_clarification" });
  });

  it("materializes Pi-suggested proof follow-up cards without rewriting the approved parent", () => {
    const thread = store.createThread("Pi proof follow-up thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nImplement and prove a visual polish card." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Visual proof card",
      summary: "Exercise Pi-suggested proof follow-up handling.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement responsive polish that needs screenshot proof." }],
      openQuestions: [],
      risks: [],
      verification: ["Capture desktop and mobile screenshots."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Pi proof follow-up board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const originalDescription = approved.description;
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/pi-proof-follow-up" });
    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/index.html"],
        lastAssistantText: "Implemented the responsive polish, but screenshots were not captured before handoff.",
      },
    });

    store.applyProjectBoardCardProofReview({
      runId: run.id,
      review: {
        status: "needs_follow_up",
        summary: "Implementation evidence exists, but the required viewport screenshots are missing.",
        satisfied: ["Implementation evidence recorded."],
        missing: ["Collect desktop and mobile screenshot evidence for the responsive polish."],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: new Date().toISOString(),
        reviewer: "ambient_pi",
        model: "gmi-proof-judge-test",
        confidence: 0.88,
        evidenceQuality: "mixed",
        recommendedAction: "follow_up",
        followUpSuggestion: {
          title: "Collect responsive polish screenshot proof",
          description: "Capture the missing viewport evidence for the completed responsive polish work.",
          acceptanceCriteria: [
            "Desktop screenshot shows the responsive polish rendered without overlap.",
            "Mobile screenshot shows the compact layout rendered without overlap.",
          ],
          testPlan: {
            unit: [],
            integration: ["Run the browser smoke check before collecting screenshots."],
            visual: ["Capture 1280px desktop and 390px mobile screenshots."],
            manual: ["Inspect screenshots for layout overlap and clipped text."],
          },
          clarificationQuestions: ["Confirm whether tablet viewport proof is also required before ticketizing."],
          labels: ["visual-proof", "viewport"],
          rationale: "The parent implementation should not be rewritten; the missing evidence is additive follow-up work.",
        },
      },
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed).toMatchObject({
      status: "blocked",
      description: originalDescription,
      proofReview: {
        status: "needs_follow_up",
        reviewer: "ambient_pi",
        followUpSuggestion: expect.objectContaining({
          title: "Collect responsive polish screenshot proof",
          labels: ["visual-proof", "viewport"],
        }),
      },
    });
    const followUps = store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up");
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({
      title: "Collect responsive polish screenshot proof",
      description: "Capture the missing viewport evidence for the completed responsive polish work.",
      status: "draft",
      candidateStatus: "needs_clarification",
      blockedBy: [approved.id],
      labels: expect.arrayContaining(["proof-follow-up", "pi-suggested-follow-up", "visual-proof", "viewport"]),
      acceptanceCriteria: [
        "Desktop screenshot shows the responsive polish rendered without overlap.",
        "Mobile screenshot shows the compact layout rendered without overlap.",
      ],
      testPlan: {
        unit: [],
        integration: ["Run the browser smoke check before collecting screenshots."],
        visual: ["Capture 1280px desktop and 390px mobile screenshots."],
        manual: ["Inspect screenshots for layout overlap and clipped text."],
      },
      clarificationQuestions: ["Confirm whether tablet viewport proof is also required before ticketizing."],
    });
    expect(reviewed.proofReview?.followUpCardIds).toEqual([followUps[0].id]);
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "card_proof_reviewed",
      metadata: expect.objectContaining({
        followUpSuggestionUsed: true,
        followUpSuggestionTitle: "Collect responsive polish screenshot proof",
      }),
    });
    expect(store.getActiveProjectBoard()?.events?.some((event) =>
      event.kind === "run_follow_up_created" && event.metadata.piSuggestedFollowUp === true,
    )).toBe(true);
  });

  it("preserves terminal blocker context without creating proof follow-up noise", () => {
    const thread = store.createThread("Terminal blocker thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip with a credential-gated smoke test." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Credential-gated card",
      summary: "Exercise terminal blocker handling.",
      content: message.content,
      steps: [{ id: "step-1", title: "Run the external smoke path." }],
      openQuestions: [],
      risks: [],
      verification: ["Run integration smoke."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Terminal blocker board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/terminal-blocker" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "failed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/integration.ts"],
        lastAssistantText:
          "Terminal blocker: I cannot continue because the production smoke endpoint needs an API key from the user before the integration proof can run.",
      },
      error: "Run stopped after the model reported a terminal blocker.",
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "terminally_blocked",
      missing: [
        expect.stringContaining("production smoke endpoint needs an API key from the user"),
      ],
      recommendedAction: "block",
    });
    expect(store.getOrchestrationTask(approved.orchestrationTaskId!).state).toBe("terminal_blocker");
    expect(store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up")).toHaveLength(0);
  });

  it("does not count negated visual proof text as screenshot evidence", () => {
    const thread = store.createThread("Negated visual proof thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip visual work." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Visual proof card",
      summary: "Exercise visual proof negation.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement behavior that needs visual proof." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests.", "Capture visual screenshot."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Negated visual proof board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/negated-visual-proof" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/App.tsx"],
        testOutput: "npm test: 7 tests passed",
        lastAssistantText:
          "Implemented the acceptance criteria and unit tests passed. Visual proof was not captured because no headless browser was available.",
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "needs_follow_up",
      missing: expect.arrayContaining([expect.stringContaining("Visual proof missing")]),
      satisfied: expect.not.arrayContaining(["Visual/browser proof recorded."]),
    });
  });

  it("counts structured task manualChecks as manual proof", () => {
    const board = store.createProjectBoard({ title: "Structured manual proof board" });
    const thread = store.createThread("Structured manual proof thread");
    const draft = store.createProjectBoardManualCard({ boardId: board.id, title: "Implement importable converter module" });
    store.updateProjectBoardCard({
      cardId: draft.id,
      description: "Create converter.mjs and verify it imports in a clean Node process.",
      acceptanceCriteria: ["converter.mjs exports the conversion helpers."],
      testPlan: {
        unit: [],
        integration: [],
        visual: [],
        manual: ["Verify module can be imported without errors in a clean Node.js environment."],
      },
      candidateStatus: "ready_to_create",
    });
    const approved = store.approveProjectBoardCard(draft.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/manual-proof" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["converter.mjs"],
        lastAssistantText: "Implemented the acceptance criteria and verified the importable module.",
        taskToolActions: [
          {
            action: "task_heartbeat",
            actionId: "manual-proof-start",
            createdAt: "2026-05-16T22:00:00.000Z",
            summary: "Starting converter module implementation.",
            completed: [],
            remaining: ["Implement module", "Verify import"],
          },
          {
            action: "task_report_proof",
            actionId: "manual-proof-report",
            createdAt: "2026-05-16T22:01:00.000Z",
            summary: "converter.mjs imports cleanly and exposes the expected helpers.",
            commands: ["node -e \"import('./converter.mjs')\""],
            changedFiles: ["converter.mjs"],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: ["Clean Node.js import succeeds in a fresh process and exposes the expected helpers."],
          },
          {
            action: "task_complete",
            actionId: "manual-proof-complete",
            createdAt: "2026-05-16T22:01:10.000Z",
            summary: "converter.mjs is implemented and import proof is complete.",
            completed: ["converter.mjs exports the conversion helpers."],
            remaining: [],
            risks: [],
            commands: ["node -e \"import('./converter.mjs')\""],
            changedFiles: ["converter.mjs"],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: ["Clean Node.js import succeeds in a fresh process."],
          },
        ],
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("review");
    expect(reviewed.proofReview).toMatchObject({
      status: "ready_for_review",
      missing: [],
      satisfied: expect.arrayContaining(["Manual review proof recorded."]),
    });
    expect(store.getOrchestrationTask(approved.orchestrationTaskId!).state).toBe("needs_review");
  });

  it("reviews durable task_complete proof when the final assistant response fails", () => {
    const board = store.createProjectBoard({ title: "Post-completion provider error board" });
    const thread = store.createThread("Post-completion provider error thread");
    const draft = store.createProjectBoardManualCard({ boardId: board.id, title: "Implement converter proof before provider error" });
    store.updateProjectBoardCard({
      cardId: draft.id,
      description: "Create converter.mjs and verify it imports in a clean Node process.",
      acceptanceCriteria: ["converter.mjs exports the conversion helpers."],
      testPlan: {
        unit: ["Run node:test coverage."],
        integration: [],
        visual: [],
        manual: ["Verify module can be imported without errors in a clean Node.js environment."],
      },
      candidateStatus: "ready_to_create",
    });
    const approved = store.approveProjectBoardCard(draft.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/provider-error-after-complete" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "failed",
      threadId: thread.id,
      error: 'The Pi/Ambient runtime returned an error:\n\n429 "Rate limit exceeded"',
      proofOfWork: {
        changedFiles: ["converter.mjs", "converter.test.mjs"],
        lastAssistantStatus: "error",
        lastAssistantText: 'The Pi/Ambient runtime returned an error:\n\n429 "Rate limit exceeded"',
        taskToolActions: [
          {
            action: "task_heartbeat",
            actionId: "provider-error-start",
            createdAt: "2026-05-16T22:00:00.000Z",
            summary: "Starting converter implementation.",
            completed: [],
            remaining: ["Implement module", "Run tests", "Verify import"],
          },
          {
            action: "task_report_proof",
            actionId: "provider-error-proof",
            createdAt: "2026-05-16T22:03:00.000Z",
            summary: "converter.mjs imports cleanly and node:test coverage passes.",
            commands: ["node --test converter.test.mjs", "node -e \"import('./converter.mjs')\""],
            changedFiles: ["converter.mjs", "converter.test.mjs"],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: ["Clean Node.js import succeeds in a fresh process and exposes the expected helpers."],
          },
          {
            action: "task_complete",
            actionId: "provider-error-complete",
            createdAt: "2026-05-16T22:03:10.000Z",
            summary: "converter.mjs is implemented and proof is complete.",
            completed: ["converter.mjs exports the conversion helpers.", "node:test coverage passes.", "Clean import verified."],
            remaining: [],
            risks: [],
            commands: ["node --test converter.test.mjs", "node -e \"import('./converter.mjs')\""],
            changedFiles: ["converter.mjs", "converter.test.mjs"],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: ["Clean Node.js import succeeds in a fresh process."],
          },
        ],
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("review");
    expect(reviewed.proofReview).toMatchObject({
      status: "ready_for_review",
      missing: [],
      satisfied: expect.arrayContaining(["Unit proof recorded.", "Manual review proof recorded."]),
      evidenceQuality: "strong",
      recommendedAction: "close",
    });
    expect(reviewed.proofReview?.summary).toContain("recorded durable task_complete proof");
    expect(store.getOrchestrationTask(approved.orchestrationTaskId!).state).toBe("needs_review");
  });

  it("records native task tool actions immediately as run proof and board progress events", () => {
    const board = store.createProjectBoard({ title: "Native task action event board" });
    const draft = store.createProjectBoardManualCard({ boardId: board.id, title: "Implement contrast checker" });
    store.updateProjectBoardCard({
      cardId: draft.id,
      description: "Build a token contrast checker and prove it with a CLI run.",
      acceptanceCriteria: ["Contrast checker fails inaccessible token pairs."],
      testPlan: { unit: ["Run contrast checker fixtures."], integration: [], visual: [], manual: [] },
      candidateStatus: "ready_to_create",
    });
    const approved = store.approveProjectBoardCard(draft.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/native-task-actions" });

    const updated = store.recordProjectBoardTaskToolAction({
      runId: run.id,
      cardId: approved.id,
      taskId: approved.orchestrationTaskId!,
      source: "native_tool",
      toolName: "task_report_proof",
      action: {
        actionId: "native-proof-1",
        action: "task_report_proof",
        createdAt: "2026-05-17T12:00:00.000Z",
        runId: run.id,
        cardId: approved.id,
        taskId: approved.orchestrationTaskId!,
        summary: "Contrast checker fixture passed.",
        commands: ["node scripts/check-contrast.mjs tokens.json"],
        changedFiles: ["scripts/check-contrast.mjs"],
        screenshots: [],
        browserTraces: [],
        visualChecks: [],
        manualChecks: [],
        metadata: { transport: "native_tool", toolName: "task_report_proof" },
      },
    });

    expect(updated?.proofOfWork).toMatchObject({
      taskToolActions: [
        expect.objectContaining({
          actionId: "native-proof-1",
          metadata: expect.objectContaining({ transport: "native_tool", toolName: "task_report_proof" }),
        }),
      ],
      taskActionDiagnostics: expect.objectContaining({
        nativeToolActionCount: 1,
        fencedFallbackActionCount: 0,
        terminalActionCount: 1,
      }),
    });
    const boardAfter = store.getProjectBoard(board.id);
    const progressEvent = (boardAfter?.events ?? []).find((event) => event.kind === "card_run_progress" && event.metadata.taskAction && event.metadata.runId === run.id);
    expect(progressEvent).toMatchObject({
      title: "Proof reported",
      summary: "Contrast checker fixture passed.",
      metadata: expect.objectContaining({
        source: "native_tool",
        taskAction: expect.objectContaining({
          action: "task_report_proof",
          actionId: "native-proof-1",
          source: "native_tool",
          terminal: true,
        }),
        taskActionDiagnostics: expect.objectContaining({ nativeToolActionCount: 1 }),
      }),
    });
  });

  it("does not accept dependency cache churn as implementation proof for board cards", () => {
    const thread = store.createThread("Generated proof thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip with proof." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Generated-only proof card",
      summary: "Should reject cache-only diffs.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement behavior in source files." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests.", "Capture visual screenshot."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Generated proof board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/generated-proof" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: [{ path: "node_modules/.vite/vitest/results.json", status: " M", category: "modified" }],
        gitStatus: [" M node_modules/.vite/vitest/results.json", "?? node_modules/.vite/deps/"],
        diff: [
          "diff --git a/node_modules/.vite/vitest/results.json b/node_modules/.vite/vitest/results.json",
          "--- a/node_modules/.vite/vitest/results.json",
          "+++ b/node_modules/.vite/vitest/results.json",
          "@@ -1 +1 @@",
          "-old",
          "+new",
        ].join("\n"),
        lastAssistantText:
          "Implemented the acceptance criteria. Unit tests passed, visual screenshot captured, and manual review confirmed the result.",
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "needs_follow_up",
      missing: expect.arrayContaining([expect.stringContaining("No changed implementation files")]),
      satisfied: expect.not.arrayContaining(["Implementation evidence recorded."]),
    });
    const followUps = store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up");
    expect(followUps).toHaveLength(1);
    expect(followUps[0].title).toBe("Complete proof for Generated-only proof card");
  });

  it("keeps unclear, evidence, and rejected candidate cards out of executable tasks", () => {
    const thread = store.createThread("Candidate planning thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nClarify and ship." });
    const unclearArtifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Needs scope plan",
      summary: "Needs a user decision before execution.",
      content: message.content,
      steps: [{ id: "step-1", title: "Decide final scope." }],
      openQuestions: ["Which workflow should be prioritized?"],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });
    const evidenceThread = store.createThread("Evidence planning thread");
    const evidenceMessage = store.addMessage({ threadId: evidenceThread.id, role: "assistant", content: "## Plan\nRecord completed work." });
    const evidenceArtifact = store.createPlannerPlanArtifact({
      threadId: evidenceThread.id,
      sourceMessageId: evidenceMessage.id,
      title: "Evidence plan",
      summary: "This may already be done.",
      content: "## Plan\nRecord completed work.",
      steps: [{ id: "step-1", title: "Record completed proof." }],
      openQuestions: [],
      risks: [],
      verification: ["Manual review."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Candidate board" });
    const unclearCard = store.promotePlannerPlanToBoard(unclearArtifact.id);
    const evidenceCard = store.promotePlannerPlanToBoard(evidenceArtifact.id);

    expect(unclearCard).toMatchObject({ status: "draft", candidateStatus: "needs_clarification" });
    expect(() => store.approveProjectBoardCard(unclearCard.id)).toThrow("Only ready-to-create");
    expect(() => store.updateProjectBoardCardCandidateStatus(unclearCard.id, "ready_to_create")).toThrow("Clarification questions");

    const clarifiedCard = store.updateProjectBoardCard({
      cardId: unclearCard.id,
      clarificationQuestions: [],
      clarificationAnswers: [
        {
          question: "Which workflow should be prioritized?",
          answer: "Prioritize the current project-board workflow.",
          answeredAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(clarifiedCard.clarificationQuestions).toEqual([]);
    expect(clarifiedCard.clarificationDecisions?.filter((decision) => decision.state === "open")).toEqual([]);
    // Answering the last open clarification auto-promotes the candidate inside
    // updateProjectBoardCard, so no explicit status transition (or
    // candidate_status_changed event) happens for this card anymore.
    expect(clarifiedCard.candidateStatus).toBe("ready_to_create");

    const ready = store.updateProjectBoardCardCandidateStatus(unclearCard.id, "ready_to_create");
    expect(ready.candidateStatus).toBe("ready_to_create");
    const approved = store.approveProjectBoardCard(unclearCard.id);
    expect(approved).toMatchObject({ status: "ready", orchestrationTaskId: expect.any(String) });

    const evidence = store.updateProjectBoardCardCandidateStatus(evidenceCard.id, "evidence");
    expect(evidence).toMatchObject({ candidateStatus: "evidence", orchestrationTaskId: undefined });
    expect(() => store.approveProjectBoardCard(evidenceCard.id)).toThrow("Only ready-to-create");

    const rejected = store.updateProjectBoardCardCandidateStatus(evidenceCard.id, "rejected");
    expect(rejected).toMatchObject({ candidateStatus: "rejected", orchestrationTaskId: undefined });
    expect(store.getActiveProjectBoard()?.events?.filter((event) => event.kind === "candidate_status_changed").map((event) => event.metadata)).toEqual([
      expect.objectContaining({ cardId: evidenceCard.id, from: "evidence", to: "rejected" }),
      expect.objectContaining({ cardId: evidenceCard.id, from: "ready_to_create", to: "evidence" }),
    ]);
  });

  it("enforces strict project board proof before ready state and approval", () => {
    const board = store.createProjectBoard({ title: "Strict proof board" });
    const thread = store.createThread("Strict proof thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip without proof first." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Proof-gated card",
      summary: "Should need proof before ticketization.",
      content: message.content,
      steps: [{ id: "step-1", title: "Build the gated behavior." }],
      openQuestions: [],
      risks: [],
      verification: ["Manual proof."],
      decisionQuestions: [],
    });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    store.updateProjectBoardCard({ cardId: card.id, testPlan: { unit: [], integration: [], visual: [], manual: [] } });

    const answers = [
      "Ship strict proof gating.",
      "Use project sources as supporting context.",
      "Proceed when scope is clear.",
      "Require proof before ready or approval.",
      "Keep rerunning proof-gated cards until proof is present or blocked.",
    ];
    for (const [index, question] of store.getActiveProjectBoard()!.questions.entries()) {
      store.answerProjectBoardQuestion(question.id, answers[index]);
    }
    expect(store.finalizeProjectBoardKickoff(board.id).charter?.testPolicy).toMatchObject({
      requireProofSpec: true,
      proofScopeWarningPolicy: "advisory",
    });

    expect(() => store.approveProjectBoardCard(card.id)).toThrow("Strict project board proof policy");
    expect(store.updateProjectBoardCardCandidateStatus(card.id, "needs_clarification")).toMatchObject({ candidateStatus: "needs_clarification" });
    expect(() => store.updateProjectBoardCardCandidateStatus(card.id, "ready_to_create")).toThrow("Strict project board proof policy");
    expect(() => store.updateProjectBoardCard({ cardId: card.id, candidateStatus: "ready_to_create" })).toThrow("Strict project board proof policy");

    const ready = store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      testPlan: { unit: [], integration: [], visual: [], manual: ["Manual proof."] },
    });
    expect(ready).toMatchObject({ candidateStatus: "ready_to_create", testPlan: { manual: ["Manual proof."] } });
    expect(store.approveProjectBoardCard(card.id)).toMatchObject({ status: "ready", orchestrationTaskId: expect.any(String) });
  });

  it("edits candidate card details before ticketization and persists the update", () => {
    const thread = store.createThread("Candidate edit thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nEdit the candidate." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Editable candidate",
      summary: "Initial summary.",
      content: message.content,
      steps: [{ id: "step-1", title: "Initial criterion." }],
      openQuestions: [],
      risks: [],
      verification: ["Initial manual proof."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Editable board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const blocker = store.createOrchestrationTask({ title: "Prerequisite task", state: "review" });
    const updated = store.updateProjectBoardCard({
      cardId: card.id,
      title: " Updated candidate ",
      description: " Updated self-contained description. ",
      candidateStatus: "needs_clarification",
      priority: 101,
      phase: " Phase 2 ",
      labels: ["UI", "ui", "QA"],
      blockedBy: [blocker.identifier, blocker.identifier, " card:other "],
      acceptanceCriteria: ["One", "Two", "One", " "],
      sourceRefs: ["docs/spec.md", "docs/spec.md"],
      clarificationQuestions: [
        "Does 'classic rotation' strictly prohibit any modern control additions (e.g., strafe, boost, brake), or is it the baseline with room for layered mechanics in later phases?",
        "Does 'classic rotation' strictly prohibit modern control additions (strafe, boost, brake), or is it the baseline with room for layered mechanics in later phases?",
      ],
      clarificationAnswers: [
        {
          question:
            "Does 'classic rotation' strictly prohibit modern control additions (strafe, boost, brake), or is it the baseline with room for layered mechanics in later phases?",
          answer: "Use the project charter route.",
          answeredAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      testPlan: {
        unit: ["Unit proof", "Unit proof"],
        integration: ["Integration proof"],
        visual: ["Visual proof"],
        manual: ["Manual proof"],
      },
    });

    expect(updated).toMatchObject({
      title: "Updated candidate",
      description: "Updated self-contained description.",
      candidateStatus: "needs_clarification",
      priority: 100,
      phase: "Phase 2",
      labels: ["ui", "qa"],
      blockedBy: [blocker.identifier, "card:other"],
      acceptanceCriteria: ["One", "Two"],
      sourceRefs: ["docs/spec.md"],
      clarificationQuestions: [
        "Does 'classic rotation' strictly prohibit any modern control additions (e.g., strafe, boost, brake), or is it the baseline with room for layered mechanics in later phases?",
      ],
      clarificationAnswers: [
        {
          question:
            "Does 'classic rotation' strictly prohibit modern control additions (strafe, boost, brake), or is it the baseline with room for layered mechanics in later phases?",
          answer: "Use the project charter route.",
          answeredAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      testPlan: {
        unit: ["Unit proof"],
        integration: ["Integration proof"],
        visual: ["Visual proof"],
        manual: ["Manual proof"],
      },
    });
    expect(() => store.approveProjectBoardCard(card.id)).toThrow("Only ready-to-create");

    const approved = store.approveProjectBoardCard(
      store.updateProjectBoardCard({ cardId: card.id, candidateStatus: "ready_to_create" }).id,
    );
    expect(approved.orchestrationTaskId).toBeTruthy();
    const approvedTask = store.getOrchestrationTask(approved.orchestrationTaskId!);
    expect(approvedTask.blockedBy).toEqual([blocker.identifier, "card:other"]);
    expect(approvedTask.description ?? "").toContain("Dependencies / blockers:");
    expect(approvedTask.description ?? "").toContain(`- ${blocker.identifier}`);
    expect(store.getActiveProjectBoard()?.events?.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["card_updated", "card_ticketized"]),
    );
    expect(() => store.updateProjectBoardCard({ cardId: card.id, title: "Too late" })).toThrow("before ticketization");
  });

  it("requires clarification answers before a draft candidate can be marked ready", () => {
    const board = store.createProjectBoard({ title: "Clarification gate board" });
    const card = store.createProjectBoardManualCard({ boardId: board.id, title: "Clarify controls" });
    const sibling = store.createProjectBoardManualCard({ boardId: board.id, title: "Document controls" });

    store.updateProjectBoardCard({
      cardId: card.id,
      acceptanceCriteria: ["Ship responds to input."],
      testPlan: { unit: ["Test input reducer."], integration: [], visual: [], manual: [] },
      clarificationQuestions: ["Should controls use arcade movement or inertia-based thrust?"],
    });
    store.updateProjectBoardCard({
      cardId: sibling.id,
      description: "Document the selected control scheme.",
      acceptanceCriteria: ["Control scheme is documented."],
      clarificationQuestions: ["Should controls use arcade movement or inertia-based thrust?"],
    });

    expect(() => store.updateProjectBoardCard({ cardId: card.id, candidateStatus: "ready_to_create" })).toThrow(
      "Clarification questions must be answered",
    );

    const ready = store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      clarificationQuestions: [],
      clarificationAnswers: [
        {
          question: "Should controls use arcade movement or inertia-based thrust?",
          answer: "Use inertia-based thrust.",
          answeredAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    });

    expect(ready).toMatchObject({
      candidateStatus: "ready_to_create",
      clarificationQuestions: [],
      clarificationAnswers: [
        expect.objectContaining({
          answer: "Use inertia-based thrust.",
        }),
      ],
    });

    const event = store
      .getActiveProjectBoard()
      ?.events?.filter((candidate) => candidate.kind === "card_updated" && candidate.title === "Clarification decision answered")
      .at(-1);
    expect(event?.summary).toContain("0 model calls");
    expect(event?.metadata).toMatchObject({
      decisionImpact: {
        triggerType: "clarification_answer",
        modelCallRequired: false,
        targetedRefreshOptional: true,
        affectedCounts: {
          unblockedDrafts: 2,
        },
        affectedCardIds: expect.arrayContaining([card.id, sibling.id]),
      },
    });
  });

  it("adds additive next-run feedback to ticketized cards without rewriting approved fields", () => {
    const board = store.createProjectBoard({ title: "Run feedback board" });
    const card = store.createProjectBoardManualCard({ boardId: board.id, title: "Render hello world" });
    const ready = store.updateProjectBoardCard({
      cardId: card.id,
      description: "Render a hello world page.",
      acceptanceCriteria: ["Page says hello world."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Open the page and verify the text."] },
      candidateStatus: "ready_to_create",
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const taskBefore = store.getOrchestrationTask(approved.orchestrationTaskId!);
    expect(taskBefore.description).not.toContain("Use the PM-approved copy");

    const updated = store.addProjectBoardCardRunFeedback({
      cardId: approved.id,
      feedback: "Use the PM-approved copy exactly: Hello from Ambient.",
      source: "decision_impact",
      decisionQuestion: "What text should the page display?",
      decisionAnswer: "Hello from Ambient.",
    });

    expect(updated).toMatchObject({
      id: approved.id,
      title: "Render hello world",
      description: "Render a hello world page.",
      runFeedback: [
        expect.objectContaining({
          source: "decision_impact",
          feedback: "Use the PM-approved copy exactly: Hello from Ambient.",
          decisionAnswer: "Hello from Ambient.",
        }),
      ],
    });
    const taskAfter = store.getOrchestrationTask(approved.orchestrationTaskId!);
    expect(taskAfter.description).toContain("Next-run feedback / additive PM instructions:");
    expect(taskAfter.description).toContain("Use the PM-approved copy exactly: Hello from Ambient.");
    expect(() => store.updateProjectBoardCard({ cardId: approved.id, title: "Rewrite approved card" })).toThrow("before ticketization");

    const event = store
      .getActiveProjectBoard()
      ?.events?.filter((candidate) => candidate.kind === "card_updated" && candidate.title === "Run feedback added")
      .at(-1);
    expect(event?.metadata).toMatchObject({
      runFeedback: {
        source: "decision_impact",
        decisionQuestion: "What text should the page display?",
        modelCallRequired: false,
      },
    });
  });

  it("applies clarification impact as next-run feedback for linked ticketized cards", () => {
    const board = store.createProjectBoard({ title: "Decision impact apply board" });
    const question = "What greeting should the app render?";
    const answer = "Hello from Ambient.";
    const draft = store.createProjectBoardManualCard({ boardId: board.id, title: "Choose greeting copy" });
    store.updateProjectBoardCard({
      cardId: draft.id,
      description: "Decide the greeting copy before final implementation.",
      acceptanceCriteria: ["Greeting copy is selected."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Confirm PM answer is recorded."] },
      clarificationQuestions: [question],
    });
    const linked = store.createProjectBoardManualCard({ boardId: board.id, title: "Render greeting" });
    const linkedReady = store.updateProjectBoardCard({
      cardId: linked.id,
      description: `Render the greeting in the HTML app.\n${question}`,
      acceptanceCriteria: ["The app renders the PM-approved greeting."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Open the app and confirm the greeting text."] },
      candidateStatus: "ready_to_create",
    });
    const approved = store.approveProjectBoardCard(linkedReady.id);

    const updatedDraft = store.applyProjectBoardDecisionImpactFeedback({ cardId: draft.id, question, answer });

    expect(updatedDraft.clarificationAnswers).toEqual([
      expect.objectContaining({
        question,
        answer,
      }),
    ]);
    const updatedLinked = store.getProjectBoardCard(approved.id);
    expect(updatedLinked).toMatchObject({
      title: "Render greeting",
      description: `Render the greeting in the HTML app.\n${question}`,
      runFeedback: [
        expect.objectContaining({
          source: "decision_impact",
          decisionQuestion: question,
          decisionAnswer: answer,
        }),
      ],
    });
    const taskAfter = store.getOrchestrationTask(approved.orchestrationTaskId!);
    expect(taskAfter.description).toContain("Next-run feedback / additive PM instructions:");
    expect(taskAfter.description).toContain(answer);
    expect(() => store.updateProjectBoardCard({ cardId: approved.id, title: "Rewrite approved card" })).toThrow("before ticketization");

    store.applyProjectBoardDecisionImpactFeedback({ cardId: draft.id, question, answer });
    expect(store.getProjectBoardCard(approved.id).runFeedback).toHaveLength(1);

    const events = store.getActiveProjectBoard()?.events ?? [];
    expect(events.some((event) => event.title === "Run feedback added")).toBe(true);
    const appliedEvent = events.filter((event) => event.title === "Decision impact applied").at(-1);
    expect(appliedEvent?.metadata).toMatchObject({
      decisionImpact: {
        appliedAction: "create_next_run_feedback",
        modelCallRequired: false,
        affectedCardIds: expect.arrayContaining([approved.id]),
        appliedCardIds: expect.arrayContaining([approved.id]),
      },
    });
  });

  it("applies a ticketized clarification decision as additive next-run feedback without rewriting approved fields", () => {
    const board = store.createProjectBoard({ title: "Ticketized decision board" });
    const question = "Should the hero greeting use pulse or confetti?";
    const answer = "Use a subtle pulse animation.";
    const draft = store.createProjectBoardManualCard({ boardId: board.id, title: "Render animated greeting" });
    store.updateProjectBoardCard({
      cardId: draft.id,
      description: `Render the greeting.\n${question}`,
      acceptanceCriteria: ["The greeting renders with the approved animation."],
      testPlan: { unit: ["Greeting text exists."], integration: [], visual: ["Capture the animated greeting."], manual: [] },
      candidateStatus: "ready_to_create",
    });
    const approved = store.approveProjectBoardCard(draft.id);

    const updated = store.applyProjectBoardDecisionImpactFeedback({ cardId: approved.id, question, answer });

    expect(updated).toMatchObject({
      title: "Render animated greeting",
      description: `Render the greeting.\n${question}`,
      clarificationAnswers: [expect.objectContaining({ question, answer })],
      runFeedback: [
        expect.objectContaining({
          source: "decision_impact",
          decisionQuestion: question,
          decisionAnswer: answer,
        }),
      ],
    });
    const taskAfter = store.getOrchestrationTask(approved.orchestrationTaskId!);
    expect(taskAfter.description).toContain("Next-run feedback / additive PM instructions:");
    expect(taskAfter.description).toContain(answer);
    expect(taskAfter.description).toContain("Apply this PM decision in the next run without rewriting the approved card silently.");

    store.applyProjectBoardDecisionImpactFeedback({ cardId: approved.id, question, answer });
    expect(store.getProjectBoardCard(approved.id).runFeedback).toHaveLength(1);
    expect(store.getProjectBoardCard(approved.id).clarificationAnswers).toHaveLength(1);

    const events = store.getActiveProjectBoard()?.events ?? [];
    expect(events.some((event) => event.title === "Clarification decision answered")).toBe(true);
    expect(events.some((event) => event.title === "Decision impact applied")).toBe(true);
  });

  it("refreshes affected draft questions from one clarification answer without a model call", () => {
    const board = store.createProjectBoard({ title: "Decision draft refresh board" });
    const canonicalQuestion = "Should numpad operators map directly to calculator operators?";
    const variantQuestion = "Should numpad operators map directly to calculator operators?";
    const answer = "Support direct numpad operator mappings.";
    const source = store.createProjectBoardManualCard({ boardId: board.id, title: "Choose keyboard policy" });
    store.updateProjectBoardCard({
      cardId: source.id,
      description: "Resolve the keyboard policy.",
      acceptanceCriteria: ["The keyboard policy is recorded."],
      testPlan: { unit: ["Decision is captured."], integration: [], visual: [], manual: [] },
      clarificationQuestions: [canonicalQuestion],
    });
    const affected = store.createProjectBoardManualCard({ boardId: board.id, title: "Implement keyboard input" });
    store.updateProjectBoardCard({
      cardId: affected.id,
      description: `Implement keyboard input.\n${variantQuestion}`,
      acceptanceCriteria: ["Keyboard input follows the PM-approved policy."],
      testPlan: { unit: ["Keyboard unit tests pass."], integration: [], visual: [], manual: [] },
      clarificationQuestions: [variantQuestion],
    });

    const refreshed = store.refreshProjectBoardDecisionDrafts({ cardId: source.id, question: canonicalQuestion, answer });

    expect(refreshed.clarificationQuestions).toEqual([]);
    expect(refreshed.clarificationAnswers).toEqual([
      expect.objectContaining({
        question: canonicalQuestion,
        answer,
      }),
    ]);
    const refreshedAffected = store.getProjectBoardCard(affected.id);
    expect(refreshedAffected.clarificationQuestions).toEqual([]);
    expect(refreshedAffected.clarificationAnswers).toEqual([
      expect.objectContaining({
        question: variantQuestion,
        answer,
      }),
    ]);
    expect(refreshedAffected.description).toContain("## Clarifications");
    expect(refreshedAffected.description).toContain(answer);

    store.refreshProjectBoardDecisionDrafts({ cardId: source.id, question: canonicalQuestion, answer });
    expect(store.getProjectBoardCard(affected.id).clarificationAnswers).toHaveLength(1);
    const event = store
      .getActiveProjectBoard()
      ?.events?.filter((candidate) => candidate.title === "Decision drafts refreshed")
      .at(-1);
    expect(event?.metadata).toMatchObject({
      decisionImpact: {
        appliedAction: "refresh_affected_drafts",
        modelCallRequired: false,
        appliedCardIds: expect.arrayContaining([source.id, affected.id]),
      },
    });
  });

  it("splits a draft candidate into child candidates without creating tasks", () => {
    const thread = store.createThread("Candidate split thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nSplit the candidate." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Split candidate",
      summary: "Initial summary.",
      content: message.content,
      steps: [{ id: "step-1", title: "Build and verify the draft board." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests.", "Run visual smoke."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Split board" });
    const card = store.updateProjectBoardCard({
      cardId: store.promotePlannerPlanToBoard(artifact.id).id,
      acceptanceCriteria: ["Build the draft board.", "Verify the draft board."],
    });
    const children = store.splitProjectBoardCard(card.id);
    const splitAgain = store.splitProjectBoardCard(card.id);

    expect(children.map((item) => item.title)).toEqual(["Build the draft board.", "Verify the draft board."]);
    expect(splitAgain.map((item) => item.id)).toEqual(children.map((item) => item.id));
    expect(children).toEqual([
      expect.objectContaining({
        status: "draft",
        candidateStatus: "ready_to_create",
        sourceKind: "planner_plan",
        sourceThreadId: thread.id,
        sourceMessageId: message.id,
        labels: expect.arrayContaining(["plan", "split"]),
        orchestrationTaskId: undefined,
        acceptanceCriteria: ["Build the draft board."],
      }),
      expect.objectContaining({
        status: "draft",
        candidateStatus: "ready_to_create",
        orchestrationTaskId: undefined,
        acceptanceCriteria: ["Verify the draft board."],
      }),
    ]);
    expect(store.getProjectBoardCard(card.id).candidateStatus).toBe("duplicate");
    expect(store.getActiveProjectBoard()?.cards.filter((item) => item.orchestrationTaskId)).toEqual([]);
    expect(store.getActiveProjectBoard()?.events?.filter((event) => event.kind === "card_split")).toEqual([
      expect.objectContaining({
        title: "Candidate split",
        entityId: card.id,
        metadata: expect.objectContaining({ parentCardId: card.id, childCardIds: children.map((item) => item.id) }),
      }),
    ]);
  });

  it("persists thread collaboration mode and planner plan artifacts", () => {
    const thread = store.createThread("Plan me");
    const plannedThread = store.updateThreadSettings(thread.id, { collaborationMode: "planner" });
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\n1. Inspect files." });

    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Plan",
      summary: "Inspect first.",
      content: message.content,
      steps: [{ id: "step-1", title: "Inspect files." }],
      openQuestions: [],
      risks: [],
      verification: ["Run tests."],
      warnings: ["Planner question block had one malformed option."],
      diagrams: [
        {
          id: "architecture",
          title: "Architecture",
          kind: "architecture",
          purpose: "Show the UI and store boundary.",
          nodes: [
            { id: "ui", label: "UI", role: "Displays decisions." },
            { id: "store", label: "Store", role: "Persists artifacts." },
          ],
          edges: [{ from: "ui", to: "store", label: "IPC" }],
        },
      ],
      decisionQuestions: [
        {
          id: "asset-strategy",
          question: "How should assets work?",
          recommendedOptionId: "canvas",
          required: true,
          options: [
            { id: "canvas", label: "Canvas", description: "Draw everything in code." },
            { id: "sprites", label: "Sprites", description: "Use image assets." },
          ],
        },
      ],
    });

    expect(plannedThread.collaborationMode).toBe("planner");
    const listedArtifacts = store.listPlannerPlanArtifacts(thread.id);
    expect(listedArtifacts).toEqual([expect.objectContaining({ id: artifact.id, status: "ready", workflowState: "questions_pending" })]);
    expect(listedArtifacts[0].decisionQuestions[0]).toMatchObject({
      id: "asset-strategy",
      recommendedOptionId: "canvas",
      required: true,
    });
    expect(listedArtifacts[0].warnings).toEqual(["Planner question block had one malformed option."]);
    expect(listedArtifacts[0].diagrams).toEqual([
      expect.objectContaining({
        id: "architecture",
        title: "Architecture",
        kind: "architecture",
        nodes: [
          { id: "ui", label: "UI", role: "Displays decisions." },
          { id: "store", label: "Store", role: "Persists artifacts." },
        ],
        edges: [{ from: "ui", to: "store", label: "IPC" }],
      }),
    ]);
    expect(listedArtifacts[0].decisionQuestions[0].answer).toBeUndefined();

    const answered = store.answerPlannerDecisionQuestion(artifact.id, "asset-strategy", {
      kind: "option",
      optionId: "canvas",
    });
    expect(answered.decisionQuestions[0].answer).toEqual(
      expect.objectContaining({
        kind: "option",
        optionId: "canvas",
      }),
    );
    expect(answered.workflowState).toBe("answers_complete");
    const finalizing = store.updatePlannerPlanArtifact(answered.id, { workflowState: "finalizing" });
    expect(finalizing.workflowState).toBe("finalizing");
    expect(finalizing.finalizationAttempt).toEqual(
      expect.objectContaining({
        status: "running",
        id: expect.any(String),
        startedAt: expect.any(String),
      }),
    );
    const repeatedFinalizing = store.updatePlannerPlanArtifact(answered.id, { workflowState: "finalizing" });
    expect(repeatedFinalizing.finalizationAttempt?.id).toBe(finalizing.finalizationAttempt?.id);
    const failedFinalization = store.updatePlannerPlanArtifact(answered.id, { workflowState: "failed" });
    expect(failedFinalization.finalizationAttempt).toEqual(
      expect.objectContaining({
        id: finalizing.finalizationAttempt?.id,
        status: "failed",
        completedAt: expect.any(String),
      }),
    );
    const answeredCopy = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Answered plan copy",
      summary: "",
      content: "1. Preserve answered decisions.",
      steps: [{ id: "step-1", title: "Preserve answered decisions." }],
      openQuestions: [],
      risks: [],
      verification: [],
      decisionQuestions: answered.decisionQuestions,
    });
    expect(answeredCopy.workflowState).toBe("answers_complete");
    expect(answeredCopy.decisionQuestions[0].answer).toEqual(
      expect.objectContaining({
        kind: "option",
        optionId: "canvas",
      }),
    );
    const copyFinalizing = store.updatePlannerPlanArtifact(answeredCopy.id, { workflowState: "finalizing" });
    const completedFinalization = store.finishPlannerPlanFinalizationAttempt(answeredCopy.id, { status: "completed" });
    expect(completedFinalization.workflowState).toBe("answers_complete");
    expect(completedFinalization.finalizationAttempt).toEqual(
      expect.objectContaining({
        id: copyFinalizing.finalizationAttempt?.id,
        status: "completed",
        completedAt: expect.any(String),
      }),
    );
    const refinalizingCopy = store.updatePlannerPlanArtifact(answeredCopy.id, { workflowState: "finalizing" });
    expect(refinalizingCopy.finalizationAttempt?.id).not.toBe(copyFinalizing.finalizationAttempt?.id);

    const nextArtifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Plan v2",
      summary: "",
      content: "1. Inspect again.",
      steps: [{ id: "step-1", title: "Inspect again." }],
      openQuestions: [],
      risks: [],
      verification: [],
      decisionQuestions: [],
    });

    expect(store.getPlannerPlanArtifact(artifact.id).status).toBe("superseded");
    expect(nextArtifact.workflowState).toBe("draft");
    const durable = store.setPlannerPlanDurableArtifact(nextArtifact.id, {
      path: ".ambient/board/plans/Plan-DurablePlan.html",
      generatedAt: "2026-05-11T00:00:00.000Z",
      validation: {
        ok: true,
        checkedAt: "2026-05-11T00:00:00.000Z",
        errors: [],
        warnings: [],
      },
    });
    expect(durable.workflowState).toBe("durable_ready");
    expect(durable.durableArtifactPath).toBe(".ambient/board/plans/Plan-DurablePlan.html");
    expect(durable.durableArtifactGeneratedAt).toBe("2026-05-11T00:00:00.000Z");
    expect(durable.durableArtifactValidation).toEqual({
      ok: true,
      checkedAt: "2026-05-11T00:00:00.000Z",
      errors: [],
      warnings: [],
    });
    const fallbackDurable = store.setPlannerPlanDurableArtifact(nextArtifact.id, {
      path: ".ambient/board/plans/Plan-Fallback-DurablePlan.html",
      generatedAt: "2026-05-11T00:00:01.000Z",
      workflowState: "durable_ready_with_fallbacks",
      validation: {
        ok: true,
        checkedAt: "2026-05-11T00:00:01.000Z",
        errors: [],
        warnings: [{ code: "pi-diagram-fallback-used", section: "diagram-gallery", message: "Fallback used." }],
      },
    });
    expect(fallbackDurable.workflowState).toBe("durable_ready_with_fallbacks");
    expect(fallbackDurable.durableArtifactPath).toBe(".ambient/board/plans/Plan-Fallback-DurablePlan.html");
    expect(fallbackDurable.durableArtifactValidation?.warnings[0]).toEqual({
      code: "pi-diagram-fallback-used",
      section: "diagram-gallery",
      message: "Fallback used.",
    });
    const invalidDurable = store.setPlannerPlanDurableArtifactValidation(
      nextArtifact.id,
      {
        ok: false,
        checkedAt: "2026-05-11T00:00:01.000Z",
        errors: [{ code: "missing-section", section: "diagram-gallery", message: "Missing diagram gallery." }],
        warnings: [],
      },
      "failed",
    );
    expect(invalidDurable.workflowState).toBe("failed");
    expect(invalidDurable.durableArtifactValidation?.errors[0]).toEqual({
      code: "missing-section",
      section: "diagram-gallery",
      message: "Missing diagram gallery.",
    });
    expect(store.updatePlannerPlanArtifactStatus(nextArtifact.id, "implemented").status).toBe("implemented");
  });

  it("repairs planner question blocks that were stored as generic json", () => {
    const thread = store.createThread("Broken planner questions");
    const brokenContent = `# Plan

Build the game.

\`\`\`json
<ambient-planner-questions>
{
  "questions": [
    {
      "id": "build-tool",
      "question": "Which build tool should the project use?",
      "recommendedOptionId": "vite-ts",
      "required": true,
      "options": [
        {
          "id": "vite-ts",
          "label": "Vite + TypeScript",
          "description": "Use typed Vite defaults."
        },
        {
          "id": "vite-js",
          "label": "Vite + JavaScript",
          "description": "Use simpler JavaScript defaults."
        }
      ]
    }
  ]
}
</ambient-planner-questions>
\`\`\``;
    const message = store.addMessage({
      threadId: thread.id,
      role: "assistant",
      content: brokenContent,
      metadata: { kind: "planner-plan" },
    });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Plan",
      summary: "Build the game.",
      content: brokenContent,
      steps: [],
      openQuestions: [],
      risks: [],
      verification: [],
      decisionQuestions: [],
    });

    store.close();
    store.openWorkspace(workspacePath);

    const repaired = store.getPlannerPlanArtifact(artifact.id);
    expect(repaired.content).not.toContain("ambient-planner-questions");
    expect(repaired.decisionQuestions).toEqual([
      expect.objectContaining({
        id: "build-tool",
        question: "Which build tool should the project use?",
        recommendedOptionId: "vite-ts",
        required: true,
      }),
    ]);
    expect(store.listMessages(thread.id).at(-1)?.content).not.toContain("ambient-planner-questions");
  });

  it("records context usage snapshots for diagnostics", () => {
    const thread = store.createThread("Context accounting");
    const snapshot = store.recordContextUsageSnapshot({
      threadId: thread.id,
      source: "provider-plus-estimate",
      tokens: 42_000,
      contextWindow: 200_000,
      percent: 21,
      latestCompactionAt: "2026-05-01T00:00:00.000Z",
      compactionCount: 1,
      updatedAt: "2026-05-01T00:00:01.000Z",
      diagnostics: {
        piSessionFile: "/tmp/session.jsonl",
        piSessionFileExists: true,
        activeSession: true,
      },
    });

    expect(snapshot).toMatchObject({
      threadId: thread.id,
      source: "provider-plus-estimate",
      tokens: 42_000,
      contextWindow: 200_000,
      percent: 21,
      compactionCount: 1,
      diagnostics: {
        activeSession: true,
      },
    });
    expect(store.getLatestContextUsageSnapshot(thread.id)).toMatchObject({ threadId: thread.id, tokens: 42_000 });
    expect(store.listContextUsageSnapshots()).toEqual([expect.objectContaining({ threadId: thread.id })]);
  });

  it("persists permission grants and audit grant references", () => {
    const thread = store.createThread("Permission grants");
    const grant = store.createPermissionGrant({
      permissionModeAtCreation: "workspace",
      scopeKind: "project",
      projectPath: workspacePath,
      actionKind: "shell_command",
      targetKind: "shell_command_prefix",
      targetHash: "hash-npm-test",
      targetLabel: "npm test",
      conditions: { cwd: workspacePath },
      source: "permission_prompt",
      reason: "Allowed from permission prompt: Allow command?",
    });

    expect(store.listPermissionGrants()).toEqual([
      expect.objectContaining({
        id: grant.id,
        scopeKind: "project",
        projectPath: workspacePath,
        conditions: { cwd: workspacePath },
      }),
    ]);

    const audit = store.addPermissionAudit({
      threadId: thread.id,
      permissionMode: "workspace",
      toolName: "bash",
      risk: "workspace-command",
      decision: "allowed",
      detail: "npm test",
      reason: "Approved by Ambient permission grant policy.",
      decisionSource: "persistent_grant",
      grantId: grant.id,
    });

    expect(store.listPermissionAudit()).toEqual([
      expect.objectContaining({
        id: audit.id,
        decisionSource: "persistent_grant",
        grantId: grant.id,
      }),
    ]);

    const revoked = store.revokePermissionGrant(grant.id);
    expect(revoked.revokedAt).toBeTruthy();
    expect(store.listPermissionGrants()).toEqual([]);
    expect(store.listPermissionGrants({ includeRevoked: true })[0]).toMatchObject({ id: grant.id, revokedAt: revoked.revokedAt });
  });

  it("keeps only one reusable empty starter thread", () => {
    const first = store.findReusableEmptyThread();
    const second = store.createThread();

    expect(first).toBeTruthy();
    expect(store.listThreads().map((thread) => thread.id)).toEqual(expect.arrayContaining([second.id, first!.id]));

    expect(store.pruneRedundantEmptyThreads()).toBe(1);
    expect(store.listThreads()).toHaveLength(1);
    expect(store.findReusableEmptyThread()).toBeTruthy();
  });

  it("does not reuse empty-looking chats that already have Pi context state", () => {
    const sessionBacked = store.findReusableEmptyThread();
    expect(sessionBacked).toBeTruthy();

    store.updateThreadSettings(sessionBacked!.id, { piSessionFile: "/tmp/session.jsonl" });
    expect(store.findReusableEmptyThread()).toBeUndefined();

    const snapshotBacked = store.createThread();
    store.recordContextUsageSnapshot({
      threadId: snapshotBacked.id,
      source: "estimate",
      tokens: 1,
      contextWindow: 200_000,
      percent: 0.0005,
      compactionCount: 0,
    });

    expect(store.findReusableEmptyThread()).toBeUndefined();
  });

  it("pins, marks unread, and archives individual chat threads", () => {
    const first = store.createThread("First chat");
    const second = store.createThread("Second chat");

    expect(store.setThreadPinned(first.id, true).pinned).toBe(true);
    expect(store.listThreads()[0].id).toBe(first.id);
    expect(store.listThreads().map((thread) => thread.id)).toContain(second.id);

    const unread = store.markThreadUnread(first.id);
    expect(unread.lastReadAt).toBeTruthy();
    expect(unread.lastReadAt! < unread.updatedAt).toBe(true);

    expect(store.archiveThread(first.id)).toBe(1);
    expect(store.listThreads().map((thread) => thread.id)).not.toContain(first.id);
    expect(store.listThreads().map((thread) => thread.id)).toContain(second.id);
  });

  it("forks chat transcript content into a new thread", () => {
    const source = store.createThread("Forkable chat");
    store.addMessage({ threadId: source.id, role: "user", content: "Build the prototype." });
    store.addMessage({ threadId: source.id, role: "assistant", content: "Prototype built." });

    const fork = store.forkThread(source.id);

    expect(fork.id).not.toBe(source.id);
    expect(fork.title).toBe(source.title);
    expect(fork.workspacePath).toBe(source.workspacePath);
    expect(store.listMessages(fork.id).map((message) => [message.role, message.content])).toEqual([
      ["user", "Build the prototype."],
      ["assistant", "Prototype built."],
    ]);
  });

  it("removes empty starter threads once real work exists", () => {
    const starter = store.findReusableEmptyThread();
    const workThread = store.createThread("Real work");
    store.addMessage({ threadId: workThread.id, role: "user", content: "Build the app." });

    expect(starter).toBeTruthy();
    expect(store.pruneRedundantEmptyThreads()).toBe(1);
    expect(store.listThreads().map((thread) => thread.id)).not.toContain(starter!.id);
    expect(store.findReusableEmptyThread()).toBeUndefined();
  });

  it("persists plugin trust independently from plugin enablement", () => {
    const pluginId = ".agents/plugins/marketplace.json:ambient-fixture";

    expect(store.isPluginEnabled(pluginId)).toBe(true);
    expect(store.isPluginTrusted(pluginId)).toBe(false);

    store.setPluginTrusted(pluginId, true, "fingerprint-a");
    store.setPluginEnabled(pluginId, false);

    expect(store.isPluginEnabled(pluginId)).toBe(false);
    expect(store.isPluginTrusted(pluginId)).toBe(true);
    expect(store.isPluginTrusted(pluginId, "fingerprint-a")).toBe(true);
    expect(store.isPluginTrusted(pluginId, "fingerprint-b")).toBe(false);

    store.setPluginTrusted(pluginId, false);
    expect(store.isPluginTrusted(pluginId)).toBe(false);

    const piPackageId = "ambient-workspace:/workspace/plugins/pi-fixture/package.json:./plugins/pi-fixture";
    expect(store.isPiPackageEnabled(piPackageId)).toBe(false);
    store.setPiPackageEnabled(piPackageId, true);
    expect(store.isPiPackageEnabled(piPackageId)).toBe(true);
    store.setPiPackageEnabled(piPackageId, false);
    expect(store.isPiPackageEnabled(piPackageId)).toBe(false);
    store.setPiPackageEnabled(piPackageId, true);
    store.clearPiPackageEnabled(piPackageId);
    expect(store.isPiPackageEnabled(piPackageId)).toBe(false);
  });

  it("records prepared workspace metadata on tasks", () => {
    const task = store.createOrchestrationTask({ title: "Prepare me" });

    const updated = store.setOrchestrationTaskWorkspace({
      id: task.id,
      workspacePath: "/tmp/ambient-workspaces/LOCAL-1",
      branchName: "ambient/LOCAL-1",
    });

    expect(updated).toMatchObject({
      id: task.id,
      workspacePath: "/tmp/ambient-workspaces/LOCAL-1",
      branchName: "ambient/LOCAL-1",
    });
  });

  it("records prepared runs and derives scheduler claims from persisted run state", () => {
    const task = store.createOrchestrationTask({ title: "Claim me" });

    const run = store.recordPreparedOrchestrationRun({
      taskId: task.id,
      workspacePath: "/tmp/ambient-workspaces/LOCAL-1",
      proofOfWork: { kind: "preparation" },
    });

    expect(run).toMatchObject({
      taskId: task.id,
      attemptNumber: 0,
      status: "prepared",
      workspacePath: "/tmp/ambient-workspaces/LOCAL-1",
      proofOfWork: { kind: "preparation" },
    });
    expect(store.getOrchestrationSchedulerRuntimeState()).toEqual({
      claimedTaskIds: [task.id],
      runningTaskIds: [],
      retryQueuedTaskIds: [],
    });
  });

  it("clears stale prepared workflow-impact runs so they can be prepared again", () => {
    const board = store.createProjectBoard({ title: "Workflow impact board" });
    const card = store.createProjectBoardManualCard({ boardId: board.id, title: "Render hello workflow" });
    const ready = store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Render the hello workflow state."],
      testPlan: { unit: ["Assert workflow impact state."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({
      taskId: approved.orchestrationTaskId!,
      workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", "LOCAL-1"),
      proofOfWork: {
        kind: "preparation",
        workflowPath: join(workspacePath, "WORKFLOW.md"),
        workflowHash: "old-workflow-hash",
      },
    });

    expect(store.getOrchestrationSchedulerRuntimeState().claimedTaskIds).toContain(approved.orchestrationTaskId);

    const result = store.resolveProjectBoardWorkflowImpact({
      boardId: board.id,
      action: "prepare_again",
      runIds: [run.id],
      workflowPath: join(workspacePath, "WORKFLOW.md"),
      workflowHash: "new-workflow-hash",
      createdAt: "2026-05-15T12:00:00.000Z",
    });

    expect(result).toEqual({ clearedRunIds: [run.id], skippedRuns: [] });
    expect(store.getOrchestrationRun(run.id)).toMatchObject({
      status: "canceled",
      error: "Cleared so this Local Task can be prepared again under the current WORKFLOW.md.",
      proofOfWork: expect.objectContaining({
        workflowImpact: expect.objectContaining({
          action: "prepare_again",
          previousStatus: "prepared",
          workflowHash: "new-workflow-hash",
        }),
      }),
    });
    expect(store.getOrchestrationSchedulerRuntimeState().claimedTaskIds).not.toContain(approved.orchestrationTaskId);
    const event = store.getActiveProjectBoard()!.events!.at(-1);
    expect(event).toMatchObject({
      kind: "workflow_impact_resolved",
      title: "Workflow impact prepare-again selected",
      metadata: expect.objectContaining({
        action: "prepare_again",
        clearedRunIds: [run.id],
        affectedCardIds: [approved.id],
        modelCallRequired: false,
      }),
    });
  });

  it("records workflow-impact keep decisions without clearing prepared runs", () => {
    const board = store.createProjectBoard({ title: "Workflow keep board" });
    const card = store.createProjectBoardManualCard({ boardId: board.id, title: "Keep old prep" });
    const ready = store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Keep the current prepared workspace."],
      testPlan: { unit: ["Assert keep decision."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({
      taskId: approved.orchestrationTaskId!,
      workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", "LOCAL-1"),
      proofOfWork: { kind: "preparation", workflowHash: "old-workflow-hash" },
    });

    const result = store.resolveProjectBoardWorkflowImpact({
      boardId: board.id,
      action: "continue_old_prep",
      runIds: [run.id],
      workflowHash: "new-workflow-hash",
      createdAt: "2026-05-15T12:30:00.000Z",
    });

    expect(result).toEqual({ clearedRunIds: [], skippedRuns: [] });
    expect(store.getOrchestrationRun(run.id).status).toBe("prepared");
    expect(store.getOrchestrationSchedulerRuntimeState().claimedTaskIds).toContain(approved.orchestrationTaskId);
    expect(store.getActiveProjectBoard()!.events!.at(-1)).toMatchObject({
      kind: "workflow_impact_resolved",
      title: "Workflow impact old preparation kept",
      metadata: expect.objectContaining({
        action: "continue_old_prep",
        affectedRunIds: [run.id],
        modelCallRequired: false,
      }),
    });
  });

  it("records workflow repair decisions in the board event ledger", () => {
    const board = store.createProjectBoard({ title: "Workflow repair board" });

    const result = store.recordProjectBoardWorkflowRepair({
      boardId: board.id,
      action: "restore_generated_default",
      workflowPath: join(workspacePath, "WORKFLOW.md"),
      previousWorkflowHash: "old-workflow-hash",
      workflowHash: "new-workflow-hash",
      backupPath: join(workspacePath, ".ambient-codex", "orchestration", "workflow-repairs", "WORKFLOW-backup.md"),
      status: "ready",
      createdAt: "2026-05-15T13:00:00.000Z",
    });

    expect(result.recorded).toBe(true);
    expect(store.getActiveProjectBoard()!.events!.at(-1)).toMatchObject({
      kind: "workflow_repaired",
      title: "WORKFLOW.md restored to generated default",
      metadata: expect.objectContaining({
        action: "restore_generated_default",
        workflowHash: "new-workflow-hash",
        previousWorkflowHash: "old-workflow-hash",
        status: "ready",
        modelCallRequired: false,
      }),
    });
  });

  it("records guided workflow setting updates in the board event ledger", () => {
    const board = store.createProjectBoard({ title: "Workflow settings board" });

    const result = store.recordProjectBoardWorkflowSettingsUpdated({
      boardId: board.id,
      workflowPath: join(workspacePath, "WORKFLOW.md"),
      previousWorkflowHash: "old-workflow-hash",
      workflowHash: "new-workflow-hash",
      backupPath: join(workspacePath, ".ambient-codex", "orchestration", "workflow-settings", "WORKFLOW-backup.md"),
      changedFields: ["orchestration.auto_dispatch", "proof_of_work.require_screenshots"],
      diff: "diff --git a/WORKFLOW.md b/WORKFLOW.md\n-  auto_dispatch: true\n+  auto_dispatch: false",
      status: "ready",
      createdAt: "2026-05-16T13:00:00.000Z",
    });

    expect(result.recorded).toBe(true);
    const event = store.getActiveProjectBoard()!.events!.find((candidate) => candidate.kind === "workflow_settings_updated");
    expect(event).toMatchObject({
      kind: "workflow_settings_updated",
      title: "WORKFLOW.md settings updated",
      metadata: expect.objectContaining({
        changedFields: ["orchestration.auto_dispatch", "proof_of_work.require_screenshots"],
        workflowHash: "new-workflow-hash",
        previousWorkflowHash: "old-workflow-hash",
        status: "ready",
        modelCallRequired: false,
      }),
    });
  });

  it("records raw workflow edits in the board event ledger", () => {
    const board = store.createProjectBoard({ title: "Workflow raw board" });

    const result = store.recordProjectBoardWorkflowRawUpdated({
      boardId: board.id,
      workflowPath: join(workspacePath, "WORKFLOW.md"),
      previousWorkflowHash: "old-workflow-hash",
      workflowHash: "new-workflow-hash",
      backupPath: join(workspacePath, ".ambient-codex", "orchestration", "workflow-raw-edits", "WORKFLOW-backup.md"),
      changed: true,
      diff: "diff --git a/WORKFLOW.md b/WORKFLOW.md\n-Prompt\n+Prompt with hook",
      status: "ready",
      createdAt: "2026-05-16T13:30:00.000Z",
    });

    expect(result.recorded).toBe(true);
    const event = store.getActiveProjectBoard()!.events!.find((candidate) => candidate.kind === "workflow_raw_updated");
    expect(event).toMatchObject({
      kind: "workflow_raw_updated",
      title: "WORKFLOW.md raw edit saved",
      metadata: expect.objectContaining({
        changed: true,
        workflowHash: "new-workflow-hash",
        previousWorkflowHash: "old-workflow-hash",
        backupPath: expect.stringContaining("workflow-raw-edits"),
        status: "ready",
        modelCallRequired: false,
        existingCardsRewritten: false,
      }),
    });
  });

  it("updates orchestration run lifecycle metadata", () => {
    const task = store.createOrchestrationTask({ title: "Run me" });
    const run = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: "/tmp/work" });

    const running = store.updateOrchestrationRun({ id: run.id, status: "running", threadId: "thread-1" });
    const completed = store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: "thread-1",
      piSessionFile: "/tmp/session.jsonl",
      proofOfWork: { changedFiles: [] },
      finish: true,
    });

    expect(running).toMatchObject({ status: "running", threadId: "thread-1" });
    expect(completed).toMatchObject({
      status: "completed",
      threadId: "thread-1",
      piSessionFile: "/tmp/session.jsonl",
      proofOfWork: { changedFiles: [] },
    });
    expect(completed.finishedAt).toBeTruthy();
  });

  it("marks persisted active orchestration runs as resumable after desktop restart", () => {
    const task = store.createOrchestrationTask({ title: "Recover me" });
    const run = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: "/tmp/work" });
    store.updateOrchestrationRun({ id: run.id, status: "running", threadId: "thread-1" });

    expect(store.stallActiveOrchestrationRuns()).toBe(1);

    expect(store.getOrchestrationRun(run.id)).toMatchObject({
      status: "stalled",
      error: "Ambient Desktop restarted before this Local Task run finished.",
      proofOfWork: expect.objectContaining({
        resumeAvailable: true,
        recovery: expect.objectContaining({
          type: "desktop-restart",
          resumeAvailable: true,
          reason: "Ambient Desktop restarted before this Local Task run finished.",
        }),
      }),
    });
    expect(store.getOrchestrationTask(task.id).state).toBe("needs_info");
  });

  it("persists workflow artifacts, runs, and ordered run events", () => {
    const artifact = store.createWorkflowArtifact({
      id: "local-health-check",
      title: "Local health check",
      status: "ready_for_preview",
      manifest: {
        tools: ["bash", "browser_screenshot", "ambient.responses"],
        mutationPolicy: "read_only",
        maxToolCalls: 20,
      },
      spec: {
        goal: "Run deterministic local project checks.",
        successCriteria: ["Tests complete", "Audit report is written"],
      },
      sourcePath: ".ambient-codex/workflows/local-health-check/main.ts",
      statePath: ".ambient-codex/workflows/local-health-check/state.sqlite",
    });

    expect(artifact).toMatchObject({
      id: "local-health-check",
      status: "ready_for_preview",
      manifest: {
        tools: ["bash", "browser_screenshot", "ambient.responses"],
        mutationPolicy: "read_only",
      },
      spec: {
        goal: "Run deterministic local project checks.",
      },
    });

    const updated = store.updateWorkflowArtifact({
      id: artifact.id,
      status: "approved",
      spec: { ...artifact.spec, summary: "Check the repo and write evidence." },
    });
    expect(updated).toMatchObject({ status: "approved", spec: { summary: "Check the repo and write evidence." } });

    const run = store.startWorkflowRun({
      artifactId: artifact.id,
      status: "previewed",
      graphSnapshotId: "graph-1",
      providerHealth: {
        status: "ok",
        providerEventCount: 2,
        providerProgressEventCount: 0,
        providerErrorEventCount: 0,
        latestProviderEventType: "ambient.call.end",
      },
      retryMetadata: {
        retryEventCount: 0,
        providerRetryEventCount: 0,
        recoveryAttemptCount: 0,
      },
    });
    const dryRun = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
    const first = store.appendWorkflowRunEvent({
      runId: run.id,
      type: "step.start",
      message: "Starting project inspection.",
      data: { step: "inspect", graphNodeId: "inspect-node" },
    });
    const second = store.appendWorkflowRunEvent({
      runId: run.id,
      type: "step.end",
      graphNodeId: "inspect-node",
      graphEdgeId: "inspect-to-report",
      data: { step: "inspect", ok: true },
    });

    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(store.listWorkflowRunEvents(run.id)).toEqual([
      expect.objectContaining({ seq: 1, type: "step.start", graphNodeId: "inspect-node", data: { step: "inspect", graphNodeId: "inspect-node" } }),
      expect.objectContaining({ seq: 2, type: "step.end", graphNodeId: "inspect-node", graphEdgeId: "inspect-to-report", data: { step: "inspect", ok: true } }),
    ]);

    const completed = store.updateWorkflowRun({
      id: run.id,
      status: "succeeded",
      reportPath: ".ambient-codex/workflows/local-health-check/reports/run.md",
      retryMetadata: {
        retryEventCount: 1,
        providerRetryEventCount: 0,
        recoveryAttemptCount: 1,
        latestRecoveryAction: "retry_step",
      },
    });
    expect(completed).toMatchObject({
      status: "succeeded",
      reportPath: ".ambient-codex/workflows/local-health-check/reports/run.md",
      graphSnapshotId: "graph-1",
      providerHealth: expect.objectContaining({ status: "ok", latestProviderEventType: "ambient.call.end" }),
      retryMetadata: expect.objectContaining({ recoveryAttemptCount: 1, latestRecoveryAction: "retry_step" }),
    });
    expect(completed.completedAt).toBeTruthy();
    expect(store.listWorkflowRuns(artifact.id).map((item) => item.id)).toEqual([dryRun.id, run.id]);
  });

  it("persists workflow model calls for audit and replay", () => {
    const artifact = store.createWorkflowArtifact({
      title: "Classify failures",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Classify test failures." },
      sourcePath: ".ambient-codex/workflows/classify/main.ts",
      statePath: ".ambient-codex/workflows/classify/state.sqlite",
    });
    const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
    const call = store.recordWorkflowModelCall({
      runId: run.id,
      task: "classify.failure",
      status: "succeeded",
      input: { text: "expected true, got false" },
      output: { category: "bug", confidence: 0.9 },
      cacheKey: JSON.stringify(["classify.failure", "case-1"]),
      cacheCheckpoint: {
        id: "workflow-cache-runtime-test",
        stage: "runtime_call",
        workflowThreadId: "workflow-thread-1",
        stablePrefixHash: "stable-hash",
        stablePrefixChars: 16,
        stablePrefixEstimatedTokens: 4,
        mutableSuffixHash: "mutable-hash",
        mutableSuffixChars: 24,
        mutableSuffixEstimatedTokens: 6,
        requestHash: "request-hash",
        requestEstimatedTokens: 10,
        boundaryLabel: "Runtime boundary",
        createdAt: "2026-04-30T00:00:00.000Z",
      },
      model: "ambient-test",
      graphNodeId: "classify-node",
      itemKey: "case-1",
      startedAt: "2026-04-30T00:00:00.000Z",
      completedAt: "2026-04-30T00:00:00.120Z",
    });

    expect(call).toMatchObject({
      runId: run.id,
      artifactId: artifact.id,
      task: "classify.failure",
      status: "succeeded",
      input: { text: "expected true, got false" },
      output: { category: "bug", confidence: 0.9 },
      cacheCheckpoint: expect.objectContaining({
        id: "workflow-cache-runtime-test",
        stage: "runtime_call",
        stablePrefixHash: "stable-hash",
      }),
      model: "ambient-test",
      graphNodeId: "classify-node",
      itemKey: "case-1",
      latencyMs: 120,
    });
    expect(store.listWorkflowModelCalls({ runId: run.id })).toEqual([expect.objectContaining({ id: call.id })]);
    expect(store.listWorkflowModelCalls({ artifactId: artifact.id })).toEqual([expect.objectContaining({ id: call.id })]);
  });

  it("compacts expired debug workflow trace payloads after the retention window", () => {
    const debugThread = store.createWorkflowAgentThreadSummary({
      initialRequest: "Debug trace workflow.",
      traceMode: "debug",
    });
    const debugArtifact = store.createWorkflowArtifact({
      workflowThreadId: debugThread.id,
      title: "Debug trace workflow",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Capture debug traces." },
      sourcePath: ".ambient-codex/workflows/debug-trace/main.ts",
      statePath: ".ambient-codex/workflows/debug-trace/state.sqlite",
    });
    const productionThread = store.createWorkflowAgentThreadSummary({
      initialRequest: "Production trace workflow.",
      traceMode: "production",
    });
    const productionArtifact = store.createWorkflowArtifact({
      workflowThreadId: productionThread.id,
      title: "Production trace workflow",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Capture production traces." },
      sourcePath: ".ambient-codex/workflows/production-trace/main.ts",
      statePath: ".ambient-codex/workflows/production-trace/state.sqlite",
    });
    const debugRun = store.startWorkflowRun({ artifactId: debugArtifact.id, status: "running" });
    const productionRun = store.startWorkflowRun({ artifactId: productionArtifact.id, status: "running" });

    store.appendWorkflowRunEvent({
      runId: debugRun.id,
      type: "step.end",
      createdAt: "2026-03-20T00:00:00.000Z",
      data: { retained: "verbose debug input" },
    });
    store.appendWorkflowRunEvent({
      runId: debugRun.id,
      type: "step.end",
      createdAt: "2026-04-20T00:00:00.000Z",
      data: { retained: "fresh debug input" },
    });
    store.appendWorkflowRunEvent({
      runId: productionRun.id,
      type: "step.end",
      createdAt: "2026-03-20T00:00:00.000Z",
      data: { retained: "audit-safe production summary" },
    });
    store.appendWorkflowRunEvent({
      runId: productionRun.id,
      type: "batch.item.end",
      itemKey: "item-1",
      createdAt: "2026-03-20T00:00:00.000Z",
      data: { retained: "verbose batch item" },
    });
    const debugCall = store.recordWorkflowModelCall({
      runId: debugRun.id,
      task: "debug.classify",
      status: "succeeded",
      input: { text: "sensitive debug prompt" },
      output: { label: "bug" },
      startedAt: "2026-03-20T00:00:00.000Z",
      completedAt: "2026-03-20T00:00:00.100Z",
    });
    const productionCall = store.recordWorkflowModelCall({
      runId: productionRun.id,
      task: "production.classify",
      status: "succeeded",
      input: { text: "redacted summary" },
      output: { label: "ok" },
      startedAt: "2026-03-20T00:00:00.000Z",
      completedAt: "2026-03-20T00:00:00.100Z",
    });

    const result = store.compactExpiredWorkflowTraceData({ now: "2026-05-02T00:00:00.000Z" });

    expect(result).toEqual({
      cutoff: "2026-04-02T00:00:00.000Z",
      eventsCompacted: 2,
      modelCallsCompacted: 1,
    });
    expect(store.listWorkflowRunEvents(debugRun.id).map((event) => event.data)).toEqual([
      expect.objectContaining({ retention: "compacted", reason: "workflow_trace_retention_expired" }),
      { retained: "fresh debug input" },
    ]);
    expect(store.listWorkflowRunEvents(productionRun.id).map((event) => event.data)).toEqual([
      { retained: "audit-safe production summary" },
      expect.objectContaining({ retention: "compacted", reason: "workflow_trace_retention_expired" }),
    ]);
    expect(store.getWorkflowModelCall(debugCall.id)).toMatchObject({
      input: expect.objectContaining({ retention: "compacted" }),
      output: expect.objectContaining({ retention: "compacted" }),
    });
    expect(store.getWorkflowModelCall(productionCall.id)).toMatchObject({
      input: { text: "redacted summary" },
      output: { label: "ok" },
    });
    expect(
      workflowTraceRetentionReviewModel({
        traceMode: "debug",
        events: store.listWorkflowRunEvents(debugRun.id),
        modelCalls: store.listWorkflowModelCalls({ runId: debugRun.id }),
      }),
    ).toMatchObject({
      value: "Debug trace, 30-day debug cleanup",
      retainedEvidenceCount: 1,
      compactedPayloadCount: 2,
      detail: "2 expired payloads compacted; 1 audit evidence item remains visible.",
    });
    expect(
      workflowTraceRetentionReviewModel({
        traceMode: "production",
        events: store.listWorkflowRunEvents(productionRun.id),
        modelCalls: store.listWorkflowModelCalls({ runId: productionRun.id }),
      }),
    ).toMatchObject({
      value: "Production trace, Essentials retained",
      retainedEvidenceCount: 2,
      compactedPayloadCount: 1,
      detail: "1 expired payload compacted; 2 audit evidence items remain visible.",
    });
  });
});

function installedProvider(input: {
  providerId: string;
  modelId: string;
}): ModelRuntimeInstalledProvider {
  return {
    schemaVersion: "ambient-model-runtime-installed-provider-v1",
    source: "settings-provider-onboarding",
    templateId: "generic-openai-compatible",
    enabled: true,
    installedAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    provider: {
      id: input.providerId,
      label: "Customer Router",
      locality: "cloud",
      secretRequirement: "user-secret",
      supportsStreaming: true,
      supportsTools: true,
      notes: ["Configured with authorization=sk-test-secret-12345678."],
    },
    profile: {
      schemaVersion: "ambient-model-runtime-profile-v1",
      profileId: `${input.providerId}:${input.modelId}`,
      providerId: input.providerId,
      modelId: input.modelId,
      label: input.modelId,
      selectableAsMain: true,
      selectableAsSubagent: true,
      available: true,
      contextWindowTokens: 128_000,
      supportsStreaming: true,
      toolUse: "ambient-tools",
      structuredOutput: "schema",
      supportsVision: false,
      supportsAudio: false,
      locality: "cloud",
      costClass: "metered",
      trustClass: "user-configured",
      privacyLabel: "User configured cloud provider",
      memoryClass: "remote",
      providerQuirks: ["Configured through Settings provider onboarding."],
    },
    secretRef: {
      schemaVersion: "ambient-model-runtime-installed-provider-secret-ref-v1",
      flow: "ambient_cli_secret_request",
      configured: true,
      label: "Desktop secret request",
    },
    // The runtime catalog is proof-first: profiles without passing capability probe
    // evidence are not selectable, so an installed provider fixture must carry a
    // passing probe report and eligibility for the template's required probes.
    probeReport: {
      schemaVersion: "ambient-model-provider-capability-probe-v1",
      templateId: "generic-openai-compatible",
      providerId: input.providerId,
      modelId: input.modelId,
      generatedAt: "2026-06-06T00:00:00.000Z",
      observations: [
        "streaming",
        "context_window",
        "structured_json",
        "schema_output",
        "tool_use",
        "latency",
        "error_shape",
        "reliability",
      ].map((probeId) => ({
        probeId,
        status: "passed",
        measuredAt: "2026-06-06T00:00:00.000Z",
      })),
    },
    eligibility: {
      schemaVersion: "ambient-model-provider-capability-eligibility-v1",
      providerId: input.providerId,
      modelId: input.modelId,
      templateId: "generic-openai-compatible",
      eligibleAsMain: true,
      eligibleAsSubagent: true,
      mainBlockers: [],
      subagentBlockers: [],
      warnings: [],
      diagnostics: [],
    },
  } as ModelRuntimeInstalledProvider;
}
