import { createHash } from "node:crypto";
import { Type, type Tool, type ToolCall } from "@mariozechner/pi-ai";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { aggressiveAmbientRetryPolicy } from "./mcpAutowireAmbientFacade";
import {
  extractMcpAutowireManifestFacts,
  extractMcpAutowireSecretFacts,
  normalizeMcpAutowireTarget,
} from "./mcpAutowireFacts";
import {
  mcpAutowireCandidatePromptSchema,
  validateMcpAutowireCandidate,
  type McpAutowireCandidate,
  type McpAutowireValidationReport,
} from "./mcpAutowireSchemas";
import {
  bestNetworkEvidenceLocator,
  classificationFetchPreview,
  deterministicMcpAutowireNetworkFacts,
  networkJustification,
  resolveMcpAutowireNetworkFacts,
  uniqueSortedNumbers,
  type McpAutowireNetworkFacts,
} from "./mcpAutowirePlannerNetworkFacts";
import {
  callWorkflowPiJson,
  callWorkflowPiText,
  DEFAULT_WORKFLOW_PI_IDLE_TIMEOUT_MS,
  WorkflowPiJsonValidationError,
  type WorkflowPiJsonCallInput,
  type WorkflowPiProgress,
  type WorkflowPiTextCallInput,
  type WorkflowPiToolProgress,
} from "./mcpAutowireWorkflowFacade";

const urlReadToolName = "ambient_mcp_url_read";
const sourceSearchToolName = "ambient_mcp_source_search";
const defaultMaxFetches = 6;
const defaultMaxSearches = 2;
const defaultMaxBytesPerFetch = 24_000;
export interface McpAutowireDiscoveryGrants {
  urlFetch?: boolean;
  githubRaw?: boolean;
  search?: boolean;
  maxFetches?: number;
  maxSearches?: number;
  maxBytesPerFetch?: number;
}

export interface McpAutowirePlanInput {
  targetUrl: string;
  instructions?: string;
  allowedDiscovery?: McpAutowireDiscoveryGrants;
  signal?: AbortSignal;
}

export interface McpAutowireDiscoveryFetch {
  url: string;
  status: "fetched" | "blocked" | "failed";
  statusCode?: number;
  contentType?: string;
  totalChars?: number;
  returnedChars?: number;
  truncated?: boolean;
  textPreview?: string;
  reason?: string;
}

export interface McpAutowireDiscoverySearchResult {
  path: string;
  url: string;
  rawUrl: string;
  reason: string;
  score: number;
}

export interface McpAutowireDiscoverySearch {
  query: string;
  status: "searched" | "blocked" | "failed";
  source: "github-tree";
  defaultBranch?: string;
  resultCount?: number;
  results?: McpAutowireDiscoverySearchResult[];
  reason?: string;
}

export interface McpAutowirePlanResult {
  targetUrl: string;
  instructions?: string;
  session: McpAutowireSessionFacts;
  candidate?: McpAutowireCandidate;
  sourceClassification?: McpAutowireSourceClassification;
  validation: McpAutowireValidationReport;
  discovery: {
    grants: Required<McpAutowireDiscoveryGrants>;
    suggestedUrls: string[];
    fetches: McpAutowireDiscoveryFetch[];
    searches: McpAutowireDiscoverySearch[];
    toolProgress: WorkflowPiToolProgress[];
  };
}

export interface McpAutowireSessionFacts {
  id: string;
  purpose: "mcp-autowire-install";
  targetUrl: string;
}

export interface McpAutowirePlannerOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: FetchLike;
  textCall?: WorkflowPiJsonCallInput<McpAutowireCandidate>["textCall"];
  maxTokens?: number;
  idleTimeoutMs?: number;
  onProgress?: (progress: WorkflowPiProgress) => void;
  onToolProgress?: (progress: WorkflowPiToolProgress) => void;
}

export type McpAutowireSourceClassificationKind =
  | "mcp_candidate"
  | "cli_candidate"
  | "normal_app"
  | "containerized_app"
  | "unknown_exploratory";

export interface McpAutowireSourceClassification {
  kind: McpAutowireSourceClassificationKind;
  confidence: "low" | "medium" | "high";
  summary: string;
  signals: string[];
  setupRecipe?: "mcp-autowire-candidate" | "cli-wrapper-candidate" | "normal-app-setup" | "containerized-app-setup" | "exploratory-evidence";
  nextAction: string;
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export async function planMcpAutowire(input: McpAutowirePlanInput, options: McpAutowirePlannerOptions): Promise<McpAutowirePlanResult> {
  const target = parseTargetUrl(input.targetUrl);
  const session = mcpAutowireSessionFacts({
    targetUrl: target.url.toString(),
    instructions: input.instructions,
  });
  const grants = normalizeDiscoveryGrants(input.allowedDiscovery);
  const suggestedUrls = suggestedDiscoveryUrls(target);
  const fetches: McpAutowireDiscoveryFetch[] = [];
  const searches: McpAutowireDiscoverySearch[] = [];
  const toolProgress: WorkflowPiToolProgress[] = [];
  const tools = createMcpAutowireDiscoveryTools({ target, grants });
  const deterministicDiscoverySummary = await runMcpAutowireDeterministicPreDiscovery({
    input,
    options,
    target,
    grants,
    suggestedUrls,
    fetches,
  });
  const preDiscoverySourceClassification = classifyMcpAutowireSource({
    discoverySummary: deterministicDiscoverySummary,
    fetches,
    searches,
  });
  const preDiscoveryCandidate = deterministicStandardMcpPackageCandidate({
    target,
    instructions: input.instructions,
    discoverySummary: deterministicDiscoverySummary,
    fetches,
    searches,
  });
  if (preDiscoveryCandidate) {
    const candidate = applyInstructionFilesystemMounts(preDiscoveryCandidate, input);
    const validation = validateMcpAutowireCandidate(candidate);
    return {
      targetUrl: target.url.toString(),
      ...(input.instructions ? { instructions: input.instructions } : {}),
      session,
      candidate,
      sourceClassification: preDiscoverySourceClassification,
      validation,
      discovery: {
        grants,
        suggestedUrls,
        fetches,
        searches,
        toolProgress,
      },
    };
  }
  const workflowDiscoverySummary = await runMcpAutowireDiscovery({
    input,
    options,
    target,
    session,
    grants,
    suggestedUrls,
    tools,
    fetches,
    searches,
    toolProgress,
  });
  const discoverySummary = [deterministicDiscoverySummary, workflowDiscoverySummary].filter(Boolean).join("\n\n");
  const sourceClassification = classifyMcpAutowireSource({
    discoverySummary,
    fetches,
    searches,
  });
  const networkEvidenceInput = {
    target,
    instructions: input.instructions,
    discoverySummary,
    fetches,
    searches,
  };
  const networkEvidenceText = deterministicEvidenceText(networkEvidenceInput);
  const networkFacts = await resolveMcpAutowireNetworkFacts({
    targetUrl: target.url.toString(),
    sessionId: session.id,
    signal: input.signal,
    systemPrompt: mcpAutowirePlannerSystemPrompt(),
    options,
    evidence: networkEvidenceInput,
    packageIdentity: deterministicPackageIdentity(networkEvidenceInput, networkEvidenceText),
  });
  const deterministicCandidate = deterministicStandardMcpPackageCandidate({
    target,
    instructions: input.instructions,
    discoverySummary,
    fetches,
    searches,
    networkFacts,
  });
  if (deterministicCandidate) {
    const candidate = applyInstructionFilesystemMounts(deterministicCandidate, input);
    const validation = validateMcpAutowireCandidate(candidate);
    return {
      targetUrl: target.url.toString(),
      ...(input.instructions ? { instructions: input.instructions } : {}),
      session,
      candidate,
      sourceClassification,
      validation,
      discovery: {
        grants,
        suggestedUrls,
        fetches,
        searches,
        toolProgress,
      },
    };
  }
  const deterministicSourceOnlyCandidate = deterministicSourceOnlyMcpCandidate({
    target,
    instructions: input.instructions,
    discoverySummary,
    fetches,
    searches,
    networkFacts,
  });
  if (deterministicSourceOnlyCandidate) {
    const candidate = applyInstructionFilesystemMounts(deterministicSourceOnlyCandidate, input);
    const validation = validateMcpAutowireCandidate(candidate);
    return {
      targetUrl: target.url.toString(),
      ...(input.instructions ? { instructions: input.instructions } : {}),
      session,
      candidate,
      sourceClassification,
      validation,
      discovery: {
        grants,
        suggestedUrls,
        fetches,
        searches,
        toolProgress,
      },
    };
  }
  if (sourceClassification.kind === "normal_app" || sourceClassification.kind === "containerized_app") {
    return {
      targetUrl: target.url.toString(),
      ...(input.instructions ? { instructions: input.instructions } : {}),
      session,
      sourceClassification,
      validation: sourceHandoffValidationReport(sourceClassification),
      discovery: {
        grants,
        suggestedUrls,
        fetches,
        searches,
        toolProgress,
      },
    };
  }
  let candidate: McpAutowireCandidate;
  try {
    candidate = await callWorkflowPiJson<McpAutowireCandidate>({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      model: options.model ?? AMBIENT_DEFAULT_MODEL,
      schemaName: "ambient_mcp_autowire_plan",
      sessionId: session.id,
      responseSchema: mcpAutowireCandidatePromptSchema(),
      systemPrompt: mcpAutowirePlannerSystemPrompt(),
      prompt: mcpAutowirePlannerPrompt({
        targetUrl: target.url.toString(),
        instructions: input.instructions,
        grants,
        suggestedUrls,
        discoverySummary,
        discoveryTrace: discoveryTraceForPrompt({ fetches, searches }),
      }),
      validate: (value) => {
        const report = validateMcpAutowireCandidate(applyInstructionFilesystemMounts(value, input));
        if (!report.candidate) throw new Error(report.blockers.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
        return report.candidate;
      },
      reasoning: false,
      maxTokens: options.maxTokens ?? 6_000,
      idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_WORKFLOW_PI_IDLE_TIMEOUT_MS,
      onProgress: options.onProgress,
      retryPolicy: aggressiveAmbientRetryPolicy(),
      signal: input.signal,
      textCall: options.textCall,
    });
  } catch (error) {
    const jsonValidationError = workflowPiJsonValidationErrorLike(error);
    const invalidCandidateText = jsonValidationError?.responseText ?? (error instanceof Error ? error.message : String(error));
    const fallbackCandidate = jsonValidationError
      ? deterministicSourceOnlyMcpCandidate({
          target,
          instructions: input.instructions,
          discoverySummary,
          fetches,
          searches,
          invalidCandidateText,
          forceSourceOnly: hasSourceOnlyMcpSignal(sourceOnlyMcpHintText({ target, instructions: input.instructions, searches })) ||
            hasSourceOnlyMcpSignal(invalidCandidateText),
        })
      : undefined;
    if (!fallbackCandidate) throw error;
    const candidate = applyInstructionFilesystemMounts(fallbackCandidate, input);
    const validation = validateMcpAutowireCandidate(candidate);
    return {
      targetUrl: target.url.toString(),
      ...(input.instructions ? { instructions: input.instructions } : {}),
      session,
      candidate,
      sourceClassification,
      validation,
      discovery: {
        grants,
        suggestedUrls,
        fetches,
        searches,
        toolProgress,
      },
    };
  }
  candidate = applyInstructionFilesystemMounts(candidate, input);
  const validation = validateMcpAutowireCandidate(candidate);
  return {
    targetUrl: target.url.toString(),
    ...(input.instructions ? { instructions: input.instructions } : {}),
    session,
    candidate,
    sourceClassification,
    validation,
    discovery: {
      grants,
      suggestedUrls,
      fetches,
      searches,
      toolProgress,
    },
  };
}

async function runMcpAutowireDeterministicPreDiscovery(input: {
  input: McpAutowirePlanInput;
  options: McpAutowirePlannerOptions;
  target: McpAutowireTarget;
  grants: Required<McpAutowireDiscoveryGrants>;
  suggestedUrls: string[];
  fetches: McpAutowireDiscoveryFetch[];
}): Promise<string> {
  if (!input.target.github?.path || !input.target.github.branch) return "";
  if (!input.grants.urlFetch || !input.grants.githubRaw || input.grants.maxFetches <= 1) return "";
  const subpathUrls = githubTargetSubpathDiscoveryUrls(input.target.github);
  const attempts = input.suggestedUrls
    .filter((url) => subpathUrls.includes(url))
    .slice(0, Math.min(3, Math.max(0, input.grants.maxFetches - 1)));
  if (!attempts.length) return "";

  for (const url of attempts) {
    await executeAutowireDiscoveryTool(
      { name: urlReadToolName },
      { url },
      {
        target: input.target,
        grants: input.grants,
        fetchImpl: input.options.fetchImpl ?? fetch,
        fetches: input.fetches,
        signal: input.input.signal,
      },
    );
    const evidenceText = deterministicEvidenceText({
      target: input.target,
      instructions: input.input.instructions,
      discoverySummary: "",
      fetches: input.fetches,
      searches: [],
    });
    if (hasExplicitMcpPackageSignal(evidenceText) || hasFetchedSourceOnlyMcpSignal(input.fetches)) break;
  }

  const fetched = input.fetches.filter((entry) => attempts.includes(entry.url));
  if (!fetched.length) return "";
  return [
    `Deterministic target-path discovery checked ${fetched.length} URL(s) under ${input.target.github.path}.`,
    ...fetched.map((entry) => `- ${entry.status} ${entry.url}${entry.statusCode ? ` HTTP ${entry.statusCode}` : ""}${entry.reason ? ` (${entry.reason})` : ""}`),
  ].join("\n");
}

async function runMcpAutowireDiscovery(input: {
  input: McpAutowirePlanInput;
  options: McpAutowirePlannerOptions;
  target: McpAutowireTarget;
  session: McpAutowireSessionFacts;
  grants: Required<McpAutowireDiscoveryGrants>;
  suggestedUrls: string[];
  tools: Tool[];
  fetches: McpAutowireDiscoveryFetch[];
  searches: McpAutowireDiscoverySearch[];
  toolProgress: WorkflowPiToolProgress[];
}): Promise<string> {
  if (!input.tools.length) return "No MCP autowire discovery tools were available for this run.";
  const discoveryPrompt = mcpAutowireDiscoveryPrompt({
    targetUrl: input.target.url.toString(),
    instructions: input.input.instructions,
    grants: input.grants,
    suggestedUrls: input.suggestedUrls,
  });
  const callText = input.options.textCall ?? callWorkflowPiText;
  const summary = await callText({
    apiKey: input.options.apiKey,
    baseUrl: input.options.baseUrl,
    model: input.options.model ?? AMBIENT_DEFAULT_MODEL,
    sessionId: input.session.id,
    systemPrompt: mcpAutowireDiscoverySystemPrompt(),
    prompt: discoveryPrompt,
    tools: input.tools,
    initialToolChoice: initialDiscoveryToolChoice({ target: input.target, grants: input.grants, tools: input.tools }),
    maxToolRounds: input.grants.maxFetches + input.grants.maxSearches,
    executeTool: async (toolCall, args) => executeAutowireDiscoveryTool(toolCall, args, {
      target: input.target,
      grants: input.grants,
      fetchImpl: input.options.fetchImpl ?? fetch,
      fetches: input.fetches,
      searches: input.searches,
      signal: input.input.signal,
    }),
    onProgress: input.options.onProgress,
    onToolProgress: (progress) => {
      input.toolProgress.push(progress);
      input.options.onToolProgress?.(progress);
    },
    reasoning: false,
    maxTokens: Math.min(input.options.maxTokens ?? 6_000, 4_000),
    idleTimeoutMs: input.options.idleTimeoutMs ?? DEFAULT_WORKFLOW_PI_IDLE_TIMEOUT_MS,
    retryPolicy: aggressiveAmbientRetryPolicy(),
    signal: input.input.signal,
  } satisfies WorkflowPiTextCallInput);
  const bootstrapSummary = await ensureBootstrapDiscoveryEvidence(input);
  if (
    input.grants.urlFetch &&
    input.grants.maxFetches > 0 &&
    !input.fetches.some((fetch) => fetch.status === "fetched") &&
    !input.searches.some((search) => search.status === "searched")
  ) {
    throw new Error("MCP autowire discovery did not fetch an allowed evidence URL.");
  }
  if ((!input.grants.urlFetch || input.grants.maxFetches <= 0) && !input.searches.some((search) => search.status === "searched")) {
    throw new Error("MCP autowire discovery did not use an available discovery tool.");
  }
  return [summary.trim(), bootstrapSummary].filter(Boolean).join("\n\n") || "Discovery completed without a textual summary; use the deterministic discovery trace.";
}

async function ensureBootstrapDiscoveryEvidence(input: {
  input: McpAutowirePlanInput;
  options: McpAutowirePlannerOptions;
  target: McpAutowireTarget;
  grants: Required<McpAutowireDiscoveryGrants>;
  suggestedUrls: string[];
  fetches: McpAutowireDiscoveryFetch[];
  searches: McpAutowireDiscoverySearch[];
}): Promise<string> {
  const summaries: string[] = [];
  if (!hasUsefulDiscoveryFetch(input.fetches)) {
    const sourceSearchSummary = await ensureBootstrapSourceSearch(input);
    if (sourceSearchSummary) summaries.push(sourceSearchSummary);
  }
  if (!hasUsefulDiscoveryFetch(input.fetches)) {
    const searchFetchSummary = await ensureBootstrapFetchFromSearch(input);
    if (searchFetchSummary) summaries.push(searchFetchSummary);
  }
  if (!hasUsefulDiscoveryFetch(input.fetches)) {
    const directFetchSummary = await ensureBootstrapDiscoveryFetch(input);
    if (directFetchSummary) summaries.push(directFetchSummary);
  }
  return summaries.join("\n\n");
}

async function ensureBootstrapSourceSearch(input: {
  input: McpAutowirePlanInput;
  options: McpAutowirePlannerOptions;
  target: McpAutowireTarget;
  grants: Required<McpAutowireDiscoveryGrants>;
  searches: McpAutowireDiscoverySearch[];
}): Promise<string> {
  if (!input.target.github?.path || !input.grants.search || input.grants.maxSearches <= 0) return "";
  if (input.searches.some((search) => search.status === "searched")) return "";
  await executeAutowireDiscoveryTool(
    { name: sourceSearchToolName },
    { query: bootstrapGitHubSearchQuery(input.target.github), limit: 16 },
    {
      target: input.target,
      grants: input.grants,
      fetchImpl: input.options.fetchImpl ?? fetch,
      fetches: [],
      searches: input.searches,
      signal: input.input.signal,
    },
  );
  const searched = input.searches.find((search) => search.status === "searched");
  if (!searched) return "";
  return `Deterministic bootstrap source search found ${searched.resultCount ?? 0} candidate path(s)${searched.defaultBranch ? ` on ${searched.defaultBranch}` : ""}.`;
}

async function ensureBootstrapFetchFromSearch(input: {
  input: McpAutowirePlanInput;
  options: McpAutowirePlannerOptions;
  target: McpAutowireTarget;
  grants: Required<McpAutowireDiscoveryGrants>;
  fetches: McpAutowireDiscoveryFetch[];
  searches: McpAutowireDiscoverySearch[];
}): Promise<string> {
  if (!input.grants.urlFetch || input.grants.maxFetches <= 0) return "";
  const urls = bootstrapRawUrlsFromSearches(input.target, input.searches);
  if (!urls.length) return "";
  for (const url of urls) {
    if (!hasRemainingFetchBudget(input.grants, input.fetches)) break;
    await executeAutowireDiscoveryTool(
      { name: urlReadToolName },
      { url },
      {
        target: input.target,
        grants: input.grants,
        fetchImpl: input.options.fetchImpl ?? fetch,
        fetches: input.fetches,
        searches: input.searches,
        signal: input.input.signal,
      },
    );
    if (hasUsefulDiscoveryFetch(input.fetches)) {
      return `Deterministic bootstrap read fetched ${url} from source-search results.`;
    }
  }
  return "";
}

async function ensureBootstrapDiscoveryFetch(input: {
  input: McpAutowirePlanInput;
  options: McpAutowirePlannerOptions;
  target: McpAutowireTarget;
  grants: Required<McpAutowireDiscoveryGrants>;
  suggestedUrls: string[];
  fetches: McpAutowireDiscoveryFetch[];
  searches: McpAutowireDiscoverySearch[];
}): Promise<string> {
  if (!input.grants.urlFetch || input.grants.maxFetches <= 0 || hasUsefulDiscoveryFetch(input.fetches)) return "";
  const attempted = new Set(input.fetches.map((fetch) => fetch.url));
  for (const url of input.suggestedUrls) {
    if (attempted.has(url)) continue;
    await executeAutowireDiscoveryTool(
      { name: urlReadToolName },
      { url },
      {
        target: input.target,
        grants: input.grants,
        fetchImpl: input.options.fetchImpl ?? fetch,
        fetches: input.fetches,
        searches: input.searches,
        signal: input.input.signal,
      },
    );
    if (hasUsefulDiscoveryFetch(input.fetches)) {
      return `Deterministic bootstrap read fetched ${url} after the discovery worker did not produce a useful non-HTML evidence fetch.`;
    }
  }
  return "";
}

function hasUsefulDiscoveryFetch(fetches: McpAutowireDiscoveryFetch[]): boolean {
  return fetches.some((fetch) => fetch.status === "fetched" && Boolean(fetch.textPreview) && !fetch.contentType?.toLowerCase().includes("text/html"));
}

function hasRemainingFetchBudget(grants: Required<McpAutowireDiscoveryGrants>, fetches: McpAutowireDiscoveryFetch[]): boolean {
  return fetches.filter((entry) => entry.status === "fetched" || entry.status === "failed").length < grants.maxFetches;
}

function bootstrapGitHubSearchQuery(github: NonNullable<McpAutowireTarget["github"]>): string {
  const path = github.path?.replace(/^\/+|\/+$/g, "");
  return [
    path ? `${path} package.json pyproject.toml server.json README MCP` : "mcp server.json package.json pyproject.toml README",
  ].join(" ");
}

function bootstrapRawUrlsFromSearches(target: McpAutowireTarget, searches: McpAutowireDiscoverySearch[]): string[] {
  const targetPath = target.github?.path?.replace(/^\/+|\/+$/g, "").toLowerCase();
  const likelyFile = /(?:^|\/)(?:package\.json|pyproject\.toml|server\.json|\.mcp\.json|readme\.mdx?|smithery\.ya?ml)$/i;
  const results = searches
    .filter((search) => search.status === "searched")
    .flatMap((search) => search.results ?? [])
    .filter((result) => likelyFile.test(result.path))
    .sort((left, right) => {
      const leftInTarget = targetPath && left.path.toLowerCase().startsWith(`${targetPath}/`) ? 1 : 0;
      const rightInTarget = targetPath && right.path.toLowerCase().startsWith(`${targetPath}/`) ? 1 : 0;
      return rightInTarget - leftInTarget || right.score - left.score;
    })
    .map((result) => result.rawUrl);
  return uniqueStrings(results).slice(0, 4);
}

export function createMcpAutowireDiscoveryTools(input?: { target?: McpAutowireTarget; grants?: Required<McpAutowireDiscoveryGrants> }): Tool[] {
  const grants = input?.grants;
  const tools: Tool[] = [];
  if (!grants || grants.urlFetch && grants.maxFetches > 0) {
    tools.push({
      name: urlReadToolName,
      description:
        "Read one bounded URL for MCP autowire evidence. For GitHub targets, only the target repo page and raw.githubusercontent.com files from that repo are allowed. For package or metadata targets, only the target origin/path is allowed.",
      parameters: Type.Object({
        url: Type.String({
          description: "HTTPS URL to read. Must be the target GitHub repository URL/path, a raw.githubusercontent.com URL from the same owner/repo, or the target package/metadata URL path.",
        }),
      }),
    });
  }
  if (grants?.search && grants.maxSearches > 0 && input?.target?.github) {
    tools.push({
      name: sourceSearchToolName,
      description:
        "Search the target GitHub repository file tree for likely MCP metadata, manifests, README files, and local bridge files. This returns paths and raw URLs only; use ambient_mcp_url_read for file contents.",
      parameters: Type.Object({
        query: Type.String({
          description: "Search terms such as mcp server.json package manifest readme bridge transport install.",
        }),
        limit: Type.Number({
          description: "Maximum result count. Defaults to 12 and is capped at 30.",
        }),
      }),
    });
  }
  return tools;
}

function initialDiscoveryToolChoice(input: {
  target: McpAutowireTarget;
  grants: Required<McpAutowireDiscoveryGrants>;
  tools: Tool[];
}) {
  if (!input.tools.length) return undefined;
  if (input.grants.urlFetch && input.grants.maxFetches > 0) {
    return { type: "function" as const, function: { name: urlReadToolName } };
  }
  return { type: "function" as const, function: { name: sourceSearchToolName } };
}

export async function executeAutowireDiscoveryTool(
  toolCall: Pick<ToolCall, "name">,
  args: unknown,
  context: {
    target: McpAutowireTarget;
    grants: Required<McpAutowireDiscoveryGrants>;
    fetchImpl: FetchLike;
    fetches: McpAutowireDiscoveryFetch[];
    searches?: McpAutowireDiscoverySearch[];
    signal?: AbortSignal;
  },
): Promise<string> {
  if (toolCall.name === sourceSearchToolName) {
    return executeAutowireSourceSearchTool(args, {
      target: context.target,
      grants: context.grants,
      fetchImpl: context.fetchImpl,
      searches: context.searches ?? [],
      signal: context.signal,
    });
  }
  if (toolCall.name !== urlReadToolName) throw new Error(`Unknown MCP autowire discovery tool ${toolCall.name}.`);
  const url = stringField(args, "url");
  if (!url) throw new Error("url is required.");
  if (context.fetches.filter((fetch) => fetch.status === "fetched" || fetch.status === "failed").length >= context.grants.maxFetches) {
    const entry = { url, status: "blocked" as const, reason: `Fetch budget exhausted at ${context.grants.maxFetches} URL(s).` };
    context.fetches.push(entry);
    return JSON.stringify(entry);
  }
  const allowed = autowireUrlAllowed(url, context.target, context.grants);
  if (!allowed.allowed) {
    const entry = { url, status: "blocked" as const, reason: allowed.reason };
    context.fetches.push(entry);
    return JSON.stringify(entry);
  }

  try {
    const response = await context.fetchImpl(url, {
      headers: { accept: "text/plain,text/markdown,application/json,text/html;q=0.8,*/*;q=0.1" },
      signal: context.signal,
    });
    const contentType = response.headers.get("content-type") ?? undefined;
    const text = await response.text();
    const preview = text.slice(0, context.grants.maxBytesPerFetch);
    const entry: McpAutowireDiscoveryFetch = {
      url,
      status: response.ok ? "fetched" : "failed",
      statusCode: response.status,
      ...(contentType ? { contentType } : {}),
      totalChars: text.length,
      returnedChars: preview.length,
      truncated: text.length > preview.length,
      ...(response.ok ? { textPreview: preview } : {}),
      ...(response.ok ? {} : { reason: `HTTP ${response.status}` }),
    };
    context.fetches.push(entry);
    return JSON.stringify({
      ...entry,
      text: preview,
    });
  } catch (error) {
    const entry = { url, status: "failed" as const, reason: errorMessage(error) };
    context.fetches.push(entry);
    return JSON.stringify(entry);
  }
}

async function executeAutowireSourceSearchTool(
  args: unknown,
  context: {
    target: McpAutowireTarget;
    grants: Required<McpAutowireDiscoveryGrants>;
    fetchImpl: FetchLike;
    searches: McpAutowireDiscoverySearch[];
    signal?: AbortSignal;
  },
): Promise<string> {
  const query = stringField(args, "query") ?? "mcp server metadata manifest readme package bridge";
  const limit = numberField(args, "limit", 12, 1, 30);
  if (!context.grants.search) {
    const entry: McpAutowireDiscoverySearch = { query, status: "blocked", source: "github-tree", reason: "Source search discovery was not granted." };
    context.searches.push(entry);
    return JSON.stringify(entry);
  }
  if (!context.target.github) {
    const entry: McpAutowireDiscoverySearch = { query, status: "blocked", source: "github-tree", reason: "Source search is currently supported only for GitHub repositories." };
    context.searches.push(entry);
    return JSON.stringify(entry);
  }
  if (context.searches.filter((search) => search.status === "searched" || search.status === "failed").length >= context.grants.maxSearches) {
    const entry: McpAutowireDiscoverySearch = { query, status: "blocked", source: "github-tree", reason: `Search budget exhausted at ${context.grants.maxSearches} search(es).` };
    context.searches.push(entry);
    return JSON.stringify(entry);
  }

  const { owner, repo } = context.target.github;
  try {
    const metadata = await fetchJson<GitHubRepoMetadata>(
      context.fetchImpl,
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      context.signal,
    );
    const defaultBranch = safeGitHubRef(metadata.default_branch) ?? "main";
    const tree = await fetchJson<GitHubTreeResponse>(
      context.fetchImpl,
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
      context.signal,
    );
    const results = rankGitHubTreeSearchResults({
      owner,
      repo,
      branch: defaultBranch,
      query,
      tree,
      limit,
    });
    const entry: McpAutowireDiscoverySearch = {
      query,
      status: "searched",
      source: "github-tree",
      defaultBranch,
      resultCount: results.length,
      results,
      ...(tree.truncated ? { reason: "GitHub tree response was truncated; results are best-effort." } : {}),
    };
    context.searches.push(entry);
    return JSON.stringify(entry);
  } catch (error) {
    const entry: McpAutowireDiscoverySearch = { query, status: "failed", source: "github-tree", reason: errorMessage(error) };
    context.searches.push(entry);
    return JSON.stringify(entry);
  }
}

export function mcpAutowirePlanResultText(result: McpAutowirePlanResult, input: { candidateRef?: string } = {}): string {
  const candidate = result.candidate;
  const validation = result.validation;
  const sourceClassification = result.sourceClassification;
  const blockers = validation.blockers.length
    ? validation.blockers.map((issue) => `- [${issue.code}] ${issue.path}: ${issue.message}`).join("\n")
    : "- none";
  const warnings = validation.warnings.length
    ? validation.warnings.map((issue) => `- [${issue.code}] ${issue.path}: ${issue.message}`).join("\n")
    : "- none";
  const evidence = candidate?.evidence.length
    ? candidate.evidence.map((entry) => `- ${entry.id}: ${entry.summary} (${entry.locator})`).join("\n")
    : "- none";
  const fetches = result.discovery.fetches.length
    ? result.discovery.fetches.map((entry) => {
        const size = entry.returnedChars === undefined ? "" : ` ${entry.returnedChars}/${entry.totalChars ?? entry.returnedChars} chars${entry.truncated ? " truncated" : ""}`;
        const code = entry.statusCode === undefined ? "" : ` HTTP ${entry.statusCode}`;
        return `- ${entry.status}: ${entry.url}${code}${size}${entry.reason ? ` (${entry.reason})` : ""}`;
      }).join("\n")
    : "- none";
  const searches = result.discovery.searches.length
    ? result.discovery.searches.map((entry) => {
        const count = entry.resultCount === undefined ? "" : ` ${entry.resultCount} result${entry.resultCount === 1 ? "" : "s"}`;
        return `- ${entry.status}: ${entry.query}${count}${entry.defaultBranch ? ` branch=${entry.defaultBranch}` : ""}${entry.reason ? ` (${entry.reason})` : ""}`;
      }).join("\n")
    : "- none";
  const sourceBuildHandoff = customSourceBuildPlanHandoffText(result, input);
  return [
    `MCP autowire plan for ${result.targetUrl}.`,
    `Autowire session: ${result.session.id} (${result.session.purpose})`,
    sourceClassification ? `Source classification: ${sourceClassification.kind} (${sourceClassification.confidence} confidence)` : undefined,
    sourceClassification ? `Source classification summary: ${sourceClassification.summary}` : undefined,
    sourceClassification?.setupRecipe ? `Setup recipe: ${sourceClassification.setupRecipe}` : undefined,
    candidate ? `Candidate: ${candidate.displayName}` : "Candidate: unavailable",
    candidate ? `Recommended lane: ${candidate.recommendedLane}` : undefined,
    candidate ? `Runtime: ${candidate.runtime.provider}/${candidate.runtime.sourceKind}/${candidate.runtime.transport}` : undefined,
    `Validation status: ${validation.status}`,
    `Validation outcome: ${validation.outcome}`,
    `Ready for user review: ${validation.readyForUserReview}`,
    `Ready for ToolHive run: ${validation.readyForToolHiveRun}`,
    validation.candidateHash ? `Candidate hash: ${validation.candidateHash}` : undefined,
    input.candidateRef ? `Candidate ref: ${input.candidateRef}` : undefined,
    "",
    "Blockers:",
    blockers,
    "",
    "Warnings:",
    warnings,
    "",
    "Evidence:",
    evidence,
    "",
    "Discovery fetches:",
    fetches,
    "",
    "Discovery searches:",
    searches,
    "",
    candidate ? input.candidateRef ? "Candidate ref for ambient_mcp_autowire_review:" : "Candidate JSON for ambient_mcp_autowire_review:" : "Candidate handoff:",
    candidate ? input.candidateRef ?? JSON.stringify(candidate, null, 2) : sourceClassification
      ? "No MCP candidate was generated because the source appears to be a normal application setup target. Do not call ambient_mcp_autowire_review for this result."
      : "{}",
    sourceBuildHandoff ? "" : undefined,
    sourceBuildHandoff ? "Source-only ToolHive handoff:" : undefined,
    sourceBuildHandoff,
    "",
    nextActionText(result),
  ].filter((line) => line !== undefined).join("\n");
}

function customSourceBuildPlanHandoffText(
  result: McpAutowirePlanResult,
  input: { candidateRef?: string } = {},
): string | undefined {
  const candidate = result.candidate;
  if (!candidate || !isCustomSourceBuildPlanCandidate(candidate)) return undefined;
  const reviewInput = input.candidateRef
    ? {
        candidateRef: input.candidateRef,
        ...(result.validation.candidateHash ? { expectedCandidateHash: result.validation.candidateHash } : {}),
      }
    : {
        candidate,
        ...(result.validation.candidateHash ? { expectedCandidateHash: result.validation.candidateHash } : {}),
      };
  return [
    "Status: blocked for direct import; ready for the reviewed ToolHive source-build path.",
    "Next tool: ambient_mcp_autowire_review",
    "Call ambient_mcp_autowire_review with:",
    JSON.stringify(reviewInput, null, 2),
    "Expected review handoff: ambient_mcp_autowire_source_build_describe, followed by ambient_mcp_autowire_source_build_create, then ambient_mcp_standard_import_describe after a custom-image candidate has a pinned commit and sha256 OCI digest.",
    "Forbidden alternatives:",
    "- Do not clone/build/register this MCP as an unmanaged local bridge for an install request.",
    "- Do not run README install scripts, raw cargo builds, claude mcp add, or raw ToolHive state edits outside the Ambient source-build lane.",
    "- Do not proceed to Standard MCP import until review/build emits a sourceKind=custom-image candidate with a pinned Git commit and sha256 image digest.",
  ].join("\n");
}

function isCustomSourceBuildPlanCandidate(candidate: McpAutowireCandidate): boolean {
  return candidate.recommendedLane === "standard-mcp" &&
    candidate.source.kind === "github" &&
    Boolean(candidate.source.url) &&
    candidate.runtime.provider === "toolhive" &&
    (candidate.runtime.sourceKind === "unknown" || !candidate.runtime.package);
}

function mcpAutowirePlannerSystemPrompt(): string {
  return [
    "You are Ambient Desktop's MCP autowire planner.",
    "Return exactly one JSON object matching the provided schema. Do not install anything and do not claim runtime validation happened unless evidence says it did.",
    "Use only the discovery summary and trace as evidence. Do not invent source files, package metadata, remote endpoints, secrets, or validation results.",
    "Choose standard-mcp only for installable MCP server metadata that Ambient can later review and run through ToolHive. Choose remote-mcp for explicit hosted MCP endpoints. Choose guided-local-bridge for local applications like Ghidra that need a user-run app/extension bridge. Choose exploratory when evidence is insufficient.",
    "If the discovery summary says the source is a normal application and not an MCP server or wrapper candidate, do not force it into an MCP lane. The deterministic planner may hand the task back to Pi for ordinary app setup instead of requesting candidate JSON.",
    "When several viable install options are documented, prefer Ambient-supported lanes in this order: reviewed ToolHive/default registry, hosted Remote MCP through ToolHive proxy, package-backed server.json/npm/PyPI/OCI Standard MCP, guided-local bridge for user-run local apps, CLI wrapper for non-MCP CLIs, then exploratory.",
    "For standard-mcp candidates, runtime.provider must be toolhive. Package-backed Python and Node MCP servers should use runtime.sourceKind pypi/npm/server-json with package registryType pypi/npm, not ambient-cli.",
    "Use runtime.sourceKind custom-image only for a source-built artifact already reviewed by Ambient with source.resolvedCommit, an OCI image identifier, image digest, and pinned update policy; do not invent custom images during discovery.",
    "MCPB metadata is useful evidence for future packaging, version pinning, and user-facing alternatives, but MCPB execution is currently deferred until ToolHive run support is validated. Do not choose runtime.sourceKind mcpb or package.registryType mcpb when the same source exposes a supported remote, npm, PyPI, OCI, registry, or server.json path.",
    "For guided-local-bridge candidates, runtime.provider must be guided-local and runtime.sourceKind must be local-bridge. If setup includes a user-run python/node bridge command, put it in runtime.localBridge.commandHint; do not switch the provider to ambient-cli.",
    "For any non-registry standard-mcp candidate, runtime.package is required. Fill registryType, identifier, version/digest/sha256 when evidence supports it, runtimeHint, entrypoint when the executable differs from the install package, and fixed packageArguments such as a server subcommand or --mcp switch.",
    "Distinguish install package from launch entrypoint. If package X exposes MCP executable Y, set runtime.package.identifier to X and runtime.package.entrypoint to package-bin Y. If ToolHive cannot encode that entrypoint, Ambient validation will defer rather than silently running the wrong default CLI.",
    "If permissions.network.mode is broad, include a concrete justification. If the exact host list is task-dependent, say so in that justification and add a non-blocking network open question.",
    "All install-critical claims must cite declared evidence ids. Every evidenceRefs value must exactly match an id in candidate.evidence; do not cite discovery trace labels like fetch1 unless you also create matching evidence entries.",
    "Unknown required setup must become an open question, and blocking unknowns must set blocksInstall true.",
  ].join("\n");
}

function mcpAutowireDiscoverySystemPrompt(): string {
  return [
    "You are Ambient Desktop's bounded Autowire source discovery worker.",
    "Use only the provided discovery tools. Do not install anything, run source code, call package managers, call MCP servers, or request secrets.",
    "When the URL read tool is available, call ambient_mcp_url_read on at least one likely evidence URL. Prefer first-party repo files such as README, server.json, package.json, pyproject.toml, smithery.yaml, MCPB metadata, and local bridge files.",
    "When the source search tool is available, use it if suggested URLs are missing, ambiguous, or insufficient.",
    "Return a concise evidence summary with URLs, exact facts found, likely install lane signals, normal application/containerized application signals, blockers, and uncertainties. Do not return JSON for the final candidate.",
  ].join("\n");
}

function mcpAutowireDiscoveryPrompt(input: {
  targetUrl: string;
  instructions?: string;
  grants: Required<McpAutowireDiscoveryGrants>;
  suggestedUrls: string[];
}): string {
  return [
    "Gather evidence for Ambient Autowire source routing.",
    "",
    `Target URL: ${input.targetUrl}`,
    input.instructions ? `User/schema instructions: ${input.instructions}` : "User/schema instructions: classify the best supported Ambient install lane.",
    "",
    "Discovery grants:",
    `- URL fetch: ${input.grants.urlFetch}`,
    `- GitHub raw fetch: ${input.grants.githubRaw}`,
    `- Target repo/source search: ${input.grants.search}`,
    `- Max fetches: ${input.grants.maxFetches}`,
    `- Max searches: ${input.grants.maxSearches}`,
    `- Max chars per fetch: ${input.grants.maxBytesPerFetch}`,
    "",
    input.suggestedUrls.length ? `Suggested evidence URLs:\n${input.suggestedUrls.map((url) => `- ${url}`).join("\n")}` : "Suggested evidence URLs: none.",
    "",
    "Discovery objective:",
    "- Read at least one allowed evidence URL if URL fetch is granted.",
    "- Use source search when the obvious suggested URLs do not expose enough evidence.",
    "- Identify and distinguish remote MCP endpoints, ToolHive registry/default matches, server.json/package metadata, npm/PyPI/OCI sources, MCPB metadata, CLI-wrapper indicators, local app bridge requirements, secrets, network/filesystem permissions, expected tools, and blockers.",
    "- If the source is just a normal application repository, say that explicitly and summarize its setup shape: app framework, package manager, container files, local services, required environment files, and run commands if visible.",
    "- Treat MCPB as a documented deferred alternative unless ToolHive run support is validated by Ambient in a later phase.",
    "- Finish with a compact evidence summary, not a final JSON candidate.",
  ].join("\n");
}

function mcpAutowirePlannerPrompt(input: {
  targetUrl: string;
  instructions?: string;
  grants: Required<McpAutowireDiscoveryGrants>;
  suggestedUrls: string[];
  discoverySummary: string;
  discoveryTrace: string;
}): string {
  return [
    "Create an Ambient MCP autowire candidate descriptor.",
    "",
    `Target URL: ${input.targetUrl}`,
    input.instructions ? `User/schema instructions: ${input.instructions}` : "User/schema instructions: use the Ambient MCP autowire schema and classify the best install lane.",
    "",
    "Discovery grants:",
    `- URL fetch: ${input.grants.urlFetch}`,
    `- GitHub raw fetch: ${input.grants.githubRaw}`,
    `- Target repo/source search: ${input.grants.search}`,
    `- Max fetches: ${input.grants.maxFetches}`,
    `- Max searches: ${input.grants.maxSearches}`,
    `- Max chars per fetch: ${input.grants.maxBytesPerFetch}`,
    "",
    "",
    "Discovery summary:",
    input.discoverySummary,
    "",
    "Deterministic discovery trace:",
    input.discoveryTrace,
    "",
    "If the target looks like:",
    "- Context7: prefer remote-mcp only if an explicit remote MCP endpoint is found; otherwise standard-mcp if package metadata is clearer.",
    "- Scrapling: prefer standard-mcp when server metadata or package instructions expose an MCP server; broad web egress should be a warning/review item.",
    "- GhidraMCP: prefer guided-local-bridge because it controls a local Ghidra app/extension and should not be silently installed as a container. When the README evidence supports the default bridge shape, model the user-run MCP bridge as SSE on 127.0.0.1:8081 and the Ghidra extension HTTP server as http://127.0.0.1:8080/.",
    "",
    "Return JSON only.",
  ].join("\n");
}

function discoveryTraceForPrompt(input: {
  fetches: McpAutowireDiscoveryFetch[];
  searches: McpAutowireDiscoverySearch[];
}): string {
  const fetches = input.fetches.length
    ? input.fetches.map((fetch, index) => {
        const size = fetch.returnedChars === undefined ? "" : ` ${fetch.returnedChars}/${fetch.totalChars ?? fetch.returnedChars} chars${fetch.truncated ? " truncated" : ""}`;
        const code = fetch.statusCode === undefined ? "" : ` HTTP ${fetch.statusCode}`;
        return `fetch${index + 1}: ${fetch.status} ${fetch.url}${code}${size}${fetch.reason ? ` reason=${fetch.reason}` : ""}`;
      }).join("\n")
    : "none";
  const searches = input.searches.length
    ? input.searches.map((search, index) => {
        const results = search.results?.slice(0, 8).map((result) => `${result.path} -> ${result.rawUrl} (${result.reason})`).join("; ") ?? "";
        return `search${index + 1}: ${search.status} ${search.query}${search.defaultBranch ? ` branch=${search.defaultBranch}` : ""}${results ? ` results: ${results}` : ""}${search.reason ? ` reason=${search.reason}` : ""}`;
      }).join("\n")
    : "none";
  return `Fetches:\n${fetches}\n\nSearches:\n${searches}`;
}

function nextActionText(result: McpAutowirePlanResult): string {
  const candidate = result.candidate;
  if (!candidate && result.sourceClassification) return result.sourceClassification.nextAction;
  if (!candidate) return "Next action: fix schema/validation errors and rerun autowire planning.";
  if (result.validation.readyForToolHiveRun) {
    if (candidate.source.registryId) return `Next action: call ambient_mcp_server_describe for registry server ${candidate.source.registryId}.`;
    return "Next action: show the candidate to the user and convert it into a reviewed ToolHive install/import plan before running anything.";
  }
  if (candidate.recommendedLane === "remote-mcp" && result.validation.readyForUserReview) {
    return "Next action: call ambient_mcp_autowire_review, then ambient_mcp_remote_proxy_describe if the candidate maps to the ToolHive proxy path.";
  }
  if (candidate.recommendedLane === "standard-mcp" && result.validation.readyForUserReview) {
    return "Next action: call ambient_mcp_autowire_review, then ambient_mcp_standard_import_describe if review returns a standard-mcp-import handoff.";
  }
  if (isCustomSourceBuildPlanCandidate(candidate)) {
    return "Next action: direct import is blocked; call ambient_mcp_autowire_review with the candidateRef and expectedCandidateHash above so review can hand off to ambient_mcp_autowire_source_build_describe.";
  }
  if (candidate.recommendedLane === "guided-local-bridge") {
    return "Next action: call ambient_mcp_autowire_review, then ambient_mcp_guided_bridge_describe for setup steps and exact loopback preflight targets.";
  }
  return "Next action: resolve blockers or gather more evidence before any install.";
}

function classifyMcpAutowireSource(input: {
  discoverySummary: string;
  fetches: McpAutowireDiscoveryFetch[];
  searches: McpAutowireDiscoverySearch[];
}): McpAutowireSourceClassification {
  const fetchText = input.fetches.map((entry) => [
    entry.status,
    entry.url,
    entry.reason ?? "",
    classificationFetchPreview(entry),
  ].join(" ")).join("\n");
  const searchText = input.searches.map((entry) => [
    entry.query,
    entry.reason ?? "",
    ...(entry.results ?? []).map((result) => `${result.path} ${result.reason}`),
  ].join(" ")).join("\n");
  const text = `${input.discoverySummary}\n${fetchText}\n${searchText}`.toLowerCase();
  const signals: string[] = [];
  const addSignal = (condition: boolean, signal: string) => {
    if (condition) signals.push(signal);
  };

  const notMcpSourceSignal = /not an? mcp|not an? mcp server|not a model context protocol server|without mcp support|does not expose.*mcp|no mcp server scripts/.test(text);
  const missingMcpMetadataSignal = /no mcp entry|no mcp configuration|no mcp metadata|no mcp server metadata|no mcp server configuration|no mcp server entry|no @modelcontextprotocol|server\.json.*absent|\.mcp\.json.*absent/.test(text);
  const noMcpSignal = notMcpSourceSignal || missingMcpMetadataSignal;
  const packageMcpSignal = /npx:\/\/|uvx:\/\/|\bnpx\s+(?:-[\w-]+\s+)*@[a-z0-9_.-]+\/mcp\b|@[a-z0-9_.-]+\/mcp\b/.test(text);
  const explicitMetadataSignal = /server\.json.*(?:mcp|declares|metadata)|@modelcontextprotocol|remote mcp endpoint|streamable-http|smithery|toolhive registry/.test(text);
  const fetchedSourceMcpSignal = hasFetchedSourceOnlyMcpSignal(input.fetches);
  const sourceMcpSignal = fetchedSourceMcpSignal || /\bmcp server\b|\bmcp servers\b|fastmcp|from fastmcp import|fastmcp\s*\(|mcp\s*=\s*fastmcp/.test(text);
  const genericMcpSignal = /mcpservers?|mcp clients?|mcp server scripts?/.test(text);
  const mcpMetadataSignal = packageMcpSignal || fetchedSourceMcpSignal || (!notMcpSourceSignal && sourceMcpSignal) || (!noMcpSignal && (explicitMetadataSignal || genericMcpSignal));
  const normalAppSignal = /next\.js|vite|react|svelte|vue|electron|tauri|desktop app|web application|full-stack|monorepo|video editor|package\.json|bun |bun@|pnpm |npm |yarn |cargo |rust\/|apps\/web|apps\/desktop/.test(text);
  const containerSignal = /docker-compose|compose\.ya?ml|dockerfile|containerfile|docker compose|containerized|postgres|redis/.test(text);
  const cliSignal = /command line|cli\b|bin field|console_scripts|entry_points|click\b|typer\b|commander\b|yargs\b/.test(text);

  addSignal(noMcpSignal, "discovery reported missing MCP metadata or MCP entry points");
  addSignal(mcpMetadataSignal, "discovery found MCP metadata or MCP runtime indicators");
  addSignal(normalAppSignal, "discovery found normal application framework or package-manager indicators");
  addSignal(containerSignal, "discovery found Docker/Podman/container or local service indicators");
  addSignal(cliSignal, "discovery found CLI indicators");

  if (mcpMetadataSignal) {
    return {
      kind: "mcp_candidate",
      confidence: notMcpSourceSignal ? "medium" : "high",
      summary: "The source has MCP metadata, package, endpoint, or documented MCP runtime indicators; continue generating an MCP autowire candidate.",
      signals,
      setupRecipe: "mcp-autowire-candidate",
      nextAction: "Next action: continue MCP candidate generation and review.",
    };
  }

  if (noMcpSignal && normalAppSignal) {
    if (containerSignal) {
      return {
        kind: "containerized_app",
        confidence: "high",
        summary: "The source appears to be a normal application with container or local service setup needs, not an MCP/plugin server.",
        signals,
        setupRecipe: "containerized-app-setup",
        nextAction: "Next action: stop MCP autowire review and continue ordinary app setup. Call ambient_setup_runtime_preflight before installing dependencies, then call ambient_setup_recipe_describe with recipe containerized_app to inspect Docker/Podman/compose files, host runtime readiness, compose command availability, port conflicts, and existing project containers before using normal file, shell, and browser tools to install and run the app. After attempting validation, call ambient_setup_final_report so the user-facing report distinguishes running state, changed files, placeholders, and unvalidated features.",
      };
    }
    return {
      kind: "normal_app",
      confidence: "high",
      summary: "The source appears to be a normal application repository, not an MCP/plugin server.",
      signals,
      setupRecipe: "normal-app-setup",
      nextAction: "Next action: stop MCP autowire review and continue ordinary app setup with normal file, shell, and browser tools. Call ambient_setup_runtime_preflight before installing dependencies, use repository setup docs, validate the running app directly, then call ambient_setup_final_report before the user-facing final answer.",
    };
  }

  if (cliSignal && !normalAppSignal) {
    return {
      kind: "cli_candidate",
      confidence: "medium",
      summary: "The source appears to expose a CLI; continue evaluating whether it should be wrapped as an Ambient CLI capability.",
      signals,
      setupRecipe: "cli-wrapper-candidate",
      nextAction: "Next action: continue CLI wrapper evaluation and gather package/command evidence.",
    };
  }

  return {
    kind: "unknown_exploratory",
    confidence: "low",
    summary: "Discovery did not produce enough signal to distinguish MCP, CLI, or normal app setup.",
    signals,
    setupRecipe: "exploratory-evidence",
    nextAction: "Next action: gather more evidence before choosing MCP review, CLI wrapping, or ordinary app setup.",
  };
}

function sourceHandoffValidationReport(classification: McpAutowireSourceClassification): McpAutowireValidationReport {
  return {
    status: "blocked",
    outcome: "deferred-unsupported-lane",
    readyForToolHiveRun: false,
    readyForUserReview: false,
    blockers: [
      {
        code: "source.normal_app_handoff",
        path: "$.sourceClassification.kind",
        message: `Autowire classified this source as ${classification.kind}, so no MCP install candidate was generated.`,
        severity: "blocker",
      },
    ],
    warnings: [],
  };
}

type McpAutowireFilesystemMount = McpAutowireCandidate["permissions"]["filesystem"]["extraMounts"][number];

function applyInstructionFilesystemMounts<T>(candidate: T, input: Pick<McpAutowirePlanInput, "instructions">): T {
  const explicitMounts = explicitFilesystemMountsFromInstructions(input.instructions);
  if (!explicitMounts.length || !isMcpAutowireCandidateLike(candidate)) return candidate;
  if (candidate.runtime.provider !== "toolhive" || candidate.recommendedLane !== "standard-mcp") return candidate;

  const existingMounts = candidate.permissions.filesystem.extraMounts;
  const mergedMounts = mergeFilesystemMounts(existingMounts, explicitMounts);
  if (mergedMounts.length === existingMounts.length) return candidate;

  const evidenceId = uniqueEvidenceId(candidate.evidence.map((entry) => entry.id), "user-filesystem-mount");
  return {
    ...candidate,
    permissions: {
      ...candidate.permissions,
      filesystem: {
        ...candidate.permissions.filesystem,
        extraMounts: mergedMounts,
      },
      evidenceRefs: uniqueStrings([...candidate.permissions.evidenceRefs, evidenceId]),
    },
    evidence: [
      ...candidate.evidence,
      {
        id: evidenceId,
        type: "other" as const,
        locator: "user-instructions",
        summary: "User explicitly requested scoped filesystem access for this MCP install.",
      },
    ],
  } as T;
}

function explicitFilesystemMountsFromInstructions(instructions?: string): McpAutowireFilesystemMount[] {
  if (!instructions) return [];
  const mounts: McpAutowireFilesystemMount[] = [];
  const patterns: Array<{ regex: RegExp; mode: "read-only" | "read-write" }> = [
    {
      regex: /\b(?:with\s+)?(?:read[-\s]?only|readonly|ro)\s+(?:filesystem\s+|file\s+|directory\s+|folder\s+)?access\s+to\s+(?:"([^"]+)"|'([^']+)'|(\/[^\s,;:)]+))/gi,
      mode: "read-only",
    },
    {
      regex: /\b(?:with\s+)?(?:read[-\s]?write|read\/write|rw|write)\s+(?:filesystem\s+|file\s+|directory\s+|folder\s+)?access\s+to\s+(?:"([^"]+)"|'([^']+)'|(\/[^\s,;:)]+))/gi,
      mode: "read-write",
    },
    {
      regex: /\bmount\s+(?:"([^"]+)"|'([^']+)'|(\/[^\s,;:)]+))\s+(?:as\s+)?(?:read[-\s]?only|readonly|ro)\b/gi,
      mode: "read-only",
    },
    {
      regex: /\bmount\s+(?:"([^"]+)"|'([^']+)'|(\/[^\s,;:)]+))\s+(?:as\s+)?(?:read[-\s]?write|read\/write|rw|writable)\b/gi,
      mode: "read-write",
    },
  ];

  for (const pattern of patterns) {
    for (const match of instructions.matchAll(pattern.regex)) {
      const hostPath = normalizeExplicitHostMountPath(match[1] ?? match[2] ?? match[3] ?? "");
      if (!hostPath) continue;
      mounts.push({
        path: hostPath,
        containerPath: `/projects/${safeContainerPathLeaf(hostPath)}`,
        mode: pattern.mode,
        purpose: `User explicitly requested ${pattern.mode} filesystem access for this MCP install.`,
      });
    }
  }

  return mergeFilesystemMounts([], mounts).slice(0, 8);
}

function normalizeExplicitHostMountPath(value: string): string | undefined {
  const path = value.trim().replace(/\\/g, "/").replace(/[.!?]+$/g, "").replace(/\/+$/, "") || "/";
  if (!path.startsWith("/")) return undefined;
  if (path.includes("\0") || path.includes("\n") || path.includes("\r") || path.includes(":")) return undefined;
  if (path.split("/").includes("..")) return undefined;
  return path;
}

function safeContainerPathLeaf(hostPath: string): string {
  const leaf = hostPath.split("/").filter(Boolean).pop() ?? "mount";
  return leaf.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "mount";
}

function mergeFilesystemMounts(
  existing: McpAutowireFilesystemMount[],
  additions: McpAutowireFilesystemMount[],
): McpAutowireFilesystemMount[] {
  const merged = [...existing];
  for (const mount of additions) {
    const existingIndex = merged.findIndex((item) => normalizeMountPathKey(item.path) === normalizeMountPathKey(mount.path));
    if (existingIndex >= 0) {
      const existingMount = merged[existingIndex];
      if (existingMount && existingMount.mode !== "read-write" && mount.mode === "read-write") {
        merged[existingIndex] = { ...existingMount, mode: "read-write", purpose: mount.purpose };
      }
      continue;
    }
    merged.push(mount);
  }
  return merged;
}

function normalizeMountPathKey(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/+$/, "") || "/";
}

function isMcpAutowireCandidateLike(value: unknown): value is McpAutowireCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<McpAutowireCandidate>;
  return candidate.schemaVersion === "ambient-mcp-autowire-v1" &&
    Boolean(candidate.runtime && typeof candidate.runtime === "object") &&
    Boolean(candidate.permissions?.filesystem && Array.isArray(candidate.permissions.filesystem.extraMounts)) &&
    Boolean(candidate.evidence && Array.isArray(candidate.evidence));
}

function uniqueEvidenceId(existingIds: string[], baseId: string): string {
  const existing = new Set(existingIds);
  if (!existing.has(baseId)) return baseId;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${baseId}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${baseId}-${createHash("sha256").update(existingIds.join("\0")).digest("hex").slice(0, 8)}`;
}

function deterministicStandardMcpPackageCandidate(input: {
  target: McpAutowireTarget;
  instructions?: string;
  discoverySummary: string;
  fetches: McpAutowireDiscoveryFetch[];
  searches: McpAutowireDiscoverySearch[];
  networkFacts?: McpAutowireNetworkFacts;
}): McpAutowireCandidate | undefined {
  const evidenceText = deterministicEvidenceText(input);
  if (!hasExplicitMcpPackageSignal(evidenceText)) return undefined;
  const packageIdentity = deterministicPackageIdentity(input, evidenceText);
  const npmPackage = packageIdentity?.registryType === "npm" ? packageIdentity.identifier : undefined;
  const pypiPackage = packageIdentity?.registryType === "pypi" ? packageIdentity.identifier : undefined;
  const packageName = npmPackage ?? pypiPackage;
  if (!packageName) return undefined;
  const registryType = packageIdentity?.registryType ?? (npmPackage ? "npm" as const : "pypi" as const);
  const packageEvidenceLocator = packageIdentity?.locator ?? bestDeterministicEvidenceLocator(input);
  const packageId = safeCandidateId(`${packageName}-standard-mcp`);
  const secretFact = extractPrimarySecretFact(evidenceText);
  const envName = secretFact?.name;
  const fallbackNetworkFacts = deterministicMcpAutowireNetworkFacts(input);
  const networkFacts = input.networkFacts?.runtimeHosts.length || input.networkFacts?.needsBroadNetwork
    ? input.networkFacts
    : fallbackNetworkFacts;
  const localOnlyRuntime = packageEvidenceIndicatesLocalOnlyRuntime(evidenceText, packageName);
  const effectiveRuntimeHosts = localOnlyRuntime ? [] : networkFacts.runtimeHosts;
  const hosts = effectiveRuntimeHosts.map((fact) => fact.host);
  const ports = uniqueSortedNumbers(effectiveRuntimeHosts.flatMap((fact) => fact.ports.length ? fact.ports : [443]));
  const evidenceId = "discovery-summary";
  const networkEvidenceId = hosts.length ? "network-requirements" : evidenceId;
  const secretEvidenceId = envName ? "secret-requirement" : evidenceId;
  const updatePolicy = deterministicBrowserRuntimeUpdatePolicy({
    packageName,
    fetches: input.fetches,
    evidenceId,
  });
  const runtimeImage = deterministicToolHiveRuntimeImage({
    registryType,
    fetches: input.fetches,
    browserRuntime: updatePolicy?.mode === "managed-browser-security",
  });
  const packageArguments = deterministicMcpPackageArguments({
    registryType,
    packageName,
    evidenceText,
  });
  const entrypoint = packageArguments.some((arg) => arg.type === "switch" && arg.name === "--mcp")
    ? undefined
    : deterministicMcpPackageEntrypoint({
      registryType,
      packageName,
      evidenceText,
      fetches: input.fetches,
    });
  const runtimeHint = runtimeHintForDeterministicPackage({
    registryType,
    packageName,
    packageArguments,
    entrypoint,
  });
  const evidence: McpAutowireCandidate["evidence"] = [
    {
      id: evidenceId,
      type: "readme",
      locator: packageEvidenceLocator,
      summary: `Discovery found a documented Model Context Protocol server package ${packageName}.`,
    },
    ...(envName
      ? [{
          id: secretEvidenceId,
          type: "readme" as const,
          locator: packageEvidenceLocator,
          summary: `Discovery found ${secretFact.requiredness} environment secret ${envName} for the MCP server.`,
        }]
      : []),
    ...(hosts.length
      ? [{
          id: networkEvidenceId,
          type: "other" as const,
          locator: bestNetworkEvidenceLocator(networkFacts) ?? packageEvidenceLocator,
          summary: `Discovery identified runtime outbound host${hosts.length === 1 ? "" : "s"} ${hosts.join(", ")} for ${packageName}.`,
        }]
      : []),
  ];
  return {
    schemaVersion: "ambient-mcp-autowire-v1",
    id: packageId,
    displayName: displayNameForPackage(packageName),
    source: {
      kind: input.target.github ? "github" : "other",
      url: input.target.url.toString(),
      packageName,
      evidenceRefs: [evidenceId],
    },
    recommendedLane: "standard-mcp",
    runtime: {
      provider: "toolhive",
      sourceKind: registryType === "npm" ? "npm" : "pypi",
      transport: "stdio",
      package: {
        registryType,
        identifier: packageName,
        runtimeHint,
        ...(runtimeImage ? { runtimeImage } : {}),
        ...(entrypoint ? { entrypoint } : {}),
        packageArguments,
      },
      ...(updatePolicy ? { updatePolicy } : {}),
      evidenceRefs: [evidenceId],
    },
    secrets: envName
      ? [{
          name: envName,
          required: secretFact.requiredness === "required",
          secret: true,
          purpose: secretFact.requiredness === "optional"
            ? `Optional API key or token supported by ${displayNameForPackage(packageName)}.`
            : `API key or token required by ${displayNameForPackage(packageName)}.`,
          evidenceRefs: [secretEvidenceId],
        }]
      : [],
    permissions: {
      network: {
        mode: hosts.length ? "allowlist" : localOnlyRuntime ? "disabled" : "broad",
        allowHosts: hosts,
        allowPorts: hosts.length ? ports : [],
        justification: hosts.length
          ? networkJustification(networkFacts, packageName)
          : localOnlyRuntime
            ? "Discovery indicates this MCP works against local SQLite/database files and does not require runtime network access."
          : networkFacts.needsBroadNetwork
            ? "The MCP server needs runtime network access, but bounded discovery did not expose a fixed public host."
            : "The MCP server may require API/network access, but discovery did not expose a fixed host.",
      },
      filesystem: {
        workspaceRead: false,
        workspaceWrite: false,
        extraMounts: [],
      },
      localApps: [],
      evidenceRefs: hosts.length ? [evidenceId, networkEvidenceId] : [evidenceId],
    },
    validationPlan: {
      preflights: ["toolhive-runtime", "container-runtime", ...(envName && secretFact.requiredness === "required" ? [`secret:${envName}`] : [])],
      expectedTools: [],
      evidenceRefs: [evidenceId],
    },
    evidence,
    openQuestions: hosts.length || localOnlyRuntime
      ? []
      : (networkFacts.openQuestions.length
        ? networkFacts.openQuestions.map((question) => ({
            question,
            impact: "network" as const,
            blocksInstall: false,
            evidenceRefs: [evidenceId],
          }))
        : [{
          question: "What exact public API hosts should this MCP server be allowed to contact?",
          impact: "network",
          blocksInstall: false,
          evidenceRefs: [evidenceId],
        }]),
    riskSummary: {
      level: hosts.length || localOnlyRuntime ? "medium" : "high",
      reasons: [
        hosts.length
          ? "Package-backed MCP server uses an external API with explicit host allowlist."
          : localOnlyRuntime
            ? "Package-backed MCP server is scoped to local SQLite/database files without runtime network egress."
          : "Package-backed MCP server requires external API access but host evidence is incomplete.",
      ],
      evidenceRefs: [evidenceId],
    },
  };
}

function packageEvidenceIndicatesLocalOnlyRuntime(evidenceText: string, packageName: string): boolean {
  const text = `${packageName}\n${evidenceText}`.toLowerCase();
  if (!/\bsqlite\b|\.sqlite3?\b|\.db\b/.test(text)) return false;
  const localSignals = [
    /\breads?\s+local\s+(?:`?\.db`?\s+)?files?\b/,
    /\blocal\s+(?:sqlite\s+)?database\b/,
    /\blocal-first\b/,
    /\bno auth needed\b/,
    /\bread-only by default\b/,
    /\bopens? the database read-only\b/,
  ];
  if (!localSignals.some((pattern) => pattern.test(text))) return false;
  const remoteRequirementSignals = [
    /\brequires?\s+(?:an?\s+)?api\s+key\b/,
    /\bapi[_ -]?key\b/,
    /\btoken\b/,
    /\bbase\s*url\b/,
    /\bremote\s+api\b/,
    /\bcloud\s+(?:api|service|database)\b/,
  ];
  return !remoteRequirementSignals.some((pattern) => pattern.test(text));
}

function deterministicSourceOnlyMcpCandidate(input: {
  target: McpAutowireTarget;
  instructions?: string;
  discoverySummary: string;
  fetches: McpAutowireDiscoveryFetch[];
  searches: McpAutowireDiscoverySearch[];
  networkFacts?: McpAutowireNetworkFacts;
  invalidCandidateText?: string;
  forceSourceOnly?: boolean;
}): McpAutowireCandidate | undefined {
  if (!input.target.github) return undefined;
  const evidenceText = [
    deterministicEvidenceText(input),
    input.invalidCandidateText ?? "",
  ].join("\n");
  if (!input.forceSourceOnly && !hasFetchedSourceOnlyMcpSignal(input.fetches) && !hasSourceOnlyMcpSignal(sourceOnlyMcpHintText(input))) return undefined;

  const evidence = sourceOnlyMcpEvidence(input);
  const evidenceRefs = evidence.map((entry) => entry.id);
  const runtimeText = sourceOnlyRuntimeEvidenceText(input.fetches);
  const sourceNetworkFacts = input.networkFacts?.runtimeHosts.length ? input.networkFacts : deterministicMcpAutowireNetworkFacts({
    target: input.target,
    instructions: input.instructions,
    discoverySummary: runtimeText,
    fetches: [],
    searches: input.searches,
  });
  const runtimeHosts = sourceNetworkFacts.runtimeHosts.map((fact) => fact.host);
  const runtimePorts = uniqueSortedNumbers(sourceNetworkFacts.runtimeHosts.flatMap((fact) => fact.ports.length ? fact.ports : [443]));
  const runtimeNetworkSignal = /\b(?:requests|httpx|aiohttp|urllib|fetch\(|axios|websocket|https?:\/\/)/i.test(runtimeText);
  const secretFacts = extractMcpAutowireSecretFacts(evidenceText).secrets
    .filter((secret) => /(?:API_KEY|TOKEN|SECRET|PASSWORD)$/i.test(secret.name))
    .slice(0, 6);
  const expectedTools = extractSourceOnlyMcpToolNames(evidenceText);
  const repo = input.target.github.repo;
  const displayName = displayNameForPackage(repo);
  const filesystemQuestions = /SQLITE_DB_PATH/i.test(evidenceText)
    ? [{
        question: "Which SQLite database file should be mounted read-only for validation and runtime?",
        impact: "filesystem" as const,
        blocksInstall: false,
        evidenceRefs,
      }]
    : [];

  return {
    schemaVersion: "ambient-mcp-autowire-v1",
    id: safeCandidateId(`${repo}-source-mcp`),
    displayName,
    source: {
      kind: "github",
      url: input.target.url.toString(),
      packageName: repo,
      evidenceRefs,
    },
    recommendedLane: "standard-mcp",
    runtime: {
      provider: "toolhive",
      sourceKind: "unknown",
      transport: "stdio",
      evidenceRefs,
    },
    secrets: secretFacts.map((secret) => ({
      name: secret.name,
      required: secret.requiredness === "required",
      secret: true as const,
      purpose: secret.requiredness === "required"
        ? `Secret required by ${displayName}.`
        : `Optional secret supported by ${displayName}.`,
      evidenceRefs,
    })),
    permissions: {
      network: runtimeHosts.length
        ? {
            mode: "allowlist",
            allowHosts: runtimeHosts,
            allowPorts: runtimePorts.length ? runtimePorts : [443],
            justification: networkJustification(sourceNetworkFacts, displayName),
          }
        : runtimeNetworkSignal
          ? {
              mode: "broad",
              allowHosts: [],
              allowPorts: [],
              justification: "Source code uses network libraries, but deterministic evidence did not expose fixed runtime hosts.",
            }
          : {
              mode: "disabled",
              allowHosts: [],
              allowPorts: [],
              justification: "Deterministic source evidence did not identify a runtime network requirement.",
            },
      filesystem: {
        workspaceRead: false,
        workspaceWrite: false,
        extraMounts: [],
      },
      localApps: [],
      evidenceRefs,
    },
    validationPlan: {
      preflights: ["toolhive-runtime", "container-runtime", "custom-source-build-review"],
      expectedTools,
      evidenceRefs,
    },
    evidence,
    openQuestions: filesystemQuestions,
    riskSummary: {
      level: runtimeNetworkSignal || secretFacts.length ? "high" : "medium",
      reasons: [
        "GitHub source-only MCP server needs a reviewed custom ToolHive source build before execution.",
        "No npm, PyPI, OCI, ToolHive registry, or remote MCP endpoint metadata was deterministically confirmed.",
      ],
      evidenceRefs,
    },
  };
}

function hasSourceOnlyMcpSignal(text: string): boolean {
  const lower = text.toLowerCase();
  if (/not an? mcp|not an? mcp server|not a model context protocol server|without mcp support|does not expose.*mcp|no mcp server scripts/.test(lower)) return false;
  return /\bmcp server\b|\bmcp servers\b|fastmcp|from fastmcp import|fastmcp\s*\(|mcp\s*=\s*fastmcp|@mcp\.tool\s*\(/.test(lower);
}

function hasFetchedSourceOnlyMcpSignal(fetches: McpAutowireDiscoveryFetch[]): boolean {
  return fetches.some((fetch) => fetch.status === "fetched" && Boolean(fetch.textPreview) && hasSourceOnlyMcpSignal(fetch.textPreview ?? ""));
}

function sourceOnlyMcpHintText(input: {
  target: McpAutowireTarget;
  instructions?: string;
  searches: McpAutowireDiscoverySearch[];
}): string {
  return [
    input.target.url.toString(),
    input.instructions ?? "",
    ...input.searches.flatMap((search) => [
      search.query,
      ...(search.results ?? []).flatMap((result) => [result.path, result.reason]),
    ]),
  ].join("\n");
}

function sourceOnlyMcpEvidence(input: {
  target: McpAutowireTarget;
  fetches: McpAutowireDiscoveryFetch[];
  searches: McpAutowireDiscoverySearch[];
}): McpAutowireCandidate["evidence"] {
  const entries: McpAutowireCandidate["evidence"] = [];
  const addEntry = (entry: McpAutowireCandidate["evidence"][number]) => {
    if (!entries.some((existing) => existing.id === entry.id)) entries.push(entry);
  };
  for (const fetch of input.fetches) {
    if (fetch.status !== "fetched" || !fetch.textPreview || !hasSourceOnlyMcpSignal(fetch.textPreview)) continue;
    const lowerUrl = fetch.url.toLowerCase();
    if (/readme\.mdx?$/.test(lowerUrl)) {
      addEntry({
        id: "source-readme",
        type: "readme",
        locator: fetch.url,
        summary: "README describes this repository as an MCP server source.",
      });
    } else if (/\.(?:py|js|ts|mjs|cjs|go|rs)$/.test(lowerUrl)) {
      addEntry({
        id: "source-code",
        type: "file",
        locator: fetch.url,
        summary: "Source code contains MCP server implementation evidence.",
      });
    } else if (/(?:requirements\.txt|pyproject\.toml|package\.json|uv\.lock)$/.test(lowerUrl)) {
      addEntry({
        id: "source-dependencies",
        type: "package-manifest",
        locator: fetch.url,
        summary: "Dependency metadata references MCP server runtime libraries.",
      });
    }
  }
  if (!entries.length) {
    const searched = input.searches
      .flatMap((search) => search.results ?? [])
      .find((result) => /mcp|fastmcp/i.test(`${result.path} ${result.reason}`));
    entries.push({
      id: "source-discovery",
      type: "other",
      locator: searched?.rawUrl ?? input.target.url.toString(),
      summary: "Bounded discovery found source-only MCP server evidence.",
    });
  }
  return entries.slice(0, 6);
}

function sourceOnlyRuntimeEvidenceText(fetches: McpAutowireDiscoveryFetch[]): string {
  return fetches
    .filter((fetch) => fetch.status === "fetched" && fetch.textPreview)
    .map((fetch) => fetch.textPreview)
    .join("\n");
}

function extractSourceOnlyMcpToolNames(text: string): string[] {
  const tools = new Set<string>();
  for (const match of text.matchAll(/@mcp\.tool\s*\(\s*\)\s*(?:\r?\n|\s)*def\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (match[1]) tools.add(match[1]);
  }
  for (const match of text.matchAll(/^###\s+([a-z_][a-z0-9_]*)\s*$/gm)) {
    if (match[1]) tools.add(match[1]);
  }
  return [...tools].slice(0, 12);
}

function workflowPiJsonValidationErrorLike(error: unknown): WorkflowPiJsonValidationError | { responseText?: string } | undefined {
  if (error instanceof WorkflowPiJsonValidationError) return error;
  if (!(error instanceof Error)) return undefined;
  if (!error.message.startsWith("Ambient/Pi JSON response for ")) return undefined;
  return "responseText" in error && typeof (error as { responseText?: unknown }).responseText === "string"
    ? { responseText: (error as { responseText: string }).responseText }
    : {};
}

function deterministicEvidenceText(input: {
  target: McpAutowireTarget;
  instructions?: string;
  discoverySummary: string;
  fetches: McpAutowireDiscoveryFetch[];
  searches: McpAutowireDiscoverySearch[];
}): string {
  return [
    input.target.package ? `${input.target.package.registryType} package: ${input.target.package.identifier}` : "",
    input.instructions ?? "",
    input.discoverySummary,
    ...input.fetches.map((fetch) => fetch.url),
    ...input.fetches.map((fetch) => classificationFetchPreview(fetch)),
    ...input.searches.flatMap((search) => [
      search.query,
      search.defaultBranch ?? "",
      ...(search.results ?? []).flatMap((result) => [result.path, result.rawUrl, result.reason]),
    ]),
  ].join("\n");
}

interface DeterministicPackageIdentity {
  registryType: "npm" | "pypi";
  identifier: string;
  locator?: string;
}

function deterministicPackageIdentity(input: {
  target: McpAutowireTarget;
  instructions?: string;
  fetches: McpAutowireDiscoveryFetch[];
}, evidenceText: string): DeterministicPackageIdentity | undefined {
  if (input.target.package) {
    return {
      registryType: input.target.package.registryType,
      identifier: input.target.package.identifier,
      locator: packageRegistryMetadataUrl(input.target.package) ?? input.target.url.toString(),
    };
  }

  const instructionNpm = extractNpmPackageOverride(input.instructions ?? "");
  if (instructionNpm) {
    return {
      registryType: "npm",
      identifier: instructionNpm,
      locator: "user-instructions",
    };
  }

  const manifestPackage = bestFetchedPackageIdentity(input.fetches);
  if (manifestPackage) return manifestPackage;

  const npmPackage = extractNpmMcpPackageName(evidenceText);
  if (npmPackage) return { registryType: "npm", identifier: npmPackage };
  const pypiPackage = extractPyPiMcpPackageName(evidenceText);
  if (pypiPackage) return { registryType: "pypi", identifier: pypiPackage };
  return undefined;
}

function bestFetchedPackageIdentity(fetches: McpAutowireDiscoveryFetch[]): DeterministicPackageIdentity | undefined {
  const candidates = fetches
    .filter((fetch) => fetch.status === "fetched" && fetch.textPreview)
    .flatMap((fetch) => packageIdentitiesFromFetchedText(fetch));
  return candidates.sort((a, b) => b.score - a.score)[0]?.identity;
}

function packageIdentitiesFromFetchedText(fetch: McpAutowireDiscoveryFetch): Array<{ identity: DeterministicPackageIdentity; score: number }> {
  const text = fetch.textPreview ?? "";
  const lowerUrl = fetch.url.toLowerCase();
  const fromJson = packageIdentityFromJsonText(text, fetch.url);
  if (fromJson) {
    const mcpScore = /mcp|modelcontextprotocol/i.test(text) || /mcp/i.test(fromJson.identifier) ? 200 : 0;
    const locatorScore = lowerUrl.includes("package.json") || lowerUrl.includes("registry.npmjs.org") || lowerUrl.includes("/pypi/") ? 600 : 0;
    return [{ identity: fromJson, score: locatorScore + mcpScore }];
  }
  const fromManifest = packageIdentitiesFromManifestText(text, fetch.url);
  if (fromManifest.length) return fromManifest;
  return [];
}

function packageIdentityFromJsonText(text: string, locator: string): DeterministicPackageIdentity | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const record = parsed as Record<string, unknown>;
    const npmName = typeof record.name === "string" ? record.name.trim() : undefined;
    if (npmName && isSafePackageIdentifier(npmName, "npm") && packageJsonLooksLikeMcp(record, npmName)) {
      return { registryType: "npm", identifier: npmName, locator };
    }
    const info = record.info && typeof record.info === "object" && !Array.isArray(record.info)
      ? record.info as Record<string, unknown>
      : undefined;
    const pypiName = typeof info?.name === "string" ? info.name.trim() : undefined;
    if (info && pypiName && isSafePackageIdentifier(pypiName, "pypi") && packageJsonLooksLikeMcp(info, pypiName)) {
      return { registryType: "pypi", identifier: pypiName, locator };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function packageIdentitiesFromManifestText(text: string, locator: string): Array<{ identity: DeterministicPackageIdentity; score: number }> {
  const facts = extractMcpAutowireManifestFacts([{ locator, text }]);
  return facts.manifests
    .filter((manifest) => manifest.packageName && manifest.registryType && manifest.looksLikeMcp)
    .map((manifest) => ({
      identity: {
        registryType: manifest.registryType!,
        identifier: manifest.packageName!,
        locator: manifest.locator,
      },
      score: manifestScore(manifest),
    }));
}

function manifestScore(manifest: ReturnType<typeof extractMcpAutowireManifestFacts>["manifests"][number]): number {
  const base = manifest.kind === "pyproject-toml" ? 520 : 500;
  const mcpEntrypoint = manifest.scriptTargets.some((script) => mcpEntrypointSignal(script.name) || mcpEntrypointSignal(script.target ?? ""));
  if (mcpEntrypoint) return base + 430;
  if (manifest.scriptNames.some(mcpEntrypointSignal)) return base + 240;
  return base;
}

function deterministicMcpPackageArguments(input: {
  registryType: "npm" | "pypi";
  packageName: string;
  evidenceText: string;
}): NonNullable<McpAutowireCandidate["runtime"]["package"]>["packageArguments"] {
  const packagePattern = escapeRegex(input.packageName);
  const launchPattern = input.registryType === "npm"
    ? new RegExp(`\\bnpx\\s+(?:-[A-Za-z0-9_-]+\\s+)*${packagePattern}\\s+--mcp\\b`, "i")
    : new RegExp(`\\b(?:uvx\\s+)?${packagePattern}\\s+--mcp\\b`, "i");
  const arrayArgPattern = /["']--mcp["']/i;
  const usagePattern = new RegExp(`\\b${packagePattern}\\s+--mcp\\b`, "i");
  if (launchPattern.test(input.evidenceText) || usagePattern.test(input.evidenceText) || arrayArgPattern.test(input.evidenceText)) {
    return [{ type: "switch", name: "--mcp", isFixed: true }];
  }
  return [];
}

function deterministicMcpPackageEntrypoint(input: {
  registryType: "npm" | "pypi";
  packageName: string;
  evidenceText: string;
  fetches: McpAutowireDiscoveryFetch[];
}): NonNullable<McpAutowireCandidate["runtime"]["package"]>["entrypoint"] | undefined {
  const manifestEntrypoint = input.fetches
    .filter((fetch) => fetch.status === "fetched" && fetch.textPreview)
    .flatMap((fetch) => extractMcpAutowireManifestFacts([{ locator: fetch.url, text: fetch.textPreview ?? "" }]).manifests)
    .flatMap((manifest) => manifest.scriptTargets)
    .filter((script) => mcpEntrypointSignal(script.name) || mcpEntrypointSignal(script.target ?? ""))
    .sort((left, right) => mcpEntrypointScore(right) - mcpEntrypointScore(left))[0];
  if (manifestEntrypoint?.name && !sameDefaultPackageExecutable(input.registryType, input.packageName, manifestEntrypoint.name)) {
    return {
      kind: "package-bin",
      command: manifestEntrypoint.name,
      fromPackage: input.packageName,
    };
  }
  const moduleMatch = /\bpython(?:3)?\s+-m\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\b/i.exec(input.evidenceText);
  const moduleName = moduleMatch?.[1];
  if (moduleName && mcpEntrypointSignal(moduleName)) {
    return {
      kind: "module",
      module: moduleName,
      fromPackage: input.packageName,
    };
  }
  return undefined;
}

function runtimeHintForDeterministicPackage(input: {
  registryType: "npm" | "pypi";
  packageName: string;
  packageArguments: NonNullable<McpAutowireCandidate["runtime"]["package"]>["packageArguments"];
  entrypoint?: NonNullable<McpAutowireCandidate["runtime"]["package"]>["entrypoint"];
}): string {
  const base = input.registryType === "npm" ? `npx -y ${input.packageName}` : `uvx ${input.packageName}`;
  const args = input.packageArguments.map((arg) => packageArgumentHint(arg)).filter(Boolean).join(" ");
  if (args) return `${base} ${args}`;
  if (input.entrypoint?.kind === "package-bin" && input.entrypoint.command) return `${base} (entrypoint ${input.entrypoint.command} from ${input.packageName})`;
  if (input.entrypoint?.kind === "module" && input.entrypoint.module) return `${base} (module ${input.entrypoint.module})`;
  return base;
}

function packageArgumentHint(arg: NonNullable<McpAutowireCandidate["runtime"]["package"]>["packageArguments"][number]): string | undefined {
  if (arg.type === "switch") return arg.name;
  if (arg.type === "flag" && arg.name && arg.valueHint) return `${arg.name} ${arg.valueHint}`;
  if (arg.type === "positional") return arg.valueHint;
  return undefined;
}

function mcpEntrypointScore(script: { name: string; target?: string }): number {
  const text = `${script.name}\n${script.target ?? ""}`;
  let score = 0;
  if (/\bmcp\b/i.test(script.name)) score += 10;
  if (/mcp_server|fastmcp|\.mcp\b|\bmcp\b/i.test(text)) score += 20;
  if (/server/i.test(text)) score += 5;
  return score;
}

function mcpEntrypointSignal(value: string): boolean {
  return /\bmcp\b|mcp_server|fastmcp|modelcontextprotocol/i.test(value);
}

function sameDefaultPackageExecutable(registryType: "npm" | "pypi", packageName: string, command: string): boolean {
  if (registryType === "npm") return command.toLowerCase() === defaultNpmExecutableName(packageName).toLowerCase();
  return normalizePackageExecutableName(command) === normalizePackageExecutableName(packageName);
}

function defaultNpmExecutableName(identifier: string): string {
  const parts = identifier.split("/");
  return parts[parts.length - 1] ?? identifier;
}

function normalizePackageExecutableName(value: string): string {
  return value.trim().toLowerCase().replace(/[-_.]+/g, "-");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function packageJsonLooksLikeMcp(record: Record<string, unknown>, packageName: string): boolean {
  if (/mcp|modelcontextprotocol/i.test(packageName)) return true;
  const depsText = JSON.stringify({
    dependencies: record.dependencies,
    devDependencies: record.devDependencies,
    peerDependencies: record.peerDependencies,
    optionalDependencies: record.optionalDependencies,
    bin: record.bin,
    scripts: record.scripts,
    keywords: record.keywords,
  }).toLowerCase();
  return depsText.includes("@modelcontextprotocol") || /\bmcp\b/.test(depsText);
}

function hasExplicitMcpPackageSignal(text: string): boolean {
  return /model context protocol|modelcontextprotocol|@modelcontextprotocol|mcpservers?|mcp clients?|mcp server|claude desktop|cursor|windsurf|npx:\/\/|uvx:\/\/|\bnpx\s+(?:-[\w-]+\s+)*@?[a-z0-9_.-]+\/?mcp\b|@[a-z0-9_.-]+\/mcp\b/i.test(text);
}

function extractNpmMcpPackageName(text: string): string | undefined {
  const patterns = [
    /\bnpx:\/\/((?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+)\b/,
    /\bnpx\s+(?:-[\w-]+\s+)*((?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+)\b/,
    /\b(?:npm package|package(?: name)?|published as|registry)\s*[:=]?\s*((?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]*mcp[A-Za-z0-9_.-]*)\b/i,
    /\b(@[A-Za-z0-9_.-]+\/mcp)\b/,
    /\b(@[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]*mcp[A-Za-z0-9_.-]*)\b/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.[1]?.trim();
    if (value && isSafePackageIdentifier(value, "npm")) return value;
  }
  return undefined;
}

function extractNpmPackageOverride(text: string): string | undefined {
  const patterns = [
    /\bnpm:((?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+)\b/i,
    /\b(?:exact|correct|preferred|override|scoped)?\s*(?:npm\s+)?package(?:\s+name|\s+coordinate)?\s*(?:is|=|:)?\s*((?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]*mcp[A-Za-z0-9_.-]*)\b/i,
    /\b((?:@[A-Za-z0-9_.-]+\/)[A-Za-z0-9_.-]*mcp[A-Za-z0-9_.-]*)\b/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.[1]?.trim();
    if (value && isSafePackageIdentifier(value, "npm")) return value;
  }
  return undefined;
}

function extractPyPiMcpPackageName(text: string): string | undefined {
  const patterns = [
    /\buvx:\/\/([A-Za-z0-9_.-]+)\b/,
    /\buvx\s+([A-Za-z0-9_.-]+)\b/,
    /\b(?:pypi package|python package)\s*[:=]?\s*([A-Za-z0-9_.-]*mcp[A-Za-z0-9_.-]*)\b/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.[1]?.trim();
    if (value && isSafePackageIdentifier(value, "pypi")) return value;
  }
  return undefined;
}

function extractPrimarySecretFact(text: string) {
  const facts = extractMcpAutowireSecretFacts(text).secrets;
  return facts.find((fact) => fact.requiredness === "required" && /API_KEY|TOKEN/.test(fact.name)) ??
    facts.find((fact) => fact.requiredness === "required") ??
    facts.find((fact) => fact.requiredness === "optional" && /API_KEY|TOKEN/.test(fact.name)) ??
    facts.find((fact) => fact.requiredness === "optional");
}

function deterministicBrowserRuntimeUpdatePolicy(input: {
  packageName: string;
  fetches: McpAutowireDiscoveryFetch[];
  evidenceId: string;
}): NonNullable<McpAutowireCandidate["runtime"]["updatePolicy"]> | undefined {
  const text = [
    input.packageName,
    ...browserRuntimeManifestSignals(input.fetches),
  ].join("\n");
  if (!/\b(?:browser|chrome|chromium|playwright|puppeteer|selenium|webdriver|headless|screenshot|screenshots|browserless)\b/i.test(text)) return undefined;
  return {
    mode: "managed-browser-security",
    reason: "Browser-class MCP runtime uses browser automation packages; Ambient and ToolHive must manage browser runtime security updates.",
    evidenceRefs: [input.evidenceId],
  };
}

function deterministicToolHiveRuntimeImage(input: {
  registryType: "npm" | "pypi";
  fetches: McpAutowireDiscoveryFetch[];
  browserRuntime: boolean;
}): string | undefined {
  if (input.registryType === "npm") return input.browserRuntime ? "node:22-alpine" : undefined;
  if (input.registryType !== "pypi") return undefined;
  const manifestDeps = input.fetches
    .filter((fetch) => fetch.status === "fetched" && fetch.textPreview && /pyproject\.toml/i.test(fetch.url))
    .flatMap((fetch) =>
      extractMcpAutowireManifestFacts([{ locator: fetch.url, text: fetch.textPreview ?? "" }]).manifests
        .flatMap((manifest) => manifest.dependencies)
    )
    .join("\n");
  if (/\b(?:onnxruntime|fastembed)\b/i.test(manifestDeps)) return "python:3.11-slim";
  return undefined;
}

function browserRuntimeManifestSignals(fetches: McpAutowireDiscoveryFetch[]): string[] {
  return fetches
    .filter((fetch) => fetch.status === "fetched" && fetch.textPreview && /(?:package\.json|pyproject\.toml|registry\.npmjs\.org|pypi\.org\/pypi)/i.test(fetch.url))
    .flatMap((fetch) => {
      const text = fetch.textPreview ?? "";
      const lowerUrl = fetch.url.toLowerCase();
      if (lowerUrl.endsWith("pyproject.toml")) {
        return extractMcpAutowireManifestFacts([{ locator: fetch.url, text }]).manifests.flatMap((manifest) => [
          manifest.packageName ?? "",
          ...manifest.dependencies,
        ]);
      }
      try {
        const parsed = JSON.parse(text) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
        const record = parsed as Record<string, unknown>;
        return [
          typeof record.name === "string" ? record.name : "",
          ...dependencyObjectKeys(record.dependencies),
          ...dependencyObjectKeys(record.optionalDependencies),
          ...dependencyObjectKeys(record.peerDependencies),
        ];
      } catch {
        return [];
      }
    })
    .filter((value): value is string => Boolean(value));
}

function dependencyObjectKeys(value: unknown): string[] {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
}

function bestDeterministicEvidenceLocator(input: {
  target: McpAutowireTarget;
  fetches: McpAutowireDiscoveryFetch[];
  searches: McpAutowireDiscoverySearch[];
}): string {
  const fetchedReadme = input.fetches.find((fetch) => fetch.status === "fetched" && /readme\.mdx?$/i.test(fetch.url));
  if (fetchedReadme) return fetchedReadme.url;
  const searchedReadme = input.searches.flatMap((search) => search.results ?? []).find((result) => /readme\.mdx?$/i.test(result.path));
  return searchedReadme?.rawUrl ?? input.target.url.toString();
}

function mcpAutowireSessionFacts(input: { targetUrl: string; instructions?: string }): McpAutowireSessionFacts {
  const hash = createHash("sha256")
    .update(input.targetUrl)
    .update("\0")
    .update(input.instructions ?? "")
    .digest("hex")
    .slice(0, 20);
  return {
    id: `mcp-autowire-install-${hash}`,
    purpose: "mcp-autowire-install",
    targetUrl: input.targetUrl,
  };
}

function displayNameForPackage(packageName: string): string {
  const [scope, rawLeaf] = packageName.startsWith("@") ? packageName.slice(1).split("/") : [undefined, packageName];
  const leaf = rawLeaf ?? packageName;
  const name = leaf
    .split(/[-_.]+/)
    .filter(Boolean)
    .map(displayNamePart)
    .join(" ") || packageName;
  if (scope && /^(mcp|server|mcp-server)$/i.test(leaf)) {
    const scopedName = scope
      .split(/[-_.]+/)
      .filter(Boolean)
      .map(displayNamePart)
      .join(" ");
    return scopedName ? `${scopedName} ${name}` : name;
  }
  return name;
}

function displayNamePart(part: string): string {
  if (/^mcp$/i.test(part)) return "MCP";
  if (/^api$/i.test(part)) return "API";
  return part.slice(0, 1).toUpperCase() + part.slice(1);
}

function safeCandidateId(value: string): string {
  return value.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "standard-mcp";
}

function isSafePackageIdentifier(value: string, registryType: "npm" | "pypi"): boolean {
  if (registryType === "npm") return /^(?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+$/.test(value);
  return /^[A-Za-z0-9_.-]+$/.test(value);
}

interface McpAutowireTarget {
  url: URL;
  package?: McpAutowirePackageTarget;
  github?: {
    owner: string;
    repo: string;
    branch?: string;
    path?: string;
    pathKind?: "tree" | "blob";
  };
}

interface McpAutowirePackageTarget {
  registryType: "npm" | "pypi";
  identifier: string;
}

function parseTargetUrl(value: string): McpAutowireTarget {
  const facts = normalizeMcpAutowireTarget(value);
  const url = new URL(facts.canonicalUrl);
  return {
    url,
    ...(facts.package ? { package: facts.package } : {}),
    ...(facts.github ? { github: facts.github } : {}),
  };
}

function parsePackageTarget(value: string): McpAutowirePackageTarget | undefined {
  const trimmed = value.trim();
  const npmPrefixed = /^npm:(.+)$/i.exec(trimmed)?.[1]?.trim().replace(/^\/\//, "");
  if (npmPrefixed && isSafePackageIdentifier(npmPrefixed, "npm")) {
    return { registryType: "npm", identifier: npmPrefixed };
  }
  const pypiPrefixed = /^(?:pypi|uvx):(.+)$/i.exec(trimmed)?.[1]?.trim().replace(/^\/\//, "");
  if (pypiPrefixed && isSafePackageIdentifier(pypiPrefixed, "pypi")) {
    return { registryType: "pypi", identifier: pypiPrefixed };
  }
  if (trimmed.startsWith("@") && isSafePackageIdentifier(trimmed, "npm")) {
    return { registryType: "npm", identifier: trimmed };
  }
  return undefined;
}

function packageTargetUrl(target: McpAutowirePackageTarget): URL {
  if (target.registryType === "npm") return new URL(`https://www.npmjs.com/package/${target.identifier}`);
  return new URL(`https://pypi.org/project/${target.identifier}/`);
}

function packageRegistryMetadataUrl(target: McpAutowirePackageTarget): string | undefined {
  if (target.registryType === "npm") return npmRegistryMetadataUrl(target.identifier);
  if (target.registryType === "pypi") return `https://pypi.org/pypi/${encodeURIComponent(target.identifier)}/json`;
  return undefined;
}

function npmRegistryMetadataUrl(identifier: string): string {
  if (identifier.startsWith("@")) {
    const [scope, name] = identifier.split("/");
    if (scope && name) return `https://registry.npmjs.org/${encodeURIComponent(scope)}%2f${encodeURIComponent(name)}`;
  }
  return `https://registry.npmjs.org/${encodeURIComponent(identifier)}`;
}

function packageTargetFromUrl(url: URL): McpAutowirePackageTarget | undefined {
  const host = url.hostname.toLowerCase();
  const parts = decodeURIComponent(url.pathname).split("/").filter(Boolean);
  if (host === "www.npmjs.com" && parts[0] === "package" && parts[1]) {
    const identifier = parts[1].startsWith("@") && parts[2] ? `${parts[1]}/${parts[2]}` : parts[1];
    if (isSafePackageIdentifier(identifier, "npm")) return { registryType: "npm", identifier };
  }
  if (host === "pypi.org" && parts[0] === "project" && parts[1] && isSafePackageIdentifier(parts[1], "pypi")) {
    return { registryType: "pypi", identifier: parts[1] };
  }
  return undefined;
}

function githubRepoFromUrl(url: URL): McpAutowireTarget["github"] | undefined {
  if (url.hostname.toLowerCase() !== "github.com") return undefined;
  const [owner, repoRaw, pathKind, branch, ...pathParts] = decodeURIComponent(url.pathname).split("/").filter(Boolean);
  if (!owner || !repoRaw) return undefined;
  const repo = repoRaw.replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return undefined;
  const subpath = githubTargetSubpath(pathKind, branch, pathParts);
  return { owner, repo, ...subpath };
}

function suggestedDiscoveryUrls(target: McpAutowireTarget): string[] {
  if (target.package && !target.github) {
    return [
      packageRegistryMetadataUrl(target.package),
      target.url.toString(),
    ].filter((url): url is string => Boolean(url));
  }
  if (!target.github) return [target.url.toString()];
  const { owner, repo } = target.github;
  const branches = ["main", "master"];
  const files = ["README.md", "README.mdx", "packages/mcp/README.md", "package.json", "packages/mcp/package.json", "server.json", "pyproject.toml", "smithery.yaml", ".mcp.json"];
  return uniqueStrings([
    ...githubTargetSubpathDiscoveryUrls(target.github),
    ...files.flatMap((file) => branches.map((branch) => `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file}`)),
    `https://github.com/${owner}/${repo}`,
  ]);
}

function githubTargetSubpath(
  pathKind: string | undefined,
  branch: string | undefined,
  pathParts: string[],
): Pick<NonNullable<McpAutowireTarget["github"]>, "branch" | "path" | "pathKind"> {
  if ((pathKind !== "tree" && pathKind !== "blob") || !branch || pathParts.length === 0) return {};
  if (!/^[A-Za-z0-9_.@/-]+$/.test(branch)) return {};
  if (!pathParts.every((part) => part && part !== "." && part !== ".." && !part.includes("\0"))) return {};
  return {
    branch,
    path: pathParts.join("/"),
    pathKind,
  };
}

function githubTargetSubpathDiscoveryUrls(github: NonNullable<McpAutowireTarget["github"]>): string[] {
  if (!github.branch || !github.path) return [];
  const path = github.path.replace(/^\/+|\/+$/g, "");
  if (!path) return [];
  if (github.pathKind === "blob") {
    return [`https://raw.githubusercontent.com/${github.owner}/${github.repo}/${github.branch}/${path}`];
  }
  const files = ["package.json", "pyproject.toml", "server.json", ".mcp.json", "README.md", "README.mdx", "smithery.yaml"];
  return files.map((file) => `https://raw.githubusercontent.com/${github.owner}/${github.repo}/${github.branch}/${path}/${file}`);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeDiscoveryGrants(input: McpAutowireDiscoveryGrants | undefined): Required<McpAutowireDiscoveryGrants> {
  return {
    urlFetch: input?.urlFetch !== false,
    githubRaw: input?.githubRaw !== false,
    search: input?.search === true,
    maxFetches: Math.max(0, Math.min(10, Math.floor(input?.maxFetches ?? defaultMaxFetches))),
    maxSearches: Math.max(0, Math.min(5, Math.floor(input?.maxSearches ?? defaultMaxSearches))),
    maxBytesPerFetch: Math.max(1_000, Math.min(80_000, Math.floor(input?.maxBytesPerFetch ?? defaultMaxBytesPerFetch))),
  };
}

function autowireUrlAllowed(value: string, target: McpAutowireTarget, grants: Required<McpAutowireDiscoveryGrants>): { allowed: true } | { allowed: false; reason: string } {
  if (!grants.urlFetch) return { allowed: false, reason: "URL fetch discovery was not granted." };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { allowed: false, reason: "Invalid URL." };
  }
  if (url.protocol !== "https:") return { allowed: false, reason: "Only HTTPS URLs are allowed." };
  if (url.username || url.password) return { allowed: false, reason: "URLs with credentials are blocked." };
  if (url.search && /(?:token|key|secret|password|auth)/i.test(url.search)) return { allowed: false, reason: "Credential-like URL query parameters are blocked." };
  if (!target.github) {
    if (target.package && packageRegistryMetadataUrl(target.package) === url.toString()) return { allowed: true };
    return sameOriginPath(url, target.url) ? { allowed: true } : { allowed: false, reason: "Only the target package metadata URL or target URL origin/path is allowed for non-GitHub targets." };
  }

  const owner = target.github.owner.toLowerCase();
  const repo = target.github.repo.toLowerCase();
  if (url.hostname.toLowerCase() === "github.com") {
    const repoPath = githubRepoFromUrl(url);
    if (repoPath?.owner.toLowerCase() === owner && repoPath.repo.toLowerCase() === repo) return { allowed: true };
    return { allowed: false, reason: "GitHub URL is outside the target repository." };
  }
  if (url.hostname.toLowerCase() === "raw.githubusercontent.com") {
    if (!grants.githubRaw) return { allowed: false, reason: "GitHub raw fetch discovery was not granted." };
    const [rawOwner, rawRepo] = url.pathname.split("/").filter(Boolean);
    if (rawOwner?.toLowerCase() === owner && rawRepo?.toLowerCase() === repo) return { allowed: true };
    return { allowed: false, reason: "Raw GitHub URL is outside the target repository." };
  }
  return { allowed: false, reason: "URL host is outside the target GitHub repository." };
}

function sameOriginPath(url: URL, target: URL): boolean {
  return url.origin === target.origin && url.pathname.startsWith(target.pathname);
}

interface GitHubRepoMetadata {
  default_branch?: unknown;
}

interface GitHubTreeEntry {
  path?: unknown;
  type?: unknown;
}

interface GitHubTreeResponse {
  tree?: GitHubTreeEntry[];
  truncated?: boolean;
}

async function fetchJson<T>(fetchImpl: FetchLike, url: string, signal: AbortSignal | undefined): Promise<T> {
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/vnd.github+json,application/json;q=0.9,*/*;q=0.1",
      "user-agent": "Ambient-Desktop-MCP-Autowire",
    },
    signal,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${errorMessage(error)}`);
  }
}

function rankGitHubTreeSearchResults(input: {
  owner: string;
  repo: string;
  branch: string;
  query: string;
  tree: GitHubTreeResponse;
  limit: number;
}): McpAutowireDiscoverySearchResult[] {
  const tokens = searchTokens(input.query);
  const entries = Array.isArray(input.tree.tree) ? input.tree.tree : [];
  return entries
    .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
    .map((entry) => {
      const path = String(entry.path);
      return { path, score: scoreGitHubPath(path, tokens), reason: pathScoreReason(path, tokens) };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, input.limit)
    .map((entry) => ({
      path: entry.path,
      score: entry.score,
      reason: entry.reason,
      url: gitHubBlobUrl(input.owner, input.repo, input.branch, entry.path),
      rawUrl: gitHubRawUrl(input.owner, input.repo, input.branch, entry.path),
    }));
}

function searchTokens(query: string): string[] {
  const tokens = query.toLowerCase().split(/[^a-z0-9_.-]+/).filter((token) => token.length >= 2);
  const defaults = ["mcp", "server", "readme", "package", "manifest", "bridge", "smithery", "pyproject"];
  return [...new Set([...tokens, ...defaults])];
}

function scoreGitHubPath(path: string, tokens: string[]): number {
  const lower = path.toLowerCase();
  const base = lower.split("/").pop() ?? lower;
  let score = 0;
  if (base === "server.json") score += 120;
  if (base === ".mcp.json" || base === "mcp.json") score += 110;
  if (base === "package.json" || base === "pyproject.toml") score += 95;
  if (base === "smithery.yaml" || base === "smithery.yml") score += 85;
  if (base === "readme.md" || base === "readme.mdx") score += lower.includes("/") ? 65 : 90;
  if (lower.includes("mcp")) score += 45;
  if (lower.includes("bridge")) score += 30;
  if (lower.includes("server")) score += 20;
  if (lower.includes("ghidra")) score += 20;
  if (lower.includes("context7") || lower.includes("scrapling")) score += 15;
  for (const token of tokens) {
    if (lower.includes(token)) score += 8;
  }
  if (lower.includes("node_modules/") || lower.includes("dist/") || lower.includes("build/") || lower.includes("coverage/")) {
    score -= 80;
  }
  return score;
}

function pathScoreReason(path: string, tokens: string[]): string {
  const lower = path.toLowerCase();
  const reasons: string[] = [];
  if (/(^|\/)server\.json$/.test(lower)) reasons.push("server metadata");
  if (/(^|\/)(?:package\.json|pyproject\.toml)$/.test(lower)) reasons.push("package manifest");
  if (/(^|\/)readme\.mdx?$/.test(lower)) reasons.push("README evidence");
  if (lower.includes("mcp")) reasons.push("MCP path/name");
  if (lower.includes("bridge")) reasons.push("bridge path/name");
  const matched = tokens.filter((token) => lower.includes(token)).slice(0, 3);
  if (matched.length) reasons.push(`matched ${matched.join(", ")}`);
  return reasons.join("; ") || "path matched search heuristics";
}

function gitHubBlobUrl(owner: string, repo: string, branch: string, path: string): string {
  return `https://github.com/${owner}/${repo}/blob/${encodePathSegment(branch)}/${encodePath(path)}`;
}

function gitHubRawUrl(owner: string, repo: string, branch: string, path: string): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${encodePathSegment(branch)}/${encodePath(path)}`;
}

function encodePath(path: string): string {
  return path.split("/").map(encodePathSegment).join("/");
}

function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%2F/gi, "/");
}

function safeGitHubRef(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.startsWith("/") || trimmed.endsWith("/")) return undefined;
  return /^[A-Za-z0-9._/-]+$/.test(trimmed) ? trimmed : undefined;
}

function stringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "string" && entry.trim() ? entry.trim() : undefined;
}

function numberField(value: unknown, key: string, fallback: number, min: number, max: number): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const entry = (value as Record<string, unknown>)[key];
  const numeric = typeof entry === "number" ? entry : typeof entry === "string" ? Number(entry) : NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
