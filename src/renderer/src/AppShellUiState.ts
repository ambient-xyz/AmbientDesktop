import { useState } from "react";

import { readInitialSidebarWidth } from "./sidebarLayout";
import type { SidebarArea } from "./AppShellSidebar";
import type { MediaPreviewModalRequest } from "./AppToolMessages";
import type { TransientErrorScope } from "./transientErrorUiModel";

export function useAppShellUiState() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(readInitialSidebarWidth);
  const [sidebarArea, setSidebarArea] = useState<SidebarArea>("projects");
  const [workflowRecorderReviewPanelWidth, setWorkflowRecorderReviewPanelWidth] = useState(420);
  const [searchRoutingHydrating, setSearchRoutingHydrating] = useState(false);
  const [searchRoutingHydrationError, setSearchRoutingHydrationError] = useState<string | undefined>();
  const [mediaPreviewModal, setMediaPreviewModal] = useState<MediaPreviewModalRequest | undefined>();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState("");
  const [error, setErrorState] = useState<string | undefined>();
  const [errorScope, setErrorScope] = useState<TransientErrorScope | undefined>();
  const [updatePopoverOpen, setUpdatePopoverOpen] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);

  function setError(message: string | undefined) {
    setErrorScope(undefined);
    setErrorState(message);
  }

  function setScopedError(message: string, scope: TransientErrorScope | undefined) {
    setErrorScope(scope);
    setErrorState(message);
  }

  function clearError() {
    setError(undefined);
  }

  return {
    sidebarOpen,
    setSidebarOpen,
    sidebarWidth,
    setSidebarWidth,
    sidebarArea,
    setSidebarArea,
    workflowRecorderReviewPanelWidth,
    setWorkflowRecorderReviewPanelWidth,
    searchRoutingHydrating,
    setSearchRoutingHydrating,
    searchRoutingHydrationError,
    setSearchRoutingHydrationError,
    mediaPreviewModal,
    setMediaPreviewModal,
    commandPaletteOpen,
    setCommandPaletteOpen,
    commandPaletteQuery,
    setCommandPaletteQuery,
    error,
    setError,
    setScopedError,
    clearError,
    errorScope,
    setErrorScope,
    setErrorState,
    updatePopoverOpen,
    setUpdatePopoverOpen,
    updateBusy,
    setUpdateBusy,
  };
}
