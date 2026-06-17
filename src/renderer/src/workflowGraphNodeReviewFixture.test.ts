import { describe, expect, it } from "vitest";
import { workflowGraphWithSourceMappings, type WorkflowCompilerOutput } from "../../main/workflow-compiler/workflowCompiler";
import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowRunDetail, WorkflowRunSummary } from "../../shared/types";
import { workflowGraphNodeReviewModel } from "./workflowGraphNodeReviewUiModel";
import { workflowReviewWorkspaceModel } from "./workflowReviewUiModel";

const source = `
export default async function run({ workflow, ambient, connectors }) {
  const rows = await workflow.step("Read", { nodeId: "records" }, () =>
    connectors.call({ connectorId: "fixture.readonly", operation: "listRecords", input: {}, nodeId: "records" })
  );
  const labels = await ambient.call({ task: "classify", input: rows, schema, nodeId: "classify" });
  await workflow.requireApproval({ labels }, { nodeId: "review" });
  await workflow.stageMutation({ labels }, async () => labels, { nodeId: "write" });
}
`;

const manifest: WorkflowArtifactSummary["manifest"] = {
  tools: ["ambient.responses"],
  connectors: [
    {
      connectorId: "fixture.readonly",
      accountId: "primary",
      scopes: ["records.read"],
      operations: ["listRecords"],
      dataRetention: "redacted_audit",
    },
  ],
  mutationPolicy: "staged_until_approved",
  maxToolCalls: 4,
  maxConnectorCalls: 2,
  maxModelCalls: 1,
  maxRunMs: 60_000,
};

const compilerGraph = {
  summary: "Read records, classify them, review, then stage a write.",
  nodes: [
    { id: "request", type: "request", label: "Request" },
    { id: "records", type: "connector_call", label: "Read records", connectorIds: ["fixture.readonly"] },
    {
      id: "classify",
      type: "model_call",
      label: "Classify records",
      modelRole: "Categorize connector records.",
      inputSummary: "Connector rows",
      outputSummary: "Structured labels",
      retryPolicy: "Retry with the same connector rows.",
    },
    { id: "review", type: "review_gate", label: "Review labels", reviewPolicy: "Pause before staging mutations." },
    { id: "write", type: "mutation", label: "Stage report write", reviewPolicy: "Stage output for approval." },
    { id: "output", type: "output", label: "Report" },
  ],
  edges: [
    { id: "request-records", source: "request", target: "records", type: "control_flow" },
    { id: "records-classify", source: "records", target: "classify", type: "data_flow" },
    { id: "classify-review", source: "classify", target: "review", type: "condition" },
    { id: "review-write", source: "review", target: "write", type: "control_flow" },
    { id: "write-output", source: "write", target: "output", type: "data_flow" },
  ],
} satisfies NonNullable<WorkflowCompilerOutput["graph"]>;

const compiledGraph = workflowGraphWithSourceMappings(source, compilerGraph);

const thread: WorkflowAgentThreadSummary = {
  id: "thread-fixture",
  folderId: "home",
  projectName: "Fixture",
  projectPath: "/tmp/fixture",
  title: "Compiled fixture workflow",
  phase: "ready_for_review",
  initialRequest: "Read records, classify them, and stage a report.",
  preview: "Compiled workflow fixture.",
  status: "ready_for_review",
  traceMode: "production",
  latestVersion: {
    id: "version-fixture",
    workflowThreadId: "thread-fixture",
    artifactId: "artifact-fixture",
    version: 1,
    sourcePath: "/tmp/fixture/.ambient-codex/workflows/compiled/main.ts",
    repoPath: "/tmp/fixture/.ambient-codex/workflows/compiled",
    status: "ready_for_review",
    createdBy: "compiler",
    createdAt: "2026-05-05T00:00:00.000Z",
  },
  graph: {
    id: "graph-fixture",
    workflowThreadId: "thread-fixture",
    version: 1,
    source: "compile",
    summary: compiledGraph.summary,
    nodes: compiledGraph.nodes,
    edges: compiledGraph.edges,
    createdAt: "2026-05-05T00:00:00.000Z",
  },
  discoveryQuestions: [],
  badges: [],
  createdAt: "2026-05-05T00:00:00.000Z",
  updatedAt: "2026-05-05T00:00:00.000Z",
};

const artifact: WorkflowArtifactSummary = {
  id: "artifact-fixture",
  workflowThreadId: "thread-fixture",
  title: "Compiled fixture workflow",
  status: "ready_for_preview",
  manifest,
  spec: {
    goal: "Read records, classify them, and stage a report.",
    summary: "Compiled fixture workflow.",
  },
  sourcePath: "/tmp/fixture/.ambient-codex/workflows/compiled/main.ts",
  statePath: "/tmp/fixture/.ambient-codex/workflows/compiled/state.json",
  createdAt: "2026-05-05T00:00:00.000Z",
  updatedAt: "2026-05-05T00:00:00.000Z",
};

const latestRun: WorkflowRunSummary = {
  id: "run-fixture",
  artifactId: artifact.id,
  status: "previewed",
  startedAt: "2026-05-05T00:00:00.000Z",
  updatedAt: "2026-05-05T00:00:03.000Z",
};

const detail: WorkflowRunDetail = {
  artifact,
  run: latestRun,
  events: [
    event("event-records", 1, "connector.end", "records"),
    event("event-classify", 2, "ambient.call.end", "classify"),
    event("event-review", 3, "workflow.approval.pending", "review"),
    event("event-write", 4, "workflow.mutation.staged", "write"),
  ],
  modelCalls: [
    {
      id: "model-fixture",
      runId: latestRun.id,
      artifactId: artifact.id,
      task: "classify",
      status: "succeeded",
      input: { rows: 3 },
      output: { labels: ["a", "b", "c"] },
      graphNodeId: "classify",
      startedAt: "2026-05-05T00:00:01.000Z",
      completedAt: "2026-05-05T00:00:02.000Z",
      latencyMs: 1000,
    },
  ],
  checkpoints: [{ key: "records", runId: latestRun.id, valuePreview: "[3 rows]" }],
  approvals: [],
  auditReport: "Fixture audit",
  sourceContent: source,
};

describe("workflowGraphNodeReview compiled fixture", () => {
  it("keeps graph node review aligned with source mappings, manifest grants, and audit evidence", () => {
    const workspaceReview = workflowReviewWorkspaceModel({ thread, artifact, latestRun, detail });
    expect(workspaceReview.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "diagram", value: "6 nodes", detail: "5 edges from Compile snapshot 1.", tone: "ready" }),
        expect.objectContaining({ id: "connectors", value: "1 grant", tone: "ready" }),
        expect.objectContaining({ id: "mutation_policy", value: "Staged", tone: "review" }),
        expect.objectContaining({ id: "source", value: `${source.length.toLocaleString()} chars`, tone: "ready" }),
      ]),
    );

    const connectorReview = nodeReview("records");
    expect(connectorReview.sourceMappings.map((mapping) => mapping.label)).toEqual(
      expect.arrayContaining(["Connector Call lines 4-4", "Workflow Step lines 3-5"]),
    );
    expect(connectorReview.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Connector grants",
          value: "1 connector",
          detail: expect.stringContaining("fixture.readonly"),
          tone: "review",
        }),
      ]),
    );
    expect(connectorReview.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "open_source", targetSection: "source", tone: "ready" }),
        expect.objectContaining({ id: "open_audit", targetSection: "audit", tone: "ready" }),
        expect.objectContaining({ id: "review_connector_grants", targetSection: "connectors", tone: "review" }),
      ]),
    );

    const modelReview = nodeReview("classify");
    expect(modelReview.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Model requirement", value: "Ambient call allowed", detail: "1 max model call.", tone: "ready" }),
        expect.objectContaining({ label: "Latest trace", value: "1 event, 1 model call", tone: "ready" }),
      ]),
    );
    expect(modelReview.sourceMappings).toEqual([expect.objectContaining({ label: "Ambient Call lines 6-6" })]);

    const mutationReview = nodeReview("write");
    expect(mutationReview.facts).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Mutation policy", value: "Staged Until Approved", tone: "review" })]));
    expect(mutationReview.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "review_mutation_policy", targetSection: "mutation_policy", tone: "review" })]),
    );
  });
});

function nodeReview(nodeId: string) {
  const node = compiledGraph.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`Missing fixture node ${nodeId}`);
  return workflowGraphNodeReviewModel({
    node,
    manifest,
    traceMode: thread.traceMode,
    events: detail.events,
    modelCalls: detail.modelCalls,
    checkpoints: detail.checkpoints,
  });
}

function event(id: string, seq: number, type: string, graphNodeId: string) {
  return {
    id,
    runId: latestRun.id,
    artifactId: artifact.id,
    seq,
    type,
    graphNodeId,
    createdAt: "2026-05-05T00:00:00.000Z",
  };
}
