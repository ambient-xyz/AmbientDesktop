import { describe, expect, it } from "vitest";

import type { ProjectBoardCard } from "../shared/types";
import { createProjectBoardTaskToolExtension } from "./agentRuntimeProjectBoardTaskTools";
import { projectBoardNativeTaskToolDefinitions } from "./project-board/projectBoardTaskTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("createProjectBoardTaskToolExtension", () => {
  it("registers project-board task tools and records native task actions", async () => {
    const registeredTools: RegisteredTool[] = [];
    const updates: any[] = [];
    const recordedActions: unknown[] = [];
    const runs = [
      { id: "run-other", threadId: "other-thread", status: "running" },
      { id: "run-1", threadId: "thread-1", status: "running" },
    ] as any[];

    createProjectBoardTaskToolExtension({
      threadId: "thread-1",
      store: {
        getProjectBoardCardForExecutionThread: () => card(),
        listOrchestrationRuns: () => runs,
        recordProjectBoardTaskToolAction: (input) => {
          recordedActions.push(input);
          return { id: "recorded-run-1" } as any;
        },
      },
      now: () => "2026-06-07T16:30:00.000Z",
    })({
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    } as any);

    expect(registeredTools.map((tool) => tool.name)).toEqual(projectBoardNativeTaskToolDefinitions().map((definition) => definition.name));
    expect(registeredTools.every((tool) => tool.executionMode === "sequential")).toBe(true);

    const taskShow = registeredTools.find((tool) => tool.name === "task_show");
    const result = await taskShow!.execute("tool-call-1", { requested: ["card", "proof"] }, undefined, (update: any) => updates.push(update));

    expect(updates).toEqual([
      {
        content: [{ type: "text", text: "Recording show task context for project-board card \"Extract task tools\"." }],
        details: {
          runtime: "project-board-task",
          toolName: "task_show",
          status: "running",
          cardId: "card-1",
        },
      },
    ]);
    expect(recordedActions).toEqual([
      expect.objectContaining({
        runId: "run-1",
        cardId: "card-1",
        taskId: "task-1",
        toolName: "task_show",
        source: "native_tool",
        action: expect.objectContaining({
          action: "task_show",
          actionId: "task_show-tool-call-1",
          createdAt: "2026-06-07T16:30:00.000Z",
          cardId: "card-1",
          taskId: "task-1",
          runId: "run-1",
          metadata: expect.objectContaining({
            transport: "native_tool",
            toolName: "task_show",
          }),
        }),
      }),
    ]);
    expect(result).toMatchObject({
      details: {
        runtime: "project-board-task",
        toolName: "task_show",
        status: "complete",
        action: "task_show",
        actionId: "task_show-tool-call-1",
        cardId: "card-1",
        taskId: "task-1",
        runId: "run-1",
        durablyRecorded: true,
      },
    });
    expect(result.content[0].text).toContain("Current project-board card context");
    expect(result.content[0].text).toContain("Acceptance criteria:");
    expect(result.content[0].text).toContain("- Unit proof: Unit test");
  });

  it("does not register tools when no execution card is active", () => {
    const registeredTools: RegisteredTool[] = [];

    createProjectBoardTaskToolExtension({
      threadId: "thread-1",
      store: {
        getProjectBoardCardForExecutionThread: () => undefined,
        listOrchestrationRuns: () => [],
        recordProjectBoardTaskToolAction: () => undefined as any,
      },
    })({
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    } as any);

    expect(registeredTools).toEqual([]);
  });
});

function card(): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Extract task tools",
    description: "Move project-board task tool registration.",
    status: "in_progress",
    candidateStatus: "ready_to_create",
    labels: ["simplification"],
    acceptanceCriteria: ["AgentRuntime delegates task tool registration."],
    blockedBy: ["card-0"],
    testPlan: {
      unit: ["Unit test"],
      integration: ["Typecheck"],
      visual: [],
      manual: [],
    },
    sourceKind: "manual",
    sourceId: "manual-card-1",
    orchestrationTaskId: "task-1",
    sourceRefs: ["simplificationPlan.html"],
    clarificationQuestions: ["Keep behavior preserving?"],
    runFeedback: [
      {
        id: "feedback-1",
        createdAt: "2026-06-07T16:00:00.000Z",
        source: "manual",
        feedback: "Prefer move-only extraction.",
      },
    ],
    createdAt: "2026-06-07T15:00:00.000Z",
    updatedAt: "2026-06-07T15:00:00.000Z",
  } as ProjectBoardCard;
}
