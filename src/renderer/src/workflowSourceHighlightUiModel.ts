import type { WorkflowGraphNode, WorkflowSourceRange, WorkflowVersionSummary } from "../../shared/types";

export interface WorkflowSourceHighlightChunk {
  text: string;
  highlighted: boolean;
}

export interface WorkflowSourceHighlightModel {
  nodeLabel: string;
  rangeLabel: string;
  callKindLabel: string;
  versionLabel?: string;
  commitLabel?: string;
  chunks: WorkflowSourceHighlightChunk[];
}

export interface WorkflowSourceMappingRow {
  id: string;
  nodeId: string;
  nodeLabel: string;
  kindLabel: string;
  rangeLabel: string;
  snippet: string;
}

export function workflowSourceHighlightModel(input: {
  source: string;
  node?: Pick<WorkflowGraphNode, "id" | "label" | "sourceRanges">;
  version?: Pick<WorkflowVersionSummary, "version" | "gitCommitHash">;
}): WorkflowSourceHighlightModel | undefined {
  const range = input.node?.sourceRanges?.[0];
  if (!input.node || !range) return undefined;
  return {
    nodeLabel: `${input.node.label} (${input.node.id})`,
    rangeLabel:
      range.startLine === range.endLine
        ? `Line ${range.startLine}, columns ${range.startColumn}-${range.endColumn}`
        : `Lines ${range.startLine}-${range.endLine}`,
    callKindLabel: formatSourceRangeKind(range.kind),
    versionLabel: input.version ? `Version ${input.version.version}` : undefined,
    commitLabel: input.version?.gitCommitHash ? input.version.gitCommitHash.slice(0, 7) : undefined,
    chunks: workflowSourceHighlightChunks(input.source, range),
  };
}

export function workflowSourceMappingRows(nodes: Pick<WorkflowGraphNode, "id" | "label" | "sourceRanges">[] | undefined, limit = 8): WorkflowSourceMappingRow[] {
  return (nodes ?? [])
    .flatMap((node) =>
      (node.sourceRanges ?? []).map((range, index) => ({
        id: `${node.id}:${range.kind}:${range.start}:${range.end}:${index}`,
        nodeId: node.id,
        nodeLabel: `${node.label} (${node.id})`,
        kindLabel: formatSourceRangeKind(range.kind),
        rangeLabel:
          range.startLine === range.endLine
            ? `Line ${range.startLine}, columns ${range.startColumn}-${range.endColumn}`
            : `Lines ${range.startLine}-${range.endLine}`,
        snippet: compactSnippet(range.snippet),
      })),
    )
    .slice(0, Math.max(1, limit));
}

export function workflowSourceHighlightChunks(source: string, range: Pick<WorkflowSourceRange, "start" | "end">): WorkflowSourceHighlightChunk[] {
  const start = Math.max(0, Math.min(range.start, source.length));
  const end = Math.max(start, Math.min(range.end, source.length));
  return [
    { text: source.slice(0, start), highlighted: false },
    { text: source.slice(start, end), highlighted: true },
    { text: source.slice(end), highlighted: false },
  ].filter((chunk) => chunk.text.length > 0);
}

function compactSnippet(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? `${normalized.slice(0, 179).trimEnd()}...` : normalized;
}

function formatSourceRangeKind(kind: WorkflowSourceRange["kind"]): string {
  return kind
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
