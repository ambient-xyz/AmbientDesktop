import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Async long-context Desktop dogfood harness wiring", () => {
  it("exposes the scenario through package scripts and the Electron harness", async () => {
    const packageJson = JSON.parse(await readText("package.json"));
    const supervisor = await readText("scripts/run-electron-dogfood.mjs");

    expect(packageJson.scripts["test:async-long-context:desktop-dogfood"]).toContain("scripts/run-electron-dogfood.mjs");
    expect(packageJson.scripts["test:async-long-context:desktop-dogfood"]).toContain("--scenario=async-long-context");
    expect(packageJson.scripts["test:async-long-context:desktop-dogfood"]).toContain("example/model-id");
    expect(packageJson.scripts["test:async-long-context:desktop-dogfood:unit"]).toContain("scripts/async-long-context-dogfood.test.mjs");
    expect(supervisor).toContain("scripts/async-long-context-dogfood.mjs");
    expect(supervisor).toContain("test-results/async-long-context-dogfood/latest.json");
  });

  it("anchors the scenario to Gutenberg downloads, async long-context, and wake continuation evidence", async () => {
    const scenario = await readText("scripts/async-long-context-dogfood.mjs");

    expect(scenario).toContain("Project Gutenberg");
    expect(scenario).toContain("permissionMode: \"full-access\"");
    expect(scenario).toContain("requestThreadPermissionModeChange");
    expect(scenario).toContain("sendMessage");
    expect(scenario).toContain("https://www.gutenberg.org/cache/epub/1342/pg1342.txt");
    expect(scenario).toContain("https://www.gutenberg.org/cache/epub/84/pg84.txt");
    expect(scenario).not.toContain("https://www.gutenberg.org/cache/epub/345/pg345.txt");
    expect(scenario).toContain("two-book-openings.txt");
    expect(scenario).toContain("maxModelCalls 4");
    expect(scenario).toContain("longContextInputReady");
    expect(scenario).toContain("long_context_start, not long_context_process");
    expect(scenario).toContain("thread_wake_schedule");
    expect(scenario).toContain("job_kind");
    expect(scenario).toContain("long_context");
    expect(scenario).toContain("long_context_poll with wait_ms");
    expect(scenario).toContain("ASYNC_LONG_CONTEXT_DOGFOOD_DONE");
    expect(scenario).toContain("longContextProcessUsed");
    expect(scenario).toContain("asyncTranscriptHasResultArtifact");
    expect(scenario).toContain("wakePayloadLongContext");
    expect(scenario).toContain("document.body?.innerText");
    expect(scenario).toContain("Last error:");
  });
});
