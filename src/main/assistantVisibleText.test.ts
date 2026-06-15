import { describe, expect, it } from "vitest";
import { createAssistantVisibleTextFilter, stripAssistantReasoningTags } from "./assistantVisibleText";

describe("assistant visible text sanitization", () => {
  it("removes stray closing think tags from final text", () => {
    expect(stripAssistantReasoningTags("</think>Now write the README.md")).toBe("Now write the README.md");
  });

  it("removes complete think blocks from final text", () => {
    expect(stripAssistantReasoningTags("Visible <think>private reasoning</think> answer")).toBe("Visible  answer");
  });

  it("filters split closing tags without leaking partial tag text", () => {
    const filter = createAssistantVisibleTextFilter();
    expect(filter.push("Done <")).toBe("Done ");
    expect(filter.push("/thi")).toBe("");
    expect(filter.push("nk>Next step")).toBe("Next step");
    expect(filter.flush()).toBe("");
  });

  it("suppresses split think blocks until the closing tag arrives", () => {
    const filter = createAssistantVisibleTextFilter();
    expect(filter.push("Visible <thi")).toBe("Visible ");
    expect(filter.push("nk>hidden")).toBe("");
    expect(filter.push(" details</thi")).toBe("");
    expect(filter.push("nk> answer")).toBe(" answer");
    expect(filter.flush()).toBe("");
  });
});
