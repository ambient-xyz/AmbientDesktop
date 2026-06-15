import Database from "better-sqlite3";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const REGISTRY_VERSION = 1;
const PROJECT_STATE_DIR = ".ambient-codex";
const KNOWN_USER_DATA_DIR_NAMES = ["Ambient Desktop", "ambient-codex-desktop"];

interface RegistryFile {
  version: number;
  paths: string[];
}

export interface AmbientUserDataMigrationInput {
  currentUserDataPath: string;
  legacyUserDataPaths?: string[];
}

export interface AmbientUserDataMigrationResult {
  importedProjectPaths: string[];
  copiedFiles: string[];
}

export function ambientLegacyUserDataPaths(currentUserDataPath: string): string[] {
  const current = resolve(currentUserDataPath);
  const parent = dirname(current);
  return KNOWN_USER_DATA_DIR_NAMES
    .map((name) => resolve(parent, name))
    .filter((candidate) => candidate !== current);
}

export function migrateAmbientUserData(input: AmbientUserDataMigrationInput): AmbientUserDataMigrationResult {
  const currentUserDataPath = resolve(input.currentUserDataPath);
  const legacyUserDataPaths = uniquePaths(input.legacyUserDataPaths ?? ambientLegacyUserDataPaths(currentUserDataPath));
  const importedProjectPaths: string[] = [];
  const copiedFiles: string[] = [];
  mkdirSync(currentUserDataPath, { recursive: true });

  for (const legacyUserDataPath of legacyUserDataPaths) {
    if (!existsSync(legacyUserDataPath)) continue;

    importedProjectPaths.push(...readRegistryPaths(join(legacyUserDataPath, "projects.json")));
    const legacyDefaultWorkspace = join(legacyUserDataPath, "workspace");
    if (hasAmbientProjectState(legacyDefaultWorkspace)) importedProjectPaths.push(legacyDefaultWorkspace);

    if (copyFileIfMissing(join(legacyUserDataPath, "window-state.json"), join(currentUserDataPath, "window-state.json"))) {
      copiedFiles.push("window-state.json");
    }
    if (copyFileIfMissing(join(legacyUserDataPath, "preferences.json"), join(currentUserDataPath, "preferences.json"))) {
      copiedFiles.push("preferences.json");
    }
    if (copyFileIfMissing(join(legacyUserDataPath, "plugin-auth", "tokens.json"), join(currentUserDataPath, "plugin-auth", "tokens.json"))) {
      copiedFiles.push(join("plugin-auth", "tokens.json"));
    }
  }

  const currentRegistryPath = join(currentUserDataPath, "projects.json");
  const currentProjectPaths = readRegistryPaths(currentRegistryPath);
  const currentProjectPathSet = new Set(currentProjectPaths.map((path) => resolve(path)));
  const missingImportedProjectPaths = uniquePaths(importedProjectPaths).filter((path) => !currentProjectPathSet.has(resolve(path)));
  const mergedPaths = uniquePaths([...missingImportedProjectPaths, ...currentProjectPaths]);
  if (mergedPaths.length > 0) writeRegistryPaths(currentRegistryPath, mergedPaths);

  return {
    importedProjectPaths: uniquePaths(importedProjectPaths),
    copiedFiles,
  };
}

export function hasAmbientProjectState(workspacePath: string): boolean {
  return existsSync(join(workspacePath, PROJECT_STATE_DIR, "state.sqlite"));
}

export function hasRestorableWorkspaceState(workspacePath: string): boolean {
  const dbPath = join(workspacePath, PROJECT_STATE_DIR, "state.sqlite");
  if (!existsSync(dbPath)) return false;

  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    return (
      tableCount(db, "messages") > 0 ||
      tableCount(db, "orchestration_tasks") > 0 ||
      tableCount(db, "orchestration_runs") > 0 ||
      tableCount(db, "workflow_artifacts") > 0 ||
      tableCount(db, "workflow_runs") > 0 ||
      tableCount(db, "automation_folders", "folder_kind = 'custom'") > 0 ||
      tableCount(db, "threads", "title <> 'New chat' OR last_message_preview <> ''") > 0
    );
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

function readRegistryPaths(filePath: string): string[] {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<RegistryFile>;
    return uniquePaths(Array.isArray(parsed.paths) ? parsed.paths : []);
  } catch {
    return [];
  }
}

function writeRegistryPaths(filePath: string, paths: string[]): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const payload: RegistryFile = { version: REGISTRY_VERSION, paths: uniquePaths(paths) };
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function copyFileIfMissing(source: string, destination: string): boolean {
  if (!existsSync(source) || existsSync(destination)) return false;
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  return true;
}

function tableCount(db: Database.Database, table: string, where?: string): number {
  if (!tableExists(db, table)) return 0;
  const sql = `SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ""}`;
  const row = db.prepare(sql).get() as { count: number } | undefined;
  return row?.count ?? 0;
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { name: string } | undefined;
  return Boolean(row);
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const trimmed = path.trim();
    if (!trimmed) continue;
    const normalized = resolve(trimmed);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
