import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createRuntimeStreamTraceState } from "./runtimeStreamTraceState";

describe("createRuntimeStreamTraceState", () => {
  it("starts with empty stream trace evidence", () => {
    const state = createRuntimeStreamTraceState();

    expect(state.snapshot()).toEqual({
      recentEvents: [],
      traceReference: undefined,
      piPromptStartLine: undefined,
      piPromptUserLine: undefined,
      promptContentSha256: undefined,
      firstToolArgumentAt: undefined,
      firstToolExecutionStartedAt: undefined,
    });
    expect(state.recentEvents()).toBe(state.snapshot().recentEvents);
  });

  it("records prompt line evidence and content hash", () => {
    const state = createRuntimeStreamTraceState();
    const dir = mkdtempSync(join(tmpdir(), "ambient-runtime-stream-trace-"));
    const sessionFile = join(dir, "session.jsonl");
    writeFileSync(sessionFile, "{\"type\":\"system\"}\n{\"type\":\"assistant\"}\n");

    state.recordPromptStart({ sessionFile, promptContent: "hello Ambient" });

    expect(state.piPromptStartLine()).toBe(2);
    expect(state.piPromptUserLine()).toBe(3);
    expect(state.promptContentSha256()).toBe(createHash("sha256").update("hello Ambient").digest("hex"));
  });

  it("records prompt hash without line evidence when no session file exists", () => {
    const state = createRuntimeStreamTraceState();

    state.recordPromptStart({ promptContent: "hello without a session file" });

    expect(state.piPromptStartLine()).toBeUndefined();
    expect(state.piPromptUserLine()).toBeUndefined();
    expect(state.promptContentSha256()).toBe(
      createHash("sha256").update("hello without a session file").digest("hex"),
    );
  });

  it("preserves first tool timestamps", () => {
    const state = createRuntimeStreamTraceState();

    state.markFirstToolArgumentObserved("2026-06-15T00:00:01.000Z");
    state.markFirstToolArgumentObserved("2026-06-15T00:00:02.000Z");
    state.markFirstToolExecutionObserved("2026-06-15T00:00:03.000Z");
    state.markFirstToolExecutionObserved("2026-06-15T00:00:04.000Z");

    expect(state.firstToolArgumentAt()).toBe("2026-06-15T00:00:01.000Z");
    expect(state.firstToolExecutionStartedAt()).toBe("2026-06-15T00:00:03.000Z");
  });

  it("stores the persisted trace reference", () => {
    const state = createRuntimeStreamTraceState();

    state.setTraceReference({
      path: "test-results/pi-stream-trace.json",
      eventCount: 7,
      recentEventCount: 3,
      reason: "stream_idle",
      recordedAt: "2026-06-15T00:00:05.000Z",
    });

    expect(state.traceReference()).toEqual({
      path: "test-results/pi-stream-trace.json",
      eventCount: 7,
      recentEventCount: 3,
      reason: "stream_idle",
      recordedAt: "2026-06-15T00:00:05.000Z",
    });
  });
});
