import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../shared/ambientModels";
import { aggressiveAmbientRetryPolicy } from "./aggressiveRetries";
import { liveAmbientProviderBaseUrl, liveAmbientProviderModel, readLiveAmbientProviderApiKey } from "./liveAmbientProviderConfig";
import { repairJsonWithPi, stableJson, validateJsonAgainstSchemaStrict, type JsonRepairToolResult } from "./jsonRepairTool";
import { callWorkflowPiJson, callWorkflowPiText, WorkflowPiJsonValidationError, type WorkflowPiProgress, type WorkflowPiTextCallInput } from "./workflowPiTransport";

const runLive = process.env.AMBIENT_SCRAPLING_AUTOWIRE_JSON_LIVE === "1";
const liveIt = runLive ? it : it.skip;

describe("Scrapling autowire JSON-schema prototype", () => {
  liveIt(
    "asks Pi for a schema-constrained Scrapling autowire plan and scores it against canonical wiring",
    async () => {
      const instrumentation = createInstrumentation();
      const materials = await timed(instrumentation, "fetch_scrapling_materials", () => fetchScraplingMaterials());
      const canonical = canonicalScraplingAutowire();
      const schema = scraplingAutowireProposalSchema();
      const prompt = buildAutowirePrompt(materials, schema);
      const apiKey = readLiveAmbientProviderApiKey({ purpose: "Scrapling autowire JSON-schema prototype" });
      const model = liveAmbientProviderModel({
        preferredModelEnvNames: ["AMBIENT_SCRAPLING_AUTOWIRE_MODEL", "AMBIENT_PROJECT_BOARD_MODEL", "AMBIENT_LIVE_MODEL"],
        fallbackModel: AMBIENT_DEFAULT_MODEL,
      });
      const baseUrl = liveAmbientProviderBaseUrl();

      let proposal: ScraplingAutowireProposal | undefined;
      let directError: SerializedError | undefined;
      let repair: JsonRepairToolResult | undefined;
      let proposalSource: "direct_json_schema" | "json_repair" | "none" = "none";
      try {
        proposal = await timed(instrumentation, "direct_json_schema_call", () =>
          callWorkflowPiJson<ScraplingAutowireProposal>({
            apiKey,
            baseUrl,
            model,
            prompt,
            schemaName: "scrapling_autowire_proposal",
            responseSchema: schema,
            validate: (value) => validateScraplingAutowireProposal(value, schema),
            maxValidationRetries: 1,
            maxTokens: 6_144,
            idleTimeoutMs: 90_000,
            absoluteTimeoutMs: 300_000,
            enforceAbsoluteTimeout: true,
            retryPolicy: aggressiveAmbientRetryPolicy(),
            textCall: instrumentedTextCall(instrumentation),
          }),
        );
        proposalSource = "direct_json_schema";
      } catch (error) {
        directError = serializeError(error);
        if (error instanceof WorkflowPiJsonValidationError && error.responseText.trim()) {
          repair = await timed(instrumentation, "json_repair_call", () =>
            repairJsonWithPi(
              {
                schemaName: "scrapling_autowire_proposal",
                schema,
                invalidJsonText: error.responseText,
                validationErrors: [directError?.message ?? "Direct JSON-schema call failed deterministic validation."],
                repairInstruction: "Repair only the JSON/schema shape. Preserve the proposed Scrapling wiring decisions exactly.",
                preserveSemantics: true,
              },
              {
                apiKey,
                baseUrl,
                model,
                maxTokens: 8_192,
                idleTimeoutMs: 90_000,
                absoluteTimeoutMs: 300_000,
                enforceAbsoluteTimeout: true,
                maxValidationRetries: 1,
                retryPolicy: aggressiveAmbientRetryPolicy(),
                textCall: instrumentedTextCall(instrumentation, "repair"),
              },
            ),
          );
          if (repair.repaired) {
            proposal = validateScraplingAutowireProposal(repair.value, schema);
            proposalSource = "json_repair";
          }
        }
      }

      const score = proposal ? scoreScraplingProposal(proposal, canonical) : emptyScore();
      const report = {
        createdAt: new Date().toISOString(),
        harness: "scrapling-autowire-json-schema-v1",
        source: materials.source,
        resolvedSha: materials.sha,
        model,
        baseUrl: baseUrl ? redactBaseUrl(baseUrl) : undefined,
        prompt: {
          chars: prompt.length,
          sha256: sha256(prompt),
        },
        proposalSource,
        score,
        directError,
        repair,
        canonical,
        proposal,
        instrumentation,
      };
      await writeReport(report);

      expect(proposal).toBeDefined();
      expect(score.checks.parsedJson).toBe(true);
    },
    420_000,
  );
});

interface ScraplingAutowireProposal {
  status: "installable" | "needs_user_input" | "unsupported" | "unsafe";
  confidence: number;
  source: string;
  resolvedSha: string;
  packagePath: string;
  detectedShape: string;
  descriptor: {
    name: string;
    version: string;
    description: string;
    skills: string;
    env: string[];
    commands: Record<string, ScraplingCommandDescriptor>;
    responseFormats: string[];
    artifacts: {
      outputTypes: string[];
      policy: string;
    };
    networkHosts: string[];
  };
  semanticContract: {
    cliEntrypoint: string;
    selectedRuntimeBoundary: "direct_ambient_cli_wrapper" | "scrapling_mcp_server" | "interactive_shell";
    mcpBoundary: "mcp_server_is_separate_from_direct_cli_wrapper" | "mcp_server_selected_as_primary_runtime";
    extractOutputBehavior: "extract_get_writes_output_file" | "extract_get_returns_stdout_json" | "unknown";
    wrapperStrategy: "wrap_file_output_as_json_stdout" | "surface_file_artifacts_directly" | "direct_cli_stdout_only";
    interactiveShellBoundary: "shell_is_interactive_not_primary" | "shell_selected_as_primary_runtime";
    browserFetcherPlan: "browser_fetchers_deferred_until_readiness" | "browser_fetchers_enabled_by_default" | "not_considered";
  };
  skillMarkdown: string;
  files: Array<{ path: string; purpose: string; contentSummary: string }>;
  dependencyPlan: Array<{ command: string; args: string[]; cwd: string; rationale: string }>;
  validationPlan: Array<{
    commandName: string;
    healthCheck: { command: string; args: string[]; cwd: string };
    smokeTest: { commandName: string; args: string[]; expectedJsonKeys: string[]; expectedContent: string };
  }>;
  risks: string[];
  questions: string[];
  rationale: string;
}

interface ScraplingCommandDescriptor {
  command: string;
  args: string[];
  cwd: string;
  description: string;
  healthCheck: string[];
}

function scraplingAutowireProposalSchema(): Record<string, unknown> {
  const stringArray = { type: "array", items: { type: "string" } };
  const commandDescriptor = {
    type: "object",
    additionalProperties: false,
    required: ["command", "args", "cwd", "description", "healthCheck"],
    properties: {
      command: { type: "string" },
      args: stringArray,
      cwd: { type: "string" },
      description: { type: "string" },
      healthCheck: {
        type: "array",
        minItems: 1,
        items: { type: "string" },
        description: "Complete health-check argv for the descriptor, including the executable as item 0.",
      },
    },
  };
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "status",
      "confidence",
      "source",
      "resolvedSha",
      "packagePath",
      "detectedShape",
      "descriptor",
      "semanticContract",
      "skillMarkdown",
      "files",
      "dependencyPlan",
      "validationPlan",
      "risks",
      "questions",
      "rationale",
    ],
    properties: {
      status: { enum: ["installable", "needs_user_input", "unsupported", "unsafe"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      source: { type: "string" },
      resolvedSha: { type: "string" },
      packagePath: { type: "string" },
      detectedShape: { type: "string" },
      descriptor: {
        type: "object",
        additionalProperties: false,
        required: ["name", "version", "description", "skills", "env", "commands", "responseFormats", "artifacts", "networkHosts"],
        properties: {
          name: { type: "string" },
          version: { type: "string" },
          description: { type: "string" },
          skills: {
            type: "string",
            pattern: "^(\\./)?SKILL\\.md$",
            description: "Path to the package skill markdown file, not a comma-separated tag list.",
          },
          env: stringArray,
          commands: {
            type: "object",
            minProperties: 1,
            additionalProperties: commandDescriptor,
          },
          responseFormats: stringArray,
          artifacts: {
            type: "object",
            additionalProperties: false,
            required: ["outputTypes", "policy"],
            properties: {
              outputTypes: stringArray,
              policy: { type: "string" },
            },
          },
          networkHosts: stringArray,
        },
      },
      semanticContract: {
        type: "object",
        additionalProperties: false,
        required: [
          "cliEntrypoint",
          "selectedRuntimeBoundary",
          "mcpBoundary",
          "extractOutputBehavior",
          "wrapperStrategy",
          "interactiveShellBoundary",
          "browserFetcherPlan",
        ],
        properties: {
          cliEntrypoint: {
            type: "string",
            description: "Exact project script entrypoint evidence from pyproject, for example scrapling = scrapling.cli:main.",
          },
          selectedRuntimeBoundary: {
            enum: ["direct_ambient_cli_wrapper", "scrapling_mcp_server", "interactive_shell"],
            description: "Runtime surface selected for this Ambient CLI package proposal.",
          },
          mcpBoundary: {
            enum: ["mcp_server_is_separate_from_direct_cli_wrapper", "mcp_server_selected_as_primary_runtime"],
            description: "Whether Scrapling's MCP server is separate from the direct Ambient CLI wrapper.",
          },
          extractOutputBehavior: {
            enum: ["extract_get_writes_output_file", "extract_get_returns_stdout_json", "unknown"],
            description: "Observed behavior of scrapling extract get from the evidence.",
          },
          wrapperStrategy: {
            enum: ["wrap_file_output_as_json_stdout", "surface_file_artifacts_directly", "direct_cli_stdout_only"],
            description: "How the Ambient wrapper handles Scrapling's output behavior.",
          },
          interactiveShellBoundary: {
            enum: ["shell_is_interactive_not_primary", "shell_selected_as_primary_runtime"],
            description: "Whether the interactive shell is excluded from the primary automation path.",
          },
          browserFetcherPlan: {
            enum: ["browser_fetchers_deferred_until_readiness", "browser_fetchers_enabled_by_default", "not_considered"],
            description: "Initial handling for browser-backed fetch and stealthy-fetch commands.",
          },
        },
      },
      skillMarkdown: { type: "string" },
      files: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["path", "purpose", "contentSummary"],
          properties: {
            path: { type: "string" },
            purpose: { type: "string" },
            contentSummary: { type: "string" },
          },
        },
      },
      dependencyPlan: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["command", "args", "cwd", "rationale"],
          properties: {
            command: { type: "string" },
            args: stringArray,
            cwd: { type: "string" },
            rationale: { type: "string" },
          },
        },
      },
      validationPlan: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["commandName", "healthCheck", "smokeTest"],
          properties: {
            commandName: { type: "string" },
            healthCheck: {
              type: "object",
              additionalProperties: false,
              required: ["command", "args", "cwd"],
              properties: {
                command: { type: "string" },
                args: stringArray,
                cwd: { type: "string" },
              },
            },
            smokeTest: {
              type: "object",
              additionalProperties: false,
              required: ["commandName", "args", "expectedJsonKeys", "expectedContent"],
              properties: {
                commandName: { type: "string" },
                args: stringArray,
                expectedJsonKeys: stringArray,
                expectedContent: { type: "string" },
              },
            },
          },
        },
      },
      risks: stringArray,
      questions: stringArray,
      rationale: { type: "string" },
    },
  };
}

function validateScraplingAutowireProposal(value: unknown, schema: Record<string, unknown>): ScraplingAutowireProposal {
  const proposal = validateJsonAgainstSchemaStrict(schema, value, "Scrapling autowire proposal") as ScraplingAutowireProposal;
  for (const [name, command] of Object.entries(proposal.descriptor.commands)) {
    if (command.healthCheck[0] !== command.command) {
      throw new Error(
        `Scrapling autowire proposal: descriptor.commands.${name}.healthCheck must include the executable "${command.command}" as item 0.`,
      );
    }
  }
  return proposal;
}

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
      networkHosts: [],
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

function buildAutowirePrompt(materials: ScraplingMaterials, schema: Record<string, unknown>): string {
  return [
    "You are an Ambient Desktop autowire planner running in a constrained Pi session.",
    "Use only the bounded repository evidence below. Do not call tools, browse, install, run commands, or infer hidden files.",
    "Goal: produce an Ambient CLI package wiring proposal for D4Vinci/Scrapling.",
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
    "Autowire decision guidance:",
    "- Scrapling has an interactive shell, a direct CLI, and an MCP server. Choose the direct Ambient CLI wrapper shape for this test, not the MCP server.",
    "- If a Scrapling command writes to output_file, prefer an Ambient wrapper file that returns concise JSON on stdout for static extraction.",
    "- Browser-backed fetchers can be documented as later readiness work; the first useful wrapper can target static HTML or simple URL extraction.",
    "- Include the files Ambient would generate, especially ambient-cli.json, SKILL.md, wrapper script, and smoke test when appropriate.",
    "- Fill semanticContract from the repository evidence, not from generic package intuition.",
    "- descriptor.skills must be a path to the generated skill file, usually ./SKILL.md. Do not put tags in descriptor.skills.",
    "- descriptor.commands.*.healthCheck must be the complete argv including the executable as item 0, for example [\"uv\", \"run\", ...].",
    "- validationPlan.healthCheck must split executable, args, and cwd into named fields so Ambient can safely run it.",
    "",
    "Return only JSON matching this schema. No markdown, no prose outside JSON.",
    JSON.stringify(schema, null, 2),
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
    "docs/cli/overview.md excerpt:",
    fence(materials.cliOverview),
    "",
    "docs/cli/extract-commands.md excerpt:",
    fence(materials.extractDocs),
    "",
    "scrapling/cli.py excerpt:",
    fence(materials.cliPy),
  ].join("\n");
}

function scoreScraplingProposal(proposal: ScraplingAutowireProposal, canonical: ReturnType<typeof canonicalScraplingAutowire>) {
  const descriptor = proposal.descriptor;
  const semantic = proposal.semanticContract;
  const commandEntries = Object.entries(descriptor.commands);
  const serialized = JSON.stringify(proposal);
  const lower = serialized.toLowerCase();
  const commandText = commandEntries.map(([name, value]) => [name, value.command, ...value.args, ...value.healthCheck].join(" ")).join("\n").toLowerCase();
  const generatedFileText = proposal.files.map((file) => `${file.path}\n${file.purpose}\n${file.contentSummary}`).join("\n");
  const checks = {
    parsedJson: true,
    installableOrNeedsInput: proposal.status === "installable" || proposal.status === "needs_user_input",
    sourceAndShaPreserved: proposal.source === "https://github.com/D4Vinci/Scrapling" && proposal.resolvedSha.length >= 7,
    descriptorNameMentionsScrapling: descriptor.name.toLowerCase().includes("scrapling"),
    descriptorSkillsIsPath: descriptor.skills.endsWith(".md") || descriptor.skills.includes("SKILL"),
    declaresCommandsObject: commandEntries.length > 0,
    semanticCliEntrypointPreserved: semantic.cliEntrypoint === "scrapling = scrapling.cli:main",
    semanticDirectCliSelected: semantic.selectedRuntimeBoundary === "direct_ambient_cli_wrapper",
    semanticMcpSeparated: semantic.mcpBoundary === "mcp_server_is_separate_from_direct_cli_wrapper",
    semanticExtractWritesFile: semantic.extractOutputBehavior === "extract_get_writes_output_file",
    semanticWrapperReturnsJson: semantic.wrapperStrategy === "wrap_file_output_as_json_stdout",
    semanticShellExcluded: semantic.interactiveShellBoundary === "shell_is_interactive_not_primary",
    semanticBrowserFetchersDeferred: semantic.browserFetcherPlan === "browser_fetchers_deferred_until_readiness",
    avoidsInteractiveShellAsPrimary: !/\bshell\b/.test(commandText) || /\bextract\b/.test(commandText),
    recognizesExtractGet: /\bextract\b/.test(commandText) || /extract get|extract commands/.test(lower),
    recognizesMcpAsSeparate: /mcp/.test(lower) && /separate|not the mcp|not mcp|direct ambient cli/.test(lower),
    recognizesFileOutputOrWrapsJson: /output_file|output file|writes? .*file|wrapper|concise json|json stdout|metadata/.test(lower),
    proposesWrapperWhenNeeded: /wrapper|scripts\/|scrapling_extract\.(py|mjs)/i.test(generatedFileText),
    hasDeterministicHealthCheck: commandEntries.every(([, value]) => value.healthCheck.length > 0 && !value.healthCheck.join(" ").includes("shell")),
    healthCheckIncludesExecutable: commandEntries.every(([, value]) => value.healthCheck[0] === value.command || ["uv", "python", "node"].includes(value.healthCheck[0] ?? "")),
    usesMediatedPythonRuntime: /\buv\b|\.venv|python -m venv/.test(commandText) || /\buv\b|\.venv|python -m venv/.test(JSON.stringify(proposal.dependencyPlan).toLowerCase()),
    avoidsGlobalPipAndSudo: !/\bsudo\b|pip install scrapling(?!.*--python)/i.test(serialized),
    providesSkillGuidance: /ambient_cli|scrapling|extract/i.test(proposal.skillMarkdown),
    declaresJsonStdout: descriptor.responseFormats.includes("json") || /json/.test(descriptor.artifacts.policy.toLowerCase()),
    hasStructuredValidationHealthCheck: proposal.validationPlan.every((item) => Boolean(item.healthCheck.command) && item.healthCheck.args.length > 0 && item.healthCheck.cwd === "package"),
    includesSmokeTest: proposal.validationPlan.some((item) => item.smokeTest.args.length > 0 && item.smokeTest.expectedJsonKeys.length > 0),
    identifiesBrowserDepsRisk: /browser|playwright|fetcher|scrapling install/.test(proposal.risks.join("\n").toLowerCase()),
    closeToCanonicalCommand: commandText.includes(canonical.descriptor.commands.scrapling_extract.command)
      && (commandText.includes("scrapling") || commandText.includes("scrapling_extract")),
  };
  const points = Object.values(checks).filter(Boolean).length;
  const maxPoints = Object.keys(checks).length;
  return {
    points,
    maxPoints,
    ratio: Number((points / maxPoints).toFixed(3)),
    checks,
  };
}

function emptyScore() {
  return {
    points: 0,
    maxPoints: 28,
    ratio: 0,
    checks: { parsedJson: false },
  };
}

interface ScraplingMaterials {
  source: string;
  sha: string;
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
    pyproject: excerpt(pyproject, ["[project]", "dependencies =", "[project.optional-dependencies]", "[project.scripts]"], 220),
    cliOverview: excerpt(cliOverview, ["Command Line Interface", "Requirements"], 100),
    extractDocs: excerpt(extractDocs, ["Available Commands", "GET Request", "AI-Targeted Mode"], 140),
    cliPy: excerpt(cliPy, ["def install", "def mcp", "def shell", "def extract", "def get", "def fetch", "def stealthy_fetch"], 180),
  };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": "ambient-scrapling-autowire-json-prototype" } });
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
  return [...selected].sort((a, b) => a - b).map((index) => lines[index]).slice(0, maxLines).join("\n");
}

function instrumentedTextCall(instrumentation: HarnessInstrumentation, phase: "direct" | "repair" = "direct") {
  return async (input: WorkflowPiTextCallInput): Promise<string> => {
    const attempt: ModelCallAttempt = {
      phase,
      startedAt: new Date().toISOString(),
      promptChars: input.prompt.length,
      promptSha256: sha256(input.prompt),
      responseFormat: input.responseFormat,
      progress: [],
    };
    instrumentation.modelCalls.push(attempt);
    const started = Date.now();
    try {
      const text = await callWorkflowPiText({
        ...input,
        onProgress: (progress) => {
          attempt.progress.push(compactProgress(progress));
          input.onProgress?.(progress);
        },
      });
      attempt.durationMs = Date.now() - started;
      attempt.responseChars = text.length;
      attempt.responseSha256 = sha256(text);
      attempt.responsePreview = text.slice(0, 2_000);
      return text;
    } catch (error) {
      attempt.durationMs = Date.now() - started;
      attempt.error = serializeError(error);
      throw error;
    }
  };
}

interface HarnessInstrumentation {
  events: Array<{ name: string; startedAt: string; durationMs: number; error?: SerializedError }>;
  modelCalls: ModelCallAttempt[];
}

interface ModelCallAttempt {
  phase: "direct" | "repair";
  startedAt: string;
  promptChars: number;
  promptSha256: string;
  responseFormat?: unknown;
  durationMs?: number;
  responseChars?: number;
  responseSha256?: string;
  responsePreview?: string;
  progress: Array<Pick<WorkflowPiProgress, "stage" | "outputChars" | "thinkingChars" | "elapsedMs" | "idleElapsedMs">>;
  error?: SerializedError;
}

interface SerializedError {
  name: string;
  message: string;
  responseTextChars?: number;
  responseTextSha256?: string;
  responseTextPreview?: string;
}

function createInstrumentation(): HarnessInstrumentation {
  return { events: [], modelCalls: [] };
}

async function timed<T>(instrumentation: HarnessInstrumentation, name: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  try {
    const value = await fn();
    instrumentation.events.push({ name, startedAt, durationMs: Date.now() - started });
    return value;
  } catch (error) {
    instrumentation.events.push({ name, startedAt, durationMs: Date.now() - started, error: serializeError(error) });
    throw error;
  }
}

function compactProgress(progress: WorkflowPiProgress): Pick<WorkflowPiProgress, "stage" | "outputChars" | "thinkingChars" | "elapsedMs" | "idleElapsedMs"> {
  return {
    stage: progress.stage,
    outputChars: progress.outputChars,
    thinkingChars: progress.thinkingChars,
    elapsedMs: progress.elapsedMs,
    idleElapsedMs: progress.idleElapsedMs,
  };
}

async function writeReport(report: unknown): Promise<void> {
  const reportId = (process.env.AMBIENT_SCRAPLING_AUTOWIRE_JSON_REPORT_ID ?? "").trim().replace(/[^A-Za-z0-9_-]+/g, "-");
  const root = join(process.cwd(), "test-results", reportId ? `scrapling-autowire-json-${reportId}` : "scrapling-autowire-json");
  await mkdir(root, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const json = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(join(root, "latest.json"), json, "utf8");
  await writeFile(join(root, `run-${stamp}.json`), json, "utf8");
  await writeFile(join(root, "latest.md"), renderMarkdownReport(report), "utf8");
}

function renderMarkdownReport(report: unknown): string {
  const data = record(report);
  const score = record(data.score);
  const checks = record(score.checks);
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([key]) => `- ${key}`);
  return [
    "# Scrapling Autowire JSON Harness",
    "",
    `Created: ${String(data.createdAt ?? "")}`,
    `Proposal source: ${String(data.proposalSource ?? "")}`,
    `Score: ${String(score.points ?? "?")}/${String(score.maxPoints ?? "?")} (${String(score.ratio ?? "?")})`,
    "",
    "## Failed Checks",
    failed.length ? failed.join("\n") : "- none",
    "",
    "## Proposal",
    "```json",
    JSON.stringify(data.proposal ?? null, null, 2),
    "```",
  ].join("\n");
}

function serializeError(error: unknown): SerializedError {
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);
  const responseText = error instanceof WorkflowPiJsonValidationError ? error.responseText : undefined;
  return {
    name,
    message: message.slice(0, 2_000),
    ...(responseText
      ? {
          responseTextChars: responseText.length,
          responseTextSha256: sha256(responseText),
          responseTextPreview: responseText.slice(0, 2_000),
        }
      : {}),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function fence(value: string): string {
  return ["```", value, "```"].join("\n");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function redactBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return value;
  }
}

void stableJson;
