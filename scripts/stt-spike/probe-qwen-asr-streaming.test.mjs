import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "./probe-qwen-asr-streaming.mjs";

describe("Qwen-ASR streaming probe harness", () => {
  it("records first text timing and writes artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-qwen-asr-streaming-"));
    const fakeBinary = join(workspace, "fake-qwen-asr.mjs");
    const corpusPath = join(workspace, "corpus.json");
    const modelDir = join(workspace, "model");
    const audioPath = join(workspace, "audio.wav");
    const outDir = join(workspace, "out");
    await writeFile(
      fakeBinary,
      `#!/usr/bin/env node
process.stderr.write("Loading model\\n▶·");
setTimeout(() => {
  process.stdout.write("hello ");
  setTimeout(() => process.stdout.write("world"), 10);
}, 10);
setTimeout(() => {}, 30);
`,
    );
    await chmod(fakeBinary, 0o755);
    await writeFile(audioPath, "");
    await writeFile(
      corpusPath,
      JSON.stringify({
        samples: [{ id: "sample", path: audioPath, language: "English", durationMs: 1000, normalize: false, expectedText: "hello world" }],
      }),
    );

    const exitCode = await main([
      "--corpus",
      corpusPath,
      "--binary",
      fakeBinary,
      "--model-dir",
      modelDir,
      "--out",
      outDir,
      "--run-id",
      "probe",
      "--modes",
      "stream-file",
    ]);

    expect(exitCode).toBe(0);
    const results = JSON.parse(await readFile(join(outDir, "probe", "results.json"), "utf8"));
    expect(results.results[0]).toMatchObject({
      status: "succeeded",
      mode: "stream-file",
      sample: { id: "sample" },
      transcript: { text: "hello world" },
      quality: { charErrorRate: 0 },
    });
    expect(results.results[0].metrics.firstTextAtMs).toBeGreaterThanOrEqual(0);
    await expect(readFile(join(outDir, "probe", "summary.md"), "utf8")).resolves.toContain("Qwen-ASR Streaming Probe probe");
  });
});
