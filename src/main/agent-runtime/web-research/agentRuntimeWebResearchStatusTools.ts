import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { SearchRoutingSettings } from "../../../shared/webResearchTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { AmbientCliPackageCatalog } from "../../ambient-cli/ambientCliPackages";
import { webResearchToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import type { McpToolDescriptor } from "../../mcp/mcpToolBridge";
import {
  webResearchProviderConfigsFromSearchCatalog,
  webResearchSettingsWithDynamicProviderCatalogs,
} from "../../web-research/searchSettingsTools";
import { webResearchProviderConfigsFromMcpTools } from "../../web-research/webResearchMcpProviderRegistry";
import {
  buildWebResearchProviderStackStatus,
  type WebResearchProviderRuntimeSummary,
  webResearchProviderStackStatusText,
} from "../../web-research/webResearchProviderStack";

export type WebResearchStatusRuntimeSummary = Partial<Record<string, Omit<
  WebResearchProviderRuntimeSummary,
  "providerId" | "label" | "role" | "kind" | "configuredStatus" | "privacyLabel"
>>>;

export interface WebResearchStatusToolRegistrationOptions {
  workspace: WorkspaceState;
  readSettings: () => SearchRoutingSettings | undefined;
  discoverAmbientCliPackages: (
    workspacePath: string,
    options: { includeHealth: true },
  ) => Promise<AmbientCliPackageCatalog>;
  discoverMcpProviderTools: (signal?: AbortSignal) => Promise<McpToolDescriptor[]>;
  webResearchRuntimeSummary: (signal?: AbortSignal) => Promise<WebResearchStatusRuntimeSummary>;
}

export function registerWebResearchStatusTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: WebResearchStatusToolRegistrationOptions,
): void {
  const {
    workspace,
    readSettings,
    discoverAmbientCliPackages,
    discoverMcpProviderTools,
    webResearchRuntimeSummary,
  } = options;

  registerDesktopTool(pi, webResearchToolDescriptor("web_research_status"), {
    executionMode: "sequential",
    execute: async (_toolCallId, _params, signal) => {
      const baseSettings = readSettings() ?? {};
      const catalog = await discoverAmbientCliPackages(workspace.path, { includeHealth: true }).catch(() => ({ packages: [], errors: [] }));
      const mcpTools = await discoverMcpProviderTools(signal);
      const settings = webResearchSettingsWithDynamicProviderCatalogs(baseSettings, { ambientCliCatalog: catalog, mcpTools });
      const runtime = {
        ...await webResearchRuntimeSummary(signal),
        ...Object.fromEntries(webResearchProviderConfigsFromSearchCatalog(catalog).map((provider) => [
          provider.providerId,
          {
            availability: provider.status === "enabled" ? "available" as const : "unavailable" as const,
            reason: provider.status === "enabled"
              ? "Installed Ambient CLI search provider is available."
              : "Installed Ambient CLI search provider is unavailable or missing required setup.",
          },
        ])),
        ...Object.fromEntries(webResearchProviderConfigsFromMcpTools(mcpTools).map((provider) => [
          provider.providerId,
          {
            availability: provider.status === "enabled" ? "available" as const : "unavailable" as const,
            reason: provider.status === "enabled"
              ? "Installed MCP provider is available through the web research broker."
              : "Installed MCP provider is not currently callable; check descriptor review, workload state, or endpoint availability.",
          },
        ])),
      };
      const result = buildWebResearchProviderStackStatus({ settings, runtime });
      return webResearchToolResult(webResearchProviderStackStatusText(result), {
        toolName: "web_research_status",
        status: "complete",
        settings: result.settings,
        roles: result.roles,
      });
    },
  });
}

export function webResearchToolResult(
  text: string,
  details: Record<string, unknown>,
): { content: { type: "text"; text: string }[]; details: Record<string, unknown> } {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-web-research",
      ...details,
    },
  };
}
