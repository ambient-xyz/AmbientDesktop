import { describe, expect, it } from "vitest";
import { mergeRunActivityLine, normalizeRunActivityLineText, type RunActivityLineModel } from "./runActivityUiModel";

function line(id: string, text: string, timestamp = Number(id.replace(/\D/g, "")) || 0): RunActivityLineModel {
  return { id, text, kind: "state", timestamp };
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
