import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("provider overflow auto-compact dogfood", () => {
  it("is routed through the standard Electron dogfood supervisor", async () => {
    const [packageJson, supervisor, scenario] = await Promise.all([
      readJson("package.json"),
      readFile("scripts/run-electron-dogfood.mjs", "utf8"),
      readFile("scripts/provider-overflow-auto-compact-dogfood.mjs", "utf8"),
    ]);

    expect(packageJson.scripts["test:provider-overflow-auto-compact:desktop-dogfood"]).toContain("scripts/run-electron-dogfood.mjs");
    expect(supervisor).toContain("provider-overflow-auto-compact-dogfood.mjs");
    expect(supervisor).toContain("test-results/provider-overflow-auto-compact/latest.json");
    expect(scenario).toContain("provider context safety preflight");
    expect(scenario).toContain("run-activity-progress");
  });
});

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
