import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pluginMcpToolDescriptor } from "../desktopToolRegistry";
import { ProjectStore } from "../projectStore/projectStore";
import type { PluginMcpToolRegistration } from "../plugins/pluginHost";
import { invokeWorkflowNativeTool, workflowNativeToolDescriptors, type WorkflowNativeRunArtifactInput } from "./workflowNativeTools";
import { runWorkflowArtifact } from "./workflowRunService";
import { commitWorkflowVersionRepo } from "./workflowVersioning";

describe("workflowNativeTools", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-native-tools-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("exposes workflow-native tool descriptors for Pi", () => {
    const descriptors = workflowNativeToolDescriptors();
    expect(descriptors.map((descriptor) => descriptor.name)).toEqual([
      "workflow_current_context",
      "workflow_get_artifact",
      "workflow_get_source",
      "workflow_get_run_trace",
      "workflow_get_versions",
      "workflow_capability_search",
      "workflow_capability_describe",
      "workflow_propose_manifest_revision",
      "workflow_propose_revision",
      "workflow_validate_revision",
      "workflow_explain_revision_diff",
      "workflow_apply_revision",
      "workflow_update_run_settings",
      "workflow_restore_version",
      "workflow_run_preview",
      "workflow_run_version",
    ]);
    expect(
      descriptors
        .filter((descriptor) => descriptor.name !== "workflow_propose_revision" && descriptor.name !== "workflow_propose_manifest_revision")
        .filter((descriptor) => descriptor.name !== "workflow_apply_revision")
        .filter((descriptor) => descriptor.name !== "workflow_update_run_settings")
        .filter((descriptor) => descriptor.name !== "workflow_restore_version")
        .filter((descriptor) => descriptor.name !== "workflow_run_preview")
        .filter((descriptor) => descriptor.name !== "workflow_run_version")
        .every((descriptor) => descriptor.sideEffects === "none"),
    ).toBe(true);
    expect(descriptors.find((descriptor) => descriptor.name === "workflow_propose_revision")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "workflow-native-proposal",
    });
    expect(descriptors.find((descriptor) => descriptor.name === "workflow_propose_manifest_revision")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "workflow-native-proposal",
    });
    expect(descriptors.find((descriptor) => descriptor.name === "workflow_apply_revision")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "workflow-native-apply",
    });
    expect(descriptors.find((descriptor) => descriptor.name === "workflow_update_run_settings")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "workflow-native-run-settings",
    });
    expect(descriptors.find((descriptor) => descriptor.name === "workflow_restore_version")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "workflow-native-restore",
    });
    expect(descriptors.find((descriptor) => descriptor.name === "workflow_run_preview")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "workflow-native-run-preview",
    });
    expect(descriptors.find((descriptor) => descriptor.name === "workflow_run_version")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "workflow-native-run-version",
    });
    expect(descriptors.find((descriptor) => descriptor.name === "workflow_get_artifact")?.inputSchema).toMatchObject({
      required: ["workflowThreadId"],
    });
    expect(descriptors.find((descriptor) => descriptor.name === "workflow_get_source")?.inputSchema).toMatchObject({
      required: ["workflowThreadId"],
    });
    expect(JSON.stringify(descriptors.find((descriptor) => descriptor.name === "workflow_get_artifact")?.inputSchema)).not.toContain("requestedChange");
  });

  it("inspects current context, artifact, source, versions, and run trace", async () => {
    const fixture = await createWorkflowFixture();
    const runtime = {
      store,
      workspacePath,
      permissionMode: "workspace" as const,
    };

    const context = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_current_context",
      arguments: { workflowThreadId: fixture.threadId },
    });
    expect(context.text).toContain("workflow_current_context completed");
    expect(context.data).toMatchObject({
      thread: { id: fixture.threadId, title: "Native Tool Workflow" },
      counts: { versions: 1, runs: 1, graphNodes: 2 },
    });

    const artifact = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_get_artifact",
      arguments: { workflowThreadId: fixture.threadId },
    });
    expect(artifact.data).toMatchObject({
      artifact: { id: fixture.artifactId, title: "Native Tool Workflow" },
      graph: { id: fixture.graphId, summary: "request to output" },
      version: undefined,
    });

    const source = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_get_source",
      arguments: { workflowThreadId: fixture.threadId, maxChars: 16 },
    });
    expect(source.data).toMatchObject({
      artifactId: fixture.artifactId,
      chars: expect.any(Number),
      returnedChars: 16,
      truncated: true,
      content: "export async fun",
    });

    const versions = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_get_versions",
      arguments: { workflowThreadId: fixture.threadId },
    });
    expect(versions.data).toMatchObject({
      workflowThreadId: fixture.threadId,
      totalVersions: 1,
      versions: [expect.objectContaining({ artifactId: fixture.artifactId, status: "approved" })],
    });

    const trace = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_get_run_trace",
      arguments: { workflowThreadId: fixture.threadId, eventLimit: 1 },
    });
    expect(trace.text).toContain("Workflow run trace returned 1 of 2 events");
    expect(trace.data).toMatchObject({
      artifact: { id: fixture.artifactId },
      run: { id: fixture.runId },
      eventCount: 2,
      returnedEventCount: 1,
      events: [expect.objectContaining({ type: "workflow.completed" })],
      modelCalls: [expect.objectContaining({ task: "summarize" })],
    });
  });

  it("searches and describes workflow capabilities through the native tool surface", async () => {
    const fixture = await createWorkflowFixture();
    const runtime = {
      store,
      workspacePath,
      permissionMode: "workspace" as const,
      pluginRegistrationsForWorkspace: async () => [fixtureArxivPluginRegistration()],
    };

    const search = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_capability_search",
      arguments: { workflowThreadId: fixture.threadId, query: "Find recent papers on arxiv" },
    });
    expect(search.data).toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({
          id: "plugin:arxiv_search",
          kind: "plugin_tool",
          label: "arXiv paper search via arXiv",
        }),
      ]),
    });

    const describe = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_capability_describe",
      arguments: { workflowThreadId: fixture.threadId, capabilityId: "plugin:arxiv_search", query: "Find recent papers on arxiv" },
    });
    expect(describe.data).toMatchObject({
      id: "plugin:arxiv_search",
      permissionCapability: "plugin_tool_execute",
      mutationClass: "plugin_defined",
    });
    expect(describe.text).toContain("workflow_capability_describe completed");
  });

  it("creates, validates, and explains mutation-safe workflow revision proposals", async () => {
    const fixture = await createWorkflowFixture();
    const runtime = {
      store,
      workspacePath,
      permissionMode: "workspace" as const,
    };
    const source = "export async function run() {\n  return 'revised';\n}\n";

    const proposal = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_propose_revision",
      arguments: {
        workflowThreadId: fixture.threadId,
        requestedChange: "Return a revised result string.",
        source,
      },
    });

    expect(proposal.text).toContain("Workflow revision proposal created");
    expect(proposal.data).toMatchObject({
      created: true,
      revision: {
        workflowThreadId: fixture.threadId,
        baseArtifactId: fixture.artifactId,
        proposedVersionId: expect.any(String),
        proposedArtifactId: expect.any(String),
        proposedGraphSnapshotId: expect.any(String),
        status: "proposed",
        sourceDiff: expect.stringContaining("+  return 'revised';"),
      },
      materializedVersion: {
        createdBy: "workflow_revision",
        status: "ready_for_review",
      },
      proposedArtifact: {
        status: "ready_for_preview",
        sourcePath: expect.stringContaining("workflow-revision-native-tool-workflow"),
      },
      validation: { valid: true },
      note: expect.stringContaining("not applied"),
    });
    expect(store.getWorkflowAgentThreadSummary(fixture.threadId)).toMatchObject({
      activeArtifactId: fixture.artifactId,
      phase: "revision",
    });

    const revisionId = (proposal.data as { revision: { id: string; proposedArtifactId: string; proposedVersionId: string } }).revision.id;
    const proposedArtifactId = (proposal.data as { revision: { proposedArtifactId: string } }).revision.proposedArtifactId;
    const proposedArtifact = store.getWorkflowArtifact(proposedArtifactId);
    await expect(readFile(proposedArtifact.sourcePath, "utf8")).resolves.toBe(source);
    expect(store.getWorkflowVersion((proposal.data as { revision: { proposedVersionId: string } }).revision.proposedVersionId)).toMatchObject({
      artifactId: proposedArtifactId,
      createdBy: "workflow_revision",
      status: "ready_for_review",
    });

    const validation = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_validate_revision",
      arguments: { workflowThreadId: fixture.threadId, revisionId },
    });
    expect(validation.text).toContain("Workflow revision validation passed");
    expect(validation.data).toMatchObject({
      revision: { id: revisionId, workflowThreadId: fixture.threadId },
      valid: true,
      warnings: [expect.stringContaining("Stored revision records retain diffs")],
    });

    const diff = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_explain_revision_diff",
      arguments: { workflowThreadId: fixture.threadId, revisionId },
    });
    expect(diff.text).toContain("Workflow revision diff explained");
    expect(diff.data).toMatchObject({
      graphSummary: "No graph or manifest diff recorded.",
      sourceSummary: "1 source line added, 1 source line removed.",
      bullets: [expect.stringContaining("source line added")],
    });
  });

  it("rejects source revision proposals for WorkflowProgramIR artifacts", async () => {
    const fixture = await createWorkflowFixture({ programIr: true });
    const runtime = {
      store,
      workspacePath,
      permissionMode: "workspace" as const,
    };

    const proposal = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_propose_revision",
      arguments: {
        workflowThreadId: fixture.threadId,
        requestedChange: "Patch generated program source directly.",
        source: "export async function run() {\n  return 'patched';\n}\n",
      },
    });

    expect(proposal.text).toContain("Workflow revision proposal was rejected");
    expect(proposal.data).toMatchObject({
      created: false,
      validation: {
        valid: false,
        errors: [expect.stringContaining("Generated from WorkflowProgramIR")],
      },
    });
    expect(store.listWorkflowRevisions(fixture.threadId)).toEqual([]);
  });

  it("applies materialized source workflow revisions without diff-only rewrite errors", async () => {
    const fixture = await createWorkflowFixture();
    store.ensureWorkflowAgentChatThread(fixture.threadId);
    const runtime = {
      store,
      workspacePath,
      permissionMode: "full-access" as const,
      defaultWorkflowThreadId: fixture.threadId,
    };
    const source = "export async function run() {\n  return 'materialized-source-revision';\n}\n";

    const proposal = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_propose_revision",
      arguments: {
        workflowThreadId: fixture.threadId,
        requestedChange: "Return a materialized source revision string.",
        source,
      },
    });
    const revisionId = (proposal.data as { revision: { id: string } }).revision.id;
    const proposedArtifactId = (proposal.data as { revision: { proposedArtifactId: string } }).revision.proposedArtifactId;

    const applied = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_apply_revision",
      arguments: { workflowThreadId: fixture.threadId, revisionId },
    });

    expect(applied.text).toContain("Workflow revision applied");
    expect(applied.data).toMatchObject({
      applied: true,
      revision: { id: revisionId, status: "applied" },
      materializedVersion: undefined,
      activeArtifact: {
        id: proposedArtifactId,
        status: "ready_for_preview",
      },
    });
    const thread = store.getWorkflowAgentThreadSummary(fixture.threadId);
    expect(thread.activeArtifactId).toBe(proposedArtifactId);
    expect(thread.phase).toBe("ready_for_review");
    await expect(readFile(store.getWorkflowArtifact(proposedArtifactId).sourcePath, "utf8")).resolves.toBe(source);
  });

  it("creates manifest-only limit revisions without source or graph rewrites", async () => {
    const fixture = await createWorkflowFixture();
    const runtime = {
      store,
      workspacePath,
      permissionMode: "workspace" as const,
      planEditIntentKind: "manifest_limits" as const,
      defaultWorkflowThreadId: fixture.threadId,
    };

    const proposal = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_propose_manifest_revision",
      arguments: {
        maxModelCalls: 4,
        maxToolCalls: 12,
        clearMaxRunMs: true,
      },
    });

    expect(proposal.text).toContain("Workflow manifest-only revision proposal created");
    expect(proposal.text).toContain("do not call workflow_propose_revision for the same manifest-only edit");
    expect(proposal.data).toMatchObject({
      created: true,
      revision: {
        workflowThreadId: fixture.threadId,
        baseArtifactId: fixture.artifactId,
        requestedChange: "Manifest-only edit: set maxToolCalls to 12, set maxModelCalls to 4, clear maxRunMs.",
        status: "proposed",
        sourceDiff: undefined,
        graphDiff: expect.objectContaining({
          manifest: expect.objectContaining({
            fieldChanges: expect.arrayContaining([
              expect.objectContaining({ field: "maxToolCalls", after: 12 }),
              expect.objectContaining({ field: "maxModelCalls", before: 1, after: 4 }),
            ]),
          }),
        }),
      },
      validation: { valid: true },
    });

    const blockedGenericProposal = await invokeWorkflowNativeTool(
      {
        store,
        workspacePath,
        permissionMode: "workspace" as const,
        planEditIntentKind: "manifest_limits",
      },
      {
        toolName: "workflow_propose_revision",
        arguments: {
          workflowThreadId: fixture.threadId,
          requestedChange: "Incorrectly route a manifest-only edit through the generic proposal tool.",
          manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only", maxModelCalls: 6 },
        },
      },
    );
    expect(blockedGenericProposal.text).toContain("Workflow revision proposal was rejected");
    expect(blockedGenericProposal.data).toMatchObject({
      created: false,
      validation: { errors: [expect.stringContaining("Use workflow_propose_manifest_revision")] },
    });
  });

  it("applies manifest-only workflow revisions through a gated native action", async () => {
    const fixture = await createWorkflowFixture();
    store.ensureWorkflowAgentChatThread(fixture.threadId);
    const runtime = {
      store,
      workspacePath,
      permissionMode: "full-access" as const,
      planEditIntentKind: "manifest_limits" as const,
      defaultWorkflowThreadId: fixture.threadId,
    };

    const proposal = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_propose_manifest_revision",
      arguments: {
        maxModelCalls: 3,
        maxToolCalls: 9,
      },
    });
    const revisionId = (proposal.data as { revision: { id: string } }).revision.id;

    const applied = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_apply_revision",
      arguments: { revisionId },
    });

    expect(applied.text).toContain("Workflow revision applied");
    expect(applied.data).toMatchObject({
      applied: true,
      revision: { id: revisionId, status: "applied" },
      materializedVersion: { createdBy: "workflow_revision" },
      activeArtifact: {
        manifest: expect.objectContaining({
          maxModelCalls: 3,
          maxToolCalls: 9,
        }),
      },
    });
    const thread = store.getWorkflowAgentThreadSummary(fixture.threadId);
    expect(thread.activeArtifactId).not.toBe(fixture.artifactId);
    expect(thread.latestVersion).toMatchObject({ createdBy: "workflow_revision" });
    expect(store.listPermissionAudit()).toEqual([
      expect.objectContaining({
        toolName: "workflow_apply_revision",
        decisionSource: "allowed_by_full_access",
        detail: expect.stringContaining(revisionId),
      }),
    ]);
  });

  it("previews and applies workflow run settings without source or graph rewrites", async () => {
    const fixture = await createWorkflowFixture();
    store.ensureWorkflowAgentChatThread(fixture.threadId);
    const runtime = {
      store,
      workspacePath,
      permissionMode: "full-access" as const,
      defaultWorkflowThreadId: fixture.threadId,
    };

    const preview = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_update_run_settings",
      arguments: {
        action: "preview_foreground",
        idleTimeoutMs: 300_000,
        clearMaxRunMs: true,
      },
    });
    expect(preview.text).toContain("Workflow run settings preview_foreground completed");
    expect(preview.data).toMatchObject({
      updated: false,
      action: "preview_foreground",
      runLimits: { idleTimeoutMs: 300_000, maxRunMs: null },
      persistentChange: false,
    });
    expect(store.listWorkflowRevisions(fixture.threadId)).toEqual([]);

    const applied = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_update_run_settings",
      arguments: {
        action: "apply_persistent",
        idleTimeoutMs: 300_000,
        maxRunMs: 900_000,
        maxConnectorCalls: 120,
      },
    });
    expect(applied.text).toContain("Workflow run settings updated");
    expect(applied.data).toMatchObject({
      updated: true,
      action: "apply_persistent",
      proposal: {
        revision: {
          graphDiff: expect.objectContaining({
            manifest: expect.objectContaining({
              fieldChanges: expect.arrayContaining([
                expect.objectContaining({ field: "defaultIdleTimeoutMs", after: 300_000 }),
                expect.objectContaining({ field: "maxRunMs", after: 900_000 }),
                expect.objectContaining({ field: "maxConnectorCalls", after: 120 }),
              ]),
            }),
          }),
        },
      },
      runLimits: { idleTimeoutMs: 300_000, maxRunMs: 900_000 },
    });
    const activeArtifact = store.getWorkflowArtifact(store.getWorkflowAgentThreadSummary(fixture.threadId).activeArtifactId!);
    expect(activeArtifact.manifest).toMatchObject({
      defaultIdleTimeoutMs: 300_000,
      maxRunMs: 900_000,
      maxConnectorCalls: 120,
    });

    const resetPreview = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_update_run_settings",
      arguments: {
        action: "preview_foreground",
        clearIdleTimeoutMs: true,
      },
    });
    expect(resetPreview.data).toMatchObject({
      updated: false,
      runLimits: { idleTimeoutMs: 120_000, maxRunMs: 900_000 },
    });
  });

  it("restores a committed workflow version through the workflow-native tool", async () => {
    const repoPath = join(workspacePath, ".ambient-codex", "workflows", "native-restore");
    await mkdir(repoPath, { recursive: true });
    await writeRestorableWorkflowFiles(repoPath, "v1");
    const firstCommit = await commitWorkflowVersionRepo({ repoPath, message: "Create v1" });

    const thread = store.createWorkflowAgentThreadSummary({
      title: "Native Restore Workflow",
      initialRequest: "Restore an older workflow.",
      projectPath: workspacePath,
      phase: "approved",
    });
    store.ensureWorkflowAgentChatThread(thread.id);
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Native Restore Workflow",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Fixture v1" },
      sourcePath: join(repoPath, "main.ts"),
      statePath: join(repoPath, "state.json"),
    });
    const firstGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Graph v1",
      nodes: [{ id: "request", type: "request", label: "Request v1" }],
      edges: [],
      artifactPath: join(repoPath, "graph.json"),
    });
    const firstVersion = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: artifact.id,
      graphSnapshotId: firstGraph.id,
      sourcePath: artifact.sourcePath,
      repoPath,
      gitCommitHash: firstCommit.commitHash,
      status: "approved",
      createdBy: "compiler",
    });

    await writeRestorableWorkflowFiles(repoPath, "v2");
    const secondCommit = await commitWorkflowVersionRepo({ repoPath, message: "Create v2" });
    const secondGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Graph v2",
      nodes: [{ id: "request", type: "request", label: "Request v2" }],
      edges: [],
      artifactPath: join(repoPath, "graph.json"),
    });
    store.updateWorkflowArtifact({
      id: artifact.id,
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Fixture v2" },
    });
    store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: artifact.id,
      graphSnapshotId: secondGraph.id,
      sourcePath: artifact.sourcePath,
      repoPath,
      gitCommitHash: secondCommit.commitHash,
      status: "approved",
      createdBy: "compiler",
    });

    const restored = await invokeWorkflowNativeTool(
      { store, workspacePath, permissionMode: "full-access", defaultWorkflowThreadId: thread.id },
      {
        toolName: "workflow_restore_version",
        arguments: { versionId: firstVersion.id },
      },
    );

    expect(restored.text).toContain("Workflow version restored as v3");
    expect(restored.data).toMatchObject({
      restored: true,
      workflowThreadId: thread.id,
      targetVersion: { id: firstVersion.id, version: 1 },
      restoredVersion: { version: 3, status: "ready_for_review", createdBy: "version_revert" },
      approveRestored: false,
    });
    await expect(readFile(artifact.sourcePath, "utf8")).resolves.toContain("fixture.v1");
    expect(store.getWorkflowAgentThreadSummary(thread.id)).toMatchObject({
      phase: "ready_for_review",
      latestVersion: expect.objectContaining({ version: 3 }),
    });
    expect(store.listPermissionAudit()).toEqual([
      expect.objectContaining({
        toolName: "workflow_restore_version",
        decisionSource: "allowed_by_full_access",
        detail: expect.stringContaining(firstVersion.id),
      }),
    ]);
  });

  it("runs a workflow preview through the workflow-native tool", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Native Preview Workflow",
      initialRequest: "Preview this workflow.",
      projectPath: workspacePath,
      phase: "ready_for_review",
    });
    store.ensureWorkflowAgentChatThread(thread.id);
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "native-preview");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow }) {
  await workflow.emit({ type: "workflow.status_update", message: "Preview reached output.", graphNodeId: "output" });
  await workflow.checkpoint("preview", { ok: true });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Native Preview Workflow",
      status: "ready_for_preview",
      manifest: { tools: [], mutationPolicy: "read_only", defaultIdleTimeoutMs: 180_000 },
      spec: { goal: "Preview a workflow." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const graph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Preview graph",
      nodes: [{ id: "output", type: "output", label: "Output" }],
      edges: [],
    });
    store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: artifact.id,
      graphSnapshotId: graph.id,
      sourcePath,
      repoPath: artifactRoot,
      status: "ready_for_review",
      createdBy: "compiler",
    });

    const preview = await invokeWorkflowNativeTool(
      {
        store,
        workspacePath,
        permissionMode: "full-access",
        defaultWorkflowThreadId: thread.id,
        runWorkflowArtifact: (input) =>
          runWorkflowArtifact({
            store,
            artifactId: input.artifactId,
            workspacePath,
            permissionMode: "full-access",
            mode: input.mode,
            runtime: input.runtime,
            runLimits: input.runLimits,
          }),
      },
      {
        toolName: "workflow_run_preview",
        arguments: { idleTimeoutMs: 240_000, clearMaxRunMs: true },
      },
    );

    expect(preview.text).toContain("Workflow run preview completed");
    expect(preview.data).toMatchObject({
      previewed: true,
      workflowThreadId: thread.id,
      artifact: { id: artifact.id },
      run: { artifactId: artifact.id, status: "succeeded" },
      runLimits: { idleTimeoutMs: 240_000, maxRunMs: null },
      trace: {
        eventCount: expect.any(Number),
        checkpointCount: 1,
        lastEvent: expect.objectContaining({ type: "workflow.succeeded" }),
      },
    });
    expect(store.listWorkflowRunEvents((preview.data as { run: { id: string } }).run.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "workflow.mode", message: "dry_run" }),
        expect.objectContaining({ type: "workflow.run-limits", data: expect.objectContaining({ idleTimeoutMs: 240_000 }) }),
      ]),
    );
    expect(store.listPermissionAudit()).toEqual([
      expect.objectContaining({
        toolName: "workflow_run_preview",
        decisionSource: "allowed_by_full_access",
        detail: expect.stringContaining(artifact.id),
      }),
    ]);
  });

  it("runs an approved workflow version through the workflow-native tool", async () => {
    const fixture = await createRunnableWorkflowFixture({ status: "approved", versionStatus: "approved" });
    const result = await invokeWorkflowNativeTool(
      {
        store,
        workspacePath,
        permissionMode: "full-access",
        defaultWorkflowThreadId: fixture.threadId,
        runWorkflowArtifact: (input) =>
          runWorkflowArtifact({
            store,
            artifactId: input.artifactId,
            workspacePath,
            permissionMode: "full-access",
            mode: input.mode,
            runtime: input.runtime,
            runLimits: input.runLimits,
          }),
      },
      {
        toolName: "workflow_run_version",
        arguments: { versionId: fixture.versionId, maxRunMs: 300_000 },
      },
    );

    expect(result.text).toContain("Workflow version run completed");
    expect(result.data).toMatchObject({
      ran: true,
      workflowThreadId: fixture.threadId,
      artifact: { id: fixture.artifactId },
      version: { id: fixture.versionId, status: "approved" },
      run: { artifactId: fixture.artifactId, status: "succeeded" },
      allowUnapproved: false,
      runLimits: { idleTimeoutMs: 120_000, maxRunMs: 300_000 },
      trace: {
        checkpointCount: 1,
        lastEvent: expect.objectContaining({ type: "workflow.succeeded" }),
      },
    });
    expect(store.listWorkflowRunEvents((result.data as { run: { id: string } }).run.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "workflow.mode", message: "execute" }),
        expect.objectContaining({ type: "workflow.run-limits", data: expect.objectContaining({ maxRunMs: 300_000 }) }),
      ]),
    );
    expect(store.listPermissionAudit()).toEqual([
      expect.objectContaining({
        toolName: "workflow_run_version",
        decisionSource: "allowed_by_full_access",
        detail: expect.stringContaining(fixture.versionId),
      }),
    ]);
  });

  it("blocks unapproved workflow version runs unless explicitly allowed", async () => {
    const fixture = await createRunnableWorkflowFixture({ status: "ready_for_preview", versionStatus: "ready_for_review" });
    const runtime = {
      store,
      workspacePath,
      permissionMode: "full-access" as const,
      defaultWorkflowThreadId: fixture.threadId,
      runWorkflowArtifact: (input: WorkflowNativeRunArtifactInput) =>
        runWorkflowArtifact({
          store,
          artifactId: input.artifactId,
          workspacePath,
          permissionMode: "full-access",
          mode: input.mode,
          runtime: input.runtime,
          runLimits: input.runLimits,
        }),
    };

    const blocked = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_run_version",
      arguments: { versionId: fixture.versionId },
    });
    expect(blocked.data).toMatchObject({
      ran: false,
      reason: expect.stringContaining("Approve this workflow"),
    });
    expect(store.listWorkflowRuns(fixture.artifactId)).toEqual([]);

    const allowed = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_run_version",
      arguments: { versionId: fixture.versionId, allowUnapproved: true },
    });
    expect(allowed.data).toMatchObject({
      ran: true,
      allowUnapproved: true,
      run: { status: "succeeded" },
    });
  });

  it("rejects invalid workflow revision candidates instead of repairing them", async () => {
    const fixture = await createWorkflowFixture();
    const runtime = {
      store,
      workspacePath,
      permissionMode: "workspace" as const,
    };

    const validation = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_validate_revision",
      arguments: {
        workflowThreadId: fixture.threadId,
        manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
        graph: {
          summary: "bad edge",
          nodes: [{ id: "request", type: "request", label: "Request" }],
          edges: [{ id: "bad-edge", source: "request", target: "missing", type: "data_flow" }],
        },
      },
    });
    expect(validation.text).toContain("Workflow revision validation failed");
    expect(validation.data).toMatchObject({
      valid: false,
      errors: [expect.stringContaining("missing target node")],
    });

    const proposal = await invokeWorkflowNativeTool(runtime, {
      toolName: "workflow_propose_revision",
      arguments: {
        workflowThreadId: fixture.threadId,
        requestedChange: "Use an undeclared tool.",
        source: "export async function run({ tools }) {\n  return tools.missing_tool();\n}\n",
      },
    });
    expect(proposal.text).toContain("Workflow revision proposal was rejected");
    expect(proposal.data).toMatchObject({
      created: false,
      validation: {
        valid: false,
        errors: [expect.stringContaining("undeclared tool: missing_tool")],
      },
    });
    expect(store.listWorkflowRevisions(fixture.threadId)).toEqual([]);
  });

  async function createWorkflowFixture(options: { programIr?: boolean } = {}) {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Native Tool Workflow",
      initialRequest: "Summarize local notes.",
      projectPath: workspacePath,
      phase: "ready_for_review",
    });
    const graph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "request to output",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        { id: "output", type: "output", label: "Output" },
      ],
      edges: [{ id: "edge", source: "request", target: "output", type: "data_flow" }],
    });
    await mkdir(join(workspacePath, ".ambient-codex", "workflows", "native-tool"), { recursive: true });
    const sourcePath = join(workspacePath, ".ambient-codex", "workflows", "native-tool", "main.ts");
    const statePath = join(workspacePath, ".ambient-codex", "workflows", "native-tool", "state.json");
    await writeFile(sourcePath, "export async function run() {\n  return 'ok';\n}\n", "utf8");
    if (options.programIr) {
      await writeFile(
        join(workspacePath, ".ambient-codex", "workflows", "native-tool", "lowered-plan.json"),
        `${JSON.stringify(
          {
            schemaVersion: 1,
            title: "Native Tool Workflow",
            goal: "Summarize local notes.",
            programHash: "program-hash",
            operationPlanHash: "operation-plan-hash",
            operations: [],
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(
        join(workspacePath, ".ambient-codex", "workflows", "native-tool", "compile-context.json"),
        `${JSON.stringify({ schemaVersion: 1, compilerMode: "program_ir", discoveryQuestions: [], explorationTraces: [] }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(
        join(workspacePath, ".ambient-codex", "workflows", "native-tool", "repair-history.json"),
        `${JSON.stringify({ schemaVersion: 1, repairAttemptCount: 0, patchOperationCount: 0, attempts: [] }, null, 2)}\n`,
        "utf8",
      );
    }
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Native Tool Workflow",
      status: "approved",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only", maxModelCalls: 1 },
      spec: { goal: "Summarize local notes.", summary: "Read notes and return a summary." },
      sourcePath,
      statePath,
    });
    const version = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: artifact.id,
      graphSnapshotId: graph.id,
      sourcePath,
      repoPath: workspacePath,
      gitCommitHash: "abc123",
      status: "approved",
      createdBy: "compiler",
    });
    const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
    store.appendWorkflowRunEvent({ runId: run.id, type: "workflow.started", message: "Started", graphNodeId: "request" });
    store.recordWorkflowModelCall({
      runId: run.id,
      task: "summarize",
      status: "succeeded",
      input: { prompt: "Summarize" },
      output: { text: "Done" },
      graphNodeId: "output",
      latencyMs: 12,
    });
    store.appendWorkflowRunEvent({ runId: run.id, type: "workflow.completed", message: "Completed", graphNodeId: "output" });
    store.updateWorkflowRun({ id: run.id, status: "succeeded", finish: true });
    return { threadId: thread.id, graphId: graph.id, artifactId: artifact.id, versionId: version.id, runId: run.id };
  }

  async function createRunnableWorkflowFixture(options: { status: "approved" | "ready_for_preview"; versionStatus: "approved" | "ready_for_review" }) {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Runnable Native Workflow",
      initialRequest: "Run this workflow.",
      projectPath: workspacePath,
      phase: options.status === "approved" ? "approved" : "ready_for_review",
    });
    store.ensureWorkflowAgentChatThread(thread.id);
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", `native-run-${options.status}`);
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    const statePath = join(artifactRoot, "state.json");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow }) {
  await workflow.emit({ type: "workflow.status_update", message: "Run reached output.", graphNodeId: "output" });
  await workflow.checkpoint("run", { ok: true });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Runnable Native Workflow",
      status: options.status,
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Run a workflow." },
      sourcePath,
      statePath,
    });
    const graph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Run graph",
      nodes: [{ id: "output", type: "output", label: "Output" }],
      edges: [],
    });
    const version = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: artifact.id,
      graphSnapshotId: graph.id,
      sourcePath,
      repoPath: artifactRoot,
      status: options.versionStatus,
      createdBy: "compiler",
    });
    return { threadId: thread.id, graphId: graph.id, artifactId: artifact.id, versionId: version.id };
  }
});

async function writeRestorableWorkflowFiles(repoPath: string, label: "v1" | "v2"): Promise<void> {
  await writeFile(join(repoPath, "manifest.json"), `${JSON.stringify({ tools: [], mutationPolicy: "read_only" }, null, 2)}\n`, "utf8");
  await writeFile(join(repoPath, "spec.json"), `${JSON.stringify({ goal: `Fixture ${label}` }, null, 2)}\n`, "utf8");
  await writeFile(join(repoPath, "main.ts"), `export default async function run({ workflow }) { await workflow.emit({ type: "fixture.${label}" }); }\n`, "utf8");
  await writeFile(
    join(repoPath, "graph.json"),
    `${JSON.stringify({ summary: `Graph ${label}`, nodes: [{ id: "request", type: "request", label: `Request ${label}` }], edges: [] }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(repoPath, "preview.md"), `# Preview ${label}\n`, "utf8");
  await writeFile(join(repoPath, "compile-context.json"), `${JSON.stringify({ label }, null, 2)}\n`, "utf8");
}

function fixtureArxivPluginRegistration(): PluginMcpToolRegistration {
  const descriptor = pluginMcpToolDescriptor({
    registeredName: "arxiv_search",
    label: "arXiv paper search",
    description: "Search arXiv paper metadata.",
    promptSnippet: "arxiv_search: Search arXiv paper metadata.",
    promptGuidelines: [],
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
  });
  return {
    registeredName: "arxiv_search",
    originalName: "search",
    label: descriptor.label,
    description: descriptor.description,
    promptSnippet: descriptor.promptSnippet,
    promptGuidelines: descriptor.promptGuidelines,
    parameters: descriptor.inputSchema,
    descriptor,
    launchPlan: {
      pluginId: "arxiv-plugin",
      pluginName: "arXiv",
      pluginVersion: "1.0.0",
      pluginFingerprint: "arxiv-plugin",
      serverName: "arxiv-server",
      cwd: process.cwd(),
      command: "node",
      args: [],
      envKeys: [],
      enabled: true,
      startable: true,
    },
    tool: {
      pluginId: "arxiv-plugin",
      pluginName: "arXiv",
      serverName: "arxiv-server",
      name: "search",
    },
  };
}
