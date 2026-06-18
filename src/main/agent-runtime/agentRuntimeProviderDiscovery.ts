import type {
  EmbeddingProviderCandidate,
  SttProviderCandidate,
  SttProviderValidationMetadata,
  VoiceProviderCandidate,
} from "../../shared/localRuntimeTypes";
import {
  discoverAmbientCliEmbeddingProviders as defaultDiscoverEmbeddingProviders,
  discoverAmbientCliSttProviders as defaultDiscoverSttProviders,
  discoverAmbientCliVoiceProviders as defaultDiscoverVoiceProviders,
} from "./agentRuntimeAmbientCliFacade";
import { discoverAmbientMemoryEmbeddingProviders as defaultDiscoverManagedMemoryEmbeddingProviders } from "../memory/tencentdb/managedEmbeddingProvider";
import {
  mergeSttProvidersWithValidation as defaultMergeSttProvidersWithValidation,
  readQwen3AsrValidationMetadata as defaultReadSttValidationMetadata,
} from "../stt/sttProviderInstaller";
import {
  mergeVoiceProvidersWithCachedVoices as defaultMergeVoiceProvidersWithCachedVoices,
  readVoiceDiscoveryCache as defaultReadVoiceDiscoveryCache,
  type VoiceDiscoveryCache,
} from "../voice/voiceDiscoveryCache";

type MaybePromise<T> = T | Promise<T>;
type ProviderLister<T> = (workspacePath: string) => MaybePromise<T[]>;

export interface AgentRuntimeProviderDiscoveryOptions {
  getRootWorkspacePath: () => string;
  getThreadWorkspacePaths: () => string[];
  listVoiceProviders?: ProviderLister<VoiceProviderCandidate>;
  listEmbeddingProviders?: ProviderLister<EmbeddingProviderCandidate>;
  listSttProviders?: ProviderLister<SttProviderCandidate>;
  discoverVoiceProviders?: ProviderLister<VoiceProviderCandidate>;
  discoverEmbeddingProviders?: ProviderLister<EmbeddingProviderCandidate>;
  discoverSttProviders?: ProviderLister<SttProviderCandidate>;
  readVoiceDiscoveryCache?: (workspacePath: string) => MaybePromise<VoiceDiscoveryCache>;
  mergeVoiceProvidersWithCachedVoices?: (providers: VoiceProviderCandidate[], cache: VoiceDiscoveryCache) => VoiceProviderCandidate[];
  readSttValidationMetadata?: (workspacePath: string) => MaybePromise<SttProviderValidationMetadata | undefined>;
  mergeSttProvidersWithValidation?: (providers: SttProviderCandidate[], validation: SttProviderValidationMetadata | undefined) => SttProviderCandidate[];
}

export interface AgentRuntimeProviderDiscoveryStore {
  getWorkspace(): { path: string };
  listThreads(): readonly { workspacePath: string }[];
}

export interface AgentRuntimeProviderDiscoveryFeatures {
  voice?: {
    listProviders?: ProviderLister<VoiceProviderCandidate>;
  };
  embeddings?: {
    listProviders?: ProviderLister<EmbeddingProviderCandidate>;
  };
  stt?: {
    listProviders?: ProviderLister<SttProviderCandidate>;
  };
}

export interface AgentRuntimeProviderDiscoveryRuntimeInput {
  store: AgentRuntimeProviderDiscoveryStore;
  features: AgentRuntimeProviderDiscoveryFeatures;
}

export function agentRuntimeProviderDiscoveryOptions(
  input: AgentRuntimeProviderDiscoveryRuntimeInput,
): AgentRuntimeProviderDiscoveryOptions {
  const options: AgentRuntimeProviderDiscoveryOptions = {
    getRootWorkspacePath: () => input.store.getWorkspace().path,
    getThreadWorkspacePaths: () => input.store.listThreads().map((thread) => thread.workspacePath),
  };
  const listVoiceProviders = input.features.voice?.listProviders;
  const listEmbeddingProviders = input.features.embeddings?.listProviders;
  const listSttProviders = input.features.stt?.listProviders;
  if (listVoiceProviders) options.listVoiceProviders = (workspacePath) => listVoiceProviders(workspacePath);
  if (listEmbeddingProviders) options.listEmbeddingProviders = (workspacePath) => listEmbeddingProviders(workspacePath);
  if (listSttProviders) options.listSttProviders = (workspacePath) => listSttProviders(workspacePath);
  return options;
}

export function agentRuntimeProviderDiscoveryWorkspacePaths(options: AgentRuntimeProviderDiscoveryOptions): string[] {
  return Array.from(new Set([options.getRootWorkspacePath(), ...options.getThreadWorkspacePaths()]));
}

export function listVoiceProvidersForTools(
  options: AgentRuntimeProviderDiscoveryOptions,
  workspacePath: string,
): Promise<VoiceProviderCandidate[]> {
  return listVoiceProvidersWithCachedVoices(options, workspacePath);
}

export async function voiceProviderWorkspacePathForCapabilityId(
  options: AgentRuntimeProviderDiscoveryOptions,
  providerCapabilityId: string | undefined,
): Promise<string> {
  const rootWorkspacePath = options.getRootWorkspacePath();
  if (!providerCapabilityId) return rootWorkspacePath;
  const listProviders = options.listVoiceProviders ?? options.discoverVoiceProviders ?? defaultDiscoverVoiceProviders;
  for (const workspacePath of agentRuntimeProviderDiscoveryWorkspacePaths(options)) {
    const providers = await listProviders(workspacePath);
    if (providers.some((provider) => provider.capabilityId === providerCapabilityId)) return workspacePath;
  }
  return rootWorkspacePath;
}

export async function listVoiceProvidersWithCachedVoices(
  options: AgentRuntimeProviderDiscoveryOptions,
  _workspacePath: string,
): Promise<VoiceProviderCandidate[]> {
  const listProviders = options.listVoiceProviders ?? options.discoverVoiceProviders ?? defaultDiscoverVoiceProviders;
  const readCache = options.readVoiceDiscoveryCache ?? defaultReadVoiceDiscoveryCache;
  const mergeProviders = options.mergeVoiceProvidersWithCachedVoices ?? defaultMergeVoiceProvidersWithCachedVoices;
  const providers: VoiceProviderCandidate[] = [];
  const seen = new Set<string>();
  for (const providerWorkspacePath of agentRuntimeProviderDiscoveryWorkspacePaths(options)) {
    const workspaceProviders = await listProviders(providerWorkspacePath);
    const cache = await readCache(providerWorkspacePath);
    for (const provider of mergeProviders(workspaceProviders, cache)) {
      if (seen.has(provider.capabilityId)) continue;
      seen.add(provider.capabilityId);
      providers.push(provider);
    }
  }
  return providers;
}

export async function listEmbeddingProvidersForTools(
  options: AgentRuntimeProviderDiscoveryOptions,
  _workspacePath: string,
): Promise<EmbeddingProviderCandidate[]> {
  const listProviders = options.listEmbeddingProviders ?? options.discoverEmbeddingProviders ?? defaultDiscoverEmbeddingProviders;
  const providers: EmbeddingProviderCandidate[] = [];
  const seen = new Set<string>();
  for (const providerWorkspacePath of agentRuntimeProviderDiscoveryWorkspacePaths(options)) {
    const workspaceProviders = [
      ...await defaultDiscoverManagedMemoryEmbeddingProviders(providerWorkspacePath).catch(() => []),
      ...await listProviders(providerWorkspacePath),
    ];
    for (const provider of workspaceProviders) {
      if (seen.has(provider.capabilityId)) continue;
      seen.add(provider.capabilityId);
      providers.push(provider);
    }
  }
  return providers;
}

export async function listSttProvidersForTools(
  options: AgentRuntimeProviderDiscoveryOptions,
  workspacePath: string,
): Promise<SttProviderCandidate[]> {
  const listProviders = options.listSttProviders ?? options.discoverSttProviders ?? defaultDiscoverSttProviders;
  const readValidation = options.readSttValidationMetadata ?? defaultReadSttValidationMetadata;
  const mergeProviders = options.mergeSttProvidersWithValidation ?? defaultMergeSttProvidersWithValidation;
  const providers = await listProviders(workspacePath);
  const validation = await readValidation(workspacePath);
  return mergeProviders(providers, validation);
}
