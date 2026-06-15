import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { LocalDeepResearchManagedAssetDetection } from "../shared/types";
import { buildLocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import { runLocalDeepResearchRealAssetSmoke } from "./localDeepResearchSmoke";
import type { LocalLlamaServerState } from "./localLlamaServerSupervisor";

const gib = 1024 ** 3;

describe("Local Deep Research real-asset smoke", () => {
  it("records needs-install evidence before managed assets exist", async () => {
    const fixture = await smokeFixture({ installed: false });
    try {
      const acquire = vi.fn();
      const result = await runLocalDeepResearchRealAssetSmoke({
        workspacePath: fixture.workspace,
        setup: fixture.setup,
        managedAssets: fixture.assets,
        supervisor: { acquire },
        now: () => new Date("2026-05-28T14:00:00.000Z"),
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-local-deep-research-smoke-v1",
        checkedAt: "2026-05-28T14:00:00.000Z",
        status: "needs-install",
        artifactPath: ".ambient/local-deep-research/smoke/2026-05-28T14-00-00-000Z-needs-install.json",
        markdownPath: ".ambient/local-deep-research/smoke/2026-05-28T14-00-00-000Z-needs-install.md",
      });
      expect(result.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "model-cache", status: "warning" }),
        expect.objectContaining({ id: "runtime-cache", status: "warning" }),
      ]));
      expect(acquire).not.toHaveBeenCalled();
      await expect(readFile(join(fixture.workspace, result.artifactPath), "utf8")).resolves.toContain("\"status\": \"needs-install\"");
    } finally {
      await fixture.cleanup();
    }
  });

  it("launches the managed server boundary, calls chat, releases the lease, and writes artifacts", async () => {
    const fixture = await smokeFixture({ installed: true });
    try {
      let released = false;
      const state = llamaState(fixture);
      const acquire = vi.fn(async () => ({
        leaseId: "lease-smoke",
        state,
        release: async () => {
          released = true;
        },
      }));
      const chatClientFactory = vi.fn(() => ({
        complete: vi.fn(async () => ({ content: "LOCAL_DEEP_RESEARCH_SMOKE_OK from synthetic llama." })),
      }));

      const result = await runLocalDeepResearchRealAssetSmoke({
        workspacePath: fixture.workspace,
        setup: fixture.setup,
        managedAssets: fixture.assets,
        supervisor: { acquire },
        chatClientFactory,
        now: () => new Date("2026-05-28T14:05:00.000Z"),
      });

      expect(acquire).toHaveBeenCalledWith(expect.objectContaining({
        profileId: "literesearcher-4b-q4-k-m",
        runtimeBinaryPath: fixture.runtimePath,
        modelPath: fixture.modelPath,
        contextTokens: 32768,
        idleTimeoutMs: 0,
      }));
      expect(chatClientFactory).toHaveBeenCalledWith(state.endpointUrl);
      expect(released).toBe(true);
      expect(result).toMatchObject({
        status: "passed",
        artifactPath: ".ambient/local-deep-research/smoke/2026-05-28T14-05-00-000Z-passed.json",
        chat: {
          response: "LOCAL_DEEP_RESEARCH_SMOKE_OK from synthetic llama.",
        },
        release: {
          status: "stopped",
        },
      });
      await expect(readFile(join(fixture.workspace, result.markdownPath), "utf8")).resolves.toContain("LOCAL_DEEP_RESEARCH_SMOKE_OK");
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks before acquiring a server when the local model memory ceiling refuses launch", async () => {
    const fixture = await smokeFixture({ installed: true });
    try {
      const acquire = vi.fn();
      const result = await runLocalDeepResearchRealAssetSmoke({
        workspacePath: fixture.workspace,
        setup: setupWithResourceOutcome(fixture.setup, "refuse"),
        managedAssets: fixture.assets,
        supervisor: { acquire },
        now: () => new Date("2026-05-28T14:07:00.000Z"),
      });

      expect(result.status).toBe("blocked");
      expect(acquire).not.toHaveBeenCalled();
      expect(result.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "local-model-resource-policy",
          status: "blocked",
          detail: "Projected local-model resident memory exceeds the configured ceiling.",
        }),
      ]));
    } finally {
      await fixture.cleanup();
    }
  });

  it("fails when the managed server response omits the smoke sentinel token", async () => {
    const fixture = await smokeFixture({ installed: true });
    try {
      const state = llamaState(fixture);
      const result = await runLocalDeepResearchRealAssetSmoke({
        workspacePath: fixture.workspace,
        setup: fixture.setup,
        managedAssets: fixture.assets,
        supervisor: {
          acquire: async () => ({
            leaseId: "lease-smoke",
            state,
            release: async () => undefined,
          }),
        },
        chatClientFactory: () => ({
          complete: vi.fn(async () => ({ content: "local server responded without the sentinel" })),
        }),
        now: () => new Date("2026-05-28T14:06:00.000Z"),
      });

      expect(result.status).toBe("failed");
      expect(result.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "llama-chat",
          status: "failed",
          detail: expect.stringContaining("did not contain the expected smoke sentinel token"),
        }),
      ]));
    } finally {
      await fixture.cleanup();
    }
  });
});

async function smokeFixture(input: { installed: boolean }) {
  const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-smoke-"));
  const runtimePath = join(workspace, ".ambient-managed", "runtime", "llama-server");
  const modelPath = join(workspace, ".ambient-managed", "models", "LiteResearcher-4B.Q4_K_M.gguf");
  if (input.installed) {
    await mkdir(join(workspace, ".ambient-managed", "runtime"), { recursive: true });
    await mkdir(join(workspace, ".ambient-managed", "models"), { recursive: true });
    await writeFile(runtimePath, "synthetic runtime", "utf8");
    await writeFile(modelPath, "synthetic model", "utf8");
  }
  const setup = buildLocalDeepResearchSetupContract({
    modelInstallState: input.installed ? "installed" : "missing",
    runtimeInstalled: input.installed,
    machineFacts: { platform: "darwin", arch: "arm64", memoryBytes: 32 * gib, memoryPressure: "normal" },
    now: () => new Date("2026-05-28T12:00:00.000Z"),
  });
  const assets: LocalDeepResearchManagedAssetDetection = {
    schemaVersion: "ambient-local-deep-research-managed-assets-v1",
    managedRoot: join(workspace, ".ambient-managed"),
    model: {
      status: input.installed ? "present" : "missing",
      profileId: "literesearcher-4b-q4-k-m",
      filename: "LiteResearcher-4B.Q4_K_M.gguf",
      cachePath: modelPath,
      expectedSizeBytes: 2_716_069_088,
      expectedSha256: "ff1ed3bcd8a04cb5dc6f9eea3d89823035fbc099eb2061a0bbf99ec253f605d8",
      ...(input.installed ? { sizeBytes: 2_716_069_088 } : {}),
      verification: input.installed ? "size-matched" : "not-run",
      ...(input.installed ? {} : { reason: "Selected LiteResearcher GGUF is not present in the Ambient-managed model cache." }),
    },
    runtime: {
      status: input.installed ? "present" : "missing",
      source: "shared-llama-cpp-runtime",
      manifestId: "minicpm-v-llamacpp-runtime-pinned-b9122-2026-05-12",
      artifactId: "llama-cpp-macos-arm64-metal",
      binaryPath: runtimePath,
      verification: input.installed ? "binary-present" : "binary-missing",
      ...(input.installed ? {} : { reason: "Shared llama.cpp runtime binary is not present in the Ambient-managed runtime cache." }),
    },
    warnings: [],
  };
  return {
    workspace,
    setup,
    assets,
    runtimePath,
    modelPath,
    cleanup: async () => {
      await rm(workspace, { recursive: true, force: true });
    },
  };
}

function setupWithResourceOutcome(
  setup: ReturnType<typeof buildLocalDeepResearchSetupContract>,
  outcome: "refuse" | "ask-to-exceed" | "unload-idle",
): ReturnType<typeof buildLocalDeepResearchSetupContract> {
  return {
    ...setup,
    localModelResources: {
      ...setup.localModelResources,
      settings: {
        schemaVersion: "ambient-local-model-resource-settings-v1",
        maxResidentMemoryBytes: 8 * gib,
        memoryLimitBehavior: outcome,
      },
      activeEstimatedResidentMemoryBytes: 11 * gib,
      policyDecision: {
        outcome,
        reason: "Projected local-model resident memory exceeds the configured ceiling.",
        requestedEstimatedResidentMemoryBytes: 11 * gib,
        activeEstimatedResidentMemoryBytes: 11 * gib,
        projectedEstimatedResidentMemoryBytes: 22 * gib,
        maxResidentMemoryBytes: 8 * gib,
        exceededByBytes: 14 * gib,
        unloadCandidateIds: [],
      },
    },
  };
}

function llamaState(fixture: Awaited<ReturnType<typeof smokeFixture>>): LocalLlamaServerState {
  const stateDir = join(fixture.workspace, ".ambient/local-deep-research/server/literesearcher-4b-q4-k-m");
  return {
    schemaVersion: "ambient-local-llama-server-state-v1",
    profileId: "literesearcher-4b-q4-k-m",
    pid: 12345,
    endpointUrl: "http://127.0.0.1:39111",
    host: "127.0.0.1",
    port: 39111,
    runtimeBinaryPath: fixture.runtimePath,
    modelPath: fixture.modelPath,
    contextTokens: 32768,
    gpuLayers: 99,
    idleTimeoutMs: 0,
    startedAt: "2026-05-28T14:05:00.000Z",
    lastUsedAt: "2026-05-28T14:05:00.000Z",
    stateDir,
    logPath: join(stateDir, "llama-server.log"),
    stdoutPath: join(stateDir, "llama-server.stdout.log"),
    stderrPath: join(stateDir, "llama-server.stderr.log"),
    command: [fixture.runtimePath, "--model", fixture.modelPath],
  };
}
