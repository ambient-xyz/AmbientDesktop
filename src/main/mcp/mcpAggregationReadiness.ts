import type { McpInstalledServerSummary } from "./mcpInstallCatalog";
import type { ToolHiveInstalledServerState } from "./mcpToolRuntimeFacade";
import type {
  McpAggregationNamespacePlanItem,
  McpAggregationReadinessCheck,
  McpAggregationReadinessInput,
  McpAggregationReadinessReport,
  McpAggregationReadinessServer,
  McpToolDescriptor,
  McpToolPolicySummary,
  McpToolSearchInput,
} from "./mcpToolBridge";

export interface InstalledMcpServerRecord {
  summary: McpInstalledServerSummary;
  state?: ToolHiveInstalledServerState;
}

interface EvaluateMcpAggregationReadinessInput {
  input: McpAggregationReadinessInput;
  records: InstalledMcpServerRecord[];
  toolsForInstalledServer: (record: InstalledMcpServerRecord, input: McpToolSearchInput) => Promise<McpToolDescriptor[]>;
  readInstalledServerPermissionProfile: (workloadName: string) => Promise<{ sha256Verified: boolean }>;
}

export async function evaluateMcpAggregationReadiness({
  input,
  records,
  toolsForInstalledServer,
  readInstalledServerPermissionProfile,
}: EvaluateMcpAggregationReadinessInput): Promise<McpAggregationReadinessReport> {
  const minServerCount = Math.max(2, Math.floor(input.minServerCount ?? 2));
  const blockers: string[] = [];
  const warnings: string[] = [];
  const servers: McpAggregationReadinessServer[] = [];
  const allTools: McpToolDescriptor[] = [];

  for (const record of records) {
    const serverIssues: string[] = [];
    let tools: McpToolDescriptor[] = [];
    try {
      tools = await toolsForInstalledServer(record, { refresh: input.refresh, signal: input.signal, onActivity: input.onActivity });
      allTools.push(...tools);
    } catch (error) {
      const message = errorMessage(error);
      serverIssues.push(`tool discovery failed: ${message}`);
      blockers.push(`${record.summary.serverId}: tool discovery failed: ${message}`);
    }
    const reviewStatus = record.state?.toolDescriptorReviewStatus ?? (tools.length ? "trusted" : "missing");
    if (reviewStatus !== "trusted") {
      const issue =
        reviewStatus === "needs-review" ? "descriptor drift requires review before aggregation" : "no trusted descriptor snapshot exists";
      serverIssues.push(issue);
      blockers.push(`${record.summary.serverId}: ${issue}`);
    }
    if (!record.summary.endpoint) {
      serverIssues.push("no MCP endpoint is available");
      blockers.push(`${record.summary.serverId}: no MCP endpoint is available`);
    }
    let profileSha256Verified: boolean | undefined;
    try {
      const profile = await readInstalledServerPermissionProfile(record.summary.workloadName);
      profileSha256Verified = profile.sha256Verified;
      if (!profile.sha256Verified) {
        serverIssues.push("installed ToolHive permission profile hash does not match state");
        blockers.push(`${record.summary.serverId}: installed ToolHive permission profile hash does not match state`);
      }
    } catch (error) {
      const message = errorMessage(error);
      serverIssues.push(`permission profile unavailable: ${message}`);
      blockers.push(`${record.summary.serverId}: permission profile unavailable: ${message}`);
    }
    const visibleTools = tools.filter(isVisibleMcpTool);
    const hiddenToolCount = tools.length - visibleTools.length;
    const blockedToolCount = visibleTools.filter((tool) => tool.policy?.callPolicy === "blocked").length;
    const approvalRequiredToolCount = visibleTools.filter((tool) => tool.policy?.callPolicy === "approval-required").length;
    const callableToolCount = visibleTools.length - blockedToolCount;
    if (tools.length === 0 && !serverIssues.length) {
      serverIssues.push("no tools are discoverable");
      blockers.push(`${record.summary.serverId}: no tools are discoverable`);
    } else if (callableToolCount === 0 && tools.length > 0) {
      serverIssues.push("all visible tools are blocked or hidden");
      warnings.push(`${record.summary.serverId}: all visible tools are blocked or hidden`);
    }
    servers.push({
      serverId: record.summary.serverId,
      workloadName: record.summary.workloadName,
      ...(record.summary.workloadStatus ? { status: record.summary.workloadStatus } : {}),
      ...(record.summary.endpoint ? { endpoint: record.summary.endpoint } : {}),
      reviewStatus,
      ...(profileSha256Verified !== undefined ? { profileSha256Verified } : {}),
      visibleToolCount: visibleTools.length,
      hiddenToolCount,
      blockedToolCount,
      approvalRequiredToolCount,
      callableToolCount,
      issues: serverIssues,
    });
  }

  const callableTools = allTools.filter((tool) => isVisibleMcpTool(tool) && tool.policy?.callPolicy !== "blocked");
  const duplicateToolNames = duplicateNames(callableTools.map((tool) => tool.name));
  if (duplicateToolNames.length) {
    warnings.push(`duplicate MCP tool names require server-prefixed aggregate names: ${duplicateToolNames.join(", ")}`);
  }
  if (records.length < minServerCount) {
    warnings.push(
      `vMCP aggregation is deferred until at least ${minServerCount} installed MCP servers are stable; found ${records.length}.`,
    );
  }
  const namespacePlan = callableTools
    .sort((left, right) => left.toolRef.localeCompare(right.toolRef))
    .map((tool) => ({
      toolRef: tool.toolRef,
      aggregateName: aggregateToolName(tool),
      serverId: tool.serverId,
      workloadName: tool.workloadName,
      toolName: tool.name,
      duplicateName: duplicateToolNames.includes(tool.name),
      callPolicy: tool.policy?.callPolicy ?? "default",
    }));
  const visibleToolCount = allTools.filter(isVisibleMcpTool).length;
  const blockedToolCount = allTools.filter((tool) => isVisibleMcpTool(tool) && tool.policy?.callPolicy === "blocked").length;
  const hiddenToolCount = allTools.length - visibleToolCount;
  const approvalRequiredToolCount = allTools.filter(
    (tool) => isVisibleMcpTool(tool) && tool.policy?.callPolicy === "approval-required",
  ).length;
  const status: McpAggregationReadinessReport["status"] = blockers.length
    ? "blocked"
    : records.length < minServerCount
      ? "defer"
      : "ready-for-experiment";
  return {
    schemaVersion: "ambient-mcp-aggregation-readiness-v1",
    status,
    recommendedAction: aggregationRecommendedAction(status, blockers, records.length, minServerCount),
    serverCount: records.length,
    minServerCount,
    visibleToolCount,
    callableToolCount: callableTools.length,
    hiddenToolCount,
    blockedToolCount,
    approvalRequiredToolCount,
    duplicateToolNames,
    namespaceStrategy: "server-prefixed",
    checks: aggregationReadinessChecks({ records, blockers, warnings, duplicateToolNames, namespacePlan, minServerCount }),
    servers,
    namespacePlan,
    blockers,
    warnings,
  };
}

function aggregationRecommendedAction(
  status: McpAggregationReadinessReport["status"],
  blockers: string[],
  serverCount: number,
  minServerCount: number,
): string {
  if (status === "ready-for-experiment") {
    return "The compact Ambient MCP bridge is stable enough for a bounded vMCP aggregation experiment. Keep aggregation disabled by default and use server-prefixed names.";
  }
  if (status === "blocked") {
    return `Do not prototype vMCP aggregation yet. Resolve blocker${blockers.length === 1 ? "" : "s"}: ${blockers.slice(0, 3).join("; ")}${blockers.length > 3 ? "; ..." : ""}`;
  }
  return `Defer vMCP aggregation until at least ${minServerCount} installed MCP servers are stable; currently ${serverCount}. Keep using the compact search/describe/call bridge.`;
}

function aggregationReadinessChecks(input: {
  records: InstalledMcpServerRecord[];
  blockers: string[];
  warnings: string[];
  duplicateToolNames: string[];
  namespacePlan: McpAggregationNamespacePlanItem[];
  minServerCount: number;
}): McpAggregationReadinessCheck[] {
  return [
    {
      id: "installed-server-count",
      label: "Multiple stable installed servers",
      status: input.records.length >= input.minServerCount ? "passed" : "warning",
      detail: `${input.records.length} installed server${input.records.length === 1 ? "" : "s"} found; ${input.minServerCount} required before aggregation is useful.`,
    },
    {
      id: "descriptor-trust",
      label: "Descriptor snapshots trusted",
      status: input.blockers.some((blocker) => /descriptor|tool discovery|no tools/.test(blocker)) ? "blocked" : "passed",
      detail:
        input.blockers.filter((blocker) => /descriptor|tool discovery|no tools/.test(blocker)).join("; ") ||
        "All discoverable tool snapshots are trusted.",
    },
    {
      id: "runtime-boundary",
      label: "Runtime permission profiles verified",
      status: input.blockers.some((blocker) => /permission profile|MCP endpoint/.test(blocker)) ? "blocked" : "passed",
      detail:
        input.blockers.filter((blocker) => /permission profile|MCP endpoint/.test(blocker)).join("; ") ||
        "Installed permission profile hashes and endpoints are available.",
    },
    {
      id: "namespace-plan",
      label: "Aggregate namespace plan",
      status: input.namespacePlan.length ? (input.duplicateToolNames.length ? "warning" : "passed") : "blocked",
      detail: input.namespacePlan.length
        ? input.duplicateToolNames.length
          ? `Server-prefixed names required for duplicates: ${input.duplicateToolNames.join(", ")}.`
          : "Server-prefixed namespace can map every callable visible tool."
        : "No callable visible MCP tools are available for aggregation.",
    },
    {
      id: "stable-bridge-first",
      label: "Compact bridge remains primary",
      status: "passed",
      detail: "Aggregation status is read-only and does not register every MCP tool as a Pi tool.",
    },
  ];
}

function duplicateNames(names: string[]): string[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
    .sort((left, right) => left.localeCompare(right));
}

function aggregateToolName(tool: McpToolDescriptor): string {
  return `${aggregateNameSegment(tool.serverId)}__${aggregateNameSegment(tool.name)}`;
}

function aggregateNameSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "mcp"
  );
}

function isVisibleMcpTool(tool: { policy?: McpToolPolicySummary }): boolean {
  return tool.policy?.visibility !== "hidden";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
