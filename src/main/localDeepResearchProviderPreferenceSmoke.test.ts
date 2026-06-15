import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runLocalDeepResearchProviderPreferenceSmoke } from "./localDeepResearchProviderPreferenceSmoke";

describe("Local Deep Research provider preference smoke", () => {
  it("writes product-smoke evidence for provider preference and fallback scenarios", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-provider-smoke-"));
    try {
      const result = await runLocalDeepResearchProviderPreferenceSmoke({
        workspacePath: workspace,
        now: () => new Date("2026-05-28T15:00:00.000Z"),
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-local-deep-research-provider-preference-smoke-v1",
        checkedAt: "2026-05-28T15:00:00.000Z",
        status: "passed",
        artifactPath: ".ambient/local-deep-research/provider-preference-smoke/2026-05-28T15-00-00-000Z-passed.json",
        markdownPath: ".ambient/local-deep-research/provider-preference-smoke/2026-05-28T15-00-00-000Z-passed.md",
      });
      expect(result.checks.map((check) => `${check.id}:${check.status}`)).toEqual([
        "default-exa-scrapling:passed",
        "brave-search-custom-fetch:passed",
        "browser-fallback:passed",
        "strict-no-fallback-block:passed",
        "installed-provider-refresh:passed",
      ]);
      await expect(readFile(join(workspace, result.artifactPath), "utf8")).resolves.toContain("installed-provider-refresh");
      await expect(readFile(join(workspace, result.markdownPath), "utf8")).resolves.toContain("Brave Search");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
