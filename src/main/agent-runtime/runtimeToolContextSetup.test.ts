import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../../shared/types";
import { ToolArgumentProgressTracker } from "../toolArgumentProgress";
import { createRuntimeTextOutputState } from "./runtimeTextOutputState";
import {
  createRuntimeToolContextSetup,
  type RuntimeToolContextSetupInput,
} from "./runtimeToolContextSetup";
import type {
  RuntimeToolMessageController,
  RuntimeToolMessageControllerInput,
} from "./runtimeToolMessageController";
import type {
  RuntimeToolRecoveryContext,
  RuntimeToolRecoveryContextInput,
} from "./runtimeToolRecoveryContext";

function chatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1",
    threadId: "thread-1",
    role: "tool",
    content: "tool content",
    createdAt: "2026-06-15T00:00:00.000Z",
    ...overrides,
  };
}

function createToolMessages(): RuntimeToolMessageController {
  return {
    size: vi.fn(() => 0),
    toolCallIds: vi.fn(function* () {}),
    inputs: vi.fn(() => new Map()),
    recoveryInputs: vi.fn(() => new Map()),
    labels: vi.fn(() => new Map()),
    messageId: vi.fn(() => "message-1"),
    inputContent: vi.fn(() => "visible input"),
    recoveryInput: vi.fn(() => "recovery input"),
    recoveryInputSource: vi.fn(() => "raw_tool_input"),
    longformInputPreview: vi.fn(),
    editInputPreview: vi.fn(),
    metadataFor: vi.fn(() => ({})),
    rememberRecoveryInput: vi.fn(),
    rememberLongformInputPreview: vi.fn(),
    rememberEditInputPreview: vi.fn(),
    upsertInputMessage: vi.fn(),
    emitRunningToolEvent: vi.fn(),
    applyResultUpdate: vi.fn(),
    markOpenToolMessagesFailed: vi.fn(() => 0),
    cleanupToolCall: vi.fn(),
  } as unknown as RuntimeToolMessageController;
}

function createToolRecovery(): RuntimeToolRecoveryContext {
  return {
    interruptedToolCallRecovery: { diagnostics: vi.fn() },
    toolIntentSnapshots: new Map(),
    persistToolArgumentDiagnostics: vi.fn(),
    trackInterruptedToolCallRecovery: vi.fn(),
    markInterruptedToolCallNoLongerRecoverable: vi.fn(),
    forceInterruptedToolCallRecovery: vi.fn(),
    rememberToolIntent: vi.fn(),
  } as unknown as RuntimeToolRecoveryContext;
}

function createInput(
  overrides: Partial<RuntimeToolContextSetupInput> = {},
): RuntimeToolContextSetupInput {
  const outputState = createRuntimeTextOutputState();
  outputState.setCurrentAssistantFinalText("I will write the report.");
  const toolMessages = createToolMessages();
  const toolRecovery = createToolRecovery();
  return {
    threadId: "thread-1",
    workspacePath: "/workspace",
    permissionMode: "workspace",
    runId: "run-1",
    outputState,
    visibleUserContent: "Please write the report.",
    isRunStoreActive: vi.fn(() => true),
    retrySourceUserMessageId: vi.fn(() => "user-1"),
    listMessages: vi.fn(() => [chatMessage()]),
    addToolMessage: vi.fn((messageInput) => chatMessage({
      threadId: messageInput.threadId,
      content: messageInput.content,
      metadata: messageInput.metadata,
    })),
    replaceMessage: vi.fn((messageId, content, metadata) => chatMessage({ id: messageId, content, metadata })),
    updateRunDiagnostics: vi.fn(),
    emitRunEvent: vi.fn(),
    createToolMessageController: vi.fn(() => toolMessages),
    createToolRecoveryContext: vi.fn(() => toolRecovery),
    ...overrides,
  };
}

describe("createRuntimeToolContextSetup", () => {
  it("creates tool message and recovery owners with explicit dependencies", () => {
    const input = createInput();

    const setup = createRuntimeToolContextSetup(input);

    expect(setup.toolMessages).toBe(vi.mocked(input.createToolMessageController!).mock.results[0].value);
    expect(setup.toolRecovery).toBe(vi.mocked(input.createToolRecoveryContext!).mock.results[0].value);
    expect(input.createToolMessageController).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-1",
        workspacePath: "/workspace",
        permissionMode: "workspace",
        startedToolCallIds: setup.startedToolCallIds,
        listMessages: input.listMessages,
        addToolMessage: input.addToolMessage,
        replaceMessage: input.replaceMessage,
        emitRunEvent: input.emitRunEvent,
      }),
    );
    expect(input.createToolRecoveryContext).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePath: "/workspace",
        runId: "run-1",
        toolArgumentProgress: setup.toolArgumentProgress,
        isRunStoreActive: input.isRunStoreActive,
        updateRunDiagnostics: input.updateRunDiagnostics,
        retrySourceUserMessageId: input.retrySourceUserMessageId,
      }),
    );
  });

  it("shares argument progress and started tool-call state with the tool message controller", () => {
    const progress = new ToolArgumentProgressTracker();
    const input = createInput({
      createToolArgumentProgress: vi.fn(() => progress),
    });

    const setup = createRuntimeToolContextSetup(input);

    progress.recordArgumentEvent({
      toolCallId: "tool-call-1",
      toolName: "ambient_write_file",
      eventType: "toolcall_delta",
      inputContent: "{\"path\":\"demo.txt\"}",
      nowMs: Date.parse("2026-06-15T00:00:01.000Z"),
    });
    setup.startedToolCallIds.add("tool-call-1");

    const messageInput = vi.mocked(input.createToolMessageController!).mock
      .calls[0][0] as RuntimeToolMessageControllerInput;
    expect(messageInput.progressForToolCall("tool-call-1")).toMatchObject({
      toolCallId: "tool-call-1",
      observedArgumentChars: 19,
    });
    expect(messageInput.startedToolCallIds.has("tool-call-1")).toBe(true);
  });

  it("maps recovery context callbacks to tool messages and text output state", () => {
    const input = createInput({
      recoveryThresholdChars: 42,
    });
    createRuntimeToolContextSetup(input);

    const recoveryInput = vi.mocked(input.createToolRecoveryContext!).mock
      .calls[0][0] as RuntimeToolRecoveryContextInput;
    expect(recoveryInput.thresholdChars).toBe(42);
    expect(recoveryInput.turnGoal()).toBe("Please write the report.");
    expect(recoveryInput.assistantLeadIn()).toBe("I will write the report.");
    expect(recoveryInput.recoveryInput("tool-call-1")).toBe("recovery input");
    expect(recoveryInput.inputContent("tool-call-1")).toBe("visible input");
    expect(recoveryInput.recoveryInputSource("tool-call-1")).toBe("raw_tool_input");
  });
});
