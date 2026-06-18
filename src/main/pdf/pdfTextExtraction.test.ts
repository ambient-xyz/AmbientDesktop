import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPdfFixture } from "./pdfTestFixtures";
import { extractPdfText } from "./pdfTextExtraction";

describe("extractPdfText", () => {
  it("extracts bounded text and page metadata from PDFs", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pdf-text-"));
    try {
      const path = join(workspace, "brief.pdf");
      await writeFile(path, createPdfFixture(["Launch owner: Anika Rao.", "Budget is 1200."]));

      await expect(extractPdfText(path)).resolves.toMatchObject({
        status: "available",
        text: expect.stringContaining("Launch owner: Anika Rao."),
        pages: 1,
        truncated: false,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("reports image-only or empty PDFs as no-text", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pdf-empty-"));
    try {
      const path = join(workspace, "empty.pdf");
      await writeFile(path, createPdfFixture([]));

      await expect(extractPdfText(path)).resolves.toMatchObject({
        status: "no-text",
        pages: 1,
        chars: 0,
        error: expect.stringContaining("no extractable text"),
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
