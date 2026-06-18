import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OrchestrationTask } from "../../shared/workflowTypes";
import { prepareNextOrchestrationTasks } from "./orchestrationPrepare";

function task(overrides: Partial<OrchestrationTask>): OrchestrationTask {
  return {
    id: overrides.id ?? "task-1",
    identifier: overrides.identifier ?? "LOCAL-1",
    title: overrides.title ?? "Task",
    state: overrides.state ?? "todo",
    labels: [],
    blockedBy: [],
    sourceKind: "local",
    createdAt: overrides.createdAt ?? "2026-04-29T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("prepareNextOrchestrationTasks", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ambient-prepare-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("selects dispatchable tasks, prepares workspaces, and runs preparation hooks", async () => {
    await writeFile(
      join(root, "WORKFLOW.md"),
      `---
workspace:
  strategy: directory
  root: ./tasks
hooks:
  after_create: printf created > created.txt
  before_run: test -f created.txt && printf ready
  timeout_ms: 1000
---
Prompt`,
    );

    const result = await prepareNextOrchestrationTasks(
      root,
      [
        task({ id: "low", identifier: "LOCAL-2", priority: 2 }),
        task({ id: "high", identifier: "LOCAL-1", priority: 1 }),
        task({ id: "done", identifier: "LOCAL-3", state: "done" }),
      ],
      { maxHookOutputChars: 120 },
    );

    expect(result.prepared).toHaveLength(1);
    expect(result.prepared[0]).toMatchObject({
      taskId: "high",
      identifier: "LOCAL-1",
      priority: 1,
      dispatchRank: 1,
      strategy: "directory",
      createdNow: true,
    });
    expect(result.prepared[0].hooks.map((hook) => [hook.hook, hook.ok])).toEqual([
      ["afterCreate", true],
      ["beforeRun", true],
    ]);
    expect(result.prepared[0].hooks[1].stdout).toBe("ready");
    expect(result.skipped.find((entry) => entry.taskId === "done")?.reason).toBe("terminal-state");
    expect(result.skipped.find((entry) => entry.taskId === "low")?.reason).toBe("global-concurrency");
  });

  it("stops beforeRun when afterCreate fails", async () => {
    await writeFile(
      join(root, "WORKFLOW.md"),
      `---
workspace:
  strategy: directory
  root: ./tasks
hooks:
  after_create: exit 5
  before_run: printf should-not-run
  timeout_ms: 1000
---
Prompt`,
    );

    const result = await prepareNextOrchestrationTasks(root, [task({ id: "task" })]);

    expect(result.prepared[0].hooks).toHaveLength(1);
    expect(result.prepared[0].hooks[0]).toMatchObject({ hook: "afterCreate", ok: false, exitCode: 5 });
  });
});
