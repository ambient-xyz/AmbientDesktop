import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { WorkflowGraphSnapshot } from "../../shared/workflowTypes";
import { workflowGraphEventCards } from "../../renderer/src/workflowAgentGraphUiModel";
import { AmbientWorkflowRunProvider } from "./workflowAmbientProvider";
import {
  liveAmbientDirectHelperProfile,
  liveAmbientProviderBaseUrl,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "./workflowAmbientFacade";
import { readWorkflowRunDetail, resolveWorkflowApproval } from "./workflowDashboard";
import { ProjectStore } from "./workflowProjectStoreFacade";
import { buildWorkflowRecoveryPlan } from "./workflowRecovery";
import { runWorkflowArtifact } from "./workflowRunService";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const itLiveRecovery = process.env.AMBIENT_WORKFLOW_RECOVERY_LIVE === "1" ? it : it.skip;
const liveRecoveryProfile = liveAmbientDirectHelperProfile();
const LIVE_RECOVERY_DOGFOOD_TIMEOUT_MS = Math.max(
  liveRecoveryProfile.testTimeoutMs,
  Number(process.env.AMBIENT_WORKFLOW_RECOVERY_TIMEOUT_MS ?? "240000"),
);

describeNative("runWorkflowArtifact recovery and approval resumes", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-run-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("resumes from persisted checkpoints when requested", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "resume");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow }) {
  const value = await workflow.resumePoint("expensive", async () => {
    await workflow.emit({ type: "fixture.compute" });
    return { summary: "computed" };
  });
  await workflow.emit({ type: "fixture.value", message: value.summary });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Resume fixture",
      status: "ready_for_preview",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Resume from a persisted checkpoint." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });

    const firstDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
    });
    const firstRun = firstDashboard.runs[0];

    const secondDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: firstRun.id,
    });
    const secondRun = secondDashboard.runs[0];
    const secondEvents = store.listWorkflowRunEvents(secondRun.id);

    expect(firstRun).toMatchObject({ status: "succeeded" });
    expect(secondRun).toMatchObject({ status: "succeeded" });
    expect(secondEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "workflow.resume", message: firstRun.id }),
        expect.objectContaining({ type: "checkpoint.resume", message: "expensive" }),
      ]),
    );
    expect(secondEvents.map((event) => event.type)).not.toContain("fixture.compute");
    await expect(readFile(secondRun.reportPath!, "utf8")).resolves.toContain("checkpoint.resume");
  });

  it("preserves schedule linkage when resuming a paused scheduled run", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "resume-scheduled");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow }) {
  const value = await workflow.resumePoint("scheduledEvidence", async () => ({ summary: "ready" }));
  await workflow.emit({ type: "fixture.scheduled.value", message: value.summary });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Scheduled resume fixture",
      status: "ready_for_preview",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Resume a scheduled workflow run." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const firstDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
    });
    const firstRun = firstDashboard.runs[0];
    store.appendWorkflowRunEvent({
      runId: firstRun.id,
      type: "workflow.schedule.started",
      message: "schedule-1",
      data: {
        scheduleId: "schedule-1",
        targetKind: "workflow_thread",
        targetId: "workflow-thread-1",
        targetLabel: "Workflow thread latest approved",
        targetVersionId: "version-2",
        createdTargetVersionId: "version-1",
        grantDecisionSource: "persistent_grant",
      },
    });

    const resumedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: firstRun.id,
    });
    const resumedRun = resumedDashboard.runs[0];
    const resumedEvents = store.listWorkflowRunEvents(resumedRun.id);

    expect(store.getWorkflowRun(firstRun.id).scheduledBy).toMatchObject({ scheduleId: "schedule-1", targetVersionId: "version-2" });
    expect(resumedRun).toMatchObject({
      status: "succeeded",
      scheduledBy: expect.objectContaining({ scheduleId: "schedule-1", targetVersionId: "version-2" }),
    });
    expect(resumedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "workflow.resume", message: firstRun.id }),
        expect.objectContaining({
          type: "workflow.schedule.started",
          message: "schedule-1",
          data: expect.objectContaining({ resumeSourceRunId: firstRun.id }),
        }),
      ]),
    );
  });

  it("records node-scoped recovery metadata on resumed runs", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "recovery-resume");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow }) {
  await workflow.resumePoint("records", async () => ["record-1", "record-2"]);
  await workflow.step("classify", { nodeId: "classify" }, async () => {
    if (!workflow.recovery) throw new Error("fixture failure");
  });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Recovery fixture",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Retry selected graph node." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });

    const failedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
    });
    const failedRun = failedDashboard.runs[0];
    const failedEvent = store.listWorkflowRunEvents(failedRun.id).find((event) => event.type === "step.error")!;

    const recoveredDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: failedRun.id,
      recovery: {
        action: "retry_step",
        sourceRunId: failedRun.id,
        sourceEventId: failedEvent.id,
        targetGraphNodeId: "classify",
        createdAt: "2026-05-02T00:00:00.000Z",
      },
    });
    const recoveredRun = recoveredDashboard.runs[0];
    const recoveredEvents = store.listWorkflowRunEvents(recoveredRun.id);

    expect(failedRun).toMatchObject({
      status: "failed",
      providerHealth: expect.objectContaining({ status: "product_failed", providerErrorEventCount: 0 }),
    });
    expect(recoveredRun).toMatchObject({
      status: "succeeded",
      recoveryContext: expect.objectContaining({
        action: "retry_step",
        sourceRunId: failedRun.id,
        sourceEventId: failedEvent.id,
        targetGraphNodeId: "classify",
      }),
      retryMetadata: expect.objectContaining({
        recoveryAttemptCount: 1,
        latestRecoveryAction: "retry_step",
        sourceRunId: failedRun.id,
        sourceEventId: failedEvent.id,
      }),
    });
    expect(recoveredEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "workflow.resume", message: failedRun.id }),
        expect.objectContaining({ type: "workflow.recovery.start", graphNodeId: "classify" }),
        expect.objectContaining({ type: "checkpoint.resume", message: "records" }),
        expect.objectContaining({ type: "workflow.recovery.completed", graphNodeId: "classify" }),
      ]),
    );
  });

  it("recovers from the graph card checkpoint resume action", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "graph-card-recovery-resume");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow }) {
  await workflow.resumePoint("records", async () => ["record-1", "record-2"]);
  await workflow.step("classify", { nodeId: "classify" }, async () => {
    if (!workflow.recovery) throw new Error("fixture failure");
  });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Graph card recovery fixture",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Recover from a graph card checkpoint action." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const graph: WorkflowGraphSnapshot = {
      id: "graph-card-recovery",
      workflowThreadId: "thread-1",
      version: 1,
      source: "compile",
      summary: "Recovery graph",
      createdAt: "2026-05-05T00:00:00.000Z",
      nodes: [{ id: "classify", type: "deterministic_step", label: "Classify", retryPolicy: "Retry with retained checkpoints." }],
      edges: [],
    };

    const failedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
    });
    const failedRun = failedDashboard.runs[0];
    const failedEvents = store.listWorkflowRunEvents(failedRun.id);
    const failedEvent = failedEvents.find((event) => event.type === "step.error");
    if (!failedEvent) {
      throw new Error(
        `Expected graph-card recovery fixture to reach step.error; run status ${failedRun.status}; events ${JSON.stringify(
          failedEvents.map((event) => ({ type: event.type, message: event.message, graphNodeId: event.graphNodeId, data: event.data })),
        ).slice(0, 2_000)}`,
      );
    }
    const failedDetail = readWorkflowRunDetail(store, failedRun.id);
    const [failedCard] = workflowGraphEventCards([failedEvent], graph, { checkpoints: failedDetail.checkpoints });

    expect(failedCard).toMatchObject({
      graphNodeId: "classify",
      resume: expect.objectContaining({ eligible: true, action: "resume_checkpoint" }),
      recoveryContext: "Resume can reuse checkpoint records.",
    });

    const plan = buildWorkflowRecoveryPlan(store, {
      runId: failedCard.runId,
      eventId: failedCard.id,
      action: "resume_checkpoint",
      graphNodeId: failedCard.graphNodeId,
    });
    const recoveredDashboard = await runWorkflowArtifact({
      store,
      artifactId: plan.artifactId,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: plan.resumeFromRunId,
      recovery: plan.recovery,
    });
    const recoveredRun = recoveredDashboard.runs[0];
    const recoveredEvents = store.listWorkflowRunEvents(recoveredRun.id);

    expect(failedRun.graphSnapshotId).toBeTruthy();
    expect(recoveredRun).toMatchObject({ status: "succeeded", graphSnapshotId: failedRun.graphSnapshotId });
    expect(recoveredEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "workflow.recovery.start", message: "resume_checkpoint", graphNodeId: "classify" }),
        expect.objectContaining({ type: "checkpoint.resume", message: "records" }),
        expect.objectContaining({ type: "workflow.recovery.completed", message: "resume_checkpoint", graphNodeId: "classify" }),
      ]),
    );
  });

  itLiveRecovery(
    "recovers a checkpointed live Ambient workflow from the graph card action",
    async () => {
      const artifactRoot = join(store.getWorkspace().statePath, "workflows", "live-graph-card-recovery");
      await mkdir(artifactRoot, { recursive: true });
      const sourcePath = join(artifactRoot, "main.ts");
      await writeFile(
        sourcePath,
        `
const schema = {
  parse(value) {
    if (typeof value === "string") return { summary: value };
    if (value && typeof value === "object") {
      const record = value;
      return { summary: typeof record.summary === "string" ? record.summary : JSON.stringify(record).slice(0, 240) };
    }
    return { summary: String(value) };
  },
};

export default async function run({ workflow, ambient }) {
  const evidence = await workflow.resumePoint("ambientEvidence", async () => {
    return ambient.call({
      task: "dogfood.recovery_checkpoint_seed",
      input: {
        instruction: "Return JSON with a short summary explaining why checkpoint resume should skip repeated model work.",
        outputContract: { summary: "string" },
      },
      schema,
      nodeId: "model",
      cacheKey: ["dogfood", "recovery", "checkpoint-seed"],
    });
  });
  await workflow.step("classify", { nodeId: "classify" }, async () => {
    if (!workflow.recovery) throw new Error("intentional live recovery dogfood failure");
    await workflow.emit({ type: "dogfood.recovered", message: evidence.summary });
  });
}
`,
        "utf8",
      );
      const artifact = store.createWorkflowArtifact({
        title: "Live graph recovery dogfood",
        status: "approved",
        manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only", maxModelCalls: 1 },
        spec: { goal: "Use a live Ambient call, checkpoint it, fail once, then recover from the graph checkpoint action." },
        sourcePath,
        statePath: join(artifactRoot, "state.json"),
      });
      const graph = store.createWorkflowGraphSnapshot({
        workflowThreadId: artifact.workflowThreadId!,
        source: "compile",
        summary: "Live Ambient checkpoint recovery graph",
        nodes: [
          {
            id: "model",
            type: "model_call",
            label: "Seed evidence",
            retryPolicy: "Resume from checkpoint before repeating the Ambient call.",
          },
          { id: "classify", type: "deterministic_step", label: "Classify", retryPolicy: "Retry with retained checkpoints." },
          { id: "output", type: "output", label: "Recovered output" },
        ],
        edges: [
          { id: "model-to-classify", source: "model", target: "classify", type: "data_flow" },
          { id: "classify-to-output", source: "classify", target: "output", type: "control_flow" },
        ],
      });
      const provider = new AmbientWorkflowRunProvider({
        apiKey: liveAmbientApiKeyForWorkflowRun(),
        model: liveAmbientModelForWorkflowRun(),
        baseUrl: liveAmbientProviderBaseUrl(),
        timeoutMs: LIVE_RECOVERY_DOGFOOD_TIMEOUT_MS,
        idleTimeoutMs: liveRecoveryProfile.streamIdleTimeoutMs,
        absoluteTimeoutMs: LIVE_RECOVERY_DOGFOOD_TIMEOUT_MS,
        retryPolicy: liveRecoveryProfile.retryPolicy,
        workflowThreadId: artifact.workflowThreadId,
      });

      const failedDashboard = await runWorkflowArtifact({
        store,
        artifactId: artifact.id,
        workspacePath,
        permissionMode: "full-access",
        ambientProvider: provider,
        model: liveAmbientModelForWorkflowRun(),
        baseUrl: liveAmbientProviderBaseUrl(),
      });
      const failedRun = failedDashboard.runs[0];
      const failedEvents = store.listWorkflowRunEvents(failedRun.id);
      const failedEvent = failedEvents.find((event) => event.type === "step.error");
      if (!failedEvent) {
        throw new Error(
          `Expected live recovery fixture to reach step.error; run status ${failedRun.status}; events ${JSON.stringify(
            failedEvents.map((event) => ({ type: event.type, message: event.message, graphNodeId: event.graphNodeId, data: event.data })),
          ).slice(0, 2_000)}`,
        );
      }
      const failedDetail = readWorkflowRunDetail(store, failedRun.id);
      const [failedCard] = workflowGraphEventCards([failedEvent], graph, { checkpoints: failedDetail.checkpoints });

      expect(failedRun).toMatchObject({
        status: "failed",
        providerHealth: expect.objectContaining({ status: "product_failed", providerErrorEventCount: 0 }),
      });
      expect(store.listWorkflowModelCalls({ runId: failedRun.id })).toEqual([
        expect.objectContaining({ task: "dogfood.recovery_checkpoint_seed", status: "succeeded", graphNodeId: "model" }),
      ]);
      expect(failedCard).toMatchObject({
        graphNodeId: "classify",
        resume: expect.objectContaining({ eligible: true, action: "resume_checkpoint" }),
        recoveryContext: "Resume can reuse checkpoint ambientEvidence.",
      });

      const plan = buildWorkflowRecoveryPlan(store, {
        runId: failedCard.runId,
        eventId: failedCard.id,
        action: "resume_checkpoint",
        graphNodeId: failedCard.graphNodeId,
      });
      const recoveredDashboard = await runWorkflowArtifact({
        store,
        artifactId: plan.artifactId,
        workspacePath,
        permissionMode: "full-access",
        ambientProvider: provider,
        model: liveAmbientModelForWorkflowRun(),
        baseUrl: liveAmbientProviderBaseUrl(),
        resumeFromRunId: plan.resumeFromRunId,
        recovery: plan.recovery,
      });
      const recoveredRun = recoveredDashboard.runs[0];
      const recoveredEvents = store.listWorkflowRunEvents(recoveredRun.id);

      expect(recoveredRun).toMatchObject({
        status: "succeeded",
        graphSnapshotId: failedRun.graphSnapshotId,
        retryMetadata: expect.objectContaining({
          recoveryAttemptCount: 1,
          latestRecoveryAction: "resume_checkpoint",
          sourceRunId: failedRun.id,
        }),
      });
      expect(store.listWorkflowModelCalls({ runId: recoveredRun.id })).toHaveLength(0);
      expect(recoveredEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "workflow.recovery.start", message: "resume_checkpoint", graphNodeId: "classify" }),
          expect.objectContaining({ type: "checkpoint.resume", message: "ambientEvidence" }),
          expect.objectContaining({ type: "workflow.recovery.completed", message: "resume_checkpoint", graphNodeId: "classify" }),
        ]),
      );
    },
    LIVE_RECOVERY_DOGFOOD_TIMEOUT_MS,
  );

  it("blocks checkpoint resume after source changes", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "resume-source-change");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow }) {
  await workflow.resumePoint("expensive", async () => "v1");
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Resume source guard",
      status: "ready_for_preview",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Refuse incompatible checkpoint resume." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const firstDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
    });
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow }) {
  await workflow.resumePoint("expensive", async () => "v2");
}
`,
      "utf8",
    );

    await expect(
      runWorkflowArtifact({
        store,
        artifactId: artifact.id,
        workspacePath,
        permissionMode: "full-access",
        resumeFromRunId: firstDashboard.runs[0].id,
      }),
    ).rejects.toThrow(/workflow source or manifest changed/i);
  });

  it("pauses at review gates and resumes after approval", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "approval");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow }) {
  const approval = await workflow.requireApproval({ kind: "fixture-review", file: "src/app.ts" });
  await workflow.checkpoint("approvalStatus", approval.status);
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Approval fixture",
      status: "ready_for_preview",
      manifest: { tools: [], mutationPolicy: "staged_until_approved" },
      spec: { goal: "Pause until the staged change is approved." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });

    const pausedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
    });
    const pausedRun = pausedDashboard.runs[0];
    const approval = resolveWorkflowApproval(store, {
      runId: pausedRun.id,
      approvalId: requiredApprovalId(store, pausedRun.id),
      decision: "approved",
    }).approvals[0];

    const resumedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: pausedRun.id,
    });
    const resumedRun = resumedDashboard.runs[0];
    const resumedEvents = store.listWorkflowRunEvents(resumedRun.id);

    expect(pausedRun).toMatchObject({ status: "paused" });
    expect(approval).toMatchObject({ status: "approved" });
    expect(resumedRun).toMatchObject({ status: "succeeded" });
    expect(resumedEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining(["workflow.resume", "approval.required", "approval.approved", "checkpoint.write", "workflow.succeeded"]),
    );
    await expect(readFile(artifact.statePath, "utf8").then(JSON.parse)).resolves.toMatchObject({
      checkpoints: {
        approvalStatus: { value: "approved", runId: resumedRun.id },
      },
    });
  });

  it("carries runtime input answers through a later approval resume", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "input-then-approval");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow }) {
  const review = await workflow.resumePoint("tone-review", async () => ({
    prompt: "Which report tone should be used?",
    choices: [{ id: "technical", label: "Technical" }],
    data: { preview: "report draft" }
  }));
  const answer = await workflow.askUser(
    review.prompt,
    { choices: review.choices, allowFreeform: true, data: review.data },
    { nodeId: "tone" }
  );
  await workflow.stageMutation(
    { kind: "write-report", tone: answer.choiceId },
    async () => {
      await workflow.checkpoint("finalTone", answer.choiceId);
      return "ok";
    },
    { nodeId: "write" }
  );
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Input then approval fixture",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "staged_until_approved" },
      spec: { goal: "Ask for input, then stage a change." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });

    const inputDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
    });
    const inputRun = inputDashboard.runs[0];
    const inputEvent = store.listWorkflowRunEvents(inputRun.id).find((event) => event.type === "workflow.input.required");

    expect(inputRun).toMatchObject({ status: "needs_input" });

    const approvalDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: inputRun.id,
      userInputs: [{ requestId: String(inputEvent?.data?.id), choiceId: "technical", text: "Technical" }],
    });
    const approvalRun = approvalDashboard.runs[0];

    expect(approvalRun).toMatchObject({ status: "paused" });
    resolveWorkflowApproval(store, {
      runId: approvalRun.id,
      approvalId: requiredApprovalId(store, approvalRun.id),
      decision: "approved",
    });

    const finalDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: approvalRun.id,
    });
    const finalRun = finalDashboard.runs[0];
    const finalEvents = store.listWorkflowRunEvents(finalRun.id);

    expect(finalRun).toMatchObject({ status: "succeeded" });
    expect(finalEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining(["workflow.resume", "workflow.input.received", "approval.approved", "mutation.applied", "workflow.succeeded"]),
    );
    await expect(readFile(artifact.statePath, "utf8").then(JSON.parse)).resolves.toMatchObject({
      checkpoints: {
        finalTone: { value: "technical", runId: finalRun.id },
      },
    });
  });

  it("does not apply staged mutations until approval is resumed", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "staged-mutation");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow, tools }) {
  const result = await workflow.stageMutation({ kind: "shell-write", command: "printf staged-ok" }, async () => {
    return tools.bash({ command: "printf staged-ok" });
  });
  await workflow.checkpoint("mutationOutput", result.output);
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Staged mutation fixture",
      status: "ready_for_preview",
      manifest: { tools: ["bash"], mutationPolicy: "staged_until_approved" },
      spec: { goal: "Stage a shell action before applying it." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const shellRunner = vi.fn(async (input) => {
      input.onData(Buffer.from("staged-ok"));
      return { exitCode: 0 };
    });

    const pausedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      shellRunner,
    });
    const pausedRun = pausedDashboard.runs[0];

    expect(pausedRun).toMatchObject({ status: "paused" });
    expect(shellRunner).not.toHaveBeenCalled();
    expect(store.listWorkflowRunEvents(pausedRun.id).map((event) => event.type)).toEqual(
      expect.arrayContaining(["mutation.staged", "approval.required", "workflow.paused"]),
    );

    resolveWorkflowApproval(store, {
      runId: pausedRun.id,
      approvalId: requiredApprovalId(store, pausedRun.id),
      decision: "approved",
    });
    const resumedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: pausedRun.id,
      shellRunner,
    });
    const resumedRun = resumedDashboard.runs[0];

    expect(resumedRun).toMatchObject({ status: "succeeded" });
    expect(shellRunner).toHaveBeenCalledWith(expect.objectContaining({ command: "printf staged-ok" }));
    expect(store.listWorkflowRunEvents(resumedRun.id).map((event) => event.type)).toEqual(
      expect.arrayContaining(["approval.approved", "desktop-tool.start", "mutation.applied", "checkpoint.write"]),
    );
    await expect(readFile(artifact.statePath, "utf8").then(JSON.parse)).resolves.toMatchObject({
      checkpoints: {
        mutationOutput: { value: "staged-ok", runId: resumedRun.id },
      },
    });
  });
});

function requiredApprovalId(store: ProjectStore, runId: string): string {
  const id = store
    .listWorkflowRunEvents(runId)
    .find((event) => event.type === "approval.required" || event.type === "connector.review.required")?.data?.id;
  if (typeof id !== "string") throw new Error(`Missing approval event for run ${runId}`);
  return id;
}

function liveAmbientApiKeyForWorkflowRun(): string {
  return readLiveAmbientProviderApiKey({ purpose: "live Workflow recovery dogfood" });
}

function liveAmbientModelForWorkflowRun(): string {
  return liveAmbientProviderModel({
    preferredModelEnvNames: ["AMBIENT_WORKFLOW_RECOVERY_MODEL", "AMBIENT_WORKFLOW_MODEL", "AMBIENT_LIVE_MODEL"],
    fallbackModel: AMBIENT_DEFAULT_MODEL,
  });
}
