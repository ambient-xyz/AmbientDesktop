import { describe, expect, it } from "vitest";

import {
  rightPanelSettingsSearchModel,
  rightPanelSettingsSectionSearchTerms,
  rightPanelSettingsSearchTargets,
  rightPanelSettingsSections,
  type RightPanelSettingsSearchTargetsInput,
} from "./RightPanelSettingsSearchModel";
import type { DesktopState } from "../../shared/desktopTypes";
import type { SettingsSearchTarget, SettingsSectionNavItem } from "./RightPanelSettingsPrimitives";

describe("RightPanelSettingsSearchModel", () => {
  it("builds settings section navigation statuses", () => {
    expect(rightPanelSettingsSections({
      appIsPackaged: false,
      voiceStatusLabel: "Ready",
      collaborationMode: "planner",
      localModelsSummary: "2 local",
      speechStatusLabel: "Unavailable",
      searchWebStatus: "Scrapling",
      mcpRuntimeStatus: "Runtime ready",
      visualCatalogCount: 1,
      authoredVideoCatalogCount: 2,
      writingStyleCatalogCount: 1,
      activePermissionGrantCount: 3,
      diagnosticStatusKind: "success",
      appVersion: "0.1.58",
    })).toEqual([
      { id: "overview", label: "Overview", status: "Development" },
      { id: "voice", label: "Voice Output", status: "Ready" },
      { id: "model-mode", label: "Model & Mode", status: "Planner" },
      { id: "local-models", label: "Local Models", status: "2 local" },
      { id: "speech", label: "Speech Input", status: "Unavailable" },
      { id: "search-web", label: "Search & Web", status: "Scrapling" },
      { id: "mcp-runtime", label: "MCP Runtime & Web Research", status: "Runtime ready" },
      { id: "media-browser", label: "Media & Vision", status: "1 visual / 2 video" },
      { id: "writing-style", label: "Writing Style", status: "1 catalog" },
      { id: "security-access", label: "Security & Access", status: "3 active" },
      { id: "diagnostics", label: "Diagnostics", status: "success" },
      { id: "about", label: "About", status: "0.1.58" },
    ]);
  });

  it("builds settings row search targets from live settings models", () => {
    const targets = rightPanelSettingsSearchTargets(fixtureSearchTargetsInput());

    expect(targets.map((target) => target.id)).toContain("voice.voice");
    expect(targetTerms(targets, "voice.provider")).toContain("piper");
    expect(targetTerms(targets, "voice.voice")).toContain("Soprano");
    expect(targetTerms(targets, "model-mode.slash-commands")).toContain("ambient.slashCommands");
    expect(targetTerms(targets, "search-web.local-deep-research")).toContain("LiteResearcher ready");
    expect(targetTerms(targets, "writing-style.catalog")).toContain("TinyStyler");
    expect(targetTerms(targets, "security.google")).toContain("gmail");
    expect(targetTerms(targets, "diagnostics.subagent-repair")).toContain("missing_spawn_edge");
  });

  it("omits selected voice detail rows until a voice provider exists", () => {
    const targets = rightPanelSettingsSearchTargets({
      ...fixtureSearchTargetsInput(),
      voiceProviderModel: {
        statusLabel: "Set up a provider first",
        runtimeState: { label: "No voice provider", detail: "No TTS provider is selected." },
        enabledChecked: false,
        autoplayChecked: false,
      },
    });

    expect(targets.map((target) => target.id)).not.toContain("voice.voice");
    expect(targets.map((target) => target.id)).not.toContain("voice.format");
  });

  it("returns every section and row visible when search is empty", () => {
    const model = rightPanelSettingsSearchModel({
      query: " ",
      sections: fixtureSections(),
      sectionSearchTerms: rightPanelSettingsSectionSearchTerms({ modelCatalogSearchText: "local llama" }),
      targets: fixtureTargets(),
    });

    expect(model.searchActive).toBe(false);
    expect(model.visibleSections.map((section) => section.id)).toEqual(["overview", "voice", "diagnostics"]);
    expect(model.visibleSearchResultCount).toBe(4);
    expect(model.sectionVisible("voice")).toBe(true);
    expect(model.rowVisible("voice", "voice.provider")).toBe(true);
  });

  it("keeps a section visible when only its section terms match", () => {
    const model = rightPanelSettingsSearchModel({
      query: "assistant voice settings",
      sections: fixtureSections(),
      sectionSearchTerms: rightPanelSettingsSectionSearchTerms({}),
      targets: fixtureTargets(),
    });

    expect(model.searchActive).toBe(true);
    expect(model.visibleSections).toEqual([{ id: "voice", label: "Voice", status: "2 matches" }]);
    expect(model.sectionVisible("voice")).toBe(true);
    expect(model.rowVisible("voice", "voice.output")).toBe(true);
    expect(model.rowVisible("voice", "voice.provider")).toBe(true);
    expect(model.sectionVisible("diagnostics")).toBe(false);
  });

  it("keeps a section visible when one of its rows matches", () => {
    const model = rightPanelSettingsSearchModel({
      query: "restart repair",
      sections: fixtureSections(),
      sectionSearchTerms: rightPanelSettingsSectionSearchTerms({}),
      targets: fixtureTargets(),
    });

    expect(model.visibleSections).toEqual([{ id: "diagnostics", label: "Diagnostics", status: "1 match" }]);
    expect(model.sectionVisible("diagnostics")).toBe(true);
    expect(model.rowVisible("diagnostics", "diagnostics.subagent-repair")).toBe(true);
    expect(model.rowVisible("diagnostics", "diagnostics.export")).toBe(false);
    expect(model.rowVisible("voice", "voice.output")).toBe(false);
  });
});

function fixtureSections(): SettingsSectionNavItem[] {
  return [
    { id: "overview", label: "Overview" },
    { id: "voice", label: "Voice" },
    { id: "diagnostics", label: "Diagnostics" },
  ];
}

function fixtureTargets(): SettingsSearchTarget[] {
  return [
    { id: "overview.workspace", sectionId: "overview", terms: ["workspace", "project"] },
    { id: "voice.output", sectionId: "voice", terms: ["voice output"] },
    { id: "voice.provider", sectionId: "voice", terms: ["provider catalog"] },
    { id: "diagnostics.subagent-repair", sectionId: "diagnostics", terms: ["subagent repair", "restart repair"] },
  ];
}

function targetTerms(targets: SettingsSearchTarget[], id: string): string {
  return targets.find((target) => target.id === id)?.terms.filter(Boolean).join(" ") ?? "";
}

function fixtureSearchTargetsInput(): RightPanelSettingsSearchTargetsInput {
  return {
    state: fixtureDesktopState(),
    voiceProviderModel: {
      statusLabel: "Ready",
      runtimeState: { label: "Voice runtime ready", detail: "Piper available" },
      selectedProvider: {
        label: "Piper",
        capabilityId: "voice.piper",
        voices: [{ id: "soprano", label: "Soprano", locale: "en-US", style: ["clear"] }],
      },
      selectedVoiceId: "soprano",
      selectedFormat: "wav",
      enabledChecked: true,
      autoplayChecked: false,
      availabilityMessage: "available",
      diagnostics: { statusLabel: "healthy" },
    },
    voiceProviderLabelMode: "cached provider label",
    voiceSetupHealth: [{ label: "Provider cache", detail: "ready" }],
    voiceCatalogCards: [providerCard("voice.piper", "Piper", "local voice")],
    modelCatalogSettings: {
      statusLabel: "2 main / 1 sub-agent",
      summary: "3 available",
      searchText: "llama local runtime",
      localModelsStatusLabel: "2 local",
      localModelsSummary: "2 local",
      localRuntimeSummary: "1 running",
      localProfileRows: [{ label: "Llama", modelId: "llama", profileId: "local", statusLabel: "Ready", detailLabels: ["local"] }],
      localRuntimeGroups: [{ label: "Text", summary: "1 running", emptyLabel: "No text runtimes" }],
      localRuntimeRows: [{
        label: "Llama runtime",
        modelLabel: "Llama",
        capabilityLabel: "text",
        statusLabel: "running",
        ownerLabel: "Ambient",
        memoryLabel: "2 GiB",
        lifecycleActions: [{ label: "Restart", title: "Restart runtime" }],
        ordinaryStopAction: { title: "Stop runtime" },
      }],
    },
    subagentsEffectiveEnabled: true,
    sttProviderModel: {
      statusLabel: "Speech ready",
      selectedProvider: { label: "Qwen ASR", capabilityId: "stt.qwen" },
      selectedLanguage: "en",
      enabledChecked: true,
      availabilityMessage: "available",
      diagnostics: { statusLabel: "healthy" },
    },
    sttCatalogCards: [providerCard("stt.qwen", "Qwen ASR", "local speech")],
    selectedSttMicrophoneLabel: "Studio Mic",
    sttMicrophoneSettingsValue: "Studio Mic",
    sttMicTestStatus: "success",
    sttShortcutDisplayLabel: "Cmd+Shift+Space",
    sttDiagnosticRows: [{ title: "Provider cache", detailLabels: ["ready"] }],
    webResearchSearchStatus: "Exa",
    webResearchFetchStatus: "Scrapling",
    searchRoutingStatus: "preferred exa",
    searchRoutingDetail: "fallback browser",
    searchCatalogCards: [providerCard("web.exa", "Exa", "web search")],
    localDeepResearch: {
      setupMessage: "LiteResearcher ready",
      setupStatusLabel: "Ready",
      progressTitle: "Installed",
      progressDetail: "complete",
      q8Label: "Q8 accepted",
      runBudgetLabel: "Deep",
      runBudgetToolCalls: 60,
      runBudgetOnExhausted: "ask_to_continue",
      runHistoryMessage: "1 run",
      runs: [{ status: "success", question: "Summarize docs", modelProfileId: "literesearcher" }],
      diagnostics: [{ code: "ready", title: "Ready" }],
    },
    mcpRuntime: {
      label: "Runtime ready",
      statusMessage: "ToolHive ready",
      checkedAt: "2026-06-13T00:00:00.000Z",
      defaultWebResearchCapability: { status: "installed", message: "Scrapling installed" },
      installedServers: [{ serverId: "scrapling", workloadName: "ambient-scrapling" }],
    },
    miniCpmVisionSetupMessage: "MiniCPM ready",
    miniCpmVisionDiagnostics: [{ code: "ready", title: "Ready" }],
    visualCatalogCards: [providerCard("vision.minicpm", "MiniCPM", "visual analysis")],
    authoredVideoCatalogCards: [providerCard("video.hyperframes", "Hyperframes", "authored motion")],
    writingStyleCatalogCards: [providerCard("writing.tinystyler", "TinyStyler", "style transfer")],
    googleGrantGroups: [{ accountHint: "user@example.test", services: ["gmail", "drive"] }],
    grantRegistrySummary: "2 active",
    diagnostics: {
      diagnosticStatusKind: "success",
      diagnosticStatusMessage: "Exported",
      diagnosticExportHistorySearchText: "diagnostic bundle",
      subagentMaturitySearchTerms: ["maturity ready"],
      subagentRepairSearchText: "missing_spawn_edge repaired",
      subagentReplaySearchText: "child timeline",
      localRuntimeEvidenceSearchText: "runtime lease",
    },
  };
}

function fixtureDesktopState(): DesktopState {
  return {
    workspace: { name: "Ambient", path: "/tmp/ambient" },
    app: {
      name: "Ambient Coder",
      version: "0.1.58",
      platform: "darwin",
      arch: "arm64",
      isPackaged: false,
      update: {
        enabled: true,
        status: "not-available",
        currentVersion: "0.1.58",
        channel: "dogfood",
        canCheck: true,
        canDownload: false,
        canInstall: false,
      },
    },
    appearance: { themePreference: "system" },
    provider: { source: "stored" },
    providerCatalog: { catalogVersion: "test-catalog" },
    settings: {
      model: "gpt-5",
      featureFlags: { subagents: true, tencentDbMemory: true, slashCommands: true },
      memory: {
        mode: "per_thread",
        enabled: true,
        defaultThreadEnabled: false,
        adapter: "tencentdb",
        shortTermOffloadEnabled: false,
        embeddings: {
          enabled: true,
          providerMode: "ambient-managed",
          autoStartProvider: true,
          sendDimensions: false,
          maxInputChars: 512,
          timeoutMs: 10_000,
          preflightEnabled: true,
        },
        storageScope: "workspace",
      },
      thinkingDisplay: { mode: "full", showRunStatusCard: true },
      modelRuntime: {
        aggressiveRetries: true,
        providerStreamIdleTimeoutMs: 30_000,
        providerPreStreamTimeoutMs: 10_000,
      },
      compaction: { autoCompactionEnabled: true },
      planner: { autoFinalize: true },
      media: { generatedMediaAutoplay: false },
    },
    activeThreadId: "thread-1",
    threads: [
      {
        id: "thread-1",
        title: "Thread",
        workspacePath: "/tmp/ambient",
        createdAt: "2026-06-05T00:00:00.000Z",
        updatedAt: "2026-06-05T00:00:00.000Z",
        lastMessagePreview: "",
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "gpt-5",
        thinkingLevel: "xhigh",
        memoryEnabled: false,
      },
    ],
    featureFlagSnapshot: { flags: { "ambient.subagents": { enabled: true, source: "settings" } } },
  } as unknown as DesktopState;
}

function providerCard(id: string, displayName: string, recommendationSummary: string) {
  return { id, displayName, recommendationSummary };
}
