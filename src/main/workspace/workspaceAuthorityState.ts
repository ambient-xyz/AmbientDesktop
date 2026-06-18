import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { workspaceAuthorityId } from "../../shared/projectIdentity";

const require = createRequire(import.meta.url);

export const LEGACY_PROJECT_STATE_DIR = ".ambient-codex";
export const AUTHORITY_STATE_ROOT_ENV = "AMBIENT_AUTHORITY_STATE_ROOT";

export interface WorkspaceAuthorityStatePaths {
  workspacePath: string;
  statePath: string;
  sessionPath: string;
  dbPath: string;
  legacyStatePath: string;
  legacyDbPath: string;
}

interface ElectronRuntime {
  app?: { getPath(name: string): string };
}

export function prepareWorkspaceAuthorityState(workspacePath: string): WorkspaceAuthorityStatePaths {
  const paths = workspaceAuthorityStatePaths(workspacePath);
  if (!existsSync(paths.workspacePath)) mkdirSync(paths.workspacePath, { recursive: true });
  if (!existsSync(paths.statePath)) mkdirSync(paths.statePath, { recursive: true, mode: 0o700 });
  migrateLegacyWorkspaceAuthorityState(paths);
  if (!existsSync(paths.sessionPath)) mkdirSync(paths.sessionPath, { recursive: true, mode: 0o700 });
  return paths;
}

export function workspaceAuthorityStatePaths(workspacePath: string): WorkspaceAuthorityStatePaths {
  const workspace = resolve(workspacePath);
  const statePath = join(workspaceAuthorityStateRoot(), "workspaces", workspaceAuthorityStateDirectoryName(workspace));
  const legacyStatePath = join(workspace, LEGACY_PROJECT_STATE_DIR);
  return {
    workspacePath: workspace,
    statePath,
    sessionPath: join(statePath, "sessions"),
    dbPath: join(statePath, "state.sqlite"),
    legacyStatePath,
    legacyDbPath: join(legacyStatePath, "state.sqlite"),
  };
}

export function workspaceAuthorityStateRoot(env: NodeJS.ProcessEnv = process.env): string {
  const explicitRoot = env[AUTHORITY_STATE_ROOT_ENV]?.trim();
  if (explicitRoot) return resolve(explicitRoot);
  const electronUserData = electronUserDataPath();
  if (electronUserData) return join(electronUserData, "authority-state");
  const e2eUserData = env.AMBIENT_E2E_USER_DATA?.trim();
  if (e2eUserData) return join(resolve(e2eUserData), "authority-state");
  return join(tmpdir(), "ambient-codex-desktop", "authority-state");
}

function workspaceAuthorityStateDirectoryName(workspacePath: string): string {
  const name = safePathSegment(basename(workspacePath)) || "workspace";
  return `${name}-${workspaceAuthorityId(workspacePath).slice(0, 16)}`;
}

function migrateLegacyWorkspaceAuthorityState(paths: WorkspaceAuthorityStatePaths): void {
  copyLegacyFileIfMissing(paths.legacyDbPath, paths.dbPath);
  copyLegacyDirectoryIfMissing(join(paths.legacyStatePath, "sessions"), paths.sessionPath);
  copyLegacyFileIfMissing(
    join(paths.legacyStatePath, "browser", "credentials.json"),
    join(paths.statePath, "browser", "credentials.json"),
  );
}

function copyLegacyFileIfMissing(sourcePath: string, targetPath: string): void {
  if (!existsSync(sourcePath) || existsSync(targetPath)) return;
  mkdirSync(dirname(targetPath), { recursive: true, mode: 0o700 });
  copyFileSync(sourcePath, targetPath);
}

function copyLegacyDirectoryIfMissing(sourcePath: string, targetPath: string): void {
  if (!existsSync(sourcePath) || existsSync(targetPath)) return;
  mkdirSync(dirname(targetPath), { recursive: true, mode: 0o700 });
  cpSync(sourcePath, targetPath, { recursive: true, force: false, errorOnExist: false });
}

function electronUserDataPath(): string | undefined {
  try {
    const electron = require("electron") as ElectronRuntime;
    return electron.app?.getPath("userData");
  } catch {
    return undefined;
  }
}

function safePathSegment(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^\.+|\.+$/g, "");
}
