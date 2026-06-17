import type { IpcMain } from "electron";
import { z } from "zod";

import type { AmbientCliCapabilitySearchInput } from "../ambient-cli/ambientCliPackages";
import type {
  AmbientFeatureFlagSnapshot,
  CodexPluginCatalog,
  SearchWorkflowRecordingsInput,
  SlashCommandDescribeInput,
  SlashCommandDescription,
  SlashCommandSearchInput,
  WorkflowRecordingLibraryDescription,
  WorkflowRecordingLibraryEntry,
} from "../../shared/types";
import { searchAmbientCliCapabilities } from "../ambient-cli/ambientCliPackages";
import { buildCallableWorkflowRegistry } from "../callable-workflow/callableWorkflowRegistry";
import type { ProjectRuntimeHost } from "../index";
import {
  buildSlashCommandSearchResponse,
  describeSlashCommandCatalogEntry,
  type SlashCommandCatalogSources,
} from "../slashCommandCatalog";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;
export type SlashCommandCatalogSourceInput = SlashCommandSearchInput & {
  ambientCliKind?: AmbientCliCapabilitySearchInput["kind"];
  ambientCliPackageId?: string;
  ambientCliCommand?: string;
  includeRecordedCallableWorkflows?: boolean;
  workflowRecordingQuery?: string;
};

export interface SlashCommandCatalogServices<Host extends ProjectRuntimeHost = ProjectRuntimeHost> {
  requireProjectRuntimeHostForWorkflowRecording(id: string): Host;
  readCodexPluginCatalog(store: Host["store"]): MaybePromise<CodexPluginCatalog>;
  listGlobalWorkflowRecordingLibrary(input?: SearchWorkflowRecordingsInput): MaybePromise<WorkflowRecordingLibraryEntry[]>;
  getFeatureFlagSnapshot(store: Host["store"]): AmbientFeatureFlagSnapshot;
}

export const slashCommandIpcChannels = [
  "slash-commands:search",
  "slash-commands:describe",
] as const;

const slashCommandKindSchema = z.enum(["app", "skill", "workflow", "callable-workflow"]);
const slashCommandSourceKindSchema = z.enum(["builtin", "codex-plugin", "ambient-cli", "workflow-recorder", "symphony"]);

const slashCommandSearchSchema = z.object({
  query: z.string().max(500).optional(),
  limit: z.number().int().positive().max(50).optional(),
  includeUnavailable: z.boolean().optional(),
  kinds: z.array(slashCommandKindSchema).max(8).optional(),
  sourceKinds: z.array(slashCommandSourceKindSchema).max(8).optional(),
}).strict() satisfies z.ZodType<SlashCommandSearchInput>;

const slashCommandDescribeSchema = z.object({
  entryId: z.string().min(1).max(2048),
  includeUnavailable: z.boolean().optional(),
}).strict() satisfies z.ZodType<SlashCommandDescribeInput>;

export type RegisterSlashCommandIpcDependencies<Host extends ProjectRuntimeHost = ProjectRuntimeHost> =
  SlashCommandCatalogServices<Host> & {
    handleIpc: HandleIpc;
    requireActiveProjectRuntimeHost(): Host;
  };

export function registerSlashCommandIpc<Host extends ProjectRuntimeHost>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForWorkflowRecording,
  readCodexPluginCatalog,
  listGlobalWorkflowRecordingLibrary,
  getFeatureFlagSnapshot,
}: RegisterSlashCommandIpcDependencies<Host>): void {
  async function sources(rawInput?: SlashCommandCatalogSourceInput): Promise<SlashCommandCatalogSources> {
    const host = requireActiveProjectRuntimeHost();
    return slashCommandCatalogSourcesForHost(host, rawInput, {
      requireProjectRuntimeHostForWorkflowRecording,
      readCodexPluginCatalog,
      listGlobalWorkflowRecordingLibrary,
      getFeatureFlagSnapshot,
    });
  }

  handleIpc("slash-commands:search", async (_event, raw?: SlashCommandSearchInput) => {
    const input = slashCommandSearchSchema.parse(raw ?? {});
    return buildSlashCommandSearchResponse(input, await sources(input));
  });

  handleIpc("slash-commands:describe", async (_event, raw: SlashCommandDescribeInput) => {
    const input = slashCommandDescribeSchema.parse(raw);
    return describeSlashCommandCatalogEntry(input, await sources(slashCommandDescribeCatalogSourceInput(input.entryId)));
  });
}

export async function describeSlashCommandForProjectHost<Host extends ProjectRuntimeHost>(
  host: Host,
  input: SlashCommandDescribeInput,
  services: SlashCommandCatalogServices<Host>,
): Promise<SlashCommandDescription> {
  return describeSlashCommandCatalogEntry(input, await slashCommandCatalogSourcesForHost(
    host,
    slashCommandDescribeCatalogSourceInput(input.entryId),
    services,
  ));
}

export async function slashCommandCatalogSourcesForHost<Host extends ProjectRuntimeHost>(
  host: Host,
  rawInput: SlashCommandCatalogSourceInput | undefined,
  {
    readCodexPluginCatalog,
    listGlobalWorkflowRecordingLibrary,
    getFeatureFlagSnapshot,
  }: SlashCommandCatalogServices<Host>,
): Promise<SlashCommandCatalogSources> {
  const featureFlagSnapshot = getFeatureFlagSnapshot(host.store);
  const diagnostics: string[] = [];
  const workflowRecordingQuery = rawInput?.workflowRecordingQuery ?? rawInput?.query;
  const [pluginCatalog, workflowRecordings, ambientCliCapabilities] = await Promise.all([
    Promise.resolve(readCodexPluginCatalog(host.store)).catch((error) => {
      diagnostics.push(`Codex plugin catalog unavailable: ${errorMessage(error)}`);
      return undefined;
    }),
    Promise.resolve(listGlobalWorkflowRecordingLibrary({
      query: workflowRecordingQuery,
      includeDisabled: true,
      includeArchived: true,
      limit: 50,
    })).catch((error) => {
      diagnostics.push(`Workflow recording catalog unavailable: ${errorMessage(error)}`);
      return [];
    }),
    searchAmbientCliCapabilities(host.workspacePath, {
      query: rawInput?.query,
      includeUnavailable: true,
      includeHealth: false,
      kind: rawInput?.ambientCliKind,
      packageId: rawInput?.ambientCliPackageId,
      command: rawInput?.ambientCliCommand,
      limit: Math.min(Math.max(rawInput?.limit ?? 12, 1), 20),
    }).catch((error) => {
      diagnostics.push(`Ambient CLI catalog unavailable: ${errorMessage(error)}`);
      return undefined;
    }),
  ]);
  const recordedWorkflowPlaybooks = shouldIncludeRecordedCallableWorkflows(rawInput)
    ? workflowDescriptionsForCallableRegistry(host.store, {
      query: workflowRecordingQuery,
      diagnostics,
    })
    : undefined;
  const callableWorkflowRegistry = buildCallableWorkflowRegistry({
    featureFlagSnapshot,
    includeHiddenWhenDisabled: true,
    ...(recordedWorkflowPlaybooks ? { recordedWorkflowPlaybooks } : {}),
  });
  return {
    featureFlagSnapshot,
    ...(pluginCatalog ? { pluginCatalog } : {}),
    ...(ambientCliCapabilities ? { ambientCliCapabilities } : {}),
    workflowRecordings,
    callableWorkflowRegistry,
    diagnostics,
  };
}

function slashCommandDescribeCatalogSourceInput(entryId: string): SlashCommandCatalogSourceInput {
  const ambientCli = ambientCliDescribeSourceInput(entryId);
  if (ambientCli) return ambientCli;

  const workflowRecordingQuery = workflowRecordingDescribeQuery(entryId);
  if (workflowRecordingQuery) return {
    workflowRecordingQuery,
    includeRecordedCallableWorkflows: entryId.startsWith("callable-workflow:recorded:"),
    limit: 50,
  };

  return {};
}

function shouldIncludeRecordedCallableWorkflows(input: SlashCommandCatalogSourceInput | undefined): boolean {
  if (input?.includeRecordedCallableWorkflows) return true;
  if (!input?.kinds?.includes("callable-workflow")) return false;
  if (input.sourceKinds?.length && !input.sourceKinds.includes("workflow-recorder")) return false;
  return true;
}

function ambientCliDescribeSourceInput(entryId: string): SlashCommandCatalogSourceInput | undefined {
  if (entryId.startsWith("ambient-cli-command:")) {
    const exact = ambientCliCapabilityParts(entryId.slice("ambient-cli-command:".length), "tool");
    if (!exact) return undefined;
    return {
      ambientCliKind: "command",
      ambientCliPackageId: exact.packageId,
      ambientCliCommand: exact.key,
      limit: 20,
    };
  }
  if (entryId.startsWith("ambient-cli-skill:")) {
    const exact = ambientCliCapabilityParts(entryId.slice("ambient-cli-skill:".length), "skill");
    if (!exact) return undefined;
    return {
      ambientCliKind: "skill",
      ambientCliPackageId: exact.packageId,
      limit: 20,
    };
  }
  return undefined;
}

function ambientCliCapabilityParts(capabilityId: string, kind: "skill" | "tool"): { packageId: string; key: string } | undefined {
  const separator = `:${kind}:`;
  const separatorIndex = capabilityId.indexOf(separator);
  if (separatorIndex <= 0) return undefined;
  const packageId = capabilityId.slice(0, separatorIndex);
  const key = capabilityId.slice(separatorIndex + separator.length);
  if (!packageId || !key) return undefined;
  return { packageId, key };
}

function workflowRecordingDescribeQuery(entryId: string): string | undefined {
  const workflowPlaybookMatch = entryId.match(/^workflow-playbook:(.+):\d+$/);
  if (workflowPlaybookMatch?.[1]) return workflowPlaybookMatch[1];

  const callableWorkflowMatch = entryId.match(/^callable-workflow:recorded:(.+):v\d+$/);
  if (callableWorkflowMatch?.[1]) return callableWorkflowMatch[1];

  return undefined;
}

type ActiveWorkflowRecordingStore = {
  listWorkflowRecordingLibrary(input?: SearchWorkflowRecordingsInput): WorkflowRecordingLibraryEntry[];
  describeWorkflowRecording(id: string, options?: { includeArchived?: boolean }): WorkflowRecordingLibraryDescription;
};

function workflowDescriptionsForCallableRegistry(
  store: ActiveWorkflowRecordingStore,
  input: {
    query?: string;
    diagnostics: string[];
  },
): WorkflowRecordingLibraryDescription[] {
  let entries: WorkflowRecordingLibraryEntry[];
  try {
    entries = store.listWorkflowRecordingLibrary({
      query: input.query,
      includeDisabled: true,
      includeArchived: true,
      limit: 50,
    });
  } catch (error) {
    input.diagnostics.push(`Active workflow recording catalog unavailable: ${errorMessage(error)}`);
    return [];
  }
  return entries.slice(0, 50).flatMap((entry): WorkflowRecordingLibraryDescription[] => {
    try {
      return [store.describeWorkflowRecording(entry.id, {
        includeArchived: true,
      })];
    } catch (error) {
      input.diagnostics.push(`Workflow recording ${entry.id} could not be described: ${errorMessage(error)}`);
      return [];
    }
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
