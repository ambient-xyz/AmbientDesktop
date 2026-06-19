import { LoaderCircle } from "lucide-react";
import { useCallback, useLayoutEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { RunStatus, RuntimeActivity } from "../../shared/threadTypes";
import { formatDelay } from "./AutomationsWorkspace";
import { mergeRunActivityLine, normalizeRunActivityLineText } from "./runActivityUiModel";
import { isScrolledToBottom, scrollToBottom } from "./scrolling";

export type RunActivityLine = {
  id: string;
  text: string;
  kind: "state" | "thinking" | "tool" | "heartbeat" | "error";
  timestamp: number;
};

export type RunRetryStats = {
  attempt: number;
  maxAttempts: number;
  completed: number;
  active: boolean;
  recovered: boolean;
  lastMessage?: string;
  delayMs?: number;
};

export type AppendRunActivityLine = (
  text: string,
  kind?: RunActivityLine["kind"],
  options?: { dedupe?: boolean },
  threadId?: string,
) => void;

export const RUN_ACTIVITY_SCROLL_THRESHOLD = 32;
export const RUN_ACTIVITY_MAX_LINES = 80;
export const RUN_ACTIVITY_STREAM_UPDATE_MIN_MS = 250;

export const RUN_ACTIVITY_PLACEHOLDER: RunActivityLine = {
  id: "activity-placeholder",
  text: "Preparing run context.",
  kind: "state",
  timestamp: 0,
};

export const EMPTY_RUN_ACTIVITY_LINES: RunActivityLine[] = [];

export function createRunActivityLineFromCounter({
  counter,
  kind,
  text,
  timestamp,
}: {
  counter: number;
  kind: RunActivityLine["kind"];
  text: string;
  timestamp: number;
}): RunActivityLine {
  return {
    id: `activity-${timestamp}-${counter}`,
    text,
    kind,
    timestamp,
  };
}

export function shouldAppendRunActivityLine({
  currentLines,
  dedupe,
  normalizedText,
}: {
  currentLines: readonly RunActivityLine[];
  dedupe?: boolean;
  normalizedText: string;
}): boolean {
  if (!normalizedText) return false;
  return dedupe === false || !currentLines.some((line) => line.text === normalizedText);
}

export function runActivityThinkingDeltaUpdate(
  previous: string | undefined,
  delta: string,
): { completedLines: string[]; remainder: string } {
  const next = `${previous ?? ""}${delta}`;
  const lines = next.split(/\r?\n/);
  const completedLines = lines.slice(0, -1);
  let remainder = lines.at(-1) ?? "";
  if (/[.!?]\s*$/.test(remainder) || remainder.length > 140) {
    completedLines.push(remainder);
    remainder = "";
  }
  return { completedLines, remainder };
}

export type RuntimeActivityRenderState = {
  text: string;
  renderedAt: number;
};

export function shouldRenderRuntimeActivityUpdate({
  activity,
  minIntervalMs = RUN_ACTIVITY_STREAM_UPDATE_MIN_MS,
  now,
  previous,
  text,
}: {
  activity: RuntimeActivity;
  minIntervalMs?: number;
  now: number;
  previous: RuntimeActivityRenderState | undefined;
  text: string;
}): boolean {
  if (!previous) return true;
  if (previous.text === text) return false;
  return activity.kind !== "stream" || activity.status !== "running" || now - previous.renderedAt >= minIntervalMs;
}

export function useAppRunActivityControls({
  activeThreadIdRef,
  requestMessageTail,
  runActivityCounterRef,
  runActivityHeartbeatIndexRef,
  runActivityLastEventAtRef,
  runActivityLinesByThreadRef,
  setRetryStatsByThread,
  setRunActivityLinesByThread,
  thinkingDeltaBuffersRef,
}: {
  activeThreadIdRef: MutableRefObject<string | undefined>;
  requestMessageTail: (threadId: string) => void;
  runActivityCounterRef: MutableRefObject<number>;
  runActivityHeartbeatIndexRef: MutableRefObject<number>;
  runActivityLastEventAtRef: MutableRefObject<number>;
  runActivityLinesByThreadRef: MutableRefObject<Record<string, RunActivityLine[]>>;
  setRetryStatsByThread: Dispatch<SetStateAction<Record<string, RunRetryStats>>>;
  setRunActivityLinesByThread: Dispatch<SetStateAction<Record<string, RunActivityLine[]>>>;
  thinkingDeltaBuffersRef: MutableRefObject<Record<string, string>>;
}): {
  appendRunActivityLine: AppendRunActivityLine;
  appendThinkingDeltaLine: (messageId: string, delta: string) => void;
  resetRunActivityLines: (initialText?: string, threadId?: string) => void;
} {
  const createRunActivityLine = useCallback((text: string, kind: RunActivityLine["kind"]): RunActivityLine => {
    runActivityCounterRef.current += 1;
    const timestamp = Date.now();
    return createRunActivityLineFromCounter({
      counter: runActivityCounterRef.current,
      kind,
      text,
      timestamp,
    });
  }, [runActivityCounterRef]);

  const resetRunActivityLines = useCallback((initialText?: string, threadId = activeThreadIdRef.current) => {
    if (!threadId) return;
    thinkingDeltaBuffersRef.current = {};
    runActivityLastEventAtRef.current = Date.now();
    runActivityHeartbeatIndexRef.current = 0;
    requestMessageTail(threadId);
    setRetryStatsByThread((current) => {
      if (!current[threadId]) return current;
      const next = { ...current };
      delete next[threadId];
      return next;
    });
    const nextLines = initialText ? [createRunActivityLine(initialText, "state")] : [];
    runActivityLinesByThreadRef.current = { ...runActivityLinesByThreadRef.current, [threadId]: nextLines };
    setRunActivityLinesByThread((current) => ({ ...current, [threadId]: nextLines }));
  }, [
    activeThreadIdRef,
    createRunActivityLine,
    requestMessageTail,
    runActivityHeartbeatIndexRef,
    runActivityLastEventAtRef,
    runActivityLinesByThreadRef,
    setRetryStatsByThread,
    setRunActivityLinesByThread,
    thinkingDeltaBuffersRef,
  ]);

  const appendRunActivityLine = useCallback((
    text: string,
    kind: RunActivityLine["kind"] = "state",
    options: { dedupe?: boolean } = {},
    threadId = activeThreadIdRef.current,
  ) => {
    if (!threadId) return;
    const normalized = normalizeRunActivityLineText(text);
    const currentLines = runActivityLinesByThreadRef.current[threadId] ?? [];
    if (!shouldAppendRunActivityLine({ currentLines, dedupe: options.dedupe, normalizedText: normalized })) return;
    runActivityLastEventAtRef.current = Date.now();
    setRunActivityLinesByThread((current) => {
      const lines = current[threadId] ?? [];
      const next = mergeRunActivityLine(lines, createRunActivityLine(normalized, kind), {
        dedupe: options.dedupe,
        maxLines: RUN_ACTIVITY_MAX_LINES,
      });
      if (next === lines) return current;
      const nextState = { ...current, [threadId]: next };
      runActivityLinesByThreadRef.current = nextState;
      return nextState;
    });
  }, [
    activeThreadIdRef,
    createRunActivityLine,
    runActivityLastEventAtRef,
    runActivityLinesByThreadRef,
    setRunActivityLinesByThread,
  ]);

  const appendThinkingDeltaLine = useCallback((messageId: string, delta: string) => {
    const { completedLines, remainder } = runActivityThinkingDeltaUpdate(thinkingDeltaBuffersRef.current[messageId], delta);
    for (const line of completedLines) appendRunActivityLine(line, "thinking");
    thinkingDeltaBuffersRef.current[messageId] = remainder;
  }, [appendRunActivityLine, thinkingDeltaBuffersRef]);

  return {
    appendRunActivityLine,
    appendThinkingDeltaLine,
    resetRunActivityLines,
  };
}

export function scheduleScrollToBottom(element: HTMLElement | null, onSettled?: () => void): () => void {
  if (!element) return () => {};
  scrollToBottom(element);
  let timeout: number | undefined;
  const frame = window.requestAnimationFrame(() => {
    scrollToBottom(element);
    timeout = window.setTimeout(() => onSettled?.(), 0);
  });
  return () => {
    window.cancelAnimationFrame(frame);
    if (timeout !== undefined) window.clearTimeout(timeout);
  };
}

export function RunActivityFeed({
  lines,
  status,
  variant = "default",
}: {
  lines: RunActivityLine[];
  status: RunStatus;
  variant?: "default" | "thinking-transient";
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  const shouldTailFeedRef = useRef(true);
  const programmaticFeedScrollRef = useRef(false);
  const visibleLines = lines.length > 0 ? lines : [RUN_ACTIVITY_PLACEHOLDER];
  const latestLineId = visibleLines.at(-1)?.id;
  const scrollRevision = visibleLines.map((line) => `${line.id}:${line.kind}:${line.text}`).join("\n");

  useLayoutEffect(() => {
    if (!shouldTailFeedRef.current) return;
    const element = feedRef.current;
    if (!element) return;
    programmaticFeedScrollRef.current = true;
    const cancel = scheduleScrollToBottom(element, () => {
      programmaticFeedScrollRef.current = false;
      shouldTailFeedRef.current = isScrolledToBottom(element, RUN_ACTIVITY_SCROLL_THRESHOLD);
    });
    return () => {
      cancel();
      programmaticFeedScrollRef.current = false;
    };
  }, [scrollRevision, status]);

  function handleFeedScroll() {
    if (programmaticFeedScrollRef.current) return;
    shouldTailFeedRef.current = isScrolledToBottom(feedRef.current, RUN_ACTIVITY_SCROLL_THRESHOLD);
  }

  const summary = summarizeRunActivity(lines, status, variant);
  return (
    <article className={`message run-activity ${variant}`}>
      <div className="message-role">{variant === "thinking-transient" ? "Thinking" : "Ambient"}</div>
      <div className={`run-activity-card ${variant}`} ref={feedRef} onScroll={handleFeedScroll} aria-live="polite">
        <div className="run-activity-header">
          <div>
            <strong>{summary.title}</strong>
            <span>{summary.subtitle}</span>
          </div>
          <LoaderCircle size={15} className="spin" />
        </div>
        <div className="run-activity-metrics">
          {summary.metrics.map((metric) => (
            <span key={metric}>{metric}</span>
          ))}
        </div>
        <div className="run-activity-lines">
          {visibleLines.map((line) => (
            <div className={`run-activity-line ${line.kind}${line.id === latestLineId ? " active" : ""}`} key={line.id}>
              <span aria-hidden="true" />
              <p>{line.text}</p>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export function summarizeRunActivity(
  lines: RunActivityLine[],
  status: RunStatus,
  variant: "default" | "thinking-transient" = "default",
): { title: string; subtitle: string; metrics: string[] } {
  if (variant === "thinking-transient") {
    const latest = lines.at(-1)?.text;
    return {
      title: "Thinking",
      subtitle: latest || "Receiving Ambient reasoning.",
      metrics: lines.length > 1 ? [`Reasoning ${lines.length}`] : [],
    };
  }
  const title =
    status === "tool"
      ? "Running tools"
      : status === "compacting"
        ? "Compacting context"
        : status === "retrying"
          ? "Retrying"
          : "Working";
  const startedAt = lines[0]?.timestamp;
  const elapsed = startedAt ? formatDelay(Math.max(0, Date.now() - startedAt)) : "0s";
  const toolEvents = lines.filter((line) => line.kind === "tool").length;
  const reasoningEvents = lines.filter((line) => line.kind === "thinking").length;
  const heartbeatEvents = lines.filter((line) => line.kind === "heartbeat").length;
  const errorEvents = lines.filter((line) => line.kind === "error").length;
  const metrics = [
    `Observed ${Math.max(lines.length, 1)} ${lines.length === 1 ? "event" : "events"}`,
    toolEvents > 0 ? `Tools ${toolEvents}` : "",
    reasoningEvents > 0 ? `Reasoning ${reasoningEvents}` : "",
    heartbeatEvents > 0 ? `Waits ${heartbeatEvents}` : "",
    errorEvents > 0 ? `Errors ${errorEvents}` : "",
    `Worked ${elapsed}`,
  ].filter(Boolean);
  const latest = lines.at(-1)?.text;
  return {
    title,
    subtitle: latest || "Waiting for Ambient to begin streaming.",
    metrics,
  };
}

export function runRetryStatsFromActivity(
  current: RunRetryStats | undefined,
  activity: Extract<RuntimeActivity, { kind: "retry" }>,
): RunRetryStats {
  if (activity.status === "starting") {
    const maxAttempts = Math.max(activity.maxAttempts, activity.attempt);
    return {
      attempt: activity.attempt,
      maxAttempts,
      completed: Math.max(current?.completed ?? 0, activity.attempt - 1),
      active: true,
      recovered: current?.recovered ?? false,
      ...(activity.message ? { lastMessage: activity.message } : current?.lastMessage ? { lastMessage: current.lastMessage } : {}),
      ...(activity.delayMs > 0 ? { delayMs: activity.delayMs } : {}),
    };
  }
  const maxAttempts = Math.max(current?.maxAttempts ?? activity.attempt, activity.attempt);
  return {
    attempt: activity.attempt,
    maxAttempts,
    completed: Math.max(current?.completed ?? 0, activity.attempt),
    active: false,
    recovered: activity.success || current?.recovered === true,
    ...(activity.message ? { lastMessage: activity.message } : current?.lastMessage ? { lastMessage: current.lastMessage } : {}),
    ...(current?.delayMs ? { delayMs: current.delayMs } : {}),
  };
}

export function workflowReviewRetryStatusLabel(stats: RunRetryStats | undefined, aggressiveRetries: boolean): string {
  const prefix = aggressiveRetries ? "Aggressive retries" : "Retries";
  if (!stats) return `${prefix} 0 attempted`;
  const count = stats.active ? stats.attempt : stats.completed;
  const suffix = stats.active ? "running" : stats.recovered ? "recovered" : "attempted";
  return `${prefix} ${Math.max(0, count)}/${Math.max(1, stats.maxAttempts)} ${suffix}`;
}

export function formatRuntimeActivity(activity: RuntimeActivity): string {
  if (activity.kind === "browser") return activity.message;
  if (activity.kind === "permission") return activity.message;
  if (activity.kind === "runtime-settings") return activity.message;
  if (activity.kind === "goal") return activity.message;
  if (activity.kind === "tool") return activity.message;
  if (activity.kind === "stream") {
    const output = `${Math.max(0, Math.round(activity.outputChars)).toLocaleString()} output chars`;
    const thinking =
      activity.thinkingChars && activity.thinkingChars > 0
        ? `, ${Math.max(0, Math.round(activity.thinkingChars)).toLocaleString()} thinking chars`
        : "";
    const idle =
      activity.idleElapsedMs !== undefined && activity.idleTimeoutMs !== undefined
        ? `, idle ${formatDelay(activity.idleElapsedMs)} / ${formatDelay(activity.idleTimeoutMs)} timeout`
        : "";
    if (activity.status === "timeout") return activity.message ?? `Ambient/Pi stream timed out after ${formatDelay(activity.idleTimeoutMs ?? 0)}.`;
    return `Streaming response: ${output}${thinking}${idle}.`;
  }

  if (activity.kind === "retry") {
    if (activity.status === "starting") {
      const delay = activity.delayMs > 0 ? ` in ${formatDelay(activity.delayMs)}` : "";
      return `Retrying attempt ${activity.attempt}/${activity.maxAttempts}${delay}: ${activity.message}`;
    }
    if (activity.success) return `Retry attempt ${activity.attempt} recovered.`;
    return `Retry attempt ${activity.attempt} failed${activity.message ? `: ${activity.message}` : "."}`;
  }

  if (activity.status === "starting") {
    return `Compacting context (${activity.reason}).`;
  }
  if (activity.aborted) {
    return `Compaction stopped (${activity.reason}).`;
  }
  if (activity.message) {
    return `Compaction ${activity.willRetry ? "will retry" : "finished"} (${activity.reason}): ${activity.message}`;
  }
  return `Compaction finished (${activity.reason}).`;
}
