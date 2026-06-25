import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
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

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

async function tempWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "ambient-store-subagent-creation-lifecycle-"));
  roots.push(root);
  return join(root, "workspace");
}

function symphonyLaunchBundle(input: {
  featureFlagSnapshot: ReturnType<typeof resolveAmbientFeatureFlags>;
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
      childRolePlan: [{ role: input.role, count: 1, purpose: "Map the assigned evidence slice." }],
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

function symphonyMutationWorkspaceLease(input: { parentThreadId: string }): MutationWorkspaceLease {
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

describe("ProjectStore sub-agent creation lifecycle", () => {
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

      expect(() =>
        store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          title: "Explorer child",
          roleId: "explorer",
          canonicalTaskPath: "root/0:explorer",
          featureFlagSnapshot: disabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        }),
      ).toThrow(/disabled/);
      expect(() =>
        store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          title: "Mismatched role child",
          roleId: "explorer",
          roleProfileSnapshot: getDefaultSubagentRoleProfile("reviewer"),
          canonicalTaskPath: "root/bad:explorer",
          featureFlagSnapshot: enabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        }),
      ).toThrow(/does not match requested role/);
      const threadIdsBeforeBadEffectiveRole = store.listThreads().map((thread) => thread.id);
      expect(() =>
        store.createSubagentRun({
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
        }),
      ).toThrow(/effective role snapshot does not match requested role/);
      expect(store.listThreads().map((thread) => thread.id)).toEqual(threadIdsBeforeBadEffectiveRole);
      const threadIdsBeforeBadLease = store.listThreads().map((thread) => thread.id);
      expect(() =>
        store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          title: "Bad lease child",
          roleId: "explorer",
          canonicalTaskPath: "root/bad-lease:explorer",
          featureFlagSnapshot: enabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
          capacityLeaseSnapshot: { schemaVersion: "legacy-capacity-lease" } as never,
        }),
      ).toThrow(/capacity lease snapshot must use schema/);
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
              roleOverlayIds: ["mapper.slice-assignment", "mapper.extraction-schema", "mapper.citation-requirement"],
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
          loadedTools: [
            {
              source: "built_in",
              id: "workspace.read",
              categoryId: "workspace.read",
              piVisible: true,
              mutatesState: false,
              requiresApproval: false,
            },
          ],
          piVisibleTools: [
            {
              source: "built_in",
              id: "workspace.read",
              categoryId: "workspace.read",
              piVisible: true,
              mutatesState: false,
              requiresApproval: false,
            },
          ],
          deniedTools: [
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
      expect(() =>
        store.updateSubagentWaitBarrierStatus(missingEvidenceBarrier.id, "satisfied", {
          resolutionArtifact: {
            schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
            childRunIds: [run.id],
            synthesisAllowed: true,
          },
        }),
      ).toThrow(/requires durable transitionEvidence/);

      const progressEvidenceBarrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [run.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      expect(() =>
        store.updateSubagentWaitBarrierStatus(progressEvidenceBarrier.id, "timed_out", {
          resolutionArtifact: waitBarrierResolutionArtifact({
            childRunIds: [run.id],
            synthesisAllowed: false,
            transitionKind: "progress_return",
            transitionSource: "parent_wait_session",
            reason: "parent_wait_window_elapsed",
          }),
        }),
      ).toThrow(/cannot use progress_return as terminal evidence/);

      const mismatchedEvidenceBarrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [run.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      expect(() =>
        store.updateSubagentWaitBarrierStatus(mismatchedEvidenceBarrier.id, "satisfied", {
          resolutionArtifact: waitBarrierResolutionArtifact({
            childRunIds: [run.id],
            childStatuses: [{ childRunId: run.id, status: "timed_out" }],
            synthesisAllowed: false,
            transitionKind: "child_runtime_timeout",
            transitionSource: "child_runtime",
            reason: "runtime_idle_timeout",
          }),
        }),
      ).toThrow(/status satisfied cannot use transition evidence kind child_runtime_timeout/);

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
});
