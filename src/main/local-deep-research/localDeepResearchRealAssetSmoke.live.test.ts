import { arch, platform } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectLocalDeepResearchManagedAssets } from "./localDeepResearchManagedAssets";
import type { LocalDeepResearchMachineFacts, LocalDeepResearchModelProfileId } from "./localDeepResearchModelProfiles";
import { installLocalDeepResearchManagedAssets } from "./localDeepResearchInstallService";
import { runLocalDeepResearchRealAssetSmoke } from "./localDeepResearchSmoke";
import { buildLocalDeepResearchSetupContract, type LocalDeepResearchSetupInput } from "./localDeepResearchSetup";
import { validateLocalDeepResearchSetup } from "./localDeepResearchValidation";

const runLive = process.env.AMBIENT_LOCAL_DEEP_RESEARCH_REAL_ASSET_SMOKE === "1";
const describeLive = runLive ? describe : describe.skip;
const gib = 1024 ** 3;

describeLive("Local Deep Research real downloaded-asset smoke", () => {
  it("installs the managed LiteResearcher GGUF and llama.cpp runtime, then runs the sentinel smoke", async () => {
    const workspacePath = resolve(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_REAL_ASSET_WORKSPACE?.trim() || process.cwd());
    const q8 = process.env.AMBIENT_LOCAL_DEEP_RESEARCH_REAL_ASSET_Q8 === "1";
    const machineFacts: Partial<LocalDeepResearchMachineFacts> = {
      platform: platform(),
      arch: arch(),
      memoryBytes: q8 ? 128 * gib : 32 * gib,
      memoryPressure: "normal",
      activeLocalModelCount: 0,
    };
    const setupInput: LocalDeepResearchSetupInput = { machineFacts };
    const initialSetup = buildLocalDeepResearchSetupContract(setupInput);
    const progressPhases: string[] = [];

    const installResult = await installLocalDeepResearchManagedAssets({
      workspacePath,
      setup: initialSetup,
      action: "install",
      installModel: true,
      installRuntime: true,
      runtimeDownloadPreResponseTimeoutMs: Number(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_RUNTIME_PRE_RESPONSE_TIMEOUT_MS ?? 120_000),
      runtimeDownloadIdleTimeoutMs: Number(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_RUNTIME_IDLE_TIMEOUT_MS ?? 120_000),
      onProgress: (progress) => {
        const label = `${progress.component}:${progress.phase}:${progress.status}${progress.percent !== undefined ? `:${progress.percent}` : ""}`;
        if (progressPhases.at(-1) !== label) progressPhases.push(label);
      },
    });
    if (installResult.status === "failed") {
      throw new Error(`Local Deep Research live install failed:\n${JSON.stringify(installResult, null, 2)}`);
    }

    const managedAssets = await detectLocalDeepResearchManagedAssets(workspacePath, {
      selectedProfileId: initialSetup.modelInstall.selectedProfileId as LocalDeepResearchModelProfileId,
    });
    const readySetup = buildLocalDeepResearchSetupContract({
      ...setupInput,
      modelInstallState: managedAssets.model.status === "present" ? "installed" : "missing",
      runtimeInstalled: managedAssets.runtime.status === "present",
      ...(managedAssets.runtime.artifactId ? { runtimeArtifactId: managedAssets.runtime.artifactId } : {}),
      ...(managedAssets.runtime.binaryPath ? { runtimeBinaryPath: managedAssets.runtime.binaryPath } : {}),
    });
    const validation = await validateLocalDeepResearchSetup({
      workspacePath,
      setup: readySetup,
      managedAssets,
    });
    expect(validation.status).toBe("passed");

    const smoke = await runLocalDeepResearchRealAssetSmoke({
      workspacePath,
      setup: readySetup,
      managedAssets,
      serverOptions: {
        startupTimeoutMs: Number(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_SMOKE_STARTUP_TIMEOUT_MS ?? 240_000),
        idleTimeoutMs: 0,
      },
      chatOptions: {
        requestTimeoutMs: Number(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_SMOKE_REQUEST_TIMEOUT_MS ?? 120_000),
      },
    });

    expect(smoke.status).toBe("passed");
    expect(smoke.chat?.response).toContain("LOCAL_DEEP_RESEARCH_SMOKE_OK");
    expect(smoke.release?.status).toBe("stopped");
    console.log(JSON.stringify({
      workspacePath,
      profile: readySetup.modelInstall.selectedProfileId,
      modelPath: managedAssets.model.cachePath,
      runtimePath: managedAssets.runtime.binaryPath,
      validationArtifact: validation.artifactPath,
      smokeArtifact: smoke.artifactPath,
      smokeReport: smoke.markdownPath,
      progressPhases: progressPhases.slice(-12),
    }, null, 2));
  }, Number(process.env.AMBIENT_LOCAL_DEEP_RESEARCH_REAL_ASSET_TEST_TIMEOUT_MS ?? 45 * 60_000));
});
