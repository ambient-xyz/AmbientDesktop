import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("project-board in-app dogfood prompt contracts", () => {
  it("does not contradict the required initial task heartbeat", async () => {
    const source = await readDogfoodSources();

    expect(source).toContain("First board action: call native `task_heartbeat`");
    expect(source).toContain("before reading files, editing files, or running shell commands");
    expect(source).toContain("First implementation action after that checkpoint");
    expect(source).not.toContain("before emitting any proof, heartbeat");
    expect(source).not.toContain("Do this concrete file edit before emitting");
  });

  it("keeps the focused pause/resume dogfood on PM Review UI controls", async () => {
    const source = await readDogfoodSources();

    expect(source).toContain("AMBIENT_PROJECT_BOARD_DOGFOOD_PAUSE_RESUME");
    expect(source).toContain("runPauseResumePlanningDogfood");
    expect(source).toContain('clickButton(cdp, "Pause Planning"');
    expect(source).toContain('clickButton(cdp, "Resume Planning"');
    expect(source).toContain("setOrchestrationAutoDispatchEnabled");
    expect(source).toContain("post-resume rendered planning progress");
    expect(source).toContain("pause-resume-03-resumed-draft-inbox.png");
    expect(source).toContain("Expected no duplicate rendered cards after resume");
    expect(source).toContain("--remote-allow-origins=*");
  });

  it("keeps the focused Start Fresh dogfood on PM Review UI controls", async () => {
    const source = await readDogfoodSources();

    expect(source).toContain("AMBIENT_PROJECT_BOARD_DOGFOOD_START_FRESH");
    expect(source).toContain("runStartFreshPlanningDogfood");
    expect(source).toContain('clickButton(cdp, "Start Fresh"');
    expect(source).toContain("start-fresh-03-fresh-draft-inbox.png");
    expect(source).toContain("start-fresh-04-superseded-history.png");
    expect(source).toContain('clickButtonIn(cdp, ".project-board-tabs", "History"');
    expect(source).toContain("Start Fresh superseded-card history review");
    expect(source).toContain("Expected Start Fresh run not to load previous progressive records");
    expect(source).toContain("Expected no duplicate rendered cards after Start Fresh");
    expect(source).toContain("synthesisRunLoadedPreviousRecords");
  });

  it("records PM Review generated-card worker task-action protocol gaps explicitly", async () => {
    const source = await readDogfoodSources();

    expect(source).toContain("terminal_task_action");
    expect(source).toContain("proof_block_complete_followup_or_handoff");
    expect(source).toContain("protocolSatisfied");
    expect(source).toContain("PM Review generated-card worker did not emit the expected project-board task action protocol");
  });
});

async function readDogfoodSources() {
  return (
    await Promise.all([
      readFile(new URL("./project-board-in-app-dogfood.mjs", import.meta.url), "utf8"),
      readFile(new URL("./project-board-in-app-dogfood-cdp-helpers.mjs", import.meta.url), "utf8"),
      readFile(new URL("./project-board-in-app-dogfood-proof-helpers.mjs", import.meta.url), "utf8"),
      readFile(new URL("./project-board-in-app-dogfood-scenario-helpers.mjs", import.meta.url), "utf8"),
    ])
  ).join("\n");
}
