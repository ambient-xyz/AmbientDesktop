import { describe, expect, it } from "vitest";

import type { SlashCommandCatalogEntry } from "../../shared/slashCommandTypes";
import {
  slashCommandComposerCanSubmit,
  slashCommandDraftAfterSelection,
  slashCommandGroupLabel,
  slashCommandPickerSearchInput,
  slashCommandSelectionFromEntry,
  slashCommandTriggerFromDraft,
} from "./slashCommandUiModel";

describe("slash command UI model", () => {
  it("activates only for an unselected first slash token", () => {
    expect(slashCommandTriggerFromDraft("/aud")).toEqual({ active: true, query: "aud", token: "/aud" });
    expect(slashCommandTriggerFromDraft("/audit this")).toMatchObject({ active: false });
    expect(slashCommandTriggerFromDraft("please /audit")).toMatchObject({ active: false });
    expect(slashCommandTriggerFromDraft("/aud", slashCommandSelectionFromEntry(entry(), "aud"))).toMatchObject({ active: false });
  });

  it("turns app entries into text and skill entries into clean prompt drafts", () => {
    expect(slashCommandDraftAfterSelection("/pla", entry({ kind: "app", command: "/plan" }))).toBe("/plan ");
    expect(slashCommandDraftAfterSelection("/pla\nReview the migration.", entry({ kind: "app", command: "/plan" }))).toBe(
      "/plan Review the migration.",
    );
    expect(slashCommandDraftAfterSelection("/audit", entry())).toBe("");
    expect(slashCommandDraftAfterSelection("/audit\nReview the migration.", entry())).toBe("Review the migration.");
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
      includeUnavailable: true,
      limit: 12,
    });
    expect(slashCommandPickerSearchInput("report")).toMatchObject({
      query: "report",
      includeUnavailable: true,
      limit: 12,
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
    expect(slashCommandGroupLabel(entry({ kind: "callable-workflow", sourceKind: "symphony" }))).toBe("Symphony");
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
    icon: "sparkles",
    requiresParameters: false,
    searchText: "/audit audit skill",
    ...overrides,
  };
}
