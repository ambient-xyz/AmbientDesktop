import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { AgentRuntimePluginPermissionController } from "./agentRuntimePluginPermissionController";
import type { PluginMcpToolRegistration } from "./agentRuntimePluginsFacade";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

describe("AgentRuntimePluginPermissionController", () => {
  it("emits full-access first-party plugin permission audits with the active run id", async () => {
    const { store, workspacePath } = await openTempStore();
    const thread = store.updateThreadSettings(store.createThread("plugin permission").id, { permissionMode: "full-access" });
    const run = startStreamingRun(store, thread.id);
    const events: DesktopEvent[] = [];
    const requestPermission = vi.fn(async () => {
      throw new Error("Full Access plugin permission should not prompt.");
    });
    try {
      const controller = new AgentRuntimePluginPermissionController({
        store,
        requestPermission,
        activeRunId: () => run.id,
        emit: (event) => events.push(event),
      });

      await expect(controller.resolveFirstPartyPluginPermission({
        thread,
        workspace: { path: workspacePath },
        toolName: "ambient_cli",
        title: "Run Ambient CLI package?",
        message: "Run package.",
        detail: "Package: fixture",
        grantTargetLabel: "Run Ambient CLI fixture:echo",
        allowedReason: "Approved by test.",
        deniedReason: "Denied by test.",
      })).resolves.toBe(true);

      expect(requestPermission).not.toHaveBeenCalled();
      expect(store.listPermissionAudit(1)).toEqual([
        expect.objectContaining({
          runId: run.id,
          threadId: thread.id,
          permissionMode: "full-access",
          toolName: "ambient_cli",
          decision: "allowed",
          decisionSource: "allowed_by_full_access",
        }),
      ]);
      expect(events).toEqual([
        expect.objectContaining({
          type: "permission-audit-created",
          entry: expect.objectContaining({
            runId: run.id,
            threadId: thread.id,
            toolName: "ambient_cli",
          }),
        }),
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("records trusted plugin MCP tool audits through the runtime store and event bridge", async () => {
    const { store, workspacePath } = await openTempStore();
    const thread = store.createThread("trusted plugin");
    const run = startStreamingRun(store, thread.id);
    const events: DesktopEvent[] = [];
    const requestPermission = vi.fn(async () => {
      throw new Error("Trusted plugin MCP tools should not prompt.");
    });
    try {
      store.setPluginTrusted("fixture-plugin", true, "fingerprint-1");
      const controller = new AgentRuntimePluginPermissionController({
        store,
        requestPermission,
        activeRunId: () => run.id,
        emit: (event) => events.push(event),
      });

      await expect(controller.ensurePluginMcpToolTrusted(
        thread.id,
        store.getWorkspace(),
        pluginMcpRegistration(workspacePath),
      )).resolves.toBe(true);

      expect(requestPermission).not.toHaveBeenCalled();
      expect(store.listPermissionAudit(1)).toEqual([
        expect.objectContaining({
          runId: run.id,
          threadId: thread.id,
          toolName: "fixture_plugin_fixture_echo",
          decision: "allowed",
          decisionSource: "persistent_grant",
        }),
      ]);
      expect(events).toEqual([
        expect.objectContaining({
          type: "permission-audit-created",
          entry: expect.objectContaining({
            runId: run.id,
            threadId: thread.id,
            toolName: "fixture_plugin_fixture_echo",
          }),
        }),
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

async function openTempStore(): Promise<{ store: ProjectStore; workspacePath: string }> {
  const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-plugin-permission-owner-"));
  const store = new ProjectStore();
  store.openWorkspace(workspacePath);
  return { store, workspacePath };
}

function startStreamingRun(store: ProjectStore, threadId: string) {
  const assistant = store.addMessage({
    threadId,
    role: "assistant",
    content: "",
    metadata: { status: "streaming", runtime: "pi" },
  });
  return store.startRun({ threadId, assistantMessageId: assistant.id });
}

function pluginMcpRegistration(workspacePath: string): PluginMcpToolRegistration {
  const descriptor: PluginMcpToolRegistration["descriptor"] = {
    name: "fixture_plugin_fixture_echo",
    label: "Fixture Echo",
    description: "Echo fixture input.",
    promptSnippet: "Use Fixture Echo for test echoes.",
    promptGuidelines: [],
    inputSchema: { type: "object" },
    source: "plugin-mcp",
    sideEffects: "plugin-defined",
    permissionScope: "plugin",
    supportsDryRun: false,
    supportsUndo: false,
    idempotency: "not-supported",
    defaultTimeoutMs: 30_000,
  };
  const workspace: WorkspaceState = {
    path: workspacePath,
    name: "Workspace",
    statePath: join(workspacePath, ".ambient"),
    sessionPath: join(workspacePath, ".ambient", "sessions"),
  };
  return {
    registeredName: "fixture_plugin_fixture_echo",
    originalName: "fixture_echo",
    label: "Fixture Echo",
    description: "Echo fixture input.",
    promptSnippet: "Use Fixture Echo for test echoes.",
    promptGuidelines: [],
    parameters: { type: "object" },
    descriptor,
    launchPlan: {
      pluginId: "fixture-plugin",
      pluginName: "Fixture Plugin",
      pluginVersion: "1.0.0",
      pluginFingerprint: "fingerprint-1",
      serverName: "fixture-server",
      cwd: join(workspace.path, ".ambient", "plugins", "fixture"),
      command: "node",
      args: ["server.mjs", "--stdio"],
      envKeys: ["API_KEY"],
      enabled: true,
      startable: true,
    },
    tool: {
      pluginId: "fixture-plugin",
      pluginName: "Fixture Plugin",
      serverName: "fixture-server",
      name: "fixture_echo",
      description: "Echo fixture input.",
      inputSchema: { type: "object" },
    },
  };
}
