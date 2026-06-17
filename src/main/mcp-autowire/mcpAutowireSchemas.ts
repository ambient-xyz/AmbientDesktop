import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";

export const MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION = "ambient-mcp-autowire-v1";
export const MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION = "ambient-mcp-custom-source-build-v1";
export const TOOLHIVE_RUN_PLAN_SCHEMA_VERSION = "ambient-toolhive-run-plan-v1";
export const MCP_INSTALL_REVIEW_SCHEMA_VERSION = "ambient-mcp-install-review-v1";
export const MCP_TOOL_SNAPSHOT_SCHEMA_VERSION = "ambient-mcp-tool-snapshot-v1";

const evidenceRefSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["url", "file", "command", "registry", "readme", "server-json", "package-manifest", "release", "awesome-mcp", "other"]),
  locator: z.string().min(1),
  summary: z.string().min(1),
}).strict();

const evidenceIdArraySchema = z.array(z.string().min(1)).min(1);

const sourceSchema = z.object({
  kind: z.enum(["github", "toolhive-registry", "mcp-server-json", "awesome-mcp", "remote-url", "local", "other"]),
  url: z.string().url().optional(),
  registryId: z.string().min(1).optional(),
  resolvedCommit: z.string().min(7).optional(),
  packageName: z.string().min(1).optional(),
  evidenceRefs: evidenceIdArraySchema,
}).strict();

const packageArgumentSchema = z.object({
  type: z.enum(["positional", "flag", "switch", "env", "unknown"]),
  name: z.string().min(1).optional(),
  valueHint: z.string().min(1).optional(),
  isFixed: z.boolean(),
}).strict();

const packageEntrypointSchema = z.object({
  kind: z.enum(["default", "package-bin", "module"]),
  command: z.string().min(1).optional(),
  module: z.string().min(1).optional(),
  fromPackage: z.string().min(1).optional(),
}).strict();

const runtimePackageSchema = z.object({
  registryType: z.enum(["npm", "pypi", "oci", "mcpb", "github-release", "other"]),
  identifier: z.string().min(1),
  version: z.string().min(1).optional(),
  runtimeHint: z.string().min(1).optional(),
  runtimeImage: z.string().min(1).optional(),
  fileSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  digest: z.string().min(1).optional(),
  entrypoint: packageEntrypointSchema.optional(),
  packageArguments: z.array(packageArgumentSchema).default([]),
}).strict();

const runtimeUpdatePolicySchema = z.object({
  mode: z.enum(["pinned", "managed-browser-security", "user-managed-runtime", "unverified"]),
  reason: z.string().min(1),
  evidenceRefs: evidenceIdArraySchema,
}).strict();

const runtimeSourceBuildSchema = z.object({
  schemaVersion: z.literal(MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION),
  sourceUrl: z.string().url(),
  resolvedCommit: z.string().min(7),
  recipeKind: z.enum(["existing-dockerfile", "generated-dockerfile", "existing-reviewed-image"]),
  recipeHash: z.string().regex(/^[a-f0-9]{64}$/i),
  imageIdentifier: z.string().min(1),
  imageDigest: z.string().min(1),
  evidenceRefs: evidenceIdArraySchema,
}).strict();

const runtimeSchema = z.object({
  provider: z.enum(["toolhive", "remote-mcp", "ambient-cli", "guided-local"]),
  sourceKind: z.enum(["registry", "server-json", "npm", "pypi", "oci", "mcpb", "remote-url", "local-bridge", "custom-image", "unknown"]),
  transport: z.enum(["stdio", "streamable-http", "sse", "cli", "local-http", "unknown"]),
  package: runtimePackageSchema.optional(),
  remote: z.object({
    url: z.string().url(),
    headers: z.array(z.string().min(1)).default([]),
  }).strict().optional(),
  localBridge: z.object({
    commandHint: z.string().min(1).optional(),
    host: z.string().min(1).optional(),
    port: z.number().int().positive().max(65535).optional(),
    setupSteps: z.array(z.string().min(1)).default([]),
  }).strict().optional(),
  updatePolicy: runtimeUpdatePolicySchema.optional(),
  sourceBuild: runtimeSourceBuildSchema.optional(),
  evidenceRefs: evidenceIdArraySchema,
}).strict();

const secretSchema = z.object({
  name: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
  required: z.boolean(),
  secret: z.literal(true),
  purpose: z.string().min(1),
  evidenceRefs: evidenceIdArraySchema,
}).strict();

const networkPermissionSchema = z.object({
  mode: z.enum(["disabled", "local-only", "allowlist", "isolated", "broad"]),
  allowHosts: z.array(z.string().min(1)).default([]),
  allowPorts: z.array(z.number().int().positive().max(65535)).default([]),
  justification: z.string().min(1).optional(),
}).strict();

const filesystemMountSchema = z.object({
  path: z.string().min(1),
  containerPath: z.string().min(1).optional(),
  mode: z.enum(["read-only", "read-write"]),
  purpose: z.string().min(1),
}).strict();

const permissionsSchema = z.object({
  network: networkPermissionSchema,
  filesystem: z.object({
    workspaceRead: z.boolean(),
    workspaceWrite: z.boolean(),
    extraMounts: z.array(filesystemMountSchema).default([]),
  }).strict(),
  localApps: z.array(z.string().min(1)).default([]),
  evidenceRefs: evidenceIdArraySchema,
}).strict();

const smokeCallSchema = z.object({
  tool: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
}).strict();

const validationPlanSchema = z.object({
  preflights: z.array(z.string().min(1)).min(1),
  expectedTools: z.array(z.string().min(1)).default([]),
  smokeCall: smokeCallSchema.optional(),
  evidenceRefs: evidenceIdArraySchema,
}).strict();

const openQuestionSchema = z.object({
  question: z.string().min(1),
  impact: z.enum(["source", "runtime", "transport", "secret", "network", "filesystem", "local-app", "validation", "license", "other"]),
  blocksInstall: z.boolean(),
  evidenceRefs: z.array(z.string().min(1)).default([]),
}).strict();

const riskSummarySchema = z.object({
  level: z.enum(["low", "medium", "high"]),
  reasons: z.array(z.string().min(1)).min(1),
  evidenceRefs: evidenceIdArraySchema,
}).strict();

export const mcpAutowireCandidateSchema = z.object({
  schemaVersion: z.literal(MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION),
  id: z.string().min(1),
  displayName: z.string().min(1),
  source: sourceSchema,
  recommendedLane: z.enum(["standard-mcp", "remote-mcp", "cli-wrapper", "guided-local-bridge", "exploratory"]),
  runtime: runtimeSchema,
  secrets: z.array(secretSchema).default([]),
  permissions: permissionsSchema,
  validationPlan: validationPlanSchema,
  evidence: z.array(evidenceRefSchema).min(1),
  openQuestions: z.array(openQuestionSchema).default([]),
  riskSummary: riskSummarySchema,
}).strict();

const toolHiveRunPlanSchema = z.object({
  schemaVersion: z.literal(TOOLHIVE_RUN_PLAN_SCHEMA_VERSION),
  serverId: z.string().min(1),
  workloadName: z.string().min(1),
  group: z.literal("ambient"),
  isolateNetwork: z.boolean(),
  permissionProfilePath: z.string().min(1),
  sourceRef: z.string().min(1),
  transport: z.enum(["stdio", "streamable-http", "sse"]),
  envSecretRefs: z.array(z.object({ envName: z.string().min(1), secretRef: z.string().min(1) }).strict()).default([]),
  evidenceRefs: evidenceIdArraySchema,
}).strict();

const mcpInstallReviewSchema = z.object({
  schemaVersion: z.literal(MCP_INSTALL_REVIEW_SCHEMA_VERSION),
  candidateId: z.string().min(1),
  title: z.string().min(1),
  recommendedLane: z.enum(["standard-mcp", "remote-mcp", "cli-wrapper", "guided-local-bridge", "exploratory"]),
  outcome: z.enum(["ready", "deferred-unsupported-lane", "guided-setup-required", "needs-evidence", "blocked-risk"]),
  summary: z.string().min(1),
  sourceSummary: z.string().min(1),
  runtimeSummary: z.string().min(1),
  permissionSummary: z.string().min(1),
  secretSummary: z.string().min(1),
  validationSummary: z.string().min(1),
  blockers: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  evidenceRefs: evidenceIdArraySchema,
}).strict();

const mcpToolSnapshotSchema = z.object({
  schemaVersion: z.literal(MCP_TOOL_SNAPSHOT_SCHEMA_VERSION),
  serverId: z.string().min(1),
  workloadName: z.string().min(1).optional(),
  capturedAt: z.string().datetime(),
  descriptorHash: z.string().min(1),
  tools: z.array(z.object({
    name: z.string().min(1),
    description: z.string().default(""),
    inputSchema: z.record(z.string(), z.unknown()).optional(),
    outputSchema: z.record(z.string(), z.unknown()).optional(),
  }).strict()).default([]),
}).strict();

export type McpAutowireCandidate = z.infer<typeof mcpAutowireCandidateSchema>;
export type ToolHiveRunPlan = z.infer<typeof toolHiveRunPlanSchema>;
export type McpInstallReview = z.infer<typeof mcpInstallReviewSchema>;
export type McpToolSnapshot = z.infer<typeof mcpToolSnapshotSchema>;
export type McpAutowireStatus = "ready-for-review" | "guided-setup" | "blocked";
export type McpAutowireOutcome =
  | "ready"
  | "deferred-unsupported-lane"
  | "guided-setup-required"
  | "needs-evidence"
  | "blocked-risk";

export interface McpAutowireValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: "blocker" | "warning";
}

export interface McpAutowireValidationReport {
  status: McpAutowireStatus;
  outcome: McpAutowireOutcome;
  readyForToolHiveRun: boolean;
  readyForUserReview: boolean;
  candidate?: McpAutowireCandidate;
  candidateHash?: string;
  blockers: McpAutowireValidationIssue[];
  warnings: McpAutowireValidationIssue[];
}

export function parseMcpAutowireCandidate(value: unknown): McpAutowireCandidate {
  return mcpAutowireCandidateSchema.parse(value);
}

export function parseToolHiveRunPlan(value: unknown): ToolHiveRunPlan {
  return toolHiveRunPlanSchema.parse(value);
}

export function parseMcpInstallReview(value: unknown): McpInstallReview {
  return mcpInstallReviewSchema.parse(value);
}

export function parseMcpToolSnapshot(value: unknown): McpToolSnapshot {
  return mcpToolSnapshotSchema.parse(value);
}

export function validateMcpAutowireCandidate(value: unknown): McpAutowireValidationReport {
  const parsed = mcpAutowireCandidateSchema.safeParse(value);
  if (!parsed.success) {
    return {
      status: "blocked",
      outcome: "needs-evidence",
      readyForToolHiveRun: false,
      readyForUserReview: false,
      blockers: parsed.error.issues.map((issue) => ({
        code: "schema.invalid",
        path: issue.path.length ? `$.${issue.path.join(".")}` : "$",
        message: issue.message,
        severity: "blocker",
      })),
      warnings: [],
    };
  }

  const candidate = parsed.data;
  const blockers: McpAutowireValidationIssue[] = [];
  const warnings: McpAutowireValidationIssue[] = [];
  const addIssue = (severity: "blocker" | "warning", code: string, path: string, message: string) => {
    (severity === "blocker" ? blockers : warnings).push({ severity, code, path, message });
  };

  const evidenceIds = new Set(candidate.evidence.map((entry) => entry.id));
  const checkEvidenceRefs = (path: string, refs: string[]) => {
    if (refs.length === 0) addIssue("blocker", "evidence.required", path, "Install-critical claims require at least one evidence reference.");
    for (const ref of refs) {
      if (!evidenceIds.has(ref)) addIssue("blocker", "evidence.unknown_ref", path, `Evidence reference "${ref}" is not declared in candidate.evidence.`);
    }
  };

  checkEvidenceRefs("$.source.evidenceRefs", candidate.source.evidenceRefs);
  checkEvidenceRefs("$.runtime.evidenceRefs", candidate.runtime.evidenceRefs);
  if (candidate.runtime.updatePolicy) {
    checkEvidenceRefs("$.runtime.updatePolicy.evidenceRefs", candidate.runtime.updatePolicy.evidenceRefs);
  }
  checkEvidenceRefs("$.permissions.evidenceRefs", candidate.permissions.evidenceRefs);
  checkEvidenceRefs("$.validationPlan.evidenceRefs", candidate.validationPlan.evidenceRefs);
  checkEvidenceRefs("$.riskSummary.evidenceRefs", candidate.riskSummary.evidenceRefs);
  candidate.secrets.forEach((secret, index) => checkEvidenceRefs(`$.secrets[${index}].evidenceRefs`, secret.evidenceRefs));
  candidate.openQuestions.forEach((question, index) => {
    if (question.evidenceRefs.length) checkEvidenceRefs(`$.openQuestions[${index}].evidenceRefs`, question.evidenceRefs);
  });

  if (candidate.source.kind === "github" && !candidate.source.url?.startsWith("https://github.com/")) {
    addIssue("blocker", "source.github_url_required", "$.source.url", "GitHub sources must use a https://github.com/ URL.");
  }
  if (candidate.source.kind === "github" && !candidate.source.resolvedCommit) {
    addIssue("warning", "source.unpinned_github", "$.source.resolvedCommit", "GitHub source is not pinned to a resolved commit yet; promotion to default catalog must pin it.");
  }

  const expectedProvider = expectedProviderForLane(candidate.recommendedLane);
  if (expectedProvider && candidate.runtime.provider !== expectedProvider) {
    addIssue(
      "blocker",
      "lane.provider_mismatch",
      "$.runtime.provider",
      `Lane ${candidate.recommendedLane} requires runtime provider ${expectedProvider}, not ${candidate.runtime.provider}.`,
    );
  }

  if (candidate.recommendedLane === "standard-mcp" && !["registry", "server-json", "npm", "pypi", "oci", "mcpb", "custom-image"].includes(candidate.runtime.sourceKind)) {
    addIssue("blocker", "lane.unsupported_standard_source", "$.runtime.sourceKind", "Standard MCP requires registry, server-json, npm, pypi, oci, mcpb, or source-built custom-image metadata.");
  }
  if (candidate.recommendedLane === "remote-mcp" && (!candidate.runtime.remote?.url || !["streamable-http", "sse"].includes(candidate.runtime.transport))) {
    addIssue("blocker", "remote_mcp.transport_required", "$.runtime", "Remote MCP requires a remote URL and streamable-http or sse transport.");
  }
  if (candidate.recommendedLane === "remote-mcp" && candidate.runtime.remote?.url && ["streamable-http", "sse"].includes(candidate.runtime.transport)) {
    const endpoint = remoteMcpEndpointFacts(candidate.runtime.remote.url);
    if (!endpoint.ok) {
      addIssue("blocker", endpoint.code, "$.runtime.remote.url", endpoint.message);
    } else {
      if (candidate.permissions.network.mode !== "allowlist") {
        addIssue("blocker", "remote_mcp.allowlist_required", "$.permissions.network.mode", "Remote MCP candidates must use a fixed endpoint allowlist.");
      }
      if (!remoteMcpHostAllowed(endpoint.host, candidate.permissions.network.allowHosts)) {
        addIssue("blocker", "remote_mcp.host_allowlist_mismatch", "$.permissions.network.allowHosts", `Remote MCP endpoint host ${endpoint.host} must be explicitly allowed.`);
      }
      if (!candidate.permissions.network.allowPorts.includes(endpoint.port)) {
        addIssue("blocker", "remote_mcp.port_allowlist_mismatch", "$.permissions.network.allowPorts", `Remote MCP endpoint port ${endpoint.port} must be explicitly allowed.`);
      }
    }

    const unsupportedHeaders = unsupportedRemoteMcpHeaders(candidate.runtime.remote.headers);
    if (unsupportedHeaders.length > 0) {
      addIssue("blocker", "remote_mcp.unsupported_header", "$.runtime.remote.headers", `Remote MCP proxy currently supports no custom runtime headers except Authorization bearer-token delivery from Ambient secret refs. Unsupported headers: ${unsupportedHeaders.join(", ")}.`);
    }
  }
  if (candidate.recommendedLane === "cli-wrapper" && candidate.runtime.transport !== "cli") {
    addIssue("blocker", "cli_wrapper.transport_required", "$.runtime.transport", "CLI wrapper lane requires cli transport.");
  }
  if (candidate.recommendedLane === "exploratory") {
    addIssue("blocker", "lane.exploratory_not_installable", "$.recommendedLane", "Exploratory candidates are analysis-only until promoted to a supported install lane.");
  }

  if (candidate.runtime.provider === "toolhive" && candidate.recommendedLane !== "exploratory") {
    if (!candidate.runtime.package && candidate.runtime.sourceKind !== "registry") {
      addIssue("blocker", "toolhive.package_required", "$.runtime.package", "ToolHive run plans need a registry id or package metadata.");
    }
    if (candidate.runtime.package?.entrypoint) {
      const entrypoint = candidate.runtime.package.entrypoint;
      const path = "$.runtime.package.entrypoint";
      if (entrypoint.kind === "default" && (entrypoint.command || entrypoint.module || entrypoint.fromPackage)) {
        addIssue("blocker", "entrypoint.default_has_override_fields", path, "Default package entrypoints must not include command, module, or fromPackage override fields.");
      }
      if (entrypoint.kind === "package-bin" && !entrypoint.command) {
        addIssue("blocker", "entrypoint.package_bin_command_required", `${path}.command`, "Package-bin entrypoint overrides require the exact executable/bin command.");
      }
      if (entrypoint.kind === "module" && !entrypoint.module) {
        addIssue("blocker", "entrypoint.module_required", `${path}.module`, "Module entrypoint overrides require the exact module path.");
      }
      if (entrypoint.command && !isSafePackageEntrypointCommand(entrypoint.command)) {
        addIssue("blocker", "entrypoint.unsafe_command", `${path}.command`, "Package entrypoint command must be a safe executable name, not a shell snippet, path, URL, or flag.");
      }
      if (entrypoint.module && !isSafePackageEntrypointModule(entrypoint.module)) {
        addIssue("blocker", "entrypoint.unsafe_module", `${path}.module`, "Package entrypoint module must be a safe dotted module path.");
      }
      if (entrypoint.fromPackage && normalizePackageNameForEntrypoint(entrypoint.fromPackage) !== normalizePackageNameForEntrypoint(candidate.runtime.package.identifier)) {
        addIssue("blocker", "entrypoint.from_package_mismatch", `${path}.fromPackage`, "Package entrypoint fromPackage must match runtime.package.identifier.");
      }
      if (entrypoint.kind !== "default") {
        addIssue("warning", "entrypoint.override_review", path, "Package entrypoint overrides require explicit runtime review because not every ToolHive protocol scheme can encode a non-default executable.");
      }
    }
    if (candidate.runtime.sourceKind === "custom-image") {
      const pkg = candidate.runtime.package;
      const sourceBuiltReady = candidate.source.resolvedCommit &&
        pkg?.registryType === "oci" &&
        Boolean(pkg.identifier) &&
        Boolean(pkg.digest) &&
        candidate.runtime.updatePolicy?.mode === "pinned";
      if (!sourceBuiltReady) {
        addIssue(
          "blocker",
          "toolhive.custom_image_source_build_required",
          "$.runtime.sourceKind",
          "Custom images must come from a reviewed source-built lane with source.resolvedCommit, OCI image identifier, image digest, and pinned update policy before ToolHive import.",
        );
      }
      const sourceBuild = candidate.runtime.sourceBuild;
      if (sourceBuild) {
        if (candidate.source.url && sourceBuild.sourceUrl !== candidate.source.url) {
          addIssue("blocker", "toolhive.custom_image_source_url_mismatch", "$.runtime.sourceBuild.sourceUrl", "Custom source-build sourceUrl must match candidate source.url.");
        }
        if (candidate.source.resolvedCommit && sourceBuild.resolvedCommit !== candidate.source.resolvedCommit) {
          addIssue("blocker", "toolhive.custom_image_commit_mismatch", "$.runtime.sourceBuild.resolvedCommit", "Custom source-build commit must match source.resolvedCommit.");
        }
        if (pkg?.identifier && sourceBuild.imageIdentifier !== pkg.identifier) {
          addIssue("blocker", "toolhive.custom_image_identifier_mismatch", "$.runtime.sourceBuild.imageIdentifier", "Custom source-build imageIdentifier must match runtime.package.identifier.");
        }
        if (pkg?.digest && sourceBuild.imageDigest !== pkg.digest) {
          addIssue("blocker", "toolhive.custom_image_digest_mismatch", "$.runtime.sourceBuild.imageDigest", "Custom source-build imageDigest must match runtime.package.digest.");
        }
      }
    }
    if (candidate.runtime.package && !candidate.runtime.package.version && !candidate.runtime.package.digest && !candidate.runtime.package.fileSha256) {
      addIssue("warning", "package.unpinned", "$.runtime.package", "Package is not version, digest, or sha256 pinned.");
    }
  }

  const updatePolicy = candidate.runtime.updatePolicy;
  if (updatePolicy?.mode === "unverified") {
    addIssue("blocker", "runtime.update_policy_unverified", "$.runtime.updatePolicy.mode", "Runtime update policy must be verified before install.");
  }
  if (
    updatePolicy?.mode === "pinned" &&
    candidate.runtime.package &&
    !candidate.runtime.package.version &&
    !candidate.runtime.package.digest &&
    !candidate.runtime.package.fileSha256
  ) {
    addIssue("blocker", "runtime.pinned_update_policy_requires_pin", "$.runtime.updatePolicy.mode", "Pinned runtime policy requires a package version, digest, or sha256.");
  }
  if (candidate.recommendedLane !== "exploratory" && isBrowserRuntimeCandidate(candidate)) {
    if (!updatePolicy) {
      addIssue("blocker", "runtime.browser_update_policy_required", "$.runtime.updatePolicy", "Browser-class MCP runtimes must declare a managed browser security-update policy.");
    } else if (updatePolicy.mode === "user-managed-runtime" && candidate.recommendedLane !== "guided-local-bridge") {
      addIssue("blocker", "runtime.browser_user_managed_only_guided", "$.runtime.updatePolicy.mode", "User-managed browser runtime updates are only acceptable for guided local bridges.");
    } else if (updatePolicy.mode !== "managed-browser-security" && updatePolicy.mode !== "user-managed-runtime") {
      addIssue("blocker", "runtime.browser_managed_update_required", "$.runtime.updatePolicy.mode", "Browser-class MCP runtimes must use managed-browser-security or user-managed-runtime update policy.");
    }
  }
  if (updatePolicy?.mode === "managed-browser-security" && !isBrowserRuntimeCandidate(candidate)) {
    addIssue("warning", "runtime.browser_update_policy_without_browser_signal", "$.runtime.updatePolicy.mode", "Managed browser security updates were declared, but Ambient did not detect browser runtime evidence.");
  }

  if (candidate.permissions.network.mode === "broad") {
    if (!candidate.permissions.network.justification) {
      addIssue("blocker", "network.broad_without_justification", "$.permissions.network", "Broad network egress requires an explicit justification.");
    } else {
      addIssue("warning", "network.broad_review", "$.permissions.network", "Broad network egress requires explicit user review.");
    }
  }
  if (candidate.recommendedLane === "remote-mcp" && candidate.permissions.network.allowHosts.length === 0) {
    addIssue("blocker", "network.remote_allow_host_required", "$.permissions.network.allowHosts", "Remote MCP candidates must declare at least one allowed host.");
  }
  if (candidate.permissions.filesystem.workspaceWrite) {
    addIssue("warning", "filesystem.workspace_write_review", "$.permissions.filesystem.workspaceWrite", "Workspace write access requires explicit user review.");
  }
  candidate.permissions.filesystem.extraMounts.forEach((mount, index) => {
    if (isBroadHostPath(mount.path)) {
      addIssue("blocker", "filesystem.broad_mount", `$.permissions.filesystem.extraMounts[${index}].path`, "Broad host filesystem mounts are not allowed for autowire.");
    } else if (mount.mode === "read-write") {
      addIssue("warning", "filesystem.mount_write_review", `$.permissions.filesystem.extraMounts[${index}].mode`, "Read-write extra mounts require explicit user review.");
    }
    if (mount.containerPath && !isSafeContainerMountPath(mount.containerPath)) {
      addIssue("blocker", "filesystem.unsafe_container_mount", `$.permissions.filesystem.extraMounts[${index}].containerPath`, "ToolHive container mount targets must be safe absolute container paths.");
    }
  });

  candidate.openQuestions.forEach((question, index) => {
    if (question.blocksInstall) {
      addIssue(
        "blocker",
        "open_question.blocks_install",
        `$.openQuestions[${index}]`,
        `Open question blocks install: ${question.question}`,
      );
    }
  });

  const guidedSetup = candidate.recommendedLane === "guided-local-bridge";
  const status: McpAutowireStatus = blockers.length
    ? guidedSetup ? "guided-setup" : "blocked"
    : guidedSetup ? "guided-setup" : "ready-for-review";
  const outcome = validationOutcome(candidate, blockers);
  const readyForToolHiveRun = blockers.length === 0 &&
    candidate.runtime.provider === "toolhive" &&
    candidate.recommendedLane === "standard-mcp" &&
    (candidate.runtime.sourceKind === "registry" || candidate.runtime.sourceKind === "custom-image");

  return {
    status,
    outcome,
    readyForToolHiveRun,
    readyForUserReview: blockers.length === 0 && candidate.recommendedLane !== "exploratory",
    candidate,
    candidateHash: stableHash(candidate),
    blockers,
    warnings,
  };
}

export function mcpAutowireCandidatePromptSchema(): Record<string, unknown> {
  return mcpAutowireCandidateJsonSchema;
}

export const mcpAutowireCandidateJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "id",
    "displayName",
    "source",
    "recommendedLane",
    "runtime",
    "secrets",
    "permissions",
    "validationPlan",
    "evidence",
    "openQuestions",
    "riskSummary",
  ],
  properties: {
    schemaVersion: { const: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION },
    id: { type: "string", minLength: 1 },
    displayName: { type: "string", minLength: 1 },
    source: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "evidenceRefs"],
      properties: {
        kind: { enum: ["github", "toolhive-registry", "mcp-server-json", "awesome-mcp", "remote-url", "local", "other"] },
        url: { type: "string" },
        registryId: { type: "string", minLength: 1 },
        resolvedCommit: { type: "string", minLength: 7 },
        packageName: { type: "string", minLength: 1 },
        evidenceRefs: stringArraySchema(1),
      },
    },
    recommendedLane: { enum: ["standard-mcp", "remote-mcp", "cli-wrapper", "guided-local-bridge", "exploratory"] },
    runtime: {
      type: "object",
      additionalProperties: false,
      required: ["provider", "sourceKind", "transport", "evidenceRefs"],
      properties: {
        provider: { enum: ["toolhive", "remote-mcp", "ambient-cli", "guided-local"] },
        sourceKind: { enum: ["registry", "server-json", "npm", "pypi", "oci", "mcpb", "remote-url", "local-bridge", "custom-image", "unknown"] },
        transport: { enum: ["stdio", "streamable-http", "sse", "cli", "local-http", "unknown"] },
        package: {
          type: "object",
          additionalProperties: false,
          required: ["registryType", "identifier", "packageArguments"],
          properties: {
            registryType: { enum: ["npm", "pypi", "oci", "mcpb", "github-release", "other"] },
            identifier: { type: "string", minLength: 1 },
            version: { type: "string", minLength: 1 },
            runtimeHint: { type: "string", minLength: 1 },
            runtimeImage: { type: "string", minLength: 1 },
            fileSha256: { type: "string", pattern: "^[a-fA-F0-9]{64}$" },
            digest: { type: "string", minLength: 1 },
            entrypoint: {
              type: "object",
              additionalProperties: false,
              required: ["kind"],
              properties: {
                kind: { enum: ["default", "package-bin", "module"] },
                command: { type: "string", minLength: 1 },
                module: { type: "string", minLength: 1 },
                fromPackage: { type: "string", minLength: 1 },
              },
            },
            packageArguments: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["type", "isFixed"],
                properties: {
                  type: { enum: ["positional", "flag", "switch", "env", "unknown"] },
                  name: { type: "string", minLength: 1 },
                  valueHint: { type: "string", minLength: 1 },
                  isFixed: { type: "boolean" },
                },
              },
            },
          },
        },
        remote: {
          type: "object",
          additionalProperties: false,
          required: ["url", "headers"],
          properties: {
            url: { type: "string" },
            headers: stringArraySchema(0),
          },
        },
        localBridge: {
          type: "object",
          additionalProperties: false,
          required: ["setupSteps"],
          properties: {
            commandHint: { type: "string", minLength: 1 },
            host: { type: "string", minLength: 1 },
            port: { type: "integer", minimum: 1, maximum: 65535 },
            setupSteps: stringArraySchema(0),
          },
        },
        updatePolicy: {
          type: "object",
          additionalProperties: false,
          required: ["mode", "reason", "evidenceRefs"],
          properties: {
            mode: { enum: ["pinned", "managed-browser-security", "user-managed-runtime", "unverified"] },
            reason: { type: "string", minLength: 1 },
            evidenceRefs: stringArraySchema(1),
          },
        },
        sourceBuild: {
          type: "object",
          additionalProperties: false,
          required: ["schemaVersion", "sourceUrl", "resolvedCommit", "recipeKind", "recipeHash", "imageIdentifier", "imageDigest", "evidenceRefs"],
          properties: {
            schemaVersion: { const: MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION },
            sourceUrl: { type: "string" },
            resolvedCommit: { type: "string", minLength: 7 },
            recipeKind: { enum: ["existing-dockerfile", "generated-dockerfile", "existing-reviewed-image"] },
            recipeHash: { type: "string", pattern: "^[a-fA-F0-9]{64}$" },
            imageIdentifier: { type: "string", minLength: 1 },
            imageDigest: { type: "string", minLength: 1 },
            evidenceRefs: stringArraySchema(1),
          },
        },
        evidenceRefs: stringArraySchema(1),
      },
    },
    secrets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "required", "secret", "purpose", "evidenceRefs"],
        properties: {
          name: { type: "string", pattern: "^[A-Z_][A-Z0-9_]*$" },
          required: { type: "boolean" },
          secret: { const: true },
          purpose: { type: "string", minLength: 1 },
          evidenceRefs: stringArraySchema(1),
        },
      },
    },
    permissions: {
      type: "object",
      additionalProperties: false,
      required: ["network", "filesystem", "localApps", "evidenceRefs"],
      properties: {
        network: {
          type: "object",
          additionalProperties: false,
          required: ["mode", "allowHosts", "allowPorts", "justification"],
          properties: {
            mode: { enum: ["disabled", "local-only", "allowlist", "isolated", "broad"] },
            allowHosts: stringArraySchema(0),
            allowPorts: { type: "array", items: { type: "integer", minimum: 1, maximum: 65535 } },
            justification: { type: "string", minLength: 1 },
          },
        },
        filesystem: {
          type: "object",
          additionalProperties: false,
          required: ["workspaceRead", "workspaceWrite", "extraMounts"],
          properties: {
            workspaceRead: { type: "boolean" },
            workspaceWrite: { type: "boolean" },
            extraMounts: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["path", "mode", "purpose"],
                properties: {
                  path: { type: "string", minLength: 1 },
                  containerPath: { type: "string", minLength: 1 },
                  mode: { enum: ["read-only", "read-write"] },
                  purpose: { type: "string", minLength: 1 },
                },
              },
            },
          },
        },
        localApps: stringArraySchema(0),
        evidenceRefs: stringArraySchema(1),
      },
    },
    validationPlan: {
      type: "object",
      additionalProperties: false,
      required: ["preflights", "expectedTools", "evidenceRefs"],
      properties: {
        preflights: stringArraySchema(1),
        expectedTools: stringArraySchema(0),
        smokeCall: {
          type: "object",
          additionalProperties: false,
          required: ["tool", "arguments"],
          properties: {
            tool: { type: "string", minLength: 1 },
            arguments: { type: "object" },
          },
        },
        evidenceRefs: stringArraySchema(1),
      },
    },
    evidence: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "locator", "summary"],
        properties: {
          id: { type: "string", minLength: 1 },
          type: { enum: ["url", "file", "command", "registry", "readme", "server-json", "package-manifest", "release", "awesome-mcp", "other"] },
          locator: { type: "string", minLength: 1 },
          summary: { type: "string", minLength: 1 },
        },
      },
    },
    openQuestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "impact", "blocksInstall", "evidenceRefs"],
        properties: {
          question: { type: "string", minLength: 1 },
          impact: { enum: ["source", "runtime", "transport", "secret", "network", "filesystem", "local-app", "validation", "license", "other"] },
          blocksInstall: { type: "boolean" },
          evidenceRefs: stringArraySchema(0),
        },
      },
    },
    riskSummary: {
      type: "object",
      additionalProperties: false,
      required: ["level", "reasons", "evidenceRefs"],
      properties: {
        level: { enum: ["low", "medium", "high"] },
        reasons: stringArraySchema(1),
        evidenceRefs: stringArraySchema(1),
      },
    },
  },
};

export const toolHiveRunPlanJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "serverId", "workloadName", "group", "isolateNetwork", "permissionProfilePath", "sourceRef", "transport", "envSecretRefs", "evidenceRefs"],
  properties: {
    schemaVersion: { const: TOOLHIVE_RUN_PLAN_SCHEMA_VERSION },
    serverId: { type: "string", minLength: 1 },
    workloadName: { type: "string", minLength: 1 },
    group: { const: "ambient" },
    isolateNetwork: { type: "boolean" },
    permissionProfilePath: { type: "string", minLength: 1 },
    sourceRef: { type: "string", minLength: 1 },
    transport: { enum: ["stdio", "streamable-http", "sse"] },
    envSecretRefs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["envName", "secretRef"],
        properties: {
          envName: { type: "string", minLength: 1 },
          secretRef: { type: "string", minLength: 1 },
        },
      },
    },
    evidenceRefs: stringArraySchema(1),
  },
};

export const mcpInstallReviewJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "candidateId", "title", "recommendedLane", "outcome", "summary", "sourceSummary", "runtimeSummary", "permissionSummary", "secretSummary", "validationSummary", "blockers", "warnings", "evidenceRefs"],
  properties: {
    schemaVersion: { const: MCP_INSTALL_REVIEW_SCHEMA_VERSION },
    candidateId: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    recommendedLane: { enum: ["standard-mcp", "remote-mcp", "cli-wrapper", "guided-local-bridge", "exploratory"] },
    outcome: { enum: ["ready", "deferred-unsupported-lane", "guided-setup-required", "needs-evidence", "blocked-risk"] },
    summary: { type: "string", minLength: 1 },
    sourceSummary: { type: "string", minLength: 1 },
    runtimeSummary: { type: "string", minLength: 1 },
    permissionSummary: { type: "string", minLength: 1 },
    secretSummary: { type: "string", minLength: 1 },
    validationSummary: { type: "string", minLength: 1 },
    blockers: stringArraySchema(0),
    warnings: stringArraySchema(0),
    evidenceRefs: stringArraySchema(1),
  },
};

export const mcpToolSnapshotJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "serverId", "capturedAt", "descriptorHash", "tools"],
  properties: {
    schemaVersion: { const: MCP_TOOL_SNAPSHOT_SCHEMA_VERSION },
    serverId: { type: "string", minLength: 1 },
    workloadName: { type: "string", minLength: 1 },
    capturedAt: { type: "string", minLength: 1 },
    descriptorHash: { type: "string", minLength: 1 },
    tools: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description"],
        properties: {
          name: { type: "string", minLength: 1 },
          description: { type: "string" },
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
        },
      },
    },
  },
};

function expectedProviderForLane(lane: McpAutowireCandidate["recommendedLane"]): McpAutowireCandidate["runtime"]["provider"] | undefined {
  if (lane === "standard-mcp") return "toolhive";
  if (lane === "remote-mcp") return "remote-mcp";
  if (lane === "cli-wrapper") return "ambient-cli";
  if (lane === "guided-local-bridge") return "guided-local";
  return undefined;
}

function validationOutcome(
  candidate: McpAutowireCandidate,
  blockers: McpAutowireValidationIssue[],
): McpAutowireOutcome {
  if (candidate.recommendedLane === "guided-local-bridge") return "guided-setup-required";
  if (!blockers.length) return "ready";
  if (blockers.every((issue) => isEvidenceOrDiscoveryIssue(issue.code))) return "needs-evidence";
  return "blocked-risk";
}

function isEvidenceOrDiscoveryIssue(code: string): boolean {
  return (
    code.startsWith("evidence.") ||
    code.startsWith("open_question.") ||
    code === "lane.exploratory_not_installable"
  );
}

function isBroadHostPath(path: string): boolean {
  const normalized = path.trim().replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  return ["/", "/Users", "/private", "/tmp", "/var", "/System", "/Library", "C:/", "C:"].includes(normalized);
}

function isSafeContainerMountPath(path: string): boolean {
  const normalized = path.trim().replace(/\/+$/, "") || "/";
  return normalized.length <= 240 &&
    normalized.startsWith("/") &&
    normalized !== "/" &&
    !normalized.includes("\0") &&
    !normalized.includes(":") &&
    !normalized.split("/").includes("..");
}

function remoteMcpEndpointFacts(value: string): { ok: true; host: string; port: number } | { ok: false; code: string; message: string } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, code: "remote_mcp.invalid_url", message: "Remote MCP endpoint URL is invalid." };
  }
  if (url.protocol !== "https:") {
    return { ok: false, code: "remote_mcp.https_required", message: "Remote MCP endpoints must use HTTPS before ToolHive proxy install." };
  }
  if (url.username || url.password) {
    return { ok: false, code: "remote_mcp.credentials_in_url", message: "Remote MCP endpoint URLs must not contain credentials; use Ambient-managed secret refs." };
  }
  const host = normalizeRemoteMcpHost(url.hostname);
  if (!host || isDeniedRemoteMcpHost(host)) {
    return { ok: false, code: "remote_mcp.public_host_required", message: "Remote MCP endpoints must use a public hosted endpoint, not localhost, private networks, link-local hosts, or metadata hosts." };
  }
  const explicitPort = url.port ? Number(url.port) : undefined;
  return { ok: true, host, port: explicitPort ?? 443 };
}

function normalizeRemoteMcpHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
}

function isDeniedRemoteMcpHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "metadata.google.internal") return true;

  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const octets = host.split(".").map((part) => Number(part));
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return true;
    const [first = 0, second = 0] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  if (ipVersion === 6) {
    const normalized = host.toLowerCase();
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized)
    );
  }

  return false;
}

function remoteMcpHostAllowed(host: string, allowHosts: string[]): boolean {
  return allowHosts.some((allowed) => normalizeRemoteMcpHost(allowed) === host);
}

function unsupportedRemoteMcpHeaders(headers: string[]): string[] {
  return headers.filter((header) => header.trim().toLowerCase() !== "authorization");
}

function isSafePackageEntrypointCommand(value: string): boolean {
  return value.length <= 160 &&
    !value.startsWith("-") &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes(":") &&
    !value.includes("\0") &&
    !value.includes("\n") &&
    !value.includes("\r") &&
    /^[A-Za-z0-9][A-Za-z0-9_.@+-]*$/.test(value);
}

function isSafePackageEntrypointModule(value: string): boolean {
  return value.length <= 200 &&
    !value.startsWith(".") &&
    !value.endsWith(".") &&
    !value.includes("..") &&
    !value.includes("\0") &&
    /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(value);
}

function normalizePackageNameForEntrypoint(value: string): string {
  return value.trim().toLowerCase().replace(/[-_.]+/g, "-");
}

function isBrowserRuntimeCandidate(candidate: McpAutowireCandidate): boolean {
  const text = [
    candidate.displayName,
    candidate.source.packageName ?? "",
    candidate.runtime.package?.identifier ?? "",
    candidate.runtime.package?.runtimeHint ?? "",
    candidate.runtime.package?.entrypoint?.command ?? "",
    candidate.runtime.package?.entrypoint?.module ?? "",
    candidate.runtime.localBridge?.commandHint ?? "",
    candidate.permissions.network.justification ?? "",
    candidate.permissions.localApps.join(" "),
    candidate.validationPlan.expectedTools.join(" "),
    candidate.validationPlan.preflights.join(" "),
    candidate.evidence.map((entry) => entry.summary).join(" "),
  ].join(" ").toLowerCase();
  return /\b(?:browser|chrome|chromium|playwright|puppeteer|selenium|webdriver|headless|screenshot|screenshots|browserless)\b/.test(text);
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(sortJsonValue(value))).digest("hex");
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, sortJsonValue(entry)]));
}

function stringArraySchema(minItems: number): Record<string, unknown> {
  return {
    type: "array",
    minItems,
    items: { type: "string", minLength: 1 },
  };
}
