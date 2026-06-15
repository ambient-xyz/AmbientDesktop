import { describe, expect, it } from "vitest";
import {
  buildLocalRuntimeControlProofGateReport,
  localRuntimeControlProofGatePassed,
} from "./local-runtime-control-proof-gate-lib.mjs";

describe("local runtime control proof gate", () => {
  it("accepts blocked LDR preflight evidence while keeping missing lifecycle dogfood as advisories", () => {
    const report = buildLocalRuntimeControlProofGateReport({
      artifacts: {
        localDeepResearchLive: blockedLdrSummary(),
      },
    });

    expect(report.status).toBe("passed_with_advisories");
    expect(localRuntimeControlProofGatePassed(report)).toBe(true);
    expect(check(report, "scenario:ldr-status-before-setup")).toMatchObject({
      status: "passed",
    });
    expect(check(report, "scenario:minicpm-nondestructive-stop")).toMatchObject({
      status: "advisory",
    });
    expect(report.releaseDecision.advisoryIssues.join("\n")).toContain("Missing MiniCPM resident runtime stops without uninstalling provider state dogfood artifact.");
  });

  it("passes when every scenario artifact is present and shaped correctly", () => {
    const report = buildLocalRuntimeControlProofGateReport({
      requireLiveProof: true,
      artifacts: {
        localDeepResearchLive: passedLdrSummary(),
        localRuntimeControl: completeRuntimeControlArtifact(),
      },
    });

    expect(report.status).toBe("passed");
    expect(localRuntimeControlProofGatePassed(report, { requireLiveProof: true })).toBe(true);
    expect(report.releaseDecision.blockingIssues).toEqual([]);
    expect(report.releaseDecision.advisoryIssues).toEqual([]);
  });

  it("fails required live proof when active sub-agent stop-blocker evidence is malformed", () => {
    const artifact = completeRuntimeControlArtifact();
    artifact.scenarios["active-subagent-stop-blocker"] = {
      status: "passed",
      ordinaryStopAllowed: true,
      activeLeaseCount: 1,
      affectedSubagents: [{ subagentThreadId: "child" }],
    };
    const report = buildLocalRuntimeControlProofGateReport({
      requireLiveProof: true,
      artifacts: {
        localDeepResearchLive: passedLdrSummary(),
        localRuntimeControl: artifact,
      },
    });

    expect(report.status).toBe("attention");
    expect(localRuntimeControlProofGatePassed(report, { requireLiveProof: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Sub-agent stop-blocker artifact did not prove ordinaryStopAllowed=false.",
    ]));
  });

  it("fails required live proof when untracked runtime evidence offers lifecycle mutation", () => {
    const artifact = completeRuntimeControlArtifact();
    artifact.scenarios["untracked-runtime-safety"] = {
      ...artifact.scenarios["untracked-runtime-safety"],
      nextSafeActions: [
        {
          action: "stop-runtime",
          safety: "requires-approval",
          toolName: "ambient_local_model_runtime_stop",
        },
      ],
    };
    const report = buildLocalRuntimeControlProofGateReport({
      requireLiveProof: true,
      artifacts: {
        localDeepResearchLive: passedLdrSummary(),
        localRuntimeControl: artifact,
      },
    });

    expect(report.status).toBe("attention");
    expect(localRuntimeControlProofGatePassed(report, { requireLiveProof: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Untracked runtime artifact exposed lifecycle mutation tools: ambient_local_model_runtime_stop.",
    ]));
  });

  it("fails required live proof when repeated untracked observations drift into managed or stoppable state", () => {
    const artifact = completeRuntimeControlArtifact();
    artifact.scenarios["untracked-runtime-safety"] = {
      ...artifact.scenarios["untracked-runtime-safety"],
      repeatedObservations: [
        ...artifact.scenarios["untracked-runtime-safety"].repeatedObservations.slice(0, 1),
        {
          ...artifact.scenarios["untracked-runtime-safety"].repeatedObservations[1],
          trackingStatus: "managed",
        },
        ...artifact.scenarios["untracked-runtime-safety"].repeatedObservations.slice(2),
      ],
    };
    const report = buildLocalRuntimeControlProofGateReport({
      requireLiveProof: true,
      artifacts: {
        localDeepResearchLive: passedLdrSummary(),
        localRuntimeControl: artifact,
      },
    });

    expect(report.status).toBe("attention");
    expect(localRuntimeControlProofGatePassed(report, { requireLiveProof: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Untracked runtime repeated observation policy_handoff_recheck did not preserve trackingStatus=untracked.",
    );
  });

  it("fails required live proof when stale lease recovery still blocks ordinary lifecycle", () => {
    const artifact = completeRuntimeControlArtifact();
    artifact.scenarios["stale-lease-recovery"] = {
      ...artifact.scenarios["stale-lease-recovery"],
      ordinaryStopAllowed: false,
      activeLeaseCount: 1,
      blockerLeaseIds: ["lease-stale"],
      nextSafeActions: [{
        action: "force-stop-runtime",
        toolName: "ambient_local_model_runtime_stop",
      }],
    };
    const report = buildLocalRuntimeControlProofGateReport({
      requireLiveProof: true,
      artifacts: {
        localDeepResearchLive: passedLdrSummary(),
        localRuntimeControl: artifact,
      },
    });

    expect(report.status).toBe("attention");
    expect(localRuntimeControlProofGatePassed(report, { requireLiveProof: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Stale lease recovery artifact did not prove ordinaryStopAllowed=true.",
    ]));
  });
});

function check(report, id) {
  return report.checks.find((item) => item.id === id);
}

function blockedLdrSummary() {
  return {
    schemaVersion: "ambient-local-deep-research-live-smoke-v1",
    status: "blocked",
    blockerKind: "untracked-local-runtime",
    piBlockedPreflight: {
      rawToolNames: [
        "ambient_local_model_runtime_status",
        "ambient_local_deep_research_setup",
      ],
    },
  };
}

function passedLdrSummary() {
  return {
    schemaVersion: "ambient-local-deep-research-live-smoke-v1",
    status: "passed",
    completionStatus: "completed",
    runStatus: "completed",
    rawToolNames: [
      "ambient_local_model_runtime_status",
      "ambient_local_deep_research_setup",
      "ambient_local_deep_research_run",
    ],
  };
}

function completeRuntimeControlArtifact() {
  return {
    schemaVersion: "ambient-local-runtime-control-proof-v1",
    scenarios: {
      "minicpm-nondestructive-stop": {
        status: "passed",
        stopped: true,
        uninstalled: false,
        packageStatePreserved: true,
        evidence: "MiniCPM stopped and package state stayed installed.",
      },
      "active-subagent-stop-blocker": {
        status: "passed",
        ordinaryStopAllowed: false,
        activeLeaseCount: 1,
        affectedSubagents: [{ subagentThreadId: "child-thread", ownerDisplayName: "Review worker" }],
        evidence: "Ordinary Stop disabled while child-thread holds a runtime lease.",
      },
      "untracked-runtime-safety": {
        status: "passed",
        runtimeEntryId: "untracked-llama:4401",
        trackingStatus: "untracked",
        ordinaryStopAllowed: false,
        ordinaryRestartAllowed: false,
        forceTerminationAllowed: false,
        untracked: true,
        untrackedRuntimeIds: ["untracked-llama:4401"],
        repeatedObservationCount: 3,
        repeatedObservations: repeatedUntrackedObservations(),
        nextSafeActions: [
          {
            action: "ask-user-to-stop-untracked",
            safety: "external",
            runtimeEntryId: "untracked-llama:4401",
            untracked: true,
          },
        ],
        evidence: "Untracked runtime stays visible and only offers external stop guidance.",
      },
      "stale-lease-recovery": {
        status: "passed",
        proofKind: "deterministic-stale-lease-recovery",
        runtimeEntryId: "local-text:local-text-runtime:4301",
        capability: "local-text",
        trackingStatus: "managed",
        running: true,
        ordinaryStopAllowed: true,
        ordinaryRestartAllowed: true,
        forceRequiresSubagentCancellation: false,
        activeLeaseCount: 0,
        activeOwnerCount: 0,
        staleLeaseIds: ["lease-stale"],
        blockerLeaseIds: [],
        affectedSubagents: [],
        nextSafeActions: [
          {
            action: "stop-runtime",
            safety: "requires-approval",
            runtimeEntryId: "local-text:local-text-runtime:4301",
            toolName: "ambient_local_model_runtime_stop",
          },
          {
            action: "restart-runtime",
            safety: "requires-approval",
            runtimeEntryId: "local-text:local-text-runtime:4301",
            toolName: "ambient_local_model_runtime_restart",
          },
        ],
        evidence: "Stale lease remains visible but no longer blocks ordinary Stop/Restart.",
      },
      "stopped-provider-display": {
        status: "passed",
        minicpmDisplayedStopped: true,
        voiceDisplayedStopped: true,
        evidence: "Local Models shows both providers as stopped.",
      },
      "provider-declared-lifecycle": {
        status: "passed",
        actions: ["start", "stop", "restart"],
        usedGenericLifecycle: false,
        evidence: "Provider-declared lifecycle commands handled all actions.",
      },
    },
  };
}

function repeatedUntrackedObservations() {
  return ["initial_inventory", "policy_handoff_recheck", "lifecycle_action_preview"].map((observationKind) => ({
    observationKind,
    runtimeEntryId: "untracked-llama:4401",
    trackingStatus: "untracked",
    ordinaryStopAllowed: false,
    ordinaryRestartAllowed: false,
    forceTerminationAllowed: false,
    untracked: true,
    nextSafeAction: "ask-user-to-stop-untracked",
    nextSafeActionSafety: "external",
  }));
}
