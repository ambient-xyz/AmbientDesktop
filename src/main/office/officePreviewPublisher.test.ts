import { describe, expect, it, vi } from "vitest";
import type { OfficePreviewRenderResult } from "./officePreviewService";
import { createOfficePreviewPublisher, type OfficePreviewPublisherInput } from "./officePreviewPublisher";

const input: OfficePreviewPublisherInput = {
  workspacePath: "/workspace",
  absolutePath: "/workspace/docs/report.docx",
  relativePath: "docs/report.docx",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  size: 123,
  mtimeMs: 456,
};

describe("createOfficePreviewPublisher", () => {
  it("returns undefined when no renderer is available", async () => {
    const createMediaUrl = vi.fn(() => "workspace-media://preview");
    const publisher = createOfficePreviewPublisher({
      renderer: () => undefined,
      createMediaUrl,
    });

    await expect(publisher.createOfficePreview(input)).resolves.toBeUndefined();

    expect(createMediaUrl).not.toHaveBeenCalled();
  });

  it("returns public preview fields for non-available results without creating a media URL", async () => {
    const result: OfficePreviewRenderResult = {
      status: "missing-renderer",
      format: "docx",
      error: "LibreOffice missing",
      pdfPath: "/private/preview.pdf",
      pdfBytes: 999,
      pdfMtimeMs: 111,
    };
    const createMediaUrl = vi.fn(() => "workspace-media://preview");
    const publisher = createOfficePreviewPublisher({
      renderer: () => ({ renderPreview: vi.fn(async () => result) }),
      createMediaUrl,
    });

    await expect(publisher.createOfficePreview(input)).resolves.toEqual({
      status: "missing-renderer",
      format: "docx",
      error: "LibreOffice missing",
    });
    expect(createMediaUrl).not.toHaveBeenCalled();
  });

  it("publishes available PDF previews using render-result metadata when present", async () => {
    const result: OfficePreviewRenderResult = {
      status: "available",
      format: "docx",
      renderer: "libreoffice",
      cacheKey: "cache-key",
      generatedAt: "2026-06-20T00:00:00.000Z",
      pdfPath: "/workspace/.ambient-office-preview/cache-key.pdf",
      pdfBytes: 2048,
      pdfMtimeMs: 9876,
    };
    const renderPreview = vi.fn(async () => result);
    const statFile = vi.fn();
    const createMediaUrl = vi.fn(() => "workspace-media://preview-token/report.pdf");
    const publisher = createOfficePreviewPublisher({
      renderer: () => ({ renderPreview }),
      createMediaUrl,
      statFile,
    });

    await expect(publisher.createOfficePreview(input)).resolves.toEqual({
      status: "available",
      format: "docx",
      renderer: "libreoffice",
      cacheKey: "cache-key",
      generatedAt: "2026-06-20T00:00:00.000Z",
      pdfUrl: "workspace-media://preview-token/report.pdf",
    });
    expect(renderPreview).toHaveBeenCalledWith(input.absolutePath);
    expect(statFile).not.toHaveBeenCalled();
    expect(createMediaUrl).toHaveBeenCalledWith({
      workspacePath: input.workspacePath,
      absolutePath: result.pdfPath,
      relativePath: ".ambient-office-preview/cache-key.pdf",
      mimeType: "application/pdf",
      size: 2048,
      mtimeMs: 9876,
      allowExternal: true,
    });
  });

  it("stats available PDF previews when render-result metadata is missing", async () => {
    const result: OfficePreviewRenderResult = {
      status: "available",
      format: "pptx",
      renderer: "libreoffice",
      pdfPath: "/workspace/.ambient-office-preview/preview.pdf",
    };
    const statFile = vi.fn(async () => ({ size: 4096, mtimeMs: 1234 }));
    const createMediaUrl = vi.fn(() => "workspace-media://preview-token/slides.pdf");
    const publisher = createOfficePreviewPublisher({
      renderer: () => ({ renderPreview: vi.fn(async () => result) }),
      createMediaUrl,
      statFile,
    });

    await expect(publisher.createOfficePreview(input)).resolves.toEqual({
      status: "available",
      format: "pptx",
      renderer: "libreoffice",
      pdfUrl: "workspace-media://preview-token/slides.pdf",
    });
    expect(statFile).toHaveBeenCalledWith(result.pdfPath);
    expect(createMediaUrl).toHaveBeenCalledWith(expect.objectContaining({
      relativePath: ".ambient-office-preview/preview.pdf",
      size: 4096,
      mtimeMs: 1234,
    }));
  });

  it("uses the fallback preview filename when no cache key is available", async () => {
    const result: OfficePreviewRenderResult = {
      status: "available",
      format: "xls",
      renderer: "libreoffice",
      pdfPath: "/workspace/.ambient-office-preview/current.pdf",
      pdfBytes: 128,
      pdfMtimeMs: 321,
    };
    const createMediaUrl = vi.fn(() => "workspace-media://preview-token/current.pdf");
    const publisher = createOfficePreviewPublisher({
      renderer: () => ({ renderPreview: vi.fn(async () => result) }),
      createMediaUrl,
    });

    await publisher.createOfficePreview(input);

    expect(createMediaUrl).toHaveBeenCalledWith(expect.objectContaining({
      relativePath: ".ambient-office-preview/preview.pdf",
    }));
  });
});
