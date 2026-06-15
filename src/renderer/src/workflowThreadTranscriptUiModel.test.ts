import { describe, expect, it } from "vitest";
import type {
  ChatMessage,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowCompileProgress,
  WorkflowExplorationTraceSummary,
  WorkflowNativeToolName,
  WorkflowRevisionSummary,
  WorkflowRunDetail,
} from "../../shared/types";
import { workflowThreadTranscriptCards } from "./workflowThreadTranscriptUiModel";

const thread: Pick<WorkflowAgentThreadSummary, "id" | "initialRequest" | "phase" | "projectName" | "traceMode" | "latestVersion"> = {
  id: "thread-1",
  initialRequest: "Summarize recent arXiv papers.",
  phase: "ready_for_review",
  projectName: "Research",
  traceMode: "production",
  latestVersion: {
    id: "version-1",
    workflowThreadId: "thread-1",
    artifactId: "artifact-1",
    version: 1,
    sourcePath: "/tmp/main.ts",
    repoPath: "/tmp/workflow",
    gitCommitHash: "abc",
    status: "ready_for_review",
    createdBy: "compiler",
    createdAt: "now",
  },
};

const artifact: Pick<WorkflowArtifactSummary, "id" | "title" | "status" | "manifest"> = {
  id: "artifact-1",
  title: "ArXiv paper summaries",
  status: "ready_for_preview",
  manifest: {
    tools: ["ambient.responses"],
    pluginCapabilities: [],
    ambientCliCapabilities: [],
    mutationPolicy: "read_only",
    maxToolCalls: 2,
    maxModelCalls: 1,
    maxConnectorCalls: 0,
    connectors: [],
  },
};

const detail: WorkflowRunDetail = {
  artifact: artifact as WorkflowArtifactSummary,
  run: {
    id: "run-1",
    artifactId: "artifact-1",
    status: "running",
    startedAt: "2026-05-09T00:00:00.000Z",
    updatedAt: "2026-05-09T00:01:00.000Z",
  },
  events: [
    {
      id: "event-1",
      runId: "run-1",
      artifactId: "artifact-1",
      seq: 1,
      type: "workflow.start",
      createdAt: "2026-05-09T00:00:00.000Z",
    },
    {
      id: "event-2",
      runId: "run-1",
      artifactId: "artifact-1",
      seq: 2,
      type: "ambient.call.progress",
      message: "summarize-papers",
      graphNodeId: "summarize",
      createdAt: "2026-05-09T00:00:30.000Z",
      data: { outputChars: 1200, thinkingChars: 300 },
    },
  ],
  modelCalls: [],
  checkpoints: [],
  approvals: [],
  auditReport: "",
};

const revision: WorkflowRevisionSummary = {
  id: "revision-1",
  workflowThreadId: "thread-1",
  baseVersionId: "version-1",
  baseArtifactId: "artifact-1",
  requestedChange: "Add a review gate before writing the report.",
  graphDiff: {
    currentGraphId: "graph-1",
    proposedGraphId: "graph-2",
    addedNodes: [{ id: "review", after: { id: "review", type: "review_gate", label: "Review" }, fieldChanges: [] }],
    removedNodes: [],
    changedNodes: [],
    addedEdges: [],
    removedEdges: [],
    changedEdges: [],
    manifest: {
      fieldChanges: [],
      addedConnectors: [],
      removedConnectors: [],
      changedConnectors: [],
      addedPluginCapabilities: [],
      removedPluginCapabilities: [],
      changedPluginCapabilities: [],
    },
  },
  sourceDiff: "diff --git a/main.ts b/main.ts\n--- a/main.ts\n+++ b/main.ts\n+review()",
  status: "proposed",
  createdAt: "2026-05-09T00:03:00.000Z",
  updatedAt: "2026-05-09T00:04:00.000Z",
};

describe("workflowThreadTranscriptUiModel", () => {
  it("builds thread-first cards from request, artifact, and active run state", () => {
    const cards = workflowThreadTranscriptCards({ thread, artifact, detail });

    expect(cards).toEqual([
      expect.objectContaining({
        id: "request:thread-1",
        kind: "request",
        title: "Workflow request",
        detail: "Summarize recent arXiv papers.",
      }),
      expect.objectContaining({
        id: "artifact:artifact-1",
        kind: "artifact",
        tone: "warning",
        badges: expect.arrayContaining(["Ready For Preview", "Version 1", "1 tool", "No total cap"]),
      }),
      expect.objectContaining({
        id: "run:run-1",
        kind: "run",
        tone: "active",
        title: "Workflow run is running",
        badges: expect.arrayContaining(["Running", "2 events", "0 model calls"]),
      }),
      expect.objectContaining({
        id: "event:event-2",
        kind: "event",
        tone: "active",
        title: "Ambient Call Progress",
        detail: "summarize-papers",
        badges: expect.arrayContaining(["Node summarize"]),
      }),
    ]);
  });

  it("surfaces missing artifacts as a warning card", () => {
    expect(workflowThreadTranscriptCards({ thread })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "artifact:missing:thread-1",
          kind: "empty",
          tone: "warning",
          title: "Workflow artifact not loaded",
        }),
      ]),
    );
  });

  it("labels workflow runs that are waiting for runtime input", () => {
    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      detail: {
        ...detail,
        run: { ...detail.run, status: "needs_input" },
        events: [],
      },
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "run:run-1",
          kind: "run",
          tone: "warning",
          title: "Workflow run needs input",
          detail: "Workflow run is waiting for user input.",
          badges: expect.arrayContaining(["Needs Input"]),
          panelActions: expect.arrayContaining([
            { id: "runtime_input", label: "Answer input", panel: "runtime_input" },
            { id: "run_console", label: "Open run console", panel: "run_console" },
          ]),
        }),
      ]),
    );
  });

  it("surfaces Workflow Chat messages from the hidden Pi thread", () => {
    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      chatMessages: [
        {
          id: "msg-user",
          threadId: "chat-thread-1",
          role: "user",
          content: "What does the current workflow script do?",
          createdAt: "2026-05-09T00:03:00.000Z",
          metadata: { workflowThreadId: "thread-1", workflowMode: "plan-edit" },
        },
        {
          id: "msg-thinking",
          threadId: "chat-thread-1",
          role: "assistant",
          content: "internal thought",
          createdAt: "2026-05-09T00:03:10.000Z",
          metadata: { kind: "thinking", status: "done" },
        },
        {
          id: "msg-assistant",
          threadId: "chat-thread-1",
          role: "assistant",
          content: "It reads arXiv paper metadata, summarizes the selected papers, and prepares a reviewable report.",
          createdAt: "2026-05-09T00:04:00.000Z",
          metadata: { status: "done" },
        },
      ],
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "chat:msg-user",
          kind: "chat",
          title: "You asked Pi",
          detail: "What does the current workflow script do?",
          badges: expect.arrayContaining(["Workflow Chat", "User request"]),
        }),
        expect.objectContaining({
          id: "chat:msg-assistant",
          kind: "chat",
          title: "Pi answered",
          detail: "It reads arXiv paper metadata, summarizes the selected papers, and prepares a reviewable report.",
          badges: expect.arrayContaining(["Workflow Chat", "Pi response", "Done"]),
        }),
      ]),
    );
    expect(cards.some((card) => card.id === "chat:msg-thinking")).toBe(false);
  });

  it("keeps an active placeholder for streaming Workflow Chat responses", () => {
    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      chatMessages: [
        {
          id: "msg-assistant-streaming",
          threadId: "chat-thread-1",
          role: "assistant",
          content: "",
          createdAt: "2026-05-09T00:04:00.000Z",
          metadata: { status: "streaming" },
        },
      ],
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "chat:msg-assistant-streaming",
          kind: "chat",
          tone: "active",
          title: "Pi answered",
          detail: "Pi is responding in Workflow Chat.",
          badges: expect.arrayContaining(["Streaming"]),
        }),
      ]),
    );
  });

  it("surfaces discovery state as a compact transcript card", () => {
    const cards = workflowThreadTranscriptCards({
      thread: {
        ...thread,
        discoveryQuestions: [
          {
            id: "question-1",
            category: "scope",
            answer: { choiceId: "short-list", answeredAt: "now" },
            provider: "ambient",
            activityEvents: [{ id: "activity-1", kind: "question_generated", status: "completed", label: "Question generated", createdAt: "now" }],
          },
          { id: "question-2", category: "data_sources" },
        ],
      },
      artifact,
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "discovery:thread-1",
          kind: "discovery",
          tone: "warning",
          title: "Discovery in progress",
          badges: expect.arrayContaining(["Discovery", "1/2 answered", "1 activity event", "Ambient", "Scope", "Data Sources"]),
          panelActions: [{ id: "discovery", label: "Open discovery", panel: "discovery" }],
        }),
      ]),
    );
  });

  it("surfaces compiler progress as a workflow transcript card", () => {
    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      now: Date.parse("2026-05-09T12:00:05.000Z"),
      compileActive: true,
      compileProgress: [
        compileProgress({
          phase: "prompt",
          status: "completed",
          message: "Built the compiler prompt.",
          current: 2,
          metrics: { promptChars: 25_618, stablePrefixTokens: 4_166 },
        }),
        compileProgress({
          phase: "model",
          status: "running",
          message: "Receiving the Pi compiler response.",
          current: 3,
          createdAt: "2026-05-09T12:00:00.000Z",
          metrics: { rawResponseChars: 3_025, thinkingChars: 2_643, idleTimeoutMs: 120_000, timeoutMode: "idle_watchdog" },
        }),
      ],
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "compile:thread-1:compile",
          kind: "compile",
          tone: "active",
          title: "Compiling preview",
          detail: "Receiving the Pi compiler response. Last stream update 5s ago; idle timeout is 2m.",
          badges: expect.arrayContaining(["Compile", "43%", "Response: 3,025 chars", "Thinking: 2,643 chars", "No stream update: 5s / 2m"]),
          panelActions: [
            { id: "discovery", label: "Open discovery", panel: "discovery" },
            { id: "source", label: "Inspect source", panel: "source" },
            { id: "manifest", label: "Inspect manifest", panel: "manifest" },
          ],
        }),
      ]),
    );
  });

  it("shows Workflow Chat Pi stream progress as a workflow transcript card", () => {
    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      planEditActivity: {
        threadId: "chat-thread-1",
        kind: "stream",
        status: "running",
        outputChars: 2048,
        thinkingChars: 512,
        idleElapsedMs: 3000,
        idleTimeoutMs: 120000,
      },
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "plan-edit-progress:thread-1",
          kind: "chat",
          tone: "active",
          title: "Workflow Chat progress",
          detail: "Pi is working through this workflow request.",
          badges: expect.arrayContaining(["Workflow Chat", "Streaming", "2,048 output chars", "512 thinking chars", "Idle 3s / 2m timeout"]),
        }),
      ]),
    );
  });

  it("streams exploration progress into the workflow transcript", () => {
    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      explorationProgress: {
        workflowThreadId: "thread-1",
        explorationId: "explore-1",
        graphNodeId: "agent-exploration",
        eventType: "exploration.provider.progress",
        phase: "provider",
        status: "running",
        message: "Pi is probing browser search and connector options.",
        turn: 2,
        outputChars: 4096,
        thinkingChars: 1024,
        idleElapsedMs: 4500,
        idleTimeoutMs: 120000,
        updatedAt: "2026-05-09T00:04:00.000Z",
      },
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "exploration-progress:thread-1:explore-1",
          kind: "exploration",
          tone: "active",
          title: "Exploration running",
          detail: "Pi is probing browser search and connector options.",
          badges: expect.arrayContaining([
            "Exploration",
            "Provider",
            "turn 2",
            "output 4,096 chars",
            "thinking 1,024 chars",
            "idle 5s / 2m",
            "Node agent-exploration",
          ]),
          timestamp: "2026-05-09T00:04:00.000Z",
          panelActions: [{ id: "exploration", label: "Open exploration", panel: "exploration" }],
        }),
      ]),
    );
  });

  it("keeps retained exploration traces visible in the workflow transcript", () => {
    const traces: WorkflowExplorationTraceSummary[] = [
      {
        id: "trace-1",
        workflowThreadId: "thread-1",
        explorationId: "explore-1",
        explorationNodeId: "agent-exploration",
        request: "Find recent papers on arxiv.",
        model: "zai-org/GLM-5.1-FP8",
        capabilityManifest: {},
        observations: [{ id: "obs-1", action: "call_tool", name: "browser_search", status: "succeeded", outputPreview: "arxiv search results" }],
        events: [],
        distillation: {
          summary: "Browser search can find arxiv result pages and source text for deterministic compile.",
          observedCalls: [{ kind: "tool", name: "browser_search", status: "succeeded" }],
          requiredGrants: ["browser network read"],
          dataShapes: ["paper title, author, abstract, URL"],
          unresolvedQuestions: [],
          successfulPatterns: ["Search arxiv first, then read selected abstracts."],
          deterministicSourceStrategy: "Use browser_search followed by bounded browser_content reads.",
          recommendedGraph: { summary: "request -> browser search -> paper reads -> summary output", nodes: [], edges: [] },
        },
        createdAt: "2026-05-09T00:05:00.000Z",
      },
    ];

    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      explorationTraces: traces,
      now: Date.parse("2026-05-09T00:06:00.000Z"),
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "exploration-trace:thread-1:trace-1",
          kind: "exploration",
          tone: "success",
          title: "Exploration trace ready",
          detail: "Browser search can find arxiv result pages and source text for deterministic compile.",
          badges: expect.arrayContaining([
            "Exploration",
            "Created 1m ago",
            "Model zai-org/GLM-5.1-FP8",
            "1 observation",
            "request -> browser search -> paper reads -> summary output",
            "Grant: browser network read",
            "paper title, author, abstract, URL",
          ]),
          panelActions: [
            { id: "exploration", label: "Open exploration", panel: "exploration" },
            { id: "source", label: "Inspect source", panel: "source" },
          ],
        }),
      ]),
    );
  });

  it("surfaces workflow-native read tools as compact transcript cards", () => {
    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      chatMessages: [
        workflowNativeToolMessage("workflow_current_context", {
          counts: { versions: 2, runs: 3, graphNodes: 6, unansweredDiscoveryQuestions: 1 },
        }),
        workflowNativeToolMessage("workflow_get_source", {
          sourcePath: "/tmp/workflow/main.ts",
          chars: 12000,
          returnedChars: 4000,
          truncated: true,
        }),
        workflowNativeToolMessage("workflow_capability_search", {
          results: [{ id: "plugin:arxiv_search", label: "arXiv paper search" }],
        }),
      ],
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "workflow-action:tool-workflow_current_context",
          kind: "action",
          title: "Pi inspected workflow context",
          badges: expect.arrayContaining(["Workflow action", "Inspect context", "Done", "2 versions", "3 runs", "6 graph nodes", "1 open question"]),
          panelActions: [
            { id: "discovery", label: "Open discovery", panel: "discovery" },
            { id: "versions", label: "Inspect versions", panel: "versions" },
          ],
        }),
        expect.objectContaining({
          id: "workflow-action:tool-workflow_get_source",
          title: "Pi inspected workflow source",
          detail: "/tmp/workflow/main.ts",
          tone: "warning",
          badges: expect.arrayContaining(["Inspect source", "4,000 / 12,000 chars", "Preview truncated"]),
          panelActions: [{ id: "source", label: "Inspect source", panel: "source" }],
        }),
        expect.objectContaining({
          id: "workflow-action:tool-workflow_capability_search",
          title: "Pi searched workflow capabilities",
          tone: "success",
          badges: expect.arrayContaining(["Search capabilities", "1 result"]),
          panelActions: [
            { id: "permissions", label: "Inspect permissions", panel: "permissions" },
            { id: "exploration", label: "Open exploration", panel: "exploration" },
          ],
        }),
      ]),
    );
  });

  it("keeps workflow revision validation tied to the proposed revision in chat", () => {
    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      chatMessages: [
        workflowNativeToolMessage("workflow_validate_revision", {
          valid: true,
          errors: [],
          warnings: ["Stored revision records retain diffs only."],
          checks: [
            { name: "manifest shape", status: "passed", detail: "Manifest declares 1 tool." },
            { name: "stored revision payload", status: "warning", detail: "Stored revision records retain diffs, not full proposed source." },
          ],
          revision: { id: "revision-1", workflowThreadId: "thread-1" },
        }),
      ],
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "workflow-action:tool-workflow_validate_revision",
          kind: "action",
          tone: "success",
          title: "Workflow revision validation passed",
          badges: expect.arrayContaining(["Workflow action", "Validate revision", "Revision revision-1", "0 errors", "1 warning"]),
          revisionId: "revision-1",
          detailItems: expect.arrayContaining([
            "Passed manifest shape: Manifest declares 1 tool.",
            "Warning stored revision payload: Stored revision records retain diffs, not full proposed source.",
          ]),
          panelActions: [
            { id: "versions", label: "Inspect revisions", panel: "versions" },
            { id: "diagram", label: "Inspect diagram", panel: "diagram" },
          ],
        }),
      ]),
    );
  });

  it("renders workflow-native proposed and explained diffs directly in chat", () => {
    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      chatMessages: [
        workflowNativeToolMessage("workflow_propose_revision", {
          created: true,
          note: "Proposed a review gate before writing output.",
          revision,
          validation: {
            checks: [{ name: "graph references", status: "passed", detail: "Graph validates with 2 nodes." }],
          },
        }),
        workflowNativeToolMessage("workflow_explain_revision_diff", {
          graphSummary: "1 node added",
          sourceSummary: "1 line added, 1 file changed",
          bullets: ["1 node added", "1 line added, 1 file changed"],
          graphDiff: revision.graphDiff,
          sourceDiff: revision.sourceDiff,
        }),
      ],
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "workflow-action:tool-workflow_propose_revision",
          kind: "action",
          tone: "warning",
          title: "Workflow revision proposed",
          detail: "Proposed a review gate before writing output.",
          revisionId: "revision-1",
          revisionCanApply: true,
          revisionCanReject: true,
          detailItems: expect.arrayContaining(["Passed graph references: Graph validates with 2 nodes.", "Added node: Review (Review Gate)."]),
          sourcePreviewLines: expect.arrayContaining([{ kind: "added", text: "+review()" }]),
        }),
        expect.objectContaining({
          id: "workflow-action:tool-workflow_explain_revision_diff",
          kind: "action",
          title: "Pi explained workflow revision diff",
          detailItems: expect.arrayContaining(["1 node added", "1 line added, 1 file changed", "Added node: Review (Review Gate)."]),
          sourcePreviewLines: expect.arrayContaining([{ kind: "added", text: "+review()" }]),
        }),
      ]),
    );
  });

  it("records apply and reject outcomes as workflow chat revision cards", () => {
    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      chatMessages: [
        {
          id: "msg-revision-decision",
          threadId: "chat-thread-1",
          role: "system",
          content: "Applied workflow revision revision-1. The active workflow now points at version 2.",
          createdAt: "2026-05-09T00:05:00.000Z",
          metadata: {
            workflowThreadId: "thread-1",
            workflowMode: "plan-edit",
            kind: "workflow_revision_decision",
            status: "done",
            revisionId: "revision-1",
            decision: "applied",
            version: 2,
          },
        },
      ],
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "revision-decision:msg-revision-decision",
          kind: "revision",
          tone: "success",
          title: "Workflow revision applied",
          detail: "Applied workflow revision revision-1. The active workflow now points at version 2.",
          badges: expect.arrayContaining(["Workflow Chat", "Revision revision-1", "Applied", "Version 2"]),
          panelActions: [
            { id: "versions", label: "Inspect versions", panel: "versions" },
            { id: "diagram", label: "Inspect diagram", panel: "diagram" },
          ],
        }),
      ]),
    );
  });

  it("surfaces workflow-native run-preview results as transcript action cards", () => {
    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      chatMessages: [
        workflowNativeToolMessage("workflow_run_preview", {
          previewed: true,
          workflowThreadId: "thread-1",
          run: {
            id: "run-preview-1",
            artifactId: "artifact-1",
            status: "succeeded",
            startedAt: "2026-05-09T00:05:00.000Z",
            updatedAt: "2026-05-09T00:05:30.000Z",
          },
          runLimits: { idleTimeoutMs: 120000, maxRunMs: null },
          trace: { eventCount: 3, modelCallCount: 1, checkpointCount: 1, approvalCount: 0 },
          audit: { id: "audit-1" },
          note: "Dry-run preview completed with run run-preview-1.",
        }),
      ],
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "workflow-action:tool-workflow_run_preview",
          kind: "action",
          tone: "success",
          title: "Preview run completed",
          detail: "Dry-run preview completed with run run-preview-1.",
          badges: expect.arrayContaining([
            "Workflow action",
            "Run preview",
            "Done",
            "Succeeded",
            "Run run-preview-1",
            "3 events",
            "1 model call",
            "1 checkpoint",
            "Idle timeout 2m",
            "No total cap",
            "Full Access audited",
          ]),
          panelActions: [
            { id: "run_console", label: "Open run console", panel: "run_console" },
            { id: "outputs", label: "Inspect outputs", panel: "outputs" },
            { id: "permissions", label: "Inspect audit", panel: "permissions" },
          ],
        }),
      ]),
    );
  });

  it("surfaces workflow-native blocked run and run-setting proposal cards", () => {
    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      chatMessages: [
        workflowNativeToolMessage("workflow_run_version", {
          ran: false,
          workflowThreadId: "thread-1",
          reason: "Approve this workflow before running it, or pass allowUnapproved true for an audited one-off run.",
        }),
        workflowNativeToolMessage("workflow_update_run_settings", {
          updated: false,
          action: "propose_persistent",
          revision: { id: "revision-limits-1" },
          runLimits: { idleTimeoutMs: 300000, maxRunMs: 900000 },
          note: "Persistent run settings revision proposed for review. It was not applied.",
        }),
      ],
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "workflow-action:tool-workflow_run_version",
          kind: "action",
          tone: "danger",
          title: "Workflow run not started",
          detail: "Approve this workflow before running it, or pass allowUnapproved true for an audited one-off run.",
          badges: expect.arrayContaining(["Workflow action", "Run workflow", "Done"]),
        }),
        expect.objectContaining({
          id: "workflow-action:tool-workflow_update_run_settings",
          kind: "action",
          tone: "warning",
          title: "Run settings revision proposed",
          detail: "Persistent run settings revision proposed for review. It was not applied.",
          badges: expect.arrayContaining(["Workflow action", "Run settings", "Propose Persistent", "Revision revision-limits-1", "Idle timeout 5m", "Total cap 15m"]),
          panelActions: [
            { id: "manifest", label: "Inspect limits", panel: "manifest" },
            { id: "versions", label: "Inspect version", panel: "versions" },
          ],
        }),
      ]),
    );
  });

  it("surfaces workflow revision proposals as actionable transcript cards", () => {
    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      revisions: [revision],
      now: Date.parse("2026-05-09T00:06:00.000Z"),
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "revision:revision-1",
          kind: "revision",
          tone: "warning",
          title: "Proposed revision",
          detail: "Add a review gate before writing the report.",
          badges: expect.arrayContaining(["Updated 2m ago", "1 node added", "1 line added, 1 file changed"]),
          revisionId: "revision-1",
          revisionCanApply: true,
          revisionCanReject: true,
          detailItems: expect.arrayContaining(["Added node: Review (Review Gate)."]),
          sourcePreviewLines: expect.arrayContaining([{ kind: "added", text: "+review()" }]),
          panelActions: [
            { id: "diagram", label: "Inspect diagram", panel: "diagram" },
            { id: "source", label: "Inspect source", panel: "source" },
          ],
        }),
      ]),
    );
  });

  it("labels unmapped latest events instead of hiding the missing graph context", () => {
    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      detail: {
        ...detail,
        events: [
          ...detail.events,
          {
            id: "event-3",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 3,
            type: "workflow.failed",
            message: "Timed out",
            createdAt: "2026-05-09T00:02:00.000Z",
          },
        ],
      },
    });

    expect(cards.at(-1)).toMatchObject({
      id: "event:event-3",
      tone: "danger",
      badges: expect.arrayContaining(["Unmapped event"]),
    });
  });

  it("keeps runtime touchpoints visible instead of only showing the latest event", () => {
    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      detail: {
        ...detail,
        events: [
          ...detail.events,
          {
            id: "event-3",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 3,
            type: "workflow.status_update",
            message: "Collected 25 email summaries; starting synthesis.",
            graphNodeId: "collect",
            createdAt: "2026-05-09T00:00:45.000Z",
          },
          {
            id: "event-4",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 4,
            type: "batch.item",
            message: "collect",
            graphNodeId: "collect",
            createdAt: "2026-05-09T00:00:46.000Z",
            data: { completed: 25, total: 100 },
          },
          {
            id: "event-5",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 5,
            type: "workflow.input.required",
            message: "Which report format should be used?",
            graphNodeId: "format-review",
            createdAt: "2026-05-09T00:01:00.000Z",
            data: { id: "input-1", prompt: "Which report format should be used?" },
          },
        ],
      },
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "event:event-3",
          title: "Status update",
          detail: "Collected 25 email summaries; starting synthesis.",
          badges: expect.arrayContaining(["Status", "Node collect"]),
        }),
        expect.objectContaining({
          id: "event:event-5",
          title: "Workflow needs input",
          detail: "Which report format should be used?",
          tone: "warning",
          badges: expect.arrayContaining(["Needs input", "Node format-review"]),
          panelActions: [
            { id: "runtime_input", label: "Answer input", panel: "runtime_input" },
            { id: "run_console", label: "Open run console", panel: "run_console" },
          ],
        }),
      ]),
    );
    expect(cards.some((card) => card.id === "event:event-4")).toBe(false);
  });

  it("turns provider errors and recovery events into transcript touchpoints", () => {
    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      detail: {
        ...detail,
        run: { ...detail.run, status: "failed", error: "Provider failed." },
        events: [
          ...detail.events,
          {
            id: "event-3",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 3,
            type: "ambient.call.error",
            message: "gmail.categorize_report",
            graphNodeId: "synthesize",
            createdAt: "2026-05-09T00:01:00.000Z",
            data: { attempt: 2, retryable: true, willRetry: false, error: "429 Upstream request failed" },
          },
          {
            id: "event-4",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 4,
            type: "workflow.recovery.start",
            message: "retry_step",
            graphNodeId: "synthesize",
            createdAt: "2026-05-09T00:02:00.000Z",
          },
        ],
      },
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "event:event-3",
          title: "Ambient call error",
          tone: "danger",
          badges: expect.arrayContaining(["Provider", "Node synthesize", "attempt 2", "final attempt"]),
        }),
        expect.objectContaining({
          id: "event:event-4",
          title: "Recovery Start",
          badges: expect.arrayContaining(["Recovery", "Node synthesize"]),
        }),
      ]),
    );
  });

  it("keeps connector readiness preflight blockers visible in the transcript", () => {
    const cards = workflowThreadTranscriptCards({
      thread,
      artifact,
      detail: {
        ...detail,
        run: { ...detail.run, status: "failed", error: "Workflow connector is not available: google.gmail (not_configured)" },
        events: [
          ...detail.events,
          {
            id: "event-3",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 3,
            type: "workflow.connector-preflight",
            message: "Blocked workflow connector readiness.",
            createdAt: "2026-05-09T00:01:00.000Z",
            data: {
              status: "blocked",
              error: "Workflow connector is not available: google.gmail (not_configured)",
              connectors: [{ connectorId: "google.gmail", authStatus: "not_configured", availableAccounts: [] }],
            },
          },
        ],
      },
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "event:event-3",
          title: "Connector preflight",
          detail: "Blocked workflow connector readiness.",
          tone: "danger",
          badges: expect.arrayContaining(["Connectors"]),
        }),
      ]),
    );
  });
});

function workflowNativeToolMessage(toolName: WorkflowNativeToolName, data: Record<string, unknown>, status: "done" | "running" | "error" = "done"): ChatMessage {
  return {
    id: `tool-${toolName}`,
    threadId: "chat-thread-1",
    role: "tool",
    createdAt: "2026-05-09T00:05:30.000Z",
    metadata: { status, toolName },
    content: `${toolName} ${status === "done" ? "completed" : status}\n\nInput\n{}\n\nResult\n${toolSummary(toolName, data)}\n\n${JSON.stringify(data, null, 2)}`,
  };
}

function compileProgress(input: Partial<WorkflowCompileProgress> & Pick<WorkflowCompileProgress, "phase" | "status" | "message" | "current">): WorkflowCompileProgress {
  return {
    compileId: input.compileId ?? "compile",
    phase: input.phase,
    status: input.status,
    message: input.message,
    current: input.current,
    total: input.total ?? 7,
    createdAt: input.createdAt ?? "2026-05-09T12:00:00.000Z",
    detail: input.detail,
    error: input.error,
    metrics: input.metrics,
  };
}

function toolSummary(toolName: WorkflowNativeToolName, data: Record<string, unknown>): string {
  if (toolName === "workflow_run_preview") return `Workflow run preview completed: ${(data.run as { id?: string } | undefined)?.id ?? "unknown"}.`;
  if (toolName === "workflow_run_version") return data.ran ? `Workflow version run completed: ${(data.run as { id?: string } | undefined)?.id ?? "unknown"}.` : "Workflow version run was not started: see details";
  if (toolName === "workflow_update_run_settings") return "Workflow run settings completed.";
  return `${toolName} completed.`;
}
