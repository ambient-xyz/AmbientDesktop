import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import { AMBIENT_KEYS_URL } from "./credentialStore";
import type { MenuCommand } from "../shared/types";

function openApiKeyDialog(window: BrowserWindow | undefined): void {
  window?.webContents.send("desktop:event", { type: "open-api-key-dialog" });
}

function sendCommand(window: BrowserWindow | undefined, command: MenuCommand): void {
  window?.webContents.send("desktop:event", { type: "menu-command", command });
}

export function installAppMenu(getWindow: () => BrowserWindow | undefined): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
          {
            label: "Ambient Desktop",
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              {
                label: "Set Ambient API Key...",
                click: () => openApiKeyDialog(getWindow()),
              },
              {
                label: "Get Ambient API Key",
                click: () => void shell.openExternal(AMBIENT_KEYS_URL),
              },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        { label: "New Chat", accelerator: "CmdOrCtrl+N", click: () => sendCommand(getWindow(), "new-chat") },
        {
          label: "Open Folder",
          accelerator: "CmdOrCtrl+O",
          click: () => sendCommand(getWindow(), "open-folder"),
        },
        { type: "separator" },
        {
          label: "Set Ambient API Key...",
          accelerator: "CmdOrCtrl+,",
          click: () => openApiKeyDialog(getWindow()),
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Toggle Sidebar", accelerator: "CmdOrCtrl+B", click: () => sendCommand(getWindow(), "toggle-sidebar") },
        { label: "Toggle Terminal", accelerator: "CmdOrCtrl+`", click: () => sendCommand(getWindow(), "toggle-terminal") },
        { label: "Toggle Browser Panel", click: () => sendCommand(getWindow(), "toggle-browser-panel") },
        { label: "Toggle File Tree", click: () => sendCommand(getWindow(), "toggle-file-tree") },
        { label: "Toggle Diff Panel", click: () => sendCommand(getWindow(), "toggle-diff-panel") },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Get Ambient API Key",
          click: () => void shell.openExternal(AMBIENT_KEYS_URL),
        },
        {
          label: "Ambient",
          click: () => void shell.openExternal("https://ambient.xyz"),
        },
        {
          label: "Start Performance Trace",
          click: () => sendCommand(getWindow(), "performance-trace"),
        },
        {
          label: "Export Diagnostic Bundle...",
          click: () => sendCommand(getWindow(), "export-diagnostics"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
