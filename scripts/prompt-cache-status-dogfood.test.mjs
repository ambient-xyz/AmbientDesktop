import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("prompt cache status Desktop dogfood harness wiring", () => {
  it("exposes the live gate through package scripts and the Electron harness", async () => {
    const packageJson = JSON.parse(await readText("package.json"));
    const supervisor = await readText("scripts/run-electron-dogfood.mjs");

    expect(packageJson.scripts["test:prompt-cache-status:desktop-dogfood"]).toContain("scripts/run-electron-dogfood.mjs");
    expect(packageJson.scripts["test:prompt-cache-status:desktop-dogfood"]).toContain("--scenario=prompt-cache-status");
    expect(packageJson.scripts["test:prompt-cache-status:desktop-dogfood"]).toContain("AMBIENT_PROVIDER=ambient");
    expect(packageJson.scripts["test:prompt-cache-status:desktop-dogfood"]).toContain("example/model-id");
    expect(packageJson.scripts["test:prompt-cache-status:desktop-dogfood:unit"]).toContain("scripts/prompt-cache-status-dogfood.test.mjs");
    expect(supervisor).toContain("scripts/prompt-cache-status-dogfood.mjs");
    expect(supervisor).toContain("test-results/prompt-cache-status/latest.json");
  });

  it("anchors the scenario to headful Electron UI, full thinking, and hit/miss evidence", async () => {
    const scenario = await readText("scripts/prompt-cache-status-dogfood.mjs");

    expect(scenario).toContain("agent-browser electron skill");
    expect(scenario).toContain("cdp fallback; agent-browser unavailable");
    expect(scenario).toContain("--remote-debugging-port");
    expect(scenario).toContain("Page.captureScreenshot");
    expect(scenario).toContain('permissionMode: "workspace"');
    expect(scenario).toContain("Show prompt cache status");
    expect(scenario).toContain("showPromptCacheStatus: true");
    expect(scenario).toContain('mode: "full"');
    expect(scenario).toContain("RUN NONCE");
    expect(scenario).toContain("data-message-id");
    expect(scenario).toContain("thinkingPromptCacheStatuses.length > 0");
    expect(scenario).toContain("PROMPT_CACHE_REPEAT_A_OK");
    expect(scenario).toContain("PROMPT_CACHE_CHANGED_B_OK");
    expect(scenario).toContain('acceptedStatuses: ["hit", "miss"]');
    expect(scenario).toContain("minimumCacheReadExclusive");
    expect(scenario).toContain("assertTurnHasIncreasedCacheRead");
    expect(scenario).toContain("Prompt cache hit");
    expect(scenario).toContain("Prompt cache miss");
    expect(scenario).toContain("same prompt repeated");
    expect(scenario).toContain("different prompt in fresh thread");
  });
});
