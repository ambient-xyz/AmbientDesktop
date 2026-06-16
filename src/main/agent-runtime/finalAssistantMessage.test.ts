import { describe, expect, it } from "vitest";

import {
  CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON,
  CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION,
  type CallableWorkflowParentBlockingBlock,
} from "../callableWorkflowParentBlocking";
import type { SubagentFinalizationBarrierBlock } from "../agentRuntimeFinalizationBlocking";
import type { FinalAssistantMessageInput } from "./finalAssistantMessage";
import { finalAssistantMessageModel } from "./finalAssistantMessage";

const baseInput: FinalAssistantMessageInput = {
  currentAssistantVisibleContent: "",
  abortRequested: false,
  abortMessage: "Run stopped.",
  receivedAnyText: false,
  finalizedAfterToolIdle: false,
  awaitingInputAfterTools: false,
  emptyAssistantResponse: false,
  retryEmptyAssistantResponse: false,
  emptyResponseText: "Ambient/Pi returned no assistant text after 0/10 assistant finalization retries.",
  assistantTerminalCleanupInterrupted: false,
  parentFinalizationBlockMessage: "",
  subagentFinalizationParentMailboxEventIds: [],
  providerRetryBeforeVisibleOutput: false,
  providerRetryRecovered: false,
  providerRetryAttemptCount: 0,
  discardProviderRetrySession: false,
};

function model(overrides: Partial<FinalAssistantMessageInput>) {
  return finalAssistantMessageModel({ ...baseInput, ...overrides });
}

describe("finalAssistantMessage", () => {
  it("preserves visible assistant content and provider retry metadata", () => {
    const providerRetryLastError = "x".repeat(260);

    expect(model({
      currentAssistantVisibleContent: "Done.",
      receivedAnyText: true,
      providerRetryBeforeVisibleOutput: true,
      providerRetryRecovered: true,
      providerRetryAttemptCount: 2,
      discardProviderRetrySession: true,
      providerRetrySessionFile: "/tmp/pi-session.jsonl",
      providerRetryLastError,
    })).toEqual({
      status: "done",
      content: "Done.",
      finalizationErrorText: baseInput.emptyResponseText,
      parentFinalizationBlocked: false,
      metadata: {
        status: "done",
        runtime: "pi",
        provider: "ambient",
        finalizedAfterToolIdle: false,
        awaitingInputAfterTools: false,
        piProviderRetry: {
          beforeVisibleOutput: true,
          recovered: true,
          attemptCount: 2,
          sessionDiscarded: true,
          sessionFile: "/tmp/pi-session.jsonl",
          lastError: providerRetryLastError.slice(0, 240),
        },
      },
    });
  });

  it("models abort and terminal cleanup finalization metadata", () => {
    const cleanupDiagnostic = {
      reason: "assistant-terminal-before-prompt-resolved" as const,
      cleanupAction: "abort-and-dispose-session" as const,
      promptPendingMs: 120,
      assistantTerminalGraceMs: 40,
      outputChars: 10,
      thinkingChars: 3,
      receivedAnyText: true,
      currentAssistantReceivedText: true,
      currentAssistantFinalTextChars: 10,
      sessionFile: "/tmp/pi-session.jsonl",
    };
    const subagentParentControlAbortIntent = {
      reason: "Parent cancelled.",
      message: "Parent cancelled.",
      toolCallId: "tool-1",
      waitBarrierId: "barrier-1",
    };

    expect(model({
      abortRequested: true,
      abortMessage: "Parent cancelled.",
      assistantTerminalCleanupInterrupted: true,
      assistantTerminalCleanupDiagnostic: cleanupDiagnostic,
      subagentParentControlAbortIntent,
    })).toMatchObject({
      status: "aborted",
      content: "Parent cancelled.",
      metadata: {
        status: "aborted",
        terminalCleanupInterrupted: true,
        piTerminalCleanup: cleanupDiagnostic,
        subagentParentControlAbort: subagentParentControlAbortIntent,
      },
    });
  });

  it("models exhausted empty assistant responses as final errors", () => {
    const emptyResponseText = "Ambient/Pi returned no assistant text after 10/10 assistant finalization retries.";
    const emptyAssistantResponseMetadata = {
      retryScheduled: false,
      retryUsesFreshSession: false,
      retryAttempt: 10,
      maxRetries: 10,
      retryReason: "empty_assistant_response" as const,
      retryDelayMs: 0,
      receivedAnyText: false,
      currentAssistantFinalTextChars: 0,
    };

    expect(model({
      emptyAssistantResponse: true,
      emptyResponseText,
      emptyAssistantResponseMetadata,
    })).toMatchObject({
      status: "error",
      content: emptyResponseText,
      finalizationErrorText: emptyResponseText,
      metadata: {
        status: "error",
        piEmptyAssistantResponse: emptyAssistantResponseMetadata,
      },
    });
  });

  it("keeps scheduled empty assistant retries as a done message with retry metadata", () => {
    const emptyResponseText = "Ambient/Pi returned no assistant text. Retrying assistant finalization attempt 1/10 with a fresh session.";
    const emptyAssistantResponseMetadata = {
      retryScheduled: true,
      retryUsesFreshSession: true,
      retryAttempt: 1,
      maxRetries: 10,
      retryReason: "empty_assistant_response" as const,
      retryDelayMs: 0,
      receivedAnyText: false,
      currentAssistantFinalTextChars: 0,
    };

    expect(model({
      emptyAssistantResponse: true,
      retryEmptyAssistantResponse: true,
      emptyResponseText,
      emptyAssistantResponseMetadata,
    })).toMatchObject({
      status: "done",
      content: emptyResponseText,
      metadata: {
        status: "done",
        piEmptyAssistantResponse: emptyAssistantResponseMetadata,
        retryingEmptyAssistantResponse: true,
      },
    });
  });

  it("models tool-idle awaiting input finalization", () => {
    expect(model({
      finalizedAfterToolIdle: true,
      awaitingInputAfterTools: true,
    })).toMatchObject({
      status: "awaiting-input",
      content: "Tool calls completed. Ambient is awaiting your next instruction.",
      metadata: {
        status: "awaiting-input",
        finalizedAfterToolIdle: true,
        awaitingInputAfterTools: true,
      },
    });
  });

  it("models subagent and callable workflow finalization blocks", () => {
    const subagentFinalizationBlock: SubagentFinalizationBarrierBlock = {
      message: "Subagent work is still blocked.",
      barrierIds: ["barrier-1"],
      childRunIds: ["child-run-1"],
      childBlockers: [{
        childRunId: "child-run-1",
        childThreadId: "child-thread-1",
        canonicalTaskPath: "root/1:explorer",
        roleId: "explorer",
        status: "running",
        dependencyMode: "required_all",
        barrierIds: ["barrier-1"],
        lastActivityAt: "2026-06-15T00:00:01.000Z",
        lastActivitySource: "run_event:assistant_delta",
        lastActivityDetail: "run event 2",
      }],
      barriers: [{
        id: "barrier-1",
        dependencyMode: "required_all",
        status: "waiting_on_children",
        failurePolicy: "fail_parent",
        childRunIds: ["child-run-1"],
        childBlockers: [{
          childRunId: "child-run-1",
          childThreadId: "child-thread-1",
          canonicalTaskPath: "root/1:explorer",
          roleId: "explorer",
          status: "running",
          dependencyMode: "required_all",
          barrierIds: ["barrier-1"],
          lastActivityAt: "2026-06-15T00:00:01.000Z",
          lastActivitySource: "run_event:assistant_delta",
          lastActivityDetail: "run event 2",
        }],
      }],
    };
    const callableWorkflowFinalizationBlock: CallableWorkflowParentBlockingBlock = {
      schemaVersion: CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION,
      reason: CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON,
      message: "Workflow task is still running.",
      instruction: "Wait for workflow completion.",
      synthesisAllowed: false,
      parentFinalizationBlocked: true,
      taskIds: ["task-1"],
      launchIds: ["launch-1"],
      workflowArtifactIds: ["artifact-1"],
      workflowRunIds: ["workflow-run-1"],
      waitingTaskIds: ["task-1"],
      attentionTaskIds: [],
      tasks: [{
        id: "task-1",
        launchId: "launch-1",
        parentThreadId: "thread-1",
        parentRunId: "run-1",
        toolCallId: "tool-1",
        toolId: "tool-1",
        toolName: "workflow",
        sourceKind: "callable-workflow",
        title: "Build workflow",
        status: "running",
        statusLabel: "Running",
        statusGroup: "waiting_on_workflow",
        blocking: true,
        runnerTarget: "workflow",
        runnerDeferredReason: "running",
        workflowArtifactId: "artifact-1",
        workflowRunId: "workflow-run-1",
        createdAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:01.000Z",
      }],
    };

    expect(model({
      currentAssistantVisibleContent: "Premature answer.",
      parentFinalizationBlockMessage: "Subagent work is still blocked.\n\nWorkflow task is still running.",
      subagentFinalizationBlock,
      subagentFinalizationParentMailboxEventIds: ["mailbox-1"],
      callableWorkflowFinalizationBlock,
      callableWorkflowFinalizationParentMailboxEventId: "mailbox-2",
    })).toMatchObject({
      status: "error",
      content: "Subagent work is still blocked.\n\nWorkflow task is still running.",
      finalizationErrorText: "Subagent work is still blocked.\n\nWorkflow task is still running.",
      parentFinalizationBlocked: true,
      metadata: {
        status: "error",
        subagentFinalizationBlocked: {
          reason: "required_wait_barrier_not_satisfied",
          barrierIds: ["barrier-1"],
          childRunIds: ["child-run-1"],
          childBlockers: [
            expect.objectContaining({
              childRunId: "child-run-1",
              canonicalTaskPath: "root/1:explorer",
              lastActivitySource: "run_event:assistant_delta",
            }),
          ],
          parentMailboxEventIds: ["mailbox-1"],
        },
        callableWorkflowFinalizationBlocked: {
          reason: CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON,
          taskIds: ["task-1"],
          launchIds: ["launch-1"],
          workflowArtifactIds: ["artifact-1"],
          workflowRunIds: ["workflow-run-1"],
          waitingTaskIds: ["task-1"],
          attentionTaskIds: [],
          parentMailboxEventId: "mailbox-2",
        },
      },
    });
  });
});
