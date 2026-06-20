import { z } from "zod";
import type { ProjectBoardSummary, ProjectSummary } from "../../shared/projectBoardTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceSearchInput, WorkspaceSearchResult, WorkspaceSearchScope } from "../../shared/workspaceTypes";

export const workspaceSearchSchema = z.union([
  z.string().min(1).max(500),
  z.object({
    query: z.string().min(1).max(500),
    scope: z.enum(["chat", "project", "all-projects"]).optional(),
    threadId: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
]);

export interface WorkspaceSearchStore {
  getWorkspace(): { path: string; name: string; statePath: string; sessionPath: string };
  listThreads(): ThreadSummary[];
  searchWorkspace(
    query: string,
    options: {
      scope?: Exclude<WorkspaceSearchScope, "all-projects">;
      threadId?: string;
      limit?: number;
      projectName?: string;
      workspacePath?: string;
    },
  ): WorkspaceSearchResult[];
}

export interface WorkspaceSearchHost<Store extends WorkspaceSearchStore> {
  store: Store;
}

export interface WorkspaceSearchProjectRegistry {
  listProjects(activeWorkspacePath: string, activeProject?: ProjectSummary): ProjectSummary[];
}

export interface WorkspaceSearchDesktopServiceDependencies<
  Store extends WorkspaceSearchStore,
  Host extends WorkspaceSearchHost<Store>,
> {
  activeProjectBoardForState(store: Store, threadId?: string): ProjectBoardSummary | undefined;
  activeProjectBoardThreadIdForStore(store: Store): string | undefined;
  activeProjectSummary(
    workspace: ReturnType<WorkspaceSearchStore["getWorkspace"]>,
    threads: ThreadSummary[],
    board: ProjectBoardSummary | undefined,
  ): ProjectSummary;
  activeThreadIdForHost(host: Host): string;
  projectRegistry(): WorkspaceSearchProjectRegistry;
  readProjectSearchResults(workspacePath: string, query: string, limit: number): WorkspaceSearchResult[];
  requireActiveProjectRuntimeHost(): Host;
  requireProjectRuntimeHostForThread(threadId: string): Host;
}

export interface WorkspaceSearchDesktopService {
  searchWorkspace(raw: WorkspaceSearchInput | string): WorkspaceSearchResult[];
}

export function createWorkspaceSearchDesktopService<
  Store extends WorkspaceSearchStore,
  Host extends WorkspaceSearchHost<Store>,
>(
  dependencies: WorkspaceSearchDesktopServiceDependencies<Store, Host>,
): WorkspaceSearchDesktopService {
  function searchWorkspace(raw: WorkspaceSearchInput | string): WorkspaceSearchResult[] {
    const parsed = workspaceSearchSchema.parse(raw);
    const input: WorkspaceSearchInput = typeof parsed === "string" ? { query: parsed, scope: "project" } : parsed;
    const scope = input.scope ?? "project";
    const limit = input.limit ?? 50;
    const host = scope !== "all-projects" && input.threadId
      ? dependencies.requireProjectRuntimeHostForThread(input.threadId)
      : dependencies.requireActiveProjectRuntimeHost();
    const targetStore = host.store;
    if (scope === "all-projects") {
      const workspace = targetStore.getWorkspace();
      const activeProject = dependencies.activeProjectSummary(
        workspace,
        targetStore.listThreads(),
        dependencies.activeProjectBoardForState(targetStore, dependencies.activeProjectBoardThreadIdForStore(targetStore)),
      );
      const projects = dependencies.projectRegistry().listProjects(workspace.path, activeProject);
      const perProjectLimit = Math.max(5, Math.ceil(limit / Math.max(projects.length, 1)));
      return projects
        .flatMap((project) => dependencies.readProjectSearchResults(project.path, input.query, perProjectLimit))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    }
    const workspace = targetStore.getWorkspace();
    return targetStore.searchWorkspace(input.query, {
      scope,
      threadId: input.threadId ?? dependencies.activeThreadIdForHost(host),
      limit,
      projectName: workspace.name,
      workspacePath: workspace.path,
    });
  }

  return {
    searchWorkspace,
  };
}
