import { browserToolUpdate } from "./agentRuntimeBrowserToolFormatting";

const BROWSER_TOOL_HEARTBEAT_MS = 30_000;
const DEFAULT_BROWSER_TOOL_TIMEOUT_MS = 90_000;

export class BrowserToolTimeoutError extends Error {
  constructor(
    readonly toolName: string,
    readonly timeoutMs: number,
  ) {
    super(`${toolName} timed out after ${timeoutMs}ms while waiting for browser automation to finish.`);
    this.name = "BrowserToolTimeoutError";
  }
}

export function browserToolTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.AMBIENT_BROWSER_TOOL_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.round(parsed));
  return DEFAULT_BROWSER_TOOL_TIMEOUT_MS;
}

export async function withBrowserToolHeartbeat<T>(
  toolName: string,
  message: string,
  operation: (markActivity: (activityMessage?: string) => void) => Promise<T>,
  onUpdate: ((update: ReturnType<typeof browserToolUpdate>) => void) | undefined,
  options: { signal?: AbortSignal; timeoutMs?: number; heartbeatMs?: number } = {},
): Promise<T> {
  let timer: ReturnType<typeof setInterval> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutMs = options.timeoutMs ?? browserToolTimeoutMs();
  const heartbeatMs = options.heartbeatMs ?? BROWSER_TOOL_HEARTBEAT_MS;
  if (onUpdate) {
    timer = setInterval(() => {
      onUpdate(browserToolUpdate(toolName, message));
    }, heartbeatMs);
  }
  try {
    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      const resolveOnce = (value: T) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener("abort", abort);
        resolve(value);
      };
      const rejectOnce = (error: unknown) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener("abort", abort);
        reject(error);
      };
      const resetTimeout = () => {
        if (timeout) clearTimeout(timeout);
        if (timeoutMs > 0) timeout = setTimeout(() => rejectOnce(new BrowserToolTimeoutError(toolName, timeoutMs)), timeoutMs);
      };
      const markActivity = (activityMessage?: string) => {
        if (settled) return;
        resetTimeout();
        if (activityMessage) onUpdate?.(browserToolUpdate(toolName, activityMessage));
      };
      const abort = () => {
        rejectOnce(options.signal?.reason instanceof Error ? options.signal.reason : new Error(`${toolName} was aborted.`));
      };
      if (options.signal?.aborted) {
        abort();
        return;
      }
      options.signal?.addEventListener("abort", abort, { once: true });
      resetTimeout();
      Promise.resolve()
        .then(() => operation(markActivity))
        .then(resolveOnce, rejectOnce);
    });
  } finally {
    if (timer) clearInterval(timer);
    if (timeout) clearTimeout(timeout);
  }
}
