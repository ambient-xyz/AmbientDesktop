import { describe, expect, it } from "vitest";
import type { WorkflowArtifactSummary, WorkflowRunDetail } from "../../shared/types";
import { workflowRunOutputCards } from "./workflowRunOutputUiModel";

const artifact: WorkflowArtifactSummary = {
  id: "artifact-1",
  title: "Output workflow",
  status: "approved",
  manifest: {
    tools: [],
    pluginCapabilities: [],
    ambientCliCapabilities: [],
    mutationPolicy: "read_only",
    maxToolCalls: 1,
    maxModelCalls: 1,
    maxConnectorCalls: 0,
    connectors: [],
  },
  spec: {
    goal: "Return a report.",
    summary: "Fixture",
  },
  sourcePath: "/tmp/main.ts",
  statePath: "/tmp/state.json",
  createdAt: "2026-05-09T00:00:00.000Z",
  updatedAt: "2026-05-09T00:00:00.000Z",
};

function detail(patch: Partial<WorkflowRunDetail> = {}): WorkflowRunDetail {
  return {
    artifact,
    run: {
      id: "run-1",
      artifactId: artifact.id,
      status: "succeeded",
      startedAt: "2026-05-09T00:00:00.000Z",
      updatedAt: "2026-05-09T00:00:30.000Z",
      reportPath: "/tmp/workflow-report.md",
    },
    events: [],
    modelCalls: [],
    checkpoints: [],
    approvals: [],
    auditReport: "",
    ...patch,
  };
}

describe("workflowRunOutputUiModel", () => {
  it("renders report paths and checkpoint markdown as output cards", () => {
    const cards = workflowRunOutputCards(
      detail({
        checkpoints: [
          {
            key: "final_output",
            updatedAt: "2026-05-09T00:00:20.000Z",
            valuePreview: JSON.stringify({
              markdown: "# Couples picks\n\n- Film A\n- Show B",
              artifactPath: "/tmp/couples-picks.md",
            }),
          },
        ],
      }),
    );

    expect(cards[0]).toMatchObject({
      id: "report",
      kind: "report",
      label: "Run report",
      format: "markdown",
      artifactPath: "/tmp/workflow-report.md",
    });
    expect(cards[1]).toMatchObject({
      kind: "checkpoint",
      label: "Checkpoint final_output",
      format: "markdown",
      artifactPath: "/tmp/couples-picks.md",
      preview: "# Couples picks\n\n- Film A\n- Show B",
    });
  });

  it("turns structured output events into readable previews instead of one-line JSON", () => {
    const cards = workflowRunOutputCards(
      detail({
        run: {
          id: "run-1",
          artifactId: artifact.id,
          status: "succeeded",
          startedAt: "2026-05-09T00:00:00.000Z",
          updatedAt: "2026-05-09T00:00:30.000Z",
        },
        events: [
          {
            id: "event-1",
            runId: "run-1",
            artifactId: artifact.id,
            seq: 1,
            type: "workflow.output.ready",
            createdAt: "2026-05-09T00:00:10.000Z",
            message: "Prepared labeled file report.",
            data: {
              output: [
                { title: "invoice.pdf", summary: "Finance document" },
                { title: "photo.jpg", summary: "Image asset" },
              ],
            },
          },
        ],
      }),
    );

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      kind: "event",
      label: "Output event",
      format: "text",
      preview: "- invoice.pdf: Finance document\n- photo.jpg: Image asset",
    });
    expect(cards[0]?.preview).not.toContain("\"output\"");
  });

  it("prioritizes artifact-specific HTML content when an output also has a summary", () => {
    const cards = workflowRunOutputCards(
      detail({
        run: {
          id: "run-1",
          artifactId: artifact.id,
          status: "succeeded",
          startedAt: "2026-05-09T00:00:00.000Z",
          updatedAt: "2026-05-09T00:00:30.000Z",
        },
        events: [
          {
            id: "event-1",
            runId: "run-1",
            artifactId: artifact.id,
            seq: 1,
            type: "workflow.output.ready",
            createdAt: "2026-05-09T00:00:10.000Z",
            message: "Classification report ready.",
            graphNodeId: "output",
            data: {
              artifactPath: "reports/classification-final.html",
              summary: "Three files were classified.",
              html: "<!doctype html><html><body><h1>File classifications</h1></body></html>",
            },
          },
        ],
      }),
    );

    expect(cards[0]).toMatchObject({
      kind: "event",
      label: "Output event",
      format: "html",
      artifactPath: "reports/classification-final.html",
      preview: "<!doctype html><html><body><h1>File classifications</h1></body></html>",
    });
  });

  it("recognizes compact HTML fragments as HTML output previews", () => {
    const cards = workflowRunOutputCards(
      detail({
        run: {
          id: "run-1",
          artifactId: artifact.id,
          status: "succeeded",
          startedAt: "2026-05-09T00:00:00.000Z",
          updatedAt: "2026-05-09T00:00:30.000Z",
        },
        events: [
          {
            id: "event-1",
            runId: "run-1",
            artifactId: artifact.id,
            seq: 1,
            type: "workflow.output.ready",
            createdAt: "2026-05-09T00:00:10.000Z",
            message: "Scheduled local report ready.",
            graphNodeId: "output",
            data: {
              artifactPath: "reports/scheduled-local-report.html",
              summary: "Two local files were classified.",
              html: "<ul><li><b>meeting-notes.md</b> - Planning notes</li></ul>",
            },
          },
        ],
      }),
    );

    expect(cards[0]).toMatchObject({
      kind: "event",
      label: "Output event",
      format: "html",
      artifactPath: "reports/scheduled-local-report.html",
      preview: "<ul><li><b>meeting-notes.md</b> - Planning notes</li></ul>",
    });
  });

  it("keeps markdown previews readable when the retained artifact path is HTML", () => {
    const cards = workflowRunOutputCards(
      detail({
        checkpoints: [
          {
            key: "final_output",
            updatedAt: "2026-05-09T00:00:20.000Z",
            valuePreview: JSON.stringify({
              artifactPath: "reports/classification-final.html",
              markdown: "# File classifications\n\n- notes.md: Planning notes\n- invoice.pdf: Finance document",
            }),
          },
        ],
      }),
    );

    expect(cards[1]).toMatchObject({
      kind: "checkpoint",
      label: "Checkpoint final_output",
      format: "markdown",
      artifactPath: "reports/classification-final.html",
      preview: "# File classifications\n\n- notes.md: Planning notes\n- invoice.pdf: Finance document",
    });
  });

  it("summarizes structured object outputs instead of falling back to raw JSON", () => {
    const cards = workflowRunOutputCards(
      detail({
        run: {
          id: "run-1",
          artifactId: artifact.id,
          status: "succeeded",
          startedAt: "2026-05-09T00:00:00.000Z",
          updatedAt: "2026-05-09T00:00:30.000Z",
        },
        events: [
          {
            id: "event-1",
            runId: "run-1",
            artifactId: artifact.id,
            seq: 1,
            type: "workflow.output.ready",
            createdAt: "2026-05-09T00:00:10.000Z",
            message: "Classification report ready.",
            data: {
              result: {
                totals: { files: 2, categories: 2 },
                classifications: [
                  { file: "notes.md", classification: "Planning notes", confidence: 0.91 },
                  { file: "invoice.pdf", classification: "Finance document", confidence: 0.87 },
                ],
                saved: true,
              },
            },
          },
        ],
      }),
    );

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      kind: "event",
      label: "Output event",
      format: "text",
      metadata: expect.arrayContaining(["structured summary"]),
    });
    expect(cards[0]?.preview).toContain("- Totals: Files: 2, Categories: 2");
    expect(cards[0]?.preview).toContain("- notes.md: Planning notes");
    expect(cards[0]?.preview).not.toContain("\"classifications\"");
  });

  it("includes model outputs when the model task is output-shaped", () => {
    const cards = workflowRunOutputCards(
      detail({
        run: {
          id: "run-1",
          artifactId: artifact.id,
          status: "succeeded",
          startedAt: "2026-05-09T00:00:00.000Z",
          updatedAt: "2026-05-09T00:00:30.000Z",
        },
        modelCalls: [
          {
            id: "call-1",
            artifactId: artifact.id,
            runId: "run-1",
            task: "summarize.output",
            status: "succeeded",
            input: { topic: "events" },
            output: { summary: "Three family-friendly shows were found.", confidence: 0.88 },
            startedAt: "2026-05-09T00:00:10.000Z",
            completedAt: "2026-05-09T00:00:12.000Z",
            latencyMs: 2000,
          },
        ],
      }),
    );

    expect(cards[0]).toMatchObject({
      kind: "model",
      label: "Model output: summarize.output",
      format: "text",
      preview: "Three family-friendly shows were found.",
    });
  });

  it("promotes source-evidence browser screenshots into image output cards", () => {
    const cards = workflowRunOutputCards(
      detail({
        run: {
          id: "run-1",
          artifactId: artifact.id,
          status: "succeeded",
          startedAt: "2026-05-09T00:00:00.000Z",
          updatedAt: "2026-05-09T00:00:30.000Z",
        },
        modelCalls: [
          {
            id: "call-1",
            artifactId: artifact.id,
            runId: "run-1",
            task: "summarize.output",
            status: "succeeded",
            input: { topic: "arxiv" },
            output: {
              summary: "Recent papers were summarized from browser evidence.",
              sourceEvidence: {
                sources: [
                  {
                    title: "arXiv search",
                    url: "https://arxiv.org/search/",
                    screenshot: {
                      artifactPath: ".ambient-codex/browser/screenshots/browser-123.png",
                      width: 1280,
                      height: 720,
                      bytes: 2048,
                    },
                  },
                ],
              },
            },
            startedAt: "2026-05-09T00:00:10.000Z",
            completedAt: "2026-05-09T00:00:12.000Z",
            latencyMs: 2000,
          },
        ],
      }),
    );

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "model",
          label: "Source evidence screenshot",
          format: "image",
          artifactPath: ".ambient-codex/browser/screenshots/browser-123.png",
          metadata: expect.arrayContaining(["screenshot", "source evidence"]),
        }),
      ]),
    );
  });

  it("surfaces screenshot artifacts from non-output status events without promoting progress telemetry", () => {
    const cards = workflowRunOutputCards(
      detail({
        run: {
          id: "run-1",
          artifactId: artifact.id,
          status: "succeeded",
          startedAt: "2026-05-09T00:00:00.000Z",
          updatedAt: "2026-05-09T00:00:30.000Z",
        },
        events: [
          {
            id: "event-progress",
            runId: "run-1",
            artifactId: artifact.id,
            seq: 1,
            type: "ambient.call.progress",
            createdAt: "2026-05-09T00:00:10.000Z",
            data: { outputChars: 1200 },
          },
          {
            id: "event-status",
            runId: "run-1",
            artifactId: artifact.id,
            seq: 2,
            type: "workflow.status_update",
            graphNodeId: "source",
            createdAt: "2026-05-09T00:00:12.000Z",
            message: "Browser evidence captured.",
            data: {
              screenshotArtifactPath: ".ambient-codex/browser/screenshots/browser-status.png",
              screenshotWidth: 1200,
              screenshotHeight: 900,
            },
          },
        ],
      }),
    );

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      kind: "event",
      label: "Browser screenshot",
      format: "image",
      artifactPath: ".ambient-codex/browser/screenshots/browser-status.png",
      metadata: expect.arrayContaining(["1200x900"]),
    });
  });

  it("labels browser-intervention screenshots as challenge evidence", () => {
    const cards = workflowRunOutputCards(
      detail({
        run: {
          id: "run-1",
          artifactId: artifact.id,
          status: "succeeded",
          startedAt: "2026-05-09T00:00:00.000Z",
          updatedAt: "2026-05-09T00:00:30.000Z",
        },
        events: [
          {
            id: "event-input",
            runId: "run-1",
            artifactId: artifact.id,
            seq: 1,
            type: "workflow.input.required",
            graphNodeId: "browser-intervention",
            createdAt: "2026-05-09T00:00:12.000Z",
            message: "Browser needs user action.",
            data: {
              browserIntervention: {
                kind: "captcha",
                provider: "google",
                preview: {
                  textExcerpt: "Google is asking for unusual-traffic verification.",
                  screenshotArtifactPath: ".ambient-codex/browser/screenshots/google-sorry.png",
                  screenshotWidth: 1280,
                  screenshotHeight: 900,
                  screenshotBytes: 8192,
                },
              },
            },
          },
        ],
      }),
    );

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      kind: "event",
      label: "Browser challenge screenshot",
      format: "image",
      artifactPath: ".ambient-codex/browser/screenshots/google-sorry.png",
      metadata: expect.arrayContaining(["browser challenge", "1280x900"]),
    });
  });

  it("keeps streaming progress counters out of output cards", () => {
    const cards = workflowRunOutputCards(
      detail({
        run: {
          id: "run-1",
          artifactId: artifact.id,
          status: "succeeded",
          startedAt: "2026-05-09T00:00:00.000Z",
          updatedAt: "2026-05-09T00:00:30.000Z",
        },
        events: [
          {
            id: "event-progress",
            runId: "run-1",
            artifactId: artifact.id,
            seq: 1,
            type: "ambient.call.progress",
            graphNodeId: "final-report",
            createdAt: "2026-05-09T00:00:10.000Z",
            message: "Streaming",
            data: { outputChars: 4608, thinkingChars: 1200, providerStage: "stream" },
          },
          {
            id: "event-output",
            runId: "run-1",
            artifactId: artifact.id,
            seq: 2,
            type: "workflow.output.ready",
            graphNodeId: "output",
            createdAt: "2026-05-09T00:00:20.000Z",
            message: "Report ready.",
            data: { artifactPath: "reports/final.html", html: "<h1>Final report</h1>" },
          },
        ],
      }),
    );

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: "event:event-output",
      kind: "event",
      label: "Output event",
      artifactPath: "reports/final.html",
    });
  });
});
