import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Security grant-conditions Desktop dogfood wiring", () => {
  it("exposes the grant-condition scenario through the Electron harness", async () => {
    const packageJson = JSON.parse(await readText("package.json"));
    const supervisor = await readText("scripts/run-electron-dogfood.mjs");

    expect(packageJson.scripts["test:security-grant-conditions:desktop-dogfood"]).toContain("scripts/run-electron-dogfood.mjs");
    expect(packageJson.scripts["test:security-grant-conditions:desktop-dogfood"]).toContain("--scenario=security-grant-conditions");
    expect(packageJson.scripts["test:security-grant-conditions:desktop-dogfood"]).toContain("AMBIENT_PROVIDER=ambient");
    expect(packageJson.scripts["test:security-grant-conditions:desktop-dogfood"]).toContain("moonshotai/kimi-k2.7-code");
    expect(packageJson.scripts["test:security-grant-conditions:desktop-dogfood:unit"]).toContain(
      "scripts/security-grant-conditions-dogfood.test.mjs",
    );
    expect(supervisor).toContain("security-grant-conditions");
    expect(supervisor).toContain("scripts/security-grant-conditions-dogfood.mjs");
    expect(supervisor).toContain("test-results/security-grant-conditions/latest.json");
  });

  it("records broker proof, conditioned grant UI evidence, and a repeated mismatched prompt", async () => {
    const scenario = await readText("scripts/security-grant-conditions-dogfood.mjs");

    expect(scenario).toContain("resolveE2ePermissionGrant");
    expect(scenario).toContain("brokerDecisionSource");
    expect(scenario).toContain("brokerPromptRequested");
    expect(scenario).toContain("brokerRejectedPersistentGrant");
    expect(scenario).toContain("brokerPromptMethodId");
    expect(scenario).toContain("sameGrantTargetHash");
    expect(scenario).toContain("conditionsDiffer");
    expect(scenario).toContain("grantRegistryConditionLabelVisible");
    expect(scenario).toContain("repeatedPromptVisible");
    expect(scenario).toContain("Method Id=drive.files.export");
    expect(scenario).toContain("Method Id: drive.files.get");
    expect(scenario).toContain("Condition mismatch grant request?");
    expect(scenario).toContain("agent-browser electron skill");
  });
});
