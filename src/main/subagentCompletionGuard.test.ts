import { describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL, createAmbientModelRuntimeSnapshot } from "../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../shared/featureFlags";
import { getDefaultSubagentRoleProfile } from "../shared/subagentRoles";
import type { SubagentRunEventSummary, SubagentRunSummary } from "../shared/types";
import { validateSubagentCompletionGuard } from "./subagentCompletionGuard";
import { subagentStructuredResultTemplate } from "./subagentStructuredOutput";

describe("subagentCompletionGuard", () => {
  it("does not require mutation evidence for read-only roles", () => {
    expect(validateSubagentCompletionGuard({
      role: getDefaultSubagentRoleProfile("reviewer"),
      run: run({ roleId: "reviewer" }),
      events: [],
    })).toMatchObject({
      valid: true,
      synthesisAllowed: true,
      required: false,
    });
  });

  it("rejects implementation completion without Ambient-recorded mutation evidence", () => {
    expect(validateSubagentCompletionGuard({
      role: getDefaultSubagentRoleProfile("worker"),
      run: run({
        roleId: "worker",
        resultArtifact: resultArtifact({
          mutationEvidence: [{ toolCallId: "tool-call-1", path: "src/app.ts", category: "workspace.write" }],
        }),
      }),
      events: [],
    })).toMatchObject({
      valid: false,
      synthesisAllowed: false,
      required: true,
      structuredEvidenceCount: 1,
      ambientEvidenceCount: 0,
      reason: "Implementation roles require Ambient-recorded mutation evidence before completed synthesis.",
    });
  });

  it("accepts implementation completion when structured evidence matches an Ambient mutation event", () => {
    expect(validateSubagentCompletionGuard({
      role: getDefaultSubagentRoleProfile("worker"),
      run: run({
        roleId: "worker",
        resultArtifact: resultArtifact({
          mutationEvidence: [{ toolCallId: "tool-call-1", path: "src/app.ts", category: "workspace.write" }],
        }),
      }),
      events: [
        event({
          type: "subagent.runtime_event",
          preview: {
            schemaVersion: "ambient-subagent-runtime-event-v1",
            type: "tool_result",
            toolName: "write",
            details: {
              toolCallId: "tool-call-1",
              category: "workspace.write",
              path: "src/app.ts",
              worktreeIsolated: true,
              worktreePath: "/repo/.ambient-codex/worktrees/child-thread",
              approvalId: "approval-1",
              approvalSource: "permission_grant",
            },
          },
        }),
      ],
    })).toMatchObject({
      valid: true,
      synthesisAllowed: true,
      required: true,
      structuredEvidenceCount: 1,
      ambientEvidenceCount: 1,
      isolatedWorktreeEvidenceCount: 1,
      approvalEvidenceCount: 1,
    });
  });

  it("rejects category-only forged mutation evidence without a specific Ambient match", () => {
    expect(validateSubagentCompletionGuard({
      role: getDefaultSubagentRoleProfile("worker"),
      run: run({
        roleId: "worker",
        resultArtifact: resultArtifact({
          mutationEvidence: [{ category: "workspace.write" }],
        }),
      }),
      events: [
        event({
          preview: {
            schemaVersion: "ambient-subagent-runtime-event-v1",
            type: "tool_result",
            toolName: "write",
            details: {
              toolCallId: "unrelated-tool-call",
              category: "workspace.write",
              path: "src/other.ts",
              worktreeIsolated: true,
              worktreePath: "/repo/.ambient-codex/worktrees/child-thread",
              approvalId: "approval-1",
            },
          },
        }),
      ],
    })).toMatchObject({
      valid: false,
      synthesisAllowed: false,
      required: true,
      structuredEvidenceCount: 1,
      ambientEvidenceCount: 1,
      reason: "Implementation structured mutation evidence must match an Ambient-recorded mutation event.",
    });
  });

  it("rejects mismatched child-run mutation evidence even when tool ids match", () => {
    expect(validateSubagentCompletionGuard({
      role: getDefaultSubagentRoleProfile("worker"),
      run: run({
        roleId: "worker",
        resultArtifact: resultArtifact({
          mutationEvidence: [{
            childRunId: "worker-run",
            toolCallId: "tool-call-1",
            path: "src/app.ts",
            category: "workspace.write",
          }],
        }),
      }),
      events: [
        event({
          preview: {
            schemaVersion: "ambient-subagent-runtime-event-v1",
            type: "tool_result",
            toolName: "write",
            details: {
              childRunId: "other-worker-run",
              toolCallId: "tool-call-1",
              category: "workspace.write",
              path: "src/app.ts",
              worktreeIsolated: true,
              worktreePath: "/repo/.ambient-codex/worktrees/child-thread",
              approvalId: "approval-1",
            },
          },
        }),
      ],
    })).toMatchObject({
      valid: false,
      synthesisAllowed: false,
      required: true,
      structuredEvidenceCount: 1,
      ambientEvidenceCount: 1,
      reason: "Implementation structured mutation evidence must match an Ambient-recorded mutation event.",
    });
  });

  it("rejects worker mutation evidence without isolated worktree provenance", () => {
    expect(validateSubagentCompletionGuard({
      role: getDefaultSubagentRoleProfile("worker"),
      run: run({
        roleId: "worker",
        resultArtifact: resultArtifact({
          mutationEvidence: [{ toolCallId: "tool-call-1", path: "src/app.ts", category: "workspace.write" }],
        }),
      }),
      events: [
        event({
          preview: {
            schemaVersion: "ambient-subagent-runtime-event-v1",
            type: "tool_result",
            toolName: "write",
            details: {
              toolCallId: "tool-call-1",
              category: "workspace.write",
              path: "src/app.ts",
            },
          },
        }),
      ],
    })).toMatchObject({
      valid: false,
      synthesisAllowed: false,
      required: true,
      structuredEvidenceCount: 1,
      ambientEvidenceCount: 1,
      isolatedWorktreeEvidenceCount: 0,
      approvalEvidenceCount: 0,
      reason: "Implementation roles that mutate require Ambient-recorded isolated worktree and approval provenance before completed synthesis.",
    });
  });

  it("rejects isolated worker mutation evidence without approval provenance", () => {
    expect(validateSubagentCompletionGuard({
      role: getDefaultSubagentRoleProfile("worker"),
      run: run({
        roleId: "worker",
        resultArtifact: resultArtifact({
          mutationEvidence: [{ toolCallId: "tool-call-1", path: "src/app.ts", category: "workspace.write" }],
        }),
      }),
      events: [
        event({
          preview: {
            schemaVersion: "ambient-subagent-runtime-event-v1",
            type: "tool_result",
            toolName: "write",
            details: {
              toolCallId: "tool-call-1",
              category: "workspace.write",
              path: "src/app.ts",
              worktreeIsolated: true,
              worktreePath: "/repo/.ambient-codex/worktrees/child-thread",
            },
          },
        }),
      ],
    })).toMatchObject({
      valid: false,
      synthesisAllowed: false,
      required: true,
      structuredEvidenceCount: 1,
      ambientEvidenceCount: 1,
      isolatedWorktreeEvidenceCount: 1,
      approvalEvidenceCount: 0,
      reason: "Implementation roles that mutate require Ambient-recorded isolated worktree and approval provenance before completed synthesis.",
    });
  });

  it("rejects isolated worker mutation evidence with an untyped approval id", () => {
    expect(validateSubagentCompletionGuard({
      role: getDefaultSubagentRoleProfile("worker"),
      run: run({
        roleId: "worker",
        resultArtifact: resultArtifact({
          mutationEvidence: [{ toolCallId: "tool-call-1", path: "src/app.ts", category: "workspace.write" }],
        }),
      }),
      events: [
        event({
          preview: {
            schemaVersion: "ambient-subagent-runtime-event-v1",
            type: "tool_result",
            toolName: "write",
            details: {
              toolCallId: "tool-call-1",
              category: "workspace.write",
              path: "src/app.ts",
              worktreeIsolated: true,
              worktreePath: "/repo/.ambient-codex/worktrees/child-thread",
              approvalId: "untyped-approval",
            },
          },
        }),
      ],
    })).toMatchObject({
      valid: false,
      synthesisAllowed: false,
      required: true,
      structuredEvidenceCount: 1,
      ambientEvidenceCount: 1,
      isolatedWorktreeEvidenceCount: 1,
      approvalEvidenceCount: 0,
      reason: "Implementation roles that mutate require Ambient-recorded isolated worktree and approval provenance before completed synthesis.",
    });
  });

  it("accepts isolated worker mutation evidence with inferred permission-grant provenance", () => {
    expect(validateSubagentCompletionGuard({
      role: getDefaultSubagentRoleProfile("worker"),
      run: run({
        roleId: "worker",
        resultArtifact: resultArtifact({
          mutationEvidence: [{ toolCallId: "tool-call-1", path: "src/app.ts", category: "workspace.write" }],
        }),
      }),
      events: [
        event({
          preview: {
            schemaVersion: "ambient-subagent-runtime-event-v1",
            type: "tool_result",
            toolName: "write",
            details: {
              toolCallId: "tool-call-1",
              category: "workspace.write",
              path: "src/app.ts",
              worktreeIsolated: true,
              worktreePath: "/repo/.ambient-codex/worktrees/child-thread",
              approvalGrantId: "grant-1",
            },
          },
        }),
      ],
    })).toMatchObject({
      valid: true,
      synthesisAllowed: true,
      required: true,
      structuredEvidenceCount: 1,
      ambientEvidenceCount: 1,
      isolatedWorktreeEvidenceCount: 1,
      approvalEvidenceCount: 1,
    });
  });
});

function run(overrides: Partial<SubagentRunSummary> = {}): SubagentRunSummary {
  return {
    id: "worker-run",
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: "child-thread",
    canonicalTaskPath: "root/0:worker",
    roleId: "worker",
    dependencyMode: "required",
    status: "completed",
    featureFlagSnapshot: resolveAmbientFeatureFlags({ startup: { enabled: ["ambient.subagents"], disabled: [] } }),
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(AMBIENT_DEFAULT_MODEL),
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    completedAt: "2026-06-05T00:00:10.000Z",
    resultArtifact: resultArtifact({
      mutationEvidence: [{ toolCallId: "tool-call-1", category: "workspace.write" }],
    }),
    ...overrides,
  } as SubagentRunSummary;
}

function resultArtifact(input: { mutationEvidence: unknown[] }) {
  const structuredOutput = {
    ...subagentStructuredResultTemplate({ id: "worker" }),
    summary: "Changed src/app.ts and ran tests.",
    roleOutput: {
      changes: ["src/app.ts"],
      validation: ["pnpm test"],
      mutationEvidence: input.mutationEvidence,
    },
  };
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId: "worker-run",
    status: "completed",
    partial: false,
    summary: "Changed src/app.ts and ran tests.",
    childThreadId: "child-thread",
    structuredOutput,
  };
}

function event(overrides: Partial<SubagentRunEventSummary>): SubagentRunEventSummary {
  return {
    runId: "worker-run",
    sequence: 1,
    type: "subagent.runtime_event",
    createdAt: "2026-06-05T00:00:05.000Z",
    ...overrides,
  };
}
