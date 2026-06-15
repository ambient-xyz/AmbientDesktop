import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../shared/ambientModels";
import { AgentRuntime } from "./agentRuntime";
import { BrowserCredentialStore } from "./browserCredentialStore";
import { BrowserService } from "./browserService";
import { ProjectStore } from "./projectStore";

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.env.TMPDIR || "/tmp"}/ambient-scrapling-autowire-electron`,
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => electronMock.userDataPath,
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, "utf8"),
    decryptString: (value: Buffer) => value.toString("utf8"),
  },
}));

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const itLive = process.env.AMBIENT_SCRAPLING_AUTOWIRE_LIVE === "1" ? it : it.skip;

describeNative("Scrapling autowire prototype", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;

  beforeEach(async () => {
    workspacePath = await realpath(await mkdtemp(join(tmpdir(), "ambient-scrapling-autowire-")));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    await runtime?.shutdownPluginMcpServers();
    runtime = undefined;
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  itLive("asks Pi to autowire D4Vinci/Scrapling from bounded repo evidence and scores the proposal", async () => {
    const materials = await fetchScraplingMaterials();
    const canonical = canonicalScraplingAutowire();
    const thread = store.createThread("Scrapling autowire prototype");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected tool request during Scrapling autowire prototype: ${request.toolName} ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "planner",
      model: process.env.AMBIENT_SCRAPLING_AUTOWIRE_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: buildAutowirePrompt(materials),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n\n--- MESSAGE ---\n\n");
    const proposal = parseProposal(transcript);
    const score = scoreScraplingProposal(proposal, canonical);
    const report = {
      createdAt: new Date().toISOString(),
      source: materials.source,
      resolvedSha: materials.sha,
      score,
      canonical,
      proposal,
      transcript,
    };
    const reportRoot = join(process.cwd(), "test-results", "scrapling-autowire");
    await mkdir(reportRoot, { recursive: true });
    await writeFile(join(reportRoot, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(join(reportRoot, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(transcript).toContain("SCRAPLING_AUTOWIRE_PROPOSAL");
    expect(score.checks.parsedJson).toBe(true);
  }, 600_000);
});

function canonicalScraplingAutowire() {
  const runtimeArgs = [
    "run",
    "--with",
    "scrapling",
    "--with",
    "curl_cffi",
    "--with",
    "playwright",
    "--with",
    "browserforge",
    "python",
    "./scripts/scrapling_extract.py",
  ];
  return {
    preferredShape: "ambient-quality-wrapper",
    acceptableShape: "direct-scrapling-cli",
    descriptor: {
      name: "ambient-scrapling-static-extract",
      version: "0.1.1",
      description: "Extract values from static HTML using the real Scrapling package.",
      skills: "./SKILL.md",
      commands: {
        scrapling_extract: {
          command: "uv",
          args: runtimeArgs,
          cwd: "package",
          description: "Extract matching values from static HTML with a CSS selector using Scrapling.",
          healthCheck: ["uv", ...runtimeArgs, "--health"],
        },
      },
      env: [],
      responseFormats: ["json"],
      artifacts: {
        outputTypes: [],
        policy: "return concise JSON in stdout; do not write artifacts for static extraction",
      },
    },
    requiredCapabilities: [
      "Finds Scrapling's project script entrypoint scrapling = scrapling.cli:main.",
      "Recognizes extract get writes output files and should not be surfaced as vague stdout.",
      "Avoids interactive shell as the main automation command.",
      "Uses package-local, mediated Python execution rather than global pip or sudo.",
      "Provides a deterministic health check.",
      "Provides SKILL.md guidance that tells Pi when and how to invoke the installed command.",
    ],
  };
}

function buildAutowirePrompt(materials: ScraplingMaterials): string {
  return [
    "This is an Ambient Desktop autowire prototype. You are a constrained Pi planning session.",
    "You cannot run shell, browser, network, filesystem, install, validation, or secret tools. Use only the bounded repository evidence below.",
    "Goal: decide how to wire the GitHub repository as an Ambient CLI package.",
    "",
    "Ambient CLI descriptor contract:",
    "- A package is executable only when it has ambient-cli.json or package.json ambient.cli.",
    "- Descriptor shape: { name, version, description, skills, env, commands, responseFormats?, artifacts?, networkHosts? }.",
    "- commands is an object keyed by descriptor command name.",
    "- Each command has { command, args, cwd, description, healthCheck }.",
    "- command should be a bare executable such as node, uv, python, or a package-relative executable; do not use sudo or absolute host paths.",
    "- args are fixed descriptor args; user-provided args are appended later by Ambient.",
    "- cwd must be package unless there is a strong reason for workspace.",
    "- healthCheck must be deterministic and non-destructive.",
    "- For Python dependencies, prefer mediated package-local runtime such as uv run --with ... or a package-local .venv plan. Do not use global pip.",
    "- For commands that write files, either wrap them so stdout returns concise JSON metadata, or explicitly declare artifact behavior and user-visible output path handling.",
    "- Never ask users to paste secrets; declare env requirements by name only.",
    "",
    "Return one proposal only. Do not call tools. Your final answer must contain the token SCRAPLING_AUTOWIRE_PROPOSAL followed by one fenced JSON block.",
    "The JSON block must match this shape:",
    JSON.stringify(
      {
        status: "installable | needs_user_input | unsupported | unsafe",
        confidence: 0.0,
        source: "string",
        resolvedSha: "string",
        packagePath: ".",
        detectedShape: "string",
        descriptor: {},
        skillMarkdown: "string",
        files: [{ path: "string", purpose: "string", contentSummary: "string" }],
        dependencyPlan: [{ command: "string", args: ["string"], cwd: "string", rationale: "string" }],
        validationPlan: [{ commandName: "string", healthCheck: ["string"], smokeTest: "string" }],
        risks: ["string"],
        questions: ["string"],
        rationale: "string",
      },
      null,
      2,
    ),
    "",
    "Repository evidence:",
    `Source: ${materials.source}`,
    `Resolved SHA: ${materials.sha}`,
    "",
    "Scraped repo facts:",
    "- pyproject.toml declares project name scrapling, Python >=3.10, and project script: scrapling = scrapling.cli:main.",
    "- Optional dependency group fetchers includes click, curl_cffi, playwright, patchright, browserforge, apify-fingerprint-datapoints, msgspec, anyio, and protego.",
    "- Optional dependency group shell includes IPython, markdownify, and scrapling[fetchers].",
    "- Optional dependency group ai includes mcp, markdownify, and scrapling[fetchers].",
    "- docs/cli/overview.md says the CLI supports interactive shell, extract commands, and utility commands.",
    "- docs/cli/overview.md says CLI setup uses pip install \"scrapling[shell]\" and scrapling install for browser/fetcher dependencies.",
    "- docs/cli/extract-commands.md says scrapling extract downloads pages, converts HTML to Markdown/HTML/text by output extension, supports CSS selectors, headers, cookies, proxy, and --ai-targeted.",
    "- docs/cli/extract-commands.md lists extract subcommands: get, post, put, delete, fetch, stealthy-fetch.",
    "- scrapling/cli.py defines top-level commands install, mcp, shell, and extract.",
    "- scrapling/cli.py extract get takes URL and output_file arguments, then writes content to output_file.",
    "- scrapling/cli.py extract fetch and stealthy_fetch use browser automation and also write content to output_file.",
    "- scrapling/cli.py shell is interactive and should not be the primary Ambient automation command.",
    "- scrapling/cli.py mcp starts a Scrapling MCP server; that is separate from a direct CLI package wrapper.",
    "",
    "pyproject.toml excerpt:",
    fence(materials.pyproject),
    "",
  ].join("\n");
}

function scoreScraplingProposal(proposal: unknown, canonical: ReturnType<typeof canonicalScraplingAutowire>) {
  const parsedJson = proposal !== undefined && typeof proposal === "object" && proposal !== null;
  const descriptor = parsedJson ? record((proposal as Record<string, unknown>).descriptor) : {};
  const commands = record(descriptor.commands);
  const commandEntries = Object.entries(commands).map(([name, value]) => ({ name, value: record(value) }));
  const serialized = JSON.stringify(proposal ?? {});
  const primaryCommandText = commandEntries.map((entry) => [entry.name, entry.value.command, ...(array(entry.value.args) as string[])].join(" ")).join("\n").toLowerCase();
  const healthChecks = commandEntries.flatMap((entry) => array(entry.value.healthCheck));
  const files = array((proposal as Record<string, unknown> | undefined)?.files);
  const generatedFiles = files.filter((file) => {
    const path = String(record(file).path ?? "");
    return !["pyproject.toml", "scrapling/cli.py", "docs/cli/overview.md", "docs/cli/extract-commands.md"].includes(path);
  });
  const skillMarkdown = String((proposal as Record<string, unknown> | undefined)?.skillMarkdown ?? "");
  const dependencyPlan = array((proposal as Record<string, unknown> | undefined)?.dependencyPlan);

  const checks = {
    parsedJson,
    hasDescriptorName: typeof descriptor.name === "string" && descriptor.name.toLowerCase().includes("scrapling"),
    descriptorSkillsIsPath: typeof descriptor.skills === "string",
    declaresCommands: commandEntries.length > 0,
    mentionsCliEntrypoint: /scrapling\.cli:main|project\.scripts|scrapling\s*=/.test(serialized),
    avoidsInteractiveShellAsPrimary: !/\bshell\b/.test(primaryCommandText) || /\bextract\b/.test(primaryCommandText),
    recognizesExtractCommand: /\bextract\b/.test(primaryCommandText) || /extract/i.test(serialized),
    recognizesFileOutputOrWrapsJson: /output_file|output file|artifact|json metadata|concise json|wrapper|writes? .*file/i.test(serialized),
    hasHealthCheck: healthChecks.length > 0,
    healthCheckIncludesExecutable: commandEntries.every((entry) => {
      const health = array(entry.value.healthCheck);
      return health.length > 0 && typeof health[0] === "string" && !health[0].startsWith("-");
    }),
    usesMediatedPythonRuntime: /uv|\.venv|python -m venv|pip install --python/.test(JSON.stringify(dependencyPlan)) || /\buv\b/.test(primaryCommandText),
    avoidsGlobalPipAndSudo: !/\bsudo\b|pip install scrapling(?!.*--python)/i.test(serialized),
    providesSkillGuidance: /ambient_cli|scrapling|extract/i.test(skillMarkdown),
    proposesWrapperWhenNeeded: generatedFiles.some((file) => /scrapling.*\.(py|mjs)|wrapper|run\.|scripts\//i.test(JSON.stringify(file))),
  };

  const points = Object.values(checks).filter(Boolean).length;
  const maxPoints = Object.keys(checks).length;
  return {
    points,
    maxPoints,
    ratio: Number((points / maxPoints).toFixed(3)),
    checks,
    canonicalPreferredShape: canonical.preferredShape,
  };
}

function parseProposal(transcript: string): unknown {
  const afterToken = transcript.includes("SCRAPLING_AUTOWIRE_PROPOSAL")
    ? transcript.slice(transcript.lastIndexOf("SCRAPLING_AUTOWIRE_PROPOSAL"))
    : transcript;
  const raw = firstBalancedJsonObject(afterToken);
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function firstBalancedJsonObject(value: string): string {
  const start = value.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return "";
}

interface ScraplingMaterials {
  source: string;
  sha: string;
  treeSummary: string;
  pyproject: string;
  cliOverview: string;
  extractDocs: string;
  cliPy: string;
}

async function fetchScraplingMaterials(): Promise<ScraplingMaterials> {
  const source = "https://github.com/D4Vinci/Scrapling";
  const commit = await fetchJson("https://api.github.com/repos/D4Vinci/Scrapling/commits/main");
  const sha = typeof commit.sha === "string" ? commit.sha : "unknown";
  const [pyproject, cliOverview, extractDocs, cliPy] = await Promise.all([
    fetchText("https://raw.githubusercontent.com/D4Vinci/Scrapling/main/pyproject.toml"),
    fetchText("https://raw.githubusercontent.com/D4Vinci/Scrapling/main/docs/cli/overview.md"),
    fetchText("https://raw.githubusercontent.com/D4Vinci/Scrapling/main/docs/cli/extract-commands.md"),
    fetchText("https://raw.githubusercontent.com/D4Vinci/Scrapling/main/scrapling/cli.py"),
  ]);
  return {
    source,
    sha,
    treeSummary: [
      ".github/",
      "agent-skill/",
      "docs/cli/overview.md",
      "docs/cli/extract-commands.md",
      "scrapling/cli.py",
      "scrapling/core/ai.py",
      "tests/cli/test_cli.py",
      "pyproject.toml",
      "README.md",
      "LICENSE",
    ].join("\n"),
    pyproject: excerpt(pyproject, [
      "[project]",
      "dependencies =",
      "[project.optional-dependencies]",
      "[project.scripts]",
    ], 220),
    cliOverview: excerpt(cliOverview, ["Command Line Interface", "Requirements"], 80),
    extractDocs: excerpt(extractDocs, ["Available Commands", "GET Request", "AI-Targeted Mode"], 100),
    cliPy: excerpt(cliPy, ["def install", "def mcp", "def shell", "def extract", "def get", "def fetch", "def stealthy_fetch"], 120),
  };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": "ambient-scrapling-autowire-prototype" } });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const text = await fetchText(url);
  return JSON.parse(text) as Record<string, unknown>;
}

function excerpt(text: string, anchors: string[], maxLines: number): string {
  const lines = text.split(/\r?\n/);
  const selected = new Set<number>();
  for (const anchor of anchors) {
    const index = lines.findIndex((line) => line.includes(anchor));
    if (index === -1) continue;
    const start = Math.max(0, index - 8);
    const end = Math.min(lines.length, index + 52);
    for (let i = start; i < end; i += 1) selected.add(i);
  }
  const result = [...selected].sort((a, b) => a - b).map((index) => lines[index]);
  return result.slice(0, maxLines).join("\n");
}

function fence(value: string): string {
  return ["```", value, "```"].join("\n");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
