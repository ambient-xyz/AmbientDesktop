import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { McpToolBridge } from "../../mcp/mcpToolBridge";
import { resolveScraplingBrowserContentDescriptor } from "../../scrapling/scraplingMcpDescriptor";
import {
  WEB_RESEARCH_PROVIDER_IDS,
  type WebResearchProviderRuntimeSummary,
} from "../../web-research/webResearchProviderStack";

export type WebResearchRuntimeSummary = Partial<Record<string, Omit<WebResearchProviderRuntimeSummary, "providerId" | "label" | "role" | "kind" | "configuredStatus" | "privacyLabel">>>;

export interface WebResearchRuntimeSummaryOptions {
  createMcpRuntime: (workspace: WorkspaceState) => { bridge: Pick<McpToolBridge, "describeTool"> } | undefined;
  webResearchExaApiKey: () => string | undefined;
}

export interface WebResearchRuntimeSummaryForWorkspaceOptions {
  createMcpRuntime: WebResearchRuntimeSummaryOptions["createMcpRuntime"];
  mcpEnv?: NodeJS.ProcessEnv;
  processEnv?: NodeJS.ProcessEnv;
}

export function webResearchRuntimeSummaryForWorkspace(
  workspace: WorkspaceState,
  signal: AbortSignal | undefined,
  options: WebResearchRuntimeSummaryForWorkspaceOptions,
): Promise<WebResearchRuntimeSummary> {
  return webResearchRuntimeSummary(workspace, signal, {
    createMcpRuntime: options.createMcpRuntime,
    webResearchExaApiKey: () => webResearchExaApiKeyFromEnv(options.mcpEnv, options.processEnv),
  });
}

export function webResearchExaApiKeyFromEnv(
  mcpEnv?: NodeJS.ProcessEnv,
  processEnv: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return mcpEnv?.EXA_API_KEY ?? processEnv.EXA_API_KEY;
}

export async function webResearchRuntimeSummary(
  workspace: WorkspaceState,
  signal: AbortSignal | undefined,
  options: WebResearchRuntimeSummaryOptions,
): Promise<WebResearchRuntimeSummary> {
  const runtime: WebResearchRuntimeSummary = {
    [WEB_RESEARCH_PROVIDER_IDS.exa]: {
      availability: "available",
      reason: options.webResearchExaApiKey() ? "Reviewed remote MCP provider with Ambient-managed API key available." : "Reviewed remote MCP provider; no API key required for default use.",
    },
    [WEB_RESEARCH_PROVIDER_IDS.browser]: {
      availability: "available",
      reason: "Ambient managed browser fallback is available.",
    },
  };
  const mcpRuntime = options.createMcpRuntime(workspace);
  if (!mcpRuntime) {
    runtime[WEB_RESEARCH_PROVIDER_IDS.scrapling] = {
      availability: "unavailable",
      reason: "Ambient MCP runtime is not enabled.",
    };
    return runtime;
  }
  const { descriptor, unavailableReason } = await resolveScraplingBrowserContentDescriptor(mcpRuntime.bridge, signal);
  if (descriptor) {
    runtime[WEB_RESEARCH_PROVIDER_IDS.scrapling] = {
      availability: "available",
      reason: `ToolHive workload ${descriptor.workloadName} is ready with ${descriptor.toolRef}.`,
    };
    return runtime;
  }
  runtime[WEB_RESEARCH_PROVIDER_IDS.scrapling] = {
    availability: "unavailable",
    reason: unavailableReason,
  };
  return runtime;
}
