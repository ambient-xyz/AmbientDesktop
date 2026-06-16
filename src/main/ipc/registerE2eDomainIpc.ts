import type { IpcMain } from "electron";

import {
  e2eEmitEventIpcChannels,
  registerE2eEmitEventIpc,
  type RegisterE2eEmitEventIpcDependencies,
} from "./registerE2eIpc";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;

export const e2eDomainIpcChannels = [
  ...e2eEmitEventIpcChannels,
] as const;

export interface RegisterE2eDomainIpcDependencies {
  handleIpc: HandleIpc;
  isE2eEnabled: RegisterE2eEmitEventIpcDependencies["isE2eEnabled"];
  emitDesktopEvent: RegisterE2eEmitEventIpcDependencies["emitDesktopEvent"];
}

export function registerE2eDomainIpc({
  handleIpc,
  isE2eEnabled,
  emitDesktopEvent,
}: RegisterE2eDomainIpcDependencies): void {
  registerE2eEmitEventIpc({
    handleIpc,
    isE2eEnabled,
    emitDesktopEvent,
  });
}
