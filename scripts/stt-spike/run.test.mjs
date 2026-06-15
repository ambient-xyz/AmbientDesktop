import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "./run.mjs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const itWithFfmpeg = hasFfmpeg ? it : it.skip;

describe("STT spike harness", () => {
  it("runs a JSON stdout provider and writes benchmark artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-spike-"));
    const audioPath = join(workspace, "sample.wav");
    const corpusPath = join(workspace, "corpus.json");
    const providersPath = join(workspace, "providers.json");
    const outDir = join(workspace, "out");
    await writeFile(audioPath, "not a real wav; fake runtime does not decode it");
    await writeFile(
      corpusPath,
      `${JSON.stringify(
        {
          samples: [
            {
              id: "en-short-clean",
              path: audioPath,
              language: "English",
              expectedText: "Ambient fake transcript.",
              durationMs: 1000,
              normalize: false,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      providersPath,
      `${JSON.stringify(
        {
          providers: [
            {
              id: "fake-json",
              label: "Fake JSON STT",
              command: process.execPath,
              args: [
                resolve("scripts/stt-spike/fixtures/fake-stt-runtime.mjs"),
                "--audio",
                "{audio}",
                "--language",
                "{language}",
                "--output-json",
                "{outputJson}",
                "--text",
                "Ambient fake transcript.",
              ],
              parseStdout: "json",
              mode: "offline",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const exitCode = await main([
      "--corpus",
      corpusPath,
      "--providers",
      providersPath,
      "--out",
      outDir,
      "--run-id",
      "test-run",
      "--no-normalize",
    ]);

    expect(exitCode).toBe(0);
    const resultPath = join(outDir, "test-run", "results.jsonl");
    const summaryPath = join(outDir, "test-run", "summary.md");
    const result = JSON.parse((await readFile(resultPath, "utf8")).trim());
    expect(result).toMatchObject({
      status: "succeeded",
      provider: { id: "fake-json" },
      sample: { id: "en-short-clean" },
      transcript: { text: "Ambient fake transcript.", language: "English" },
      language: { expected: "English", detected: "English", matchesExpected: true },
      quality: { charErrorRate: 0, editDistance: 0 },
      metrics: { realtimeFactor: expect.any(Number) },
    });
    await expect(stat(result.artifacts.stdoutPath)).resolves.toMatchObject({ size: expect.any(Number) });
    await expect(readFile(result.artifacts.transcriptPath, "utf8")).resolves.toBe("Ambient fake transcript.\n");
    await expect(readFile(summaryPath, "utf8")).resolves.toContain("Fake JSON STT");
  });

  it("supports dry-run without executing the provider command", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-spike-dry-"));
    const audioPath = join(workspace, "sample.wav");
    const corpusPath = join(workspace, "corpus.json");
    const providersPath = join(workspace, "providers.json");
    const outDir = join(workspace, "out");
    await writeFile(audioPath, "placeholder");
    await writeFile(corpusPath, JSON.stringify({ samples: [{ id: "sample", path: audioPath, durationMs: 1000, normalize: false }] }));
    await writeFile(
      providersPath,
      JSON.stringify({
        providers: [{ id: "missing-runtime", command: "definitely-not-a-real-stt-runtime", args: ["--audio", "{audio}"] }],
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
      "dry-run",
      "--dry-run",
      "--no-normalize",
    ]);

    expect(exitCode).toBe(0);
    const result = JSON.parse((await readFile(join(outDir, "dry-run", "results.jsonl"), "utf8")).trim());
    expect(result.status).toBe("succeeded");
    expect(result.command.argv[0]).toBe("definitely-not-a-real-stt-runtime");
    expect(result.transcript.text).toBe("");
  });

  it("runs a disabled provider when it is selected explicitly", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-spike-disabled-"));
    const audioPath = join(workspace, "sample.wav");
    const corpusPath = join(workspace, "corpus.json");
    const providersPath = join(workspace, "providers.json");
    const outDir = join(workspace, "out");
    await writeFile(audioPath, "placeholder");
    await writeFile(corpusPath, JSON.stringify({ samples: [{ id: "sample", path: audioPath, durationMs: 1000, normalize: false }] }));
    await writeFile(
      providersPath,
      JSON.stringify({
        providers: [
          {
            id: "disabled-provider",
            enabled: false,
            command: process.execPath,
            args: ["-e", "process.stdout.write('explicit disabled provider')"],
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
      "disabled",
      "--only-provider",
      "disabled-provider",
      "--no-normalize",
    ]);

    expect(exitCode).toBe(0);
    const result = JSON.parse((await readFile(join(outDir, "disabled", "results.jsonl"), "utf8")).trim());
    expect(result.transcript.text).toBe("explicit disabled provider");
  });

  it("preserves empty JSON transcripts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-spike-empty-json-"));
    const audioPath = join(workspace, "sample.wav");
    const corpusPath = join(workspace, "corpus.json");
    const providersPath = join(workspace, "providers.json");
    const outDir = join(workspace, "out");
    await writeFile(audioPath, "placeholder");
    await writeFile(corpusPath, JSON.stringify({ samples: [{ id: "sample", path: audioPath, language: "English", durationMs: 1000, normalize: false }] }));
    await writeFile(
      providersPath,
      JSON.stringify({
        providers: [
          {
            id: "empty-json",
            command: process.execPath,
            args: ["-e", "process.stdout.write(JSON.stringify({ text: '', language: 'en' }))"],
            parseStdout: "json",
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
      "empty-json",
      "--no-normalize",
    ]);

    expect(exitCode).toBe(0);
    const result = JSON.parse((await readFile(join(outDir, "empty-json", "results.jsonl"), "utf8")).trim());
    expect(result.transcript.text).toBe("");
    expect(result.transcript.language).toBe("en");
  });

  itWithFfmpeg("skips provider execution when the no-speech gate classifies silence", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-spike-nospeech-"));
    const audioPath = join(workspace, "silence.wav");
    const corpusPath = join(workspace, "corpus.json");
    const providersPath = join(workspace, "providers.json");
    const outDir = join(workspace, "out");
    await writeFile(audioPath, silenceWav({ durationMs: 1000, sampleRate: 16000 }));
    await writeFile(corpusPath, JSON.stringify({ samples: [{ id: "silence", path: audioPath, language: "English", durationMs: 1000, normalize: false }] }));
    await writeFile(
      providersPath,
      JSON.stringify({
        providers: [
          {
            id: "must-not-run",
            command: process.execPath,
            args: ["-e", "process.exit(42)"],
            parseStdout: "text",
            noSpeechGate: { type: "rms-dbfs", thresholdDbfs: -55, action: "skip" },
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
      "nospeech",
      "--no-normalize",
    ]);

    expect(exitCode).toBe(0);
    const result = JSON.parse((await readFile(join(outDir, "nospeech", "results.jsonl"), "utf8")).trim());
    const summary = await readFile(join(outDir, "nospeech", "summary.md"), "utf8");
    expect(result.status).toBe("skipped");
    expect(result.execution).toMatchObject({ status: "skipped", skipReason: "no-speech-gate" });
    expect(result.noSpeechGate).toMatchObject({ status: "classified", noSpeech: true, rmsDbfsLabel: "-Infinity" });
    expect(result.transcript.text).toBe("");
    expect(summary).toContain("skip-no-speech");
  });

  it("parses raw Qwen3-ASR llama.cpp transcript envelopes", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-spike-qwen-"));
    const audioPath = join(workspace, "sample.wav");
    const corpusPath = join(workspace, "corpus.json");
    const providersPath = join(workspace, "providers.json");
    const outDir = join(workspace, "out");
    await writeFile(audioPath, "placeholder");
    await writeFile(corpusPath, JSON.stringify({ samples: [{ id: "sample", path: audioPath, language: "Hindi", durationMs: 1000, normalize: false }] }));
    await writeFile(
      providersPath,
      JSON.stringify({
        providers: [
          {
            id: "qwen-envelope",
            command: process.execPath,
            args: ["-e", "process.stdout.write('language English<asr_text>Hello from Qwen.\\n')"],
            parseStdout: "qwen3-asr",
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
      "qwen",
      "--no-normalize",
    ]);

    expect(exitCode).toBe(0);
    const result = JSON.parse((await readFile(join(outDir, "qwen", "results.jsonl"), "utf8")).trim());
    const summary = await readFile(join(outDir, "qwen", "summary.md"), "utf8");
    expect(result.transcript).toMatchObject({ text: "Hello from Qwen.", language: "English" });
    expect(result.language).toMatchObject({ expected: "Hindi", detected: "English", matchesExpected: false });
    expect(summary).toContain("| Hindi | English | no |");
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
