import type {
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowDiscoveryCapabilitySearch,
  WorkflowDiscoveryCapabilitySearchResult,
  WorkflowConnectorManifestGrant,
  WorkflowManifest,
  WorkflowPluginCapabilityGrant,
} from "../../shared/types";
import type { WorkflowExplorationBudgets } from "../../shared/workflowExplorationBudgets";
import { normalizeWorkflowExplorationBudgets, workflowExplorationBudgetLabels } from "./workflowExplorationBudgetUiModel";
import type { WorkflowExplorationGateModel } from "./workflowExplorationGateUiModel";

export interface WorkflowExplorationPreflightInput {
  gate: Pick<WorkflowExplorationGateModel, "state" | "enabled" | "reasonLabels">;
  thread: Pick<WorkflowAgentThreadSummary, "title" | "initialRequest" | "activeArtifactId" | "latestVersion" | "discoveryQuestions" | "projectName">;
  artifact?: Pick<WorkflowArtifactSummary, "title" | "status" | "manifest">;
  budgets?: Partial<WorkflowExplorationBudgets>;
}

export interface WorkflowExplorationPreflightSection {
  id: "budget" | "scope" | "likely_access" | "grants" | "evidence";
  label: string;
  items: string[];
}

export interface WorkflowExplorationPreflightModel {
  title: string;
  detail: string;
  sections: WorkflowExplorationPreflightSection[];
}

export function workflowExplorationPreflightModel(input: WorkflowExplorationPreflightInput): WorkflowExplorationPreflightModel {
  const budgets = normalizeWorkflowExplorationBudgets(input.budgets);
  const request = input.thread.initialRequest || input.thread.title;
  const manifest = input.artifact?.manifest;
  const capabilitySearch = latestWorkflowDiscoveryCapabilitySearch(input.thread.discoveryQuestions);
  const sections: WorkflowExplorationPreflightSection[] = [
    {
      id: "budget",
      label: "Bounded budget",
      items: workflowExplorationBudgetLabels(budgets),
    },
    {
      id: "scope",
      label: "Scope",
      items: scopeLabels(input),
    },
    {
      id: "likely_access",
      label: "Likely access",
      items: likelyAccessLabels(request, manifest, capabilitySearch),
    },
    {
      id: "grants",
      label: "Possible grants",
      items: grantLabels(request, manifest, capabilitySearch),
    },
    {
      id: "evidence",
      label: "Expected evidence",
      items: evidenceLabels(input.gate.state),
    },
  ];
  return {
    title: input.gate.enabled ? "Exploration preflight" : "Exploration locked",
    detail: input.gate.enabled
      ? "Before Pi explores, review the exact budget, scope, likely access surface, and evidence it should return."
      : "Start workflow chat or answer discovery questions before running a bounded exploration pass.",
    sections,
  };
}

function scopeLabels(input: WorkflowExplorationPreflightInput): string[] {
  const answered = input.thread.discoveryQuestions.filter((question) => question.answer).length;
  const total = input.thread.discoveryQuestions.length;
  const request = input.thread.initialRequest || input.thread.title;
  return compactLabels([
    input.thread.projectName ? `Project: ${input.thread.projectName}` : undefined,
    ...requestedLocalScopeLabels(request),
    input.thread.initialRequest ? `Request: ${boundText(input.thread.initialRequest, 110)}` : undefined,
    total ? `${answered}/${total} discovery answers` : undefined,
    input.artifact ? `Artifact: ${input.artifact.title}` : undefined,
    input.thread.latestVersion ? `Version ${input.thread.latestVersion.version} context` : undefined,
    input.thread.activeArtifactId ? "Compiled artifact context" : undefined,
    ...input.gate.reasonLabels,
  ]);
}

function latestWorkflowDiscoveryCapabilitySearch(
  questions: Pick<WorkflowAgentThreadSummary, "discoveryQuestions">["discoveryQuestions"],
): WorkflowDiscoveryCapabilitySearch | undefined {
  for (let index = questions.length - 1; index >= 0; index -= 1) {
    const search = questions[index]?.capabilitySearch;
    if (search) return search;
  }
  return undefined;
}

function likelyAccessLabels(request: string, manifest?: WorkflowManifest, capabilitySearch?: WorkflowDiscoveryCapabilitySearch): string[] {
  const access = [
    ...capabilityAccessLabels(capabilitySearch),
    ...manifestToolLabels(manifest?.tools),
    ...connectorLabels(manifest?.connectors),
    ...pluginLabels(manifest?.pluginCapabilities),
    ...ambientCliLabels(manifest?.ambientCliCapabilities),
    ...keywordAccessLabels(request),
  ];
  return compactLabels(access).slice(0, 8).length ? compactLabels(access).slice(0, 8) : ["Ambient model call"];
}

function grantLabels(request: string, manifest?: WorkflowManifest, capabilitySearch?: WorkflowDiscoveryCapabilitySearch): string[] {
  const grants = [
    ...capabilityGrantLabels(capabilitySearch),
    ...connectorGrantLabels(manifest?.connectors),
    ...pluginGrantLabels(manifest?.pluginCapabilities),
    ...keywordGrantLabels(request),
    manifest?.mutationPolicy ? `Mutation policy: ${humanize(manifest.mutationPolicy)}` : undefined,
  ];
  return compactLabels(grants).slice(0, 8).length ? compactLabels(grants).slice(0, 8) : ["No external grant expected"];
}

function capabilityAccessLabels(search: WorkflowDiscoveryCapabilitySearch | undefined): string[] {
  return (search?.results ?? []).map((result) => {
    if (result.kind === "plugin_tool") return `Plugin capability: ${result.label}`;
    if (result.kind === "ambient_cli") return `Ambient CLI capability: ${result.label}`;
    if (result.kind === "connector") return `Connector metadata: ${result.label}`;
    if (result.kind === "base_directory") return result.label;
    return `Browser/network fallback: ${result.targetLabel || result.label}`;
  });
}

function capabilityGrantLabels(search: WorkflowDiscoveryCapabilitySearch | undefined): string[] {
  return (search?.results ?? []).flatMap((result) => {
    if (!result.permissionCapability) return [];
    const target = result.targetLabel || result.label;
    return [capabilityGrantLabel(result, target)];
  });
}

function capabilityGrantLabel(result: WorkflowDiscoveryCapabilitySearchResult, target: string): string {
  const capability = result.permissionCapability;
  if (result.kind === "ambient_cli" && capability === "plugin_tool_execute") return `Ambient CLI execution grant: ${target}`;
  if (capability === "plugin_tool_execute") return `Plugin tool grant: ${target}`;
  if (capability === "connector_content") return `Connector read grant: ${target}`;
  if (capability === "browser_network") return `Browser/network read grant: ${target}`;
  if (capability === "file_content") return result.label.startsWith("Local filesystem:") ? `Local file read grant: ${target}` : `Workspace file read grant: ${target}`;
  return `${humanize(capability ?? "capability")} grant: ${target}`;
}

function evidenceLabels(state: WorkflowExplorationGateModel["state"]): string[] {
  if (state === "completed") {
    return ["Latest trace can be reused", "Observed calls", "Required grants", "Data shapes", "Graph/source recommendations"];
  }
  if (state === "skipped") {
    return ["Skip decision retained", "Current request/discovery context", "Known missing evidence called out"];
  }
  return ["Observed tool and connector calls", "Required grants and denied paths", "Data shapes and selectors", "Deterministic source strategy", "Recommended graph patch"];
}

function manifestToolLabels(tools: string[] | undefined): string[] {
  return (tools ?? []).map((tool) => {
    if (tool === "ambient.responses") return "Ambient model call";
    if (tool.includes("browser") || tool.includes("search")) return `Browser/search tool: ${tool}`;
    return `Tool: ${tool}`;
  });
}

function connectorLabels(connectors: WorkflowConnectorManifestGrant[] | undefined): string[] {
  return (connectors ?? []).map((connector) => `Connector: ${connector.connectorId}${connector.operations.length ? ` (${connector.operations.slice(0, 2).join(", ")})` : ""}`);
}

function pluginLabels(capabilities: WorkflowPluginCapabilityGrant[] | undefined): string[] {
  return (capabilities ?? []).map((capability) => `Plugin: ${capability.pluginName || capability.pluginId} (${capability.toolName || capability.registeredName})`);
}

function ambientCliLabels(capabilities: WorkflowManifest["ambientCliCapabilities"]): string[] {
  return (capabilities ?? []).map((capability) => `Ambient CLI: ${capability.command || capability.packageName}`);
}

function connectorGrantLabels(connectors: WorkflowConnectorManifestGrant[] | undefined): string[] {
  return (connectors ?? []).map((connector) => {
    const scopes = connector.scopes.slice(0, 2).join(", ");
    return `${connector.connectorId} ${scopes ? `scopes: ${scopes}` : "connector grant"}`;
  });
}

function pluginGrantLabels(capabilities: WorkflowPluginCapabilityGrant[] | undefined): string[] {
  return (capabilities ?? []).map((capability) => `${capability.pluginName || capability.pluginId} plugin capability`);
}

function keywordAccessLabels(request: string): Array<string | undefined> {
  const normalized = positiveCapabilityKeywordText(request);
  return [
    matches(normalized, ["web", "browser", "search", "online", "site", "url", "arxiv", "recent", "current", "this week", "next week", "movie", "show", "event", "music"])
      ? "Browser/search exploration"
      : undefined,
    explicitLocalAccessLabel(normalized) ?? (matches(normalized, ["directory", "folder", "file", "files", "local"]) ? "Workspace file inspection" : undefined),
    matches(normalized, ["gmail", "email", "inbox", "mail"]) ? "Gmail connector" : undefined,
    matches(normalized, ["calendar", "meeting", "schedule"]) ? "Calendar connector" : undefined,
    matches(normalized, ["google drive", "drive", "google docs", "docs", "sheet", "slides", "spreadsheet"]) ? "Google Drive connector" : undefined,
  ];
}

function keywordGrantLabels(request: string): Array<string | undefined> {
  const normalized = positiveCapabilityKeywordText(request);
  return [
    matches(normalized, ["web", "browser", "search", "online", "site", "url", "arxiv", "recent", "current", "this week", "next week", "movie", "show", "event", "music"])
      ? "Browser/network read grant"
      : undefined,
    explicitLocalGrantLabel(normalized) ?? (matches(normalized, ["directory", "folder", "file", "files", "local"]) ? "Workspace file read grant" : undefined),
    matches(normalized, ["gmail", "email", "inbox", "mail"]) ? "Gmail read grant" : undefined,
    matches(normalized, ["calendar", "meeting", "schedule"]) ? "Calendar read grant" : undefined,
    matches(normalized, ["google drive", "drive", "google docs", "docs", "sheet", "slides", "spreadsheet"]) ? "Drive read grant" : undefined,
  ];
}

function requestedLocalScopeLabels(request: string): string[] {
  const normalized = stripAmbientDesktopProductName(request).toLowerCase();
  return compactLabels([
    /\bdownloads?\b/.test(normalized) ? "Requested local folder: Downloads" : undefined,
    /\bdesktop\b/.test(normalized) ? "Requested local folder: Desktop" : undefined,
    /\bdocuments folder\b|\bdocuments directory\b|\bmy documents\b/.test(normalized) ? "Requested local folder: Documents" : undefined,
  ]);
}

function explicitLocalAccessLabel(normalizedRequest: string): string | undefined {
  if (/\bdownloads?\b/.test(normalizedRequest)) return "Local filesystem: Downloads directory";
  if (/\bdesktop\b/.test(normalizedRequest)) return "Local filesystem: Desktop directory";
  if (/\bdocuments folder\b|\bdocuments directory\b|\bmy documents\b/.test(normalizedRequest)) return "Local filesystem: Documents directory";
  return undefined;
}

function explicitLocalGrantLabel(normalizedRequest: string): string | undefined {
  if (/\bdownloads?\b/.test(normalizedRequest)) return "Local file read grant: Downloads directory contents";
  if (/\bdesktop\b/.test(normalizedRequest)) return "Local file read grant: Desktop directory contents";
  if (/\bdocuments folder\b|\bdocuments directory\b|\bmy documents\b/.test(normalizedRequest)) return "Local file read grant: Documents directory contents";
  return undefined;
}

function positiveCapabilityKeywordText(request: string): string {
  return stripDeniedCapabilityClauses(stripAmbientDesktopProductName(request)).toLowerCase();
}

function stripAmbientDesktopProductName(value: string): string {
  return value.replace(/\bambient\s+desktop(?:'s)?\b/gi, "ambient product");
}

function stripDeniedCapabilityClauses(value: string): string {
  return value
    .split(/;|\n|(?<=[.!?])\s+(?=[A-Z])/)
    .filter((clause) => !/\b(?:do\s+not|don't|dont|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\b/i.test(clause))
    .join("\n");
}

function matches(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function compactLabels(labels: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const compacted: string[] = [];
  for (const label of labels) {
    const trimmed = label?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    compacted.push(trimmed);
  }
  return compacted;
}

function humanize(value: string): string {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function boundText(value: string, maxLength: number): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}...`;
}
