import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import type {
  DesktopEvent,
  LocalDeepResearchInstallProgress,
  LocalDeepResearchSmokeResult,
  LocalDeepResearchValidationResult,
  WorkspaceState,
} from "../../shared/types";
import {
  registerLocalDeepResearchSetupTools,
  type LocalDeepResearchSetupReadiness,
} from "./agentRuntimeLocalDeepResearchSetupTools";
import type {
  LocalDeepResearchInstallRequest,
  LocalDeepResearchInstallServiceResult,
} from "./localDeepResearchInstallService";
import type { LocalDeepResearchManagedAssetDetection } from "./localDeepResearchManagedAssets";
import type { LocalDeepResearchModelProfileId } from "./localDeepResearchModelProfiles";
import {
  buildLocalDeepResearchSetupContract,
  type LocalDeepResearchSetupContract,
} from "./localDeepResearchSetup";

interface RegisteredTool {
  name: string;
  execute: (...args: any[]) => Promise<AgentToolResult<Record<string, unknown>>>;
}

type SetupToolOptions = Parameters<typeof registerLocalDeepResearchSetupTools>[1];

describe("registerLocalDeepResearchSetupTools", () => {
  it("registers status and emits setup-updated details", async () => {
    const readiness = setupReadiness(false);
    const readReadiness = vi.fn(() => readiness);
    const emit = vi.fn();
    const { setup } = registerSetupHarness({ readReadiness, emit });
    const updates: string[] = [];

    const result = await setup.execute("setup-status", {}, undefined, (update: AgentToolResult<Record<string, unknown>>) => {
      updates.push(toolText(update));
    });

    expect(readReadiness).toHaveBeenCalledWith(workspace(), {}, undefined);
    expect(updates).toEqual(["Reading Local Deep Research setup contract."]);
    expect(toolText(result)).toContain("Local Deep Research setup status:");
    expect(result.details).toMatchObject({
      runtime: "ambient-local-deep-research",
      toolName: "ambient_local_deep_research_setup",
      status: "complete",
      action: "status",
      capabilityId: "local.deep-research.literesearcher",
      managedAssets: {
        schemaVersion: "ambient-local-deep-research-managed-assets-v1",
      },
    });
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "local-deep-research-setup-updated",
      workspacePath: workspace().path,
      result: expect.objectContaining({
        schemaVersion: "ambient-local-deep-research-setup-result-v1",
        action: "status",
      }),
    }));
  });

  it("returns a controlled error when setup readiness cannot be read", async () => {
    const readReadiness = vi.fn(() => {
      throw new Error("provider discovery stalled");
    });
    const emit = vi.fn();
    const { setup } = registerSetupHarness({ readReadiness, emit });

    const result = await setup.execute("setup-status-failed", {});

    expect((result as any).isError).toBe(true);
    expect(toolText(result)).toContain("Local Deep Research setup status is unavailable.");
    expect(toolText(result)).toContain("provider discovery stalled");
    expect(result.details).toMatchObject({
      runtime: "ambient-local-deep-research",
      toolName: "ambient_local_deep_research_setup",
      status: "error",
      action: "status",
      setupStatus: "unknown",
      error: "provider discovery stalled",
    });
    expect(emit).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "local-deep-research-setup-updated",
    }));
  });

  it("runs install through the injected boundary, emits progress, and rereads readiness", async () => {
    const initial = setupReadiness(false);
    const ready = setupReadiness(true);
    const readReadiness = vi.fn()
      .mockReturnValueOnce(initial)
      .mockReturnValueOnce(ready);
    const progress = installProgress();
    const install = vi.fn(async (input: LocalDeepResearchInstallRequest) => {
      input.onProgress?.(progress);
      return installResult(ready);
    });
    const emit = vi.fn();
    const { setup } = registerSetupHarness({ readReadiness, emit, install });
    const updates: string[] = [];

    const result = await setup.execute("setup-install", { action: "install" }, undefined, (update: AgentToolResult<Record<string, unknown>>) => {
      updates.push(toolText(update));
    });

    expect(readReadiness).toHaveBeenCalledTimes(2);
    expect(install).toHaveBeenCalledWith(expect.objectContaining({
      workspacePath: workspace().path,
      setup: initial.contract,
      action: "install",
      installModel: true,
      installRuntime: true,
    }));
    expect(updates).toEqual([
      "Preparing Local Deep Research install.",
      "Installing Ambient-managed Local Deep Research assets.",
      "Downloading model (1.00 KB of 2.00 KB, 50%)",
    ]);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "local-deep-research-install-progress",
      progress,
      workspacePath: workspace().path,
    }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "local-deep-research-setup-updated",
      result: expect.objectContaining({
        action: "install",
        installResult: expect.objectContaining({ status: "installed" }),
      }),
    }));
    expect(toolText(result)).toContain("Local Deep Research install installed.");
    expect(result.details).toMatchObject({
      toolName: "ambient_local_deep_research_setup",
      action: "install",
      installResult: {
        status: "installed",
      },
    });
  });

  it("routes validate and smoke actions through injected boundaries", async () => {
    const ready = setupReadiness(true);
    const validate = vi.fn(async (input: Parameters<NonNullable<SetupToolOptions["validate"]>>[0]): Promise<LocalDeepResearchValidationResult> => validationResult(input.setup));
    const smoke = vi.fn(async (input: Parameters<NonNullable<SetupToolOptions["smoke"]>>[0]): Promise<LocalDeepResearchSmokeResult> => smokeResult(input.setup));

    const validateHarness = registerSetupHarness({
      readReadiness: vi.fn(() => ready),
      emit: vi.fn(),
      validate,
    });
    const validateUpdates: string[] = [];
    const validateResult = await validateHarness.setup.execute("setup-validate", { action: "validate" }, undefined, (update: AgentToolResult<Record<string, unknown>>) => {
      validateUpdates.push(toolText(update));
    });

    expect(validateUpdates).toEqual([
      "Preparing Local Deep Research validation.",
      "Running Local Deep Research validation.",
    ]);
    expect(validate).toHaveBeenCalledWith(expect.objectContaining({
      workspacePath: workspace().path,
      setup: ready.contract,
      managedAssets: ready.managedAssets,
    }));
    expect(validateResult.details).toMatchObject({
      action: "validate",
      validation: {
        status: "passed",
      },
    });

    const smokeHarness = registerSetupHarness({
      readReadiness: vi.fn(() => ready),
      emit: vi.fn(),
      smoke,
    });
    const smokeUpdates: string[] = [];
    const result = await smokeHarness.setup.execute("setup-smoke", { action: "smoke" }, undefined, (update: AgentToolResult<Record<string, unknown>>) => {
      smokeUpdates.push(toolText(update));
    });

    expect(smokeUpdates).toEqual([
      "Preparing Local Deep Research real-asset smoke.",
      "Running Local Deep Research real-asset smoke.",
    ]);
    expect(smoke).toHaveBeenCalledWith(expect.objectContaining({
      workspacePath: workspace().path,
      setup: ready.contract,
      managedAssets: ready.managedAssets,
      ownerThreadId: "thread-local-deep-research-setup",
    }));
    expect(result.details).toMatchObject({
      action: "smoke",
      smoke: {
        status: "passed",
      },
    });
  });
});

function registerSetupHarness(input: {
  readReadiness: SetupToolOptions["readReadiness"];
  emit?: (event: DesktopEvent) => void;
  install?: SetupToolOptions["install"];
  validate?: SetupToolOptions["validate"];
  smoke?: SetupToolOptions["smoke"];
}): { setup: RegisteredTool; registeredTools: RegisteredTool[] } {
  const registeredTools: RegisteredTool[] = [];
  registerLocalDeepResearchSetupTools({
    registerTool: (tool) => {
      registeredTools.push(tool as RegisteredTool);
    },
  }, {
    threadId: "thread-local-deep-research-setup",
    workspace: workspace(),
    readReadiness: input.readReadiness,
    emit: input.emit ?? vi.fn(),
    install: input.install,
    validate: input.validate,
    smoke: input.smoke,
  });
  const setup = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_setup");
  expect(setup).toBeDefined();
  return { setup: setup!, registeredTools };
}

function toolText(result: AgentToolResult<Record<string, unknown>>): string {
  const first = result.content[0];
  return first?.type === "text" ? first.text : "";
}

function workspace(): WorkspaceState {
  return {
    path: "/tmp/ambient-local-deep-research-setup-tools",
    name: "ambient-local-deep-research-setup-tools",
    statePath: "/tmp/ambient-local-deep-research-setup-tools/.ambient",
    sessionPath: "/tmp/ambient-local-deep-research-setup-tools/.ambient/sessions",
  };
}

function setupReadiness(ready: boolean): LocalDeepResearchSetupReadiness {
  const contract = buildLocalDeepResearchSetupContract({
    machineFacts: {
      platform: "darwin",
      arch: "arm64",
      memoryBytes: 64 * 1024 * 1024 * 1024,
      availableMemoryBytes: 48 * 1024 * 1024 * 1024,
      memoryPressure: "normal",
      activeLocalModelCount: 0,
      activeLocalModelEstimatedResidentMemoryBytes: 0,
    },
    modelInstallState: ready ? "installed" : "missing",
    runtimeInstalled: ready,
    ...(ready ? { runtimeBinaryPath: "/tmp/ambient-local-deep-research-setup-tools/llama-server" } : {}),
    now: () => new Date("2026-06-10T12:00:00.000Z"),
  });
  return {
    contract,
    managedAssets: managedAssets(contract, ready),
  };
}

function managedAssets(
  contract: LocalDeepResearchSetupContract,
  ready: boolean,
): LocalDeepResearchManagedAssetDetection {
  const profileId = contract.modelInstall.selectedProfileId as LocalDeepResearchModelProfileId;
  return {
    schemaVersion: "ambient-local-deep-research-managed-assets-v1",
    managedRoot: "/tmp/ambient-local-deep-research-setup-tools/.ambient/managed",
    model: {
      status: ready ? "present" : "missing",
      profileId,
      filename: contract.modelInstall.filename,
      cachePath: `/tmp/ambient-local-deep-research-setup-tools/.ambient/managed/${contract.modelInstall.filename}`,
      expectedSizeBytes: contract.modelInstall.sizeBytes,
      expectedSha256: contract.modelInstall.sha256,
      ...(ready ? { sizeBytes: contract.modelInstall.sizeBytes } : {}),
      verification: ready ? "size-matched" : "not-run",
    },
    runtime: {
      status: ready ? "present" : "missing",
      source: "shared-llama-cpp-runtime",
      manifestId: contract.runtime.manifestId,
      ...(contract.runtime.selectedArtifactId ? { artifactId: contract.runtime.selectedArtifactId } : {}),
      ...(ready
        ? {
            binaryPath: "/tmp/ambient-local-deep-research-setup-tools/llama-server",
            cacheSubdir: "llama-runtime",
            verification: "binary-present" as const,
          }
        : {
            verification: "binary-missing" as const,
          }),
    },
    warnings: [],
  };
}

function installProgress(): LocalDeepResearchInstallProgress {
  return {
    schemaVersion: "ambient-local-deep-research-install-progress-v1",
    action: "install",
    component: "model",
    phase: "model-download-progress",
    status: "running",
    message: "Downloading model",
    bytesReceived: 1024,
    totalBytes: 2048,
    percent: 50,
    recordedAt: "2026-06-10T12:00:01.000Z",
  };
}

function installResult(readiness: LocalDeepResearchSetupReadiness): LocalDeepResearchInstallServiceResult {
  return {
    schemaVersion: "ambient-local-deep-research-install-result-v1",
    status: "installed",
    managedAssets: readiness.managedAssets,
    nextActions: ["Run Local Deep Research setup status, then start a bounded validation research run."],
  };
}

function validationResult(contract: LocalDeepResearchSetupContract): LocalDeepResearchValidationResult {
  return {
    schemaVersion: "ambient-local-deep-research-validation-v1",
    checkedAt: "2026-06-10T12:00:02.000Z",
    status: "passed",
    setupStatus: contract.status,
    modelProfileId: contract.modelInstall.selectedProfileId as LocalDeepResearchModelProfileId,
    contextTokens: contract.modelInstall.contextTokens,
    providerSnapshot: contract.providerSnapshot,
    checks: [],
    artifactPath: ".ambient/local-deep-research/validation.json",
  };
}

function smokeResult(contract: LocalDeepResearchSetupContract): LocalDeepResearchSmokeResult {
  return {
    schemaVersion: "ambient-local-deep-research-smoke-v1",
    checkedAt: "2026-06-10T12:00:03.000Z",
    status: "passed",
    setupStatus: contract.status,
    modelProfileId: contract.modelInstall.selectedProfileId as LocalDeepResearchModelProfileId,
    contextTokens: contract.modelInstall.contextTokens,
    providerSnapshot: contract.providerSnapshot,
    checks: [],
    artifactPath: ".ambient/local-deep-research/smoke/test.json",
    markdownPath: ".ambient/local-deep-research/smoke/test.md",
  };
}
