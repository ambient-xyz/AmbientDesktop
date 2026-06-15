import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkflowAgentThreadSummary, WorkflowExplorationTraceSummary } from "../../shared/types";
import { normalizeWorkflowExplorationBudgets } from "./workflowExplorationBudgetUiModel";
import { workflowExplorationGateModel } from "./workflowExplorationGateUiModel";
import { WorkflowExplorationPanel } from "./AutomationsWorkflowExplorationViews";

describe("Automations workflow exploration views", () => {
  it("renders exploration gates, budgets, live status, traces, and compile actions without owning commands", () => {
    const markup = renderToStaticMarkup(
      <WorkflowExplorationPanel
        thread={workflowThread()}
        traces={[workflowTrace()]}
        progress={{
          workflowThreadId: "workflow-thread-1",
          explorationId: "exploration-1",
          eventType: "progress",
          status: "running",
          phase: "tool",
          message: "Checking connector shape.",
          turn: 2,
          graphNodeId: "source",
          updatedAt: "2026-06-14T10:00:30.000Z",
        }}
        gate={workflowExplorationGateModel({ requestContext: true, traceCount: 1 })}
        budgets={normalizeWorkflowExplorationBudgets({
          maxModelTurns: 3,
          maxToolCalls: 8,
          maxConnectorCalls: 5,
          maxAmbientCalls: 2,
          maxElapsedMs: 180_000,
        })}
        workflowBusy="exploration:workflow-thread-1"
        onRunExploration={() => undefined}
        onSkipExploration={() => undefined}
        onCompile={() => undefined}
        onUpdateBudget={() => undefined}
        onResetBudget={() => undefined}
      />,
    );

    expect(markup).toContain("Exploration");
    expect(markup).toContain("Exploration trace is ready");
    expect(markup).toContain("Exploring");
    expect(markup).toContain("Compile from exploration");
    expect(markup).toContain("Next exploration budget");
    expect(markup).toContain("Locked during run");
    expect(markup).toContain("Exploration preflight");
    expect(markup).toContain("Exploration running");
    expect(markup).toContain("Node source");
    expect(markup).toContain("Latest exploration trace");
    expect(markup).toContain("Plugin: gmail.search (succeeded)");
    expect(markup).toContain("Gmail read grant");
    expect(markup).toContain("Customer rows");
    expect(markup).toContain("Use connector payload as deterministic source.");
    expect(markup).toContain("Stable selector");
  });
});

function workflowThread(): WorkflowAgentThreadSummary {
  return {
    id: "workflow-thread-1",
    title: "Daily Gmail digest",
    initialRequest: "Summarize Gmail messages for customer follow-up.",
    projectName: "Inbox Ops",
    activeArtifactId: "artifact-1",
    latestVersion: {
      id: "version-1",
      artifactId: "artifact-1",
      workflowThreadId: "workflow-thread-1",
      version: 1,
      sourcePath: "/tmp/workflow.ts",
      createdAt: "2026-06-14T10:00:00.000Z",
      summary: "Initial workflow.",
    },
    discoveryQuestions: [
      {
        id: "question-1",
        prompt: "Which inbox?",
        answer: "Support",
        createdAt: "2026-06-14T10:00:00.000Z",
      },
    ],
  } as unknown as WorkflowAgentThreadSummary;
}

function workflowTrace(): WorkflowExplorationTraceSummary {
  return {
    id: "trace-1",
    workflowThreadId: "workflow-thread-1",
    status: "succeeded",
    request: "Summarize Gmail messages.",
    model: "kimi",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:01:00.000Z",
    observations: [],
    capabilityManifest: {
      budgets: {
        maxModelTurns: 3,
        maxToolCalls: 8,
        maxConnectorCalls: 5,
        maxAmbientCalls: 2,
        maxElapsedMs: 180_000,
      },
    },
    distillation: {
      summary: "Gmail connector returns customer follow-up rows.",
      observedCalls: [{ kind: "Plugin", name: "gmail.search", status: "succeeded" }],
      requiredGrants: ["Gmail read grant"],
      dataShapes: ["Customer rows"],
      unresolvedQuestions: [],
      successfulPatterns: ["Stable selector"],
      deterministicSourceStrategy: "Use connector payload as deterministic source.",
      recommendedGraph: {
        summary: "Search Gmail, extract customer rows, write digest.",
      },
    },
  } as unknown as WorkflowExplorationTraceSummary;
}
