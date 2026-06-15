import { describe, expect, it } from "vitest";
import {
  WORKFLOW_HARD_KILL_REQUIRED_CHECKS,
  evaluateWorkflowHardKillGateResults,
  runParentProcessHardKillEscalation,
} from "./workflow-hard-kill-gate-lib.mjs";

describe("workflow hard-kill gate", () => {
  it("passes only when every required check passes", () => {
    const checks = WORKFLOW_HARD_KILL_REQUIRED_CHECKS.map((id) => ({ id, status: "passed" }));

    expect(evaluateWorkflowHardKillGateResults(checks)).toMatchObject({
      status: "passed",
      checked: WORKFLOW_HARD_KILL_REQUIRED_CHECKS.length,
      issues: [],
    });
  });

  it("reports failed and missing required checks", () => {
    const gate = evaluateWorkflowHardKillGateResults([
      { id: WORKFLOW_HARD_KILL_REQUIRED_CHECKS[0], status: "failed", summary: "fixture failed" },
    ]);

    expect(gate.status).toBe("failed");
    expect(gate.issues).toEqual([
      { id: WORKFLOW_HARD_KILL_REQUIRED_CHECKS[0], status: "failed", issue: "fixture failed" },
      { id: WORKFLOW_HARD_KILL_REQUIRED_CHECKS[1], status: "missing", issue: `${WORKFLOW_HARD_KILL_REQUIRED_CHECKS[1]} did not run.` },
    ]);
  });

  it("escalates a SIGTERM-resistant child process to SIGKILL", async () => {
    const check = await runParentProcessHardKillEscalation({ timeoutMs: 200, killGraceMs: 75 });

    expect(check).toMatchObject({
      id: "parent-process-hard-kill-escalation",
      status: "passed",
      timedOut: true,
      signal: "SIGKILL",
      escalatedToSigkill: true,
    });
  });
});
