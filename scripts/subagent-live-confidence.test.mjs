import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import {
  buildSubagentLiveConfidenceEvidence,
  buildSubagentLiveConfidencePlan,
  renderSubagentLiveConfidenceMarkdown,
  runBoundedCommand,
  runSubagentLiveConfidence,
  sanitizeEvidenceText,
  validateCallableWorkflowDogfoodConfidenceArtifact,
  validateCallableWorkflowRehydrationConfidenceArtifact,
  validateApprovalAuthorityArtifact,
  validateBrowserApprovalAuthorityArtifact,
  validateChildAuthorityConfidenceArtifacts,
  validateDesktopDogfoodConfidenceArtifact,
  validateLongContextAuthorityArtifact,
  validateLocalRuntimeControlProofArtifact,
  validateLiveSmokeArtifact,
  validateSubagentLifecycleEdgeArtifact,
  validateSubagentRestartRepairConfidenceArtifacts,
  validateSubagentRestartRepairArtifact,
  validateWorkflowDogfoodArtifact,
  validateWorkflowSymphonyConfidenceArtifacts,
  validateWorkflowUiDogfoodMatrixArtifact,
} from "./subagent-live-confidence-lib.mjs";
import {
  REQUIRED_DESKTOP_DOGFOOD_SCENARIOS,
  REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS,
  REQUIRED_DESKTOP_VISUAL_ASSERTIONS,
} from "./subagent-desktop-dogfood-evidence-contract.mjs";

describe("sub-agent live confidence runner", () => {
  it("builds a bounded Ambient/Pi live confidence plan", () => {
    expect(buildSubagentLiveConfidencePlan({
      outputPath: "/tmp/live-confidence/latest.json",
      timeoutMs: 1234,
    })).toMatchObject({
      schemaVersion: "ambient-subagent-live-confidence-runner-v1",
      sliceId: "subagent-live-smoke",
      sliceKind: "pi_tool_prompt",
      providerId: "ambient",
      outputPath: "/tmp/live-confidence/latest.json",
      liveSmokeArtifactPath: "test-results/subagent-live-smoke/latest.json",
      stdoutPath: "/tmp/live-confidence/latest.stdout.txt",
      stderrPath: "/tmp/live-confidence/latest.stderr.txt",
      timeoutMs: 1234,
      command: {
        executable: "pnpm",
        args: ["run", "test:subagents:live:smoke"],
        display: "pnpm run test:subagents:live:smoke",
      },
    });
  });

  it("builds a focused child authority live confidence plan", () => {
    expect(buildSubagentLiveConfidencePlan({
      sliceKind: "child_authority",
      outputPath: "/tmp/live-confidence/authority.json",
    })).toMatchObject({
      schemaVersion: "ambient-subagent-live-confidence-runner-v1",
      sliceId: "subagent-child-authority-live-dogfood",
      sliceKind: "child_authority",
      providerId: "ambient",
      outputPath: "/tmp/live-confidence/authority.json",
      liveLongContextAuthorityArtifactPath: "test-results/subagent-live-smoke/long-context-authority-latest.json",
      liveApprovalAuthorityArtifactPath: "test-results/subagent-live-smoke/approval-authority-latest.json",
      liveBrowserApprovalArtifactPath: "test-results/subagent-live-smoke/browser-approval-latest.json",
      command: {
        executable: "pnpm",
        args: ["run", "test:subagents:live:authority"],
        display: "pnpm run test:subagents:live:authority",
      },
    });
  });

  it("builds a focused workflow/Symphony live confidence plan", () => {
    expect(buildSubagentLiveConfidencePlan({
      sliceKind: "workflow_symphony",
      outputPath: "/tmp/live-confidence/latest.json",
    })).toMatchObject({
      schemaVersion: "ambient-subagent-live-confidence-runner-v1",
      sliceId: "workflow-symphony-live-dogfood",
      sliceKind: "workflow_symphony",
      providerId: "ambient",
      outputPath: "/tmp/live-confidence/latest.json",
      liveWorkflowArtifactPath: "test-results/workflow-local-file-run-dogfood/latest.json",
      liveWorkflowUiDogfoodArtifactPath: "test-results/workflow-agent-thread-ui-dogfood/matrix-latest.json",
      liveCallableWorkflowDogfoodArtifactPath: "test-results/callable-workflow-dogfood/latest.json",
      liveCallableWorkflowRehydrationArtifactPath: "test-results/callable-workflow-rehydration/latest.json",
      command: {
        executable: "pnpm",
        args: ["run", "test:subagents:live-confidence:workflow-prereqs"],
        display: "pnpm run test:subagents:live-confidence:workflow-prereqs",
      },
    });
  });

  it("builds a broader workflow/Symphony live confidence plan", () => {
    expect(buildSubagentLiveConfidencePlan({
      sliceKind: "workflow_symphony_broader",
      outputPath: "/tmp/live-confidence/broader.json",
    })).toMatchObject({
      schemaVersion: "ambient-subagent-live-confidence-runner-v1",
      sliceId: "workflow-symphony-broader-live-dogfood",
      sliceKind: "workflow_symphony_broader",
      providerId: "ambient",
      outputPath: "/tmp/live-confidence/broader.json",
      liveWorkflowArtifactPath: "test-results/workflow-local-file-run-dogfood/latest.json",
      liveWorkflowUiDogfoodArtifactPath: "test-results/workflow-agent-thread-ui-dogfood/phase1-live-matrix-latest.json",
      liveCallableWorkflowDogfoodArtifactPath: "test-results/callable-workflow-dogfood/latest.json",
      liveCallableWorkflowRehydrationArtifactPath: "test-results/callable-workflow-rehydration/latest.json",
      command: {
        executable: "pnpm",
        args: ["run", "test:subagents:live-confidence:workflow-broader-prereqs"],
        display: "pnpm run test:subagents:live-confidence:workflow-broader-prereqs",
      },
    });
  });

  it("writes workflow/Symphony confidence to a stable slice-specific artifact by default", () => {
    expect(buildSubagentLiveConfidencePlan({
      sliceKind: "workflow_symphony",
    })).toMatchObject({
      sliceId: "workflow-symphony-live-dogfood",
      sliceKind: "workflow_symphony",
      outputPath: "test-results/subagent-live-confidence/workflow-symphony-latest.json",
      stdoutPath: "test-results/subagent-live-confidence/workflow-symphony-latest.stdout.txt",
      stderrPath: "test-results/subagent-live-confidence/workflow-symphony-latest.stderr.txt",
      liveWorkflowArtifactPath: "test-results/workflow-local-file-run-dogfood/latest.json",
      liveWorkflowUiDogfoodArtifactPath: "test-results/workflow-agent-thread-ui-dogfood/matrix-latest.json",
      liveCallableWorkflowDogfoodArtifactPath: "test-results/callable-workflow-dogfood/latest.json",
      liveCallableWorkflowRehydrationArtifactPath: "test-results/callable-workflow-rehydration/latest.json",
    });
  });

  it("writes broader workflow/Symphony confidence to a stable slice-specific artifact by default", () => {
    expect(buildSubagentLiveConfidencePlan({
      sliceKind: "workflow_symphony_broader",
    })).toMatchObject({
      sliceId: "workflow-symphony-broader-live-dogfood",
      sliceKind: "workflow_symphony_broader",
      outputPath: "test-results/subagent-live-confidence/workflow-symphony-broader-latest.json",
      stdoutPath: "test-results/subagent-live-confidence/workflow-symphony-broader-latest.stdout.txt",
      stderrPath: "test-results/subagent-live-confidence/workflow-symphony-broader-latest.stderr.txt",
      liveWorkflowArtifactPath: "test-results/workflow-local-file-run-dogfood/latest.json",
      liveWorkflowUiDogfoodArtifactPath: "test-results/workflow-agent-thread-ui-dogfood/phase1-live-matrix-latest.json",
      liveCallableWorkflowDogfoodArtifactPath: "test-results/callable-workflow-dogfood/latest.json",
      liveCallableWorkflowRehydrationArtifactPath: "test-results/callable-workflow-rehydration/latest.json",
    });
  });

  it("builds a focused local runtime confidence plan", () => {
    expect(buildSubagentLiveConfidencePlan({
      sliceKind: "local_runtime",
      outputPath: "/tmp/live-confidence/latest.json",
    })).toMatchObject({
      schemaVersion: "ambient-subagent-live-confidence-runner-v1",
      sliceId: "local-runtime-control-proof",
      sliceKind: "local_runtime",
      providerId: "local-runtime",
      outputPath: "/tmp/live-confidence/latest.json",
      liveLocalRuntimeArtifactPath: "test-results/local-runtime-control-proof/latest.json",
      liveLocalRuntimeGateArtifactPath: "test-results/local-runtime-control-proof-gate/latest.json",
      command: {
        executable: "pnpm",
        args: ["run", "test:local-runtime-control:proof"],
        display: "pnpm run test:local-runtime-control:proof",
      },
    });
  });

  it("writes local runtime confidence to a stable slice-specific artifact by default", () => {
    expect(buildSubagentLiveConfidencePlan({
      sliceKind: "local_runtime",
    })).toMatchObject({
      sliceId: "local-runtime-control-proof",
      sliceKind: "local_runtime",
      outputPath: "test-results/subagent-live-confidence/local-runtime-latest.json",
      stdoutPath: "test-results/subagent-live-confidence/local-runtime-latest.stdout.txt",
      stderrPath: "test-results/subagent-live-confidence/local-runtime-latest.stderr.txt",
      liveLocalRuntimeArtifactPath: "test-results/local-runtime-control-proof/latest.json",
      liveLocalRuntimeGateArtifactPath: "test-results/local-runtime-control-proof-gate/latest.json",
    });
  });

  it("builds a focused restart repair confidence plan", () => {
    expect(buildSubagentLiveConfidencePlan({
      sliceKind: "restart_repair",
      outputPath: "/tmp/live-confidence/latest.json",
    })).toMatchObject({
      schemaVersion: "ambient-subagent-live-confidence-runner-v1",
      sliceId: "subagent-restart-repair-replay",
      sliceKind: "restart_repair",
      providerId: "replay-diagnostics",
      outputPath: "/tmp/live-confidence/latest.json",
      liveRestartRepairArtifactPath: "test-results/subagent-replay-diagnostics/latest.json",
      liveRestartRepairFixtureArtifactPath: "test-results/subagent-replay-diagnostics/latest-fixture-evidence.json",
      liveLifecycleEdgeArtifactPath: "test-results/subagent-lifecycle-edges/latest.json",
      command: {
        executable: "pnpm",
        args: ["run", "test:subagents:live-confidence:restart-repair-prereqs"],
        display: "pnpm run test:subagents:live-confidence:restart-repair-prereqs",
      },
    });
  });

  it("writes restart repair confidence to a stable slice-specific artifact by default", () => {
    expect(buildSubagentLiveConfidencePlan({
      sliceKind: "restart_repair",
    })).toMatchObject({
      sliceId: "subagent-restart-repair-replay",
      sliceKind: "restart_repair",
      outputPath: "test-results/subagent-live-confidence/restart-repair-latest.json",
      stdoutPath: "test-results/subagent-live-confidence/restart-repair-latest.stdout.txt",
      stderrPath: "test-results/subagent-live-confidence/restart-repair-latest.stderr.txt",
      liveRestartRepairArtifactPath: "test-results/subagent-replay-diagnostics/latest.json",
      liveRestartRepairFixtureArtifactPath: "test-results/subagent-replay-diagnostics/latest-fixture-evidence.json",
      liveLifecycleEdgeArtifactPath: "test-results/subagent-lifecycle-edges/latest.json",
    });
  });

  it("builds a focused lifecycle edge confidence plan", () => {
    expect(buildSubagentLiveConfidencePlan({
      sliceKind: "lifecycle_edges",
      outputPath: "/tmp/live-confidence/latest.json",
    })).toMatchObject({
      schemaVersion: "ambient-subagent-live-confidence-runner-v1",
      sliceId: "subagent-lifecycle-edge-proof",
      sliceKind: "lifecycle_edges",
      providerId: "lifecycle-edge-proof",
      outputPath: "/tmp/live-confidence/latest.json",
      liveLifecycleEdgeArtifactPath: "test-results/subagent-lifecycle-edges/latest.json",
      command: {
        executable: "pnpm",
        args: ["run", "test:subagents:lifecycle-edges:proof"],
        display: "pnpm run test:subagents:lifecycle-edges:proof",
      },
    });
  });

  it("writes lifecycle edge confidence to a stable slice-specific artifact by default", () => {
    expect(buildSubagentLiveConfidencePlan({
      sliceKind: "lifecycle_edges",
    })).toMatchObject({
      sliceId: "subagent-lifecycle-edge-proof",
      sliceKind: "lifecycle_edges",
      outputPath: "test-results/subagent-live-confidence/lifecycle-edges-latest.json",
      stdoutPath: "test-results/subagent-live-confidence/lifecycle-edges-latest.stdout.txt",
      stderrPath: "test-results/subagent-live-confidence/lifecycle-edges-latest.stderr.txt",
      liveLifecycleEdgeArtifactPath: "test-results/subagent-lifecycle-edges/latest.json",
    });
  });

  it("builds a focused Desktop dogfood confidence plan", () => {
    expect(buildSubagentLiveConfidencePlan({
      sliceKind: "desktop_dogfood",
      outputPath: "/tmp/live-confidence/latest.json",
    })).toMatchObject({
      schemaVersion: "ambient-subagent-live-confidence-runner-v1",
      sliceId: "desktop-dogfood-live-confidence",
      sliceKind: "desktop_dogfood",
      providerId: "ambient",
      outputPath: "/tmp/live-confidence/latest.json",
      liveDesktopDogfoodArtifactPath: "test-results/subagent-desktop-dogfood/latest.json",
      command: {
        executable: "pnpm",
        args: ["run", "test:subagents:desktop-dogfood"],
        display: "pnpm run test:subagents:desktop-dogfood",
      },
    });
  });

  it("writes Desktop dogfood confidence to a stable slice-specific artifact by default", () => {
    expect(buildSubagentLiveConfidencePlan({
      sliceKind: "desktop_dogfood",
    })).toMatchObject({
      sliceId: "desktop-dogfood-live-confidence",
      sliceKind: "desktop_dogfood",
      outputPath: "test-results/subagent-live-confidence/desktop-dogfood-latest.json",
      stdoutPath: "test-results/subagent-live-confidence/desktop-dogfood-latest.stdout.txt",
      stderrPath: "test-results/subagent-live-confidence/desktop-dogfood-latest.stderr.txt",
      liveDesktopDogfoodArtifactPath: "test-results/subagent-desktop-dogfood/latest.json",
    });
  });

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
    expect(evidence.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "test-results/subagent-live-smoke/latest.json", kind: "json" }),
    ]));
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
      actualOutcome: "Passed: proved long_context_process authority for long-context-run, child file approval approval-run, and child browser approval browser-run.",
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
    expect(evidence.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "test-results/subagent-live-smoke/long-context-authority-latest.json", kind: "json" }),
      expect.objectContaining({ path: "test-results/subagent-live-smoke/approval-authority-latest.json", kind: "json" }),
      expect.objectContaining({ path: "test-results/subagent-live-smoke/browser-approval-latest.json", kind: "json" }),
    ]));
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
      actualOutcome: "Passed: succeeded workflow run workflow-run for workflow thread workflow-thread; Workflow Agent UI dogfood covered 2 baseline scenario(s); callable workflow task workflow-task-1 proved mutating child dogfood and rehydrated task/artifact/run telemetry.",
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
    expect(evidence.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "test-results/workflow-local-file-run-dogfood/latest.json", kind: "json" }),
      expect.objectContaining({ path: "test-results/workflow-agent-thread-ui-dogfood/matrix-latest.json", kind: "json" }),
      expect.objectContaining({ path: "test-results/callable-workflow-dogfood/latest.json", kind: "json" }),
      expect.objectContaining({ path: "test-results/callable-workflow-rehydration/latest.json", kind: "json" }),
    ]));
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
      actualOutcome: "Passed: succeeded workflow run workflow-run for workflow thread workflow-thread; Workflow Agent UI dogfood covered 4 broader phase-1 scenario(s); callable workflow task workflow-task-1 proved mutating child dogfood and rehydrated task/artifact/run telemetry.",
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
      actualOutcome: "Passed: proved ordinary Stop is blocked by lease-review for sub-agent Review worker, stale lease lease-stale no longer blocked Stop/Restart, and untracked runtime untracked-llama:4401 stayed external-only.",
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
    expect(evidence.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "test-results/local-runtime-control-proof/latest.json", kind: "json" }),
      expect.objectContaining({ path: "test-results/local-runtime-control-proof-gate/latest.json", kind: "json" }),
    ]));
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
      actualOutcome: "Passed: repaired runs run-active and barriers barrier-required, rehydrated 1 mailbox state and 1 artifact pointer; covered lifecycle edges restart, stop, detach, cancel, retry, timeout, partial_result.",
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
          evidence: expect.arrayContaining(["parentMailboxEventIds: parent-mailbox-grouped-completion", "parentMailboxChildRefsResolved: true"]),
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
          capabilities: expect.arrayContaining(["restart_edge", "stop_edge", "detach_edge", "cancel_edge", "retry_edge", "timeout_edge", "partial_result_edge"]),
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
    expect(evidence.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "test-results/subagent-replay-diagnostics/latest.json", kind: "json" }),
      expect.objectContaining({ path: "test-results/subagent-replay-diagnostics/latest-fixture-evidence.json", kind: "json" }),
      expect.objectContaining({ path: "test-results/subagent-lifecycle-edges/latest.json", kind: "json" }),
    ]));
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
    expect(evidence.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "test-results/subagent-lifecycle-edges/latest.json", kind: "json" }),
    ]));
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
      actualOutcome: expect.stringContaining(`Passed: passed ${REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.length}/${REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.length} required scenario(s), observed ${REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.length} total scenario(s), with ${REQUIRED_DESKTOP_VISUAL_ASSERTIONS.length}/${REQUIRED_DESKTOP_VISUAL_ASSERTIONS.length} visual assertion(s), ${REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS.length}/${REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS.length} maturity assertion(s)`),
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
          capabilities: expect.arrayContaining(["lifecycle_edge_desktop_behavior", "timeout_edge", "partial_result_edge", "retry_edge", "detach_edge", "parent_stop_cascade"]),
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
          result: expect.stringContaining(`Passed ${REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.length}/${REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.length} required scenario`),
        }),
        expect.objectContaining({
          label: "Desktop runtime ownership",
          result: expect.stringContaining("desktop-dogfood-local-runtime-lease"),
        }),
      ]),
    });
    expect(evidence.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "test-results/subagent-desktop-dogfood/latest.json", kind: "json" }),
      expect.objectContaining({ path: "test-results/subagent-desktop-dogfood/collapsed-desktop.png", kind: "screenshot" }),
      expect.objectContaining({ path: "test-results/subagent-desktop-dogfood/expanded-accessibility.json", kind: "json" }),
    ]));
  });

  it("classifies missing GMI credentials as an environmental blocker without secret leakage", () => {
    const evidence = buildSubagentLiveConfidenceEvidence({
      plan: buildSubagentLiveConfidencePlan({
        command: {
          executable: "pnpm",
          args: ["run", "test:subagents:live"],
          display: "GMI_CLOUD_API_KEY_FILE=/secret/path pnpm run test:subagents:live",
        },
      }),
      startedAt: "2026-06-10T23:00:00.000Z",
      completedAt: "2026-06-10T23:01:00.000Z",
      commandResult: {
        exitCode: 1,
        stdout: "",
        stderr: "Set GMI_CLOUD_API_KEY, GMI_API_KEY, GMI_CLOUD_API_KEY_FILE, or provide gmicloud-api-key.txt for sub-agent Pi tool live smoke.",
      },
      liveSmokeArtifact: undefined,
    });

    expect(evidence.status).toBe("blocked");
    expect(evidence.closeoutAnswer.kind).toBe("blocked");
    expect(evidence.classifiedBlockers).toEqual([
      expect.objectContaining({
        kind: "credential_missing",
        classifiedAsEnvironmental: true,
      }),
    ]);
    expect(JSON.stringify(evidence)).not.toContain("/secret/path");
  });

  it("classifies timeouts as retryable live environmental blockers", () => {
    const evidence = buildSubagentLiveConfidenceEvidence({
      plan: buildSubagentLiveConfidencePlan(),
      startedAt: "2026-06-10T23:00:00.000Z",
      completedAt: "2026-06-10T23:10:00.000Z",
      commandResult: { exitCode: 1, timedOut: true, stdout: "partial", stderr: "" },
      liveSmokeArtifact: liveSmokeArtifact(),
    });

    expect(evidence.status).toBe("blocked");
    expect(evidence.classifiedBlockers).toEqual([
      expect.objectContaining({
        kind: "network",
        summary: expect.stringContaining("exceeded the configured timeout"),
      }),
    ]);
    expect(renderSubagentLiveConfidenceMarkdown(evidence)).toContain("network:");
  });

  it("classifies interrupted live runs as harness blockers", () => {
    const evidence = buildSubagentLiveConfidenceEvidence({
      plan: buildSubagentLiveConfidencePlan({ sliceKind: "workflow_symphony" }),
      startedAt: "2026-06-10T23:00:00.000Z",
      completedAt: "2026-06-10T23:01:00.000Z",
      commandResult: {
        exitCode: 1,
        interrupted: true,
        interruptSignal: "SIGTERM",
        stdout: "partial live output",
        stderr: "",
      },
      liveWorkflowArtifact: liveWorkflowArtifact(),
    });

    expect(evidence.status).toBe("blocked");
    expect(evidence.classifiedBlockers).toEqual([
      expect.objectContaining({
        kind: "harness_interrupted",
        summary: expect.stringContaining("SIGTERM"),
        classifiedAsEnvironmental: true,
      }),
    ]);
    expect(renderSubagentLiveConfidenceMarkdown(evidence)).toContain("harness_interrupted:");
  });

  it("cleans up a spawned process tree when the live runner is aborted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "subagent-live-abort-"));
    const pidPath = join(dir, "pids.txt");
    const controller = new AbortController();
    const script = [
      "const { spawn } = require('node:child_process');",
      "const fs = require('node:fs');",
      `const pidPath = ${JSON.stringify(pidPath)};`,
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "fs.writeFileSync(pidPath, `${process.pid}\\n${child.pid}\\n`);",
      "setInterval(() => {}, 1000);",
    ].join(" ");

    const run = runBoundedCommand({
      executable: process.execPath,
      args: ["-e", script],
      display: "node nested live-confidence abort fixture",
    }, {
      timeoutMs: 30_000,
      abortSignal: controller.signal,
    });
    const [parentPid, childPid] = await waitForPidFile(pidPath);

    controller.abort({ signal: "SIGINT" });
    const result = await run;

    expect(result).toMatchObject({
      exitCode: 1,
      timedOut: false,
      interrupted: true,
      interruptSignal: "SIGINT",
    });
    await waitForProcessExit(parentPid);
    await waitForProcessExit(childPid);
  });

  it("classifies missing worktree dependencies as an environmental blocker", () => {
    const evidence = buildSubagentLiveConfidenceEvidence({
      plan: buildSubagentLiveConfidencePlan({ sliceKind: "local_runtime" }),
      startedAt: "2026-06-10T23:00:00.000Z",
      completedAt: "2026-06-10T23:01:00.000Z",
      commandResult: {
        exitCode: 254,
        stdout: [
          'ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "vitest" not found',
          "Local package.json exists, but node_modules missing, did you mean to install?",
        ].join("\n"),
        stderr: "",
      },
      liveLocalRuntimeArtifact: undefined,
      liveLocalRuntimeGateArtifact: undefined,
    });

    expect(evidence.status).toBe("blocked");
    expect(evidence.closeoutAnswer).toMatchObject({
      kind: "blocked",
      summary: expect.stringContaining("missing local package dependencies"),
    });
    expect(evidence.classifiedBlockers).toEqual([
      expect.objectContaining({
        kind: "dependency_missing",
        classifiedAsEnvironmental: true,
        nextStep: expect.stringContaining("pnpm install --frozen-lockfile"),
      }),
    ]);
    expect(evidence.productIssues).toEqual([]);
    expect(renderSubagentLiveConfidenceMarkdown(evidence)).toContain("dependency_missing:");
  });

  it("classifies native rebuild collisions as environmental instead of product failures", () => {
    const evidence = buildSubagentLiveConfidenceEvidence({
      plan: buildSubagentLiveConfidencePlan({ sliceKind: "desktop_dogfood" }),
      startedAt: "2026-06-10T23:00:00.000Z",
      completedAt: "2026-06-10T23:01:00.000Z",
      commandResult: {
        exitCode: 1,
        stdout: "",
        stderr: "gyp ERR! ENOENT: no such file or directory, lstat '/repo/node_modules/.pnpm/better-sqlite3/build/node_gyp_bins'",
      },
    });

    expect(evidence.status).toBe("blocked");
    expect(evidence.classifiedBlockers).toEqual([
      expect.objectContaining({
        kind: "native_rebuild_collision",
        classifiedAsEnvironmental: true,
      }),
    ]);
    expect(evidence.productIssues).toEqual([]);
    expect(renderSubagentLiveConfidenceMarkdown(evidence)).toContain("native_rebuild_collision:");
  });

  it("classifies missing first-party workflow connector snapshots as environmental blockers", () => {
    const evidence = buildSubagentLiveConfidenceEvidence({
      plan: buildSubagentLiveConfidencePlan({ sliceKind: "workflow_symphony_broader" }),
      startedAt: "2026-06-10T23:00:00.000Z",
      completedAt: "2026-06-10T23:03:00.000Z",
      commandResult: {
        exitCode: 1,
        stdout: "Workflow Agent UI dogfood classification: environment/snapshot issue\nSnapshot copy requested, but the snapshot root did not contain userData/workspace directories.",
        stderr: "Workflow connector is not available: Gmail (google.gmail) is not_configured; Google Drive (google.drive) is not_configured. Connect the requested account or launch with a credentialed snapshot before compiling this workflow.",
      },
      liveWorkflowArtifact: liveWorkflowArtifact(),
      liveWorkflowUiDogfoodArtifact: {
        ...workflowUiBroaderDogfoodMatrixArtifact(),
        ok: false,
        results: [],
        failure: {
          scenario: "gmail-20-metadata-readonly-validation",
          classification: "environment/snapshot issue",
        },
      },
      liveCallableWorkflowDogfoodArtifact: callableWorkflowDogfoodArtifact(),
      liveCallableWorkflowRehydrationArtifact: callableWorkflowRehydrationArtifact(),
    });

    expect(evidence.status).toBe("blocked");
    expect(evidence.classifiedBlockers).toEqual([
      expect.objectContaining({
        kind: "credentialed_snapshot_missing",
        classifiedAsEnvironmental: true,
        nextStep: expect.stringContaining("credentialed Ambient snapshot"),
      }),
    ]);
    expect(evidence.capabilitiesObserved).toEqual(expect.arrayContaining([
      "workflow_launch",
      "ambient_runtime_call",
      "artifact_link",
      "checkpoint_output",
      "mutating_child_workflow",
      "child_scoped_approval",
      "isolated_child_worktree",
      "parent_blocking_workflow",
      "denied_workflow_scope",
      "workflow_task_rehydration",
      "child_workflow_provenance",
    ]));
    expect(evidence.capabilitiesObserved).not.toContain("workflow_agent_ui_dogfood");
    expect(evidence.capabilitiesObserved).not.toContain("phase1_workflow_ui_dogfood");
    expect(evidence.productIssues).toEqual([]);
    expect(renderSubagentLiveConfidenceMarkdown(evidence)).toContain("credentialed_snapshot_missing:");
  });

  it("classifies non-environmental failures as product issues", () => {
    const evidence = buildSubagentLiveConfidenceEvidence({
      plan: buildSubagentLiveConfidencePlan(),
      startedAt: "2026-06-10T23:00:00.000Z",
      completedAt: "2026-06-10T23:01:00.000Z",
      commandResult: { exitCode: 1, stdout: "assertion failed", stderr: "" },
      liveSmokeArtifact: { ...liveSmokeArtifact(), childAssistantText: "missing sentinel" },
    });

    expect(evidence.status).toBe("failed");
    expect(evidence.productIssues).toEqual([
      expect.objectContaining({
        severity: "p1",
        owner: "subagents",
      }),
    ]);
  });

  it("writes JSON, Markdown, and sanitized command output artifacts", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "subagent-live-confidence-"));
    const outputPath = join(outputDir, "latest.json");
    const report = await runSubagentLiveConfidence({
      outputPath,
      startedAt: "2026-06-10T23:00:00.000Z",
      completedAt: "2026-06-10T23:01:00.000Z",
      liveSmokeArtifact: liveSmokeArtifact(),
      runCommand: async () => ({
        exitCode: 0,
        stdout: "GMI_CLOUD_API_KEY=sk-test-secret",
        stderr: "",
      }),
    });

    expect(report.status).toBe("passed");
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({ status: "passed" });
    expect(await readFile(outputPath.replace(/\.json$/i, ".md"), "utf8")).toContain("Sub-Agent Live Confidence");
    expect(await readFile(outputPath.replace(/\.json$/i, ".md"), "utf8")).toContain("## Hypothesis");
    expect(await readFile(outputPath.replace(/\.json$/i, ".md"), "utf8")).toContain("Closeout: saw_live");
    expect(await readFile(outputPath.replace(/\.json$/i, ".stdout.txt"), "utf8")).toContain("GMI_CLOUD_API_KEY=<redacted>");
  });

  it("validates required live smoke proof and redacts secret-like text", () => {
    expect(validateLiveSmokeArtifact(liveSmokeArtifact())).toEqual({ valid: true, issues: [] });
    expect(validateLiveSmokeArtifact({ ...liveSmokeArtifact(), assistantText: "missing" }).issues).toContain("Live smoke artifact is missing the parent completion sentinel.");
    expect(validateLongContextAuthorityArtifact(longContextAuthorityArtifact())).toEqual({ valid: true, issues: [] });
    expect(validateLongContextAuthorityArtifact({
      ...longContextAuthorityArtifact(),
      deniedContentLeaked: true,
    }).issues).toContain("denied sibling content leaked into the child transcript.");
    expect(validateApprovalAuthorityArtifact(approvalAuthorityArtifact())).toEqual({ valid: true, issues: [] });
    expect(validateApprovalAuthorityArtifact({
      ...approvalAuthorityArtifact(),
      waitDetails: { ...approvalAuthorityArtifact().waitDetails, synthesisAllowed: true },
    }).issues).toContain("wait_agent did not leave the parent blocked on a non-synthesizable child approval request.");
    expect(validateBrowserApprovalAuthorityArtifact(browserApprovalArtifact())).toEqual({ valid: true, issues: [] });
    expect(validateBrowserApprovalAuthorityArtifact({
      ...browserApprovalArtifact(),
      permissionResponses: [],
    }).issues).toContain("artifact is missing child-thread scoped browser approval response.");
    expect(validateChildAuthorityConfidenceArtifacts({
      longContextArtifact: longContextAuthorityArtifact(),
      approvalAuthorityArtifact: approvalAuthorityArtifact(),
      browserApprovalArtifact: browserApprovalArtifact(),
    })).toMatchObject({ valid: true, issues: [] });
    expect(validateWorkflowDogfoodArtifact(liveWorkflowArtifact())).toEqual({ valid: true, issues: [] });
    expect(validateWorkflowDogfoodArtifact({ ...liveWorkflowArtifact(), checkpoint: undefined }).issues).toContain("Live workflow dogfood artifact is missing checkpoint output.");
    expect(validateCallableWorkflowDogfoodConfidenceArtifact(callableWorkflowDogfoodArtifact())).toEqual({ valid: true, issues: [] });
    expect(validateCallableWorkflowDogfoodConfidenceArtifact({
      ...callableWorkflowDogfoodArtifact(),
      mutationOutput: {
        ...callableWorkflowDogfoodArtifact().mutationOutput,
        parentWorkspaceUnchanged: false,
      },
    }).issues).toContain("Callable workflow dogfood mutation output must prove parentWorkspaceUnchanged.");
    expect(validateCallableWorkflowDogfoodConfidenceArtifact({
      ...callableWorkflowDogfoodArtifact(),
      launchCard: {
        ...callableWorkflowDogfoodArtifact().launchCard,
        defaultCollapsed: false,
      },
    }).issues).toContain("Callable workflow dogfood launch card must be default collapsed.");
    expect(validateCallableWorkflowDogfoodConfidenceArtifact({
      ...callableWorkflowDogfoodArtifact(),
      maturityAssertions: {
        ...callableWorkflowDogfoodArtifact().maturityAssertions,
        workflow_launch_card_bounds: {
          ...callableWorkflowDogfoodArtifact().maturityAssertions.workflow_launch_card_bounds,
          status: "failed",
        },
      },
    }).issues).toContain("Callable workflow dogfood maturity assertion workflow_launch_card_bounds status is failed; expected passed.");
    const {
      workflow_denied_child_scope: _dogfoodDeniedScope,
      ...dogfoodMissingMaturity
    } = callableWorkflowDogfoodArtifact().maturityAssertions;
    expect(validateCallableWorkflowDogfoodConfidenceArtifact({
      ...callableWorkflowDogfoodArtifact(),
      maturityAssertions: dogfoodMissingMaturity,
    }).issues).toContain("Callable workflow dogfood maturity assertion workflow_denied_child_scope is missing.");
    expect(validateCallableWorkflowRehydrationConfidenceArtifact(callableWorkflowRehydrationArtifact())).toEqual({ valid: true, issues: [] });
    expect(validateCallableWorkflowRehydrationConfidenceArtifact({
      ...callableWorkflowRehydrationArtifact(),
      rehydration: {
        ...callableWorkflowRehydrationArtifact().rehydration,
        usageHydrated: false,
      },
    }).issues).toContain("Callable workflow rehydration proof is missing usageHydrated.");
    expect(validateCallableWorkflowRehydrationConfidenceArtifact({
      ...callableWorkflowRehydrationArtifact(),
      maturityAssertions: {
        ...callableWorkflowRehydrationArtifact().maturityAssertions,
        workflow_rehydrated_progress_usage: {
          ...callableWorkflowRehydrationArtifact().maturityAssertions.workflow_rehydrated_progress_usage,
          evidence: [
            "passed: progressEvents=4",
            "failed: tokens=0",
          ],
        },
      },
    }).issues).toContain(
      "Callable workflow rehydration maturity assertion workflow_rehydrated_progress_usage must record only passed evidence entries.",
    );
    const {
      workflow_rehydrated_child_provenance: _rehydrationChildProvenance,
      ...rehydrationMissingMaturity
    } = callableWorkflowRehydrationArtifact().maturityAssertions;
    expect(validateCallableWorkflowRehydrationConfidenceArtifact({
      ...callableWorkflowRehydrationArtifact(),
      maturityAssertions: rehydrationMissingMaturity,
    }).issues).toContain("Callable workflow rehydration maturity assertion workflow_rehydrated_child_provenance is missing.");
    expect(validateWorkflowSymphonyConfidenceArtifacts({
      liveWorkflowArtifact: liveWorkflowArtifact(),
      workflowUiDogfoodArtifact: workflowUiDogfoodMatrixArtifact(),
      callableWorkflowDogfoodArtifact: callableWorkflowDogfoodArtifact(),
      callableWorkflowRehydrationArtifact: callableWorkflowRehydrationArtifact(),
    })).toMatchObject({ valid: true, issues: [] });
    expect(validateWorkflowSymphonyConfidenceArtifacts({
      liveWorkflowArtifact: liveWorkflowArtifact(),
      workflowUiDogfoodArtifact: workflowUiBroaderDogfoodMatrixArtifact(),
      callableWorkflowDogfoodArtifact: callableWorkflowDogfoodArtifact(),
      callableWorkflowRehydrationArtifact: callableWorkflowRehydrationArtifact(),
      workflowUiDogfoodProfile: "broader",
    })).toMatchObject({ valid: true, issues: [] });
    expect(validateWorkflowUiDogfoodMatrixArtifact(workflowUiDogfoodMatrixArtifact())).toEqual({ valid: true, issues: [] });
    expect(validateWorkflowUiDogfoodMatrixArtifact(workflowUiBroaderDogfoodMatrixArtifact(), {
      expectedSuite: "phase1-live",
      requiredScenarios: [
        "gmail-20-metadata-readonly-validation",
        "downloads-document-categorization",
        "public-source-browser",
        "current-web-recipe-report",
      ],
    })).toEqual({ valid: true, issues: [] });
    expect(validateWorkflowSymphonyConfidenceArtifacts({
      liveWorkflowArtifact: liveWorkflowArtifact(),
      workflowUiDogfoodArtifact: workflowUiDogfoodMatrixArtifact(),
      callableWorkflowDogfoodArtifact: callableWorkflowDogfoodArtifact(),
      callableWorkflowRehydrationArtifact: callableWorkflowRehydrationArtifact(),
      workflowUiDogfoodProfile: "broader",
    }).issues).toEqual(expect.arrayContaining([
      "Workflow Agent UI dogfood matrix suite is phase0-live; expected phase1-live.",
      "Workflow Agent UI dogfood matrix is missing scenario gmail-20-metadata-readonly-validation.",
      "Workflow Agent UI dogfood matrix is missing scenario current-web-recipe-report.",
      "Workflow Agent UI dogfood matrix has 2 result(s); expected at least 4.",
    ]));
    expect(validateWorkflowSymphonyConfidenceArtifacts({
      liveWorkflowArtifact: liveWorkflowArtifact(),
      workflowUiDogfoodArtifact: {
        ...workflowUiBroaderDogfoodMatrixArtifact(),
        results: workflowUiBroaderDogfoodMatrixArtifact().results.map(({ launch: _launch, ...result }) => result),
      },
      callableWorkflowDogfoodArtifact: callableWorkflowDogfoodArtifact(),
      callableWorkflowRehydrationArtifact: callableWorkflowRehydrationArtifact(),
      workflowUiDogfoodProfile: "broader",
    }).issues).toEqual(expect.arrayContaining([
      "Workflow Agent UI dogfood scenario gmail-20-metadata-readonly-validation launch workspaceMode is missing; expected shared-snapshot-temp-copy.",
      "Workflow Agent UI dogfood scenario gmail-20-metadata-readonly-validation Google Workspace status is missing; expected configured.",
    ]));
    expect(validateWorkflowUiDogfoodMatrixArtifact({
      ...workflowUiDogfoodMatrixArtifact(),
      results: [{
        ...workflowUiDogfoodMatrixArtifact().results[0],
        runEvidence: {
          ...workflowUiDogfoodMatrixArtifact().results[0].runEvidence,
          outputSignals: 0,
        },
      }],
    }).issues).toEqual(expect.arrayContaining([
      "Workflow Agent UI dogfood matrix has 1 result(s); expected at least 2.",
      "Workflow Agent UI dogfood scenario vocabulary-quiz is missing output signal evidence.",
    ]));
    expect(validateWorkflowSymphonyConfidenceArtifacts({
      liveWorkflowArtifact: liveWorkflowArtifact(),
      workflowUiDogfoodArtifact: undefined,
      callableWorkflowDogfoodArtifact: undefined,
      callableWorkflowRehydrationArtifact: undefined,
    }).issues).toEqual(expect.arrayContaining([
      "Workflow Agent UI dogfood matrix artifact is missing.",
      "Callable workflow dogfood artifact is missing.",
      "Callable workflow rehydration artifact is missing.",
    ]));
    expect(validateDesktopDogfoodConfidenceArtifact(desktopDogfoodArtifact())).toEqual({ valid: true, issues: [] });
    expect(validateDesktopDogfoodConfidenceArtifact({
      ...desktopDogfoodArtifact(),
      checks: {
        ...desktopDogfoodArtifact().checks,
        narrow: {
          ...desktopDogfoodArtifact().checks.narrow,
          criticalOverlapCount: 1,
        },
      },
      visualAssertions: {
        ...desktopDogfoodArtifact().visualAssertions,
        layout_safety: {
          ...desktopDogfoodArtifact().visualAssertions.layout_safety,
          status: "failed",
        },
      },
    }).issues).toEqual(expect.arrayContaining([
      "Desktop dogfood narrow view reports 1 critical overlaps.",
      "Desktop dogfood visual assertion layout_safety status is failed; expected passed.",
    ]));
    expect(validateDesktopDogfoodConfidenceArtifact({
      ...desktopDogfoodArtifact(),
      checks: {
        ...desktopDogfoodArtifact().checks,
        operatorBehavior: {
          ...desktopDogfoodArtifact().checks.operatorBehavior,
          typedBarrierConsequenceVisible: false,
        },
      },
    }).issues).toContain("Desktop dogfood operatorBehavior typedBarrierConsequenceVisible is not true.");
    expect(validateDesktopDogfoodConfidenceArtifact({
      ...desktopDogfoodArtifact(),
      checks: {
        ...desktopDogfoodArtifact().checks,
        approvalForwarding: {
          ...desktopDogfoodArtifact().checks.approvalForwarding,
          childThreadScopeVisible: false,
          forwardedAndRequestSameChild: false,
        },
      },
    }).issues).toEqual(expect.arrayContaining([
      "Desktop dogfood approvalForwarding childThreadScopeVisible is not true.",
      "Desktop dogfood approvalForwarding forwardedAndRequestSameChild is not true.",
    ]));
    expect(validateLocalRuntimeControlProofArtifact(localRuntimeControlProofArtifact(), localRuntimeControlProofGateArtifact())).toEqual({ valid: true, issues: [] });
    expect(validateLocalRuntimeControlProofArtifact({
      ...localRuntimeControlProofArtifact(),
      scenarios: {
        ...localRuntimeControlProofArtifact().scenarios,
        "active-subagent-stop-blocker": {
          ...localRuntimeControlProofArtifact().scenarios["active-subagent-stop-blocker"],
          ordinaryStopAllowed: true,
          affectedSubagents: [],
        },
      },
    }, localRuntimeControlProofGateArtifact()).issues).toEqual(expect.arrayContaining([
      "Sub-agent stop-blocker proof did not prove ordinaryStopAllowed=false.",
      "Sub-agent stop-blocker proof did not list affected sub-agents.",
    ]));
    expect(validateLocalRuntimeControlProofArtifact({
      ...localRuntimeControlProofArtifact(),
      scenarios: {
        ...localRuntimeControlProofArtifact().scenarios,
        "untracked-runtime-safety": {
          ...localRuntimeControlProofArtifact().scenarios["untracked-runtime-safety"],
          nextSafeActions: [{
            action: "stop-runtime",
            safety: "requires-approval",
            toolName: "ambient_local_model_runtime_stop",
          }],
        },
      },
    }, localRuntimeControlProofGateArtifact()).issues).toContain("Untracked runtime proof exposed lifecycle mutation tools: ambient_local_model_runtime_stop.");
    expect(validateLocalRuntimeControlProofArtifact({
      ...localRuntimeControlProofArtifact(),
      scenarios: {
        ...localRuntimeControlProofArtifact().scenarios,
        "untracked-runtime-safety": {
          ...localRuntimeControlProofArtifact().scenarios["untracked-runtime-safety"],
          repeatedObservations: [
            ...localRuntimeControlProofArtifact().scenarios["untracked-runtime-safety"].repeatedObservations.slice(0, 2),
            {
              ...localRuntimeControlProofArtifact().scenarios["untracked-runtime-safety"].repeatedObservations[2],
              ordinaryStopAllowed: true,
            },
          ],
        },
      },
    }, localRuntimeControlProofGateArtifact()).issues).toContain(
      "Untracked runtime repeated observation lifecycle_action_preview did not keep ordinaryStopAllowed=false.",
    );
    expect(validateLocalRuntimeControlProofArtifact({
      ...localRuntimeControlProofArtifact(),
      scenarios: {
        ...localRuntimeControlProofArtifact().scenarios,
        "stale-lease-recovery": {
          ...localRuntimeControlProofArtifact().scenarios["stale-lease-recovery"],
          ordinaryStopAllowed: false,
          activeLeaseCount: 1,
          blockerLeaseIds: ["lease-stale"],
          nextSafeActions: [{
            action: "force-stop-runtime",
            safety: "requires-approval",
            toolName: "ambient_local_model_runtime_stop",
          }],
        },
      },
    }, localRuntimeControlProofGateArtifact()).issues).toEqual(expect.arrayContaining([
      "Stale lease recovery proof did not prove ordinaryStopAllowed=true.",
      "Stale lease recovery proof did not prove activeLeaseCount=0.",
      "Stale lease recovery proof still reports blockerLeaseIds.",
      "Stale lease recovery proof still offered forced ownership resolution actions.",
    ]));
    expect(sanitizeEvidenceText("api_key=abcdef1234567890 and sk-test-secret-value")).toBe("api_key=<redacted> and sk-<redacted>");
  });

  it("validates restart repair replay diagnostics", () => {
    expect(validateSubagentRestartRepairArtifact(restartRepairDiagnosticsArtifact(), restartRepairReplayEvidence())).toEqual({ valid: true, issues: [] });
    expect(validateSubagentRestartRepairConfidenceArtifacts(
      restartRepairDiagnosticsArtifact(),
      restartRepairReplayEvidence(),
      lifecycleEdgeArtifact(),
    )).toMatchObject({ valid: true, issues: [] });
    expect(validateSubagentRestartRepairConfidenceArtifacts(
      restartRepairDiagnosticsArtifact(),
      restartRepairReplayEvidence(),
      undefined,
    ).issues).toContain("Sub-agent lifecycle edge artifact is missing.");
    expect(validateSubagentRestartRepairArtifact({
      ...restartRepairDiagnosticsArtifact(),
      replayEvidence: {
        ...restartRepairReplayEvidence(),
        restartRepair: {
          ...restartRepairReplayEvidence().restartRepair,
          observedIssueKinds: ["active_run_interrupted"],
          repairedRunIds: [],
        },
      },
    }, restartRepairReplayEvidence()).issues).toEqual(expect.arrayContaining([
      "Sub-agent restart repair did not observe expected issue kinds: missing_lifecycle_stop, missing_spawn_edge, missing_result_artifact, dangling_spawn_edge, orphan_child_thread, dangling_wait_barrier_child",
      "Sub-agent restart repair repaired run ids are missing.",
    ]));
    expect(validateSubagentRestartRepairArtifact({
      ...restartRepairDiagnosticsArtifact(),
      replayEvidence: {
        ...restartRepairReplayEvidence(),
        rehydration: {
          ...restartRepairReplayEvidence().rehydration,
          resultArtifactPointers: [],
          artifactPointerIntegrity: {
            ...restartRepairReplayEvidence().rehydration.artifactPointerIntegrity,
            missingResultArtifactsDiagnosed: false,
          },
        },
      },
    }, restartRepairReplayEvidence()).issues).toEqual(expect.arrayContaining([
      "Sub-agent restart repair rehydration resultArtifactPointers are missing.",
      "Sub-agent restart repair rehydration integrity missingResultArtifactsDiagnosed is not true.",
    ]));
  });

  it("validates lifecycle edge proof artifacts", () => {
    expect(validateSubagentLifecycleEdgeArtifact(lifecycleEdgeArtifact())).toEqual({ valid: true, issues: [] });
    expect(validateSubagentLifecycleEdgeArtifact({
      ...lifecycleEdgeArtifact(),
      summary: {
        ...lifecycleEdgeArtifact().summary,
        coveredEdgeKinds: ["restart", "stop", "detach", "cancel", "retry", "partial_result"],
        missingEdgeKinds: ["timeout"],
        unsafeEdgeIds: ["edge-partial-result"],
      },
      edges: lifecycleEdgeArtifact().edges.filter((edge) => edge.kind !== "timeout"),
    }).issues).toEqual(expect.arrayContaining([
      "Sub-agent lifecycle edge proof is missing edge kinds: timeout.",
      "Sub-agent lifecycle edge proof summary reports missing edge kinds: timeout.",
      "Sub-agent lifecycle edge proof summary reports unsafe edges: edge-partial-result.",
    ]));
    expect(validateSubagentLifecycleEdgeArtifact({
      ...lifecycleEdgeArtifact(),
      edges: lifecycleEdgeArtifact().edges.map((edge) => edge.kind === "partial_result"
        ? {
            ...edge,
            partialResult: {
              ...edge.partialResult,
              failedChildNotSynthesized: false,
            },
          }
        : edge),
    }).issues).toContain("Sub-agent lifecycle partial-result edge edge-partial-result did not exclude failed child output.");
  });
});

function liveSmokeArtifact() {
  return {
    createdAt: "2026-06-10T23:00:00.000Z",
    provider: "GMI Cloud",
    assistantText: "SUBAGENT_LIVE_DONE",
    childAssistantText: "SUBAGENT_CHILD_DONE",
    run: {
      id: "child-run",
      status: "completed",
      childThreadId: "child-thread",
      resultArtifact: { status: "completed" },
      runtimeEvents: [
        { type: "started" },
        { type: "assistant_delta" },
        { type: "completed" },
      ],
    },
  };
}

function longContextAuthorityArtifact() {
  return {
    createdAt: "2026-06-10T23:00:00.000Z",
    provider: "GMI Cloud",
    run: {
      id: "long-context-run",
      status: "completed",
      childThreadId: "long-context-child",
      resultArtifact: { status: "completed" },
      toolScopeSnapshots: [{
        resolverInputs: {
          childAuthorityProfile: {
            resourceScopes: {
              filesystem: {
                readRoots: ["/workspace/allowed/notes.txt", "/workspace/allowed/brief.pdf", "/workspace/allowed/brief.docx"],
                writeRoots: [],
                readDecision: "allow",
                writeDecision: "deny",
              },
            },
          },
        },
      }],
    },
    childToolNames: ["read", "long_context_process"],
    childTranscript: [
      "TEXT_AUTHORITY_OK",
      "PDF_AUTHORITY_OK",
      "OFFICE_AUTHORITY_OK",
      "long_context_process path is outside the current workspace authority",
    ].join("\n"),
    deniedContentLeaked: false,
  };
}

function approvalAuthorityArtifact() {
  const run = {
    id: "approval-run",
    status: "needs_attention",
    childThreadId: "approval-child",
    resultArtifact: undefined,
  };
  return {
    createdAt: "2026-06-10T23:00:00.000Z",
    provider: "GMI Cloud",
    run,
    waitDetails: {
      status: "needs_attention",
      waitSatisfied: false,
      synthesisAllowed: false,
      waitNotice: "Child requested approval; parent approval was forwarded to the parent mailbox and the parent remains blocked on this child.",
    },
    pendingPermissions: [{
      id: "approval-1",
      threadId: run.childThreadId,
      toolName: "read",
      grantActionKind: "file_content_read",
      grantTargetKind: "path",
      grantTargetLabel: "/workspace/approval-needed.txt",
    }],
    parentMailboxEvents: [{
      id: "mailbox-approval-1",
      type: "subagent.child_approval_requested",
      deliveryState: "queued",
      payload: {
        childRunId: run.id,
        childThreadId: run.childThreadId,
        approvalId: "approval-1",
        requestedToolId: "read",
        requestedAction: "file_content_read",
        parentBlockingState: {
          action: "forward_child_approval_then_wait",
          childRunId: run.id,
          childThreadId: run.childThreadId,
          resumeParentBlocking: true,
        },
      },
    }],
    childTranscript: "Child runtime is waiting for parent approval.",
    deniedContentLeaked: false,
    evidence: {
      dogfoodRunEvidence: {
        details: {
          schemaVersion: "ambient-subagent-live-approval-authority-evidence-v1",
          childPausedForApproval: true,
          parentRemainedBlocked: true,
          approvalForwardedToParent: true,
        },
      },
    },
  };
}

function browserApprovalArtifact() {
  const run = {
    id: "browser-run",
    status: "running",
    childThreadId: "browser-child",
    resultArtifact: undefined,
    runEvents: [
      { type: "subagent.approval_requested" },
      { type: "subagent.child_approval_forwarded" },
      { type: "subagent.approval_response.consumed" },
    ],
  };
  return {
    createdAt: "2026-06-10T23:00:00.000Z",
    provider: "GMI Cloud",
    parentPermissionMode: "full-access",
    run,
    waitDetails: {
      status: "needs_attention",
      waitSatisfied: false,
      synthesisAllowed: false,
      run: {
        status: "needs_attention",
      },
      waitNotice: "Child requested approval; parent approval was forwarded to the parent mailbox and the parent remains blocked on this child.",
    },
    resumeDetails: {
      status: "running",
      synthesisAllowed: false,
      parentResolution: { status: "blocked", canSynthesize: false },
    },
    pendingBeforeApproval: [{
      id: "browser-approval-1",
      threadId: run.childThreadId,
      toolName: "browser_content",
      grantActionKind: "browser_network",
      grantTargetKind: "browser_origin",
      grantTargetLabel: "example.com",
      grantConditions: {
        childRunId: run.id,
        childThreadId: run.childThreadId,
        domain: "example.com",
        source: "subagent-child-browser-authority",
      },
    }],
    permissionResponses: [{ id: "browser-approval-1", response: "always_thread" }],
    parentMailboxEvents: [{
      id: "mailbox-browser-approval-1",
      type: "subagent.child_approval_requested",
      deliveryState: "consumed",
      payload: {
        childRunId: run.id,
        childThreadId: run.childThreadId,
        approvalId: "browser-approval-1",
        requestedToolId: "browser_content",
        requestedAction: "browser_network",
        parentBlockingState: {
          action: "forward_child_approval_then_wait",
          childRunId: run.id,
          childThreadId: run.childThreadId,
          resumeParentBlocking: true,
        },
      },
    }],
    childTranscriptBeforeApproval: "Child runtime is waiting for parent approval.",
    childTranscriptAfterResume: "Approval response delivered back to child runtime.",
  };
}

function liveWorkflowArtifact() {
  return {
    run: { id: "workflow-run", status: "succeeded" },
    artifact: { id: "workflow-artifact", workflowThreadId: "workflow-thread" },
    events: 7,
    fileReads: 2,
    modelCalls: [{ task: "dogfood.local_file_report", status: "succeeded", latencyMs: 1234 }],
    checkpoint: {
      files: ["local-report/events.md", "local-report/notes.txt"],
      report: { report: "Story time, picnic, museum, registration, and travel notes." },
    },
  };
}

function workflowUiDogfoodMatrixArtifact() {
  return {
    ok: true,
    startedAt: "2026-06-10T23:00:00.000Z",
    finishedAt: "2026-06-10T23:04:00.000Z",
    suite: "phase0-live",
    scenarios: ["vocabulary-quiz", "local-file-classifier"],
    results: [{
      scenario: "vocabulary-quiz",
      ok: true,
      exitCode: 0,
      elapsedMs: 62_000,
      reportPath: "/tmp/ambient/test-results/workflow-agent-thread-ui-dogfood/vocabulary-quiz/latest.json",
      runStatus: "succeeded",
      artifact: "Vocabulary Quiz",
      finalOutput: { charCount: 420, signalCount: 1, formats: ["html"], sources: ["event:output"] },
      runEvidence: {
        events: 18,
        modelCalls: 1,
        checkpoints: 2,
        approvals: 0,
        outputSignals: 2,
        runtimeInputRequests: 0,
        runtimeInputResponses: 0,
        approvalRequests: 0,
        approvalResponses: 0,
        desktopToolEnds: [],
        connectorEnds: [],
        recoveryEvents: 0,
      },
      scenarioAssertions: { passed: true, finalOutput: { charCount: 420, signalCount: 1 } },
      uiAssertions: { passed: true },
      screenshots: [{ name: "build", file: "build.png", bytes: 12_345 }],
    }, {
      scenario: "local-file-classifier",
      ok: true,
      exitCode: 0,
      elapsedMs: 81_000,
      reportPath: "/tmp/ambient/test-results/workflow-agent-thread-ui-dogfood/local-file-classifier/latest.json",
      runStatus: "succeeded",
      artifact: "Local File Classifier",
      finalOutput: { charCount: 640, signalCount: 2, formats: ["html"], sources: ["event:output", "checkpoint:final_output"] },
      runEvidence: {
        events: 26,
        modelCalls: 2,
        checkpoints: 3,
        approvals: 0,
        outputSignals: 3,
        runtimeInputRequests: 1,
        runtimeInputResponses: 1,
        approvalRequests: 0,
        approvalResponses: 0,
        desktopToolEnds: ["file_read"],
        connectorEnds: [],
        recoveryEvents: 0,
      },
      scenarioAssertions: { passed: true, finalOutput: { charCount: 640, signalCount: 2 } },
      uiAssertions: { passed: true },
      screenshots: [{ name: "runs", file: "runs.png", bytes: 23_456 }],
    }],
  };
}

function workflowUiBroaderDogfoodMatrixArtifact() {
  const base = workflowUiDogfoodMatrixArtifact();
  const scenarios = [
    "gmail-20-metadata-readonly-validation",
    "downloads-document-categorization",
    "public-source-browser",
    "current-web-recipe-report",
  ];
  return {
    ...base,
    suite: "phase1-live",
    scenarios,
    results: scenarios.map((scenario, index) => {
      const seed = base.results[index % base.results.length];
      return {
        ...seed,
        scenario,
        elapsedMs: seed.elapsedMs + (index * 1_000),
        reportPath: `/tmp/ambient/test-results/workflow-agent-thread-ui-dogfood/${scenario}/latest.json`,
        artifact: `Phase 1 ${scenario}`,
        finalOutput: {
          ...seed.finalOutput,
          charCount: seed.finalOutput.charCount + (index * 40),
          signalCount: seed.finalOutput.signalCount + 1,
        },
        runEvidence: {
          ...seed.runEvidence,
          events: seed.runEvidence.events + index,
          modelCalls: seed.runEvidence.modelCalls + 1,
          checkpoints: seed.runEvidence.checkpoints + 1,
          outputSignals: seed.runEvidence.outputSignals + 1,
        },
        scenarioAssertions: {
          ...seed.scenarioAssertions,
          finalOutput: {
            ...seed.scenarioAssertions.finalOutput,
            charCount: seed.scenarioAssertions.finalOutput.charCount + (index * 40),
            signalCount: seed.scenarioAssertions.finalOutput.signalCount + 1,
          },
        },
        screenshots: [{ name: "phase1", file: `${scenario}.png`, bytes: 30_000 + index }],
        harness: {
          name: `workflow-agent-thread-ui-dogfood/${scenario}`,
          runId: `${scenario}-run`,
          snapshotMode: "shared-snapshot-temp-copy",
          snapshotRootLabel: "shared-secrets-example-2026-05-14T02-16-32-0700",
          snapshotRootPathDigest: "abc123def456",
          pathsAreMachineLocal: true,
        },
        launch: {
          providerId: "gmi-cloud",
          providerLabel: "GMI Cloud",
          workspaceMode: "shared-snapshot-temp-copy",
          credentialConfigured: true,
          credentialSources: ["file:gmicloud-api-key.txt"],
          googleWorkspace: {
            status: "configured",
            binarySource: "gws-hardening-snapshot",
            configSource: "user-data-config",
            binaryConfigured: true,
            configConfigured: true,
          },
        },
      };
    }),
  };
}

function callableWorkflowDogfoodArtifact() {
  return {
    schemaVersion: "ambient-callable-workflow-dogfood-evidence-v1",
    createdAt: "2026-06-05T00:45:00.000Z",
    task: {
      id: "workflow-task-1",
      launchId: "launch-1",
      toolName: "ambient_workflow_symphony_map_reduce",
      sourceKind: "symphony_recipe",
      status: "succeeded",
      blocking: true,
      workflowArtifactId: "workflow-artifact-1",
      workflowRunId: "workflow-run-1",
    },
    launchCard: {
      present: true,
      riskLevel: "medium",
      estimatedAgents: 4,
      maxFanout: 3,
      maxDepth: 2,
      estimatedTokenBudget: 12000,
      estimatedLocalMemoryBytes: 268435456,
      defaultCollapsed: true,
      blocking: true,
      pauseResumeCancel: true,
      checkpointResume: "Checkpoint after every stage and resume from the last completed step.",
      approvalFailureHandling: "Forward child approval requests to the parent and resume blocking afterward.",
      requirementIds: ["launch_confirmed", "nested_fanout_limited"],
      metricTemplateIds: ["map_reduce-metric"],
      policyWarnings: ["child mutating workflow requires approval"],
    },
    childCaller: {
      kind: "subagent_child_thread",
      threadId: "child-thread-1",
      runId: "child-run-1",
      subagentRunId: "subagent-run-1",
      canonicalTaskPath: "parent/1",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
    },
    mutation: {
      artifactId: "workflow-artifact-1",
      mutationPolicy: "staged_until_approved",
      approvalRequired: true,
      approvalSource: "child_bridge_policy",
      approvalScope: "this_child_thread",
      worktreeRequired: true,
      worktreeIsolated: true,
      worktreeStatus: "active",
      worktreePathPresent: true,
      nestedFanoutRequired: true,
      nestedFanoutSource: "child_bridge_policy",
    },
    mutationOutput: {
      kind: "staged_file",
      stagedRelativePath: "src/feature.txt",
      stagedFileSha256: "a".repeat(64),
      fullArtifactPath: "/tmp/child-worktree/.ambient-codex/workflows/dogfood/mutation-report.md",
      fullArtifactBytes: 256,
      fullArtifactSha256: "b".repeat(64),
      boundedPreview: "Child staged mutation preview.",
      previewBytes: 30,
      previewTruncated: true,
      parentWorkspaceUnchanged: true,
    },
    workflow: {
      workflowThreadId: "workflow-thread-1",
      artifactId: "workflow-artifact-1",
      artifactStatus: "ready_for_preview",
      runId: "workflow-run-1",
      runStatus: "succeeded",
      taskArtifactLinkMatches: true,
      taskRunLinkMatches: true,
    },
    taskEvents: {
      started: true,
      finished: true,
      control: false,
      eventTypes: ["callable_workflow.task_started", "callable_workflow.task_finished"],
    },
    parentBlocking: {
      schemaVersion: "ambient-callable-workflow-parent-blocking-v1",
      reason: "blocking_callable_workflow_not_synthesis_safe",
      blockedBeforeCompletion: true,
      unblockedAfterCompletion: true,
      blockedTaskIds: ["workflow-task-1"],
      waitingTaskIds: ["workflow-task-1"],
      attentionTaskIds: [],
      allowedUserChoiceIds: ["wait_again", "cancel_parent"],
      idempotencyKey: "callable-workflow:parent-finalization-blocked:parent-run:workflow-task-1",
      message: "Parent final answer blocked because blocking callable workflow work is not safe for synthesis.",
    },
    deniedScope: {
      schemaVersion: "ambient-subagent-tool-scope-launch-policy-v1",
      denied: true,
      denialKinds: ["phase4_isolation_required"],
      explicitToolRequestObserved: true,
      deniedCategoryIds: ["workflow.call"],
      deniedToolIds: ["callable_workflow:ambient_workflow_symphony_map_reduce"],
      reasonSamples: ["Requested sub-agent tool scope was denied before launch."],
      bridgeReasons: [
        "Callable workflow child bridge is disabled by child role policy.",
        "Callable workflow child bridge requires an active isolated child worktree.",
        "Callable workflow child bridge is unavailable because the nested fanout limit is exhausted.",
      ],
    },
    restart: {
      schemaVersion: "ambient-callable-workflow-task-restart-v1",
      issueKinds: ["workflow_run_terminal_task_unfinished"],
      repairedTaskIds: ["workflow-task-1"],
      diagnosticTaskIds: ["workflow-task-1"],
      terminalRepairObserved: true,
    },
    maturityAssertions: {
      workflow_launch_card_bounds: {
        id: "workflow_launch_card_bounds",
        status: "passed",
        capabilities: ["workflow_launch", "launch_card_bounds", "pause_resume_cancel"],
        evidence: [
          "passed: risk=medium agents=4 fanout=3 depth=2",
          "passed: tokenBudget=12000 localMemory=268435456 checkpoint=Checkpoint after every stage and resume from the last completed step.",
          "passed: defaultCollapsed=true blocking=true pauseResumeCancel=true",
        ],
      },
      workflow_mutating_child_worker: {
        id: "workflow_mutating_child_worker",
        status: "passed",
        capabilities: ["mutating_child_workflow", "child_scoped_approval", "isolated_child_worktree"],
        evidence: [
          "passed: approval=child_bridge_policy scope=this_child_thread",
          "passed: worktree=active isolated=true path=true",
          "passed: staged=src/feature.txt parentUnchanged=true",
        ],
      },
      workflow_parent_blocking_completion: {
        id: "workflow_parent_blocking_completion",
        status: "passed",
        capabilities: ["parent_blocking_workflow", "workflow_launch"],
        evidence: [
          "passed: blockedBeforeCompletion=true",
          "passed: unblockedAfterCompletion=true",
          "passed: choices=wait_again,cancel_parent",
        ],
      },
      workflow_denied_child_scope: {
        id: "workflow_denied_child_scope",
        status: "passed",
        capabilities: ["denied_workflow_scope", "child_workflow_scope"],
        evidence: [
          "passed: denials=1",
          "passed: categories=workflow.call",
          "passed: bridgeReasons=3",
        ],
      },
      workflow_restart_repair: {
        id: "workflow_restart_repair",
        status: "passed",
        capabilities: ["workflow_task_rehydration", "restart_repair"],
        evidence: [
          "passed: issueKinds=workflow_run_terminal_task_unfinished",
          "passed: repairedTaskIds=workflow-task-1",
          "passed: diagnosticTaskIds=workflow-task-1",
        ],
      },
    },
  };
}

function callableWorkflowRehydrationArtifact() {
  return {
    schemaVersion: "ambient-callable-workflow-rehydration-evidence-v1",
    createdAt: "2026-06-05T00:45:00.000Z",
    task: {
      id: "workflow-task-1",
      launchId: "launch-1",
      toolName: "ambient_workflow_symphony_map_reduce",
      sourceKind: "symphony_recipe",
      status: "running",
      blocking: true,
      workflowThreadId: "workflow-thread-1",
      workflowArtifactId: "workflow-artifact-1",
      workflowRunId: "workflow-run-1",
    },
    rehydration: {
      sameTaskId: true,
      sameArtifactId: true,
      sameRunId: true,
      workflowThreadHydrated: true,
      artifactSourcePathHydrated: true,
      artifactStatePathHydrated: true,
      artifactMutationPolicyHydrated: true,
      artifactSpecHydrated: true,
      launchCardHydrated: true,
      executionPlanHydrated: true,
      progressHydrated: true,
      usageHydrated: true,
    },
    childCaller: {
      kind: "subagent_child_thread",
      threadId: "child-thread-1",
      runId: "child-run-1",
      subagentRunId: "subagent-run-1",
      canonicalTaskPath: "parent/1",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
    },
    artifact: {
      id: "workflow-artifact-1",
      title: "Rehydration Workflow",
      workflowThreadId: "workflow-thread-1",
      status: "ready_for_preview",
      sourcePath: "/tmp/worktree/.ambient-codex/workflows/rehydration/main.ts",
      statePath: "/tmp/worktree/.ambient-codex/workflows/rehydration/state.json",
      mutationPolicy: "staged_until_approved",
      specGoal: "Keep callable workflow task links visible after restart.",
    },
    workflowRun: {
      id: "workflow-run-1",
      artifactId: "workflow-artifact-1",
      status: "running",
    },
    progressSnapshot: {
      workflowRunStatus: "running",
      eventCount: 4,
      modelCallCount: 1,
      completedStepCount: 1,
      activeStepCount: 1,
      lastEventType: "step.start",
      lastEventMessage: "Reduce rehydrated evidence",
      lastEventAt: "2026-06-05T00:44:00.000Z",
    },
    usageSnapshot: {
      modelCallCount: 1,
      tokenCount: 21,
      tokenCountEstimated: false,
      costMicros: 34,
      costEstimated: false,
    },
    taskEvents: {
      started: true,
      eventTypes: ["callable_workflow.task_started", "step.start", "step.end"],
    },
    maturityAssertions: {
      workflow_rehydrated_task_links: {
        id: "workflow_rehydrated_task_links",
        status: "passed",
        capabilities: ["workflow_task_rehydration", "artifact_link"],
        evidence: [
          "passed: sameTaskId=true",
          "passed: sameArtifactId=true",
          "passed: sameRunId=true",
        ],
      },
      workflow_rehydrated_artifact_payload: {
        id: "workflow_rehydrated_artifact_payload",
        status: "passed",
        capabilities: ["artifact_link", "checkpoint_output"],
        evidence: [
          "passed: sourcePath=true",
          "passed: statePath=true",
          "passed: mutationPolicy=staged_until_approved",
          "passed: specGoal=true",
        ],
      },
      workflow_rehydrated_progress_usage: {
        id: "workflow_rehydrated_progress_usage",
        status: "passed",
        capabilities: ["workflow_task_rehydration", "checkpoint_output"],
        evidence: [
          "passed: progressEvents=4",
          "passed: modelCalls=1",
          "passed: tokens=21",
        ],
      },
      workflow_rehydrated_child_provenance: {
        id: "workflow_rehydrated_child_provenance",
        status: "passed",
        capabilities: ["child_workflow_provenance", "workflow_task_rehydration"],
        evidence: [
          "passed: childThread=child-thread-1",
          "passed: subagentRun=subagent-run-1",
          "passed: canonicalTaskPath=parent/1",
        ],
      },
    },
  };
}

function localRuntimeControlProofArtifact() {
  return {
    schemaVersion: "ambient-local-runtime-control-proof-v1",
    updatedAt: "2026-06-05T00:01:00.000Z",
    scenarios: {
      "minicpm-nondestructive-stop": {
        status: "passed",
        stopped: true,
        uninstalled: false,
        packageStatePreserved: true,
        evidence: "MiniCPM-V stop preserved installed provider state.",
      },
      "active-subagent-stop-blocker": {
        status: "passed",
        runtimeEntryId: "local-text:local-text-runtime:4301",
        capability: "local-text",
        trackingStatus: "managed",
        running: true,
        ordinaryStopAllowed: false,
        activeLeaseCount: 1,
        blockerLeaseIds: ["lease-review"],
        affectedSubagents: [{
          leaseId: "lease-review",
          parentThreadId: "parent-thread",
          subagentThreadId: "child-thread",
          subagentRunId: "run-review",
          displayName: "sub-agent Review worker",
          status: "running",
          modelRuntimeId: "local-text-runtime",
          modelProfileId: "local-text-4b-q4",
          providerId: "local",
          capabilityKind: "local-text",
        }],
        forceTerminationAllowed: true,
        forceRequiresSubagentCancellation: true,
        evidence: "Managed local-text runtime ordinary Stop is disabled while active sub-agent lease lease-review owns the runtime.",
      },
      "untracked-runtime-safety": {
        status: "passed",
        proofKind: "deterministic-untracked-runtime-safety",
        runtimeEntryId: "untracked-llama:4401",
        capability: "local-text",
        trackingStatus: "untracked",
        running: true,
        pid: 4401,
        modelId: "unknown-local-model",
        ordinaryStopAllowed: false,
        ordinaryRestartAllowed: false,
        forceTerminationAllowed: false,
        untracked: true,
        untrackedRuntimeIds: ["untracked-llama:4401"],
        stopBlockedRuntimeIds: ["untracked-llama:4401"],
        repeatedObservationCount: 3,
        repeatedObservations: repeatedUntrackedObservations(),
        nextSafeActions: [{
          action: "ask-user-to-stop-untracked",
          safety: "external",
          runtimeEntryId: "untracked-llama:4401",
          runtimeId: "untracked-llama:4401",
          capability: "local-text",
          untracked: true,
        }],
        evidence: "Untracked runtime stayed visible and external-only.",
      },
      "stale-lease-recovery": {
        status: "passed",
        proofKind: "deterministic-stale-lease-recovery",
        runtimeEntryId: "local-text:local-text-runtime:4301",
        capability: "local-text",
        trackingStatus: "managed",
        running: true,
        ordinaryStopAllowed: true,
        ordinaryRestartAllowed: true,
        forceRequiresSubagentCancellation: false,
        activeLeaseCount: 0,
        activeOwnerCount: 0,
        staleLeaseIds: ["lease-stale"],
        blockerLeaseIds: [],
        affectedSubagents: [],
        nextSafeActions: [
          {
            action: "stop-runtime",
            safety: "requires-approval",
            runtimeEntryId: "local-text:local-text-runtime:4301",
            toolName: "ambient_local_model_runtime_stop",
          },
          {
            action: "restart-runtime",
            safety: "requires-approval",
            runtimeEntryId: "local-text:local-text-runtime:4301",
            toolName: "ambient_local_model_runtime_restart",
          },
        ],
        evidence: "Stale lease stayed visible but no longer blocked ordinary Stop/Restart.",
      },
      "stopped-provider-display": {
        status: "passed",
        minicpmDisplayedStopped: true,
        voiceDisplayedStopped: true,
        evidence: "Stopped runtimes display as stopped provider state.",
      },
      "provider-declared-lifecycle": {
        status: "passed",
        actions: ["start", "stop", "restart"],
        usedGenericLifecycle: false,
        evidence: "Provider-declared lifecycle commands ran safely.",
      },
    },
  };
}

function repeatedUntrackedObservations() {
  return ["initial_inventory", "policy_handoff_recheck", "lifecycle_action_preview"].map((observationKind) => ({
    observationKind,
    runtimeEntryId: "untracked-llama:4401",
    trackingStatus: "untracked",
    ordinaryStopAllowed: false,
    ordinaryRestartAllowed: false,
    forceTerminationAllowed: false,
    untracked: true,
    nextSafeAction: "ask-user-to-stop-untracked",
    nextSafeActionSafety: "external",
  }));
}

function localRuntimeControlProofGateArtifact() {
  return {
    schemaVersion: "ambient-local-runtime-control-proof-gate-v1",
    startedAt: "2026-06-11T02:17:11.376Z",
    completedAt: "2026-06-11T02:17:11.377Z",
    status: "passed_with_advisories",
    checks: [
      { id: "scenario:ldr-status-before-setup", status: "advisory", issue: "Missing Local Deep Research live summary artifact." },
      { id: "scenario:minicpm-nondestructive-stop", status: "passed", evidence: "MiniCPM-V stop preserved installed provider state." },
      { id: "scenario:active-subagent-stop-blocker", status: "passed", evidence: "Active lease blocks ordinary Stop." },
      { id: "scenario:untracked-runtime-safety", status: "passed", evidence: "Untracked runtime stayed external-only." },
      { id: "scenario:stale-lease-recovery", status: "passed", evidence: "Stale lease stopped blocking ordinary lifecycle." },
      { id: "scenario:stopped-provider-display", status: "passed", evidence: "Stopped providers display as stopped." },
      { id: "scenario:provider-declared-lifecycle", status: "passed", evidence: "Provider lifecycle actions ran safely." },
      { id: "scenario:ldr-reasoning-synthesis", status: "advisory", issue: "Missing Local Deep Research live summary artifact." },
    ],
    releaseDecision: {
      blockingIssues: [],
      advisoryIssues: ["Missing Local Deep Research live summary artifact."],
    },
  };
}

function restartRepairDiagnosticsArtifact() {
  return {
    schemaVersion: "ambient-subagent-replay-diagnostics-v1",
    startedAt: "2026-06-11T02:24:00.258Z",
    completedAt: "2026-06-11T02:24:00.910Z",
    status: "passed",
    plan: {
      fixture: "restart-repair-broken-child-tree",
      liveTokens: false,
    },
    commandResult: {
      exitCode: 0,
      fixtureEvidencePath: "test-results/subagent-replay-diagnostics/latest-fixture-evidence.json",
    },
    vitest: {
      status: "passed",
      missingReplayTests: [],
    },
    replayEvidence: restartRepairReplayEvidence(),
  };
}

function restartRepairReplayEvidence() {
  return {
    schemaVersion: "ambient-subagent-replay-evidence-v1",
    fixtureName: "restart-repair-broken-child-tree",
    createdAt: "2026-06-05T00:00:00.000Z",
    liveTokens: false,
    counts: {
      threads: 4,
      childThreads: 4,
      runs: 3,
      persistedRunEvents: 4,
      runtimeEvents: 3,
      parentMailboxEvents: 1,
      transcriptMessages: 3,
      restartRepairIssues: 7,
    },
    childThreads: [{ threadId: "child-active", runId: "run-active" }],
    runtimeEventTimeline: [{ sequence: 1, runId: "run-active", parentRunId: "parent-run", childThreadId: "child-active", type: "started" }],
    persistedRunEventTimeline: [{ sequence: 1, runId: "run-active", parentRunId: "parent-run", childThreadId: "child-active", type: "subagent.lifecycle_started" }],
    parentMailboxTimeline: [{ sequence: 1, id: "parent-mailbox-grouped-completion", parentRunId: "parent-run", parentThreadId: "parent-thread", parentMessageId: "parent-message-2", type: "subagent.grouped_completion", deliveryState: "queued", childRunIds: ["run-artifact", "run-terminal"] }],
    rehydration: restartRehydrationProof(),
    restartRepair: {
      expectedIssueKinds: [
        "active_run_interrupted",
        "missing_lifecycle_stop",
        "missing_spawn_edge",
        "missing_result_artifact",
        "dangling_spawn_edge",
        "orphan_child_thread",
        "dangling_wait_barrier_child",
      ],
      observedIssueKinds: [
        "active_run_interrupted",
        "missing_lifecycle_stop",
        "missing_spawn_edge",
        "missing_result_artifact",
        "dangling_spawn_edge",
        "orphan_child_thread",
        "dangling_wait_barrier_child",
      ],
      repairedRunIds: ["run-active"],
      repairedBarrierIds: ["barrier-required"],
      repairedParentControlBarrierIds: [],
      repairableSpawnEdgeRunIds: ["run-terminal"],
      danglingSpawnEdgeRunIds: ["missing-run"],
      diagnosticRunIds: ["run-terminal"],
    },
  };
}

function restartRehydrationProof() {
  return {
    schemaVersion: "ambient-subagent-restart-rehydration-proof-v1",
    childRunIds: ["run-active", "run-artifact", "run-terminal"],
    childThreadIds: ["child-active", "child-artifact", "child-terminal", "orphan-child"],
    parentMailboxEventIds: ["parent-mailbox-grouped-completion"],
    parentMailboxStates: [{
      id: "parent-mailbox-grouped-completion",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message-2",
      deliveryState: "queued",
      childRunIds: ["run-artifact", "run-terminal"],
    }],
    transcriptChildRunIds: ["run-active"],
    transcriptThreadIds: ["child-active", "parent-thread"],
    resultArtifactPointers: [{
      runId: "run-artifact",
      childThreadId: "child-artifact",
      status: "completed",
      artifactPath: ".ambient-codex/subagents/run-artifact/result.json",
      fullOutputPath: ".ambient-codex/subagents/run-artifact/full-output.txt",
      structuredOutputPath: ".ambient-codex/subagents/run-artifact/structured.json",
    }],
    missingResultArtifactRunIds: ["run-terminal"],
    artifactPointerIntegrity: {
      allResultPointersHaveRunAndThread: true,
      missingResultArtifactsDiagnosed: true,
      parentMailboxChildRefsResolved: true,
      transcriptChildRefsResolved: true,
    },
  };
}

function lifecycleEdgeArtifact() {
  return {
    schemaVersion: "ambient-subagent-lifecycle-edge-evidence-v1",
    createdAt: "2026-06-11T04:00:00.000Z",
    source: "deterministic_fixture",
    liveTokens: false,
    featureFlagSnapshot: {
      ambientSubagentsEnabled: true,
      source: "test_override",
    },
    parent: {
      threadId: "parent-thread",
      runId: "parent-run",
      messageId: "parent-message",
    },
    summary: {
      requiredEdgeKinds: ["restart", "stop", "detach", "cancel", "retry", "timeout", "partial_result"],
      coveredEdgeKinds: ["restart", "stop", "detach", "cancel", "retry", "timeout", "partial_result"],
      missingEdgeKinds: [],
      unsafeEdgeIds: [],
      liveTokens: false,
    },
    edges: [
      lifecycleEdge({
        id: "edge-restart",
        kind: "restart",
        label: "Restart after active child",
        parentBlockingStateBefore: "waiting_on_child",
        parentBlockingStateAfter: "interrupted_repair_visible",
        childRunIds: ["run-active"],
        childThreadIds: ["child-active"],
        observedEventIds: ["runtime-event-started", "repair-diagnostic-active-run"],
        restart: {
          interruptedRunIds: ["run-active"],
          diagnosticRunIds: ["run-active"],
          restartRepairObserved: true,
          nonResumableMarkedInterrupted: true,
        },
      }),
      lifecycleEdge({
        id: "edge-child-stop",
        kind: "stop",
        label: "Stopped child while sibling keeps running",
        parentBlockingStateBefore: "waiting_on_two_children",
        parentBlockingStateAfter: "needs_decision_after_stopped_child",
        childRunIds: ["run-stopped", "run-sibling"],
        childThreadIds: ["child-stopped", "child-sibling"],
        observedEventIds: ["cancel-event-stopped", "capacity-release-stopped"],
        stop: {
          stoppedRunIds: ["run-stopped"],
          siblingRunIdsUnaffected: ["run-sibling"],
          structuredCancellationResult: true,
          capacityReleased: true,
        },
      }),
      lifecycleEdge({
        id: "edge-detach",
        kind: "detach",
        label: "Detached child from parent wait",
        parentBlockingStateBefore: "waiting_on_detachable_child",
        parentBlockingStateAfter: "unblocked_detached_child_visible",
        childRunIds: ["run-detached"],
        childThreadIds: ["child-detached"],
        observedEventIds: ["mailbox-detach-decision", "mailbox-detach-cleanup"],
        detach: {
          detachedRunIds: ["run-detached"],
          detachedChildrenExcludedFromSynthesis: true,
          parentUnblockedAfterDecision: true,
          mailboxCleanupRecorded: true,
        },
      }),
      lifecycleEdge({
        id: "edge-parent-cancel",
        kind: "cancel",
        label: "Parent cancellation cascades to children",
        parentBlockingStateBefore: "waiting_on_children",
        parentBlockingStateAfter: "parent_cancelled_children_marked",
        childRunIds: ["run-cancel-a", "run-cancel-b"],
        childThreadIds: ["child-cancel-a", "child-cancel-b"],
        observedEventIds: ["parent-cancel-requested", "cancel-cascade-event"],
        cancel: {
          parentCancellationRequested: true,
          cancelledRunIds: ["run-cancel-a", "run-cancel-b"],
          cancellationCascadeRecorded: true,
          parentReturnedCancelledState: true,
        },
      }),
      lifecycleEdge({
        id: "edge-retry-child",
        kind: "retry",
        label: "Retry failed required child while parent stays blocked",
        parentBlockingStateBefore: "failed_required_child_waiting_for_decision",
        parentBlockingStateAfter: "retry_requested_parent_still_blocked",
        childRunIds: ["run-retry"],
        childThreadIds: ["child-retry"],
        observedEventIds: ["mailbox-retry-decision", "runtime-retry-started", "retry-mailbox-consumed"],
        retry: {
          retryRequestedRunIds: ["run-retry"],
          retryAcceptedRunIds: ["run-retry"],
          retryMailboxEventIds: ["mailbox-retry"],
          parentRemainedBlocked: true,
          childSessionRestarted: true,
        },
      }),
      lifecycleEdge({
        id: "edge-timeout",
        kind: "timeout",
        label: "Timed-out required child blocks unsafe synthesis",
        parentBlockingStateBefore: "waiting_on_required_child",
        parentBlockingStateAfter: "timed_out_needs_user_choice",
        childRunIds: ["run-timeout"],
        childThreadIds: ["child-timeout"],
        observedEventIds: ["barrier-timeout-event", "mailbox-timeout-attention"],
        timeout: {
          barrierStatus: "timed_out",
          failurePolicy: "ask_user",
          allowedUserChoiceIds: ["wait_again", "cancel_parent", "continue_with_partial"],
          noTimedOutChildSynthesis: true,
        },
      }),
      lifecycleEdge({
        id: "edge-partial-result",
        kind: "partial_result",
        label: "User explicitly continues with partial result",
        parentBlockingStateBefore: "waiting_on_failed_child",
        parentBlockingStateAfter: "partial_result_synthesis_allowed",
        childRunIds: ["run-complete", "run-failed"],
        childThreadIds: ["child-complete", "child-failed"],
        observedEventIds: ["barrier-partial-decision", "partial-summary-artifact"],
        partialResult: {
          decision: "continue_with_partial",
          partialSummaryIncluded: true,
          omittedChildRunIds: ["run-failed"],
          failedChildNotSynthesized: true,
          parentMarkedPartial: true,
        },
      }),
    ],
  };
}

function lifecycleEdge(edge) {
  return {
    ...edge,
    synthesisSafety: {
      parentDidNotSynthesizeUnsafeChild: true,
      resultArtifactStateExplicit: true,
      affectedChildrenNamed: true,
      decisionOrEventAttributed: true,
      visibleCollapsedThreadState: true,
    },
  };
}

function desktopDogfoodArtifact() {
  return {
    schemaVersion: "ambient-subagent-desktop-dogfood-v1",
    status: "passed",
    classification: "passed",
    provider: "gmi-cloud",
    featureFlag: "ambient.subagents",
    gitCommit: "desktop-dogfood-commit",
    scenarios: [...REQUIRED_DESKTOP_DOGFOOD_SCENARIOS],
    parentThreadId: "desktop-dogfood-parent-thread",
    parentMessageId: "desktop-dogfood-parent-message",
    childRunIds: ["desktop-dogfood-review-run", "desktop-dogfood-summary-run"],
    childThreadIds: ["desktop-dogfood-review-thread", "desktop-dogfood-summary-thread"],
    approvalId: "desktop-dogfood-approval-write",
    localRuntimeLeaseId: "desktop-dogfood-local-runtime-lease",
    localRuntimeId: "local-text-runtime",
    untrackedRuntimeId: "untracked-llama:4404",
    workflowTaskId: "callable-workflow:desktop-dogfood-map-reduce",
    workflowRunId: "desktop-dogfood-workflow-run",
    lifecycleEdgeParentMessageId: "desktop-dogfood-lifecycle-parent-message",
    lifecycleEdgeChildRunIds: [
      "desktop-dogfood-lifecycle-timeout-run",
      "desktop-dogfood-lifecycle-partial-run",
      "desktop-dogfood-lifecycle-retry-run",
      "desktop-dogfood-lifecycle-detached-run",
    ],
    parentStopCascadeParentMessageId: "desktop-dogfood-parent-stop-parent-message",
    parentStopCascadeChildRunIds: [
      "desktop-dogfood-parent-stop-required-run",
      "desktop-dogfood-parent-stop-background-run",
      "desktop-dogfood-parent-stop-completed-run",
    ],
    artifacts: {
      collapsedDesktopScreenshot: "test-results/subagent-desktop-dogfood/collapsed-desktop.png",
      expandedDesktopScreenshot: "test-results/subagent-desktop-dogfood/expanded-desktop.png",
      approvalDialogScreenshot: "test-results/subagent-desktop-dogfood/approval-forwarding-dialog.png",
      approvalForwardingDesktopScreenshot: "test-results/subagent-desktop-dogfood/approval-forwarded-desktop.png",
      workflowHighLoadDesktopScreenshot: "test-results/subagent-desktop-dogfood/workflow-high-load-desktop.png",
      lifecycleEdgeVisibilityDesktopScreenshot: "test-results/subagent-desktop-dogfood/lifecycle-edge-visibility-desktop.png",
      parentStopCascadeDesktopScreenshot: "test-results/subagent-desktop-dogfood/parent-stop-cascade-desktop.png",
      localRuntimeOwnershipDesktopScreenshot: "test-results/subagent-desktop-dogfood/local-runtime-ownership-desktop.png",
      expandedNarrowScreenshot: "test-results/subagent-desktop-dogfood/expanded-narrow.png",
      operatorBehaviorDesktopScreenshot: "test-results/subagent-desktop-dogfood/operator-behavior-desktop.png",
      childTranscriptExpandedDesktopScreenshot: "test-results/subagent-desktop-dogfood/child-transcript-expanded-desktop.png",
      completedChildTranscriptDesktopScreenshot: "test-results/subagent-desktop-dogfood/completed-child-transcript-desktop.png",
      deniedScopeExplanationDesktopScreenshot: "test-results/subagent-desktop-dogfood/denied-scope-explanation-desktop.png",
      effectiveRoleSnapshotDesktopScreenshot: "test-results/subagent-desktop-dogfood/effective-role-snapshot-desktop.png",
      multiClusterStressDesktopScreenshot: "test-results/subagent-desktop-dogfood/multi-cluster-stress-desktop.png",
      mutatingWorkerDogfoodDesktopScreenshot: "test-results/subagent-desktop-dogfood/mutating-worker-dogfood-desktop.png",
      patternGraphClickThroughDesktopScreenshot: "test-results/subagent-desktop-dogfood/pattern-graph-click-through-desktop.png",
      patternGraphCompletedClickThroughDesktopScreenshot: "test-results/subagent-desktop-dogfood/pattern-graph-completed-click-through-desktop.png",
      restartRehydrationDesktopScreenshot: "test-results/subagent-desktop-dogfood/restart-rehydration-desktop.png",
      workflowArtifactRehydrationDesktopScreenshot: "test-results/subagent-desktop-dogfood/workflow-artifact-rehydration-desktop.png",
      workflowExecutionDesktopScreenshot: "test-results/subagent-desktop-dogfood/workflow-execution-desktop.png",
      workflowRehydratedNavigationDesktopScreenshot: "test-results/subagent-desktop-dogfood/workflow-rehydrated-navigation-desktop.png",
      chatExportZip: "test-results/subagent-desktop-dogfood/desktop-chat-export.zip",
      accessibilitySnapshot: "test-results/subagent-desktop-dogfood/expanded-accessibility.json",
    },
    checks: {
      collapsed: {
        defaultCollapsed: true,
        horizontalOverflowFree: true,
      },
      expanded: {
        defaultCollapsed: false,
        horizontalOverflowFree: true,
        approvalFlow: {
          approvalRequested: true,
          approvalBlockedChild: true,
          parentStillBlocked: true,
          childIdentifierVisible: true,
          toolScopeVisible: true,
          approvalScopeVisible: true,
          approvalPromptVisible: true,
          approveButtonVisible: true,
          denyButtonVisible: true,
          approvalButtonsNameChild: true,
        },
      },
      narrow: {
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      },
      childTranscript: desktopRunningChildTranscript(),
      completedChildTranscript: desktopCompletedChildTranscript(),
      workflowExecution: {
        workflowSectionVisible: true,
        parentBlockerVisible: true,
        taskIdVisible: true,
        artifactIdVisible: true,
        horizontalOverflowFree: true,
      },
      approvalForwarding: {
        forwardedVisible: true,
        approvedDecisionVisible: true,
        childThreadScopeVisible: true,
        forwardedNamesChild: true,
        forwardedNamesApproval: true,
        forwardedMatchesApprovalChild: true,
        approvalRequestMatchesApprovalChild: true,
        forwardedAndRequestSameChild: true,
        approvalRequestStillVisible: true,
        approvalRequestActionsRemoved: true,
        parentStillBlockedAfterForward: true,
        childRowDataMatchesApprovalChild: true,
        childRowStillBlocksApprovalChild: true,
        childReturnedToNeedsSteering: true,
        waitBarrierStillVisible: true,
        horizontalOverflowFree: true,
      },
      approvalDialog: {
        dialogOpened: true,
        dialogNamesApproval: true,
        dialogNamesChildRun: true,
        dialogNamesChildThread: true,
        dialogNamesBlockingChild: true,
        dialogShowsParentWaitState: true,
        dialogShowsPrompt: true,
        dialogShowsStandardScopes: true,
        initialScopeThisAction: true,
      },
      localRuntimeOwnership: {
        runtimeInventoryVisible: true,
        activeLeaseVisible: true,
        ownerLabelVisible: true,
        stopDisabledVisible: true,
        affectedSubagentVisible: true,
        untrackedRuntimeVisible: true,
        untrackedStopDisabledVisible: true,
        untrackedRestartDisabledVisible: true,
        untrackedExternalStopGuidanceVisible: true,
        horizontalOverflowFree: true,
      },
      lifecycleEdgeVisibility: {
        clusterVisible: true,
        clusterDefaultCollapsedBeforeOpen: true,
        timeoutChildVisible: true,
        partialChildVisible: true,
        retryChildVisible: true,
        retryDecisionVisible: true,
        detachedChildVisible: true,
        timeoutChoicesVisible: true,
        partialDecisionVisible: true,
        partialSummaryVisible: true,
        detachDecisionVisible: true,
        horizontalOverflowFree: true,
      },
      parentStopCascadeVisibility: {
        parentMessageVisible: true,
        clusterVisible: true,
        clusterDefaultCollapsedBeforeOpen: true,
        summaryVisible: true,
        requiredChildCancelledVisible: true,
        optionalChildDetachedVisible: true,
        completedChildUnchangedVisible: true,
        parentStoppedMailboxVisible: true,
        parentCancellationRequestedVisible: true,
        cancelledWaitBarrierVisible: true,
        cancelledMailboxEventsVisible: true,
        cascadeReasonVisible: true,
        cascadeIdentityCaptured: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      },
      operatorBehavior: {
        completedChildClosed: true,
        completedChildStillVisible: true,
        completedChildControlsReleased: true,
        attentionChildCancelled: true,
        attentionChildStillVisible: true,
        attentionCancelControlRemoved: true,
        siblingStatePreserved: true,
        lifecycleInterruptionVisible: true,
        typedBarrierConsequenceVisible: true,
        rowsStillInspectable: true,
        horizontalOverflowFree: true,
      },
      workflowHighLoad: {
        workflowRowCount: 6,
      },
      chatExport: {
        approvalAuthorityContract: {
          requestExported: true,
          forwardedExported: true,
          eventIdMatches: true,
          schemaMatches: true,
          childIdentityMatches: true,
          requestedToolMatches: true,
          requestedScopeThisAction: true,
          requestEffectiveScopeNarrow: true,
          forwardedEffectiveScopeChildThread: true,
          parentBlockingResumeMatches: true,
          forwardedParentBlockingResumeMatches: true,
          waitBarrierMatches: true,
          instructionPreservesBlocking: true,
        },
      },
    },
    visualAssertions: passedAssertions(REQUIRED_DESKTOP_VISUAL_ASSERTIONS),
    maturityAssertions: passedAssertions(REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS, {
      desktop_chat_export_child_bundle: {
        capabilities: [
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
      },
    }),
  };
}

function desktopRunningChildTranscript() {
  return {
    childExpanded: true,
    transcriptPanelVisible: true,
    liveTranscriptShellVisible: true,
    liveTranscriptStreamVisible: true,
    liveTranscriptStatusVisible: true,
    miniThreadHeaderVisible: true,
    miniThreadHeaderNamesChild: true,
    openFullThreadActionVisible: true,
    openFullThreadActionNamesChild: true,
    liveTranscriptMessageCountVisible: true,
    liveTranscriptRuntimeEventCountVisible: true,
    liveTranscriptMessageCountMatchesBubbles: true,
    liveTranscriptRuntimeEventCountPositive: true,
    liveTranscriptModeLabelVisible: true,
    childStreaming: false,
    runtimeEventRailVisible: true,
    runtimeEventRailHasRecentEvents: true,
    runtimeTimelineVisible: true,
    runtimeTimelineCountVisible: true,
    runtimeTimelineRenderedCountMatchesRows: true,
    runtimeTimelineOmittedCountConsistent: true,
    runtimeEventRows: 3,
    userMessageVisible: true,
    assistantMessageVisible: true,
    siblingSummaryNotLeakedIntoTranscript: true,
    childRunIdVisible: true,
    childThreadIdVisible: true,
    messageBubbleCount: 2,
    childTranscriptTerminal: false,
    childTranscriptSynthesisSafe: false,
    liveContinuationMarkerVisible: true,
    liveContinuationMarkerAfterMessages: true,
    completionEndCapVisible: false,
    completionEndCapAfterMessages: false,
    completionSummaryDeferredWhileLive: true,
    transcriptEndStateCorrect: true,
    summaryNotObscuringTranscript: true,
    horizontalOverflowFree: true,
    criticalOverlapCount: 0,
  };
}

function desktopCompletedChildTranscript() {
  return {
    childExpanded: true,
    transcriptPanelVisible: true,
    liveTranscriptShellVisible: true,
    liveTranscriptStreamVisible: true,
    liveTranscriptStatusVisible: true,
    miniThreadHeaderVisible: true,
    miniThreadHeaderNamesChild: true,
    openFullThreadActionVisible: true,
    openFullThreadActionNamesChild: true,
    liveTranscriptMessageCountVisible: true,
    liveTranscriptRuntimeEventCountVisible: true,
    liveTranscriptMessageCountMatchesBubbles: true,
    liveTranscriptRuntimeEventCountPositive: true,
    liveTranscriptModeLabelVisible: true,
    childStreaming: false,
    runtimeEventRailVisible: true,
    runtimeEventRailHasRecentEvents: true,
    runtimeTimelineVisible: true,
    runtimeTimelineCountVisible: true,
    runtimeTimelineRenderedCountMatchesRows: true,
    runtimeTimelineOmittedCountConsistent: true,
    runtimeEventRows: 2,
    userMessageVisible: false,
    assistantMessageVisible: true,
    siblingSummaryNotLeakedIntoTranscript: true,
    childRunIdVisible: true,
    childThreadIdVisible: true,
    messageBubbleCount: 1,
    childTranscriptTerminal: true,
    childTranscriptSynthesisSafe: true,
    liveContinuationMarkerVisible: false,
    liveContinuationMarkerAfterMessages: false,
    completionEndCapVisible: true,
    completionEndCapText: "Completion summary\nCompleted\nContext summarizer completed",
    completionEndCapLabelVisible: true,
    completionEndCapAfterMessages: true,
    completionSummaryDeferredWhileLive: true,
    transcriptEndStateCorrect: true,
    summaryNotObscuringTranscript: true,
    horizontalOverflowFree: true,
    criticalOverlapCount: 0,
  };
}

function passedAssertions(ids, overrides = {}) {
  return Object.fromEntries(ids.map((id) => [id, {
    id,
    status: "passed",
    evidence: [`passed: ${id}`],
    ...(overrides[id] ?? {}),
  }]));
}

async function waitForPidFile(path, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const text = await readFile(path, "utf8");
      const pids = text
        .split(/\s+/)
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);
      if (pids.length >= 2) return pids;
    } catch (error) {
      lastError = error;
    }
    await sleep(25);
  }
  throw new Error(`Timed out waiting for pid file ${path}: ${lastError?.message ?? "not ready"}`);
}

async function waitForProcessExit(pid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processExists(pid)) return;
    await sleep(25);
  }
  throw new Error(`Process ${pid} was still running after abort cleanup.`);
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}
