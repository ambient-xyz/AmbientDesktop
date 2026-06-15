import type { IpcMain } from "electron";
import { z } from "zod";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;

export const clipboardIpcChannels = [
  "clipboard:read-text",
  "clipboard:write-text",
] as const;

export interface RegisterClipboardIpcDependencies {
  handleIpc: HandleIpc;
  readText(): string;
  writeText(text: string): void;
}

export function registerClipboardIpc({
  handleIpc,
  readText,
  writeText,
}: RegisterClipboardIpcDependencies): void {
  handleIpc("clipboard:read-text", () => readText());
  handleIpc("clipboard:write-text", (_event, text: string) => {
    writeText(z.string().parse(text));
  });
}
