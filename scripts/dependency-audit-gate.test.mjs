import { describe, expect, it } from "vitest";
import { evaluateDependencyAuditGateFacts } from "./dependency-audit-gate-lib.mjs";

const acceptedPath =
  ".>@rivet-dev/agent-os-core>@secure-exec/nodejs>node-stdlib-browser>crypto-browserify>browserify-sign>elliptic";

const packageJson = {
  dependencies: {
    "@mariozechner/pi-ai": "^0.73.1",
  },
  scripts: {
    "test:dependency-audit-gate": "node scripts/dependency-audit-gate.mjs",
  },
  pnpm: {
    overrides: {
      "@anthropic-ai/sdk": "0.91.1",
      "fast-xml-builder": "1.2.0",
      "fast-xml-parser": "5.7.3",
    },
  },
};

const policy = {
  auditCommand: "pnpm audit --prod --json",
  requiredPackageDependencies: packageJson.dependencies,
  requiredPackageOverrides: packageJson.pnpm.overrides,
  acceptedAdvisories: {
    "GHSA-848j-6mx2-7j84": {
      module: "elliptic",
      severity: "low",
      cves: ["CVE-2025-14505"],
      paths: [acceptedPath],
      patchedVersions: "<0.0.0",
      owner: "Desktop Security",
      reviewBy: "2026-08-31",
      rationale:
        "The vulnerable package is reachable only through the browser polyfill crypto chain, which Ambient Desktop does not use for ECDSA signing or persisted signing keys.",
      requiredAction: "Replace or remove the polyfill chain, or pin a patched elliptic release if upstream ships one.",
    },
  },
};

const policyDocument = "pnpm audit --prod --json build/dependency-advisory-policy.json GHSA-848j-6mx2-7j84";

describe("dependency audit gate", () => {
  it("passes when the only advisory is the current accepted unpatched elliptic record", () => {
    const report = evaluateDependencyAuditGateFacts({
      audit: { advisories: { 1112030: ellipticAdvisory() } },
      auditCommandResult: { code: 1, signal: null, timedOut: false },
      packageJson,
      policy,
      policyDocument,
      currentDate: "2026-05-16",
    });

    expect(report.status).toBe("passed");
    expect(report.acceptedAdvisoryCount).toBe(1);
  });

  it("passes a clean audit when no accepted risk records are configured", () => {
    const report = evaluateDependencyAuditGateFacts({
      audit: { advisories: {} },
      auditCommandResult: { code: 0, signal: null, timedOut: false },
      packageJson,
      policy: { ...policy, acceptedAdvisories: {} },
      policyDocument: "pnpm audit --prod --json build/dependency-advisory-policy.json",
      currentDate: "2026-05-16",
    });

    expect(report.status).toBe("passed");
    expect(report.advisoryCount).toBe(0);
  });

  it("fails an undocumented patched high-severity advisory", () => {
    const report = evaluateDependencyAuditGateFacts({
      audit: {
        advisories: {
          1118965: {
            module_name: "fast-xml-builder",
            severity: "high",
            github_advisory_id: "GHSA-5wm8-gmm8-39j9",
            patched_versions: ">=1.1.7",
            cves: ["CVE-2026-44665"],
            findings: [{ paths: [".>@mariozechner/pi-ai>@aws-sdk/client-bedrock-runtime>fast-xml-builder"] }],
          },
        },
      },
      auditCommandResult: { code: 1, signal: null, timedOut: false },
      packageJson,
      policy,
      policyDocument,
      currentDate: "2026-05-16",
    });

    expect(report.status).toBe("failed");
    expect(report.issues[0]).toContain("GHSA-5wm8-gmm8-39j9");
  });

  it("fails an accepted advisory when the finding path changes", () => {
    const advisory = ellipticAdvisory();
    advisory.findings[0].paths = [".>@new-runtime-path>elliptic"];

    const report = evaluateDependencyAuditGateFacts({
      audit: { advisories: { 1112030: advisory } },
      auditCommandResult: { code: 1, signal: null, timedOut: false },
      packageJson,
      policy,
      policyDocument,
      currentDate: "2026-05-16",
    });

    expect(report.status).toBe("failed");
    expect(report.checks.find((check) => check.name === "accepted advisory GHSA-848j-6mx2-7j84").evidence).toContain(
      "undocumented path",
    );
  });

  it("fails stale accepted-risk records", () => {
    const report = evaluateDependencyAuditGateFacts({
      audit: { advisories: {} },
      auditCommandResult: { code: 0, signal: null, timedOut: false },
      packageJson,
      policy,
      policyDocument,
      currentDate: "2026-05-16",
    });

    expect(report.status).toBe("failed");
    expect(report.issues).toContain("Accepted-risk records must be removed once the advisory no longer appears in the production audit.");
  });

  it("fails expired accepted-risk records", () => {
    const report = evaluateDependencyAuditGateFacts({
      audit: { advisories: { 1112030: ellipticAdvisory() } },
      auditCommandResult: { code: 1, signal: null, timedOut: false },
      packageJson,
      policy,
      policyDocument,
      currentDate: "2026-09-01",
    });

    expect(report.status).toBe("failed");
    expect(report.checks.find((check) => check.name === "accepted advisory GHSA-848j-6mx2-7j84").evidence).toContain(
      "reviewBy 2026-08-31",
    );
  });
});

function ellipticAdvisory() {
  return {
    id: 1112030,
    module_name: "elliptic",
    severity: "low",
    github_advisory_id: "GHSA-848j-6mx2-7j84",
    patched_versions: "<0.0.0",
    cves: ["CVE-2025-14505"],
    findings: [{ version: "6.6.1", paths: [acceptedPath] }],
  };
}
