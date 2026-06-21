import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { localDeepResearchToolBudgetState, normalizeLocalDeepResearchRunBudget } from "../../shared/localDeepResearchBudget";
import type { LocalDeepResearchSettings } from "../../shared/localRuntimeTypes";
import { AgentRuntime } from "./agentRuntime";
import {
  buildLocalDeepResearchSetupContract,
  localDeepResearchModelCachePath,
  localDeepResearchProfileById,
  normalizeLocalDeepResearchSettings,
  type LocalDeepResearchRunServiceResult,
} from "./agentRuntimeLocalDeepResearchFacade";
import { selectLocalLlamaRuntimeArtifact } from "./agentRuntimeLocalLlamaFacade";
import { miniCpmRuntimeReleaseManifestPrototype } from "./agentRuntimeMiniCpmFacade";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { normalizeWebResearchProviderStackSettings } from "./agentRuntimeWebResearchFacade";

describe("AgentRuntime Local Deep Research run facade tools", () => {
  it("registers a Local Deep Research run tool that refreshes readiness and uses the run service boundary", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-run-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      await installSyntheticLocalDeepResearchAssets(workspacePath);
      const runFeature = vi.fn(async (input: any): Promise<LocalDeepResearchRunServiceResult> => ({
        schemaVersion: "ambient-local-deep-research-service-result-v1",
        status: "completed",
        finalText: "Local synthesis with citation https://example.com/source",
        run: {
          schemaVersion: "ambient-local-deep-research-run-v1",
          status: "completed",
          question: input.question,
          setupStatus: input.setup.status,
          modelProfileId: input.setup.modelInstall.selectedProfileId,
          contextTokens: input.setup.modelInstall.contextTokens,
          providerSnapshot: input.setup.providerSnapshot,
          finalSynthesis: {
            schemaVersion: "ambient-local-deep-research-final-synthesis-v1",
            mode: "local",
            sourceLimit: 12,
            evidencePreviewChars: 1200,
          },
          finalSynthesisReserveTurns: 3,
          toolBudget: localDeepResearchToolBudgetState(normalizeLocalDeepResearchRunBudget(input.localResearchBudget, {
            effort: "custom",
            maxToolCalls: input.maxToolCalls,
            source: input.localResearchBudget ? input.localResearchBudget.source : "tool_input",
          }), 0),
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
          runtimeBinaryPath: input.managedAssets.runtime.binaryPath,
          stateDir: ".ambient/local-deep-research/server",
          logPath: "llama-server.log",
          stdoutPath: "llama-server.stdout.log",
          stderrPath: "llama-server.stderr.log",
        },
        release: { status: "released" },
      }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      }, {
        localModelResidentProcesses: async () => [],
        search: {
          readSettings: () => ({
            webResearch: normalizeWebResearchProviderStackSettings({
              preferences: {
                search: ["exa-mcp-default", "ambient-browser"],
                fetch: ["scrapling-mcp-default", "exa-mcp-default", "ambient-browser"],
              },
            }),
          }) as any,
          updateSettings: async (input: any) => input,
        },
        localDeepResearch: {
          buildSetupContract: (_workspacePath: string, input: any) => buildLocalDeepResearchSetupContract({
            ...input,
            runtimeBinaryPath: undefined,
            runtimeInstalled: true,
          }),
          run: runFeature,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      const updates: string[] = [];
      (runtime as any).createLocalDeepResearchToolExtension("thread-local-research-run", workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
        "ambient_local_deep_research_setup",
        "ambient_local_deep_research_run",
      ]));
      const run = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_run")!;
      const result = await run.execute("local-research-run", {
        question: "Synthesize the local research path.",
        maxToolCalls: 3,
        localResearchBudget: normalizeLocalDeepResearchRunBudget(undefined, {
          effort: "custom",
          maxToolCalls: 3,
          source: "tool_input",
        }),
      }, undefined, (update: any) => {
        updates.push(update.content[0]?.text ?? "");
      });
      expect(updates).toEqual([
        "Preparing Local Deep Research run.",
        "Checking Local Deep Research setup, provider routing, and local runtime inventory.",
        "Local Deep Research setup is ready; checking local resource pressure.",
        "Starting LiteResearcher through Ambient Local Deep Research.",
      ]);
      expect(runFeature).toHaveBeenCalledWith(expect.objectContaining({
        workspacePath,
        question: "Synthesize the local research path.",
        maxToolCalls: 3,
        localResearchBudget: expect.objectContaining({
          maxToolCalls: 3,
          source: "tool_input",
        }),
        setup: expect.objectContaining({ status: "ready" }),
        managedAssets: expect.objectContaining({
          model: expect.objectContaining({ status: "present" }),
          runtime: expect.objectContaining({ status: "present" }),
        }),
        broker: expect.objectContaining({
          search: expect.any(Function),
          visit: expect.any(Function),
        }),
      }));
      expect(result.content[0].text).toContain("Local Deep Research completed.");
      expect(result.details).toMatchObject({
        runtime: "ambient-local-deep-research",
        toolName: "ambient_local_deep_research_run",
        status: "completed",
        setupStatus: "ready",
        artifacts: {
          jsonPath: ".ambient/local-deep-research/runs/test.json",
          markdownPath: ".ambient/local-deep-research/runs/test.md",
        },
        providerSnapshot: {
          searchOrder: ["exa-mcp-default", "ambient-browser"],
          fetchOrder: ["scrapling-mcp-default", "exa-mcp-default", "ambient-browser"],
        },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("uses Local Deep Research provider order when executing multiple configured providers", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-provider-order-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("local research provider order");
      await installSyntheticLocalDeepResearchAssets(workspacePath);
      let localDeepResearchSettings: LocalDeepResearchSettings = normalizeLocalDeepResearchSettings({
        providerStack: {
          providers: [
            {
              providerId: "local.deep-research.fixture",
              label: "Fixture Research",
              kind: "test-adapter",
              roles: ["research"],
              status: "enabled",
            },
          ],
          preferences: {
            research: ["local.deep-research.literesearcher", "local.deep-research.fixture"],
          },
        },
      });
      const runObservations: Array<{ activeProviderId?: string; providerOrder: string[] }> = [];
      const runFeature = vi.fn(async (input: any): Promise<LocalDeepResearchRunServiceResult> => {
        runObservations.push({
          activeProviderId: input.setup.providerSnapshot.activeProvider?.providerId,
          providerOrder: [...input.setup.providerSnapshot.providerOrder],
        });
        const activeProviderId = input.setup.providerSnapshot.activeProvider?.providerId ?? "none";
        return {
          schemaVersion: "ambient-local-deep-research-service-result-v1",
          status: "completed",
          finalText: `Completed with ${activeProviderId}`,
          run: {
            schemaVersion: "ambient-local-deep-research-run-v1",
            status: "completed",
            question: input.question,
            setupStatus: input.setup.status,
            modelProfileId: input.setup.modelInstall.selectedProfileId,
            contextTokens: input.setup.modelInstall.contextTokens,
            providerSnapshot: input.setup.providerSnapshot,
            finalSynthesis: {
              schemaVersion: "ambient-local-deep-research-final-synthesis-v1",
              mode: "local",
              sourceLimit: 12,
              evidencePreviewChars: 1200,
            },
            finalSynthesisReserveTurns: 3,
            toolBudget: localDeepResearchToolBudgetState(normalizeLocalDeepResearchRunBudget(input.localResearchBudget, {
              effort: "custom",
              maxToolCalls: input.maxToolCalls,
              source: input.localResearchBudget ? input.localResearchBudget.source : "tool_input",
            }), 0),
            messages: [],
            toolExecutions: [],
            finalText: `Completed with ${activeProviderId}`,
          },
          artifacts: {
            jsonPath: `.ambient/local-deep-research/runs/${activeProviderId}.json`,
            markdownPath: `.ambient/local-deep-research/runs/${activeProviderId}.md`,
            jsonBytes: 120,
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
            runtimeBinaryPath: input.managedAssets.runtime.binaryPath,
            stateDir: ".ambient/local-deep-research/server",
            logPath: "llama-server.log",
            stdoutPath: "llama-server.stdout.log",
            stderrPath: "llama-server.stderr.log",
          },
          release: { status: "released" },
        };
      });
      const permissionRequester = vi.fn(async () => ({ allowed: true, mode: "allow_once" as const }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequester,
        denyThread: () => undefined,
      }, {
        localModelResidentProcesses: async () => [],
        search: {
          readSettings: () => ({
            webResearch: normalizeWebResearchProviderStackSettings({
              preferences: {
                search: ["exa-mcp-default", "ambient-browser"],
                fetch: ["scrapling-mcp-default", "exa-mcp-default", "ambient-browser"],
              },
            }),
          }) as any,
          updateSettings: async (input: any) => input,
        },
        localDeepResearch: {
          readSettings: () => localDeepResearchSettings,
          updateSettings: async (input) => {
            localDeepResearchSettings = normalizeLocalDeepResearchSettings(input);
            return localDeepResearchSettings;
          },
          buildSetupContract: (_workspacePath: string, input: any) => buildLocalDeepResearchSetupContract({
            ...input,
            runtimeBinaryPath: undefined,
            runtimeInstalled: true,
          }),
          run: runFeature,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createLocalDeepResearchToolExtension(thread.id, workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const update = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_provider_update")!;
      const run = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_run")!;

      await update.execute("prefer-fixture", {
        action: "prefer_provider",
        providerId: "local.deep-research.fixture",
        reason: "Exercise alternate local provider.",
      });
      const fixtureRun = await run.execute("run-fixture", { question: "Run through the fixture provider." });

      await update.execute("prefer-lite", {
        action: "prefer_provider",
        providerId: "local.deep-research.literesearcher",
        reason: "Return to the first-party default.",
      });
      const liteRun = await run.execute("run-lite", { question: "Run through LiteResearcher." });

      expect(permissionRequester).toHaveBeenCalledTimes(2);
      expect(runObservations).toEqual([
        {
          activeProviderId: "local.deep-research.fixture",
          providerOrder: ["local.deep-research.fixture", "local.deep-research.literesearcher"],
        },
        {
          activeProviderId: "local.deep-research.literesearcher",
          providerOrder: ["local.deep-research.literesearcher", "local.deep-research.fixture"],
        },
      ]);
      expect(fixtureRun.details).toMatchObject({
        status: "completed",
        activeProvider: { providerId: "local.deep-research.fixture" },
        providerOrder: ["local.deep-research.fixture", "local.deep-research.literesearcher"],
        artifacts: { jsonPath: ".ambient/local-deep-research/runs/local.deep-research.fixture.json" },
      });
      expect(liteRun.details).toMatchObject({
        status: "completed",
        activeProvider: { providerId: "local.deep-research.literesearcher" },
        providerOrder: ["local.deep-research.literesearcher", "local.deep-research.fixture"],
        artifacts: { jsonPath: ".ambient/local-deep-research/runs/local.deep-research.literesearcher.json" },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps Local Deep Research broker routing on the run-start provider snapshot", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-provider-snapshot-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      await installSyntheticLocalDeepResearchAssets(workspacePath);
      let currentSettings = localDeepResearchProviderSnapshotSettings("snapshot-search", "snapshot-fetch");
      const brokerObservations: Array<{ selectedProvider?: string; attempts: Array<{ providerId: string; status: string }> }> = [];
      const runFeature = vi.fn(async (input: any): Promise<LocalDeepResearchRunServiceResult> => {
        expect(input.setup.providerSnapshot.searchOrder).toEqual(["snapshot-search"]);
        expect(input.setup.providerSnapshot.fetchOrder).toEqual(["snapshot-fetch"]);

        currentSettings = localDeepResearchProviderSnapshotSettings("next-search", "next-fetch");
        brokerObservations.push(await input.broker.search({ query: "provider snapshot probe", maxResults: 1 }));
        brokerObservations.push(await input.broker.visit({ url: "https://example.com/provider-snapshot", maxCharacters: 200 }));

        return {
          schemaVersion: "ambient-local-deep-research-service-result-v1",
          status: "completed",
          finalText: "Provider snapshot route held for the in-flight run.",
          run: {
            schemaVersion: "ambient-local-deep-research-run-v1",
            status: "completed",
            question: input.question,
            setupStatus: input.setup.status,
            modelProfileId: input.setup.modelInstall.selectedProfileId,
            contextTokens: input.setup.modelInstall.contextTokens,
            providerSnapshot: input.setup.providerSnapshot,
            finalSynthesis: {
              schemaVersion: "ambient-local-deep-research-final-synthesis-v1",
              mode: "local",
              sourceLimit: 12,
              evidencePreviewChars: 1200,
            },
            finalSynthesisReserveTurns: 3,
            toolBudget: localDeepResearchToolBudgetState(normalizeLocalDeepResearchRunBudget(input.localResearchBudget, {
              effort: "custom",
              maxToolCalls: input.maxToolCalls,
              source: input.localResearchBudget ? input.localResearchBudget.source : "tool_input",
            }), 0),
            messages: [],
            toolExecutions: [],
            finalText: "Provider snapshot route held for the in-flight run.",
          },
          artifacts: {
            jsonPath: ".ambient/local-deep-research/runs/provider-snapshot.json",
            markdownPath: ".ambient/local-deep-research/runs/provider-snapshot.md",
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
            runtimeBinaryPath: input.managedAssets.runtime.binaryPath,
            stateDir: ".ambient/local-deep-research/server",
            logPath: "llama-server.log",
            stdoutPath: "llama-server.stdout.log",
            stderrPath: "llama-server.stderr.log",
          },
          release: { status: "released" },
        };
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      }, {
        localModelResidentProcesses: async () => [],
        search: {
          readSettings: () => currentSettings as any,
          updateSettings: async (input: any) => input,
        },
        localDeepResearch: {
          buildSetupContract: (_workspacePath: string, input: any) => buildLocalDeepResearchSetupContract({
            ...input,
            runtimeBinaryPath: undefined,
            runtimeInstalled: true,
          }),
          run: runFeature,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createLocalDeepResearchToolExtension("thread-local-research-provider-snapshot", workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      const run = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_run")!;
      const result = await run.execute("local-research-provider-snapshot", {
        question: "Check provider snapshot stability.",
      });

      expect(brokerObservations).toHaveLength(2);
      expect(brokerObservations[0].attempts.map((attempt) => attempt.providerId)).toEqual(["snapshot-search"]);
      expect(brokerObservations[1].attempts.map((attempt) => attempt.providerId)).toEqual(["snapshot-fetch"]);
      expect(brokerObservations.flatMap((observation) => observation.attempts.map((attempt) => attempt.providerId))).not.toContain("next-search");
      expect(brokerObservations.flatMap((observation) => observation.attempts.map((attempt) => attempt.providerId))).not.toContain("next-fetch");
      expect(result.details.providerSnapshot).toMatchObject({
        searchOrder: ["snapshot-search"],
        fetchOrder: ["snapshot-fetch"],
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

});

function localDeepResearchProviderSnapshotSettings(searchProviderId: string, fetchProviderId: string) {
  return {
    webResearch: normalizeWebResearchProviderStackSettings({
      providers: [
        { providerId: "exa-mcp-default", label: "Exa Search", kind: "remote-mcp", roles: ["search", "fetch"], status: "disabled" },
        { providerId: "scrapling-mcp-default", label: "Scrapling", kind: "toolhive-mcp", roles: ["fetch"], status: "disabled" },
        { providerId: "ambient-browser", label: "Ambient Browser", kind: "built-in-browser", roles: ["search", "fetch", "interactive_browser"], status: "disabled" },
        { providerId: searchProviderId, label: searchProviderId, kind: "remote-mcp", roles: ["search"], status: "enabled" },
        { providerId: fetchProviderId, label: fetchProviderId, kind: "remote-mcp", roles: ["fetch"], status: "enabled" },
      ],
      preferences: {
        search: [searchProviderId, "exa-mcp-default", "ambient-browser"],
        fetch: [fetchProviderId, "scrapling-mcp-default", "ambient-browser"],
      },
      fallbackPolicy: { allowBrowserFallback: false },
    }),
  };
}

async function installSyntheticLocalDeepResearchAssets(workspacePath: string): Promise<void> {
  for (const profileId of ["literesearcher-4b-q4-k-m", "literesearcher-4b-q8-0"] as const) {
    const profile = localDeepResearchProfileById(profileId);
    const modelPath = localDeepResearchModelCachePath(workspacePath, profile);
    await mkdir(dirname(modelPath), { recursive: true });
    const handle = await open(modelPath, "w");
    try {
      await handle.truncate(profile.sizeBytes);
    } finally {
      await handle.close();
    }
  }
  const artifact = selectLocalLlamaRuntimeArtifact(miniCpmRuntimeReleaseManifestPrototype.artifacts, {
    platform: "darwin",
    arch: "arm64",
  });
  if (!artifact) throw new Error("Expected macOS arm64 llama.cpp runtime artifact.");
  const runtimePath = join(workspacePath, ".ambient/vision/minicpm-v/runtime", artifact.cacheSubdir, artifact.binaryRelativePath);
  await mkdir(dirname(runtimePath), { recursive: true });
  await writeFile(runtimePath, "synthetic llama-server", "utf8");
}
