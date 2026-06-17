import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { AmbientPluginRegistry, MiniCpmVisionAnalysisResult, MiniCpmVisionAnalyzeInput, WorkflowGraphSnapshot } from "../../shared/types";
import { workflowGraphEventCards } from "../../renderer/src/workflowAgentGraphUiModel";
import { ProjectStore } from "../projectStore/projectStore";
import { pluginMcpToolDescriptor } from "../desktopToolRegistry";
import type { PluginMcpToolRegistration } from "../plugins/pluginHost";
import { readWorkflowRunDetail, resolveWorkflowApproval } from "./workflowDashboard";
import { buildWorkflowRecoveryPlan } from "./workflowRecovery";
import { AmbientWorkflowRunProvider } from "./workflowAmbientProvider";
import type { WorkflowAmbientProvider } from "./workflowAmbientClient";
import { fixtureWorkflowConnector, validateWorkflowConnectorDescriptor, type WorkflowConnectorDescriptor } from "./workflowConnectors";
import type { ToolRunnerRunShellOptions } from "../tool-runtime/toolRunner";
import { runWorkflowArtifact } from "./workflowRunService";
import { permissionGrantTargetHash } from "../permissions/permissionGrants";
import {
  liveAmbientDirectHelperProfile,
  liveAmbientProviderBaseUrl,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "../liveAmbientProviderConfig";

function fixturePluginRegistration(): PluginMcpToolRegistration {
  const descriptor = pluginMcpToolDescriptor({
    registeredName: "fixture_tool",
    label: "Fixture tool",
    description: "Fixture plugin tool.",
    promptSnippet: "fixture_tool: Fixture plugin tool.",
    promptGuidelines: [],
    parameters: { type: "object", properties: { ok: { type: "boolean" } }, additionalProperties: false },
  });
  return {
    registeredName: "fixture_tool",
    originalName: "fixture_original",
    label: descriptor.label,
    description: descriptor.description,
    promptSnippet: descriptor.promptSnippet,
    promptGuidelines: descriptor.promptGuidelines,
    parameters: descriptor.inputSchema,
    descriptor,
    launchPlan: {
      pluginId: "plugin-1",
      pluginName: "Fixture",
      pluginVersion: "1.0.0",
      pluginFingerprint: "fixture-fingerprint",
      serverName: "server",
      cwd: process.cwd(),
      command: "node",
      args: [],
      envKeys: [],
      enabled: true,
      startable: true,
    },
    tool: {
      pluginId: "plugin-1",
      pluginName: "Fixture",
      serverName: "server",
      name: "fixture_original",
    },
  };
}

function fixtureAutomationPluginRegistry(availability: "available" | "untrusted" | "auth-required" | "disabled" = "available"): AmbientPluginRegistry {
  return {
    plugins: [
      {
        id: "codex:plugin-1",
        sourcePluginId: "plugin-1",
        sourceKind: "codex-workspace",
        sourceLabel: "Fixture",
        name: "Fixture",
        installState: "installed",
        compatibilityTier: "supported",
        enabled: availability !== "disabled",
        trusted: availability === "available",
        capabilityCount: 1,
        supportLabels: [],
        diagnostics: [],
      },
    ],
    capabilities: [
      {
        id: "plugin-1:mcp-tool:server:fixture_original",
        pluginId: "plugin-1",
        pluginName: "Fixture",
        kind: "mcp-tool",
        name: "server",
        sourceKind: "codex-workspace",
        runtimeSupport: ["workflow", "automation"],
        enabled: availability !== "disabled",
        trusted: availability === "available",
        availability,
        serverName: "server",
        supportLabels: [],
        diagnostics: [],
      },
    ],
    sources: [],
    errors: [],
    sourceNotes: [],
  };
}

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const itLiveRecovery = process.env.AMBIENT_WORKFLOW_RECOVERY_LIVE === "1" ? it : it.skip;
const liveRecoveryProfile = liveAmbientDirectHelperProfile();
const LIVE_RECOVERY_DOGFOOD_TIMEOUT_MS = Math.max(
  liveRecoveryProfile.testTimeoutMs,
  Number(process.env.AMBIENT_WORKFLOW_RECOVERY_TIMEOUT_MS ?? "240000"),
);

describeNative("runWorkflowArtifact", () => {
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

  it("runs a persisted workflow artifact and writes an audit report", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "fixture");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow, tools }) {
  await workflow.step("shell", async () => {
    const result = await tools.bash({ command: "printf workflow-ok" });
    await workflow.checkpoint("result", result.output);
  });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Runnable fixture",
      status: "ready_for_preview",
      manifest: { tools: ["bash"], mutationPolicy: "read_only" },
      spec: { goal: "Run a fixture shell command." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const shellRunner = vi.fn(async (input) => {
      input.onData(Buffer.from("workflow-ok"));
      return { exitCode: 0 };
    });

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      shellRunner,
    });

    expect(dashboard.runs[0]).toMatchObject({ artifactId: artifact.id, status: "succeeded" });
    const events = store.listWorkflowRunEvents(dashboard.runs[0].id);
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["workflow.version", "workflow.start", "step.start", "desktop-tool.start", "workflow.succeeded"]),
    );
    expect(events.find((event) => event.type === "workflow.version")).toMatchObject({
      data: expect.objectContaining({ sourceHash: expect.any(String), manifestHash: expect.any(String) }),
    });
    await expect(readFile(artifact.statePath, "utf8").then(JSON.parse)).resolves.toMatchObject({
      checkpoints: {
        result: { value: "workflow-ok", runId: dashboard.runs[0].id },
      },
    });
    const report = await readFile(dashboard.runs[0].reportPath!, "utf8");
    expect(report).toContain("# Runnable fixture Audit Report");
    expect(report).toContain("- Source sha256:");
    expect(report).toContain("## Checkpoints");
    expect(report).toContain("result");
    expect(shellRunner).toHaveBeenCalledWith(expect.objectContaining({ command: "printf workflow-ok" }));
  });

  it("runs first-party MiniCPM visual tools through the workflow tool bridge", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "vision-fixture");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow, tools }) {
  const result = await tools.ambient_visual_analyze({
    image: { path: "screenshots/main.png", source: "workspace_file", label: "main" },
    task: "image_description",
    outputJsonPath: "vision/main.json"
  });
  await workflow.checkpoint("vision", { summary: result.summary, observations: result.observations });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Vision fixture",
      status: "approved",
      manifest: { tools: ["ambient_visual_analyze"], mutationPolicy: "read_only", maxToolCalls: 1 },
      spec: { goal: "Analyze one image with the first-party MiniCPM visual tool." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const analyzeMiniCpm = vi.fn(async (_workspacePath: string, input: MiniCpmVisionAnalyzeInput): Promise<MiniCpmVisionAnalysisResult> => ({
      provider: "minicpm-v",
      status: "passed",
      packageName: "ambient-minicpm-v-vision",
      task: input.task ?? "image_description",
      prompt: "fixture prompt",
      model: "fixture-minicpm",
      durationMs: 1,
      summary: `analyzed ${input.image?.path ?? input.imagePath}`,
      observations: [{ kind: "uncertainty", description: "fixture observation", confidence: "low", evidence: "fixture image" }],
      limitations: [],
      image: { path: input.image?.path ?? input.imagePath ?? "screenshots/main.png", basename: "main.png", bytes: 10, sha256: "a".repeat(64), source: "workspace_file" },
      artifacts: { jsonPath: input.outputJsonPath ?? "vision/main.json" },
      installStatuses: [],
      commands: [],
      validation: { valid: true, errors: [] },
      redaction: { returnedImagePathIsWorkspaceRelative: true, stdoutDoesNotContainAbsoluteImagePath: true, artifactPathIsWorkspaceRelative: true },
    }));

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      vision: { analyzeMiniCpm },
    });
    const run = dashboard.runs[0];
    const events = store.listWorkflowRunEvents(run.id);
    const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as { checkpoints?: Record<string, { value?: { summary?: string } }> };

    expect(run).toMatchObject({ artifactId: artifact.id, status: "succeeded" });
    expect(analyzeMiniCpm).toHaveBeenCalledWith(
      workspacePath,
      expect.objectContaining({
        image: { path: "screenshots/main.png", source: "workspace_file", label: "main" },
        task: "image_description",
        outputJsonPath: "vision/main.json",
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(events.map((event) => `${event.type}:${event.message}`)).toEqual(expect.arrayContaining(["desktop-tool.end:ambient_visual_analyze"]));
    expect(state.checkpoints?.vision?.value?.summary).toBe("analyzed screenshots/main.png");
  });

  it("cancels an active workflow tool call through the run abort signal", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "cancel-tool");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow, tools }) {
  await tools.bash({ command: "sleep forever" });
  await workflow.emit({ type: "after-cancel" });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Cancelable fixture",
      status: "ready_for_preview",
      manifest: { tools: ["bash"], mutationPolicy: "read_only" },
      spec: { goal: "Cancel a running workflow tool call." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    let shellStarted!: () => void;
    const shellStartedPromise = new Promise<void>((resolve) => {
      shellStarted = resolve;
    });
    const shellRunner = vi.fn(
      (input: ToolRunnerRunShellOptions) =>
        new Promise<{ exitCode: number | null }>((_resolve, reject) => {
          shellStarted();
          const rejectCanceled = () => reject(new Error("shell canceled by abort signal"));
          if (input.signal?.aborted) rejectCanceled();
          else input.signal?.addEventListener("abort", rejectCanceled, { once: true });
        }),
    );
    const abortController = new AbortController();

    const runPromise = runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      shellRunner,
      abortSignal: abortController.signal,
    });
    await shellStartedPromise;
    abortController.abort();
    const dashboard = await runPromise;

    expect(shellRunner).toHaveBeenCalledWith(expect.objectContaining({ command: "sleep forever", signal: abortController.signal }));
    expect(dashboard.runs[0]).toMatchObject({ artifactId: artifact.id, status: "canceled" });
    const events = store.listWorkflowRunEvents(dashboard.runs[0].id);
    expect(events.map((event) => event.type)).toContain("workflow.canceled");
    expect(events.map((event) => event.type)).not.toContain("after-cancel");
  });

  it("pauses for workflow.askUser and resumes with the supplied answer", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "runtime-input");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow }) {
  const answer = await workflow.askUser(
    "Choose an output format.",
    { choices: [{ id: "markdown", label: "Markdown" }], allowFreeform: true },
    { nodeId: "format-choice" }
  );
  await workflow.checkpoint("format", answer);
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Runtime input fixture",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Ask for a runtime input." },
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
    const inputEvent = store.listWorkflowRunEvents(pausedRun.id).find((event) => event.type === "workflow.input.required");

    expect(pausedRun).toMatchObject({ status: "needs_input" });
    expect(inputEvent).toMatchObject({
      message: "Choose an output format.",
      graphNodeId: "format-choice",
      data: expect.objectContaining({ id: expect.any(String), allowFreeform: true }),
    });

    const resumedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: pausedRun.id,
      userInputs: [{ requestId: String(inputEvent?.data?.id), choiceId: "markdown", text: "Markdown" }],
    });

    expect(resumedDashboard.runs[0]).toMatchObject({ artifactId: artifact.id, status: "succeeded" });
    expect(store.listWorkflowRunEvents(resumedDashboard.runs[0].id).map((event) => event.type)).toEqual(
      expect.arrayContaining(["workflow.input.required", "workflow.input.received", "checkpoint.write", "workflow.succeeded"]),
    );
    await expect(readFile(artifact.statePath, "utf8").then(JSON.parse)).resolves.toMatchObject({
      checkpoints: {
        format: { value: { requestId: String(inputEvent?.data?.id), choiceId: "markdown", text: "Markdown" } },
      },
    });
  });

  it("runs plugin MCP registrations through the workflow bridge", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "plugin-tool");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow, tools }) {
  const result = await tools.fixture_tool({ ok: true });
  await workflow.emit({ type: "fixture.plugin", message: result.content[0].text });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Plugin fixture",
      status: "ready_for_preview",
      manifest: {
        tools: ["fixture_tool"],
        pluginCapabilities: [
          {
            capabilityId: "plugin-1:mcp-tool:server:fixture_original",
            pluginId: "plugin-1",
            pluginName: "Fixture",
            serverName: "server",
            toolName: "fixture_original",
            registeredName: "fixture_tool",
          },
        ],
        mutationPolicy: "read_only",
      },
      spec: { goal: "Run a plugin MCP tool." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const registration = fixturePluginRegistration();
    const ensurePluginTrusted = vi.fn(async () => true);
    const pluginCaller = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "plugin-ok" }],
      details: {
        pluginId: "plugin-1",
        pluginName: "Fixture",
        serverName: "server",
        toolName: "fixture_original",
      },
    }));

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      pluginRegistrations: [registration],
      ensurePluginTrusted,
      pluginCaller,
    });

    expect(dashboard.runs[0]).toMatchObject({ artifactId: artifact.id, status: "succeeded" });
    expect(ensurePluginTrusted).toHaveBeenCalledWith(registration);
    expect(pluginCaller).toHaveBeenCalledWith(
      registration.launchPlan,
      { toolName: "fixture_original", arguments: { ok: true } },
      { permissionMode: "full-access", workspacePath, signal: expect.any(AbortSignal) },
    );
    expect(store.listWorkflowRunEvents(dashboard.runs[0].id).map((event) => event.type)).toEqual(
      expect.arrayContaining(["desktop-tool.start", "plugin-mcp.start", "fixture.plugin", "plugin-mcp.end", "desktop-tool.end"]),
    );
  });

  it("fails plugin MCP workflows before invocation when trust is denied", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "plugin-trust-denied");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ tools }) {
  await tools.fixture_tool({ ok: true });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Plugin trust denied fixture",
      status: "ready_for_preview",
      manifest: {
        tools: ["fixture_tool"],
        pluginCapabilities: [
          {
            capabilityId: "plugin-1:mcp-tool:server:fixture_original",
            pluginId: "plugin-1",
            pluginName: "Fixture",
            serverName: "server",
            toolName: "fixture_original",
            registeredName: "fixture_tool",
          },
        ],
        mutationPolicy: "read_only",
      },
      spec: { goal: "Block a plugin MCP tool when trust is denied." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const registration = fixturePluginRegistration();
    const ensurePluginTrusted = vi.fn(async () => false);
    const pluginCaller = vi.fn();

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      pluginRegistrations: [registration],
      ensurePluginTrusted,
      pluginCaller,
    });

    expect(dashboard.runs[0]).toMatchObject({
      artifactId: artifact.id,
      status: "failed",
      error: "Workflow plugin tool blocked by trust policy: fixture_tool",
    });
    expect(ensurePluginTrusted).toHaveBeenCalledWith(registration);
    expect(pluginCaller).not.toHaveBeenCalled();
    const eventTypes = store.listWorkflowRunEvents(dashboard.runs[0].id).map((event) => event.type);
    expect(eventTypes).toEqual(expect.arrayContaining(["desktop-tool.start", "desktop-tool.error"]));
    expect(eventTypes).not.toContain("plugin-mcp.start");
  });

  it("fails early when a workflow requires an unavailable plugin capability", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "missing-plugin-tool");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ tools }) {
  await tools.fixture_tool({});
}
`,
    );
    const artifact = store.createWorkflowArtifact({
      title: "Missing plugin fixture",
      status: "ready_for_preview",
      manifest: {
        tools: ["fixture_tool"],
        pluginCapabilities: [
          {
            capabilityId: "plugin-1:mcp-tool:server:fixture_original",
            pluginId: "plugin-1",
            pluginName: "Fixture",
            serverName: "server",
            toolName: "fixture_original",
            registeredName: "fixture_tool",
          },
        ],
        mutationPolicy: "read_only",
      },
      spec: { goal: "Run a plugin MCP tool." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      pluginRegistrations: [],
    });

    expect(dashboard.runs[0]).toMatchObject({ artifactId: artifact.id, status: "failed" });
    expect(dashboard.runs[0].error).toContain("Workflow requires unavailable plugin capability: fixture_tool");
  });

  it("fails automation runs before invocation when required plugin capabilities are blocked", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "automation-blocked-plugin");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ tools }) {
  await tools.fixture_tool({ ok: true });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Automation blocked plugin fixture",
      status: "ready_for_preview",
      manifest: {
        tools: ["fixture_tool"],
        pluginCapabilities: [
          {
            capabilityId: "plugin-1:mcp-tool:server:fixture_original",
            pluginId: "plugin-1",
            pluginName: "Fixture",
            serverName: "server",
            toolName: "fixture_original",
            registeredName: "fixture_tool",
          },
        ],
        mutationPolicy: "read_only",
      },
      spec: { goal: "Block an automation before an untrusted plugin can run." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const registration = fixturePluginRegistration();
    const ensurePluginTrusted = vi.fn(async () => true);
    const pluginCaller = vi.fn();

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      runtime: "automation",
      pluginRegistrations: [registration],
      pluginRegistry: fixtureAutomationPluginRegistry("untrusted"),
      ensurePluginTrusted,
      pluginCaller,
    });

    expect(dashboard.runs[0]).toMatchObject({ artifactId: artifact.id, status: "failed" });
    expect(dashboard.runs[0].error).toContain(
      "Automation requires blocked plugin capability: fixture_tool (Trust this plugin before automation dispatch.)",
    );
    expect(ensurePluginTrusted).not.toHaveBeenCalled();
    expect(pluginCaller).not.toHaveBeenCalled();
    const events = store.listWorkflowRunEvents(dashboard.runs[0].id);
    expect(events.map((event) => event.type)).not.toContain("desktop-tool.start");
    expect(events.find((event) => event.type === "workflow.plugin-requirements")).toMatchObject({
      message: "Blocked automation plugin requirements.",
      data: {
        count: 1,
        runtime: "automation",
        blockers: [
          expect.objectContaining({
            registeredName: "fixture_tool",
            availability: "untrusted",
            reason: "Trust this plugin before automation dispatch.",
          }),
        ],
      },
    });
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

  itLiveRecovery("recovers a checkpointed live Ambient workflow from the graph card action", async () => {
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
        { id: "model", type: "model_call", label: "Seed evidence", retryPolicy: "Resume from checkpoint before repeating the Ambient call." },
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
  }, LIVE_RECOVERY_DOGFOOD_TIMEOUT_MS);

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

  it("dry-runs persisted workflow artifacts without executing unsafe shell tools", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "dry-run");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow, tools }) {
  await workflow.step("shell", async () => {
    const result = await tools.bash({ command: "pnpm test" });
    await workflow.emit({ type: "fixture.shell_output", message: result.output });
  });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Dry run fixture",
      status: "ready_for_preview",
      manifest: { tools: ["bash"], mutationPolicy: "read_only" },
      spec: { goal: "Dry-run a shell command." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const shellRunner = vi.fn(async () => ({ exitCode: 0 }));

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      mode: "dry_run",
      shellRunner,
    });

    expect(dashboard.runs[0]).toMatchObject({ status: "succeeded" });
    expect(shellRunner).not.toHaveBeenCalled();
    expect(store.listWorkflowRunEvents(dashboard.runs[0].id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "workflow.mode", message: "dry_run" }),
        expect.objectContaining({ type: "desktop-tool.dry_run", message: "bash" }),
      ]),
    );
    await expect(readFile(dashboard.runs[0].reportPath!, "utf8")).resolves.toContain("desktop-tool.dry_run");
  });

  it("runs hand-authored browser QA workflows through the Desktop tool bridge", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "browser-qa");
    await mkdir(artifactRoot, { recursive: true });
    const pagePath = join(workspacePath, "fixture.html");
    await writeFile(pagePath, "<h1>Fixture QA Page</h1>", "utf8");
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow, tools }) {
  const page = await tools.browser_nav({ url: ${JSON.stringify(`file://${pagePath}`)} });
  const content = await tools.browser_content({});
  const screenshot = await tools.browser_screenshot({});
  await workflow.checkpoint("browserEvidence", { page, content, screenshot });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Browser QA fixture",
      status: "ready_for_preview",
      manifest: {
        tools: ["browser_nav", "browser_content", "browser_screenshot"],
        mutationPolicy: "read_only",
      },
      spec: { goal: "Inspect a local HTML fixture." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const browser = {
      search: vi.fn(),
      navigate: vi.fn(async (input: { url: string }) => ({ url: input.url, title: "Fixture QA Page" })),
      content: vi.fn(async () => ({ text: "Fixture QA Page", links: [] })),
      evaluate: vi.fn(),
      screenshot: vi.fn(async () => ({ path: join(workspacePath, "fixture.png") })),
      pick: vi.fn(),
    };

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      browser,
    });

    expect(dashboard.runs[0]).toMatchObject({ artifactId: artifact.id, status: "succeeded" });
    expect(browser.navigate).toHaveBeenCalledWith(expect.objectContaining({ url: `file://${pagePath}` }));
    expect(browser.content).toHaveBeenCalledWith(expect.objectContaining({ profileMode: "isolated" }));
    expect(browser.screenshot).toHaveBeenCalledWith(expect.objectContaining({ profileMode: "isolated" }));
    expect(store.listWorkflowRunEvents(dashboard.runs[0].id).map((event) => event.type)).toEqual(
      expect.arrayContaining(["desktop-tool.start", "desktop-tool.end", "checkpoint.write"]),
    );
    await expect(readFile(dashboard.runs[0].reportPath!, "utf8")).resolves.toContain("browser_screenshot");
  });

  it("runs hand-authored read-only connector workflows through the connector bridge", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "connector");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow, connectors }) {
  const page = await workflow.step("read connector records", async () => {
    return connectors.call({ connectorId: "fixture.readonly", operation: "listRecords", input: { limit: 2 } });
  });
  await workflow.checkpoint("connectorPage", page.records.map((record) => record.id));
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Connector fixture",
      status: "ready_for_preview",
      manifest: {
        tools: [],
        mutationPolicy: "read_only",
        connectors: [
          {
            connectorId: "fixture.readonly",
            accountId: "fixture",
            scopes: ["fixture.records.read"],
            operations: ["listRecords"],
            dataRetention: "redacted_audit",
          },
        ],
        maxConnectorCalls: 1,
      },
      spec: { goal: "Read harmless fixture connector records." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      connectorRegistrations: [fixtureWorkflowConnector([{ id: "alpha" }, { id: "beta" }, { id: "gamma" }])],
    });

    expect(dashboard.runs[0]).toMatchObject({ artifactId: artifact.id, status: "succeeded" });
    expect(store.listWorkflowRunEvents(dashboard.runs[0].id).map((event) => event.type)).toEqual(
      expect.arrayContaining(["connector.start", "connector.end", "checkpoint.write"]),
    );
    await expect(readFile(artifact.statePath, "utf8").then(JSON.parse)).resolves.toMatchObject({
      checkpoints: {
        connectorPage: { value: ["alpha", "beta"], runId: dashboard.runs[0].id },
      },
    });
    const report = await readFile(dashboard.runs[0].reportPath!, "utf8");
    expect(report).toContain("fixture.readonly");
    expect(report).toContain("connector.end");
  });

  it("keeps personal connector values out of persisted audit reports by retention policy", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "connector-redaction");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow, connectors }) {
  const page = await connectors.call({ connectorId: "personal.mail", operation: "listMessages", input: { query: "from:ada@example.com" } });
  await workflow.checkpoint("messageCount", page.messages.length);
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Connector redaction fixture",
      status: "ready_for_preview",
      manifest: {
        tools: [],
        mutationPolicy: "read_only",
        connectors: [
          {
            connectorId: "personal.mail",
            accountId: "primary",
            scopes: ["mail.messages.read"],
            operations: ["listMessages"],
            dataRetention: "redacted_audit",
          },
        ],
        maxConnectorCalls: 1,
      },
      spec: { goal: "Read personal connector summaries without storing raw connector values in audit events." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });

    const pausedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      connectorRegistrations: [personalConnector()],
    });
    const pausedRun = pausedDashboard.runs[0];

    expect(pausedRun).toMatchObject({ artifactId: artifact.id, status: "paused" });
    expect(store.listWorkflowRunEvents(pausedRun.id).map((event) => event.type)).toEqual(
      expect.arrayContaining(["connector.review.required", "workflow.paused"]),
    );

    resolveWorkflowApproval(store, {
      runId: pausedRun.id,
      approvalId: requiredApprovalId(store, pausedRun.id),
      decision: "approved",
    });
    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: pausedRun.id,
      connectorRegistrations: [personalConnector()],
    });

    expect(dashboard.runs[0]).toMatchObject({ artifactId: artifact.id, status: "succeeded" });
    await expect(readFile(artifact.statePath, "utf8").then(JSON.parse)).resolves.toMatchObject({
      checkpoints: {
        messageCount: { value: 1, runId: dashboard.runs[0].id },
      },
    });
    const events = JSON.stringify(store.listWorkflowRunEvents(dashboard.runs[0].id));
    const report = await readFile(dashboard.runs[0].reportPath!, "utf8");
    expect(events).toContain("connector.review.approved");
    expect(events).toContain("[redacted]");
    expect(report).toContain("[redacted]");
    expect(`${events}\n${report}`).not.toContain("ada@example.com");
    expect(`${events}\n${report}`).not.toContain("Launch plan");
  });

  it("uses scheduled connector grants to satisfy personal-data connector review", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "scheduled-connector-grant");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow, connectors }) {
  const page = await connectors.call({ connectorId: "personal.mail", operation: "listMessages", input: { query: "from:ada@example.com" } });
  await workflow.checkpoint("messageCount", page.messages.length);
}
`,
      "utf8",
    );
    const workflowThreadId = "workflow-thread-scheduled";
    const artifact = store.createWorkflowArtifact({
      title: "Scheduled connector grant fixture",
      status: "ready_for_preview",
      workflowThreadId,
      manifest: {
        tools: [],
        mutationPolicy: "read_only",
        connectors: [
          {
            connectorId: "personal.mail",
            accountId: "primary",
            scopes: ["mail.messages.read"],
            operations: ["listMessages"],
            dataRetention: "redacted_audit",
          },
        ],
        maxConnectorCalls: 1,
      },
      spec: { goal: "Read personal connector summaries from a scheduled grant." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const grant = store.createPermissionGrant({
      permissionModeAtCreation: "workspace",
      scopeKind: "workflow_thread",
      workflowThreadId,
      actionKind: "connector_content_read",
      targetKind: "connector",
      targetHash: permissionGrantTargetHash("connector_content_read", "connector", "personal.mail:listMessages"),
      targetLabel: "personal.mail:listMessages",
      source: "workflow_review",
      reason: "Allow scheduled personal mail reads.",
    });

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "workspace",
      connectorRegistrations: [personalConnector()],
      scheduledConnectorGrantContext: {
        workflowThreadId,
        workspacePath,
        projectPath: workspacePath,
        permissionGrants: [grant],
      },
    });

    expect(dashboard.runs[0]).toMatchObject({ artifactId: artifact.id, status: "succeeded" });
    const eventTypes = store.listWorkflowRunEvents(dashboard.runs[0].id).map((event) => event.type);
    expect(eventTypes).toContain("connector.review.approved");
    expect(eventTypes).not.toContain("connector.review.required");
    expect(eventTypes).not.toContain("workflow.paused");
  });

  it("records a blocked connector readiness preflight when a configured connector account is unavailable", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "connector-preflight");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ connectors }) {
  await connectors.call({ connectorId: "fixture.readonly", operation: "listRecords", input: { limit: 1 } });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Connector preflight fixture",
      status: "approved",
      manifest: {
        tools: [],
        mutationPolicy: "read_only",
        connectors: [
          {
            connectorId: "fixture.readonly",
            accountId: "fixture",
            scopes: ["fixture.records.read"],
            operations: ["listRecords"],
            dataRetention: "redacted_audit",
          },
        ],
        maxConnectorCalls: 1,
      },
      spec: { goal: "Show connector readiness before running connector-heavy workflows." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const registration = fixtureWorkflowConnector([{ id: "alpha" }]);
    const unavailableRegistration = {
      ...registration,
      descriptor: validateWorkflowConnectorDescriptor({
        ...registration.descriptor,
        auth: { ...registration.descriptor.auth, status: "not_configured" },
        accounts: [],
      }),
    };

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      connectorRegistrations: [unavailableRegistration],
    });
    const run = dashboard.runs[0];
    const events = store.listWorkflowRunEvents(run.id);
    const preflight = events.find((event) => event.type === "workflow.connector-preflight");

    expect(run).toMatchObject({
      artifactId: artifact.id,
      status: "failed",
      error: "Workflow connector is not available: fixture.readonly (not_configured)",
    });
    expect(preflight).toMatchObject({
      message: "Blocked workflow connector readiness.",
      data: expect.objectContaining({
        status: "blocked",
        error: "Workflow connector is not available: fixture.readonly (not_configured)",
        connectors: [
          expect.objectContaining({
            connectorId: "fixture.readonly",
            accountId: "fixture",
            authStatus: "not_configured",
            availableAccounts: [],
          }),
        ],
      }),
    });
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["workflow.connector-preflight", "workflow.failed"]));
  });

  it("pauses runs when workflow source catches a pending connector review", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "connector-swallowed-review");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow, connectors }) {
  try {
    await connectors.call({ connectorId: "personal.mail", operation: "listMessages", input: { query: "from:ada@example.com" } });
  } catch (_error) {
    await workflow.checkpoint("caughtReview", true);
  }
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Connector swallowed review fixture",
      status: "ready_for_preview",
      manifest: {
        tools: [],
        mutationPolicy: "read_only",
        connectors: [
          {
            connectorId: "personal.mail",
            accountId: "primary",
            scopes: ["mail.messages.read"],
            operations: ["listMessages"],
            dataRetention: "redacted_audit",
          },
        ],
        maxConnectorCalls: 1,
      },
      spec: { goal: "Do not allow source-level catch blocks to bypass connector review." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      connectorRegistrations: [personalConnector()],
    });
    const run = dashboard.runs[0];
    const eventTypes = store.listWorkflowRunEvents(run.id).map((event) => event.type);

    expect(run).toMatchObject({ artifactId: artifact.id, status: "paused" });
    expect(eventTypes).toEqual(expect.arrayContaining(["connector.review.required", "workflow.paused"]));
    expect(eventTypes).not.toContain("connector.end");
  });

  it("records canceled runs when an in-flight shell tool is aborted", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "cancel");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow, tools }) {
  await workflow.step("slow shell", async () => {
    await tools.bash({ command: "sleep 30" });
  });
  await workflow.checkpoint("afterShell", true);
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Cancelable fixture",
      status: "ready_for_preview",
      manifest: { tools: ["bash"], mutationPolicy: "read_only" },
      spec: { goal: "Cancel an in-flight shell command." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const controller = new AbortController();
    const shellRunner = vi.fn(
      (input) =>
        new Promise<{ exitCode: number | null }>((_resolve, reject) => {
          if (input.signal?.aborted) {
            reject(new Error("aborted"));
            return;
          }
          input.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          controller.abort();
        }),
    );

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      abortSignal: controller.signal,
      shellRunner,
    });

    expect(dashboard.runs[0]).toMatchObject({ artifactId: artifact.id, status: "canceled", error: "aborted" });
    expect(shellRunner.mock.calls[0]?.[0].signal?.aborted).toBe(true);
    expect(store.listWorkflowRunEvents(dashboard.runs[0].id).map((event) => event.type)).toEqual(
      expect.arrayContaining(["desktop-tool.error", "workflow.failed", "workflow.canceled"]),
    );
    await expect(readFile(dashboard.runs[0].reportPath!, "utf8")).resolves.toContain("workflow.canceled");
  });

  it("reports browser ERR_ABORTED failures without labeling them user cancellations", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "browser-aborted");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow }) {
  await workflow.step("browser", async () => {
    throw new Error("ERR_ABORTED (-3) loading 'https://www.google.com/search?q=pool'");
  });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Browser abort fixture",
      status: "ready_for_preview",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Report browser navigation failures." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
    });

    expect(dashboard.runs[0]).toMatchObject({
      artifactId: artifact.id,
      status: "failed",
      error: "ERR_ABORTED (-3) loading 'https://www.google.com/search?q=pool'",
    });
    const eventTypes = store.listWorkflowRunEvents(dashboard.runs[0].id).map((event) => event.type);
    expect(eventTypes).toContain("workflow.failed");
    expect(eventTypes).not.toContain("workflow.canceled");
  });

  it("fails automation runs that exceed the manifest runtime budget", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "timeout");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow, tools }) {
  await workflow.step("slow shell", async () => {
    await tools.bash({ command: "sleep 30" });
  });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Timeout fixture",
      status: "ready_for_preview",
      manifest: { tools: ["bash"], mutationPolicy: "read_only", maxRunMs: 50 },
      spec: { goal: "Enforce max runtime." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const shellRunner = vi.fn(
      (input) =>
        new Promise<{ exitCode: number | null }>((_resolve, reject) => {
          if (input.signal?.aborted) {
            reject(new Error("aborted"));
            return;
          }
          input.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    );

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      runtime: "automation",
      shellRunner,
    });

    expect(dashboard.runs[0]).toMatchObject({
      artifactId: artifact.id,
      status: "failed",
      error: "Workflow reached the total runtime limit (50ms).",
    });
    expect(store.listWorkflowRunEvents(dashboard.runs[0].id).map((event) => event.type)).toEqual(
      expect.arrayContaining(["desktop-tool.error", "workflow.failed", "workflow.timeout"]),
    );
    await expect(readFile(dashboard.runs[0].reportPath!, "utf8")).resolves.toContain("workflow.timeout");
  });

  it("pauses scheduled automation runs when timeout recovery is enabled", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "scheduled-timeout");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow, tools }) {
  await workflow.step("slow shell", async () => {
    await tools.bash({ command: "sleep 30" });
  });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Scheduled timeout fixture",
      status: "approved",
      manifest: { tools: ["bash"], mutationPolicy: "read_only", maxRunMs: 50 },
      spec: { goal: "Pause scheduled timeout for recovery." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const shellRunner = vi.fn(
      (input) =>
        new Promise<{ exitCode: number | null }>((_resolve, reject) => {
          input.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    );

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      runtime: "automation",
      recoverableTimeouts: true,
      shellRunner,
    });

    expect(dashboard.runs[0]).toMatchObject({
      artifactId: artifact.id,
      status: "paused",
      error: "Workflow reached the total runtime limit (50ms).",
    });
    const events = store.listWorkflowRunEvents(dashboard.runs[0].id);
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["workflow.timeout", "workflow.paused"]));
    expect(events.map((event) => event.type)).not.toContain("workflow.failed");
    expect(events.find((event) => event.type === "workflow.timeout")).toMatchObject({
      data: expect.objectContaining({
        reason: "total_runtime_limit",
        recoverable: true,
        runtime: "automation",
        recommendedAction: "extend_run",
      }),
    });
  });

  it("pauses foreground runs with in-flight Ambient calls when the manifest runtime budget expires", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "ambient-timeout");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
const schema = { parse(value) { return value; } };

export default async function run({ ambient }) {
  await ambient.call({ task: "slow.summary", input: { ok: true, outputContract: { ok: "boolean" } }, schema });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Ambient timeout fixture",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only", maxModelCalls: 1, maxRunMs: 20 },
      spec: { goal: "Abort a slow Ambient runtime call." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const ambientProvider = {
      call: vi.fn(
        (input: Parameters<WorkflowAmbientProvider["call"]>[0]) =>
          new Promise<unknown>((_resolve, reject) => {
            input.abortSignal?.addEventListener("abort", () => reject(new Error("provider aborted")), { once: true });
          }),
      ),
    };

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      ambientProvider,
    });

    expect(ambientProvider.call).toHaveBeenCalledWith(expect.objectContaining({ abortSignal: expect.any(AbortSignal) }));
    expect(dashboard.runs[0]).toMatchObject({
      artifactId: artifact.id,
      status: "paused",
      error: "Workflow reached the total runtime limit (20ms).",
    });
    const events = store.listWorkflowRunEvents(dashboard.runs[0].id);
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["ambient.call.start", "workflow.timeout", "workflow.paused"]));
    expect(events.map((event) => event.type)).not.toContain("workflow.failed");
    expect(events.find((event) => event.type === "workflow.timeout")).toMatchObject({
      data: expect.objectContaining({
        reason: "total_runtime_limit",
        recoverable: true,
        runtime: "workflow",
        totalRuntimeLimitSource: "manifest",
      }),
    });
  });

  it("disables manifest total runtime caps when foreground run overrides request it", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "foreground-limits");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow, tools }) {
  await workflow.step("short shell", async () => {
    await tools.bash({ command: "sleep 0.03" });
  });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Foreground limit fixture",
      status: "ready_for_preview",
      manifest: { tools: ["bash"], mutationPolicy: "read_only", maxRunMs: 5 },
      spec: { goal: "Disable foreground total runtime cap." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const shellRunner = vi.fn(
      (input) =>
        new Promise<{ exitCode: number | null }>((resolve, reject) => {
          const timer = setTimeout(() => resolve({ exitCode: 0 }), 25);
          input.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new Error("aborted"));
            },
            { once: true },
          );
        }),
    );

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      shellRunner,
      runLimits: { idleTimeoutMs: 120_000, maxRunMs: null },
    });

    expect(dashboard.runs[0]).toMatchObject({ artifactId: artifact.id, status: "succeeded" });
    expect(store.listWorkflowRunEvents(dashboard.runs[0].id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "workflow.run-limits",
          message: "stream idle timeout 2 min; no total runtime limit",
          data: expect.objectContaining({
            idleTimeoutMs: 120_000,
            totalRuntimeLimitEnabled: false,
            totalRuntimeLimitSource: "disabled",
          }),
        }),
      ]),
    );
  });

  it("uses manifest default idle timeout when no foreground override is supplied", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "default-idle-limit");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow }) {
  await workflow.step("noop", async () => undefined);
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Default idle limit fixture",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only", defaultIdleTimeoutMs: 300_000 },
      spec: { goal: "Use manifest idle timeout default." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
    });

    expect(store.listWorkflowRunEvents(dashboard.runs[0].id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "workflow.run-limits",
          message: "stream idle timeout 5 min; no total runtime limit",
          data: expect.objectContaining({
            idleTimeoutMs: 300_000,
            totalRuntimeLimitEnabled: false,
          }),
        }),
      ]),
    );
  });

  it("runs schema-validated Ambient calls and records model call audit data", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "ambient");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow, ambient }) {
  const summarySchema = {
    parse(value) {
      if (!value || typeof value.summary !== "string") throw new Error("summary is required");
      return value;
    }
  };
  await workflow.step("summarize", async () => {
    const result = await ambient.call({
      task: "summarize.fixture",
      input: { text: "hello", outputContract: { summary: "string" } },
      schema: summarySchema,
      cacheKey: ["summary", "fixture"]
    });
    await workflow.checkpoint("summary", result.summary);
  });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Ambient fixture",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only", maxModelCalls: 1 },
      spec: { goal: "Summarize fixture data." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      model: AMBIENT_DEFAULT_MODEL,
      ambientProvider: {
        call: async ({ task, attempt, onProgress }) => {
          onProgress?.({
            stage: "streaming",
            outputChars: 64,
            thinkingChars: 12,
            elapsedMs: 1_500,
            idleElapsedMs: 20,
            idleTimeoutMs: 60_000,
            absoluteTimeoutMs: 900_000,
          });
          return { summary: `${task}:${attempt}` };
        },
      },
    });

    expect(dashboard.runs[0]).toMatchObject({ status: "succeeded" });
    expect(store.getWorkflowRun(dashboard.runs[0].id)).toMatchObject({
      providerHealth: expect.objectContaining({
        status: "ok",
        providerEventCount: 3,
        providerProgressEventCount: 1,
        providerErrorEventCount: 0,
        latestProviderEventType: "ambient.call.end",
      }),
    });
    expect(store.listWorkflowRunEvents(dashboard.runs[0].id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ambient.call.progress",
          message: "summarize.fixture",
          data: expect.objectContaining({
            providerStage: "streaming",
            outputChars: 64,
            thinkingChars: 12,
            idleElapsedMs: 20,
            idleTimeoutMs: 60_000,
          }),
        }),
      ]),
    );
    expect(store.listWorkflowModelCalls({ runId: dashboard.runs[0].id })).toEqual([
      expect.objectContaining({
        task: "summarize.fixture",
        status: "succeeded",
        input: { text: "hello", outputContract: { summary: "string" } },
        output: { summary: "summarize.fixture:1" },
        cacheKey: '["summary","fixture"]',
        cacheCheckpoint: expect.objectContaining({
          stage: "runtime_call",
          stablePrefixHash: expect.any(String),
          mutableSuffixHash: expect.any(String),
        }),
        model: AMBIENT_DEFAULT_MODEL,
      }),
    ]);
    await expect(readFile(dashboard.runs[0].reportPath!, "utf8")).resolves.toContain("summarize.fixture");
  });

  it("retains provider health and retry metadata when a model call fails", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "ambient-provider-failure");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ ambient }) {
  await ambient.call({
    task: "provider.failure.fixture",
    input: { outputContract: { ok: "boolean" } },
    schema: { parse(value) { return value; } },
  });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Provider failure fixture",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Classify provider failures for durable recovery." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      retryPolicy: { enabled: false, maxRetries: 0, backoffMs: [], providerMaxRetryDelayMs: 0 },
      ambientProvider: {
        call: async () => {
          throw new Error("GMI Cloud stream stalled after 60000 ms without activity.");
        },
      },
    });
    const run = store.getWorkflowRun(dashboard.runs[0].id);

    expect(run).toMatchObject({
      status: "failed",
      providerHealth: expect.objectContaining({
        status: "provider_degraded",
        providerEventCount: 2,
        providerErrorEventCount: 1,
        latestProviderEventType: "ambient.call.error",
        error: "GMI Cloud stream stalled after 60000 ms without activity.",
      }),
      retryMetadata: expect.objectContaining({
        retryEventCount: 1,
        providerRetryEventCount: 0,
        latestRetryEventType: "ambient.call.error",
      }),
    });
  });

  it("records invalid Ambient output and fails the run", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "ambient-invalid");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ ambient }) {
  const schema = { parse() { throw new Error("invalid output"); } };
  await ambient.call({ task: "bad.output", input: { outputContract: { summary: "string" } }, schema });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Invalid Ambient fixture",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Fail validation." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      ambientProvider: {
        call: async () => ({ nope: true }),
      },
    });

    expect(dashboard.runs[0]).toMatchObject({ status: "failed" });
    expect(store.getWorkflowRun(dashboard.runs[0].id)).toMatchObject({
      providerHealth: expect.objectContaining({
        status: "product_failed",
        providerEventCount: 3,
        providerErrorEventCount: 0,
        latestProviderEventType: "ambient.call.error",
        error: "invalid output",
      }),
    });
    expect(store.listWorkflowModelCalls({ runId: dashboard.runs[0].id })[0]).toMatchObject({
      task: "bad.output",
      status: "invalid",
      validationError: "invalid output",
      cacheCheckpoint: expect.objectContaining({ stage: "runtime_call" }),
    });
  });

  it("enforces ambient.call outputContract even when source schema is permissive", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "ambient-output-contract");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ ambient }) {
  await ambient.call({
    task: "bad.contract.keys",
    input: { outputContract: { summary: "string", eventCount: "number", highlights: "array" } },
    schema: { parse(value) { return value; } },
    retry: { maxAttempts: 1, onInvalid: "fail" }
  });
}
`,
      "utf8",
    );
    const artifact = store.createWorkflowArtifact({
      title: "Output contract fixture",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Fail malformed model output keys." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      ambientProvider: {
        call: async () => ({ " summary ": "Tokenized key", " event Count ": 1, " high lights ": [] }),
      },
    });

    expect(dashboard.runs[0]).toMatchObject({ status: "failed" });
    expect(store.listWorkflowModelCalls({ runId: dashboard.runs[0].id })[0]).toMatchObject({
      task: "bad.contract.keys",
      status: "invalid",
      validationError: "model output missing required field summary",
    });
  });

  it("records failed runs when generated source cannot be loaded", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "bad");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(sourcePath, "const value = 1;", "utf8");
    const artifact = store.createWorkflowArtifact({
      title: "Bad fixture",
      status: "ready_for_preview",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Fail to load." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });

    const dashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
    });

    expect(dashboard.runs[0]).toMatchObject({ status: "failed" });
    expect(dashboard.runs[0].error).toContain("export a run function");
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

function personalConnector() {
  return {
    descriptor: validateWorkflowConnectorDescriptor({
      id: "personal.mail",
      label: "Personal mail",
      description: "Fake personal-data mail connector used by Workflow Agent run-service tests.",
      auth: { type: "oauth2", status: "available" },
      accounts: [{ id: "primary", label: "Primary mailbox" }],
      scopes: [
        {
          id: "mail.messages.read",
          label: "Read messages",
          description: "Read normalized message summaries.",
          personalData: true,
        },
      ],
      operations: [
        {
          name: "listMessages",
          label: "List messages",
          description: "Return normalized personal message summaries.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
            },
            additionalProperties: false,
          },
          requiredScopes: ["mail.messages.read"],
          sideEffects: "read_personal_data",
          supportsDryRun: true,
          idempotencyKey: "not-supported",
          mutationPolicy: "unsupported",
          defaultTimeoutMs: 5_000,
        },
      ],
      rateLimit: { requestsPerMinute: 60, burst: 5 },
      sync: { cursorKind: "opaque", supportsIncremental: true },
      defaultDataRetention: "redacted_audit",
      dataMinimization: ["Only normalized message summaries are returned."],
    }),
    handlers: {
      listMessages: () => ({
        messages: [
          {
            id: "msg-1",
            from: "ada@example.com",
            subject: "Launch plan",
            snippet: "The confidential launch plan is attached.",
          },
        ],
      }),
    },
  } satisfies {
    descriptor: WorkflowConnectorDescriptor;
    handlers: Record<string, () => unknown>;
  };
}
