import { useEffect, useRef, useState } from "react";

import type { ProviderCatalogSettingsCard } from "../../shared/desktopTypes";
import type { VoiceArtifactRetentionSummary, VoiceOnboardingHostFacts } from "../../shared/localRuntimeTypes";
import type { CapabilityBuilderPromptResult } from "./AppCapabilityPromptActions";
import {
  buildFirstRunCapabilityOnboardingPrompt,
  buildProviderCatalogCardOnboardingPrompt,
  buildRemoteSurfaceActivationPrompt,
  buildVoiceProviderCapabilityPrompt,
  providerCatalogSettingsCardsForArea,
} from "./pluginUiModel";

const FIRST_RUN_CAPABILITY_ONBOARDING_DISMISSED_KEY = "ambient.firstRunCapabilityOnboarding.dismissed.v1";

export type SettingsFocusSection = "voice" | "mcp-runtime" | "search-web";

export type SettingsFocusRequest = {
  section?: SettingsFocusSection;
  nonce: number;
};

export type SettingsMcpController = {
  refreshContainerRuntimeStatus: (force?: boolean, options?: { continueDefaultCapabilitySetup?: boolean }) => Promise<void>;
  loadInstalledServers: () => Promise<void>;
  loadManagedDevServers: () => Promise<void>;
};

type FirstRunCapabilityOnboardingStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

type UseRightPanelSettingsVoiceFocusControllerInput = {
  panel: string;
  running: boolean;
  activeThreadId: string;
  activeWorkspacePath: string;
  workspacePath: string;
  permissionAuditRevision: number;
  voiceProviderCapabilityId?: string;
  providerCatalogCards: ProviderCatalogSettingsCard[];
  settingsFocusRequest?: SettingsFocusRequest;
  mcp: SettingsMcpController;
  onLoadPermissionAudit: () => Promise<void>;
  onLoadPermissionGrants: () => Promise<void>;
  onLoadVoiceProviders: (trigger?: string) => Promise<void>;
  onStartCapabilityBuilder: (prompt: string, newChat: boolean, activityLine?: string) => Promise<CapabilityBuilderPromptResult>;
  onHydrateSearchRoutingSettings: () => void;
};

export function readFirstRunCapabilityOnboardingDismissed(
  storage: Pick<FirstRunCapabilityOnboardingStorage, "getItem"> = window.localStorage,
): boolean {
  try {
    return storage.getItem(FIRST_RUN_CAPABILITY_ONBOARDING_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeFirstRunCapabilityOnboardingDismissed(
  dismissed: boolean,
  storage: Pick<FirstRunCapabilityOnboardingStorage, "removeItem" | "setItem"> = window.localStorage,
): void {
  try {
    if (dismissed) {
      storage.setItem(FIRST_RUN_CAPABILITY_ONBOARDING_DISMISSED_KEY, "1");
      return;
    }
    storage.removeItem(FIRST_RUN_CAPABILITY_ONBOARDING_DISMISSED_KEY);
  } catch {
    // localStorage is best-effort; in-memory state still reflects the user's action.
  }
}

export function useRightPanelSettingsVoiceFocusController({
  panel,
  running,
  activeThreadId,
  activeWorkspacePath,
  workspacePath,
  permissionAuditRevision,
  voiceProviderCapabilityId,
  providerCatalogCards,
  settingsFocusRequest,
  mcp,
  onLoadPermissionAudit,
  onLoadPermissionGrants,
  onLoadVoiceProviders,
  onStartCapabilityBuilder,
  onHydrateSearchRoutingSettings,
}: UseRightPanelSettingsVoiceFocusControllerInput) {
  const [capabilityOnboardingDismissed, setCapabilityOnboardingDismissed] = useState(readFirstRunCapabilityOnboardingDismissed);
  const [capabilityOnboardingStarting, setCapabilityOnboardingStarting] = useState(false);
  const [voiceArtifactRetention, setVoiceArtifactRetention] = useState<VoiceArtifactRetentionSummary | undefined>();
  const [voiceArtifactRetentionLoading, setVoiceArtifactRetentionLoading] = useState(false);
  const [voiceArtifactRetentionError, setVoiceArtifactRetentionError] = useState<string | undefined>();
  const [voiceArtifactPruning, setVoiceArtifactPruning] = useState(false);
  const [voiceSearchQuery, setVoiceSearchQuery] = useState("");
  const [focusedSettingsSection, setFocusedSettingsSection] = useState<SettingsFocusSection | undefined>();
  const voiceSettingsRowRef = useRef<HTMLElement | null>(null);
  const searchWebSettingsRowRef = useRef<HTMLElement | null>(null);
  const mcpRuntimeSettingsRowRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setVoiceSearchQuery("");
  }, [voiceProviderCapabilityId]);

  async function startVoiceProviderOnboarding() {
    if (running) return;
    let hostFacts: VoiceOnboardingHostFacts | undefined;
    try {
      hostFacts = await window.ambientDesktop.getVoiceOnboardingHostFacts();
    } catch {
      hostFacts = undefined;
    }
    const voiceCatalogCards = providerCatalogSettingsCardsForArea(providerCatalogCards, "voice-generation");
    await onStartCapabilityBuilder(buildVoiceProviderCapabilityPrompt(hostFacts, voiceCatalogCards), true);
  }

  async function startProviderCatalogCardOnboarding(card: ProviderCatalogSettingsCard) {
    if (running) return;
    let hostFacts: VoiceOnboardingHostFacts | undefined;
    try {
      hostFacts = await window.ambientDesktop.getVoiceOnboardingHostFacts();
    } catch {
      hostFacts = undefined;
    }
    await onStartCapabilityBuilder(buildProviderCatalogCardOnboardingPrompt(card, hostFacts), true);
  }

  async function startRemoteSurfaceActivation(provider: "telegram" | "signal" | "choose") {
    if (running) return;
    const activityLine =
      provider === "telegram"
        ? "Remote Ambient Surface Telegram setup sent to Ambient."
        : provider === "signal"
          ? "Remote Ambient Surface Signal check sent to Ambient."
          : "Remote Ambient Surface setup sent to Ambient.";
    await onStartCapabilityBuilder(buildRemoteSurfaceActivationPrompt(provider), true, activityLine);
  }

  async function startFirstRunCapabilityOnboarding() {
    if (running) return;
    setCapabilityOnboardingStarting(true);
    let hostFacts: VoiceOnboardingHostFacts | undefined;
    try {
      hostFacts = await window.ambientDesktop.getVoiceOnboardingHostFacts();
    } catch {
      hostFacts = undefined;
    }
    try {
      await onStartCapabilityBuilder(buildFirstRunCapabilityOnboardingPrompt(hostFacts, providerCatalogCards), true);
      setCapabilityOnboardingDismissed(false);
      writeFirstRunCapabilityOnboardingDismissed(false);
    } finally {
      setCapabilityOnboardingStarting(false);
    }
  }

  function dismissFirstRunCapabilityOnboarding() {
    setCapabilityOnboardingDismissed(true);
    writeFirstRunCapabilityOnboardingDismissed(true);
  }

  function resumeFirstRunCapabilityOnboarding() {
    setCapabilityOnboardingDismissed(false);
    writeFirstRunCapabilityOnboardingDismissed(false);
  }

  async function loadVoiceArtifactRetention(providerCapabilityId = voiceProviderCapabilityId) {
    setVoiceArtifactRetentionLoading(true);
    setVoiceArtifactRetentionError(undefined);
    try {
      setVoiceArtifactRetention(
        await window.ambientDesktop.inspectVoiceArtifacts({
          threadId: activeThreadId,
          providerCapabilityId,
        }),
      );
    } catch (error) {
      setVoiceArtifactRetentionError(error instanceof Error ? error.message : String(error));
    } finally {
      setVoiceArtifactRetentionLoading(false);
    }
  }

  async function pruneVoiceArtifactRetention() {
    setVoiceArtifactPruning(true);
    setVoiceArtifactRetentionError(undefined);
    try {
      setVoiceArtifactRetention(
        await window.ambientDesktop.pruneVoiceArtifacts({
          threadId: activeThreadId,
          providerCapabilityId: voiceProviderCapabilityId,
        }),
      );
    } catch (error) {
      setVoiceArtifactRetentionError(error instanceof Error ? error.message : String(error));
    } finally {
      setVoiceArtifactPruning(false);
    }
  }

  useEffect(() => {
    if (panel === "settings") {
      void onLoadPermissionAudit();
      void onLoadPermissionGrants();
      void onLoadVoiceProviders();
      void loadVoiceArtifactRetention();
      void mcp.refreshContainerRuntimeStatus(false);
      void mcp.loadInstalledServers();
      void mcp.loadManagedDevServers();
    }
  }, [panel, workspacePath, permissionAuditRevision]);

  useEffect(() => {
    if (panel === "settings") void loadVoiceArtifactRetention();
  }, [panel, activeThreadId, voiceProviderCapabilityId]);

  useEffect(() => {
    if (panel !== "settings" || settingsFocusRequest?.section !== "voice") return;
    setFocusedSettingsSection("voice");
    void onLoadVoiceProviders();
    void loadVoiceArtifactRetention();
    const scrollTimer = window.setTimeout(() => {
      voiceSettingsRowRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 80);
    const clearTimer = window.setTimeout(() => setFocusedSettingsSection(undefined), 2400);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [panel, settingsFocusRequest?.nonce, settingsFocusRequest?.section, activeThreadId, voiceProviderCapabilityId]);

  useEffect(() => {
    if (panel !== "settings" || settingsFocusRequest?.section !== "mcp-runtime") return;
    setFocusedSettingsSection("mcp-runtime");
    void mcp.refreshContainerRuntimeStatus(true, { continueDefaultCapabilitySetup: true });
    void mcp.loadInstalledServers();
    void mcp.loadManagedDevServers();
    const scrollTimer = window.setTimeout(() => {
      mcpRuntimeSettingsRowRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 80);
    const clearTimer = window.setTimeout(() => setFocusedSettingsSection(undefined), 2400);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [panel, settingsFocusRequest?.nonce, settingsFocusRequest?.section, activeWorkspacePath]);

  useEffect(() => {
    if (panel !== "settings" || settingsFocusRequest?.section !== "search-web") return;
    setFocusedSettingsSection("search-web");
    void onHydrateSearchRoutingSettings();
    const scrollTimer = window.setTimeout(() => {
      searchWebSettingsRowRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 80);
    const clearTimer = window.setTimeout(() => setFocusedSettingsSection(undefined), 2400);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [panel, settingsFocusRequest?.nonce, settingsFocusRequest?.section, activeWorkspacePath]);

  useEffect(() => {
    if (panel !== "settings") return;
    onHydrateSearchRoutingSettings();
  }, [panel, workspacePath]);

  return {
    firstRunCapabilityOnboardingDismissed: capabilityOnboardingDismissed,
    firstRunCapabilityOnboardingStarting: capabilityOnboardingStarting,
    voiceArtifactRetention,
    voiceArtifactRetentionLoading,
    voiceArtifactRetentionError,
    voiceArtifactPruning,
    voiceSearchQuery,
    setVoiceSearchQuery,
    focusedSettingsSection,
    voiceSettingsRowRef,
    searchWebSettingsRowRef,
    mcpRuntimeSettingsRowRef,
    startVoiceProviderOnboarding,
    startProviderCatalogCardOnboarding,
    startRemoteSurfaceActivation,
    startFirstRunCapabilityOnboarding,
    dismissFirstRunCapabilityOnboarding,
    resumeFirstRunCapabilityOnboarding,
    loadVoiceArtifactRetention,
    pruneVoiceArtifactRetention,
  };
}
