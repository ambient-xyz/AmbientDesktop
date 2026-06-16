import { describe, expect, it, vi } from "vitest";

import { resolveLocalDeepResearchRunBudget } from "../shared/localDeepResearchBudget";
import type { WorkflowAgentThreadSummary } from "../shared/types";
import { modelContentForAgentRuntimeSendInput } from "./agentRuntimeSendContent";

describe("modelContentForAgentRuntimeSendInput", () => {
  it("formats selected context and workflow recording edit context", () => {
    const content = modelContentForAgentRuntimeSendInput({
      content: "Update the workflow docs.",
      context: [{
        kind: "file",
        name: "workflow.md",
        path: "docs/workflow.md",
        size: 2048,
      }],
      workflowRecordingEditContext: {
        id: "workflow-1",
        title: "Nightly Review",
        version: 3,
        manifestPath: ".ambient/workflows/nightly/manifest.json",
        markdownPath: ".ambient/workflows/nightly/workflow.md",
        sidecarPath: ".ambient/workflows/nightly/sidecar.json",
        transcriptPath: ".ambient/workflows/nightly/transcript.jsonl",
      },
    }, defaultDeps());

    expect(content).toContain("Saved workflow edit request:");
    expect(content).toContain("- Workflow title: Nightly Review");
    expect(content).toContain("Selected workspace context for this turn:");
    expect(content).toContain("- file: docs/workflow.md (2.0 KB)");
    expect(content).toContain("Update the workflow docs.");
  });

  it("wraps Local Deep Research composer intents around the formatted user request", () => {
    const content = modelContentForAgentRuntimeSendInput({
      content: "Compare local search agents.",
      composerIntent: { kind: "local-deep-research", localDeepResearch: resolveLocalDeepResearchRunBudget(undefined) },
    }, defaultDeps());

    expect(content).toContain("Composer action: Local Deep Research.");
    expect(content).toContain("ambient_local_deep_research_run");
    expect(content).toContain("\"maxToolCalls\": 25");
    expect(content).toContain("Research query:\nCompare local search agents.");
  });

  it("adds browser verification guidance for generated HTML app test requests", () => {
    const content = modelContentForAgentRuntimeSendInput({
      content: "Build a simple calculator app using one HTML file and verify it works with click tests.",
    }, defaultDeps());

    expect(content).toContain("Generated HTML app verification reminder:");
    expect(content).toContain("browser_local_preview");
    expect(content).toContain("browser_click");
    expect(content).toContain("Do not edit the generated app to expose window test hooks");
    expect(content).toContain("Do not install or require jsdom");
  });

  it("does not add HTML app verification guidance to unrelated HTML discussion", () => {
    const content = modelContentForAgentRuntimeSendInput({
      content: "Summarize this HTML article and explain the markup style.",
    }, defaultDeps());

    expect(content).not.toContain("Generated HTML app verification reminder:");
    expect(content).not.toContain("browser_local_preview");
  });

  it("rejects Symphony composer intents when subagents are disabled", () => {
    expect(() => modelContentForAgentRuntimeSendInput({
      content: "Audit the current plan.",
      composerIntent: {
        kind: "symphony-workflow",
        action: "run-once",
        patternId: "map_reduce",
        metricCustomizations: {
          "map_reduce-metric": "Reducer must cite every changed section.",
        },
      },
    }, defaultDeps({
      isSubagentsEnabled: () => false,
    }))).toThrow("Symphony workflow composer intents are disabled while ambient.subagents is off.");
  });

  it("formats Symphony composer intents when subagents are enabled", () => {
    const content = modelContentForAgentRuntimeSendInput({
      content: "Audit the current plan.",
      composerIntent: {
        kind: "symphony-workflow",
        action: "run-once",
        patternId: "map_reduce",
        blocking: true,
        metricCustomizations: {
          "map_reduce-metric": "Reducer must cite every changed section.",
        },
      },
    }, defaultDeps());

    expect(content).toContain("Composer action: Symphony Run Once.");
    expect(content).toContain("ambient_workflow_symphony_map_reduce");
    expect(content).toContain('"goal": "Audit the current plan."');
    expect(content).toContain('"blocking": true');
  });

  it("uses workflow thread plan-edit prompts after context formatting", () => {
    const getWorkflowAgentThreadSummary = vi.fn(() => workflowThread());

    const content = modelContentForAgentRuntimeSendInput({
      content: "Change the graph source to include retry evidence.",
      context: [{
        kind: "file",
        name: "retry.md",
        path: "plans/retry.md",
      }],
      workflowThreadId: "workflow-thread-1",
    }, defaultDeps({ getWorkflowAgentThreadSummary }));

    expect(getWorkflowAgentThreadSummary).toHaveBeenCalledWith("workflow-thread-1");
    expect(content).toContain("You are in Workflow Agent Plan/Edit mode.");
    expect(content).toContain("- workflowThreadId: workflow-thread-1");
    expect(content).toContain("Selected workspace context for this turn:");
    expect(content).toContain("Change the graph source to include retry evidence.");
  });
});

function defaultDeps(overrides: Partial<Parameters<typeof modelContentForAgentRuntimeSendInput>[1]> = {}) {
  return {
    isSubagentsEnabled: () => true,
    getWorkflowAgentThreadSummary: () => workflowThread(),
    ...overrides,
  };
}

function workflowThread(overrides: Partial<WorkflowAgentThreadSummary> = {}): WorkflowAgentThreadSummary {
  return {
    id: "workflow-thread-1",
    folderId: "folder-1",
    projectName: "Ambient",
    projectPath: "/workspace",
    title: "Retry Evidence Workflow",
    phase: "planned",
    initialRequest: "Create a workflow that audits retry evidence.",
    preview: "Audits retry evidence.",
    status: "draft",
    traceMode: "debug",
    discoveryQuestions: [],
    badges: [],
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z",
    ...overrides,
  };
}
