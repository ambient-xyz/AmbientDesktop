import { describe, expect, it } from "vitest";
import { buildSubagentLiveConfidenceEvidence, buildSubagentLiveConfidencePlan } from "./subagent-live-confidence-lib.mjs";
import {
  REQUIRED_DESKTOP_DOGFOOD_SCENARIOS,
  REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS,
  REQUIRED_DESKTOP_VISUAL_ASSERTIONS,
} from "./subagent-desktop-dogfood-evidence-contract.mjs";
import {
  approvalAuthorityArtifact,
  browserApprovalArtifact,
  callableWorkflowDogfoodArtifact,
  callableWorkflowRehydrationArtifact,
  desktopDogfoodArtifact,
  lifecycleEdgeArtifact,
  liveSmokeArtifact,
  liveWorkflowArtifact,
  localRuntimeControlProofArtifact,
  localRuntimeControlProofGateArtifact,
  longContextAuthorityArtifact,
  restartRepairDiagnosticsArtifact,
  restartRepairReplayEvidence,
  workflowUiBroaderDogfoodMatrixArtifact,
  workflowUiDogfoodMatrixArtifact,
} from "./subagent-live-confidence-test-fixtures.mjs";

describe("sub-agent live confidence release-usable evidence", () => {
  it("classifies completed live smoke evidence as release-usable", () => {
    const evidence = buildSubagentLiveConfidenceEvidence({
      plan: buildSubagentLiveConfidencePlan(),
      startedAt: "2026-06-10T23:00:00.000Z",
      completedAt: "2026-06-10T23:01:00.000Z",
      commandResult: { exitCode: 0, stdout: "ok", stderr: "" },
      liveSmokeArtifact: liveSmokeArtifact(),
    });

    expect(evidence).toMatchObject({
      schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
      status: "passed",
      hypothesis: expect.stringContaining("real Ambient/Pi-compatible sub-agent loop"),
      expectedObservation: expect.stringContaining("completed child run"),
      actualOutcome: "Passed: completed child run child-run for thread child-thread.",
      confidenceDelta: "increased",
      followUp: expect.stringContaining("Keep the artifact"),
      closeoutAnswer: {
        kind: "saw_live",
        summary: expect.stringContaining("Live Ambient/Pi sub-agent smoke"),
      },
      provider: { kind: "ambient", providerId: "ambient", usingGmiOverride: false },
      featureFlagSnapshot: { ambientSubagentsEnabled: true, source: "test_override" },
      capabilitiesObserved: ["streaming", "tool_calling", "structured_json"],
      classifiedBlockers: [],
      productIssues: [],
    });
    expect(evidence.artifacts).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "test-results/subagent-live-smoke/latest.json", kind: "json" })]),
    );
  });

  it("classifies completed child authority evidence as release-usable", () => {
    const evidence = buildSubagentLiveConfidenceEvidence({
      plan: buildSubagentLiveConfidencePlan({ sliceKind: "child_authority" }),
      startedAt: "2026-06-10T23:00:00.000Z",
      completedAt: "2026-06-10T23:01:00.000Z",
      commandResult: { exitCode: 0, stdout: "ok", stderr: "" },
      liveLongContextAuthorityArtifact: longContextAuthorityArtifact(),
      liveApprovalAuthorityArtifact: approvalAuthorityArtifact(),
      liveBrowserApprovalArtifact: browserApprovalArtifact(),
    });

    expect(evidence).toMatchObject({
      schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
      sliceId: "subagent-child-authority-live-dogfood",
      sliceKind: "child_authority",
      status: "passed",
      hypothesis: expect.stringContaining("authority roots"),
      expectedObservation: expect.stringContaining("parent-forwarded child browser approval"),
      actualOutcome:
        "Passed: proved long_context_process authority for long-context-run, child file approval approval-run, and child browser approval browser-run.",
      closeoutAnswer: {
        kind: "saw_live",
        summary: expect.stringContaining("Live child authority proof"),
      },
      capabilitiesObserved: expect.arrayContaining([
        "delegated_tool_authority",
        "long_context_authority_roots",
        "parent_approval_forwarding",
        "browser_authority",
        "secret_non_leakage",
      ]),
      maturityAssertions: expect.arrayContaining([
        expect.objectContaining({ id: "child_long_context_authority", status: "passed" }),
        expect.objectContaining({ id: "child_file_approval_authority", status: "passed" }),
        expect.objectContaining({ id: "child_browser_approval_authority", status: "passed" }),
      ]),
    });
    expect(evidence.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "test-results/subagent-live-smoke/long-context-authority-latest.json", kind: "json" }),
        expect.objectContaining({ path: "test-results/subagent-live-smoke/approval-authority-latest.json", kind: "json" }),
        expect.objectContaining({ path: "test-results/subagent-live-smoke/browser-approval-latest.json", kind: "json" }),
      ]),
    );
  });

  it("classifies completed workflow/Symphony dogfood evidence as release-usable", () => {
    const evidence = buildSubagentLiveConfidenceEvidence({
      plan: buildSubagentLiveConfidencePlan({ sliceKind: "workflow_symphony" }),
      startedAt: "2026-06-10T23:00:00.000Z",
      completedAt: "2026-06-10T23:01:00.000Z",
      commandResult: { exitCode: 0, stdout: "ok", stderr: "" },
      liveWorkflowArtifact: liveWorkflowArtifact(),
      liveWorkflowUiDogfoodArtifact: workflowUiDogfoodMatrixArtifact(),
      liveCallableWorkflowDogfoodArtifact: callableWorkflowDogfoodArtifact(),
      liveCallableWorkflowRehydrationArtifact: callableWorkflowRehydrationArtifact(),
    });

    expect(evidence).toMatchObject({
      schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
      sliceId: "workflow-symphony-live-dogfood",
      sliceKind: "workflow_symphony",
      status: "passed",
      hypothesis: expect.stringContaining("baseline Workflow Agent UI dogfood"),
      expectedObservation: expect.stringContaining("mutating callable workflow dogfood"),
      actualOutcome:
        "Passed: succeeded workflow run workflow-run for workflow thread workflow-thread; Workflow Agent UI dogfood covered 2 baseline scenario(s); callable workflow task workflow-task-1 proved mutating child dogfood and rehydrated task/artifact/run telemetry.",
      closeoutAnswer: {
        kind: "saw_live",
        summary: expect.stringContaining("workflow/Symphony dogfood"),
      },
      capabilitiesObserved: [
        "workflow_launch",
        "ambient_runtime_call",
        "artifact_link",
        "checkpoint_output",
        "mutating_child_workflow",
        "child_scoped_approval",
        "isolated_child_worktree",
        "parent_blocking_workflow",
        "denied_workflow_scope",
        "launch_card_bounds",
        "pause_resume_cancel",
        "child_workflow_scope",
        "restart_repair",
        "workflow_task_rehydration",
        "child_workflow_provenance",
        "broader_live_workflow_runs",
        "workflow_agent_ui_dogfood",
        "workflow_output_evidence",
        "electron_workflow_dogfood",
      ],
      maturityAssertions: [
        expect.objectContaining({
          id: "live_workflow_run",
          status: "passed",
          artifactPath: "test-results/workflow-local-file-run-dogfood/latest.json",
          capabilities: expect.arrayContaining(["workflow_launch", "ambient_runtime_call", "artifact_link", "checkpoint_output"]),
          evidence: expect.arrayContaining(["workflowRunId: workflow-run", "workflowThreadId: workflow-thread"]),
        }),
        expect.objectContaining({
          id: "broader_workflow_ui_dogfood",
          status: "passed",
          artifactPath: "test-results/workflow-agent-thread-ui-dogfood/matrix-latest.json",
          capabilities: expect.arrayContaining([
            "broader_live_workflow_runs",
            "workflow_agent_ui_dogfood",
            "workflow_output_evidence",
            "electron_workflow_dogfood",
          ]),
          evidence: expect.arrayContaining([
            "suite: phase0-live",
            "scenarios: vocabulary-quiz, local-file-classifier",
            "passedScenarios: 2",
            "totalModelCalls: 3",
            "totalOutputSignals: 5",
          ]),
        }),
        expect.objectContaining({
          id: "child_mutating_workflow",
          status: "passed",
          artifactPath: "test-results/callable-workflow-dogfood/latest.json",
          capabilities: expect.arrayContaining([
            "mutating_child_workflow",
            "child_scoped_approval",
            "isolated_child_worktree",
            "parent_blocking_workflow",
            "denied_workflow_scope",
            "launch_card_bounds",
            "pause_resume_cancel",
            "child_workflow_scope",
            "restart_repair",
          ]),
          evidence: expect.arrayContaining([
            "taskId: workflow-task-1",
            "subagentRunId: subagent-run-1",
            "launchCardRisk: medium",
            expect.stringContaining("dogfoodMaturity: workflow_launch_card_bounds:passed"),
            "deniedScope: workflow.call",
          ]),
        }),
        expect.objectContaining({
          id: "workflow_task_artifact_rehydration",
          status: "passed",
          artifactPath: "test-results/callable-workflow-rehydration/latest.json",
          capabilities: expect.arrayContaining([
            "workflow_task_rehydration",
            "artifact_link",
            "checkpoint_output",
            "child_workflow_provenance",
          ]),
          evidence: expect.arrayContaining([
            "taskId: workflow-task-1",
            "workflowArtifactId: workflow-artifact-1",
            "tokenCount: 21",
            expect.stringContaining("rehydrationMaturity: workflow_rehydrated_task_links:passed"),
          ]),
        }),
      ],
      observations: expect.arrayContaining([
        expect.objectContaining({
          label: "live workflow dogfood artifact",
          result: expect.stringContaining("workflow-thread"),
        }),
        expect.objectContaining({
          label: "callable workflow mutating child dogfood artifact",
          result: expect.stringContaining("blocked parent synthesis"),
        }),
        expect.objectContaining({
          label: "callable workflow task rehydration artifact",
          result: expect.stringContaining("21 tokens"),
        }),
      ]),
    });
    expect(evidence.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "test-results/workflow-local-file-run-dogfood/latest.json", kind: "json" }),
        expect.objectContaining({ path: "test-results/workflow-agent-thread-ui-dogfood/matrix-latest.json", kind: "json" }),
        expect.objectContaining({ path: "test-results/callable-workflow-dogfood/latest.json", kind: "json" }),
        expect.objectContaining({ path: "test-results/callable-workflow-rehydration/latest.json", kind: "json" }),
      ]),
    );
  });

  it("classifies completed broader workflow/Symphony dogfood evidence as release-usable", () => {
    const evidence = buildSubagentLiveConfidenceEvidence({
      plan: buildSubagentLiveConfidencePlan({ sliceKind: "workflow_symphony_broader" }),
      startedAt: "2026-06-10T23:00:00.000Z",
      completedAt: "2026-06-10T23:01:00.000Z",
      commandResult: { exitCode: 0, stdout: "ok", stderr: "" },
      liveWorkflowArtifact: liveWorkflowArtifact(),
      liveWorkflowUiDogfoodArtifact: workflowUiBroaderDogfoodMatrixArtifact(),
      liveCallableWorkflowDogfoodArtifact: callableWorkflowDogfoodArtifact(),
      liveCallableWorkflowRehydrationArtifact: callableWorkflowRehydrationArtifact(),
    });

    expect(evidence).toMatchObject({
      schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
      sliceId: "workflow-symphony-broader-live-dogfood",
      sliceKind: "workflow_symphony_broader",
      status: "passed",
      hypothesis: expect.stringContaining("phase-1 Workflow Agent UI dogfood"),
      actualOutcome:
        "Passed: succeeded workflow run workflow-run for workflow thread workflow-thread; Workflow Agent UI dogfood covered 4 broader phase-1 scenario(s); callable workflow task workflow-task-1 proved mutating child dogfood and rehydrated task/artifact/run telemetry.",
      capabilitiesObserved: expect.arrayContaining(["phase1_workflow_ui_dogfood"]),
      maturityAssertions: expect.arrayContaining([
        expect.objectContaining({
          id: "broader_workflow_ui_dogfood",
          status: "passed",
          evidence: expect.arrayContaining([
            "suite: phase1-live",
            "scenarios: gmail-20-metadata-readonly-validation, downloads-document-categorization, public-source-browser, current-web-recipe-report",
            "passedScenarios: 4",
          ]),
        }),
      ]),
    });
  });

  it("classifies completed local runtime control proof as release-usable", () => {
    const evidence = buildSubagentLiveConfidenceEvidence({
      plan: buildSubagentLiveConfidencePlan({ sliceKind: "local_runtime" }),
      startedAt: "2026-06-10T23:00:00.000Z",
      completedAt: "2026-06-10T23:01:00.000Z",
      commandResult: { exitCode: 0, stdout: "ok", stderr: "" },
      liveLocalRuntimeArtifact: localRuntimeControlProofArtifact(),
      liveLocalRuntimeGateArtifact: localRuntimeControlProofGateArtifact(),
    });

    expect(evidence).toMatchObject({
      schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
      sliceId: "local-runtime-control-proof",
      sliceKind: "local_runtime",
      status: "passed",
      provider: { kind: "local", providerId: "local-runtime", usingGmiOverride: false },
      actualOutcome:
        "Passed: proved ordinary Stop is blocked by lease-review for sub-agent Review worker, stale lease lease-stale no longer blocked Stop/Restart, and untracked runtime untracked-llama:4401 stayed external-only.",
      closeoutAnswer: {
        kind: "saw_live",
        summary: expect.stringContaining("Local runtime sub-agent ownership proof"),
      },
      capabilitiesObserved: [
        "local_runtime_lease_ownership",
        "lease_stop_blocker",
        "stale_lease_recovery",
        "untracked_runtime_safety",
        "provider_lifecycle",
        "stopped_provider_display",
        "non_destructive_stop",
        "proof_gate_clean",
      ],
      maturityAssertions: [
        expect.objectContaining({
          id: "local_runtime_active_lease_stop_blocker",
          status: "passed",
          artifactPath: "test-results/local-runtime-control-proof/latest.json",
          capabilities: expect.arrayContaining(["local_runtime_lease_ownership", "lease_stop_blocker"]),
          evidence: expect.arrayContaining(["leaseId: lease-review", "ordinaryStopAllowed: false"]),
        }),
        expect.objectContaining({
          id: "local_runtime_untracked_safety",
          status: "passed",
          artifactPath: "test-results/local-runtime-control-proof/latest.json",
          capabilities: expect.arrayContaining(["untracked_runtime_safety"]),
          evidence: expect.arrayContaining([
            "runtimeEntryId: untracked-llama:4401",
            "trackingStatus: untracked",
            "repeatedObservationCount: 3",
          ]),
        }),
        expect.objectContaining({
          id: "local_runtime_stale_lease_recovery",
          status: "passed",
          artifactPath: "test-results/local-runtime-control-proof/latest.json",
          capabilities: expect.arrayContaining(["stale_lease_recovery"]),
          evidence: expect.arrayContaining(["staleLeaseIds: lease-stale", "ordinaryRestartAllowed: true"]),
        }),
        expect.objectContaining({
          id: "local_runtime_provider_lifecycle",
          status: "passed",
          artifactPath: "test-results/local-runtime-control-proof/latest.json",
          capabilities: expect.arrayContaining(["provider_lifecycle", "stopped_provider_display", "non_destructive_stop"]),
          evidence: expect.arrayContaining(["providerActions: start, stop, restart", "usedGenericLifecycle: false"]),
        }),
        expect.objectContaining({
          id: "local_runtime_proof_gate",
          status: "passed",
          artifactPath: "test-results/local-runtime-control-proof-gate/latest.json",
          capabilities: expect.arrayContaining(["proof_gate_clean"]),
          evidence: expect.arrayContaining(["gateStatus: passed_with_advisories", "blockingIssues: 0"]),
        }),
      ],
      observations: expect.arrayContaining([
        expect.objectContaining({
          label: "local runtime control proof artifact",
          result: expect.stringContaining("lease-review"),
        }),
        expect.objectContaining({
          label: "untracked runtime safety",
          result: expect.stringContaining("external-only"),
        }),
        expect.objectContaining({
          label: "stale lease recovery",
          result: expect.stringContaining("lease-stale"),
        }),
        expect.objectContaining({
          label: "local runtime proof gate",
          result: expect.stringContaining("passed_with_advisories"),
        }),
      ]),
    });
    expect(evidence.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "test-results/local-runtime-control-proof/latest.json", kind: "json" }),
        expect.objectContaining({ path: "test-results/local-runtime-control-proof-gate/latest.json", kind: "json" }),
      ]),
    );
  });

  it("classifies completed restart repair replay diagnostics as release-usable", () => {
    const evidence = buildSubagentLiveConfidenceEvidence({
      plan: buildSubagentLiveConfidencePlan({ sliceKind: "restart_repair" }),
      startedAt: "2026-06-10T23:00:00.000Z",
      completedAt: "2026-06-10T23:01:00.000Z",
      commandResult: { exitCode: 0, stdout: "ok", stderr: "" },
      liveRestartRepairArtifact: restartRepairDiagnosticsArtifact(),
      liveRestartRepairFixtureArtifact: restartRepairReplayEvidence(),
      liveLifecycleEdgeArtifact: lifecycleEdgeArtifact(),
    });

    expect(evidence).toMatchObject({
      schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
      sliceId: "subagent-restart-repair-replay",
      sliceKind: "restart_repair",
      status: "passed",
      provider: { kind: "custom", providerId: "replay-diagnostics", usingGmiOverride: false },
      actualOutcome:
        "Passed: repaired runs run-active and barriers barrier-required, rehydrated 1 mailbox state and 1 artifact pointer; covered lifecycle edges restart, stop, detach, cancel, retry, timeout, partial_result.",
      closeoutAnswer: {
        kind: "saw_live",
        summary: expect.stringContaining("Sub-agent restart repair replay proof"),
      },
      capabilitiesObserved: [
        "restart_rehydration",
        "runtime_event_replay",
        "parent_mailbox_replay",
        "mailbox_state_rehydration",
        "artifact_pointer_rehydration",
        "child_thread_repair",
        "wait_barrier_repair",
        "restart_edge",
        "stop_edge",
        "detach_edge",
        "cancel_edge",
        "retry_edge",
        "timeout_edge",
        "partial_result_edge",
        "synthesis_safety",
      ],
      maturityAssertions: [
        expect.objectContaining({
          id: "restart_repair_runtime_event_replay",
          status: "passed",
          capabilities: ["runtime_event_replay"],
          evidence: expect.arrayContaining(["runtimeEvents: 3", "persistedRunEvents: 4"]),
        }),
        expect.objectContaining({
          id: "restart_repair_child_tree_repair",
          status: "passed",
          capabilities: expect.arrayContaining(["restart_rehydration", "child_thread_repair", "wait_barrier_repair"]),
          evidence: expect.arrayContaining(["repairedRunIds: run-active", "repairedBarrierIds: barrier-required"]),
        }),
        expect.objectContaining({
          id: "restart_repair_mailbox_rehydration",
          status: "passed",
          capabilities: expect.arrayContaining(["parent_mailbox_replay", "mailbox_state_rehydration"]),
          evidence: expect.arrayContaining([
            "parentMailboxEventIds: parent-mailbox-grouped-completion",
            "parentMailboxChildRefsResolved: true",
          ]),
        }),
        expect.objectContaining({
          id: "restart_repair_artifact_pointer_rehydration",
          status: "passed",
          capabilities: ["artifact_pointer_rehydration"],
          evidence: expect.arrayContaining(["resultArtifactPointers: 1", "missingResultArtifactsDiagnosed: true"]),
        }),
        expect.objectContaining({
          id: "restart_repair_lifecycle_edge_coverage",
          status: "passed",
          capabilities: expect.arrayContaining([
            "restart_edge",
            "stop_edge",
            "detach_edge",
            "cancel_edge",
            "retry_edge",
            "timeout_edge",
            "partial_result_edge",
          ]),
          evidence: expect.arrayContaining(["coveredEdgeKinds: restart, stop, detach, cancel, retry, timeout, partial_result"]),
        }),
        expect.objectContaining({
          id: "restart_repair_synthesis_safety",
          status: "passed",
          capabilities: ["synthesis_safety"],
          evidence: expect.arrayContaining(["unsafeEdgeIds: none", "safeEdgeRows: 7"]),
        }),
      ],
      observations: expect.arrayContaining([
        expect.objectContaining({
          label: "restart repair replay diagnostics",
          result: expect.stringContaining("7 repair issue kinds"),
        }),
        expect.objectContaining({
          label: "restart repaired objects",
          result: expect.stringContaining("run-active"),
        }),
        expect.objectContaining({
          label: "restart rehydration proof",
          result: expect.stringContaining("1 artifact pointer"),
        }),
        expect.objectContaining({
          label: "lifecycle edge proof artifact",
          result: expect.stringContaining("restart, stop, detach, cancel, retry, timeout, partial_result"),
        }),
      ]),
    });
    expect(evidence.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "test-results/subagent-replay-diagnostics/latest.json", kind: "json" }),
        expect.objectContaining({ path: "test-results/subagent-replay-diagnostics/latest-fixture-evidence.json", kind: "json" }),
        expect.objectContaining({ path: "test-results/subagent-lifecycle-edges/latest.json", kind: "json" }),
      ]),
    );
  });

  it("classifies completed lifecycle edge proof as release-usable", () => {
    const evidence = buildSubagentLiveConfidenceEvidence({
      plan: buildSubagentLiveConfidencePlan({ sliceKind: "lifecycle_edges" }),
      startedAt: "2026-06-10T23:00:00.000Z",
      completedAt: "2026-06-10T23:01:00.000Z",
      commandResult: { exitCode: 0, stdout: "ok", stderr: "" },
      liveLifecycleEdgeArtifact: lifecycleEdgeArtifact(),
    });

    expect(evidence).toMatchObject({
      schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
      sliceId: "subagent-lifecycle-edge-proof",
      sliceKind: "lifecycle_edges",
      status: "passed",
      provider: { kind: "custom", providerId: "lifecycle-edge-proof", usingGmiOverride: false },
      actualOutcome: "Passed: covered lifecycle edges restart, stop, detach, cancel, retry, timeout, partial_result.",
      closeoutAnswer: {
        kind: "saw_live",
        summary: expect.stringContaining("Sub-agent lifecycle edge proof"),
      },
      capabilitiesObserved: [
        "restart_edge",
        "stop_edge",
        "detach_edge",
        "cancel_edge",
        "retry_edge",
        "timeout_edge",
        "partial_result_edge",
        "synthesis_safety",
      ],
      maturityAssertions: [
        expect.objectContaining({
          id: "lifecycle_edge_restart",
          status: "passed",
          capabilities: ["restart_edge"],
          evidence: expect.arrayContaining(["edgeId: edge-restart", "restartRepairObserved: true"]),
        }),
        expect.objectContaining({
          id: "lifecycle_edge_stop",
          status: "passed",
          capabilities: ["stop_edge"],
          evidence: expect.arrayContaining(["edgeId: edge-child-stop", "capacityReleased: true"]),
        }),
        expect.objectContaining({
          id: "lifecycle_edge_detach",
          status: "passed",
          capabilities: ["detach_edge"],
          evidence: expect.arrayContaining(["edgeId: edge-detach", "detachedChildrenExcludedFromSynthesis: true"]),
        }),
        expect.objectContaining({
          id: "lifecycle_edge_cancel",
          status: "passed",
          capabilities: ["cancel_edge"],
          evidence: expect.arrayContaining(["edgeId: edge-parent-cancel", "cancellationCascadeRecorded: true"]),
        }),
        expect.objectContaining({
          id: "lifecycle_edge_retry",
          status: "passed",
          capabilities: ["retry_edge"],
          evidence: expect.arrayContaining(["edgeId: edge-retry-child", "retryAcceptedRunIds: run-retry"]),
        }),
        expect.objectContaining({
          id: "lifecycle_edge_timeout",
          status: "passed",
          capabilities: ["timeout_edge"],
          evidence: expect.arrayContaining(["edgeId: edge-timeout", "noTimedOutChildSynthesis: true"]),
        }),
        expect.objectContaining({
          id: "lifecycle_edge_partial_result",
          status: "passed",
          capabilities: ["partial_result_edge"],
          evidence: expect.arrayContaining(["edgeId: edge-partial-result", "failedChildNotSynthesized: true"]),
        }),
        expect.objectContaining({
          id: "lifecycle_edge_synthesis_safety",
          status: "passed",
          capabilities: ["synthesis_safety"],
          evidence: expect.arrayContaining(["unsafeEdgeIds: none", "safeEdgeRows: 7"]),
        }),
      ],
      observations: expect.arrayContaining([
        expect.objectContaining({
          label: "lifecycle edge proof artifact",
          result: expect.stringContaining("Covered restart, stop, detach, cancel, retry, timeout, partial_result"),
        }),
        expect.objectContaining({
          label: "lifecycle synthesis safety",
          result: "Unsafe edge ids: none.",
        }),
      ]),
    });
    expect(evidence.artifacts).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "test-results/subagent-lifecycle-edges/latest.json", kind: "json" })]),
    );
  });

  it("classifies completed Desktop dogfood evidence as release-usable", () => {
    const evidence = buildSubagentLiveConfidenceEvidence({
      plan: buildSubagentLiveConfidencePlan({ sliceKind: "desktop_dogfood" }),
      startedAt: "2026-06-10T23:00:00.000Z",
      completedAt: "2026-06-10T23:01:00.000Z",
      commandResult: { exitCode: 0, stdout: "ok", stderr: "" },
      liveDesktopDogfoodArtifact: desktopDogfoodArtifact(),
    });

    expect(evidence).toMatchObject({
      schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
      sliceId: "desktop-dogfood-live-confidence",
      sliceKind: "desktop_dogfood",
      status: "passed",
      provider: { kind: "ambient", providerId: "ambient", usingGmiOverride: false },
      actualOutcome: expect.stringContaining(
        `Passed: passed ${REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.length}/${REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.length} required scenario(s), observed ${REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.length} total scenario(s), with ${REQUIRED_DESKTOP_VISUAL_ASSERTIONS.length}/${REQUIRED_DESKTOP_VISUAL_ASSERTIONS.length} visual assertion(s), ${REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS.length}/${REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS.length} maturity assertion(s)`,
      ),
      closeoutAnswer: {
        kind: "saw_live",
        summary: expect.stringContaining("Full Ambient Desktop sub-agent dogfood"),
      },
      capabilitiesObserved: expect.arrayContaining([
        "electron_desktop_dogfood",
        "default_collapsed_state",
        "approval_parent_blocking",
        "workflow_execution_parent_blocking",
        "workflow_high_load_dogfood",
        "local_runtime_lease_ownership",
        "lease_stop_blocker",
        "untracked_runtime_safety",
        "operator_control_behavior",
        "lifecycle_edge_desktop_behavior",
        "retry_edge",
        "parent_stop_cascade",
        "layout_safety",
      ]),
      desktopDogfoodContract: {
        schemaVersion: "ambient-subagent-desktop-dogfood-contract-summary-v1",
        status: "passed",
        scenarioIds: REQUIRED_DESKTOP_DOGFOOD_SCENARIOS,
        requiredScenarioCount: REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.length,
        requiredScenarioPassCount: REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.length,
        missingRequiredScenarios: [],
        visualAssertionIds: REQUIRED_DESKTOP_VISUAL_ASSERTIONS,
        requiredVisualAssertionCount: REQUIRED_DESKTOP_VISUAL_ASSERTIONS.length,
        missingRequiredVisualAssertions: [],
        maturityAssertionIds: REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS,
        requiredMaturityAssertionCount: REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS.length,
        missingRequiredMaturityAssertions: [],
        requiredChatExportCapabilities: [
          "chat_export_child_bundle",
          "child_transcript_export",
          "child_full_transcript_export",
          "policy_provenance_export",
          "pattern_graph_export_links",
          "parent_mailbox_approval_export",
          "child_pi_session_status_export",
          "wait_barrier_export",
          "result_artifact_export",
          "lifecycle_edge_child_export",
          "parent_stop_child_export",
        ],
        chatExportCapabilities: [
          "chat_export_child_bundle",
          "child_transcript_export",
          "child_full_transcript_export",
          "policy_provenance_export",
          "pattern_graph_export_links",
          "parent_mailbox_approval_export",
          "child_pi_session_status_export",
          "wait_barrier_export",
          "result_artifact_export",
          "lifecycle_edge_child_export",
          "parent_stop_child_export",
        ],
        missingRequiredChatExportCapabilities: [],
        screenshotArtifactCount: 23,
        gitCommit: "desktop-dogfood-commit",
      },
      maturityAssertions: [
        expect.objectContaining({
          id: "desktop_dogfood_scenario_coverage",
          status: "passed",
          artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
          capabilities: expect.arrayContaining(["electron_desktop_dogfood", "workflow_high_load_dogfood"]),
        }),
        expect.objectContaining({
          id: "desktop_dogfood_visual_layout",
          status: "passed",
          artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
          capabilities: expect.arrayContaining(["production_ui_visibility", "layout_safety", "visual_layout_safety"]),
        }),
        expect.objectContaining({
          id: "desktop_dogfood_lifecycle_edges",
          status: "passed",
          artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
          capabilities: expect.arrayContaining([
            "lifecycle_edge_desktop_behavior",
            "timeout_edge",
            "partial_result_edge",
            "retry_edge",
            "detach_edge",
            "parent_stop_cascade",
          ]),
        }),
        expect.objectContaining({
          id: "desktop_dogfood_runtime_and_operator_controls",
          status: "passed",
          artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
          capabilities: expect.arrayContaining(["local_runtime_lease_ownership", "lease_stop_blocker", "operator_control_behavior"]),
        }),
      ],
      observations: expect.arrayContaining([
        expect.objectContaining({
          label: "Desktop dogfood artifact",
          result: expect.stringContaining(
            `Passed ${REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.length}/${REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.length} required scenario`,
          ),
        }),
        expect.objectContaining({
          label: "Desktop runtime ownership",
          result: expect.stringContaining("desktop-dogfood-local-runtime-lease"),
        }),
      ]),
    });
    expect(evidence.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "test-results/subagent-desktop-dogfood/latest.json", kind: "json" }),
        expect.objectContaining({ path: "test-results/subagent-desktop-dogfood/collapsed-desktop.png", kind: "screenshot" }),
        expect.objectContaining({ path: "test-results/subagent-desktop-dogfood/expanded-accessibility.json", kind: "json" }),
      ]),
    );
  });
});
