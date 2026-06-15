import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export const DEFAULT_NATIVE_REBUILD_LOCK_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_NATIVE_REBUILD_LOCK_STALE_MS = 30 * 60 * 1000;

export function nativeRebuildLockDir(cwd = process.cwd(), env = process.env) {
  return resolve(env.AMBIENT_NATIVE_REBUILD_LOCK_DIR || join(cwd, ".ambient", "native-rebuild.lock"));
}

export async function acquireNativeRebuildLock({
  lockDir = nativeRebuildLockDir(),
  timeoutMs = positiveInteger(process.env.AMBIENT_NATIVE_REBUILD_LOCK_TIMEOUT_MS, DEFAULT_NATIVE_REBUILD_LOCK_TIMEOUT_MS),
  staleMs = positiveInteger(process.env.AMBIENT_NATIVE_REBUILD_LOCK_STALE_MS, DEFAULT_NATIVE_REBUILD_LOCK_STALE_MS),
  pollMs = 500,
  owner = {},
  now = () => Date.now(),
  sleepMs = sleep,
  log = () => undefined,
} = {}) {
  const startedAtMs = now();
  let lastLogAtMs = 0;
  await mkdir(dirname(lockDir), { recursive: true });

  for (;;) {
    try {
      await mkdir(lockDir);
      const ownerRecord = {
        schemaVersion: "ambient-native-rebuild-lock-v1",
        pid: process.pid,
        cwd: process.cwd(),
        createdAt: new Date(now()).toISOString(),
        ...owner,
      };
      await writeFile(join(lockDir, "owner.json"), `${JSON.stringify(ownerRecord, null, 2)}\n`, "utf8");
      return {
        lockDir,
        async release() {
          await rm(lockDir, { recursive: true, force: true });
        },
      };
    } catch (error) {
      if (!error || error.code !== "EEXIST") throw error;
      if (await removeStaleLock(lockDir, staleMs, now)) continue;
      const waitedMs = now() - startedAtMs;
      if (waitedMs >= timeoutMs) {
        throw new Error(
          `Native module rebuild lock is still active after ${waitedMs}ms at ${lockDir}. `
          + "Another validation or dev process is rebuilding native dependencies; wait for it to finish or stop the other process before rerunning.",
        );
      }
      if (waitedMs - lastLogAtMs >= 5_000) {
        lastLogAtMs = waitedMs;
        log(`Waiting for native module rebuild lock at ${lockDir} (${waitedMs}ms elapsed).`);
      }
      await sleepMs(Math.min(pollMs, Math.max(1, timeoutMs - waitedMs)));
    }
  }
}

export function nativeRebuildEnvironmentBlockerFromOutput(output) {
  if (/Native module rebuild lock is still active/i.test(output)) {
    return {
      kind: "native_rebuild_busy",
      summary: "another validation or dev process was rebuilding native modules in the same checkout.",
      nextStep: "Wait for the other rebuild to finish, or stop the active dev/test process before rerunning live confidence.",
    };
  }
  if (
    /node_gyp_bins/i.test(output)
    || /prebuild-install[\s\S]*Killed/i.test(output)
    || /node-gyp failed to build your package/i.test(output)
  ) {
    return {
      kind: "native_rebuild_collision",
      summary: "native module rebuild output looked corrupted or interrupted, usually because another process touched node_modules concurrently.",
      nextStep: "Stop concurrent dev/test processes in this checkout, run pnpm run prepare:node-native, then rerun the live confidence gate.",
    };
  }
  return undefined;
}

async function removeStaleLock(lockDir, staleMs, now) {
  const owner = await readLockOwner(lockDir);
  const lockStat = await stat(lockDir).catch(() => undefined);
  const createdAtMs = Date.parse(owner?.createdAt ?? "");
  const ageBasisMs = Number.isFinite(createdAtMs) ? createdAtMs : lockStat?.mtimeMs;
  const lockAgeMs = typeof ageBasisMs === "number" ? now() - ageBasisMs : 0;
  if (lockAgeMs < staleMs) return false;
  if (processIsAlive(owner?.pid)) return false;
  await rm(lockDir, { recursive: true, force: true });
  return true;
}

async function readLockOwner(lockDir) {
  try {
    return JSON.parse(await readFile(join(lockDir, "owner.json"), "utf8"));
  } catch {
    return undefined;
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
