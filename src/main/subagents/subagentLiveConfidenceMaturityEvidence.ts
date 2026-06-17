import type {
  SubagentMaturityEvidence,
  SubagentMaturityEvidenceKind,
  SubagentMaturityEvidenceStatus,
} from "../../shared/subagentMaturity";
import {
  validateSubagentLiveConfidenceEvidence,
  type SubagentLiveConfidenceEvidence,
  type SubagentLiveConfidenceMaturityAssertion,
} from "./subagentLiveConfidenceEvidence";

export const SUBAGENT_LIVE_CONFIDENCE_MATURITY_EVIDENCE_SCHEMA_VERSION = "ambient-subagent-live-confidence-maturity-evidence-v1" as const;

export type SubagentLiveConfidenceMaturityEvidenceKind = Extract<
  SubagentMaturityEvidenceKind,
  "restart_recovery" | "lifecycle_control_integrity" | "production_ui_visibility"
>;

export interface SubagentLiveConfidenceMaturityEvidenceStore {
  recordSubagentMaturityEvidence(input: {
    kind: SubagentLiveConfidenceMaturityEvidenceKind;
    status: SubagentMaturityEvidenceStatus;
    evidenceKey?: string;
    artifactPath?: string;
    reviewer?: string;
    notes?: string;
    details?: Record<string, unknown>;
    createdAt?: string;
  }): SubagentMaturityEvidence;
}

export interface RecordSubagentLiveConfidenceMaturityEvidenceInput {
  evidence: SubagentLiveConfidenceEvidence;
  artifactPath?: string;
  evidenceKeyPrefix?: string;
  reviewer?: string;
  notes?: string;
  createdAt?: string;
}

export interface SubagentLiveConfidenceMaturityEvidenceRecord {
  schemaVersion: typeof SUBAGENT_LIVE_CONFIDENCE_MATURITY_EVIDENCE_SCHEMA_VERSION;
  createdAt: string;
  status: "recorded" | "failed" | "not_applicable";
  targetKinds: SubagentLiveConfidenceMaturityEvidenceKind[];
  issues: string[];
  maturityEvidence: SubagentMaturityEvidence[];
}

interface LiveConfidenceMaturityTarget {
  kind: SubagentLiveConfidenceMaturityEvidenceKind;
  label: string;
  requiredAssertionIds: string[];
  details: Record<string, unknown>;
}

export function recordSubagentLiveConfidenceMaturityEvidence(
  store: SubagentLiveConfidenceMaturityEvidenceStore,
  input: RecordSubagentLiveConfidenceMaturityEvidenceInput,
): SubagentLiveConfidenceMaturityEvidenceRecord {
  const evidence = input.evidence;
  const validation = validateSubagentLiveConfidenceEvidence(evidence);
  const createdAt = input.createdAt ?? evidence.completedAt ?? new Date().toISOString();
  const artifactPath = optionalString(input.artifactPath) ?? firstArtifactPath(evidence);
  const reviewer = optionalString(input.reviewer) ?? "live-confidence-runner";
  const assertionMap = maturityAssertionMap(evidence.maturityAssertions ?? []);
  const targets = liveConfidenceMaturityTargets(evidence, assertionMap);
  if (targets.length === 0) {
    return {
      schemaVersion: SUBAGENT_LIVE_CONFIDENCE_MATURITY_EVIDENCE_SCHEMA_VERSION,
      createdAt,
      status: "not_applicable",
      targetKinds: [],
      issues: [`Live confidence slice kind ${evidence.sliceKind} does not map directly to a maturity gate.`],
      maturityEvidence: [],
    };
  }

  const issues = [
    ...validation.issues,
    ...(validation.acceptance === "release_usable" ? [] : [`Live confidence evidence acceptance is ${validation.acceptance}; expected release_usable.`]),
  ];
  const status: SubagentMaturityEvidenceStatus = validation.acceptance === "release_usable" ? "passed" : "failed";
  const maturityEvidence = targets.map((target) => store.recordSubagentMaturityEvidence({
    kind: target.kind,
    status,
    evidenceKey: `${optionalString(input.evidenceKeyPrefix) ?? "live-confidence"}:${target.kind}:${evidence.sliceId}`,
    artifactPath,
    reviewer,
    notes: optionalString(input.notes) ?? defaultNotes(evidence, target, status, issues),
    details: {
      ...target.details,
      schemaVersion: SUBAGENT_LIVE_CONFIDENCE_MATURITY_EVIDENCE_SCHEMA_VERSION,
      evidenceType: target.kind,
      sourceEvidenceType: "live_confidence",
      liveConfidenceSliceId: evidence.sliceId,
      liveConfidenceSliceKind: evidence.sliceKind,
      liveConfidenceStatus: evidence.status,
      confidenceDelta: evidence.confidenceDelta,
      closeoutAnswer: evidence.closeoutAnswer,
      provider: evidence.provider,
      featureFlagSnapshot: evidence.featureFlagSnapshot,
      capabilitiesObserved: evidence.capabilitiesObserved,
      maturityAssertionIds: [...assertionMap.keys()].sort(),
      passedMaturityAssertionIds: assertionIdsByStatus(assertionMap, "passed"),
      failedMaturityAssertionIds: assertionIdsByStatus(assertionMap, "failed"),
      blockedMaturityAssertionIds: assertionIdsByStatus(assertionMap, "blocked"),
      skippedMaturityAssertionIds: assertionIdsByStatus(assertionMap, "skipped"),
      requiredAssertionIds: target.requiredAssertionIds,
      missingRequiredAssertionIds: missingAssertionIds(assertionMap, target.requiredAssertionIds),
      validation,
      liveConfidenceEvidence: evidence,
    },
    createdAt,
  }));

  return {
    schemaVersion: SUBAGENT_LIVE_CONFIDENCE_MATURITY_EVIDENCE_SCHEMA_VERSION,
    createdAt,
    status: status === "passed" ? "recorded" : "failed",
    targetKinds: targets.map((target) => target.kind),
    issues,
    maturityEvidence,
  };
}

function liveConfidenceMaturityTargets(
  evidence: SubagentLiveConfidenceEvidence,
  assertions: Map<string, SubagentLiveConfidenceMaturityAssertion>,
): LiveConfidenceMaturityTarget[] {
  if (evidence.sliceKind === "restart_repair") {
    const requiredAssertionIds = [
      "restart_repair_runtime_event_replay",
      "restart_repair_child_tree_repair",
      "restart_repair_mailbox_rehydration",
      "restart_repair_artifact_pointer_rehydration",
      "restart_repair_lifecycle_edge_coverage",
      "restart_repair_synthesis_safety",
    ];
    return [{
      kind: "restart_recovery",
      label: "restart recovery",
      requiredAssertionIds,
      details: {
        runtimeEventReplay: assertionPassed(assertions, "restart_repair_runtime_event_replay"),
        childTreeRepair: assertionPassed(assertions, "restart_repair_child_tree_repair"),
        mailboxRehydration: assertionPassed(assertions, "restart_repair_mailbox_rehydration"),
        artifactPointerRehydration: assertionPassed(assertions, "restart_repair_artifact_pointer_rehydration"),
        lifecycleEdgeCoverage: assertionPassed(assertions, "restart_repair_lifecycle_edge_coverage"),
        synthesisSafety: assertionPassed(assertions, "restart_repair_synthesis_safety"),
      },
    }];
  }

  if (evidence.sliceKind === "lifecycle_edges") {
    const requiredAssertionIds = [
      "lifecycle_edge_restart",
      "lifecycle_edge_stop",
      "lifecycle_edge_detach",
      "lifecycle_edge_cancel",
      "lifecycle_edge_retry",
      "lifecycle_edge_timeout",
      "lifecycle_edge_partial_result",
      "lifecycle_edge_synthesis_safety",
    ];
    return [{
      kind: "lifecycle_control_integrity",
      label: "lifecycle control integrity",
      requiredAssertionIds,
      details: {
        parentStopCascade: assertionPassed(assertions, "lifecycle_edge_stop"),
        childCancelIsolation: assertionPassed(assertions, "lifecycle_edge_cancel"),
        closeCapacityRetention: assertionPassed(assertions, "lifecycle_edge_partial_result"),
        lifecycleHookArtifacts: requiredAssertionIds.every((id) => assertionPassed(assertions, id)),
        restartInterruptionRepair: assertionPassed(assertions, "lifecycle_edge_restart"),
        childRetryRecovery: assertionPassed(assertions, "lifecycle_edge_retry"),
      },
    }];
  }

  if (evidence.sliceKind === "desktop_dogfood") {
    const requiredAssertionIds = [
      "desktop_dogfood_scenario_coverage",
      "desktop_dogfood_visual_layout",
      "desktop_dogfood_lifecycle_edges",
      "desktop_dogfood_runtime_and_operator_controls",
    ];
    return [{
      kind: "production_ui_visibility",
      label: "production UI visibility",
      requiredAssertionIds,
      details: {
        collapsedParentClusters: assertionPassed(assertions, "desktop_dogfood_scenario_coverage"),
        blockingChildIndicators: assertionPassed(assertions, "desktop_dogfood_lifecycle_edges"),
        childInspectorRows: assertionPassed(assertions, "desktop_dogfood_scenario_coverage"),
        repairReplayPanels: assertionPassed(assertions, "desktop_dogfood_lifecycle_edges"),
        localRuntimeOwnershipControls: assertionPassed(assertions, "desktop_dogfood_runtime_and_operator_controls"),
      },
    }];
  }

  return [];
}

function defaultNotes(
  evidence: SubagentLiveConfidenceEvidence,
  target: LiveConfidenceMaturityTarget,
  status: SubagentMaturityEvidenceStatus,
  issues: string[],
): string {
  if (status === "passed") {
    return `Live confidence ${evidence.sliceKind} evidence passed and records ${target.label} maturity proof.`;
  }
  return `Live confidence ${evidence.sliceKind} evidence is not release-usable for ${target.label}: ${formatIssueList(issues)}.`;
}

function maturityAssertionMap(assertions: readonly SubagentLiveConfidenceMaturityAssertion[]): Map<string, SubagentLiveConfidenceMaturityAssertion> {
  return new Map(assertions.map((assertion) => [assertion.id, assertion]));
}

function assertionPassed(assertions: Map<string, SubagentLiveConfidenceMaturityAssertion>, id: string): boolean {
  return assertions.get(id)?.status === "passed";
}

function assertionIdsByStatus(
  assertions: Map<string, SubagentLiveConfidenceMaturityAssertion>,
  status: SubagentLiveConfidenceMaturityAssertion["status"],
): string[] {
  return [...assertions.values()]
    .filter((assertion) => assertion.status === status)
    .map((assertion) => assertion.id)
    .sort();
}

function missingAssertionIds(
  assertions: Map<string, SubagentLiveConfidenceMaturityAssertion>,
  requiredIds: readonly string[],
): string[] {
  return requiredIds.filter((id) => !assertions.has(id));
}

function firstArtifactPath(evidence: SubagentLiveConfidenceEvidence): string | undefined {
  return evidence.artifacts.find((artifact) => optionalString(artifact.path))?.path;
}

function optionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function formatIssueList(issues: readonly string[]): string {
  if (issues.length === 0) return "no issues";
  const inlineIssues = issues.map((issue) => issue.replace(/[.;]+$/u, ""));
  if (inlineIssues.length === 1) return inlineIssues[0] ?? "unknown issue";
  return `${inlineIssues.slice(0, -1).join("; ")}; and ${inlineIssues[inlineIssues.length - 1]}`;
}
