import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../shared/threadTypes";
import { messageContentWithoutDiagnostic, messageDiagnosticCardModel, messageHasProviderDiagnostic } from "./messageDiagnosticUiModel";

describe("messageDiagnosticUiModel", () => {
  it("detects provider interruption diagnostics without treating normal text as the diagnostic body", () => {
    const message: ChatMessage = {
      id: "message-1",
      threadId: "thread-1",
      role: "assistant",
      content: [
        "I updated the files.",
        "",
        "Ambient/Pi provider stream was interrupted. Ambient is starting a continuation turn from the durable recovery state instead of stopping the task.",
        "",
        "Error: Ambient/Pi stream stalled after 30000ms without stream activity.",
      ].join("\n"),
      createdAt: "2026-05-28T00:00:00.000Z",
      metadata: {
        status: "error",
        providerInterruptionContinuation: true,
        piStreamInterruption: {
          message: "Ambient/Pi stream stalled after 30000ms without stream activity.",
          retryScheduled: false,
          retryAttempt: 2,
          maxRetries: 2,
          completedToolMessageCount: 4,
          interruptedToolCalls: [
            { toolName: "bash", certainty: "preparing", inputChars: 77 },
          ],
        },
      },
    };

    expect(messageHasProviderDiagnostic(message)).toBe(true);
    const model = messageDiagnosticCardModel(message);
    expect(model?.tone).toBe("warning");
    expect(model?.summary).toContain("stopped to avoid replaying side effects");
    expect(model?.details).toContain("77");
    expect(model?.details).not.toContain("I updated the files.");
    expect(messageContentWithoutDiagnostic(message)).toBe("I updated the files.");
  });

  it("models visible transcript recovery system messages as dismissible diagnostics", () => {
    const message: ChatMessage = {
      id: "message-2",
      threadId: "thread-1",
      role: "system",
      content: "Model context was rebuilt from the visible transcript. This recovery is lossy.",
      createdAt: "2026-05-28T00:00:00.000Z",
      metadata: { status: "done", runtime: "ambient-recovery", lossy: true },
    };

    const model = messageDiagnosticCardModel(message);
    expect(model?.title).toBe("System recovery");
    expect(model?.dismissible).toBe(true);
    expect(model?.details).toContain("Model context was rebuilt");
    expect(messageContentWithoutDiagnostic(message)).toBe("");
  });

  it("models Symphony parent-mode recovery as a non-dismissible conductor card", () => {
    const message: ChatMessage = {
      id: "message-symphony-recovery",
      threadId: "thread-1",
      role: "assistant",
      content: "Symphony launch needs a recovery choice.",
      createdAt: "2026-06-19T00:00:00.000Z",
      metadata: {
        status: "error",
        runtime: "pi",
        provider: "ambient",
        symphonyParentModeRecovery: {
          schemaVersion: "ambient-symphony-parent-mode-recovery-v1",
          expectedWorkflowToolName: "ambient_workflow_symphony_map_reduce",
          expectedWorkflowSourceKind: "symphony_recipe",
          expectedPatternId: "map_reduce",
          launchRequirement: "required_this_turn",
          details: [
            "Expected workflow tool: ambient_workflow_symphony_map_reduce",
            "Reason: no launch",
          ],
          actions: [
            { id: "retry_launch", label: "Retry launch", description: "Try again." },
            { id: "exit_symphony_mode", label: "Exit Symphony mode", description: "Run normally next turn." },
          ],
        },
      },
    };

    const model = messageDiagnosticCardModel(message);
    expect(model).toMatchObject({
      title: "Symphony recovery",
      tone: "warning",
      dismissible: false,
    });
    expect(model?.details).toContain("ambient_workflow_symphony_map_reduce");
    expect(model?.details).toContain("Retry launch");
    expect(model?.details).toContain("Exit Symphony mode");
    expect(messageContentWithoutDiagnostic(message)).toBe("");
  });

  it("models pre-output stream stall retries as provider diagnostics", () => {
    const message: ChatMessage = {
      id: "message-3",
      threadId: "thread-1",
      role: "assistant",
      content: "Ambient/Pi stream stalled before assistant output. Retrying assistant finalization attempt 2/10 with a fresh session.",
      createdAt: "2026-05-28T00:00:00.000Z",
      metadata: {
        status: "done",
        runtime: "pi",
        provider: "ambient",
        retryingStreamStall: true,
        piStreamTimeout: {
          message: "Ambient/Pi stream stalled after 30000ms without stream activity.",
          retryScheduled: true,
          retryUsesFreshSession: true,
          retryAttempt: 2,
          maxRetries: 10,
          retryReason: "pre_output_stream_stall",
        },
      },
    };

    expect(messageHasProviderDiagnostic(message)).toBe(true);
    const model = messageDiagnosticCardModel(message);
    expect(model?.title).toBe("Provider retry");
    expect(model?.summary).toContain("fresh session");
    expect(model?.details).toContain("Retry attempt: 2/10");
    expect(messageContentWithoutDiagnostic(message)).toBe("");
  });

  it("keeps visible assistant text while moving trailing pre-output retry diagnostics into the card", () => {
    const message: ChatMessage = {
      id: "message-4",
      threadId: "thread-1",
      role: "assistant",
      content: [
        "I found the project state.",
        "",
        "Ambient/Pi stream stalled before assistant output. Retrying assistant finalization attempt 1/10 with a fresh session.",
      ].join("\n"),
      createdAt: "2026-05-28T00:00:00.000Z",
      metadata: {
        status: "done",
        runtime: "pi",
        provider: "ambient",
        retryingStreamStall: true,
        piStreamTimeout: {
          message: "Ambient/Pi stream stalled after 30000ms without stream activity.",
          retryScheduled: true,
          retryAttempt: 1,
          maxRetries: 10,
          retryReason: "pre_output_stream_stall",
        },
      },
    };

    expect(messageDiagnosticCardModel(message)?.title).toBe("Provider retry");
    expect(messageContentWithoutDiagnostic(message)).toBe("I found the project state.");
  });
});
