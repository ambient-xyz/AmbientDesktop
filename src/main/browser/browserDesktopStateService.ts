export interface BrowserDesktopStateBrowser<State> {
  getState(): Promise<State> | State;
}

export type BrowserPermissionAuditRisk = "browser-control" | "browser-profile";

export type BrowserPermissionAuditInput<Thread extends { permissionMode: unknown }> = {
  threadId: string;
  permissionMode: Thread["permissionMode"];
  toolName: string;
  risk: BrowserPermissionAuditRisk;
  decision: "allowed";
  detail: string;
  reason: string;
};

export interface BrowserDesktopStateStore<Thread extends { permissionMode: unknown }, AuditEntry> {
  getThread(threadId: string): Thread;
  addPermissionAudit(input: BrowserPermissionAuditInput<Thread>): AuditEntry;
}

export interface BrowserDesktopStateHost<Store, State> {
  workspacePath: string;
  store: Store;
  browserService: BrowserDesktopStateBrowser<State>;
}

export type BrowserUpdatedDesktopEvent<State> = {
  type: "browser-updated";
  state: State;
  workspacePath: string;
};

export interface BrowserDesktopStateServiceDependencies<
  Host,
  AuditEntry,
  State,
> {
  activeHost(): Host;
  activeThreadIdForHost(host: Host): string;
  emitDesktopEvent(event: BrowserUpdatedDesktopEvent<State>): void;
  emitPermissionAuditCreated(entry: AuditEntry, workspacePath: string): void;
}

export interface BrowserDesktopStateService<Host> {
  emitBrowserState(): Promise<void>;
  emitBrowserStateForHost(host: Host): Promise<void>;
  recordBrowserControlAudit(host: Host, toolName: string, detail: string, reason: string): void;
  recordBrowserProfileAudit(host: Host, detail: string, reason: string): void;
  withBrowserState<T>(host: Host, operation: Promise<T>): Promise<T>;
}

export function createBrowserDesktopStateService<
  Thread extends { permissionMode: unknown },
  AuditEntry,
  State,
  Store extends BrowserDesktopStateStore<Thread, AuditEntry>,
  Host extends BrowserDesktopStateHost<Store, State>,
>(
  dependencies: BrowserDesktopStateServiceDependencies<Host, AuditEntry, State>,
): BrowserDesktopStateService<Host> {
  async function emitBrowserStateForHost(host: Host): Promise<void> {
    dependencies.emitDesktopEvent({
      type: "browser-updated",
      state: await host.browserService.getState(),
      workspacePath: host.workspacePath,
    });
  }

  function recordBrowserAudit(
    host: Host,
    toolName: string,
    risk: BrowserPermissionAuditRisk,
    detail: string,
    reason: string,
  ): void {
    const threadId = dependencies.activeThreadIdForHost(host);
    const thread = host.store.getThread(threadId);
    const entry = host.store.addPermissionAudit({
      threadId,
      permissionMode: thread.permissionMode,
      toolName,
      risk,
      decision: "allowed",
      detail,
      reason,
    });
    dependencies.emitPermissionAuditCreated(entry, host.workspacePath);
  }

  return {
    async emitBrowserState(): Promise<void> {
      await emitBrowserStateForHost(dependencies.activeHost());
    },
    emitBrowserStateForHost,
    recordBrowserControlAudit(host, toolName, detail, reason): void {
      recordBrowserAudit(host, toolName, "browser-control", detail, reason);
    },
    recordBrowserProfileAudit(host, detail, reason): void {
      recordBrowserAudit(host, "browser_profile", "browser-profile", detail, reason);
    },
    async withBrowserState<T>(host: Host, operation: Promise<T>): Promise<T> {
      try {
        const result = await operation;
        await emitBrowserStateForHost(host);
        return result;
      } catch (error) {
        await emitBrowserStateForHost(host).catch(() => undefined);
        throw error;
      }
    },
  };
}
