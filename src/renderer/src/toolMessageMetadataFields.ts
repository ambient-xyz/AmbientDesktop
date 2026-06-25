export function pathField(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function textField(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

export function nonEmptyTextField(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  const value = textField(record, keys)?.trim();
  return value ? value : undefined;
}

export function previewTextField(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
    const previewRecord = recordValue(value);
    const preview = textField(previewRecord, ["preview"]);
    if (preview !== undefined) return preview;
  }
  return undefined;
}

export function numberField(record: Record<string, unknown> | undefined, keys: string[]): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

export function booleanField(record: Record<string, unknown> | undefined, keys: string[]): boolean | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

export function stringArrayField(record: Record<string, unknown> | undefined, keys: string[]): string[] | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
    if (items.length) return items;
  }
  return undefined;
}

export function parseDelimitedNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function formatCompactTaskState(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
