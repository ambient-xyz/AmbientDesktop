import { describe, expect, it } from "vitest";

import type { WorkflowRecordingLibraryEntry } from "../../shared/types";
import {
  selectedWorkflowRecordingForLibrary,
  workflowRecordingLibraryForDisplay,
  workflowRecordingSelectionIsMissing,
} from "./AppWorkflowRecordingLibraryControls";

describe("AppWorkflowRecordingLibraryControls", () => {
  it("uses the archived override library when one has been loaded", () => {
    const active = [playbook({ id: "active" })];
    const withArchived = [playbook({ id: "active" }), playbook({ id: "archived", archivedAt: "2026-06-13T00:00:00.000Z" })];

    expect(workflowRecordingLibraryForDisplay({ defaultLibrary: active, override: undefined })).toBe(active);
    expect(workflowRecordingLibraryForDisplay({ defaultLibrary: active, override: withArchived })).toBe(withArchived);
  });

  it("selects the workflow recording from the visible library", () => {
    const library = [playbook({ id: "one" }), playbook({ id: "two" })];

    expect(selectedWorkflowRecordingForLibrary({ library, selectedId: "two" })).toBe(library[1]);
    expect(selectedWorkflowRecordingForLibrary({ library, selectedId: "missing" })).toBeUndefined();
    expect(selectedWorkflowRecordingForLibrary({ library, selectedId: undefined })).toBeUndefined();
  });

  it("clears only stale workflow recording selections", () => {
    const selected = playbook({ id: "selected" });

    expect(workflowRecordingSelectionIsMissing({ selected, selectedId: "selected" })).toBe(false);
    expect(workflowRecordingSelectionIsMissing({ selected: undefined, selectedId: "missing" })).toBe(true);
    expect(workflowRecordingSelectionIsMissing({ selected: undefined, selectedId: undefined })).toBe(false);
  });
});

function playbook(overrides: Pick<WorkflowRecordingLibraryEntry, "id"> & Partial<WorkflowRecordingLibraryEntry>): WorkflowRecordingLibraryEntry {
  const { id, ...rest } = overrides;
  return {
    id,
    title: overrides.title ?? `Playbook ${id}`,
    version: overrides.version ?? 1,
    enabled: overrides.enabled ?? true,
    savedAt: overrides.savedAt ?? "2026-06-13T00:00:00.000Z",
    manifestPath: overrides.manifestPath ?? `/tmp/${id}/manifest.json`,
    markdownPath: overrides.markdownPath ?? `/tmp/${id}/README.md`,
    sidecarPath: overrides.sidecarPath ?? `/tmp/${id}/sidecar.json`,
    transcriptPath: overrides.transcriptPath ?? `/tmp/${id}/transcript.json`,
    summary: overrides.summary ?? "A workflow recording playbook.",
    toolNames: overrides.toolNames ?? [],
    outputShape: overrides.outputShape ?? [],
    versions: overrides.versions ?? [],
    ...rest,
  };
}
