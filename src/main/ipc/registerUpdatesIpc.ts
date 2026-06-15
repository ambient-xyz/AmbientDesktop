import type { IpcMain } from "electron";
import { z } from "zod";

import type { DesktopUpdateCheckReason, DesktopUpdateState } from "../../shared/types";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const updatesIpcChannels = [
  "updates:get-state",
  "updates:check",
  "updates:download",
  "updates:install",
  "updates:dismiss",
] as const;

export interface RegisterUpdatesIpcDependencies {
  handleIpc: HandleIpc;
  getUpdateState(): MaybePromise<DesktopUpdateState>;
  checkForUpdates(reason: DesktopUpdateCheckReason): MaybePromise<DesktopUpdateState>;
  downloadUpdate(): MaybePromise<DesktopUpdateState>;
  installUpdateAndRestart(): MaybePromise<DesktopUpdateState>;
  dismissUpdateNotification(): MaybePromise<DesktopUpdateState>;
}

const updateCheckReasonSchema = z.enum(["startup", "scheduled", "manual"]).optional();

export function registerUpdatesIpc({
  handleIpc,
  getUpdateState,
  checkForUpdates,
  downloadUpdate,
  installUpdateAndRestart,
  dismissUpdateNotification,
}: RegisterUpdatesIpcDependencies): void {
  handleIpc("updates:get-state", () => getUpdateState());
  handleIpc("updates:check", (_event, reason?: unknown) => checkForUpdates(updateCheckReasonSchema.parse(reason) ?? "manual"));
  handleIpc("updates:download", () => downloadUpdate());
  handleIpc("updates:install", () => installUpdateAndRestart());
  handleIpc("updates:dismiss", () => dismissUpdateNotification());
}
