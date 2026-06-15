import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { registerAgentRuntimeAmbientCliPackageTools } from "./agentRuntimeAmbientCliPackageTools";

describe("agentRuntimeAmbientCliPackageTools", () => {
  it("registers the contiguous Ambient CLI package tool group in the existing order", () => {
    const registeredTools: ToolDefinition<any, any, any>[] = [];

    registerAgentRuntimeAmbientCliPackageTools({
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
      hydrateFirstPartyAmbientCliPackageSummaries: vi.fn(),
      resolveFirstPartyPluginPermission: vi.fn(async () => true),
      markPluginToolsStale: vi.fn(),
      emitAmbientCliSecretRequested: vi.fn(),
      markAmbientCliPackageDescribed: vi.fn(),
      isAmbientCliPackageDescribed: vi.fn(() => true),
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_cli_package_preview",
      "ambient_cli_package_install",
      "ambient_cli_package_install_pi_catalog",
      "ambient_cli_env_bind",
      "ambient_cli_secret_request",
      "ambient_cli_search",
      "ambient_cli_describe",
      "ambient_cli",
    ]);
    expect(registeredTools.every((tool) => tool.executionMode === "sequential")).toBe(true);
  });
});
