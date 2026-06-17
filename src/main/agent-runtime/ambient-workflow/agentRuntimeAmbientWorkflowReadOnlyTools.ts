import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  ambientWorkflowsDescribeText,
  ambientWorkflowsSearchText,
  describeAmbientWorkflowPlaybook,
  searchAmbientWorkflowPlaybooks,
  type AmbientWorkflowPlaybookDescription,
  type AmbientWorkflowsDescribeInput,
  type AmbientWorkflowsSearchInput,
  type AmbientWorkflowsSearchResponse,
} from "../../ambient/ambientWorkflows";
import {
  buildCallableWorkflowRegistry,
  type CallableWorkflowCatalogEntry,
  type CallableWorkflowCatalogStatus,
} from "../../callable-workflow/callableWorkflowRegistry";
import { pluginInstallToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import type { ProjectStore } from "../../projectStore/projectStore";
import { resolveAmbientFeatureFlags, type AmbientFeatureFlagSnapshot } from "../../../shared/featureFlags";
import type { WorkflowRecordingLibraryDescription } from "../../../shared/types";

interface AmbientWorkflowReadOnlyServices {
  search?: (input: AmbientWorkflowsSearchInput) => Promise<AmbientWorkflowsSearchResponse> | AmbientWorkflowsSearchResponse;
  describe?: (input: AmbientWorkflowsDescribeInput) => Promise<AmbientWorkflowPlaybookDescription> | AmbientWorkflowPlaybookDescription;
}

export interface AmbientWorkflowReadOnlyToolRegistrationOptions {
  store: ProjectStore;
  workflowRecordings?: AmbientWorkflowReadOnlyServices;
  markAmbientWorkflowPlaybookDescribed: (id: string, version: number) => void;
  searchAmbientWorkflowPlaybooks?: typeof searchAmbientWorkflowPlaybooks;
  describeAmbientWorkflowPlaybook?: typeof describeAmbientWorkflowPlaybook;
  getFeatureFlagSnapshot?: () => AmbientFeatureFlagSnapshot;
  getCallableWorkflowRecordedPlaybooks?: () => readonly WorkflowRecordingLibraryDescription[];
}

export function registerAmbientWorkflowReadOnlyTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AmbientWorkflowReadOnlyToolRegistrationOptions,
): void {
  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_workflows_search"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = ambientWorkflowsSearchInput(params as Record<string, unknown>);
      const result = options.workflowRecordings?.search
        ? await options.workflowRecordings.search(input)
        : (options.searchAmbientWorkflowPlaybooks ?? searchAmbientWorkflowPlaybooks)(options.store, input);
      return {
        content: [{ type: "text" as const, text: ambientWorkflowsSearchText(result) }],
        details: {
          runtime: "ambient-workflows",
          toolName: "ambient_workflows_search",
          query: input.query,
          resultCount: result.results.length,
          truncated: result.truncated,
          workflowIds: result.results.map((item) => item.id),
          versions: result.results.map((item) => item.version),
          catalogVersion: result.catalogVersion,
        },
      };
    },
  });

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_workflows_describe"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = ambientWorkflowsDescribeInput(params as Record<string, unknown>);
      const result = options.workflowRecordings?.describe
        ? await options.workflowRecordings.describe(input)
        : (options.describeAmbientWorkflowPlaybook ?? describeAmbientWorkflowPlaybook)(options.store, input);
      options.markAmbientWorkflowPlaybookDescribed(result.id, result.version);
      return {
        content: [{ type: "text" as const, text: ambientWorkflowsDescribeText(result) }],
        details: {
          runtime: "ambient-workflows",
          toolName: "ambient_workflows_describe",
          workflowId: result.id,
          version: result.version,
          enabled: result.enabled,
          toolNames: result.toolNames,
          outputShape: result.outputShape,
          markdownIncluded: result.markdownIncluded,
          markdownTruncated: result.markdownTruncated,
        },
      };
    },
  });

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_workflows_callable_catalog"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = ambientWorkflowsCallableCatalogInput(params as Record<string, unknown>);
      const featureFlagSnapshot = options.getFeatureFlagSnapshot?.() ??
        resolveAmbientFeatureFlags({ settings: options.store.getFeatureFlagSettings() });
      const registry = buildCallableWorkflowRegistry({
        featureFlagSnapshot,
        recordedWorkflowPlaybooks: [...(options.getCallableWorkflowRecordedPlaybooks?.() ?? [])],
      });
      const status = registry.catalogStatus;
      const entries = boundedCallableCatalogEntries(status.entries, input);
      return {
        content: [{ type: "text" as const, text: ambientWorkflowsCallableCatalogText(status, entries, input) }],
        details: {
          runtime: "ambient-workflows",
          toolName: "ambient_workflows_callable_catalog",
          query: input.query,
          featureFlagEnabled: status.featureFlagEnabled,
          callableToolCount: status.callableToolCount,
          visibleParentToolCount: status.visibleParentToolCount,
          hiddenFeatureDisabledCount: status.hiddenFeatureDisabledCount,
          childRolePolicyRequiredCount: status.childRolePolicyRequiredCount,
          excludedRecordedWorkflowCount: status.excludedRecordedWorkflowCount,
          returnedEntryCount: entries.length,
          matchedEntryCount: filteredCallableCatalogEntries(status.entries, input).length,
          truncated: entries.length < filteredCallableCatalogEntries(status.entries, input).length,
          visibleToolNames: status.featureFlagEnabled
            ? entries.filter(entryIsParentVisible).map((entry) => entry.toolName).filter((name): name is string => Boolean(name))
            : [],
          entryIds: entries.map((entry) => entry.id),
          excludedEntryIds: entries.filter((entry) => entry.status === "excluded_not_callable").map((entry) => entry.id),
        },
      };
    },
  });

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_workflows_callable_describe"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = ambientWorkflowsCallableDescribeInput(params as Record<string, unknown>);
      const featureFlagSnapshot = options.getFeatureFlagSnapshot?.() ??
        resolveAmbientFeatureFlags({ settings: options.store.getFeatureFlagSettings() });
      const registry = buildCallableWorkflowRegistry({
        featureFlagSnapshot,
        recordedWorkflowPlaybooks: [...(options.getCallableWorkflowRecordedPlaybooks?.() ?? [])],
      });
      const status = registry.catalogStatus;
      const entry = findCallableCatalogEntry(status.entries, input);
      return {
        content: [{
          type: "text" as const,
          text: ambientWorkflowsCallableDescribeText(status, entry, input),
        }],
        details: {
          runtime: "ambient-workflows",
          toolName: "ambient_workflows_callable_describe",
          featureFlagEnabled: status.featureFlagEnabled,
          selector: callableDescribeSelectorDetails(input),
          found: Boolean(entry),
          ...(entry ? {
            entryId: entry.id,
            status: entry.status,
            sourceKind: entry.sourceKind,
            sourceId: entry.sourceId,
            parentPiVisible: entry.parentPiVisible,
            childAccessStatus: entry.childAccessStatus,
            visibleToolName: status.featureFlagEnabled && entryIsParentVisible(entry) ? entry.toolName : undefined,
            sourcePreviewIncluded: Boolean(input.includeSourcePreview && entry.sourcePreview),
            sourcePreviewLineCount: entry.sourcePreview
              ? boundedSourcePreviewLines(entry.sourcePreview.text, input.maxSourcePreviewLines).length
              : 0,
            sourcePreviewTruncated: entry.sourcePreview
              ? boundedSourcePreviewLines(entry.sourcePreview.text, input.maxSourcePreviewLines).length <
                sourcePreviewLineCount(entry.sourcePreview.text)
              : false,
          } : {}),
        },
      };
    },
  });
}

function ambientWorkflowsSearchInput(input: Record<string, unknown>): AmbientWorkflowsSearchInput {
  return {
    ...(optionalString(input.query) ? { query: optionalString(input.query) } : {}),
    ...(optionalNumber(input.limit) ? { limit: optionalNumber(input.limit) } : {}),
    ...(optionalBoolean(input.includeDisabled) !== undefined ? { includeDisabled: optionalBoolean(input.includeDisabled) } : {}),
    ...(optionalBoolean(input.includeArchived) !== undefined ? { includeArchived: optionalBoolean(input.includeArchived) } : {}),
  };
}

function ambientWorkflowsDescribeInput(input: Record<string, unknown>): AmbientWorkflowsDescribeInput {
  return {
    id: requiredString(input, "id"),
    ...(optionalNumber(input.version) !== undefined ? { version: optionalNumber(input.version) } : {}),
    ...(optionalBoolean(input.includeMarkdown) !== undefined ? { includeMarkdown: optionalBoolean(input.includeMarkdown) } : {}),
    ...(optionalBoolean(input.includeArchived) !== undefined ? { includeArchived: optionalBoolean(input.includeArchived) } : {}),
    ...(optionalNumber(input.maxMarkdownChars) !== undefined ? { maxMarkdownChars: optionalNumber(input.maxMarkdownChars) } : {}),
  };
}

interface AmbientWorkflowsCallableCatalogInput {
  limit: number;
  includeExcluded: boolean;
  sourceKind?: "symphony_recipe" | "recorded_workflow";
  query?: string;
}

interface AmbientWorkflowsCallableDescribeInput {
  id?: string;
  toolName?: string;
  sourceKind?: "symphony_recipe" | "recorded_workflow";
  sourceId?: string;
  sourceVersion?: string;
  includeExcluded: boolean;
  includeSourcePreview: boolean;
  includeSourceSearchTerms: boolean;
  maxSourcePreviewLines: number;
}

function ambientWorkflowsCallableCatalogInput(input: Record<string, unknown>): AmbientWorkflowsCallableCatalogInput {
  const sourceKind = optionalString(input.sourceKind);
  const query = optionalString(input.query);
  return {
    limit: Math.max(1, Math.min(Math.floor(optionalNumber(input.limit) ?? 16), 50)),
    includeExcluded: optionalBoolean(input.includeExcluded) ?? true,
    ...(sourceKind === "symphony_recipe" || sourceKind === "recorded_workflow" ? { sourceKind } : {}),
    ...(query ? { query } : {}),
  };
}

function ambientWorkflowsCallableDescribeInput(input: Record<string, unknown>): AmbientWorkflowsCallableDescribeInput {
  const id = optionalString(input.id);
  const toolName = optionalString(input.toolName);
  const sourceId = optionalString(input.sourceId);
  const sourceKind = optionalString(input.sourceKind);
  const sourceVersion = optionalString(input.sourceVersion) ?? optionalNumber(input.sourceVersion)?.toString();
  if (!id && !toolName && !sourceId) {
    throw new Error("Provide id, toolName, or sourceId to describe a callable workflow catalog entry.");
  }
  return {
    ...(id ? { id } : {}),
    ...(toolName ? { toolName } : {}),
    ...(sourceKind === "symphony_recipe" || sourceKind === "recorded_workflow" ? { sourceKind } : {}),
    ...(sourceId ? { sourceId } : {}),
    ...(sourceVersion ? { sourceVersion } : {}),
    includeExcluded: optionalBoolean(input.includeExcluded) ?? true,
    includeSourcePreview: optionalBoolean(input.includeSourcePreview) ?? true,
    includeSourceSearchTerms: optionalBoolean(input.includeSourceSearchTerms) ?? true,
    maxSourcePreviewLines: Math.max(1, Math.min(Math.floor(optionalNumber(input.maxSourcePreviewLines) ?? 80), 200)),
  };
}

function ambientWorkflowsCallableCatalogText(
  status: CallableWorkflowCatalogStatus,
  entries: readonly CallableWorkflowCatalogEntry[],
  input: AmbientWorkflowsCallableCatalogInput,
): string {
  const allFiltered = filteredCallableCatalogEntries(status.entries, input);
  const lines: string[] = [
    "Ambient callable workflow catalog",
    `Schema: ${status.schemaVersion}`,
    `Feature flag ambient.subagents: ${status.featureFlagEnabled ? "enabled" : "disabled"}`,
    `Callable tools: ${status.callableToolCount}`,
    `Parent-visible tools: ${status.visibleParentToolCount}`,
    `Child role-policy gated tools: ${status.childRolePolicyRequiredCount}`,
    `Hidden while disabled: ${status.hiddenFeatureDisabledCount}`,
    `Excluded recorded workflows: ${status.excludedRecordedWorkflowCount}`,
    `Returned entries: ${entries.length}${entries.length < allFiltered.length ? ` of ${allFiltered.length}` : ""}`,
  ];
  if (input.query) lines.push(`Query: ${input.query}`);
  if (!status.featureFlagEnabled) {
    lines.push(
      "",
      "Callable workflow launch tools are not Pi-visible while ambient.subagents is disabled.",
      "Enable the feature flag before expecting parent-visible Symphony or recorded workflow launch tools.",
      "For recorded workflow entries, if the user asked to run the saved playbook, do not stop at this gate: use ambient_workflows_describe and ambient_workflows_inject, then complete the task through the normal chat/tool loop as a manual playbook-guided run.",
    );
  }
  for (const entry of entries) {
    lines.push("", ...callableCatalogEntryLines(entry, status.featureFlagEnabled));
  }
  if (entries.length === 0) {
    lines.push("", "No callable workflow catalog entries matched the filters.");
  }
  return lines.join("\n");
}

function ambientWorkflowsCallableDescribeText(
  status: CallableWorkflowCatalogStatus,
  entry: CallableWorkflowCatalogEntry | undefined,
  input: AmbientWorkflowsCallableDescribeInput,
): string {
  const lines = [
    "Ambient callable workflow catalog entry",
    `Schema: ${status.schemaVersion}`,
    `Feature flag ambient.subagents: ${status.featureFlagEnabled ? "enabled" : "disabled"}`,
    `Selector: ${callableDescribeSelectorLabel(input)}`,
  ];
  if (!status.featureFlagEnabled) {
    lines.push(
      "Callable workflow launch tools are not Pi-visible while ambient.subagents is disabled.",
      "Hidden launch tool names remain withheld; this describe view is read-only catalog metadata.",
      "For recorded workflow entries, if the user asked to run the saved playbook, use ambient_workflows_describe and ambient_workflows_inject, then complete the task through the normal chat/tool loop as a manual playbook-guided run.",
    );
  }
  if (!entry) {
    lines.push("No callable workflow catalog entry matched the exact selector.");
    return lines.join("\n");
  }
  lines.push("", ...callableCatalogEntryLines(entry, status.featureFlagEnabled, {
    includeSourcePreview: input.includeSourcePreview,
    sourcePreviewLineLimit: input.maxSourcePreviewLines,
    includeSourceSearchTerms: input.includeSourceSearchTerms,
  }));
  return lines.join("\n");
}

function callableCatalogEntryLines(
  entry: CallableWorkflowCatalogEntry,
  featureFlagEnabled: boolean,
  options: {
    includeSourcePreview?: boolean;
    sourcePreviewLineLimit?: number;
    includeSourceSearchTerms?: boolean;
  } = {},
): string[] {
  const includeSourcePreview = options.includeSourcePreview ?? true;
  const sourcePreviewLineLimit = options.sourcePreviewLineLimit ?? 8;
  const includeSourceSearchTerms = options.includeSourceSearchTerms ?? true;
  const lines = [
    `Catalog entry: ${entry.label}`,
    `Entry id: ${entry.id}`,
    `Source: ${entry.sourceKind} ${entry.sourceId}${entry.sourceVersion !== undefined ? ` v${entry.sourceVersion}` : ""}`,
    `Status: ${entry.status}`,
    `Summary: ${entry.summary}`,
    `Parent Pi visible: ${entry.parentPiVisible ? "yes" : "no"}`,
    `Child access: ${entry.childAccessStatus}${entry.nestedFanoutLimitRequired ? " with nested fanout policy" : ""}`,
  ];
  if (!featureFlagEnabled && entry.sourceKind === "recorded_workflow" && entry.status === "hidden_feature_disabled") {
    lines.push(
      `Manual playbook fallback: call ambient_workflows_describe id="${entry.sourceId}"${
        entry.sourceVersion !== undefined ? ` version=${entry.sourceVersion}` : ""
      }, then ambient_workflows_inject for that id/version, and complete the user's task through normal chat/tools.`,
    );
  }
  if (featureFlagEnabled && entryIsParentVisible(entry) && entry.toolName) lines.push(`Tool name: ${entry.toolName}`);
  if (entry.executionMode) lines.push(`Execution: ${entry.executionMode}; default blocking ${entry.defaultBlocking ? "yes" : "no"}`);
  if (entry.inputSchemaRequired.length) lines.push(`Required input fields: ${entry.inputSchemaRequired.join(", ")}`);
  if (entry.launchCardRequirementIds.length) lines.push(`Launch card requirements: ${entry.launchCardRequirementIds.join(", ")}`);
  if (entry.metricTemplateIds.length) lines.push(`Metric templates: ${entry.metricTemplateIds.join(", ")}`);
  if (includeSourcePreview && entry.sourcePreview) {
    const previewLines = boundedSourcePreviewLines(entry.sourcePreview.text, sourcePreviewLineLimit);
    lines.push(
      `Source preview: ${entry.sourcePreview.label} (${entry.sourcePreview.format}, ${entry.sourcePreview.dslStatus}, executable no)`,
      ...previewLines.map((line) => `  ${line}`),
    );
    if (previewLines.length < sourcePreviewLineCount(entry.sourcePreview.text)) {
      lines.push(`  ... ${sourcePreviewLineCount(entry.sourcePreview.text) - previewLines.length} more source preview lines available`);
    }
  }
  if (includeSourceSearchTerms && entry.sourceSearchTerms.length) {
    lines.push(`Source search terms: ${entry.sourceSearchTerms.slice(0, 24).join(", ")}`);
  }
  if (entry.exclusionReasons.length) lines.push(`Reasons: ${entry.exclusionReasons.join(", ")}`);
  return lines;
}

function boundedSourcePreviewLines(text: string, limit: number): string[] {
  return sourcePreviewLines(text).slice(0, limit);
}

function sourcePreviewLineCount(text: string): number {
  return sourcePreviewLines(text).length;
}

function sourcePreviewLines(text: string): string[] {
  return text.split(/\r?\n/g).map((line) => line.trimEnd()).filter(Boolean);
}

function filteredCallableCatalogEntries(
  entries: readonly CallableWorkflowCatalogEntry[],
  input: AmbientWorkflowsCallableCatalogInput,
): CallableWorkflowCatalogEntry[] {
  return entries
    .filter((entry) => input.includeExcluded || entry.status !== "excluded_not_callable")
    .filter((entry) => !input.sourceKind || entry.sourceKind === input.sourceKind)
    .filter((entry) => callableCatalogEntryMatchesQuery(entry, input.query));
}

function boundedCallableCatalogEntries(
  entries: readonly CallableWorkflowCatalogEntry[],
  input: AmbientWorkflowsCallableCatalogInput,
): CallableWorkflowCatalogEntry[] {
  return filteredCallableCatalogEntries(entries, input).slice(0, input.limit);
}

function findCallableCatalogEntry(
  entries: readonly CallableWorkflowCatalogEntry[],
  input: AmbientWorkflowsCallableDescribeInput,
): CallableWorkflowCatalogEntry | undefined {
  return entries
    .filter((entry) => input.includeExcluded || entry.status !== "excluded_not_callable")
    .filter((entry) => !input.sourceKind || entry.sourceKind === input.sourceKind)
    .find((entry) => {
      if (input.id && entry.id === input.id) return true;
      if (input.toolName && entry.toolName === input.toolName) return true;
      if (input.sourceId && entry.sourceId === input.sourceId) {
        return input.sourceVersion === undefined || String(entry.sourceVersion ?? "") === input.sourceVersion;
      }
      return false;
    });
}

function entryIsParentVisible(entry: CallableWorkflowCatalogEntry): boolean {
  return entry.status === "parent_pi_visible" && entry.parentPiVisible;
}

function callableDescribeSelectorLabel(input: AmbientWorkflowsCallableDescribeInput): string {
  const parts = [
    input.id ? `id=${input.id}` : undefined,
    input.toolName ? `toolName=${input.toolName}` : undefined,
    input.sourceKind ? `sourceKind=${input.sourceKind}` : undefined,
    input.sourceId ? `sourceId=${input.sourceId}` : undefined,
    input.sourceVersion ? `sourceVersion=${input.sourceVersion}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "none";
}

function callableDescribeSelectorDetails(input: AmbientWorkflowsCallableDescribeInput): Record<string, unknown> {
  return {
    ...(input.id ? { id: input.id } : {}),
    ...(input.toolName ? { toolName: input.toolName } : {}),
    ...(input.sourceKind ? { sourceKind: input.sourceKind } : {}),
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.sourceVersion ? { sourceVersion: input.sourceVersion } : {}),
    includeExcluded: input.includeExcluded,
    includeSourcePreview: input.includeSourcePreview,
    includeSourceSearchTerms: input.includeSourceSearchTerms,
    maxSourcePreviewLines: input.maxSourcePreviewLines,
  };
}

function callableCatalogEntryMatchesQuery(entry: CallableWorkflowCatalogEntry, query: string | undefined): boolean {
  const terms = normalizedCatalogSearchText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalizedCatalogSearchText([
    entry.id,
    entry.sourceKind,
    entry.sourceId,
    entry.sourceVersion,
    entry.label,
    entry.summary,
    entry.status,
    entry.toolName,
    entry.visibility,
    entry.childAccessStatus,
    entry.executionMode,
    entry.inputSchemaRequired.join(" "),
    entry.launchCardRequirementIds.join(" "),
    entry.metricTemplateIds.join(" "),
    entry.sourcePreview?.label,
    entry.sourcePreview?.format,
    entry.sourcePreview?.dslStatus,
    entry.sourcePreview?.text,
    entry.sourceSearchTerms.join(" "),
    entry.exclusionReasons.join(" "),
  ].filter((value) => value !== undefined).join(" "));
  return terms.every((term) => haystack.includes(term));
}

function normalizedCatalogSearchText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
