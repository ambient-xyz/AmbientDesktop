import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { registerAgentRuntimePiExtensionSandboxTools } from "./agentRuntimePiExtensionSandboxTools";

describe("agentRuntimePiExtensionSandboxTools", () => {
  it("registers the sandboxed Pi extension tool group in the existing order", () => {
    const registeredTools: ToolDefinition<any, any, any>[] = [];

    registerAgentRuntimePiExtensionSandboxTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: {
        path: "/workspace",
        name: "Workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      getThread: () => ({
        id: "thread-1",
        title: "Thread",
        workspacePath: "/workspace",
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        lastMessagePreview: "",
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "model",
        thinkingLevel: "medium",
      }) as any,
      resolveFirstPartyPluginPermission: vi.fn(async () => true),
      revokePluginGrantsForLabels: vi.fn(() => 0),
      markPluginToolsStale: vi.fn(),
      emit: vi.fn(),
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_pi_extension_install_sandboxed",
      "ambient_pi_extension",
      "ambient_pi_extension_uninstall_sandboxed",
      "ambient_pi_extension_history",
      "ambient_pi_extension_clear_history",
    ]);
    expect(registeredTools.every((tool) => tool.executionMode === "sequential")).toBe(true);
  });
});
