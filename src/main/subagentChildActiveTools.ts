import type { SubagentToolCategoryId } from "../shared/subagentToolScope";
import type { SubagentToolScopeSnapshotSummary, ThreadSummary } from "../shared/types";
import {
  AMBIENT_TOOL_CALL,
  AMBIENT_TOOL_DESCRIBE,
  AMBIENT_TOOL_SEARCH,
} from "./ambientToolRouter";

const CHILD_BROWSER_READ_TOOL_NAMES = [
  "browser_search",
  "browser_nav",
  "browser_content",
  "browser_screenshot",
] as const;

const CHILD_BROWSER_INTERACTIVE_TOOL_NAMES = [
  "browser_eval",
  "browser_keypress",
] as const;

const CHILD_WEB_RESEARCH_READ_TOOL_NAMES = [
  "web_research_status",
  "web_research_search",
  "web_research_fetch",
] as const;

const CHILD_ACTIVE_TOOL_NAMES_BY_CATEGORY: Record<SubagentToolCategoryId, readonly string[]> = {
  "workspace.read": ["read", "ambient_git_status"],
  "workspace.write": ["bash", "edit", "write"],
  "test.run": [],
  "artifact.read": [],
  "artifact.write": [],
  "browser.read": CHILD_BROWSER_READ_TOOL_NAMES,
  "browser.interactive": CHILD_BROWSER_INTERACTIVE_TOOL_NAMES,
  "long-context.read": ["long_context_process"],
  "connector.read": CHILD_WEB_RESEARCH_READ_TOOL_NAMES,
  "connector.write": [],
  "mcp.direct": [],
  "secrets.read": [],
  "workflow.call": [],
  "subagent.spawn": [],
};

const CHILD_NEVER_INHERIT_TOOL_NAMES = new Set([
  AMBIENT_TOOL_SEARCH,
  AMBIENT_TOOL_DESCRIBE,
  AMBIENT_TOOL_CALL,
  "ambient_subagent",
]);

export function subagentChildActivatableBuiltInToolNamesForCategory(categoryId: SubagentToolCategoryId): readonly string[] {
  return CHILD_ACTIVE_TOOL_NAMES_BY_CATEGORY[categoryId];
}

export function isSubagentChildActivatableBuiltInTool(input: {
  toolName: string;
  categoryId: SubagentToolCategoryId;
}): boolean {
  if (CHILD_NEVER_INHERIT_TOOL_NAMES.has(input.toolName)) return false;
  return CHILD_ACTIVE_TOOL_NAMES_BY_CATEGORY[input.categoryId].includes(input.toolName);
}

export interface AgentRuntimeActiveToolNamesInput {
  thread: Pick<ThreadSummary, "kind" | "subagentRunId">;
  defaultActiveToolNames: readonly string[];
  goalModeToolNames: readonly string[];
  subagentToolNames: readonly string[];
  callableWorkflowToolNames?: readonly string[];
  pluginMcpToolNames: readonly string[];
  projectBoardTaskToolNames: readonly string[];
  subagentToolScopeSnapshots?: readonly SubagentToolScopeSnapshotSummary[];
}

export function resolveAgentRuntimeActiveToolNamesForThread(input: AgentRuntimeActiveToolNamesInput): string[] {
  if (input.thread.kind === "subagent_child") {
    return resolveSubagentChildActiveToolNames({
      subagentToolScopeSnapshots: input.subagentToolScopeSnapshots ?? [],
      availableExtensionToolNames: input.pluginMcpToolNames,
      availableCallableWorkflowToolNames: input.callableWorkflowToolNames,
    });
  }
  return dedupeToolNames([
    ...input.defaultActiveToolNames,
    ...input.goalModeToolNames,
    ...input.subagentToolNames,
    ...(input.callableWorkflowToolNames ?? []),
    ...input.pluginMcpToolNames,
    ...input.projectBoardTaskToolNames,
  ]);
}

export interface SubagentChildActiveToolActivationResolution {
  activeToolNames: string[];
  unavailableExtensionToolNames: Array<{
    toolName: string;
    categoryId?: SubagentToolCategoryId;
    reason: string;
  }>;
  unavailableCallableWorkflowToolNames: Array<{
    toolName: string;
    categoryId?: SubagentToolCategoryId;
    reason: string;
  }>;
}

export function resolveSubagentChildActiveToolNames(input: {
  subagentToolScopeSnapshots: readonly SubagentToolScopeSnapshotSummary[];
  availableExtensionToolNames?: readonly string[];
  availableCallableWorkflowToolNames?: readonly string[];
}): string[] {
  const resolution = resolveSubagentChildActiveToolActivation(input);
  if (resolution.unavailableExtensionToolNames.length) {
    const unavailable = resolution.unavailableExtensionToolNames
      .map(formatUnavailableChildTool)
      .join(", ");
    throw new Error(`Sub-agent child tool scope requested unavailable extension tools before launch: ${unavailable}`);
  }
  if (resolution.unavailableCallableWorkflowToolNames.length) {
    const unavailable = resolution.unavailableCallableWorkflowToolNames
      .map(formatUnavailableChildTool)
      .join(", ");
    throw new Error(`Sub-agent child tool scope requested unavailable callable workflow tools before launch: ${unavailable}`);
  }
  return resolution.activeToolNames;
}

export function subagentChildCallableWorkflowToolNamesFromSnapshots(
  snapshots: readonly SubagentToolScopeSnapshotSummary[],
): string[] {
  const snapshot = snapshots.at(-1);
  if (!snapshot) return [];
  const piVisibleCategories = new Set(snapshot.scope.piVisibleCategories);
  return dedupeToolNames(snapshot.scope.piVisibleTools
    .filter((grant) =>
      grant.piVisible &&
      grant.source === "callable_workflow" &&
      (!grant.categoryId || piVisibleCategories.has(grant.categoryId))
    )
    .map((grant) => grant.id));
}

export function resolveSubagentChildActiveToolActivation(input: {
  subagentToolScopeSnapshots: readonly SubagentToolScopeSnapshotSummary[];
  availableExtensionToolNames?: readonly string[];
  availableCallableWorkflowToolNames?: readonly string[];
}): SubagentChildActiveToolActivationResolution {
  const snapshot = input.subagentToolScopeSnapshots.at(-1);
  if (!snapshot) return {
    activeToolNames: [],
    unavailableExtensionToolNames: [],
    unavailableCallableWorkflowToolNames: [],
  };

  const piVisibleCategories = new Set(snapshot.scope.piVisibleCategories);
  const availableExtensionToolNames = new Set(input.availableExtensionToolNames ?? []);
  const availableCallableWorkflowToolNames = new Set(input.availableCallableWorkflowToolNames ?? []);
  const activeToolNames: string[] = [];
  const unavailableExtensionToolNames: SubagentChildActiveToolActivationResolution["unavailableExtensionToolNames"] = [];
  const unavailableCallableWorkflowToolNames: SubagentChildActiveToolActivationResolution["unavailableCallableWorkflowToolNames"] = [];
  for (const categoryId of snapshot.scope.piVisibleCategories) {
    activeToolNames.push(...CHILD_ACTIVE_TOOL_NAMES_BY_CATEGORY[categoryId]);
  }
  for (const grant of snapshot.scope.piVisibleTools) {
    if (!grant.piVisible) continue;
    if (grant.source === "built_in") {
      if (!grantCategoryAllowsTool(grant.id, grant.categoryId, piVisibleCategories)) continue;
      activeToolNames.push(grant.id);
      continue;
    }
    if (grant.source === "extension_tool") {
      if (grant.categoryId && !piVisibleCategories.has(grant.categoryId)) continue;
      if (availableExtensionToolNames.has(grant.id)) {
        activeToolNames.push(grant.id);
      } else {
        unavailableExtensionToolNames.push({
          toolName: grant.id,
          categoryId: grant.categoryId,
          reason: "Requested extension tool is not registered by any enabled Codex plugin MCP server for this child launch.",
        });
      }
    }
    if (grant.source === "callable_workflow") {
      if (grant.categoryId && !piVisibleCategories.has(grant.categoryId)) continue;
      if (availableCallableWorkflowToolNames.has(grant.id)) {
        activeToolNames.push(grant.id);
      } else {
        unavailableCallableWorkflowToolNames.push({
          toolName: grant.id,
          categoryId: grant.categoryId,
          reason: "Requested callable workflow tool is not registered as child-visible for this launch.",
        });
      }
    }
  }
  return {
    activeToolNames: dedupeToolNames(activeToolNames).filter((toolName) => !CHILD_NEVER_INHERIT_TOOL_NAMES.has(toolName)),
    unavailableExtensionToolNames,
    unavailableCallableWorkflowToolNames,
  };
}

function grantCategoryAllowsTool(
  toolName: string,
  categoryId: SubagentToolCategoryId | undefined,
  piVisibleCategories: ReadonlySet<SubagentToolCategoryId>,
): boolean {
  if (categoryId) {
    return piVisibleCategories.has(categoryId) && CHILD_ACTIVE_TOOL_NAMES_BY_CATEGORY[categoryId].includes(toolName);
  }
  for (const visibleCategoryId of piVisibleCategories) {
    if (CHILD_ACTIVE_TOOL_NAMES_BY_CATEGORY[visibleCategoryId].includes(toolName)) return true;
  }
  return false;
}

function dedupeToolNames(toolNames: readonly string[]): string[] {
  return [...new Set(toolNames)];
}

function formatUnavailableChildTool(tool: {
  toolName: string;
  categoryId?: SubagentToolCategoryId;
  reason: string;
}): string {
  return `${tool.toolName}${tool.categoryId ? ` (${tool.categoryId})` : ""}: ${tool.reason}`;
}
