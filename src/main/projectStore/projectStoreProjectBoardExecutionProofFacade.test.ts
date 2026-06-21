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
    const executionThread = store.ensureProjectBoardCardExecutionThreadForTask({ taskId: secondTask.id, workspacePath: dependentWorkspace });
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

  it("records PM proof review decisions for completed project board runs", () => {
    const thread = store.createThread("Proof review thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip with proof." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Proof-gated card",
      summary: "Exercise proof review.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement proof-gated behavior." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests.", "Run integration smoke.", "Capture visual screenshot.", "Manual review the result."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Proof review board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/proof-review" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/App.tsx"],
        screenshots: ["proof.png"],
        afterRunHook: { ok: true, durationMs: 42 },
        lastAssistantText:
          "Implemented the acceptance criteria. Unit tests passed, integration smoke passed, visual screenshot captured, and manual review confirmed the result.",
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("review");
    expect(reviewed.proofReview).toMatchObject({
      status: "ready_for_review",
      runId: run.id,
      missing: [],
      satisfied: expect.arrayContaining([
        "Acceptance criteria discussed in proof.",
        "Unit proof recorded.",
        "Integration proof recorded.",
        "Visual/browser proof recorded.",
        "Manual review proof recorded.",
      ]),
    });
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "card_proof_reviewed",
      entityId: approved.id,
      metadata: expect.objectContaining({ status: "ready_for_review", runId: run.id, reviewer: "deterministic" }),
    });
  });

  it("does not let copied task-action sample proof close a project board card", () => {
    const thread = store.createThread("Sample proof thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip with real proof." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Sample-proof card",
      summary: "Exercise task action proof integrity.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement task-action proof integrity." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Sample proof board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/sample-proof-review" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        taskToolActions: [
          {
            actionId: "proof-1",
            action: "task_report_proof",
            createdAt: "2026-05-05T12:00:00.000Z",
            summary: "Verification passed.",
            commands: [],
            changedFiles: [],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: [],
          },
        ],
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "needs_follow_up",
      recommendedAction: "follow_up",
      missing: expect.arrayContaining([
        "Task action proof integrity issue: task_report_proof proof-1 appears to contain copied sample value(s): actionId, summary.",
        "Task action proof integrity issue: task_report_proof proof-1 has no command, changed-file, screenshot, browser-trace, visual-check, manual-check, or completed-item evidence.",
      ]),
    });
  });

  it("does not close a project board card when the worker stopped at the runtime budget", () => {
    const thread = store.createThread("Runtime budget proof thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip with bounded execution." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Runtime-budget card",
      summary: "Exercise bounded worker closure.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement runtime-budget proof handling." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Runtime budget board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/runtime-budget-proof-review" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/runtimeBudget.ts"],
        afterRunHook: { ok: true, durationMs: 15 },
        lastAssistantText: "Implemented the acceptance criteria and unit tests passed, but the worker reached the configured runtime budget.",
        remaining: [
          "Runtime budget exceeded after 90s: Review partial workspace changes and retry the card with a smaller scope.",
          "Review partial workspace changes and retry the card with a smaller scope.",
        ],
        nextSteps: ["Review partial workspace changes and retry the card with a smaller scope."],
        projectBoardRuntimeBudget: {
          exceeded: true,
          maxRuntimeMs: 90_000,
          elapsedMs: 95_000,
          recommendedNextAction: "Review partial workspace changes and retry the card with a smaller scope.",
        },
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "needs_follow_up",
      recommendedAction: "follow_up",
      missing: expect.arrayContaining([
        "Runtime budget exceeded after 90s: Review partial workspace changes and retry the card with a smaller scope.",
      ]),
    });
    expect(reviewed.splitOutcome).toMatchObject({
      status: "proposed",
      source: "runtime_budget",
      sourceRunId: run.id,
      reason: "Runtime budget exceeded after 90s: Review partial workspace changes and retry the card with a smaller scope.",
      completedCriteria: expect.arrayContaining(["Implementation evidence recorded.", "Acceptance criteria discussed in proof.", "Unit proof recorded."]),
      remainingCriteria: expect.arrayContaining([
        "Runtime budget exceeded after 90s: Review partial workspace changes and retry the card with a smaller scope.",
      ]),
    });
    expect(
      reviewed.splitOutcome?.remainingCriteria.filter((item) =>
        /review partial workspace changes and retry the card with a smaller scope/i.test(item),
      ),
    ).toHaveLength(1);
    expect(reviewed.splitOutcome?.childCardIds).toHaveLength(1);
    const followUp = store.getProjectBoardCard(reviewed.splitOutcome!.childCardIds[0]);
    expect(followUp).toMatchObject({
      title: "Continue Runtime-budget card",
      status: "draft",
      candidateStatus: "needs_clarification",
      blockedBy: [],
      labels: expect.arrayContaining(["proof-follow-up", "runtime-split-follow-up", "derived-from-parent"]),
      acceptanceCriteria: expect.arrayContaining([
        "Runtime budget exceeded after 90s: Review partial workspace changes and retry the card with a smaller scope.",
      ]),
      clarificationQuestions: expect.arrayContaining([
        'Confirm this runtime-budget follow-up accurately captures the remaining scope for "Runtime-budget card" before ticketizing it.',
      ]),
    });
    expect(
      followUp.acceptanceCriteria.filter((item) =>
        /review partial workspace changes and retry the card with a smaller scope/i.test(item),
      ),
    ).toHaveLength(1);
    expect(reviewed.proofReview?.followUpCardIds).toEqual([followUp.id]);
    expect(store.getActiveProjectBoard()?.events?.find((event) => event.kind === "card_split")).toMatchObject({
      title: "Runtime-budget split proposed",
      entityId: approved.id,
      metadata: expect.objectContaining({ runId: run.id, childCardIds: [followUp.id] }),
    });
  });

  it("resolves runtime split decisions without losing parent audit state", () => {
    const thread = store.createThread("Runtime split decision thread");
    const board = store.createProjectBoard({ title: "Runtime split decisions" });
    const createSplitCase = (title: string) => {
      const draft = store.createProjectBoardManualCard({
        boardId: board.id,
        title,
        description: `${title} should be finished in a bounded worker pass.`,
      });
      const ready = store.updateProjectBoardCard({
        cardId: draft.id,
        candidateStatus: "ready_to_create",
        acceptanceCriteria: ["Create the working shell.", "Finish the remaining interaction polish."],
        testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
      });
      const approved = store.approveProjectBoardCard(ready.id);
      const task = store.getOrchestrationTask(approved.orchestrationTaskId!);
      const run = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: `/tmp/${task.identifier}` });
      store.updateOrchestrationRun({
        id: run.id,
        status: "completed",
        threadId: thread.id,
        proofOfWork: {
          changedFiles: ["src/shell.ts"],
          afterRunHook: { ok: true, durationMs: 10 },
          lastAssistantText:
            "Created the working shell, added unit proof, and then hit the configured runtime budget before finishing the remaining interaction polish.",
          projectBoardRuntimeBudget: {
            exceeded: true,
            maxRuntimeMs: 60_000,
            elapsedMs: 65_000,
            recommendedNextAction: "Split the remaining interaction polish into a follow-up.",
          },
        },
        finish: true,
      });
      const reviewed = store.getProjectBoardCard(approved.id);
      const child = store.getProjectBoardCard(reviewed.splitOutcome!.childCardIds[0]);
      return { reviewed, child, task };
    };

    const approvedSplit = createSplitCase("Approve split parent");
    const splitApproved = store.resolveProjectBoardSplitDecision({ cardId: approvedSplit.reviewed.id, action: "approve_split" });
    expect(splitApproved.splitOutcome).toMatchObject({ status: "approved" });
    expect(store.getProjectBoardCard(approvedSplit.child.id).candidateStatus).toBe("needs_clarification");

    const retrySplit = createSplitCase("Retry split parent");
    const retried = store.resolveProjectBoardSplitDecision({ cardId: retrySplit.reviewed.id, action: "retry_original" });
    expect(retried).toMatchObject({ status: "ready", proofReview: undefined, splitOutcome: { status: "rejected" } });
    expect(store.getProjectBoardCard(retrySplit.child.id).candidateStatus).toBe("rejected");
    expect(store.getOrchestrationTask(retrySplit.task.id).state).toBe("ready");

    const mergedSplit = createSplitCase("Merge split parent");
    const merged = store.resolveProjectBoardSplitDecision({ cardId: mergedSplit.reviewed.id, action: "merge_followups" });
    expect(merged).toMatchObject({ status: "ready", proofReview: undefined, splitOutcome: { status: "rejected" } });
    expect(merged.labels).toContain("merged-follow-up");
    expect(store.getProjectBoardCard(mergedSplit.child.id).candidateStatus).toBe("rejected");

    const replacedSplit = createSplitCase("Replace split parent");
    const replaced = store.resolveProjectBoardSplitDecision({ cardId: replacedSplit.reviewed.id, action: "mark_replaced" });
    expect(replaced).toMatchObject({ status: "done", proofReview: { status: "done" }, splitOutcome: { status: "replaced" } });
    expect(store.getOrchestrationTask(replacedSplit.task.id).state).toBe("done");

    const doneViaSplit = createSplitCase("Done via split parent");
    expect(() =>
      store.resolveProjectBoardSplitDecision({ cardId: doneViaSplit.reviewed.id, action: "accept_done_via_split" }),
    ).toThrow("Finish or mark represented split follow-up cards");
    store.updateProjectBoardCard({ cardId: doneViaSplit.child.id, candidateStatus: "evidence" });
    const closed = store.resolveProjectBoardSplitDecision({ cardId: doneViaSplit.reviewed.id, action: "accept_done_via_split" });
    expect(closed).toMatchObject({ status: "done", proofReview: { status: "done" }, splitOutcome: { status: "done_via_split" } });
    expect(store.getOrchestrationTask(doneViaSplit.task.id).state).toBe("done");
  });

  it("recommends retry instead of split when the runtime budget ends without meaningful progress", () => {
    const thread = store.createThread("Retry runtime budget proof thread");
    const board = store.createProjectBoard({ title: "Retry runtime budget board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Runtime retry card",
      description: "Exercise no-progress runtime-budget handling.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Implement the bounded task."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/runtime-budget-retry" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        lastAssistantText: "I started investigating but did not modify implementation files before the runtime budget stopped the run.",
        projectBoardRuntimeBudget: {
          exceeded: true,
          maxRuntimeMs: 30_000,
          elapsedMs: 31_000,
          recommendedNextAction: "Retry with a smaller scope.",
        },
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "retry_recommended",
      recommendedAction: "retry",
      missing: expect.arrayContaining(["Runtime budget exceeded after 30s: Retry with a smaller scope."]),
    });
    expect(reviewed.splitOutcome).toBeUndefined();
    expect(store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up")).toHaveLength(0);
  });

  it("does not split a runtime budget card from Pi satisfied text without observable implementation progress", () => {
    const thread = store.createThread("Pi false-positive runtime budget thread");
    const board = store.createProjectBoard({ title: "Pi false-positive runtime budget board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Runtime false-positive card",
      description: "Exercise strict runtime-budget split gating.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Create a real implementation file."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/runtime-budget-false-positive" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: [{ path: ".ambient/board/cards.json", status: "modified" }],
        taskToolActions: [
          {
            actionId: "unique-heartbeat-id",
            action: "task_heartbeat",
            cardId: approved.id,
            createdAt: "2026-05-05T12:00:00.000Z",
            summary: "Describe actual progress from this run.",
            completed: ["Name a concrete item actually completed."],
            remaining: ["Name concrete remaining work, or leave this array empty."],
          },
        ],
        lastAssistantText: "Run stopped.",
        projectBoardRuntimeBudget: {
          exceeded: true,
          maxRuntimeMs: 45_000,
          elapsedMs: 46_000,
          recommendedNextAction: "Review partial workspace changes and retry the card with a smaller scope.",
        },
      },
    });

    const reviewed = store.applyProjectBoardCardProofReview({
      runId: run.id,
      review: {
        status: "needs_follow_up",
        summary: "Pi inferred progress, but no implementation files changed.",
        satisfied: ["Agent correctly identified the required files and prepared content."],
        missing: ["Runtime budget exceeded after 45s."],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: "2026-05-09T12:00:00.000Z",
        reviewer: "ambient_pi",
        evidenceQuality: "weak",
        recommendedAction: "follow_up",
      },
    });

    expect(reviewed?.status).toBe("blocked");
    expect(reviewed?.splitOutcome).toBeUndefined();
    expect(reviewed?.proofReview).toMatchObject({
      status: "retry_recommended",
      reviewer: "ambient_pi",
      recommendedAction: "retry",
      followUpCardIds: [],
    });
    expect(store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up")).toHaveLength(0);
  });

  it("splits runtime budget cards when proof exists but durable completion was not recorded", () => {
    const thread = store.createThread("Runtime budget completion race thread");
    const board = store.createProjectBoard({ title: "Runtime budget completion race board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Runtime completion race card",
      description: "Exercise timeout after proof but before durable completion.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Create a runtime checkpoint."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/runtime-budget-completion-race" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/runtime-split-progress.ts", "test/runtime-split-progress.test.ts"],
        taskToolActions: [
          {
            actionId: "proof-runtime-race",
            action: "task_report_proof",
            cardId: approved.id,
            createdAt: "2026-05-09T12:00:00.000Z",
            summary: "Checkpoint file and unit test were created before timeout.",
            commands: ["pnpm test test/runtime-split-progress.test.ts"],
            changedFiles: ["src/runtime-split-progress.ts", "test/runtime-split-progress.test.ts"],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: [],
          },
        ],
        projectBoardRuntimeBudget: {
          exceeded: true,
          maxRuntimeMs: 90_000,
          elapsedMs: 91_000,
          recommendedNextAction: "Review partial workspace changes and retry the card with a smaller scope.",
        },
      },
    });

    const reviewed = store.applyProjectBoardCardProofReview({
      runId: run.id,
      review: {
        status: "done",
        summary: "Pi considered all proof complete.",
        satisfied: ["Created the runtime checkpoint.", "Unit proof recorded."],
        missing: [],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: "2026-05-09T12:00:00.000Z",
        reviewer: "ambient_pi",
        evidenceQuality: "strong",
        recommendedAction: "close",
      },
    });

    expect(reviewed?.status).toBe("blocked");
    expect(reviewed?.proofReview).toMatchObject({
      status: "needs_follow_up",
      reviewer: "ambient_pi",
      recommendedAction: "follow_up",
      evidenceQuality: "mixed",
      missing: expect.arrayContaining(["Durable task_complete action was not recorded before the runtime budget stopped the run."]),
    });
    expect(reviewed?.splitOutcome).toMatchObject({
      status: "proposed",
      source: "runtime_budget",
      childCardIds: expect.any(Array),
    });
    expect(reviewed?.splitOutcome?.childCardIds).toHaveLength(1);
  });

  it("keeps strong close recommendations reviewable when deterministic proof issues remain", () => {
    const thread = store.createThread("Strong proof issue thread");
    const board = store.createProjectBoard({ title: "Strong proof issue board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Implement reviewable proof gate",
      description: "Exercise auto-close gating when the judge is strong but proof issues remain.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Create the proof-gated behavior."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Record manual PM review."] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/strong-proof-issue" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/proof-gate.ts"],
        lastAssistantText: "Implemented the acceptance criteria and recorded implementation proof.",
      },
      finish: true,
      reviewProjectBoardProof: false,
    });

    const reviewed = store.applyProjectBoardCardProofReview({
      runId: run.id,
      review: {
        status: "done",
        summary: "Ambient/Pi judged the card complete with strong proof.",
        satisfied: ["Implementation evidence recorded."],
        missing: [],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: "2026-05-19T00:00:00.000Z",
        reviewer: "ambient_pi",
        evidenceQuality: "strong",
        confidence: 0.97,
        recommendedAction: "close",
      },
    });

    expect(reviewed).toMatchObject({
      status: "review",
      proofReview: {
        status: "ready_for_review",
        recommendedAction: "close",
        evidenceQuality: "strong",
        confidence: 0.97,
        missing: expect.arrayContaining(["Manual proof missing: Record manual PM review."]),
      },
    });
    expect(reviewed?.proofReview?.summary).toContain("PM review is required before auto-closure");
    expect(store.getOrchestrationTask(approved.orchestrationTaskId!).state).toBe("needs_review");
  });

  it("does not treat .ambient board artifacts as implementation proof", () => {
    const thread = store.createThread("Board artifact proof thread");
    const board = store.createProjectBoard({ title: "Board artifact proof board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Implement application behavior",
      description: "Change product code, not only board metadata.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Application behavior is implemented."],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/board-artifact-proof" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: [".ambient/board/cards.json"],
        lastAssistantText: "Completed the acceptance criteria by updating board metadata.",
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview?.missing).toContain("No changed implementation files or meaningful diff evidence recorded.");
  });

  it("treats absolute source paths inside a prepared run workspace as implementation proof", () => {
    const thread = store.createThread("Absolute task workspace proof thread");
    const board = store.createProjectBoard({ title: "Absolute task workspace proof board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Implement single-file app",
      description: "Build the app in the prepared local task workspace.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Single-file app is implemented."],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const workspace = "/tmp/absolute-proof/.ambient-codex/orchestration/workspaces/LOCAL-1";
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: workspace });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: [
          `${workspace}/index.html`,
          `${workspace}/.ambient-codex/browser/screenshots/proof.png`,
          `${workspace}/node_modules/cache/index.js`,
        ],
        lastAssistantText: "Implemented the acceptance criteria in the app and captured browser proof.",
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.proofReview?.satisfied).toContain("Implementation evidence recorded.");
    expect(reviewed.proofReview?.missing).not.toContain("No changed implementation files or meaningful diff evidence recorded.");
  });

  it("can defer board proof review and apply a live Ambient/Pi PM judgment", () => {
    const thread = store.createThread("Live proof review thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip with live judgment." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Live-judged proof card",
      summary: "Exercise live proof judgment.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement behavior for live judgment." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Live proof judgment board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/live-proof-review" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/game.ts"],
        afterRunHook: { ok: true },
        lastAssistantText: "Implemented the acceptance criteria and unit tests passed.",
      },
      finish: true,
      reviewProjectBoardProof: false,
    });

    expect(store.getProjectBoardCard(approved.id).proofReview).toBeUndefined();
    const context = store.getProjectBoardProofReviewContextForRun(run.id);
    expect(context?.deterministicReview.status).toBe("ready_for_review");

    store.applyProjectBoardCardProofReview({
      runId: run.id,
      review: {
        status: "done",
        summary: "Ambient/Pi judged the card complete with strong unit and implementation proof.",
        satisfied: ["Implementation evidence recorded.", "Unit proof recorded."],
        missing: [],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: new Date().toISOString(),
        reviewer: "ambient_pi",
        model: "zai-org/GLM-5.1-FP8",
        confidence: 0.93,
        evidenceQuality: "strong",
        recommendedAction: "close",
        deterministicStatus: context!.deterministicReview.status,
        deterministicSummary: context!.deterministicReview.summary,
        judgeDurationMs: 1234,
      },
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("done");
    expect(reviewed.proofReview).toMatchObject({
      status: "done",
      reviewer: "ambient_pi",
      model: "zai-org/GLM-5.1-FP8",
      confidence: 0.93,
      evidenceQuality: "strong",
      recommendedAction: "close",
      deterministicStatus: "ready_for_review",
    });
    expect(store.getOrchestrationTask(approved.orchestrationTaskId!).state).toBe("done");
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "card_proof_reviewed",
      title: "Card proof reviewed by Pi",
      metadata: expect.objectContaining({ reviewer: "ambient_pi", recommendedAction: "close", confidence: 0.93 }),
    });
  });

  it("creates proof follow-up cards when run proof is too weak to close a board card", () => {
    const thread = store.createThread("Weak proof thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip then review proof." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Weak proof card",
      summary: "Exercise weak proof handling.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement behavior that needs proof." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests.", "Capture visual screenshot."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Weak proof board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/weak-proof" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: { lastAssistantText: "I made progress, but no proof is attached yet." },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "needs_follow_up",
      runId: run.id,
      missing: expect.arrayContaining([
        expect.stringContaining("Acceptance criteria"),
        expect.stringContaining("No changed implementation files"),
        expect.stringContaining("Unit proof missing"),
        expect.stringContaining("Visual proof missing"),
      ]),
    });
    const followUps = store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up");
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({
      title: "Complete proof for Weak proof card",
      status: "draft",
      candidateStatus: "needs_clarification",
      blockedBy: [approved.id],
      labels: expect.arrayContaining(["proof-follow-up", "plan"]),
    });
    expect(reviewed.proofReview?.followUpCardIds).toEqual([followUps[0].id]);
  });

  it("prevents stale run follow-up cards from becoming ready after the parent is done", () => {
    const thread = store.createThread("Stale proof follow-up thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip then review proof." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Parent proof card",
      summary: "Exercise stale proof follow-up handling.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement behavior that needs proof." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests.", "Capture visual screenshot."],
      decisionQuestions: [],
    });

    const board = store.createProjectBoard({ title: "Stale proof follow-up board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/stale-proof-follow-up" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: { lastAssistantText: "I made progress, but no proof is attached yet." },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    const followUp = store.getActiveProjectBoard()!.cards.find((candidate) => candidate.sourceKind === "run_follow_up")!;
    store.updateProjectBoardCardCandidateStatus(followUp.id, "ready_to_create");
    store.resolveProjectBoardProofDecision({ cardId: reviewed.id, action: "accept_done", reason: "Parent scope is already complete." });

    store.updateProjectBoardStatus(board.id, "active");
    expect(store.createReadyProjectBoardTasks(board.id)).toEqual([]);
    expect(() => store.approveProjectBoardCard(followUp.id)).toThrow('parent card "Parent proof card" is already done');

    store.updateProjectBoardCardCandidateStatus(followUp.id, "needs_clarification");
    expect(() => store.updateProjectBoardCardCandidateStatus(followUp.id, "ready_to_create")).toThrow(
      'parent card "Parent proof card" is already done',
    );
    expect(store.getProjectBoardCard(followUp.id)).toMatchObject({ status: "draft", candidateStatus: "needs_clarification" });
  });

  it("materializes Pi-suggested proof follow-up cards without rewriting the approved parent", () => {
    const thread = store.createThread("Pi proof follow-up thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nImplement and prove a visual polish card." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Visual proof card",
      summary: "Exercise Pi-suggested proof follow-up handling.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement responsive polish that needs screenshot proof." }],
      openQuestions: [],
      risks: [],
      verification: ["Capture desktop and mobile screenshots."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Pi proof follow-up board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const originalDescription = approved.description;
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/pi-proof-follow-up" });
    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/index.html"],
        lastAssistantText: "Implemented the responsive polish, but screenshots were not captured before handoff.",
      },
    });

    store.applyProjectBoardCardProofReview({
      runId: run.id,
      review: {
        status: "needs_follow_up",
        summary: "Implementation evidence exists, but the required viewport screenshots are missing.",
        satisfied: ["Implementation evidence recorded."],
        missing: ["Collect desktop and mobile screenshot evidence for the responsive polish."],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: new Date().toISOString(),
        reviewer: "ambient_pi",
        model: "gmi-proof-judge-test",
        confidence: 0.88,
        evidenceQuality: "mixed",
        recommendedAction: "follow_up",
        followUpSuggestion: {
          title: "Collect responsive polish screenshot proof",
          description: "Capture the missing viewport evidence for the completed responsive polish work.",
          acceptanceCriteria: [
            "Desktop screenshot shows the responsive polish rendered without overlap.",
            "Mobile screenshot shows the compact layout rendered without overlap.",
          ],
          testPlan: {
            unit: [],
            integration: ["Run the browser smoke check before collecting screenshots."],
            visual: ["Capture 1280px desktop and 390px mobile screenshots."],
            manual: ["Inspect screenshots for layout overlap and clipped text."],
          },
          clarificationQuestions: ["Confirm whether tablet viewport proof is also required before ticketizing."],
          labels: ["visual-proof", "viewport"],
          rationale: "The parent implementation should not be rewritten; the missing evidence is additive follow-up work.",
        },
      },
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed).toMatchObject({
      status: "blocked",
      description: originalDescription,
      proofReview: {
        status: "needs_follow_up",
        reviewer: "ambient_pi",
        followUpSuggestion: expect.objectContaining({
          title: "Collect responsive polish screenshot proof",
          labels: ["visual-proof", "viewport"],
        }),
      },
    });
    const followUps = store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up");
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({
      title: "Collect responsive polish screenshot proof",
      description: "Capture the missing viewport evidence for the completed responsive polish work.",
      status: "draft",
      candidateStatus: "needs_clarification",
      blockedBy: [approved.id],
      labels: expect.arrayContaining(["proof-follow-up", "pi-suggested-follow-up", "visual-proof", "viewport"]),
      acceptanceCriteria: [
        "Desktop screenshot shows the responsive polish rendered without overlap.",
        "Mobile screenshot shows the compact layout rendered without overlap.",
      ],
      testPlan: {
        unit: [],
        integration: ["Run the browser smoke check before collecting screenshots."],
        visual: ["Capture 1280px desktop and 390px mobile screenshots."],
        manual: ["Inspect screenshots for layout overlap and clipped text."],
      },
      clarificationQuestions: ["Confirm whether tablet viewport proof is also required before ticketizing."],
    });
    expect(reviewed.proofReview?.followUpCardIds).toEqual([followUps[0].id]);
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "card_proof_reviewed",
      metadata: expect.objectContaining({
        followUpSuggestionUsed: true,
        followUpSuggestionTitle: "Collect responsive polish screenshot proof",
      }),
    });
    expect(store.getActiveProjectBoard()?.events?.some((event) =>
      event.kind === "run_follow_up_created" && event.metadata.piSuggestedFollowUp === true,
    )).toBe(true);
  });

  it("preserves terminal blocker context without creating proof follow-up noise", () => {
    const thread = store.createThread("Terminal blocker thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip with a credential-gated smoke test." });
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
      missing: [
        expect.stringContaining("production smoke endpoint needs an API key from the user"),
      ],
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
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/provider-error-after-complete" });

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
    const progressEvent = (boardAfter?.events ?? []).find((event) => event.kind === "card_run_progress" && event.metadata.taskAction && event.metadata.runId === run.id);
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
