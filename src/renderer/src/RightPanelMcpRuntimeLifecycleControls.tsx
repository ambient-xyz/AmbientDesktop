import { ExternalLink, LoaderCircle, RotateCcw, ShieldAlert } from "lucide-react";
import type {
  AmbientMcpContainerRuntimeLifecycleAction,
  AmbientMcpContainerRuntimeLifecyclePreview,
  AmbientMcpContainerRuntimeLifecycleProgress,
  AmbientMcpContainerRuntimeLifecycleResult,
  AmbientMcpContainerRuntimeStatus,
} from "../../shared/pluginTypes";
import {
  mcpContainerRuntimeLifecycleActionViews,
  mcpContainerRuntimeLifecycleCommandPreview,
  mcpContainerRuntimeLifecyclePreviewRows,
  mcpContainerRuntimeLifecycleRunActionState,
  mcpContainerRuntimeLifecycleStatusView,
  mcpContainerRuntimeLifecycleWarnings,
} from "./pluginUiModel";
import { formatTaskState } from "./RightPanelDetailPanels";

export function McpContainerRuntimeLifecycleControls({
  status,
  preview,
  progress,
  result,
  error,
  busyKey,
  disabled,
  onPreview,
  onRun,
}: {
  status?: AmbientMcpContainerRuntimeStatus;
  preview?: AmbientMcpContainerRuntimeLifecyclePreview;
  progress: AmbientMcpContainerRuntimeLifecycleProgress[];
  result?: AmbientMcpContainerRuntimeLifecycleResult;
  error?: string;
  busyKey?: string;
  disabled?: boolean;
  onPreview: (action: AmbientMcpContainerRuntimeLifecycleAction) => void;
  onRun: (action: AmbientMcpContainerRuntimeLifecycleAction) => void;
}) {
  const actionViews = mcpContainerRuntimeLifecycleActionViews(status, { busyKey, disabled });
  const latestProgress = progress.at(-1);
  const statusView = mcpContainerRuntimeLifecycleStatusView({ preview, progress: latestProgress, result, error });
  if (!actionViews.length && !preview && !latestProgress && !result && !error) return null;
  const runAction = mcpContainerRuntimeLifecycleRunActionState(preview, { busyKey });
  const previewRows = mcpContainerRuntimeLifecyclePreviewRows(preview);
  const warnings = mcpContainerRuntimeLifecycleWarnings(preview);
  const progressRows = progress.slice(-6);

  return (
    <div className="plugin-detail-panel mcp-runtime-lifecycle-panel">
      <div className="panel-section-heading">
        <strong>Runtime restart</strong>
        <span>{preview ? formatTaskState(preview.action) : status ? formatTaskState(status.status) : "not checked"}</span>
      </div>
      <div className="panel-action-row compact">
        {actionViews.map((action) => {
          const busy = busyKey === `preview:${action.action}` || busyKey === `run:${action.action}`;
          const Icon = action.action === "open-recovery" ? ExternalLink : action.danger ? ShieldAlert : RotateCcw;
          return (
            <button
              type="button"
              key={action.action}
              className={`panel-button mini icon-panel-button ${action.primary ? "primary" : ""} ${action.danger ? "danger" : ""}`}
              disabled={action.disabled}
              title={action.title}
              onClick={() => onPreview(action.action)}
            >
              {busy ? <LoaderCircle size={13} className="spin" /> : <Icon size={13} />}
              {action.label}
            </button>
          );
        })}
      </div>
      {statusView && <p className={`panel-status ${statusView.kind}`}>{statusView.message}</p>}
      {preview && (
        <>
          <div className="plugin-badges">
            {previewRows.map((row) => <span key={row}>{row}</span>)}
          </div>
          {warnings.length > 0 && (
            <div className="plugin-note-list">
              {warnings.map((warning) => <span key={warning}>{warning}</span>)}
            </div>
          )}
          {preview.commands.length > 0 && (
            <div className="plugin-note-list">
              {preview.commands.map((command, index) => (
                <span key={`${command.exe}:${command.args.join(" ")}:${index}`}>
                  {command.rationale} <code>{mcpContainerRuntimeLifecycleCommandPreview(command)}</code>
                </span>
              ))}
            </div>
          )}
          {preview.targets.length > 0 && (
            <div className="plugin-note-list">
              {preview.targets.map((target) => (
                <span key={`${target.kind}:${target.identifier}`}>
                  {formatTaskState(target.kind)}: {target.label} ({target.verified ? "verified" : "not verified"}). {target.reason}
                </span>
              ))}
            </div>
          )}
          {runAction.visible && (
            <button
              type="button"
              className={`panel-button mini icon-panel-button ${runAction.danger ? "danger" : "primary"}`}
              disabled={runAction.disabled}
              title={runAction.title}
              onClick={() => onRun(preview.action)}
            >
              {busyKey === `run:${preview.action}` ? <LoaderCircle size={13} className="spin" /> : preview.action === "open-recovery" ? <ExternalLink size={13} /> : <RotateCcw size={13} />}
              {runAction.label}
            </button>
          )}
        </>
      )}
      {progressRows.length > 0 && (
        <div className="plugin-note-list">
          {progressRows.map((entry, index) => (
            <span key={`${entry.recordedAt}:${entry.phase}:${index}`}>
              {formatTaskState(entry.phase)}: {entry.message}
            </span>
          ))}
        </div>
      )}
      {result?.logPath && <small>Lifecycle log: {result.logPath}</small>}
    </div>
  );
}
