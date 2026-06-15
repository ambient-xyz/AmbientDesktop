import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowGraphSnapshot,
  WorkflowRunDetail,
  WorkflowRunEvent,
  WorkflowRunSummary,
} from "../../shared/types";
import { WorkflowThreadComposerView } from "./AutomationsWorkflowThreadComposerViews";

describe("Automations workflow thread composer views", () => {
  it("renders Workflow Chat mode through the extracted owner", () => {
    const markup = renderToStaticMarkup(
      <WorkflowThreadComposerView
        thread={workflowThread()}
        draft="Please explain the latest run"
        composerBusy={false}
        onDraftChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("workflow-thread-chat-composer plan_edit");
    expect(markup).toContain("aria-label=\"Workflow Chat composer\"");
    expect(markup).toContain("Ask Pi to inspect, explain, revise, validate, or run this workflow");
    expect(markup).toContain("Send to Pi");
  });

  it("renders pending runtime input mode with freeform submission copy", () => {
    const markup = renderToStaticMarkup(
      <WorkflowThreadComposerView
        thread={workflowThread()}
        detail={workflowRunDetail([
          {
            id: "event-1",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 1,
            type: "workflow.input.required",
            message: "What format should the report use?",
            data: {
              id: "input-1",
              prompt: "What format should the report use?",
              choices: [{ id: "md", label: "Markdown" }],
              allowFreeform: true,
              placeholder: "Type an answer for this workflow run.",
              submitLabel: "Continue workflow",
            },
            createdAt: "2026-06-14T09:01:00.000Z",
          },
        ])}
        draft="Use Markdown"
        composerBusy={false}
        onDraftChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("workflow-thread-chat-composer run_input");
    expect(markup).toContain("aria-label=\"Workflow Run Input composer\"");
    expect(markup).toContain("Freeform answers use this composer.");
    expect(markup).toContain("Continue workflow");
    expect(markup).toContain("Type an answer for this workflow run.");
  });

  it("derives graph recovery mode from the thread graph and run detail", () => {
    const markup = renderToStaticMarkup(
      <WorkflowThreadComposerView
        thread={workflowThread({ graph: workflowGraph() })}
        detail={workflowRunDetail([
          {
            id: "event-graph-failure",
            runId: "run-1",
            artifactId: "artifact-1",
            seq: 1,
            type: "ambient.call.invalid",
            message: "Schema failed",
            graphNodeId: "model",
            itemKey: "record-1",
            createdAt: "2026-06-14T09:02:00.000Z",
          },
        ])}
        draft="debug this"
        composerBusy={false}
        onDraftChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("workflow-thread-chat-composer graph_recovery");
    expect(markup).toContain("aria-label=\"Workflow Graph Recovery composer\"");
    expect(markup).toContain("Recover or debug the latest actionable workflow graph failure.");
    expect(markup).toContain("Failed step");
    expect(markup).toContain("Ask Ambient to debug");
  });

  it("surfaces composer busy state through the moved header and button", () => {
    const markup = renderToStaticMarkup(
      <WorkflowThreadComposerView
        thread={workflowThread()}
        draft="Revise the plan"
        composerBusy={true}
        onDraftChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("workflow-thread-chat-composer-status");
    expect(markup).toContain("Drafting proposal");
    expect(markup).toContain("spin");
  });
});

function workflowThread(overrides: Partial<WorkflowAgentThreadSummary> = {}): WorkflowAgentThreadSummary {
  return {
    id: "thread-1",
    folderId: "folder-1",
    projectName: "Demo Project",
    projectPath: "/tmp/demo",
    title: "Nightly report workflow",
    phase: "approved",
    initialRequest: "Run the nightly report.",
    preview: "Nightly report workflow",
    status: "approved",
    traceMode: "production",
    discoveryQuestions: [],
    badges: ["Approved"],
    createdAt: "2026-06-14T09:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...overrides,
  };
}

function workflowArtifact(): WorkflowArtifactSummary {
  return {
    id: "artifact-1",
    workflowThreadId: "thread-1",
    title: "Nightly workflow",
    status: "approved",
    manifest: {
      tools: [],
      pluginCapabilities: [],
      ambientCliCapabilities: [],
      mutationPolicy: "read_only",
      maxToolCalls: 1,
      maxModelCalls: 0,
      maxConnectorCalls: 0,
      connectors: [],
    },
    spec: {
      goal: "Summarize the nightly report.",
      summary: "Fixture",
    },
    sourcePath: "/tmp/main.ts",
    statePath: "/tmp/state.json",
    createdAt: "2026-06-14T09:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
  };
}

function workflowRun(): WorkflowRunSummary {
  return {
    id: "run-1",
    artifactId: "artifact-1",
    status: "paused",
    startedAt: "2026-06-14T09:00:00.000Z",
    updatedAt: "2026-06-14T09:02:00.000Z",
  };
}

function workflowRunDetail(events: WorkflowRunEvent[]): WorkflowRunDetail {
  return {
    artifact: workflowArtifact(),
    run: workflowRun(),
    events,
    modelCalls: [],
    checkpoints: [],
    approvals: [],
    auditReport: "",
    sourceContent: "export async function run() {}",
  };
}

function workflowGraph(): WorkflowGraphSnapshot {
  return {
    id: "graph-1",
    workflowThreadId: "thread-1",
    version: 1,
    source: "compile",
    nodes: [
      {
        id: "model",
        type: "model_call",
        label: "Summarize",
        description: "Summarize the nightly report.",
      },
    ],
    edges: [],
    summary: "Nightly report workflow graph.",
    createdAt: "2026-06-14T09:00:00.000Z",
  };
}
