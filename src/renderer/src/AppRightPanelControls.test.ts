import { describe, expect, it, vi } from "vitest";

import {
  appArtifactPreviewRequest,
  appGitSummaryPanelRequest,
  appSettingsFocusRequest,
  createAppRightPanelControls,
  nextToggledRightPanel,
} from "./AppRightPanelControls";

describe("AppRightPanelControls", () => {
  it("toggles the requested panel without changing unrelated panel names", () => {
    expect(nextToggledRightPanel(undefined, "files")).toBe("files");
    expect(nextToggledRightPanel("files", "files")).toBeUndefined();
    expect(nextToggledRightPanel("terminal", "files")).toBe("files");
  });

  it("builds stable panel request payloads with caller-provided nonces", () => {
    expect(appSettingsFocusRequest("mcp-runtime", 42)).toEqual({ section: "mcp-runtime", nonce: 42 });
    expect(appArtifactPreviewRequest("dist/report.html", 43)).toEqual({ path: "dist/report.html", nonce: 43 });
    expect(appGitSummaryPanelRequest(44)).toEqual({ tab: "summary", nonce: 44 });
  });

  it("routes artifact previews through the files panel and clears the opposite preview request", () => {
    const setRightPanel = vi.fn();
    const setSettingsFocusRequest = vi.fn();
    const setArtifactPreviewRequest = vi.fn();
    const setLocalFilePreviewRequest = vi.fn();
    const setGitPanelTabRequest = vi.fn();
    const controls = createAppRightPanelControls({
      setRightPanel,
      setSettingsFocusRequest,
      setArtifactPreviewRequest,
      setLocalFilePreviewRequest,
      setGitPanelTabRequest,
      now: () => 101,
    });

    controls.previewArtifact("artifacts/summary.md");
    controls.previewLocalFile("/tmp/local.png");

    expect(setLocalFilePreviewRequest.mock.calls[0]).toEqual([undefined]);
    expect(setArtifactPreviewRequest.mock.calls[0]).toEqual([{ path: "artifacts/summary.md", nonce: 101 }]);
    expect(setArtifactPreviewRequest.mock.calls[1]).toEqual([undefined]);
    expect(setLocalFilePreviewRequest.mock.calls[1]).toEqual([{ path: "/tmp/local.png", nonce: 101 }]);
    expect(setRightPanel.mock.calls).toEqual([["files"], ["files"]]);
  });

  it("opens focused settings sections and the Git summary panel", () => {
    const setRightPanel = vi.fn();
    const setSettingsFocusRequest = vi.fn();
    const setArtifactPreviewRequest = vi.fn();
    const setLocalFilePreviewRequest = vi.fn();
    const setGitPanelTabRequest = vi.fn();
    let nonce = 200;
    const controls = createAppRightPanelControls({
      setRightPanel,
      setSettingsFocusRequest,
      setArtifactPreviewRequest,
      setLocalFilePreviewRequest,
      setGitPanelTabRequest,
      now: () => nonce++,
    });

    controls.openVoiceSettingsFromStatus();
    controls.openMcpRuntimeSettings();
    controls.openSearchWebSettings();
    controls.openGitSummaryPanel();

    expect(setSettingsFocusRequest.mock.calls).toEqual([
      [{ section: "voice", nonce: 200 }],
      [{ section: "mcp-runtime", nonce: 201 }],
      [{ section: "search-web", nonce: 202 }],
    ]);
    expect(setGitPanelTabRequest).toHaveBeenCalledWith({ tab: "summary", nonce: 203 });
    expect(setRightPanel.mock.calls).toEqual([["settings"], ["settings"], ["settings"], ["diff"]]);
  });
});
