import { describe, expect, it } from "vitest";
import { mergeRunActivityLine, normalizeRunActivityLineText, type RunActivityLineModel } from "./runActivityUiModel";

function line(
  id: string,
  text: string,
  timestamp = Number(id.replace(/\D/g, "")) || 0,
  kind: RunActivityLineModel["kind"] = "state",
): RunActivityLineModel {
  return { id, text, kind, timestamp };
}

describe("normalizeRunActivityLineText", () => {
  it("normalizes whitespace and bounds activity text", () => {
    const normalized = normalizeRunActivityLineText(`  Streaming\n\n response: ${"x".repeat(300)}  `);
    expect(normalized).toBe(`Streaming response: ${"x".repeat(200)}`);
    expect(normalized.length).toBe(220);
  });
});

describe("mergeRunActivityLine", () => {
  it("updates stream progress in place instead of appending every count", () => {
    const first = line("activity-1", "Streaming response: 14,418 output chars, idle 0 ms / 300s timeout.");
    const second = line("activity-2", "Streaming response: 14,635 output chars, idle 0 ms / 300s timeout.");

    const merged = mergeRunActivityLine([line("activity-0", "Waiting for model output."), first], second, { maxLines: 80 });

    expect(merged).toHaveLength(2);
    expect(merged.at(-1)).toMatchObject({
      id: "activity-1",
      text: "Streaming response: 14,635 output chars, idle 0 ms / 300s timeout.",
    });
  });

  it("throttles coalesced stream progress replacements", () => {
    const existing = [line("activity-1", "Streaming response: 14,418 output chars, idle 0 ms / 300s timeout.", 1_000)];

    expect(
      mergeRunActivityLine(
        existing,
        line("activity-2", "Streaming response: 14,635 output chars, idle 0 ms / 300s timeout.", 1_100),
        { coalesceMinIntervalMs: 250, maxLines: 80 },
      ),
    ).toBe(existing);

    const merged = mergeRunActivityLine(
      existing,
      line("activity-3", "Streaming response: 15,104 output chars, idle 0 ms / 300s timeout.", 1_260),
      { coalesceMinIntervalMs: 250, maxLines: 80 },
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: "activity-1",
      text: "Streaming response: 15,104 output chars, idle 0 ms / 300s timeout.",
      timestamp: 1_260,
    });
  });

  it("coalesces streamed argument and execution progress per tool", () => {
    const first = line("activity-1", "write is streaming a large argument (12,000 chars).", 1_000, "tool");
    const read = line("activity-2", "read is executing (150 chars).", 1_010, "tool");
    const writeExecution = line("activity-3", "write is executing (80 chars).", 1_020, "tool");

    const merged = mergeRunActivityLine(
      [first, read, writeExecution],
      line("activity-4", "write is streaming a large argument (25,000 chars).", 1_300, "tool"),
      { coalesceMinIntervalMs: 250, maxLines: 80 },
    );

    expect(merged.map((item) => item.text)).toEqual([
      "write is streaming a large argument (25,000 chars).",
      "read is executing (150 chars).",
      "write is executing (80 chars).",
    ]);
    expect(merged[0]?.id).toBe("activity-1");
  });

  it("coalesces heartbeat wait lines even when append dedupe is disabled", () => {
    const existing = [line("activity-1", "Waiting for the next Ambient stream event. 4s elapsed.", 1_000, "heartbeat")];
    const merged = mergeRunActivityLine(
      existing,
      line("activity-2", "Ambient is still working on this request. 9s elapsed.", 5_500, "heartbeat"),
      { dedupe: false, maxLines: 80 },
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: "activity-1",
      text: "Ambient is still working on this request. 9s elapsed.",
    });
  });

  it("keeps terminal tool status lines distinct from running progress", () => {
    const merged = mergeRunActivityLine(
      [line("activity-1", "write is executing (80 chars).", 1_000, "tool")],
      line("activity-2", "write completed.", 1_300, "tool"),
      { coalesceMinIntervalMs: 250, maxLines: 80 },
    );

    expect(merged.map((item) => item.text)).toEqual(["write is executing (80 chars).", "write completed."]);
  });

  it("does not rewrite progress from a previous completed tool invocation", () => {
    const merged = mergeRunActivityLine(
      [
        line("activity-1", "write is executing (80 chars).", 1_000, "tool"),
        line("activity-2", "write completed.", 1_300, "tool"),
      ],
      line("activity-3", "write is executing (25 chars).", 1_600, "tool"),
      { coalesceMinIntervalMs: 250, maxLines: 80 },
    );

    expect(merged.map((item) => item.text)).toEqual([
      "write is executing (80 chars).",
      "write completed.",
      "write is executing (25 chars).",
    ]);
  });

  it("still appends distinct non-stream events and caps history", () => {
    const merged = mergeRunActivityLine(
      [line("activity-1", "one"), line("activity-2", "two")],
      line("activity-3", "three"),
      { maxLines: 2 },
    );

    expect(merged.map((item) => item.text)).toEqual(["two", "three"]);
  });

  it("dedupes exact repeated messages unless explicitly disabled", () => {
    const existing = [line("activity-1", "Tool execution is in progress.")];
    expect(mergeRunActivityLine(existing, line("activity-2", "Tool execution is in progress."), { maxLines: 80 })).toBe(existing);

    expect(
      mergeRunActivityLine(existing, line("activity-2", "Tool execution is in progress."), {
        maxLines: 80,
        dedupe: false,
      }),
    ).toHaveLength(2);
  });
});
