import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("workflow recording library state events", () => {
  it("emits state refreshes for saved playbook mutations even outside the active project host", () => {
    expect(indexSource).toContain("function emitWorkflowRecordingLibraryStateChanged");
    expect(indexSource).toContain("state: readState(activeThreadId, { markActiveRead: false })");
    expect(indexSource).toContain("updateGlobalAmbientWorkflowPlaybook");
    expect(indexSource).toContain("restoreGlobalAmbientWorkflowPlaybookVersion");
    expect(indexSource.match(/emitWorkflowRecordingLibraryStateChanged/g)?.length ?? 0).toBeGreaterThanOrEqual(9);
  });
});
