import { createHash } from "node:crypto";
import { writeWorkspaceTextFile } from "../workspace/workspaceFiles";
import { redactSensitiveTextWithMetadata } from "./toolRuntimeSecurityFacade";

export interface MaterializedTextOutput {
  text: string;
  truncated: boolean;
  totalChars: number;
  previewChars: number;
  redacted: boolean;
  redactionCount: number;
  artifactPath?: string;
  artifactBytes?: number;
}

export interface MaterializeTextOutputInput {
  label: string;
  text: string;
  maxPreviewChars: number;
  extension?: string;
}

export async function materializeTextOutput(workspacePath: string, input: MaterializeTextOutputInput): Promise<MaterializedTextOutput> {
  const redaction = redactSensitiveTextWithMetadata(input.text);
  const safeText = redaction.text;
  const totalChars = safeText.length;
  if (totalChars <= input.maxPreviewChars) {
    return {
      text: safeText,
      truncated: false,
      totalChars,
      previewChars: totalChars,
      redacted: redaction.redacted,
      redactionCount: redaction.replacementCount,
    };
  }

  const preview = safeText.slice(0, input.maxPreviewChars);
  const artifactPath = outputArtifactPath(input.label, safeText, input.extension ?? "txt");
  const artifact = await writeWorkspaceTextFile(workspacePath, artifactPath, safeText);
  return {
    text: preview,
    truncated: true,
    totalChars,
    previewChars: preview.length,
    redacted: redaction.redacted,
    redactionCount: redaction.replacementCount,
    artifactPath: artifact.path,
    artifactBytes: artifact.bytes,
  };
}

export function materializedTextNotice(label: string, output: MaterializedTextOutput): string | undefined {
  if (!output.truncated || !output.artifactPath) return undefined;
  const bytes = output.artifactBytes === undefined ? "" : `, ${output.artifactBytes} bytes`;
  return [
    `[truncated] ${label} preview is ${output.previewChars} of ${output.totalChars} chars${bytes}.`,
    output.redacted ? "Sensitive values were redacted before writing the preview/artifact." : undefined,
    `Full output saved at: ${output.artifactPath}`,
    "Use file_read for exact text, or long_context_process for summarization/querying when the output is too large for direct context.",
    `Structured next step: ${JSON.stringify({
      artifactPath: output.artifactPath,
      totalChars: output.totalChars,
      previewChars: output.previewChars,
      truncated: true,
      recommendedNextTools: ["file_read", "long_context_process"],
      fileRead: { path: output.artifactPath },
      longContextProcess: { workspacePaths: [output.artifactPath] },
    })}`,
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function outputArtifactPath(label: string, text: string, extension: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = slugify(label);
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 12);
  const ext = extension.replace(/[^A-Za-z0-9]+/g, "") || "txt";
  return `.ambient/tool-outputs/${date}/${stamp}-${slug}-${hash}.${ext}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "tool-output";
}
