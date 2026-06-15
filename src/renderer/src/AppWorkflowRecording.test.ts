import { describe, expect, it } from "vitest";

import {
  coalesceWorkflowCompileProgress,
  workflowRecordingEditContextFromMetadata,
} from "./AppWorkflowRecording";

import type { WorkflowCompileProgress } from "../../shared/types";

describe("workflow recording helpers", () => {
  it("parses workflow recording edit context metadata", () => {
    expect(
      workflowRecordingEditContextFromMetadata({
        id: "recording-id",
        title: "Draft follow-up",
        version: 3,
        manifestPath: "recording/manifest.json",
        markdownPath: "recording/review.md",
        sidecarPath: "recording/review.json",
        transcriptPath: "recording/transcript.jsonl",
        ignored: "value",
      }),
    ).toEqual({
      id: "recording-id",
      title: "Draft follow-up",
      version: 3,
      manifestPath: "recording/manifest.json",
      markdownPath: "recording/review.md",
      sidecarPath: "recording/review.json",
      transcriptPath: "recording/transcript.jsonl",
    });
  });

  it("rejects incomplete workflow recording edit context metadata", () => {
    expect(workflowRecordingEditContextFromMetadata(undefined)).toBeUndefined();
    expect(workflowRecordingEditContextFromMetadata([])).toBeUndefined();
    expect(
      workflowRecordingEditContextFromMetadata({
        id: "recording-id",
        title: "Draft follow-up",
        version: "3",
        manifestPath: "recording/manifest.json",
        markdownPath: "recording/review.md",
        sidecarPath: "recording/review.json",
        transcriptPath: "recording/transcript.jsonl",
      }),
    ).toBeUndefined();
    expect(
      workflowRecordingEditContextFromMetadata({
        id: "recording-id",
        title: "Draft follow-up",
        version: 3,
        manifestPath: "recording/manifest.json",
        markdownPath: "recording/review.md",
        sidecarPath: "recording/review.json",
      }),
    ).toBeUndefined();
  });

  it("coalesces workflow compile progress for the active compile", () => {
    const queued = compileProgress({ compileId: "compile-a", phase: "context", status: "running", message: "Queued" });
    const started = compileProgress({ compileId: "compile-a", phase: "model", status: "running", message: "Started" });
    const updated = compileProgress({ compileId: "compile-a", phase: "model", status: "running", message: "Still compiling" });

    expect(coalesceWorkflowCompileProgress([], queued)).toEqual([queued]);
    expect(coalesceWorkflowCompileProgress([queued], started)).toEqual([queued, started]);
    expect(coalesceWorkflowCompileProgress([queued, started], updated)).toEqual([queued, updated]);
  });

  it("resets for a new compile and keeps the latest ten entries", () => {
    const previousCompile = compileProgress({ compileId: "compile-a", phase: "model", status: "running", message: "Old compile" });
    const nextCompile = compileProgress({ compileId: "compile-b", phase: "context", status: "running", message: "New compile" });

    expect(coalesceWorkflowCompileProgress([previousCompile], nextCompile)).toEqual([nextCompile]);

    const progress = [
      compileProgress({ compileId: "compile-c", phase: "context", status: "running", message: "Step 0" }),
      compileProgress({ compileId: "compile-c", phase: "prompt", status: "running", message: "Step 1" }),
      compileProgress({ compileId: "compile-c", phase: "model", status: "running", message: "Step 2" }),
      compileProgress({ compileId: "compile-c", phase: "validated", status: "running", message: "Step 3" }),
      compileProgress({ compileId: "compile-c", phase: "persisted", status: "running", message: "Step 4" }),
      compileProgress({ compileId: "compile-c", phase: "recorded", status: "running", message: "Step 5" }),
      compileProgress({ compileId: "compile-c", phase: "completed", status: "running", message: "Step 6" }),
      compileProgress({ compileId: "compile-c", phase: "failed", status: "running", message: "Step 7" }),
      compileProgress({ compileId: "compile-c", phase: "model", status: "completed", message: "Step 8" }),
      compileProgress({ compileId: "compile-c", phase: "validated", status: "completed", message: "Step 9" }),
      compileProgress({ compileId: "compile-c", phase: "persisted", status: "completed", message: "Step 10" }),
    ];
    const coalesced = progress.reduce<WorkflowCompileProgress[]>(coalesceWorkflowCompileProgress, []);

    expect(coalesced).toEqual(progress.slice(1));
  });
});

function compileProgress(overrides: Partial<WorkflowCompileProgress>): WorkflowCompileProgress {
  return {
    compileId: "compile-id",
    phase: "model",
    status: "running",
    message: "Compiling workflow",
    current: 1,
    total: 1,
    createdAt: "2026-06-04T00:00:00.000Z",
    ...overrides,
  };
}
