import type { AmbientPermissionGrant, PermissionMode, PermissionRequest } from "../../shared/permissionTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import {
  resolvePermissionWithGrants as defaultResolvePermissionWithGrants,
  type PermissionGrantResolution,
  type PermissionPromptRequester,
} from "./permissionGrants";
import type { ProjectStore as PermissionGrantProjectStore } from "./permissionsProjectStoreFacade";

export interface PermissionGrantRegistryHost<Store extends PermissionGrantProjectStore> {
  store: Store;
}

export interface RequestPermissionWithGrantRegistryInput<Store extends PermissionGrantProjectStore> {
  thread?: ThreadSummary;
  permissionMode?: PermissionMode;
  workspacePath?: string;
  workflowThreadId?: string;
  store?: Store;
  requireFreshPrompt?: boolean;
}

export interface PermissionGrantRegistryDesktopServiceDependencies<
  Store extends PermissionGrantProjectStore,
  Host extends PermissionGrantRegistryHost<Store>,
> {
  defaultStore(): Store;
  activeThreadId(): string;
  activeThreadIdForHost(host: Host): string;
  initialActiveThreadIdForStore(store: Store): string;
  projectRuntimeHostForStore(store: Store): Host | undefined;
  requester: PermissionPromptRequester;
  emitPermissionGrantCreated(grant: AmbientPermissionGrant, workspacePath: string): void;
  resolvePermissionWithGrants?: typeof defaultResolvePermissionWithGrants;
}

export interface PermissionGrantRegistryDesktopService<Store extends PermissionGrantProjectStore> {
  requestPermissionWithGrantRegistry(
    request: Omit<PermissionRequest, "id">,
    input?: RequestPermissionWithGrantRegistryInput<Store>,
  ): Promise<PermissionGrantResolution>;
}

export function createPermissionGrantRegistryDesktopService<
  Store extends PermissionGrantProjectStore,
  Host extends PermissionGrantRegistryHost<Store>,
>(
  dependencies: PermissionGrantRegistryDesktopServiceDependencies<Store, Host>,
): PermissionGrantRegistryDesktopService<Store> {
  const resolvePermissionWithGrants = dependencies.resolvePermissionWithGrants ?? defaultResolvePermissionWithGrants;

  async function requestPermissionWithGrantRegistry(
    request: Omit<PermissionRequest, "id">,
    input: RequestPermissionWithGrantRegistryInput<Store> = {},
  ): Promise<PermissionGrantResolution> {
    const defaultStore = dependencies.defaultStore();
    const targetStore = input.store ?? defaultStore;
    const host = dependencies.projectRuntimeHostForStore(targetStore);
    const fallbackThreadId = host
      ? dependencies.activeThreadIdForHost(host)
      : targetStore === defaultStore
        ? dependencies.activeThreadId()
        : dependencies.initialActiveThreadIdForStore(targetStore);
    const thread = input.thread ?? targetStore.getThread(request.threadId || fallbackThreadId);
    const resolution = await resolvePermissionWithGrants({
      store: targetStore,
      requester: dependencies.requester,
      request,
      context: {
        permissionMode: input.permissionMode ?? thread.permissionMode,
        threadId: request.threadId || thread.id,
        workflowThreadId: request.workflowThreadId ?? input.workflowThreadId,
        projectPath: targetStore.getWorkspace().path,
        workspacePath: request.workspacePath ?? input.workspacePath ?? thread.workspacePath,
      },
      requireFreshPrompt: input.requireFreshPrompt,
    });
    if (resolution.grant && resolution.decisionSource !== "persistent_grant") {
      dependencies.emitPermissionGrantCreated(resolution.grant, targetStore.getWorkspace().path);
    }
    return resolution;
  }

  return {
    requestPermissionWithGrantRegistry,
  };
}
