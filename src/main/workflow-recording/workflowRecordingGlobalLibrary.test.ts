import { describe, expect, it } from "vitest";
import type { WorkflowAgentFolderSummary, WorkflowRecordingLibraryEntry } from "../../shared/workflowTypes";
import {
  listWorkflowAgentFoldersAcrossStores,
  listWorkflowRecordingLibraryAcrossStores,
  searchAmbientWorkflowPlaybooksAcrossStores,
  type WorkflowRecordingLibraryStore,
} from "./workflowRecordingGlobalLibrary";

describe("workflow recording global library", () => {
  it("merges saved playbooks across project stores and keeps best search matches globally", () => {
    const dateNight = workflowEntry({
      id: "date-night",
      title: "Date night theatre finder",
      savedAt: "2026-05-27T20:00:00.000Z",
      summary: "Find live theatre for a date night in Scottsdale.",
      toolNames: ["web_research_search"],
      score: 15,
    });
    const brunch = workflowEntry({
      id: "brunch",
      title: "Brunch finder",
      savedAt: "2026-05-27T21:00:00.000Z",
      summary: "Find brunch reservations.",
      toolNames: ["web_research_search"],
      score: 3,
    });
    const newerDateNight = workflowEntry({
      id: "date-night",
      title: "Date night theatre finder",
      version: 2,
      savedAt: "2026-05-27T22:00:00.000Z",
      summary: "Find current date-night theatre options.",
      toolNames: ["web_research_search"],
      score: 13,
    });
    const stores = [
      mockWorkflowStore({ recordings: [dateNight] }),
      mockWorkflowStore({ recordings: [brunch, newerDateNight] }),
    ];

    expect(listWorkflowRecordingLibraryAcrossStores(stores, { query: "date night theatre", limit: 5 })).toEqual([
      expect.objectContaining({ id: "date-night", version: 2 }),
      expect.objectContaining({ id: "brunch" }),
    ]);

    const search = searchAmbientWorkflowPlaybooksAcrossStores(stores, { query: "date night theatre", limit: 1 });
    expect(search).toMatchObject({
      results: [expect.objectContaining({ id: "date-night", version: 2 })],
      truncated: true,
    });
    expect(search.catalogVersion).toMatch(/^ambient-workflows-v1:/);
  });

  it("excludes archived playbooks by default and includes them only when requested", () => {
    const active = workflowEntry({
      id: "active-date-night",
      title: "Active date night finder",
      savedAt: "2026-05-27T21:00:00.000Z",
    });
    const archived = workflowEntry({
      id: "archived-date-night",
      title: "Archived date night finder",
      savedAt: "2026-05-27T22:00:00.000Z",
      archivedAt: "2026-05-28T01:00:00.000Z",
      archivedReason: "Superseded.",
    });
    const stores = [mockWorkflowStore({ recordings: [active, archived] })];

    expect(listWorkflowRecordingLibraryAcrossStores(stores, { limit: 10 }).map((entry) => entry.id)).toEqual(["active-date-night"]);
    expect(listWorkflowRecordingLibraryAcrossStores(stores, { includeArchived: true, limit: 10 }).map((entry) => entry.id)).toEqual([
      "archived-date-night",
      "active-date-night",
    ]);
    expect(searchAmbientWorkflowPlaybooksAcrossStores(stores, { query: "archived", limit: 5 }).results).toEqual([]);
    expect(searchAmbientWorkflowPlaybooksAcrossStores(stores, { query: "archived", includeArchived: true, limit: 5 }).results[0]).toMatchObject({
      id: "archived-date-night",
      archivedAt: "2026-05-28T01:00:00.000Z",
    });
  });

  it("surfaces workflow recording threads from every project under the merged folder list", () => {
    const stores = [
      mockWorkflowStore({
        folders: [workflowFolder({ threadId: "thread-a", projectName: "Project A", updatedAt: "2026-05-27T20:00:00.000Z" })],
      }),
      mockWorkflowStore({
        folders: [workflowFolder({ threadId: "thread-b", projectName: "Project B", updatedAt: "2026-05-27T21:00:00.000Z" })],
      }),
    ];

    const folders = listWorkflowAgentFoldersAcrossStores(stores);
    expect(folders[0]).toMatchObject({
      id: "home",
      name: "Home",
      threads: [
        expect.objectContaining({ id: "thread-b", projectName: "Project B" }),
        expect.objectContaining({ id: "thread-a", projectName: "Project A" }),
      ],
    });
  });
});

function mockWorkflowStore(input: {
  recordings?: WorkflowRecordingLibraryEntry[];
  folders?: WorkflowAgentFolderSummary[];
}): WorkflowRecordingLibraryStore {
  return {
    listWorkflowRecordingLibrary: (searchInput = {}) =>
      (input.recordings ?? [])
        .filter((entry) => searchInput.includeArchived || !entry.archivedAt)
        .filter((entry) => searchInput.includeDisabled || entry.enabled)
        .map((entry) => ({
          ...entry,
          ...(searchInput.query && [entry.id, entry.title, entry.summary].join(" ").toLowerCase().includes(searchInput.query.toLowerCase()) ? { score: entry.score ?? 1 } : {}),
        }))
        .filter((entry) => !searchInput.query || (entry.score ?? 0) > 0),
    listWorkflowAgentFolders: () => input.folders ?? [workflowFolder({ threadId: "empty", projectName: "Project", updatedAt: "2026-05-27T20:00:00.000Z", threads: [] })],
  };
}

function workflowEntry(input: Partial<WorkflowRecordingLibraryEntry> & Pick<WorkflowRecordingLibraryEntry, "id" | "title" | "savedAt">): WorkflowRecordingLibraryEntry {
  return {
    version: 1,
    enabled: true,
    threadId: `${input.id}-thread`,
    manifestPath: `/tmp/${input.id}/ambient-workflow.json`,
    markdownPath: `/tmp/${input.id}/workflow.md`,
    sidecarPath: `/tmp/${input.id}/workflow.json`,
    transcriptPath: `/tmp/${input.id}/transcript.jsonl`,
    summary: input.summary ?? input.title,
    toolNames: input.toolNames ?? [],
    outputShape: input.outputShape ?? [],
    versions: [],
    ...input,
  };
}

function workflowFolder(input: {
  threadId: string;
  projectName: string;
  updatedAt: string;
  threads?: WorkflowAgentFolderSummary["threads"];
}): WorkflowAgentFolderSummary {
  return {
    id: "home",
    name: "Home",
    kind: "home",
    createdAt: "2026-05-27T19:00:00.000Z",
    updatedAt: input.updatedAt,
    threads: input.threads ?? [workflowThread(input)],
  };
}

function workflowThread(input: { threadId: string; projectName: string; updatedAt: string }): WorkflowAgentFolderSummary["threads"][number] {
  return {
    id: input.threadId,
    folderId: "home",
    projectName: input.projectName,
    projectPath: `/tmp/${input.projectName}`,
    title: `${input.projectName} recording`,
    phase: "planned",
    initialRequest: "Record a reusable workflow.",
    preview: "Recorded workflow",
    status: "planned",
    traceMode: "production",
    discoveryQuestions: [],
    badges: [],
    createdAt: "2026-05-27T19:00:00.000Z",
    updatedAt: input.updatedAt,
  };
}
