import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./workflowProjectStoreFacade";
import {
  buildWorkflowDebugRewriteContext,
  buildWorkflowDebugRewritePromptSection,
  buildWorkflowSourceDiff,
  createWorkflowDebugRewriteRevision,
  workflowDebugRewriteUserRequest,
} from "./workflowDebugRewrite";

describe("workflow debug rewrite context", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-debug-rewrite-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("packages failed run trace, graph, source, checkpoints, and user notes for compiler rewrite", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Classify records",
      initialRequest: "Classify records and report failures.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const graph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Request to classifier to report.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        { id: "classify", type: "model_call", label: "Classify", modelRole: "classify", inputSummary: "records", outputSummary: "labels", retryPolicy: "same input" },
      ],
      edges: [{ id: "request-to-classify", source: "request", target: "classify", type: "control_flow" }],
    });
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "debug-rewrite");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(sourcePath, "export default async function run({ workflow }) { await workflow.step('Classify', { nodeId: 'classify' }, async () => { throw new Error('schema mismatch'); }); }\n");
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Classify records",
      status: "approved",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Classify records.", summary: "Uses Ambient to classify records." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
    store.updateWorkflowRun({ id: run.id, status: "failed", error: "schema mismatch", finish: true });
    store.appendWorkflowRunEvent({
      runId: run.id,
      type: "workflow.version",
      message: "hash",
      data: { sourceHash: "source", manifestHash: "manifest" },
    });
    store.appendWorkflowRunEvent({
      runId: run.id,
      type: "step.error",
      message: "Classify",
      graphNodeId: "classify",
      data: { error: "schema mismatch", input: { recordId: "rec-1" } },
    });
    store.appendWorkflowRunEvent({
      runId: run.id,
      type: "workflow.failed",
      message: "schema mismatch",
    });
    store.recordWorkflowModelCall({
      runId: run.id,
      task: "classify.records",
      status: "invalid",
      input: { recordId: "rec-1" },
      validationError: "Expected label",
      graphNodeId: "classify",
      startedAt: "2026-05-02T00:00:00.000Z",
      completedAt: "2026-05-02T00:00:01.000Z",
    });

    const context = buildWorkflowDebugRewriteContext(store, {
      runId: run.id,
      userNotes: "Make schema errors recoverable.",
    });
    const section = buildWorkflowDebugRewritePromptSection(context);

    expect(context).toMatchObject({
      runId: run.id,
      artifactId: artifact.id,
      workflowThreadId: thread.id,
      failedEvent: expect.objectContaining({ type: "step.error", graphNodeId: "classify" }),
      graph: expect.objectContaining({ id: graph.id }),
      modelCalls: [expect.objectContaining({ task: "classify.records", graphNodeId: "classify", validationError: "Expected label" })],
    });
    expect(section).toContain("debug rewrite request");
    expect(section).toContain("schema mismatch");
    expect(section).toContain("Make schema errors recoverable");
    expect(section).toContain("export default async function run");
    expect(workflowDebugRewriteUserRequest(context)).toContain("failed run");
  });

  it("honors the graph event selected by the UI when building debug rewrite context", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Process records",
      initialRequest: "Process records and repair selected failures.",
      projectPath: workspacePath,
      phase: "planned",
    });
    store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Two failing processing nodes.",
      nodes: [
        { id: "extract", type: "deterministic_step", label: "Extract" },
        { id: "classify", type: "model_call", label: "Classify" },
      ],
      edges: [{ id: "extract-classify", source: "extract", target: "classify", type: "control_flow" }],
    });
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "debug-rewrite-selected-event");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(sourcePath, "export default async function run() {}\n");
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Process records",
      status: "approved",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Process records." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
    store.updateWorkflowRun({ id: run.id, status: "failed", error: "classification failed", finish: true });
    store.appendWorkflowRunEvent({ runId: run.id, type: "step.error", message: "Extract", graphNodeId: "extract", data: { error: "extract failed" } });
    const selected = store.appendWorkflowRunEvent({ runId: run.id, type: "ambient.call.invalid", message: "Classify", graphNodeId: "classify", data: { error: "schema mismatch" } });
    store.appendWorkflowRunEvent({ runId: run.id, type: "workflow.failed", message: "classification failed" });

    const context = buildWorkflowDebugRewriteContext(store, {
      runId: run.id,
      eventId: selected.id,
      userNotes: "Debug the selected graph card.",
    });

    expect(context.failedEvent).toMatchObject({
      id: selected.id,
      type: "ambient.call.invalid",
      graphNodeId: "classify",
    });
    expect(workflowDebugRewriteUserRequest(context)).toContain("graph node classify");
  });

  it("persists proposed graph and source diffs after a debug rewrite compiles", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Classify records",
      initialRequest: "Classify records and report failures.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "debug-rewrite-diff");
    await mkdir(artifactRoot, { recursive: true });
    const baseSourcePath = join(artifactRoot, "base.ts");
    await writeFile(baseSourcePath, "export default async function run({ workflow }) {\n  await workflow.step('Classify', { nodeId: 'classify' }, async () => 'old');\n}\n");
    const baseArtifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Classify records",
      status: "approved",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Classify records.", summary: "Uses Ambient to classify records." },
      sourcePath: baseSourcePath,
      statePath: join(artifactRoot, "base-state.json"),
    });
    const baseGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Classify records.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        { id: "classify", type: "model_call", label: "Classify", modelRole: "classify", inputSummary: "records", outputSummary: "labels", retryPolicy: "same input" },
      ],
      edges: [{ id: "request-to-classify", source: "request", target: "classify", type: "control_flow" }],
    });
    const baseVersion = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: baseArtifact.id,
      graphSnapshotId: baseGraph.id,
      sourcePath: baseArtifact.sourcePath,
      repoPath: artifactRoot,
      status: "approved",
      createdBy: "compiler",
    });
    const run = store.startWorkflowRun({ artifactId: baseArtifact.id, status: "running" });
    store.updateWorkflowRun({ id: run.id, status: "failed", error: "schema mismatch", finish: true });
    store.appendWorkflowRunEvent({ runId: run.id, type: "workflow.failed", message: "schema mismatch", graphNodeId: "classify" });
    const context = buildWorkflowDebugRewriteContext(store, { runId: run.id, userNotes: "Add validation recovery." });

    const proposedSourcePath = join(artifactRoot, "proposed.ts");
    await writeFile(
      proposedSourcePath,
      "export default async function run({ workflow }) {\n  await workflow.step('Classify safely', { nodeId: 'classify' }, async () => 'new');\n  await workflow.step('Report', { nodeId: 'report' }, async () => undefined);\n}\n",
    );
    const proposedArtifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Classify records debugged",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only", maxModelCalls: 2 },
      spec: { goal: "Classify records.", summary: "Adds validation recovery." },
      sourcePath: proposedSourcePath,
      statePath: join(artifactRoot, "proposed-state.json"),
    });
    const proposedGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Classify records and report.",
      nodes: [...baseGraph.nodes, { id: "report", type: "output", label: "Report" }],
      edges: [...baseGraph.edges, { id: "classify-to-report", source: "classify", target: "report", type: "data_flow" }],
    });

    const revision = createWorkflowDebugRewriteRevision(store, context, {
      baseVersionId: baseVersion.id,
      requestedChange: "Debug schema mismatch.",
    });

    expect(revision).toMatchObject({
      workflowThreadId: thread.id,
      baseVersionId: baseVersion.id,
      baseArtifactId: baseArtifact.id,
      proposedGraphSnapshotId: proposedGraph.id,
      status: "proposed",
      sourceDiff: expect.stringContaining("+  await workflow.step('Report'"),
    });
    expect(revision.graphDiff).toMatchObject({
      addedNodes: [expect.objectContaining({ id: "report" })],
      manifest: expect.objectContaining({
        fieldChanges: expect.arrayContaining([expect.objectContaining({ field: "maxModelCalls" })]),
      }),
    });
    expect(store.getWorkflowArtifact(proposedArtifact.id)).toMatchObject({ status: "ready_for_preview" });
  });

  it("builds compact source diffs for changed workflow programs", () => {
    expect(buildWorkflowSourceDiff("one\nold\nthree\n", "one\nnew\nthree\n")).toContain("-old\n+new");
    expect(buildWorkflowSourceDiff("same\n", "same\n")).toBeUndefined();
  });
});
