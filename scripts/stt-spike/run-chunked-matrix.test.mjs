import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "./run-chunked-matrix.mjs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const itWithFfmpeg = hasFfmpeg ? it : it.skip;

describe("STT chunk-size matrix harness", () => {
  itWithFfmpeg("runs several chunk sizes and writes a matrix summary", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-chunked-matrix-"));
    const audioPath = join(workspace, "sample.wav");
    const corpusPath = join(workspace, "corpus.json");
    const providersPath = join(workspace, "providers.json");
    const outDir = join(workspace, "out");
    await writeFile(audioPath, silenceWav({ durationMs: 2500, sampleRate: 16000 }));
    await writeFile(
      corpusPath,
      JSON.stringify({
        samples: [{ id: "sample", path: audioPath, language: "English", durationMs: 2500, normalize: false, expectedText: "sample" }],
      }),
    );
    await writeFile(
      providersPath,
      JSON.stringify({
        providers: [
          {
            id: "echo-chunk",
            label: "Echo chunk",
            command: process.execPath,
            args: ["-e", "process.stdout.write('sample')"],
            parseStdout: "text",
          },
        ],
      }),
    );

    const exitCode = await main([
      "--corpus",
      corpusPath,
      "--providers",
      providersPath,
      "--out",
      outDir,
      "--run-id",
      "matrix",
      "--chunk-ms-values",
      "1000,2000",
      "--min-chunk-ms",
      "100",
      "--no-normalize",
    ]);

    expect(exitCode).toBe(0);
    const matrix = JSON.parse(await readFile(join(outDir, "matrix", "matrix-results.json"), "utf8"));
    expect(matrix.runs).toHaveLength(2);
    expect(matrix.runs.map((run) => run.chunkMs)).toEqual([1000, 2000]);
    expect(matrix.runs[0]).toMatchObject({
      aggregate: {
        sampleCount: 1,
        speechSampleCount: 1,
      },
      paths: {
        resultsJson: expect.stringContaining("chunk-1000ms-hop-1000ms/results.json"),
      },
    });
    expect(matrix.recommendation.mode).toBeTruthy();
    await expect(readFile(join(outDir, "matrix", "matrix-summary.md"), "utf8")).resolves.toContain("STT Chunked Matrix matrix");
  });
});

function silenceWav(input) {
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = Math.round((input.durationMs / 1000) * input.sampleRate);
  const dataSize = sampleCount * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(input.sampleRate, 24);
  buffer.writeUInt32LE(input.sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}
