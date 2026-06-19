import { describe, expect, it } from "vitest";

import {
  AgentRuntimeInstallRouteGuard,
  appendMcpInstallRouteGuidance,
  formatInstallRouteGateBlockedMessage,
  formatMcpInstallShellBlockedMessage,
  isInstallRouteGateSideEffectTool,
  looksLikeManualMcpInstallShellCommand,
} from "./agentRuntimeInstallRouteGuard";
import type { AmbientInstallRoutePlan } from "./agentRuntimeInstallRouteFacade";

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
