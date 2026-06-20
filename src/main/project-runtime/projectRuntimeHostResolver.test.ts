import { describe, expect, it, vi } from "vitest";
import {
  createProjectRuntimeHostResolver,
  type ProjectRuntimeHostResolverStore,
} from "./projectRuntimeHostResolver";

interface FakeStore extends ProjectRuntimeHostResolverStore {
  workspacePath: string;
  artifactPath: string;
  threads: Array<{ id: string; workspacePath: string }>;
  automationFolders: Array<{ id: string; threads: Array<{ id: string }> }>;
  automationSchedules: Array<{ id: string }>;
  board: {
    runs: Array<{ workspacePath: string }>;
    tasks: Array<{ workspacePath?: string }>;
  };
  records: Record<string, Set<string>>;
}

interface FakeHost {
  id: string;
  workspacePath: string;
  store: FakeStore;
  terminals: {
    has(terminalId: string): boolean;
  };
}

function createStore(input: Partial<FakeStore> = {}): FakeStore {
  const records = input.records ?? {};
  const readRecord = (kind: string, id: string): { id: string } => {
    if (!records[kind]?.has(id)) throw new Error(`${kind} not found: ${id}`);
    return { id };
  };
  return {
    workspacePath: input.workspacePath ?? "/workspace/main",
    artifactPath: input.artifactPath ?? "/workspace/main/artifacts",
    threads: input.threads ?? [],
    automationFolders: input.automationFolders ?? [],
    automationSchedules: input.automationSchedules ?? [],
    board: input.board ?? { runs: [], tasks: [] },
    records,
    getThread(threadId) {
      const thread = this.threads.find((candidate) => candidate.id === threadId);
      if (!thread) throw new Error(`thread not found: ${threadId}`);
      return thread;
    },
    getWorkflowAgentThreadSummary: (id) => readRecord("workflowThread", id),
    describeWorkflowRecording: (id) => readRecord("workflowRecording", id),
    getWorkflowLabRun: (id) => readRecord("workflowLabRun", id),
    getWorkflowDiscoveryQuestion: (id) => readRecord("workflowDiscoveryQuestion", id),
    getWorkflowVersion: (id) => readRecord("workflowVersion", id),
    getPermissionGrant: (id) => readRecord("permissionGrant", id),
    listAutomationFolders() {
      return this.automationFolders;
    },
    listAutomationSchedules() {
      return this.automationSchedules;
    },
    getWorkflowRevision: (id) => readRecord("workflowRevision", id),
    getWorkflowArtifact: (id) => readRecord("workflowArtifact", id),
    getPlannerPlanArtifact: (id) => readRecord("plannerPlanArtifact", id),
    getMessageVoiceState: (id) => records.messageVoiceState?.has(id) ? { id } : undefined,
    getWorkflowRun: (id) => readRecord("workflowRun", id),
    getCallableWorkflowTask: (id) => readRecord("callableWorkflowTask", id),
    getSubagentRun: (id) => readRecord("subagentRun", id),
    getSubagentWaitBarrier: (id) => readRecord("subagentWaitBarrier", id),
    getOrchestrationTask: (id) => readRecord("orchestrationTask", id),
    getOrchestrationRun: (id) => readRecord("orchestrationRun", id),
    listOrchestrationBoard() {
      return this.board;
    },
    getProjectArtifactWorkspacePath() {
      return this.artifactPath;
    },
    listThreads() {
      return this.threads;
    },
  };
}

function createHost(id: string, store = createStore({ workspacePath: `/workspace/${id}` }), terminalIds: string[] = []): FakeHost {
  return {
    id,
    workspacePath: store.workspacePath,
    store,
    terminals: {
      has: (terminalId) => terminalIds.includes(terminalId),
    },
  };
}

function createHarness(input: {
  hosts?: FakeHost[];
  activeHost?: FakeHost;
  registeredPaths?: string[];
  existingPaths?: string[];
  probeStores?: FakeStore[];
} = {}) {
  const hosts = input.hosts ?? [];
  const active = input.activeHost;
  const registeredPaths = input.registeredPaths ?? [];
  const existingPaths = new Set((input.existingPaths ?? []).map((path) => path.toLowerCase()));
  const probeStores = [...(input.probeStores ?? [])];
  const probes: Array<{ openWorkspace: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = [];
  const ensureProjectRuntimeHostForWorkspacePath = vi.fn((workspacePath: string) => {
    const normalized = workspacePath.toLowerCase();
    const existing = hosts.find((host) => host.workspacePath.toLowerCase() === normalized);
    if (existing) return existing;
    const host = createHost(`created-${hosts.length}`, createStore({ workspacePath: normalized }));
    hosts.push(host);
    return host;
  });
  const resolver = createProjectRuntimeHostResolver<FakeHost, FakeStore>({
    normalizeWorkspacePath: (workspacePath) => workspacePath.toLowerCase(),
    projectRuntimeHostList: () => hosts,
    activeProjectRuntimeHost: () => active,
    requireActiveProjectRuntimeHost: () => {
      if (!active) throw new Error("No active project runtime host.");
      return active;
    },
    ensureProjectRuntimeHostForWorkspacePath,
    listRegisteredProjectPaths: () => registeredPaths,
    existsSync: (path) => existingPaths.has(path.toLowerCase()),
    createProjectStore: () => {
      const store = probeStores.shift() ?? createStore();
      const probe = {
        store,
        openWorkspace: vi.fn((workspacePath: string) => {
          store.workspacePath = workspacePath;
          return { path: workspacePath };
        }),
        close: vi.fn(),
      };
      probes.push(probe);
      return probe;
    },
  });
  return { resolver, hosts, probes, ensureProjectRuntimeHostForWorkspacePath };
}

describe("createProjectRuntimeHostResolver", () => {
  it("locates loaded hosts by terminal, thread, and workflow run records", () => {
    const first = createHost("first", createStore({
      workspacePath: "/workspace/first",
      threads: [{ id: "thread-1", workspacePath: "/workspace/first" }],
    }), ["terminal-1"]);
    const second = createHost("second", createStore({
      workspacePath: "/workspace/second",
      records: { workflowRun: new Set(["run-2"]) },
    }));
    const { resolver } = createHarness({ hosts: [first, second], activeHost: first });

    expect(resolver.projectRuntimeHostForTerminal("terminal-1")).toBe(first);
    expect(resolver.requireProjectRuntimeHostForThread("thread-1")).toBe(first);
    expect(resolver.projectRuntimeHostForWorkflowRun("run-2")).toBe(second);
    expect(resolver.requireProjectRuntimeHostForWorkflowRun("run-2")).toBe(second);
  });

  it("falls back to the active host when no loaded host owns a required thread", () => {
    const activeHost = createHost("active", createStore({
      workspacePath: "/workspace/active",
      threads: [{ id: "thread-active", workspacePath: "/workspace/active" }],
    }));
    const { resolver } = createHarness({ activeHost });

    expect(resolver.requireProjectRuntimeHostForThread("thread-active")).toBe(activeHost);
  });

  it("probes registered projects and closes probe stores when records are not loaded", () => {
    const activeHost = createHost("active", createStore({ workspacePath: "/workspace/active" }));
    const registeredStore = createStore({
      workspacePath: "/registered/project",
      records: { workflowArtifact: new Set(["artifact-1"]) },
    });
    const { resolver, probes, ensureProjectRuntimeHostForWorkspacePath } = createHarness({
      hosts: [activeHost],
      activeHost,
      registeredPaths: ["/missing/project", "/REGISTERED/PROJECT"],
      existingPaths: ["/registered/project"],
      probeStores: [registeredStore],
    });

    const host = resolver.requireProjectRuntimeHostForWorkflowArtifact("artifact-1");

    expect(host.workspacePath).toBe("/registered/project");
    expect(ensureProjectRuntimeHostForWorkspacePath).toHaveBeenCalledWith("/registered/project");
    expect(probes).toHaveLength(1);
    expect(probes[0].openWorkspace).toHaveBeenCalledWith("/registered/project", {
      recoverActiveRuns: false,
      recoverOrchestrationRuns: false,
    });
    expect(probes[0].close).toHaveBeenCalledTimes(1);
  });

  it("matches known workspace paths against host, artifact, and thread workspace paths", () => {
    const host = createHost("project", createStore({
      workspacePath: "/workspace/project",
      artifactPath: "/workspace/project/.ambient-artifacts",
      threads: [{ id: "thread-1", workspacePath: "/workspace/project/nested" }],
    }));
    const { resolver } = createHarness({ hosts: [host], activeHost: host });

    expect(resolver.projectRuntimeHostForKnownWorkspacePath("/WORKSPACE/PROJECT")).toBe(host);
    expect(resolver.projectRuntimeHostForKnownWorkspacePath("/workspace/project/.ambient-artifacts")).toBe(host);
    expect(resolver.projectRuntimeHostForKnownWorkspacePath("/workspace/project/nested")).toBe(host);
    expect(resolver.projectRuntimeHostForKnownWorkspacePath("/workspace/other")).toBeUndefined();
  });

  it("preserves automation folder ambiguity and fallback behavior", () => {
    const first = createHost("first", createStore({
      workspacePath: "/workspace/first",
      automationFolders: [{ id: "folder-1", threads: [] }],
    }));
    const second = createHost("second", createStore({
      workspacePath: "/workspace/second",
      automationFolders: [{ id: "folder-1", threads: [] }],
    }));
    const fallback = createHost("fallback", createStore({
      workspacePath: "/workspace/fallback",
      automationFolders: [{ id: "folder-fallback", threads: [] }],
    }));
    const { resolver } = createHarness({ hosts: [first, second], activeHost: fallback });

    expect(resolver.requireProjectRuntimeHostForAutomationFolder("folder-1", first)).toBe(first);
    expect(() => resolver.requireProjectRuntimeHostForAutomationFolder("folder-1", fallback)).toThrow(
      "Automation folder is ambiguous across loaded projects: folder-1",
    );
    expect(resolver.requireProjectRuntimeHostForAutomationFolder("folder-fallback", fallback)).toBe(fallback);
    expect(() => resolver.requireProjectRuntimeHostForAutomationFolder("missing", fallback)).toThrow("Automation folder not found: missing");
  });

  it("routes automation schedule targets to their owning record type", () => {
    const orchestrationHost = createHost("orchestration", createStore({
      workspacePath: "/workspace/orchestration",
      records: { orchestrationTask: new Set(["task-1"]) },
    }));
    const workflowHost = createHost("workflow", createStore({
      workspacePath: "/workspace/workflow",
      records: {
        workflowThread: new Set(["workflow-thread-1"]),
        workflowVersion: new Set(["version-1"]),
        workflowArtifact: new Set(["artifact-1"]),
      },
    }));
    const fallback = createHost("fallback", createStore({
      workspacePath: "/workspace/fallback",
      automationFolders: [{ id: "folder-1", threads: [] }],
    }));
    const { resolver } = createHarness({ hosts: [orchestrationHost, workflowHost], activeHost: fallback });

    expect(resolver.requireProjectRuntimeHostForAutomationScheduleTarget({ targetKind: "local_task", targetId: "task-1" })).toBe(orchestrationHost);
    expect(resolver.requireProjectRuntimeHostForAutomationScheduleTarget({ targetKind: "workflow_thread", targetId: "workflow-thread-1" })).toBe(workflowHost);
    expect(resolver.requireProjectRuntimeHostForAutomationScheduleTarget({ targetKind: "workflow_version", targetId: "version-1" })).toBe(workflowHost);
    expect(resolver.requireProjectRuntimeHostForAutomationScheduleTarget({ targetKind: "workflow_artifact", targetId: "artifact-1" })).toBe(workflowHost);
    expect(resolver.requireProjectRuntimeHostForAutomationScheduleTarget({ targetKind: "automation_folder", targetId: "folder-1" }, fallback)).toBe(fallback);
  });

  it("resolves orchestration workspace paths from loaded hosts or the active host fallback", () => {
    const loaded = createHost("loaded", createStore({
      workspacePath: "/workspace/loaded",
      board: { runs: [{ workspacePath: "/work/run" }], tasks: [{ workspacePath: "/work/task" }] },
    }));
    const activeHost = createHost("active", createStore({
      workspacePath: "/workspace/active",
      board: { runs: [], tasks: [{ workspacePath: "/work/active-task" }] },
    }));
    const { resolver } = createHarness({ hosts: [loaded], activeHost });

    expect(resolver.orchestrationBoardWorkspacePaths(loaded.store.board)).toEqual(["/work/run", "/work/task"]);
    expect(resolver.requireProjectRuntimeHostForOrchestrationWorkspace("/WORK/TASK")).toBe(loaded);
    expect(resolver.requireProjectRuntimeHostForOrchestrationWorkspace("/work/active-task")).toBe(activeHost);
    expect(() => resolver.requireProjectRuntimeHostForOrchestrationWorkspace("/work/missing")).toThrow(
      "Workspace is not associated with a local orchestration task.",
    );
  });
});
