import { describe, expect, it } from "vitest";

import type { ThreadGoal } from "../../shared/threadTypes";
import { createGoalModeToolExtension, GOAL_CONTEXT_CUSTOM_TYPE } from "./agentRuntimeGoalModeTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("createGoalModeToolExtension", () => {
  it("registers goal tools and forwards create/update side effects", async () => {
    const registeredTools: RegisteredTool[] = [];
    const events: unknown[] = [];
    const finalizedGoals: ThreadGoal[] = [];
    let currentGoal: ThreadGoal | undefined;

    createGoalModeToolExtension({
      threadId: "thread-1",
      store: {
        getThread: () => ({ collaborationMode: "agent" }) as any,
        getThreadGoal: () => currentGoal,
        createThreadGoalIfAbsent: (input) => {
          currentGoal = goal({ objective: input.objective, tokenBudget: input.tokenBudget ?? undefined });
          return currentGoal;
        },
        markThreadGoalStatus: (_threadId, status, options) => {
          currentGoal = {
            ...currentGoal!,
            status,
            statusReason: options?.statusReason ?? undefined,
          };
          return currentGoal;
        },
      },
      hasActiveRun: () => false,
      finalizeCompletedThreadGoal: (goal) => {
        finalizedGoals.push(goal);
        return goal;
      },
      emit: (event) => events.push(event),
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
      on: () => undefined,
    } as any);

    expect(registeredTools.map((tool) => tool.name)).toEqual(["get_goal", "create_goal", "update_goal"]);
    expect(registeredTools.every((tool) => tool.executionMode === "sequential")).toBe(true);

    const createResult = await registeredTools.find((tool) => tool.name === "create_goal")!.execute("create", {
      objective: "  Simplify runtime  ",
      token_budget: 120.8,
    });

    expect(createResult.content[0]).toEqual({
      type: "text",
      text: expect.stringContaining("Objective: Simplify runtime"),
    });
    expect(createResult.details).toMatchObject({
      runtime: "ambient-goal-mode",
      status: "complete",
      remainingTokenBudget: 120,
      goal: {
        threadId: "thread-1",
        objective: "Simplify runtime",
        tokenBudget: 120,
      },
    });
    expect(events).toEqual([{ type: "thread-goal-updated", goal: currentGoal }]);

    const updateResult = await registeredTools.find((tool) => tool.name === "update_goal")!.execute("update", { status: "complete" });

    expect(updateResult.content[0]).toEqual({
      type: "text",
      text: "Goal complete. Ambient will add the completion message and clear the goal after final run accounting.",
    });
    expect(updateResult.details).toMatchObject({
      runtime: "ambient-goal-mode",
      status: "complete",
      goal: {
        status: "complete",
        statusReason: "Marked complete by Ambient/Pi after completion audit.",
      },
    });
    expect(finalizedGoals).toEqual([currentGoal]);
  });

  it("injects active goal context and removes stale context when inactive", async () => {
    const handlers = new Map<string, (event: any) => Promise<any>>();
    const registeredTools: RegisteredTool[] = [];
    let currentGoal: ThreadGoal | undefined = goal({ objective: "Keep simplifying", tokenBudget: 42, tokensUsed: 10 });

    createGoalModeToolExtension({
      threadId: "thread-1",
      store: {
        getThread: () => ({ collaborationMode: "agent" }) as any,
        getThreadGoal: () => currentGoal,
        createThreadGoalIfAbsent: () => currentGoal!,
        markThreadGoalStatus: () => currentGoal!,
      },
      hasActiveRun: () => true,
      finalizeCompletedThreadGoal: (goal) => goal,
      emit: () => undefined,
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
      on: (event: string, handler: any) => handlers.set(event, handler),
    } as any);

    expect(registeredTools.map((tool) => tool.name)).toEqual(["get_goal", "update_goal"]);

    const beforeAgentStart = await handlers.get("before_agent_start")!({ systemPrompt: "base prompt" });
    expect(beforeAgentStart.systemPrompt).toContain("[AMBIENT GOAL MODE ACTIVE]");
    expect(beforeAgentStart.systemPrompt).toContain("Do not call create_goal while this goal is active");
    expect(beforeAgentStart.message).toMatchObject({
      customType: GOAL_CONTEXT_CUSTOM_TYPE,
      display: false,
    });
    expect(beforeAgentStart.message.content).toContain("Remaining token budget estimate: 32");

    currentGoal = undefined;
    const context = await handlers.get("context")!({
      messages: [
        { role: "user", content: "hello" },
        { customType: GOAL_CONTEXT_CUSTOM_TYPE, content: "stale", display: false },
      ],
    });

    expect(context).toEqual({
      messages: [{ role: "user", content: "hello" }],
    });
  });

  it("blocks complete updates when artifact validation fails", async () => {
    const registeredTools: RegisteredTool[] = [];
    const events: unknown[] = [];
    const finalizedGoals: ThreadGoal[] = [];
    let currentGoal: ThreadGoal | undefined = goal({ objective: "Make a moving sandstorm screensaver" });

    createGoalModeToolExtension({
      threadId: "thread-1",
      store: {
        getThread: () => ({ collaborationMode: "agent" }) as any,
        getThreadGoal: () => currentGoal,
        createThreadGoalIfAbsent: () => currentGoal!,
        markThreadGoalStatus: (_threadId, status) => {
          currentGoal = { ...currentGoal!, status };
          return currentGoal;
        },
      },
      hasActiveRun: () => false,
      finalizeCompletedThreadGoal: (goal) => {
        finalizedGoals.push(goal);
        return goal;
      },
      emit: (event) => events.push(event),
      validateGoalCompletion: () => ({
        ok: false,
        message: "Goal completion validation failed for browser artifact(s).\n- index.html: missing closing </html> tag.",
        issues: ["index.html: missing closing </html> tag."],
        artifactPaths: ["index.html"],
        repairInstructions: ["Repair the HTML before marking complete."],
      }),
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
      on: () => undefined,
    } as any);

    const updateResult = await registeredTools.find((tool) => tool.name === "update_goal")!.execute("update", { status: "complete" });

    expect(updateResult.details).toMatchObject({
      runtime: "ambient-goal-mode",
      status: "error",
      goal: { status: "active" },
      goalCompletionValidation: {
        ok: false,
        artifactPaths: ["index.html"],
      },
    });
    expect(updateResult.content[0].text).toContain("missing closing </html>");
    expect(currentGoal?.status).toBe("active");
    expect(events).toEqual([]);
    expect(finalizedGoals).toEqual([]);
  });
});

function goal(input: Partial<ThreadGoal> = {}): ThreadGoal {
  return {
    threadId: "thread-1",
    goalId: "goal-1",
    objective: "Simplify runtime",
    status: "active",
    tokenBudget: undefined,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    continuationTurns: 0,
    noProgressTurns: 0,
    createdAt: "2026-06-07T16:00:00.000Z",
    updatedAt: "2026-06-07T16:00:00.000Z",
    ...input,
  };
}
