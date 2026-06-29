import { describe, expect, it } from "vitest";

import type { DesktopEvent, DesktopState } from "../../shared/desktopTypes";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { ProjectSummary } from "../../shared/projectBoardTypes";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type { ChatMessage, ThreadGoal, ThreadSummary } from "../../shared/threadTypes";
import {
  reduceAppDesktopEventState,
} from "./AppDesktopEventStateReducer";

describe("App desktop event state reducer", () => {
  it("updates active-thread messages for incremental message events", () => {
    const state = desktopState({
      messages: [message({ id: "assistant-1", content: "Hel" })],
    });

    const withDelta = reduce(state, {
      type: "message-delta",
      messageId: "assistant-1",
      delta: "lo",
      threadId: "thread-1",
      workspacePath: "/repo",
    });
    expect(withDelta.messages[0]?.content).toBe("Hello");

    const created = message({ id: "assistant-2", content: "Done" });
    const withCreated = reduce(withDelta, {
      type: "message-created",
      message: created,
      workspacePath: "/repo",
    });
    expect(withCreated.messages.map((item) => item.id)).toEqual(["assistant-1", "assistant-2"]);

    const updated = { ...created, content: "Really done" };
    const withUpdated = reduce(withCreated, {
      type: "message-updated",
      message: updated,
      workspacePath: "/repo",
    });
    expect(withUpdated.messages[1]).toEqual(updated);
  });

  it("marks active thread updates read in renderer state", () => {
    const state = desktopState({
      threads: [
        thread({
          id: "thread-1",
          updatedAt: "2026-06-21T00:00:00.000Z",
          lastReadAt: "2026-06-21T00:00:00.000Z",
        }),
      ],
    });
    const updatedThread = thread({
      id: "thread-1",
      updatedAt: "2026-06-21T00:01:00.000Z",
      lastReadAt: "2026-06-21T00:00:00.000Z",
      lastMessagePreview: "New work while visible",
    });

    const next = reduce(state, {
      type: "thread-updated",
      thread: updatedThread,
      workspacePath: "/repo",
    });

    expect(next.threads[0]?.updatedAt).toBe("2026-06-21T00:01:00.000Z");
    expect(next.threads[0]?.lastReadAt).toBe("2026-06-21T00:01:00.000Z");
    expect(next.projects[0]?.threads[0]?.lastReadAt).toBe("2026-06-21T00:01:00.000Z");
  });

  it("routes visible subagent-child messages into child message state", () => {
    const state = desktopState({
      threads: [
        thread({ id: "thread-1" }),
        thread({ id: "child-1", kind: "subagent_child", parentThreadId: "thread-1" }),
      ],
      childMessagesByThreadId: {},
    });
    const childMessage = message({
      id: "child-message-1",
      threadId: "child-1",
      content: "partial",
    });

    const withChildMessage = reduce(state, {
      type: "message-created",
      message: childMessage,
      workspacePath: "/repo",
    });
    expect(withChildMessage.childMessagesByThreadId?.["child-1"]).toEqual([childMessage]);

    const withDelta = reduce(withChildMessage, {
      type: "message-delta",
      messageId: childMessage.id,
      threadId: "child-1",
      delta: " output",
      workspacePath: "/repo",
    });
    expect(withDelta.childMessagesByThreadId?.["child-1"]?.[0]?.content).toBe("partial output");
  });

  it("ignores locally cleared goals while applying active thread goal updates", () => {
    const state = desktopState();
    const goal = threadGoal({ threadId: "thread-1", goalId: "goal-1" });

    expect(reduce(state, {
      type: "thread-goal-updated",
      goal,
      workspacePath: "/repo",
    }, new Set(["thread-1:goal-1"]))).toBe(state);

    expect(reduce(state, {
      type: "thread-goal-updated",
      goal,
      workspacePath: "/repo",
    }).activeThreadGoal).toEqual(goal);
  });

  it("upserts subagent run state only for matching workspaces and visible runs", () => {
    const state = desktopState();
    const run = subagentRun({
      id: "run-1",
      parentThreadId: "thread-1",
      childThreadId: "child-1",
      createdAt: "2026-06-21T00:00:00.000Z",
    });

    expect(reduce(state, {
      type: "subagent-run-updated",
      run,
      workspacePath: "/other",
    })).toBe(state);

    const next = reduce(state, {
      type: "subagent-run-updated",
      run,
      workspacePath: "/repo",
    });
    expect(next.subagentRuns).toEqual([run]);
  });
});

function reduce(
  current: DesktopState,
  event: DesktopEvent,
  clearedGoalKeys: ReadonlySet<string> = new Set(),
): DesktopState {
  return reduceAppDesktopEventState({
    current,
    event,
    clearedGoalKeys,
    desktopEventMatchesWorkspace: (candidate, workspacePath) =>
      !("workspacePath" in candidate) ||
      !candidate.workspacePath ||
      !workspacePath ||
      candidate.workspacePath === workspacePath,
  }) as DesktopState;
}

function desktopState(overrides: Partial<DesktopState> = {}): DesktopState {
  const threads = overrides.threads ?? [thread({ id: "thread-1" })];
  return {
    activeThreadId: "thread-1",
    activeWorkspace: { path: "/repo" },
    app: { update: { status: "idle" } },
    callableWorkflowTasks: [],
    childMessagesByThreadId: {},
    featureFlagSnapshot: resolveAmbientFeatureFlags({
      settings: { subagents: true },
      generatedAt: "2026-06-21T00:00:00.000Z",
    }),
    messages: [],
    plannerPlanArtifacts: [],
    projects: [project({ threads })],
    provider: { hasApiKey: true, providerLabel: "Ambient" },
    queue: { steering: [], followUp: [] },
    settings: {
      collaborationMode: "agent",
      model: "example/model-id",
      permissionMode: "full-access",
      thinkingLevel: "medium",
    },
    sttDiagnostics: [],
    subagentMailboxEvents: [],
    subagentParentMailboxEvents: [],
    subagentRunEvents: [],
    subagentRuns: [],
    subagentToolScopeSnapshots: [],
    subagentWaitBarriers: [],
    threads,
    workspace: { path: "/repo" },
    ...overrides,
  } as unknown as DesktopState;
}

function project(input: { threads: ThreadSummary[] }): ProjectSummary {
  return {
    id: "project-1",
    path: "/repo",
    name: "Repo",
    statePath: "/state",
    sessionPath: "/state/session",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    threads: input.threads,
  };
}

function thread(input: Partial<ThreadSummary> & { id: string }): ThreadSummary {
  const { id, ...rest } = input;
  return {
    id,
    title: id,
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    kind: "chat",
    permissionMode: "full-access",
    collaborationMode: "agent",
    model: "example/model-id",
    thinkingLevel: "medium",
    ...rest,
  } as ThreadSummary;
}

function message(input: Partial<ChatMessage> & { id: string; content: string }): ChatMessage {
  return {
    threadId: "thread-1",
    role: "assistant",
    createdAt: "2026-06-21T00:00:00.000Z",
    ...input,
  } as ChatMessage;
}

function threadGoal(input: Pick<ThreadGoal, "threadId" | "goalId">): ThreadGoal {
  return {
    ...input,
    objective: "Finish",
    status: "active",
    tokensUsed: 0,
    timeUsedSeconds: 0,
    continuationTurns: 0,
    noProgressTurns: 0,
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  };
}

function subagentRun(input: Pick<SubagentRunSummary, "id" | "parentThreadId" | "childThreadId" | "createdAt">): SubagentRunSummary {
  return {
    ...input,
    protocolVersion: "ambient-subagent-v1",
    parentRunId: "parent-run",
    canonicalTaskPath: "Task",
    roleId: "implementer",
    roleProfileSnapshot: { id: "implementer", name: "Implementer", prompt: "Build it" },
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "parallel",
    status: "running",
    featureFlagSnapshot: resolveAmbientFeatureFlags({
      settings: { subagents: true },
      generatedAt: "2026-06-21T00:00:00.000Z",
    }),
    modelRuntimeSnapshot: {},
    capacityLeaseSnapshot: {},
    updatedAt: input.createdAt,
  } as unknown as SubagentRunSummary;
}
