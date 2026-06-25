import type { ContextUsageSnapshot } from "../../shared/threadTypes";
import type { CommandPaletteItem } from "./AppDialogs";
import { isSessionContextMissing } from "./AppSessionRecovery";

export type AppCommandPaletteHandlers = {
  compactActiveThread: () => void | Promise<void>;
  createThread: () => void | Promise<void>;
  exportActiveChat: () => void | Promise<void>;
  exportDiagnostics: () => void | Promise<void>;
  addThreadFolderAllowlist: () => void | Promise<void>;
  openApiKeyDialog: () => void | Promise<void>;
  openMcpRuntimeSettings: () => void | Promise<void>;
  openPanel: (panel: "attachments" | "diff" | "files" | "plugins" | "search" | "settings") => void | Promise<void>;
  openWorkflowLabArea: () => void | Promise<void>;
  openWorkflowRecordingsArea: () => void | Promise<void>;
  openWorkspace: () => void | Promise<void>;
  recoverActiveThreadContext: () => void | Promise<void>;
  setSidebarOpen: (updater: (open: boolean) => boolean) => void;
  togglePanel: (panel: "browser" | "diff" | "files" | "plugins" | "terminal") => void | Promise<void>;
};

export function commandPaletteBrowserLabel(rightPanel: string | undefined): string {
  return rightPanel === "browser" ? "Hide browser" : "Browser";
}

export function createAppCommandPaletteItems({
  contextUsage,
  handlers,
  rightPanel,
  sidebarOpen,
  workflowRecorderNavLabel,
}: {
  contextUsage: ContextUsageSnapshot | undefined;
  handlers: AppCommandPaletteHandlers;
  rightPanel: string | undefined;
  sidebarOpen: boolean;
  workflowRecorderNavLabel: string;
}): CommandPaletteItem[] {
  return [
    { id: "new-chat", label: "New chat", detail: "File", run: handlers.createThread },
    { id: "open-folder", label: "Open folder", detail: "File", run: handlers.openWorkspace },
    {
      id: "toggle-sidebar",
      label: sidebarOpen ? "Hide sidebar" : "Show sidebar",
      detail: "View",
      run: () => handlers.setSidebarOpen((open) => !open),
    },
    { id: "search", label: "Search", detail: "View", run: () => handlers.openPanel("search") },
    { id: "browser", label: commandPaletteBrowserLabel(rightPanel), detail: "View", run: () => handlers.togglePanel("browser") },
    { id: "terminal", label: "Terminal", detail: "View", run: () => handlers.togglePanel("terminal") },
    { id: "files", label: "Files", detail: "View", run: () => handlers.togglePanel("files") },
    { id: "context", label: "Add context", detail: "Composer", run: () => handlers.openPanel("attachments") },
    { id: "add-thread-folder-allowlist", label: "Add Folder to Allow List for Thread", detail: "Security", run: handlers.addThreadFolderAllowlist },
    { id: "diff", label: "Diff", detail: "View", run: () => handlers.togglePanel("diff") },
    { id: "plugins", label: "Plugins", detail: "View", run: () => handlers.openPanel("plugins") },
    { id: "automations", label: workflowRecorderNavLabel, detail: "View", run: handlers.openWorkflowRecordingsArea },
    { id: "workflow-lab", label: "Workflow Lab", detail: "View", run: handlers.openWorkflowLabArea },
    { id: "settings", label: "Settings", detail: "View", run: () => handlers.openPanel("settings") },
    { id: "mcp-runtime-settings", label: "Set up MCP Runtime", detail: "Settings", run: handlers.openMcpRuntimeSettings },
    { id: "compact", label: "Compact context", detail: "Chat", run: handlers.compactActiveThread },
    { id: "export-chat", label: "Export chat", detail: "Chat", run: handlers.exportActiveChat },
    ...(isSessionContextMissing(contextUsage)
      ? [{ id: "recover-context", label: "Rebuild context", detail: "Chat", run: handlers.recoverActiveThreadContext }]
      : []),
    { id: "api-key", label: "Set Ambient API key", detail: "Settings", run: handlers.openApiKeyDialog },
    { id: "diagnostics", label: "Export diagnostic bundle", detail: "Help", run: handlers.exportDiagnostics },
  ];
}
