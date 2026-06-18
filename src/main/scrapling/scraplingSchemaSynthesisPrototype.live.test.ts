import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Type, type Tool, type ToolCall } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { aggressiveAmbientRetryPolicy } from "../ambient/aggressiveRetries";
import { liveAmbientProviderBaseUrl, liveAmbientProviderModel, readLiveAmbientProviderApiKey } from "../ambient/liveAmbientProviderConfig";
import { repairJsonWithPi, validateJsonAgainstSchemaStrict, type JsonRepairToolResult } from "../workflow/jsonRepairTool";
import {
  callWorkflowPiJson,
  callWorkflowPiText,
  WorkflowPiJsonValidationError,
  type WorkflowPiProgress,
  type WorkflowPiTextCallInput,
} from "../workflow/workflowPiTransport";

const runLive = process.env.AMBIENT_SCRAPLING_SCHEMA_SYNTHESIS_LIVE === "1";
const liveIt = runLive ? it : it.skip;

describe("Scrapling schema synthesis prototype", () => {
  liveIt(
    "gives Pi bounded curl access to Scrapling and asks it to synthesize an autowire schema",
    async () => {
      const instrumentation = createInstrumentation();
      const schema = schemaSynthesisResultSchema();
      const prompt = buildSchemaSynthesisPrompt(schema);
      const fetchRoot = await createFetchArtifactRoot("scrapling-schema-synthesis");
      const curlTool = createCurlFetchTool(fetchRoot, instrumentation);
      const apiKey = readLiveAmbientProviderApiKey({ purpose: "Scrapling schema synthesis prototype" });
      const model = liveAmbientProviderModel({
        preferredModelEnvNames: ["AMBIENT_SCRAPLING_SCHEMA_SYNTHESIS_MODEL", "AMBIENT_PROJECT_BOARD_MODEL", "AMBIENT_LIVE_MODEL"],
        fallbackModel: AMBIENT_DEFAULT_MODEL,
      });
      const baseUrl = liveAmbientProviderBaseUrl();

      let result: SchemaSynthesisResult | undefined;
      let directError: SerializedError | undefined;
      let repair: JsonRepairToolResult | undefined;
      let resultSource: "direct_json_schema" | "json_repair" | "none" = "none";
      const abortController = new AbortController();
      const hostAbort = setTimeout(() => abortController.abort(new Error("Schema synthesis host deadline exceeded.")), 150_000);
      try {
        result = await timed(instrumentation, "schema_synthesis_call", () =>
          callWorkflowPiJson<SchemaSynthesisResult>({
            apiKey,
            baseUrl,
            model,
            prompt,
            schemaName: "scrapling_schema_synthesis",
            responseSchema: schema,
            validate: (value) => validateSchemaSynthesisResult(value, schema),
            maxValidationRetries: 1,
            maxTokens: 10_000,
            idleTimeoutMs: 45_000,
            absoluteTimeoutMs: 150_000,
            enforceAbsoluteTimeout: true,
            signal: abortController.signal,
            retryPolicy: aggressiveAmbientRetryPolicy(),
            tools: [curlTool.tool],
            initialToolChoice: "auto",
            maxToolRounds: 8,
            executeTool: curlTool.execute,
            onToolProgress: (progress) => instrumentation.toolProgress.push(progress),
            textCall: instrumentedTextCall(instrumentation),
          }),
        );
        resultSource = "direct_json_schema";
      } catch (error) {
        directError = serializeError(error);
        if (error instanceof WorkflowPiJsonValidationError && error.responseText.trim()) {
          repair = await timed(instrumentation, "json_repair_call", () =>
            repairJsonWithPi(
              {
                schemaName: "scrapling_schema_synthesis",
                schema,
                invalidJsonText: error.responseText,
                validationErrors: [directError?.message ?? "Direct schema synthesis call failed deterministic validation."],
                repairInstruction: "Repair only JSON/schema shape. Preserve the schema-synthesis decisions, evidence, and proposed proposalSchema.",
                preserveSemantics: true,
              },
              {
                apiKey,
                baseUrl,
                model,
                maxTokens: 10_000,
                idleTimeoutMs: 45_000,
                absoluteTimeoutMs: 120_000,
                enforceAbsoluteTimeout: true,
                maxValidationRetries: 1,
                signal: abortController.signal,
                retryPolicy: aggressiveAmbientRetryPolicy(),
                textCall: instrumentedTextCall(instrumentation, "repair"),
              },
            ),
          );
          if (repair.repaired) {
            result = validateSchemaSynthesisResult(repair.value, schema);
            resultSource = "json_repair";
          }
        }
      } finally {
        clearTimeout(hostAbort);
      }

      const score = result ? scoreSchemaSynthesis(result, instrumentation) : emptyScore();
      const report = {
        createdAt: new Date().toISOString(),
        harness: "scrapling-schema-synthesis-v1",
        source: "https://github.com/D4Vinci/Scrapling",
        model,
        baseUrl: baseUrl ? redactBaseUrl(baseUrl) : undefined,
        prompt: { chars: prompt.length, sha256: sha256(prompt) },
        fetchRoot,
        resultSource,
        score,
        directError,
        repair,
        result,
        instrumentation,
      };
      await writeReport(report);

      expect(result).toBeDefined();
      expect(score.checks.parsedJson).toBe(true);
    },
    240_000,
  );
});

interface SchemaSynthesisResult {
  status: "schema_ready" | "needs_more_evidence" | "unsupported" | "unsafe";
  confidence: number;
  targetRepoUrl: string;
  evidenceRequests: Array<{ url: string; purpose: string; usedForFactIds: string[] }>;
  discoveredFacts: Array<{
    id: string;
    fact: string;
    sourceUrl: string;
    confidence: number;
    quoteOrPointer: string;
  }>;
  semanticObligations: Array<{
    id: string;
    description: string;
    sourceFactIds: string[];
    schemaPath: string;
    enforcement: "const" | "enum" | "pattern" | "required-object" | "deterministic-validator";
  }>;
  proposalSchema: Record<string, unknown>;
  deterministicValidators: Array<{ id: string; description: string; schemaPath: string; failureMessage: string }>;
  promptGuidance: string[];
  risks: string[];
  questions: string[];
  rationale: string;
}

function schemaSynthesisResultSchema(): Record<string, unknown> {
  const stringArray = { type: "array", items: { type: "string" } };
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "status",
      "confidence",
      "targetRepoUrl",
      "evidenceRequests",
      "discoveredFacts",
      "semanticObligations",
      "proposalSchema",
      "deterministicValidators",
      "promptGuidance",
      "risks",
      "questions",
      "rationale",
    ],
    properties: {
      status: { enum: ["schema_ready", "needs_more_evidence", "unsupported", "unsafe"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      targetRepoUrl: { type: "string" },
      evidenceRequests: {
        type: "array",
        minItems: 2,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["url", "purpose", "usedForFactIds"],
          properties: {
            url: { type: "string" },
            purpose: { type: "string" },
            usedForFactIds: stringArray,
          },
        },
      },
      discoveredFacts: {
        type: "array",
        minItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "fact", "sourceUrl", "confidence", "quoteOrPointer"],
          properties: {
            id: { type: "string" },
            fact: { type: "string" },
            sourceUrl: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            quoteOrPointer: { type: "string" },
          },
        },
      },
      semanticObligations: {
        type: "array",
        minItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "description", "sourceFactIds", "schemaPath", "enforcement"],
          properties: {
            id: { type: "string" },
            description: { type: "string" },
            sourceFactIds: stringArray,
            schemaPath: { type: "string" },
            enforcement: { enum: ["const", "enum", "pattern", "required-object", "deterministic-validator"] },
          },
        },
      },
      proposalSchema: {
        type: "object",
        additionalProperties: true,
        description: "JSON Schema object Pi proposes for the later Scrapling autowire plan.",
      },
      deterministicValidators: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "description", "schemaPath", "failureMessage"],
          properties: {
            id: { type: "string" },
            description: { type: "string" },
            schemaPath: { type: "string" },
            failureMessage: { type: "string" },
          },
        },
      },
      promptGuidance: stringArray,
      risks: stringArray,
      questions: stringArray,
      rationale: { type: "string" },
    },
  };
}

function validateSchemaSynthesisResult(value: unknown, schema: Record<string, unknown>): SchemaSynthesisResult {
  const result = validateJsonAgainstSchemaStrict(schema, value, "Scrapling schema synthesis result") as SchemaSynthesisResult;
  const proposalSchema = result.proposalSchema;
  if (!proposalSchema || proposalSchema.type !== "object" || typeof proposalSchema.properties !== "object") {
    throw new Error("Scrapling schema synthesis result: proposalSchema must be an object JSON Schema with properties.");
  }
  const obligationIds = new Set(result.semanticObligations.map((item) => item.id.toLowerCase()));
  for (const required of ["cli_entrypoint", "mcp_boundary", "extract_output", "skills_path", "healthcheck"]) {
    if (![...obligationIds].some((id) => id.includes(required))) {
      throw new Error(`Scrapling schema synthesis result: semanticObligations must include a ${required} obligation.`);
    }
  }
  return result;
}

function buildSchemaSynthesisPrompt(schema: Record<string, unknown>): string {
  return [
    "You are an Ambient Desktop capability autowire schema author.",
    "You have one bounded network tool, curl_fetch. Use it to inspect the target GitHub repository before producing the final JSON.",
    "Target repository URL: https://github.com/D4Vinci/Scrapling",
    "Before final JSON, make at least three successful curl_fetch calls. First fetch `https://github.com/D4Vinci/Scrapling` with purpose `inspect repo root for package metadata, docs, and source paths`.",
    "",
    "Task: synthesize a JSON Schema for a future Scrapling autowire proposal. Do not write the final autowire proposal itself.",
    "Instead, discover the repo shape and decide what semantic obligations the future autowire proposal schema must require.",
    "",
    "Ambient schema-authoring contract:",
    "- Preserve important repo evidence as typed fields when a later proposal must not miss it.",
    "- Use JSON Schema for structural and semantic constraints that fit: required objects, const, enum, and pattern.",
    "- Use deterministicValidators for rules JSON Schema cannot express cleanly, such as comparing descriptor command executable to healthCheck item 0.",
    "- Keep provider/tool quirks outside global prompts. Put product semantics in the synthesized schema or deterministic validators.",
    "- If a CLI command writes files, the schema should force a wrapper/artifact decision rather than allowing vague stdout claims.",
    "- If a repo exposes an MCP server and a direct CLI, the schema should force the later plan to select and explain the runtime boundary.",
    "- If a repo exposes an interactive shell, the schema should prevent selecting it as the primary automation command unless explicitly justified.",
    "- descriptor.skills must be a path to generated skill markdown, not tags.",
    "- The future proposal schema should be strict: additionalProperties false wherever practical.",
    "",
    "Evidence expectations:",
    "- Start from the target repo URL.",
    "- Fetch enough repository evidence to cover package metadata, CLI entrypoints, CLI docs, and CLI implementation behavior.",
    "- You may fetch raw.githubusercontent.com URLs for likely files once you infer them from the repo shape.",
    "- Do not call URLs outside D4Vinci/Scrapling on github.com, raw.githubusercontent.com, or api.github.com.",
    "",
    "Do not answer from memory. If you cannot complete at least three successful fetches, return status needs_more_evidence and explain which fetch failed.",
    "Return only JSON matching this result schema. No markdown and no prose outside JSON.",
    JSON.stringify(schema, null, 2),
  ].join("\n");
}

function scoreSchemaSynthesis(result: SchemaSynthesisResult, instrumentation: HarnessInstrumentation) {
  const fetchedUrls = instrumentation.fetches.map((fetch) => fetch.url);
  const fetchedText = fetchedUrls.join("\n").toLowerCase();
  const factText = result.discoveredFacts.map((fact) => `${fact.id} ${fact.fact} ${fact.quoteOrPointer}`).join("\n").toLowerCase();
  const obligationText = result.semanticObligations.map((item) => `${item.id} ${item.description} ${item.schemaPath} ${item.enforcement}`).join("\n").toLowerCase();
  const validatorText = result.deterministicValidators.map((item) => `${item.id} ${item.description} ${item.schemaPath}`).join("\n").toLowerCase();
  const schemaText = JSON.stringify(result.proposalSchema).toLowerCase();
  const checks = {
    parsedJson: true,
    usedCurlTool: instrumentation.fetches.length >= 2,
    fetchedRepoRoot: fetchedUrls.some((url) => url === "https://github.com/D4Vinci/Scrapling"),
    fetchedPackageMetadata: /pyproject\.toml|setup\.py|setup\.cfg|package metadata/.test(fetchedText),
    fetchedCliDocsOrSource: /docs\/cli|scrapling\/cli\.py/.test(fetchedText),
    discoveredEntrypoint: /scrapling\s*=\s*scrapling\.cli:main|scrapling\.cli:main/.test(factText),
    discoveredExtractWritesFile: /extract.*(writes|output_file|output file)|output_file.*extract/.test(factText),
    discoveredMcpBoundary: /mcp/.test(factText),
    discoveredInteractiveShell: /interactive|shell/.test(factText),
    obligationEntrypoint: /entrypoint|cli_entrypoint/.test(obligationText),
    obligationMcpBoundary: /mcp/.test(obligationText),
    obligationExtractOutput: /extract.*output|output.*extract|wrapper/.test(obligationText),
    obligationSkillsPath: /skills.*path|skill.*md|skills_path/.test(obligationText),
    obligationHealthCheckExecutable: /health.*executable|healthcheck/.test(obligationText),
    schemaHasSemanticContract: /semanticcontract/.test(schemaText),
    schemaConstrainsSkillsPath: /skill\\.md|skills/.test(schemaText) && /pattern|const/.test(schemaText),
    schemaConstrainsRuntimeBoundary: /mcp|runtimeboundary|selectedruntime/.test(schemaText),
    schemaConstrainsExtractOutput: /extract.*output|output.*file|wrapper/.test(schemaText),
    validatorForHealthCheckExecutable: /health.*executable|healthcheck.*item 0|item 0/.test(validatorText),
    avoidsGlobalPipSudo: /sudo|global pip/.test(validatorText + obligationText + result.rationale.toLowerCase()),
  };
  const points = Object.values(checks).filter(Boolean).length;
  const maxPoints = Object.keys(checks).length;
  return { points, maxPoints, ratio: Number((points / maxPoints).toFixed(3)), checks };
}

function emptyScore() {
  return { points: 0, maxPoints: 20, ratio: 0, checks: { parsedJson: false } };
}

function createCurlFetchTool(fetchRoot: string, instrumentation: HarnessInstrumentation): {
  tool: Tool;
  execute: (toolCall: ToolCall, validatedArgs: unknown) => Promise<string>;
} {
  return {
    tool: {
      name: "curl_fetch",
      description:
        "Fetch a bounded text URL from D4Vinci/Scrapling on github.com, raw.githubusercontent.com, or api.github.com. Returns preview and writes full text to a report artifact.",
      parameters: Type.Object({
        url: Type.String({ description: "HTTPS URL to fetch. Must stay within D4Vinci/Scrapling GitHub hosts." }),
        purpose: Type.String({ description: "Why this URL is needed for schema synthesis." }),
      }),
    },
    execute: async (_toolCall, validatedArgs) => {
      const args = record(validatedArgs);
      const url = requiredString(args.url, "url");
      const purpose = requiredString(args.purpose, "purpose");
      const startedAt = new Date().toISOString();
      const started = Date.now();
      try {
        assertAllowedScraplingUrl(url);
        const response = await fetch(url, {
          redirect: "follow",
          headers: { "user-agent": "ambient-scrapling-schema-synthesis" },
        });
        const finalUrl = response.url;
        assertAllowedScraplingUrl(finalUrl);
        const contentType = response.headers.get("content-type") ?? "";
        const text = await response.text();
        const limitedText = text.slice(0, 200_000);
        const hash = sha256(limitedText);
        const artifactPath = join(fetchRoot, `${instrumentation.fetches.length + 1}-${hash.slice(0, 12)}.txt`);
        await writeFile(artifactPath, limitedText, "utf8");
        const result = {
          ok: response.ok,
          status: response.status,
          url,
          finalUrl,
          purpose,
          contentType,
          bytes: Buffer.byteLength(limitedText, "utf8"),
          sha256: hash,
          artifactPath,
          truncated: text.length > limitedText.length,
          preview: limitedText.slice(0, 16_000),
        };
        instrumentation.fetches.push({
          url,
          finalUrl,
          purpose,
          status: response.status,
          bytes: result.bytes,
          sha256: hash,
          artifactPath,
          durationMs: Date.now() - started,
          startedAt,
        });
        return JSON.stringify(result);
      } catch (error) {
        const safeUrl = safeToolText(url, 240);
        const safePurpose = safeToolText(purpose, 240);
        instrumentation.fetches.push({
          url: safeUrl,
          purpose: safePurpose,
          status: 0,
          bytes: 0,
          sha256: "",
          artifactPath: "",
          durationMs: Date.now() - started,
          startedAt,
          error: serializeError(error),
        });
        return JSON.stringify({
          ok: false,
          url: safeUrl,
          purpose: safePurpose,
          error: error instanceof Error ? error.message : String(error),
          retryInstruction:
            "Call curl_fetch again with a valid https URL from the D4Vinci/Scrapling allowlist, for example https://github.com/D4Vinci/Scrapling.",
        });
      }
    },
  };
}

function assertAllowedScraplingUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("curl_fetch only allows https URLs.");
  if (url.hostname === "github.com") {
    if (url.pathname === "/D4Vinci/Scrapling" || url.pathname.startsWith("/D4Vinci/Scrapling/")) return;
  }
  if (url.hostname === "raw.githubusercontent.com") {
    if (url.pathname.startsWith("/D4Vinci/Scrapling/")) return;
  }
  if (url.hostname === "api.github.com") {
    if (url.pathname.startsWith("/repos/D4Vinci/Scrapling/")) return;
  }
  throw new Error(`curl_fetch blocked URL outside D4Vinci/Scrapling allowlist: ${value}`);
}

async function createFetchArtifactRoot(name: string): Promise<string> {
  const reportId = reportIdSuffix();
  const root = join(process.cwd(), "test-results", reportId ? `${name}-${reportId}` : name, "fetches");
  await mkdir(root, { recursive: true });
  return root;
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
  toolProgress: unknown[];
  fetches: FetchRecord[];
}

interface FetchRecord {
  url: string;
  finalUrl?: string;
  purpose: string;
  status: number;
  bytes: number;
  sha256: string;
  artifactPath: string;
  durationMs: number;
  startedAt: string;
  error?: SerializedError;
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
  return { events: [], modelCalls: [], toolProgress: [], fetches: [] };
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
  const reportId = reportIdSuffix();
  const root = join(process.cwd(), "test-results", reportId ? `scrapling-schema-synthesis-${reportId}` : "scrapling-schema-synthesis");
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
    "# Scrapling Schema Synthesis Harness",
    "",
    `Created: ${String(data.createdAt ?? "")}`,
    `Result source: ${String(data.resultSource ?? "")}`,
    `Score: ${String(score.points ?? "?")}/${String(score.maxPoints ?? "?")} (${String(score.ratio ?? "?")})`,
    "",
    "## Failed Checks",
    failed.length ? failed.join("\n") : "- none",
    "",
    "## Result",
    "```json",
    JSON.stringify(data.result ?? null, null, 2),
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

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
  return value;
}

function safeToolText(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...[truncated ${value.length - maxChars} chars]`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function reportIdSuffix(): string {
  return (process.env.AMBIENT_SCRAPLING_SCHEMA_SYNTHESIS_REPORT_ID ?? "").trim().replace(/[^A-Za-z0-9_-]+/g, "-");
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
