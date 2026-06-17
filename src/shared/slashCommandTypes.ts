import type { AmbientFeatureFlagId, AmbientFeatureFlagResolvedSource } from "./featureFlags";

export const SLASH_COMMAND_CATALOG_SCHEMA_VERSION = "ambient-slash-command-catalog-v1" as const;
export const SLASH_COMMAND_SEARCH_SCHEMA_VERSION = "ambient-slash-command-search-v1" as const;
export const SLASH_COMMAND_DESCRIBE_SCHEMA_VERSION = "ambient-slash-command-describe-v1" as const;
export const SLASH_COMMAND_INVOCATION_SCHEMA_VERSION = "ambient-slash-command-invocation-v1" as const;

export type SlashCommandKind = "app" | "skill" | "workflow" | "callable-workflow";
export type SlashCommandSourceKind =
  | "builtin"
  | "codex-plugin"
  | "ambient-cli"
  | "workflow-recorder"
  | "symphony";
export type SlashCommandAvailability =
  | "available"
  | "disabled"
  | "untrusted"
  | "setup-required"
  | "archived"
  | "feature-disabled"
  | "unavailable";
export type SlashCommandInvocationKind =
  | "builtin-command"
  | "codex-plugin-skill"
  | "ambient-cli-skill"
  | "ambient-cli-command"
  | "workflow-playbook"
  | "symphony-recipe"
  | "callable-workflow";

export interface SlashCommandParameterSummary {
  name: string;
  label: string;
  required: boolean;
  description?: string;
}

export interface SlashCommandCatalogEntry {
  id: string;
  command: string;
  aliases: string[];
  title: string;
  description?: string;
  detail?: string;
  kind: SlashCommandKind;
  sourceKind: SlashCommandSourceKind;
  invocationKind: SlashCommandInvocationKind;
  availability: SlashCommandAvailability;
  availabilityReason?: string;
  badges: string[];
  icon: string;
  sourceId?: string;
  sourceName?: string;
  sourceVersion?: string | number;
  sourceFingerprint?: string;
  requiresParameters: boolean;
  parameters?: SlashCommandParameterSummary[];
  score?: number;
  searchText: string;
}

export interface SlashCommandFeatureFlagState {
  id: AmbientFeatureFlagId;
  enabled: boolean;
  source: AmbientFeatureFlagResolvedSource;
}

export interface SlashCommandSearchInput {
  query?: string;
  limit?: number;
  includeUnavailable?: boolean;
  kinds?: SlashCommandKind[];
  sourceKinds?: SlashCommandSourceKind[];
}

export interface SlashCommandSearchResponse {
  schemaVersion: typeof SLASH_COMMAND_SEARCH_SCHEMA_VERSION;
  query: string;
  limit: number;
  entries: SlashCommandCatalogEntry[];
  resultCount: number;
  totalEntryCount: number;
  truncated: boolean;
  catalogVersion: string;
  featureFlag: SlashCommandFeatureFlagState;
  diagnostics: string[];
}

export interface SlashCommandDescribeInput {
  entryId: string;
  includeUnavailable?: boolean;
}

export interface SlashCommandDescription {
  schemaVersion: typeof SLASH_COMMAND_DESCRIBE_SCHEMA_VERSION;
  status: "described" | "not_found";
  entryId: string;
  entry?: SlashCommandCatalogEntry;
  safePreview?: string;
  invocationPreview?: string;
  parameters: SlashCommandParameterSummary[];
  diagnostics: string[];
}

export interface SlashCommandSelection {
  schemaVersion: typeof SLASH_COMMAND_INVOCATION_SCHEMA_VERSION;
  entryId: string;
  command: string;
  title: string;
  kind: SlashCommandKind;
  sourceKind: SlashCommandSourceKind;
  invocationKind: SlashCommandInvocationKind;
  sourceId?: string;
  sourceName?: string;
  sourceVersion?: string | number;
  sourceFingerprint?: string;
  requiresParameters?: boolean;
  userQuery?: string;
  arguments?: Record<string, string>;
}

export interface SendMessageSlashCommandComposerIntent {
  kind: "slash-command";
  selection: SlashCommandSelection;
}
