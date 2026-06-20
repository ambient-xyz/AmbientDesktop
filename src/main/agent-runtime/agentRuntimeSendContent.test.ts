import { describe, expect, it, vi } from "vitest";

import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { resolveLocalDeepResearchRunBudget } from "../../shared/localDeepResearchBudget";
import type { WorkflowAgentThreadSummary } from "../../shared/workflowTypes";
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

  it("wraps slash command skill selections as run-scoped guidance", () => {
    const content = modelContentForAgentRuntimeSendInput({
      content: "Review the migration.",
      composerIntent: {
        kind: "slash-command",
        selection: {
          schemaVersion: "ambient-slash-command-invocation-v1",
          entryId: "codex-plugin-skill:reviewer",
          command: "/reviewer",
          title: "reviewer",
          kind: "skill",
          sourceKind: "codex-plugin",
          invocationKind: "codex-plugin-skill",
          sourceId: "plugin-reviewer",
          sourceName: "reviewer",
          sourceVersion: "1.0.0",
        },
      },
    }, defaultDeps());

    expect(content).toContain("Composer action: Slash command /reviewer.");
    expect(content).toContain("Ambient Desktop validated this slash-command selection immediately before sending.");
    expect(content).toContain('"invocationKind": "codex-plugin-skill"');
    expect(content).toContain("Use the selected Codex skill for this run");
    expect(content).toContain("User request:\nReview the migration.");
  });

  it("routes Ambient CLI slash skill selections through Ambient wrappers", () => {
    const content = modelContentForAgentRuntimeSendInput({
      content: "Use it on this project.",
      composerIntent: {
        kind: "slash-command",
        selection: {
          schemaVersion: "ambient-slash-command-invocation-v1",
          entryId: "ambient-cli-skill:pkg-review:skill:review",
          command: "/review",
          title: "review",
          kind: "skill",
          sourceKind: "ambient-cli",
          invocationKind: "ambient-cli-skill",
          sourceId: "pkg-review",
          sourceName: "review-tools",
          sourceVersion: "1.0.0",
        },
      },
    }, defaultDeps());

    expect(content).toContain("This is an Ambient-wrapped Pi skill from an installed Ambient CLI package");
    expect(content).toContain("ambient_cli_search or ambient_cli_describe");
    expect(content).toContain("Do not inspect arbitrary ~/.pi");
  });

  it("routes workflow slash selections through recorded playbook tools", () => {
    const content = modelContentForAgentRuntimeSendInput({
      content: "Run it for Friday.",
      composerIntent: {
        kind: "slash-command",
        selection: {
          schemaVersion: "ambient-slash-command-invocation-v1",
          entryId: "workflow-playbook:find-events:4",
          command: "/find-events",
          title: "Find events",
          kind: "workflow",
          sourceKind: "workflow-recorder",
          invocationKind: "workflow-playbook",
          sourceId: "find-events",
          sourceName: "Find events",
          sourceVersion: 4,
        },
      },
    }, defaultDeps());

    expect(content).toContain("Call ambient_workflows_describe for the selected playbook id/version");
    expect(content).toContain("ambient_workflows_inject");
    expect(content).toContain("If the exact selected playbook is unavailable");
  });

  it("rejects slash command composer intents when slash commands are disabled", () => {
    expect(() => modelContentForAgentRuntimeSendInput({
      content: "Review the migration.",
      composerIntent: {
        kind: "slash-command",
        selection: {
          schemaVersion: "ambient-slash-command-invocation-v1",
          entryId: "codex-plugin-skill:reviewer",
          command: "/reviewer",
          title: "reviewer",
          kind: "skill",
          sourceKind: "codex-plugin",
          invocationKind: "codex-plugin-skill",
          sourceId: "plugin-reviewer",
          sourceName: "reviewer",
          sourceVersion: "1.0.0",
        },
      },
    }, defaultDeps({
      getFeatureFlagSnapshot: () => resolveAmbientFeatureFlags({ settings: { slashCommands: false } }),
    }))).toThrow("Slash command composer intents are disabled while ambient.slashCommands is off.");
  });

  it("guides callable slash commands through the callable workflow catalog", () => {
    const content = modelContentForAgentRuntimeSendInput({
      content: "Run the report workflow.",
      composerIntent: {
        kind: "slash-command",
        selection: {
          schemaVersion: "ambient-slash-command-invocation-v1",
          entryId: "callable-workflow:weekly",
          command: "/weekly-report",
          title: "Weekly Report",
          kind: "callable-workflow",
          sourceKind: "workflow-recorder",
          invocationKind: "callable-workflow",
          sourceId: "weekly",
          sourceVersion: 3,
        },
      },
    }, defaultDeps());

    expect(content).toContain("callable workflow catalog tools");
    expect(content).toContain("launch-card risk");
    expect(content).toContain("Do not manually recreate child fanout");
  });

  it("adds self-healing sub-agent verification guidance for generated HTML repair loops", () => {
    const content = modelContentForAgentRuntimeSendInput({
      content: "Can you make me a habit tracker HTML app and keep checking it until it seems ready to actually use? Check tester edge cases and repair failures.",
    }, defaultDeps());

    expect(content).toContain("Generated HTML app verification reminder:");
    expect(content).toContain("Self-healing sub-agent verification contract:");
    expect(content).toContain("use visible read-only reviewer/tester children");
    expect(content).toContain("must still spawn and wait on reviewer/tester children");
  });

  it("does not add HTML app verification guidance to unrelated HTML discussion", () => {
    const content = modelContentForAgentRuntimeSendInput({
      content: "Summarize this HTML article and explain the markup style.",
    }, defaultDeps());

    expect(content).not.toContain("Generated HTML app verification reminder:");
    expect(content).not.toContain("browser_local_preview");
  });

  it("adds selected-context sub-agent guidance for multi-file comparison tasks", () => {
    const content = modelContentForAgentRuntimeSendInput({
      content: "Read these documents and compare what they agree on, contradict, and what I should verify.",
      context: [
        { kind: "file", name: "alpha.md", path: "docs/alpha.md" },
        { kind: "file", name: "beta.pdf", path: "docs/beta.pdf" },
        { kind: "file", name: "gamma.docx", path: "docs/gamma.docx" },
      ],
    }, defaultDeps());

    expect(content).toContain("Selected-context sub-agent delegation contract:");
    expect(content).toContain("use a visible map-reduce shape");
    expect(content).toContain("should not directly read/process every selected file");
    expect(content).toContain("wait on all required children with wait_agent");
    expect(content).toContain("taskIntent file_read");
    expect(content).toContain("readPaths limited to the exact selected file path");
    expect(content).toContain("docs/alpha.md, docs/beta.pdf, docs/gamma.docx");
  });

  it("does not add selected-context sub-agent guidance when subagents are disabled", () => {
    const content = modelContentForAgentRuntimeSendInput({
      content: "Read these documents and compare what they agree on, contradict, and what I should verify.",
      context: [
        { kind: "file", name: "alpha.md", path: "docs/alpha.md" },
        { kind: "file", name: "beta.pdf", path: "docs/beta.pdf" },
        { kind: "file", name: "gamma.docx", path: "docs/gamma.docx" },
      ],
    }, defaultDeps({
      isSubagentsEnabled: () => false,
    }));

    expect(content).not.toContain("Selected-context sub-agent delegation contract:");
  });

  it("does not add selected-context sub-agent guidance for a single selected file", () => {
    const content = modelContentForAgentRuntimeSendInput({
      content: "Read this document and tell me what to verify.",
      context: [
        { kind: "file", name: "alpha.md", path: "docs/alpha.md" },
      ],
    }, defaultDeps());

    expect(content).not.toContain("Selected-context sub-agent delegation hint:");
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
    expect(content).toContain("do not explain task status in chat");
    expect(content).toContain("workflow task surface show status");
    expect(content).not.toContain("explain the task status, blocking mode");
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
    getFeatureFlagSnapshot: () => resolveAmbientFeatureFlags({ settings: { slashCommands: true } }),
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
