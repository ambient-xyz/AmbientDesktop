import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { promisify } from "node:util";
import type { ProjectBoardSourceKind } from "../../shared/types";
import type { ProjectBoardSourceInput, ProjectStore } from "../projectStore/projectStore";
import {
  DURABLE_PLAN_SOURCE_AUTHORITY_REASON,
  GENERATED_REPORT_SOURCE_AUTHORITY_REASON,
  GENERATED_WORKFLOW_SOURCE_AUTHORITY_REASON,
  hashProjectBoardSourceContent,
  projectBoardSourceClassificationDefaults,
  projectBoardSourceContentHash,
  projectBoardSourceKey,
} from "./projectBoardSourceIdentity";

const execFileAsync = promisify(execFile);
const MAX_MARKDOWN_SOURCES = 32;
const MAX_CONFIG_SOURCES = 16;
const MAX_STRUCTURED_DATA_SOURCES = 12;
const MAX_SOURCE_BYTES = 64_000;
const MAX_SOURCE_EXCERPT_CHARS = 20_000;
const IGNORED_NAMES = new Set([
  ".ambient-codex",
  ".git",
  ".turbo",
  ".vite",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "release",
  "test-results",
]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdown", ".mkd"]);
const CONFIG_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".json", ".mjs", ".mts", ".ts", ".tsx", ".yaml", ".yml"]);
const STRUCTURED_DATA_EXTENSIONS = new Set([".csv", ".tsv"]);

function shouldIgnoreProjectBoardSourceEntry(root: string, absolutePath: string, name: string): boolean {
  if (IGNORED_NAMES.has(name)) return true;
  const path = relative(root, absolutePath).replace(/\\/g, "/");
  return path === ".ambient" || path.startsWith(".ambient/");
}

export async function scanProjectBoardSources(store: ProjectStore, options: { workspacePath?: string; threadId?: string } = {}): Promise<ProjectBoardSourceInput[]> {
  const workspacePath = options.workspacePath ?? store.getWorkspace().path;
  const threads = store.listThreads();
  const automationThreadIds = new Set(store.listAutomationThreadChatIds());
  const scopedThreadId = options.threadId?.trim();
  const threadSources: ProjectBoardSourceInput[] = [];
  const planSources: ProjectBoardSourceInput[] = [];
  let durablePlanPrimaryAvailable = false;

  for (const thread of threads.filter((thread) => !automationThreadIds.has(thread.id) && (!scopedThreadId || thread.id === scopedThreadId))) {
    const messages = store.listMessages(thread.id);
    const latestMessage = [...messages].reverse().find((message) => message.role === "user" || message.role === "assistant");
    const threadExcerpt = sourceExcerpt(
      messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .slice(-8)
        .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
        .join("\n\n"),
      8_000,
    );
    const threadHash = hashProjectBoardSourceContent(
      messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => `${message.id}\0${message.role}\0${message.content}`)
        .join("\n"),
    );
    const threadSource = {
      kind: "thread" as const,
      title: thread.title,
      summary: thread.lastMessagePreview || summarizeText(latestMessage?.content ?? "") || "Thread has no substantive messages yet.",
      excerpt: threadExcerpt,
      threadId: thread.id,
      messageId: latestMessage?.id,
      contentHash: threadHash,
      byteSize: Buffer.byteLength(threadExcerpt, "utf8"),
      relevance: messages.length > 0 ? 70 : 35,
    };
    threadSources.push({
      ...threadSource,
      sourceKey: projectBoardSourceKey(threadSource),
      ...projectBoardSourceClassificationDefaults({
        kind: threadSource.kind,
        relevance: threadSource.relevance,
        summary: "Thread conversation context.",
      }),
    });

    for (const artifact of store.listPlannerPlanArtifacts(thread.id)) {
      const durablePlanContent =
        artifact.durableArtifactPath && artifact.durableArtifactPath.replace(/\\/g, "/").startsWith(".ambient/board/plans/")
          ? await readFile(join(workspacePath, artifact.durableArtifactPath), "utf8").catch(() => undefined)
          : undefined;
      durablePlanPrimaryAvailable ||= Boolean(durablePlanContent) || artifact.workflowState === "durable_ready" || artifact.workflowState === "durable_ready_with_fallbacks";
      const sourceContent = durablePlanContent ?? artifact.content;
      const excerpt = durablePlanContent ? durablePlanSemanticSourceExcerpt(durablePlanContent, artifact.content) : sourceExcerpt(sourceContent);
      const artifactSource = {
        kind: "plan_artifact" as const,
        title: artifact.title,
        summary: artifact.summary || summarizeText(artifact.content) || "Planner artifact without summary.",
        excerpt,
        path: artifact.durableArtifactPath,
        threadId: artifact.threadId,
        artifactId: artifact.id,
        messageId: artifact.sourceMessageId,
        contentHash: hashProjectBoardSourceContent(sourceContent),
        byteSize: Buffer.byteLength(sourceContent, "utf8"),
        relevance: artifact.status === "ready" ? 95 : 72,
      };
      planSources.push({
        ...artifactSource,
        sourceKey: projectBoardSourceKey(artifactSource),
        ...projectBoardSourceClassificationDefaults({
          kind: artifactSource.kind,
          relevance: artifactSource.relevance,
          summary: "Planner plan artifact.",
        }),
      });
    }
  }

  const markdownSources = await scanMarkdownSources(workspacePath);
  const configSources = await scanProjectConfigSources(workspacePath);
  const structuredDataSources = await scanProjectStructuredDataSources(workspacePath);
  const gitSource = await scanProjectGitStateSource(workspacePath);
  const scannedProjectSources = [...markdownSources, ...configSources, ...structuredDataSources, ...(gitSource ? [gitSource] : [])];
  const governedProjectSources = durablePlanPrimaryAvailable
    ? scannedProjectSources.map((source) =>
        projectBoardSourceIgnoredByDurablePlan(
          source,
          "project source ignored by default because a durable planner artifact is available. Promote this source only if it should expand the board scope.",
        ),
      )
    : scannedProjectSources;
  const governedThreadSources = durablePlanPrimaryAvailable
    ? threadSources.map((source) =>
        projectBoardSourceIgnoredByDurablePlan(
          source,
          "chat thread ignored by default because a durable planner artifact is available. Re-enable this chat only if it contains newer or missing intent.",
        ),
      )
    : threadSources;
  return dedupeSources([...planSources, ...governedProjectSources, ...governedThreadSources]);
}

function projectBoardSourceIgnoredByDurablePlan(source: ProjectBoardSourceInput, reason: string): ProjectBoardSourceInput {
  const previousReason = source.classificationReason?.trim();
  return {
    ...source,
    authorityRole: "ignored",
    includeInSynthesis: false,
    classificationConfidence: Math.max(source.classificationConfidence ?? 0, 0.9),
    classificationReason: `${DURABLE_PLAN_SOURCE_AUTHORITY_REASON}; ${reason}${previousReason ? ` Previous classification: ${previousReason}` : ""}`,
  };
}

export async function scanMarkdownSources(workspacePath: string): Promise<ProjectBoardSourceInput[]> {
  const paths: string[] = [];
  await walkMarkdown(workspacePath, workspacePath, paths, 0);
  const sources: ProjectBoardSourceInput[] = [];
  for (const path of paths.slice(0, MAX_MARKDOWN_SOURCES)) {
    const absolute = join(workspacePath, path);
    const content = await readFile(absolute, "utf8").catch(() => "");
    const fileStat = await stat(absolute).catch(() => undefined);
    const classification = classifyProjectBoardSourcePath(path, content);
    const generatedWorkflowScaffold = isGeneratedWorkflowScaffoldingSource(path, content);
    const generatedReportArtifact = !generatedWorkflowScaffold && isGeneratedReportArtifactSource(path, content);
    const source = {
      kind: generatedReportArtifact ? ("report_artifact" as const) : classification.kind,
      title: markdownTitle(path, content),
      summary: summarizeText(content) || (generatedReportArtifact ? "Generated report artifact." : classification.summary),
      excerpt: sourceExcerpt(content),
      path,
      contentHash: hashProjectBoardSourceContent(content),
      byteSize: fileStat?.size,
      mtime: fileStat?.mtime.toISOString(),
      relevance: generatedReportArtifact ? 78 : classification.relevance,
    };
    sources.push({
      ...source,
      sourceKey: projectBoardSourceKey(source),
      ...(generatedWorkflowScaffold
        ? {
            classifiedBy: "fallback_heuristic" as const,
            classificationConfidence: 0.95,
            classificationReason: `${GENERATED_WORKFLOW_SOURCE_AUTHORITY_REASON}: ${path}. Use the visible source review promotion control if this generated workflow is intended to become planning input.`,
            authorityRole: "ignored" as const,
            includeInSynthesis: false,
          }
        : generatedReportArtifact
          ? {
              classifiedBy: "fallback_heuristic" as const,
              classificationConfidence: 0.92,
              classificationReason: `${GENERATED_REPORT_SOURCE_AUTHORITY_REASON}: ${path}. Use the visible source review promotion control if this generated report should drive Add Cards.`,
              authorityRole: "ignored" as const,
              includeInSynthesis: false,
            }
        : projectBoardSourceClassificationDefaults({
            kind: source.kind,
            relevance: source.relevance,
            summary: classification.summary,
          })),
    });
  }
  return sources;
}

export async function scanProjectConfigSources(workspacePath: string): Promise<ProjectBoardSourceInput[]> {
  const paths: string[] = [];
  await walkConfigSources(workspacePath, workspacePath, paths, 0);
  const sources: ProjectBoardSourceInput[] = [];
  for (const path of paths.slice(0, MAX_CONFIG_SOURCES)) {
    const absolute = join(workspacePath, path);
    const content = await readFile(absolute, "utf8").catch(() => "");
    const fileStat = await stat(absolute).catch(() => undefined);
    const classification = classifyProjectBoardConfigPath(path, content);
    if (!classification) continue;
    const source = {
      kind: classification.kind,
      title: configTitle(path, content),
      summary: summarizeConfigSource(path, content, classification.summary),
      excerpt: sourceExcerpt(content, 8_000),
      path,
      contentHash: hashProjectBoardSourceContent(content),
      byteSize: fileStat?.size,
      mtime: fileStat?.mtime.toISOString(),
      relevance: classification.relevance,
    };
    sources.push({
      ...source,
      sourceKey: projectBoardSourceKey(source),
      ...projectBoardSourceClassificationDefaults({
        kind: source.kind,
        relevance: source.relevance,
        summary: classification.summary,
      }),
    });
  }
  return sources;
}

export async function scanProjectStructuredDataSources(workspacePath: string): Promise<ProjectBoardSourceInput[]> {
  const paths: string[] = [];
  await walkStructuredDataSources(workspacePath, workspacePath, paths, 0);
  const sources: ProjectBoardSourceInput[] = [];
  for (const path of paths.slice(0, MAX_STRUCTURED_DATA_SOURCES)) {
    const absolute = join(workspacePath, path);
    const content = await readFile(absolute, "utf8").catch(() => "");
    const fileStat = await stat(absolute).catch(() => undefined);
    const source = {
      kind: "functional_spec" as const,
      title: structuredDataTitle(path),
      summary: summarizeStructuredDataSource(path, content),
      excerpt: sourceExcerpt(content, 8_000),
      path,
      contentHash: hashProjectBoardSourceContent(content),
      byteSize: fileStat?.size,
      mtime: fileStat?.mtime.toISOString(),
      relevance: 74,
    };
    sources.push({
      ...source,
      sourceKey: projectBoardSourceKey(source),
      ...projectBoardSourceClassificationDefaults({
        kind: source.kind,
        relevance: source.relevance,
        summary: "Structured data input or fixture that may define implementation behavior.",
      }),
    });
  }
  return sources;
}

export async function scanProjectGitStateSource(workspacePath: string): Promise<ProjectBoardSourceInput | undefined> {
  const inside = await gitOutput(workspacePath, ["rev-parse", "--is-inside-work-tree"]);
  if (inside?.trim() !== "true") return undefined;
  const [branch, lastCommit, rawStatus] = await Promise.all([
    gitOutput(workspacePath, ["branch", "--show-current"]),
    gitOutput(workspacePath, ["log", "-1", "--pretty=%h %s"]),
    gitOutput(workspacePath, ["status", "--short"]),
  ]);
  const status = rawStatus ? await filterGeneratedLocalTaskWorkflowStatus(workspacePath, rawStatus) : rawStatus;
  const summary = summarizeGitState(branch, lastCommit, status);
  const source = {
    kind: "git_state" as const,
    title: "Git working tree",
    summary,
    relevance: status?.trim() ? 78 : 70,
  };
  return {
    ...source,
    sourceKey: projectBoardSourceKey(source),
    contentHash: projectBoardSourceContentHash(source),
    byteSize: Buffer.byteLength(summary, "utf8"),
    ...projectBoardSourceClassificationDefaults({
      kind: source.kind,
      relevance: source.relevance,
      summary: "Current Git branch, last commit, and working-tree status.",
    }),
  };
}

export function classifyProjectBoardSourcePath(path: string, content = ""): {
  kind: ProjectBoardSourceKind;
  relevance: number;
  summary: string;
} {
  const normalized = path.toLowerCase();
  const haystack = `${normalized}\n${content.slice(0, 4000).toLowerCase()}`;
  if (
    normalized.endsWith("workflow.md") ||
    normalized.endsWith("agents.md") ||
    haystack.includes("agent notes") ||
    haystack.includes("workflow agent") ||
    haystack.includes("local task")
  ) {
    return { kind: "workflow_artifact", relevance: 88, summary: "Workflow, automation, or agent instructions." };
  }
  if (/(architecture|architectural|adr|design|system)/.test(haystack)) {
    return { kind: "architecture_artifact", relevance: 86, summary: "Architecture or system-design artifact." };
  }
  if (/(prd|requirements|functional|specification|user story|acceptance criteria)/.test(haystack)) {
    return { kind: "functional_spec", relevance: 84, summary: "Functional/specification artifact." };
  }
  if (/(implementation plan|phase|roadmap|milestone|todo|kanban)/.test(haystack)) {
    return { kind: "implementation_plan", relevance: 82, summary: "Implementation planning artifact." };
  }
  if (isReportArtifactPath(normalized) || /\b(health report|audit report|generated report|workspace report)\b/.test(haystack)) {
    return { kind: "report_artifact", relevance: 78, summary: "Report or generated analysis artifact." };
  }
  return { kind: "markdown", relevance: 58, summary: "Markdown project note." };
}

export function classifyProjectBoardConfigPath(path: string, content = ""): {
  kind: ProjectBoardSourceKind;
  relevance: number;
  summary: string;
} | undefined {
  const normalized = path.toLowerCase();
  const haystack = `${normalized}\n${content.slice(0, 4000).toLowerCase()}`;
  if (
    /(^|\/)(vitest|jest|playwright|cypress|karma|mocha)\.config\./.test(normalized) ||
    /(^|\/)(test|tests|e2e)\.config\./.test(normalized) ||
    normalized.startsWith(".github/workflows/")
  ) {
    return { kind: "test_artifact", relevance: 80, summary: "Test, browser, or CI proof configuration." };
  }
  if (
    /(^|\/)(package|tsconfig|jsconfig|vite|webpack|rollup|next|electron\.vite|eslint|prettier)\.config?\./.test(normalized) ||
    /(^|\/)(package\.json|tsconfig\.json|jsconfig\.json|vite\.config\.)/.test(normalized)
  ) {
    return { kind: "implementation_file", relevance: 76, summary: "Implementation or package configuration." };
  }
  if (/\b(test|spec|e2e|smoke|visual regression|playwright|vitest|jest)\b/.test(haystack)) {
    return { kind: "test_artifact", relevance: 80, summary: "Test, browser, or CI proof configuration." };
  }
  return undefined;
}

export function summarizeText(content: string, maxLength = 220): string {
  const cleaned = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^#{1,6}\s*/, "").trim())
    .filter((line) => line && !line.startsWith("---"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

export function sourceExcerpt(content: string, maxLength = MAX_SOURCE_EXCERPT_CHARS): string {
  const cleaned = content.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxLength) return cleaned;
  const headLength = Math.floor(maxLength * 0.72);
  const tailLength = Math.floor(maxLength * 0.2);
  const omitted = cleaned.length - headLength - tailLength;
  return [
    cleaned.slice(0, headLength).trim(),
    `[... ${omitted.toLocaleString()} characters omitted from middle of source ...]`,
    cleaned.slice(-tailLength).trim(),
  ].join("\n\n");
}

export function durablePlanSemanticSourceExcerpt(durablePlanHtml: string, fallbackContent = "", maxLength = MAX_SOURCE_EXCERPT_CHARS): string {
  const sourcePlan = durablePlanHtml.match(/<section\s+id=["']source-plan["'][\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/i)?.[1];
  if (sourcePlan) return sourceExcerpt(decodeDurablePlanHtml(stripDurablePlanHtml(sourcePlan)), maxLength);

  const executiveSummary = durablePlanHtml.match(/<section\s+id=["']executive-summary["'][\s\S]*?<\/section>/i)?.[0];
  if (executiveSummary) {
    const summary = decodeDurablePlanHtml(stripDurablePlanHtml(executiveSummary));
    const fallback = fallbackContent.trim();
    return sourceExcerpt([summary, fallback].filter(Boolean).join("\n\n"), maxLength);
  }

  return sourceExcerpt(fallbackContent.trim() || durablePlanHtml, maxLength);
}

function stripDurablePlanHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeDurablePlanHtml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function summarizeGitState(branch: string | undefined, lastCommit: string | undefined, status: string | undefined): string {
  const statusLines = status?.split(/\r?\n/g).filter((line) => line.trim()) ?? [];
  const changed = statusLines.slice(0, 8).map(gitStatusPath);
  const changeSummary =
    changed.length > 0
      ? `Changed files: ${changed.join(", ")}${statusLines.length > changed.length ? `, +${statusLines.length - changed.length} more` : ""}.`
      : "Working tree clean.";
  return [`Branch: ${branch?.trim() || "unknown"}.`, lastCommit?.trim() ? `Last commit: ${lastCommit.trim()}.` : "No commits found.", changeSummary].join(" ");
}

async function walkMarkdown(root: string, directory: string, paths: string[], depth: number): Promise<void> {
  if (paths.length >= MAX_MARKDOWN_SOURCES || depth > 5) return;
  let entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  entries = entries
    .filter((entry) => !shouldIgnoreProjectBoardSourceEntry(root, join(directory, entry.name), entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (paths.length >= MAX_MARKDOWN_SOURCES) return;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walkMarkdown(root, absolute, paths, depth + 1);
      continue;
    }
    if (!entry.isFile() || !MARKDOWN_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
    const fileStat = await stat(absolute).catch(() => undefined);
    if (!fileStat || fileStat.size > MAX_SOURCE_BYTES) continue;
    paths.push(relative(root, absolute));
  }
}

async function walkConfigSources(root: string, directory: string, paths: string[], depth: number): Promise<void> {
  if (paths.length >= MAX_CONFIG_SOURCES || depth > 4) return;
  let entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  entries = entries
    .filter((entry) => !shouldIgnoreProjectBoardSourceEntry(root, join(directory, entry.name), entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (paths.length >= MAX_CONFIG_SOURCES) return;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walkConfigSources(root, absolute, paths, depth + 1);
      continue;
    }
    if (!entry.isFile() || !CONFIG_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
    const relativePath = relative(root, absolute);
    if (!classifyProjectBoardConfigPath(relativePath)) continue;
    const fileStat = await stat(absolute).catch(() => undefined);
    if (!fileStat || fileStat.size > MAX_SOURCE_BYTES) continue;
    paths.push(relativePath);
  }
}

async function walkStructuredDataSources(root: string, directory: string, paths: string[], depth: number): Promise<void> {
  if (paths.length >= MAX_STRUCTURED_DATA_SOURCES || depth > 5) return;
  let entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  entries = entries
    .filter((entry) => !shouldIgnoreProjectBoardSourceEntry(root, join(directory, entry.name), entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (paths.length >= MAX_STRUCTURED_DATA_SOURCES) return;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walkStructuredDataSources(root, absolute, paths, depth + 1);
      continue;
    }
    if (!entry.isFile() || !STRUCTURED_DATA_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
    const fileStat = await stat(absolute).catch(() => undefined);
    if (!fileStat || fileStat.size > MAX_SOURCE_BYTES) continue;
    paths.push(relative(root, absolute));
  }
}

function markdownTitle(path: string, content: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || basename(path);
}

function configTitle(path: string, content: string): string {
  if (basename(path) === "package.json") {
    const parsed = parseJsonObject(content);
    if (typeof parsed?.name === "string" && parsed.name.trim()) return `Package: ${parsed.name.trim()}`;
  }
  return basename(path);
}

function structuredDataTitle(path: string): string {
  return `Data: ${basename(path)}`;
}

function summarizeStructuredDataSource(path: string, content: string): string {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  const header = lines[0]?.trim();
  const rowCount = Math.max(0, lines.length - 1);
  const extension = extname(path).toLowerCase() === ".tsv" ? "TSV" : "CSV";
  return `${extension} structured data input${header ? ` with columns ${header}` : ""}${rowCount ? ` and ${rowCount} data row${rowCount === 1 ? "" : "s"}` : ""}.`;
}

function summarizeConfigSource(path: string, content: string, fallback: string): string {
  if (basename(path) === "package.json") {
    const parsed = parseJsonObject(content);
    const scripts = parsed?.scripts && typeof parsed.scripts === "object" && !Array.isArray(parsed.scripts)
      ? Object.keys(parsed.scripts as Record<string, unknown>).slice(0, 8)
      : [];
    const name = typeof parsed?.name === "string" && parsed.name.trim() ? `Package ${parsed.name.trim()}.` : "Package metadata.";
    return scripts.length > 0 ? `${name} Scripts: ${scripts.join(", ")}.` : name;
  }
  return summarizeText(content) || fallback;
}

async function filterGeneratedLocalTaskWorkflowStatus(workspacePath: string, status: string): Promise<string> {
  const filtered: string[] = [];
  for (const line of status.split(/\r?\n/g)) {
    if (!line.trim()) continue;
    const path = gitStatusPath(line).split(" -> ").pop()?.trim().replace(/^"|"$/g, "") ?? "";
    if (path && (await isGeneratedLocalTaskWorkflowPath(workspacePath, path))) continue;
    filtered.push(line);
  }
  return filtered.join("\n");
}

async function isGeneratedLocalTaskWorkflowPath(workspacePath: string, path: string): Promise<boolean> {
  if (!path.replace(/\\/g, "/").toLowerCase().endsWith("workflow.md")) return false;
  const content = await readFile(join(workspacePath, path), "utf8").catch(() => "");
  return isGeneratedWorkflowScaffoldingSource(path, content);
}

export function isGeneratedWorkflowScaffoldingSource(path: string, content: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  if (!normalized.endsWith("workflow.md")) return false;
  const lower = content.slice(0, 12_000).toLowerCase();
  if (
    /\btracker:\s*\n\s*kind:\s*local\b/.test(lower) &&
    /\borchestration:\s*\n[\s\S]*\bauto_dispatch:\s*true\b/.test(lower) &&
    lower.includes("work on local task {{ task.identifier }}") &&
    lower.includes("{{ task.description }}")
  ) {
    return true;
  }
  const rootWorkflow = normalized === "workflow.md";
  return (
    rootWorkflow &&
    (/\bgenerated by ambient\b/.test(lower) ||
      /\bambient generated\b/.test(lower) ||
      /\bgenerated workflow\b/.test(lower) ||
      /\bworkflow scaffold\b/.test(lower) ||
      /\blocal task\s+\{\{/.test(lower) ||
      (/\btracker:\s*\n/.test(lower) && /\borchestration:\s*\n/.test(lower)))
  );
}

export function isGeneratedReportArtifactSource(path: string, content: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  if (!MARKDOWN_EXTENSIONS.has(extname(normalized))) return false;
  const lower = content.slice(0, 12_000).toLowerCase();
  const generatedMarker =
    /\bgenerated by ambient\b/.test(lower) ||
    /\bambient generated\b/.test(lower) ||
    /\bgenerated report\b/.test(lower) ||
    /\bgenerated artifact\b/.test(lower);
  const reportMarker =
    /\bworkspace health report\b/.test(lower) ||
    /\bproject health report\b/.test(lower) ||
    /\bhealth report\b/.test(lower) ||
    /\bsource health\b/.test(lower);
  return isReportArtifactPath(normalized) && generatedMarker && reportMarker;
}

function isReportArtifactPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  const name = basename(normalized);
  return (
    normalized.startsWith("reports/") ||
    normalized.includes("/reports/") ||
    /\b(report|health|audit|analysis)\b/.test(name.replace(/[-_.]/g, " "))
  );
}

function parseJsonObject(content: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(content) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

async function gitOutput(workspacePath: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", workspacePath, ...args], {
      timeout: 5_000,
      maxBuffer: 256_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return stdout;
  } catch {
    return undefined;
  }
}

function gitStatusPath(line: string): string {
  if (/^.. .+/.test(line)) return line.slice(3).trim();
  return line.trim().replace(/^[A-Z?!]{1,2}\s+/, "").trim();
}

function dedupeSources(sources: ProjectBoardSourceInput[]): ProjectBoardSourceInput[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.sourceKey ?? projectBoardSourceKey(source);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
