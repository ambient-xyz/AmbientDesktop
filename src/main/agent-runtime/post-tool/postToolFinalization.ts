export type PromptCompletion = "prompt" | "post-tool-idle";

export interface PostToolFinalizationTracker {
  markEvent(): void;
  markToolStart(toolCallId: string): void;
  markToolEnd(toolCallId: string): void;
  markAgentEnd(): void;
  wait(): Promise<PromptCompletion>;
  stop(): void;
}

interface PostToolFinalizationTrackerOptions {
  idleMs: number;
  tickMs?: number;
  now?: () => number;
}

export function createPostToolFinalizationTracker({
  idleMs,
  tickMs = 1_000,
  now = Date.now,
}: PostToolFinalizationTrackerOptions): PostToolFinalizationTracker {
  let lastEventAt = now();
  let completedToolCount = 0;
  let agentEnded = false;
  let stopped = false;
  const pendingToolCallIds = new Set<string>();
  const completedToolCallIds = new Set<string>();
  let interval: ReturnType<typeof setTimeout> | undefined;
  let resolveWait: ((completion: PromptCompletion) => void) | undefined;

  const maybeResolve = (): void => {
    if (stopped || agentEnded || completedToolCount === 0 || pendingToolCallIds.size > 0) return;
    if (now() - lastEventAt < idleMs) return;
    stopped = true;
    if (interval) clearTimeout(interval);
    resolveWait?.("post-tool-idle");
  };

  return {
    markEvent() {
      lastEventAt = now();
    },
    markToolStart(toolCallId: string) {
      if (toolCallId) pendingToolCallIds.add(toolCallId);
      lastEventAt = now();
    },
    markToolEnd(toolCallId: string) {
      if (toolCallId && completedToolCallIds.has(toolCallId)) return;
      if (toolCallId) pendingToolCallIds.delete(toolCallId);
      if (toolCallId) completedToolCallIds.add(toolCallId);
      completedToolCount += 1;
      lastEventAt = now();
    },
    markAgentEnd() {
      agentEnded = true;
      lastEventAt = now();
    },
    wait() {
      return new Promise<PromptCompletion>((resolve) => {
        resolveWait = resolve;
        interval = setTimeout(function tick() {
          maybeResolve();
          if (!stopped) interval = setTimeout(tick, tickMs);
        }, tickMs);
      });
    },
    stop() {
      stopped = true;
      if (interval) clearTimeout(interval);
    },
  };
}
