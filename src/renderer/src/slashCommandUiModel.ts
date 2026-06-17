import {
  SLASH_COMMAND_INVOCATION_SCHEMA_VERSION,
  type SlashCommandAvailability,
  type SlashCommandCatalogEntry,
  type SlashCommandSearchInput,
  type SlashCommandSelection,
} from "../../shared/slashCommandTypes";

export interface SlashCommandDraftTrigger {
  active: boolean;
  query: string;
  token: string;
}

export function slashCommandTriggerFromDraft(draft: string, selected?: SlashCommandSelection): SlashCommandDraftTrigger {
  if (selected) return { active: false, query: "", token: "" };
  const firstLine = draft.split(/\r?\n/, 1)[0] ?? "";
  if (!firstLine.startsWith("/")) return { active: false, query: "", token: "" };
  if (/\s/.test(firstLine)) return { active: false, query: "", token: "" };
  return {
    active: true,
    query: firstLine.slice(1),
    token: firstLine,
  };
}

export function slashCommandDraftAfterSelection(draft: string, entry: SlashCommandCatalogEntry): string {
  const trimmed = draft.trimStart();
  if (!trimmed.startsWith("/")) return draft;
  const remainder = draft.slice(draft.indexOf(trimmed) + firstTokenLength(trimmed)).trimStart();
  if (entry.kind === "app") return remainder ? `${entry.command} ${remainder}` : `${entry.command} `;
  return remainder;
}

export function slashCommandComposerCanSubmit(draft: string, selected?: SlashCommandSelection): boolean {
  return Boolean(draft.trim()) || Boolean(selected && !selected.requiresParameters);
}

export function slashCommandPickerSearchInput(query: string): SlashCommandSearchInput {
  const trimmed = query.trim();
  return {
    query,
    includeUnavailable: true,
    limit: 12,
    ...(trimmed.length >= 2 ? { kinds: ["app", "skill", "workflow", "callable-workflow"] } : {}),
  };
}

export function slashCommandSelectionFromEntry(
  entry: SlashCommandCatalogEntry,
  userQuery: string,
): SlashCommandSelection {
  return {
    schemaVersion: SLASH_COMMAND_INVOCATION_SCHEMA_VERSION,
    entryId: entry.id,
    command: entry.command,
    title: entry.title,
    kind: entry.kind,
    sourceKind: entry.sourceKind,
    invocationKind: entry.invocationKind,
    requiresParameters: entry.requiresParameters,
    ...(entry.sourceId ? { sourceId: entry.sourceId } : {}),
    ...(entry.sourceName ? { sourceName: entry.sourceName } : {}),
    ...(entry.sourceVersion !== undefined ? { sourceVersion: entry.sourceVersion } : {}),
    ...(entry.sourceFingerprint ? { sourceFingerprint: entry.sourceFingerprint } : {}),
    ...(userQuery ? { userQuery } : {}),
  };
}

export function slashCommandEntryIsSelectable(entry: SlashCommandCatalogEntry): boolean {
  return entry.availability === "available";
}

export function slashCommandAvailabilityLabel(availability: SlashCommandAvailability): string {
  if (availability === "available") return "Ready";
  if (availability === "setup-required") return "Setup";
  if (availability === "feature-disabled") return "Off";
  if (availability === "untrusted") return "Trust";
  if (availability === "archived") return "Archived";
  if (availability === "disabled") return "Disabled";
  return "Unavailable";
}

export function slashCommandGroupLabel(entry: Pick<SlashCommandCatalogEntry, "kind" | "sourceKind">): string {
  if (entry.kind === "app") return "App";
  if (entry.kind === "skill") return entry.sourceKind === "ambient-cli" ? "CLI Skills" : "Skills";
  if (entry.kind === "workflow") return "Workflows";
  return entry.sourceKind === "symphony" ? "Symphony" : "Callable Workflows";
}

function firstTokenLength(value: string): number {
  const match = value.match(/^\S+/);
  return match?.[0].length ?? 0;
}
