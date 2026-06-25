import { homedir } from "node:os";
import { isAbsolute, normalize, resolve, sep } from "node:path";

import type { PermissionMode } from "../../shared/permissionTypes";
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

export interface RawPiInstallRootBlock {
  reason: string;
  detail: string;
  protectedRoot: string;
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

const rawPiInstallRootToolNames = new Set(["bash", "shell", "bash_start", "bash_write", "write", "edit", "file_write", "file_edit"]);
const protectedRawPiInstallRootSpecs = [
  "~/.agents/skills",
  "~/.agents/plugins",
  "~/.codex/skills",
  "~/.codex/plugins",
  "~/.ambient/skills",
  "~/.ambient/plugins",
  "~/.pi/skills",
  "~/.pi/plugins",
];

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

  rawPiInstallRootBlockForTool(input: {
    toolName: string;
    rawToolInput: unknown;
    permissionMode?: PermissionMode;
  }): RawPiInstallRootBlock | undefined {
    if (!rawPiInstallRootToolNames.has(input.toolName)) return undefined;
    if (isShellCommandTool(input.toolName)) {
      const command = recordStringField(input.rawToolInput, "command") ??
        recordStringField(input.rawToolInput, "cmd") ??
        recordStringField(input.rawToolInput, "chars");
      const cwd = recordStringField(input.rawToolInput, "cwd");
      const cwdProtectedRoot = cwd ? protectedRawPiInstallRootForPath(cwd) : undefined;
      const cwdNamespace = cwd ? protectedRawPiNamespaceParentForPath(cwd) : undefined;
      const shellMutationRoot = command ? protectedRawPiInstallRootMutationForShellCommand(command, cwdProtectedRoot, {
        blockProtectedRootCd: input.toolName === "bash_write" || input.toolName === "bash_start",
      }) : undefined;
      const protectedRoot = command ? shellMutationRoot ??
        cwdProtectedRoot ??
        protectedRawPiRootForNamespaceRelativeCommand(cwdNamespace, command) : cwdProtectedRoot;
      if (command && cwdProtectedRoot && input.toolName === "bash_start") {
        return rawPiInstallRootBlock({
          toolName: input.toolName,
          protectedRoot: cwdProtectedRoot,
          target: `cwd: ${cwd}\nCommand: ${command.slice(0, 500)}`,
        });
      }
      const shellNavigationRoot = command && (input.toolName === "bash_write" || input.toolName === "bash_start")
        ? protectedRawPiBashWriteNavigationRoot(command)
        : undefined;
      if (command && shellNavigationRoot) {
        return rawPiInstallRootBlock({
          toolName: input.toolName,
          protectedRoot: shellNavigationRoot,
          target: command.slice(0, 500),
        });
      }
      const namespaceRelativeRoot = command ? protectedRawPiRootForNamespaceRelativeCommand(cwdNamespace, command) : undefined;
      if (command && namespaceRelativeRoot) {
        return rawPiInstallRootBlock({
          toolName: input.toolName,
          protectedRoot: namespaceRelativeRoot,
          target: `cwd: ${cwd}\nCommand: ${command.slice(0, 500)}`,
        });
      }
      if (command && cwdNamespace && input.toolName === "bash_start") {
        return rawPiInstallRootBlock({
          toolName: input.toolName,
          protectedRoot: `~/.${cwdNamespace}`,
          target: `cwd: ${cwd}\nCommand: ${command.slice(0, 500)}`,
        });
      }
      if (!command || !protectedRoot || !shellMutationRoot) return undefined;
      return rawPiInstallRootBlock({
        toolName: input.toolName,
        protectedRoot,
        target: cwdProtectedRoot ? `cwd: ${cwd}\nCommand: ${command.slice(0, 500)}` : command.slice(0, 500),
      });
    }
    const path = recordStringField(input.rawToolInput, "path") ??
      recordStringField(input.rawToolInput, "filePath") ??
      recordStringField(input.rawToolInput, "absolutePath");
    if (!path) return undefined;
    const protectedRoot = path ? protectedRawPiInstallRootForPath(path) : undefined;
    if (!protectedRoot) return undefined;
    return rawPiInstallRootBlock({
      toolName: input.toolName,
      protectedRoot,
      target: path,
    });
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

export function formatRawPiInstallRootBlockedMessage(toolName: string, detail: string): string {
  return `Ambient raw Pi install root guard blocked ${toolName}.\n\n${detail}`;
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

export function looksLikeRawPiInstallRootWriteShellCommand(
  command: string,
  initialProtectedRoot?: string,
  options: { blockProtectedRootCd?: boolean } = {},
): boolean {
  return Boolean(protectedRawPiInstallRootMutationForShellCommand(command, initialProtectedRoot, options));
}

function protectedRawPiInstallRootMutationForShellCommand(
  command: string,
  initialProtectedRoot?: string,
  options: { blockProtectedRootCd?: boolean } = {},
): string | undefined {
  const explicitProtectedRoots = protectedRawPiInstallRootMentionsInCommand(command);
  const assembledProtectedRoot = protectedRawPiInstallRootAssembledInCommand(command);
  if (!initialProtectedRoot && !explicitProtectedRoots.length && !assembledProtectedRoot) return undefined;
  let currentProtectedRoot: string | undefined = initialProtectedRoot;
  for (const segment of shellCommandSegments(command)) {
    const cdProtectedRoot = protectedRawPiInstallRootCdSegment(segment);
    if (cdProtectedRoot) {
      if (options.blockProtectedRootCd) return cdProtectedRoot;
      currentProtectedRoot = cdProtectedRoot;
      continue;
    }
    if (looksLikeCdSegment(segment)) {
      currentProtectedRoot = undefined;
      continue;
    }
    const redirectionRoot = protectedRawPiInstallRootFromOutputRedirection(segment);
    if (redirectionRoot) return redirectionRoot;
    if (assembledProtectedRoot && shellSegmentWritesVariableDestination(segment)) return assembledProtectedRoot;
    const segmentProtectedRoots = protectedRawPiInstallRootMentionsInCommand(segment);
    if (segmentProtectedRoots.length) {
      if (shellSegmentLooksReadOnly(segment)) continue;
      if (shellSegmentLooksProtectedRootReadExport(segment)) continue;
      return preferredMutatingProtectedRoot(segmentProtectedRoots);
    }
    if (currentProtectedRoot) {
      if (segmentRedirectsToRelativePath(segment)) return currentProtectedRoot;
      if (shellSegmentLooksReadOnly(segment)) continue;
      if (shellSegmentLooksProtectedCwdReadExport(segment)) continue;
      return currentProtectedRoot;
    }
  }
  return undefined;
}

function shellSegmentLooksReadOnly(segment: string): boolean {
  const normalized = segment.toLowerCase();
  const commandStart = String.raw`(?:^|[;&|]\s*|\|\|\s*|&&\s*)(?:env\s+(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*)?(?:sudo\s+)?`;
  if (/\$\(|`/.test(segment)) return false;
  if (segmentRedirectsToProtectedRawPiRoot(segment)) return false;
  const commandMatch = new RegExp(`${commandStart}(\\S+)\\b`).exec(normalized);
  const command = commandMatch?.[1];
  if (!command) return false;
  if (["ls", "cat", "rg", "grep", "stat", "du", "pwd", "test", "[", "echo", "printf", "head", "tail", "wc", "file", "realpath", "basename", "dirname"].includes(command)) {
    return true;
  }
  if (command === "find") {
    return !/(?:^|\s)-(?:delete|exec|execdir|ok|okdir|fprint\d*|fprintf|fls)\b/.test(normalized);
  }
  if (command === "sed") {
    return !sedSegmentUsesInPlaceOption(normalized) && !sedSegmentContainsWriteCommand(normalized);
  }
  return false;
}

function sedSegmentUsesInPlaceOption(segment: string): boolean {
  return /(?:^|\s)(?:-[A-Za-z]*i(?:\S*)?|--in-place(?:=\S*)?)(?=$|\s)/.test(segment);
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

function isShellCommandTool(toolName: string): boolean {
  return toolName === "bash" || toolName === "shell" || toolName === "bash_start" || toolName === "bash_write";
}

function rawPiInstallRootBlock(input: { toolName: string; protectedRoot: string; target: string }): RawPiInstallRootBlock {
  const detail = [
    "This side-effect tool targets a durable home-level agent skill/plugin root.",
    "Ambient blocks direct raw Pi/agent package writes there so installs stay on typed routes with preview, route metadata, grants, and validation.",
    `Protected root: ${input.protectedRoot}`,
    `Tool: ${input.toolName}`,
    `Target: ${input.target}`,
    "Next: use ambient_install_route_plan, then ambient_cli_package_install_pi_catalog for reviewed wrappers, ambient_capability_builder_plan for generated wrappers, or ambient_pi_privileged_scan plus a raw-pi-exception installRoute for an explicitly approved raw exception.",
  ].join("\n\n");
  return {
    reason: "Blocked direct write to durable agent skill/plugin root; use Ambient install routes instead.",
    detail,
    protectedRoot: input.protectedRoot,
  };
}

function isManagedSkillProtectedRoot(protectedRoot: string): boolean {
  return /^~\/\.(?:agents|codex|ambient)\/skills$/i.test(protectedRoot);
}

function protectedRawPiInstallRootMentionedInCommand(command: string): string | undefined {
  return protectedRawPiInstallRootMentionsInCommand(command)[0]?.root;
}

function protectedRawPiInstallRootMentionsInCommand(command: string): Array<{ root: string; index: number }> {
  return protectedRawPiInstallRootSpecs
    .map((root) => {
      const match = protectedRootCommandPattern(root).exec(command);
      return match ? { root, index: match.index } : undefined;
    })
    .filter((match): match is { root: string; index: number } => Boolean(match))
    .sort((a, b) => a.index - b.index);
}

function preferredMutatingProtectedRoot(mentions: Array<{ root: string; index: number }>): string | undefined {
  return mentions.find((mention) => !isManagedSkillProtectedRoot(mention.root))?.root ?? mentions.at(-1)?.root;
}

function protectedRawPiInstallRootAssembledInCommand(command: string): string | undefined {
  if (!looksLikeHomeReference(command)) return undefined;
  const matches = protectedRawPiInstallRootSpecs
    .map((root) => {
      const suffix = root.replace(/^~\/\./, "");
      const [namespace, leaf] = suffix.split("/");
      if (!namespace || !leaf) return undefined;
      const namespaceMentioned = new RegExp(`\\.${escapeRegExp(namespace)}(?=$|[/"'\\s;&|)])`, "i").test(command);
      if (!namespaceMentioned) return undefined;
      const leafAssigned = shellVariableAssignsProtectedLeaf(command, leaf);
      const leafMentioned = new RegExp(`(?:^|[/"'\\s;&|])${escapeRegExp(leaf)}(?=$|[/"'\\s;&|)])`, "i").test(command);
      return leafAssigned || leafMentioned ? { root, index: leafAssigned ? 0 : 1, leafAssigned } : undefined;
    })
    .filter((match): match is { root: string; index: number; leafAssigned: boolean } => Boolean(match));
  const assignedMatches = matches.filter((match) => match.leafAssigned);
  const selectedMatches = assignedMatches.length ? assignedMatches : matches;
  return preferredMutatingProtectedRoot(selectedMatches);
}

function protectedRootCommandPattern(root: string): RegExp {
  const suffix = root.replace(/^~\//, "");
  const home = escapeRegExp(homedir());
  const alternatives = [
    escapeRegExp(root),
    String.raw`\$HOME/${escapeRegExp(suffix)}`,
    String.raw`\$HOME["']?/${escapeRegExp(suffix)}`,
    String.raw`\$\{HOME\}/${escapeRegExp(suffix)}`,
    String.raw`\$\{HOME\}["']?/${escapeRegExp(suffix)}`,
    `${home}/${escapeRegExp(suffix)}`,
    String.raw`(?:process\.env\.HOME|os\.homedir\(\)|require\(["']os["']\)\.homedir\(\)|os\.path\.expanduser\(["']~["']\)|Path\.home\(\))\s*(?:\+|/)\s*["']?/?${escapeRegExp(suffix)}`,
  ];
  return new RegExp(`(?:${alternatives.join("|")})(?=$|[/"'\\s;&|)])`, "i");
}

function protectedRawPiInstallRootForPath(path: string): string | undefined {
  const candidate = absoluteHomePath(path);
  if (!candidate) return undefined;
  return protectedRawPiInstallRootSpecs.find((root) => {
    const protectedPath = absoluteHomePath(root);
    return protectedPath ? pathWithin(candidate, protectedPath) : false;
  });
}

function protectedRawPiNamespaceParentForPath(path: string): "agents" | "codex" | "ambient" | "pi" | undefined {
  const candidate = absoluteHomePath(path);
  if (!candidate) return undefined;
  const home = normalize(homedir());
  const namespaces = ["agents", "codex", "ambient", "pi"] as const;
  return namespaces.find((namespace) => rawPiPathKey(candidate) === rawPiPathKey(normalize(resolve(home, `.${namespace}`))));
}

function protectedRawPiRootForNamespaceRelativeCommand(
  namespace: "agents" | "codex" | "ambient" | "pi" | undefined,
  command: string,
): string | undefined {
  if (!namespace) return undefined;
  for (const segment of shellCommandSegments(command)) {
    const redirectionLeaf = relativeProtectedLeafFromOutputRedirection(segment);
    if (redirectionLeaf) return `~/.${namespace}/${redirectionLeaf}`;
    if (shellSegmentLooksReadOnly(segment) || shellSegmentLooksProtectedCwdReadExport(segment)) continue;
    if (!shellSegmentCanMutateFilesystem(segment)) continue;
    const leaf = preferredRelativeProtectedLeaf(relativeProtectedLeavesInSegment(segment));
    if (leaf) return `~/.${namespace}/${leaf}`;
  }
  return undefined;
}

function relativeProtectedLeavesInSegment(segment: string): Array<"skills" | "plugins"> {
  const leaves: Array<{ leaf: "skills" | "plugins"; index: number }> = [];
  for (const leaf of ["skills", "plugins"] as const) {
    const match = new RegExp(`(?:^|[\\s"'(])${leaf}(?:\\/|$|[\\s"');&|])`, "i").exec(segment);
    if (match) leaves.push({ leaf, index: match.index });
  }
  return leaves.sort((a, b) => a.index - b.index).map((entry) => entry.leaf);
}

function preferredRelativeProtectedLeaf(leaves: Array<"skills" | "plugins">): "skills" | "plugins" | undefined {
  return leaves.includes("plugins") ? "plugins" : leaves.at(-1);
}

function relativeProtectedLeafFromOutputRedirection(segment: string): "skills" | "plugins" | undefined {
  const leaves = outputRedirectionTargets(segment)
    .map((target) => {
      const normalized = target.replace(/^\.\//, "");
      if (/^skills(?:\/|$)/i.test(normalized)) return "skills" as const;
      if (/^plugins(?:\/|$)/i.test(normalized)) return "plugins" as const;
      return undefined;
    })
    .filter((leaf): leaf is "skills" | "plugins" => Boolean(leaf));
  return preferredRelativeProtectedLeaf(leaves);
}

function shellVariableAssignsProtectedLeaf(command: string, leaf: string): boolean {
  return new RegExp(`(?:^|[\\s;])(?:[A-Za-z_][A-Za-z0-9_]*=)(?:"${escapeRegExp(leaf)}"|'${escapeRegExp(leaf)}'|${escapeRegExp(leaf)})(?=$|[\\s;])`, "i").test(command);
}

function protectedRawPiInstallRootCdSegment(segment: string): string | undefined {
  const target = cdTargetForSegment(segment);
  return target ? protectedRawPiInstallRootForPath(target) : undefined;
}

function looksLikeCdSegment(segment: string): boolean {
  return /^\s*(?:env\s+(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*)?(?:sudo\s+)?cd(?:\s|$)/.test(segment);
}

function cdTargetForSegment(segment: string): string | undefined {
  const match = /^\s*(?:env\s+(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*)?(?:sudo\s+)?cd\s+([^;&|]+)/.exec(segment);
  return match?.[1] ? trimShellWord(match[1]) : undefined;
}

function trimShellWord(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function absoluteHomePath(path: string): string | undefined {
  const trimmed = path.trim();
  if (!trimmed) return undefined;
  if (trimmed === "~") return normalize(homedir());
  if (trimmed.startsWith("~/")) return normalize(resolve(homedir(), trimmed.slice(2)));
  if (trimmed === "$HOME") return normalize(homedir());
  if (trimmed.startsWith("$HOME/")) return normalize(resolve(homedir(), trimmed.slice("$HOME/".length)));
  if (!isAbsolute(trimmed)) return undefined;
  return normalize(trimmed);
}

function pathWithin(candidate: string, root: string): boolean {
  const candidateKey = rawPiPathKey(candidate);
  const rootKey = rawPiPathKey(root);
  return candidateKey === rootKey || candidateKey.startsWith(rootKey.endsWith(sep) ? rootKey : `${rootKey}${sep}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rawPiPathKey(value: string): string {
  return value.toLowerCase();
}

function shellCommandSegments(command: string): string[] {
  return command.split(/(?:&&|\|\||[;|])/).map((segment) => segment.trim()).filter(Boolean);
}

function shellSegmentCanMutateFilesystem(segment: string): boolean {
  if (
    shellSegmentLooksReadOnly(segment) ||
    shellSegmentLooksProtectedRootReadExport(segment) ||
    looksLikeCdSegment(segment) ||
    looksLikeShellAssignmentOnlySegment(segment)
  ) return false;
  return true;
}

function looksLikeShellAssignmentOnlySegment(segment: string): boolean {
  return /^\s*(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s*)+$/.test(segment);
}

function looksLikeHomeReference(command: string): boolean {
  return /(?:~|\$HOME|\$\{HOME\}|process\.env\.HOME|os\.homedir\(\)|require\(["']os["']\)\.homedir\(\)|os\.path\.expanduser\(["']~|Path\.home\(\))/.test(command);
}

function sedSegmentContainsWriteCommand(segment: string): boolean {
  return /(?:^|[^A-Za-z0-9_])[wW]\s+\S+/.test(segment) ||
    /(?:^|[^A-Za-z0-9_])[eE]\s+\S+/.test(segment) ||
    /(?:^|[^A-Za-z0-9_])(?:[0-9$.,{}!\/]+)[wW]\s*\S+/.test(segment) ||
    /(?:^|[^A-Za-z0-9_])(?:[0-9$.,{}!\/]+)[eE]\s+\S+/.test(segment) ||
    sedSubstitutionContainsWriteFlag(segment);
}

function sedSubstitutionContainsWriteFlag(segment: string): boolean {
  for (let index = 0; index < segment.length - 2; index += 1) {
    if (segment[index] !== "s" || /[A-Za-z0-9_]/.test(segment[index - 1] ?? "")) continue;
    const delimiter = segment[index + 1]!;
    if (/[A-Za-z0-9_\\\s]/.test(delimiter)) continue;
    const patternEnd = findUnescapedDelimiter(segment, delimiter, index + 2);
    if (patternEnd < 0) continue;
    const replacementEnd = findUnescapedDelimiter(segment, delimiter, patternEnd + 1);
    if (replacementEnd < 0) continue;
    const flags = segment.slice(replacementEnd + 1);
    if (/^[gp0-9]*[wW]\s*\S+/.test(flags) || /^[gp0-9]*[eE](?=$|[\s'";])/.test(flags)) return true;
  }
  return false;
}

function findUnescapedDelimiter(value: string, delimiter: string, start: number): number {
  for (let index = start; index < value.length; index += 1) {
    if (value[index] === delimiter && value[index - 1] !== "\\") return index;
  }
  return -1;
}

function shellSegmentLooksProtectedRootReadExport(segment: string): boolean {
  const words = shellWords(segment);
  const commandIndex = shellCommandWordIndex(words);
  if (commandIndex < 0) return false;
  const command = words[commandIndex]!;
  const args = words.slice(commandIndex + 1);
  if (command === "cp" || command === "rsync") {
    const operands = args.filter((arg) => !arg.startsWith("-"));
    if (operands.length < 2) return false;
    const destination = operands.at(-1)!;
    return operands.slice(0, -1).some(wordMentionsProtectedRawPiRoot) && !wordMentionsProtectedRawPiRoot(destination);
  }
  if (command === "tar") {
    const fileTarget = tarFileTarget(args);
    return args.some(wordMentionsProtectedRawPiRoot) && (!fileTarget || !wordMentionsProtectedRawPiRoot(fileTarget));
  }
  return false;
}

function shellSegmentLooksProtectedCwdReadExport(segment: string): boolean {
  const words = shellWords(segment);
  const commandIndex = shellCommandWordIndex(words);
  if (commandIndex < 0) return false;
  const command = words[commandIndex]!;
  const args = words.slice(commandIndex + 1);
  if (command === "cp" || command === "rsync") {
    const operands = args.filter((arg) => !arg.startsWith("-"));
    if (operands.length < 2) return false;
    const destination = operands.at(-1)!;
    return !isRelativeShellPath(destination) && !wordMentionsProtectedRawPiRoot(destination);
  }
  if (command === "tar") {
    const fileTarget = tarFileTarget(args);
    return Boolean(fileTarget) && !isRelativeShellPath(fileTarget!) && !wordMentionsProtectedRawPiRoot(fileTarget!);
  }
  return false;
}

function shellSegmentWritesVariableDestination(segment: string): boolean {
  if (outputRedirectionTargets(segment).some(shellWordContainsVariableReference)) return true;
  const words = shellWords(segment);
  const commandIndex = shellCommandWordIndex(words);
  if (commandIndex < 0) return false;
  const command = words[commandIndex]!;
  const args = words.slice(commandIndex + 1);
  if (command === "cp" || command === "rsync" || command === "mv" || command === "install") {
    const operands = args.filter((arg) => !arg.startsWith("-"));
    return Boolean(operands.at(-1) && shellWordContainsVariableReference(operands.at(-1)!));
  }
  if (command === "mkdir" || command === "touch" || command === "tee") {
    return args.some((arg) => !arg.startsWith("-") && shellWordContainsVariableReference(arg));
  }
  return false;
}

function wordMentionsProtectedRawPiRoot(word: string): boolean {
  const normalized = trimShellWord(word);
  return Boolean(protectedRawPiInstallRootForPath(normalized) || protectedRawPiInstallRootMentionedInCommand(normalized));
}

function shellWordContainsVariableReference(word: string): boolean {
  return /\$(?:\{?[A-Za-z_][A-Za-z0-9_]*\}?)/.test(word);
}

function protectedRawPiInstallRootFromOutputRedirection(segment: string): string | undefined {
  const mentions = outputRedirectionTargets(segment)
    .map((target) => protectedRawPiInstallRootForPath(target) ?? protectedRawPiInstallRootMentionedInCommand(target))
    .filter((root): root is string => Boolean(root))
    .map((root, index) => ({ root, index }));
  return preferredMutatingProtectedRoot(mentions);
}

function tarFileTarget(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "-f" || arg === "--file") return args[index + 1];
    if (arg.startsWith("--file=")) return arg.slice("--file=".length);
    if (/^-[A-Za-z]*f[A-Za-z]*$/.test(arg)) {
      const after = arg.slice(arg.indexOf("f") + 1);
      return after || args[index + 1];
    }
  }
  return undefined;
}

function shellWords(segment: string): string[] {
  return segment.match(/"[^"]*"|'[^']*'|[^\s]+/g)?.map(trimShellWord) ?? [];
}

function shellCommandWordIndex(words: string[]): number {
  let index = 0;
  if (words[index] === "sudo") index += 1;
  if (words[index] === "env") {
    index += 1;
    while (words[index] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index]!)) index += 1;
  }
  return words[index] ? index : -1;
}

function isRelativeShellPath(path: string): boolean {
  return !path.startsWith("/") && !path.startsWith("~") && !path.startsWith("$HOME") && !path.startsWith("${HOME}");
}

function segmentRedirectsToProtectedRawPiRoot(segment: string): boolean {
  for (const target of outputRedirectionTargets(segment)) {
    if (protectedRawPiInstallRootForPath(target) || protectedRawPiInstallRootMentionedInCommand(target)) return true;
  }
  return false;
}

function segmentRedirectsToRelativePath(segment: string): boolean {
  return outputRedirectionTargets(segment).some((target) =>
    !target.startsWith("/") &&
    !target.startsWith("~") &&
    !target.startsWith("$HOME") &&
    !target.startsWith("${HOME}")
  );
}

function outputRedirectionTargets(segment: string): string[] {
  const targets: string[] = [];
  const redirectionPattern = /(?:^|[^<])>(?:>|\|)?\s*("[^"]+"|'[^']+'|[^\s;&|)]+)/g;
  let match: RegExpExecArray | null;
  while ((match = redirectionPattern.exec(segment))) {
    const target = match[1] ? trimShellWord(match[1]) : "";
    if (target) targets.push(target);
  }
  return targets;
}

function protectedRawPiBashWriteNavigationRoot(command: string): string | undefined {
  for (const segment of shellCommandSegments(command)) {
    const target = cdTargetForSegment(segment);
    if (!target) continue;
    const protectedRoot = protectedRawPiInstallRootForPath(target);
    if (protectedRoot) return protectedRoot;
    const normalized = target.replace(/^\.\//, "");
    const namespaceMatch = /^(?:(?:~|\$HOME|\$\{HOME\})\/)?\.(agents|codex|ambient|pi)(?:\/|$)/i.exec(normalized);
    if (namespaceMatch?.[1]) {
      return `~/.${namespaceMatch[1].toLowerCase()}/skills`;
    }
  }
  return undefined;
}
