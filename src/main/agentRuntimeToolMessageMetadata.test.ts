import { describe, expect, it } from "vitest";

import type {
  ToolArgumentProgressSnapshot,
  ToolEditInputPreview,
  ToolEventDetails,
  ToolLongformInputPreview,
} from "../shared/types";
import type { ToolResultDetails } from "./piEventMapper";
import {
  stringMetadata,
  subagentParentControlAbortIntentFromToolEnd,
  toolMessageMetadata,
} from "./agentRuntimeToolMessageMetadata";
import { AMBIENT_SUBAGENT_TOOL_NAME } from "./subagentPiTools";

describe("agentRuntimeToolMessageMetadata", () => {
  it("builds tool metadata with result details and media artifact precedence", () => {
    const resultDetails: ToolResultDetails = {
      runtime: "workspace",
      mediaArtifact: {
        artifactPath: "artifacts/rendered.png",
        mediaKind: "image",
        mimeType: "image/png",
        bytes: 42,
        inlinePreviewEligible: true,
        displayInstruction: "Show image preview when available.",
      },
    };
    const longformInputPreview: ToolLongformInputPreview = {
      kind: "longform-input",
      summary: "large input",
      items: [],
    };
    const editInputPreview: ToolEditInputPreview = {
      kind: "edit-input",
      path: "edits/patch.diff",
      summary: "patch",
      edits: [],
    };
    const argumentProgress: ToolArgumentProgressSnapshot = {
      version: 1,
      phase: "argument_stream",
      eventType: "toolcall_delta",
      toolCallId: "tool-call-1",
      toolName: "custom_image",
      uiStatus: "Preparing input",
      argumentStartedAt: "2026-06-11T17:10:00.000Z",
      argumentUpdatedAt: "2026-06-11T17:10:01.000Z",
      argumentElapsedMs: 1000,
      argumentComplete: false,
      inputChars: 25,
      deltaChars: 5,
      totalDeltaChars: 25,
      maxDeltaChars: 5,
      observedArgumentChars: 25,
      argumentEventCount: 3,
      toolcallDeltaCount: 2,
      meaningfulGrowthCount: 2,
      charsPerSecond: 25,
    };

    expect(toolMessageMetadata(
      "done",
      "tool-call-1",
      "custom_image",
      "fallback/output.png",
      resultDetails,
      longformInputPreview,
      editInputPreview,
      argumentProgress,
    )).toEqual({
      status: "done",
      toolCallId: "tool-call-1",
      toolName: "custom_image",
      artifactPath: "artifacts/rendered.png",
      mediaArtifact: resultDetails.mediaArtifact,
      inlinePreviewEligible: true,
      toolResultDetails: resultDetails,
      toolLongformInputPreview: longformInputPreview,
      toolEditInputPreview: editInputPreview,
      toolArgumentProgress: argumentProgress,
    });
  });

  it("preserves non-empty string metadata without trimming", () => {
    expect(stringMetadata("  artifact.txt  ")).toBe("  artifact.txt  ");
    expect(stringMetadata("   ")).toBeUndefined();
    expect(stringMetadata(123)).toBeUndefined();
  });

  it("detects parent cancellation intent from nested subagent tool result records", () => {
    const details: ToolEventDetails = {
      toolName: AMBIENT_SUBAGENT_TOOL_NAME,
    };
    const event = {
      message: {
        content: {
          resultDetails: {
            payload: {
              runtime: "ambient-subagents",
              action: "resolve_barrier",
              parentRunId: "parent-run-1",
              waitBarrier: { id: "barrier-1" },
              resolutionArtifact: {
                parentCancellationRequested: true,
                userDecision: {
                  decision: "cancel_parent",
                  idempotencyKey: "decision-key-1",
                },
              },
              parentResolution: {
                reason: "User chose to stop the parent run.",
              },
            },
          },
        },
      },
    };

    expect(subagentParentControlAbortIntentFromToolEnd({
      toolCallId: "tool-call-2",
      label: "fallback",
      details,
    }, event)).toEqual({
      reason: "User chose to stop the parent run.",
      message: "Parent run cancelled by user while resolving sub-agent wait barrier barrier-1.",
      toolCallId: "tool-call-2",
      parentRunId: "parent-run-1",
      waitBarrierId: "barrier-1",
      idempotencyKey: "decision-key-1",
      decision: "cancel_parent",
    });
  });

  it("ignores unrelated subagent tool result records", () => {
    expect(subagentParentControlAbortIntentFromToolEnd({
      toolCallId: "tool-call-3",
      label: AMBIENT_SUBAGENT_TOOL_NAME,
      details: {
        toolName: AMBIENT_SUBAGENT_TOOL_NAME,
      },
    }, {
      result: {
        runtime: "ambient-subagents",
        action: "resolve_barrier",
        parentResolution: { action: "continue_parent" },
      },
    })).toBeUndefined();
  });
});
