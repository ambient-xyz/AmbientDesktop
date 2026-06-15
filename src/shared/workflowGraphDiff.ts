import type { WorkflowGraphEdge, WorkflowGraphNode, WorkflowGraphSnapshot, WorkflowManifest } from "./types";

export interface WorkflowFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface WorkflowGraphNodeDiff {
  id: string;
  before?: WorkflowGraphNode;
  after?: WorkflowGraphNode;
  fieldChanges: WorkflowFieldChange[];
}

export interface WorkflowGraphEdgeDiff {
  id: string;
  before?: WorkflowGraphEdge;
  after?: WorkflowGraphEdge;
  fieldChanges: WorkflowFieldChange[];
}

export interface WorkflowManifestGrantDiff {
  id: string;
  before?: unknown;
  after?: unknown;
  fieldChanges: WorkflowFieldChange[];
}

export interface WorkflowManifestDiff {
  fieldChanges: WorkflowFieldChange[];
  addedConnectors: WorkflowManifestGrantDiff[];
  removedConnectors: WorkflowManifestGrantDiff[];
  changedConnectors: WorkflowManifestGrantDiff[];
  addedPluginCapabilities: WorkflowManifestGrantDiff[];
  removedPluginCapabilities: WorkflowManifestGrantDiff[];
  changedPluginCapabilities: WorkflowManifestGrantDiff[];
  addedGoogleWorkspaceMethods: WorkflowManifestGrantDiff[];
  removedGoogleWorkspaceMethods: WorkflowManifestGrantDiff[];
  changedGoogleWorkspaceMethods: WorkflowManifestGrantDiff[];
}

export interface WorkflowGraphDiff {
  currentGraphId: string;
  proposedGraphId: string;
  addedNodes: WorkflowGraphNodeDiff[];
  removedNodes: WorkflowGraphNodeDiff[];
  changedNodes: WorkflowGraphNodeDiff[];
  addedEdges: WorkflowGraphEdgeDiff[];
  removedEdges: WorkflowGraphEdgeDiff[];
  changedEdges: WorkflowGraphEdgeDiff[];
  manifest: WorkflowManifestDiff;
}

const nodeDiffFields: Array<keyof WorkflowGraphNode> = [
  "type",
  "label",
  "description",
  "modelRole",
  "dataSummary",
  "inputSummary",
  "outputSummary",
  "toolNames",
  "connectorIds",
  "retryPolicy",
  "retentionPolicy",
  "reviewPolicy",
];

const edgeDiffFields: Array<keyof WorkflowGraphEdge> = ["source", "target", "type", "label", "dataSummary"];

const manifestScalarFields: Array<keyof WorkflowManifest> = [
  "mutationPolicy",
  "defaultIdleTimeoutMs",
  "maxToolCalls",
  "maxModelCalls",
  "maxConnectorCalls",
  "maxRunMs",
  "requiresReviewBelowConfidence",
];

export function diffWorkflowGraphs(input: {
  current: WorkflowGraphSnapshot;
  proposed: WorkflowGraphSnapshot;
  currentManifest?: WorkflowManifest;
  proposedManifest?: WorkflowManifest;
}): WorkflowGraphDiff {
  const currentNodes = byId(input.current.nodes);
  const proposedNodes = byId(input.proposed.nodes);
  const currentEdges = byId(input.current.edges);
  const proposedEdges = byId(input.proposed.edges);

  return {
    currentGraphId: input.current.id,
    proposedGraphId: input.proposed.id,
    addedNodes: addedDiffs(currentNodes, proposedNodes),
    removedNodes: removedDiffs(currentNodes, proposedNodes),
    changedNodes: changedDiffs(currentNodes, proposedNodes, nodeDiffFields),
    addedEdges: addedDiffs(currentEdges, proposedEdges),
    removedEdges: removedDiffs(currentEdges, proposedEdges),
    changedEdges: changedDiffs(currentEdges, proposedEdges, edgeDiffFields),
    manifest: diffWorkflowManifest(input.currentManifest, input.proposedManifest),
  };
}

export function workflowGraphDiffHasChanges(diff: WorkflowGraphDiff): boolean {
  return (
    diff.addedNodes.length > 0 ||
    diff.removedNodes.length > 0 ||
    diff.changedNodes.length > 0 ||
    diff.addedEdges.length > 0 ||
    diff.removedEdges.length > 0 ||
    diff.changedEdges.length > 0 ||
    diff.manifest.fieldChanges.length > 0 ||
    diff.manifest.addedConnectors.length > 0 ||
    diff.manifest.removedConnectors.length > 0 ||
    diff.manifest.changedConnectors.length > 0 ||
    diff.manifest.addedPluginCapabilities.length > 0 ||
    diff.manifest.removedPluginCapabilities.length > 0 ||
    diff.manifest.changedPluginCapabilities.length > 0 ||
    diff.manifest.addedGoogleWorkspaceMethods.length > 0 ||
    diff.manifest.removedGoogleWorkspaceMethods.length > 0 ||
    diff.manifest.changedGoogleWorkspaceMethods.length > 0
  );
}

export function workflowGraphDiffSummary(diff: WorkflowGraphDiff): string {
  if (!workflowGraphDiffHasChanges(diff)) return "No workflow graph or manifest changes.";
  const parts = [
    countPart(diff.addedNodes.length, "node added", "nodes added"),
    countPart(diff.removedNodes.length, "node removed", "nodes removed"),
    countPart(diff.changedNodes.length, "node changed", "nodes changed"),
    countPart(diff.addedEdges.length, "edge added", "edges added"),
    countPart(diff.removedEdges.length, "edge removed", "edges removed"),
    countPart(diff.changedEdges.length, "edge changed", "edges changed"),
    countPart(diff.manifest.fieldChanges.length, "limit/policy changed", "limits/policies changed"),
    countPart(diff.manifest.addedConnectors.length, "connector grant added", "connector grants added"),
    countPart(diff.manifest.removedConnectors.length, "connector grant removed", "connector grants removed"),
    countPart(diff.manifest.changedConnectors.length, "connector grant changed", "connector grants changed"),
    countPart(diff.manifest.addedPluginCapabilities.length, "plugin capability added", "plugin capabilities added"),
    countPart(diff.manifest.removedPluginCapabilities.length, "plugin capability removed", "plugin capabilities removed"),
    countPart(diff.manifest.changedPluginCapabilities.length, "plugin capability changed", "plugin capabilities changed"),
    countPart(diff.manifest.addedGoogleWorkspaceMethods.length, "Google method grant added", "Google method grants added"),
    countPart(diff.manifest.removedGoogleWorkspaceMethods.length, "Google method grant removed", "Google method grants removed"),
    countPart(diff.manifest.changedGoogleWorkspaceMethods.length, "Google method grant changed", "Google method grants changed"),
  ].filter(Boolean);
  return parts.join(", ");
}

function diffWorkflowManifest(current?: WorkflowManifest, proposed?: WorkflowManifest): WorkflowManifestDiff {
  if (!current && !proposed) return emptyManifestDiff();
  if (!current || !proposed) {
    return {
      ...emptyManifestDiff(),
      fieldChanges: [{ field: "manifest", before: current, after: proposed }],
    };
  }

  return {
    fieldChanges: [
      ...fieldChanges(current, proposed, manifestScalarFields),
      ...fieldChanges({ tools: sorted(current.tools) }, { tools: sorted(proposed.tools) }, ["tools"]),
    ],
    ...grantCollectionDiff("connectors", current.connectors ?? [], proposed.connectors ?? [], connectorGrantId),
    ...pluginCapabilityCollectionDiff(current.pluginCapabilities ?? [], proposed.pluginCapabilities ?? []),
    ...googleWorkspaceMethodCollectionDiff(current.googleWorkspaceMethods ?? [], proposed.googleWorkspaceMethods ?? []),
  };
}

function grantCollectionDiff<T>(
  prefix: "connectors",
  current: T[],
  proposed: T[],
  idFor: (value: T) => string,
): Pick<WorkflowManifestDiff, "addedConnectors" | "removedConnectors" | "changedConnectors"> {
  const before = byComputedId(current, idFor);
  const after = byComputedId(proposed, idFor);
  return {
    addedConnectors: addedGrantDiffs(before, after),
    removedConnectors: removedGrantDiffs(before, after),
    changedConnectors: changedGrantDiffs(before, after, prefix),
  };
}

function pluginCapabilityCollectionDiff(
  current: NonNullable<WorkflowManifest["pluginCapabilities"]>,
  proposed: NonNullable<WorkflowManifest["pluginCapabilities"]>,
): Pick<WorkflowManifestDiff, "addedPluginCapabilities" | "removedPluginCapabilities" | "changedPluginCapabilities"> {
  const before = byComputedId(current, pluginCapabilityGrantId);
  const after = byComputedId(proposed, pluginCapabilityGrantId);
  return {
    addedPluginCapabilities: addedGrantDiffs(before, after),
    removedPluginCapabilities: removedGrantDiffs(before, after),
    changedPluginCapabilities: changedGrantDiffs(before, after, "pluginCapabilities"),
  };
}

function googleWorkspaceMethodCollectionDiff(
  current: NonNullable<WorkflowManifest["googleWorkspaceMethods"]>,
  proposed: NonNullable<WorkflowManifest["googleWorkspaceMethods"]>,
): Pick<WorkflowManifestDiff, "addedGoogleWorkspaceMethods" | "removedGoogleWorkspaceMethods" | "changedGoogleWorkspaceMethods"> {
  const before = byComputedId(current, googleWorkspaceMethodGrantId);
  const after = byComputedId(proposed, googleWorkspaceMethodGrantId);
  return {
    addedGoogleWorkspaceMethods: addedGrantDiffs(before, after),
    removedGoogleWorkspaceMethods: removedGrantDiffs(before, after),
    changedGoogleWorkspaceMethods: changedGrantDiffs(before, after, "googleWorkspaceMethods"),
  };
}

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function byComputedId<T>(items: T[], idFor: (item: T) => string): Map<string, T> {
  return new Map(items.map((item) => [idFor(item), item]));
}

function addedDiffs<T extends { id: string }>(current: Map<string, T>, proposed: Map<string, T>): Array<{ id: string; after: T; fieldChanges: WorkflowFieldChange[] }> {
  return [...proposed]
    .filter(([id]) => !current.has(id))
    .sort(compareEntryKeys)
    .map(([id, after]) => ({ id, after, fieldChanges: [] }));
}

function removedDiffs<T extends { id: string }>(current: Map<string, T>, proposed: Map<string, T>): Array<{ id: string; before: T; fieldChanges: WorkflowFieldChange[] }> {
  return [...current]
    .filter(([id]) => !proposed.has(id))
    .sort(compareEntryKeys)
    .map(([id, before]) => ({ id, before, fieldChanges: [] }));
}

function changedDiffs<T extends { id: string }>(current: Map<string, T>, proposed: Map<string, T>, fields: Array<keyof T>): Array<{ id: string; before: T; after: T; fieldChanges: WorkflowFieldChange[] }> {
  return [...current]
    .filter(([id]) => proposed.has(id))
    .map(([id, before]) => {
      const after = proposed.get(id)!;
      return { id, before, after, fieldChanges: fieldChanges(before, after, fields) };
    })
    .filter((diff) => diff.fieldChanges.length > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function addedGrantDiffs<T>(current: Map<string, T>, proposed: Map<string, T>): WorkflowManifestGrantDiff[] {
  return [...proposed]
    .filter(([id]) => !current.has(id))
    .sort(compareEntryKeys)
    .map(([id, after]) => ({ id, after, fieldChanges: [] }));
}

function removedGrantDiffs<T>(current: Map<string, T>, proposed: Map<string, T>): WorkflowManifestGrantDiff[] {
  return [...current]
    .filter(([id]) => !proposed.has(id))
    .sort(compareEntryKeys)
    .map(([id, before]) => ({ id, before, fieldChanges: [] }));
}

function changedGrantDiffs<T>(current: Map<string, T>, proposed: Map<string, T>, prefix: string): WorkflowManifestGrantDiff[] {
  return [...current]
    .filter(([id]) => proposed.has(id))
    .map(([id, before]) => {
      const after = proposed.get(id)!;
      return {
        id,
        before,
        after,
        fieldChanges: stableEquals(before, after) ? [] : [{ field: prefix, before, after }],
      };
    })
    .filter((diff) => diff.fieldChanges.length > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function fieldChanges<T>(before: T, after: T, fields: Array<keyof T>): WorkflowFieldChange[] {
  return fields
    .filter((field) => !stableEquals(before[field], after[field]))
    .map((field) => ({
      field: String(field),
      before: before[field],
      after: after[field],
    }));
}

function connectorGrantId(grant: NonNullable<WorkflowManifest["connectors"]>[number]): string {
  return `${grant.connectorId}:${grant.accountId ?? "default"}`;
}

function pluginCapabilityGrantId(grant: NonNullable<WorkflowManifest["pluginCapabilities"]>[number]): string {
  return `${grant.pluginId}:${grant.serverName}:${grant.toolName}:${grant.registeredName}`;
}

function googleWorkspaceMethodGrantId(grant: NonNullable<WorkflowManifest["googleWorkspaceMethods"]>[number]): string {
  return `${grant.accountHint ?? grant.accountProvenance}:${grant.methodId}`;
}

function emptyManifestDiff(): WorkflowManifestDiff {
  return {
    fieldChanges: [],
    addedConnectors: [],
    removedConnectors: [],
    changedConnectors: [],
    addedPluginCapabilities: [],
    removedPluginCapabilities: [],
    changedPluginCapabilities: [],
    addedGoogleWorkspaceMethods: [],
    removedGoogleWorkspaceMethods: [],
    changedGoogleWorkspaceMethods: [],
  };
}

function countPart(count: number, singular: string, plural: string): string | undefined {
  if (count === 0) return undefined;
  return `${count} ${count === 1 ? singular : plural}`;
}

function compareEntryKeys(left: [string, unknown], right: [string, unknown]): number {
  return left[0].localeCompare(right[0]);
}

function sorted(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function stableEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) return [...value].sort();
    return value.map(stableValue);
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}
