import type { CallableWorkflowSourcePreview } from "../../shared/workflowTypes";
import type {
  CallableWorkflowCatalogDescription,
  CallableWorkflowCatalogEntry,
  CallableWorkflowCatalogEntryDescription,
  CallableWorkflowCatalogSearch,
  CallableWorkflowCatalogSearchResult,
  CallableWorkflowCatalogSearchScope,
  CallableWorkflowCatalogStatus,
  CallableWorkflowJsonSchema,
  CallableWorkflowRegistry,
  CallableWorkflowSourceContext,
  CallableWorkflowToolDescriptor,
} from "./callableWorkflowRegistry";

export function searchCallableWorkflowCatalogEntries(input: {
  schemaVersion: CallableWorkflowCatalogSearch["schemaVersion"];
  catalogStatus: CallableWorkflowCatalogStatus;
  query?: string;
  scope?: CallableWorkflowCatalogSearchScope;
  childGrantedToolNames?: readonly string[];
  includeUnavailable?: boolean;
  limit?: number;
}): CallableWorkflowCatalogSearch {
  const query = normalizedQuery(input.query);
  const scope = input.scope ?? (input.childGrantedToolNames ? "child_granted" : "parent_pi_visible");
  const includeUnavailable = Boolean(input.includeUnavailable);
  const limit = boundedSearchLimit(input.limit);
  const queryTokens = query ? query.split(/\s+/).filter(Boolean) : [];
  const childGrantedToolNames = new Set(input.childGrantedToolNames ?? []);
  const candidates = input.catalogStatus.entries
    .filter((entry) => callableWorkflowCatalogEntryInSearchScope(entry, { scope, includeUnavailable, childGrantedToolNames }))
    .map((entry) => callableWorkflowCatalogSearchResult(entry, queryTokens))
    .filter((result) => queryTokens.length === 0 || result.score > 0)
    .sort(callableWorkflowCatalogSearchResultSort)
    .slice(0, limit);

  return {
    schemaVersion: input.schemaVersion,
    query,
    scope,
    includeUnavailable,
    limit,
    totalEntryCount: input.catalogStatus.entries.length,
    searchedEntryCount: input.catalogStatus.entries.filter((entry) =>
      callableWorkflowCatalogEntryInSearchScope(entry, { scope, includeUnavailable, childGrantedToolNames }),
    ).length,
    resultCount: candidates.length,
    results: candidates,
    guidance: callableWorkflowCatalogSearchGuidance({ scope, includeUnavailable, resultCount: candidates.length }),
  };
}

export function describeCallableWorkflowCatalogEntryDetails(input: {
  schemaVersion: CallableWorkflowCatalogDescription["schemaVersion"];
  registry: CallableWorkflowRegistry;
  entryId?: string;
  toolName?: string;
  sourceId?: string;
  query?: string;
  scope?: CallableWorkflowCatalogSearchScope;
  childGrantedToolNames?: readonly string[];
  includeUnavailable?: boolean;
}): CallableWorkflowCatalogDescription {
  const query = normalizedQuery(input.query);
  const scope = input.scope ?? (input.childGrantedToolNames ? "child_granted" : "parent_pi_visible");
  const includeUnavailable = Boolean(input.includeUnavailable);
  const childGrantedToolNames = new Set(input.childGrantedToolNames ?? []);
  const scopedEntries = input.registry.catalogStatus.entries.filter((entry) =>
    callableWorkflowCatalogEntryInSearchScope(entry, { scope, includeUnavailable, childGrantedToolNames }),
  );
  const selected = selectCallableWorkflowCatalogEntry(scopedEntries, {
    entryId: optionalString(input.entryId),
    toolName: optionalString(input.toolName),
    sourceId: optionalString(input.sourceId),
    query,
  });

  return {
    schemaVersion: input.schemaVersion,
    status: selected ? "described" : "not_found",
    ...(input.entryId ? { entryId: input.entryId } : {}),
    ...(input.toolName ? { toolName: input.toolName } : {}),
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    query,
    scope,
    includeUnavailable,
    ...(selected ? { description: callableWorkflowCatalogEntryDescription(selected, input.registry) } : {}),
    guidance: callableWorkflowCatalogDescribeGuidance({ entry: selected, scope, includeUnavailable }),
  };
}

function callableWorkflowCatalogEntryInSearchScope(
  entry: CallableWorkflowCatalogEntry,
  input: {
    scope: CallableWorkflowCatalogSearchScope;
    includeUnavailable: boolean;
    childGrantedToolNames: Set<string>;
  },
): boolean {
  if (input.scope === "diagnostic_all") return input.includeUnavailable || entry.status === "parent_pi_visible";
  if (input.scope === "child_granted") {
    return Boolean(entry.toolName && input.childGrantedToolNames.has(entry.toolName) && entry.status === "parent_pi_visible");
  }
  if (input.includeUnavailable) return true;
  return entry.status === "parent_pi_visible";
}

function selectCallableWorkflowCatalogEntry(
  entries: readonly CallableWorkflowCatalogEntry[],
  input: {
    entryId?: string;
    toolName?: string;
    sourceId?: string;
    query: string;
  },
): CallableWorkflowCatalogEntry | undefined {
  if (input.entryId) return entries.find((entry) => entry.id === input.entryId);
  if (input.toolName) return entries.find((entry) => entry.toolName === input.toolName);
  if (input.sourceId) return entries.find((entry) => entry.sourceId === input.sourceId);
  if (!input.query) return undefined;
  const queryTokens = input.query.split(/\s+/).filter(Boolean);
  return entries
    .map((entry) => ({
      entry,
      result: callableWorkflowCatalogSearchResult(entry, queryTokens),
    }))
    .filter(({ result }) => result.score > 0)
    .sort((left, right) => callableWorkflowCatalogSearchResultSort(left.result, right.result))
    .map(({ entry }) => entry)[0];
}

function callableWorkflowCatalogEntryDescription(
  entry: CallableWorkflowCatalogEntry,
  registry: CallableWorkflowRegistry,
): CallableWorkflowCatalogEntryDescription {
  const result = callableWorkflowCatalogSearchResult(entry, []);
  const tool = entry.toolId ? registry.tools.find((candidate) => candidate.id === entry.toolId) : undefined;
  return {
    ...result,
    ...(entry.defaultBlocking !== undefined ? { defaultBlocking: entry.defaultBlocking } : {}),
    ...(tool ? { execution: { ...tool.execution } } : {}),
    ...(tool ? { inputSchema: cloneCallableWorkflowJsonSchema(tool.inputSchema) } : {}),
    ...(tool ? { policySnapshot: clonePolicySnapshot(tool.policySnapshot) } : {}),
    ...(tool ? { sourceContext: cloneSourceContext(tool.sourceContext) } : {}),
    ...(entry.sourcePreview ? { sourcePreview: cloneSourcePreview(entry.sourcePreview) } : {}),
  };
}

function callableWorkflowCatalogSearchResult(
  entry: CallableWorkflowCatalogEntry,
  queryTokens: readonly string[],
): CallableWorkflowCatalogSearchResult {
  const searchText = callableWorkflowCatalogSearchText(entry);
  const sourcePreview = entry.sourcePreview;
  return {
    id: entry.id,
    label: entry.label,
    summary: entry.summary,
    sourceKind: entry.sourceKind,
    sourceId: entry.sourceId,
    ...(entry.sourceVersion !== undefined ? { sourceVersion: entry.sourceVersion } : {}),
    status: entry.status,
    ...(entry.toolName ? { toolName: entry.toolName } : {}),
    parentPiVisible: entry.parentPiVisible,
    childAccessStatus: entry.childAccessStatus,
    nestedFanoutLimitRequired: entry.nestedFanoutLimitRequired,
    inputSchemaRequired: [...entry.inputSchemaRequired],
    launchCardRequirementIds: [...entry.launchCardRequirementIds],
    metricTemplateIds: [...entry.metricTemplateIds],
    readinessLabels: callableWorkflowCatalogReadinessLabels(entry),
    nextActionLabel: callableWorkflowCatalogNextActionLabel(entry),
    ...(sourcePreview ? { sourcePreviewLabel: sourcePreview.label } : {}),
    ...(sourcePreview ? { sourcePreviewDslStatus: sourcePreview.dslStatus } : {}),
    ...(sourcePreview ? { sourcePreviewSnippet: truncate(sourcePreview.text.replace(/\s+/g, " ").trim(), 280) } : {}),
    exclusionReasons: [...entry.exclusionReasons],
    score: callableWorkflowCatalogSearchScore(entry, searchText, queryTokens),
    searchText,
  };
}

function callableWorkflowCatalogSearchText(entry: CallableWorkflowCatalogEntry): string {
  return [
    entry.id,
    entry.label,
    entry.summary,
    entry.sourceKind,
    entry.sourceId,
    String(entry.sourceVersion ?? ""),
    entry.status,
    entry.toolName ?? "",
    entry.visibility ?? "",
    entry.childAccessStatus,
    entry.executionMode ?? "",
    ...entry.inputSchemaRequired,
    ...entry.launchCardRequirementIds,
    ...entry.metricTemplateIds,
    ...entry.exclusionReasons,
    ...entry.sourceSearchTerms,
    entry.sourcePreview?.label ?? "",
    entry.sourcePreview?.dslStatus ?? "",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function callableWorkflowCatalogSearchScore(
  entry: CallableWorkflowCatalogEntry,
  searchText: string,
  queryTokens: readonly string[],
): number {
  if (queryTokens.length === 0) return callableWorkflowCatalogBaseScore(entry);
  const lowerSearchText = searchText.toLowerCase();
  const lowerLabel = entry.label.toLowerCase();
  const lowerToolName = (entry.toolName ?? "").toLowerCase();
  const lowerSourceId = entry.sourceId.toLowerCase();
  let score = 0;
  let matched = 0;
  for (const token of queryTokens) {
    if (!lowerSearchText.includes(token)) continue;
    matched += 1;
    score += 1;
    if (lowerLabel.includes(token)) score += 4;
    if (lowerToolName.includes(token)) score += 3;
    if (lowerSourceId.includes(token)) score += 2;
  }
  if (matched === 0) return 0;
  return score + callableWorkflowCatalogBaseScore(entry);
}

function callableWorkflowCatalogBaseScore(entry: CallableWorkflowCatalogEntry): number {
  let score = 0;
  if (entry.status === "parent_pi_visible") score += 10;
  if (entry.sourceKind === "symphony_recipe") score += 2;
  if (entry.metricTemplateIds.length > 0) score += 1;
  if (entry.sourcePreview) score += 1;
  return score;
}

function callableWorkflowCatalogSearchResultSort(
  left: CallableWorkflowCatalogSearchResult,
  right: CallableWorkflowCatalogSearchResult,
): number {
  return right.score - left.score || left.label.localeCompare(right.label) || left.id.localeCompare(right.id);
}

function callableWorkflowCatalogReadinessLabels(entry: CallableWorkflowCatalogEntry): string[] {
  const labels: string[] = [];
  if (entry.status === "parent_pi_visible") labels.push("Parent Pi visible");
  if (entry.status === "hidden_feature_disabled") labels.push("Hidden until ambient.subagents is enabled");
  if (entry.status === "excluded_not_callable") labels.push("Not callable yet");
  if (entry.childAccessStatus === "role_policy_required") labels.push("Child access requires exact role policy");
  if (entry.nestedFanoutLimitRequired) labels.push("Nested fanout budget required");
  if (entry.inputSchemaRequired.length) labels.push(`Schema requires ${entry.inputSchemaRequired.join(", ")}`);
  if (entry.metricTemplateIds.length) labels.push("Metric/rubric criteria required");
  if (entry.sourcePreview) labels.push("Readable source preview available");
  if (entry.sourceKind === "recorded_workflow" && entry.status === "parent_pi_visible") labels.push("Recorded playbook confirmed");
  if (entry.exclusionReasons.length) labels.push(`Excluded: ${entry.exclusionReasons.join(", ")}`);
  return labels;
}

function callableWorkflowCatalogNextActionLabel(entry: CallableWorkflowCatalogEntry): string {
  if (entry.status === "hidden_feature_disabled") return "Enable ambient.subagents before registering this workflow tool.";
  if (entry.status === "excluded_not_callable") {
    return "Confirm, enable, and unarchive the recorded workflow before it can become a callable tool.";
  }
  if (entry.childAccessStatus === "role_policy_required") {
    return entry.toolName
      ? `Call ${entry.toolName} from a parent, or grant that exact tool through child role policy before child use.`
      : "Grant an exact callable workflow tool name through child role policy before child use.";
  }
  return entry.toolName ? `Call ${entry.toolName} with schema-valid input.` : "Use a callable workflow tool with schema-valid input.";
}

function callableWorkflowCatalogSearchGuidance(input: {
  scope: CallableWorkflowCatalogSearchScope;
  includeUnavailable: boolean;
  resultCount: number;
}): string[] {
  const guidance = ["Use callable workflow tools only after validating their JSON Schema input and launch-card requirements."];
  if (input.scope === "child_granted") {
    guidance.push("Child results list only exact workflow tools granted by launch-time child role policy.");
  } else {
    guidance.push(
      "Child sessions need explicit role policy, nested fanout budget, and exact tool-name grants before using workflow tools.",
    );
  }
  if (input.includeUnavailable) {
    guidance.push("Unavailable entries are diagnostic context only and must not be called.");
  }
  if (input.resultCount === 0) {
    guidance.push("No matching callable workflow catalog entries were found for this scope.");
  }
  return guidance;
}

function callableWorkflowCatalogDescribeGuidance(input: {
  entry?: CallableWorkflowCatalogEntry;
  scope: CallableWorkflowCatalogSearchScope;
  includeUnavailable: boolean;
}): string[] {
  if (!input.entry) {
    return [
      "No callable workflow catalog entry matched this request in the current scope.",
      input.scope === "child_granted"
        ? "Child descriptions are limited to exact workflow tools granted by launch-time child role policy."
        : "Use catalog search first, then describe by toolName or entryId before launching.",
    ];
  }
  const guidance = [
    "This catalog description is read-only and does not queue or start a workflow task.",
    input.entry.toolName
      ? `Launch requires a separate call to ${input.entry.toolName} with schema-valid input.`
      : "This entry is not launchable in the current catalog state.",
  ];
  if (input.entry.metricTemplateIds.length > 0) {
    guidance.push(`Provide metricCriteria for: ${input.entry.metricTemplateIds.join(", ")}.`);
  }
  if (input.scope === "child_granted") {
    guidance.push("This child can describe only exact callable workflow tools granted by its role policy.");
  }
  if (input.entry.status !== "parent_pi_visible" || input.includeUnavailable) {
    guidance.push("Unavailable catalog entries are diagnostic context only and must not be called.");
  }
  return guidance;
}

function normalizedQuery(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().replace(/\s+/g, " ").trim() : "";
}

function boundedSearchLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 8;
  return Math.min(25, Math.max(1, Math.floor(value)));
}

export function cloneCallableWorkflowTool(tool: CallableWorkflowToolDescriptor): CallableWorkflowToolDescriptor {
  return {
    ...tool,
    source: { ...tool.source },
    sourceContext: cloneSourceContext(tool.sourceContext),
    inputSchema: cloneCallableWorkflowJsonSchema(tool.inputSchema),
    execution: { ...tool.execution },
    policySnapshot: clonePolicySnapshot(tool.policySnapshot),
  };
}

function cloneCallableWorkflowJsonSchema(schema: CallableWorkflowJsonSchema): CallableWorkflowJsonSchema {
  return {
    ...schema,
    required: [...schema.required],
    properties: Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, { ...value }])),
  };
}

export function cloneSourceContext(context: CallableWorkflowSourceContext): CallableWorkflowSourceContext {
  return JSON.parse(JSON.stringify(context)) as CallableWorkflowSourceContext;
}

export function cloneSourcePreview(preview: CallableWorkflowSourcePreview): CallableWorkflowSourcePreview {
  return {
    ...preview,
    searchTerms: [...preview.searchTerms],
  };
}

export function clonePolicySnapshot(
  snapshot: CallableWorkflowToolDescriptor["policySnapshot"],
): CallableWorkflowToolDescriptor["policySnapshot"] {
  return {
    ...snapshot,
    launchCardRequirementIds: [...snapshot.launchCardRequirementIds],
    metricTemplateIds: [...snapshot.metricTemplateIds],
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
