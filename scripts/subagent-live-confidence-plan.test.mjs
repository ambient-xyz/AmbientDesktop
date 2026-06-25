import { describe, expect, it } from "vitest";
import { buildSubagentLiveConfidencePlan } from "./subagent-live-confidence-lib.mjs";

describe("sub-agent live confidence plan", () => {
  it("builds a bounded Ambient/Pi live confidence plan", () => {
    expect(
      buildSubagentLiveConfidencePlan({
        outputPath: "/tmp/live-confidence/latest.json",
        timeoutMs: 1234,
      }),
    ).toMatchObject({
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
    expect(
      buildSubagentLiveConfidencePlan({
        sliceKind: "child_authority",
        outputPath: "/tmp/live-confidence/authority.json",
      }),
    ).toMatchObject({
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
    expect(
      buildSubagentLiveConfidencePlan({
        sliceKind: "workflow_symphony",
        outputPath: "/tmp/live-confidence/latest.json",
      }),
    ).toMatchObject({
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
    expect(
      buildSubagentLiveConfidencePlan({
        sliceKind: "workflow_symphony_broader",
        outputPath: "/tmp/live-confidence/broader.json",
      }),
    ).toMatchObject({
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
    expect(
      buildSubagentLiveConfidencePlan({
        sliceKind: "workflow_symphony",
      }),
    ).toMatchObject({
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
    expect(
      buildSubagentLiveConfidencePlan({
        sliceKind: "workflow_symphony_broader",
      }),
    ).toMatchObject({
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
    expect(
      buildSubagentLiveConfidencePlan({
        sliceKind: "local_runtime",
        outputPath: "/tmp/live-confidence/latest.json",
      }),
    ).toMatchObject({
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
    expect(
      buildSubagentLiveConfidencePlan({
        sliceKind: "local_runtime",
      }),
    ).toMatchObject({
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
    expect(
      buildSubagentLiveConfidencePlan({
        sliceKind: "restart_repair",
        outputPath: "/tmp/live-confidence/latest.json",
      }),
    ).toMatchObject({
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
    expect(
      buildSubagentLiveConfidencePlan({
        sliceKind: "restart_repair",
      }),
    ).toMatchObject({
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
    expect(
      buildSubagentLiveConfidencePlan({
        sliceKind: "lifecycle_edges",
        outputPath: "/tmp/live-confidence/latest.json",
      }),
    ).toMatchObject({
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
    expect(
      buildSubagentLiveConfidencePlan({
        sliceKind: "lifecycle_edges",
      }),
    ).toMatchObject({
      sliceId: "subagent-lifecycle-edge-proof",
      sliceKind: "lifecycle_edges",
      outputPath: "test-results/subagent-live-confidence/lifecycle-edges-latest.json",
      stdoutPath: "test-results/subagent-live-confidence/lifecycle-edges-latest.stdout.txt",
      stderrPath: "test-results/subagent-live-confidence/lifecycle-edges-latest.stderr.txt",
      liveLifecycleEdgeArtifactPath: "test-results/subagent-lifecycle-edges/latest.json",
    });
  });

  it("builds a focused Desktop dogfood confidence plan", () => {
    expect(
      buildSubagentLiveConfidencePlan({
        sliceKind: "desktop_dogfood",
        outputPath: "/tmp/live-confidence/latest.json",
      }),
    ).toMatchObject({
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
    expect(
      buildSubagentLiveConfidencePlan({
        sliceKind: "desktop_dogfood",
      }),
    ).toMatchObject({
      sliceId: "desktop-dogfood-live-confidence",
      sliceKind: "desktop_dogfood",
      outputPath: "test-results/subagent-live-confidence/desktop-dogfood-latest.json",
      stdoutPath: "test-results/subagent-live-confidence/desktop-dogfood-latest.stdout.txt",
      stderrPath: "test-results/subagent-live-confidence/desktop-dogfood-latest.stderr.txt",
      liveDesktopDogfoodArtifactPath: "test-results/subagent-desktop-dogfood/latest.json",
    });
  });
});
