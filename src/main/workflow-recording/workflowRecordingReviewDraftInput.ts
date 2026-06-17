import type { WorkflowRecordingReviewDraftUpdate } from "../../shared/types";

export function workflowRecordingReviewDraftUpdateFromToolParams(params: unknown): WorkflowRecordingReviewDraftUpdate {
  const draft = objectRecord(objectRecord(params).draft);
  const textList = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  const successfulExamples = Array.isArray(draft.successfulExamples)
    ? draft.successfulExamples.map((item) => objectRecord(item)).map((item) => ({
        toolName: typeof item.toolName === "string" ? item.toolName : "",
        ...(typeof item.inputPreview === "string" ? { inputPreview: item.inputPreview } : {}),
        ...(typeof item.resultPreview === "string" ? { resultPreview: item.resultPreview } : {}),
        ...(typeof item.artifactPath === "string" ? { artifactPath: item.artifactPath } : {}),
      })).filter((item) => item.toolName.trim())
    : [];
  const doNot: WorkflowRecordingReviewDraftUpdate["doNot"] = Array.isArray(draft.doNot)
    ? draft.doNot.map((item) => objectRecord(item)).map((item) => ({
        ...(typeof item.toolName === "string" ? { toolName: item.toolName } : {}),
        status: workflowRecordingReviewAvoidPatternStatus(item.status),
        reason: typeof item.reason === "string" ? item.reason : "",
      })).filter((item) => item.reason.trim())
    : [];
  return {
    intent: typeof draft.intent === "string" ? draft.intent : "",
    inputs: textList(draft.inputs),
    successfulExamples,
    doNot,
    validation: textList(draft.validation),
    outputShape: textList(draft.outputShape),
  };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function workflowRecordingReviewAvoidPatternStatus(value: unknown): WorkflowRecordingReviewDraftUpdate["doNot"][number]["status"] {
  return value === "skipped" || value === "permission_blocked" ? value : "failed";
}
