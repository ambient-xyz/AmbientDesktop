import { describe, expect, it } from "vitest";

import { createRuntimeTextOutputState } from "./runtimeTextOutputState";

describe("createRuntimeTextOutputState", () => {
  it("starts with empty assistant and thinking output", () => {
    const state = createRuntimeTextOutputState();

    expect(state.snapshot()).toEqual({
      receivedAnyText: false,
      currentAssistantReceivedText: false,
      currentAssistantFinalText: "",
      currentThinkingReceivedText: false,
      currentThinkingFinalText: "",
      assistantOutputChars: 0,
      thinkingOutputChars: 0,
      firstAssistantVisibleTextAt: undefined,
    });
    expect(state.hasAssistantText()).toBe(false);
  });

  it("tracks assistant and thinking text state", () => {
    const state = createRuntimeTextOutputState();

    state.setReceivedAnyText(true);
    state.setCurrentAssistantReceivedText(true);
    state.setCurrentAssistantFinalText("Hello");
    state.setAssistantOutputChars(5);
    state.setCurrentThinkingReceivedText(true);
    state.setCurrentThinkingFinalText("Reasoning");
    state.setThinkingOutputChars(9);

    expect(state.snapshot()).toMatchObject({
      receivedAnyText: true,
      currentAssistantReceivedText: true,
      currentAssistantFinalText: "Hello",
      currentThinkingReceivedText: true,
      currentThinkingFinalText: "Reasoning",
      assistantOutputChars: 5,
      thinkingOutputChars: 9,
    });
    expect(state.hasAssistantText()).toBe(true);
  });

  it("resets assistant stream text and visible-text filtering together", () => {
    const state = createRuntimeTextOutputState();
    state.setCurrentAssistantReceivedText(true);
    state.setCurrentAssistantFinalText("partial");

    expect(state.pushAssistantVisibleDelta("Visible <thi")).toBe("Visible ");

    state.resetAssistantStreamState();

    expect(state.currentAssistantReceivedText()).toBe(false);
    expect(state.currentAssistantFinalText()).toBe("");
    expect(state.flushAssistantVisibleText()).toBe("");
    expect(state.pushAssistantVisibleDelta("again")).toBe("again");
  });

  it("resets thinking stream text without changing assistant output", () => {
    const state = createRuntimeTextOutputState();
    state.setCurrentAssistantFinalText("Assistant");
    state.setCurrentThinkingReceivedText(true);
    state.setCurrentThinkingFinalText("Thinking");

    state.resetThinkingStreamState();

    expect(state.currentAssistantFinalText()).toBe("Assistant");
    expect(state.currentThinkingReceivedText()).toBe(false);
    expect(state.currentThinkingFinalText()).toBe("");
  });

  it("filters hidden assistant reasoning text", () => {
    const state = createRuntimeTextOutputState();

    expect(state.pushAssistantVisibleDelta("A<think>secret</think>B")).toBe("AB");
    expect(state.pushAssistantVisibleDelta("<thi")).toBe("");
    expect(state.pushAssistantVisibleDelta("nk>hidden</think>C")).toBe("C");
    expect(state.flushAssistantVisibleText()).toBe("");
  });

  it("records the first assistant visible-text timestamp only once", () => {
    const state = createRuntimeTextOutputState();

    state.markFirstAssistantVisibleText(() => "2026-06-15T00:00:00.000Z");
    state.markFirstAssistantVisibleText(() => "2026-06-15T00:00:01.000Z");

    expect(state.firstAssistantVisibleTextAt()).toBe("2026-06-15T00:00:00.000Z");
  });
});
