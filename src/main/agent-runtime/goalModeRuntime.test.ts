import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { AgentRuntime } from "./agentRuntime";

async function withRuntime<T>(
  callback: (input: { store: ProjectStore; runtime: AgentRuntime; threadId: string }) => Promise<T> | T,
): Promise<T> {
  const workspacePath = await mkdtemp(join(tmpdir(), "ambient-goal-runtime-"));
  const store = new ProjectStore();
  try {
    store.openWorkspace(workspacePath);
    const thread = store.createThread("goal mode");
    const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: vi.fn(),
      denyThread: () => undefined,
    });
    return await callback({ store, runtime, threadId: thread.id });
  } finally {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  }
}

function registeredGoalTools(runtime: AgentRuntime, threadId: string): Map<string, any> {
  const tools = new Map<string, any>();
  (runtime as any).createGoalModeToolExtension(threadId)({
    registerTool: (tool: any) => tools.set(tool.name, tool),
    on: vi.fn(),
  });
  return tools;
}

describe("AgentRuntime goal mode tools", () => {
  it("registers get/create/update goal tools with validation", async () => {
    await withRuntime(async ({ store, runtime, threadId }) => {
      const tools = registeredGoalTools(runtime, threadId);

      expect([...tools.keys()]).toEqual(expect.arrayContaining(["get_goal", "create_goal", "update_goal"]));

      await expect(tools.get("get_goal").execute("get-goal", {})).resolves.toMatchObject({
        details: {
          runtime: "ambient-goal-mode",
          status: "complete",
          message: "No goal is currently active for this thread.",
        },
      });

      const created = await tools.get("create_goal").execute("create-goal", {
        objective: "Finish the implementation",
        token_budget: 250,
      });
      expect(created).toMatchObject({
        details: {
          runtime: "ambient-goal-mode",
          status: "complete",
          goal: {
            threadId,
            objective: "Finish the implementation",
            status: "active",
            tokenBudget: 250,
          },
          remainingTokenBudget: 250,
        },
      });

      await expect(tools.get("create_goal").execute("duplicate-goal", { objective: "Duplicate" })).resolves.toMatchObject({
        details: {
          status: "error",
        },
      });

      await expect(tools.get("update_goal").execute("bad-update", { status: "paused" })).resolves.toMatchObject({
        details: {
          status: "error",
          message: 'update_goal only accepts status "complete" or "blocked".',
        },
      });

      const completed = await tools.get("update_goal").execute("complete-goal", { status: "complete" });
      expect(completed).toMatchObject({
        details: {
          status: "complete",
          goal: {
            status: "complete",
            objective: "Finish the implementation",
          },
        },
      });
      expect(store.getThreadGoal(threadId)).toBeUndefined();
      expect(store.listMessages(threadId)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          content: "Goal completed and cleared.\n\nFinal usage estimate: 0 tokens, 0 seconds.",
          metadata: expect.objectContaining({
            runtime: "ambient-goal-mode",
            kind: "goal-completion",
            status: "done",
            objective: "Finish the implementation",
            tokensUsed: 0,
            timeUsedSeconds: 0,
          }),
        }),
      ]));
    });
  });

  it("omits create_goal from a run that already has an active thread goal", async () => {
    await withRuntime(async ({ store, runtime, threadId }) => {
      store.createThreadGoalIfAbsent({ threadId, objective: "Build the tic tac toe app" });
      const tools = registeredGoalTools(runtime, threadId);

      expect([...tools.keys()]).toEqual(["get_goal", "update_goal"]);
      await expect(tools.get("get_goal").execute("get-goal", {})).resolves.toMatchObject({
        details: {
          runtime: "ambient-goal-mode",
          status: "complete",
          goal: {
            threadId,
            objective: "Build the tic tac toe app",
            status: "active",
          },
        },
      });
    });
  });

  it("disables goal tools in planner mode", async () => {
    await withRuntime(async ({ store, runtime, threadId }) => {
      store.updateThreadSettings(threadId, { collaborationMode: "planner" });
      const tools = registeredGoalTools(runtime, threadId);

      await expect(tools.get("create_goal").execute("planner-create", { objective: "Plan first" })).resolves.toMatchObject({
        details: {
          status: "error",
          message: "Goal creation is disabled while Planner mode is active.",
        },
      });

      store.setThreadGoal({ threadId, objective: "Existing planner goal", status: "active" });
      await expect(tools.get("update_goal").execute("planner-update", { status: "complete" })).resolves.toMatchObject({
        details: {
          status: "error",
          message: "Goal updates are disabled while Planner mode is active.",
        },
      });
    });
  });
});
