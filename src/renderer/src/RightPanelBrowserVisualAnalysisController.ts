import { useState } from "react";
import type { BrowserScreenshotResult } from "../../shared/browserTypes";
import type { MiniCpmVisionAnalysisResult, MiniCpmVisionAnalyzeInput, MiniCpmVisionDiagnosticItem } from "../../shared/localRuntimeTypes";
import { miniCpmVisionDiagnosticsForFailure } from "../../shared/miniCpmVisionDiagnostics";
import type { WorkspaceContextReference, WorkspaceFileContent } from "../../shared/workspaceTypes";
import {
  miniCpmVisualAnalyzeInputForBrowserScreenshot,
  miniCpmVisualAnalyzeInputForContextAttachment,
  miniCpmVisualAnalyzeInputForWorkspaceFile,
} from "./miniCpmVisualActionUiModel";
import { contextAttachmentKey, truncateUiText } from "./RightPanelDetailPanels";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

export function useRightPanelBrowserVisualAnalysisController({
  setBrowserStatus,
}: {
  setBrowserStatus: (status: ApiKeyStatus | undefined) => void;
}) {
  const [latestBrowserScreenshot, setLatestBrowserScreenshot] = useState<BrowserScreenshotResult | undefined>();
  const [visualAnalysisBusy, setVisualAnalysisBusy] = useState<string | undefined>();
  const [visualAnalysisStatus, setVisualAnalysisStatus] = useState<ApiKeyStatus | undefined>();
  const [visualAnalysisDiagnostics, setVisualAnalysisDiagnostics] = useState<MiniCpmVisionDiagnosticItem[]>([]);

  async function runMiniCpmVisualAnalysis(
    input: MiniCpmVisionAnalyzeInput,
    busyKey: string,
    label: string,
  ): Promise<MiniCpmVisionAnalysisResult | undefined> {
    setVisualAnalysisBusy(busyKey);
    setVisualAnalysisStatus({ kind: "info", message: `Analyzing ${label} with MiniCPM-V...` });
    setVisualAnalysisDiagnostics([]);
    try {
      const result = await window.ambientDesktop.analyzeMiniCpmVisionInput(input);
      const artifact = result.artifacts.jsonPath ? ` Artifact: ${result.artifacts.jsonPath}` : "";
      setVisualAnalysisStatus({
        kind: "success",
        message: `MiniCPM-V analyzed ${label}. ${truncateUiText(result.summary, 180)}${artifact}`,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setVisualAnalysisDiagnostics(miniCpmVisionDiagnosticsForFailure({ error: message }));
      setVisualAnalysisStatus({
        kind: "error",
        message,
      });
      return undefined;
    } finally {
      setVisualAnalysisBusy(undefined);
    }
  }

  async function analyzeLatestBrowserScreenshot() {
    if (!latestBrowserScreenshot) return;
    const input = miniCpmVisualAnalyzeInputForBrowserScreenshot(latestBrowserScreenshot);
    const result = await runMiniCpmVisualAnalysis(input, "browser-screenshot", "latest browser screenshot");
    if (result) {
      setBrowserStatus({ kind: "success", message: `MiniCPM-V: ${truncateUiText(result.summary, 180)}` });
    }
  }

  async function analyzeContextAttachmentWithMiniCpm(item: WorkspaceContextReference) {
    const input = miniCpmVisualAnalyzeInputForContextAttachment(item);
    if (!input) {
      setVisualAnalysisDiagnostics(miniCpmVisionDiagnosticsForFailure({ error: "Unsupported MiniCPM-V image or video input extension." }));
      setVisualAnalysisStatus({ kind: "error", message: "MiniCPM-V can analyze PNG, JPG, WebP, MP4, MOV, M4V, or WebM attachments." });
      return;
    }
    await runMiniCpmVisualAnalysis(input, `context:${contextAttachmentKey(item)}`, item.name || item.path);
  }

  async function analyzeWorkspaceFileWithMiniCpm(file: WorkspaceFileContent) {
    const input = miniCpmVisualAnalyzeInputForWorkspaceFile(file);
    if (!input) {
      setVisualAnalysisDiagnostics(miniCpmVisionDiagnosticsForFailure({ error: "Unsupported MiniCPM-V image or video input extension." }));
      setVisualAnalysisStatus({ kind: "error", message: "MiniCPM-V can analyze PNG, JPG, WebP, MP4, MOV, M4V, or WebM files." });
      return;
    }
    await runMiniCpmVisualAnalysis(input, `file:${file.path}`, file.name || file.path);
  }

  return {
    latestBrowserScreenshot,
    setLatestBrowserScreenshot,
    visualAnalysisBusy,
    visualAnalysisStatus,
    visualAnalysisDiagnostics,
    analyzeLatestBrowserScreenshot,
    analyzeContextAttachmentWithMiniCpm,
    analyzeWorkspaceFileWithMiniCpm,
  };
}
