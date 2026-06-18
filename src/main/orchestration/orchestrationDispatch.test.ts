import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SendMessageInput } from "../../shared/desktopTypes";
import type { AgentRuntime, AgentRuntimeSendHooks } from "../agent-runtime/agentRuntime";
import { ProjectStore } from "./orchestrationProjectStoreFacade";
import {
  listAutoContinuableRestartInterruptedRuns,
  listAutoStartablePreparedOrchestrationRuns,
  prepareAndRecordDueScheduledLocalTaskRuns,
  prepareAndRecordNextOrchestrationRuns,
} from "./orchestrationDispatch";
import { startPreparedOrchestrationRun } from "./orchestrationRunner";
import { loadWorkflowFile } from "./orchestrationWorkflowFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("prepareAndRecordNextOrchestrationRuns", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-orchestration-dispatch-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
    await writeFile(
      join(workspacePath, "WORKFLOW.md"),
      `---
tracker:
  active_states: [ready]
workspace:
  strategy: directory
  root: ./tasks
orchestration:
  max_concurrent_agents: 2
---
Prompt`,
      "utf8",
    );
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("records dispatch rank and priority in prepared run proof", async () => {
    const low = store.createOrchestrationTask({ title: "Low priority", state: "ready", priority: 9 });
    const high = store.createOrchestrationTask({ title: "High priority", state: "ready", priority: 1 });

    const { result, runs } = await prepareAndRecordNextOrchestrationRuns(workspacePath, store);

    expect(result.prepared.map((task) => task.taskId)).toEqual([high.id, low.id]);
    expect(runs.map((run) => run.taskId)).toEqual([high.id, low.id]);
    expect(runs[0].proofOfWork).toMatchObject({
      kind: "preparation",
      dispatchRank: 1,
      priority: 1,
      identifier: high.identifier,
      title: "High priority",
      workflowPath: join(workspacePath, "WORKFLOW.md"),
      workflowHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(runs[1].proofOfWork).toMatchObject({
      dispatchRank: 2,
      priority: 9,
      identifier: low.identifier,
      workflowPath: join(workspacePath, "WORKFLOW.md"),
      workflowHash: runs[0].proofOfWork?.workflowHash,
    });
  });

  it("imports completed project-board dependency artifacts when preparing a dependent run", async () => {
    const board = store.createProjectBoard({ title: "Dependency artifact dispatch board" });
    store.updateProjectBoardStatus(board.id, "active");
    const fixture = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Fixture docs",
      description: "Create markdown docs for downstream link checking.",
    });
    const checker = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Markdown link checker",
      description: "Use imported fixture docs to implement a checker.",
    });
    store.updateProjectBoardCard({
      cardId: fixture.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Fixture docs exist."],
      testPlan: { unit: ["Run fixture verification."], integration: [], visual: [], manual: [] },
    });
    store.updateProjectBoardCard({
      cardId: checker.id,
      candidateStatus: "ready_to_create",
      blockedBy: [fixture.id],
      acceptanceCriteria: ["Checker validates imported fixture docs."],
      testPlan: { unit: ["Run checker tests."], integration: ["Run checker against imported dependency artifacts."], visual: [], manual: [] },
    });

    const fixtureTask = store.getOrchestrationTask(store.approveProjectBoardCard(fixture.id).orchestrationTaskId!);
    const checkerTask = store.getOrchestrationTask(store.approveProjectBoardCard(checker.id).orchestrationTaskId!);
    const fixtureWorkspace = join(workspacePath, "tasks", fixtureTask.identifier);
    await mkdir(join(fixtureWorkspace, "docs"), { recursive: true });
    await writeFile(join(fixtureWorkspace, "docs", "guide.md"), "# Guide\n\nSee [API](api.md).\n", "utf8");
    await writeFile(join(fixtureWorkspace, "docs", "api.md"), "# API\n", "utf8");
    await mkdir(join(fixtureWorkspace, ".ambient"), { recursive: true });
    await writeFile(join(fixtureWorkspace, ".ambient", "scratch.json"), "{}\n", "utf8");
    store.setOrchestrationTaskWorkspace({ id: fixtureTask.id, workspacePath: fixtureWorkspace });
    const fixtureRun = store.recordPreparedOrchestrationRun({ taskId: fixtureTask.id, workspacePath: fixtureWorkspace });
    store.updateOrchestrationRun({
      id: fixtureRun.id,
      status: "completed",
      finish: true,
      reviewProjectBoardProof: false,
      proofOfWork: {
        taskToolActions: [
          {
            actionId: "fixture-proof",
            action: "task_report_proof",
            createdAt: "2026-05-17T00:00:00.000Z",
            summary: "Fixture docs verified.",
            changedFiles: ["docs/guide.md", "docs/api.md", ".ambient/scratch.json"],
            commands: ["node tests/verify-fixtures.mjs"],
          },
          {
            actionId: "fixture-complete",
            action: "task_complete",
            createdAt: "2026-05-17T00:00:01.000Z",
            summary: "Fixture docs complete.",
            completed: ["docs/guide.md links to docs/api.md."],
            changedFiles: ["docs/guide.md", "docs/api.md", ".ambient/scratch.json"],
            commands: ["node tests/verify-fixtures.mjs"],
            remaining: [],
            risks: [],
          },
        ],
      },
    });
    store.updateOrchestrationTask({ id: fixtureTask.id, state: "done" });

    const { runs } = await prepareAndRecordNextOrchestrationRuns(workspacePath, store);

    expect(runs).toHaveLength(1);
    expect(runs[0].taskId).toBe(checkerTask.id);
    const dependencyArtifacts = runs[0].proofOfWork?.dependencyArtifacts as Record<string, unknown> | undefined;
    expect(dependencyArtifacts).toMatchObject({
      kind: "project_board_dependency_artifact_import_result",
      dependentTaskId: checkerTask.id,
      imports: [
        expect.objectContaining({
          dependencyRef: fixture.id,
          dependencyTaskIdentifier: fixtureTask.identifier,
          materialFiles: ["docs/guide.md", "docs/api.md"],
          excludedFiles: [".ambient/scratch.json"],
          commands: ["node tests/verify-fixtures.mjs"],
        }),
      ],
    });
    const [imported] = dependencyArtifacts?.imports as Array<{ filesRoot: string; manifestPath: string }>;
    await expect(readFile(join(imported.filesRoot, "docs", "guide.md"), "utf8")).resolves.toContain("[API](api.md)");
    await expect(readFile(imported.manifestPath, "utf8")).resolves.toContain("Fixture docs complete.");
    await expect(readFile(join(runs[0].workspacePath, ".ambient", "dependency-artifacts", "manifest.json"), "utf8")).resolves.toContain("project_board_dependency_artifact_import_result");
  });

  it("imports fixture and implementation bundles before preparing a dependent test run", async () => {
    const board = store.createProjectBoard({ title: "Todo deduper dependency bundle board" });
    store.updateProjectBoardStatus(board.id, "active");
    const fixture = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Todo fixtures",
      description: "Create duplicate todo fixtures.",
    });
    const implementation = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Todo deduper implementation",
      description: "Create the todo deduper implementation.",
    });
    const tests = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Todo deduper tests",
      description: "Test the imported fixtures against the imported implementation.",
    });
    store.updateProjectBoardCard({
      cardId: fixture.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Duplicate todo fixture data exists."],
      testPlan: { unit: ["Run fixture validation."], integration: [], visual: [], manual: [] },
    });
    store.updateProjectBoardCard({
      cardId: implementation.id,
      candidateStatus: "ready_to_create",
      blockedBy: [fixture.id],
      acceptanceCriteria: ["Deduper implementation exports dedupeTodos."],
      testPlan: { unit: ["Run implementation validation."], integration: ["Run implementation against fixture data."], visual: [], manual: [] },
    });
    store.updateProjectBoardCard({
      cardId: tests.id,
      candidateStatus: "ready_to_create",
      blockedBy: [fixture.id, implementation.id],
      acceptanceCriteria: ["Tests import the implementation bundle and fixture bundle."],
      testPlan: { unit: ["Run todo deduper tests."], integration: ["Run tests from the prepared task workspace."], visual: [], manual: [] },
    });

    const fixtureTask = store.getOrchestrationTask(store.approveProjectBoardCard(fixture.id).orchestrationTaskId!);
    const implementationTask = store.getOrchestrationTask(store.approveProjectBoardCard(implementation.id).orchestrationTaskId!);
    const testTask = store.getOrchestrationTask(store.approveProjectBoardCard(tests.id).orchestrationTaskId!);

    const fixtureWorkspace = join(workspacePath, "tasks", fixtureTask.identifier);
    await mkdir(join(fixtureWorkspace, "fixtures"), { recursive: true });
    await writeFile(join(fixtureWorkspace, "fixtures", "todos.json"), JSON.stringify([{ id: "a" }, { id: "a" }, { id: "b" }], null, 2), "utf8");
    await mkdir(join(fixtureWorkspace, ".ambient"), { recursive: true });
    await writeFile(join(fixtureWorkspace, ".ambient", "fixture-scratch.json"), "{}\n", "utf8");
    store.setOrchestrationTaskWorkspace({ id: fixtureTask.id, workspacePath: fixtureWorkspace });
    const fixtureRun = store.recordPreparedOrchestrationRun({ taskId: fixtureTask.id, workspacePath: fixtureWorkspace });
    store.updateOrchestrationRun({
      id: fixtureRun.id,
      status: "completed",
      finish: true,
      reviewProjectBoardProof: false,
      proofOfWork: {
        taskToolActions: [
          {
            actionId: "fixture-complete",
            action: "task_complete",
            createdAt: "2026-05-17T00:00:00.000Z",
            summary: "Todo fixture bundle complete.",
            completed: ["fixtures/todos.json contains duplicate ids."],
            changedFiles: ["fixtures/todos.json", ".ambient/fixture-scratch.json"],
            commands: ["node tests/verify-fixtures.mjs"],
            remaining: [],
            risks: [],
          },
        ],
      },
    });
    store.updateOrchestrationTask({ id: fixtureTask.id, state: "done" });

    const implementationWorkspace = join(workspacePath, "tasks", implementationTask.identifier);
    await mkdir(join(implementationWorkspace, "src"), { recursive: true });
    await writeFile(
      join(implementationWorkspace, "src", "dedupeTodos.mjs"),
      "export function dedupeTodos(todos) { const seen = new Set(); return todos.filter((todo) => { if (seen.has(todo.id)) return false; seen.add(todo.id); return true; }); }\n",
      "utf8",
    );
    await mkdir(join(implementationWorkspace, "node_modules", "cache"), { recursive: true });
    await writeFile(join(implementationWorkspace, "node_modules", "cache", "index.js"), "module.exports = {};\n", "utf8");
    store.setOrchestrationTaskWorkspace({ id: implementationTask.id, workspacePath: implementationWorkspace });
    const implementationRun = store.recordPreparedOrchestrationRun({ taskId: implementationTask.id, workspacePath: implementationWorkspace });
    store.updateOrchestrationRun({
      id: implementationRun.id,
      status: "completed",
      finish: true,
      reviewProjectBoardProof: false,
      proofOfWork: {
        taskToolActions: [
          {
            actionId: "implementation-complete",
            action: "task_complete",
            createdAt: "2026-05-17T00:00:01.000Z",
            summary: "Todo deduper implementation bundle complete.",
            completed: ["src/dedupeTodos.mjs exports dedupeTodos."],
            changedFiles: ["src/dedupeTodos.mjs", "node_modules/cache/index.js"],
            commands: ["node --check src/dedupeTodos.mjs"],
            remaining: [],
            risks: [],
          },
        ],
      },
    });
    store.updateOrchestrationTask({ id: implementationTask.id, state: "done" });

    const { runs } = await prepareAndRecordNextOrchestrationRuns(workspacePath, store);

    expect(runs).toHaveLength(1);
    expect(runs[0].taskId).toBe(testTask.id);
    const dependencyArtifacts = runs[0].proofOfWork?.dependencyArtifacts as { imports?: Array<{ dependencyRef: string; filesRoot: string; materialFiles: string[]; excludedFiles: string[] }> } | undefined;
    expect(dependencyArtifacts?.imports).toHaveLength(2);
    const fixtureImport = dependencyArtifacts?.imports?.find((item) => item.dependencyRef === fixture.id);
    const implementationImport = dependencyArtifacts?.imports?.find((item) => item.dependencyRef === implementation.id);
    expect(fixtureImport).toMatchObject({
      materialFiles: ["fixtures/todos.json"],
      excludedFiles: [".ambient/fixture-scratch.json"],
    });
    expect(implementationImport).toMatchObject({
      materialFiles: ["src/dedupeTodos.mjs"],
      excludedFiles: ["node_modules/cache/index.js"],
    });
    await expect(readFile(join(fixtureImport!.filesRoot, "fixtures", "todos.json"), "utf8")).resolves.toContain('"id": "a"');
    await expect(readFile(join(implementationImport!.filesRoot, "src", "dedupeTodos.mjs"), "utf8")).resolves.toContain("dedupeTodos");
    await expect(readFile(join(runs[0].workspacePath, ".ambient", "dependency-artifacts", "manifest.json"), "utf8")).resolves.toContain(implementationTask.identifier);
  });

  it("selects already prepared runs for auto-dispatch before preparing fresh ready work", async () => {
    const preparedTask = store.createOrchestrationTask({ title: "Prepared first", state: "ready", priority: 1 });
    const freshTask = store.createOrchestrationTask({ title: "Fresh follow-up", state: "ready", priority: 2 });
    const canceledBlocker = store.createOrchestrationTask({ title: "Canceled blocker", state: "canceled", priority: 3 });
    const blockedTask = store.createOrchestrationTask({
      title: "Blocked prepared task",
      state: "ready",
      priority: 0,
      blockedBy: [canceledBlocker.identifier],
    });
    const preparedRun = store.recordPreparedOrchestrationRun({
      taskId: preparedTask.id,
      workspacePath: join(workspacePath, "tasks", preparedTask.identifier),
    });
    store.recordPreparedOrchestrationRun({
      taskId: blockedTask.id,
      workspacePath: join(workspacePath, "tasks", blockedTask.identifier),
    });
    const workflow = await loadWorkflowFile(join(workspacePath, "WORKFLOW.md"));

    const startable = listAutoStartablePreparedOrchestrationRuns(store, { workflowConfig: workflow.config });

    expect(startable.map((candidate) => candidate.run.id)).toEqual([preparedRun.id]);
    expect(startable[0].task.id).toBe(preparedTask.id);

    const { runs } = await prepareAndRecordNextOrchestrationRuns(workspacePath, store);

    expect(runs.map((run) => run.taskId)).toEqual([freshTask.id]);
  });

  it("runs a tiny prepared project-board task selected for auto-dispatch", async () => {
    const board = store.createProjectBoard({ title: "Tiny auto-dispatch board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Create animated hello world",
      description: "Create a single HTML file with a small greeting animation.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["index.html renders Hello from auto-dispatch.", "The greeting has a CSS animation."],
      testPlan: { unit: [], integration: ["Open index.html and confirm the animated greeting exists."], visual: [], manual: [] },
    });
    store.updateProjectBoardStatus(board.id, "active");
    const approved = store.approveProjectBoardCard(ready.id);
    const task = store.getOrchestrationTask(approved.orchestrationTaskId!);
    const preparedWorkspace = join(workspacePath, "tasks", task.identifier);
    await mkdir(preparedWorkspace, { recursive: true });
    store.setOrchestrationTaskWorkspace({ id: task.id, workspacePath: preparedWorkspace });
    const run = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: preparedWorkspace });
    const workflow = await loadWorkflowFile(join(workspacePath, "WORKFLOW.md"));

    const [candidate] = listAutoStartablePreparedOrchestrationRuns(store, { workflowConfig: workflow.config });

    expect(candidate).toMatchObject({ run: expect.objectContaining({ id: run.id }), task: expect.objectContaining({ id: task.id }) });

    const runtime = new TinyPreparedRunRuntime(store, preparedWorkspace);
    await startPreparedOrchestrationRun(workspacePath, store, runtime as unknown as AgentRuntime, candidate.run.id);
    await waitFor(() => Boolean(store.getOrchestrationRun(run.id).finishedAt), 2500);

    const finished = store.getOrchestrationRun(run.id);
    expect(finished.status, finished.error ?? JSON.stringify(finished.proofOfWork)).toBe("completed");
    expect(String(finished.proofOfWork?.lastAssistantText ?? "")).toContain("animated hello page");
    await expect(readFile(join(preparedWorkspace, "index.html"), "utf8")).resolves.toContain("Hello from auto-dispatch");
  });

  it("inherits the controlling chat permission mode for project-board execution runs", async () => {
    const board = store.createProjectBoard({ title: "Full access board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Create animated hello world",
      description: "Create a single HTML file with a small greeting animation.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["index.html renders Hello from auto-dispatch."],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
    });
    store.updateProjectBoardStatus(board.id, "active");
    const approved = store.approveProjectBoardCard(ready.id);
    const task = store.getOrchestrationTask(approved.orchestrationTaskId!);
    const preparedWorkspace = join(workspacePath, "tasks", task.identifier);
    await mkdir(preparedWorkspace, { recursive: true });
    store.setOrchestrationTaskWorkspace({ id: task.id, workspacePath: preparedWorkspace });
    const run = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: preparedWorkspace });

    const runtime = new TinyPreparedRunRuntime(store, preparedWorkspace);
    await startPreparedOrchestrationRun(
      workspacePath,
      store,
      runtime as unknown as AgentRuntime,
      run.id,
      undefined,
      undefined,
      { permissionMode: "full-access" },
    );
    await waitFor(() => Boolean(store.getOrchestrationRun(run.id).finishedAt), 2500);

    expect(runtime.inputs[0]?.permissionMode).toBe("full-access");
    expect(store.getThread(runtime.inputs[0]!.threadId).permissionMode).toBe("full-access");
  });

  it("records deterministic proof review before async proof-judge callbacks", async () => {
    const board = store.createProjectBoard({ title: "Async proof callback board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Create animated hello world",
      description: "Create a single HTML file with a small greeting animation.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["index.html renders Hello from auto-dispatch.", "The greeting has a CSS animation."],
      testPlan: { unit: [], integration: ["Open index.html and confirm the animated greeting exists."], visual: [], manual: [] },
    });
    store.updateProjectBoardStatus(board.id, "active");
    const approved = store.approveProjectBoardCard(ready.id);
    const task = store.getOrchestrationTask(approved.orchestrationTaskId!);
    const preparedWorkspace = join(workspacePath, "tasks", task.identifier);
    await mkdir(preparedWorkspace, { recursive: true });
    store.setOrchestrationTaskWorkspace({ id: task.id, workspacePath: preparedWorkspace });
    const run = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: preparedWorkspace });

    let callbackRunId = "";
    let callbackProofStatus = "";
    const runtime = new TinyPreparedRunRuntime(store, preparedWorkspace);
    await startPreparedOrchestrationRun(
      workspacePath,
      store,
      runtime as unknown as AgentRuntime,
      run.id,
      undefined,
      async (finishedRunId) => {
        callbackRunId = finishedRunId;
        callbackProofStatus = store.getProjectBoardCard(approved.id).proofReview?.status ?? "missing";
      },
    );
    await waitFor(() => callbackRunId === run.id, 2500);

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(callbackProofStatus).toBe("done");
    expect(reviewed.status).toBe("done");
    expect(reviewed.proofReview).toMatchObject({
      status: "done",
      reviewer: "deterministic",
      missing: [],
    });
    expect(store.getOrchestrationTask(task.id).state).toBe("done");
  });

  it("creates a default project-board workflow before preparing ready work", async () => {
    await rm(join(workspacePath, "WORKFLOW.md"), { force: true });
    const board = store.createProjectBoard({ title: "Bootstrap board" });
    const task = store.createOrchestrationTask({ title: "Bootstrapped task", state: "ready" });

    const { result, runs } = await prepareAndRecordNextOrchestrationRuns(workspacePath, store);

    expect(runs).toHaveLength(1);
    expect(runs[0].taskId).toBe(task.id);
    expect(result.workflowPath).toBe(join(workspacePath, "WORKFLOW.md"));
    const workflowText = await readFile(join(workspacePath, "WORKFLOW.md"), "utf8");
    expect(workflowText).toContain("auto_dispatch: true");
    expect(workflowText).toContain("strategy: directory");
    expect(store.getProjectBoard(board.id)?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "workflow_created",
          title: "Default WORKFLOW.md created",
          metadata: expect.objectContaining({
            workflowPath: join(workspacePath, "WORKFLOW.md"),
            workflowHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            workspaceStrategy: "directory",
            autoDispatch: true,
            maxConcurrentAgents: 1,
          }),
        }),
      ]),
    );
  });

  it("prepares local tasks against their selected project", async () => {
    const alternateProjectPath = join(workspacePath, "alternate-project");
    await mkdir(alternateProjectPath);
    await writeFile(
      join(alternateProjectPath, "WORKFLOW.md"),
      `---
tracker:
  active_states: [ready]
workspace:
  strategy: directory
  root: ./alternate-tasks
orchestration:
  max_concurrent_agents: 1
---
Alternate prompt`,
      "utf8",
    );
    const task = store.createOrchestrationTask({
      title: "Use selected project",
      state: "ready",
      projectPath: alternateProjectPath,
    });

    const { runs } = await prepareAndRecordNextOrchestrationRuns(workspacePath, store);

    expect(runs).toHaveLength(1);
    expect(runs[0].workspacePath).toContain(join("alternate-project", "alternate-tasks", task.identifier));
    expect(runs[0].proofOfWork).toMatchObject({
      kind: "preparation",
      projectPath: alternateProjectPath,
      identifier: task.identifier,
    });
  });

  it("falls back from prepared workspaces to the owning project root", async () => {
    const task = store.createOrchestrationTask({ title: "Recover root", state: "ready" });
    const preparedWorkspacePath = join(workspacePath, ".ambient-codex", "orchestration", "workspaces", task.identifier);

    const { runs } = await prepareAndRecordNextOrchestrationRuns(preparedWorkspacePath, store);

    expect(runs).toHaveLength(1);
    expect(runs[0].proofOfWork).toMatchObject({
      kind: "preparation",
      projectPath: workspacePath,
      identifier: task.identifier,
    });
  });

  it("does not prepare dependents when a blocker was canceled", async () => {
    const blocker = store.createOrchestrationTask({ title: "Canceled dependency", state: "canceled", priority: 1 });
    const dependent = store.createOrchestrationTask({
      title: "Dependent work",
      state: "ready",
      priority: 2,
      blockedBy: [blocker.identifier],
    });

    const { result, runs } = await prepareAndRecordNextOrchestrationRuns(workspacePath, store);

    expect(runs).toEqual([]);
    expect(result.skipped.find((entry) => entry.taskId === dependent.id)?.reason).toBe("blocked");
  });

  it("refuses to start an already prepared run when dependencies are no longer satisfied", async () => {
    const blocker = store.createOrchestrationTask({ title: "Canceled dependency", state: "canceled", priority: 1 });
    const dependent = store.createOrchestrationTask({
      title: "Dependent work",
      state: "ready",
      priority: 2,
      blockedBy: [blocker.identifier],
    });
    const run = store.recordPreparedOrchestrationRun({
      taskId: dependent.id,
      workspacePath: join(workspacePath, "tasks", dependent.identifier),
    });

    await expect(startPreparedOrchestrationRun(workspacePath, store, {} as never, run.id)).rejects.toThrow(
      /blocked by unsatisfied dependencies/,
    );
    expect(store.getOrchestrationRun(run.id).status).toBe("prepared");
    expect(store.getOrchestrationTask(dependent.id).state).toBe("ready");
  });

  it("prepares due scheduled local tasks and advances their schedules", async () => {
    const task = store.createOrchestrationTask({ title: "Scheduled priority", state: "ready", priority: 3 });
    const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
    const dueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "local_task",
        targetId: task.id,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      createdAt,
    )[0];

    const { runs, evaluatedScheduleIds, advancedScheduleIds } = await prepareAndRecordDueScheduledLocalTaskRuns(workspacePath, store, dueAt);

    expect(evaluatedScheduleIds).toEqual([schedule.id]);
    expect(advancedScheduleIds).toEqual([schedule.id]);
    expect(runs).toHaveLength(1);
    expect(runs[0].taskId).toBe(task.id);
    expect(runs[0].proofOfWork).toMatchObject({
      kind: "scheduled-preparation",
      scheduleIds: [schedule.id],
      scheduledAt: dueAt.toISOString(),
      priority: 3,
      identifier: task.identifier,
    });
    expect(store.listAutomationSchedules()[0]).toMatchObject({
      id: schedule.id,
      lastRunAt: dueAt.toISOString(),
      nextRunAt: new Date(2026, 0, 2, 9, 0, 0, 0).toISOString(),
    });
  });

  it("selects restart-interrupted runs for one guarded auto-continuation", async () => {
    const task = store.createOrchestrationTask({ title: "Resume interrupted game", state: "ready", priority: 1 });
    const run = store.recordPreparedOrchestrationRun({
      taskId: task.id,
      workspacePath: join(workspacePath, "tasks", task.identifier),
      proofOfWork: { dispatchRank: 3, lastAssistantText: "Created index.html and was checking the browser." },
    });
    const thread = store.createThread(`${task.identifier}: ${task.title}`, run.workspacePath);
    store.updateOrchestrationRun({ id: run.id, status: "running", threadId: thread.id });
    store.stallActiveOrchestrationRuns();

    const candidates = listAutoContinuableRestartInterruptedRuns(store, { maxConcurrentAgents: 1 });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      run: expect.objectContaining({ id: run.id, status: "stalled", threadId: thread.id }),
      task: expect.objectContaining({ id: task.id }),
      autoContinueAttempts: 0,
    });

    const marked = store.recordRestartInterruptedAutoContinueAttempt(run.id, new Date("2026-05-08T09:00:00.000Z"));

    expect(marked.proofOfWork).toMatchObject({
      resumeAvailable: true,
      recovery: {
        type: "desktop-restart",
        resumeAvailable: true,
        autoContinueAttempts: 1,
        lastAutoContinueAt: "2026-05-08T09:00:00.000Z",
        autoContinueHistory: [{ attempt: 1, continuedAt: "2026-05-08T09:00:00.000Z" }],
      },
    });
    expect(listAutoContinuableRestartInterruptedRuns(store, { maxConcurrentAgents: 1 })).toEqual([]);
    expect(listAutoContinuableRestartInterruptedRuns(store, { maxConcurrentAgents: 1, maxAutoContinues: 2 })).toHaveLength(1);
  });

  it("skips restart-interrupted auto-continuation when slots or manual-review guardrails block it", async () => {
    const task = store.createOrchestrationTask({ title: "Needs credentials", state: "ready", priority: 1 });
    const run = store.recordPreparedOrchestrationRun({
      taskId: task.id,
      workspacePath: join(workspacePath, "tasks", task.identifier),
      proofOfWork: { lastAssistantText: "Need API credentials before continuing." },
    });
    const thread = store.createThread(`${task.identifier}: ${task.title}`, run.workspacePath);
    store.updateOrchestrationRun({ id: run.id, status: "running", threadId: thread.id });
    store.stallActiveOrchestrationRuns();

    expect(listAutoContinuableRestartInterruptedRuns(store, { maxConcurrentAgents: 1 })).toEqual([]);

    const eligibleTask = store.createOrchestrationTask({ title: "Eligible resume", state: "ready", priority: 2 });
    const eligibleRun = store.recordPreparedOrchestrationRun({
      taskId: eligibleTask.id,
      workspacePath: join(workspacePath, "tasks", eligibleTask.identifier),
    });
    const eligibleThread = store.createThread(`${eligibleTask.identifier}: ${eligibleTask.title}`, eligibleRun.workspacePath);
    store.updateOrchestrationRun({ id: eligibleRun.id, status: "running", threadId: eligibleThread.id });
    store.stallActiveOrchestrationRuns();

    expect(listAutoContinuableRestartInterruptedRuns(store, { maxConcurrentAgents: 1 })).toHaveLength(1);
    expect(
      listAutoContinuableRestartInterruptedRuns(store, {
        maxConcurrentAgents: 1,
        runtimeState: { claimedTaskIds: [], runningTaskIds: ["other-task"], retryQueuedTaskIds: [] },
      }),
    ).toEqual([]);
  });
});

class TinyPreparedRunRuntime {
  readonly inputs: SendMessageInput[] = [];

  constructor(
    private readonly store: ProjectStore,
    private readonly workspacePath: string,
  ) {}

  async send(input: SendMessageInput, hooks: AgentRuntimeSendHooks = {}): Promise<void> {
    this.inputs.push(input);
    this.store.updateThreadSettings(input.threadId, {
      permissionMode: input.permissionMode,
      collaborationMode: input.collaborationMode,
      model: input.model,
      thinkingLevel: input.thinkingLevel,
    });
    expect(input.content).toMatch(/Create animated hello world|focus-loop pass/);
    await writeFile(
      join(this.workspacePath, "index.html"),
      [
        "<!doctype html>",
        '<meta charset="utf-8">',
        "<title>Hello from auto-dispatch</title>",
        "<style>",
        "body { display: grid; min-height: 100vh; place-items: center; font-family: sans-serif; }",
        ".hello { animation: pulse 1.2s ease-in-out infinite alternate; font-size: 2rem; }",
        "@keyframes pulse { from { transform: scale(0.96); opacity: 0.72; } to { transform: scale(1.04); opacity: 1; } }",
        "</style>",
        '<main class="hello">Hello from auto-dispatch</main>',
      ].join("\n"),
      "utf8",
    );
    this.store.addMessage({
      threadId: input.threadId,
      role: "assistant",
      content: [
        "Created the animated hello page and verified the requested file content.",
        "```task_actions",
        JSON.stringify([
          {
            actionId: "tiny-auto-dispatch-heartbeat",
            action: "task_heartbeat",
            createdAt: "2026-05-17T00:00:00.000Z",
            summary: "Creating index.html and checking the greeting animation proof.",
            completed: [],
            remaining: ["Create index.html", "Verify greeting content"],
          },
          {
            actionId: "tiny-auto-dispatch-proof",
            action: "task_report_proof",
            createdAt: "2026-05-17T00:00:01.000Z",
            summary: "Created index.html with an animated greeting and checked the file content.",
            changedFiles: ["index.html"],
            commands: ["pnpm test passed: index.html contains Hello from auto-dispatch"],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: ["Confirmed the CSS keyframes animate the greeting."],
          },
          {
            actionId: "tiny-auto-dispatch-complete",
            action: "task_complete",
            createdAt: "2026-05-17T00:00:02.000Z",
            summary: "Animated hello page is complete.",
            completed: ["index.html contains the animated greeting."],
            remaining: [],
            risks: [],
          },
        ]),
        "```",
      ].join("\n"),
      metadata: { status: "done" },
    });
    hooks.onActivity?.();
  }

  async abort(): Promise<void> {}
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for condition.");
}
