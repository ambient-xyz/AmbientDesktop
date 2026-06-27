import {
  Archive,
  Check,
  Code2,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  GitBranch,
  Home,
  Maximize2,
  MessageCircle,
  Pencil,
  Pin,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { ProjectSummary } from "../../shared/projectBoardTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { projectBoardResetImpact } from "./projectBoardUiModel";

export type ProjectContextMenuState = {
  project: ProjectSummary;
  x: number;
  y: number;
};

export type ThreadContextMenuState = {
  thread: ThreadSummary;
  workspacePath: string;
  x: number;
  y: number;
};

export type ProjectActionDialogState =
  | { kind: "rename"; project: ProjectSummary; name: string; busy?: boolean }
  | { kind: "archive"; project: ProjectSummary; busy?: boolean }
  | { kind: "remove"; project: ProjectSummary; busy?: boolean };

export type ProjectBoardResetDialogState = {
  project: ProjectSummary;
  board: NonNullable<ProjectSummary["board"]>;
  error?: string;
  busy?: boolean;
};

export type PlannerRevisionDialogState = {
  artifact: PlannerPlanArtifact;
  initialFeedback: string;
  error?: string;
  busy?: boolean;
};

export type ThreadActionDialogState =
  | { kind: "rename"; thread: ThreadSummary; workspacePath: string; name: string; busy?: boolean }
  | { kind: "archive"; thread: ThreadSummary; workspacePath: string; busy?: boolean };

export function ProjectContextMenu({
  menu,
  onPin,
  onReveal,
  onCreateWorktree,
  onRename,
  onArchiveChats,
  onRemove,
}: {
  menu: ProjectContextMenuState;
  onPin: () => void;
  onReveal: () => void;
  onCreateWorktree: () => void;
  onRename: () => void;
  onArchiveChats: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="project-context-menu"
      role="menu"
      aria-label={`${menu.project.name} project actions`}
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={onPin}>
        <Pin size={17} />
        <span>{menu.project.pinned ? "Unpin project" : "Pin project"}</span>
      </button>
      <button type="button" role="menuitem" onClick={onReveal}>
        <FolderOpen size={17} />
        <span>Open in Finder</span>
      </button>
      <button type="button" role="menuitem" onClick={onCreateWorktree}>
        <GitBranch size={17} />
        <span>Create permanent worktree</span>
      </button>
      <button type="button" role="menuitem" onClick={onRename}>
        <Pencil size={17} />
        <span>Rename project</span>
      </button>
      <button type="button" role="menuitem" onClick={onArchiveChats}>
        <Archive size={17} />
        <span>Archive chats</span>
      </button>
      <button type="button" role="menuitem" onClick={onRemove}>
        <X size={17} />
        <span>Remove</span>
      </button>
    </div>
  );
}

export function ThreadContextMenu({
  menu,
  onPin,
  onRename,
  onArchive,
  onMarkUnread,
  onReveal,
  onCopyWorkingDirectory,
  onCopySessionId,
  onCopyDeeplink,
  onExportPdf,
  onForkLocal,
  onForkWorktree,
  onOpenMiniWindow,
}: {
  menu: ThreadContextMenuState;
  onPin: () => void;
  onRename: () => void;
  onArchive: () => void;
  onMarkUnread: () => void;
  onReveal: () => void;
  onCopyWorkingDirectory: () => void;
  onCopySessionId: () => void;
  onCopyDeeplink: () => void;
  onExportPdf: () => void;
  onForkLocal: () => void;
  onForkWorktree: () => void;
  onOpenMiniWindow: () => void;
}) {
  return (
    <div
      className="project-context-menu thread-context-menu"
      role="menu"
      aria-label={`${menu.thread.title} chat actions`}
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={onPin}>
        <Pin size={17} />
        <span>{menu.thread.pinned ? "Unpin chat" : "Pin chat"}</span>
      </button>
      <button type="button" role="menuitem" onClick={onRename}>
        <Pencil size={17} />
        <span>Rename chat</span>
      </button>
      <button type="button" role="menuitem" onClick={onArchive}>
        <Archive size={17} />
        <span>Archive chat</span>
      </button>
      <button type="button" role="menuitem" onClick={onMarkUnread}>
        <MessageCircle size={17} />
        <span>Mark as unread</span>
      </button>
      <div className="context-menu-separator" />
      <button type="button" role="menuitem" onClick={onReveal}>
        <FolderOpen size={17} />
        <span>Open in Finder</span>
      </button>
      <button type="button" role="menuitem" onClick={onCopyWorkingDirectory}>
        <Copy size={17} />
        <span>Copy working directory</span>
      </button>
      <button type="button" role="menuitem" onClick={onCopySessionId}>
        <Code2 size={17} />
        <span>Copy session ID</span>
      </button>
      <button type="button" role="menuitem" onClick={onCopyDeeplink}>
        <ExternalLink size={17} />
        <span>Copy deeplink</span>
      </button>
      <button type="button" role="menuitem" onClick={onExportPdf}>
        <FileText size={17} />
        <span>Export PDF</span>
      </button>
      <div className="context-menu-separator" />
      <button type="button" role="menuitem" onClick={onForkLocal}>
        <Home size={17} />
        <span>Fork into local</span>
      </button>
      <button type="button" role="menuitem" onClick={onForkWorktree}>
        <GitBranch size={17} />
        <span>Fork into new worktree</span>
      </button>
      <div className="context-menu-separator" />
      <button type="button" role="menuitem" onClick={onOpenMiniWindow}>
        <Maximize2 size={17} />
        <span>Open in mini window</span>
      </button>
    </div>
  );
}

export function ProjectActionDialogView({
  dialog,
  onChangeName,
  onCancel,
  onConfirm,
}: {
  dialog: ProjectActionDialogState;
  onChangeName: (name: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title = dialog.kind === "rename" ? "Rename project" : dialog.kind === "archive" ? "Archive project chats?" : "Remove project?";
  const message =
    dialog.kind === "rename"
      ? "Set the display name used in the sidebar. Files on disk are not renamed."
      : dialog.kind === "archive"
        ? `Archive all chats in ${dialog.project.name}. The project folder stays available.`
        : `Remove ${dialog.project.name} from the project list. Files on disk will not be deleted.`;
  const confirmLabel = dialog.kind === "rename" ? "Save" : dialog.kind === "archive" ? "Archive chats" : "Remove";
  const danger = dialog.kind !== "rename";
  const canConfirm = !dialog.busy && (dialog.kind !== "rename" || Boolean(dialog.name.trim()));
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !dialog.busy && onCancel()}>
      <div
        className="git-confirm-dialog project-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-action-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !dialog.busy) {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <div className="permission-dialog-header">
          <div className={`dialog-icon ${danger ? "danger" : ""}`}>
            {dialog.kind === "rename" ? <Pencil size={20} /> : dialog.kind === "archive" ? <Archive size={20} /> : <X size={20} />}
          </div>
          <div>
            <h2 id="project-action-title">{title}</h2>
            <p>{message}</p>
          </div>
        </div>
        {dialog.kind === "rename" && (
          <label className="project-action-field">
            <span>Project name</span>
            <input
              autoFocus
              className="panel-input"
              value={dialog.name}
              disabled={dialog.busy}
              onChange={(event) => onChangeName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canConfirm) {
                  event.preventDefault();
                  onConfirm();
                }
              }}
            />
          </label>
        )}
        <div className="permission-detail">
          <span>{dialog.kind === "rename" ? "Project folder" : "Project"}</span>
          <pre>{dialog.project.path}</pre>
        </div>
        <div className="permission-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={dialog.busy}>
            Cancel
          </button>
          <button type="button" className={`secondary-button ${danger ? "danger" : ""}`} onClick={onConfirm} disabled={!canConfirm}>
            {dialog.busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectBoardResetDialogView({
  dialog,
  onCancel,
  onConfirm,
}: {
  dialog: ProjectBoardResetDialogState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const impact = projectBoardResetImpact(dialog.board);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !dialog.busy && onCancel()}>
      <div
        className="git-confirm-dialog project-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-board-reset-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !dialog.busy) {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <div className="permission-dialog-header">
          <div className="dialog-icon danger">
            <Trash2 size={20} />
          </div>
          <div>
            <h2 id="project-board-reset-title">Reset project board?</h2>
            <p>{impact.summary} Project files, threads, and Local Task history stay in place.</p>
          </div>
        </div>
        <div className="permission-detail">
          <span>Board</span>
          <pre>{dialog.board.title}</pre>
        </div>
        <section className="project-board-reset-impact" aria-label="Reset impact">
          <span className="project-board-kicker">Reset impact</span>
          <div className="project-board-reset-impact-grid">
            {impact.deleted.map((metric) => (
              <article key={metric.label}>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
                <p>{metric.detail}</p>
              </article>
            ))}
          </div>
        </section>
        <div className="permission-detail">
          <span>Preserved</span>
          <pre>{impact.preserved.join("\n")}</pre>
        </div>
        {dialog.error && (
          <div className="permission-detail danger">
            <span>Reset failed</span>
            <pre>{dialog.error}</pre>
          </div>
        )}
        <div className="permission-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onCancel}
            disabled={dialog.busy}
            title={
              dialog.busy
                ? "Wait for the board reset to finish before closing this dialog."
                : "Cancel board reset and keep the current board unchanged."
            }
          >
            Cancel
          </button>
          <button
            type="button"
            className="secondary-button danger"
            onClick={onConfirm}
            disabled={dialog.busy}
            title="Delete this board's charter, cards, source review, PM review proposals, synthesis progress, and board history. Project files, threads, and Local Tasks are preserved."
          >
            {dialog.busy ? "Resetting..." : "Reset board"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlannerRevisionDialogView({
  dialog,
  onChangeFeedback,
  onCancel,
  onConfirm,
}: {
  dialog: PlannerRevisionDialogState;
  onChangeFeedback: () => void;
  onCancel: () => void;
  onConfirm: (feedback: string) => void;
}) {
  const [feedback, setFeedback] = useState(dialog.initialFeedback);
  const canConfirm = !dialog.busy && Boolean(feedback.trim());
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !dialog.busy && onCancel()}>
      <div
        className="git-confirm-dialog project-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="planner-revision-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !dialog.busy) {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <div className="permission-dialog-header">
          <div className="dialog-icon">
            <RefreshCw size={20} />
          </div>
          <div>
            <h2 id="planner-revision-title">Revise plan with feedback</h2>
            <p>Ambient will rewrite the existing durable plan artifact and commit the revised file.</p>
          </div>
        </div>
        <div className="permission-detail">
          <span>Plan</span>
          <pre>{dialog.artifact.title}</pre>
        </div>
        {dialog.artifact.durableArtifactPath && (
          <div className="permission-detail">
            <span>Durable artifact</span>
            <pre>{dialog.artifact.durableArtifactPath}</pre>
          </div>
        )}
        <label className="project-action-field">
          <span>Feedback</span>
          <textarea
            autoFocus
            className="panel-textarea"
            value={feedback}
            disabled={dialog.busy}
            placeholder="Describe what should change in the current durable plan."
            onChange={(event) => {
              setFeedback(event.target.value);
              if (dialog.error) onChangeFeedback();
            }}
          />
        </label>
        {dialog.error && (
          <div className="permission-detail danger">
            <span>Revision failed</span>
            <pre>{dialog.error}</pre>
          </div>
        )}
        <div className="permission-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={dialog.busy}>
            Cancel
          </button>
          <button type="button" className="primary-button" onClick={() => onConfirm(feedback)} disabled={!canConfirm}>
            {dialog.busy ? "Sending..." : "Revise plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ThreadActionDialogView({
  dialog,
  onChangeName,
  onCancel,
  onConfirm,
}: {
  dialog: ThreadActionDialogState;
  onChangeName: (name: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title = dialog.kind === "rename" ? "Rename chat" : "Archive chat?";
  const message =
    dialog.kind === "rename"
      ? "Set the display name used in the sidebar."
      : `Archive ${dialog.thread.title}. The working directory and files stay on disk.`;
  const confirmLabel = dialog.kind === "rename" ? "Save" : "Archive chat";
  const danger = dialog.kind === "archive";
  const canConfirm = !dialog.busy && (dialog.kind !== "rename" || Boolean(dialog.name.trim()));
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !dialog.busy && onCancel()}>
      <div
        className="git-confirm-dialog project-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="thread-action-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !dialog.busy) {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <div className="permission-dialog-header">
          <div className={`dialog-icon ${danger ? "danger" : ""}`}>
            {dialog.kind === "rename" ? <Pencil size={20} /> : <Archive size={20} />}
          </div>
          <div>
            <h2 id="thread-action-title">{title}</h2>
            <p>{message}</p>
          </div>
        </div>
        {dialog.kind === "rename" && (
          <label className="project-action-field">
            <span>Chat name</span>
            <input
              autoFocus
              className="panel-input"
              value={dialog.name}
              disabled={dialog.busy}
              onChange={(event) => onChangeName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canConfirm) {
                  event.preventDefault();
                  onConfirm();
                }
              }}
            />
          </label>
        )}
        <div className="permission-detail">
          <span>Working directory</span>
          <pre>{dialog.thread.gitWorktree?.status === "active" ? dialog.thread.gitWorktree.worktreePath : dialog.thread.workspacePath}</pre>
        </div>
        <div className="permission-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={dialog.busy}>
            Cancel
          </button>
          <button type="button" className={`secondary-button ${danger ? "danger" : ""}`} onClick={onConfirm} disabled={!canConfirm}>
            {dialog.busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SidebarMenuLabel({ children }: { children: ReactNode }) {
  return <div className="sidebar-menu-label">{children}</div>;
}

export function SidebarMenuDivider() {
  return <div className="sidebar-menu-divider" />;
}

export function SidebarMenuItem({
  icon,
  label,
  selected,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="sidebar-menu-item" onClick={onClick}>
      {icon}
      <span>{label}</span>
      {selected && <Check size={18} />}
    </button>
  );
}
