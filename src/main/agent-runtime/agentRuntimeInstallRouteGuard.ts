import type { AmbientInstallRoutePlan } from "./agentRuntimeInstallRouteFacade";

export interface InstallRouteGate {
  lane: AmbientInstallRoutePlan["lane"];
  reason: string;
  blockers: string[];
  nextTools: string[];
  validationTarget?: AmbientInstallRoutePlan["validationTarget"];
  createdAt: string;
}

export interface InstallRoutePlanState {
  lane: AmbientInstallRoutePlan["lane"];
  nextTools: string[];
  createdAt: string;
}

export interface McpAutowirePlanState {
  createdAt: string;
}

export interface InstallRouteGateBlock {
  reason: string;
  detail: string;
  gate: InstallRouteGate;
}

export interface McpInstallShellBlock {
  reason: string;
  detail: string;
}

const installRouteGateSideEffectTools = new Set([
  "bash",
  "shell",
  "write",
  "edit",
  "file_write",
  "file_edit",
  "ambient_download_start",
  "media_download",
  "ambient_plugin_install_commit",
  "ambient_plugin_activate",
  "ambient_capability_builder_scaffold",
  "ambient_capability_builder_write_file",
  "ambient_capability_builder_secret_request",
  "ambient_capability_builder_apply_repair",
  "ambient_capability_builder_unregister",
  "ambient_capability_builder_install_deps",
  "ambient_capability_builder_validate",
  "ambient_capability_builder_register",
  "ambient_cli_package_install",
  "ambient_cli_package_install_pi_catalog",
  "ambient_cli_env_bind",
  "ambient_cli",
  "ambient_local_deep_research_provider_update",
  "ambient_local_deep_research_setup",
  "ambient_mcp_guided_bridge_register",
  "ambient_mcp_server_install",
  "ambient_mcp_server_uninstall",
  "ambient_mcp_tool_policy_update",
  "ambient_privileged_action_request",
  "ambient_git_commit",
  "ambient_git_finish_to_main",
]);

export class AgentRuntimeInstallRouteGuard {
  private readonly installRouteGates = new Map<string, InstallRouteGate>();
  private readonly installRoutePlanStates = new Map<string, InstallRoutePlanState>();
  private readonly mcpAutowirePlanStates = new Map<string, McpAutowirePlanState>();

  recordInstallRoutePlan(threadId: string, plan: AmbientInstallRoutePlan, createdAt = new Date().toISOString()): void {
    this.installRoutePlanStates.set(threadId, {
      lane: plan.lane,
      nextTools: plan.nextTools.map((tool) => tool.name),
      createdAt,
    });
    if (plan.lane !== "needs-clarification") {
      this.installRouteGates.delete(threadId);
      return;
    }
    this.installRouteGates.set(threadId, {
      lane: plan.lane,
      reason: plan.reason,
      blockers: plan.blockers,
      nextTools: plan.nextTools.map((tool) => tool.name),
      validationTarget: plan.validationTarget,
      createdAt,
    });
  }

  recordMcpAutowirePlan(threadId: string, createdAt = new Date().toISOString()): void {
    this.mcpAutowirePlanStates.set(threadId, { createdAt });
  }

  latestInstallRouteLane(threadId: string): AmbientInstallRoutePlan["lane"] | undefined {
    return this.installRoutePlanStates.get(threadId)?.lane;
  }

  mcpAutowirePlanned(threadId: string): boolean {
    return this.mcpAutowirePlanStates.has(threadId);
  }

  installRouteGateBlockForTool(threadId: string, toolName: string): InstallRouteGateBlock | undefined {
    const gate = this.installRouteGates.get(threadId);
    if (!gate || !isInstallRouteGateSideEffectTool(toolName)) return undefined;
    const blockers = gate.blockers.length ? gate.blockers.join("\n- ") : "Install source or intended capability kind is unclear.";
    const nextTools = gate.nextTools.length ? gate.nextTools.join(", ") : "ambient_install_route_plan";
    const detail = [
      "The latest ambient_install_route_plan for this thread returned needs-clarification.",
      `Reason: ${gate.reason}`,
      gate.validationTarget?.description ?? "Ask one targeted clarification before any install side effects.",
      `Blocked tool: ${toolName}`,
      `Blockers:\n- ${blockers}`,
      `Retry ${nextTools} with sourceUrl, localPath, packageName, or requestedKind after the clarification is answered.`,
    ].join("\n\n");
    return {
      reason: "Blocked by Ambient install route gate: needs-clarification must be resolved before install side effects.",
      detail,
      gate,
    };
  }

  mcpInstallShellBlockForTool(input: {
    threadId: string;
    toolName: string;
    rawToolInput: unknown;
    latestUserText: string;
  }): McpInstallShellBlock | undefined {
    if (input.toolName !== "bash") return undefined;
    const command = recordStringField(input.rawToolInput, "command");
    if (!command || !looksLikeManualMcpInstallShellCommand(command)) return undefined;
    const routeState = this.installRoutePlanStates.get(input.threadId);
    if (!routeState && !looksLikeMcpInstallUserRequest(input.latestUserText)) return undefined;
    const detail = [
      "This bash command looks like a manual MCP install or source clone.",
      "MCP installs must go through Ambient's typed install route, autowire review, and ToolHive wrapper so permissions, secrets, persistence, and validation are captured.",
      `Command: ${command.slice(0, 500)}`,
      routeState ? `Latest install route lane: ${routeState.lane}` : "No install route plan has been completed in this thread.",
      "Next: call ambient_install_route_plan or ambient_mcp_autowire_plan for the target, then use the returned ToolHive install path.",
    ].join("\n\n");
    return {
      reason: "Blocked MCP install-like bash command; use Ambient MCP autowire/ToolHive install tools instead.",
      detail,
    };
  }
}

export function isInstallRouteGateSideEffectTool(toolName: string): boolean {
  return installRouteGateSideEffectTools.has(toolName);
}

export function formatInstallRouteGateBlockedMessage(toolName: string, detail: string): string {
  return `Ambient install route gate blocked ${toolName}.\n\n${detail}`;
}

export function formatMcpInstallShellBlockedMessage(toolName: string, detail: string): string {
  return `Ambient MCP install guard blocked ${toolName}.\n\n${detail}`;
}

export function looksLikeManualMcpInstallShellCommand(command: string): boolean {
  const normalized = command.toLowerCase();
  const commandStart = String.raw`(?:^|[;&|]\s*|\|\|\s*|&&\s*)(?:env\s+(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*)?(?:sudo\s+)?`;
  if (new RegExp(`${commandStart}(?:\\S*/)?(?:thv|toolhive)\\s+(?:run|start|restart|stop|rm|remove|delete|install|register|source|proxy|secret|config|mcp)\\b`).test(normalized)) {
    return true;
  }
  if (new RegExp(`${commandStart}(?:curl|wget)\\b`).test(normalized) &&
    /\b(?:github\.com|raw\.githubusercontent\.com|api\.github\.com\/repos|gitlab\.com)\b/.test(normalized)) {
    return true;
  }
  if (new RegExp(`${commandStart}gh\\s+repo\\s+(?:view|clone)\\b`).test(normalized) &&
    /\b(?:github\.com|gitlab\.com|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\b/i.test(command)) {
    return true;
  }
  if (new RegExp(`${commandStart}git\\s+(?:clone|ls-remote|show|archive)\\b`).test(normalized) &&
    /\b(?:github\.com|raw\.githubusercontent\.com|api\.github\.com\/repos|gitlab\.com)\b/.test(normalized)) {
    return true;
  }
  if (!new RegExp(`${commandStart}(?:git\\s+clone|npm\\s+(?:install|i)|pnpm\\s+(?:add|install)|yarn\\s+add|pipx\\s+install|pip\\s+install|uvx|npx)\\b`).test(normalized)) return false;
  return /\b(?:mcp|modelcontextprotocol|toolhive|server\.json)\b/.test(normalized) ||
    /github\.com\/[^ \n"'`]+mcp/i.test(command);
}

export function appendMcpInstallRouteGuidance(promptContent: string, userText: string): string {
  if (!looksLikeMcpInstallUserRequest(userText) || !looksLikeMcpInstallSource(userText)) return promptContent;
  return [
    promptContent,
    "",
    "Ambient MCP install route reminder:",
    "- This request appears to install or add an MCP server/capability from a GitHub, package, registry, or metadata source.",
    "- First call ambient_mcp_autowire_plan with the targetUrl/package target before bash, git clone, curl, package-manager installs, raw ToolHive commands, browser inspection, or source checkout.",
    "- Then follow the returned reviewed route: ambient_mcp_autowire_review, the exact describe/install handoff, and direct ambient_mcp_tool_search/describe/call for verification.",
  ].join("\n");
}

function looksLikeMcpInstallSource(text: string): boolean {
  return /\b(?:https?:\/\/|github\.com\/|raw\.githubusercontent\.com\/|gitlab\.com\/|npm:|pypi:|server\.json|smithery\.yaml|\.mcp\.json)\b/i.test(text);
}

function looksLikeMcpInstallUserRequest(text: string): boolean {
  const normalized = text.toLowerCase();
  return /\b(?:install|add|setup|set\s+up|import|register|wrap|capability)\b/.test(normalized) &&
    /\b(?:mcp|model context protocol|toolhive|github\.com|server\.json)\b/.test(normalized);
}

function recordStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim() ? field : undefined;
}
