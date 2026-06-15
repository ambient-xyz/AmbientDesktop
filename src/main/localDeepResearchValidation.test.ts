import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LocalDeepResearchManagedAssetDetection } from "../shared/types";
import { buildLocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import { validateLocalDeepResearchSetup } from "./localDeepResearchValidation";

const gib = 1024 ** 3;

describe("Local Deep Research setup validation", () => {
  it("writes a passed validation artifact for ready managed assets", async () => {
    const fixture = await validationFixture({ installed: true });
    try {
      const result = await validateLocalDeepResearchSetup({
        workspacePath: fixture.workspace,
        setup: fixture.setup,
        managedAssets: fixture.assets,
        now: () => new Date("2026-05-28T13:00:00.000Z"),
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-local-deep-research-validation-v1",
        checkedAt: "2026-05-28T13:00:00.000Z",
        status: "passed",
        setupStatus: "ready",
        modelProfileId: "literesearcher-4b-q4-k-m",
        artifactPath: ".ambient/local-deep-research/validation.json",
      });
      expect(result.checks.map((check) => `${check.id}:${check.status}`)).toEqual(expect.arrayContaining([
        "setup-contract:passed",
        "model-cache:passed",
        "llama-runtime:passed",
        "search-providers:passed",
        "fetch-providers:passed",
        "physical-memory-telemetry:passed",
        "provider-preference-smoke:passed",
      ]));
      expect(result.memoryTelemetry).toMatchObject({
        status: "recorded",
        physicalMemoryClass: expect.any(String),
        selectedProfileId: expect.stringMatching(/^literesearcher-4b-q[48]/),
        contextTokens: expect.any(Number),
        artifactPath: expect.stringContaining(".ambient/local-deep-research/memory-telemetry/"),
        markdownPath: expect.stringContaining(".ambient/local-deep-research/memory-telemetry/"),
      });
      expect(result.providerPreferenceSmoke).toMatchObject({
        status: "passed",
        checkCount: 5,
        artifactPath: ".ambient/local-deep-research/provider-preference-smoke/2026-05-28T13-00-00-000Z-passed.json",
        markdownPath: ".ambient/local-deep-research/provider-preference-smoke/2026-05-28T13-00-00-000Z-passed.md",
      });
      await expect(readValidationArtifact(fixture.workspace)).resolves.toContain("\"status\": \"passed\"");
      await expect(readValidationArtifact(fixture.workspace)).resolves.toContain("\"memoryTelemetry\"");
      await expect(readValidationArtifact(fixture.workspace)).resolves.toContain("\"providerPreferenceSmoke\"");
      await expect(readFile(join(fixture.workspace, ".ambient/local-deep-research/provider-preference-smoke/2026-05-28T13-00-00-000Z-passed.json"), "utf8")).resolves.toContain("strict-no-fallback-block");
      const memoryTelemetryFiles = await readdir(join(fixture.workspace, ".ambient/local-deep-research/memory-telemetry"));
      expect(memoryTelemetryFiles.some((file) => file.endsWith("-recorded.json"))).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it("reports needs-install before managed model and runtime assets exist", async () => {
    const fixture = await validationFixture({ installed: false });
    try {
      const result = await validateLocalDeepResearchSetup({
        workspacePath: fixture.workspace,
        setup: fixture.setup,
        managedAssets: fixture.assets,
        now: () => new Date("2026-05-28T13:05:00.000Z"),
      });

      expect(result.status).toBe("needs-install");
      expect(result.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "model-cache", status: "warning" }),
        expect.objectContaining({ id: "llama-runtime", status: "warning" }),
      ]));
    } finally {
      await fixture.cleanup();
    }
  });
});

async function validationFixture(input: { installed: boolean }) {
  const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-validation-"));
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
    cleanup: async () => {
      await rm(workspace, { recursive: true, force: true });
    },
  };
}

async function readValidationArtifact(workspace: string): Promise<string> {
  return readFile(join(workspace, ".ambient/local-deep-research/validation.json"), "utf8");
}
