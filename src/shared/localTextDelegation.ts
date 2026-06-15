import type { SubagentRunStatus } from "./subagentProtocol";

export const LOCAL_TEXT_OUTPUT_PREVIEW_CHARS = 8_000;
export const LOCAL_TEXT_RESULT_SCHEMA_VERSION = "ambient-local-text-result-v1" as const;

export interface LocalTextOutputValidation {
  schemaVersion: "ambient-local-text-output-validation-v1";
  valid: boolean;
  contentType: "text/plain";
  outputCharCount: number;
  previewCharCount: number;
  textPreview: string;
  requiresFullOutputArtifact: boolean;
  maxInlineChars: number;
  reason?: string;
}

export interface LocalTextResultArtifact {
  schemaVersion: typeof LOCAL_TEXT_RESULT_SCHEMA_VERSION;
  runId: string;
  modelId: string;
  providerId: string;
  status: Extract<SubagentRunStatus, "completed" | "failed" | "stopped" | "cancelled" | "timed_out" | "aborted_partial">;
  partial: boolean;
  contentType: "text/plain";
  outputCharCount: number;
  textPreview: string;
  fullOutputPath?: string;
}

export function validateLocalTextOutput(
  value: unknown,
  options: { maxInlineChars?: number } = {},
): LocalTextOutputValidation {
  const maxInlineChars = normalizedMaxInlineChars(options.maxInlineChars);
  if (typeof value !== "string") {
    return invalidLocalTextOutput("Local text delegation output must be a string.", maxInlineChars);
  }
  const outputCharCount = value.length;
  if (!value.trim()) {
    return invalidLocalTextOutput("Local text delegation output is empty.", maxInlineChars);
  }
  const textPreview = previewText(value, maxInlineChars);
  return {
    schemaVersion: "ambient-local-text-output-validation-v1",
    valid: true,
    contentType: "text/plain",
    outputCharCount,
    previewCharCount: textPreview.length,
    textPreview,
    requiresFullOutputArtifact: outputCharCount > maxInlineChars,
    maxInlineChars,
  };
}

export function buildLocalTextResultArtifact(input: {
  runId: string;
  modelId: string;
  providerId: string;
  status: LocalTextResultArtifact["status"];
  partial?: boolean;
  output: string;
  fullOutputPath?: string;
  maxInlineChars?: number;
}): LocalTextResultArtifact {
  const validation = validateLocalTextOutput(input.output, { maxInlineChars: input.maxInlineChars });
  if (!validation.valid) {
    throw new Error(validation.reason);
  }
  if (validation.requiresFullOutputArtifact && !input.fullOutputPath) {
    throw new Error("Local text delegation output exceeds the inline preview limit; fullOutputPath is required.");
  }
  return {
    schemaVersion: LOCAL_TEXT_RESULT_SCHEMA_VERSION,
    runId: input.runId,
    modelId: input.modelId,
    providerId: input.providerId,
    status: input.status,
    partial: input.partial ?? input.status === "aborted_partial",
    contentType: "text/plain",
    outputCharCount: validation.outputCharCount,
    textPreview: validation.textPreview,
    ...(input.fullOutputPath ? { fullOutputPath: input.fullOutputPath } : {}),
  };
}

function invalidLocalTextOutput(reason: string, maxInlineChars: number): LocalTextOutputValidation {
  return {
    schemaVersion: "ambient-local-text-output-validation-v1",
    valid: false,
    contentType: "text/plain",
    outputCharCount: 0,
    previewCharCount: 0,
    textPreview: "",
    requiresFullOutputArtifact: false,
    maxInlineChars,
    reason,
  };
}

function normalizedMaxInlineChars(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return LOCAL_TEXT_OUTPUT_PREVIEW_CHARS;
  return Math.max(256, Math.min(64_000, Math.floor(value)));
}

function previewText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}
