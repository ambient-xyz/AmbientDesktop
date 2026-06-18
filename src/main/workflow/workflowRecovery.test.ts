import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./workflowProjectStoreFacade";
import { buildWorkflowRecoveryPlan } from "./workflowRecovery";
import { markStaleWorkflowRunForRecoveryIfNeeded } from "./workflowStaleRunRecovery";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("workflow recovery planning", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-recovery-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("builds a retry-step recovery context from a failed graph event", () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Recovery thread",
      initialRequest: "Retry failed classifications.",
      projectPath: workspacePath,
    });
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Recovery artifact",
      status: "approved",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Retry failed classifications." },
      sourcePath: join(workspacePath, "main.ts"),
      statePath: join(workspacePath, "state.json"),
    });
    store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Classify records.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        { id: "classify", type: "model_call", label: "Classify", retryPolicy: "Retry with same retained input." },
      ],
      edges: [{ id: "request-classify", source: "request", target: "classify", type: "control_flow" }],
    });
    const run = store.startWorkflowRun({ artifactId: artifact.id, status: "failed" });
    const event = store.appendWorkflowRunEvent({
      runId: run.id,
      type: "ambient.call.error",
      graphNodeId: "classify",
      message: "schema failed",
    });

    expect(buildWorkflowRecoveryPlan(store, { runId: run.id, eventId: event.id, action: "retry_step" })).toMatchObject({
      artifactId: artifact.id,
      resumeFromRunId: run.id,
      recovery: {
        action: "retry_step",
        sourceRunId: run.id,
        sourceEventId: event.id,
        targetGraphNodeId: "classify",
      },
    });
  });

  it("blocks recovery from an actively running workflow run", () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Recovery thread",
      initialRequest: "Retry failed classifications.",
      projectPath: workspacePath,
    });
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Recovery artifact",
      status: "approved",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Retry failed classifications." },
      sourcePath: join(workspacePath, "main.ts"),
      statePath: join(workspacePath, "state.json"),
    });
    store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Classify records.",
      nodes: [{ id: "classify", type: "model_call", label: "Classify", retryPolicy: "Retry with same retained input." }],
      edges: [],
    });
    const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
    const event = store.appendWorkflowRunEvent({
      runId: run.id,
      type: "ambient.call.error",
      graphNodeId: "classify",
      message: "schema failed",
      createdAt: "2026-05-18T00:00:00.000Z",
    });

    expect(() =>
      buildWorkflowRecoveryPlan(store, { runId: run.id, eventId: event.id, action: "retry_step" }, {
        nowMs: Date.parse("2026-05-18T00:00:30.000Z"),
        staleMs: 60_000,
      }),
    ).toThrow("Cannot recover a workflow run that is still running");
  });

  it("allows recovery from a stale running workflow run with retained failure coordinates", () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Recovery thread",
      initialRequest: "Retry failed classifications.",
      projectPath: workspacePath,
    });
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Recovery artifact",
      status: "approved",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Retry failed classifications." },
      sourcePath: join(workspacePath, "main.ts"),
      statePath: join(workspacePath, "state.json"),
    });
    store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Classify records.",
      nodes: [{ id: "classify", type: "model_call", label: "Classify", retryPolicy: "Retry with same retained input." }],
      edges: [],
    });
    const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
    const event = store.appendWorkflowRunEvent({
      runId: run.id,
      type: "ambient.call.error",
      graphNodeId: "classify",
      message: "schema failed",
      createdAt: "2026-05-18T00:00:00.000Z",
    });

    expect(
      buildWorkflowRecoveryPlan(store, { runId: run.id, eventId: event.id, action: "retry_step" }, {
        nowMs: Date.parse("2026-05-18T00:06:00.000Z"),
        staleMs: 5 * 60_000,
      }),
    ).toMatchObject({
      artifactId: artifact.id,
      resumeFromRunId: run.id,
      recovery: {
        action: "retry_step",
        sourceRunId: run.id,
        sourceEventId: event.id,
        targetGraphNodeId: "classify",
      },
    });
  });

  it("marks stale running source runs failed before launching recovery", () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Recovery thread",
      initialRequest: "Retry failed classifications.",
      projectPath: workspacePath,
    });
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Recovery artifact",
      status: "approved",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Retry failed classifications." },
      sourcePath: join(workspacePath, "main.ts"),
      statePath: join(workspacePath, "state.json"),
    });
    const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
    const event = store.appendWorkflowRunEvent({
      runId: run.id,
      type: "ambient.call.error",
      graphNodeId: "classify",
      message: "schema failed",
      createdAt: "2026-05-18T00:00:00.000Z",
    });

    expect(
      markStaleWorkflowRunForRecoveryIfNeeded(
        store,
        run.id,
        { recoveryAction: "retry_step", sourceEventId: event.id, reason: "test recovery" },
        {
          nowMs: Date.parse("2026-05-18T00:06:00.000Z"),
          staleMs: 5 * 60_000,
        },
      ),
    ).toMatchObject({
      changed: true,
      summary: expect.stringContaining("No workflow run update has been recorded"),
    });
    expect(store.getWorkflowRun(run.id)).toMatchObject({
      status: "failed",
      error: expect.stringContaining("No workflow run update has been recorded"),
    });
    expect(store.listWorkflowRunEvents(run.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "workflow.stale",
          data: expect.objectContaining({
            recoveryAction: "retry_step",
            sourceEventId: event.id,
            latestEventType: "ambient.call.error",
          }),
        }),
      ]),
    );
  });

  it("rejects skip item recovery without a skip-capable graph policy", () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Recovery thread",
      initialRequest: "Retry failed records.",
      projectPath: workspacePath,
    });
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Recovery artifact",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Retry failed records." },
      sourcePath: join(workspacePath, "main.ts"),
      statePath: join(workspacePath, "state.json"),
    });
    store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Process records.",
      nodes: [{ id: "process", type: "deterministic_step", label: "Process", retryPolicy: "Retry only." }],
      edges: [],
    });
    const run = store.startWorkflowRun({ artifactId: artifact.id, status: "failed" });
    const event = store.appendWorkflowRunEvent({
      runId: run.id,
      type: "batch.item.failed",
      graphNodeId: "process",
      itemKey: "record-1",
      message: "bad record",
    });

    expect(() => buildWorkflowRecoveryPlan(store, { runId: run.id, eventId: event.id, action: "skip_item" })).toThrow(
      "Skip requires a graph retry policy",
    );
  });

  it("retains page recovery coordinates for partial continuation", () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Recovery thread",
      initialRequest: "Collect source pages.",
      projectPath: workspacePath,
    });
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Recovery artifact",
      status: "approved",
      manifest: { tools: ["browser_search"], mutationPolicy: "read_only" },
      spec: { goal: "Collect source pages." },
      sourcePath: join(workspacePath, "main.ts"),
      statePath: join(workspacePath, "state.json"),
    });
    store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Collect search pages.",
      nodes: [
        {
          id: "search-pages",
          type: "data_source",
          label: "Search pages",
          retryPolicy: "read-only bounded tool pagination; checkpointed page retry; continue with partial results after failed page",
        },
      ],
      edges: [],
    });
    const run = store.startWorkflowRun({ artifactId: artifact.id, status: "failed" });
    const event = store.appendWorkflowRunEvent({
      runId: run.id,
      type: "collection.page.error",
      graphNodeId: "search-pages",
      itemKey: "page-2",
      message: "search failed",
      data: { targetKind: "page", targetIndex: 1, checkpointKey: "search-pages" },
    });

    expect(buildWorkflowRecoveryPlan(store, { runId: run.id, eventId: event.id, action: "skip_item" })).toMatchObject({
      artifactId: artifact.id,
      resumeFromRunId: run.id,
      recovery: {
        action: "skip_item",
        sourceRunId: run.id,
        sourceEventId: event.id,
        targetGraphNodeId: "search-pages",
        targetItemKey: "page-2",
        targetKind: "page",
        targetIndex: 1,
        targetCheckpointKey: "search-pages",
        reason: "Continue without failed page page-2.",
      },
    });
  });
});
