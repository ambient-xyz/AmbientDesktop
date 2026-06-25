import { describe, expect, it, vi } from "vitest";
import type { DesktopState } from "../../shared/desktopTypes";
import type { RunStatus } from "../../shared/threadTypes";
import {
  createDesktopStateSnapshotService,
  DESKTOP_STATE_MESSAGE_WINDOW_LIMIT,
  type DesktopStateSnapshotStore,
} from "./desktopStateSnapshotService";

type Thread = DesktopState["threads"][number];
type Workspace = DesktopState["workspace"];
type SubagentRun = DesktopState["subagentRuns"][number];

function thread(id: string, overrides: Partial<Thread> = {}): Thread {
  return {
    id,
    title: id,
    workspacePath: "/workspace",
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient-test-model",
    thinkingLevel: "medium",
    ...overrides,
  };
}

function workspace(path = "/workspace"): Workspace {
  return {
    path,
    name: "Workspace",
    statePath: `${path}/.ambient`,
    sessionPath: `${path}/.ambient/sessions`,
  };
}

function appInfo(): DesktopState["app"] {
  return {
    name: "Ambient",
    version: "0.0.0-test",
    isPackaged: false,
    platform: "test",
    arch: "test",
    piVersions: {
      piAi: "test",
      piCodingAgent: "test",
    },
    update: {
      enabled: false,
      status: "disabled",
      currentVersion: "0.0.0-test",
      channel: "development",
      canCheck: false,
      canDownload: false,
      canInstall: false,
    },
    thirdPartyCredits: [],
  };
}

function createHarness(options: {
  activeThreadId?: string;
  automationThreadChatIds?: string[];
  workflowAgentThreadChatIds?: string[];
  lastActiveThreadId?: string;
  subagentUiEnabled?: boolean;
  threads?: Thread[];
  subagentRunsByParentThread?: Record<string, SubagentRun[]>;
  subagentRunById?: Record<string, SubagentRun>;
  messagesByThread?: Record<string, DesktopState["messages"]>;
  activeRuns?: Array<{ threadId: string; status: RunStatus }>;
} = {}) {
  let activeThreadId = options.activeThreadId ?? "";
  const threads = options.threads ?? [thread("thread-1")];
  const workspaceState = workspace();
  const featureFlagSnapshot = { generatedAt: "2026-06-19T00:00:00.000Z" } as DesktopState["featureFlagSnapshot"];
  const markThreadRead = vi.fn();
  const setActiveThreadId = vi.fn((threadId: string) => {
    activeThreadId = threadId;
  });
  const activeProjectSummary = vi.fn(
    (workspace: Workspace, projectThreads: Thread[], board?: DesktopState["projects"][number]["board"]) =>
      ({
        id: "project-workspace",
        ...workspace,
        createdAt: "2026-06-19T00:00:00.000Z",
        updatedAt: "2026-06-19T00:00:00.000Z",
        board,
        threads: projectThreads,
      }) as DesktopState["projects"][number],
  );
  const subagentRunsByParentThread = options.subagentRunsByParentThread ?? {};
  const subagentRunById = options.subagentRunById ?? {};
  const messagesByThread = options.messagesByThread ?? {};
  const listMessages = vi.fn((threadId: string) => messagesByThread[threadId] ?? []);
  const listRecentMessages = vi.fn((threadId: string, limit: number) => (messagesByThread[threadId] ?? []).slice(-limit));
  const countMessages = vi.fn((threadId: string) => (messagesByThread[threadId] ?? []).length);
  const store: DesktopStateSnapshotStore = {
    listThreads: () => threads,
    listAutomationThreadChatIds: () => options.automationThreadChatIds ?? [],
    listWorkflowAgentThreadChatIds: () => options.workflowAgentThreadChatIds ?? [],
    getLastActiveThreadId: () => options.lastActiveThreadId,
    markThreadRead,
    getThread: (threadId) => {
      const found = threads.find((candidate) => candidate.id === threadId);
      if (!found) throw new Error(`Missing thread ${threadId}`);
      return found;
    },
    getSubagentRun: (runId) => subagentRunById[runId],
    listSubagentRunsForParentThread: (threadId) => subagentRunsByParentThread[threadId] ?? [],
    listSubagentRunEvents: () => [],
    listSubagentMailboxEvents: () => [],
    listSubagentToolScopeSnapshots: () => [],
    listSubagentWaitBarriersForParentRun: () => [],
    listSubagentParentMailboxEventsForParentThread: () => [],
    listSubagentParentMailboxEventsForParentRun: () => [],
    listCallableWorkflowTasksForParentThread: () => [],
    getWorkspace: () => workspaceState,
    getSubagentMaturitySnapshot: () => ({}) as DesktopState["subagentMaturity"],
    listSubagentMaturityEvidence: () => [],
    getSubagentRepairDiagnostics: () => ({}) as DesktopState["subagentRepairDiagnostics"],
    getFeatureFlagSettings: () => ({}) as DesktopState["settings"]["featureFlags"],
    listAutomationFolders: () => [],
    listMessages,
    listRecentMessages,
    countMessages,
    listMessageVoiceStates: () => [],
    listPlannerPlanArtifacts: () => [],
    getMemorySettings: () => ({}) as DesktopState["settings"]["memory"],
    getModelRuntimeSettings: () => ({}) as DesktopState["settings"]["modelRuntime"],
    getCompactionSettings: () => ({}) as DesktopState["settings"]["compaction"],
    getLatestContextUsageSnapshot: () => undefined,
    getThreadGoal: () => undefined,
    listActiveRuns: () => options.activeRuns ?? [],
  };
  const service = createDesktopStateSnapshotService({
    activeThreadId: () => activeThreadId,
    setActiveThreadId,
    store: () => store,
    appInfo,
    appearance: () => ({ themePreference: "system", resolvedTheme: "light" }),
    workspaceStateForThread: (thread) => ({ ...workspaceState, path: thread.workspacePath }),
    currentFeatureFlagSnapshot: () => featureFlagSnapshot,
    isSubagentUiEnabled: () => options.subagentUiEnabled ?? false,
    providerCatalog: () => ({ catalogVersion: "test", generatedAt: featureFlagSnapshot.generatedAt, cards: [] }),
    activeProjectBoardForState: () => undefined,
    activeProjectSummary,
    listProjects: (_workspacePath, activeProject) => [activeProject],
    listGlobalWorkflowAgentFolders: () => [],
    listGlobalWorkflowRecordingLibrary: () => [],
    settingsSlots: () => ({
      voiceSettingsAudit: [],
      thinkingDisplay: { mode: "transient", showRunStatusCard: false },
      media: { generatedMediaAutoplay: false },
      planner: { autoFinalize: true },
      search: {},
      localDeepResearch: {} as DesktopState["settings"]["localDeepResearch"],
      voice: {} as DesktopState["settings"]["voice"],
      stt: {} as DesktopState["settings"]["stt"],
    }),
    currentModelRuntimeCatalog: () =>
      ({ generatedAt: featureFlagSnapshot.generatedAt, profiles: [] }) as unknown as DesktopState["settings"]["modelCatalog"],
    providerStatus: (model) => ({
      providerId: "ambient",
      providerLabel: "Ambient",
      baseUrl: "https://ambient.test",
      model,
      hasApiKey: false,
      source: "missing",
      storage: "none",
    }),
    secureStorageStatus: () => ({
      status: "ready",
      platform: "darwin",
      backend: "keychain",
      security: "os-encrypted",
      message: "Secure credential storage is backed by macOS Keychain.",
    }),
    secureStorageRepair: () => ({
      platform: "darwin",
      summary: "Secure OS credential storage is available.",
      commands: [],
      retryLabel: "Retry secure storage check",
    }),
    namedSecrets: () => [],
    queueState: (threadId) => ({ threadId, steering: [], followUp: [] }),
    sttQueueState: () => ({}) as DesktopState["sttQueue"],
    sttDiagnostics: () => [],
  });
  return {
    activeProjectSummary,
    countMessages,
    listMessages,
    listRecentMessages,
    markThreadRead,
    service,
    setActiveThreadId,
  };
}

describe("desktopStateSnapshotService", () => {
  it("preserves active thread fallback ordering and excludes automation threads from project summaries", () => {
    const automationThread = thread("automation");
    const firstVisible = thread("visible-1");
    const persistedVisible = thread("visible-2");
    const { activeProjectSummary, markThreadRead, service, setActiveThreadId } = createHarness({
      automationThreadChatIds: ["automation"],
      lastActiveThreadId: "visible-2",
      threads: [automationThread, firstVisible, persistedVisible],
    });

    const state = service.readState("missing");

    expect(state.activeThreadId).toBe("visible-2");
    expect(setActiveThreadId).toHaveBeenCalledWith("visible-2");
    expect(markThreadRead).toHaveBeenCalledWith("visible-2");
    expect(state.automationThreadChatIds).toEqual(["automation"]);
    expect(state.threads.map((candidate) => candidate.id)).toEqual(["automation", "visible-1", "visible-2"]);
    expect(activeProjectSummary).toHaveBeenCalledWith(
      expect.any(Object),
      [firstVisible, persistedVisible],
      undefined,
    );
  });

  it("does not mark active reads when disabled and filters subagent child threads while the UI is disabled", () => {
    const parent = thread("parent");
    const child = thread("child", { kind: "subagent_child", subagentRunId: "run-1" });
    const { markThreadRead, service, setActiveThreadId } = createHarness({
      activeThreadId: "child",
      subagentUiEnabled: false,
      threads: [parent, child],
    });

    const state = service.readState("child", { markActiveRead: false });

    expect(state.activeThreadId).toBe("parent");
    expect(state.threads).toEqual([parent]);
    expect(state.subagentRuns).toEqual([]);
    expect(state.childMessagesByThreadId).toBeUndefined();
    expect(setActiveThreadId).toHaveBeenCalledWith("parent");
    expect(markThreadRead).not.toHaveBeenCalled();
  });

  it("hydrates enabled parent subagent child messages through the state readout", () => {
    const parent = thread("parent");
    const child = thread("child", { kind: "subagent_child", subagentRunId: "run-1" });
    const run = {
      id: "run-1",
      parentRunId: "parent-run-1",
      childThreadId: "child",
    } as SubagentRun;
    const childMessages = [{ id: "message-1" }] as DesktopState["messages"];
    const { service } = createHarness({
      activeThreadId: "parent",
      subagentUiEnabled: true,
      threads: [parent, child],
      subagentRunsByParentThread: { parent: [run] },
      messagesByThread: { child: childMessages },
    });

    const state = service.readState("parent");

    expect(state.subagentRuns).toEqual([run]);
    expect(state.childMessagesByThreadId).toEqual({ child: childMessages });
  });

  it("uses a bounded recent message window for DesktopState payloads", () => {
    const messages = Array.from({ length: DESKTOP_STATE_MESSAGE_WINDOW_LIMIT + 10 }, (_, index) => ({
      id: `message-${index}`,
      threadId: "thread-1",
      role: "user",
      content: `Message ${index}`,
      createdAt: `2026-06-19T00:${String(index).padStart(2, "0")}:00.000Z`,
    })) as DesktopState["messages"];
    const { countMessages, listMessages, listRecentMessages, service } = createHarness({
      messagesByThread: { "thread-1": messages },
    });

    const state = service.readState("thread-1");

    expect(listMessages).not.toHaveBeenCalled();
    expect(listRecentMessages).toHaveBeenCalledWith("thread-1", DESKTOP_STATE_MESSAGE_WINDOW_LIMIT);
    expect(countMessages).toHaveBeenCalledWith("thread-1");
    expect(state.messages).toEqual(messages.slice(-DESKTOP_STATE_MESSAGE_WINDOW_LIMIT));
    expect(state.messageWindow).toEqual({
      threadId: "thread-1",
      order: "latest",
      limit: DESKTOP_STATE_MESSAGE_WINDOW_LIMIT,
      loadedCount: DESKTOP_STATE_MESSAGE_WINDOW_LIMIT,
      hasMoreBefore: true,
    });
  });

  it("keeps DesktopState payloads bounded for 10k message threads", () => {
    const messages = Array.from({ length: 10_000 }, (_, index) => ({
      id: `message-${index}`,
      threadId: "thread-1",
      role: "user",
      content: `Large thread message ${index}`,
      createdAt: new Date(Date.UTC(2026, 5, 19, 0, 0, index)).toISOString(),
    })) as DesktopState["messages"];
    const { countMessages, listMessages, listRecentMessages, service } = createHarness({
      messagesByThread: { "thread-1": messages },
    });

    const state = service.readState("thread-1");

    expect(listMessages).not.toHaveBeenCalled();
    expect(listRecentMessages).toHaveBeenCalledTimes(1);
    expect(countMessages).toHaveBeenCalledTimes(1);
    expect(state.messages).toHaveLength(DESKTOP_STATE_MESSAGE_WINDOW_LIMIT);
    expect(state.messages[0]?.id).toBe(`message-${10_000 - DESKTOP_STATE_MESSAGE_WINDOW_LIMIT}`);
    expect(state.messageWindow?.hasMoreBefore).toBe(true);
  });

  it("does not report earlier history for an exactly full bounded message window", () => {
    const messages = Array.from({ length: DESKTOP_STATE_MESSAGE_WINDOW_LIMIT }, (_, index) => ({
      id: `message-${index}`,
      threadId: "thread-1",
      role: "user",
      content: `Message ${index}`,
      createdAt: `2026-06-19T00:${String(index).padStart(2, "0")}:00.000Z`,
    })) as DesktopState["messages"];
    const { service } = createHarness({
      messagesByThread: { "thread-1": messages },
    });

    const state = service.readState("thread-1");

    expect(state.messages).toHaveLength(DESKTOP_STATE_MESSAGE_WINDOW_LIMIT);
    expect(state.messageWindow?.hasMoreBefore).toBe(false);
  });

  it("reports only user-visible active run statuses and increments state revisions per read", () => {
    const { service } = createHarness({
      activeRuns: [
        { threadId: "starting-thread", status: "starting" },
        { threadId: "streaming-thread", status: "streaming" },
        { threadId: "tool-thread", status: "tool" },
        { threadId: "retrying-thread", status: "retrying" },
        { threadId: "error-thread", status: "error" },
      ],
    });

    const firstState = service.readState("thread-1");
    const secondState = service.readState("thread-1");

    expect(firstState.threadRunStatuses).toEqual({
      "starting-thread": "starting",
      "streaming-thread": "streaming",
      "tool-thread": "tool",
    });
    expect(firstState.stateRevision).toBe(1);
    expect(secondState.stateRevision).toBe(2);
  });
});
