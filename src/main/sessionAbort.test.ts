import { afterEach, describe, expect, it, vi } from "vitest";
import { abortSessionRun, type AbortablePiSession } from "./sessionAbort";

function createSession(waitForIdle: () => Promise<void>): AbortablePiSession & {
  abort: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  const abort = vi.fn();
  const dispose = vi.fn();
  return {
    abort,
    dispose,
    agent: {
      abort,
      waitForIdle,
    },
  };
}

describe("abortSessionRun", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts and reports settled when Pi becomes idle within the grace window", async () => {
    vi.useFakeTimers();
    let resolveIdle: () => void = () => {};
    const session = createSession(() => new Promise<void>((resolve) => {
      resolveIdle = resolve;
    }));

    const result = abortSessionRun(session, { graceMs: 50 });
    resolveIdle();

    await expect(result).resolves.toBe("settled");
    expect(session.abort).toHaveBeenCalledTimes(1);
    expect(session.dispose).not.toHaveBeenCalled();
  });

  it("disposes the session when Pi does not become idle within the grace window", async () => {
    vi.useFakeTimers();
    const onStalled = vi.fn();
    const session = createSession(() => new Promise<void>(() => {}));

    const result = abortSessionRun(session, { graceMs: 50, onStalled });
    await vi.advanceTimersByTimeAsync(50);

    await expect(result).resolves.toBe("disposed");
    expect(session.abort).toHaveBeenCalledTimes(1);
    expect(onStalled).toHaveBeenCalledTimes(1);
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });
});
