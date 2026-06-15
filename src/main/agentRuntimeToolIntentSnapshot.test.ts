import { describe, expect, it } from "vitest";

import { buildToolIntentSnapshot } from "./agentRuntimeToolIntentSnapshot";

describe("agentRuntimeToolIntentSnapshot", () => {
  it("classifies verification fetches and redacts sensitive target text", () => {
    const snapshot = buildToolIntentSnapshot({
      toolCallId: "tool-call-1",
      toolName: "web_research_fetch",
      rawInput: {
        url: "https://example.com/source?api_key=abcdefghijklmnopqrstuvwxyz",
        purpose: "Verify this specific source before answering.",
      },
      visibleInput: "",
      sourceUserMessageId: "user-1",
      turnGoal: "Check the source.",
      assistantLeadIn: "I will verify the evidence.",
    });

    expect(snapshot).toMatchObject({
      version: 1,
      toolCallId: "tool-call-1",
      toolName: "web_research_fetch",
      sourceUserMessageId: "user-1",
      turnGoal: "Check the source.",
      assistantLeadIn: "I will verify the evidence.",
      declaredPurpose: "Verify this specific source before answering.",
      operationKind: "verify_specific_source",
      targetSummary: "https://example.com/source?api_key=[REDACTED]",
      materiality: "required_before_final_answer",
      substituteAllowed: true,
    });
    expect(Date.parse(snapshot.createdAt)).not.toBeNaN();
  });

  it("uses visible JSON input when raw input is not an object", () => {
    const snapshot = buildToolIntentSnapshot({
      toolCallId: "tool-call-2",
      toolName: "browser_search",
      rawInput: undefined,
      visibleInput: JSON.stringify({ query: "desktop automation docs" }),
      turnGoal: "Find docs.",
      assistantLeadIn: "",
    });

    expect(snapshot).toMatchObject({
      operationKind: "search",
      targetSummary: "query: desktop automation docs",
      materiality: "important",
      substituteAllowed: true,
    });
    expect(snapshot).not.toHaveProperty("assistantLeadIn");
  });

  it("marks mutating tools as required and non-substitutable", () => {
    expect(buildToolIntentSnapshot({
      toolCallId: "tool-call-3",
      toolName: "write",
      rawInput: { path: "/tmp/workspace/notes.txt" },
      visibleInput: "",
      turnGoal: "Create a note.",
      assistantLeadIn: "I will write the file.",
    })).toMatchObject({
      operationKind: "write_or_mutate",
      targetSummary: "path: /tmp/workspace/notes.txt",
      materiality: "required_before_final_answer",
      substituteAllowed: false,
    });
  });

  it("falls back to read-context and generic tool classifications", () => {
    expect(buildToolIntentSnapshot({
      toolCallId: "tool-call-4",
      toolName: "read",
      rawInput: { methodId: "docs.search" },
      visibleInput: "",
      turnGoal: "Inspect the method.",
      assistantLeadIn: "",
    })).toMatchObject({
      operationKind: "read_context",
      targetSummary: "method: docs.search",
      materiality: "optional",
      substituteAllowed: true,
    });

    expect(buildToolIntentSnapshot({
      toolCallId: "tool-call-5",
      toolName: "custom_tool",
      rawInput: { packageName: "demo", commandName: "run" },
      visibleInput: "",
      turnGoal: "Run custom tool.",
      assistantLeadIn: "",
    })).toMatchObject({
      operationKind: "tool_execution",
      targetSummary: "package: demo:run",
      materiality: "important",
      substituteAllowed: false,
    });
  });
});
