export type RunActivityLineKind = "state" | "thinking" | "tool" | "heartbeat" | "error";

export type RunActivityLineModel = {
  id: string;
  text: string;
  kind: RunActivityLineKind;
  timestamp: number;
};

export type RunActivityLineMergeOptions = {
  dedupe?: boolean;
  maxLines: number;
};

export function normalizeRunActivityLineText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

export function mergeRunActivityLine<T extends RunActivityLineModel>(
  lines: T[],
  nextLine: T,
  options: RunActivityLineMergeOptions,
): T[] {
  if (options.dedupe !== false && lines.some((line) => line.text === nextLine.text)) return lines;

  const coalesceKey = runActivityLineCoalesceKey(nextLine);
  if (coalesceKey) {
    const existingIndex = findLastIndex(lines, (line) => runActivityLineCoalesceKey(line) === coalesceKey);
    if (existingIndex >= 0) {
      const existing = lines[existingIndex];
      if (!existing) return lines;
      const replacement = { ...nextLine, id: existing.id };
      return lines.map((line, index) => (index === existingIndex ? replacement : line));
    }
  }

  return [...lines, nextLine].slice(-options.maxLines);
}

function runActivityLineCoalesceKey(line: Pick<RunActivityLineModel, "kind" | "text">): string | undefined {
  if (line.kind === "state" && /^Streaming response: \d[\d,]* output chars\b/.test(line.text)) return "streaming-response";
  return undefined;
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index]!)) return index;
  }
  return -1;
}
