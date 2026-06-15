import { SUBAGENT_TOOL_CATEGORIES, type SubagentToolCategoryId, type SubagentToolScopeSource } from "../shared/subagentToolScope";
import { subagentChildActivatableBuiltInToolNamesForCategory } from "./subagentChildActiveTools";

export const SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION =
  "ambient-subagent-delegated-tool-authority-audit-v1" as const;

export type SubagentDelegatedToolChildVisibility =
  | "built_in_child_visible"
  | "exact_child_grant"
  | "not_child_visible";

export type SubagentDelegatedToolAuthorityAdapter =
  | "ambient-file-authority"
  | "ambient-git-status"
  | "ambient-bash-authority"
  | "subagent-browser-authority"
  | "callable-workflow-child-bridge"
  | "plugin-mcp-exact-grant"
  | "local-runtime-lease-inventory"
  | "media-download-boundary"
  | "visual-runtime-boundary"
  | "launch-policy-denial";

export interface SubagentDelegatedToolAuthoritySurface {
  schemaVersion: typeof SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION;
  surfaceId: string;
  categoryIds: SubagentToolCategoryId[];
  toolNames: string[];
  childVisibility: SubagentDelegatedToolChildVisibility;
  adapter: SubagentDelegatedToolAuthorityAdapter;
  authorityProfilePath?: string;
  rootProvider?: string;
  approvalProvider?: string;
  childIdentityProvider?: string;
  sourceKinds?: SubagentToolScopeSource[];
  proofTests: string[];
  liveProof?: string;
  notes: string;
}

export const SUBAGENT_DELEGATED_TOOL_AUTHORITY_SURFACES: readonly SubagentDelegatedToolAuthoritySurface[] = [
  {
    schemaVersion: SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION,
    surfaceId: "workspace-read-file-tools",
    categoryIds: ["workspace.read"],
    toolNames: ["read"],
    childVisibility: "built_in_child_visible",
    adapter: "ambient-file-authority",
    authorityProfilePath: "resolverInputs.childAuthorityProfile.resourceScopes.filesystem.readRoots",
    rootProvider: "AgentRuntime.fileAuthorityRootPathsForThread(threadId, 'read')",
    approvalProvider: "AgentRuntime.requestFileAuthorityForThread(threadId, workspace, request)",
    childIdentityProvider: "thread.kind/subagentRunId plus child thread id in permission request detail",
    proofTests: [
      "src/main/agentRuntimeFileAuthority.test.ts",
      "src/main/piReadOperations.test.ts",
      "src/main/agentRuntime.test.ts",
    ],
    notes: "Native Pi file reads consume the latest child authority profile read roots and may ask the parent when interactive.",
  },
  {
    schemaVersion: SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION,
    surfaceId: "workspace-read-git-status",
    categoryIds: ["workspace.read"],
    toolNames: ["ambient_git_status"],
    childVisibility: "built_in_child_visible",
    adapter: "ambient-git-status",
    childIdentityProvider: "thread worktree and project root supplied by AgentRuntime.createGitToolExtension",
    proofTests: [
      "src/main/subagentChildActiveTools.test.ts",
      "src/main/agentRuntimeGitTools.test.ts",
    ],
    notes: "Read-only topology surface; it reports the current thread worktree and does not grant file-content authority.",
  },
  {
    schemaVersion: SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION,
    surfaceId: "workspace-write-file-tools",
    categoryIds: ["workspace.write"],
    toolNames: ["write", "edit"],
    childVisibility: "built_in_child_visible",
    adapter: "ambient-file-authority",
    authorityProfilePath: "resolverInputs.childAuthorityProfile.resourceScopes.filesystem.writeRoots",
    rootProvider: "AgentRuntime.fileAuthorityRootPathsForThread(threadId, 'write')",
    approvalProvider: "AgentRuntime.requestFileAuthorityForThread(threadId, workspace, request)",
    childIdentityProvider: "thread.kind/subagentRunId plus child thread id in permission request detail",
    proofTests: [
      "src/main/agentRuntimeFileAuthority.test.ts",
      "src/main/piReadOperations.test.ts",
      "src/main/agentRuntimeToolRunnerFileTools.test.ts",
    ],
    notes: "Mutating file tools require explicit write roots from the child authority profile or a parent approval route.",
  },
  {
    schemaVersion: SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION,
    surfaceId: "workspace-write-shell",
    categoryIds: ["workspace.write"],
    toolNames: ["bash"],
    childVisibility: "built_in_child_visible",
    adapter: "ambient-bash-authority",
    authorityProfilePath: "resolverInputs.childAuthorityProfile.resourceScopes.filesystem.writeRoots",
    rootProvider: "AgentRuntime.fileAuthorityRootPathsForThread(threadId, 'write')",
    approvalProvider: "AgentRuntime.resolveToolCallPermission via permissionPolicy and transient file authority",
    childIdentityProvider: "thread.kind/subagentRunId plus permission audit run/thread metadata",
    proofTests: [
      "src/main/agentRuntimeToolRunnerTools.test.ts",
      "src/main/agentRuntime.test.ts",
    ],
    notes: "Shell is only child-visible from workspace.write and receives the narrowed write authority roots before execution.",
  },
  {
    schemaVersion: SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION,
    surfaceId: "browser-read-tools",
    categoryIds: ["browser.read"],
    toolNames: ["browser_search", "browser_nav", "browser_content", "browser_screenshot"],
    childVisibility: "built_in_child_visible",
    adapter: "subagent-browser-authority",
    authorityProfilePath: "resolverInputs.childAuthorityProfile.resourceScopes.browser",
    approvalProvider: "classifySubagentBrowserToolAuthority",
    childIdentityProvider: "child browser permission request detail and grant conditions",
    proofTests: [
      "src/main/subagentBrowserAuthority.test.ts",
      "src/main/agentRuntimeToolCallPermission.test.ts",
    ],
    liveProof: "test:subagents:live:browser-approval",
    notes: "Browser reads check the child browser authority profile before normal full-access/workspace permission policy.",
  },
  {
    schemaVersion: SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION,
    surfaceId: "browser-interactive-tools",
    categoryIds: ["browser.interactive"],
    toolNames: ["browser_eval", "browser_keypress"],
    childVisibility: "built_in_child_visible",
    adapter: "subagent-browser-authority",
    authorityProfilePath: "resolverInputs.childAuthorityProfile.resourceScopes.browser",
    approvalProvider: "classifySubagentBrowserToolAuthority",
    childIdentityProvider: "child browser permission request detail and grant conditions",
    proofTests: [
      "src/main/subagentBrowserAuthority.test.ts",
      "src/main/agentRuntimeToolCallPermission.test.ts",
    ],
    notes: "Interactive browser tools share the browser authority profile but carry browser-control risk.",
  },
  {
    schemaVersion: SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION,
    surfaceId: "long-context-read",
    categoryIds: ["long-context.read"],
    toolNames: ["long_context_process"],
    childVisibility: "built_in_child_visible",
    adapter: "ambient-file-authority",
    authorityProfilePath: "resolverInputs.childAuthorityProfile.resourceScopes.filesystem.readRoots",
    rootProvider: "AgentRuntime.fileAuthorityRootPathsForThread(threadId, 'read')",
    approvalProvider: "AgentRuntime.requestFileAuthorityForThread(threadId, workspace, request)",
    childIdentityProvider: "thread.kind/subagentRunId plus child thread id in permission request detail",
    proofTests: [
      "src/main/lambdaRlm.test.ts",
      "src/main/agentRuntimeLambdaRlmTools.test.ts",
      "src/main/agentRuntimeFileAuthority.test.ts",
    ],
    liveProof: "test:subagents:live:long-context-authority",
    notes: "Long-context workspace paths must consume the same child read roots and approval route as native read.",
  },
  {
    schemaVersion: SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION,
    surfaceId: "plugin-mcp-extension-tools",
    categoryIds: ["mcp.direct", "connector.read", "connector.write", "workspace.read", "workspace.write"],
    toolNames: [],
    childVisibility: "exact_child_grant",
    adapter: "plugin-mcp-exact-grant",
    sourceKinds: ["extension_tool"],
    approvalProvider: "ensurePluginMcpToolTrustedWithRuntimeBridge",
    childIdentityProvider: "exact child tool-scope snapshot grant",
    proofTests: [
      "src/main/subagentChildActiveTools.test.ts",
      "src/main/agentRuntimePluginMcpTools.test.ts",
    ],
    notes: "Plugin MCP tools are never inherited wholesale; a child sees only exact extension_tool grants present in the launch catalog.",
  },
  {
    schemaVersion: SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION,
    surfaceId: "callable-workflow-tools",
    categoryIds: ["workflow.call"],
    toolNames: [],
    childVisibility: "exact_child_grant",
    adapter: "callable-workflow-child-bridge",
    sourceKinds: ["callable_workflow"],
    authorityProfilePath: "resolverInputs.childAuthorityProfile.resourceScopes.nestedFanout",
    approvalProvider: "callable workflow child bridge policy",
    childIdentityProvider: "callable workflow provenance kind subagent_child_thread",
    proofTests: [
      "src/main/subagentChildActiveTools.test.ts",
      "src/main/agentRuntimeCallableWorkflowTools.test.ts",
    ],
    notes: "Callable workflows require exact tool grants, allowed workflow names, and remaining nested fanout budget.",
  },
  {
    schemaVersion: SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION,
    surfaceId: "direct-connector-and-mcp-bridges",
    categoryIds: ["connector.read", "connector.write", "mcp.direct"],
    toolNames: [],
    childVisibility: "not_child_visible",
    adapter: "launch-policy-denial",
    sourceKinds: ["connector_app", "direct_mcp"],
    proofTests: [
      "src/main/subagentPiTools.test.ts",
      "src/main/subagentChildActiveTools.test.ts",
    ],
    notes: "Direct connector and MCP sources stay non-visible until Ambient adds a child-safe bridge with identity and approval routing.",
  },
  {
    schemaVersion: SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION,
    surfaceId: "local-runtime-lifecycle-tools",
    categoryIds: [],
    toolNames: [
      "ambient_local_model_runtime_status",
      "ambient_local_model_runtime_start",
      "ambient_local_model_runtime_stop",
      "ambient_local_model_runtime_restart",
    ],
    childVisibility: "not_child_visible",
    adapter: "local-runtime-lease-inventory",
    proofTests: [
      "src/main/localRuntimeInventory.test.ts",
      "src/main/agentRuntimeLocalRuntimeTools.test.ts",
    ],
    notes: "Local runtime ownership is represented through leases and inventory stop blockers, not by granting child lifecycle tools.",
  },
  {
    schemaVersion: SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION,
    surfaceId: "media-download-tools",
    categoryIds: [],
    toolNames: ["media_download"],
    childVisibility: "not_child_visible",
    adapter: "media-download-boundary",
    proofTests: [
      "src/main/agentRuntimeMediaTools.test.ts",
      "src/main/mediaAcquisitionDogfood.test.ts",
      "src/main/permissionPolicy.test.ts",
    ],
    notes: "Remote media download combines network fetch, content validation, and workspace artifact writes; keep it parent/workflow-owned until a child media authority bridge carries child identity, approved URL/source policy, and artifact write scope.",
  },
  {
    schemaVersion: SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION,
    surfaceId: "visual-runtime-tools",
    categoryIds: [],
    toolNames: ["ambient_visual_analyze", "ambient_visual_minicpm_setup"],
    childVisibility: "not_child_visible",
    adapter: "visual-runtime-boundary",
    proofTests: [
      "src/main/agentRuntime.test.ts",
      "src/main/miniCpmVisionProvider.test.ts",
      "src/main/permissionPolicy.test.ts",
    ],
    notes: "Visual analysis can read media artifacts and own MiniCPM runtime lifecycle; keep it parent/workflow-owned until child-safe media roots, runtime lease ownership, and approval bubbling are wired end to end.",
  },
];

export function subagentDelegatedToolAuthoritySurfaceForTool(
  toolName: string,
): SubagentDelegatedToolAuthoritySurface | undefined {
  return SUBAGENT_DELEGATED_TOOL_AUTHORITY_SURFACES.find((surface) => surface.toolNames.includes(toolName));
}

export function subagentDelegatedToolAuthorityBuiltInChildToolNames(): string[] {
  return uniqueToolNames(SUBAGENT_DELEGATED_TOOL_AUTHORITY_SURFACES
    .filter((surface) => surface.childVisibility === "built_in_child_visible")
    .flatMap((surface) => surface.toolNames));
}

export function subagentDelegatedToolAuthorityNonChildToolNames(): string[] {
  return uniqueToolNames(SUBAGENT_DELEGATED_TOOL_AUTHORITY_SURFACES
    .filter((surface) => surface.childVisibility === "not_child_visible")
    .flatMap((surface) => surface.toolNames));
}

export function missingSubagentDelegatedAuthorityAuditToolNames(toolNames: readonly string[]): string[] {
  const audited = new Set(SUBAGENT_DELEGATED_TOOL_AUTHORITY_SURFACES.flatMap((surface) => surface.toolNames));
  return uniqueToolNames(toolNames).filter((toolName) => !audited.has(toolName));
}

export interface SubagentDelegatedToolAuthorityAuditReport {
  schemaVersion: typeof SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION;
  status: "passed" | "failed";
  surfaceCount: number;
  builtInChildToolCount: number;
  exactGrantSurfaceCount: number;
  nonVisibleSurfaceCount: number;
  coveredBuiltInChildToolNames: string[];
  missingBuiltInChildToolNames: string[];
  extraBuiltInChildToolNames: string[];
  issues: string[];
}

export function validateSubagentDelegatedToolAuthorityAudit(input: {
  surfaces?: readonly SubagentDelegatedToolAuthoritySurface[];
  builtInChildToolNames?: readonly string[];
} = {}): SubagentDelegatedToolAuthorityAuditReport {
  const surfaces = input.surfaces ?? SUBAGENT_DELEGATED_TOOL_AUTHORITY_SURFACES;
  const expectedBuiltInChildToolNames = uniqueToolNames(input.builtInChildToolNames ?? defaultBuiltInChildToolNames());
  const issues: string[] = [];
  const surfaceIds = new Set<string>();
  const builtInToolNames = uniqueToolNames(
    surfaces
      .filter((surface) => surface.childVisibility === "built_in_child_visible")
      .flatMap((surface) => surface.toolNames),
  );
  const builtInToolNameSet = new Set(builtInToolNames);
  const expectedBuiltInToolNameSet = new Set(expectedBuiltInChildToolNames);
  const missingBuiltInChildToolNames = expectedBuiltInChildToolNames.filter((toolName) => !builtInToolNameSet.has(toolName));
  const extraBuiltInChildToolNames = builtInToolNames.filter((toolName) => !expectedBuiltInToolNameSet.has(toolName));

  for (const toolName of missingBuiltInChildToolNames) {
    issues.push(`Missing delegated authority surface for child-visible built-in tool: ${toolName}.`);
  }
  for (const toolName of extraBuiltInChildToolNames) {
    issues.push(`Delegated authority surface exposes built-in tool that is not child-visible: ${toolName}.`);
  }

  for (const surface of surfaces) {
    if (surface.schemaVersion !== SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION) {
      issues.push(`${surface.surfaceId || "unknown surface"} has unsupported delegated authority schema version.`);
    }
    if (!surface.surfaceId.trim()) issues.push("Delegated authority surface is missing surfaceId.");
    if (surfaceIds.has(surface.surfaceId)) issues.push(`Duplicate delegated authority surfaceId: ${surface.surfaceId}.`);
    surfaceIds.add(surface.surfaceId);
    if (!surface.categoryIds.length && surface.childVisibility !== "not_child_visible") {
      issues.push(`${surface.surfaceId} must declare at least one tool category.`);
    }
    if (!surface.proofTests.length) issues.push(`${surface.surfaceId} must declare proof tests.`);
    if (!surface.notes.trim()) issues.push(`${surface.surfaceId} must describe its delegated authority boundary.`);

    if (surface.childVisibility === "built_in_child_visible") {
      validateBuiltInChildVisibleSurface(surface, issues);
    } else if (surface.childVisibility === "exact_child_grant") {
      validateExactGrantSurface(surface, issues);
    } else if (surface.childVisibility === "not_child_visible") {
      validateNonVisibleSurface(surface, issues);
    }
  }

  validateLongContextReadMatchesNativeRead(surfaces, issues);

  return {
    schemaVersion: SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION,
    status: issues.length ? "failed" : "passed",
    surfaceCount: surfaces.length,
    builtInChildToolCount: builtInToolNames.length,
    exactGrantSurfaceCount: surfaces.filter((surface) => surface.childVisibility === "exact_child_grant").length,
    nonVisibleSurfaceCount: surfaces.filter((surface) => surface.childVisibility === "not_child_visible").length,
    coveredBuiltInChildToolNames: builtInToolNames,
    missingBuiltInChildToolNames,
    extraBuiltInChildToolNames,
    issues,
  };
}

function validateBuiltInChildVisibleSurface(
  surface: SubagentDelegatedToolAuthoritySurface,
  issues: string[],
): void {
  if (!surface.toolNames.length) {
    issues.push(`${surface.surfaceId} is child-visible but declares no tool names.`);
  }
  if (!surface.childIdentityProvider) {
    issues.push(`${surface.surfaceId} must identify the child/run in delegated authority checks.`);
  }
  if (surface.adapter === "ambient-file-authority" || surface.adapter === "ambient-bash-authority") {
    if (!surface.authorityProfilePath) issues.push(`${surface.surfaceId} must join the child authority profile.`);
    if (!surface.rootProvider) issues.push(`${surface.surfaceId} must declare a root provider.`);
    if (!surface.approvalProvider) issues.push(`${surface.surfaceId} must declare a parent approval route.`);
  }
  const readsFileContent = surface.toolNames.includes("read") || surface.toolNames.includes("long_context_process");
  if (readsFileContent) {
    if (surface.adapter !== "ambient-file-authority") {
      issues.push(`${surface.surfaceId} read tools must use ambient-file-authority.`);
    }
    if (!surface.authorityProfilePath?.includes("filesystem.readRoots")) {
      issues.push(`${surface.surfaceId} read tools must consume child filesystem read roots.`);
    }
    if (!surface.rootProvider?.includes("'read'")) {
      issues.push(`${surface.surfaceId} read tools must use read authority roots.`);
    }
  }
  if (surface.categoryIds.includes("workspace.write")) {
    if (!surface.authorityProfilePath?.includes("filesystem.writeRoots")) {
      issues.push(`${surface.surfaceId} write tools must consume child filesystem write roots.`);
    }
    if (!surface.rootProvider?.includes("'write'")) {
      issues.push(`${surface.surfaceId} write tools must use write authority roots.`);
    }
  }
  if (surface.categoryIds.includes("browser.read") || surface.categoryIds.includes("browser.interactive")) {
    if (surface.adapter !== "subagent-browser-authority") {
      issues.push(`${surface.surfaceId} browser tools must use subagent-browser-authority.`);
    }
    if (!surface.authorityProfilePath?.includes("resourceScopes.browser")) {
      issues.push(`${surface.surfaceId} browser tools must consume child browser authority.`);
    }
  }
}

function validateExactGrantSurface(
  surface: SubagentDelegatedToolAuthoritySurface,
  issues: string[],
): void {
  if (!surface.sourceKinds?.length) issues.push(`${surface.surfaceId} must declare exact-grant source kinds.`);
  if (!surface.approvalProvider) issues.push(`${surface.surfaceId} must declare the exact-grant approval or bridge policy.`);
  if (!surface.childIdentityProvider) issues.push(`${surface.surfaceId} must preserve child identity through exact grants.`);
}

function validateNonVisibleSurface(
  surface: SubagentDelegatedToolAuthoritySurface,
  issues: string[],
): void {
  if (surface.toolNames.length && surface.adapter === "launch-policy-denial") {
    issues.push(`${surface.surfaceId} launch-policy denials should not expose tool names.`);
  }
  if (![
    "launch-policy-denial",
    "local-runtime-lease-inventory",
    "media-download-boundary",
    "visual-runtime-boundary",
  ].includes(surface.adapter)) {
    issues.push(`${surface.surfaceId} non-visible surfaces must be enforced by launch policy, runtime inventory, or a named parent-only boundary.`);
  }
}

function validateLongContextReadMatchesNativeRead(
  surfaces: readonly SubagentDelegatedToolAuthoritySurface[],
  issues: string[],
): void {
  const read = surfaces.find((surface) => surface.toolNames.includes("read"));
  const longContext = surfaces.find((surface) => surface.toolNames.includes("long_context_process"));
  if (!read || !longContext) return;
  const fields: Array<keyof SubagentDelegatedToolAuthoritySurface> = [
    "adapter",
    "authorityProfilePath",
    "rootProvider",
    "approvalProvider",
    "childIdentityProvider",
  ];
  for (const field of fields) {
    if (read[field] !== longContext[field]) {
      issues.push(`long_context_process delegated authority ${field} must match native read.`);
    }
  }
}

function defaultBuiltInChildToolNames(): string[] {
  return uniqueToolNames(SUBAGENT_TOOL_CATEGORIES.flatMap((category) =>
    subagentChildActivatableBuiltInToolNamesForCategory(category.id),
  ));
}

function uniqueToolNames(toolNames: readonly string[]): string[] {
  return [...new Set(toolNames)].sort((left, right) => left.localeCompare(right));
}
