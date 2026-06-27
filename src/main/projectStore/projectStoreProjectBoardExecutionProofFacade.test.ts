import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board execution proof facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("refreshes dependent Local Task prompts with completed dependency artifacts and imports material files", async () => {
    const board = store.createProjectBoard({ title: "Dependency prompt board" });
    const first = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Create shared data model",
      description: "Build the dependency output.",
    });
    const second = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Render dependent UI",
      description: "Use the dependency output.",
    });

    store.updateProjectBoardCard({
      cardId: first.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Data model is persisted."],
      testPlan: { unit: ["Run data model tests."], integration: [], visual: [], manual: [] },
    });
    store.updateProjectBoardCard({
      cardId: second.id,
      candidateStatus: "ready_to_create",
      blockedBy: [first.id],
      acceptanceCriteria: ["Dependent UI uses the shared model."],
      testPlan: { unit: [], integration: ["Run dependent smoke."], visual: [], manual: [] },
    });

    const firstTask = store.getOrchestrationTask(store.approveProjectBoardCard(first.id).orchestrationTaskId!);
    const secondTask = store.getOrchestrationTask(store.approveProjectBoardCard(second.id).orchestrationTaskId!);
    const dependencyWorkspace = join(workspacePath, "dependency-workspaces", "LOCAL-1");
    await mkdir(dependencyWorkspace, { recursive: true });
    await writeFile(join(dependencyWorkspace, "model.mjs"), "export function parseBoard(input) { return JSON.parse(input); }\n", "utf8");
    await mkdir(join(dependencyWorkspace, ".ambient"), { recursive: true });
    await writeFile(join(dependencyWorkspace, ".ambient", "scratch.json"), "{}\n", "utf8");
    await mkdir(join(dependencyWorkspace, "node_modules", "cached-package"), { recursive: true });
    await writeFile(join(dependencyWorkspace, "node_modules", "cached-package", "index.js"), "module.exports = {};\n", "utf8");
    store.setOrchestrationTaskWorkspace({
      id: firstTask.id,
      workspacePath: dependencyWorkspace,
      branchName: "ambient/LOCAL-1",
    });
    const run = store.recordPreparedOrchestrationRun({ taskId: firstTask.id, workspacePath: dependencyWorkspace });
    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      finish: true,
      reviewProjectBoardProof: false,
      proofOfWork: {
        taskToolActions: [
          {
            actionId: "proof-model",
            action: "task_report_proof",
            createdAt: "2026-05-16T00:00:00.000Z",
            summary: "Data model proof passed.",
            changedFiles: ["model.mjs", ".ambient/scratch.json", "node_modules/cached-package/index.js"],
            commands: ["node --test model.test.mjs"],
            manualChecks: ["Clean import smoke passed."],
          },
          {
            actionId: "complete-model",
            action: "task_complete",
            createdAt: "2026-05-16T00:00:01.000Z",
            summary: "Data model complete.",
            completed: ["model.mjs exports parseBoard."],
            remaining: [],
            risks: [],
            commands: ["node --test model.test.mjs"],
            changedFiles: ["model.mjs", ".ambient/scratch.json", "node_modules/cached-package/index.js"],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: ["Clean import smoke passed."],
          },
        ],
      },
    });
    store.updateOrchestrationTask({ id: firstTask.id, state: "done" });

    const refreshed = store.refreshProjectBoardTaskDescriptionForTask(secondTask.id);
    const dependentWorkspace = join(workspacePath, "dependency-workspaces", "LOCAL-3");
    const executionThread = store.ensureProjectBoardCardExecutionThreadForTask({
      taskId: secondTask.id,
      workspacePath: dependentWorkspace,
    });
    const imported = await store.importProjectBoardDependencyArtifactsForTask({ taskId: secondTask.id, workspacePath: dependentWorkspace });

    expect(refreshed?.description).toContain("Dependency execution context:");
    expect(refreshed?.description).toContain("Available dependency outputs:");
    expect(refreshed?.description).toContain(`${firstTask.identifier}: Create shared data model`);
    expect(refreshed?.description).toContain("Ambient imports material files from available dependencies");
    expect(refreshed?.description).toContain(`Read-only fallback dependency workspace: ${dependencyWorkspace}`);
    expect(refreshed?.description).toContain("Dependency branch: ambient/LOCAL-1");
    expect(refreshed?.description).toContain("Declared import files: model.mjs");
    expect(refreshed?.description).toContain("Proof commands: node --test model.test.mjs");
    expect(refreshed?.description).toContain("Manual checks: Clean import smoke passed.");
    expect(refreshed?.description).toContain("Completed items: model.mjs exports parseBoard.");
    expect(refreshed?.description).toContain("Proof summary: Data model complete.");
    expect(refreshed?.description).toContain("Do not infer that an available dependency is incomplete");
    expect(store.getProjectBoardDependencyWorkspacePathsForExecutionThread(executionThread!.id)).toEqual([dependencyWorkspace]);
    expect(imported.imports).toHaveLength(1);
    expect(imported.imports[0]).toMatchObject({
      dependencyRef: first.id,
      dependencyTitle: "Create shared data model",
      dependencyTaskIdentifier: firstTask.identifier,
      materialFiles: ["model.mjs"],
      skippedFiles: [],
      excludedFiles: [".ambient/scratch.json", "node_modules/cached-package/index.js"],
      commands: ["node --test model.test.mjs"],
      manualChecks: ["Clean import smoke passed."],
      completed: ["model.mjs exports parseBoard."],
      proofSummary: "Data model complete.",
    });
    await expect(readFile(join(imported.imports[0].filesRoot, "model.mjs"), "utf8")).resolves.toContain("parseBoard");
    await expect(readFile(imported.imports[0].manifestPath, "utf8")).resolves.toContain("sourceDeliverableManifest");
    await expect(readFile(imported.manifestPath, "utf8")).resolves.toContain("project_board_dependency_artifact_import_result");
    await expect(access(join(imported.imports[0].filesRoot, ".ambient", "scratch.json"))).rejects.toThrow();
    await expect(access(join(imported.imports[0].filesRoot, "node_modules", "cached-package", "index.js"))).rejects.toThrow();
  });

  it("syncs approved project board card lanes from linked task state and blockers", () => {
    const blocker = store.createOrchestrationTask({ title: "Finish prerequisite", state: "todo" });
    const thread = store.createThread("Board status thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nTrack card state." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Stateful board card",
      summary: "Exercise board lane projection.",
      content: message.content,
      steps: [{ id: "step-1", title: "Keep the board lane in sync." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Status board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const blockedDraft = store.updateProjectBoardCard({ cardId: card.id, blockedBy: [blocker.identifier] });
    const approved = store.approveProjectBoardCard(blockedDraft.id);
    const taskId = approved.orchestrationTaskId!;

    expect(approved.status).toBe("blocked");
    expect(store.getOrchestrationTask(taskId).blockedBy).toEqual([blocker.identifier]);
    expect(store.getActiveProjectBoard()?.cards.find((item) => item.id === card.id)?.status).toBe("blocked");

    store.updateOrchestrationTask({ id: blocker.id, state: "needs_review" });
    expect(store.getProjectBoardCard(card.id).status).toBe("ready");

    store.updateOrchestrationTask({ id: blocker.id, state: "todo" });
    expect(store.getProjectBoardCard(card.id).status).toBe("blocked");

    store.updateOrchestrationTask({ id: blocker.id, state: "review" });
    expect(store.getProjectBoardCard(card.id).status).toBe("ready");

    store.updateOrchestrationTask({ id: taskId, state: "In Progress" });
    expect(store.getProjectBoardCard(card.id).status).toBe("in_progress");
    expect(store.getActiveProjectBoard()?.cards.find((item) => item.id === card.id)?.status).toBe("in_progress");

    store.updateOrchestrationTask({ id: taskId, state: "review" });
    expect(store.getProjectBoardCard(card.id).status).toBe("review");

    store.updateOrchestrationTask({ id: taskId, state: "needs_info" });
    expect(store.getProjectBoardCard(card.id).status).toBe("blocked");

    store.updateOrchestrationTask({ id: taskId, state: "needs_review" });
    expect(store.getProjectBoardCard(card.id).status).toBe("review");

    store.updateOrchestrationTask({ id: taskId, state: "budget_exhausted" });
    expect(store.getProjectBoardCard(card.id).status).toBe("blocked");

    store.updateOrchestrationTask({ id: taskId, state: "terminal_blocker" });
    expect(store.getProjectBoardCard(card.id).status).toBe("blocked");

    store.updateOrchestrationTask({ id: taskId, state: "done" });
    expect(store.getProjectBoardCard(card.id).status).toBe("done");
  });

  it("creates draft inbox follow-up cards from completed project board run proof", () => {
    const thread = store.createThread("Run follow-up thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip and discover follow-ups." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Follow-up source card",
      summary: "Exercise run-discovered follow-ups.",
      content: message.content,
      steps: [{ id: "step-1", title: "Complete source work." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Follow-up board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/follow-up" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/app.ts"],
        followUps: [
          {
            title: "Add edge-case visual coverage",
            description: "The run found a missing visual coverage case.",
            acceptanceCriteria: ["Capture the edge case."],
            testPlan: { visual: ["Run visual smoke for the edge case."] },
          },
        ],
      },
      finish: true,
    });
    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/app.ts"],
        followUps: ["Add edge-case visual coverage"],
      },
      finish: true,
    });

    const followUps = store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up");
    expect(followUps).toHaveLength(1);
    expect(store.getActiveProjectBoard()?.events?.filter((event) => event.kind === "run_follow_up_created")).toEqual([
      expect.objectContaining({
        title: "Run follow-ups proposed",
        entityId: run.id,
        metadata: expect.objectContaining({ runId: run.id, parentCardId: approved.id, followUpCardIds: [followUps[0].id] }),
      }),
    ]);
    expect(followUps[0]).toMatchObject({
      title: "Add edge-case visual coverage",
      description: "The run found a missing visual coverage case.",
      status: "draft",
      candidateStatus: "needs_clarification",
      sourceThreadId: thread.id,
      blockedBy: [approved.id],
      labels: expect.arrayContaining(["run-follow-up", "plan"]),
      testPlan: { visual: ["Run visual smoke for the edge case."] },
    });

    const ready = store.updateProjectBoardCard({ cardId: followUps[0].id, candidateStatus: "ready_to_create" });
    const ticketized = store.approveProjectBoardCard(ready.id);
    expect(ticketized.orchestrationTaskId).toEqual(expect.any(String));
    expect(store.getOrchestrationTask(ticketized.orchestrationTaskId!).state).toBe("ready");
  });

  it("preserves terminal blocker context without creating proof follow-up noise", () => {
    const thread = store.createThread("Terminal blocker thread");
    const message = store.addMessage({
      threadId: thread.id,
      role: "assistant",
      content: "## Plan\nShip with a credential-gated smoke test.",
    });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Credential-gated card",
      summary: "Exercise terminal blocker handling.",
      content: message.content,
      steps: [{ id: "step-1", title: "Run the external smoke path." }],
      openQuestions: [],
      risks: [],
      verification: ["Run integration smoke."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Terminal blocker board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/terminal-blocker" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "failed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/integration.ts"],
        lastAssistantText:
          "Terminal blocker: I cannot continue because the production smoke endpoint needs an API key from the user before the integration proof can run.",
      },
      error: "Run stopped after the model reported a terminal blocker.",
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "terminally_blocked",
      missing: [expect.stringContaining("production smoke endpoint needs an API key from the user")],
      recommendedAction: "block",
    });
    expect(store.getOrchestrationTask(approved.orchestrationTaskId!).state).toBe("terminal_blocker");
    expect(store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up")).toHaveLength(0);
  });

  it("does not count negated visual proof text as screenshot evidence", () => {
    const thread = store.createThread("Negated visual proof thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip visual work." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Visual proof card",
      summary: "Exercise visual proof negation.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement behavior that needs visual proof." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests.", "Capture visual screenshot."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Negated visual proof board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/negated-visual-proof" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/App.tsx"],
        testOutput: "npm test: 7 tests passed",
        lastAssistantText:
          "Implemented the acceptance criteria and unit tests passed. Visual proof was not captured because no headless browser was available.",
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "needs_follow_up",
      missing: expect.arrayContaining([expect.stringContaining("Visual proof missing")]),
      satisfied: expect.not.arrayContaining(["Visual/browser proof recorded."]),
    });
  });

  it("counts structured task manualChecks as manual proof", () => {
    const board = store.createProjectBoard({ title: "Structured manual proof board" });
    const thread = store.createThread("Structured manual proof thread");
    const draft = store.createProjectBoardManualCard({ boardId: board.id, title: "Implement importable converter module" });
    store.updateProjectBoardCard({
      cardId: draft.id,
      description: "Create converter.mjs and verify it imports in a clean Node process.",
      acceptanceCriteria: ["converter.mjs exports the conversion helpers."],
      testPlan: {
        unit: [],
        integration: [],
        visual: [],
        manual: ["Verify module can be imported without errors in a clean Node.js environment."],
      },
      candidateStatus: "ready_to_create",
    });
    const approved = store.approveProjectBoardCard(draft.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/manual-proof" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["converter.mjs"],
        lastAssistantText: "Implemented the acceptance criteria and verified the importable module.",
        taskToolActions: [
          {
            action: "task_heartbeat",
            actionId: "manual-proof-start",
            createdAt: "2026-05-16T22:00:00.000Z",
            summary: "Starting converter module implementation.",
            completed: [],
            remaining: ["Implement module", "Verify import"],
          },
          {
            action: "task_report_proof",
            actionId: "manual-proof-report",
            createdAt: "2026-05-16T22:01:00.000Z",
            summary: "converter.mjs imports cleanly and exposes the expected helpers.",
            commands: ["node -e \"import('./converter.mjs')\""],
            changedFiles: ["converter.mjs"],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: ["Clean Node.js import succeeds in a fresh process and exposes the expected helpers."],
          },
          {
            action: "task_complete",
            actionId: "manual-proof-complete",
            createdAt: "2026-05-16T22:01:10.000Z",
            summary: "converter.mjs is implemented and import proof is complete.",
            completed: ["converter.mjs exports the conversion helpers."],
            remaining: [],
            risks: [],
            commands: ["node -e \"import('./converter.mjs')\""],
            changedFiles: ["converter.mjs"],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: ["Clean Node.js import succeeds in a fresh process."],
          },
        ],
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("review");
    expect(reviewed.proofReview).toMatchObject({
      status: "ready_for_review",
      missing: [],
      satisfied: expect.arrayContaining(["Manual review proof recorded."]),
    });
    expect(store.getOrchestrationTask(approved.orchestrationTaskId!).state).toBe("needs_review");
  });

  it("reviews durable task_complete proof when the final assistant response fails", () => {
    const board = store.createProjectBoard({ title: "Post-completion provider error board" });
    const thread = store.createThread("Post-completion provider error thread");
    const draft = store.createProjectBoardManualCard({ boardId: board.id, title: "Implement converter proof before provider error" });
    store.updateProjectBoardCard({
      cardId: draft.id,
      description: "Create converter.mjs and verify it imports in a clean Node process.",
      acceptanceCriteria: ["converter.mjs exports the conversion helpers."],
      testPlan: {
        unit: ["Run node:test coverage."],
        integration: [],
        visual: [],
        manual: ["Verify module can be imported without errors in a clean Node.js environment."],
      },
      candidateStatus: "ready_to_create",
    });
    const approved = store.approveProjectBoardCard(draft.id);
    const run = store.recordPreparedOrchestrationRun({
      taskId: approved.orchestrationTaskId!,
      workspacePath: "/tmp/provider-error-after-complete",
    });

    store.updateOrchestrationRun({
      id: run.id,
      status: "failed",
      threadId: thread.id,
      error: 'The Pi/Ambient runtime returned an error:\n\n429 "Rate limit exceeded"',
      proofOfWork: {
        changedFiles: ["converter.mjs", "converter.test.mjs"],
        lastAssistantStatus: "error",
        lastAssistantText: 'The Pi/Ambient runtime returned an error:\n\n429 "Rate limit exceeded"',
        taskToolActions: [
          {
            action: "task_heartbeat",
            actionId: "provider-error-start",
            createdAt: "2026-05-16T22:00:00.000Z",
            summary: "Starting converter implementation.",
            completed: [],
            remaining: ["Implement module", "Run tests", "Verify import"],
          },
          {
            action: "task_report_proof",
            actionId: "provider-error-proof",
            createdAt: "2026-05-16T22:03:00.000Z",
            summary: "converter.mjs imports cleanly and node:test coverage passes.",
            commands: ["node --test converter.test.mjs", "node -e \"import('./converter.mjs')\""],
            changedFiles: ["converter.mjs", "converter.test.mjs"],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: ["Clean Node.js import succeeds in a fresh process and exposes the expected helpers."],
          },
          {
            action: "task_complete",
            actionId: "provider-error-complete",
            createdAt: "2026-05-16T22:03:10.000Z",
            summary: "converter.mjs is implemented and proof is complete.",
            completed: ["converter.mjs exports the conversion helpers.", "node:test coverage passes.", "Clean import verified."],
            remaining: [],
            risks: [],
            commands: ["node --test converter.test.mjs", "node -e \"import('./converter.mjs')\""],
            changedFiles: ["converter.mjs", "converter.test.mjs"],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: ["Clean Node.js import succeeds in a fresh process."],
          },
        ],
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("review");
    expect(reviewed.proofReview).toMatchObject({
      status: "ready_for_review",
      missing: [],
      satisfied: expect.arrayContaining(["Unit proof recorded.", "Manual review proof recorded."]),
      evidenceQuality: "strong",
      recommendedAction: "close",
    });
    expect(reviewed.proofReview?.summary).toContain("recorded durable task_complete proof");
    expect(store.getOrchestrationTask(approved.orchestrationTaskId!).state).toBe("needs_review");
  });

  it("records native task tool actions immediately as run proof and board progress events", () => {
    const board = store.createProjectBoard({ title: "Native task action event board" });
    const draft = store.createProjectBoardManualCard({ boardId: board.id, title: "Implement contrast checker" });
    store.updateProjectBoardCard({
      cardId: draft.id,
      description: "Build a token contrast checker and prove it with a CLI run.",
      acceptanceCriteria: ["Contrast checker fails inaccessible token pairs."],
      testPlan: { unit: ["Run contrast checker fixtures."], integration: [], visual: [], manual: [] },
      candidateStatus: "ready_to_create",
    });
    const approved = store.approveProjectBoardCard(draft.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/native-task-actions" });

    const updated = store.recordProjectBoardTaskToolAction({
      runId: run.id,
      cardId: approved.id,
      taskId: approved.orchestrationTaskId!,
      source: "native_tool",
      toolName: "task_report_proof",
      action: {
        actionId: "native-proof-1",
        action: "task_report_proof",
        createdAt: "2026-05-17T12:00:00.000Z",
        runId: run.id,
        cardId: approved.id,
        taskId: approved.orchestrationTaskId!,
        summary: "Contrast checker fixture passed.",
        commands: ["node scripts/check-contrast.mjs tokens.json"],
        changedFiles: ["scripts/check-contrast.mjs"],
        screenshots: [],
        browserTraces: [],
        visualChecks: [],
        manualChecks: [],
        metadata: { transport: "native_tool", toolName: "task_report_proof" },
      },
    });

    expect(updated?.proofOfWork).toMatchObject({
      taskToolActions: [
        expect.objectContaining({
          actionId: "native-proof-1",
          metadata: expect.objectContaining({ transport: "native_tool", toolName: "task_report_proof" }),
        }),
      ],
      taskActionDiagnostics: expect.objectContaining({
        nativeToolActionCount: 1,
        fencedFallbackActionCount: 0,
        terminalActionCount: 1,
      }),
    });
    const boardAfter = store.getProjectBoard(board.id);
    const progressEvent = (boardAfter?.events ?? []).find(
      (event) => event.kind === "card_run_progress" && event.metadata.taskAction && event.metadata.runId === run.id,
    );
    expect(progressEvent).toMatchObject({
      title: "Proof reported",
      summary: "Contrast checker fixture passed.",
      metadata: expect.objectContaining({
        source: "native_tool",
        taskAction: expect.objectContaining({
          action: "task_report_proof",
          actionId: "native-proof-1",
          source: "native_tool",
          terminal: true,
        }),
        taskActionDiagnostics: expect.objectContaining({ nativeToolActionCount: 1 }),
      }),
    });
  });

  it("does not accept dependency cache churn as implementation proof for board cards", () => {
    const thread = store.createThread("Generated proof thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip with proof." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Generated-only proof card",
      summary: "Should reject cache-only diffs.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement behavior in source files." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests.", "Capture visual screenshot."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Generated proof board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/generated-proof" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: [{ path: "node_modules/.vite/vitest/results.json", status: " M", category: "modified" }],
        gitStatus: [" M node_modules/.vite/vitest/results.json", "?? node_modules/.vite/deps/"],
        diff: [
          "diff --git a/node_modules/.vite/vitest/results.json b/node_modules/.vite/vitest/results.json",
          "--- a/node_modules/.vite/vitest/results.json",
          "+++ b/node_modules/.vite/vitest/results.json",
          "@@ -1 +1 @@",
          "-old",
          "+new",
        ].join("\n"),
        lastAssistantText:
          "Implemented the acceptance criteria. Unit tests passed, visual screenshot captured, and manual review confirmed the result.",
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "needs_follow_up",
      missing: expect.arrayContaining([expect.stringContaining("No changed implementation files")]),
      satisfied: expect.not.arrayContaining(["Implementation evidence recorded."]),
    });
    const followUps = store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up");
    expect(followUps).toHaveLength(1);
    expect(followUps[0].title).toBe("Complete proof for Generated-only proof card");
  });
});
