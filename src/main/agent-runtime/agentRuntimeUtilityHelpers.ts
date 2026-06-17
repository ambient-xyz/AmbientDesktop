const DEFAULT_LOCAL_TOOL_IDLE_TIMEOUT_MS = 120_000;

export function localToolIdleTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.AMBIENT_LOCAL_TOOL_IDLE_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.round(parsed));
  return DEFAULT_LOCAL_TOOL_IDLE_TIMEOUT_MS;
}

export function unknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
