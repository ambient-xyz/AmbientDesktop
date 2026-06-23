import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { AmbientMcpContainerRuntimeLifecycleResult } from "../../shared/pluginTypes";
import { isPathInside } from "../privileged-action/privilegedActionSessionFacade";

const lifecycleLogRoot = "mcp-container-runtime";
const secretLikePattern = /(password|passwd|pwd|token|secret|credential|authorization|auth[_-]?key|api[_-]?key)=([^&\s"\\]+)/gi;
const secretLikeKeyPattern = /^(password|passwd|pwd|token|secret|credential|authorization|auth[_-]?key|api[_-]?key)$/i;

export async function writeContainerRuntimeLifecycleRedactedLog(
  userDataPath: string,
  result: AmbientMcpContainerRuntimeLifecycleResult,
): Promise<string> {
  const root = resolve(userDataPath, lifecycleLogRoot);
  if (!isPathInside(userDataPath, root)) throw new Error("Container runtime lifecycle log root must stay inside user data.");
  await mkdir(root, { recursive: true });
  const logPath = resolve(root, `${safeLogFileStem(`${result.runtime}-${result.action}-${randomUUID()}`)}.json`);
  if (!isPathInside(root, logPath)) throw new Error("Container runtime lifecycle log path must stay inside the lifecycle log root.");
  await writeFile(logPath, `${JSON.stringify(redactedContainerRuntimeLifecycleLogRecord(result), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return logPath;
}

export function redactedContainerRuntimeLifecycleLogRecord(
  result: AmbientMcpContainerRuntimeLifecycleResult,
): Record<string, unknown> {
  return {
    kind: "ambient-container-runtime-lifecycle-log",
    schemaVersion: "ambient-container-runtime-lifecycle-log-v1",
    recordedAt: new Date().toISOString(),
    lifecycleResult: redactLifecycleLogValue(result),
  };
}

function safeLogFileStem(value: string): string {
  const stem = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return stem || "container-runtime-lifecycle";
}

function redactLifecycleLogValue(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (secretLikeKeyPattern.test(key)) return "[REDACTED]";
    return value.replace(secretLikePattern, "$1=[REDACTED]");
  }
  if (Array.isArray(value)) return value.map((item) => redactLifecycleLogValue(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [entryKey, redactLifecycleLogValue(entryValue, entryKey)]));
}
