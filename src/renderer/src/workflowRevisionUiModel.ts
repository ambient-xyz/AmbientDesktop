import type { WorkflowRevisionStatus, WorkflowRevisionSummary } from "../../shared/types";
import { workflowGraphDiffSummary, type WorkflowGraphDiff } from "../../shared/workflowGraphDiff";

export interface WorkflowRevisionCardModel {
  id: string;
  status: WorkflowRevisionStatus;
  statusLabel: string;
  requestedChange: string;
  graphSummary: string;
  graphDetails: string[];
  hasGraphDiff: boolean;
  hasManifestDiff: boolean;
  sourceSummary: string;
  sourcePreviewLines: WorkflowRevisionSourcePreviewLine[];
  hasSourceDiff: boolean;
  baseLabel: string;
  proposedLabel: string;
  updatedLabel: string;
  updatedAt: string;
  canApply: boolean;
  canReject: boolean;
}

export interface WorkflowRevisionSourcePreviewLine {
  kind: "added" | "removed" | "context";
  text: string;
}

export function workflowRevisionCards(revisions: WorkflowRevisionSummary[], now = Date.now()): WorkflowRevisionCardModel[] {
  return [...revisions]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
    .map((revision) => ({
      id: revision.id,
      status: revision.status,
      statusLabel: workflowRevisionStatusLabel(revision.status),
      requestedChange: revision.requestedChange,
      graphSummary: workflowRevisionGraphSummary(revision.graphDiff),
      graphDetails: workflowRevisionGraphDetails(revision.graphDiff),
      hasGraphDiff: workflowRevisionHasGraphDiff(revision.graphDiff),
      hasManifestDiff: workflowRevisionHasManifestDiff(revision.graphDiff),
      sourceSummary: workflowRevisionSourceSummary(revision.sourceDiff),
      sourcePreviewLines: workflowRevisionSourcePreview(revision.sourceDiff),
      hasSourceDiff: Boolean(revision.sourceDiff?.trim()),
      baseLabel: workflowRevisionBaseLabel(revision),
      proposedLabel: workflowRevisionProposedLabel(revision),
      updatedLabel: workflowRevisionUpdatedLabel(revision.updatedAt, now),
      updatedAt: revision.updatedAt,
      canApply: revision.status === "draft" || revision.status === "proposed",
      canReject: revision.status === "draft" || revision.status === "proposed",
    }));
}

export function workflowRevisionStatusLabel(status: WorkflowRevisionStatus): string {
  if (status === "draft") return "Draft revision";
  if (status === "proposed") return "Proposed revision";
  if (status === "applied") return "Applied revision";
  return "Rejected revision";
}

export function workflowRevisionGraphSummary(graphDiff: unknown): string {
  const diff = normalizeWorkflowGraphDiff(graphDiff);
  if (!diff) return "No graph diff stored yet.";
  return workflowGraphDiffSummary(diff);
}

export function workflowRevisionGraphDetails(graphDiff: unknown, limit = 8): string[] {
  const diff = normalizeWorkflowGraphDiff(graphDiff);
  if (!diff) return [];
  const details = [
    ...diff.addedNodes.map((node) => `Added node: ${nodeLabel(node.after)}.`),
    ...diff.removedNodes.map((node) => `Removed node: ${nodeLabel(node.before)}.`),
    ...diff.changedNodes.map((node) => `Changed node: ${nodeLabel(node.after ?? node.before)}${fieldChangeSummary(node.fieldChanges)}.`),
    ...diff.addedEdges.map((edge) => `Added edge: ${edgeLabel(edge.after)}.`),
    ...diff.removedEdges.map((edge) => `Removed edge: ${edgeLabel(edge.before)}.`),
    ...diff.changedEdges.map((edge) => `Changed edge: ${edgeLabel(edge.after ?? edge.before)}${fieldChangeSummary(edge.fieldChanges)}.`),
    ...diff.manifest.fieldChanges.map((change) => `Manifest ${formatLabel(String(change.field))}: ${compactValue(change.before)} -> ${compactValue(change.after)}.`),
    ...diff.manifest.addedConnectors.map((connector) => `Added connector grant: ${connectorLabel(connector.after)}.`),
    ...diff.manifest.removedConnectors.map((connector) => `Removed connector grant: ${connectorLabel(connector.before)}.`),
    ...diff.manifest.changedConnectors.map((connector) => `Changed connector grant: ${connectorLabel(connector.after ?? connector.before)}${fieldChangeSummary(connector.fieldChanges)}.`),
    ...diff.manifest.addedPluginCapabilities.map((capability) => `Added plugin capability: ${connectorLabel(capability.after)}.`),
    ...diff.manifest.removedPluginCapabilities.map((capability) => `Removed plugin capability: ${connectorLabel(capability.before)}.`),
    ...diff.manifest.changedPluginCapabilities.map((capability) => `Changed plugin capability: ${connectorLabel(capability.after ?? capability.before)}${fieldChangeSummary(capability.fieldChanges)}.`),
    ...diff.manifest.addedGoogleWorkspaceMethods.map((method) => `Added Google method grant: ${connectorLabel(method.after)}.`),
    ...diff.manifest.removedGoogleWorkspaceMethods.map((method) => `Removed Google method grant: ${connectorLabel(method.before)}.`),
    ...diff.manifest.changedGoogleWorkspaceMethods.map((method) => `Changed Google method grant: ${connectorLabel(method.after ?? method.before)}${fieldChangeSummary(method.fieldChanges)}.`),
  ].filter(Boolean);
  if (details.length <= limit) return details;
  return [...details.slice(0, limit), `${details.length - limit} more changes.`];
}

export function workflowRevisionHasGraphDiff(graphDiff: unknown): boolean {
  const diff = normalizeWorkflowGraphDiff(graphDiff);
  if (!diff) return false;
  return (
    diff.addedNodes.length > 0 ||
    diff.removedNodes.length > 0 ||
    diff.changedNodes.length > 0 ||
    diff.addedEdges.length > 0 ||
    diff.removedEdges.length > 0 ||
    diff.changedEdges.length > 0
  );
}

export function workflowRevisionHasManifestDiff(graphDiff: unknown): boolean {
  const diff = normalizeWorkflowGraphDiff(graphDiff);
  if (!diff) return false;
  return (
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

export function workflowRevisionSourceSummary(sourceDiff: string | undefined): string {
  const diff = sourceDiff?.trim();
  if (!diff) return "No source diff stored yet.";
  const lines = diff.split(/\r?\n/);
  const added = lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const removed = lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  const files = new Set(
    lines
      .filter((line) => line.startsWith("diff --git "))
      .map((line) => line.split(/\s+/)[2]?.replace(/^a\//, ""))
      .filter(Boolean),
  );
  const parts = [
    countPart(added, "line added", "lines added"),
    countPart(removed, "line removed", "lines removed"),
    countPart(files.size, "file changed", "files changed"),
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Source diff stored.";
}

export function workflowRevisionSourcePreview(sourceDiff: string | undefined, limit = 10): WorkflowRevisionSourcePreviewLine[] {
  const diff = sourceDiff?.trim();
  if (!diff) return [];
  const lines: WorkflowRevisionSourcePreviewLine[] = [];
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff --git ")) continue;
    if (line.startsWith("@@")) {
      lines.push({ kind: "context", text: line });
    } else if (line.startsWith("+")) {
      lines.push({ kind: "added", text: line });
    } else if (line.startsWith("-")) {
      lines.push({ kind: "removed", text: line });
    }
    if (lines.length >= limit) break;
  }
  return lines;
}

export function workflowRevisionBaseLabel(revision: WorkflowRevisionSummary): string {
  if (revision.baseVersionId && revision.baseArtifactId) return "Based on saved version and artifact";
  if (revision.baseVersionId) return "Based on saved version";
  if (revision.baseArtifactId) return "Based on artifact";
  return "No base version recorded";
}

export function workflowRevisionProposedLabel(revision: WorkflowRevisionSummary): string {
  if (revision.proposedVersionId && revision.proposedArtifactId) return "Proposes saved version and artifact";
  if (revision.proposedVersionId) return "Proposes saved version";
  if (revision.proposedArtifactId) return "Proposes artifact";
  if (revision.proposedGraphSnapshotId) return "Proposes graph update";
  return "No proposed version recorded";
}

function workflowRevisionUpdatedLabel(updatedAt: string, now: number): string {
  const updated = Date.parse(updatedAt);
  if (!Number.isFinite(updated)) return "Updated recently";
  const elapsedMs = Math.max(0, now - updated);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (elapsedMs < minuteMs) return "Updated just now";
  if (elapsedMs < hourMs) return `Updated ${Math.floor(elapsedMs / minuteMs)}m ago`;
  if (elapsedMs < dayMs) return `Updated ${Math.floor(elapsedMs / hourMs)}h ago`;
  return `Updated ${Math.floor(elapsedMs / dayMs)}d ago`;
}

function normalizeWorkflowGraphDiff(value: unknown): WorkflowGraphDiff | undefined {
  if (!isWorkflowGraphDiff(value)) return undefined;
  const candidate = value as Pick<WorkflowGraphDiff, "currentGraphId" | "proposedGraphId"> & Partial<WorkflowGraphDiff>;
  const manifest = (candidate.manifest ?? {}) as Partial<WorkflowGraphDiff["manifest"]>;
  return {
    currentGraphId: candidate.currentGraphId,
    proposedGraphId: candidate.proposedGraphId,
    addedNodes: arrayOrEmpty(candidate.addedNodes),
    removedNodes: arrayOrEmpty(candidate.removedNodes),
    changedNodes: arrayOrEmpty(candidate.changedNodes),
    addedEdges: arrayOrEmpty(candidate.addedEdges),
    removedEdges: arrayOrEmpty(candidate.removedEdges),
    changedEdges: arrayOrEmpty(candidate.changedEdges),
    manifest: {
      fieldChanges: arrayOrEmpty(manifest.fieldChanges),
      addedConnectors: arrayOrEmpty(manifest.addedConnectors),
      removedConnectors: arrayOrEmpty(manifest.removedConnectors),
      changedConnectors: arrayOrEmpty(manifest.changedConnectors),
      addedPluginCapabilities: arrayOrEmpty(manifest.addedPluginCapabilities),
      removedPluginCapabilities: arrayOrEmpty(manifest.removedPluginCapabilities),
      changedPluginCapabilities: arrayOrEmpty(manifest.changedPluginCapabilities),
      addedGoogleWorkspaceMethods: arrayOrEmpty(manifest.addedGoogleWorkspaceMethods),
      removedGoogleWorkspaceMethods: arrayOrEmpty(manifest.removedGoogleWorkspaceMethods),
      changedGoogleWorkspaceMethods: arrayOrEmpty(manifest.changedGoogleWorkspaceMethods),
    },
  };
}

function isWorkflowGraphDiff(value: unknown): value is Pick<WorkflowGraphDiff, "currentGraphId" | "proposedGraphId"> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Record<keyof WorkflowGraphDiff, unknown>>;
  return (
    typeof candidate.currentGraphId === "string" &&
    typeof candidate.proposedGraphId === "string"
  );
}

function arrayOrEmpty<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function nodeLabel(node: { id: string; label?: string; type?: string } | undefined): string {
  if (!node) return "unknown node";
  const title = node.label?.trim() || node.id;
  return node.type ? `${title} (${formatLabel(node.type)})` : title;
}

function edgeLabel(edge: { id: string; source?: string; target?: string; label?: string; type?: string } | undefined): string {
  if (!edge) return "unknown edge";
  const path = edge.source && edge.target ? `${edge.source} -> ${edge.target}` : edge.id;
  const label = edge.label?.trim() ? `, ${edge.label.trim()}` : "";
  const type = edge.type ? ` (${formatLabel(edge.type)})` : "";
  return `${path}${label}${type}`;
}

function connectorLabel(value: unknown): string {
  if (!value || typeof value !== "object") return "unknown";
  const record = value as Record<string, unknown>;
  return stringValue(record.label) ?? stringValue(record.connectorId) ?? stringValue(record.capabilityId) ?? stringValue(record.id) ?? "unknown";
}

function fieldChangeSummary(changes: Array<{ field: string; before?: unknown; after?: unknown }> | undefined): string {
  if (!changes?.length) return "";
  const first = changes[0];
  const summary = `${formatLabel(String(first.field))}: ${compactValue(first.before)} -> ${compactValue(first.after)}`;
  return changes.length === 1 ? ` (${summary})` : ` (${summary}; ${changes.length - 1} more)`;
}

function compactValue(value: unknown): string {
  if (value === undefined) return "unset";
  if (value === null) return "null";
  if (typeof value === "string") return value.length > 42 ? `${value.slice(0, 39)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} items`;
  if (typeof value === "object") return "object";
  return String(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function formatLabel(value: string): string {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function countPart(count: number, singular: string, plural: string): string | undefined {
  if (count === 0) return undefined;
  return `${count} ${count === 1 ? singular : plural}`;
}
