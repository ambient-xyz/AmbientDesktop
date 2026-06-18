import { describe, expect, it } from "vitest";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type {
  SubagentPromptSnapshotSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentSpawnEdgeSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { fallbackSubagentCapacityLease, materializeSubagentCapacityLeaseForRun } from "../../shared/subagentCapacity";
import type { SubagentResultArtifact } from "../../shared/subagentProtocol";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import {
  subagentReplayEvidence,
  subagentRestartReplayFixture,
  writeSubagentReplayEvidenceArtifact,
} from "../../test/subagentFixtures";
import {
  analyzeSubagentRestartState,
  createSubagentRepairDiagnosticsReport,
  interruptedSubagentResultArtifact,
  uniqueSubagentRepairIds,
} from "./subagentRepair";

const featureFlags = resolveAmbientFeatureFlags({
  startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
  generatedAt: "2026-06-05T00:00:00.000Z",
});

function repairArtifact(runId: string, status: SubagentResultArtifact["status"], childThreadId: string): SubagentResultArtifact {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId,
    status,
    partial: false,
    summary: `Result artifact for ${runId}.`,
    childThreadId,
  };
}

describe("subagentRepair", () => {
  it("deduplicates subagent repair ids while preserving first-seen order", () => {
    expect(uniqueSubagentRepairIds(["run-1", "run-2", "run-1", "run-3", "run-2"])).toEqual([
      "run-1",
      "run-2",
      "run-3",
    ]);
  });

  it("replays the shared restart repair fixture without live Pi tokens", async () => {
    const fixture = subagentRestartReplayFixture();
    const summary = analyzeSubagentRestartState({
      threads: fixture.threads,
      runs: fixture.runs,
      runEvents: fixture.runEvents,
      spawnEdges: fixture.spawnEdges,
      waitBarriers: fixture.waitBarriers,
      createdAt: fixture.createdAt,
    });

    expect(summary.issues.map((issue) => issue.kind)).toEqual(fixture.expectedIssueKinds);
    expect(summary.repairedRunIds).toEqual(["run-active"]);
    expect(summary.repairedBarrierIds).toEqual(["barrier-required"]);
    expect(summary.repairableSpawnEdgeRunIds).toEqual(["run-terminal"]);
    expect(summary.danglingSpawnEdgeRunIds).toEqual(["missing-run"]);
    expect(summary.diagnosticRunIds).toEqual(["run-terminal"]);

    const evidence = subagentReplayEvidence({ fixture, restartSummary: summary });
    expect(evidence).toMatchObject({
      schemaVersion: "ambient-subagent-replay-evidence-v1",
      liveTokens: false,
      counts: {
        runtimeEvents: 3,
        restartRepairIssues: fixture.expectedIssueKinds.length,
      },
      rehydration: {
        schemaVersion: "ambient-subagent-restart-rehydration-proof-v1",
        parentMailboxEventIds: ["parent-mailbox-grouped-completion"],
        resultArtifactPointers: [
          expect.objectContaining({
            runId: "run-artifact",
            childThreadId: "child-artifact",
            artifactPath: ".ambient-codex/subagents/run-artifact/result.json",
          }),
        ],
        missingResultArtifactRunIds: ["run-terminal"],
        artifactPointerIntegrity: {
          allResultPointersHaveRunAndThread: true,
          missingResultArtifactsDiagnosed: true,
          parentMailboxChildRefsResolved: true,
          transcriptChildRefsResolved: true,
        },
      },
      restartRepair: {
        expectedIssueKinds: fixture.expectedIssueKinds,
        observedIssueKinds: fixture.expectedIssueKinds,
        repairedRunIds: ["run-active"],
        repairedBarrierIds: ["barrier-required"],
        repairableSpawnEdgeRunIds: ["run-terminal"],
        danglingSpawnEdgeRunIds: ["missing-run"],
      },
    });
    await writeSubagentReplayEvidenceArtifact(process.env.AMBIENT_SUBAGENT_REPLAY_EVIDENCE_OUT, evidence);
  });

  it("detects interrupted active runs, missing artifacts, and dangling wait barriers", () => {
    const parent = thread({ id: "parent", kind: "chat" });
    const child = thread({
      id: "child",
      kind: "subagent_child",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      subagentRunId: "run-active",
      canonicalTaskPath: "root/0:explorer",
    });
    const active = run({
      id: "run-active",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      childThreadId: "child",
      canonicalTaskPath: "root/0:explorer",
      status: "running",
    });
    const terminalMissingArtifact = run({
      id: "run-terminal",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      childThreadId: "missing-child",
      canonicalTaskPath: "root/1:summarizer",
      status: "completed",
    });

    const summary = analyzeSubagentRestartState({
      threads: [parent, child],
      runs: [active, terminalMissingArtifact],
      waitBarriers: [{
        id: "barrier",
        parentThreadId: "parent",
        parentRunId: "parent-run",
        childRunIds: ["run-active", "missing-run"],
        dependencyMode: "required_all",
        status: "waiting_on_children",
        failurePolicy: "ask_user",
        createdAt: "2026-06-05T00:00:00.000Z",
        updatedAt: "2026-06-05T00:00:00.000Z",
      }],
      createdAt: "2026-06-05T00:00:30.000Z",
    });

    expect(summary).toMatchObject({
      schemaVersion: "ambient-subagent-restart-reconciliation-v1",
      createdAt: "2026-06-05T00:00:30.000Z",
      repairedRunIds: ["run-active"],
      repairedBarrierIds: ["barrier"],
    });
    expect(summary.issues.map((issue) => issue.kind)).toEqual(expect.arrayContaining([
      "active_run_interrupted",
      "missing_child_thread",
      "missing_result_artifact",
      "dangling_wait_barrier_child",
    ]));
  });

  it("detects orphan child threads and linkage mismatches", () => {
    const summary = analyzeSubagentRestartState({
      threads: [
        thread({ id: "parent", kind: "chat" }),
        thread({
          id: "orphan",
          kind: "subagent_child",
          parentThreadId: "parent",
          parentRunId: "parent-run",
          subagentRunId: "missing-run",
          canonicalTaskPath: "root/9:orphan",
        }),
        thread({
          id: "child",
          kind: "subagent_child",
          parentThreadId: "wrong-parent",
          parentRunId: "parent-run",
          subagentRunId: "run",
          canonicalTaskPath: "root/0:explorer",
        }),
      ],
      runs: [run({
        id: "run",
        parentThreadId: "parent",
        parentRunId: "parent-run",
        childThreadId: "child",
        canonicalTaskPath: "root/0:explorer",
        status: "reserved",
      })],
    });

    expect(summary.issues.map((issue) => issue.kind)).toEqual(expect.arrayContaining([
      "orphan_child_thread",
      "thread_run_mismatch",
    ]));
  });

  it("detects child threads with missing, dangling, or self-referential parent threads", () => {
    const summary = analyzeSubagentRestartState({
      threads: [
        thread({ id: "parent", kind: "chat" }),
        thread({
          id: "missing-parent-id",
          kind: "subagent_child",
          parentThreadId: undefined,
          parentRunId: "parent-run",
          subagentRunId: "missing-parent-id-run",
          canonicalTaskPath: "root/0:explorer",
        }),
        thread({
          id: "dangling-parent",
          kind: "subagent_child",
          parentThreadId: "missing-parent-thread",
          parentRunId: "parent-run",
          subagentRunId: "dangling-parent-run",
          canonicalTaskPath: "root/1:explorer",
        }),
        thread({
          id: "self-parent",
          kind: "subagent_child",
          parentThreadId: "self-parent",
          parentRunId: "parent-run",
          subagentRunId: "self-parent-run",
          canonicalTaskPath: "root/2:explorer",
        }),
      ],
      runs: [],
    });
    const report = createSubagentRepairDiagnosticsReport({ summary });

    expect(summary.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "orphan_child_parent_thread",
        threadId: "missing-parent-id",
        message: "Sub-agent child thread missing-parent-id is missing parentThreadId and cannot be nested under its parent.",
      }),
      expect.objectContaining({
        kind: "orphan_child_parent_thread",
        threadId: "dangling-parent",
        parentThreadId: "missing-parent-thread",
        message: "Sub-agent child thread dangling-parent references missing parent thread missing-parent-thread.",
      }),
      expect.objectContaining({
        kind: "orphan_child_parent_thread",
        threadId: "self-parent",
        parentThreadId: "self-parent",
        message: "Sub-agent child thread self-parent points to itself as its parent thread.",
      }),
    ]));
    expect(summary.issues.filter((issue) => issue.kind === "orphan_child_parent_thread")).toHaveLength(3);
    expect(report.actionCounts.inspect_child_thread).toBe(6);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "orphan_child_parent_thread",
        action: "inspect_child_thread",
        actionLabel: "Inspect child thread linkage",
      }),
    ]));
  });

  it("treats reserved child runs as restart-interrupted work", () => {
    const summary = analyzeSubagentRestartState({
      threads: [
        thread({ id: "parent", kind: "chat" }),
        thread({
          id: "child",
          kind: "subagent_child",
          parentThreadId: "parent",
          parentRunId: "parent-run",
          subagentRunId: "run-reserved",
          canonicalTaskPath: "root/0:explorer",
        }),
      ],
      runs: [run({
        id: "run-reserved",
        parentThreadId: "parent",
        parentRunId: "parent-run",
        childThreadId: "child",
        canonicalTaskPath: "root/0:explorer",
        status: "reserved",
      })],
      waitBarriers: [{
        id: "barrier",
        parentThreadId: "parent",
        parentRunId: "parent-run",
        childRunIds: ["run-reserved"],
        dependencyMode: "required_all",
        status: "waiting_on_children",
        failurePolicy: "ask_user",
        createdAt: "2026-06-05T00:00:00.000Z",
        updatedAt: "2026-06-05T00:00:00.000Z",
      }],
    });

    expect(summary.repairedRunIds).toEqual(["run-reserved"]);
    expect(summary.repairedBarrierIds).toEqual(["barrier"]);
    expect(summary.issues.map((issue) => issue.kind)).toContain("active_run_interrupted");
  });

  it("detects parent-cancel barrier controls that restart before parent consumption", () => {
    const parent = thread({ id: "parent", kind: "chat" });
    const child = thread({
      id: "child",
      kind: "subagent_child",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      subagentRunId: "run-cancelled",
      canonicalTaskPath: "root/0:explorer",
    });
    const cancelled = run({
      id: "run-cancelled",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      childThreadId: "child",
      canonicalTaskPath: "root/0:explorer",
      status: "cancelled",
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: "run-cancelled",
        status: "cancelled",
        partial: false,
        summary: "User cancelled the parent path.",
        childThreadId: "child",
      },
    });

    const summary = analyzeSubagentRestartState({
      threads: [parent, child],
      runs: [cancelled],
      waitBarriers: [barrier({
        id: "barrier-cancel-parent",
        parentThreadId: "parent",
        parentRunId: "parent-run",
        childRunIds: [cancelled.id],
        status: "cancelled",
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: [cancelled.id],
          synthesisAllowed: false,
          parentCancellationRequested: true,
          userDecision: {
            schemaVersion: "ambient-subagent-user-decision-v1",
            decision: "cancel_parent",
          },
        },
      })],
    });

    expect(summary.repairedRunIds).toEqual([]);
    expect(summary.repairedBarrierIds).toEqual([]);
    expect(summary.repairedParentControlBarrierIds).toEqual(["barrier-cancel-parent"]);
    expect(summary.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "parent_cancel_control_unreconciled",
        barrierId: "barrier-cancel-parent",
        parentRunId: "parent-run",
      }),
    ]));

    const reconciled = analyzeSubagentRestartState({
      threads: [parent, child],
      runs: [cancelled],
      waitBarriers: [barrier({
        id: "barrier-cancel-parent",
        parentThreadId: "parent",
        parentRunId: "parent-run",
        childRunIds: [cancelled.id],
        status: "cancelled",
        resolutionArtifact: {
          parentCancellationRequested: true,
          parentControlReconciledAt: "2026-06-05T00:00:30.000Z",
        },
      })],
    });
    expect(reconciled.repairedParentControlBarrierIds).toEqual([]);
  });

  it("detects invalid and mismatched terminal result artifacts", () => {
    const parent = thread({ id: "parent", kind: "chat" });
    const invalidChild = thread({
      id: "invalid-child",
      kind: "subagent_child",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      subagentRunId: "run-invalid",
      canonicalTaskPath: "root/0:explorer",
    });
    const mismatchChild = thread({
      id: "mismatch-child",
      kind: "subagent_child",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      subagentRunId: "run-mismatch",
      canonicalTaskPath: "root/1:reviewer",
    });

    const summary = analyzeSubagentRestartState({
      threads: [parent, invalidChild, mismatchChild],
      runs: [
        run({
          id: "run-invalid",
          parentThreadId: "parent",
          parentRunId: "parent-run",
          childThreadId: "invalid-child",
          canonicalTaskPath: "root/0:explorer",
          status: "completed",
          resultArtifact: {
            schemaVersion: "ambient-subagent-result-artifact-v1",
            runId: "run-invalid",
            status: "completed",
            partial: false,
            summary: "",
            childThreadId: "invalid-child",
          },
        }),
        run({
          id: "run-mismatch",
          parentThreadId: "parent",
          parentRunId: "parent-run",
          childThreadId: "mismatch-child",
          canonicalTaskPath: "root/1:reviewer",
          status: "failed",
          resultArtifact: {
            schemaVersion: "ambient-subagent-result-artifact-v1",
            runId: "other-run",
            status: "completed",
            partial: false,
            summary: "Completed elsewhere.",
            childThreadId: "other-child",
          },
        }),
      ],
      createdAt: "2026-06-05T00:02:00.000Z",
    });

    expect(summary.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "invalid_result_artifact",
        runId: "run-invalid",
        message: expect.stringContaining("summary is empty"),
      }),
      expect.objectContaining({
        kind: "result_artifact_mismatch",
        runId: "run-mismatch",
        message: expect.stringContaining("artifact runId other-run does not match run run-mismatch"),
      }),
    ]));
  });

  it("detects missing lifecycle hook events when run events are available", () => {
    const parent = thread({ id: "parent", kind: "chat" });
    const activeChild = thread({
      id: "active-child",
      kind: "subagent_child",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      subagentRunId: "run-active",
      canonicalTaskPath: "root/0:explorer",
    });
    const terminalChild = thread({
      id: "terminal-child",
      kind: "subagent_child",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      subagentRunId: "run-terminal",
      canonicalTaskPath: "root/1:summarizer",
    });

    const summary = analyzeSubagentRestartState({
      threads: [parent, activeChild, terminalChild],
      runs: [
        run({
          id: "run-active",
          parentThreadId: "parent",
          parentRunId: "parent-run",
          childThreadId: "active-child",
          canonicalTaskPath: "root/0:explorer",
          status: "running",
        }),
        run({
          id: "run-terminal",
          parentThreadId: "parent",
          parentRunId: "parent-run",
          childThreadId: "terminal-child",
          canonicalTaskPath: "root/1:summarizer",
          status: "completed",
          resultArtifact: {
            schemaVersion: "ambient-subagent-result-artifact-v1",
            runId: "run-terminal",
            status: "completed",
            partial: false,
            summary: "Done.",
            childThreadId: "terminal-child",
          },
        }),
      ],
      runEvents: [
        event({ runId: "run-terminal", type: "subagent.lifecycle_started" }),
      ],
    });

    expect(summary.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "missing_lifecycle_start",
        runId: "run-active",
      }),
      expect.objectContaining({
        kind: "missing_lifecycle_stop",
        runId: "run-terminal",
      }),
    ]));
  });

  it("detects malformed feature flag and capacity lease snapshots for persisted child runs", () => {
    const parent = thread({ id: "parent", kind: "chat" });
    const disabledFlags = resolveAmbientFeatureFlags({ generatedAt: "2026-06-05T00:00:00.000Z" });
    const missingFlag = run({
      id: "run-missing-flag",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      childThreadId: "child-missing-flag",
      canonicalTaskPath: "root/0:explorer",
      status: "completed",
      resultArtifact: repairArtifact("run-missing-flag", "completed", "child-missing-flag"),
    }) as SubagentRunSummary & { featureFlagSnapshot?: unknown };
    (missingFlag as { featureFlagSnapshot?: unknown }).featureFlagSnapshot = undefined;
    const disabledFlag = run({
      id: "run-disabled-flag",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      childThreadId: "child-disabled-flag",
      canonicalTaskPath: "root/1:explorer",
      status: "completed",
      featureFlagSnapshot: disabledFlags,
      resultArtifact: repairArtifact("run-disabled-flag", "completed", "child-disabled-flag"),
    });
    const missingLease = run({
      id: "run-missing-lease",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      childThreadId: "child-missing-lease",
      canonicalTaskPath: "root/2:explorer",
      status: "completed",
      resultArtifact: repairArtifact("run-missing-lease", "completed", "child-missing-lease"),
    }) as SubagentRunSummary & { capacityLeaseSnapshot?: unknown };
    (missingLease as { capacityLeaseSnapshot?: unknown }).capacityLeaseSnapshot = undefined;
    const mismatchedLease = run({
      id: "run-mismatched-lease",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      childThreadId: "child-mismatched-lease",
      canonicalTaskPath: "root/3:explorer",
      status: "completed",
      resultArtifact: repairArtifact("run-mismatched-lease", "completed", "child-mismatched-lease"),
    });
    mismatchedLease.capacityLeaseSnapshot = {
      ...mismatchedLease.capacityLeaseSnapshot,
      childRunId: "other-run",
      canonicalTaskPath: "root/wrong:explorer",
    };

    const runs = [missingFlag, disabledFlag, missingLease, mismatchedLease];
    const summary = analyzeSubagentRestartState({
      threads: [
        parent,
        ...runs.map((item) => thread({
          id: item.childThreadId,
          kind: "subagent_child",
          parentThreadId: item.parentThreadId,
          parentRunId: item.parentRunId,
          subagentRunId: item.id,
          canonicalTaskPath: item.canonicalTaskPath,
        })),
      ],
      runs,
      createdAt: "2026-06-05T00:04:00.000Z",
    });
    const report = createSubagentRepairDiagnosticsReport({ summary });

    expect(summary.issues.map((issue) => issue.kind)).toEqual([
      "missing_feature_flag_snapshot",
      "subagent_feature_flag_disabled",
      "missing_capacity_lease",
      "capacity_lease_mismatch",
    ]);
    expect(report.actionCounts.inspect_run_snapshot).toBe(4);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "missing_feature_flag_snapshot",
        action: "inspect_run_snapshot",
        actionLabel: "Inspect run snapshot",
        runId: "run-missing-flag",
      }),
      expect.objectContaining({
        kind: "capacity_lease_mismatch",
        messagePreview: expect.stringContaining("lease childRunId other-run does not match run run-mismatched-lease"),
      }),
    ]));
  });

  it("detects role profile, model runtime, prompt, and tool-scope snapshot drift for persisted child runs", () => {
    const parent = thread({ id: "parent", kind: "chat" });
    const missingRole = run({
      id: "run-missing-role",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      childThreadId: "child-missing-role",
      canonicalTaskPath: "root/0:explorer",
      status: "completed",
      roleProfileSnapshotSource: "legacy_default",
      resultArtifact: repairArtifact("run-missing-role", "completed", "child-missing-role"),
    });
    const mismatchedRole = run({
      id: "run-mismatched-role",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      childThreadId: "child-mismatched-role",
      canonicalTaskPath: "root/1:reviewer",
      roleId: "reviewer",
      roleProfileSnapshot: getDefaultSubagentRoleProfile("explorer"),
      status: "completed",
      resultArtifact: repairArtifact("run-mismatched-role", "completed", "child-mismatched-role"),
    });
    const missingModel = run({
      id: "run-missing-model",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      childThreadId: "child-missing-model",
      canonicalTaskPath: "root/2:explorer",
      status: "completed",
      resultArtifact: repairArtifact("run-missing-model", "completed", "child-missing-model"),
    });
    (missingModel as unknown as { modelRuntimeSnapshot?: unknown }).modelRuntimeSnapshot = undefined;

    const mismatchedModel = run({
      id: "run-mismatched-model",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      childThreadId: "child-mismatched-model",
      canonicalTaskPath: "root/3:explorer",
      status: "completed",
      resultArtifact: repairArtifact("run-mismatched-model", "completed", "child-mismatched-model"),
    });
    mismatchedModel.modelRuntimeSnapshot = {
      ...mismatchedModel.modelRuntimeSnapshot,
      profile: {
        ...mismatchedModel.modelRuntimeSnapshot.profile,
        modelId: "other/model",
      },
    };

    const missingPrompt = run({
      id: "run-missing-prompt",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      childThreadId: "child-missing-prompt",
      canonicalTaskPath: "root/4:explorer",
      status: "completed",
      resultArtifact: repairArtifact("run-missing-prompt", "completed", "child-missing-prompt"),
    });
    const promptMismatch = run({
      id: "run-prompt-mismatch",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      childThreadId: "child-prompt-mismatch",
      canonicalTaskPath: "root/5:explorer",
      status: "completed",
      resultArtifact: repairArtifact("run-prompt-mismatch", "completed", "child-prompt-mismatch"),
    });
    const missingToolScope = run({
      id: "run-missing-tool-scope",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      childThreadId: "child-missing-tool-scope",
      canonicalTaskPath: "root/6:explorer",
      status: "completed",
      resultArtifact: repairArtifact("run-missing-tool-scope", "completed", "child-missing-tool-scope"),
    });
    const toolScopeMismatch = run({
      id: "run-tool-scope-mismatch",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      childThreadId: "child-tool-scope-mismatch",
      canonicalTaskPath: "root/7:explorer",
      status: "completed",
      resultArtifact: repairArtifact("run-tool-scope-mismatch", "completed", "child-tool-scope-mismatch"),
    });
    const runs = [missingRole, mismatchedRole, missingModel, mismatchedModel, missingPrompt, promptMismatch, missingToolScope, toolScopeMismatch];
    const badPromptSnapshot = promptSnapshot(promptMismatch);
    badPromptSnapshot.snapshot = {
      ...(badPromptSnapshot.snapshot as Record<string, unknown>),
      childThreadId: "other-child",
      boundaryInstructions: ["strip_subagent_tool_calls"],
    };
    const badToolScopeSnapshot = toolScopeSnapshot(toolScopeMismatch);
    badToolScopeSnapshot.scope = {
      ...badToolScopeSnapshot.scope,
      fanoutAvailable: true,
      piVisibleTools: [{
        source: "fanout",
        id: "subagent.spawn",
        categoryId: "subagent.spawn",
        piVisible: true,
        mutatesState: false,
        requiresApproval: true,
      }],
    };
    badToolScopeSnapshot.resolverInputs = {
      schemaVersion: "ambient-subagent-tool-scope-resolver-input-v1",
      roleId: "reviewer",
      model: {
        profileId: "wrong-profile",
        providerId: toolScopeMismatch.modelRuntimeSnapshot.profile.providerId,
        modelId: toolScopeMismatch.modelRuntimeSnapshot.profile.modelId,
      },
    };

    const summary = analyzeSubagentRestartState({
      threads: [
        parent,
        ...runs.map((item) => thread({
          id: item.childThreadId,
          kind: "subagent_child",
          parentThreadId: item.parentThreadId,
          parentRunId: item.parentRunId,
          subagentRunId: item.id,
          canonicalTaskPath: item.canonicalTaskPath,
        })),
      ],
      runs,
      runEvents: [
        ...runs.flatMap((item) => [
          event({ runId: item.id, sequence: 1, type: "subagent.lifecycle_started" }),
          event({ runId: item.id, sequence: 2, type: "subagent.lifecycle_stopped" }),
        ]),
        event({ runId: missingPrompt.id, sequence: 3, type: "subagent.child_session_started" }),
        event({ runId: missingToolScope.id, sequence: 3, type: "subagent.spawn_requested" }),
      ],
      promptSnapshots: [
        badPromptSnapshot,
        { ...promptSnapshot(promptMismatch), runId: "missing-run", sequence: 2 },
      ],
      toolScopeSnapshots: [
        badToolScopeSnapshot,
        { ...toolScopeSnapshot(toolScopeMismatch), runId: "missing-run", sequence: 2 },
      ],
      createdAt: "2026-06-05T00:04:30.000Z",
    });
    const report = createSubagentRepairDiagnosticsReport({ summary });

    expect(summary.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "missing_role_profile_snapshot", runId: "run-missing-role" }),
      expect.objectContaining({
        kind: "role_profile_snapshot_mismatch",
        runId: "run-mismatched-role",
        message: expect.stringContaining("role profile id explorer does not match run roleId reviewer"),
      }),
      expect.objectContaining({ kind: "missing_model_runtime_snapshot", runId: "run-missing-model" }),
      expect.objectContaining({
        kind: "model_runtime_snapshot_mismatch",
        runId: "run-mismatched-model",
        message: expect.stringContaining("lease modelId zai-org/GLM-5.1-FP8 does not match runtime modelId other/model"),
      }),
      expect.objectContaining({ kind: "missing_prompt_snapshot", runId: "run-missing-prompt" }),
      expect.objectContaining({
        kind: "prompt_snapshot_mismatch",
        runId: "run-prompt-mismatch",
        message: expect.stringContaining("boundaryInstructions is missing no_parent_spawn_tool"),
      }),
      expect.objectContaining({ kind: "missing_tool_scope_snapshot", runId: "run-missing-tool-scope" }),
      expect.objectContaining({
        kind: "tool_scope_snapshot_mismatch",
        runId: "run-tool-scope-mismatch",
        message: expect.stringContaining("piVisibleTools contains a non-callable source"),
      }),
      expect.objectContaining({ kind: "prompt_snapshot_mismatch", runId: "missing-run" }),
      expect.objectContaining({ kind: "tool_scope_snapshot_mismatch", runId: "missing-run" }),
    ]));
    expect(report.actionCounts.inspect_run_snapshot).toBeGreaterThanOrEqual(6);
    expect(report.diagnosticRunIds).toEqual(expect.arrayContaining([
      "run-missing-role",
      "run-mismatched-role",
      "run-missing-model",
      "run-mismatched-model",
      "run-missing-prompt",
      "run-prompt-mismatch",
      "run-missing-tool-scope",
      "run-tool-scope-mismatch",
    ]));
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "missing_role_profile_snapshot",
        action: "inspect_run_snapshot",
        actionLabel: "Inspect run snapshot",
      }),
      expect.objectContaining({
        kind: "role_profile_snapshot_mismatch",
        action: "inspect_run_snapshot",
      }),
      expect.objectContaining({
        kind: "missing_model_runtime_snapshot",
        action: "inspect_run_snapshot",
        actionLabel: "Inspect run snapshot",
      }),
      expect.objectContaining({
        kind: "tool_scope_snapshot_mismatch",
        action: "inspect_run_snapshot",
      }),
    ]));
  });

  it("detects missing, dangling, and mismatched spawn edges", () => {
    const parent = thread({ id: "parent", kind: "chat" });
    const missingEdgeChild = thread({
      id: "missing-edge-child",
      kind: "subagent_child",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      subagentRunId: "run-missing-edge",
      canonicalTaskPath: "root/0:explorer",
    });
    const mismatchedChild = thread({
      id: "mismatched-child",
      kind: "subagent_child",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      subagentRunId: "run-mismatched-edge",
      canonicalTaskPath: "root/1:reviewer",
    });
    const missingEdgeRun = run({
      id: "run-missing-edge",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      childThreadId: "missing-edge-child",
      canonicalTaskPath: "root/0:explorer",
      status: "completed",
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: "run-missing-edge",
        status: "completed",
        partial: false,
        summary: "Done.",
        childThreadId: "missing-edge-child",
      },
    });
    const mismatchedRun = run({
      id: "run-mismatched-edge",
      parentThreadId: "parent",
      parentRunId: "parent-run",
      childThreadId: "mismatched-child",
      canonicalTaskPath: "root/1:reviewer",
      status: "completed",
      closedAt: "2026-06-05T00:02:00.000Z",
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: "run-mismatched-edge",
        status: "completed",
        partial: false,
        summary: "Done.",
        childThreadId: "mismatched-child",
      },
    });

    const summary = analyzeSubagentRestartState({
      threads: [parent, missingEdgeChild, mismatchedChild],
      runs: [missingEdgeRun, mismatchedRun],
      spawnEdges: [
        edge({
          childRunId: mismatchedRun.id,
          childThreadId: mismatchedRun.childThreadId,
          status: "running",
          canonicalTaskPath: "root/other:reviewer",
          capacityReleasedAt: undefined,
        }),
        edge({
          childRunId: "missing-run",
          childThreadId: "dangling-child",
          status: "reserved",
        }),
      ],
      createdAt: "2026-06-05T00:03:00.000Z",
    });

    expect(summary.diagnosticRunIds).toEqual(["run-missing-edge", "run-mismatched-edge"]);
    expect(summary.repairableSpawnEdgeRunIds).toEqual(["run-missing-edge", "run-mismatched-edge"]);
    expect(summary.danglingSpawnEdgeRunIds).toEqual(["missing-run"]);
    expect(summary.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "missing_spawn_edge",
        runId: "run-missing-edge",
      }),
      expect.objectContaining({
        kind: "spawn_edge_mismatch",
        runId: "run-mismatched-edge",
        message: expect.stringContaining("edge status running does not match run status completed"),
      }),
      expect.objectContaining({
        kind: "dangling_spawn_edge",
        runId: "missing-run",
      }),
    ]));
    const report = createSubagentRepairDiagnosticsReport({ summary });
    expect(report.repairedSpawnEdgeRunIds).toEqual(["run-missing-edge", "run-mismatched-edge"]);
    expect(report.prunedDanglingSpawnEdgeRunIds).toEqual(["missing-run"]);
    expect(report.actionCounts).toMatchObject({
      repair_spawn_edge: 3,
    });
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "missing_spawn_edge",
        action: "repair_spawn_edge",
        actionLabel: "Repair spawn edge",
      }),
      expect.objectContaining({
        kind: "spawn_edge_mismatch",
        action: "repair_spawn_edge",
        actionLabel: "Repair spawn edge",
      }),
      expect.objectContaining({
        kind: "dangling_spawn_edge",
        action: "repair_spawn_edge",
        actionLabel: "Repair spawn edge",
      }),
    ]));
  });

  it("builds restart interruption result artifacts", () => {
    const artifact = interruptedSubagentResultArtifact({
      run: run({
        id: "run",
        parentThreadId: "parent",
        parentRunId: "parent-run",
        childThreadId: "child",
        canonicalTaskPath: "root/0:explorer",
        status: "running",
      }),
    });

    expect(artifact).toMatchObject({
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: "run",
      status: "stopped",
      partial: false,
      childThreadId: "child",
    });
  });

  it("creates a bounded repair diagnostics report with non-destructive next actions", () => {
    const summary = analyzeSubagentRestartState({
      threads: [
        thread({ id: "parent", kind: "chat" }),
        thread({
          id: "child",
          kind: "subagent_child",
          parentThreadId: "parent",
          parentRunId: "parent-run",
          subagentRunId: "run-active",
          canonicalTaskPath: "root/0:explorer",
        }),
        thread({
          id: "orphan",
          kind: "subagent_child",
          parentThreadId: "parent",
          parentRunId: "parent-run",
          subagentRunId: "missing-run",
          canonicalTaskPath: "root/9:orphan",
        }),
      ],
      runs: [
        run({
          id: "run-active",
          parentThreadId: "parent",
          parentRunId: "parent-run",
          childThreadId: "child",
          canonicalTaskPath: "root/0:explorer",
          status: "running",
        }),
        run({
          id: "run-terminal",
          parentThreadId: "parent",
          parentRunId: "parent-run",
          childThreadId: "missing-child",
          canonicalTaskPath: "root/1:reviewer",
          status: "completed",
        }),
      ],
      waitBarriers: [{
        id: "barrier",
        parentThreadId: "parent",
        parentRunId: "parent-run",
        childRunIds: ["missing-run"],
        dependencyMode: "required_all",
        status: "waiting_on_children",
        failurePolicy: "ask_user",
        createdAt: "2026-06-05T00:00:00.000Z",
        updatedAt: "2026-06-05T00:00:00.000Z",
      }],
      createdAt: "2026-06-05T00:05:00.000Z",
    });

    const report = createSubagentRepairDiagnosticsReport({
      summary,
      maxIssues: 2,
      maxMessageChars: 48,
      maxAffectedIds: 1,
    });

    expect(report).toMatchObject({
      schemaVersion: "ambient-subagent-repair-diagnostics-v1",
      createdAt: "2026-06-05T00:05:00.000Z",
      issueCount: summary.issueCount,
      shownIssueCount: 2,
      truncatedIssues: true,
      affectedIdsTruncated: true,
      errorCount: 3,
      warningCount: 2,
      repairedRunIds: ["run-active"],
      repairedBarrierIds: [],
      repairedParentControlBarrierIds: [],
      repairedSpawnEdgeRunIds: [],
      prunedDanglingSpawnEdgeRunIds: [],
      actionCounts: {
        auto_reconcile_restart: 1,
        inspect_child_thread: 1,
        inspect_result_artifact: 1,
        manual_repair_required: 2,
      },
    });
    expect(report.issues).toEqual([
      expect.objectContaining({
        kind: "active_run_interrupted",
        action: "auto_reconcile_restart",
        actionLabel: "Run startup reconciliation",
        destructive: false,
      }),
      expect.objectContaining({
        kind: "missing_child_thread",
        action: "manual_repair_required",
        messagePreview: expect.stringMatching(/\.\.\.$/),
      }),
    ]);
  });
});

function event(input: Partial<SubagentRunEventSummary> & { runId: string; type: string }): SubagentRunEventSummary {
  return {
    runId: input.runId,
    sequence: input.sequence ?? 1,
    type: input.type,
    createdAt: input.createdAt ?? "2026-06-05T00:00:00.000Z",
    preview: input.preview,
    artifactPath: input.artifactPath,
  };
}

function edge(input: Partial<SubagentSpawnEdgeSummary> & { childRunId: string; childThreadId: string; status: SubagentRunSummary["status"] }): SubagentSpawnEdgeSummary {
  return {
    parentRunId: input.parentRunId ?? "parent-run",
    childRunId: input.childRunId,
    parentThreadId: input.parentThreadId ?? "parent",
    childThreadId: input.childThreadId,
    canonicalTaskPath: input.canonicalTaskPath ?? "root/0:explorer",
    depth: input.depth ?? 1,
    status: input.status,
    capacityReleasedAt: input.capacityReleasedAt,
    createdAt: input.createdAt ?? "2026-06-05T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-06-05T00:00:00.000Z",
  };
}

function barrier(input: Partial<SubagentWaitBarrierSummary> & {
  id: string;
  parentThreadId: string;
  parentRunId: string;
  childRunIds: string[];
  status: SubagentWaitBarrierSummary["status"];
}): SubagentWaitBarrierSummary {
  return {
    dependencyMode: "required_all",
    failurePolicy: "ask_user",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...input,
  };
}

function promptSnapshot(run: SubagentRunSummary): SubagentPromptSnapshotSummary {
  const profile = run.modelRuntimeSnapshot.profile;
  return {
    runId: run.id,
    sequence: 1,
    createdAt: "2026-06-05T00:00:05.000Z",
    promptSha256: "a".repeat(64),
    promptPreview: "Ambient sub-agent child run.",
    snapshot: {
      schemaVersion: "ambient-subagent-prompt-snapshot-v1",
      runId: run.id,
      childThreadId: run.childThreadId,
      canonicalTaskPath: run.canonicalTaskPath,
      roleId: run.roleId,
      activeAgentTag: `Explorer[${run.canonicalTaskPath}]`,
      modelScope: {
        schemaVersion: "ambient-subagent-prompt-model-scope-v1",
        requestedModelId: run.modelRuntimeSnapshot.requestedModelId,
        profileId: profile.profileId,
        providerId: profile.providerId,
        modelId: profile.modelId,
        locality: profile.locality,
        toolUse: profile.toolUse,
        structuredOutput: profile.structuredOutput,
      },
      forkMode: "task_only",
      promptMode: "concise",
      inheritedRefs: [],
      strippedRefs: [],
      boundaryInstructions: [
        "no_parent_spawn_tool",
        "strip_subagent_tool_calls",
        "structured_result_json",
      ],
      toolScope: toolScopeSnapshot(run).scope,
      guardPolicy: run.roleProfileSnapshot.guardPolicy,
    },
  };
}

function toolScopeSnapshot(run: SubagentRunSummary): SubagentToolScopeSnapshotSummary {
  const profile = run.modelRuntimeSnapshot.profile;
  return {
    runId: run.id,
    sequence: 1,
    createdAt: "2026-06-05T00:00:04.000Z",
    scope: {
      schemaVersion: "ambient-subagent-tool-scope-v1",
      loadedCategories: ["workspace.read"],
      piVisibleCategories: ["workspace.read"],
      deniedCategories: [],
      loadedTools: [],
      piVisibleTools: [],
      deniedTools: [],
      approvalMode: "interactive",
      worktreeIsolated: false,
      fanoutAvailable: false,
    },
    resolverInputs: {
      schemaVersion: "ambient-subagent-tool-scope-resolver-input-v1",
      roleId: run.roleId,
      model: {
        profileId: profile.profileId,
        providerId: profile.providerId,
        modelId: profile.modelId,
        toolUse: profile.toolUse,
        structuredOutput: profile.structuredOutput,
        locality: profile.locality,
      },
    },
  };
}

function thread(input: Partial<ThreadSummary> & { id: string }): ThreadSummary {
  return {
    title: input.id,
    workspacePath: "/tmp/workspace",
    kind: "chat",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "zai-org/GLM-5.1-FP8",
    thinkingLevel: "minimal",
    ...input,
  };
}

function run(input: Partial<SubagentRunSummary> & {
  id: string;
  parentThreadId: string;
  parentRunId: string;
  childThreadId: string;
  canonicalTaskPath: string;
  status: SubagentRunSummary["status"];
}): SubagentRunSummary {
  const modelRuntimeSnapshot = input.modelRuntimeSnapshot ??
    createAmbientModelRuntimeSnapshot("zai-org/GLM-5.1-FP8", "2026-06-05T00:00:00.000Z");
  return {
    protocolVersion: "ambient-subagent-v1",
    roleId: "explorer",
    roleProfileSnapshot: getDefaultSubagentRoleProfile("explorer"),
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    featureFlagSnapshot: featureFlags,
    modelRuntimeSnapshot,
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...input,
    capacityLeaseSnapshot: input.capacityLeaseSnapshot ?? materializeSubagentCapacityLeaseForRun(
      fallbackSubagentCapacityLease({
        parentThreadId: input.parentThreadId,
        parentRunId: input.parentRunId,
        canonicalTaskPath: input.canonicalTaskPath,
        roleId: input.roleId ?? "explorer",
        model: modelRuntimeSnapshot.profile,
        now: "2026-06-05T00:00:00.000Z",
      }),
      {
        childRunId: input.id,
        childThreadId: input.childThreadId,
        canonicalTaskPath: input.canonicalTaskPath,
        parentThreadId: input.parentThreadId,
        parentRunId: input.parentRunId,
        roleId: input.roleId ?? "explorer",
      },
    ),
  };
}
