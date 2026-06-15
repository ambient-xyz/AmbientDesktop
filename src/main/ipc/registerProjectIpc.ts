import type { IpcMain, OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { basename, dirname, join } from "node:path";
import { z } from "zod";

import type { DesktopState, ProjectActionInput, SelectProjectInput, UpdateProjectInput } from "../../shared/types";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;
type ProjectDialogResult = Pick<OpenDialogReturnValue, "canceled" | "filePaths">;

export const projectSelectIpcChannels = ["project:select"] as const;
export const projectUpdateIpcChannels = ["project:update"] as const;
export const projectRemoveIpcChannels = ["project:remove"] as const;
export const projectRevealIpcChannels = ["project:reveal"] as const;
export const projectArchiveChatsIpcChannels = ["project:archive-chats"] as const;
export const projectPermanentWorktreeIpcChannels = ["project:create-permanent-worktree"] as const;

export interface ProjectSelectHost {
  workspacePath: string;
}

export interface RegisterProjectSelectIpcDependencies<Host extends ProjectSelectHost = ProjectSelectHost> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  resolveRegisteredProjectPathForHost(projectId: string, host: Host): string;
  normalizeWorkspacePath(workspacePath: string): string;
  activeThreadIdForHost(host: Host): string;
  readStateForProjectHostAction(host: Host, threadId: string): MaybePromise<DesktopState>;
  switchWorkspace(workspacePath: string, requestedThreadId?: string): MaybePromise<DesktopState>;
}

export interface RegisterProjectUpdateIpcDependencies<Host extends ProjectSelectHost = ProjectSelectHost> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  resolveRegisteredProjectPathForHost(projectId: string, host: Host): string;
  setProjectDisplayName(workspacePath: string, name: string | undefined): void;
  setProjectPinned(workspacePath: string, pinned: boolean): void;
  readStateForProjectHostAction(host: Host): MaybePromise<DesktopState>;
}

export interface RegisterProjectRemoveIpcDependencies<Host extends ProjectSelectHost = ProjectSelectHost> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  resolveRegisteredProjectPathForHost(projectId: string, host: Host): string;
  normalizeWorkspacePath(workspacePath: string): string;
  listRegisteredProjectPaths(): string[];
  pathExists(workspacePath: string): boolean;
  removeProject(workspacePath: string): void;
  switchWorkspace(workspacePath: string): MaybePromise<DesktopState>;
  disposeProjectRuntimeHost(workspacePath: string, reason: string): void;
  readStateForProjectHostAction(host: Host): MaybePromise<DesktopState>;
}

export interface RegisterProjectRevealIpcDependencies<Host extends ProjectSelectHost = ProjectSelectHost> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  resolveRegisteredProjectPathForHost(projectId: string, host: Host): string;
  openProjectPath(workspacePath: string): MaybePromise<string>;
  showProjectInFolder(workspacePath: string): void;
}

export interface RegisterProjectArchiveChatsIpcDependencies<Host extends ProjectSelectHost = ProjectSelectHost> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  resolveRegisteredProjectPathForHost(projectId: string, host: Host): string;
  normalizeWorkspacePath(workspacePath: string): string;
  projectRuntimeHostForWorkspacePath(workspacePath: string): Host | undefined;
  archiveProjectChatsForHost(host: Host): void;
  initialActiveThreadIdForHost(host: Host): string;
  setProjectHostActiveThreadId(host: Host, threadId: string): string;
  emitProjectStateIfActive(host: Host, threadId: string): void;
  archiveProjectChats(workspacePath: string): void;
  readStateForProjectHostAction(host: Host, threadId?: string): MaybePromise<DesktopState>;
}

export interface RegisterProjectPermanentWorktreeIpcDependencies<Host extends ProjectSelectHost = ProjectSelectHost> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  resolveRegisteredProjectPathForHost(projectId: string, host: Host): string;
  normalizeWorkspacePath(workspacePath: string): string;
  showOpenDialog(options: OpenDialogOptions): MaybePromise<ProjectDialogResult>;
  createPermanentWorktree(projectPath: string, worktreePath: string, branchName: string): MaybePromise<void>;
  permanentWorktreeBranchName(projectPath: string): string;
  switchWorkspace(workspacePath: string): MaybePromise<DesktopState>;
}

const projectIdSchema = z.string().min(1).max(128);
const selectProjectSchema = z.object({
  projectId: projectIdSchema,
  threadId: z.string().min(1).optional(),
}) satisfies z.ZodType<SelectProjectInput>;
const projectActionSchema = z.object({
  projectId: projectIdSchema,
}) satisfies z.ZodType<ProjectActionInput>;
const updateProjectSchema = z.object({
  projectId: projectIdSchema,
  name: z.string().max(160).optional(),
  pinned: z.boolean().optional(),
}) satisfies z.ZodType<UpdateProjectInput>;

export function registerProjectSelectIpc<Host extends ProjectSelectHost = ProjectSelectHost>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  resolveRegisteredProjectPathForHost,
  normalizeWorkspacePath,
  activeThreadIdForHost,
  readStateForProjectHostAction,
  switchWorkspace,
}: RegisterProjectSelectIpcDependencies<Host>): void {
  handleIpc("project:select", (_event, raw: SelectProjectInput) => {
    const input = selectProjectSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const workspacePath = resolveRegisteredProjectPathForHost(input.projectId, activeHostSnapshot);
    if (normalizeWorkspacePath(workspacePath) === activeHostSnapshot.workspacePath) {
      return readStateForProjectHostAction(activeHostSnapshot, input.threadId || activeThreadIdForHost(activeHostSnapshot));
    }
    return switchWorkspace(workspacePath, input.threadId);
  });
}

export function registerProjectUpdateIpc<Host extends ProjectSelectHost = ProjectSelectHost>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  resolveRegisteredProjectPathForHost,
  setProjectDisplayName,
  setProjectPinned,
  readStateForProjectHostAction,
}: RegisterProjectUpdateIpcDependencies<Host>): void {
  handleIpc("project:update", (_event, raw: UpdateProjectInput) => {
    const input = updateProjectSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const workspacePath = resolveRegisteredProjectPathForHost(input.projectId, activeHostSnapshot);
    if (Object.hasOwn(input, "name")) setProjectDisplayName(workspacePath, input.name);
    if (Object.hasOwn(input, "pinned")) setProjectPinned(workspacePath, Boolean(input.pinned));
    return readStateForProjectHostAction(activeHostSnapshot);
  });
}

export function registerProjectRemoveIpc<Host extends ProjectSelectHost = ProjectSelectHost>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  resolveRegisteredProjectPathForHost,
  normalizeWorkspacePath,
  listRegisteredProjectPaths,
  pathExists,
  removeProject,
  switchWorkspace,
  disposeProjectRuntimeHost,
  readStateForProjectHostAction,
}: RegisterProjectRemoveIpcDependencies<Host>): void {
  handleIpc("project:remove", (_event, raw: ProjectActionInput) => {
    const input = projectActionSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const normalized = normalizeWorkspacePath(resolveRegisteredProjectPathForHost(input.projectId, activeHostSnapshot));
    const activePath = activeHostSnapshot.workspacePath;
    const remaining = listRegisteredProjectPaths()
      .map((workspacePath) => normalizeWorkspacePath(workspacePath))
      .filter((workspacePath) => workspacePath !== normalized && pathExists(workspacePath));
    if (normalized === activePath && !remaining[0]) throw new Error("Cannot remove the only open project.");
    removeProject(normalized);
    if (normalized === activePath) {
      const state = switchWorkspace(remaining[0]!);
      disposeProjectRuntimeHost(normalized, "Project runtime host disposed because the project was removed.");
      return state;
    }
    disposeProjectRuntimeHost(normalized, "Project runtime host disposed because the project was removed.");
    return readStateForProjectHostAction(activeHostSnapshot);
  });
}

export function registerProjectRevealIpc<Host extends ProjectSelectHost = ProjectSelectHost>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  resolveRegisteredProjectPathForHost,
  openProjectPath,
  showProjectInFolder,
}: RegisterProjectRevealIpcDependencies<Host>): void {
  handleIpc("project:reveal", async (_event, raw: ProjectActionInput) => {
    const input = projectActionSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const workspacePath = resolveRegisteredProjectPathForHost(input.projectId, activeHostSnapshot);
    const error = await openProjectPath(workspacePath);
    if (error) showProjectInFolder(workspacePath);
  });
}

export function registerProjectArchiveChatsIpc<Host extends ProjectSelectHost = ProjectSelectHost>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  resolveRegisteredProjectPathForHost,
  normalizeWorkspacePath,
  projectRuntimeHostForWorkspacePath,
  archiveProjectChatsForHost,
  initialActiveThreadIdForHost,
  setProjectHostActiveThreadId,
  emitProjectStateIfActive,
  archiveProjectChats,
  readStateForProjectHostAction,
}: RegisterProjectArchiveChatsIpcDependencies<Host>): void {
  handleIpc("project:archive-chats", (_event, raw: ProjectActionInput) => {
    const input = projectActionSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const normalized = normalizeWorkspacePath(resolveRegisteredProjectPathForHost(input.projectId, activeHostSnapshot));
    const host = projectRuntimeHostForWorkspacePath(normalized);
    if (host) {
      archiveProjectChatsForHost(host);
      const threadId = setProjectHostActiveThreadId(host, initialActiveThreadIdForHost(host));
      emitProjectStateIfActive(host, threadId);
      return readStateForProjectHostAction(host, threadId);
    }
    archiveProjectChats(normalized);
    return readStateForProjectHostAction(activeHostSnapshot);
  });
}

export function registerProjectPermanentWorktreeIpc<Host extends ProjectSelectHost = ProjectSelectHost>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  resolveRegisteredProjectPathForHost,
  normalizeWorkspacePath,
  showOpenDialog,
  createPermanentWorktree,
  permanentWorktreeBranchName,
  switchWorkspace,
}: RegisterProjectPermanentWorktreeIpcDependencies<Host>): void {
  handleIpc("project:create-permanent-worktree", async (_event, raw: ProjectActionInput) => {
    const input = projectActionSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const projectPath = normalizeWorkspacePath(resolveRegisteredProjectPathForHost(input.projectId, activeHostSnapshot));
    const result = await showOpenDialog({
      title: "Create permanent worktree",
      buttonLabel: "Create Worktree",
      defaultPath: join(dirname(projectPath), `${basename(projectPath) || "project"}-worktree`),
      properties: ["openDirectory", "createDirectory", "promptToCreate"],
    });
    if (result.canceled || !result.filePaths[0]) return undefined;
    const worktreePath = normalizeWorkspacePath(result.filePaths[0]);
    await createPermanentWorktree(projectPath, worktreePath, permanentWorktreeBranchName(projectPath));
    return switchWorkspace(worktreePath);
  });
}
