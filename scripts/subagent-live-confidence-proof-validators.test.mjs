import { describe, expect, it } from "vitest";
import {
  sanitizeEvidenceText,
  validateApprovalAuthorityArtifact,
  validateBrowserApprovalAuthorityArtifact,
  validateCallableWorkflowDogfoodConfidenceArtifact,
  validateCallableWorkflowRehydrationConfidenceArtifact,
  validateChildAuthorityConfidenceArtifacts,
  validateDesktopDogfoodConfidenceArtifact,
  validateLocalRuntimeControlProofArtifact,
  validateLiveSmokeArtifact,
  validateLongContextAuthorityArtifact,
  validateSubagentLifecycleEdgeArtifact,
  validateSubagentRestartRepairArtifact,
  validateSubagentRestartRepairConfidenceArtifacts,
  validateWorkflowDogfoodArtifact,
  validateWorkflowSymphonyConfidenceArtifacts,
  validateWorkflowUiDogfoodMatrixArtifact,
} from "./subagent-live-confidence-lib.mjs";
import {
  approvalAuthorityArtifact,
  browserApprovalArtifact,
  callableWorkflowDogfoodArtifact,
  callableWorkflowRehydrationArtifact,
  desktopDogfoodArtifact,
  lifecycleEdgeArtifact,
  liveSmokeArtifact,
  liveWorkflowArtifact,
  localRuntimeControlProofArtifact,
  localRuntimeControlProofGateArtifact,
  longContextAuthorityArtifact,
  restartRepairDiagnosticsArtifact,
  restartRepairReplayEvidence,
  workflowUiBroaderDogfoodMatrixArtifact,
  workflowUiDogfoodMatrixArtifact,
} from "./subagent-live-confidence-test-fixtures.mjs";

describe("sub-agent live confidence proof validators", () => {
  it("validates required live smoke proof and redacts secret-like text", () => {
    expect(validateLiveSmokeArtifact(liveSmokeArtifact())).toEqual({ valid: true, issues: [] });
    expect(validateLiveSmokeArtifact({ ...liveSmokeArtifact(), assistantText: "missing" }).issues).toContain(
      "Live smoke artifact is missing the parent completion sentinel.",
    );
    expect(validateLongContextAuthorityArtifact(longContextAuthorityArtifact())).toEqual({ valid: true, issues: [] });
    expect(
      validateLongContextAuthorityArtifact({
        ...longContextAuthorityArtifact(),
        deniedContentLeaked: true,
      }).issues,
    ).toContain("denied sibling content leaked into the child transcript.");
    expect(validateApprovalAuthorityArtifact(approvalAuthorityArtifact())).toEqual({ valid: true, issues: [] });
    expect(
      validateApprovalAuthorityArtifact({
        ...approvalAuthorityArtifact(),
        waitDetails: { ...approvalAuthorityArtifact().waitDetails, synthesisAllowed: true },
      }).issues,
    ).toContain("wait_agent did not leave the parent blocked on a non-synthesizable child approval request.");
    expect(validateBrowserApprovalAuthorityArtifact(browserApprovalArtifact())).toEqual({ valid: true, issues: [] });
    expect(
      validateBrowserApprovalAuthorityArtifact({
        ...browserApprovalArtifact(),
        permissionResponses: [],
      }).issues,
    ).toContain("artifact is missing child-thread scoped browser approval response.");
    expect(
      validateChildAuthorityConfidenceArtifacts({
        longContextArtifact: longContextAuthorityArtifact(),
        approvalAuthorityArtifact: approvalAuthorityArtifact(),
        browserApprovalArtifact: browserApprovalArtifact(),
      }),
    ).toMatchObject({ valid: true, issues: [] });
    expect(validateWorkflowDogfoodArtifact(liveWorkflowArtifact())).toEqual({ valid: true, issues: [] });
    expect(validateWorkflowDogfoodArtifact({ ...liveWorkflowArtifact(), checkpoint: undefined }).issues).toContain(
      "Live workflow dogfood artifact is missing checkpoint output.",
    );
    expect(validateCallableWorkflowDogfoodConfidenceArtifact(callableWorkflowDogfoodArtifact())).toEqual({ valid: true, issues: [] });
    expect(
      validateCallableWorkflowDogfoodConfidenceArtifact({
        ...callableWorkflowDogfoodArtifact(),
        mutationOutput: {
          ...callableWorkflowDogfoodArtifact().mutationOutput,
          parentWorkspaceUnchanged: false,
        },
      }).issues,
    ).toContain("Callable workflow dogfood mutation output must prove parentWorkspaceUnchanged.");
    expect(
      validateCallableWorkflowDogfoodConfidenceArtifact({
        ...callableWorkflowDogfoodArtifact(),
        launchCard: {
          ...callableWorkflowDogfoodArtifact().launchCard,
          defaultCollapsed: false,
        },
      }).issues,
    ).toContain("Callable workflow dogfood launch card must be default collapsed.");
    expect(
      validateCallableWorkflowDogfoodConfidenceArtifact({
        ...callableWorkflowDogfoodArtifact(),
        maturityAssertions: {
          ...callableWorkflowDogfoodArtifact().maturityAssertions,
          workflow_launch_card_bounds: {
            ...callableWorkflowDogfoodArtifact().maturityAssertions.workflow_launch_card_bounds,
            status: "failed",
          },
        },
      }).issues,
    ).toContain("Callable workflow dogfood maturity assertion workflow_launch_card_bounds status is failed; expected passed.");
    const { workflow_denied_child_scope: _dogfoodDeniedScope, ...dogfoodMissingMaturity } =
      callableWorkflowDogfoodArtifact().maturityAssertions;
    expect(
      validateCallableWorkflowDogfoodConfidenceArtifact({
        ...callableWorkflowDogfoodArtifact(),
        maturityAssertions: dogfoodMissingMaturity,
      }).issues,
    ).toContain("Callable workflow dogfood maturity assertion workflow_denied_child_scope is missing.");
    void _dogfoodDeniedScope;
    expect(validateCallableWorkflowRehydrationConfidenceArtifact(callableWorkflowRehydrationArtifact())).toEqual({
      valid: true,
      issues: [],
    });
    expect(
      validateCallableWorkflowRehydrationConfidenceArtifact({
        ...callableWorkflowRehydrationArtifact(),
        rehydration: {
          ...callableWorkflowRehydrationArtifact().rehydration,
          usageHydrated: false,
        },
      }).issues,
    ).toContain("Callable workflow rehydration proof is missing usageHydrated.");
    expect(
      validateCallableWorkflowRehydrationConfidenceArtifact({
        ...callableWorkflowRehydrationArtifact(),
        maturityAssertions: {
          ...callableWorkflowRehydrationArtifact().maturityAssertions,
          workflow_rehydrated_progress_usage: {
            ...callableWorkflowRehydrationArtifact().maturityAssertions.workflow_rehydrated_progress_usage,
            evidence: ["passed: progressEvents=4", "failed: tokens=0"],
          },
        },
      }).issues,
    ).toContain(
      "Callable workflow rehydration maturity assertion workflow_rehydrated_progress_usage must record only passed evidence entries.",
    );
    const { workflow_rehydrated_child_provenance: _rehydrationChildProvenance, ...rehydrationMissingMaturity } =
      callableWorkflowRehydrationArtifact().maturityAssertions;
    expect(
      validateCallableWorkflowRehydrationConfidenceArtifact({
        ...callableWorkflowRehydrationArtifact(),
        maturityAssertions: rehydrationMissingMaturity,
      }).issues,
    ).toContain("Callable workflow rehydration maturity assertion workflow_rehydrated_child_provenance is missing.");
    void _rehydrationChildProvenance;
    expect(
      validateWorkflowSymphonyConfidenceArtifacts({
        liveWorkflowArtifact: liveWorkflowArtifact(),
        workflowUiDogfoodArtifact: workflowUiDogfoodMatrixArtifact(),
        callableWorkflowDogfoodArtifact: callableWorkflowDogfoodArtifact(),
        callableWorkflowRehydrationArtifact: callableWorkflowRehydrationArtifact(),
      }),
    ).toMatchObject({ valid: true, issues: [] });
    expect(
      validateWorkflowSymphonyConfidenceArtifacts({
        liveWorkflowArtifact: liveWorkflowArtifact(),
        workflowUiDogfoodArtifact: workflowUiBroaderDogfoodMatrixArtifact(),
        callableWorkflowDogfoodArtifact: callableWorkflowDogfoodArtifact(),
        callableWorkflowRehydrationArtifact: callableWorkflowRehydrationArtifact(),
        workflowUiDogfoodProfile: "broader",
      }),
    ).toMatchObject({ valid: true, issues: [] });
    expect(validateWorkflowUiDogfoodMatrixArtifact(workflowUiDogfoodMatrixArtifact())).toEqual({ valid: true, issues: [] });
    expect(
      validateWorkflowUiDogfoodMatrixArtifact(workflowUiBroaderDogfoodMatrixArtifact(), {
        expectedSuite: "phase1-live",
        requiredScenarios: [
          "gmail-20-metadata-readonly-validation",
          "downloads-document-categorization",
          "public-source-browser",
          "current-web-recipe-report",
        ],
      }),
    ).toEqual({ valid: true, issues: [] });
    expect(
      validateWorkflowSymphonyConfidenceArtifacts({
        liveWorkflowArtifact: liveWorkflowArtifact(),
        workflowUiDogfoodArtifact: workflowUiDogfoodMatrixArtifact(),
        callableWorkflowDogfoodArtifact: callableWorkflowDogfoodArtifact(),
        callableWorkflowRehydrationArtifact: callableWorkflowRehydrationArtifact(),
        workflowUiDogfoodProfile: "broader",
      }).issues,
    ).toEqual(
      expect.arrayContaining([
        "Workflow Agent UI dogfood matrix suite is phase0-live; expected phase1-live.",
        "Workflow Agent UI dogfood matrix is missing scenario gmail-20-metadata-readonly-validation.",
        "Workflow Agent UI dogfood matrix is missing scenario current-web-recipe-report.",
        "Workflow Agent UI dogfood matrix has 2 result(s); expected at least 4.",
      ]),
    );
    expect(
      validateWorkflowSymphonyConfidenceArtifacts({
        liveWorkflowArtifact: liveWorkflowArtifact(),
        workflowUiDogfoodArtifact: {
          ...workflowUiBroaderDogfoodMatrixArtifact(),
          results: workflowUiBroaderDogfoodMatrixArtifact().results.map((entry) => {
            const { launch, ...result } = entry;
            void launch;
            return result;
          }),
        },
        callableWorkflowDogfoodArtifact: callableWorkflowDogfoodArtifact(),
        callableWorkflowRehydrationArtifact: callableWorkflowRehydrationArtifact(),
        workflowUiDogfoodProfile: "broader",
      }).issues,
    ).toEqual(
      expect.arrayContaining([
        "Workflow Agent UI dogfood scenario gmail-20-metadata-readonly-validation launch workspaceMode is missing; expected shared-snapshot-temp-copy.",
        "Workflow Agent UI dogfood scenario gmail-20-metadata-readonly-validation Google Workspace status is missing; expected configured.",
      ]),
    );
    expect(
      validateWorkflowUiDogfoodMatrixArtifact({
        ...workflowUiDogfoodMatrixArtifact(),
        results: [
          {
            ...workflowUiDogfoodMatrixArtifact().results[0],
            runEvidence: {
              ...workflowUiDogfoodMatrixArtifact().results[0].runEvidence,
              outputSignals: 0,
            },
          },
        ],
      }).issues,
    ).toEqual(
      expect.arrayContaining([
        "Workflow Agent UI dogfood matrix has 1 result(s); expected at least 2.",
        "Workflow Agent UI dogfood scenario vocabulary-quiz is missing output signal evidence.",
      ]),
    );
    expect(
      validateWorkflowSymphonyConfidenceArtifacts({
        liveWorkflowArtifact: liveWorkflowArtifact(),
        workflowUiDogfoodArtifact: undefined,
        callableWorkflowDogfoodArtifact: undefined,
        callableWorkflowRehydrationArtifact: undefined,
      }).issues,
    ).toEqual(
      expect.arrayContaining([
        "Workflow Agent UI dogfood matrix artifact is missing.",
        "Callable workflow dogfood artifact is missing.",
        "Callable workflow rehydration artifact is missing.",
      ]),
    );
    expect(validateDesktopDogfoodConfidenceArtifact(desktopDogfoodArtifact())).toEqual({ valid: true, issues: [] });
    expect(
      validateDesktopDogfoodConfidenceArtifact({
        ...desktopDogfoodArtifact(),
        checks: {
          ...desktopDogfoodArtifact().checks,
          narrow: {
            ...desktopDogfoodArtifact().checks.narrow,
            criticalOverlapCount: 1,
          },
        },
        visualAssertions: {
          ...desktopDogfoodArtifact().visualAssertions,
          layout_safety: {
            ...desktopDogfoodArtifact().visualAssertions.layout_safety,
            status: "failed",
          },
        },
      }).issues,
    ).toEqual(
      expect.arrayContaining([
        "Desktop dogfood narrow view reports 1 critical overlaps.",
        "Desktop dogfood visual assertion layout_safety status is failed; expected passed.",
      ]),
    );
    expect(
      validateDesktopDogfoodConfidenceArtifact({
        ...desktopDogfoodArtifact(),
        checks: {
          ...desktopDogfoodArtifact().checks,
          operatorBehavior: {
            ...desktopDogfoodArtifact().checks.operatorBehavior,
            typedBarrierConsequenceVisible: false,
          },
        },
      }).issues,
    ).toContain("Desktop dogfood operatorBehavior typedBarrierConsequenceVisible is not true.");
    expect(
      validateDesktopDogfoodConfidenceArtifact({
        ...desktopDogfoodArtifact(),
        checks: {
          ...desktopDogfoodArtifact().checks,
          approvalForwarding: {
            ...desktopDogfoodArtifact().checks.approvalForwarding,
            childThreadScopeVisible: false,
            forwardedAndRequestSameChild: false,
          },
        },
      }).issues,
    ).toEqual(
      expect.arrayContaining([
        "Desktop dogfood approvalForwarding childThreadScopeVisible is not true.",
        "Desktop dogfood approvalForwarding forwardedAndRequestSameChild is not true.",
      ]),
    );
    expect(validateLocalRuntimeControlProofArtifact(localRuntimeControlProofArtifact(), localRuntimeControlProofGateArtifact())).toEqual({
      valid: true,
      issues: [],
    });
    expect(
      validateLocalRuntimeControlProofArtifact(
        {
          ...localRuntimeControlProofArtifact(),
          scenarios: {
            ...localRuntimeControlProofArtifact().scenarios,
            "active-subagent-stop-blocker": {
              ...localRuntimeControlProofArtifact().scenarios["active-subagent-stop-blocker"],
              ordinaryStopAllowed: true,
              affectedSubagents: [],
            },
          },
        },
        localRuntimeControlProofGateArtifact(),
      ).issues,
    ).toEqual(
      expect.arrayContaining([
        "Sub-agent stop-blocker proof did not prove ordinaryStopAllowed=false.",
        "Sub-agent stop-blocker proof did not list affected sub-agents.",
      ]),
    );
    expect(
      validateLocalRuntimeControlProofArtifact(
        {
          ...localRuntimeControlProofArtifact(),
          scenarios: {
            ...localRuntimeControlProofArtifact().scenarios,
            "untracked-runtime-safety": {
              ...localRuntimeControlProofArtifact().scenarios["untracked-runtime-safety"],
              nextSafeActions: [
                {
                  action: "stop-runtime",
                  safety: "requires-approval",
                  toolName: "ambient_local_model_runtime_stop",
                },
              ],
            },
          },
        },
        localRuntimeControlProofGateArtifact(),
      ).issues,
    ).toContain("Untracked runtime proof exposed lifecycle mutation tools: ambient_local_model_runtime_stop.");
    expect(
      validateLocalRuntimeControlProofArtifact(
        {
          ...localRuntimeControlProofArtifact(),
          scenarios: {
            ...localRuntimeControlProofArtifact().scenarios,
            "untracked-runtime-safety": {
              ...localRuntimeControlProofArtifact().scenarios["untracked-runtime-safety"],
              repeatedObservations: [
                ...localRuntimeControlProofArtifact().scenarios["untracked-runtime-safety"].repeatedObservations.slice(0, 2),
                {
                  ...localRuntimeControlProofArtifact().scenarios["untracked-runtime-safety"].repeatedObservations[2],
                  ordinaryStopAllowed: true,
                },
              ],
            },
          },
        },
        localRuntimeControlProofGateArtifact(),
      ).issues,
    ).toContain("Untracked runtime repeated observation lifecycle_action_preview did not keep ordinaryStopAllowed=false.");
    expect(
      validateLocalRuntimeControlProofArtifact(
        {
          ...localRuntimeControlProofArtifact(),
          scenarios: {
            ...localRuntimeControlProofArtifact().scenarios,
            "stale-lease-recovery": {
              ...localRuntimeControlProofArtifact().scenarios["stale-lease-recovery"],
              ordinaryStopAllowed: false,
              activeLeaseCount: 1,
              blockerLeaseIds: ["lease-stale"],
              nextSafeActions: [
                {
                  action: "force-stop-runtime",
                  safety: "requires-approval",
                  toolName: "ambient_local_model_runtime_stop",
                },
              ],
            },
          },
        },
        localRuntimeControlProofGateArtifact(),
      ).issues,
    ).toEqual(
      expect.arrayContaining([
        "Stale lease recovery proof did not prove ordinaryStopAllowed=true.",
        "Stale lease recovery proof did not prove activeLeaseCount=0.",
        "Stale lease recovery proof still reports blockerLeaseIds.",
        "Stale lease recovery proof still offered forced ownership resolution actions.",
      ]),
    );
    expect(sanitizeEvidenceText("api_key=abcdef1234567890 and sk-test-secret-value")).toBe("api_key=<redacted> and sk-<redacted>");
  });

  it("validates restart repair replay diagnostics", () => {
    expect(validateSubagentRestartRepairArtifact(restartRepairDiagnosticsArtifact(), restartRepairReplayEvidence())).toEqual({
      valid: true,
      issues: [],
    });
    expect(
      validateSubagentRestartRepairConfidenceArtifacts(
        restartRepairDiagnosticsArtifact(),
        restartRepairReplayEvidence(),
        lifecycleEdgeArtifact(),
      ),
    ).toMatchObject({ valid: true, issues: [] });
    expect(
      validateSubagentRestartRepairConfidenceArtifacts(restartRepairDiagnosticsArtifact(), restartRepairReplayEvidence(), undefined).issues,
    ).toContain("Sub-agent lifecycle edge artifact is missing.");
    expect(
      validateSubagentRestartRepairArtifact(
        {
          ...restartRepairDiagnosticsArtifact(),
          replayEvidence: {
            ...restartRepairReplayEvidence(),
            restartRepair: {
              ...restartRepairReplayEvidence().restartRepair,
              observedIssueKinds: ["active_run_interrupted"],
              repairedRunIds: [],
            },
          },
        },
        restartRepairReplayEvidence(),
      ).issues,
    ).toEqual(
      expect.arrayContaining([
        "Sub-agent restart repair did not observe expected issue kinds: missing_lifecycle_stop, missing_spawn_edge, missing_result_artifact, dangling_spawn_edge, orphan_child_thread, dangling_wait_barrier_child",
        "Sub-agent restart repair repaired run ids are missing.",
      ]),
    );
    expect(
      validateSubagentRestartRepairArtifact(
        {
          ...restartRepairDiagnosticsArtifact(),
          replayEvidence: {
            ...restartRepairReplayEvidence(),
            rehydration: {
              ...restartRepairReplayEvidence().rehydration,
              resultArtifactPointers: [],
              artifactPointerIntegrity: {
                ...restartRepairReplayEvidence().rehydration.artifactPointerIntegrity,
                missingResultArtifactsDiagnosed: false,
              },
            },
          },
        },
        restartRepairReplayEvidence(),
      ).issues,
    ).toEqual(
      expect.arrayContaining([
        "Sub-agent restart repair rehydration resultArtifactPointers are missing.",
        "Sub-agent restart repair rehydration integrity missingResultArtifactsDiagnosed is not true.",
      ]),
    );
  });

  it("validates lifecycle edge proof artifacts", () => {
    expect(validateSubagentLifecycleEdgeArtifact(lifecycleEdgeArtifact())).toEqual({ valid: true, issues: [] });
    expect(
      validateSubagentLifecycleEdgeArtifact({
        ...lifecycleEdgeArtifact(),
        summary: {
          ...lifecycleEdgeArtifact().summary,
          coveredEdgeKinds: ["restart", "stop", "detach", "cancel", "retry", "partial_result"],
          missingEdgeKinds: ["timeout"],
          unsafeEdgeIds: ["edge-partial-result"],
        },
        edges: lifecycleEdgeArtifact().edges.filter((edge) => edge.kind !== "timeout"),
      }).issues,
    ).toEqual(
      expect.arrayContaining([
        "Sub-agent lifecycle edge proof is missing edge kinds: timeout.",
        "Sub-agent lifecycle edge proof summary reports missing edge kinds: timeout.",
        "Sub-agent lifecycle edge proof summary reports unsafe edges: edge-partial-result.",
      ]),
    );
    expect(
      validateSubagentLifecycleEdgeArtifact({
        ...lifecycleEdgeArtifact(),
        edges: lifecycleEdgeArtifact().edges.map((edge) =>
          edge.kind === "partial_result"
            ? {
                ...edge,
                partialResult: {
                  ...edge.partialResult,
                  failedChildNotSynthesized: false,
                },
              }
            : edge,
        ),
      }).issues,
    ).toContain("Sub-agent lifecycle partial-result edge edge-partial-result did not exclude failed child output.");
  });
});
