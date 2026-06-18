import type { IpcMain } from "electron";

import type { DesktopState } from "../../shared/desktopTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const appBootstrapIpcChannels = ["app:bootstrap"] as const;

export interface RegisterAppBootstrapIpcDependencies {
  handleIpc: HandleIpc;
  readBootstrapState(): MaybePromise<DesktopState>;
}

export function registerAppBootstrapIpc({
  handleIpc,
  readBootstrapState,
}: RegisterAppBootstrapIpcDependencies): void {
  handleIpc("app:bootstrap", () => readBootstrapState());
}
