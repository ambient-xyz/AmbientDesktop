import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

describe("ambient-faster-whisper-stt provider wrapper", () => {
  it("writes Ambient STT JSON with the deterministic fake transcript hook", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-faster-whisper-stt-smoke-"));
    const audioPath = join(workspace, "utterance.wav");
    const outputJson = join(workspace, ".ambient", "stt", "thread-1", "utt-1.json");
    await writeFile(audioPath, silentWav(250));
    await mkdir(dirname(outputJson), { recursive: true });

    const { stdout } = await execFileAsync(process.execPath, [join(packageRoot, "scripts", "run.mjs"), "--audio", audioPath, "--language", "English", "--output-json", outputJson], {
      cwd: packageRoot,
      env: {
        ...process.env,
        AMBIENT_FASTER_WHISPER_FAKE_TRANSCRIPT: "hello from faster whisper",
      },
    });

    expect(JSON.parse(stdout)).toMatchObject({
      text: "hello from faster whisper",
      language: "English",
      providerId: "faster-whisper-tiny-en-cpu",
      runtime: {
        distribution: {
          packageType: "adapter-only",
          bundledRuntimeBinaries: false,
          bundledPythonWheels: false,
          bundledModelWeights: false,
          bundledModelAssets: false,
        },
      },
    });
    await expect(readFile(outputJson, "utf8")).resolves.toContain("hello from faster whisper");
  });

  it("reports fake mode as available in health output", async () => {
    const { stdout } = await execFileAsync(process.execPath, [join(packageRoot, "scripts", "run.mjs"), "--health"], {
      cwd: packageRoot,
      env: {
        ...process.env,
        AMBIENT_FASTER_WHISPER_FAKE_TRANSCRIPT: "health is ready",
      },
    });

    expect(JSON.parse(stdout)).toMatchObject({
      providerId: "faster-whisper-tiny-en-cpu",
      available: true,
      runtime: { mode: "fake" },
      distribution: {
        packageType: "adapter-only",
        bundledRuntimeBinaries: false,
        bundledPythonWheels: false,
        bundledModelWeights: false,
        bundledModelAssets: false,
      },
      installPlan: {
        resolver: "uv",
        pythonVersion: "3.12",
        packages: ["faster-whisper==1.1.1", "requests"],
        defaultModel: "tiny.en",
        defaultDevice: "cpu",
        defaultComputeType: "int8",
      },
      missingHints: [],
    });
  });

  it("reports missing uv without implying bundled runtime or model assets", async () => {
    const missingUvPath = join(tmpdir(), "ambient-faster-whisper-stt-missing-uv");

    const { stdout } = await execFileAsync(process.execPath, [join(packageRoot, "scripts", "run.mjs"), "--health"], {
      cwd: packageRoot,
      env: {
        ...process.env,
        AMBIENT_FASTER_WHISPER_FAKE_TRANSCRIPT: undefined,
        AMBIENT_FASTER_WHISPER_UV: missingUvPath,
      },
    });

    expect(JSON.parse(stdout)).toMatchObject({
      providerId: "faster-whisper-tiny-en-cpu",
      available: false,
      distribution: {
        packageType: "adapter-only",
        bundledRuntimeBinaries: false,
        bundledPythonWheels: false,
        bundledModelWeights: false,
        bundledModelAssets: false,
      },
      installPlan: {
        resolver: "uv",
        packages: ["faster-whisper==1.1.1", "requests"],
      },
      missingHints: expect.arrayContaining([expect.stringContaining("Install uv")]),
    });
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
