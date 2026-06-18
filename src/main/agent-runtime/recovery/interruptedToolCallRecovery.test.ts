import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildInterruptedToolCallRecoveryPrompt,
  InterruptedToolCallRecoveryTracker,
  serializeToolInputForInterruptedRecovery,
} from "./interruptedToolCallRecovery";
import type { ToolArgumentProgressSnapshot, ToolIntentSnapshot } from "../../../shared/threadTypes";

describe("InterruptedToolCallRecoveryTracker", () => {
  it("captures large partial tool arguments to a workspace-local recovery file", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-interrupted-tool-"));
    try {
      const tracker = new InterruptedToolCallRecoveryTracker({ workspacePath, runId: "run-1", thresholdChars: 1_000 });
      const rawInput = { path: "report.md", content: "x".repeat(1_250) };
      const capture = serializeToolInputForInterruptedRecovery(rawInput, "");
      const snapshot = tracker.observe({
        toolCallId: "call-write",
        toolName: "write",
        inputText: capture.text,
        source: capture.source,
        progress: progressSnapshot("call-write", "write", 1_250),
        nowMs: Date.UTC(2026, 0, 1),
      });

      expect(snapshot).toMatchObject({
        status: "capturing",
        runId: "run-1",
        toolCallId: "call-write",
        toolName: "write",
        source: "raw_tool_input",
        parseStatus: "valid_json",
        writeTargetPath: "report.md",
        writeContentPrefixChars: 1_250,
      });
      expect(snapshot?.workspaceRelativeArgumentPath).toBe(".ambient-codex/interrupted-tool-calls/run-1/call-write.partial-args.txt");
      await expect(readFile(snapshot!.argumentPath, "utf8")).resolves.toBe(capture.text);

      const [recoverable] = tracker.recoverable();
      expect(recoverable).toMatchObject({ status: "recoverable", capturedChars: capture.text.length });
      const prompt = buildInterruptedToolCallRecoveryPrompt([recoverable]);
      expect(prompt).toContain("Continue the same user request");
      expect(prompt).toContain("exact-args tool: recovery_read_interrupted_tool_call");
      expect(prompt).toContain("write-suffix tool: recovery_apply_interrupted_write_suffix");
      expect(prompt).toContain("normal write fallback:");
      expect(prompt).toContain('"recoveryMode":"interrupted_write_suffix"');
      expect(prompt).toContain('"path":"report.md"');
      expect(prompt).toContain("saved write target path: report.md");
      expect(prompt).toContain("saved content prefix chars: 1250");
      expect(prompt).toContain("Do not use ambient_tool_search");
      expect(prompt).toContain("<only the missing suffix after the saved content prefix>");
      expect(prompt).toContain("saved content prefix tail (decoded raw text");
      expect(prompt).toContain(rawInput.content.slice(-80));
      expect(prompt).toContain("target file may not exist");
      expect(prompt).toContain('"runId":"run-1"');
      expect(prompt).toContain('"toolCallId":"call-write"');
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("can force-capture smaller partial tool arguments after a stalled stream", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-interrupted-tool-forced-"));
    try {
      const tracker = new InterruptedToolCallRecoveryTracker({ workspacePath, runId: "run-forced", thresholdChars: 16_000 });
      const rawInput = { path: "tic-tac-toe.html", content: "section\n".repeat(500) };
      const capture = serializeToolInputForInterruptedRecovery(rawInput, "");
      const snapshot = tracker.observe({
        toolCallId: "call-small-write",
        toolName: "write",
        inputText: capture.text,
        source: capture.source,
        progress: progressSnapshot("call-small-write", "write", capture.text.length),
        force: true,
        nowMs: Date.UTC(2026, 0, 1),
      });

      expect(snapshot).toMatchObject({
        status: "capturing",
        toolCallId: "call-small-write",
        toolName: "write",
        capturedChars: capture.text.length,
        thresholdChars: 16_000,
        parseStatus: "valid_json",
      });
      await expect(readFile(snapshot!.argumentPath, "utf8")).resolves.toBe(capture.text);
      expect(tracker.recoverable()).toEqual([expect.objectContaining({ status: "recoverable", toolCallId: "call-small-write" })]);
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("captures interrupted recovery-apply calls as missing-tail recovery prompts", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-interrupted-recovery-apply-"));
    try {
      const tracker = new InterruptedToolCallRecoveryTracker({ workspacePath, runId: "run-nested", thresholdChars: 20 });
      const rawInput = {
        runId: "run-original",
        toolCallId: "call-write",
        sha256: "original-sha",
        suffix: {
          preview: "beta gamma",
          chars: "beta gamma delta\n".length,
          truncated: true,
          omittedChars: " delta\n".length,
        },
      };
      const capture = serializeToolInputForInterruptedRecovery(rawInput, "");
      const snapshot = tracker.observe({
        toolCallId: "call-recovery",
        toolName: "recovery_apply_interrupted_write_suffix",
        inputText: capture.text,
        source: capture.source,
        progress: progressSnapshot("call-recovery", "recovery_apply_interrupted_write_suffix", capture.text.length),
        force: true,
        nowMs: Date.UTC(2026, 0, 1),
      });

      expect(snapshot).toMatchObject({
        status: "capturing",
        runId: "run-nested",
        toolCallId: "call-recovery",
        toolName: "recovery_apply_interrupted_write_suffix",
        parseStatus: "valid_json",
        recoveryApplyOriginalRunId: "run-original",
        recoveryApplyOriginalToolCallId: "call-write",
        recoveryApplyOriginalSha256: "original-sha",
        recoveryApplySuffixPrefixChars: "beta gamma".length,
        recoveryApplySuffixTotalChars: "beta gamma delta\n".length,
        recoveryApplySuffixPrefixTruncated: true,
        recoveryApplySuffixPrefixOmittedChars: " delta\n".length,
      });
      expect(snapshot?.resumeInstruction).toContain("missing tail after the saved recovery suffix prefix");

      const [recoverable] = tracker.recoverable();
      const prompt = buildInterruptedToolCallRecoveryPrompt([recoverable]);
      expect(prompt).toContain("interrupted recovery apply: this interrupted tool call is recovery_apply_interrupted_write_suffix");
      expect(prompt).toContain('"runId":"run-original","toolCallId":"call-write","sha256":"original-sha"');
      expect(prompt).toContain("<only the missing tail after the saved recovery suffix prefix>");
      expect(prompt).toContain("Ambient will compose the original saved write prefix, saved recovery suffix prefix, and provided tail");
      expect(prompt).toContain("saved recovery suffix prefix tail");
      expect(prompt).toContain("beta gamma");
      expect(prompt).toContain("Do not use ambient_tool_search");
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("preserves interrupted tool intent in recovery prompts", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-interrupted-tool-intent-"));
    try {
      const tracker = new InterruptedToolCallRecoveryTracker({ workspacePath, runId: "run-intent", thresholdChars: 20 });
      const intent: ToolIntentSnapshot = {
        version: 1,
        toolCallId: "call-fetch",
        toolName: "web_research_fetch",
        turnGoal: "Find the best current source for Monsoon PCs inventory.",
        declaredPurpose: "verify the current Monsoon PCs store inventory",
        operationKind: "verify_specific_source",
        targetSummary: "https://monsoonpcs.com/store/",
        materiality: "required_before_final_answer",
        substituteAllowed: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      };

      const largeNote = "current store inventory ".repeat(70);
      tracker.observe({
        toolCallId: "call-fetch",
        toolName: "web_research_fetch",
        inputText: JSON.stringify({
          url: "https://monsoonpcs.com/store/",
          purpose: "verify the current Monsoon PCs store inventory",
          note: largeNote,
        }),
        source: "raw_tool_input",
        progress: progressSnapshot("call-fetch", "web_research_fetch", largeNote.length),
        intent,
      });

      const [recoverable] = tracker.recoverable();
      expect(recoverable.intent).toMatchObject({
        toolName: "web_research_fetch",
        operationKind: "verify_specific_source",
        targetSummary: "https://monsoonpcs.com/store/",
        materiality: "required_before_final_answer",
      });
      const prompt = buildInterruptedToolCallRecoveryPrompt([recoverable]);
      expect(prompt).toContain("intent: verify_specific_source; required_before_final_answer; target=https://monsoonpcs.com/store/; purpose=verify the current Monsoon PCs store inventory; substitute_allowed");
      expect(prompt).toContain("required_before_final_answer tools must be retried or satisfied with equivalent evidence");
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("drops recovery once tool execution starts", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-interrupted-tool-complete-"));
    try {
      const tracker = new InterruptedToolCallRecoveryTracker({ workspacePath, runId: "run-2", thresholdChars: 1_000 });
      tracker.observe({
        toolCallId: "call-write",
        toolName: "write",
        inputText: JSON.stringify({ path: "report.md", content: "x".repeat(1_250) }),
        source: "raw_tool_input",
        progress: progressSnapshot("call-write", "write", 1_250),
      });

      const completed = tracker.markExecutionStarted("call-write");
      expect(completed?.status).toBe("completed");
      expect(tracker.recoverable()).toEqual([]);
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function progressSnapshot(toolCallId: string, toolName: string, chars: number): ToolArgumentProgressSnapshot {
  return {
    version: 1,
    phase: "argument_stream",
    eventType: "toolcall_delta",
    toolCallId,
    toolName,
    uiStatus: "preparing",
    argumentStartedAt: "2026-01-01T00:00:00.000Z",
    argumentUpdatedAt: "2026-01-01T00:00:00.000Z",
    argumentElapsedMs: 0,
    argumentComplete: false,
    inputChars: chars,
    deltaChars: chars,
    totalDeltaChars: chars,
    maxDeltaChars: chars,
    observedArgumentChars: chars,
    argumentEventCount: 1,
    toolcallDeltaCount: 1,
    meaningfulGrowthCount: 1,
    charsPerSecond: 0,
  };
}
