import type { IpcMain, IpcMainInvokeEvent } from "electron";

import type {
  DesktopEvent,
  E2ePermissionGrantResolutionProbeInput,
  E2ePermissionGrantResolutionProbeResult,
} from "../../shared/desktopTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const e2eEmitEventIpcChannels = ["e2e:emit-event"] as const;
export const e2ePermissionGrantProbeIpcChannels = ["e2e:resolve-permission-grant"] as const;

export interface RegisterE2eEmitEventIpcDependencies {
  handleIpc: HandleIpc;
  isE2eEnabled(): boolean;
  emitDesktopEvent(ipcEvent: IpcMainInvokeEvent, event: DesktopEvent): void;
}

export interface RegisterE2ePermissionGrantProbeIpcDependencies {
  handleIpc: HandleIpc;
  isE2eEnabled(): boolean;
  resolvePermissionGrant(input: E2ePermissionGrantResolutionProbeInput): MaybePromise<E2ePermissionGrantResolutionProbeResult>;
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

export function registerE2ePermissionGrantProbeIpc({
  handleIpc,
  isE2eEnabled,
  resolvePermissionGrant,
}: RegisterE2ePermissionGrantProbeIpcDependencies): void {
  if (!isE2eEnabled()) return;

  handleIpc("e2e:resolve-permission-grant", (_event, raw: E2ePermissionGrantResolutionProbeInput) =>
    resolvePermissionGrant(raw),
  );
}
