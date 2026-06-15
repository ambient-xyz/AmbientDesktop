import { describe, expect, it } from "vitest";

import { piAssistantMessageMetadata, piThinkingMessageMetadata } from "./agentRuntimeAssistantMessageMetadata";

describe("agentRuntimeAssistantMessageMetadata", () => {
  it("builds Pi assistant message metadata", () => {
    expect(piAssistantMessageMetadata("streaming")).toEqual({
      status: "streaming",
      runtime: "pi",
      provider: "ambient",
    });
    expect(piAssistantMessageMetadata("done")).toEqual({
      status: "done",
      runtime: "pi",
      provider: "ambient",
    });
  });

  it("builds Pi thinking message metadata", () => {
    expect(piThinkingMessageMetadata("thinking")).toEqual({
      status: "thinking",
      runtime: "pi",
      provider: "ambient",
      kind: "thinking",
    });
    expect(piThinkingMessageMetadata("aborted")).toEqual({
      status: "aborted",
      runtime: "pi",
      provider: "ambient",
      kind: "thinking",
    });
  });
});
