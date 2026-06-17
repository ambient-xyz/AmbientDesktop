import { createHash } from "node:crypto";
import { basename } from "node:path";

import {
  AMBIENT_SLASH_COMMANDS_FEATURE_FLAG,
  isAmbientSlashCommandsEnabled,
  type AmbientFeatureFlagSnapshot,
} from "../shared/featureFlags";
import {
  SLASH_COMMAND_DESCRIBE_SCHEMA_VERSION,
  SLASH_COMMAND_SEARCH_SCHEMA_VERSION,
  type SlashCommandAvailability,
  type SlashCommandCatalogEntry,
  type SlashCommandDescribeInput,
  type SlashCommandDescription,
  type SlashCommandFeatureFlagState,
  type SlashCommandKind,
  type SlashCommandSearchInput,
  type SlashCommandSearchResponse,
  type SlashCommandSelection,
  type SlashCommandSourceKind,
} from "../shared/slashCommandTypes";
import type {
  CodexPluginCatalog,
  CodexPluginSkill,
  CodexPluginSummary,
  WorkflowRecordingLibraryEntry,
} from "../shared/types";
import type {
  AmbientCliCapabilitySearchCommandResult,
  AmbientCliCapabilitySearchResponse,
  AmbientCliCapabilitySearchResult,
  AmbientCliCapabilitySearchSkillResult,
} from "./ambient-cli/ambientCliPackages";
import type {
  CallableWorkflowCatalogEntry,
  CallableWorkflowCatalogStatus,
  CallableWorkflowRegistry,
} from "./callable-workflow/callableWorkflowRegistry";

const DEFAULT_SLASH_COMMAND_LIMIT = 12;
const MAX_SLASH_COMMAND_LIMIT = 50;
const MAX_PREVIEW_CHARS = 700;

export interface SlashCommandCatalogSources {
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  pluginCatalog?: CodexPluginCatalog;
  ambientCliCapabilities?: AmbientCliCapabilitySearchResponse;
  workflowRecordings?: WorkflowRecordingLibraryEntry[];
  callableWorkflowRegistry?: CallableWorkflowRegistry;
  diagnostics?: string[];
}

type SlashCommandEntryDraft = Omit<SlashCommandCatalogEntry, "aliases" | "badges" | "icon" | "requiresParameters" | "searchText"> &
  Partial<Pick<SlashCommandCatalogEntry, "aliases" | "badges" | "icon" | "requiresParameters" | "searchText">>;

export function buildSlashCommandSearchResponse(
  input: SlashCommandSearchInput | undefined,
  sources: SlashCommandCatalogSources,
): SlashCommandSearchResponse {
  const query = normalizeQuery(input?.query);
  const limit = boundedLimit(input?.limit);
  const includeUnavailable = Boolean(input?.includeUnavailable);
  const entries = buildSlashCommandCatalogEntries(sources);
  const kindFilter = input?.kinds?.length ? new Set(input.kinds) : undefined;
  const sourceFilter = input?.sourceKinds?.length ? new Set(input.sourceKinds) : undefined;
  const queryTokens = query.split(/\s+/).filter(Boolean);
  const filtered = entries
    .filter((entry) => !kindFilter || kindFilter.has(entry.kind))
    .filter((entry) => !sourceFilter || sourceFilter.has(entry.sourceKind))
    .filter((entry) => includeUnavailable || entry.availability === "available")
    .map((entry) => ({ ...entry, score: slashCommandScore(entry, queryTokens) }))
    .filter((entry) => queryTokens.length === 0 || (entry.score ?? 0) > 0)
    .sort(compareSlashCommandEntries);

  return {
    schemaVersion: SLASH_COMMAND_SEARCH_SCHEMA_VERSION,
    query,
    limit,
    entries: filtered.slice(0, limit),
    resultCount: Math.min(filtered.length, limit),
    totalEntryCount: entries.length,
    truncated: filtered.length > limit,
    catalogVersion: slashCommandCatalogVersion(entries),
    featureFlag: slashCommandFeatureFlagState(sources.featureFlagSnapshot),
    diagnostics: sources.diagnostics ?? [],
  };
}

export function describeSlashCommandCatalogEntry(
  input: SlashCommandDescribeInput,
  sources: SlashCommandCatalogSources,
): SlashCommandDescription {
  const includeUnavailable = Boolean(input.includeUnavailable);
  const entries = buildSlashCommandCatalogEntries(sources);
  const entry = entries.find((candidate) => candidate.id === input.entryId);
  if (!entry || (!includeUnavailable && entry.availability !== "available")) {
    return {
      schemaVersion: SLASH_COMMAND_DESCRIBE_SCHEMA_VERSION,
      status: "not_found",
      entryId: input.entryId,
      parameters: [],
      diagnostics: entry && entry.availability !== "available"
        ? [`Slash command is ${entry.availability}: ${entry.availabilityReason ?? "not currently available"}`]
        : [],
    };
  }
  return {
    schemaVersion: SLASH_COMMAND_DESCRIBE_SCHEMA_VERSION,
    status: "described",
    entryId: input.entryId,
    entry,
    safePreview: slashCommandSafePreview(entry),
    invocationPreview: slashCommandInvocationPreview(entry),
    parameters: entry.parameters ?? [],
    diagnostics: sources.diagnostics ?? [],
  };
}

export function assertSlashCommandSelectionInvocable(
  selection: SlashCommandSelection,
  description: SlashCommandDescription,
): void {
  if (description.status !== "described" || !description.entry) {
    throw new Error("Selected slash command is no longer available.");
  }
  const entry = description.entry;
  if (entry.availability !== "available") {
    throw new Error(entry.availabilityReason ?? `${entry.title} is ${entry.availability}.`);
  }
  if (
    entry.command !== selection.command ||
    entry.kind !== selection.kind ||
    entry.sourceKind !== selection.sourceKind ||
    entry.invocationKind !== selection.invocationKind ||
    entry.sourceId !== selection.sourceId ||
    entry.sourceVersion !== selection.sourceVersion ||
    entry.requiresParameters !== Boolean(selection.requiresParameters) ||
    (entry.sourceFingerprint && entry.sourceFingerprint !== selection.sourceFingerprint)
  ) {
    throw new Error("Selected slash command changed. Select it again before sending.");
  }
}

export function buildSlashCommandCatalogEntries(sources: SlashCommandCatalogSources): SlashCommandCatalogEntry[] {
  const slashCommandsEnabled = isAmbientSlashCommandsEnabled(sources.featureFlagSnapshot);
  return dedupeSlashCommandEntries([
    ...builtinSlashCommandEntries(),
    ...codexPluginSkillEntries(sources.pluginCatalog, slashCommandsEnabled),
    ...ambientCliCapabilityEntries(sources.ambientCliCapabilities, slashCommandsEnabled),
    ...workflowRecordingEntries(sources.workflowRecordings, slashCommandsEnabled),
    ...callableWorkflowEntries(sources.callableWorkflowRegistry?.catalogStatus, slashCommandsEnabled),
  ]);
}

function builtinSlashCommandEntries(): SlashCommandCatalogEntry[] {
  return [
    entry({
      id: "builtin:/agent",
      command: "/agent",
      aliases: ["/work"],
      title: "Agent",
      description: "Switch to Agent mode for direct project work.",
      detail: "Existing app command.",
      kind: "app",
      sourceKind: "builtin",
      invocationKind: "builtin-command",
      availability: "available",
      icon: "bot",
      badges: ["Built-in"],
    }),
    entry({
      id: "builtin:/plan",
      command: "/plan",
      aliases: ["/planner"],
      title: "Plan mode",
      description: "Switch to Planner mode before sending the message.",
      detail: "Existing app command.",
      kind: "app",
      sourceKind: "builtin",
      invocationKind: "builtin-command",
      availability: "available",
      icon: "list-checks",
      badges: ["Built-in"],
    }),
    entry({
      id: "builtin:/compact",
      command: "/compact",
      title: "Compact",
      description: "Compact the active thread context, optionally with custom instructions.",
      kind: "app",
      sourceKind: "builtin",
      invocationKind: "builtin-command",
      availability: "available",
      icon: "archive",
      badges: ["Built-in"],
      parameters: [{ name: "instructions", label: "Instructions", required: false }],
      requiresParameters: false,
    }),
    entry({
      id: "builtin:/secret",
      command: "/secret",
      title: "Secret",
      description: "Open the managed Ambient CLI secret binding flow.",
      kind: "app",
      sourceKind: "builtin",
      invocationKind: "builtin-command",
      availability: "available",
      icon: "key-round",
      badges: ["Built-in"],
      parameters: [
        { name: "package", label: "Package", required: false },
        { name: "env", label: "Environment variable", required: false },
      ],
    }),
  ];
}

function codexPluginSkillEntries(
  catalog: CodexPluginCatalog | undefined,
  slashCommandsEnabled: boolean,
): SlashCommandCatalogEntry[] {
  if (!catalog) return [];
  const installed = catalog.plugins.flatMap((plugin) =>
    plugin.skills.map((skill) => codexPluginSkillEntry(plugin, skill, slashCommandsEnabled, false)));
  const candidates = catalog.importCandidates.flatMap((plugin) =>
    plugin.skills.map((skill) => codexPluginSkillEntry(plugin, skill, slashCommandsEnabled, true)));
  return [...installed, ...candidates];
}

function codexPluginSkillEntry(
  plugin: CodexPluginSummary,
  skill: CodexPluginSkill,
  slashCommandsEnabled: boolean,
  importCandidate: boolean,
): SlashCommandCatalogEntry {
  const availability = slashFeatureAvailability(slashCommandsEnabled) ?? codexPluginAvailability(plugin, importCandidate);
  return entry({
    id: `codex-plugin-skill:${plugin.id}:${shortHash(skill.path)}:${slug(skill.name)}`,
    command: `/${slug(skill.name)}`,
    aliases: plugin.name === skill.name ? [] : [`/${slug(plugin.name)}-${slug(skill.name)}`],
    title: skill.name,
    description: skill.description || plugin.description,
    detail: `Skill from ${plugin.displayName ?? plugin.name}.`,
    kind: "skill",
    sourceKind: "codex-plugin",
    invocationKind: "codex-plugin-skill",
    availability,
    availabilityReason: codexPluginAvailabilityReason(plugin, importCandidate, availability),
    icon: "sparkles",
    badges: ["Skill", plugin.displayName ?? plugin.name],
    sourceId: plugin.id,
    sourceName: plugin.name,
    sourceVersion: plugin.version,
    sourceFingerprint: shortHash(`${plugin.id}:${plugin.version}:${skill.path}:${plugin.trusted}:${plugin.enabled}`),
  });
}

function ambientCliCapabilityEntries(
  response: AmbientCliCapabilitySearchResponse | undefined,
  slashCommandsEnabled: boolean,
): SlashCommandCatalogEntry[] {
  if (!response) return [];
  return response.results.flatMap((result) => [
    ...result.skills.map((skill) => ambientCliSkillEntry(result, skill, slashCommandsEnabled)),
    ...result.commands.map((command) => ambientCliCommandEntry(result, command, slashCommandsEnabled)),
  ]);
}

function ambientCliSkillEntry(
  result: AmbientCliCapabilitySearchResult,
  skill: AmbientCliCapabilitySearchSkillResult,
  slashCommandsEnabled: boolean,
): SlashCommandCatalogEntry {
  const availability = slashFeatureAvailability(slashCommandsEnabled) ?? ambientCliAvailability(result);
  return entry({
    id: `ambient-cli-skill:${skill.capabilityId}`,
    command: `/${slug(skill.name)}`,
    aliases: [`/${slug(result.packageName)}-${slug(skill.name)}`],
    title: skill.name,
    description: skill.description || result.description,
    detail: `Ambient CLI skill from ${result.packageName}.`,
    kind: "skill",
    sourceKind: "ambient-cli",
    invocationKind: "ambient-cli-skill",
    availability,
    availabilityReason: ambientCliAvailabilityReason(result, availability),
    icon: "terminal-square",
    badges: ["CLI skill", result.packageName],
    sourceId: result.packageId,
    sourceName: result.packageName,
    sourceVersion: result.version,
    sourceFingerprint: responseFingerprint(`${result.packageId}:${skill.capabilityId}:${result.availability}`),
  });
}

function ambientCliCommandEntry(
  result: AmbientCliCapabilitySearchResult,
  command: AmbientCliCapabilitySearchCommandResult,
  slashCommandsEnabled: boolean,
): SlashCommandCatalogEntry {
  const availability = slashFeatureAvailability(slashCommandsEnabled) ?? ambientCliAvailability(result);
  return entry({
    id: `ambient-cli-command:${command.capabilityId}`,
    command: `/${slug(command.name)}`,
    aliases: [`/${slug(result.packageName)}-${slug(command.name)}`],
    title: command.name,
    description: command.description || result.description,
    detail: `Ambient CLI command from ${result.packageName}. Execution still goes through normal tool approval.`,
    kind: "skill",
    sourceKind: "ambient-cli",
    invocationKind: "ambient-cli-command",
    availability,
    availabilityReason: ambientCliAvailabilityReason(result, availability),
    icon: "terminal-square",
    badges: ["CLI command", command.health ? `Health: ${command.health}` : result.packageName],
    sourceId: result.packageId,
    sourceName: result.packageName,
    sourceVersion: result.version,
    sourceFingerprint: responseFingerprint(`${command.capabilityId}:${result.availability}:${result.missingEnv.join(",")}`),
  });
}

function workflowRecordingEntries(
  recordings: WorkflowRecordingLibraryEntry[] | undefined,
  slashCommandsEnabled: boolean,
): SlashCommandCatalogEntry[] {
  return (recordings ?? []).map((recording) => {
    const availability = slashFeatureAvailability(slashCommandsEnabled) ?? workflowRecordingAvailability(recording);
    return entry({
      id: `workflow-playbook:${recording.id}:${recording.version}`,
      command: `/${slug(recording.title)}`,
      aliases: [`/workflow-${slug(recording.id)}`],
      title: recording.title,
      description: recording.summary,
      detail: "Recorded workflow playbook guidance.",
      kind: "workflow",
      sourceKind: "workflow-recorder",
      invocationKind: "workflow-playbook",
      availability,
      availabilityReason: workflowRecordingAvailabilityReason(recording, availability),
      icon: "workflow",
      badges: ["Workflow", `v${recording.version}`],
      sourceId: recording.id,
      sourceName: recording.title,
      sourceVersion: recording.version,
      sourceFingerprint: shortHash(`${recording.id}:${recording.version}:${recording.enabled}:${recording.archivedAt ?? ""}`),
      parameters: recording.outputShape.slice(0, 6).map((item) => ({
        name: slug(item),
        label: item,
        required: false,
      })),
    });
  });
}

function callableWorkflowEntries(
  status: CallableWorkflowCatalogStatus | undefined,
  slashCommandsEnabled: boolean,
): SlashCommandCatalogEntry[] {
  if (!status) return [];
  return (status?.entries ?? []).map((candidate) => {
    const availability = slashFeatureAvailability(slashCommandsEnabled) ?? callableWorkflowAvailability(candidate, status);
    return entry({
      id: `callable-workflow:${candidate.id}`,
      command: `/${slug(candidate.label)}`,
      aliases: [`/call-${slug(candidate.sourceId)}`],
      title: candidate.label,
      description: candidate.summary,
      detail: callableWorkflowDetail(candidate),
      kind: "callable-workflow",
      sourceKind: candidate.sourceKind === "symphony_recipe" ? "symphony" : "workflow-recorder",
      invocationKind: candidate.sourceKind === "symphony_recipe" ? "symphony-recipe" : "callable-workflow",
      availability,
      availabilityReason: callableWorkflowAvailabilityReason(candidate, status, availability),
      icon: candidate.sourceKind === "symphony_recipe" ? "network" : "workflow",
      badges: [
        candidate.sourceKind === "symphony_recipe" ? "Symphony" : "Callable workflow",
      ],
      sourceId: candidate.sourceId,
      sourceName: candidate.label,
      sourceVersion: candidate.sourceVersion,
      sourceFingerprint: shortHash(`${candidate.id}:${candidate.status}:${candidate.sourceVersion ?? ""}:${status.featureFlagEnabled}`),
      requiresParameters: candidate.inputSchemaRequired.length > 0,
      parameters: candidate.inputSchemaRequired.map((name) => ({
        name,
        label: name,
        required: true,
      })),
    });
  });
}

function entry(input: SlashCommandEntryDraft): SlashCommandCatalogEntry {
  const aliases = input.aliases ?? [];
  const badges = (input.badges ?? []).filter(Boolean).slice(0, 4);
  const icon = input.icon ?? "slash";
  const requiresParameters = input.requiresParameters ?? Boolean(input.parameters?.some((parameter) => parameter.required));
  const searchText = input.searchText ?? [
    input.command,
    ...aliases,
    input.title,
    input.description,
    input.detail,
    input.kind,
    input.sourceKind,
    input.invocationKind,
    input.sourceName,
    ...badges,
  ].filter(Boolean).join(" ").toLowerCase();
  return {
    ...input,
    aliases,
    badges,
    icon,
    requiresParameters,
    searchText,
  };
}

function slashFeatureAvailability(enabled: boolean): SlashCommandAvailability | undefined {
  return enabled ? undefined : "feature-disabled";
}

function codexPluginAvailability(plugin: CodexPluginSummary, importCandidate: boolean): SlashCommandAvailability {
  if (importCandidate || plugin.imported === false) return "setup-required";
  if (plugin.errors.length) return "unavailable";
  if (!plugin.enabled) return "disabled";
  if (!plugin.trusted) return "untrusted";
  if (plugin.dependencyStatus && plugin.dependencyStatus.required && !plugin.dependencyStatus.installed) return "setup-required";
  if (plugin.compatibilityTier === "unsupported") return "unavailable";
  return "available";
}

function codexPluginAvailabilityReason(
  plugin: CodexPluginSummary,
  importCandidate: boolean,
  availability: SlashCommandAvailability,
): string | undefined {
  if (availability === "feature-disabled") return "Slash command skills and workflows are disabled by ambient.slashCommands.";
  if (importCandidate || plugin.imported === false) return "Install this Codex plugin before invoking its skills.";
  if (plugin.errors[0]) return plugin.errors[0];
  if (!plugin.enabled) return "Plugin is disabled.";
  if (!plugin.trusted) return "Plugin must be trusted before its skills can be invoked.";
  if (plugin.dependencyStatus && plugin.dependencyStatus.required && !plugin.dependencyStatus.installed) {
    return `Install dependencies with ${plugin.dependencyStatus.installCommand.join(" ")}.`;
  }
  if (plugin.compatibilityTier === "unsupported") return plugin.compatibilityNotes[0] ?? "Plugin is unsupported.";
  return undefined;
}

function ambientCliAvailability(result: AmbientCliCapabilitySearchResult): SlashCommandAvailability {
  if (result.availability !== "available") return "unavailable";
  if (result.missingEnv.length) return "setup-required";
  return "available";
}

function ambientCliAvailabilityReason(
  result: AmbientCliCapabilitySearchResult,
  availability: SlashCommandAvailability,
): string | undefined {
  if (availability === "feature-disabled") return "Slash command skills and workflows are disabled by ambient.slashCommands.";
  if (result.missingEnv.length) return `Missing required env: ${result.missingEnv.join(", ")}.`;
  if (availability !== "available") return result.availabilityReason;
  return result.availabilityReason;
}

function workflowRecordingAvailability(recording: WorkflowRecordingLibraryEntry): SlashCommandAvailability {
  if (recording.archivedAt) return "archived";
  if (!recording.enabled) return "disabled";
  return "available";
}

function workflowRecordingAvailabilityReason(
  recording: WorkflowRecordingLibraryEntry,
  availability: SlashCommandAvailability,
): string | undefined {
  if (availability === "feature-disabled") return "Slash command skills and workflows are disabled by ambient.slashCommands.";
  if (recording.archivedAt) return recording.archivedReason ?? "Workflow playbook is archived.";
  if (!recording.enabled) return "Workflow playbook is disabled.";
  return undefined;
}

function callableWorkflowAvailability(
  candidate: CallableWorkflowCatalogEntry,
  status: CallableWorkflowCatalogStatus,
): SlashCommandAvailability {
  if (!status.featureFlagEnabled || candidate.status === "hidden_feature_disabled") return "feature-disabled";
  if (candidate.status === "excluded_not_callable") return "unavailable";
  if (!candidate.parentPiVisible) return "unavailable";
  return "available";
}

function callableWorkflowAvailabilityReason(
  candidate: CallableWorkflowCatalogEntry,
  status: CallableWorkflowCatalogStatus,
  availability: SlashCommandAvailability,
): string | undefined {
  if (availability === "feature-disabled") {
    return !status.featureFlagEnabled
      ? "Callable workflows are disabled while ambient.subagents is off."
      : "Slash command skills and workflows are disabled by ambient.slashCommands.";
  }
  if (candidate.exclusionReasons[0]) return candidate.exclusionReasons[0];
  if (!candidate.parentPiVisible) return "Callable workflow is not parent-visible.";
  return undefined;
}

function callableWorkflowDetail(candidate: CallableWorkflowCatalogEntry): string {
  if (candidate.toolName) return `Callable workflow tool ${candidate.toolName}.`;
  if (candidate.status === "excluded_not_callable") return "Recorded workflow is not callable yet.";
  return "Callable workflow launch path.";
}

function compareSlashCommandEntries(left: SlashCommandCatalogEntry, right: SlashCommandCatalogEntry): number {
  return (right.score ?? 0) - (left.score ?? 0)
    || availabilityRank(left.availability) - availabilityRank(right.availability)
    || kindRank(left.kind) - kindRank(right.kind)
    || left.title.localeCompare(right.title);
}

function slashCommandScore(entry: SlashCommandCatalogEntry, queryTokens: string[]): number {
  if (!queryTokens.length) return sourceRank(entry.sourceKind) + availabilityBaseScore(entry.availability);
  let score = 0;
  for (const token of queryTokens) {
    if (entry.command.toLowerCase().includes(token)) score += 20;
    if (entry.title.toLowerCase().includes(token)) score += 14;
    if (entry.aliases.some((alias) => alias.toLowerCase().includes(token))) score += 10;
    if (entry.searchText.includes(token)) score += 4;
  }
  return score > 0 ? score + (entry.availability === "available" ? 10 : 0) : 0;
}

function availabilityBaseScore(availability: SlashCommandAvailability): number {
  return availability === "available" ? 100 : 0;
}

function availabilityRank(availability: SlashCommandAvailability): number {
  const order: SlashCommandAvailability[] = [
    "available",
    "disabled",
    "setup-required",
    "untrusted",
    "archived",
    "feature-disabled",
    "unavailable",
  ];
  return order.indexOf(availability);
}

function kindRank(kind: SlashCommandKind): number {
  const order: SlashCommandKind[] = ["app", "skill", "workflow", "callable-workflow"];
  return order.indexOf(kind);
}

function sourceRank(sourceKind: SlashCommandSourceKind): number {
  const order: SlashCommandSourceKind[] = ["builtin", "ambient-cli", "workflow-recorder", "codex-plugin", "symphony"];
  return 10 - order.indexOf(sourceKind);
}

function slashCommandSafePreview(entry: SlashCommandCatalogEntry): string {
  return truncateText([
    `${entry.command} ${entry.title}`,
    entry.description,
    entry.detail,
    entry.availabilityReason ? `Status: ${entry.availabilityReason}` : undefined,
  ].filter(Boolean).join("\n"), MAX_PREVIEW_CHARS);
}

function slashCommandInvocationPreview(entry: SlashCommandCatalogEntry): string {
  if (entry.invocationKind === "builtin-command") return `Ambient handles ${entry.command} locally before sending a prompt.`;
  if (entry.invocationKind === "ambient-cli-command") {
    return "Ambient will send bounded guidance to Pi. Any command execution still uses ambient_cli approval and preflight.";
  }
  if (entry.invocationKind === "ambient-cli-skill") {
    return "Ambient will send bounded lazy-skill guidance. Pi should inspect ambient_cli_search/describe before execution.";
  }
  if (entry.invocationKind === "workflow-playbook") return "Ambient will attach recorded playbook guidance to this run.";
  if (entry.invocationKind === "symphony-recipe") return "Ambient will launch the selected Symphony recipe through the existing composer intent path.";
  if (entry.invocationKind === "callable-workflow") return "Ambient will preflight the callable workflow before visible background launch.";
  return "Ambient will ask Pi to use the selected skill for this run.";
}

function slashCommandCatalogVersion(entries: SlashCommandCatalogEntry[]): string {
  return `slash-v1:${shortHash(entries.map((entry) => [
    entry.id,
    entry.availability,
    entry.sourceFingerprint ?? "",
    entry.sourceVersion ?? "",
  ].join(":")).join("|"))}`;
}

function slashCommandFeatureFlagState(snapshot: AmbientFeatureFlagSnapshot): SlashCommandFeatureFlagState {
  const flag = snapshot.flags[AMBIENT_SLASH_COMMANDS_FEATURE_FLAG];
  return {
    id: AMBIENT_SLASH_COMMANDS_FEATURE_FLAG,
    enabled: flag.enabled,
    source: flag.source,
  };
}

function dedupeSlashCommandEntries(entries: SlashCommandCatalogEntry[]): SlashCommandCatalogEntry[] {
  const seenIds = new Set<string>();
  const result: SlashCommandCatalogEntry[] = [];
  for (const candidate of entries) {
    if (seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);
    result.push(candidate);
  }
  return result;
}

function boundedLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_SLASH_COMMAND_LIMIT;
  return Math.max(1, Math.min(Math.floor(limit ?? DEFAULT_SLASH_COMMAND_LIMIT), MAX_SLASH_COMMAND_LIMIT));
}

function normalizeQuery(query: string | undefined): string {
  return (query ?? "").trim().replace(/^\//, "").toLowerCase();
}

function slug(value: string): string {
  const cleaned = (value || "command")
    .trim()
    .replace(/\.md$/i, "")
    .split(/[\\/]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1)
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return cleaned || basename(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "command";
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function responseFingerprint(value: string): string {
  return shortHash(value);
}
