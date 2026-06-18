import type { ReactNode } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import { localDeepResearchEffortLabel, localDeepResearchMaxToolCallsForEffort } from "../../shared/localDeepResearchBudget";
import type { RightPanelProps } from "./RightPanel";
import type { RightPanelDiagnosticsController } from "./RightPanelDiagnosticsController";
import type { RightPanelMcpController } from "./RightPanelMcpController";
import type { RightPanelSettingsController } from "./RightPanelSettingsController";
import { googleWorkspaceGrantReview } from "./googleWorkspaceGrantUiModel";
import {
  localDeepResearchInstallProgressModel,
  localDeepResearchSetupActions,
  localDeepResearchSetupResultModel,
} from "./localDeepResearchUiModel";
import {
  miniCpmVisionSetupActions,
  miniCpmVisionSetupResultModel,
} from "./miniCpmVisionUiModel";
import { modelRuntimeCatalogSettingsModel } from "./modelRuntimeCatalogUiModel";
import { permissionGrantRegistryModel } from "./permissionGrantRegistryUiModel";
import {
  mcpContainerRuntimeDiagnosticsActionState,
  mcpContainerRuntimeSetupResumeRows,
  mcpContainerRuntimeStatusLabel,
  mcpContainerRuntimeTone,
  mcpDefaultCapabilityInstallActionState,
  providerCatalogSettingsCardsForArea,
} from "./pluginUiModel";
import {
  formatTaskState,
  isSandboxFallbackPermissionAudit,
  voiceSetupHealthItems,
} from "./RightPanelDetailPanels";
import { mcpContainerRuntimeInstallBusyLabel } from "./RightPanelDialogs";
import {
  mcpContainerRuntimeInstallProgressStatus,
  mcpDefaultCapabilityInstallProgressStatus,
} from "./RightPanelPluginHost";
import {
  formatMemoryBytes,
  formatRatioPercent,
  formatTimelineTime,
} from "./RightPanelSettingsRuntime";
import { SettingsShell } from "./RightPanelSettingsPrimitives";
import {
  rightPanelSettingsSearchModel,
  rightPanelSettingsSectionSearchTerms,
  rightPanelSettingsSearchTargets,
  rightPanelSettingsSections,
} from "./RightPanelSettingsSearchModel";
import {
  RightPanelLocalModelsSettingsSection,
  RightPanelModelModeSettingsSection,
  RightPanelOverviewSettingsSection,
} from "./RightPanelSettingsCore";
import {
  RightPanelSpeechSettingsSection,
  RightPanelVoiceSettingsSection,
} from "./RightPanelSettingsVoiceSpeech";
import {
  RightPanelMcpRuntimeSettingsSection,
  RightPanelSearchWebSettingsSection,
} from "./RightPanelSettingsWebResearch";
import {
  RightPanelAboutSettingsSection,
  RightPanelDiagnosticsSettingsSection,
  RightPanelMediaSettingsSection,
  RightPanelSecuritySettingsSection,
  RightPanelWritingStyleSettingsSection,
} from "./RightPanelSettingsSystem";
import {
  webResearchProvidersForRole,
  webResearchStackWithDefaults,
  type WebResearchProviderSetupAction,
} from "./searchWebSettingsModel";
import {
  sttDiagnosticsModel,
  sttSettingsProviderModel,
  sttSetupResultModel,
} from "./sttUiModel";
import { sttShortcutLabel } from "./sttShortcut";
import { subagentRepairDiagnosticsModel } from "./subagentRepairDiagnosticsUiModel";
import {
  subagentMaturityDesktopDogfoodHistoryModel,
  subagentMaturityLiveHistoryModel,
  subagentMaturityWorkflowJitterReleaseProfileModel,
} from "./subagentMaturityUiModel";
import {
  voiceProviderForCapabilityId,
  voiceSettingsAuditRows,
  voiceSettingsProviderModel,
} from "./voiceUiModel";

type RightPanelSettingsPaneBaseProps = Pick<
  RightPanelProps,
  | "state"
  | "running"
  | "updateBusy"
  | "permissionAudit"
  | "permissionGrants"
  | "permissionAuditError"
  | "permissionGrantError"
  | "permissionGrantRevoking"
  | "voiceProviders"
  | "voiceProvidersLoading"
  | "voiceProvidersError"
  | "voiceProviderCacheStatus"
  | "voiceProviderCacheActivity"
  | "voiceCatalogRefresh"
  | "sttProviders"
  | "sttProvidersLoading"
  | "sttProvidersError"
  | "sttProviderCacheStatus"
  | "sttProviderCacheActivity"
  | "sttProviderSetup"
  | "sttMicrophoneDevices"
  | "sttMicrophoneDevicesLoading"
  | "sttMicrophoneDevicesError"
  | "miniCpmVisionSetup"
  | "miniCpmVisionRuntimePath"
  | "miniCpmVisionEndpointUrl"
  | "localDeepResearchSetup"
  | "localDeepResearchQ8Override"
  | "localDeepResearchRunHistory"
  | "sttMicTest"
  | "mcpContainerRuntimeInstallProgress"
  | "mcpDefaultCapabilityInstallProgress"
  | "searchRoutingHydrating"
  | "searchRoutingHydrationError"
  | "agentMemoryDiagnostics"
  | "agentMemoryDiagnosticsLoading"
  | "agentMemoryDiagnosticsError"
  | "agentMemoryEmbeddingActionLoading"
  | "agentMemoryEmbeddingActionResult"
  | "agentMemoryEmbeddingActionError"
  | "onLoadPermissionAudit"
  | "onLoadPermissionGrants"
  | "onRevokePermissionGrant"
  | "onRevokePermissionGrantIds"
  | "onOpenApiKey"
  | "onCheckUpdates"
  | "onThemePreferenceChange"
  | "onMediaPlaybackSettingsChange"
  | "onThinkingDisplaySettingsChange"
  | "onModelRuntimeSettingsChange"
  | "onFeatureFlagSettingsChange"
  | "onMemorySettingsChange"
  | "onActiveThreadMemoryEnabledChange"
  | "onRefreshAgentMemoryDiagnostics"
  | "onRunAgentMemoryEmbeddingLifecycleAction"
  | "onClearAgentMemory"
  | "onPlannerSettingsChange"
  | "onHydrateSearchRoutingSettings"
  | "onSearchRoutingSettingsChange"
  | "onLocalDeepResearchSettingsChange"
  | "onOpenAmbientCliSecretDialog"
  | "onVoiceSettingsChange"
  | "onLoadVoiceProviders"
  | "onRefreshVoiceCatalog"
  | "onSttSettingsChange"
  | "onLoadSttProviders"
  | "onLoadSttMicrophoneDevices"
  | "onSetupSttProvider"
  | "onSetupMiniCpmVisionProvider"
  | "onMiniCpmVisionRuntimePathChange"
  | "onMiniCpmVisionEndpointUrlChange"
  | "onSetupLocalDeepResearch"
  | "onLocalDeepResearchQ8OverrideChange"
  | "onLoadLocalDeepResearchRunHistory"
  | "onStartSttMicTest"
  | "onStopSttMicTest"
  | "onCancelSttMicTest"
  | "onOpenPluginCapabilities"
  | "onOpenMcpRuntimeSettings"
>;

export type RightPanelSettingsPaneProps = RightPanelSettingsPaneBaseProps & {
  settingsPane: RightPanelSettingsController;
  mcpPane: RightPanelMcpController;
  diagnosticsPane: RightPanelDiagnosticsController;
  PermissionFullAccessReceiptList: (props: {
    receipts: ReturnType<typeof permissionGrantRegistryModel>["fullAccessReceipts"];
    limit?: number;
  }) => ReactNode;
  onOpenMcpPlugins: () => void;
};

export function RightPanelSettingsPane({
  state,
  running,
  updateBusy,
  permissionAudit,
  permissionGrants,
  permissionAuditError,
  permissionGrantError,
  permissionGrantRevoking,
  voiceProviders,
  voiceProvidersLoading,
  voiceProvidersError,
  voiceProviderCacheStatus,
  voiceProviderCacheActivity,
  voiceCatalogRefresh,
  sttProviders,
  sttProvidersLoading,
  sttProvidersError,
  sttProviderCacheStatus,
  sttProviderCacheActivity,
  sttProviderSetup,
  sttMicrophoneDevices,
  sttMicrophoneDevicesLoading,
  sttMicrophoneDevicesError,
  miniCpmVisionSetup,
  miniCpmVisionRuntimePath,
  miniCpmVisionEndpointUrl,
  localDeepResearchSetup,
  localDeepResearchQ8Override,
  localDeepResearchRunHistory,
  sttMicTest,
  mcpContainerRuntimeInstallProgress,
  mcpDefaultCapabilityInstallProgress,
  searchRoutingHydrating,
  searchRoutingHydrationError,
  agentMemoryDiagnostics,
  agentMemoryDiagnosticsLoading,
  agentMemoryDiagnosticsError,
  agentMemoryEmbeddingActionLoading,
  agentMemoryEmbeddingActionResult,
  agentMemoryEmbeddingActionError,
  onLoadPermissionAudit,
  onLoadPermissionGrants,
  onRevokePermissionGrant,
  onRevokePermissionGrantIds,
  onOpenApiKey,
  onCheckUpdates,
  onThemePreferenceChange,
  onMediaPlaybackSettingsChange,
  onThinkingDisplaySettingsChange,
  onModelRuntimeSettingsChange,
  onFeatureFlagSettingsChange,
  onMemorySettingsChange,
  onActiveThreadMemoryEnabledChange,
  onRefreshAgentMemoryDiagnostics,
  onRunAgentMemoryEmbeddingLifecycleAction,
  onClearAgentMemory,
  onPlannerSettingsChange,
  onHydrateSearchRoutingSettings,
  onSearchRoutingSettingsChange,
  onLocalDeepResearchSettingsChange,
  onOpenAmbientCliSecretDialog,
  onVoiceSettingsChange,
  onLoadVoiceProviders,
  onRefreshVoiceCatalog,
  onSttSettingsChange,
  onLoadSttProviders,
  onLoadSttMicrophoneDevices,
  onSetupSttProvider,
  onSetupMiniCpmVisionProvider,
  onMiniCpmVisionRuntimePathChange,
  onMiniCpmVisionEndpointUrlChange,
  onSetupLocalDeepResearch,
  onLocalDeepResearchQ8OverrideChange,
  onLoadLocalDeepResearchRunHistory,
  onStartSttMicTest,
  onStopSttMicTest,
  onCancelSttMicTest,
  onOpenPluginCapabilities,
  onOpenMcpRuntimeSettings,
  settingsPane,
  mcpPane,
  diagnosticsPane,
  PermissionFullAccessReceiptList,
  onOpenMcpPlugins,
}: RightPanelSettingsPaneProps) {
    const googleGrantReview = googleWorkspaceGrantReview(permissionGrants, permissionAudit);
    const grantRegistry = permissionGrantRegistryModel({ grants: permissionGrants, auditEntries: permissionAudit });
    const googleGrantBusy = permissionGrantRevoking?.startsWith("google:");
    const sandboxFallbackAuditCount = permissionAudit.filter(isSandboxFallbackPermissionAudit).length;
    const visiblePermissionAudit =
      settingsPane.permissionAuditFilter === "sandbox-fallback" ? permissionAudit.filter(isSandboxFallbackPermissionAudit) : permissionAudit;
    const voiceProviderModel = voiceSettingsProviderModel({ providers: voiceProviders, settings: state.settings.voice });
    const selectedVoiceProvider = voiceProviderModel.selectedProvider;
    const selectedVoiceSearch = settingsPane.voiceSearchQuery.trim().toLowerCase();
    const selectedVoiceOptions = selectedVoiceProvider?.voices ?? [];
    const filteredSelectedVoiceOptions = selectedVoiceSearch
      ? selectedVoiceOptions.filter((voice) => [voice.id, voice.label, voice.locale, voice.language, ...(voice.style ?? [])].filter(Boolean).join(" ").toLowerCase().includes(selectedVoiceSearch))
      : selectedVoiceOptions;
    const selectedVoiceIsFilteredOut = Boolean(
      voiceProviderModel.selectedVoiceId &&
      selectedVoiceSearch &&
      !filteredSelectedVoiceOptions.some((voice) => voice.id === voiceProviderModel.selectedVoiceId),
    );
    const displayedSelectedVoiceOptions = selectedVoiceIsFilteredOut
      ? [
          { id: voiceProviderModel.selectedVoiceId, label: `${voiceProviderModel.selectedVoiceId} (selected)` },
          ...filteredSelectedVoiceOptions,
        ]
      : filteredSelectedVoiceOptions;
    const selectedVoiceCatalogRefresh = selectedVoiceProvider ? voiceCatalogRefresh?.providerCapabilityId === selectedVoiceProvider.capabilityId ? voiceCatalogRefresh : undefined : undefined;
    const selectedVoiceCatalog = selectedVoiceProvider?.voiceCatalog;
    const selectedVoice = selectedVoiceOptions.find((voice) => voice.id === voiceProviderModel.selectedVoiceId);
    const selectedPreferredVoiceId = selectedVoiceProvider ? state.settings.voice.preferredVoicesByProvider?.[selectedVoiceProvider.capabilityId] : undefined;
    const selectedPreferredVoice = selectedPreferredVoiceId ? selectedVoiceOptions.find((voice) => voice.id === selectedPreferredVoiceId) : undefined;
    const cachedSelectedVoiceProvider = voiceProviderForCapabilityId(voiceProviders, state.settings.voice.providerCapabilityId);
    const voiceProviderLabelMode = state.settings.voice.providerCapabilityId
      ? cachedSelectedVoiceProvider
        ? "cached provider label"
        : "fallback provider label"
      : "no provider selected";
    const voiceSetupHealth = voiceSetupHealthItems({
      settings: state.settings.voice,
      selectedProvider: cachedSelectedVoiceProvider,
      cacheStatus: voiceProviderCacheStatus,
      cacheLoading: voiceProvidersLoading,
      retention: settingsPane.voiceArtifactRetention,
      retentionLoading: settingsPane.voiceArtifactRetentionLoading,
      retentionError: settingsPane.voiceArtifactRetentionError,
    });
    const voiceAuditRows = voiceSettingsAuditRows(state.voiceSettingsAudit);
    const sttProviderModel = sttSettingsProviderModel({ providers: sttProviders, settings: state.settings.stt });
    const selectedSttProvider = sttProviderModel.selectedProvider;
    const sttSetupModel = sttProviderSetup.result ? sttSetupResultModel(sttProviderSetup.result) : undefined;
    const sttDiagnosticRows = sttDiagnosticsModel(state.sttDiagnostics);
    const sttShortcutDisplayLabel = state.settings.stt.pushToTalkShortcut
      ? sttShortcutLabel(state.settings.stt.pushToTalkShortcut)
      : "Not set";
    const selectedSttMicrophoneId = state.settings.stt.microphone?.deviceId;
    const selectedSttMicrophone = selectedSttMicrophoneId
      ? sttMicrophoneDevices.find((device) => device.deviceId === selectedSttMicrophoneId)
      : undefined;
    const selectedSttMicrophoneMissing = Boolean(selectedSttMicrophoneId && !selectedSttMicrophone);
    const selectedSttMicrophoneLabel =
      selectedSttMicrophone?.label ?? state.settings.stt.microphone?.label ?? selectedSttMicrophoneId ?? "System default";
    const sttMicrophoneSettingsValue = selectedSttMicrophoneId
      ? selectedSttMicrophoneMissing
        ? "Unavailable"
        : selectedSttMicrophoneLabel
      : "System default";
    const sttMicTestRecording = sttMicTest.status === "recording";
    const sttMicTestBusy = sttMicTest.status === "saving" || sttMicTest.status === "validating";
    const sttMicTestDisabled = sttProviderSetup.status === "running" || sttMicTestBusy || !selectedSttProvider?.available;
    const sttMicTestTone =
      sttMicTest.status === "success"
        ? "success"
        : sttMicTest.status === "error"
          ? "error"
          : sttMicTest.status === "recording" || sttMicTestBusy
            ? "info"
            : "info";
    const voiceCatalogCards = providerCatalogSettingsCardsForArea(state.providerCatalog.cards, "voice-generation");
    const sttCatalogCards = providerCatalogSettingsCardsForArea(state.providerCatalog.cards, "voice-recognition");
    const webSearchCatalogCards = providerCatalogSettingsCardsForArea(state.providerCatalog.cards, "web-search");
    const deepResearchCatalogCards = providerCatalogSettingsCardsForArea(state.providerCatalog.cards, "deep-research").filter((card) => card.id === "deep.literesearcher-4b");
    const searchCatalogCards = [...webSearchCatalogCards, ...deepResearchCatalogCards];
    const visualCatalogCards = providerCatalogSettingsCardsForArea(state.providerCatalog.cards, "visual-understanding");
    const authoredVideoCatalogCards = providerCatalogSettingsCardsForArea(state.providerCatalog.cards, "video-generation").filter((card) => card.id === "video.hyperframes-authored-motion");
    const writingStyleCatalogCards = providerCatalogSettingsCardsForArea(state.providerCatalog.cards, "writing-style-transfer");
    const miniCpmVisionSetupModel = miniCpmVisionSetup.result ? miniCpmVisionSetupResultModel(miniCpmVisionSetup.result) : undefined;
    const miniCpmVisionActions = miniCpmVisionSetupActions(miniCpmVisionSetup.result);
    const miniCpmVisionDiagnostics = miniCpmVisionSetup.diagnostics ?? miniCpmVisionSetupModel?.diagnostics ?? [];
    const localDeepResearchSetupModel = localDeepResearchSetup.result ? localDeepResearchSetupResultModel(localDeepResearchSetup.result) : undefined;
    const localDeepResearchActions = localDeepResearchSetupActions(localDeepResearchSetup.result);
    const localDeepResearchDiagnostics = localDeepResearchSetup.diagnostics ?? localDeepResearchSetupModel?.diagnostics ?? [];
    const localModelResourceSettings = state.settings.localDeepResearch.localModelResources;
    const localModelMemoryLimitGiB = localModelResourceSettings.maxResidentMemoryBytes
      ? Math.round(localModelResourceSettings.maxResidentMemoryBytes / (1024 ** 3))
      : "";
    const localModelResources = localDeepResearchSetup.result?.localModelResources;
    const localModelResourcePolicy = localModelResources?.policyDecision;
    const localModelMemoryPolicySummary = [
      `Ceiling: ${formatRatioPercent(localModelResourceSettings.maxProjectedMemoryUtilization)} system utilization`,
      `keep ${formatRatioPercent(localModelResourceSettings.minFreeMemoryRatioAfterLaunch)} free`,
      `comfortable above ${formatRatioPercent(localModelResourceSettings.comfortableFreeMemoryRatio)} free`,
      localModelResourceSettings.maxResidentMemoryBytes !== undefined
        ? `advanced GiB override ${formatMemoryBytes(localModelResourceSettings.maxResidentMemoryBytes)}`
        : "no advanced GiB override",
    ].join(" · ");
    const localModelResourcePolicyEvidence = localModelResourcePolicy
      ? [
          `policy ${formatTaskState(localModelResourcePolicy.outcome)}`,
          localModelResourcePolicy.projectedSystemMemoryUtilization !== undefined
            ? `projected utilization ${formatRatioPercent(localModelResourcePolicy.projectedSystemMemoryUtilization)}`
            : undefined,
          localModelResourcePolicy.projectedFreeMemoryBytes !== undefined
            ? `projected free ${formatMemoryBytes(localModelResourcePolicy.projectedFreeMemoryBytes)}${
                localModelResourcePolicy.projectedFreeMemoryRatio !== undefined ? ` (${formatRatioPercent(localModelResourcePolicy.projectedFreeMemoryRatio)})` : ""
              }`
            : undefined,
          localModelResourcePolicy.uncertaintyReasons?.length
            ? `uncertain: ${localModelResourcePolicy.uncertaintyReasons.join(", ")}`
            : undefined,
        ].filter((label): label is string => Boolean(label))
      : [];
    const localModelResourceStatus = localModelResources
      ? [
          `${localModelResources.activeCount.toLocaleString()} active`,
          `estimated ${formatMemoryBytes(localModelResources.activeEstimatedResidentMemoryBytes)}`,
          localModelResources.activeActualResidentMemoryBytes !== undefined ? `actual ${formatMemoryBytes(localModelResources.activeActualResidentMemoryBytes)}` : undefined,
          ...localModelResourcePolicyEvidence,
        ].filter(Boolean).join(" · ")
      : "Check status to sample active local model processes.";
    const updateLocalModelResourceSettings = (patch: Partial<DesktopState["settings"]["localDeepResearch"]["localModelResources"]>) => {
      onLocalDeepResearchSettingsChange({
        ...state.settings.localDeepResearch,
        localModelResources: {
          ...state.settings.localDeepResearch.localModelResources,
          ...patch,
          schemaVersion: "ambient-local-model-resource-settings-v1",
        },
      });
    };
    const updateLocalDeepResearchRunBudgetSettings = (patch: Partial<DesktopState["settings"]["localDeepResearch"]["runBudget"]>) => {
      onLocalDeepResearchSettingsChange({
        ...state.settings.localDeepResearch,
        runBudget: {
          ...state.settings.localDeepResearch.runBudget,
          ...patch,
          schemaVersion: "ambient-local-deep-research-run-budget-v1",
        },
      });
    };
    const localDeepResearchQ8 = localDeepResearchSetupModel?.q8Override;
    const localDeepResearchProgress = localDeepResearchSetup.progress
      ? localDeepResearchInstallProgressModel(localDeepResearchSetup.progress)
      : undefined;
    const localDeepResearchRuns = localDeepResearchRunHistory.result?.entries ?? [];
    const searchWebPreference = state.settings.search.webSearch;
    const webResearchStack = webResearchStackWithDefaults(state.settings.search.webResearch);
    const webResearchSearchProviders = webResearchProvidersForRole(webResearchStack, "search");
    const webResearchFetchProviders = webResearchProvidersForRole(webResearchStack, "fetch");
    const webResearchSearchStatus = webResearchSearchProviders.map((provider) => provider.label).join(" → ");
    const webResearchFetchStatus = webResearchFetchProviders.map((provider) => provider.label).join(" → ");
    const searchRoutingStatus = searchWebPreference ? `${formatTaskState(searchWebPreference.mode)} ${searchWebPreference.preferredProvider}` : "Default routing";
    const searchRoutingDetail = searchWebPreference
      ? [
          `Provider ${searchWebPreference.preferredProvider}`,
          `mode ${searchWebPreference.mode}`,
          `fallback ${searchWebPreference.fallback}`,
          searchWebPreference.updatedAt ? `updated ${formatTimelineTime(searchWebPreference.updatedAt)}` : undefined,
        ].filter(Boolean).join(" · ")
      : "No preferred web search provider is stored. Pi will use installed-provider status and normal browser/search routing.";
    const mcpRuntimeSettingsTone = mcpContainerRuntimeTone(mcpPane.containerRuntimeStatus?.status);
    const mcpRuntimeSettingsLabel = mcpContainerRuntimeStatusLabel(mcpPane.containerRuntimeStatus?.status);
    const mcpRuntimeSettingsDiagnosticsAction = mcpContainerRuntimeDiagnosticsActionState(mcpPane.containerRuntimeStatus, {
      error: mcpPane.containerRuntimeError,
      busy: diagnosticsPane.diagnosticBusy,
    });
    const mcpContainerRuntimeInstallProgressStatusView = mcpContainerRuntimeInstallProgressStatus(mcpContainerRuntimeInstallProgress);
    const mcpDefaultCapabilityInstallProgressStatusView = mcpDefaultCapabilityInstallProgressStatus(mcpDefaultCapabilityInstallProgress);
    const mcpRuntimeSettingsSetupResume = mcpContainerRuntimeSetupResumeRows(mcpPane.containerRuntimeStatus);
    const mcpDefaultWebResearchCapability = mcpPane.containerRuntimeStatus?.defaultCapabilities.find((capability) => capability.capabilityId === "scrapling");
    const mcpDefaultWebResearchAction = mcpDefaultCapabilityInstallActionState(mcpDefaultWebResearchCapability, {
      runtimeReady: mcpPane.containerRuntimeStatus?.status === "ready",
      busyKey: mcpPane.serverBusy,
    });
    const mcpInstalledScraplingServer = mcpPane.installedServers.find(
      (server) => server.workloadName === "ambient-scrapling" || server.serverId.toLowerCase().includes("scrapling"),
    );
    const mcpRuntimeSettingsStatus =
      mcpPane.containerRuntimeError
        ? "Needs attention"
        : mcpPane.containerRuntimeStatus?.status === "ready" && mcpDefaultWebResearchCapability?.status === "installed"
          ? "Ready"
          : mcpPane.containerRuntimeStatus?.status === "ready"
            ? "Runtime ready"
            : mcpRuntimeSettingsLabel;
    function runWebResearchProviderSetupAction(action: WebResearchProviderSetupAction) {
      if (!action || action.disabled) return;
      if (action.kind === "install-scrapling") {
        if (mcpDefaultWebResearchCapability?.capabilityId === "scrapling") {
          void mcpPane.installDefaultCapability(mcpDefaultWebResearchCapability.capabilityId);
        }
        return;
      }
      if (action.kind === "configure-ambient-cli-secret") {
        onOpenAmbientCliSecretDialog({
          packageId: action.packageId,
          packageName: action.packageName,
          envName: action.envName,
        });
        return;
      }
      onOpenMcpRuntimeSettings();
    }
    const voiceSetupHasIssue = Boolean(
      voiceProviderCacheStatus.error ||
        voiceProvidersError ||
        voiceSetupHealth.some((item) => item.tone === "error" || item.tone === "warning") ||
        voiceProviderModel.diagnostics?.statusTone === "error",
    );
    const speechDiagnosticsHasIssue = Boolean(
        sttProviderCacheStatus.error ||
        sttProvidersError ||
        sttProviderSetup.status === "error" ||
        sttProviderModel.diagnostics?.statusTone === "error" ||
        sttProviderModel.validation?.statusTone === "error" ||
        sttDiagnosticRows.some((diagnostic) => diagnostic.statusTone === "error" || diagnostic.statusTone === "warning"),
    );
    const subagentsFeatureFlag = state.featureFlagSnapshot?.flags["ambient.subagents"];
    const persistentSubagentsEnabled = Boolean(state.settings.featureFlags?.subagents);
    const subagentsEffectiveEnabled = Boolean(subagentsFeatureFlag?.enabled);
    const subagentsFlagValue = subagentsEffectiveEnabled
      ? persistentSubagentsEnabled
        ? "Enabled"
        : "Session override"
      : subagentsFeatureFlag?.source === "startup_arg_disable"
        ? "Forced off"
        : "Off";
    const subagentsFlagDescription = subagentsFeatureFlag?.source === "startup_arg_disable"
      ? "A startup argument is forcing sub-agents off for this app session."
      : "Enables the hidden child-thread and model-runtime foundation for dogfood builds. Keep this off for normal single-thread runs.";
    const slashCommandsFeatureFlag = state.featureFlagSnapshot?.flags["ambient.slashCommands"];
    const persistentSlashCommandsEnabled = Boolean(state.settings.featureFlags?.slashCommands);
    const slashCommandsEffectiveEnabled = Boolean(slashCommandsFeatureFlag?.enabled);
    const slashCommandsFlagValue = slashCommandsEffectiveEnabled
      ? persistentSlashCommandsEnabled
        ? "Enabled"
        : "Session override"
      : slashCommandsFeatureFlag?.source === "startup_arg_disable"
        ? "Forced off"
        : "Off";
    const slashCommandsFlagDescription = slashCommandsFeatureFlag?.source === "startup_arg_disable"
      ? "A startup argument is forcing slash-command skills and workflows off for this app session."
      : "Enables the composer slash picker for Codex skills, Ambient CLI capabilities, recorded workflows, Symphony recipes, and callable workflows.";
    const memoryFeatureFlag = state.featureFlagSnapshot?.flags["ambient.memory.tencentdb"];
    const persistentMemoryFeatureEnabled = Boolean(state.settings.featureFlags?.tencentDbMemory);
    const memoryEffectiveEnabled = Boolean(memoryFeatureFlag?.enabled);
    const memoryFlagValue = memoryEffectiveEnabled
      ? persistentMemoryFeatureEnabled
        ? "Enabled"
        : "Session override"
      : memoryFeatureFlag?.source === "startup_arg_disable"
        ? "Forced off"
        : "Off";
    const memoryFlagDescription = memoryFeatureFlag?.source === "startup_arg_disable"
      ? "A startup argument is forcing Tencent memory off for this app session."
      : "Internal rollout gate for TencentDB Agent Memory. Use the Agent Memory starter to configure memory, embeddings, and thread scope together.";
    const activeThread = state.threads.find((thread) => thread.id === state.activeThreadId);
    const subagentMaturity = state.subagentMaturity;
    const subagentMaturityEvidence = state.subagentMaturityEvidence;
    const subagentMaturityLiveHistory = subagentMaturityLiveHistoryModel(subagentMaturity);
    const subagentMaturityDesktopDogfoodHistory = subagentMaturityDesktopDogfoodHistoryModel(subagentMaturity);
    const subagentMaturityWorkflowJitterReleaseProfile = subagentMaturityWorkflowJitterReleaseProfileModel(subagentMaturity);
    const subagentMaturityValue = subagentMaturity.defaultCanBeEnabled
      ? "Ready to graduate"
      : `${subagentMaturity.blockedGateIds.length} gate${subagentMaturity.blockedGateIds.length === 1 ? "" : "s"} blocked`;
    const subagentMaturitySearchTerms = [
      subagentMaturity.status,
      subagentMaturity.summary,
      subagentMaturity.blockedGateIds.join(" "),
      subagentMaturity.warningGateIds.join(" "),
      subagentMaturityLiveHistory.searchText,
      subagentMaturityDesktopDogfoodHistory.searchText,
      subagentMaturityWorkflowJitterReleaseProfile.searchText,
      subagentMaturity.gates.map((gate) => `${gate.id} ${gate.label} ${gate.status} ${gate.actual} ${gate.required} ${gate.detail ?? ""}`).join(" "),
      subagentMaturityEvidence.map((item) => `${item.kind} ${item.status} ${item.evidenceKey ?? ""} ${item.runId ?? ""} ${item.artifactPath ?? ""} ${item.notes ?? ""}`).join(" "),
    ];
    const subagentRepairDiagnostics = subagentRepairDiagnosticsModel(state.subagentRepairDiagnostics);
    const subagentRepairDiagnosticsValue = subagentRepairDiagnostics?.statusLabel ?? "Unavailable";
    const modelCatalogSettings = modelRuntimeCatalogSettingsModel(
      state.settings.modelCatalog,
      state.settings.model,
      localDeepResearchSetup.result?.localRuntimeInventory,
    );
    const settingsSections = rightPanelSettingsSections({
      appIsPackaged: state.app.isPackaged,
      voiceStatusLabel: voiceProviderModel.statusLabel,
      collaborationMode: state.settings.collaborationMode,
      localModelsSummary: modelCatalogSettings.localModelsSummary,
      speechStatusLabel: sttProviderModel.statusLabel,
      searchWebStatus: webResearchSearchProviders[0]?.label ?? (searchWebPreference ? "Preferred" : "Default"),
      mcpRuntimeStatus: mcpRuntimeSettingsStatus,
      visualCatalogCount: visualCatalogCards.length,
      authoredVideoCatalogCount: authoredVideoCatalogCards.length,
      writingStyleCatalogCount: writingStyleCatalogCards.length,
      activePermissionGrantCount: grantRegistry.activeCount,
      diagnosticStatusKind: diagnosticsPane.diagnosticStatus?.kind,
      appVersion: state.app.version,
    });
    const settingsSectionSearchTerms = rightPanelSettingsSectionSearchTerms({
      modelCatalogSearchText: modelCatalogSettings.searchText,
    });
    const settingsSearchTargets = rightPanelSettingsSearchTargets({
      state,
      voiceProviderModel,
      voiceProviderLabelMode,
      voiceSetupHealth,
      voiceCatalogCards,
      voiceArtifactRetentionError: settingsPane.voiceArtifactRetentionError,
      modelCatalogSettings,
      subagentsEffectiveEnabled,
      sttProviderModel,
      sttCatalogCards,
      selectedSttMicrophoneLabel,
      sttMicrophoneSettingsValue,
      sttMicrophoneDevicesError,
      sttMicTestMessage: sttMicTest.message,
      sttMicTestStatus: sttMicTest.status,
      sttShortcutDisplayLabel,
      sttDiagnosticRows,
      webResearchSearchStatus,
      webResearchFetchStatus,
      searchRoutingStatus,
      searchRoutingDetail,
      searchCatalogCards,
      localDeepResearch: {
        setupMessage: localDeepResearchSetup.message,
        setupStatusLabel: localDeepResearchSetupModel?.statusLabel,
        progressTitle: localDeepResearchProgress?.title,
        progressDetail: localDeepResearchProgress?.detail,
        q8Label: localDeepResearchQ8?.label,
        runBudgetLabel: localDeepResearchEffortLabel(state.settings.localDeepResearch.runBudget.defaultEffort),
        runBudgetToolCalls: localDeepResearchMaxToolCallsForEffort(
          state.settings.localDeepResearch.runBudget.defaultEffort,
          state.settings.localDeepResearch.runBudget.customMaxToolCalls,
        ),
        runBudgetOnExhausted: state.settings.localDeepResearch.runBudget.onExhausted,
        runHistoryMessage: localDeepResearchRunHistory.message,
        runs: localDeepResearchRuns,
        diagnostics: localDeepResearchDiagnostics,
      },
      mcpRuntime: {
        label: mcpRuntimeSettingsLabel,
        statusMessage: mcpPane.containerRuntimeStatus?.message,
        error: mcpPane.containerRuntimeError,
        checkedAt: mcpPane.containerRuntimeStatus?.checkedAt,
        defaultWebResearchCapability: mcpDefaultWebResearchCapability,
        installedServers: mcpPane.installedServers,
      },
      miniCpmVisionSetupMessage: miniCpmVisionSetup.message,
      miniCpmVisionDiagnostics,
      visualCatalogCards,
      authoredVideoCatalogCards,
      writingStyleCatalogCards,
      googleGrantGroups: googleGrantReview.groups,
      grantRegistrySummary: grantRegistry.summary,
      permissionAuditError,
      diagnostics: {
        diagnosticStatusKind: diagnosticsPane.diagnosticStatus?.kind,
        diagnosticStatusMessage: diagnosticsPane.diagnosticStatus?.message,
        diagnosticExportHistorySearchText: diagnosticsPane.diagnosticExportHistory?.searchText,
        subagentMaturitySearchTerms,
        subagentRepairSearchText: subagentRepairDiagnostics?.searchText,
        subagentReplaySearchText: diagnosticsPane.subagentReplayEvidence?.searchText,
        localRuntimeEvidenceSearchText: diagnosticsPane.localRuntimeEvidence?.searchText,
      },
    });
    const settingsSearchModel = rightPanelSettingsSearchModel({
      query: settingsPane.settingsSearchQuery,
      sections: settingsSections,
      sectionSearchTerms: settingsSectionSearchTerms,
      targets: settingsSearchTargets,
    });
    const settingsSearchActive = settingsSearchModel.searchActive;
    const visibleSettingsSearchResultCount = settingsSearchModel.visibleSearchResultCount;
    const visibleSettingsSections = settingsSearchModel.visibleSections;
    const settingsSectionVisible = settingsSearchModel.sectionVisible;
    const settingsRowVisible = settingsSearchModel.rowVisible;
  return (
      <SettingsShell
        sections={visibleSettingsSections}
        searchQuery={settingsPane.settingsSearchQuery}
        searchResultCount={settingsSearchActive ? visibleSettingsSearchResultCount : undefined}
        onSearchQueryChange={settingsPane.setSettingsSearchQuery}
      >
        {settingsSearchActive && visibleSettingsSearchResultCount === 0 && (
          <div className="settings-empty-state">
            <strong>No settings found</strong>
            <span>Try searching for provider, speech, voice, permission, API key, or diagnostics.</span>
          </div>
        )}
        {settingsSectionVisible("overview") && (
          <RightPanelOverviewSettingsSection
            state={state}
            running={running}
            settingsRowVisible={settingsRowVisible}
            updateBusy={updateBusy}
            firstRunCapabilityOnboardingDismissed={settingsPane.firstRunCapabilityOnboardingDismissed}
            firstRunCapabilityOnboardingStarting={settingsPane.firstRunCapabilityOnboardingStarting}
            onCheckUpdates={onCheckUpdates}
            onThemePreferenceChange={onThemePreferenceChange}
            startFirstRunCapabilityOnboarding={settingsPane.startFirstRunCapabilityOnboarding}
            dismissFirstRunCapabilityOnboarding={settingsPane.dismissFirstRunCapabilityOnboarding}
            startRemoteSurfaceActivation={settingsPane.startRemoteSurfaceActivation}
          />
        )}
        {settingsSectionVisible("voice") && (
          <RightPanelVoiceSettingsSection
            state={state}
            running={running}
            settingsRowVisible={settingsRowVisible}
            focusedSettingsSection={settingsPane.focusedSettingsSection}
            voiceSettingsRowRef={settingsPane.voiceSettingsRowRef}
            voiceProviderModel={voiceProviderModel}
            voiceProviders={voiceProviders}
            voiceProvidersLoading={voiceProvidersLoading}
            voiceProvidersError={voiceProvidersError}
            voiceProviderCacheStatus={voiceProviderCacheStatus}
            voiceProviderCacheActivity={voiceProviderCacheActivity}
            voiceProviderLabelMode={voiceProviderLabelMode}
            selectedVoiceProvider={selectedVoiceProvider}
            selectedVoiceOptions={selectedVoiceOptions}
            filteredSelectedVoiceOptions={filteredSelectedVoiceOptions}
            displayedSelectedVoiceOptions={displayedSelectedVoiceOptions}
            selectedVoiceSearch={selectedVoiceSearch}
            voiceSearchQuery={settingsPane.voiceSearchQuery}
            setVoiceSearchQuery={settingsPane.setVoiceSearchQuery}
            selectedVoice={selectedVoice}
            selectedPreferredVoice={selectedPreferredVoice}
            selectedPreferredVoiceId={selectedPreferredVoiceId}
            selectedVoiceCatalog={selectedVoiceCatalog}
            selectedVoiceCatalogRefresh={selectedVoiceCatalogRefresh}
            voiceCatalogCards={voiceCatalogCards}
            voiceSetupHealth={voiceSetupHealth}
            voiceSetupHasIssue={voiceSetupHasIssue}
            voiceAuditRows={voiceAuditRows}
            voiceArtifactRetention={settingsPane.voiceArtifactRetention}
            voiceArtifactRetentionLoading={settingsPane.voiceArtifactRetentionLoading}
            voiceArtifactRetentionError={settingsPane.voiceArtifactRetentionError}
            voiceArtifactPruning={settingsPane.voiceArtifactPruning}
            onLoadVoiceProviders={onLoadVoiceProviders}
            startVoiceProviderOnboarding={settingsPane.startVoiceProviderOnboarding}
            startProviderCatalogCardOnboarding={settingsPane.startProviderCatalogCardOnboarding}
            onVoiceSettingsChange={onVoiceSettingsChange}
            onRefreshVoiceCatalog={onRefreshVoiceCatalog}
            loadVoiceArtifactRetention={settingsPane.loadVoiceArtifactRetention}
            pruneVoiceArtifactRetention={settingsPane.pruneVoiceArtifactRetention}
          />
        )}
        {settingsSectionVisible("model-mode") && (
          <RightPanelModelModeSettingsSection
            state={state}
            settingsRowVisible={settingsRowVisible}
            modelCatalogSettings={modelCatalogSettings}
            modelProviderInstallDraft={settingsPane.modelProviderInstallDraft}
            modelProviderCredentialValue={settingsPane.modelProviderCredentialValue}
            modelProviderCredentialSave={settingsPane.modelProviderCredentialSave}
            modelProviderCredentialBusy={settingsPane.modelProviderCredentialBusy}
            modelProviderCredentialStatus={settingsPane.modelProviderCredentialStatus}
            modelProviderInstallBusy={settingsPane.modelProviderInstallBusy}
            modelProviderInstallStatus={settingsPane.modelProviderInstallStatus}
            subagentsFlagValue={subagentsFlagValue}
            subagentsFlagDescription={subagentsFlagDescription}
            persistentSubagentsEnabled={persistentSubagentsEnabled}
            slashCommandsFlagValue={slashCommandsFlagValue}
            slashCommandsFlagDescription={slashCommandsFlagDescription}
            persistentSlashCommandsEnabled={persistentSlashCommandsEnabled}
            memoryFlagValue={memoryFlagValue}
            memoryFlagDescription={memoryFlagDescription}
            persistentMemoryFeatureEnabled={persistentMemoryFeatureEnabled}
            activeThreadMemoryEnabled={Boolean(activeThread?.memoryEnabled)}
            activeThreadMemoryToggleDisabled={!activeThread}
            agentMemoryDiagnostics={agentMemoryDiagnostics}
            agentMemoryDiagnosticsLoading={agentMemoryDiagnosticsLoading}
            agentMemoryDiagnosticsError={agentMemoryDiagnosticsError}
            agentMemoryEmbeddingActionLoading={agentMemoryEmbeddingActionLoading}
            agentMemoryEmbeddingActionResult={agentMemoryEmbeddingActionResult}
            agentMemoryEmbeddingActionError={agentMemoryEmbeddingActionError}
            agentMemoryStarterStatus={settingsPane.agentMemoryStarterStatus}
            agentMemoryStarterLoading={settingsPane.agentMemoryStarterLoading}
            agentMemoryStarterError={settingsPane.agentMemoryStarterError}
            agentMemoryStarterOperationLoading={settingsPane.agentMemoryStarterOperationLoading}
            agentMemoryStarterOperationResult={settingsPane.agentMemoryStarterOperationResult}
            subagentMaturity={subagentMaturity}
            subagentMaturityEvidence={subagentMaturityEvidence}
            setModelProviderInstallDraft={settingsPane.setModelProviderInstallDraft}
            setModelProviderCredentialValue={settingsPane.setModelProviderCredentialValue}
            saveModelProviderCredentialFromSettings={settingsPane.saveModelProviderCredentialFromSettings}
            installModelProviderEndpointFromSettings={settingsPane.installModelProviderEndpointFromSettings}
            loadAgentMemoryStarterStatus={settingsPane.loadAgentMemoryStarterStatus}
            enableAgentMemoryStarterFromSettings={settingsPane.enableAgentMemoryStarterFromSettings}
            repairAgentMemoryStarterFromSettings={settingsPane.repairAgentMemoryStarterFromSettings}
            disableAgentMemoryStarterFromSettings={settingsPane.disableAgentMemoryStarterFromSettings}
            onThinkingDisplaySettingsChange={onThinkingDisplaySettingsChange}
            onFeatureFlagSettingsChange={onFeatureFlagSettingsChange}
            onMemorySettingsChange={onMemorySettingsChange}
            onActiveThreadMemoryEnabledChange={onActiveThreadMemoryEnabledChange}
            onRefreshAgentMemoryDiagnostics={onRefreshAgentMemoryDiagnostics}
            onRunAgentMemoryEmbeddingLifecycleAction={onRunAgentMemoryEmbeddingLifecycleAction}
            onClearAgentMemory={onClearAgentMemory}
            onModelRuntimeSettingsChange={onModelRuntimeSettingsChange}
            onPlannerSettingsChange={onPlannerSettingsChange}
          />
        )}
        {settingsSectionVisible("local-models") && (
          <RightPanelLocalModelsSettingsSection
            settingsRowVisible={settingsRowVisible}
            modelCatalogSettings={modelCatalogSettings}
            subagentsEffectiveEnabled={subagentsEffectiveEnabled}
            localRuntimeLifecycleBusyId={settingsPane.localRuntimeLifecycleBusyId}
            localRuntimeLifecycleStatus={settingsPane.localRuntimeLifecycleStatus}
            runLocalRuntimeLifecycleActionFromSettings={settingsPane.runLocalRuntimeLifecycleActionFromSettings}
          />
        )}
        {settingsSectionVisible("speech") && (
          <RightPanelSpeechSettingsSection
            state={state}
            running={running}
            settingsRowVisible={settingsRowVisible}
            sttProviderModel={sttProviderModel}
            sttProviders={sttProviders}
            sttProvidersLoading={sttProvidersLoading}
            sttProvidersError={sttProvidersError}
            sttProviderCacheStatus={sttProviderCacheStatus}
            sttProviderCacheActivity={sttProviderCacheActivity}
            sttProviderSetup={sttProviderSetup}
            sttSetupModel={sttSetupModel}
            sttCatalogCards={sttCatalogCards}
            selectedSttProvider={selectedSttProvider}
            sttMicrophoneDevices={sttMicrophoneDevices}
            selectedSttMicrophoneId={selectedSttMicrophoneId}
            selectedSttMicrophoneMissing={selectedSttMicrophoneMissing}
            sttMicrophoneSettingsValue={sttMicrophoneSettingsValue}
            sttMicrophoneDevicesLoading={sttMicrophoneDevicesLoading}
            sttMicrophoneDevicesError={sttMicrophoneDevicesError}
            sttMicTest={sttMicTest}
            sttMicTestRecording={sttMicTestRecording}
            sttMicTestBusy={sttMicTestBusy}
            sttMicTestDisabled={sttMicTestDisabled}
            sttShortcutDisplayLabel={sttShortcutDisplayLabel}
            sttShortcutCapture={settingsPane.sttShortcutCapture}
            setSttShortcutCapture={settingsPane.setSttShortcutCapture}
            sttDiagnosticRows={sttDiagnosticRows}
            speechDiagnosticsHasIssue={speechDiagnosticsHasIssue}
            startProviderCatalogCardOnboarding={settingsPane.startProviderCatalogCardOnboarding}
            onLoadSttProviders={onLoadSttProviders}
            onSetupSttProvider={onSetupSttProvider}
            onSttSettingsChange={onSttSettingsChange}
            onLoadSttMicrophoneDevices={onLoadSttMicrophoneDevices}
            onStopSttMicTest={onStopSttMicTest}
            onCancelSttMicTest={onCancelSttMicTest}
            onStartSttMicTest={onStartSttMicTest}
          />
        )}
        {settingsSectionVisible("search-web") && (
          <RightPanelSearchWebSettingsSection
            state={state}
            running={running}
            settingsRowVisible={settingsRowVisible}
            focusedSettingsSection={settingsPane.focusedSettingsSection}
            searchWebSettingsRowRef={settingsPane.searchWebSettingsRowRef}
            searchRoutingHydrating={searchRoutingHydrating}
            searchRoutingHydrationError={searchRoutingHydrationError}
            webResearchStack={webResearchStack}
            webResearchSearchProviders={webResearchSearchProviders}
            webResearchFetchProviders={webResearchFetchProviders}
            webResearchSearchStatus={webResearchSearchStatus}
            webResearchFetchStatus={webResearchFetchStatus}
            mcpDefaultWebResearchCapability={mcpDefaultWebResearchCapability}
            mcpContainerRuntimeStatus={mcpPane.containerRuntimeStatus}
            mcpServerBusy={mcpPane.serverBusy}
            localDeepResearchSetup={localDeepResearchSetup}
            localDeepResearchSetupModel={localDeepResearchSetupModel}
            localDeepResearchActions={localDeepResearchActions}
            localDeepResearchQ8Override={localDeepResearchQ8Override}
            localDeepResearchQ8={localDeepResearchQ8}
            localModelMemoryPolicySummary={localModelMemoryPolicySummary}
            localModelResourceStatus={localModelResourceStatus}
            localModelResourcePolicy={localModelResourcePolicy}
            localModelMemoryLimitGiB={localModelMemoryLimitGiB}
            localModelResourceSettings={localModelResourceSettings}
            localDeepResearchProgress={localDeepResearchProgress}
            localDeepResearchDiagnostics={localDeepResearchDiagnostics}
            localDeepResearchRunHistory={localDeepResearchRunHistory}
            localDeepResearchRuns={localDeepResearchRuns}
            searchRoutingStatus={searchRoutingStatus}
            searchRoutingDetail={searchRoutingDetail}
            searchCatalogCards={searchCatalogCards}
            onHydrateSearchRoutingSettings={onHydrateSearchRoutingSettings}
            onSearchRoutingSettingsChange={onSearchRoutingSettingsChange}
            runWebResearchProviderSetupAction={runWebResearchProviderSetupAction}
            onSetupLocalDeepResearch={onSetupLocalDeepResearch}
            onLocalDeepResearchQ8OverrideChange={onLocalDeepResearchQ8OverrideChange}
            updateLocalModelResourceSettings={updateLocalModelResourceSettings}
            updateLocalDeepResearchRunBudgetSettings={updateLocalDeepResearchRunBudgetSettings}
            onLoadLocalDeepResearchRunHistory={onLoadLocalDeepResearchRunHistory}
            startProviderCatalogCardOnboarding={settingsPane.startProviderCatalogCardOnboarding}
          />
        )}
        {settingsSectionVisible("mcp-runtime") && (
          <RightPanelMcpRuntimeSettingsSection
            settingsRowVisible={settingsRowVisible}
            focusedSettingsSection={settingsPane.focusedSettingsSection}
            mcpRuntimeSettingsRowRef={settingsPane.mcpRuntimeSettingsRowRef}
            mcpRuntimeSettingsTone={mcpRuntimeSettingsTone}
            mcpRuntimeSettingsStatus={mcpRuntimeSettingsStatus}
            mcpRuntimeSettingsLabel={mcpRuntimeSettingsLabel}
            mcpContainerRuntimeBusy={mcpPane.containerRuntimeBusy}
            refreshMcpContainerRuntimeStatus={mcpPane.refreshContainerRuntimeStatus}
            setMcpContainerRuntimeModalOpen={mcpPane.setContainerRuntimeModalOpen}
            mcpContainerRuntimeStatus={mcpPane.containerRuntimeStatus}
            mcpContainerRuntimeLaunchBusy={mcpPane.containerRuntimeLaunchBusy}
            launchMcpContainerRuntimeInstaller={mcpPane.launchContainerRuntimeInstaller}
            mcpContainerRuntimeInstallBusyLabel={mcpContainerRuntimeInstallBusyLabel}
            mcpContainerRuntimeError={mcpPane.containerRuntimeError}
            mcpContainerRuntimeInstallProgressStatusView={mcpContainerRuntimeInstallProgressStatusView}
            mcpContainerRuntimeActionStatus={mcpPane.containerRuntimeActionStatus}
            mcpDefaultWebResearchCapability={mcpDefaultWebResearchCapability}
            mcpDefaultWebResearchAction={mcpDefaultWebResearchAction}
            installMcpDefaultCapability={mcpPane.installDefaultCapability}
            mcpDefaultCapabilityInstallProgressStatusView={mcpDefaultCapabilityInstallProgressStatusView}
            mcpInstalledScraplingServer={mcpInstalledScraplingServer}
            mcpRuntimeSettingsDiagnosticsAction={mcpRuntimeSettingsDiagnosticsAction}
            diagnosticBusy={diagnosticsPane.diagnosticBusy}
            exportDiagnostics={diagnosticsPane.exportDiagnostics}
            diagnosticStatus={diagnosticsPane.diagnosticStatus}
            mcpRuntimeSettingsSetupResume={mcpRuntimeSettingsSetupResume}
            onOpenMcpPlugins={onOpenMcpPlugins}
            mcpInstalledServers={mcpPane.installedServers}
            managedDevServers={mcpPane.managedDevServers}
          />
        )}
        {settingsSectionVisible("media-browser") && (
          <RightPanelMediaSettingsSection
            state={state}
            running={running}
            settingsRowVisible={settingsRowVisible}
            miniCpmVisionSetup={miniCpmVisionSetup}
            miniCpmVisionSetupModel={miniCpmVisionSetupModel}
            miniCpmVisionRuntimePath={miniCpmVisionRuntimePath}
            miniCpmVisionEndpointUrl={miniCpmVisionEndpointUrl}
            miniCpmVisionActions={miniCpmVisionActions}
            miniCpmVisionDiagnostics={miniCpmVisionDiagnostics}
            visualCatalogCards={visualCatalogCards}
            authoredVideoCatalogCards={authoredVideoCatalogCards}
            onMiniCpmVisionRuntimePathChange={onMiniCpmVisionRuntimePathChange}
            onMiniCpmVisionEndpointUrlChange={onMiniCpmVisionEndpointUrlChange}
            onSetupMiniCpmVisionProvider={onSetupMiniCpmVisionProvider}
            startProviderCatalogCardOnboarding={settingsPane.startProviderCatalogCardOnboarding}
            onMediaPlaybackSettingsChange={onMediaPlaybackSettingsChange}
          />
        )}
        {settingsSectionVisible("writing-style") && (
          <RightPanelWritingStyleSettingsSection
            state={state}
            running={running}
            settingsRowVisible={settingsRowVisible}
            writingStyleCatalogCards={writingStyleCatalogCards}
            startProviderCatalogCardOnboarding={settingsPane.startProviderCatalogCardOnboarding}
          />
        )}
        {settingsSectionVisible("security-access") && (
          <RightPanelSecuritySettingsSection
            state={state}
            settingsRowVisible={settingsRowVisible}
            grantRegistry={grantRegistry}
            sandboxFallbackAuditCount={sandboxFallbackAuditCount}
            permissionGrantError={permissionGrantError}
            googleGrantReview={googleGrantReview}
            permissionGrantRevoking={permissionGrantRevoking}
            googleGrantBusy={googleGrantBusy}
            permissionAuditFilter={settingsPane.permissionAuditFilter}
            setPermissionAuditFilter={settingsPane.setPermissionAuditFilter}
            permissionAuditError={permissionAuditError}
            visiblePermissionAudit={visiblePermissionAudit}
            permissionAudit={permissionAudit}
            PermissionFullAccessReceiptList={PermissionFullAccessReceiptList}
            onOpenApiKey={onOpenApiKey}
            onOpenPluginCapabilities={onOpenPluginCapabilities}
            onLoadPermissionGrants={onLoadPermissionGrants}
            onRevokePermissionGrantIds={onRevokePermissionGrantIds}
            onRevokePermissionGrant={onRevokePermissionGrant}
            onLoadPermissionAudit={onLoadPermissionAudit}
          />
        )}
        {settingsSectionVisible("diagnostics") && (
          <RightPanelDiagnosticsSettingsSection
            settingsRowVisible={settingsRowVisible}
            diagnosticStatus={diagnosticsPane.diagnosticStatus}
            diagnosticBusy={diagnosticsPane.diagnosticBusy}
            diagnosticExportHistory={diagnosticsPane.diagnosticExportHistory}
            selectDiagnosticExportHistoryEntry={diagnosticsPane.selectDiagnosticExportHistoryEntry}
            subagentReplayEvidence={diagnosticsPane.subagentReplayEvidence}
            subagentReplayEvidenceValue={diagnosticsPane.subagentReplayEvidenceValue}
            localRuntimeEvidence={diagnosticsPane.localRuntimeEvidence}
            localRuntimeEvidenceValue={diagnosticsPane.localRuntimeEvidenceValue}
            subagentMaturityValue={subagentMaturityValue}
            subagentMaturity={subagentMaturity}
            subagentMaturityEvidence={subagentMaturityEvidence}
            subagentRepairDiagnostics={subagentRepairDiagnostics}
            subagentRepairDiagnosticsValue={subagentRepairDiagnosticsValue}
            importDiagnostics={diagnosticsPane.importDiagnostics}
            exportDiagnostics={diagnosticsPane.exportDiagnostics}
          />
        )}
        {settingsSectionVisible("about") && (
          <RightPanelAboutSettingsSection
            state={state}
            settingsRowVisible={settingsRowVisible}
          />
        )}
              </SettingsShell>
            );
}
