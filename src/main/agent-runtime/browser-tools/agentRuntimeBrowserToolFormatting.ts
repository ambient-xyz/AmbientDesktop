import type { AgentToolResult } from "@mariozechner/pi-coding-agent";

import type { ToolLongformInputPreview } from "../../../shared/threadTypes";
import { materializeTextOutput, materializedTextNotice } from "../../tool-runtime/toolOutputArtifacts";

export interface BrowserToolTextContent {
  type: "text";
  text: string;
}

export interface BrowserToolTextResult extends AgentToolResult<Record<string, unknown>> {
  content: BrowserToolTextContent[];
  details: Record<string, unknown>;
}

export function browserToolUpdate(
  toolName: string,
  text: string,
  longformInputPreview?: ToolLongformInputPreview,
): BrowserToolTextResult {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-browser",
      toolName,
      status: "running",
      ...(longformInputPreview ? { toolLongformInputPreview: longformInputPreview } : {}),
    },
  };
}

export function browserToolResult(text: string, details: Record<string, unknown>): BrowserToolTextResult {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-browser",
      ...details,
    },
  };
}

export function browserToolErrorResult(
  text: string,
  details: Record<string, unknown>,
): BrowserToolTextResult & { isError: true } {
  return {
    ...browserToolResult(text, { status: "error", ...details }),
    isError: true,
  };
}

export async function browserMaterializedToolResult(
  workspacePath: string,
  label: string,
  noticeLabel: string,
  text: string,
  details: Record<string, unknown>,
): Promise<BrowserToolTextResult> {
  const output = await materializeTextOutput(workspacePath, {
    label,
    text,
    maxPreviewChars: 12_000,
    extension: "txt",
  });
  if (!output.truncated) return browserToolResult(output.text, output.redacted ? { ...details, outputOutput: output } : details);
  return browserToolResult(`${output.text}\n\n${materializedTextNotice(noticeLabel, output)}`, {
    ...details,
    outputOutput: output,
  });
}
