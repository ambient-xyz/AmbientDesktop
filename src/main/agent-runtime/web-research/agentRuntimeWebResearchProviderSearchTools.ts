import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  SearchRoutingSettings,
  WebResearchProviderRole,
} from "../../../shared/webResearchTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { AmbientCliPackageCatalog } from "../../ambient-cli/ambientCliPackages";
import { webResearchToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import type { McpToolDescriptor } from "../../mcp/mcpToolBridge";
import {
  buildWebResearchProviderDiscovery,
  webResearchProviderDiscoveryText,
} from "../../web-research/webResearchProviderDiscovery";
import { webResearchToolResult } from "./agentRuntimeWebResearchStatusTools";

export interface WebResearchProviderSearchToolRegistrationOptions {
  workspace: WorkspaceState;
  readSettings: () => SearchRoutingSettings | undefined;
  discoverAmbientCliPackages: (
    workspacePath: string,
    options: { includeHealth: true },
  ) => Promise<AmbientCliPackageCatalog>;
  discoverMcpProviderTools: (signal?: AbortSignal) => Promise<McpToolDescriptor[]>;
}

export function registerWebResearchProviderSearchTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: WebResearchProviderSearchToolRegistrationOptions,
): void {
  const {
    workspace,
    readSettings,
    discoverAmbientCliPackages,
    discoverMcpProviderTools,
  } = options;

  registerDesktopTool(pi, webResearchToolDescriptor("web_research_provider_search"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal) => {
      const input = params as Record<string, unknown>;
      const baseSettings = readSettings() ?? {};
      const catalog = await discoverAmbientCliPackages(workspace.path, { includeHealth: true }).catch(() => ({ packages: [], errors: [] }));
      const mcpTools = await discoverMcpProviderTools(signal);
      const result = buildWebResearchProviderDiscovery({
        settings: baseSettings,
        ambientCliCatalog: catalog,
        mcpTools,
        query: optionalString(input.query),
        role: optionalWebResearchProviderRole(input.role),
        limit: optionalNumber(input.limit),
      });
      return webResearchToolResult(webResearchProviderDiscoveryText(result), {
        toolName: "web_research_provider_search",
        status: "complete",
        ...result,
      });
    },
  });
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalWebResearchProviderRole(value: unknown): WebResearchProviderRole | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "search" || value === "fetch" || value === "interactive_browser") return value;
  throw new Error("role must be search, fetch, or interactive_browser.");
}
