import { describe, expect, it } from "vitest";
import { latestLiveRunStatus, liveRunSettledAfterCurrentSend } from "./web-research-live-state.mjs";

describe("web research live run state helpers", () => {
  it("waits through retry starts after an earlier idle status", () => {
    expect(liveRunSettledAfterCurrentSend({
      sendResolved: true,
      sawRunStart: true,
      statuses: ["starting", "idle"],
    })).toBe(true);

    expect(liveRunSettledAfterCurrentSend({
      sendResolved: true,
      sawRunStart: true,
      statuses: ["starting", "idle", "starting"],
    })).toBe(false);

    expect(liveRunSettledAfterCurrentSend({
      sendResolved: true,
      sawRunStart: true,
      statuses: ["starting", "idle", "starting", "idle"],
    })).toBe(true);
  });

  it("requires the send promise and at least one started run", () => {
    expect(liveRunSettledAfterCurrentSend({ sendResolved: false, sawRunStart: true, statuses: ["idle"] })).toBe(false);
    expect(liveRunSettledAfterCurrentSend({ sendResolved: true, sawRunStart: false, statuses: ["idle"] })).toBe(false);
    expect(latestLiveRunStatus({ statuses: ["starting", "idle", "starting"] })).toBe("starting");
  });

  it("can require idle to remain stable before treating a live retry chain as complete", () => {
    const live = {
      sendResolved: true,
      sawRunStart: true,
      statuses: ["starting", "tool", "idle"],
      lastStatusAtMs: 1_000,
    };

    expect(liveRunSettledAfterCurrentSend(live, { nowMs: 1_500, idleGraceMs: 2_000 })).toBe(false);
    expect(liveRunSettledAfterCurrentSend(live, { nowMs: 3_000, idleGraceMs: 2_000 })).toBe(true);
  });
});
