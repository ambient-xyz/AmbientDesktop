import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type {
  LocalDeepResearchSmokeResult,
  LocalDeepResearchValidationResult,
} from "../../shared/localRuntimeTypes";
import { AgentRuntime } from "./agentRuntime";
import {
  buildLocalDeepResearchSetupContract,
  detectLocalDeepResearchManagedAssets,
  localDeepResearchModelCachePath,
  localDeepResearchProfileById,
  type LocalDeepResearchInstallServiceResult,
} from "./agentRuntimeLocalDeepResearchFacade";
import {
  detectLocalLlamaResidentProcesses,
  selectLocalLlamaRuntimeArtifact,
} from "./agentRuntimeLocalLlamaFacade";
import { miniCpmRuntimeReleaseManifestPrototype } from "./agentRuntimeMiniCpmFacade";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { normalizeWebResearchProviderStackSettings } from "./agentRuntimeWebResearchFacade";

const gib = 1024 ** 3;

describe("AgentRuntime Local Deep Research setup facade tools", () => {
  it("registers a read-only setup contract tool using current provider preferences", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const currentSettings = {
        webResearch: normalizeWebResearchProviderStackSettings({
          providers: [
            {
              providerId: "ambient-brave-search",
              label: "Brave Search",
              kind: "ambient-cli",
              roles: ["search"],
              status: "enabled",
            },
            {
              providerId: "custom-fetch",
              label: "Custom Fetch",
              kind: "toolhive-mcp",
              roles: ["fetch"],
              status: "enabled",
            },
          ],
          preferences: {
            search: ["ambient-brave-search", "ambient-browser"],
            fetch: ["custom-fetch", "scrapling-mcp-default"],
          },
          fallbackPolicy: { allowBrowserFallback: true },
        }),
      };
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      }, {
        search: {
          readSettings: () => currentSettings as any,
          updateSettings: async (input: any) => input,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      const updates: string[] = [];
      (runtime as any).createLocalDeepResearchToolExtension("thread-local-research", workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      const setup = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_setup")!;
      expect(setup).toBeDefined();
      const result = await setup.execute("local-research-setup", { q8Override: true }, undefined, (update: any) => {
        updates.push(update.content[0]?.text ?? "");
      });

      expect(updates).toEqual(["Reading Local Deep Research setup contract."]);
      expect(result.content[0].text).toContain("Local Deep Research setup status:");
      expect(result.content[0].text).toContain("Provider preferences are captured at call time");
      expect(result.details).toMatchObject({
        runtime: "ambient-local-deep-research",
        toolName: "ambient_local_deep_research_setup",
        status: "complete",
        capabilityId: "local.deep-research.literesearcher",
        llamaRuntime: {
          source: "shared-llama-cpp-runtime",
        },
        installerShape: {
          schemaVersion: "ambient-local-model-installer-shape-v1",
          installerKind: "local-model",
          modelFamily: "LiteResearcher-4B",
          confirmation: {
            requiredForActions: ["install", "repair", "smoke"],
          },
          server: {
            host: "127.0.0.1",
            port: "auto",
          },
          lifecycle: {
            progressEvent: "local-deep-research-install-progress",
          },
        },
        managedAssets: {
          schemaVersion: "ambient-local-deep-research-managed-assets-v1",
          model: {
            status: "missing",
            profileId: expect.stringMatching(/^literesearcher-4b-/),
          },
        },
        providerSnapshot: {
          searchOrder: ["ambient-brave-search", "ambient-browser", "exa-mcp-default"],
          fetchOrder: ["custom-fetch", "scrapling-mcp-default", "exa-mcp-default", "ambient-browser"],
        },
      });
      expect(["accepted", "warned", "rejected"]).toContain(result.details.modelSelection.q8OverrideDecision);
      expect(result.details.nextActions).toEqual(expect.arrayContaining([
        expect.stringContaining("Install the selected LiteResearcher GGUF profile"),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("surfaces active sub-agent local runtime leases in Local Deep Research setup", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-lease-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const runtimeStateDir = join(workspacePath, ".ambient/local-model-runtime/local-text-runtime");
      await mkdir(runtimeStateDir, { recursive: true });
      await writeFile(join(runtimeStateDir, "runtime-state.json"), JSON.stringify({
        schemaVersion: "ambient-local-model-runtime-state-v1",
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        pid: process.pid,
        status: "running",
        healthUrl: "http://127.0.0.1:43123/health",
        ownerThreadId: "parent-thread",
        parentThreadId: "parent-thread",
        subagentThreadId: "child-thread",
        ownerDisplayName: "Review worker",
        estimatedResidentMemoryBytes: 6 * gib,
        startedAt: "2026-06-05T00:00:00.000Z",
        lastUsedAt: "2026-06-05T00:00:00.000Z",
      }, null, 2), "utf8");
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      }, {
        localModelResidentProcesses: (workspacePath) => detectLocalLlamaResidentProcesses(workspacePath, {
          includeUntracked: false,
        }),
        search: {
          readSettings: () => localDeepResearchProviderSnapshotSettings("ambient-brave-search", "custom-fetch") as any,
          updateSettings: async (input: any) => input,
        },
      });
      (runtime as any).localModelRuntimeManager = {
        activeRuntimeLeases: () => [{
          schemaVersion: "ambient-local-runtime-lease-v1",
          leaseId: "lease-review",
          parentThreadId: "parent-thread",
          subagentThreadId: "child-thread",
          ownerDisplayName: "Review worker",
          modelRuntimeId: "local-text-runtime",
          modelProfileId: "local-text-4b-q4",
          modelId: "local/text-4b",
          providerId: "local",
          capabilityKind: "local-text",
          estimatedResidentMemoryBytes: 6 * gib,
          pid: process.pid,
          endpoint: "http://127.0.0.1:43123/health",
          acquiredAt: "2026-06-05T00:00:00.000Z",
          lastHeartbeatAt: "2026-06-05T00:01:00.000Z",
          status: "running",
        }],
      };

      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createLocalDeepResearchToolExtension("thread-local-research", workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const setup = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_setup")!;
      const result = await setup.execute("local-research-setup", { q8Override: true });

      expect(result.content[0].text).toContain("Local runtime inventory: 2 runtimes; 1 active lease; In use by sub-agent Review worker.");
      expect(result.details.localRuntimeInventory.activeLeases).toEqual([
        expect.objectContaining({
          leaseId: "lease-review",
          parentThreadId: "parent-thread",
          subagentThreadId: "child-thread",
          ownerDisplayName: "Review worker",
        }),
      ]);
      expect(result.details.localRuntimeInventory.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: `local-text:local-text-runtime:${process.pid}`,
          owners: [
            {
              leaseId: "lease-review",
              parentThreadId: "parent-thread",
              subagentThreadId: "child-thread",
              displayName: "sub-agent Review worker",
              status: "running",
            },
          ],
          stopDecision: expect.objectContaining({
            ordinaryStopAllowed: false,
            reason: "In use by sub-agent Review worker.",
            blockerLeaseIds: ["lease-review"],
            forceTerminationAllowed: true,
            forceRequiresSubagentCancellation: true,
            untracked: false,
          }),
        }),
      ]));
      expect(result.details.localModelResources).toMatchObject({
        requestedLaunch: expect.objectContaining({
          capability: "local-deep-research",
        }),
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("brokers Local Deep Research install permission with computed installer shape details", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-permission-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("local research install").id, { permissionMode: "workspace" });
      const requester = vi.fn(async (_request: any) => ({ allowed: true, mode: "allow_once" as const }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: requester,
        denyThread: () => undefined,
      });

      await expect((runtime as any).resolveToolCallPermission(thread.id, workspace, "ambient_local_deep_research_setup", {
        action: "install",
      })).resolves.toBeUndefined();

      expect(requester).toHaveBeenCalledTimes(1);
      const request = requester.mock.calls[0][0];
      expect(request).toMatchObject({
        title: "Install Local Deep Research model?",
        risk: "plugin-tool",
        grantActionKind: "plugin_tool_execute",
        grantTargetKind: "tool",
      });
      expect(request.detail).toContain("Model family: LiteResearcher-4B");
      expect(request.detail).toContain("Expected disk:");
      expect(request.detail).toContain("Estimated resident memory:");
      expect(request.detail).toContain("Server: 127.0.0.1:auto");
      expect(request.detail).toContain("Progress: local-deep-research-install-progress events");
      expect(request.grantConditions).toMatchObject({
        operation: "ambient_local_deep_research_setup",
        action: "install",
        installerShapeSchemaVersion: "ambient-local-model-installer-shape-v1",
        serverHost: "127.0.0.1",
        serverPort: "auto",
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("runs Local Deep Research setup install through the managed asset install boundary", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-install-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      const workspace = store.openWorkspace(workspacePath);
      const installFeature = vi.fn(async (input: any): Promise<LocalDeepResearchInstallServiceResult> => {
        await installSyntheticLocalDeepResearchAssets(workspacePath);
        const managedAssets = await detectLocalDeepResearchManagedAssets(workspacePath, {
          selectedProfileId: input.setup.modelInstall.selectedProfileId,
        });
        return {
          schemaVersion: "ambient-local-deep-research-install-result-v1",
          status: "installed",
          modelInstall: {
            attempted: true,
            status: "installed",
            profileId: input.setup.modelInstall.selectedProfileId,
            filename: input.setup.modelInstall.filename,
            sourceUrl: input.setup.modelInstall.sourceUrl,
            cachePath: managedAssets.model.cachePath,
            bytes: input.setup.modelInstall.sizeBytes,
            sha256: input.setup.modelInstall.sha256,
            downloadStatus: "downloaded",
            downloadDurationMs: 25,
            missingHints: [],
          },
          runtimeInstall: {
            attempted: true,
            status: "already-installed",
            source: "managed-download",
            artifactId: managedAssets.runtime.artifactId,
            binaryPath: managedAssets.runtime.binaryPath,
            cacheSubdir: managedAssets.runtime.cacheSubdir,
            missingHints: [],
          },
          managedAssets,
          nextActions: ["Run Local Deep Research setup status, then start a bounded validation research run."],
        };
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => (
        {
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        } as any
      ), {
        request: vi.fn(),
        denyThread: () => undefined,
      }, {
        localModelResidentProcesses: async () => [],
        search: {
          readSettings: () => ({
            webResearch: normalizeWebResearchProviderStackSettings({
              preferences: {
                search: ["exa-mcp-default", "ambient-browser"],
                fetch: ["scrapling-mcp-default", "ambient-browser"],
              },
            }),
          }) as any,
          updateSettings: async (input: any) => input,
        },
        localDeepResearch: {
          buildSetupContract: (_workspacePath: string, input: any) => buildLocalDeepResearchSetupContract({
            ...input,
            runtimeBinaryPath: undefined,
            runtimeInstalled: Boolean(input.runtimeInstalled),
          }),
          install: installFeature,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      const updates: string[] = [];
      (runtime as any).createLocalDeepResearchToolExtension("thread-local-research-install", workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      const setup = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_setup")!;
      const result = await setup.execute("local-research-install", {
        action: "install",
      }, undefined, (update: any) => {
        updates.push(update.content[0]?.text ?? "");
      });

      expect(updates).toEqual([
        "Preparing Local Deep Research install.",
        "Installing Ambient-managed Local Deep Research assets.",
      ]);
      expect(installFeature).toHaveBeenCalledWith(expect.objectContaining({
        workspacePath,
        setup: expect.objectContaining({ status: "needs-install" }),
        installModel: true,
        installRuntime: true,
      }));
      expect(result.content[0].text).toContain("Local Deep Research install installed.");
      expect(result.content[0].text).toContain("Local Deep Research setup status: ready.");
      expect(result.details).toMatchObject({
        runtime: "ambient-local-deep-research",
        toolName: "ambient_local_deep_research_setup",
        action: "install",
        setupStatus: "ready",
        installResult: {
          status: "installed",
        },
      });
      expect(emitted).toContainEqual(expect.objectContaining({
        type: "local-deep-research-setup-updated",
        workspacePath,
        result: expect.objectContaining({
          schemaVersion: "ambient-local-deep-research-setup-result-v1",
          action: "install",
          setupStatus: "ready",
          installResult: expect.objectContaining({ status: "installed" }),
        }),
      }));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("runs Local Deep Research setup validation through the validation boundary", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-validate-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      await installSyntheticLocalDeepResearchAssets(workspacePath);
      const validateFeature = vi.fn(async (input: any): Promise<LocalDeepResearchValidationResult> => ({
        schemaVersion: "ambient-local-deep-research-validation-v1",
        checkedAt: "2026-05-28T14:20:00.000Z",
        status: "passed",
        setupStatus: input.setup.status,
        modelProfileId: input.setup.modelInstall.selectedProfileId,
        contextTokens: input.setup.modelInstall.contextTokens,
        providerSnapshot: input.setup.providerSnapshot,
        checks: [
          {
            id: "setup-contract",
            title: "Setup contract",
            status: "passed",
            detail: "Synthetic validation passed.",
          },
          {
            id: "provider-preference-smoke",
            title: "Provider preference product smoke",
            status: "passed",
            detail: "Synthetic provider preference smoke passed.",
          },
        ],
        artifactPath: ".ambient/local-deep-research/validation.json",
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
                fetch: ["scrapling-mcp-default", "ambient-browser"],
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
          validate: validateFeature,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      const updates: string[] = [];
      (runtime as any).createLocalDeepResearchToolExtension("thread-local-research-validate", workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      const setup = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_setup")!;
      const result = await setup.execute("local-research-validate", {
        action: "validate",
      }, undefined, (update: any) => {
        updates.push(update.content[0]?.text ?? "");
      });

      expect(updates).toEqual([
        "Preparing Local Deep Research validation.",
        "Running Local Deep Research validation.",
      ]);
      expect(validateFeature).toHaveBeenCalledWith(expect.objectContaining({
        workspacePath,
        setup: expect.objectContaining({ status: "ready" }),
        managedAssets: expect.objectContaining({
          model: expect.objectContaining({ status: "present" }),
          runtime: expect.objectContaining({ status: "present" }),
        }),
      }));
      expect(result.content[0].text).toContain("Local Deep Research validation passed.");
      expect(result.content[0].text).toContain(".ambient/local-deep-research/validation.json");
      expect(result.details).toMatchObject({
        runtime: "ambient-local-deep-research",
        toolName: "ambient_local_deep_research_setup",
        action: "validate",
        setupStatus: "ready",
        validation: {
          status: "passed",
          artifactPath: ".ambient/local-deep-research/validation.json",
        },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("runs Local Deep Research setup smoke through the real-asset smoke boundary", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-smoke-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      await installSyntheticLocalDeepResearchAssets(workspacePath);
      const smokeFeature = vi.fn(async (input: any): Promise<LocalDeepResearchSmokeResult> => ({
        schemaVersion: "ambient-local-deep-research-smoke-v1",
        checkedAt: "2026-05-28T14:10:00.000Z",
        status: "passed",
        setupStatus: input.setup.status,
        modelProfileId: input.setup.modelInstall.selectedProfileId,
        contextTokens: input.setup.modelInstall.contextTokens,
        providerSnapshot: input.setup.providerSnapshot,
        checks: [
          {
            id: "llama-chat",
            title: "llama.cpp chat completion",
            status: "passed",
            detail: "Synthetic smoke passed.",
          },
        ],
        artifactPath: ".ambient/local-deep-research/smoke/test.json",
        markdownPath: ".ambient/local-deep-research/smoke/test.md",
        chat: {
          prompt: "smoke",
          response: "LOCAL_DEEP_RESEARCH_SMOKE_OK",
          durationMs: 25,
          requestTimeoutMs: 60000,
        },
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
                fetch: ["scrapling-mcp-default", "ambient-browser"],
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
          smoke: smokeFeature,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      const updates: string[] = [];
      (runtime as any).createLocalDeepResearchToolExtension("thread-local-research-smoke", workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      const setup = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_setup")!;
      const result = await setup.execute("local-research-smoke", {
        action: "smoke",
      }, undefined, (update: any) => {
        updates.push(update.content[0]?.text ?? "");
      });

      expect(updates).toEqual([
        "Preparing Local Deep Research real-asset smoke.",
        "Running Local Deep Research real-asset smoke.",
      ]);
      expect(smokeFeature).toHaveBeenCalledWith(expect.objectContaining({
        workspacePath,
        setup: expect.objectContaining({ status: "ready" }),
        managedAssets: expect.objectContaining({
          model: expect.objectContaining({ status: "present" }),
          runtime: expect.objectContaining({ status: "present" }),
        }),
      }));
      expect(result.content[0].text).toContain("Local Deep Research real-asset smoke passed.");
      expect(result.content[0].text).toContain(".ambient/local-deep-research/smoke/test.md");
      expect(result.details).toMatchObject({
        runtime: "ambient-local-deep-research",
        toolName: "ambient_local_deep_research_setup",
        action: "smoke",
        setupStatus: "ready",
        smoke: {
          status: "passed",
          artifactPath: ".ambient/local-deep-research/smoke/test.json",
        },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });});

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
