import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  SearchRoutingSettings,
  WebResearchProviderRole,
  WorkspaceState,
} from "../../../shared/types";
import type { AmbientCliPackageCatalog } from "../../ambient-cli/ambientCliPackages";
import { webResearchToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import type { McpToolDescriptor } from "../../mcp/mcpToolBridge";
import {
  describeWebResearchProvider,
  webResearchProviderDescribeText,
} from "../../web-research/webResearchProviderDiscovery";
import { webResearchToolResult } from "./agentRuntimeWebResearchStatusTools";

export interface WebResearchProviderDescribeToolRegistrationOptions {
  workspace: WorkspaceState;
  readSettings: () => SearchRoutingSettings | undefined;
  discoverAmbientCliPackages: (
    workspacePath: string,
    options: { includeHealth: true },
  ) => Promise<AmbientCliPackageCatalog>;
  discoverMcpProviderTools: (signal?: AbortSignal) => Promise<McpToolDescriptor[]>;
}

export function registerWebResearchProviderDescribeTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: WebResearchProviderDescribeToolRegistrationOptions,
): void {
  const {
    workspace,
    readSettings,
    discoverAmbientCliPackages,
    discoverMcpProviderTools,
  } = options;

  registerDesktopTool(pi, webResearchToolDescriptor("web_research_provider_describe"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal) => {
      const input = params as Record<string, unknown>;
      const provider = requiredString(input, "provider");
      const baseSettings = readSettings() ?? {};
      const catalog = await discoverAmbientCliPackages(workspace.path, { includeHealth: true }).catch(() => ({ packages: [], errors: [] }));
      const mcpTools = await discoverMcpProviderTools(signal);
      const result = describeWebResearchProvider({
        settings: baseSettings,
        ambientCliCatalog: catalog,
        mcpTools,
        provider,
        role: optionalWebResearchProviderRole(input.role),
        limit: optionalNumber(input.limit),
      });
      return webResearchToolResult(webResearchProviderDescribeText(result, provider), {
        toolName: "web_research_provider_describe",
        status: "complete",
        provider,
        ...result,
      });
    },
  });
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalWebResearchProviderRole(value: unknown): WebResearchProviderRole | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "search" || value === "fetch" || value === "interactive_browser") return value;
  throw new Error("role must be search, fetch, or interactive_browser.");
}
