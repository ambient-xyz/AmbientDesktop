import type { SearchWorkflowRecordingsInput, WorkflowAgentFolderSummary, WorkflowAgentThreadSummary, WorkflowRecordingLibraryEntry } from "../../shared/workflowTypes";
import { ambientWorkflowCatalogVersion, type AmbientWorkflowsSearchInput, type AmbientWorkflowsSearchResponse } from "./workflowRecordingAmbientFacade";

export interface WorkflowRecordingLibraryStore {
  listWorkflowAgentFolders(): WorkflowAgentFolderSummary[];
  listWorkflowRecordingLibrary(input?: SearchWorkflowRecordingsInput): WorkflowRecordingLibraryEntry[];
}

const WORKFLOW_AGENT_HOME_FOLDER_ID = "home";

export function listWorkflowRecordingLibraryAcrossStores(
  stores: WorkflowRecordingLibraryStore[],
  input: SearchWorkflowRecordingsInput = {},
): WorkflowRecordingLibraryEntry[] {
  const query = input.query?.trim() ?? "";
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const entriesById = new Map<string, WorkflowRecordingLibraryEntry>();
  for (const targetStore of stores) {
    for (const entry of targetStore.listWorkflowRecordingLibrary({ ...input, limit: 100 })) {
      const existing = entriesById.get(entry.id);
      if (!existing || shouldPreferWorkflowRecordingEntry(entry, existing)) entriesById.set(entry.id, entry);
    }
  }
  const entries = Array.from(entriesById.values());
  const sorted = query
    ? entries.sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || right.savedAt.localeCompare(left.savedAt) || left.title.localeCompare(right.title))
    : entries.sort((left, right) => right.savedAt.localeCompare(left.savedAt) || left.title.localeCompare(right.title));
  return sorted.slice(0, limit);
}

export function searchAmbientWorkflowPlaybooksAcrossStores(
  stores: WorkflowRecordingLibraryStore[],
  input: AmbientWorkflowsSearchInput = {},
): AmbientWorkflowsSearchResponse {
  const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 8), 20));
  const results = listWorkflowRecordingLibraryAcrossStores(stores, { ...input, limit: limit + 1 });
  const visible = results.slice(0, limit);
  return {
    results: visible,
    truncated: results.length > limit,
    catalogVersion: ambientWorkflowCatalogVersion(visible),
  };
}

export function listWorkflowAgentFoldersAcrossStores(stores: WorkflowRecordingLibraryStore[]): WorkflowAgentFolderSummary[] {
  const foldersById = new Map<string, WorkflowAgentFolderSummary>();
  const threadIds = new Set<string>();
  for (const targetStore of stores) {
    for (const folder of targetStore.listWorkflowAgentFolders()) {
      const target = ensureWorkflowAgentFolder(foldersById, folder);
      target.createdAt = earlierIso(target.createdAt, folder.createdAt);
      target.updatedAt = laterIso(target.updatedAt, folder.updatedAt);
      for (const thread of folder.threads) {
        if (threadIds.has(thread.id)) continue;
        threadIds.add(thread.id);
        target.threads.push(thread);
        target.updatedAt = laterIso(target.updatedAt, thread.updatedAt);
      }
    }
  }
  if (!foldersById.has(WORKFLOW_AGENT_HOME_FOLDER_ID)) {
    foldersById.set(WORKFLOW_AGENT_HOME_FOLDER_ID, {
      id: WORKFLOW_AGENT_HOME_FOLDER_ID,
      name: "Home",
      kind: "home",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      threads: [],
    });
  }
  return Array.from(foldersById.values())
    .map((folder) => ({ ...folder, threads: [...folder.threads].sort(compareWorkflowAgentThreads) }))
    .sort(compareWorkflowAgentFolders);
}

function shouldPreferWorkflowRecordingEntry(candidate: WorkflowRecordingLibraryEntry, existing: WorkflowRecordingLibraryEntry): boolean {
  if (candidate.version !== existing.version) return candidate.version > existing.version;
  if (candidate.savedAt !== existing.savedAt) return candidate.savedAt.localeCompare(existing.savedAt) > 0;
  return candidate.title.localeCompare(existing.title) < 0;
}

function ensureWorkflowAgentFolder(
  foldersById: Map<string, WorkflowAgentFolderSummary>,
  folder: WorkflowAgentFolderSummary,
): WorkflowAgentFolderSummary {
  const existing = foldersById.get(folder.id);
  if (existing) return existing;
  const next: WorkflowAgentFolderSummary = {
    id: folder.id,
    name: folder.name,
    kind: folder.kind,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    threads: [],
  };
  foldersById.set(next.id, next);
  return next;
}

function earlierIso(left: string, right: string): string {
  return left.localeCompare(right) <= 0 ? left : right;
}

function laterIso(left: string, right: string): string {
  return left.localeCompare(right) >= 0 ? left : right;
}

function compareWorkflowAgentThreads(left: WorkflowAgentThreadSummary, right: WorkflowAgentThreadSummary): number {
  return right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}

function compareWorkflowAgentFolders(left: WorkflowAgentFolderSummary, right: WorkflowAgentFolderSummary): number {
  if (left.kind === "home" && right.kind !== "home") return -1;
  if (right.kind === "home" && left.kind !== "home") return 1;
  return right.updatedAt.localeCompare(left.updatedAt) || left.name.localeCompare(right.name);
}
