import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./workspaceProjectStoreFacade";
import { WELCOME_ONBOARDING_METADATA_KIND, WELCOME_ONBOARDING_SEED_VERSION } from "../../shared/welcomeOnboarding";
import { ProjectRegistry } from "./projectRegistry";
import { AUTHORITY_STATE_ROOT_ENV } from "./workspaceAuthorityState";
import {
  ensureWelcomeOnboardingProject,
  WELCOME_ONBOARDING_ASSET_DIR,
  WELCOME_ONBOARDING_PROJECT_NAME,
  welcomeOnboardingWorkspacePath,
} from "./welcomeOnboarding";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const originalAuthorityStateRoot = process.env[AUTHORITY_STATE_ROOT_ENV];

const screenshotNames = [
  "01-main-shell.png",
  "02-planner-mode.png",
  "03-calculator-board.png",
  "04-calculator-draft-inbox.png",
  "05-calculator-map.png",
  "06-git-summary.png",
  "07-plugin-manager.png",
  "08-settings-search.png",
];

const createProjectStore = () => new ProjectStore();

describeNative("welcome onboarding", () => {
  afterEach(() => {
    if (originalAuthorityStateRoot === undefined) delete process.env[AUTHORITY_STATE_ROOT_ENV];
    else process.env[AUTHORITY_STATE_ROOT_ENV] = originalAuthorityStateRoot;
  });

  it("creates the pinned Welcome Folder with seeded setup chats and assets", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-welcome-onboarding-"));
    const store = new ProjectStore();
    try {
      process.env[AUTHORITY_STATE_ROOT_ENV] = join(root, "authority-state");
      const assetsSourcePath = join(root, "assets");
      await mkdir(join(assetsSourcePath, "screenshots"), { recursive: true });
      for (const name of screenshotNames) {
        await writeFile(join(assetsSourcePath, "screenshots", name), `fake image ${name}`);
      }
      const registry = new ProjectRegistry(join(root, "projects.json"));
      const activeWorkspacePath = join(root, "workspace");
      store.openWorkspace(activeWorkspacePath);
      registry.register(activeWorkspacePath);
      store.close();

      const result = ensureWelcomeOnboardingProject({
        userDataPath: root,
        projectRegistry: registry,
        createProjectStore,
        assetsSourcePath,
      });

      expect(result.workspacePath).toBe(join(root, "welcome-folder"));
      expect(result.copiedAssets).toHaveLength(screenshotNames.length);
      expect(registry.listRegisteredPaths()).toEqual([activeWorkspacePath, result.workspacePath]);
      expect(registry.listProjects(result.workspacePath)[0]).toMatchObject({
        name: WELCOME_ONBOARDING_PROJECT_NAME,
        pinned: true,
      });

      store.openWorkspace(result.workspacePath);
      const threads = store.listThreads();
      expect(threads.map((thread) => thread.title)).toEqual(["Instructions", "Core Setup", "Plugin Setup"]);
      expect(threads.every((thread) => thread.pinned)).toBe(true);
      expect(store.getLastActiveThreadId()).toBe(threads.find((thread) => thread.title === "Instructions")?.id);

      const instructions = threads.find((thread) => thread.title === "Instructions");
      const coreSetup = threads.find((thread) => thread.title === "Core Setup");
      const pluginSetup = threads.find((thread) => thread.title === "Plugin Setup");
      expect(instructions).toBeTruthy();
      expect(coreSetup).toBeTruthy();
      expect(pluginSetup).toBeTruthy();
      const instructionsContent = store.listMessages(instructions!.id)[0]?.content ?? "";
      const coreSetupMessage = store.listMessages(coreSetup!.id)[0];
      const pluginSetupContent = store.listMessages(pluginSetup!.id)[0]?.content ?? "";
      expect(instructionsContent).toContain("Clipboard with arrow");
      expect(instructionsContent).toContain("Kanban Board Workflow");
      expect(instructionsContent).toContain("Workflow Recordings");
      expect(instructionsContent).toContain("Review with Ambient");
      expect(instructionsContent).toContain(`${WELCOME_ONBOARDING_ASSET_DIR}/03-calculator-board.png`);
      expect(coreSetupMessage?.content).toContain("Core Setup is the live setup dashboard");
      expect(coreSetupMessage?.metadata).toMatchObject({
        kind: WELCOME_ONBOARDING_METADATA_KIND,
        version: WELCOME_ONBOARDING_SEED_VERSION,
        pageKind: "core_setup",
        productOwned: true,
      });
      expect(pluginSetupContent).toContain("custom MCP servers");
      expect(pluginSetupContent).toContain("generated capabilities");
      expect(pluginSetupContent).not.toContain("Brave Search");

      for (const name of screenshotNames) {
        expect(existsSync(join(result.workspacePath, WELCOME_ONBOARDING_ASSET_DIR, name))).toBe(true);
      }
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not duplicate seeded chats on later startup", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-welcome-onboarding-idempotent-"));
    const store = new ProjectStore();
    try {
      process.env[AUTHORITY_STATE_ROOT_ENV] = join(root, "authority-state");
      const registry = new ProjectRegistry(join(root, "projects.json"));

      const first = ensureWelcomeOnboardingProject({ userDataPath: root, projectRegistry: registry, createProjectStore });
      const second = ensureWelcomeOnboardingProject({ userDataPath: root, projectRegistry: registry, createProjectStore });

      expect(second.instructionsThread.id).toBe(first.instructionsThread.id);
      expect(second.coreSetupThread.id).toBe(first.coreSetupThread.id);
      expect(second.pluginSetupThread.id).toBe(first.pluginSetupThread.id);

      store.openWorkspace(first.workspacePath);
      const threads = store.listThreads();
      expect(threads.map((thread) => thread.title)).toEqual(["Instructions", "Core Setup", "Plugin Setup"]);
      expect(threads.map((thread) => store.listMessages(thread.id))).toEqual([
        expect.arrayContaining([expect.objectContaining({ role: "assistant" })]),
        expect.arrayContaining([expect.objectContaining({ role: "assistant" })]),
        expect.arrayContaining([expect.objectContaining({ role: "assistant" })]),
      ]);
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("archives old product-owned seeded pages while preserving user-created Welcome chats", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-welcome-onboarding-migration-"));
    const store = new ProjectStore();
    try {
      process.env[AUTHORITY_STATE_ROOT_ENV] = join(root, "authority-state");
      const registry = new ProjectRegistry(join(root, "projects.json"));
      const workspacePath = welcomeOnboardingWorkspacePath(root);
      store.openWorkspace(workspacePath);
      const oldInstructions = store.createThread("Instructions", workspacePath);
      store.addMessage({
        threadId: oldInstructions.id,
        role: "assistant",
        content: "old instructions",
        metadata: { kind: WELCOME_ONBOARDING_METADATA_KIND, version: 1 },
      });
      const oldPlugin = store.createThread("Plugin Setup", workspacePath);
      store.addMessage({
        threadId: oldPlugin.id,
        role: "assistant",
        content: "old plugin setup",
        metadata: { kind: WELCOME_ONBOARDING_METADATA_KIND, version: 1 },
      });
      const userPluginNotes = store.createThread("Plugin Setup", workspacePath);
      store.addMessage({
        threadId: userPluginNotes.id,
        role: "user",
        content: "my setup notes",
      });
      store.close();

      ensureWelcomeOnboardingProject({ userDataPath: root, projectRegistry: registry, createProjectStore });

      store.openWorkspace(workspacePath);
      const threads = store.listThreads();
      expect(threads.map((thread) => thread.id)).not.toContain(oldInstructions.id);
      expect(threads.map((thread) => thread.id)).not.toContain(oldPlugin.id);
      expect(threads.map((thread) => thread.id)).toContain(userPluginNotes.id);
      expect(threads.filter((thread) => thread.title === "Instructions")).toHaveLength(1);
      expect(threads.filter((thread) => thread.title === "Core Setup")).toHaveLength(1);
      expect(threads.filter((thread) => thread.title === "Plugin Setup")).toHaveLength(2);
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
