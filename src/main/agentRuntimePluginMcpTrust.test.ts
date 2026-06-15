import { describe, expect, it, vi } from "vitest";

import type { PermissionAuditEntry, ThreadSummary, WorkspaceState } from "../shared/types";
import type { PluginMcpToolRegistration } from "./plugins/pluginHost";
import {
  buildPluginMcpTrustedPermissionAudit,
  ensurePluginMcpToolTrusted,
  formatPluginMcpTrustDetail,
  pluginMcpTrustPermissionRequest,
} from "./agentRuntimePluginMcpTrust";

describe("agentRuntimePluginMcpTrust", () => {
  it("builds the existing plugin MCP trust permission request", () => {
    const request = pluginMcpTrustPermissionRequest({
      workspace: workspace(),
      permissionMode: "workspace",
      registration: registration(),
    });

    expect(request).toEqual({
      title: 'Trust Codex plugin "Fixture Plugin"?',
      message: "Ambient wants to run a local MCP tool from this plugin. Trusting it allows future tool calls from this plugin without another first-use prompt.",
      detail: [
        "Plugin: Fixture Plugin",
        "Plugin path: /workspace/.ambient/plugins/fixture",
        "Workspace: /workspace",
        "Effective mode: Workspace scope",
        "MCP server: fixture-server",
        "Command: node server.mjs --stdio",
        "Environment keys: API_KEY, MODEL",
        "Tool: fixture_echo",
      ].join("\n"),
      grantTargetLabel: "Trust Codex plugin Fixture Plugin",
      grantTargetIdentity: ["codex_plugin_trust", "fixture-plugin", "fingerprint-1"].join("\0"),
      allowedReason: "Plugin trusted by Ambient permission grant policy.",
      deniedReason: "Plugin trust prompt denied or timed out.",
    });
  });

  it("keeps fallback text for undeclared commands and full-access mode", () => {
    expect(formatPluginMcpTrustDetail({
      workspace: workspace(),
      permissionMode: "full-access",
      registration: registration({
        command: undefined,
        args: [],
        envKeys: [],
      }),
    })).toBe([
      "Plugin: Fixture Plugin",
      "Plugin path: /workspace/.ambient/plugins/fixture",
      "Workspace: /workspace",
      "Effective mode: Full access",
      "MCP server: fixture-server",
      "Command: not declared",
      "Environment keys: none",
      "Tool: fixture_echo",
    ].join("\n"));
  });

  it("builds the audit entry for previously trusted plugin MCP tools", () => {
    expect(buildPluginMcpTrustedPermissionAudit({
      runId: "run-1",
      threadId: "thread-1",
      permissionMode: "full-access",
      toolName: "fixture_plugin_fixture_echo",
      detail: "Plugin: Fixture Plugin",
    })).toEqual({
      runId: "run-1",
      threadId: "thread-1",
      permissionMode: "full-access",
      toolName: "fixture_plugin_fixture_echo",
      risk: "plugin-tool",
      decision: "allowed",
      detail: "Plugin: Fixture Plugin",
      reason: "Allowed previously trusted Codex plugin MCP tool invocation.",
      decisionSource: "persistent_grant",
    });
  });

  it("asks for first-use trust and persists the plugin fingerprint when allowed", async () => {
    const options = bridgeOptions({ trusted: false, permissionAllowed: true });

    await expect(ensurePluginMcpToolTrusted({
      threadId: "thread-1",
      workspace: workspace(),
      registration: registration(),
    }, options)).resolves.toBe(true);

    expect(options.resolveFirstPartyPluginPermission).toHaveBeenCalledWith({
      thread: thread(),
      workspace: workspace(),
      toolName: "fixture_plugin_fixture_echo",
      title: 'Trust Codex plugin "Fixture Plugin"?',
      message: "Ambient wants to run a local MCP tool from this plugin. Trusting it allows future tool calls from this plugin without another first-use prompt.",
      detail: [
        "Plugin: Fixture Plugin",
        "Plugin path: /workspace/.ambient/plugins/fixture",
        "Workspace: /workspace",
        "Effective mode: Workspace scope",
        "MCP server: fixture-server",
        "Command: node server.mjs --stdio",
        "Environment keys: API_KEY, MODEL",
        "Tool: fixture_echo",
      ].join("\n"),
      grantTargetLabel: "Trust Codex plugin Fixture Plugin",
      grantTargetIdentity: ["codex_plugin_trust", "fixture-plugin", "fingerprint-1"].join("\0"),
      allowedReason: "Plugin trusted by Ambient permission grant policy.",
      deniedReason: "Plugin trust prompt denied or timed out.",
    });
    expect(options.setPluginTrusted).toHaveBeenCalledWith("fixture-plugin", true, "fingerprint-1");
    expect(options.addPermissionAudit).not.toHaveBeenCalled();
  });

  it("does not persist first-use trust when permission is denied", async () => {
    const options = bridgeOptions({ trusted: false, permissionAllowed: false });

    await expect(ensurePluginMcpToolTrusted({
      threadId: "thread-1",
      workspace: workspace(),
      registration: registration(),
    }, options)).resolves.toBe(false);

    expect(options.setPluginTrusted).not.toHaveBeenCalled();
    expect(options.addPermissionAudit).not.toHaveBeenCalled();
  });

  it("records a persistent-grant audit for already trusted plugin MCP tools", async () => {
    const options = bridgeOptions({ trusted: true, permissionAllowed: false });

    await expect(ensurePluginMcpToolTrusted({
      threadId: "thread-1",
      workspace: workspace(),
      registration: registration(),
    }, options)).resolves.toBe(true);

    expect(options.resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(options.addPermissionAudit).toHaveBeenCalledWith({
      runId: "run-1",
      threadId: "thread-1",
      permissionMode: "workspace",
      toolName: "fixture_plugin_fixture_echo",
      risk: "plugin-tool",
      decision: "allowed",
      detail: [
        "Plugin: Fixture Plugin",
        "Plugin path: /workspace/.ambient/plugins/fixture",
        "Workspace: /workspace",
        "Effective mode: Workspace scope",
        "MCP server: fixture-server",
        "Command: node server.mjs --stdio",
        "Environment keys: API_KEY, MODEL",
        "Tool: fixture_echo",
      ].join("\n"),
      reason: "Allowed previously trusted Codex plugin MCP tool invocation.",
      decisionSource: "persistent_grant",
    });
    expect(options.emitPermissionAuditCreated).toHaveBeenCalledWith(auditEntry());
  });
});

function workspace(): WorkspaceState {
  return {
    path: "/workspace",
    name: "Workspace",
    statePath: "/workspace/.ambient",
    sessionPath: "/workspace/.ambient/sessions",
  };
}

function thread(): ThreadSummary {
  return {
    id: "thread-1",
    title: "Fixture Thread",
    workspacePath: "/workspace",
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient",
    thinkingLevel: "medium",
  };
}

function registration(overrides: Partial<PluginMcpToolRegistration["launchPlan"]> = {}): PluginMcpToolRegistration {
  return {
    registeredName: "fixture_plugin_fixture_echo",
    originalName: "fixture_echo",
    launchPlan: {
      pluginId: "fixture-plugin",
      pluginName: "Fixture Plugin",
      pluginVersion: "1.0.0",
      pluginFingerprint: "fingerprint-1",
      serverName: "fixture-server",
      cwd: "/workspace/.ambient/plugins/fixture",
      command: "node",
      args: ["server.mjs", "--stdio"],
      envKeys: ["API_KEY", "MODEL"],
      enabled: true,
      startable: true,
      ...overrides,
    },
    tool: {
      pluginId: "fixture-plugin",
      pluginName: "Fixture Plugin",
      serverName: "fixture-server",
    },
  } as PluginMcpToolRegistration;
}

function auditEntry(): PermissionAuditEntry {
  return {
    id: "audit-1",
    createdAt: "2026-06-12T00:00:00.000Z",
    runId: "run-1",
    threadId: "thread-1",
    permissionMode: "workspace",
    toolName: "fixture_plugin_fixture_echo",
    risk: "plugin-tool",
    decision: "allowed",
    detail: "Plugin: Fixture Plugin",
    reason: "Allowed previously trusted Codex plugin MCP tool invocation.",
    decisionSource: "persistent_grant",
  };
}

function bridgeOptions(input: { trusted: boolean; permissionAllowed: boolean }) {
  return {
    getThread: vi.fn(() => thread()),
    activeRunIdForThread: vi.fn(() => "run-1"),
    isPluginTrusted: vi.fn(() => input.trusted),
    setPluginTrusted: vi.fn(),
    resolveFirstPartyPluginPermission: vi.fn(async () => input.permissionAllowed),
    addPermissionAudit: vi.fn(() => auditEntry()),
    emitPermissionAuditCreated: vi.fn(),
  };
}
