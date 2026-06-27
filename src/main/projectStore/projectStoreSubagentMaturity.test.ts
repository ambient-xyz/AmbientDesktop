import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { SUBAGENT_LIVE_EVIDENCE_LABELS } from "../../shared/subagentLiveEvidenceLanes";
import type { SubagentResultArtifact } from "../../shared/subagentProtocol";
import { ProjectStore } from "./projectStore";

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

async function tempWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "ambient-store-subagent-maturity-"));
  roots.push(root);
  return join(root, "workspace");
}

function batchArtifact(runId: string, status: SubagentResultArtifact["status"], childThreadId = `${runId}-thread`): SubagentResultArtifact {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId,
    status,
    partial: false,
    summary: `Result artifact for ${runId}.`,
    childThreadId,
  };
}

describe("ProjectStore sub-agent maturity evidence", () => {
  it("persists maturity evidence and feeds feature graduation gates", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const reopened = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Maturity parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Live smoke child",
        roleId: "summarizer",
        canonicalTaskPath: "root/0:summarizer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(run.id, "running", {
        now: "2026-06-05T00:00:10.000Z",
      });
      store.markSubagentRunStatus(run.id, "completed", {
        resultArtifact: batchArtifact(run.id, "completed", run.childThreadId),
        now: "2026-06-05T00:00:20.000Z",
      });
      const dogfood = store.recordSubagentMaturityEvidence({
        kind: "live_dogfood_run",
        status: "passed",
        evidenceKey: `dogfood:${run.id}`,
        runId: run.id,
        artifactPath: ".ambient/subagents/live-smoke.md",
        notes: "Live child session streamed and summarized.",
        details: {
          releaseGateHistoryEntry: releaseGateHistoryEntry(run.id),
        },
        createdAt: "2026-06-05T00:00:30.000Z",
      });
      expect(
        store.recordSubagentMaturityEvidence({
          kind: "live_dogfood_run",
          status: "passed",
          evidenceKey: `dogfood:${run.id}`,
          runId: run.id,
          artifactPath: ".ambient/subagents/live-smoke.md",
          notes: "Idempotent replay.",
          details: {
            releaseGateHistoryEntry: releaseGateHistoryEntry(run.id),
          },
          createdAt: "2026-06-05T00:00:31.000Z",
        }),
      ).toMatchObject({
        id: dogfood.id,
        notes: "Idempotent replay.",
        updatedAt: "2026-06-05T00:00:31.000Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "desktop_dogfood_run",
        status: "passed",
        evidenceKey: `desktop-dogfood:${run.id}`,
        runId: run.id,
        artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
        notes: "Full Desktop child-thread dogfood captured screenshots and visual assertions.",
        details: {
          desktopDogfoodHistoryEntry: desktopDogfoodHistoryEntry(run.id),
        },
        createdAt: "2026-06-05T00:00:31.500Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "workflow_jitter_release_profile",
        status: "passed",
        evidenceKey: "workflow-jitter-release-profile:2026-06-05",
        artifactPath: "test-results/workflow-jitter-release-gate/latest.json",
        notes: "Workflow jitter release-profile evidence passed with live GMI dogfood coverage.",
        details: {
          workflowJitterReleaseProfile: workflowJitterReleaseProfileReport(),
        },
        createdAt: "2026-06-05T00:00:31.750Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "live_pi_smoke",
        status: "passed",
        evidenceKey: `live-smoke:${run.id}`,
        runId: run.id,
        artifactPath: ".ambient/subagents/live-smoke.md",
        createdAt: "2026-06-05T00:00:32.000Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "restart_recovery",
        status: "passed",
        evidenceKey: "restart-recovery:2026-06-05",
        artifactPath: ".ambient/subagents/restart-recovery.md",
        createdAt: "2026-06-05T00:00:33.000Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "completion_guard_visibility",
        status: "passed",
        evidenceKey: "completion-guard-visibility:2026-06-05",
        artifactPath: "test-results/subagent-release-gate/latest.json",
        reviewer: "release-owner",
        details: {
          childInspector: true,
          parentBlockingIndicator: true,
          replayDiagnostics: true,
          diagnosticHistory: true,
        },
        createdAt: "2026-06-05T00:00:33.500Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "approval_routing_visibility",
        status: "passed",
        evidenceKey: "approval-routing-visibility:2026-06-05",
        artifactPath: "test-results/subagent-release-gate/latest.json",
        reviewer: "release-owner",
        details: {
          childRequestAttribution: true,
          scopedResponsePersistence: true,
          parentWaitResumption: true,
          nonInteractiveFailure: true,
          uiAndReplayVisibility: true,
        },
        createdAt: "2026-06-05T00:00:33.750Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "production_ui_visibility",
        status: "passed",
        evidenceKey: "production-ui-visibility:2026-06-05",
        artifactPath: "test-results/subagent-release-gate/latest.json",
        reviewer: "release-owner",
        details: {
          collapsedParentClusters: true,
          blockingChildIndicators: true,
          childInspectorRows: true,
          repairReplayPanels: true,
          localRuntimeOwnershipControls: true,
        },
        createdAt: "2026-06-05T00:00:33.812Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "event_attribution_integrity",
        status: "passed",
        evidenceKey: "event-attribution-integrity:2026-06-05",
        artifactPath: "test-results/subagent-release-gate/latest.json",
        reviewer: "release-owner",
        details: {
          runtimePreviewAttribution: true,
          parentMailboxAttribution: true,
          toolApprovalErrorProvenance: true,
          replayDiagnostics: true,
          largeOutputArtifactBacking: true,
        },
        createdAt: "2026-06-05T00:00:33.875Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "lifecycle_control_integrity",
        status: "passed",
        evidenceKey: "lifecycle-control-integrity:2026-06-05",
        artifactPath: "test-results/subagent-release-gate/latest.json",
        reviewer: "release-owner",
        details: {
          parentStopCascade: true,
          childCancelIsolation: true,
          closeCapacityRetention: true,
          lifecycleHookArtifacts: true,
          restartInterruptionRepair: true,
        },
        createdAt: "2026-06-05T00:00:33.937Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "retention_policy_integrity",
        status: "passed",
        evidenceKey: "retention-policy-integrity:2026-06-05",
        artifactPath: "test-results/subagent-release-gate/latest.json",
        reviewer: "release-owner",
        details: {
          closeDoesNotDelete: true,
          capCleanupOldestEligible: true,
          protectedChildrenRetained: true,
          summaryArtifactsRetained: true,
          retainedStateVisible: true,
        },
        createdAt: "2026-06-05T00:00:33.968Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "tool_scope_integrity",
        status: "passed",
        evidenceKey: "tool-scope-integrity:2026-06-05",
        artifactPath: "test-results/subagent-release-gate/latest.json",
        reviewer: "release-owner",
        details: {
          hardDenyPrecedence: true,
          roleTaskNarrowing: true,
          exactToolAndExtensionResolution: true,
          childFanoutDefaultBlocked: true,
          snapshotAndInspectorDiagnostics: true,
        },
        createdAt: "2026-06-05T00:00:33.984Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "lifecycle_bug_audit",
        status: "passed",
        evidenceKey: "lifecycle-bugs:2026-06-05",
        details: { p0: 0, p1: 0 },
        createdAt: "2026-06-05T00:00:34.000Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "permission_bug_audit",
        status: "passed",
        evidenceKey: "permission-bugs:2026-06-05",
        details: { p0: 0, p1: 0 },
        createdAt: "2026-06-05T00:00:35.000Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "security_review",
        status: "passed",
        evidenceKey: "security-review:2026-06-05",
        reviewer: "security",
        notes: "Threat-model regression coverage accepted.",
        createdAt: "2026-06-05T00:00:36.000Z",
      });

      expect(store.listSubagentMaturityEvidence("live_dogfood_run")).toEqual([
        expect.objectContaining({
          id: dogfood.id,
          kind: "live_dogfood_run",
          status: "passed",
          evidenceKey: `dogfood:${run.id}`,
          runId: run.id,
          parentRunId: "parent-run",
          notes: "Idempotent replay.",
        }),
      ]);
      expect(
        store.getSubagentMaturitySnapshot({
          createdAt: "2026-06-05T00:01:00.000Z",
          criteria: { minLiveDogfoodRuns: 1, minDesktopDogfoodRuns: 1 },
        }),
      ).toMatchObject({
        status: "ready_to_graduate",
        defaultCanBeEnabled: true,
        blockedGateIds: [],
        gates: expect.arrayContaining([
          expect.objectContaining({
            id: "live_dogfood_count",
            status: "passed",
            actual: "1 clean recorded.",
          }),
          expect.objectContaining({
            id: "live_dogfood_failure_rate",
            status: "passed",
            actual: "0/1 failed (0.0%).",
          }),
          expect.objectContaining({
            id: "live_smoke",
            status: "passed",
            actual: "Passed.",
          }),
          expect.objectContaining({
            id: "workflow_jitter_release_profile",
            status: "passed",
            actual: "10 live UI dogfood runs, 120 live prompt variants, 1000 deterministic stress units.",
          }),
          expect.objectContaining({
            id: "restart_recovery",
            status: "passed",
          }),
          expect.objectContaining({
            id: "completion_guard_visibility",
            status: "passed",
            actual: "Validated across child inspector, parent blocking indicators, replay diagnostics, and diagnostic history.",
          }),
          expect.objectContaining({
            id: "approval_routing_visibility",
            status: "passed",
            actual:
              "Validated child request attribution, scoped response persistence, parent wait resumption, non-interactive failure handling, and UI/replay visibility.",
          }),
          expect.objectContaining({
            id: "production_ui_visibility",
            status: "passed",
            actual:
              "Validated collapsed parent clusters, blocking-child indicators, child inspector rows, repair/replay panels, and local runtime ownership controls.",
          }),
          expect.objectContaining({
            id: "event_attribution_integrity",
            status: "passed",
            actual:
              "Validated runtime preview attribution, parent mailbox attribution, tool/approval/error provenance, replay diagnostics, and large-output artifact backing.",
          }),
          expect.objectContaining({
            id: "lifecycle_control_integrity",
            status: "passed",
            actual:
              "Validated parent-stop cascade, child-cancel isolation, close capacity/history retention, lifecycle hook artifacts, and restart interruption repair.",
          }),
          expect.objectContaining({
            id: "retention_policy_integrity",
            status: "passed",
            actual:
              "Validated close-without-delete, oldest-eligible cap cleanup, protected-child retention, summary/artifact durability, and retained-state UI.",
          }),
          expect.objectContaining({
            id: "tool_scope_integrity",
            status: "passed",
            actual:
              "Validated hard-deny precedence, role/task narrowing, exact tool/extension resolution, child fanout default blocking, and snapshot/inspector diagnostics.",
          }),
          expect.objectContaining({
            id: "security_review",
            status: "passed",
            detail: "Threat-model regression coverage accepted.",
          }),
        ]),
      });
      store.close();

      reopened.openWorkspace(workspacePath);
      expect(reopened.listSubagentMaturityEvidence().map((evidence) => evidence.kind)).toEqual([
        "live_dogfood_run",
        "desktop_dogfood_run",
        "workflow_jitter_release_profile",
        "live_pi_smoke",
        "restart_recovery",
        "completion_guard_visibility",
        "approval_routing_visibility",
        "production_ui_visibility",
        "event_attribution_integrity",
        "lifecycle_control_integrity",
        "retention_policy_integrity",
        "tool_scope_integrity",
        "lifecycle_bug_audit",
        "permission_bug_audit",
        "security_review",
      ]);
      expect(
        reopened.getSubagentMaturitySnapshot({
          createdAt: "2026-06-05T00:02:00.000Z",
          criteria: { minLiveDogfoodRuns: 1, minDesktopDogfoodRuns: 1 },
        }).defaultCanBeEnabled,
      ).toBe(true);
    } finally {
      store.close();
      reopened.close();
    }
  });

  it("counts clean required-live history rows instead of raw live dogfood evidence when both exist", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);

      for (let index = 0; index < 25; index += 1) {
        store.recordSubagentMaturityEvidence({
          kind: "live_dogfood_run",
          status: "passed",
          evidenceKey: `narrow-live-confidence:${index}`,
          artifactPath: `test-results/subagent-live-confidence/narrow-${index}.json`,
          notes: "Narrow per-slice live confidence evidence should not count as a clean required-live release gate run.",
          details: {
            schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
            evidenceType: "live_confidence_slice",
            sliceKind: "workflow_symphony",
            status: "passed",
          },
          createdAt: `2026-06-05T00:${String(index).padStart(2, "0")}:00.000Z`,
        });
      }
      store.recordSubagentMaturityEvidence({
        kind: "live_dogfood_run",
        status: "passed",
        evidenceKey: "required-live-history:clean-one",
        artifactPath: "test-results/subagent-release-gate/latest.json",
        details: {
          releaseGateHistoryEntry: releaseGateHistoryEntry("clean-one"),
        },
        createdAt: "2026-06-05T01:00:00.000Z",
      });

      const snapshot = store.getSubagentMaturitySnapshot({
        createdAt: "2026-06-05T01:01:00.000Z",
        criteria: { minLiveDogfoodRuns: 2 },
      });

      expect(snapshot.liveHistory).toMatchObject({
        requiredRunCount: 1,
        cleanRequiredRunCount: 1,
        failedRequiredRunCount: 0,
      });
      expect(snapshot.gates).toContainEqual(
        expect.objectContaining({
          id: "live_dogfood_count",
          status: "blocked",
          actual: "1 clean recorded.",
          detail: "Required-live history: 1 clean, 0 failed, 0 advisory, 0 skipped-evidence.",
        }),
      );
    } finally {
      store.close();
    }
  });
});

function releaseGateHistoryEntry(runId: string) {
  return {
    schemaVersion: "ambient-subagent-release-gate-live-history-v1",
    runId: `release-gate:${runId}`,
    reportPath: "test-results/subagent-release-gate/latest.json",
    status: "passed",
    ready: true,
    liveRequired: true,
    startedAt: "2026-06-05T00:00:20.000Z",
    completedAt: "2026-06-05T00:00:31.000Z",
    durationMs: 11_000,
    checkCounts: { passed: 113 },
    liveEvidence: Object.fromEntries(SUBAGENT_LIVE_EVIDENCE_LABELS.map((label) => [label, "present"])),
    skippedLiveEvidence: [],
    blockingIssueCount: 0,
    advisoryIssueCount: 0,
  };
}

function desktopDogfoodHistoryEntry(runId: string) {
  return {
    schemaVersion: "ambient-subagent-desktop-dogfood-history-v1",
    runId: `desktop-dogfood:${runId}`,
    reportPath: "test-results/subagent-desktop-dogfood/latest.json",
    status: "passed",
    classification: "passed",
    ready: true,
    generatedAt: "2026-06-05T00:00:31.500Z",
    provider: "gmi-cloud",
    featureFlag: "ambient.subagents",
    scenarioCount: 14,
    scenarios: ["seeded_visible_child_cluster", "approval_parent_blocking", "workflow_high_load_dogfood"],
    requiredScenarioMissing: [],
    visualAssertionSummary: { requiredCount: 10, passedCount: 10, failedCount: 0, missingCount: 0 },
    maturityAssertionSummary: { requiredCount: 13, passedCount: 13, failedCount: 0, missingCount: 0 },
    screenshotCount: 12,
    criticalOverlapCount: 0,
    horizontalOverflowFree: true,
    workflowHighLoadPatternCount: 6,
    blockingIssueCount: 0,
    advisoryIssueCount: 0,
  };
}

function workflowJitterReleaseProfileReport() {
  return {
    schemaVersion: 1,
    status: "passed",
    generatedAt: "2026-06-05T00:40:00.000Z",
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
    checks: [{ id: "matrix.release-profile", status: "pass" }],
  };
}
