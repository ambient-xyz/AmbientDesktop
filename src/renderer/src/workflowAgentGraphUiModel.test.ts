import { describe, expect, it } from "vitest";
import type { WorkflowDiscoveryQuestion, WorkflowGraphSnapshot } from "../../shared/workflowTypes";
import {
  workflowDiagramInitialViewportNodeIds,
  layoutWorkflowGraph,
  selectWorkflowGraphCardEvents,
  workflowGraphEventCards,
  workflowGraphDraftOverlayModel,
  workflowLatestRuntimeGraphNodeId,
  workflowLatestDiscoveryGraphChange,
  workflowGraphRevisionDiffCards,
  workflowGraphToReactFlow,
  workflowEdgeLabelPlacement,
  workflowGraphWithRunEvents,
  workflowGraphZoomLabel,
} from "./workflowAgentGraphUiModel";

const snapshot: WorkflowGraphSnapshot = {
  id: "graph-1",
  workflowThreadId: "thread-1",
  version: 1,
  source: "discovery",
  summary: "Graph",
  createdAt: "2026-05-02T00:00:00.000Z",
  nodes: [
    { id: "request", type: "request", label: "Request" },
    { id: "model", type: "model_call", label: "Classify", description: "Categorize inputs.", retryPolicy: "Retry or skip failed items." },
  ],
  edges: [{ id: "edge-1", source: "request", target: "model", type: "control_flow", label: "then" }],
};

function discoveryQuestion(input: Partial<WorkflowDiscoveryQuestion> & Pick<WorkflowDiscoveryQuestion, "id" | "createdAt">): WorkflowDiscoveryQuestion {
  return {
    workflowThreadId: "thread-1",
    category: "scope",
    context: "Context",
    question: "Question?",
    choices: [],
    allowFreeform: true,
    ...input,
  };
}

describe("workflow agent graph UI model", () => {
  it("converts persisted graph snapshots to React Flow nodes and edges", () => {
    expect(workflowGraphToReactFlow(snapshot)).toEqual({
      nodes: [
        expect.objectContaining({
          id: "request",
          type: "workflowAgent",
          position: { x: 0, y: 0 },
          data: expect.objectContaining({ label: "Request", nodeType: "request" }),
        }),
        expect.objectContaining({
          id: "model",
          type: "workflowAgent",
          position: { x: 240, y: 0 },
          data: expect.objectContaining({ label: "Classify", nodeType: "model_call" }),
        }),
      ],
      edges: [
        expect.objectContaining({
          id: "edge-1",
          type: "workflowAgent",
          source: "request",
          target: "model",
          data: expect.objectContaining({
            edgeType: "control_flow",
            label: "then",
            labelPlacement: expect.objectContaining({ y: 92, callout: false }),
          }),
        }),
      ],
    });
  });

  it("places edge labels below connected node boxes and between node centers when possible", () => {
    const placement = workflowEdgeLabelPlacement(
      { source: "request", target: "model", label: "needs live data" },
      new Map([
        ["request", { x: 0, y: 20, width: 190, height: 74 }],
        ["model", { x: 300, y: 10, width: 190, height: 74 }],
      ]),
    );

    expect(placement).toEqual({
      x: 245,
      y: 112,
      maxWidth: 168,
      callout: false,
    });
  });

  it("uses a callout lane for short edges that cannot fit a label between centers", () => {
    const placement = workflowEdgeLabelPlacement(
      { source: "request", target: "model", label: "fallback path pending user decision" },
      new Map([
        ["request", { x: 0, y: 0, width: 190, height: 74 }],
        ["model", { x: 115, y: 0, width: 190, height: 74 }],
      ]),
    );

    expect(placement).toEqual(expect.objectContaining({ x: 152.5, y: 92, maxWidth: 168, callout: true }));
  });

  it("moves edge labels below unrelated node boxes that would otherwise obscure them", () => {
    const placement = workflowEdgeLabelPlacement(
      { source: "request", target: "model", label: "search results" },
      new Map([
        ["request", { x: 0, y: 0, width: 190, height: 74 }],
        ["model", { x: 300, y: 0, width: 190, height: 74 }],
        ["review", { x: 160, y: 82, width: 190, height: 74 }],
      ]),
    );

    expect(placement).toEqual(
      expect.objectContaining({
        x: 245,
        y: 174,
        maxWidth: 168,
        callout: true,
      }),
    );
  });

  it("marks selected graph nodes and source mapping counts for React Flow", () => {
    const projected = workflowGraphToReactFlow(
      {
        ...snapshot,
        nodes: [
          snapshot.nodes[0],
          {
            ...snapshot.nodes[1],
            sourceRanges: [
              {
                kind: "ambient_call",
                start: 10,
                end: 40,
                startLine: 2,
                startColumn: 3,
                endLine: 2,
                endColumn: 33,
                snippet: "ambient.call({ nodeId: 'model' })",
              },
            ],
          },
        ],
      },
      { selectedNodeId: "model" },
    );

    expect(projected.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "model",
          selected: true,
          data: expect.objectContaining({ sourceRangeCount: 1 }),
        }),
      ]),
    );
  });

  it("separates mixed discovery snapshots into labeled discovery and user workflow sections", () => {
    const projected = workflowGraphToReactFlow({
      ...snapshot,
      nodes: [
        { id: "request", type: "request", label: "User Request", x: 0, y: 0 },
        { id: "scope", type: "deterministic_step", label: "Scope", x: 240, y: 0 },
        { id: "output", type: "output", label: "Report Stored", description: "PDF storage confirmation.", x: 480, y: 0 },
        { id: "brave-search", type: "connector_call", label: "Brave Web Search", x: 720, y: 0 },
        { id: "render-pdf", type: "deterministic_step", label: "Render PDF Report", x: 960, y: 0 },
        { id: "store-pdf", type: "mutation", label: "Store PDF in Documents", x: 1200, y: 0 },
      ],
      edges: [
        { id: "request-to-scope", source: "request", target: "scope", type: "control_flow", label: "discover" },
        { id: "scope-to-output", source: "scope", target: "output", type: "control_flow", label: "compile" },
        { id: "output-to-search", source: "output", target: "brave-search", type: "control_flow", label: "raw search results" },
        { id: "search-to-render", source: "brave-search", target: "render-pdf", type: "data_flow", label: "structured data" },
        { id: "render-to-store", source: "render-pdf", target: "store-pdf", type: "data_flow", label: "PDF bytes" },
      ],
    });

    expect(projected.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "__workflow-section-discovery",
          data: expect.objectContaining({ label: "General Discovery Flow", isSectionLabel: true, section: "discovery" }),
        }),
        expect.objectContaining({
          id: "__workflow-section-task",
          data: expect.objectContaining({ label: "Proposed User Workflow", isSectionLabel: true, section: "workflow" }),
        }),
        expect.objectContaining({
          id: "output",
          data: expect.objectContaining({
            label: "Proposed workflow",
            description: "Discovery output handed to the task-specific workflow below.",
            section: "discovery",
          }),
        }),
      ]),
    );
    expect(projected.edges.map((edge) => edge.id)).toEqual(["request-to-scope", "scope-to-output", "search-to-render", "render-to-store"]);
    const discoveryY = projected.nodes.find((node) => node.id === "request")!.position.y;
    const workflowY = projected.nodes.find((node) => node.id === "brave-search")!.position.y;
    expect(workflowY).toBeGreaterThan(discoveryY);
    expect(workflowDiagramInitialViewportNodeIds(projected.nodes)).toEqual(["brave-search", "render-pdf", "store-pdf"]);
  });

  it("marks proposed workflow nodes as provisional while discovery is incomplete", () => {
    const mixedSnapshot: WorkflowGraphSnapshot = {
      ...snapshot,
      nodes: [
        { id: "request", type: "request", label: "User Request", x: 0, y: 0 },
        { id: "scope", type: "deterministic_step", label: "Scope", x: 240, y: 0 },
        { id: "output", type: "output", label: "Report Stored", x: 480, y: 0 },
        { id: "collect", type: "connector_call", label: "Collect facts", x: 720, y: 0 },
        { id: "summarize", type: "model_call", label: "Summarize", x: 960, y: 0 },
      ],
      edges: [
        { id: "request-to-scope", source: "request", target: "scope", type: "control_flow", label: "discover" },
        { id: "scope-to-output", source: "scope", target: "output", type: "control_flow", label: "compile" },
        { id: "collect-to-summarize", source: "collect", target: "summarize", type: "control_flow", label: "then" },
      ],
    };
    const overlay = workflowGraphDraftOverlayModel({
      snapshot: mixedSnapshot,
      unansweredQuestionCount: 2,
    });
    const projected = workflowGraphToReactFlow(mixedSnapshot, { draftOverlay: overlay });

    expect(overlay).toEqual(
      expect.objectContaining({
        title: "Workflow graph is still provisional",
        badges: expect.arrayContaining(["2 unanswered", "Discovery graph"]),
        nodeIds: ["collect", "summarize"],
        edgeIds: ["collect-to-summarize"],
      }),
    );
    expect(projected.nodes.find((node) => node.id === "request")?.data.draftState).toBeUndefined();
    expect(projected.nodes.find((node) => node.id === "collect")?.data).toEqual(
      expect.objectContaining({ draftState: "provisional", draftLabel: "Draft" }),
    );
    expect(projected.edges.find((edge) => edge.id === "collect-to-summarize")?.data).toEqual(
      expect.objectContaining({ draftState: "provisional" }),
    );
  });

  it("extracts the latest graph patch focus and pulses changed nodes", () => {
    const changeFocus = workflowLatestDiscoveryGraphChange([
      discoveryQuestion({
        id: "question-1",
        createdAt: "2026-05-01T00:00:00.000Z",
        graphPatch: { upsertNodes: [{ id: "old", type: "deterministic_step", label: "Old" }] },
      }),
      discoveryQuestion({
        id: "question-2",
        createdAt: "2026-05-02T00:00:00.000Z",
        graphPatch: {
          summary: "Added model step",
          upsertNodes: [{ id: "model", type: "model_call", label: "Classify" }],
          upsertEdges: [{ id: "edge-1", source: "request", target: "model", type: "control_flow" }],
        },
      }),
    ]);
    const projected = workflowGraphToReactFlow(snapshot, { changeFocus });

    expect(changeFocus).toEqual({
      questionId: "question-2",
      nodeIds: ["model", "request"],
      edgeIds: ["edge-1"],
      summary: "Added model step",
    });
    expect(projected.nodes.find((node) => node.id === "model")?.data).toEqual(
      expect.objectContaining({ draftState: "changed", draftLabel: "Graph updated", pulse: true }),
    );
    expect(projected.edges.find((edge) => edge.id === "edge-1")?.data).toEqual(
      expect.objectContaining({ draftState: "changed" }),
    );
  });

  it("lays out graph snapshots with ELK coordinates", async () => {
    const laidOut = await layoutWorkflowGraph(snapshot);

    expect(laidOut.nodes).toHaveLength(2);
    expect(laidOut.nodes[0].x).toEqual(expect.any(Number));
    expect(laidOut.nodes[1].x).toEqual(expect.any(Number));
    expect(laidOut.nodes[1].x!).toBeGreaterThanOrEqual(laidOut.nodes[0].x!);
  });

  it("formats bounded zoom labels", () => {
    expect(workflowGraphZoomLabel(99.6)).toBe("100%");
    expect(workflowGraphZoomLabel(2)).toBe("10%");
    expect(workflowGraphZoomLabel(999)).toBe("400%");
  });

  it("projects run events onto graph nodes and trace cards", () => {
    const projected = workflowGraphWithRunEvents(snapshot, [
      {
        id: "event-1",
        runId: "run-1",
        artifactId: "artifact-1",
        seq: 1,
        type: "workflow.start",
        createdAt: "2026-05-02T00:00:00.000Z",
      },
      {
        id: "event-model",
        runId: "run-1",
        artifactId: "artifact-1",
        seq: 2,
        type: "ambient.call.start",
        graphNodeId: "model",
        createdAt: "2026-05-02T00:00:00.500Z",
      },
      {
        id: "event-2",
        runId: "run-1",
        artifactId: "artifact-1",
        seq: 3,
        type: "workflow.succeeded",
        createdAt: "2026-05-02T00:00:01.000Z",
      },
    ]);

    expect(projected.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: "request", runState: "completed" })]));
    expect(projected.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: "model", runState: "completed" })]));
    expect(workflowGraphEventCards([{ id: "event-2", runId: "run-1", artifactId: "artifact-1", seq: 2, type: "workflow.succeeded", createdAt: "now" }])).toEqual([
      expect.objectContaining({ label: "workflow.succeeded", state: "completed" }),
    ]);
  });

  it("renders Ambient stream progress as active graph trace state", () => {
    const progressEvent = {
      id: "event-progress",
      runId: "run-1",
      artifactId: "artifact-1",
      seq: 2,
      type: "ambient.call.progress",
      message: "classify.records",
      graphNodeId: "model",
      createdAt: "2026-05-02T00:00:00.500Z",
      data: {
        providerStage: "thinking",
        outputChars: 120,
        thinkingChars: 450,
        providerElapsedMs: 12_000,
        idleElapsedMs: 4_000,
        idleTimeoutMs: 60_000,
        timeoutMode: "idle_watchdog",
      },
    };

    expect(workflowGraphWithRunEvents(snapshot, [progressEvent]).nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "model", runState: "active" })]),
    );
    expect(workflowGraphEventCards([progressEvent], snapshot)).toEqual([
      expect.objectContaining({
        label: "ambient.call.progress",
        state: "active",
        summaries: expect.arrayContaining([
          expect.objectContaining({ label: "Stream", value: "Thinking" }),
          expect.objectContaining({ label: "Output", value: "120 chars" }),
          expect.objectContaining({ label: "Thinking", value: "450 chars" }),
          expect.objectContaining({ label: "Idle watchdog", value: "4.0 s since stream update / 1 min timeout" }),
          expect.objectContaining({ label: "Timeout mode", value: "Idle watchdog" }),
        ]),
      }),
    ]);
  });

  it("finds the latest graph node with explicit event metadata before inferred nodes", () => {
    expect(
      workflowLatestRuntimeGraphNodeId(
        [
          {
            id: "event-start",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 1,
            type: "workflow.start",
            createdAt: "2026-05-02T00:00:00.000Z",
          },
          {
            id: "event-progress",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 2,
            type: "ambient.call.progress",
            graphNodeId: "model",
            createdAt: "2026-05-02T00:00:01.000Z",
          },
          {
            id: "event-failed",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 3,
            type: "workflow.failed",
            createdAt: "2026-05-02T00:00:02.000Z",
          },
        ],
        snapshot,
      ),
    ).toBe("model");
  });

  it("renders scheduled workflow starts with target version and grant decision summaries", () => {
    const scheduleEvent = {
      id: "event-schedule",
      runId: "run-1",
      artifactId: "artifact-1",
      seq: 1,
      type: "workflow.schedule.started",
      message: "schedule-1",
      createdAt: "2026-05-02T00:00:00.000Z",
      data: {
        scheduleId: "schedule-1",
        targetKind: "workflow_thread",
        targetId: "workflow-thread-1",
        targetVersionId: "version-2",
        createdTargetVersionId: "version-1",
        grantDecisionSource: "persistent_grant",
        grantTargets: ["google.calendar:listEvents"],
      },
    };

    expect(workflowGraphEventCards([scheduleEvent], snapshot)).toEqual([
      expect.objectContaining({
        label: "workflow.schedule.started",
        detail: "Schedule schedule-1 started version version-2 via Persistent Grant",
        state: "completed",
        summaries: expect.arrayContaining([
          expect.objectContaining({ label: "Schedule", value: "schedule-1" }),
          expect.objectContaining({ label: "Target version", value: "version-2", tone: "success" }),
          expect.objectContaining({ label: "Created at version", value: "version-1", tone: "warning" }),
          expect.objectContaining({ label: "Grant decision", value: "Persistent Grant", tone: "success" }),
          expect.objectContaining({ label: "Grant targets", value: "google.calendar:listEvents" }),
        ]),
      }),
    ]);
  });

  it("adds retry eligibility to failed graph event cards", () => {
    expect(
      workflowGraphEventCards(
        [
          {
            id: "event-1",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 1,
            type: "step.error",
            graphNodeId: "model",
            createdAt: "2026-05-02T00:00:00.000Z",
          },
        ],
        snapshot,
      ),
    ).toEqual([
      expect.objectContaining({
        state: "failed",
        retry: expect.objectContaining({ eligible: true, action: "retry_step" }),
        skipItem: expect.objectContaining({ eligible: false }),
      }),
    ]);
  });

  it("keeps the latest actionable failure visible when later events would otherwise hide it", () => {
    const events = [
      { id: "start", runId: "run-1", artifactId: "artifact-1", seq: 1, type: "workflow.start", createdAt: "now" },
      { id: "selected-failure", runId: "run-1", artifactId: "artifact-1", seq: 2, type: "step.error", graphNodeId: "model", createdAt: "now" },
      { id: "cleanup-1", runId: "run-1", artifactId: "artifact-1", seq: 3, type: "checkpoint.write", createdAt: "now" },
      { id: "cleanup-2", runId: "run-1", artifactId: "artifact-1", seq: 4, type: "workflow.version", createdAt: "now" },
      { id: "cleanup-3", runId: "run-1", artifactId: "artifact-1", seq: 5, type: "workflow.audit", createdAt: "now" },
      { id: "terminal", runId: "run-1", artifactId: "artifact-1", seq: 6, type: "workflow.failed", createdAt: "now" },
    ];

    expect(selectWorkflowGraphCardEvents(events, 3).map((event) => event.id)).toEqual(["selected-failure", "cleanup-3", "terminal"]);
    expect(workflowGraphEventCards(events, snapshot, { limit: 3 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "selected-failure",
          graphNodeId: "model",
          retry: expect.objectContaining({ eligible: true, action: "retry_step" }),
        }),
      ]),
    );
  });

  it("adds checkpoint resume eligibility to failed graph event cards with retained checkpoints", () => {
    expect(
      workflowGraphEventCards(
        [
          {
            id: "event-1",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 1,
            type: "step.error",
            graphNodeId: "model",
            createdAt: "2026-05-02T00:00:00.000Z",
          },
        ],
        snapshot,
        {
          checkpoints: [{ key: "records", valuePreview: "[{\"id\":\"record-1\"}]", runId: "run-1", updatedAt: "2026-05-02T00:00:00.000Z" }],
        },
      ),
    ).toEqual([
      expect.objectContaining({
        state: "failed",
        retry: expect.objectContaining({ eligible: true, action: "retry_step" }),
        resume: expect.objectContaining({ eligible: true, action: "resume_checkpoint", label: "Resume from checkpoint" }),
        recoveryContext: "Resume can reuse checkpoint records.",
      }),
    ]);
  });

  it("adds skip eligibility to failed item cards when graph policy allows it", () => {
    expect(
      workflowGraphEventCards(
        [
          {
            id: "event-1",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 1,
            type: "batch.item.failed",
            graphNodeId: "model",
            itemKey: "record-1",
            createdAt: "2026-05-02T00:00:00.000Z",
          },
        ],
        snapshot,
      ),
    ).toEqual([
      expect.objectContaining({
        state: "failed",
        skipItem: expect.objectContaining({ eligible: true, action: "skip_item" }),
      }),
    ]);
  });

  it("labels page and chunk recovery cards with their target kind", () => {
    const recoverySnapshot: WorkflowGraphSnapshot = {
      ...snapshot,
      nodes: [
        { id: "search", type: "data_source", label: "Search", retryPolicy: "read-only bounded pagination; checkpointed page retry; continue with partial results" },
        { id: "classify", type: "model_call", label: "Classify", retryPolicy: "Retry or skip failed chunks and continue with partial coverage." },
      ],
      edges: [],
    };

    expect(
      workflowGraphEventCards(
        [
          {
            id: "page-failure",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 1,
            type: "collection.page.error",
            graphNodeId: "search",
            itemKey: "page-2",
            data: { targetKind: "page", targetIndex: 1, checkpointKey: "search" },
            createdAt: "2026-05-02T00:00:00.000Z",
          },
          {
            id: "chunk-failure",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 2,
            type: "batch.item.failed",
            graphNodeId: "classify",
            itemKey: "chunk-2",
            data: { targetKind: "chunk", targetIndex: 1, checkpointKey: "classify" },
            createdAt: "2026-05-02T00:00:01.000Z",
          },
        ],
        recoverySnapshot,
      ),
    ).toEqual([
      expect.objectContaining({
        id: "page-failure",
        targetKind: "page",
        itemLabel: "Page 2",
        retry: expect.objectContaining({ label: "Retry failed page" }),
        skipItem: expect.objectContaining({ label: "Continue without failed page" }),
        recoveryContext: "Continue can omit failed page 2 and keep retained partial results.",
      }),
      expect.objectContaining({
        id: "chunk-failure",
        targetKind: "chunk",
        itemLabel: "Chunk chunk-2",
        retry: expect.objectContaining({ label: "Retry failed chunk" }),
        skipItem: expect.objectContaining({ label: "Skip failed chunk" }),
        recoveryContext: "Skip targets retained chunk chunk-2.",
      }),
    ]);
  });

  it("enriches trace cards with retained model payloads, timings, cache hints, and redaction", () => {
    const [card] = workflowGraphEventCards(
      [
        {
          id: "event-1",
          runId: "run-1",
          artifactId: "artifact-1",
          seq: 1,
          type: "ambient.call.invalid",
          message: "classify.records",
          graphNodeId: "model",
          itemKey: "record-1",
          data: { error: "schema failed", apiKey: "secret-value" },
          createdAt: "2026-05-02T00:00:00.000Z",
        },
      ],
      snapshot,
      {
        modelCalls: [
          {
            id: "call-1",
            runId: "run-1",
            artifactId: "artifact-1",
            task: "classify.records",
            status: "invalid",
            input: { text: "hello", token: "secret-token" },
            cacheKey: "classify:record-1",
            cacheCheckpoint: {
              id: "checkpoint-1",
              stage: "runtime_call",
              graphSnapshotId: "graph-1",
              stablePrefixHash: "stable",
              stablePrefixChars: 12,
              stablePrefixEstimatedTokens: 3,
              mutableSuffixHash: "mutable",
              mutableSuffixChars: 24,
              mutableSuffixEstimatedTokens: 6,
              requestHash: "requesthash",
              requestEstimatedTokens: 9,
              boundaryLabel: "Runtime Ambient call",
              createdAt: "2026-05-02T00:00:00.000Z",
            },
            model: "ambient-test",
            graphNodeId: "model",
            itemKey: "record-1",
            validationError: "schema failed",
            startedAt: "2026-05-02T00:00:00.000Z",
            completedAt: "2026-05-02T00:00:01.234Z",
            latencyMs: 1234,
          },
        ],
      },
    );

    expect(card.nodeLabel).toBe("Classify");
    expect(card.itemLabel).toBe("Item record-1");
    expect(card.timingLabel).toBe("1.2 s");
    expect(card.summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Event", value: expect.stringContaining("[redacted]") }),
        expect.objectContaining({ label: "Model", value: "ambient-test · Invalid", tone: "danger" }),
        expect.objectContaining({ label: "Input", value: expect.stringContaining("[redacted]") }),
        expect.objectContaining({ label: "Validation", value: "schema failed", tone: "danger" }),
        expect.objectContaining({ label: "Timing", value: "1.2 s" }),
        expect.objectContaining({ label: "Cache key", value: "classify:record-1" }),
        expect.objectContaining({ label: "Cache checkpoint", value: expect.stringContaining("3/9 estimated tokens stable") }),
      ]),
    );
    expect(card.recoveryContext).toBe("Retry uses retained classify.records input for item record-1.");
  });

  it("enriches checkpoint and skip recovery trace cards", () => {
    const cards = workflowGraphEventCards(
      [
        {
          id: "checkpoint-event",
          runId: "run-1",
          artifactId: "artifact-1",
          seq: 1,
          type: "checkpoint.resume",
          message: "records",
          graphNodeId: "model",
          createdAt: "2026-05-02T00:00:00.000Z",
        },
        {
          id: "failed-item",
          runId: "run-1",
          artifactId: "artifact-1",
          seq: 2,
          type: "batch.item.failed",
          graphNodeId: "model",
          itemKey: "record-1",
          createdAt: "2026-05-02T00:00:01.000Z",
        },
      ],
      snapshot,
      {
        checkpoints: [{ key: "records", valuePreview: "[{\"id\":\"record-1\"}]", runId: "run-1", updatedAt: "2026-05-02T00:00:00.000Z" }],
      },
    );

    expect(cards[0].summaries).toEqual([
      expect.objectContaining({ label: "Checkpoint resumed", value: "[{\"id\":\"record-1\"}]", tone: "warning" }),
    ]);
    expect(cards[1]).toEqual(expect.objectContaining({ recoveryContext: "Skip targets retained item record-1." }));
  });

  it("uses first-class graph event fields before legacy event data", () => {
    const projected = workflowGraphWithRunEvents(snapshot, [
      {
        id: "event-1",
        runId: "run-1",
        artifactId: "artifact-1",
        seq: 1,
        type: "ambient.call.start",
        graphNodeId: "model",
        data: { graphNodeId: "request" },
        createdAt: "2026-05-02T00:00:00.000Z",
      },
    ]);

    expect(projected.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: "model", runState: "active" })]));
    expect(projected.nodes.find((node) => node.id === "request")?.runState).toBeUndefined();
  });

  it("builds revision diff cards for proposed graph and manifest changes", () => {
    const proposed: WorkflowGraphSnapshot = {
      ...snapshot,
      id: "graph-2",
      version: 2,
      source: "revision",
      nodes: [
        snapshot.nodes[0],
        { ...snapshot.nodes[1], label: "Classify and summarize", modelRole: "Categorize and summarize" },
        { id: "review", type: "review_gate", label: "Review" },
      ],
      edges: [
        snapshot.edges[0],
        { id: "edge-review", source: "model", target: "review", type: "control_flow", label: "approve" },
      ],
    };

    expect(
      workflowGraphRevisionDiffCards({
        current: snapshot,
        proposed,
        currentManifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
        proposedManifest: { tools: ["ambient.responses", "gmail.search"], mutationPolicy: "staged_until_approved" },
      }),
    ).toEqual([
      expect.objectContaining({ id: "node-added:review", kind: "added", label: "Review", detail: "Review Gate added" }),
      expect.objectContaining({ id: "node-changed:model", kind: "changed", label: "Classify and summarize", detail: "Changed Label, Model Role" }),
      expect.objectContaining({ id: "edge-added:edge-review", kind: "added", label: "approve", detail: "model to review" }),
      expect.objectContaining({ id: "manifest-changed:mutationPolicy", kind: "changed", label: "Mutation Policy" }),
      expect.objectContaining({ id: "manifest-changed:tools", kind: "changed", label: "Tools" }),
    ]);
  });
});
