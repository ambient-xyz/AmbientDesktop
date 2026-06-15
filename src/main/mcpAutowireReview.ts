import {
  MCP_INSTALL_REVIEW_SCHEMA_VERSION,
  parseMcpAutowireCandidate,
  parseMcpInstallReview,
  validateMcpAutowireCandidate,
  type McpAutowireCandidate,
  type McpAutowireOutcome,
  type McpAutowireValidationReport,
  type McpInstallReview,
} from "./mcpAutowireSchemas";
import { isSecretReference } from "./secretReferenceStore";

export interface McpAutowireSecretBinding {
  envName: string;
  secretRef: string;
}

export interface McpAutowireReviewInput {
  candidate: unknown;
  expectedCandidateHash?: string;
  secretBindings?: McpAutowireSecretBinding[];
}

export interface McpAutowireReviewHandoff {
  kind:
    | "toolhive-registry-install"
    | "standard-mcp-import"
    | "standard-mcp-import-deferred"
    | "custom-source-build"
    | "remote-mcp-proxy"
    | "remote-mcp-import-deferred"
    | "guided-local-bridge"
    | "blocked";
  status: "ready" | "deferred" | "blocked";
  outcome: McpAutowireOutcome;
  summary: string;
  nextToolName?: string;
  nextToolInput?: Record<string, unknown>;
  forbiddenAlternatives?: string[];
  nextAction: string;
}

export interface McpAutowireReviewResult {
  candidate: McpAutowireCandidate;
  validation: McpAutowireValidationReport;
  review: McpInstallReview;
  handoff: McpAutowireReviewHandoff;
}

export function reviewMcpAutowireCandidate(input: McpAutowireReviewInput): McpAutowireReviewResult {
  const candidate = parseMcpAutowireCandidate(input.candidate);
  const validation = validateMcpAutowireCandidate(candidate);
  const secretBindings = input.secretBindings ?? [];
  const candidateHash = validation.candidateHash;
  const initialHandoff = mcpAutowireHandoff(candidate, validation);
  const blockers = [
    ...validation.blockers.map((issue) => `${issue.code}: ${issue.message}`),
    ...candidateHashMismatchBlocker(input.expectedCandidateHash, candidateHash),
    ...secretBindingBlockers(candidate, secretBindings),
  ];
  const handoff = finalHandoff(initialHandoff, blockers);
  const boundSecretNames = new Set(secretBindings.map((binding) => binding.envName));
  const warnings = [
    ...validation.warnings.map((issue) => `${issue.code}: ${issue.message}`),
    ...candidate.secrets
      .filter((secret) => !secret.required && !boundSecretNames.has(secret.name))
      .map((secret) => `Optional secret ${secret.name} is not bound; runtime may have lower limits or reduced functionality.`),
  ];

  const review = parseMcpInstallReview({
    schemaVersion: MCP_INSTALL_REVIEW_SCHEMA_VERSION,
    candidateId: candidate.id,
    title: `Review ${candidate.displayName}`,
    recommendedLane: candidate.recommendedLane,
    outcome: handoff.outcome,
    summary: reviewSummary(candidate, handoff),
    sourceSummary: sourceSummary(candidate),
    runtimeSummary: runtimeSummary(candidate),
    permissionSummary: permissionSummary(candidate),
    secretSummary: secretSummary(candidate),
    validationSummary: validationSummary(candidate),
    blockers,
    warnings,
    evidenceRefs: candidate.evidence.map((entry) => entry.id).slice(0, 20),
  });

  return { candidate, validation, review, handoff };
}

export function mcpAutowireReviewResultText(result: McpAutowireReviewResult, input: { candidateRef?: string } = {}): string {
  const blockers = result.review.blockers.length ? result.review.blockers.map((item) => `- ${item}`).join("\n") : "- none";
  const warnings = result.review.warnings.length ? result.review.warnings.map((item) => `- ${item}`).join("\n") : "- none";
  const nextToolInput = reviewNextToolInput(result, input);
  const nextTool = result.handoff.nextToolName
    ? `Next tool: ${result.handoff.nextToolName} ${JSON.stringify(nextToolInput ?? {})}`
    : "Next tool: none";
  const forbiddenAlternatives = result.handoff.forbiddenAlternatives?.length
    ? ["", "Forbidden alternatives:", ...result.handoff.forbiddenAlternatives.map((item) => `- ${item}`)]
    : [];
  return [
    result.review.title,
    result.review.summary,
    "",
    `Handoff: ${result.handoff.kind} (${result.handoff.status}, ${result.handoff.outcome})`,
    result.handoff.summary,
    nextTool,
    `Next action: ${result.handoff.nextAction}`,
    ...forbiddenAlternatives,
    "",
    `Source: ${result.review.sourceSummary}`,
    `Runtime: ${result.review.runtimeSummary}`,
    `Permissions: ${result.review.permissionSummary}`,
    `Secrets: ${result.review.secretSummary}`,
    `Validation: ${result.review.validationSummary}`,
    `Risk: ${result.candidate.riskSummary.level} - ${result.candidate.riskSummary.reasons.join(" ")}`,
    "",
    "Blockers:",
    blockers,
    "",
    "Warnings:",
    warnings,
  ].join("\n");
}

export function reviewNextToolInput(
  result: McpAutowireReviewResult,
  input: { candidateRef?: string } = {},
): Record<string, unknown> | undefined {
  if (input.candidateRef && (
    result.handoff.nextToolName === "ambient_mcp_standard_import_describe" ||
    result.handoff.nextToolName === "ambient_mcp_autowire_source_build_describe" ||
    result.handoff.nextToolName === "ambient_mcp_autowire_custom_source_describe"
  )) {
    return {
      candidateRef: input.candidateRef,
      ...(result.validation.candidateHash ? { expectedCandidateHash: result.validation.candidateHash } : {}),
    };
  }
  return result.handoff.nextToolInput;
}

function mcpAutowireHandoff(candidate: McpAutowireCandidate, validation: McpAutowireValidationReport): McpAutowireReviewHandoff {
  if (candidate.recommendedLane === "guided-local-bridge") {
    return {
      kind: "guided-local-bridge",
      status: "deferred",
      outcome: "guided-setup-required",
      summary: "Candidate requires a local application or bridge setup and must not be silently containerized.",
      nextToolName: "ambient_mcp_guided_bridge_describe",
      nextToolInput: { candidate, expectedCandidateHash: validation.candidateHash },
      nextAction: "Call ambient_mcp_guided_bridge_describe to present setup steps and exact loopback preflight targets before any user-approved local bridge check.",
    };
  }
  if (isCustomSourceBuildHandoffCandidate(candidate)) {
    return {
      kind: "custom-source-build",
      status: "deferred",
      outcome: "deferred-unsupported-lane",
      summary: "Candidate is a GitHub-backed MCP source that needs a reviewed custom ToolHive source build before import.",
      nextToolName: "ambient_mcp_autowire_source_build_describe",
      nextToolInput: { candidate, expectedCandidateHash: validation.candidateHash },
      forbiddenAlternatives: [
        "Do not clone/build/register this MCP as an unmanaged local bridge for an install request.",
        "Do not run README install scripts, raw cargo builds, claude mcp add, or raw ToolHive state edits outside the Ambient source-build lane.",
        "Do not proceed to guided-local-bridge unless the user explicitly asks for a user-run local bridge instead of a ToolHive-wrapped install.",
      ],
      nextAction: "Call ambient_mcp_autowire_source_build_describe to derive a pinned Ambient source-build plan. Continue to Standard MCP import only after ambient_mcp_autowire_source_build_create emits a custom-image candidate with pinned commit and OCI digest.",
    };
  }
  if (validation.blockers.length || candidate.recommendedLane === "exploratory") {
    return {
      kind: "blocked",
      status: "blocked",
      outcome: validation.outcome,
      summary: "Candidate is not ready for install review.",
      nextAction: "Resolve blockers or gather more evidence before any MCP install path.",
    };
  }
  if (candidate.recommendedLane === "standard-mcp") {
    if (candidate.source.registryId && candidate.runtime.sourceKind === "registry") {
      return {
        kind: "toolhive-registry-install",
        status: "ready",
        outcome: "ready",
        summary: "Candidate maps to the existing ToolHive registry install path.",
        nextToolName: "ambient_mcp_server_describe",
        nextToolInput: { serverId: candidate.source.registryId },
        nextAction: "Call ambient_mcp_server_describe with the exact registry server id, then install only after user approval.",
      };
    }
    if (isSupportedStandardImportCandidate(candidate)) {
      return {
        kind: "standard-mcp-import",
        status: "ready",
        outcome: "ready",
        summary: `Candidate maps to the reviewed Standard MCP import path for ${candidate.runtime.sourceKind} metadata.`,
        nextToolName: "ambient_mcp_standard_import_describe",
        nextToolInput: { candidate, expectedCandidateHash: validation.candidateHash },
        nextAction: "Call ambient_mcp_standard_import_describe with the exact candidate before requesting approval-gated install.",
      };
    }
    return {
      kind: "standard-mcp-import-deferred",
      status: "deferred",
      outcome: "deferred-unsupported-lane",
      summary: `Candidate is a standard MCP source (${candidate.runtime.sourceKind}) but Ambient has not connected that import lane to execution yet.`,
      nextAction: "Do not run this candidate yet. Route it through the reviewed Standard MCP import implementation or find a matching ToolHive registry server.",
    };
  }
  if (candidate.recommendedLane === "remote-mcp") {
    if (isSupportedRemoteMcpProxyCandidate(candidate)) {
      return {
        kind: "remote-mcp-proxy",
        status: "ready",
        outcome: "ready",
        summary: "Candidate maps to the reviewed ToolHive remote MCP proxy path.",
        nextToolName: "ambient_mcp_remote_proxy_describe",
        nextToolInput: { candidate, expectedCandidateHash: validation.candidateHash },
        nextAction: "Call ambient_mcp_remote_proxy_describe with the exact candidate before requesting approval-gated install.",
      };
    }
    return {
      kind: "remote-mcp-import-deferred",
      status: "deferred",
      outcome: "deferred-unsupported-lane",
      summary: "Candidate is a remote MCP endpoint; the ToolHive-proxied remote MCP runtime path is not connected yet.",
      nextAction: "Show the remote endpoint, secret, and network implications to the user. Import only after the ToolHive proxy path exists.",
    };
  }
  return {
    kind: "blocked",
    status: "blocked",
    outcome: validation.outcome === "ready" ? "blocked-risk" : validation.outcome,
    summary: "Candidate lane is not supported by the current MCP runtime paths.",
    nextAction: "Resolve candidate lane and runtime evidence before proceeding.",
  };
}

function isSupportedStandardImportCandidate(candidate: McpAutowireCandidate): boolean {
  if (candidate.runtime.sourceKind === "registry") return false;
  const registryType = candidate.runtime.package?.registryType;
  return registryType === "pypi" || registryType === "npm" || registryType === "oci";
}

function isCustomSourceBuildHandoffCandidate(candidate: McpAutowireCandidate): boolean {
  return candidate.recommendedLane === "standard-mcp" &&
    candidate.source.kind === "github" &&
    Boolean(candidate.source.url) &&
    candidate.runtime.provider === "toolhive" &&
    (candidate.runtime.sourceKind === "unknown" || !candidate.runtime.package);
}

function isSupportedRemoteMcpProxyCandidate(candidate: McpAutowireCandidate): boolean {
  return candidate.runtime.provider === "remote-mcp" &&
    candidate.runtime.sourceKind === "remote-url" &&
    Boolean(candidate.runtime.remote?.url) &&
    (candidate.runtime.transport === "streamable-http" || candidate.runtime.transport === "sse");
}

function finalHandoff(previous: McpAutowireReviewHandoff, blockers: string[]): McpAutowireReviewHandoff {
  if (!blockers.length) return previous;
  if (
    previous.kind === "custom-source-build" &&
    blockers.every(isCustomSourceBuildCompatibleBlocker)
  ) return previous;
  if (
    (previous.outcome === "deferred-unsupported-lane" || previous.outcome === "guided-setup-required") &&
    blockers.every(isDeferredCompatibleBlocker)
  ) return previous;
  return {
    ...previous,
    status: "blocked",
    outcome: previous.outcome === "ready" ? "blocked-risk" : previous.outcome,
    summary: `${previous.summary} ${blockers.length} blocker${blockers.length === 1 ? "" : "s"} must be resolved before execution.`,
    nextToolName: undefined,
    nextToolInput: undefined,
  };
}

function isDeferredCompatibleBlocker(blocker: string): boolean {
  return blocker.startsWith("open_question.blocks_install:");
}

function isCustomSourceBuildCompatibleBlocker(blocker: string): boolean {
  return blocker.startsWith("toolhive.package_required:") ||
    blocker.startsWith("lane.unsupported_standard_source:");
}

function candidateHashMismatchBlocker(expected: string | undefined, actual: string | undefined): string[] {
  if (!expected || !actual || expected === actual) return [];
  return [`Candidate hash mismatch: expected ${expected}, got ${actual}. Re-run autowire plan or review the current candidate before proceeding.`];
}

function secretBindingBlockers(candidate: McpAutowireCandidate, bindings: McpAutowireSecretBinding[]): string[] {
  const declaredSecretNames = new Set(candidate.secrets.map((secret) => secret.name));
  const boundSecretNames = new Set(bindings.map((binding) => binding.envName));
  return [
    ...candidate.secrets
      .filter((secret) => secret.required && !boundSecretNames.has(secret.name))
      .map((secret) => `Required secret ${secret.name} must be bound through ambient_mcp_secret_request before install; never ask for the value in chat or create placeholder secret files.`),
    ...bindings
      .filter((binding) => !declaredSecretNames.has(binding.envName))
      .map((binding) => `Secret binding ${binding.envName} is not declared by the autowire candidate.`),
    ...bindings
      .filter((binding, index) => bindings.findIndex((candidateBinding) => candidateBinding.envName === binding.envName) !== index)
      .map((binding) => `Secret binding ${binding.envName} is duplicated.`),
    ...bindings
      .filter((binding) => !isSecretReference(binding.secretRef.trim()))
      .map((binding) => `Secret binding ${binding.envName} must use an Ambient-managed secret reference.`),
  ];
}

function reviewSummary(candidate: McpAutowireCandidate, handoff: McpAutowireReviewHandoff): string {
  return `${candidate.displayName} is classified as ${candidate.recommendedLane}. ${handoff.summary}`;
}

function sourceSummary(candidate: McpAutowireCandidate): string {
  const pieces = [
    `source kind ${candidate.source.kind}`,
    candidate.source.registryId ? `registry id ${candidate.source.registryId}` : undefined,
    candidate.source.packageName ? `package ${candidate.source.packageName}` : undefined,
    candidate.source.url ? `url ${candidate.source.url}` : undefined,
    candidate.source.resolvedCommit ? `commit ${candidate.source.resolvedCommit}` : undefined,
  ].filter(Boolean);
  return pieces.join("; ");
}

function runtimeSummary(candidate: McpAutowireCandidate): string {
  const entrypoint = candidate.runtime.package?.entrypoint
    ? ` entrypoint ${candidate.runtime.package.entrypoint.kind}${candidate.runtime.package.entrypoint.command ? `:${candidate.runtime.package.entrypoint.command}` : ""}${candidate.runtime.package.entrypoint.module ? `:${candidate.runtime.package.entrypoint.module}` : ""}`
    : "";
  const args = candidate.runtime.package?.packageArguments?.length
    ? ` args ${candidate.runtime.package.packageArguments.map((arg) => packageArgumentSummary(arg)).join(" ")}`
    : "";
  const pkg = candidate.runtime.package
    ? ` package ${candidate.runtime.package.registryType}:${candidate.runtime.package.identifier}${candidate.runtime.package.version ? `@${candidate.runtime.package.version}` : ""}${entrypoint}${args}`
    : "";
  const remote = candidate.runtime.remote?.url ? ` remote ${candidate.runtime.remote.url}` : "";
  const bridge = candidate.runtime.localBridge
    ? ` local bridge ${candidate.runtime.localBridge.host ?? "host?"}:${candidate.runtime.localBridge.port ?? "port?"}`
    : "";
  return `${candidate.runtime.provider}/${candidate.runtime.sourceKind}/${candidate.runtime.transport}${pkg}${remote}${bridge}`;
}

function packageArgumentSummary(arg: NonNullable<McpAutowireCandidate["runtime"]["package"]>["packageArguments"][number]): string {
  if (arg.type === "switch") return arg.name ?? "(switch?)";
  if (arg.type === "flag") return `${arg.name ?? "(flag?)"}=${arg.valueHint ?? "(value?)"}`;
  if (arg.type === "env") return `${arg.name ?? "(env?)"}=<non-secret>`;
  return arg.valueHint ?? arg.name ?? "(arg?)";
}

function permissionSummary(candidate: McpAutowireCandidate): string {
  const network = candidate.permissions.network;
  const hosts = network.allowHosts.length ? ` hosts ${network.allowHosts.join(", ")}` : "";
  const ports = network.allowPorts.length ? ` ports ${network.allowPorts.join(", ")}` : "";
  const apps = candidate.permissions.localApps.length ? ` local apps ${candidate.permissions.localApps.join(", ")}` : "";
  return `Network ${network.mode}${hosts}${ports}; workspace read=${candidate.permissions.filesystem.workspaceRead}; workspace write=${candidate.permissions.filesystem.workspaceWrite}; extra mounts=${candidate.permissions.filesystem.extraMounts.length}${apps}.`;
}

function secretSummary(candidate: McpAutowireCandidate): string {
  if (!candidate.secrets.length) return "No secrets declared.";
  return candidate.secrets.map((secret) => `${secret.required ? "Required" : "Optional"} ${secret.name}: ${secret.purpose}`).join(" ");
}

function validationSummary(candidate: McpAutowireCandidate): string {
  const tools = candidate.validationPlan.expectedTools.length
    ? ` Expected tools: ${candidate.validationPlan.expectedTools.slice(0, 12).join(", ")}${candidate.validationPlan.expectedTools.length > 12 ? ", ..." : ""}.`
    : "";
  return `Preflight: ${candidate.validationPlan.preflights.join(", ")}.${tools}`;
}
