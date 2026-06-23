export type RunActivityLineKind = "state" | "thinking" | "tool" | "heartbeat" | "error";

export type RunActivityLineModel = {
  id: string;
  text: string;
  kind: RunActivityLineKind;
  timestamp: number;
};

export type RunActivityLineMergeOptions = {
  coalesceMinIntervalMs?: number;
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
    const existingIndex = findLastCoalesceIndex(lines, coalesceKey);
    if (existingIndex >= 0) {
      const existing = lines[existingIndex];
      if (!existing) return lines;
      if (
        options.coalesceMinIntervalMs &&
        options.coalesceMinIntervalMs > 0 &&
        nextLine.timestamp - existing.timestamp < options.coalesceMinIntervalMs
      ) {
        return lines;
      }
      const replacement = { ...nextLine, id: existing.id };
      return lines.map((line, index) => (index === existingIndex ? replacement : line));
    }
  }

  return [...lines, nextLine].slice(-options.maxLines);
}

function runActivityLineCoalesceKey(line: Pick<RunActivityLineModel, "kind" | "text">): string | undefined {
  if (line.kind === "state" && /^Streaming response: \d[\d,]* output chars\b/.test(line.text)) return "streaming-response";
  if (line.kind === "heartbeat" && /\b\d+s elapsed\.$/.test(line.text)) return "stream-heartbeat";

  const argumentStream = line.text.match(/^([\w.-]+) is streaming a large argument \(\d[\d,]* chars\)\.$/);
  if (line.kind === "tool" && argumentStream) return `tool-argument-stream:${argumentStream[1]}`;

  const toolExecution = line.text.match(/^([\w.-]+) is executing \(\d[\d,]* chars\)\.$/);
  if (line.kind === "tool" && toolExecution) return `tool-execution:${toolExecution[1]}`;

  return undefined;
}

function findLastCoalesceIndex<T extends Pick<RunActivityLineModel, "kind" | "text">>(lines: T[], coalesceKey: string): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    if (runActivityLineCoalesceKey(line) === coalesceKey) return index;
    if (isRunActivityLineCoalesceBoundary(coalesceKey, line)) return -1;
  }
  return -1;
}

function isRunActivityLineCoalesceBoundary(
  coalesceKey: string,
  line: Pick<RunActivityLineModel, "kind" | "text">,
): boolean {
  if (!coalesceKey.startsWith("tool-")) return false;
  if (line.kind !== "tool" && line.kind !== "error") return false;
  return runActivityLineCoalesceKey(line) === undefined;
}
