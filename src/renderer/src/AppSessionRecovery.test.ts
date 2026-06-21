import { describe, expect, it } from "vitest";

import type { ChatMessage, ContextUsageSnapshot } from "../../shared/threadTypes";
import {
  isSessionContextMissing,
  latestUserPromptForRecovery,
  sessionContextRecoveryMessage,
} from "./AppSessionRecovery";

describe("session recovery helpers", () => {
  it("formats recovery messages for missing context errors", () => {
    expect(sessionContextRecoveryMessage(undefined)).toBe(
      "The visible transcript is still available. Rebuild a lossy model summary or duplicate the transcript into a new chat.",
    );
    expect(sessionContextRecoveryMessage("Model context is not available for this chat: Pi session file is missing.")).toBe(
      "The Pi session file is missing or unreadable, but the visible transcript is still available.",
    );
    expect(sessionContextRecoveryMessage("Network request failed.")).toBe("Network request failed.");
  });

  it("detects missing session context snapshots", () => {
    expect(
      isSessionContextMissing(
        contextUsage({
          source: "unavailable",
          diagnostics: { activeSession: false, piSessionFile: "/tmp/session.json" },
        }),
      ),
    ).toBe(true);
    expect(
      isSessionContextMissing(
        contextUsage({
          source: "unavailable",
          diagnostics: { activeSession: false, message: "Model context is not available for this chat: Pi session file is missing." },
        }),
      ),
    ).toBe(true);
    expect(isSessionContextMissing(contextUsage({ source: "estimate", diagnostics: { activeSession: false } }))).toBe(false);
    expect(isSessionContextMissing(contextUsage({ source: "unavailable", diagnostics: { activeSession: true } }))).toBe(false);
  });

  it("finds the latest renderable user prompt for retry recovery", () => {
    const first = message({ id: "first", role: "user", content: "First prompt" });
    const latest = message({ id: "latest", role: "user", content: "Latest prompt" });

    expect(
      latestUserPromptForRecovery([
        first,
        message({ id: "assistant", role: "assistant", content: "Answer" }),
        message({ id: "blank", role: "user", content: "  \u200B " }),
        latest,
        message({
          id: "hidden",
          role: "user",
          content: "Continue working toward the active Ambient Desktop thread goal.",
          metadata: {
            runtime: "ambient-internal",
            kind: "hidden-user-message",
            hiddenFromTranscript: true,
            hiddenUserMessage: true,
          },
        }),
      ]),
    ).toBe(latest);
  });
});

function contextUsage(input: Partial<ContextUsageSnapshot>): ContextUsageSnapshot {
  return {
    threadId: "thread-id",
    source: "unavailable",
    compactionCount: 0,
    updatedAt: "2026-06-04T00:00:00.000Z",
    ...input,
  };
}

function message(input: Partial<ChatMessage>): ChatMessage {
  return {
    id: "message-id",
    threadId: "thread-id",
    role: "user",
    content: "",
    createdAt: "2026-06-04T00:00:00.000Z",
    ...input,
  };
}
