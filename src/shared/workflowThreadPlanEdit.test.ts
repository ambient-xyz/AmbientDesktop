import { describe, expect, it } from "vitest";
import { classifyWorkflowPlanEditIntent, workflowThreadPlanEditPrompt } from "./workflowThreadPlanEdit";

describe("workflowThreadPlanEditPrompt", () => {
  it("anchors Pi to the current workflow and revision proposal tools", () => {
    const prompt = workflowThreadPlanEditPrompt({
      thread: {
        id: "workflow-thread-1",
        title: "Summarize Gmail",
        phase: "ready_for_review",
        initialRequest: "Review recent email and summarize it.",
        projectName: "Inbox workflows",
        projectPath: "/tmp/inbox-workflows",
        activeArtifactId: "artifact-1",
        latestVersion: {
          id: "version-1",
          workflowThreadId: "workflow-thread-1",
          artifactId: "artifact-1",
          version: 3,
          status: "approved",
          sourcePath: "/tmp/inbox-workflows/main.ts",
          repoPath: "/tmp/inbox-workflows/.ambient-codex/workflows/workflow-1",
          createdBy: "compiler",
          createdAt: "2026-05-10T00:00:00.000Z",
        },
        graph: {
          id: "graph-1",
          workflowThreadId: "workflow-thread-1",
          source: "compile",
          version: 2,
          summary: "Request to Gmail",
          nodes: [
            { id: "request", label: "Request", type: "request" },
            { id: "gmail", label: "Gmail", type: "data_source" },
          ],
          edges: [{ id: "edge-1", source: "request", target: "gmail", type: "data_flow" }],
          createdAt: "2026-05-10T00:00:00.000Z",
        },
        latestRun: undefined,
      },
      userRequest: "Use Gmail search instead of browser search.",
    });

    expect(prompt).toContain("workflowThreadId: workflow-thread-1");
    expect(prompt).toContain("Ambient routing hint:");
    expect(prompt).toContain("intent: capability_change");
    expect(prompt).toContain("workflow_current_context");
    expect(prompt).toContain("workflow_capability_search");
    expect(prompt).toContain("workflow_update_run_settings");
    expect(prompt).toContain("workflow_propose_manifest_revision");
    expect(prompt).toContain("workflow_propose_revision");
    expect(prompt).toContain("workflow_validate_revision");
    expect(prompt).toContain("workflow_explain_revision_diff");
    expect(prompt).toContain("Do not edit generated workflow files directly.");
    expect(prompt).toContain("Use Gmail search instead of browser search.");
  });

  it("classifies explain-only requests without asking Pi to create revisions", () => {
    expect(classifyWorkflowPlanEditIntent("What does the current workflow script do?")).toMatchObject({
      kind: "question",
      confidence: "medium",
      signals: expect.arrayContaining(["question mark", "explain"]),
      guidance: expect.stringContaining("do not create a revision"),
    });
  });

  it("classifies run settings separately from persistent manifest limits", () => {
    expect(classifyWorkflowPlanEditIntent("Raise the idle timeout to 5 minutes for manual runs")).toMatchObject({
      kind: "run_settings",
      confidence: "high",
      signals: expect.arrayContaining(["idle timeout", "foreground run settings"]),
    });
    expect(classifyWorkflowPlanEditIntent("Call workflow_update_run_settings with action preview_foreground and idleTimeoutMs 300000")).toMatchObject({
      kind: "run_settings",
      confidence: "high",
      signals: expect.arrayContaining(["workflow run settings tool", "run settings fields"]),
    });
    expect(classifyWorkflowPlanEditIntent("Increase max model calls to 4 and keep read only mode")).toMatchObject({
      kind: "manifest_limits",
      confidence: "high",
      signals: expect.arrayContaining(["model budget", "mutation policy"]),
    });
    expect(classifyWorkflowPlanEditIntent("Set maxModelCalls to 3 and maxToolCalls to 8")).toMatchObject({
      kind: "manifest_limits",
      confidence: "high",
      signals: expect.arrayContaining(["model budget", "tool budget"]),
    });
  });

  it("classifies capability, graph/source, recovery, and ambiguous Plan/Edit requests", () => {
    expect(classifyWorkflowPlanEditIntent("Make this use the arxiv plugin instead of browser search")).toMatchObject({
      kind: "capability_change",
      confidence: "high",
      signals: expect.arrayContaining(["connector", "capability edit"]),
    });
    expect(classifyWorkflowPlanEditIntent("Add a review gate before the output formatting step")).toMatchObject({
      kind: "graph_source_change",
      confidence: "medium",
      signals: expect.arrayContaining(["workflow step", "edit verb"]),
    });
    expect(classifyWorkflowPlanEditIntent("Debug the failed run and retry the bad step")).toMatchObject({
      kind: "recovery",
      confidence: "high",
      signals: expect.arrayContaining(["failure", "recovery action"]),
    });
    expect(classifyWorkflowPlanEditIntent("Maybe better")).toMatchObject({
      kind: "ambiguous",
      confidence: "low",
    });
  });
});
