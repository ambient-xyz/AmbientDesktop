import {
  Code2,
  FileText,
  Kanban,
  Monitor,
  PanelLeft,
  Terminal,
} from "lucide-react";

import type { GitReviewSummary } from "../../shared/types";
import { GitEditSummaryBadge } from "./AppGitControls";
import type { ProjectBoardActionKind } from "./projectBoardUiModel";
import type { UtilityPanel } from "./RightPanel";

export type AppTopbarProjectBoardAction = {
  kind: ProjectBoardActionKind;
  label: string;
  title: string;
  disabled: boolean;
  ready: boolean;
  active: boolean;
  onRun: () => void;
};

export function AppTopbar({
  sidebarOpen,
  title,
  providerHasApiKey,
  providerLabel,
  projectBoardAction,
  gitReview,
  gitReviewError,
  rightPanel,
  onShowSidebar,
  onOpenApiKey,
  onOpenGitSummary,
  onTogglePanel,
}: {
  sidebarOpen: boolean;
  title: string;
  providerHasApiKey: boolean;
  providerLabel: string;
  projectBoardAction?: AppTopbarProjectBoardAction;
  gitReview?: GitReviewSummary;
  gitReviewError?: string;
  rightPanel?: UtilityPanel;
  onShowSidebar: () => void;
  onOpenApiKey: () => void;
  onOpenGitSummary: () => void;
  onTogglePanel: (panel: UtilityPanel) => void;
}) {
  const browserLabel = rightPanel === "browser" ? "Hide browser" : "Browser";

  return (
    <header className={sidebarOpen ? "topbar" : "topbar sidebar-hidden"}>
      {!sidebarOpen && (
        <button className="icon-button" onClick={onShowSidebar} data-tooltip="Toggle sidebar" aria-label="Toggle sidebar">
          <PanelLeft size={17} />
        </button>
      )}
      <div className="title-block">
        <span className="thread-heading">{title}</span>
        <button
          type="button"
          className={`provider-pill ${providerHasApiKey ? "ready" : "missing"}`}
          onClick={onOpenApiKey}
          data-tooltip={providerHasApiKey ? `${providerLabel} API connected` : `Set ${providerLabel} API key`}
        >
          {providerHasApiKey ? `${providerLabel} API` : "API key missing"}
        </button>
      </div>
      <div className="top-actions">
        {projectBoardAction && (
          <button
            type="button"
            className={`project-board-top-action ${projectBoardAction.ready ? "ready" : ""} ${projectBoardAction.active ? "active" : ""}`}
            data-tooltip={projectBoardAction.title}
            aria-label={projectBoardAction.title}
            disabled={projectBoardAction.disabled}
            onClick={projectBoardAction.onRun}
          >
            <Kanban size={15} />
            <span>{projectBoardAction.label}</span>
          </button>
        )}
        <GitEditSummaryBadge review={gitReview} error={gitReviewError} onOpen={onOpenGitSummary} />
        <button
          className={`icon-button ${rightPanel === "browser" ? "active" : ""}`}
          data-tooltip={browserLabel}
          aria-label={browserLabel}
          onClick={() => onTogglePanel("browser")}
        >
          <Monitor size={17} />
        </button>
        <button className={`icon-button ${rightPanel === "files" ? "active" : ""}`} data-tooltip="File tree" aria-label="File tree" onClick={() => onTogglePanel("files")}>
          <FileText size={17} />
        </button>
        <button className={`icon-button ${rightPanel === "terminal" ? "active" : ""}`} data-tooltip="Terminal" aria-label="Terminal" onClick={() => onTogglePanel("terminal")}>
          <Terminal size={17} />
        </button>
        <button className={`icon-button ${rightPanel === "diff" ? "active" : ""}`} data-tooltip="Diff" aria-label="Diff" onClick={() => onTogglePanel("diff")}>
          <Code2 size={17} />
        </button>
      </div>
    </header>
  );
}
