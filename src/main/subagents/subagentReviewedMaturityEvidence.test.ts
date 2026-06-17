import { describe, expect, it } from "vitest";
import type {
  SubagentMaturityEvidence,
  SubagentWorkflowJitterReleaseProfileReport,
} from "../../shared/subagentMaturity";
import type { SubagentRestartReconciliationSummary } from "../../shared/types";
import {
  recordSubagentApprovalRoutingVisibilityEvidence,
  recordSubagentBugAuditEvidence,
  recordSubagentCompletionGuardVisibilityEvidence,
  recordSubagentEventAttributionIntegrityEvidence,
  recordSubagentLifecycleControlIntegrityEvidence,
  recordSubagentProductionUiVisibilityEvidence,
  recordSubagentRestartRecoveryEvidence,
  recordSubagentRetentionPolicyIntegrityEvidence,
  recordSubagentSecurityReviewEvidence,
  recordSubagentToolScopeIntegrityEvidence,
  recordSubagentWorkflowJitterReleaseProfileEvidence,
  type SubagentReviewedMaturityEvidenceStore,
} from "./subagentReviewedMaturityEvidence";

describe("reviewed sub-agent maturity evidence", () => {
  it("records passed restart, bug audit, and security review evidence with reviewed metadata", () => {
    const { store, calls } = captureStore();

    const restart = recordSubagentRestartRecoveryEvidence(store, {
      summary: restartSummary({ issueCount: 0 }),
      reviewer: "release-owner",
      artifactPath: ".ambient/subagents/restart-recovery.md",
      createdAt: "2026-06-05T00:01:00.000Z",
    });
    const bugAudit = recordSubagentBugAuditEvidence(store, {
      kind: "permission_bug_audit",
      p0: 0,
      p1: 0,
      reviewer: "qa-owner",
      evidenceKey: "permission-bugs:2026-06-05",
      createdAt: "2026-06-05T00:02:00.000Z",
    });
    const guardVisibility = recordSubagentCompletionGuardVisibilityEvidence(store, {
      childInspector: true,
      parentBlockingIndicator: true,
      replayDiagnostics: true,
      diagnosticHistory: true,
      reviewer: "release-owner",
      artifactPath: "test-results/subagent-release-gate/latest.json",
      createdAt: "2026-06-05T00:02:30.000Z",
    });
    const approvalRouting = recordSubagentApprovalRoutingVisibilityEvidence(store, {
      childRequestAttribution: true,
      scopedResponsePersistence: true,
      parentWaitResumption: true,
      nonInteractiveFailure: true,
      uiAndReplayVisibility: true,
      reviewer: "release-owner",
      artifactPath: "test-results/subagent-release-gate/latest.json",
      createdAt: "2026-06-05T00:02:45.000Z",
    });
    const productionUi = recordSubagentProductionUiVisibilityEvidence(store, {
      collapsedParentClusters: true,
      blockingChildIndicators: true,
      childInspectorRows: true,
      repairReplayPanels: true,
      localRuntimeOwnershipControls: true,
      reviewer: "release-owner",
      artifactPath: "test-results/subagent-release-gate/latest.json",
      createdAt: "2026-06-05T00:02:47.000Z",
    });
    const eventAttribution = recordSubagentEventAttributionIntegrityEvidence(store, {
      runtimePreviewAttribution: true,
      parentMailboxAttribution: true,
      toolApprovalErrorProvenance: true,
      replayDiagnostics: true,
      largeOutputArtifactBacking: true,
      reviewer: "release-owner",
      artifactPath: "test-results/subagent-release-gate/latest.json",
      createdAt: "2026-06-05T00:02:50.000Z",
    });
    const lifecycleControl = recordSubagentLifecycleControlIntegrityEvidence(store, {
      parentStopCascade: true,
      childCancelIsolation: true,
      closeCapacityRetention: true,
      lifecycleHookArtifacts: true,
      restartInterruptionRepair: true,
      reviewer: "release-owner",
      artifactPath: "test-results/subagent-release-gate/latest.json",
      createdAt: "2026-06-05T00:02:55.000Z",
    });
    const retentionPolicy = recordSubagentRetentionPolicyIntegrityEvidence(store, {
      closeDoesNotDelete: true,
      capCleanupOldestEligible: true,
      protectedChildrenRetained: true,
      summaryArtifactsRetained: true,
      retainedStateVisible: true,
      reviewer: "release-owner",
      artifactPath: "test-results/subagent-release-gate/latest.json",
      createdAt: "2026-06-05T00:02:57.000Z",
    });
    const toolScope = recordSubagentToolScopeIntegrityEvidence(store, {
      hardDenyPrecedence: true,
      roleTaskNarrowing: true,
      exactToolAndExtensionResolution: true,
      childFanoutDefaultBlocked: true,
      snapshotAndInspectorDiagnostics: true,
      reviewer: "release-owner",
      artifactPath: "test-results/subagent-release-gate/latest.json",
      createdAt: "2026-06-05T00:02:58.000Z",
    });
    const security = recordSubagentSecurityReviewEvidence(store, {
      status: "passed",
      reviewer: "security-owner",
      notes: "Threat-model regression coverage accepted.",
      threatModelTestCount: 8,
      createdAt: "2026-06-05T00:03:00.000Z",
    });

    expect(restart).toMatchObject({ kind: "restart_recovery", status: "passed", reviewer: "release-owner" });
    expect(bugAudit).toMatchObject({ kind: "permission_bug_audit", status: "passed", evidenceKey: "permission-bugs:2026-06-05" });
    expect(guardVisibility).toMatchObject({ kind: "completion_guard_visibility", status: "passed", reviewer: "release-owner" });
    expect(approvalRouting).toMatchObject({ kind: "approval_routing_visibility", status: "passed", reviewer: "release-owner" });
    expect(productionUi).toMatchObject({ kind: "production_ui_visibility", status: "passed", reviewer: "release-owner" });
    expect(eventAttribution).toMatchObject({ kind: "event_attribution_integrity", status: "passed", reviewer: "release-owner" });
    expect(lifecycleControl).toMatchObject({ kind: "lifecycle_control_integrity", status: "passed", reviewer: "release-owner" });
    expect(retentionPolicy).toMatchObject({ kind: "retention_policy_integrity", status: "passed", reviewer: "release-owner" });
    expect(toolScope).toMatchObject({ kind: "tool_scope_integrity", status: "passed", reviewer: "release-owner" });
    expect(security).toMatchObject({ kind: "security_review", status: "passed", reviewer: "security-owner" });
    expect(calls).toEqual([
      expect.objectContaining({
        kind: "restart_recovery",
        status: "passed",
        evidenceKey: "restart-recovery:2026-06-05T00:00:00.000Z",
        artifactPath: ".ambient/subagents/restart-recovery.md",
        reviewer: "release-owner",
        details: expect.objectContaining({
          schemaVersion: "ambient-subagent-reviewed-maturity-evidence-v1",
          evidenceType: "restart_recovery",
          issueCount: 0,
          repairedParentControlBarrierIds: [],
        }),
      }),
      expect.objectContaining({
        kind: "permission_bug_audit",
        status: "passed",
        reviewer: "qa-owner",
        details: expect.objectContaining({
          p0: 0,
          p1: 0,
          totalP0P1: 0,
        }),
      }),
      expect.objectContaining({
        kind: "completion_guard_visibility",
        status: "passed",
        reviewer: "release-owner",
        notes: "Reviewed completion guard visibility across child inspector, parent blockers, replay diagnostics, and diagnostic history.",
        details: expect.objectContaining({
          evidenceType: "completion_guard_visibility",
          childInspector: true,
          parentBlockingIndicator: true,
          replayDiagnostics: true,
          diagnosticHistory: true,
          missingSurfaces: [],
        }),
      }),
      expect.objectContaining({
        kind: "approval_routing_visibility",
        status: "passed",
        reviewer: "release-owner",
        notes: "Reviewed child approval routing across attribution, scoped response persistence, parent wait resumption, non-interactive failures, and UI/replay visibility.",
        details: expect.objectContaining({
          evidenceType: "approval_routing_visibility",
          childRequestAttribution: true,
          scopedResponsePersistence: true,
          parentWaitResumption: true,
          nonInteractiveFailure: true,
          uiAndReplayVisibility: true,
          missingSurfaces: [],
        }),
      }),
      expect.objectContaining({
        kind: "production_ui_visibility",
        status: "passed",
        reviewer: "release-owner",
        notes: "Reviewed production UI visibility across collapsed parent clusters, blocking-child indicators, child inspector rows, repair/replay panels, and local runtime ownership controls.",
        details: expect.objectContaining({
          evidenceType: "production_ui_visibility",
          collapsedParentClusters: true,
          blockingChildIndicators: true,
          childInspectorRows: true,
          repairReplayPanels: true,
          localRuntimeOwnershipControls: true,
          missingSurfaces: [],
        }),
      }),
      expect.objectContaining({
        kind: "event_attribution_integrity",
        status: "passed",
        reviewer: "release-owner",
        notes: "Reviewed sub-agent event attribution across runtime previews, parent mailbox events, tool/approval/error provenance, replay diagnostics, and large-output artifacts.",
        details: expect.objectContaining({
          evidenceType: "event_attribution_integrity",
          runtimePreviewAttribution: true,
          parentMailboxAttribution: true,
          toolApprovalErrorProvenance: true,
          replayDiagnostics: true,
          largeOutputArtifactBacking: true,
          missingSurfaces: [],
        }),
      }),
      expect.objectContaining({
        kind: "lifecycle_control_integrity",
        status: "passed",
        reviewer: "release-owner",
        notes: "Reviewed sub-agent lifecycle controls across parent-stop cascade, child-cancel isolation, close history retention, lifecycle hook artifacts, and restart interruption repair.",
        details: expect.objectContaining({
          evidenceType: "lifecycle_control_integrity",
          parentStopCascade: true,
          childCancelIsolation: true,
          closeCapacityRetention: true,
          lifecycleHookArtifacts: true,
          restartInterruptionRepair: true,
          missingSurfaces: [],
        }),
      }),
      expect.objectContaining({
        kind: "retention_policy_integrity",
        status: "passed",
        reviewer: "release-owner",
        notes: "Reviewed sub-agent retention policy across close-without-delete, oldest-eligible cap cleanup, protected-child retention, summary/artifact durability, and retained-state UI.",
        details: expect.objectContaining({
          evidenceType: "retention_policy_integrity",
          closeDoesNotDelete: true,
          capCleanupOldestEligible: true,
          protectedChildrenRetained: true,
          summaryArtifactsRetained: true,
          retainedStateVisible: true,
          missingSurfaces: [],
        }),
      }),
      expect.objectContaining({
        kind: "tool_scope_integrity",
        status: "passed",
        reviewer: "release-owner",
        notes: "Reviewed sub-agent tool scope across hard-deny precedence, role/task narrowing, exact tool/extension resolution, child fanout default blocking, and snapshot/inspector diagnostics.",
        details: expect.objectContaining({
          evidenceType: "tool_scope_integrity",
          hardDenyPrecedence: true,
          roleTaskNarrowing: true,
          exactToolAndExtensionResolution: true,
          childFanoutDefaultBlocked: true,
          snapshotAndInspectorDiagnostics: true,
          missingSurfaces: [],
        }),
      }),
      expect.objectContaining({
        kind: "security_review",
        status: "passed",
        reviewer: "security-owner",
        notes: "Threat-model regression coverage accepted.",
        details: expect.objectContaining({
          threatModelTestCount: 8,
        }),
      }),
    ]);
  });

  it("records failed evidence when reviewed restart, bug, or security checks do not pass", () => {
    const { store, calls } = captureStore();
    const summary = restartSummary({
      issueCount: 1,
      issues: [{
        id: "issue-1",
        kind: "active_run_interrupted",
        severity: "error",
        message: "Active child was interrupted.",
        runId: "child-run",
      }],
    });

    recordSubagentRestartRecoveryEvidence(store, {
      summary,
      reviewer: "release-owner",
    });
    recordSubagentBugAuditEvidence(store, {
      kind: "lifecycle_bug_audit",
      p0: 1,
      p1: 2,
      reviewer: "qa-owner",
      createdAt: "2026-06-05T00:04:00.000Z",
    });
    recordSubagentCompletionGuardVisibilityEvidence(store, {
      childInspector: true,
      parentBlockingIndicator: false,
      replayDiagnostics: true,
      diagnosticHistory: false,
      reviewer: "release-owner",
      createdAt: "2026-06-05T00:04:30.000Z",
    });
    recordSubagentApprovalRoutingVisibilityEvidence(store, {
      childRequestAttribution: true,
      scopedResponsePersistence: false,
      parentWaitResumption: false,
      nonInteractiveFailure: true,
      uiAndReplayVisibility: true,
      reviewer: "release-owner",
      createdAt: "2026-06-05T00:04:45.000Z",
    });
    recordSubagentProductionUiVisibilityEvidence(store, {
      collapsedParentClusters: true,
      blockingChildIndicators: false,
      childInspectorRows: true,
      repairReplayPanels: false,
      localRuntimeOwnershipControls: true,
      reviewer: "release-owner",
      createdAt: "2026-06-05T00:04:47.000Z",
    });
    recordSubagentEventAttributionIntegrityEvidence(store, {
      runtimePreviewAttribution: true,
      parentMailboxAttribution: false,
      toolApprovalErrorProvenance: false,
      replayDiagnostics: true,
      largeOutputArtifactBacking: true,
      reviewer: "release-owner",
      createdAt: "2026-06-05T00:04:50.000Z",
    });
    recordSubagentLifecycleControlIntegrityEvidence(store, {
      parentStopCascade: true,
      childCancelIsolation: false,
      closeCapacityRetention: false,
      lifecycleHookArtifacts: true,
      restartInterruptionRepair: true,
      reviewer: "release-owner",
      createdAt: "2026-06-05T00:04:55.000Z",
    });
    recordSubagentRetentionPolicyIntegrityEvidence(store, {
      closeDoesNotDelete: true,
      capCleanupOldestEligible: false,
      protectedChildrenRetained: false,
      summaryArtifactsRetained: true,
      retainedStateVisible: true,
      reviewer: "release-owner",
      createdAt: "2026-06-05T00:04:57.000Z",
    });
    recordSubagentToolScopeIntegrityEvidence(store, {
      hardDenyPrecedence: true,
      roleTaskNarrowing: false,
      exactToolAndExtensionResolution: false,
      childFanoutDefaultBlocked: true,
      snapshotAndInspectorDiagnostics: true,
      reviewer: "release-owner",
      createdAt: "2026-06-05T00:04:58.000Z",
    });
    recordSubagentSecurityReviewEvidence(store, {
      status: "failed",
      reviewer: "security-owner",
      notes: "Nested fanout abuse regression still open.",
      threatModelTestCount: 7,
      createdAt: "2026-06-05T00:05:00.000Z",
    });

    expect(calls).toEqual([
      expect.objectContaining({
        kind: "restart_recovery",
        status: "failed",
        details: expect.objectContaining({
          issueCount: 1,
          issueKinds: ["active_run_interrupted"],
          issueSeverities: ["error"],
        }),
      }),
      expect.objectContaining({
        kind: "lifecycle_bug_audit",
        status: "failed",
        details: expect.objectContaining({
          p0: 1,
          p1: 2,
          totalP0P1: 3,
        }),
      }),
      expect.objectContaining({
        kind: "completion_guard_visibility",
        status: "failed",
        notes: "Reviewed completion guard visibility is missing parent blocking indicator and diagnostic history.",
        details: expect.objectContaining({
          missingSurfaces: ["parent blocking indicator", "diagnostic history"],
        }),
      }),
      expect.objectContaining({
        kind: "approval_routing_visibility",
        status: "failed",
        notes: "Reviewed child approval routing is missing scoped response persistence and parent wait resumption.",
        details: expect.objectContaining({
          missingSurfaces: ["scoped response persistence", "parent wait resumption"],
        }),
      }),
      expect.objectContaining({
        kind: "production_ui_visibility",
        status: "failed",
        notes: "Reviewed production UI visibility is missing blocking-child indicators and repair/replay panels.",
        details: expect.objectContaining({
          missingSurfaces: ["blocking-child indicators", "repair/replay panels"],
        }),
      }),
      expect.objectContaining({
        kind: "event_attribution_integrity",
        status: "failed",
        notes: "Reviewed sub-agent event attribution is missing parent mailbox attribution and tool/approval/error provenance.",
        details: expect.objectContaining({
          missingSurfaces: ["parent mailbox attribution", "tool/approval/error provenance"],
        }),
      }),
      expect.objectContaining({
        kind: "lifecycle_control_integrity",
        status: "failed",
        notes: "Reviewed sub-agent lifecycle controls are missing child-cancel isolation and close capacity/history retention.",
        details: expect.objectContaining({
          missingSurfaces: ["child-cancel isolation", "close capacity/history retention"],
        }),
      }),
      expect.objectContaining({
        kind: "retention_policy_integrity",
        status: "failed",
        notes: "Reviewed sub-agent retention policy is missing oldest-eligible cap cleanup and protected-child retention.",
        details: expect.objectContaining({
          missingSurfaces: ["oldest-eligible cap cleanup", "protected-child retention"],
        }),
      }),
      expect.objectContaining({
        kind: "tool_scope_integrity",
        status: "failed",
        notes: "Reviewed sub-agent tool scope is missing role/task narrowing and exact tool/extension resolution.",
        details: expect.objectContaining({
          missingSurfaces: ["role/task narrowing", "exact tool/extension resolution"],
        }),
      }),
      expect.objectContaining({
        kind: "security_review",
        status: "failed",
        notes: "Nested fanout abuse regression still open.",
      }),
    ]);
  });

  it("does not pass restart recovery evidence when startup reconciliation was skipped by the feature flag", () => {
    const { store, calls } = captureStore();

    const evidence = recordSubagentRestartRecoveryEvidence(store, {
      summary: restartSummary({
        issueCount: 0,
        skipped: true,
        skipReason: "ambient_subagents_disabled",
        featureFlagSnapshot: {
          schemaVersion: "ambient-feature-flags-v1",
          generatedAt: "2026-06-05T00:00:00.000Z",
          flags: {
            "ambient.subagents": {
              id: "ambient.subagents",
              enabled: false,
              source: "default",
              defaultEnabled: false,
              settingsEnabled: false,
            },
            "ambient.memory.tencentdb": {
              id: "ambient.memory.tencentdb",
              enabled: false,
              source: "default",
              defaultEnabled: false,
            },
            "ambient.slashCommands": {
              id: "ambient.slashCommands",
              enabled: false,
              source: "default",
              defaultEnabled: false,
            },
          },
        },
      }),
      reviewer: "release-owner",
      createdAt: "2026-06-05T00:01:00.000Z",
    });

    expect(evidence).toMatchObject({
      kind: "restart_recovery",
      status: "failed",
      notes: "Reviewed restart recovery was skipped because ambient.subagents was disabled.",
    });
    expect(calls[0]).toMatchObject({
      kind: "restart_recovery",
      status: "failed",
      details: expect.objectContaining({
        skipped: true,
        skipReason: "ambient_subagents_disabled",
        featureFlagSnapshot: expect.objectContaining({
          flags: expect.objectContaining({
            "ambient.subagents": expect.objectContaining({ enabled: false }),
          }),
        }),
      }),
    });
  });

  it("records workflow jitter release-profile evidence through the reviewed maturity path", () => {
    const { store, calls } = captureStore();

    const evidence = recordSubagentWorkflowJitterReleaseProfileEvidence(store, {
      report: workflowJitterReleaseProfileReport(),
      reviewer: "release-owner",
      createdAt: "2026-06-05T00:45:00.000Z",
    });

    expect(evidence).toMatchObject({
      kind: "workflow_jitter_release_profile",
      status: "passed",
      artifactPath: "test-results/workflow-jitter-release-gate/latest.json",
      reviewer: "release-owner",
      notes: "Reviewed workflow jitter release profile is ready with release-profile live evidence.",
    });
    expect(calls[0]).toMatchObject({
      kind: "workflow_jitter_release_profile",
      status: "passed",
      evidenceKey: "workflow-jitter-release-profile:2026-06-05T00:45:00.000Z",
      artifactPath: "test-results/workflow-jitter-release-gate/latest.json",
      reviewer: "release-owner",
      details: expect.objectContaining({
        evidenceType: "workflow_jitter_release_profile",
        workflowJitterReleaseProfile: expect.objectContaining({
          status: "passed",
          reportPath: "test-results/workflow-jitter-release-gate/latest.json",
        }),
        summary: expect.objectContaining({
          ready: true,
          releaseProfile: true,
          liveRequired: true,
          liveSkipped: false,
          matrixProfile: "release",
          liveDogfoodRunCount: 10,
          matrixReleaseProfileCheckPassed: true,
        }),
        failureReasons: [],
      }),
    });
  });

  it("fails workflow jitter release-profile evidence when live release coverage is incomplete", () => {
    const { store, calls } = captureStore();

    recordSubagentWorkflowJitterReleaseProfileEvidence(store, {
      report: workflowJitterReleaseProfileReport({
        status: "passed",
        releaseDecision: {
          ready: false,
          liveSkipped: true,
          blockingIssues: ["live evidence was skipped"],
        },
        matrix: {
          liveDogfoodRunCount: 0,
          liveFamilies: ["browser"],
        },
        checks: [{ id: "matrix.release-profile", status: "fail" }],
      }),
      reviewer: "release-owner",
      createdAt: "2026-06-05T00:46:00.000Z",
    });

    expect(calls[0]).toMatchObject({
      kind: "workflow_jitter_release_profile",
      status: "failed",
      notes: "Reviewed workflow jitter release profile is not ready: ready decision, non-skipped live evidence, live dogfood runs, live families model-only, local, connector, document, recovery, zero blocking issues and matrix.release-profile pass.",
      details: expect.objectContaining({
        evidenceType: "workflow_jitter_release_profile",
        summary: expect.objectContaining({
          ready: false,
          liveSkipped: true,
          liveDogfoodRunCount: 0,
          missingLiveFamilies: ["model-only", "local", "connector", "document", "recovery"],
          blockingIssueCount: 1,
          matrixReleaseProfileCheckPassed: false,
        }),
        failureReasons: [
          "ready decision",
          "non-skipped live evidence",
          "live dogfood runs",
          "live families model-only, local, connector, document, recovery",
          "zero blocking issues",
          "matrix.release-profile pass",
        ],
      }),
    });
  });

  it("requires reviewed evidence metadata and valid bug counts", () => {
    const { store } = captureStore();
    expect(() => recordSubagentRestartRecoveryEvidence(store, {
      summary: restartSummary({ issueCount: 0 }),
      reviewer: "",
    })).toThrow(/requires a reviewer/);
    expect(() => recordSubagentBugAuditEvidence(store, {
      kind: "lifecycle_bug_audit",
      p0: -1,
      p1: 0,
      reviewer: "qa-owner",
    })).toThrow(/p0 must be nonnegative/);
    expect(() => recordSubagentBugAuditEvidence(store, {
      kind: "permission_bug_audit",
      p0: 0,
      p1: Number.NaN,
      reviewer: "qa-owner",
    })).toThrow(/p1 must be a finite number/);
    expect(() => recordSubagentCompletionGuardVisibilityEvidence(store, {
      childInspector: true,
      reviewer: "",
    })).toThrow(/requires a reviewer/);
    expect(() => recordSubagentApprovalRoutingVisibilityEvidence(store, {
      childRequestAttribution: true,
      reviewer: "",
    })).toThrow(/requires a reviewer/);
    expect(() => recordSubagentProductionUiVisibilityEvidence(store, {
      collapsedParentClusters: true,
      reviewer: "",
    })).toThrow(/requires a reviewer/);
    expect(() => recordSubagentEventAttributionIntegrityEvidence(store, {
      runtimePreviewAttribution: true,
      reviewer: "",
    })).toThrow(/requires a reviewer/);
    expect(() => recordSubagentLifecycleControlIntegrityEvidence(store, {
      parentStopCascade: true,
      reviewer: "",
    })).toThrow(/requires a reviewer/);
    expect(() => recordSubagentRetentionPolicyIntegrityEvidence(store, {
      closeDoesNotDelete: true,
      reviewer: "",
    })).toThrow(/requires a reviewer/);
    expect(() => recordSubagentToolScopeIntegrityEvidence(store, {
      hardDenyPrecedence: true,
      reviewer: "",
    })).toThrow(/requires a reviewer/);
    expect(() => recordSubagentSecurityReviewEvidence(store, {
      status: "passed",
      reviewer: "security-owner",
      notes: "",
    })).toThrow(/requires notes/);
    expect(() => recordSubagentWorkflowJitterReleaseProfileEvidence(store, {
      report: workflowJitterReleaseProfileReport(),
      reviewer: "",
    })).toThrow(/requires a reviewer/);
  });
});

function captureStore(): {
  store: SubagentReviewedMaturityEvidenceStore;
  calls: Array<Parameters<SubagentReviewedMaturityEvidenceStore["recordSubagentMaturityEvidence"]>[0]>;
} {
  const calls: Array<Parameters<SubagentReviewedMaturityEvidenceStore["recordSubagentMaturityEvidence"]>[0]> = [];
  return {
    calls,
    store: {
      recordSubagentMaturityEvidence(input): SubagentMaturityEvidence {
        calls.push(input);
        return {
          schemaVersion: "ambient-subagent-maturity-evidence-v1",
          id: `${input.kind}:${input.evidenceKey ?? calls.length}`,
          kind: input.kind,
          status: input.status,
          evidenceKey: input.evidenceKey,
          artifactPath: input.artifactPath,
          reviewer: input.reviewer,
          notes: input.notes,
          details: input.details,
          createdAt: input.createdAt ?? "2026-06-05T00:00:00.000Z",
          updatedAt: input.createdAt ?? "2026-06-05T00:00:00.000Z",
        };
      },
    },
  };
}

function restartSummary(overrides: Partial<SubagentRestartReconciliationSummary>): SubagentRestartReconciliationSummary {
  return {
    schemaVersion: "ambient-subagent-restart-reconciliation-v1",
    createdAt: "2026-06-05T00:00:00.000Z",
    issueCount: 0,
    repairedRunIds: [],
    repairedBarrierIds: [],
    repairedParentControlBarrierIds: [],
    repairableSpawnEdgeRunIds: [],
    danglingSpawnEdgeRunIds: [],
    diagnosticRunIds: [],
    issues: [],
    ...overrides,
  };
}

function workflowJitterReleaseProfileReport(
  overrides: Partial<SubagentWorkflowJitterReleaseProfileReport> = {},
): SubagentWorkflowJitterReleaseProfileReport {
  const base: SubagentWorkflowJitterReleaseProfileReport = {
    schemaVersion: 1,
    status: "passed",
    generatedAt: "2026-06-05T00:40:00.000Z",
    reportPath: "test-results/workflow-jitter-release-gate/latest.json",
    matrixReportPath: "test-results/workflow-jitter-matrix/latest.json",
    releaseDecision: {
      ready: true,
      liveRequired: true,
      releaseProfile: true,
      liveSkipped: false,
      blockingIssues: [],
      advisoryIssues: [],
      nextSlice: "Workflow jitter release profile is green.",
    },
    matrix: {
      profile: "release",
      deterministicStressUnitCount: 1000,
      livePromptVariantCount: 120,
      liveDogfoodRunCount: 10,
      liveFamilies: ["browser", "connector", "document", "local", "model-only", "recovery"],
      productOrTestFailureCount: 0,
      providerDegradedCount: 0,
      environmentSkippedCount: 0,
      promotionCandidateCount: 0,
    },
    checks: [
      { id: "matrix.release-profile", status: "pass" },
    ],
  };
  return {
    ...base,
    ...overrides,
    releaseDecision: {
      ...(base.releaseDecision ?? {}),
      ...(overrides.releaseDecision ?? {}),
    },
    matrix: {
      ...(base.matrix ?? {}),
      ...(overrides.matrix ?? {}),
    },
    checks: overrides.checks ?? base.checks,
  };
}
