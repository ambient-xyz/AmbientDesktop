import { extname } from "node:path";
import type { OfficeDocumentFormat, OfficePreviewFormat } from "../../shared/types";

export type OfficeFileSupport =
  | {
      status: "supported";
      extension: string;
      format: OfficeDocumentFormat;
      mimeType: string;
      unitLabel: "paragraphs" | "slides" | "sheets";
    }
  | {
      status: "unsupported";
      extension: string;
      mimeType: string;
      reason: "legacy-binary-format" | "spreadsheet-format" | "unknown-office-format";
    };

type UnsupportedOfficeReason = Extract<OfficeFileSupport, { status: "unsupported" }>["reason"];

export type OfficePreviewSupport =
  | {
      status: "supported";
      extension: string;
      format: OfficePreviewFormat;
      mimeType: string;
      legacy: boolean;
    }
  | {
      status: "unsupported";
      extension: string;
      mimeType: string;
      reason: "spreadsheet-format" | "unknown-office-format";
    };

const OFFICE_MIME_TYPES = new Map([
  [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".ppt", "application/vnd.ms-powerpoint"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  [".xls", "application/vnd.ms-excel"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
]);

const SUPPORTED_OFFICE_FORMATS: Record<string, { format: OfficeDocumentFormat; unitLabel: "paragraphs" | "slides" | "sheets" }> = {
  ".docx": { format: "docx", unitLabel: "paragraphs" },
  ".pptx": { format: "pptx", unitLabel: "slides" },
  ".xlsx": { format: "xlsx", unitLabel: "sheets" },
};

const PREVIEWABLE_OFFICE_FORMATS: Record<string, { format: OfficePreviewFormat; legacy: boolean }> = {
  ".doc": { format: "doc", legacy: true },
  ".docx": { format: "docx", legacy: false },
  ".ppt": { format: "ppt", legacy: true },
  ".pptx": { format: "pptx", legacy: false },
  ".xls": { format: "xls", legacy: true },
  ".xlsx": { format: "xlsx", legacy: false },
};

export function officeMimeTypeForExtension(extensionOrPath: string): string | undefined {
  return OFFICE_MIME_TYPES.get(normalizeOfficeExtension(extensionOrPath));
}

export function describeOfficeFileSupport(extensionOrPath: string): OfficeFileSupport | undefined {
  const extension = normalizeOfficeExtension(extensionOrPath);
  const mimeType = officeMimeTypeForExtension(extension);
  if (!mimeType) return undefined;

  const supported = SUPPORTED_OFFICE_FORMATS[extension];
  if (supported) {
    return {
      status: "supported",
      extension,
      mimeType,
      format: supported.format,
      unitLabel: supported.unitLabel,
    };
  }

  return {
    status: "unsupported",
    extension,
    mimeType,
    reason: unsupportedOfficeReason(extension),
  };
}

export function describeOfficePreviewSupport(extensionOrPath: string): OfficePreviewSupport | undefined {
  const extension = normalizeOfficeExtension(extensionOrPath);
  const mimeType = officeMimeTypeForExtension(extension);
  if (!mimeType) return undefined;

  const supported = PREVIEWABLE_OFFICE_FORMATS[extension];
  if (supported) {
    return {
      status: "supported",
      extension,
      mimeType,
      format: supported.format,
      legacy: supported.legacy,
    };
  }

  return {
    status: "unsupported",
    extension,
    mimeType,
    reason: "unknown-office-format",
  };
}

export function isSupportedOfficeDocument(extensionOrPath: string): boolean {
  return describeOfficeFileSupport(extensionOrPath)?.status === "supported";
}

export function isSupportedOfficePreview(extensionOrPath: string): boolean {
  return describeOfficePreviewSupport(extensionOrPath)?.status === "supported";
}

function normalizeOfficeExtension(extensionOrPath: string): string {
  const raw = extensionOrPath.trim().toLowerCase();
  if (!raw) return "";
  return raw.startsWith(".") && !raw.includes("/") && !raw.includes("\\") ? raw : extname(raw).toLowerCase();
}

function unsupportedOfficeReason(extension: string): UnsupportedOfficeReason {
  if (extension === ".doc" || extension === ".ppt") return "legacy-binary-format";
  if (extension === ".xls" || extension === ".xlsx") return "spreadsheet-format";
  return "unknown-office-format";
}
