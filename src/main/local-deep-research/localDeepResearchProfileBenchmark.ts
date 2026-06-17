import { freemem, totalmem } from "node:os";
import type { WebResearchProviderAttempt } from "../webResearchBroker";
import type { LocalDeepResearchBroker, LocalDeepResearchBrokerResult } from "./localDeepResearchAdapter";
import { detectLocalDeepResearchManagedAssets, type LocalDeepResearchManagedAssetDetection } from "./localDeepResearchManagedAssets";
import {
  localDeepResearchEstimatedResidentMemoryBytes,
  localDeepResearchProfileById,
  type LocalDeepResearchMachineFacts,
  type LocalDeepResearchModelProfileId,
} from "./localDeepResearchModelProfiles";
import {
  runLocalDeepResearchWithManagedLlama,
  type LocalDeepResearchRunRequest,
  type LocalDeepResearchRunServiceResult,
} from "./localDeepResearchRunService";
import { validateLocalDeepResearchCitations } from "./localDeepResearchRunner";
import { buildLocalDeepResearchSetupContract, type LocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import { writeWorkspaceTextFile } from "../workspaceFiles";

const gib = 1024 ** 3;
const benchmarkRoot = ".ambient/local-deep-research/profile-benchmarks";

export type LocalDeepResearchProfileBenchmarkStatus = "passed" | "failed";
export type LocalDeepResearchProfileBenchmarkCheckStatus = "passed" | "failed";

export interface LocalDeepResearchBenchmarkSource {
  url: string;
  title: string;
  providerId: string;
  snippet: string;
  content: string;
}

export interface LocalDeepResearchProfileBenchmarkTask {
  id: string;
  title: string;
  question: string;
  sources: LocalDeepResearchBenchmarkSource[];
  requiredCitationPrefixes: string[];
  requiredTerms: string[];
}

export interface LocalDeepResearchHostMemorySnapshot {
  capturedAt: string;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  usedMemoryBytes: number;
}

export interface LocalDeepResearchProfileBenchmarkCheck {
  id: string;
  title: string;
  status: LocalDeepResearchProfileBenchmarkCheckStatus;
  detail: string;
}

export interface LocalDeepResearchProfileBenchmarkQuality {
  status: LocalDeepResearchProfileBenchmarkStatus;
  score: number;
  checks: LocalDeepResearchProfileBenchmarkCheck[];
  citationUrls: string[];
  coveredRequiredCitationPrefixes: string[];
  missingRequiredCitationPrefixes: string[];
  finalTextChars: number;
  searchCallCount: number;
  visitCallCount: number;
  toolCallCount: number;
  selectedProviders: string[];
}

export interface LocalDeepResearchProfileBenchmarkRun {
  profileId: LocalDeepResearchModelProfileId;
  status: LocalDeepResearchProfileBenchmarkStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  setupStatus: LocalDeepResearchSetupContract["status"];
  contextTokens: number;
  modelFilename: string;
  estimatedResidentMemoryBytes: number;
  memoryBefore: LocalDeepResearchHostMemorySnapshot;
  memoryAfter: LocalDeepResearchHostMemorySnapshot;
  quality: LocalDeepResearchProfileBenchmarkQuality;
  failureMode?: string;
  run?: LocalDeepResearchRunServiceResult;
  managedAssets: LocalDeepResearchManagedAssetDetection;
}

export interface LocalDeepResearchProfileBenchmarkComparison {
  baselineProfileId: LocalDeepResearchModelProfileId;
  candidateProfileId: LocalDeepResearchModelProfileId;
  qualityScoreDelta: number;
  durationDeltaMs: number;
  citationCoverageDelta: number;
  recommendation: string;
}

export interface LocalDeepResearchProfileBenchmarkReport {
  schemaVersion: "ambient-local-deep-research-profile-benchmark-v1";
  createdAt: string;
  status: LocalDeepResearchProfileBenchmarkStatus;
  task: Omit<LocalDeepResearchProfileBenchmarkTask, "sources"> & {
    sourceUrls: string[];
  };
  profiles: LocalDeepResearchProfileBenchmarkRun[];
  comparison?: LocalDeepResearchProfileBenchmarkComparison;
  artifactPath: string;
  markdownPath: string;
}

export interface RunLocalDeepResearchProfileBenchmarkInput {
  workspacePath: string;
  profiles?: LocalDeepResearchModelProfileId[];
  task?: LocalDeepResearchProfileBenchmarkTask;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  runOptions?: Partial<Pick<LocalDeepResearchRunRequest, "serverOptions" | "chatOptions" | "maxToolCalls" | "maxTurns" | "signal">>;
}

export const localDeepResearchMixedSourceBenchmarkTask: LocalDeepResearchProfileBenchmarkTask = {
  id: "node-python-release-synthesis",
  title: "Node.js LTS and Python stable release synthesis",
  question: [
    "Compare the Node.js LTS release line and the current stable Python 3 release using the supplied official-source evidence.",
    "Search first, then visit at least one Node.js source and one Python source.",
    "Explain the release status difference, cite URLs, and keep the answer concise.",
  ].join(" "),
  requiredCitationPrefixes: [
    "https://nodejs.org/",
    "https://www.python.org/",
  ],
  requiredTerms: ["Node.js", "Python", "LTS", "stable"],
  sources: [
    {
      url: "https://nodejs.org/en/about/previous-releases",
      title: "Node.js Previous Releases",
      providerId: "benchmark-fixture-search",
      snippet: "Official Node.js release table showing active LTS and maintenance LTS lines.",
      content: [
        "Official Node.js release status fixture for benchmark use.",
        "Node.js 24 is the active LTS release line in this evidence pack.",
        "Node.js 22 is in maintenance LTS.",
        "Node.js LTS lines emphasize production stability, scheduled maintenance, and predictable end-of-life dates.",
      ].join("\n"),
    },
    {
      url: "https://github.com/nodejs/release#release-schedule",
      title: "Node.js Release Working Group Schedule",
      providerId: "benchmark-fixture-search",
      snippet: "Node.js Release Working Group schedule explaining current and maintenance release stages.",
      content: [
        "The Node.js Release Working Group publishes the release schedule.",
        "A Node.js major line moves from current to active LTS and then maintenance LTS.",
        "The LTS schedule is separate from Python's annual feature release cadence.",
      ].join("\n"),
    },
    {
      url: "https://www.python.org/downloads/",
      title: "Python Downloads",
      providerId: "benchmark-fixture-search",
      snippet: "Official Python downloads page identifying the current production-ready Python 3 release.",
      content: [
        "Official Python downloads fixture for benchmark use.",
        "Python 3.14 is the current stable Python 3 feature release line in this evidence pack.",
        "Stable Python releases are production-ready, while pre-release alphas, betas, and release candidates are not stable production releases.",
      ].join("\n"),
    },
    {
      url: "https://devguide.python.org/versions/",
      title: "Python Developer Guide Status of Python Versions",
      providerId: "benchmark-fixture-search",
      snippet: "Python Developer Guide table describing feature, bugfix, security, and end-of-life branches.",
      content: [
        "The Python Developer Guide tracks status across feature, bugfix, security, and end-of-life branches.",
        "Python's stable feature line receives bugfix releases before moving to security-only maintenance.",
        "This differs from the Node.js current, active LTS, and maintenance LTS language used in Node release planning.",
      ].join("\n"),
    },
  ],
};

export async function runLocalDeepResearchProfileBenchmark(
  input: RunLocalDeepResearchProfileBenchmarkInput,
): Promise<LocalDeepResearchProfileBenchmarkReport> {
  const now = input.now ?? (() => new Date());
  const task = input.task ?? localDeepResearchMixedSourceBenchmarkTask;
  const profiles = input.profiles ?? ["literesearcher-4b-q4-k-m", "literesearcher-4b-q8-0"];
  const createdAt = now().toISOString();
  const runs: LocalDeepResearchProfileBenchmarkRun[] = [];
  for (const profileId of profiles) {
    runs.push(await runProfileBenchmark({
      workspacePath: input.workspacePath,
      profileId,
      task,
      env: input.env,
      now,
      runOptions: input.runOptions,
    }));
  }
  const status: LocalDeepResearchProfileBenchmarkStatus = runs.every((run) => run.status === "passed") ? "passed" : "failed";
  const comparison = compareProfileRuns(runs);
  const pending = {
    schemaVersion: "ambient-local-deep-research-profile-benchmark-v1" as const,
    createdAt,
    status,
    task: {
      id: task.id,
      title: task.title,
      question: task.question,
      requiredCitationPrefixes: task.requiredCitationPrefixes,
      requiredTerms: task.requiredTerms,
      sourceUrls: task.sources.map((source) => source.url),
    },
    profiles: runs,
    ...(comparison ? { comparison } : {}),
  };
  const basePath = `${benchmarkRoot}/${createdAt.replace(/[:.]/g, "-")}-${status}`;
  const json = await writeWorkspaceTextFile(input.workspacePath, `${basePath}.json`, `${JSON.stringify(pending, null, 2)}\n`);
  const markdown = await writeWorkspaceTextFile(input.workspacePath, `${basePath}.md`, localDeepResearchProfileBenchmarkMarkdown(pending));
  return {
    ...pending,
    artifactPath: json.path,
    markdownPath: markdown.path,
  };
}

export function createLocalDeepResearchBenchmarkBroker(task: LocalDeepResearchProfileBenchmarkTask): LocalDeepResearchBroker {
  return {
    search: (input) => {
      const query = input.query.toLowerCase();
      const matching = task.sources.filter((source) =>
        query.includes("node")
          ? source.url.includes("nodejs") || source.title.toLowerCase().includes("node")
          : query.includes("python")
            ? source.url.includes("python") || source.title.toLowerCase().includes("python")
            : true
      );
      const sources = matching.length ? matching : task.sources;
      return brokerResult({
        text: sources.map((source, index) => [
          `${index + 1}. ${source.title}`,
          `URL: ${source.url}`,
          `Snippet: ${source.snippet}`,
        ].join("\n")).join("\n\n"),
        selectedProvider: "benchmark-fixture-search",
        providerId: "benchmark-fixture-search",
        tool: "fixture.search",
      });
    },
    visit: (input) => {
      const source = sourceForUrl(task.sources, input.url);
      if (!source) {
        return brokerResult({
          text: `No benchmark fixture source matched ${input.url}. Use one of: ${task.sources.map((candidate) => candidate.url).join(", ")}`,
          selectedProvider: "benchmark-fixture-fetch",
          providerId: "benchmark-fixture-fetch",
          tool: "fixture.fetch",
          status: "failed",
          reason: "fixture-url-not-found",
        });
      }
      return brokerResult({
        text: [
          `Title: ${source.title}`,
          `URL: ${source.url}`,
          "",
          source.content,
        ].join("\n"),
        selectedProvider: "benchmark-fixture-fetch",
        providerId: "benchmark-fixture-fetch",
        tool: "fixture.fetch",
      });
    },
  };
}

export function evaluateLocalDeepResearchProfileBenchmarkRun(input: {
  task: LocalDeepResearchProfileBenchmarkTask;
  result?: LocalDeepResearchRunServiceResult;
  error?: string;
}): LocalDeepResearchProfileBenchmarkQuality {
  const finalText = input.result?.finalText ?? "";
  const citationUrls = extractCitationUrls(finalText);
  const coveredRequiredCitationPrefixes = input.task.requiredCitationPrefixes.filter((prefix) =>
    citationUrls.some((url) => url.startsWith(prefix))
  );
  const missingRequiredCitationPrefixes = input.task.requiredCitationPrefixes.filter((prefix) => !coveredRequiredCitationPrefixes.includes(prefix));
  const toolExecutions = input.result?.run.toolExecutions ?? [];
  const searchCallCount = toolExecutions.filter((execution) => execution.call.name === "search").length;
  const visitCallCount = toolExecutions.filter((execution) => execution.call.name === "visit").length;
  const selectedProviders = [...new Set(toolExecutions.map((execution) => execution.result.selectedProvider).filter((value): value is string => Boolean(value)))];
  const citationValidation = input.result?.run.citationValidation
    ?? validateLocalDeepResearchCitations(finalText, toolExecutions);
  const checks: LocalDeepResearchProfileBenchmarkCheck[] = [
    benchmarkCheck("completed", "Run completed", input.result?.status === "completed", input.error ?? input.result?.error ?? input.result?.status ?? "No result."),
    benchmarkCheck("search", "Search used", searchCallCount >= 1, `${searchCallCount} search calls.`),
    benchmarkCheck("visit", "Visits used", visitCallCount >= 2, `${visitCallCount} visit calls.`),
    benchmarkCheck("citation-validation", "Citation validation", citationValidation.status === "passed", citationValidation.detail),
    benchmarkCheck("citations", "Citation URLs", citationUrls.length >= input.task.requiredCitationPrefixes.length, `${citationUrls.length} citation URLs.`),
    benchmarkCheck("source-coverage", "Required source coverage", missingRequiredCitationPrefixes.length === 0, missingRequiredCitationPrefixes.length ? `Missing ${missingRequiredCitationPrefixes.join(", ")}.` : "All required source families cited."),
    ...input.task.requiredTerms.map((term) =>
      benchmarkCheck(`term-${term.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, `Mentions ${term}`, finalText.toLowerCase().includes(term.toLowerCase()), `${term} ${finalText.toLowerCase().includes(term.toLowerCase()) ? "present" : "missing"}.`)
    ),
  ];
  const passedCount = checks.filter((check) => check.status === "passed").length;
  const score = checks.length ? Math.round((passedCount / checks.length) * 100) / 100 : 0;
  return {
    status: checks.every((check) => check.status === "passed") ? "passed" : "failed",
    score,
    checks,
    citationUrls,
    coveredRequiredCitationPrefixes,
    missingRequiredCitationPrefixes,
    finalTextChars: finalText.length,
    searchCallCount,
    visitCallCount,
    toolCallCount: toolExecutions.length,
    selectedProviders,
  };
}

function runProfileBenchmark(input: {
  workspacePath: string;
  profileId: LocalDeepResearchModelProfileId;
  task: LocalDeepResearchProfileBenchmarkTask;
  env?: NodeJS.ProcessEnv;
  now: () => Date;
  runOptions?: RunLocalDeepResearchProfileBenchmarkInput["runOptions"];
}): Promise<LocalDeepResearchProfileBenchmarkRun> {
  return runProfileBenchmarkInner(input);
}

async function runProfileBenchmarkInner(input: {
  workspacePath: string;
  profileId: LocalDeepResearchModelProfileId;
  task: LocalDeepResearchProfileBenchmarkTask;
  env?: NodeJS.ProcessEnv;
  now: () => Date;
  runOptions?: RunLocalDeepResearchProfileBenchmarkInput["runOptions"];
}): Promise<LocalDeepResearchProfileBenchmarkRun> {
  const profile = localDeepResearchProfileById(input.profileId);
  const startedAtDate = input.now();
  const startedAt = startedAtDate.toISOString();
  const memoryBefore = hostMemorySnapshot(startedAt);
  const machineFacts = benchmarkMachineFactsForProfile(input.profileId);
  const managedAssets = await detectLocalDeepResearchManagedAssets(input.workspacePath, {
    selectedProfileId: input.profileId,
    env: input.env,
    platform: machineFacts.platform,
    arch: machineFacts.arch,
  });
  const setup = buildLocalDeepResearchSetupContract({
    machineFacts,
    modelInstallState: managedAssets.model.status === "present" ? "installed" : "missing",
    runtimeInstalled: managedAssets.runtime.status === "present",
    ...(managedAssets.runtime.artifactId ? { runtimeArtifactId: managedAssets.runtime.artifactId } : {}),
    ...(managedAssets.runtime.binaryPath ? { runtimeBinaryPath: managedAssets.runtime.binaryPath } : {}),
  });
  let run: LocalDeepResearchRunServiceResult | undefined;
  let error: string | undefined;
  try {
    run = await runLocalDeepResearchWithManagedLlama({
      workspacePath: input.workspacePath,
      question: input.task.question,
      setup,
      managedAssets,
      broker: createLocalDeepResearchBenchmarkBroker(input.task),
      maxToolCalls: input.runOptions?.maxToolCalls ?? 8,
      maxTurns: input.runOptions?.maxTurns ?? 10,
      serverOptions: {
        startupTimeoutMs: 240_000,
        idleTimeoutMs: 0,
        ...input.runOptions?.serverOptions,
      },
      chatOptions: {
        temperature: 0,
        requestTimeoutMs: 180_000,
        ...input.runOptions?.chatOptions,
      },
      signal: input.runOptions?.signal,
    });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  const completedAt = input.now().toISOString();
  const quality = evaluateLocalDeepResearchProfileBenchmarkRun({
    task: input.task,
    ...(run ? { result: run } : {}),
    ...(error ? { error } : {}),
  });
  return {
    profileId: input.profileId,
    status: quality.status,
    startedAt,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    setupStatus: setup.status,
    contextTokens: setup.modelInstall.contextTokens,
    modelFilename: profile.filename,
    estimatedResidentMemoryBytes: localDeepResearchEstimatedResidentMemoryBytes(profile, setup.modelInstall.contextTokens),
    memoryBefore,
    memoryAfter: hostMemorySnapshot(completedAt),
    quality,
    ...(run ? { run } : {}),
    ...(error || run?.status !== "completed" ? { failureMode: error ?? run?.error ?? run?.status ?? "unknown" } : {}),
    managedAssets,
  };
}

function compareProfileRuns(runs: LocalDeepResearchProfileBenchmarkRun[]): LocalDeepResearchProfileBenchmarkComparison | undefined {
  const q4 = runs.find((run) => run.profileId === "literesearcher-4b-q4-k-m");
  const q8 = runs.find((run) => run.profileId === "literesearcher-4b-q8-0");
  if (!q4 || !q8) return undefined;
  const qualityScoreDelta = Math.round((q8.quality.score - q4.quality.score) * 100) / 100;
  const durationDeltaMs = q8.durationMs - q4.durationMs;
  const citationCoverageDelta = q8.quality.coveredRequiredCitationPrefixes.length - q4.quality.coveredRequiredCitationPrefixes.length;
  const recommendation = q8.status === "passed" && q4.status === "passed"
    ? qualityScoreDelta > 0
      ? "Q8 produced stronger benchmark quality on this task; keep Q4 as fallback for constrained or pressured hosts."
      : qualityScoreDelta < 0
        ? "Q4 matched or exceeded Q8 on this task; keep Q8 gated until broader benchmarks justify the extra memory."
        : "Q4 and Q8 met the benchmark quality gate on this task; choose by memory policy, latency, and host pressure."
    : q8.status === "passed"
      ? "Only Q8 passed this benchmark; inspect Q4 failure mode before broad rollout."
      : q4.status === "passed"
        ? "Only Q4 passed this benchmark; keep Q8 behind explicit override until its failure mode is fixed."
        : "Neither profile passed this benchmark; inspect run artifacts and parser/tool-call failures before release gating.";
  return {
    baselineProfileId: q4.profileId,
    candidateProfileId: q8.profileId,
    qualityScoreDelta,
    durationDeltaMs,
    citationCoverageDelta,
    recommendation,
  };
}

function localDeepResearchProfileBenchmarkMarkdown(
  report: Omit<LocalDeepResearchProfileBenchmarkReport, "artifactPath" | "markdownPath">,
): string {
  const lines = [
    "# Local Deep Research Profile Benchmark",
    "",
    `Created: ${report.createdAt}`,
    `Status: ${report.status}`,
    `Task: ${report.task.title}`,
    "",
    "## Profile Results",
    "",
    "| Profile | Status | Score | Duration | Tool Calls | Citations | Failure Mode |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...report.profiles.map((run) => `| ${run.profileId} | ${run.status} | ${run.quality.score.toFixed(2)} | ${run.durationMs} ms | ${run.quality.toolCallCount} | ${run.quality.citationUrls.length} | ${run.failureMode ?? "none"} |`),
    "",
    "## Comparison",
    "",
    report.comparison
      ? [
          `Quality delta (Q8 minus Q4): ${report.comparison.qualityScoreDelta}`,
          `Duration delta (Q8 minus Q4): ${report.comparison.durationDeltaMs} ms`,
          `Citation coverage delta: ${report.comparison.citationCoverageDelta}`,
          `Recommendation: ${report.comparison.recommendation}`,
        ].join("\n")
      : "Comparison requires both Q4 and Q8 results.",
    "",
    "## Checks",
    "",
    ...report.profiles.flatMap((run) => [
      `### ${run.profileId}`,
      "",
      ...run.quality.checks.map((check) => `- ${check.title}: ${check.status}. ${check.detail}`),
      "",
      `Run artifact: ${run.run?.artifacts.jsonPath ?? "none"}`,
      "",
    ]),
  ];
  return `${lines.join("\n")}\n`;
}

function benchmarkMachineFactsForProfile(profileId: LocalDeepResearchModelProfileId): Partial<LocalDeepResearchMachineFacts> {
  return {
    platform: process.platform,
    arch: process.arch,
    memoryBytes: profileId === "literesearcher-4b-q8-0" ? 128 * gib : 32 * gib,
    memoryPressure: "normal",
    activeLocalModelCount: 0,
  };
}

function hostMemorySnapshot(capturedAt: string): LocalDeepResearchHostMemorySnapshot {
  const totalMemoryBytes = totalmem();
  const freeMemoryBytes = freemem();
  return {
    capturedAt,
    totalMemoryBytes,
    freeMemoryBytes,
    usedMemoryBytes: Math.max(0, totalMemoryBytes - freeMemoryBytes),
  };
}

function brokerResult(input: {
  text: string;
  selectedProvider: string;
  providerId: string;
  tool: string;
  status?: WebResearchProviderAttempt["status"];
  reason?: string;
}): LocalDeepResearchBrokerResult {
  return {
    text: input.text,
    selectedProvider: input.selectedProvider,
    attempts: [
      {
        providerId: input.providerId,
        status: input.status ?? "succeeded",
        tool: input.tool,
        durationMs: 1,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    ],
  };
}

function sourceForUrl(sources: LocalDeepResearchBenchmarkSource[], url: string): LocalDeepResearchBenchmarkSource | undefined {
  const normalized = normalizeUrl(url);
  return sources.find((source) => normalizeUrl(source.url) === normalized)
    ?? sources.find((source) => normalized.startsWith(normalizeUrl(source.url)) || normalizeUrl(source.url).startsWith(normalized));
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function extractCitationUrls(text: string): string[] {
  const urls = [...text.matchAll(/https?:\/\/[^\s)\]】}>"']+/gi)]
    .map((match) => match[0].replace(/[)\]】}>".,;:]+$/, ""));
  return [...new Set(urls)];
}

function benchmarkCheck(id: string, title: string, passed: boolean, detail: string): LocalDeepResearchProfileBenchmarkCheck {
  return {
    id,
    title,
    status: passed ? "passed" : "failed",
    detail,
  };
}
