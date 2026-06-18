import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  AmbientPermissionGrant,
  CreateAmbientPermissionGrantInput,
  PermissionAuditEntry,
  PermissionPromptResponseMode,
  PermissionRequest,
  RevokeAmbientPermissionGrantInput,
} from "../../shared/permissionTypes";
import {
  permissionCreateGrantIpcChannels,
  permissionListIpcChannels,
  permissionRespondIpcChannels,
  permissionRevokeGrantIpcChannels,
  registerPermissionCreateGrantIpc,
  registerPermissionListIpc,
  registerPermissionRespondIpc,
  registerPermissionRevokeGrantIpc,
  type RegisterPermissionCreateGrantIpcDependencies,
  type RegisterPermissionListIpcDependencies,
  type RegisterPermissionRespondIpcDependencies,
  type RegisterPermissionRevokeGrantIpcDependencies,
} from "./registerPermissionIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerPermissionListIpc", () => {
  it("registers the permission list channels", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...permissionListIpcChannels]);
  });

  it("lists permission audit entries through the dependency", async () => {
    const { audit, deps, invoke } = registerWithFakes();

    await expect(invoke("permission:audit")).resolves.toEqual(audit);

    expect(deps.listPermissionAudit).toHaveBeenCalledOnce();
    expect(deps.listPermissionGrants).not.toHaveBeenCalled();
  });

  it("lists permission grants through the dependency", async () => {
    const { deps, grants, invoke } = registerWithFakes();

    await expect(invoke("permission:grants")).resolves.toEqual(grants);

    expect(deps.listPermissionGrants).toHaveBeenCalledOnce();
    expect(deps.listPermissionAudit).not.toHaveBeenCalled();
  });

  it("lists pending permission requests through the dependency", async () => {
    const { deps, pending, invoke } = registerWithFakes();

    await expect(invoke("permission:pending")).resolves.toEqual(pending);

    expect(deps.listPendingPermissionRequests).toHaveBeenCalledOnce();
    expect(deps.listPermissionAudit).not.toHaveBeenCalled();
    expect(deps.listPermissionGrants).not.toHaveBeenCalled();
  });

  it("propagates permission audit list errors", async () => {
    const error = new Error("permission audit unavailable");
    const { deps, invoke } = registerWithFakes({ auditError: error });

    await expect(invoke("permission:audit")).rejects.toThrow("permission audit unavailable");

    expect(deps.listPermissionAudit).toHaveBeenCalledOnce();
  });

  it("propagates permission grant list errors", async () => {
    const error = new Error("permission grants unavailable");
    const { deps, invoke } = registerWithFakes({ grantsError: error });

    await expect(invoke("permission:grants")).rejects.toThrow("permission grants unavailable");

    expect(deps.listPermissionGrants).toHaveBeenCalledOnce();
  });
});

describe("registerPermissionCreateGrantIpc", () => {
  it("registers the permission create grant channel", () => {
    const { handlers } = registerCreateGrantWithFakes();

    expect([...handlers.keys()]).toEqual([...permissionCreateGrantIpcChannels]);
  });

  it("parses create grant input before creating the permission grant", async () => {
    const { deps, grant, invoke } = registerCreateGrantWithFakes();

    await expect(
      invoke("permission:create-grant", {
        expiresAt: "2026-06-07T00:00:00.000Z",
        createdBy: "user",
        permissionModeAtCreation: "workspace",
        scopeKind: "thread",
        threadId: "thread-1",
        actionKind: "shell_command",
        targetKind: "shell_command_prefix",
        targetHash: "hash-1",
        targetLabel: "pnpm",
        conditions: { prefix: "pnpm" },
        source: "permission_prompt",
        reason: "User approved recurring command",
        extra: "ignored",
      }),
    ).resolves.toEqual(grant);

    expect(deps.createPermissionGrant).toHaveBeenCalledWith({
      expiresAt: "2026-06-07T00:00:00.000Z",
      createdBy: "user",
      permissionModeAtCreation: "workspace",
      scopeKind: "thread",
      threadId: "thread-1",
      actionKind: "shell_command",
      targetKind: "shell_command_prefix",
      targetHash: "hash-1",
      targetLabel: "pnpm",
      conditions: { prefix: "pnpm" },
      source: "permission_prompt",
      reason: "User approved recurring command",
    });
  });

  it("rejects invalid create grant input before calling the dependency", () => {
    const { deps, invoke } = registerCreateGrantWithFakes();

    expect(() =>
      invoke("permission:create-grant", {
        permissionModeAtCreation: "workspace",
        scopeKind: "thread",
        actionKind: "shell_command",
        targetKind: "shell_command_prefix",
        targetHash: "",
        targetLabel: "pnpm",
        reason: "User approved recurring command",
      }),
    ).toThrow();

    expect(deps.createPermissionGrant).not.toHaveBeenCalled();
  });

  it("propagates create grant errors", async () => {
    const error = new Error("permission grant create failed");
    const { deps, invoke } = registerCreateGrantWithFakes({ error });
    const input = sampleCreatePermissionGrantInput();

    await expect(invoke("permission:create-grant", input)).rejects.toThrow("permission grant create failed");

    expect(deps.createPermissionGrant).toHaveBeenCalledWith(input);
  });
});

describe("registerPermissionRevokeGrantIpc", () => {
  it("registers the permission revoke grant channel", () => {
    const { handlers } = registerRevokeGrantWithFakes();

    expect([...handlers.keys()]).toEqual([...permissionRevokeGrantIpcChannels]);
  });

  it("parses revoke grant input before revoking the permission grant", async () => {
    const { deps, grant, invoke } = registerRevokeGrantWithFakes();

    await expect(
      invoke("permission:revoke-grant", {
        id: "grant-1",
        extra: "ignored",
      }),
    ).resolves.toEqual(grant);

    expect(deps.revokePermissionGrant).toHaveBeenCalledWith({ id: "grant-1" });
  });

  it("rejects invalid revoke grant input before calling the dependency", () => {
    const { deps, invoke } = registerRevokeGrantWithFakes();

    expect(() => invoke("permission:revoke-grant", { id: "" })).toThrow();

    expect(deps.revokePermissionGrant).not.toHaveBeenCalled();
  });

  it("propagates revoke grant errors", async () => {
    const error = new Error("permission grant revoke failed");
    const { deps, invoke } = registerRevokeGrantWithFakes({ error });
    const input = sampleRevokePermissionGrantInput();

    await expect(invoke("permission:revoke-grant", input)).rejects.toThrow("permission grant revoke failed");

    expect(deps.revokePermissionGrant).toHaveBeenCalledWith(input);
  });
});

describe("registerPermissionRespondIpc", () => {
  it("registers the permission respond channel", () => {
    const { handlers } = registerRespondWithFakes();

    expect([...handlers.keys()]).toEqual([...permissionRespondIpcChannels]);
  });

  it("parses permission response args before responding to the prompt", async () => {
    const { deps, invoke } = registerRespondWithFakes();

    await expect(invoke("permission:respond", "request-1", "always_thread")).resolves.toBeUndefined();

    expect(deps.respondPermissionPrompt).toHaveBeenCalledWith("request-1", "always_thread");
  });

  it("rejects invalid permission response args before calling the dependency", () => {
    const { deps, invoke } = registerRespondWithFakes();

    expect(() => invoke("permission:respond", 123, "always_thread")).toThrow();
    expect(() => invoke("permission:respond", "request-1", "forever")).toThrow();

    expect(deps.respondPermissionPrompt).not.toHaveBeenCalled();
  });

  it("propagates permission response errors", async () => {
    const error = new Error("permission response failed");
    const { deps, invoke } = registerRespondWithFakes({ error });

    await expect(invoke("permission:respond", "request-1", "deny")).rejects.toThrow("permission response failed");

    expect(deps.respondPermissionPrompt).toHaveBeenCalledWith("request-1", "deny");
  });
});

function registerWithFakes({
  audit = samplePermissionAuditEntries(),
  grants = samplePermissionGrants(),
  pending = samplePermissionRequests(),
  auditError,
  grantsError,
}: {
  audit?: PermissionAuditEntry[];
  grants?: AmbientPermissionGrant[];
  pending?: PermissionRequest[];
  auditError?: Error;
  grantsError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPermissionListIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    listPermissionAudit: vi.fn(async () => {
      if (auditError) throw auditError;
      return audit;
    }),
    listPermissionGrants: vi.fn(async () => {
      if (grantsError) throw grantsError;
      return grants;
    }),
    listPendingPermissionRequests: vi.fn(async () => pending),
  };
  registerPermissionListIpc(deps);

  return {
    audit,
    deps,
    grants,
    pending,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
  };
}

function registerCreateGrantWithFakes({
  grant = samplePermissionGrants()[0],
  error,
}: {
  grant?: AmbientPermissionGrant;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPermissionCreateGrantIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    createPermissionGrant: vi.fn(async (_input: CreateAmbientPermissionGrantInput) => {
      if (error) throw error;
      return grant;
    }),
  };
  registerPermissionCreateGrantIpc(deps);

  return {
    deps,
    grant,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerRevokeGrantWithFakes({
  grant = samplePermissionGrants()[0],
  error,
}: {
  grant?: AmbientPermissionGrant;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPermissionRevokeGrantIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    revokePermissionGrant: vi.fn(async (_input: RevokeAmbientPermissionGrantInput) => {
      if (error) throw error;
      return grant;
    }),
  };
  registerPermissionRevokeGrantIpc(deps);

  return {
    deps,
    grant,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerRespondWithFakes({
  error,
}: {
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPermissionRespondIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    respondPermissionPrompt: vi.fn(async (_id: string, _response: PermissionPromptResponseMode) => {
      if (error) throw error;
    }),
  };
  registerPermissionRespondIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, id?: unknown, response?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, id, response));
    },
  };
}

function samplePermissionRequests(): PermissionRequest[] {
  return [
    {
      id: "request-1",
      threadId: "thread-1",
      toolName: "ambient_mcp_server_install",
      title: "Install MCP server?",
      message: "Review install.",
      detail: "Server: example",
      risk: "plugin-tool",
      reusableScopes: [],
    },
  ];
}

function samplePermissionAuditEntries(): PermissionAuditEntry[] {
  return [
    {
      id: "audit-1",
      threadId: "thread-1",
      createdAt: "2026-06-06T00:00:00.000Z",
      permissionMode: "workspace",
      toolName: "shell",
      risk: "workspace-command",
      decision: "allowed",
      reason: "Allowed by policy",
      decisionSource: "policy",
    },
  ];
}

function sampleCreatePermissionGrantInput(): CreateAmbientPermissionGrantInput {
  return {
    permissionModeAtCreation: "workspace",
    scopeKind: "thread",
    threadId: "thread-1",
    actionKind: "shell_command",
    targetKind: "shell_command_prefix",
    targetHash: "hash-1",
    targetLabel: "pnpm",
    source: "permission_prompt",
    reason: "User approved recurring command",
  };
}

function sampleRevokePermissionGrantInput(): RevokeAmbientPermissionGrantInput {
  return {
    id: "grant-1",
  };
}

function samplePermissionGrants(): AmbientPermissionGrant[] {
  return [
    {
      id: "grant-1",
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:00.000Z",
      createdBy: "user",
      permissionModeAtCreation: "workspace",
      scopeKind: "thread",
      threadId: "thread-1",
      actionKind: "shell_command",
      targetKind: "shell_command_prefix",
      targetHash: "hash-1",
      targetLabel: "pnpm",
      source: "permission_prompt",
      reason: "User approved recurring command",
    },
  ];
}
