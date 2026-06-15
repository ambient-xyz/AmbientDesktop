import { describe, expect, it } from "vitest";
import {
  parseProjectBoardTaskToolActions,
  projectBoardNativeTaskToolDefinitions,
  projectBoardTaskToolActionDiagnostics,
  projectBoardTaskToolActionIntegrityIssues,
  projectBoardTaskToolActionsFromText,
  projectBoardTaskToolActionsFromTexts,
  projectBoardTaskToolActionFromNativeCall,
  projectBoardTaskToolActionTransport,
  projectBoardTaskToolActionsFromProofOfWork,
  projectBoardTaskToolActionWithNativeMetadata,
  projectBoardTaskToolChangedFiles,
  projectBoardTaskToolCompleted,
  projectBoardTaskToolFollowUps,
  projectBoardTaskToolHandoffSummary,
  projectBoardTaskToolInstructions,
  projectBoardTaskToolNativeResultText,
  projectBoardTaskToolPromptSection,
  projectBoardTaskToolProtocolMissing,
  projectBoardTaskToolProofSummary,
  projectBoardTaskToolRemaining,
} from "./projectBoardTaskTools";

const now = "2026-05-05T12:00:00.000Z";

describe("projectBoardTaskTools", () => {
  it("validates model-facing task actions and fills protocol defaults", () => {
    const actions = parseProjectBoardTaskToolActions([
      {
        actionId: "action-show",
        action: "task_show",
        createdAt: now,
      },
      {
        actionId: "action-block",
        action: "task_block",
        createdAt: now,
        reason: "Need API credentials.",
      },
    ]);

    expect(actions[0]).toMatchObject({ action: "task_show", requested: ["card"], metadata: {} });
    expect(actions[1]).toMatchObject({
      action: "task_block",
      questions: [],
      blockedBy: [],
      terminal: false,
      retryable: true,
    });
  });

  it("rejects unknown task action payloads", () => {
    expect(() =>
      parseProjectBoardTaskToolActions([
        {
          actionId: "bad-action",
          action: "task_magic",
          createdAt: now,
        },
      ]),
    ).toThrow(/Invalid input/);
  });

  it("ignores malformed proof-of-work task actions without failing the run", () => {
    expect(projectBoardTaskToolActionsFromProofOfWork({ taskToolActions: [{ action: "task_magic" }] })).toEqual([]);
  });

  it("projects proof, handoff, and follow-up material from task actions", () => {
    const actions = parseProjectBoardTaskToolActions([
      {
        actionId: "action-heartbeat",
        action: "task_heartbeat",
        createdAt: now,
        summary: "Renderer is mounted.",
        completed: ["Mounted one canvas."],
        remaining: ["Run visual proof."],
      },
      {
        actionId: "action-proof",
        action: "task_report_proof",
        createdAt: now,
        summary: "Automated proof passed.",
        changedFiles: ["src/App.tsx"],
        manualChecks: ["Opened the app."],
      },
      {
        actionId: "action-follow-up",
        action: "task_create_followup",
        createdAt: now,
        title: "Add resize stress test",
        reason: "Resize proof is still manual-only.",
        blockedBy: ["card-shell"],
      },
      {
        actionId: "action-handoff",
        action: "task_report_handoff",
        createdAt: now,
        summary: "Shell is ready for controls.",
        completed: ["Captured handoff."],
        remaining: ["Controls can begin."],
        risks: ["Resize proof is thin."],
      },
    ]);

    expect(projectBoardTaskToolInstructions()).toContain("task_complete");
    expect(projectBoardTaskToolInstructions()).toContain("call task_complete immediately");
    expect(projectBoardTaskToolInstructions()).toContain("only task_show/task_heartbeat or prose");
    expect(projectBoardTaskToolInstructions()).toContain("before your final assistant message");
    expect(projectBoardTaskToolInstructions()).toContain("after meaningful milestones or before long verification loops");
    expect(projectBoardTaskToolInstructions()).toContain("Your first observable board action");
    expect(projectBoardTaskToolInstructions()).toContain("completed may be empty");
    expect(projectBoardTaskToolPromptSection({ id: "card-1", title: "Card", acceptanceCriteria: [], testPlan: { unit: [], integration: [], visual: [], manual: [] } })).toContain(
      "must use the discriminator field exactly as `action`",
    );
    expect(
      projectBoardTaskToolPromptSection(
        { id: "card-1", title: "Card", acceptanceCriteria: [], testPlan: { unit: [], integration: [], visual: [], manual: [] } },
        {
          charterProjectSummary: {
            summary: "Project board recoverability work.",
            majorSystems: ["Planner", "Board ledger"],
            sourceCoverage: [],
            risks: ["Source context can rot."],
            dependencyHints: ["Charter summary before planner prompts."],
            unresolvedDecisions: [],
            citations: [],
            coverageGaps: ["No RLM provider yet."],
            sourceChecksumSet: ["source-plan:aaaaaaaa"],
            charterAnswerChecksum: "bbbbbbbb",
            generatedAt: now,
            generator: "fallback_heuristic",
          },
        },
      ),
    ).toContain("Active charter project summary");
    expect(projectBoardTaskToolProofSummary(actions)).toBe("Automated proof passed.");
    expect(projectBoardTaskToolHandoffSummary(actions)).toBe("Shell is ready for controls.");
    expect(projectBoardTaskToolChangedFiles(actions)).toEqual(["src/App.tsx"]);
    expect(projectBoardTaskToolCompleted(actions)).toEqual(["Mounted one canvas.", "Captured handoff."]);
    expect(projectBoardTaskToolRemaining(actions)).toEqual(["Run visual proof.", "Controls can begin."]);
    expect(projectBoardTaskToolFollowUps(actions)).toEqual([
      {
        title: "Add resize stress test",
        reason: "Resize proof is still manual-only.",
        blockedBy: ["card-shell"],
      },
    ]);
  });

  it("defines native Pi task tools and converts native calls into durable actions", () => {
    const definitions = projectBoardNativeTaskToolDefinitions();
    expect(definitions.map((definition) => definition.name)).toEqual([
      "task_show",
      "task_heartbeat",
      "task_block",
      "task_complete",
      "task_create_followup",
      "task_report_proof",
      "task_report_handoff",
    ]);
    expect(definitions.find((definition) => definition.name === "task_report_proof")?.promptSnippet).toContain("task_report_proof");
    expect(definitions.find((definition) => definition.name === "task_report_proof")?.parameters).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          cardId: expect.any(Object),
          taskId: expect.any(Object),
          runId: expect.any(Object),
        }),
      }),
    );

    const action = projectBoardTaskToolActionFromNativeCall(
      "task_report_proof",
      {
        summary: "Reducer proof passed.",
        commands: ["pnpm vitest src/game/inputReducer.test.ts"],
        changedFiles: ["src/game/inputReducer.ts"],
      },
      {
        actionId: "native-proof-1",
        createdAt: now,
        cardId: "card-input",
        taskId: "task-input",
        runId: "run-input",
      },
    );

    expect(action).toMatchObject({
      action: "task_report_proof",
      actionId: "native-proof-1",
      cardId: "card-input",
      taskId: "task-input",
      runId: "run-input",
      commands: ["pnpm vitest src/game/inputReducer.test.ts"],
      changedFiles: ["src/game/inputReducer.ts"],
    });
    expect(projectBoardTaskToolActionsFromText(projectBoardTaskToolNativeResultText(action)).map((item) => item.actionId)).toEqual(["native-proof-1"]);
    expect(projectBoardTaskToolNativeResultText(action)).toContain("call task_complete now");
  });

  it("marks native actions and reports native versus fallback diagnostics", () => {
    const fallbackAction = parseProjectBoardTaskToolActions([
      {
        actionId: "fallback-heartbeat-1",
        action: "task_heartbeat",
        createdAt: now,
        summary: "Started with fenced JSON fallback.",
        completed: [],
        remaining: ["Report proof."],
      },
    ])[0];
    const nativeAction = projectBoardTaskToolActionWithNativeMetadata(
      projectBoardTaskToolActionFromNativeCall(
        "task_complete",
        {
          summary: "Native proof completed.",
          completed: ["Implemented checker."],
          remaining: [],
          risks: [],
          commands: ["pnpm test"],
          changedFiles: ["src/checker.ts"],
          screenshots: [],
          browserTraces: [],
          visualChecks: [],
          manualChecks: [],
        },
        {
          actionId: "native-complete-1",
          createdAt: now,
          cardId: "card-native",
          taskId: "task-native",
          runId: "run-native",
        },
      ),
      "task_complete",
    );

    expect(projectBoardTaskToolActionTransport(fallbackAction)).toBe("fenced_fallback");
    expect(projectBoardTaskToolActionTransport(nativeAction)).toBe("native_tool");
    expect(projectBoardTaskToolActionDiagnostics([fallbackAction, nativeAction])).toMatchObject({
      actionCount: 2,
      nativeToolActionCount: 1,
      fencedFallbackActionCount: 1,
      terminalActionCount: 1,
      nativeToolUsed: true,
      fallbackJsonUsed: true,
      fallbackOnly: false,
      latestAction: "task_complete",
      integrityIssueCount: 0,
    });
  });

  it("extracts fenced task action blocks from assistant text", () => {
    const text = [
      "Implemented the shell.",
      "```task_actions",
      JSON.stringify([
        {
          actionId: "action-1",
          action: "task_heartbeat",
          createdAt: now,
          summary: "Mounted shell.",
          completed: ["Mounted one canvas."],
          remaining: [],
        },
      ]),
      "```",
      "```json",
      JSON.stringify({
        task_actions: [
          {
            actionId: "action-2",
            action: "task_report_proof",
            createdAt: now,
            summary: "Tests passed.",
            commands: ["pnpm test"],
            changedFiles: ["src/App.tsx"],
          },
        ],
      }),
      "```",
    ].join("\n");

    expect(projectBoardTaskToolActionsFromText(text).map((action) => action.action)).toEqual(["task_heartbeat", "task_report_proof"]);
    expect(projectBoardTaskToolActionsFromTexts([text, text]).map((action) => action.actionId)).toEqual(["action-1", "action-2"]);
  });

  it("flags copied sample values and empty proof packets", () => {
    const actions = parseProjectBoardTaskToolActions([
      {
        actionId: "proof-1",
        action: "task_report_proof",
        createdAt: now,
        summary: "Verification passed.",
        commands: [],
        changedFiles: [],
      },
      {
        actionId: "real-proof",
        action: "task_report_proof",
        createdAt: now,
        summary: "Reducer unit proof passed.",
        commands: ["pnpm vitest src/game/inputReducer.test.ts"],
        changedFiles: ["src/game/inputReducer.ts"],
      },
    ]);

    expect(projectBoardTaskToolActionIntegrityIssues(actions)).toEqual([
      "task_report_proof proof-1 appears to contain copied sample value(s): actionId, summary.",
      "task_report_proof proof-1 has no command, changed-file, screenshot, browser-trace, visual-check, manual-check, or completed-item evidence.",
    ]);
  });

  it("allows task_complete as a lean terminal marker after material proof", () => {
    const actions = parseProjectBoardTaskToolActions([
      {
        actionId: "real-proof",
        action: "task_report_proof",
        createdAt: now,
        summary: "Reducer proof passed.",
        commands: ["pnpm vitest src/game/inputReducer.test.ts"],
        changedFiles: ["src/game/inputReducer.ts"],
      },
      {
        actionId: "complete-reducer",
        action: "task_complete",
        createdAt: now,
        summary: "Card is complete.",
        completed: [],
        remaining: [],
        risks: [],
        commands: [],
        changedFiles: [],
        screenshots: [],
        browserTraces: [],
        visualChecks: [],
        manualChecks: [],
      },
    ]);

    expect(projectBoardTaskToolActionIntegrityIssues(actions)).toEqual([]);
  });

  it("reports missing terminal task-action protocol pieces", () => {
    const heartbeatOnly = parseProjectBoardTaskToolActions([
      {
        actionId: "heartbeat-1",
        action: "task_heartbeat",
        createdAt: now,
        summary: "Started implementation.",
        completed: [],
        remaining: ["Report proof."],
      },
    ]);
    expect(projectBoardTaskToolProtocolMissing(heartbeatOnly)).toEqual(["terminal_task_action", "proof_block_complete_followup_or_handoff"]);

    const completeProtocol = parseProjectBoardTaskToolActions([
      {
        actionId: "heartbeat-1",
        action: "task_heartbeat",
        createdAt: now,
        summary: "Started implementation.",
        completed: [],
        remaining: ["Report proof."],
      },
      {
        actionId: "proof-1",
        action: "task_report_proof",
        createdAt: now,
        summary: "Tests passed.",
        commands: ["pnpm test"],
        changedFiles: ["src/App.tsx"],
      },
    ]);
    expect(projectBoardTaskToolProtocolMissing(completeProtocol)).toEqual([]);
  });

  it("renders a native-first worker prompt section with bounded fallback JSON requirements", () => {
    const section = projectBoardTaskToolPromptSection({
      id: "card-shell",
      title: "Create shell",
      acceptanceCriteria: ["Canvas mounts."],
      testPlan: {
        unit: ["Cover lifecycle helpers."],
        integration: ["Run app smoke."],
        visual: ["Capture nonblank canvas."],
        manual: [],
      },
    });

    expect(section).toContain("Project-board task action protocol");
    expect(section).toContain("Card: Create shell (card-shell)");
    expect(section).toContain("Primary path: call native project-board task tools directly");
    expect(section).toContain("Ambient fills actionId, createdAt, cardId, taskId, and runId for native tool calls when you omit them.");
    expect(section).toContain("Fallback path: use a fenced ```task_actions JSON array only when native task tools are unavailable");
    expect(section).toContain("mandatory durable progress/proof checkpoints");
    expect(section).toContain("Before reading files, editing files, or running shell commands");
    expect(section).toContain("Your first observable board action");
    expect(section).toContain("task_report_proof");
    expect(section).toContain("Visual proof: Capture nonblank canvas.");
    expect(section).toContain("Fallback JSON requirements (only when native task tools are unavailable)");
    expect(section).toContain("fresh run-specific");
    expect(section.indexOf("Primary path: call native project-board task tools directly")).toBeLessThan(
      section.indexOf("Fallback JSON requirements (only when native task tools are unavailable)"),
    );
    expect(section).not.toContain("If Ambient exposes native tools named");
    expect(section).not.toContain("Every action must include actionId");
    expect(section).not.toContain("Short progress update");
    expect(section).not.toContain("Concrete completed item");
    expect(section).not.toContain("Verification passed");
    expect(section).not.toContain("src/App.tsx");
    expect(section).not.toContain('"actionId"');
  });
});
