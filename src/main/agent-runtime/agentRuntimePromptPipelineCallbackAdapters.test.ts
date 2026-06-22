import { describe, expect, it, vi } from "vitest";

import type { WorkflowPlanEditIntentKind } from "../../shared/workflowThreadPlanEdit";
import {
  createAgentRuntimePromptPipelineCallbackAdapters,
  type AgentRuntimePromptPipelineCallbackAdapterInput,
} from "./agentRuntimePromptPipelineCallbackAdapters";

describe("AgentRuntime prompt pipeline callback adapters", () => {
  it("keeps workflow plan, pending switch, run lookup, and preflight adapters stable", async () => {
    const intentByThreadId = new Map<string, WorkflowPlanEditIntentKind>();
    const workflowThreadByThreadId = new Map<string, string>();
    const runRecord = { id: "run-1" };
    const getRunRecord = vi.fn((runId: string) => {
      if (runId === "run-1") return runRecord;
      throw new Error("missing run");
    });
    const preflightBeforePrompt = vi.fn(async () => undefined);
    const pendingProjectSwitches = {
      completePendingProjectSwitch: vi.fn(async () => "completed" as const),
      deletePendingProjectSwitch: vi.fn(),
      takePendingProjectSwitch: vi.fn(() => ({ runtimeEventId: "event-1" })),
    };
    const callbacks = createAgentRuntimePromptPipelineCallbackAdapters({
      store: { getRunRecord } as never,
      workflowPlanEditIntentByThreadId: intentByThreadId,
      workflowPlanEditWorkflowThreadByThreadId: workflowThreadByThreadId,
      pendingProjectSwitches: pendingProjectSwitches as never,
      runtime: runtimeCallbacks({ preflightBeforePrompt }),
    });
    const preflightInput = {
      thread: { id: "thread-1" },
      session: { id: "session-1" },
      promptContent: [{ type: "text", text: "Hello" }],
      setActiveRunStatus: vi.fn(),
      isRunStoreActive: vi.fn(),
      emitRunEvent: vi.fn(),
    } as unknown as Parameters<typeof callbacks.preflightBeforePrompt>[0];

    callbacks.setWorkflowPlanEditIntent("thread-1", "question", "workflow-thread-1");
    expect(intentByThreadId.get("thread-1")).toBe("question");
    expect(workflowThreadByThreadId.get("thread-1")).toBe("workflow-thread-1");
    callbacks.clearWorkflowPlanEditIntent("thread-1");
    expect(intentByThreadId.has("thread-1")).toBe(false);
    expect(workflowThreadByThreadId.has("thread-1")).toBe(false);

    expect(callbacks.getRunRecord("run-1")).toBe(runRecord);
    expect(callbacks.getRunRecord("missing")).toBeUndefined();
    await callbacks.preflightBeforePrompt(preflightInput);
    expect(preflightBeforePrompt).toHaveBeenCalledWith(
      preflightInput.thread,
      preflightInput.session,
      preflightInput.promptContent,
      preflightInput.setActiveRunStatus,
      preflightInput.isRunStoreActive,
      preflightInput.emitRunEvent,
    );
    expect(callbacks.takePendingProjectSwitch("thread-1")).toEqual({ runtimeEventId: "event-1" });
    callbacks.deletePendingProjectSwitch("thread-1");
    expect(pendingProjectSwitches.deletePendingProjectSwitch).toHaveBeenCalledWith("thread-1");
  });
});

function runtimeCallbacks(input: {
  preflightBeforePrompt: AgentRuntimePromptPipelineCallbackAdapterInput["runtime"]["preflightBeforePrompt"];
}): AgentRuntimePromptPipelineCallbackAdapterInput["runtime"] {
  return {
    abortSessionRun: vi.fn(async () => undefined),
    applyThreadModelSettings: vi.fn(async () => undefined),
    commitThreadPiSessionFile: vi.fn(async () => undefined),
    currentFeatureFlagSnapshot: vi.fn(() => ({
      flags: {},
      generatedAt: "2026-06-22T00:00:00.000Z",
      schemaVersion: "ambient-feature-flags-v1",
    })),
    emit: vi.fn(),
    generateTitleIfNeeded: vi.fn(),
    getSession: vi.fn(async () => ({} as never)),
    preflightBeforePrompt: input.preflightBeforePrompt,
    recordCallableWorkflowFinalizationBlockedParentMailbox: vi.fn(),
    recordContextUsageSnapshot: vi.fn(() => ({} as never)),
    recordSubagentFinalizationBlockedParentMailbox: vi.fn(),
    refreshBrowsersForArtifactChange: vi.fn(async () => undefined),
    resolveCallableWorkflowFinalizationBlock: vi.fn(() => undefined),
    resolveSubagentFinalizationBlock: vi.fn(() => undefined),
    send: vi.fn(async () => undefined),
    suppressCallableWorkflowParentAssistantMessages: vi.fn(),
  } as unknown as AgentRuntimePromptPipelineCallbackAdapterInput["runtime"];
}
