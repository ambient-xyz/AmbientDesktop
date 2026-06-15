const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";
const THINK_PREFIXES = buildThinkTagPrefixes();

export function stripAssistantReasoningTags(text: string): string {
  const filter = createAssistantVisibleTextFilter();
  return filter.push(text) + filter.flush();
}

export function createAssistantVisibleTextFilter(): {
  push(chunk: string): string;
  flush(): string;
} {
  let pending = "";
  let inThinkBlock = false;

  const push = (chunk: string): string => {
    if (!chunk) return "";
    let text = pending + chunk;
    pending = "";
    let output = "";
    let cursor = 0;

    while (cursor < text.length) {
      const lower = text.toLowerCase();

      if (inThinkBlock) {
        const closeIndex = lower.indexOf(THINK_CLOSE, cursor);
        if (closeIndex >= 0) {
          cursor = closeIndex + THINK_CLOSE.length;
          inThinkBlock = false;
          continue;
        }
        pending = possibleThinkCloseSuffix(text.slice(cursor));
        return output;
      }

      const openIndex = lower.indexOf(THINK_OPEN, cursor);
      const closeIndex = lower.indexOf(THINK_CLOSE, cursor);
      const nextIndex = nextTagIndex(openIndex, closeIndex);

      if (nextIndex < 0) {
        const remainder = text.slice(cursor);
        const suffix = possibleThinkTagSuffix(remainder);
        if (suffix) {
          output += remainder.slice(0, remainder.length - suffix.length);
          pending = suffix;
        } else {
          output += remainder;
        }
        return output;
      }

      output += text.slice(cursor, nextIndex);
      if (openIndex === nextIndex) {
        cursor = openIndex + THINK_OPEN.length;
        inThinkBlock = true;
      } else {
        cursor = closeIndex + THINK_CLOSE.length;
      }
    }

    return output;
  };

  const flush = (): string => {
    if (inThinkBlock) {
      pending = "";
      inThinkBlock = false;
      return "";
    }
    const output = pending;
    pending = "";
    return THINK_PREFIXES.has(output.toLowerCase()) ? "" : output;
  };

  return { push, flush };
}

function nextTagIndex(openIndex: number, closeIndex: number): number {
  if (openIndex < 0) return closeIndex;
  if (closeIndex < 0) return openIndex;
  return Math.min(openIndex, closeIndex);
}

function possibleThinkTagSuffix(text: string): string {
  const lower = text.toLowerCase();
  for (let length = Math.min(THINK_CLOSE.length - 1, text.length); length > 0; length -= 1) {
    const suffix = lower.slice(-length);
    if (THINK_PREFIXES.has(suffix)) return text.slice(-length);
  }
  return "";
}

function possibleThinkCloseSuffix(text: string): string {
  const lower = text.toLowerCase();
  for (let length = Math.min(THINK_CLOSE.length - 1, text.length); length > 0; length -= 1) {
    const suffix = lower.slice(-length);
    if (THINK_CLOSE.startsWith(suffix)) return text.slice(-length);
  }
  return "";
}

function buildThinkTagPrefixes(): Set<string> {
  const prefixes = new Set<string>();
  for (const tag of [THINK_OPEN, THINK_CLOSE]) {
    for (let index = 1; index < tag.length; index += 1) {
      prefixes.add(tag.slice(0, index));
    }
  }
  return prefixes;
}
