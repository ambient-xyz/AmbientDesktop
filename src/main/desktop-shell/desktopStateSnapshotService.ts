import type { AppInfo, DesktopState, ProviderStatus } from "../../shared/desktopTypes";
import type { ProjectSummary } from "../../shared/projectBoardTypes";
import type { RunStatus } from "../../shared/threadTypes";

export type DesktopStateSnapshotReadOptions = { markActiveRead?: boolean };

type DesktopThreadSummary = DesktopState["threads"][number];
type DesktopWorkspaceState = DesktopState["workspace"];
type DesktopProjectSummary = DesktopState["projects"][number];
type DesktopProjectBoard = DesktopProjectSummary["board"];
type DesktopSettings = DesktopState["settings"];
type DesktopStateFeatureFlagSnapshot = DesktopState["featureFlagSnapshot"];
type DesktopSubagentRun = DesktopState["subagentRuns"][number];

export interface DesktopStateSnapshotStore {
  listThreads(): DesktopThreadSummary[];
  listAutomationThreadChatIds(): string[];
  listWorkflowAgentThreadChatIds(): string[];
  getLastActiveThreadId(): string | undefined;
  markThreadRead(threadId: string): void;
  getThread(threadId: string): DesktopThreadSummary;
  getSubagentRun(runId: string): DesktopSubagentRun;
  listSubagentRunsForParentThread(threadId: string): DesktopState["subagentRuns"];
  listSubagentRunEvents(runId: string): DesktopState["subagentRunEvents"];
  listSubagentMailboxEvents(runId: string): DesktopState["subagentMailboxEvents"];
  listSubagentToolScopeSnapshots(runId: string): DesktopState["subagentToolScopeSnapshots"];
  listSubagentWaitBarriersForParentRun(parentRunId: string): DesktopState["subagentWaitBarriers"];
  listSubagentParentMailboxEventsForParentThread(threadId: string): DesktopState["subagentParentMailboxEvents"];
  listSubagentParentMailboxEventsForParentRun(parentRunId: string): DesktopState["subagentParentMailboxEvents"];
  listCallableWorkflowTasksForParentThread(threadId: string): DesktopState["callableWorkflowTasks"];
  getWorkspace(): DesktopWorkspaceState;
  getSubagentMaturitySnapshot(input: {
    createdAt: string;
    featureFlags: DesktopStateFeatureFlagSnapshot;
  }): DesktopState["subagentMaturity"];
  listSubagentMaturityEvidence(): DesktopState["subagentMaturityEvidence"];
  getSubagentRepairDiagnostics(input: { now: string }): DesktopState["subagentRepairDiagnostics"];
  getFeatureFlagSettings(): DesktopSettings["featureFlags"];
  listAutomationFolders(): DesktopState["automationFolders"];
  listMessages(threadId: string): DesktopState["messages"];
  listRecentMessages(threadId: string, limit: number): DesktopState["messages"];
  countMessages(threadId: string): number;
  listMessageVoiceStates(threadId: string): Array<DesktopState["messageVoiceStates"][string]>;
  listPlannerPlanArtifacts(threadId: string): DesktopState["plannerPlanArtifacts"];
  getMemorySettings(): DesktopSettings["memory"];
  getModelRuntimeSettings(): DesktopSettings["modelRuntime"];
  getCompactionSettings(): DesktopSettings["compaction"];
  getLatestContextUsageSnapshot(threadId: string): DesktopState["contextUsage"];
  getThreadGoal(threadId: string): DesktopState["activeThreadGoal"];
  listActiveRuns(): Array<{ threadId: string; status: string }>;
}

export interface DesktopStateSnapshotSettingsSlots {
  voiceSettingsAudit: DesktopState["voiceSettingsAudit"];
  thinkingDisplay: DesktopSettings["thinkingDisplay"];
  media: DesktopSettings["media"];
  planner: DesktopSettings["planner"];
  search: DesktopSettings["search"];
  localDeepResearch: DesktopSettings["localDeepResearch"];
  voice: DesktopSettings["voice"];
  stt: DesktopSettings["stt"];
}

export interface DesktopStateSnapshotServiceDependencies<Store extends DesktopStateSnapshotStore> {
  activeThreadId(): string;
  setActiveThreadId(threadId: string): void;
  store(): Store;
  appInfo(): AppInfo;
  appearance(): DesktopState["appearance"];
  workspaceStateForThread(thread: DesktopThreadSummary, store: Store): DesktopState["activeWorkspace"];
  currentFeatureFlagSnapshot(store: Store): DesktopStateFeatureFlagSnapshot;
  isSubagentUiEnabled(snapshot: DesktopStateFeatureFlagSnapshot): boolean;
  providerCatalog(): DesktopState["providerCatalog"];
  activeProjectBoardForState(store: Store, threadId: string): DesktopProjectBoard | undefined;
  activeProjectSummary(
    workspace: DesktopWorkspaceState,
    threads: DesktopThreadSummary[],
    board?: DesktopProjectBoard,
  ): DesktopProjectSummary;
  listProjects(workspacePath: string, activeProject: DesktopProjectSummary): ProjectSummary[];
  listGlobalWorkflowAgentFolders(): DesktopState["workflowAgentFolders"];
  listGlobalWorkflowRecordingLibrary(input: { includeDisabled: boolean; limit: number }): DesktopState["workflowRecordingLibrary"];
  settingsSlots(): DesktopStateSnapshotSettingsSlots;
  currentModelRuntimeCatalog(generatedAt: string, store: Store): DesktopSettings["modelCatalog"];
  providerStatus(model: string): ProviderStatus;
  secureStorageStatus(): DesktopState["secureStorage"];
  secureStorageRepair(): DesktopState["secureStorageRepair"];
  namedSecrets(): DesktopState["namedSecrets"];
  queueState(threadId: string): DesktopState["queue"];
  sttQueueState(workspacePath: string): DesktopState["sttQueue"];
  sttDiagnostics(workspacePath: string): DesktopState["sttDiagnostics"];
}

export interface DesktopStateSnapshotService {
  readState(threadId?: string, options?: DesktopStateSnapshotReadOptions): DesktopState;
  activeThreadRunStatuses(): Record<string, RunStatus>;
}

const ACTIVE_THREAD_RUN_STATUSES = new Set<string>(["starting", "streaming", "tool"]);
export const DESKTOP_STATE_MESSAGE_WINDOW_LIMIT = 250;

function isActiveThreadRunStatus(status: string): status is RunStatus {
  return ACTIVE_THREAD_RUN_STATUSES.has(status);
}

export function createDesktopStateSnapshotService<Store extends DesktopStateSnapshotStore>(
  dependencies: DesktopStateSnapshotServiceDependencies<Store>,
): DesktopStateSnapshotService {
  let stateRevision = 0;

  function activeThreadRunStatuses(): Record<string, RunStatus> {
    return Object.fromEntries(
      dependencies
        .store()
        .listActiveRuns()
        .filter((run): run is { threadId: string; status: RunStatus } => isActiveThreadRunStatus(run.status))
        .map((run) => [run.threadId, run.status]),
    );
  }

  function readState(threadId = dependencies.activeThreadId(), options: DesktopStateSnapshotReadOptions = {}): DesktopState {
    const store = dependencies.store();
    const markActiveRead = options.markActiveRead ?? true;
    const featureFlagSnapshot = dependencies.currentFeatureFlagSnapshot(store);
    const subagentUiEnabled = dependencies.isSubagentUiEnabled(featureFlagSnapshot);
    let threads = store.listThreads().filter((thread) => subagentUiEnabled || thread.kind !== "subagent_child");
    let automationThreadChatIds = Array.from(
      new Set([...store.listAutomationThreadChatIds(), ...store.listWorkflowAgentThreadChatIds()]),
    );
    const visibleThreads = threads.filter((thread) => !automationThreadChatIds.includes(thread.id));
    const persistedThreadId = store.getLastActiveThreadId();
    const preferredThreadId = threadId || persistedThreadId || "";
    const active = visibleThreads.some((thread) => thread.id === preferredThreadId)
      ? preferredThreadId
      : persistedThreadId && visibleThreads.some((thread) => thread.id === persistedThreadId)
        ? persistedThreadId
        : visibleThreads[0]?.id ?? threads[0]?.id;
    if (!active) throw new Error("No active thread");
    dependencies.setActiveThreadId(active);
    if (markActiveRead) store.markThreadRead(active);

    threads = store.listThreads().filter((thread) => subagentUiEnabled || thread.kind !== "subagent_child");
    automationThreadChatIds = Array.from(
      new Set([...store.listAutomationThreadChatIds(), ...store.listWorkflowAgentThreadChatIds()]),
    );
    const settings = store.getThread(active);
    const subagentRuns = subagentUiEnabled
      ? settings.kind === "subagent_child" && settings.subagentRunId
        ? [store.getSubagentRun(settings.subagentRunId)]
        : store.listSubagentRunsForParentThread(active)
      : [];
    const subagentRunEvents = subagentRuns.flatMap((run) => store.listSubagentRunEvents(run.id));
    const subagentMailboxEvents = subagentRuns.flatMap((run) => store.listSubagentMailboxEvents(run.id));
    const subagentToolScopeSnapshots = subagentRuns.flatMap((run) => store.listSubagentToolScopeSnapshots(run.id));
    const subagentWaitBarrierMap = new Map(
      subagentRuns
        .flatMap((run) => store.listSubagentWaitBarriersForParentRun(run.parentRunId))
        .map((barrier) => [barrier.id, barrier]),
    );
    const subagentWaitBarriers = [...subagentWaitBarrierMap.values()];
    const subagentParentMailboxEventMap = new Map(
      [
        ...(subagentUiEnabled && settings.kind !== "subagent_child"
          ? store.listSubagentParentMailboxEventsForParentThread(active)
          : []),
        ...subagentRuns.flatMap((run) => store.listSubagentParentMailboxEventsForParentRun(run.parentRunId)),
      ].map((event) => [event.id, event]),
    );
    const subagentParentMailboxEvents = [...subagentParentMailboxEventMap.values()];
    const callableWorkflowTasks =
      subagentUiEnabled && settings.kind !== "subagent_child" ? store.listCallableWorkflowTasksForParentThread(active) : [];
    const childThreadIds = Array.from(new Set(subagentRuns.map((run) => run.childThreadId).filter(Boolean)));
    const childMessagesByThreadId =
      subagentUiEnabled && settings.kind !== "subagent_child"
        ? Object.fromEntries(childThreadIds.map((childThreadId) => [childThreadId, store.listRecentMessages(childThreadId, DESKTOP_STATE_MESSAGE_WINDOW_LIMIT)]))
        : undefined;
    const workspace = store.getWorkspace();
    const subagentMaturity = store.getSubagentMaturitySnapshot({
      createdAt: featureFlagSnapshot.generatedAt,
      featureFlags: featureFlagSnapshot,
    });
    const subagentMaturityEvidence = store.listSubagentMaturityEvidence();
    const subagentRepairDiagnostics = subagentUiEnabled
      ? store.getSubagentRepairDiagnostics({ now: featureFlagSnapshot.generatedAt })
      : undefined;
    const activeWorkspace = dependencies.workspaceStateForThread(settings, store);
    const persistentFeatureFlags = store.getFeatureFlagSettings();
    const automationFolders = store.listAutomationFolders();
    const workflowAgentFolders = dependencies.listGlobalWorkflowAgentFolders();
    const workflowRecordingLibrary = dependencies.listGlobalWorkflowRecordingLibrary({ includeDisabled: true, limit: 50 });
    const projectThreads = threads.filter((thread) => !automationThreadChatIds.includes(thread.id));
    const activeProject = dependencies.activeProjectSummary(
      workspace,
      projectThreads,
      dependencies.activeProjectBoardForState(store, active),
    );
    const slots = dependencies.settingsSlots();
    const messages = store.listRecentMessages(active, DESKTOP_STATE_MESSAGE_WINDOW_LIMIT);
    const totalMessageCount = store.countMessages(active);
    return {
      stateRevision: ++stateRevision,
      app: dependencies.appInfo(),
      appearance: dependencies.appearance(),
      workspace,
      activeWorkspace,
      providerCatalog: dependencies.providerCatalog(),
      projects: dependencies.listProjects(workspace.path, activeProject),
      automationFolders,
      workflowAgentFolders,
      workflowRecordingLibrary,
      automationThreadChatIds,
      threads,
      activeThreadId: active,
      threadRunStatuses: activeThreadRunStatuses(),
      messages,
      messageWindow: {
        threadId: active,
        order: "latest",
        limit: DESKTOP_STATE_MESSAGE_WINDOW_LIMIT,
        loadedCount: messages.length,
        hasMoreBefore: totalMessageCount > messages.length,
      },
      childMessagesByThreadId,
      messageVoiceStates: Object.fromEntries(
        store.listMessageVoiceStates(active).map((voiceState) => [voiceState.messageId, voiceState]),
      ),
      voiceSettingsAudit: slots.voiceSettingsAudit,
      plannerPlanArtifacts: store.listPlannerPlanArtifacts(active),
      settings: {
        permissionMode: settings.permissionMode,
        collaborationMode: settings.collaborationMode,
        model: settings.model,
        featureFlags: persistentFeatureFlags,
        memory: store.getMemorySettings(),
        thinkingLevel: settings.thinkingLevel,
        thinkingDisplay: slots.thinkingDisplay,
        modelRuntime: store.getModelRuntimeSettings(),
        modelCatalog: dependencies.currentModelRuntimeCatalog(featureFlagSnapshot.generatedAt, store),
        compaction: store.getCompactionSettings(),
        media: slots.media,
        planner: slots.planner,
        search: slots.search,
        localDeepResearch: slots.localDeepResearch,
        voice: slots.voice,
        stt: slots.stt,
      },
      featureFlagSnapshot,
      subagentMaturity,
      subagentMaturityEvidence,
      subagentRuns,
      subagentRunEvents,
      subagentMailboxEvents,
      subagentToolScopeSnapshots,
      subagentWaitBarriers,
      subagentParentMailboxEvents,
      callableWorkflowTasks,
      subagentRepairDiagnostics,
      provider: dependencies.providerStatus(settings.model),
      secureStorage: dependencies.secureStorageStatus(),
      secureStorageRepair: dependencies.secureStorageRepair(),
      namedSecrets: dependencies.namedSecrets(),
      queue: dependencies.queueState(active),
      sttQueue: dependencies.sttQueueState(workspace.path),
      sttDiagnostics: dependencies.sttDiagnostics(workspace.path),
      contextUsage: store.getLatestContextUsageSnapshot(active),
      activeThreadGoal: store.getThreadGoal(active),
    };
  }

  return {
    readState,
    activeThreadRunStatuses,
  };
}
