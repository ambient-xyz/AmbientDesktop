import type {
  WorkflowDiscoveryCapabilityDescription,
  WorkflowDiscoveryCapabilityMutationClass,
  WorkflowDiscoveryCapabilitySearch,
  WorkflowDiscoveryCapabilitySearchResult,
  WorkflowDiscoveryContextCapability,
  SearchProviderPreference,
} from "../shared/types";
import { pluginMcpToolCapabilityId } from "./plugins/capabilityRegistry";
import type {
  WorkflowDiscoveryAmbientCliCapability,
  WorkflowDiscoveryConnectorCapability,
  WorkflowDiscoveryPluginCapability,
  WorkflowDiscoveryPolicyContext,
} from "./workflowDiscoveryPolicy";
import { workflowDiscoveryProviderPolicyPayload } from "./workflowDiscoveryPolicy";

interface ScoredSearchResult {
  result: WorkflowDiscoveryCapabilitySearchResult;
  score: number;
  priority: number;
}

interface WebSearchRoutingDecision {
  requested: boolean;
  preference?: SearchProviderPreference;
  providerState: "default" | "available" | "unavailable" | "not_found";
  providerLabel?: string;
  browserFallbackAllowed: boolean;
  browserFallbackOverridden: boolean;
  summary?: string;
  reason?: string;
}

const DEFAULT_CAPABILITY_SEARCH_LIMIT = 6;

const domainAliases: Array<{ pattern: RegExp; terms: string[] }> = [
  { pattern: /\barxiv\b/i, terms: ["arxiv", "paper", "papers", "preprint", "research", "academic"] },
  { pattern: /\b(placebo|clinical|medical|study|studies|paper|papers|research|preprint|doi)\b/i, terms: ["paper", "papers", "research", "arxiv", "pubmed", "semantic"] },
  { pattern: /\b(gmail|email|emails|mail|inbox|mailbox)\b/i, terms: ["gmail", "email", "emails", "mail", "inbox", "mailbox"] },
  { pattern: /\b(calendar|meeting|meetings|schedule)\b/i, terms: ["calendar", "meeting", "schedule"] },
  { pattern: /\b(google drive|drive|google docs|docs|sheets|slides|spreadsheet)\b/i, terms: ["drive", "docs", "sheets", "slides", "spreadsheet"] },
  { pattern: /\b(slack|channel|messages?)\b/i, terms: ["slack", "channel", "message", "messages"] },
  { pattern: /\b(local|file|files|folder|directory|workspace|project|downloads?|desktop)\b/i, terms: ["workspace", "local", "file", "files", "directory", "folder", "inventory", "downloads", "desktop"] },
  { pattern: /\b(images?|photos?|pictures?|screenshots?|visual|vision|ocr|minicpm)\b/i, terms: ["image", "images", "photo", "photos", "picture", "pictures", "screenshot", "visual", "vision", "ocr", "minicpm"] },
];

const lowSignalCapabilitySearchTerms = new Set([
  "action",
  "actions",
  "analysis",
  "analyze",
  "best",
  "build",
  "categorization",
  "categorize",
  "categories",
  "category",
  "classify",
  "create",
  "determine",
  "effect",
  "effects",
  "generate",
  "group",
  "grouped",
  "groups",
  "last",
  "latest",
  "list",
  "make",
  "only",
  "produce",
  "read",
  "readonly",
  "report",
  "required",
  "review",
  "summaries",
  "summary",
  "summarize",
  "theme",
  "themes",
  "through",
  "urgency",
  "workflow",
]);

export function searchWorkflowDiscoveryCapabilities(input: {
  query: string;
  context: WorkflowDiscoveryPolicyContext;
  limit?: number;
}): WorkflowDiscoveryCapabilitySearch {
  const limit = Math.max(1, Math.floor(input.limit ?? DEFAULT_CAPABILITY_SEARCH_LIMIT));
  const queryTerms = capabilitySearchTerms(input.query);
  const explicitLocalTarget = explicitLocalFileTarget(input.query);
  const exactLocalFileRead = requestExactLocalFileRead(input.query);
  const localFileOnly = exactLocalFileRead && !requestExplicitlyNeedsConnector(input.query);
  const exactLocalDirectoryListRequested = /\blocal_directory_list\b/i.test(input.query);
  const connectorDisallowPolicy = requestConnectorDisallowPolicy(input.query);
  const webSearchRouting = webSearchRoutingDecision(input.query, input.context);
  const candidates: ScoredSearchResult[] = [];

  for (const connector of input.context.connectors) {
    if (
      localFileOnly ||
      connectorDisallowPolicy.all ||
      (connectorDisallowPolicy.workspaceInventory && connector.connectorId === "workspace.inventory") ||
      (connectorDisallowPolicy.google && /\b(?:google|gmail|calendar|drive|docs|sheets|slides)\b/i.test(connector.connectorId)) ||
      (explicitLocalTarget && exactLocalDirectoryListRequested)
    ) {
      continue;
    }
    if (connector.connectorId.includes("calendar") && !/\b(calendar|meeting|meetings|schedule|free[- ]busy|availability)\b/i.test(input.query)) continue;
    if (connector.connectorId.includes("drive") && explicitLocalTarget && !requestExplicitlyNeedsDrive(input.query)) continue;
    const match = scoreCapabilitySearchText(connectorSearchText(connector), queryTerms);
    if (match.score <= 0) continue;
    candidates.push({
      result: connectorSearchResult(connector, match.matchedTerms),
      score: match.score,
      priority: 2,
    });
  }

  for (const pluginTool of input.context.pluginTools) {
    const match = scoreCapabilitySearchText(pluginSearchText(pluginTool), queryTerms);
    if (match.score <= 0) continue;
    candidates.push({
      result: pluginToolSearchResult(pluginTool, match.matchedTerms),
      score: match.score,
      priority: pluginTool.startable ? 3 : 1,
    });
  }

  for (const ambientCliCapability of input.context.ambientCliCapabilities) {
    if (localFileOnly || requestDisallowsAmbientCliOrSearch(input.query)) continue;
    const match = scoreCapabilitySearchText(ambientCliSearchText(ambientCliCapability), queryTerms);
    if (match.score <= 0) continue;
    candidates.push({
      result: ambientCliSearchResult(ambientCliCapability, match.matchedTerms),
      score: match.score + (webSearchRouting.preference && ambientCliMatchesSearchPreference(ambientCliCapability, webSearchRouting.preference) ? 2 : 0),
      priority: ambientCliCapability.availability === "available" && ambientCliCapability.missingEnv.length === 0 ? 3 : 1,
    });
  }

  if (explicitLocalTarget) {
    candidates.push({
      result: {
        id: explicitLocalTarget.id,
        kind: "base_directory",
        label: explicitLocalTarget.label,
        description: `${explicitLocalTarget.description} Use the built-in local_directory_list workflow tool for metadata-only inventory when the request names it; discovery must not inspect contents until the user grants local file read access.`,
        status: "requires_grant",
        recommendation: "available",
        reason: explicitLocalTarget.reason,
        matchedTerms: queryTerms.filter((term) => ["local", "file", "files", "directory", "folder", "downloads", "desktop"].includes(term)),
        permissionCapability: "file_content",
        targetLabel: explicitLocalTarget.targetLabel,
      },
      score: 100,
      priority: 10,
    });
  } else if (!exactLocalFileRead && requestNeedsBaseDirectory(input.query)) {
    candidates.push({
      result: {
        id: "base-directory",
        kind: "base_directory",
        label: "Base directory files",
        description: `${input.context.files.length} safe file candidate${input.context.files.length === 1 ? "" : "s"} from the workflow folder can be considered as read-only data sources after content policy is satisfied.`,
        status: "requires_grant",
        recommendation: input.context.files.length ? "available" : "fallback",
        reason: "The request appears to involve local/project files or workspace context.",
        matchedTerms: queryTerms.filter((term) => ["workspace", "local", "file", "files", "directory", "folder", "inventory"].includes(term)),
        permissionCapability: "file_content",
        targetLabel: "workflow base directory file contents",
      },
      score: 1,
      priority: 0,
    });
  }

  if (webSearchRouting.requested) {
    candidates.push({
      result: browserWebResearchSearchResult(input.query, queryTerms, webSearchRouting),
      score: queryTerms.includes("arxiv") ? 2 : 1,
      priority: webSearchRouting.browserFallbackAllowed ? -1 : 2,
    });
  }

  const unique = new Map<string, ScoredSearchResult>();
  for (const candidate of candidates) {
    const existing = unique.get(candidate.result.id);
    if (!existing || candidate.score > existing.score) unique.set(candidate.result.id, candidate);
  }
  const sorted = [...unique.values()]
    .sort((left, right) => right.score - left.score || right.priority - left.priority || left.result.label.localeCompare(right.result.label))
    .slice(0, limit);
  const totalCandidateCount =
    input.context.connectors.length +
    input.context.pluginTools.length +
    input.context.ambientCliCapabilities.length +
    (requestNeedsWebResearch(input.query) ? 1 : 0) +
    (requestNeedsBaseDirectory(input.query) ? 1 : 0);
  return {
    query: input.query,
    policy:
      [
        "Capability search inspected safe connector/account/plugin/tool metadata only. Discovery must not execute tools, read connector content, browse, read file contents, run shell commands, or mutate anything from these results.",
        webSearchRouting.summary,
      ].filter(Boolean).join(" "),
    results: sorted.map((item) => item.result),
    totalCandidateCount,
    omittedCandidateCount: Math.max(0, unique.size - sorted.length),
  };
}

export function describeWorkflowDiscoveryCapability(input: {
  capabilityId: string;
  context: WorkflowDiscoveryPolicyContext;
  query?: string;
}): WorkflowDiscoveryCapabilityDescription | undefined {
  const capabilityId = input.capabilityId.trim();
  if (!capabilityId) return undefined;
  const matchedSearchResult = input.query
    ? searchWorkflowDiscoveryCapabilities({
        query: input.query,
        context: input.context,
        limit: Math.max(DEFAULT_CAPABILITY_SEARCH_LIMIT, input.context.connectors.length + input.context.pluginTools.length + 2),
      }).results.find((result) => capabilityMatchesId(result, capabilityId))
    : undefined;

  if (matchedSearchResult?.kind === "base_directory" || matchedSearchResult?.kind === "browser_fallback") {
    return describeSearchOnlyCapability(matchedSearchResult, input.context);
  }

  const connector = connectorByCapabilityId(input.context.connectors, capabilityId);
  if (connector) return describeConnectorCapability(connector);

  const pluginTool = pluginToolByCapabilityId(input.context.pluginTools, capabilityId);
  if (pluginTool) return describePluginToolCapability(pluginTool);

  const ambientCliCapability = ambientCliByCapabilityId(input.context.ambientCliCapabilities, capabilityId);
  if (ambientCliCapability) return describeAmbientCliCapability(ambientCliCapability);

  if (matchedSearchResult) return describeSearchOnlyCapability(matchedSearchResult, input.context);
  return undefined;
}

export function workflowDiscoveryCapabilityAwarePolicySummary(
  context: WorkflowDiscoveryPolicyContext,
  search: WorkflowDiscoveryCapabilitySearch,
): string {
  const payload = workflowDiscoveryProviderPolicyPayload(context);
  const fileGroups = summarizeFileGroups(context.files);
  const skippedSecrets = context.skippedPaths.filter((item) => item.reason.includes("secret")).length;
  const searchRouting = webSearchRoutingDecision(search.query, context);
  const lines = [
    `Base directory: ${context.projectPath}`,
    `Discovery scan: ${context.files.length} candidate file${context.files.length === 1 ? "" : "s"}${fileGroups ? ` (${fileGroups})` : ""}.`,
    context.files.length ? `Candidate files: ${context.files.slice(0, 8).map((file) => file.path).join(", ")}.` : undefined,
    context.contentExcerpts.length ? `Granted content excerpts: ${context.contentExcerpts.map((excerpt) => excerpt.path).join(", ")}.` : undefined,
    context.contextEvidence.length ? `Approved external context evidence: ${context.contextEvidence.map((evidence) => `${evidence.capability} ${evidence.targetLabel} (${evidence.items.length} item${evidence.items.length === 1 ? "" : "s"})`).join("; ")}.` : undefined,
    payload.blockedAccessSummary.length
      ? `Additional context access needed: ${payload.blockedAccessSummary
          .map((item) => `${item.count} ${item.capability.replace(/_/g, " ")} ${item.action === "deny" ? "denied" : "withheld pending grants"}`)
          .join("; ")}.`
      : undefined,
    payload.skippedPathSummary.length
      ? `Skipped paths: ${payload.skippedPathSummary.map((item) => `${item.count} ${item.reason}`).join("; ")}.`
      : undefined,
    skippedSecrets ? `Secret-like paths skipped: ${skippedSecrets}.` : undefined,
    searchRouting.summary,
    `Capability search: ${search.results.length ? search.results.map((result) => `${result.label} (${result.kind.replace(/_/g, " ")}, ${result.status.replace(/_/g, " ")})`).join("; ") : "no request-specific connector/plugin/Ambient CLI matches"}.`,
    `Connector metadata: ${context.connectors.length} descriptor${context.connectors.length === 1 ? "" : "s"} available; request-specific connector details are listed only in capability search results.`,
    `Plugin tool metadata: ${context.pluginTools.length} tool${context.pluginTools.length === 1 ? "" : "s"} available; request-specific plugin details are listed only in capability search results.`,
    `Ambient CLI metadata: ${context.ambientCliCapabilities.length} command capabilit${context.ambientCliCapabilities.length === 1 ? "y" : "ies"} available; request-specific command details are listed only in capability search results.`,
    `Policy: ${context.policyNotes.join(" ")}`,
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

export function capabilitySearchConnectorIds(search: WorkflowDiscoveryCapabilitySearch | undefined): Set<string> | undefined {
  if (!search) return undefined;
  return new Set(search.results.map((result) => result.connectorId).filter((id): id is string => Boolean(id)));
}

export function capabilitySearchPluginToolNames(search: WorkflowDiscoveryCapabilitySearch | undefined): Set<string> | undefined {
  if (!search) return undefined;
  return new Set(search.results.map((result) => result.registeredToolName).filter((name): name is string => Boolean(name)));
}

export function capabilitySearchAmbientCliCapabilityIds(search: WorkflowDiscoveryCapabilitySearch | undefined): Set<string> | undefined {
  if (!search) return undefined;
  return new Set(search.results.filter((result) => result.kind === "ambient_cli").map((result) => result.capabilityId).filter((id): id is string => Boolean(id)));
}

function describeConnectorCapability(connector: WorkflowDiscoveryConnectorCapability): WorkflowDiscoveryCapabilityDescription {
  const result = connectorSearchResult(connector, []);
  const mutationClass = connectorMutationClass(connector);
  return {
    ...baseDescriptionFromResult(result, mutationClass),
    description: `Connector capability for ${connector.label}. Discovery may inspect this metadata only; runtime account data and content reads require explicit grants.`,
    policy: connector.policy,
    accountSummary: connector.accountLabels.length
      ? `${connector.accountLabels.length} configured account${connector.accountLabels.length === 1 ? "" : "s"}: ${connector.accountLabels.slice(0, 4).join(", ")}`
      : "No configured accounts are exposed in discovery metadata.",
    availabilitySummary: connector.policy,
    inputShapeSummary: summarizeOperationSchemas(connector.operations.map((operation) => operation.inputSchema)),
    outputShapeSummary: summarizeOperationSchemas(connector.operations.map((operation) => operation.outputSchema)),
    examples: connector.operationLabels.slice(0, 3).map((label) => `Use when the workflow needs ${connector.label} ${label.toLowerCase()} data and the user grants access.`),
    warnings: [
      "Search/describe exposes connector metadata only.",
      "Connector content reads and account data require explicit discovery/runtime grants.",
      ...(mutationClass === "external_mutation" || mutationClass === "staged_mutation" ? ["Write operations must remain staged or approved according to the connector mutation policy."] : []),
    ],
    operations: connector.operations.map((operation) => ({
      name: operation.name,
      label: operation.label,
      description: operation.description,
      sideEffects: operation.sideEffects,
      supportsDryRun: operation.supportsDryRun,
      mutationPolicy: operation.mutationPolicy,
      defaultTimeoutMs: operation.defaultTimeoutMs,
    })),
  };
}

function describePluginToolCapability(pluginTool: WorkflowDiscoveryPluginCapability): WorkflowDiscoveryCapabilityDescription {
  const result = pluginToolSearchResult(pluginTool, []);
  return {
    ...baseDescriptionFromResult(result, pluginTool.startable ? "plugin_defined" : "none"),
    description: pluginTool.description || result.description,
    policy: pluginTool.startable
      ? "Workflow-safe plugin tool metadata is available. Executing the plugin tool requires explicit approval or a matching persistent grant."
      : "Plugin tool metadata is available, but the plugin server is not currently workflow-startable.",
    inputShapeSummary: summarizeJsonSchema(pluginTool.parameters),
    outputShapeSummary: "Plugin tools do not declare a shared workflow output schema; inspect the tool result preview and persisted artifact metadata at runtime.",
    availabilitySummary: pluginTool.startable ? "Plugin MCP server is startable for this workflow workspace." : "Plugin MCP server is not startable for this workflow workspace.",
    examples: [
      `Use when the workflow specifically needs ${pluginTool.label}.`,
      "Request a plugin-tool execution grant before compile/run if the generated workflow will call it.",
    ],
    warnings: [
      "Describe exposes plugin metadata only and does not execute the tool.",
      "Plugin outputs can be large or provider-defined; workflows should preserve full outputs in artifacts when previews are truncated.",
      ...(pluginTool.startable ? [] : ["The plugin must be enabled/trusted/repaired before a workflow can rely on this tool."]),
    ],
  };
}

function describeAmbientCliCapability(capability: WorkflowDiscoveryAmbientCliCapability): WorkflowDiscoveryCapabilityDescription {
  const result = ambientCliSearchResult(capability, []);
  const available = capability.availability === "available" && capability.missingEnv.length === 0;
  return {
    ...baseDescriptionFromResult(result, available ? "plugin_defined" : "none"),
    description: capability.description || result.description,
    policy: available
      ? "Ambient CLI command metadata is available. Executing the command requires explicit approval or a matching persistent grant; discovery does not run command health checks."
      : "Ambient CLI command metadata is available, but the command has availability issues that must be repaired before the workflow can rely on it.",
    inputShapeSummary: "Ambient CLI command arguments are strings passed through tools.ambient_cli; exact command usage should be verified by description or exploration before compile.",
    outputShapeSummary: "Ambient CLI commands return stdout/stderr previews and materialized full output artifacts when output is large.",
    availabilitySummary: capability.availabilityReason,
    examples: [
      `Use when the workflow specifically needs ${capability.packageName}:${capability.command}.`,
      "Request an Ambient CLI execution grant before compile/run if the generated workflow will call it.",
    ],
    warnings: [
      "Describe exposes Ambient CLI command metadata only and does not execute the command.",
      "Command outputs can be large; workflows should preserve full outputs in artifacts when previews are truncated.",
      ...(capability.missingEnv.length ? [`Missing required environment bindings: ${capability.missingEnv.join(", ")}.`] : []),
    ],
  };
}

function describeSearchOnlyCapability(
  result: WorkflowDiscoveryCapabilitySearchResult,
  context: WorkflowDiscoveryPolicyContext,
): WorkflowDiscoveryCapabilityDescription {
  const mutationClass: WorkflowDiscoveryCapabilityMutationClass = result.kind === "base_directory" ? "read_only" : "none";
  const browserFallbackBlocked = result.kind === "browser_fallback" && result.recommendation === "blocked";
  return {
    ...baseDescriptionFromResult(result, mutationClass),
    policy:
      result.kind === "base_directory"
        ? "Base-directory search exposes safe file metadata only. File content requires Full Access or an explicit file-content grant."
        : browserFallbackBlocked
          ? "Browser/network research is blocked by the configured search routing preference. Change the routing preference or provide an explicit one-off override before relying on browser_search."
        : "Browser/network research is a fallback capability. It requires an explicit browser/network grant and does not run during discovery search.",
    inputShapeSummary:
      result.kind === "base_directory"
        ? `${context.files.length} safe metadata candidate${context.files.length === 1 ? "" : "s"}; content is not included by search.`
        : "Origin or query string chosen by the workflow; browser content reads require runtime approval.",
    outputShapeSummary:
      result.kind === "base_directory"
        ? "Runtime file reads should return bounded previews and persisted full artifacts when content is large."
        : "Runtime browsing should return structured evidence, source URLs, retained snippets, and any blocked/CAPTCHA/error status.",
    availabilitySummary:
      result.kind === "base_directory"
        ? `${context.files.length} file metadata candidates scanned.`
        : browserFallbackBlocked
          ? "Blocked by search routing."
          : "Available as a permission-gated fallback.",
    examples:
      result.kind === "base_directory"
        ? ["Use when the workflow should inspect files already present in the workflow base directory."]
        : ["Use when no installed connector or plugin covers current web evidence cleanly."],
    warnings:
      result.kind === "base_directory"
        ? ["Search/describe does not read file contents.", "Secret-like files and generated/dependency directories are skipped."]
        : browserFallbackBlocked
          ? ["This blocked result is informational; it is not a runnable browser capability.", "Use the required Ambient CLI search provider, repair it, or explicitly override search routing for this request."]
        : ["Browser/network access may encounter login, CAPTCHA, rate-limit, or availability issues.", "Prefer workflow-safe plugin or connector capabilities when available."],
  };
}

function baseDescriptionFromResult(
  result: WorkflowDiscoveryCapabilitySearchResult,
  mutationClass: WorkflowDiscoveryCapabilityMutationClass,
): Omit<WorkflowDiscoveryCapabilityDescription, "policy" | "examples" | "warnings"> {
  return {
    id: result.id,
    kind: result.kind,
    label: result.label,
    providerLabel: result.providerLabel,
    description: result.description,
    status: result.status,
    recommendation: result.recommendation,
    permissionCapability: result.permissionCapability,
    targetLabel: result.targetLabel,
    mutationClass,
  };
}

function capabilityMatchesId(result: WorkflowDiscoveryCapabilitySearchResult, capabilityId: string): boolean {
  return (
    result.id === capabilityId ||
    result.capabilityId === capabilityId ||
    result.connectorId === capabilityId ||
    result.registeredToolName === capabilityId
  );
}

function connectorByCapabilityId(
  connectors: WorkflowDiscoveryConnectorCapability[],
  capabilityId: string,
): WorkflowDiscoveryConnectorCapability | undefined {
  const id = capabilityId.startsWith("connector:") ? capabilityId.slice("connector:".length) : capabilityId;
  return connectors.find((connector) => connector.connectorId === id || `connector:${connector.connectorId}` === capabilityId);
}

function pluginToolByCapabilityId(
  pluginTools: WorkflowDiscoveryPluginCapability[],
  capabilityId: string,
): WorkflowDiscoveryPluginCapability | undefined {
  const toolName = capabilityId.startsWith("plugin:") ? capabilityId.slice("plugin:".length) : capabilityId;
  return pluginTools.find((pluginTool) => {
    const derivedCapabilityId = pluginMcpToolCapabilityId({
      pluginId: pluginTool.pluginId,
      serverName: pluginTool.serverName,
      toolName: pluginTool.originalToolName ?? pluginTool.toolName,
    });
    return pluginTool.toolName === toolName || pluginTool.originalToolName === toolName || `plugin:${pluginTool.toolName}` === capabilityId || derivedCapabilityId === capabilityId;
  });
}

function ambientCliByCapabilityId(
  capabilities: WorkflowDiscoveryAmbientCliCapability[],
  capabilityId: string,
): WorkflowDiscoveryAmbientCliCapability | undefined {
  const id = capabilityId.startsWith("ambient-cli:") ? capabilityId.slice("ambient-cli:".length) : capabilityId;
  return capabilities.find((capability) => capability.capabilityId === id || `ambient-cli:${capability.capabilityId}` === capabilityId);
}

function connectorMutationClass(connector: WorkflowDiscoveryConnectorCapability): WorkflowDiscoveryCapabilityMutationClass {
  if (connector.operations.some((operation) => operation.sideEffects === "write_external" && operation.mutationPolicy === "apply_after_approval")) return "external_mutation";
  if (connector.operations.some((operation) => operation.sideEffects === "write_external" || operation.mutationPolicy === "staged_until_approved")) return "staged_mutation";
  if (connector.operations.some((operation) => operation.sideEffects === "read_personal_data")) return "read_only";
  return "read_only";
}

function summarizeOperationSchemas(schemas: unknown[]): string | undefined {
  const summaries = schemas.map((schema) => summarizeJsonSchema(schema)).filter((summary): summary is string => Boolean(summary));
  if (!summaries.length) return undefined;
  return [...new Set(summaries)].slice(0, 4).join("; ");
}

function summarizeJsonSchema(schema: unknown): string | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  const object = schema as Record<string, unknown>;
  const type = typeof object.type === "string" ? object.type : undefined;
  const properties = object.properties && typeof object.properties === "object" && !Array.isArray(object.properties)
    ? Object.keys(object.properties as Record<string, unknown>).slice(0, 8)
    : [];
  const required = Array.isArray(object.required) ? object.required.filter((item): item is string => typeof item === "string").slice(0, 8) : [];
  const parts = [
    type ? `type ${type}` : undefined,
    properties.length ? `fields ${properties.join(", ")}` : undefined,
    required.length ? `required ${required.join(", ")}` : undefined,
  ];
  const summary = parts.filter((part): part is string => Boolean(part)).join("; ");
  if (summary) return summary;
  return JSON.stringify(schema).slice(0, 180);
}

function connectorSearchResult(connector: WorkflowDiscoveryConnectorCapability, matchedTerms: string[]): WorkflowDiscoveryCapabilitySearchResult {
  return {
    id: `connector:${connector.connectorId}`,
    kind: "connector",
    label: connector.label,
    providerLabel: connector.connectorId,
    description: `Connector metadata is available. Runtime content access still requires an explicit connector grant for operations such as ${connector.operationLabels.slice(0, 4).join(", ") || "read operations"}.`,
    status: "requires_grant",
    recommendation: "available",
    reason: "The request matched connector labels, operations, or known connector aliases.",
    matchedTerms,
    connectorId: connector.connectorId,
    permissionCapability: "connector_content",
    targetLabel: `${connector.label} content (${connector.operationLabels.slice(0, 4).join(", ") || "read operations"})`,
  };
}

function pluginToolSearchResult(pluginTool: WorkflowDiscoveryPluginCapability, matchedTerms: string[]): WorkflowDiscoveryCapabilitySearchResult {
  return {
    id: `plugin:${pluginTool.toolName}`,
    kind: "plugin_tool",
    label: `${pluginTool.label} via ${pluginTool.pluginName}`,
    providerLabel: pluginTool.pluginName,
    description: pluginTool.startable
      ? "Workflow-safe plugin tool metadata matched the request. Runtime execution still requires explicit plugin-tool approval or a matching grant."
      : "A matching plugin tool exists, but it is not currently startable for workflows. Enable, trust, or repair the plugin before relying on it.",
    status: pluginTool.startable ? "workflow_safe" : "needs_trust",
    recommendation: pluginTool.startable ? "recommended" : "blocked",
    reason: pluginTool.startable ? "The request matched a workflow-safe plugin tool." : "The request matched a plugin tool that is not workflow-startable yet.",
    matchedTerms,
    registeredToolName: pluginTool.toolName,
    capabilityId: pluginMcpToolCapabilityId({
      pluginId: pluginTool.pluginId,
      serverName: pluginTool.serverName,
      toolName: pluginTool.originalToolName ?? pluginTool.toolName,
    }),
    permissionCapability: "plugin_tool_execute",
    targetLabel: `${pluginTool.pluginName}/${pluginTool.label}`,
  };
}

function capabilitySearchTerms(query: string): string[] {
  const terms = new Set(tokenize(query).filter((term) => !lowSignalCapabilitySearchTerms.has(term)));
  for (const alias of domainAliases) {
    if (!alias.pattern.test(query)) continue;
    for (const term of alias.terms) terms.add(term);
  }
  return [...terms];
}

function scoreCapabilitySearchText(text: string, terms: string[]): { score: number; matchedTerms: string[] } {
  const matchedTerms = terms.filter((term) => text.includes(term));
  const score = matchedTerms.reduce((sum, term) => sum + (term.length >= 6 ? 3 : term.length >= 4 ? 2 : 1), 0);
  return { score, matchedTerms: matchedTerms.slice(0, 8) };
}

function connectorSearchText(connector: WorkflowDiscoveryConnectorCapability): string {
  const aliases: string[] = [];
  if (connector.connectorId.includes("gmail")) aliases.push("gmail email emails mail inbox mailbox");
  if (connector.connectorId.includes("calendar")) aliases.push("calendar meeting schedule");
  if (connector.connectorId.includes("drive")) aliases.push("drive docs sheets slides document spreadsheet");
  if (connector.connectorId.includes("slack")) aliases.push("slack channel message messages");
  if (connector.connectorId.includes("workspace")) aliases.push("workspace local file files directory folder project inventory");
  return normalizeSearchText([connector.connectorId, connector.label, ...connector.accountLabels, ...connector.operationLabels, ...aliases].join(" "));
}

function pluginSearchText(pluginTool: WorkflowDiscoveryPluginCapability): string {
  return normalizeSearchText(
    [
      pluginTool.toolName,
      pluginTool.originalToolName,
      pluginTool.label,
      pluginTool.description,
      pluginTool.pluginName,
      pluginTool.serverName,
    ].join(" "),
  );
}

function ambientCliSearchText(capability: WorkflowDiscoveryAmbientCliCapability): string {
  return normalizeSearchText(
    [
      capability.capabilityId,
      capability.registryPluginId,
      capability.packageId,
      capability.packageName,
      capability.command,
      capability.description,
      capability.availabilityReason,
      capability.whyMatched.join(" "),
    ].join(" "),
  );
}

function ambientCliSearchResult(capability: WorkflowDiscoveryAmbientCliCapability, matchedTerms: string[]): WorkflowDiscoveryCapabilitySearchResult {
  const available = capability.availability === "available" && capability.missingEnv.length === 0;
  return {
    id: `ambient-cli:${capability.capabilityId}`,
    kind: "ambient_cli",
    label: `${capability.packageName}:${capability.command}`,
    providerLabel: "Ambient CLI",
    description: available
      ? "Installed Ambient CLI command metadata matched the request. Runtime command execution still requires explicit approval or a matching grant."
      : `An installed Ambient CLI command matched the request, but it is not currently available: ${capability.availabilityReason}`,
    status: available ? "workflow_safe" : "needs_trust",
    recommendation: available ? "recommended" : "blocked",
    reason: available ? "The request matched an installed Ambient CLI command capability." : "The request matched an Ambient CLI command capability that needs repair or missing environment bindings.",
    matchedTerms,
    capabilityId: capability.capabilityId,
    permissionCapability: "plugin_tool_execute",
    targetLabel: `Ambient CLI/${capability.packageName}:${capability.command}`,
  };
}

function browserWebResearchSearchResult(
  query: string,
  queryTerms: string[],
  routing: WebSearchRoutingDecision,
): WorkflowDiscoveryCapabilitySearchResult {
  const matchedTerms = queryTerms.filter((term) => ["arxiv", "web", "online", "recent", "current", "research", "paper", "papers"].includes(term));
  if (!routing.browserFallbackAllowed) {
    return {
      id: "browser-web-research-blocked",
      kind: "browser_fallback",
      label: "Browser web research blocked by search routing",
      description: routing.summary ?? "Browser/network research is blocked by the configured search routing preference.",
      status: "fallback",
      recommendation: "blocked",
      reason: routing.reason ?? "Search routing blocks browser fallback for this web research request.",
      matchedTerms,
      permissionCapability: "browser_network",
      targetLabel: webResearchTargetLabel(query),
    };
  }
  return {
    id: "browser-web-research",
    kind: "browser_fallback",
    label: webResearchLabel(query),
    description: [
      "Use browser/network research only if no workflow-safe connector, plugin, or Ambient CLI capability can cover the source cleanly.",
      routing.summary,
    ].filter(Boolean).join(" "),
    status: "fallback",
    recommendation: "fallback",
    reason: routing.reason ?? "The request asks for recent/current/web research or names an external source.",
    matchedTerms,
    permissionCapability: "browser_network",
    targetLabel: webResearchTargetLabel(query),
  };
}

function webSearchRoutingDecision(query: string, context: WorkflowDiscoveryPolicyContext): WebSearchRoutingDecision {
  const requested = requestNeedsWebResearch(query);
  const preference = context.searchRoutingSettings?.webSearch;
  if (!requested && !preference) {
    return { requested, providerState: "default", browserFallbackAllowed: false, browserFallbackOverridden: false };
  }
  if (!preference) {
    return {
      requested,
      providerState: "default",
      browserFallbackAllowed: requested,
      browserFallbackOverridden: false,
      summary: requested
        ? "Search routing: no web_search preference is set; browser fallback may be offered for explicit web research after safer connector/plugin/Ambient CLI matches."
        : "Search routing: no web_search preference is set.",
      reason: requested ? "No configured search provider preference blocks browser fallback." : undefined,
    };
  }

  const matchingCapabilities = context.ambientCliCapabilities.filter((capability) => ambientCliMatchesSearchPreference(capability, preference));
  const availableCapability = matchingCapabilities.find((capability) => ambientCliAvailable(capability));
  const explicitBrowserOverride = requestExplicitlyOverridesSearchRouting(query);
  const browserFallbackAllowed = requested && (explicitBrowserOverride || preference.fallback === "allow");
  const providerState = availableCapability ? "available" : matchingCapabilities.length ? "unavailable" : "not_found";
  const providerLabel = availableCapability
    ? `${availableCapability.packageName}:${availableCapability.command}`
    : matchingCapabilities[0]
      ? `${matchingCapabilities[0].packageName}:${matchingCapabilities[0].command}`
      : undefined;
  const providerStatus =
    providerState === "available"
      ? `matched available provider ${providerLabel}`
      : providerState === "unavailable"
        ? `matched provider ${providerLabel} but it is unavailable`
        : "preferred provider was not present in request-specific Ambient CLI metadata";
  const fallbackStatus = explicitBrowserOverride
    ? "browser fallback allowed by explicit request override"
    : preference.fallback === "allow"
      ? "browser fallback allowed"
      : "browser fallback blocked";
  return {
    requested,
    preference,
    providerState,
    ...(providerLabel ? { providerLabel } : {}),
    browserFallbackAllowed,
    browserFallbackOverridden: explicitBrowserOverride,
    summary: `Search routing: web_search ${preference.mode}s Ambient CLI provider "${preference.preferredProvider}"; ${providerStatus}; ${fallbackStatus}.`,
    reason:
      requested && !browserFallbackAllowed
        ? `Search routing requires or prefers "${preference.preferredProvider}" and blocks browser fallback for this request.`
        : explicitBrowserOverride
          ? "The request explicitly asked to use browser search for this run, overriding the saved search routing preference."
          : preference.fallback === "allow"
            ? `Search routing ${preference.mode}s "${preference.preferredProvider}" before browser fallback.`
            : undefined,
  };
}

function ambientCliAvailable(capability: WorkflowDiscoveryAmbientCliCapability): boolean {
  return capability.availability === "available" && capability.missingEnv.length === 0;
}

function ambientCliMatchesSearchPreference(
  capability: WorkflowDiscoveryAmbientCliCapability,
  preference: SearchProviderPreference,
): boolean {
  const preferenceAlias = normalizeProviderAlias(preference.preferredProvider);
  if (!preferenceAlias) return false;
  return [
    capability.capabilityId,
    capability.registryPluginId,
    capability.packageId,
    capability.packageName,
    capability.command,
    `${capability.packageName}:${capability.command}`,
  ].some((value) => normalizeProviderAlias(value) === preferenceAlias);
}

function requestExplicitlyOverridesSearchRouting(query: string): boolean {
  return /\b(?:ignore|override|bypass)\b[^.\n]{0,80}\b(?:search routing|search preference)\b/i.test(query) ||
    /\b(?:use|allow|force)\b[^.\n]{0,80}\b(?:browser_search|browser search|browser research|browser fallback)\b/i.test(query);
}

function requestNeedsWebResearch(query: string): boolean {
  return (
    /\b(arxiv|doi|pubmed|semantic scholar|web search|search the web|internet|online|latest|current|recent|news|browser search|upcoming|concerts?|venues?|live music|public events?)\b/i.test(query) ||
    /https?:\/\//i.test(query)
  );
}

function requestNeedsBaseDirectory(query: string): boolean {
  return /\b(file|files|folder|directory|workspace|project|local file|local files|local folder|local directory|downloads?|desktop)\b/i.test(stripAmbientDesktopProductName(query));
}

function requestExplicitlyNeedsDrive(query: string): boolean {
  return /\b(google drive|drive|google docs|docs|sheets|slides|spreadsheet)\b/i.test(query);
}

function requestExplicitlyNeedsConnector(query: string): boolean {
  const positiveCorpus = stripDeniedCapabilityClauses(query);
  return /\b(?:connector\.(?:paginate|map)|connector\s+id\s+[\w.-]+|connectorId\s+[\w.-]+|gmail|google\s+mail|inbox|email|google\s+calendar|calendar|google\s+drive|drive|google\s+docs|docs|sheets|slides|slack|workspace\.inventory)\b/i.test(positiveCorpus);
}

function stripDeniedCapabilityClauses(query: string): string {
  return query
    .split(/;|\n|(?<=[.!?])\s+(?=[A-Z])/)
    .filter((clause) => !/\b(?:do\s+not|don't|dont|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\b/i.test(clause))
    .join("\n");
}

function requestExactLocalFileRead(query: string): boolean {
  return (
    /\b(?:file_read|local_file_read)\b/i.test(query) ||
    /\bworkspace-local\b[^\n]{0,120}\b(?:files?|paths?)\b/i.test(query) ||
    /\b(?:files?|paths?)\b[^\n]{0,120}\bworkspace-local\b/i.test(query) ||
    /\b[\w.-]+\/[\w./-]+\.(?:md|txt|json|csv|html|xml|yaml|yml|ts|tsx|js|jsx|css|py|rb|go|rs)\b/i.test(query)
  );
}

function requestDisallowsAmbientCliOrSearch(query: string): boolean {
  return (
    /\b(?:do\s+not|don't|dont|no|without|avoid|exclude|skip)\b[^.\n]{0,160}\b(?:ambient\s+cli|ambient[_\s-]?cli|cli package|installed cli|external cli|search(?:es|ing)?)\b/i.test(query) ||
    /\b(?:ambient\s+cli|ambient[_\s-]?cli|cli package|installed cli|external cli|search(?:es|ing)?)\b[^.\n]{0,100}\b(?:not|unavailable|off\s+limits|out\s+of\s+scope|forbidden|disallowed)\b/i.test(query)
  );
}

function requestConnectorDisallowPolicy(query: string): { all: boolean; google: boolean; workspaceInventory: boolean } {
  const all =
    /\b(?:do\s+not|don't|dont|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\b[^.\n]{0,140}\b(?:connectors?)\b/i.test(query) ||
    /\b(?:connectors?)\b[^.\n]{0,100}\b(?:not|unavailable|off\s+limits|out\s+of\s+scope|forbidden|disallowed)\b/i.test(query);
  const workspaceInventory =
    /\b(?:do\s+not|don't|dont|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\b[^.\n]{0,140}\b(?:workspace[\s.]inventory)\b/i.test(query) ||
    /\b(?:workspace[\s.]inventory)\b[^.\n]{0,100}\b(?:not|unavailable|off\s+limits|out\s+of\s+scope|forbidden|disallowed)\b/i.test(query);
  const google =
    /\b(?:do\s+not|don't|dont|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\b[^.\n]{0,140}\b(?:google\s+workspace|google\s+drive|drive|gmail|calendar|docs|sheets|slides)\b/i.test(query) ||
    /\b(?:google\s+workspace|google\s+drive|drive|gmail|calendar|docs|sheets|slides)\b[^.\n]{0,100}\b(?:not|unavailable|off\s+limits|out\s+of\s+scope|forbidden|disallowed)\b/i.test(query);
  return { all, google, workspaceInventory };
}

function explicitLocalFileTarget(query: string): { id: string; label: string; description: string; reason: string; targetLabel: string } | undefined {
  const localTargetQuery = stripAmbientDesktopProductName(query);
  if (/\bdownloads?\b/i.test(localTargetQuery)) {
    return {
      id: "local-directory-downloads",
      label: "Local filesystem: Downloads directory",
      description: "The request names the user's Downloads directory, which is outside the workflow workspace.",
      reason: "The request explicitly asks to inspect the local Downloads directory.",
      targetLabel: "local Downloads directory (~/Downloads) contents",
    };
  }
  if (/\bdesktop\b/i.test(localTargetQuery)) {
    return {
      id: "local-directory-desktop",
      label: "Local filesystem: Desktop directory",
      description: "The request names the user's Desktop directory, which is outside the workflow workspace.",
      reason: "The request explicitly asks to inspect the local Desktop directory.",
      targetLabel: "local Desktop directory (~/Desktop) contents",
    };
  }
  if (/\bdocuments folder\b|\bdocuments directory\b|\bmy documents\b/i.test(localTargetQuery)) {
    return {
      id: "local-directory-documents",
      label: "Local filesystem: Documents directory",
      description: "The request names the user's local Documents directory, which is outside the workflow workspace.",
      reason: "The request explicitly asks to inspect the local Documents directory.",
      targetLabel: "local Documents directory (~/Documents) contents",
    };
  }
  return undefined;
}

function stripAmbientDesktopProductName(query: string): string {
  return query.replace(/\bAmbient\s+Desktop(?:'s)?\b/gi, "Ambient product");
}

function webResearchLabel(query: string): string {
  if (/\barxiv\b/i.test(query)) return "Browser research on arxiv.org";
  return "Browser web research";
}

function webResearchTargetLabel(query: string): string {
  const origins = new Set<string>();
  for (const match of query.matchAll(/https?:\/\/[^\s)>,]+/gi)) {
    try {
      origins.add(new URL(match[0]).origin);
    } catch {
      // Ignore malformed pasted URLs; the broad web-research label still applies.
    }
  }
  if (/\barxiv\b/i.test(query)) origins.add("https://arxiv.org");
  if (origins.size) return `web research via ${[...origins].slice(0, 3).join(", ")}`;
  return "general web research requested by workflow discovery";
}

function normalizeSearchText(value: string): string {
  return tokenize(value).join(" ");
}

function normalizeProviderAlias(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
}

function summarizeFileGroups(files: Array<{ extension: string }>): string | undefined {
  const groups = new Map<string, number>();
  for (const file of files) groups.set(file.extension || "(none)", (groups.get(file.extension || "(none)") ?? 0) + 1);
  const summary = [...groups.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([extension, count]) => `${count} ${extension}`);
  return summary.length ? summary.join(", ") : undefined;
}
