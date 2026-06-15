import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDocxFixture, createPptxFixture, createXlsxFixture } from "./officeTestFixtures";
import { extractOfficeText } from "./officeTextExtraction";

describe("extractOfficeText", () => {
  it("extracts paragraphs from a docx file", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-office-docx-"));
    try {
      const path = join(workspace, "brief.docx");
      await writeFile(path, await createDocxFixture(["Ambient Office Plan", "Parse documents natively.", "Keep preview rendering separate."]));

      await expect(extractOfficeText(path)).resolves.toMatchObject({
        status: "available",
        format: "docx",
        unitLabel: "paragraphs",
        unitCount: 3,
        truncated: false,
        text: expect.stringContaining("Ambient Office Plan"),
      });
      const result = await extractOfficeText(path);
      expect(result.text).toContain("Parse documents natively.");
      expect(result.text).toContain("Keep preview rendering separate.");
      expect(result.chars).toBe(result.text?.length);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("extracts slide-organized text and notes from a pptx file", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-office-pptx-"));
    try {
      const path = join(workspace, "deck.pptx");
      await writeFile(
        path,
        await createPptxFixture([
          { title: "Office parsing", body: "Extract slide text.", notes: "Mention file_read integration next." },
          { title: "Office preview", body: "Render through LibreOffice PDF conversion." },
        ]),
      );

      const result = await extractOfficeText(path);
      expect(result).toMatchObject({
        status: "available",
        format: "pptx",
        unitLabel: "slides",
        unitCount: 2,
        truncated: false,
      });
      expect(result.text).toContain("Slide 1");
      expect(result.text).toContain("Office parsing");
      expect(result.text).toContain("Speaker notes");
      expect(result.text).toContain("Mention file_read integration next.");
      expect(result.text).toContain("Slide 2");
      expect(result.text).toContain("Render through LibreOffice PDF conversion.");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("extracts sheet-organized cell text from an xlsx file", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-office-xlsx-"));
    try {
      const path = join(workspace, "budget.xlsx");
      await writeFile(
        path,
        await createXlsxFixture([
          {
            name: "Launch Budget",
            rows: [
              ["Item", "Owner", "Cost"],
              ["Venue", "Anika Rao", 1200],
              ["Status", "Approved", true],
            ],
          },
          {
            name: "Risks",
            rows: [
              ["Risk", "Mitigation"],
              ["Support coverage", "Add regional on-call"],
            ],
          },
        ]),
      );

      const result = await extractOfficeText(path);
      expect(result).toMatchObject({
        status: "available",
        format: "xlsx",
        unitLabel: "sheets",
        unitCount: 2,
        truncated: false,
      });
      expect(result.text).toContain("Sheet: Launch Budget");
      expect(result.text).toContain("A1: Item");
      expect(result.text).toContain("B2: Anika Rao");
      expect(result.text).toContain("C2: 1200");
      expect(result.text).toContain("C3: TRUE");
      expect(result.text).toContain("Sheet: Risks");
      expect(result.text).toContain("Support coverage");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("returns stable unsupported results for unsupported Office formats", async () => {
    await expect(extractOfficeText("legacy.ppt")).resolves.toMatchObject({
      status: "unsupported",
      truncated: false,
      error: expect.stringContaining("Legacy"),
    });
    await expect(extractOfficeText("sheet.xls")).resolves.toMatchObject({
      status: "unsupported",
      truncated: false,
      error: expect.stringContaining("Legacy .xls"),
    });
  });

  it("returns failed for corrupt supported Office files", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-office-corrupt-"));
    try {
      const path = join(workspace, "corrupt.pptx");
      await writeFile(path, "not a zip file", "utf8");

      await expect(extractOfficeText(path)).resolves.toMatchObject({
        status: "failed",
        format: "pptx",
        unitLabel: "slides",
        truncated: false,
        error: expect.any(String),
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("bounds extracted text while preserving original char metadata", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-office-truncate-"));
    try {
      const path = join(workspace, "brief.docx");
      await writeFile(path, await createDocxFixture(["A".repeat(80), "B".repeat(80)]));

      const result = await extractOfficeText(path, { maxExtractedChars: 60 });
      expect(result.status).toBe("available");
      expect(result.truncated).toBe(true);
      expect(result.chars).toBeGreaterThan(120);
      expect(result.text).toContain("... truncated ...");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("returns too-large before parsing oversized sources", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-office-too-large-"));
    try {
      const path = join(workspace, "brief.docx");
      await writeFile(path, await createDocxFixture(["small"]));

      await expect(extractOfficeText(path, { maxSourceBytes: 4 })).resolves.toMatchObject({
        status: "too-large",
        format: "docx",
        unitLabel: "paragraphs",
        truncated: false,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

const sampleDocx = process.env.AMBIENT_OFFICE_SAMPLE_DOCX;
const samplePptx = process.env.AMBIENT_OFFICE_SAMPLE_PPTX;
const itLiveDocx = sampleDocx ? it : it.skip;
const itLivePptx = samplePptx ? it : it.skip;

describe("extractOfficeText live samples", () => {
  itLiveDocx("extracts text from a local sample docx", async () => {
    const result = await extractOfficeText(sampleDocx!);
    expect(result.status).toBe("available");
    expect(result.format).toBe("docx");
    expect(result.chars ?? 0).toBeGreaterThan(0);
    expect(result.text?.trim()).toBeTruthy();
  });

  itLivePptx("extracts text from a local sample pptx", async () => {
    const result = await extractOfficeText(samplePptx!);
    expect(result.status).toBe("available");
    expect(result.format).toBe("pptx");
    expect(result.unitCount ?? 0).toBeGreaterThan(0);
    expect(result.chars ?? 0).toBeGreaterThan(0);
    expect(result.text?.trim()).toBeTruthy();
  });
});
