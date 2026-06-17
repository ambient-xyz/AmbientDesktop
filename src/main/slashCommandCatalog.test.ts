import { describe, expect, it } from "vitest";

import { resolveAmbientFeatureFlags } from "../shared/featureFlags";
import type {
  CodexPluginCatalog,
  CodexPluginSummary,
  SlashCommandSelection,
  WorkflowRecordingLibraryDescription,
  WorkflowRecordingLibraryEntry,
} from "../shared/types";
import { buildCallableWorkflowRegistry } from "./callable-workflow/callableWorkflowRegistry";
import {
  assertSlashCommandSelectionInvocable,
  buildSlashCommandCatalogEntries,
  buildSlashCommandSearchResponse,
  describeSlashCommandCatalogEntry,
} from "./slashCommandCatalog";

describe("slash command catalog", () => {
  it("keeps built-ins available while feature-gating skills and workflows", () => {
    const response = buildSlashCommandSearchResponse({ includeUnavailable: true }, {
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { slashCommands: false } }),
      pluginCatalog: codexPluginCatalog([
        codexPlugin({ trusted: true, enabled: true, skills: [{ name: "reviewer", path: "/plugins/reviewer/SKILL.md" }] }),
      ]),
    });

    expect(response.featureFlag).toMatchObject({ id: "ambient.slashCommands", enabled: false });
    expect(response.entries.find((entry) => entry.id === "builtin:/plan")).toMatchObject({ availability: "available" });
    expect(response.entries.some((entry) => entry.id === "builtin:/chat")).toBe(false);
    expect(response.entries.find((entry) => entry.invocationKind === "codex-plugin-skill")).toMatchObject({
      availability: "feature-disabled",
    });
  });

  it("indexes trusted plugin skills and filters unavailable entries by default", () => {
    const featureFlagSnapshot = resolveAmbientFeatureFlags({ settings: { slashCommands: true } });
    const pluginCatalog = codexPluginCatalog([
      codexPlugin({ name: "trusted", trusted: true, enabled: true, skills: [{ name: "Audit SQL", path: "/plugins/sql/SKILL.md" }] }),
      codexPlugin({ name: "disabled", trusted: true, enabled: false, skills: [{ name: "Disabled skill", path: "/plugins/off/SKILL.md" }] }),
    ]);

    const response = buildSlashCommandSearchResponse({ query: "/audit" }, { featureFlagSnapshot, pluginCatalog });

    expect(response.entries).toEqual([
      expect.objectContaining({
        command: "/audit-sql",
        title: "Audit SQL",
        availability: "available",
        invocationKind: "codex-plugin-skill",
      }),
    ]);
  });

  it("maps Ambient CLI skills, commands, missing env, and descriptions", () => {
    const featureFlagSnapshot = resolveAmbientFeatureFlags({ settings: { slashCommands: true } });
    const response = buildSlashCommandSearchResponse({ query: "search", includeUnavailable: true }, {
      featureFlagSnapshot,
      ambientCliCapabilities: {
        catalogVersion: "ambient-cli-v1:test",
        truncated: false,
        results: [{
          packageId: "pkg-brave",
          registryPluginId: "ambient-cli:pkg-brave",
          sourceKind: "ambient-cli",
          packageName: "brave-search",
          installed: true,
          availability: "available",
          availabilityReason: "Installed Ambient CLI package is available.",
          commands: [{
            capabilityId: "pkg-brave:tool:search",
            sourceKind: "ambient-cli",
            name: "search",
            description: "Search the web",
            cwd: "workspace",
            health: "unknown",
            risk: ["run_process"],
          }],
          skills: [{
            capabilityId: "pkg-brave:skill:/skills/search/SKILL.md",
            sourceKind: "ambient-cli",
            name: "web-search",
            description: "Use Brave Search",
            path: "skills/search/SKILL.md",
          }],
          missingEnv: ["BRAVE_API_KEY"],
          whyMatched: ["command search"],
          score: 12,
        }],
      },
    });

    expect(response.entries.map((entry) => [entry.invocationKind, entry.availability])).toEqual([
      ["ambient-cli-command", "setup-required"],
      ["ambient-cli-skill", "setup-required"],
    ]);
    expect(describeSlashCommandCatalogEntry({ entryId: response.entries[0]!.id, includeUnavailable: true }, {
      featureFlagSnapshot,
      ambientCliCapabilities: {
        catalogVersion: "ambient-cli-v1:test",
        truncated: false,
        results: [],
      },
    }).status).toBe("not_found");
  });

  it("keeps Ambient-wrapped skills and workflow playbooks visible before plugin skills in broad discovery", () => {
    const featureFlagSnapshot = resolveAmbientFeatureFlags({ settings: { slashCommands: true } });
    const response = buildSlashCommandSearchResponse({ limit: 6 }, {
      featureFlagSnapshot,
      pluginCatalog: codexPluginCatalog([
        codexPlugin({
          name: "large-plugin",
          skills: Array.from({ length: 12 }, (_, index) => ({
            name: `Plugin Skill ${index + 1}`,
            path: `/plugins/large/skill-${index + 1}/SKILL.md`,
          })),
        }),
      ]),
      ambientCliCapabilities: {
        catalogVersion: "ambient-cli-v1:user",
        truncated: false,
        results: [{
          packageId: "pkg-user",
          registryPluginId: "ambient-cli:pkg-user",
          sourceKind: "ambient-cli",
          packageName: "user-tools",
          installed: true,
          availability: "available",
          availabilityReason: "Installed Ambient CLI package is available.",
          commands: [],
          skills: [{
            capabilityId: "pkg-user:skill:/skills/review/SKILL.md",
            sourceKind: "ambient-cli",
            name: "review",
            description: "Review project changes.",
            path: "skills/review/SKILL.md",
          }],
          missingEnv: [],
          whyMatched: ["skill review"],
          score: 10,
        }],
      },
      workflowRecordings: [workflowRecording({ id: "date-night-events", title: "Find Date Night Events" })],
    });

    expect(response.entries.map((entry) => entry.invocationKind)).toEqual([
      "builtin-command",
      "builtin-command",
      "builtin-command",
      "builtin-command",
      "ambient-cli-skill",
      "workflow-playbook",
    ]);
  });

  it("keeps duplicate display commands stable across broad search and narrow describe", () => {
    const featureFlagSnapshot = resolveAmbientFeatureFlags({ settings: { slashCommands: true } });
    const broadResponse = buildSlashCommandSearchResponse({ query: "audit", includeUnavailable: true, limit: 10 }, {
      featureFlagSnapshot,
      ambientCliCapabilities: ambientCliCapabilities([{
        packageId: "pkg-a",
        packageName: "alpha-tools",
        commandName: "audit",
      }, {
        packageId: "pkg-b",
        packageName: "beta-tools",
        commandName: "audit",
      }]),
    });
    const selectedEntry = broadResponse.entries.find((entry) => entry.sourceId === "pkg-b");
    if (!selectedEntry) throw new Error("Expected beta audit command.");
    const selection: SlashCommandSelection = {
      schemaVersion: "ambient-slash-command-invocation-v1",
      entryId: selectedEntry.id,
      command: selectedEntry.command,
      title: selectedEntry.title,
      kind: selectedEntry.kind,
      sourceKind: selectedEntry.sourceKind,
      invocationKind: selectedEntry.invocationKind,
      sourceId: selectedEntry.sourceId,
      sourceName: selectedEntry.sourceName,
      sourceVersion: selectedEntry.sourceVersion,
      sourceFingerprint: selectedEntry.sourceFingerprint,
    };

    const narrowDescription = describeSlashCommandCatalogEntry({ entryId: selectedEntry.id, includeUnavailable: true }, {
      featureFlagSnapshot,
      ambientCliCapabilities: ambientCliCapabilities([{
        packageId: "pkg-b",
        packageName: "beta-tools",
        commandName: "audit",
      }]),
    });

    expect(broadResponse.entries.filter((entry) => entry.command === "/audit")).toHaveLength(2);
    expect(narrowDescription.entry?.command).toBe(selection.command);
    expect(() => assertSlashCommandSelectionInvocable(selection, narrowDescription)).not.toThrow();
  });

  it("indexes workflow playbooks and callable Symphony recipes", () => {
    const featureFlagSnapshot = resolveAmbientFeatureFlags({
      settings: { slashCommands: true, subagents: true },
      generatedAt: "2026-06-16T00:00:00.000Z",
    });
    const entries = buildSlashCommandCatalogEntries({
      featureFlagSnapshot,
      workflowRecordings: [workflowRecording({ id: "weekly-report", title: "Weekly Report" })],
      callableWorkflowRegistry: buildCallableWorkflowRegistry({ featureFlagSnapshot, includeHiddenWhenDisabled: true }),
    });

    expect(entries.find((entry) => entry.id === "workflow-playbook:weekly-report:3")).toMatchObject({
      command: "/weekly-report",
      availability: "available",
      invocationKind: "workflow-playbook",
    });
    expect(entries.some((entry) => entry.invocationKind === "symphony-recipe" && entry.availability === "available")).toBe(true);
  });

  it("keeps disabled and archived recorded callable workflows unavailable", () => {
    const featureFlagSnapshot = resolveAmbientFeatureFlags({
      settings: { slashCommands: true, subagents: true },
      generatedAt: "2026-06-16T00:00:00.000Z",
    });
    const response = buildSlashCommandSearchResponse({
      kinds: ["callable-workflow"],
      sourceKinds: ["workflow-recorder"],
      includeUnavailable: true,
    }, {
      featureFlagSnapshot,
      callableWorkflowRegistry: buildCallableWorkflowRegistry({
        featureFlagSnapshot,
        includeHiddenWhenDisabled: true,
        recordedWorkflowPlaybooks: [
          workflowRecordingDescription({ id: "ready", title: "Ready Flow" }),
          workflowRecordingDescription({ id: "disabled", title: "Disabled Flow", enabled: false }),
          workflowRecordingDescription({
            id: "archived",
            title: "Archived Flow",
            archivedAt: "2026-06-06T18:02:00.000Z",
          }),
        ],
      }),
    });

    expect(response.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "callable-workflow:recorded:ready:v3",
        availability: "available",
      }),
      expect.objectContaining({
        id: "callable-workflow:recorded:disabled:v3",
        availability: "unavailable",
        availabilityReason: "recorded_workflow_disabled",
      }),
      expect.objectContaining({
        id: "callable-workflow:recorded:archived:v3",
        availability: "unavailable",
        availabilityReason: "recorded_workflow_archived",
      }),
    ]));
  });
});

function codexPluginCatalog(plugins: CodexPluginSummary[]): CodexPluginCatalog {
  return {
    marketplaces: [],
    plugins,
    importCandidates: [],
    errors: [],
  };
}

function codexPlugin(overrides: Partial<CodexPluginSummary> = {}): CodexPluginSummary {
  return {
    id: overrides.id ?? `plugin:${overrides.name ?? "demo"}`,
    name: overrides.name ?? "demo",
    version: overrides.version ?? "1.0.0",
    description: overrides.description ?? "Demo plugin",
    marketplaceName: "local",
    marketplacePath: "/plugins",
    rootPath: "/plugins/demo",
    sourceKind: "workspace",
    compatibilityTier: "supported",
    compatibilityNotes: [],
    supportLabels: [],
    skills: overrides.skills ?? [],
    mcpServers: [],
    enabled: overrides.enabled ?? true,
    trusted: overrides.trusted ?? true,
    errors: overrides.errors ?? [],
  };
}

function ambientCliCapabilities(commands: Array<{
  packageId: string;
  packageName: string;
  commandName: string;
}>) {
  return {
    catalogVersion: "ambient-cli-v1:duplicates",
    truncated: false,
    results: commands.map((command, index) => ({
      packageId: command.packageId,
      registryPluginId: `ambient-cli:${command.packageId}`,
      sourceKind: "ambient-cli" as const,
      packageName: command.packageName,
      installed: true,
      availability: "available" as const,
      availabilityReason: "Installed Ambient CLI package is available.",
      commands: [{
        capabilityId: `${command.packageId}:tool:${command.commandName}`,
        sourceKind: "ambient-cli" as const,
        name: command.commandName,
        description: `Run ${command.commandName} from ${command.packageName}`,
        cwd: "workspace" as const,
        health: "unknown" as const,
        risk: ["run_process"],
      }],
      skills: [],
      missingEnv: [],
      whyMatched: [`command:${command.commandName}`],
      score: 20 - index,
    })),
  };
}

function workflowRecording(overrides: Partial<WorkflowRecordingLibraryEntry> = {}): WorkflowRecordingLibraryEntry {
  return {
    id: overrides.id ?? "workflow-1",
    title: overrides.title ?? "Workflow",
    version: overrides.version ?? 3,
    enabled: overrides.enabled ?? true,
    savedAt: "2026-06-16T00:00:00.000Z",
    manifestPath: "/workflow/manifest.json",
    markdownPath: "/workflow/playbook.md",
    sidecarPath: "/workflow/sidecar.json",
    transcriptPath: "/workflow/transcript.jsonl",
    summary: overrides.summary ?? "Builds the report.",
    toolNames: overrides.toolNames ?? ["file_read"],
    outputShape: overrides.outputShape ?? ["summary"],
    versions: [],
    ...overrides,
  };
}

function workflowRecordingDescription(overrides: Partial<WorkflowRecordingLibraryDescription> = {}): WorkflowRecordingLibraryDescription {
  return {
    ...workflowRecording(overrides),
    markdownPreview: overrides.markdownPreview ?? "Builds the report.",
    playbook: overrides.playbook ?? {
      status: "confirmed",
      source: "user_edit",
      generatedAt: "2026-06-16T00:00:00.000Z",
      confirmedAt: "2026-06-16T00:01:00.000Z",
      sourceCapturedAt: "2026-06-16T00:00:00.000Z",
      intent: "Builds the report.",
      inputs: ["Goal"],
      successfulExamples: [],
      doNot: [],
      validation: ["Report is complete."],
      outputShape: ["summary"],
      evidenceSummary: {
        messageCount: 1,
        toolResultCount: 1,
        successfulToolResultCount: 1,
        failedToolResultCount: 0,
        skippedToolResultCount: 0,
        permissionBlockedToolResultCount: 0,
        redactionCount: 0,
      },
    },
    ...overrides,
  };
}
