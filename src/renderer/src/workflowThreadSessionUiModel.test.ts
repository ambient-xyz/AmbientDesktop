import { describe, expect, it } from "vitest";
import { shortenWorkflowSessionId, workflowThreadSessionUiModel } from "./workflowThreadSessionUiModel";

describe("workflowThreadSessionUiModel", () => {
  it("prompts the user to prepare a durable Pi session before chat starts", () => {
    expect(workflowThreadSessionUiModel({})).toMatchObject({
      state: "missing",
      label: "Pi session not prepared",
      badge: "Not prepared",
      canPrepare: true,
      actionLabel: "Prepare Pi session",
    });
  });

  it("surfaces a preparing state while the session bridge is loading", () => {
    expect(workflowThreadSessionUiModel({}, { preparing: true })).toMatchObject({
      state: "preparing",
      label: "Preparing Pi session",
      badge: "Preparing",
      canPrepare: false,
    });
  });

  it("surfaces active durable session metadata without exposing an overly long id", () => {
    const model = workflowThreadSessionUiModel({ chatThreadId: "workflow-chat-session-1234567890abcdef" });

    expect(model).toMatchObject({
      state: "active",
      label: "Pi session active",
      badge: "Session ready",
      shortId: "workflow-c...0abcdef",
      canPrepare: false,
    });
    expect(model.actionTitle).toContain("workflow-chat-session-1234567890abcdef");
  });

  it("does not shorten compact ids", () => {
    expect(shortenWorkflowSessionId("chat-123")).toBe("chat-123");
  });
});
