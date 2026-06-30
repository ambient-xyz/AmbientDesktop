import { describe, expect, it, vi } from "vitest";

import type { UtilityPanel } from "./RightPanelTypes";
import { renderRightPanelBody } from "./RightPanelBodyRenderer";
import type { RightPanelBodyRendererInput } from "./RightPanelBodyRendererTypes";
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

vi.mock("./RightPanelBodyPaneRenderers", () => ({
  renderRightPanelAttachmentsBody: vi.fn(() => "attachments-body"),
  renderRightPanelBrowserBody: vi.fn(() => "browser-body"),
  renderRightPanelDiffBody: vi.fn(() => "diff-body"),
  renderRightPanelFilesBody: vi.fn(() => "files-body"),
  renderRightPanelPerformanceBody: vi.fn(() => "performance-body"),
  renderRightPanelPluginsBody: vi.fn(() => "plugins-body"),
  renderRightPanelSearchBody: vi.fn(() => "search-body"),
  renderRightPanelSettingsBody: vi.fn(() => "settings-body"),
  renderRightPanelTerminalBody: vi.fn(() => "terminal-body"),
}));

describe("renderRightPanelBody", () => {
  it.each([
    ["terminal", renderRightPanelTerminalBody, "terminal-body", true],
    ["search", renderRightPanelSearchBody, "search-body", true],
    ["browser", renderRightPanelBrowserBody, "browser-body", true],
    ["files", renderRightPanelFilesBody, "files-body", true],
    ["diff", renderRightPanelDiffBody, "diff-body", true],
    ["settings", renderRightPanelSettingsBody, "settings-body", true],
    ["plugins", renderRightPanelPluginsBody, "plugins-body", true],
    ["attachments", renderRightPanelAttachmentsBody, "attachments-body", true],
    ["performance", renderRightPanelPerformanceBody, "performance-body", false],
  ] as Array<[UtilityPanel, ReturnType<typeof vi.fn>, string, boolean]>)(
    "routes the %s panel to its body renderer",
    (panel, renderer, body, passesInput) => {
      const input = { panel } as RightPanelBodyRendererInput;

      expect(renderRightPanelBody(input)).toBe(body);
      if (passesInput) {
        expect(renderer).toHaveBeenCalledWith(input);
      } else {
        expect(renderer).toHaveBeenCalledWith();
      }
    },
  );
});
