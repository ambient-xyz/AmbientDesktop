import type {
  BrowserPageContent,
  BrowserProfileMode,
  BrowserUserActionState,
} from "../../../shared/browserTypes";
import { materializeTextOutput, materializedTextNotice, type MaterializedTextOutput } from "../agentRuntimeToolRuntimeFacade";

export type MaterializedBrowserPageContent = BrowserPageContent & { textOutput?: MaterializedTextOutput };

export function browserUserActionText(state: BrowserUserActionState): string {
  const status =
    state.status === "timed-out"
      ? "timed out while waiting for user action"
      : state.status === "canceled"
        ? "was canceled while waiting for user action"
        : "needs user action";
  return [
    `Browser ${status}.`,
    `Action: ${state.kind}`,
    state.provider ? `Provider: ${state.provider}` : "",
    state.title ? `Title: ${state.title}` : "",
    state.url ? `URL: ${state.url}` : "",
    state.message,
    "Do not retry the same browser action until the user has completed the browser challenge or gives a new instruction.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function materializeBrowserPageContent(
  workspacePath: string,
  label: string,
  content: BrowserPageContent,
): Promise<MaterializedBrowserPageContent> {
  const output = await materializeTextOutput(workspacePath, {
    label,
    text: content.text,
    maxPreviewChars: 12_000,
    extension: "txt",
  });
  if (!output.truncated) return { ...content, text: output.text, ...(output.redacted ? { textOutput: output } : {}) };
  return {
    ...content,
    text: `${output.text}\n\n${materializedTextNotice("page text", output)}`,
    textOutput: output,
  };
}

export function browserContentText(content: BrowserPageContent): string {
  const sections = [
    content.title ? `Title: ${content.title}` : "",
    content.url ? `URL: ${content.url}` : "",
    content.text ? `Text:\n${content.text}` : "No readable page text extracted.",
  ].filter(Boolean);
  if (content.links.length > 0) {
    sections.push(
      `Links:\n${content.links
        .slice(0, 12)
        .map((link, index) => `${index + 1}. ${link.text} - ${link.url}`)
        .join("\n")}`,
    );
  }
  return sections.join("\n\n");
}

export function browserAuditRisk(
  profileMode: BrowserProfileMode,
  fallback: "browser-network" | "browser-control",
): "browser-network" | "browser-control" | "browser-profile" {
  return profileMode === "copied" ? "browser-profile" : fallback;
}
