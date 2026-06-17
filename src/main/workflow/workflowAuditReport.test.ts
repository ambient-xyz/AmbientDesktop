import { describe, expect, it } from "vitest";
import { generateWorkflowAuditReport, hashWorkflowSource } from "./workflowAuditReport";

describe("generateWorkflowAuditReport", () => {
  it("summarizes workflow artifacts, events, and model calls", () => {
    const report = generateWorkflowAuditReport({
      artifact: {
        id: "local-health",
        title: "Local Health",
        status: "approved",
        manifest: {
          tools: ["bash", "ambient.responses", "ambient_cli"],
          ambientCliCapabilities: [
            {
              capabilityId: "pkg-youtube:tool:youtube_transcript",
              registryPluginId: "cli:pkg-youtube",
              packageId: "pkg-youtube",
              packageName: "youtube-transcript",
              command: "youtube_transcript",
            },
          ],
          mutationPolicy: "read_only",
          maxToolCalls: 10,
          maxModelCalls: 2,
        },
        spec: {
          goal: "Run tests and summarize failures.",
          successCriteria: ["Tests ran", "Report generated"],
        },
        sourcePath: ".ambient-codex/workflows/local-health/main.ts",
        statePath: ".ambient-codex/workflows/local-health/state.sqlite",
        createdAt: "2026-04-30T00:00:00.000Z",
        updatedAt: "2026-04-30T00:00:00.000Z",
      },
      run: {
        id: "run-1",
        artifactId: "local-health",
        status: "succeeded",
        startedAt: "2026-04-30T00:00:00.000Z",
        updatedAt: "2026-04-30T00:00:01.000Z",
        completedAt: "2026-04-30T00:00:01.000Z",
        reportPath: ".ambient-codex/workflows/local-health/reports/run-1.md",
      },
      events: [
        {
          id: "event-1",
          runId: "run-1",
          artifactId: "local-health",
          seq: 1,
          type: "step.start",
          createdAt: "2026-04-30T00:00:00.100Z",
          message: "test",
        },
        {
          id: "event-2",
          runId: "run-1",
          artifactId: "local-health",
          seq: 2,
          type: "desktop-tool.end",
          createdAt: "2026-04-30T00:00:00.500Z",
          message: "bash",
          data: { outputSummary: "ok" },
        },
      ],
      modelCalls: [
        {
          id: "call-1",
          runId: "run-1",
          artifactId: "local-health",
          task: "summarize.tests",
          status: "succeeded",
          input: { output: "ok" },
          output: { summary: "Tests passed" },
          model: "ambient-test",
          startedAt: "2026-04-30T00:00:00.500Z",
          completedAt: "2026-04-30T00:00:00.800Z",
          latencyMs: 300,
        },
      ],
      checkpoints: [
        {
          key: "lastFailure",
          updatedAt: "2026-04-30T00:00:00.900Z",
          runId: "run-1",
          valuePreview: '{"file":"src/app.ts"}',
        },
      ],
      approvals: [
        {
          id: "approval-1",
          status: "pending",
          createdAt: "2026-04-30T00:00:00.950Z",
          changeSetPreview: '{"kind":"file-edit","path":"src/app.ts"}',
        },
      ],
      sourceHash: hashWorkflowSource("export default async function run() {}"),
    });

    expect(report).toContain("# Local Health Audit Report");
    expect(report).toContain("- Tools: bash, ambient.responses, ambient_cli");
    expect(report).toContain("- Ambient CLI capabilities: youtube-transcript:youtube_transcript capability=pkg-youtube:tool:youtube_transcript plugin=cli:pkg-youtube");
    expect(report).toContain("- Source path: .ambient-codex/workflows/local-health/main.ts");
    expect(report).toContain("- Source sha256:");
    expect(report).toContain("- State path: .ambient-codex/workflows/local-health/state.sqlite");
    expect(report).toContain("## Checkpoints");
    expect(report).toContain('lastFailure (2026-04-30T00:00:00.900Z): {"file":"src/app.ts"}');
    expect(report).toContain("## Review Queue");
    expect(report).toContain('approval-1 - pending: {"kind":"file-edit","path":"src/app.ts"}');
    expect(report).toContain("1. 2026-04-30T00:00:00.100Z step.start - test");
    expect(report).toContain("desktop-tool.end - bash");
    expect(report).toContain("summarize.tests");
    expect(report).toContain("Tests passed");
  });

  it("states when no events or model calls were recorded", () => {
    const report = generateWorkflowAuditReport({
      artifact: {
        id: "empty",
        title: "Empty",
        status: "draft",
        manifest: { tools: [], mutationPolicy: "read_only" },
        spec: { goal: "Do nothing." },
        sourcePath: "main.ts",
        statePath: "state.json",
        createdAt: "2026-04-30T00:00:00.000Z",
        updatedAt: "2026-04-30T00:00:00.000Z",
      },
      run: {
        id: "run-1",
        artifactId: "empty",
        status: "created",
        startedAt: "2026-04-30T00:00:00.000Z",
        updatedAt: "2026-04-30T00:00:00.000Z",
      },
      events: [],
      modelCalls: [],
      checkpoints: [],
      approvals: [],
    });

    expect(report).toContain("No checkpoints were recorded.");
    expect(report).toContain("No review items were recorded.");
    expect(report).toContain("No workflow events were recorded.");
    expect(report).toContain("No Ambient model calls were recorded.");
  });

  it("summarizes retention, redaction, omission, and compaction proof", () => {
    const compacted = {
      retention: "compacted",
      compactedAt: "2026-05-05T00:00:00.000Z",
      reason: "workflow_trace_retention_expired",
    };
    const report = generateWorkflowAuditReport({
      artifact: {
        id: "gmail",
        title: "Gmail",
        status: "approved",
        manifest: {
          tools: ["ambient.responses"],
          mutationPolicy: "read_only",
          connectors: [
            { connectorId: "google.gmail", scopes: ["gmail.readonly"], operations: ["search"], dataRetention: "redacted_audit" },
            { connectorId: "workspace.inventory", scopes: ["files.metadata"], operations: ["list"], dataRetention: "none" },
            { connectorId: "drive.export", scopes: ["drive.readonly"], operations: ["export"], dataRetention: "run_artifact" },
          ],
        },
        spec: { goal: "Summarize retained data." },
        sourcePath: "main.ts",
        statePath: "state.json",
        createdAt: "2026-05-05T00:00:00.000Z",
        updatedAt: "2026-05-05T00:00:00.000Z",
      },
      run: {
        id: "run-1",
        artifactId: "gmail",
        status: "succeeded",
        startedAt: "2026-05-05T00:00:00.000Z",
        updatedAt: "2026-05-05T00:00:01.000Z",
      },
      events: [
        {
          id: "connector-1",
          runId: "run-1",
          artifactId: "gmail",
          seq: 1,
          type: "connector.end",
          message: "google.gmail.search",
          createdAt: "2026-05-05T00:00:00.100Z",
          data: { dataRetention: "redacted_audit", outputSummary: "2 messages" },
        },
        {
          id: "connector-2",
          runId: "run-1",
          artifactId: "gmail",
          seq: 2,
          type: "connector.end",
          message: "workspace.inventory.list",
          createdAt: "2026-05-05T00:00:00.200Z",
          data: { dataRetention: "none", outputSummary: "[omitted]" },
        },
        {
          id: "event-compacted",
          runId: "run-1",
          artifactId: "gmail",
          seq: 3,
          type: "batch.item.end",
          createdAt: "2026-05-05T00:00:00.300Z",
          data: compacted,
        },
      ],
      modelCalls: [
        {
          id: "call-compacted",
          runId: "run-1",
          artifactId: "gmail",
          task: "summarize",
          status: "succeeded",
          input: compacted,
          output: { summary: "ok" },
          startedAt: "2026-05-05T00:00:00.500Z",
          completedAt: "2026-05-05T00:00:00.600Z",
          latencyMs: 100,
        },
      ],
    });

    expect(report).toContain("## Retention");
    expect(report).toContain("- Manifest connector retention: omitted=1, redacted=1, run_artifact=1");
    expect(report).toContain("- Connector call audit retention: omitted=1, redacted=1, run_artifact=0");
    expect(report).toContain("- Expired payload compaction: events=1, model_calls=1");
    expect(report).toContain("retention=none omits connector values");
  });
});
