import { Archive, CheckCircle2, Package } from "lucide-react";
import { useMemo } from "react";

import type {
  OrchestrationBoard,
  ProjectSummary,
  ResolveProjectBoardDeliverableIntegrationInput,
} from "../../shared/types";
import { formatOrchestrationRunStatus } from "./AutomationsWorkspace";
import { projectBoardPhaseDisplayName } from "./ProjectBoardLaneViews";
import { projectBoardDeliverableIntegrationQueue } from "./projectBoardIntegrationUiModel";

export function ProjectBoardIntegrationTab({
  board,
  orchestrationBoard,
  busy,
  onResolve,
}: {
  board: NonNullable<ProjectSummary["board"]>;
  orchestrationBoard?: OrchestrationBoard;
  busy?: string;
  onResolve: (input: ResolveProjectBoardDeliverableIntegrationInput) => void;
}) {
  const queue = useMemo(
    () => projectBoardDeliverableIntegrationQueue(board, orchestrationBoard),
    [board, orchestrationBoard],
  );
  return (
    <section className="project-board-tab-panel project-board-integration-panel" aria-label="Project board integration queue">
      <header className="project-board-panel-header">
        <div>
          <span className="project-board-kicker">Integration Queue</span>
          <h3>{queue.headline}</h3>
        </div>
        <span className={`project-board-status ${queue.pendingCount > 0 ? "warning" : queue.items.length > 0 ? "ready" : ""}`}>
          {queue.pendingCount > 0 ? `${queue.pendingCount} pending` : queue.items.length > 0 ? "Resolved" : "No deliverables"}
        </span>
      </header>
      <p className="project-board-detail-note">{queue.detail}</p>
      <div className="project-board-proof-review-metrics" aria-label="Deliverable integration summary">
        <span className={queue.pendingCount > 0 ? "warning" : "success"}>
          <strong>Pending</strong>
          {queue.pendingCount}
        </span>
        <span className="success">
          <strong>Integrated</strong>
          {queue.integratedCount}
        </span>
        <span>
          <strong>Exported</strong>
          {queue.exportedCount}
        </span>
        <span className={queue.deferredCount > 0 ? "warning" : ""}>
          <strong>Deferred</strong>
          {queue.deferredCount}
        </span>
        <span>
          <strong>Material files</strong>
          {queue.materialFileCount}
        </span>
        <span className={queue.excludedFileCount > 0 ? "warning" : "success"}>
          <strong>Excluded</strong>
          {queue.excludedFileCount}
        </span>
      </div>
      {queue.items.length > 0 ? (
        <div className="project-board-proof-review-list">
          {queue.items.slice(0, 12).map((item) => {
            const statusClass = item.tone === "ready" ? "ready" : item.tone === "warning" ? "warning" : item.tone === "danger" ? "danger" : "";
            const runStatus = formatOrchestrationRunStatus(item.run);
            return (
              <article className={`project-board-proof-review-item ${item.status}`} key={item.id}>
                <header>
                  <div>
                    <span className="project-board-card-meta">
                      {item.card ? projectBoardPhaseDisplayName(item.card.phase || "Unassigned") : "Unlinked"} · {runStatus}
                    </span>
                    <h4>{item.card?.title ?? item.task?.title ?? `Run ${item.run.id}`}</h4>
                  </div>
                  <span className={`project-board-status ${statusClass}`} title={item.record?.reason ?? item.detail}>
                    {item.statusLabel}
                  </span>
                </header>
                <p>{item.detail}</p>
                <div className="project-board-proof-review-metrics">
                  <span className={item.materialFiles.length > 0 ? "success" : "warning"}>
                    <strong>Material</strong>
                    {item.materialFiles.length}
                  </span>
                  <span className={item.excludedFiles.length > 0 ? "warning" : "success"}>
                    <strong>Excluded</strong>
                    {item.excludedFiles.length}
                  </span>
                  <span>
                    <strong>Commands</strong>
                    {item.manifest.commands.length}
                  </span>
                  <span>
                    <strong>Commits</strong>
                    {item.manifest.commits.length}
                  </span>
                  <span>
                    <strong>Imports</strong>
                    {item.manifest.dependencyImports.length}
                  </span>
                </div>
                {item.materialFiles.length > 0 && (
                  <ul className="project-board-deliverable-file-list">
                    {item.materialFiles.slice(0, 8).map((file) => (
                      <li key={`${item.id}:material:${file.path}`}>
                        {file.path} · {file.category}
                      </li>
                    ))}
                    {item.materialFiles.length > 8 && <li>{item.materialFiles.length - 8} more material file{item.materialFiles.length - 8 === 1 ? "" : "s"}</li>}
                  </ul>
                )}
                {item.excludedFiles.length > 0 && (
                  <p className="project-board-detail-note">
                    Excluded by policy:{" "}
                    {item.excludedFiles
                      .slice(0, 6)
                      .map((file) => `${file.path} (${file.exclusionReason ?? file.category})`)
                      .join(", ")}
                    {item.excludedFiles.length > 6 ? `, +${item.excludedFiles.length - 6} more` : ""}
                  </p>
                )}
                {item.record?.exportPath && <p className="project-board-detail-note">Export bundle: {item.record.exportPath}</p>}
                <div className="project-board-card-actions">
                  {item.actions.map((action) => {
                    const busyKey = `${item.run.id}:${action.action}`;
                    const actionBusy = busy === busyKey;
                    return (
                      <button
                        type="button"
                        className={`project-board-card-action ${action.tone === "primary" ? "" : action.tone} ${action.disabled ? "resolved" : ""}`}
                        key={action.action}
                        disabled={action.disabled || Boolean(busy)}
                        title={action.title}
                        onClick={() => {
                          const reason =
                            action.action === "defer"
                              ? window.prompt("Reason to defer deliverable integration?", item.record?.reason ?? "Deferred by PM decision.")?.trim()
                              : undefined;
                          if (action.action === "defer" && !reason) return;
                          onResolve({ boardId: board.id, runId: item.run.id, action: action.action, reason });
                        }}
                      >
                        {action.action === "apply_to_root" ? (
                          <CheckCircle2 size={14} className={actionBusy ? "spin" : ""} />
                        ) : action.action === "export_bundle" ? (
                          <Package size={14} className={actionBusy ? "spin" : ""} />
                        ) : (
                          <Archive size={14} className={actionBusy ? "spin" : ""} />
                        )}
                        <span>{actionBusy ? "Saving" : action.label}</span>
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="project-board-column-empty">Completed Local Task runs with declared changed files will appear here.</div>
      )}
    </section>
  );
}
