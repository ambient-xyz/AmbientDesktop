import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type {
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import {
  CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON,
  CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION,
  type CallableWorkflowParentBlockingBlock,
} from "./agentRuntimeCallableWorkflowFacade";
import {
  AgentRuntimeFinalizationCoordinator,
  type AgentRuntimeFinalizationCoordinatorOptions,
} from "./agentRuntimeFinalizationCoordinator";

type FinalizationStore = AgentRuntimeFinalizationCoordinatorOptions["store"];
type CallableWorkflowParentBlockingTask = CallableWorkflowParentBlockingBlock["tasks"][number];

describe("AgentRuntimeFinalizationCoordinator", () => {
  it("reconciles terminal child wait barriers before resolving finalization blocks", () => {
    const barrier = waitBarrier({
      id: "barrier-1",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      status: "waiting_on_children",
      dependencyMode: "required_all",
      childRunIds: ["child-run"],
    });
    const childRun = subagentRun({
      id: "child-run",
      status: "completed",
    });
    const resolveTerminalChildWaitBarriers = vi.fn(() => {
      barrier.status = "satisfied";
    });
    const coordinator = new AgentRuntimeFinalizationCoordinator({
      store: storeDouble({
        listSubagentWaitBarriersForParentRun: vi.fn(() => [barrier]),
        getSubagentRun: vi.fn(() => childRun),
      }),
      emit: vi.fn(),
      resolveTerminalChildWaitBarriers,
    });

    expect(coordinator.subagentFinalizationBarrierBlock("parent-thread", "parent-run")).toBeUndefined();
    expect(resolveTerminalChildWaitBarriers).toHaveBeenCalledWith(
      childRun,
      "finalization_reconciliation:completed",
    );
  });

  it("suppresses callable workflow parent assistant output and emits message/thread updates", () => {
    const ownedMessage = message({
      id: "assistant-owned",
      createdAt: "2026-06-21T00:00:01.000Z",
      content: "Workflow-owned output.",
    });
    const laterMessage = message({
      id: "assistant-later",
      createdAt: "2026-06-21T00:00:03.000Z",
      content: "Later workflow output.",
    });
    const preservedMessage = message({
      id: "assistant-preserved",
      createdAt: "2026-06-21T00:00:04.000Z",
      content: "Current blocked message.",
    });
    const userMessage = {
      ...message({ id: "user-message", createdAt: "2026-06-21T00:00:05.000Z", content: "User text." }),
      role: "user",
    } as ChatMessage;
    const updatedMessages: ChatMessage[] = [];
    const emitted: DesktopEvent[] = [];
    const replaceMessage = vi.fn((messageId: string, content: string, metadata: Record<string, unknown>) => {
      const source = [ownedMessage, laterMessage, preservedMessage, userMessage].find((candidate) => candidate.id === messageId);
      const updated = {
        ...(source ?? ownedMessage),
        content,
        metadata,
      } as ChatMessage;
      updatedMessages.push(updated);
      return updated;
    });
    const coordinator = new AgentRuntimeFinalizationCoordinator({
      store: storeDouble({
        listMessages: vi.fn(() => [ownedMessage, laterMessage, preservedMessage, userMessage]),
        replaceMessage,
        getThread: vi.fn(() => thread()),
      }),
      emit: (event) => emitted.push(event),
      resolveTerminalChildWaitBarriers: vi.fn(),
    });

    coordinator.suppressCallableWorkflowParentAssistantMessages(callableWorkflowParentBlockingBlock({
      parentThreadId: "parent-thread",
      parentMessageId: ownedMessage.id,
      taskIds: ["workflow-task"],
      tasks: [callableWorkflowParentBlockingTask({
        id: "workflow-task",
        parentMessageId: ownedMessage.id,
        createdAt: "2026-06-21T00:00:02.000Z",
      })],
    }), { preserveMessageId: preservedMessage.id });

    expect(replaceMessage).toHaveBeenCalledTimes(2);
    expect(updatedMessages.map((updated) => updated.id)).toEqual(["assistant-owned", "assistant-later"]);
    expect(updatedMessages[0]?.metadata).toMatchObject({
      status: "error",
      callableWorkflowParentOutputSuppressed: {
        reason: "blocking_callable_workflow_not_synthesis_safe",
        taskIds: ["workflow-task"],
        parentMessageId: "assistant-owned",
      },
    });
    expect(emitted.map((event) => event.type)).toEqual([
      "message-updated",
      "message-updated",
      "thread-updated",
    ]);
  });
});

function storeDouble(overrides: Partial<FinalizationStore> = {}): FinalizationStore {
  const defaults: FinalizationStore = {
    appendSubagentParentMailboxEvent: vi.fn((input) => parentMailboxEvent(input)),
    getSubagentRun: vi.fn(() => subagentRun()),
    getSubagentWaitBarrier: vi.fn(() => waitBarrier()),
    getThread: vi.fn(() => thread()),
    listCallableWorkflowTasksForParentRun: vi.fn(() => []),
    listMessages: vi.fn(() => []),
    listSubagentMailboxEvents: vi.fn(() => []),
    listSubagentRunEvents: vi.fn(() => []),
    listSubagentWaitBarriersForParentRun: vi.fn(() => []),
    replaceMessage: vi.fn((messageId, content, metadata) => message({
      id: messageId,
      content,
      metadata: metadata ?? {},
    })),
  };
  return { ...defaults, ...overrides };
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message",
    threadId: "parent-thread",
    role: "assistant",
    content: "",
    createdAt: "2026-06-21T00:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

function thread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "parent-thread",
    title: "Parent",
    workspacePath: "/tmp/workspace",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    lastMessagePreview: "",
    model: "ambient-test-model",
    thinkingLevel: "medium",
    permissionMode: "workspace",
    collaborationMode: "agent",
    ...overrides,
  };
}

function waitBarrier(overrides: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier-1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-run-1"],
    dependencyMode: "required_all",
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:01.000Z",
    ...overrides,
  };
}

function subagentRun(overrides: Partial<SubagentRunSummary> = {}): SubagentRunSummary {
  return {
    id: "child-run-1",
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    childThreadId: "child-thread",
    canonicalTaskPath: "Task",
    roleId: "worker",
    roleProfileSnapshot: {} as SubagentRunSummary["roleProfileSnapshot"],
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: "running",
    featureFlagSnapshot: {} as SubagentRunSummary["featureFlagSnapshot"],
    modelRuntimeSnapshot: {} as SubagentRunSummary["modelRuntimeSnapshot"],
    capacityLeaseSnapshot: {} as SubagentRunSummary["capacityLeaseSnapshot"],
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:01.000Z",
    ...overrides,
  };
}

function callableWorkflowParentBlockingBlock(
  overrides: Partial<CallableWorkflowParentBlockingBlock> = {},
): CallableWorkflowParentBlockingBlock {
  const task = callableWorkflowParentBlockingTask();
  return {
    schemaVersion: CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION,
    reason: CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON,
    message: "Callable workflow is still blocking parent synthesis.",
    instruction: "Wait for the blocking workflow.",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    synthesisAllowed: false,
    parentFinalizationBlocked: true,
    taskIds: [task.id],
    launchIds: [task.launchId],
    workflowArtifactIds: [],
    workflowRunIds: [],
    waitingTaskIds: [task.id],
    attentionTaskIds: [],
    tasks: [task],
    ...overrides,
  };
}

function callableWorkflowParentBlockingTask(
  overrides: Partial<CallableWorkflowParentBlockingTask> = {},
): CallableWorkflowParentBlockingTask {
  return {
    id: "workflow-task",
    launchId: "launch-1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    toolCallId: "tool-call-1",
    toolId: "tool-1",
    toolName: "run_workflow",
    sourceKind: "recording",
    title: "Run workflow",
    status: "running",
    statusLabel: "Running",
    statusGroup: "waiting_on_workflow",
    blocking: true,
    runnerTarget: "workflow-runner",
    runnerDeferredReason: "running",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:01.000Z",
    ...overrides,
  };
}

function parentMailboxEvent(
  input: Parameters<FinalizationStore["appendSubagentParentMailboxEvent"]>[0],
): SubagentParentMailboxEventSummary {
  return {
    id: "mailbox-event-1",
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    type: input.type,
    payload: input.payload,
    deliveryState: input.deliveryState ?? "queued",
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  };
}
