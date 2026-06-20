import { useState, type Dispatch, type SetStateAction } from "react";

import {
  createAppRightPanelControls,
} from "./AppRightPanelControls";
import type {
  ArtifactPreviewRequest,
  GitPanelTabRequest,
  SettingsFocusRequest,
  UtilityPanel,
} from "./RightPanel";

export const APP_RIGHT_PANEL_DEFAULT_WIDTH = 520;

export interface AppRightPanelInitialState {
  rightPanel: UtilityPanel | undefined;
  rightPanelWidth: number;
  settingsFocusRequest: SettingsFocusRequest | undefined;
  artifactPreviewRequest: ArtifactPreviewRequest | undefined;
  localFilePreviewRequest: ArtifactPreviewRequest | undefined;
  gitPanelTabRequest: GitPanelTabRequest;
}

export function createInitialAppRightPanelState(): AppRightPanelInitialState {
  return {
    rightPanel: undefined,
    rightPanelWidth: APP_RIGHT_PANEL_DEFAULT_WIDTH,
    settingsFocusRequest: undefined,
    artifactPreviewRequest: undefined,
    localFilePreviewRequest: undefined,
    gitPanelTabRequest: { tab: "summary", nonce: 0 },
  };
}

export interface AppRightPanelState extends AppRightPanelInitialState {
  setRightPanel: Dispatch<SetStateAction<UtilityPanel | undefined>>;
  setRightPanelWidth: Dispatch<SetStateAction<number>>;
}

export function useAppRightPanelState() {
  const initialState = createInitialAppRightPanelState();
  const [rightPanel, setRightPanel] = useState<UtilityPanel | undefined>(initialState.rightPanel);
  const [rightPanelWidth, setRightPanelWidth] = useState(initialState.rightPanelWidth);
  const [settingsFocusRequest, setSettingsFocusRequest] = useState<SettingsFocusRequest | undefined>(initialState.settingsFocusRequest);
  const [artifactPreviewRequest, setArtifactPreviewRequest] = useState<ArtifactPreviewRequest | undefined>(initialState.artifactPreviewRequest);
  const [localFilePreviewRequest, setLocalFilePreviewRequest] = useState<ArtifactPreviewRequest | undefined>(initialState.localFilePreviewRequest);
  const [gitPanelTabRequest, setGitPanelTabRequest] = useState<GitPanelTabRequest>(initialState.gitPanelTabRequest);

  return {
    rightPanel,
    setRightPanel,
    rightPanelWidth,
    setRightPanelWidth,
    settingsFocusRequest,
    artifactPreviewRequest,
    localFilePreviewRequest,
    gitPanelTabRequest,
    ...createAppRightPanelControls({
      setRightPanel,
      setSettingsFocusRequest,
      setArtifactPreviewRequest,
      setLocalFilePreviewRequest,
      setGitPanelTabRequest,
    }),
  };
}
