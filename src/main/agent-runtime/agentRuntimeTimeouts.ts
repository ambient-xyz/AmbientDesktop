const DEFAULT_WORKFLOW_RECORDING_REVIEW_STREAM_IDLE_TIMEOUT_MS = 45_000;
const DEFAULT_CHAT_PI_EMPTY_ASSISTANT_STALL_TIMEOUT_MS = 30_000;
const DEFAULT_POST_TOOL_CONTINUATION_IDLE_MS = 15_000;
const DEFAULT_POST_TOOL_FINALIZATION_TICK_MS = 1_000;

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([promise, new Promise<undefined>((resolve) => setTimeout(resolve, ms))]);
}

export function resolveWorkflowRecordingReviewStreamIdleTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.AMBIENT_WORKFLOW_RECORDING_REVIEW_STREAM_IDLE_TIMEOUT_MS;
  if (!raw) return DEFAULT_WORKFLOW_RECORDING_REVIEW_STREAM_IDLE_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_WORKFLOW_RECORDING_REVIEW_STREAM_IDLE_TIMEOUT_MS;
  return Math.max(5_000, Math.floor(parsed));
}

export function resolveChatPiEmptyAssistantStallTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  if (env.AMBIENT_E2E !== "1") return DEFAULT_CHAT_PI_EMPTY_ASSISTANT_STALL_TIMEOUT_MS;
  const raw = env.AMBIENT_CHAT_PI_EMPTY_ASSISTANT_STALL_TIMEOUT_MS;
  if (!raw) return DEFAULT_CHAT_PI_EMPTY_ASSISTANT_STALL_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CHAT_PI_EMPTY_ASSISTANT_STALL_TIMEOUT_MS;
  return Math.max(1_000, Math.floor(parsed));
}

export function resolvePostToolContinuationIdleMs(env: NodeJS.ProcessEnv = process.env): number {
  if (env.AMBIENT_E2E !== "1") return DEFAULT_POST_TOOL_CONTINUATION_IDLE_MS;
  const raw = env.AMBIENT_POST_TOOL_CONTINUATION_IDLE_MS;
  if (!raw) return DEFAULT_POST_TOOL_CONTINUATION_IDLE_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_POST_TOOL_CONTINUATION_IDLE_MS;
  return Math.max(50, Math.floor(parsed));
}

export function resolvePostToolFinalizationTickMs(env: NodeJS.ProcessEnv = process.env): number {
  if (env.AMBIENT_E2E !== "1") return DEFAULT_POST_TOOL_FINALIZATION_TICK_MS;
  const raw = env.AMBIENT_POST_TOOL_FINALIZATION_TICK_MS;
  if (!raw) return DEFAULT_POST_TOOL_FINALIZATION_TICK_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_POST_TOOL_FINALIZATION_TICK_MS;
  return Math.max(25, Math.floor(parsed));
}

export function piStreamStartTimeoutMessage(timeoutMs: number): string {
  return `Ambient/Pi did not start streaming within ${timeoutMs}ms.`;
}

export function piStreamStallTimeoutMessage(timeoutMs: number): string {
  return `Ambient/Pi stream stalled after ${timeoutMs}ms without stream activity.`;
}
