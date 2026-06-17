import { describe, expect, it } from "vitest";
import {
  describeOfficeFileSupport,
  describeOfficePreviewSupport,
  isSupportedOfficeDocument,
  isSupportedOfficePreview,
  officeMimeTypeForExtension,
} from "./officeFileSupport";

describe("officeFileSupport", () => {
  it("detects first-party supported Office document formats", () => {
    expect(describeOfficeFileSupport("brief.docx")).toEqual({
      status: "supported",
      extension: ".docx",
      format: "docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      unitLabel: "paragraphs",
    });
    expect(describeOfficeFileSupport(".pptx")).toEqual({
      status: "supported",
      extension: ".pptx",
      format: "pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      unitLabel: "slides",
    });
    expect(describeOfficeFileSupport("sheet.xlsx")).toEqual({
      status: "supported",
      extension: ".xlsx",
      format: "xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      unitLabel: "sheets",
    });
    expect(isSupportedOfficeDocument("DECK.PPTX")).toBe(true);
    expect(isSupportedOfficeDocument("sheet.xlsx")).toBe(true);
  });

  it("keeps legacy Office formats explicit but unsupported for text extraction", () => {
    expect(describeOfficeFileSupport("legacy.doc")).toMatchObject({
      status: "unsupported",
      extension: ".doc",
      reason: "legacy-binary-format",
    });
    expect(describeOfficeFileSupport("slides.ppt")).toMatchObject({
      status: "unsupported",
      extension: ".ppt",
      reason: "legacy-binary-format",
    });
    expect(describeOfficeFileSupport("sheet.xls")).toMatchObject({
      status: "unsupported",
      extension: ".xls",
      reason: "spreadsheet-format",
    });
    expect(isSupportedOfficeDocument("sheet.xls")).toBe(false);
  });

  it("supports legacy doc, ppt, and xls files for preview conversion only", () => {
    expect(describeOfficePreviewSupport("legacy.doc")).toEqual({
      status: "supported",
      extension: ".doc",
      format: "doc",
      mimeType: "application/msword",
      legacy: true,
    });
    expect(describeOfficePreviewSupport("slides.ppt")).toEqual({
      status: "supported",
      extension: ".ppt",
      format: "ppt",
      mimeType: "application/vnd.ms-powerpoint",
      legacy: true,
    });
    expect(describeOfficePreviewSupport("sheet.xls")).toEqual({
      status: "supported",
      extension: ".xls",
      format: "xls",
      mimeType: "application/vnd.ms-excel",
      legacy: true,
    });
    expect(describeOfficePreviewSupport("brief.docx")).toMatchObject({
      status: "supported",
      format: "docx",
      legacy: false,
    });
    expect(isSupportedOfficePreview("legacy.doc")).toBe(true);
    expect(isSupportedOfficePreview("slides.ppt")).toBe(true);
    expect(isSupportedOfficePreview("sheet.xls")).toBe(true);
  });

  it("returns Office MIME types independently from support status", () => {
    expect(officeMimeTypeForExtension("brief.docx")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(officeMimeTypeForExtension(".ppt")).toBe("application/vnd.ms-powerpoint");
    expect(officeMimeTypeForExtension("notes.md")).toBeUndefined();
    expect(describeOfficeFileSupport("notes.md")).toBeUndefined();
  });
});
