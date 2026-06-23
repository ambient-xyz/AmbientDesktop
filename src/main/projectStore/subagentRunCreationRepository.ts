import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { CreateSubagentRunInput, SubagentRunSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { isAmbientSubagentsEnabled } from "../../shared/featureFlags";
import { getDefaultSubagentRoleProfile, type SubagentRoleId } from "../../shared/subagentRoles";
import { isSubagentEffectiveRoleSnapshot } from "../../shared/subagentPatternGraph";
import { fallbackSubagentCapacityLease, materializeSubagentCapacityLeaseForRun } from "../../shared/subagentCapacity";
import {
  assertValidMutationWorkspaceLease,
  materializeSymphonyChildLaunchContractBundleForRun,
} from "../../shared/symphonyFineGrainedContracts";
import { compactSubagentCapacityLeasePreview } from "./projectStoreSubagentMappers";
import { assertSubagentRunLinkage, subagentLifecycleEventType, subagentLifecycleHookPreview } from "./projectStoreSubagentsFacade";
import type { CreateThreadOptions } from "./projectStoreFacadeHelpers";
import type { AppendSubagentRunEventInput, CreateReservedSubagentRunInput } from "./subagentRunRepository";

export interface ProjectStoreSubagentRunCreationRepositoryDeps {
  appendSubagentRunEventInternal(runId: string, input: AppendSubagentRunEventInput): void;
  assertSubagentCanonicalTaskPathAvailableForSpawn(input: { parentThreadId: string; parentRunId: string; canonicalTaskPath: string }): void;
  createReservedSubagentRun(input: CreateReservedSubagentRunInput): SubagentRunSummary;
  createThread(title: string, workspacePath: string, options: CreateThreadOptions): ThreadSummary;
  getSubagentRun(runId: string): SubagentRunSummary;
  getThread(threadId: string): ThreadSummary;
  nextSubagentChildOrder(parentThreadId: string): number;
}

export class ProjectStoreSubagentRunCreationRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreSubagentRunCreationRepositoryDeps,
  ) {}

  createSubagentRun(input: CreateSubagentRunInput): SubagentRunSummary {
    if (!isAmbientSubagentsEnabled(input.featureFlagSnapshot)) {
      throw new Error("ambient.subagents is disabled; refusing to create sub-agent child thread.");
    }
    const parent = this.deps.getThread(input.parentThreadId);
    if (parent.kind === "subagent_child") {
      throw new Error("Nested sub-agent runs require an explicit later-phase fanout policy.");
    }
    const now = new Date().toISOString();
    const childRunId = randomUUID();
    const childOrder = input.childOrder ?? this.deps.nextSubagentChildOrder(input.parentThreadId);
    const roleProfileSnapshot = input.roleProfileSnapshot ?? getDefaultSubagentRoleProfile(input.roleId as SubagentRoleId);
    if (roleProfileSnapshot.id !== input.roleId) {
      throw new Error(`Sub-agent role profile snapshot ${roleProfileSnapshot.id} does not match requested role ${input.roleId}.`);
    }
    if (input.effectiveRoleSnapshot && !isSubagentEffectiveRoleSnapshot(input.effectiveRoleSnapshot, input.roleId)) {
      throw new Error(`Sub-agent effective role snapshot does not match requested role ${input.roleId}.`);
    }
    let childThread: ThreadSummary | undefined;
    const insertRun = this.db.transaction(() => {
      this.deps.assertSubagentCanonicalTaskPathAvailableForSpawn({
        parentThreadId: input.parentThreadId,
        parentRunId: input.parentRunId,
        canonicalTaskPath: input.canonicalTaskPath,
      });
      childThread = this.deps.createThread(input.title, parent.workspacePath, {
        kind: "subagent_child",
        parentThreadId: input.parentThreadId,
        parentMessageId: input.parentMessageId,
        parentRunId: input.parentRunId,
        subagentRunId: childRunId,
        canonicalTaskPath: input.canonicalTaskPath,
        childOrder,
        collapsedByDefault: true,
        childStatus: "reserved",
        collaborationMode: parent.collaborationMode,
        permissionMode: parent.permissionMode,
        model: input.modelRuntimeSnapshot.profile.modelId,
        thinkingLevel: parent.thinkingLevel,
      });
      const capacityLeaseSnapshot = materializeSubagentCapacityLeaseForRun(
        input.capacityLeaseSnapshot ??
          fallbackSubagentCapacityLease({
            parentThreadId: input.parentThreadId,
            parentRunId: input.parentRunId,
            canonicalTaskPath: input.canonicalTaskPath,
            roleId: input.roleId,
            model: input.modelRuntimeSnapshot.profile,
            now,
          }),
        {
          childRunId,
          childThreadId: childThread.id,
          canonicalTaskPath: input.canonicalTaskPath,
          parentThreadId: input.parentThreadId,
          parentRunId: input.parentRunId,
          roleId: input.roleId,
        },
      );
      const symphonyLaunchContracts = input.symphonyLaunchContracts
        ? materializeSymphonyChildLaunchContractBundleForRun(input.symphonyLaunchContracts, {
            parentThreadId: input.parentThreadId,
            parentRunId: input.parentRunId,
            roleId: input.roleId,
            childRunId,
          })
        : undefined;
      const symphonyMutationWorkspaceLease = input.symphonyMutationWorkspaceLease
        ? assertValidMutationWorkspaceLease({
            ...input.symphonyMutationWorkspaceLease,
            parentThreadId: input.parentThreadId,
            childThreadId: childThread.id,
            childRunId,
          })
        : undefined;

      assertSubagentRunLinkage({
        runId: childRunId,
        parentRunId: input.parentRunId,
        parentThreadId: input.parentThreadId,
        childThreadId: childThread.id,
        canonicalPath: input.canonicalTaskPath,
        roleId: input.roleId,
        featureFlags: input.featureFlagSnapshot,
        capacityLeaseSnapshot,
      });

      const run = this.deps.createReservedSubagentRun({
        runId: childRunId,
        parentThreadId: input.parentThreadId,
        parentRunId: input.parentRunId,
        parentMessageId: input.parentMessageId,
        childThreadId: childThread.id,
        canonicalTaskPath: input.canonicalTaskPath,
        roleId: input.roleId,
        roleProfileSnapshot,
        effectiveRoleSnapshot: input.effectiveRoleSnapshot,
        dependencyMode: input.dependencyMode,
        featureFlagSnapshot: input.featureFlagSnapshot,
        modelRuntimeSnapshot: input.modelRuntimeSnapshot,
        capacityLeaseSnapshot,
        symphonyLaunchContracts,
        symphonyMutationWorkspaceLease,
        createdAt: now,
      });
      this.deps.appendSubagentRunEventInternal(childRunId, {
        type: "subagent.reserved",
        preview: {
          childThreadId: childThread.id,
          canonicalTaskPath: input.canonicalTaskPath,
          roleId: input.roleId,
          effectiveRole: input.effectiveRoleSnapshot
            ? {
                displayLabel: input.effectiveRoleSnapshot.displayLabel,
                patternRole: input.effectiveRoleSnapshot.patternRole,
                roleOverlayIds: input.effectiveRoleSnapshot.roleOverlayIds,
              }
            : undefined,
          capacityLease: compactSubagentCapacityLeasePreview(capacityLeaseSnapshot),
          symphonyLaunch: symphonyLaunchContracts
            ? {
                pattern: symphonyLaunchContracts.patternSelection.pattern,
                selectionId: symphonyLaunchContracts.patternSelection.selectionId,
                policyId: symphonyLaunchContracts.childLaunchPolicySnapshot.policyId,
              }
            : undefined,
        },
        createdAt: now,
      });
      this.deps.appendSubagentRunEventInternal(run.id, {
        type: subagentLifecycleEventType("SubagentStart"),
        preview: subagentLifecycleHookPreview({
          hook: "SubagentStart",
          run,
          createdAt: run.createdAt,
        }),
        createdAt: run.createdAt,
      });
    });
    insertRun();
    return this.deps.getSubagentRun(childRunId);
  }
}
