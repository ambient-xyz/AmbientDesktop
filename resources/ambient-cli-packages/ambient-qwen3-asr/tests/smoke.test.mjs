import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

describe("ambient-qwen3-asr provider wrapper", () => {
  it("writes Ambient STT JSON with the deterministic fake transcript hook", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-qwen3-asr-smoke-"));
    const audioPath = join(workspace, "utterance.wav");
    const outputJson = join(workspace, ".ambient", "stt", "thread-1", "utt-1.json");
    await writeFile(audioPath, silentWav(250));
    await mkdir(dirname(outputJson), { recursive: true });

    const { stdout } = await execFileAsync(process.execPath, [join(packageRoot, "scripts", "run.mjs"), "--audio", audioPath, "--language", "English", "--output-json", outputJson], {
      cwd: packageRoot,
      env: {
        ...process.env,
        AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT: "hello from qwen",
      },
    });

    expect(JSON.parse(stdout)).toMatchObject({
      text: "hello from qwen",
      language: "English",
      providerId: "qwen3-asr-0.6b-llamacpp",
    });
    await expect(readFile(outputJson, "utf8")).resolves.toContain("hello from qwen");
  });

  it("reports the checksum-pinned default asset manifest in health output", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-qwen3-asr-health-"));
    const { stdout } = await execFileAsync(process.execPath, [join(packageRoot, "scripts", "run.mjs"), "--health"], {
      cwd: packageRoot,
      env: {
        ...process.env,
        AMBIENT_QWEN3_ASR_BINARY: join(workspace, "missing-llama-mtmd-cli"),
        AMBIENT_QWEN3_ASR_MODEL: "",
      },
    });

    const payload = JSON.parse(stdout);
    expect(payload).toMatchObject({
      providerId: "qwen3-asr-0.6b-llamacpp",
      available: false,
      runtime: {
        model: "ggml-org/Qwen3-ASR-0.6B-GGUF:Q8_0",
        modelSource: "manifest",
      },
      assetManifest: {
        schemaVersion: "ambient-stt-qwen3-asr-assets-v1",
        version: "2026-05-10.1",
        model: {
          id: "qwen3-asr-0.6b-q8_0",
          repo: "ggml-org/Qwen3-ASR-0.6B-GGUF",
          revision: "928ab958557df9aa2ef1c93e0e83c7ad0933fae2",
        },
        runtime: {
          directDownloadsEnabled: false,
        },
      },
    });
    expect(payload.assetManifest.model.files).toEqual([
      expect.objectContaining({
        role: "model",
        filename: "Qwen3-ASR-0.6B-Q8_0.gguf",
        sizeBytes: 804749248,
        sha256: "bca259818b50ca7c4c05e9bdb35a5dc04fa039653a6d6f3f0f331f96f6aa1971",
      }),
      expect.objectContaining({
        role: "mmproj",
        filename: "mmproj-Qwen3-ASR-0.6B-Q8_0.gguf",
        sizeBytes: 214392480,
        sha256: "41a342b5e4c514e968cb756de6cd1b7be39eff43c44c57a2ef5fc6522e36603d",
      }),
    ]);
  });
});

function silentWav(durationMs) {
  const sampleRate = 16_000;
  const channels = 1;
  const bitsPerSample = 16;
  const sampleCount = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const dataBytes = sampleCount * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}
