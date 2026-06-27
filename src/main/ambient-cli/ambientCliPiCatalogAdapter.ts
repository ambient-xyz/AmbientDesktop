import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { ambientRuntimeEnv } from "./ambientCliSetupFacade";
import { hardenedGitEnv, normalizeGitRepositoryUrl, safeGitCloneSource } from "./ambientCliSecurityFacade";

const execFileAsync = promisify(execFile);

export interface AmbientCliPiCatalogResolution {
  source: string;
  npmPackageName: string;
  npmVersion: string;
  repositoryUrl: string;
  repositoryDirectory: string;
  sha: string;
  adapter: "pi-arxiv" | "youtube-transcript" | "brave-search";
  installDependencies?: boolean;
  securityScan: string[];
}

interface NpmPackageMetadata {
  "dist-tags"?: {
    latest?: unknown;
  };
  versions?: Record<
    string,
    | {
        repository?: unknown;
        gitHead?: unknown;
      }
    | undefined
  >;
  repository?: unknown;
}

function gitEnv(): NodeJS.ProcessEnv {
  return hardenedGitEnv(ambientRuntimeEnv(process.env, { GIT_TERMINAL_PROMPT: "0" }));
}

export async function resolvePiCatalogCliAdapter(source: string): Promise<AmbientCliPiCatalogResolution> {
  const githubAdapter = resolveGithubCliAdapter(source);
  if (githubAdapter) return githubAdapter;

  const npmPackageName = piCatalogNpmPackageName(source);
  if (npmPackageName !== "pi-arxiv") {
    throw new Error(`No Ambient CLI adapter is currently available for Pi package "${npmPackageName}".`);
  }
  const metadata = await fetchNpmPackageMetadata(npmPackageName);
  const latest = metadata["dist-tags"]?.latest;
  if (typeof latest !== "string" || !latest) throw new Error(`npm package "${npmPackageName}" does not declare a latest version.`);
  const version = metadata.versions?.[latest];
  if (!version) throw new Error(`npm package "${npmPackageName}" metadata is missing version "${latest}".`);
  const repository = normalizeNpmRepository(version.repository ?? metadata.repository);
  if (!repository.url || !repository.directory)
    throw new Error(`npm package "${npmPackageName}" does not declare a Git repository directory.`);
  const sha = typeof version.gitHead === "string" && version.gitHead.trim() ? version.gitHead.trim() : await resolveGitHead(repository.url);
  return {
    source,
    npmPackageName,
    npmVersion: latest,
    repositoryUrl: repository.url,
    repositoryDirectory: repository.directory,
    sha,
    adapter: "pi-arxiv",
    securityScan: [
      "Resolved from pi.dev catalog URL to npm package pi-arxiv@0.1.0 and GitHub repository nicehiro/dotfiles.",
      "Package source is a small TypeScript Pi extension registering arxiv_search and arxiv_paper.",
      "No filesystem, process, shell, secret, or write APIs were found in the reviewed extension source.",
      "Network access is limited by the reviewed source to arXiv metadata lookup; the upstream uses the public arXiv export endpoint.",
      "Ambient installs a first-party adapter file instead of executing the upstream TypeScript extension directly.",
    ],
  };
}

function resolveGithubCliAdapter(source: string): AmbientCliPiCatalogResolution | undefined {
  const trimmed = source.trim();
  if (!trimmed) throw new Error("Pi catalog source is required.");
  try {
    const url = new URL(trimmed);
    if (url.hostname !== "github.com") return undefined;
    const parts = url.pathname.split("/").filter(Boolean);
    const [owner, repo] = parts;
    if (owner !== "badlogic" || repo !== "pi-skills") return undefined;
    const youtubeTranscriptIndex = parts.indexOf("youtube-transcript");
    if (youtubeTranscriptIndex !== -1) return youtubeTranscriptResolution(source);
    const braveSearchIndex = parts.indexOf("brave-search");
    if (braveSearchIndex !== -1) return braveSearchResolution(source);
    return undefined;
  } catch {
    return undefined;
  }
}

function youtubeTranscriptResolution(source: string): AmbientCliPiCatalogResolution {
  return {
    source,
    npmPackageName: "youtube-transcript",
    npmVersion: "1.0.0",
    repositoryUrl: "https://github.com/badlogic/pi-skills",
    repositoryDirectory: "youtube-transcript",
    sha: "75d32a382b0c8aafce356d68e17d2dc94c0c953b",
    adapter: "youtube-transcript",
    installDependencies: true,
    securityScan: [
      "Resolved from badlogic/pi-skills youtube-transcript to a pinned GitHub repository subdirectory.",
      "Package source is a small Node script that calls youtube-transcript-plus and prints timestamped captions.",
      "No filesystem, process, shell, secret, or write APIs were found in the reviewed script source.",
      "Network access is limited by the reviewed source and dependency purpose to fetching YouTube caption transcript data.",
      "Ambient installs the upstream script with a first-party descriptor and skill prompt instead of executing arbitrary extension hooks.",
    ],
  };
}

function braveSearchResolution(source: string): AmbientCliPiCatalogResolution {
  return {
    source,
    npmPackageName: "brave-search",
    npmVersion: "1.0.0",
    repositoryUrl: "https://github.com/badlogic/pi-skills",
    repositoryDirectory: "brave-search",
    sha: "75d32a382b0c8aafce356d68e17d2dc94c0c953b",
    adapter: "brave-search",
    securityScan: [
      "Resolved from badlogic/pi-skills brave-search to a pinned GitHub repository subdirectory.",
      "Package source is a Node script that calls the official Brave Search API and can optionally fetch page content.",
      "Ambient installs a first-party search-only adapter instead of executing arbitrary extension hooks or shell profile setup.",
      "Secret access is limited to the declared BRAVE_API_KEY env binding managed by Ambient CLI.",
      "Network access is limited by the reviewed adapter to api.search.brave.com.",
    ],
  };
}

function piCatalogNpmPackageName(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) throw new Error("Pi catalog source is required.");
  if (trimmed.startsWith("npm:")) return trimmed.slice("npm:".length).trim();
  try {
    const url = new URL(trimmed);
    if (url.hostname === "pi.dev" && url.pathname.startsWith("/packages/")) {
      const packageName = url.pathname.split("/").filter(Boolean)[1];
      if (packageName) return packageName;
    }
  } catch {
    // Fall through to bare npm package support.
  }
  return trimmed;
}

async function fetchNpmPackageMetadata(packageName: string): Promise<NpmPackageMetadata> {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
  if (!response.ok) throw new Error(`Failed to fetch npm metadata for "${packageName}": HTTP ${response.status}.`);
  return response.json() as Promise<NpmPackageMetadata>;
}

function normalizeNpmRepository(value: unknown): { url?: string; directory?: string } {
  if (typeof value === "string") return { url: normalizeGitUrl(value) };
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.url === "string" ? { url: normalizeGitUrl(record.url) } : {}),
    ...(typeof record.directory === "string" ? { directory: record.directory } : {}),
  };
}

function normalizeGitUrl(value: string): string {
  return normalizeGitRepositoryUrl(value);
}

async function resolveGitHead(source: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["ls-remote", "--", safeGitCloneSource(source), "HEAD"], {
    timeout: 30_000,
    env: gitEnv(),
    maxBuffer: 1024 * 1024,
  });
  const sha = String(stdout).trim().split(/\s+/)[0];
  if (!sha) throw new Error(`Unable to resolve Git HEAD for ${source}.`);
  return sha;
}

export function piCatalogAdapterDescriptor(resolution: AmbientCliPiCatalogResolution): unknown {
  if (resolution.adapter === "brave-search") {
    return {
      name: "brave-search",
      version: resolution.npmVersion,
      description: "Ambient CLI adapter for Brave Search API queries.",
      skills: "./SKILL.md",
      env: [{ name: "BRAVE_API_KEY", description: "Brave Search API key.", required: true }],
      commands: {
        search: {
          command: "node",
          args: ["./ambient-brave-search-cli.mjs", "search"],
          description: "Search the web through the Brave Search API.",
          cwd: "package",
          healthCheck: ["node", "./ambient-brave-search-cli.mjs", "health"],
        },
      },
    };
  }
  if (resolution.adapter === "youtube-transcript") {
    return {
      name: "youtube-transcript",
      version: resolution.npmVersion,
      description: "Ambient CLI adapter for fetching YouTube transcripts.",
      skills: "./SKILL.md",
      env: [],
      commands: {
        youtube_transcript: {
          command: "node",
          args: ["./transcript.js"],
          description: "Fetch timestamped transcript entries for a YouTube video ID or URL.",
          cwd: "package",
          healthCheck: ["node", "--input-type=module", "-e", "await import('youtube-transcript-plus'); console.log('ok');"],
        },
      },
    };
  }

  return {
    name: "pi-arxiv",
    version: resolution.npmVersion,
    description: "Ambient CLI adapter for the Pi arXiv search package.",
    skills: "./SKILL.md",
    env: [],
    commands: {
      arxiv_search: {
        command: "node",
        args: ["./ambient-arxiv-cli.mjs", "search"],
        description: "Search arXiv papers by query, category, sort order, and result count.",
        cwd: "package",
        healthCheck: ["node", "./ambient-arxiv-cli.mjs", "health"],
      },
      arxiv_paper: {
        command: "node",
        args: ["./ambient-arxiv-cli.mjs", "paper"],
        description: "Fetch details for a specific arXiv paper ID or URL.",
        cwd: "package",
        healthCheck: ["node", "./ambient-arxiv-cli.mjs", "health"],
      },
    },
  };
}

export async function writePiCatalogAdapterFiles(packageRoot: string, resolution: AmbientCliPiCatalogResolution): Promise<void> {
  if (resolution.adapter === "brave-search") {
    await writeFile(join(packageRoot, "ambient-brave-search-cli.mjs"), braveSearchAdapterScript, "utf8");
    await writeFile(join(packageRoot, "SKILL.md"), braveSearchSkillMarkdown(resolution), "utf8");
    return;
  }
  if (resolution.adapter === "youtube-transcript") {
    await writeFile(join(packageRoot, "package-lock.json"), youtubeTranscriptPackageLock, "utf8");
    await writeFile(join(packageRoot, "SKILL.md"), youtubeTranscriptSkillMarkdown(resolution), "utf8");
    return;
  }
  if (resolution.adapter !== "pi-arxiv") throw new Error(`Unsupported Pi catalog adapter: ${resolution.adapter}`);
  await writeFile(join(packageRoot, "ambient-arxiv-cli.mjs"), piArxivAdapterScript, "utf8");
  await writeFile(join(packageRoot, "SKILL.md"), piArxivSkillMarkdown(resolution), "utf8");
}

function braveSearchSkillMarkdown(resolution: AmbientCliPiCatalogResolution): string {
  return `---
name: brave-search
description: Search the web through Brave Search API via Ambient CLI.
---

Use this skill when the user asks to search the web through the reviewed Brave Search Pi skill installed from ${resolution.source}.

Command:
- Use ambient_cli with packageName "brave-search" and command "search". Pass the query as the first arg. Optional flags: -n for result count, --country for country code, and --freshness for Brave-supported freshness filters.

Secret:
- The command requires BRAVE_API_KEY. Use Ambient-managed env binding or secret request tools; never ask the user to paste the key in chat.

Examples:
- ambient_cli packageName="brave-search" command="search" args=["Ambient Desktop install routing", "-n", "2"]
- ambient_cli packageName="brave-search" command="search" args=["site:docs.ambient.xyz workflow agents", "--country", "US"]

Output:
- The command returns one JSON object with provider, host, query, resultCount, and a bounded results array.
- Base summaries on returned result titles, links, snippets, and ages without inventing missing content.
`;
}

const braveSearchAdapterScript = `const args = process.argv.slice(2);
const mode = args.shift();

if (mode === "health") {
  console.log("ok");
  process.exit(0);
}

if (mode !== "search") {
  console.error("Usage: ambient-brave-search-cli.mjs search <query> [-n count] [--country code] [--freshness period]");
  process.exit(1);
}

let count = 5;
let country = "US";
let freshness;
const queryParts = [];
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "-n" && args[index + 1]) {
    count = Math.max(1, Math.min(20, Number.parseInt(args[index + 1], 10) || 5));
    index += 1;
    continue;
  }
  if (arg === "--country" && args[index + 1]) {
    country = args[index + 1].toUpperCase();
    index += 1;
    continue;
  }
  if (arg === "--freshness" && args[index + 1]) {
    freshness = args[index + 1];
    index += 1;
    continue;
  }
  queryParts.push(arg);
}

const query = queryParts.join(" ").trim();
if (!query) {
  console.error("Brave Search query is required.");
  process.exit(1);
}

const apiKey = process.env.BRAVE_API_KEY;
if (!apiKey) {
  console.error("BRAVE_API_KEY is required. Bind it through Ambient-managed secret tools.");
  process.exit(1);
}

const params = new URLSearchParams({ q: query, count: String(count), country });
if (freshness) params.set("freshness", freshness);

const response = await fetch(\`https://api.search.brave.com/res/v1/web/search?\${params.toString()}\`, {
  headers: {
    Accept: "application/json",
    "Accept-Encoding": "gzip",
    "X-Subscription-Token": apiKey,
  },
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(\`Brave Search HTTP \${response.status}: \${body.slice(0, 300)}\`);
}

const data = await response.json();
const results = (data.web?.results ?? []).slice(0, count).map((item, index) => ({
  rank: index + 1,
  title: item.title ?? "",
  link: item.url ?? "",
  snippet: item.description ?? "",
  age: item.age ?? item.page_age ?? "",
}));

console.log(JSON.stringify({ provider: "brave-search", host: "api.search.brave.com", query, resultCount: results.length, results }, null, 2));
`;

function youtubeTranscriptSkillMarkdown(resolution: AmbientCliPiCatalogResolution): string {
  return `---
name: youtube-transcript
description: Fetch transcripts from YouTube videos through Ambient CLI.
---

Use this skill when the user asks to fetch, summarize, analyze, quote, or save a transcript from a YouTube video.

Command:
- Use ambient_cli with packageName "youtube-transcript" and command "youtube_transcript". Pass the YouTube video ID or URL as the first arg.

Examples:
- ambient_cli packageName="youtube-transcript" command="youtube_transcript" args=["EBw7gsDPAYQ"]
- ambient_cli packageName="youtube-transcript" command="youtube_transcript" args=["https://www.youtube.com/watch?v=EBw7gsDPAYQ"]

Output:
- The command returns timestamped transcript entries like "[0:00] caption text".
- If the user asks for a summary or analysis, base it on the returned transcript without inventing missing content.
- If captions are unavailable, report that the transcript could not be fetched.

Source:
- Installed from ${resolution.source}
`;
}

const youtubeTranscriptPackageLock = `{
  "name": "youtube-transcript",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "youtube-transcript",
      "version": "1.0.0",
      "dependencies": {
        "youtube-transcript-plus": "^1.0.4"
      }
    },
    "node_modules/youtube-transcript-plus": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/youtube-transcript-plus/-/youtube-transcript-plus-1.2.0.tgz",
      "integrity": "sha512-SRjVft8V+vUulMKgakgfzC+pnFLSy4tolX7xGnSvp9juUNocikMFmUx5GlhzLDILzxYrijcYtmNqz0qyklnPmA==",
      "license": "MIT",
      "engines": {
        "node": ">=18.0.0"
      }
    }
  }
}
`;

function piArxivSkillMarkdown(resolution: AmbientCliPiCatalogResolution): string {
  return `---
name: pi-arxiv
description: Search arXiv papers and fetch paper details through Ambient CLI.
---

Use this skill when the user asks to search arXiv, find papers, look up an arXiv ID, or use the Pi arXiv package installed from ${resolution.source}.

Commands:
- Use ambient_cli with packageName "pi-arxiv" and command "arxiv_search" to search. Pass the query as the first arg. Optional flags: --category, --max-results, --sort-by, --start.
- Use ambient_cli with packageName "pi-arxiv" and command "arxiv_paper" to fetch one paper. Pass the arXiv ID or arXiv URL as the first arg.

Examples:
- ambient_cli packageName="pi-arxiv" command="arxiv_search" args=["diffusion policy robotics", "--max-results", "5", "--sort-by", "relevance"]
- ambient_cli packageName="pi-arxiv" command="arxiv_paper" args=["2303.04137"]
`;
}

const piArxivAdapterScript = `const ARXIV_API = "http://export.arxiv.org/api/query";

const args = process.argv.slice(2);
const mode = args.shift();

if (mode === "health") {
  console.log("ok");
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  if (mode === "search") {
    const parsed = parseSearchArgs(args);
    const searchQuery = parsed.category ? "cat:" + parsed.category + " AND " + parsed.query : parsed.query;
    const url = ARXIV_API + "?search_query=" + encodeURIComponent(searchQuery)
      + "&start=" + parsed.start
      + "&max_results=" + parsed.maxResults
      + "&sortBy=" + encodeURIComponent(parsed.sortBy)
      + "&sortOrder=descending";
    const xml = await fetchArxiv(url);
    const feed = parseFeed(xml);
    console.log("Found " + feed.totalResults + " total results. Showing " + feed.papers.length + ".\\n");
    console.log(feed.papers.map(formatPaper).join("\\n\\n"));
    return;
  }
  if (mode === "paper") {
    const id = normalizeArxivId(args[0]);
    if (!id) throw new Error("Usage: arxiv_paper <arxiv-id-or-url>");
    const xml = await fetchArxiv(ARXIV_API + "?id_list=" + encodeURIComponent(id));
    const feed = parseFeed(xml);
    if (!feed.papers.length) throw new Error("No paper found for arXiv ID " + id + ".");
    console.log(formatPaper(feed.papers[0]));
    return;
  }
  throw new Error("Usage: ambient-arxiv-cli.mjs <health|search|paper> ...");
}

function parseSearchArgs(values) {
  const flags = { maxResults: 10, sortBy: "relevance", start: 0 };
  const queryParts = [];
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value === "--category") flags.category = requireNext(values, ++i, value);
    else if (value === "--max-results" || value === "-n") flags.maxResults = clampInt(requireNext(values, ++i, value), 1, 50);
    else if (value === "--sort-by") flags.sortBy = normalizeSortBy(requireNext(values, ++i, value));
    else if (value === "--start") flags.start = Math.max(0, clampInt(requireNext(values, ++i, value), 0, 100000));
    else queryParts.push(value);
  }
  const query = queryParts.join(" ").trim();
  if (!query) throw new Error("Usage: arxiv_search <query> [--category cs.RO] [--max-results 10] [--sort-by relevance|lastUpdatedDate|submittedDate] [--start 0]");
  return { ...flags, query };
}

function requireNext(values, index, flag) {
  const value = values[index];
  if (!value || value.startsWith("--")) throw new Error("Missing value for " + flag + ".");
  return value;
}

function clampInt(value, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeSortBy(value) {
  if (["relevance", "lastUpdatedDate", "submittedDate"].includes(value)) return value;
  throw new Error("Invalid --sort-by value. Use relevance, lastUpdatedDate, or submittedDate.");
}

function normalizeArxivId(value) {
  return String(value ?? "").trim().replace(/^https?:\\/\\/arxiv\\.org\\/abs\\//, "").replace(/^arxiv:/, "");
}

async function fetchArxiv(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "AmbientDesktop/0.1.11 (https://ambient.xyz)" },
    });
    if (response.status === 429) throw new Error("arXiv API rate limit exceeded. Retry later, narrow the query, or use arxiv_paper with a known arXiv ID.");
    if (!response.ok) throw new Error("arXiv API request failed: HTTP " + response.status);
    return response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("arXiv API request timed out after 20 seconds.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseFeed(xml) {
  const entries = matchAll(xml, /<entry>([\\s\\S]*?)<\\/entry>/g).map((entry) => parseEntry(entry));
  const total = textOf(xml, "opensearch:totalResults") || String(entries.length);
  return { papers: entries, totalResults: Number.parseInt(total, 10) || entries.length };
}

function parseEntry(xml) {
  const id = textOf(xml, "id").replace("http://arxiv.org/abs/", "");
  const title = normalizeSpace(textOf(xml, "title"));
  const abstract = normalizeSpace(textOf(xml, "summary"));
  const authors = matchAll(xml, /<author>[\\s\\S]*?<name>([\\s\\S]*?)<\\/name>[\\s\\S]*?<\\/author>/g).map(decodeXml);
  const categories = matchAll(xml, /<category[^>]*term="([^"]+)"/g).map(decodeXml);
  const primaryCategory = attrOf(xml, /<arxiv:primary_category[^>]*term="([^"]+)"/) || categories[0] || "";
  const pdfUrl = attrOf(xml, /<link[^>]*title="pdf"[^>]*href="([^"]+)"/) || "https://arxiv.org/pdf/" + id;
  const absUrl = attrOf(xml, /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) || "https://arxiv.org/abs/" + id;
  return {
    id,
    title,
    authors,
    abstract,
    published: textOf(xml, "published"),
    updated: textOf(xml, "updated"),
    categories,
    primaryCategory,
    pdfUrl,
    absUrl,
    comment: textOf(xml, "arxiv:comment"),
    journalRef: textOf(xml, "arxiv:journal_ref"),
  };
}

function formatPaper(paper, index) {
  const lines = [
    (index === undefined ? "" : "[" + (index + 1) + "] ") + paper.title,
    "    ID: " + paper.id,
    "    Authors: " + paper.authors.join(", "),
    "    Published: " + paper.published + (paper.updated && paper.updated !== paper.published ? " | Updated: " + paper.updated : ""),
    "    Categories: " + paper.categories.join(", "),
    "    PDF: " + paper.pdfUrl,
    "    Abstract: " + paper.abstract,
  ];
  if (paper.comment) lines.push("    Comment: " + paper.comment);
  if (paper.journalRef) lines.push("    Journal: " + paper.journalRef);
  return lines.join("\\n");
}

function textOf(xml, tagName) {
  const match = xml.match(new RegExp("<" + tagName + "[^>]*>([\\\\s\\\\S]*?)<\\\\/" + tagName + ">"));
  return match ? decodeXml(match[1]) : "";
}

function attrOf(xml, pattern) {
  const match = xml.match(pattern);
  return match ? decodeXml(match[1]) : "";
}

function matchAll(value, pattern) {
  return Array.from(value.matchAll(pattern), (match) => match[1]);
}

function normalizeSpace(value) {
  return value.replace(/\\s+/g, " ").trim();
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}
`;
