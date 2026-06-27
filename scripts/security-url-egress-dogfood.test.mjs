import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Security URL egress Desktop dogfood wiring", () => {
  it("exposes plugin-preview and managed-download egress scenarios through scripts and the Electron harness", async () => {
    const packageJson = JSON.parse(await readText("package.json"));
    const supervisor = await readText("scripts/run-electron-dogfood.mjs");

    expect(packageJson.scripts["test:security-url-egress:desktop-dogfood:plugin"]).toContain("scripts/run-electron-dogfood.mjs");
    expect(packageJson.scripts["test:security-url-egress:desktop-dogfood:plugin"]).toContain("--scenario=security-plugin-preview-egress");
    expect(packageJson.scripts["test:security-url-egress:desktop-dogfood:plugin"]).toContain("example/model-id");
    expect(packageJson.scripts["test:security-url-egress:desktop-dogfood:download"]).toContain("scripts/run-electron-dogfood.mjs");
    expect(packageJson.scripts["test:security-url-egress:desktop-dogfood:download"]).toContain("--scenario=security-managed-download-egress");
    expect(packageJson.scripts["test:security-url-egress:desktop-dogfood:download"]).toContain("example/model-id");
    expect(packageJson.scripts["test:security-url-egress:desktop-dogfood:unit"]).toContain("scripts/security-url-egress-dogfood.test.mjs");
    expect(supervisor).toContain("scripts/security-url-egress-dogfood.mjs");
    expect(supervisor).toContain("test-results/security-plugin-preview-egress/latest.json");
    expect(supervisor).toContain("test-results/security-managed-download-egress/latest.json");
  });

  it("records fixture hit-count evidence and keeps loopback HTTP egress disabled", async () => {
    const scenario = await readText("scripts/security-url-egress-dogfood.mjs");

    expect(scenario).toContain("window.ambientDesktop.addCodexMarketplace");
    expect(scenario).toContain("window.ambientDesktop.discoverCodexPlugins");
    expect(scenario).toContain("ambient_download_start exactly once");
    expect(scenario).toContain("SECURITY_MANAGED_DOWNLOAD_EGRESS_OK");
    expect(scenario).toContain("requestCount");
    expect(scenario).toContain("allowedDownloadToolNames");
    expect(scenario).toContain("delete next.AMBIENT_EGRESS_ALLOW_LOCAL_HTTP");
    expect(scenario).toContain("agent-browser");
  });
});
