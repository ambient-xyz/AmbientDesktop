import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  AmbientPermissionGrant,
  CreateAmbientPermissionGrantInput,
  PermissionAuditEntry,
  PermissionRequest,
} from "../../shared/types";
import {
  permissionCreateGrantIpcChannels,
  permissionListIpcChannels,
  permissionRespondIpcChannels,
  permissionRevokeGrantIpcChannels,
} from "./registerPermissionIpc";
import { privilegedCredentialRespondIpcChannels } from "./registerPrivilegedCredentialIpc";
import {
  permissionSecurityDomainIpcChannels,
  registerPermissionSecurityDomainIpc,
  type PermissionSecurityDomainHost,
} from "./registerPermissionSecurityDomainIpc";
import { secureInputRespondIpcChannels } from "./registerSecureInputIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerPermissionSecurityDomainIpc", () => {
  it("registers permission and security channels in the previous main registrar order", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...permissionSecurityDomainIpcChannels]);
    expect([...permissionSecurityDomainIpcChannels]).toEqual([
      ...permissionListIpcChannels,
      ...permissionCreateGrantIpcChannels,
      ...permissionRevokeGrantIpcChannels,
      ...permissionRespondIpcChannels,
      ...privilegedCredentialRespondIpcChannels,
      ...secureInputRespondIpcChannels,
    ]);
  });

  it("lists permission audit, grants, and pending prompts through the current project and permission owner", async () => {
    const { audit, deps, grants, host, invoke, pending } = registerWithFakes();

    await expect(invoke("permission:audit")).resolves.toEqual(audit);
    await expect(invoke("permission:grants")).resolves.toEqual(grants);
    await expect(invoke("permission:pending")).resolves.toEqual(pending);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledTimes(2);
    expect(host.store.listPermissionAudit).toHaveBeenCalledOnce();
    expect(host.store.listPermissionGrants).toHaveBeenCalledOnce();
    expect(deps.permissions.listPending).toHaveBeenCalledOnce();
  });

  it("creates permission grants through the grant host and emits the created grant for its workspace", async () => {
    const { createdGrant, deps, host, invoke } = registerWithFakes();
    const input = sampleCreatePermissionGrantInput();

    await expect(invoke("permission:create-grant", input)).resolves.toEqual(createdGrant);

    expect(deps.requireProjectRuntimeHostForPermissionGrantInput).toHaveBeenCalledWith(input);
    expect(host.store.createPermissionGrant).toHaveBeenCalledWith(input);
    expect(deps.permissionGrantWorkspacePath).toHaveBeenCalledWith(createdGrant, host.store);
    expect(deps.emitPermissionGrantCreated).toHaveBeenCalledWith(createdGrant, "/workspace/from-grant");
  });

  it("revokes permission grants through the grant host and emits the revoked grant for its workspace", async () => {
    const { deps, host, invoke, revokedGrant } = registerWithFakes();

    await expect(invoke("permission:revoke-grant", { id: "grant-1" })).resolves.toEqual(revokedGrant);

    expect(deps.requireProjectRuntimeHostForPermissionGrant).toHaveBeenCalledWith("grant-1");
    expect(host.store.revokePermissionGrant).toHaveBeenCalledWith("grant-1");
    expect(deps.permissionGrantWorkspacePath).toHaveBeenCalledWith(revokedGrant, host.store);
    expect(deps.emitPermissionGrantRevoked).toHaveBeenCalledWith(revokedGrant, "/workspace/from-grant");
  });

  it("delegates permission, privileged credential, and secure input responses to their owners", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("permission:respond", "permission-1", "always_thread")).resolves.toBeUndefined();
    await expect(
      invoke("privileged-credential:respond", {
        id: "credential-1",
        credential: "ephemeral-token",
      }),
    ).resolves.toBeUndefined();
    await expect(
      invoke("secure-input:respond", {
        id: "secure-input-1",
        value: "123456",
      }),
    ).resolves.toBeUndefined();

    expect(deps.permissions.respond).toHaveBeenCalledWith("permission-1", "always_thread");
    expect(deps.privilegedCredentials.respond).toHaveBeenCalledWith({
      id: "credential-1",
      credential: "ephemeral-token",
    });
    expect(deps.secureInputs.respond).toHaveBeenCalledWith({
      id: "secure-input-1",
      value: "123456",
    });
  });
});

function registerWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const event = {} as IpcMainInvokeEvent;
  const audit = [samplePermissionAuditEntry()];
  const grants = [samplePermissionGrant()];
  const pending = [samplePermissionRequest()];
  const createdGrant = samplePermissionGrant({ id: "grant-created" });
  const revokedGrant = samplePermissionGrant({
    id: "grant-1",
    revokedAt: "2026-06-16T00:00:00.000Z",
  });
  const host: PermissionSecurityDomainHost = {
    store: {
      listPermissionAudit: vi.fn(() => audit),
      listPermissionGrants: vi.fn(() => grants),
      createPermissionGrant: vi.fn(() => createdGrant),
      revokePermissionGrant: vi.fn(() => revokedGrant),
    },
  };
  const deps = {
    handleIpc: (channel: string, listener: IpcListener) => handlers.set(channel, listener),
    emitPermissionGrantCreated: vi.fn(),
    emitPermissionGrantRevoked: vi.fn(),
    permissionGrantWorkspacePath: vi.fn(() => "/workspace/from-grant"),
    permissions: {
      listPending: vi.fn(() => pending),
      respond: vi.fn(),
    },
    privilegedCredentials: {
      respond: vi.fn(),
    },
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    requireProjectRuntimeHostForPermissionGrant: vi.fn(() => host),
    requireProjectRuntimeHostForPermissionGrantInput: vi.fn(() => host),
    secureInputs: {
      respond: vi.fn(),
    },
  };

  registerPermissionSecurityDomainIpc(deps);

  return {
    audit,
    createdGrant,
    deps,
    grants,
    handlers,
    host,
    invoke: (channel: string, ...args: unknown[]) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler(event, ...args));
    },
    pending,
    revokedGrant,
  };
}

function samplePermissionAuditEntry(): PermissionAuditEntry {
  return {
    id: "audit-1",
    threadId: "thread-1",
    createdAt: "2026-06-16T00:00:00.000Z",
    permissionMode: "workspace",
    toolName: "bash",
    risk: "workspace-command",
    decision: "allowed",
    reason: "Approved.",
  };
}

function samplePermissionGrant(overrides: Partial<AmbientPermissionGrant> = {}): AmbientPermissionGrant {
  return {
    id: "grant-1",
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z",
    createdBy: "user",
    permissionModeAtCreation: "workspace",
    scopeKind: "thread",
    threadId: "thread-1",
    actionKind: "shell_command",
    targetKind: "shell_command_prefix",
    targetHash: "hash-1",
    targetLabel: "pnpm",
    source: "permission_prompt",
    reason: "User approved recurring command.",
    ...overrides,
  };
}

function sampleCreatePermissionGrantInput(): CreateAmbientPermissionGrantInput {
  return {
    createdBy: "user",
    permissionModeAtCreation: "workspace",
    scopeKind: "thread",
    threadId: "thread-1",
    actionKind: "shell_command",
    targetKind: "shell_command_prefix",
    targetHash: "hash-1",
    targetLabel: "pnpm",
    source: "permission_prompt",
    reason: "User approved recurring command.",
  };
}

function samplePermissionRequest(): PermissionRequest {
  return {
    id: "permission-1",
    threadId: "thread-1",
    toolName: "bash",
    title: "Allow command",
    message: "Allow pnpm test?",
    risk: "workspace-command",
  };
}
