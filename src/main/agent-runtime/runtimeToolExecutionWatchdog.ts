import type { DesktopEvent } from "../../shared/types";
import {
  runtimeToolExecutionRunningActivity,
  runtimeToolExecutionTimeoutActivity,
} from "../agentRuntimeToolExecutionActivity";
import { agentRuntimeToolExecutionIdleTimeoutMsForTool } from "../agentRuntimeToolTimeouts";

export interface RuntimeActiveToolExecution {
  toolCallId: string;
  toolName: string;
  startedAt: number;
  lastActivityAt: number;
  idleTimeoutMs: number;
}

export interface RuntimeToolExecutionWatchdogInput {
  threadId: string;
  defaultIdleTimeoutMs: number;
  isRunStoreActive: () => boolean;
  isPermissionWaiting: () => boolean;
  pauseStreamWatchdog: () => void;
  resumeStreamWatchdog: () => void;
  abortSessionRun: () => void;
  signalToolExecutionTimeout: () => void;
  emitRunEvent: (event: DesktopEvent) => void;
  now?: () => number;
  setTimeout?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void;
}

export interface RuntimeToolExecutionWatchdog {
  active: () => RuntimeActiveToolExecution | undefined;
  count: () => number;
  isActive: () => boolean;
  isTimedOut: () => boolean;
  timeoutMessage: () => string | undefined;
  clear: () => void;
  schedule: () => void;
  begin: (toolCallId: string, toolName: string) => void;
  mark: (toolCallId: string, toolName: string) => void;
  finish: (toolCallId: string) => void;
}

export function createRuntimeToolExecutionWatchdog(
  input: RuntimeToolExecutionWatchdogInput,
): RuntimeToolExecutionWatchdog {
  const now = input.now ?? Date.now;
  const scheduleTimeout = input.setTimeout ?? setTimeout;
  const clearScheduledTimeout = input.clearTimeout ?? clearTimeout;
  let activeToolExecutionCount = 0;
  let activeToolExecution: RuntimeActiveToolExecution | undefined;
  let toolExecutionIdleTimer: ReturnType<typeof setTimeout> | undefined;
  let toolExecutionTimedOut = false;
  let toolExecutionTimeoutMessage: string | undefined;

  const clear = () => {
    if (toolExecutionIdleTimer) clearScheduledTimeout(toolExecutionIdleTimer);
    toolExecutionIdleTimer = undefined;
  };

  const schedule = () => {
    clear();
    if (!activeToolExecution || activeToolExecutionCount <= 0 || input.isPermissionWaiting()) return;
    const idleTimeoutMs = activeToolExecution.idleTimeoutMs;
    toolExecutionIdleTimer = scheduleTimeout(() => {
      toolExecutionIdleTimer = undefined;
      if (input.isPermissionWaiting()) {
        schedule();
        return;
      }
      if (!input.isRunStoreActive() || toolExecutionTimedOut || !activeToolExecution || activeToolExecutionCount <= 0) return;
      toolExecutionTimedOut = true;
      const idleElapsedMs = now() - activeToolExecution.lastActivityAt;
      const toolTimeoutActivity = runtimeToolExecutionTimeoutActivity({
        threadId: input.threadId,
        toolCallId: activeToolExecution.toolCallId,
        toolName: activeToolExecution.toolName,
        idleElapsedMs,
        idleTimeoutMs: activeToolExecution.idleTimeoutMs,
        startedAtMs: activeToolExecution.startedAt,
        lastActivityAtMs: activeToolExecution.lastActivityAt,
      });
      toolExecutionTimeoutMessage = toolTimeoutActivity.message;
      input.emitRunEvent({
        type: "runtime-activity",
        activity: toolTimeoutActivity,
      });
      input.abortSessionRun();
      input.signalToolExecutionTimeout();
    }, idleTimeoutMs);
  };

  const begin = (toolCallId: string, toolName: string) => {
    const currentMs = now();
    const idleTimeoutMs = agentRuntimeToolExecutionIdleTimeoutMsForTool(input.defaultIdleTimeoutMs, toolName);
    activeToolExecutionCount += 1;
    activeToolExecution = { toolCallId, toolName, startedAt: currentMs, lastActivityAt: currentMs, idleTimeoutMs };
    input.pauseStreamWatchdog();
    schedule();
    input.emitRunEvent({
      type: "runtime-activity",
      activity: runtimeToolExecutionRunningActivity({
        threadId: input.threadId,
        toolName,
        idleTimeoutMs,
      }),
    });
  };

  const mark = (toolCallId: string, toolName: string) => {
    if (activeToolExecutionCount <= 0) return;
    const currentMs = now();
    const idleTimeoutMs = activeToolExecution?.idleTimeoutMs ??
      agentRuntimeToolExecutionIdleTimeoutMsForTool(input.defaultIdleTimeoutMs, toolName);
    activeToolExecution = {
      toolCallId,
      toolName,
      startedAt: activeToolExecution?.startedAt ?? currentMs,
      lastActivityAt: currentMs,
      idleTimeoutMs,
    };
    schedule();
  };

  const finish = (toolCallId: string) => {
    if (activeToolExecutionCount <= 0) return;
    activeToolExecutionCount = Math.max(0, activeToolExecutionCount - 1);
    if (activeToolExecution?.toolCallId === toolCallId || activeToolExecutionCount === 0) {
      activeToolExecution = undefined;
    }
    if (activeToolExecutionCount === 0) {
      clear();
      if (!input.isPermissionWaiting()) input.resumeStreamWatchdog();
    } else {
      schedule();
    }
  };

  return {
    active: () => activeToolExecution,
    count: () => activeToolExecutionCount,
    isActive: () => activeToolExecutionCount > 0,
    isTimedOut: () => toolExecutionTimedOut,
    timeoutMessage: () => toolExecutionTimeoutMessage,
    clear,
    schedule,
    begin,
    mark,
    finish,
  };
}
