export const localRuntimeControlProofScenarios = [
  {
    id: "ldr-status-before-setup",
    label: "Pi inspects local runtime status before Local Deep Research setup",
  },
  {
    id: "minicpm-nondestructive-stop",
    label: "MiniCPM resident runtime stops without uninstalling provider state",
  },
  {
    id: "active-subagent-stop-blocker",
    label: "Active sub-agent local runtime lease blocks ordinary Stop",
  },
  {
    id: "untracked-runtime-safety",
    label: "Untracked local runtime stays visible and unavailable for Stop/Restart",
  },
  {
    id: "stale-lease-recovery",
    label: "Stale sub-agent local runtime lease no longer blocks ordinary lifecycle controls",
  },
  {
    id: "stopped-provider-display",
    label: "Stopped MiniCPM and local voice providers display as stopped",
  },
  {
    id: "provider-declared-lifecycle",
    label: "Provider-declared local runtime lifecycle controls run safely",
  },
  {
    id: "ldr-reasoning-synthesis",
    label: "Local Deep Research synthesis returns assistant output, not reasoning-only output",
  },
];

const lifecycleMutationTools = new Set([
  "ambient_local_model_runtime_start",
  "ambient_local_model_runtime_stop",
  "ambient_local_model_runtime_restart",
]);

export function buildLocalRuntimeControlProofGateReport(input = {}) {
  const checks = localRuntimeControlProofScenarios.map((scenario) => scenarioCheck(scenario, input));
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
    schemaVersion: "ambient-local-runtime-control-proof-gate-v1",
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    status,
    checks,
    releaseDecision: {
      blockingIssues,
      advisoryIssues,
      nextSlice: blockingIssues[0] ?? advisoryIssues[0] ?? "No local runtime control proof gaps found.",
    },
    options: {
      requireLiveProof: Boolean(input.requireLiveProof),
    },
  };
}

export function localRuntimeControlProofGatePassed(report, input = {}) {
  if (report.status === "attention") return false;
  if (!input.requireLiveProof) return true;
  return report.checks.every((check) => check.status === "passed");
}

function scenarioCheck(scenario, input) {
  if (scenario.id === "ldr-status-before-setup") {
    return ldrStatusBeforeSetupCheck(input);
  }
  if (scenario.id === "ldr-reasoning-synthesis") {
    return ldrReasoningSynthesisCheck(input);
  }
  return scenarioArtifactCheck(scenario, input);
}

function ldrStatusBeforeSetupCheck(input) {
  const summary = input.artifacts?.localDeepResearchLive;
  if (!summary) return missingScenarioCheck("ldr-status-before-setup", "Missing Local Deep Research live summary artifact.");
  const toolNames = compactStringArray(summary.piBlockedPreflight?.rawToolNames ?? summary.rawToolNames);
  const statusIndex = toolNames.indexOf("ambient_local_model_runtime_status");
  const setupIndex = toolNames.indexOf("ambient_local_deep_research_setup");
  const lifecycleMutations = toolNames.filter((toolName) => lifecycleMutationTools.has(toolName));
  if (statusIndex >= 0 && setupIndex >= 0 && statusIndex < setupIndex && lifecycleMutations.length === 0) {
    const blocker = summary.status === "blocked" ? ` blocked by ${summary.blockerKind ?? "setup-blocked"}` : "";
    return passed("scenario:ldr-status-before-setup", "Pi inspected local runtime status before LDR setup.", `rawToolNames=${toolNames.join(", ")}${blocker}`);
  }
  return failedOrAdvisory(
    input,
    "scenario:ldr-status-before-setup",
    "Pi inspected local runtime status before LDR setup.",
    `Local Deep Research live summary did not prove runtime-status-before-setup. rawToolNames=${toolNames.join(", ") || "none"}.`,
  );
}

function ldrReasoningSynthesisCheck(input) {
  const summary = input.artifacts?.localDeepResearchLive;
  if (!summary) return missingScenarioCheck("ldr-reasoning-synthesis", "Missing Local Deep Research live summary artifact.");
  if (summary.status === "passed" && summary.runStatus && summary.completionStatus === "completed") {
    return passed(
      "scenario:ldr-reasoning-synthesis",
      "Local Deep Research run completed with assistant synthesis output.",
      `runStatus=${summary.runStatus}; completionStatus=${summary.completionStatus}`,
    );
  }
  const reason = summary.status === "blocked"
    ? `Local Deep Research full run is still blocked by ${summary.blockerKind ?? "setup-blocked"}.`
    : "Local Deep Research summary did not prove a completed synthesis run.";
  return failedOrAdvisory(input, "scenario:ldr-reasoning-synthesis", "Local Deep Research run completed with assistant synthesis output.", reason);
}

function scenarioArtifactCheck(scenario, input) {
  const artifact = input.artifacts?.localRuntimeControl?.scenarios?.[scenario.id];
  if (!artifact) return missingScenarioCheck(scenario.id, `Missing ${scenario.label} dogfood artifact.`);
  if (artifact.status !== "passed") {
    return failedOrAdvisory(input, `scenario:${scenario.id}`, scenario.label, artifact.reason ?? `${scenario.label} status was ${artifact.status ?? "missing"}.`);
  }
  const validation = scenarioArtifactValidation(scenario.id, artifact);
  if (validation) return failedOrAdvisory(input, `scenario:${scenario.id}`, scenario.label, validation);
  return passed(`scenario:${scenario.id}`, scenario.label, artifact.evidence ?? artifact.summary ?? "scenario artifact passed");
}

function scenarioArtifactValidation(id, artifact) {
  if (id === "minicpm-nondestructive-stop") {
    if (artifact.stopped !== true) return "MiniCPM stop artifact did not prove stopped=true.";
    if (artifact.uninstalled === true) return "MiniCPM stop artifact reported uninstall=true.";
    if (artifact.packageStatePreserved !== true) return "MiniCPM stop artifact did not prove provider package/runtime cache state was preserved.";
  }
  if (id === "active-subagent-stop-blocker") {
    if (artifact.ordinaryStopAllowed !== false) return "Sub-agent stop-blocker artifact did not prove ordinaryStopAllowed=false.";
    if (!(finiteNumber(artifact.activeLeaseCount) > 0)) return "Sub-agent stop-blocker artifact did not prove an active local runtime lease.";
    if (!Array.isArray(artifact.affectedSubagents) || artifact.affectedSubagents.length < 1) return "Sub-agent stop-blocker artifact did not list affected sub-agents.";
  }
  if (id === "untracked-runtime-safety") {
    if (artifact.trackingStatus !== "untracked") return "Untracked runtime artifact did not prove trackingStatus=untracked.";
    if (artifact.ordinaryStopAllowed !== false) return "Untracked runtime artifact did not prove ordinaryStopAllowed=false.";
    if (artifact.ordinaryRestartAllowed !== false) return "Untracked runtime artifact did not prove ordinaryRestartAllowed=false.";
    if (artifact.forceTerminationAllowed !== false) return "Untracked runtime artifact did not prove forceTerminationAllowed=false.";
    if (artifact.untracked !== true) return "Untracked runtime artifact did not preserve untracked=true.";
    if (!compactStringArray(artifact.untrackedRuntimeIds).includes(artifact.runtimeEntryId)) return "Untracked runtime artifact did not include the runtime in untrackedRuntimeIds.";
    const nextSafeActions = Array.isArray(artifact.nextSafeActions) ? artifact.nextSafeActions : [];
    const lifecycleToolNames = nextSafeActions
      .map((action) => typeof action?.toolName === "string" ? action.toolName : "")
      .filter((toolName) => lifecycleMutationTools.has(toolName));
    if (lifecycleToolNames.length > 0) return `Untracked runtime artifact exposed lifecycle mutation tools: ${lifecycleToolNames.join(", ")}.`;
    if (!nextSafeActions.some((action) => action?.action === "ask-user-to-stop-untracked" && action?.safety === "external")) {
      return "Untracked runtime artifact did not offer external ask-user-to-stop-untracked guidance.";
    }
    const repeatedValidation = validateRepeatedUntrackedObservations(artifact);
    if (repeatedValidation) return repeatedValidation;
  }
  if (id === "stale-lease-recovery") {
    if (artifact.ordinaryStopAllowed !== true) return "Stale lease recovery artifact did not prove ordinaryStopAllowed=true.";
    if (artifact.ordinaryRestartAllowed !== true) return "Stale lease recovery artifact did not prove ordinaryRestartAllowed=true.";
    if (artifact.forceRequiresSubagentCancellation !== false) return "Stale lease recovery artifact did not prove forced lifecycle does not require sub-agent cancellation.";
    if (artifact.activeLeaseCount !== 0) return "Stale lease recovery artifact did not prove activeLeaseCount=0.";
    if (artifact.activeOwnerCount !== 0) return "Stale lease recovery artifact did not prove activeOwnerCount=0.";
    if (!compactStringArray(artifact.staleLeaseIds).includes("lease-stale")) return "Stale lease recovery artifact did not include lease-stale in staleLeaseIds.";
    if (compactStringArray(artifact.blockerLeaseIds).length > 0) return "Stale lease recovery artifact still reports blockerLeaseIds.";
    if (Array.isArray(artifact.affectedSubagents) && artifact.affectedSubagents.length > 0) return "Stale lease recovery artifact still reports affected sub-agents.";
    const nextSafeActions = Array.isArray(artifact.nextSafeActions) ? artifact.nextSafeActions : [];
    if (!nextSafeActions.some((action) => action?.action === "stop-runtime" && action?.toolName === "ambient_local_model_runtime_stop")) {
      return "Stale lease recovery artifact did not offer an ordinary Stop preview action.";
    }
    if (!nextSafeActions.some((action) => action?.action === "restart-runtime" && action?.toolName === "ambient_local_model_runtime_restart")) {
      return "Stale lease recovery artifact did not offer an ordinary Restart preview action.";
    }
    if (nextSafeActions.some((action) => action?.action === "force-stop-runtime" || action?.action === "force-restart-runtime")) {
      return "Stale lease recovery artifact still offered forced ownership resolution actions.";
    }
  }
  if (id === "stopped-provider-display") {
    if (artifact.minicpmDisplayedStopped !== true) return "Stopped-provider display artifact did not prove MiniCPM displayed as stopped.";
    if (artifact.voiceDisplayedStopped !== true) return "Stopped-provider display artifact did not prove local voice provider displayed as stopped.";
  }
  if (id === "provider-declared-lifecycle") {
    const actions = new Set(Array.isArray(artifact.actions) ? artifact.actions : []);
    for (const action of ["start", "stop", "restart"]) {
      if (!actions.has(action)) return `Provider-declared lifecycle artifact did not prove ${action}.`;
    }
    if (artifact.usedGenericLifecycle === true) return "Provider-declared lifecycle artifact reported generic lifecycle use.";
  }
  return undefined;
}

function validateRepeatedUntrackedObservations(artifact) {
  const observations = Array.isArray(artifact.repeatedObservations) ? artifact.repeatedObservations : [];
  if (!Number.isInteger(artifact.repeatedObservationCount) || artifact.repeatedObservationCount < 2) {
    return "Untracked runtime artifact did not prove repeatedObservationCount>=2.";
  }
  if (observations.length !== artifact.repeatedObservationCount) {
    return "Untracked runtime artifact repeatedObservations length does not match repeatedObservationCount.";
  }
  const seenKinds = new Set();
  for (const [index, observation] of observations.entries()) {
    const label = observation?.observationKind ?? `#${index}`;
    if (observation?.runtimeEntryId !== artifact.runtimeEntryId) {
      return `Untracked runtime repeated observation ${label} did not match runtimeEntryId.`;
    }
    if (observation?.trackingStatus !== "untracked") {
      return `Untracked runtime repeated observation ${label} did not preserve trackingStatus=untracked.`;
    }
    if (observation?.ordinaryStopAllowed !== false) {
      return `Untracked runtime repeated observation ${label} did not keep ordinaryStopAllowed=false.`;
    }
    if (observation?.ordinaryRestartAllowed !== false) {
      return `Untracked runtime repeated observation ${label} did not keep ordinaryRestartAllowed=false.`;
    }
    if (observation?.forceTerminationAllowed !== false) {
      return `Untracked runtime repeated observation ${label} did not keep forceTerminationAllowed=false.`;
    }
    if (observation?.untracked !== true) {
      return `Untracked runtime repeated observation ${label} did not preserve untracked=true.`;
    }
    if (observation?.nextSafeAction !== "ask-user-to-stop-untracked" || observation?.nextSafeActionSafety !== "external") {
      return `Untracked runtime repeated observation ${label} did not keep external ask-user guidance.`;
    }
    if (typeof observation?.observationKind === "string" && observation.observationKind.length > 0) {
      seenKinds.add(observation.observationKind);
    }
  }
  if (seenKinds.size < 2) return "Untracked runtime artifact did not prove at least two distinct repeated observation kinds.";
  return undefined;
}

function missingScenarioCheck(id, issue) {
  return advisory(`scenario:${id}`, "Scenario live proof artifact exists.", issue);
}

function failedOrAdvisory(input, id, expectation, issue) {
  return input.requireLiveProof
    ? failed(id, expectation, issue)
    : advisory(id, expectation, issue);
}

function passed(id, expectation, evidence) {
  return { id, status: "passed", expectation, evidence };
}

function advisory(id, expectation, issue) {
  return { id, status: "advisory", expectation, issue };
}

function failed(id, expectation, issue) {
  return { id, status: "failed", expectation, issue };
}

function compactStringArray(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
