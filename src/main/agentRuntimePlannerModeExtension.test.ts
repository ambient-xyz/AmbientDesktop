import { describe, expect, it } from "vitest";

import type { CollaborationMode } from "../shared/types";
import type { WorkflowPlanEditIntentKind } from "../shared/workflowThreadPlanEdit";
import {
  createPlannerModeExtension,
  PLANNER_MODE_SYSTEM_PROMPT,
} from "./agentRuntimePlannerModeExtension";

type ExtensionHandler = (event: any) => unknown | Promise<unknown>;

describe("createPlannerModeExtension", () => {
  it("activates Planner Mode tools from the preserved normal tool set", async () => {
    const state = plannerState("planner", undefined);
    const pi = fakePi({
      activeTools: [
        "read",
        "browser_screenshot",
        "ambient_tool_search",
        "ambient_tool_describe",
        "ambient_tool_call",
      ],
      allTools: [
        "read",
        "browser_screenshot",
        "ambient_visual_analyze",
        "ambient_visual_minicpm_setup",
      ],
    });
    createPlannerModeExtension(state.options)(pi.instance as any);

    await pi.run("session_start", {});

    expect(pi.activeTools).toEqual([
      "read",
      "browser_screenshot",
      "ambient_visual_analyze",
    ]);
  });

  it("applies workflow plan edit intent filters when Planner Mode starts", async () => {
    const state = plannerState("planner", "question");
    const pi = fakePi({
      activeTools: [
        "read",
        "workflow_update_run_settings",
        "workflow_propose_revision",
        "workflow_propose_manifest_revision",
      ],
      allTools: [
        "read",
        "workflow_update_run_settings",
        "workflow_propose_revision",
        "workflow_propose_manifest_revision",
      ],
    });
    createPlannerModeExtension(state.options)(pi.instance as any);

    await pi.run("session_start", {});

    expect(pi.activeTools).toEqual(["read"]);
  });

  it("injects Planner Mode prompt and hidden context before agent start", async () => {
    const state = plannerState("planner", undefined);
    const pi = fakePi({
      activeTools: ["read"],
      allTools: ["read"],
    });
    createPlannerModeExtension(state.options)(pi.instance as any);

    const [result] = await pi.run("before_agent_start", { systemPrompt: "Base prompt" });

    expect(result).toEqual({
      systemPrompt: `Base prompt\n\n${PLANNER_MODE_SYSTEM_PROMPT}`,
      message: {
        customType: "ambient-planner-mode-context",
        content: expect.stringContaining("Allowed tools: read"),
        display: false,
      },
    });
  });

  it("removes hidden Planner Mode context outside Planner Mode", async () => {
    const state = plannerState("agent", undefined);
    const pi = fakePi({
      activeTools: ["read"],
      allTools: ["read"],
    });
    createPlannerModeExtension(state.options)(pi.instance as any);

    const normalMessage = { role: "user", content: "hello" };
    const [result] = await pi.run("context", {
      messages: [
        normalMessage,
        { customType: "ambient-planner-mode-context", role: "system", content: "planner mode" },
      ],
    });

    expect(result).toEqual({
      messages: [normalMessage],
    });
  });

  it("restores the normal tool set after leaving Planner Mode", async () => {
    const state = plannerState("planner", undefined);
    const pi = fakePi({
      activeTools: ["read", "ambient_tool_call"],
      allTools: ["read"],
    });
    createPlannerModeExtension(state.options)(pi.instance as any);

    await pi.run("session_start", {});
    expect(pi.activeTools).toEqual(["read"]);

    state.mode = "agent";
    const [result] = await pi.run("before_agent_start", { systemPrompt: "Base prompt" });

    expect(result).toBeUndefined();
    expect(pi.activeTools).toEqual(["read", "ambient_tool_call"]);
  });
});

function plannerState(
  mode: CollaborationMode,
  intent: WorkflowPlanEditIntentKind | undefined,
) {
  const state = {
    mode,
    intent,
    options: {
      threadId: "thread-1",
      getThread: () => ({ collaborationMode: state.mode }),
      getPlanEditIntentKind: () => state.intent,
    },
  };
  return state;
}

function fakePi(input: { activeTools: string[]; allTools: string[] }) {
  let activeTools = [...input.activeTools];
  const handlers = new Map<string, ExtensionHandler[]>();
  return {
    get activeTools() {
      return activeTools;
    },
    instance: {
      on: (eventName: string, handler: ExtensionHandler) => {
        handlers.set(eventName, [...(handlers.get(eventName) ?? []), handler]);
      },
      getActiveTools: () => activeTools,
      getAllTools: () => input.allTools.map((name) => ({ name })),
      setActiveTools: (tools: string[]) => {
        activeTools = tools;
      },
    },
    run: async (eventName: string, event: any) => {
      const results = [];
      for (const handler of handlers.get(eventName) ?? []) {
        results.push(await handler(event));
      }
      return results;
    },
  };
}
