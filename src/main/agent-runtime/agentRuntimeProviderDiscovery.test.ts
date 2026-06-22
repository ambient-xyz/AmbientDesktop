import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  EmbeddingProviderCandidate,
  SttProviderCandidate,
  SttProviderValidationMetadata,
  VoiceProviderCandidate,
} from "../../shared/localRuntimeTypes";
import { ambientCliWorkspaceProviderMarkerPath } from "../ambient-cli/ambientCliPackages";
import { secretReferenceFor } from "../security/securityAmbientCliContract";
import {
  agentRuntimeProviderDiscoveryOptions,
  agentRuntimeProviderDiscoveryWorkspacePaths,
  listEmbeddingProvidersForTools,
  listSttProvidersForTools,
  listVoiceProvidersWithCachedVoices,
  voiceProviderWorkspacePathForCapabilityId,
  type AgentRuntimeProviderDiscoveryOptions,
} from "./agentRuntimeProviderDiscovery";
import { AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID } from "./agentRuntimeMemoryFacade";
import type { VoiceDiscoveryCache } from "./agentRuntimeVoiceFacade";

describe("agent runtime provider discovery", () => {
  it("builds runtime discovery options from store workspace paths and feature listers", async () => {
    const root = await tempWorkspace("root");
    const child = await tempWorkspace("child", true);
    const options = agentRuntimeProviderDiscoveryOptions({
      store: {
        getWorkspace: () => ({ path: root }),
        listThreads: () => [
          { workspacePath: child },
          { workspacePath: root },
        ],
      },
      features: {
        voice: {
          listProviders: async (workspacePath) => [voiceProvider(`voice:${workspacePath}`)],
        },
        embeddings: {
          listProviders: async (workspacePath) => [embeddingProvider(`embedding:${workspacePath}`)],
        },
        stt: {
          listProviders: async (workspacePath) => [sttProvider(`stt:${workspacePath}`)],
        },
      },
    });

    expect(agentRuntimeProviderDiscoveryWorkspacePaths(options)).toEqual([root, child]);
    await expect(options.listVoiceProviders?.(child)).resolves.toEqual([expect.objectContaining({ capabilityId: `voice:${child}` })]);
    await expect(options.listEmbeddingProviders?.(child)).resolves.toEqual([expect.objectContaining({ capabilityId: `embedding:${child}` })]);
    await expect(options.listSttProviders?.(child)).resolves.toEqual([expect.objectContaining({ capabilityId: `stt:${child}` })]);
  });

  it("dedupes configured provider workspaces while preserving root-first order", async () => {
    const root = await tempWorkspace("root");
    const a = await tempWorkspace("a", true);
    const b = await tempWorkspace("b", true);
    expect(agentRuntimeProviderDiscoveryWorkspacePaths(options({
      rootWorkspacePath: root,
      threadWorkspacePaths: [a, root, b, a],
    }))).toEqual([root, a, b]);
  });

  it("does not scan every historical workspace just because the app managed install root has packages", async () => {
    const root = await tempWorkspace("managed-root");
    const child = await tempWorkspace("managed-child");
    const managedRoot = await tempWorkspace("managed-install-root", true);
    const previousRoot = process.env.AMBIENT_MANAGED_INSTALL_ROOT;
    process.env.AMBIENT_MANAGED_INSTALL_ROOT = managedRoot;
    try {
      expect(agentRuntimeProviderDiscoveryWorkspacePaths(options({
        rootWorkspacePath: root,
        threadWorkspacePaths: [child],
      }))).toEqual([root]);

      await writeWorkspaceProviderMarker(child);
      expect(agentRuntimeProviderDiscoveryWorkspacePaths(options({
        rootWorkspacePath: root,
        threadWorkspacePaths: [child],
      }))).toEqual([root, child]);
    } finally {
      if (previousRoot === undefined) delete process.env.AMBIENT_MANAGED_INSTALL_ROOT;
      else process.env.AMBIENT_MANAGED_INSTALL_ROOT = previousRoot;
    }
  });

  it("includes pre-marker managed workspaces that have local provider state", async () => {
    const root = await tempWorkspace("legacy-managed-root");
    const child = await tempWorkspace("legacy-managed-child");
    const managedRoot = await tempWorkspace("legacy-managed-install-root", true);
    const previousRoot = process.env.AMBIENT_MANAGED_INSTALL_ROOT;
    process.env.AMBIENT_MANAGED_INSTALL_ROOT = managedRoot;
    try {
      expect(agentRuntimeProviderDiscoveryWorkspacePaths(options({
        rootWorkspacePath: root,
        threadWorkspacePaths: [child],
      }))).toEqual([root]);

      await writeLegacyVoiceDiscoveryCache(child);
      expect(agentRuntimeProviderDiscoveryWorkspacePaths(options({
        rootWorkspacePath: root,
        threadWorkspacePaths: [child],
      }))).toEqual([root, child]);
    } finally {
      if (previousRoot === undefined) delete process.env.AMBIENT_MANAGED_INSTALL_ROOT;
      else process.env.AMBIENT_MANAGED_INSTALL_ROOT = previousRoot;
    }
  });

  it("includes only the pre-marker managed workspace that owns a scoped secret binding", async () => {
    const root = await tempWorkspace("legacy-secret-managed-root");
    const child = await tempWorkspace("legacy-secret-managed-child");
    const other = await tempWorkspace("legacy-secret-managed-other");
    const managedRoot = await tempWorkspace("legacy-secret-managed-install-root", true);
    const previousRoot = process.env.AMBIENT_MANAGED_INSTALL_ROOT;
    process.env.AMBIENT_MANAGED_INSTALL_ROOT = managedRoot;
    try {
      expect(agentRuntimeProviderDiscoveryWorkspacePaths(options({
        rootWorkspacePath: root,
        threadWorkspacePaths: [child, other],
      }))).toEqual([root]);

      await writeManagedSecretEnvBinding(managedRoot, child);
      expect(agentRuntimeProviderDiscoveryWorkspacePaths(options({
        rootWorkspacePath: root,
        threadWorkspacePaths: [child, other],
      }))).toEqual([root, child]);
    } finally {
      if (previousRoot === undefined) delete process.env.AMBIENT_MANAGED_INSTALL_ROOT;
      else process.env.AMBIENT_MANAGED_INSTALL_ROOT = previousRoot;
    }
  });

  it("resolves voice provider workspace paths by capability id", async () => {
    const root = await tempWorkspace("root");
    const a = await tempWorkspace("a", true);
    const b = await tempWorkspace("b", true);
    const calls: string[] = [];
    const result = await voiceProviderWorkspacePathForCapabilityId(options({
      rootWorkspacePath: root,
      threadWorkspacePaths: [a, b],
      listVoiceProviders: async (workspacePath) => {
        calls.push(workspacePath);
        return workspacePath === b ? [voiceProvider("voice:b")] : [voiceProvider(`voice:${workspacePath}`)];
      },
    }), "voice:b");

    expect(result).toBe(b);
    expect(calls).toEqual([root, a, b]);
    await expect(voiceProviderWorkspacePathForCapabilityId(options({ rootWorkspacePath: root }), undefined)).resolves.toBe(root);
  });

  it("merges cached voice providers from each workspace and keeps the first capability match", async () => {
    const root = await tempWorkspace("root");
    const child = await tempWorkspace("child", true);
    const cachesRead: string[] = [];
    const result = await listVoiceProvidersWithCachedVoices(options({
      rootWorkspacePath: root,
      threadWorkspacePaths: [child],
      listVoiceProviders: async (workspacePath) => workspacePath === root
        ? [voiceProvider("voice:shared"), voiceProvider("voice:root")]
        : [voiceProvider("voice:shared"), voiceProvider("voice:a")],
      readVoiceDiscoveryCache: async (workspacePath) => {
        cachesRead.push(workspacePath);
        return emptyVoiceCache();
      },
      mergeVoiceProvidersWithCachedVoices: (providers) => providers.map((provider) => ({
        ...provider,
        label: `${provider.label} cached`,
      })),
    }), "/workspace/root");

    expect(cachesRead).toEqual([root, child]);
    expect(result.map((provider) => [provider.capabilityId, provider.label])).toEqual([
      ["voice:shared", "voice:shared cached"],
      ["voice:root", "voice:root cached"],
      ["voice:a", "voice:a cached"],
    ]);
  });

  it("dedupes embedding providers across runtime workspaces while preserving the managed memory provider", async () => {
    const root = await tempWorkspace("root");
    const child = await tempWorkspace("child", true);
    const result = await listEmbeddingProvidersForTools(options({
      rootWorkspacePath: root,
      threadWorkspacePaths: [child],
      listEmbeddingProviders: async (workspacePath) => workspacePath === root
        ? [embeddingProvider("embedding:shared"), embeddingProvider("embedding:root")]
        : [embeddingProvider("embedding:shared"), embeddingProvider("embedding:a")],
    }), root);

    expect(result.map((provider) => provider.capabilityId)).toEqual([
      AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
      "embedding:shared",
      "embedding:root",
      "embedding:a",
    ]);
  });

  it("adds the first-party managed memory embedding provider when using default embedding discovery", async () => {
    const result = await listEmbeddingProvidersForTools(options({
      rootWorkspacePath: "/tmp/ambient-provider-discovery-empty",
    }), "/tmp/ambient-provider-discovery-empty");

    expect(result[0]).toMatchObject({
      capabilityId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
      providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
      modelId: "embeddinggemma-300m-q8_0",
      dimensions: 768,
      local: true,
    });
  });

  it("merges STT validation metadata after listing providers", async () => {
    const validation = sttValidation();
    const result = await listSttProvidersForTools(options({
      rootWorkspacePath: "/workspace/root",
      listSttProviders: async (workspacePath) => {
        expect(workspacePath).toBe("/workspace/root");
        return [sttProvider("stt:qwen")];
      },
      readSttValidationMetadata: async (workspacePath) => {
        expect(workspacePath).toBe("/workspace/root");
        return validation;
      },
      mergeSttProvidersWithValidation: (providers, receivedValidation) => {
        expect(receivedValidation).toBe(validation);
        return providers.map((provider) => ({ ...provider, validation: receivedValidation }));
      },
    }), "/workspace/root");

    expect(result).toEqual([expect.objectContaining({ capabilityId: "stt:qwen", validation })]);
  });
});

interface OptionsInput {
  rootWorkspacePath: string;
  threadWorkspacePaths?: string[];
  listVoiceProviders?: AgentRuntimeProviderDiscoveryOptions["listVoiceProviders"];
  listEmbeddingProviders?: AgentRuntimeProviderDiscoveryOptions["listEmbeddingProviders"];
  listSttProviders?: AgentRuntimeProviderDiscoveryOptions["listSttProviders"];
  readVoiceDiscoveryCache?: AgentRuntimeProviderDiscoveryOptions["readVoiceDiscoveryCache"];
  mergeVoiceProvidersWithCachedVoices?: AgentRuntimeProviderDiscoveryOptions["mergeVoiceProvidersWithCachedVoices"];
  readSttValidationMetadata?: AgentRuntimeProviderDiscoveryOptions["readSttValidationMetadata"];
  mergeSttProvidersWithValidation?: AgentRuntimeProviderDiscoveryOptions["mergeSttProvidersWithValidation"];
}

function options(input: OptionsInput): AgentRuntimeProviderDiscoveryOptions {
  const result: AgentRuntimeProviderDiscoveryOptions = {
    getRootWorkspacePath: () => input.rootWorkspacePath,
    getThreadWorkspacePaths: () => input.threadWorkspacePaths ?? [],
  };
  if (input.listVoiceProviders) result.listVoiceProviders = input.listVoiceProviders;
  if (input.listEmbeddingProviders) result.listEmbeddingProviders = input.listEmbeddingProviders;
  if (input.listSttProviders) result.listSttProviders = input.listSttProviders;
  if (input.readVoiceDiscoveryCache) result.readVoiceDiscoveryCache = input.readVoiceDiscoveryCache;
  if (input.mergeVoiceProvidersWithCachedVoices) result.mergeVoiceProvidersWithCachedVoices = input.mergeVoiceProvidersWithCachedVoices;
  if (input.readSttValidationMetadata) result.readSttValidationMetadata = input.readSttValidationMetadata;
  if (input.mergeSttProvidersWithValidation) result.mergeSttProvidersWithValidation = input.mergeSttProvidersWithValidation;
  return result;
}

function voiceProvider(capabilityId: string): VoiceProviderCandidate {
  return {
    packageId: "ambient-voice",
    packageName: "ambient-voice",
    command: "voice",
    capabilityId,
    providerId: capabilityId,
    label: capabilityId,
    format: "wav",
    formats: ["wav"],
    voices: [],
    installed: true,
    available: true,
    availabilityReason: "available",
  };
}

function embeddingProvider(capabilityId: string): EmbeddingProviderCandidate {
  return {
    packageId: "ambient-embedding",
    packageName: "ambient-embedding",
    command: "embed",
    capabilityId,
    providerId: capabilityId,
    label: capabilityId,
    installed: true,
    available: true,
    availabilityReason: "available",
  };
}

function sttProvider(capabilityId: string): SttProviderCandidate {
  return {
    packageId: "ambient-stt",
    packageName: "ambient-stt",
    command: "stt",
    capabilityId,
    providerId: capabilityId,
    label: capabilityId,
    languages: ["English"],
    installed: true,
    available: true,
    availabilityReason: "available",
  };
}

function sttValidation(): SttProviderValidationMetadata {
  return {
    schemaVersion: "ambient-stt-provider-validation-v1",
    provider: "qwen3-asr",
    packageName: "ambient-qwen3-asr",
    providerCapabilityId: "stt:qwen",
    status: "passed",
    updatedAt: "2026-06-11T00:00:00.000Z",
    platform: "darwin",
    arch: "arm64",
    lane: "native",
    missingHints: [],
  };
}

function emptyVoiceCache(): VoiceDiscoveryCache {
  return {
    schemaVersion: "ambient-voice-discovery-cache-v1",
    providers: {},
  };
}

async function tempWorkspace(label: string, withCliConfig = false): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), `ambient-provider-discovery-${label}-`));
  if (withCliConfig) await writeCliPackageConfig(workspace);
  return workspace;
}

async function writeCliPackageConfig(workspace: string): Promise<void> {
  const configPath = join(workspace, ".ambient", "cli-packages", "packages.json");
  await mkdir(join(workspace, ".ambient", "cli-packages"), { recursive: true });
  await writeFile(configPath, `${JSON.stringify({ packages: [] })}\n`, "utf8");
}

async function writeWorkspaceProviderMarker(workspace: string): Promise<void> {
  const markerPath = join(workspace, ambientCliWorkspaceProviderMarkerPath);
  await mkdir(join(workspace, ".ambient", "cli-packages"), { recursive: true });
  await writeFile(markerPath, `${JSON.stringify({ schemaVersion: "ambient-cli-workspace-provider-state-v1" })}\n`, "utf8");
}

async function writeLegacyVoiceDiscoveryCache(workspace: string): Promise<void> {
  await mkdir(join(workspace, ".ambient", "voice"), { recursive: true });
  await writeFile(
    join(workspace, ".ambient", "voice", "voice-discovery-cache.json"),
    `${JSON.stringify({ schemaVersion: "ambient-voice-discovery-cache-v1", providers: {} })}\n`,
    "utf8",
  );
}

async function writeManagedSecretEnvBinding(managedRoot: string, workspace: string): Promise<void> {
  const packageName = "secret-provider";
  const envName = "SECRET_API_KEY";
  await mkdir(join(managedRoot, ".ambient", "cli-packages"), { recursive: true });
  await writeFile(
    join(managedRoot, ".ambient", "cli-packages", "env-bindings.json"),
    `${JSON.stringify({
      bindings: [{
        packageName,
        envName,
        secretRef: secretReferenceFor({ scope: "ambient-cli", workspacePath: workspace, ownerId: packageName, envName }),
      }],
    }, null, 2)}\n`,
    "utf8",
  );
}
