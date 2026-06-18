import type { ProjectBoardSynthesisRunStage } from "../../shared/projectBoardTypes";
import type { ProjectStore } from "./projectBoardProjectStoreFacade";

export interface ProjectBoardDirectHelperRetryProgress {
  promptCharCount?: number;
  responseCharCount: number;
  requestDurationMs: number;
  transientRetry?: boolean;
  retryAttempt?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  retryError?: string;
  aggressiveRetries?: boolean;
  fallbackToNonStream?: boolean;
}

export function recordProjectBoardDirectHelperRetryActivity(input: {
  store: Pick<ProjectStore, "recordProjectBoardSynthesisRunEvent">;
  runId: string;
  stage: ProjectBoardSynthesisRunStage;
  title: string;
  helperLabel: string;
  progress: ProjectBoardDirectHelperRetryProgress;
  flushProgress?: () => void;
}): boolean {
  if (!input.progress.transientRetry) return false;
  input.flushProgress?.();
  const retryAttempt = input.progress.retryAttempt ?? 0;
  const maxRetries = input.progress.maxRetries ?? 0;
  const retryDelayMs = input.progress.retryDelayMs ?? 0;
  const retryPosition =
    retryAttempt > 0 && maxRetries > 0 ? `attempt ${retryAttempt}/${maxRetries}` : "the next available attempt";
  const retryDelay = retryDelayMs > 0 ? ` after ${retryDelayMs.toLocaleString()}ms` : "";
  const retryReason = sanitizedRetryReason(input.progress.retryError);
  const reasonText = retryReason ? ` (${retryReason})` : "";
  input.store.recordProjectBoardSynthesisRunEvent(input.runId, {
    stage: input.stage,
    title: input.title,
    summary: `Transient Ambient/Pi ${input.helperLabel} failure${reasonText}; retrying ${retryPosition}${retryDelay}.`,
    metadata: {
      transientRetry: true,
      aggressiveRetries: input.progress.aggressiveRetries === true,
      retryAttempt: input.progress.retryAttempt,
      maxRetries: input.progress.maxRetries,
      retryDelayMs: input.progress.retryDelayMs,
      error: retryReason,
      rawErrorLength: input.progress.retryError?.length,
      fallbackToNonStream: input.progress.fallbackToNonStream === true,
      promptCharCount: input.progress.promptCharCount,
      responseCharCount: input.progress.responseCharCount,
      requestDurationMs: input.progress.requestDurationMs,
    },
    promptCharCount: input.progress.promptCharCount,
    responseCharCount: input.progress.responseCharCount,
  });
  return true;
}

function sanitizedRetryReason(error: string | undefined): string | undefined {
  const normalized = error?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/api[-_\s]?key['":=\s]+[A-Za-z0-9._~+/=-]+/gi, "api key [redacted]")
    .slice(0, 220);
}
