import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const appAutomationsWorkspacePropsSource = readFileSync(new URL("./AppAutomationsWorkspaceProps.ts", import.meta.url), "utf8");
const appWorkflowRecordingLibraryControlsSource = readFileSync(new URL("./AppWorkflowRecordingLibraryControls.ts", import.meta.url), "utf8");
const appSidebarSource = readFileSync(new URL("./AppSidebar.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const workflowRecorderUiModelSource = readFileSync(new URL("./workflowRecorderUiModel.ts", import.meta.url), "utf8");

describe("workflow recorder library refresh UI", () => {
  it("exposes an explicit refresh action for workflow recordings", () => {
    expect(appSidebarSource).toContain("aria-label={workflowRecorderSurface.refreshLabel}");
    expect(workflowRecorderUiModelSource).toContain('refreshLabel: "Refresh Workflow Recordings"');
    expect(appSource).toContain("refreshWorkflowRecordingLibrary,");
    expect(appAutomationsWorkspacePropsSource).toContain("onRefreshWorkflowRecordingLibrary: () => refreshWorkflowRecordingLibrary()");
    expect(appWorkflowRecordingLibraryControlsSource).toContain("window.ambientDesktop.bootstrap()");
    expect(stylesSource).toContain(".workflow-recorder-library-heading-actions");
  });
});
