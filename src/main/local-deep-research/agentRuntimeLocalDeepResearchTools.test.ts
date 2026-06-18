import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { registerAgentRuntimeLocalDeepResearchTools } from "./agentRuntimeLocalDeepResearchTools";
import type { LocalDeepResearchSetupReadiness } from "./agentRuntimeLocalDeepResearchSetupTools";
import type { LocalDeepResearchManagedAssetDetection } from "./localDeepResearchManagedAssets";
import type { LocalDeepResearchModelProfileId } from "./localDeepResearchModelProfiles";
import {
  buildLocalDeepResearchSetupContract,
  type LocalDeepResearchSetupContract,
} from "./localDeepResearchSetup";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<AgentToolResult<Record<string, unknown>>> };

describe("registerAgentRuntimeLocalDeepResearchTools", () => {
  it("registers Local Deep Research provider, setup, and run tools", () => {
    const { registeredTools } = registerHarness();

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_local_deep_research_provider_status",
      "ambient_local_deep_research_provider_search",
      "ambient_local_deep_research_provider_describe",
      "ambient_local_deep_research_provider_update",
      "ambient_local_deep_research_setup",
      "ambient_local_deep_research_run",
    ]);
    expect(registeredTools.every((tool) => tool.executionMode === "sequential")).toBe(true);
  });

  it("forwards setup readiness, updates, and desktop events through the composed extension", async () => {
    const readiness = setupReadiness(false);
    const readReadiness = vi.fn(() => readiness);
    const emit = vi.fn();
    const { setup } = registerHarness({ readReadiness, emit });
    const updates: string[] = [];

    const result = await setup.execute("setup-status", {}, undefined, (update: AgentToolResult<Record<string, unknown>>) => {
      updates.push(toolText(update));
    });

    expect(readReadiness).toHaveBeenCalledWith(workspace(), {}, undefined);
    expect(updates).toEqual(["Reading Local Deep Research setup contract."]);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "local-deep-research-setup-updated",
      workspacePath: workspace().path,
      result: expect.objectContaining({
        schemaVersion: "ambient-local-deep-research-setup-result-v1",
        action: "status",
      }),
    }));
    expect(result.details).toMatchObject({
      runtime: "ambient-local-deep-research",
      toolName: "ambient_local_deep_research_setup",
      action: "status",
      capabilityId: "local.deep-research.literesearcher",
    });
  });
});

function registerHarness(overrides: {
  readReadiness?: () => LocalDeepResearchSetupReadiness;
  emit?: (event: DesktopEvent) => void;
} = {}): { setup: RegisteredTool; registeredTools: RegisteredTool[] } {
  const registeredTools: RegisteredTool[] = [];
  registerAgentRuntimeLocalDeepResearchTools({
    registerTool: (tool) => {
      registeredTools.push(tool as RegisteredTool);
    },
  }, {
    threadId: "thread-local-deep-research-tools",
    workspace: workspace(),
    getThread: (threadId) => ({
      id: threadId,
      workspacePath: workspace().path,
      collaborationMode: "chat",
      permissionMode: "default",
    } as any),
    readReadiness: overrides.readReadiness ?? (() => setupReadiness(false)),
    emit: overrides.emit ?? vi.fn(),
    createBroker: () => ({
      search: vi.fn(),
      visit: vi.fn(),
    }),
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
    path: "/tmp/ambient-local-deep-research-tools",
    name: "ambient-local-deep-research-tools",
    statePath: "/tmp/ambient-local-deep-research-tools/.ambient",
    sessionPath: "/tmp/ambient-local-deep-research-tools/.ambient/sessions",
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
    ...(ready ? { runtimeBinaryPath: "/tmp/ambient-local-deep-research-tools/llama-server" } : {}),
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
    managedRoot: "/tmp/ambient-local-deep-research-tools/.ambient/managed",
    model: {
      status: ready ? "present" : "missing",
      profileId,
      filename: contract.modelInstall.filename,
      cachePath: `/tmp/ambient-local-deep-research-tools/.ambient/managed/${contract.modelInstall.filename}`,
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
            binaryPath: "/tmp/ambient-local-deep-research-tools/llama-server",
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
