import type {
  ToolArgumentProgressPhase,
  ToolArgumentProgressSnapshot,
  ToolArgumentStreamDiagnostics,
  ToolArgumentStreamEventType,
  ToolLongformInputPreview,
} from "../shared/types";

const COMPLETED_ARGUMENT_STREAM_LIMIT = 20;

type ExecutionEventType = "tool_execution_start" | "tool_execution_end";

interface ToolArgumentProgressState {
  toolCallId: string;
  toolName: string;
  argumentStartedMs: number;
  argumentStartedAt: string;
  argumentUpdatedMs: number;
  argumentUpdatedAt: string;
  argumentCompletedMs?: number;
  argumentComplete: boolean;
  inputChars: number;
  lastDeltaChars: number;
  totalDeltaChars: number;
  maxDeltaChars: number;
  observedArgumentChars: number;
  toolcallStartAt?: string;
  firstToolcallDeltaAt?: string;
  latestToolcallDeltaAt?: string;
  toolcallEndAt?: string;
  argumentEventCount: number;
  toolcallDeltaCount: number;
  meaningfulGrowthCount: number;
  lastMeaningfulGrowthMs?: number;
  lastMeaningfulGrowthAt?: string;
  longformInputChars?: number;
  longformInputDeltaChars?: number;
  contentFieldChars?: number;
  contentFieldDeltaChars?: number;
  executionStartedMs?: number;
  executionStartedAt?: string;
  executionCompletedMs?: number;
  executionCompletedAt?: string;
  lastEventType: ToolArgumentStreamEventType | ExecutionEventType;
  phase: ToolArgumentProgressPhase;
}

export class ToolArgumentProgressTracker {
  private readonly active = new Map<string, ToolArgumentProgressState>();
  private readonly completed: ToolArgumentProgressSnapshot[] = [];

  recordArgumentEvent(input: {
    toolCallId: string;
    toolName: string;
    eventType: ToolArgumentStreamEventType;
    inputContent: string;
    longformInputPreview?: ToolLongformInputPreview;
    nowMs?: number;
  }): ToolArgumentProgressSnapshot {
    const nowMs = input.nowMs ?? Date.now();
    const now = iso(nowMs);
    const existing = input.eventType === "toolcall_start" ? undefined : this.active.get(input.toolCallId);
    const state =
      existing ??
      this.createState({
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        eventType: input.eventType,
        nowMs,
      });
    state.toolName = input.toolName || state.toolName;
    const inputChars = input.inputContent.length;
    const deltaChars = Math.max(0, inputChars - state.inputChars);
    state.inputChars = Math.max(state.inputChars, inputChars);
    state.observedArgumentChars = Math.max(state.observedArgumentChars, state.inputChars);
    state.lastDeltaChars = deltaChars;
    state.totalDeltaChars += deltaChars;
    state.maxDeltaChars = Math.max(state.maxDeltaChars, deltaChars);
    state.argumentUpdatedMs = nowMs;
    state.argumentUpdatedAt = now;
    state.argumentEventCount += 1;
    state.lastEventType = input.eventType;
    state.phase = state.executionStartedAt ? "execution" : "argument_stream";

    const longformChars = longformInputChars(input.longformInputPreview);
    let longformDeltaChars = 0;
    if (longformChars !== undefined) {
      longformDeltaChars = Math.max(0, longformChars - (state.longformInputChars ?? 0));
      state.longformInputDeltaChars = longformDeltaChars;
      state.longformInputChars = longformChars;
      state.observedArgumentChars = Math.max(state.observedArgumentChars, longformChars);
    }
    const contentChars = contentFieldChars(input.longformInputPreview);
    let contentDeltaChars = 0;
    if (contentChars !== undefined) {
      contentDeltaChars = Math.max(0, contentChars - (state.contentFieldChars ?? 0));
      state.contentFieldDeltaChars = contentDeltaChars;
      state.contentFieldChars = contentChars;
      state.observedArgumentChars = Math.max(state.observedArgumentChars, contentChars);
    }

    if (input.eventType === "toolcall_start") {
      state.toolcallStartAt = state.toolcallStartAt ?? now;
    } else if (input.eventType === "toolcall_delta") {
      state.firstToolcallDeltaAt = state.firstToolcallDeltaAt ?? now;
      state.latestToolcallDeltaAt = now;
      state.toolcallDeltaCount += 1;
    } else {
      state.toolcallEndAt = now;
      state.argumentCompletedMs = nowMs;
      state.argumentComplete = true;
    }

    if (Math.max(deltaChars, longformDeltaChars, contentDeltaChars) > 0) {
      state.meaningfulGrowthCount += 1;
      state.lastMeaningfulGrowthMs = nowMs;
      state.lastMeaningfulGrowthAt = now;
    }

    this.active.set(input.toolCallId, state);
    return this.snapshot(state, nowMs);
  }

  markExecutionStart(input: {
    toolCallId: string;
    toolName: string;
    inputContent?: string;
    longformInputPreview?: ToolLongformInputPreview;
    nowMs?: number;
  }): ToolArgumentProgressSnapshot {
    const nowMs = input.nowMs ?? Date.now();
    const now = iso(nowMs);
    const state =
      this.active.get(input.toolCallId) ??
      this.createState({
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        eventType: "tool_execution_start",
        nowMs,
      });
    state.toolName = input.toolName || state.toolName;
    let deltaChars = 0;
    if (input.inputContent !== undefined) {
      const inputChars = input.inputContent.length;
      deltaChars = Math.max(0, inputChars - state.inputChars);
      state.inputChars = Math.max(state.inputChars, inputChars);
      state.observedArgumentChars = Math.max(state.observedArgumentChars, state.inputChars);
      state.lastDeltaChars = deltaChars;
      state.totalDeltaChars += deltaChars;
      state.maxDeltaChars = Math.max(state.maxDeltaChars, deltaChars);
    } else {
      state.lastDeltaChars = 0;
    }
    const longformChars = longformInputChars(input.longformInputPreview);
    let longformDeltaChars = 0;
    if (longformChars !== undefined) {
      longformDeltaChars = Math.max(0, longformChars - (state.longformInputChars ?? 0));
      state.longformInputDeltaChars = longformDeltaChars;
      state.longformInputChars = longformChars;
      state.observedArgumentChars = Math.max(state.observedArgumentChars, longformChars);
    }
    const contentChars = contentFieldChars(input.longformInputPreview);
    let contentDeltaChars = 0;
    if (contentChars !== undefined) {
      contentDeltaChars = Math.max(0, contentChars - (state.contentFieldChars ?? 0));
      state.contentFieldDeltaChars = contentDeltaChars;
      state.contentFieldChars = contentChars;
      state.observedArgumentChars = Math.max(state.observedArgumentChars, contentChars);
    }
    if (Math.max(deltaChars, longformDeltaChars, contentDeltaChars) > 0) {
      state.meaningfulGrowthCount += 1;
      state.lastMeaningfulGrowthMs = nowMs;
      state.lastMeaningfulGrowthAt = now;
    }
    state.argumentCompletedMs = state.argumentCompletedMs ?? nowMs;
    state.argumentComplete = true;
    state.executionStartedMs = nowMs;
    state.executionStartedAt = now;
    state.lastEventType = "tool_execution_start";
    state.phase = "execution";
    this.active.set(input.toolCallId, state);
    return this.snapshot(state, nowMs);
  }

  markExecutionEnd(input: { toolCallId: string; toolName: string; nowMs?: number }): ToolArgumentProgressSnapshot {
    const nowMs = input.nowMs ?? Date.now();
    const now = iso(nowMs);
    const state =
      this.active.get(input.toolCallId) ??
      this.createState({
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        eventType: "tool_execution_end",
        nowMs,
      });
    state.toolName = input.toolName || state.toolName;
    state.argumentCompletedMs = state.argumentCompletedMs ?? nowMs;
    state.argumentComplete = true;
    state.executionStartedMs = state.executionStartedMs ?? nowMs;
    state.executionStartedAt = state.executionStartedAt ?? now;
    state.executionCompletedMs = nowMs;
    state.executionCompletedAt = now;
    state.lastDeltaChars = 0;
    state.lastEventType = "tool_execution_end";
    state.phase = "completed";
    const snapshot = this.snapshot(state, nowMs);
    this.active.delete(input.toolCallId);
    this.completed.push(snapshot);
    if (this.completed.length > COMPLETED_ARGUMENT_STREAM_LIMIT) {
      this.completed.splice(0, this.completed.length - COMPLETED_ARGUMENT_STREAM_LIMIT);
    }
    return snapshot;
  }

  diagnostics(nowMs = Date.now()): ToolArgumentStreamDiagnostics {
    return {
      version: 1,
      lastUpdatedAt: iso(nowMs),
      active: [...this.active.values()].map((state) => this.snapshot(state, nowMs)),
      completed: [...this.completed],
    };
  }

  current(toolCallId: string, nowMs = Date.now()): ToolArgumentProgressSnapshot | undefined {
    const state = this.active.get(toolCallId);
    return state ? this.snapshot(state, nowMs) : undefined;
  }

  stalledActiveArgument(timeoutMs: number, nowMs = Date.now()): ToolArgumentProgressSnapshot | undefined {
    const timeout = normalizedTimeoutMs(timeoutMs);
    let stalled:
      | {
          state: ToolArgumentProgressState;
          idleMs: number;
        }
      | undefined;
    for (const state of this.active.values()) {
      if (!isArgumentStreamPending(state)) continue;
      const idleMs = Math.max(0, nowMs - meaningfulGrowthReferenceMs(state));
      if (idleMs < timeout) continue;
      if (!stalled || idleMs > stalled.idleMs) stalled = { state, idleMs };
    }
    return stalled ? this.snapshot(stalled.state, nowMs) : undefined;
  }

  nextActiveArgumentStallDelayMs(timeoutMs: number, nowMs = Date.now()): number | undefined {
    const timeout = normalizedTimeoutMs(timeoutMs);
    let shortestDelay: number | undefined;
    for (const state of this.active.values()) {
      if (!isArgumentStreamPending(state)) continue;
      const idleMs = Math.max(0, nowMs - meaningfulGrowthReferenceMs(state));
      const delay = Math.max(1, timeout - idleMs);
      shortestDelay = shortestDelay === undefined ? delay : Math.min(shortestDelay, delay);
    }
    return shortestDelay;
  }

  private createState(input: {
    toolCallId: string;
    toolName: string;
    eventType: ToolArgumentStreamEventType | ExecutionEventType;
    nowMs: number;
  }): ToolArgumentProgressState {
    const now = iso(input.nowMs);
    return {
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      argumentStartedMs: input.nowMs,
      argumentStartedAt: now,
      argumentUpdatedMs: input.nowMs,
      argumentUpdatedAt: now,
      argumentComplete: false,
      inputChars: 0,
      lastDeltaChars: 0,
      totalDeltaChars: 0,
      maxDeltaChars: 0,
      observedArgumentChars: 0,
      argumentEventCount: 0,
      toolcallDeltaCount: 0,
      meaningfulGrowthCount: 0,
      lastEventType: input.eventType,
      phase: input.eventType === "tool_execution_end" ? "completed" : input.eventType === "tool_execution_start" ? "execution" : "argument_stream",
    };
  }

  private snapshot(state: ToolArgumentProgressState, nowMs: number): ToolArgumentProgressSnapshot {
    const argumentEndMs = state.argumentCompletedMs ?? state.argumentUpdatedMs;
    const elapsedMs = Math.max(0, argumentEndMs - state.argumentStartedMs);
    const executionElapsedMs =
      state.executionStartedMs !== undefined
        ? Math.max(0, (state.executionCompletedMs ?? nowMs) - state.executionStartedMs)
        : undefined;
    return {
      version: 1,
      phase: state.phase,
      eventType: state.lastEventType,
      toolCallId: state.toolCallId,
      toolName: state.toolName,
      uiStatus: toolArgumentUiStatus(state),
      argumentStartedAt: state.argumentStartedAt,
      argumentUpdatedAt: state.argumentUpdatedAt,
      argumentElapsedMs: elapsedMs,
      argumentComplete: state.argumentComplete,
      inputChars: state.inputChars,
      deltaChars: state.lastDeltaChars,
      totalDeltaChars: state.totalDeltaChars,
      maxDeltaChars: state.maxDeltaChars,
      observedArgumentChars: state.observedArgumentChars,
      ...(state.toolcallStartAt ? { toolcallStartAt: state.toolcallStartAt } : {}),
      ...(state.firstToolcallDeltaAt ? { firstToolcallDeltaAt: state.firstToolcallDeltaAt } : {}),
      ...(state.latestToolcallDeltaAt ? { latestToolcallDeltaAt: state.latestToolcallDeltaAt } : {}),
      ...(state.toolcallEndAt ? { toolcallEndAt: state.toolcallEndAt } : {}),
      argumentEventCount: state.argumentEventCount,
      toolcallDeltaCount: state.toolcallDeltaCount,
      meaningfulGrowthCount: state.meaningfulGrowthCount,
      ...(state.lastMeaningfulGrowthAt ? { lastMeaningfulGrowthAt: state.lastMeaningfulGrowthAt } : {}),
      ...(state.lastMeaningfulGrowthMs !== undefined ? { lastMeaningfulGrowthMsAgo: Math.max(0, nowMs - state.lastMeaningfulGrowthMs) } : {}),
      charsPerSecond: charsPerSecond(state.totalDeltaChars, elapsedMs),
      ...(state.longformInputChars !== undefined ? { longformInputChars: state.longformInputChars } : {}),
      ...(state.longformInputDeltaChars !== undefined ? { longformInputDeltaChars: state.longformInputDeltaChars } : {}),
      ...(state.contentFieldChars !== undefined ? { contentFieldChars: state.contentFieldChars } : {}),
      ...(state.contentFieldDeltaChars !== undefined ? { contentFieldDeltaChars: state.contentFieldDeltaChars } : {}),
      ...(state.executionStartedAt ? { executionStartedAt: state.executionStartedAt } : {}),
      ...(state.executionCompletedAt ? { executionCompletedAt: state.executionCompletedAt } : {}),
      ...(executionElapsedMs !== undefined ? { executionElapsedMs } : {}),
    };
  }
}

function isArgumentStreamPending(state: ToolArgumentProgressState): boolean {
  return state.phase === "argument_stream" && !state.argumentComplete;
}

function meaningfulGrowthReferenceMs(state: ToolArgumentProgressState): number {
  return state.lastMeaningfulGrowthMs ?? state.argumentStartedMs;
}

function normalizedTimeoutMs(timeoutMs: number): number {
  return Math.max(1, Math.floor(Number.isFinite(timeoutMs) ? timeoutMs : 1));
}

function toolArgumentUiStatus(state: ToolArgumentProgressState): string {
  if (state.phase === "completed") return `${state.toolName} finished.`;
  const size = state.observedArgumentChars > 0 ? ` (${formatChars(state.observedArgumentChars)} chars)` : "";
  if (state.phase === "execution") return `${state.toolName} is executing${size}.`;
  if (state.argumentComplete) return `${state.toolName} arguments prepared${size}; waiting to run.`;
  if (state.observedArgumentChars >= 10_000) return `${state.toolName} is streaming a large argument (${formatChars(state.observedArgumentChars)} chars).`;
  return `${state.toolName} is preparing arguments${size}.`;
}

function longformInputChars(preview: ToolLongformInputPreview | undefined): number | undefined {
  if (!preview?.items.length) return undefined;
  return preview.items.reduce((sum, item) => sum + Math.max(0, item.chars), 0);
}

function contentFieldChars(preview: ToolLongformInputPreview | undefined): number | undefined {
  return preview?.items.find((item) => item.fieldPath === "content")?.chars;
}

function charsPerSecond(chars: number, elapsedMs: number): number {
  if (chars <= 0 || elapsedMs <= 0) return 0;
  return Math.round((chars / (elapsedMs / 1000)) * 100) / 100;
}

function formatChars(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}
