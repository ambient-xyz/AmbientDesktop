import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkflowRecordingLibraryEntry } from "../../shared/workflowTypes";
import {
  WorkflowLabPlaybookLibrarySection,
  WorkflowRecordingPlaybookLibrarySection,
  WorkflowRecordingPlaybookPane,
  workflowRecordingPlaybookMatchesQuery,
} from "./AutomationsWorkflowPlaybookViews";

describe("Automations workflow playbook views", () => {
  it("renders saved playbook library search, counts, export state, and actions through explicit props", () => {
    const active = playbook();
    const archived = playbook({
      id: "playbook-archived",
      title: "Archive vendor receipts",
      archivedAt: "2026-06-14T10:00:00.000Z",
      threadId: undefined,
      toolNames: ["filesystem_read"],
      outputShape: ["receipt archive"],
    });

    const markup = renderToStaticMarkup(
      <WorkflowRecordingPlaybookLibrarySection
        playbooks={[active, archived]}
        query="gmail"
        includeArchived={true}
        refreshing={true}
        exportBusyThreadId="thread-1"
        exportStatus={{ kind: "info", message: "Exporting session." }}
        onQueryChange={() => undefined}
        onIncludeArchivedChange={() => undefined}
        onRefresh={() => undefined}
        onEditPlaybook={() => undefined}
        onOpenPlaybook={() => undefined}
        onPreviewLocalPath={() => undefined}
        onExportPlaybookSession={() => undefined}
        onRestoreVersion={() => undefined}
        onSetEnabled={() => undefined}
        onUnarchivePlaybook={() => undefined}
        onArchivePlaybook={() => undefined}
      />,
    );

    expect(markup).toContain("Saved Workflow Playbooks");
    expect(markup).toContain("1 active, 1 archived");
    expect(markup).toContain("Search intent, tool, or output shape");
    expect(markup).toContain("Review invoices");
    expect(markup).toContain("gmail_search");
    expect(markup).toContain("Edit with Ambient");
    expect(markup).toContain("Open");
    expect(markup).toContain("workflow.md");
    expect(markup).toContain("Export session");
    expect(markup).toContain("Restore v2");
    expect(markup).toContain("Disable");
    expect(markup).toContain("Archive");
    expect(markup).toContain("Exporting session.");
    expect(markup).not.toContain("Archive vendor receipts");
  });

  it("renders library empty search state and preserves archived-match query semantics", () => {
    const archived = playbook({
      id: "playbook-archived",
      title: "Archive vendor receipts",
      archivedAt: "2026-06-14T10:00:00.000Z",
      threadId: undefined,
      toolNames: ["filesystem_read"],
      outputShape: ["receipt archive"],
    });

    expect(workflowRecordingPlaybookMatchesQuery(archived, "receipt archive")).toBe(true);
    expect(workflowRecordingPlaybookMatchesQuery(archived, "missing")).toBe(false);

    const markup = renderToStaticMarkup(
      <WorkflowRecordingPlaybookLibrarySection
        playbooks={[archived]}
        query="missing"
        includeArchived={false}
        refreshing={false}
        onQueryChange={() => undefined}
        onIncludeArchivedChange={() => undefined}
        onRefresh={() => undefined}
        onEditPlaybook={() => undefined}
        onOpenPlaybook={() => undefined}
        onPreviewLocalPath={() => undefined}
        onExportPlaybookSession={() => undefined}
        onRestoreVersion={() => undefined}
        onSetEnabled={() => undefined}
        onUnarchivePlaybook={() => undefined}
        onArchivePlaybook={() => undefined}
      />,
    );

    expect(markup).toContain("0 active");
    expect(markup).toContain("No saved workflow playbooks match this search.");
  });

  it("renders Workflow Lab playbook library while hiding archived entries", () => {
    const active = playbook();
    const archived = playbook({
      id: "playbook-archived",
      title: "Archive vendor receipts",
      archivedAt: "2026-06-14T10:00:00.000Z",
    });

    const markup = renderToStaticMarkup(
      <WorkflowLabPlaybookLibrarySection
        playbooks={[active, archived]}
        headingTooltip="Workshop saved playbooks."
        onNewRecording={() => undefined}
        onOpenPlaybook={() => undefined}
        onPreviewLocalPath={() => undefined}
      />,
    );

    expect(markup).toContain("Workflow Lab");
    expect(markup).toContain("1 available");
    expect(markup).toContain("1 archived");
    expect(markup).toContain("New recording");
    expect(markup).toContain("Saved Playbooks");
    expect(markup).toContain("1 ready");
    expect(markup).toContain("Review invoices");
    expect(markup).toContain("Workshop");
    expect(markup).toContain("workflow.md");
    expect(markup).not.toContain("Archive vendor receipts");
  });

  it("renders selected playbook detail, lab controls, examples, and versions through explicit props", () => {
    const markup = renderToStaticMarkup(
      <WorkflowRecordingPlaybookPane
        playbook={playbook()}
        workflowRecordingExportBusyThreadId="thread-1"
        workflowRecordingExportStatus={{ kind: "success", message: "Exported session log." }}
        workflowLabGoal="Improve reliability."
        workflowLabStatus={{ kind: "info", message: "Lab ready." }}
        onEditWorkflowRecordingPlaybook={() => undefined}
        onPreviewLocalPath={() => undefined}
        onExportWorkflowRecordingPlaybookSession={() => undefined}
        onRestoreWorkflowRecordingVersion={() => undefined}
        onSchedulePlaybook={() => undefined}
        onSetWorkflowRecordingEnabled={() => undefined}
        onUnarchiveWorkflowRecordingPlaybook={() => undefined}
        onArchiveWorkflowRecordingPlaybook={() => undefined}
        onWorkflowLabGoalChange={() => undefined}
        onCreateWorkflowLabRun={() => undefined}
        onStartWorkflowLabRun={() => undefined}
        onStopWorkflowLabRun={() => undefined}
        onAdoptWorkflowLabBestVariant={() => undefined}
      />,
    );

    expect(markup).toContain("Saved Workflow Playbook");
    expect(markup).toContain("Review invoices");
    expect(markup).toContain("Edit with Ambient");
    expect(markup).toContain("Export session");
    expect(markup).toContain("Restore v2");
    expect(markup).toContain("Schedule");
    expect(markup).toContain("Exported session log.");
    expect(markup).toContain("Workflow Lab");
    expect(markup).toContain("Improve reliability.");
    expect(markup).toContain("Lab ready.");
    expect(markup).toContain("Successful Tool Examples");
    expect(markup).toContain("gmail_search");
    expect(markup).toContain("draft email");
    expect(markup).toContain("Version History");
    expect(markup).toContain("Restored from v1");
  });

  it("renders archived and export-disabled playbook states without owning commands", () => {
    const markup = renderToStaticMarkup(
      <WorkflowRecordingPlaybookPane
        playbook={playbook({
          enabled: false,
          archivedAt: "2026-06-14T10:00:00.000Z",
          archivedReason: "Replaced by a newer workflow.",
          threadId: undefined,
          toolNames: [],
          outputShape: [],
        })}
        workflowLabGoal=""
        onEditWorkflowRecordingPlaybook={() => undefined}
        onPreviewLocalPath={() => undefined}
        onExportWorkflowRecordingPlaybookSession={() => undefined}
        onRestoreWorkflowRecordingVersion={() => undefined}
        onSchedulePlaybook={() => undefined}
        onSetWorkflowRecordingEnabled={() => undefined}
        onUnarchiveWorkflowRecordingPlaybook={() => undefined}
        onArchiveWorkflowRecordingPlaybook={() => undefined}
        onWorkflowLabGoalChange={() => undefined}
        onCreateWorkflowLabRun={() => undefined}
        onStartWorkflowLabRun={() => undefined}
        onStopWorkflowLabRun={() => undefined}
        onAdoptWorkflowLabBestVariant={() => undefined}
      />,
    );

    expect(markup).toContain("Archived");
    expect(markup).toContain("Replaced by a newer workflow.");
    expect(markup).toContain("This saved playbook does not reference a source chat thread to export.");
    expect(markup).toContain("Unarchive this playbook before scheduling it.");
    expect(markup).toContain("Enable");
    expect(markup).toContain("Unarchive");
    expect(markup).toContain("No tool examples recorded");
    expect(markup).toContain("No output shape recorded.");
  });
});

function playbook(overrides: Partial<WorkflowRecordingLibraryEntry> = {}): WorkflowRecordingLibraryEntry {
  return {
    id: "playbook-1",
    title: "Review invoices",
    version: 3,
    enabled: true,
    savedAt: "2026-06-13T00:00:00.000Z",
    threadId: "thread-1",
    manifestPath: "/repo/.ambient/workflows/review/manifest.json",
    markdownPath: "/repo/.ambient/workflows/review/workflow.md",
    sidecarPath: "/repo/.ambient/workflows/review/sidecar.json",
    transcriptPath: "/repo/.ambient/workflows/review/transcript.jsonl",
    summary: "Review invoice emails and prepare a draft response.",
    toolNames: ["gmail_search", "gmail_draft"],
    outputShape: ["draft email"],
    versions: [
      {
        version: 3,
        savedAt: "2026-06-13T00:00:00.000Z",
        title: "Review invoices",
        manifestPath: "/repo/.ambient/workflows/review/manifest.json",
        markdownPath: "/repo/.ambient/workflows/review/workflow.md",
        sidecarPath: "/repo/.ambient/workflows/review/sidecar.json",
        transcriptPath: "/repo/.ambient/workflows/review/transcript.jsonl",
        restoredFromVersion: 1,
      },
      {
        version: 2,
        savedAt: "2026-06-12T00:00:00.000Z",
        title: "Older review flow",
        manifestPath: "/repo/.ambient/workflows/review/v2/manifest.json",
        markdownPath: "/repo/.ambient/workflows/review/v2/workflow.md",
        sidecarPath: "/repo/.ambient/workflows/review/v2/sidecar.json",
        transcriptPath: "/repo/.ambient/workflows/review/v2/transcript.jsonl",
      },
    ],
    ...overrides,
  };
}
