import type { DesktopToolDescriptor } from "./desktopToolDescriptorTypes";

const webResearchPreferenceUpdateInputSchema = {
  type: "object",
  minProperties: 1,
  properties: {
    action: {
      type: "string",
      enum: ["reset_search_defaults", "prefer_provider", "require_provider"],
      description:
        "Explicit persistent preference action. Use reset_search_defaults for reset/clear requests; use prefer_provider or require_provider with providerAlias/preferredProvider for a single-provider preference. Omit when setting an exact providerOrder.",
    },
    activity: {
      type: "string",
      enum: ["web_search"],
      description: "Backward-compatible activity selector. Omit for the canonical web research preference model.",
    },
    role: {
      type: "string",
      enum: ["search", "fetch", "interactive_browser"],
      description: "Provider role to update. Defaults to search.",
    },
    providerOrder: {
      type: "array",
      items: { type: "string" },
      description:
        "Exact persistent provider order for the selected role. Use provider ids or labels from web_research_status, such as ambient-browser or Exa Search.",
    },
    providerIds: {
      type: "array",
      items: { type: "string" },
      description: "Alias for providerOrder. Prefer providerOrder in new calls.",
    },
    preferredProvider: {
      type: "string",
      description: "Exact configured web research provider id, label, installed Ambient CLI packageName, package id, or capability id.",
    },
    providerAlias: {
      type: "string",
      description:
        "Human-friendly provider label from web_research_status, such as Ambient Browser, Exa Search, Scrapling, or Brave Search when installed.",
    },
    mode: {
      type: "string",
      enum: ["prefer", "require"],
      description: "prefer uses the provider first; require blocks browser fallback unless explicitly overridden.",
    },
    fallback: {
      type: "string",
      enum: ["allow", "block"],
      description: "Whether Ambient Browser fallback is allowed when the preferred provider is unsuitable.",
    },
    clear: { type: "boolean", description: "Clear the stored web_research_search preference and restore default search order." },
    reason: { type: "string", description: "Short reason to show in the approval card." },
  },
  additionalProperties: false,
};

export const searchPreferenceToolDescriptors: DesktopToolDescriptor[] = [
  {
    name: "ambient_search_preference_status",
    label: "Search Preference Status",
    description: "Legacy alias for inspecting Ambient web research search preferences and installed Ambient CLI search providers.",
    promptSnippet:
      "ambient_search_preference_status: Legacy status alias. Prefer web_research_status for the complete Search & Web provider stack.",
    promptGuidelines: [
      "Prefer web_research_status when the user asks which search or page-read provider is preferred, because it reports the complete canonical Search & Web provider stack.",
      "For requests like 'prefer Brave Search for web search', first inspect provider status, then use web_research_preferences_update if a persistent change is needed.",
      "For ordinary public knowledge retrieval, call web_research_search or web_research_fetch instead of browser_search/browser_content unless the user explicitly asks for browser behavior.",
    ],
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "none",
    permissionScope: "search-routing",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "required",
    defaultTimeoutMs: 30_000,
    runtimeSupport: ["chat"],
  },
  {
    name: "ambient_search_preference_update",
    label: "Search Preference Update",
    description: "Legacy alias for persistently updating Ambient's web research search provider order.",
    promptSnippet:
      "ambient_search_preference_update: Legacy alias. Prefer web_research_preferences_update for persistent Search & Web preference changes.",
    promptGuidelines: [
      "Prefer web_research_preferences_update for new calls; this tool remains only as a compatibility alias.",
      "Call web_research_status first and pass an exact preferredProvider/packageName or providerAlias from its output whenever possible.",
      "Use action=prefer_provider with providerAlias/preferredProvider for soft preferences such as 'prefer Brave Search'. Use action=require_provider only when the user explicitly asks to require a provider.",
      "Use action=reset_search_defaults when the user asks to clear or reset the web_research_search provider preference. clear=true remains accepted only for compatibility.",
      "Do not use this for one-turn overrides. Pass providerOrder to web_research_search or web_research_fetch instead so global preferences are unchanged.",
      "Do not store API keys or secrets in web research preferences.",
    ],
    inputSchema: webResearchPreferenceUpdateInputSchema,
    source: "first-party",
    sideEffects: "write-workspace",
    permissionScope: "search-routing",
    supportsDryRun: false,
    supportsUndo: true,
    idempotency: "recommended",
    defaultTimeoutMs: 30_000,
    runtimeSupport: ["chat"],
  },
];

export const webResearchToolDescriptors: DesktopToolDescriptor[] = [
  {
    name: "web_research_status",
    label: "Web Research Status",
    description: "Inspect Ambient's configured web research provider stack, health, privacy labels, and fallback order.",
    promptSnippet: "web_research_status: Inspect configured web search/page-fetch providers and fallback order.",
    promptGuidelines: [
      "Call web_research_status when the user asks how Ambient will search or retrieve public web content, or before changing provider order.",
      "web_research_status is active-stack-only. If the user asks about a provider that is absent from this output, call web_research_provider_search or web_research_provider_describe before saying whether Ambient knows, recommends, can add, or can install it.",
      "Use web_research_search and web_research_fetch for ordinary public research tasks instead of choosing Exa, Scrapling, or browser tools directly.",
      "Use browser tools directly for authenticated pages, visible browser state, CAPTCHA, login, MFA, screenshots, or interactive workflows.",
    ],
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "none",
    permissionScope: "web-research-routing",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "required",
    defaultTimeoutMs: 30_000,
    runtimeSupport: ["chat"],
  },
  {
    name: "web_research_provider_search",
    label: "Web Research Provider Search",
    description: "Search Ambient's configured, installed, and known addable web research providers.",
    promptSnippet:
      "web_research_provider_search: Search configured and known addable web research providers before claiming whether a provider exists or can be enabled.",
    promptGuidelines: [
      "Call web_research_provider_search when the user asks whether Ambient knows, recommends, can add, can install, or can enable a web search/page-fetch provider.",
      "This tool merges configured providers with Ambient provider catalog cards, so absence from web_research_status does not mean the provider is unknown or unsupported.",
      "Use web_research_provider_describe for an exact provider before recommending setup or preference changes.",
      "Do not search ToolHive or MCP registries for a provider that already has a known Ambient provider catalog card unless the card or user explicitly selects that lane.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Provider name, id, package, secret, or host to search for, such as Brave Search or BRAVE_API_KEY.",
        },
        role: {
          type: "string",
          enum: ["search", "fetch", "interactive_browser"],
          description: "Optional web research role to filter providers by.",
        },
        limit: { type: "number", description: "Maximum configured and known-addable providers per section, 1-25." },
      },
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "none",
    permissionScope: "web-research-routing",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "required",
    defaultTimeoutMs: 30_000,
    runtimeSupport: ["chat"],
  },
  {
    name: "web_research_provider_describe",
    label: "Web Research Provider Describe",
    description:
      "Describe one configured or known addable web research provider, including setup lane, secrets, hosts, and preference guidance.",
    promptSnippet:
      "web_research_provider_describe: Describe a specific web research provider before claiming whether it is enabled, addable, or should use provider catalog setup.",
    promptGuidelines: [
      "Call web_research_provider_describe with the provider name or id before answering questions like 'do we have Brave?' or 'can we add Brave?'.",
      "If the provider is configured, use web_research_preferences_update for persistent ordering changes or providerOrder for one-call overrides.",
      "If the provider is known-addable, run ambient_provider_catalog through ambient_tool_search, ambient_tool_describe, and ambient_tool_call, then run ambient_capability_builder_plan; do not detour through ToolHive/MCP search unless the provider card or user asks for that lane.",
      "Report enabled/installed status separately from known-addable status.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          description: "Provider name, id, package, secret, or host, such as Brave Search, search.brave, or api.search.brave.com.",
        },
        role: {
          type: "string",
          enum: ["search", "fetch", "interactive_browser"],
          description: "Optional web research role to filter configured providers by.",
        },
        limit: { type: "number", description: "Maximum nearby matches per section when there is no exact match, 1-25." },
      },
      required: ["provider"],
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "none",
    permissionScope: "web-research-routing",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "required",
    defaultTimeoutMs: 30_000,
    runtimeSupport: ["chat"],
  },
  {
    name: "web_research_preferences_update",
    label: "Web Research Preferences Update",
    description: "Persistently update Ambient's global Search & Web provider order with approval.",
    promptSnippet:
      "web_research_preferences_update: With approval, persistently set exact Search & Web provider order, prefer/require one configured provider, or reset search defaults.",
    promptGuidelines: [
      "Call web_research_status first and pass exact provider ids or labels from its output.",
      'For swaps, rollbacks, or multi-provider changes, pass providerOrder with the full desired order for role=search or role=fetch. Example: {"role":"search","providerOrder":["ambient-browser","exa-mcp-default"]}.',
      "Use action=prefer_provider with providerAlias/preferredProvider for soft preferences such as 'prefer Brave Search'. Use action=require_provider only when the user explicitly asks to require a provider.",
      "Use action=reset_search_defaults when the user asks to clear or reset the global web_research_search provider preference. clear=true remains accepted only for compatibility.",
      "Do not pass known-addable provider catalog names unless web_research_status shows them as configured providers. Use provider setup tools before preference updates for absent providers.",
      "Do not call this for one-turn provider requests such as 'use browser this time' or 'try Exa for this query'. Pass providerOrder to web_research_search or web_research_fetch instead; those overrides are per-call only and do not mutate Settings.",
      "Do not store API keys or secrets in web research preferences.",
    ],
    inputSchema: webResearchPreferenceUpdateInputSchema,
    source: "first-party",
    sideEffects: "write-workspace",
    permissionScope: "web-research-routing",
    supportsDryRun: false,
    supportsUndo: true,
    idempotency: "recommended",
    defaultTimeoutMs: 30_000,
    runtimeSupport: ["chat"],
  },
  {
    name: "web_research_search",
    label: "Web Research Search",
    description: "Search for public web sources using Ambient's configured provider stack.",
    promptSnippet: "web_research_search: Search public web sources through Ambient's configured provider stack.",
    promptGuidelines: [
      "Use web_research_search for open-ended public web discovery, current information, documentation lookup, source finding, and knowledge retrieval.",
      "Ambient routes through configured providers, currently Exa first and Ambient Browser fallback by default, and returns a fallback ledger.",
      "Use providerOrder only when the user explicitly asks for a one-off provider order for this call; it does not mutate global Search & Web settings.",
      "Do not use this for authenticated browser state, pages that require user interaction, CAPTCHA/login/MFA, or visual inspection; use browser tools for those cases.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Public web search query." },
        maxResults: { type: "number", description: "Preferred result count, 1-20. Providers may cap this lower." },
        purpose: {
          type: "string",
          description: "Optional short reason this search is needed, used only by Ambient recovery diagnostics to preserve tool intent.",
        },
        providerOrder: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional one-call provider order override using provider ids or labels from web_research_status. This does not mutate global Search & Web preferences.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "read-external",
    permissionScope: "web-research-network",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "required",
    defaultTimeoutMs: 120_000,
    pagination: {
      itemsPath: "",
      pageSizeInputPath: "maxResults",
      queryInputPath: "query",
      defaultPageSize: 10,
      maxPageSize: 20,
      queryFanOut: true,
    },
    runtimeSupport: ["chat", "workflow"],
  },
  {
    name: "web_research_fetch",
    label: "Web Research Fetch",
    description: "Read a known public URL using Ambient's configured page retrieval provider stack.",
    promptSnippet: "web_research_fetch: Read a public URL through Scrapling, Exa fetch, or browser fallback according to Ambient settings.",
    promptGuidelines: [
      "Use web_research_fetch when you already have a public URL and need text, markdown, or source content.",
      "Ambient routes through configured providers, currently Scrapling first when installed, Exa fetch second, and Ambient Browser fallback by default.",
      "Use providerOrder only when the user explicitly asks for a one-off provider order for this URL read; it does not mutate global Search & Web settings.",
      "Do not use this for authenticated app pages, active browser state, CAPTCHA/login/MFA, screenshots, or visual inspection; use browser tools for those cases.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public URL to read." },
        maxCharacters: { type: "number", description: "Preferred maximum characters for hosted fetch providers, 1,000-80,000." },
        purpose: {
          type: "string",
          description: "Optional short reason this URL read is needed, used only by Ambient recovery diagnostics to preserve tool intent.",
        },
        providerOrder: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional one-call provider order override using provider ids or labels from web_research_status. This does not mutate global Search & Web preferences.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "read-external",
    permissionScope: "web-research-network",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "required",
    defaultTimeoutMs: 120_000,
    runtimeSupport: ["chat", "workflow"],
  },
];
