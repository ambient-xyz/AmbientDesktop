import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readOrchestrationBoardWithWorkflowReadiness, readOrchestrationWorkflowReadiness } from "./orchestrationWorkflowReadiness";

describe("orchestration workflow readiness", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ambient-workflow-readiness-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reports a missing WORKFLOW.md without throwing", async () => {
    await expect(readOrchestrationWorkflowReadiness(root)).resolves.toMatchObject({
      status: "missing",
      code: "missing_workflow_file",
      path: join(root, "WORKFLOW.md"),
    });
  });

  it("reports invalid workflow front matter without hiding the validation message", async () => {
    await writeFile(
      join(root, "WORKFLOW.md"),
      `---
orchestration:
  max_concurrent_agents: 0
---
Prompt`,
    );

    await expect(readOrchestrationWorkflowReadiness(root)).resolves.toMatchObject({
      status: "invalid",
      code: "workflow_validation_error",
      message: expect.stringContaining("max_concurrent_agents"),
      path: join(root, "WORKFLOW.md"),
      repairPreview: {
        workspaceStrategy: "directory",
        currentLineCount: 5,
        proposedLineCount: expect.any(Number),
        currentText: expect.stringContaining("max_concurrent_agents: 0"),
        proposedText: expect.stringContaining("max_concurrent_agents: 1"),
        diff: expect.stringContaining("-  max_concurrent_agents: 0"),
      },
    });
  });

  it("summarizes valid workflow dispatch settings on the orchestration board", async () => {
    await writeFile(
      join(root, "WORKFLOW.md"),
      `---
orchestration:
  auto_dispatch: false
  max_concurrent_agents: 2
workspace:
  strategy: directory
---
Prompt`,
    );

    await expect(readOrchestrationBoardWithWorkflowReadiness(root, { tasks: [], runs: [] })).resolves.toMatchObject({
      workflowReadiness: {
        status: "ready",
        workflowHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        autoDispatch: false,
        maxConcurrentAgents: 2,
        maxTurns: 20,
        workspaceStrategy: "directory",
        proofOfWork: {
          requireTests: false,
          requireDiffSummary: true,
          requireScreenshots: false,
        },
      },
    });
  });
});
