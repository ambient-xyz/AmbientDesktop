import { describe, expect, it } from "vitest";

import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import type { RunActivityLine } from "./AppRunActivity";
import {
  appConversationArtifactWorkspacePath,
  appConversationDisplayModel,
  appConversationPlannerArtifactByMessageId,
  messagesWithPendingSubmittedPrompts,
  pendingSubmittedPromptHasPersistedMatch,
} from "./AppConversationDisplayModel";

describe("AppConversationDisplayModel", () => {
  it("prefers the active workspace for artifact hint collection", () => {
    expect(appConversationArtifactWorkspacePath({
      activeWorkspacePath: "/workspace/current",
      workspacePath: "/workspace/root",
    })).toBe("/workspace/current");
    expect(appConversationArtifactWorkspacePath({ workspacePath: "/workspace/root" })).toBe("/workspace/root");
    expect(appConversationArtifactWorkspacePath({})).toBe("");
  });

  it("indexes planner artifacts by source message", () => {
    const artifact = { id: "plan-1", sourceMessageId: "assistant-1" } as PlannerPlanArtifact;

    expect(appConversationPlannerArtifactByMessageId([artifact]).get("assistant-1")).toBe(artifact);
    expect(appConversationPlannerArtifactByMessageId(undefined).size).toBe(0);
  });

  it("derives visible conversation display data without owning shell state", () => {
    const messages = [
      message({ id: "user-1", role: "user", content: "First prompt" }),
      message({ id: "thinking-1", role: "assistant", content: "private thought", metadata: { kind: "thinking", status: "thinking" } }),
      message({ id: "assistant-streaming", role: "assistant", content: "" }),
      message({ id: "user-2", role: "user", content: "Retry this" }),
      message({ id: "assistant-error", role: "assistant", content: "Failed", metadata: { status: "error" } }),
    ];
    const activityLines = [
      runActivityLine({ id: "line-1", kind: "state" }),
      runActivityLine({ id: "line-2", kind: "thinking" }),
    ];
    const artifact = { id: "plan-1", sourceMessageId: "assistant-error" } as PlannerPlanArtifact;

    const model = appConversationDisplayModel({
      activeThreadId: "thread-1",
      activeRunActivityLines: activityLines,
      activeWorkspacePath: "/workspace/current",
      messages,
      plannerPlanArtifacts: [artifact],
      running: true,
      runStatus: "streaming",
      thinkingDisplayMode: "transient",
    });

    expect(model.visibleChatMessages.map((item) => item.id)).toEqual(["user-1", "user-2", "assistant-error"]);
    expect(model.visibleRunActivityLines.map((item) => item.id)).toEqual(["line-1"]);
    expect(model.transientThinkingActivityLines.map((item) => item.id)).toEqual(["line-2"]);
    expect(model.retryableMessageIds.has("user-2")).toBe(true);
    expect(model.latestRecoveryPrompt?.id).toBe("user-2");
    expect(model.streamingAssistantId).toBe("assistant-streaming");
    expect(model.assistantVisibleTextStreaming).toBe(false);
    expect(model.plannerArtifactByMessageId.get("assistant-error")).toBe(artifact);
    expect(model.promptHistory).toEqual(["Retry this", "First prompt"]);

    const toolPhaseModel = appConversationDisplayModel({
      activeThreadId: "thread-1",
      activeRunActivityLines: activityLines,
      activeWorkspacePath: "/workspace/current",
      messages,
      plannerPlanArtifacts: [artifact],
      running: true,
      runStatus: "tool",
      thinkingDisplayMode: "transient",
    });
    expect(toolPhaseModel.transientThinkingActivityLines).toEqual([]);
  });

  it("suppresses transient thinking while visible assistant text is streaming", () => {
    const model = appConversationDisplayModel({
      activeThreadId: "thread-1",
      activeRunActivityLines: [
        runActivityLine({ id: "thinking-line", kind: "thinking" }),
      ],
      messages: [
        message({ id: "user-1", role: "user", content: "Question" }),
        message({ id: "assistant-1", role: "assistant", content: "Partial answer", metadata: { status: "streaming" } }),
      ],
      plannerPlanArtifacts: [],
      running: true,
      runStatus: "streaming",
      thinkingDisplayMode: "transient",
    });

    expect(model.assistantVisibleTextStreaming).toBe(true);
    expect(model.transientThinkingActivityLines).toEqual([]);
    expect(model.visibleChatMessages.map((item) => item.id)).toEqual(["user-1", "assistant-1"]);
  });

  it("keeps a submitted prompt visible until the persisted user message appears", () => {
    const messages = [
      message({ id: "user-1", role: "user", content: "Repeatable prompt" }),
      message({ id: "assistant-1", role: "assistant", content: "Done" }),
    ];
    const pending = {
      id: "pending-submitted-1",
      threadId: "thread-1",
      content: "Repeatable prompt",
      delivery: "prompt" as const,
      createdAt: "2026-06-13T00:01:00.000Z",
      afterMessageId: "assistant-1",
    };

    expect(pendingSubmittedPromptHasPersistedMatch(pending, messages)).toBe(false);
    expect(messagesWithPendingSubmittedPrompts({
      activeThreadId: "thread-1",
      messages,
      pendingSubmittedPrompts: [pending],
    }).map((item) => item.id)).toEqual(["user-1", "assistant-1", "pending-submitted-1"]);

    const persisted = message({
      id: "user-2",
      role: "user",
      content: "Repeatable prompt",
      createdAt: "2026-06-13T00:01:01.000Z",
    });
    expect(pendingSubmittedPromptHasPersistedMatch(pending, [...messages, persisted])).toBe(true);
    expect(messagesWithPendingSubmittedPrompts({
      activeThreadId: "thread-1",
      messages: [...messages, persisted],
      pendingSubmittedPrompts: [pending],
    }).map((item) => item.id)).toEqual(["user-1", "assistant-1", "user-2"]);
  });
});

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    ...overrides,
    id: overrides.id ?? "message",
    threadId: overrides.threadId ?? "thread-1",
    role: overrides.role ?? "assistant",
    content: overrides.content ?? "",
    createdAt: overrides.createdAt ?? "2026-06-13T00:00:00.000Z",
  };
}

function runActivityLine(overrides: Partial<RunActivityLine>): RunActivityLine {
  return {
    id: overrides.id ?? "line",
    text: overrides.text ?? "Thinking",
    kind: overrides.kind ?? "state",
    timestamp: overrides.timestamp ?? 0,
  };
}
