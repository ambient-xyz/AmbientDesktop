import { describe, expect, it } from "vitest";

import type {
  ChatMessage,
  PlannerPlanArtifact,
} from "../../shared/types";
import type { RunActivityLine } from "./AppRunActivity";
import {
  appConversationArtifactWorkspacePath,
  appConversationDisplayModel,
  appConversationPlannerArtifactByMessageId,
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
      activeRunActivityLines: activityLines,
      activeWorkspacePath: "/workspace/current",
      messages,
      plannerPlanArtifacts: [artifact],
      running: true,
      thinkingDisplayMode: "transient",
    });

    expect(model.visibleChatMessages.map((item) => item.id)).toEqual(["user-1", "user-2", "assistant-error"]);
    expect(model.visibleRunActivityLines.map((item) => item.id)).toEqual(["line-1"]);
    expect(model.transientThinkingActivityLines.map((item) => item.id)).toEqual(["line-2"]);
    expect(model.retryableMessageIds.has("user-2")).toBe(true);
    expect(model.latestRecoveryPrompt?.id).toBe("user-2");
    expect(model.streamingAssistantId).toBe("assistant-streaming");
    expect(model.plannerArtifactByMessageId.get("assistant-error")).toBe(artifact);
    expect(model.promptHistory).toEqual(["Retry this", "First prompt"]);
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
