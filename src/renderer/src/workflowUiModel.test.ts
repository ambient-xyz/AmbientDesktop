import { describe, expect, it } from "vitest";
import {
  workflowAmbientCliCallSummaries,
  workflowAmbientCliCapabilityRows,
  workflowConnectorCallSummaries,
  workflowRunEventDetailLabels,
  workflowRunEventSummaryCards,
  workflowStepSummaries,
} from "./workflowUiModel";

describe("workflow UI model", () => {
  it("formats blocked automation plugin requirement events", () => {
    expect(
      workflowRunEventDetailLabels({
        type: "workflow.plugin-requirements",
        data: {
          count: 1,
          runtime: "automation",
          blockers: [
            {
              registeredName: "fixture_tool",
              availability: "untrusted",
              reason: "Trust this plugin before automation dispatch.",
            },
          ],
        },
      }),
    ).toEqual(["fixture_tool: Trust this plugin before automation dispatch. (untrusted)"]);
  });

  it("formats validated plugin requirement events", () => {
    expect(workflowRunEventDetailLabels({ type: "workflow.plugin-requirements", data: { count: 2 } })).toEqual([
      "2 plugin requirements validated",
    ]);
  });

  it("formats Ambient runtime stream progress events", () => {
    expect(
      workflowRunEventDetailLabels({
        type: "ambient.call.progress",
        data: {
          providerStage: "streaming",
          outputChars: 1500,
          thinkingChars: 75,
          providerElapsedMs: 12_300,
          idleElapsedMs: 500,
          idleTimeoutMs: 60_000,
          timeoutMode: "idle_watchdog",
        },
      }),
    ).toEqual(["stream Streaming", "output 1,500 chars", "thinking 75 chars", "idle 500 ms / 1 min timeout", "elapsed 12 s", "timeout Idle watchdog"]);
  });

  it("formats Ambient runtime provider error retry state", () => {
    expect(
      workflowRunEventDetailLabels({
        type: "ambient.call.error",
        data: {
          attempt: 1,
          retryable: true,
          willRetry: true,
          error: "429 Upstream request failed",
        },
      }),
    ).toEqual(["attempt 1", "retryable provider error", "will retry", "error 429 Upstream request failed"]);
  });

  it("builds readable event-stream cards with bounded structured payload previews", () => {
    expect(
      workflowRunEventSummaryCards(
        [
          {
            id: "event-1",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 1,
            type: "workflow.output.ready",
            graphNodeId: "output",
            createdAt: "2026-05-13T00:00:00.000Z",
            message: "Classification report ready.",
            data: {
              artifactPath: "reports/classification.html",
              result: {
                classifications: [
                  { file: "notes.md", classification: "Planning notes" },
                  { file: "receipts.csv", classification: "Finance" },
                ],
              },
            },
          },
          {
            id: "event-2",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 2,
            type: "ambient.call.progress",
            createdAt: "2026-05-13T00:00:01.000Z",
            data: { outputChars: 320, thinkingChars: 10, providerStage: "streaming" },
          },
        ],
        5,
      ),
    ).toEqual([
      {
        id: "event-1",
        title: "Output ready",
        detail: "Classification report ready.",
        tone: "success",
        metadataLabels: ["#1", "node output"],
        payloadPreview: "Artifact Path: reports/classification.html; Result: Classifications: 2 items",
      },
      {
        id: "event-2",
        title: "Ambient stream progress",
        detail: "Ambient Call Progress event 2",
        tone: "running",
        metadataLabels: ["#2", "stream Streaming", "output 320 chars", "thinking 10 chars"],
        payloadPreview: undefined,
      },
    ]);
  });

  it("formats scheduled workflow start trace metadata", () => {
    expect(
      workflowRunEventDetailLabels({
        type: "workflow.schedule.started",
        data: {
          scheduleId: "schedule-1",
          targetKind: "workflow_thread",
          targetVersionId: "version-2",
          createdTargetVersionId: "version-1",
          grantDecisionSource: "persistent_grant",
          grantTargets: ["google.calendar:listEvents"],
        },
      }),
    ).toEqual([
      "schedule schedule-1",
      "target Workflow Thread",
      "target version version-2",
      "created at version version-1",
      "grant Persistent Grant",
      "grant target google.calendar:listEvents",
    ]);
  });

  it("ignores unrelated workflow events", () => {
    expect(workflowRunEventDetailLabels({ type: "workflow.mode", data: { runtime: "automation" } })).toEqual([]);
  });

  it("summarizes connector call events for run review", () => {
    expect(
      workflowConnectorCallSummaries([
        { id: "ignored", type: "workflow.step", message: "step", data: {} },
        {
          id: "start",
          type: "connector.start",
          message: "workspace.inventory.listFiles",
          data: {
            dataRetention: "redacted_audit",
            sideEffects: "none",
            personalData: false,
            inputSummary: '{"maxEntries":25}',
          },
        },
        {
          id: "end",
          type: "connector.end",
          message: "workspace.inventory.listFiles",
          data: {
            durationMs: 12.4,
            dataRetention: "redacted_audit",
            sideEffects: "none",
            personalData: false,
            inputSummary: '{"maxEntries":25}',
            outputSummary: '{"entries":[]}',
          },
        },
        {
          id: "error",
          type: "connector.error",
          message: "workspace.inventory.listFiles",
          data: { durationMs: -2, error: "failed" },
        },
      ]),
    ).toEqual([
      {
        id: "start",
        operationLabel: "workspace.inventory.listFiles",
        statusLabel: "Started",
        metadataLabels: ["Retention redacted_audit", "Side effects none", "Personal data no"],
        retentionSummary: "Retention proof: only redacted connector summaries are kept in the audit trail.",
        inputSummary: '{"maxEntries":25}',
        outputSummary: undefined,
        errorSummary: undefined,
      },
      {
        id: "end",
        operationLabel: "workspace.inventory.listFiles",
        statusLabel: "Completed",
        metadataLabels: ["Retention redacted_audit", "Side effects none", "Personal data no", "Duration 12ms"],
        retentionSummary: "Retention proof: only redacted connector summaries are kept in the audit trail.",
        inputSummary: '{"maxEntries":25}',
        outputSummary: '{"entries":[]}',
        errorSummary: undefined,
      },
      {
        id: "error",
        operationLabel: "workspace.inventory.listFiles",
        statusLabel: "Failed",
        metadataLabels: ["Duration 0ms"],
        retentionSummary: undefined,
        inputSummary: undefined,
        outputSummary: undefined,
        errorSummary: "failed",
      },
    ]);
  });

  it("summarizes Ambient CLI command events with args, stdout, and artifact evidence", () => {
    expect(
      workflowAmbientCliCallSummaries([
        { id: "ignored", type: "connector.end", message: "ambient_cli", data: {} },
        {
          id: "start",
          type: "desktop-tool.start",
          message: "ambient_cli",
          data: {
            source: "first-party",
            sideEffects: "run-process",
            ambientCliInput: {
              packageName: "pi-arxiv",
              command: "arxiv_search",
              args: ["placebo effect", "--max-results", "5"],
            },
          },
        },
        {
          id: "end",
          type: "desktop-tool.end",
          message: "ambient_cli",
          data: {
            durationMs: 529,
            ambientCliInput: {
              packageName: "pi-arxiv",
              command: "arxiv_search",
              args: ["placebo effect", "--max-results", "5"],
            },
            ambientCliOutput: {
              packageName: "pi-arxiv",
              commandName: "arxiv_search",
              command: ["node", "dist/index.js", "arxiv_search", "placebo effect"],
              cwd: "/tmp/pi-arxiv",
              stdout: {
                preview: "1. Placebo response paper",
                truncated: true,
                totalChars: 4123,
                artifactPath: ".ambient/tool-outputs/arxiv.txt",
                artifactBytes: 4096,
              },
            },
          },
        },
        {
          id: "error",
          type: "desktop-tool.error",
          message: "ambient_cli",
          data: {
            durationMs: 12,
            inputSummary: JSON.stringify({ packageName: "pi-arxiv", command: "arxiv_paper", args: ["bad-id"] }),
            error: "paper not found",
          },
        },
      ]),
    ).toEqual([
      {
        id: "start",
        operationLabel: "pi-arxiv:arxiv_search",
        statusLabel: "Started",
        metadataLabels: ["Source First Party", "Side effects Run Process"],
        argsSummary: "placebo effect --max-results 5",
        commandSummary: undefined,
        stdoutSummary: undefined,
        stderrSummary: undefined,
        artifactLabels: [],
        errorSummary: undefined,
      },
      {
        id: "end",
        operationLabel: "pi-arxiv:arxiv_search",
        statusLabel: "Completed",
        metadataLabels: ["Duration 529 ms", "Cwd /tmp/pi-arxiv"],
        argsSummary: "placebo effect --max-results 5",
        commandSummary: "node dist/index.js arxiv_search placebo effect",
        stdoutSummary: "Stdout preview 4,123 chars total: 1. Placebo response paper",
        stderrSummary: undefined,
        artifactLabels: ["Stdout artifact .ambient/tool-outputs/arxiv.txt", "Stdout artifact 4,096 bytes", "Stdout 4,123 chars"],
        errorSummary: undefined,
      },
      {
        id: "error",
        operationLabel: "pi-arxiv:arxiv_paper",
        statusLabel: "Failed",
        metadataLabels: ["Duration 12 ms"],
        argsSummary: "bad-id",
        commandSummary: undefined,
        stdoutSummary: undefined,
        stderrSummary: undefined,
        artifactLabels: [],
        errorSummary: "paper not found",
      },
    ]);
  });

  it("formats Ambient CLI manifest capability rows for review", () => {
    expect(
      workflowAmbientCliCapabilityRows([
        {
          capabilityId: "ambient-cli:pkg-arxiv:tool:arxiv_search",
          registryPluginId: "ambient-cli:pkg-arxiv",
          packageId: "pkg-arxiv",
          packageName: "pi-arxiv",
          command: "arxiv_search",
        },
      ]),
    ).toEqual([
      {
        id: "ambient-cli:pkg-arxiv:tool:arxiv_search",
        operationLabel: "pi-arxiv:arxiv_search",
        metadataLabels: ["Package pkg-arxiv", "Registry ambient-cli:pkg-arxiv", "Desktop tool ambient_cli"],
        grantLabel: "Grant ambient-cli:pkg-arxiv:tool:arxiv_search",
      },
    ]);
  });

  it("summarizes workflow step lifecycle events for run review", () => {
    expect(
      workflowStepSummaries([
        { id: "step-1", type: "step.start", message: "preview audit", data: {} },
        { id: "step-2", type: "connector.end", message: "workspace.inventory.listFiles", data: {} },
        { id: "step-3", type: "step.paused", message: "preview audit", data: { approvalId: "sample-review" } },
        { id: "step-4", type: "step.start", message: "write report", data: {} },
        { id: "step-5", type: "step.error", message: "write report", data: { error: "disk full" } },
      ]),
    ).toEqual([
      { id: "step-1", name: "preview audit", statusLabel: "Paused", metadataLabels: ["Approval sample-review"] },
      { id: "step-4", name: "write report", statusLabel: "Failed", metadataLabels: ["Error disk full"] },
    ]);
    expect(workflowStepSummaries([{ id: "step-1", type: "step.end", message: "", data: {} }])).toEqual([
      { id: "step-1", name: "unnamed step", statusLabel: "Completed", metadataLabels: [] },
    ]);
  });
});
