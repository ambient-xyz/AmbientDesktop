import type {
  AmbientWorkflowPlaybookDescription,
  AmbientWorkflowPlaybookInjection,
  AmbientWorkflowsArchiveInput,
  AmbientWorkflowsDescribeInput,
  AmbientWorkflowsInjectInput,
  AmbientWorkflowsSearchInput,
  AmbientWorkflowsSearchResponse,
  AmbientWorkflowsRestoreVersionInput,
  AmbientWorkflowsUnarchiveInput,
  AmbientWorkflowsUpdateInput,
} from "./workflowRecordingAmbientFacade";
import type {
  SearchWorkflowRecordingsInput,
  WorkflowAgentFolderSummary,
  WorkflowRecordingLibraryEntry,
} from "../../shared/workflowTypes";
import {
  listWorkflowAgentFoldersAcrossStores,
  listWorkflowRecordingLibraryAcrossStores,
  searchAmbientWorkflowPlaybooksAcrossStores,
  type WorkflowRecordingLibraryStore,
} from "./workflowRecordingGlobalLibrary";

export interface WorkflowRecordingGlobalLibraryStore extends WorkflowRecordingLibraryStore {
  getWorkspace(): { path: string };
}

export interface WorkflowRecordingGlobalLibraryHost<Store extends WorkflowRecordingGlobalLibraryStore> {
  workspacePath: string;
  store: Store;
  activeThreadId: string;
}

export interface WorkflowRecordingGlobalLibraryProbeStore<Store extends WorkflowRecordingGlobalLibraryStore> {
  store: Store;
  openWorkspace(workspacePath: string, options: { recoverActiveRuns: false; recoverOrchestrationRuns: false }): { path: string };
  close(): void;
}

export interface WorkflowRecordingGlobalLibraryStoreRef<Store extends WorkflowRecordingGlobalLibraryStore> {
  workspacePath: string;
  store: Store;
  dispose?: () => void;
}

export interface WorkflowRecordingGlobalLibraryDesktopServiceDependencies<
  Host extends WorkflowRecordingGlobalLibraryHost<Store>,
  Store extends WorkflowRecordingGlobalLibraryStore,
> {
  normalizeWorkspacePath(workspacePath: string): string;
  projectRuntimeHostList(): Host[];
  activeProjectRuntimeHost(): Host | undefined;
  activeStore(): Store | undefined;
  listRegisteredProjectPaths(): string[];
  existsSync(path: string): boolean;
  createProjectStore(): WorkflowRecordingGlobalLibraryProbeStore<Store>;
  requireProjectRuntimeHostForWorkflowRecording(workflowRecordingId: string): Host;
  emitWorkflowRecordingLibraryStateChanged(host: Host, threadId?: string): void;
  describeAmbientWorkflowPlaybook(store: Store, input: AmbientWorkflowsDescribeInput): AmbientWorkflowPlaybookDescription;
  injectAmbientWorkflowPlaybook(store: Store, input: AmbientWorkflowsInjectInput): AmbientWorkflowPlaybookInjection;
  updateAmbientWorkflowPlaybook(store: Store, input: AmbientWorkflowsUpdateInput): AmbientWorkflowPlaybookDescription;
  archiveAmbientWorkflowPlaybook(store: Store, input: AmbientWorkflowsArchiveInput): AmbientWorkflowPlaybookDescription;
  unarchiveAmbientWorkflowPlaybook(store: Store, input: AmbientWorkflowsUnarchiveInput): AmbientWorkflowPlaybookDescription;
  restoreAmbientWorkflowPlaybookVersion(store: Store, input: AmbientWorkflowsRestoreVersionInput): AmbientWorkflowPlaybookDescription;
  warn(message: string): void;
}

export interface WorkflowRecordingGlobalLibraryDesktopService {
  workflowGlobalStoreRefs(): WorkflowRecordingGlobalLibraryStoreRef<WorkflowRecordingGlobalLibraryStore>[];
  withWorkflowGlobalStores<T>(operation: (stores: WorkflowRecordingLibraryStore[]) => T): T;
  listGlobalWorkflowRecordingLibrary(input?: SearchWorkflowRecordingsInput): WorkflowRecordingLibraryEntry[];
  listGlobalWorkflowAgentFolders(): WorkflowAgentFolderSummary[];
  searchGlobalAmbientWorkflowPlaybooks(input?: AmbientWorkflowsSearchInput): AmbientWorkflowsSearchResponse;
  describeGlobalAmbientWorkflowPlaybook(input: AmbientWorkflowsDescribeInput): AmbientWorkflowPlaybookDescription;
  injectGlobalAmbientWorkflowPlaybook(input: AmbientWorkflowsInjectInput): AmbientWorkflowPlaybookInjection;
  updateGlobalAmbientWorkflowPlaybook(input: AmbientWorkflowsUpdateInput): AmbientWorkflowPlaybookDescription;
  archiveGlobalAmbientWorkflowPlaybook(input: AmbientWorkflowsArchiveInput): AmbientWorkflowPlaybookDescription;
  unarchiveGlobalAmbientWorkflowPlaybook(input: AmbientWorkflowsUnarchiveInput): AmbientWorkflowPlaybookDescription;
  restoreGlobalAmbientWorkflowPlaybookVersion(input: AmbientWorkflowsRestoreVersionInput): AmbientWorkflowPlaybookDescription;
}

export function createWorkflowRecordingGlobalLibraryDesktopService<
  Host extends WorkflowRecordingGlobalLibraryHost<Store>,
  Store extends WorkflowRecordingGlobalLibraryStore,
>({
  normalizeWorkspacePath,
  projectRuntimeHostList,
  activeProjectRuntimeHost,
  activeStore,
  listRegisteredProjectPaths,
  existsSync,
  createProjectStore,
  requireProjectRuntimeHostForWorkflowRecording,
  emitWorkflowRecordingLibraryStateChanged,
  describeAmbientWorkflowPlaybook,
  injectAmbientWorkflowPlaybook,
  updateAmbientWorkflowPlaybook,
  archiveAmbientWorkflowPlaybook,
  unarchiveAmbientWorkflowPlaybook,
  restoreAmbientWorkflowPlaybookVersion,
  warn,
}: WorkflowRecordingGlobalLibraryDesktopServiceDependencies<Host, Store>): WorkflowRecordingGlobalLibraryDesktopService {
  function workflowGlobalStoreRefs(): WorkflowRecordingGlobalLibraryStoreRef<Store>[] {
    const refs: WorkflowRecordingGlobalLibraryStoreRef<Store>[] = [];
    const seen = new Set<string>();
    const addRef = (workspacePath: string, targetStore: Store, dispose?: () => void): boolean => {
      const normalized = normalizeWorkspacePath(workspacePath);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      refs.push({ workspacePath: normalized, store: targetStore, ...(dispose ? { dispose } : {}) });
      return true;
    };

    for (const host of projectRuntimeHostList()) addRef(host.workspacePath, host.store);
    const activeHost = activeProjectRuntimeHost();
    if (activeHost) addRef(activeHost.workspacePath, activeHost.store);
    try {
      const currentStore = activeStore();
      if (currentStore) addRef(currentStore.getWorkspace().path, currentStore);
    } catch {
      // Store globals are not initialized during early startup.
    }

    for (const workspacePath of listRegisteredProjectPaths()) {
      const normalized = normalizeWorkspacePath(workspacePath);
      if (seen.has(normalized) || !existsSync(normalized)) continue;
      const targetStore = createProjectStore();
      try {
        const workspace = targetStore.openWorkspace(normalized, {
          recoverActiveRuns: false,
          recoverOrchestrationRuns: false,
        });
        if (!addRef(workspace.path, targetStore.store, () => targetStore.close())) targetStore.close();
      } catch (error) {
        targetStore.close();
        warn(`Failed to read registered workflow project ${normalized}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return refs;
  }

  function withWorkflowGlobalStores<T>(operation: (stores: WorkflowRecordingLibraryStore[]) => T): T {
    const refs = workflowGlobalStoreRefs();
    try {
      return operation(refs.map((ref) => ref.store));
    } finally {
      for (const ref of refs) ref.dispose?.();
    }
  }

  function listGlobalWorkflowRecordingLibrary(input: SearchWorkflowRecordingsInput = {}): WorkflowRecordingLibraryEntry[] {
    return withWorkflowGlobalStores((stores) => listWorkflowRecordingLibraryAcrossStores(stores, input));
  }

  function listGlobalWorkflowAgentFolders(): WorkflowAgentFolderSummary[] {
    return withWorkflowGlobalStores((stores) => listWorkflowAgentFoldersAcrossStores(stores));
  }

  function searchGlobalAmbientWorkflowPlaybooks(input: AmbientWorkflowsSearchInput = {}): AmbientWorkflowsSearchResponse {
    return withWorkflowGlobalStores((stores) => searchAmbientWorkflowPlaybooksAcrossStores(stores, input));
  }

  function describeGlobalAmbientWorkflowPlaybook(input: AmbientWorkflowsDescribeInput): AmbientWorkflowPlaybookDescription {
    const host = requireProjectRuntimeHostForWorkflowRecording(input.id) as Host;
    return describeAmbientWorkflowPlaybook(host.store, input);
  }

  function injectGlobalAmbientWorkflowPlaybook(input: AmbientWorkflowsInjectInput): AmbientWorkflowPlaybookInjection {
    const host = requireProjectRuntimeHostForWorkflowRecording(input.id) as Host;
    return injectAmbientWorkflowPlaybook(host.store, input);
  }

  function updateGlobalAmbientWorkflowPlaybook(input: AmbientWorkflowsUpdateInput): AmbientWorkflowPlaybookDescription {
    const host = requireProjectRuntimeHostForWorkflowRecording(input.id) as Host;
    const result = updateAmbientWorkflowPlaybook(host.store, input);
    emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
    return result;
  }

  function archiveGlobalAmbientWorkflowPlaybook(input: AmbientWorkflowsArchiveInput): AmbientWorkflowPlaybookDescription {
    const host = requireProjectRuntimeHostForWorkflowRecording(input.id) as Host;
    const result = archiveAmbientWorkflowPlaybook(host.store, input);
    emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
    return result;
  }

  function unarchiveGlobalAmbientWorkflowPlaybook(input: AmbientWorkflowsUnarchiveInput): AmbientWorkflowPlaybookDescription {
    const host = requireProjectRuntimeHostForWorkflowRecording(input.id) as Host;
    const result = unarchiveAmbientWorkflowPlaybook(host.store, input);
    emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
    return result;
  }

  function restoreGlobalAmbientWorkflowPlaybookVersion(input: AmbientWorkflowsRestoreVersionInput): AmbientWorkflowPlaybookDescription {
    const host = requireProjectRuntimeHostForWorkflowRecording(input.id) as Host;
    const result = restoreAmbientWorkflowPlaybookVersion(host.store, input);
    emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
    return result;
  }

  return {
    workflowGlobalStoreRefs: workflowGlobalStoreRefs as WorkflowRecordingGlobalLibraryDesktopService["workflowGlobalStoreRefs"],
    withWorkflowGlobalStores,
    listGlobalWorkflowRecordingLibrary,
    listGlobalWorkflowAgentFolders,
    searchGlobalAmbientWorkflowPlaybooks,
    describeGlobalAmbientWorkflowPlaybook,
    injectGlobalAmbientWorkflowPlaybook,
    updateGlobalAmbientWorkflowPlaybook,
    archiveGlobalAmbientWorkflowPlaybook,
    unarchiveGlobalAmbientWorkflowPlaybook,
    restoreGlobalAmbientWorkflowPlaybookVersion,
  };
}
