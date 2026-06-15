import type { WebResearchProviderConfig, WebResearchProviderRole } from "../shared/types";
import type { McpToolDescriptor } from "./mcpToolBridge";
import { SCRAPLING_BROWSER_CONTENT_TOOL_CANDIDATES, SCRAPLING_DEFAULT_SERVER_ID } from "./scraplingBrowserRouting";

export function webResearchProviderConfigsFromMcpTools(tools: McpToolDescriptor[]): WebResearchProviderConfig[] {
  const providers: WebResearchProviderConfig[] = [];
  const seen = new Set<string>();
  for (const tool of tools) {
    const provider = webResearchProviderConfigFromMcpTool(tool);
    if (!provider || seen.has(provider.providerId)) continue;
    providers.push(provider);
    seen.add(provider.providerId);
  }
  return providers;
}

export function webResearchProviderConfigFromMcpTool(tool: McpToolDescriptor): WebResearchProviderConfig | undefined {
  if (tool.policy?.visibility === "hidden" || tool.policy?.callPolicy === "blocked") return undefined;
  if (isBuiltInScraplingDefaultTool(tool)) return undefined;
  const role = webResearchRoleForMcpTool(tool);
  if (!role) return undefined;
  const argumentName = webResearchArgumentNameForMcpTool(tool, role);
  if (!argumentName) return undefined;
  const status = tool.reviewStatus === "trusted" && Boolean(tool.endpoint) && (!tool.workloadStatus || tool.workloadStatus === "running")
    ? "enabled"
    : "disabled";
  return {
    providerId: `mcp:${tool.toolRef}`,
    label: webResearchMcpProviderLabel(tool),
    kind: tool.endpoint?.startsWith("http://127.0.0.1") || tool.endpoint?.startsWith("http://localhost") ? "toolhive-mcp" : "remote-mcp",
    roles: [role],
    status,
    privacyLabel: role === "search"
      ? `Queries may be sent to MCP provider ${tool.serverId}.`
      : `Public URLs may be fetched through MCP provider ${tool.serverId}.`,
    mcp: {
      serverId: tool.serverId,
      workloadName: tool.workloadName,
      toolName: tool.name,
      argumentName,
    },
  };
}

function webResearchRoleForMcpTool(tool: McpToolDescriptor): WebResearchProviderRole | undefined {
  if (looksMutating(tool)) return undefined;
  const identity = mcpIdentityText(tool);
  const schema = schemaSummary(tool.inputSchema);
  if (schema.urlArgument && /\b(fetch|retrieve|retriev|scrap|crawl|read|get|page|website|html|markdown|content|extract)\b/i.test(identity)) {
    return "fetch";
  }
  if (schema.queryArgument && /\b(web[-_ ]?search|internet search|search engine|serp|brave|tavily|duckduckgo|google search|exa search)\b/i.test(identity)) {
    return "search";
  }
  return undefined;
}

function webResearchArgumentNameForMcpTool(tool: McpToolDescriptor, role: WebResearchProviderRole): string | undefined {
  const schema = schemaSummary(tool.inputSchema);
  if (role === "search") return schema.queryArgument;
  if (role === "fetch") return schema.urlArgument;
  return undefined;
}

function schemaSummary(schema: unknown): { queryArgument?: string; urlArgument?: string } {
  const properties = schemaProperties(schema);
  const required = new Set(schemaRequired(schema));
  const queryArgument = ["query", "q", "searchQuery", "search_query"].find((name) => isRequiredStringProperty(properties, required, name));
  const urlArgument = ["url", "uri", "link"].find((name) => isRequiredStringProperty(properties, required, name));
  return {
    ...(queryArgument ? { queryArgument } : {}),
    ...(urlArgument ? { urlArgument } : {}),
  };
}

function schemaProperties(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return {};
  const properties = (schema as Record<string, unknown>).properties;
  return properties && typeof properties === "object" && !Array.isArray(properties) ? properties as Record<string, unknown> : {};
}

function schemaRequired(schema: unknown): string[] {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [];
  const required = (schema as Record<string, unknown>).required;
  return Array.isArray(required) ? required.filter((name): name is string => typeof name === "string") : [];
}

function isRequiredStringProperty(properties: Record<string, unknown>, required: Set<string>, name: string): boolean {
  if (!required.has(name)) return false;
  const property = properties[name];
  if (!property || typeof property !== "object" || Array.isArray(property)) return false;
  const type = (property as Record<string, unknown>).type;
  return type === "string" || Array.isArray(type) && type.includes("string");
}

function isBuiltInScraplingDefaultTool(tool: McpToolDescriptor): boolean {
  return tool.serverId === SCRAPLING_DEFAULT_SERVER_ID && SCRAPLING_BROWSER_CONTENT_TOOL_CANDIDATES.includes(tool.name as typeof SCRAPLING_BROWSER_CONTENT_TOOL_CANDIDATES[number]);
}

function looksMutating(tool: McpToolDescriptor): boolean {
  return /\b(delete|remove|write|update|create|generate|mutate|upload|execute|run|shell|command|install|start|stop|restart)\b/i.test(mcpIdentityText(tool));
}

function mcpIdentityText(tool: McpToolDescriptor): string {
  return [
    tool.serverId,
    tool.workloadName,
    tool.toolRef,
    tool.name,
    tool.description ?? "",
    schemaText(tool.inputSchema),
  ].join(" ");
}

function schemaText(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "";
  try {
    return JSON.stringify(schema);
  } catch {
    return "";
  }
}

function webResearchMcpProviderLabel(tool: McpToolDescriptor): string {
  const server = tool.serverId.split(/[/:]+/g).filter(Boolean).slice(-1)[0] ?? tool.serverId;
  return `${humanize(server)} ${humanize(tool.name)}`.trim();
}

function humanize(value: string): string {
  return value
    .split(/[-_:./]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
