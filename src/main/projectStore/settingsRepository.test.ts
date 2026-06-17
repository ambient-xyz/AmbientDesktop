import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStoreSettingsRepository } from "./settingsRepository";
import { ProjectStoreSettingsRepository as LegacyProjectStoreSettingsRepository } from "./projectStoreSettingsRepository";

describe("ProjectStoreSettingsRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreSettingsRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );
      CREATE TABLE plugin_settings (
        plugin_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE plugin_trust (
        plugin_id TEXT PRIMARY KEY,
        fingerprint TEXT,
        trusted_at TEXT NOT NULL
      );
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        permission_mode TEXT NOT NULL,
        last_message_preview TEXT NOT NULL
      );
      CREATE TABLE messages (thread_id TEXT NOT NULL);
      CREATE TABLE runs (thread_id TEXT NOT NULL);
      CREATE TABLE orchestration_runs (thread_id TEXT NOT NULL);
    `);
    repository = new ProjectStoreSettingsRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("keeps the legacy import path as a re-export", () => {
    expect(LegacyProjectStoreSettingsRepository).toBe(ProjectStoreSettingsRepository);
  });

  it("persists default settings through the settings repository", () => {
    repository.ensureDefaultSettings();

    expect(repository.getDefaultSettings()).toMatchObject({
      permissionMode: "workspace",
      collaborationMode: "agent",
      thinkingLevel: "xhigh",
      planner: { autoFinalize: true },
    });
    expect(repository.getAutomationAutoDispatchEnabled()).toBe(true);
  });

  it("persists plugin trust independently from plugin enablement", () => {
    const pluginId = ".agents/plugins/marketplace.json:ambient-fixture";

    expect(repository.isPluginEnabled(pluginId)).toBe(true);
    expect(repository.isPluginTrusted(pluginId)).toBe(false);

    repository.setPluginTrusted(pluginId, true, "fingerprint-a");
    repository.setPluginEnabled(pluginId, false);

    expect(repository.isPluginEnabled(pluginId)).toBe(false);
    expect(repository.isPluginTrusted(pluginId)).toBe(true);
    expect(repository.isPluginTrusted(pluginId, "fingerprint-a")).toBe(true);
    expect(repository.isPluginTrusted(pluginId, "fingerprint-b")).toBe(false);

    repository.setPluginTrusted(pluginId, false);
    expect(repository.isPluginTrusted(pluginId)).toBe(false);
  });

  it("keeps Pi packages disabled by default and clears explicit state", () => {
    const packageId = "ambient-workspace:/workspace/plugins/pi-fixture/package.json:./plugins/pi-fixture";

    expect(repository.isPiPackageEnabled(packageId)).toBe(false);
    repository.setPiPackageEnabled(packageId, true);
    expect(repository.isPiPackageEnabled(packageId)).toBe(true);
    repository.setPiPackageEnabled(packageId, false);
    expect(repository.isPiPackageEnabled(packageId)).toBe(false);
    repository.setPiPackageEnabled(packageId, true);
    repository.clearPiPackageEnabled(packageId);
    expect(repository.isPiPackageEnabled(packageId)).toBe(false);
  });
});
