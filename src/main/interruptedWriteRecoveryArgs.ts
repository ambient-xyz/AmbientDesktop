export interface ParsedSavedWriteArgs {
  path: string;
  content: string;
}

export interface ParsedRecoveryApplyWriteSuffixArgs {
  runId: string;
  toolCallId: string;
  sha256: string;
  suffixPrefix: string;
  suffixChars: number;
  suffixTruncated: boolean;
  suffixOmittedChars?: number;
  suffixSource: "exact" | "preview" | "partial";
}

export function parseSavedWriteArgs(value: string): ParsedSavedWriteArgs | undefined {
  try {
    const parsed = JSON.parse(value);
    const record = objectRecord(parsed);
    const path = typeof record.path === "string" ? record.path : "";
    const content = typeof record.content === "string" ? record.content : undefined;
    if (!path.trim() || content === undefined) return undefined;
    return { path, content };
  } catch {
    return parsePartialSavedWriteArgs(value);
  }
}

export function parseRecoveryApplyWriteSuffixArgs(value: string): ParsedRecoveryApplyWriteSuffixArgs | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return parsePartialRecoveryApplyWriteSuffixArgs(value);
  }
  const record = objectRecord(parsed);
  const runId = stringField(record.runId);
  const toolCallId = stringField(record.toolCallId);
  const sha256 = stringField(record.sha256);
  if (!runId || !toolCallId || !sha256) return undefined;

  if (typeof record.suffix === "string") {
    return {
      runId,
      toolCallId,
      sha256,
      suffixPrefix: record.suffix,
      suffixChars: record.suffix.length,
      suffixTruncated: false,
      suffixSource: "exact",
    };
  }

  const suffixRecord = objectRecord(record.suffix);
  const preview = typeof suffixRecord.preview === "string" ? suffixRecord.preview : undefined;
  if (preview === undefined) return undefined;
  const suffixChars = nonNegativeInteger(suffixRecord.chars) ?? preview.length;
  const omittedChars = nonNegativeInteger(suffixRecord.omittedChars);
  return {
    runId,
    toolCallId,
    sha256,
    suffixPrefix: preview,
    suffixChars,
    suffixTruncated: suffixRecord.truncated === true || suffixChars > preview.length,
    ...(omittedChars !== undefined ? { suffixOmittedChars: omittedChars } : {}),
    suffixSource: "preview",
  };
}

function parsePartialRecoveryApplyWriteSuffixArgs(value: string): ParsedRecoveryApplyWriteSuffixArgs | undefined {
  const runId = parseJsonStringProperty(value, "runId", false);
  const toolCallId = parseJsonStringProperty(value, "toolCallId", false);
  const sha256 = parseJsonStringProperty(value, "sha256", false);
  const suffixPrefix = parseJsonStringProperty(value, "suffix", true);
  if (!runId?.trim() || !toolCallId?.trim() || !sha256?.trim() || suffixPrefix === undefined) return undefined;
  return {
    runId: runId.trim(),
    toolCallId: toolCallId.trim(),
    sha256: sha256.trim(),
    suffixPrefix,
    suffixChars: suffixPrefix.length,
    suffixTruncated: true,
    suffixSource: "partial",
  };
}

export function commonOverlapChars(prefix: string, suffix: string): number {
  const max = Math.min(prefix.length, suffix.length);
  for (let length = max; length > 0; length -= 1) {
    if (prefix.endsWith(suffix.slice(0, length))) return length;
  }
  return 0;
}

function parsePartialSavedWriteArgs(value: string): ParsedSavedWriteArgs | undefined {
  const path = parseJsonStringProperty(value, "path", false);
  const content = parseJsonStringProperty(value, "content", true);
  if (!path?.trim() || content === undefined) return undefined;
  return { path, content };
}

function parseJsonStringProperty(value: string, key: string, allowPartialValue: boolean): string | undefined {
  let index = 0;
  while (index < value.length) {
    const quoteIndex = value.indexOf("\"", index);
    if (quoteIndex === -1) return undefined;
    const parsedKey = parseJsonStringAt(value, quoteIndex, false);
    if (!parsedKey) return undefined;
    index = parsedKey.endIndex;
    const colonIndex = skipJsonWhitespace(value, index);
    if (value[colonIndex] !== ":") continue;
    const valueIndex = skipJsonWhitespace(value, colonIndex + 1);
    if (parsedKey.value !== key) continue;
    if (value[valueIndex] !== "\"") return undefined;
    return parseJsonStringAt(value, valueIndex, allowPartialValue)?.value;
  }
  return undefined;
}

function parseJsonStringAt(
  value: string,
  startIndex: number,
  allowPartial: boolean,
): { value: string; endIndex: number } | undefined {
  if (value[startIndex] !== "\"") return undefined;
  let parsed = "";
  for (let index = startIndex + 1; index < value.length;) {
    const char = value[index];
    if (char === "\"") return { value: parsed, endIndex: index + 1 };
    if (char !== "\\") {
      parsed += char;
      index += 1;
      continue;
    }

    if (index + 1 >= value.length) {
      return allowPartial ? { value: parsed, endIndex: value.length } : undefined;
    }
    const escaped = value[index + 1];
    switch (escaped) {
      case "\"":
      case "\\":
      case "/":
        parsed += escaped;
        index += 2;
        break;
      case "b":
        parsed += "\b";
        index += 2;
        break;
      case "f":
        parsed += "\f";
        index += 2;
        break;
      case "n":
        parsed += "\n";
        index += 2;
        break;
      case "r":
        parsed += "\r";
        index += 2;
        break;
      case "t":
        parsed += "\t";
        index += 2;
        break;
      case "u": {
        const hex = value.slice(index + 2, index + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          return allowPartial ? { value: parsed, endIndex: value.length } : undefined;
        }
        parsed += String.fromCharCode(parseInt(hex, 16));
        index += 6;
        break;
      }
      default:
        if (!allowPartial) return undefined;
        parsed += escaped;
        index += 2;
        break;
    }
  }
  return allowPartial ? { value: parsed, endIndex: value.length } : undefined;
}

function skipJsonWhitespace(value: string, startIndex: number): number {
  let index = startIndex;
  while (index < value.length && /\s/.test(value[index]!)) index += 1;
  return index;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}
