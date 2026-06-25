import type { IpcMain } from "electron";

import {
  e2eEmitEventIpcChannels,
  e2ePermissionGrantProbeIpcChannels,
  registerE2eEmitEventIpc,
  registerE2ePermissionGrantProbeIpc,
  type RegisterE2eEmitEventIpcDependencies,
  type RegisterE2ePermissionGrantProbeIpcDependencies,
} from "./registerE2eIpc";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;

export const e2eDomainIpcChannels = [
  ...e2eEmitEventIpcChannels,
  ...e2ePermissionGrantProbeIpcChannels,
] as const;

export interface RegisterE2eDomainIpcDependencies {
  handleIpc: HandleIpc;
  isE2eEnabled: RegisterE2eEmitEventIpcDependencies["isE2eEnabled"];
  emitDesktopEvent: RegisterE2eEmitEventIpcDependencies["emitDesktopEvent"];
  resolvePermissionGrant: RegisterE2ePermissionGrantProbeIpcDependencies["resolvePermissionGrant"];
}

export function registerE2eDomainIpc({
  handleIpc,
  isE2eEnabled,
  emitDesktopEvent,
  resolvePermissionGrant,
}: RegisterE2eDomainIpcDependencies): void {
  registerE2eEmitEventIpc({
    handleIpc,
    isE2eEnabled,
    emitDesktopEvent,
  });
  registerE2ePermissionGrantProbeIpc({
    handleIpc,
    isE2eEnabled,
    resolvePermissionGrant,
  });
}
