import type { ChildProcess, SpawnOptions } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { LocalDeepResearchManagedAssetDetection } from "./localDeepResearchManagedAssets";
import { listLocalDeepResearchRunHistory, runLocalDeepResearchWithManagedLlama } from "./localDeepResearchRunService";
import { buildLocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import { LocalLlamaServerSupervisor } from "../localLlamaServerSupervisor";
import type { LocalDeepResearchBroker } from "./localDeepResearchAdapter";

const gib = 1024 ** 3;

describe("Local Deep Research managed run service", () => {
  it("acquires a managed llama lease, executes brokered tool calls, and writes run artifacts", async () => {
    const fixture = await runFixture();
    try {
      const chatReplies = [
        { choices: [{ message: { content: '{"name":"search","arguments":{"query":"Ambient Desktop local research","maxResults":3}}' } }] },
        { choices: [{ message: { content: '{"name":"visit","arguments":{"url":"https://example.com/source","maxCharacters":4000}}' } }] },
        { choices: [{ message: { content: "Ambient Desktop can run local research with cited evidence.\n\nSources: https://example.com/source" } }] },
      ];
      const chatFetch = vi.fn(async (url: string | URL | Request) => {
        if (String(url).endsWith("/health")) return jsonResponse({ status: "ok" });
        if (String(url).endsWith("/v1/chat/completions")) return jsonResponse(chatReplies.shift());
        return new Response("not found", { status: 404 });
      });
      const broker: LocalDeepResearchBroker = {
        search: vi.fn(async () => ({
          text: "Search result: Example Source https://example.com/source",
          selectedProvider: "exa-mcp-default",
          attempts: [{ providerId: "exa-mcp-default", status: "succeeded" as const, tool: "web_search_exa", durationMs: 12 }],
        })),
        visit: vi.fn(async () => ({
          text: "Fetched source text with evidence.",
          selectedProvider: "scrapling-mcp-default",
          attempts: [{ providerId: "scrapling-mcp-default", status: "succeeded" as const, tool: "scrapling/fetch", durationMs: 20 }],
        })),
      };

      const result = await runLocalDeepResearchWithManagedLlama({
        workspacePath: fixture.workspace,
        question: "What is the local research path?",
        setup: fixture.setup,
        managedAssets: fixture.assets,
        supervisor: fixture.supervisor(chatFetch as typeof fetch),
        broker,
        ownerThreadId: "thread-run",
        serverOptions: { idleTimeoutMs: 0 },
        maxToolCalls: 4,
        chatOptions: { fetchImpl: chatFetch as typeof fetch },
        now: () => new Date("2026-05-28T12:30:00.000Z"),
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-local-deep-research-service-result-v1",
        status: "completed",
        finalText: expect.stringContaining("Sources: https://example.com/source"),
        localModelResourcePreflight: {
          allowed: true,
          outcome: "unlimited",
        },
        llamaServer: {
          endpointUrl: "http://127.0.0.1:43123",
          profileId: "literesearcher-4b-q4-k-m",
        },
        artifacts: {
          jsonPath: expect.stringMatching(/\.ambient\/local-deep-research\/runs\/.+\.json$/),
          markdownPath: expect.stringMatching(/\.ambient\/local-deep-research\/runs\/.+\.md$/),
        },
      });
      expect(broker.search).toHaveBeenCalledWith({ query: "Ambient Desktop local research", maxResults: 3 });
      expect(broker.visit).toHaveBeenCalledWith({ url: "https://example.com/source", maxCharacters: 4000 });
      expect(result.run.citationValidation).toMatchObject({
        status: "passed",
        citationUrls: ["https://example.com/source"],
        unobservedCitationUrls: [],
      });
      expect(fixture.alive.size).toBe(0);
      const history = await listLocalDeepResearchRunHistory(fixture.workspace, { limit: 5 });
      expect(history).toMatchObject({
        schemaVersion: "ambient-local-deep-research-run-history-v1",
        runsRootPath: ".ambient/local-deep-research/runs",
        truncated: false,
        entries: [
          {
            status: "completed",
            question: "What is the local research path?",
            modelProfileId: "literesearcher-4b-q4-k-m",
            contextTokens: 32768,
            toolCallCount: 2,
            markdownPath: result.artifacts.markdownPath,
            jsonPath: result.artifacts.jsonPath,
          },
        ],
      });
      expect(history.entries[0].finalTextPreview).toContain("Ambient Desktop can run local research");
      expect(history.entries[0].providerSnapshot?.searchOrder).toEqual(["exa-mcp-default", "ambient-browser"]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("refuses launch before spawning llama-server when the resource policy blocks it", async () => {
    const fixture = await runFixture();
    try {
      const chatFetch = vi.fn(async () => jsonResponse({ status: "ok" }));
      const broker: LocalDeepResearchBroker = {
        search: vi.fn(),
        visit: vi.fn(),
      };

      await expect(runLocalDeepResearchWithManagedLlama({
        workspacePath: fixture.workspace,
        question: "Will this spawn?",
        setup: setupWithResourceOutcome(fixture.setup, "refuse"),
        managedAssets: fixture.assets,
        supervisor: fixture.supervisor(chatFetch as typeof fetch),
        broker,
        chatOptions: { fetchImpl: chatFetch as typeof fetch },
      })).rejects.toThrow("Projected local-model resident memory exceeds the configured ceiling.");

      expect(fixture.alive.size).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it("returns an empty history when no run artifacts exist yet", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-empty-history-"));
    try {
      await expect(listLocalDeepResearchRunHistory(workspace)).resolves.toEqual({
        schemaVersion: "ambient-local-deep-research-run-history-v1",
        runsRootPath: ".ambient/local-deep-research/runs",
        entries: [],
        truncated: false,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

async function runFixture() {
  const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-run-service-"));
  const runtimePath = join(workspace, ".ambient-managed", "runtime", "llama-server");
  const modelPath = join(workspace, ".ambient-managed", "models", "LiteResearcher-4B.Q4_K_M.gguf");
  await mkdir(join(workspace, ".ambient-managed", "runtime"), { recursive: true });
  await mkdir(join(workspace, ".ambient-managed", "models"), { recursive: true });
  await writeFile(runtimePath, "synthetic runtime", "utf8");
  await writeFile(modelPath, "synthetic model", "utf8");
  const setup = buildLocalDeepResearchSetupContract({
    modelInstallState: "installed",
    runtimeInstalled: true,
    machineFacts: { platform: "darwin", arch: "arm64", memoryBytes: 32 * gib, memoryPressure: "normal" },
    now: () => new Date("2026-05-28T12:00:00.000Z"),
  });
  const assets: LocalDeepResearchManagedAssetDetection = {
    schemaVersion: "ambient-local-deep-research-managed-assets-v1",
    managedRoot: join(workspace, ".ambient-managed"),
    model: {
      status: "present",
      profileId: "literesearcher-4b-q4-k-m",
      filename: "LiteResearcher-4B.Q4_K_M.gguf",
      cachePath: modelPath,
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
      binaryPath: runtimePath,
      verification: "binary-present",
    },
    warnings: [],
  };
  const alive = new Set<number>();
  let nextPid = 5000;
  return {
    workspace,
    setup,
    assets,
    alive,
    supervisor: (fetchImpl: typeof fetch) => new LocalLlamaServerSupervisor({
      fetchImpl,
      portAllocator: async () => 43123,
      sleep: async () => undefined,
      processAlive: (pid) => alive.has(pid),
      killProcess: (pid) => {
        alive.delete(pid);
      },
      spawnProcess: (_command: string, _args: string[], _options: SpawnOptions) => {
        const pid = nextPid += 1;
        alive.add(pid);
        return { pid, unref: vi.fn() } as unknown as ChildProcess;
      },
      now: () => new Date("2026-05-28T12:30:00.000Z"),
    }),
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
