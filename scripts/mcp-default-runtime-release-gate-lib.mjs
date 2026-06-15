const REQUIRED_SCRIPTS = [
  ["test:mcp-default-catalog", "default MCP catalog verifier"],
  ["test:mcp-toolhive-runtime:live", "live ToolHive/container runtime probe"],
  ["test:mcp-tool-bridge:live", "live ToolHive MCP bridge smoke"],
  ["test:mcp-scrapling-default:live", "live Scrapling default capability smoke"],
  ["test:mcp-live-pi-smoke:live", "live Ambient/Pi MCP fixture smoke"],
  ["test:mcp-runtime-host-preflight", "container runtime host preflight fixture"],
  ["test:mcp-runtime-host-preflight:local", "local container runtime host preflight"],
  ["test:mcp-runtime-host-preflight:linux", "Linux SSH container runtime host preflight"],
  ["test:mcp-default-runtime-release-gate", "default runtime release gate"],
  ["test:mcp-default-runtime-release-gate:live", "live default runtime release gate"],
  ["test:mcp-default-runtime-release-gate:release", "strict default runtime release gate"],
];

const CONTEXT7_ID = "io.github.stacklok/context7";
const SCRAPLING_ID = "io.github.d4vinci/scrapling";

export function buildMcpDefaultRuntimeReleaseGateReport(input = {}) {
  const packageJson = objectValue(input.packageJson);
  const scripts = objectValue(packageJson.scripts);
  const descriptors = Array.isArray(input.descriptors) ? input.descriptors : [];
  const descriptorById = new Map(descriptors.map((descriptor) => [descriptor?.serverId, objectValue(descriptor)]));
  const liveResults = Array.isArray(input.liveResults) ? input.liveResults : [];
  const hostPreflightResults = Array.isArray(input.hostPreflightResults) ? input.hostPreflightResults : [];
  const requireLive = input.requireLive === true;
  const requiredHostPreflightPlatforms = normalizePlatformList(input.requiredHostPreflightPlatforms);
  const hostPreflightMaxAgeHours = positiveNumber(input.hostPreflightMaxAgeHours);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const checks = [
    ...scriptChecks(scripts),
    catalogShapeCheck(descriptors),
    context7DescriptorCheck(descriptorById.get(CONTEXT7_ID)),
    scraplingDescriptorCheck(descriptorById.get(SCRAPLING_ID)),
    installGateSurfaceCheck(input.sourceFiles),
    defaultArtifactResolutionSurfaceCheck(input.sourceFiles),
    planDocumentCheck(input.dockerInstallPlanHtml),
    installerUpdatePlanCheck(input.installerUpdatePlanHtml),
    liveEvidenceCheck(liveResults, requireLive),
    hostPreflightEvidenceCheck(hostPreflightResults, {
      requiredPlatforms: requiredHostPreflightPlatforms,
      maxAgeHours: hostPreflightMaxAgeHours,
      now: generatedAt,
    }),
  ];
  const blockingIssues = checks.filter((check) => check.status === "fail").flatMap((check) => check.issues);
  const advisoryIssues = checks.filter((check) => check.status === "warn").flatMap((check) => check.warnIssues);
  const liveSelected = liveResults.length > 0;
  const liveFailed = liveResults.some((result) => result?.status !== "passed");
  const status = blockingIssues.length
    ? "attention"
    : !liveSelected
      ? "passed_with_live_skipped"
      : advisoryIssues.length
        ? "passed_with_warnings"
        : "passed";
  return {
    schemaVersion: 1,
    runId: stringValue(input.runId),
    status,
    focus: "Default MCP runtime release gate: packaged defaults, default Scrapling capability, ToolHive runtime validation, and live Ambient/Pi smoke hooks.",
    generatedAt,
    sourceRevision: input.sourceRevision,
    artifacts: compactGateArtifacts(input.artifacts),
    policy: {
      requireLive,
      liveCommands: ["runtime", "bridge", "scrapling", "pi"],
      providerForPiLive: "ambient",
      supportedPlatforms: ["darwin", "linux", "win32"],
      hostPreflightPlatforms: ["darwin", "linux", "win32"],
      requiredHostPreflightPlatforms,
      hostPreflightMaxAgeHours,
      localHostPreflight: "collected automatically by --run-live, or explicitly by --run-host-preflight-local",
      bridgeSmokeServer: SCRAPLING_ID,
      registryProvenanceCanary: CONTEXT7_ID,
      dockerConfigOwner: "ambient-userData",
    },
    defaults: {
      descriptorCount: descriptors.length,
      serverIds: descriptors.map((descriptor) => descriptor?.serverId).filter(Boolean).sort(),
      context7: compactDescriptor(descriptorById.get(CONTEXT7_ID)),
      scrapling: compactDescriptor(descriptorById.get(SCRAPLING_ID)),
    },
    live: {
      selected: liveSelected,
      required: requireLive,
      results: liveResults.map(compactLiveResult),
    },
    hostPreflight: {
      selected: hostPreflightResults.length > 0,
      results: hostPreflightResults.map(compactHostPreflightResult),
    },
    checks,
    releaseDecision: {
      ready: blockingIssues.length === 0 && (!requireLive || (liveSelected && !liveFailed)),
      liveRequired: requireLive,
      liveSkipped: !liveSelected,
      hostPreflightRequired: requiredHostPreflightPlatforms.length > 0,
      requiredHostPreflightPlatforms,
      blockingIssues,
      advisoryIssues,
      nextSlice: blockingIssues.length
        ? "Fix the default MCP runtime gate failures before expanding the default capability rollout."
        : liveSelected && advisoryIssues.length
          ? "Default MCP runtime gate has live evidence with advisories; address the remaining advisory smoke coverage and repeat on the remaining target platforms before release."
          : liveSelected
            ? "Default MCP runtime gate is green with live evidence; repeat on the remaining target platforms before release."
          : "Default MCP runtime gate is green for deterministic evidence; run the live gate on macOS, Linux, and Windows before shipping default MCP runtime changes.",
    },
  };
}

export function renderMcpDefaultRuntimeReleaseGateMarkdown(report) {
  const lines = [
    "# MCP Default Runtime Release Gate",
    "",
    `- Status: \`${report?.status ?? "unknown"}\``,
    `- Ready: ${report?.releaseDecision?.ready === true ? "yes" : "no"}`,
    `- Generated: ${report?.generatedAt ?? "unknown"}`,
  ];
  if (report?.runId) lines.push(`- Run: \`${report.runId}\``);
  const artifacts = objectValue(report?.artifacts);
  if (Object.keys(artifacts).length) {
    lines.push("", "## Artifacts");
    for (const [label, path] of Object.entries(artifacts)) {
      if (path) lines.push(`- ${label}: \`${path}\``);
    }
  }

  lines.push("", "## Checks", "", "| Status | Area | Label |", "| --- | --- | --- |");
  for (const check of Array.isArray(report?.checks) ? report.checks : []) {
    lines.push(`| \`${escapeMarkdownTable(check?.status ?? "unknown")}\` | ${escapeMarkdownTable(check?.area ?? "unknown")} | ${escapeMarkdownTable(check?.label ?? "unknown")} |`);
  }

  lines.push("", "## Live Evidence", "", "| Name | Status | Duration ms | stdout | stderr |", "| --- | --- | ---: | --- | --- |");
  const liveResults = Array.isArray(report?.live?.results) ? report.live.results : [];
  if (!liveResults.length) {
    lines.push("| none | not run | 0 |  |  |");
  } else {
    for (const result of liveResults) {
      const output = objectValue(result?.outputArtifacts);
      lines.push([
        escapeMarkdownTable(result?.name ?? "unknown"),
        `\`${escapeMarkdownTable(result?.status ?? "unknown")}\``,
        String(result?.durationMs ?? 0),
        output.stdoutPath ? `\`${escapeMarkdownTable(output.stdoutPath)}\` (${output.stdoutBytes ?? 0} B)` : "",
        output.stderrPath ? `\`${escapeMarkdownTable(output.stderrPath)}\` (${output.stderrBytes ?? 0} B)` : "",
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
  }

  lines.push("", "## Host Preflight", "", "| Target | Platform | Status | Generated | Evidence |", "| --- | --- | --- | --- | --- |");
  const hostResults = Array.isArray(report?.hostPreflight?.results) ? report.hostPreflight.results : [];
  if (!hostResults.length) {
    lines.push("| none | unknown | not run |  |  |");
  } else {
    for (const result of hostResults) {
      lines.push([
        escapeMarkdownTable(result?.target ?? "unknown"),
        escapeMarkdownTable(result?.platform ?? "unknown"),
        `\`${escapeMarkdownTable(result?.status ?? "unknown")}\``,
        escapeMarkdownTable(result?.generatedAt ?? ""),
        result?.evidencePath ? `\`${escapeMarkdownTable(result.evidencePath)}\`` : "",
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
  }

  lines.push("", "## Issues");
  const blocking = Array.isArray(report?.releaseDecision?.blockingIssues) ? report.releaseDecision.blockingIssues : [];
  const advisory = Array.isArray(report?.releaseDecision?.advisoryIssues) ? report.releaseDecision.advisoryIssues : [];
  lines.push("", "### Blocking");
  if (!blocking.length) lines.push("- none");
  else for (const issue of blocking) lines.push(`- ${issue}`);
  lines.push("", "### Advisory");
  if (!advisory.length) lines.push("- none");
  else for (const issue of advisory) lines.push(`- ${issue}`);

  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function mcpDefaultRuntimeReleaseGatePassed(report, options = {}) {
  if (!report || report.releaseDecision?.ready !== true) return false;
  if (options.requireLive === true && report.releaseDecision.liveSkipped === true) return false;
  return report.status === "passed" ||
    report.status === "passed_with_warnings" ||
    (!options.requireLive && report.status === "passed_with_live_skipped");
}

function scriptChecks(scripts) {
  return REQUIRED_SCRIPTS.map(([name, label]) => {
    const script = typeof scripts[name] === "string" ? scripts[name] : "";
    return check({
      id: `script.${name}`,
      area: "commands",
      status: script.trim() ? "pass" : "fail",
      label: `${label} command is registered`,
      evidence: script ? [`${name}: ${script}`] : [`missing package.json script ${name}`],
      issues: script ? [] : [`Missing package.json script ${name}.`],
    });
  });
}

function catalogShapeCheck(descriptors) {
  const serverIds = descriptors.map((descriptor) => descriptor?.serverId).filter(Boolean);
  const issues = [];
  if (!serverIds.includes(CONTEXT7_ID)) issues.push("Default MCP catalog must include Context7.");
  if (!serverIds.includes(SCRAPLING_ID)) issues.push("Default MCP catalog must include Scrapling.");
  if (new Set(serverIds).size !== serverIds.length) issues.push("Default MCP catalog has duplicate serverId values.");
  return check({
    id: "catalog.defaults",
    area: "catalog",
    status: issues.length ? "fail" : "pass",
    label: "default MCP catalog includes the required default candidates",
    evidence: [`serverIds: ${serverIds.sort().join(", ") || "none"}`],
    issues,
  });
}

function context7DescriptorCheck(descriptor) {
  const issues = [];
  const warnIssues = [];
  if (!descriptor) issues.push("Context7 descriptor is missing.");
  else {
    if (descriptor.source?.type !== "toolhive-registry") issues.push("Context7 must remain a ToolHive registry default.");
    if (descriptor.source?.registryId !== CONTEXT7_ID) issues.push("Context7 source.registryId must match its serverId.");
    const smoke = descriptor.promotion?.smokeTest;
    if (smoke?.status !== "passed") warnIssues.push("Context7 registry/provenance canary smoke evidence is missing or stale.");
    const image = stringValue(descriptor.registryInfo?.image);
    if (!image) issues.push("Context7 must declare its ToolHive image.");
    if (image?.endsWith(":latest")) issues.push("Context7 must not use a latest image tag.");
    if (image && !image.includes("@sha256:") && !/:[^/:@]+$/.test(image)) issues.push("Context7 image must use an exact tag or digest.");
    const envVars = Array.isArray(descriptor.registryInfo?.env_vars) ? descriptor.registryInfo.env_vars : [];
    const secret = envVars.find((entry) => entry?.name === "CONTEXT7_API_KEY");
    if (!secret) warnIssues.push("Context7 optional API-key secret metadata is missing.");
    else if (secret.secret !== true || secret.required !== false) issues.push("CONTEXT7_API_KEY must remain optional and marked secret.");
    const outbound = descriptor.registryInfo?.permissions?.network?.outbound;
    if (!arrayIncludes(outbound?.allow_host, "context7.com")) warnIssues.push("Context7 network policy should keep its documented service host visible.");
    if (!arrayIncludes(outbound?.allow_port, 443)) warnIssues.push("Context7 network policy should keep HTTPS egress explicit.");
  }
  return check({
    id: "descriptor.context7",
    area: "catalog",
    status: issues.length ? "fail" : warnIssues.length ? "warn" : "pass",
    label: "Context7 descriptor stays registry-backed, pinned, and tracked as the registry/provenance canary",
    evidence: descriptor ? [`image: ${descriptor.registryInfo?.image ?? "missing"}`, `smoke: ${descriptor.promotion?.smokeTest?.status ?? "missing"}`] : ["missing"],
    issues,
    warnIssues,
  });
}

function scraplingDescriptorCheck(descriptor) {
  const issues = [];
  const warnIssues = [];
  if (!descriptor) issues.push("Scrapling descriptor is missing.");
  else {
    if (descriptor.source?.type !== "ambient-default-oci") issues.push("Scrapling must remain an Ambient-owned default OCI descriptor, not a generic registry guess.");
    if (descriptor.defaultCapability?.capabilityId !== "scrapling") issues.push("Scrapling defaultCapability.capabilityId must be scrapling.");
    if (descriptor.defaultCapability?.workloadName !== "ambient-scrapling") issues.push("Scrapling default workload must remain ambient-scrapling.");
    if (descriptor.defaultCapability?.autoInstall !== true) issues.push("Scrapling default capability must be queued for auto-install after runtime approval.");
    const image = stringValue(descriptor.registryInfo?.image);
    if (!image?.includes("@sha256:")) issues.push("Scrapling image must be pinned by digest.");
    if (descriptor.registryInfo?.imageVerificationPolicy !== "ambient-reviewed") {
      issues.push("Scrapling default capability must declare imageVerificationPolicy ambient-reviewed.");
    }
    if (image?.endsWith(":latest")) issues.push("Scrapling must not use latest.");
    const args = Array.isArray(descriptor.registryInfo?.server_args) ? descriptor.registryInfo.server_args : [];
    if (JSON.stringify(args) !== JSON.stringify(["mcp"])) issues.push("Scrapling ToolHive server_args must remain exactly [\"mcp\"].");
    for (const tool of ["get", "fetch", "screenshot"]) {
      if (!arrayIncludes(descriptor.registryInfo?.tools, tool)) issues.push(`Scrapling registryInfo.tools must include ${tool}.`);
    }
    if (Array.isArray(descriptor.registryInfo?.env_vars) && descriptor.registryInfo.env_vars.length > 0) {
      issues.push("Scrapling default capability must not require secrets.");
    }
    const filesystem = descriptor.registryInfo?.permissions?.filesystem;
    if (filesystem?.workspace_read !== false || filesystem?.workspace_write !== false) {
      issues.push("Scrapling default capability must not receive workspace filesystem access.");
    }
    const outbound = descriptor.registryInfo?.permissions?.network?.outbound;
    if (outbound?.insecure_allow_all !== true) issues.push("Scrapling default capability must explicitly model broad task-dependent public web egress.");
    if (!arrayIncludes(outbound?.allow_port, 80) || !arrayIncludes(outbound?.allow_port, 443)) {
      issues.push("Scrapling network policy must keep HTTP/HTTPS egress visible.");
    }
    const justification = stringValue(outbound?.justification)?.toLowerCase() ?? "";
    if (!justification.includes("local") || !justification.includes("private")) {
      issues.push("Scrapling network justification must call out local/private target blocking.");
    }
    if (descriptor.promotion?.smokeTest?.status !== "passed") {
      warnIssues.push("Scrapling full pull/start/tool smoke is still pending live release evidence.");
    }
  }
  return check({
    id: "descriptor.scrapling",
    area: "catalog",
    status: issues.length ? "fail" : warnIssues.length ? "warn" : "pass",
    label: "Scrapling descriptor stays digest-pinned, default-owned, and permission-minimal",
    evidence: descriptor ? [`image: ${descriptor.registryInfo?.image ?? "missing"}`, `workload: ${descriptor.defaultCapability?.workloadName ?? "missing"}`] : ["missing"],
    issues,
    warnIssues,
  });
}

function planDocumentCheck(html) {
  const text = typeof html === "string" ? html : "";
  const required = [
    "MCP install gating",
    "Default capability handoff",
    "Live validation",
    "Scrapling-backed bridge smoke",
    "registry/provenance canary",
    "clean Docker config",
    "image verification policy",
    "Scrapling",
    "Docker",
    "Podman",
    "Windows",
    "Linux",
    "macOS",
  ];
  const issues = required.filter((term) => !text.includes(term)).map((term) => `dockerInstallPlan.html must mention ${term}.`);
  return check({
    id: "plan.docker-install",
    area: "docs",
    status: issues.length ? "fail" : "pass",
    label: "dockerInstallPlan documents the runtime and default capability validation path",
    evidence: [`required terms present: ${required.length - issues.length}/${required.length}`],
    issues,
  });
}

function installerUpdatePlanCheck(html) {
  const text = typeof html === "string" ? html : "";
  const required = [
    "Status: implementation complete",
    "Phase 1",
    "Phase 2",
    "Phase 3",
    "Phase 4",
    "Phase 5",
    "OCI platform resolution",
    "Local Deep Research follow-on",
    "Validation Evidence",
    "blocked live evidence",
  ];
  const issues = required.filter((term) => !text.includes(term)).map((term) => `installerUpdatePlan.html must mention ${term}.`);
  return check({
    id: "plan.installer-update",
    area: "docs",
    status: issues.length ? "fail" : "pass",
    label: "installerUpdatePlan records implementation status, evidence, and remaining live blockers",
    evidence: [`required terms present: ${required.length - issues.length}/${required.length}`],
    issues,
  });
}

function installGateSurfaceCheck(sourceFiles) {
  const files = objectValue(sourceFiles);
  const required = [
    {
      label: "mcpInstallGate.ts",
      text: files.mcpInstallGateTs,
      terms: ["evaluateMcpInstallGate", "pendingDefaultCapabilities", "mcpDefaultCapabilityStatePathForUserData"],
    },
    {
      label: "agentRuntimeMcpServerTools.ts",
      text: files.agentRuntimeMcpServerToolsTs,
      terms: ["evaluateMcpInstallGate", "installGate:"],
    },
    {
      label: "mcpServerPiTools.ts",
      text: files.mcpServerPiToolsTs,
      terms: ["installGate", "ambient_mcp_server_install", "ambient_mcp_standard_import_install", "ambient_mcp_remote_proxy_install"],
    },
    {
      label: "mcpServerPiTools.test.ts",
      text: files.mcpServerPiToolsTestTs,
      terms: ["fakeDefaultCapabilityPendingGate", "pendingDefaultCapabilities"],
    },
  ];
  const issues = required.flatMap((file) => {
    const text = typeof file.text === "string" ? file.text : "";
    if (!text) return [`${file.label} must be included in the release gate source surface.`];
    return file.terms.filter((term) => !text.includes(term)).map((term) => `${file.label} must include ${term}.`);
  });
  return check({
    id: "install-gate.surface",
    area: "runtime-gate",
    status: issues.length ? "fail" : "pass",
    label: "custom MCP install tools are wired through the shared default-capability gate",
    evidence: required.map((file) => `${file.label}: ${typeof file.text === "string" && file.text.length > 0 ? "present" : "missing"}`),
    issues,
  });
}

function defaultArtifactResolutionSurfaceCheck(sourceFiles) {
  const files = objectValue(sourceFiles);
  const required = [
    {
      label: "containerRuntimeProbeService.ts",
      text: files.containerRuntimeProbeServiceTs,
      terms: ["/opt/homebrew/bin/podman", "wsl.exe", "C:\\\\Program Files\\\\RedHat\\\\Podman\\\\podman.exe", "candidateCommands"],
    },
    {
      label: "containerRuntimeInstallLauncher.ts",
      text: files.containerRuntimeInstallLauncherTs,
      terms: ["Open Podman Desktop from Applications", "Docker Desktop with the WSL 2 backend", "podman-desktop-macos-open"],
    },
    {
      label: "ociImageResolver.ts",
      text: files.ociImageResolverTs,
      terms: ["resolveOciImageForRuntimePlatform", "runtimeOciPlatform", "index-resolved", "linux"],
    },
    {
      label: "mcpDefaultCapabilityInstaller.ts",
      text: files.mcpDefaultCapabilityInstallerTs,
      terms: ["resolveOciImageForRuntimePlatform", "imageResolution.resolvedImage", "Default MCP capability image preflight failed"],
    },
    {
      label: "toolHiveRuntimeService.ts",
      text: files.toolHiveRuntimeServiceTs,
      terms: ["formatToolHiveRunImportFailure", "Actionable diagnosis", "platform-specific Linux child manifest"],
    },
    {
      label: "App.tsx",
      text: files.rendererAppTsx,
      terms: ["LocalDeepResearchFollowupDialog", "openSearchWebSettings", "onDefaultCapabilityInstalled"],
    },
  ];
  const issues = required.flatMap((file) => {
    const text = typeof file.text === "string" ? file.text : "";
    if (!text) return [`${file.label} must be included in the default artifact resolution gate source surface.`];
    return file.terms.filter((term) => !text.includes(term)).map((term) => `${file.label} must include ${term}.`);
  });
  return check({
    id: "default-artifact-resolution.surface",
    area: "runtime-gate",
    status: issues.length ? "fail" : "pass",
    label: "default Scrapling install resolves reviewed OCI artifacts before ToolHive run-import",
    evidence: required.map((file) => `${file.label}: ${typeof file.text === "string" && file.text.length > 0 ? "present" : "missing"}`),
    issues,
  });
}

function liveEvidenceCheck(liveResults, requireLive) {
  const issues = [];
  const warnIssues = [];
  const requiredNames = ["runtime", "bridge", "scrapling", "pi"];
  const seenNames = new Set(liveResults.map((result) => result?.name).filter(Boolean));
  if (!liveResults.length) {
    const message = "Live MCP runtime validation was not selected for this gate run.";
    if (requireLive) issues.push(message);
    else warnIssues.push(`${message} Run pnpm run test:mcp-default-runtime-release-gate:live before release.`);
  } else {
    const missingNames = requiredNames.filter((name) => !seenNames.has(name));
    if (missingNames.length) {
      const message = `Live MCP runtime validation is missing required command(s): ${missingNames.join(", ")}.`;
      if (requireLive) issues.push(message);
      else warnIssues.push(message);
    }
  }
  for (const result of liveResults) {
    if (result?.status !== "passed") {
      issues.push(`Live command ${result?.name ?? "unknown"} failed: ${result?.message ?? "no details"}`);
    }
    if (!hasLiveOutputArtifacts(result)) {
      const message = `Live command ${result?.name ?? "unknown"} did not record stdout/stderr artifact paths.`;
      if (requireLive) issues.push(message);
      else warnIssues.push(message);
    }
  }
  return check({
    id: "live.evidence",
    area: "live",
    status: issues.length ? "fail" : warnIssues.length ? "warn" : "pass",
    label: "live runtime, bridge, and Ambient/Pi smoke evidence is available when required",
    evidence: liveResults.length
      ? liveResults.map((result) => `${result.name ?? "unknown"}=${result.status ?? "unknown"}`)
      : ["live not run"],
    issues,
    warnIssues,
  });
}

function hostPreflightEvidenceCheck(hostPreflightResults, options = {}) {
  const issues = [];
  const warnIssues = [];
  const supportedPlatforms = ["darwin", "linux", "win32"];
  const requiredPlatforms = normalizePlatformList(options.requiredPlatforms);
  const maxAgeHours = positiveNumber(options.maxAgeHours);
  const nowMs = timestampMs(options.now);
  const unknownRequiredPlatforms = requiredPlatforms.filter((platform) => !supportedPlatforms.includes(platform));
  if (unknownRequiredPlatforms.length) {
    issues.push(`Container host preflight requires unsupported platform(s): ${unknownRequiredPlatforms.join(", ")}.`);
  }
  const allowedStatuses = new Set(["ready", "permission-blocked", "installed-not-running", "missing"]);
  if (!hostPreflightResults.length) {
    const message = "Cross-platform container host preflight evidence was not selected.";
    if (requiredPlatforms.length) issues.push(`${message} Required platform(s): ${requiredPlatforms.join(", ")}.`);
    else warnIssues.push(`${message} Run test:mcp-runtime-host-preflight:local on each release host and test:mcp-runtime-host-preflight:linux for SSH Linux evidence when validating remotely.`);
  } else {
    const seenPlatforms = new Set(hostPreflightResults.map((result) => result?.platform).filter(Boolean));
    const missingSupportedPlatforms = supportedPlatforms.filter((platform) => !seenPlatforms.has(platform));
    const missingRequiredPlatforms = requiredPlatforms.filter((platform) => !seenPlatforms.has(platform));
    if (missingRequiredPlatforms.length) {
      issues.push(`Container host preflight evidence is missing required platform(s): ${missingRequiredPlatforms.join(", ")}.`);
    } else if (missingSupportedPlatforms.length) {
      warnIssues.push(`Container host preflight evidence is missing platform(s): ${missingSupportedPlatforms.join(", ")}.`);
    }
  }
  for (const result of hostPreflightResults) {
    const label = `${result?.target ?? "unknown"} (${result?.platform ?? "unknown"})`;
    if (!allowedStatuses.has(result?.status)) {
      issues.push(`Container host preflight ${label} has invalid status ${result?.status ?? "missing"}.`);
      continue;
    }
    if (result.status === "permission-blocked") {
      warnIssues.push(`Container host preflight ${label} found a runtime permission blocker: ${result.message ?? "no details"}`);
    } else if (result.status !== "ready") {
      warnIssues.push(`Container host preflight ${label} is not ready: ${result.message ?? result.status}`);
    }
    if (maxAgeHours) {
      const generatedAtMs = timestampMs(result.generatedAt);
      if (!generatedAtMs) {
        issues.push(`Container host preflight ${label} is missing a valid generatedAt timestamp.`);
      } else if (nowMs && generatedAtMs > nowMs + 60_000) {
        issues.push(`Container host preflight ${label} was generated in the future: ${result.generatedAt}.`);
      } else if (nowMs && nowMs - generatedAtMs > maxAgeHours * 60 * 60 * 1000) {
        issues.push(`Container host preflight ${label} is stale: generatedAt ${result.generatedAt} is older than ${maxAgeHours} hour(s).`);
      }
    }
  }
  return check({
    id: "host-preflight.evidence",
    area: "live",
    status: issues.length ? "fail" : warnIssues.length ? "warn" : "pass",
    label: "cross-platform container host preflight evidence is captured before release",
    evidence: hostPreflightResults.length
      ? hostPreflightResults.map((result) => `${result.target ?? "unknown"}:${result.platform ?? "unknown"}=${result.status ?? "unknown"}`)
      : ["host preflight not run"],
    issues,
    warnIssues,
  });
}

function compactDescriptor(descriptor) {
  if (!descriptor) return undefined;
  return {
    serverId: descriptor.serverId,
    sourceType: descriptor.source?.type,
    image: descriptor.registryInfo?.image,
    imageVerificationPolicy: descriptor.registryInfo?.imageVerificationPolicy,
    smokeStatus: descriptor.promotion?.smokeTest?.status,
    defaultCapability: descriptor.defaultCapability,
  };
}

function compactLiveResult(result) {
  return {
    name: result?.name,
    script: result?.script,
    status: result?.status,
    durationMs: result?.durationMs,
    exitCode: result?.exitCode,
    platform: result?.platform,
    arch: result?.arch,
    outputArtifacts: compactOutputArtifacts(result?.outputArtifacts),
    message: result?.message,
  };
}

function compactHostPreflightResult(result) {
  return {
    target: result?.target,
    transport: result?.transport,
    platform: result?.platform,
    arch: result?.arch,
    status: result?.status,
    message: result?.message,
    generatedAt: result?.generatedAt,
    evidencePath: result?.evidencePath,
    docker: {
      installed: result?.runtimes?.docker?.installed,
      ready: result?.runtimes?.docker?.ready,
      permissionBlocked: result?.runtimes?.docker?.permissionBlocked,
      version: result?.runtimes?.docker?.version,
    },
    podman: {
      installed: result?.runtimes?.podman?.installed,
      ready: result?.runtimes?.podman?.ready,
      permissionBlocked: result?.runtimes?.podman?.permissionBlocked,
      version: result?.runtimes?.podman?.version,
    },
    toolhive: {
      installed: result?.runtimes?.toolhive?.installed,
      version: result?.runtimes?.toolhive?.version,
    },
  };
}

function compactOutputArtifacts(artifacts) {
  const value = objectValue(artifacts);
  if (!value.stdoutPath && !value.stderrPath) return undefined;
  return {
    stdoutPath: value.stdoutPath,
    stdoutBytes: typeof value.stdoutBytes === "number" ? value.stdoutBytes : undefined,
    stderrPath: value.stderrPath,
    stderrBytes: typeof value.stderrBytes === "number" ? value.stderrBytes : undefined,
  };
}

function compactGateArtifacts(artifacts) {
  const value = objectValue(artifacts);
  const output = {};
  for (const key of ["latestJsonPath", "latestMarkdownPath", "archiveJsonPath", "archiveMarkdownPath", "liveArtifactDir"]) {
    const path = stringValue(value[key]);
    if (path) output[key] = path;
  }
  return Object.keys(output).length ? output : undefined;
}

function hasLiveOutputArtifacts(result) {
  const artifacts = objectValue(result?.outputArtifacts);
  return Boolean(
    stringValue(artifacts.stdoutPath) &&
    stringValue(artifacts.stderrPath) &&
    typeof artifacts.stdoutBytes === "number" &&
    typeof artifacts.stderrBytes === "number",
  );
}

function check(input) {
  return {
    id: input.id,
    area: input.area,
    status: input.status,
    label: input.label,
    evidence: input.evidence ?? [],
    issues: input.issues ?? [],
    warnIssues: input.warnIssues ?? [],
  };
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizePlatformList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(stringValue).filter(Boolean))];
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function timestampMs(value) {
  const text = stringValue(value);
  if (!text) return undefined;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : undefined;
}

function escapeMarkdownTable(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function arrayIncludes(value, expected) {
  return Array.isArray(value) && value.includes(expected);
}
