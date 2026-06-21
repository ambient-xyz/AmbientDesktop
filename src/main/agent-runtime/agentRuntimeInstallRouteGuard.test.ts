import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  AgentRuntimeInstallRouteGuard,
  appendMcpInstallRouteGuidance,
  formatInstallRouteGateBlockedMessage,
  formatMcpInstallShellBlockedMessage,
  isInstallRouteGateSideEffectTool,
  looksLikeManualMcpInstallShellCommand,
} from "./agentRuntimeInstallRouteGuard";
import type { AmbientInstallRoutePlan } from "./agentRuntimeInstallRouteFacade";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

describe("AgentRuntimeInstallRouteGuard", () => {
  it("blocks install side-effect tools after a needs-clarification plan and clears on a resolved lane", () => {
    const guard = new AgentRuntimeInstallRouteGuard();
    guard.recordInstallRoutePlan("thread-1", needsClarificationPlan(), "2026-06-11T00:00:00.000Z");

    expect(guard.latestInstallRouteLane("thread-1")).toBe("needs-clarification");
    expect(isInstallRouteGateSideEffectTool("ambient_cli_package_install")).toBe(true);
    expect(isInstallRouteGateSideEffectTool("ambient_install_route_plan")).toBe(false);
    expect(guard.installRouteGateBlockForTool("thread-1", "ambient_install_route_plan")).toBeUndefined();

    const block = guard.installRouteGateBlockForTool("thread-1", "bash");
    expect(block?.reason).toContain("needs-clarification");
    expect(block?.gate).toMatchObject({
      lane: "needs-clarification",
      blockers: ["Need package source."],
      createdAt: "2026-06-11T00:00:00.000Z",
    });
    expect(block?.detail).toContain("Ask one targeted clarification before any install side effects.");
    expect(block?.detail).toContain("Retry ambient_install_route_plan with sourceUrl, localPath, packageName, or requestedKind");
    expect(formatInstallRouteGateBlockedMessage("bash", block!.detail)).toContain("Ambient install route gate blocked bash.");

    guard.recordInstallRoutePlan("thread-1", normalAppSetupPlan(), "2026-06-11T00:01:00.000Z");

    expect(guard.latestInstallRouteLane("thread-1")).toBe("normal-app-setup");
    expect(guard.installRouteGateBlockForTool("thread-1", "bash")).toBeUndefined();
  });

  it("blocks MCP install-like bash commands after route context or an MCP install user request", () => {
    const guard = new AgentRuntimeInstallRouteGuard();
    const rawToolInput = { command: "git clone https://github.com/acme/example-mcp" };

    expect(looksLikeManualMcpInstallShellCommand(rawToolInput.command)).toBe(true);
    expect(guard.mcpInstallShellBlockForTool({
      threadId: "thread-1",
      toolName: "bash",
      rawToolInput,
      latestUserText: "please run tests",
    })).toBeUndefined();

    const userRequestBlock = guard.mcpInstallShellBlockForTool({
      threadId: "thread-1",
      toolName: "bash",
      rawToolInput,
      latestUserText: "Install this MCP from github.com/acme/example-mcp",
    });
    expect(userRequestBlock?.reason).toContain("Blocked MCP install-like bash command");
    expect(userRequestBlock?.detail).toContain("No install route plan has been completed in this thread.");
    expect(formatMcpInstallShellBlockedMessage("bash", userRequestBlock!.detail)).toContain("Ambient MCP install guard blocked bash.");

    guard.recordInstallRoutePlan("thread-1", normalAppSetupPlan());
    const routeStateBlock = guard.mcpInstallShellBlockForTool({
      threadId: "thread-1",
      toolName: "bash",
      rawToolInput,
      latestUserText: "please run tests",
    });
    expect(routeStateBlock?.detail).toContain("Latest install route lane: normal-app-setup");
    expect(guard.mcpInstallShellBlockForTool({
      threadId: "thread-1",
      toolName: "write",
      rawToolInput,
      latestUserText: "Install this MCP from github.com/acme/example-mcp",
    })).toBeUndefined();
  });

  it("tracks MCP autowire state and appends prompt guidance only for sourced MCP install requests", () => {
    const guard = new AgentRuntimeInstallRouteGuard();

    expect(guard.mcpAutowirePlanned("thread-1")).toBe(false);
    guard.recordMcpAutowirePlan("thread-1");
    expect(guard.mcpAutowirePlanned("thread-1")).toBe(true);

    expect(appendMcpInstallRouteGuidance("Base prompt", "please explain MCP")).toBe("Base prompt");
    const guided = appendMcpInstallRouteGuidance(
      "Base prompt",
      "Please install this MCP server from https://github.com/acme/example-mcp",
    );
    expect(guided).toContain("Ambient MCP install route reminder:");
    expect(guided).toContain("First call ambient_mcp_autowire_plan");
  });
});

describe("AgentRuntime install route gates", () => {
  it("blocks install side-effect tools after a needs-clarification route plan until Pi replans", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-install-route-gate-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("install route gate").id, { permissionMode: "full-access" });
      const permissionRequest = vi.fn();
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequest,
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createPluginInstallToolExtension(thread.id, workspace, {} as any, undefined)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      const routeTool = registeredTools.find((tool) => tool.name === "ambient_install_route_plan");
      expect(routeTool).toBeDefined();

      const ambiguousPlan = await routeTool!.execute("route-ambiguous", {
        userRequest: "Install this thing.",
        requestedKind: "unknown",
      });
      expect(ambiguousPlan.details).toMatchObject({
        runtime: "ambient-install-route",
        toolName: "ambient_install_route_plan",
        lane: "needs-clarification",
      });

      const blocked = await (runtime as any).resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "mkdir -p ~/.agents/skills/mystery",
      });
      expect(blocked?.reason).toContain("needs-clarification");
      expect(permissionRequest).not.toHaveBeenCalled();

      const gateMessage = store
        .listMessages(thread.id)
        .find((message) => message.metadata?.runtime === "ambient-install-route-gate");
      expect(gateMessage?.content).toContain("Ambient install route gate blocked bash.");
      expect(gateMessage?.content).toContain("Ask one targeted clarification before any install side effects.");
      expect(gateMessage?.content).toContain("Retry ambient_install_route_plan with sourceUrl, localPath, packageName, or requestedKind");

      const clarifiedPlan = await routeTool!.execute("route-clarified", {
        userRequest: "Install ffmpeg for this project.",
      });
      expect(clarifiedPlan.details).toMatchObject({
        runtime: "ambient-install-route",
        toolName: "ambient_install_route_plan",
        lane: "normal-app-setup",
      });

      await expect((runtime as any).resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "echo ok",
      })).resolves.toBeUndefined();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("blocks MCP install-like bash commands before permission approval", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-mcp-install-shell-guard-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("mcp shell guard").id, { permissionMode: "full-access" });
      store.addMessage({
        threadId: thread.id,
        role: "user",
        content: "Install this MCP from https://github.com/alanpcf/brasil-data-mcp",
      });
      const permissionRequest = vi.fn();
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequest,
        denyThread: () => undefined,
      });

      const blocked = await (runtime as any).resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "git clone https://github.com/alanpcf/brasil-data-mcp /tmp/brasil-data-mcp",
      });
      const blockedReadmeFetch = await (runtime as any).resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "curl -L https://raw.githubusercontent.com/Ratnaditya-J/csvglow/main/README.md",
      });
      const blockedToolHiveRun = await (runtime as any).resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "thv run uvx://csvglow --name ambient-csvglow",
      });
      const allowedReadOnlyPathCheck = await (runtime as any).resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "ls -la /private/tmp/ambient-mcp-toolhive-route-detection && find . -name 'test_csvglow*' -maxdepth 2",
      });

      expect(blocked?.reason).toContain("Blocked MCP install-like bash command");
      expect(blockedReadmeFetch?.reason).toContain("Blocked MCP install-like bash command");
      expect(blockedToolHiveRun?.reason).toContain("Blocked MCP install-like bash command");
      expect(allowedReadOnlyPathCheck).toBeUndefined();
      expect(permissionRequest).not.toHaveBeenCalled();
      const guardMessage = store
        .listMessages(thread.id)
        .find((message) => message.metadata?.runtime === "ambient-mcp-install-shell-guard");
      expect(guardMessage?.content).toContain("Ambient MCP install guard blocked bash.");
      expect(guardMessage?.content).toContain("ToolHive wrapper");
      expect(guardMessage?.content).toContain("ambient_mcp_autowire_plan");
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("allows ToolHive shell diagnostics outside MCP install context", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-mcp-install-shell-guard-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("mcp shell guard diagnostic").id, { permissionMode: "full-access" });
      store.addMessage({
        threadId: thread.id,
        role: "user",
        content: "Check the ToolHive version.",
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
        denyThread: () => undefined,
      });

      await expect((runtime as any).resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "toolhive version",
      })).resolves.toBeUndefined();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function needsClarificationPlan(): AmbientInstallRoutePlan {
  return {
    lane: "needs-clarification",
    confidence: "low",
    reason: "The target source is ambiguous.",
    evidence: [],
    blockers: ["Need package source."],
    nextTools: [
      {
        name: "ambient_install_route_plan",
        purpose: "Replan with clarified source.",
      },
    ],
    approvalBoundary: "none-readonly",
    validationTarget: {
      kind: "route-only",
      description: "Ask one targeted clarification before any install side effects.",
    },
    warnings: [],
  };
}

function normalAppSetupPlan(): AmbientInstallRoutePlan {
  return {
    lane: "normal-app-setup",
    confidence: "high",
    reason: "This is normal project setup.",
    evidence: [],
    blockers: [],
    nextTools: [
      {
        name: "bash",
        purpose: "Run the local setup command.",
      },
    ],
    approvalBoundary: "user-approval-before-execute",
    validationTarget: {
      kind: "health-check",
      description: "Run a local smoke command.",
    },
    warnings: [],
  };
}
