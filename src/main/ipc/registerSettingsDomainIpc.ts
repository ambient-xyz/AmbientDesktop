import type { IpcMain } from "electron";

import {
  registerSettingsIpc,
  settingsIpcChannels,
  type RegisterSettingsIpcDependencies,
} from "./registerSettingsIpc";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type SettingsRegistrationDependencies = RegisterSettingsIpcDependencies<any, any, any, any>;

export const settingsDomainIpcChannels = [
  ...settingsIpcChannels,
] as const;

export type SettingsDomainServices = Omit<SettingsRegistrationDependencies, "handleIpc" | "isAppPackaged">;

export interface RegisterSettingsDomainIpcDependencies {
  handleIpc: HandleIpc;
  isAppPackaged: SettingsRegistrationDependencies["isAppPackaged"];
  settingsServices: SettingsDomainServices;
}

export function registerSettingsDomainIpc({
  handleIpc,
  isAppPackaged,
  settingsServices,
}: RegisterSettingsDomainIpcDependencies): void {
  registerSettingsIpc<any, any, any, any>({
    ...settingsServices,
    handleIpc,
    isAppPackaged,
  });
}
