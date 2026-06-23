import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../shared/threadTypes";
import { promptCacheStatusBadgeModel } from "./promptCacheStatusUiModel";

function message(metadata?: ChatMessage["metadata"], role: ChatMessage["role"] = "assistant"): Pick<ChatMessage, "role" | "metadata"> {
  return { role, metadata };
}

describe("promptCacheStatusBadgeModel", () => {
  it("hides prompt cache status when the setting is disabled or metadata is absent", () => {
    expect(promptCacheStatusBadgeModel(message({ promptCache: { status: "hit", usage: { cacheRead: 12 } } }), false)).toBeUndefined();
    expect(promptCacheStatusBadgeModel(message(), true)).toBeUndefined();
    expect(promptCacheStatusBadgeModel(message({ promptCache: { status: "hit" } }, "user"), true)).toBeUndefined();
  });

  it("formats pending, hit, miss, and unknown cache status badges", () => {
    expect(promptCacheStatusBadgeModel(message({ promptCache: { status: "pending" } }), true)).toEqual({
      label: "Prompt cache pending",
      title: "Provider prompt-cache usage has not arrived for this model request yet.",
      tone: "pending",
    });
    expect(promptCacheStatusBadgeModel(message({
      promptCache: {
        status: "hit",
        usage: { input: 2048, cacheRead: 1536, cacheWrite: 0 },
      },
    }), true)).toEqual({
      label: "Prompt cache hit · 1,536 cached tokens",
      title: "Provider reported cached prompt input for this model request. 1,536 cached input, 2,048 input, 0 cache write",
      tone: "hit",
    });
    expect(promptCacheStatusBadgeModel(message({ promptCache: { status: "miss", usage: { cacheRead: 0 } } }), true)).toEqual({
      label: "Prompt cache miss",
      title: "Provider reported zero cached prompt input tokens for this model request. 0 cached input",
      tone: "miss",
    });
    expect(promptCacheStatusBadgeModel(message({ promptCache: { status: "unknown" } }), true)).toEqual({
      label: "Prompt cache unknown",
      title: "Provider prompt-cache usage was not reported for this model request.",
      tone: "unknown",
    });
  });
});
