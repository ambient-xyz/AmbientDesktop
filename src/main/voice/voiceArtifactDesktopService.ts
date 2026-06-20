import { rm } from "node:fs/promises";
import type {
  MessageVoiceArtifactInput,
  MessageVoiceState,
  RegenerateMessageVoiceInput,
  VoiceArtifactRetentionInput,
  VoiceArtifactRetentionSummary,
  VoiceArtifactPruneResult,
  VoiceSettings,
} from "../../shared/localRuntimeTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceMediaUrlInput } from "../../shared/workspaceMedia";
import {
  clearManagedVoiceArtifacts,
  clearManagedVoiceArtifactsSync,
  inspectVoiceArtifactRetention,
  pruneManagedVoiceArtifactsToBudget,
  pruneVoiceArtifactOrphans,
  type VoiceArtifactRetentionRequest,
} from "./voiceArtifacts";
import {
  regenerateMessageVoiceState,
  type RegenerateMessageVoiceStore,
  type VoiceRuntimeSummaryOptions,
} from "./voiceRuntime";
import type { AmbientCliVoiceRunner } from "./voiceProvider";

export interface VoiceArtifactDesktopStore extends RegenerateMessageVoiceStore {
  clearMessageVoiceArtifact(messageId: string, error?: string): MessageVoiceState;
  getWorkspace(): { path: string };
  getWorkspaceIfOpen(): { path: string } | undefined;
  listMessageVoiceStates(threadId: string): MessageVoiceState[];
  listThreads(): ThreadSummary[];
}

export interface VoiceArtifactDesktopHost<Store extends VoiceArtifactDesktopStore = VoiceArtifactDesktopStore> {
  workspacePath: string;
  store: Store;
}

export interface VoiceArtifactDesktopServiceDependencies<
  Host extends VoiceArtifactDesktopHost<Store>,
  Store extends VoiceArtifactDesktopStore,
> {
  activeProjectRuntimeHost(): Host;
  activeStore(): Store | undefined;
  activeThreadIdForHost(host: Host): string;
  activeWorkspacePath(): string;
  artifactCacheMaxBytes(): number;
  createMediaUrl(input: WorkspaceMediaUrlInput): string;
  emitProjectStateIfActive(host: Host): void;
  emitRuntimeFeatureStateUpdated(store: Store): void;
  getVoiceSettings(): VoiceSettings;
  projectRuntimeHostList(): Host[];
  providerSummaryForThread(thread: ThreadSummary): VoiceRuntimeSummaryOptions | undefined;
  removeFile?(path: string, options: { force: boolean }): Promise<void>;
  requireProjectRuntimeHostForMessageVoiceState(messageId: string): Host;
  requireProjectRuntimeHostForThread(threadId: string): Host;
  resolveVoiceProviderWorkspacePath(providerCapabilityId: string | undefined, targetStore: Store): Promise<string>;
  resolveWorkspacePath(workspacePath: string, relativePath: string): string;
  runner: AmbientCliVoiceRunner;
  shouldEmitRuntimeFeatureStateUpdated(): boolean;
  showItemInFolder(path: string): void;
  warn(message: string): void;
  artifacts?: {
    clearManagedVoiceArtifacts(workspacePath: string): Promise<VoiceArtifactPruneResult>;
    clearManagedVoiceArtifactsSync(workspacePath: string): string[];
    inspectVoiceArtifactRetention(input: VoiceArtifactRetentionRequest): Promise<VoiceArtifactRetentionSummary>;
    pruneManagedVoiceArtifactsToBudget(input: { workspacePath: string; maxBytes: number }): Promise<VoiceArtifactPruneResult>;
    pruneVoiceArtifactOrphans(input: VoiceArtifactRetentionRequest): Promise<VoiceArtifactPruneResult>;
  };
  regenerateMessageVoiceState?: typeof regenerateMessageVoiceState;
}

export interface VoiceArtifactDesktopService<
  Host extends VoiceArtifactDesktopHost<Store>,
  Store extends VoiceArtifactDesktopStore,
> {
  clearManagedVoiceArtifactCache(reason: string, workspacePath?: string, targetStore?: Store): Promise<void>;
  clearManagedVoiceArtifactCachesForRuntimeHostsSync(reason: string): void;
  clearMessageVoiceArtifact(input: MessageVoiceArtifactInput): Promise<MessageVoiceState>;
  enforceVoiceArtifactBudget(workspacePath?: string, targetStore?: Store): Promise<void>;
  inspectVoiceArtifacts(input?: VoiceArtifactRetentionInput, host?: Host): Promise<VoiceArtifactRetentionSummary>;
  pruneVoiceArtifacts(input?: VoiceArtifactRetentionInput, host?: Host): Promise<VoiceArtifactPruneResult>;
  regenerateMessageVoice(input: RegenerateMessageVoiceInput): Promise<MessageVoiceState>;
  revealMessageVoiceArtifact(input: MessageVoiceArtifactInput): void;
}

export function createVoiceArtifactDesktopService<
  Host extends VoiceArtifactDesktopHost<Store>,
  Store extends VoiceArtifactDesktopStore,
>({
  activeProjectRuntimeHost,
  activeStore,
  activeThreadIdForHost,
  activeWorkspacePath,
  artifactCacheMaxBytes,
  createMediaUrl,
  emitProjectStateIfActive,
  emitRuntimeFeatureStateUpdated,
  getVoiceSettings,
  projectRuntimeHostList,
  providerSummaryForThread,
  removeFile = (path, options) => rm(path, options),
  requireProjectRuntimeHostForMessageVoiceState,
  requireProjectRuntimeHostForThread,
  resolveVoiceProviderWorkspacePath,
  resolveWorkspacePath,
  runner,
  shouldEmitRuntimeFeatureStateUpdated,
  showItemInFolder,
  warn,
  artifacts = {
    clearManagedVoiceArtifacts,
    clearManagedVoiceArtifactsSync,
    inspectVoiceArtifactRetention,
    pruneManagedVoiceArtifactsToBudget,
    pruneVoiceArtifactOrphans,
  },
  regenerateMessageVoiceState: regenerate = regenerateMessageVoiceState,
}: VoiceArtifactDesktopServiceDependencies<Host, Store>): VoiceArtifactDesktopService<Host, Store> {
  async function regenerateMessageVoice(input: RegenerateMessageVoiceInput): Promise<MessageVoiceState> {
    const host = requireProjectRuntimeHostForMessageVoiceState(input.messageId);
    const targetStore = host.store;
    const settings = getVoiceSettings();
    const result = await regenerate({
      messageId: input.messageId,
      packageWorkspacePath: await resolveVoiceProviderWorkspacePath(settings.providerCapabilityId, targetStore),
      settings,
      store: targetStore,
      runner,
      createMediaUrl,
      summaryForThread: providerSummaryForThread,
      onStateUpdated: () => emitProjectStateIfActive(host),
    });
    await enforceVoiceArtifactBudget(targetStore.getThread(result.threadId).workspacePath, targetStore);
    emitProjectStateIfActive(host);
    return result;
  }

  function revealMessageVoiceArtifact(input: MessageVoiceArtifactInput): void {
    const host = requireProjectRuntimeHostForMessageVoiceState(input.messageId);
    const voiceState = host.store.getMessageVoiceState(input.messageId);
    if (!voiceState?.audioPath) throw new Error(`Voice artifact not found for message: ${input.messageId}`);
    showItemInFolder(resolveManagedVoiceArtifactPath(voiceState.audioPath, host.store.getWorkspace().path));
  }

  async function clearMessageVoiceArtifact(input: MessageVoiceArtifactInput): Promise<MessageVoiceState> {
    const host = requireProjectRuntimeHostForMessageVoiceState(input.messageId);
    const voiceState = host.store.getMessageVoiceState(input.messageId);
    if (!voiceState?.audioPath) throw new Error(`Voice artifact not found for message: ${input.messageId}`);
    await removeFile(resolveManagedVoiceArtifactPath(voiceState.audioPath, host.store.getWorkspace().path), { force: true });
    const cleared = host.store.clearMessageVoiceArtifact(input.messageId);
    emitProjectStateIfActive(host);
    return cleared;
  }

  function inspectVoiceArtifacts(input: VoiceArtifactRetentionInput = {}, host = hostForRetentionInput(input)): Promise<VoiceArtifactRetentionSummary> {
    return artifacts.inspectVoiceArtifactRetention(voiceArtifactRetentionInput(input, host));
  }

  async function pruneVoiceArtifacts(input: VoiceArtifactRetentionInput = {}, host = hostForRetentionInput(input)): Promise<VoiceArtifactPruneResult> {
    const pruned = await artifacts.pruneVoiceArtifactOrphans(voiceArtifactRetentionInput(input, host));
    clearVoiceStatesForDeletedArtifacts(pruned.deletedPreview, "Voice artifact cache removed this audio file.", host.store);
    emitProjectStateIfActive(host);
    return pruned;
  }

  async function clearManagedVoiceArtifactCache(
    reason: string,
    workspacePath = activeWorkspacePath(),
    targetStore: Store = activeProjectRuntimeHost().store,
  ): Promise<void> {
    try {
      const result = await artifacts.clearManagedVoiceArtifacts(workspacePath);
      clearVoiceStatesForDeletedArtifacts(result.deletedPreview, `Voice artifact cache cleared on ${reason}.`, targetStore);
      if (result.deletedFileCount > 0 && shouldEmitRuntimeFeatureStateUpdated()) {
        emitRuntimeFeatureStateUpdated(targetStore);
      }
    } catch (error) {
      warn(`Failed to clear managed voice artifact cache on ${reason}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function clearManagedVoiceArtifactCachesForRuntimeHostsSync(reason: string): void {
    const hosts = projectRuntimeHostList();
    if (hosts.length === 0) {
      const targetStore = activeStore();
      const workspacePath = targetStore?.getWorkspaceIfOpen()?.path;
      if (workspacePath && targetStore) clearManagedVoiceArtifactCacheSync(reason, workspacePath, targetStore);
      return;
    }
    for (const host of hosts) clearManagedVoiceArtifactCacheSync(reason, host.workspacePath, host.store);
  }

  async function enforceVoiceArtifactBudget(workspacePath = activeWorkspacePath(), targetStore: Store = activeProjectRuntimeHost().store): Promise<void> {
    try {
      const result = await artifacts.pruneManagedVoiceArtifactsToBudget({ workspacePath, maxBytes: artifactCacheMaxBytes() });
      clearVoiceStatesForDeletedArtifacts(result.deletedPreview, "Voice artifact cache limit removed this audio file.", targetStore);
      if (result.deletedFileCount > 0 && shouldEmitRuntimeFeatureStateUpdated()) {
        emitRuntimeFeatureStateUpdated(targetStore);
      }
    } catch (error) {
      warn(`Failed to enforce managed voice artifact cache budget: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function hostForRetentionInput(input: VoiceArtifactRetentionInput): Host {
    return input.threadId ? requireProjectRuntimeHostForThread(input.threadId) : activeProjectRuntimeHost();
  }

  function voiceArtifactRetentionInput(input: VoiceArtifactRetentionInput, host: Host): VoiceArtifactRetentionRequest {
    const targetStore = host.store;
    const threadId = input.threadId ?? activeThreadIdForHost(host);
    const thread = targetStore.getThread(threadId);
    return {
      workspacePath: thread.workspacePath,
      threadId,
      providerCapabilityId: input.providerCapabilityId,
      voiceStates: targetStore.listMessageVoiceStates(threadId),
    };
  }

  function clearManagedVoiceArtifactCacheSync(reason: string, workspacePath: string, targetStore: Store): void {
    try {
      const deletedPaths = artifacts.clearManagedVoiceArtifactsSync(workspacePath);
      clearVoiceStatesForDeletedArtifacts(deletedPaths, `Voice artifact cache cleared on ${reason}.`, targetStore);
    } catch (error) {
      warn(`Failed to clear managed voice artifact cache on ${reason}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function clearVoiceStatesForDeletedArtifacts(deletedPaths: string[], error: string, targetStore: Store): void {
    if (deletedPaths.length === 0) return;
    const deleted = new Set(deletedPaths.map(normalizeManagedVoiceArtifactReference));
    for (const thread of targetStore.listThreads()) {
      for (const voiceState of targetStore.listMessageVoiceStates(thread.id)) {
        if (!voiceState.audioPath || !deleted.has(normalizeManagedVoiceArtifactReference(voiceState.audioPath))) continue;
        targetStore.clearMessageVoiceArtifact(voiceState.messageId, error);
      }
    }
  }

  function resolveManagedVoiceArtifactPath(audioPath: string, workspacePath = activeWorkspacePath()): string {
    const normalized = normalizeManagedVoiceArtifactReference(audioPath);
    if (!normalized.startsWith(".ambient/voice/")) {
      throw new Error("Voice artifact is not in Ambient's managed voice directory.");
    }
    return resolveWorkspacePath(workspacePath, normalized);
  }

  return {
    clearManagedVoiceArtifactCache,
    clearManagedVoiceArtifactCachesForRuntimeHostsSync,
    clearMessageVoiceArtifact,
    enforceVoiceArtifactBudget,
    inspectVoiceArtifacts,
    pruneVoiceArtifacts,
    regenerateMessageVoice,
    revealMessageVoiceArtifact,
  };
}

function normalizeManagedVoiceArtifactReference(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}
