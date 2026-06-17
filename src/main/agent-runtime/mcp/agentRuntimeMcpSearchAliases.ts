import type { WorkspaceState } from "../../../shared/types";

export interface AgentRuntimeMcpSearchAliasRuntime {
  toolHive: {
    readState: () => Promise<{ installedServers: InstalledMcpSearchAliasServer[] }>;
  };
}

export interface AgentRuntimeMcpSearchAliasOptions {
  createMcpRuntime: (workspace: WorkspaceState) => AgentRuntimeMcpSearchAliasRuntime | undefined;
}

export interface InstalledMcpSearchAliasServer {
  serverId: string;
  workloadName: string;
  sourceIdentity?: {
    registryId?: string;
    packageName?: string;
    packageIdentifier?: string;
    toolHiveRunSource?: string;
    candidateId?: string;
  };
  lastKnownToolDescriptors?: unknown[];
}

export async function installedMcpSearchAliasesForWorkspace(
  workspace: WorkspaceState,
  options: AgentRuntimeMcpSearchAliasOptions,
): Promise<string[]> {
  const mcpRuntime = options.createMcpRuntime(workspace);
  if (!mcpRuntime) return [];
  const state = await mcpRuntime.toolHive.readState().catch(() => undefined);
  return state ? installedMcpSearchAliasesFromState(state.installedServers) : [];
}

export function installedMcpSearchAliasesFromState(servers: InstalledMcpSearchAliasServer[]): string[] {
  const aliases = new Set<string>();
  for (const server of servers) {
    addInstalledMcpAlias(aliases, server.serverId);
    addInstalledMcpAlias(aliases, server.workloadName);
    addInstalledMcpAlias(aliases, server.sourceIdentity?.registryId);
    addInstalledMcpAlias(aliases, server.sourceIdentity?.packageName);
    addInstalledMcpAlias(aliases, server.sourceIdentity?.packageIdentifier);
    addInstalledMcpAlias(aliases, server.sourceIdentity?.toolHiveRunSource);
    addInstalledMcpAlias(aliases, server.sourceIdentity?.candidateId);
    for (const descriptor of server.lastKnownToolDescriptors ?? []) {
      if (descriptor && typeof descriptor === "object" && !Array.isArray(descriptor)) {
        addInstalledMcpAlias(aliases, (descriptor as Record<string, unknown>).name);
      }
    }
  }
  return [...aliases];
}

function addInstalledMcpAlias(aliases: Set<string>, value: unknown): void {
  if (typeof value !== "string") return;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length < 3) return;
  aliases.add(trimmed.replace(/^(?:npx|uvx):\/\//, ""));
  for (const term of trimmed.split(/[^a-z0-9]+/)) {
    if (term.length >= 4 && !installedMcpSearchAliasStopWords.has(term)) aliases.add(term);
  }
}

const installedMcpSearchAliasStopWords = new Set([
  "ambient",
  "server",
  "mcp",
  "modelcontextprotocol",
  "standard",
  "tool",
  "tools",
  "toolhive",
  "github",
  "main",
  "source",
  "query",
  "search",
  "fetch",
  "read",
]);
