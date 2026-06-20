import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexSource = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
const desktopStateEventServiceSource = readFileSync(new URL("../desktop-shell/desktopStateEventService.ts", import.meta.url), "utf8");
const globalLibraryDesktopServiceSource = readFileSync(new URL("./workflowRecordingGlobalLibraryDesktopService.ts", import.meta.url), "utf8");

describe("workflow recording library state events", () => {
  it("emits state refreshes for saved playbook mutations even outside the active project host", () => {
    expect(desktopStateEventServiceSource).toContain("function emitWorkflowRecordingLibraryStateChanged");
    expect(desktopStateEventServiceSource).toContain("state: dependencies.readState(dependencies.activeThreadId(), { markActiveRead: false })");
    expect(indexSource).toContain("emitWorkflowRecordingLibraryStateChanged,");
    expect(globalLibraryDesktopServiceSource).toContain("function updateGlobalAmbientWorkflowPlaybook");
    expect(globalLibraryDesktopServiceSource).toContain("function restoreGlobalAmbientWorkflowPlaybookVersion");
    expect(globalLibraryDesktopServiceSource.match(/emitWorkflowRecordingLibraryStateChanged/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });
});
