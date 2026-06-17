export interface AbortablePiSession {
  agent: {
    abort(): void;
    waitForIdle(): Promise<void>;
  };
  dispose(): void;
}

export type AbortSessionResult = "settled" | "disposed";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function abortSessionRun(
  session: AbortablePiSession,
  options: { graceMs: number; onStalled?: () => void },
): Promise<AbortSessionResult> {
  session.agent.abort();
  const settled = await Promise.race([
    session.agent.waitForIdle().then(() => true),
    wait(options.graceMs).then(() => false),
  ]);

  if (!settled) {
    options.onStalled?.();
    session.dispose();
    return "disposed";
  }

  return "settled";
}
