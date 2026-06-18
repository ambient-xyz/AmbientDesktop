import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { downloadMediaArtifact, mediaDownloadResultText, MAX_MEDIA_DOWNLOAD_BYTES } from "./mediaDownload";

const tempWorkspaces: string[] = [];

describe("downloadMediaArtifact", () => {
  afterEach(async () => {
    await Promise.all(tempWorkspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })));
  });

  it("writes validated PNG bytes and sidecar metadata before reporting preview eligibility", async () => {
    const workspace = await tempWorkspace();
    const png = minimalPng({ width: 500, height: 730 });

    const result = await downloadMediaArtifact(
      workspace,
      {
        url: "https://example.test/bunny.png",
        outputPath: "downloads/bunny.png",
        sourceUrl: "https://example.test/source",
        licenseNote: "CC0 test fixture",
      },
      {
        now: () => new Date("2026-05-07T12:00:00.000Z"),
        fetch: async () => response({ body: png, contentType: "image/png", finalUrl: "https://cdn.example.test/bunny.png" }),
      },
    );

    expect(result).toMatchObject({
      artifactPath: "downloads/bunny.png",
      mediaKind: "image",
      mimeType: "image/png",
      bytes: png.byteLength,
      width: 500,
      height: 730,
      sourceUrl: "https://example.test/source",
      licenseNote: "CC0 test fixture",
      inlinePreviewEligible: true,
      metadataPath: "downloads/bunny.png.ambient-media.json",
      finalUrl: "https://cdn.example.test/bunny.png",
    });
    await expect(readFile(join(workspace, "downloads/bunny.png"))).resolves.toEqual(png);
    await expect(readFile(join(workspace, result.metadataPath), "utf8")).resolves.toContain('"validationStatus": "valid"');
    expect(mediaDownloadResultText(result)).toContain("Ambient Desktop will attempt to render an inline media preview");
  });

  it("rejects HTML masquerading as an image without leaving the target artifact", async () => {
    const workspace = await tempWorkspace();

    await expect(
      downloadMediaArtifact(
        workspace,
        { url: "https://example.test/bunny.jpg", outputPath: "bunny.jpg" },
        { fetch: async () => response({ body: Buffer.from("<!doctype html><title>blocked</title>"), contentType: "text/html" }) },
      ),
    ).rejects.toThrow("expected image/* but received text/html");

    expect(existsSync(join(workspace, "bunny.jpg"))).toBe(false);
    expect(existsSync(join(workspace, "bunny.jpg.ambient-media.json"))).toBe(false);
  });

  it("uses an output extension matching the validated image MIME type", async () => {
    const workspace = await tempWorkspace();
    const webp = minimalWebp();

    const result = await downloadMediaArtifact(
      workspace,
      { url: "https://example.test/bunny", outputPath: "bunny.jpg" },
      { fetch: async () => response({ body: webp, contentType: "image/webp" }) },
    );

    expect(result).toMatchObject({
      artifactPath: "bunny.webp",
      mimeType: "image/webp",
      metadataPath: "bunny.webp.ambient-media.json",
    });
    await expect(readFile(join(workspace, "bunny.webp"))).resolves.toEqual(webp);
    expect(existsSync(join(workspace, "bunny.jpg"))).toBe(false);
  });

  it("rejects oversized responses before writing the artifact", async () => {
    const workspace = await tempWorkspace();

    await expect(
      downloadMediaArtifact(
        workspace,
        { url: "https://example.test/large.png", outputPath: "large.png" },
        {
          fetch: async () =>
            response({
              body: Buffer.from("unused"),
              contentType: "image/png",
              contentLength: String(MAX_MEDIA_DOWNLOAD_BYTES + 1),
            }),
        },
      ),
    ).rejects.toThrow("limit");

    expect(existsSync(join(workspace, "large.png"))).toBe(false);
  });
});

async function tempWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "ambient-media-download-"));
  tempWorkspaces.push(workspace);
  return workspace;
}

function response(input: {
  body: Buffer;
  contentType?: string;
  contentLength?: string;
  finalUrl?: string;
  status?: number;
  statusText?: string;
}) {
  return {
    ok: (input.status ?? 200) >= 200 && (input.status ?? 200) < 300,
    status: input.status ?? 200,
    statusText: input.statusText ?? "OK",
    url: input.finalUrl ?? "https://example.test/final",
    headers: {
      get(name: string) {
        const normalized = name.toLowerCase();
        if (normalized === "content-type") return input.contentType ?? null;
        if (normalized === "content-length") return input.contentLength ?? String(input.body.byteLength);
        return null;
      },
    },
    async arrayBuffer() {
      const arrayBuffer = new ArrayBuffer(input.body.byteLength);
      new Uint8Array(arrayBuffer).set(input.body);
      return arrayBuffer;
    },
  };
}

function minimalPng(dimensions: { width: number; height: number }): Buffer {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(dimensions.width, 16);
  buffer.writeUInt32BE(dimensions.height, 20);
  buffer[24] = 8;
  buffer[25] = 2;
  buffer[26] = 0;
  buffer[27] = 0;
  buffer[28] = 0;
  return buffer;
}

function minimalWebp(): Buffer {
  return Buffer.from("RIFF\x0c\x00\x00\x00WEBPVP8 \x00\x00\x00\x00", "binary");
}
