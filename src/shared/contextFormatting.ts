import type { WorkflowRecordingEditContext, WorkspaceContextReference } from "./types";

export function formatPromptWithContext(content: string, context: readonly WorkspaceContextReference[] | undefined): string {
  const references = context?.filter((item) => item.path.trim()) ?? [];
  if (references.length === 0) return content;

  const contextLines = references.map((item) => {
    const size = item.size === undefined ? "" : ` (${formatContextSize(item.size)})`;
    const scope = item.absolute ? "absolute" : "workspace";
    return `- ${item.kind}: ${item.path}${size}${item.absolute ? ` [${scope}]` : ""}`;
  });
  const hasAbsoluteContext = references.some((item) => item.absolute);

  return [
    hasAbsoluteContext ? "Selected context for this turn:" : "Selected workspace context for this turn:",
    ...contextLines,
    "",
    hasAbsoluteContext
      ? "Use these explicit paths as context. Absolute paths may require full-access tools to inspect before making related changes."
      : "Use these workspace-relative paths as explicit context. Inspect files or folders before making related changes.",
    "",
    content,
  ].join("\n");
}

function formatContextSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function formatWorkflowRecordingEditPrompt(content: string, context: WorkflowRecordingEditContext | undefined): string {
  if (!context) return content;
  return [
    "Saved workflow edit request:",
    `- Workflow title: ${context.title}`,
    `- Workflow id: ${context.id}`,
    `- Current version: ${context.version}`,
    `- Manifest path: ${context.manifestPath}`,
    `- Markdown path: ${context.markdownPath}`,
    `- Sidecar path: ${context.sidecarPath}`,
    `- Transcript path: ${context.transcriptPath}`,
    "",
    "Use ambient_workflows_describe with this exact id before proposing changes. If the user accepts proposed edits, call ambient_workflows_update with this current baseVersion.",
    "",
    content,
  ].join("\n");
}
