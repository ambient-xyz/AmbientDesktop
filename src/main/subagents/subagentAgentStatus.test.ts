import { describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL, createAmbientModelRuntimeSnapshot, resolveAmbientModelRuntimeProfile } from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { resolveSubagentCapacityLease } from "../../shared/subagentCapacity";
import { effectiveSubagentRoleSnapshot } from "../../shared/subagentPatternGraph";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import type { SubagentMailboxEventSummary, SubagentRunEventSummary, SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/types";
import {
  buildSubagentListAgentsText,
  buildSubagentStatusText,
  compactSubagentCapacityLeaseForPi,
  compactSubagentRunForPi,
  SUBAGENT_AGENT_STATUS_SCHEMA_VERSION,
} from "./subagentAgentStatus";

describe("subagentAgentStatus", () => {
  it("compacts child runs with resolved role and capacity snapshots for Pi discovery", () => {
    const child = run({
      id: "child-a",
      canonicalTaskPath: "root/0:reviewer",
      roleId: "reviewer",
      status: "running",
      startedAt: "2026-06-06T12:01:00.000Z",
    });
    child.effectiveRoleSnapshot = effectiveSubagentRoleSnapshot({
      baseRole: "reviewer",
      patternRole: "verifier",
      overlayLabels: ["Acceptance checks", "No mutation"],
      outputContract: "Return pass/fail findings with evidence.",
    });

    expect(compactSubagentRunForPi(child)).toMatchObject({
      schemaVersion: SUBAGENT_AGENT_STATUS_SCHEMA_VERSION,
      id: "child-a",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childThreadId: "child-thread",
      canonicalTaskPath: "root/0:reviewer",
      roleId: "reviewer",
      roleLabel: "Reviewer",
      roleProfileSnapshotSource: "resolved",
      effectiveRole: {
        schemaVersion: "ambient-subagent-effective-role-v1",
        baseRole: "reviewer",
        patternRole: "verifier",
        displayLabel: "Reviewer + Verifier",
        roleOverlayIds: ["verifier.acceptance-checks", "verifier.no-mutation"],
        overlayLabels: ["Acceptance checks", "No mutation"],
        nonWidening: true,
        outputContract: "Return pass/fail findings with evidence.",
      },
      schedulingPolicy: "live_parent_only",
      dependencyMode: "required",
      status: "running",
      capacityLease: {
        schemaVersion: "ambient-subagent-capacity-lease-v1",
        status: "reserved",
        canonicalTaskPath: "root/0:reviewer",
        roleId: "reviewer",
        provider: expect.objectContaining({
          providerId: "ambient",
          modelId: AMBIENT_DEFAULT_MODEL,
          profile: expect.objectContaining({
            profileId: `ambient:${AMBIENT_DEFAULT_MODEL}`,
            supportsStreaming: true,
            toolUse: "ambient-tools",
            structuredOutput: "schema",
          }),
          allowed: true,
        }),
        blockingReasons: [],
      },
      turnBudgetPolicy: {
        schemaVersion: "ambient-subagent-turn-budget-policy-v1",
        roleId: "reviewer",
        maxTurns: 6,
        wrapUpAtTurn: 5,
        graceTurns: 1,
        terminalStatusOnExhaustion: "failed",
        partialAllowed: false,
        transcriptRetained: true,
      },
      createdAt: "2026-06-06T12:00:00.000Z",
      updatedAt: "2026-06-06T12:00:00.000Z",
      startedAt: "2026-06-06T12:01:00.000Z",
    });
  });

  it("compacts capacity leases without dropping depth, provider, memory, or release state", () => {
    const lease = resolveSubagentCapacityLease({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: "root/0:explorer",
      roleId: "explorer",
      model: resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL),
      now: "2026-06-06T12:00:00.000Z",
      providerConcurrencyLimit: 1,
    });

    expect(compactSubagentCapacityLeaseForPi({
      ...lease,
      status: "released",
      releasedAt: "2026-06-06T12:02:00.000Z",
    })).toEqual({
      schemaVersion: "ambient-subagent-capacity-lease-v1",
      leaseId: lease.leaseId,
      status: "released",
      canonicalTaskPath: "root/0:explorer",
      roleId: "explorer",
      provider: {
        providerId: "ambient",
        modelId: AMBIENT_DEFAULT_MODEL,
        locality: "cloud",
        profile: lease.provider.profile,
        openRunCount: 0,
        projectedOpenRunCount: 1,
        concurrencyLimit: 1,
        allowed: true,
        reason: "Projected provider sub-agent count 1 is within the configured limit 1.",
      },
      depth: lease.depth,
      localMemory: lease.localMemory,
      blockingReasons: [],
      releasedAt: "2026-06-06T12:02:00.000Z",
    });
  });

  it("lists child runs with canonical paths and close state", () => {
    expect(buildSubagentListAgentsText([])).toBe("No sub-agent runs exist for this parent thread.");
    expect(buildSubagentListAgentsText([
      run({ id: "child-a", canonicalTaskPath: "root/0:explorer", status: "running" }),
      run({
        id: "child-b",
        childThreadId: "child-thread-b",
        canonicalTaskPath: "root/1:reviewer",
        status: "completed",
        closedAt: "2026-06-06T12:05:00.000Z",
      }),
    ])).toBe([
      "Sub-agent runs (2):",
      "- root/0:explorer: running childRunId=child-a childThreadId=child-thread",
      "- root/1:reviewer: completed childRunId=child-b childThreadId=child-thread-b closed=true",
    ].join("\n"));
  });

  it("builds status text with event counts and parent synthesis state", () => {
    const child = run({
      id: "child-a",
      canonicalTaskPath: "root/0:summarizer",
      status: "needs_attention",
      closedAt: "2026-06-06T12:07:00.000Z",
    });

    expect(buildSubagentStatusText({
      run: child,
      events: [runEvent({ sequence: 1 }), runEvent({ sequence: 2, type: "subagent.runtime_event" })],
      mailboxEvents: [mailboxEvent({ id: "mailbox-a" })],
      notice: "wait_agent timed out before the child reached a terminal status.",
      turnBudgetState: {
        state: "wrap_up_due",
        observedTurnCount: 7,
        remainingTurns: 1,
        shouldSteerWrapUp: true,
        exhausted: false,
        instruction: "Child is at its wrap-up turn.",
      },
      parentResolution: {
        action: "ask_user",
        canSynthesize: false,
        instruction: "Ask the user whether to continue with partial output.",
      },
    })).toBe([
      "Sub-agent root/0:summarizer",
      "childRunId: child-a",
      "childThreadId: child-thread",
      "status: needs_attention",
      "closedAt: 2026-06-06T12:07:00.000Z",
      "events: 2",
      "mailboxEvents: 1",
      "turnBudget: wrap_up_due observed=7 remaining=1",
      "turnBudgetAction: steer_wrap_up",
      "turnBudgetInstruction: Child is at its wrap-up turn.",
      "wait_agent timed out before the child reached a terminal status.",
      "parentAction: ask_user",
      "canSynthesize: false",
      "parentInstruction: Ask the user whether to continue with partial output.",
    ].join("\n"));
  });

  it("includes every aggregate wait child result in Pi-visible status text", () => {
    const fieldNotes = completedExplorerRun({
      id: "field-notes",
      childThreadId: "thread-field",
      canonicalTaskPath: "root/0:explorer",
      file: "docs/field-notes.md",
      findings: [
        "Project owner: Priya Shah.",
        "Budget: $42,000.",
      ],
    });
    const vendorMemo = completedExplorerRun({
      id: "vendor-memo",
      childThreadId: "thread-vendor",
      canonicalTaskPath: "root/1:explorer",
      file: "docs/vendor-memo.pdf",
      findings: [
        "Project owner: Priya Shah.",
        "Budget: $45,000.",
      ],
    });
    const financeSummary = completedExplorerRun({
      id: "finance-summary",
      childThreadId: "thread-finance",
      canonicalTaskPath: "root/2:explorer",
      file: "docs/finance-summary.docx",
      findings: [
        "Project owner: Marco Lee.",
        "Budget: $42,000.",
      ],
    });

    const text = buildSubagentStatusText({
      run: fieldNotes,
      waitChildRuns: [fieldNotes, vendorMemo, financeSummary],
      events: [],
      mailboxEvents: [],
      waitBarrier: waitBarrier({ id: "barrier-all", status: "satisfied" }),
      parentResolution: {
        action: "synthesize",
        canSynthesize: true,
        instruction: "Synthesize from all waited child results.",
      },
    });

    expect(text).toContain("waitChildResults: 3");
    expect(text).toContain("waitChildResult 1: root/0:explorer childRunId=field-notes childThreadId=thread-field status=completed");
    expect(text).toContain("waitChildResult 2: root/1:explorer childRunId=vendor-memo childThreadId=thread-vendor status=completed");
    expect(text).toContain("waitChildResult 3: root/2:explorer childRunId=finance-summary childThreadId=thread-finance status=completed");
    expect(text).toContain("waitChildResult 2 findingsPreview:");
    expect(text).toContain("Budget: $45,000.");
    expect(text).toContain("waitChildResult 3 findingsPreview:");
    expect(text).toContain("Project owner: Marco Lee.");
  });

  it("tells Pi to resolve failed required barriers before retrying child work", () => {
    const child = run({
      id: "review-child",
      canonicalTaskPath: "root/1:reviewer",
      roleId: "reviewer",
      status: "failed",
    });

    expect(buildSubagentStatusText({
      run: child,
      events: [],
      mailboxEvents: [],
      waitBarrier: waitBarrier({
        id: "barrier-review",
        status: "failed",
        childRunIds: ["review-child"],
      }),
      parentResolution: {
        action: "ask_user",
        canSynthesize: false,
        instruction: "Do not synthesize child work.",
      },
    })).toContain([
      "waitBarrierId: barrier-review",
      "waitBarrierStatus: failed",
      "waitBarrierDependencyMode: required_all",
      "waitBarrierFailurePolicy: ask_user",
      "waitBarrierRecovery: This barrier is terminal. To recover or retry, call ambient_subagent with action resolve_barrier, waitBarrierId barrier-review, and an explicit decision such as retry_child, fail_parent, detach_child, cancel_parent, or continue_with_partial when partial output is allowed. Do not spawn a separate replacement child manually; the original barrier will keep blocking final synthesis until resolve_barrier records the decision.",
      "parentAction: ask_user",
      "canSynthesize: false",
      "parentInstruction: Do not synthesize child work.",
    ].join("\n"));
  });

  it("lists active wait-barrier blockers in status text", () => {
    const child = run({
      id: "child-running-a",
      childThreadId: "child-running-a-thread",
      canonicalTaskPath: "root/1:explorer",
      status: "running",
    });

    expect(buildSubagentStatusText({
      run: child,
      events: [],
      mailboxEvents: [],
      waitBarrier: waitBarrier({
        id: "barrier-travel",
        status: "waiting_on_children",
        childRunIds: ["child-safe", "child-running-a", "child-running-b"],
      }),
      waitBarrierBlockers: [
        {
          childRunId: "child-running-a",
          childThreadId: "child-running-a-thread",
          canonicalTaskPath: "root/1:explorer",
          status: "running",
          blockingState: "active",
          lastActivityAt: "2026-06-06T00:00:05.000Z",
          lastActivitySource: "run_event:subagent.runtime_event",
        },
        {
          childRunId: "child-running-b",
          childThreadId: "child-running-b-thread",
          canonicalTaskPath: "root/2:explorer",
          status: "running",
          blockingState: "active",
          lastActivityAt: "2026-06-06T00:00:07.000Z",
          lastActivitySource: "run_event:subagent.runtime_event",
          reason: "Child is still working.",
        },
      ],
      parentResolution: {
        action: "wait_for_child",
        canSynthesize: false,
        instruction: "Do not synthesize child work.",
      },
    })).toContain([
      "waitBarrierBlockers: 2",
      "waitBarrierBlocker: root/1:explorer childRunId=child-running-a childThreadId=child-running-a-thread status=running state=active lastActivityAt=2026-06-06T00:00:05.000Z lastActivitySource=run_event:subagent.runtime_event",
      "waitBarrierBlocker: root/2:explorer childRunId=child-running-b childThreadId=child-running-b-thread status=running state=active lastActivityAt=2026-06-06T00:00:07.000Z lastActivitySource=run_event:subagent.runtime_event reason=Child is still working.",
    ].join("\n"));
  });

  it("includes bounded child result previews in status text for parent synthesis", () => {
    const child = run({
      id: "draft-child",
      canonicalTaskPath: "root/0:drafter",
      roleId: "drafter",
      status: "completed",
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: "draft-child",
        status: "completed",
        partial: false,
        summary: "Drafted a calmer customer announcement.",
        childThreadId: "child-thread",
        explicitStatus: "complete",
        structuredOutput: {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "drafter",
          status: "complete",
          summary: "Drafted a calmer customer announcement.",
          evidence: ["source prompt"],
          artifacts: [],
          risks: ["Avoid implying account access changes before July 8."],
          nextActions: ["Use the revised announcement in the parent final answer."],
          roleOutput: {
            draft: "Starting July 8, 2026, all workspace notifications will move to the new Notifications Center.",
            constraintsChecked: "July 8 retained; No action required retained",
            rationale: "Removed hype",
          },
        },
      },
    });

    expect(buildSubagentStatusText({
      run: child,
      events: [],
      mailboxEvents: [],
      parentResolution: {
        action: "synthesize",
        canSynthesize: true,
        instruction: "You may synthesize from this child result with provenance.",
      },
    })).toContain([
      "resultStatus: completed partial=false",
      "resultSummaryPreview: Drafted a calmer customer announcement.",
      "resultExplicitStatus: complete",
      "structuredStatus: complete",
      "structuredEvidence: source prompt",
      "structuredRisks: Avoid implying account access changes before July 8.",
      "structuredNextActions: Use the revised announcement in the parent final answer.",
      "draftPreview: Starting July 8, 2026, all workspace notifications will move to the new Notifications Center.",
      "constraintsChecked: July 8 retained; No action required retained",
      "draftRationale: Removed hype",
    ].join("\n"));
  });

  it("hides unsafe child result previews until the barrier is resolved", () => {
    const child = run({
      id: "feedback-child",
      canonicalTaskPath: "root/2:reviewer",
      roleId: "reviewer",
      status: "failed",
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: "feedback-child",
        status: "failed",
        partial: false,
        summary: "Tempting but invalid feedback idea from a failed child.",
        childThreadId: "child-thread",
        structuredOutput: {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "reviewer",
          status: "complete",
          summary: "Use this unsafe feedback.",
          evidence: [],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            verdict: "revise",
            recommendation: "Use the failed output anyway.",
          },
        },
      },
    });

    const text = buildSubagentStatusText({
      run: child,
      events: [],
      mailboxEvents: [],
      waitBarrier: waitBarrier({
        id: "barrier-feedback",
        status: "failed",
        childRunIds: ["feedback-child"],
      }),
      parentResolution: {
        action: "ask_user",
        canSynthesize: false,
        instruction: "Do not synthesize child work.",
      },
    });

    expect(text).toContain("resultPreviewBlocked: child result is not synthesis-safe");
    expect(text).toContain("resultStatus: failed partial=false");
    expect(text).not.toContain("Tempting but invalid feedback idea");
    expect(text).not.toContain("reviewOutputPreview");
    expect(text).toContain("waitBarrierRecovery: This barrier is terminal. To recover or retry, call ambient_subagent with action resolve_barrier");
  });
});

function run(overrides: {
  id?: string;
  childThreadId?: string;
  canonicalTaskPath?: string;
  roleId?: "explorer" | "drafter" | "reviewer" | "summarizer" | "worker";
  status?: SubagentRunSummary["status"];
  startedAt?: string;
  completedAt?: string;
  closedAt?: string;
  resultArtifact?: unknown;
} = {}): SubagentRunSummary {
  const id = overrides.id ?? "child-run";
  const roleId = overrides.roleId ?? roleIdFromPath(overrides.canonicalTaskPath) ?? "explorer";
  const canonicalTaskPath = overrides.canonicalTaskPath ?? `root/${id}:${roleId}`;
  return {
    id,
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: overrides.childThreadId ?? "child-thread",
    canonicalTaskPath,
    roleId,
    roleProfileSnapshot: getDefaultSubagentRoleProfile(roleId),
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: overrides.status ?? "reserved",
    featureFlagSnapshot: resolveAmbientFeatureFlags({
      generatedAt: "2026-06-06T12:00:00.000Z",
    }),
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(AMBIENT_DEFAULT_MODEL, "2026-06-06T12:00:00.000Z"),
    capacityLeaseSnapshot: resolveSubagentCapacityLease({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath,
      roleId,
      model: resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL),
      now: "2026-06-06T12:00:00.000Z",
    }),
    createdAt: "2026-06-06T12:00:00.000Z",
    updatedAt: "2026-06-06T12:00:00.000Z",
    ...(overrides.startedAt ? { startedAt: overrides.startedAt } : {}),
    ...(overrides.completedAt ? { completedAt: overrides.completedAt } : {}),
    ...(overrides.closedAt ? { closedAt: overrides.closedAt } : {}),
    ...(overrides.resultArtifact !== undefined ? { resultArtifact: overrides.resultArtifact } : {}),
  };
}

function completedExplorerRun(input: {
  id: string;
  childThreadId: string;
  canonicalTaskPath: string;
  file: string;
  findings: string[];
}): SubagentRunSummary {
  return run({
    id: input.id,
    childThreadId: input.childThreadId,
    canonicalTaskPath: input.canonicalTaskPath,
    roleId: "explorer",
    status: "completed",
    completedAt: "2026-06-06T12:03:00.000Z",
    resultArtifact: {
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: input.id,
      status: "completed",
      partial: false,
      summary: `Extracted fields from ${input.file}.`,
      childThreadId: input.childThreadId,
      structuredOutput: {
        schemaVersion: "ambient-subagent-structured-result-v1",
        roleId: "explorer",
        status: "complete",
        summary: `Extracted fields from ${input.file}.`,
        evidence: [`Read ${input.file}.`],
        artifacts: [],
        risks: [],
        nextActions: [],
        roleOutput: {
          findings: input.findings.map((summary) => ({
            summary,
            provenance: [input.file],
          })),
          openQuestions: [],
        },
      },
    },
  });
}

function waitBarrier(overrides: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-a"],
    dependencyMode: "required_all",
    quorumThreshold: undefined,
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    timeoutMs: 480_000,
    createdAt: "2026-06-06T12:00:00.000Z",
    updatedAt: "2026-06-06T12:00:00.000Z",
    resolvedAt: undefined,
    resolutionArtifact: undefined,
    ...overrides,
  };
}

function roleIdFromPath(path: string | undefined): "explorer" | "drafter" | "reviewer" | "summarizer" | undefined {
  if (path?.endsWith(":drafter")) return "drafter";
  if (path?.endsWith(":reviewer")) return "reviewer";
  if (path?.endsWith(":summarizer")) return "summarizer";
  if (path?.endsWith(":explorer")) return "explorer";
  return undefined;
}

function runEvent(overrides: Partial<SubagentRunEventSummary> = {}): SubagentRunEventSummary {
  return {
    runId: "child-a",
    sequence: 1,
    type: "subagent.lifecycle_started",
    createdAt: "2026-06-06T12:01:00.000Z",
    ...overrides,
  };
}

function mailboxEvent(overrides: Partial<SubagentMailboxEventSummary> = {}): SubagentMailboxEventSummary {
  return {
    id: "mailbox",
    runId: "child-a",
    direction: "child_to_parent",
    type: "subagent.wait_completion",
    payload: {},
    deliveryState: "delivered",
    createdAt: "2026-06-06T12:02:00.000Z",
    deliveredAt: "2026-06-06T12:02:00.000Z",
    ...overrides,
  };
}
