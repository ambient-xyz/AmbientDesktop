import { describe, expect, it } from "vitest";

import type { SendMessageInput } from "../../shared/desktopTypes";
import type { InterruptedToolCallRecoverySnapshot } from "../../shared/threadTypes";
import { buildInterruptedToolCallRecoveryInput } from "./agentRuntimeInterruptedToolRecoveryInput";

describe("buildInterruptedToolCallRecoveryInput", () => {
  it("builds a follow-up recovery input with prompt and retry metadata", () => {
    const result = buildInterruptedToolCallRecoveryInput({
      baseInput: sendInput(),
      permissionMode: "full-access",
      sessionRecovery: {
        kind: "interrupted_tool_call_recovery",
        reason: "Continuing after Ambient/Pi interrupted while preparing tool arguments.",
        previousSessionFile: "/workspace/.ambient/session.json",
        previousSessionFileExists: true,
      },
      attempt: 2,
      maxRetries: 3,
      snapshots: [snapshot("call-write"), snapshot("call-read")],
    });

    expect(result).toMatchObject({
      threadId: "thread-1",
      visibleUserContent: "Continue the interrupted tool call from the saved partial arguments.",
      permissionMode: "full-access",
      collaborationMode: "agent",
      model: "ambient-preview",
      thinkingLevel: "medium",
      delivery: "follow-up",
      preserveActiveThread: true,
      internal: true,
      continuationSource: "post-tool-continuation",
      context: [{ kind: "file", path: "/workspace/notes.md", name: "notes.md" }],
      workflowThreadId: "workflow-thread-1",
      sessionRecovery: {
        kind: "interrupted_tool_call_recovery",
        reason: "Continuing after Ambient/Pi interrupted while preparing tool arguments.",
        previousSessionFile: "/workspace/.ambient/session.json",
        previousSessionFileExists: true,
      },
      interruptedToolCallRecovery: {
        attempt: 2,
        maxRetries: 3,
        sourceToolCallIds: ["call-write", "call-read"],
      },
    });
    expect(result.content).toContain("Continue the same user request");
    expect(result.content).toContain("exact-args tool: recovery_read_interrupted_tool_call");
    expect(result.content).toContain("write-suffix tool: recovery_apply_interrupted_write_suffix");
    expect(result.content).toContain('"recoveryMode":"interrupted_write_suffix"');
    expect(result.content).toContain("Do not use ambient_tool_search");
    expect(result.content).toContain('"toolCallId":"call-write"');
    expect(result.modelContentOverride).toBe(result.content);
  });

  it("omits optional context and workflow fields when absent", () => {
    const { context: _context, workflowThreadId: _workflowThreadId, ...baseInput } = sendInput();

    const result = buildInterruptedToolCallRecoveryInput({
      baseInput,
      permissionMode: "workspace",
      sessionRecovery: {
        kind: "interrupted_tool_call_recovery",
        reason: "Retry with saved arguments.",
      },
      attempt: 1,
      maxRetries: 1,
      snapshots: [snapshot("call-write")],
    });

    expect(result).not.toHaveProperty("context");
    expect(result).not.toHaveProperty("workflowThreadId");
    expect(result.permissionMode).toBe("workspace");
    expect(result.interruptedToolCallRecovery).toEqual({
      attempt: 1,
      maxRetries: 1,
      sourceToolCallIds: ["call-write"],
    });
  });
});

function sendInput(): SendMessageInput {
  return {
    threadId: "thread-1",
    content: "Write a report",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient-preview",
    thinkingLevel: "medium",
    context: [{ kind: "file", path: "/workspace/notes.md", name: "notes.md" }],
    workflowThreadId: "workflow-thread-1",
  };
}

function snapshot(toolCallId: string): InterruptedToolCallRecoverySnapshot {
  return {
    version: 1,
    status: "recoverable",
    runId: "run-1",
    toolCallId,
    toolName: "write",
    source: "raw_tool_input",
    thresholdChars: 1000,
    capturedChars: 1200,
    observedArgumentChars: 1200,
    updatedAt: "2026-06-12T00:00:00.000Z",
    argumentPath: `/workspace/.ambient-codex/interrupted-tool-calls/run-1/${toolCallId}.partial-args.txt`,
    workspaceRelativeArgumentPath: `.ambient-codex/interrupted-tool-calls/run-1/${toolCallId}.partial-args.txt`,
    argumentSha256: `${toolCallId}-sha`,
    parseStatus: "valid_json",
    suffixPreview: "{\"path\":\"report.md\"}",
    resumeInstruction: "Use recovery_read_interrupted_tool_call before retrying the tool.",
  };
}
