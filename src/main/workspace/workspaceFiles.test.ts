import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  formatFileSize,
  clearImportedWorkspaceContext,
  clearImportedWorkspaceContextSync,
  describeWorkspaceAbsoluteContextPaths,
  describeWorkspaceContextReferences,
  describeWorkspaceContextPaths,
  parseGitStatus,
  listWorkspaceFiles,
  parseGitStatusLine,
  readLocalFilePreview,
  readWorkspaceFile,
  resolveWorkspacePathForOpen,
  resolveWorkspacePath,
  shouldIgnoreWorkspaceEntry,
  truncateText,
  writeWorkspaceTextFile,
} from "./workspaceFiles";
import { createDocxFixture, createPptxFixture, createXlsxFixture } from "./workspaceOfficeFacade";
import { createPdfFixture } from "./workspacePdfFacade";

describe("shouldIgnoreWorkspaceEntry", () => {
  it("skips heavy/generated workspace folders", () => {
    expect(shouldIgnoreWorkspaceEntry("node_modules")).toBe(true);
    expect(shouldIgnoreWorkspaceEntry(".ambient-codex")).toBe(true);
    expect(shouldIgnoreWorkspaceEntry("release")).toBe(true);
    expect(shouldIgnoreWorkspaceEntry("Ambient Desktop.app")).toBe(true);
    expect(shouldIgnoreWorkspaceEntry("src")).toBe(false);
  });
});

describe("readWorkspaceFile", () => {
  it("classifies markdown, code, image, audio, and video previews", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-files-"));
    try {
      await writeFile(join(workspace, "notes.md"), "# Hello\n", "utf8");
      await writeFile(join(workspace, "index.html"), "<script src=\"main.js\"></script>", "utf8");
      await writeFile(join(workspace, "app.ts"), "const ok = true;\n", "utf8");
      await writeFile(join(workspace, "pixel.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      await writeFile(join(workspace, "sound.mp3"), Buffer.from([0x49, 0x44, 0x33, 0x04]));
      await writeFile(join(workspace, "clip.webm"), Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
      await writeFile(join(workspace, "brief.pdf"), createPdfFixture(["PDF preview with extractable text."]));
      await writeFile(join(workspace, "brief.docx"), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
      await writeFile(join(workspace, "deck.pptx"), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
      await writeFile(join(workspace, "sheet.xlsx"), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
      await writeFile(join(workspace, "legacy.ppt"), Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));

      await expect(readWorkspaceFile(workspace, "notes.md")).resolves.toMatchObject({
        kind: "markdown",
        language: "markdown",
        binary: false,
      });
      await expect(readWorkspaceFile(workspace, "app.ts")).resolves.toMatchObject({
        kind: "code",
        language: "typescript",
        binary: false,
      });
      await expect(readWorkspaceFile(workspace, "index.html")).resolves.toMatchObject({
        kind: "html",
        previewUrl: expect.stringMatching(/^file:.*index\.html$/),
        binary: false,
      });
      await expect(readWorkspaceFile(workspace, "pixel.png")).resolves.toMatchObject({
        kind: "image",
        mimeType: "image/png",
        binary: true,
      });
      await expect(readWorkspaceFile(workspace, "sound.mp3")).resolves.toMatchObject({
        kind: "audio",
        mimeType: "audio/mpeg",
        binary: true,
        content: "",
        truncated: false,
      });
      await expect(readWorkspaceFile(workspace, "clip.webm")).resolves.toMatchObject({
        kind: "video",
        mimeType: "video/webm",
        binary: true,
        content: "",
        truncated: false,
      });
      await expect(readWorkspaceFile(workspace, "brief.pdf")).resolves.toMatchObject({
        kind: "pdf",
        mimeType: "application/pdf",
        binary: true,
        content: expect.stringContaining("PDF preview with extractable text."),
        pdfText: {
          status: "available",
          pages: 1,
        },
      });
      await expect(readWorkspaceFile(workspace, "brief.docx")).resolves.toMatchObject({
        kind: "office",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        binary: true,
      });
      await expect(readWorkspaceFile(workspace, "deck.pptx")).resolves.toMatchObject({
        kind: "office",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        binary: true,
      });
      await expect(readWorkspaceFile(workspace, "sheet.xlsx")).resolves.toMatchObject({
        kind: "office",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        binary: true,
      });
      await expect(readWorkspaceFile(workspace, "legacy.ppt")).resolves.toMatchObject({
        kind: "office",
        mimeType: "application/vnd.ms-powerpoint",
        binary: true,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("uses an injected media URL factory for audio and video previews", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-media-url-files-"));
    try {
      await writeFile(join(workspace, "sound.mp3"), Buffer.from([0x49, 0x44, 0x33, 0x04]));

      await expect(
        readWorkspaceFile(workspace, "sound.mp3", {
          createMediaUrl: (input) => `ambient-media://workspace/test-token/${input.relativePath}`,
        }),
      ).resolves.toMatchObject({
        kind: "audio",
        mediaUrl: "ambient-media://workspace/test-token/sound.mp3",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("uses an injected media URL factory for image previews", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-media-url-image-files-"));
    try {
      await writeFile(join(workspace, "pixel.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      await expect(
        readWorkspaceFile(workspace, "pixel.png", {
          createMediaUrl: (input) => `ambient-media://workspace/test-token/${input.relativePath}`,
        }),
      ).resolves.toMatchObject({
        kind: "image",
        mediaUrl: "ambient-media://workspace/test-token/pixel.png",
      });

      await expect(
        readLocalFilePreview(workspace, join(workspace, "pixel.png"), {
          createMediaUrl: (input) => `ambient-media://workspace/local-token/${input.allowExternal ? "external" : "workspace"}/${input.relativePath}`,
        }),
      ).resolves.toMatchObject({
        kind: "image",
        source: "local",
        mediaUrl: `ambient-media://workspace/local-token/external/${join(workspace, "pixel.png")}`,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("streams large images and uses detected MIME when image bytes do not match the extension", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-large-image-files-"));
    try {
      const largeJpeg = Buffer.alloc(8_000_001, 0xff);
      largeJpeg[0] = 0xff;
      largeJpeg[1] = 0xd8;
      largeJpeg[2] = 0xff;
      await writeFile(join(workspace, "google-4k.png"), largeJpeg);

      const file = await readWorkspaceFile(workspace, "google-4k.png", {
        createMediaUrl: (input) => `ambient-media://workspace/test-token/${input.relativePath}:${input.mimeType}`,
      });

      expect(file).toMatchObject({
        kind: "image",
        mimeType: "image/jpeg",
        mediaUrl: "ambient-media://workspace/test-token/google-4k.png:image/jpeg",
        truncated: true,
      });
      expect(file.dataUrl).toBeUndefined();
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects file previews when a workspace symlink resolves outside the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-files-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-files-outside-"));
    try {
      await writeFile(join(outside, "secret.txt"), "outside", "utf8");
      await symlink(join(outside, "secret.txt"), join(workspace, "linked-secret.txt"));

      await expect(readWorkspaceFile(workspace, "linked-secret.txt")).rejects.toThrow(/outside the current workspace/);
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("allows file previews when a workspace symlink resolves inside the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-files-"));
    try {
      await mkdir(join(workspace, "src"));
      await writeFile(join(workspace, "src", "target.txt"), "inside", "utf8");
      await symlink(join(workspace, "src", "target.txt"), join(workspace, "linked-target.txt"));

      await expect(readWorkspaceFile(workspace, "linked-target.txt")).resolves.toMatchObject({
        path: "linked-target.txt",
        content: "inside",
        binary: false,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("previews absolute local files without rewriting them as workspace paths", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-local-preview-workspace-"));
    const localRoot = await mkdtemp(join(tmpdir(), "ambient-local-preview-files-"));
    try {
      const localPath = join(localRoot, "Keynote Presentation(2).pptx");
      await writeFile(localPath, await createPptxFixture([{ title: "Local deck", body: "Preview outside workspace." }]));

      await expect(readLocalFilePreview(workspace, localPath)).resolves.toMatchObject({
        path: localPath,
        name: "Keynote Presentation(2).pptx",
        source: "local",
        absolutePath: localPath,
        fileUrl: expect.stringMatching(/^file:.*Keynote%20Presentation/),
        kind: "office",
        content: expect.stringContaining("Preview outside workspace."),
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(localRoot, { recursive: true, force: true });
    }
  });

  it("attaches extracted Office text for supported docx, pptx, and xlsx files", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-office-files-"));
    try {
      await writeFile(join(workspace, "brief.docx"), await createDocxFixture(["Decision memo", "Ship Office file parsing."]));
      await writeFile(
        join(workspace, "deck.pptx"),
        await createPptxFixture([{ title: "Launch checklist", body: "Verify file_read and long_context_process.", notes: "Keep previews separate." }]),
      );
      await writeFile(
        join(workspace, "budget.xlsx"),
        await createXlsxFixture([{ name: "Budget", rows: [["Owner", "Amount"], ["Anika Rao", 1200]] }]),
      );

      await expect(readWorkspaceFile(workspace, "brief.docx")).resolves.toMatchObject({
        kind: "office",
        binary: true,
        content: expect.stringContaining("Ship Office file parsing."),
        language: "text",
        officeText: {
          status: "available",
          format: "docx",
          unitLabel: "paragraphs",
          unitCount: 2,
        },
      });
      await expect(readWorkspaceFile(workspace, "deck.pptx")).resolves.toMatchObject({
        kind: "office",
        binary: true,
        content: expect.stringContaining("Verify file_read and long_context_process."),
        language: "text",
        officeText: {
          status: "available",
          format: "pptx",
          unitLabel: "slides",
          unitCount: 1,
        },
      });
      await expect(readWorkspaceFile(workspace, "budget.xlsx")).resolves.toMatchObject({
        kind: "office",
        binary: true,
        content: expect.stringContaining("B2: 1200"),
        language: "text",
        officeText: {
          status: "available",
          format: "xlsx",
          unitLabel: "sheets",
          unitCount: 1,
        },
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("attaches extracted PDF text while preserving the PDF preview data URL", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pdf-files-"));
    try {
      await writeFile(join(workspace, "memo.pdf"), createPdfFixture(["PDF extraction belongs to Ambient.", "Do not install PyPDF2."]));

      await expect(readWorkspaceFile(workspace, "memo.pdf")).resolves.toMatchObject({
        kind: "pdf",
        binary: true,
        content: expect.stringContaining("PDF extraction belongs to Ambient."),
        language: "text",
        dataUrl: expect.stringMatching(/^data:application\/pdf;base64,/),
        pdfText: {
          status: "available",
          pages: 1,
          truncated: false,
        },
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("attaches Office preview status when a preview renderer is provided", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-office-preview-files-"));
    try {
      await writeFile(join(workspace, "brief.docx"), await createDocxFixture(["Preview-ready document."]));

      await expect(
        readWorkspaceFile(workspace, "brief.docx", {
          createOfficePreview: async (input) => ({
            status: "available",
            format: "docx",
            renderer: "libreoffice",
            cacheKey: "cache-key",
            pdfUrl: `ambient-media://workspace/cache-key/${input.relativePath}.pdf`,
          }),
        }),
      ).resolves.toMatchObject({
        kind: "office",
        officePreview: {
          status: "available",
          format: "docx",
          renderer: "libreoffice",
          pdfUrl: "ambient-media://workspace/cache-key/brief.docx.pdf",
        },
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("keeps legacy doc, ppt, and xls text unsupported while allowing preview metadata", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-office-legacy-preview-files-"));
    try {
      await writeFile(join(workspace, "legacy.doc"), Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x41]));
      await writeFile(join(workspace, "legacy.ppt"), Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x42]));
      await writeFile(join(workspace, "legacy.xls"), Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x43]));

      await expect(
        readWorkspaceFile(workspace, "legacy.doc", {
          createOfficePreview: async () => ({
            status: "available",
            format: "doc",
            renderer: "libreoffice",
            cacheKey: "legacy-doc-cache",
            pdfUrl: "ambient-media://workspace/legacy-doc-cache/legacy.doc.pdf",
          }),
        }),
      ).resolves.toMatchObject({
        kind: "office",
        binary: true,
        content: "",
        language: undefined,
        officeText: {
          status: "unsupported",
          error: expect.stringContaining("Legacy .doc/.ppt"),
        },
        officePreview: {
          status: "available",
          format: "doc",
          renderer: "libreoffice",
          pdfUrl: "ambient-media://workspace/legacy-doc-cache/legacy.doc.pdf",
        },
      });
      await expect(
        readWorkspaceFile(workspace, "legacy.ppt", {
          createOfficePreview: async () => ({
            status: "missing-renderer",
            format: "ppt",
            error: "LibreOffice was not found.",
          }),
        }),
      ).resolves.toMatchObject({
        kind: "office",
        binary: true,
        content: "",
        officeText: {
          status: "unsupported",
        },
        officePreview: {
          status: "missing-renderer",
          format: "ppt",
        },
      });
      await expect(
        readWorkspaceFile(workspace, "legacy.xls", {
          createOfficePreview: async () => ({
            status: "available",
            format: "xls",
            renderer: "libreoffice",
            cacheKey: "legacy-xls-cache",
            pdfUrl: "ambient-media://workspace/legacy-xls-cache/legacy.xls.pdf",
          }),
        }),
      ).resolves.toMatchObject({
        kind: "office",
        binary: true,
        content: "",
        officeText: {
          status: "unsupported",
          error: expect.stringContaining("Legacy .xls"),
        },
        officePreview: {
          status: "available",
          format: "xls",
          renderer: "libreoffice",
          pdfUrl: "ambient-media://workspace/legacy-xls-cache/legacy.xls.pdf",
        },
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("does not return HTML saved with an image extension as an image preview", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-invalid-image-files-"));
    try {
      await writeFile(join(workspace, "bunny.jpg"), "<!doctype html><title>Blocked</title>", "utf8");

      await expect(readWorkspaceFile(workspace, "bunny.jpg")).resolves.toMatchObject({
        kind: "html",
        mimeType: "text/html",
        binary: false,
        content: expect.stringContaining("Blocked"),
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("sniffs valid raster image bytes when the filename extension is wrong", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-mismatched-image-files-"));
    try {
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
      await writeFile(join(workspace, "provider-output.png"), jpeg);

      await expect(readWorkspaceFile(workspace, "provider-output.png")).resolves.toMatchObject({
        kind: "image",
        mimeType: "image/jpeg",
        binary: true,
        dataUrl: expect.stringMatching(/^data:image\/jpeg;base64,/),
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

describe("listWorkspaceFiles", () => {
  it("marks outside, inside, and broken symlinks without following outside targets", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-list-files-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-list-outside-"));
    try {
      await mkdir(join(workspace, "src"));
      await writeFile(join(workspace, "src", "inside.txt"), "inside", "utf8");
      await writeFile(join(outside, "secret.txt"), "outside-secret", "utf8");
      await symlink(join(workspace, "src", "inside.txt"), join(workspace, "inside-link.txt"));
      await symlink(join(outside, "secret.txt"), join(workspace, "outside-link.txt"));
      await symlink(join(workspace, "missing.txt"), join(workspace, "broken-link.txt"));

      const tree = await listWorkspaceFiles(workspace);
      const byPath = new Map(tree.entries.map((entry) => [entry.path, entry]));

      expect(byPath.get("inside-link.txt")).toMatchObject({
        symlink: true,
        symlinkStatus: "inside-workspace",
        symlinkTargetPath: "src/inside.txt",
        symlinkTargetKind: "file",
        size: 6,
      });
      expect(byPath.get("outside-link.txt")).toMatchObject({
        symlink: true,
        symlinkStatus: "outside-workspace",
        blockedReason: expect.stringContaining("outside"),
      });
      expect(byPath.get("outside-link.txt")?.size).toBeUndefined();
      expect(byPath.get("outside-link.txt")?.symlinkTargetPath).toBeUndefined();
      expect(byPath.get("broken-link.txt")).toMatchObject({
        symlink: true,
        symlinkStatus: "broken",
        blockedReason: expect.stringContaining("does not exist"),
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});

const sampleDocx = process.env.AMBIENT_OFFICE_SAMPLE_DOCX;
const samplePptx = process.env.AMBIENT_OFFICE_SAMPLE_PPTX;
const itLiveDocx = sampleDocx ? it : it.skip;
const itLivePptx = samplePptx ? it : it.skip;

describe("readWorkspaceFile live Office samples", () => {
  itLiveDocx("returns extracted text from a local sample docx", async () => {
    const file = await readWorkspaceFile("/", sampleDocx!);
    expect(file.kind).toBe("office");
    expect(file.officeText?.status).toBe("available");
    expect(file.content.trim()).toBeTruthy();
  });

  itLivePptx("returns extracted text from a local sample pptx", async () => {
    const file = await readWorkspaceFile("/", samplePptx!);
    expect(file.kind).toBe("office");
    expect(file.officeText?.status).toBe("available");
    expect(file.content.trim()).toBeTruthy();
  });
});

describe("writeWorkspaceTextFile", () => {
  it("writes UTF-8 text inside the workspace and creates parent folders", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-write-files-"));
    try {
      await expect(writeWorkspaceTextFile(workspace, "reports/out.txt", "hello")).resolves.toEqual({
        path: "reports/out.txt",
        bytes: 5,
      });
      await expect(readWorkspaceFile(workspace, "reports/out.txt")).resolves.toMatchObject({
        content: "hello",
        binary: false,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects writes outside the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-write-files-"));
    try {
      await expect(writeWorkspaceTextFile(workspace, "../outside.txt", "nope")).rejects.toThrow("outside");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects writes through workspace symlinks", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-write-files-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-write-outside-"));
    try {
      await writeFile(join(outside, "secret.txt"), "outside", "utf8");
      await writeFile(join(workspace, "target.txt"), "inside", "utf8");
      await symlink(join(outside, "secret.txt"), join(workspace, "linked-outside.txt"));
      await symlink(join(workspace, "target.txt"), join(workspace, "linked-inside.txt"));

      await expect(writeWorkspaceTextFile(workspace, "linked-outside.txt", "changed")).rejects.toThrow(/symlink|outside/);
      await expect(writeWorkspaceTextFile(workspace, "linked-inside.txt", "changed")).rejects.toThrow(/symlink/);
      await expect(readFile(join(outside, "secret.txt"), "utf8")).resolves.toBe("outside");
      await expect(readFile(join(workspace, "target.txt"), "utf8")).resolves.toBe("inside");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects writes through workspace parent symlinks that escape the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-write-files-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-write-outside-"));
    try {
      await symlink(outside, join(workspace, "linked-dir"));

      await expect(writeWorkspaceTextFile(workspace, "linked-dir/out.txt", "changed")).rejects.toThrow(/outside/);
      await expect(readFile(join(outside, "out.txt"), "utf8")).rejects.toThrow();
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects a file-to-symlink swap immediately before opening for write", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-write-race-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-write-race-outside-"));
    try {
      await writeFile(join(workspace, "race.txt"), "inside", "utf8");
      await writeFile(join(outside, "secret.txt"), "outside", "utf8");
      await rm(join(workspace, "race.txt"));
      await symlink(join(outside, "secret.txt"), join(workspace, "race.txt"));

      await expect(writeWorkspaceTextFile(workspace, "race.txt", "changed")).rejects.toThrow(/symlink|outside/);
      await expect(readFile(join(outside, "secret.txt"), "utf8")).resolves.toBe("outside");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe("resolveWorkspacePathForOpen", () => {
  it("rejects opening workspace symlinks that resolve outside the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-open-files-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-open-outside-"));
    try {
      await writeFile(join(outside, "secret.txt"), "outside", "utf8");
      await symlink(join(outside, "secret.txt"), join(workspace, "linked-secret.txt"));

      await expect(resolveWorkspacePathForOpen(workspace, "linked-secret.txt")).rejects.toThrow(/outside/);
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("resolves inside-workspace symlinks to their canonical open target", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-open-files-"));
    try {
      await mkdir(join(workspace, "src"));
      const targetPath = join(workspace, "src", "target.txt");
      await writeFile(targetPath, "inside", "utf8");
      await symlink(targetPath, join(workspace, "linked-target.txt"));

      await expect(resolveWorkspacePathForOpen(workspace, "linked-target.txt")).resolves.toMatchObject({
        absolutePath: join(workspace, "linked-target.txt"),
        realPath: await realpath(targetPath),
        displayPath: "linked-target.txt",
        symlink: true,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

describe("workspace context references", () => {
  it("describes files and folders inside the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-context-"));
    try {
      await mkdir(join(workspace, "src"));
      await writeFile(join(workspace, "src", "app.ts"), "const ok = true;\n", "utf8");

      await expect(describeWorkspaceContextPaths(workspace, ["src", "src/app.ts"])).resolves.toEqual([
        { path: "src", name: "src", kind: "directory" },
        { path: "src/app.ts", name: "app.ts", kind: "file", size: 17 },
      ]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects selected context outside the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-context-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-outside-"));
    try {
      await writeFile(join(outside, "note.txt"), "outside", "utf8");
      await expect(describeWorkspaceAbsoluteContextPaths(workspace, [join(outside, "note.txt")])).rejects.toThrow(
        "outside",
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects selected context when a workspace symlink resolves outside the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-context-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-outside-"));
    try {
      await writeFile(join(outside, "note.txt"), "outside", "utf8");
      await symlink(join(outside, "note.txt"), join(workspace, "linked-note.txt"));

      await expect(describeWorkspaceContextPaths(workspace, ["linked-note.txt"])).rejects.toThrow(/outside/);
      await expect(describeWorkspaceAbsoluteContextPaths(workspace, [join(workspace, "linked-note.txt")])).rejects.toThrow(
        /outside/,
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("imports selected external files into workspace context when external context is allowed", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-context-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-outside-"));
    try {
      const sourceName = "Screenshot 2026-05-14 at 3.07.45\u202fpm.png";
      const sourcePath = join(outside, sourceName);
      await writeFile(sourcePath, "outside", "utf8");
      const [selected] = await describeWorkspaceAbsoluteContextPaths(workspace, [sourcePath], { allowExternal: true });
      expect(selected).toMatchObject({
        path: expect.stringMatching(/^\.ambient\/context\/Screenshot-2026-05-14-at-3\.07\.45-pm-[0-9a-f]{10}\.png$/),
        name: sourceName,
        kind: "file",
        size: 7,
      });
      expect(selected.absolute).toBeUndefined();
      await expect(readFile(join(workspace, selected.path), "utf8")).resolves.toBe("outside");

      await expect(
        describeWorkspaceContextReferences(workspace, [{ path: sourcePath, absolute: true }], { allowExternal: true }),
      ).resolves.toEqual([selected]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("clears only the managed imported context cache", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-context-"));
    try {
      await mkdir(join(workspace, ".ambient", "context"), { recursive: true });
      await mkdir(join(workspace, ".ambient", "voice"), { recursive: true });
      await writeFile(join(workspace, ".ambient", "context", "screenshot.png"), "context", "utf8");
      await writeFile(join(workspace, ".ambient", "voice", "voice.wav"), "voice", "utf8");

      await clearImportedWorkspaceContext(workspace);

      expect(existsSync(join(workspace, ".ambient", "context"))).toBe(false);
      expect(existsSync(join(workspace, ".ambient", "voice", "voice.wav"))).toBe(true);

      await mkdir(join(workspace, ".ambient", "context"), { recursive: true });
      await writeFile(join(workspace, ".ambient", "context", "another.png"), "context", "utf8");

      clearImportedWorkspaceContextSync(workspace);

      expect(existsSync(join(workspace, ".ambient", "context"))).toBe(false);
      expect(existsSync(join(workspace, ".ambient", "voice", "voice.wav"))).toBe(true);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

describe("formatFileSize", () => {
  it("formats bytes and larger units", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});

describe("truncateText", () => {
  it("marks oversized text as truncated", () => {
    expect(truncateText("abcdef", 3)).toEqual({ text: "abc\n\n... truncated ...", truncated: true });
    expect(truncateText("abc", 3)).toEqual({ text: "abc", truncated: false });
  });
});

describe("resolveWorkspacePath", () => {
  it("rejects paths outside the workspace", () => {
    expect(resolveWorkspacePath("/tmp/workspace", "src/index.ts")).toBe("/tmp/workspace/src/index.ts");
    expect(() => resolveWorkspacePath("/tmp/workspace", "../outside.txt")).toThrow("outside");
  });
});

describe("parseGitStatus", () => {
  it("groups common status kinds", () => {
    expect(parseGitStatus(" M src/app.ts\nA  src/new.ts\n D old.ts\n?? notes.md")).toEqual([
      { path: "src/app.ts", status: " M", category: "modified" },
      { path: "src/new.ts", status: "A ", category: "added" },
      { path: "old.ts", status: " D", category: "deleted" },
      { path: "notes.md", status: "??", category: "untracked" },
    ]);
  });

  it("parses renamed files", () => {
    expect(parseGitStatusLine("R  old.ts -> new.ts")).toEqual({
      path: "new.ts",
      originalPath: "old.ts",
      status: "R ",
      category: "renamed",
    });
  });
});
