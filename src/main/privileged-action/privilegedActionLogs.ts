import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PrivilegedActionNativeResult } from "../../shared/permissionTypes";
import type { ContainerRuntimeManagedInstallResult } from "./privilegedActionContainerRuntimeFacade";
import { credentialPlaceholder, redactPrivilegedOutputPreview } from "./privilegedAction";
import { isPathInside } from "./privilegedActionSessionFacade";

const privilegedActionLogRoot = ".ambient/privileged-actions";
const secretLikePattern = /(password|passwd|pwd|token|secret|credential|authorization|auth[_-]?key|api[_-]?key)=([^&\s"\\]+)/gi;
const secretLikeKeyPattern = /^(password|passwd|pwd|token|secret|credential|authorization|auth[_-]?key|api[_-]?key)$/i;

export async function writePrivilegedActionRedactedLog(workspacePath: string, result: PrivilegedActionNativeResult): Promise<string> {
  const root = resolve(workspacePath, privilegedActionLogRoot);
  if (!isPathInside(workspacePath, root)) throw new Error("Privileged action log root must stay inside the active workspace.");
  await mkdir(root, { recursive: true });
  const logPath = resolve(root, `${safeLogFileStem(result.requestId)}.json`);
  if (!isPathInside(root, logPath)) throw new Error("Privileged action log path must stay inside the privileged action log root.");
  await writeFile(logPath, `${JSON.stringify(redactedPrivilegedActionLogRecord(result), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return logPath;
}

export async function writeContainerRuntimeManagedInstallRedactedLog(
  workspacePath: string,
  result: ContainerRuntimeManagedInstallResult,
): Promise<string> {
  const root = resolve(workspacePath, privilegedActionLogRoot);
  if (!isPathInside(workspacePath, root)) throw new Error("Managed install log root must stay inside the active workspace.");
  await mkdir(root, { recursive: true });
  const requestId = result.requestId ?? "container-runtime-managed-install";
  const logPath = resolve(root, `${safeLogFileStem(requestId)}.json`);
  if (!isPathInside(root, logPath)) throw new Error("Managed install log path must stay inside the privileged action log root.");
  await writeFile(logPath, `${JSON.stringify(redactedContainerRuntimeManagedInstallLogRecord({ ...result, requestId }), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return logPath;
}

export function redactedPrivilegedActionLogRecord(result: PrivilegedActionNativeResult): Record<string, unknown> {
  return {
    kind: "ambient-privileged-action-log",
    schemaVersion: result.schemaVersion,
    requestId: result.requestId,
    recordedAt: new Date().toISOString(),
    nativeResult: redactPrivilegedLogValue(result),
  };
}

export function redactedContainerRuntimeManagedInstallLogRecord(result: ContainerRuntimeManagedInstallResult): Record<string, unknown> {
  return {
    kind: "ambient-container-runtime-managed-install-log",
    schemaVersion: "ambient-container-runtime-managed-install-log-v1",
    requestId: result.requestId,
    recordedAt: new Date().toISOString(),
    managedResult: redactPrivilegedLogValue(result),
  };
}

function safeLogFileStem(value: string): string {
  const stem = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96);
  return stem || "privileged-action";
}

function redactPrivilegedLogValue(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (value.includes(credentialPlaceholder)) return value.replaceAll(credentialPlaceholder, "[AMBIENT_PRIVILEGED_AUTH]");
    if (secretLikeKeyPattern.test(key)) return "[REDACTED]";
    return redactPrivilegedOutputPreview(value).replace(secretLikePattern, "$1=[REDACTED]");
  }
  if (Array.isArray(value)) return value.map((item) => redactPrivilegedLogValue(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [entryKey, redactPrivilegedLogValue(entryValue, entryKey)]));
}
