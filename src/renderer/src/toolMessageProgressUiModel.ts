import type { ToolArgumentProgressSnapshot } from "../../shared/threadTypes";
import { booleanField, formatCompactTaskState, numberField, recordValue, textField } from "./toolMessageMetadataFields";

export type ToolProgressPreviewRow = {
  key: string;
  label: string;
  value: string;
};

export type ToolProgressPreviewData = {
  title: "Progress";
  summary: string;
  rows: ToolProgressPreviewRow[];
};

export type ToolProgressResultDetails = {
  stage?: string;
  statusMessage?: string;
  activityMessage?: string;
  targetUrl?: string;
  elapsedMs?: number;
  outputChars?: number;
  thinkingChars?: number;
  idleElapsedMs?: number;
  idleTimeoutMs?: number;
  timeoutMode?: string;
  waitingOn?: string;
  approvalRequestId?: string;
  approvalTitle?: string;
  heartbeatCount?: number;
  status?: string;
  runtime?: string;
  progressPercent?: number;
  localDeepResearchStatus?: Record<string, unknown>;
};

export function toolProgressPreview(input: {
  toolName: string;
  input: string;
  result: string;
  argumentProgress?: ToolArgumentProgressSnapshot;
  toolResultDetails?: ToolProgressResultDetails;
}): ToolProgressPreviewData | undefined {
  const details = input.toolResultDetails;
  const argumentProgress = input.argumentProgress;
  const localDeepResearchPreview = localDeepResearchProgressPreview(details, argumentProgress, input.toolName);
  if (localDeepResearchPreview) return localDeepResearchPreview;
  const hasLiveProgress =
    (argumentProgress?.phase !== undefined && argumentProgress.phase !== "completed") ||
    details?.stage !== undefined ||
    details?.elapsedMs !== undefined ||
    details?.heartbeatCount !== undefined ||
    details?.progressPercent !== undefined;
  if (!hasLiveProgress) return undefined;

  const rows: ToolProgressPreviewRow[] = [];
  const inputChars = argumentProgress?.observedArgumentChars ?? (input.input ? input.input.length : undefined);
  const outputChars = details?.outputChars;
  const thinkingChars = details?.thinkingChars;
  const elapsedMs = details?.elapsedMs ?? argumentProgress?.executionElapsedMs ?? argumentProgress?.argumentElapsedMs;
  const state = details?.status
    ? formatCompactTaskState(details.status)
    : argumentProgress?.phase
      ? formatCompactTaskState(argumentProgress.phase)
      : undefined;
  const updates =
    details?.heartbeatCount !== undefined
      ? details.heartbeatCount.toLocaleString()
      : argumentProgress?.argumentEventCount !== undefined
        ? argumentProgress.argumentEventCount.toLocaleString()
        : undefined;

  addProgressRow(rows, "state", "State", state);
  addProgressRow(rows, "stage", "Stage", details?.stage ? formatCompactTaskState(details.stage) : undefined);
  addProgressRow(rows, "input", "Input", progressCharsLabel(inputChars));
  addProgressRow(rows, "output", "Output", progressCharsLabel(outputChars));
  addProgressRow(rows, "thinking", "Thinking", progressCharsLabel(thinkingChars));
  addProgressRow(rows, "elapsed", "Elapsed", formatProgressDuration(elapsedMs));
  addProgressRow(rows, "idle", "Idle", formatProgressDuration(details?.idleElapsedMs));
  addProgressRow(rows, "idle-timeout", "Idle timeout", formatProgressDuration(details?.idleTimeoutMs));
  addProgressRow(rows, "timeout-mode", "Timeout", details?.timeoutMode ? formatCompactTaskState(details.timeoutMode) : undefined);
  addProgressRow(rows, "updates", "Updates", updates);
  addProgressRow(rows, "progress", "Progress", details?.progressPercent !== undefined ? `${details.progressPercent}%` : undefined);
  addProgressRow(rows, "waiting-on", "Waiting on", details?.waitingOn ? formatCompactTaskState(details.waitingOn) : undefined);
  addProgressRow(rows, "approval", "Approval", details?.approvalTitle ?? details?.approvalRequestId);
  addProgressRow(rows, "target", "Target", details?.targetUrl);
  if (!rows.length) return undefined;

  return {
    title: "Progress",
    summary:
      [
        state,
        details?.stage ? formatCompactTaskState(details.stage) : undefined,
        formatProgressDuration(details?.elapsedMs ?? argumentProgress?.executionElapsedMs),
        progressCharsLabel(inputChars),
        outputChars !== undefined ? `${outputChars.toLocaleString()} output chars` : undefined,
        thinkingChars !== undefined && thinkingChars > 0 ? `${thinkingChars.toLocaleString()} thinking chars` : undefined,
      ]
        .filter(Boolean)
        .join(" · ") || `${input.toolName} progress`,
    rows,
  };
}

function localDeepResearchProgressPreview(
  details: ToolProgressResultDetails | undefined,
  argumentProgress: ToolArgumentProgressSnapshot | undefined,
  toolName: string,
): ToolProgressPreviewData | undefined {
  const status = recordValue(details?.localDeepResearchStatus);
  if (!status && details?.runtime !== "ambient-local-deep-research") return undefined;
  const stage = textField(status, ["stage"]) ?? details?.stage;
  const state = textField(status, ["state"]) ?? details?.status;
  const message = textField(status, ["activityMessage", "message"]) ?? details?.activityMessage ?? details?.statusMessage;
  const elapsedMs = maxFiniteNumber(
    numberField(status, ["elapsedMs"]),
    details?.elapsedMs,
    argumentProgress?.executionElapsedMs,
    argumentProgress?.argumentElapsedMs,
  );
  const heartbeatCount = numberField(status, ["heartbeatCount"]) ?? details?.heartbeatCount;
  const argumentUpdateCount = argumentProgress?.argumentEventCount;
  const turn = recordValue(status?.turn);
  const retrieval = recordValue(status?.retrieval);
  const memory = recordValue(status?.memory);
  const llamaServer = recordValue(status?.llamaServer);
  const artifacts = recordValue(status?.artifacts);
  const error = textField(status, ["error"]);
  const rows: ToolProgressPreviewRow[] = [];

  const turnValue = localDeepResearchTurnValue(turn);
  const retrievalValue = localDeepResearchRetrievalValue(retrieval);
  const memoryPolicy = localDeepResearchMemoryPolicyValue(memory);
  const serverValue = localDeepResearchServerValue(llamaServer);

  addProgressRow(rows, "state", "State", state ? formatCompactTaskState(state) : undefined);
  addProgressRow(rows, "stage", "Stage", stage ? formatCompactTaskState(stage) : undefined);
  addProgressRow(rows, "message", "Status", message);
  addProgressRow(rows, "turn", "Turn", turnValue);
  addProgressRow(rows, "retrieval", "Retrieval", retrievalValue);
  addProgressRow(rows, "provider", "Provider", textField(retrieval, ["providerLabel"]) ?? textField(retrieval, ["providerId"]));
  addProgressRow(rows, "query", "Query", textField(retrieval, ["query"]));
  addProgressRow(rows, "target", "Target", textField(retrieval, ["url"]) ?? details?.targetUrl);
  addProgressRow(rows, "result", "Result", localDeepResearchRetrievalResultValue(retrieval));
  addProgressRow(rows, "server", "llama.cpp", serverValue);
  addProgressRow(rows, "rss", "Server RSS", formatBytes(numberField(llamaServer, ["rssBytes"])));
  addProgressRow(rows, "memory-policy", "Memory policy", memoryPolicy);
  addProgressRow(rows, "local-models", "Resident models", localDeepResearchResidentModelsValue(memory));
  addProgressRow(rows, "projected-use", "Projected use", localDeepResearchProjectedUseValue(memory));
  addProgressRow(rows, "host-free", "Host free", formatBytes(numberField(memory, ["hostFreeMemoryBytes"])));
  addProgressRow(rows, "swap", "Swap used", formatBytes(numberField(memory, ["swapUsedBytes"])));
  addProgressRow(rows, "compressed", "Compressed", formatBytes(numberField(memory, ["compressedMemoryBytes"])));
  addProgressRow(rows, "elapsed", "Elapsed", formatProgressDuration(elapsedMs));
  addProgressRow(rows, "updates", "Updates", heartbeatCount !== undefined ? heartbeatCount.toLocaleString() : undefined);
  addProgressRow(
    rows,
    "argument-updates",
    "Argument updates",
    heartbeatCount === undefined && argumentUpdateCount !== undefined ? argumentUpdateCount.toLocaleString() : undefined,
  );
  addProgressRow(rows, "artifacts", "Artifacts", localDeepResearchArtifactValue(artifacts));
  addProgressRow(rows, "error", "Error", error);
  if (!rows.length) return undefined;

  return {
    title: "Progress",
    summary:
      [
        message,
        turnValue,
        retrievalValue,
        memoryPolicy && !/\bwithin\b|\bunlimited\b/i.test(memoryPolicy) ? memoryPolicy : undefined,
        formatProgressDuration(elapsedMs),
      ]
        .filter(Boolean)
        .join(" · ") || `${toolName} progress`,
    rows,
  };
}

function localDeepResearchTurnValue(turn: Record<string, unknown> | undefined): string | undefined {
  const current = numberField(turn, ["turn"]);
  const maxTurns = numberField(turn, ["maxTurns"]);
  const toolCalls = numberField(turn, ["toolCalls"]);
  const maxToolCalls = numberField(turn, ["maxToolCalls"]);
  const turnPart = current !== undefined && maxTurns !== undefined ? `${current}/${maxTurns}` : undefined;
  const toolPart = toolCalls !== undefined && maxToolCalls !== undefined ? `${toolCalls}/${maxToolCalls} tools` : undefined;
  return [turnPart, toolPart].filter(Boolean).join(" · ") || undefined;
}

function localDeepResearchRetrievalValue(retrieval: Record<string, unknown> | undefined): string | undefined {
  const role = textField(retrieval, ["role"]);
  const status = textField(retrieval, ["status"]);
  const repeated = numberField(retrieval, ["repeatedVisitCount"]);
  const parts = [
    role ? formatCompactTaskState(role) : undefined,
    status ? formatCompactTaskState(status) : undefined,
    repeated !== undefined && repeated > 1 ? `repeat ${repeated}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

function localDeepResearchRetrievalResultValue(retrieval: Record<string, unknown> | undefined): string | undefined {
  const resultCount = numberField(retrieval, ["resultCount"]);
  const outputChars = numberField(retrieval, ["outputChars"]);
  const durationMs = numberField(retrieval, ["durationMs"]);
  const failureReason = textField(retrieval, ["failureReason"]);
  if (failureReason) return failureReason;
  const parts = [
    resultCount !== undefined ? `${resultCount.toLocaleString()} results` : undefined,
    outputChars !== undefined ? `${outputChars.toLocaleString()} chars` : undefined,
    formatProgressDuration(durationMs),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

function localDeepResearchServerValue(server: Record<string, unknown> | undefined): string | undefined {
  const pid = numberField(server, ["pid"]);
  const endpoint = textField(server, ["endpointUrl"]);
  const healthy = booleanField(server, ["healthy"]);
  const latency = formatProgressDuration(numberField(server, ["healthLatencyMs"]));
  const health = healthy === undefined ? undefined : healthy ? "healthy" : "unhealthy";
  const pidPart = pid !== undefined ? `pid ${pid}` : undefined;
  return [health, latency, pidPart, endpoint].filter(Boolean).join(" · ") || undefined;
}

function localDeepResearchMemoryPolicyValue(memory: Record<string, unknown> | undefined): string | undefined {
  const outcome = textField(memory, ["policyOutcome"]);
  const reason = textField(memory, ["policyReason"]);
  if (!outcome && !reason) return undefined;
  return [outcome ? formatCompactTaskState(outcome) : undefined, reason].filter(Boolean).join(" · ");
}

function localDeepResearchResidentModelsValue(memory: Record<string, unknown> | undefined): string | undefined {
  const count = numberField(memory, ["activeLocalModelCount"]);
  const estimated = formatBytes(numberField(memory, ["activeEstimatedResidentMemoryBytes"]));
  const actual = formatBytes(numberField(memory, ["activeActualResidentMemoryBytes"]));
  if (count === undefined && !estimated && !actual) return undefined;
  return [
    count !== undefined ? count.toLocaleString() : undefined,
    estimated ? `${estimated} estimated` : undefined,
    actual ? `${actual} actual` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function localDeepResearchProjectedUseValue(memory: Record<string, unknown> | undefined): string | undefined {
  const projectedPercent = formatPercent(numberField(memory, ["projectedSystemMemoryUtilization"]));
  const maxPercent = formatPercent(numberField(memory, ["maxProjectedMemoryUtilization"]));
  const projectedFree = formatBytes(numberField(memory, ["projectedFreeMemoryBytes"]));
  const projectedResident = formatBytes(numberField(memory, ["projectedResidentMemoryBytes", "projectedEstimatedResidentMemoryBytes"]));
  const parts = [
    projectedPercent ? `${projectedPercent} projected` : undefined,
    maxPercent ? `${maxPercent} ceiling` : undefined,
    projectedFree ? `${projectedFree} free` : undefined,
    projectedResident ? `${projectedResident} resident` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

function localDeepResearchArtifactValue(artifacts: Record<string, unknown> | undefined): string | undefined {
  const markdownPath = textField(artifacts, ["markdownPath"]);
  const jsonPath = textField(artifacts, ["jsonPath"]);
  return markdownPath ?? jsonPath;
}

function addProgressRow(rows: ToolProgressPreviewRow[], key: string, label: string, value: string | undefined): void {
  if (!value) return;
  rows.push({ key, label, value });
}

function maxFiniteNumber(...values: Array<number | undefined>): number | undefined {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return finite.length ? Math.max(...finite) : undefined;
}

function progressCharsLabel(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  return `${Math.max(0, Math.round(value)).toLocaleString()} chars`;
}

function formatProgressDuration(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const ms = Math.max(0, Math.round(value));
  if (ms < 1000) return `${ms} ms`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) return seconds ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatBytes(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const bytes = Math.max(0, value);
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function formatPercent(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const percent = value <= 1 ? value * 100 : value;
  return `${Math.round(percent)}%`;
}
