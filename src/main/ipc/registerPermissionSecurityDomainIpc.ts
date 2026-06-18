import type { IpcMain } from "electron";

import {
  permissionCreateGrantIpcChannels,
  permissionListIpcChannels,
  permissionRespondIpcChannels,
  permissionRevokeGrantIpcChannels,
  registerPermissionCreateGrantIpc,
  registerPermissionListIpc,
  registerPermissionRespondIpc,
  registerPermissionRevokeGrantIpc,
} from "./registerPermissionIpc";
import {
  privilegedCredentialRespondIpcChannels,
  registerPrivilegedCredentialRespondIpc,
} from "./registerPrivilegedCredentialIpc";
import {
  registerSecureInputRespondIpc,
  secureInputRespondIpcChannels,
} from "./registerSecureInputIpc";
import type {
  AmbientPermissionGrant,
  CreateAmbientPermissionGrantInput,
  PermissionAuditEntry,
  PermissionPromptResponseMode,
  PermissionRequest,
  PrivilegedCredentialPromptResponseInput,
  RevokeAmbientPermissionGrantInput,
  SecureInputPromptResponseInput,
} from "../../shared/permissionTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const permissionSecurityDomainIpcChannels = [
  ...permissionListIpcChannels,
  ...permissionCreateGrantIpcChannels,
  ...permissionRevokeGrantIpcChannels,
  ...permissionRespondIpcChannels,
  ...privilegedCredentialRespondIpcChannels,
  ...secureInputRespondIpcChannels,
] as const;

export interface PermissionSecurityDomainStore {
  listPermissionAudit(): PermissionAuditEntry[];
  listPermissionGrants(): AmbientPermissionGrant[];
  createPermissionGrant(input: CreateAmbientPermissionGrantInput): AmbientPermissionGrant;
  revokePermissionGrant(id: string): AmbientPermissionGrant;
}

export interface PermissionSecurityDomainHost {
  store: PermissionSecurityDomainStore;
}

export interface RegisterPermissionSecurityDomainIpcDependencies<Host extends PermissionSecurityDomainHost = PermissionSecurityDomainHost> {
  handleIpc: HandleIpc;
  emitPermissionGrantCreated(grant: AmbientPermissionGrant, workspacePath: string): void;
  emitPermissionGrantRevoked(grant: AmbientPermissionGrant, workspacePath: string): void;
  permissionGrantWorkspacePath(grant: AmbientPermissionGrant, store: Host["store"]): string;
  permissions: {
    listPending(): MaybePromise<PermissionRequest[]>;
    respond(id: string, response: PermissionPromptResponseMode): MaybePromise<void>;
  };
  privilegedCredentials: {
    respond(input: PrivilegedCredentialPromptResponseInput): MaybePromise<void>;
  };
  requireActiveProjectRuntimeHost(): Host;
  requireProjectRuntimeHostForPermissionGrant(id: RevokeAmbientPermissionGrantInput["id"]): Host;
  requireProjectRuntimeHostForPermissionGrantInput(input: CreateAmbientPermissionGrantInput): Host;
  secureInputs: {
    respond(input: SecureInputPromptResponseInput): MaybePromise<void>;
  };
}

export function registerPermissionSecurityDomainIpc<Host extends PermissionSecurityDomainHost>({
  emitPermissionGrantCreated,
  emitPermissionGrantRevoked,
  handleIpc,
  permissionGrantWorkspacePath,
  permissions,
  privilegedCredentials,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForPermissionGrant,
  requireProjectRuntimeHostForPermissionGrantInput,
  secureInputs,
}: RegisterPermissionSecurityDomainIpcDependencies<Host>): void {
  registerPermissionListIpc({
    handleIpc,
    listPermissionAudit: () => requireActiveProjectRuntimeHost().store.listPermissionAudit(),
    listPermissionGrants: () => requireActiveProjectRuntimeHost().store.listPermissionGrants(),
    listPendingPermissionRequests: () => permissions.listPending(),
  });

  registerPermissionCreateGrantIpc({
    handleIpc,
    createPermissionGrant: (input) => {
      const host = requireProjectRuntimeHostForPermissionGrantInput(input);
      const grant = host.store.createPermissionGrant(input);
      emitPermissionGrantCreated(grant, permissionGrantWorkspacePath(grant, host.store));
      return grant;
    },
  });

  registerPermissionRevokeGrantIpc({
    handleIpc,
    revokePermissionGrant: (input) => {
      const host = requireProjectRuntimeHostForPermissionGrant(input.id);
      const grant = host.store.revokePermissionGrant(input.id);
      emitPermissionGrantRevoked(grant, permissionGrantWorkspacePath(grant, host.store));
      return grant;
    },
  });

  registerPermissionRespondIpc({
    handleIpc,
    respondPermissionPrompt: (id, response) => permissions.respond(id, response),
  });

  registerPrivilegedCredentialRespondIpc({
    handleIpc,
    respondPrivilegedCredential: (input) => privilegedCredentials.respond(input),
  });

  registerSecureInputRespondIpc({
    handleIpc,
    respondSecureInput: (input) => secureInputs.respond(input),
  });
}
