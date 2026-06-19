import type { McpToolBridge, McpToolDescriptor } from "./scraplingMcpFacade";
import {
  SCRAPLING_BROWSER_CONTENT_TOOL_CANDIDATES,
  SCRAPLING_DEFAULT_SERVER_ID,
  SCRAPLING_DEFAULT_WORKLOAD_NAME,
} from "./scraplingBrowserRouting";

export const NO_CALLABLE_SCRAPLING_TOOL_MESSAGE = "No callable Scrapling page retrieval tool is installed.";

export interface ScraplingMcpDescriptorResolution {
  descriptor?: McpToolDescriptor;
  unavailableReason: string;
}

export async function resolveScraplingBrowserContentDescriptor(
  bridge: Pick<McpToolBridge, "describeTool">,
  signal?: AbortSignal,
): Promise<ScraplingMcpDescriptorResolution> {
  let lastDescriptorError: unknown;
  for (const toolName of SCRAPLING_BROWSER_CONTENT_TOOL_CANDIDATES) {
    try {
      const candidate = await bridge.describeTool({
        toolName,
        serverId: SCRAPLING_DEFAULT_SERVER_ID,
        workloadName: SCRAPLING_DEFAULT_WORKLOAD_NAME,
        refresh: false,
        signal,
      });
      const unavailableReason = scraplingDescriptorUnavailableReason(candidate);
      if (unavailableReason) {
        lastDescriptorError = new Error(unavailableReason);
        continue;
      }
      return { descriptor: candidate, unavailableReason: "" };
    } catch (error) {
      lastDescriptorError = error;
    }
  }
  return {
    unavailableReason: lastDescriptorError ? unknownErrorMessage(lastDescriptorError) : NO_CALLABLE_SCRAPLING_TOOL_MESSAGE,
  };
}

function scraplingDescriptorUnavailableReason(descriptor: McpToolDescriptor): string | undefined {
  if (descriptor.reviewStatus !== "trusted") {
    return `Scrapling descriptor review is ${descriptor.reviewStatus}${descriptor.reviewReason ? `: ${descriptor.reviewReason}` : ""}.`;
  }
  if (!descriptor.endpoint) return "Scrapling has no running ToolHive MCP endpoint.";
  if (descriptor.workloadStatus && descriptor.workloadStatus !== "running") {
    return `Scrapling workload is ${descriptor.workloadStatus}, not running.`;
  }
  return undefined;
}

function unknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
