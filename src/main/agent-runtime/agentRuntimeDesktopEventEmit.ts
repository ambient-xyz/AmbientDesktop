import type { DesktopEvent } from "../../shared/desktopTypes";
import {
  desktopEventWithWorkspacePath,
  type AgentRuntimeEventWorkspaceScopeStore,
} from "./agentRuntimeEventWorkspaceScope";

const RENDERER_SEND_FAILURE_WARN_INTERVAL_MS = 10_000;
export const MESSAGE_DELTA_COALESCE_INTERVAL_MS = 50;
export const MESSAGE_DELTA_COALESCE_MAX_CHARS = 4096;

type MessageDeltaDesktopEvent = Extract<DesktopEvent, { type: "message-delta" }>;

export interface AgentRuntimeDesktopEventWindow {
  isDestroyed(): boolean;
  webContents: {
    isDestroyed(): boolean;
    isCrashed(): boolean;
    send(channel: "desktop:event", event: DesktopEvent): void;
  };
}

export interface AgentRuntimeDesktopEventEmitDeps {
  getWindow: () => AgentRuntimeDesktopEventWindow | undefined;
  store: AgentRuntimeEventWorkspaceScopeStore;
  lastRendererSendFailureAt: () => number;
  setLastRendererSendFailureAt: (value: number) => void;
  nowMs?: () => number;
  warn?: (message: string) => void;
}

export function emitAgentRuntimeDesktopEvent(event: DesktopEvent, deps: AgentRuntimeDesktopEventEmitDeps): void {
  const window = deps.getWindow();
  if (!window || window.isDestroyed()) return;
  const webContents = window.webContents;
  if (webContents.isDestroyed() || webContents.isCrashed()) return;
  const scopedEvent = desktopEventWithWorkspacePath(event, deps.store);
  try {
    webContents.send("desktop:event", scopedEvent);
  } catch (error) {
    const now = deps.nowMs?.() ?? Date.now();
    if (now - deps.lastRendererSendFailureAt() < RENDERER_SEND_FAILURE_WARN_INTERVAL_MS) return;
    deps.setLastRendererSendFailureAt(now);
    (deps.warn ?? console.warn)(
      `[runtime] Dropped desktop event after renderer became unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export interface AgentRuntimeDesktopEventCoalescerDeps extends AgentRuntimeDesktopEventEmitDeps {
  coalesceIntervalMs?: number;
  maxBufferedDeltaChars?: number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface AgentRuntimeDesktopEventCoalescer {
  emit(event: DesktopEvent): void;
  flush(): void;
}

export function createAgentRuntimeDesktopEventCoalescer(
  deps: AgentRuntimeDesktopEventCoalescerDeps,
): AgentRuntimeDesktopEventCoalescer {
  const pendingDeltas = new Map<string, MessageDeltaDesktopEvent>();
  let flushTimer: unknown;

  const intervalMs = Math.max(0, deps.coalesceIntervalMs ?? MESSAGE_DELTA_COALESCE_INTERVAL_MS);
  const maxBufferedDeltaChars = Math.max(1, deps.maxBufferedDeltaChars ?? MESSAGE_DELTA_COALESCE_MAX_CHARS);
  const setTimer = deps.setTimer ?? ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs));
  const clearTimer = deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  const clearFlushTimer = () => {
    if (!flushTimer) return;
    clearTimer(flushTimer);
    flushTimer = undefined;
  };

  const flush = () => {
    clearFlushTimer();
    const events = [...pendingDeltas.values()];
    pendingDeltas.clear();
    for (const event of events) emitAgentRuntimeDesktopEvent(event, deps);
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimer(flush, intervalMs);
  };

  const queueMessageDelta = (event: MessageDeltaDesktopEvent) => {
    const key = messageDeltaCoalescingKey(event);
    const pending = pendingDeltas.get(key);
    const next = pending
      ? { ...event, delta: pending.delta + event.delta }
      : event;
    pendingDeltas.set(key, next);
    if (next.delta.length >= maxBufferedDeltaChars) {
      flush();
      return;
    }
    scheduleFlush();
  };

  return {
    emit(event) {
      if (event.type === "message-delta") {
        queueMessageDelta(event);
        return;
      }
      if (pendingDeltas.size > 0) flush();
      emitAgentRuntimeDesktopEvent(event, deps);
    },
    flush,
  };
}

function messageDeltaCoalescingKey(event: MessageDeltaDesktopEvent): string {
  return [
    event.workspacePath ?? "",
    event.threadId ?? "",
    event.messageId,
  ].join("\u0000");
}
