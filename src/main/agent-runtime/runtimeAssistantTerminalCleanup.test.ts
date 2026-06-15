import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/types";
import {
  finalizeRuntimeAssistantTerminalCleanup,
  type RuntimeAssistantTerminalCleanupSession,
} from "./runtimeAssistantTerminalCleanup";

function baseInput(overrides: Record<string, unknown> = {}) {
  const emitted: DesktopEvent[] = [];
  const session: RuntimeAssistantTerminalCleanupSession = {
    sessionFile: "/tmp/session.jsonl",
    dispose: vi.fn(),
  };
  return {
    threadId: "thread-1",
    promptStartedAtMs: 1_000,
    assistantTerminalGraceMs: 500,
    outputChars: 42,
    thinkingChars: 9,
    receivedAnyText: true,
    currentAssistantReceivedText: true,
    currentAssistantFinalTextChars: 42,
    streamIdleTimeoutMs: 30_000,
    abortGraceMs: 5_000,
    session,
    lastAssistantTerminalEvent: {
      eventType: "message_end",
      stopReason: "end_turn",
      finalTextChars: 42,
    },
    promptCompletion: Promise.resolve("prompt"),
    now: vi.fn(() => 1_800),
    markCleanupInProgress: vi.fn(),
    abortSessionRun: vi.fn(async () => undefined),
    removeActiveSessionIfCurrent: vi.fn(),
    emitRunEvent: vi.fn((event: DesktopEvent) => {
      emitted.push(event);
    }),
    emitted,
    ...overrides,
  };
}

describe("finalizeRuntimeAssistantTerminalCleanup", () => {
  it("emits cleanup activity, aborts, removes the active session, disposes, and returns the diagnostic", async () => {
    const input = baseInput();

    await expect(finalizeRuntimeAssistantTerminalCleanup(input)).resolves.toEqual({
      diagnostic: expect.objectContaining({
        reason: "assistant-terminal-before-prompt-resolved",
        promptPendingMs: 800,
        assistantTerminalGraceMs: 500,
        outputChars: 42,
        thinkingChars: 9,
        sessionFile: "/tmp/session.jsonl",
      }),
    });

    expect(input.abortSessionRun).toHaveBeenCalledWith(input.session, "thread-1");
    expect(input.markCleanupInProgress).toHaveBeenCalledTimes(1);
    expect(input.removeActiveSessionIfCurrent).toHaveBeenCalledWith(input.session);
    expect(input.session.dispose).toHaveBeenCalledTimes(1);
    expect(input.emitted).toContainEqual(expect.objectContaining({
      type: "runtime-activity",
      activity: expect.objectContaining({
        kind: "stream",
        status: "running",
        outputChars: 42,
        thinkingChars: 9,
        idleElapsedMs: 500,
        idleTimeoutMs: 30_000,
        diagnostic: expect.objectContaining({
          lastAssistantTerminalEvent: expect.objectContaining({
            eventType: "message_end",
          }),
        }),
      }),
    }));
  });

  it("waits for an optional pending steer completion before resolving", async () => {
    let resolvePending!: () => void;
    const pendingCompletion = new Promise<void>((resolve) => {
      resolvePending = resolve;
    });
    const input = baseInput({ pendingCompletion });
    let resolved = false;
    const cleanup = finalizeRuntimeAssistantTerminalCleanup(input).then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);

    resolvePending();
    await cleanup;
    expect(resolved).toBe(true);
  });

  it("treats dispose failures as best-effort cleanup", async () => {
    const input = baseInput({
      session: {
        sessionFile: "/tmp/session.jsonl",
        dispose: vi.fn(() => {
          throw new Error("dispose failed");
        }),
      },
    });

    await expect(finalizeRuntimeAssistantTerminalCleanup(input)).resolves.toEqual({
      diagnostic: expect.objectContaining({
        sessionFile: "/tmp/session.jsonl",
      }),
    });
    expect(input.removeActiveSessionIfCurrent).toHaveBeenCalledTimes(1);
  });
});
