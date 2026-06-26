import { Type, type Tool, type ToolCall } from "@mariozechner/pi-ai";
import { normalizeMcpAutowireTarget } from "./mcpAutowireFacts";
import {
  deterministicEvidenceText,
  hasExplicitMcpPackageSignal,
  hasFetchedSourceOnlyMcpSignal,
} from "./mcpAutowireDeterministicCandidates";

export const urlReadToolName = "ambient_mcp_url_read";
export const sourceSearchToolName = "ambient_mcp_source_search";

const defaultMaxFetches = 6;
const defaultMaxSearches = 2;
const defaultMaxBytesPerFetch = 24_000;

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface McpAutowireDiscoveryGrants {
  urlFetch?: boolean;
  githubRaw?: boolean;
  search?: boolean;
  maxFetches?: number;
  maxSearches?: number;
  maxBytesPerFetch?: number;
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

export interface McpAutowireTarget {
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

export interface McpAutowirePackageTarget {
  registryType: "npm" | "pypi";
  identifier: string;
}

export function parseTargetUrl(value: string): McpAutowireTarget {
  const facts = normalizeMcpAutowireTarget(value);
  const url = new URL(facts.canonicalUrl);
  return {
    url,
    ...(facts.package ? { package: facts.package } : {}),
    ...(facts.github ? { github: facts.github } : {}),
  };
}

export function suggestedDiscoveryUrls(target: McpAutowireTarget): string[] {
  if (target.package && !target.github) {
    return [packageRegistryMetadataUrl(target.package), target.url.toString()].filter((url): url is string => Boolean(url));
  }
  if (!target.github) return [target.url.toString()];
  const { owner, repo } = target.github;
  const branches = ["main", "master"];
  const files = [
    "README.md",
    "README.mdx",
    "packages/mcp/README.md",
    "package.json",
    "packages/mcp/package.json",
    "server.json",
    "pyproject.toml",
    "smithery.yaml",
    ".mcp.json",
  ];
  return uniqueStrings([
    ...githubTargetSubpathDiscoveryUrls(target.github),
    ...files.flatMap((file) => branches.map((branch) => `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file}`)),
    `https://github.com/${owner}/${repo}`,
  ]);
}

export function normalizeDiscoveryGrants(input: McpAutowireDiscoveryGrants | undefined): Required<McpAutowireDiscoveryGrants> {
  return {
    urlFetch: input?.urlFetch !== false,
    githubRaw: input?.githubRaw !== false,
    search: input?.search === true,
    maxFetches: Math.max(0, Math.min(10, Math.floor(input?.maxFetches ?? defaultMaxFetches))),
    maxSearches: Math.max(0, Math.min(5, Math.floor(input?.maxSearches ?? defaultMaxSearches))),
    maxBytesPerFetch: Math.max(1_000, Math.min(80_000, Math.floor(input?.maxBytesPerFetch ?? defaultMaxBytesPerFetch))),
  };
}

export async function runMcpAutowireDeterministicPreDiscovery(input: {
  input: { instructions?: string; signal?: AbortSignal };
  options: { fetchImpl?: FetchLike };
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
    ...fetched.map(
      (entry) =>
        `- ${entry.status} ${entry.url}${entry.statusCode ? ` HTTP ${entry.statusCode}` : ""}${entry.reason ? ` (${entry.reason})` : ""}`,
    ),
  ].join("\n");
}

export async function ensureBootstrapDiscoveryEvidence(input: {
  input: { signal?: AbortSignal };
  options: { fetchImpl?: FetchLike };
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

export function createMcpAutowireDiscoveryTools(input?: {
  target?: McpAutowireTarget;
  grants?: Required<McpAutowireDiscoveryGrants>;
}): Tool[] {
  const grants = input?.grants;
  const tools: Tool[] = [];
  if (!grants || (grants.urlFetch && grants.maxFetches > 0)) {
    tools.push({
      name: urlReadToolName,
      description:
        "Read one bounded URL for MCP autowire evidence. For GitHub targets, only the target repo page and raw.githubusercontent.com files from that repo are allowed. For package or metadata targets, only the target origin/path is allowed.",
      parameters: Type.Object({
        url: Type.String({
          description:
            "HTTPS URL to read. Must be the target GitHub repository URL/path, a raw.githubusercontent.com URL from the same owner/repo, or the target package/metadata URL path.",
        }),
      }),
    });
  }
  if (input?.target?.github && (!grants || (grants.search && grants.maxSearches > 0))) {
    tools.push({
      name: sourceSearchToolName,
      description:
        "Search the target GitHub repository tree for MCP metadata, package manifests, README files, and likely server code paths.",
      parameters: Type.Object({
        query: Type.String({
          description: "Short search query describing the MCP evidence to locate, such as package.json mcp server README.",
        }),
        limit: Type.Number({
          description: "Maximum matching source paths to return, between 1 and 30.",
        }),
      }),
    });
  }
  return tools;
}

export function initialDiscoveryToolChoice(input: {
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

async function ensureBootstrapSourceSearch(input: {
  input: { signal?: AbortSignal };
  options: { fetchImpl?: FetchLike };
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
  input: { signal?: AbortSignal };
  options: { fetchImpl?: FetchLike };
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
  input: { signal?: AbortSignal };
  options: { fetchImpl?: FetchLike };
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
  return fetches.some(
    (fetch) => fetch.status === "fetched" && Boolean(fetch.textPreview) && !fetch.contentType?.toLowerCase().includes("text/html"),
  );
}

function hasRemainingFetchBudget(grants: Required<McpAutowireDiscoveryGrants>, fetches: McpAutowireDiscoveryFetch[]): boolean {
  return fetches.filter((entry) => entry.status === "fetched" || entry.status === "failed").length < grants.maxFetches;
}

function bootstrapGitHubSearchQuery(github: NonNullable<McpAutowireTarget["github"]>): string {
  const path = github.path?.replace(/^\/+|\/+$/g, "");
  return [path ? `${path} package.json pyproject.toml server.json README MCP` : "mcp server.json package.json pyproject.toml README"].join(
    " ",
  );
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
      return rightInTarget - leftInTarget || right.score - left.score || left.path.localeCompare(right.path);
    })
    .map((result) => result.rawUrl);
  return uniqueStrings(results).slice(0, 4);
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
    const entry: McpAutowireDiscoverySearch = {
      query,
      status: "blocked",
      source: "github-tree",
      reason: "Source search discovery was not granted.",
    };
    context.searches.push(entry);
    return JSON.stringify(entry);
  }
  if (!context.target.github) {
    const entry: McpAutowireDiscoverySearch = {
      query,
      status: "blocked",
      source: "github-tree",
      reason: "Source search is currently supported only for GitHub repositories.",
    };
    context.searches.push(entry);
    return JSON.stringify(entry);
  }
  if (
    context.searches.filter((search) => search.status === "searched" || search.status === "failed").length >= context.grants.maxSearches
  ) {
    const entry: McpAutowireDiscoverySearch = {
      query,
      status: "blocked",
      source: "github-tree",
      reason: `Search budget exhausted at ${context.grants.maxSearches} search(es).`,
    };
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
    const results = rankGitHubTreeSearchResults({ owner, repo, branch: defaultBranch, query, tree, limit });
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

function githubRepoFromUrl(url: URL): McpAutowireTarget["github"] | undefined {
  if (url.hostname.toLowerCase() !== "github.com") return undefined;
  const [owner, repoRaw, pathKind, branch, ...pathParts] = decodeURIComponent(url.pathname).split("/").filter(Boolean);
  if (!owner || !repoRaw) return undefined;
  const repo = repoRaw.replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return undefined;
  const subpath = githubTargetSubpath(pathKind, branch, pathParts);
  return { owner, repo, ...subpath };
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

function autowireUrlAllowed(
  value: string,
  target: McpAutowireTarget,
  grants: Required<McpAutowireDiscoveryGrants>,
): { allowed: true } | { allowed: false; reason: string } {
  if (!grants.urlFetch) return { allowed: false, reason: "URL fetch discovery was not granted." };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { allowed: false, reason: "Invalid URL." };
  }
  if (url.protocol !== "https:") return { allowed: false, reason: "Only HTTPS URLs are allowed." };
  if (url.username || url.password) return { allowed: false, reason: "URLs with credentials are blocked." };
  if (url.search && /(?:token|key|secret|password|auth)/i.test(url.search))
    return { allowed: false, reason: "Credential-like URL query parameters are blocked." };
  if (!target.github) {
    if (target.package && packageRegistryMetadataUrl(target.package) === url.toString()) return { allowed: true };
    return sameOriginPath(url, target.url)
      ? { allowed: true }
      : { allowed: false, reason: "Only the target package metadata URL or target URL origin/path is allowed for non-GitHub targets." };
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
    throw new Error(`Invalid JSON from ${url}: ${errorMessage(error)}`, { cause: error });
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
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9_.-]+/)
    .filter((token) => token.length >= 2);
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
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
