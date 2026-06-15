import type { AgentToolResult, ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { ThreadGoal, ThreadGoalStatus, ThreadSummary } from "../shared/types";
import type { GoalCompletionValidationResult } from "./agentRuntimeGoalCompletionValidation";
import type { ProjectStore } from "./projectStore";

export const GOAL_CONTEXT_CUSTOM_TYPE = "ambient-goal-mode-context";

export interface GoalModeToolExtensionOptions {
  threadId: string;
  store: Pick<ProjectStore, "getThread" | "getThreadGoal" | "createThreadGoalIfAbsent" | "markThreadGoalStatus">;
  hasActiveRun: () => boolean;
  finalizeCompletedThreadGoal: (goal: ThreadGoal) => ThreadGoal;
  emit: (event: { type: "thread-goal-updated"; goal: ThreadGoal }) => void;
  validateGoalCompletion?: (goal: ThreadGoal) => Promise<GoalCompletionValidationResult> | GoalCompletionValidationResult;
}

export function createGoalModeToolExtension(options: GoalModeToolExtensionOptions): ExtensionFactory {
  return (pi) => {
    const currentGoal = options.store.getThreadGoal(options.threadId);

    pi.registerTool({
      name: "get_goal",
      label: "Get Goal",
      description: "Read the active Ambient Desktop thread goal, if one exists. This tool is read-only.",
      promptSnippet: "get_goal: Inspect the current Ambient goal and remaining budget before deciding whether goal work is complete.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      executionMode: "sequential",
      execute: async () => getGoalToolResult(options),
    });

    if (!currentGoal) {
      pi.registerTool({
        name: "create_goal",
        label: "Create Goal",
        description:
          "Create one active goal for this thread only when the user, system, or developer explicitly asks Ambient to pursue a goal. Fails if a goal already exists.",
        promptSnippet: "create_goal: Create a durable thread goal only when goal pursuit was explicitly requested.",
        parameters: {
          type: "object",
          properties: {
            objective: { type: "string", description: "The concrete objective Ambient should pursue until complete or blocked." },
            token_budget: { type: "integer", minimum: 1, description: "Optional positive estimated token budget." },
          },
          required: ["objective"],
          additionalProperties: false,
        },
        executionMode: "sequential",
        execute: async (_toolCallId, params) => createGoalToolResult(options, params),
      });
    }

    pi.registerTool({
      name: "update_goal",
      label: "Update Goal",
      description:
        "Mark the current Ambient goal complete or blocked. Only use complete after evidence proves the whole objective is achieved. Only use blocked after the same blocker has repeated for the required audit turns. This tool cannot pause, resume, clear, or budget-limit goals.",
      promptSnippet: "update_goal: Mark a goal complete or blocked after the required evidence audit.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["complete", "blocked"] },
        },
        required: ["status"],
        additionalProperties: false,
      },
      executionMode: "sequential",
      execute: async (_toolCallId, params) => updateGoalToolResult(options, params),
    });

    pi.on("context", async (event: any) => {
      if (!Array.isArray(event.messages)) return undefined;
      const goal = goalContextForThread(options);
      if (!goal) {
        return {
          messages: event.messages.filter((message: any) => message?.customType !== GOAL_CONTEXT_CUSTOM_TYPE),
        };
      }
      return undefined;
    });

    pi.on("before_agent_start", async (event: any) => {
      const goal = goalContextForThread(options);
      if (!goal) return undefined;
      return {
        systemPrompt: `${event.systemPrompt}\n\n${goalModeSystemPrompt(goal)}`,
        message: {
          customType: GOAL_CONTEXT_CUSTOM_TYPE,
          content: goalModeContextMessage(goal),
          display: false,
        },
      };
    });
  };
}

function goalContextForThread(options: GoalModeToolExtensionOptions): ThreadGoal | undefined {
  const thread: Pick<ThreadSummary, "collaborationMode"> = options.store.getThread(options.threadId);
  if (thread.collaborationMode === "planner") return undefined;
  const goal = options.store.getThreadGoal(options.threadId);
  return goal?.status === "active" ? goal : undefined;
}

function goalModeSystemPrompt(goal: ThreadGoal): string {
  return [
    "[AMBIENT GOAL MODE ACTIVE]",
    "A durable per-thread goal is active. Continue ordinary user-requested work, but keep the goal in view until it is complete, blocked, paused by Ambient, or budget-limited.",
    "Use get_goal whenever the current goal state or remaining budget matters.",
    "Do not call create_goal while this goal is active; Ambient has already created the durable goal.",
    "Use update_goal({ status: \"complete\" }) only after current evidence proves every explicit requirement is satisfied.",
    "For HTML, browser, visual, canvas, WebGL, animation, or screensaver artifacts, complete is gated by Ambient validation: completed files, parseable JavaScript, local browser load proof, and changing frames when motion is required. If update_goal reports validation errors, repair the artifact and try again.",
    "Use update_goal({ status: \"blocked\" }) only after the same blocking condition has repeated for the required blocked audit turns and no meaningful progress is possible without user input or external state.",
    "Do not call update_goal to pause, resume, clear, usage-limit, or budget-limit a goal. Those state changes are Ambient-owned.",
    `Current goal id: ${goal.goalId}.`,
  ].join("\n");
}

function goalModeContextMessage(goal: ThreadGoal): string {
  const remaining = goalRemainingTokenBudget(goal);
  return [
    "[AMBIENT GOAL STATE]",
    `Goal id: ${goal.goalId}`,
    `Status: ${goal.status}`,
    `Objective: ${goal.objective}`,
    `Tokens used estimate: ${goal.tokensUsed}`,
    goal.tokenBudget !== undefined ? `Token budget estimate: ${goal.tokenBudget}` : "Token budget estimate: none",
    remaining !== undefined ? `Remaining token budget estimate: ${remaining}` : undefined,
    `Continuation turns: ${goal.continuationTurns}`,
    `No-progress turns: ${goal.noProgressTurns}`,
    goal.statusReason ? `Latest status reason: ${goal.statusReason}` : undefined,
  ].filter(Boolean).join("\n");
}

function getGoalToolResult(options: GoalModeToolExtensionOptions): AgentToolResult<Record<string, unknown>> {
  const goal = options.store.getThreadGoal(options.threadId);
  if (!goal) return goalToolResult("No goal is currently active for this thread.");
  return goalToolResult(goalToolSummary(goal), goal);
}

function createGoalToolResult(options: GoalModeToolExtensionOptions, params: unknown): AgentToolResult<Record<string, unknown>> {
  if (options.store.getThread(options.threadId).collaborationMode === "planner") {
    return goalToolResult("Goal creation is disabled while Planner mode is active.", undefined, "error");
  }
  const current = options.store.getThreadGoal(options.threadId);
  if (current) {
    return goalToolResult(
      "A goal already exists for this thread. Use update_goal only for complete or blocked, or wait for Ambient/user action to pause, resume, edit, or clear it.",
      current,
      "error",
    );
  }
  const input = objectRecord(params);
  const objective = typeof input.objective === "string" ? input.objective.trim() : "";
  if (!objective) return goalToolResult("Goal objective is required.", undefined, "error");
  const tokenBudget = typeof input.token_budget === "number" && Number.isFinite(input.token_budget) && input.token_budget > 0
    ? Math.floor(input.token_budget)
    : null;
  const goal = options.store.createThreadGoalIfAbsent({ threadId: options.threadId, objective, tokenBudget });
  options.emit({ type: "thread-goal-updated", goal });
  return goalToolResult(goalToolSummary(goal), goal);
}

async function updateGoalToolResult(options: GoalModeToolExtensionOptions, params: unknown): Promise<AgentToolResult<Record<string, unknown>>> {
  if (options.store.getThread(options.threadId).collaborationMode === "planner") {
    return goalToolResult("Goal updates are disabled while Planner mode is active.", undefined, "error");
  }
  const current = options.store.getThreadGoal(options.threadId);
  if (!current) return goalToolResult("No goal exists for this thread.", undefined, "error");
  const rawStatus = objectRecord(params).status;
  const status: ThreadGoalStatus | undefined = rawStatus === "complete" || rawStatus === "blocked" ? rawStatus : undefined;
  if (!status) return goalToolResult("update_goal only accepts status \"complete\" or \"blocked\".", current, "error");
  if (status === "complete" && options.validateGoalCompletion) {
    const validation = await options.validateGoalCompletion(current);
    if (!validation.ok) {
      return goalToolResult(
        validation.message ?? "Goal completion validation failed. Repair the reported artifacts before marking the goal complete.",
        current,
        "error",
        { goalCompletionValidation: validation },
      );
    }
  }
  const goal = options.store.markThreadGoalStatus(options.threadId, status, {
    expectedGoalId: current.goalId,
    statusReason: status === "complete" ? "Marked complete by Ambient/Pi after completion audit." : "Marked blocked by Ambient/Pi after blocked audit.",
  });
  options.emit({ type: "thread-goal-updated", goal });
  if (status === "complete" && !options.hasActiveRun()) options.finalizeCompletedThreadGoal(goal);
  const message = status === "complete"
    ? "Goal complete. Ambient will add the completion message and clear the goal after final run accounting."
    : `Goal blocked. Usage estimate so far: ${goal.tokensUsed} tokens, ${goal.timeUsedSeconds} seconds.`;
  return goalToolResult(message, goal);
}

function goalRemainingTokenBudget(goal: ThreadGoal): number | undefined {
  return goal.tokenBudget !== undefined ? Math.max(0, goal.tokenBudget - goal.tokensUsed) : undefined;
}

function goalToolSummary(goal: ThreadGoal): string {
  const remaining = goalRemainingTokenBudget(goal);
  return [
    `Goal status: ${goal.status}.`,
    `Objective: ${goal.objective}`,
    `Usage estimate: ${goal.tokensUsed} tokens, ${goal.timeUsedSeconds} seconds.`,
    goal.tokenBudget !== undefined ? `Token budget: ${goal.tokenBudget}; remaining: ${remaining}.` : "Token budget: none.",
    `Continuation turns: ${goal.continuationTurns}; no-progress turns: ${goal.noProgressTurns}.`,
    goal.statusReason ? `Latest reason: ${goal.statusReason}` : undefined,
  ].filter(Boolean).join("\n");
}

function goalToolResult(
  message: string,
  goal?: ThreadGoal,
  status: "complete" | "error" = "complete",
  extraDetails: Record<string, unknown> = {},
): AgentToolResult<Record<string, unknown>> {
  const remainingTokenBudget = goal ? goalRemainingTokenBudget(goal) : undefined;
  return {
    content: [{ type: "text", text: message }],
    details: {
      runtime: "ambient-goal-mode",
      toolName: "goal_mode",
      status,
      message,
      ...(goal ? { goal } : {}),
      ...(remainingTokenBudget !== undefined ? { remainingTokenBudget } : {}),
      ...extraDetails,
    },
  };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
