import { createHash } from "node:crypto";
import type { WorkflowPromptCacheCheckpoint, WorkflowPromptCacheStage } from "../shared/types";
import { estimateTokensFromText } from "./contextAccounting";

const DEFAULT_BOUNDARY_LABEL = "Workflow prompt cache checkpoint";

export interface WorkflowPromptCacheInput {
  stage: WorkflowPromptCacheStage;
  workflowThreadId?: string;
  revisionId?: string;
  graphSnapshotId?: string;
  stablePrefix: string;
  mutableSuffix: string;
  boundaryLabel?: string;
  createdAt?: string;
}

export interface WorkflowPromptParts {
  stablePrefix: string;
  mutableSuffix: string;
  prompt: string;
  cacheCheckpoint: WorkflowPromptCacheCheckpoint;
}

export function workflowPromptParts(input: WorkflowPromptCacheInput): WorkflowPromptParts {
  const stablePrefix = normalizePromptPart(input.stablePrefix);
  const mutableSuffix = normalizePromptPart(input.mutableSuffix);
  return {
    stablePrefix,
    mutableSuffix,
    prompt: joinWorkflowPromptParts(stablePrefix, mutableSuffix, input.boundaryLabel),
    cacheCheckpoint: workflowPromptCacheCheckpoint({
      ...input,
      stablePrefix,
      mutableSuffix,
    }),
  };
}

export function workflowPromptCacheCheckpoint(input: WorkflowPromptCacheInput): WorkflowPromptCacheCheckpoint {
  const stablePrefix = normalizePromptPart(input.stablePrefix);
  const mutableSuffix = normalizePromptPart(input.mutableSuffix);
  const request = joinWorkflowPromptParts(stablePrefix, mutableSuffix, input.boundaryLabel);
  const stablePrefixHash = sha256(stablePrefix);
  const mutableSuffixHash = sha256(mutableSuffix);
  const requestHash = sha256(request);
  const boundaryLabel = input.boundaryLabel?.trim() || DEFAULT_BOUNDARY_LABEL;
  return {
    id: `workflow-cache-${input.stage}-${stablePrefixHash.slice(0, 12)}-${mutableSuffixHash.slice(0, 12)}`,
    stage: input.stage,
    workflowThreadId: emptyToUndefined(input.workflowThreadId),
    revisionId: emptyToUndefined(input.revisionId),
    graphSnapshotId: emptyToUndefined(input.graphSnapshotId),
    stablePrefixHash,
    stablePrefixChars: stablePrefix.length,
    stablePrefixEstimatedTokens: estimateTokensFromText(stablePrefix),
    mutableSuffixHash,
    mutableSuffixChars: mutableSuffix.length,
    mutableSuffixEstimatedTokens: estimateTokensFromText(mutableSuffix),
    requestHash,
    requestEstimatedTokens: estimateTokensFromText(request),
    boundaryLabel,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function joinWorkflowPromptParts(stablePrefix: string, mutableSuffix: string, boundaryLabel = DEFAULT_BOUNDARY_LABEL): string {
  return [
    normalizePromptPart(stablePrefix),
    "",
    `--- ${boundaryLabel.trim() || DEFAULT_BOUNDARY_LABEL}: mutable suffix begins ---`,
    "",
    normalizePromptPart(mutableSuffix),
  ].join("\n");
}

export function workflowPromptHash(value: string): string {
  return sha256(normalizePromptPart(value));
}

function normalizePromptPart(value: string): string {
  return value.trim().replace(/\r\n/g, "\n");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
