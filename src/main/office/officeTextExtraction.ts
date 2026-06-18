import { readFile, stat } from "node:fs/promises";
import { basename, posix } from "node:path";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import * as mammoth from "mammoth";
import type { OfficeDocumentFormat, OfficeTextExtraction } from "../../shared/workspaceTypes";
import { describeOfficeFileSupport } from "./officeFileSupport";

const DEFAULT_MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_ZIP_ENTRIES = 5_000;
const DEFAULT_MAX_EXTRACTED_CHARS = 500_000;
const DEFAULT_MAX_SPREADSHEET_CELLS = 100_000;

export interface OfficeTextExtractionOptions {
  maxSourceBytes?: number;
  maxZipEntries?: number;
  maxExtractedChars?: number;
  includeSpeakerNotes?: boolean;
  maxSpreadsheetCells?: number;
}

interface ExtractedOfficeText {
  text: string;
  format: OfficeDocumentFormat;
  unitLabel: "paragraphs" | "slides" | "sheets";
  unitCount: number;
  truncated?: boolean;
}

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  preserveOrder: false,
  trimValues: true,
});

const metadataXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: false,
  trimValues: true,
});

export async function extractOfficeText(filePath: string, options: OfficeTextExtractionOptions = {}): Promise<OfficeTextExtraction> {
  const support = describeOfficeFileSupport(filePath);
  if (!support) return unsupported(`Unsupported file type: ${basename(filePath)}`);
  if (support.status !== "supported") return unsupported(unsupportedOfficeMessage(support.reason));

  const maxSourceBytes = options.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES;
  const sourceStat = await stat(filePath);
  if (sourceStat.size > maxSourceBytes) {
    return {
      status: "too-large",
      format: support.format,
      unitLabel: support.unitLabel,
      truncated: false,
      error: `Office file is too large to extract (${sourceStat.size.toLocaleString()} bytes).`,
    };
  }

  try {
    const extracted = await extractSupportedOfficeText(filePath, support.format, {
      maxZipEntries: options.maxZipEntries ?? DEFAULT_MAX_ZIP_ENTRIES,
      includeSpeakerNotes: options.includeSpeakerNotes ?? true,
      maxSpreadsheetCells: options.maxSpreadsheetCells ?? DEFAULT_MAX_SPREADSHEET_CELLS,
    });
    return availableExtraction(extracted, options.maxExtractedChars ?? DEFAULT_MAX_EXTRACTED_CHARS);
  } catch (error) {
    return {
      status: "failed",
      format: support.format,
      unitLabel: support.unitLabel,
      truncated: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function extractSupportedOfficeText(
  filePath: string,
  format: OfficeDocumentFormat,
  options: { maxZipEntries: number; includeSpeakerNotes: boolean; maxSpreadsheetCells: number },
): Promise<ExtractedOfficeText> {
  if (format === "docx") return extractDocxText(filePath);
  if (format === "pptx") {
    return extractPptxText(filePath, {
      maxZipEntries: options.maxZipEntries,
      includeSpeakerNotes: options.includeSpeakerNotes,
    });
  }
  return extractXlsxText(filePath, {
    maxZipEntries: options.maxZipEntries,
    maxSpreadsheetCells: options.maxSpreadsheetCells,
  });
}

async function extractDocxText(filePath: string): Promise<ExtractedOfficeText> {
  const result = await mammoth.extractRawText({ path: filePath });
  const text = normalizeExtractedText(result.value);
  return {
    text,
    format: "docx",
    unitLabel: "paragraphs",
    unitCount: countParagraphs(text),
  };
}

async function extractPptxText(
  filePath: string,
  options: { maxZipEntries: number; includeSpeakerNotes: boolean },
): Promise<ExtractedOfficeText> {
  const zip = await JSZip.loadAsync(await readFile(filePath));
  const files = Object.values(zip.files).filter((file) => !file.dir);
  if (files.length > options.maxZipEntries) {
    throw new Error(`Office archive has too many entries (${files.length.toLocaleString()}).`);
  }

  const slideFiles = files
    .filter((file) => /^ppt\/slides\/slide\d+\.xml$/i.test(file.name))
    .sort((left, right) => officeXmlIndex(left.name) - officeXmlIndex(right.name));
  if (!slideFiles.length) throw new Error("PPTX file does not contain any slides.");

  const notesByIndex = options.includeSpeakerNotes ? await pptxNotesByIndex(files) : new Map<number, string>();
  const slides: string[] = [];
  for (const slideFile of slideFiles) {
    const index = officeXmlIndex(slideFile.name);
    const slideText = await xmlTextContent(slideFile);
    const notes = notesByIndex.get(index);
    const parts = [`Slide ${index}`, slideText || "(no extractable text)", notes ? ["Speaker notes", notes].join("\n") : undefined].filter(
      (part): part is string => Boolean(part),
    );
    slides.push(parts.join("\n"));
  }

  return {
    text: normalizeExtractedText(slides.join("\n\n")),
    format: "pptx",
    unitLabel: "slides",
    unitCount: slideFiles.length,
  };
}

async function pptxNotesByIndex(files: JSZip.JSZipObject[]): Promise<Map<number, string>> {
  const notes = new Map<number, string>();
  const noteFiles = files
    .filter((file) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(file.name))
    .sort((left, right) => officeXmlIndex(left.name) - officeXmlIndex(right.name));
  for (const noteFile of noteFiles) {
    const text = await xmlTextContent(noteFile);
    if (text) notes.set(officeXmlIndex(noteFile.name), text);
  }
  return notes;
}

async function extractXlsxText(filePath: string, options: { maxZipEntries: number; maxSpreadsheetCells: number }): Promise<ExtractedOfficeText> {
  const zip = await JSZip.loadAsync(await readFile(filePath));
  const files = Object.values(zip.files).filter((file) => !file.dir);
  if (files.length > options.maxZipEntries) {
    throw new Error(`Office archive has too many entries (${files.length.toLocaleString()}).`);
  }

  const workbookFile = zip.file("xl/workbook.xml");
  if (!workbookFile) throw new Error("XLSX file does not contain xl/workbook.xml.");
  const workbook = metadataXmlParser.parse(await workbookFile.async("text"));
  const sheetRecords = xmlArray(xmlGet(workbook, "workbook", "sheets", "sheet"));
  if (!sheetRecords.length) throw new Error("XLSX file does not contain any worksheets.");

  const relationships = await xlsxWorkbookRelationships(zip);
  const sharedStrings = await xlsxSharedStrings(zip);
  const sheetOutputs: string[] = [];
  let seenCells = 0;
  let truncated = false;

  for (const [index, sheet] of sheetRecords.entries()) {
    const name = xmlAttribute(sheet, "name") || `Sheet ${index + 1}`;
    const relationshipId = xmlAttribute(sheet, "r:id");
    const sheetPath = relationshipId ? relationships.get(relationshipId) : undefined;
    const worksheetFile = sheetPath ? zip.file(sheetPath) : undefined;
    const fallbackFile = worksheetFile ?? zip.file(`xl/worksheets/sheet${index + 1}.xml`);
    if (!fallbackFile) {
      sheetOutputs.push(`Sheet: ${name}\n(no worksheet XML found)`);
      continue;
    }

    const extraction = await xlsxWorksheetText(fallbackFile, sharedStrings, {
      maxCells: Math.max(0, options.maxSpreadsheetCells - seenCells),
      sheetName: name,
    });
    seenCells += extraction.cells;
    sheetOutputs.push(extraction.text);
    if (extraction.truncated || seenCells >= options.maxSpreadsheetCells) {
      truncated = true;
      sheetOutputs.push(`Spreadsheet extraction stopped after ${seenCells.toLocaleString()} cells.`);
      break;
    }
  }

  return {
    text: normalizeExtractedText(sheetOutputs.join("\n\n")),
    format: "xlsx",
    unitLabel: "sheets",
    unitCount: sheetRecords.length,
    truncated,
  };
}

async function xlsxWorkbookRelationships(zip: JSZip): Promise<Map<string, string>> {
  const relsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (!relsFile) return new Map();
  const parsed = metadataXmlParser.parse(await relsFile.async("text"));
  const relationships = xmlArray(xmlGet(parsed, "Relationships", "Relationship"));
  const byId = new Map<string, string>();
  for (const relationship of relationships) {
    const id = xmlAttribute(relationship, "Id");
    const target = xmlAttribute(relationship, "Target");
    const targetMode = xmlAttribute(relationship, "TargetMode");
    if (!id || !target || targetMode === "External") continue;
    byId.set(id, normalizeOfficeZipTarget("xl", target));
  }
  return byId;
}

async function xlsxSharedStrings(zip: JSZip): Promise<string[]> {
  const sharedStringsFile = zip.file("xl/sharedStrings.xml");
  if (!sharedStringsFile) return [];
  const parsed = xmlParser.parse(await sharedStringsFile.async("text"));
  return xmlArray(xmlGet(parsed, "sst", "si")).map((entry) => normalizeExtractedText(collectXmlText(entry).join(" ")));
}

async function xlsxWorksheetText(
  file: JSZip.JSZipObject,
  sharedStrings: string[],
  options: { sheetName: string; maxCells: number },
): Promise<{ text: string; cells: number; truncated: boolean }> {
  const parsed = metadataXmlParser.parse(await file.async("text"));
  const rows = xmlArray(xmlGet(parsed, "worksheet", "sheetData", "row"));
  const lines = [`Sheet: ${options.sheetName}`];
  let cells = 0;
  let truncated = false;

  for (const [rowOffset, row] of rows.entries()) {
    const rowIndex = xmlAttribute(row, "r") || String(rowOffset + 1);
    const renderedCells: string[] = [];
    for (const cell of xmlArray(xmlGet(row, "c"))) {
      if (cells >= options.maxCells) {
        truncated = true;
        break;
      }
      const value = xlsxCellValue(cell, sharedStrings);
      if (!value) continue;
      const reference = xmlAttribute(cell, "r") || `cell ${renderedCells.length + 1}`;
      renderedCells.push(`${reference}: ${value}`);
      cells += 1;
    }
    if (renderedCells.length) lines.push(`Row ${rowIndex}: ${renderedCells.join(" | ")}`);
    if (truncated) break;
  }

  if (lines.length === 1) lines.push("(no extractable cells)");
  return { text: lines.join("\n"), cells, truncated };
}

function xlsxCellValue(cell: unknown, sharedStrings: string[]): string {
  const cellType = xmlAttribute(cell, "t");
  const rawValue = xmlText(xmlGet(cell, "v"));
  if (cellType === "s") {
    const index = Number(rawValue);
    return Number.isInteger(index) && index >= 0 ? sharedStrings[index] ?? "" : "";
  }
  if (cellType === "inlineStr") return normalizeExtractedText(collectElementText(xmlGet(cell, "is")).join(" "));
  if (cellType === "b") return rawValue === "1" ? "TRUE" : rawValue === "0" ? "FALSE" : rawValue;
  if (rawValue) return rawValue;

  const formula = xmlText(xmlGet(cell, "f"));
  return formula ? `=${formula}` : "";
}

async function xmlTextContent(file: JSZip.JSZipObject): Promise<string> {
  const xml = await file.async("text");
  const parsed = xmlParser.parse(xml);
  return normalizeExtractedText(collectXmlText(parsed).join("\n"));
}

function collectXmlText(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectXmlText);

  const values: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key === "a:t" || key === "t" || key.endsWith(":t")) {
      values.push(...collectXmlText(nested));
    } else {
      values.push(...collectXmlText(nested));
    }
  }
  return values;
}

function officeXmlIndex(path: string): number {
  const match = path.match(/(?:slide|notesSlide)(\d+)\.xml$/i);
  return match ? Number(match[1]) : 0;
}

function availableExtraction(extracted: ExtractedOfficeText, maxExtractedChars: number): OfficeTextExtraction {
  const chars = extracted.text.length;
  const truncated = extracted.truncated === true || chars > maxExtractedChars;
  const text = truncated ? `${extracted.text.slice(0, maxExtractedChars)}\n\n... truncated ...` : extracted.text;
  return {
    status: "available",
    format: extracted.format,
    text,
    unitLabel: extracted.unitLabel,
    unitCount: extracted.unitCount,
    chars,
    truncated,
  };
}

function unsupported(error: string): OfficeTextExtraction {
  return {
    status: "unsupported",
    truncated: false,
    error,
  };
}

function unsupportedOfficeMessage(reason: string): string {
  if (reason === "legacy-binary-format") return "Legacy .doc/.ppt Office files are not supported yet.";
  if (reason === "spreadsheet-format") return "Legacy .xls Office spreadsheets are not supported yet.";
  return "Office file format is not supported yet.";
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countParagraphs(text: string): number {
  return text.split(/\n+/).filter((line) => line.trim()).length;
}

function xmlArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function xmlGet(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function xmlAttribute(value: unknown, name: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const attribute = (value as Record<string, unknown>)[`@_${name}`];
  return typeof attribute === "string" && attribute.trim() ? attribute.trim() : undefined;
}

function xmlText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) return normalizeExtractedText(value.map(xmlText).filter(Boolean).join(" "));
  if (typeof value !== "object") return "";
  const text = (value as Record<string, unknown>)["#text"];
  if (typeof text === "string" || typeof text === "number" || typeof text === "boolean") return String(text).trim();
  return normalizeExtractedText(collectElementText(value).join(" "));
}

function collectElementText(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value).trim();
    return text ? [text] : [];
  }
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectElementText);

  const values: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith("@_")) continue;
    values.push(...collectElementText(nested));
  }
  return values;
}

function normalizeOfficeZipTarget(baseDirectory: string, target: string): string {
  const normalized = target.startsWith("/") ? target.slice(1) : posix.normalize(posix.join(baseDirectory, target));
  return normalized.replace(/^(\.\.\/)+/, "");
}
