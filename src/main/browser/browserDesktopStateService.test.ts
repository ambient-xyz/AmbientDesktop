import { describe, expect, it, vi } from "vitest";
import {
  createBrowserDesktopStateService,
  type BrowserDesktopStateHost,
  type BrowserDesktopStateStore,
  type BrowserPermissionAuditInput,
  type BrowserUpdatedDesktopEvent,
} from "./browserDesktopStateService";

type FakeBrowserState = {
  running: boolean;
  activeTab?: {
    url: string;
    title: string;
  };
};

type FakeThread = {
  id: string;
  permissionMode: "ask" | "full-access";
};

type FakeAudit = BrowserPermissionAuditInput<FakeThread> & {
  id: string;
};

class FakeStore implements BrowserDesktopStateStore<FakeThread, FakeAudit> {
  readonly audits: FakeAudit[] = [];

  constructor(private readonly threads: Record<string, FakeThread>) {}

  getThread(threadId: string): FakeThread {
    const thread = this.threads[threadId];
    if (!thread) throw new Error(`Missing thread ${threadId}`);
    return thread;
  }

  addPermissionAudit(input: BrowserPermissionAuditInput<FakeThread>): FakeAudit {
    const audit = {
      id: `audit-${this.audits.length + 1}`,
      ...input,
    };
    this.audits.push(audit);
    return audit;
  }
}

interface FakeHost extends BrowserDesktopStateHost<FakeStore, FakeBrowserState> {
  activeThreadId: string;
}

function createHost(input: {
  workspacePath?: string;
  state?: FakeBrowserState;
  thread?: FakeThread;
} = {}): FakeHost {
  const thread = input.thread ?? { id: "thread-1", permissionMode: "ask" as const };
  return {
    workspacePath: input.workspacePath ?? "/workspace",
    store: new FakeStore({ [thread.id]: thread }),
    browserService: {
      getState: vi.fn(async () => input.state ?? {
        running: true,
        activeTab: {
          url: "https://example.com/",
          title: "Example",
        },
      }),
    },
    activeThreadId: thread.id,
  };
}

function createHarness(input: {
  activeHost?: FakeHost;
  emitDesktopEvent?: (event: BrowserUpdatedDesktopEvent<FakeBrowserState>) => void;
} = {}) {
  const host = input.activeHost ?? createHost();
  const events: BrowserUpdatedDesktopEvent<FakeBrowserState>[] = [];
  const permissionAuditEvents: Array<{ entry: FakeAudit; workspacePath: string }> = [];
  const emitDesktopEvent = vi.fn(input.emitDesktopEvent ?? ((event) => events.push(event)));
  const emitPermissionAuditCreated = vi.fn((entry: FakeAudit, workspacePath: string) => {
    permissionAuditEvents.push({ entry, workspacePath });
  });
  const activeThreadIdForHost = vi.fn((targetHost: FakeHost) => targetHost.activeThreadId);
  const service = createBrowserDesktopStateService<FakeThread, FakeAudit, FakeBrowserState, FakeStore, FakeHost>({
    activeHost: () => host,
    activeThreadIdForHost,
    emitDesktopEvent,
    emitPermissionAuditCreated,
  });
  return {
    activeThreadIdForHost,
    emitDesktopEvent,
    emitPermissionAuditCreated,
    events,
    host,
    permissionAuditEvents,
    service,
  };
}

describe("browserDesktopStateService", () => {
  it("emits browser state events for a specific host", async () => {
    const host = createHost({
      workspacePath: "/workspace/browser",
      state: {
        running: true,
        activeTab: {
          url: "https://ambient.dev/",
          title: "Ambient",
        },
      },
    });
    const { events, service } = createHarness({ activeHost: host });

    await service.emitBrowserStateForHost(host);

    expect(host.browserService.getState).toHaveBeenCalledOnce();
    expect(events).toEqual([
      {
        type: "browser-updated",
        state: {
          running: true,
          activeTab: {
            url: "https://ambient.dev/",
            title: "Ambient",
          },
        },
        workspacePath: "/workspace/browser",
      },
    ]);
  });

  it("emits browser state through the active host dependency", async () => {
    const host = createHost({ workspacePath: "/workspace/active" });
    const { events, service } = createHarness({ activeHost: host });

    await service.emitBrowserState();

    expect(events).toEqual([
      {
        type: "browser-updated",
        state: {
          running: true,
          activeTab: {
            url: "https://example.com/",
            title: "Example",
          },
        },
        workspacePath: "/workspace/active",
      },
    ]);
  });

  it("refreshes browser state after successful operations and returns their result", async () => {
    const { events, host, service } = createHarness();

    await expect(service.withBrowserState(host, Promise.resolve("done"))).resolves.toBe("done");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "browser-updated",
      workspacePath: "/workspace",
    });
  });

  it("best-effort refreshes browser state after failed operations and preserves the original error", async () => {
    const operationError = new Error("operation failed");
    const emitError = new Error("emit failed");
    const host = createHost();
    const { emitDesktopEvent, service } = createHarness({
      activeHost: host,
      emitDesktopEvent: () => {
        throw emitError;
      },
    });

    await expect(service.withBrowserState(host, Promise.reject(operationError))).rejects.toBe(operationError);

    expect(emitDesktopEvent).toHaveBeenCalledOnce();
  });

  it("records browser profile permission audits against the active host thread", () => {
    const host = createHost({
      workspacePath: "/workspace/profile",
      thread: { id: "thread-profile", permissionMode: "full-access" },
    });
    const { activeThreadIdForHost, permissionAuditEvents, service } = createHarness({ activeHost: host });

    service.recordBrowserProfileAudit(host, "profile copied", "Chrome profile copy approved");

    expect(activeThreadIdForHost).toHaveBeenCalledWith(host);
    expect(host.store.audits).toEqual([
      {
        id: "audit-1",
        threadId: "thread-profile",
        permissionMode: "full-access",
        toolName: "browser_profile",
        risk: "browser-profile",
        decision: "allowed",
        detail: "profile copied",
        reason: "Chrome profile copy approved",
      },
    ]);
    expect(permissionAuditEvents).toEqual([
      {
        entry: host.store.audits[0],
        workspacePath: "/workspace/profile",
      },
    ]);
  });

  it("records browser control permission audits with the caller tool name", () => {
    const host = createHost({
      workspacePath: "/workspace/control",
      thread: { id: "thread-control", permissionMode: "ask" },
    });
    const { permissionAuditEvents, service } = createHarness({ activeHost: host });

    service.recordBrowserControlAudit(host, "browser_renderer_link", "http://localhost:5173/app", "Renderer link routed");

    expect(host.store.audits).toEqual([
      {
        id: "audit-1",
        threadId: "thread-control",
        permissionMode: "ask",
        toolName: "browser_renderer_link",
        risk: "browser-control",
        decision: "allowed",
        detail: "http://localhost:5173/app",
        reason: "Renderer link routed",
      },
    ]);
    expect(permissionAuditEvents).toEqual([
      {
        entry: host.store.audits[0],
        workspacePath: "/workspace/control",
      },
    ]);
  });
});
