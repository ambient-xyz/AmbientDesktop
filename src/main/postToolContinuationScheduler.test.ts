import { describe, expect, it } from "vitest";
import {
  browserUserActionContinuationLinesFromToolContent,
  createPostToolContinuationRequest,
  planPostToolContinuation,
  postToolContinuationActivity,
  postToolIdleContinuationPrompt,
  privilegedContinuationLinesFromToolContent,
  shouldDeliverPostToolContinuation,
  stalePostToolContinuationActivity,
  validatePostToolContinuationRequest,
} from "./postToolContinuationScheduler";

describe("postToolContinuationScheduler", () => {
  it("builds generic continuation prompts without stale most-recent-tool claims", () => {
    const prompt = postToolIdleContinuationPrompt({
      runId: "run-1",
      toolCallId: "tool-bash-1",
      messageId: "message-bash-1",
      eventSeqAtEnd: 12,
      label: "bash",
      status: "done",
    });

    expect(prompt).toContain("Continue after the latest completed tool result identified below if it is still current.");
    expect(prompt).toContain("Tool call id: tool-bash-1");
    expect(prompt).toContain("Validated completed tool: bash (done).");
    expect(prompt).not.toContain("Most recent tool: bash");
  });

  it("validates explicit internal continuation requests and reports stale event sequences", () => {
    const request = createPostToolContinuationRequest({
      runId: "run-1",
      attempt: 2,
      idleMs: 15_000,
      eventSeqAtSchedule: 41,
      scheduledAt: "2026-05-25T22:00:00.000Z",
      snapshot: {
        runId: "run-1",
        toolCallId: "tool-bash-1",
        messageId: "message-bash-1",
        eventSeqAtEnd: 41,
        label: "bash",
        status: "done",
      },
    });

    expect(validatePostToolContinuationRequest({
      request,
      latestTranscriptTool: {
        toolCallId: "tool-bash-1",
        messageId: "message-bash-1",
        label: "bash",
        status: "done",
      },
      currentRunId: "run-1",
      currentEventSeq: 42,
    })).toMatchObject({
      deliver: false,
      diagnostic: {
        requestId: "post-tool-continuation:run-1:2:41",
        reason: "event-seq-advanced",
        currentRunId: "run-1",
        currentEventSeq: 42,
        snapshotToolCallId: "tool-bash-1",
      },
    });
  });

  it("preserves legacy freshness semantics for call sites that still pass snapshots directly", () => {
    expect(shouldDeliverPostToolContinuation({
      snapshot: {
        runId: "run-1",
        toolCallId: "tool-bash-1",
        messageId: "message-bash-1",
        eventSeqAtEnd: 41,
        label: "bash",
        status: "done",
      },
      latestTranscriptTool: {
        toolCallId: "tool-bash-1",
        messageId: "message-bash-1",
        label: "bash",
        status: "done",
      },
      currentRunId: "run-1",
      currentEventSeq: 41,
    })).toBe(true);
  });

  it("plans a continuation request from the latest matching tool transcript", () => {
    expect(planPostToolContinuation({
      runId: "run-1",
      attempt: 3,
      idleMs: 15_000,
      currentEventSeq: 9,
      lastCompletedTool: {
        runId: "run-1",
        toolCallId: "tool-bash-1",
        eventSeqAtEnd: 9,
        label: "bash",
        status: "done",
      },
      messages: [
        {
          id: "message-tool-1",
          threadId: "thread-1",
          role: "tool",
          content: "bash completed\nContinuation:\n- next: summarize result",
          metadata: {
            status: "done",
            toolName: "bash",
            toolCallId: "tool-bash-1",
          },
          createdAt: "2026-05-25T22:00:00.000Z",
        },
      ],
    })).toMatchObject({
      latestTranscriptTool: {
        toolCallId: "tool-bash-1",
        messageId: "message-tool-1",
        continuationLines: ["- next: summarize result"],
      },
      continuationSnapshot: {
        runId: "run-1",
        toolCallId: "tool-bash-1",
        messageId: "message-tool-1",
        eventSeqAtEnd: 9,
      },
      request: {
        id: "post-tool-continuation:run-1:3:9",
        attempt: 3,
        idleMs: 15_000,
        eventSeqAtSchedule: 9,
      },
      validation: {
        deliver: true,
        snapshot: {
          toolCallId: "tool-bash-1",
          messageId: "message-tool-1",
        },
      },
    });
  });

  it("reports a stale continuation plan when the latest transcript tool no longer matches", () => {
    expect(planPostToolContinuation({
      runId: "run-1",
      attempt: 1,
      idleMs: 15_000,
      currentEventSeq: 12,
      lastCompletedTool: {
        runId: "run-1",
        toolCallId: "tool-old",
        messageId: "message-old",
        eventSeqAtEnd: 12,
        label: "bash",
        status: "done",
      },
      messages: [
        {
          id: "message-new",
          threadId: "thread-1",
          role: "tool",
          content: "read_file completed",
          metadata: {
            status: "done",
            toolName: "read_file",
            toolCallId: "tool-new",
          },
          createdAt: "2026-05-25T22:01:00.000Z",
        },
      ],
    })).toMatchObject({
      latestTranscriptTool: {
        toolCallId: "tool-new",
        messageId: "message-new",
      },
      request: {
        id: "post-tool-continuation:run-1:1:12",
      },
      validation: {
        deliver: false,
        diagnostic: {
          reason: "tool-mismatch",
          snapshotToolCallId: "tool-old",
          latestToolCallId: "tool-new",
        },
      },
    });
  });

  it("builds post-tool continuation activity messages", () => {
    expect(postToolContinuationActivity({
      threadId: "thread-1",
      outputChars: 12,
      thinkingChars: 4,
      idleElapsedMs: 15000,
      idleTimeoutMs: 30000,
      trigger: "post-tool-idle",
      attempt: 1,
      maxAttempts: 3,
    })).toEqual({
      threadId: "thread-1",
      kind: "stream",
      status: "running",
      outputChars: 12,
      thinkingChars: 4,
      idleElapsedMs: 15000,
      idleTimeoutMs: 30000,
      message: "Ambient is asking Pi to continue from the completed tool result (attempt 1/3).",
    });

    expect(postToolContinuationActivity({
      threadId: "thread-1",
      outputChars: 12,
      thinkingChars: 4,
      idleElapsedMs: 15000,
      idleTimeoutMs: 30000,
      trigger: "prompt-resolved-after-tool",
      attempt: 2,
      maxAttempts: 3,
    }).message).toBe(
      "Ambient is asking Pi to continue from the completed tool result after the prompt resolved without a final answer (attempt 2/3).",
    );
  });

  it("builds stale post-tool continuation activity diagnostics", () => {
    const diagnostic = {
      reason: "event-seq-advanced" as const,
      currentRunId: "run-1",
      currentEventSeq: 42,
      requestId: "post-tool-continuation:run-1:1:41",
    };

    expect(stalePostToolContinuationActivity({
      threadId: "thread-1",
      outputChars: 12,
      thinkingChars: 4,
      idleElapsedMs: 15000,
      idleTimeoutMs: 30000,
      diagnostic,
    })).toEqual({
      threadId: "thread-1",
      kind: "stream",
      status: "running",
      outputChars: 12,
      thinkingChars: 4,
      idleElapsedMs: 15000,
      idleTimeoutMs: 30000,
      message: "Ambient skipped a stale post-tool continuation because newer run activity arrived before delivery.",
      diagnostic,
    });
  });

  it("extracts privileged and browser continuation lines", () => {
    expect(privilegedContinuationLinesFromToolContent([
      "privileged_action completed",
      "Continuation:",
      "- state: waiting-for-credential",
      "- next: retry",
      "",
      "Other text",
    ].join("\n"))).toEqual(["- state: waiting-for-credential", "- next: retry"]);

    expect(browserUserActionContinuationLinesFromToolContent([
      "Browser needs user action.",
      "Action: captcha",
      "Provider: cloudflare",
      "Title: Bot check",
      "URL: https://example.test",
    ].join("\n"))).toContain("- browserState: waiting-for-browser-user-action");
  });
});
