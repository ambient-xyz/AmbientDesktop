import type { IpcMain, IpcMainInvokeEvent } from "electron";

import type { DesktopEvent } from "../../shared/desktopTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;

export const e2eEmitEventIpcChannels = ["e2e:emit-event"] as const;

export interface RegisterE2eEmitEventIpcDependencies {
  handleIpc: HandleIpc;
  isE2eEnabled(): boolean;
  emitDesktopEvent(ipcEvent: IpcMainInvokeEvent, event: DesktopEvent): void;
}

export function registerE2eEmitEventIpc({
  handleIpc,
  isE2eEnabled,
  emitDesktopEvent,
}: RegisterE2eEmitEventIpcDependencies): void {
  if (!isE2eEnabled()) return;

  handleIpc("e2e:emit-event", (event, raw: DesktopEvent) => {
    emitDesktopEvent(event, raw);
  });
}
