import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board deliverable integration facade (requires Node ABI better-sqlite3 build)", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-store-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("applies material deliverables from completed Local Task workspaces and excludes runtime folders", async () => {
    const board = store.createProjectBoard({ title: "Deliverable integration board" });
    const draft = store.createProjectBoardManualCard({ boardId: board.id, title: "Build Pomodoro root" });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Pomodoro app files are generated."],
      testPlan: { unit: ["Run deterministic proof."], integration: [], visual: [], manual: [] },
    });
    const card = store.approveProjectBoardCard(ready.id);
    const task = store.getOrchestrationTask(card.orchestrationTaskId!);
    const runWorkspace = join(workspacePath, ".ambient-codex", "orchestration", "workspaces", task.identifier);
    await mkdir(join(runWorkspace, "src"), { recursive: true });
    await mkdir(join(runWorkspace, "tests"), { recursive: true });
    await mkdir(join(runWorkspace, ".ambient"), { recursive: true });
    await mkdir(join(runWorkspace, "node_modules", "cache"), { recursive: true });
    await writeFile(join(runWorkspace, "index.html"), "<main>Pomodoro</main>\n", "utf8");
    await writeFile(join(runWorkspace, "src", "timer.ts"), "export const minutes = 25;\n", "utf8");
    await writeFile(join(runWorkspace, "tests", "timer.spec.ts"), "expect(25).toBe(25);\n", "utf8");
    await writeFile(join(runWorkspace, ".ambient", "runtime.json"), "{\"runtime\":true}\n", "utf8");
    await writeFile(join(runWorkspace, "node_modules", "cache", "index.js"), "module.exports = {};\n", "utf8");
    const run = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: runWorkspace });
    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      finish: true,
      proofOfWork: {
        kind: "agent-run",
        changedFiles: ["index.html", "src/timer.ts", "tests/timer.spec.ts", ".ambient/runtime.json", "node_modules/cache/index.js"],
        commands: ["pnpm test"],
        commits: ["abc123"],
        dependencyImports: ["date-fns"],
      },
    });

    await store.resolveProjectBoardDeliverableIntegration({ boardId: board.id, runId: run.id, action: "apply_to_root" });

    await expect(readFile(join(workspacePath, "index.html"), "utf8")).resolves.toContain("Pomodoro");
    await expect(readFile(join(workspacePath, "src", "timer.ts"), "utf8")).resolves.toContain("minutes");
    await expect(readFile(join(workspacePath, "tests", "timer.spec.ts"), "utf8")).resolves.toContain("toBe");
    await expect(access(join(workspacePath, ".ambient", "runtime.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(workspacePath, "node_modules", "cache", "index.js"))).rejects.toMatchObject({ code: "ENOENT" });
    const event = store.getActiveProjectBoard()?.events?.find((candidate) => candidate.kind === "deliverable_integration_resolved");
    expect(event).toMatchObject({
      kind: "deliverable_integration_resolved",
      entityId: run.id,
      metadata: expect.objectContaining({
        action: "apply_to_root",
        status: "integrated",
        materialFiles: ["index.html", "src/timer.ts", "tests/timer.spec.ts"],
        excludedFiles: [".ambient/runtime.json", "node_modules/cache/index.js"],
        appliedFiles: ["index.html", "src/timer.ts", "tests/timer.spec.ts"],
        commands: ["pnpm test"],
        commits: ["abc123"],
        dependencyImports: ["date-fns"],
      }),
    });
  });

  it("exports deliverable bundles and records explicit defer decisions", async () => {
    const board = store.createProjectBoard({ title: "Deliverable bundle board" });
    const createCompletedRun = async (title: string, relativeFile: string, content: string) => {
      const draft = store.createProjectBoardManualCard({ boardId: board.id, title });
      const ready = store.updateProjectBoardCard({
        cardId: draft.id,
        candidateStatus: "ready_to_create",
        acceptanceCriteria: [`${title} is generated.`],
        testPlan: { unit: ["Run focused proof."], integration: [], visual: [], manual: [] },
      });
      const card = store.approveProjectBoardCard(ready.id);
      const task = store.getOrchestrationTask(card.orchestrationTaskId!);
      const runWorkspace = join(workspacePath, ".ambient-codex", "orchestration", "workspaces", task.identifier);
      await mkdir(dirname(join(runWorkspace, relativeFile)), { recursive: true });
      await writeFile(join(runWorkspace, relativeFile), content, "utf8");
      const run = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: runWorkspace });
      store.updateOrchestrationRun({
        id: run.id,
        status: "completed",
        finish: true,
        proofOfWork: { kind: "agent-run", changedFiles: [relativeFile] },
      });
      return { card, task, run, relativeFile };
    };

    const exported = await createCompletedRun("Build recipe index", "src/recipes.ts", "export const recipes = [];\n");
    await store.resolveProjectBoardDeliverableIntegration({ boardId: board.id, runId: exported.run.id, action: "export_bundle" });
    const bundleRoot = join(workspacePath, ".ambient", "project-board", "deliverable-bundles", exported.run.id);
    await expect(readFile(join(bundleRoot, "files", exported.relativeFile), "utf8")).resolves.toContain("recipes");
    const manifest = JSON.parse(await readFile(join(bundleRoot, "manifest.json"), "utf8")) as { integration?: { action?: string }; materialFiles?: Array<{ path?: string }> };
    expect(manifest.integration?.action).toBe("export_bundle");
    expect(manifest.materialFiles?.map((file) => file.path)).toEqual([exported.relativeFile]);

    const deferred = await createCompletedRun("Tune recipe theme", "theme.css", "body { color: tomato; }\n");
    await store.resolveProjectBoardDeliverableIntegration({
      boardId: board.id,
      runId: deferred.run.id,
      action: "defer",
      reason: "Waiting for product approval.",
    });
    await expect(access(join(workspacePath, deferred.relativeFile))).rejects.toMatchObject({ code: "ENOENT" });
    const events = store.getActiveProjectBoard()?.events?.filter((candidate) => candidate.kind === "deliverable_integration_resolved") ?? [];
    expect(events.map((event) => event.metadata.status)).toEqual(["deferred", "exported"]);
    expect(events.find((event) => event.metadata.status === "deferred")?.metadata.reason).toBe("Waiting for product approval.");
    expect(events.find((event) => event.metadata.status === "exported")?.metadata.exportPath).toBe(bundleRoot);
  });
});
