import type { McpAutowireDiscoveryFetch, McpAutowireDiscoverySearch } from "./mcpAutowireDiscovery";
import type { McpAutowireCandidate } from "./mcpAutowireSchemas";
import type { McpAutowireValidationReport } from "./mcpAutowireSchemas";
import type { McpAutowireSourceClassification } from "./mcpAutowireSourceClassification";

interface McpAutowirePlanOutputResult {
  targetUrl: string;
  session: {
    id: string;
    purpose: "mcp-autowire-install";
  };
  candidate?: McpAutowireCandidate;
  sourceClassification?: McpAutowireSourceClassification;
  validation: McpAutowireValidationReport;
  discovery: {
    fetches: McpAutowireDiscoveryFetch[];
    searches: McpAutowireDiscoverySearch[];
  };
}

export function mcpAutowirePlanResultText(result: McpAutowirePlanOutputResult, input: { candidateRef?: string } = {}): string {
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
    ? result.discovery.fetches
        .map((entry) => {
          const size =
            entry.returnedChars === undefined
              ? ""
              : ` ${entry.returnedChars}/${entry.totalChars ?? entry.returnedChars} chars${entry.truncated ? " truncated" : ""}`;
          const code = entry.statusCode === undefined ? "" : ` HTTP ${entry.statusCode}`;
          return `- ${entry.status}: ${entry.url}${code}${size}${entry.reason ? ` (${entry.reason})` : ""}`;
        })
        .join("\n")
    : "- none";
  const searches = result.discovery.searches.length
    ? result.discovery.searches
        .map((entry) => {
          const count = entry.resultCount === undefined ? "" : ` ${entry.resultCount} result${entry.resultCount === 1 ? "" : "s"}`;
          return `- ${entry.status}: ${entry.query}${count}${entry.defaultBranch ? ` branch=${entry.defaultBranch}` : ""}${entry.reason ? ` (${entry.reason})` : ""}`;
        })
        .join("\n")
    : "- none";
  const sourceBuildHandoff = customSourceBuildPlanHandoffText(result, input);
  return [
    `MCP autowire plan for ${result.targetUrl}.`,
    `Autowire session: ${result.session.id} (${result.session.purpose})`,
    sourceClassification
      ? `Source classification: ${sourceClassification.kind} (${sourceClassification.confidence} confidence)`
      : undefined,
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
    candidate
      ? input.candidateRef
        ? "Candidate ref for ambient_mcp_autowire_review:"
        : "Candidate JSON for ambient_mcp_autowire_review:"
      : "Candidate handoff:",
    candidate
      ? (input.candidateRef ?? JSON.stringify(candidate, null, 2))
      : sourceClassification
        ? "No MCP candidate was generated because the source appears to be a normal application setup target. Do not call ambient_mcp_autowire_review for this result."
        : "{}",
    sourceBuildHandoff ? "" : undefined,
    sourceBuildHandoff ? "Source-only ToolHive handoff:" : undefined,
    sourceBuildHandoff,
    "",
    nextActionText(result),
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function customSourceBuildPlanHandoffText(result: McpAutowirePlanOutputResult, input: { candidateRef?: string } = {}): string | undefined {
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
  return (
    candidate.recommendedLane === "standard-mcp" &&
    candidate.source.kind === "github" &&
    Boolean(candidate.source.url) &&
    candidate.runtime.provider === "toolhive" &&
    (candidate.runtime.sourceKind === "unknown" || !candidate.runtime.package)
  );
}

function nextActionText(result: McpAutowirePlanOutputResult): string {
  const candidate = result.candidate;
  if (!candidate && result.sourceClassification) return result.sourceClassification.nextAction;
  if (!candidate) return "Next action: fix schema/validation errors and rerun autowire planning.";
  if (result.validation.readyForToolHiveRun) {
    if (candidate.source.registryId)
      return `Next action: call ambient_mcp_server_describe for registry server ${candidate.source.registryId}.`;
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
