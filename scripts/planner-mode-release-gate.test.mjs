import { describe, expect, it } from "vitest";
import {
  buildPlannerModeReleaseGateReport,
  plannerModeReleaseGatePassed,
} from "./planner-mode-release-gate-lib.mjs";

describe("planner mode release gate", () => {
  it("passes the static gate when planner scripts and hardening are present", () => {
    const report = buildPlannerModeReleaseGateReport(staticInput());

    expect(report.status).toBe("passed_with_live_skipped");
    expect(plannerModeReleaseGatePassed(report)).toBe(true);
    expect(plannerModeReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual([]);
    expect(report.releaseDecision.advisoryIssues).toContain("Live planner dogfoods were skipped for this static gate run.");
  });

  it("passes when selected live dogfoods pass", () => {
    const report = buildPlannerModeReleaseGateReport({
      ...staticInput(),
      liveResults: [
        { name: "small", script: "test:planner-dogfood:live", status: "passed", durationMs: 191_500, exitCode: 0 },
        { name: "repair", script: "test:planner-dogfood:repair-live", status: "passed", durationMs: 575_700, exitCode: 0 },
        { name: "medium", script: "test:planner-dogfood:medium-live", status: "passed", durationMs: 478_800, exitCode: 0 },
      ],
      requireLive: true,
    });

    expect(report.status).toBe("passed");
    expect(plannerModeReleaseGatePassed(report, { requireLive: true })).toBe(true);
    expect(report.live.results).toHaveLength(3);
  });

  it("fails when required scripts or runtime safeguards are missing", () => {
    const input = staticInput();
    delete input.packageJson.scripts["test:planner-dogfood:medium-live"];
    input.files.agentRuntime = "const ASSISTANT_TERMINAL_PROMPT_GRACE_MS = 5000;";
    const report = buildPlannerModeReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(plannerModeReleaseGatePassed(report)).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "medium multi-decision live dogfood command is registered.",
        "runtime finalizes trailing assistant text streams without terminal events.",
      ]),
    );
  });

  it("fails strict freshness when the current source tree is dirty", () => {
    const report = buildPlannerModeReleaseGateReport({
      ...staticInput(),
      requireCurrentHead: true,
      sourceRevision: { gitHead: "abc123", dirty: true },
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain(
      "Current worktree has tracked uncommitted changes; strict planner release-gate freshness requires a clean source tree.",
    );
  });

  it("fails when live dogfood is required but not selected", () => {
    const report = buildPlannerModeReleaseGateReport({
      ...staticInput(),
      requireLive: true,
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain("Live planner dogfoods were required but not selected.");
  });
});

function staticInput() {
  return {
    packageJson: {
      scripts: {
        "test:planner-dogfood": "bash scripts/test-node-native.sh src/main/plannerDogfood.test.ts",
        "test:planner-dogfood:live": "AMBIENT_PLANNER_DOGFOOD_LIVE=1 bash scripts/test-node-native.sh src/main/plannerDogfood.test.ts",
        "test:planner-dogfood:repair-live": "AMBIENT_PLANNER_DOGFOOD_REPAIR_LIVE=1 bash scripts/test-node-native.sh src/main/plannerDogfood.test.ts",
        "test:planner-dogfood:medium-live": "AMBIENT_PLANNER_DOGFOOD_MEDIUM_LIVE=1 bash scripts/test-node-native.sh src/main/plannerDogfood.test.ts",
        "test:planner-release-gate": "node scripts/planner-mode-release-gate.mjs",
        "test:planner-release-gate:live": "node scripts/planner-mode-release-gate.mjs --run-live --require-live",
        typecheck: "tsc --noEmit",
      },
    },
    files: {
      plannerDogfoodTest: [
        "AMBIENT_PLANNER_DOGFOOD_LIVE question capture, answer finalization",
        "AMBIENT_PLANNER_DOGFOOD_REPAIR_LIVE dogfood-injected-malformed-diagram",
        "AMBIENT_PLANNER_DOGFOOD_MEDIUM_LIVE exactly two required questions plannerDogfoodMissingDiagramKinds",
        "artifact before refinement artifact after refinement plannerRuntimeDiagnostic",
      ].join("\n"),
      agentRuntime: [
        "const ASSISTANT_TERMINAL_PROMPT_GRACE_MS = 5000;",
        "const ASSISTANT_TERMINAL_TEXT_IDLE_GRACE_MS = 30000;",
        "scheduleAssistantTerminalCompletion(ASSISTANT_TERMINAL_TEXT_IDLE_GRACE_MS);",
        "function finalizeAssistantTerminalRun() {}",
        "session.steer(postToolIdleContinuationPrompt(lastCompletedTool));",
        "assistantTerminalCompletion",
        "clearAssistantTerminalCompletion();",
        "clearAssistantTerminalCompletion();",
        "clearAssistantTerminalCompletion();",
        "clearAssistantTerminalCompletion();",
        "plannerDecisionQuestionsForFinalArtifact",
        "isPlannerFinalizationResponse",
        "inheritedQuestions",
      ].join("\n"),
      projectStore: [
        "question.answer?.kind",
        "question.answer?.kind === \"option\"",
        "question.answer?.answeredAt",
      ].join("\n"),
      planningModeEnhancements: [
        "Phase 6 complete",
        "Medium live dogfood passed",
        "planner release gate",
      ].join("\n"),
    },
    sourceRevision: { gitHead: "abc123", dirty: false },
  };
}
