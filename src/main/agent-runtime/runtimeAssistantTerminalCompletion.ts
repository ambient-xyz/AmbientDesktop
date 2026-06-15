export type RuntimeAssistantTerminalCompletionValue = "assistant-terminal";

export interface RuntimeAssistantTerminalCompletionInput {
  defaultGraceMs: number;
  hasAssistantText: () => boolean;
  setTimeout?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void;
}

export interface RuntimeAssistantTerminalCompletion {
  completion: Promise<RuntimeAssistantTerminalCompletionValue>;
  graceMs: () => number;
  isArmed: () => boolean;
  clear: () => void;
  schedule: (graceMs?: number) => void;
  resetOnActivity: () => void;
}

export function createRuntimeAssistantTerminalCompletion(
  input: RuntimeAssistantTerminalCompletionInput,
): RuntimeAssistantTerminalCompletion {
  const scheduleTimeout = input.setTimeout ?? setTimeout;
  const clearScheduledTimeout = input.clearTimeout ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let graceMs = input.defaultGraceMs;
  let resolveCompletion: ((completion: RuntimeAssistantTerminalCompletionValue) => void) | undefined;
  const completion = new Promise<RuntimeAssistantTerminalCompletionValue>((resolve) => {
    resolveCompletion = resolve;
  });

  const clear = () => {
    if (timer) clearScheduledTimeout(timer);
    timer = undefined;
  };

  const schedule = (nextGraceMs = input.defaultGraceMs) => {
    if (!input.hasAssistantText()) return;
    clear();
    graceMs = nextGraceMs;
    timer = scheduleTimeout(() => {
      timer = undefined;
      resolveCompletion?.("assistant-terminal");
    }, nextGraceMs);
  };

  const resetOnActivity = () => {
    if (!timer) return;
    schedule(graceMs);
  };

  return {
    completion,
    graceMs: () => graceMs,
    isArmed: () => Boolean(timer),
    clear,
    schedule,
    resetOnActivity,
  };
}
