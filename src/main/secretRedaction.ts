export const REDACTED_SECRET = "[REDACTED]";

export interface SensitiveTextRedactionResult {
  text: string;
  redacted: boolean;
  replacementCount: number;
}

const registeredSecretCounts = new Map<string, number>();
const minimumRegisteredSecretLength = 4;

const secretKeyPattern = /(?:api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|password|passwd|pwd|secret|token|credential|auth[_-]?key)/i;

export function registerSecretRedaction(value: string | undefined): () => void {
  const secret = normalizeRegisteredSecret(value);
  if (!secret) return () => undefined;
  registeredSecretCounts.set(secret, (registeredSecretCounts.get(secret) ?? 0) + 1);
  return () => unregisterSecretRedaction(secret);
}

export function unregisterSecretRedaction(value: string | undefined): void {
  const secret = normalizeRegisteredSecret(value);
  if (!secret) return;
  const count = registeredSecretCounts.get(secret) ?? 0;
  if (count <= 1) registeredSecretCounts.delete(secret);
  else registeredSecretCounts.set(secret, count - 1);
}

export function clearRegisteredSecretRedactionsForTests(): void {
  registeredSecretCounts.clear();
}

export function redactSensitiveText(value: string): string {
  return redactSensitiveTextWithMetadata(value).text;
}

export function redactSensitiveTextWithMetadata(value: string): SensitiveTextRedactionResult {
  let text = value;
  let replacementCount = 0;

  for (const secret of registeredSecretValues()) {
    if (!text.includes(secret)) continue;
    const next = text.split(secret).join(REDACTED_SECRET);
    replacementCount += textOccurrences(text, secret);
    text = next;
  }

  ({ text, replacementCount } = replaceAndCount(text, replacementCount, /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, `Bearer ${REDACTED_SECRET}`));
  ({ text, replacementCount } = replaceAndCount(
    text,
    replacementCount,
    /\b((?:authorization)\s*[:=]\s*["']?)(?!Bearer\s+\[REDACTED\])([^"',}\s;]{4,})/gi,
    `$1${REDACTED_SECRET}`,
  ));
  ({ text, replacementCount } = replaceAndCount(
    text,
    replacementCount,
    /\b((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|pwd|secret|token|credential|auth[_-]?key)\s*[:=]\s*["']?)([^"',}\s;]{4,})/gi,
    `$1${REDACTED_SECRET}`,
  ));
  ({ text, replacementCount } = replaceAndCount(
    text,
    replacementCount,
    /\b(?:(?:sk|ak|pk|rk|zai|glm)-|ambient-(?!cli-)(?![a-z0-9-]+-v\d+\b))[A-Za-z0-9._-]{12,}\b/gi,
    REDACTED_SECRET,
  ));
  ({ text, replacementCount } = replaceAndCount(text, replacementCount, /\b([A-Za-z0-9._%+-]+:)([A-Za-z0-9._~+/=-]{8,})(@)/g, `$1${REDACTED_SECRET}$3`));

  return { text, redacted: replacementCount > 0, replacementCount };
}

export function redactSensitiveValue(value: unknown, key = ""): unknown {
  if (typeof value === "string") return isSecretKey(key) ? REDACTED_SECRET : redactSensitiveText(value);
  if (Array.isArray(value)) return value.map((item) => redactSensitiveValue(item, key));
  if (!value || typeof value !== "object") return value;
  const parentKeyIsSecret = isSecretKey(key);
  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => {
      const entryKeyIsSecret = isSecretKey(entryKey);
      return [
        entryKey,
        redactSensitiveValue(entryValue, entryKeyIsSecret ? entryKey : parentKeyIsSecret ? key : entryKey),
      ];
    }),
  );
}

export function isSecretKey(key: string): boolean {
  return secretKeyPattern.test(key);
}

function registeredSecretValues(): string[] {
  return [...registeredSecretCounts.keys()].sort((left, right) => right.length - left.length);
}

function normalizeRegisteredSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length < minimumRegisteredSecretLength || trimmed === REDACTED_SECRET) return undefined;
  return trimmed;
}

function replaceAndCount(
  text: string,
  replacementCount: number,
  pattern: RegExp,
  replacement: string,
): { text: string; replacementCount: number } {
  pattern.lastIndex = 0;
  const matches = text.match(pattern);
  if (!matches?.length) return { text, replacementCount };
  return { text: text.replace(pattern, replacement), replacementCount: replacementCount + matches.length };
}

function textOccurrences(text: string, needle: string): number {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(needle, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + needle.length;
  }
}
