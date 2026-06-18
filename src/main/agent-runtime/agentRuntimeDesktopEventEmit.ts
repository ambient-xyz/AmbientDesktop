import type { DesktopEvent } from "../../shared/desktopTypes";
import {
  desktopEventWithWorkspacePath,
  type AgentRuntimeEventWorkspaceScopeStore,
} from "./agentRuntimeEventWorkspaceScope";

const RENDERER_SEND_FAILURE_WARN_INTERVAL_MS = 10_000;

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
