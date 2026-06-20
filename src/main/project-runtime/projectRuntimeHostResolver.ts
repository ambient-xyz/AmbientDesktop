export interface ProjectRuntimeHostResolverThread {
  id?: string;
  workspacePath: string;
}

export interface ProjectRuntimeHostResolverAutomationFolder {
  id: string;
  threads: Array<{ id: string }>;
}

export interface ProjectRuntimeHostResolverAutomationSchedule {
  id: string;
}

export interface ProjectRuntimeHostResolverOrchestrationBoard {
  runs: Array<{ workspacePath: string }>;
  tasks: Array<{ workspacePath?: string }>;
}

export interface ProjectRuntimeHostResolverStore {
  getThread(threadId: string): unknown;
  getWorkflowAgentThreadSummary(workflowThreadId: string): unknown;
  describeWorkflowRecording(workflowRecordingId: string, options?: { includeArchived: true }): unknown;
  getWorkflowLabRun(runId: string): unknown;
  getWorkflowDiscoveryQuestion(questionId: string): unknown;
  getWorkflowVersion(versionId: string): unknown;
  getPermissionGrant(grantId: string): unknown;
  listAutomationFolders(): ProjectRuntimeHostResolverAutomationFolder[];
  listAutomationSchedules(): ProjectRuntimeHostResolverAutomationSchedule[];
  getWorkflowRevision(revisionId: string): unknown;
  getWorkflowArtifact(artifactId: string): unknown;
  getPlannerPlanArtifact(artifactId: string): unknown;
  getMessageVoiceState(messageId: string): unknown;
  getWorkflowRun(runId: string): unknown;
  getCallableWorkflowTask(taskId: string): unknown;
  getSubagentRun(runId: string): unknown;
  getSubagentWaitBarrier(waitBarrierId: string): unknown;
  getOrchestrationTask(taskId: string): unknown;
  getOrchestrationRun(runId: string): unknown;
  listOrchestrationBoard(): ProjectRuntimeHostResolverOrchestrationBoard;
  getProjectArtifactWorkspacePath(): string;
  listThreads(): ProjectRuntimeHostResolverThread[];
}

export interface ProjectRuntimeHostResolverProbeStore<Store extends ProjectRuntimeHostResolverStore> {
  openWorkspace(workspacePath: string, options: { recoverActiveRuns: false; recoverOrchestrationRuns: false }): { path: string };
  close(): void;
  store: Store;
}

export interface ProjectRuntimeHostResolverHost<Store extends ProjectRuntimeHostResolverStore> {
  workspacePath: string;
  store: Store;
  terminals: {
    has(terminalId: string): boolean;
  };
}

export interface ProjectRuntimeHostPermissionGrantInput {
  threadId?: string;
  workflowThreadId?: string;
  projectPath?: string;
  workspacePath?: string;
}

export interface ProjectRuntimeHostAutomationScheduleTargetInput {
  targetKind: string;
  targetId: string;
}

export interface ProjectRuntimeHostResolverDependencies<
  Host extends ProjectRuntimeHostResolverHost<Store>,
  Store extends ProjectRuntimeHostResolverStore,
> {
  normalizeWorkspacePath(workspacePath: string): string;
  projectRuntimeHostList(): Host[];
  activeProjectRuntimeHost(): Host | undefined;
  requireActiveProjectRuntimeHost(): Host;
  ensureProjectRuntimeHostForWorkspacePath(workspacePath: string): Host;
  listRegisteredProjectPaths(): string[];
  existsSync(path: string): boolean;
  createProjectStore(): ProjectRuntimeHostResolverProbeStore<Store>;
}

export interface ProjectRuntimeHostResolver<
  Host extends ProjectRuntimeHostResolverHost<Store>,
  Store extends ProjectRuntimeHostResolverStore,
> {
  projectRuntimeHostForTerminal(terminalId: string): Host | undefined;
  projectRuntimeHostForThread(threadId: string): Host | undefined;
  requireProjectRuntimeHostForThread(threadId: string): Host;
  projectRuntimeHostForStoreRecord(assertRecordExists: (targetStore: Store) => void): Host | undefined;
  requireProjectRuntimeHostForStoreRecord(assertRecordExists: (targetStore: Store) => void): Host;
  requireProjectRuntimeHostForWorkflowThread(workflowThreadId: string): Host;
  requireProjectRuntimeHostForWorkflowRecording(workflowRecordingId: string): Host;
  requireProjectRuntimeHostForWorkflowLabRun(runId: string): Host;
  requireProjectRuntimeHostForWorkflowDiscoveryQuestion(questionId: string): Host;
  requireProjectRuntimeHostForWorkflowVersion(versionId: string): Host;
  projectRuntimeHostForKnownWorkspacePath(workspacePath: string): Host | undefined;
  requireProjectRuntimeHostForPermissionGrantInput(input: ProjectRuntimeHostPermissionGrantInput): Host;
  requireProjectRuntimeHostForPermissionGrant(grantId: string): Host;
  projectRuntimeHostsForAutomationFolder(folderId: string): Host[];
  requireProjectRuntimeHostForAutomationFolder(folderId: string, fallbackHost?: Host): Host;
  requireProjectRuntimeHostForAutomationThread(threadId: string): Host;
  requireProjectRuntimeHostForAutomationSchedule(scheduleId: string): Host;
  requireProjectRuntimeHostForAutomationScheduleTarget(input: ProjectRuntimeHostAutomationScheduleTargetInput, fallbackHost?: Host): Host;
  requireProjectRuntimeHostForWorkflowRevision(revisionId: string): Host;
  requireProjectRuntimeHostForWorkflowArtifact(artifactId: string): Host;
  requireProjectRuntimeHostForPlannerPlanArtifact(artifactId: string): Host;
  requireProjectRuntimeHostForMessageVoiceState(messageId: string): Host;
  projectRuntimeHostForWorkflowRun(runId: string): Host | undefined;
  requireProjectRuntimeHostForWorkflowRun(runId: string): Host;
  requireProjectRuntimeHostForCallableWorkflowTask(taskId: string): Host;
  requireProjectRuntimeHostForSubagentRun(runId: string): Host;
  requireProjectRuntimeHostForSubagentWaitBarrier(waitBarrierId: string): Host;
  requireProjectRuntimeHostForOrchestrationTask(taskId: string): Host;
  requireProjectRuntimeHostForOrchestrationRun(runId: string): Host;
  orchestrationBoardWorkspacePaths(board: ProjectRuntimeHostResolverOrchestrationBoard): string[];
  requireProjectRuntimeHostForOrchestrationWorkspace(workspacePath: string): Host;
}

export function createProjectRuntimeHostResolver<
  Host extends ProjectRuntimeHostResolverHost<Store>,
  Store extends ProjectRuntimeHostResolverStore,
>({
  normalizeWorkspacePath,
  projectRuntimeHostList,
  activeProjectRuntimeHost,
  requireActiveProjectRuntimeHost,
  ensureProjectRuntimeHostForWorkspacePath,
  listRegisteredProjectPaths,
  existsSync,
  createProjectStore,
}: ProjectRuntimeHostResolverDependencies<Host, Store>): ProjectRuntimeHostResolver<Host, Store> {
  function projectRuntimeHostForTerminal(terminalId: string): Host | undefined {
    return projectRuntimeHostList().find((host) => host.terminals.has(terminalId));
  }

  function projectRuntimeHostForThread(threadId: string): Host | undefined {
    return projectRuntimeHostList().find((host) => {
      try {
        host.store.getThread(threadId);
        return true;
      } catch {
        return false;
      }
    });
  }

  function requireProjectRuntimeHostForThread(threadId: string): Host {
    const host = projectRuntimeHostForThread(threadId);
    if (host) return host;
    const active = requireActiveProjectRuntimeHost();
    active.store.getThread(threadId);
    return active;
  }

  function projectRuntimeHostForStoreRecord(assertRecordExists: (targetStore: Store) => void): Host | undefined {
    const loadedHost = projectRuntimeHostList().find((host) => {
      try {
        assertRecordExists(host.store);
        return true;
      } catch {
        return false;
      }
    });
    if (loadedHost) return loadedHost;
    const active = activeProjectRuntimeHost();
    if (active) {
      try {
        assertRecordExists(active.store);
        return active;
      } catch {
        // Registered-project probing below can locate records that are not loaded yet.
      }
    }
    return projectRuntimeHostForRegisteredStoreRecord(assertRecordExists);
  }

  function projectRuntimeHostForRegisteredStoreRecord(assertRecordExists: (targetStore: Store) => void): Host | undefined {
    const loadedPaths = new Set(projectRuntimeHostList().map((host) => normalizeWorkspacePath(host.workspacePath)));
    const active = activeProjectRuntimeHost();
    if (active) loadedPaths.add(normalizeWorkspacePath(active.workspacePath));
    for (const workspacePath of listRegisteredProjectPaths()) {
      const normalized = normalizeWorkspacePath(workspacePath);
      if (loadedPaths.has(normalized) || !existsSync(normalized)) continue;
      const probe = createProjectStore();
      try {
        const workspace = probe.openWorkspace(normalized, {
          recoverActiveRuns: false,
          recoverOrchestrationRuns: false,
        });
        assertRecordExists(probe.store);
        return ensureProjectRuntimeHostForWorkspacePath(workspace.path);
      } catch {
        // Most registered projects will not own the requested record.
      } finally {
        probe.close();
      }
    }
    return undefined;
  }

  function requireProjectRuntimeHostForStoreRecord(assertRecordExists: (targetStore: Store) => void): Host {
    const host = projectRuntimeHostForStoreRecord(assertRecordExists);
    if (host) return host;
    const active = requireActiveProjectRuntimeHost();
    assertRecordExists(active.store);
    return active;
  }

  function requireProjectRuntimeHostForWorkflowThread(workflowThreadId: string): Host {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      targetStore.getWorkflowAgentThreadSummary(workflowThreadId);
    });
  }

  function requireProjectRuntimeHostForWorkflowRecording(workflowRecordingId: string): Host {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      targetStore.describeWorkflowRecording(workflowRecordingId, { includeArchived: true });
    });
  }

  function requireProjectRuntimeHostForWorkflowLabRun(runId: string): Host {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      targetStore.getWorkflowLabRun(runId);
    });
  }

  function requireProjectRuntimeHostForWorkflowDiscoveryQuestion(questionId: string): Host {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      targetStore.getWorkflowDiscoveryQuestion(questionId);
    });
  }

  function requireProjectRuntimeHostForWorkflowVersion(versionId: string): Host {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      targetStore.getWorkflowVersion(versionId);
    });
  }

  function projectRuntimeHostForKnownWorkspacePath(workspacePath: string): Host | undefined {
    const normalized = normalizeWorkspacePath(workspacePath);
    return projectRuntimeHostList().find((host) => {
      if (normalizeWorkspacePath(host.workspacePath) === normalized) return true;
      if (normalizeWorkspacePath(host.store.getProjectArtifactWorkspacePath()) === normalized) return true;
      return host.store.listThreads().some((thread) => normalizeWorkspacePath(thread.workspacePath) === normalized);
    });
  }

  function requireProjectRuntimeHostForPermissionGrantInput(input: ProjectRuntimeHostPermissionGrantInput): Host {
    if (input.threadId) return requireProjectRuntimeHostForThread(input.threadId);
    if (input.workflowThreadId) return requireProjectRuntimeHostForWorkflowThread(input.workflowThreadId);
    if (input.projectPath) return ensureProjectRuntimeHostForWorkspacePath(input.projectPath);
    if (input.workspacePath) {
      const host = projectRuntimeHostForKnownWorkspacePath(input.workspacePath);
      if (host) return host;
    }
    return requireActiveProjectRuntimeHost();
  }

  function requireProjectRuntimeHostForPermissionGrant(grantId: string): Host {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      targetStore.getPermissionGrant(grantId);
    });
  }

  function projectRuntimeHostsForAutomationFolder(folderId: string): Host[] {
    return projectRuntimeHostList().filter((host) => host.store.listAutomationFolders().some((folder) => folder.id === folderId));
  }

  function requireProjectRuntimeHostForAutomationFolder(folderId: string, fallbackHost = requireActiveProjectRuntimeHost()): Host {
    const hosts = projectRuntimeHostsForAutomationFolder(folderId);
    if (hosts.length === 1) return hosts[0];
    if (hosts.includes(fallbackHost)) return fallbackHost;
    if (hosts.length > 1) throw new Error(`Automation folder is ambiguous across loaded projects: ${folderId}`);
    if (!fallbackHost.store.listAutomationFolders().some((folder) => folder.id === folderId)) {
      throw new Error(`Automation folder not found: ${folderId}`);
    }
    return fallbackHost;
  }

  function requireProjectRuntimeHostForAutomationThread(threadId: string): Host {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      const found = targetStore.listAutomationFolders().some((folder) => folder.threads.some((thread) => thread.id === threadId));
      if (!found) throw new Error(`Automation thread not found: ${threadId}`);
    });
  }

  function requireProjectRuntimeHostForAutomationSchedule(scheduleId: string): Host {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      const found = targetStore.listAutomationSchedules().some((schedule) => schedule.id === scheduleId);
      if (!found) throw new Error(`Automation schedule not found: ${scheduleId}`);
    });
  }

  function requireProjectRuntimeHostForAutomationScheduleTarget(
    input: ProjectRuntimeHostAutomationScheduleTargetInput,
    fallbackHost = requireActiveProjectRuntimeHost(),
  ): Host {
    if (input.targetKind === "local_task") return requireProjectRuntimeHostForOrchestrationTask(input.targetId);
    if (input.targetKind === "workflow_playbook") {
      return requireProjectRuntimeHostForStoreRecord((targetStore) => {
        targetStore.describeWorkflowRecording(input.targetId);
      });
    }
    if (input.targetKind === "workflow_thread") return requireProjectRuntimeHostForWorkflowThread(input.targetId);
    if (input.targetKind === "workflow_version") return requireProjectRuntimeHostForWorkflowVersion(input.targetId);
    if (input.targetKind === "workflow_artifact") return requireProjectRuntimeHostForWorkflowArtifact(input.targetId);
    return requireProjectRuntimeHostForAutomationFolder(input.targetId, fallbackHost);
  }

  function requireProjectRuntimeHostForWorkflowRevision(revisionId: string): Host {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      targetStore.getWorkflowRevision(revisionId);
    });
  }

  function requireProjectRuntimeHostForWorkflowArtifact(artifactId: string): Host {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      targetStore.getWorkflowArtifact(artifactId);
    });
  }

  function requireProjectRuntimeHostForPlannerPlanArtifact(artifactId: string): Host {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      targetStore.getPlannerPlanArtifact(artifactId);
    });
  }

  function requireProjectRuntimeHostForMessageVoiceState(messageId: string): Host {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      const voiceState = targetStore.getMessageVoiceState(messageId);
      if (!voiceState) throw new Error(`Voice state not found for message: ${messageId}`);
    });
  }

  function projectRuntimeHostForWorkflowRun(runId: string): Host | undefined {
    return projectRuntimeHostForStoreRecord((targetStore) => {
      targetStore.getWorkflowRun(runId);
    });
  }

  function requireProjectRuntimeHostForWorkflowRun(runId: string): Host {
    const host = projectRuntimeHostForWorkflowRun(runId);
    if (host) return host;
    const active = requireActiveProjectRuntimeHost();
    active.store.getWorkflowRun(runId);
    return active;
  }

  function requireProjectRuntimeHostForCallableWorkflowTask(taskId: string): Host {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      targetStore.getCallableWorkflowTask(taskId);
    });
  }

  function requireProjectRuntimeHostForSubagentRun(runId: string): Host {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      targetStore.getSubagentRun(runId);
    });
  }

  function requireProjectRuntimeHostForSubagentWaitBarrier(waitBarrierId: string): Host {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      targetStore.getSubagentWaitBarrier(waitBarrierId);
    });
  }

  function requireProjectRuntimeHostForOrchestrationTask(taskId: string): Host {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      targetStore.getOrchestrationTask(taskId);
    });
  }

  function requireProjectRuntimeHostForOrchestrationRun(runId: string): Host {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      targetStore.getOrchestrationRun(runId);
    });
  }

  function orchestrationBoardWorkspacePaths(board: ProjectRuntimeHostResolverOrchestrationBoard): string[] {
    return [
      ...board.runs.map((run) => run.workspacePath),
      ...board.tasks.map((task) => task.workspacePath).filter((path): path is string => Boolean(path)),
    ];
  }

  function requireProjectRuntimeHostForOrchestrationWorkspace(workspacePath: string): Host {
    const normalized = normalizeWorkspacePath(workspacePath);
    const host = projectRuntimeHostList().find((candidate) => {
      const board = candidate.store.listOrchestrationBoard();
      return orchestrationBoardWorkspacePaths(board).some((candidatePath) => normalizeWorkspacePath(candidatePath) === normalized);
    });
    if (host) return host;
    const active = requireActiveProjectRuntimeHost();
    const board = active.store.listOrchestrationBoard();
    const allowed = orchestrationBoardWorkspacePaths(board).some((candidatePath) => normalizeWorkspacePath(candidatePath) === normalized);
    if (!allowed) throw new Error("Workspace is not associated with a local orchestration task.");
    return active;
  }

  return {
    projectRuntimeHostForTerminal,
    projectRuntimeHostForThread,
    requireProjectRuntimeHostForThread,
    projectRuntimeHostForStoreRecord,
    requireProjectRuntimeHostForStoreRecord,
    requireProjectRuntimeHostForWorkflowThread,
    requireProjectRuntimeHostForWorkflowRecording,
    requireProjectRuntimeHostForWorkflowLabRun,
    requireProjectRuntimeHostForWorkflowDiscoveryQuestion,
    requireProjectRuntimeHostForWorkflowVersion,
    projectRuntimeHostForKnownWorkspacePath,
    requireProjectRuntimeHostForPermissionGrantInput,
    requireProjectRuntimeHostForPermissionGrant,
    projectRuntimeHostsForAutomationFolder,
    requireProjectRuntimeHostForAutomationFolder,
    requireProjectRuntimeHostForAutomationThread,
    requireProjectRuntimeHostForAutomationSchedule,
    requireProjectRuntimeHostForAutomationScheduleTarget,
    requireProjectRuntimeHostForWorkflowRevision,
    requireProjectRuntimeHostForWorkflowArtifact,
    requireProjectRuntimeHostForPlannerPlanArtifact,
    requireProjectRuntimeHostForMessageVoiceState,
    projectRuntimeHostForWorkflowRun,
    requireProjectRuntimeHostForWorkflowRun,
    requireProjectRuntimeHostForCallableWorkflowTask,
    requireProjectRuntimeHostForSubagentRun,
    requireProjectRuntimeHostForSubagentWaitBarrier,
    requireProjectRuntimeHostForOrchestrationTask,
    requireProjectRuntimeHostForOrchestrationRun,
    orchestrationBoardWorkspacePaths,
    requireProjectRuntimeHostForOrchestrationWorkspace,
  };
}
