import { describe, expect, it, vi } from "vitest";
import type {
  AmbientWorkflowPlaybookDescription,
  AmbientWorkflowPlaybookInjection,
} from "./workflowRecordingAmbientFacade";
import type {
  WorkflowAgentFolderSummary,
  WorkflowRecordingLibraryEntry,
} from "../../shared/workflowTypes";
import {
  createWorkflowRecordingGlobalLibraryDesktopService,
  type WorkflowRecordingGlobalLibraryHost,
  type WorkflowRecordingGlobalLibraryStore,
} from "./workflowRecordingGlobalLibraryDesktopService";

interface FakeStore extends WorkflowRecordingGlobalLibraryStore {
  workspacePath: string;
  entries: WorkflowRecordingLibraryEntry[];
  folders: WorkflowAgentFolderSummary[];
}

type FakeHost = WorkflowRecordingGlobalLibraryHost<FakeStore> & { id: string };

function workflowEntry(input: Partial<WorkflowRecordingLibraryEntry> & { id: string; title: string }): WorkflowRecordingLibraryEntry {
  return {
    id: input.id,
    title: input.title,
    version: input.version ?? 1,
    enabled: input.enabled ?? true,
    savedAt: input.savedAt ?? "2026-06-19T00:00:00.000Z",
    manifestPath: input.manifestPath ?? `/tmp/${input.id}/manifest.json`,
    markdownPath: input.markdownPath ?? `/tmp/${input.id}/workflow.md`,
    sidecarPath: input.sidecarPath ?? `/tmp/${input.id}/sidecar.json`,
    transcriptPath: input.transcriptPath ?? `/tmp/${input.id}/transcript.json`,
    summary: input.summary ?? "",
    toolNames: input.toolNames ?? [],
    outputShape: input.outputShape ?? [],
    versions: input.versions ?? [],
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
    ...(input.archivedAt ? { archivedAt: input.archivedAt } : {}),
    ...(input.archivedReason ? { archivedReason: input.archivedReason } : {}),
    ...(input.threadId ? { threadId: input.threadId } : {}),
    ...(input.score !== undefined ? { score: input.score } : {}),
  };
}

function workflowDescription(id: string): AmbientWorkflowPlaybookDescription {
  return {
    ...workflowEntry({ id, title: `Workflow ${id}` }),
    markdownPreview: "",
    markdownIncluded: false,
    markdownTruncated: false,
    guidance: [],
  };
}

function workflowFolder(input: Partial<WorkflowAgentFolderSummary> & { id: string }): WorkflowAgentFolderSummary {
  return {
    id: input.id,
    name: input.name ?? input.id,
    kind: input.kind ?? "custom",
    createdAt: input.createdAt ?? "2026-06-19T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-06-19T00:00:00.000Z",
    threads: input.threads ?? [],
  };
}

function createStore(input: Partial<FakeStore> = {}): FakeStore {
  return {
    workspacePath: input.workspacePath ?? "/workspace/default",
    entries: input.entries ?? [],
    folders: input.folders ?? [],
    getWorkspace() {
      return { path: this.workspacePath };
    },
    listWorkflowRecordingLibrary(input) {
      const limit = input?.limit ?? this.entries.length;
      return this.entries.slice(0, limit);
    },
    listWorkflowAgentFolders() {
      return this.folders;
    },
  };
}

function createHost(id: string, store = createStore({ workspacePath: `/workspace/${id}` })): FakeHost {
  return {
    id,
    workspacePath: store.workspacePath,
    activeThreadId: `thread-${id}`,
    store,
  };
}

function createHarness(input: {
  hosts?: FakeHost[];
  activeHost?: FakeHost;
  activeStore?: FakeStore;
  registeredPaths?: string[];
  existingPaths?: string[];
  probeStores?: FakeStore[];
} = {}) {
  const hosts = input.hosts ?? [];
  const existingPaths = new Set((input.existingPaths ?? []).map((path) => path.toLowerCase()));
  const probeStores = [...(input.probeStores ?? [])];
  const probes: Array<{ close: ReturnType<typeof vi.fn>; openWorkspace: ReturnType<typeof vi.fn> }> = [];
  const requireProjectRuntimeHostForWorkflowRecording = vi.fn((workflowRecordingId: string) => {
    const host = hosts.find((candidate) => candidate.store.entries.some((entry) => entry.id === workflowRecordingId));
    if (!host) throw new Error(`Workflow recording not found: ${workflowRecordingId}`);
    return host;
  });
  const emitWorkflowRecordingLibraryStateChanged = vi.fn();
  const operations = {
    describeAmbientWorkflowPlaybook: vi.fn((_store: FakeStore, input: { id: string }) => workflowDescription(input.id)),
    injectAmbientWorkflowPlaybook: vi.fn((_store: FakeStore, input: { id: string }): AmbientWorkflowPlaybookInjection => ({
      playbook: workflowDescription(input.id),
      guidanceMarkdown: "",
      injectedAt: "2026-06-19T00:00:00.000Z",
    })),
    updateAmbientWorkflowPlaybook: vi.fn((_store: FakeStore, input: { id: string }) => workflowDescription(input.id)),
    archiveAmbientWorkflowPlaybook: vi.fn((_store: FakeStore, input: { id: string }) => workflowDescription(input.id)),
    unarchiveAmbientWorkflowPlaybook: vi.fn((_store: FakeStore, input: { id: string }) => workflowDescription(input.id)),
    restoreAmbientWorkflowPlaybookVersion: vi.fn((_store: FakeStore, input: { id: string }) => workflowDescription(input.id)),
  };
  const service = createWorkflowRecordingGlobalLibraryDesktopService<FakeHost, FakeStore>({
    normalizeWorkspacePath: (workspacePath) => workspacePath.toLowerCase(),
    projectRuntimeHostList: () => hosts,
    activeProjectRuntimeHost: () => input.activeHost,
    activeStore: () => input.activeStore,
    listRegisteredProjectPaths: () => input.registeredPaths ?? [],
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
    requireProjectRuntimeHostForWorkflowRecording,
    emitWorkflowRecordingLibraryStateChanged,
    ...operations,
    warn: vi.fn(),
  });
  return {
    emitWorkflowRecordingLibraryStateChanged,
    operations,
    probes,
    requireProjectRuntimeHostForWorkflowRecording,
    service,
  };
}

describe("createWorkflowRecordingGlobalLibraryDesktopService", () => {
  it("enumerates loaded, active, active-store, and registered stores without duplicate workspaces", () => {
    const loaded = createHost("loaded", createStore({ workspacePath: "/workspace/loaded" }));
    const active = createHost("active", createStore({ workspacePath: "/workspace/active" }));
    const currentStore = createStore({ workspacePath: "/workspace/current" });
    const registeredStore = createStore({ workspacePath: "/registered/project" });
    const { service, probes } = createHarness({
      hosts: [loaded],
      activeHost: active,
      activeStore: currentStore,
      registeredPaths: ["/workspace/loaded", "/missing/project", "/REGISTERED/PROJECT"],
      existingPaths: ["/registered/project"],
      probeStores: [registeredStore],
    });

    const seen = service.withWorkflowGlobalStores((stores) => stores.map((store) => (store as FakeStore).getWorkspace().path));

    expect(seen).toEqual(["/workspace/loaded", "/workspace/active", "/workspace/current", "/registered/project"]);
    expect(probes).toHaveLength(1);
    expect(probes[0].openWorkspace).toHaveBeenCalledWith("/registered/project", {
      recoverActiveRuns: false,
      recoverOrchestrationRuns: false,
    });
    expect(probes[0].close).toHaveBeenCalledTimes(1);
  });

  it("aggregates library entries and workflow agent folders across stores", () => {
    const first = createHost("first", createStore({
      workspacePath: "/workspace/first",
      entries: [
        workflowEntry({ id: "shared", title: "Old shared", version: 1, savedAt: "2026-06-18T00:00:00.000Z" }),
        workflowEntry({ id: "first", title: "First", savedAt: "2026-06-17T00:00:00.000Z" }),
      ],
      folders: [workflowFolder({ id: "folder", name: "Folder", updatedAt: "2026-06-18T00:00:00.000Z" })],
    }));
    const second = createHost("second", createStore({
      workspacePath: "/workspace/second",
      entries: [
        workflowEntry({ id: "shared", title: "New shared", version: 2, savedAt: "2026-06-19T00:00:00.000Z" }),
        workflowEntry({ id: "second", title: "Second", savedAt: "2026-06-16T00:00:00.000Z" }),
      ],
      folders: [workflowFolder({ id: "other", name: "Other", updatedAt: "2026-06-19T00:00:00.000Z" })],
    }));
    const { service } = createHarness({ hosts: [first, second] });

    expect(service.listGlobalWorkflowRecordingLibrary({ limit: 10 }).map((entry) => `${entry.id}:${entry.title}`)).toEqual([
      "shared:New shared",
      "first:First",
      "second:Second",
    ]);
    expect(service.searchGlobalAmbientWorkflowPlaybooks({ limit: 2 })).toMatchObject({
      truncated: true,
      results: [
        expect.objectContaining({ id: "shared" }),
        expect.objectContaining({ id: "first" }),
      ],
    });
    expect(service.listGlobalWorkflowAgentFolders().map((folder) => folder.id)).toEqual(["home", "other", "folder"]);
  });

  it("routes describe and inject to the owning workflow recording host without broadcasting state", () => {
    const host = createHost("project", createStore({ entries: [workflowEntry({ id: "workflow-1", title: "Workflow" })] }));
    const { emitWorkflowRecordingLibraryStateChanged, operations, service } = createHarness({ hosts: [host] });

    expect(service.describeGlobalAmbientWorkflowPlaybook({ id: "workflow-1" })).toMatchObject({ id: "workflow-1" });
    expect(service.injectGlobalAmbientWorkflowPlaybook({ id: "workflow-1" })).toMatchObject({ playbook: { id: "workflow-1" } });

    expect(operations.describeAmbientWorkflowPlaybook).toHaveBeenCalledWith(host.store, { id: "workflow-1" });
    expect(operations.injectAmbientWorkflowPlaybook).toHaveBeenCalledWith(host.store, { id: "workflow-1" });
    expect(emitWorkflowRecordingLibraryStateChanged).not.toHaveBeenCalled();
  });

  it("broadcasts state after playbook mutations on the owning host active thread", () => {
    const host = createHost("project", createStore({ entries: [workflowEntry({ id: "workflow-1", title: "Workflow" })] }));
    const { emitWorkflowRecordingLibraryStateChanged, operations, service } = createHarness({ hosts: [host] });

    service.updateGlobalAmbientWorkflowPlaybook({ id: "workflow-1", baseVersion: 1, draft: {
      intent: "test",
      inputs: [],
      successfulExamples: [],
      doNot: [],
      validation: [],
      outputShape: [],
    } });
    service.archiveGlobalAmbientWorkflowPlaybook({ id: "workflow-1", baseVersion: 2 });
    service.unarchiveGlobalAmbientWorkflowPlaybook({ id: "workflow-1", baseVersion: 3 });
    service.restoreGlobalAmbientWorkflowPlaybookVersion({ id: "workflow-1", version: 1 });

    expect(operations.updateAmbientWorkflowPlaybook).toHaveBeenCalledWith(host.store, expect.objectContaining({ id: "workflow-1" }));
    expect(operations.archiveAmbientWorkflowPlaybook).toHaveBeenCalledWith(host.store, expect.objectContaining({ id: "workflow-1" }));
    expect(operations.unarchiveAmbientWorkflowPlaybook).toHaveBeenCalledWith(host.store, expect.objectContaining({ id: "workflow-1" }));
    expect(operations.restoreAmbientWorkflowPlaybookVersion).toHaveBeenCalledWith(host.store, expect.objectContaining({ id: "workflow-1" }));
    expect(emitWorkflowRecordingLibraryStateChanged).toHaveBeenCalledTimes(4);
    expect(emitWorkflowRecordingLibraryStateChanged).toHaveBeenCalledWith(host, "thread-project");
  });
});
