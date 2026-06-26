export function normalizeCommand(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
