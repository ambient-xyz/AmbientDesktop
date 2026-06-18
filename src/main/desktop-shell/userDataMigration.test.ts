import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ambientLegacyUserDataPaths, migrateAmbientUserData } from "./userDataMigration";

describe("Ambient user data migration", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ambient-user-data-migration-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("finds the package-name user data directory next to the product-name directory", () => {
    expect(ambientLegacyUserDataPaths(join(root, "Ambient Desktop"))).toEqual([join(root, "ambient-codex-desktop")]);
  });

  it("merges legacy project paths before current project paths", async () => {
    const current = join(root, "Ambient Desktop");
    const legacy = join(root, "ambient-codex-desktop");
    await mkdir(current, { recursive: true });
    await mkdir(legacy, { recursive: true });
    await writeFile(join(current, "projects.json"), JSON.stringify({ version: 1, paths: ["/current/project"] }, null, 2), "utf8");
    await writeFile(join(legacy, "projects.json"), JSON.stringify({ version: 1, paths: ["/legacy/project", "/current/project"] }, null, 2), "utf8");
    await mkdir(join(legacy, "workspace", ".ambient-codex"), { recursive: true });
    await writeFile(join(legacy, "workspace", ".ambient-codex", "state.sqlite"), "", "utf8");

    const result = migrateAmbientUserData({ currentUserDataPath: current, legacyUserDataPaths: [legacy] });

    expect(result.importedProjectPaths).toEqual(expect.arrayContaining(["/legacy/project", join(legacy, "workspace")]));
    await expect(readFile(join(current, "projects.json"), "utf8").then(JSON.parse)).resolves.toMatchObject({
      version: 1,
      paths: ["/legacy/project", join(legacy, "workspace"), "/current/project"],
    });
  });

  it("copies missing non-workspace user data files without overwriting current files", async () => {
    const current = join(root, "Ambient Desktop");
    const legacy = join(root, "ambient-codex-desktop");
    await mkdir(join(current, "plugin-auth"), { recursive: true });
    await mkdir(join(legacy, "plugin-auth"), { recursive: true });
    await writeFile(join(current, "window-state.json"), "current-window", "utf8");
    await writeFile(join(legacy, "window-state.json"), "legacy-window", "utf8");
    await writeFile(join(legacy, "preferences.json"), "legacy-preferences", "utf8");
    await writeFile(join(legacy, "plugin-auth", "tokens.json"), "legacy-token", "utf8");

    const result = migrateAmbientUserData({ currentUserDataPath: current, legacyUserDataPaths: [legacy] });

    expect(result.copiedFiles).toEqual(["preferences.json", join("plugin-auth", "tokens.json")]);
    await expect(readFile(join(current, "window-state.json"), "utf8")).resolves.toBe("current-window");
    await expect(readFile(join(current, "preferences.json"), "utf8")).resolves.toBe("legacy-preferences");
    await expect(readFile(join(current, "plugin-auth", "tokens.json"), "utf8")).resolves.toBe("legacy-token");
  });
});
