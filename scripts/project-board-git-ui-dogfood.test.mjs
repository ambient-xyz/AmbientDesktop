import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("project-board Git UI dogfood contracts", () => {
  it("covers objective Add Cards handoff through the app surface", async () => {
    const source = await readFile(new URL("./project-board-git-ui-dogfood.mjs", import.meta.url), "utf8");
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

    expect(packageJson.scripts["test:project-board-objective-handoff-ui-dogfood"]).toBe("node scripts/project-board-git-ui-dogfood.mjs");
    expect(packageJson.scripts["test:project-board-objective-continuation-ui-live"]).toBe(
      "AMBIENT_PROJECT_BOARD_GIT_UI_LIVE_OBJECTIVE_CONTINUATION=1 node scripts/project-board-git-ui-dogfood.mjs",
    );
    expect(source).toContain("writeObjectiveCardArtifact");
    expect(source).toContain("runLiveObjectiveContinuation");
    expect(source).toContain("AMBIENT_PROJECT_BOARD_GIT_UI_LIVE_OBJECTIVE_CONTINUATION");
    expect(source).toContain("retryable_failure");
    expect(source).toContain("objective:swimlane-filter-shortcuts");
    expect(source).toContain("KANBAN_ACCESSIBILITY.md");
    expect(source).toContain("Add Cards objective");
    expect(source).toContain("Source-scan grounded");
    expect(source).toContain("05-draft-inbox-objective-card.png");
    expect(source).toContain("06-pm-review-live-objective-continuation.png");
    expect(source).toContain("waitForBodyText");
    expect(source).toContain("objective provenance stayed visible in Draft Inbox");
    expect(source).toContain("without recreating the inherited objective card");
  });
});
