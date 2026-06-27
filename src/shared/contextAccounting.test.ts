import { describe, expect, it } from "vitest";
import { preflightPrompt, summarizeProviderPayload } from "./contextAccounting";

describe("context accounting", () => {
  it("summarizes provider payloads without retaining raw content", () => {
    const summary = summarizeProviderPayload({
      model: "zai-org/GLM-5.1-FP8",
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "write the app" },
      ],
      tools: [
        { type: "function", function: { name: "bash", parameters: { type: "object" } } },
        { type: "function", function: { name: "ambient_subagent", parameters: { type: "object", properties: { action: { type: "string" } } } } },
      ],
    });

    expect(summary).toMatchObject({
      requestType: "normal",
      model: "zai-org/GLM-5.1-FP8",
      messageCount: 2,
      roles: ["system", "user"],
    });
    expect(summary.contentBytes).toBeGreaterThan(0);
    expect(summary.toolCount).toBe(2);
    expect(summary.toolNames).toEqual(["bash", "ambient_subagent"]);
    expect(summary.toolSchemaBreakdown?.[0]).toMatchObject({ name: "ambient_subagent" });
    expect(summary.toolSchemaBytes).toBeGreaterThan(0);
    expect(summary.estimatedTokens).toBeGreaterThan(0);
    expect(JSON.stringify(summary)).not.toContain("write the app");
  });

  it("estimates provider payload size without full JSON serialization", () => {
    const summary = summarizeProviderPayload({
      model: "zai-org/GLM-5.1-FP8",
      messages: [
        {
          role: "user",
          content: {
            text: "large prompt",
            toJSON() {
              throw new Error("must not stringify content");
            },
          },
        },
      ],
      toJSON() {
        throw new Error("must not stringify payload");
      },
    });

    expect(summary.contentBytes).toBeGreaterThan(0);
    expect(summary.totalBytes).toBeGreaterThan(0);
    expect(summary.estimatedTokens).toBeGreaterThan(0);
  });

  it("requests one preflight compaction when projected context crosses the hard threshold", () => {
    const result = preflightPrompt({
      prompt: "x".repeat(8_000),
      currentTokens: 183_000,
      contextWindow: 200_000,
      reserveTokens: 16_384,
      hardPreflightPercent: 92,
    });

    expect(result.shouldCompact).toBe(true);
    expect(result.promptTooLarge).toBe(false);
  });

  it("blocks prompts that cannot fit even after compaction", () => {
    const result = preflightPrompt({
      prompt: "x".repeat(800_000),
      contextWindow: 200_000,
      reserveTokens: 16_384,
      hardPreflightPercent: 92,
    });

    expect(result.promptTooLarge).toBe(true);
    expect(result.shouldCompact).toBe(false);
  });
});
