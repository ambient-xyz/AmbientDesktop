import { describe, expect, it } from "vitest";
import { isCdpObserverFailure, shouldUseSqliteObserverFallback } from "./project-board-dogfood-observer.mjs";

describe("project-board dogfood observer fallback", () => {
  it("treats CDP failures as observer failures when SQLite has board state", () => {
    const board = {
      cards: [{ id: "card-1" }],
      synthesisRuns: [{ id: "run-1", status: "running" }],
    };

    expect(
      shouldUseSqliteObserverFallback(new Error("Timed out waiting for CDP Runtime.evaluate."), board, {
        env: {},
      }),
    ).toBe(true);
  });

  it("does not hide product failures or empty snapshots behind SQLite fallback", () => {
    const board = {
      cards: [{ id: "card-1" }],
      synthesisRuns: [{ id: "run-1", status: "running" }],
    };

    expect(shouldUseSqliteObserverFallback(new Error("Initial board synthesis failed: schema error"), board, { env: {} })).toBe(false);
    expect(
      shouldUseSqliteObserverFallback(new Error("Expected visual-proof card execution to create at least one browser screenshot artifact."), board, {
        env: {},
        outputText: "Error sending from webFrameMain: Render frame was disposed before WebFrameMain could be accessed",
      }),
    ).toBe(false);
    expect(shouldUseSqliteObserverFallback(new Error("Timed out waiting for CDP Runtime.evaluate."), { cards: [], synthesisRuns: [] }, { env: {} })).toBe(false);
    expect(
      shouldUseSqliteObserverFallback(new Error("Timed out waiting for CDP Runtime.evaluate."), board, {
        env: { AMBIENT_PROJECT_BOARD_DOGFOOD_SQLITE_FALLBACK_ON_CDP_FAILURE: "0" },
      }),
    ).toBe(false);
  });

  it("classifies known CDP failure messages", () => {
    expect(isCdpObserverFailure("CDP websocket closed.")).toBe(true);
    expect(isCdpObserverFailure(new Error("Timed out waiting for CDP Runtime.evaluate."))).toBe(true);
    expect(isCdpObserverFailure(new Error("No worker proof outcome was observed."))).toBe(false);
  });
});
