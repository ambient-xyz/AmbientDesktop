import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Security browser-login prompt Desktop dogfood wiring", () => {
  it("exposes the browser-login prompt scenario through the Electron harness", async () => {
    const packageJson = JSON.parse(await readText("package.json"));
    const supervisor = await readText("scripts/run-electron-dogfood.mjs");

    expect(packageJson.scripts["test:security-browser-login-prompt:desktop-dogfood"]).toContain("scripts/run-electron-dogfood.mjs");
    expect(packageJson.scripts["test:security-browser-login-prompt:desktop-dogfood"]).toContain("--scenario=security-browser-login-prompt");
    expect(packageJson.scripts["test:security-browser-login-prompt:desktop-dogfood"]).toContain("AMBIENT_PROVIDER=ambient");
    expect(packageJson.scripts["test:security-browser-login-prompt:desktop-dogfood"]).toContain("moonshotai/kimi-k2.7-code");
    expect(packageJson.scripts["test:security-browser-login-prompt:desktop-dogfood"]).toContain("AMBIENT_BROWSER_LOGIN_PROMPT_ONLY=1");
    expect(packageJson.scripts["test:security-browser-login-prompt:desktop-dogfood:unit"]).toContain(
      "scripts/security-browser-login-prompt-dogfood.test.mjs",
    );
    expect(supervisor).toContain("security-browser-login-prompt");
    expect(supervisor).toContain("scripts/e2e-browser-login-live.mjs");
    expect(supervisor).toContain("AMBIENT_BROWSER_LOGIN_PROMPT_ONLY");
    expect(supervisor).toContain("test-results/security-browser-login-prompt/latest.json");
  });

  it("records prompt evidence without approving or leaking the brokered password", async () => {
    const scenario = await readText("scripts/e2e-browser-login-live.mjs");

    expect(scenario).toContain("runPromptOnlyProbe");
    expect(scenario).toContain("permissionMode: \"full-access\"");
    expect(scenario).toContain("collaborationMode: \"agent\"");
    expect(scenario).toContain("waitForBrowserLoginPrompt");
    expect(scenario).toContain("waitForTextNeedles");
    expect(scenario).toContain("visibleBrowserLoginPromptNeedles");
    expect(scenario).toContain("permissionPromptApproved: false");
    expect(scenario).toContain("fixturePasswordInArtifacts: false");
    expect(scenario).toContain("permissionPromptsApproved !== 0");
    expect(scenario).toContain("__ambientBrowserLoginPrompt");
    expect(scenario).toContain("collectorName");
    expect(scenario).toContain("assertNoFixturePassword");
    expect(scenario).toContain("full snapshot text and Electron output checked");
    expect(scenario).toContain("validCredentialPostCount");
    expect(scenario).toContain("loginGetCount < 1");
    expect(scenario).toContain("fixtureLoginPageLoadedBeforeApproval");
    expect(scenario).toContain("passwordFieldNonEmptyCount");
    expect(scenario).toContain("/field-change");
    expect(scenario).toContain("fixtureActivityBeforeApproval");
    expect(scenario).toContain("visiblePromptTextMatched");
    expect(scenario).toContain("setupPermissionPromptsApproved");
    expect(scenario).toContain('"allow_once"');
    expect(scenario).toContain("Unexpected non-login permission prompt during browser-login evidence dogfood");
    expect(scenario).toContain("approvedSetupToolName: \"browser_nav\"");
    expect(scenario).toContain("approvedSetupRisk: \"browser-network\"");
    expect(scenario).toContain("Allow stored browser credential login?");
    expect(scenario).toContain("Password selector|Submit selector");
    expect(scenario).toContain("snapshot.status !== 0");
    expect(scenario).toContain("agent-browser electron skill");
  });
});
