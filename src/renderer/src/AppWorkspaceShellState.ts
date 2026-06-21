import { useRef, useState } from "react";

import type { BrowserUserActionState } from "../../shared/browserTypes";
import type { AmbientPluginRegistry } from "../../shared/pluginTypes";
import type {
  GitReviewSummary,
  WorkspaceGitStatus,
} from "../../shared/workspaceTypes";
import type { GitConfirmation } from "./RightPanel";
import type { AppMessageActivityKind } from "./AppThreadLifecycleEffects";
import type { WorkspaceProjectAliases } from "./workspaceEventMatching";

export function useAppWorkspaceShellState() {
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [gitStatus, setGitStatus] = useState<WorkspaceGitStatus | undefined>();
  const [gitStatusError, setGitStatusError] = useState<string | undefined>();
  const [activeGitReview, setActiveGitReview] = useState<
    GitReviewSummary | undefined
  >();
  const [activeGitReviewError, setActiveGitReviewError] = useState<
    string | undefined
  >();
  const [gitConfirmation, setGitConfirmation] = useState<GitConfirmation | undefined>();
  const [pluginCatalogRevision, setPluginCatalogRevision] = useState(0);
  const [welcomeAmbientPluginRegistry, setWelcomeAmbientPluginRegistry] =
    useState<AmbientPluginRegistry | undefined>();
  const [browserRevision, setBrowserRevision] = useState(0);
  const [chatBrowserUserAction, setChatBrowserUserAction] = useState<
    BrowserUserActionState | undefined
  >();
  const [chatBrowserUserActionBusy, setChatBrowserUserActionBusy] =
    useState<"resume" | "cancel" | undefined>();
  const activeThreadIdRef = useRef<string | undefined>(undefined);
  const activeProjectRootRef = useRef<string | undefined>(undefined);
  const workspaceProjectAliasesRef = useRef<WorkspaceProjectAliases>({});
  const messageKindsRef = useRef<Record<string, AppMessageActivityKind>>({});
  const mcpContainerRuntimeStartupCheckRef = useRef(false);

  return {
    workspaceRevision,
    setWorkspaceRevision,
    gitStatus,
    setGitStatus,
    gitStatusError,
    setGitStatusError,
    activeGitReview,
    setActiveGitReview,
    activeGitReviewError,
    setActiveGitReviewError,
    gitConfirmation,
    setGitConfirmation,
    pluginCatalogRevision,
    setPluginCatalogRevision,
    welcomeAmbientPluginRegistry,
    setWelcomeAmbientPluginRegistry,
    browserRevision,
    setBrowserRevision,
    chatBrowserUserAction,
    setChatBrowserUserAction,
    chatBrowserUserActionBusy,
    setChatBrowserUserActionBusy,
    activeThreadIdRef,
    activeProjectRootRef,
    workspaceProjectAliasesRef,
    messageKindsRef,
    mcpContainerRuntimeStartupCheckRef,
  };
}
