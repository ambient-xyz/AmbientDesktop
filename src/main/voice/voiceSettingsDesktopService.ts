import { resolve } from "node:path";
import type { UpdateVoiceSettingsInput } from "../../shared/desktopTypes";
import type {
  EmbeddingProviderCandidate,
  RefreshVoiceProviderVoicesInput,
  RefreshVoiceProviderVoicesResult,
  VoiceProviderCandidate,
  VoiceSettings,
  VoiceSettingsAuditChange,
  VoiceSettingsAuditEntry,
  VoiceSettingsAuditSource,
} from "../../shared/localRuntimeTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import {
  discoverAmbientCliEmbeddingProviders,
  discoverAmbientCliVoiceProviders,
  hasAmbientCliWorkspaceProviderDiscoverySignal,
  runAmbientCliPackageCommand,
} from "./voiceAmbientCliFacade";
import { writeVoiceSettings as writeVoiceSettingsFile, DEFAULT_VOICE_SETTINGS } from "../desktop-shell/appAppearanceDefaultPreferences";
import { discoverAmbientMemoryEmbeddingProviders } from "../memory/tencentdb/managedEmbeddingProvider";
import {
  mergeVoiceProvidersWithCachedVoices,
  readVoiceDiscoveryCache,
  refreshVoiceProviderVoices,
  type VoiceDiscoveryCache,
  type VoiceDiscoveryRunner,
  type VoiceRefreshResult,
} from "./voiceDiscoveryCache";

export interface VoiceSettingsDesktopStore {
  getWorkspace(): { path: string };
  listThreads(): ThreadSummary[];
}

export interface VoiceSettingsAuditContext {
  source: VoiceSettingsAuditSource;
  toolName?: string;
  threadId?: string;
  summary?: string;
}

export interface VoiceSettingsUpdateOptions<Store extends VoiceSettingsDesktopStore> {
  onStateUpdated?: () => void;
  providerStore?: Store;
  workspacePath?: string;
}

export interface VoiceSettingsDesktopProviders {
  discoverAmbientCliVoiceProviders(workspacePath: string): Promise<VoiceProviderCandidate[]>;
  discoverAmbientMemoryEmbeddingProviders(workspacePath: string): Promise<EmbeddingProviderCandidate[]>;
  discoverAmbientCliEmbeddingProviders(workspacePath: string): Promise<EmbeddingProviderCandidate[]>;
  readVoiceDiscoveryCache(workspacePath: string): Promise<VoiceDiscoveryCache>;
  mergeVoiceProvidersWithCachedVoices(providers: VoiceProviderCandidate[], cache: VoiceDiscoveryCache): VoiceProviderCandidate[];
  refreshVoiceProviderVoices(
    workspacePath: string,
    providers: VoiceProviderCandidate[],
    input: RefreshVoiceProviderVoicesInput,
    runner: VoiceDiscoveryRunner,
  ): Promise<VoiceRefreshResult>;
}

export interface VoiceSettingsDesktopServiceDependencies<Store extends VoiceSettingsDesktopStore> {
  activeWorkspacePath(): string;
  defaultStore(): Store;
  emitDesktopState(): void;
  enforceVoiceArtifactBudget(workspacePath: string, store: Store): Promise<void>;
  initialSettings?: VoiceSettings;
  initialAudit?: VoiceSettingsAuditEntry[];
  now?: () => Date;
  randomId?: () => string;
  runner?: VoiceDiscoveryRunner;
  settingsPath(): string;
  writeVoiceSettings?(path: string, settings: VoiceSettings): Promise<void>;
  providers?: VoiceSettingsDesktopProviders;
}

export interface VoiceSettingsDesktopService<Store extends VoiceSettingsDesktopStore> {
  readVoiceSettings(): VoiceSettings;
  setVoiceSettings(settings: VoiceSettings): VoiceSettings;
  listVoiceSettingsAudit(): VoiceSettingsAuditEntry[];
  updateVoiceSettings(
    input: UpdateVoiceSettingsInput,
    audit?: VoiceSettingsAuditContext,
    options?: VoiceSettingsUpdateOptions<Store>,
  ): Promise<VoiceSettings>;
  listVoiceProviders(workspacePath: string): Promise<VoiceProviderCandidate[]>;
  listVoiceProvidersWithCachedVoices(targetStore?: Store): Promise<VoiceProviderCandidate[]>;
  listEmbeddingProvidersForSettings(targetStore?: Store): Promise<EmbeddingProviderCandidate[]>;
  voiceProviderWorkspacePaths(targetStore?: Store): string[];
  resolveVoiceProviderWorkspacePath(providerCapabilityId: string | undefined, targetStore?: Store): Promise<string>;
  refreshVoiceProviderCatalog(input: RefreshVoiceProviderVoicesInput, targetStore?: Store): Promise<RefreshVoiceProviderVoicesResult>;
}

const defaultProviders: VoiceSettingsDesktopProviders = {
  discoverAmbientCliVoiceProviders,
  discoverAmbientMemoryEmbeddingProviders,
  discoverAmbientCliEmbeddingProviders,
  readVoiceDiscoveryCache,
  mergeVoiceProvidersWithCachedVoices,
  refreshVoiceProviderVoices,
};

export function createVoiceSettingsDesktopService<Store extends VoiceSettingsDesktopStore>({
  activeWorkspacePath,
  defaultStore,
  emitDesktopState,
  enforceVoiceArtifactBudget,
  initialSettings = DEFAULT_VOICE_SETTINGS,
  initialAudit = [],
  now = () => new Date(),
  randomId = () => Math.random().toString(36).slice(2, 8),
  runner = runAmbientCliPackageCommand,
  settingsPath,
  writeVoiceSettings = writeVoiceSettingsFile,
  providers = defaultProviders,
}: VoiceSettingsDesktopServiceDependencies<Store>): VoiceSettingsDesktopService<Store> {
  let voiceSettings = initialSettings;
  let voiceSettingsAudit = initialAudit;

  function readVoiceSettings(): VoiceSettings {
    return voiceSettings;
  }

  function setVoiceSettings(settings: VoiceSettings): VoiceSettings {
    voiceSettings = settings;
    return voiceSettings;
  }

  function listVoiceSettingsAudit(): VoiceSettingsAuditEntry[] {
    return voiceSettingsAudit;
  }

  async function updateVoiceSettings(
    input: UpdateVoiceSettingsInput,
    audit: VoiceSettingsAuditContext = { source: "settings-ui" },
    options: VoiceSettingsUpdateOptions<Store> = {},
  ): Promise<VoiceSettings> {
    const targetStore = options.providerStore ?? defaultStore();
    const selectedProviderAvailable = input.providerCapabilityId
      ? (await listVoiceProvidersWithCachedVoices(targetStore)).some(
        (provider) => provider.capabilityId === input.providerCapabilityId && provider.available,
      )
      : false;
    const firstProviderSetup = selectedProviderAvailable && !voiceSettings.providerCapabilityId;
    const previousSettings = voiceSettings;
    const preferredVoicesByProvider = {
      ...(voiceSettings.preferredVoicesByProvider ?? {}),
      ...(input.preferredVoicesByProvider ?? {}),
      ...(input.providerCapabilityId && input.voiceId ? { [input.providerCapabilityId]: input.voiceId } : {}),
    };
    voiceSettings = {
      enabled: selectedProviderAvailable && (input.enabled || firstProviderSetup),
      mode: input.mode,
      autoplay: selectedProviderAvailable && (input.autoplay || firstProviderSetup),
      ...(input.providerCapabilityId ? { providerCapabilityId: input.providerCapabilityId } : {}),
      ...(input.voiceId ? { voiceId: input.voiceId } : {}),
      ...(Object.keys(preferredVoicesByProvider).length ? { preferredVoicesByProvider } : {}),
      maxChars: input.maxChars,
      longReply: input.longReply,
      format: input.format,
      artifactCacheMaxMb: input.artifactCacheMaxMb,
    };
    recordVoiceSettingsAudit(previousSettings, voiceSettings, audit);
    await writeVoiceSettings(settingsPath(), voiceSettings);
    await enforceVoiceArtifactBudget(options.workspacePath ?? activeWorkspacePath(), targetStore);
    if (options.onStateUpdated) options.onStateUpdated();
    else emitDesktopState();
    return voiceSettings;
  }

  function listVoiceProviders(workspacePath: string): Promise<VoiceProviderCandidate[]> {
    return providers.discoverAmbientCliVoiceProviders(workspacePath);
  }

  async function listVoiceProvidersWithCachedVoices(targetStore: Store = defaultStore()): Promise<VoiceProviderCandidate[]> {
    const voiceProviders: VoiceProviderCandidate[] = [];
    const seen = new Set<string>();
    for (const workspacePath of voiceProviderWorkspacePaths(targetStore)) {
      const workspaceProviders = await providers.discoverAmbientCliVoiceProviders(workspacePath);
      const cache = await providers.readVoiceDiscoveryCache(workspacePath);
      for (const provider of providers.mergeVoiceProvidersWithCachedVoices(workspaceProviders, cache)) {
        if (seen.has(provider.capabilityId)) continue;
        seen.add(provider.capabilityId);
        voiceProviders.push(provider);
      }
    }
    return voiceProviders;
  }

  async function listEmbeddingProvidersForSettings(targetStore: Store = defaultStore()): Promise<EmbeddingProviderCandidate[]> {
    const embeddingProviders: EmbeddingProviderCandidate[] = [];
    const seen = new Set<string>();
    for (const workspacePath of voiceProviderWorkspacePaths(targetStore)) {
      const workspaceProviders = [
        ...await providers.discoverAmbientMemoryEmbeddingProviders(workspacePath).catch(() => []),
        ...await providers.discoverAmbientCliEmbeddingProviders(workspacePath).catch(() => []),
      ];
      for (const provider of workspaceProviders) {
        if (seen.has(provider.capabilityId)) continue;
        seen.add(provider.capabilityId);
        embeddingProviders.push(provider);
      }
    }
    return embeddingProviders;
  }

  function voiceProviderWorkspacePaths(targetStore: Store = defaultStore()): string[] {
    const rootWorkspacePath = targetStore.getWorkspace().path;
    const workspacePaths: string[] = [];
    const seenDiscoveryRoots = new Set<string>();
    for (const workspacePath of [rootWorkspacePath, ...targetStore.listThreads().map((thread) => thread.workspacePath)]) {
      const discoveryRoot = voiceProviderDiscoveryRoot(workspacePath);
      if (seenDiscoveryRoots.has(discoveryRoot)) continue;
      if (workspacePath !== rootWorkspacePath && !voiceProviderHasPackageConfig(workspacePath)) continue;
      seenDiscoveryRoots.add(discoveryRoot);
      workspacePaths.push(workspacePath);
    }
    return workspacePaths;
  }

  async function resolveVoiceProviderWorkspacePath(
    providerCapabilityId: string | undefined,
    targetStore: Store = defaultStore(),
  ): Promise<string> {
    if (!providerCapabilityId) return targetStore.getWorkspace().path;
    for (const workspacePath of voiceProviderWorkspacePaths(targetStore)) {
      const workspaceProviders = await providers.discoverAmbientCliVoiceProviders(workspacePath);
      if (workspaceProviders.some((provider) => provider.capabilityId === providerCapabilityId)) return workspacePath;
    }
    return targetStore.getWorkspace().path;
  }

  async function refreshVoiceProviderCatalog(
    input: RefreshVoiceProviderVoicesInput,
    targetStore: Store = defaultStore(),
  ): Promise<RefreshVoiceProviderVoicesResult> {
    const workspacePath = await resolveVoiceProviderWorkspacePath(input.providerCapabilityId, targetStore);
    const workspaceProviders = await providers.discoverAmbientCliVoiceProviders(workspacePath);
    const result = await providers.refreshVoiceProviderVoices(workspacePath, workspaceProviders, input, runner);
    return {
      providerCapabilityId: result.provider.capabilityId,
      providerLabel: result.provider.label,
      ...(result.entry.source ? { source: result.entry.source } : {}),
      refreshedAt: result.entry.refreshedAt,
      ...(result.entry.expiresAt ? { expiresAt: result.entry.expiresAt } : {}),
      voiceCount: result.entry.voiceCount,
      durationMs: result.durationMs,
      ...(result.stdoutArtifactPath ? { stdoutArtifactPath: result.stdoutArtifactPath } : {}),
      ...(result.stderrArtifactPath ? { stderrArtifactPath: result.stderrArtifactPath } : {}),
    };
  }

  function recordVoiceSettingsAudit(previous: VoiceSettings, next: VoiceSettings, audit: VoiceSettingsAuditContext): void {
    const changes = voiceSettingsChanges(previous, next);
    if (changes.length === 0) return;
    const entry: VoiceSettingsAuditEntry = {
      id: `voice-settings-${now().getTime().toString(36)}-${randomId()}`,
      createdAt: now().toISOString(),
      source: audit.source,
      summary: audit.summary ?? voiceSettingsAuditSummary(audit.source, changes),
      changes,
      ...(audit.toolName ? { toolName: audit.toolName } : {}),
      ...(audit.threadId ? { threadId: audit.threadId } : {}),
    };
    voiceSettingsAudit = [entry, ...voiceSettingsAudit].slice(0, 20);
  }

  return {
    listEmbeddingProvidersForSettings,
    listVoiceProviders,
    listVoiceProvidersWithCachedVoices,
    listVoiceSettingsAudit,
    readVoiceSettings,
    refreshVoiceProviderCatalog,
    resolveVoiceProviderWorkspacePath,
    setVoiceSettings,
    updateVoiceSettings,
    voiceProviderWorkspacePaths,
  };
}

function voiceSettingsChanges(previous: VoiceSettings, next: VoiceSettings): VoiceSettingsAuditChange[] {
  const fields: Array<keyof VoiceSettings> = [
    "enabled",
    "mode",
    "autoplay",
    "providerCapabilityId",
    "voiceId",
    "preferredVoicesByProvider",
    "maxChars",
    "longReply",
    "format",
    "artifactCacheMaxMb",
  ];
  return fields.flatMap((field) => {
    const previousValue = previous[field];
    const nextValue = next[field];
    if (previousValue === nextValue) return [];
    return [{
      field,
      ...(previousValue !== undefined ? { previous: String(previousValue) } : {}),
      ...(nextValue !== undefined ? { next: String(nextValue) } : {}),
    }];
  });
}

function voiceSettingsAuditSummary(source: VoiceSettingsAuditSource, changes: VoiceSettingsAuditChange[]): string {
  const fieldList = changes.map((change) => change.field).join(", ");
  return source === "chat-tool"
    ? `Chat updated voice settings: ${fieldList}.`
    : source === "settings-ui"
      ? `Settings updated voice settings: ${fieldList}.`
      : `Ambient updated voice settings: ${fieldList}.`;
}

function voiceProviderDiscoveryRoot(workspacePath: string): string {
  return resolve(workspacePath);
}

function voiceProviderHasPackageConfig(workspacePath: string): boolean {
  return hasAmbientCliWorkspaceProviderDiscoverySignal(workspacePath);
}
