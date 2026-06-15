import type { Dispatch, SetStateAction } from "react";

import type {
  ArtifactPreviewRequest,
  GitPanelTabRequest,
  SettingsFocusRequest,
  UtilityPanel,
} from "./RightPanel";

type OptionalPanelSetter = Dispatch<SetStateAction<UtilityPanel | undefined>>;
type OptionalArtifactPreviewSetter = Dispatch<SetStateAction<ArtifactPreviewRequest | undefined>>;
type SettingsFocusSetter = Dispatch<SetStateAction<SettingsFocusRequest | undefined>>;
type GitPanelTabSetter = Dispatch<SetStateAction<GitPanelTabRequest>>;

export function nextToggledRightPanel(
  current: UtilityPanel | undefined,
  panel: UtilityPanel,
): UtilityPanel | undefined {
  return current === panel ? undefined : panel;
}

export function appSettingsFocusRequest(
  section: SettingsFocusRequest["section"],
  nonce: number,
): SettingsFocusRequest {
  return { section, nonce };
}

export function appArtifactPreviewRequest(path: string, nonce: number): ArtifactPreviewRequest {
  return { path, nonce };
}

export function appGitSummaryPanelRequest(nonce: number): GitPanelTabRequest {
  return { tab: "summary", nonce };
}

export function createAppRightPanelControls({
  setRightPanel,
  setSettingsFocusRequest,
  setArtifactPreviewRequest,
  setLocalFilePreviewRequest,
  setGitPanelTabRequest,
  now = Date.now,
}: {
  setRightPanel: OptionalPanelSetter;
  setSettingsFocusRequest: SettingsFocusSetter;
  setArtifactPreviewRequest: OptionalArtifactPreviewSetter;
  setLocalFilePreviewRequest: OptionalArtifactPreviewSetter;
  setGitPanelTabRequest: GitPanelTabSetter;
  now?: () => number;
}) {
  function openPanel(panel: UtilityPanel) {
    setRightPanel(panel);
  }

  function openSettingsSection(section: SettingsFocusRequest["section"]) {
    setSettingsFocusRequest(appSettingsFocusRequest(section, now()));
    setRightPanel("settings");
  }

  return {
    togglePanel(panel: UtilityPanel) {
      setRightPanel((current) => nextToggledRightPanel(current, panel));
    },
    openPanel,
    openVoiceSettingsFromStatus() {
      openSettingsSection("voice");
    },
    openMcpRuntimeSettings() {
      openSettingsSection("mcp-runtime");
    },
    openSearchWebSettings() {
      openSettingsSection("search-web");
    },
    openGitSummaryPanel() {
      setGitPanelTabRequest(appGitSummaryPanelRequest(now()));
      setRightPanel("diff");
    },
    previewArtifact(path: string) {
      setLocalFilePreviewRequest(undefined);
      setArtifactPreviewRequest(appArtifactPreviewRequest(path, now()));
      setRightPanel("files");
    },
    previewLocalFile(path: string) {
      setArtifactPreviewRequest(undefined);
      setLocalFilePreviewRequest(appArtifactPreviewRequest(path, now()));
      setRightPanel("files");
    },
  };
}
