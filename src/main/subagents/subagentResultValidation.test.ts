import { describe, expect, it } from "vitest";

import {
  AMBIENT_DEFAULT_MODEL,
  createAmbientModelRuntimeSnapshot,
  resolveAmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import { resolveSubagentCapacityLease } from "../../shared/subagentCapacity";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { SubagentRunEventSummary, SubagentRunSummary } from "../../shared/types";
import { getDefaultSubagentRoleProfile, type SubagentRoleId } from "../../shared/subagentRoles";
import {
  subagentStructuredResultTemplate,
  type SubagentStructuredResult,
} from "./subagentStructuredOutput";
import {
  SUBAGENT_RESULT_VALIDATION_SCHEMA_VERSION,
  validateSubagentResultForRun,
} from "./subagentResultValidation";

describe("subagentResultValidation", () => {
  it("blocks failed child artifacts from parent synthesis", () => {
    const validation = validateSubagentResultForRun(
      run({
        roleId: "explorer",
        status: "failed",
        resultArtifact: resultArtifact({
          status: "failed",
          partial: false,
          summary: "Sub-agent launch failed before model execution: capacity unavailable.",
        }),
      }),
      [],
    );

    expect(SUBAGENT_RESULT_VALIDATION_SCHEMA_VERSION).toBe("ambient-subagent-result-validation-v1");
    expect(validation).toMatchObject({
      valid: true,
      synthesisAllowed: false,
      partial: false,
      reason: "Result artifact status is not safe for parent synthesis.",
      artifactValidation: expect.objectContaining({
        status: "failed",
        synthesisAllowed: false,
      }),
      structuredOutputValidation: expect.objectContaining({
        required: true,
        synthesisAllowed: false,
      }),
      completionGuardValidation: expect.objectContaining({
        required: false,
        synthesisAllowed: true,
      }),
    });
  });

  it("blocks completed implementation results without matching Ambient mutation evidence", () => {
    const validation = validateSubagentResultForRun(
      run({
        roleId: "worker",
        status: "completed",
        resultArtifact: resultArtifact({
          status: "completed",
          partial: false,
          summary: "Changed src/app.ts.",
          structuredOutput: structuredWorkerResult(),
        }),
      }),
      [],
    );

    expect(validation).toMatchObject({
      valid: false,
      synthesisAllowed: false,
      reason: "Implementation roles require Ambient-recorded mutation evidence before completed synthesis.",
      structuredOutputValidation: {
        valid: true,
        synthesisAllowed: true,
        required: true,
        status: "complete",
        structuredResult: {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "worker",
          status: "complete",
          summary: "Changed src/app.ts.",
          evidenceCount: 1,
          artifactCount: 1,
          riskCount: 0,
          nextActionCount: 0,
        },
      },
      completionGuardValidation: {
        valid: false,
        synthesisAllowed: false,
        required: true,
        structuredEvidenceCount: 1,
        ambientEvidenceCount: 0,
        isolatedWorktreeEvidenceCount: 0,
        approvalEvidenceCount: 0,
      },
    });
  });

  it("allows completed implementation results when structured evidence matches Ambient events", () => {
    const validation = validateSubagentResultForRun(
      run({
        roleId: "worker",
        status: "completed",
        resultArtifact: resultArtifact({
          status: "completed",
          partial: false,
          summary: "Changed src/app.ts.",
          structuredOutput: structuredWorkerResult(),
        }),
      }),
      [
        event({
          preview: {
            schemaVersion: "ambient-subagent-runtime-event-v1",
            type: "tool_result",
            toolName: "write",
            details: {
              childRunId: "worker-run",
              toolCallId: "tool-call-1",
              category: "workspace.write",
              path: "src/app.ts",
              worktreeIsolated: true,
              worktreePath: "/repo/.ambient-codex/worktrees/worker-child",
              approvalId: "approval-1",
              approvalSource: "permission_grant",
            },
          },
        }),
      ],
    );

    expect(validation).toMatchObject({
      valid: true,
      synthesisAllowed: true,
      status: "completed",
      artifactValidation: expect.objectContaining({
        synthesisAllowed: true,
      }),
      structuredOutputValidation: expect.objectContaining({
        valid: true,
        synthesisAllowed: true,
      }),
      completionGuardValidation: expect.objectContaining({
        valid: true,
        synthesisAllowed: true,
        structuredEvidenceCount: 1,
        ambientEvidenceCount: 1,
        isolatedWorktreeEvidenceCount: 1,
        approvalEvidenceCount: 1,
      }),
    });
    expect(validation.reason).toBeUndefined();
  });
});

function run(input: {
  roleId: SubagentRoleId;
  status: SubagentRunSummary["status"];
  resultArtifact: unknown;
}): SubagentRunSummary {
  const role = getDefaultSubagentRoleProfile(input.roleId);
  const model = resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL);
  return {
    id: input.roleId === "worker" ? "worker-run" : "child-run",
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "assistant-message",
    childThreadId: input.roleId === "worker" ? "worker-child" : "child-thread",
    canonicalTaskPath: `root/0:${input.roleId}`,
    roleId: input.roleId,
    roleProfileSnapshot: role,
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: input.status,
    featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(AMBIENT_DEFAULT_MODEL, "2026-06-06T00:00:00.000Z"),
    capacityLeaseSnapshot: resolveSubagentCapacityLease({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: `root/0:${input.roleId}`,
      roleId: input.roleId,
      model,
      now: "2026-06-06T00:00:00.000Z",
    }),
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    ...(input.resultArtifact ? { resultArtifact: input.resultArtifact } : {}),
  };
}

function resultArtifact(input: {
  status: "completed" | "failed";
  partial: boolean;
  summary: string;
  structuredOutput?: unknown;
}): Record<string, unknown> {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId: input.status === "completed" ? "worker-run" : "child-run",
    status: input.status,
    partial: input.partial,
    summary: input.summary,
    childThreadId: input.status === "completed" ? "worker-child" : "child-thread",
    ...(input.structuredOutput ? { structuredOutput: input.structuredOutput } : {}),
  };
}

function structuredWorkerResult(): SubagentStructuredResult {
  return {
    ...subagentStructuredResultTemplate(getDefaultSubagentRoleProfile("worker")),
    roleId: "worker",
    status: "complete",
    summary: "Changed src/app.ts.",
    evidence: ["src/app.ts"],
    artifacts: ["test-results/worker.json"],
    risks: [],
    nextActions: [],
    roleOutput: {
      changes: ["Updated src/app.ts"],
      validation: ["pnpm test"],
      mutationEvidence: [
        {
          childRunId: "worker-run",
          toolCallId: "tool-call-1",
          path: "src/app.ts",
          category: "workspace.write",
        },
      ],
    },
  };
}

function event(input: { preview: unknown }): SubagentRunEventSummary {
  return {
    runId: "worker-run",
    sequence: 1,
    type: "subagent.runtime_event",
    createdAt: "2026-06-06T00:00:00.000Z",
    preview: input.preview,
  };
}
