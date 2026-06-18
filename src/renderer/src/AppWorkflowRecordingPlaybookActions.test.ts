import { describe, expect, it } from "vitest";

import type { WorkflowRecordingLibraryEntry } from "../../shared/workflowTypes";
import {
  workflowRecordingEditDraftRequest,
  workflowRecordingPreviewFallbackMessage,
} from "./AppWorkflowRecordingPlaybookActions";

function playbook(overrides: Partial<WorkflowRecordingLibraryEntry> = {}): WorkflowRecordingLibraryEntry {
  return {
    id: "playbook-1",
    title: "Review invoices",
    version: 3,
    enabled: true,
    savedAt: "2026-06-13T00:00:00.000Z",
    manifestPath: "/repo/.ambient/workflows/review/manifest.json",
    markdownPath: "/repo/.ambient/workflows/review/playbook.md",
    sidecarPath: "/repo/.ambient/workflows/review/sidecar.json",
    transcriptPath: "/repo/.ambient/workflows/review/transcript.jsonl",
    summary: "Review invoice emails and prepare a draft response.",
    toolNames: ["gmail_search", "gmail_draft"],
    outputShape: ["draft email"],
    versions: [],
    ...overrides,
  };
}

describe("App workflow recording playbook actions", () => {
  it("builds the Ambient edit context and composer draft from a saved playbook", () => {
    const request = workflowRecordingEditDraftRequest(playbook(), 42);

    expect(request.browserPreviewPath).toBe("/repo/.ambient/workflows/review/playbook.md");
    expect(request.composerDraft).toEqual({
      value: "I'd like to edit this workflow \"Review invoices\" to ",
      nonce: 42,
    });
    expect(request.editContext).toEqual({
      id: "playbook-1",
      title: "Review invoices",
      version: 3,
      manifestPath: "/repo/.ambient/workflows/review/manifest.json",
      markdownPath: "/repo/.ambient/workflows/review/playbook.md",
      sidecarPath: "/repo/.ambient/workflows/review/sidecar.json",
      transcriptPath: "/repo/.ambient/workflows/review/transcript.jsonl",
      draftPrefix: "I'd like to edit this workflow \"Review invoices\" to ",
    });
  });

  it("keeps preview fallback messages stable for Error and non-Error failures", () => {
    expect(workflowRecordingPreviewFallbackMessage(new Error("browser unavailable"))).toBe(
      "Opened workflow in Files instead of Browser: browser unavailable",
    );
    expect(workflowRecordingPreviewFallbackMessage("no browser")).toBe(
      "Opened workflow in Files instead of Browser: no browser",
    );
  });
});
