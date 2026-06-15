import { describe, expect, it } from "vitest";
import { SECURITY_REPRO_REQUIRED_IDS, evaluateSecurityReproGateResults } from "./security-repro-gate-lib.mjs";

describe("evaluateSecurityReproGateResults", () => {
  it("passes when every required finding is not reproduced", () => {
    const results = SECURITY_REPRO_REQUIRED_IDS.map((id) => ({ id, status: "not-reproduced" }));

    expect(evaluateSecurityReproGateResults(results)).toMatchObject({
      status: "passed",
      checked: SECURITY_REPRO_REQUIRED_IDS.length,
      issues: [],
    });
  });

  it("fails on vulnerable, inconclusive, error, and missing findings", () => {
    const results = SECURITY_REPRO_REQUIRED_IDS.filter((id) => id !== "F-004").map((id) => ({
      id,
      status: id === "F-001" ? "vulnerable" : id === "F-002" ? "inconclusive" : id === "F-003" ? "error" : "not-reproduced",
      summary: "fixture",
    }));

    const gate = evaluateSecurityReproGateResults(results);

    expect(gate.status).toBe("failed");
    expect(gate.issues.map((issue) => issue.id)).toEqual(["F-001", "F-002", "F-003", "F-004"]);
  });
});
