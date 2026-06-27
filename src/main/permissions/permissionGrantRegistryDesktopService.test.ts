import { describe, expect, it, vi } from "vitest";
import type { AmbientPermissionGrant, PermissionRequest } from "../../shared/permissionTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import {
  type PermissionGrantResolution,
  resolvePermissionWithGrants as defaultResolvePermissionWithGrants,
} from "./permissionGrants";
import {
  createPermissionGrantRegistryDesktopService,
  type PermissionGrantRegistryHost,
} from "./permissionGrantRegistryDesktopService";
import type { ProjectStore as PermissionGrantProjectStore } from "./permissionsProjectStoreFacade";

const request: Omit<PermissionRequest, "id"> = {
  threadId: "",
  toolName: "shell",
  title: "Run command",
  message: "Run command?",
  risk: "workspace-command",
};

function thread(id: string, workspacePath = `/workspace/${id}`): ThreadSummary {
  return {
    id,
    title: id,
    workspacePath,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "example/model-id",
    thinkingLevel: "medium",
  };
}

function grant(id = "grant-1"): AmbientPermissionGrant {
  return {
    id,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    createdBy: "user",
    permissionModeAtCreation: "workspace",
    scopeKind: "thread",
    threadId: "thread-1",
    actionKind: "shell_command",
    targetKind: "shell_command_prefix",
    targetHash: "hash",
    targetLabel: "shell",
    source: "permission_prompt",
    reason: "Allowed from permission prompt",
  };
}

function store(path: string, threads: ThreadSummary[]): PermissionGrantProjectStore {
  const byId = new Map(threads.map((candidate) => [candidate.id, candidate]));
  return {
    getThread: vi.fn((threadId: string) => {
      const found = byId.get(threadId);
      if (!found) throw new Error(`missing thread ${threadId}`);
      return found;
    }),
    getWorkspace: vi.fn(() => ({ path })),
  } as unknown as PermissionGrantProjectStore;
}

function serviceFixture(options: {
  defaultStore?: PermissionGrantProjectStore;
  host?: PermissionGrantRegistryHost<PermissionGrantProjectStore>;
  result?: PermissionGrantResolution;
} = {}) {
  const defaultStore = options.defaultStore ?? store("/project/default", [thread("active-thread")]);
  const result = options.result ?? { allowed: true, decisionSource: "prompt_allow_once", response: "allow_once" };
  const resolvePermissionWithGrants = vi.fn<typeof defaultResolvePermissionWithGrants>(async () => result);
  const emitPermissionGrantCreated = vi.fn<(grant: AmbientPermissionGrant, workspacePath: string) => void>();
  const activeThreadIdForHost = vi.fn(() => "host-thread");
  const initialActiveThreadIdForStore = vi.fn(() => "initial-thread");
  const projectRuntimeHostForStore = vi.fn((targetStore: PermissionGrantProjectStore) =>
    options.host && targetStore === options.host.store ? options.host : undefined,
  );
  const service = createPermissionGrantRegistryDesktopService({
    defaultStore: () => defaultStore,
    activeThreadId: () => "active-thread",
    activeThreadIdForHost,
    initialActiveThreadIdForStore,
    projectRuntimeHostForStore,
    requester: { request: vi.fn() },
    emitPermissionGrantCreated,
    resolvePermissionWithGrants,
  });
  return {
    activeThreadIdForHost,
    defaultStore,
    emitPermissionGrantCreated,
    initialActiveThreadIdForStore,
    projectRuntimeHostForStore,
    resolvePermissionWithGrants,
    service,
  };
}

describe("createPermissionGrantRegistryDesktopService", () => {
  it("uses the active host thread as the fallback thread for hosted stores", async () => {
    const hostedStore = store("/project/hosted", [thread("host-thread", "/workspace/hosted-thread")]);
    const host = { store: hostedStore };
    const { activeThreadIdForHost, resolvePermissionWithGrants, service } = serviceFixture({
      defaultStore: hostedStore,
      host,
    });

    await service.requestPermissionWithGrantRegistry(request);

    expect(activeThreadIdForHost).toHaveBeenCalledWith(host);
    expect(resolvePermissionWithGrants).toHaveBeenCalledWith(expect.objectContaining({
      store: hostedStore,
      context: expect.objectContaining({
        permissionMode: "workspace",
        threadId: "host-thread",
        projectPath: "/project/hosted",
        workspacePath: "/workspace/hosted-thread",
      }),
    }));
  });

  it("uses the active desktop thread as the fallback for the default unhosted store", async () => {
    const defaultStore = store("/project/default", [thread("active-thread", "/workspace/active-thread")]);
    const { initialActiveThreadIdForStore, resolvePermissionWithGrants, service } = serviceFixture({ defaultStore });

    await service.requestPermissionWithGrantRegistry(request);

    expect(initialActiveThreadIdForStore).not.toHaveBeenCalled();
    expect(resolvePermissionWithGrants).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        threadId: "active-thread",
        workspacePath: "/workspace/active-thread",
      }),
    }));
  });

  it("uses the store initial thread as the fallback for non-default unhosted stores", async () => {
    const defaultStore = store("/project/default", [thread("active-thread")]);
    const targetStore = store("/project/target", [thread("initial-thread", "/workspace/initial-thread")]);
    const { initialActiveThreadIdForStore, resolvePermissionWithGrants, service } = serviceFixture({ defaultStore });

    await service.requestPermissionWithGrantRegistry(request, { store: targetStore });

    expect(initialActiveThreadIdForStore).toHaveBeenCalledWith(targetStore);
    expect(resolvePermissionWithGrants).toHaveBeenCalledWith(expect.objectContaining({
      store: targetStore,
      context: expect.objectContaining({
        threadId: "initial-thread",
        projectPath: "/project/target",
        workspacePath: "/workspace/initial-thread",
      }),
    }));
  });

  it("honors request and input overrides when building the grant context", async () => {
    const defaultStore = store("/project/default", [
      { ...thread("request-thread", "/workspace/request-thread"), permissionMode: "workspace" },
    ]);
    const { resolvePermissionWithGrants, service } = serviceFixture({ defaultStore });

    await service.requestPermissionWithGrantRegistry(
      {
        ...request,
        threadId: "request-thread",
        workspacePath: "/workspace/from-request",
        workflowThreadId: "workflow-from-request",
      },
      {
        permissionMode: "full-access",
        workspacePath: "/workspace/from-input",
        workflowThreadId: "workflow-from-input",
      },
    );

    expect(resolvePermissionWithGrants).toHaveBeenCalledWith(expect.objectContaining({
      context: {
        permissionMode: "full-access",
        threadId: "request-thread",
        workflowThreadId: "workflow-from-request",
        projectPath: "/project/default",
        workspacePath: "/workspace/from-request",
      },
    }));
  });

  it("emits new prompt-created grants with the target store workspace path", async () => {
    const createdGrant = grant("created-grant");
    const { emitPermissionGrantCreated, service } = serviceFixture({
      result: { allowed: true, decisionSource: "prompt_always_thread", response: "always_thread", grant: createdGrant },
    });

    await service.requestPermissionWithGrantRegistry(request);

    expect(emitPermissionGrantCreated).toHaveBeenCalledWith(createdGrant, "/project/default");
  });

  it("does not emit when an existing persistent grant resolves the request", async () => {
    const { emitPermissionGrantCreated, service } = serviceFixture({
      result: { allowed: true, decisionSource: "persistent_grant", response: "always_thread", grant: grant("existing-grant") },
    });

    await service.requestPermissionWithGrantRegistry(request);

    expect(emitPermissionGrantCreated).not.toHaveBeenCalled();
  });
});
