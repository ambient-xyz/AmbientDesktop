import { describe, expect, it, vi } from "vitest";

import { createRuntimePromptExecutionController, type RuntimePromptExecutionSession } from "./runtimePromptExecutionController";

function createSession(overrides: Partial<RuntimePromptExecutionSession> = {}): RuntimePromptExecutionSession {
  return {
    sessionFile: "session.jsonl",
    isStreaming: true,
    prompt: vi.fn(() => Promise.resolve()),
    dispose: vi.fn(),
    ...overrides,
  };
}

function createInput(overrides: Partial<Parameters<typeof createRuntimePromptExecutionController>[0]> = {}) {
  const session = overrides.session ?? createSession();
  return {
    threadId: "thread-1",
    session,
    promptContent: "hello Pi",
    images: [],
    isStreamTimedOut: vi.fn(() => false),
    streamTimeoutMessage: vi.fn(() => "Ambient/Pi stream stalled after 30000 ms without stream activity."),
    recordPromptStart: vi.fn(),
    assistantTerminalGraceMs: vi.fn(() => 250),
    outputChars: vi.fn(() => 12),
    thinkingChars: vi.fn(() => 3),
    receivedAnyText: vi.fn(() => true),
    currentAssistantReceivedText: vi.fn(() => true),
    currentAssistantFinalTextChars: vi.fn(() => 9),
    streamIdleTimeoutMs: 30_000,
    abortGraceMs: 1_000,
    lastAssistantTerminalEvent: vi.fn(() => undefined),
    markCleanupInProgress: vi.fn(),
    setAssistantTerminalCleanupDiagnostic: vi.fn(),
    abortSessionRun: vi.fn(() => Promise.resolve()),
    removeActiveSessionIfCurrent: vi.fn(),
    emitRunEvent: vi.fn(),
    ...overrides,
  };
}

describe("createRuntimePromptExecutionController", () => {
  it("records prompt start and starts a streaming prompt with images", async () => {
    const session = createSession();
    const input = createInput({
      session,
      promptContent: "inspect this",
      images: [{ path: "artifact.png" }],
    });

    const controller = createRuntimePromptExecutionController(input);

    await expect(controller.promptCompletion).resolves.toBe("prompt");
    expect(input.recordPromptStart).toHaveBeenCalledWith({
      sessionFile: "session.jsonl",
      promptContent: "inspect this",
    });
    expect(session.prompt).toHaveBeenCalledWith("inspect this", {
      images: [{ path: "artifact.png" }],
      streamingBehavior: "steer",
      source: { type: "user" },
    });
    expect(vi.mocked(input.recordPromptStart).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(session.prompt).mock.invocationCallOrder[0],
    );
  });

  it("preserves prompt options when there are no images and the session is not streaming", async () => {
    const session = createSession({ isStreaming: false });
    const input = createInput({ session });

    const controller = createRuntimePromptExecutionController(input);

    await expect(controller.promptCompletion).resolves.toBe("prompt");
    expect(session.prompt).toHaveBeenCalledWith("hello Pi", {
      streamingBehavior: undefined,
      source: { type: "user" },
    });
  });

  it("translates prompt rejection to the stream-timeout message after timeout", async () => {
    const session = createSession({
      prompt: vi.fn(() => Promise.reject(new Error("provider socket closed"))),
    });
    const input = createInput({
      session,
      isStreamTimedOut: vi.fn(() => true),
      streamTimeoutMessage: vi.fn(() => "Ambient/Pi stream stalled after 30000 ms without stream activity."),
    });

    const controller = createRuntimePromptExecutionController(input);

    await expect(controller.promptCompletion).rejects.toThrow(
      "Ambient/Pi stream stalled after 30000 ms without stream activity.",
    );
  });

  it("preserves prompt rejection when the stream has not timed out", async () => {
    const session = createSession({
      prompt: vi.fn(() => Promise.reject(new Error("provider failed"))),
    });
    const input = createInput({ session });

    const controller = createRuntimePromptExecutionController(input);

    await expect(controller.promptCompletion).rejects.toThrow("provider failed");
  });

  it("finalizes assistant terminal cleanup with current runtime state", async () => {
    const session = createSession();
    const input = createInput({
      session,
      assistantTerminalGraceMs: vi.fn(() => 400),
      outputChars: vi.fn(() => 21),
      thinkingChars: vi.fn(() => 5),
      receivedAnyText: vi.fn(() => true),
      currentAssistantReceivedText: vi.fn(() => false),
      currentAssistantFinalTextChars: vi.fn(() => 13),
      streamIdleTimeoutMs: 45_000,
      abortGraceMs: 1_000,
    });
    const controller = createRuntimePromptExecutionController(input);

    await controller.finalizeAssistantTerminalRun(Promise.resolve("steer"));

    expect(input.emitRunEvent).toHaveBeenCalledWith({
      type: "runtime-activity",
      activity: expect.objectContaining({
        threadId: "thread-1",
        outputChars: 21,
        thinkingChars: 5,
        idleElapsedMs: 400,
        idleTimeoutMs: 45_000,
        diagnostic: expect.objectContaining({
          outputChars: 21,
          thinkingChars: 5,
          currentAssistantFinalTextChars: 13,
        }),
      }),
    });
    expect(input.markCleanupInProgress).toHaveBeenCalledTimes(1);
    expect(input.abortSessionRun).toHaveBeenCalledWith(session, "thread-1");
    expect(input.removeActiveSessionIfCurrent).toHaveBeenCalledWith(session);
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(input.setAssistantTerminalCleanupDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        outputChars: 21,
        thinkingChars: 5,
        receivedAnyText: true,
        currentAssistantReceivedText: false,
        currentAssistantFinalTextChars: 13,
        sessionFile: "session.jsonl",
      }),
    );
  });

  it("waits for prompt completion after abort and resolves prompt on rejection", async () => {
    const session = createSession({
      prompt: vi.fn(() => Promise.reject(new Error("aborted"))),
    });
    const input = createInput({ session });
    const controller = createRuntimePromptExecutionController(input);

    await expect(controller.waitForPromptAfterAbort()).resolves.toBe("prompt");
  });
});
