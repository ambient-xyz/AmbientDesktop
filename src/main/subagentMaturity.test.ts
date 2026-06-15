import { describe, expect, it } from "vitest";
import { resolveAmbientFeatureFlags } from "../shared/featureFlags";
import { SUBAGENT_LIVE_EVIDENCE_LABELS } from "../shared/subagentLiveEvidenceLanes";
import type {
  SubagentDesktopDogfoodHistoryEntry,
  SubagentReleaseGateLiveHistoryEntry,
  SubagentWorkflowJitterReleaseProfileReport,
} from "../shared/subagentMaturity";
import type { SubagentRestartReconciliationSummary } from "../shared/types";
import type { SubagentObservabilitySummary } from "./subagentObservability";
import {
  evaluateSubagentMaturity,
  summarizeSubagentDesktopDogfoodHistory,
  summarizeSubagentReleaseGateLiveHistory,
  summarizeSubagentWorkflowJitterReleaseProfile,
} from "./subagentMaturity";

describe("sub-agent maturity gates", () => {
  it("fails closed when maturity evidence is missing", () => {
    const snapshot = evaluateSubagentMaturity({ createdAt: "2026-06-05T00:00:00.000Z" });

    expect(snapshot).toMatchObject({
      schemaVersion: "ambient-subagent-maturity-v1",
      status: "blocked",
      defaultCanBeEnabled: false,
      warningGateIds: ["feature_flag_guarded"],
      blockedGateIds: [
        "live_dogfood_count",
        "live_dogfood_failure_rate",
        "desktop_dogfood_count",
        "desktop_dogfood_failure_rate",
        "workflow_jitter_release_profile",
        "live_smoke",
        "failure_rate",
        "restart_recovery",
        "completion_guard_visibility",
        "approval_routing_visibility",
        "production_ui_visibility",
        "event_attribution_integrity",
        "lifecycle_control_integrity",
        "retention_policy_integrity",
        "tool_scope_integrity",
        "security_review",
      ],
    });
  });

  it("marks the default ready only when every maturity gate passes", () => {
    const snapshot = evaluateSubagentMaturity({
      createdAt: "2026-06-05T00:00:00.000Z",
      featureFlags: resolveAmbientFeatureFlags({ generatedAt: "2026-06-05T00:00:00.000Z" }),
      observability: observability({ spawnAttempts: 30, failedSpawns: 1 }),
      restartReconciliation: restartReconciliation({ issueCount: 0 }),
      liveReleaseGateHistory: liveReleaseGateHistory(30),
      desktopDogfoodHistory: desktopDogfoodHistory(30),
      workflowJitterReleaseProfile: workflowJitterReleaseProfileReport(),
      restartRecoveryValidated: true,
      completionGuardVisibilityValidated: true,
      completionGuardVisibility: completionGuardVisibility(),
      approvalRoutingVisibilityValidated: true,
      approvalRoutingVisibility: approvalRoutingVisibility(),
      productionUiVisibilityValidated: true,
      productionUiVisibility: productionUiVisibility(),
      eventAttributionIntegrityValidated: true,
      eventAttributionIntegrity: eventAttributionIntegrity(),
      lifecycleControlIntegrityValidated: true,
      lifecycleControlIntegrity: lifecycleControlIntegrity(),
      retentionPolicyIntegrityValidated: true,
      retentionPolicyIntegrity: retentionPolicyIntegrity(),
      toolScopeIntegrityValidated: true,
      toolScopeIntegrity: toolScopeIntegrity(),
      lifecycleBugs: { p0: 0, p1: 0 },
      permissionBugs: { p0: 0, p1: 0 },
      securityReview: { status: "passed", reviewedAt: "2026-06-05T00:00:00.000Z" },
    });

    expect(snapshot).toMatchObject({
      status: "ready_to_graduate",
      defaultCanBeEnabled: true,
      blockedGateIds: [],
      warningGateIds: [],
      liveHistory: {
        requiredRunCount: 30,
        cleanRequiredRunCount: 30,
        failedRequiredRunCount: 0,
        livePiSmokePassed: true,
        failureRate: 0,
        latestCompletedAt: "2026-06-05T00:30:00.000Z",
        evidenceLanes: expect.arrayContaining([
          expect.objectContaining({
            label: "Broader Workflow/Symphony confidence",
            presentRunCount: 30,
            skippedRunCount: 0,
            latestStatus: "present",
            latestCompletedAt: "2026-06-05T00:30:00.000Z",
          }),
          expect.objectContaining({
            label: "Desktop dogfood confidence",
            presentRunCount: 30,
            skippedRunCount: 0,
            latestStatus: "present",
            latestCompletedAt: "2026-06-05T00:30:00.000Z",
          }),
        ]),
      },
      desktopDogfoodHistory: {
        totalRunCount: 30,
        readyRunCount: 30,
        failedRunCount: 0,
        visualFailureRunCount: 0,
        maturityFailureRunCount: 0,
        highLoadReadyRunCount: 30,
        failureRate: 0,
        latestGeneratedAt: "2026-06-05T00:30:00.000Z",
      },
      workflowJitterReleaseProfile: {
        ready: true,
        status: "passed",
        releaseProfile: true,
        liveRequired: true,
        liveSkipped: false,
        matrixProfile: "release",
        deterministicStressUnitCount: 1000,
        livePromptVariantCount: 120,
        liveDogfoodRunCount: 10,
        missingLiveFamilies: [],
        blockingIssueCount: 0,
        matrixReleaseProfileCheckPassed: true,
      },
      summary: "Sub-agent maturity gates are satisfied; the feature can be considered for default enablement.",
    });
  });

  it("derives dogfood volume, smoke, and live failure rate from release-gate history rows", () => {
    const history = [
      ...liveReleaseGateHistory(2),
      liveReleaseGateHistoryRow({
        runId: "failed-1",
        status: "attention",
        ready: false,
        blockingIssueCount: 1,
        completedAt: "2026-06-05T01:00:00.000Z",
      }),
      liveReleaseGateHistoryRow({
        runId: "advisory-1",
        status: "passed_with_advisories",
        advisoryIssueCount: 1,
        completedAt: "2026-06-05T01:05:00.000Z",
      }),
      liveReleaseGateHistoryRow({
        runId: "deterministic",
        liveRequired: false,
        completedAt: "2026-06-05T01:10:00.000Z",
      }),
    ];

    expect(summarizeSubagentReleaseGateLiveHistory(history)).toEqual({
      totalRunCount: 5,
      requiredRunCount: 4,
      cleanRequiredRunCount: 2,
      failedRequiredRunCount: 1,
      advisoryRequiredRunCount: 1,
      skippedEvidenceRunCount: 0,
      livePiSmokePassed: true,
      evidenceLanes: expect.arrayContaining([
        expect.objectContaining({
          label: "Broader Workflow/Symphony confidence",
          presentRunCount: 4,
          skippedRunCount: 0,
          latestStatus: "present",
          latestCompletedAt: "2026-06-05T01:05:00.000Z",
        }),
        expect.objectContaining({
          label: "Desktop dogfood confidence",
          presentRunCount: 4,
          skippedRunCount: 0,
          latestStatus: "present",
          latestCompletedAt: "2026-06-05T01:05:00.000Z",
        }),
      ]),
      failureRate: 0.25,
      latestCompletedAt: "2026-06-05T01:05:00.000Z",
    });
  });

  it("treats release-gate history missing Desktop dogfood confidence as skipped evidence", () => {
    const summary = summarizeSubagentReleaseGateLiveHistory([
      liveReleaseGateHistoryRow({
        liveEvidence: {
          "Ambient/Pi smoke": "present",
          "Sub-agent confidence": "present",
          "Workflow/Symphony confidence": "present",
          "Broader Workflow/Symphony confidence": "present",
          "Local runtime confidence": "present",
          "Restart repair confidence": "present",
          "Lifecycle edge confidence": "present",
          "Desktop dogfood": "present",
        },
        skippedLiveEvidence: [],
      }),
    ]);

    expect(summary).toMatchObject({
      requiredRunCount: 1,
      cleanRequiredRunCount: 0,
      failedRequiredRunCount: 1,
      skippedEvidenceRunCount: 1,
      failureRate: 1,
    });
    expect(summary.evidenceLanes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Desktop dogfood confidence",
        presentRunCount: 0,
        skippedRunCount: 1,
        latestStatus: "skipped",
      }),
    ]));
  });

  it("derives Desktop dogfood volume, visual failures, and failure rate from full-app history rows", () => {
    const history = [
      ...desktopDogfoodHistory(2),
      desktopDogfoodHistoryRow({
        runId: "desktop-failed-1",
        status: "failed",
        classification: "failed",
        ready: false,
        blockingIssueCount: 1,
        visualAssertionSummary: assertionSummary({ requiredCount: 10, passedCount: 9, failedCount: 1 }),
        maturityAssertionSummary: assertionSummary({ requiredCount: 13, passedCount: 12, failedCount: 1 }),
        generatedAt: "2026-06-05T01:00:00.000Z",
      }),
      desktopDogfoodHistoryRow({
        runId: "desktop-advisory-1",
        ready: true,
        status: "passed_with_advisories",
        classification: "passed",
        advisoryIssueCount: 1,
        generatedAt: "2026-06-05T01:05:00.000Z",
      }),
    ];

    expect(summarizeSubagentDesktopDogfoodHistory(history)).toEqual({
      totalRunCount: 4,
      readyRunCount: 2,
      failedRunCount: 1,
      advisoryRunCount: 1,
      visualFailureRunCount: 1,
      maturityFailureRunCount: 1,
      highLoadReadyRunCount: 2,
      screenshotRunCount: 4,
      failureRate: 0.25,
      latestGeneratedAt: "2026-06-05T01:05:00.000Z",
    });
  });

  it("derives workflow jitter release-profile maturity from the release gate report", () => {
    expect(summarizeSubagentWorkflowJitterReleaseProfile(workflowJitterReleaseProfileReport())).toMatchObject({
      ready: true,
      status: "passed",
      schemaVersion: 1,
      releaseProfile: true,
      liveRequired: true,
      liveSkipped: false,
      matrixProfile: "release",
      deterministicStressUnitCount: 1000,
      livePromptVariantCount: 120,
      liveDogfoodRunCount: 10,
      liveFamilies: ["browser", "connector", "document", "local", "model-only", "recovery"],
      missingLiveFamilies: [],
      productOrTestFailureCount: 0,
      providerDegradedCount: 0,
      environmentSkippedCount: 0,
      promotionCandidateCount: 0,
      blockingIssueCount: 0,
      advisoryIssueCount: 0,
      matrixReleaseProfileCheckPassed: true,
      latestGeneratedAt: "2026-06-05T00:40:00.000Z",
      reportPath: "test-results/workflow-jitter-release-gate/latest.json",
    });
  });

  it("blocks graduation when workflow jitter evidence is not strict release-profile coverage", () => {
    const snapshot = evaluateSubagentMaturity({
      createdAt: "2026-06-05T00:00:00.000Z",
      featureFlags: resolveAmbientFeatureFlags({ generatedAt: "2026-06-05T00:00:00.000Z" }),
      observability: observability({ spawnAttempts: 30, failedSpawns: 0 }),
      restartReconciliation: restartReconciliation({ issueCount: 0 }),
      liveReleaseGateHistory: liveReleaseGateHistory(30),
      desktopDogfoodHistory: desktopDogfoodHistory(30),
      workflowJitterReleaseProfile: workflowJitterReleaseProfileReport({
        releaseDecision: {
          releaseProfile: false,
          liveSkipped: true,
          blockingIssues: ["strict release profile requires release coverage"],
        },
        matrix: {
          profile: "phase8-smoke",
          liveDogfoodRunCount: 4,
          liveFamilies: ["browser", "document", "local", "model-only", "recovery"],
          environmentSkippedCount: 1,
        },
        checks: [{ id: "matrix.release-profile", status: "fail" }],
      }),
      restartRecoveryValidated: true,
      completionGuardVisibilityValidated: true,
      completionGuardVisibility: completionGuardVisibility(),
      approvalRoutingVisibilityValidated: true,
      approvalRoutingVisibility: approvalRoutingVisibility(),
      productionUiVisibilityValidated: true,
      productionUiVisibility: productionUiVisibility(),
      eventAttributionIntegrityValidated: true,
      eventAttributionIntegrity: eventAttributionIntegrity(),
      lifecycleControlIntegrityValidated: true,
      lifecycleControlIntegrity: lifecycleControlIntegrity(),
      retentionPolicyIntegrityValidated: true,
      retentionPolicyIntegrity: retentionPolicyIntegrity(),
      toolScopeIntegrityValidated: true,
      toolScopeIntegrity: toolScopeIntegrity(),
      lifecycleBugs: { p0: 0, p1: 0 },
      permissionBugs: { p0: 0, p1: 0 },
      securityReview: { status: "passed", reviewedAt: "2026-06-05T00:00:00.000Z" },
    });

    expect(snapshot.blockedGateIds).toEqual(["workflow_jitter_release_profile"]);
    expect(snapshot.workflowJitterReleaseProfile).toMatchObject({
      ready: false,
      releaseProfile: false,
      liveSkipped: true,
      matrixProfile: "phase8-smoke",
      liveDogfoodRunCount: 4,
      missingLiveFamilies: ["connector"],
      environmentSkippedCount: 1,
      blockingIssueCount: 1,
      matrixReleaseProfileCheckPassed: false,
    });
    expect(snapshot.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "workflow_jitter_release_profile",
        status: "blocked",
        actual: "Not ready: status passed, profile phase8-smoke, live runs 4/10, prompt variants 120/120, deterministic stress 1000/1000.",
      }),
    ]));
  });

  it("blocks graduation when required-live history is too sparse or flaky", () => {
    const snapshot = evaluateSubagentMaturity({
      createdAt: "2026-06-05T00:00:00.000Z",
      featureFlags: resolveAmbientFeatureFlags({ generatedAt: "2026-06-05T00:00:00.000Z" }),
      observability: observability({ spawnAttempts: 30, failedSpawns: 0 }),
      restartReconciliation: restartReconciliation({ issueCount: 0 }),
      criteria: { minLiveDogfoodRuns: 3, maxLiveDogfoodFailureRate: 0.1 },
      liveReleaseGateHistory: [
        liveReleaseGateHistoryRow({ runId: "clean-1" }),
        liveReleaseGateHistoryRow({
          runId: "failed-1",
          status: "attention",
          ready: false,
          blockingIssueCount: 1,
        }),
      ],
      desktopDogfoodHistory: desktopDogfoodHistory(30),
      workflowJitterReleaseProfile: workflowJitterReleaseProfileReport(),
      restartRecoveryValidated: true,
      completionGuardVisibilityValidated: true,
      completionGuardVisibility: completionGuardVisibility(),
      approvalRoutingVisibilityValidated: true,
      approvalRoutingVisibility: approvalRoutingVisibility(),
      productionUiVisibilityValidated: true,
      productionUiVisibility: productionUiVisibility(),
      eventAttributionIntegrityValidated: true,
      eventAttributionIntegrity: eventAttributionIntegrity(),
      lifecycleControlIntegrityValidated: true,
      lifecycleControlIntegrity: lifecycleControlIntegrity(),
      retentionPolicyIntegrityValidated: true,
      retentionPolicyIntegrity: retentionPolicyIntegrity(),
      toolScopeIntegrityValidated: true,
      toolScopeIntegrity: toolScopeIntegrity(),
      lifecycleBugs: { p0: 0, p1: 0 },
      permissionBugs: { p0: 0, p1: 0 },
      securityReview: { status: "passed", reviewedAt: "2026-06-05T00:00:00.000Z" },
    });

    expect(snapshot.blockedGateIds).toEqual(["live_dogfood_count", "live_dogfood_failure_rate"]);
    expect(snapshot.liveHistory).toMatchObject({
      requiredRunCount: 2,
      cleanRequiredRunCount: 1,
      failedRequiredRunCount: 1,
      failureRate: 0.5,
    });
    expect(snapshot.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "live_dogfood_count",
        actual: "1 clean recorded.",
        detail: "Required-live history: 1 clean, 1 failed, 0 advisory, 0 skipped-evidence.",
      }),
      expect.objectContaining({
        id: "live_dogfood_failure_rate",
        actual: "1/2 failed (50%).",
      }),
    ]));
  });

  it("blocks default enablement on failure rate, restart issues, severe bugs, or missing security signoff", () => {
    const snapshot = evaluateSubagentMaturity({
      featureFlags: resolveAmbientFeatureFlags(),
      observability: observability({ spawnAttempts: 20, failedSpawns: 3 }),
      restartReconciliation: restartReconciliation({ issueCount: 2 }),
      liveReleaseGateHistory: liveReleaseGateHistory(25),
      desktopDogfoodHistory: desktopDogfoodHistory(25),
      workflowJitterReleaseProfile: workflowJitterReleaseProfileReport(),
      restartRecoveryValidated: true,
      completionGuardVisibilityValidated: true,
      completionGuardVisibility: completionGuardVisibility(),
      approvalRoutingVisibilityValidated: true,
      approvalRoutingVisibility: approvalRoutingVisibility(),
      productionUiVisibilityValidated: true,
      productionUiVisibility: productionUiVisibility(),
      eventAttributionIntegrityValidated: true,
      eventAttributionIntegrity: eventAttributionIntegrity(),
      lifecycleControlIntegrityValidated: true,
      lifecycleControlIntegrity: lifecycleControlIntegrity(),
      retentionPolicyIntegrityValidated: true,
      retentionPolicyIntegrity: retentionPolicyIntegrity(),
      toolScopeIntegrityValidated: true,
      toolScopeIntegrity: toolScopeIntegrity(),
      lifecycleBugs: { p0: 1, p1: 0 },
      permissionBugs: { p0: 0, p1: 1 },
      securityReview: { status: "not_started" },
    });

    expect(snapshot.status).toBe("blocked");
    expect(snapshot.blockedGateIds).toEqual([
      "failure_rate",
      "restart_recovery",
      "unresolved_lifecycle_bugs",
      "unresolved_permission_bugs",
      "security_review",
    ]);
  });

  it("blocks if the sub-agent feature default is enabled before graduation evidence is proven", () => {
    const featureFlags = resolveAmbientFeatureFlags();
    const snapshot = evaluateSubagentMaturity({
      featureFlags: {
        ...featureFlags,
        flags: {
          ...featureFlags.flags,
          "ambient.subagents": {
            ...featureFlags.flags["ambient.subagents"],
            defaultEnabled: true,
          },
        },
      },
      observability: observability({ spawnAttempts: 30, failedSpawns: 0 }),
      restartReconciliation: restartReconciliation({ issueCount: 0 }),
      liveReleaseGateHistory: liveReleaseGateHistory(30),
      desktopDogfoodHistory: desktopDogfoodHistory(30),
      workflowJitterReleaseProfile: workflowJitterReleaseProfileReport(),
      restartRecoveryValidated: true,
      completionGuardVisibilityValidated: true,
      completionGuardVisibility: completionGuardVisibility(),
      approvalRoutingVisibilityValidated: true,
      approvalRoutingVisibility: approvalRoutingVisibility(),
      productionUiVisibilityValidated: true,
      productionUiVisibility: productionUiVisibility(),
      eventAttributionIntegrityValidated: true,
      eventAttributionIntegrity: eventAttributionIntegrity(),
      lifecycleControlIntegrityValidated: true,
      lifecycleControlIntegrity: lifecycleControlIntegrity(),
      retentionPolicyIntegrityValidated: true,
      retentionPolicyIntegrity: retentionPolicyIntegrity(),
      toolScopeIntegrityValidated: true,
      toolScopeIntegrity: toolScopeIntegrity(),
      securityReview: { status: "passed" },
    });

    expect(snapshot.blockedGateIds).toEqual(["feature_flag_guarded"]);
  });

  it("blocks graduation when completion guard visibility evidence omits a required surface", () => {
    const snapshot = evaluateSubagentMaturity({
      featureFlags: resolveAmbientFeatureFlags(),
      observability: observability({ spawnAttempts: 30, failedSpawns: 0 }),
      restartReconciliation: restartReconciliation({ issueCount: 0 }),
      liveReleaseGateHistory: liveReleaseGateHistory(30),
      desktopDogfoodHistory: desktopDogfoodHistory(30),
      workflowJitterReleaseProfile: workflowJitterReleaseProfileReport(),
      restartRecoveryValidated: true,
      completionGuardVisibilityValidated: true,
      completionGuardVisibility: {
        childInspector: true,
        parentBlockingIndicator: true,
        replayDiagnostics: true,
        diagnosticHistory: false,
      },
      approvalRoutingVisibilityValidated: true,
      approvalRoutingVisibility: approvalRoutingVisibility(),
      productionUiVisibilityValidated: true,
      productionUiVisibility: productionUiVisibility(),
      eventAttributionIntegrityValidated: true,
      eventAttributionIntegrity: eventAttributionIntegrity(),
      lifecycleControlIntegrityValidated: true,
      lifecycleControlIntegrity: lifecycleControlIntegrity(),
      retentionPolicyIntegrityValidated: true,
      retentionPolicyIntegrity: retentionPolicyIntegrity(),
      toolScopeIntegrityValidated: true,
      toolScopeIntegrity: toolScopeIntegrity(),
      securityReview: { status: "passed" },
    });

    expect(snapshot.blockedGateIds).toEqual(["completion_guard_visibility"]);
    expect(snapshot.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "completion_guard_visibility",
        status: "blocked",
        detail: "Missing surfaces: diagnostic history.",
      }),
    ]));
  });

  it("blocks graduation when approval routing visibility evidence omits a required surface", () => {
    const snapshot = evaluateSubagentMaturity({
      featureFlags: resolveAmbientFeatureFlags(),
      observability: observability({ spawnAttempts: 30, failedSpawns: 0 }),
      restartReconciliation: restartReconciliation({ issueCount: 0 }),
      liveReleaseGateHistory: liveReleaseGateHistory(30),
      desktopDogfoodHistory: desktopDogfoodHistory(30),
      workflowJitterReleaseProfile: workflowJitterReleaseProfileReport(),
      restartRecoveryValidated: true,
      completionGuardVisibilityValidated: true,
      completionGuardVisibility: completionGuardVisibility(),
      approvalRoutingVisibilityValidated: true,
      approvalRoutingVisibility: {
        childRequestAttribution: true,
        scopedResponsePersistence: true,
        parentWaitResumption: false,
        nonInteractiveFailure: true,
        uiAndReplayVisibility: true,
      },
      productionUiVisibilityValidated: true,
      productionUiVisibility: productionUiVisibility(),
      eventAttributionIntegrityValidated: true,
      eventAttributionIntegrity: eventAttributionIntegrity(),
      lifecycleControlIntegrityValidated: true,
      lifecycleControlIntegrity: lifecycleControlIntegrity(),
      retentionPolicyIntegrityValidated: true,
      retentionPolicyIntegrity: retentionPolicyIntegrity(),
      toolScopeIntegrityValidated: true,
      toolScopeIntegrity: toolScopeIntegrity(),
      securityReview: { status: "passed" },
    });

    expect(snapshot.blockedGateIds).toEqual(["approval_routing_visibility"]);
    expect(snapshot.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "approval_routing_visibility",
        status: "blocked",
        detail: "Missing surfaces: parent wait resumption.",
      }),
    ]));
  });

  it("blocks graduation when event attribution integrity evidence omits a required surface", () => {
    const snapshot = evaluateSubagentMaturity({
      featureFlags: resolveAmbientFeatureFlags(),
      observability: observability({ spawnAttempts: 30, failedSpawns: 0 }),
      restartReconciliation: restartReconciliation({ issueCount: 0 }),
      liveReleaseGateHistory: liveReleaseGateHistory(30),
      desktopDogfoodHistory: desktopDogfoodHistory(30),
      workflowJitterReleaseProfile: workflowJitterReleaseProfileReport(),
      restartRecoveryValidated: true,
      completionGuardVisibilityValidated: true,
      completionGuardVisibility: completionGuardVisibility(),
      approvalRoutingVisibilityValidated: true,
      approvalRoutingVisibility: approvalRoutingVisibility(),
      productionUiVisibilityValidated: true,
      productionUiVisibility: productionUiVisibility(),
      eventAttributionIntegrityValidated: true,
      eventAttributionIntegrity: {
        runtimePreviewAttribution: true,
        parentMailboxAttribution: true,
        toolApprovalErrorProvenance: false,
        replayDiagnostics: true,
        largeOutputArtifactBacking: true,
      },
      lifecycleControlIntegrityValidated: true,
      lifecycleControlIntegrity: lifecycleControlIntegrity(),
      retentionPolicyIntegrityValidated: true,
      retentionPolicyIntegrity: retentionPolicyIntegrity(),
      toolScopeIntegrityValidated: true,
      toolScopeIntegrity: toolScopeIntegrity(),
      securityReview: { status: "passed" },
    });

    expect(snapshot.blockedGateIds).toEqual(["event_attribution_integrity"]);
    expect(snapshot.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "event_attribution_integrity",
        status: "blocked",
        detail: "Missing surfaces: tool/approval/error provenance.",
      }),
    ]));
  });

  it("blocks graduation when production UI visibility evidence omits a required surface", () => {
    const snapshot = evaluateSubagentMaturity({
      featureFlags: resolveAmbientFeatureFlags(),
      observability: observability({ spawnAttempts: 30, failedSpawns: 0 }),
      restartReconciliation: restartReconciliation({ issueCount: 0 }),
      liveReleaseGateHistory: liveReleaseGateHistory(30),
      desktopDogfoodHistory: desktopDogfoodHistory(30),
      workflowJitterReleaseProfile: workflowJitterReleaseProfileReport(),
      restartRecoveryValidated: true,
      completionGuardVisibilityValidated: true,
      completionGuardVisibility: completionGuardVisibility(),
      approvalRoutingVisibilityValidated: true,
      approvalRoutingVisibility: approvalRoutingVisibility(),
      productionUiVisibilityValidated: true,
      productionUiVisibility: {
        collapsedParentClusters: true,
        blockingChildIndicators: true,
        childInspectorRows: true,
        repairReplayPanels: false,
        localRuntimeOwnershipControls: false,
      },
      eventAttributionIntegrityValidated: true,
      eventAttributionIntegrity: eventAttributionIntegrity(),
      lifecycleControlIntegrityValidated: true,
      lifecycleControlIntegrity: lifecycleControlIntegrity(),
      retentionPolicyIntegrityValidated: true,
      retentionPolicyIntegrity: retentionPolicyIntegrity(),
      toolScopeIntegrityValidated: true,
      toolScopeIntegrity: toolScopeIntegrity(),
      securityReview: { status: "passed" },
    });

    expect(snapshot.blockedGateIds).toEqual(["production_ui_visibility"]);
    expect(snapshot.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "production_ui_visibility",
        status: "blocked",
        detail: "Missing surfaces: repair/replay panels and local runtime ownership controls.",
      }),
    ]));
  });

  it("blocks graduation when lifecycle control integrity evidence omits a required surface", () => {
    const snapshot = evaluateSubagentMaturity({
      featureFlags: resolveAmbientFeatureFlags(),
      observability: observability({ spawnAttempts: 30, failedSpawns: 0 }),
      restartReconciliation: restartReconciliation({ issueCount: 0 }),
      liveReleaseGateHistory: liveReleaseGateHistory(30),
      desktopDogfoodHistory: desktopDogfoodHistory(30),
      workflowJitterReleaseProfile: workflowJitterReleaseProfileReport(),
      restartRecoveryValidated: true,
      completionGuardVisibilityValidated: true,
      completionGuardVisibility: completionGuardVisibility(),
      approvalRoutingVisibilityValidated: true,
      approvalRoutingVisibility: approvalRoutingVisibility(),
      productionUiVisibilityValidated: true,
      productionUiVisibility: productionUiVisibility(),
      eventAttributionIntegrityValidated: true,
      eventAttributionIntegrity: eventAttributionIntegrity(),
      lifecycleControlIntegrityValidated: true,
      lifecycleControlIntegrity: {
        parentStopCascade: true,
        childCancelIsolation: true,
        closeCapacityRetention: false,
        lifecycleHookArtifacts: true,
        restartInterruptionRepair: true,
      },
      retentionPolicyIntegrityValidated: true,
      retentionPolicyIntegrity: retentionPolicyIntegrity(),
      toolScopeIntegrityValidated: true,
      toolScopeIntegrity: toolScopeIntegrity(),
      securityReview: { status: "passed" },
    });

    expect(snapshot.blockedGateIds).toEqual(["lifecycle_control_integrity"]);
    expect(snapshot.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "lifecycle_control_integrity",
        status: "blocked",
        detail: "Missing surfaces: close capacity/history retention.",
      }),
    ]));
  });

  it("blocks graduation when retention policy integrity evidence omits a required surface", () => {
    const snapshot = evaluateSubagentMaturity({
      featureFlags: resolveAmbientFeatureFlags(),
      observability: observability({ spawnAttempts: 30, failedSpawns: 0 }),
      restartReconciliation: restartReconciliation({ issueCount: 0 }),
      liveReleaseGateHistory: liveReleaseGateHistory(30),
      desktopDogfoodHistory: desktopDogfoodHistory(30),
      workflowJitterReleaseProfile: workflowJitterReleaseProfileReport(),
      restartRecoveryValidated: true,
      completionGuardVisibilityValidated: true,
      completionGuardVisibility: completionGuardVisibility(),
      approvalRoutingVisibilityValidated: true,
      approvalRoutingVisibility: approvalRoutingVisibility(),
      productionUiVisibilityValidated: true,
      productionUiVisibility: productionUiVisibility(),
      eventAttributionIntegrityValidated: true,
      eventAttributionIntegrity: eventAttributionIntegrity(),
      lifecycleControlIntegrityValidated: true,
      lifecycleControlIntegrity: lifecycleControlIntegrity(),
      retentionPolicyIntegrityValidated: true,
      retentionPolicyIntegrity: {
        closeDoesNotDelete: true,
        capCleanupOldestEligible: true,
        protectedChildrenRetained: true,
        summaryArtifactsRetained: false,
        retainedStateVisible: true,
      },
      toolScopeIntegrityValidated: true,
      toolScopeIntegrity: toolScopeIntegrity(),
      securityReview: { status: "passed" },
    });

    expect(snapshot.blockedGateIds).toEqual(["retention_policy_integrity"]);
    expect(snapshot.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "retention_policy_integrity",
        status: "blocked",
        detail: "Missing surfaces: summary/artifact durability.",
      }),
    ]));
  });

  it("blocks graduation when tool scope integrity evidence omits a required surface", () => {
    const snapshot = evaluateSubagentMaturity({
      featureFlags: resolveAmbientFeatureFlags(),
      observability: observability({ spawnAttempts: 30, failedSpawns: 0 }),
      restartReconciliation: restartReconciliation({ issueCount: 0 }),
      liveReleaseGateHistory: liveReleaseGateHistory(30),
      desktopDogfoodHistory: desktopDogfoodHistory(30),
      workflowJitterReleaseProfile: workflowJitterReleaseProfileReport(),
      restartRecoveryValidated: true,
      completionGuardVisibilityValidated: true,
      completionGuardVisibility: completionGuardVisibility(),
      approvalRoutingVisibilityValidated: true,
      approvalRoutingVisibility: approvalRoutingVisibility(),
      productionUiVisibilityValidated: true,
      productionUiVisibility: productionUiVisibility(),
      eventAttributionIntegrityValidated: true,
      eventAttributionIntegrity: eventAttributionIntegrity(),
      lifecycleControlIntegrityValidated: true,
      lifecycleControlIntegrity: lifecycleControlIntegrity(),
      retentionPolicyIntegrityValidated: true,
      retentionPolicyIntegrity: retentionPolicyIntegrity(),
      toolScopeIntegrityValidated: true,
      toolScopeIntegrity: {
        hardDenyPrecedence: true,
        roleTaskNarrowing: true,
        exactToolAndExtensionResolution: false,
        childFanoutDefaultBlocked: true,
        snapshotAndInspectorDiagnostics: true,
      },
      securityReview: { status: "passed" },
    });

    expect(snapshot.blockedGateIds).toEqual(["tool_scope_integrity"]);
    expect(snapshot.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "tool_scope_integrity",
        status: "blocked",
        detail: "Missing surfaces: exact tool/extension resolution.",
      }),
    ]));
  });
});

function observability(overrides: Partial<SubagentObservabilitySummary> = {}): SubagentObservabilitySummary {
  return {
    schemaVersion: "ambient-subagent-observability-summary-v1",
    createdAt: "2026-06-05T00:00:00.000Z",
    spawnAttempts: 0,
    failedSpawns: 0,
    waitDurations: { count: 0, totalMs: 0, maxMs: 0 },
    cancellationCascades: 0,
    childRuntimeAborts: 0,
    toolDenials: { count: 0, byCategory: {} },
    usage: { tokenCount: 0, costMicros: 0 },
    localMemory: { eventCount: 0 },
    childIdle: { openRunCount: 0, totalMs: 0, maxMs: 0 },
    groupedCompletions: 0,
    batchProgress: {
      notificationCount: 0,
      jobCount: 0,
      itemCount: 0,
      acceptedReportCount: 0,
      pendingItemCount: 0,
      completedJobCount: 0,
    },
    needsAttentionRequests: 0,
    restartReconciliations: 0,
    statusCounts: {},
    ...overrides,
  };
}

function liveReleaseGateHistory(count: number): SubagentReleaseGateLiveHistoryEntry[] {
  return Array.from({ length: count }, (_, index) => liveReleaseGateHistoryRow({
    runId: `clean-${index + 1}`,
    completedAt: `2026-06-05T00:${String(index + 1).padStart(2, "0")}:00.000Z`,
  }));
}

function liveReleaseGateHistoryRow(
  overrides: Partial<SubagentReleaseGateLiveHistoryEntry> = {},
): SubagentReleaseGateLiveHistoryEntry {
  return {
    schemaVersion: "ambient-subagent-release-gate-live-history-v1",
    runId: "clean-1",
    reportPath: "test-results/subagent-release-gate/latest.json",
    status: "passed",
    ready: true,
    liveRequired: true,
    startedAt: "2026-06-05T00:00:00.000Z",
    completedAt: "2026-06-05T00:01:00.000Z",
    durationMs: 60_000,
    checkCounts: { passed: 113 },
    liveEvidence: Object.fromEntries(SUBAGENT_LIVE_EVIDENCE_LABELS.map((label) => [label, "present"])),
    skippedLiveEvidence: [],
    blockingIssueCount: 0,
    advisoryIssueCount: 0,
    nextSlice: "Sub-agent maturity gate evidence is green for this policy; continue with the next scoped implementation phase from origin/main.",
    ...overrides,
  };
}

function desktopDogfoodHistory(count: number): SubagentDesktopDogfoodHistoryEntry[] {
  return Array.from({ length: count }, (_, index) => desktopDogfoodHistoryRow({
    runId: `desktop-clean-${index + 1}`,
    generatedAt: `2026-06-05T00:${String(index + 1).padStart(2, "0")}:00.000Z`,
  }));
}

function desktopDogfoodHistoryRow(
  overrides: Partial<SubagentDesktopDogfoodHistoryEntry> = {},
): SubagentDesktopDogfoodHistoryEntry {
  return {
    schemaVersion: "ambient-subagent-desktop-dogfood-history-v1",
    runId: "desktop-clean-1",
    reportPath: "test-results/subagent-desktop-dogfood/latest.json",
    status: "passed",
    classification: "passed",
    ready: true,
    generatedAt: "2026-06-05T00:01:00.000Z",
    provider: "gmi-cloud",
    featureFlag: "ambient.subagents",
    scenarioCount: 14,
    scenarios: ["seeded_visible_child_cluster", "workflow_high_load_dogfood"],
    requiredScenarioMissing: [],
    visualAssertionSummary: assertionSummary({ requiredCount: 10, passedCount: 10 }),
    maturityAssertionSummary: assertionSummary({ requiredCount: 13, passedCount: 13 }),
    screenshotCount: 12,
    criticalOverlapCount: 0,
    horizontalOverflowFree: true,
    workflowHighLoadPatternCount: 6,
    blockingIssueCount: 0,
    advisoryIssueCount: 0,
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

function assertionSummary(input: { requiredCount: number; passedCount: number; failedCount?: number; missingCount?: number }) {
  return {
    requiredCount: input.requiredCount,
    passedCount: input.passedCount,
    failedCount: input.failedCount ?? 0,
    missingCount: input.missingCount ?? 0,
  };
}

function completionGuardVisibility() {
  return {
    childInspector: true,
    parentBlockingIndicator: true,
    replayDiagnostics: true,
    diagnosticHistory: true,
  };
}

function approvalRoutingVisibility() {
  return {
    childRequestAttribution: true,
    scopedResponsePersistence: true,
    parentWaitResumption: true,
    nonInteractiveFailure: true,
    uiAndReplayVisibility: true,
  };
}

function productionUiVisibility() {
  return {
    collapsedParentClusters: true,
    blockingChildIndicators: true,
    childInspectorRows: true,
    repairReplayPanels: true,
    localRuntimeOwnershipControls: true,
  };
}

function eventAttributionIntegrity() {
  return {
    runtimePreviewAttribution: true,
    parentMailboxAttribution: true,
    toolApprovalErrorProvenance: true,
    replayDiagnostics: true,
    largeOutputArtifactBacking: true,
  };
}

function lifecycleControlIntegrity() {
  return {
    parentStopCascade: true,
    childCancelIsolation: true,
    closeCapacityRetention: true,
    lifecycleHookArtifacts: true,
    restartInterruptionRepair: true,
  };
}

function retentionPolicyIntegrity() {
  return {
    closeDoesNotDelete: true,
    capCleanupOldestEligible: true,
    protectedChildrenRetained: true,
    summaryArtifactsRetained: true,
    retainedStateVisible: true,
  };
}

function toolScopeIntegrity() {
  return {
    hardDenyPrecedence: true,
    roleTaskNarrowing: true,
    exactToolAndExtensionResolution: true,
    childFanoutDefaultBlocked: true,
    snapshotAndInspectorDiagnostics: true,
  };
}

function restartReconciliation(overrides: Partial<SubagentRestartReconciliationSummary> = {}): SubagentRestartReconciliationSummary {
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
