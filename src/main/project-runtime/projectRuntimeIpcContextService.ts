import { basename, dirname, join, resolve } from "node:path";
import type { ProjectBoardSummary, ProjectSummary } from "../../shared/projectBoardTypes";
import { projectIdFromWorkspacePath } from "../../shared/projectIdentity";
import type { ThreadSummary } from "../../shared/threadTypes";

export interface ProjectRuntimeIpcWorkspace {
  path: string;
  name: string;
  statePath: string;
  sessionPath: string;
}

export interface ProjectRuntimeWorkflowThreadSummary {
  id: string;
  chatThreadId?: string;
  projectPath?: string;
}

export interface ProjectRuntimeWorkflowDiscoveryQuestion {
  workflowThreadId: string;
}

export interface ProjectRuntimeWorkflowArtifact {
  workflowThreadId?: string;
}

export interface ProjectRuntimeWorkflowRevision {
  id: string;
  workflowThreadId: string;
}

export interface ProjectRuntimeWorkflowDebugContext {
  workflowThreadId?: string;
}

export interface ProjectRuntimeIpcStore {
  getWorkspace(): ProjectRuntimeIpcWorkspace;
  listThreads(): ThreadSummary[];
  listAutomationThreadChatIds(): string[];
  listWorkflowAgentThreadChatIds(): string[];
  getActiveProjectBoard(threadId: string): ProjectBoardSummary | undefined;
  getThread(threadId: string): ThreadSummary;
  getLastActiveThreadId(): string | undefined;
  setLastActiveThreadId(threadId: string): void;
  getWorkflowAgentThreadSummary(workflowThreadId: string): ProjectRuntimeWorkflowThreadSummary;
  getWorkflowDiscoveryQuestion(questionId: string): ProjectRuntimeWorkflowDiscoveryQuestion;
  getWorkflowArtifact(artifactId: string): ProjectRuntimeWorkflowArtifact;
  getWorkflowRevision(revisionId: string): ProjectRuntimeWorkflowRevision;
}

export interface ProjectRuntimeIpcHost<Store extends ProjectRuntimeIpcStore, BrowserService> {
  workspacePath: string;
  store: Store;
  browserService: BrowserService;
  activeThreadId: string;
}

export interface ProjectRuntimeIpcProjectStoreHandle<Store extends ProjectRuntimeIpcStore> {
  openWorkspace(workspacePath: string): ProjectRuntimeIpcWorkspace;
  close(): void;
  store: Store;
}

export interface ProjectRuntimeIpcProjectRegistry {
  resolveProjectId(projectId: string, fallbackWorkspacePath: string): string;
  register(workspacePath: string): void;
  setDisplayName(workspacePath: string, displayName: string): void;
  listProjects(workspacePath: string, activeProject: ProjectSummary): ProjectSummary[];
}

export interface ProjectRuntimeActiveProjectIpcContext<
  Host,
  Store extends ProjectRuntimeIpcStore,
  BrowserService,
> {
  host: Host;
  targetStore: Store;
  targetBrowserService: BrowserService;
  thread: ThreadSummary;
}

export interface ProjectRuntimeWorkflowProjectIpcContext<
  Host,
  Store extends ProjectRuntimeIpcStore,
  BrowserService,
> extends ProjectRuntimeActiveProjectIpcContext<Host, Store, BrowserService> {
  projectPath: string;
}

export interface ProjectRuntimeWorkflowAgentIpcContext<
  Host,
  Store extends ProjectRuntimeIpcStore,
  BrowserService,
> extends ProjectRuntimeWorkflowProjectIpcContext<Host, Store, BrowserService> {
  workflowThread: ProjectRuntimeWorkflowThreadSummary;
}

export interface ProjectRuntimeWorkflowArtifactIpcContext<
  Host,
  Store extends ProjectRuntimeIpcStore,
  BrowserService,
> extends ProjectRuntimeWorkflowProjectIpcContext<Host, Store, BrowserService> {
  artifact: ProjectRuntimeWorkflowArtifact;
  workflowThread?: ProjectRuntimeWorkflowThreadSummary;
}

export interface ProjectRuntimeWorkflowDebugRewriteIpcContext<
  Host,
  Store extends ProjectRuntimeIpcStore,
  BrowserService,
  DebugContext extends ProjectRuntimeWorkflowDebugContext,
> extends ProjectRuntimeWorkflowAgentIpcContext<Host, Store, BrowserService> {
  debugContext: DebugContext;
}

export interface ProjectRuntimeIpcContextServiceDependencies<
  Host extends ProjectRuntimeIpcHost<Store, BrowserService>,
  Store extends ProjectRuntimeIpcStore,
  BrowserService,
  State,
  DebugContext extends ProjectRuntimeWorkflowDebugContext,
> {
  activeThreadId(): string;
  defaultStore(): Store;
  activeProjectRuntimeHost(): Host | undefined;
  requireActiveProjectRuntimeHost(): Host;
  ensureProjectRuntimeHostForWorkspacePath(workspacePath: string): Host;
  requireProjectRuntimeHostForWorkflowArtifact(artifactId: string): Host;
  requireProjectRuntimeHostForWorkflowDiscoveryQuestion(questionId: string): Host;
  requireProjectRuntimeHostForWorkflowRevision(revisionId: string): Host;
  requireProjectRuntimeHostForWorkflowRun(runId: string): Host;
  requireProjectRuntimeHostForWorkflowThread(workflowThreadId: string): Host;
  activeThreadIdForHost(host: Host): string;
  setProjectHostActiveThreadId(host: Host, threadId: string): string;
  activeProjectBoardForState(store: Store, threadId?: string): ProjectBoardSummary | undefined;
  activeProjectBoardThreadIdForStore(store: Store): string | undefined;
  buildWorkflowDebugRewriteContext(
    store: Store,
    input: { runId: string; eventId?: string; userNotes?: string },
  ): DebugContext;
  createProjectStore(): ProjectRuntimeIpcProjectStoreHandle<Store>;
  emitState(state: State): void;
  ensureDirectory(workspacePath: string): void;
  homePath(): string;
  normalizeWorkspacePath(workspacePath: string): string;
  projectRegistry(): ProjectRuntimeIpcProjectRegistry;
  switchWorkspace(workspacePath: string): State;
  now?(): number;
}

export interface ProjectRuntimeIpcContextService<
  Host extends ProjectRuntimeIpcHost<Store, BrowserService>,
  Store extends ProjectRuntimeIpcStore,
  BrowserService,
  DebugContext extends ProjectRuntimeWorkflowDebugContext,
> {
  activeProjectIpcContext(): ProjectRuntimeActiveProjectIpcContext<Host, Store, BrowserService>;
  createProjectWorkspaceForRuntime(input: {
    name?: string;
    workspacePath?: string;
    reason: string;
  }, targetStore?: Store): ProjectSummary;
  isActiveProjectRuntimeHost(host: Host): boolean;
  listRuntimeProjects(targetStore?: Store): ProjectSummary[];
  resolveHeadlessProjectWorkspacePath(input: {
    name?: string;
    workspacePath?: string;
  }, baseWorkspacePath?: string): string;
  resolveRegisteredProjectPathForHost(projectId: string, host: Host): string;
  switchProjectWorkspaceForRuntime(input: { workspacePath: string; reason: string }): void;
  workflowAgentIpcContextForDiscoveryQuestion(
    questionId: string,
  ): ProjectRuntimeWorkflowAgentIpcContext<Host, Store, BrowserService> & { question: ProjectRuntimeWorkflowDiscoveryQuestion };
  workflowAgentIpcContextForWorkflowThread(workflowThreadId: string): ProjectRuntimeWorkflowAgentIpcContext<Host, Store, BrowserService>;
  workflowArtifactIpcContext(artifactId: string): ProjectRuntimeWorkflowArtifactIpcContext<Host, Store, BrowserService>;
  workflowArtifactIpcContextForHost(host: Host, artifactId: string): ProjectRuntimeWorkflowArtifactIpcContext<Host, Store, BrowserService>;
  workflowCompileIpcContext(input: {
    workflowThreadId?: string;
    revisionId?: string;
  }): ProjectRuntimeWorkflowProjectIpcContext<Host, Store, BrowserService> | ProjectRuntimeWorkflowAgentIpcContext<Host, Store, BrowserService>;
  workflowDebugRewriteIpcContext(input: {
    runId: string;
    eventId?: string;
    userNotes?: string;
  }): ProjectRuntimeWorkflowDebugRewriteIpcContext<Host, Store, BrowserService, DebugContext>;
  workflowProjectIpcContext(input: { projectPath?: string }): ProjectRuntimeWorkflowProjectIpcContext<Host, Store, BrowserService>;
}

export function activeProjectSummary(
  workspace: ProjectRuntimeIpcWorkspace,
  threads: ProjectSummary["threads"],
  board?: ProjectSummary["board"],
): ProjectSummary {
  const timestamps = threads.flatMap((thread) => [thread.createdAt, thread.updatedAt]).filter(Boolean);
  const fallbackTime = new Date(0).toISOString();
  return {
    id: projectIdFromWorkspacePath(workspace.path),
    ...workspace,
    createdAt: timestamps.length ? timestamps.reduce((earliest, item) => (item < earliest ? item : earliest)) : fallbackTime,
    updatedAt: timestamps.length ? timestamps.reduce((latest, item) => (item > latest ? item : latest)) : fallbackTime,
    board,
    threads,
  };
}

export function initialActiveThreadIdForStore(targetStore: Pick<ProjectRuntimeIpcStore, "getLastActiveThreadId" | "listThreads" | "setLastActiveThreadId">): string {
  const threads = targetStore.listThreads();
  const persistedThreadId = targetStore.getLastActiveThreadId();
  if (persistedThreadId && threads.some((thread) => thread.id === persistedThreadId)) return persistedThreadId;
  const active = threads[0]?.id;
  if (!active) throw new Error("No active thread");
  targetStore.setLastActiveThreadId(active);
  return active;
}

export function permanentWorktreeBranchName(projectPath: string, now = Date.now()): string {
  const slug = (basename(projectPath) || "project")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return `codex/${slug || "project"}-worktree-${now.toString(36)}`;
}

export function workflowAgentControlThread<Store extends Pick<ProjectRuntimeIpcStore, "getThread">>(
  targetStore: Store,
  fallbackThread: ThreadSummary,
  workflowThread: ProjectRuntimeWorkflowThreadSummary,
  projectPath: string,
): ThreadSummary {
  const baseThread = workflowThread.chatThreadId ? targetStore.getThread(workflowThread.chatThreadId) : fallbackThread;
  return { ...baseThread, workspacePath: projectPath };
}

export function createProjectRuntimeIpcContextService<
  Host extends ProjectRuntimeIpcHost<Store, BrowserService>,
  Store extends ProjectRuntimeIpcStore,
  BrowserService,
  State,
  DebugContext extends ProjectRuntimeWorkflowDebugContext,
>(
  dependencies: ProjectRuntimeIpcContextServiceDependencies<Host, Store, BrowserService, State, DebugContext>,
): ProjectRuntimeIpcContextService<Host, Store, BrowserService, DebugContext> {
  function resolveRegisteredProjectPathForHost(projectId: string, host: Host): string {
    return dependencies.projectRegistry().resolveProjectId(projectId, host.workspacePath);
  }

  function listRuntimeProjects(targetStore: Store = dependencies.defaultStore()): ProjectSummary[] {
    const workspace = targetStore.getWorkspace();
    const hiddenThreadIds = new Set([...targetStore.listAutomationThreadChatIds(), ...targetStore.listWorkflowAgentThreadChatIds()]);
    const projectThreads = targetStore.listThreads().filter((thread) => !hiddenThreadIds.has(thread.id));
    const activeProject = activeProjectSummary(
      workspace,
      projectThreads,
      dependencies.activeProjectBoardForState(targetStore, dependencies.activeProjectBoardThreadIdForStore(targetStore)),
    );
    return dependencies.projectRegistry().listProjects(workspace.path, activeProject);
  }

  function resolveHeadlessProjectWorkspacePath(
    input: { name?: string; workspacePath?: string },
    baseWorkspacePath = dependencies.defaultStore().getWorkspace().path,
  ): string {
    const requestedPath = input.workspacePath?.trim();
    if (requestedPath) {
      if (requestedPath.startsWith("~/")) return dependencies.normalizeWorkspacePath(join(dependencies.homePath(), requestedPath.slice(2)));
      if (requestedPath.startsWith(".")) return dependencies.normalizeWorkspacePath(resolve(dirname(baseWorkspacePath), requestedPath));
      return dependencies.normalizeWorkspacePath(requestedPath);
    }
    const rawName = input.name?.trim() || "New Ambient Project";
    const directoryName = rawName.replace(/[/:\\]/g, "-").replace(/\s+/g, " ").trim() || "New Ambient Project";
    return dependencies.normalizeWorkspacePath(join(dirname(baseWorkspacePath), directoryName));
  }

  function createProjectWorkspaceForRuntime(
    input: { name?: string; workspacePath?: string; reason: string },
    targetStore: Store = dependencies.defaultStore(),
  ): ProjectSummary {
    const workspacePath = resolveHeadlessProjectWorkspacePath(input, targetStore.getWorkspace().path);
    dependencies.ensureDirectory(workspacePath);
    const projectStore = dependencies.createProjectStore();
    let summary: ProjectSummary;
    try {
      const workspace = projectStore.openWorkspace(workspacePath);
      summary = activeProjectSummary(
        workspace,
        projectStore.store.listThreads(),
        projectStore.store.getActiveProjectBoard(initialActiveThreadIdForStore(projectStore.store)),
      );
    } finally {
      projectStore.close();
    }
    dependencies.projectRegistry().register(workspacePath);
    if (input.name?.trim()) dependencies.projectRegistry().setDisplayName(workspacePath, input.name.trim());
    return listRuntimeProjects(targetStore).find((project) => project.path === workspacePath) ?? summary;
  }

  function switchProjectWorkspaceForRuntime(input: { workspacePath: string; reason: string }): void {
    const state = dependencies.switchWorkspace(input.workspacePath);
    dependencies.emitState(state);
  }

  function activeProjectIpcContext(): ProjectRuntimeActiveProjectIpcContext<Host, Store, BrowserService> {
    const host = dependencies.requireActiveProjectRuntimeHost();
    const targetStore = host.store;
    const thread = targetStore.getThread(dependencies.activeThreadIdForHost(host));
    return { host, targetStore, targetBrowserService: host.browserService, thread };
  }

  function workflowProjectIpcContext(input: { projectPath?: string }): ProjectRuntimeWorkflowProjectIpcContext<Host, Store, BrowserService> {
    const host = input.projectPath ? dependencies.ensureProjectRuntimeHostForWorkspacePath(input.projectPath) : dependencies.requireActiveProjectRuntimeHost();
    const targetStore = host.store;
    const thread = targetStore.getThread(dependencies.activeThreadIdForHost(host));
    const projectPath = dependencies.normalizeWorkspacePath(input.projectPath ?? targetStore.getWorkspace().path);
    return { host, targetStore, targetBrowserService: host.browserService, thread, projectPath };
  }

  function workflowAgentIpcContextForWorkflowThread(workflowThreadId: string): ProjectRuntimeWorkflowAgentIpcContext<Host, Store, BrowserService> {
    const host = dependencies.requireProjectRuntimeHostForWorkflowThread(workflowThreadId);
    const targetStore = host.store;
    const thread = targetStore.getThread(dependencies.activeThreadIdForHost(host));
    const workflowThread = targetStore.getWorkflowAgentThreadSummary(workflowThreadId);
    const projectPath = dependencies.normalizeWorkspacePath(workflowThread.projectPath || targetStore.getWorkspace().path);
    return { host, targetStore, targetBrowserService: host.browserService, thread, workflowThread, projectPath };
  }

  function workflowAgentIpcContextForDiscoveryQuestion(questionId: string): ProjectRuntimeWorkflowAgentIpcContext<Host, Store, BrowserService> & {
    question: ProjectRuntimeWorkflowDiscoveryQuestion;
  } {
    const host = dependencies.requireProjectRuntimeHostForWorkflowDiscoveryQuestion(questionId);
    const targetStore = host.store;
    const thread = targetStore.getThread(dependencies.activeThreadIdForHost(host));
    const question = targetStore.getWorkflowDiscoveryQuestion(questionId);
    const workflowThread = targetStore.getWorkflowAgentThreadSummary(question.workflowThreadId);
    const projectPath = dependencies.normalizeWorkspacePath(workflowThread.projectPath || targetStore.getWorkspace().path);
    return { host, targetStore, targetBrowserService: host.browserService, thread, workflowThread, question, projectPath };
  }

  function workflowArtifactIpcContextForHost(host: Host, artifactId: string): ProjectRuntimeWorkflowArtifactIpcContext<Host, Store, BrowserService> {
    const targetStore = host.store;
    const activeThread = targetStore.getThread(dependencies.activeThreadIdForHost(host));
    const artifact = targetStore.getWorkflowArtifact(artifactId);
    const workflowThread = artifact.workflowThreadId ? targetStore.getWorkflowAgentThreadSummary(artifact.workflowThreadId) : undefined;
    const projectPath = dependencies.normalizeWorkspacePath(workflowThread?.projectPath || targetStore.getWorkspace().path);
    const thread = workflowThread
      ? workflowAgentControlThread(targetStore, activeThread, workflowThread, projectPath)
      : { ...activeThread, workspacePath: projectPath };
    return { host, targetStore, targetBrowserService: host.browserService, thread, artifact, workflowThread, projectPath };
  }

  function workflowArtifactIpcContext(artifactId: string): ProjectRuntimeWorkflowArtifactIpcContext<Host, Store, BrowserService> {
    return workflowArtifactIpcContextForHost(dependencies.requireProjectRuntimeHostForWorkflowArtifact(artifactId), artifactId);
  }

  function workflowCompileIpcContext(input: {
    workflowThreadId?: string;
    revisionId?: string;
  }): ProjectRuntimeWorkflowProjectIpcContext<Host, Store, BrowserService> | ProjectRuntimeWorkflowAgentIpcContext<Host, Store, BrowserService> {
    if (input.workflowThreadId) {
      const context = workflowAgentIpcContextForWorkflowThread(input.workflowThreadId);
      if (input.revisionId) {
        const revision = context.targetStore.getWorkflowRevision(input.revisionId);
        if (revision.workflowThreadId !== input.workflowThreadId) {
          throw new Error(`Workflow revision ${revision.id} does not belong to workflow thread ${input.workflowThreadId}.`);
        }
      }
      return {
        ...context,
        thread: workflowAgentControlThread(context.targetStore, context.thread, context.workflowThread, context.projectPath),
      };
    }
    if (input.revisionId) {
      const host = dependencies.requireProjectRuntimeHostForWorkflowRevision(input.revisionId);
      const revision = host.store.getWorkflowRevision(input.revisionId);
      const context = workflowAgentIpcContextForWorkflowThread(revision.workflowThreadId);
      return {
        ...context,
        thread: workflowAgentControlThread(context.targetStore, context.thread, context.workflowThread, context.projectPath),
      };
    }
    const context = activeProjectIpcContext();
    const projectPath = dependencies.normalizeWorkspacePath(context.thread.workspacePath || context.targetStore.getWorkspace().path);
    return { ...context, projectPath, thread: { ...context.thread, workspacePath: projectPath } };
  }

  function workflowDebugRewriteIpcContext(input: {
    runId: string;
    eventId?: string;
    userNotes?: string;
  }): ProjectRuntimeWorkflowDebugRewriteIpcContext<Host, Store, BrowserService, DebugContext> {
    const host = dependencies.requireProjectRuntimeHostForWorkflowRun(input.runId);
    const targetStore = host.store;
    const debugContext = dependencies.buildWorkflowDebugRewriteContext(targetStore, input);
    if (!debugContext.workflowThreadId) {
      throw new Error("Debug rewrite requires the failed workflow to belong to a Workflow Agent thread.");
    }
    const workflowThread = targetStore.getWorkflowAgentThreadSummary(debugContext.workflowThreadId);
    const projectPath = dependencies.normalizeWorkspacePath(workflowThread.projectPath || targetStore.getWorkspace().path);
    const activeThread = targetStore.getThread(dependencies.activeThreadIdForHost(host));
    const thread = workflowAgentControlThread(targetStore, activeThread, workflowThread, projectPath);
    return { host, targetStore, targetBrowserService: host.browserService, thread, workflowThread, debugContext, projectPath };
  }

  function isActiveProjectRuntimeHost(host: Host): boolean {
    return dependencies.activeProjectRuntimeHost() === host;
  }

  return {
    activeProjectIpcContext,
    createProjectWorkspaceForRuntime,
    isActiveProjectRuntimeHost,
    listRuntimeProjects,
    resolveHeadlessProjectWorkspacePath,
    resolveRegisteredProjectPathForHost,
    switchProjectWorkspaceForRuntime,
    workflowAgentIpcContextForDiscoveryQuestion,
    workflowAgentIpcContextForWorkflowThread,
    workflowArtifactIpcContext,
    workflowArtifactIpcContextForHost,
    workflowCompileIpcContext,
    workflowDebugRewriteIpcContext,
    workflowProjectIpcContext,
  };
}
