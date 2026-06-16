import {
  normalizeSubagentToolScopeSourceRequestIdForSource,
  SUBAGENT_TOOL_CATEGORIES,
  type SubagentChildAuthorityDecision,
  type SubagentChildAuthorityRequest,
  type SubagentChildAuthorityTaskIntent,
  type SubagentTaskToolRequest,
  type SubagentToolCategoryId,
  type SubagentToolScopeSource,
  type SubagentToolScopeSourceRequest,
} from "../shared/subagentToolScope";
import {
  isSubagentChildActivatableBuiltInTool,
  subagentChildActivatableBuiltInToolNamesForCategory,
} from "./subagentChildActiveTools";

export const SUBAGENT_TOOL_SCOPE_REQUEST_SCHEMA_VERSION = "ambient-subagent-tool-scope-request-v1" as const;
export const SUBAGENT_TOOL_SCOPE_REQUEST_APPROVAL_MODES = ["interactive", "non_interactive"] as const;
export const SUBAGENT_CHILD_AUTHORITY_TASK_INTENTS = [
  "file_read",
  "analysis",
  "web_research",
  "mutation",
  "workflow",
  "connector",
  "custom",
] as const satisfies readonly SubagentChildAuthorityTaskIntent[];
const SUBAGENT_CHILD_AUTHORITY_DECISIONS = ["allow", "ask_parent", "deny", "allow_isolated_worktree"] as const;
const SUBAGENT_CHILD_AUTHORITY_SIMPLE_DECISIONS = ["allow", "ask_parent", "deny"] as const;
const MAX_AUTHORITY_TEXT_CHARS = 240;
const MAX_AUTHORITY_RESOURCE_CHARS = 512;
const AUTHORITY_RESOURCE_LIMIT = 32;

export type SubagentToolScopeRequestApprovalMode = typeof SUBAGENT_TOOL_SCOPE_REQUEST_APPROVAL_MODES[number];

export interface SubagentToolScopeRequest extends SubagentTaskToolRequest {
  approvalMode?: SubagentToolScopeRequestApprovalMode;
}

export interface SubagentUnavailableRequestedExtensionTool {
  id: string;
  categoryId?: SubagentToolCategoryId;
}

export function resolveSubagentToolScopeRequest(value: unknown): SubagentToolScopeRequest {
  const toolScope = objectInput(value);
  const categories = parseRequestedCategories(toolScope.requestedCategories);
  const requestedSources = [
    ...parseToolSourceRequests(toolScope.builtInTools, "builtInTools", "built_in"),
    ...parseToolSourceRequests(toolScope.extensionLoads, "extensionLoads", "extension_load"),
    ...parseToolSourceRequests(toolScope.surfacedExtensionTools, "surfacedExtensionTools", "extension_tool"),
    ...parseToolSourceRequests(toolScope.directMcpTools, "directMcpTools", "direct_mcp"),
    ...parseToolSourceRequests(toolScope.connectorTools, "connectorTools", "connector_app"),
    ...parseToolSourceRequests(toolScope.callableWorkflowTools, "callableWorkflowTools", "callable_workflow"),
    ...parseToolSourceRequests(toolScope.skills, "skills", "skill"),
  ];
  const approvalMode = enumValueOptional(toolScope.approvalMode, SUBAGENT_TOOL_SCOPE_REQUEST_APPROVAL_MODES);
  const fanout = typeof toolScope.fanout === "boolean" ? toolScope.fanout : undefined;
  const childAuthority = parseChildAuthorityRequest(toolScope.childAuthority);
  return {
    ...(categories.length ? { requestedCategories: [...new Set(categories)] } : {}),
    ...(requestedSources.length ? { requestedSources } : {}),
    ...(fanout === true ? { requestedFanout: true } : {}),
    ...(approvalMode ? { approvalMode } : {}),
    ...(childAuthority ? { childAuthority } : {}),
  };
}

export function unavailableRequestedExtensionToolNames(
  requestedToolScope: SubagentTaskToolRequest,
  availableExtensionToolNames?: readonly string[],
): SubagentUnavailableRequestedExtensionTool[] {
  if (availableExtensionToolNames === undefined) return [];
  const available = new Set(availableExtensionToolNames);
  const unavailable: SubagentUnavailableRequestedExtensionTool[] = [];
  for (const request of requestedToolScope.requestedSources ?? []) {
    if (request.source !== "extension_tool") continue;
    if (request.piVisible === false) continue;
    if (available.has(request.id)) continue;
    unavailable.push({
      id: request.id,
      ...(request.categoryId ? { categoryId: request.categoryId } : {}),
    });
  }
  return unavailable;
}

export function isSubagentToolCategoryId(value: string): value is SubagentToolCategoryId {
  return SUBAGENT_TOOL_CATEGORIES.some((category) => category.id === value);
}

function parseRequestedCategories(value: unknown): SubagentToolCategoryId[] {
  const categories: SubagentToolCategoryId[] = [];
  for (const item of arrayInput(value)) {
    const categoryId = typeof item === "string" ? item.trim() : "";
    if (!categoryId) continue;
    if (!isSubagentToolCategoryId(categoryId)) {
      throw new Error(`Unknown sub-agent tool category in toolScope.requestedCategories: ${categoryId}`);
    }
    categories.push(categoryId);
  }
  return categories;
}

function parseToolSourceRequests(
  value: unknown,
  fieldName: string,
  source: SubagentToolScopeSource,
): SubagentToolScopeSourceRequest[] {
  return arrayInput(value).map((item, index) => {
    const descriptor = objectInput(item);
    const rawId = optionalString(descriptor.id);
    if (!rawId) throw new Error(`toolScope.${fieldName}[${index}].id is required.`);
    const id = normalizeSubagentToolScopeSourceRequestIdForSource(source, rawId);
    const rawCategoryId = optionalString(descriptor.categoryId);
    let categoryId: SubagentToolCategoryId | undefined;
    if (rawCategoryId) {
      if (!isSubagentToolCategoryId(rawCategoryId)) {
        throw new Error(`Unknown sub-agent tool category in toolScope.${fieldName}[${index}].categoryId: ${rawCategoryId}`);
      }
      categoryId = rawCategoryId;
    }
    if (source === "built_in" && categoryId && !isSubagentChildActivatableBuiltInTool({ toolName: id, categoryId })) {
      const candidates = subagentChildActivatableBuiltInToolNamesForCategory(categoryId);
      const suffix = candidates.length
        ? ` Use one of: ${candidates.join(", ")}.`
        : ` No exact built-in child tools are currently activatable for ${categoryId}; use requestedCategories for broad policy, or choose another category.`;
      throw new Error(`Unknown or unsupported built-in child tool in toolScope.${fieldName}[${index}]: ${id} is not activatable for ${categoryId}.${suffix}`);
    }
    const piVisible = typeof descriptor.piVisible === "boolean" ? descriptor.piVisible : undefined;
    return {
      source,
      id,
      ...(categoryId ? { categoryId } : {}),
      ...(piVisible !== undefined ? { piVisible } : {}),
    };
  });
}

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function arrayInput(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseChildAuthorityRequest(value: unknown): SubagentChildAuthorityRequest | undefined {
  if (value === undefined || value === null) return undefined;
  const input = objectInput(value);
  const taskIntent = enumValueOptional(input.taskIntent, SUBAGENT_CHILD_AUTHORITY_TASK_INTENTS);
  const rationale = boundedOptionalString(input.rationale, "toolScope.childAuthority.rationale", MAX_AUTHORITY_TEXT_CHARS);
  const readRoots = parseAuthorityStringArray(input.readRoots, "toolScope.childAuthority.readRoots");
  const writeRoots = parseAuthorityStringArray(input.writeRoots, "toolScope.childAuthority.writeRoots");
  const browserDomains = parseAuthorityStringArray(input.browserDomains, "toolScope.childAuthority.browserDomains");
  const connectorMethods = parseAuthorityStringArray(input.connectorMethods, "toolScope.childAuthority.connectorMethods");
  const network = enumValueOptional(input.network, SUBAGENT_CHILD_AUTHORITY_SIMPLE_DECISIONS);
  const mutation = enumValueOptional(input.mutation, SUBAGENT_CHILD_AUTHORITY_DECISIONS);
  const nestedFanout = enumValueOptional(input.nestedFanout, SUBAGENT_CHILD_AUTHORITY_SIMPLE_DECISIONS);
  const request: SubagentChildAuthorityRequest = {
    ...(taskIntent ? { taskIntent } : {}),
    ...(rationale ? { rationale } : {}),
    ...(readRoots.length ? { readRoots } : {}),
    ...(writeRoots.length ? { writeRoots } : {}),
    ...(browserDomains.length ? { browserDomains } : {}),
    ...(connectorMethods.length ? { connectorMethods } : {}),
    ...(network ? { network } : {}),
    ...(mutation ? { mutation: mutation as SubagentChildAuthorityDecision } : {}),
    ...(nestedFanout ? { nestedFanout } : {}),
  };
  return Object.keys(request).length ? request : undefined;
}

function parseAuthorityStringArray(value: unknown, fieldName: string): string[] {
  return [...new Set(arrayInput(value).map((item, index) => {
    const text = boundedOptionalString(item, `${fieldName}[${index}]`, MAX_AUTHORITY_RESOURCE_CHARS);
    if (!text) return undefined;
    if (text.includes("*")) throw new Error(`${fieldName}[${index}] must not use wildcard grants.`);
    return text;
  }).filter((item): item is string => Boolean(item)))].slice(0, AUTHORITY_RESOURCE_LIMIT);
}

function boundedOptionalString(value: unknown, fieldName: string, maxChars: number): string | undefined {
  const text = optionalString(value);
  if (!text) return undefined;
  if (text.length > maxChars) throw new Error(`${fieldName} exceeds ${maxChars} characters.`);
  return text;
}

function enumValueOptional<T extends readonly string[]>(value: unknown, allowed: T): T[number] | undefined {
  const text = optionalString(value);
  if (!text) return undefined;
  return (allowed as readonly string[]).includes(text) ? text as T[number] : undefined;
}
