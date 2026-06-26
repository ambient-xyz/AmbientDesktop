import { createHash } from "node:crypto";
import type { Tool } from "@mariozechner/pi-ai";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { aggressiveAmbientRetryPolicy } from "./mcpAutowireAmbientFacade";
import {
  createMcpAutowireDiscoveryTools,
  ensureBootstrapDiscoveryEvidence,
  executeAutowireDiscoveryTool,
  initialDiscoveryToolChoice,
  normalizeDiscoveryGrants,
  parseTargetUrl,
  runMcpAutowireDeterministicPreDiscovery,
  suggestedDiscoveryUrls,
  type FetchLike,
  type McpAutowireDiscoveryFetch,
  type McpAutowireDiscoveryGrants,
  type McpAutowireDiscoverySearch,
  type McpAutowireTarget,
} from "./mcpAutowireDiscovery";
import {
  deterministicEvidenceText,
  deterministicPackageIdentity,
  deterministicSourceOnlyMcpCandidate,
  deterministicStandardMcpPackageCandidate,
  hasSourceOnlyMcpSignal,
  sourceOnlyMcpHintText,
} from "./mcpAutowireDeterministicCandidates";
import {
  mcpAutowireCandidatePromptSchema,
  validateMcpAutowireCandidate,
  type McpAutowireCandidate,
  type McpAutowireValidationReport,
} from "./mcpAutowireSchemas";
import {
  classifyMcpAutowireSource,
  sourceHandoffValidationReport,
  type McpAutowireSourceClassification,
} from "./mcpAutowireSourceClassification";
import { resolveMcpAutowireNetworkFacts } from "./mcpAutowirePlannerNetworkFacts";
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

export { createMcpAutowireDiscoveryTools, executeAutowireDiscoveryTool };
export { mcpAutowirePlanResultText } from "./mcpAutowirePlanOutput";
export type { McpAutowireSourceClassification, McpAutowireSourceClassificationKind } from "./mcpAutowireSourceClassification";
export type {
  McpAutowireDiscoveryFetch,
  McpAutowireDiscoveryGrants,
  McpAutowireDiscoverySearch,
  McpAutowireDiscoverySearchResult,
} from "./mcpAutowireDiscovery";

export interface McpAutowirePlanInput {
  targetUrl: string;
  instructions?: string;
  allowedDiscovery?: McpAutowireDiscoveryGrants;
  signal?: AbortSignal;
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
          forceSourceOnly:
            hasSourceOnlyMcpSignal(sourceOnlyMcpHintText({ target, instructions: input.instructions, searches })) ||
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
    executeTool: async (toolCall, args) =>
      executeAutowireDiscoveryTool(toolCall, args, {
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
  return (
    [summary.trim(), bootstrapSummary].filter(Boolean).join("\n\n") ||
    "Discovery completed without a textual summary; use the deterministic discovery trace."
  );
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
    input.instructions
      ? `User/schema instructions: ${input.instructions}`
      : "User/schema instructions: classify the best supported Ambient install lane.",
    "",
    "Discovery grants:",
    `- URL fetch: ${input.grants.urlFetch}`,
    `- GitHub raw fetch: ${input.grants.githubRaw}`,
    `- Target repo/source search: ${input.grants.search}`,
    `- Max fetches: ${input.grants.maxFetches}`,
    `- Max searches: ${input.grants.maxSearches}`,
    `- Max chars per fetch: ${input.grants.maxBytesPerFetch}`,
    "",
    input.suggestedUrls.length
      ? `Suggested evidence URLs:\n${input.suggestedUrls.map((url) => `- ${url}`).join("\n")}`
      : "Suggested evidence URLs: none.",
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
    input.instructions
      ? `User/schema instructions: ${input.instructions}`
      : "User/schema instructions: use the Ambient MCP autowire schema and classify the best install lane.",
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

function discoveryTraceForPrompt(input: { fetches: McpAutowireDiscoveryFetch[]; searches: McpAutowireDiscoverySearch[] }): string {
  const fetches = input.fetches.length
    ? input.fetches
        .map((fetch, index) => {
          const size =
            fetch.returnedChars === undefined
              ? ""
              : ` ${fetch.returnedChars}/${fetch.totalChars ?? fetch.returnedChars} chars${fetch.truncated ? " truncated" : ""}`;
          const code = fetch.statusCode === undefined ? "" : ` HTTP ${fetch.statusCode}`;
          return `fetch${index + 1}: ${fetch.status} ${fetch.url}${code}${size}${fetch.reason ? ` reason=${fetch.reason}` : ""}`;
        })
        .join("\n")
    : "none";
  const searches = input.searches.length
    ? input.searches
        .map((search, index) => {
          const results =
            search.results
              ?.slice(0, 8)
              .map((result) => `${result.path} -> ${result.rawUrl} (${result.reason})`)
              .join("; ") ?? "";
          return `search${index + 1}: ${search.status} ${search.query}${search.defaultBranch ? ` branch=${search.defaultBranch}` : ""}${results ? ` results: ${results}` : ""}${search.reason ? ` reason=${search.reason}` : ""}`;
        })
        .join("\n")
    : "none";
  return `Fetches:\n${fetches}\n\nSearches:\n${searches}`;
}

type McpAutowireFilesystemMount = McpAutowireCandidate["permissions"]["filesystem"]["extraMounts"][number];

function applyInstructionFilesystemMounts<T>(candidate: T, input: Pick<McpAutowirePlanInput, "instructions">): T {
  const explicitMounts = explicitFilesystemMountsFromInstructions(input.instructions);
  if (!explicitMounts.length || !isMcpAutowireCandidateLike(candidate)) return candidate;
  if (candidate.runtime.provider !== "toolhive" || candidate.recommendedLane !== "standard-mcp") return candidate;

  const existingMounts = candidate.permissions.filesystem.extraMounts;
  const mergedMounts = mergeFilesystemMounts(existingMounts, explicitMounts);
  if (mergedMounts.length === existingMounts.length) return candidate;

  const evidenceId = uniqueEvidenceId(
    candidate.evidence.map((entry) => entry.id),
    "user-filesystem-mount",
  );
  return {
    ...candidate,
    permissions: {
      ...candidate.permissions,
      filesystem: {
        ...candidate.permissions.filesystem,
        extraMounts: mergedMounts,
      },
      evidenceRefs: [...new Set([...candidate.permissions.evidenceRefs, evidenceId])],
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
      regex:
        /\b(?:with\s+)?(?:read[-\s]?only|readonly|ro)\s+(?:filesystem\s+|file\s+|directory\s+|folder\s+)?access\s+to\s+(?:"([^"]+)"|'([^']+)'|(\/[^\s,;:)]+))/gi,
      mode: "read-only",
    },
    {
      regex:
        /\b(?:with\s+)?(?:read[-\s]?write|read\/write|rw|write)\s+(?:filesystem\s+|file\s+|directory\s+|folder\s+)?access\s+to\s+(?:"([^"]+)"|'([^']+)'|(\/[^\s,;:)]+))/gi,
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
  const path =
    value
      .trim()
      .replace(/\\/g, "/")
      .replace(/[.!?]+$/g, "")
      .replace(/\/+$/, "") || "/";
  if (!path.startsWith("/")) return undefined;
  if (path.includes("\0") || path.includes("\n") || path.includes("\r") || path.includes(":")) return undefined;
  if (path.split("/").includes("..")) return undefined;
  return path;
}

function safeContainerPathLeaf(hostPath: string): string {
  const leaf = hostPath.split("/").filter(Boolean).pop() ?? "mount";
  return (
    leaf
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "mount"
  );
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
  return (
    candidate.schemaVersion === "ambient-mcp-autowire-v1" &&
    Boolean(candidate.runtime && typeof candidate.runtime === "object") &&
    Boolean(candidate.permissions?.filesystem && Array.isArray(candidate.permissions.filesystem.extraMounts)) &&
    Boolean(candidate.evidence && Array.isArray(candidate.evidence))
  );
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

function workflowPiJsonValidationErrorLike(error: unknown): WorkflowPiJsonValidationError | { responseText?: string } | undefined {
  if (error instanceof WorkflowPiJsonValidationError) return error;
  if (!(error instanceof Error)) return undefined;
  if (!error.message.startsWith("Ambient/Pi JSON response for ")) return undefined;
  return "responseText" in error && typeof (error as { responseText?: unknown }).responseText === "string"
    ? { responseText: (error as { responseText: string }).responseText }
    : {};
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
