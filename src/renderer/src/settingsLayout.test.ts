import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const diagnosticsControllerSource = readFileSync(new URL("./RightPanelDiagnosticsController.ts", import.meta.url), "utf8");
const settingsPaneSource = readFileSync(new URL("./RightPanelSettingsPane.tsx", import.meta.url), "utf8");
const settingsRuntimeSource = readFileSync(new URL("./RightPanelSettingsRuntime.tsx", import.meta.url), "utf8");
const settingsWebResearchSource = readFileSync(new URL("./RightPanelSettingsWebResearch.tsx", import.meta.url), "utf8");
const settingsWebResearchRowsSource = readFileSync(new URL("./RightPanelSettingsWebResearchRows.tsx", import.meta.url), "utf8");
const settingsWebResearchSurfaceSource = `${settingsWebResearchSource}\n${settingsWebResearchRowsSource}`;
const settingsSystemSource = readFileSync(new URL("./RightPanelSettingsSystem.tsx", import.meta.url), "utf8");
const settingsControllerSource = readFileSync(new URL("./RightPanelSettingsController.ts", import.meta.url), "utf8");
const settingsAgentMemoryControllerSource = readFileSync(
  new URL("./RightPanelSettingsAgentMemoryController.ts", import.meta.url),
  "utf8",
);
const settingsSearchSource = readFileSync(new URL("./RightPanelSettingsSearchModel.ts", import.meta.url), "utf8");
const settingsCoreSource = readFileSync(new URL("./RightPanelSettingsCore.tsx", import.meta.url), "utf8");
const rightPanelControllerGraphSource = readFileSync(new URL("./RightPanelControllerGraph.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const appActiveThreadModelSource = readFileSync(new URL("./AppActiveThreadModel.ts", import.meta.url), "utf8");
const appAgentMemoryControlsSource = readFileSync(new URL("./AppAgentMemoryControls.ts", import.meta.url), "utf8");
const appProviderRuntimeStateSource = readFileSync(new URL("./AppProviderRuntimeState.ts", import.meta.url), "utf8");
const appShellLayoutSource = readFileSync(new URL("./AppShellLayout.tsx", import.meta.url), "utf8");
const appShellCommandActionsSource = readFileSync(new URL("./AppShellCommandActions.ts", import.meta.url), "utf8");
const appTopbarSource = readFileSync(new URL("./AppTopbar.tsx", import.meta.url), "utf8");
const appSettingsActionsSource = readFileSync(new URL("./AppSettingsActions.ts", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("settings layout", () => {
  it("keeps Search & Web provider controls full-width and responsive", () => {
    expect(settingsWebResearchSurfaceSource).toContain('className="web-research-settings-row"');
    expect(settingsWebResearchSurfaceSource).toContain('className="settings-mini-row web-research-provider-row"');
    expect(stylesSource).toContain(".settings-row.web-research-settings-row");
    expect(stylesSource).toContain("justify-items: stretch;");
    expect(stylesSource).toContain(".settings-row.web-research-settings-row .settings-row-control > *");
    expect(stylesSource).toContain("width: 100%;");
    expect(stylesSource).toContain("max-width: 100%;");
    expect(stylesSource).toContain(".settings-row-control > .permission-toggle");
    expect(stylesSource).toContain(".settings-row-control > .permission-toggle button");
    expect(stylesSource).toContain(".web-research-settings-row .provider-catalog-settings-grid");
    expect(stylesSource).toContain("repeat(auto-fit, minmax(min(100%, 420px), 1fr))");
    expect(stylesSource).toContain("container-type: inline-size;");
    expect(stylesSource).toContain("repeat(auto-fit, minmax(min(100%, 210px), 1fr))");
    expect(stylesSource).toContain(".settings-mini-row.web-research-provider-row");
    expect(stylesSource).toContain("@container (min-width: 760px)");
    expect(stylesSource).toContain("flex-wrap: wrap;");
    expect(stylesSource).toContain(".settings-mini-row.web-research-provider-row small");
    expect(stylesSource).toContain("overflow-wrap: normal;");
    expect(stylesSource).toContain(".settings-section-header > div:first-child");
  });

  it("keeps Settings and Plugins cards width-contained when panes are resized", () => {
    expect(stylesSource).toContain(".settings-shell");
    expect(stylesSource).toContain(".settings-section");
    expect(stylesSource).toContain("box-sizing: border-box;");
    expect(stylesSource).toContain(".provider-catalog-settings-card-header");
    expect(stylesSource).toContain(".provider-catalog-settings-card-header > .panel-button");
    expect(stylesSource).toContain(".plugin-row-header");
    expect(stylesSource).toContain(".plugin-row-header > :first-child");
    expect(stylesSource).toContain(".plugin-row-actions");
    expect(stylesSource).toContain(".plugin-badges span");
    expect(stylesSource).toContain(".plugin-source-entry");
    expect(stylesSource).toContain(".pi-package-install-row");
    expect(stylesSource).toContain("repeat(auto-fit, minmax(min(100%, 118px), 1fr))");
    expect(stylesSource).toContain("overflow-wrap: anywhere;");
    expect(stylesSource).toContain("white-space: normal;");
  });

  it("surfaces sub-agent maturity gates in settings and diagnostics", () => {
    expect(settingsRuntimeSource).toContain("function SubagentMaturityDiagnostics");
    expect(settingsRuntimeSource).toContain("function SubagentRepairDiagnostics");
    expect(settingsRuntimeSource).toContain("function SubagentReplayEvidenceDiagnostics");
    expect(settingsRuntimeSource).toContain("function LocalRuntimeEvidenceDiagnostics");
    expect(settingsRuntimeSource).toContain("function DiagnosticExportHistory");
    expect(settingsRuntimeSource).toContain("subagentMaturityLiveHistoryModel");
    expect(settingsRuntimeSource).toContain("subagentMaturityWorkflowJitterReleaseProfileModel");
    expect(settingsRuntimeSource).toContain("subagent-maturity-diagnostics");
    expect(settingsRuntimeSource).toContain("subagent-replay-evidence-group");
    expect(settingsRuntimeSource).toContain("local-runtime-evidence-group");
    expect(settingsRuntimeSource).toContain("diagnostic-export-history-row");
    expect(settingsCoreSource).toContain('label="Experimental sub-agents"');
    expect(settingsSystemSource).toContain('label="Sub-agent maturity"');
    expect(settingsSystemSource).toContain('label="Sub-agent repair"');
    expect(settingsSystemSource).toContain('label="Sub-agent replay"');
    expect(settingsSystemSource).toContain('label="Local runtime evidence"');
    expect(settingsSystemSource).toContain('label="Diagnostic export history"');
    expect(settingsSystemSource).toContain('"diagnostics.subagent-maturity"');
    expect(settingsSystemSource).toContain('"diagnostics.subagent-repair"');
    expect(settingsSystemSource).toContain('"diagnostics.subagent-replay"');
    expect(settingsSystemSource).toContain('"diagnostics.local-runtime-evidence"');
    expect(settingsSystemSource).toContain('"diagnostics.export-history"');
    expect(settingsSearchSource).toContain("feature flag graduation");
    expect(settingsSearchSource).toContain("restart repair");
    expect(settingsSearchSource).toContain("replay evidence");
    expect(settingsPaneSource).toContain("state.subagentMaturity");
    expect(settingsPaneSource).toContain("state.subagentMaturityEvidence");
    expect(settingsPaneSource).toContain("state.subagentRepairDiagnostics");
    expect(diagnosticsControllerSource).toContain("recordDiagnosticExportHistory");
    expect(diagnosticsControllerSource).toContain("selectedDiagnosticExport?.subagents?.replayEvidence");
    expect(diagnosticsControllerSource).toContain("selectedDiagnosticExport?.localRuntimes?.evidence");
    expect(settingsRuntimeSource).toContain("subagentMaturityDesktopDogfoodHistoryModel");
    expect(settingsSearchSource).toContain("workflow jitter release profile");
    expect(diagnosticsControllerSource).toContain("onImportDiagnostics");
    expect(diagnosticsControllerSource).toContain("diagnosticImportStatusMessage");
    expect(diagnosticsControllerSource).toContain("Import canceled.");
    expect(settingsSearchSource).toContain("open diagnostic bundle");
    expect(diagnosticsControllerSource).toContain("DIAGNOSTIC_EXPORT_HISTORY_STORAGE_KEY");
    expect(diagnosticsControllerSource).toContain("readInitialDiagnosticExportHistory");
    expect(diagnosticsControllerSource).toContain("persistDiagnosticExportHistory");
    expect(settingsSystemSource).toContain("Recent saved and imported diagnostic bundles from this app profile.");
    expect(diagnosticsControllerSource).toContain("subagentReplayEvidenceInspectorModel");
    expect(diagnosticsControllerSource).toContain("localRuntimeEvidenceInspectorModel");
    expect(settingsRuntimeSource).toContain("Maturity evidence");
    expect(settingsRuntimeSource).toContain("Live history:");
    expect(settingsRuntimeSource).toContain("Desktop dogfood history:");
    expect(settingsRuntimeSource).toContain("Workflow jitter release profile:");
    expect(settingsRuntimeSource).toContain("No maturity evidence recorded.");
    expect(settingsRuntimeSource).toContain("No repair issues recorded.");
    expect(settingsRuntimeSource).toContain("Export diagnostics to inspect child replay timelines.");
    expect(settingsRuntimeSource).toContain("Export diagnostics to inspect local runtime leases, blockers, and memory evidence.");
    expect(stylesSource).toContain(".subagent-replay-evidence-group");
    expect(stylesSource).toContain(".local-runtime-evidence-group");
    expect(stylesSource).toContain(".diagnostic-export-history-row.selected");
  });

  it("surfaces experimental agent memory diagnostics in settings", () => {
    expect(settingsCoreSource).toContain("AgentMemoryStarterCard");
    expect(settingsCoreSource).toContain("Advanced controls");
    expect(settingsControllerSource).toContain("useRightPanelSettingsAgentMemoryController");
    expect(settingsControllerSource).toContain("...agentMemorySettingsController");
    expect(settingsAgentMemoryControllerSource).toContain("loadAgentMemoryStarterStatus");
    expect(settingsAgentMemoryControllerSource).toContain("applyAgentMemoryStarterStatus");
    expect(settingsAgentMemoryControllerSource).toContain("confirmAgentMemoryClearFromSettings");
    expect(settingsAgentMemoryControllerSource).toContain("setAgentMemoryClearWorkspacePath(workspacePath)");
    expect(settingsAgentMemoryControllerSource).toContain("confirmedWorkspacePath !== workspacePath");
    expect(settingsAgentMemoryControllerSource).toContain("workspacePathRef.current !== confirmedWorkspacePath");
    expect(settingsAgentMemoryControllerSource).toContain("confirmation expired because the active workspace changed");
    expect(settingsAgentMemoryControllerSource).toContain("await onRefreshAgentMemoryDiagnostics()");
    expect(settingsAgentMemoryControllerSource).toContain("await loadAgentMemoryStarterStatus()");
    expect(appSettingsActionsSource).toContain("clearAgentMemory({ workspacePath: current.workspace.path })");
    expect(settingsAgentMemoryControllerSource).toContain("agentMemoryStarterEnableInputForMode(targetMode ?? settings.memory.mode)");
    expect(settingsAgentMemoryControllerSource).toContain('if (mode === "disabled") return { enableCurrentThread: true, enableNewThreads: true }');
    expect(settingsAgentMemoryControllerSource).toContain("return { enableCurrentThread: false, enableNewThreads: false }");
    expect(settingsAgentMemoryControllerSource).toContain("const repairInput");
    expect(settingsAgentMemoryControllerSource).toContain("enableCurrentThread: false");
    expect(settingsAgentMemoryControllerSource).toContain("enableAgentMemoryStarter(enableInput)");
    expect(settingsAgentMemoryControllerSource).toContain("agentMemoryStarterSettingsRefreshKey");
    expect(settingsAgentMemoryControllerSource).toContain(
      "[panel, workspacePath, activeThreadId, activeThreadMemoryEnabled, agentMemoryStarterSettingsKey]",
    );
    expect(settingsAgentMemoryControllerSource).not.toContain("settings.memory]");
    expect(settingsAgentMemoryControllerSource).toContain("onApplyMemorySettingsSnapshot(result.status.settings.memory)");
    expect(rightPanelControllerGraphSource).toContain(
      "activeThreadMemoryEnabled: Boolean(state.threads.find((thread) => thread.id === state.activeThreadId)?.memoryEnabled)",
    );
    expect(rightPanelControllerGraphSource).toContain("onApplyMemorySettingsSnapshot");
    expect(settingsCoreSource).toContain("agentMemoryStarterPrimaryAction(status)");
    expect(settingsCoreSource).toContain("agentMemoryStarterSetupAction(status)");
    expect(settingsCoreSource).toContain("agentMemoryStarterRepairButtonLabel(status, setupAction)");
    expect(settingsCoreSource).toContain("runAgentMemoryStarterAction(setupAction");
    expect(settingsCoreSource).toContain("agentMemoryStarterOperationForAction(action)");
    expect(settingsCoreSource).toContain('aria-label="Agent Memory mode"');
    expect(settingsCoreSource).toContain("async function changeAgentMemoryMode");
    expect(settingsCoreSource).toContain("await disableAgentMemoryStarterFromSettings()");
    expect(settingsCoreSource).toContain("await enableAgentMemoryStarterFromSettings(mode)");
    expect(settingsCoreSource).toContain("AgentMemoryPolicyDiagnostics");
    expect(settingsCoreSource).toContain("showControls={false}");
    expect(settingsCoreSource).toContain('actionsDisabled={memoryFlagValue === "Forced off"}');
    expect(settingsCoreSource).toContain("disabled={busy}");
    expect(settingsCoreSource).toContain('if (actionsDisabled && nextMode !== "disabled") return;');
    expect(settingsCoreSource).toContain('disabled={actionsDisabled && mode !== "disabled"}');
    expect(appTopbarSource).toContain('aria-label="Memory for this thread"');
    expect(appActiveThreadModelSource).toContain('activeThread?.kind !== "subagent_child" &&');
    expect(appActiveThreadModelSource).toContain("isAmbientTencentDbMemoryEnabled(state.featureFlagSnapshot)");
    expect(appShellLayoutSource).toContain("memoryMode: showTopbarThreadMemoryToggle ? state.settings.memory.mode : undefined");
    expect(appShellLayoutSource).toContain("void updateThreadSettings({ memoryEnabled: enabled });");
    expect(appShellCommandActionsSource).toContain("setState((current) => {");
    expect(appShellCommandActionsSource).toContain("current.activeThreadId === thread.id");
    expect(settingsCoreSource).toContain("Refresh diagnostics");
    expect(settingsCoreSource).toContain("Confirm clear");
    expect(settingsCoreSource).toContain("agentMemoryClearStatus");
    expect(settingsCoreSource).toContain("disabled={agentMemoryClearLoading || agentMemoryClearConfirming}");
    expect(settingsCoreSource).toContain("AgentMemoryDiagnosticsSummary");
    expect(settingsCoreSource).toContain("AGENT_MEMORY_PRIVACY_DISCLOSURE_LINES");
    expect(settingsCoreSource).toContain("Memory privacy");
    expect(settingsCoreSource).toContain("Embeddings endpoint");
    expect(settingsCoreSource).toContain("onRunAgentMemoryEmbeddingLifecycleAction");
    expect(rightPanelControllerGraphSource).toContain("runAgentMemoryEmbeddingLifecycleActionFromSettings");
    expect(rightPanelControllerGraphSource).toContain("settingsPane.applyAgentMemoryStarterStatus(result.starterStatus)");
    expect(rightPanelControllerGraphSource).toContain("await settingsPane.loadAgentMemoryStarterStatus()");
    expect(rightPanelControllerGraphSource).toContain(
      "onRunAgentMemoryEmbeddingLifecycleActionFromSettings: runAgentMemoryEmbeddingLifecycleActionFromSettings",
    );
    expect(appProviderRuntimeStateSource).toContain("agentMemoryDiagnosticsRequestSeq");
    expect(appAgentMemoryControlsSource).toContain("requestId !== agentMemoryDiagnosticsRequestSeqRef.current");
    expect(appAgentMemoryControlsSource).toContain(
      "agentMemoryDiagnosticsRequestSeqRef.current += 1;\n      setAgentMemoryDiagnosticsLoading(false);",
    );
    expect(settingsCoreSource).toContain("Raw memory content");
    expect(settingsPaneSource).toContain("agentMemoryDiagnostics");
    expect(settingsSearchSource).toContain("agent memory");
  });
});
