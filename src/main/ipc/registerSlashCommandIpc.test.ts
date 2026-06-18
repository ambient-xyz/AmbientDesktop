import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMain } from "electron";

import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type {
  SearchWorkflowRecordingsInput,
  WorkflowRecordingLibraryEntry,
} from "../../shared/workflowTypes";
import type {
  AmbientCliCapabilitySearchResponse,
} from "../ambient-cli/ambientCliPackages";
import { searchAmbientCliCapabilities } from "../ambient-cli/ambientCliPackages";
import { registerSlashCommandIpc } from "./registerSlashCommandIpc";

vi.mock("../ambient-cli/ambientCliPackages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ambient-cli/ambientCliPackages")>();
  return {
    ...actual,
    searchAmbientCliCapabilities: vi.fn(),
  };
});

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerSlashCommandIpc", () => {
  beforeEach(() => {
    vi.mocked(searchAmbientCliCapabilities).mockReset();
  });

  it("describes Ambient CLI commands with an exact package and command lookup", async () => {
    const handlers = registerTestSlashCommandIpc();
    vi.mocked(searchAmbientCliCapabilities).mockImplementation(async (_workspacePath, input) => {
      if (input?.packageId === "pkg-zed" && input.command === "audit") return ambientCliSearchResponse();
      return emptyAmbientCliSearchResponse();
    });

    const description = await handlers.invoke("slash-commands:describe", {
      entryId: "ambient-cli-command:pkg-zed:tool:audit",
      includeUnavailable: true,
    });

    expect(description).toMatchObject({
      status: "described",
      entry: {
        id: "ambient-cli-command:pkg-zed:tool:audit",
        command: "/audit",
        invocationKind: "ambient-cli-command",
      },
    });
    expect(searchAmbientCliCapabilities).toHaveBeenCalledWith("/workspace", expect.objectContaining({
      packageId: "pkg-zed",
      command: "audit",
      kind: "command",
    }));
  });

  it("describes workflow slash commands with the selected recording id as the library query", async () => {
    const listGlobalWorkflowRecordingLibrary = vi.fn(async (input) =>
      input?.query === "weekly-report" ? [workflowRecording()] : []);
    const requireProjectRuntimeHostForWorkflowRecording = vi.fn(() => ({
      store: { describeWorkflowRecording: () => workflowRecordingDescription() },
    }) as never);
    const handlers = registerTestSlashCommandIpc({
      listGlobalWorkflowRecordingLibrary,
      requireProjectRuntimeHostForWorkflowRecording,
    });
    vi.mocked(searchAmbientCliCapabilities).mockResolvedValue(emptyAmbientCliSearchResponse());

    const description = await handlers.invoke("slash-commands:describe", {
      entryId: "workflow-playbook:weekly-report:3",
      includeUnavailable: true,
    });

    expect(description).toMatchObject({
      status: "described",
      entry: {
        id: "workflow-playbook:weekly-report:3",
        command: "/weekly-report",
        invocationKind: "workflow-playbook",
      },
    });
    expect(listGlobalWorkflowRecordingLibrary).toHaveBeenCalledWith(expect.objectContaining({
      query: "weekly-report",
      includeDisabled: true,
      includeArchived: true,
      limit: 50,
    }));
    expect(requireProjectRuntimeHostForWorkflowRecording).not.toHaveBeenCalled();
  });

  it("keeps regular slash searches from opening workflow hosts", async () => {
    const listGlobalWorkflowRecordingLibrary = vi.fn(async () => [workflowRecording()]);
    const requireProjectRuntimeHostForWorkflowRecording = vi.fn(() => {
      throw new Error("workflow host should stay lazy");
    });
    const handlers = registerTestSlashCommandIpc({
      listGlobalWorkflowRecordingLibrary,
      requireProjectRuntimeHostForWorkflowRecording,
    });
    vi.mocked(searchAmbientCliCapabilities).mockResolvedValue(emptyAmbientCliSearchResponse());

    const response = await handlers.invoke("slash-commands:search", {
      query: "weekly",
      includeUnavailable: true,
    });

    expect(response).toMatchObject({
      entries: [expect.objectContaining({
        id: "workflow-playbook:weekly-report:3",
        invocationKind: "workflow-playbook",
      })],
    });
    expect(requireProjectRuntimeHostForWorkflowRecording).not.toHaveBeenCalled();
  });

  it("builds recorded callable workflow entries from the active host store", async () => {
    const listGlobalWorkflowRecordingLibrary = vi.fn(async () => [
      workflowRecording({ id: "other-workspace", title: "Other Workspace", version: 1 }),
    ]);
    const requireProjectRuntimeHostForWorkflowRecording = vi.fn(() => ({
      store: { describeWorkflowRecording: () => workflowRecordingDescription() },
    }) as never);
    const activeStore = {
      listWorkflowRecordingLibrary: vi.fn(() => [workflowRecording()]),
      describeWorkflowRecording: vi.fn(() => workflowRecordingDescription()),
    };
    const handlers = registerTestSlashCommandIpc({
      activeStore,
      listGlobalWorkflowRecordingLibrary,
      requireProjectRuntimeHostForWorkflowRecording,
    });
    vi.mocked(searchAmbientCliCapabilities).mockResolvedValue(emptyAmbientCliSearchResponse());

    const response = await handlers.invoke("slash-commands:search", {
      query: "weekly",
      kinds: ["callable-workflow"],
      sourceKinds: ["workflow-recorder"],
      includeUnavailable: true,
    });

    expect(response).toMatchObject({
      entries: [expect.objectContaining({
        id: "callable-workflow:recorded:weekly-report:v3",
        invocationKind: "callable-workflow",
      })],
    });
    expect(activeStore.listWorkflowRecordingLibrary).toHaveBeenCalledWith(expect.objectContaining({
      query: "weekly",
      includeDisabled: true,
      includeArchived: true,
      limit: 50,
    }));
    expect(activeStore.describeWorkflowRecording).toHaveBeenCalledWith("weekly-report", { includeArchived: true });
    expect(requireProjectRuntimeHostForWorkflowRecording).not.toHaveBeenCalled();
  });

  it("does not expose recorded callable workflows from other workspaces", async () => {
    const handlers = registerTestSlashCommandIpc({
      activeStore: {
        listWorkflowRecordingLibrary: vi.fn(() => []),
        describeWorkflowRecording: vi.fn(() => {
          throw new Error("active store should not describe missing entries");
        }),
      },
      listGlobalWorkflowRecordingLibrary: vi.fn(async () => [workflowRecording({ id: "other-workspace", title: "Other Workspace" })]),
    });
    vi.mocked(searchAmbientCliCapabilities).mockResolvedValue(emptyAmbientCliSearchResponse());

    const response = await handlers.invoke("slash-commands:search", {
      query: "weekly",
      kinds: ["callable-workflow"],
      sourceKinds: ["workflow-recorder"],
      includeUnavailable: true,
    });

    expect(response).toMatchObject({ entries: [] });
  });
});

function registerTestSlashCommandIpc(overrides: {
  activeStore?: {
    listWorkflowRecordingLibrary(input?: SearchWorkflowRecordingsInput): WorkflowRecordingLibraryEntry[];
    describeWorkflowRecording(id: string, options?: { includeArchived?: boolean }): ReturnType<typeof workflowRecordingDescription>;
  };
  listGlobalWorkflowRecordingLibrary?: (input?: SearchWorkflowRecordingsInput) => Promise<WorkflowRecordingLibraryEntry[]>;
  requireProjectRuntimeHostForWorkflowRecording?: (id: string) => never;
} = {}): { invoke(channel: string, ...args: unknown[]): Promise<unknown> } {
  const handlers = new Map<string, IpcListener>();
  const activeStore = overrides.activeStore ?? {
    listWorkflowRecordingLibrary: () => [],
    describeWorkflowRecording: () => workflowRecordingDescription(),
  };
  registerSlashCommandIpc({
    handleIpc: (channel, listener) => handlers.set(channel, listener),
    requireActiveProjectRuntimeHost: () => ({ workspacePath: "/workspace", store: activeStore }) as never,
    requireProjectRuntimeHostForWorkflowRecording: overrides.requireProjectRuntimeHostForWorkflowRecording ?? (() => ({
      store: {
        describeWorkflowRecording: () => workflowRecordingDescription(),
      },
    }) as never),
    readCodexPluginCatalog: async () => ({
      marketplaces: [],
      plugins: [],
      importCandidates: [],
      errors: [],
    }),
    listGlobalWorkflowRecordingLibrary: overrides.listGlobalWorkflowRecordingLibrary ?? (async () => []),
    getFeatureFlagSnapshot: () => resolveAmbientFeatureFlags({
      settings: { slashCommands: true, subagents: true },
    }),
  });
  return {
    async invoke(channel, ...args) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing IPC handler: ${channel}`);
      return await handler({} as never, ...args);
    },
  };
}

function emptyAmbientCliSearchResponse(): AmbientCliCapabilitySearchResponse {
  return {
    catalogVersion: "ambient-cli-v1:empty",
    truncated: false,
    results: [],
  };
}

function ambientCliSearchResponse(): AmbientCliCapabilitySearchResponse {
  return {
    catalogVersion: "ambient-cli-v1:test",
    truncated: false,
    results: [{
      packageId: "pkg-zed",
      registryPluginId: "cli:pkg-zed",
      sourceKind: "ambient-cli",
      packageName: "zed-audit",
      installed: true,
      availability: "available",
      availabilityReason: "Installed Ambient CLI package is available.",
      commands: [{
        capabilityId: "pkg-zed:tool:audit",
        sourceKind: "ambient-cli",
        name: "audit",
        description: "Audit the project",
        cwd: "workspace",
        health: "unknown",
        risk: ["run_process"],
      }],
      skills: [],
      missingEnv: [],
      whyMatched: ["command:audit"],
      score: 10,
    }],
  };
}

function workflowRecording(overrides: Partial<WorkflowRecordingLibraryEntry> = {}): WorkflowRecordingLibraryEntry {
  return {
    id: "weekly-report",
    title: "Weekly Report",
    version: 3,
    enabled: true,
    savedAt: "2026-06-16T00:00:00.000Z",
    manifestPath: "/workflow/manifest.json",
    markdownPath: "/workflow/playbook.md",
    sidecarPath: "/workflow/sidecar.json",
    transcriptPath: "/workflow/transcript.jsonl",
    summary: "Builds the report.",
    toolNames: ["file_read"],
    outputShape: ["summary"],
    versions: [],
    ...overrides,
  };
}

function workflowRecordingDescription() {
  return {
    ...workflowRecording(),
    markdownPreview: "Builds the report.",
    playbook: {
      status: "draft",
      source: "manual",
      intent: "Builds the report.",
      inputs: [],
      validation: [],
      outputShape: ["summary"],
      successfulExamples: [],
      doNot: [],
    },
  };
}
