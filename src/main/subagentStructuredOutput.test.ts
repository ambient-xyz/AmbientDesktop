import { describe, expect, it } from "vitest";
import { getDefaultSubagentRoleProfile } from "../shared/subagentRoles";
import {
  extractSubagentStructuredResultFromText,
  REVIEWER_FINDINGS_HELP,
  REVIEWER_VERDICT_HELP,
  SUBAGENT_RESULT_JSON_MARKER,
  subagentStructuredResultTemplate,
  validateSubagentStructuredResult,
  validateSubagentStructuredResultArtifactForRole,
} from "./subagentStructuredOutput";

describe("subagentStructuredOutput", () => {
  it("extracts fenced structured result JSON after the marker", () => {
    const role = getDefaultSubagentRoleProfile("explorer");
    const structured = subagentStructuredResultTemplate(role);
    const text = [
      "Found the relevant files.",
      `${SUBAGENT_RESULT_JSON_MARKER}`,
      "```json",
      JSON.stringify(structured, null, 2),
      "```",
      "SUBAGENT_RESULT_STATUS: complete",
    ].join("\n");

    expect(extractSubagentStructuredResultFromText(text)).toEqual(structured);
  });

  it("validates role-specific structured output", () => {
    const role = getDefaultSubagentRoleProfile("reviewer");

    expect(validateSubagentStructuredResult({
      role,
      expectedStatus: "complete",
      structuredResult: {
        schemaVersion: "ambient-subagent-structured-result-v1",
        roleId: "reviewer",
        status: "complete",
        summary: "Review found no blockers.",
        evidence: ["diff:123"],
        artifacts: [],
        risks: [],
        nextActions: [],
        roleOutput: {
          verdict: "passed",
          findings: [],
        },
      },
    })).toMatchObject({
      valid: true,
      synthesisAllowed: true,
      status: "complete",
    });

    expect(validateSubagentStructuredResult({
      role,
      expectedStatus: "complete",
      structuredResult: {
        schemaVersion: "ambient-subagent-structured-result-v1",
        roleId: "reviewer",
        status: "complete",
        summary: "Review text without verdict.",
        evidence: [],
        artifacts: [],
        risks: [],
        nextActions: [],
        roleOutput: {
          findings: [],
        },
      },
    })).toMatchObject({
      valid: false,
      synthesisAllowed: false,
      reason: `Reviewer structured output requires verdict ${REVIEWER_VERDICT_HELP}.`,
    });

    expect(validateSubagentStructuredResult({
      role,
      expectedStatus: "complete",
      structuredResult: {
        schemaVersion: "ambient-subagent-structured-result-v1",
        roleId: "reviewer",
        status: "complete",
        summary: "Review picked a winner but omitted reviewer findings.",
        evidence: [],
        artifacts: [],
        risks: [],
        nextActions: [],
        roleOutput: {
          verdict: "winner_selected",
          winner: "C",
          ranking: ["C", "B", "A"],
        },
      },
    })).toMatchObject({
      valid: false,
      synthesisAllowed: false,
      reason: `Reviewer structured output requires ${REVIEWER_FINDINGS_HELP}`,
    });
  });

  it("accepts common reviewer verdict aliases from PASS/NEEDS REVISION task prompts", () => {
    const role = getDefaultSubagentRoleProfile("reviewer");

    for (const verdict of ["approved", "approve", "GO", "no go", "no-go", "pass", "needs revision", "winner_selected", "ranked", "recommended"]) {
      expect(validateSubagentStructuredResult({
        role,
        expectedStatus: "complete",
        structuredResult: {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "reviewer",
          status: "complete",
          summary: "Review completed.",
          evidence: ["criteria checked"],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            verdict,
            findings: [],
          },
        },
      })).toMatchObject({
        valid: true,
        synthesisAllowed: true,
        status: "complete",
      });
    }
  });

  it("validates non-mutating drafter structured output separately from worker mutation evidence", () => {
    const role = getDefaultSubagentRoleProfile("drafter");

    expect(validateSubagentStructuredResult({
      role,
      expectedStatus: "complete",
      structuredResult: {
        schemaVersion: "ambient-subagent-structured-result-v1",
        roleId: "drafter",
        status: "complete",
        summary: "Drafted the customer announcement.",
        evidence: ["requirements"],
        artifacts: [],
        risks: [],
        nextActions: [],
        roleOutput: {
          draft: "Subject: Upcoming change to workspace notifications.",
          constraintsChecked: ["July 8 retained"],
          rationale: ["Removed hype."],
        },
      },
    })).toMatchObject({
      valid: true,
      synthesisAllowed: true,
      status: "complete",
    });

    expect(validateSubagentStructuredResult({
      role,
      expectedStatus: "complete",
      structuredResult: {
        schemaVersion: "ambient-subagent-structured-result-v1",
        roleId: "drafter",
        status: "complete",
        summary: "Drafted the customer announcement.",
        evidence: ["requirements"],
        artifacts: [],
        risks: [],
        nextActions: [],
        roleOutput: {
          draft: "Subject: Upcoming change to workspace notifications.",
          constraintsChecked: "July 8 retained.",
          rationale: "Removed hype.",
        },
      },
    })).toMatchObject({
      valid: true,
      synthesisAllowed: true,
      status: "complete",
    });

    expect(validateSubagentStructuredResult({
      role,
      expectedStatus: "complete",
      structuredResult: {
        schemaVersion: "ambient-subagent-structured-result-v1",
        roleId: "drafter",
        status: "complete",
        summary: "No draft.",
        evidence: [],
        artifacts: [],
        risks: [],
        nextActions: [],
        roleOutput: {
          constraintsChecked: [],
        },
      },
    })).toMatchObject({
      valid: false,
      synthesisAllowed: false,
      reason: "Drafter structured output requires a non-empty draft.",
    });
  });

  it("blocks prose-only completed artifacts for structured-output roles", () => {
    const role = getDefaultSubagentRoleProfile("summarizer");

    expect(validateSubagentStructuredResultArtifactForRole({
      role,
      artifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: "run-1",
        status: "completed",
        partial: false,
        summary: "Summary prose only.",
        childThreadId: "child-1",
      },
    })).toMatchObject({
      valid: false,
      synthesisAllowed: false,
      reason: "Structured sub-agent result JSON is missing or not an object.",
    });
  });
});
