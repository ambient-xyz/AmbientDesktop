import { stat as defaultStat } from "node:fs/promises";
import type { Stats } from "node:fs";
import type { WorkspaceMediaUrlInput } from "../../shared/workspaceMedia";
import type { OfficePreview } from "../../shared/workspaceTypes";
import type { OfficePreviewRenderResult } from "./officePreviewService";

export interface OfficePreviewPublisherInput {
  workspacePath: string;
  absolutePath: string;
  relativePath: string;
  mimeType?: string;
  size: number;
  mtimeMs?: number;
}

export interface OfficePreviewRenderer {
  renderPreview(filePath: string): Promise<OfficePreviewRenderResult>;
}

export interface OfficePreviewPublisherDependencies {
  renderer?: () => OfficePreviewRenderer | undefined;
  createMediaUrl(input: WorkspaceMediaUrlInput): string;
  statFile?: (path: string) => Promise<Pick<Stats, "size" | "mtimeMs">>;
}

export interface OfficePreviewPublisher {
  createOfficePreview(input: OfficePreviewPublisherInput): Promise<OfficePreview | undefined>;
  publicOfficePreview(result: OfficePreviewRenderResult): OfficePreview;
}

export function createOfficePreviewPublisher(dependencies: OfficePreviewPublisherDependencies): OfficePreviewPublisher {
  const statFile = dependencies.statFile ?? defaultStat;

  async function createOfficePreview(input: OfficePreviewPublisherInput): Promise<OfficePreview | undefined> {
    const result = await dependencies.renderer?.()?.renderPreview(input.absolutePath);
    if (!result) return undefined;
    const preview = publicOfficePreview(result);
    if (result.status !== "available" || !result.pdfPath) return preview;

    const pdfStat =
      result.pdfBytes !== undefined && result.pdfMtimeMs !== undefined
        ? { size: result.pdfBytes, mtimeMs: result.pdfMtimeMs }
        : await statFile(result.pdfPath);
    return {
      ...preview,
      pdfUrl: dependencies.createMediaUrl({
        workspacePath: input.workspacePath,
        absolutePath: result.pdfPath,
        relativePath: `.ambient-office-preview/${result.cacheKey ?? "preview"}.pdf`,
        mimeType: "application/pdf",
        size: pdfStat.size,
        mtimeMs: pdfStat.mtimeMs,
        allowExternal: true,
      }),
    };
  }

  function publicOfficePreview(result: OfficePreviewRenderResult): OfficePreview {
    const preview: Partial<OfficePreviewRenderResult> = { ...result };
    delete preview.pdfPath;
    delete preview.pdfBytes;
    delete preview.pdfMtimeMs;
    return preview as OfficePreview;
  }

  return {
    createOfficePreview,
    publicOfficePreview,
  };
}
