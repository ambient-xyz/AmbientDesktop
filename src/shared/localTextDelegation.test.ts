import { describe, expect, it } from "vitest";
import {
  buildLocalTextResultArtifact,
  validateLocalTextOutput,
} from "./localTextDelegation";

describe("local text delegation shared contract", () => {
  it("accepts text output with a bounded preview", () => {
    const output = "x".repeat(300);
    expect(validateLocalTextOutput(output, { maxInlineChars: 256 })).toMatchObject({
      schemaVersion: "ambient-local-text-output-validation-v1",
      valid: true,
      contentType: "text/plain",
      outputCharCount: 300,
      previewCharCount: 256,
      textPreview: `${"x".repeat(253)}...`,
      requiresFullOutputArtifact: true,
      maxInlineChars: 256,
    });
  });

  it("rejects non-text and empty local outputs", () => {
    expect(validateLocalTextOutput({ text: "not raw text" })).toMatchObject({
      valid: false,
      reason: "Local text delegation output must be a string.",
    });
    expect(validateLocalTextOutput(" \n\t ")).toMatchObject({
      valid: false,
      reason: "Local text delegation output is empty.",
    });
  });

  it("requires a full artifact path for large local text results", () => {
    expect(() => buildLocalTextResultArtifact({
      runId: "run",
      modelId: "local/model",
      providerId: "local",
      status: "completed",
      output: "a".repeat(300),
      maxInlineChars: 256,
    })).toThrow(/fullOutputPath is required/);

    expect(buildLocalTextResultArtifact({
      runId: "run",
      modelId: "local/model",
      providerId: "local",
      status: "completed",
      output: "a".repeat(300),
      fullOutputPath: "/workspace/.ambient/local-text/run.txt",
      maxInlineChars: 256,
    })).toEqual({
      schemaVersion: "ambient-local-text-result-v1",
      runId: "run",
      modelId: "local/model",
      providerId: "local",
      status: "completed",
      partial: false,
      contentType: "text/plain",
      outputCharCount: 300,
      textPreview: `${"a".repeat(253)}...`,
      fullOutputPath: "/workspace/.ambient/local-text/run.txt",
    });

    expect(buildLocalTextResultArtifact({
      runId: "run-partial",
      modelId: "local/model",
      providerId: "local",
      status: "aborted_partial",
      output: "Partial local answer",
    })).toMatchObject({
      status: "aborted_partial",
      partial: true,
      textPreview: "Partial local answer",
    });
  });
});
