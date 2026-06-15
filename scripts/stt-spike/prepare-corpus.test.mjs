import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "./prepare-corpus.mjs";

describe("STT corpus preparation", () => {
  it("materializes local manifest samples and writes corpus metadata", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-corpus-"));
    const sourcePath = join(workspace, "source.audio");
    const manifestPath = join(workspace, "manifest.json");
    const outDir = join(workspace, "out");
    await writeFile(sourcePath, "fake audio bytes");
    await writeFile(
      manifestPath,
      JSON.stringify({
        samples: [
          {
            id: "local-sample",
            sourcePath,
            extension: ".audio",
            language: "English",
            description: "Local sample for corpus preparation test.",
            expectedSizeBytes: 16,
            sha256: "4f9f731c01cd82057368f946d3f7c3714f78b02057543017edbae6b000f0fa67",
            normalize: false,
            license: "test fixture",
          },
        ],
      }),
    );

    const exitCode = await main(["--manifest", manifestPath, "--out", outDir, "--no-normalize"]);

    expect(exitCode).toBe(0);
    const corpus = JSON.parse(await readFile(join(outDir, "corpus.json"), "utf8"));
    expect(corpus.samples).toEqual([
      expect.objectContaining({
        id: "local-sample",
        path: "raw/local-sample.audio",
        language: "English",
        normalize: false,
        license: "test fixture",
      }),
    ]);
    const downloads = JSON.parse(await readFile(join(outDir, "downloads.json"), "utf8"));
    expect(downloads.downloads[0]).toMatchObject({
      id: "local-sample",
      sizeBytes: 16,
      normalized: false,
    });
    await expect(stat(join(outDir, "raw", "local-sample.audio"))).resolves.toMatchObject({ size: 16 });
  });

  it("generates deterministic silence samples", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-corpus-silence-"));
    const manifestPath = join(workspace, "manifest.json");
    const outDir = join(workspace, "out");
    await writeFile(
      manifestPath,
      JSON.stringify({
        samples: [
          {
            id: "silence-1s",
            extension: ".wav",
            language: "English",
            description: "Generated one-second silence.",
            generate: { type: "silence", durationMs: 1000, sampleRate: 16000 },
            normalize: false,
            license: "generated test fixture",
          },
        ],
      }),
    );

    const exitCode = await main(["--manifest", manifestPath, "--out", outDir, "--no-normalize"]);

    expect(exitCode).toBe(0);
    const corpus = JSON.parse(await readFile(join(outDir, "corpus.json"), "utf8"));
    expect(corpus.samples[0]).toMatchObject({
      id: "silence-1s",
      path: "raw/silence-1s.wav",
      sourceUrl: "generated:silence:1000ms",
      durationMs: 1000,
    });
    const downloads = JSON.parse(await readFile(join(outDir, "downloads.json"), "utf8"));
    expect(downloads.downloads[0]).toMatchObject({
      id: "silence-1s",
      sizeBytes: 32044,
      sha256: "643f8a8dc8bd9c19225afffad2becfec5426180b3749cb208abdf1a6c8354efc",
    });
  });
});
