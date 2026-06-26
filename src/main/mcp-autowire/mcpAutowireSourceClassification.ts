import { hasFetchedSourceOnlyMcpSignal } from "./mcpAutowireDeterministicCandidates";
import type { McpAutowireDiscoveryFetch, McpAutowireDiscoverySearch } from "./mcpAutowireDiscovery";
import { classificationFetchPreview } from "./mcpAutowirePlannerNetworkFacts";
import type { McpAutowireValidationReport } from "./mcpAutowireSchemas";

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
  setupRecipe?:
    | "mcp-autowire-candidate"
    | "cli-wrapper-candidate"
    | "normal-app-setup"
    | "containerized-app-setup"
    | "exploratory-evidence";
  nextAction: string;
}

export function classifyMcpAutowireSource(input: {
  discoverySummary: string;
  fetches: McpAutowireDiscoveryFetch[];
  searches: McpAutowireDiscoverySearch[];
}): McpAutowireSourceClassification {
  const fetchText = input.fetches
    .map((entry) => [entry.status, entry.url, entry.reason ?? "", classificationFetchPreview(entry)].join(" "))
    .join("\n");
  const searchText = input.searches
    .map((entry) =>
      [entry.query, entry.reason ?? "", ...(entry.results ?? []).map((result) => `${result.path} ${result.reason}`)].join(" "),
    )
    .join("\n");
  const text = `${input.discoverySummary}\n${fetchText}\n${searchText}`.toLowerCase();
  const signals: string[] = [];
  const addSignal = (condition: boolean, signal: string) => {
    if (condition) signals.push(signal);
  };

  const notMcpSourceSignal =
    /not an? mcp|not an? mcp server|not a model context protocol server|without mcp support|does not expose.*mcp|no mcp server scripts/.test(
      text,
    );
  const missingMcpMetadataSignal =
    /no mcp entry|no mcp configuration|no mcp metadata|no mcp server metadata|no mcp server configuration|no mcp server entry|no @modelcontextprotocol|server\.json.*absent|\.mcp\.json.*absent/.test(
      text,
    );
  const noMcpSignal = notMcpSourceSignal || missingMcpMetadataSignal;
  const packageMcpSignal = /npx:\/\/|uvx:\/\/|\bnpx\s+(?:-[\w-]+\s+)*@[a-z0-9_.-]+\/mcp\b|@[a-z0-9_.-]+\/mcp\b/.test(text);
  const explicitMetadataSignal =
    /server\.json.*(?:mcp|declares|metadata)|@modelcontextprotocol|remote mcp endpoint|streamable-http|smithery|toolhive registry/.test(
      text,
    );
  const fetchedSourceMcpSignal = hasFetchedSourceOnlyMcpSignal(input.fetches);
  const sourceMcpSignal =
    fetchedSourceMcpSignal || /\bmcp server\b|\bmcp servers\b|fastmcp|from fastmcp import|fastmcp\s*\(|mcp\s*=\s*fastmcp/.test(text);
  const genericMcpSignal = /mcpservers?|mcp clients?|mcp server scripts?/.test(text);
  const mcpMetadataSignal =
    packageMcpSignal ||
    fetchedSourceMcpSignal ||
    (!notMcpSourceSignal && sourceMcpSignal) ||
    (!noMcpSignal && (explicitMetadataSignal || genericMcpSignal));
  const normalAppSignal =
    /next\.js|vite|react|svelte|vue|electron|tauri|desktop app|web application|full-stack|monorepo|video editor|package\.json|bun |bun@|pnpm |npm |yarn |cargo |rust\/|apps\/web|apps\/desktop/.test(
      text,
    );
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
      summary:
        "The source has MCP metadata, package, endpoint, or documented MCP runtime indicators; continue generating an MCP autowire candidate.",
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
        nextAction:
          "Next action: stop MCP autowire review and continue ordinary app setup. Call ambient_setup_runtime_preflight before installing dependencies, then call ambient_setup_recipe_describe with recipe containerized_app to inspect Docker/Podman/compose files, host runtime readiness, compose command availability, port conflicts, and existing project containers before using normal file, shell, and browser tools to install and run the app. After attempting validation, call ambient_setup_final_report so the user-facing report distinguishes running state, changed files, placeholders, and unvalidated features.",
      };
    }
    return {
      kind: "normal_app",
      confidence: "high",
      summary: "The source appears to be a normal application repository, not an MCP/plugin server.",
      signals,
      setupRecipe: "normal-app-setup",
      nextAction:
        "Next action: stop MCP autowire review and continue ordinary app setup with normal file, shell, and browser tools. Call ambient_setup_runtime_preflight before installing dependencies, use repository setup docs, validate the running app directly, then call ambient_setup_final_report before the user-facing final answer.",
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

export function sourceHandoffValidationReport(classification: McpAutowireSourceClassification): McpAutowireValidationReport {
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
