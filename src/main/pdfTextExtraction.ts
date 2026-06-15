import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { PdfTextExtraction } from "../shared/types";

const DEFAULT_MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_EXTRACTED_CHARS = 500_000;

export interface PdfTextExtractionOptions {
  maxSourceBytes?: number;
  maxExtractedChars?: number;
}

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}

interface PdfPage {
  getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
  cleanup(): void;
}

let pdfjsModulePromise: Promise<PdfJsModule> | undefined;

export async function extractPdfText(filePath: string, options: PdfTextExtractionOptions = {}): Promise<PdfTextExtraction> {
  if (extname(filePath).toLowerCase() !== ".pdf") {
    return {
      status: "unsupported",
      truncated: false,
      error: `Unsupported file type: ${basename(filePath)}`,
    };
  }

  const maxSourceBytes = options.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES;
  const sourceStat = await stat(filePath);
  if (sourceStat.size > maxSourceBytes) {
    return {
      status: "too-large",
      truncated: false,
      error: `PDF file is too large to extract (${sourceStat.size.toLocaleString()} bytes).`,
    };
  }

  let document: PdfDocument | undefined;
  try {
    const pdfjs = await loadPdfjs();
    const bytes = await readFile(filePath);
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      verbosity: pdfjs.VerbosityLevel.ERRORS,
    });
    document = await loadingTask.promise as PdfDocument;
    const extracted = await extractDocumentText(document, options.maxExtractedChars ?? DEFAULT_MAX_EXTRACTED_CHARS);
    if (!extracted.text.trim()) {
      return {
        status: "no-text",
        pages: document.numPages,
        chars: 0,
        truncated: false,
        error: "PDF contains no extractable text. It may be scanned or image-only.",
      };
    }
    return {
      status: "available",
      text: extracted.text,
      pages: document.numPages,
      chars: extracted.text.length,
      truncated: extracted.truncated,
    };
  } catch (error) {
    return {
      status: "failed",
      truncated: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await document?.destroy();
  }
}

async function loadPdfjs(): Promise<PdfJsModule> {
  pdfjsModulePromise ??= import(/* @vite-ignore */ "pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsModulePromise;
}

async function extractDocumentText(
  document: PdfDocument,
  maxExtractedChars: number,
): Promise<{ text: string; truncated: boolean }> {
  const parts: string[] = [];
  let totalChars = 0;
  let truncated = false;

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    try {
      const textContent = await page.getTextContent();
      const pageText = normalizeExtractedText(
        textContent.items
          .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
          .filter(Boolean)
          .join(" "),
      );
      if (!pageText) continue;

      const section = document.numPages > 1 ? `Page ${pageNumber}\n${pageText}` : pageText;
      const prefix = parts.length ? "\n\n" : "";
      const remaining = maxExtractedChars - totalChars - prefix.length;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      if (section.length > remaining) {
        parts.push(`${prefix}${section.slice(0, remaining)}`);
        truncated = true;
        break;
      }
      parts.push(`${prefix}${section}`);
      totalChars += prefix.length + section.length;
    } finally {
      page.cleanup();
    }
  }

  return { text: parts.join(""), truncated };
}

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
