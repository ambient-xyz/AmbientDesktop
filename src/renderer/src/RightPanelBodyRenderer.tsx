import type { ReactNode } from "react";
import {
  renderRightPanelAttachmentsBody,
  renderRightPanelBrowserBody,
  renderRightPanelDiffBody,
  renderRightPanelFilesBody,
  renderRightPanelPerformanceBody,
  renderRightPanelPluginsBody,
  renderRightPanelSearchBody,
  renderRightPanelSettingsBody,
  renderRightPanelTerminalBody,
} from "./RightPanelBodyPaneRenderers";
import type { RightPanelBodyRendererInput } from "./RightPanelBodyRendererTypes";
import type { UtilityPanel } from "./RightPanelTypes";

export function rightPanelTitle(panel: UtilityPanel): string {
  return panel === "terminal"
    ? "Terminal"
    : panel === "files"
      ? "Files"
      : panel === "diff"
        ? "Diff"
        : panel === "search"
          ? "Search"
          : panel === "browser"
            ? "Browser"
            : panel === "plugins"
              ? "Plugins"
              : panel === "attachments"
                ? "Context"
                : panel === "performance"
                  ? "Performance"
                  : "Settings";
}

export function renderRightPanelBody(input: RightPanelBodyRendererInput): ReactNode {
  if (input.panel === "terminal") {
    return renderRightPanelTerminalBody(input);
  }

  if (input.panel === "search") {
    return renderRightPanelSearchBody(input);
  }

  if (input.panel === "browser") {
    return renderRightPanelBrowserBody(input);
  }

  if (input.panel === "files") {
    return renderRightPanelFilesBody(input);
  }

  if (input.panel === "diff") {
    return renderRightPanelDiffBody(input);
  }

  if (input.panel === "settings") {
    return renderRightPanelSettingsBody(input);
  }

  if (input.panel === "plugins") {
    return renderRightPanelPluginsBody(input);
  }

  if (input.panel === "attachments") {
    return renderRightPanelAttachmentsBody(input);
  }

  return renderRightPanelPerformanceBody();
}
