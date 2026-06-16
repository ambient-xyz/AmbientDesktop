import type { IpcMain } from "electron";

import {
  appBootstrapIpcChannels,
  registerAppBootstrapIpc,
  type RegisterAppBootstrapIpcDependencies,
} from "./registerAppIpc";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;

export const appBootstrapDomainIpcChannels = [
  ...appBootstrapIpcChannels,
] as const;

export interface RegisterAppBootstrapDomainIpcDependencies {
  handleIpc: HandleIpc;
  readBootstrapState: RegisterAppBootstrapIpcDependencies["readBootstrapState"];
}

export function registerAppBootstrapDomainIpc({
  handleIpc,
  readBootstrapState,
}: RegisterAppBootstrapDomainIpcDependencies): void {
  registerAppBootstrapIpc({
    handleIpc,
    readBootstrapState,
  });
}
