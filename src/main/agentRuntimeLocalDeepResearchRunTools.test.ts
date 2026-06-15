import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import type {
  LocalDeepResearchFinalSynthesisMode,
  WorkspaceState,
} from "../shared/types";
import type { LocalDeepResearchBroker } from "./localDeepResearchAdapter";
import type { LocalDeepResearchManagedAssetDetection } from "./localDeepResearchManagedAssets";
import type { LocalDeepResearchModelProfileId } from "./localDeepResearchModelProfiles";
import {
  registerLocalDeepResearchRunTools,
  type LocalDeepResearchRunReadiness,
} from "./agentRuntimeLocalDeepResearchRunTools";
import type {
  LocalDeepResearchRunRequest,
  LocalDeepResearchRunServiceResult,
} from "./localDeepResearchRunService";
import {
  buildLocalDeepResearchSetupContract,
  type LocalDeepResearchSetupContract,
} from "./localDeepResearchSetup";

interface RegisteredTool {
  name: string;
  execute: (...args: any[]) => Promise<AgentToolResult<Record<string, unknown>>>;
}

type RunToolOptions = Parameters<typeof registerLocalDeepResearchRunTools>[1];

describe("registerLocalDeepResearchRunTools", () => {
  it("blocks run when setup readiness is not ready", async () => {
    const readiness = setupReadiness(false);
    const readReadiness = vi.fn(() => readiness);
    const run = vi.fn();
    const { tool } = registerRunHarness({ readReadiness, run });
    const updates: string[] = [];

    const result = await tool.execute("run-blocked", { question: "Research the blocked path." }, undefined, (update: AgentToolResult<Record<string, unknown>>) => {
      updates.push(toolText(update));
    });

    expect(readReadiness).toHaveBeenCalledWith(workspace(), {}, undefined);
    expect(run).not.toHaveBeenCalled();
    expect(updates).toEqual(["Preparing Local Deep Research run."]);
    expect(toolText(result)).toContain("Local Deep Research is not ready to run.");
    expect(result.details).toMatchObject({
      runtime: "ambient-local-deep-research",
      toolName: "ambient_local_deep_research_run",
      status: "blocked",
      setupStatus: readiness.contract.status,
      managedAssets: {
        schemaVersion: "ambient-local-deep-research-managed-assets-v1",
      },
    });
  });

  it("runs through injected broker and run boundaries", async () => {
    const readiness = setupReadiness(true);
    const broker = brokerFixture();
    const readReadiness = vi.fn(() => readiness);
    const createBroker = vi.fn(() => broker);
    const run = vi.fn(async (input: LocalDeepResearchRunRequest) => runResult(input));
    const { tool } = registerRunHarness({ readReadiness, createBroker, run });
    const updates: string[] = [];

    const result = await tool.execute("run-ready", {
      question: "Synthesize the local research path.",
      maxToolCalls: 3,
      maxTurns: 4,
      finalSynthesisMode: "evidence_only",
    }, undefined, (update: AgentToolResult<Record<string, unknown>>) => {
      updates.push(toolText(update));
    });

    expect(updates).toEqual([
      "Preparing Local Deep Research run.",
      "Starting LiteResearcher through Ambient Local Deep Research.",
    ]);
    expect(createBroker).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-local-deep-research-run",
      workspace: workspace(),
      providerSnapshot: readiness.contract.providerSnapshot,
      onUpdate: expect.any(Function),
    }));
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      workspacePath: workspace().path,
      question: "Synthesize the local research path.",
      setup: readiness.contract,
      managedAssets: readiness.managedAssets,
      broker,
      ownerThreadId: "thread-local-deep-research-run",
      maxToolCalls: 3,
      maxTurns: 4,
      finalSynthesis: { mode: "evidence_only" },
    }));
    expect(toolText(result)).toContain("Local Deep Research completed.");
    expect(result.details).toMatchObject({
      runtime: "ambient-local-deep-research",
      toolName: "ambient_local_deep_research_run",
      status: "completed",
      setupStatus: "ready",
      finalSynthesis: {
        mode: "evidence_only",
      },
      artifacts: {
        jsonPath: ".ambient/local-deep-research/runs/test.json",
        markdownPath: ".ambient/local-deep-research/runs/test.md",
      },
    });
  });
});

function registerRunHarness(input: {
  readReadiness: RunToolOptions["readReadiness"];
  createBroker?: RunToolOptions["createBroker"];
  run?: RunToolOptions["run"];
}): { tool: RegisteredTool; registeredTools: RegisteredTool[] } {
  const registeredTools: RegisteredTool[] = [];
  registerLocalDeepResearchRunTools({
    registerTool: (tool) => {
      registeredTools.push(tool as RegisteredTool);
    },
  }, {
    threadId: "thread-local-deep-research-run",
    workspace: workspace(),
    readReadiness: input.readReadiness,
    createBroker: input.createBroker ?? (() => brokerFixture()),
    run: input.run,
  });
  const tool = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_run");
  expect(tool).toBeDefined();
  return { tool: tool!, registeredTools };
}

function toolText(result: AgentToolResult<Record<string, unknown>>): string {
  const first = result.content[0];
  return first?.type === "text" ? first.text : "";
}

function workspace(): WorkspaceState {
  return {
    path: "/tmp/ambient-local-deep-research-run-tools",
    name: "ambient-local-deep-research-run-tools",
    statePath: "/tmp/ambient-local-deep-research-run-tools/.ambient",
    sessionPath: "/tmp/ambient-local-deep-research-run-tools/.ambient/sessions",
  };
}

function setupReadiness(ready: boolean): LocalDeepResearchRunReadiness {
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
    now: () => new Date("2026-06-10T12:30:00.000Z"),
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
    managedRoot: "/tmp/ambient-local-deep-research-run-tools/.ambient/managed",
    model: {
      status: ready ? "present" : "missing",
      profileId,
      filename: contract.modelInstall.filename,
      cachePath: `/tmp/ambient-local-deep-research-run-tools/.ambient/managed/${contract.modelInstall.filename}`,
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
            binaryPath: "/tmp/ambient-local-deep-research-run-tools/llama-server",
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

function brokerFixture(): LocalDeepResearchBroker {
  return {
    search: vi.fn(async () => ({
      text: "Search result",
      selectedProvider: "test-search",
      attempts: [],
    })),
    visit: vi.fn(async () => ({
      text: "Visit result",
      selectedProvider: "test-fetch",
      attempts: [],
    })),
  };
}

function runResult(input: LocalDeepResearchRunRequest): LocalDeepResearchRunServiceResult {
  const mode = input.finalSynthesis?.mode as LocalDeepResearchFinalSynthesisMode | undefined;
  return {
    schemaVersion: "ambient-local-deep-research-service-result-v1",
    status: "completed",
    finalText: "Local synthesis with citation https://example.com/source",
    run: {
      schemaVersion: "ambient-local-deep-research-run-v1",
      status: "completed",
      question: input.question,
      setupStatus: input.setup.status,
      modelProfileId: input.setup.modelInstall.selectedProfileId as LocalDeepResearchModelProfileId,
      contextTokens: input.setup.modelInstall.contextTokens,
      providerSnapshot: input.setup.providerSnapshot,
      finalSynthesis: {
        schemaVersion: "ambient-local-deep-research-final-synthesis-v1",
        mode: mode ?? "local",
        sourceLimit: 12,
        evidencePreviewChars: 1200,
      },
      messages: [],
      toolExecutions: [],
      finalText: "Local synthesis with citation https://example.com/source",
    },
    artifacts: {
      jsonPath: ".ambient/local-deep-research/runs/test.json",
      markdownPath: ".ambient/local-deep-research/runs/test.md",
      jsonBytes: 100,
      markdownBytes: 80,
    },
    localModelResourcePreflight: {
      allowed: true,
      outcome: "unlimited",
      reason: input.setup.localModelResources.policyDecision.reason,
      registry: input.setup.localModelResources,
    },
    llamaServer: {
      endpointUrl: "http://127.0.0.1:43123",
      pid: 1234,
      profileId: input.setup.modelInstall.selectedProfileId,
      modelPath: input.managedAssets.model.cachePath,
      runtimeBinaryPath: input.managedAssets.runtime.binaryPath ?? "/tmp/ambient-local-deep-research-run-tools/llama-server",
      stateDir: ".ambient/local-deep-research/server",
      logPath: "llama-server.log",
      stdoutPath: "llama-server.stdout.log",
      stderrPath: "llama-server.stderr.log",
    },
    release: { status: "released" },
  };
}
