import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { SUBAGENT_LIVE_EVIDENCE_LABELS } from "../../shared/subagentLiveEvidenceLanes";
import { effectiveSubagentRoleSnapshot } from "../../shared/subagentPatternGraph";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import {
  SYMPHONY_CHILD_LAUNCH_CONTRACT_BUNDLE_SCHEMA_VERSION,
  SYMPHONY_CHILD_LAUNCH_POLICY_SCHEMA_VERSION,
  SYMPHONY_MODE_POLICY_SNAPSHOT_SCHEMA_VERSION,
  SYMPHONY_MUTATION_WORKSPACE_LEASE_SCHEMA_VERSION,
  SYMPHONY_PATTERN_SELECTION_SCHEMA_VERSION,
  type MutationWorkspaceLease,
  type SymphonyChildLaunchContractBundle,
} from "../../shared/symphonyFineGrainedContracts";
import { ProjectStore } from "./projectStore";
import {
  createSubagentBatchJobPlan,
  createSubagentBatchResultReport,
  type SubagentBatchJobPlan,
} from "./projectStoreSubagentsFacade";
import {
  cancelPendingParentToChildMailboxEvents,
  consumeDeliveredParentToChildMailboxEvents,
  deliverQueuedParentToChildMailboxEvents,
} from "./projectStoreSubagentsFacade";
import type { SubagentResultArtifact } from "../../shared/subagentProtocol";
import type { ModelRuntimeInstalledProvider } from "../../shared/threadTypes";
import { buildCallableWorkflowExecutionPlan } from "../callable-workflow/callableWorkflowExecutionPlan";
import {
  buildCallableWorkflowRegistry,
  buildCallableWorkflowRunPlan,
  parentPiVisibleCallableWorkflowTools,
} from "../callable-workflow/callableWorkflowRegistry";

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

async function tempWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "ambient-store-subagent-foundation-"));
  roots.push(root);
  return join(root, "workspace");
}

function batchPlan(parentThreadId: string): SubagentBatchJobPlan {
  return createSubagentBatchJobPlan({
    parentThreadId,
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    canonicalTaskPath: "root/9:batch",
    createdAt: "2026-06-05T00:00:00.000Z",
    maxConcurrency: 2,
    items: [
      { itemId: "lint", roleId: "worker", task: "Run lint and fix scoped findings." },
      { itemId: "test", roleId: "reviewer", task: "Review test output." },
    ],
  });
}

function enabledSubagentFeatureFlags(generatedAt = "2026-06-05T00:00:00.000Z") {
  return resolveAmbientFeatureFlags({
    startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
    generatedAt,
  });
}

function mapReduceMetricCriteria(): Array<{ templateId: string; value: string }> {
  return [{ templateId: "map_reduce-metric", value: "Every mapped item has reducer evidence." }];
}

function upsertBatchJobPlan(store: ProjectStore, plan: SubagentBatchJobPlan) {
  return store.upsertSubagentBatchJobPlan(plan, {
    featureFlagSnapshot: enabledSubagentFeatureFlags(plan.createdAt),
  });
}

function symphonyLaunchBundle(input: {
  featureFlagSnapshot: ReturnType<typeof enabledSubagentFeatureFlags>;
  parentThreadId: string;
  parentRunId: string;
  role: string;
}): SymphonyChildLaunchContractBundle {
  return {
    schemaVersion: SYMPHONY_CHILD_LAUNCH_CONTRACT_BUNDLE_SCHEMA_VERSION,
    patternSelection: {
      schemaVersion: SYMPHONY_PATTERN_SELECTION_SCHEMA_VERSION,
      selectionId: "selection-1",
      parentRunId: input.parentRunId,
      pattern: "map_reduce",
      confidence: "high",
      childRolePlan: [
        { role: input.role, count: 1, purpose: "Map the assigned evidence slice." },
      ],
      requiredArtifacts: ["mapped-evidence"],
      reducerContract: "Reduce only from mapped child evidence.",
      failurePolicy: "require_all",
      tokenAndTimeBudget: { maxChildren: 1, maxMinutes: 10 },
    },
    modePolicySnapshot: {
      schemaVersion: SYMPHONY_MODE_POLICY_SNAPSHOT_SCHEMA_VERSION,
      snapshotId: "mode-policy-1",
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      enabled: true,
      parentAllowedActions: [
        "detect_pattern",
        "plan",
        "spawn_child",
        "inspect_run_graph",
        "inspect_child_evidence",
        "request_decision",
        "retry_child",
        "synthesize",
      ],
      observationPolicy: "full_runtime_observability",
      directExecutionPolicy: "deny_substantive_tools",
      featureFlagSnapshot: input.featureFlagSnapshot,
    },
    childLaunchPolicySnapshot: {
      schemaVersion: SYMPHONY_CHILD_LAUNCH_POLICY_SCHEMA_VERSION,
      policyId: "child-policy-1",
      childRunId: "planned-child-run",
      role: input.role,
      pattern: "map_reduce",
      inheritedAuthorityRoots: ["/workspace"],
      writableRoots: [],
      allowedToolIds: ["workspace.read", "artifact.read"],
      deniedToolIds: ["workspace.write", "browser.interactive"],
      webProviderOrder: {
        search: ["brave-search"],
        staticFetchExtract: ["scrapling-static"],
        dynamicHeadlessBrowser: ["scrapling-dynamic"],
        interactiveBrowser: {
          providers: ["ambient-browser"],
          fallback: "approval_required",
        },
      },
      mutation: "none",
    },
  };
}

function symphonyMutationWorkspaceLease(input: {
  parentThreadId: string;
}): MutationWorkspaceLease {
  return {
    schemaVersion: SYMPHONY_MUTATION_WORKSPACE_LEASE_SCHEMA_VERSION,
    leaseId: "mutation-lease-1",
    parentThreadId: input.parentThreadId,
    childThreadId: "planned-child-thread",
    childRunId: "planned-child-run",
    kind: "scratch_overlay",
    rootPath: "/tmp/symphony/lease-1",
    sourceRoots: ["/workspace"],
    readOnlyBaseRoots: ["/workspace"],
    declaredWritableRoots: ["/workspace/out"],
    writableRoots: ["/tmp/symphony/lease-1/out"],
    status: "active",
    acquiredAt: "2026-06-16T00:00:00.000Z",
    lastHeartbeatAt: "2026-06-16T00:00:01.000Z",
  };
}

function batchArtifact(runId: string, status: SubagentResultArtifact["status"], childThreadId = `${runId}-thread`): SubagentResultArtifact {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId,
    status,
    partial: false,
    summary: `Result artifact for ${runId}.`,
    childThreadId,
  };
}

function waitBarrierResolutionArtifact(input: {
  childRunIds: string[];
  childStatuses?: Array<{ childRunId: string; status: string }>;
  synthesisAllowed: boolean;
  transitionKind: string;
  transitionSource?: string;
  reason?: string;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
    childRunIds: input.childRunIds,
    ...(input.childStatuses ? { childStatuses: input.childStatuses } : {}),
    synthesisAllowed: input.synthesisAllowed,
    transitionEvidence: {
      schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
      kind: input.transitionKind,
      source: input.transitionSource ?? "wait_agent",
      childRunIds: input.childRunIds,
      ...(input.childRunIds.length === 1 ? { childRunId: input.childRunIds[0] } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    },
    ...(input.extra ?? {}),
  };
}

describe("ProjectStore sub-agent foundation settings", () => {
  it("persists feature flag settings and preserves unknown model ids", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const reopened = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("Custom model");
      store.updateThreadSettings(thread.id, { model: "custom/model" });
      store.setFeatureFlagSettings({ subagents: true });
      store.close();

      reopened.openWorkspace(workspacePath);
      expect(reopened.getThread(thread.id).model).toBe("custom/model");
      expect(reopened.getDefaultSettings().featureFlags).toEqual({
        subagents: true,
        tencentDbMemory: true,
        slashCommands: false,
      });
      expect(reopened.getDefaultSettings().memory).toEqual({
        mode: "enabled_all",
        enabled: true,
        defaultThreadEnabled: true,
        adapter: "tencentdb",
        shortTermOffloadEnabled: false,
        embeddings: {
          enabled: true,
          providerMode: "ambient-managed",
          autoStartProvider: true,
          sendDimensions: false,
          maxInputChars: 512,
          timeoutMs: 10_000,
          preflightEnabled: true,
        },
        storageScope: "workspace",
      });
      expect(reopened.getSubagentMaturitySnapshot({ createdAt: "2026-06-05T00:00:00.000Z" })).toMatchObject({
        schemaVersion: "ambient-subagent-maturity-v1",
        status: "blocked",
        defaultCanBeEnabled: false,
        blockedGateIds: expect.arrayContaining([
          "live_dogfood_count",
          "live_smoke",
          "failure_rate",
          "restart_recovery",
          "security_review",
        ]),
        gates: expect.arrayContaining([
          expect.objectContaining({
            id: "feature_flag_guarded",
            status: "passed",
            actual: "Default off; effective enabled via settings.",
          }),
        ]),
      });
    } finally {
      store.close();
      reopened.close();
    }
  });

  it("persists memory settings and applies default memory only to new threads", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const reopened = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      store.setMemorySettings({ mode: "per_thread" });
      const beforeDefault = store.createThread("Before memory default");
      expect(beforeDefault.memoryEnabled).toBe(false);

      store.setMemorySettings({ mode: "enabled_all" });
      const afterDefault = store.createThread("After memory default");
      store.updateThreadSettings(beforeDefault.id, { memoryEnabled: true });
      store.close();

      reopened.openWorkspace(workspacePath);
      expect(reopened.getDefaultSettings().memory).toMatchObject({
        enabled: true,
        mode: "enabled_all",
        defaultThreadEnabled: true,
        adapter: "tencentdb",
      });
      expect(reopened.getThread(beforeDefault.id).memoryEnabled).toBe(true);
      expect(reopened.getThread(afterDefault.id).memoryEnabled).toBe(true);
    } finally {
      store.close();
      reopened.close();
    }
  });

  it("persists Settings-installed model providers and feeds the runtime catalog without secrets", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const reopened = new ProjectStore();
    const installed = installedProvider({
      providerId: "customer-router",
      modelId: "CUSTOM/Router Model v2",
    });

    try {
      store.openWorkspace(workspacePath);
      store.setModelRuntimeSettings({ installedProviders: [installed] });
      store.close();

      reopened.openWorkspace(workspacePath);
      const settings = reopened.getModelRuntimeSettings();
      const catalog = reopened.getModelRuntimeCatalog("2026-06-06T01:00:00.000Z");
      const serializedSettings = JSON.stringify(settings);

      expect(settings.installedProviders).toEqual([
        expect.objectContaining({
          provider: expect.objectContaining({ id: "customer-router" }),
          profile: expect.objectContaining({
            providerId: "customer-router",
            modelId: "CUSTOM/Router Model v2",
          }),
        }),
      ]);
      expect(serializedSettings).not.toContain("sk-test-secret");
      expect(catalog.providers).toContainEqual(expect.objectContaining({
        id: "customer-router",
        label: "Customer Router",
      }));
      expect(catalog.profiles).toContainEqual(expect.objectContaining({
        profileId: "customer-router:CUSTOM/Router Model v2",
        modelId: "CUSTOM/Router Model v2",
        selectableAsMain: true,
        selectableAsSubagent: true,
      }));
      expect(catalog.selectableMainModelOptions.map((option) => option.id)).toEqual(expect.arrayContaining([
        "zai-org/GLM-5.2-FP8",
        "CUSTOM/Router Model v2",
      ]));
      expect(catalog.selectableSubagentProfiles.map((profile) => profile.modelId)).toEqual(expect.arrayContaining([
        "zai-org/GLM-5.2-FP8",
        "CUSTOM/Router Model v2",
      ]));
    } finally {
      store.close();
      reopened.close();
    }
  });

  it("creates a child thread and run metadata only when ambient.subagents is enabled", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const disabledFlags = resolveAmbientFeatureFlags({ generatedAt: "2026-06-05T00:00:00.000Z" });
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");

      expect(() => store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Explorer child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: disabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
      })).toThrow(/disabled/);
      expect(() => store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Mismatched role child",
        roleId: "explorer",
        roleProfileSnapshot: getDefaultSubagentRoleProfile("reviewer"),
        canonicalTaskPath: "root/bad:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
      })).toThrow(/does not match requested role/);
      const threadIdsBeforeBadEffectiveRole = store.listThreads().map((thread) => thread.id);
      expect(() => store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Mismatched effective role child",
        roleId: "explorer",
        effectiveRoleSnapshot: effectiveSubagentRoleSnapshot({
          baseRole: "reviewer",
          patternRole: "verifier",
          overlayLabels: ["acceptance checks"],
        }),
        canonicalTaskPath: "root/bad-effective-role:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
      })).toThrow(/effective role snapshot does not match requested role/);
      expect(store.listThreads().map((thread) => thread.id)).toEqual(threadIdsBeforeBadEffectiveRole);
      const threadIdsBeforeBadLease = store.listThreads().map((thread) => thread.id);
      expect(() => store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Bad lease child",
        roleId: "explorer",
        canonicalTaskPath: "root/bad-lease:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        capacityLeaseSnapshot: { schemaVersion: "legacy-capacity-lease" } as never,
      })).toThrow(/capacity lease snapshot must use schema/);
      expect(store.listThreads().map((thread) => thread.id)).toEqual(threadIdsBeforeBadLease);
      const effectiveRoleSnapshot = effectiveSubagentRoleSnapshot({
        baseRole: "explorer",
        patternRole: "mapper",
        overlayLabels: ["slice assignment", "extraction schema", "citation requirement"],
        outputContract: "schema-valid mapped evidence",
      });

      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: "parent-message",
        title: "Explorer child",
        roleId: "explorer",
        effectiveRoleSnapshot,
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        symphonyLaunchContracts: symphonyLaunchBundle({
          featureFlagSnapshot: enabledFlags,
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          role: "explorer",
        }),
        symphonyMutationWorkspaceLease: symphonyMutationWorkspaceLease({ parentThreadId: parent.id }),
        dependencyMode: "required",
      });

      const child = store.getThread(run.childThreadId);
      expect(child).toMatchObject({
        kind: "subagent_child",
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: "parent-message",
        subagentRunId: run.id,
        canonicalTaskPath: "root/0:explorer",
        collapsedByDefault: true,
        childStatus: "reserved",
      });
      expect(run).toMatchObject({
        parentThreadId: parent.id,
        childThreadId: child.id,
        dependencyMode: "required",
        status: "reserved",
        capacityLeaseSnapshot: expect.objectContaining({
          schemaVersion: "ambient-subagent-capacity-lease-v1",
          status: "reserved",
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          childRunId: run.id,
          childThreadId: child.id,
          canonicalTaskPath: "root/0:explorer",
          blockingReasons: [],
        }),
        roleProfileSnapshot: expect.objectContaining({
          schemaVersion: "ambient-subagent-role-profile-v1",
          id: "explorer",
          guardPolicy: expect.objectContaining({
            structuredOutputRequired: true,
          }),
        }),
        roleProfileSnapshotSource: "resolved",
        effectiveRoleSnapshot,
        symphonyLaunchContracts: expect.objectContaining({
          patternSelection: expect.objectContaining({
            pattern: "map_reduce",
            parentRunId: "parent-run",
          }),
          modePolicySnapshot: expect.objectContaining({
            parentThreadId: parent.id,
            parentRunId: "parent-run",
          }),
          childLaunchPolicySnapshot: expect.objectContaining({
            childRunId: run.id,
            role: "explorer",
            mutation: "none",
          }),
        }),
        symphonyMutationWorkspaceLease: expect.objectContaining({
          parentThreadId: parent.id,
          childThreadId: child.id,
          childRunId: run.id,
          status: "active",
        }),
      });
      expect(store.getSubagentRun(run.id).effectiveRoleSnapshot).toEqual(effectiveRoleSnapshot);
      expect(store.getSubagentRun(run.id).symphonyLaunchContracts?.childLaunchPolicySnapshot.childRunId).toBe(run.id);
      expect(store.getSubagentRun(run.id).symphonyMutationWorkspaceLease?.childThreadId).toBe(child.id);
      expect(store.listSubagentRunsForParentThread(parent.id).map((item) => item.id)).toEqual([run.id]);
      expect(store.listSubagentRunEvents(run.id)).toEqual([
        expect.objectContaining({
          runId: run.id,
          sequence: 1,
          type: "subagent.reserved",
          preview: expect.objectContaining({
            effectiveRole: {
              displayLabel: "Explorer + Mapper",
              patternRole: "mapper",
              roleOverlayIds: [
                "mapper.slice-assignment",
                "mapper.extraction-schema",
                "mapper.citation-requirement",
              ],
            },
            capacityLease: expect.objectContaining({
              status: "reserved",
              projectedOpenRunCount: 1,
            }),
            symphonyLaunch: {
              pattern: "map_reduce",
              selectionId: "selection-1",
              policyId: "child-policy-1",
            },
          }),
        }),
        expect.objectContaining({
          runId: run.id,
          sequence: 2,
          type: "subagent.lifecycle_started",
          preview: expect.objectContaining({
            schemaVersion: "ambient-subagent-lifecycle-hook-v1",
            hook: "SubagentStart",
            parentTranscriptPath: `ambient://threads/${parent.id}/transcript`,
            childTranscriptPath: `ambient://threads/${child.id}/transcript`,
          }),
        }),
      ]);
      const promptSnapshot = store.recordSubagentPromptSnapshot(run.id, {
        prompt: "Child prompt text",
        snapshot: { inheritedRefs: [], strippedRefs: [{ sourceMessageId: "m-tool", reason: "tool_message" }] },
        createdAt: "2026-06-05T00:00:20.000Z",
      });
      expect(promptSnapshot).toMatchObject({
        runId: run.id,
        sequence: 1,
        promptPreview: "Child prompt text",
        snapshot: { inheritedRefs: [], strippedRefs: [{ sourceMessageId: "m-tool", reason: "tool_message" }] },
      });
      expect(promptSnapshot.promptSha256).toHaveLength(64);
      const toolScopeSnapshot = store.recordSubagentToolScopeSnapshot(run.id, {
        scope: {
          schemaVersion: "ambient-subagent-tool-scope-v1",
          loadedCategories: ["workspace.read"],
          piVisibleCategories: ["workspace.read"],
          deniedCategories: [{ id: "subagent.spawn", reason: "Nested fanout disabled." }],
          loadedTools: [{
            source: "built_in",
            id: "workspace.read",
            categoryId: "workspace.read",
            piVisible: true,
            mutatesState: false,
            requiresApproval: false,
          }],
          piVisibleTools: [{
            source: "built_in",
            id: "workspace.read",
            categoryId: "workspace.read",
            piVisible: true,
            mutatesState: false,
            requiresApproval: false,
          }],
          deniedTools: [{
            source: "fanout",
            id: "subagent.spawn",
            categoryId: "subagent.spawn",
            reason: "Nested fanout disabled.",
          }],
          approvalMode: "interactive",
          worktreeIsolated: false,
          fanoutAvailable: false,
        },
        resolverInputs: { roleId: "explorer", requestedCategories: ["workspace.read", "subagent.spawn"] },
        createdAt: "2026-06-05T00:00:25.000Z",
      });
      expect(toolScopeSnapshot).toMatchObject({
        runId: run.id,
        sequence: 1,
        scope: {
          loadedCategories: ["workspace.read"],
          piVisibleCategories: ["workspace.read"],
          fanoutAvailable: false,
        },
        resolverInputs: { roleId: "explorer", requestedCategories: ["workspace.read", "subagent.spawn"] },
      });
      const waitBarrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [run.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        timeoutMs: 30_000,
        createdAt: "2026-06-05T00:00:27.000Z",
      });
      expect(waitBarrier).toMatchObject({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [run.id],
        dependencyMode: "required_all",
        status: "waiting_on_children",
        failurePolicy: "ask_user",
        timeoutMs: 30_000,
      });
      const resolvedBarrier = store.updateSubagentWaitBarrierStatus(waitBarrier.id, "satisfied", {
        resolutionArtifact: waitBarrierResolutionArtifact({
          childRunIds: [run.id],
          synthesisAllowed: true,
          transitionKind: "child_terminal",
          reason: "completed",
        }),
        now: "2026-06-05T00:00:28.000Z",
      });
      expect(resolvedBarrier).toMatchObject({
        id: waitBarrier.id,
        status: "satisfied",
        resolvedAt: "2026-06-05T00:00:28.000Z",
        resolutionArtifact: {
          childRunIds: [run.id],
          synthesisAllowed: true,
        },
      });
      expect(store.listSubagentWaitBarriersForParentRun("parent-run").map((barrier) => barrier.id)).toEqual([waitBarrier.id]);

      const missingEvidenceBarrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [run.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      expect(() => store.updateSubagentWaitBarrierStatus(missingEvidenceBarrier.id, "satisfied", {
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: [run.id],
          synthesisAllowed: true,
        },
      })).toThrow(/requires durable transitionEvidence/);

      const progressEvidenceBarrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [run.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      expect(() => store.updateSubagentWaitBarrierStatus(progressEvidenceBarrier.id, "timed_out", {
        resolutionArtifact: waitBarrierResolutionArtifact({
          childRunIds: [run.id],
          synthesisAllowed: false,
          transitionKind: "progress_return",
          transitionSource: "parent_wait_session",
          reason: "parent_wait_window_elapsed",
        }),
      })).toThrow(/cannot use progress_return as terminal evidence/);

      const mismatchedEvidenceBarrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [run.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      expect(() => store.updateSubagentWaitBarrierStatus(mismatchedEvidenceBarrier.id, "satisfied", {
        resolutionArtifact: waitBarrierResolutionArtifact({
          childRunIds: [run.id],
          childStatuses: [{ childRunId: run.id, status: "timed_out" }],
          synthesisAllowed: false,
          transitionKind: "child_runtime_timeout",
          transitionSource: "child_runtime",
          reason: "runtime_idle_timeout",
        }),
      })).toThrow(/status satisfied cannot use transition evidence kind child_runtime_timeout/);

      const backgroundRunA = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: "parent-message",
        title: "Summary child A",
        roleId: "summarizer",
        canonicalTaskPath: "root/1:summarizer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "optional_background",
      });
      const backgroundRunB = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: "parent-message",
        title: "Summary child B",
        roleId: "summarizer",
        canonicalTaskPath: "root/2:summarizer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "optional_background",
      });
      const groupedA = store.upsertSubagentGroupedCompletionNotification({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        child: {
          runId: backgroundRunA.id,
          childThreadId: backgroundRunA.childThreadId,
          canonicalTaskPath: backgroundRunA.canonicalTaskPath,
          roleId: backgroundRunA.roleId,
          status: "completed",
          summary: "First background summary",
        },
        createdAt: "2026-06-05T00:00:29.000Z",
      });
      const groupedB = store.upsertSubagentGroupedCompletionNotification({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        child: {
          runId: backgroundRunB.id,
          childThreadId: backgroundRunB.childThreadId,
          canonicalTaskPath: backgroundRunB.canonicalTaskPath,
          roleId: backgroundRunB.roleId,
          status: "failed",
          summary: "Second background summary",
        },
        createdAt: "2026-06-05T00:00:29.500Z",
      });
      const groupedReplay = store.upsertSubagentGroupedCompletionNotification({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        child: {
          runId: backgroundRunA.id,
          childThreadId: backgroundRunA.childThreadId,
          canonicalTaskPath: backgroundRunA.canonicalTaskPath,
          roleId: backgroundRunA.roleId,
          status: "completed",
          summary: "First background summary replay",
        },
      });
      expect(groupedA.id).toBe(groupedB.id);
      expect(groupedReplay.id).toBe(groupedA.id);
      expect(store.listSubagentParentMailboxEventsForParentRun("parent-run")).toEqual([
        expect.objectContaining({
          id: groupedA.id,
          type: "subagent.grouped_completion",
          parentMessageId: "parent-message",
          deliveryState: "queued",
          payload: expect.objectContaining({
            parentMessageId: "parent-message",
            notificationCount: 2,
            childRuns: [
              expect.objectContaining({ runId: backgroundRunA.id, summary: "First background summary replay" }),
              expect.objectContaining({ runId: backgroundRunB.id, summary: "Second background summary" }),
            ],
          }),
        }),
      ]);

      const running = store.markSubagentRunStatus(run.id, "running", {
        now: "2026-06-05T00:00:30.000Z",
      });
      expect(running.startedAt).toBe("2026-06-05T00:00:30.000Z");
      expect(store.getThread(child.id).childStatus).toBe("running");

      store.markSubagentRunStatus(run.id, "completed", {
        resultArtifact: { summary: "Done", childThreadId: child.id },
        now: "2026-06-05T00:01:00.000Z",
      });
      const closed = store.closeSubagentRun(run.id, "2026-06-05T00:02:00.000Z");
      expect(closed.closedAt).toBe("2026-06-05T00:02:00.000Z");
      expect(closed.capacityLeaseSnapshot).toMatchObject({
        status: "released",
        releasedAt: "2026-06-05T00:02:00.000Z",
        releaseReason: expect.stringContaining("close_agent"),
      });
      expect(closed.symphonyMutationWorkspaceLease).toMatchObject({
        leaseId: "mutation-lease-1",
        status: "released",
        lastHeartbeatAt: "2026-06-05T00:02:00.000Z",
      });
      expect(store.getThread(child.id)).toMatchObject({
        id: child.id,
        kind: "subagent_child",
        childStatus: "completed",
      });
      expect(store.listSubagentRunEvents(run.id).map((event) => event.type)).toEqual([
        "subagent.reserved",
        "subagent.lifecycle_started",
        "subagent.status_changed",
        "subagent.status_changed",
        "subagent.lifecycle_stopped",
        "subagent.closed",
        "subagent.lifecycle_closed",
      ]);
      expect(store.listSubagentRunEvents(run.id).at(-1)?.preview).toMatchObject({
        schemaVersion: "ambient-subagent-lifecycle-hook-v1",
        hook: "SubagentClose",
        parentTranscriptPath: `ambient://threads/${parent.id}/transcript`,
        childTranscriptPath: `ambient://threads/${child.id}/transcript`,
      });
      expect(store.listSubagentRunEvents(run.id).find((event) => event.type === "subagent.closed")?.preview).toMatchObject({
        capacityLease: expect.objectContaining({
          status: "released",
          releasedAt: "2026-06-05T00:02:00.000Z",
        }),
        mutationWorkspaceLease: {
          leaseId: "mutation-lease-1",
          kind: "scratch_overlay",
          status: "released",
          rootPath: "/tmp/symphony/lease-1",
        },
      });
      const eventTypesAfterClose = store.listSubagentRunEvents(run.id).map((event) => event.type);
      const closeReplay = store.closeSubagentRun(run.id, "2026-06-05T00:03:00.000Z");
      expect(closeReplay.closedAt).toBe("2026-06-05T00:02:00.000Z");
      expect(closeReplay.capacityLeaseSnapshot).toMatchObject({
        status: "released",
        releasedAt: "2026-06-05T00:02:00.000Z",
      });
      expect(store.listSubagentRunEvents(run.id).map((event) => event.type)).toEqual(eventTypesAfterClose);
    } finally {
      store.close();
    }
  });

  it("blocks duplicate canonical child paths while unresolved required barriers reference the original child", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = enabledSubagentFeatureFlags();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const createChild = (canonicalTaskPath: string, title = canonicalTaskPath) => store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: "parent-message",
        title,
        roleId: "explorer",
        canonicalTaskPath,
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const original = createChild("root/0:explorer", "Original child");
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [original.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        createdAt: "2026-06-05T00:00:10.000Z",
      });
      const threadIdsBeforeDuplicate = store.listThreads().map((thread) => thread.id);

      expect(() => store.assertSubagentCanonicalTaskPathAvailableForSpawn({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        canonicalTaskPath: "root/0:explorer",
      })).toThrow(/already owned by child run .*Unresolved required wait barrier/);
      expect(() => createChild("root/0:explorer", "Duplicate child")).toThrow(/spawning replacement child work/);
      expect(store.listThreads().map((thread) => thread.id)).toEqual(threadIdsBeforeDuplicate);
      expect(store.listSubagentRunsForParentThread(parent.id)
        .filter((run) => run.canonicalTaskPath === "root/0:explorer")
        .map((run) => run.id)).toEqual([original.id]);

      store.updateSubagentWaitBarrierStatus(barrier.id, "satisfied", {
        now: "2026-06-05T00:00:20.000Z",
        resolutionArtifact: waitBarrierResolutionArtifact({
          childRunIds: [original.id],
          synthesisAllowed: true,
          transitionKind: "child_terminal",
          reason: "completed",
        }),
      });
      expect(() => store.assertSubagentCanonicalTaskPathAvailableForSpawn({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        canonicalTaskPath: "root/0:explorer",
      })).not.toThrow();
      const afterTerminal = createChild("root/0:explorer", "Post-terminal child");
      expect(afterTerminal.id).not.toBe(original.id);
    } finally {
      store.close();
    }
  });

  it("does not treat optional background barriers as duplicate canonical path blockers", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = enabledSubagentFeatureFlags();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const original = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: "parent-message",
        title: "Background child",
        roleId: "explorer",
        canonicalTaskPath: "root/background:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "optional_background",
      });
      store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [original.id],
        dependencyMode: "optional_background",
        failurePolicy: "degrade_partial",
        createdAt: "2026-06-05T00:00:10.000Z",
      });

      expect(() => store.assertSubagentCanonicalTaskPathAvailableForSpawn({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        canonicalTaskPath: "root/background:explorer",
      })).not.toThrow();
      const duplicateBackground = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: "parent-message",
        title: "Background child replacement",
        roleId: "explorer",
        canonicalTaskPath: "root/background:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "optional_background",
      });
      expect(store.listSubagentRunsForParentThread(parent.id)
        .filter((run) => run.canonicalTaskPath === "root/background:explorer")
        .map((run) => run.id)).toEqual([original.id, duplicateBackground.id]);
    } finally {
      store.close();
    }
  });

  it("does not treat nonblocking callable-workflow bridge barriers as duplicate canonical path blockers", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = enabledSubagentFeatureFlags();

    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const registry = buildCallableWorkflowRegistry({ featureFlagSnapshot: enabledFlags });
      const tool = parentPiVisibleCallableWorkflowTools(registry)[0];
      if (!tool) throw new Error("Missing callable workflow tool.");
      const task = store.enqueueCallableWorkflowTask({
        executionPlan: buildCallableWorkflowExecutionPlan({
          descriptor: tool,
          runPlan: buildCallableWorkflowRunPlan(tool, {
            goal: "Background map-reduce",
            blocking: false,
            metricCriteria: mapReduceMetricCriteria(),
          }),
          parent: {
            threadId: parent.id,
            runId: parentRun.id,
            assistantMessageId: assistant.id,
          },
          toolCallId: "background-callable-workflow-tool-call",
          createdAt: "2026-06-05T00:00:00.000Z",
        }),
        featureFlagSnapshot: enabledFlags,
      });
      const original = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Background bridge child",
        roleId: "explorer",
        canonicalTaskPath: "root/background-bridge:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "optional_background",
      });
      store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [original.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        ownerKind: "callable_workflow_symphony_launch_bridge",
        ownerId: task.id,
        createdAt: "2026-06-05T00:00:10.000Z",
      });

      expect(() => store.assertSubagentCanonicalTaskPathAvailableForSpawn({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        canonicalTaskPath: "root/background-bridge:explorer",
      })).not.toThrow();
      const replacement = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Background bridge child replacement",
        roleId: "explorer",
        canonicalTaskPath: "root/background-bridge:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "optional_background",
      });
      expect(store.listSubagentRunsForParentThread(parent.id)
        .filter((run) => run.canonicalTaskPath === "root/background-bridge:explorer")
        .map((run) => run.id)).toEqual([original.id, replacement.id]);
    } finally {
      store.close();
    }
  });

  it("tracks child mailbox delivery state idempotently", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const reopened = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Mailbox parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Mailbox child",
        roleId: "explorer",
        canonicalTaskPath: "root/mailbox:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
      });
      const followup = store.appendSubagentMailboxEvent(run.id, {
        direction: "parent_to_child",
        type: "subagent.followup",
        payload: { message: "Check restart recovery." },
        createdAt: "2026-06-05T00:00:01.000Z",
      });
      const status = store.appendSubagentMailboxEvent(run.id, {
        direction: "child_to_parent",
        type: "subagent.needs_attention",
        payload: { summary: "Need a fixture choice." },
        createdAt: "2026-06-05T00:00:02.000Z",
      });

      const delivered = deliverQueuedParentToChildMailboxEvents(store, {
        runId: run.id,
        now: "2026-06-05T00:00:03.000Z",
      });
      expect(delivered).toMatchObject({
        schemaVersion: "ambient-subagent-mailbox-delivery-batch-v1",
        runId: run.id,
        transitioned: [
          expect.objectContaining({
            id: followup.id,
            direction: "parent_to_child",
            deliveryState: "delivered",
            deliveredAt: "2026-06-05T00:00:03.000Z",
          }),
        ],
        unchanged: [],
      });
      expect(store.getSubagentMailboxEvent(status.id)).toMatchObject({
        deliveryState: "queued",
        deliveredAt: undefined,
      });

      const deliveredReplay = deliverQueuedParentToChildMailboxEvents(store, {
        runId: run.id,
        now: "2026-06-05T00:00:04.000Z",
      });
      expect(deliveredReplay.transitioned).toEqual([]);
      expect(deliveredReplay.unchanged).toEqual([
        expect.objectContaining({
          id: followup.id,
          deliveryState: "delivered",
          deliveredAt: "2026-06-05T00:00:03.000Z",
        }),
      ]);

      const consumed = consumeDeliveredParentToChildMailboxEvents(store, {
        runId: run.id,
        now: "2026-06-05T00:00:05.000Z",
      });
      expect(consumed.transitioned).toEqual([
        expect.objectContaining({
          id: followup.id,
          deliveryState: "consumed",
          deliveredAt: "2026-06-05T00:00:03.000Z",
        }),
      ]);
      expect(consumeDeliveredParentToChildMailboxEvents(store, {
        runId: run.id,
        now: "2026-06-05T00:00:06.000Z",
      }).unchanged).toEqual([
        expect.objectContaining({
          id: followup.id,
          deliveryState: "consumed",
          deliveredAt: "2026-06-05T00:00:03.000Z",
        }),
      ]);
      const queuedMessage = store.appendSubagentMailboxEvent(run.id, {
        direction: "parent_to_child",
        type: "subagent.message",
        payload: { message: "Never mind." },
        createdAt: "2026-06-05T00:00:07.000Z",
      });
      const deliveredMessage = store.appendSubagentMailboxEvent(run.id, {
        direction: "parent_to_child",
        type: "subagent.message",
        payload: { message: "Already delivered." },
        deliveryState: "delivered",
        createdAt: "2026-06-05T00:00:08.000Z",
        deliveredAt: "2026-06-05T00:00:08.500Z",
      });
      const cancelled = cancelPendingParentToChildMailboxEvents(store, {
        runId: run.id,
        now: "2026-06-05T00:00:09.000Z",
      });
      expect(cancelled.transitioned).toEqual([
        expect.objectContaining({
          id: queuedMessage.id,
          deliveryState: "cancelled",
          deliveredAt: undefined,
        }),
        expect.objectContaining({
          id: deliveredMessage.id,
          deliveryState: "cancelled",
          deliveredAt: "2026-06-05T00:00:08.500Z",
        }),
      ]);
      expect(cancelled.events.map((event) => event.id)).not.toContain(followup.id);
      expect(cancelPendingParentToChildMailboxEvents(store, {
        runId: run.id,
        now: "2026-06-05T00:00:10.000Z",
      }).unchanged).toEqual([
        expect.objectContaining({ id: queuedMessage.id, deliveryState: "cancelled" }),
        expect.objectContaining({ id: deliveredMessage.id, deliveryState: "cancelled" }),
      ]);

      store.close();
      reopened.openWorkspace(workspacePath);
      expect(reopened.listSubagentMailboxEvents(run.id)).toEqual([
        expect.objectContaining({
          id: followup.id,
          deliveryState: "consumed",
          deliveredAt: "2026-06-05T00:00:03.000Z",
        }),
        expect.objectContaining({
          id: status.id,
          deliveryState: "queued",
          deliveredAt: undefined,
        }),
        expect.objectContaining({
          id: queuedMessage.id,
          deliveryState: "cancelled",
          deliveredAt: undefined,
        }),
        expect.objectContaining({
          id: deliveredMessage.id,
          deliveryState: "cancelled",
          deliveredAt: "2026-06-05T00:00:08.500Z",
        }),
      ]);
    } finally {
      store.close();
      reopened.close();
    }
  });

  it("persists explicit quorum thresholds on wait barriers", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const reopened = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Quorum parent");
      const childRuns = ["explorer", "reviewer", "summarizer"].map((roleId, index) =>
        store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          title: `Quorum child ${index + 1}`,
          roleId,
          canonicalTaskPath: `root/${index}:${roleId}`,
          featureFlagSnapshot: enabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
          dependencyMode: "required",
        })
      );

      expect(() => store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: childRuns.map((run) => run.id),
        dependencyMode: "quorum",
        failurePolicy: "ask_user",
      })).toThrow(/explicit integer quorumThreshold/);
      expect(() => store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: childRuns.map((run) => run.id),
        dependencyMode: "required_any",
        failurePolicy: "ask_user",
        quorumThreshold: 2,
      })).toThrow(/only valid for quorum/);

      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: childRuns.map((run) => run.id),
        dependencyMode: "quorum",
        failurePolicy: "ask_user",
        quorumThreshold: 2,
        timeoutMs: 45_000,
        createdAt: "2026-06-05T00:00:20.000Z",
      });
      expect(barrier).toMatchObject({
        childRunIds: childRuns.map((run) => run.id),
        dependencyMode: "quorum",
        quorumThreshold: 2,
        timeoutMs: 45_000,
      });
      store.close();

      reopened.openWorkspace(workspacePath);
      expect(reopened.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        id: barrier.id,
        dependencyMode: "quorum",
        quorumThreshold: 2,
        childRunIds: childRuns.map((run) => run.id),
      });
    } finally {
      store.close();
      reopened.close();
    }
  });

  it("persists maturity evidence and feeds feature graduation gates", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const reopened = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Maturity parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Live smoke child",
        roleId: "summarizer",
        canonicalTaskPath: "root/0:summarizer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(run.id, "running", {
        now: "2026-06-05T00:00:10.000Z",
      });
      store.markSubagentRunStatus(run.id, "completed", {
        resultArtifact: batchArtifact(run.id, "completed", run.childThreadId),
        now: "2026-06-05T00:00:20.000Z",
      });
      const dogfood = store.recordSubagentMaturityEvidence({
        kind: "live_dogfood_run",
        status: "passed",
        evidenceKey: `dogfood:${run.id}`,
        runId: run.id,
        artifactPath: ".ambient/subagents/live-smoke.md",
        notes: "Live child session streamed and summarized.",
        details: {
          releaseGateHistoryEntry: releaseGateHistoryEntry(run.id),
        },
        createdAt: "2026-06-05T00:00:30.000Z",
      });
      expect(store.recordSubagentMaturityEvidence({
        kind: "live_dogfood_run",
        status: "passed",
        evidenceKey: `dogfood:${run.id}`,
        runId: run.id,
        artifactPath: ".ambient/subagents/live-smoke.md",
        notes: "Idempotent replay.",
        details: {
          releaseGateHistoryEntry: releaseGateHistoryEntry(run.id),
        },
        createdAt: "2026-06-05T00:00:31.000Z",
      })).toMatchObject({
        id: dogfood.id,
        notes: "Idempotent replay.",
        updatedAt: "2026-06-05T00:00:31.000Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "desktop_dogfood_run",
        status: "passed",
        evidenceKey: `desktop-dogfood:${run.id}`,
        runId: run.id,
        artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
        notes: "Full Desktop child-thread dogfood captured screenshots and visual assertions.",
        details: {
          desktopDogfoodHistoryEntry: desktopDogfoodHistoryEntry(run.id),
        },
        createdAt: "2026-06-05T00:00:31.500Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "workflow_jitter_release_profile",
        status: "passed",
        evidenceKey: "workflow-jitter-release-profile:2026-06-05",
        artifactPath: "test-results/workflow-jitter-release-gate/latest.json",
        notes: "Workflow jitter release-profile evidence passed with live GMI dogfood coverage.",
        details: {
          workflowJitterReleaseProfile: workflowJitterReleaseProfileReport(),
        },
        createdAt: "2026-06-05T00:00:31.750Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "live_pi_smoke",
        status: "passed",
        evidenceKey: `live-smoke:${run.id}`,
        runId: run.id,
        artifactPath: ".ambient/subagents/live-smoke.md",
        createdAt: "2026-06-05T00:00:32.000Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "restart_recovery",
        status: "passed",
        evidenceKey: "restart-recovery:2026-06-05",
        artifactPath: ".ambient/subagents/restart-recovery.md",
        createdAt: "2026-06-05T00:00:33.000Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "completion_guard_visibility",
        status: "passed",
        evidenceKey: "completion-guard-visibility:2026-06-05",
        artifactPath: "test-results/subagent-release-gate/latest.json",
        reviewer: "release-owner",
        details: {
          childInspector: true,
          parentBlockingIndicator: true,
          replayDiagnostics: true,
          diagnosticHistory: true,
        },
        createdAt: "2026-06-05T00:00:33.500Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "approval_routing_visibility",
        status: "passed",
        evidenceKey: "approval-routing-visibility:2026-06-05",
        artifactPath: "test-results/subagent-release-gate/latest.json",
        reviewer: "release-owner",
        details: {
          childRequestAttribution: true,
          scopedResponsePersistence: true,
          parentWaitResumption: true,
          nonInteractiveFailure: true,
          uiAndReplayVisibility: true,
        },
        createdAt: "2026-06-05T00:00:33.750Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "production_ui_visibility",
        status: "passed",
        evidenceKey: "production-ui-visibility:2026-06-05",
        artifactPath: "test-results/subagent-release-gate/latest.json",
        reviewer: "release-owner",
        details: {
          collapsedParentClusters: true,
          blockingChildIndicators: true,
          childInspectorRows: true,
          repairReplayPanels: true,
          localRuntimeOwnershipControls: true,
        },
        createdAt: "2026-06-05T00:00:33.812Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "event_attribution_integrity",
        status: "passed",
        evidenceKey: "event-attribution-integrity:2026-06-05",
        artifactPath: "test-results/subagent-release-gate/latest.json",
        reviewer: "release-owner",
        details: {
          runtimePreviewAttribution: true,
          parentMailboxAttribution: true,
          toolApprovalErrorProvenance: true,
          replayDiagnostics: true,
          largeOutputArtifactBacking: true,
        },
        createdAt: "2026-06-05T00:00:33.875Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "lifecycle_control_integrity",
        status: "passed",
        evidenceKey: "lifecycle-control-integrity:2026-06-05",
        artifactPath: "test-results/subagent-release-gate/latest.json",
        reviewer: "release-owner",
        details: {
          parentStopCascade: true,
          childCancelIsolation: true,
          closeCapacityRetention: true,
          lifecycleHookArtifacts: true,
          restartInterruptionRepair: true,
        },
        createdAt: "2026-06-05T00:00:33.937Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "retention_policy_integrity",
        status: "passed",
        evidenceKey: "retention-policy-integrity:2026-06-05",
        artifactPath: "test-results/subagent-release-gate/latest.json",
        reviewer: "release-owner",
        details: {
          closeDoesNotDelete: true,
          capCleanupOldestEligible: true,
          protectedChildrenRetained: true,
          summaryArtifactsRetained: true,
          retainedStateVisible: true,
        },
        createdAt: "2026-06-05T00:00:33.968Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "tool_scope_integrity",
        status: "passed",
        evidenceKey: "tool-scope-integrity:2026-06-05",
        artifactPath: "test-results/subagent-release-gate/latest.json",
        reviewer: "release-owner",
        details: {
          hardDenyPrecedence: true,
          roleTaskNarrowing: true,
          exactToolAndExtensionResolution: true,
          childFanoutDefaultBlocked: true,
          snapshotAndInspectorDiagnostics: true,
        },
        createdAt: "2026-06-05T00:00:33.984Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "lifecycle_bug_audit",
        status: "passed",
        evidenceKey: "lifecycle-bugs:2026-06-05",
        details: { p0: 0, p1: 0 },
        createdAt: "2026-06-05T00:00:34.000Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "permission_bug_audit",
        status: "passed",
        evidenceKey: "permission-bugs:2026-06-05",
        details: { p0: 0, p1: 0 },
        createdAt: "2026-06-05T00:00:35.000Z",
      });
      store.recordSubagentMaturityEvidence({
        kind: "security_review",
        status: "passed",
        evidenceKey: "security-review:2026-06-05",
        reviewer: "security",
        notes: "Threat-model regression coverage accepted.",
        createdAt: "2026-06-05T00:00:36.000Z",
      });

      expect(store.listSubagentMaturityEvidence("live_dogfood_run")).toEqual([
        expect.objectContaining({
          id: dogfood.id,
          kind: "live_dogfood_run",
          status: "passed",
          evidenceKey: `dogfood:${run.id}`,
          runId: run.id,
          parentRunId: "parent-run",
          notes: "Idempotent replay.",
        }),
      ]);
      expect(store.getSubagentMaturitySnapshot({
        createdAt: "2026-06-05T00:01:00.000Z",
        criteria: { minLiveDogfoodRuns: 1, minDesktopDogfoodRuns: 1 },
      })).toMatchObject({
        status: "ready_to_graduate",
        defaultCanBeEnabled: true,
        blockedGateIds: [],
        gates: expect.arrayContaining([
          expect.objectContaining({
            id: "live_dogfood_count",
            status: "passed",
            actual: "1 clean recorded.",
          }),
          expect.objectContaining({
            id: "live_dogfood_failure_rate",
            status: "passed",
            actual: "0/1 failed (0.0%).",
          }),
          expect.objectContaining({
            id: "live_smoke",
            status: "passed",
            actual: "Passed.",
          }),
          expect.objectContaining({
            id: "workflow_jitter_release_profile",
            status: "passed",
            actual: "10 live UI dogfood runs, 120 live prompt variants, 1000 deterministic stress units.",
          }),
          expect.objectContaining({
            id: "restart_recovery",
            status: "passed",
          }),
          expect.objectContaining({
            id: "completion_guard_visibility",
            status: "passed",
            actual: "Validated across child inspector, parent blocking indicators, replay diagnostics, and diagnostic history.",
          }),
          expect.objectContaining({
            id: "approval_routing_visibility",
            status: "passed",
            actual: "Validated child request attribution, scoped response persistence, parent wait resumption, non-interactive failure handling, and UI/replay visibility.",
          }),
          expect.objectContaining({
            id: "production_ui_visibility",
            status: "passed",
            actual: "Validated collapsed parent clusters, blocking-child indicators, child inspector rows, repair/replay panels, and local runtime ownership controls.",
          }),
          expect.objectContaining({
            id: "event_attribution_integrity",
            status: "passed",
            actual: "Validated runtime preview attribution, parent mailbox attribution, tool/approval/error provenance, replay diagnostics, and large-output artifact backing.",
          }),
          expect.objectContaining({
            id: "lifecycle_control_integrity",
            status: "passed",
            actual: "Validated parent-stop cascade, child-cancel isolation, close capacity/history retention, lifecycle hook artifacts, and restart interruption repair.",
          }),
          expect.objectContaining({
            id: "retention_policy_integrity",
            status: "passed",
            actual: "Validated close-without-delete, oldest-eligible cap cleanup, protected-child retention, summary/artifact durability, and retained-state UI.",
          }),
          expect.objectContaining({
            id: "tool_scope_integrity",
            status: "passed",
            actual: "Validated hard-deny precedence, role/task narrowing, exact tool/extension resolution, child fanout default blocking, and snapshot/inspector diagnostics.",
          }),
          expect.objectContaining({
            id: "security_review",
            status: "passed",
            detail: "Threat-model regression coverage accepted.",
          }),
        ]),
      });
      store.close();

      reopened.openWorkspace(workspacePath);
      expect(reopened.listSubagentMaturityEvidence().map((evidence) => evidence.kind)).toEqual([
        "live_dogfood_run",
        "desktop_dogfood_run",
        "workflow_jitter_release_profile",
        "live_pi_smoke",
        "restart_recovery",
        "completion_guard_visibility",
        "approval_routing_visibility",
        "production_ui_visibility",
        "event_attribution_integrity",
        "lifecycle_control_integrity",
        "retention_policy_integrity",
        "tool_scope_integrity",
        "lifecycle_bug_audit",
        "permission_bug_audit",
        "security_review",
      ]);
      expect(reopened.getSubagentMaturitySnapshot({
        createdAt: "2026-06-05T00:02:00.000Z",
        criteria: { minLiveDogfoodRuns: 1, minDesktopDogfoodRuns: 1 },
      }).defaultCanBeEnabled).toBe(true);
    } finally {
      store.close();
      reopened.close();
    }
  });

  it("counts clean required-live history rows instead of raw live dogfood evidence when both exist", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);

      for (let index = 0; index < 25; index += 1) {
        store.recordSubagentMaturityEvidence({
          kind: "live_dogfood_run",
          status: "passed",
          evidenceKey: `narrow-live-confidence:${index}`,
          artifactPath: `test-results/subagent-live-confidence/narrow-${index}.json`,
          notes: "Narrow per-slice live confidence evidence should not count as a clean required-live release gate run.",
          details: {
            schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
            evidenceType: "live_confidence_slice",
            sliceKind: "workflow_symphony",
            status: "passed",
          },
          createdAt: `2026-06-05T00:${String(index).padStart(2, "0")}:00.000Z`,
        });
      }
      store.recordSubagentMaturityEvidence({
        kind: "live_dogfood_run",
        status: "passed",
        evidenceKey: "required-live-history:clean-one",
        artifactPath: "test-results/subagent-release-gate/latest.json",
        details: {
          releaseGateHistoryEntry: releaseGateHistoryEntry("clean-one"),
        },
        createdAt: "2026-06-05T01:00:00.000Z",
      });

      const snapshot = store.getSubagentMaturitySnapshot({
        createdAt: "2026-06-05T01:01:00.000Z",
        criteria: { minLiveDogfoodRuns: 2 },
      });

      expect(snapshot.liveHistory).toMatchObject({
        requiredRunCount: 1,
        cleanRequiredRunCount: 1,
        failedRequiredRunCount: 0,
      });
      expect(snapshot.gates).toContainEqual(expect.objectContaining({
        id: "live_dogfood_count",
        status: "blocked",
        actual: "1 clean recorded.",
        detail: "Required-live history: 1 clean, 0 failed, 0 advisory, 0 skipped-evidence.",
      }));
    } finally {
      store.close();
    }
  });

  it("reconciles active sub-agent runs after restart", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: "parent-message",
        title: "Explorer child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(run.id, "running", {
        now: "2026-06-05T00:00:10.000Z",
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [run.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        timeoutMs: 30_000,
        createdAt: "2026-06-05T00:00:11.000Z",
      });

      const summary = store.reconcileSubagentRestartState({
        now: "2026-06-05T00:00:30.000Z",
      });

      expect(summary).toMatchObject({
        repairedRunIds: [run.id],
        repairedBarrierIds: [barrier.id],
      });
      expect(summary.issues.map((issue) => issue.kind)).toContain("active_run_interrupted");
      expect(store.getSubagentRun(run.id)).toMatchObject({
        status: "needs_attention",
      });
      expect(store.getSubagentRun(run.id).completedAt).toBeUndefined();
      expect(store.getSubagentRun(run.id).resultArtifact).toBeUndefined();
      expect(store.getThread(run.childThreadId).childStatus).toBe("needs_attention");
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        status: "waiting_on_children",
        childRunIds: [run.id],
      });
      expect(store.getSubagentWaitBarrier(barrier.id).resolvedAt).toBeUndefined();
      expect(store.getSubagentWaitBarrier(barrier.id).resolutionArtifact).toBeUndefined();
      expect(store.listSubagentRunEvents(run.id).map((event) => event.type)).toEqual([
        "subagent.reserved",
        "subagent.lifecycle_started",
        "subagent.status_changed",
        "subagent.status_changed",
        "subagent.restart_reconciled",
      ]);
      expect(store.listSubagentParentMailboxEventsForParentRun("parent-run")).toEqual([
        expect.objectContaining({
          parentMessageId: "parent-message",
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            parentMessageId: "parent-message",
            childRunId: run.id,
            childThreadId: run.childThreadId,
            previousStatus: "running",
            status: "needs_attention",
            source: "desktop_restart",
            waitBarrierIds: [barrier.id],
          }),
        }),
      ]);

      const replay = store.reconcileSubagentRestartState({
        now: "2026-06-05T00:00:45.000Z",
      });
      expect(replay.repairedRunIds).toEqual([]);
      expect(replay.repairedBarrierIds).toEqual([]);
      expect(store.listSubagentRunEvents(run.id).filter((event) => event.type === "subagent.restart_reconciled")).toHaveLength(1);
      expect(store.listSubagentParentMailboxEventsForParentRun("parent-run")).toHaveLength(1);
      expect(store.getSubagentRun(run.id).resultArtifact).toBeUndefined();

      expect(() =>
        store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          parentMessageId: "parent-message",
          title: "Duplicate explorer child",
          roleId: "explorer",
          canonicalTaskPath: "root/0:explorer",
          featureFlagSnapshot: enabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:45.000Z"),
          dependencyMode: "required",
        })
      ).toThrow(`Sub-agent canonical task path root/0:explorer is already owned by child run ${run.id}.`);
      expect(store.listSubagentRunsForParentThread(parent.id)
        .filter((item) => item.canonicalTaskPath === "root/0:explorer")
        .map((item) => item.id)).toEqual([run.id]);
    } finally {
      store.close();
    }
  });

  it("recreates missing required wait barriers for interrupted reserved children after restart", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: "parent-message",
        title: "Explorer child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      expect(store.listSubagentWaitBarriersForParentRun("parent-run")).toEqual([]);

      const summary = store.reconcileSubagentRestartState({
        now: "2026-06-05T00:00:30.000Z",
      });

      const recreatedBarrier = store.listSubagentWaitBarriersForParentRun("parent-run")[0];
      expect(recreatedBarrier).toMatchObject({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [run.id],
        dependencyMode: "required_all",
        failurePolicy: "degrade_partial",
        timeoutMs: 600_000,
        status: "waiting_on_children",
        resolvedAt: undefined,
        resolutionArtifact: undefined,
      });
      expect(summary).toMatchObject({
        repairedRunIds: [run.id],
        repairedBarrierIds: [recreatedBarrier.id],
      });
      expect(store.getSubagentRun(run.id)).toMatchObject({
        status: "needs_attention",
        completedAt: undefined,
        resultArtifact: undefined,
      });
      expect(store.listSubagentRunEvents(run.id).at(-1)).toMatchObject({
        type: "subagent.restart_reconciled",
        preview: expect.objectContaining({
          previousStatus: "reserved",
          status: "needs_attention",
          parentBlockingState: "needs_reconciliation",
          waitBarrierIds: [recreatedBarrier.id],
          recreatedWaitBarrier: expect.objectContaining({
            id: recreatedBarrier.id,
            dependencyMode: "required_all",
            failurePolicy: "degrade_partial",
            timeoutMs: 600_000,
          }),
        }),
      });
      expect(store.listSubagentParentMailboxEventsForParentRun("parent-run")).toEqual([
        expect.objectContaining({
          parentMessageId: "parent-message",
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            childRunId: run.id,
            source: "desktop_restart",
            waitBarrierIds: [recreatedBarrier.id],
          }),
        }),
      ]);
      expect(() =>
        store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          parentMessageId: "parent-message",
          title: "Duplicate explorer child",
          roleId: "explorer",
          canonicalTaskPath: "root/0:explorer",
          featureFlagSnapshot: enabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:45.000Z"),
          dependencyMode: "required",
        })
      ).toThrow(`Sub-agent canonical task path root/0:explorer is already owned by child run ${run.id}.`);

      const replay = store.reconcileSubagentRestartState({
        now: "2026-06-05T00:00:45.000Z",
      });
      expect(replay.repairedRunIds).toEqual([]);
      expect(replay.repairedBarrierIds).toEqual([]);
      expect(store.listSubagentWaitBarriersForParentRun("parent-run").map((barrier) => barrier.id)).toEqual([recreatedBarrier.id]);
      expect(store.listSubagentParentMailboxEventsForParentRun("parent-run")).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("reconciles persisted parent-cancel barrier controls idempotently after restart", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Cancelled child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(child.id, "cancelled", {
        now: "2026-06-05T00:00:10.000Z",
        resultArtifact: batchArtifact(child.id, "cancelled", child.childThreadId),
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        createdAt: "2026-06-05T00:00:11.000Z",
      });
      store.updateSubagentWaitBarrierStatus(barrier.id, "cancelled", {
        now: "2026-06-05T00:00:12.000Z",
        resolutionArtifact: waitBarrierResolutionArtifact({
          childRunIds: [child.id],
          childStatuses: [{ childRunId: child.id, status: "cancelled" }],
          synthesisAllowed: false,
          transitionKind: "child_cancelled",
          transitionSource: "barrier_controller",
          reason: "Stop the parent task.",
          extra: {
            parentCancellationRequested: true,
            userDecision: {
              schemaVersion: "ambient-subagent-user-decision-v1",
              decision: "cancel_parent",
              userDecision: "Stop the parent task.",
              decidedAt: "2026-06-05T00:00:12.000Z",
              idempotencyKey: "barrier:cancel-parent",
            },
          },
        }),
      });

      const summary = store.reconcileSubagentRestartState({
        now: "2026-06-05T00:00:30.000Z",
      });

      expect(summary.repairedRunIds).toEqual([]);
      expect(summary.repairedBarrierIds).toEqual([]);
      expect(summary.repairedParentControlBarrierIds).toEqual([barrier.id]);
      expect(summary.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: "parent_cancel_control_unreconciled",
          barrierId: barrier.id,
          parentRunId: parentRun.id,
        }),
      ]));
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        status: "cancelled",
        resolvedAt: "2026-06-05T00:00:12.000Z",
        resolutionArtifact: expect.objectContaining({
          parentCancellationRequested: true,
          parentControlReconciledAt: "2026-06-05T00:00:30.000Z",
          parentControlReconciledSource: "desktop_restart",
          parentControlReconciliation: expect.objectContaining({
            schemaVersion: "ambient-subagent-parent-control-reconciliation-v1",
            action: "cancel_parent",
            source: "desktop_restart",
            reconciledAt: "2026-06-05T00:00:30.000Z",
            waitBarrierId: barrier.id,
            parentThreadId: parent.id,
            parentRunId: parentRun.id,
            barrierStatus: "cancelled",
            childRunIds: [child.id],
            parentCancellationRequested: true,
            idempotencyKey: `parent-control-reconcile:desktop_restart:${barrier.id}`,
          }),
          synthesisAllowed: false,
        }),
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          parentMessageId: assistant.id,
          type: "subagent.parent_control_reconciled",
          idempotencyKey: `desktop_restart_parent_control:${barrier.id}`,
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-parent-control-reconciled-v1",
            waitBarrierId: barrier.id,
            action: "cancel_parent",
            source: "desktop_restart",
            synthesisAllowed: false,
          }),
        }),
      ]);
      expect(store.getSubagentObservabilitySummary({ parentRunId: parentRun.id })).toMatchObject({
        restartReconciliations: 1,
      });

      const replay = store.reconcileSubagentRestartState({
        now: "2026-06-05T00:00:45.000Z",
      });
      expect(replay.repairedParentControlBarrierIds).toEqual([]);
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("repairs missing and mismatched spawn edges while pruning dangling edges", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });
    const disabledFlags = resolveAmbientFeatureFlags({
      generatedAt: "2026-06-05T00:00:35.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const missingEdge = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Missing edge child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(missingEdge.id, "completed", {
        now: "2026-06-05T00:00:10.000Z",
        resultArtifact: batchArtifact(missingEdge.id, "completed", missingEdge.childThreadId),
      });
      const mismatchedEdge = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Mismatched edge child",
        roleId: "reviewer",
        canonicalTaskPath: "root/1:reviewer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(mismatchedEdge.id, "completed", {
        now: "2026-06-05T00:00:11.000Z",
        resultArtifact: batchArtifact(mismatchedEdge.id, "completed", mismatchedEdge.childThreadId),
      });
      store.closeSubagentRun(mismatchedEdge.id, "2026-06-05T00:00:12.000Z");
      const db = (store as unknown as { requireDb(): { prepare(sql: string): { run(...values: unknown[]): unknown } } }).requireDb();
      db
        .prepare("DELETE FROM subagent_spawn_edges WHERE child_run_id = ?")
        .run(missingEdge.id);
      db
        .prepare("UPDATE subagent_spawn_edges SET status = ?, canonical_task_path = ?, capacity_released_at = NULL WHERE child_run_id = ?")
        .run("running", "root/wrong:reviewer", mismatchedEdge.id);
      db.prepare("PRAGMA foreign_keys = OFF").run();
      try {
        db
          .prepare(
            `INSERT INTO subagent_spawn_edges
             (parent_run_id, child_run_id, parent_thread_id, child_thread_id, canonical_task_path, depth, status, capacity_released_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            "parent-run",
            "missing-run",
            parent.id,
            "dangling-child",
            "root/9:missing",
            1,
            "reserved",
            null,
            "2026-06-05T00:00:00.000Z",
            "2026-06-05T00:00:00.000Z",
          );
      } finally {
        db.prepare("PRAGMA foreign_keys = ON").run();
      }

      const summary = store.reconcileSubagentRestartState({
        now: "2026-06-05T00:00:30.000Z",
      });

      expect(summary.repairedRunIds).toEqual([]);
      expect(summary.repairedBarrierIds).toEqual([]);
      expect(summary.repairableSpawnEdgeRunIds).toEqual([missingEdge.id, mismatchedEdge.id]);
      expect(summary.danglingSpawnEdgeRunIds).toEqual(["missing-run"]);
      expect(summary.diagnosticRunIds).toEqual([missingEdge.id, mismatchedEdge.id]);
      expect(summary.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: "missing_spawn_edge",
          runId: missingEdge.id,
        }),
        expect.objectContaining({
          kind: "spawn_edge_mismatch",
          runId: mismatchedEdge.id,
          message: expect.stringContaining("edge status running does not match run status completed"),
        }),
        expect.objectContaining({
          kind: "dangling_spawn_edge",
          runId: "missing-run",
        }),
      ]));
      expect(store.getSubagentRun(missingEdge.id).status).toBe("completed");
      expect(store.getSubagentRun(mismatchedEdge.id).status).toBe("completed");
      expect(store.listSubagentRunEvents(missingEdge.id).at(-1)).toMatchObject({
        type: "subagent.restart_diagnostic",
        preview: expect.objectContaining({
          schemaVersion: "ambient-subagent-restart-diagnostic-v1",
          issueCount: 1,
          issues: [expect.objectContaining({ kind: "missing_spawn_edge" })],
        }),
      });
      expect(store.listSubagentRunEvents(mismatchedEdge.id).at(-1)).toMatchObject({
        type: "subagent.restart_diagnostic",
        preview: expect.objectContaining({
          issues: [expect.objectContaining({ kind: "spawn_edge_mismatch" })],
        }),
      });

      const missingRepairEventsBefore = store.listSubagentRunEvents(missingEdge.id)
        .filter((event) => event.type === "subagent.spawn_edge_repaired");
      const mismatchedRepairEventsBefore = store.listSubagentRunEvents(mismatchedEdge.id)
        .filter((event) => event.type === "subagent.spawn_edge_repaired");
      const dryRun = store.repairSubagentSpawnEdges({
        now: "2026-06-05T00:00:35.000Z",
        dryRun: true,
      });
      expect(dryRun).toMatchObject({
        schemaVersion: "ambient-subagent-persisted-child-tree-repair-v1",
        createdAt: "2026-06-05T00:00:35.000Z",
        dryRun: true,
        requestedActions: [
          "reconstruct_missing_spawn_edge",
          "realign_spawn_edge",
          "prune_dangling_spawn_edge",
        ],
        beforeIssueCount: 3,
        reconstructedMissingSpawnEdgeRunIds: [missingEdge.id],
        realignedSpawnEdgeRunIds: [mismatchedEdge.id],
        prunedDanglingSpawnEdgeRunIds: ["missing-run"],
        skippedIssueIds: [],
      });
      expect(dryRun).not.toHaveProperty("afterIssueCount");
      expect(dryRun).not.toHaveProperty("remainingIssues");
      expect(store.listSubagentRunEvents(missingEdge.id).filter((event) => event.type === "subagent.spawn_edge_repaired")).toEqual(missingRepairEventsBefore);
      expect(store.listSubagentRunEvents(mismatchedEdge.id).filter((event) => event.type === "subagent.spawn_edge_repaired")).toEqual(mismatchedRepairEventsBefore);

      const disabledRepair = store.repairSubagentSpawnEdges({
        now: "2026-06-05T00:00:37.000Z",
        featureFlagSnapshot: disabledFlags,
      });
      expect(disabledRepair).toMatchObject({
        schemaVersion: "ambient-subagent-persisted-child-tree-repair-v1",
        createdAt: "2026-06-05T00:00:37.000Z",
        dryRun: false,
        skipped: true,
        skipReason: "ambient_subagents_disabled",
        requestedActions: [
          "reconstruct_missing_spawn_edge",
          "realign_spawn_edge",
          "prune_dangling_spawn_edge",
        ],
        beforeIssueCount: 3,
        reconstructedMissingSpawnEdgeRunIds: [missingEdge.id],
        realignedSpawnEdgeRunIds: [mismatchedEdge.id],
        prunedDanglingSpawnEdgeRunIds: ["missing-run"],
        skippedIssueIds: [],
        featureFlagSnapshot: expect.objectContaining({
          flags: expect.objectContaining({
            "ambient.subagents": expect.objectContaining({ enabled: false }),
          }),
        }),
      });
      expect(disabledRepair).not.toHaveProperty("afterIssueCount");
      expect(disabledRepair).not.toHaveProperty("remainingIssues");
      const edgesAfterDisabledRepair = new Map(store.listSubagentSpawnEdges().map((edge) => [edge.childRunId, edge]));
      expect(edgesAfterDisabledRepair.has(missingEdge.id)).toBe(false);
      expect(edgesAfterDisabledRepair.get(mismatchedEdge.id)).toMatchObject({
        canonicalTaskPath: "root/wrong:reviewer",
        status: "running",
        capacityReleasedAt: undefined,
      });
      expect(edgesAfterDisabledRepair.has("missing-run")).toBe(true);
      expect(store.listSubagentRunEvents(missingEdge.id).filter((event) => event.type === "subagent.spawn_edge_repaired")).toEqual(missingRepairEventsBefore);
      expect(store.listSubagentRunEvents(mismatchedEdge.id).filter((event) => event.type === "subagent.spawn_edge_repaired")).toEqual(mismatchedRepairEventsBefore);

      const repair = store.repairSubagentSpawnEdges({
        now: "2026-06-05T00:00:40.000Z",
        featureFlagSnapshot: enabledFlags,
      });
      expect(repair).toMatchObject({
        schemaVersion: "ambient-subagent-persisted-child-tree-repair-v1",
        createdAt: "2026-06-05T00:00:40.000Z",
        dryRun: false,
        requestedActions: [
          "reconstruct_missing_spawn_edge",
          "realign_spawn_edge",
          "prune_dangling_spawn_edge",
        ],
        beforeIssueCount: 3,
        afterIssueCount: 0,
        reconstructedMissingSpawnEdgeRunIds: [missingEdge.id],
        realignedSpawnEdgeRunIds: [mismatchedEdge.id],
        prunedDanglingSpawnEdgeRunIds: ["missing-run"],
        skippedIssueIds: [],
        remainingIssues: [],
      });
      const repairedEdges = new Map(store.listSubagentSpawnEdges().map((edge) => [edge.childRunId, edge]));
      expect(repairedEdges.get(missingEdge.id)).toMatchObject({
        parentRunId: "parent-run",
        parentThreadId: parent.id,
        childThreadId: missingEdge.childThreadId,
        canonicalTaskPath: "root/0:explorer",
        status: "completed",
        capacityReleasedAt: undefined,
      });
      expect(repairedEdges.get(mismatchedEdge.id)).toMatchObject({
        parentRunId: "parent-run",
        parentThreadId: parent.id,
        childThreadId: mismatchedEdge.childThreadId,
        canonicalTaskPath: "root/1:reviewer",
        status: "completed",
        capacityReleasedAt: "2026-06-05T00:00:12.000Z",
      });
      expect(repairedEdges.has("missing-run")).toBe(false);
      expect(store.listSubagentRunEvents(missingEdge.id).filter((event) => event.type === "subagent.spawn_edge_repaired")).toEqual([
        expect.objectContaining({
          preview: expect.objectContaining({
            schemaVersion: "ambient-subagent-spawn-edge-repair-v1",
            action: "reconstruct_missing_spawn_edge",
            childRunId: missingEdge.id,
          }),
        }),
      ]);
      expect(store.listSubagentRunEvents(mismatchedEdge.id).filter((event) => event.type === "subagent.spawn_edge_repaired")).toEqual([
        expect.objectContaining({
          preview: expect.objectContaining({
            schemaVersion: "ambient-subagent-spawn-edge-repair-v1",
            action: "realign_spawn_edge",
            childRunId: mismatchedEdge.id,
            previousEdge: expect.objectContaining({
              canonicalTaskPath: "root/wrong:reviewer",
              status: "running",
            }),
          }),
        }),
      ]);

      const secondRepair = store.repairSubagentSpawnEdges({
        now: "2026-06-05T00:00:45.000Z",
        featureFlagSnapshot: enabledFlags,
      });
      expect(secondRepair).toMatchObject({
        dryRun: false,
        requestedActions: [],
        beforeIssueCount: 0,
        afterIssueCount: 0,
        reconstructedMissingSpawnEdgeRunIds: [],
        realignedSpawnEdgeRunIds: [],
        prunedDanglingSpawnEdgeRunIds: [],
        skippedIssueIds: [],
        remainingIssues: [],
      });
      expect(store.listSubagentRunEvents(missingEdge.id).filter((event) => event.type === "subagent.spawn_edge_repaired")).toHaveLength(1);
      expect(store.listSubagentRunEvents(mismatchedEdge.id).filter((event) => event.type === "subagent.spawn_edge_repaired")).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("builds bounded read-only sub-agent repair diagnostics from persisted state", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Completed without artifact",
        roleId: "reviewer",
        canonicalTaskPath: "root/0:reviewer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(run.id, "completed", {
        now: "2026-06-05T00:00:10.000Z",
      });
      const eventCountBefore = store.listSubagentRunEvents(run.id).length;

      const report = store.getSubagentRepairDiagnostics({
        now: "2026-06-05T00:00:30.000Z",
        maxIssues: 1,
        maxMessageChars: 80,
      });

      expect(report).toMatchObject({
        schemaVersion: "ambient-subagent-repair-diagnostics-v1",
        createdAt: "2026-06-05T00:00:30.000Z",
        issueCount: 1,
        shownIssueCount: 1,
        truncatedIssues: false,
        warningCount: 1,
        actionCounts: {
          inspect_result_artifact: 1,
        },
        affectedRunIds: [run.id],
        affectedThreadIds: [run.childThreadId],
      });
      expect(report.issues).toEqual([
        expect.objectContaining({
          kind: "missing_result_artifact",
          action: "inspect_result_artifact",
          destructive: false,
          runId: run.id,
          threadId: run.childThreadId,
        }),
      ]);
      expect(store.getSubagentRun(run.id).status).toBe("completed");
      expect(store.listSubagentRunEvents(run.id)).toHaveLength(eventCountBefore);
    } finally {
      store.close();
    }
  });

  it("reports malformed persisted model and lease snapshots without crashing diagnostics", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Corrupted snapshot child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
      });
      const db = (store as unknown as { requireDb(): { prepare(sql: string): { run(...values: unknown[]): unknown } } }).requireDb();
      db.prepare("UPDATE subagent_runs SET model_runtime_snapshot_json = ?, capacity_lease_snapshot_json = ? WHERE id = ?")
        .run("null", "null", run.id);

      const report = store.getSubagentRepairDiagnostics({
        now: "2026-06-05T00:00:30.000Z",
      });

      expect(report.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: "missing_model_runtime_snapshot",
          action: "inspect_run_snapshot",
          runId: run.id,
        }),
        expect.objectContaining({
          kind: "missing_capacity_lease",
          action: "inspect_run_snapshot",
          runId: run.id,
        }),
      ]));
      expect(report.diagnosticRunIds).toContain(run.id);
    } finally {
      store.close();
    }
  });

  it("rolls persisted sub-agent lifecycle records into observability summaries", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Explorer child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(run.id, "reserved", {
        now: "2026-06-05T00:00:30.000Z",
      });
      const attentionRun = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Explorer needs attention",
        roleId: "explorer",
        canonicalTaskPath: "root/1:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(attentionRun.id, "needs_attention", {
        now: "2026-06-05T00:00:45.000Z",
      });
      store.appendSubagentRunEvent(attentionRun.id, {
        type: "subagent.needs_attention",
        preview: { summary: "Needs a parent decision." },
        createdAt: "2026-06-05T00:00:45.000Z",
      });
      store.recordSubagentToolScopeSnapshot(run.id, {
        scope: {
          schemaVersion: "ambient-subagent-tool-scope-v1",
          loadedCategories: ["workspace.read"],
          piVisibleCategories: ["workspace.read"],
          deniedCategories: [
            { id: "workspace.write", reason: "Mutating child requires an isolated worktree." },
            { id: "subagent.spawn", reason: "Nested fanout disabled." },
          ],
          loadedTools: [{
            source: "built_in",
            id: "workspace.read",
            categoryId: "workspace.read",
            piVisible: true,
            mutatesState: false,
            requiresApproval: false,
          }],
          piVisibleTools: [{
            source: "built_in",
            id: "workspace.read",
            categoryId: "workspace.read",
            piVisible: true,
            mutatesState: false,
            requiresApproval: false,
          }],
          deniedTools: [
            {
              source: "built_in",
              id: "workspace.write",
              categoryId: "workspace.write",
              reason: "Mutating child requires an isolated worktree.",
            },
            {
              source: "fanout",
              id: "subagent.spawn",
              categoryId: "subagent.spawn",
              reason: "Nested fanout disabled.",
            },
          ],
          approvalMode: "interactive",
          worktreeIsolated: false,
          fanoutAvailable: false,
        },
        createdAt: "2026-06-05T00:00:05.000Z",
      });
      store.appendSubagentRunEvent(run.id, {
        type: "subagent.spawn_failed",
        preview: { reason: "provider capacity unavailable" },
        createdAt: "2026-06-05T00:00:06.000Z",
      });
      store.appendSubagentRunEvent(run.id, {
        type: "subagent.runtime_event",
        preview: {
          schemaVersion: "ambient-subagent-runtime-event-v1",
          type: "usage",
          source: "child_runtime",
          runId: run.id,
          parentThreadId: run.parentThreadId,
          parentRunId: run.parentRunId,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          createdAt: "2026-06-05T00:00:07.000Z",
          tokenCount: 144,
          costMicros: 42,
          localMemoryBytes: 1024,
        },
        createdAt: "2026-06-05T00:00:07.000Z",
      });
      store.appendSubagentRunEvent(run.id, {
        type: "subagent.restart_reconciled",
        preview: { reason: "desktop_restart" },
        createdAt: "2026-06-05T00:00:08.000Z",
      });
      const satisfied = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [run.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        createdAt: "2026-06-05T00:00:10.000Z",
      });
      store.updateSubagentWaitBarrierStatus(satisfied.id, "satisfied", {
        now: "2026-06-05T00:00:14.000Z",
        resolutionArtifact: waitBarrierResolutionArtifact({
          childRunIds: [run.id],
          synthesisAllowed: true,
          transitionKind: "child_terminal",
          reason: "completed",
        }),
      });
      const cancelled = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [run.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        createdAt: "2026-06-05T00:00:20.000Z",
      });
      store.updateSubagentWaitBarrierStatus(cancelled.id, "cancelled", {
        now: "2026-06-05T00:00:23.000Z",
        resolutionArtifact: waitBarrierResolutionArtifact({
          childRunIds: [run.id],
          childStatuses: [{ childRunId: run.id, status: "cancelled" }],
          synthesisAllowed: false,
          transitionKind: "child_cancelled",
          transitionSource: "barrier_controller",
          reason: "cancelled",
        }),
      });
      store.upsertSubagentGroupedCompletionNotification({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        child: {
          runId: run.id,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          roleId: run.roleId,
          status: "completed",
          summary: "Done",
        },
        createdAt: "2026-06-05T00:00:25.000Z",
      });
      const batch = upsertBatchJobPlan(store, batchPlan(parent.id));
      store.applySubagentBatchResultReport(createSubagentBatchResultReport({
        plan: batch.plan,
        item: batch.plan.items[0],
        childRunId: "child-run-lint",
        status: "completed",
        summary: "Lint batch item completed.",
        createdAt: "2026-06-05T00:00:35.000Z",
        resultArtifact: batchArtifact("child-run-lint", "completed"),
      }));

      expect(store.getSubagentObservabilitySummary({
        parentRunId: "parent-run",
        createdAt: "2026-06-05T00:01:00.000Z",
      })).toMatchObject({
        schemaVersion: "ambient-subagent-observability-summary-v1",
        createdAt: "2026-06-05T00:01:00.000Z",
        spawnAttempts: 2,
        failedSpawns: 1,
        waitDurations: {
          count: 2,
          totalMs: 7000,
          maxMs: 4000,
        },
        cancellationCascades: 1,
        toolDenials: {
          count: 2,
          byCategory: {
            "workspace.write": 1,
            "subagent.spawn": 1,
          },
        },
        usage: {
          tokenCount: 144,
          costMicros: 42,
        },
        localMemory: {
          eventCount: 1,
          peakBytes: 1024,
        },
        childIdle: {
          openRunCount: 2,
          totalMs: 45000,
          maxMs: 30000,
        },
        groupedCompletions: 1,
        batchProgress: {
          notificationCount: 1,
          jobCount: 1,
          itemCount: 2,
          acceptedReportCount: 1,
          pendingItemCount: 1,
          completedJobCount: 0,
        },
        needsAttentionRequests: 1,
        restartReconciliations: 1,
        statusCounts: {
          reserved: 1,
          needs_attention: 1,
        },
      });
    } finally {
      store.close();
    }
  });

  it("persists parent mailbox parent-message anchors for pre-run spawn failures", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const reopened = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const message = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const event = store.appendSubagentParentMailboxEvent({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: message.id,
        type: "subagent.spawn_failed",
        payload: {
          schemaVersion: "ambient-subagent-spawn-failure-v1",
          failureStage: "model_scope",
          reason: "Model denied before child creation.",
        },
        idempotencyKey: "spawn:pre-run-denied",
        createdAt: "2026-06-05T00:00:00.000Z",
      });
      const replay = store.appendSubagentParentMailboxEvent({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: message.id,
        type: "subagent.spawn_failed",
        payload: { replay: true },
        idempotencyKey: "spawn:pre-run-denied",
        createdAt: "2026-06-05T00:00:01.000Z",
      });

      expect(replay.id).toBe(event.id);
      expect(store.listSubagentParentMailboxEventsForParentRun("parent-run")).toEqual([
        expect.objectContaining({
          id: event.id,
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          parentMessageId: message.id,
          type: "subagent.spawn_failed",
          deliveryState: "queued",
        }),
      ]);
      expect(store.listSubagentParentMailboxEventsForParentThread(parent.id).map((item) => item.id)).toEqual([event.id]);

      store.close();
      reopened.openWorkspace(workspacePath);
      expect(reopened.listSubagentParentMailboxEventsForParentThread(parent.id)).toEqual([
        expect.objectContaining({
          id: event.id,
          parentMessageId: message.id,
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-spawn-failure-v1",
            reason: "Model denied before child creation.",
          }),
        }),
      ]);
    } finally {
      store.close();
      reopened.close();
    }
  });

  it("rejects persisted child runtime and parent mailbox events without exact child attribution", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const enabledFlags = resolveAmbientFeatureFlags({
        startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
        generatedAt: "2026-06-05T00:00:00.000Z",
      });
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: assistant.id,
        title: "Attributed child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });

      expect(() => store.appendSubagentRunEvent(run.id, {
        type: "subagent.runtime_event",
        preview: {
          schemaVersion: "ambient-subagent-runtime-event-v1",
          type: "tool_call",
          source: "child_runtime",
          runId: "other-child",
          parentThreadId: run.parentThreadId,
          parentRunId: run.parentRunId,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          createdAt: "2026-06-05T00:00:01.000Z",
        },
        createdAt: "2026-06-05T00:00:01.000Z",
      })).toThrow(`Sub-agent runtime event runId other-child does not match persisted child run ${run.id}`);

      const runtimeEvent = store.appendSubagentRunEvent(run.id, {
        type: "subagent.runtime_event",
        preview: {
          schemaVersion: "ambient-subagent-runtime-event-v1",
          type: "error",
          source: "child_runtime",
          runId: run.id,
          parentThreadId: run.parentThreadId,
          parentRunId: run.parentRunId,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          createdAt: "2026-06-05T00:00:02.000Z",
          message: "Child runtime failed before completion.",
        },
        createdAt: "2026-06-05T00:00:02.000Z",
      });
      expect(runtimeEvent.preview).toMatchObject({
        runId: run.id,
        parentThreadId: run.parentThreadId,
        parentRunId: run.parentRunId,
        childThreadId: run.childThreadId,
        canonicalTaskPath: run.canonicalTaskPath,
      });

      expect(() => store.appendSubagentParentMailboxEvent({
        parentThreadId: parent.id,
        parentRunId: run.parentRunId,
        parentMessageId: assistant.id,
        type: "subagent.lifecycle_interrupted",
        payload: {
          schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
          parentRunId: run.parentRunId,
          status: "failed",
        },
        createdAt: "2026-06-05T00:00:03.000Z",
      })).toThrow("Sub-agent parent mailbox event subagent.lifecycle_interrupted must identify at least one originating child run");

      const parentMailboxEvent = store.appendSubagentParentMailboxEvent({
        parentThreadId: parent.id,
        parentRunId: run.parentRunId,
        parentMessageId: assistant.id,
        type: "subagent.lifecycle_interrupted",
        payload: {
          schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
          parentRunId: run.parentRunId,
          childRunId: run.id,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          status: "failed",
          reason: "Child runtime failed before completion.",
        },
        createdAt: "2026-06-05T00:00:04.000Z",
      });
      expect(parentMailboxEvent.payload).toMatchObject({
        childRunId: run.id,
        childThreadId: run.childThreadId,
      });
    } finally {
      store.close();
    }
  });
});

function releaseGateHistoryEntry(runId: string) {
  return {
    schemaVersion: "ambient-subagent-release-gate-live-history-v1",
    runId: `release-gate:${runId}`,
    reportPath: "test-results/subagent-release-gate/latest.json",
    status: "passed",
    ready: true,
    liveRequired: true,
    startedAt: "2026-06-05T00:00:20.000Z",
    completedAt: "2026-06-05T00:00:31.000Z",
    durationMs: 11_000,
    checkCounts: { passed: 113 },
    liveEvidence: Object.fromEntries(SUBAGENT_LIVE_EVIDENCE_LABELS.map((label) => [label, "present"])),
    skippedLiveEvidence: [],
    blockingIssueCount: 0,
    advisoryIssueCount: 0,
  };
}

function desktopDogfoodHistoryEntry(runId: string) {
  return {
    schemaVersion: "ambient-subagent-desktop-dogfood-history-v1",
    runId: `desktop-dogfood:${runId}`,
    reportPath: "test-results/subagent-desktop-dogfood/latest.json",
    status: "passed",
    classification: "passed",
    ready: true,
    generatedAt: "2026-06-05T00:00:31.500Z",
    provider: "gmi-cloud",
    featureFlag: "ambient.subagents",
    scenarioCount: 14,
    scenarios: [
      "seeded_visible_child_cluster",
      "approval_parent_blocking",
      "workflow_high_load_dogfood",
    ],
    requiredScenarioMissing: [],
    visualAssertionSummary: { requiredCount: 10, passedCount: 10, failedCount: 0, missingCount: 0 },
    maturityAssertionSummary: { requiredCount: 13, passedCount: 13, failedCount: 0, missingCount: 0 },
    screenshotCount: 12,
    criticalOverlapCount: 0,
    horizontalOverflowFree: true,
    workflowHighLoadPatternCount: 6,
    blockingIssueCount: 0,
    advisoryIssueCount: 0,
  };
}

function workflowJitterReleaseProfileReport() {
  return {
    schemaVersion: 1,
    status: "passed",
    generatedAt: "2026-06-05T00:40:00.000Z",
    matrixReportPath: "test-results/workflow-jitter-matrix/latest.json",
    releaseDecision: {
      ready: true,
      liveRequired: true,
      releaseProfile: true,
      liveSkipped: false,
      blockingIssues: [],
      advisoryIssues: [],
      nextSlice: "Workflow jitter release profile is green.",
    },
    matrix: {
      profile: "release",
      deterministicStressUnitCount: 1000,
      livePromptVariantCount: 120,
      liveDogfoodRunCount: 10,
      liveFamilies: ["browser", "connector", "document", "local", "model-only", "recovery"],
      productOrTestFailureCount: 0,
      providerDegradedCount: 0,
      environmentSkippedCount: 0,
      promotionCandidateCount: 0,
    },
    checks: [
      { id: "matrix.release-profile", status: "pass" },
    ],
  };
}

function installedProvider(input: {
  providerId: string;
  modelId: string;
}): ModelRuntimeInstalledProvider {
  const passedProbeIds = [
    "streaming",
    "context_window",
    "structured_json",
    "schema_output",
    "tool_use",
    "latency",
    "error_shape",
    "reliability",
  ] as const;
  return {
    schemaVersion: "ambient-model-runtime-installed-provider-v1",
    source: "settings-provider-onboarding",
    templateId: "generic-openai-compatible",
    enabled: true,
    installedAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    provider: {
      id: input.providerId,
      label: "Customer Router",
      locality: "cloud",
      secretRequirement: "user-secret",
      supportsStreaming: true,
      supportsTools: true,
      notes: ["Configured with authorization=sk-test-secret-12345678."],
    },
    profile: {
      schemaVersion: "ambient-model-runtime-profile-v1",
      profileId: `${input.providerId}:${input.modelId}`,
      providerId: input.providerId,
      modelId: input.modelId,
      label: input.modelId,
      selectableAsMain: true,
      selectableAsSubagent: true,
      available: true,
      contextWindowTokens: 128_000,
      supportsStreaming: true,
      toolUse: "ambient-tools",
      structuredOutput: "schema",
      supportsVision: false,
      supportsAudio: false,
      locality: "cloud",
      costClass: "metered",
      trustClass: "user-configured",
      privacyLabel: "User configured cloud provider",
      memoryClass: "remote",
      providerQuirks: ["Configured through Settings provider onboarding."],
    },
    secretRef: {
      schemaVersion: "ambient-model-runtime-installed-provider-secret-ref-v1",
      flow: "ambient_cli_secret_request",
      configured: true,
      label: "Desktop secret request",
    },
    probeReport: {
      schemaVersion: "ambient-model-provider-capability-probe-v1",
      templateId: "generic-openai-compatible",
      providerId: input.providerId,
      modelId: input.modelId,
      generatedAt: "2026-06-06T00:00:00.000Z",
      observations: passedProbeIds.map((probeId) => ({
        probeId,
        status: "passed",
        measuredAt: "2026-06-06T00:00:01.000Z",
        evidence: "Endpoint returned streaming and structured-output evidence.",
      })),
    },
    eligibility: {
      schemaVersion: "ambient-model-provider-capability-eligibility-v1",
      providerId: input.providerId,
      modelId: input.modelId,
      templateId: "generic-openai-compatible",
      eligibleAsMain: true,
      eligibleAsSubagent: true,
      mainBlockers: [],
      subagentBlockers: [],
      warnings: [],
      diagnostics: passedProbeIds.map((probeId) => ({
        probeId,
        requiredForMain: ["streaming", "context_window", "latency", "error_shape", "reliability"].includes(probeId),
        requiredForSubagent: [
          "streaming",
          "context_window",
          "structured_json",
          "schema_output",
          "tool_use",
          "latency",
          "error_shape",
          "reliability",
        ].includes(probeId),
        status: "passed",
        message: `Capability probe ${probeId} passed.`,
      })),
    },
  };
}
