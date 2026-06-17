import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { parseWorkflowMarkdown, renderWorkflowPrompt, WorkflowError } from "./workflow";

describe("parseWorkflowMarkdown", () => {
  it("parses front matter, applies defaults, and resolves relative workspace paths", () => {
    const workflow = parseWorkflowMarkdown(
      `---
version: 1
tracker:
  kind: local
  active_states: [Ready, In Progress, ready]
orchestration:
  max_concurrent_agents: 3
  auto_dispatch: true
workspace:
  root: .ambient/tasks
agent:
  model: glm-5.1
  thinking_level: xhigh
  permission_mode: workspace
proof_of_work:
  require_tests: true
---
Ship {{ task.title }}`,
      "/repo/WORKFLOW.md",
    );

    expect(workflow.config.tracker.activeStates).toEqual(["ready", "in progress"]);
    expect(workflow.config.orchestration.maxConcurrentAgents).toBe(3);
    expect(workflow.config.orchestration.autoDispatch).toBe(true);
    expect(workflow.config.workspace.root).toBe(join("/repo", ".ambient/tasks"));
    expect(workflow.config.agent).toMatchObject({ model: "glm-5.1", thinkingLevel: "xhigh", permissionMode: "workspace" });
    expect(workflow.config.proofOfWork.requireTests).toBe(true);
    expect(workflow.promptTemplate).toBe("Ship {{ task.title }}");
  });

  it("supports prompt-only workflows with local defaults", () => {
    const workflow = parseWorkflowMarkdown("Do {{ task.identifier }}", "/repo/WORKFLOW.md");

    expect(workflow.rawConfig).toEqual({});
    expect(workflow.config.tracker.kind).toBe("local");
    expect(workflow.config.orchestration.maxConcurrentAgents).toBe(1);
    expect(workflow.config.orchestration.autoDispatch).toBe(true);
    expect(workflow.promptTemplate).toBe("Do {{ task.identifier }}");
  });

  it("emits warnings for unknown top-level keys", () => {
    const workflow = parseWorkflowMarkdown(
      `---
custom_extension:
  enabled: true
---
Prompt`,
      "/repo/WORKFLOW.md",
    );

    expect(workflow.warnings).toEqual(['Unknown workflow config key "custom_extension" ignored.']);
  });

  it("resolves workspace.root from explicit environment references", () => {
    const workflow = parseWorkflowMarkdown(
      `---
workspace:
  root: $AMBIENT_TASK_ROOT
---
Prompt`,
      "/repo/WORKFLOW.md",
      { AMBIENT_TASK_ROOT: "/tmp/ambient-tasks" },
    );

    expect(workflow.config.workspace.root).toBe("/tmp/ambient-tasks");
  });

  it("rejects non-map front matter", () => {
    expect(() => parseWorkflowMarkdown("---\n- nope\n---\nPrompt", "/repo/WORKFLOW.md")).toThrow(WorkflowError);
  });

  it("rejects invalid config values", () => {
    expect(() =>
      parseWorkflowMarkdown(
        `---
orchestration:
  max_concurrent_agents: 0
---
Prompt`,
        "/repo/WORKFLOW.md",
      ),
    ).toThrow(/workflow_validation_error|max_concurrent_agents/);
  });
});

describe("renderWorkflowPrompt", () => {
  it("renders strict dotted variables", () => {
    expect(
      renderWorkflowPrompt("Task {{ task.identifier }}: {{ task.title }} attempt {{ attempt.number }}", {
        task: { identifier: "LOCAL-1", title: "Add tests" },
        attempt: { number: 2 },
      }),
    ).toBe("Task LOCAL-1: Add tests attempt 2");
  });

  it("renders objects as formatted JSON", () => {
    expect(renderWorkflowPrompt("Labels {{ task.labels }}", { task: { labels: ["ui", "phase6"] } })).toContain('"ui"');
  });

  it("fails on unknown variables", () => {
    expect(() => renderWorkflowPrompt("{{ task.missing }}", { task: {} })).toThrow(/Unknown workflow prompt variable/);
  });
});
