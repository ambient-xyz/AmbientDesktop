import { join } from "node:path";
import type { DesktopState } from "../../shared/desktopTypes";
import type {
  CreateProjectBoardInput,
  ProjectBoardGitSyncInput,
  ProjectSummary,
} from "../../shared/projectBoardTypes";
import { applyProjectBoardGitProjection } from "./projectBoardGitSync";
import { createOrAdoptProjectBoard } from "./projectBoardBootstrap";
import { ProjectStore } from "./projectBoardProjectStoreFacade";
import {
  recoverOrphanedProjectBoardSynthesisPauseRequests,
  refreshProjectBoardSources,
  requireProjectBoardForAction,
} from "./projectBoardSynthesisDesktopService";
import { scanProjectBoardSources } from "./projectBoardSources";

export interface ProjectBoardDesktopRuntimeHost {
  store: ProjectStore;
  workspacePath: string;
  activeThreadId: string;
}

interface ProjectBoardWorkflowReadiness {
  status: "missing" | "invalid" | "ready";
  path?: string;
  message?: string;
  workflowHash?: string;
  code?: string;
  autoDispatch?: boolean;
  maxConcurrentAgents?: number;
  workspaceStrategy?: string;
}

export interface ProjectBoardDesktopContextServiceDependencies<Host extends ProjectBoardDesktopRuntimeHost = ProjectBoardDesktopRuntimeHost> {
  store(): ProjectStore;
  activeThreadId(): string;
  activeThreadIdForHost(host: Host): string;
  projectRuntimeHostForStore(targetStore: ProjectStore): Host | undefined;
  requireProjectRuntimeHostForStoreRecord(assertRecordExists: (targetStore: ProjectStore) => void): Host;
  requireActiveProjectRuntimeHost(): Host;
  ensureProjectRuntimeHostForWorkspacePath(workspacePath: string): Host;
  resolveRegisteredProjectPathForHost(projectId: string, host: Host): string;
  emitDesktopState(): void;
  emitProjectStateIfActive(host: Host): void;
  emitOrchestrationUpdated(workspacePath: string): void;
  readState(): DesktopState;
  readStateForProjectHostAction(host: Host): DesktopState;
  readOrchestrationWorkflowReadiness(workspacePath: string): Promise<ProjectBoardWorkflowReadiness>;
  workflowAutoDispatchDisabledMessage(workflowPath: string): string;
}

let projectBoardDesktopContextServices:
  | ProjectBoardDesktopContextServiceDependencies<ProjectBoardDesktopRuntimeHost>
  | undefined;

export function configureProjectBoardDesktopContextService<Host extends ProjectBoardDesktopRuntimeHost>(
  dependencies: ProjectBoardDesktopContextServiceDependencies<Host>,
): void {
  projectBoardDesktopContextServices =
    dependencies as ProjectBoardDesktopContextServiceDependencies<ProjectBoardDesktopRuntimeHost>;
}

function services(): ProjectBoardDesktopContextServiceDependencies<ProjectBoardDesktopRuntimeHost> {
  if (!projectBoardDesktopContextServices) {
    throw new Error("Project Board desktop context service has not been configured.");
  }
  return projectBoardDesktopContextServices;
}

function defaultProjectBoardDesktopStore(): ProjectStore {
  return services().store();
}

export function activeProjectBoardForState(
  targetStore: ProjectStore = defaultProjectBoardDesktopStore(),
  threadId?: string,
): ProjectSummary["board"] {
  return recoverOrphanedProjectBoardSynthesisPauseRequests(targetStore.getActiveProjectBoard(threadId), targetStore);
}

export function activeProjectBoardThreadIdForStore(targetStore: ProjectStore = defaultProjectBoardDesktopStore()): string | undefined {
  const host = services().projectRuntimeHostForStore(targetStore);
  if (host) return services().activeThreadIdForHost(host);
  return targetStore === defaultProjectBoardDesktopStore() ? services().activeThreadId() : undefined;
}

export function emitProjectBoardState(targetStore: ProjectStore = defaultProjectBoardDesktopStore(), host?: ProjectBoardDesktopRuntimeHost): void {
  if (host) {
    services().emitProjectStateIfActive(host);
    return;
  }
  if (targetStore === defaultProjectBoardDesktopStore()) services().emitDesktopState();
}

export function assertProjectBoardMutationAllowedForActiveThread(host: ProjectBoardDesktopRuntimeHost, action: string): void {
  const activeThread = host.store.getThread(services().activeThreadIdForHost(host));
  if (!activeThread.workflowRecording) return;
  throw new Error(`Project boards are unavailable in Workflow Recording chats. Switch to a normal project chat to ${action}.`);
}

export function requireProjectRuntimeHostForProjectBoard(boardId: string): ProjectBoardDesktopRuntimeHost {
  return services().requireProjectRuntimeHostForStoreRecord((targetStore) => {
    requireProjectBoardForAction(boardId, targetStore);
  });
}

export function requireProjectRuntimeHostForProjectBoardCard(cardId: string): ProjectBoardDesktopRuntimeHost {
  return services().requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getProjectBoardCard(cardId);
  });
}

export function requireProjectRuntimeHostForProjectBoardSynthesisProposal(proposalId: string): ProjectBoardDesktopRuntimeHost {
  return services().requireProjectRuntimeHostForStoreRecord((targetStore) => {
    const proposal = targetStore.getProjectBoardSynthesisProposal(proposalId);
    if (!proposal) throw new Error(`Project board synthesis proposal not found: ${proposalId}`);
  });
}

export function requireProjectRuntimeHostForProjectBoardSource(sourceId: string): ProjectBoardDesktopRuntimeHost {
  return services().requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getProjectBoardSource(sourceId);
  });
}

export function requireProjectRuntimeHostForProjectBoardQuestion(questionId: string): ProjectBoardDesktopRuntimeHost {
  return services().requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getProjectBoardQuestion(questionId);
  });
}

export async function applyProjectBoardGitProjectionAndBroadcast(
  boardId: string,
  resolutions: ProjectBoardGitSyncInput["resolutions"] = [],
  targetStore: ProjectStore = defaultProjectBoardDesktopStore(),
  host?: ProjectBoardDesktopRuntimeHost,
): Promise<DesktopState> {
  const board = requireProjectBoardForAction(boardId, targetStore);
  const runtime = targetStore.listOrchestrationBoard();
  await applyProjectBoardGitProjection(board, {
    runtime,
    resolutions,
    applyProjection: (projectPath, projection) => targetStore.applyProjectBoardArtifactProjection(projectPath, projection),
  });
  if (host) {
    services().emitProjectStateIfActive(host);
  } else {
    services().emitDesktopState();
  }
  return host ? services().readStateForProjectHostAction(host) : services().readState();
}

export async function recordActiveProjectBoardExecutionReadinessBlocker(input: {
  source: "auto_dispatch" | "manual_prepare";
  blocker?: "missing_workflow" | "invalid_workflow" | "auto_dispatch_disabled" | "auto_dispatch_error" | "prepare_error";
  error?: unknown;
  title?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}, targetStore: ProjectStore = defaultProjectBoardDesktopStore()): Promise<void> {
  const board = targetStore.getActiveProjectBoard();
  if (!board) return;
  const workspacePath = targetStore.getWorkspace().path;
  const errorMessage = input.error instanceof Error ? input.error.message : input.error === undefined ? undefined : String(input.error);
  try {
    const workflowReadiness = await services().readOrchestrationWorkflowReadiness(workspacePath);
    const workflowPath = workflowReadiness.path || join(workspacePath, "WORKFLOW.md");
    const blocker =
      input.blocker ??
      (workflowReadiness.status === "missing"
        ? "missing_workflow"
        : workflowReadiness.status === "invalid"
          ? "invalid_workflow"
          : workflowReadiness.status === "ready" && workflowReadiness.autoDispatch === false
            ? "auto_dispatch_disabled"
            : input.source === "manual_prepare"
              ? "prepare_error"
              : "auto_dispatch_error");
    const readinessSummary =
      blocker === "missing_workflow"
        ? `Ready Local Tasks could not be prepared because ${workflowPath} is missing.`
        : blocker === "invalid_workflow"
          ? `Ready Local Tasks could not be prepared because ${workflowPath} is invalid: ${workflowReadiness.message ?? errorMessage ?? "validation failed"}.`
          : blocker === "auto_dispatch_disabled"
            ? `Ready Local Tasks are not being started automatically because ${services().workflowAutoDispatchDisabledMessage(workflowPath)}`
            : `${input.source === "manual_prepare" ? "Manual run preparation" : "Auto-dispatch"} failed before ready work could start: ${errorMessage ?? "Unknown error"}.`;
    const result = targetStore.recordProjectBoardExecutionReadinessBlocker({
      boardId: board.id,
      source: input.source,
      blocker,
      title: input.title ?? executionReadinessBlockerTitle(input.source, blocker),
      summary: input.summary ?? readinessSummary,
      workflowPath,
      error: errorMessage,
      metadata: {
        workflowStatus: workflowReadiness.status,
        workflowHash: workflowReadiness.workflowHash,
        workflowCode: workflowReadiness.code,
        workflowAutoDispatch: workflowReadiness.autoDispatch,
        workflowMaxConcurrentAgents: workflowReadiness.maxConcurrentAgents,
        workflowWorkspaceStrategy: workflowReadiness.workspaceStrategy,
        ...input.metadata,
      },
    });
    if (result.recorded) {
      if (targetStore === defaultProjectBoardDesktopStore()) {
        services().emitDesktopState();
      } else {
        services().emitOrchestrationUpdated(workspacePath);
      }
    }
  } catch (recordError) {
    console.warn(
      `[project-board] Failed to record execution readiness blocker: ${
        recordError instanceof Error ? recordError.message : String(recordError)
      }`,
    );
  }
}

export async function createProjectBoardForProjectHost(input: CreateProjectBoardInput): Promise<DesktopState> {
  const activeHostSnapshot = services().requireActiveProjectRuntimeHost();
  const workspacePath = services().resolveRegisteredProjectPathForHost(input.projectId, activeHostSnapshot);
  const host = services().ensureProjectRuntimeHostForWorkspacePath(workspacePath);
  assertProjectBoardMutationAllowedForActiveThread(host, "create or open a project board");
  const targetStore = host.store;
  const sourceThreadId = services().activeThreadIdForHost(host);
  const bootstrapInput: Parameters<typeof createOrAdoptProjectBoard>[0] = {
    workspacePath: targetStore.getWorkspace().path,
    getActiveBoard: () => targetStore.getActiveProjectBoard(sourceThreadId),
    createBoard: (boardInput) => targetStore.createProjectBoard({ ...boardInput, sourceThreadId }),
    applyArtifactProjection: (workspacePath, projection) => targetStore.applyProjectBoardArtifactProjection(workspacePath, projection),
    scanSources: () => scanProjectBoardSources(targetStore, { workspacePath: targetStore.getWorkspace().path, threadId: sourceThreadId }),
  };
  if (typeof input.title === "string") bootstrapInput.title = input.title;
  if (typeof input.summary === "string") bootstrapInput.summary = input.summary;
  const bootstrap = await createOrAdoptProjectBoard(bootstrapInput);
  const board = bootstrap.board;
  services().emitProjectStateIfActive(host);

  const refreshReason =
    bootstrap.kind === "created"
      ? "created"
      : bootstrap.kind === "adopted" && bootstrap.freshness?.status === "stale"
        ? "adopted_stale"
        : undefined;
  if (refreshReason && process.env.AMBIENT_E2E_SKIP_PROJECT_BOARD_SOURCE_REFRESH !== "1") {
    const model = targetStore.getDefaultSettings().model;
    const run = targetStore.createProjectBoardSynthesisRun({ boardId: board.id, model });
    services().emitProjectStateIfActive(host);
    try {
      await refreshProjectBoardSources(board.id, { runId: run.id, model, targetStore, host });
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "sources_persisted",
        title: refreshReason === "adopted_stale" ? "Adopted board source snapshot refreshed" : "Project board source snapshot ready",
        summary:
          refreshReason === "adopted_stale"
            ? "Adopted .ambient/board artifacts were valid but stale relative to the current checkout. The source snapshot has been refreshed before additional planning."
            : "Source snapshot is ready. Answer the kickoff questions to create the charter. After the charter is active, use Review Charter With Pi to check for source conflicts or missing PM decisions before applying candidate cards.",
        metadata: { sourceRefreshOnly: true, bootstrapKind: bootstrap.kind, refreshReason, artifactFreshness: bootstrap.freshness },
        status: "succeeded",
        completedAt: new Date().toISOString(),
      });
      services().emitProjectStateIfActive(host);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "failed",
        title: refreshReason === "adopted_stale" ? "Adopted board source refresh failed" : "Initial source scan failed",
        summary: message,
        metadata: { sourceRefreshOnly: true, bootstrapKind: bootstrap.kind, refreshReason, artifactFreshness: bootstrap.freshness, error: message },
        status: "failed",
        error: message,
        completedAt: new Date().toISOString(),
      });
      services().emitProjectStateIfActive(host);
      throw error;
    }
  }
  return services().readStateForProjectHostAction(host);
}

function executionReadinessBlockerTitle(
  source: "auto_dispatch" | "manual_prepare",
  blocker: "missing_workflow" | "invalid_workflow" | "auto_dispatch_disabled" | "auto_dispatch_error" | "prepare_error",
): string {
  if (blocker === "missing_workflow") return "Execution blocked: missing WORKFLOW.md";
  if (blocker === "invalid_workflow") return "Execution blocked: invalid WORKFLOW.md";
  if (blocker === "auto_dispatch_disabled") return "Execution blocked: auto-dispatch disabled";
  return source === "manual_prepare" ? "Run preparation failed" : "Auto-dispatch failed";
}
