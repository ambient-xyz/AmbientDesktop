import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "../projectStore/projectStore";
import { restoreWorkflowVersion } from "./workflowVersionRestore";
import { commitWorkflowVersionRepo } from "./workflowVersioning";
import { runDueWorkflowArtifactSchedules } from "./workflowScheduleDispatch";
import { workflowVersionHistoryModel } from "../../renderer/src/workflowVersionHistoryUiModel";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("restoreWorkflowVersion", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-version-restore-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("restores a prior committed workflow version as a new review version", async () => {
    const repoPath = join(store.getWorkspace().statePath, "workflows", "restore-fixture");
    await mkdir(repoPath, { recursive: true });
    await writeWorkflowFiles(repoPath, "v1");
    const firstCommit = await commitWorkflowVersionRepo({ repoPath, message: "Create version 1" });

    const thread = store.createWorkflowAgentThreadSummary({
      title: "Restore fixture",
      initialRequest: "Restore an older workflow.",
      projectPath: workspacePath,
    });
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Restore fixture",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Fixture v1" },
      sourcePath: join(repoPath, "main.ts"),
      statePath: join(repoPath, "state.json"),
    });
    const firstGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Graph v1",
      nodes: [{ id: "request", type: "request", label: "Request v1" }],
      edges: [],
      artifactPath: join(repoPath, "graph.json"),
    });
    const firstVersion = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: artifact.id,
      graphSnapshotId: firstGraph.id,
      sourcePath: artifact.sourcePath,
      repoPath,
      gitCommitHash: firstCommit.commitHash,
      status: "approved",
      createdBy: "compiler",
    });

    await writeWorkflowFiles(repoPath, "v2");
    const secondCommit = await commitWorkflowVersionRepo({ repoPath, message: "Create version 2" });
    const secondGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Graph v2",
      nodes: [{ id: "request", type: "request", label: "Request v2" }],
      edges: [],
      artifactPath: join(repoPath, "graph.json"),
    });
    store.updateWorkflowArtifact({
      id: artifact.id,
      status: "approved",
      spec: { goal: "Fixture v2" },
      manifest: { tools: [], mutationPolicy: "read_only" },
    });
    store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: artifact.id,
      graphSnapshotId: secondGraph.id,
      sourcePath: artifact.sourcePath,
      repoPath,
      gitCommitHash: secondCommit.commitHash,
      status: "approved",
      createdBy: "compiler",
    });

    const dashboard = await restoreWorkflowVersion(store, { versionId: firstVersion.id });
    const restoredArtifact = dashboard.artifacts.find((candidate) => candidate.id === artifact.id)!;
    const versions = store.listWorkflowVersions(thread.id);
    const restoredVersion = versions[0];
    const restoredRun = dashboard.runs.find((run) => run.artifactId === artifact.id && run.status === "previewed")!;

    expect(restoredArtifact).toMatchObject({
      status: "ready_for_preview",
      spec: { goal: "Fixture v1" },
    });
    await expect(readFile(artifact.sourcePath, "utf8")).resolves.toContain("v1");
    expect(restoredVersion).toMatchObject({
      version: 3,
      status: "ready_for_review",
      createdBy: "version_revert",
      artifactId: artifact.id,
    });
    expect(restoredVersion.gitCommitHash).toMatch(/^[a-f0-9]{40}$/);
    expect(restoredVersion.gitCommitHash).not.toBe(firstCommit.commitHash);
    expect(store.getWorkflowAgentThreadSummary(thread.id)).toMatchObject({
      activeArtifactId: artifact.id,
      activeGraphSnapshotId: restoredVersion.graphSnapshotId,
      phase: "ready_for_review",
      latestVersion: expect.objectContaining({ id: restoredVersion.id }),
    });
    expect(store.listWorkflowRunEvents(restoredRun.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "workflow.version_restored",
          data: expect.objectContaining({
            targetVersionId: firstVersion.id,
            restoredVersionId: restoredVersion.id,
          }),
        }),
      ]),
    );
  });

  it("can restore a prior committed workflow version as latest approved for schedules", async () => {
    const repoPath = join(store.getWorkspace().statePath, "workflows", "restore-approved-fixture");
    await mkdir(repoPath, { recursive: true });
    await writeWorkflowFiles(repoPath, "v1");
    const firstCommit = await commitWorkflowVersionRepo({ repoPath, message: "Create version 1" });

    const thread = store.createWorkflowAgentThreadSummary({
      title: "Restore approved fixture",
      initialRequest: "Restore an approved workflow.",
      projectPath: workspacePath,
    });
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Restore approved fixture",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Fixture v1" },
      sourcePath: join(repoPath, "main.ts"),
      statePath: join(repoPath, "state.json"),
    });
    const firstGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Graph v1",
      nodes: [{ id: "request", type: "request", label: "Request v1" }],
      edges: [],
      artifactPath: join(repoPath, "graph.json"),
    });
    const firstVersion = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: artifact.id,
      graphSnapshotId: firstGraph.id,
      sourcePath: artifact.sourcePath,
      repoPath,
      gitCommitHash: firstCommit.commitHash,
      status: "approved",
      createdBy: "compiler",
    });

    await writeWorkflowFiles(repoPath, "v2");
    const secondCommit = await commitWorkflowVersionRepo({ repoPath, message: "Create version 2" });
    const secondGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Graph v2",
      nodes: [{ id: "request", type: "request", label: "Request v2" }],
      edges: [],
      artifactPath: join(repoPath, "graph.json"),
    });
    store.updateWorkflowArtifact({
      id: artifact.id,
      status: "approved",
      spec: { goal: "Fixture v2" },
      manifest: { tools: [], mutationPolicy: "read_only" },
    });
    store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: artifact.id,
      graphSnapshotId: secondGraph.id,
      sourcePath: artifact.sourcePath,
      repoPath,
      gitCommitHash: secondCommit.commitHash,
      status: "approved",
      createdBy: "compiler",
    });
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_thread",
        targetId: thread.id,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      new Date(2026, 0, 1, 8, 0, 0, 0),
    )[0];

    const dashboard = await restoreWorkflowVersion(store, { versionId: firstVersion.id, approveRestored: true });
    const versions = store.listWorkflowVersions(thread.id);
    const restoredVersion = versions[0];
    const restoredArtifact = dashboard.artifacts.find((candidate) => candidate.id === artifact.id)!;
    const restoredRun = dashboard.runs.find((run) => run.artifactId === artifact.id && run.status === "previewed")!;

    expect(restoredArtifact).toMatchObject({
      status: "approved",
      spec: { goal: "Fixture v1" },
    });
    expect(restoredVersion).toMatchObject({
      version: 3,
      status: "approved",
      createdBy: "version_revert",
      artifactId: artifact.id,
    });
    expect(store.getLatestApprovedWorkflowVersion(thread.id)).toMatchObject({ id: restoredVersion.id, version: 3 });
    expect(store.getWorkflowAgentThreadSummary(thread.id)).toMatchObject({
      phase: "approved",
      latestVersion: expect.objectContaining({ id: restoredVersion.id, status: "approved" }),
    });
    expect(store.listWorkflowRunEvents(restoredRun.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "workflow.version_restored",
          data: expect.objectContaining({
            targetVersionId: firstVersion.id,
            restoredVersionId: restoredVersion.id,
            approved: true,
          }),
        }),
        expect.objectContaining({
          type: "workflow.artifact_review",
          message: "approved",
          data: expect.objectContaining({ versionId: restoredVersion.id }),
        }),
      ]),
    );

    const results = await runDueWorkflowArtifactSchedules(store, new Date(2026, 0, 1, 10, 0, 0, 0), async ({ artifact: runnerArtifact }) => {
      expect(runnerArtifact.id).toBe(artifact.id);
      const run = store.startWorkflowRun({ artifactId: runnerArtifact.id, status: "succeeded" });
      return { runId: run.id };
    });

    expect(results).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        artifactId: artifact.id,
        workflowThreadId: thread.id,
        versionId: restoredVersion.id,
        outcome: "started",
      }),
    ]);
  });

  it("dogfoods recovering a regressed approved workflow by restoring a prior version", async () => {
    const repoPath = join(store.getWorkspace().statePath, "workflows", "restore-regression-dogfood");
    await mkdir(repoPath, { recursive: true });
    await writeWorkflowFiles(repoPath, "v1");
    const firstCommit = await commitWorkflowVersionRepo({ repoPath, message: "Create stable version" });

    const thread = store.createWorkflowAgentThreadSummary({
      title: "Restore regression dogfood",
      initialRequest: "Recover a workflow after an approved revision regresses.",
      projectPath: workspacePath,
    });
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Restore regression dogfood",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Fixture v1" },
      sourcePath: join(repoPath, "main.ts"),
      statePath: join(repoPath, "state.json"),
    });
    const firstGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Graph v1",
      nodes: [{ id: "request", type: "request", label: "Request v1" }],
      edges: [],
      artifactPath: join(repoPath, "graph.json"),
    });
    const firstVersion = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: artifact.id,
      graphSnapshotId: firstGraph.id,
      sourcePath: artifact.sourcePath,
      repoPath,
      gitCommitHash: firstCommit.commitHash,
      status: "approved",
      createdBy: "compiler",
    });

    await writeWorkflowFiles(repoPath, "v2", { source: `export default async function run() { throw new Error("intentional regression"); }\n` });
    const secondCommit = await commitWorkflowVersionRepo({ repoPath, message: "Create regressed version" });
    const secondGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Graph v2",
      nodes: [{ id: "request", type: "request", label: "Request v2" }],
      edges: [],
      artifactPath: join(repoPath, "graph.json"),
    });
    store.updateWorkflowArtifact({
      id: artifact.id,
      status: "approved",
      spec: { goal: "Fixture v2" },
      manifest: { tools: [], mutationPolicy: "read_only" },
    });
    const regressedVersion = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: artifact.id,
      graphSnapshotId: secondGraph.id,
      sourcePath: artifact.sourcePath,
      repoPath,
      gitCommitHash: secondCommit.commitHash,
      status: "approved",
      createdBy: "compiler",
    });
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_thread",
        targetId: thread.id,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      new Date(2026, 0, 1, 8, 0, 0, 0),
    )[0];
    const failedRun = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
    store.appendWorkflowRunEvent({
      runId: failedRun.id,
      type: "workflow.step.failed",
      message: "Approved revision failed during dogfood.",
      data: { versionId: regressedVersion.id, error: "intentional regression" },
    });
    store.updateWorkflowRun({ id: failedRun.id, status: "failed", error: "intentional regression", finish: true });

    expect(store.getWorkflowAgentThreadSummary(thread.id)).toMatchObject({
      phase: "failed",
      latestVersion: expect.objectContaining({ id: regressedVersion.id, version: 2, status: "approved" }),
    });

    const dashboard = await restoreWorkflowVersion(store, { versionId: firstVersion.id, approveRestored: true });
    const versions = store.listWorkflowVersions(thread.id);
    const restoredVersion = versions[0];
    const restoredArtifact = dashboard.artifacts.find((candidate) => candidate.id === artifact.id)!;
    const restoredThread = store.getWorkflowAgentThreadSummary(thread.id);
    const history = workflowVersionHistoryModel({ thread: restoredThread, artifact: restoredArtifact, versions });

    expect(restoredArtifact).toMatchObject({ status: "approved", spec: { goal: "Fixture v1" } });
    await expect(readFile(artifact.sourcePath, "utf8")).resolves.toContain("v1");
    expect(restoredVersion).toMatchObject({
      version: 3,
      status: "approved",
      createdBy: "version_revert",
      artifactId: artifact.id,
    });
    expect(restoredThread).toMatchObject({
      phase: "approved",
      latestVersion: expect.objectContaining({ id: restoredVersion.id }),
      activeGraphSnapshotId: restoredVersion.graphSnapshotId,
    });
    expect(history.items[0]).toMatchObject({
      id: restoredVersion.id,
      badges: ["Current", "Latest approved"],
      createdByLabel: "Version restore",
      comparisonTitle: "Latest approved baseline",
    });
    expect(history.items.find((item) => item.id === regressedVersion.id)).toMatchObject({
      comparisonTitle: "Compared with v3",
      comparisonDetails: ["Different source commit from latest approved.", "Different graph snapshot from latest approved."],
    });

    const results = await runDueWorkflowArtifactSchedules(store, new Date(2026, 0, 1, 10, 0, 0, 0), async ({ artifact: runnerArtifact }) => {
      expect(runnerArtifact.id).toBe(artifact.id);
      const run = store.startWorkflowRun({ artifactId: runnerArtifact.id, status: "succeeded" });
      return { runId: run.id };
    });

    expect(results).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        artifactId: artifact.id,
        workflowThreadId: thread.id,
        versionId: restoredVersion.id,
        outcome: "started",
      }),
    ]);

    await writeVersionRestoreDogfoodArtifact({
      thread: { id: thread.id, phase: restoredThread.phase },
      failedRun: { id: failedRun.id, status: store.getWorkflowRun(failedRun.id).status },
      restoredVersion: { id: restoredVersion.id, version: restoredVersion.version, status: restoredVersion.status },
      latestApprovedVersionId: store.getLatestApprovedWorkflowVersion(thread.id)?.id,
      history: history.items.map((item) => ({
        version: item.version,
        badges: item.badges,
        comparisonTitle: item.comparisonTitle,
        comparisonDetails: item.comparisonDetails,
      })),
      scheduleResult: results[0],
    });
  });
});

async function writeWorkflowFiles(repoPath: string, label: "v1" | "v2", options: { source?: string } = {}): Promise<void> {
  await writeFile(join(repoPath, "manifest.json"), `${JSON.stringify({ tools: [], mutationPolicy: "read_only" }, null, 2)}\n`, "utf8");
  await writeFile(join(repoPath, "spec.json"), `${JSON.stringify({ goal: `Fixture ${label}` }, null, 2)}\n`, "utf8");
  await writeFile(
    join(repoPath, "main.ts"),
    options.source ?? `export default async function run({ workflow }) { await workflow.emit({ type: "fixture.${label}" }); }\n`,
    "utf8",
  );
  await writeFile(
    join(repoPath, "graph.json"),
    `${JSON.stringify({ summary: `Graph ${label}`, nodes: [{ id: "request", type: "request", label: `Request ${label}` }], edges: [] }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(repoPath, "preview.md"), `# Preview ${label}\n`, "utf8");
  await writeFile(join(repoPath, "compile-context.json"), `${JSON.stringify({ label }, null, 2)}\n`, "utf8");
}

async function writeVersionRestoreDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-version-restore-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
