import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDocxFixture } from "./officeTestFixtures";
import { OfficePreviewService } from "./officePreviewService";

describe("OfficePreviewService", () => {
  it("returns missing-renderer when LibreOffice cannot be discovered", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-office-preview-missing-"));
    try {
      const sourcePath = join(workspace, "brief.docx");
      await writeFile(sourcePath, await createDocxFixture(["Preview me"]));
      const service = new OfficePreviewService({
        cacheRoot: join(workspace, "cache"),
        sofficeCandidates: [],
      });

      await expect(service.renderPreview(sourcePath)).resolves.toMatchObject({
        status: "missing-renderer",
        format: "docx",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("can rediscover LibreOffice after an initial missing-renderer result", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-office-preview-refresh-"));
    try {
      const sourcePath = join(workspace, "brief.docx");
      const logPath = join(workspace, "soffice.log");
      const fakeSoffice = await writeFakeSoffice(workspace, logPath);
      await writeFile(sourcePath, await createDocxFixture(["Refresh preview"]));

      const service = new OfficePreviewService({
        cacheRoot: join(workspace, "cache"),
        sofficeCandidates: [],
      });

      await expect(service.renderPreview(sourcePath)).resolves.toMatchObject({
        status: "missing-renderer",
        format: "docx",
      });

      service.clearRendererDiscovery();
      (service as unknown as { options: { sofficeCandidates: string[]; env: NodeJS.ProcessEnv } }).options.sofficeCandidates = [fakeSoffice];
      (service as unknown as { options: { sofficeCandidates: string[]; env: NodeJS.ProcessEnv } }).options.env = {
        ...process.env,
        FAKE_SOFFICE_LOG: logPath,
      };

      await expect(service.renderPreview(sourcePath)).resolves.toMatchObject({
        status: "available",
        format: "docx",
        renderer: "libreoffice",
        pdfPath: expect.stringMatching(/preview\.pdf$/),
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("allows legacy doc, ppt, and xls preview conversion without enabling text extraction", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-office-preview-legacy-"));
    try {
      const docPath = join(workspace, "legacy.doc");
      const pptPath = join(workspace, "legacy.ppt");
      const xlsPath = join(workspace, "legacy.xls");
      const logPath = join(workspace, "soffice.log");
      const fakeSoffice = await writeFakeSoffice(workspace, logPath);
      await writeFile(docPath, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x41]));
      await writeFile(pptPath, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x42]));
      await writeFile(xlsPath, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x43]));

      const service = new OfficePreviewService({
        cacheRoot: join(workspace, "cache"),
        sofficePath: fakeSoffice,
        env: { ...process.env, FAKE_SOFFICE_LOG: logPath },
      });

      await expect(service.renderPreview(docPath)).resolves.toMatchObject({
        status: "available",
        format: "doc",
        renderer: "libreoffice",
        pdfPath: expect.stringMatching(/preview\.pdf$/),
      });
      await expect(service.renderPreview(pptPath)).resolves.toMatchObject({
        status: "available",
        format: "ppt",
        renderer: "libreoffice",
        pdfPath: expect.stringMatching(/preview\.pdf$/),
      });
      await expect(service.renderPreview(xlsPath)).resolves.toMatchObject({
        status: "available",
        format: "xls",
        renderer: "libreoffice",
        pdfPath: expect.stringMatching(/preview\.pdf$/),
      });
      const log = await readFile(logPath, "utf8");
      expect(log.match(/^convert$/gm)).toHaveLength(3);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("converts supported Office files to cached PDFs with a discovered renderer", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-office-preview-convert-"));
    try {
      const sourcePath = join(workspace, "brief.docx");
      const logPath = join(workspace, "soffice.log");
      const fakeSoffice = await writeFakeSoffice(workspace, logPath);
      await writeFile(sourcePath, await createDocxFixture(["Rendered preview"]));

      const service = new OfficePreviewService({
        cacheRoot: join(workspace, "cache"),
        sofficePath: fakeSoffice,
        env: { ...process.env, FAKE_SOFFICE_LOG: logPath },
      });
      const first = await service.renderPreview(sourcePath);
      const second = await service.renderPreview(sourcePath);

      expect(first).toMatchObject({
        status: "available",
        format: "docx",
        renderer: "libreoffice",
        pdfPath: expect.stringMatching(/preview\.pdf$/),
        pdfBytes: expect.any(Number),
      });
      expect(second).toMatchObject({
        status: "available",
        cacheKey: first.cacheKey,
        pdfPath: first.pdfPath,
      });
      expect((await stat(first.pdfPath!)).isFile()).toBe(true);
      const log = await readFile(logPath, "utf8");
      expect(log.match(/^convert$/gm)).toHaveLength(1);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("returns failed when LibreOffice does not produce a PDF", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-office-preview-failed-"));
    try {
      const sourcePath = join(workspace, "brief.docx");
      const fakeSoffice = await writeFakeSoffice(workspace, join(workspace, "soffice.log"), { skipPdf: true });
      await writeFile(sourcePath, await createDocxFixture(["Broken renderer"]));

      const service = new OfficePreviewService({
        cacheRoot: join(workspace, "cache"),
        sofficePath: fakeSoffice,
      });

      await expect(service.renderPreview(sourcePath)).resolves.toMatchObject({
        status: "failed",
        format: "docx",
        renderer: "libreoffice",
        error: expect.stringContaining("PDF"),
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

describe("OfficePreviewService live samples", () => {
  itLiveDocx("renders a local sample docx or reports missing LibreOffice", async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), "ambient-office-preview-live-docx-"));
    try {
      const service = new OfficePreviewService({ cacheRoot });
      const result = await service.renderPreview(sampleDocx!);
      expect(["available", "missing-renderer"]).toContain(result.status);
      if (result.status === "available") {
        expect(result.format).toBe("docx");
        expect(result.pdfPath).toBeTruthy();
        expect((await stat(result.pdfPath!)).isFile()).toBe(true);
      }
    } finally {
      await rm(cacheRoot, { recursive: true, force: true });
    }
  });

  itLivePptx("renders a local sample pptx or reports missing LibreOffice", async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), "ambient-office-preview-live-pptx-"));
    try {
      const service = new OfficePreviewService({ cacheRoot });
      const result = await service.renderPreview(samplePptx!);
      expect(["available", "missing-renderer"]).toContain(result.status);
      if (result.status === "available") {
        expect(result.format).toBe("pptx");
        expect(result.pdfPath).toBeTruthy();
        expect((await stat(result.pdfPath!)).isFile()).toBe(true);
      }
    } finally {
      await rm(cacheRoot, { recursive: true, force: true });
    }
  });
});

async function writeFakeSoffice(workspace: string, logPath: string, options: { skipPdf?: boolean } = {}): Promise<string> {
  await mkdir(workspace, { recursive: true });
  const scriptPath = join(workspace, "fake-soffice.cjs");
  await writeFile(
    scriptPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const log = process.env.FAKE_SOFFICE_LOG;
if (log) fs.appendFileSync(log, process.argv.includes("--version") ? "version\\n" : "convert\\n");
if (process.argv.includes("--version")) {
  console.log("LibreOffice 24.2.0");
  process.exit(0);
}
const outdir = process.argv[process.argv.indexOf("--outdir") + 1];
const input = process.argv[process.argv.length - 1];
fs.mkdirSync(outdir, { recursive: true });
if (${options.skipPdf ? "false" : "true"}) {
  fs.writeFileSync(path.join(outdir, path.basename(input, path.extname(input)) + ".pdf"), "%PDF-1.4\\n%%EOF\\n");
}
`,
    "utf8",
  );
  await chmod(scriptPath, 0o755);
  return scriptPath;
}
