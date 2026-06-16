import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SUBAGENT_TOOL_CATEGORIES } from "../shared/subagentToolScope";
import { subagentChildActivatableBuiltInToolNamesForCategory } from "./subagentChildActiveTools";
import {
  SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION,
  SUBAGENT_DELEGATED_TOOL_AUTHORITY_SURFACES,
  missingSubagentDelegatedAuthorityAuditToolNames,
  subagentDelegatedToolAuthorityBuiltInChildToolNames,
  subagentDelegatedToolAuthorityNonChildToolNames,
  subagentDelegatedToolAuthoritySurfaceForTool,
  validateSubagentDelegatedToolAuthorityAudit,
} from "./subagentDelegatedToolAuthority";

describe("subagent delegated tool authority audit", () => {
  it("covers every built-in child-visible tool from the active-tool resolver", () => {
    const resolverToolNames = uniqueSorted(SUBAGENT_TOOL_CATEGORIES.flatMap((category) =>
      subagentChildActivatableBuiltInToolNamesForCategory(category.id),
    ));

    expect(subagentDelegatedToolAuthorityBuiltInChildToolNames()).toEqual(resolverToolNames);
    expect(missingSubagentDelegatedAuthorityAuditToolNames(resolverToolNames)).toEqual([]);
    expect(resolverToolNames).toEqual([
      "ambient_git_status",
      "bash",
      "browser_content",
      "browser_eval",
      "browser_keypress",
      "browser_nav",
      "browser_screenshot",
      "browser_search",
      "edit",
      "long_context_process",
      "read",
      "web_research_fetch",
      "web_research_search",
      "web_research_status",
      "write",
    ]);
  });

  it("pins long_context_process to the same read authority and approval route as native read", () => {
    const read = requiredSurfaceForTool("read");
    const longContext = requiredSurfaceForTool("long_context_process");

    expect(longContext.adapter).toBe("ambient-file-authority");
    expect(longContext.authorityProfilePath).toBe(read.authorityProfilePath);
    expect(longContext.rootProvider).toBe(read.rootProvider);
    expect(longContext.approvalProvider).toBe(read.approvalProvider);
    expect(longContext.childIdentityProvider).toBe(read.childIdentityProvider);
    expect(longContext.liveProof).toBe("test:subagents:live:long-context-authority");
  });

  it("keeps mutating child tools on the narrowed write authority path", () => {
    const write = requiredSurfaceForTool("write");
    const edit = requiredSurfaceForTool("edit");
    const bash = requiredSurfaceForTool("bash");

    expect(write.authorityProfilePath).toContain("filesystem.writeRoots");
    expect(edit.authorityProfilePath).toBe(write.authorityProfilePath);
    expect(bash.authorityProfilePath).toBe(write.authorityProfilePath);
    expect(write.rootProvider).toContain("fileAuthorityRootPathsForThread(threadId, 'write')");
    expect(bash.rootProvider).toBe(write.rootProvider);
    expect(write.notes).toContain("explicit write roots");
  });

  it("records exact-grant and non-visible boundary surfaces instead of inheriting broad parent tools", () => {
    const plugin = surface("plugin-mcp-extension-tools");
    const workflow = surface("callable-workflow-tools");
    const directMcp = surface("direct-connector-and-mcp-bridges");
    const localRuntime = surface("local-runtime-lifecycle-tools");
    const browserRead = surface("browser-read-tools");
    const browserInteractive = surface("browser-interactive-tools");
    const browserParentSession = surface("browser-parent-session-tools");
    const webResearch = surface("web-research-broker-tools");
    const media = surface("media-download-tools");
    const visual = surface("visual-runtime-tools");

    expect(plugin.childVisibility).toBe("exact_child_grant");
    expect(plugin.sourceKinds).toEqual(["extension_tool"]);
    expect(workflow.childVisibility).toBe("exact_child_grant");
    expect(workflow.sourceKinds).toEqual(["callable_workflow"]);
    expect(directMcp.childVisibility).toBe("not_child_visible");
    expect(directMcp.sourceKinds).toEqual(["connector_app", "direct_mcp"]);
    expect(localRuntime.childVisibility).toBe("not_child_visible");
    expect(localRuntime.adapter).toBe("local-runtime-lease-inventory");
    expect(localRuntime.toolNames).toEqual([
      "ambient_local_model_runtime_status",
      "ambient_local_model_runtime_start",
      "ambient_local_model_runtime_stop",
      "ambient_local_model_runtime_restart",
    ]);
    expect(browserRead.childVisibility).toBe("not_child_visible");
    expect(browserRead.adapter).toBe("launch-policy-denial");
    expect(browserRead.toolNames).toEqual([]);
    expect(browserInteractive.childVisibility).toBe("built_in_child_visible");
    expect(browserInteractive.adapter).toBe("subagent-browser-authority");
    expect(browserInteractive.categoryIds).toEqual(["browser.interactive"]);
    expect(browserInteractive.toolNames).toEqual([
      "browser_search",
      "browser_nav",
      "browser_content",
      "browser_screenshot",
      "browser_eval",
      "browser_keypress",
    ]);
    expect(browserParentSession.childVisibility).toBe("not_child_visible");
    expect(browserParentSession.adapter).toBe("browser-parent-session-boundary");
    expect(browserParentSession.toolNames).toEqual([
      "browser_local_preview",
      "browser_click",
      "browser_get_value",
      "browser_wait_for",
      "browser_assert",
    ]);
    expect(webResearch.childVisibility).toBe("built_in_child_visible");
    expect(webResearch.adapter).toBe("web-research-provider-broker");
    expect(webResearch.categoryIds).toEqual(["connector.read"]);
    expect(webResearch.liveProof).toBe("test:subagents:live:web-research-no-browser-fallback");
    expect(media.childVisibility).toBe("not_child_visible");
    expect(media.adapter).toBe("media-download-boundary");
    expect(media.toolNames).toEqual(["media_download"]);
    expect(visual.childVisibility).toBe("not_child_visible");
    expect(visual.adapter).toBe("visual-runtime-boundary");
    expect(visual.toolNames).toEqual(["ambient_visual_analyze", "ambient_visual_minicpm_setup"]);
    expect(subagentDelegatedToolAuthorityNonChildToolNames()).toEqual([
      "ambient_local_model_runtime_restart",
      "ambient_local_model_runtime_start",
      "ambient_local_model_runtime_status",
      "ambient_local_model_runtime_stop",
      "ambient_visual_analyze",
      "ambient_visual_minicpm_setup",
      "browser_assert",
      "browser_click",
      "browser_get_value",
      "browser_local_preview",
      "browser_wait_for",
      "media_download",
    ]);
    expect(missingSubagentDelegatedAuthorityAuditToolNames([
      "ambient_local_model_runtime_restart",
      "ambient_local_model_runtime_start",
      "ambient_local_model_runtime_status",
      "ambient_local_model_runtime_stop",
      "ambient_visual_analyze",
      "ambient_visual_minicpm_setup",
      "browser_assert",
      "browser_click",
      "browser_get_value",
      "browser_local_preview",
      "browser_wait_for",
      "media_download",
    ])).toEqual([]);
  });

  it("keeps the audit schema and proof file references local and present", () => {
    expect(SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION).toBe(
      "ambient-subagent-delegated-tool-authority-audit-v1",
    );

    for (const authoritySurface of SUBAGENT_DELEGATED_TOOL_AUTHORITY_SURFACES) {
      expect(authoritySurface.schemaVersion).toBe(SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION);
      expect(authoritySurface.proofTests.length).toBeGreaterThan(0);
      for (const proofPath of authoritySurface.proofTests) {
        expect(proofPath).toMatch(/^(src|scripts)\//);
        expect(existsSync(resolve(process.cwd(), proofPath))).toBe(true);
      }
    }
  });

  it("validates the delegated authority audit as an executable contract", () => {
    expect(validateSubagentDelegatedToolAuthorityAudit()).toMatchObject({
      schemaVersion: "ambient-subagent-delegated-tool-authority-audit-v1",
      status: "passed",
      surfaceCount: SUBAGENT_DELEGATED_TOOL_AUTHORITY_SURFACES.length,
      builtInChildToolCount: 15,
      exactGrantSurfaceCount: 2,
      nonVisibleSurfaceCount: 6,
      coveredBuiltInChildToolNames: [
        "ambient_git_status",
        "bash",
        "browser_content",
        "browser_eval",
        "browser_keypress",
        "browser_nav",
        "browser_screenshot",
        "browser_search",
        "edit",
        "long_context_process",
        "read",
        "web_research_fetch",
        "web_research_search",
        "web_research_status",
        "write",
      ],
      issues: [],
    });
  });

  it("fails the audit when a child-visible built-in tool is missing authority coverage", () => {
    const report = validateSubagentDelegatedToolAuthorityAudit({
      surfaces: SUBAGENT_DELEGATED_TOOL_AUTHORITY_SURFACES
        .filter((surface) => !surface.toolNames.includes("long_context_process")),
    });

    expect(report.status).toBe("failed");
    expect(report.missingBuiltInChildToolNames).toEqual(["long_context_process"]);
    expect(report.issues).toContain("Missing delegated authority surface for child-visible built-in tool: long_context_process.");
  });

  it("fails the audit when long_context_process drifts from native read authority", () => {
    const report = validateSubagentDelegatedToolAuthorityAudit({
      surfaces: SUBAGENT_DELEGATED_TOOL_AUTHORITY_SURFACES.map((surface) =>
        surface.toolNames.includes("long_context_process")
          ? longContextWithoutApproval(surface)
          : surface,
      ),
    });

    expect(report.status).toBe("failed");
    expect(report.issues).toEqual(expect.arrayContaining([
      "long-context-read must declare a parent approval route.",
      "long-context-read read tools must use read authority roots.",
      "long_context_process delegated authority rootProvider must match native read.",
      "long_context_process delegated authority approvalProvider must match native read.",
    ]));
  });

  it("fails the audit when exact-grant bridges do not declare their source boundary", () => {
    const report = validateSubagentDelegatedToolAuthorityAudit({
      surfaces: SUBAGENT_DELEGATED_TOOL_AUTHORITY_SURFACES.map((surface) =>
        surface.surfaceId === "plugin-mcp-extension-tools"
          ? { ...surface, sourceKinds: [] }
          : surface,
      ),
    });

    expect(report.status).toBe("failed");
    expect(report.issues).toContain("plugin-mcp-extension-tools must declare exact-grant source kinds.");
  });
});

function requiredSurfaceForTool(toolName: string) {
  const authoritySurface = subagentDelegatedToolAuthoritySurfaceForTool(toolName);
  if (!authoritySurface) throw new Error(`Missing delegated authority surface for ${toolName}.`);
  return authoritySurface;
}

function surface(surfaceId: string) {
  const authoritySurface = SUBAGENT_DELEGATED_TOOL_AUTHORITY_SURFACES.find((candidate) => candidate.surfaceId === surfaceId);
  if (!authoritySurface) throw new Error(`Missing delegated authority surface ${surfaceId}.`);
  return authoritySurface;
}

function longContextWithoutApproval(
  authoritySurface: (typeof SUBAGENT_DELEGATED_TOOL_AUTHORITY_SURFACES)[number],
) {
  const { approvalProvider: _approvalProvider, ...withoutApproval } = authoritySurface;
  return {
    ...withoutApproval,
    rootProvider: "AgentRuntime.fileAuthorityRootPathsForThread(threadId, 'write')",
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
