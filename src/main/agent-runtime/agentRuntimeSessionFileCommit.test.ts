import { describe, expect, it, vi } from "vitest";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { commitAgentRuntimeThreadPiSessionFile } from "./agentRuntimeSessionFileCommit";

describe("commitAgentRuntimeThreadPiSessionFile", () => {
  it("skips empty or unchanged Pi session files", async () => {
    const waitForCommit = vi.fn();
    const updateThreadSettings = vi.fn();
    const emit = vi.fn();

    await expect(commitAgentRuntimeThreadPiSessionFile({
      threadId: "thread-1",
      reason: "session-created",
      emit,
    }, {
      updateThreadSettings,
      waitForCommit,
    })).resolves.toBeUndefined();
    await expect(commitAgentRuntimeThreadPiSessionFile({
      threadId: "thread-1",
      sessionFile: "/tmp/pi-session.jsonl",
      currentPiSessionFile: "/tmp/pi-session.jsonl",
      reason: "run-finished",
      emit,
    }, {
      updateThreadSettings,
      waitForCommit,
    })).resolves.toBeUndefined();

    expect(waitForCommit).not.toHaveBeenCalled();
    expect(updateThreadSettings).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("emits runtime activity when the Pi session file is still pending", async () => {
    const waitForCommit = vi.fn(async () => ({
      committed: false,
      elapsedMs: 500,
      sessionFile: "/tmp/pi-session.jsonl",
      sessionFileExists: false,
    }));
    const updateThreadSettings = vi.fn();
    const emitted: DesktopEvent[] = [];

    const result = await commitAgentRuntimeThreadPiSessionFile({
      threadId: "thread-1",
      sessionFile: "/tmp/pi-session.jsonl",
      currentPiSessionFile: null,
      reason: "provider-continuation",
      emit: (event) => emitted.push(event),
    }, {
      updateThreadSettings,
      waitForCommit,
    });

    expect(result).toBeUndefined();
    expect(waitForCommit).toHaveBeenCalledWith("/tmp/pi-session.jsonl");
    expect(updateThreadSettings).not.toHaveBeenCalled();
    expect(emitted).toMatchObject([{
      type: "runtime-activity",
      activity: {
        threadId: "thread-1",
        kind: "stream",
        status: "running",
        outputChars: 0,
        idleElapsedMs: 500,
        idleTimeoutMs: 500,
        message:
          "Pi session file is still committing; Ambient kept the previous session pointer and will retry after more session activity.",
        diagnostic: {
          reason: "provider-continuation",
          sessionFile: "/tmp/pi-session.jsonl",
          sessionFileCommitted: false,
          sessionFileExists: false,
          waitedMs: 500,
          waitTimeoutMs: 500,
        },
      },
    }]);
  });

  it("commits the Pi session file pointer and emits the updated thread", async () => {
    const thread = {
      id: "thread-1",
      piSessionFile: "/tmp/pi-session.jsonl",
    } as ThreadSummary;
    const waitForCommit = vi.fn(async () => ({
      committed: true,
      elapsedMs: 25,
      sessionFile: "/tmp/pi-session.jsonl",
      sessionFileExists: true,
    }));
    const updateThreadSettings = vi.fn(() => thread);
    const emitted: DesktopEvent[] = [];

    const result = await commitAgentRuntimeThreadPiSessionFile({
      threadId: "thread-1",
      sessionFile: "/tmp/pi-session.jsonl",
      reason: "compaction-finished",
      emit: (event) => emitted.push(event),
    }, {
      updateThreadSettings,
      waitForCommit,
    });

    expect(result).toBe(thread);
    expect(updateThreadSettings).toHaveBeenCalledWith("thread-1", {
      piSessionFile: "/tmp/pi-session.jsonl",
    });
    expect(emitted).toEqual([{
      type: "thread-updated",
      thread,
    }]);
  });
});
