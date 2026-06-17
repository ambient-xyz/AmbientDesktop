import { describe, expect, it } from "vitest";

import { normalizeToolArgumentsForTool } from "./toolArgumentNormalization";

describe("normalizeToolArgumentsForTool", () => {
  it("unwraps direct target tool envelopes", () => {
    expect(normalizeToolArgumentsForTool("browser_click", {
      toolName: "browser_click",
      toolInput: { text: "7" },
    })).toEqual({ text: "7" });
  });

  it("unwraps nested tool call arguments and inner toolInput envelopes", () => {
    expect(normalizeToolArgumentsForTool("browser_click", {
      type: "toolCall",
      name: "browser_click",
      arguments: JSON.stringify({
        toolName: "browser_click",
        toolInput: { selector: "#seven" },
      }),
    })).toEqual({ selector: "#seven" });
  });

  it("leaves payloads for other tools unchanged", () => {
    const input = {
      toolName: "browser_get_value",
      toolInput: { selector: "#display" },
    };
    expect(normalizeToolArgumentsForTool("browser_click", input)).toBe(input);
  });
});
