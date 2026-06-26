import { describe, expect, it } from "vitest";
import {
  projectBoardActiveCardDetail,
  projectBoardActiveCardOverviewModel,
  projectBoardExecutionControlModel,
  projectBoardProofEvidenceModel,
} from "./projectBoardUiModel";

describe("projectBoardProofProgressUiModel", () => {
  it("surfaces structured task actions as proof evidence and card progress", () => {
    const card = {
      id: "action-card",
      boardId: "board-1",
      title: "Action card",
      description: "Needs structured progress.",
      status: "in_progress" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Render the shell."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: ["Capture a screenshot."], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-action",
      orchestrationTaskId: "task-action",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const task = {
      id: "task-action",
      identifier: "LOCAL-42",
      title: "Action task",
      state: "in_progress",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run = {
      id: "run-action",
      taskId: "task-action",
      attemptNumber: 0,
      status: "running",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-42",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        kind: "agent-run",
        taskToolActions: [
          {
            actionId: "heartbeat-1",
            action: "task_heartbeat",
            cardId: "action-card",
            createdAt: "2026-01-01T00:04:00.000Z",
            summary: "Mounted the shell and moved into verification.",
            completed: ["Created the render loop."],
            remaining: ["Capture visual proof."],
            metadata: { transport: "native_tool", toolName: "task_heartbeat" },
          },
          {
            actionId: "proof-1",
            action: "task_report_proof",
            cardId: "action-card",
            createdAt: "2026-01-01T00:06:00.000Z",
            summary: "Unit and visual proof passed.",
            commands: ["pnpm vitest src/game/renderLoop.test.ts"],
            changedFiles: ["src/game/renderLoop.ts"],
            screenshots: ["/tmp/project/test-results/render-loop.png"],
            browserTraces: [],
            visualChecks: [{ path: "test-results/render-loop.png", result: "nonblank_image_detected", width: 1024, height: 768 }],
            manualChecks: ["Opened the scene locally."],
            metadata: { transport: "native_tool", toolName: "task_report_proof" },
          },
        ],
        taskActionDiagnostics: {
          schemaVersion: 1,
          actionCount: 2,
          nativeToolActionCount: 2,
          fencedFallbackActionCount: 0,
          unknownActionCount: 0,
          terminalActionCount: 1,
          nativeToolUsed: true,
          fallbackJsonUsed: false,
          fallbackOnly: false,
          missingProtocol: [],
          integrityIssueCount: 0,
        },
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);
    const detail = projectBoardActiveCardDetail(card, [card], [task], [run]);
    const overview = projectBoardActiveCardOverviewModel(
      card,
      { sources: [] },
      detail,
      projectBoardExecutionControlModel(card, { events: [] }, detail),
    );

    expect(evidence.summary).toContain("2 task actions");
    expect(evidence.metrics.map((metric) => metric.label)).toContain("Actions");
    expect(evidence.taskActions.map((action) => [action.label, action.tone])).toEqual([
      ["Progress heartbeat", "neutral"],
      ["Proof reported", "success"],
    ]);
    expect(evidence.files.map((file) => file.path)).toEqual(["src/game/renderLoop.ts"]);
    expect(evidence.artifacts.map((artifact) => artifact.kind)).toEqual(["screenshot", "log", "command", "log"]);
    expect(detail.progressLedger.find((entry) => entry.id === "completed_work")).toMatchObject({
      state: "active",
      detail: expect.stringContaining("Proof reported"),
    });
    expect(detail.progressLedger.find((entry) => entry.id === "task_actions")).toMatchObject({
      state: "done",
      detail: expect.stringContaining("Native task tools: 2; fallback JSON: 0; terminal: 1"),
    });
    expect(detail.progressLedger.find((entry) => entry.id === "task_actions")).toMatchObject({
      state: "done",
      detail: expect.stringContaining("Proof reported"),
    });
    expect(detail.progressLedger.find((entry) => entry.id === "verification")?.detail).toContain("4 verification items");
    expect(detail.progressLedger.find((entry) => entry.id === "proof_collected")?.detail).toContain("2 task actions");
    expect(overview.sections.find((section) => section.id === "proof")?.detail).toContain(
      "Native task tools: 2; fallback JSON: 0; terminal: 1",
    );
  });

  it("treats running transcript snapshots as live progress instead of completed proof", () => {
    const card = {
      id: "progress-card",
      boardId: "board-1",
      title: "Build shell",
      description: "Create the first shell.",
      status: "in_progress" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Canvas mounts."],
      testPlan: { unit: ["Run unit tests"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-progress",
      orchestrationTaskId: "task-progress",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const task = {
      id: "task-progress",
      identifier: "LOCAL-12",
      title: "Build shell",
      state: "in_progress",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const run = {
      id: "run-progress",
      taskId: "task-progress",
      attemptNumber: 0,
      status: "running",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-12",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        kind: "agent-run-progress",
        elapsedMs: 6500,
        outputCharCount: 1204,
        messageCount: 3,
        toolMessageCount: 1,
        lastAssistantText: "Working on the shell.",
        lastAssistantStatus: "streaming",
        taskToolActions: [
          {
            actionId: "heartbeat-1",
            action: "task_heartbeat",
            cardId: "progress-card",
            createdAt: "2026-01-01T00:04:00.000Z",
            summary: "Scaffolded the shell and started validation.",
            completed: ["Created app scaffold."],
            remaining: ["Finish validation."],
          },
        ],
      },
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], [run]);
    const evidence = projectBoardProofEvidenceModel(run, card);

    expect(evidence.summary).toContain("1,204 output chars");
    expect(evidence.metrics.map((metric) => [metric.label, metric.value])).toEqual(
      expect.arrayContaining([
        ["Elapsed", "6.5s"],
        ["Output", "1,204 chars"],
        ["Tools", "1"],
      ]),
    );
    expect(detail.progressLedger.find((entry) => entry.id === "completed_work")).toMatchObject({
      state: "active",
      detail: expect.stringContaining("Progress heartbeat"),
    });
    expect(detail.progressLedger.find((entry) => entry.id === "verification")).toMatchObject({
      state: "active",
    });
    expect(detail.progressLedger.find((entry) => entry.id === "proof_collected")).toMatchObject({
      state: "active",
      detail: expect.stringContaining("6.5s elapsed"),
    });
    expect(detail.progressLedger.find((entry) => entry.id === "proof_collected")?.detail).toContain("1,204 output chars");
    expect(detail.progressLedger.find((entry) => entry.id === "proof_collected")?.detail).toContain("1 tool card");
    expect(detail.progressLedger.find((entry) => entry.id === "task_actions")).toMatchObject({
      state: "active",
    });
  });

  it("explains progress ledger states for failed runs and missing proof specs", () => {
    const base = {
      boardId: "board-1",
      description: "Card description.",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Accept it"],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const card = { ...base, id: "blocked", title: "Blocked card", orchestrationTaskId: "task-blocked" };
    const task = {
      id: "task-blocked",
      identifier: "LOCAL-9",
      title: "Blocked task",
      state: "ready",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const failedRun = {
      id: "run-failed",
      taskId: "task-blocked",
      attemptNumber: 0,
      status: "failed",
      workspacePath: "/tmp/failed",
      startedAt: "2026-01-01T00:03:00.000Z",
      error: "Need API credentials.",
      proofOfWork: {
        kind: "agent-run",
        messageCount: 3,
        lastAssistantStatus: "error",
        afterRunHook: { ok: false, durationMs: 125 },
        focusLoop: { passNumber: 2, maxTurns: 3, action: "finish", reason: "needs_info", missingProof: [] },
      },
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], [failedRun]);

    expect(detail.proofExpectationCount).toBe(0);
    expect(detail.progressLedger.map((entry) => [entry.id, entry.state])).toEqual([
      ["completed_work", "blocked"],
      ["remaining_work", "blocked"],
      ["files_touched", "missing"],
      ["verification", "blocked"],
      ["proof_collected", "done"],
      ["task_actions", "missing"],
      ["blockers_questions", "blocked"],
      ["next_action", "blocked"],
    ]);
    expect(detail.progressLedger.find((entry) => entry.id === "blockers_questions")?.detail).toContain("Need API credentials");
    expect(detail.progressLedger.find((entry) => entry.id === "proof_collected")?.detail).toContain("focus pass 2 needs_info");
    expect(detail.progressLedger.find((entry) => entry.id === "verification")?.detail).toContain("afterRun hook failed");
  });

  it("surfaces explicit task pause states in the progress ledger", () => {
    const card = {
      id: "needs-info-card",
      boardId: "board-1",
      title: "Needs info card",
      description: "Card description.",
      status: "blocked" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Accept it"],
      testPlan: { unit: ["Run unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      orchestrationTaskId: "task-needs-info",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const task = {
      id: "task-needs-info",
      identifier: "LOCAL-10",
      title: "Needs info task",
      state: "needs_info",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], []);

    expect(detail.progressLedger.find((entry) => entry.id === "remaining_work")).toMatchObject({
      state: "blocked",
      detail: "Collect the missing information or credentials before retrying this task.",
    });
    expect(detail.progressLedger.find((entry) => entry.id === "next_action")).toMatchObject({
      state: "blocked",
      detail: "Collect the missing information or credentials before retrying this task.",
    });
  });
});
