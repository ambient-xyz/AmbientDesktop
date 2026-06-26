import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import { resolveAmbientFeatureFlags, type AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { DesktopState } from "../../shared/desktopTypes";
import type {
  CreateWorkflowLabRunInput,
  ListWorkflowLabRunsInput,
  SaveSymphonyWorkflowRecipeInput,
  WorkflowDashboard,
  WorkflowLabRun,
  WorkflowRecordingLibraryDescription,
  WorkflowRecordingLibraryEntry,
  WorkflowRecordingReviewDraftUpdate,
  WorkflowRunDetail,
} from "../../shared/workflowTypes";
import {
  registerWorkflowDashboardIpc,
  registerWorkflowLabIpc,
  registerWorkflowRecorderIpc,
  workflowDashboardIpcChannels,
  workflowLabIpcChannels,
  workflowRecorderIpcChannels,
  type RegisterWorkflowDashboardIpcDependencies,
  type RegisterWorkflowLabIpcDependencies,
} from "./registerWorkflowIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

interface FakeThread {
  id: string;
  workspacePath: string;
  gitWorktree?: { path: string };
}

interface FakeStore {
  getWorkspace: ReturnType<typeof vi.fn<() => { path: string }>>;
  createWorkflowRecordingThread: ReturnType<typeof vi.fn<(input: { goal?: string; workspacePath: string }) => FakeThread>>;
  stopWorkflowRecording: ReturnType<typeof vi.fn<(threadId: string) => void>>;
  updateWorkflowRecordingReviewDraft: ReturnType<typeof vi.fn<(threadId: string, draft: WorkflowRecordingReviewDraftUpdate) => void>>;
  confirmWorkflowRecordingReview: ReturnType<typeof vi.fn<(threadId: string) => void>>;
  applyWorkflowRecordingSummary: ReturnType<typeof vi.fn<(threadId: string, messageId?: string) => void>>;
  describeWorkflowRecording: ReturnType<
    typeof vi.fn<(id: string, options: { includeArchived?: boolean }) => WorkflowRecordingLibraryDescription>
  >;
  setWorkflowRecordingEnabled: ReturnType<typeof vi.fn<(id: string, enabled: boolean) => void>>;
  updateWorkflowRecordingPlaybook: ReturnType<
    typeof vi.fn<
      (
        id: string,
        input: {
          baseVersion: number;
          draft: WorkflowRecordingReviewDraftUpdate;
          title?: string;
        },
      ) => void
    >
  >;
  saveSymphonyWorkflowRecipe: ReturnType<
    typeof vi.fn<
      (
        input: SaveSymphonyWorkflowRecipeInput,
        options: { featureFlagSnapshot: AmbientFeatureFlagSnapshot },
      ) => WorkflowRecordingLibraryDescription
    >
  >;
  archiveWorkflowRecording: ReturnType<
    typeof vi.fn<
      (
        id: string,
        input: {
          baseVersion: number;
          reason?: string;
        },
      ) => void
    >
  >;
  unarchiveWorkflowRecording: ReturnType<typeof vi.fn<(id: string, input: { baseVersion: number }) => void>>;
  restoreWorkflowRecordingVersion: ReturnType<typeof vi.fn<(id: string, version: number) => void>>;
}

interface FakeHost {
  activeThreadId: string;
  runtime: {
    requestWorkflowRecordingReview: ReturnType<typeof vi.fn<(input: { threadId: string; feedback?: string }) => Promise<void>>>;
  };
  store: FakeStore;
}

interface FakeWorkflowLabStore {
  createWorkflowLabRun: ReturnType<typeof vi.fn<(input: CreateWorkflowLabRunInput) => WorkflowLabRun>>;
  listWorkflowLabRuns: ReturnType<typeof vi.fn<(input: ListWorkflowLabRunsInput) => WorkflowLabRun[]>>;
  getWorkflowLabRun: ReturnType<typeof vi.fn<(runId: string) => WorkflowLabRun>>;
  updateWorkflowLabRunStatus: ReturnType<typeof vi.fn<(runId: string, status: "stopped") => WorkflowLabRun>>;
  adoptWorkflowLabVariant: ReturnType<typeof vi.fn<(runId: string, variantId: string) => WorkflowRecordingLibraryDescription>>;
}

interface FakeWorkflowLabHost {
  activeThreadId: string;
  store: FakeWorkflowLabStore;
}

interface FakeWorkflowDashboardStore {
  getWorkspace: ReturnType<typeof vi.fn<() => { path: string }>>;
}

interface FakeWorkflowDashboardHost {
  store: FakeWorkflowDashboardStore;
  workspacePath: string;
}

const state = { marker: "desktop-state" } as unknown as DesktopState;
const thread = { id: "thread-1", workspacePath: "/workspace" } satisfies FakeThread;
const preparedThread = {
  ...thread,
  gitWorktree: { path: "/workspace/.ambient/worktrees/thread-1" },
} satisfies FakeThread;

const reviewDraft = {
  intent: "Summarize weekly customer updates",
  inputs: ["A workspace with exported CRM notes"],
  successfulExamples: [
    {
      toolName: "workspace:read-file",
      inputPreview: "notes.md",
      resultPreview: "Read the notes",
      artifactPath: ".ambient/workflows/notes.md",
    },
  ],
  doNot: [
    {
      toolName: "browser:search",
      status: "skipped",
      reason: "Do not search the web for private customer notes.",
    },
  ],
  validation: ["Summary cites each customer"],
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

const workflowDashboard = {
  artifacts: [],
  runs: [],
} satisfies WorkflowDashboard;

const workflowRunDetail = {
  marker: "workflow-run-detail",
} as unknown as WorkflowRunDetail;

describe("registerWorkflowRecorderIpc", () => {
  it("registers the workflow recorder channels", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowRecorderIpcChannels]);
  });

  it("starts a recording thread and prepares a worktree for the workspace root", async () => {
    const { deps, host, invoke, store } = registerWithFakes();

    await expect(invoke("workflow-recorder:start", { goal: " Record a summary ", workspacePath: "/workspace" })).resolves.toBe(state);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(store.createWorkflowRecordingThread).toHaveBeenCalledWith({
      goal: "Record a summary",
      workspacePath: "/workspace",
    });
    expect(deps.prepareWorktreeForThread).toHaveBeenCalledWith(thread, store);
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host, "thread-1");
  });

  it("stops a recording through the project host for the thread action", async () => {
    const { deps, host, invoke, store } = registerWithFakes();

    await expect(invoke("workflow-recorder:stop", { threadId: "thread-1", projectId: "project-1" })).resolves.toBe(state);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.requireProjectRuntimeHostForThreadAction).toHaveBeenCalledWith({ threadId: "thread-1", projectId: "project-1" }, host);
    expect(store.stopWorkflowRecording).toHaveBeenCalledWith("thread-1");
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "thread-1");
  });

  it("requests review with trimmed feedback", async () => {
    const { host, invoke, store } = registerWithFakes();

    await expect(invoke("workflow-recorder:request-review", { threadId: "thread-1", feedback: " Tighten this " })).resolves.toBeUndefined();

    expect(store.stopWorkflowRecording).not.toHaveBeenCalled();
    expect(host.runtime.requestWorkflowRecordingReview).toHaveBeenCalledWith({
      threadId: "thread-1",
      feedback: "Tighten this",
    });
  });

  it("searches the global workflow recording library with parsed filters", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(
      invoke("workflow-recorder:search", {
        query: " customer ",
        includeDisabled: true,
        includeArchived: true,
        limit: 5,
      }),
    ).resolves.toEqual([libraryEntry]);

    expect(deps.listGlobalWorkflowRecordingLibrary).toHaveBeenCalledWith({
      query: "customer",
      includeDisabled: true,
      includeArchived: true,
      limit: 5,
    });
  });

  it("updates a saved playbook and emits library state changes", async () => {
    const { deps, host, invoke, store } = registerWithFakes();

    await expect(
      invoke("workflow-recorder:update-playbook", {
        id: "workflow-1",
        baseVersion: 2,
        title: " Updated customer summary ",
        draft: reviewDraft,
      }),
    ).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForWorkflowRecording).toHaveBeenCalledWith("workflow-1");
    expect(store.updateWorkflowRecordingPlaybook).toHaveBeenCalledWith("workflow-1", {
      baseVersion: 2,
      title: "Updated customer summary",
      draft: reviewDraft,
    });
    expect(deps.emitWorkflowRecordingLibraryStateChanged).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host, "thread-1");
  });

  it("saves a Symphony recipe through the active thread host when subagents are enabled", async () => {
    const { deps, host, invoke, store } = registerWithFakes();

    await expect(
      invoke("workflow-recorder:save-symphony-recipe", {
        threadId: "thread-1",
        projectId: "project-1",
        patternId: "map_reduce",
        goal: "  Compare all workflow docs  ",
        blocking: true,
        stepAnswers: {
          "pattern-scope": {
            choiceId: "files",
            customText: "  Focus on implementation plans  ",
          },
        },
        metricCustomizations: {
          "map_reduce-metric": "  Every file is cited exactly once  ",
        },
      }),
    ).resolves.toBe(state);

    const expectedInput = {
      threadId: "thread-1",
      projectId: "project-1",
      patternId: "map_reduce",
      goal: "Compare all workflow docs",
      blocking: true,
      stepAnswers: {
        "pattern-scope": {
          choiceId: "files",
          customText: "Focus on implementation plans",
        },
      },
      metricCustomizations: {
        "map_reduce-metric": "Every file is cited exactly once",
      },
    };
    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.requireProjectRuntimeHostForThreadAction).toHaveBeenCalledWith(expectedInput, host);
    expect(deps.getFeatureFlagSnapshot).toHaveBeenCalledWith(store);
    expect(store.saveSymphonyWorkflowRecipe).toHaveBeenCalledWith(expectedInput, {
      featureFlagSnapshot: resolveAmbientFeatureFlags({
        settings: { subagents: true },
        generatedAt: "2026-06-07T18:00:00.000Z",
      }),
    });
    expect(deps.emitWorkflowRecordingLibraryStateChanged).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host, "thread-1");
  });

  it("rejects Symphony recipe saves before touching the store when subagents are disabled", async () => {
    const { deps, invoke, store } = registerWithFakes({ subagentsEnabled: false });

    await expect(
      invoke("workflow-recorder:save-symphony-recipe", {
        threadId: "thread-1",
        patternId: "map_reduce",
        goal: "Compare all workflow docs",
        metricCustomizations: {
          "map_reduce-metric": "Every file is cited exactly once.",
        },
      }),
    ).rejects.toThrow("ambient.subagents is off");

    expect(deps.getFeatureFlagSnapshot).toHaveBeenCalledWith(store);
    expect(store.saveSymphonyWorkflowRecipe).not.toHaveBeenCalled();
    expect(deps.emitWorkflowRecordingLibraryStateChanged).not.toHaveBeenCalled();
  });

  it("rejects incomplete Symphony recipe criteria before touching the store", async () => {
    const { deps, invoke, store } = registerWithFakes();

    await expect(
      invoke("workflow-recorder:save-symphony-recipe", {
        threadId: "thread-1",
        patternId: "imitate_and_verify",
        goal: "Create verifier recipe",
      }),
    ).rejects.toThrow("Complete required verifier criteria before saving the Symphony recipe.");

    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(store.saveSymphonyWorkflowRecipe).not.toHaveBeenCalled();
    expect(deps.emitWorkflowRecordingLibraryStateChanged).not.toHaveBeenCalled();
  });

  it("rejects invalid thread-action input before resolving hosts", async () => {
    const { deps, invoke, store } = registerWithFakes();

    await expect(invoke("workflow-recorder:stop", { threadId: "" })).rejects.toThrow();

    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(deps.requireProjectRuntimeHostForThreadAction).not.toHaveBeenCalled();
    expect(store.stopWorkflowRecording).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowDashboardIpc", () => {
  it("registers the workflow dashboard channels", () => {
    const { handlers } = registerDashboardWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowDashboardIpcChannels]);
  });

  it("lists the dashboard through the active project host", async () => {
    const { deps, invoke, store } = registerDashboardWithFakes();

    await expect(invoke("workflow:list-dashboard")).resolves.toBe(workflowDashboard);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.readWorkflowDashboard).toHaveBeenCalledWith(store);
  });

  it("reads run detail through the run owner host", async () => {
    const { deps, invoke, store } = registerDashboardWithFakes();

    await expect(invoke("workflow:run-detail", { runId: "run-1" })).resolves.toBe(workflowRunDetail);

    expect(deps.requireProjectRuntimeHostForWorkflowRun).toHaveBeenCalledWith("run-1");
    expect(deps.readWorkflowRunDetail).toHaveBeenCalledWith(store, "run-1");
  });

  it("creates sample artifacts with the store workspace and emits workflow updates", async () => {
    const { deps, host, invoke, store } = registerDashboardWithFakes();

    await expect(invoke("workflow:create-sample")).resolves.toBe(workflowDashboard);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(store.getWorkspace).toHaveBeenCalledOnce();
    expect(deps.createWorkflowSampleArtifact).toHaveBeenCalledWith(store, "/workspace");
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
  });

  it("rejects invalid run-detail input before resolving hosts", async () => {
    const { deps, invoke } = registerDashboardWithFakes();

    await expect(invoke("workflow:run-detail", { runId: "" })).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowRun).not.toHaveBeenCalled();
    expect(deps.readWorkflowRunDetail).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowLabIpc", () => {
  it("registers the workflow lab channels", () => {
    const { handlers } = registerLabWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowLabIpcChannels]);
  });

  it("creates lab runs through the workflow recording host", async () => {
    const { deps, invoke, store } = registerLabWithFakes();

    await expect(
      invoke("workflow-lab:create-run", {
        workflowId: " workflow-1 ",
        goal: " Improve robustness ",
        metricEmphasis: "reliability",
        attemptBudget: 3,
        plateauThreshold: 0.8,
        heldOutEnabled: true,
      }),
    ).resolves.toBe(labRun);

    expect(deps.requireProjectRuntimeHostForWorkflowRecording).toHaveBeenCalledWith("workflow-1");
    expect(store.createWorkflowLabRun).toHaveBeenCalledWith({
      workflowId: "workflow-1",
      goal: "Improve robustness",
      metricEmphasis: "reliability",
      attemptBudget: 3,
      plateauThreshold: 0.8,
      heldOutEnabled: true,
    });
  });

  it("lists workflow-specific lab runs through the owning workflow host", async () => {
    const { deps, invoke, store } = registerLabWithFakes();

    await expect(invoke("workflow-lab:list-runs", { workflowId: " workflow-1 ", limit: 5 })).resolves.toEqual([labRun]);

    expect(deps.requireProjectRuntimeHostForWorkflowRecording).toHaveBeenCalledWith("workflow-1");
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(store.listWorkflowLabRuns).toHaveBeenCalledWith({ workflowId: "workflow-1", limit: 5 });
  });

  it("starts lab runs through the injected runner and emits state", async () => {
    const { deps, host, invoke } = registerLabWithFakes();

    await expect(invoke("workflow-lab:start-run", { runId: " lab-run-1 " })).resolves.toBe(runningLabRun);

    expect(deps.requireProjectRuntimeHostForWorkflowLabRun).toHaveBeenCalledWith("lab-run-1");
    expect(deps.startWorkflowLabRun).toHaveBeenCalledWith(host, { runId: "lab-run-1" });
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "thread-1");
  });

  it("adopts lab variants and emits workflow library state", async () => {
    const { deps, host, invoke, store } = registerLabWithFakes();

    await expect(invoke("workflow-lab:adopt-variant", { runId: " lab-run-1 ", variantId: " variant-1 " })).resolves.toBe(state);

    expect(deps.requireProjectRuntimeHostForWorkflowLabRun).toHaveBeenCalledWith("lab-run-1");
    expect(store.adoptWorkflowLabVariant).toHaveBeenCalledWith("lab-run-1", "variant-1");
    expect(deps.emitWorkflowRecordingLibraryStateChanged).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host, "thread-1");
  });

  it("rejects invalid lab run input before resolving hosts", async () => {
    const { deps, invoke, store } = registerLabWithFakes();

    await expect(invoke("workflow-lab:stop-run", { runId: "" })).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowLabRun).not.toHaveBeenCalled();
    expect(store.updateWorkflowLabRunStatus).not.toHaveBeenCalled();
  });
});

function registerWithFakes(options: { createdThread?: FakeThread; subagentsEnabled?: boolean } = {}) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeStore = {
    getWorkspace: vi.fn(() => ({ path: "/workspace" })),
    createWorkflowRecordingThread: vi.fn(() => options.createdThread ?? thread),
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
  };
  const host: FakeHost = {
    activeThreadId: "thread-1",
    runtime: {
      requestWorkflowRecordingReview: vi.fn(() => Promise.resolve()),
    },
    store,
  };
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    requireProjectRuntimeHostForThreadAction: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowRecording: vi.fn(() => host),
    prepareWorktreeForThread: vi.fn(() => Promise.resolve(preparedThread)),
    setProjectHostActiveThreadId: vi.fn((targetHost: FakeHost, threadId: string) => {
      targetHost.activeThreadId = threadId;
    }),
    emitProjectStateIfActive: vi.fn(),
    emitWorkflowRecordingLibraryStateChanged: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => state),
    listGlobalWorkflowRecordingLibrary: vi.fn(() => [libraryEntry]),
    getFeatureFlagSnapshot: vi.fn(() =>
      resolveAmbientFeatureFlags({
        settings: { subagents: options.subagentsEnabled ?? true },
        generatedAt: "2026-06-07T18:00:00.000Z",
      }),
    ),
  };
  registerWorkflowRecorderIpc(deps);

  return {
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerDashboardWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowDashboardStore = {
    getWorkspace: vi.fn(() => ({ path: "/workspace" })),
  };
  const host: FakeWorkflowDashboardHost = {
    store,
    workspacePath: "/runtime-workspace",
  };
  const deps: RegisterWorkflowDashboardIpcDependencies<FakeWorkflowDashboardStore, FakeWorkflowDashboardHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowRun: vi.fn(() => host),
    readWorkflowDashboard: vi.fn(() => workflowDashboard),
    readWorkflowRunDetail: vi.fn(() => workflowRunDetail),
    createWorkflowSampleArtifact: vi.fn(() => workflowDashboard),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowDashboardIpc(deps);

  return {
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerLabWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowLabStore = {
    createWorkflowLabRun: vi.fn(() => labRun),
    listWorkflowLabRuns: vi.fn(() => [labRun]),
    getWorkflowLabRun: vi.fn(() => labRun),
    updateWorkflowLabRunStatus: vi.fn(() => stoppedLabRun),
    adoptWorkflowLabVariant: vi.fn(() => libraryDescription),
  };
  const host: FakeWorkflowLabHost = {
    activeThreadId: "thread-1",
    store,
  };
  const deps: RegisterWorkflowLabIpcDependencies<FakeWorkflowLabStore, FakeWorkflowLabHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowRecording: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowLabRun: vi.fn(() => host),
    emitProjectStateIfActive: vi.fn(),
    emitWorkflowRecordingLibraryStateChanged: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => state),
    startWorkflowLabRun: vi.fn(() => Promise.resolve(runningLabRun)),
  };
  registerWorkflowLabIpc(deps);

  return {
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}
