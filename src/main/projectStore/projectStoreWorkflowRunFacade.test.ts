import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore workflow run facade (requires Node ABI better-sqlite3 build)", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-store-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("persists workflow artifacts, runs, and ordered run events", () => {
    const artifact = store.createWorkflowArtifact({
      id: "local-health-check",
      title: "Local health check",
      status: "ready_for_preview",
      manifest: {
        tools: ["bash", "browser_screenshot", "ambient.responses"],
        mutationPolicy: "read_only",
        maxToolCalls: 20,
      },
      spec: {
        goal: "Run deterministic local project checks.",
        successCriteria: ["Tests complete", "Audit report is written"],
      },
      sourcePath: ".ambient-codex/workflows/local-health-check/main.ts",
      statePath: ".ambient-codex/workflows/local-health-check/state.sqlite",
    });

    expect(artifact).toMatchObject({
      id: "local-health-check",
      status: "ready_for_preview",
      manifest: {
        tools: ["bash", "browser_screenshot", "ambient.responses"],
        mutationPolicy: "read_only",
      },
      spec: {
        goal: "Run deterministic local project checks.",
      },
    });

    const updated = store.updateWorkflowArtifact({
      id: artifact.id,
      status: "approved",
      spec: { ...artifact.spec, summary: "Check the repo and write evidence." },
    });
    expect(updated).toMatchObject({ status: "approved", spec: { summary: "Check the repo and write evidence." } });

    const run = store.startWorkflowRun({
      artifactId: artifact.id,
      status: "previewed",
      graphSnapshotId: "graph-1",
      providerHealth: {
        status: "ok",
        providerEventCount: 2,
        providerProgressEventCount: 0,
        providerErrorEventCount: 0,
        latestProviderEventType: "ambient.call.end",
      },
      retryMetadata: {
        retryEventCount: 0,
        providerRetryEventCount: 0,
        recoveryAttemptCount: 0,
      },
    });
    const dryRun = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
    const first = store.appendWorkflowRunEvent({
      runId: run.id,
      type: "step.start",
      message: "Starting project inspection.",
      data: { step: "inspect", graphNodeId: "inspect-node" },
    });
    const second = store.appendWorkflowRunEvent({
      runId: run.id,
      type: "step.end",
      graphNodeId: "inspect-node",
      graphEdgeId: "inspect-to-report",
      data: { step: "inspect", ok: true },
    });

    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(store.listWorkflowRunEvents(run.id)).toEqual([
      expect.objectContaining({ seq: 1, type: "step.start", graphNodeId: "inspect-node", data: { step: "inspect", graphNodeId: "inspect-node" } }),
      expect.objectContaining({ seq: 2, type: "step.end", graphNodeId: "inspect-node", graphEdgeId: "inspect-to-report", data: { step: "inspect", ok: true } }),
    ]);

    const completed = store.updateWorkflowRun({
      id: run.id,
      status: "succeeded",
      reportPath: ".ambient-codex/workflows/local-health-check/reports/run.md",
      retryMetadata: {
        retryEventCount: 1,
        providerRetryEventCount: 0,
        recoveryAttemptCount: 1,
        latestRecoveryAction: "retry_step",
      },
    });
    expect(completed).toMatchObject({
      status: "succeeded",
      reportPath: ".ambient-codex/workflows/local-health-check/reports/run.md",
      graphSnapshotId: "graph-1",
      providerHealth: expect.objectContaining({ status: "ok", latestProviderEventType: "ambient.call.end" }),
      retryMetadata: expect.objectContaining({ recoveryAttemptCount: 1, latestRecoveryAction: "retry_step" }),
    });
    expect(completed.completedAt).toBeTruthy();
    expect(store.listWorkflowRuns(artifact.id).map((item) => item.id)).toEqual([dryRun.id, run.id]);
  });

  it("persists workflow model calls for audit and replay", () => {
    const artifact = store.createWorkflowArtifact({
      title: "Classify failures",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Classify test failures." },
      sourcePath: ".ambient-codex/workflows/classify/main.ts",
      statePath: ".ambient-codex/workflows/classify/state.sqlite",
    });
    const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
    const call = store.recordWorkflowModelCall({
      runId: run.id,
      task: "classify.failure",
      status: "succeeded",
      input: { text: "expected true, got false" },
      output: { category: "bug", confidence: 0.9 },
      cacheKey: JSON.stringify(["classify.failure", "case-1"]),
      cacheCheckpoint: {
        id: "workflow-cache-runtime-test",
        stage: "runtime_call",
        workflowThreadId: "workflow-thread-1",
        stablePrefixHash: "stable-hash",
        stablePrefixChars: 16,
        stablePrefixEstimatedTokens: 4,
        mutableSuffixHash: "mutable-hash",
        mutableSuffixChars: 24,
        mutableSuffixEstimatedTokens: 6,
        requestHash: "request-hash",
        requestEstimatedTokens: 10,
        boundaryLabel: "Runtime boundary",
        createdAt: "2026-04-30T00:00:00.000Z",
      },
      model: "ambient-test",
      graphNodeId: "classify-node",
      itemKey: "case-1",
      startedAt: "2026-04-30T00:00:00.000Z",
      completedAt: "2026-04-30T00:00:00.120Z",
    });

    expect(call).toMatchObject({
      runId: run.id,
      artifactId: artifact.id,
      task: "classify.failure",
      status: "succeeded",
      input: { text: "expected true, got false" },
      output: { category: "bug", confidence: 0.9 },
      cacheCheckpoint: expect.objectContaining({
        id: "workflow-cache-runtime-test",
        stage: "runtime_call",
        stablePrefixHash: "stable-hash",
      }),
      model: "ambient-test",
      graphNodeId: "classify-node",
      itemKey: "case-1",
      latencyMs: 120,
    });
    expect(store.listWorkflowModelCalls({ runId: run.id })).toEqual([expect.objectContaining({ id: call.id })]);
    expect(store.listWorkflowModelCalls({ artifactId: artifact.id })).toEqual([expect.objectContaining({ id: call.id })]);
  });

  it("compacts expired debug workflow trace payloads after the retention window", () => {
    const debugThread = store.createWorkflowAgentThreadSummary({
      initialRequest: "Debug trace workflow.",
      traceMode: "debug",
    });
    const debugArtifact = store.createWorkflowArtifact({
      workflowThreadId: debugThread.id,
      title: "Debug trace workflow",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Capture debug traces." },
      sourcePath: ".ambient-codex/workflows/debug-trace/main.ts",
      statePath: ".ambient-codex/workflows/debug-trace/state.sqlite",
    });
    const productionThread = store.createWorkflowAgentThreadSummary({
      initialRequest: "Production trace workflow.",
      traceMode: "production",
    });
    const productionArtifact = store.createWorkflowArtifact({
      workflowThreadId: productionThread.id,
      title: "Production trace workflow",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Capture production traces." },
      sourcePath: ".ambient-codex/workflows/production-trace/main.ts",
      statePath: ".ambient-codex/workflows/production-trace/state.sqlite",
    });
    const debugRun = store.startWorkflowRun({ artifactId: debugArtifact.id, status: "running" });
    const productionRun = store.startWorkflowRun({ artifactId: productionArtifact.id, status: "running" });

    store.appendWorkflowRunEvent({
      runId: debugRun.id,
      type: "step.end",
      createdAt: "2026-03-20T00:00:00.000Z",
      data: { retained: "verbose debug input" },
    });
    store.appendWorkflowRunEvent({
      runId: debugRun.id,
      type: "step.end",
      createdAt: "2026-04-20T00:00:00.000Z",
      data: { retained: "fresh debug input" },
    });
    store.appendWorkflowRunEvent({
      runId: productionRun.id,
      type: "step.end",
      createdAt: "2026-03-20T00:00:00.000Z",
      data: { retained: "audit-safe production summary" },
    });
    store.appendWorkflowRunEvent({
      runId: productionRun.id,
      type: "batch.item.end",
      itemKey: "item-1",
      createdAt: "2026-03-20T00:00:00.000Z",
      data: { retained: "verbose batch item" },
    });
    const debugCall = store.recordWorkflowModelCall({
      runId: debugRun.id,
      task: "debug.classify",
      status: "succeeded",
      input: { text: "sensitive debug prompt" },
      output: { label: "bug" },
      startedAt: "2026-03-20T00:00:00.000Z",
      completedAt: "2026-03-20T00:00:00.100Z",
    });
    const productionCall = store.recordWorkflowModelCall({
      runId: productionRun.id,
      task: "production.classify",
      status: "succeeded",
      input: { text: "redacted summary" },
      output: { label: "ok" },
      startedAt: "2026-03-20T00:00:00.000Z",
      completedAt: "2026-03-20T00:00:00.100Z",
    });

    const result = store.compactExpiredWorkflowTraceData({ now: "2026-05-02T00:00:00.000Z" });

    expect(result).toEqual({
      cutoff: "2026-04-02T00:00:00.000Z",
      eventsCompacted: 2,
      modelCallsCompacted: 1,
    });
    expect(store.listWorkflowRunEvents(debugRun.id).map((event) => event.data)).toEqual([
      expect.objectContaining({ retention: "compacted", reason: "workflow_trace_retention_expired" }),
      { retained: "fresh debug input" },
    ]);
    expect(store.listWorkflowRunEvents(productionRun.id).map((event) => event.data)).toEqual([
      { retained: "audit-safe production summary" },
      expect.objectContaining({ retention: "compacted", reason: "workflow_trace_retention_expired" }),
    ]);
    expect(store.getWorkflowModelCall(debugCall.id)).toMatchObject({
      input: expect.objectContaining({ retention: "compacted" }),
      output: expect.objectContaining({ retention: "compacted" }),
    });
    expect(store.getWorkflowModelCall(productionCall.id)).toMatchObject({
      input: { text: "redacted summary" },
      output: { label: "ok" },
    });
  });
});
