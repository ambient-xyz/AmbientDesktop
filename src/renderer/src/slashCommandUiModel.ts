import {
  SLASH_COMMAND_INVOCATION_SCHEMA_VERSION,
  type SlashCommandAvailability,
  type SlashCommandCatalogEntry,
  type SlashCommandSearchInput,
  type SlashCommandSelection,
} from "../../shared/slashCommandTypes";
import type { DesktopEvent } from "../../shared/desktopTypes";

export interface SlashCommandDraftTrigger {
  active: boolean;
  query: string;
  token: string;
  start: number;
  end: number;
}

export function slashCommandTriggerFromDraft(
  draft: string,
  selected?: SlashCommandSelection,
  caretIndex = draft.length,
): SlashCommandDraftTrigger {
  if (selected) return inactiveSlashCommandTrigger();
  const caret = Math.min(Math.max(caretIndex, 0), draft.length);
  const tokenRange = slashCommandTokenRangeAtCaret(draft, caret);
  if (!tokenRange) return inactiveSlashCommandTrigger(caret);
  const token = draft.slice(tokenRange.start, tokenRange.end);
  if (!token.startsWith("/")) return inactiveSlashCommandTrigger(caret);
  if (token.slice(1).includes("/")) return inactiveSlashCommandTrigger(caret);
  return {
    active: true,
    query: token.slice(1),
    token,
    start: tokenRange.start,
    end: tokenRange.end,
  };
}

export function slashCommandDraftAfterSelection(
  draft: string,
  entry: SlashCommandCatalogEntry,
  trigger: SlashCommandDraftTrigger = firstSlashCommandTokenTrigger(draft),
): string {
  if (!trigger.active) return draft;
  const before = draft.slice(0, trigger.start);
  const after = draft.slice(trigger.end);
  if (entry.kind === "app") return replaceSlashToken(before, entry.command, after);
  return removeSlashToken(before, after);
}

export function slashCommandComposerCanSubmit(draft: string, selected?: SlashCommandSelection): boolean {
  return Boolean(draft.trim()) || Boolean(selected && !selected.requiresParameters);
}

export function slashCommandPickerSearchInput(query: string): SlashCommandSearchInput {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      query,
      mode: "catalog",
      includeUnavailable: true,
      limit: 80,
    };
  }
  return {
    query,
    mode: "query",
    includeUnavailable: true,
    limit: 50,
    kinds: ["app", "skill", "workflow", "callable-workflow"],
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
  if ("groupLabel" in entry && typeof entry.groupLabel === "string" && entry.groupLabel) return entry.groupLabel;
  if (entry.kind === "app") return "App";
  if (entry.kind === "skill") return entry.sourceKind === "ambient-cli" ? "CLI Skills" : "Skills";
  if (entry.kind === "workflow") return "Workflows";
  return entry.sourceKind === "symphony" ? "Symphony" : "Callable Workflows";
}

export function slashCommandCatalogNeedsRefreshEvent(event: DesktopEvent): boolean {
  return event.type === "plugin-catalog-updated";
}

function inactiveSlashCommandTrigger(caret = 0): SlashCommandDraftTrigger {
  return { active: false, query: "", token: "", start: caret, end: caret };
}

function firstSlashCommandTokenTrigger(draft: string): SlashCommandDraftTrigger {
  const match = draft.match(/(^|\s)(\/\S+)/);
  if (!match?.[2]) return inactiveSlashCommandTrigger(draft.length);
  const token = match[2];
  const start = match.index === undefined ? 0 : match.index + match[1].length;
  if (token.slice(1).includes("/")) return inactiveSlashCommandTrigger(start);
  return {
    active: true,
    query: token.slice(1),
    token,
    start,
    end: start + token.length,
  };
}

function slashCommandTokenRangeAtCaret(draft: string, caret: number): { start: number; end: number } | undefined {
  const probeIndex = nonWhitespaceProbeIndex(draft, caret);
  if (probeIndex === undefined) return undefined;
  let start = probeIndex;
  while (start > 0 && !/\s/.test(draft[start - 1]!)) start -= 1;
  let end = probeIndex + 1;
  while (end < draft.length && !/\s/.test(draft[end]!)) end += 1;
  return { start, end };
}

function nonWhitespaceProbeIndex(draft: string, caret: number): number | undefined {
  if (caret < draft.length && !/\s/.test(draft[caret]!)) return caret;
  if (caret > 0 && !/\s/.test(draft[caret - 1]!)) return caret - 1;
  return undefined;
}

function removeSlashToken(before: string, after: string): string {
  const beforeText = before.trimEnd();
  const afterText = after.trimStart();
  if (!beforeText) return afterText;
  if (!afterText) return beforeText;
  return `${beforeText} ${afterText}`;
}

function replaceSlashToken(before: string, command: string, after: string): string {
  const beforeText = before.trimEnd();
  const afterText = after.trimStart();
  const prefix = beforeText ? `${beforeText} ` : "";
  const suffix = afterText ? ` ${afterText}` : " ";
  return `${prefix}${command}${suffix}`;
}
