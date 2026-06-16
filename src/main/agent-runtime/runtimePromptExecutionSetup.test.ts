import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/types";
import type {
  RuntimePromptExecutionController,
  RuntimePromptExecutionControllerInput,
  RuntimePromptExecutionSession,
} from "./runtimePromptExecutionController";
import {
  createRuntimePromptExecutionSetup,
  type RuntimePromptExecutionSetupInput,
} from "./runtimePromptExecutionSetup";

describe("createRuntimePromptExecutionSetup", () => {
  it("creates the prompt execution controller with explicit runtime owners", () => {
    const controller = createController();
    const controllerInputs: RuntimePromptExecutionControllerInput[] = [];
    const createPromptExecutionController = vi.fn((controllerInput: RuntimePromptExecutionControllerInput) => {
      controllerInputs.push(controllerInput);
      return controller;
    });
    const input = createInput({ createPromptExecutionController });

    const setup = createRuntimePromptExecutionSetup(input);

    expect(setup).toBe(controller);
    expect(createPromptExecutionController).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1",
      session: input.session,
      promptContent: "hello Pi",
      images: [{ path: "artifact.png" }],
      isStreamTimedOut: input.promptControlState.isStreamTimedOut,
      streamTimeoutMessage: input.streamTimeoutMessage,
      recordPromptStart: input.streamTraceState.recordPromptStart,
      assistantTerminalGraceMs: input.assistantTerminalCompletion.graceMs,
      outputChars: input.outputState.assistantOutputChars,
      thinkingChars: input.outputState.thinkingOutputChars,
      receivedAnyText: input.outputState.receivedAnyText,
      currentAssistantReceivedText: input.outputState.currentAssistantReceivedText,
      streamIdleTimeoutMs: 30_000,
      abortGraceMs: 1_000,
      lastAssistantTerminalEvent: input.promptRunState.lastAssistantTerminalEvent,
      markCleanupInProgress: input.promptRunState.markAssistantTerminalCleanupInProgress,
      setAssistantTerminalCleanupDiagnostic: input.promptRunState.setAssistantTerminalCleanupDiagnostic,
      abortSessionRun: input.abortSessionRun,
      removeActiveSessionIfCurrent: input.removeActiveSessionIfCurrent,
      emitRunEvent: input.emitRunEvent,
    }));

    const controllerInput = controllerInputs[0]!;
    expect(controllerInput.currentAssistantFinalTextChars()).toBe(13);
  });

  it("keeps current assistant final text length live for terminal cleanup", () => {
    let currentAssistantText = "short";
    const controllerInputs: RuntimePromptExecutionControllerInput[] = [];
    const input = createInput({
      outputState: {
        assistantOutputChars: vi.fn(() => 10),
        thinkingOutputChars: vi.fn(() => 2),
        receivedAnyText: vi.fn(() => true),
        currentAssistantReceivedText: vi.fn(() => true),
        currentAssistantFinalText: vi.fn(() => currentAssistantText),
      },
      createPromptExecutionController: vi.fn((controllerInput) => {
        controllerInputs.push(controllerInput);
        return createController();
      }),
    });

    createRuntimePromptExecutionSetup(input);
    const controllerInput = controllerInputs[0]!;

    expect(controllerInput.currentAssistantFinalTextChars()).toBe(5);
    currentAssistantText = "a longer answer";
    expect(controllerInput.currentAssistantFinalTextChars()).toBe(15);
  });
});

function createInput(
  overrides: Partial<RuntimePromptExecutionSetupInput> = {},
): RuntimePromptExecutionSetupInput {
  return {
    threadId: "thread-1",
    session: createSession(),
    promptContent: "hello Pi",
    images: [{ path: "artifact.png" }],
    promptControlState: {
      isStreamTimedOut: vi.fn(() => false),
    },
    streamTimeoutMessage: vi.fn(() => "Ambient/Pi stream stalled after 30000 ms without stream activity."),
    streamTraceState: {
      recordPromptStart: vi.fn(),
    },
    assistantTerminalCompletion: {
      graceMs: vi.fn(() => 250),
    },
    outputState: {
      assistantOutputChars: vi.fn(() => 10),
      thinkingOutputChars: vi.fn(() => 2),
      receivedAnyText: vi.fn(() => true),
      currentAssistantReceivedText: vi.fn(() => true),
      currentAssistantFinalText: vi.fn(() => "hello, world!"),
    },
    streamIdleTimeoutMs: 30_000,
    abortGraceMs: 1_000,
    promptRunState: {
      lastAssistantTerminalEvent: vi.fn(() => undefined),
      markAssistantTerminalCleanupInProgress: vi.fn(),
      setAssistantTerminalCleanupDiagnostic: vi.fn(),
    },
    abortSessionRun: vi.fn(async () => undefined),
    removeActiveSessionIfCurrent: vi.fn(),
    emitRunEvent: vi.fn((_event: DesktopEvent) => undefined),
    ...overrides,
  };
}

function createSession(): RuntimePromptExecutionSession {
  return {
    sessionFile: "session.jsonl",
    isStreaming: true,
    prompt: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
}

function createController(): RuntimePromptExecutionController {
  return {
    promptCompletion: Promise.resolve("prompt"),
    finalizeAssistantTerminalRun: vi.fn(async () => undefined),
    waitForPromptAfterAbort: vi.fn(async () => "prompt"),
  };
}
