import { describe, expect, it } from "vitest";

import type { SlashCommandCatalogEntry } from "../../shared/slashCommandTypes";
import {
  slashCommandCatalogNeedsRefreshEvent,
  slashCommandComposerCanSubmit,
  slashCommandDraftAfterSelection,
  slashCommandGroupLabel,
  slashCommandPickerSearchInput,
  slashCommandSelectionFromEntry,
  slashCommandTriggerFromDraft,
} from "./slashCommandUiModel";

describe("slash command UI model", () => {
  it("activates for the unselected slash token around the caret", () => {
    expect(slashCommandTriggerFromDraft("/aud")).toMatchObject({ active: true, query: "aud", token: "/aud", start: 0, end: 4 });
    expect(slashCommandTriggerFromDraft("/audit this")).toMatchObject({ active: false });
    expect(slashCommandTriggerFromDraft("please /audit")).toMatchObject({ active: true, query: "audit", token: "/audit", start: 7, end: 13 });
    expect(slashCommandTriggerFromDraft("please /aud this", undefined, 11)).toMatchObject({ active: true, query: "aud", token: "/aud", start: 7, end: 11 });
    expect(slashCommandTriggerFromDraft("please\n/aud")).toMatchObject({ active: true, query: "aud", token: "/aud", start: 7, end: 11 });
    expect(slashCommandTriggerFromDraft("please /audit this")).toMatchObject({ active: false });
    expect(slashCommandTriggerFromDraft("open /Users/example/project", undefined, 8)).toMatchObject({ active: false });
    expect(slashCommandTriggerFromDraft("word/aud", undefined, 6)).toMatchObject({ active: false });
    expect(slashCommandTriggerFromDraft("/aud", slashCommandSelectionFromEntry(entry(), "aud"))).toMatchObject({ active: false });
  });

  it("turns app entries into text and skill entries into clean prompt drafts", () => {
    expect(slashCommandDraftAfterSelection("/pla", entry({ kind: "app", command: "/plan" }))).toBe("/plan ");
    expect(slashCommandDraftAfterSelection("/pla\nReview the migration.", entry({ kind: "app", command: "/plan" }))).toBe(
      "/plan Review the migration.",
    );
    expect(slashCommandDraftAfterSelection("please /pla this", entry({ kind: "app", command: "/plan" }))).toBe(
      "please /plan this",
    );
    expect(slashCommandDraftAfterSelection("/audit", entry())).toBe("");
    expect(slashCommandDraftAfterSelection("/audit\nReview the migration.", entry())).toBe("Review the migration.");
    expect(slashCommandDraftAfterSelection("please /audit this", entry())).toBe("please this");
    expect(slashCommandDraftAfterSelection("please /audit\nReview the migration.", entry())).toBe("please Review the migration.");
  });

  it("allows bare selected slash commands only when no parameters are required", () => {
    expect(slashCommandComposerCanSubmit("", undefined)).toBe(false);
    expect(slashCommandComposerCanSubmit("Review the migration.", undefined)).toBe(true);
    expect(slashCommandComposerCanSubmit("", slashCommandSelectionFromEntry(entry(), "audit"))).toBe(true);
    expect(slashCommandComposerCanSubmit("", slashCommandSelectionFromEntry(entry({ requiresParameters: true }), "flow"))).toBe(false);
    expect(slashCommandComposerCanSubmit("Run it for the weekly report.", slashCommandSelectionFromEntry(entry({ requiresParameters: true }), "flow"))).toBe(true);
  });

  it("requests callable workflow entries for concrete picker searches", () => {
    expect(slashCommandPickerSearchInput("")).toEqual({
      query: "",
      mode: "catalog",
      includeUnavailable: true,
      limit: 80,
    });
    expect(slashCommandPickerSearchInput("report")).toMatchObject({
      query: "report",
      mode: "query",
      includeUnavailable: true,
      limit: 50,
      kinds: ["app", "skill", "workflow", "callable-workflow"],
    });
  });

  it("builds stable selections and group labels", () => {
    const selection = slashCommandSelectionFromEntry(entry({ sourceId: "plugin-1", sourceVersion: "1.0.0" }), "aud");

    expect(selection).toMatchObject({
      schemaVersion: "ambient-slash-command-invocation-v1",
      entryId: "entry-1",
      invocationKind: "codex-plugin-skill",
      requiresParameters: false,
      sourceId: "plugin-1",
      userQuery: "aud",
    });
    expect(slashCommandGroupLabel(entry({ kind: "callable-workflow", sourceKind: "symphony", groupLabel: "" }))).toBe("Symphony");
    expect(slashCommandGroupLabel(entry({ groupLabel: "Ambient CLI commands" }))).toBe("Ambient CLI commands");
  });

  it("refreshes an open picker for catalog update events", () => {
    expect(slashCommandCatalogNeedsRefreshEvent({ type: "plugin-catalog-updated", workspacePath: "/repo" })).toBe(true);
    expect(slashCommandCatalogNeedsRefreshEvent({ type: "run-status", threadId: "thread-1", status: "idle" })).toBe(false);
  });
});

function entry(overrides: Partial<SlashCommandCatalogEntry> = {}): SlashCommandCatalogEntry {
  return {
    id: "entry-1",
    command: "/audit",
    aliases: [],
    title: "Audit",
    kind: "skill",
    sourceKind: "codex-plugin",
    invocationKind: "codex-plugin-skill",
    availability: "available",
    badges: ["Skill"],
    groupKey: "codex-plugin-skill",
    groupLabel: "Codex plugin skills",
    icon: "sparkles",
    requiresParameters: false,
    searchText: "/audit audit skill",
    ...overrides,
  };
}
