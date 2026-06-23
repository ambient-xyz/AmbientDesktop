import { resolveAmbientFeatureFlags, type AmbientFeatureFlagSettings } from "../../shared/featureFlags";
import type { SubagentMaturityEvidence, SubagentMaturitySnapshot } from "../../shared/subagentMaturity";
import type { ThreadSummary } from "../../shared/threadTypes";
import type {
  SubagentPromptSnapshotSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentSpawnEdgeSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import {
  analyzeSubagentRestartState,
  evaluateSubagentMaturity,
  type SubagentMaturityInput,
  type SubagentObservabilitySummary,
} from "./projectStoreSubagentsFacade";
import {
  latestSubagentMaturityEvidence,
  passedSubagentMaturityEvidenceCount,
  subagentApprovalRoutingVisibilityFromEvidence,
  subagentBugEvidenceFromAudit,
  subagentCompletionGuardVisibilityFromEvidence,
  subagentEventAttributionIntegrityFromEvidence,
  subagentLifecycleControlIntegrityFromEvidence,
  subagentMaturityEvidencePassed,
  subagentProductionUiVisibilityFromEvidence,
  subagentRetentionPolicyIntegrityFromEvidence,
  subagentSecurityReviewFromEvidence,
  subagentToolScopeIntegrityFromEvidence,
} from "./projectStoreSubagentMappers";
import {
  subagentDesktopDogfoodHistoryFromMaturityEvidence,
  subagentReleaseGateLiveHistoryFromMaturityEvidence,
  subagentWorkflowJitterReleaseProfileFromEvidence,
} from "./projectStoreSubagentMaturityHistory";

export interface ProjectStoreSubagentMaturitySnapshotRepositoryDeps {
  getFeatureFlagSettings(): AmbientFeatureFlagSettings;
  getSubagentObservabilitySummary(input: { parentRunId?: string; createdAt?: string }): SubagentObservabilitySummary;
  listAllSubagentRuns(): SubagentRunSummary[];
  listSubagentMaturityEvidence(): SubagentMaturityEvidence[];
  listSubagentPromptSnapshots(runId: string): SubagentPromptSnapshotSummary[];
  listSubagentRunEvents(runId: string): SubagentRunEventSummary[];
  listSubagentSpawnEdges(): SubagentSpawnEdgeSummary[];
  listSubagentToolScopeSnapshots(runId: string): SubagentToolScopeSnapshotSummary[];
  listSubagentWaitBarriers(): SubagentWaitBarrierSummary[];
  listThreadsForSubagentStateInspection(): ThreadSummary[];
}

export class ProjectStoreSubagentMaturitySnapshotRepository {
  constructor(private readonly deps: ProjectStoreSubagentMaturitySnapshotRepositoryDeps) {}

  getSubagentMaturitySnapshot(
    input: Omit<SubagentMaturityInput, "observability" | "restartReconciliation"> = {},
  ): SubagentMaturitySnapshot {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const evidence = this.deps.listSubagentMaturityEvidence();
    const latestLiveSmoke = latestSubagentMaturityEvidence(evidence, "live_pi_smoke");
    const latestRestartRecovery = latestSubagentMaturityEvidence(evidence, "restart_recovery");
    const latestCompletionGuardVisibility = latestSubagentMaturityEvidence(evidence, "completion_guard_visibility");
    const latestApprovalRoutingVisibility = latestSubagentMaturityEvidence(evidence, "approval_routing_visibility");
    const latestProductionUiVisibility = latestSubagentMaturityEvidence(evidence, "production_ui_visibility");
    const latestEventAttributionIntegrity = latestSubagentMaturityEvidence(evidence, "event_attribution_integrity");
    const latestLifecycleControlIntegrity = latestSubagentMaturityEvidence(evidence, "lifecycle_control_integrity");
    const latestRetentionPolicyIntegrity = latestSubagentMaturityEvidence(evidence, "retention_policy_integrity");
    const latestToolScopeIntegrity = latestSubagentMaturityEvidence(evidence, "tool_scope_integrity");
    const latestLifecycleBugAudit = latestSubagentMaturityEvidence(evidence, "lifecycle_bug_audit");
    const latestPermissionBugAudit = latestSubagentMaturityEvidence(evidence, "permission_bug_audit");
    const latestSecurityReview = latestSubagentMaturityEvidence(evidence, "security_review");
    const latestWorkflowJitterReleaseProfile = latestSubagentMaturityEvidence(evidence, "workflow_jitter_release_profile");
    const liveReleaseGateHistory = input.liveReleaseGateHistory ?? subagentReleaseGateLiveHistoryFromMaturityEvidence(evidence);
    const desktopDogfoodHistory = input.desktopDogfoodHistory ?? subagentDesktopDogfoodHistoryFromMaturityEvidence(evidence);
    const subagentRuns = this.deps.listAllSubagentRuns();
    const subagentRunEvents = subagentRuns.flatMap((run) => this.deps.listSubagentRunEvents(run.id));
    return evaluateSubagentMaturity({
      ...input,
      createdAt,
      featureFlags:
        input.featureFlags ??
        resolveAmbientFeatureFlags({
          settings: this.deps.getFeatureFlagSettings(),
          generatedAt: createdAt,
        }),
      liveReleaseGateHistory,
      desktopDogfoodHistory,
      workflowJitterReleaseProfile:
        input.workflowJitterReleaseProfile ?? subagentWorkflowJitterReleaseProfileFromEvidence(latestWorkflowJitterReleaseProfile),
      liveDogfoodRunCount:
        input.liveDogfoodRunCount ??
        (liveReleaseGateHistory ? undefined : passedSubagentMaturityEvidenceCount(evidence, "live_dogfood_run")),
      desktopDogfoodRunCount:
        input.desktopDogfoodRunCount ??
        (desktopDogfoodHistory ? undefined : passedSubagentMaturityEvidenceCount(evidence, "desktop_dogfood_run")),
      livePiSmokePassed: input.livePiSmokePassed ?? subagentMaturityEvidencePassed(latestLiveSmoke),
      restartRecoveryValidated: input.restartRecoveryValidated ?? subagentMaturityEvidencePassed(latestRestartRecovery),
      completionGuardVisibilityValidated:
        input.completionGuardVisibilityValidated ?? subagentMaturityEvidencePassed(latestCompletionGuardVisibility),
      completionGuardVisibility:
        input.completionGuardVisibility ?? subagentCompletionGuardVisibilityFromEvidence(latestCompletionGuardVisibility),
      approvalRoutingVisibilityValidated:
        input.approvalRoutingVisibilityValidated ?? subagentMaturityEvidencePassed(latestApprovalRoutingVisibility),
      approvalRoutingVisibility:
        input.approvalRoutingVisibility ?? subagentApprovalRoutingVisibilityFromEvidence(latestApprovalRoutingVisibility),
      productionUiVisibilityValidated:
        input.productionUiVisibilityValidated ?? subagentMaturityEvidencePassed(latestProductionUiVisibility),
      productionUiVisibility: input.productionUiVisibility ?? subagentProductionUiVisibilityFromEvidence(latestProductionUiVisibility),
      eventAttributionIntegrityValidated:
        input.eventAttributionIntegrityValidated ?? subagentMaturityEvidencePassed(latestEventAttributionIntegrity),
      eventAttributionIntegrity:
        input.eventAttributionIntegrity ?? subagentEventAttributionIntegrityFromEvidence(latestEventAttributionIntegrity),
      lifecycleControlIntegrityValidated:
        input.lifecycleControlIntegrityValidated ?? subagentMaturityEvidencePassed(latestLifecycleControlIntegrity),
      lifecycleControlIntegrity:
        input.lifecycleControlIntegrity ?? subagentLifecycleControlIntegrityFromEvidence(latestLifecycleControlIntegrity),
      retentionPolicyIntegrityValidated:
        input.retentionPolicyIntegrityValidated ?? subagentMaturityEvidencePassed(latestRetentionPolicyIntegrity),
      retentionPolicyIntegrity:
        input.retentionPolicyIntegrity ?? subagentRetentionPolicyIntegrityFromEvidence(latestRetentionPolicyIntegrity),
      toolScopeIntegrityValidated: input.toolScopeIntegrityValidated ?? subagentMaturityEvidencePassed(latestToolScopeIntegrity),
      toolScopeIntegrity: input.toolScopeIntegrity ?? subagentToolScopeIntegrityFromEvidence(latestToolScopeIntegrity),
      lifecycleBugs: input.lifecycleBugs ?? subagentBugEvidenceFromAudit(latestLifecycleBugAudit),
      permissionBugs: input.permissionBugs ?? subagentBugEvidenceFromAudit(latestPermissionBugAudit),
      securityReview: input.securityReview ?? subagentSecurityReviewFromEvidence(latestSecurityReview),
      observability: this.deps.getSubagentObservabilitySummary({ createdAt }),
      restartReconciliation: analyzeSubagentRestartState({
        threads: this.deps.listThreadsForSubagentStateInspection(),
        runs: subagentRuns,
        runEvents: subagentRunEvents,
        spawnEdges: this.deps.listSubagentSpawnEdges(),
        promptSnapshots: subagentRuns.flatMap((run) => this.deps.listSubagentPromptSnapshots(run.id)),
        toolScopeSnapshots: subagentRuns.flatMap((run) => this.deps.listSubagentToolScopeSnapshots(run.id)),
        waitBarriers: this.deps.listSubagentWaitBarriers(),
        createdAt,
      }),
    });
  }
}
