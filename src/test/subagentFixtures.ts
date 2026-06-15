import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AMBIENT_DEFAULT_MODEL, createAmbientModelRuntimeSnapshot } from "../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../shared/featureFlags";
import { fallbackSubagentCapacityLease, materializeSubagentCapacityLeaseForRun } from "../shared/subagentCapacity";
import {
  createSubagentRuntimeEvent,
  type SubagentResultArtifact,
  type SubagentRuntimeEvent,
} from "../shared/subagentProtocol";
import { getDefaultSubagentRoleProfile, type SubagentRoleId } from "../shared/subagentRoles";
import type {
  ChatMessage,
  SubagentRepairIssueKind,
  SubagentParentMailboxEventSummary,
  SubagentRestartReconciliationSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentSpawnEdgeSummary,
  SubagentWaitBarrierSummary,
  ThreadSummary,
} from "../shared/types";

export const SUBAGENT_FIXTURE_NOW = "2026-06-05T00:00:00.000Z";
export const SUBAGENT_FIXTURE_WORKSPACE = "/tmp/ambient-subagent-fixture";
export const SUBAGENT_FIXTURE_PARENT_THREAD_ID = "parent-thread";
export const SUBAGENT_FIXTURE_PARENT_RUN_ID = "parent-run";

export interface SubagentRestartReplayFixture {
  schemaVersion: "ambient-subagent-replay-fixture-v1";
  name: string;
  createdAt: string;
  threads: ThreadSummary[];
  runs: SubagentRunSummary[];
  runEvents: SubagentRunEventSummary[];
  spawnEdges: SubagentSpawnEdgeSummary[];
  waitBarriers: SubagentWaitBarrierSummary[];
  parentMailboxEvents: SubagentParentMailboxEventSummary[];
  transcript: ChatMessage[];
  runtimeEvents: SubagentRuntimeEvent[];
  expectedIssueKinds: SubagentRepairIssueKind[];
}

export interface SubagentReplayTimelineItem {
  sequence: number;
  createdAt: string;
  runId: string;
  parentRunId: string;
  childThreadId: string;
  canonicalTaskPath?: string;
  roleId?: string;
  source?: string;
  type: string;
  status?: string;
  toolName?: string;
  textPreview?: string;
  messagePreview?: string;
  artifactPath?: string;
}

export interface SubagentReplayParentMailboxItem {
  sequence: number;
  id: string;
  createdAt: string;
  updatedAt: string;
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  type: string;
  deliveryState: "queued" | "delivered" | "consumed" | "failed" | "cancelled";
  childRunIds: string[];
  idempotencyKey?: string;
  payloadPreview?: string;
}

export interface SubagentReplayRehydrationProof {
  schemaVersion: "ambient-subagent-restart-rehydration-proof-v1";
  childRunIds: string[];
  childThreadIds: string[];
  parentMailboxEventIds: string[];
  parentMailboxStates: Array<{
    id: string;
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    deliveryState: SubagentReplayParentMailboxItem["deliveryState"];
    childRunIds: string[];
  }>;
  transcriptChildRunIds: string[];
  transcriptThreadIds: string[];
  resultArtifactPointers: Array<{
    runId: string;
    childThreadId: string;
    status: string;
    artifactPath?: string;
    fullOutputPath?: string;
    structuredOutputPath?: string;
  }>;
  missingResultArtifactRunIds: string[];
  artifactPointerIntegrity: {
    allResultPointersHaveRunAndThread: boolean;
    missingResultArtifactsDiagnosed: boolean;
    parentMailboxChildRefsResolved: boolean;
    transcriptChildRefsResolved: boolean;
  };
}

export interface SubagentReplayEvidence {
  schemaVersion: "ambient-subagent-replay-evidence-v1";
  fixtureName: string;
  createdAt: string;
  liveTokens: false;
  counts: {
    threads: number;
    childThreads: number;
    runs: number;
    persistedRunEvents: number;
    runtimeEvents: number;
    parentMailboxEvents: number;
    transcriptMessages: number;
    restartRepairIssues: number;
  };
  childThreads: Array<{
    threadId: string;
    runId?: string;
    parentThreadId?: string;
    parentRunId?: string;
    canonicalTaskPath?: string;
    collapsedByDefault?: boolean;
    status?: string;
  }>;
  runtimeEventTimeline: SubagentReplayTimelineItem[];
  persistedRunEventTimeline: SubagentReplayTimelineItem[];
  parentMailboxTimeline: SubagentReplayParentMailboxItem[];
  transcriptTimeline: Array<{
    sequence: number;
    createdAt: string;
    threadId: string;
    role: ChatMessage["role"];
    childRunId?: string;
    childThreadId?: string;
    contentPreview: string;
  }>;
  rehydration: SubagentReplayRehydrationProof;
  restartRepair: {
    expectedIssueKinds: SubagentRepairIssueKind[];
    observedIssueKinds: SubagentRepairIssueKind[];
    repairedRunIds: string[];
    repairedBarrierIds: string[];
    repairedParentControlBarrierIds: string[];
    repairableSpawnEdgeRunIds: string[];
    danglingSpawnEdgeRunIds: string[];
    diagnosticRunIds: string[];
  };
}

export const subagentFixtureFeatureFlags = resolveAmbientFeatureFlags({
  startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
  generatedAt: SUBAGENT_FIXTURE_NOW,
});

export function subagentFixtureThread(input: Partial<ThreadSummary> & { id: string }): ThreadSummary {
  return {
    id: input.id,
    title: input.title ?? input.id,
    workspacePath: input.workspacePath ?? SUBAGENT_FIXTURE_WORKSPACE,
    kind: input.kind ?? "chat",
    createdAt: input.createdAt ?? SUBAGENT_FIXTURE_NOW,
    updatedAt: input.updatedAt ?? SUBAGENT_FIXTURE_NOW,
    lastMessagePreview: input.lastMessagePreview ?? "",
    permissionMode: input.permissionMode ?? "workspace",
    collaborationMode: input.collaborationMode ?? "agent",
    model: input.model ?? AMBIENT_DEFAULT_MODEL,
    thinkingLevel: input.thinkingLevel ?? "minimal",
    ...(input.parentThreadId ? { parentThreadId: input.parentThreadId } : {}),
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
    ...(input.subagentRunId ? { subagentRunId: input.subagentRunId } : {}),
    ...(input.canonicalTaskPath ? { canonicalTaskPath: input.canonicalTaskPath } : {}),
    ...(typeof input.childOrder === "number" ? { childOrder: input.childOrder } : {}),
    ...(typeof input.collapsedByDefault === "boolean" ? { collapsedByDefault: input.collapsedByDefault } : {}),
    ...(input.childStatus ? { childStatus: input.childStatus } : {}),
    ...(input.archivedAt ? { archivedAt: input.archivedAt } : {}),
    ...(input.lastReadAt ? { lastReadAt: input.lastReadAt } : {}),
    ...(input.piSessionFile ? { piSessionFile: input.piSessionFile } : {}),
    ...(input.gitWorktree ? { gitWorktree: input.gitWorktree } : {}),
    ...(typeof input.pinned === "boolean" ? { pinned: input.pinned } : {}),
    ...(input.workflowRecording ? { workflowRecording: input.workflowRecording } : {}),
  };
}

export function subagentFixtureChildThread(input: Partial<ThreadSummary> & {
  id: string;
  subagentRunId: string;
  canonicalTaskPath: string;
}): ThreadSummary {
  return subagentFixtureThread({
    title: input.title ?? input.id,
    lastMessagePreview: input.lastMessagePreview ?? "Sub-agent fixture child transcript.",
    collapsedByDefault: input.collapsedByDefault ?? true,
    ...input,
    kind: "subagent_child",
    parentThreadId: input.parentThreadId ?? SUBAGENT_FIXTURE_PARENT_THREAD_ID,
    parentRunId: input.parentRunId ?? SUBAGENT_FIXTURE_PARENT_RUN_ID,
    subagentRunId: input.subagentRunId,
    canonicalTaskPath: input.canonicalTaskPath,
  });
}

export function subagentFixtureResultArtifact(input: Partial<SubagentResultArtifact> & {
  runId: string;
  childThreadId: string;
}): SubagentResultArtifact {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId: input.runId,
    status: input.status ?? "completed",
    partial: input.partial ?? false,
    summary: input.summary ?? `Fixture result for ${input.runId}.`,
    childThreadId: input.childThreadId,
    ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
    ...(input.fullOutputPath ? { fullOutputPath: input.fullOutputPath } : {}),
    ...(input.structuredOutputPath ? { structuredOutputPath: input.structuredOutputPath } : {}),
    ...(input.structuredOutput !== undefined ? { structuredOutput: input.structuredOutput } : {}),
    ...(input.provenanceHash ? { provenanceHash: input.provenanceHash } : {}),
  };
}

export function subagentFixtureRun(input: Partial<SubagentRunSummary> & { id: string }): SubagentRunSummary {
  const roleId = (input.roleId ?? "explorer") as SubagentRoleId;
  const parentThreadId = input.parentThreadId ?? SUBAGENT_FIXTURE_PARENT_THREAD_ID;
  const parentRunId = input.parentRunId ?? SUBAGENT_FIXTURE_PARENT_RUN_ID;
  const childThreadId = input.childThreadId ?? `${input.id}-thread`;
  const canonicalTaskPath = input.canonicalTaskPath ?? `root/0:${roleId}`;
  const modelRuntimeSnapshot = input.modelRuntimeSnapshot ??
    createAmbientModelRuntimeSnapshot(AMBIENT_DEFAULT_MODEL, SUBAGENT_FIXTURE_NOW);
  return {
    ...input,
    id: input.id,
    protocolVersion: input.protocolVersion ?? "ambient-subagent-v1",
    parentThreadId,
    parentRunId,
    childThreadId,
    canonicalTaskPath,
    roleId,
    roleProfileSnapshot: input.roleProfileSnapshot ?? getDefaultSubagentRoleProfile(roleId),
    roleProfileSnapshotSource: input.roleProfileSnapshotSource ?? "resolved",
    dependencyMode: input.dependencyMode ?? "required",
    status: input.status ?? "reserved",
    featureFlagSnapshot: input.featureFlagSnapshot ?? subagentFixtureFeatureFlags,
    modelRuntimeSnapshot,
    capacityLeaseSnapshot: input.capacityLeaseSnapshot ?? materializeSubagentCapacityLeaseForRun(
      fallbackSubagentCapacityLease({
        parentThreadId,
        parentRunId,
        canonicalTaskPath,
        roleId,
        model: modelRuntimeSnapshot.profile,
        now: SUBAGENT_FIXTURE_NOW,
      }),
      {
        childRunId: input.id,
        childThreadId,
        canonicalTaskPath,
        parentThreadId,
        parentRunId,
        roleId,
      },
    ),
    createdAt: input.createdAt ?? SUBAGENT_FIXTURE_NOW,
    updatedAt: input.updatedAt ?? SUBAGENT_FIXTURE_NOW,
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    ...(input.startedAt ? { startedAt: input.startedAt } : {}),
    ...(input.completedAt ? { completedAt: input.completedAt } : {}),
    ...(input.closedAt ? { closedAt: input.closedAt } : {}),
    ...(input.resultArtifact !== undefined ? { resultArtifact: input.resultArtifact } : {}),
  };
}

export function subagentFixtureRunEvent(input: Partial<SubagentRunEventSummary> & {
  runId: string;
  type: string;
}): SubagentRunEventSummary {
  return {
    runId: input.runId,
    sequence: input.sequence ?? 1,
    type: input.type,
    createdAt: input.createdAt ?? SUBAGENT_FIXTURE_NOW,
    ...(input.preview !== undefined ? { preview: input.preview } : {}),
    ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
  };
}

export function subagentFixtureSpawnEdge(input: Partial<SubagentSpawnEdgeSummary> & {
  childRunId: string;
}): SubagentSpawnEdgeSummary {
  const childThreadId = input.childThreadId ?? `${input.childRunId}-thread`;
  return {
    parentRunId: input.parentRunId ?? SUBAGENT_FIXTURE_PARENT_RUN_ID,
    childRunId: input.childRunId,
    parentThreadId: input.parentThreadId ?? SUBAGENT_FIXTURE_PARENT_THREAD_ID,
    childThreadId,
    canonicalTaskPath: input.canonicalTaskPath ?? "root/0:explorer",
    depth: input.depth ?? 1,
    status: input.status ?? "reserved",
    ...(input.capacityReleasedAt ? { capacityReleasedAt: input.capacityReleasedAt } : {}),
    createdAt: input.createdAt ?? SUBAGENT_FIXTURE_NOW,
    updatedAt: input.updatedAt ?? SUBAGENT_FIXTURE_NOW,
  };
}

export function subagentFixtureWaitBarrier(input: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: input.id ?? "barrier-1",
    parentThreadId: input.parentThreadId ?? SUBAGENT_FIXTURE_PARENT_THREAD_ID,
    parentRunId: input.parentRunId ?? SUBAGENT_FIXTURE_PARENT_RUN_ID,
    childRunIds: input.childRunIds ?? ["run-active"],
    dependencyMode: input.dependencyMode ?? "required_all",
    status: input.status ?? "waiting_on_children",
    failurePolicy: input.failurePolicy ?? "ask_user",
    ...(typeof input.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {}),
    createdAt: input.createdAt ?? SUBAGENT_FIXTURE_NOW,
    updatedAt: input.updatedAt ?? SUBAGENT_FIXTURE_NOW,
    ...(input.resolvedAt ? { resolvedAt: input.resolvedAt } : {}),
    ...(input.resolutionArtifact !== undefined ? { resolutionArtifact: input.resolutionArtifact } : {}),
  };
}

export function subagentFixtureParentMailboxEvent(input: Partial<SubagentParentMailboxEventSummary> & {
  id: string;
  parentRunId?: string;
  type: string;
  payload: unknown;
}): SubagentParentMailboxEventSummary {
  return {
    id: input.id,
    parentThreadId: input.parentThreadId ?? SUBAGENT_FIXTURE_PARENT_THREAD_ID,
    parentRunId: input.parentRunId ?? SUBAGENT_FIXTURE_PARENT_RUN_ID,
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    type: input.type,
    payload: input.payload,
    deliveryState: input.deliveryState ?? "queued",
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    createdAt: input.createdAt ?? SUBAGENT_FIXTURE_NOW,
    updatedAt: input.updatedAt ?? input.createdAt ?? SUBAGENT_FIXTURE_NOW,
    ...(input.deliveredAt ? { deliveredAt: input.deliveredAt } : {}),
  };
}

export function subagentFixtureTranscript(input: {
  parentThreadId?: string;
  childThreadId?: string;
  parentRunId?: string;
  childRunId?: string;
} = {}): ChatMessage[] {
  const parentThreadId = input.parentThreadId ?? SUBAGENT_FIXTURE_PARENT_THREAD_ID;
  const childThreadId = input.childThreadId ?? "child-active";
  const parentRunId = input.parentRunId ?? SUBAGENT_FIXTURE_PARENT_RUN_ID;
  const childRunId = input.childRunId ?? "run-active";
  return [
    {
      id: "parent-message-1",
      threadId: parentThreadId,
      role: "user",
      content: "Use a sub-agent to inspect restart repair behavior.",
      createdAt: SUBAGENT_FIXTURE_NOW,
      metadata: { fixture: "subagent-replay", parentRunId },
    },
    {
      id: "parent-message-2",
      threadId: parentThreadId,
      role: "assistant",
      content: `Reserved child run ${childRunId}; see ${childThreadId}.`,
      createdAt: "2026-06-05T00:00:01.000Z",
      metadata: { fixture: "subagent-replay", childRunId, childThreadId },
    },
    {
      id: "child-message-1",
      threadId: childThreadId,
      role: "assistant",
      content: "Fixture child started but did not finish before restart.",
      createdAt: "2026-06-05T00:00:02.000Z",
      metadata: { fixture: "subagent-replay", childRunId },
    },
  ];
}

export function subagentFixtureRuntimeEvents(run = subagentFixtureRun({
  id: "run-active",
  childThreadId: "child-active",
  status: "running",
})): SubagentRuntimeEvent[] {
  return [
    createSubagentRuntimeEvent({
      run,
      source: "spawn_agent",
      event: {
        type: "started",
        status: "running",
        message: "Fixture child runtime started.",
        createdAt: SUBAGENT_FIXTURE_NOW,
      },
    }),
    createSubagentRuntimeEvent({
      run,
      source: "child_runtime",
      event: {
        type: "tool_call",
        toolName: "workspace_search",
        textPreview: "Searching fixture workspace.",
        createdAt: "2026-06-05T00:00:01.000Z",
      },
    }),
    createSubagentRuntimeEvent({
      run,
      source: "child_runtime",
      event: {
        type: "tool_result",
        toolName: "workspace_search",
        textPreview: "Found fixture restart state.",
        createdAt: "2026-06-05T00:00:02.000Z",
      },
    }),
  ];
}

export function subagentReplayEvidence(input: {
  fixture: SubagentRestartReplayFixture;
  restartSummary?: SubagentRestartReconciliationSummary;
  maxPreviewChars?: number;
}): SubagentReplayEvidence {
  const maxPreviewChars = positivePreviewLimit(input.maxPreviewChars);
  const runsById = new Map(input.fixture.runs.map((run) => [run.id, run]));
  const childThreads = input.fixture.threads.filter((thread) => thread.kind === "subagent_child");
  const observedIssueKinds = input.restartSummary?.issues.map((issue) => issue.kind) ?? [];
  const parentMailboxTimeline = input.fixture.parentMailboxEvents.map((event, index) =>
    compactParentMailboxItem(event, index + 1, maxPreviewChars)
  );
  const transcriptTimeline = input.fixture.transcript.map((message, index) => {
    const metadata = objectValue(message.metadata);
    return {
      sequence: index + 1,
      createdAt: message.createdAt,
      threadId: message.threadId,
      role: message.role,
      childRunId: stringValue(metadata.childRunId),
      childThreadId: stringValue(metadata.childThreadId),
      contentPreview: boundedPreview(message.content, maxPreviewChars),
    };
  });
  const resultArtifactPointers = input.fixture.runs.flatMap((run) => resultArtifactPointerForRun(run));
  const missingResultArtifactRunIds = input.fixture.runs
    .filter((run) => terminalRunStatuses.has(run.status) && objectValue(run.resultArtifact).schemaVersion !== "ambient-subagent-result-artifact-v1")
    .map((run) => run.id);
  return {
    schemaVersion: "ambient-subagent-replay-evidence-v1",
    fixtureName: input.fixture.name,
    createdAt: input.fixture.createdAt,
    liveTokens: false,
    counts: {
      threads: input.fixture.threads.length,
      childThreads: childThreads.length,
      runs: input.fixture.runs.length,
      persistedRunEvents: input.fixture.runEvents.length,
      runtimeEvents: input.fixture.runtimeEvents.length,
      parentMailboxEvents: input.fixture.parentMailboxEvents.length,
      transcriptMessages: input.fixture.transcript.length,
      restartRepairIssues: observedIssueKinds.length,
    },
    childThreads: childThreads.map((thread) => ({
      threadId: thread.id,
      runId: thread.subagentRunId,
      parentThreadId: thread.parentThreadId,
      parentRunId: thread.parentRunId,
      canonicalTaskPath: thread.canonicalTaskPath,
      collapsedByDefault: thread.collapsedByDefault,
      status: thread.childStatus,
    })),
    runtimeEventTimeline: input.fixture.runtimeEvents.map((event, index) => {
      const run = runsById.get(event.runId);
      return compactTimelineItem({
        sequence: index + 1,
        createdAt: event.createdAt,
        runId: event.runId,
        parentRunId: event.parentRunId,
        childThreadId: event.childThreadId,
        canonicalTaskPath: run?.canonicalTaskPath,
        roleId: run?.roleId,
        source: event.source,
        type: event.type,
        status: event.status,
        toolName: event.toolName,
        textPreview: event.textPreview,
        messagePreview: event.message,
        artifactPath: event.artifactPath,
      }, maxPreviewChars);
    }),
    persistedRunEventTimeline: input.fixture.runEvents.map((event, index) => {
      const run = runsById.get(event.runId);
      return compactTimelineItem({
        sequence: event.sequence ?? index + 1,
        createdAt: event.createdAt,
        runId: event.runId,
        parentRunId: run?.parentRunId ?? "",
        childThreadId: run?.childThreadId ?? "",
        canonicalTaskPath: run?.canonicalTaskPath,
        roleId: run?.roleId,
        source: "project_store",
        type: event.type,
        textPreview: previewValue(event.preview, maxPreviewChars),
        artifactPath: event.artifactPath,
      }, maxPreviewChars);
    }),
    parentMailboxTimeline,
    transcriptTimeline,
    rehydration: {
      schemaVersion: "ambient-subagent-restart-rehydration-proof-v1",
      childRunIds: input.fixture.runs.map((run) => run.id).sort(),
      childThreadIds: childThreads.map((thread) => thread.id).sort(),
      parentMailboxEventIds: parentMailboxTimeline.map((event) => event.id).sort(),
      parentMailboxStates: parentMailboxTimeline.map((event) => ({
        id: event.id,
        parentThreadId: event.parentThreadId,
        parentRunId: event.parentRunId,
        ...(event.parentMessageId ? { parentMessageId: event.parentMessageId } : {}),
        deliveryState: event.deliveryState,
        childRunIds: event.childRunIds,
      })),
      transcriptChildRunIds: uniqueSortedStrings(transcriptTimeline.flatMap((message) => message.childRunId ? [message.childRunId] : [])),
      transcriptThreadIds: uniqueSortedStrings(transcriptTimeline.map((message) => message.threadId)),
      resultArtifactPointers,
      missingResultArtifactRunIds,
      artifactPointerIntegrity: {
        allResultPointersHaveRunAndThread: resultArtifactPointers.every((pointer) => Boolean(pointer.runId && pointer.childThreadId)),
        missingResultArtifactsDiagnosed: missingResultArtifactRunIds.length === 0 || observedIssueKinds.includes("missing_result_artifact"),
        parentMailboxChildRefsResolved: parentMailboxTimeline.every((event) => event.childRunIds.every((runId) => runsById.has(runId))),
        transcriptChildRefsResolved: transcriptTimeline.every((message) => !message.childRunId || runsById.has(message.childRunId)),
      },
    },
    restartRepair: {
      expectedIssueKinds: input.fixture.expectedIssueKinds,
      observedIssueKinds,
      repairedRunIds: input.restartSummary?.repairedRunIds ?? [],
      repairedBarrierIds: input.restartSummary?.repairedBarrierIds ?? [],
      repairedParentControlBarrierIds: input.restartSummary?.repairedParentControlBarrierIds ?? [],
      repairableSpawnEdgeRunIds: input.restartSummary?.repairableSpawnEdgeRunIds ?? [],
      danglingSpawnEdgeRunIds: input.restartSummary?.danglingSpawnEdgeRunIds ?? [],
      diagnosticRunIds: input.restartSummary?.diagnosticRunIds ?? [],
    },
  };
}

export async function writeSubagentReplayEvidenceArtifact(
  outputPath: string | undefined,
  evidence: SubagentReplayEvidence,
): Promise<void> {
  if (!outputPath?.trim()) return;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

export function subagentRestartReplayFixture(): SubagentRestartReplayFixture {
  const activeRun = subagentFixtureRun({
    id: "run-active",
    childThreadId: "child-active",
    canonicalTaskPath: "root/0:explorer",
    status: "running",
    startedAt: "2026-06-05T00:00:01.000Z",
  });
  const terminalMissingArtifact = subagentFixtureRun({
    id: "run-terminal",
    childThreadId: "child-terminal",
    canonicalTaskPath: "root/1:reviewer",
    roleId: "reviewer",
    status: "completed",
    completedAt: "2026-06-05T00:00:10.000Z",
  });
  const completedWithArtifact = subagentFixtureRun({
    id: "run-artifact",
    childThreadId: "child-artifact",
    canonicalTaskPath: "root/2:summarizer",
    roleId: "summarizer",
    status: "completed",
    completedAt: "2026-06-05T00:00:12.000Z",
    resultArtifact: subagentFixtureResultArtifact({
      runId: "run-artifact",
      childThreadId: "child-artifact",
      summary: "Completed summarizer fixture with artifact pointers.",
      artifactPath: ".ambient-codex/subagents/run-artifact/result.json",
      fullOutputPath: ".ambient-codex/subagents/run-artifact/full-output.txt",
      structuredOutputPath: ".ambient-codex/subagents/run-artifact/structured.json",
      provenanceHash: "fixture-provenance-hash",
    }),
  });
  return {
    schemaVersion: "ambient-subagent-replay-fixture-v1",
    name: "restart-repair-broken-child-tree",
    createdAt: SUBAGENT_FIXTURE_NOW,
    threads: [
      subagentFixtureThread({ id: SUBAGENT_FIXTURE_PARENT_THREAD_ID, title: "Parent fixture thread" }),
      subagentFixtureChildThread({
        id: "child-active",
        title: "Interrupted explorer",
        subagentRunId: activeRun.id,
        canonicalTaskPath: activeRun.canonicalTaskPath,
        childStatus: activeRun.status,
      }),
      subagentFixtureChildThread({
        id: "child-terminal",
        title: "Completed reviewer without artifact",
        subagentRunId: terminalMissingArtifact.id,
        canonicalTaskPath: terminalMissingArtifact.canonicalTaskPath,
        childStatus: terminalMissingArtifact.status,
      }),
      subagentFixtureChildThread({
        id: "child-artifact",
        title: "Completed summarizer with artifact",
        subagentRunId: completedWithArtifact.id,
        canonicalTaskPath: completedWithArtifact.canonicalTaskPath,
        childStatus: completedWithArtifact.status,
      }),
      subagentFixtureChildThread({
        id: "orphan-child",
        title: "Orphan child",
        subagentRunId: "missing-run",
        canonicalTaskPath: "root/9:orphan",
      }),
    ],
    runs: [activeRun, terminalMissingArtifact, completedWithArtifact],
    runEvents: [
      subagentFixtureRunEvent({
        runId: activeRun.id,
        type: "subagent.lifecycle_started",
        preview: { fixture: "active started" },
      }),
      subagentFixtureRunEvent({
        runId: terminalMissingArtifact.id,
        type: "subagent.lifecycle_started",
        preview: { fixture: "terminal started" },
      }),
      subagentFixtureRunEvent({
        runId: completedWithArtifact.id,
        type: "subagent.lifecycle_started",
        preview: { fixture: "artifact started" },
      }),
      subagentFixtureRunEvent({
        runId: completedWithArtifact.id,
        sequence: 2,
        type: "subagent.completed",
        preview: { fixture: "artifact completed" },
        artifactPath: ".ambient-codex/subagents/run-artifact/result.json",
      }),
      subagentFixtureRunEvent({
        runId: completedWithArtifact.id,
        sequence: 3,
        type: "subagent.lifecycle_stopped",
        preview: { fixture: "artifact stopped" },
        artifactPath: ".ambient-codex/subagents/run-artifact/result.json",
      }),
    ],
    spawnEdges: [
      subagentFixtureSpawnEdge({
        childRunId: activeRun.id,
        childThreadId: activeRun.childThreadId,
        canonicalTaskPath: activeRun.canonicalTaskPath,
        status: activeRun.status,
      }),
      subagentFixtureSpawnEdge({
        childRunId: completedWithArtifact.id,
        childThreadId: completedWithArtifact.childThreadId,
        canonicalTaskPath: completedWithArtifact.canonicalTaskPath,
        status: completedWithArtifact.status,
      }),
      subagentFixtureSpawnEdge({
        childRunId: "missing-run",
        childThreadId: "dangling-child",
        canonicalTaskPath: "root/8:dangling",
        status: "reserved",
      }),
    ],
    waitBarriers: [
      subagentFixtureWaitBarrier({
        id: "barrier-required",
        childRunIds: [activeRun.id, "missing-run"],
      }),
    ],
    parentMailboxEvents: [
      subagentFixtureParentMailboxEvent({
        id: "parent-mailbox-grouped-completion",
        parentMessageId: "parent-message-2",
        type: "subagent.grouped_completion",
        payload: {
          schemaVersion: "ambient-subagent-grouped-completion-v1",
          parentThreadId: SUBAGENT_FIXTURE_PARENT_THREAD_ID,
          parentRunId: SUBAGENT_FIXTURE_PARENT_RUN_ID,
          parentMessageId: "parent-message-2",
          status: "queued",
          notificationCount: 2,
          childRuns: [{
            runId: terminalMissingArtifact.id,
            childThreadId: terminalMissingArtifact.childThreadId,
            canonicalTaskPath: terminalMissingArtifact.canonicalTaskPath,
            roleId: terminalMissingArtifact.roleId,
            status: terminalMissingArtifact.status,
            summary: "Completed reviewer fixture without a result artifact.",
            completedAt: terminalMissingArtifact.completedAt,
          }, {
            runId: completedWithArtifact.id,
            childThreadId: completedWithArtifact.childThreadId,
            canonicalTaskPath: completedWithArtifact.canonicalTaskPath,
            roleId: completedWithArtifact.roleId,
            status: completedWithArtifact.status,
            summary: "Completed summarizer fixture with artifact pointers.",
            completedAt: completedWithArtifact.completedAt,
          }],
        },
        idempotencyKey: "subagent:grouped_completion_notification:fixture",
        createdAt: "2026-06-05T00:00:11.000Z",
      }),
    ],
    transcript: subagentFixtureTranscript({
      childThreadId: activeRun.childThreadId,
      childRunId: activeRun.id,
    }),
    runtimeEvents: subagentFixtureRuntimeEvents(activeRun),
    expectedIssueKinds: [
      "active_run_interrupted",
      "missing_lifecycle_stop",
      "missing_spawn_edge",
      "missing_result_artifact",
      "dangling_spawn_edge",
      "orphan_child_thread",
      "dangling_wait_barrier_child",
    ],
  };
}

function compactParentMailboxItem(
  event: SubagentParentMailboxEventSummary,
  sequence: number,
  maxPreviewChars: number,
): SubagentReplayParentMailboxItem {
  return {
    sequence,
    id: event.id,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    parentThreadId: event.parentThreadId,
    parentRunId: event.parentRunId,
    ...(event.parentMessageId ? { parentMessageId: event.parentMessageId } : {}),
    type: event.type,
    deliveryState: event.deliveryState,
    childRunIds: childRunIdsFromParentMailboxPayload(event.payload),
    ...(event.idempotencyKey ? { idempotencyKey: event.idempotencyKey } : {}),
    ...(parentMailboxPayloadPreview(event, maxPreviewChars) ? { payloadPreview: parentMailboxPayloadPreview(event, maxPreviewChars) } : {}),
  };
}

const terminalRunStatuses = new Set(["completed", "failed", "stopped", "cancelled", "timed_out", "detached", "aborted_partial"]);

function resultArtifactPointerForRun(run: SubagentRunSummary): SubagentReplayRehydrationProof["resultArtifactPointers"] {
  const artifact = objectValue(run.resultArtifact);
  if (artifact.schemaVersion !== "ambient-subagent-result-artifact-v1") return [];
  return [{
    runId: run.id,
    childThreadId: stringValue(artifact.childThreadId) ?? run.childThreadId,
    status: stringValue(artifact.status) ?? run.status,
    ...(stringValue(artifact.artifactPath) ? { artifactPath: stringValue(artifact.artifactPath) } : {}),
    ...(stringValue(artifact.fullOutputPath) ? { fullOutputPath: stringValue(artifact.fullOutputPath) } : {}),
    ...(stringValue(artifact.structuredOutputPath) ? { structuredOutputPath: stringValue(artifact.structuredOutputPath) } : {}),
  }];
}

function uniqueSortedStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))].sort();
}

function compactTimelineItem(input: SubagentReplayTimelineItem, maxPreviewChars: number): SubagentReplayTimelineItem {
  return {
    sequence: input.sequence,
    createdAt: input.createdAt,
    runId: input.runId,
    parentRunId: input.parentRunId,
    childThreadId: input.childThreadId,
    ...(input.canonicalTaskPath ? { canonicalTaskPath: input.canonicalTaskPath } : {}),
    ...(input.roleId ? { roleId: input.roleId } : {}),
    ...(input.source ? { source: input.source } : {}),
    type: input.type,
    ...(input.status ? { status: input.status } : {}),
    ...(input.toolName ? { toolName: input.toolName } : {}),
    ...(input.textPreview ? { textPreview: boundedPreview(input.textPreview, maxPreviewChars) } : {}),
    ...(input.messagePreview ? { messagePreview: boundedPreview(input.messagePreview, maxPreviewChars) } : {}),
    ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
  };
}

function parentMailboxPayloadPreview(event: SubagentParentMailboxEventSummary, maxPreviewChars: number): string | undefined {
  const payload = objectValue(event.payload);
  if (event.type === "subagent.grouped_completion") {
    const childRuns = Array.isArray(payload.childRuns)
      ? payload.childRuns.flatMap((item) => {
          const child = objectValue(item);
          const summary = stringValue(child.summary);
          const runId = stringValue(child.runId) ?? stringValue(child.childRunId) ?? stringValue(child.id);
          const status = stringValue(child.status);
          const text = [runId, status, summary].filter(Boolean).join(": ");
          return text ? [text] : [];
        })
      : [];
    if (childRuns.length) return boundedPreview(childRuns.join("; "), maxPreviewChars);
  }
  const summary = stringValue(payload.summary);
  if (summary) return boundedPreview(summary, maxPreviewChars);
  return previewValue(event.payload, maxPreviewChars);
}

function childRunIdsFromParentMailboxPayload(payload: unknown): string[] {
  const refs = new Set<string>();
  const record = objectValue(payload);
  addStringRef(refs, record, "childRunId");
  addStringRef(refs, record, "runId");
  addStringArrayRefs(refs, record, "childRunIds");
  addStringArrayRefs(refs, record, "cancelledRunIds");
  addStringArrayRefs(refs, record, "detachedRunIds");
  addStringArrayRefs(refs, record, "unchangedRunIds");
  addStringArrayRefs(refs, record, "stoppedChildRunIds");
  addRecordArrayRefs(refs, record.childRuns, ["runId", "childRunId", "id"]);
  addRecordArrayRefs(refs, record.childStatuses, ["childRunId", "runId"]);
  const waitBarrier = objectValue(record.waitBarrier);
  addStringArrayRefs(refs, waitBarrier, "childRunIds");
  const parentResolution = objectValue(record.parentResolution);
  addStringRef(refs, parentResolution, "childRunId");
  return [...refs].sort();
}

function addStringRef(refs: Set<string>, record: Record<string, unknown>, key: string): void {
  const value = record[key];
  if (typeof value === "string" && value) refs.add(value);
}

function addStringArrayRefs(refs: Set<string>, record: Record<string, unknown>, key: string): void {
  const value = record[key];
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === "string" && item) refs.add(item);
  }
}

function addRecordArrayRefs(refs: Set<string>, value: unknown, keys: string[]): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    const record = objectValue(item);
    for (const key of keys) addStringRef(refs, record, key);
  }
}

function previewValue(value: unknown, maxPreviewChars: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return boundedPreview(value, maxPreviewChars);
  return boundedPreview(JSON.stringify(value) ?? String(value), maxPreviewChars);
}

function boundedPreview(value: string, maxPreviewChars: number): string {
  if (value.length <= maxPreviewChars) return value;
  return `${value.slice(0, maxPreviewChars)}\n[truncated ${value.length - maxPreviewChars} chars]`;
}

function positivePreviewLimit(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 280;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
