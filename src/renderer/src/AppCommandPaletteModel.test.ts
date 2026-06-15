import { describe, expect, it } from "vitest";

import type { ContextUsageSnapshot } from "../../shared/types";
import {
  commandPaletteBrowserLabel,
  createAppCommandPaletteItems,
  type AppCommandPaletteHandlers,
} from "./AppCommandPaletteModel";

describe("AppCommandPaletteModel", () => {
  it("labels the browser command from the active right panel", () => {
    expect(commandPaletteBrowserLabel("browser")).toBe("Hide browser");
    expect(commandPaletteBrowserLabel("settings")).toBe("Browser");
    expect(commandPaletteBrowserLabel(undefined)).toBe("Browser");
  });

  it("creates the default command order and workflow recorder label", () => {
    const items = createAppCommandPaletteItems({
      contextUsage: undefined,
      handlers: handlers(),
      rightPanel: "files",
      sidebarOpen: true,
      workflowRecorderNavLabel: "Workflow Recordings",
    });

    expect(items.map((item) => item.id)).toEqual([
      "new-chat",
      "open-folder",
      "toggle-sidebar",
      "search",
      "browser",
      "terminal",
      "files",
      "context",
      "diff",
      "plugins",
      "automations",
      "workflow-lab",
      "settings",
      "mcp-runtime-settings",
      "compact",
      "export-chat",
      "api-key",
      "diagnostics",
    ]);
    expect(items.find((item) => item.id === "toggle-sidebar")?.label).toBe("Hide sidebar");
    expect(items.find((item) => item.id === "automations")?.label).toBe("Workflow Recordings");
  });

  it("adds the recovery command only when session context is missing", () => {
    const contextUsage: ContextUsageSnapshot = {
      threadId: "thread-1",
      source: "unavailable",
      compactionCount: 0,
      diagnostics: {
        activeSession: false,
        piSessionFile: "/tmp/pi-session.json",
      },
      updatedAt: "2026-06-13T00:00:00.000Z",
    };

    const items = createAppCommandPaletteItems({
      contextUsage,
      handlers: handlers(),
      rightPanel: "browser",
      sidebarOpen: false,
      workflowRecorderNavLabel: "Automations",
    });

    expect(items.find((item) => item.id === "recover-context")?.label).toBe("Rebuild context");
    expect(items.find((item) => item.id === "toggle-sidebar")?.label).toBe("Show sidebar");
    expect(items.find((item) => item.id === "browser")?.label).toBe("Hide browser");
  });
});

function handlers(): AppCommandPaletteHandlers {
  const noop = () => undefined;
  return {
    compactActiveThread: noop,
    createThread: noop,
    exportActiveChat: noop,
    exportDiagnostics: noop,
    openApiKeyDialog: noop,
    openMcpRuntimeSettings: noop,
    openPanel: noop,
    openWorkflowLabArea: noop,
    openWorkflowRecordingsArea: noop,
    openWorkspace: noop,
    recoverActiveThreadContext: noop,
    setSidebarOpen: noop,
    togglePanel: noop,
  };
}
