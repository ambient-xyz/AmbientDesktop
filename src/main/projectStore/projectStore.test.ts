import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectBoardPendingClarificationDecisions, projectBoardPiUpdateReviewQueue } from "../../renderer/src/projectBoardUiModel";
import type { ProjectBoardSynthesisDraft } from "./projectStoreProjectBoardFacade";
import { projectBoardArtifactExportFromSummary } from "./projectStoreProjectBoardFacade";
import { projectBoardArtifactProjectionFromFiles } from "./projectStoreProjectBoardFacade";
import { previewProjectBoardWorkflowRepair, repairProjectBoardWorkflow, updateProjectBoardWorkflowRaw, updateProjectBoardWorkflowSettings } from "./projectStoreProjectBoardFacade";
import { readOrchestrationWorkflowReadiness } from "./projectStoreOrchestrationFacade";
import { defaultOrchestrationProjectPath, defaultProjectArtifactWorkspacePath, ProjectStore } from "./projectStore";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { ModelRuntimeInstalledProvider } from "../../shared/threadTypes";

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
