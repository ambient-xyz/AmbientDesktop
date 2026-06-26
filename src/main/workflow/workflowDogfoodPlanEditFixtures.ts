import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectStore } from "./workflowProjectStoreFacade";
import { commitWorkflowVersionRepo } from "./workflowVersioning";

export async function createPlanEditFixtureWorkflow(store: ProjectStore, workspacePath: string) {
  const thread = store.createWorkflowAgentThreadSummary({
    title: "Plan Edit Dogfood Workflow",
    initialRequest: "Call Ambient once to draft a concise local reading list.",
    projectPath: workspacePath,
    phase: "ready_for_review",
    traceMode: "debug",
  });
  const graph = store.createWorkflowGraphSnapshot({
    workflowThreadId: thread.id,
    source: "compile",
    summary: "request to Ambient model call to output",
    nodes: [
      { id: "request", type: "request", label: "Request", description: "User asks for a local reading list." },
      {
        id: "draft-list",
        type: "model_call",
        label: "Draft list",
        modelRole: "Draft concise reading-list recommendations.",
        inputSummary: "instruction for a concise reading-list JSON response",
        outputSummary: "JSON object with summary string",
        retryPolicy: "no retry in fixture",
      },
      { id: "output", type: "output", label: "Output", description: "Return the list to the user." },
    ],
    edges: [
      { id: "request-to-draft", source: "request", target: "draft-list", type: "data_flow", label: "prompt" },
      { id: "draft-to-output", source: "draft-list", target: "output", type: "data_flow", label: "list" },
    ],
  });
  const workflowDir = join(workspacePath, ".ambient-codex", "workflows", "plan-edit-dogfood");
  await mkdir(workflowDir, { recursive: true });
  const sourcePath = join(workflowDir, "main.ts");
  const statePath = join(workflowDir, "state.json");
  await writeFile(
    sourcePath,
    [
      "const listSchema = {",
      "  parse(value) {",
      "    if (!value || typeof value.summary !== 'string') throw new Error('Invalid list response.');",
      "    return value;",
      "  }",
      "};",
      "",
      "export default async function run({ workflow, ambient }) {",
      "  const result = await workflow.step('draft-list', { nodeId: 'draft-list' }, () => ambient.call({",
      "    task: 'dogfood.plan_edit_fixture',",
      "    input: { instruction: 'Return JSON with summary:string for a concise reading list.' },",
      "    schema: listSchema,",
      "    cacheKey: ['dogfood', 'plan-edit-fixture'],",
      "    nodeId: 'draft-list'",
      "  }));",
      "  await workflow.checkpoint('readingList', result);",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  const artifact = store.createWorkflowArtifact({
    workflowThreadId: thread.id,
    title: "Plan Edit Dogfood Workflow",
    status: "approved",
    manifest: {
      tools: ["ambient.responses"],
      mutationPolicy: "read_only",
      maxToolCalls: 2,
      maxModelCalls: 1,
      maxRunMs: 120_000,
    },
    spec: {
      goal: "Call Ambient once to draft a concise local reading list.",
      summary: "Uses one Ambient model call and checkpoints the returned reading list.",
      successCriteria: ["Ambient returns structured JSON", "The workflow writes a readingList checkpoint"],
      inputs: {},
    },
    sourcePath,
    statePath,
  });
  const version = store.createWorkflowVersion({
    workflowThreadId: thread.id,
    artifactId: artifact.id,
    graphSnapshotId: graph.id,
    sourcePath,
    repoPath: workspacePath,
    gitCommitHash: "plan-edit-dogfood",
    status: "approved",
    createdBy: "compiler",
  });
  return { threadId: thread.id, graphId: graph.id, artifactId: artifact.id, versionId: version.id };
}

export async function createApplyRestoreFixtureWorkflow(store: ProjectStore, workspacePath: string) {
  const thread = store.createWorkflowAgentThreadSummary({
    title: "Apply Restore Dogfood Workflow",
    initialRequest: "Call Ambient once to draft a concise local reading list, then keep the workflow versioned.",
    projectPath: workspacePath,
    phase: "approved",
    traceMode: "debug",
  });
  store.ensureWorkflowAgentChatThread(thread.id);
  const workflowDir = join(workspacePath, ".ambient-codex", "workflows", "apply-restore-dogfood");
  await mkdir(workflowDir, { recursive: true });
  const sourcePath = join(workflowDir, "main.ts");
  const statePath = join(workflowDir, "state.json");
  const manifest = {
    tools: ["ambient.responses"],
    mutationPolicy: "read_only" as const,
    maxToolCalls: 2,
    maxModelCalls: 1,
    maxRunMs: 120_000,
  };
  const spec = {
    goal: "Call Ambient once to draft a concise local reading list.",
    summary: "Uses one Ambient model call and checkpoints the returned reading list.",
    successCriteria: ["Ambient returns structured JSON", "The workflow writes a readingList checkpoint"],
    inputs: {},
  };
  const graph = {
    summary: "request to Ambient model call to output",
    nodes: [
      { id: "request", type: "request" as const, label: "Request", description: "User asks for a local reading list." },
      {
        id: "draft-list",
        type: "model_call" as const,
        label: "Draft list",
        modelRole: "Draft concise reading-list recommendations.",
        inputSummary: "instruction for a concise reading-list JSON response",
        outputSummary: "JSON object with summary string",
        retryPolicy: "no retry in fixture",
      },
      { id: "output", type: "output" as const, label: "Output", description: "Return the list to the user." },
    ],
    edges: [
      { id: "request-to-draft", source: "request", target: "draft-list", type: "data_flow" as const, label: "prompt" },
      { id: "draft-to-output", source: "draft-list", target: "output", type: "data_flow" as const, label: "list" },
    ],
  };
  const source = [
    "const listSchema = {",
    "  parse(value) {",
    "    if (!value || typeof value.summary !== 'string') throw new Error('Invalid list response.');",
    "    return value;",
    "  }",
    "};",
    "",
    "export default async function run({ workflow, ambient }) {",
    "  const result = await workflow.step('draft-list', { nodeId: 'draft-list' }, () => ambient.call({",
    "    task: 'dogfood.apply_restore_fixture',",
    "    input: { instruction: 'Return JSON with summary:string for a concise reading list.' },",
    "    schema: listSchema,",
    "    cacheKey: ['dogfood', 'apply-restore-fixture'],",
    "    nodeId: 'draft-list'",
    "  }));",
    "  await workflow.checkpoint('readingList', result);",
    "}",
    "",
  ].join("\n");

  await writeFile(join(workflowDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(join(workflowDir, "spec.json"), `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  await writeFile(join(workflowDir, "graph.json"), `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  await writeFile(sourcePath, source, "utf8");
  await writeFile(join(workflowDir, "preview.md"), "# Apply Restore Dogfood Workflow\n", "utf8");
  await writeFile(join(workflowDir, "compile-context.json"), `${JSON.stringify({ fixture: "apply-restore" }, null, 2)}\n`, "utf8");
  const commit = await commitWorkflowVersionRepo({ repoPath: workflowDir, message: "Create apply restore dogfood workflow" });
  const graphSnapshot = store.createWorkflowGraphSnapshot({
    workflowThreadId: thread.id,
    source: "compile",
    summary: graph.summary,
    nodes: graph.nodes,
    edges: graph.edges,
    artifactPath: join(workflowDir, "graph.json"),
  });
  const artifact = store.createWorkflowArtifact({
    workflowThreadId: thread.id,
    title: "Apply Restore Dogfood Workflow",
    status: "approved",
    manifest,
    spec,
    sourcePath,
    statePath,
  });
  const version = store.createWorkflowVersion({
    workflowThreadId: thread.id,
    artifactId: artifact.id,
    graphSnapshotId: graphSnapshot.id,
    sourcePath,
    repoPath: workflowDir,
    gitCommitHash: commit.commitHash,
    status: "approved",
    createdBy: "compiler",
  });
  return { threadId: thread.id, graphId: graphSnapshot.id, artifactId: artifact.id, versionId: version.id, workflowDir };
}
