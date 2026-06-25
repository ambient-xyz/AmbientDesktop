import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mcpControllerSource = readFileSync(new URL("./RightPanelMcpController.ts", import.meta.url), "utf8");
const pluginRuntimeControllerSource = readFileSync(new URL("./RightPanelMcpPluginRuntimeController.ts", import.meta.url), "utf8");

describe("RightPanelMcpPluginRuntimeController", () => {
  it("keeps plugin MCP inspection and runtime IPC ownership out of the parent MCP controller", () => {
    expect(mcpControllerSource).toContain("useRightPanelMcpPluginRuntimeController");
    expect(mcpControllerSource).not.toContain("window.ambientDesktop.inspectCodexPluginMcp");
    expect(mcpControllerSource).not.toContain("window.ambientDesktop.listPluginMcpRuntimeSnapshots");
    expect(mcpControllerSource).not.toContain("window.ambientDesktop.restartPluginMcpRuntime");
    expect(mcpControllerSource).not.toContain("window.ambientDesktop.stopPluginMcpRuntime");
    expect(pluginRuntimeControllerSource).toContain("window.ambientDesktop.inspectCodexPluginMcp");
    expect(pluginRuntimeControllerSource).toContain("window.ambientDesktop.listPluginMcpRuntimeSnapshots");
    expect(pluginRuntimeControllerSource).toContain("window.ambientDesktop.restartPluginMcpRuntime");
    expect(pluginRuntimeControllerSource).toContain("window.ambientDesktop.stopPluginMcpRuntime");
  });
});
