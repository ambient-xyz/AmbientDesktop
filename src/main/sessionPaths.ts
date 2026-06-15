import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

function nearestExistingPath(path: string): string | undefined {
  let current = resolve(path);
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return current;
}

function canonicalContainmentPath(path: string): string {
  const resolved = resolve(path);
  const existing = nearestExistingPath(resolved);
  if (!existing) return resolved;
  let realExisting: string;
  try {
    realExisting = realpathSync.native(existing);
  } catch {
    realExisting = resolve(existing);
  }
  if (existing === resolved) return realExisting;
  return resolve(realExisting, relative(existing, resolved));
}

export function isPathInside(parentPath: string, childPath: string): boolean {
  const parent = canonicalContainmentPath(parentPath);
  const child = canonicalContainmentPath(childPath);
  const childRelativePath = relative(parent, child);
  return childRelativePath === "" || (!childRelativePath.startsWith("..") && !isAbsolute(childRelativePath));
}

export function getRestorablePiSessionFile(sessionFile: string | undefined, sessionDir: string): string | undefined {
  if (!sessionFile || !isPathInside(sessionDir, sessionFile) || !existsSync(sessionFile)) return undefined;
  return sessionFile;
}

export function getRestorableRecoverySessionFile(input: {
  threadSessionFile?: string | null;
  recoverySessionFile?: string;
  sessionDir: string;
}): { sessionFile?: string; source?: "thread" | "recovery" } {
  const threadSessionFile = getRestorablePiSessionFile(input.threadSessionFile ?? undefined, input.sessionDir);
  if (threadSessionFile) return { sessionFile: threadSessionFile, source: "thread" };

  const recoverySessionFile = getRestorablePiSessionFile(input.recoverySessionFile, input.sessionDir);
  if (recoverySessionFile) return { sessionFile: recoverySessionFile, source: "recovery" };

  return {};
}
