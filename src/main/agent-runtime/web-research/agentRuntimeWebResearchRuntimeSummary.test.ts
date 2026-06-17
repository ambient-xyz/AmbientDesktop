import { describe, expect, it, vi } from "vitest";

import type { WorkspaceState } from "../../../shared/types";
import type { McpToolDescriptor } from "../../mcp/mcpToolBridge";
import {
  webResearchExaApiKeyFromEnv,
  webResearchRuntimeSummary,
  webResearchRuntimeSummaryForWorkspace,
  type WebResearchRuntimeSummaryOptions,
} from "./agentRuntimeWebResearchRuntimeSummary";
import {
  SCRAPLING_DEFAULT_SERVER_ID,
  SCRAPLING_DEFAULT_WORKLOAD_NAME,
} from "../../scrapling/scraplingBrowserRouting";
import { WEB_RESEARCH_PROVIDER_IDS } from "../../web-research/webResearchProviderStack";

describe("agentRuntimeWebResearchRuntimeSummary", () => {
  it("resolves the Exa API key from MCP env before process env", () => {
    expect(webResearchExaApiKeyFromEnv({ EXA_API_KEY: "mcp-key" } as NodeJS.ProcessEnv, { EXA_API_KEY: "process-key" } as NodeJS.ProcessEnv)).toBe("mcp-key");
    expect(webResearchExaApiKeyFromEnv(undefined, { EXA_API_KEY: "process-key" } as NodeJS.ProcessEnv)).toBe("process-key");
    expect(webResearchExaApiKeyFromEnv({}, {})).toBeUndefined();
  });

  it("uses the env-aware runtime-summary wrapper", async () => {
    const result = await webResearchRuntimeSummaryForWorkspace(workspace(), undefined, {
      createMcpRuntime: vi.fn(() => undefined),
      mcpEnv: { EXA_API_KEY: "configured" } as NodeJS.ProcessEnv,
      processEnv: {},
    });

    expect(result[WEB_RESEARCH_PROVIDER_IDS.exa]).toEqual({
      availability: "available",
      reason: "Reviewed remote MCP provider with Ambient-managed API key available.",
    });
  });

  it("reports built-in providers and unavailable Scrapling when MCP runtime is absent", async () => {
    const result = await webResearchRuntimeSummary(workspace(), undefined, options({
      createMcpRuntime: vi.fn(() => undefined),
      webResearchExaApiKey: vi.fn(() => undefined),
    }));

    expect(result).toEqual({
      [WEB_RESEARCH_PROVIDER_IDS.exa]: {
        availability: "available",
        reason: "Reviewed remote MCP provider; no API key required for default use.",
      },
      [WEB_RESEARCH_PROVIDER_IDS.browser]: {
        availability: "available",
        reason: "Ambient managed browser fallback is available.",
      },
      [WEB_RESEARCH_PROVIDER_IDS.scrapling]: {
        availability: "unavailable",
        reason: "Ambient MCP runtime is not enabled.",
      },
    });
  });

  it("reports Exa API key availability and ready Scrapling runtime", async () => {
    const signal = new AbortController().signal;
    const describeTool = vi.fn(async () => scraplingDescriptor());

    const result = await webResearchRuntimeSummary(workspace(), signal, options({
      createMcpRuntime: vi.fn(() => ({ bridge: { describeTool } as any })),
      webResearchExaApiKey: vi.fn(() => "configured"),
    }));

    expect(describeTool).toHaveBeenCalledWith({
      toolName: "fetch",
      serverId: SCRAPLING_DEFAULT_SERVER_ID,
      workloadName: SCRAPLING_DEFAULT_WORKLOAD_NAME,
      refresh: false,
      signal,
    });
    expect(result[WEB_RESEARCH_PROVIDER_IDS.exa]).toEqual({
      availability: "available",
      reason: "Reviewed remote MCP provider with Ambient-managed API key available.",
    });
    expect(result[WEB_RESEARCH_PROVIDER_IDS.scrapling]).toEqual({
      availability: "available",
      reason: "ToolHive workload ambient-scrapling is ready with io.github.d4vinci/scrapling/fetch.",
    });
  });

  it("tries candidate tools and reports the last Scrapling descriptor error", async () => {
    const describeTool = vi
      .fn()
      .mockResolvedValueOnce({
        ...scraplingDescriptor(),
        reviewStatus: "needs-review",
        reviewReason: "descriptor drift",
      })
      .mockRejectedValueOnce(new Error("lookup failed"))
      .mockResolvedValueOnce({
        ...scraplingDescriptor(),
        workloadStatus: "stopped",
      });

    const result = await webResearchRuntimeSummary(workspace(), undefined, options({
      createMcpRuntime: vi.fn(() => ({ bridge: { describeTool } as any })),
    }));

    expect(describeTool).toHaveBeenCalledTimes(3);
    expect(result[WEB_RESEARCH_PROVIDER_IDS.scrapling]).toEqual({
      availability: "unavailable",
      reason: "Scrapling workload is stopped, not running.",
    });
  });
});

function options(overrides: Partial<WebResearchRuntimeSummaryOptions> = {}): WebResearchRuntimeSummaryOptions {
  return {
    createMcpRuntime: vi.fn(() => undefined),
    webResearchExaApiKey: vi.fn(() => undefined),
    ...overrides,
  };
}

function workspace(): WorkspaceState {
  return {
    path: "/workspace",
    name: "Workspace",
    statePath: "/workspace/.ambient",
    sessionPath: "/workspace/.ambient/sessions",
  };
}

function scraplingDescriptor(): McpToolDescriptor {
  return {
    serverId: SCRAPLING_DEFAULT_SERVER_ID,
    workloadName: SCRAPLING_DEFAULT_WORKLOAD_NAME,
    toolRef: "io.github.d4vinci/scrapling/fetch",
    workloadStatus: "running",
    endpoint: "http://127.0.0.1:3030/sse",
    reviewStatus: "trusted",
    name: "fetch",
    policy: {
      visibility: "visible",
      callPolicy: "default",
    },
  };
}
