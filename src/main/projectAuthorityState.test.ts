import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";
import { AUTHORITY_STATE_ROOT_ENV, workspaceAuthorityStatePaths } from "./workspaceAuthorityState";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const originalAuthorityStateRoot = process.env[AUTHORITY_STATE_ROOT_ENV];

describeNative("workspace authority state", () => {
  afterEach(() => {
    if (originalAuthorityStateRoot === undefined) delete process.env[AUTHORITY_STATE_ROOT_ENV];
    else process.env[AUTHORITY_STATE_ROOT_ENV] = originalAuthorityStateRoot;
  });

  it("creates the authority database outside the workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-authority-state-"));
    const workspacePath = join(root, "workspace");
    const authorityRoot = join(root, "user-data", "authority-state");
    const store = new ProjectStore();
    process.env[AUTHORITY_STATE_ROOT_ENV] = authorityRoot;

    try {
      const workspace = store.openWorkspace(workspacePath);

      expect(workspace.path).toBe(workspacePath);
      expect(workspace.statePath.startsWith(authorityRoot)).toBe(true);
      expect(workspace.statePath.startsWith(workspacePath)).toBe(false);
      expect(existsSync(join(workspace.statePath, "state.sqlite"))).toBe(true);
      expect(existsSync(join(workspacePath, ".ambient-codex", "state.sqlite"))).toBe(false);
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("migrates legacy workspace state once and stops reading the legacy database", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-authority-migration-"));
    const workspacePath = join(root, "workspace");
    const authorityRoot = join(root, "user-data", "authority-state");
    const legacyStatePath = join(workspacePath, ".ambient-codex");
    const legacyDbPath = join(legacyStatePath, "state.sqlite");
    const store = new ProjectStore();
    process.env[AUTHORITY_STATE_ROOT_ENV] = authorityRoot;

    try {
      await mkdir(join(legacyStatePath, "sessions", "thread-1"), { recursive: true });
      await mkdir(join(legacyStatePath, "browser"), { recursive: true });
      await writeFile(join(legacyStatePath, "sessions", "thread-1", "session.jsonl"), "{}\n", "utf8");
      await writeFile(join(legacyStatePath, "browser", "credentials.json"), "{\"credentials\":[]}\n", "utf8");

      const legacy = new Database(legacyDbPath);
      legacy.pragma("journal_mode = DELETE");
      legacy.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL)");
      legacy.prepare("INSERT INTO settings (key, value_json) VALUES (?, ?)").run("permissionMode", JSON.stringify("workspace"));
      legacy.close();

      const workspace = store.openWorkspace(workspacePath);
      expect(workspace.statePath.startsWith(authorityRoot)).toBe(true);
      expect(store.getDefaultSettings().permissionMode).toBe("workspace");
      expect(await readFile(join(workspace.sessionPath, "thread-1", "session.jsonl"), "utf8")).toBe("{}\n");
      expect(await readFile(join(workspace.statePath, "browser", "credentials.json"), "utf8")).toBe("{\"credentials\":[]}\n");

      store.close();
      const tamperedLegacy = new Database(legacyDbPath);
      tamperedLegacy.prepare("UPDATE settings SET value_json = ? WHERE key = ?").run(JSON.stringify("full-access"), "permissionMode");
      tamperedLegacy.close();

      store.openWorkspace(workspacePath);
      expect(store.getDefaultSettings().permissionMode).toBe("workspace");
      expect(workspaceAuthorityStatePaths(workspacePath).dbPath).not.toBe(legacyDbPath);
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
