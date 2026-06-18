import { describe, expect, it } from "vitest";
import { workflowGraphNodeReviewModel } from "./workflowGraphNodeReviewUiModel";
import type { WorkflowGraphNode, WorkflowManifest } from "../../shared/workflowTypes";

const manifest: WorkflowManifest = {
  tools: ["ambient.responses", "file_read"],
  connectors: [
    {
      connectorId: "google.gmail",
      accountId: "primary",
      scopes: ["gmail.readonly"],
      operations: ["listMessages"],
      dataRetention: "redacted_audit",
    },
  ],
  mutationPolicy: "read_only",
  maxModelCalls: 2,
};

describe("workflowGraphNodeReviewUiModel", () => {
  it("reviews model-call requirements, source mappings, and retained model evidence", () => {
    const model = workflowGraphNodeReviewModel({
      node: node({
        id: "model",
        type: "model_call",
        label: "Classify messages",
        sourceRanges: [
          {
            kind: "ambient_call",
            start: 10,
            end: 60,
            startLine: 4,
            startColumn: 3,
            endLine: 4,
            endColumn: 53,
            snippet: "ambient.call({ task: 'classify', nodeId: 'model' })",
          },
        ],
      }),
      manifest,
      traceMode: "production",
      events: [{ id: "event-1", runId: "run-1", artifactId: "artifact-1", seq: 1, type: "ambient.call.end", graphNodeId: "model", createdAt: "now" }],
      modelCalls: [
        {
          id: "call-1",
          runId: "run-1",
          artifactId: "artifact-1",
          task: "classify",
          status: "succeeded",
          input: {},
          output: { ok: true },
          graphNodeId: "model",
          startedAt: "2026-05-05T00:00:00.000Z",
          completedAt: "2026-05-05T00:00:01.000Z",
          latencyMs: 1000,
        },
      ],
    });

    expect(model).toMatchObject({
      title: "Classify messages",
      typeLabel: "Model Call",
      badges: expect.arrayContaining(["Model Call", "Production traces", "Read Only", "1 events", "1 model calls"]),
      facts: expect.arrayContaining([
        expect.objectContaining({ label: "Model requirement", value: "Ambient call allowed", detail: "2 max model calls.", tone: "ready" }),
        expect.objectContaining({ label: "Trace retention", value: "Production trace, Essentials retained", tone: "ready" }),
        expect.objectContaining({ label: "Program mapping", value: "1 mapped range", tone: "ready" }),
        expect.objectContaining({ label: "Latest trace", value: "1 event, 1 model call", tone: "ready" }),
      ]),
      sourceMappings: [expect.objectContaining({ label: "Ambient Call lines 4-4", snippet: expect.stringContaining("ambient.call") })],
      actions: expect.arrayContaining([
        expect.objectContaining({ id: "open_source", label: "Open mapped program", targetSection: "source", tone: "ready" }),
        expect.objectContaining({ id: "open_audit", label: "Open audit evidence", targetSection: "audit", tone: "ready" }),
      ]),
    });
  });

  it("marks connector nodes blocked when graph connector ids are missing from the manifest", () => {
    const model = workflowGraphNodeReviewModel({
      node: node({ id: "gmail", type: "connector_call", label: "Read Gmail", connectorIds: ["google.gmail", "slack.messages"] }),
      manifest,
      traceMode: "debug",
    });

    expect(model.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Connector grants",
          value: "2 connectors",
          detail: "Missing grants: slack.messages",
          tone: "blocked",
        }),
        expect.objectContaining({ label: "Trace retention", value: "Debug trace, 30-day debug cleanup", tone: "review" }),
      ]),
    );
    expect(model.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "review_connector_grants",
          label: "Resolve connector grants",
          detail: "Missing manifest grants for slack.messages.",
          targetSection: "connectors",
          tone: "blocked",
        }),
      ]),
    );
  });

  it("shows connector retention policy for graph connector nodes", () => {
    const model = workflowGraphNodeReviewModel({
      node: node({ id: "gmail", type: "connector_call", label: "Read Gmail", connectorIds: ["google.gmail"] }),
      manifest,
      traceMode: "production",
    });

    expect(model.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Connector grants",
          value: "1 connector",
          detail: "google.gmail: redacted audit - only redacted summaries are retained",
          tone: "review",
        }),
      ]),
    );
  });

  it("describes deterministic-step tools and checkpoint trace evidence", () => {
    const model = workflowGraphNodeReviewModel({
      node: node({ id: "format", type: "deterministic_step", label: "Format report", toolNames: ["file_read"], retryPolicy: "Retry with retained checkpoint." }),
      manifest,
      checkpoints: [{ key: "reportRows", valuePreview: "[{\"id\":\"1\"}]", runId: "run-1" }],
    });

    expect(model.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Tool requirements", value: "1 tool", detail: "file_read", tone: "review" }),
        expect.objectContaining({ label: "Latest trace", detail: "1 workflow checkpoint available in the run detail.", tone: "ready" }),
        expect.objectContaining({ label: "Retry policy", value: "Recovery-aware", detail: "Retry with retained checkpoint." }),
      ]),
    );
  });

  it("offers a mutation-policy action for blocked mutation nodes", () => {
    const model = workflowGraphNodeReviewModel({
      node: node({ id: "write", type: "mutation", label: "Write report", reviewPolicy: "Stage file writes for approval." }),
      manifest,
    });

    expect(model.facts).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Mutation policy", value: "Read Only", tone: "blocked" })]));
    expect(model.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "review_mutation_policy",
          label: "Resolve mutation policy",
          targetSection: "mutation_policy",
          tone: "blocked",
        }),
      ]),
    );
  });
});

function node(input: Partial<WorkflowGraphNode> & Pick<WorkflowGraphNode, "id" | "type" | "label">): WorkflowGraphNode {
  return input;
}
