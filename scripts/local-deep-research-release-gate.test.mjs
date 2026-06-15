import { describe, expect, it } from "vitest";
import {
  buildLocalDeepResearchReleaseGateReport,
  localDeepResearchReleaseGatePassed,
} from "./local-deep-research-release-gate-lib.mjs";

describe("Local Deep Research release gate", () => {
  it("passes the static gate with explicit memory estimates and skipped-live advisories", () => {
    const report = buildLocalDeepResearchReleaseGateReport(staticInput());

    expect(report.status).toBe("passed_with_advisories");
    expect(localDeepResearchReleaseGatePassed(report)).toBe(true);
    expect(report.releaseDecision.blockingIssues).toEqual([]);
    expect(report.releaseDecision.advisoryIssues).toEqual(expect.arrayContaining([
      "Temporary estimated memory classes: 16gb, 32gb, 64gb.",
      "Strict real-only memory telemetry still missing: 16gb, 32gb, 64gb.",
      "Live Local Deep Research validation was skipped for this static release gate run.",
    ]));
  });

  it("passes cleanly when live and strict memory evidence are present", () => {
    const input = staticInput({
      requireLive: true,
      requireStrictMemory: true,
      liveResults: [{ name: "local-deep-research-live", script: "test:local-deep-research:live", status: "passed", durationMs: 42, exitCode: 0 }],
    });
    input.artifacts.memoryTelemetryCoverage.estimatedPhysicalMemoryClasses = [];
    input.artifacts.memoryTelemetryCoverage.realPhysicalMemoryClasses = ["16gb", "32gb", "64gb", "128gb-plus"];
    input.artifacts.strictMemoryTelemetryCoverage = {
      ...input.artifacts.memoryTelemetryCoverage,
      estimateMode: "disabled",
    };

    const report = buildLocalDeepResearchReleaseGateReport(input);

    expect(report.status).toBe("passed");
    expect(localDeepResearchReleaseGatePassed(report, { requireLive: true })).toBe(true);
  });

  it("treats a selected live preflight blocker as advisory when live proof is not required", () => {
    const report = buildLocalDeepResearchReleaseGateReport(staticInput({
      liveResults: [blockedLiveResult()],
    }));

    expect(report.status).toBe("passed_with_advisories");
    expect(localDeepResearchReleaseGatePassed(report)).toBe(true);
    expect(report.releaseDecision.blockingIssues).toEqual([]);
    expect(report.releaseDecision.advisoryIssues).toEqual(expect.arrayContaining([
      expect.stringContaining("Live Local Deep Research validation was blocked by untracked-local-runtime"),
    ]));
    expect(report.releaseDecision.advisoryIssues.join("\n")).toContain("test-results/local-deep-research-live/latest.json");
    expect(report.releaseDecision.advisoryIssues.join("\n")).toContain("projected utilization 100%");
    expect(report.releaseDecision.advisoryIssues.join("\n")).toContain("projected free 0% (0.0 GiB)");
    expect(report.releaseDecision.advisoryIssues.join("\n")).toContain("actual RSS 8.7 GiB");
  });

  it("fails required live validation when the live run only produced blocker evidence", () => {
    const report = buildLocalDeepResearchReleaseGateReport(staticInput({
      requireLive: true,
      liveResults: [blockedLiveResult()],
    }));

    expect(report.status).toBe("attention");
    expect(localDeepResearchReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      expect.stringContaining("Live Local Deep Research validation was blocked by untracked-local-runtime"),
    ]));
  });

  it("fails when required package scripts are missing", () => {
    const input = staticInput();
    delete input.packageJson.scripts["test:local-deep-research:release-gate"];

    const report = buildLocalDeepResearchReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(localDeepResearchReleaseGatePassed(report)).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Missing package script test:local-deep-research:release-gate.");
  });

  it("fails when selected local artifact commands fail", () => {
    const report = buildLocalDeepResearchReleaseGateReport(staticInput({
      commandResults: [
        {
          kind: "local",
          script: "test:local-deep-research:memory-certification",
          status: "failed",
          durationMs: 12,
          exitCode: 254,
          message: "vitest not found",
        },
      ],
    }));

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "test:local-deep-research:memory-certification failed with exit code 254: vitest not found",
    ]));
  });

  it("fails when the benchmark does not cover both Q4 and Q8", () => {
    const input = staticInput();
    input.artifacts.profileBenchmark.profiles = input.artifacts.profileBenchmark.profiles.filter((profile) => profile.profileId !== "literesearcher-4b-q8-0");

    const report = buildLocalDeepResearchReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain("Missing passed profile lanes: literesearcher-4b-q8-0.");
  });

  it("fails strict-memory mode while estimates remain", () => {
    const report = buildLocalDeepResearchReleaseGateReport(staticInput({ requireStrictMemory: true }));

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Estimated memory classes remain: 16gb, 32gb, 64gb.",
      "Strict memory telemetry still missing: 16gb, 32gb, 64gb.",
    ]));
  });

  it("fails when required live validation is not selected", () => {
    const report = buildLocalDeepResearchReleaseGateReport(staticInput({ requireLive: true }));

    expect(report.status).toBe("attention");
    expect(localDeepResearchReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Live Local Deep Research validation was required but not selected.");
  });
});

function staticInput(overrides = {}) {
  return {
    packageJson: {
      scripts: {
        "test:local-deep-research:live": "node scripts/e2e-local-deep-research-live.mjs",
        "test:local-deep-research:live:install": "AMBIENT_LOCAL_DEEP_RESEARCH_LIVE_INSTALL=1 node scripts/e2e-local-deep-research-live.mjs",
        "test:local-deep-research:release-artifacts": "node scripts/local-deep-research-release-artifacts.mjs",
        "test:local-deep-research:profile-benchmark": "AMBIENT_LOCAL_DEEP_RESEARCH_PROFILE_BENCHMARK=1 pnpm exec vitest run src/main/localDeepResearchProfileBenchmark.live.test.ts",
        "test:local-deep-research:memory-certification": "pnpm exec vitest run src/main/localDeepResearchMemoryCertification.test.ts",
        "test:local-deep-research:memory-telemetry": "node scripts/local-deep-research-memory-telemetry-gate.mjs --collect-current --coverage --allow-estimates",
        "test:local-deep-research:memory-telemetry:bundle": "node scripts/local-deep-research-memory-telemetry-gate.mjs --collect-current --export-bundle .ambient/local-deep-research/memory-telemetry/bundle",
        "test:local-deep-research:memory-telemetry-gate": "node scripts/local-deep-research-memory-telemetry-gate.mjs --coverage --require-complete --allow-estimates",
        "test:local-deep-research:memory-telemetry-gate:strict": "node scripts/local-deep-research-memory-telemetry-gate.mjs --coverage --require-complete",
        "test:local-deep-research:runtime-platforms": "pnpm exec vitest run src/main/localDeepResearchRuntimePlatformCertification.test.ts",
        "test:local-deep-research:release-gate": "node scripts/local-deep-research-release-gate.mjs",
        "test:local-deep-research:release-gate:unit": "pnpm exec vitest run scripts/local-deep-research-release-gate.test.mjs",
      },
    },
    files: {
      agentRuntime: "ambient_local_deep_research_setup ambient_local_deep_research_run",
      preload: "setupLocalDeepResearch listLocalDeepResearchRuns",
      settings: "Local Deep Research Request Q8 override LocalDeepResearchRunHistoryList deepResearchCatalogCards",
      providerCatalog: "local-deep-research:literesearcher-llamacpp ambient_local_deep_research_setup",
      plan: "estimated-host-class Local Deep Research",
    },
    artifacts: {
      validation: validationArtifact(),
      smoke: smokeArtifact(),
      providerPreferenceSmoke: providerPreferenceSmokeArtifact(),
      profileBenchmark: profileBenchmarkArtifact(),
      memoryCertification: memoryCertificationArtifact(),
      memoryTelemetryCoverage: memoryCoverageArtifact(),
      strictMemoryTelemetryCoverage: strictMemoryCoverageArtifact(),
      runtimePlatformCertification: runtimePlatformCertificationArtifact(),
    },
    startedAt: "2026-05-28T22:00:00.000Z",
    completedAt: "2026-05-28T22:00:01.000Z",
    ...overrides,
  };
}

function validationArtifact() {
  return {
    status: "passed",
    artifactPath: ".ambient/local-deep-research/validation.json",
    checks: ["setup-contract", "model-cache", "llama-runtime", "search-providers", "fetch-providers", "physical-memory-telemetry", "provider-preference-smoke"].map(check),
  };
}

function smokeArtifact() {
  return {
    status: "passed",
    artifactPath: ".ambient/local-deep-research/smoke/passed.json",
    checks: ["setup-contract", "model-cache", "runtime-cache", "llama-chat"].map(check),
    chat: {
      response: "The required token is LOCAL_DEEP_RESEARCH_SMOKE_OK.",
    },
  };
}

function providerPreferenceSmokeArtifact() {
  return {
    status: "passed",
    checks: ["default-exa-scrapling", "brave-search-custom-fetch", "browser-fallback", "strict-no-fallback-block", "installed-provider-refresh"].map(check),
  };
}

function profileBenchmarkArtifact() {
  return {
    status: "passed",
    profiles: [
      { profileId: "literesearcher-4b-q4-k-m", status: "passed", quality: { score: 1 } },
      { profileId: "literesearcher-4b-q8-0", status: "passed", quality: { score: 1 } },
    ],
  };
}

function memoryCertificationArtifact() {
  return {
    status: "passed",
    checks: [
      "constrained-16gb",
      "standard-32gb",
      "high-64gb",
      "workstation-128gb",
      "standard-32gb-resident-block",
      "high-64gb-resident-q8-reserved",
      "high-64gb-resident-q4-fallback",
      "workstation-128gb-resident-q8-reserved",
      "standard-32gb-q8-override-warned",
    ].map(check),
  };
}

function memoryCoverageArtifact() {
  return {
    status: "complete",
    estimateMode: "allowed",
    observedPhysicalMemoryClasses: ["16gb", "32gb", "64gb", "128gb-plus"],
    realPhysicalMemoryClasses: ["128gb-plus"],
    estimatedPhysicalMemoryClasses: ["16gb", "32gb", "64gb"],
    missingPhysicalMemoryClasses: [],
  };
}

function strictMemoryCoverageArtifact() {
  return {
    status: "missing",
    estimateMode: "disabled",
    observedPhysicalMemoryClasses: ["128gb-plus"],
    realPhysicalMemoryClasses: ["128gb-plus"],
    estimatedPhysicalMemoryClasses: [],
    missingPhysicalMemoryClasses: ["16gb", "32gb", "64gb"],
  };
}

function runtimePlatformCertificationArtifact() {
  return {
    status: "passed",
    decisions: [
      { id: "macos-arm64-metal", decision: "enable-default-managed-install" },
      { id: "linux-x64-vulkan", decision: "keep-conditional-managed-install" },
      { id: "windows-x64-cpu", decision: "pin-but-disable-default-install" },
      { id: "windows-x64-gpu", decision: "defer-managed-install" },
    ],
  };
}

function blockedLiveResult() {
  return {
    name: "local-deep-research-live",
    script: "test:local-deep-research:live",
    status: "blocked",
    blockerKind: "untracked-local-runtime",
    setupStatus: "blocked",
    durationMs: 4200,
    exitCode: 1,
    summaryPath: "test-results/local-deep-research-live/latest.json",
    memoryEvidence: {
      activeActualResidentMemoryBytes: 9384837120,
      activeEstimatedResidentMemoryBytes: 0,
      projectedSystemMemoryUtilization: 1,
      maxProjectedMemoryUtilization: 0.8,
      projectedFreeMemoryBytes: 0,
      projectedFreeMemoryRatio: 0,
      minFreeMemoryRatioAfterLaunch: 0.2,
    },
    blockers: [
      "Untracked llama.cpp runtime is resident; ordinary Ambient Stop is disabled.",
    ],
  };
}

function check(id) {
  return { id, status: "passed" };
}
