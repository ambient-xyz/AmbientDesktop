import { describe, expect, it } from "vitest";
import { isRunStatusRunning, RUN_ABORT_ARM_DELAY_MS } from "./runStatus";
import type { RunStatus } from "./threadTypes";

describe("isRunStatusRunning", () => {
  it.each([
    ["idle", false],
    ["starting", true],
    ["streaming", true],
    ["tool", true],
    ["retrying", true],
    ["compacting", true],
    ["error", false],
  ] satisfies Array<[RunStatus, boolean]>)("maps %s to %s", (status, expected) => {
    expect(isRunStatusRunning(status)).toBe(expected);
  });
});

describe("RUN_ABORT_ARM_DELAY_MS", () => {
  it("keeps the stop button guarded long enough to avoid immediate abort races", () => {
    expect(RUN_ABORT_ARM_DELAY_MS).toBeGreaterThanOrEqual(500);
  });
});
