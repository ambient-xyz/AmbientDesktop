import type { AgentToolResult, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { firstPartyDesktopToolDescriptors, type DesktopToolDescriptor } from "./desktopToolRegistry";
import { workflowNativeToolDescriptors } from "./workflowNativeTools";
import { projectBoardNativeTaskToolDefinitions } from "./projectBoardTaskTools";
import { normalizeToolArgumentsForTool } from "./toolArgumentNormalization";

export const AMBIENT_TOOL_SEARCH = "ambient_tool_search";
export const AMBIENT_TOOL_DESCRIBE = "ambient_tool_describe";
export const AMBIENT_TOOL_CALL = "ambient_tool_call";

export const AMBIENT_ROUTER_TOOL_NAMES = [AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL] as const;

export const AMBIENT_DIRECT_BROWSER_TOOL_NAMES = [
  "browser_search",
  "browser_local_preview",
  "browser_nav",
  "browser_content",
  "browser_eval",
  "browser_click",
  "browser_get_value",
  "browser_wait_for",
  "browser_assert",
  "browser_keypress",
  "browser_screenshot",
] as const;

export const AMBIENT_DIRECT_WEB_RESEARCH_TOOL_NAMES = [
  "web_research_status",
  "web_research_preferences_update",
  "web_research_search",
  "web_research_fetch",
] as const;

export const AMBIENT_DIRECT_LOCAL_RUNTIME_TOOL_NAMES = [
  "ambient_local_model_runtime_status",
] as const;

export const AMBIENT_DIRECT_LOCAL_DEEP_RESEARCH_TOOL_NAMES = [
  "ambient_local_deep_research_setup",
  "ambient_local_deep_research_run",
] as const;

export const AMBIENT_DEFAULT_ACTIVE_TOOL_NAMES = [
  "read",
  "bash",
  "edit",
  "write",
  ...AMBIENT_ROUTER_TOOL_NAMES,
  "ambient_git_status",
] as const;

const AMBIENT_DIRECT_SETUP_TOOL_NAMES = [
  "ambient_setup_runtime_preflight",
  "ambient_setup_recipe_describe",
  "ambient_setup_final_report",
] as const;

export const AMBIENT_DIRECT_MCP_TOOL_BRIDGE_NAMES = [
  "ambient_mcp_tool_search",
  "ambient_mcp_tool_describe",
  "ambient_mcp_tool_call",
  "ambient_mcp_tool_review_accept",
  "ambient_mcp_tool_policy_update",
  "ambient_mcp_aggregation_status",
] as const;

interface RouterToolInfo {
  name: string;
  description: string;
  parameters: unknown;
  sourceInfo?: unknown;
}

interface AmbientToolRouterSession {
  getActiveToolNames(): string[];
  setActiveToolsByName?(toolNames: string[]): void;
  getAllTools(): RouterToolInfo[];
  getToolDefinition(name: string): ToolDefinition<any, any, any> | undefined;
}

interface AmbientToolCatalogEntry {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines: string[];
  parameters: unknown;
  category: string;
  sideEffects?: string;
  permissionScope?: string;
  supportsDryRun?: boolean;
  supportsUndo?: boolean;
  idempotency?: string;
  defaultTimeoutMs?: number;
}

export interface AmbientToolRouterOptions {
  getSession: () => AmbientToolRouterSession | undefined;
  authorizeToolCall?: (toolName: string, toolInput: unknown) => Promise<void>;
  getInstalledMcpSearchAliases?: () => Promise<string[]>;
}

interface AmbientToolRouterThreadState {
  describedToolNames: Set<string>;
  lastDescribedToolName?: string;
}

export function createAmbientToolRouterTools(options: AmbientToolRouterOptions): ToolDefinition<any, any, any>[] {
  const state: AmbientToolRouterThreadState = { describedToolNames: new Set<string>() };
  return [
    ambientToolSearchDefinition(options),
    ambientToolDescribeDefinition(options, state),
    ambientToolCallDefinition(options, state),
  ];
}

export function ambientToolRouterTargetFromInput(toolName: string, input: unknown): { toolName: string; input: unknown } | undefined {
  if (toolName !== AMBIENT_TOOL_CALL) return undefined;
  const parsed = parseAmbientToolCallInput(normalizeToolArgumentsForTool(AMBIENT_TOOL_CALL, input));
  if (!parsed.toolName) return undefined;
  return { toolName: parsed.toolName, input: parsed.input ?? {} };
}

function ambientToolSearchDefinition(options: AmbientToolRouterOptions): ToolDefinition<any, any, any> {
  return {
    name: AMBIENT_TOOL_SEARCH,
    label: "Ambient Tool Search",
    description:
      "Search first-party Ambient Desktop tools by goal, capability area, or tool name. Returns compact candidates only; call ambient_tool_describe for the selected tool contract before execution.",
    promptSnippet: "ambient_tool_search: Search first-party Ambient Desktop tools before using a specialized Ambient capability.",
    promptGuidelines: [
      "Use ambient_tool_search when the user asks for a specialized Ambient capability that is not one of the active direct tools.",
      "Search returns compact metadata only. Do not guess input fields from search results; use ambient_tool_describe before ambient_tool_call.",
      "For installed Ambient CLI package discovery and execution, search for the Ambient CLI tools here unless they are already active directly.",
    ],
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Goal, capability area, or terms to search for." },
        category: { type: "string", description: "Optional category filter such as browser, media, artifact-draft, voice, stt, vision, messaging, google-workspace, workflow, mcp, install-routing, or capability." },
        limit: { type: "number", description: "Maximum candidates to return. Defaults to 8, capped at 20." },
        includeActive: { type: "boolean", description: "Include currently active direct tools in the result. Defaults to false." },
      },
      additionalProperties: false,
    } as any,
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const session = requireSession(options);
      const input = objectInput(params);
      const query = typeof input.query === "string" ? input.query.trim() : "";
      const category = typeof input.category === "string" ? normalizeCategory(input.category) : undefined;
      const limit = clampLimit(input.limit);
      const includeActive =
        input.includeActive === true ||
        isExactCatalogNameQuery(query) ||
        shouldIncludeActiveMcpWorkflowTools(query, category) ||
        isRecordedWorkflowPlaybookUseQuery(query, { installedMcpSearchAliases: [], category }) ||
        isPublicWebResearchToolUseQuery(query, { installedMcpSearchAliases: [], category });
      const aliasProvider = options.getInstalledMcpSearchAliases;
      const installedMcpSearchAliases = shouldLoadInstalledMcpSearchAliases(query, category) && aliasProvider
        ? await aliasProvider().catch(() => [])
        : [];
      const searchContext: AmbientToolSearchContext = { installedMcpSearchAliases, category };
      const installedMcpToolUse = isInstalledMcpToolUseQuery(query, searchContext);
      const recordedWorkflowPlaybookUse = isRecordedWorkflowPlaybookUseQuery(query, searchContext);
      const matchedEntries = currentCatalogEntries(session)
        .filter((entry) => includeActive || !session.getActiveToolNames().includes(entry.name))
        .filter((entry) => !installedMcpToolUse || isInstalledMcpToolUseEntry(entry))
        .filter((entry) => categoryMatchesSearchFilter(entry, category, query))
        .map((entry) => ({ entry, score: scoreCatalogEntry(entry, query) + searchRouteBoost(entry, query, searchContext) }))
        .filter(({ score }) => query ? score > 0 : true)
        .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
        .slice(0, limit)
        .map(({ entry }) => entry);
      if (installedMcpToolUse && matchedEntries.some((entry) => isInstalledMcpToolUseEntry(entry))) {
        activateRelatedTools(session, "ambient_mcp_tool_search");
      }
      if (recordedWorkflowPlaybookUse && matchedEntries.some((entry) => entry.name.startsWith("ambient_workflows_"))) {
        activateRelatedTools(session, "ambient_workflows_search");
      }
      const publicWebResearchToolUse = isPublicWebResearchToolUseQuery(query, searchContext);
      if (publicWebResearchToolUse && matchedEntries.some((entry) => isWebResearchBrokerEntry(entry))) {
        activateRelatedTools(session, "web_research_search");
      }
      const entries = matchedEntries.map((entry) => compactEntry(entry, session));

      const text = entries.length
        ? [
            `Found ${entries.length} Ambient tool candidate${entries.length === 1 ? "" : "s"}.`,
            ...entries.map(
              (entry) =>
                `- ${entry.name} [${entry.category}]${entry.active ? " (active)" : ""}: ${entry.description}`,
            ),
            "",
            installedMcpToolUse
              ? "For installed MCP tool use, select ambient_mcp_tool_search first; pass serverId/workloadName when known, then ambient_mcp_tool_describe, then ambient_mcp_tool_call."
              : undefined,
            publicWebResearchToolUse
              ? "For ordinary public web research, select web_research_search first; use browser tools only for explicit browser, visual, authenticated, or user-action tasks."
              : undefined,
            recordedWorkflowPlaybookUse
              ? "For saved Workflow Recorder playbook use, select ambient_workflows_search first, then ambient_workflows_describe and ambient_workflows_inject before completing the task through normal chat/tools."
              : undefined,
            `Use ${AMBIENT_TOOL_DESCRIBE} with the selected name before ${AMBIENT_TOOL_CALL}.`,
          ].filter(Boolean).join("\n")
        : "No matching first-party Ambient tools were found. Try a broader query or use the dedicated Ambient CLI search tools for installed CLI packages.";

      return textResult(text, {
          runtime: "ambient-tool-router",
          toolName: AMBIENT_TOOL_SEARCH,
          status: "complete",
          query,
          category,
          installedMcpToolUse,
          recordedWorkflowPlaybookUse,
          publicWebResearchToolUse,
          candidates: entries,
        });
    },
  };
}

function ambientToolDescribeDefinition(options: AmbientToolRouterOptions, state: AmbientToolRouterThreadState): ToolDefinition<any, any, any> {
  return {
    name: AMBIENT_TOOL_DESCRIBE,
    label: "Ambient Tool Describe",
    description:
      "Return the full contract for one first-party Ambient Desktop tool, including schema, side effects, permission scope, guidance, and execution notes.",
    promptSnippet: "ambient_tool_describe: Load the full contract for one first-party Ambient Desktop tool before calling it.",
    promptGuidelines: [
      "Call ambient_tool_describe before the first ambient_tool_call for a selected first-party Ambient tool in the thread.",
      "Use the described JSON schema exactly; do not invent fields that are not in the contract.",
    ],
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Exact first-party Ambient tool name." },
      },
      required: ["name"],
      additionalProperties: false,
    } as any,
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const session = requireSession(options);
      const name = requiredToolName(params);
      const result = describeTool(session, name);
      markToolDescribed(state, name);
      activateRelatedTools(session, name);
      return result;
    },
  };
}

function ambientToolCallDefinition(options: AmbientToolRouterOptions, state: AmbientToolRouterThreadState): ToolDefinition<any, any, any> {
  return {
    name: AMBIENT_TOOL_CALL,
    label: "Ambient Tool Call",
    description:
      "Execute a first-party Ambient Desktop tool by name with validated JSON input, or return the tool contract when input is missing or invalid.",
    promptSnippet: "ambient_tool_call: Execute a first-party Ambient Desktop tool with { toolName, toolInput }.",
    promptGuidelines: [
      "Prefer direct active tools when they are available. For specialized Ambient tools that are not active, use ambient_tool_search, then ambient_tool_describe, then ambient_tool_call.",
      "For routed tools, call ambient_tool_call with { toolName: \"exact_tool_name\", toolInput: { ... } }.",
      "Legacy { name, input } is accepted, but do not combine the tool name and input JSON into one string.",
      "If ambient_tool_call returns a no-execute contract, read it and retry only if execution is still appropriate.",
      "After a routed tool is described or called, Ambient may activate that tool or a small related bundle for the rest of the thread.",
    ],
    parameters: {
      type: "object",
      properties: {
        toolName: { type: "string", description: "Exact first-party Ambient tool name to execute." },
        toolInput: { type: "object", description: "JSON input matching the selected tool schema.", additionalProperties: true },
        name: { type: "string", description: "Legacy alias for toolName." },
        input: { type: "object", description: "Legacy alias for toolInput.", additionalProperties: true },
      },
      additionalProperties: false,
    } as any,
    prepareArguments: (input: unknown) => normalizeToolArgumentsForTool(AMBIENT_TOOL_CALL, input),
    executionMode: "sequential",
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      const session = requireSession(options);
      const parsed = parseAmbientToolCallInput(normalizeToolArgumentsForTool(AMBIENT_TOOL_CALL, params));
      if (!parsed.toolName) {
        const lastDescribedToolName = state.lastDescribedToolName;
        return textResult(
          [
            "No execution performed. Malformed Ambient tool router call.",
            "Use direct active tools when available, for example browser_nav({ url }) or browser_eval({ code }).",
            lastDescribedToolName ? `Most recently described routed tool: ${lastDescribedToolName}` : undefined,
            lastDescribedToolName ? "Retry with this shape, filling toolInput from the described schema:" : "For routed first-party Ambient tools, call ambient_tool_call with:",
            JSON.stringify({ toolName: lastDescribedToolName ?? "exact_tool_name", toolInput: {} }, null, 2),
          ].join("\n"),
          {
            runtime: "ambient-tool-router",
            toolName: AMBIENT_TOOL_CALL,
            status: "invalid-input",
            executionSkipped: true,
            ...(lastDescribedToolName ? { suggestedToolName: lastDescribedToolName } : {}),
          },
        );
      }
      const name = parsed.toolName;
      const toolInput = parsed.input ?? {};
      const mcpToolRefInput = mcpToolRefRouterInput(name, toolInput);
      if (mcpToolRefInput) {
        const mcpDefinition = requireCallableDefinition(session, "ambient_mcp_tool_call");
        const preparedInput = mcpDefinition.prepareArguments ? mcpDefinition.prepareArguments(mcpToolRefInput) : mcpToolRefInput;
        const validationErrors = validateJsonSchema(mcpDefinition.parameters, preparedInput);
        if (validationErrors.length > 0) {
          const contract = describeTool(
            session,
            "ambient_mcp_tool_call",
            [
              `No execution performed. Invalid MCP tool-ref router input for ${name}: ${validationErrors.join("; ")}`,
              `Use ambient_mcp_tool_call directly with { "toolName": ${JSON.stringify(name)}, "arguments": { ... } }.`,
            ].join("\n"),
          );
          return {
            ...contract,
            details: { ...(contract.details as Record<string, unknown>), status: "invalid-input", executionSkipped: true, validationErrors },
          };
        }
        markToolDescribed(state, "ambient_mcp_tool_call");
        activateRelatedTools(session, "ambient_mcp_tool_call");
        onUpdate?.({
          content: [{ type: "text" as const, text: `Routing installed MCP tool ref ${name} through ambient_mcp_tool_call.` }],
          details: {
            runtime: "ambient-tool-router",
            toolName: "ambient_mcp_tool_call",
            status: "running",
            routedToolRef: name,
          },
        });
        const result = await mcpDefinition.execute(`${toolCallId}:ambient_mcp_tool_call`, preparedInput as any, signal, onUpdate, ctx);
        return {
          content: result.content,
          details: {
            runtime: "ambient-tool-router",
            toolName: "ambient_mcp_tool_call",
            status: "complete",
            wrappedTool: "ambient_mcp_tool_call",
            routedToolRef: name,
            resultDetails: result.details,
          },
        };
      }
      const definition = requireCallableDefinition(session, name);
      const preparedInput = definition.prepareArguments ? definition.prepareArguments(toolInput) : toolInput;
      const validationErrors = validateJsonSchema(definition.parameters, preparedInput);
      if (validationErrors.length > 0) {
        markToolDescribed(state, name);
        activateRelatedTools(session, name);
        const contract = describeTool(
          session,
          name,
          [
            `No execution performed. Invalid input for ${name}: ${validationErrors.join("; ")}`,
            `Use ${name} directly if it is active, or call ambient_tool_call with { "toolName": ${JSON.stringify(name)}, "toolInput": { ... } }.`,
            "Do not combine a tool name and JSON input into one string.",
          ].join("\n"),
        );
        return {
          ...contract,
          details: { ...(contract.details as Record<string, unknown>), status: "invalid-input", executionSkipped: true, validationErrors },
        };
      }
      const contractBlock = routedToolContractBlock(session, state, name, preparedInput);
      if (contractBlock) return contractBlock;
      markToolDescribed(state, name);
      await options.authorizeToolCall?.(name, preparedInput);
      activateRelatedTools(session, name);
      onUpdate?.({
        content: [{ type: "text" as const, text: `Calling first-party Ambient tool ${name}.` }],
        details: {
          runtime: "ambient-tool-router",
          toolName: name,
          status: "running",
        },
      });
      const result = await definition.execute(`${toolCallId}:${name}`, preparedInput as any, signal, onUpdate, ctx);
      const userActionBlock = routedBrowserUserActionBlock(name, result);
      if (userActionBlock) return userActionBlock;
      return {
        content: result.content,
        details: {
          runtime: "ambient-tool-router",
          toolName: name,
          status: "complete",
          wrappedTool: name,
          resultDetails: result.details,
        },
      };
    },
  };
}

interface ParsedAmbientToolCallInput {
  toolName?: string;
  input?: unknown;
}

function mcpToolRefRouterInput(toolName: string, toolInput: unknown): Record<string, unknown> | undefined {
  if (!toolName.includes("/") || !/^[A-Za-z0-9_.:/@-]+\/[A-Za-z0-9_.:@-]+$/.test(toolName)) return undefined;
  const input = toolInput && typeof toolInput === "object" && !Array.isArray(toolInput)
    ? toolInput as Record<string, unknown>
    : {};
  return { ...input, toolName };
}

function markToolDescribed(state: AmbientToolRouterThreadState, name: string): void {
  state.describedToolNames.add(name);
  state.lastDescribedToolName = name;
}

function requireSession(options: AmbientToolRouterOptions): AmbientToolRouterSession {
  const session = options.getSession();
  if (!session) throw new Error("Ambient tool router is not bound to a Pi session yet.");
  return session;
}

function requiredToolName(params: unknown): string {
  const input = objectInput(params);
  if (typeof input.name !== "string" || !input.name.trim()) throw new Error("Expected non-empty string field `name`.");
  return input.name.trim();
}

function requireCallableDefinition(session: AmbientToolRouterSession, name: string): ToolDefinition<any, any, any> {
  if (AMBIENT_ROUTER_TOOL_NAMES.includes(name as (typeof AMBIENT_ROUTER_TOOL_NAMES)[number])) throw new Error("Ambient router tools cannot call themselves.");
  if (["read", "bash", "edit", "write"].includes(name)) throw new Error(`${name} is active directly; call it without ambient_tool_call.`);
  const definition = session.getToolDefinition(name);
  if (!definition || !isFirstPartyAmbientTool(session, name)) throw new Error(`Unknown or unsupported first-party Ambient tool: ${name}`);
  return definition;
}

function describeTool(session: AmbientToolRouterSession, name: string, prefix?: string): AgentToolResult<Record<string, unknown>> {
  const definition = requireCallableDefinition(session, name);
  const entry = catalogEntryFor(session, name, definition);
  const text = [
    prefix,
    `${entry.name}: ${entry.description}`,
    `Category: ${entry.category}`,
    entry.sideEffects ? `Side effects: ${entry.sideEffects}` : undefined,
    entry.permissionScope ? `Permission scope: ${entry.permissionScope}` : undefined,
    entry.promptGuidelines.length ? "" : undefined,
    entry.promptGuidelines.length ? "Guidelines:" : undefined,
    ...entry.promptGuidelines.map((guideline) => `- ${guideline}`),
    "",
    "Input schema:",
    JSON.stringify(entry.parameters, null, 2),
  ]
    .filter((line) => line !== undefined)
    .join("\n");
  return textResult(text, {
    runtime: "ambient-tool-router",
    toolName: AMBIENT_TOOL_DESCRIBE,
    status: "complete",
    describedTool: entry,
  });
}

function textResult<T>(text: string, details: T): AgentToolResult<T> {
  return { content: [{ type: "text" as const, text }], details };
}

function routedToolContractBlock(
  session: AmbientToolRouterSession,
  state: AmbientToolRouterThreadState,
  name: string,
  input: unknown,
): AgentToolResult<Record<string, unknown>> | undefined {
  const redirect = routedBrowserPublicWebRedirect(name, input);
  if (!redirect) return undefined;
  markToolDescribed(state, redirect.suggestedToolName);
  activateRelatedTools(session, redirect.suggestedToolName);
  return textResult(
    [
      `No execution performed. ${name} is for explicit browser interaction.`,
      redirect.detail,
      "",
      "Retry with:",
      JSON.stringify({ toolName: redirect.suggestedToolName, toolInput: redirect.suggestedToolInput }, null, 2),
    ].join("\n"),
    {
      runtime: "ambient-tool-router",
      toolName: AMBIENT_TOOL_CALL,
      status: "invalid-route",
      executionSkipped: true,
      routedTool: name,
      suggestedToolName: redirect.suggestedToolName,
      suggestedToolInput: redirect.suggestedToolInput,
      reason: redirect.reason,
      ...(redirect.searchProvider ? { searchProvider: redirect.searchProvider } : {}),
      ...(redirect.url ? { url: redirect.url } : {}),
    },
  );
}

interface RoutedBrowserPublicWebRedirect {
  suggestedToolName: "web_research_search" | "web_research_fetch";
  suggestedToolInput: Record<string, unknown>;
  reason: string;
  detail: string;
  searchProvider?: string;
  url?: string;
}

function routedBrowserPublicWebRedirect(name: string, input: unknown): RoutedBrowserPublicWebRedirect | undefined {
  const record = objectInput(input);
  const userActionId = stringValue(record.userActionId)?.trim();
  if (userActionId) return undefined;
  const searchRedirect = browserNavPublicSearchRedirect(name, record);
  if (searchRedirect) {
    return {
      suggestedToolName: "web_research_search",
      suggestedToolInput: { query: searchRedirect.query },
      reason: "public-web-discovery-via-search-url",
      detail: `This URL is a ${searchRedirect.provider} search page. Use web_research_search so Ambient applies the configured Search & Web provider order before browser fallback.`,
      searchProvider: searchRedirect.provider,
      url: searchRedirect.url,
    };
  }
  if (name === "browser_search") {
    const query = stringValue(record.query)?.trim();
    if (!query) return undefined;
    const maxResults = typeof record.maxResults === "number" && Number.isFinite(record.maxResults)
      ? Math.max(1, Math.min(20, Math.floor(record.maxResults)))
      : undefined;
    return {
      suggestedToolName: "web_research_search",
      suggestedToolInput: { query, ...(maxResults ? { maxResults } : {}) },
      reason: "public-web-discovery-via-browser-search",
      detail: "This is an ordinary public web search. Use web_research_search so Ambient applies the configured Search & Web provider order before browser fallback.",
    };
  }
  if (name === "browser_content") {
    const url = publicHttpUrlFromInput(record.url);
    if (!url) return undefined;
    return {
      suggestedToolName: "web_research_fetch",
      suggestedToolInput: { url: url.toString() },
      reason: "public-url-read-via-browser-content",
      detail: "This is a public URL read. Use web_research_fetch so Ambient applies the configured page retrieval provider order before browser fallback.",
      url: url.toString(),
    };
  }
  return undefined;
}

function browserNavPublicSearchRedirect(name: string, input: unknown): { provider: string; query: string; url: string } | undefined {
  if (name !== "browser_nav") return undefined;
  const record = objectInput(input);
  const rawUrl = stringValue(record.url)?.trim();
  if (!rawUrl) return undefined;
  const parsed = parseBrowserNavUrl(rawUrl);
  if (!parsed) return undefined;
  const search = publicSearchQueryFromUrl(parsed);
  if (!search) return undefined;
  return { ...search, url: parsed.toString() };
}

function publicHttpUrlFromInput(value: unknown): URL | undefined {
  const rawUrl = stringValue(value)?.trim();
  if (!rawUrl) return undefined;
  const parsed = parseBrowserNavUrl(rawUrl);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) return undefined;
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]" || hostname.endsWith(".localhost")) return undefined;
  if (/^(10|127)\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return undefined;
  return parsed;
}

function parseBrowserNavUrl(rawUrl: string): URL | undefined {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    return undefined;
  }
}

function publicSearchQueryFromUrl(url: URL): { provider: string; query: string } | undefined {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.toLowerCase();
  const queryParam = (...names: string[]) => {
    for (const name of names) {
      const value = url.searchParams.get(name)?.trim();
      if (value) return value;
    }
    return undefined;
  };
  const googleHost = hostname === "google.com" || hostname.endsWith(".google.com");
  if (googleHost && path.startsWith("/sorry")) {
    const continued = url.searchParams.get("continue");
    const continuedUrl = continued ? parseBrowserNavUrl(continued) : undefined;
    return continuedUrl ? publicSearchQueryFromUrl(continuedUrl) : undefined;
  }
  if (googleHost && (path === "/search" || path === "/webhp")) {
    const query = queryParam("q");
    return query ? { provider: "Google", query } : undefined;
  }
  if ((hostname === "duckduckgo.com" || hostname.endsWith(".duckduckgo.com")) && (path === "/" || path.startsWith("/html") || path.startsWith("/lite"))) {
    const query = queryParam("q");
    return query ? { provider: "DuckDuckGo", query } : undefined;
  }
  if ((hostname === "bing.com" || hostname.endsWith(".bing.com")) && path.startsWith("/search")) {
    const query = queryParam("q");
    return query ? { provider: "Bing", query } : undefined;
  }
  if (hostname === "search.brave.com" && path.startsWith("/search")) {
    const query = queryParam("q");
    return query ? { provider: "Brave Search", query } : undefined;
  }
  if ((hostname === "kagi.com" || hostname.endsWith(".kagi.com")) && path.startsWith("/search")) {
    const query = queryParam("q");
    return query ? { provider: "Kagi", query } : undefined;
  }
  if ((hostname === "search.yahoo.com" || hostname.endsWith(".search.yahoo.com")) && path.startsWith("/search")) {
    const query = queryParam("p", "q");
    return query ? { provider: "Yahoo Search", query } : undefined;
  }
  return undefined;
}

function routedBrowserUserActionBlock(
  name: string,
  result: AgentToolResult<Record<string, unknown>>,
): (AgentToolResult<Record<string, unknown>> & { isError: true }) | undefined {
  if (!name.startsWith("browser_")) return undefined;
  const details = objectInput(result.details);
  const userAction = objectInput(details.userAction);
  if (!isActiveBrowserUserActionLike(userAction)) return undefined;
  return {
    content: [
      ...result.content,
      {
        type: "text" as const,
        text: "Ambient blocked further routed browser automation until the user completes this browser challenge or chooses a provider-backed web research route.",
      },
    ],
    details: {
      runtime: "ambient-tool-router",
      toolName: name,
      status: "blocked-user-action",
      wrappedTool: name,
      executionBlocked: true,
      userAction,
      resultDetails: result.details,
    },
    isError: true,
  };
}

function isActiveBrowserUserActionLike(value: Record<string, unknown>): boolean {
  return value.active === true &&
    typeof value.kind === "string" &&
    (value.status === "waiting" || value.status === "resuming") &&
    typeof value.message === "string";
}

function activateRelatedTools(session: AmbientToolRouterSession, name: string): void {
  if (!session.setActiveToolsByName) return;
  const active = session.getActiveToolNames();
  const additions = relatedActivationBundle(name).filter((toolName) => active.includes(toolName) || session.getToolDefinition(toolName));
  const next = dedupeToolNames([...active, ...additions]);
  if (next.length === active.length && next.every((toolName, index) => toolName === active[index])) return;
  session.setActiveToolsByName(next);
}

function relatedActivationBundle(name: string): string[] {
  if (name.startsWith("browser_")) return [...AMBIENT_DIRECT_BROWSER_TOOL_NAMES];
  if (name.startsWith("web_research_")) return [...AMBIENT_DIRECT_WEB_RESEARCH_TOOL_NAMES];
  if (name.startsWith("ambient_local_deep_research_")) {
    return [...AMBIENT_DIRECT_LOCAL_RUNTIME_TOOL_NAMES, ...AMBIENT_DIRECT_LOCAL_DEEP_RESEARCH_TOOL_NAMES];
  }
  if (name.startsWith("ambient_local_model_runtime_")) return [...AMBIENT_DIRECT_LOCAL_RUNTIME_TOOL_NAMES, name];
  if (name.startsWith("ambient_cli_")) return ["ambient_cli_search", "ambient_cli_describe", "ambient_cli"];
  if (name.startsWith("ambient_setup_")) return [...AMBIENT_DIRECT_SETUP_TOOL_NAMES];
  if (name === "ambient_install_route_plan") {
    return [
      "ambient_install_route_plan",
      "ambient_cli_search",
      "ambient_cli_describe",
      "ambient_cli",
      ...AMBIENT_DIRECT_SETUP_TOOL_NAMES,
    ];
  }
  if (name.startsWith("ambient_mcp_tool_")) {
    return [
      "ambient_mcp_tool_search",
      "ambient_mcp_tool_describe",
      "ambient_mcp_tool_call",
      "ambient_mcp_tool_review_accept",
      "ambient_mcp_tool_policy_update",
      "ambient_mcp_aggregation_status",
    ];
  }
  if (name.startsWith("ambient_mcp_guided_bridge_")) {
    return [
      "ambient_mcp_guided_bridge_describe",
      "ambient_mcp_guided_bridge_preflight",
      "ambient_mcp_guided_bridge_register",
      ...AMBIENT_DIRECT_MCP_TOOL_BRIDGE_NAMES,
    ];
  }
  if (name.startsWith("ambient_mcp_standard_import_")) {
    return [
      "ambient_mcp_standard_import_describe",
      "ambient_mcp_standard_import_install",
      ...AMBIENT_DIRECT_MCP_TOOL_BRIDGE_NAMES,
    ];
  }
  if (name.startsWith("ambient_mcp_remote_proxy_")) {
    return [
      "ambient_mcp_remote_proxy_describe",
      "ambient_mcp_remote_proxy_install",
      ...AMBIENT_DIRECT_MCP_TOOL_BRIDGE_NAMES,
    ];
  }
  if (name.startsWith("ambient_mcp_server_")) {
    return [
      "ambient_mcp_server_search",
      "ambient_mcp_server_describe",
      "ambient_mcp_server_install",
      "ambient_mcp_server_list",
      "ambient_mcp_server_default_update_describe",
      "ambient_mcp_server_uninstall",
      "ambient_mcp_runtime_repair_describe",
      "ambient_mcp_runtime_repair_apply",
      ...AMBIENT_DIRECT_MCP_TOOL_BRIDGE_NAMES,
    ];
  }
  if (name.startsWith("ambient_mcp_runtime_repair_")) {
    return [
      "ambient_mcp_server_list",
      "ambient_mcp_server_diagnostics",
      "ambient_mcp_runtime_repair_describe",
      "ambient_mcp_runtime_repair_apply",
      "ambient_mcp_autowire_review",
      "ambient_mcp_standard_import_describe",
      "ambient_mcp_standard_import_install",
      "ambient_mcp_remote_proxy_describe",
      "ambient_mcp_remote_proxy_install",
    ];
  }
  if (name.startsWith("ambient_mcp_autowire_")) {
    return [
      "ambient_mcp_autowire_plan",
      "ambient_mcp_autowire_review",
      "ambient_mcp_autowire_evidence_read",
      "ambient_mcp_autowire_plan_revision_list",
      "ambient_mcp_autowire_plan_revision_read",
      "ambient_mcp_autowire_plan_edit_describe",
      "ambient_mcp_autowire_plan_edit_apply",
      "ambient_mcp_autowire_source_build_describe",
      "ambient_mcp_autowire_source_build_create",
      "ambient_mcp_autowire_custom_source_describe",
      "ambient_mcp_standard_import_describe",
      "ambient_mcp_standard_import_install",
      "ambient_mcp_server_search",
      "ambient_mcp_server_describe",
      "ambient_mcp_server_install",
      "ambient_mcp_remote_proxy_describe",
      "ambient_mcp_remote_proxy_install",
      "ambient_mcp_guided_bridge_describe",
      "ambient_mcp_guided_bridge_preflight",
      "ambient_mcp_guided_bridge_register",
    ];
  }
  if (name === "ambient_mcp_secret_request") return ["ambient_mcp_secret_request"];
  if (name.startsWith("ambient_workflows_")) {
    return [
      "ambient_workflows_search",
      "ambient_workflows_describe",
      "ambient_workflows_inject",
      "ambient_workflows_update",
      "ambient_workflows_archive",
      "ambient_workflows_unarchive",
      "ambient_workflows_restore_version",
    ];
  }
  return [name];
}

function currentCatalogEntries(session: AmbientToolRouterSession): AmbientToolCatalogEntry[] {
  return session
    .getAllTools()
    .filter((tool) => isFirstPartyAmbientTool(session, tool.name))
    .map((tool) => catalogEntryFor(session, tool.name));
}

function catalogEntryFor(session: AmbientToolRouterSession, name: string, definition?: ToolDefinition<any, any, any>): AmbientToolCatalogEntry {
  const live = definition ?? session.getToolDefinition(name);
  const descriptor = descriptorCatalog().get(name);
  return {
    name,
    label: descriptor?.label ?? live?.label ?? name,
    description: descriptor?.description ?? live?.description ?? "",
    promptSnippet: descriptor?.promptSnippet ?? live?.promptSnippet,
    promptGuidelines: descriptor?.promptGuidelines ?? live?.promptGuidelines ?? [],
    parameters: descriptor?.inputSchema ?? live?.parameters ?? {},
    category: categoryForToolName(name),
    sideEffects: descriptor?.sideEffects,
    permissionScope: descriptor?.permissionScope,
    supportsDryRun: descriptor?.supportsDryRun,
    supportsUndo: descriptor?.supportsUndo,
    idempotency: descriptor?.idempotency,
    defaultTimeoutMs: descriptor?.defaultTimeoutMs,
  };
}

function descriptorCatalog(): Map<string, DesktopToolDescriptor> {
  const map = new Map(firstPartyDesktopToolDescriptors().map((descriptor) => [descriptor.name, descriptor]));
  for (const descriptor of workflowNativeToolDescriptors()) map.set(descriptor.name, descriptor);
  for (const definition of projectBoardNativeTaskToolDefinitions()) {
    map.set(definition.name, {
      name: definition.name,
      label: definition.label,
      description: definition.description,
      promptSnippet: definition.promptSnippet,
      promptGuidelines: definition.promptGuidelines,
      inputSchema: definition.parameters,
      source: "first-party",
      sideEffects: "write-workspace",
      permissionScope: "project-board-task",
      supportsDryRun: false,
      supportsUndo: false,
      idempotency: "not-supported",
      defaultTimeoutMs: 8_000,
    });
  }
  return map;
}

function isFirstPartyAmbientTool(session: AmbientToolRouterSession, name: string): boolean {
  if (!session.getToolDefinition(name)) return false;
  if (AMBIENT_ROUTER_TOOL_NAMES.includes(name as (typeof AMBIENT_ROUTER_TOOL_NAMES)[number])) return false;
  if (["read", "bash", "edit", "write", "grep", "find", "ls"].includes(name)) return false;
  if (isHiddenInstallSurface(name)) return false;
  return descriptorCatalog().has(name) || name === "long_context_process";
}

function isHiddenInstallSurface(name: string): boolean {
  if (name.startsWith("ambient_plugin_")) return true;
  return name === "ambient_pi_extension_install_sandboxed";
}

function compactEntry(entry: AmbientToolCatalogEntry, session: AmbientToolRouterSession) {
  return {
    name: entry.name,
    label: entry.label,
    category: entry.category,
    description: entry.description,
    active: session.getActiveToolNames().includes(entry.name),
    sideEffects: entry.sideEffects,
    permissionScope: entry.permissionScope,
  };
}

function scoreCatalogEntry(entry: AmbientToolCatalogEntry, query: string): number {
  if (!query) return 1;
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === entry.name.toLowerCase()) return 10_000;
  if (normalizedQuery.includes(entry.name.toLowerCase())) return 9_000;
  const haystack = [
    entry.name,
    entry.label,
    entry.category,
    entry.description,
    entry.promptSnippet,
    ...entry.promptGuidelines,
  ]
    .join(" ")
    .toLowerCase();
  const terms = query.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean);
  let score = 0;
  for (const term of terms) {
    if (entry.name.toLowerCase().includes(term)) score += 5;
    if (entry.category.toLowerCase().includes(term)) score += 3;
    if (haystack.includes(term)) score += 1;
  }
  return score;
}

function isExactCatalogNameQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return normalized ? descriptorCatalog().has(normalized) || normalized === "long_context_process" : false;
}

interface AmbientToolSearchContext {
  installedMcpSearchAliases: string[];
  category?: string;
}

function searchRouteBoost(entry: AmbientToolCatalogEntry, query: string, context: AmbientToolSearchContext): number {
  const webResearchBoost = publicWebResearchRouteBoost(entry, query, context);
  if (webResearchBoost) return webResearchBoost;
  const recordedWorkflowBoost = recordedWorkflowPlaybookRouteBoost(entry, query, context);
  if (recordedWorkflowBoost) return recordedWorkflowBoost;
  if (isInstalledMcpToolUseQuery(query, context)) {
    if (entry.name === "ambient_mcp_tool_search") return 2_000;
    if (entry.name === "ambient_mcp_tool_describe") return 1_600;
    if (entry.name === "ambient_mcp_tool_call") return 1_200;
    if (entry.name === "ambient_mcp_server_list") return 150;
  }
  const standardImportBoost = standardImportRouteBoost(entry, query);
  if (standardImportBoost) return standardImportBoost;
  if (!isInstallRouteQuery(query)) return 0;
  if (entry.name === "ambient_install_route_plan") return 1_000;
  if (isMcpRouteQuery(query)) {
    if (entry.name === "ambient_mcp_autowire_plan") return 900;
    if (entry.name === "ambient_mcp_server_search") return 250;
  }
  return 0;
}

function recordedWorkflowPlaybookRouteBoost(entry: AmbientToolCatalogEntry, query: string, context: AmbientToolSearchContext): number {
  if (!isRecordedWorkflowPlaybookUseQuery(query, context)) return 0;
  if (entry.name === "ambient_workflows_search") return 3_200;
  if (entry.name === "ambient_workflows_describe") return 2_800;
  if (entry.name === "ambient_workflows_inject") return 2_400;
  if (entry.name === "ambient_workflows_callable_catalog") return 2_000;
  if (entry.name === "ambient_workflows_callable_describe") return 1_800;
  return 0;
}

function publicWebResearchRouteBoost(entry: AmbientToolCatalogEntry, query: string, context: AmbientToolSearchContext): number {
  const intent = publicWebResearchIntent(query, context);
  if (!intent) return 0;
  if (intent === "fetch") {
    if (entry.name === "web_research_fetch") return 3_000;
    if (entry.name === "web_research_status") return 400;
    if (entry.name === "web_research_search") return 250;
    return 0;
  }
  if (entry.name === "web_research_search") return 3_000;
  if (entry.name === "web_research_status") return 500;
  if (entry.name === "web_research_fetch") return 250;
  return 0;
}

function isWebResearchBrokerEntry(entry: AmbientToolCatalogEntry): boolean {
  return entry.name === "web_research_search" || entry.name === "web_research_fetch" || entry.name === "web_research_status";
}

function isPublicWebResearchToolUseQuery(query: string, context: AmbientToolSearchContext): boolean {
  return publicWebResearchIntent(query, context) !== undefined;
}

function publicWebResearchIntent(query: string, context: AmbientToolSearchContext): "search" | "fetch" | undefined {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return undefined;
  const category = context.category;
  if (category && !["ambient", "web", "web-research", "research", "search", "public-web"].includes(category)) return undefined;
  if (isInstallRouteQuery(normalized)) return undefined;
  if (/\b(browser|chrome|screenshot|visual|click|navigate|open\s+(?:a\s+)?(?:known\s+)?url|login|captcha|mfa|profile|ui\s+state)\b/.test(normalized) && !normalized.includes("web_research")) {
    return undefined;
  }
  if (/\b(fetch|read|retrieve|scrape|extract)\b/.test(normalized) && /\b(https?:\/\/|url|page|article|document)\b/.test(normalized)) return "fetch";
  if (
    /\b(web_research_search|web\s+research|public\s+web|internet|online|search\s+(?:the\s+)?web|web\s+search|look\s+up|lookup|research|sources?|citations?|current|latest|recent|today|docs?|documentation|knowledge\s+retrieval|find\s+information|discover)\b/.test(normalized)
  ) {
    return "search";
  }
  return undefined;
}

function isRecordedWorkflowPlaybookUseQuery(query: string, context: AmbientToolSearchContext): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;
  const category = context.category;
  if (category && !["ambient", "workflow", "workflows", "automation", "capability"].includes(category)) return false;
  if (/\b(workflow recorder|recorded workflow|saved workflow|workflow playbook|playbook)\b/.test(normalized)) return true;
  if (looksLikeSavedWorkflowTitleQuery(query) && !isWorkflowAgentNativeQuery(normalized) && !isInstallRouteQuery(normalized)) return true;
  if (/\bworkflow\b/.test(normalized) && !isWorkflowAgentNativeQuery(normalized) && !isInstallRouteQuery(normalized)) return true;
  return /\b(run|use|launch|execute|start)\b/.test(normalized) && hasTitleCasedRunTarget(query);
}

function isWorkflowAgentNativeQuery(normalizedQuery: string): boolean {
  return /\b(create|new|build|draft|design|exploration|explore|compile|preview|artifact|approve|reject|cancel|stop|retry|resume|checkpoint|skip|workflow agent|workflow thread|current context|workflow_current_context|capability search|capability describe)\b/.test(normalizedQuery);
}

function hasTitleCasedRunTarget(query: string): boolean {
  return /\b(?:run|use|launch|execute|start)\s+(?:the\s+|a\s+|an\s+)?[A-Z][A-Za-z0-9'_-]+(?:\s+(?:[A-Z][A-Za-z0-9'_-]+|A|An|And|For|In|Of|On|The|To)){1,}/.test(query);
}

function looksLikeSavedWorkflowTitleQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!/^(?:prepare|find|polish|generate|summari[sz]e|write|make|check|review|triage|draft|clean|organize|diagnose|inspect)\b/i.test(trimmed)) {
    return false;
  }
  return /\b[A-Z][A-Za-z0-9'_-]+(?:\s+(?:[A-Z][A-Za-z0-9'_-]+|A|An|And|For|In|Of|On|The|To)){2,}\b/.test(trimmed);
}

function standardImportRouteBoost(entry: AmbientToolCatalogEntry, query: string): number {
  const normalized = query.toLowerCase();
  const isStandardImport =
    /\bstandard[-\s]?mcp\b/.test(normalized) ||
    /\bstandard[-\s]?import\b/.test(normalized) ||
    /\bpackage[-\s]?backed\b/.test(normalized) ||
    /\breviewed\s+(?:mcp\s+)?(?:candidate|import)\b/.test(normalized);
  if (!isStandardImport) return 0;
  const wantsInstall = /\b(install|start|run|create|launch|ensure|repair)\b/.test(normalized);
  const wantsDescribe = /\b(describe|review|preview|plan)\b/.test(normalized);
  if (wantsInstall) {
    if (entry.name === "ambient_mcp_standard_import_install") return 2_500;
    if (entry.name === "ambient_mcp_standard_import_describe") return 1_500;
  }
  if (wantsDescribe) {
    if (entry.name === "ambient_mcp_standard_import_describe") return 2_000;
    if (entry.name === "ambient_mcp_standard_import_install") return 900;
  }
  if (entry.name === "ambient_mcp_standard_import_describe") return 1_300;
  if (entry.name === "ambient_mcp_standard_import_install") return 1_100;
  return 0;
}

function isInstalledMcpToolUseEntry(entry: AmbientToolCatalogEntry): boolean {
  return AMBIENT_DIRECT_MCP_TOOL_BRIDGE_NAMES.includes(entry.name as (typeof AMBIENT_DIRECT_MCP_TOOL_BRIDGE_NAMES)[number]) ||
    entry.name === "ambient_mcp_server_list";
}

function shouldLoadInstalledMcpSearchAliases(query: string, category?: string): boolean {
  const normalized = query.toLowerCase();
  if (!normalized.trim() || isMcpInstallLikeQuery(normalized)) return false;
  if (category === "mcp") return true;
  return /\b(installed|already|available|use|call|invoke|run|ask|tool|tools|mcp|toolhive|server|echo|fetch|read|search|retrieve|query|summari[sz]e|diagnostic|sample)\b/.test(normalized);
}

function shouldIncludeActiveMcpWorkflowTools(query: string, category?: string): boolean {
  const normalized = query.toLowerCase();
  if (!normalized.trim() || isMcpInstallLikeQuery(normalized)) return false;
  if (category !== "mcp" && !isMcpRouteQuery(normalized)) return false;
  return /\b(?:autowire|review|candidate|handoff|standard\s+mcp|standard[-\s]?import|remote[-\s]?proxy|guided[-\s]?bridge|secret)\b/.test(normalized);
}

function isInstalledMcpToolUseQuery(query: string, context: AmbientToolSearchContext): boolean {
  const normalized = query.toLowerCase();
  if (!normalized.trim() || isMcpInstallLikeQuery(normalized)) return false;
  const aliasMatch = installedMcpAliasMatchesQuery(normalized, context.installedMcpSearchAliases);
  if (aliasMatch) return true;
  const hasUseIntent = /\b(installed|already|available|use|call|invoke|run|ask|tool|tools|echo|fetch|read|search|retrieve|query|summari[sz]e|diagnostic|sample)\b/.test(normalized);
  if (!hasUseIntent) return false;
  return isMcpRouteQuery(query) || aliasMatch;
}

function isMcpInstallLikeQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  return /\b(install|add|setup|set\s+up|import|register|wrap|create|build)\b/.test(normalized) ||
    /\buse\s+this\b/.test(normalized);
}

function categoryMatchesSearchFilter(entry: AmbientToolCatalogEntry, category: string | undefined, query: string): boolean {
  if (!category) return true;
  const entryCategory = normalizeCategory(entry.category);
  if (entryCategory === category) return true;
  if (category === "toolhive" && entryCategory === "mcp") return true;
  if (category === "capability" && isInstallRouteQuery(query) && entryCategory === "install-routing") return true;
  if (category === "capability" && isMcpRouteQuery(query) && entryCategory === "mcp") return true;
  return false;
}

function isInstallRouteQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  return /\b(install|add|setup|set\s+up|use\s+this|wrap|create|build|import|register|capability|plugin|provider|server)\b/.test(normalized) &&
    /\b(github|gitlab|repo|repository|https?|npm|pypi|package|mcp|toolhive|pi\.dev|provider|capability|plugin|server)\b/.test(normalized);
}

function isMcpRouteQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  return /\bmcp\b/.test(normalized) ||
    normalized.includes("model context protocol") ||
    normalized.includes("toolhive") ||
    normalized.includes("server.json") ||
    normalized.includes("mcpservers");
}

function installedMcpAliasMatchesQuery(normalizedQuery: string, aliases: string[]): boolean {
  const queryTerms = new Set(normalizedQuery.split(/[^a-z0-9]+/).filter((term) => term.length >= 3));
  return aliases.some((alias) => {
    const normalizedAlias = alias.trim().toLowerCase();
    if (!normalizedAlias || normalizedAlias.length < 3) return false;
    if (normalizedQuery.includes(normalizedAlias)) return true;
    return normalizedAlias
      .split(/[^a-z0-9]+/)
      .some((term) => term.length >= 4 && !mcpAliasStopWords.has(term) && queryTerms.has(term));
  });
}

const mcpAliasStopWords = new Set([
  "ambient",
  "server",
  "mcp",
  "modelcontextprotocol",
  "standard",
  "tool",
  "tools",
  "toolhive",
]);

function categoryForToolName(name: string): string {
  if (name.startsWith("browser_")) return "browser";
  if (name.startsWith("web_research_")) return "web-research";
  if (name.startsWith("media_")) return "media";
  if (name.startsWith("ambient_voice_")) return "voice";
  if (name.startsWith("ambient_stt_")) return "stt";
  if (name.startsWith("ambient_visual_")) return "vision";
  if (name.startsWith("ambient_provider_")) return "provider";
  if (name.startsWith("ambient_git_")) return "git";
  if (name.startsWith("ambient_install_route_")) return "install-routing";
  if (name.startsWith("ambient_mcp_")) return "mcp";
  if (name.startsWith("ambient_messaging_") || name.startsWith("ambient_runtime_surface_")) return "messaging";
  if (name.startsWith("ambient_search_")) return "search-routing";
  if (name.startsWith("ambient_privileged_")) return "privileged";
  if (name.startsWith("ambient_capability_builder_") || name.startsWith("ambient_plugin_") || name.startsWith("ambient_pi_") || name.startsWith("ambient_cli_package_")) return "capability";
  if (name.startsWith("google_workspace_")) return "google-workspace";
  if (name.startsWith("ambient_workflows_")) return "workflow";
  if (name.startsWith("workflow_")) return "workflow";
  if (name.startsWith("task_")) return "project-board";
  if (name === "long_context_process") return "long-context";
  return "ambient";
}

function normalizeCategory(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function clampLimit(value: unknown): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 8;
  return Math.max(1, Math.min(parsed, 20));
}

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseAmbientToolCallInput(value: unknown): ParsedAmbientToolCallInput {
  const input = objectInput(value);
  const rawName = stringValue(input.toolName) ?? stringValue(input.name);
  const inline = rawName ? parseInlineArgumentEncodedToolName(rawName) : undefined;
  const toolName = inline?.toolName ?? rawName?.trim();
  const toolInput = input.toolInput ?? input.input ?? inline?.input ?? {};
  return {
    toolName: toolName || undefined,
    input: toolName ? normalizeToolArgumentsForTool(toolName, toolInput) : toolInput,
  };
}

function parseInlineArgumentEncodedToolName(value: string): ParsedAmbientToolCallInput | undefined {
  const marker = "<arg_key>";
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 1) return undefined;
  const toolName = value.slice(0, markerIndex).trim();
  if (!toolName) return undefined;
  const encoded = value.slice(markerIndex + marker.length);
  const match = encoded.match(/^([^<]+)<\/arg_key><arg_value>([\s\S]*?)(?:<\/arg_value>)?$/);
  if (!match) return { toolName };
  const key = match[1]?.trim();
  const rawValue = match[2]?.trim() ?? "";
  if (key !== "input" && key !== "toolInput") return { toolName };
  try {
    return { toolName, input: JSON.parse(rawValue) };
  } catch {
    return { toolName };
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function validateJsonSchema(schema: unknown, value: unknown, path = "$"): string[] {
  if (!schema || typeof schema !== "object") return [];
  const record = schema as Record<string, unknown>;
  if (Array.isArray(record.anyOf)) {
    return record.anyOf.some((candidate) => validateJsonSchema(candidate, value, path).length === 0)
      ? []
      : [`${path} did not match any allowed schema`];
  }
  if (Array.isArray(record.enum) && !record.enum.includes(value)) return [`${path} must be one of ${record.enum.map(String).join(", ")}`];
  const type = record.type;
  if (typeof type === "string") {
    const typeError = validateType(type, value, path);
    if (typeError) return [typeError];
  }
  if (record.type === "object" || (record.properties && value && typeof value === "object" && !Array.isArray(value))) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [`${path} must be an object`];
    const objectValue = value as Record<string, unknown>;
    const properties = (record.properties && typeof record.properties === "object" ? record.properties : {}) as Record<string, unknown>;
    const errors: string[] = [];
    for (const required of Array.isArray(record.required) ? record.required : []) {
      if (typeof required === "string" && objectValue[required] === undefined) errors.push(`${path}.${required} is required`);
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (objectValue[key] !== undefined) errors.push(...validateJsonSchema(childSchema, objectValue[key], `${path}.${key}`));
    }
    if (record.additionalProperties === false) {
      for (const key of Object.keys(objectValue)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) errors.push(`${path}.${key} is not allowed`);
      }
    }
    return errors;
  }
  if (record.type === "array" && Array.isArray(value) && record.items) {
    return value.flatMap((item, index) => validateJsonSchema(record.items, item, `${path}[${index}]`));
  }
  return [];
}

function dedupeToolNames(toolNames: readonly string[]): string[] {
  return [...new Set(toolNames.filter((toolName) => typeof toolName === "string" && toolName.trim()).map((toolName) => toolName.trim()))];
}

function validateType(type: string, value: unknown, path: string): string | undefined {
  if (type === "object" && (!value || typeof value !== "object" || Array.isArray(value))) return `${path} must be an object`;
  if (type === "array" && !Array.isArray(value)) return `${path} must be an array`;
  if (type === "string" && typeof value !== "string") return `${path} must be a string`;
  if ((type === "number" || type === "integer") && (typeof value !== "number" || !Number.isFinite(value))) return `${path} must be a number`;
  if (type === "integer" && typeof value === "number" && !Number.isInteger(value)) return `${path} must be an integer`;
  if (type === "boolean" && typeof value !== "boolean") return `${path} must be a boolean`;
  return undefined;
}
