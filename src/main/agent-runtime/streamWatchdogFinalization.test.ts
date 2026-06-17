import { describe, expect, it } from "vitest";

import type { ChatStreamInterruptionDiagnostic } from "../agent-runtime/agentRuntimeSendStreamDiagnostics";
import { streamWatchdogFinalizationMessage } from "./streamWatchdogFinalization";

const streamInterruptionDiagnostic: ChatStreamInterruptionDiagnostic = {
  kind: "stream_idle_timeout",
  message: "Ambient/Pi stream stalled after 30000 ms without stream activity.",
  retryScheduled: false,
  replaySafe: false,
  runStartedAt: "2026-06-15T00:00:00.000Z",
  firstStreamEventAt: "2026-06-15T00:00:00.250Z",
  firstVisibleTextAt: "2026-06-15T00:00:01.000Z",
  semanticOutputSeen: true,
  toolCallSeen: false,
  assistantOutputChars: 14,
  thinkingOutputChars: 0,
  toolMessageCount: 0,
  currentAssistantFinalTextChars: 14,
  streamEventCount: 3,
};

describe("streamWatchdogFinalizationMessage", () => {
  it("preserves partial visible assistant content before the interruption notice", () => {
    const result = streamWatchdogFinalizationMessage({
      status: "error",
      currentAssistantVisibleContent: "Partial answer.",
      interruptionNotice: "Ambient/Pi stream interrupted after visible output.\n\nStream stalled.",
      streamInterruptionDiagnostic,
    });

    expect(result.content).toBe(
      "Partial answer.\n\nAmbient/Pi stream interrupted after visible output.\n\nStream stalled.",
    );
    expect(result.metadata).toMatchObject({
      status: "error",
      runtime: "pi",
      provider: "ambient",
      piStreamInterruption: streamInterruptionDiagnostic,
    });
  });

  it("uses only the interruption notice when there is no visible assistant content", () => {
    const result = streamWatchdogFinalizationMessage({
      status: "error",
      currentAssistantVisibleContent: "   ",
      interruptionNotice: "Ambient/Pi stream interrupted.\n\nStream stalled.",
      streamInterruptionDiagnostic,
    });

    expect(result.content).toBe("Ambient/Pi stream interrupted.\n\nStream stalled.");
    expect(result.metadata).toMatchObject({
      status: "error",
      piStreamInterruption: streamInterruptionDiagnostic,
    });
  });

  it("preserves aborted status while retaining the stream interruption diagnostic", () => {
    const result = streamWatchdogFinalizationMessage({
      status: "aborted",
      currentAssistantVisibleContent: "",
      interruptionNotice: "Ambient/Pi stream interrupted.\n\nRun stopped.",
      streamInterruptionDiagnostic: {
        ...streamInterruptionDiagnostic,
        kind: "user_abort",
        message: "Run stopped.",
      },
    });

    expect(result.content).toBe("Ambient/Pi stream interrupted.\n\nRun stopped.");
    expect(result.metadata).toMatchObject({
      status: "aborted",
      runtime: "pi",
      provider: "ambient",
      piStreamInterruption: {
        kind: "user_abort",
        message: "Run stopped.",
      },
    });
  });
});
