export interface BootstrapRecoveryDecision {
  shouldEnterRecovery: boolean;
  reason?: string;
  message?: string;
}

export interface FetchBootstrapRecoveryPolicyInput {
  feedUrl: string;
  currentVersion: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

interface RecoveryManifest {
  blockedVersions?: unknown;
  forceUpdateBelow?: unknown;
  minimumHealthyVersion?: unknown;
  recoveryMessage?: unknown;
}

export function evaluateBootstrapRecoveryPolicy(manifest: unknown, currentVersion: string): BootstrapRecoveryDecision {
  if (!manifest || typeof manifest !== "object") return { shouldEnterRecovery: false };
  const record = manifest as RecoveryManifest;
  const message = optionalString(record.recoveryMessage);

  const blockedVersions = Array.isArray(record.blockedVersions)
    ? record.blockedVersions.filter((version): version is string => typeof version === "string")
    : [];
  if (blockedVersions.includes(currentVersion)) {
    return {
      shouldEnterRecovery: true,
      reason: `Version ${currentVersion} is blocked by the update feed.`,
      message,
    };
  }

  const forceUpdateBelow = optionalString(record.forceUpdateBelow);
  if (forceUpdateBelow && compareAppVersions(currentVersion, forceUpdateBelow) < 0) {
    return {
      shouldEnterRecovery: true,
      reason: `Version ${currentVersion} is below required update version ${forceUpdateBelow}.`,
      message,
    };
  }

  const minimumHealthyVersion = optionalString(record.minimumHealthyVersion);
  if (minimumHealthyVersion && compareAppVersions(currentVersion, minimumHealthyVersion) < 0) {
    return {
      shouldEnterRecovery: true,
      reason: `Version ${currentVersion} is below minimum healthy version ${minimumHealthyVersion}.`,
      message,
    };
  }

  return { shouldEnterRecovery: false };
}

export async function fetchBootstrapRecoveryPolicy(input: FetchBootstrapRecoveryPolicyInput): Promise<BootstrapRecoveryDecision> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) return { shouldEnterRecovery: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, input.timeoutMs));
  timeout.unref?.();
  try {
    const response = await fetchImpl(`${trimTrailingSlash(input.feedUrl)}/release.json`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return { shouldEnterRecovery: false };
    return evaluateBootstrapRecoveryPolicy(await response.json(), input.currentVersion);
  } finally {
    clearTimeout(timeout);
  }
}

export function compareAppVersions(left: string, right: string): number {
  const leftParsed = parseAppVersion(left);
  const rightParsed = parseAppVersion(right);
  if (!leftParsed || !rightParsed) return left.localeCompare(right);

  for (let index = 0; index < Math.max(leftParsed.parts.length, rightParsed.parts.length); index += 1) {
    const leftPart = leftParsed.parts[index] ?? 0;
    const rightPart = rightParsed.parts[index] ?? 0;
    if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1;
  }

  if (leftParsed.prerelease === rightParsed.prerelease) return 0;
  if (!leftParsed.prerelease) return 1;
  if (!rightParsed.prerelease) return -1;
  return leftParsed.prerelease.localeCompare(rightParsed.prerelease);
}

function parseAppVersion(value: string): { parts: number[]; prerelease: string } | undefined {
  const [core, prerelease = ""] = value.trim().split("-", 2);
  const parts = core.split(".");
  if (parts.length === 0) return undefined;
  const parsed = parts.map((part) => Number(part));
  if (parsed.some((part) => !Number.isInteger(part) || part < 0)) return undefined;
  return { parts: parsed, prerelease };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

