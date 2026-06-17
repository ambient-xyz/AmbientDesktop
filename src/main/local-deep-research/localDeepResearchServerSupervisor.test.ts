import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LocalDeepResearchManagedAssetDetection } from "./localDeepResearchManagedAssets";
import { buildLocalDeepResearchLlamaServerAcquireInput, localDeepResearchServerStateRootPath } from "./localDeepResearchServerSupervisor";
import { buildLocalDeepResearchSetupContract } from "./localDeepResearchSetup";

const gib = 1024 ** 3;

describe("Local Deep Research llama-server supervisor binding", () => {
  it("builds a llama-server acquire contract from ready setup and managed assets", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-supervisor-binding-"));
    try {
      const setup = readySetup();
      const assets = managedAssets({
        managedRoot: join(workspace, ".ambient-managed"),
        modelPath: join(workspace, "models", "LiteResearcher-4B.Q4_K_M.gguf"),
        runtimePath: join(workspace, "runtime", "llama-server"),
      });

      const acquire = buildLocalDeepResearchLlamaServerAcquireInput({
        workspacePath: workspace,
        setup,
        managedAssets: assets,
        idleTimeoutMs: 0,
        startupTimeoutMs: 10_000,
      });

      expect(acquire).toEqual({
        profileId: "literesearcher-4b-q4-k-m",
        runtimeBinaryPath: join(workspace, "runtime", "llama-server"),
        modelPath: join(workspace, "models", "LiteResearcher-4B.Q4_K_M.gguf"),
        stateRootPath: localDeepResearchServerStateRootPath(workspace),
        contextTokens: 32768,
        startupTimeoutMs: 10_000,
        idleTimeoutMs: 0,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects setup, model, and runtime states that are not ready for launch", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-supervisor-binding-"));
    try {
      const ready = readySetup();
      const assets = managedAssets({
        managedRoot: join(workspace, ".ambient-managed"),
        modelPath: join(workspace, "models", "LiteResearcher-4B.Q4_K_M.gguf"),
        runtimePath: join(workspace, "runtime", "llama-server"),
      });

      expect(() => buildLocalDeepResearchLlamaServerAcquireInput({
        workspacePath: workspace,
        setup: buildLocalDeepResearchSetupContract({
          machineFacts: { platform: "darwin", arch: "arm64", memoryBytes: 32 * gib, memoryPressure: "normal" },
        }),
        managedAssets: assets,
      })).toThrow("must be ready");

      expect(() => buildLocalDeepResearchLlamaServerAcquireInput({
        workspacePath: workspace,
        setup: ready,
        managedAssets: {
          ...assets,
          model: { ...assets.model, status: "missing", reason: "model absent" },
        },
      })).toThrow("model absent");

      expect(() => buildLocalDeepResearchLlamaServerAcquireInput({
        workspacePath: workspace,
        setup: ready,
        managedAssets: {
          ...assets,
          runtime: { ...assets.runtime, status: "missing", binaryPath: undefined, reason: "runtime absent" },
        },
      })).toThrow("runtime absent");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

function readySetup() {
  return buildLocalDeepResearchSetupContract({
    modelInstallState: "installed",
    runtimeInstalled: true,
    machineFacts: { platform: "darwin", arch: "arm64", memoryBytes: 32 * gib, memoryPressure: "normal" },
    now: () => new Date("2026-05-28T12:00:00.000Z"),
  });
}

function managedAssets(input: { managedRoot: string; modelPath: string; runtimePath: string }): LocalDeepResearchManagedAssetDetection {
  return {
    schemaVersion: "ambient-local-deep-research-managed-assets-v1",
    managedRoot: input.managedRoot,
    model: {
      status: "present",
      profileId: "literesearcher-4b-q4-k-m",
      filename: "LiteResearcher-4B.Q4_K_M.gguf",
      cachePath: input.modelPath,
      expectedSizeBytes: 2_716_069_088,
      expectedSha256: "ff1ed3bcd8a04cb5dc6f9eea3d89823035fbc099eb2061a0bbf99ec253f605d8",
      sizeBytes: 2_716_069_088,
      verification: "size-matched",
    },
    runtime: {
      status: "present",
      source: "shared-llama-cpp-runtime",
      manifestId: "minicpm-v-llamacpp-runtime-pinned-b9122-2026-05-12",
      artifactId: "llama-cpp-macos-arm64-metal",
      binaryPath: input.runtimePath,
      verification: "binary-present",
    },
    warnings: [],
  };
}
