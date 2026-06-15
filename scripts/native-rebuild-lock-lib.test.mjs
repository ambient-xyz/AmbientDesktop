import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  acquireNativeRebuildLock,
  nativeRebuildEnvironmentBlockerFromOutput,
  nativeRebuildLockDir,
} from "./native-rebuild-lock-lib.mjs";

describe("native rebuild lock", () => {
  it("uses an ignored checkout-local lock path by default", () => {
    expect(nativeRebuildLockDir("/repo", {})).toBe("/repo/.ambient/native-rebuild.lock");
  });

  it("serializes concurrent rebuild attempts in the same checkout", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-native-rebuild-lock-test-"));
    const lockDir = join(root, "native-rebuild.lock");
    const first = await acquireNativeRebuildLock({ lockDir, owner: { runtime: "node" } });
    const second = acquireNativeRebuildLock({
      lockDir,
      timeoutMs: 20,
      pollMs: 5,
      sleepMs: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      owner: { runtime: "electron" },
    });

    await expect(second).rejects.toThrow(/Native module rebuild lock is still active/);
    await first.release();

    const afterRelease = await acquireNativeRebuildLock({ lockDir });
    await afterRelease.release();
    await rm(root, { recursive: true, force: true });
  });

  it("classifies lock and corrupted native rebuild output as environmental", () => {
    expect(nativeRebuildEnvironmentBlockerFromOutput("Native module rebuild lock is still active after 20ms")).toMatchObject({
      kind: "native_rebuild_busy",
    });
    expect(nativeRebuildEnvironmentBlockerFromOutput("gyp ERR! ENOENT: no such file or directory, lstat 'node_gyp_bins'")).toMatchObject({
      kind: "native_rebuild_collision",
    });
  });
});
