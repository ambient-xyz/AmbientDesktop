import { describe, expect, it } from "vitest";
import {
  INTERRUPTED_RUN_MESSAGE,
  INTERRUPTED_TOOL_MESSAGE,
  interruptedMessageContent,
  interruptedMetadata,
  isRecoverableMessageMetadata,
} from "./runRecovery";

describe("isRecoverableMessageMetadata", () => {
  it.each([
    [{ status: "streaming" }, true],
    [{ status: "running" }, true],
    [{ status: "done" }, false],
    [{ status: "error" }, false],
    [{ status: "interrupted" }, false],
    [{}, false],
  ])("maps %j to %s", (metadata, expected) => {
    expect(isRecoverableMessageMetadata(metadata)).toBe(expected);
  });
});

describe("interruptedMetadata", () => {
  it("preserves existing metadata while marking the message interrupted", () => {
    expect(interruptedMetadata({ runtime: "pi", status: "streaming" })).toEqual({
      runtime: "pi",
      status: "interrupted",
    });
  });
});

describe("interruptedMessageContent", () => {
  it("uses a standalone assistant interruption message when no text was streamed", () => {
    expect(interruptedMessageContent("", "assistant")).toBe(INTERRUPTED_RUN_MESSAGE);
  });

  it("preserves partial assistant text and avoids duplicate interruption notes", () => {
    const content = interruptedMessageContent("Partial answer", "assistant");

    expect(content).toContain("Partial answer");
    expect(content).toContain(INTERRUPTED_RUN_MESSAGE);
    expect(interruptedMessageContent(content, "assistant")).toBe(content);
  });

  it("uses tool-specific interruption text for running tool messages", () => {
    expect(interruptedMessageContent("write running", "tool")).toBe(`write running\n\n${INTERRUPTED_TOOL_MESSAGE}`);
  });
});
