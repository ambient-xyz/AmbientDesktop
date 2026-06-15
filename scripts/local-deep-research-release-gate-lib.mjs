const requiredProviderSmokeChecks = [
  "default-exa-scrapling",
  "brave-search-custom-fetch",
  "browser-fallback",
  "strict-no-fallback-block",
  "installed-provider-refresh",
];

const requiredMemoryCertificationChecks = [
  "constrained-16gb",
  "standard-32gb",
  "high-64gb",
  "workstation-128gb",
  "standard-32gb-resident-block",
  "high-64gb-resident-q8-reserved",
  "high-64gb-resident-q4-fallback",
  "workstation-128gb-resident-q8-reserved",
  "standard-32gb-q8-override-warned",
];

const requiredMemoryClasses = ["16gb", "32gb", "64gb", "128gb-plus"];
const requiredProfiles = ["literesearcher-4b-q4-k-m", "literesearcher-4b-q8-0"];

export function buildLocalDeepResearchReleaseGateReport(input) {
  const checks = [
    ...scriptChecks(input.packageJson?.scripts ?? {}),
    ...sourceSurfaceChecks(input.files ?? {}),
    ...artifactChecks(input.artifacts ?? {}, input),
    ...commandResultChecks(input.commandResults ?? []),
    ...liveChecks(input.liveResults ?? [], input),
  ];
  const blockingIssues = checks
    .filter((check) => check.status === "failed")
    .map((check) => check.issue ?? check.evidence);
  const advisoryIssues = checks
    .filter((check) => check.status === "advisory")
    .map((check) => check.issue ?? check.evidence);
  const status = blockingIssues.length
    ? "attention"
    : advisoryIssues.length
      ? "passed_with_advisories"
      : "passed";
  return {
    schemaVersion: "ambient-local-deep-research-release-gate-v1",
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    status,
    checks,
    releaseDecision: {
      blockingIssues,
      advisoryIssues,
      nextSlice: blockingIssues[0] ?? advisoryIssues[0] ?? "No Local Deep Research release-gate blockers found.",
    },
    live: {
      required: Boolean(input.requireLive),
      selected: Boolean(input.liveResults?.length),
      results: input.liveResults ?? [],
    },
    options: {
      requireLive: Boolean(input.requireLive),
      requireStrictMemory: Boolean(input.requireStrictMemory),
    },
  };
}

export function localDeepResearchReleaseGatePassed(report, input = {}) {
  if (report.status === "attention") return false;
  if (input.requireLive && !report.live.results.some((result) => result.status === "passed")) return false;
  return true;
}

function scriptChecks(scripts) {
  const requiredScripts = [
    ["test:local-deep-research:live", "e2e-local-deep-research-live.mjs"],
    ["test:local-deep-research:live:install", "AMBIENT_LOCAL_DEEP_RESEARCH_LIVE_INSTALL=1"],
    ["test:local-deep-research:release-artifacts", "local-deep-research-release-artifacts.mjs"],
    ["test:local-deep-research:profile-benchmark", "AMBIENT_LOCAL_DEEP_RESEARCH_PROFILE_BENCHMARK=1"],
    ["test:local-deep-research:memory-certification", "localDeepResearchMemoryCertification.test.ts"],
    ["test:local-deep-research:memory-telemetry", "--allow-estimates"],
    ["test:local-deep-research:memory-telemetry:bundle", "--export-bundle"],
    ["test:local-deep-research:memory-telemetry-gate", "--allow-estimates"],
    ["test:local-deep-research:memory-telemetry-gate:strict", "--require-complete"],
    ["test:local-deep-research:runtime-platforms", "localDeepResearchRuntimePlatformCertification.test.ts"],
    ["test:local-deep-research:release-gate", "local-deep-research-release-gate.mjs"],
    ["test:local-deep-research:release-gate:unit", "local-deep-research-release-gate.test.mjs"],
  ];
  return requiredScripts.map(([name, expected]) => {
    const script = scripts[name];
    if (!script) {
      return failed(`script:${name}`, `${name} package script is registered.`, `Missing package script ${name}.`);
    }
    if (!String(script).includes(expected)) {
      return failed(
        `script:${name}`,
        `${name} includes ${expected}.`,
        `${name} package script did not include expected fragment: ${expected}`,
      );
    }
    return passed(`script:${name}`, `${name} package script is registered.`, script);
  });
}

function sourceSurfaceChecks(files) {
  return [
    textIncludes(
      "source:agent-runtime-setup-tool",
      files.agentRuntime,
      "ambient_local_deep_research_setup",
      "AgentRuntime registers the Local Deep Research setup tool.",
    ),
    textIncludes(
      "source:agent-runtime-run-tool",
      files.agentRuntime,
      "ambient_local_deep_research_run",
      "AgentRuntime registers the Local Deep Research run tool.",
    ),
    textIncludes(
      "source:preload-setup",
      files.preload,
      "setupLocalDeepResearch",
      "Preload exposes Local Deep Research setup to the first-party UI.",
    ),
    textIncludes(
      "source:preload-run-history",
      files.preload,
      "listLocalDeepResearchRuns",
      "Preload exposes Local Deep Research run history to the first-party UI.",
    ),
    textIncludes(
      "source:settings-card",
      files.settings,
      "Local Deep Research",
      "Settings contains a Local Deep Research capability card.",
    ),
    textIncludes(
      "source:q8-override",
      files.settings,
      "Request Q8 override",
      "Settings exposes the advanced Q8 override.",
    ),
    textIncludes(
      "source:run-history",
      files.settings,
      "LocalDeepResearchRunHistoryList",
      "Settings exposes persisted Local Deep Research run artifacts.",
    ),
    textIncludes(
      "source:provider-catalog-card",
      files.providerCatalog,
      "local-deep-research:literesearcher-llamacpp",
      "Provider catalog exposes the first-party Local Deep Research template.",
    ),
    textIncludes(
      "source:provider-catalog-onboarding",
      files.providerCatalog,
      "ambient_local_deep_research_setup",
      "Provider catalog routes Local Deep Research onboarding through the typed setup tool.",
    ),
    textIncludes(
      "source:settings-catalog-card",
      files.settings,
      "deepResearchCatalogCards",
      "Search & Web Settings includes the Local Deep Research provider catalog card.",
    ),
    textIncludes(
      "source:plan-estimates",
      files.plan,
      "estimated-host-class",
      "Plan records the temporary estimated host-class telemetry exception.",
    ),
  ];
}

function artifactChecks(artifacts, input) {
  return [
    validationArtifactCheck(artifacts.validation),
    smokeArtifactCheck(artifacts.smoke),
    providerPreferenceArtifactCheck(artifacts.providerPreferenceSmoke),
    profileBenchmarkArtifactCheck(artifacts.profileBenchmark),
    memoryCertificationArtifactCheck(artifacts.memoryCertification),
    memoryCoverageArtifactCheck(artifacts.memoryTelemetryCoverage, input),
    strictMemoryCoverageArtifactCheck(artifacts.strictMemoryTelemetryCoverage, input),
    runtimePlatformArtifactCheck(artifacts.runtimePlatformCertification),
  ];
}

function liveChecks(liveResults, input) {
  if (liveResults.length) {
    return liveResults.map((result) => {
      const id = `live:${result.name ?? result.script ?? "local-deep-research"}`;
      if (result.status === "passed") {
        return passed(id, "Selected live Ambient/Pi validation passed.", result.script ?? result.name ?? "live");
      }
      if (result.status === "blocked") {
        const issue = liveBlockedIssue(result);
        return input.requireLive
          ? failed(id, "Required live Ambient/Pi validation completed.", issue)
          : advisory(id, "Selected live Ambient/Pi validation produced bounded blocker evidence.", issue);
      }
      return failed(
        id,
        "Selected live Ambient/Pi validation passed.",
        result.message ?? `${result.script ?? "live command"} failed.`,
      );
    });
  }
  if (input.requireLive) {
    return [failed("live:required", "Live Ambient/Pi validation is present when required.", "Live Local Deep Research validation was required but not selected.")];
  }
  return [advisory("live:skipped", "Live Ambient/Pi validation is tracked separately.", "Live Local Deep Research validation was skipped for this static release gate run.")];
}

function commandResultChecks(commandResults) {
  return commandResults
    .filter((result) => result.kind !== "live")
    .map((result) => {
      const id = `command:${result.script ?? "local"}`;
      if (result.status === "passed") {
        return passed(id, `${result.script} completed.`, `${result.durationMs ?? 0}ms`);
      }
      return failed(
        id,
        `${result.script} completed.`,
        `${result.script ?? "Local release-gate command"} ${result.status ?? "failed"}${result.exitCode !== undefined ? ` with exit code ${result.exitCode}` : ""}: ${result.message ?? "no details"}`,
      );
    });
}

function liveBlockedIssue(result) {
  const kind = result.blockerKind ?? "setup-blocked";
  const blockers = Array.isArray(result.blockers) ? result.blockers.filter(Boolean) : [];
  const blockerText = blockers.length ? `: ${blockers.slice(0, 3).join(" | ")}` : ".";
  const artifactText = result.summaryPath ? ` Evidence: ${result.summaryPath}.` : "";
  const memoryText = liveBlockedMemoryEvidenceText(result.memoryEvidence);
  return `Live Local Deep Research validation was blocked by ${kind}${blockerText}${artifactText}${memoryText}`;
}

function liveBlockedMemoryEvidenceText(evidence) {
  if (!evidence || typeof evidence !== "object") return "";
  const parts = [];
  if (finiteNumber(evidence.projectedSystemMemoryUtilization) !== undefined) {
    parts.push(`projected utilization ${formatPercent(evidence.projectedSystemMemoryUtilization)}`);
  }
  if (finiteNumber(evidence.maxProjectedMemoryUtilization) !== undefined) {
    parts.push(`ceiling ${formatPercent(evidence.maxProjectedMemoryUtilization)}`);
  }
  if (finiteNumber(evidence.projectedFreeMemoryRatio) !== undefined) {
    const freeBytes = finiteNumber(evidence.projectedFreeMemoryBytes);
    parts.push(`projected free ${formatPercent(evidence.projectedFreeMemoryRatio)}${freeBytes !== undefined ? ` (${formatGiB(freeBytes)} GiB)` : ""}`);
  }
  if (finiteNumber(evidence.minFreeMemoryRatioAfterLaunch) !== undefined) {
    parts.push(`floor ${formatPercent(evidence.minFreeMemoryRatioAfterLaunch)}`);
  }
  if (finiteNumber(evidence.activeActualResidentMemoryBytes) !== undefined) {
    parts.push(`actual RSS ${formatGiB(evidence.activeActualResidentMemoryBytes)} GiB`);
  }
  return parts.length ? ` Memory evidence: ${parts.join(", ")}.` : "";
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatGiB(bytes) {
  return (Math.max(0, bytes) / (1024 ** 3)).toFixed(1);
}

function validationArtifactCheck(artifact) {
  if (!artifact) return failed("artifact:validation", "Setup validation artifact is present.", "Missing .ambient/local-deep-research/validation.json.");
  if (artifact.status !== "passed") {
    return failed("artifact:validation", "Setup validation passed.", `Validation status was ${artifact.status ?? "missing"}.`);
  }
  const required = ["setup-contract", "model-cache", "llama-runtime", "search-providers", "fetch-providers", "physical-memory-telemetry", "provider-preference-smoke"];
  const missing = missingIds(required, artifact.checks);
  if (missing.length) {
    return failed("artifact:validation", "Setup validation includes required checks.", `Validation missing checks: ${missing.join(", ")}.`);
  }
  return passed("artifact:validation", "Setup validation passed.", artifact.artifactPath ?? "validation.json");
}

function smokeArtifactCheck(artifact) {
  if (!artifact) return failed("artifact:smoke", "Managed-boundary smoke artifact is present.", "Missing passed Local Deep Research managed-boundary smoke artifact.");
  if (artifact.status !== "passed") {
    return failed("artifact:smoke", "Managed-boundary smoke passed.", `Smoke status was ${artifact.status ?? "missing"}.`);
  }
  const missing = missingIds(["setup-contract", "model-cache", "runtime-cache", "llama-chat"], artifact.checks);
  if (missing.length) return failed("artifact:smoke", "Managed-boundary smoke includes readiness and chat checks.", `Smoke missing checks: ${missing.join(", ")}.`);
  if (!String(artifact.chat?.response ?? "").includes("LOCAL_DEEP_RESEARCH_SMOKE_OK")) {
    return failed("artifact:smoke", "Managed-boundary smoke includes the local sentinel response.", "Smoke response did not contain LOCAL_DEEP_RESEARCH_SMOKE_OK.");
  }
  return passed("artifact:smoke", "Managed-boundary smoke passed.", artifact.artifactPath ?? "smoke artifact");
}

function providerPreferenceArtifactCheck(artifact) {
  if (!artifact) return failed("artifact:provider-preference-smoke", "Provider preference smoke artifact is present.", "Missing provider preference smoke artifact.");
  if (artifact.status !== "passed") {
    return failed("artifact:provider-preference-smoke", "Provider preference smoke passed.", `Provider preference smoke status was ${artifact.status ?? "missing"}.`);
  }
  const missing = missingIds(requiredProviderSmokeChecks, artifact.checks);
  if (missing.length) {
    return failed(
      "artifact:provider-preference-smoke",
      "Provider preference smoke covers preference changes and fallback policy.",
      `Provider preference smoke missing checks: ${missing.join(", ")}.`,
    );
  }
  return passed("artifact:provider-preference-smoke", "Provider preference smoke passed.", `${artifact.checks?.length ?? 0} checks`);
}

function profileBenchmarkArtifactCheck(artifact) {
  if (!artifact) return failed("artifact:profile-benchmark", "Q4/Q8 mixed-source profile benchmark artifact is present.", "Missing profile benchmark artifact.");
  if (artifact.status !== "passed") {
    return failed("artifact:profile-benchmark", "Q4/Q8 mixed-source profile benchmark passed.", `Profile benchmark status was ${artifact.status ?? "missing"}.`);
  }
  const profiles = new Map((artifact.profiles ?? []).map((profile) => [profile.profileId, profile]));
  const missing = requiredProfiles.filter((profileId) => profiles.get(profileId)?.status !== "passed");
  if (missing.length) {
    return failed("artifact:profile-benchmark", "Both Q4 and Q8 profile benchmark lanes passed.", `Missing passed profile lanes: ${missing.join(", ")}.`);
  }
  const weak = requiredProfiles.filter((profileId) => Number(profiles.get(profileId)?.quality?.score ?? 0) < 1);
  if (weak.length) {
    return failed("artifact:profile-benchmark", "Both profile lanes meet quality score 1.0.", `Profile lanes below quality score 1.0: ${weak.join(", ")}.`);
  }
  return passed("artifact:profile-benchmark", "Q4/Q8 mixed-source profile benchmark passed.", artifact.createdAt ?? "profile benchmark");
}

function memoryCertificationArtifactCheck(artifact) {
  if (!artifact) return failed("artifact:memory-certification", "Memory certification artifact is present.", "Missing memory certification artifact.");
  if (artifact.status !== "passed") {
    return failed("artifact:memory-certification", "Memory certification passed.", `Memory certification status was ${artifact.status ?? "missing"}.`);
  }
  const missing = missingIds(requiredMemoryCertificationChecks, artifact.checks);
  if (missing.length) {
    return failed("artifact:memory-certification", "Memory certification covers target host and residency policy fixtures.", `Memory certification missing checks: ${missing.join(", ")}.`);
  }
  return passed("artifact:memory-certification", "Memory certification passed.", `${artifact.checks?.length ?? 0} checks`);
}

function memoryCoverageArtifactCheck(artifact, input) {
  if (!artifact) return failed("artifact:memory-telemetry-coverage", "Memory telemetry coverage artifact is present.", "Missing memory telemetry coverage artifact.");
  const missing = requiredMemoryClasses.filter((memoryClass) => !(artifact.observedPhysicalMemoryClasses ?? []).includes(memoryClass));
  if (artifact.status !== "complete" || missing.length) {
    return failed("artifact:memory-telemetry-coverage", "Memory telemetry coverage is complete.", `Memory telemetry coverage missing classes: ${missing.join(", ") || artifact.status}.`);
  }
  const estimated = artifact.estimatedPhysicalMemoryClasses ?? [];
  if (estimated.length && input.requireStrictMemory) {
    return failed("artifact:memory-telemetry-coverage", "Memory telemetry coverage uses only real physical-host observations.", `Estimated memory classes remain: ${estimated.join(", ")}.`);
  }
  if (estimated.length) {
    return advisory(
      "artifact:memory-telemetry-coverage",
      "Memory telemetry coverage is complete with explicit estimates.",
      `Temporary estimated memory classes: ${estimated.join(", ")}.`,
    );
  }
  return passed("artifact:memory-telemetry-coverage", "Memory telemetry coverage is complete.", artifact.checkedAt ?? "memory coverage");
}

function strictMemoryCoverageArtifactCheck(artifact, input) {
  if (!artifact) {
    return input.requireStrictMemory
      ? failed("artifact:strict-memory-telemetry", "Strict memory telemetry artifact is present.", "Missing strict real-only memory telemetry coverage artifact.")
      : advisory("artifact:strict-memory-telemetry", "Strict memory telemetry gate is tracked.", "Strict real-only memory telemetry artifact was not found.");
  }
  if (artifact.status === "complete" && !(artifact.estimatedPhysicalMemoryClasses ?? []).length) {
    return passed("artifact:strict-memory-telemetry", "Strict real-only memory telemetry gate passed.", artifact.checkedAt ?? "strict memory coverage");
  }
  const missing = artifact.missingPhysicalMemoryClasses ?? [];
  if (input.requireStrictMemory) {
    return failed("artifact:strict-memory-telemetry", "Strict real-only memory telemetry gate passed.", `Strict memory telemetry still missing: ${missing.join(", ") || artifact.status}.`);
  }
  return advisory("artifact:strict-memory-telemetry", "Strict memory telemetry gap is explicit.", `Strict real-only memory telemetry still missing: ${missing.join(", ") || artifact.status}.`);
}

function runtimePlatformArtifactCheck(artifact) {
  if (!artifact) return failed("artifact:runtime-platforms", "Runtime platform certification artifact is present.", "Missing runtime platform certification artifact.");
  if (artifact.status !== "passed") {
    return failed("artifact:runtime-platforms", "Runtime platform certification passed.", `Runtime platform certification status was ${artifact.status ?? "missing"}.`);
  }
  const decisions = new Map((artifact.decisions ?? []).map((decision) => [decision.id, decision]));
  const checks = [
    ["macos-arm64-metal", "enable-default-managed-install"],
    ["linux-x64-vulkan", "keep-conditional-managed-install"],
    ["windows-x64-cpu", "pin-but-disable-default-install"],
    ["windows-x64-gpu", "defer-managed-install"],
  ];
  const missing = checks.filter(([id, decision]) => decisions.get(id)?.decision !== decision).map(([id]) => id);
  if (missing.length) {
    return failed("artifact:runtime-platforms", "Runtime platform certification records expected macOS/Linux/Windows decisions.", `Runtime platform decisions missing or mismatched: ${missing.join(", ")}.`);
  }
  return passed("artifact:runtime-platforms", "Runtime platform certification passed.", artifact.checkedAt ?? "runtime platforms");
}

function textIncludes(id, text, needle, description) {
  if (String(text ?? "").includes(needle)) return passed(id, description, `Found ${needle}.`);
  return failed(id, description, `Missing ${needle}.`);
}

function missingIds(requiredIds, checks) {
  const present = new Set((checks ?? []).filter((check) => check?.status === "passed").map((check) => check.id));
  return requiredIds.filter((id) => !present.has(id));
}

function passed(id, description, evidence) {
  return { id, status: "passed", description, evidence };
}

function advisory(id, description, issue) {
  return { id, status: "advisory", description, evidence: issue, issue };
}

function failed(id, description, issue) {
  return { id, status: "failed", description, evidence: issue, issue };
}
