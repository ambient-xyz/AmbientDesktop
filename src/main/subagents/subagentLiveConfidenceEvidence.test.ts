import { describe, expect, it } from "vitest";
import {
  createSubagentLiveConfidenceEvidence,
  summarizeSubagentLiveConfidenceEvidence,
  validateSubagentLiveConfidenceEvidence,
} from "./subagentLiveConfidenceEvidence";

describe("sub-agent live confidence evidence", () => {
  it("creates release-usable evidence for a GMI-backed Pi prompt/tool slice", () => {
    const evidence = createSubagentLiveConfidenceEvidence({
      sliceId: "subagent-wait-approval-bridge",
      sliceKind: "pi_tool_prompt",
      status: "passed",
      hypothesis: "A GMI-backed parent can spawn and wait on a required child.",
      expectedObservation: "Parent blocks until the child produces a synthesizable result.",
      actualOutcome: "Parent stayed blocked and resumed after the child result.",
      confidenceDelta: "increased",
      followUp: "Keep the artifact with the slice evidence.",
      closeoutAnswer: {
        kind: "saw_live",
        summary: "I saw the parent block on a required child and resume after the child result.",
      },
      startedAt: "2026-06-10T12:00:00.000Z",
      completedAt: "2026-06-10T12:01:30.000Z",
      provider: {
        kind: "gmi-cloud",
        providerId: "gmi-cloud",
        modelRuntimeId: "zai-org/GLM-5.1-FP8",
        usingGmiOverride: true,
      },
      featureFlagSnapshot: {
        ambientSubagentsEnabled: true,
        source: "launch_arg",
      },
      capabilitiesObserved: ["streaming", "tool_calling", "structured_json"],
      probes: [{
        label: "GMI-backed parent spawned required child and resumed after wait.",
        command: "AMBIENT_PROVIDER=gmi-cloud AMBIENT_SUBAGENT_LIVE=1 pnpm run test:subagents:live",
      }],
      artifacts: [{
        label: "live smoke report",
        path: "test-results/subagent-live-smoke/latest.json",
        kind: "json",
      }],
      observations: [{
        label: "parent wait",
        result: "Parent stayed blocked until the child produced a synthesizable result.",
      }],
    });

    expect(validateSubagentLiveConfidenceEvidence(evidence)).toEqual({
      valid: true,
      acceptance: "release_usable",
      issues: [],
    });
    expect(summarizeSubagentLiveConfidenceEvidence(evidence)).toEqual(expect.arrayContaining([
      "slice: subagent-wait-approval-bridge",
      "status: passed",
      "acceptance: release_usable",
      "confidenceDelta: increased",
      "closeoutAnswer: saw_live",
      "classifiedBlockers: 0",
    ]));
  });

  it("creates release-usable evidence for child authority confidence", () => {
    const evidence = createSubagentLiveConfidenceEvidence({
      sliceId: "subagent-child-authority-live-dogfood",
      sliceKind: "child_authority",
      status: "passed",
      hypothesis: "Child sessions inherit then narrow parent authority roots.",
      expectedObservation: "Long-context reads, file approvals, and browser approvals stay child-scoped and parent-visible.",
      actualOutcome: "The child authority proof passed for delegated reads and approval forwarding.",
      confidenceDelta: "increased",
      followUp: "Keep child authority evidence in the live release gate.",
      closeoutAnswer: {
        kind: "saw_live",
        summary: "I saw the child authority proof pass with parent-forwarded approvals.",
      },
      startedAt: "2026-06-10T12:00:00.000Z",
      completedAt: "2026-06-10T12:01:30.000Z",
      provider: {
        kind: "gmi-cloud",
        providerId: "gmi-cloud",
        usingGmiOverride: true,
      },
      featureFlagSnapshot: {
        ambientSubagentsEnabled: true,
        source: "test_override",
      },
      capabilitiesObserved: ["delegated_tool_authority", "parent_approval_forwarding", "secret_non_leakage"],
      maturityAssertions: [{
        id: "child_long_context_authority",
        label: "Child long-context authority",
        status: "passed",
        artifactPath: "test-results/subagent-live-smoke/long-context-authority-latest.json",
        capabilities: ["delegated_tool_authority"],
        evidence: ["childThreadId: child-authority-thread"],
      }, {
        id: "child_file_approval_authority",
        label: "Child file approval authority",
        status: "passed",
        artifactPath: "test-results/subagent-live-smoke/approval-authority-latest.json",
        capabilities: ["parent_approval_forwarding", "child_scoped_approval"],
        evidence: ["approvalId: child-file-approval"],
      }, {
        id: "child_browser_approval_authority",
        label: "Child browser approval authority",
        status: "passed",
        artifactPath: "test-results/subagent-live-smoke/browser-approval-latest.json",
        capabilities: ["browser_authority", "parent_approval_forwarding"],
        evidence: ["approvalId: child-browser-approval"],
      }],
      probes: [{
        label: "GMI-backed child authority live dogfood",
        command: "pnpm run test:subagents:live:authority",
      }],
      artifacts: [{
        label: "child authority confidence proof set",
        path: "test-results/subagent-live-confidence/child-authority-latest.json",
        kind: "json",
      }],
      observations: [{
        label: "child authority",
        result: "Delegated reads and child-scoped approvals stayed parent-visible.",
      }],
    });

    expect(validateSubagentLiveConfidenceEvidence(evidence)).toEqual({
      valid: true,
      acceptance: "release_usable",
      issues: [],
    });
  });

  it("requires passed child authority confidence to name each delegated authority assertion", () => {
    const evidence = createSubagentLiveConfidenceEvidence({
      sliceId: "subagent-child-authority-live-dogfood",
      sliceKind: "child_authority",
      status: "passed",
      hypothesis: "Child sessions inherit then narrow parent authority roots.",
      expectedObservation: "Long-context reads, file approvals, and browser approvals stay child-scoped and parent-visible.",
      actualOutcome: "Only the long-context proof was recorded.",
      confidenceDelta: "unchanged",
      followUp: "Regenerate the full child authority proof set before release.",
      closeoutAnswer: {
        kind: "saw_live",
        summary: "I saw an incomplete child authority proof.",
      },
      startedAt: "2026-06-10T12:00:00.000Z",
      completedAt: "2026-06-10T12:01:30.000Z",
      provider: {
        kind: "gmi-cloud",
        providerId: "gmi-cloud",
        usingGmiOverride: true,
      },
      featureFlagSnapshot: {
        ambientSubagentsEnabled: true,
        source: "test_override",
      },
      capabilitiesObserved: ["delegated_tool_authority"],
      maturityAssertions: [{
        id: "child_long_context_authority",
        label: "Child long-context authority",
        status: "passed",
        artifactPath: "test-results/subagent-live-smoke/long-context-authority-latest.json",
        capabilities: ["delegated_tool_authority"],
        evidence: ["childThreadId: child-authority-thread"],
      }],
      probes: [{
        label: "GMI-backed child authority live dogfood",
        command: "pnpm run test:subagents:live:authority",
      }],
      artifacts: [{
        label: "child authority confidence proof set",
        path: "test-results/subagent-live-confidence/child-authority-latest.json",
        kind: "json",
      }],
      observations: [{
        label: "child authority",
        result: "Only delegated reads were proven.",
      }],
    });

    expect(validateSubagentLiveConfidenceEvidence(evidence)).toEqual({
      valid: false,
      acceptance: "invalid",
      issues: [
        "Passed child_authority live confidence evidence is missing maturityAssertion child_file_approval_authority.",
        "Passed child_authority live confidence evidence is missing maturityAssertion child_browser_approval_authority.",
      ],
    });
  });

  it("creates release-usable evidence for lifecycle edge confidence", () => {
    const evidence = createSubagentLiveConfidenceEvidence({
      sliceId: "subagent-lifecycle-edge-proof",
      sliceKind: "lifecycle_edges",
      status: "passed",
      hypothesis: "Lifecycle edge proof covers restart, stop, detach, cancel, retry, timeout, and partial-result safety.",
      expectedObservation: "The proof artifact covers every edge and records no unsafe synthesis rows.",
      actualOutcome: "The lifecycle edge artifact covered all seven planned edge cases.",
      confidenceDelta: "increased",
      followUp: "Keep lifecycle edge proof in the release gate and replace fixture-only proof with live Desktop evidence as it matures.",
      closeoutAnswer: {
        kind: "saw_live",
        summary: "I saw lifecycle edge confidence produce a complete synthesis-safety artifact.",
      },
      startedAt: "2026-06-10T12:00:00.000Z",
      completedAt: "2026-06-10T12:01:30.000Z",
      provider: {
        kind: "custom",
        providerId: "lifecycle-edge-proof",
      },
      featureFlagSnapshot: {
        ambientSubagentsEnabled: true,
        source: "test_override",
      },
      capabilitiesObserved: ["restart_edge", "stop_edge", "detach_edge", "cancel_edge", "retry_edge", "timeout_edge", "partial_result_edge", "synthesis_safety"],
      maturityAssertions: [{
        id: "lifecycle_edge_restart",
        label: "Lifecycle restart edge",
        status: "passed",
        artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
        capabilities: ["restart_edge"],
        evidence: ["edgeId: edge-restart"],
      }, {
        id: "lifecycle_edge_stop",
        label: "Lifecycle stop edge",
        status: "passed",
        artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
        capabilities: ["stop_edge"],
        evidence: ["edgeId: edge-child-stop"],
      }, {
        id: "lifecycle_edge_detach",
        label: "Lifecycle detach edge",
        status: "passed",
        artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
        capabilities: ["detach_edge"],
        evidence: ["edgeId: edge-detach"],
      }, {
        id: "lifecycle_edge_cancel",
        label: "Lifecycle cancel edge",
        status: "passed",
        artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
        capabilities: ["cancel_edge"],
        evidence: ["edgeId: edge-parent-cancel"],
      }, {
        id: "lifecycle_edge_retry",
        label: "Lifecycle retry edge",
        status: "passed",
        artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
        capabilities: ["retry_edge"],
        evidence: ["edgeId: edge-retry-child"],
      }, {
        id: "lifecycle_edge_timeout",
        label: "Lifecycle timeout edge",
        status: "passed",
        artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
        capabilities: ["timeout_edge"],
        evidence: ["edgeId: edge-timeout"],
      }, {
        id: "lifecycle_edge_partial_result",
        label: "Lifecycle partial result edge",
        status: "passed",
        artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
        capabilities: ["partial_result_edge"],
        evidence: ["edgeId: edge-partial-result"],
      }, {
        id: "lifecycle_edge_synthesis_safety",
        label: "Lifecycle synthesis safety",
        status: "passed",
        artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
        capabilities: ["synthesis_safety"],
        evidence: ["unsafeEdgeIds: none"],
      }],
      probes: [{
        label: "sub-agent lifecycle edge proof",
        command: "pnpm run test:subagents:lifecycle-edges:proof",
      }],
      artifacts: [{
        label: "lifecycle edge proof report",
        path: "test-results/subagent-lifecycle-edges/latest.json",
        kind: "json",
      }],
      observations: [{
        label: "lifecycle edge proof artifact",
        result: "Covered restart, stop, detach, cancel, retry, timeout, partial_result with no unsafe edges.",
      }],
    });

    expect(validateSubagentLiveConfidenceEvidence(evidence)).toEqual({
      valid: true,
      acceptance: "release_usable",
      issues: [],
    });
  });

  it("requires passed restart repair confidence to name each repair assertion", () => {
    const evidence = createSubagentLiveConfidenceEvidence({
      sliceId: "subagent-restart-repair-replay",
      sliceKind: "restart_repair",
      status: "passed",
      hypothesis: "Restart repair proof covers replay, mailbox rehydration, artifact pointers, lifecycle edges, and synthesis safety.",
      expectedObservation: "The restart confidence artifact names each repair and safety evidence family.",
      actualOutcome: "The restart confidence artifact contained structured evidence for every required family.",
      confidenceDelta: "increased",
      followUp: "Keep restart repair maturity assertions in required-live release gates.",
      closeoutAnswer: {
        kind: "saw_live",
        summary: "I saw restart repair confidence produce all required maturity assertions.",
      },
      startedAt: "2026-06-10T12:00:00.000Z",
      completedAt: "2026-06-10T12:01:30.000Z",
      provider: {
        kind: "custom",
        providerId: "replay-diagnostics",
      },
      featureFlagSnapshot: {
        ambientSubagentsEnabled: true,
        source: "test_override",
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
        "timeout_edge",
        "partial_result_edge",
        "synthesis_safety",
      ],
      maturityAssertions: [{
        id: "restart_repair_runtime_event_replay",
        label: "Restart runtime event replay",
        status: "passed",
        artifactPath: "test-results/subagent-replay-diagnostics/latest.json",
        capabilities: ["runtime_event_replay"],
        evidence: ["runtimeEvents: 3"],
      }, {
        id: "restart_repair_child_tree_repair",
        label: "Restart child tree and wait barrier repair",
        status: "passed",
        artifactPath: "test-results/subagent-replay-diagnostics/latest.json",
        capabilities: ["restart_rehydration", "child_thread_repair", "wait_barrier_repair"],
        evidence: ["repairedRunIds: run-active"],
      }, {
        id: "restart_repair_mailbox_rehydration",
        label: "Restart parent mailbox rehydration",
        status: "passed",
        artifactPath: "test-results/subagent-replay-diagnostics/latest-fixture-evidence.json",
        capabilities: ["parent_mailbox_replay", "mailbox_state_rehydration"],
        evidence: ["parentMailboxEventIds: parent-mailbox-grouped-completion"],
      }, {
        id: "restart_repair_artifact_pointer_rehydration",
        label: "Restart artifact pointer rehydration",
        status: "passed",
        artifactPath: "test-results/subagent-replay-diagnostics/latest-fixture-evidence.json",
        capabilities: ["artifact_pointer_rehydration"],
        evidence: ["resultArtifactPointers: 1"],
      }, {
        id: "restart_repair_lifecycle_edge_coverage",
        label: "Restart repair lifecycle edge coverage",
        status: "passed",
        artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
        capabilities: ["restart_edge", "stop_edge", "detach_edge", "cancel_edge", "retry_edge", "timeout_edge", "partial_result_edge"],
        evidence: ["coveredEdgeKinds: restart, stop, detach, cancel, retry, timeout, partial_result"],
      }, {
        id: "restart_repair_synthesis_safety",
        label: "Restart repair synthesis safety",
        status: "passed",
        artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
        capabilities: ["synthesis_safety"],
        evidence: ["unsafeEdgeIds: none"],
      }],
      artifacts: [{
        label: "restart repair confidence report",
        path: "test-results/subagent-live-confidence/restart-repair-latest.json",
        kind: "json",
      }],
      observations: [{
        label: "restart repair maturity",
        result: "All required restart repair assertions passed.",
      }],
    });

    expect(validateSubagentLiveConfidenceEvidence(evidence)).toEqual({
      valid: true,
      acceptance: "release_usable",
      issues: [],
    });
    expect(summarizeSubagentLiveConfidenceEvidence(evidence)).toContain("maturityAssertions: 6");
  });

  it("requires passed workflow confidence to name each maturity assertion", () => {
    const evidence = createSubagentLiveConfidenceEvidence({
      sliceId: "workflow-symphony-live-dogfood",
      sliceKind: "workflow_symphony",
      status: "passed",
      hypothesis: "A workflow run proves live execution, mutating child workers, and restart rehydration.",
      expectedObservation: "The workflow report contains all three evidence families.",
      actualOutcome: "The workflow report contained structured evidence for each required family.",
      confidenceDelta: "increased",
      followUp: "Keep the structured assertions in the live-required release gate.",
      closeoutAnswer: {
        kind: "saw_live",
        summary: "I saw workflow live confidence produce all required maturity assertions.",
      },
      startedAt: "2026-06-10T12:00:00.000Z",
      completedAt: "2026-06-10T12:01:30.000Z",
      provider: {
        kind: "gmi-cloud",
        providerId: "gmi-cloud",
        usingGmiOverride: true,
      },
      featureFlagSnapshot: {
        ambientSubagentsEnabled: true,
        source: "test_override",
      },
      capabilitiesObserved: ["workflow_launch", "workflow_agent_ui_dogfood", "mutating_child_workflow", "workflow_task_rehydration"],
      maturityAssertions: [{
        id: "live_workflow_run",
        label: "Live workflow run",
        status: "passed",
        artifactPath: "test-results/workflow-local-file-run-dogfood/latest.json",
        capabilities: ["workflow_launch", "ambient_runtime_call", "artifact_link", "checkpoint_output"],
        evidence: ["workflowRunId: workflow-run"],
      }, {
        id: "broader_workflow_ui_dogfood",
        label: "Broader Workflow Agent UI dogfood",
        status: "passed",
        artifactPath: "test-results/workflow-agent-thread-ui-dogfood/matrix-latest.json",
        capabilities: ["broader_live_workflow_runs", "workflow_agent_ui_dogfood", "workflow_output_evidence", "electron_workflow_dogfood"],
        evidence: ["suite: phase0-live", "passedScenarios: 2"],
      }, {
        id: "child_mutating_workflow",
        label: "Child-originated mutating workflow",
        status: "passed",
        artifactPath: "test-results/callable-workflow-dogfood/latest.json",
        capabilities: ["mutating_child_workflow", "child_scoped_approval", "isolated_child_worktree", "parent_blocking_workflow", "denied_workflow_scope"],
        evidence: ["taskId: workflow-task-1"],
      }, {
        id: "workflow_task_artifact_rehydration",
        label: "Workflow task and artifact rehydration",
        status: "passed",
        artifactPath: "test-results/callable-workflow-rehydration/latest.json",
        capabilities: ["workflow_task_rehydration", "artifact_link", "checkpoint_output"],
        evidence: ["workflowArtifactId: workflow-artifact-1"],
      }],
      artifacts: [{
        label: "workflow confidence report",
        path: "test-results/subagent-live-confidence/workflow-symphony-latest.json",
        kind: "json",
      }],
      observations: [{
        label: "workflow maturity",
        result: "All required workflow maturity assertions passed.",
      }],
    });

    expect(validateSubagentLiveConfidenceEvidence(evidence)).toEqual({
      valid: true,
      acceptance: "release_usable",
      issues: [],
    });
    expect(summarizeSubagentLiveConfidenceEvidence(evidence)).toContain("maturityAssertions: 4");
  });

  it("requires passed local runtime confidence to name each ownership assertion", () => {
    const evidence = createSubagentLiveConfidenceEvidence({
      sliceId: "local-runtime-control-proof",
      sliceKind: "local_runtime",
      status: "passed",
      hypothesis: "A local runtime proof run shows sub-agent leases and untracked runtimes are safe.",
      expectedObservation: "The local runtime report contains ownership, stale lease, untracked runtime, lifecycle, and gate assertions.",
      actualOutcome: "The local runtime report contained structured evidence for each required runtime ownership family.",
      confidenceDelta: "increased",
      followUp: "Keep local runtime ownership assertions in the live-required release gate.",
      closeoutAnswer: {
        kind: "saw_live",
        summary: "I saw local runtime confidence produce all required ownership assertions.",
      },
      startedAt: "2026-06-10T12:00:00.000Z",
      completedAt: "2026-06-10T12:01:30.000Z",
      provider: {
        kind: "local",
        providerId: "local-runtime",
      },
      featureFlagSnapshot: {
        ambientSubagentsEnabled: true,
        source: "test_override",
      },
      capabilitiesObserved: ["local_runtime_lease_ownership", "untracked_runtime_safety", "stale_lease_recovery", "proof_gate_clean"],
      maturityAssertions: [{
        id: "local_runtime_active_lease_stop_blocker",
        label: "Active sub-agent lease Stop blocker",
        status: "passed",
        artifactPath: "test-results/local-runtime-control-proof/latest.json",
        capabilities: ["local_runtime_lease_ownership", "lease_stop_blocker"],
        evidence: ["leaseId: lease-review"],
      }, {
        id: "local_runtime_untracked_safety",
        label: "Untracked runtime safety",
        status: "passed",
        artifactPath: "test-results/local-runtime-control-proof/latest.json",
        capabilities: ["untracked_runtime_safety"],
        evidence: ["runtimeEntryId: untracked-llama:4401"],
      }, {
        id: "local_runtime_stale_lease_recovery",
        label: "Stale lease recovery",
        status: "passed",
        artifactPath: "test-results/local-runtime-control-proof/latest.json",
        capabilities: ["stale_lease_recovery"],
        evidence: ["staleLeaseIds: lease-stale"],
      }, {
        id: "local_runtime_provider_lifecycle",
        label: "Provider lifecycle and stopped display",
        status: "passed",
        artifactPath: "test-results/local-runtime-control-proof/latest.json",
        capabilities: ["provider_lifecycle", "stopped_provider_display", "non_destructive_stop"],
        evidence: ["providerActions: start, stop, restart"],
      }, {
        id: "local_runtime_proof_gate",
        label: "Local runtime proof gate",
        status: "passed",
        artifactPath: "test-results/local-runtime-control-proof-gate/latest.json",
        capabilities: ["proof_gate_clean"],
        evidence: ["blockingIssues: 0"],
      }],
      artifacts: [{
        label: "local runtime confidence report",
        path: "test-results/subagent-live-confidence/local-runtime-latest.json",
        kind: "json",
      }],
      observations: [{
        label: "local runtime maturity",
        result: "All required local runtime ownership assertions passed.",
      }],
    });

    expect(validateSubagentLiveConfidenceEvidence(evidence)).toEqual({
      valid: true,
      acceptance: "release_usable",
      issues: [],
    });
    expect(summarizeSubagentLiveConfidenceEvidence(evidence)).toContain("maturityAssertions: 5");
  });

  it("requires passed Desktop dogfood confidence to name each Desktop assertion", () => {
    const evidence = createSubagentLiveConfidenceEvidence({
      sliceId: "desktop-dogfood-live-confidence",
      sliceKind: "desktop_dogfood",
      status: "passed",
      hypothesis: "Desktop dogfood proves full-app sub-agent UI maturity.",
      expectedObservation: "The Desktop dogfood artifact passes with visual, lifecycle, runtime, and operator evidence.",
      actualOutcome: "The Desktop dogfood confidence artifact classified the full-app run as release usable.",
      confidenceDelta: "increased",
      followUp: "Keep Desktop dogfood confidence in the required-live release gate.",
      closeoutAnswer: {
        kind: "saw_live",
        summary: "I saw Desktop dogfood confidence pass.",
      },
      startedAt: "2026-06-10T12:00:00.000Z",
      completedAt: "2026-06-10T12:01:30.000Z",
      provider: {
        kind: "gmi-cloud",
        providerId: "gmi-cloud",
      },
      featureFlagSnapshot: {
        ambientSubagentsEnabled: true,
        source: "test_override",
      },
      capabilitiesObserved: ["electron_desktop_dogfood", "layout_safety"],
      maturityAssertions: [{
        id: "desktop_dogfood_scenario_coverage",
        label: "Desktop dogfood scenario coverage",
        status: "passed",
        artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
        capabilities: ["electron_desktop_dogfood"],
        evidence: ["scenarios: 16"],
      }, {
        id: "desktop_dogfood_visual_layout",
        label: "Desktop visual layout safety",
        status: "passed",
        artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
        capabilities: ["layout_safety"],
        evidence: ["narrowCriticalOverlapCount: 0"],
      }, {
        id: "desktop_dogfood_lifecycle_edges",
        label: "Desktop lifecycle edge visibility",
        status: "passed",
        artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
        capabilities: ["lifecycle_edge_desktop_behavior"],
        evidence: ["timeoutEdgeVisible: true"],
      }, {
        id: "desktop_dogfood_runtime_and_operator_controls",
        label: "Desktop runtime ownership and operator controls",
        status: "passed",
        artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
        capabilities: ["local_runtime_lease_ownership"],
        evidence: ["stopDisabledVisible: true"],
      }],
      artifacts: [{
        label: "Desktop dogfood confidence report",
        path: "test-results/subagent-live-confidence/desktop-dogfood-latest.json",
        kind: "json",
      }],
      observations: [{
        label: "Desktop dogfood maturity",
        result: "All required Desktop dogfood assertions passed.",
      }],
    });

    expect(validateSubagentLiveConfidenceEvidence(evidence)).toEqual({
      valid: true,
      acceptance: "release_usable",
      issues: [],
    });
    expect(summarizeSubagentLiveConfidenceEvidence(evidence)).toContain("maturityAssertions: 4");
  });

  it("allows deterministic-only slices to document why live validation was skipped", () => {
    const evidence = createSubagentLiveConfidenceEvidence({
      sliceId: "local-runtime-journal-parser",
      sliceKind: "deterministic_only",
      status: "skipped",
      hypothesis: "The journal parser has no runtime-observable surface.",
      expectedObservation: "No live probe is required for this deterministic-only helper.",
      actualOutcome: "Skipped live validation because only deterministic parser behavior changed.",
      confidenceDelta: "not_applicable",
      followUp: "Keep deterministic repair and status tests as the proof.",
      closeoutAnswer: {
        kind: "no_live_surface",
        summary: "There is no live product surface because only deterministic parser behavior changed.",
      },
      startedAt: "2026-06-10T13:00:00.000Z",
      completedAt: "2026-06-10T13:00:00.000Z",
      skipReason: "Pure journal parser with no Pi-visible prompt, provider, UI, or local runtime side effect.",
      notes: "Covered by deterministic repair and status tests.",
    });

    expect(validateSubagentLiveConfidenceEvidence(evidence)).toMatchObject({
      valid: true,
      acceptance: "advisory_only",
      issues: [],
    });
  });

  it("requires passed live evidence to carry feature-flag and artifact proof", () => {
    const evidence = createSubagentLiveConfidenceEvidence({
      sliceId: "symphony-builder",
      sliceKind: "workflow_symphony",
      status: "passed",
      hypothesis: "A live Symphony builder run can reach the changed workflow surface.",
      expectedObservation: "The live run produces a visible workflow artifact.",
      actualOutcome: "The artifact proof was intentionally omitted for this negative validation test.",
      confidenceDelta: "unchanged",
      followUp: "Add feature flag and artifact proof before accepting the evidence.",
      closeoutAnswer: {
        kind: "saw_live",
        summary: "I saw the live Symphony builder reach the workflow surface for this negative validation test.",
      },
      startedAt: "2026-06-10T14:00:00.000Z",
      completedAt: "2026-06-10T14:01:00.000Z",
      provider: { kind: "ambient", providerId: "ambient" },
    });

    expect(validateSubagentLiveConfidenceEvidence(evidence).issues).toEqual(expect.arrayContaining([
      "Passed live confidence evidence must prove ambient.subagents was enabled.",
      "Live confidence evidence with status passed must include at least one artifact reference.",
      "Passed workflow_symphony live confidence evidence is missing maturityAssertion live_workflow_run.",
    ]));
  });

  it("forces blocked and failed evidence to name the blocker or product issue", () => {
    const blocked = createSubagentLiveConfidenceEvidence({
      sliceId: "local-runtime-lease-stop",
      sliceKind: "local_runtime",
      status: "blocked",
      hypothesis: "A live local runtime probe can inspect lease stop blockers.",
      expectedObservation: "The runtime status explains blocked stop actions.",
      actualOutcome: "The blocker is intentionally omitted for this negative validation test.",
      confidenceDelta: "unchanged",
      followUp: "Classify the blocker before accepting the evidence.",
      closeoutAnswer: {
        kind: "blocked",
        summary: "I was blocked before reaching the local runtime live surface.",
      },
      provider: { kind: "local", providerId: "llama.cpp" },
      artifacts: [{ label: "runtime inventory", path: "test-results/local-runtime-control-proof/latest.json", kind: "json" }],
    });
    const failed = createSubagentLiveConfidenceEvidence({
      sliceId: "restart-repair-dogfood",
      sliceKind: "restart_repair",
      status: "failed",
      hypothesis: "Restart repair can rehydrate an active child tree.",
      expectedObservation: "The restart report preserves mailbox and artifact pointers.",
      actualOutcome: "The product issue is intentionally omitted for this negative validation test.",
      confidenceDelta: "decreased",
      followUp: "Name the product issue before accepting the evidence.",
      closeoutAnswer: {
        kind: "saw_live",
        summary: "I saw restart repair reach the live surface and fail for this negative validation test.",
      },
      provider: { kind: "gmi-cloud", providerId: "gmi-cloud" },
      artifacts: [{ label: "restart report", path: "test-results/subagent-live-smoke/restart-reconciliation-latest.json", kind: "json" }],
    });

    expect(validateSubagentLiveConfidenceEvidence(blocked).issues).toContain("Blocked live confidence evidence must include at least one classifiedBlocker.");
    expect(validateSubagentLiveConfidenceEvidence(failed).issues).toContain("Failed live confidence evidence must include at least one productIssue.");
  });

  it("rejects secret-like material before it can enter live confidence artifacts", () => {
    const evidence = createSubagentLiveConfidenceEvidence({
      sliceId: "credentialed-provider-probe",
      sliceKind: "pi_tool_prompt",
      status: "blocked",
      hypothesis: "A credentialed provider probe can start the live Pi loop.",
      expectedObservation: "Missing credentials are classified without leaking secrets.",
      actualOutcome: "The blocker summary intentionally contains secret-like text for validation.",
      confidenceDelta: "unchanged",
      followUp: "Redact the blocker summary before accepting the evidence.",
      closeoutAnswer: {
        kind: "blocked",
        summary: "I was blocked by missing credentials for this negative validation test.",
      },
      provider: { kind: "gmi-cloud", providerId: "gmi-cloud" },
      artifacts: [{ label: "probe log", path: "test-results/subagent-live-confidence/latest.json", kind: "json" }],
      classifiedBlockers: [{
        kind: "credential_missing",
        summary: "GMI_CLOUD_API_KEY=sk-this-is-not-allowed-in-evidence",
        classifiedAsEnvironmental: true,
      }],
    });

    expect(validateSubagentLiveConfidenceEvidence(evidence).issues.join("\n")).toContain("secret-like material");
  });

  it("requires closeout answer to match the live attempt status", () => {
    const evidence = createSubagentLiveConfidenceEvidence({
      sliceId: "credentialed-provider-probe",
      sliceKind: "pi_tool_prompt",
      status: "blocked",
      hypothesis: "A credentialed provider probe can start the live Pi loop.",
      expectedObservation: "Missing credentials are classified without leaking secrets.",
      actualOutcome: "The live path was blocked before reaching Pi.",
      confidenceDelta: "unchanged",
      followUp: "Classify the blocker before accepting the evidence.",
      closeoutAnswer: {
        kind: "saw_live",
        summary: "This intentionally mismatches blocked status.",
      },
      provider: { kind: "gmi-cloud", providerId: "gmi-cloud" },
      artifacts: [{ label: "probe log", path: "test-results/subagent-live-confidence/latest.json", kind: "json" }],
      classifiedBlockers: [{
        kind: "credential_missing",
        summary: "GMI Cloud credential was unavailable.",
        classifiedAsEnvironmental: true,
      }],
    });

    expect(validateSubagentLiveConfidenceEvidence(evidence).issues).toContain("Blocked live confidence evidence must use closeoutAnswer.kind blocked.");
  });
});
