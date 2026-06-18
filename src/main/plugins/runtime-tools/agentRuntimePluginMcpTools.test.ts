import { describe, expect, it } from "vitest";

import type { WorkspaceState } from "../../../shared/workspaceTypes";
import { pluginMcpToolDescriptor } from "../pluginsDesktopToolFacade";
import { createPluginMcpToolExtension } from "./agentRuntimePluginMcpTools";
import type {
  PluginMcpLaunchPlan,
  PluginMcpToolInvocation,
  PluginMcpToolRegistration,
} from "../pluginHost";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("createPluginMcpToolExtension", () => {
  it("registers plugin MCP tools and forwards trusted calls with thread context", async () => {
    const registeredTools: RegisteredTool[] = [];
    const trustChecks: PluginMcpToolRegistration[] = [];
    const pluginCalls: Array<{
      plan: PluginMcpLaunchPlan;
      invocation: PluginMcpToolInvocation;
      options: { permissionMode: string; workspacePath: string; signal?: AbortSignal };
    }> = [];
    const registration = fixtureRegistration();

    createPluginMcpToolExtension({
      workspace: workspace(),
      registrations: [registration],
      getThread: () => ({ permissionMode: "workspace" }),
      ensurePluginMcpToolTrusted: async (candidate) => {
        trustChecks.push(candidate);
        return true;
      },
      callCodexPluginMcpTool: async (plan, invocation, options) => {
        pluginCalls.push({ plan, invocation, options });
        return {
          content: [{ type: "text", text: "Plugin result text." }],
          details: {
            pluginId: "plugin-1",
            pluginName: "Fixture",
            serverName: "server",
            toolName: "fixture_original",
          },
        };
      },
    })({
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    } as any);

    expect(registeredTools.map((tool) => tool.name)).toEqual(["fixture_registered"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const updates: any[] = [];
    const signal = new AbortController().signal;
    const params = { body: "x".repeat(600) };
    const result = await registeredTools[0]!.execute("plugin-call", params, signal, (update: any) => updates.push(update));

    expect(trustChecks).toEqual([registration]);
    expect(pluginCalls).toEqual([{
      plan: registration.launchPlan,
      invocation: {
        toolName: "fixture_original",
        arguments: params,
      },
      options: {
        permissionMode: "workspace",
        workspacePath: "/tmp/workspace",
        signal,
      },
    }]);
    expect(updates).toEqual([
      expect.objectContaining({
        content: [{ type: "text", text: 'Calling Codex plugin "Fixture" tool "fixture_original".' }],
        details: expect.objectContaining({
          pluginId: "plugin-1",
          pluginName: "Fixture",
          serverName: "server",
          toolName: "fixture_original",
          registeredName: "fixture_registered",
          source: "plugin-mcp",
          runtime: "chat",
          permissionMode: "workspace",
          status: "running",
          toolLongformInputPreview: expect.objectContaining({
            kind: "longform-input",
          }),
        }),
      }),
    ]);
    expect(result).toMatchObject({
      content: [{ type: "text", text: "Plugin result text." }],
      details: {
        pluginId: "plugin-1",
        pluginName: "Fixture",
        serverName: "server",
        toolName: "fixture_original",
        registeredName: "fixture_registered",
        source: "plugin-mcp",
        runtime: "chat",
        permissionMode: "workspace",
        result: "completed",
        toolLongformInputPreview: expect.objectContaining({
          kind: "longform-input",
        }),
      },
    });
  });

  it("blocks untrusted plugin MCP tools before emitting updates or invoking the plugin host", async () => {
    const registeredTools: RegisteredTool[] = [];
    let pluginCallCount = 0;

    createPluginMcpToolExtension({
      workspace: workspace(),
      registrations: [fixtureRegistration()],
      getThread: () => ({ permissionMode: "workspace" }),
      ensurePluginMcpToolTrusted: async () => false,
      callCodexPluginMcpTool: async () => {
        pluginCallCount += 1;
        throw new Error("Should not call plugin host.");
      },
    })({
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    } as any);

    const updates: any[] = [];
    await expect(registeredTools[0]!.execute("blocked", {}, undefined, (update: any) => updates.push(update))).rejects.toThrow(
      "Codex plugin tool blocked by Ambient Desktop plugin trust policy.",
    );
    expect(updates).toEqual([]);
    expect(pluginCallCount).toBe(0);
  });
});

function workspace(): WorkspaceState {
  return {
    path: "/tmp/workspace",
    name: "workspace",
    statePath: "/tmp/workspace/.ambient",
    sessionPath: "/tmp/workspace/.ambient/session",
  };
}

function fixtureRegistration(): PluginMcpToolRegistration {
  const descriptor = pluginMcpToolDescriptor({
    registeredName: "fixture_registered",
    label: "Fixture tool",
    description: "Fixture plugin tool.",
    promptSnippet: "fixture_registered: Fixture plugin tool.",
    promptGuidelines: [],
    parameters: { type: "object", properties: {}, additionalProperties: true },
  });
  return {
    registeredName: "fixture_registered",
    originalName: "fixture_original",
    label: descriptor.label,
    description: descriptor.description,
    promptSnippet: descriptor.promptSnippet,
    promptGuidelines: descriptor.promptGuidelines,
    parameters: descriptor.inputSchema,
    descriptor,
    launchPlan: {
      pluginId: "plugin-1",
      pluginName: "Fixture",
      pluginVersion: "1.0.0",
      pluginFingerprint: "fixture-fingerprint",
      serverName: "server",
      cwd: "/tmp/workspace",
      command: "node",
      args: [],
      envKeys: [],
      enabled: true,
      startable: true,
    },
    tool: {
      pluginId: "plugin-1",
      pluginName: "Fixture",
      serverName: "server",
      name: "fixture_original",
    },
  };
}
