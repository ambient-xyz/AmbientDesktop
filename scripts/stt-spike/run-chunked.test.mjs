import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "./run-chunked.mjs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const itWithFfmpeg = hasFfmpeg ? it : it.skip;

describe("STT chunked simulation harness", () => {
  itWithFfmpeg("splits audio into chunks and stitches provider transcripts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-chunked-"));
    const audioPath = join(workspace, "sample.wav");
    const corpusPath = join(workspace, "corpus.json");
    const providersPath = join(workspace, "providers.json");
    const outDir = join(workspace, "out");
    await writeFile(audioPath, silenceWav({ durationMs: 2500, sampleRate: 16000 }));
    await writeFile(
      corpusPath,
      JSON.stringify({
        samples: [{ id: "sample", path: audioPath, language: "English", durationMs: 2500, normalize: false }],
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
            args: ["-e", "process.stdout.write(process.argv[1])", "{sampleId}"],
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
      "chunked",
      "--chunk-ms",
      "1000",
      "--min-chunk-ms",
      "100",
      "--no-normalize",
    ]);

    expect(exitCode).toBe(0);
    const results = JSON.parse(await readFile(join(outDir, "chunked", "results.json"), "utf8"));
    expect(results.results[0]).toMatchObject({
      status: "succeeded",
      chunks: { count: 3, skipped: 0, nonEmptyTranscript: 3 },
      provider: { id: "echo-chunk" },
      sample: { id: "sample" },
    });
    expect(results.results[0].transcript.text).toContain("sample__chunk-000");
    const chunkLines = (await readFile(join(outDir, "chunked", "chunk-results.jsonl"), "utf8")).trim().split(/\n/);
    expect(chunkLines).toHaveLength(3);
    await expect(readFile(join(outDir, "chunked", "summary.md"), "utf8")).resolves.toContain("Echo chunk");
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
