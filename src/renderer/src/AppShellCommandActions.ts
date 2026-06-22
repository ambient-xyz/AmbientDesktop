import type {
  Dispatch,
  MouseEvent as ReactMouseEvent,
  SetStateAction,
} from "react";

import type {
  DesktopState,
  MenuCommand,
  ThemePreference,
} from "../../shared/desktopTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { applyDocumentAppearance } from "./appearance";
import { createAppCommandPaletteItems } from "./AppCommandPaletteModel";
import type { CommandPaletteItem } from "./AppDialogs";
import type { AutomationPopover, ProjectPopover } from "./AppSidebar";
import type { SidebarArea } from "./AppShellSidebar";
import {
  beginAppRightPanelResize,
  beginAppSidebarResize,
  beginAppWorkflowRecorderReviewResize,
} from "./AppShellResize";
import type { AutomationPane } from "./AutomationsWorkspace";
import type { UtilityPanel } from "./RightPanel";

type Setter<T> = Dispatch<SetStateAction<T>>;
type MaybePromise<T = unknown> = T | Promise<T>;
type ThreadSettingsPatch = Partial<Pick<
  ThreadSummary,
  "collaborationMode" | "model" | "thinkingLevel" | "memoryEnabled"
>>;
type MediaPreviewModal = {
  path: string;
  mediaKind: "image" | "video";
};

export function createAppWorkflowComposerNavigation({
  loadWorkflowAgentFolders,
  setAutomationPopover,
  setProjectPopover,
  setRightPanel,
  setSelectedAutomationPane,
  setSelectedAutomationThreadId,
  setSelectedWorkflowAgentFolderId,
  setSelectedWorkflowAgentThreadId,
  setSelectedWorkflowRecordingId,
  setSidebarArea,
}: {
  loadWorkflowAgentFolders: () => MaybePromise;
  setAutomationPopover: Setter<AutomationPopover | undefined>;
  setProjectPopover: Setter<ProjectPopover | undefined>;
  setRightPanel: Setter<UtilityPanel | undefined>;
  setSelectedAutomationPane: Setter<AutomationPane>;
  setSelectedAutomationThreadId: Setter<string | undefined>;
  setSelectedWorkflowAgentFolderId: Setter<string>;
  setSelectedWorkflowAgentThreadId: Setter<string | undefined>;
  setSelectedWorkflowRecordingId: Setter<string | undefined>;
  setSidebarArea: Setter<SidebarArea>;
}): {
  openNewWorkflowComposer: (folderId?: string) => void;
} {
  function openNewWorkflowComposer(folderId?: string): void {
    setSidebarArea("automations");
    setProjectPopover(undefined);
    setAutomationPopover(undefined);
    setSelectedAutomationPane("workflow_agent");
    if (folderId) setSelectedWorkflowAgentFolderId(folderId);
    setSelectedWorkflowAgentThreadId(undefined);
    setSelectedWorkflowRecordingId(undefined);
    setSelectedAutomationThreadId(undefined);
    setRightPanel((current) => (current === "search" || current === "settings" ? current : undefined));
    void loadWorkflowAgentFolders();
  }

  return { openNewWorkflowComposer };
}

export function createAppShellCommandActions({
  compactActiveThread,
  contextUsage,
  createThread,
  exportActiveChat,
  exportDiagnostics,
  openApiKeyDialog,
  openMcpRuntimeSettings,
  openPanel,
  openWorkflowLabArea,
  openWorkflowRecordingsArea,
  openWorkspace,
  recoverActiveThreadContext,
  rightPanel,
  setCommandPaletteOpen,
  setCommandPaletteQuery,
  setError,
  setMediaPreviewModal,
  setRightPanelWidth,
  setSidebarOpen,
  setSidebarWidth,
  setState,
  setWorkflowRecorderReviewPanelWidth,
  sidebarOpen,
  state,
  togglePanel,
  workflowRecorderNavLabel,
}: {
  compactActiveThread: () => MaybePromise;
  contextUsage: DesktopState["contextUsage"] | undefined;
  createThread: () => MaybePromise;
  exportActiveChat: () => MaybePromise;
  exportDiagnostics: () => MaybePromise;
  openApiKeyDialog: () => MaybePromise;
  openMcpRuntimeSettings: () => MaybePromise;
  openPanel: (panel: UtilityPanel) => MaybePromise;
  openWorkflowLabArea: () => MaybePromise;
  openWorkflowRecordingsArea: () => MaybePromise;
  openWorkspace: () => MaybePromise;
  recoverActiveThreadContext: () => MaybePromise;
  rightPanel: UtilityPanel | undefined;
  setCommandPaletteOpen: Setter<boolean>;
  setCommandPaletteQuery: Setter<string>;
  setError: (message: string | undefined) => void;
  setMediaPreviewModal: Setter<MediaPreviewModal | undefined>;
  setRightPanelWidth: Setter<number>;
  setSidebarOpen: Setter<boolean>;
  setSidebarWidth: Setter<number>;
  setState: Setter<DesktopState | undefined>;
  setWorkflowRecorderReviewPanelWidth: Setter<number>;
  sidebarOpen: boolean;
  state: DesktopState | undefined;
  togglePanel: (panel: UtilityPanel) => MaybePromise;
  workflowRecorderNavLabel: string;
}): {
  beginRightPanelResize: (event: ReactMouseEvent<HTMLDivElement>) => void;
  beginSidebarResize: (event: ReactMouseEvent<HTMLDivElement>) => void;
  beginWorkflowRecorderReviewResize: (event: ReactMouseEvent<HTMLDivElement>) => void;
  commandItems: () => CommandPaletteItem[];
  handleMenuCommand: (command: MenuCommand) => Promise<void>;
  openMediaPreviewModal: (path: string, mediaKind: "image" | "video") => void;
  runPaletteCommand: (command: CommandPaletteItem) => Promise<void>;
  updateThemePreference: (themePreference: ThemePreference) => Promise<void>;
  updateThreadSettings: (input: ThreadSettingsPatch) => Promise<ThreadSummary | undefined>;
} {
  async function updateThreadSettings(input: ThreadSettingsPatch): Promise<ThreadSummary | undefined> {
    if (!state) return undefined;
    const threadId = state.activeThreadId;
    const thread = await window.ambientDesktop.updateThreadSettings({
      threadId,
      ...input,
    });
    setState((current) => {
      if (!current) return current;
      return {
        ...current,
        threads: current.threads.map((item) => (item.id === thread.id ? thread : item)),
        settings: current.activeThreadId === thread.id
          ? {
              ...current.settings,
              permissionMode: thread.permissionMode,
              collaborationMode: thread.collaborationMode,
              model: thread.model,
              thinkingLevel: thread.thinkingLevel,
            }
          : current.settings,
      };
    });
    return thread;
  }

  async function updateThemePreference(themePreference: ThemePreference): Promise<void> {
    const appearance = await window.ambientDesktop.setThemePreference({ themePreference });
    applyDocumentAppearance(appearance);
    setState((current) => (current ? { ...current, appearance } : current));
  }

  async function handleMenuCommand(command: MenuCommand): Promise<void> {
    if (command === "new-chat") {
      await createThread();
      return;
    }
    if (command === "open-folder") {
      await openWorkspace();
      return;
    }
    if (command === "toggle-sidebar") {
      setSidebarOpen((open) => !open);
      return;
    }
    if (command === "toggle-terminal") {
      togglePanel("terminal");
      return;
    }
    if (command === "toggle-file-tree") {
      togglePanel("files");
      return;
    }
    if (command === "toggle-diff-panel") {
      togglePanel("diff");
      return;
    }
    if (command === "toggle-browser-panel") {
      togglePanel("browser");
      return;
    }
    if (command === "performance-trace") {
      openPanel("performance");
      return;
    }
    if (command === "export-diagnostics") {
      try {
        await exportDiagnostics();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  function beginSidebarResize(event: ReactMouseEvent<HTMLDivElement>): void {
    beginAppSidebarResize(event, setSidebarWidth);
  }

  function beginRightPanelResize(event: ReactMouseEvent<HTMLDivElement>): void {
    beginAppRightPanelResize(event, setRightPanelWidth);
  }

  function beginWorkflowRecorderReviewResize(event: ReactMouseEvent<HTMLDivElement>): void {
    beginAppWorkflowRecorderReviewResize(event, setWorkflowRecorderReviewPanelWidth);
  }

  function openMediaPreviewModal(path: string, mediaKind: "image" | "video"): void {
    setMediaPreviewModal({ path, mediaKind });
  }

  function commandItems(): CommandPaletteItem[] {
    return createAppCommandPaletteItems({
      contextUsage,
      handlers: {
        compactActiveThread: async () => {
          await compactActiveThread();
        },
        createThread: async () => {
          await createThread();
        },
        exportActiveChat: () => void exportActiveChat(),
        exportDiagnostics: async () => {
          await exportDiagnostics();
        },
        openApiKeyDialog: async () => {
          await openApiKeyDialog();
        },
        openMcpRuntimeSettings: async () => {
          await openMcpRuntimeSettings();
        },
        openPanel: async (panel) => {
          await openPanel(panel);
        },
        openWorkflowLabArea: async () => {
          await openWorkflowLabArea();
        },
        openWorkflowRecordingsArea: async () => {
          await openWorkflowRecordingsArea();
        },
        openWorkspace: async () => {
          await openWorkspace();
        },
        recoverActiveThreadContext: async () => {
          await recoverActiveThreadContext();
        },
        setSidebarOpen,
        togglePanel: async (panel) => {
          await togglePanel(panel);
        },
      },
      rightPanel,
      sidebarOpen,
      workflowRecorderNavLabel,
    });
  }

  async function runPaletteCommand(command: CommandPaletteItem): Promise<void> {
    setCommandPaletteOpen(false);
    setCommandPaletteQuery("");
    await command.run();
  }

  return {
    beginRightPanelResize,
    beginSidebarResize,
    beginWorkflowRecorderReviewResize,
    commandItems,
    handleMenuCommand,
    openMediaPreviewModal,
    runPaletteCommand,
    updateThemePreference,
    updateThreadSettings,
  };
}
