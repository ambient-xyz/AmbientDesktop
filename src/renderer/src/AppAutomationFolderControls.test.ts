import { describe, expect, it } from "vitest";

import type { AutomationFolderSummary, AutomationThreadSummary } from "../../shared/automationTypes";
import {
  createdCustomFolderId,
  fallbackFolderId,
  folderContainsThread,
  folderNameForCreate,
} from "./AppAutomationFolderControls";

describe("App automation folder controls", () => {
  it("keeps the existing first-folder fallback for refreshed navigation folders", () => {
    expect(fallbackFolderId([folder({ id: "inbox" }), folder({ id: "later" })])).toBe("inbox");
    expect(fallbackFolderId([])).toBe("home");
  });

  it("detects whether a selected thread still exists after folder refresh", () => {
    const folders = [
      folder({ id: "home", threads: [thread({ id: "task-1" })] }),
      folder({ id: "later", threads: [thread({ id: "task-2" })] }),
    ];

    expect(folderContainsThread(folders, "task-2")).toBe(true);
    expect(folderContainsThread(folders, "missing")).toBe(false);
  });

  it("selects the newly created custom folder by name with the existing fallback", () => {
    expect(createdCustomFolderId([
      folder({ id: "home", name: "Home", kind: "home" }),
      folder({ id: "custom-1", name: "Invoices", kind: "custom" }),
    ], "Invoices")).toBe("custom-1");
    expect(createdCustomFolderId([folder({ id: "home", name: "Home", kind: "home" })], "Missing")).toBe("home");
  });

  it("ignores blank folder create requests after trimming", () => {
    expect(folderNameForCreate("  Invoices  ")).toBe("Invoices");
    expect(folderNameForCreate("   ")).toBeUndefined();
  });
});

function folder(overrides: Partial<AutomationFolderSummary> = {}): AutomationFolderSummary {
  return {
    id: overrides.id ?? "folder",
    name: overrides.name ?? "Folder",
    kind: overrides.kind ?? "custom",
    createdAt: overrides.createdAt ?? "2026-06-13T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-13T00:00:00.000Z",
    threads: overrides.threads ?? [],
    ...overrides,
  };
}

function thread(overrides: Partial<AutomationThreadSummary> = {}): AutomationThreadSummary {
  return {
    id: overrides.id ?? "task",
    title: overrides.title ?? "Task",
    folderId: overrides.folderId ?? "folder",
    kind: overrides.kind ?? "orchestration_task",
    sourceId: overrides.sourceId ?? "source",
    preview: overrides.preview ?? "Preview",
    status: overrides.status ?? "ready",
    projectName: overrides.projectName ?? "Project",
    projectPath: overrides.projectPath ?? "/workspace",
    badges: overrides.badges ?? [],
    createdAt: overrides.createdAt ?? "2026-06-13T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}
