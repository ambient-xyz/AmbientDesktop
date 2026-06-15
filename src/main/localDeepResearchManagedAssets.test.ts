import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectLocalDeepResearchManagedAssets,
  localDeepResearchModelCachePath,
} from "./localDeepResearchManagedAssets";
import { localDeepResearchProfileById } from "./localDeepResearchModelProfiles";

describe("Local Deep Research managed asset detection", () => {
  it("reports missing model and shared runtime assets in an empty managed root", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-ldr-workspace-"));
    const managedRoot = await mkdtemp(join(tmpdir(), "ambient-ldr-managed-"));
    try {
      const result = await detectLocalDeepResearchManagedAssets(workspacePath, {
        env: { AMBIENT_MANAGED_INSTALL_ROOT: managedRoot } as any,
        platform: "darwin",
        arch: "arm64",
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-local-deep-research-managed-assets-v1",
        managedRoot,
        model: {
          status: "missing",
          profileId: "literesearcher-4b-q4-k-m",
          verification: "not-run",
        },
        runtime: {
          status: "missing",
          source: "shared-llama-cpp-runtime",
          artifactId: "llama-cpp-macos-arm64-metal",
          verification: "binary-missing",
        },
        warnings: [],
      });
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
      await rm(managedRoot, { recursive: true, force: true });
    }
  });

  it("recognizes the selected LiteResearcher profile and shared runtime binary when cached", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-ldr-workspace-"));
    const managedRoot = await mkdtemp(join(tmpdir(), "ambient-ldr-managed-"));
    try {
      const profile = localDeepResearchProfileById("literesearcher-4b-q4-k-m");
      const modelPath = localDeepResearchModelCachePath(managedRoot, profile);
      await mkdir(dirname(modelPath), { recursive: true });
      const handle = await open(modelPath, "w");
      try {
        await handle.truncate(profile.sizeBytes);
      } finally {
        await handle.close();
      }

      const missing = await detectLocalDeepResearchManagedAssets(workspacePath, {
        env: { AMBIENT_MANAGED_INSTALL_ROOT: managedRoot } as any,
        platform: "darwin",
        arch: "arm64",
      });
      const runtimePath = missing.runtime.binaryPath;
      if (!runtimePath) throw new Error("Expected shared runtime path.");
      await mkdir(dirname(runtimePath), { recursive: true });
      await writeFile(runtimePath, "synthetic llama-server", "utf8");

      const result = await detectLocalDeepResearchManagedAssets(workspacePath, {
        env: { AMBIENT_MANAGED_INSTALL_ROOT: managedRoot } as any,
        platform: "darwin",
        arch: "arm64",
      });

      expect(result.model).toMatchObject({
        status: "present",
        verification: "size-matched",
        sizeBytes: profile.sizeBytes,
      });
      expect(result.runtime).toMatchObject({
        status: "present",
        verification: "binary-present",
        binaryPath: runtimePath,
      });
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
      await rm(managedRoot, { recursive: true, force: true });
    }
  });

  it("warns when a cached GGUF exists but does not match the selected profile size", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-ldr-workspace-"));
    const managedRoot = await mkdtemp(join(tmpdir(), "ambient-ldr-managed-"));
    try {
      const profile = localDeepResearchProfileById("literesearcher-4b-q4-k-m");
      const modelPath = localDeepResearchModelCachePath(managedRoot, profile);
      await mkdir(dirname(modelPath), { recursive: true });
      await writeFile(modelPath, "wrong model", "utf8");

      const result = await detectLocalDeepResearchManagedAssets(workspacePath, {
        env: { AMBIENT_MANAGED_INSTALL_ROOT: managedRoot } as any,
        platform: "darwin",
        arch: "arm64",
      });

      expect(result.model).toMatchObject({
        status: "mismatch",
        verification: "size-mismatch",
        sizeBytes: "wrong model".length,
      });
      expect(result.warnings.join("\n")).toContain("expected 2716069088");
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
      await rm(managedRoot, { recursive: true, force: true });
    }
  });
});
