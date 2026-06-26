import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { SUBAGENT_LIVE_EVIDENCE_LABELS } from "../../shared/subagentLiveEvidenceLanes";
import { ProjectStore } from "./projectStore";
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

function enabledSubagentFeatureFlags(generatedAt = "2026-06-05T00:00:00.000Z") {
  return resolveAmbientFeatureFlags({
    startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
    generatedAt,
  });
}

function mapReduceMetricCriteria(): Array<{ templateId: string; value: string }> {
  return [{ templateId: "map_reduce-metric", value: "Every mapped item has reducer evidence." }];
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
        blockedGateIds: expect.arrayContaining(["live_dogfood_count", "live_smoke", "failure_rate", "restart_recovery", "security_review"]),
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
      expect(catalog.providers).toContainEqual(
        expect.objectContaining({
          id: "customer-router",
          label: "Customer Router",
        }),
      );
      expect(catalog.profiles).toContainEqual(
        expect.objectContaining({
          profileId: "customer-router:CUSTOM/Router Model v2",
          modelId: "CUSTOM/Router Model v2",
          selectableAsMain: true,
          selectableAsSubagent: true,
        }),
      );
      expect(catalog.selectableMainModelOptions.map((option) => option.id)).toEqual(
        expect.arrayContaining(["zai-org/GLM-5.2-FP8", "CUSTOM/Router Model v2"]),
      );
      expect(catalog.selectableSubagentProfiles.map((profile) => profile.modelId)).toEqual(
        expect.arrayContaining(["zai-org/GLM-5.2-FP8", "CUSTOM/Router Model v2"]),
      );
    } finally {
      store.close();
      reopened.close();
    }
  });

  it("blocks duplicate canonical child paths while unresolved required barriers reference the original child", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = enabledSubagentFeatureFlags();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const createChild = (canonicalTaskPath: string, title = canonicalTaskPath) =>
        store.createSubagentRun({
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

      expect(() =>
        store.assertSubagentCanonicalTaskPathAvailableForSpawn({
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          canonicalTaskPath: "root/0:explorer",
        }),
      ).toThrow(/already owned by child run .*Unresolved required wait barrier/);
      expect(() => createChild("root/0:explorer", "Duplicate child")).toThrow(/spawning replacement child work/);
      expect(store.listThreads().map((thread) => thread.id)).toEqual(threadIdsBeforeDuplicate);
      expect(
        store
          .listSubagentRunsForParentThread(parent.id)
          .filter((run) => run.canonicalTaskPath === "root/0:explorer")
          .map((run) => run.id),
      ).toEqual([original.id]);

      store.updateSubagentWaitBarrierStatus(barrier.id, "satisfied", {
        now: "2026-06-05T00:00:20.000Z",
        resolutionArtifact: waitBarrierResolutionArtifact({
          childRunIds: [original.id],
          synthesisAllowed: true,
          transitionKind: "child_terminal",
          reason: "completed",
        }),
      });
      expect(() =>
        store.assertSubagentCanonicalTaskPathAvailableForSpawn({
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          canonicalTaskPath: "root/0:explorer",
        }),
      ).not.toThrow();
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

      expect(() =>
        store.assertSubagentCanonicalTaskPathAvailableForSpawn({
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          canonicalTaskPath: "root/background:explorer",
        }),
      ).not.toThrow();
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
      expect(
        store
          .listSubagentRunsForParentThread(parent.id)
          .filter((run) => run.canonicalTaskPath === "root/background:explorer")
          .map((run) => run.id),
      ).toEqual([original.id, duplicateBackground.id]);
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

      expect(() =>
        store.assertSubagentCanonicalTaskPathAvailableForSpawn({
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          canonicalTaskPath: "root/background-bridge:explorer",
        }),
      ).not.toThrow();
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
      expect(
        store
          .listSubagentRunsForParentThread(parent.id)
          .filter((run) => run.canonicalTaskPath === "root/background-bridge:explorer")
          .map((run) => run.id),
      ).toEqual([original.id, replacement.id]);
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
      expect(
        consumeDeliveredParentToChildMailboxEvents(store, {
          runId: run.id,
          now: "2026-06-05T00:00:06.000Z",
        }).unchanged,
      ).toEqual([
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
      expect(
        cancelPendingParentToChildMailboxEvents(store, {
          runId: run.id,
          now: "2026-06-05T00:00:10.000Z",
        }).unchanged,
      ).toEqual([
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
        }),
      );

      expect(() =>
        store.createSubagentWaitBarrier({
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          childRunIds: childRuns.map((run) => run.id),
          dependencyMode: "quorum",
          failurePolicy: "ask_user",
        }),
      ).toThrow(/explicit integer quorumThreshold/);
      expect(() =>
        store.createSubagentWaitBarrier({
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          childRunIds: childRuns.map((run) => run.id),
          dependencyMode: "required_any",
          failurePolicy: "ask_user",
          quorumThreshold: 2,
        }),
      ).toThrow(/only valid for quorum/);

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
      expect(
        store.recordSubagentMaturityEvidence({
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
        }),
      ).toMatchObject({
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
      expect(
        store.getSubagentMaturitySnapshot({
          createdAt: "2026-06-05T00:01:00.000Z",
          criteria: { minLiveDogfoodRuns: 1, minDesktopDogfoodRuns: 1 },
        }),
      ).toMatchObject({
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
            actual:
              "Validated child request attribution, scoped response persistence, parent wait resumption, non-interactive failure handling, and UI/replay visibility.",
          }),
          expect.objectContaining({
            id: "production_ui_visibility",
            status: "passed",
            actual:
              "Validated collapsed parent clusters, blocking-child indicators, child inspector rows, repair/replay panels, and local runtime ownership controls.",
          }),
          expect.objectContaining({
            id: "event_attribution_integrity",
            status: "passed",
            actual:
              "Validated runtime preview attribution, parent mailbox attribution, tool/approval/error provenance, replay diagnostics, and large-output artifact backing.",
          }),
          expect.objectContaining({
            id: "lifecycle_control_integrity",
            status: "passed",
            actual:
              "Validated parent-stop cascade, child-cancel isolation, close capacity/history retention, lifecycle hook artifacts, and restart interruption repair.",
          }),
          expect.objectContaining({
            id: "retention_policy_integrity",
            status: "passed",
            actual:
              "Validated close-without-delete, oldest-eligible cap cleanup, protected-child retention, summary/artifact durability, and retained-state UI.",
          }),
          expect.objectContaining({
            id: "tool_scope_integrity",
            status: "passed",
            actual:
              "Validated hard-deny precedence, role/task narrowing, exact tool/extension resolution, child fanout default blocking, and snapshot/inspector diagnostics.",
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
      expect(
        reopened.getSubagentMaturitySnapshot({
          createdAt: "2026-06-05T00:02:00.000Z",
          criteria: { minLiveDogfoodRuns: 1, minDesktopDogfoodRuns: 1 },
        }).defaultCanBeEnabled,
      ).toBe(true);
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
      expect(snapshot.gates).toContainEqual(
        expect.objectContaining({
          id: "live_dogfood_count",
          status: "blocked",
          actual: "1 clean recorded.",
          detail: "Required-live history: 1 clean, 0 failed, 0 advisory, 0 skipped-evidence.",
        }),
      );
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
    scenarios: ["seeded_visible_child_cluster", "approval_parent_blocking", "workflow_high_load_dogfood"],
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
    checks: [{ id: "matrix.release-profile", status: "pass" }],
  };
}

function installedProvider(input: { providerId: string; modelId: string }): ModelRuntimeInstalledProvider {
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
