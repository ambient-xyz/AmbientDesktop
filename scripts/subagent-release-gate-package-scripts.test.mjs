import { describe, expect, it } from "vitest";
import { buildSubagentReleaseGateReport, subagentReleaseGatePassed } from "./subagent-release-gate-lib.mjs";
import { staticInput } from "./subagent-release-gate-test-fixtures.mjs";

describe("sub-agent release gate package scripts", () => {
  it("fails when a required package script is missing", () => {
    const input = staticInput();
    delete input.packageJson.scripts["test:subagents:release-gate"];

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report)).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Missing package script test:subagents:release-gate.");
  });

  it("fails when the callable workflow dogfood proof artifact is missing", () => {
    const input = staticInput();
    delete input.artifacts.callableWorkflowDogfood;

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain("Run pnpm run test:callable-workflow-dogfood:proof before the release gate.");
  });

  it("fails when the callable workflow rehydration proof artifact is missing", () => {
    const input = staticInput();
    delete input.artifacts.callableWorkflowRehydration;

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain(
      "Run pnpm run test:callable-workflow-rehydration:proof before the release gate.",
    );
  });

  it("fails when the lifecycle edge proof artifact is missing", () => {
    const input = staticInput();
    delete input.artifacts.lifecycleEdges;

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain("Run pnpm run test:subagents:lifecycle-edges:proof before the release gate.");
  });

  it("fails when the deterministic release suite omits core contract tests", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:deterministic"] = input.packageJson.scripts["test:subagents:deterministic"].replace(
      "src/main/subagents/subagentHardening.test.ts ",
      "",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["Deterministic sub-agent suite is missing src/main/subagents/subagentHardening.test.ts."]),
    );
  });

  it("fails when the deterministic release suite omits finalization blocking helpers", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:deterministic"] = input.packageJson.scripts["test:subagents:deterministic"].replace(
      "src/main/agent-runtime/agentRuntimeFinalizationBlocking.test.ts ",
      "",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["Deterministic sub-agent suite is missing src/main/agent-runtime/agentRuntimeFinalizationBlocking.test.ts."]),
    );
  });

  it("fails when the deterministic release suite omits Desktop dogfood runner unit tests", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:deterministic"] = input.packageJson.scripts["test:subagents:deterministic"]
      .replace("scripts/subagent-desktop-dogfood.test.mjs ", "")
      .replace("scripts/subagent-desktop-dogfood-repeat.test.mjs", "");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Deterministic sub-agent suite is missing scripts/subagent-desktop-dogfood.test.mjs.",
        "Deterministic sub-agent suite is missing scripts/subagent-desktop-dogfood-repeat.test.mjs.",
      ]),
    );
  });

  it("fails when release gates bypass the deterministic sub-agent suite", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:release-gate"] = "node scripts/subagent-release-gate.mjs";

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["test:subagents:release-gate must run pnpm run test:subagents:deterministic."]),
    );
  });

  it("fails when the deterministic release gate omits local runtime control proof", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:release-gate"] = input.packageJson.scripts["test:subagents:release-gate"].replace(
      " && pnpm run test:local-runtime-control:proof",
      "",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["test:subagents:release-gate must run pnpm run test:local-runtime-control:proof."]),
    );
  });

  it("fails when the live-required release gate omits Desktop dogfood", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:release-gate:live"] = input.packageJson.scripts["test:subagents:release-gate:live"].replace(
      " && pnpm run test:subagents:live-confidence:desktop-dogfood -- --allow-blocked",
      "",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "test:subagents:release-gate:live must run pnpm run test:subagents:live-confidence:desktop-dogfood -- --allow-blocked.",
        "test:subagents:release-gate:live must run Desktop dogfood directly or through pnpm run test:subagents:live-confidence:desktop-dogfood -- --allow-blocked.",
      ]),
    );
  });

  it("fails when the live-required release gate omits a live confidence lane", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:release-gate:live"] = input.packageJson.scripts["test:subagents:release-gate:live"].replace(
      " && pnpm run test:subagents:live-confidence:local-runtime -- --allow-blocked",
      "",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "test:subagents:release-gate:live must run pnpm run test:subagents:live-confidence:local-runtime -- --allow-blocked.",
      ]),
    );
  });

  it("fails when the graduation release gate omits ready Desktop dogfood history", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:release-gate:graduation"] = input.packageJson.scripts[
      "test:subagents:release-gate:graduation"
    ].replace(" && pnpm run test:subagents:desktop-dogfood-repeat -- --require-ready", "");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "test:subagents:release-gate:graduation must run pnpm run test:subagents:desktop-dogfood-repeat -- --require-ready.",
      ]),
    );
  });

  it("fails when the graduation release gate omits workflow jitter release-profile evidence", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:release-gate:graduation"] = input.packageJson.scripts[
      "test:subagents:release-gate:graduation"
    ].replace(" && pnpm run test:workflow-jitter-release-gate:release-profile", "");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "test:subagents:release-gate:graduation must run pnpm run test:workflow-jitter-release-gate:release-profile.",
      ]),
    );
  });

  it("fails when workflow jitter release-profile command can skip writing the gate artifact", () => {
    const input = staticInput();
    input.packageJson.scripts["test:workflow-jitter-release-gate:release-profile"] =
      "pnpm run test:workflow-jitter-matrix:release-profile && node scripts/workflow-jitter-release-gate.mjs --release-profile";

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "test:workflow-jitter-release-gate:release-profile must use scripts/workflow-jitter-release-profile-gate.mjs so the release gate writes an artifact even when the matrix blocks.",
      ]),
    );
  });

  it("fails when the graduation release gate omits ready live history accounting", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:release-gate:graduation"] = input.packageJson.scripts[
      "test:subagents:release-gate:graduation"
    ].replace(" && pnpm run subagents:live-history-report -- --require-ready", "");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "test:subagents:release-gate:graduation must run pnpm run subagents:live-history-report -- --require-ready.",
      ]),
    );
  });

  it("fails when the graduation release gate omits maturity-history enforcement", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:release-gate:graduation"] = input.packageJson.scripts[
      "test:subagents:release-gate:graduation"
    ].replace(" --require-maturity-history", "");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "test:subagents:release-gate:graduation must run the release gate with --require-live and --require-maturity-history.",
      ]),
    );
  });

  it("fails when the Desktop dogfood repeat runner omits history thresholds", () => {
    const input = staticInput();
    input.files.subagentDesktopDogfoodRepeatRunnerLib = input.files.subagentDesktopDogfoodRepeatRunnerLib.replace(
      "--min-desktop-dogfood-runs=",
      "--desktop-runs=",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Desktop dogfood repeat runner builds graduation-ready full-app history is missing source anchor: --min-desktop-dogfood-runs=",
      ]),
    );
  });
});
