import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { DesktopState } from "../../shared/desktopTypes";
import type { ModelRuntimeSettings } from "../../shared/threadTypes";
import type {
  WorkflowLabRun,
  WorkflowRecordingLibraryDescription,
  WorkflowRecordingLibraryEntry,
  WorkflowRecordingReviewDraftUpdate,
} from "../../shared/workflowTypes";
import {
  workflowLabIpcChannels,
  workflowRecorderIpcChannels,
} from "./registerWorkflowIpc";
import {
  registerWorkflowRecordingLabDomainIpc,
  workflowRecordingLabDomainIpcChannels,
  type RegisterWorkflowRecordingLabDomainIpcDependencies,
  type WorkflowRecordingLabJudgeProvider,
} from "./registerWorkflowRecordingLabDomainIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerWorkflowRecordingLabDomainIpc", () => {
  it("registers workflow recorder and lab channels in the previous main registrar order", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowRecordingLabDomainIpcChannels]);
    expect([...workflowRecordingLabDomainIpcChannels]).toEqual([
      ...workflowRecorderIpcChannels,
      ...workflowLabIpcChannels,
    ]);
  });

  it("routes recorder actions through the existing recorder registrar dependencies", async () => {
    const { deps, host, invoke, store, thread } = registerWithFakes();

    await expect(invoke("workflow-recorder:start", { goal: " Improve customer summary ", workspacePath: "/workspace" }))
      .resolves.toBe(desktopState);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(store.createWorkflowRecordingThread).toHaveBeenCalledWith({
      goal: "Improve customer summary",
      workspacePath: "/workspace",
    });
    expect(deps.prepareWorktreeForThread).toHaveBeenCalledWith(thread, store);
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "thread-1");
  });

  it("creates the Ambient workflow lab judge from host model-runtime settings", async () => {
    const retryPolicy = {
      enabled: true,
      maxRetries: 2,
      backoffMs: [10, 20],
      providerMaxRetryDelayMs: 100,
    };
    const { deps, host, invoke, judge, JudgeProvider } = registerWithFakes({
      retryPolicy,
    });

    await expect(invoke("workflow-lab:start-run", { runId: " lab-run-1 " })).resolves.toBe(runningLabRun);

    expect(deps.requireProjectRuntimeHostForWorkflowLabRun).toHaveBeenCalledWith("lab-run-1");
    expect(deps.getAmbientProviderStatus).toHaveBeenCalledWith("<model>");
    expect(deps.ambientRetryPolicyFromSettings).toHaveBeenCalledWith({ modelRuntime: host.store.modelRuntime });
    expect(JudgeProvider).toHaveBeenCalledWith({
      model: "<model>",
      baseUrl: "https://ambient.example",
      idleTimeoutMs: 30_000,
      retryPolicy,
    });
    expect(deps.runWorkflowLab).toHaveBeenCalledWith(host.store, "lab-run-1", {
      judge: expect.any(Function),
    });
    const options = vi.mocked(deps.runWorkflowLab).mock.calls[0]![2]!;
    await expect(options.judge!(sampleJudgeInput())).resolves.toEqual(judge.result);
    expect(judge.judge).toHaveBeenCalledOnce();
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "thread-1");
  });

  it("omits aggressive retry policy when model runtime retries are disabled", async () => {
    const { deps, invoke, JudgeProvider } = registerWithFakes({
      modelRuntime: sampleModelRuntimeSettings({ aggressiveRetries: false }),
    });

    await expect(invoke("workflow-lab:start-run", { runId: "lab-run-1" })).resolves.toBe(runningLabRun);

    expect(deps.ambientRetryPolicyFromSettings).not.toHaveBeenCalled();
    expect(JudgeProvider).toHaveBeenCalledWith({
      model: "<model>",
      baseUrl: "https://ambient.example",
      idleTimeoutMs: 30_000,
      retryPolicy: undefined,
    });
  });
});

function registerWithFakes({
  modelRuntime = sampleModelRuntimeSettings(),
  retryPolicy = sampleRetryPolicy(),
}: {
  modelRuntime?: ModelRuntimeSettings;
  retryPolicy?: ReturnType<RegisterWorkflowRecordingLabDomainIpcDependencies["ambientRetryPolicyFromSettings"]>;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const thread = {
    id: "thread-1",
    workspacePath: "/workspace",
  };
  const preparedThread = {
    ...thread,
    gitWorktree: { path: "/workspace/.ambient/worktrees/thread-1" },
  };
  const judge: WorkflowRecordingLabJudgeProvider & { result: ReturnType<typeof sampleJudgeResult> } = {
    result: sampleJudgeResult(),
    judge: vi.fn(async () => judge.result),
  };
  const JudgeProviderMock = vi.fn(function () {
    return judge;
  });
  const runWorkflowLab = vi.fn<RegisterWorkflowRecordingLabDomainIpcDependencies["runWorkflowLab"]>(async () => runningLabRun);
  const store = {
    modelRuntime,
    getDefaultSettings: vi.fn(() => ({ model: "<model>" })),
    getModelRuntimeSettings: vi.fn(() => modelRuntime),
    getWorkspace: vi.fn(() => ({ path: "/workspace" })),
    createWorkflowRecordingThread: vi.fn(() => thread),
    stopWorkflowRecording: vi.fn(),
    updateWorkflowRecordingReviewDraft: vi.fn(),
    confirmWorkflowRecordingReview: vi.fn(),
    applyWorkflowRecordingSummary: vi.fn(),
    describeWorkflowRecording: vi.fn(() => libraryDescription),
    setWorkflowRecordingEnabled: vi.fn(),
    updateWorkflowRecordingPlaybook: vi.fn(),
    saveSymphonyWorkflowRecipe: vi.fn(() => libraryDescription),
    archiveWorkflowRecording: vi.fn(),
    unarchiveWorkflowRecording: vi.fn(),
    restoreWorkflowRecordingVersion: vi.fn(),
    createWorkflowLabRun: vi.fn(() => labRun),
    listWorkflowLabRuns: vi.fn(() => [labRun]),
    getWorkflowLabRun: vi.fn(() => labRun),
    updateWorkflowLabRunStatus: vi.fn(() => stoppedLabRun),
    adoptWorkflowLabVariant: vi.fn(() => libraryDescription),
  };
  const host = {
    activeThreadId: "thread-1",
    runtime: {
      requestWorkflowRecordingReview: vi.fn(),
    },
    store,
  };
  const deps = {
    AmbientWorkflowLabJudgeProvider: JudgeProviderMock as unknown as RegisterWorkflowRecordingLabDomainIpcDependencies["AmbientWorkflowLabJudgeProvider"],
    ambientRetryPolicyFromSettings: vi.fn(() => retryPolicy),
    emitProjectStateIfActive: vi.fn(),
    emitWorkflowRecordingLibraryStateChanged: vi.fn(),
    getAmbientProviderStatus: vi.fn(() => ({
      model: "<model>",
      baseUrl: "https://ambient.example",
    })),
    getFeatureFlagSnapshot: vi.fn(() =>
      resolveAmbientFeatureFlags({
        settings: { subagents: true },
        generatedAt: "2026-06-16T00:00:00.000Z",
      }),
    ),
    handleIpc: (channel: string, listener: IpcListener) => handlers.set(channel, listener),
    listGlobalWorkflowRecordingLibrary: vi.fn(() => [libraryEntry]),
    prepareWorktreeForThread: vi.fn(async () => preparedThread),
    readStateForProjectHostAction: vi.fn(() => desktopState),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    requireProjectRuntimeHostForThreadAction: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowLabRun: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowRecording: vi.fn(() => host),
    runWorkflowLab,
    setProjectHostActiveThreadId: vi.fn((targetHost: typeof host, threadId: string) => {
      targetHost.activeThreadId = threadId;
    }),
  };

  registerWorkflowRecordingLabDomainIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
    judge,
    JudgeProvider: JudgeProviderMock,
    store,
    thread,
  };
}

function sampleModelRuntimeSettings(overrides: Partial<ModelRuntimeSettings> = {}): ModelRuntimeSettings {
  return {
    aggressiveRetries: true,
    providerPreStreamTimeoutMs: 10_000,
    providerStreamIdleTimeoutMs: 30_000,
    installedProviders: [],
    ...overrides,
  };
}

function sampleRetryPolicy(): ReturnType<RegisterWorkflowRecordingLabDomainIpcDependencies["ambientRetryPolicyFromSettings"]> {
  return {
    enabled: true,
    maxRetries: 2,
    backoffMs: [10, 20],
    providerMaxRetryDelayMs: 100,
  };
}

function sampleJudgeInput() {
  return {
    run: labRun,
    workflow: libraryDescription,
    variant: {
      id: "variant-1",
      runId: "lab-run-1",
      attempt: 1,
      hypothesis: "Tighten criteria.",
      patch: {
        draft: reviewDraft,
        summary: "Patch summary",
        changedFields: [],
      },
      status: "evaluating" as const,
      createdAt: "2026-06-16T00:00:00.000Z",
      updatedAt: "2026-06-16T00:00:00.000Z",
      evaluations: [],
    },
    metrics: {
      completed: true,
      toolCallCount: 1,
      retryCount: 0,
      elapsedMs: 1000,
      validationIssueCount: 0,
      explicitValidationCount: 1,
      recoveryCueCount: 0,
    },
    gates: [],
    casePrompt: "Summarize the update.",
  };
}

function sampleJudgeResult() {
  return {
    provider: "ambient" as const,
    score: 0.9,
    clarity: 0.9,
    robustness: 0.8,
    generalization: 0.85,
    intentPreservation: 0.95,
    rationale: "Strong variant.",
    model: "<model>",
  };
}

const desktopState = {
  activeThreadId: "thread-1",
} as DesktopState;

const reviewDraft = {
  intent: "Summarize customer updates.",
  inputs: [],
  successfulExamples: [],
  doNot: [],
  validation: [],
  outputShape: ["Markdown summary"],
} satisfies WorkflowRecordingReviewDraftUpdate;

const libraryEntry = {
  id: "workflow-1",
  title: "Customer update summary",
  version: 2,
  enabled: true,
  savedAt: "2026-01-01T00:00:00.000Z",
  manifestPath: "/workspace/.ambient/workflows/workflow-1/manifest.json",
  markdownPath: "/workspace/.ambient/workflows/workflow-1/playbook.md",
  sidecarPath: "/workspace/.ambient/workflows/workflow-1/sidecar.json",
  transcriptPath: "/workspace/.ambient/workflows/workflow-1/transcript.jsonl",
  summary: "Summarize customer updates.",
  toolNames: ["workspace:read-file"],
  outputShape: ["Markdown summary"],
  versions: [],
} satisfies WorkflowRecordingLibraryEntry;

const libraryDescription = {
  ...libraryEntry,
  markdownPreview: "# Customer update summary",
} satisfies WorkflowRecordingLibraryDescription;

const labRun = {
  id: "lab-run-1",
  workflowId: "workflow-1",
  workflowTitle: "Customer update summary",
  baseVersion: 2,
  goal: "Improve robustness",
  metricEmphasis: "reliability",
  attemptBudget: 3,
  plateauThreshold: 0.8,
  heldOutEnabled: true,
  status: "draft",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  artifactPath: "/workspace/.ambient/workflow-lab/lab-run-1.json",
  evaluationCases: [],
  variants: [],
  audit: [],
} satisfies WorkflowLabRun;

const runningLabRun = {
  ...labRun,
  status: "running",
} satisfies WorkflowLabRun;

const stoppedLabRun = {
  ...labRun,
  status: "stopped",
} satisfies WorkflowLabRun;
