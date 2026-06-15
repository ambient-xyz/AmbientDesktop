import { describe, expect, it } from "vitest";
import type { SubagentMaturityEvidence } from "../shared/subagentMaturity";
import {
  createSubagentLiveConfidenceEvidence,
  type SubagentLiveConfidenceEvidence,
  type SubagentLiveConfidenceMaturityAssertion,
  type SubagentLiveConfidenceSliceKind,
} from "./subagentLiveConfidenceEvidence";
import {
  recordSubagentLiveConfidenceMaturityEvidence,
  type SubagentLiveConfidenceMaturityEvidenceStore,
} from "./subagentLiveConfidenceMaturityEvidence";

describe("subagentLiveConfidenceMaturityEvidence", () => {
  it("records passed restart repair live confidence as restart recovery maturity evidence", () => {
    const { store, calls } = captureStore();
    const evidence = liveConfidenceEvidence("restart_repair", restartRepairAssertions());

    const record = recordSubagentLiveConfidenceMaturityEvidence(store, {
      evidence,
      artifactPath: "test-results/subagent-live-confidence/restart-repair-latest.json",
      createdAt: "2026-06-12T10:00:00.000Z",
    });

    expect(record).toMatchObject({
      schemaVersion: "ambient-subagent-live-confidence-maturity-evidence-v1",
      status: "recorded",
      targetKinds: ["restart_recovery"],
      issues: [],
      maturityEvidence: [expect.objectContaining({
        kind: "restart_recovery",
        status: "passed",
      })],
    });
    expect(calls).toEqual([
      expect.objectContaining({
        kind: "restart_recovery",
        status: "passed",
        evidenceKey: "live-confidence:restart_recovery:restart_repair-slice",
        artifactPath: "test-results/subagent-live-confidence/restart-repair-latest.json",
        reviewer: "live-confidence-runner",
        notes: "Live confidence restart_repair evidence passed and records restart recovery maturity proof.",
        details: expect.objectContaining({
          schemaVersion: "ambient-subagent-live-confidence-maturity-evidence-v1",
          evidenceType: "restart_recovery",
          sourceEvidenceType: "live_confidence",
          liveConfidenceSliceKind: "restart_repair",
          runtimeEventReplay: true,
          childTreeRepair: true,
          mailboxRehydration: true,
          artifactPointerRehydration: true,
          lifecycleEdgeCoverage: true,
          synthesisSafety: true,
          passedMaturityAssertionIds: restartRepairAssertions().map((assertion) => assertion.id).sort(),
          missingRequiredAssertionIds: [],
        }),
      }),
    ]);
  });

  it("records lifecycle edge live confidence with the booleans consumed by maturity gates", () => {
    const { store, calls } = captureStore();

    recordSubagentLiveConfidenceMaturityEvidence(store, {
      evidence: liveConfidenceEvidence("lifecycle_edges", lifecycleEdgeAssertions()),
      artifactPath: "test-results/subagent-live-confidence/lifecycle-edges-latest.json",
      reviewer: "release-bot",
      createdAt: "2026-06-12T10:01:00.000Z",
    });

    expect(calls[0]).toMatchObject({
      kind: "lifecycle_control_integrity",
      status: "passed",
      reviewer: "release-bot",
      details: expect.objectContaining({
        parentStopCascade: true,
        childCancelIsolation: true,
        closeCapacityRetention: true,
        lifecycleHookArtifacts: true,
        restartInterruptionRepair: true,
        childRetryRecovery: true,
        requiredAssertionIds: lifecycleEdgeAssertions().map((assertion) => assertion.id),
      }),
    });
  });

  it("records Desktop dogfood live confidence as production UI visibility maturity evidence", () => {
    const { store, calls } = captureStore();

    recordSubagentLiveConfidenceMaturityEvidence(store, {
      evidence: liveConfidenceEvidence("desktop_dogfood", desktopDogfoodAssertions()),
      artifactPath: "test-results/subagent-live-confidence/desktop-dogfood-latest.json",
      createdAt: "2026-06-12T10:02:00.000Z",
    });

    expect(calls[0]).toMatchObject({
      kind: "production_ui_visibility",
      status: "passed",
      details: expect.objectContaining({
        collapsedParentClusters: true,
        blockingChildIndicators: true,
        childInspectorRows: true,
        repairReplayPanels: true,
        localRuntimeOwnershipControls: true,
      }),
    });
  });

  it("records failed mapped maturity evidence when live confidence is not release usable", () => {
    const { store, calls } = captureStore();
    const evidence = createSubagentLiveConfidenceEvidence({
      sliceId: "lifecycle_edges-slice",
      sliceKind: "lifecycle_edges",
      status: "failed",
      hypothesis: "Lifecycle edge live proof should fail visibly.",
      expectedObservation: "The lifecycle edge artifact reports a product issue.",
      actualOutcome: "The lifecycle edge artifact found a partial-result synthesis problem.",
      confidenceDelta: "decreased",
      followUp: "Fix partial-result synthesis and rerun lifecycle edge confidence.",
      closeoutAnswer: {
        kind: "saw_live",
        summary: "The lifecycle edge path failed in live confidence.",
      },
      startedAt: "2026-06-12T10:03:00.000Z",
      completedAt: "2026-06-12T10:03:30.000Z",
      provider: { kind: "gmi-cloud", providerId: "gmi-cloud", usingGmiOverride: true },
      featureFlagSnapshot: { ambientSubagentsEnabled: true, source: "test_override" },
      artifacts: [{ label: "lifecycle edge evidence", path: "test-results/subagent-live-confidence/lifecycle-edges-latest.json", kind: "json" }],
      maturityAssertions: [
        assertion("lifecycle_edge_stop", "Lifecycle edge stop", "passed"),
        assertion("lifecycle_edge_partial_result", "Lifecycle edge partial result", "failed"),
      ],
      productIssues: [{ severity: "p2", summary: "Partial result was not clearly marked." }],
    });

    const record = recordSubagentLiveConfidenceMaturityEvidence(store, { evidence });

    expect(record).toMatchObject({
      status: "failed",
      targetKinds: ["lifecycle_control_integrity"],
      issues: ["Live confidence evidence acceptance is advisory_only; expected release_usable."],
    });
    expect(calls[0]).toMatchObject({
      kind: "lifecycle_control_integrity",
      status: "failed",
      artifactPath: "test-results/subagent-live-confidence/lifecycle-edges-latest.json",
      details: expect.objectContaining({
        parentStopCascade: true,
        childCancelIsolation: false,
        closeCapacityRetention: false,
        lifecycleHookArtifacts: false,
        restartInterruptionRepair: false,
        childRetryRecovery: false,
        failedMaturityAssertionIds: ["lifecycle_edge_partial_result"],
        missingRequiredAssertionIds: expect.arrayContaining([
          "lifecycle_edge_restart",
          "lifecycle_edge_cancel",
          "lifecycle_edge_retry",
          "lifecycle_edge_timeout",
          "lifecycle_edge_synthesis_safety",
        ]),
      }),
    });
  });

  it("does not create maturity evidence for live confidence slices without a direct maturity-gate mapping", () => {
    const { store, calls } = captureStore();
    const record = recordSubagentLiveConfidenceMaturityEvidence(store, {
      evidence: liveConfidenceEvidence("workflow_symphony", [
        assertion("live_workflow_run", "Live workflow run"),
        assertion("child_mutating_workflow", "Child mutating workflow"),
        assertion("workflow_task_artifact_rehydration", "Workflow task artifact rehydration"),
        assertion("broader_workflow_ui_dogfood", "Broader workflow UI dogfood"),
      ], "workflow_symphony-slice"),
    });

    expect(record).toMatchObject({
      status: "not_applicable",
      targetKinds: [],
      maturityEvidence: [],
      issues: ["Live confidence slice kind workflow_symphony does not map directly to a maturity gate."],
    });
    expect(calls).toEqual([]);
  });
});

function captureStore(): {
  store: SubagentLiveConfidenceMaturityEvidenceStore;
  calls: Array<Parameters<SubagentLiveConfidenceMaturityEvidenceStore["recordSubagentMaturityEvidence"]>[0]>;
} {
  const calls: Array<Parameters<SubagentLiveConfidenceMaturityEvidenceStore["recordSubagentMaturityEvidence"]>[0]> = [];
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
          createdAt: input.createdAt ?? "2026-06-12T10:00:00.000Z",
          updatedAt: input.createdAt ?? "2026-06-12T10:00:00.000Z",
        };
      },
    },
  };
}

function liveConfidenceEvidence(
  sliceKind: SubagentLiveConfidenceSliceKind,
  maturityAssertions: SubagentLiveConfidenceMaturityAssertion[],
  sliceId = `${sliceKind}-slice`,
): SubagentLiveConfidenceEvidence {
  return createSubagentLiveConfidenceEvidence({
    sliceId,
    sliceKind,
    status: "passed",
    hypothesis: `${sliceKind} should produce release-usable live confidence evidence.`,
    expectedObservation: "The changed live surface is observed with ambient.subagents enabled.",
    actualOutcome: "The changed live surface passed with sanitized artifacts.",
    confidenceDelta: "increased",
    followUp: "Keep accumulating repeated live confidence before graduation.",
    closeoutAnswer: {
      kind: "saw_live",
      summary: "The live confidence path was observed.",
    },
    startedAt: "2026-06-12T10:00:00.000Z",
    completedAt: "2026-06-12T10:00:30.000Z",
    provider: { kind: "gmi-cloud", providerId: "gmi-cloud", usingGmiOverride: true },
    featureFlagSnapshot: { ambientSubagentsEnabled: true, source: "test_override" },
    capabilitiesObserved: ["subagent_live_confidence"],
    maturityAssertions,
    artifacts: [{ label: "live confidence evidence", path: `test-results/subagent-live-confidence/${sliceId}.json`, kind: "json" }],
    observations: [{ label: "live confidence", result: "passed" }],
  });
}

function restartRepairAssertions(): SubagentLiveConfidenceMaturityAssertion[] {
  return [
    assertion("restart_repair_runtime_event_replay", "Restart repair runtime event replay"),
    assertion("restart_repair_child_tree_repair", "Restart repair child tree repair"),
    assertion("restart_repair_mailbox_rehydration", "Restart repair mailbox rehydration"),
    assertion("restart_repair_artifact_pointer_rehydration", "Restart repair artifact pointer rehydration"),
    assertion("restart_repair_lifecycle_edge_coverage", "Restart repair lifecycle edge coverage"),
    assertion("restart_repair_synthesis_safety", "Restart repair synthesis safety"),
  ];
}

function lifecycleEdgeAssertions(): SubagentLiveConfidenceMaturityAssertion[] {
  return [
    assertion("lifecycle_edge_restart", "Lifecycle edge restart"),
    assertion("lifecycle_edge_stop", "Lifecycle edge stop"),
    assertion("lifecycle_edge_detach", "Lifecycle edge detach"),
    assertion("lifecycle_edge_cancel", "Lifecycle edge cancel"),
    assertion("lifecycle_edge_retry", "Lifecycle edge retry"),
    assertion("lifecycle_edge_timeout", "Lifecycle edge timeout"),
    assertion("lifecycle_edge_partial_result", "Lifecycle edge partial result"),
    assertion("lifecycle_edge_synthesis_safety", "Lifecycle edge synthesis safety"),
  ];
}

function desktopDogfoodAssertions(): SubagentLiveConfidenceMaturityAssertion[] {
  return [
    assertion("desktop_dogfood_scenario_coverage", "Desktop dogfood scenario coverage", "passed", ["electron_desktop_dogfood"]),
    assertion("desktop_dogfood_visual_layout", "Desktop dogfood visual layout", "passed", ["production_ui_visibility", "layout_safety"]),
    assertion("desktop_dogfood_lifecycle_edges", "Desktop dogfood lifecycle edges", "passed", ["lifecycle_edges"]),
    assertion("desktop_dogfood_runtime_and_operator_controls", "Desktop dogfood runtime and operator controls", "passed", ["local_runtime_ownership"]),
  ];
}

function assertion(
  id: string,
  label: string,
  status: SubagentLiveConfidenceMaturityAssertion["status"] = "passed",
  capabilities: string[] = ["subagent_live_confidence"],
): SubagentLiveConfidenceMaturityAssertion {
  return {
    id,
    label,
    status,
    capabilities,
    evidence: [`${label} evidence.`],
  };
}
