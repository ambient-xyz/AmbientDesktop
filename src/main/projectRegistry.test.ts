import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";
import { ProjectRegistry, archiveProjectChats, projectIdFromWorkspacePath } from "./projectRegistry";
import { AUTHORITY_STATE_ROOT_ENV } from "./workspaceAuthorityState";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const originalAuthorityStateRoot = process.env[AUTHORITY_STATE_ROOT_ENV];

describeNative("ProjectRegistry", () => {
  afterEach(() => {
    if (originalAuthorityStateRoot === undefined) delete process.env[AUTHORITY_STATE_ROOT_ENV];
    else process.env[AUTHORITY_STATE_ROOT_ENV] = originalAuthorityStateRoot;
  });

  it("persists project display metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-project-registry-"));
    const store = new ProjectStore();
    try {
      const projectPath = join(root, "workspace");
      process.env[AUTHORITY_STATE_ROOT_ENV] = join(root, "authority-state");
      const registry = new ProjectRegistry(join(root, "projects.json"));
      store.openWorkspace(projectPath);
      store.createThread("Hello");
      registry.register(projectPath);
      registry.setDisplayName(projectPath, "Renamed project");
      registry.setPinned(projectPath, true);

      expect(registry.listProjects(projectPath)[0]).toMatchObject({
        id: projectIdFromWorkspacePath(projectPath),
        path: projectPath,
        name: "Renamed project",
        pinned: true,
      });
      expect(registry.resolveProjectId(projectIdFromWorkspacePath(projectPath), projectPath)).toBe(projectPath);
      expect(() => registry.resolveProjectId("unregistered", projectPath)).toThrow(/not registered/);
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("archives project chats without deleting project state", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-project-archive-"));
    const store = new ProjectStore();
    try {
      const projectPath = join(root, "workspace");
      process.env[AUTHORITY_STATE_ROOT_ENV] = join(root, "authority-state");
      store.openWorkspace(projectPath);
      store.createThread("Archive me");

      expect(archiveProjectChats(projectPath)).toBeGreaterThan(0);
      expect(new ProjectRegistry(join(root, "projects.json")).listProjects(projectPath)[0]?.threads).toHaveLength(0);
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("hides workflow agent control chats from inactive project summaries", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-project-workflow-hidden-"));
    const store = new ProjectStore();
    try {
      const projectPath = join(root, "workspace");
      process.env[AUTHORITY_STATE_ROOT_ENV] = join(root, "authority-state");
      const registry = new ProjectRegistry(join(root, "projects.json"));
      store.openWorkspace(projectPath);
      store.createThread("Visible project chat");
      const artifact = store.createWorkflowArtifact({
        title: "Date night workflow",
        status: "ready_for_preview",
        manifest: { tools: ["ambient.search"], mutationPolicy: "read_only" },
        spec: { goal: "Find date-night events.", summary: "Research upcoming events and report options." },
        sourcePath: join(projectPath, ".ambient-codex", "workflows", "date-night", "main.ts"),
        statePath: join(projectPath, ".ambient-codex", "workflows", "date-night", "state.json"),
      });
      const workflowThread = store
        .listWorkflowAgentFolders()
        .flatMap((folder) => folder.threads)
        .find((thread) => thread.activeArtifactId === artifact.id);
      expect(workflowThread?.chatThreadId).toBeTruthy();
      expect(store.getThread(workflowThread!.chatThreadId!).title).toBe("Workflow: Date night workflow");
      registry.register(projectPath);

      const visibleThreadTitles = registry.listProjects(projectPath)[0]?.threads.map((thread) => thread.title) ?? [];
      expect(visibleThreadTitles).toContain("Visible project chat");
      expect(visibleThreadTitles).not.toContain("Workflow: Date night workflow");
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
