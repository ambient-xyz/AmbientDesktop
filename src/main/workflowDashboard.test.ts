import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";
import {
  compactWorkflowRunDetailEvents,
  createWorkflowSampleArtifact,
  readWorkflowDashboard,
  readWorkflowRunDetail,
  revalidateWorkflowArtifact,
  resolveWorkflowApproval,
  reviewWorkflowArtifact,
  updateWorkflowArtifactSource,
  updateWorkflowConnectorGrant,
} from "./workflowDashboard";
import { workspaceInventoryConnectorDescriptor } from "./workflowConnectors";
import type { WorkflowRunEvent } from "../shared/types";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describe("workflow run detail event compaction", () => {
  it("keeps audit evidence while compacting noisy large fan-out events", () => {
    const events: WorkflowRunEvent[] = [
      event(1, "workflow.start"),
      event(2, "approval.required"),
      ...Array.from({ length: 300 }, (_, index) => [
        event(10 + index * 4, "connector.start", `google.gmail.readThread`, { itemKey: `thread-${index}` }),
        event(11 + index * 4, "connector.end", `google.gmail.readThread`, { itemKey: `thread-${index}` }),
        event(12 + index * 4, "batch.item", "Read threads", { itemKey: `thread-${index}` }),
        event(13 + index * 4, "collection.map.item", "Compact thread", { itemKey: `thread-${index}` }),
      ]).flat(),
      event(1300, "checkpoint.write", "gmailCoverage"),
      event(1301, "workflow.output.ready", `${"category ".repeat(3000)}read-only`, {}, { html: `${"category ".repeat(1300)}read-only` }),
      event(1302, "workflow.succeeded"),
    ];

    const compacted = compactWorkflowRunDetailEvents(events, 420);

    expect(compacted).toHaveLength(306);
    expect(compacted.filter((item) => item.type === "connector.end")).toHaveLength(300);
    expect(compacted.map((item) => item.type)).toEqual(
      expect.arrayContaining(["workflow.events.compacted", "approval.required", "checkpoint.write", "workflow.output.ready", "workflow.succeeded"]),
    );
    expect(compacted.some((item) => item.type === "connector.start")).toBe(false);
    expect(compacted.some((item) => item.type === "batch.item")).toBe(false);
    expect(compacted.find((item) => item.type === "workflow.events.compacted")?.data).toMatchObject({
      omittedEvents: 900,
      totalEvents: 1205,
      omittedEventTypes: {
        "batch.item": 300,
        "collection.map.item": 300,
        "connector.start": 300,
      },
    });
    expect(JSON.stringify(compacted.find((item) => item.type === "workflow.output.ready")?.data).length).toBeLessThan(5_000);
    expect(String(compacted.find((item) => item.type === "workflow.output.ready")?.data?.html)).toContain("[truncated");
    expect(String(compacted.find((item) => item.type === "workflow.output.ready")?.data?.html)).toContain("read-only");
    expect(compacted.find((item) => item.type === "workflow.output.ready")?.message?.length).toBeLessThan(2_000);
    expect(compacted.find((item) => item.type === "workflow.output.ready")?.message).toContain("[truncated");
    expect(compacted.find((item) => item.type === "workflow.output.ready")?.message).toContain("read-only");
  });
});

function event(
  seq: number,
  type: string,
  message?: string,
  metadata: Partial<Pick<WorkflowRunEvent, "graphNodeId" | "graphEdgeId" | "itemKey">> = {},
  data?: Record<string, unknown>,
): WorkflowRunEvent {
  return {
    id: `event-${seq}`,
    runId: "run-1",
    artifactId: "artifact-1",
    seq,
    type,
    createdAt: `2026-05-18T00:00:${String(seq % 60).padStart(2, "0")}.000Z`,
    ...(message ? { message } : {}),
    ...metadata,
    ...(data ? { data } : {}),
  };
}

describeNative("workflow dashboard", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-dashboard-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("lists workflow artifacts and renders run audit detail", async () => {
    const dashboard = createWorkflowSampleArtifact(store, store.getWorkspace().path);

    expect(dashboard.artifacts).toHaveLength(1);
    expect(dashboard.runs).toHaveLength(1);
    expect(dashboard.artifacts[0]).toMatchObject({
      title: "Workflow Agent tool bridge preview",
      status: "ready_for_preview",
      manifest: {
        connectors: [
          expect.objectContaining({
            connectorId: "workspace.inventory",
            accountId: "workspace",
            scopes: ["workspace.files.read"],
            operations: ["listFiles"],
            dataRetention: "redacted_audit",
          }),
        ],
      },
    });
    expect(dashboard.artifacts[0].workflowThreadId).toEqual(expect.any(String));
    const graphSnapshots = store.listWorkflowGraphSnapshots(dashboard.artifacts[0].workflowThreadId!);
    expect(graphSnapshots[0]).toMatchObject({
      source: "compile",
      nodes: expect.arrayContaining([expect.objectContaining({ id: "request", type: "request" })]),
    });
    await expect(readFile(join(dirname(dashboard.artifacts[0].sourcePath), "graph.json"), "utf8")).resolves.toContain('"source": "compile"');
    await expect(readFile(dashboard.runs[0].reportPath!, "utf8")).resolves.toContain("Workflow Agent Preview Audit");

    await writeFile(
      dashboard.artifacts[0].statePath,
      `${JSON.stringify(
        {
          version: 1,
          checkpoints: {
            sample: {
              value: { ok: true },
              updatedAt: "2026-04-30T00:00:00.000Z",
              runId: dashboard.runs[0].id,
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const detail = readWorkflowRunDetail(store, dashboard.runs[0].id);

    expect(detail.run.status).toBe("succeeded");
    expect(detail.events.map((event) => event.type)).toEqual(["workflow.compile", "workflow.manifest", "workflow.audit"]);
    expect(detail.modelCalls[0]).toMatchObject({ task: "compiler.plan", status: "succeeded" });
    expect(detail.checkpoints).toEqual([
      expect.objectContaining({ key: "sample", runId: dashboard.runs[0].id, valuePreview: '{"ok":true}' }),
    ]);
    expect(detail.approvals).toEqual([]);
    expect(detail.auditReport).toContain("# Workflow Agent tool bridge preview Audit Report");
    expect(detail.auditReport).toContain("workspace.inventory");
    expect(detail.auditReport).toContain("workspace.files.read");
    expect(detail.auditReport).toContain("ambient-preview");
    expect(detail.auditReport).toContain("## Checkpoints");
  });

  it("derives review queue items from workflow approval events", () => {
    const dashboard = createWorkflowSampleArtifact(store, store.getWorkspace().path);
    const runId = dashboard.runs[0].id;
    store.appendWorkflowRunEvent({
      runId,
      type: "approval.required",
      data: { id: "approval-1", changeSet: { kind: "sample-review" } },
    });

    const detail = readWorkflowRunDetail(store, runId);

    expect(detail.approvals).toEqual([
      expect.objectContaining({
        id: "approval-1",
        status: "pending",
        changeSetPreview: '{"kind":"sample-review"}',
      }),
    ]);
    expect(detail.auditReport).toContain("## Review Queue");
    expect(detail.auditReport).toContain("approval-1 - pending");

    const approved = resolveWorkflowApproval(store, { runId, approvalId: "approval-1", decision: "approved" });
    expect(approved.approvals).toEqual([expect.objectContaining({ id: "approval-1", status: "approved" })]);
    expect(approved.auditReport).toContain("approval-1 - approved");
  });

  it("renders resumed run detail with prior resume-chain evidence", () => {
    const artifact = store.createWorkflowArtifact({
      title: "Resume chain evidence",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "staged_until_approved" },
      spec: { goal: "Ask for feedback after a model call, then stage an approved mutation." },
      sourcePath: join(workspacePath, ".ambient-codex/workflows/resume-chain/main.ts"),
      statePath: join(workspacePath, ".ambient-codex/workflows/resume-chain/state.json"),
    });
    const firstRun = store.startWorkflowRun({ artifactId: artifact.id, status: "needs_input" });
    store.appendWorkflowRunEvent({
      runId: firstRun.id,
      type: "ambient.call.end",
      message: "classify-notes",
      graphNodeId: "classify",
      data: { outputChars: 120 },
    });
    store.recordWorkflowModelCall({
      runId: firstRun.id,
      task: "classify-notes",
      status: "succeeded",
      input: { files: 3 },
      output: { categories: ["Admin", "Family", "Learning"] },
      model: "ambient-test",
      graphNodeId: "classify",
      startedAt: "2026-05-13T19:00:00.000Z",
      completedAt: "2026-05-13T19:00:01.000Z",
    });
    const resumedRun = store.startWorkflowRun({ artifactId: artifact.id, status: "succeeded" });
    store.appendWorkflowRunEvent({
      runId: resumedRun.id,
      type: "workflow.resume",
      message: firstRun.id,
      data: { sourceRunId: firstRun.id },
    });
    store.appendWorkflowRunEvent({
      runId: resumedRun.id,
      type: "approval.approved",
      message: "approval-1",
      graphNodeId: "write-report",
      data: { id: "approval-1" },
    });

    const detail = readWorkflowRunDetail(store, resumedRun.id);

    expect(detail.events.map((event) => event.type)).toEqual(["ambient.call.end", "workflow.resume", "approval.approved"]);
    expect(detail.modelCalls).toEqual([expect.objectContaining({ runId: firstRun.id, task: "classify-notes", graphNodeId: "classify" })]);
    expect(detail.auditReport).toContain("classify-notes");
    expect(detail.auditReport).toContain("approval.approved");
  });

  it("records workflow artifact preview decisions", () => {
    const dashboard = createWorkflowSampleArtifact(store, store.getWorkspace().path);
    const artifactId = dashboard.artifacts[0].id;
    const artifact = dashboard.artifacts[0];
    const runId = dashboard.runs[0].id;
    const version = store.createWorkflowVersion({
      workflowThreadId: artifact.workflowThreadId!,
      artifactId,
      sourcePath: artifact.sourcePath,
      repoPath: store.getWorkspace().path,
      status: "ready_for_review",
      createdBy: "compiler",
    });

    const approved = reviewWorkflowArtifact(store, { artifactId, decision: "approved" });
    expect(approved.artifacts[0]).toMatchObject({ id: artifactId, status: "approved" });
    expect(store.listWorkflowVersions(artifact.workflowThreadId!)[0]).toMatchObject({ id: version.id, status: "approved" });
    expect(readWorkflowRunDetail(store, runId).events.at(-1)).toMatchObject({
      type: "workflow.artifact_review",
      message: "approved",
      data: { artifactId, decision: "approved" },
    });

    const rejected = reviewWorkflowArtifact(store, { artifactId, decision: "rejected" });
    expect(rejected.artifacts[0]).toMatchObject({ id: artifactId, status: "rejected" });
    expect(store.listWorkflowVersions(artifact.workflowThreadId!)[0]).toMatchObject({ id: version.id, status: "rejected" });
    expect(readWorkflowRunDetail(store, runId).events.at(-1)).toMatchObject({
      type: "workflow.artifact_review",
      message: "rejected",
      data: { artifactId, decision: "rejected" },
    });
  });

  it("downgrades connector retention and invalidates artifact approval", () => {
    const dashboard = createWorkflowSampleArtifact(store, store.getWorkspace().path);
    const artifactId = dashboard.artifacts[0].id;
    const runId = dashboard.runs[0].id;
    reviewWorkflowArtifact(store, { artifactId, decision: "approved" });

    const updated = updateWorkflowConnectorGrant(store, {
      artifactId,
      connectorId: "workspace.inventory",
      accountId: "workspace",
      dataRetention: "none",
    });

    expect(updated.artifacts[0]).toMatchObject({
      id: artifactId,
      status: "ready_for_preview",
      manifest: {
        connectors: [expect.objectContaining({ connectorId: "workspace.inventory", dataRetention: "none" })],
      },
    });
    expect(readWorkflowRunDetail(store, runId).events.at(-1)).toMatchObject({
      type: "workflow.connector_grant_updated",
      message: "workspace.inventory retention redacted_audit -> none",
      data: {
        artifactId,
        connectorId: "workspace.inventory",
        accountId: "workspace",
        previousDataRetention: "redacted_audit",
        dataRetention: "none",
        status: "ready_for_preview",
      },
    });
  });

  it("rejects connector retention upgrades", () => {
    const dashboard = createWorkflowSampleArtifact(store, store.getWorkspace().path);
    const artifactId = dashboard.artifacts[0].id;
    updateWorkflowConnectorGrant(store, {
      artifactId,
      connectorId: "workspace.inventory",
      accountId: "workspace",
      dataRetention: "none",
    });

    expect(() =>
      updateWorkflowConnectorGrant(store, {
        artifactId,
        connectorId: "workspace.inventory",
        accountId: "workspace",
        dataRetention: "run_artifact",
      }),
    ).toThrow("Connector retention can only be downgraded");
  });

  it("selects connector accounts and requires preview approval again", () => {
    const dashboard = createWorkflowSampleArtifact(store, store.getWorkspace().path);
    const artifactId = dashboard.artifacts[0].id;
    const runId = dashboard.runs[0].id;
    reviewWorkflowArtifact(store, { artifactId, decision: "approved" });

    const updated = updateWorkflowConnectorGrant(store, {
      artifactId,
      connectorId: "workspace.inventory",
      accountId: "workspace",
      nextAccountId: "workspace-alt",
    });

    expect(updated.artifacts[0]).toMatchObject({
      id: artifactId,
      status: "ready_for_preview",
      manifest: {
        connectors: [expect.objectContaining({ connectorId: "workspace.inventory", accountId: "workspace-alt" })],
      },
    });
    expect(readWorkflowRunDetail(store, runId).events.at(-1)).toMatchObject({
      type: "workflow.connector_grant_account_selected",
      message: "workspace.inventory account workspace -> workspace-alt",
      data: {
        artifactId,
        connectorId: "workspace.inventory",
        previousAccountId: "workspace",
        accountId: "workspace-alt",
        scopes: ["workspace.files.read"],
        operations: ["listFiles"],
        dataRetention: "redacted_audit",
        status: "ready_for_preview",
      },
    });
  });

  it("rejects connector grants and marks the preview rejected", () => {
    const dashboard = createWorkflowSampleArtifact(store, store.getWorkspace().path);
    const artifactId = dashboard.artifacts[0].id;
    const runId = dashboard.runs[0].id;
    reviewWorkflowArtifact(store, { artifactId, decision: "approved" });

    const updated = updateWorkflowConnectorGrant(store, {
      artifactId,
      connectorId: "workspace.inventory",
      accountId: "workspace",
      decision: "rejected",
    });

    expect(updated.artifacts[0]).toMatchObject({
      id: artifactId,
      status: "rejected",
      manifest: {
        connectors: [expect.objectContaining({ connectorId: "workspace.inventory", dataRetention: "redacted_audit" })],
      },
    });
    expect(readWorkflowRunDetail(store, runId).events.at(-1)).toMatchObject({
      type: "workflow.connector_grant_rejected",
      message: "workspace.inventory rejected",
      data: {
        artifactId,
        connectorId: "workspace.inventory",
        accountId: "workspace",
        scopes: ["workspace.files.read"],
        operations: ["listFiles"],
        dataRetention: "redacted_audit",
        status: "rejected",
      },
    });
  });

  it("removes connector scopes and requires recompile before running", () => {
    const dashboard = createWorkflowSampleArtifact(store, store.getWorkspace().path);
    const artifactId = dashboard.artifacts[0].id;
    const runId = dashboard.runs[0].id;

    const updated = updateWorkflowConnectorGrant(store, {
      artifactId,
      connectorId: "workspace.inventory",
      accountId: "workspace",
      removeScope: "workspace.files.read",
    });

    expect(updated.artifacts[0]).toMatchObject({
      id: artifactId,
      status: "rejected",
      manifest: {
        connectors: [expect.objectContaining({ connectorId: "workspace.inventory", scopes: [] })],
      },
    });
    expect(readWorkflowRunDetail(store, runId).events.at(-1)).toMatchObject({
      type: "workflow.connector_grant_scope_removed",
      message: "workspace.inventory scope removed: workspace.files.read",
      data: {
        artifactId,
        connectorId: "workspace.inventory",
        accountId: "workspace",
        removedScope: "workspace.files.read",
        previousScopes: ["workspace.files.read"],
        scopes: [],
        operations: ["listFiles"],
        dataRetention: "redacted_audit",
        status: "rejected",
        reason: "Recompile required before this connector can run.",
      },
    });

    expect(() =>
      updateWorkflowConnectorGrant(store, {
        artifactId,
        connectorId: "workspace.inventory",
        accountId: "workspace",
        removeScope: "workspace.files.read",
      }),
    ).toThrow("does not include scope");
  });

  it("revalidates approved artifacts and requires preview approval again", () => {
    const dashboard = createWorkflowSampleArtifact(store, store.getWorkspace().path);
    const artifactId = dashboard.artifacts[0].id;
    const runId = dashboard.runs[0].id;
    reviewWorkflowArtifact(store, { artifactId, decision: "approved" });

    const updated = revalidateWorkflowArtifact(store, { artifactId }, { connectorDescriptors: [workspaceInventoryConnectorDescriptor()] });

    expect(updated.artifacts[0]).toMatchObject({ id: artifactId, status: "ready_for_preview" });
    expect(readWorkflowRunDetail(store, runId).events.at(-1)).toMatchObject({
      type: "workflow.artifact_revalidated",
      message: "ready_for_preview",
      data: {
        artifactId,
        status: "ready_for_preview",
        requiresApproval: true,
      },
    });
  });

  it("rejects artifacts when revalidation fails", async () => {
    const dashboard = createWorkflowSampleArtifact(store, store.getWorkspace().path);
    const artifactId = dashboard.artifacts[0].id;
    const runId = dashboard.runs[0].id;
    const artifact = store.getWorkflowArtifact(artifactId);
    await writeFile(artifact.sourcePath, "export default async function run() { return process.env.HOME; }", "utf8");

    const updated = revalidateWorkflowArtifact(store, { artifactId }, { connectorDescriptors: [workspaceInventoryConnectorDescriptor()] });

    expect(updated.artifacts[0]).toMatchObject({ id: artifactId, status: "rejected" });
    expect(readWorkflowRunDetail(store, runId).events.at(-1)).toMatchObject({
      type: "workflow.artifact_revalidation_failed",
      message: "Compiler output source contains raw process access.",
      data: {
        artifactId,
        status: "rejected",
      },
    });
  });

  it("updates workflow artifact source and recovers after invalid source edits", async () => {
    const dashboard = createWorkflowSampleArtifact(store, store.getWorkspace().path);
    const artifactId = dashboard.artifacts[0].id;
    const runId = dashboard.runs[0].id;
    const artifact = store.getWorkflowArtifact(artifactId);
    const originalSource = await readFile(artifact.sourcePath, "utf8");

    const rejected = updateWorkflowArtifactSource(
      store,
      { artifactId, source: "export default async function run() { return process.env.HOME; }" },
      { connectorDescriptors: [workspaceInventoryConnectorDescriptor()] },
    );

    expect(rejected.artifacts[0]).toMatchObject({ id: artifactId, status: "rejected" });
    await expect(readFile(artifact.sourcePath, "utf8")).resolves.toContain("process.env.HOME");
    expect(readWorkflowRunDetail(store, runId).events.at(-1)).toMatchObject({
      type: "workflow.artifact_revalidation_failed",
      message: "Compiler output source contains raw process access.",
      data: {
        artifactId,
        status: "rejected",
      },
    });

    const recovered = updateWorkflowArtifactSource(
      store,
      { artifactId, source: `${originalSource}\n// recovered source edit` },
      { connectorDescriptors: [workspaceInventoryConnectorDescriptor()] },
    );

    expect(recovered.artifacts[0]).toMatchObject({ id: artifactId, status: "ready_for_preview" });
    expect(readWorkflowRunDetail(store, runId)).toMatchObject({
      sourceContent: expect.stringContaining("// recovered source edit"),
      events: expect.arrayContaining([
        expect.objectContaining({
          type: "workflow.artifact_revalidated",
          message: "ready_for_preview",
          data: expect.objectContaining({ artifactId, status: "ready_for_preview" }),
        }),
      ]),
    });
  });

  it("treats WorkflowProgramIR artifacts as immutable generated programs", async () => {
    const dashboard = createWorkflowSampleArtifact(store, store.getWorkspace().path);
    const artifactId = dashboard.artifacts[0].id;
    const runId = dashboard.runs[0].id;
    const artifact = store.getWorkflowArtifact(artifactId);
    await mkdir(dirname(artifact.sourcePath), { recursive: true });
    await writeFile(
      join(dirname(artifact.sourcePath), "lowered-plan.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          title: "IR sample",
          goal: "Validate immutable generated program handling.",
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
      join(dirname(artifact.sourcePath), "compile-context.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          compilerMode: "program_ir",
          recipeSelection: {
            schemaVersion: 1,
            selected: [{ id: "current_web_research" }],
            rejected: [{ id: "staged_document_export" }],
            policyImplications: [{ id: "current-web-source-quality" }],
            summary: {
              selectedRecipeIds: ["current_web_research"],
              rejectedRecipeIds: ["staged_document_export"],
            },
          },
          selectedRecipes: [{ id: "current_web_research" }],
          discoveryQuestions: [],
          explorationTraces: [],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(
      join(dirname(artifact.sourcePath), "prompt-assembly.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          modules: [
            {
              id: "core-workflow-program-ir-semantics",
              layer: "core",
              scope: "stable_prefix",
              reason: "Core WorkflowProgramIR semantics.",
              chars: 120,
              estimatedTokens: 30,
              ruleIds: ["workflow-program-ir"],
            },
            {
              id: "recipe-current_web_research",
              layer: "recipe",
              scope: "mutable_suffix",
              reason: "Request needs current public web research.",
              chars: 160,
              estimatedTokens: 40,
              selectedRecipeIds: ["current_web_research"],
              selectedToolNames: ["browser_search"],
            },
          ],
          stablePrefix: { moduleCount: 1, chars: 120, estimatedTokens: 30 },
          mutableSuffix: { moduleCount: 1, chars: 160, estimatedTokens: 40 },
          total: { moduleCount: 2, chars: 280, estimatedTokens: 70 },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(
      join(dirname(artifact.sourcePath), "validation-report.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          compilerMode: "program_ir",
          status: "passed",
          validators: [
            { id: "workflow.program.static", status: "passed", diagnosticCodes: [], nodeIds: [] },
            { id: "workflow.program.dry_run", status: "passed", diagnosticCodes: [], nodeIds: [] },
          ],
          diagnostics: [],
          diagnosticSummary: { diagnosticCount: 0, errorCount: 0, warningCount: 0, codes: {} },
          evidence: {
            mutationPolicy: "read_only",
            connectorOperations: [],
            connectorWriteOperations: [],
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(
      join(dirname(artifact.sourcePath), "repair-history.json"),
      `${JSON.stringify({ schemaVersion: 1, repairAttemptCount: 0, patchOperationCount: 0, attempts: [] }, null, 2)}\n`,
      "utf8",
    );
    const originalSource = await readFile(artifact.sourcePath, "utf8");

    const detail = readWorkflowRunDetail(store, runId);
    expect(detail.sourceProvenance).toMatchObject({
      kind: "program_ir_generated",
      editable: false,
      validationMode: "program_ir_artifact",
      compilerMode: "program_ir",
      promptAssemblyPath: join(dirname(artifact.sourcePath), "prompt-assembly.json"),
    });
    expect(detail.compileAudit).toMatchObject({
      compilerMode: "program_ir",
      promptModuleCount: 2,
      stablePrefixModuleCount: 1,
      mutableSuffixModuleCount: 1,
      selectedRecipeIds: ["current_web_research"],
      rejectedRecipeIds: ["staged_document_export"],
      policyImplicationIds: ["current-web-source-quality"],
      validatorIds: ["workflow.program.static", "workflow.program.dry_run"],
      failedValidatorIds: [],
      validationStatus: "passed",
      diagnosticCount: 0,
      mutationPolicy: "read_only",
      connectorOperationCount: 0,
      connectorWriteOperationCount: 0,
    });
    expect(detail.compileAudit?.promptModules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "core-workflow-program-ir-semantics", ruleIds: ["workflow-program-ir"] }),
        expect.objectContaining({ id: "recipe-current_web_research", selectedRecipeIds: ["current_web_research"], selectedToolNames: ["browser_search"] }),
      ]),
    );
    expect(readWorkflowDashboard(store).artifacts[0].compileAudit).toMatchObject({
      promptModuleCount: 2,
      selectedRecipeIds: ["current_web_research"],
      validationStatus: "passed",
    });

    expect(() =>
      updateWorkflowArtifactSource(
        store,
        { artifactId, source: "export default async function run() { return 'manual edit'; }\n" },
        { connectorDescriptors: [workspaceInventoryConnectorDescriptor()] },
      ),
    ).toThrow("Generated from WorkflowProgramIR");
    await expect(readFile(artifact.sourcePath, "utf8")).resolves.toBe(originalSource);

    reviewWorkflowArtifact(store, { artifactId, decision: "approved" });
    const updated = revalidateWorkflowArtifact(store, { artifactId }, { connectorDescriptors: [workspaceInventoryConnectorDescriptor()] });

    expect(updated.artifacts[0]).toMatchObject({ id: artifactId, status: "ready_for_preview" });
    expect(readWorkflowRunDetail(store, runId).events.at(-1)).toMatchObject({
      type: "workflow.artifact_revalidated",
      message: "program_ir_ready_for_preview",
      data: expect.objectContaining({
        artifactId,
        status: "ready_for_preview",
        validationMode: "program_ir_artifact",
        sourceEditable: false,
        repairHistoryPath: join(dirname(artifact.sourcePath), "repair-history.json"),
      }),
    });
  });

  it("rejects WorkflowProgramIR artifact revalidation when compile context or repair history is missing or corrupt", async () => {
    const dashboard = createWorkflowSampleArtifact(store, store.getWorkspace().path);
    const artifactId = dashboard.artifacts[0].id;
    const runId = dashboard.runs[0].id;
    const artifact = store.getWorkflowArtifact(artifactId);
    const artifactRoot = dirname(artifact.sourcePath);
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(
      join(artifactRoot, "lowered-plan.json"),
      `${JSON.stringify({ schemaVersion: 1, operationPlanHash: "operation-plan-hash", operations: [] }, null, 2)}\n`,
      "utf8",
    );

    expect(revalidateWorkflowArtifact(store, { artifactId }, { connectorDescriptors: [workspaceInventoryConnectorDescriptor()] }).artifacts[0]).toMatchObject({
      id: artifactId,
      status: "rejected",
    });
    expect(readWorkflowRunDetail(store, runId).events.at(-1)).toMatchObject({
      type: "workflow.artifact_revalidation_failed",
      message: "WorkflowProgramIR artifact is missing compile-context.json.",
    });
    await writeFile(join(artifactRoot, "compile-context.json"), `${JSON.stringify({ schemaVersion: 1, compilerMode: "program_ir" }, null, 2)}\n`, "utf8");
    expect(revalidateWorkflowArtifact(store, { artifactId }, { connectorDescriptors: [workspaceInventoryConnectorDescriptor()] }).artifacts[0]).toMatchObject({
      id: artifactId,
      status: "rejected",
    });
    expect(readWorkflowRunDetail(store, runId).events.at(-1)).toMatchObject({
      type: "workflow.artifact_revalidation_failed",
      message: "compile-context.json is missing discoveryQuestions.",
    });
    await writeFile(
      join(artifactRoot, "compile-context.json"),
      `${JSON.stringify({ schemaVersion: 1, compilerMode: "program_ir", discoveryQuestions: [], explorationTraces: [] }, null, 2)}\n`,
      "utf8",
    );
    expect(revalidateWorkflowArtifact(store, { artifactId }, { connectorDescriptors: [workspaceInventoryConnectorDescriptor()] }).artifacts[0]).toMatchObject({
      id: artifactId,
      status: "rejected",
    });
    expect(readWorkflowRunDetail(store, runId).events.at(-1)).toMatchObject({
      type: "workflow.artifact_revalidation_failed",
      message: "WorkflowProgramIR artifact is missing repair-history.json.",
    });
    await writeFile(
      join(artifactRoot, "repair-history.json"),
      `${JSON.stringify({ schemaVersion: 1, repairAttemptCount: 1, patchOperationCount: 0, attempts: [] }, null, 2)}\n`,
      "utf8",
    );
    expect(revalidateWorkflowArtifact(store, { artifactId }, { connectorDescriptors: [workspaceInventoryConnectorDescriptor()] }).artifacts[0]).toMatchObject({
      id: artifactId,
      status: "rejected",
    });
    expect(readWorkflowRunDetail(store, runId).events.at(-1)).toMatchObject({
      type: "workflow.artifact_revalidation_failed",
      message: "repair-history.json repairAttemptCount does not match attempts.",
    });
  });

  it("returns empty dashboard state before a workflow is compiled", () => {
    expect(readWorkflowDashboard(store)).toEqual({ artifacts: [], runs: [] });
  });
});
