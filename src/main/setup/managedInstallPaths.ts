import { existsSync } from "node:fs";
import { cp, lstat, mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);

export const MANAGED_INSTALL_ROOT_ENV = "AMBIENT_MANAGED_INSTALL_ROOT";

const managedInstallMigrationIgnoredDirectoryNames = new Set([".git", ".hg", ".svn"]);

interface ElectronRuntime {
  app?: { getPath(name: string): string };
}

export function managedInstallWorkspacePath(workspacePath?: string, env: NodeJS.ProcessEnv = process.env): string {
  const explicitRoot = env[MANAGED_INSTALL_ROOT_ENV]?.trim();
  if (explicitRoot) return resolve(explicitRoot);
  const electronUserData = electronUserDataPath();
  if (electronUserData) return join(electronUserData, "managed-installs");
  const e2eUserData = env.AMBIENT_E2E_USER_DATA?.trim();
  if (e2eUserData) return join(resolve(e2eUserData), "managed-installs");
  if (workspacePath?.trim()) return resolve(workspacePath);
  return join(tmpdir(), "ambient-desktop-managed-installs");
}

export function managedInstallPath(workspacePath: string, relativePath: string): string {
  return resolve(managedInstallWorkspacePath(workspacePath), relativePath);
}

export async function migrateWorkspaceManagedInstallPath(workspacePath: string, relativePath: string): Promise<void> {
  const managedWorkspace = managedInstallWorkspacePath(workspacePath);
  const workspace = resolve(workspacePath);
  if (managedWorkspace === workspace) return;
  const source = resolve(workspace, relativePath);
  const destination = resolve(managedWorkspace, relativePath);
  if (!existsSync(source)) return;
  await copyMissingManagedInstallEntries(source, destination);
}

async function copyMissingManagedInstallEntries(source: string, destination: string): Promise<void> {
  let sourceStat;
  try {
    sourceStat = await lstat(source);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return;
    throw error;
  }

  if (sourceStat.isDirectory()) {
    if (existsSync(destination)) {
      const destinationStat = await lstat(destination).catch((error: unknown) => {
        if (isErrno(error, "ENOENT")) return undefined;
        throw error;
      });
      if (destinationStat && !destinationStat.isDirectory()) return;
    } else {
      try {
        await mkdir(destination, { recursive: true });
      } catch (error) {
        if (!isErrno(error, "EEXIST")) throw error;
      }
    }

    const entries = await readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      if (managedInstallMigrationIgnoredDirectoryNames.has(entry.name)) continue;
      await copyMissingManagedInstallEntries(resolve(source, entry.name), resolve(destination, entry.name));
    }
    return;
  }

  if (existsSync(destination)) return;
  try {
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, { dereference: false, errorOnExist: false, force: false });
  } catch (error) {
    if (!isErrno(error, "EEXIST")) throw error;
  }
}

function electronUserDataPath(): string | undefined {
  try {
    const electron = require("electron") as ElectronRuntime;
    return electron.app?.getPath("userData");
  } catch {
    return undefined;
  }
}

function isErrno(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === code);
}
