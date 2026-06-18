import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { validateWorkflowDiscoveryGraphPatch } from "../../shared/workflowDiscoveryGraphPatch";
import type { WorkflowRuntimeEvent } from "./workflowAgentRuntime";
import { firstPartyDesktopToolDescriptors } from "./workflowDesktopToolFacade";
import { createWorkflowDesktopToolBridge } from "./workflowDesktopTools";
import { validateWorkflowCompilerOutput, type WorkflowCompilerOutput } from "./workflowWorkflowCompilerFacade";
import { fixtureWorkflowConnector } from "./workflowConnectors";
import { ProjectStore } from "./workflowProjectStoreFacade";
import {
  liveAmbientDirectHelperProfile,
  liveAmbientProviderBaseUrl,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "./workflowAmbientFacade";
import {
  AmbientWorkflowExplorationProvider,
  buildWorkflowExplorationCapabilityManifest,
  runWorkflowExploration,
  runWorkflowThreadExploration,
  workflowExplorationGraphNode,
  workflowManifestForExplorationCapabilities,
  normalizeWorkflowExplorationAction,
  type WorkflowExplorationAction,
  type WorkflowExplorationProvider,
} from "./workflowExplorationService";

const itLive = process.env.AMBIENT_WORKFLOW_EXPLORATION_LIVE === "1" ? it : it.skip;
const liveExplorationProfile = liveAmbientDirectHelperProfile();
const LIVE_EXPLORATION_TIMEOUT_MS = Math.max(
  240_000,
  Number(process.env.AMBIENT_WORKFLOW_EXPLORATION_TIMEOUT_MS ?? "0") || liveExplorationProfile.testTimeoutMs,
);
const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describe("workflowExplorationService", () => {
  let workspacePath = "";
  let store: ProjectStore | undefined;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-exploration-"));
    await writeFile(
      join(workspacePath, "event_sources.md"),
      [
        "# Event Source Notes",
        "",
        "- Scottsdale Center for the Performing Arts publishes family events on its calendar.",
        "- Public library storytime pages are recurring but require a current web check.",
        "- Local flat files can seed venue categories, but live dates need browser or connector access.",
      ].join("\n"),
      "utf8",
    );
  });

  afterEach(async () => {
    store?.close();
    store = undefined;
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("builds a bounded capability manifest and runtime manifest", () => {
    const connector = fixtureWorkflowConnector().descriptor;
    const capabilityManifest = buildWorkflowExplorationCapabilityManifest({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors: [connector],
      allowedToolNames: ["file_read"],
      budgets: { maxToolCalls: 1, maxConnectorCalls: 2 },
    });
    const runtimeManifest = workflowManifestForExplorationCapabilities(capabilityManifest);

    expect(capabilityManifest.tools).toEqual([
      expect.objectContaining({ name: "file_read", sideEffects: "none", permissionScope: "workspace-file-read" }),
    ]);
    expect(capabilityManifest.connectors[0]).toMatchObject({
      connectorId: "fixture.readonly",
      operations: [expect.objectContaining({ name: "listRecords" }), expect.objectContaining({ name: "getRecord" })],
    });
    expect(runtimeManifest).toMatchObject({
      tools: ["file_read"],
      mutationPolicy: "read_only",
      maxToolCalls: 1,
      maxConnectorCalls: 2,
      connectors: [
        expect.objectContaining({
          connectorId: "fixture.readonly",
          scopes: ["fixture.records.read"],
          operations: ["listRecords", "getRecord"],
        }),
      ],
    });
  });

  it("runs a Pi-planned tool action through the workflow Desktop tool bridge", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const capabilityManifest = buildWorkflowExplorationCapabilityManifest({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      allowedToolNames: ["file_read"],
      budgets: { maxModelTurns: 3, maxToolCalls: 1 },
    });
    const bridge = createWorkflowDesktopToolBridge({
      manifest: workflowManifestForExplorationCapabilities(capabilityManifest),
      workspace: { path: workspacePath },
      permissionMode: "full-access",
      runId: "exploration-run-1",
      eventSink: { append: (event) => void events.push(event) },
    });
    const provider = sequenceProvider([
      { action: "call_tool", toolName: "file_read", input: { path: "event_sources.md" }, reason: "Read the local source hints first." },
      {
        action: "finish",
        distillation: {
          summary: "The local file identifies venue categories but says live dates need browser or connector access.",
          observedCalls: [{ kind: "tool", name: "file_read", status: "succeeded", inputSummary: "event_sources.md", outputSummary: "venue hints" }],
          successfulPatterns: ["Read seed files, then use browser or event connector for current dates."],
          dataShapes: ["venue name, source page, freshness requirement"],
          requiredGrants: ["workspace file read", "browser network read"],
          recommendedGraph: {
            summary: "Explore seed file before deterministic live-data fetch.",
            nodes: [workflowExplorationGraphNode({ id: "agent-exploration" })],
            edges: [],
          },
          recommendedManifest: { tools: ["file_read", "browser_search"], mutationPolicy: "read_only" },
          deterministicSourceStrategy: "Use file_read for seed venues, browser_search for current events, then ambient.call for synthesis.",
          unresolvedQuestions: [],
        },
      },
    ]);

    const result = await runWorkflowExploration({
      request: "Find the right data-source strategy for kid-friendly Scottsdale events.",
      workflowThreadId: "workflow-thread-1",
      explorationNodeId: "agent-exploration",
      capabilityManifest,
      provider,
      toolHandlers: bridge.handlers,
      eventSink: { append: (event) => void events.push(event) },
    });

    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({ action: "call_tool", name: "file_read", status: "succeeded" });
    expect(JSON.stringify(result.observations[0].output)).toContain("Scottsdale Center");
    expect(result.distillation.requiredGrants).toContain("browser network read");
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["exploration.start", "exploration.tool.start", "desktop-tool.start", "desktop-tool.end", "exploration.finish"]),
    );
  });

  it("enforces exploration tool-call budgets", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const capabilityManifest = buildWorkflowExplorationCapabilityManifest({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      allowedToolNames: ["file_read"],
      budgets: { maxModelTurns: 3, maxToolCalls: 1 },
    });
    const bridge = createWorkflowDesktopToolBridge({
      manifest: workflowManifestForExplorationCapabilities(capabilityManifest),
      workspace: { path: workspacePath },
      permissionMode: "full-access",
      runId: "exploration-run-2",
      eventSink: { append: (event) => void events.push(event) },
    });
    const provider = sequenceProvider([
      { action: "call_tool", toolName: "file_read", input: { path: "event_sources.md" } },
      { action: "call_tool", toolName: "file_read", input: { path: "event_sources.md" } },
    ]);

    await expect(
      runWorkflowExploration({
        request: "Read too many files.",
        capabilityManifest,
        provider,
        toolHandlers: bridge.handlers,
        eventSink: { append: (event) => void events.push(event) },
      }),
    ).rejects.toThrow("max tool calls");
    expect(events.map((event) => event.type)).toContain("exploration.error");
  });

  it("keeps distillation when an optional recommended graph is malformed", () => {
    const action = normalizeWorkflowExplorationAction({
      action: "finish",
      distillation: {
        summary: "Useful trace survived.",
        observedCalls: [],
        successfulPatterns: [],
        dataShapes: [],
        requiredGrants: [],
        recommendedGraph: {
          summary: "Missing node id.",
          nodes: [{ type: "agent_exploration", label: "Explore" }],
          edges: [],
        },
        deterministicSourceStrategy: "Compile without the malformed graph recommendation.",
        unresolvedQuestions: [],
      },
    });

    expect(action.action).toBe("finish");
    if (action.action !== "finish") throw new Error("expected finish action");
    expect(action.distillation.recommendedGraph).toBeUndefined();
    expect(action.distillation.unresolvedQuestions[0]).toContain("Invalid recommended graph omitted");
  });

  it("allows agent_exploration nodes in discovery graph patches and compiler output", () => {
    const patch = validateWorkflowDiscoveryGraphPatch({
      upsertNodes: [
        {
          id: "agent-exploration",
          type: "agent_exploration",
          label: "Explore source strategy",
          description: "A bounded agentic pass before deterministic compile.",
        },
      ],
      upsertEdges: [{ id: "request-to-explore", source: "request", target: "agent-exploration", type: "control_flow" }],
    });
    expect(patch.blockedReasons).toBeUndefined();
    expect(patch.graphPatch?.upsertNodes?.[0]).toMatchObject({ type: "agent_exploration" });

    const output: WorkflowCompilerOutput = {
      title: "Exploration-backed workflow",
      spec: { goal: "Compile after exploration." },
      manifest: { tools: [], mutationPolicy: "read_only" },
      graph: {
        summary: "Request is informed by a prior exploratory pass.",
        nodes: [
          { id: "request", type: "request", label: "Request" },
          { id: "agent-exploration", type: "agent_exploration", label: "Prior exploration" },
          { id: "output", type: "output", label: "Output" },
        ],
        edges: [
          { id: "request-to-explore", source: "request", target: "agent-exploration", type: "control_flow" },
          { id: "explore-to-output", source: "agent-exploration", target: "output", type: "control_flow" },
        ],
      },
      source: "export default async function run({ workflow }) { await workflow.emit({ type: 'done' }); }",
      previewSummary: "Uses prior exploration as review context.",
      dryRunStrategy: "No effects.",
      openQuestions: [],
    };
    expect(validateWorkflowCompilerOutput(output, firstPartyDesktopToolDescriptors()).output.graph?.nodes[1]).toMatchObject({
      type: "agent_exploration",
    });
  });

  describeNative("workflow thread exploration flow", () => {
    it("runs exploration for a workflow thread and persists trace plus graph snapshot", async () => {
      store = new ProjectStore();
      store.openWorkspace(workspacePath);
      const thread = store.createWorkflowAgentThreadSummary({
        title: "Scottsdale event workflow",
        initialRequest: "Explore local event source notes before compiling a Scottsdale event workflow.",
        projectPath: workspacePath,
        phase: "planned",
      });
      const provider = sequenceProvider([
        { action: "call_tool", toolName: "file_read", input: { path: "event_sources.md" }, reason: "Inspect local event-source notes." },
        {
          action: "finish",
          distillation: {
            summary: "Use local notes as seed categories and fetch current dates externally.",
            observedCalls: [{ kind: "tool", name: "file_read", status: "succeeded", inputSummary: "event_sources.md", outputSummary: "source hints" }],
            successfulPatterns: ["Seed from file, then verify current events externally."],
            dataShapes: ["venue/category/freshness requirement"],
            requiredGrants: ["workspace file read", "browser network read"],
            deterministicSourceStrategy: "Compile file_read plus browser_search and final Ambient synthesis.",
            unresolvedQuestions: [],
          },
        },
      ]);
      const progress: string[] = [];

      const result = await runWorkflowThreadExploration({
        store,
        workflowThreadId: thread.id,
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        permissionMode: "full-access",
        provider,
        budgets: { maxModelTurns: 3, maxToolCalls: 1 },
        onProgress: (event) => progress.push(`${event.phase}:${event.status}:${event.graphNodeId ?? "none"}`),
      });

      expect(result.trace).toMatchObject({
        workflowThreadId: thread.id,
        explorationNodeId: "agent-exploration",
        observations: expect.arrayContaining([expect.objectContaining({ name: "file_read" })]),
      });
      expect(store.listWorkflowExplorationTraces(thread.id)[0]).toMatchObject({
        id: result.trace.id,
        distillation: expect.objectContaining({ summary: expect.stringContaining("local notes") }),
        events: expect.arrayContaining([expect.objectContaining({ type: "exploration.start" })]),
      });
      expect(store.listWorkflowGraphSnapshots(thread.id)[0]).toMatchObject({
        id: result.graphSnapshot.id,
        source: "exploration",
        nodes: expect.arrayContaining([expect.objectContaining({ id: "agent-exploration", type: "agent_exploration" })]),
      });
      expect(result.thread.activeGraphSnapshotId).toBe(result.graphSnapshot.id);
      expect(progress).toEqual(expect.arrayContaining(["starting:running:agent-exploration", "tool:running:agent-exploration"]));
    });

    it("routes workflow-thread exploration connector calls through connector registrations", async () => {
      store = new ProjectStore();
      store.openWorkspace(workspacePath);
      const connector = fixtureWorkflowConnector([{ id: "m1", subject: "Live music" }]);
      const thread = store.createWorkflowAgentThreadSummary({
        title: "Connector exploration workflow",
        initialRequest: "Explore connector records before compiling a report workflow.",
        projectPath: workspacePath,
        phase: "planned",
      });
      const provider = sequenceProvider([
        {
          action: "call_connector",
          connectorId: "fixture.readonly",
          operation: "listRecords",
          input: { limit: 1 },
          reason: "Inspect available fixture records.",
        },
        {
          action: "finish",
          distillation: {
            summary: "Use fixture records as the production data source.",
            observedCalls: [{ kind: "connector", name: "fixture.readonly.listRecords", status: "succeeded" }],
            successfulPatterns: ["List records with a bounded page size."],
            dataShapes: ["record: id, subject"],
            requiredGrants: ["fixture.records.read"],
            deterministicSourceStrategy: "Compile a connector listRecords loop and summarize records.",
            unresolvedQuestions: [],
          },
        },
      ]);

      const result = await runWorkflowThreadExploration({
        store,
        workflowThreadId: thread.id,
        toolDescriptors: [],
        connectorDescriptors: [connector.descriptor],
        connectorRegistrations: [connector],
        permissionMode: "full-access",
        provider,
        budgets: { maxModelTurns: 3, maxConnectorCalls: 1 },
      });

      expect(result.trace.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "call_connector",
            name: "fixture.readonly.listRecords",
            status: "succeeded",
          }),
        ]),
      );
      expect(store.listWorkflowExplorationTraces(thread.id)[0]?.distillation).toMatchObject({
        summary: expect.stringContaining("fixture records"),
      });
    });

    it("persists failed workflow-thread exploration runs with partial events and provider health", async () => {
      store = new ProjectStore();
      store.openWorkspace(workspacePath);
      const thread = store.createWorkflowAgentThreadSummary({
        title: "Failed exploration workflow",
        initialRequest: "Explore before compiling, but the provider stalls.",
        projectPath: workspacePath,
        phase: "planned",
      });
      const provider: WorkflowExplorationProvider = {
        next: async () => {
          throw new Error("GMI Cloud stream stalled after 60000 ms without activity.");
        },
      };

      await expect(
        runWorkflowThreadExploration({
          store,
          workflowThreadId: thread.id,
          toolDescriptors: firstPartyDesktopToolDescriptors(),
          permissionMode: "full-access",
          provider,
          budgets: { maxModelTurns: 2, maxToolCalls: 1 },
        }),
      ).rejects.toThrow("GMI Cloud stream stalled");

      const trace = store.listWorkflowExplorationTraces(thread.id)[0];
      expect(trace).toMatchObject({
        workflowThreadId: thread.id,
        status: "failed",
        error: "GMI Cloud stream stalled after 60000 ms without activity.",
        graphSnapshotId: expect.any(String),
        events: expect.arrayContaining([
          expect.objectContaining({ type: "exploration.start" }),
          expect.objectContaining({ type: "exploration.provider.start" }),
          expect.objectContaining({ type: "exploration.error" }),
        ]),
        latestProgress: expect.objectContaining({
          phase: "failed",
          status: "failed",
          message: expect.stringContaining("Exploration failed"),
        }),
        providerHealth: expect.objectContaining({
          status: "provider_degraded",
          error: expect.stringContaining("GMI Cloud stream stalled"),
        }),
      });
      expect(trace.completedAt).toBeTruthy();
      expect(trace.updatedAt).toBeTruthy();
    });
  });

  itLive(
    "runs a bounded local-file exploration with live Pi/Ambient and persists the durable trace",
    async () => {
      store = new ProjectStore();
      store.openWorkspace(workspacePath);
      const thread = store.createWorkflowAgentThreadSummary({
        title: "Live local-file exploration workflow",
        initialRequest:
          "Before compiling, inspect event_sources.md using file_read and distill how a deterministic workflow should combine local seed files with current Scottsdale event research.",
        projectPath: workspacePath,
        phase: "planned",
      });
      const provider = new AmbientWorkflowExplorationProvider({
        apiKey: readLiveAmbientProviderApiKey({ purpose: "live Workflow exploration dogfood" }),
        baseUrl: liveAmbientProviderBaseUrl(),
        timeoutMs: LIVE_EXPLORATION_TIMEOUT_MS,
        idleTimeoutMs: liveExplorationProfile.streamIdleTimeoutMs,
        retryPolicy: liveExplorationProfile.retryPolicy,
      });
      const model = liveAmbientProviderModel({
        preferredModelEnvNames: ["AMBIENT_WORKFLOW_EXPLORATION_MODEL", "AMBIENT_WORKFLOW_MODEL", "AMBIENT_LIVE_MODEL"],
        fallbackModel: AMBIENT_DEFAULT_MODEL,
      });

      const result = await runWorkflowThreadExploration({
        store,
        workflowThreadId: thread.id,
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        permissionMode: "full-access",
        model,
        provider,
        budgets: { maxModelTurns: 4, maxToolCalls: 2, maxElapsedMs: LIVE_EXPLORATION_TIMEOUT_MS },
      });

      expect(result.result.distillation.summary.length).toBeGreaterThan(20);
      expect(result.result.observations.some((observation) => observation.name === "file_read")).toBe(true);
      const [trace] = store.listWorkflowExplorationTraces(thread.id);
      expect(trace).toMatchObject({
        id: result.trace.id,
        status: "succeeded",
        graphSnapshotId: result.graphSnapshot.id,
        completedAt: expect.any(String),
        events: expect.arrayContaining([
          expect.objectContaining({ type: "exploration.start" }),
          expect.objectContaining({ type: "exploration.provider.progress" }),
          expect.objectContaining({ type: "exploration.finish" }),
        ]),
        latestProgress: expect.objectContaining({ status: "succeeded" }),
        providerHealth: expect.objectContaining({ status: "ok" }),
      });
    },
    LIVE_EXPLORATION_TIMEOUT_MS,
  );
});

function sequenceProvider(actions: WorkflowExplorationAction[]): WorkflowExplorationProvider {
  let index = 0;
  return {
    next: async () => {
      const action = actions[index];
      index += 1;
      if (!action) throw new Error("No more exploration actions.");
      return action;
    },
  };
}
