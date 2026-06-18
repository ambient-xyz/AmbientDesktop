import { describe, expect, it } from "vitest";

import type { ExportChatResult } from "../../shared/threadTypes";
import {
  chatExportStatusMessage,
  workflowRecordingExportErrorStatus,
  workflowRecordingExportResultStatus,
  workflowRecordingMissingThreadExportStatus,
} from "./AutomationsWorkflowRecordingLibraryController";

describe("Automations workflow recording library controller helpers", () => {
  it("formats export success status for Pi session and visible transcript sources", () => {
    expect(
      chatExportStatusMessage(exportResult({
        source: "pi-session",
        path: "/repo/artifacts/session-export.jsonl",
      })),
    ).toBe("Exported Pi session: session-export.jsonl");

    expect(
      chatExportStatusMessage(exportResult({
        source: "visible-chat-fallback",
        path: "visible-transcript.md",
      })),
    ).toBe("Exported visible transcript fallback: visible-transcript.md");
  });

  it("models export blocked, canceled, and failed statuses", () => {
    expect(workflowRecordingMissingThreadExportStatus()).toEqual({
      kind: "error",
      message: "This saved playbook does not reference a source chat thread to export.",
    });
    expect(workflowRecordingExportResultStatus(undefined)).toEqual({
      kind: "info",
      message: "Export canceled.",
    });
    expect(workflowRecordingExportErrorStatus(new Error("Disk full"))).toEqual({
      kind: "error",
      message: "Disk full",
    });
  });
});

function exportResult(overrides: Partial<ExportChatResult> = {}): ExportChatResult {
  return {
    path: "/repo/export.jsonl",
    bytes: 2048,
    createdAt: "2026-06-15T00:00:00.000Z",
    source: "pi-session",
    ...overrides,
  };
}
