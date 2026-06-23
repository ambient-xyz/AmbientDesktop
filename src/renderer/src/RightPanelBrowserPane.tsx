import type { BrowserPickResult } from "../../shared/browserTypes";
import {
  RightPanelBrowserFocusedView,
  RightPanelBrowserStandardView,
  type RightPanelBrowserPaneViewProps,
} from "./RightPanelBrowserPaneViews";

type RightPanelBrowserPaneProps = RightPanelBrowserPaneViewProps & {
  browserFocused: boolean;
};

export function RightPanelBrowserPane({ browserFocused, ...viewProps }: RightPanelBrowserPaneProps) {
  if (browserFocused && viewProps.browserState) {
    return <RightPanelBrowserFocusedView {...viewProps} browserState={viewProps.browserState} />;
  }

  return <RightPanelBrowserStandardView {...viewProps} />;
}

export function browserPickReferenceText(result: BrowserPickResult): string {
  const lines = [
    "Browser element reference",
    result.url ? `URL: ${result.url}` : "",
    result.title ? `Title: ${result.title}` : "",
    `Prompt: ${result.prompt}`,
    "",
  ].filter((line) => line !== "");

  result.selections.forEach((selection, index) => {
    const fullPath = browserSelectionFullPath(selection);
    lines.push(`Selected element ${index + 1}:`);
    lines.push(`Best selector: ${selection.selector || fullPath || "(none)"}`);
    if (fullPath) lines.push(`Full path: ${fullPath}`);
    lines.push(`Tag: ${selection.tagName}`);
    if (selection.text) lines.push(`Text: ${selection.text}`);
    if (selection.boundingBox) {
      lines.push(
        `Bounds: ${selection.boundingBox.x},${selection.boundingBox.y} ${selection.boundingBox.width}x${selection.boundingBox.height}`,
      );
    }
    if (selection.candidates.length > 0) {
      lines.push("Candidate selectors:");
      for (const candidate of selection.candidates) lines.push(`- ${candidate}`);
    }
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

function browserSelectionFullPath(selection: BrowserPickResult["selections"][number]): string | undefined {
  for (let index = selection.candidates.length - 1; index >= 0; index -= 1) {
    if (selection.candidates[index].includes(">")) return selection.candidates[index];
  }
  return selection.selector;
}
