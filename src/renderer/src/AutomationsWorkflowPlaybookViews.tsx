import {
  Archive,
  Brain,
  CalendarPlus,
  Check,
  Download,
  FileText,
  LoaderCircle,
  MessageCircle,
  Package,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";

import type { WorkflowLabRun, WorkflowRecordingLibraryEntry } from "../../shared/types";
import { AutomationHeadingLabel } from "./AutomationsHeading";
import { WorkflowLabPanel, type WorkflowLabBusy } from "./AutomationsWorkflowLabViews";
import { formatTimelineTime, type ApiKeyStatus } from "./RightPanel";
import { workflowRecorderEditWithAmbientModel } from "./workflowRecorderUiModel";

export type WorkflowRecordingPlaybookLibrarySectionProps = {
  playbooks: WorkflowRecordingLibraryEntry[];
  query: string;
  includeArchived: boolean;
  refreshing: boolean;
  exportBusyThreadId?: string;
  exportStatus?: ApiKeyStatus;
  onQueryChange: (query: string) => void;
  onIncludeArchivedChange: (includeArchived: boolean) => void;
  onRefresh: () => Promise<void> | void;
  onEditPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void;
  onOpenPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void;
  onPreviewLocalPath: (path: string) => void;
  onExportPlaybookSession: (playbook: WorkflowRecordingLibraryEntry) => Promise<void> | void;
  onRestoreVersion: (id: string, version: number) => Promise<void> | void;
  onSetEnabled: (id: string, enabled: boolean) => Promise<void> | void;
  onUnarchivePlaybook: (playbook: WorkflowRecordingLibraryEntry) => Promise<void> | void;
  onArchivePlaybook: (playbook: WorkflowRecordingLibraryEntry) => Promise<void> | void;
};

export type WorkflowLabPlaybookLibrarySectionProps = {
  playbooks: WorkflowRecordingLibraryEntry[];
  headingTooltip: string;
  onNewRecording: () => void;
  onOpenPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void;
  onPreviewLocalPath: (path: string) => void;
};

export type WorkflowRecordingPlaybookPaneProps = {
  playbook: WorkflowRecordingLibraryEntry;
  workflowRecordingExportBusyThreadId?: string;
  workflowRecordingExportStatus?: ApiKeyStatus;
  workflowLabRun?: WorkflowLabRun;
  workflowLabBusy?: WorkflowLabBusy;
  workflowLabGoal: string;
  workflowLabStatus?: ApiKeyStatus;
  onEditWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => void;
  onPreviewLocalPath: (path: string) => void;
  onExportWorkflowRecordingPlaybookSession: (playbook: WorkflowRecordingLibraryEntry) => Promise<void> | void;
  onRestoreWorkflowRecordingVersion: (id: string, version: number) => Promise<void> | void;
  onSchedulePlaybook: (playbook: WorkflowRecordingLibraryEntry) => void;
  onSetWorkflowRecordingEnabled: (id: string, enabled: boolean) => Promise<void> | void;
  onUnarchiveWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => Promise<void> | void;
  onArchiveWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => Promise<void> | void;
  onWorkflowLabGoalChange: (goal: string) => void;
  onCreateWorkflowLabRun: (playbook: WorkflowRecordingLibraryEntry) => void;
  onStartWorkflowLabRun: () => void;
  onStopWorkflowLabRun: () => void;
  onAdoptWorkflowLabBestVariant: () => void;
};

export function workflowRecordingPlaybookMatchesQuery(playbook: WorkflowRecordingLibraryEntry, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [playbook.title, playbook.summary, playbook.id, playbook.toolNames.join(" "), playbook.outputShape.join(" ")]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function previousWorkflowRecordingVersion(playbook: WorkflowRecordingLibraryEntry) {
  return playbook.versions.find((version) => version.version !== playbook.version);
}

export function WorkflowRecordingPlaybookLibrarySection({
  playbooks,
  query,
  includeArchived,
  refreshing,
  exportBusyThreadId,
  exportStatus,
  onQueryChange,
  onIncludeArchivedChange,
  onRefresh,
  onEditPlaybook,
  onOpenPlaybook,
  onPreviewLocalPath,
  onExportPlaybookSession,
  onRestoreVersion,
  onSetEnabled,
  onUnarchivePlaybook,
  onArchivePlaybook,
}: WorkflowRecordingPlaybookLibrarySectionProps) {
  const archivedCount = playbooks.filter((entry) => entry.archivedAt).length;
  const activeCount = playbooks.length - archivedCount;
  const visiblePlaybooks = playbooks.filter((entry) => workflowRecordingPlaybookMatchesQuery(entry, query)).slice(0, 5);

  return (
    <section className="workflow-recorder-library-section" aria-label="Saved workflow playbooks">
      <div className="workflow-recorder-library-heading">
        <div>
          <AutomationHeadingLabel tooltip="Confirmed recorder playbooks saved under .ambient/workflows for search, describe, and later injection.">
            Saved Workflow Playbooks
          </AutomationHeadingLabel>
          <p>Search confirmed recordings by intent, tool examples, or expected output before reusing them.</p>
        </div>
        <div className="workflow-recorder-library-heading-actions">
          <button
            type="button"
            className="panel-button mini"
            aria-label="Refresh saved workflow playbooks"
            title="Reload saved workflow playbooks and version history from disk."
            disabled={refreshing}
            onClick={() => void onRefresh()}
          >
            {refreshing ? <LoaderCircle size={12} className="spin" /> : <RefreshCw size={12} />}
            Refresh
          </button>
          <span>{activeCount} active{includeArchived && archivedCount ? `, ${archivedCount} archived` : ""}</span>
        </div>
      </div>
      <div className="workflow-recorder-library-controls">
        <label className="workflow-recorder-library-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search intent, tool, or output shape"
          />
        </label>
        <label className="workflow-recorder-library-toggle">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => onIncludeArchivedChange(event.target.checked)}
          />
          <span>Archived</span>
        </label>
      </div>
      <div className="workflow-recorder-library-list">
        {visiblePlaybooks.length ? (
          visiblePlaybooks.map((entry) => {
            const exportBusy = Boolean(entry.threadId && exportBusyThreadId === entry.threadId);
            const exportDisabled = Boolean(exportBusyThreadId) || !entry.threadId;
            const editModel = workflowRecorderEditWithAmbientModel(entry);
            const previousVersion = previousWorkflowRecordingVersion(entry);
            return (
              <article key={entry.id} className={`workflow-recorder-library-card ${entry.enabled && !entry.archivedAt ? "" : "disabled"}`}>
                <div className="workflow-recorder-library-card-main">
                  <Package size={16} />
                  <div>
                    <strong>{entry.title}</strong>
                    <p>{entry.summary}</p>
                    <div className="workflow-recorder-library-meta">
                      <span>v{entry.version}</span>
                      {entry.archivedAt && <span>Archived</span>}
                      <span>{entry.enabled ? "Enabled" : "Disabled"}</span>
                      <span>{entry.versions.length} version{entry.versions.length === 1 ? "" : "s"}</span>
                      {entry.toolNames.slice(0, 3).map((toolName) => (
                        <span key={toolName}>{toolName}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="workflow-recorder-library-actions">
                  <button type="button" className="panel-button mini" title={editModel.buttonTitle} onClick={() => onEditPlaybook(entry)}>
                    <Pencil size={12} />
                    {editModel.buttonLabel}
                  </button>
                  <button type="button" className="panel-button mini" onClick={() => onOpenPlaybook(entry)}>
                    <Brain size={12} />
                    Open
                  </button>
                  <button type="button" className="panel-button mini" onClick={() => onPreviewLocalPath(entry.markdownPath)}>
                    <FileText size={12} />
                    workflow.md
                  </button>
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={exportDisabled}
                    title={
                      entry.threadId
                        ? "Export the full redacted Pi session log and visible transcript for this workflow recording."
                        : "This saved playbook does not reference a source chat thread to export."
                    }
                    onClick={() => void onExportPlaybookSession(entry)}
                  >
                    {exportBusy ? <LoaderCircle size={12} className="spin" /> : <Download size={12} />}
                    Export session
                  </button>
                  {previousVersion && (
                    <button
                      type="button"
                      className="panel-button mini"
                      onClick={() => void onRestoreVersion(entry.id, previousVersion.version)}
                    >
                      <RotateCcw size={12} />
                      Restore v{previousVersion.version}
                    </button>
                  )}
                  <button
                    type="button"
                    className="panel-button mini"
                    onClick={() => void onSetEnabled(entry.id, !entry.enabled)}
                  >
                    {entry.enabled ? <X size={12} /> : <Check size={12} />}
                    {entry.enabled ? "Disable" : "Enable"}
                  </button>
                  {entry.archivedAt ? (
                    <button type="button" className="panel-button mini" onClick={() => void onUnarchivePlaybook(entry)}>
                      <Archive size={12} />
                      Unarchive
                    </button>
                  ) : (
                    <button type="button" className="panel-button mini" onClick={() => void onArchivePlaybook(entry)}>
                      <Archive size={12} />
                      Archive
                    </button>
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <p className="workflow-recorder-library-empty">No saved workflow playbooks match this search.</p>
        )}
      </div>
      {exportStatus && <p className={`panel-status ${exportStatus.kind}`}>{exportStatus.message}</p>}
    </section>
  );
}

export function WorkflowLabPlaybookLibrarySection({
  playbooks,
  headingTooltip,
  onNewRecording,
  onOpenPlaybook,
  onPreviewLocalPath,
}: WorkflowLabPlaybookLibrarySectionProps) {
  const labPlaybooks = playbooks.filter((entry) => !entry.archivedAt);
  const archivedCount = playbooks.length - labPlaybooks.length;

  return (
    <div className="automation-pane-shell">
      <section className="automation-section workflow-lab-intro-section">
        <div className="panel-section-heading">
          <AutomationHeadingLabel tooltip={headingTooltip}>Workflow Lab</AutomationHeadingLabel>
          <div className="plugin-badges">
            <span>{labPlaybooks.length} available</span>
            {archivedCount > 0 && <span>{archivedCount} archived</span>}
          </div>
        </div>
        <div className="workflow-lab-intro-grid">
          <div>
            <strong>Choose a saved playbook</strong>
            <p className="panel-note">The lab controls appear on the playbook detail page with the workshop goal, run controls, score graph, variants, and audit trail.</p>
          </div>
          <button type="button" className="panel-button mini" onClick={onNewRecording}>
            <MessageCircle size={13} />
            New recording
          </button>
        </div>
      </section>
      <section className="workflow-recorder-library-section workflow-lab-library-section" aria-label="Workflow Lab playbooks">
        <div className="workflow-recorder-library-heading">
          <div>
            <AutomationHeadingLabel tooltip="Confirmed playbooks that can be workshopped with Workflow Lab.">
              Saved Playbooks
            </AutomationHeadingLabel>
            <p>Select a playbook to open its Workflow Lab panel.</p>
          </div>
          <span>{labPlaybooks.length} ready</span>
        </div>
        <div className="workflow-recorder-library-list">
          {labPlaybooks.length ? (
            labPlaybooks.map((entry) => (
              <article key={entry.id} className={`workflow-recorder-library-card ${entry.enabled ? "" : "disabled"}`}>
                <div className="workflow-recorder-library-card-main">
                  <Package size={16} />
                  <div>
                    <strong>{entry.title}</strong>
                    <p>{entry.summary}</p>
                    <div className="workflow-recorder-library-meta">
                      <span>v{entry.version}</span>
                      <span>{entry.enabled ? "Enabled" : "Disabled"}</span>
                      <span>{entry.versions.length} version{entry.versions.length === 1 ? "" : "s"}</span>
                      {entry.toolNames.slice(0, 3).map((toolName) => (
                        <span key={toolName}>{toolName}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="workflow-recorder-library-actions">
                  <button type="button" className="panel-button mini primary" onClick={() => onOpenPlaybook(entry)}>
                    <Brain size={12} />
                    Workshop
                  </button>
                  <button type="button" className="panel-button mini" onClick={() => onPreviewLocalPath(entry.markdownPath)}>
                    <FileText size={12} />
                    workflow.md
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p className="workflow-recorder-library-empty">No saved workflow playbooks are available yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export function WorkflowRecordingPlaybookPane({
  playbook,
  workflowRecordingExportBusyThreadId,
  workflowRecordingExportStatus,
  workflowLabRun,
  workflowLabBusy,
  workflowLabGoal,
  workflowLabStatus,
  onEditWorkflowRecordingPlaybook,
  onPreviewLocalPath,
  onExportWorkflowRecordingPlaybookSession,
  onRestoreWorkflowRecordingVersion,
  onSchedulePlaybook,
  onSetWorkflowRecordingEnabled,
  onUnarchiveWorkflowRecordingPlaybook,
  onArchiveWorkflowRecordingPlaybook,
  onWorkflowLabGoalChange,
  onCreateWorkflowLabRun,
  onStartWorkflowLabRun,
  onStopWorkflowLabRun,
  onAdoptWorkflowLabBestVariant,
}: WorkflowRecordingPlaybookPaneProps) {
  const previousVersion = previousWorkflowRecordingVersion(playbook);
  const exportBusy = Boolean(playbook.threadId && workflowRecordingExportBusyThreadId === playbook.threadId);
  const exportDisabled = Boolean(workflowRecordingExportBusyThreadId) || !playbook.threadId;
  const editModel = workflowRecorderEditWithAmbientModel(playbook);

  return (
    <div className="automation-pane-shell">
      <section className="automation-section automation-focus-primary">
        <div className="panel-section-heading">
          <AutomationHeadingLabel tooltip="A confirmed Workflow Recorder playbook saved under .ambient/workflows.">Saved Workflow Playbook</AutomationHeadingLabel>
          <div className="plugin-badges">
            {playbook.archivedAt && <span>Archived</span>}
            <span>{playbook.enabled ? "Enabled" : "Disabled"}</span>
            <span>v{playbook.version}</span>
            <span>{playbook.versions.length} version{playbook.versions.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div className={`workflow-recorder-playbook-detail ${playbook.enabled && !playbook.archivedAt ? "" : "disabled"}`}>
          <div className="workflow-recorder-playbook-title">
            <Package size={20} />
            <div>
              <h2>{playbook.title}</h2>
              <p>{playbook.summary}</p>
            </div>
          </div>
          <div className="workflow-recorder-playbook-actions">
            <button type="button" className="panel-button mini" title={editModel.buttonTitle} onClick={() => onEditWorkflowRecordingPlaybook(playbook)}>
              <Pencil size={13} />
              {editModel.buttonLabel}
            </button>
            <button type="button" className="panel-button mini" onClick={() => onPreviewLocalPath(playbook.markdownPath)}>
              Open workflow.md
            </button>
            <button
              type="button"
              className="panel-button mini"
              disabled={exportDisabled}
              title={
                playbook.threadId
                  ? "Export the full redacted Pi session log and visible transcript for this workflow recording."
                  : "This saved playbook does not reference a source chat thread to export."
              }
              onClick={() => void onExportWorkflowRecordingPlaybookSession(playbook)}
            >
              {exportBusy ? <LoaderCircle size={13} className="spin" /> : <Download size={13} />}
              Export session
            </button>
            {previousVersion && (
              <button type="button" className="panel-button mini" onClick={() => void onRestoreWorkflowRecordingVersion(playbook.id, previousVersion.version)}>
                <RotateCcw size={13} />
                Restore v{previousVersion.version}
              </button>
            )}
            <button
              type="button"
              className="panel-button mini"
              disabled={!playbook.enabled || Boolean(playbook.archivedAt)}
              title={playbook.archivedAt ? "Unarchive this playbook before scheduling it." : playbook.enabled ? "Create a schedule that runs the current enabled version in a dedicated chat thread." : "Enable this playbook before scheduling it."}
              onClick={() => onSchedulePlaybook(playbook)}
            >
              <CalendarPlus size={13} />
              Schedule
            </button>
            <button type="button" className="panel-button mini" onClick={() => void onSetWorkflowRecordingEnabled(playbook.id, !playbook.enabled)}>
              {playbook.enabled ? <X size={13} /> : <Check size={13} />}
              {playbook.enabled ? "Disable" : "Enable"}
            </button>
            {playbook.archivedAt ? (
              <button type="button" className="panel-button mini" onClick={() => void onUnarchiveWorkflowRecordingPlaybook(playbook)}>
                <Archive size={13} />
                Unarchive
              </button>
            ) : (
              <button type="button" className="panel-button mini" onClick={() => void onArchiveWorkflowRecordingPlaybook(playbook)}>
                <Archive size={13} />
                Archive
              </button>
            )}
          </div>
        </div>
        {playbook.archivedAt && (
          <p className="panel-note">
            Archived {formatTimelineTime(playbook.archivedAt)}
            {playbook.archivedReason ? `: ${playbook.archivedReason}` : ""}.
          </p>
        )}
        {workflowRecordingExportStatus && <p className={`panel-status ${workflowRecordingExportStatus.kind}`}>{workflowRecordingExportStatus.message}</p>}
        <WorkflowLabPanel
          playbook={playbook}
          run={workflowLabRun}
          busy={workflowLabBusy}
          goal={workflowLabGoal}
          status={workflowLabStatus}
          onGoalChange={onWorkflowLabGoalChange}
          onCreateRun={onCreateWorkflowLabRun}
          onStartRun={onStartWorkflowLabRun}
          onStopRun={onStopWorkflowLabRun}
          onAdoptBest={onAdoptWorkflowLabBestVariant}
        />
        <div className="grid two">
          <section className="automation-status-section">
            <AutomationHeadingLabel tooltip="Concrete successful tool names captured from the original chat.">Successful Tool Examples</AutomationHeadingLabel>
            <div className="plugin-badges">
              {playbook.toolNames.length ? playbook.toolNames.map((toolName) => <span key={toolName}>{toolName}</span>) : <span>No tool examples recorded</span>}
            </div>
          </section>
          <section className="automation-status-section">
            <AutomationHeadingLabel tooltip="The expected final answer or artifact shape for replay guidance.">Output Shape</AutomationHeadingLabel>
            <ul className="workflow-recorder-playbook-list">
              {playbook.outputShape.length ? playbook.outputShape.map((item) => <li key={item}>{item}</li>) : <li>No output shape recorded.</li>}
            </ul>
          </section>
        </div>
        <section className="automation-section">
          <AutomationHeadingLabel tooltip="Immutable version snapshots written under the playbook package.">Version History</AutomationHeadingLabel>
          <div className="workflow-recorder-version-list">
            {playbook.versions.map((version) => (
              <div className={version.version === playbook.version ? "current" : ""} key={version.version}>
                <strong>v{version.version}</strong>
                <span>{version.restoredFromVersion ? `Restored from v${version.restoredFromVersion}` : version.title}</span>
                <small>{formatTimelineTime(version.savedAt)}</small>
              </div>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
