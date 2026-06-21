import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateDesktopReleaseGate, evaluateDesktopReleaseGateFacts, readDesktopReleaseGateFacts } from "./desktop-release-gate-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("desktop release hardening gate", () => {
  it("passes against the current repository release policy", async () => {
    const report = await evaluateDesktopReleaseGate({ repoRoot });

    expect(report.status).toBe("passed");
    expect(report.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "packaged update feed override policy",
        "publish target hygiene",
        "release signing policy",
        "main entitlements",
        "inherited entitlements",
        "UI model strict local gate scripts",
        "UI model strict collector behavior",
        "UI model strict release checklist",
      ]),
    );
  });

  it("fails if packaged update feeds can be overridden by env", async () => {
    const facts = await readDesktopReleaseGateFacts(repoRoot);
    facts.updateServiceSource = facts.updateServiceSource.replace(/\bisProductionUpdateRuntime\b/g, "missingProductionUpdateRuntime");

    const report = evaluateDesktopReleaseGateFacts(facts);

    expect(report.status).toBe("failed");
    expect(report.issues).toContain(
      "Packaged production update feeds must ignore arbitrary runtime env URL/base overrides and use Ambient-owned stable/beta feeds.",
    );
  });

  it("fails if a release entitlement lacks policy signoff", async () => {
    const facts = await readDesktopReleaseGateFacts(repoRoot);
    facts.mainEntitlements["com.apple.security.cs.allow-dyld-environment-variables"] = true;

    const report = evaluateDesktopReleaseGateFacts(facts);

    expect(report.status).toBe("failed");
    expect(report.issues).toContain("main entitlements contain undocumented, unapproved, or non-true hardened-runtime exceptions.");
  });

  it("fails if the publish script carries private deployment defaults", async () => {
    const facts = await readDesktopReleaseGateFacts(repoRoot);
    facts.publishScriptSource += "\nconst host = '15.204.236.102';\nconst key = '<local-user>/logins/ambientmarketing_ovh';\n";

    const report = evaluateDesktopReleaseGateFacts(facts);

    expect(report.status).toBe("failed");
    expect(report.issues).toContain(
      "Real update publishing must require explicit host/user/key inputs and must not carry private deployment defaults in the repo.",
    );
  });

  it("fails if the strict UI model local gate script is removed", async () => {
    const facts = await readDesktopReleaseGateFacts(repoRoot);
    delete facts.packageJson.scripts["test:ui-model:strict"];

    const report = evaluateDesktopReleaseGateFacts(facts);

    expect(report.status).toBe("failed");
    expect(report.issues).toContain(
      "package.json must expose the strict UI model local gate, the full report-only suite with interaction coverage, the zero-baseline ratchet, and the rule self-test lane.",
    );
  });

  it("fails if the zero-baseline UI model ratchet script is removed", async () => {
    const facts = await readDesktopReleaseGateFacts(repoRoot);
    delete facts.packageJson.scripts["test:ui-model:all:zero"];

    const report = evaluateDesktopReleaseGateFacts(facts);

    expect(report.status).toBe("failed");
    expect(report.issues).toContain(
      "package.json must expose the strict UI model local gate, the full report-only suite with interaction coverage, the zero-baseline ratchet, and the rule self-test lane.",
    );
  });

  it("fails if the UI model interaction profile is dropped from the report-only sweep", async () => {
    const facts = await readDesktopReleaseGateFacts(repoRoot);
    facts.packageJson.scripts["test:ui-model:all"] =
      "node --experimental-websocket scripts/ui-model/collect-ui-model.mjs --profile=core,stress --isolate-scenarios";

    const report = evaluateDesktopReleaseGateFacts(facts);

    expect(report.status).toBe("failed");
    expect(report.issues).toContain(
      "package.json must expose the strict UI model local gate, the full report-only suite with interaction coverage, the zero-baseline ratchet, and the rule self-test lane.",
    );
  });

  it("fails if the UI model collector no longer fails strict mode on gated findings", async () => {
    const facts = await readDesktopReleaseGateFacts(repoRoot);
    facts.uiModelCollectorSource = facts.uiModelCollectorSource.replace(/process\.exitCode = 1/g, "process.exitCode = 0");

    const report = evaluateDesktopReleaseGateFacts(facts);

    expect(report.status).toBe("failed");
    expect(report.issues).toContain(
      "The UI model collector must fail strict mode on gated violations, fail zero-baseline mode on any deterministic finding, and retain self-test coverage for detector regressions.",
    );
  });

  it("fails if the UI model collector no longer fails zero-baseline mode on any finding", async () => {
    const facts = await readDesktopReleaseGateFacts(repoRoot);
    facts.uiModelCollectorSource = facts.uiModelCollectorSource.replace(/violationCount > 0/g, "violationCount > 999");

    const report = evaluateDesktopReleaseGateFacts(facts);

    expect(report.status).toBe("failed");
    expect(report.issues).toContain(
      "The UI model collector must fail strict mode on gated violations, fail zero-baseline mode on any deterministic finding, and retain self-test coverage for detector regressions.",
    );
  });

  it("fails if release docs stop listing the UI model strict checklist", async () => {
    const facts = await readDesktopReleaseGateFacts(repoRoot);
    facts.policyDocument = facts.policyDocument.replace(/pnpm run test:ui-model:strict/g, "pnpm run test:ui-model");

    const report = evaluateDesktopReleaseGateFacts(facts);

    expect(report.status).toBe("failed");
    expect(report.issues).toContain(
      "The local release checklist and UI model docs must document the strict UI gate, full report-only sweep, self-test, and current zero-gate baseline.",
    );
  });
});
