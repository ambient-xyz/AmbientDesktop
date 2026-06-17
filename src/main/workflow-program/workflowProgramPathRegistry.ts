import type { DesktopToolDescriptor } from "../desktopToolRegistry";
import type { WorkflowConnectorDescriptor } from "../workflowConnectors";
import type { WorkflowProgramDiagnostic } from "./workflowProgramCapabilityResolver";
import { workflowProgramKnownOutputFields } from "./workflowProgramOutputContracts";
import type { WorkflowProgramIR, WorkflowProgramNode } from "../../shared/workflowProgramIr";

export interface WorkflowProgramPathRegistryEntry {
  handle: string;
  nodeId: string;
  path?: string;
  field?: string;
  primary: boolean;
}

export interface WorkflowProgramPathRegistry {
  entries: WorkflowProgramPathRegistryEntry[];
  byHandle: Map<string, WorkflowProgramPathRegistryEntry>;
}

export interface BuildWorkflowProgramPathRegistryInput {
  program: WorkflowProgramIR;
  toolDescriptors?: DesktopToolDescriptor[];
  connectorDescriptors?: WorkflowConnectorDescriptor[];
}

export interface WorkflowProgramHandleLoweringResult {
  program: WorkflowProgramIR;
  diagnostics: WorkflowProgramDiagnostic[];
  registry: WorkflowProgramPathRegistry;
  loweredHandleCount: number;
}

export function buildWorkflowProgramPathRegistry(input: BuildWorkflowProgramPathRegistryInput): WorkflowProgramPathRegistry {
  const nodesById = new Map(input.program.nodes.map((node) => [node.id, node]));
  const toolsByName = new Map((input.toolDescriptors ?? []).map((tool) => [tool.name, tool]));
  const connectorsById = new Map((input.connectorDescriptors ?? []).map((connector) => [connector.id, connector]));
  const baseAliases = nodeBaseAliases(input.program.nodes);
  const entries: WorkflowProgramPathRegistryEntry[] = [];
  const seenHandles = new Set<string>();
  for (const node of input.program.nodes) {
    const aliases = baseAliases.get(node.id) ?? [node.id];
    for (const alias of aliases) {
      addEntry(entries, seenHandles, { handle: alias, nodeId: node.id, primary: alias === aliases[0] });
    }
    for (const field of workflowProgramKnownOutputFields(node, { nodesById, toolsByName, connectorsById })) {
      for (const alias of aliases) {
        addEntry(entries, seenHandles, {
          handle: `${alias}.${field}`,
          nodeId: node.id,
          path: field,
          field,
          primary: alias === aliases[0],
        });
      }
    }
  }
  return { entries, byHandle: new Map(entries.map((entry) => [entry.handle, entry])) };
}

export function lowerWorkflowProgramHandleReferences(input: BuildWorkflowProgramPathRegistryInput): WorkflowProgramHandleLoweringResult {
  const registry = buildWorkflowProgramPathRegistry(input);
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  let loweredHandleCount = 0;

  const lower = (value: unknown, path: string, nodeId?: string): unknown => {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((item, index) => lower(item, `${path}/${index}`, nodeId));
    const record = value as Record<string, unknown>;
    const currentNodeId = typeof record.id === "string" && path.startsWith("/nodes/") ? record.id : nodeId;
    if (typeof record.fromHandle === "string") {
      const handle = record.fromHandle.trim();
      const resolved = registry.byHandle.get(handle);
      if (!resolved) {
        diagnostics.push(
          errorDiagnostic(
            "ir.unknown_handle_reference",
            `Unknown workflow output handle ${JSON.stringify(handle)}.${knownHandleMessage(registry.entries)}`,
            `${path}/fromHandle`,
            currentNodeId,
          ),
        );
        return value;
      }
      loweredHandleCount += 1;
      const nestedPath = stringField(record.path) ?? stringField(record.subPath);
      const refPath = joinOutputPath(resolved.path, nestedPath);
      return {
        fromNode: resolved.nodeId,
        ...(refPath ? { path: refPath } : {}),
      };
    }
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record)) {
      const lowered = lower(item, `${path}/${escapeJsonPointerSegment(key)}`, currentNodeId);
      if (lowered !== item) changed = true;
      next[key] = lowered;
    }
    return changed ? next : value;
  };

  const lowered = lower(input.program, "", undefined) as WorkflowProgramIR;
  return {
    program: lowered,
    diagnostics,
    registry,
    loweredHandleCount,
  };
}

export function workflowProgramPathRegistryKnownHandles(registry: WorkflowProgramPathRegistry, limit = 20): string {
  return registry.entries
    .filter((entry) => entry.primary)
    .map((entry) => entry.handle)
    .sort()
    .slice(0, limit)
    .join(", ");
}

function nodeBaseAliases(nodes: WorkflowProgramNode[]): Map<string, string[]> {
  const aliasCandidates = new Map<string, string>();
  const aliasCounts = new Map<string, number>();
  for (const node of nodes) {
    const alias = camelAlias(node.id);
    aliasCandidates.set(node.id, alias);
    aliasCounts.set(alias, (aliasCounts.get(alias) ?? 0) + 1);
  }
  const aliasesByNodeId = new Map<string, string[]>();
  for (const node of nodes) {
    const baseAlias = aliasCandidates.get(node.id) ?? node.id;
    const primaryAlias = aliasCounts.get(baseAlias) === 1 ? baseAlias : `${baseAlias}_${stableNodeSuffix(node.id)}`;
    const aliases = [primaryAlias];
    if (node.id !== primaryAlias) aliases.push(node.id);
    aliasesByNodeId.set(node.id, aliases);
  }
  return aliasesByNodeId;
}

function addEntry(entries: WorkflowProgramPathRegistryEntry[], seenHandles: Set<string>, entry: WorkflowProgramPathRegistryEntry): void {
  if (!entry.handle.trim() || seenHandles.has(entry.handle)) return;
  seenHandles.add(entry.handle);
  entries.push(entry);
}

function camelAlias(value: string): string {
  const parts = value.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return "node";
  const [first, ...rest] = parts;
  const normalizedFirst = first!.replace(/^[^A-Za-z]+/, "") || "node";
  return [
    normalizedFirst.charAt(0).toLowerCase() + normalizedFirst.slice(1),
    ...rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)),
  ].join("");
}

function stableNodeSuffix(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash.toString(36).slice(0, 5);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function joinOutputPath(prefix: string | undefined, suffix: string | undefined): string | undefined {
  const parts = [prefix, suffix].filter((part): part is string => Boolean(part && part.trim()));
  return parts.length ? parts.join(".") : undefined;
}

function knownHandleMessage(entries: WorkflowProgramPathRegistryEntry[]): string {
  const knownHandles = workflowProgramPathRegistryKnownHandles({ entries, byHandle: new Map(entries.map((entry) => [entry.handle, entry])) });
  return knownHandles ? ` Known handles: ${knownHandles}.` : " No output handles are available yet.";
}

function escapeJsonPointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function errorDiagnostic(code: string, message: string, path: string, nodeId?: string): WorkflowProgramDiagnostic {
  return { code, severity: "error", message, path, ...(nodeId ? { nodeId } : {}) };
}
