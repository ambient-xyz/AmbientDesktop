import { describe, expect, it, vi } from "vitest";
import type { WorkflowRevisionSummary } from "../../shared/workflowTypes";
import {
  recordWorkflowRevisionDecisionInChat,
  type WorkflowRevisionDecisionChatMessageInput,
  type WorkflowRevisionDecisionChatStore,
  type WorkflowRevisionDecisionChatThread,
} from "./workflowRevisionDecisionChat";

describe("recordWorkflowRevisionDecisionInChat", () => {
  it("records applied revision decisions against the Workflow Agent chat thread", () => {
    const store = createStore({
      chatThreadId: "chat-thread-1",
      latestVersion: { id: "version-2", version: 2 },
    });

    recordWorkflowRevisionDecisionInChat(workflowRevision(), "applied", store);

    expect(store.getWorkflowAgentThreadSummary).toHaveBeenCalledWith("workflow-thread-1");
    expect(store.addMessage).toHaveBeenCalledWith({
      threadId: "chat-thread-1",
      role: "system",
      content: "Applied workflow revision revision-1. The active workflow now points at version 2.",
      metadata: {
        workflowThreadId: "workflow-thread-1",
        workflowMode: "plan-edit",
        kind: "workflow_revision_decision",
        status: "done",
        revisionId: "revision-1",
        decision: "applied",
        versionId: "version-2",
        version: 2,
      },
    });
  });

  it("records rejected revision decisions with current-version fallback text", () => {
    const store = createStore({ chatThreadId: "chat-thread-1" });

    recordWorkflowRevisionDecisionInChat(workflowRevision(), "rejected", store);

    expect(store.addMessage).toHaveBeenCalledWith({
      threadId: "chat-thread-1",
      role: "system",
      content: "Rejected workflow revision revision-1. The workflow remains on the current workflow version.",
      metadata: {
        workflowThreadId: "workflow-thread-1",
        workflowMode: "plan-edit",
        kind: "workflow_revision_decision",
        status: "done",
        revisionId: "revision-1",
        decision: "rejected",
        versionId: undefined,
        version: undefined,
      },
    });
  });

  it("does not record chat messages when the workflow thread has no chat thread", () => {
    const store = createStore({});

    recordWorkflowRevisionDecisionInChat(workflowRevision(), "applied", store);

    expect(store.getWorkflowAgentThreadSummary).toHaveBeenCalledWith("workflow-thread-1");
    expect(store.addMessage).not.toHaveBeenCalled();
  });
});

function createStore(thread: WorkflowRevisionDecisionChatThread): WorkflowRevisionDecisionChatStore & {
  addMessage: ReturnType<typeof vi.fn<(input: WorkflowRevisionDecisionChatMessageInput) => unknown>>;
  getWorkflowAgentThreadSummary: ReturnType<typeof vi.fn<(workflowThreadId: string) => WorkflowRevisionDecisionChatThread>>;
} {
  return {
    getWorkflowAgentThreadSummary: vi.fn(() => thread),
    addMessage: vi.fn(),
  };
}

function workflowRevision(overrides: Partial<WorkflowRevisionSummary> = {}): WorkflowRevisionSummary {
  return {
    id: "revision-1",
    workflowThreadId: "workflow-thread-1",
    requestedChange: "Add retries",
    status: "proposed",
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    ...overrides,
  };
}
