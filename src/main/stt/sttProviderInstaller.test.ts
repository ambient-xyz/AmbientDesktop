import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverAmbientCliSttProviders } from "../ambient-cli/ambientCliPackages";
import { mergeSttProvidersWithValidation, readQwen3AsrValidationMetadata, setupQwen3AsrProvider } from "./sttProviderInstaller";

describe("Qwen3-ASR STT provider setup", () => {
  it("installs the bundled provider and persists needs-runtime metadata when llama.cpp is missing", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-qwen-stt-setup-missing-"));
    const previousBinary = process.env.AMBIENT_QWEN3_ASR_BINARY;
    const previousModel = process.env.AMBIENT_QWEN3_ASR_MODEL;
    try {
      process.env.AMBIENT_QWEN3_ASR_BINARY = join(workspace, "missing-llama-mtmd-cli");
      process.env.AMBIENT_QWEN3_ASR_MODEL = "";

      const result = await setupQwen3AsrProvider(
        workspace,
        { provider: "qwen3-asr", action: "install" },
        {
          bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          disableRuntimeAutoDetect: true,
          now: () => new Date("2026-05-10T00:00:00.000Z"),
        },
      );

      expect(result.status).toBe("needs-runtime");
      expect(result.validation).toMatchObject({
        provider: "qwen3-asr",
        packageName: "ambient-qwen3-asr",
        status: "needs-runtime",
        updatedAt: "2026-05-10T00:00:00.000Z",
        error: expect.stringContaining("Configured Qwen3-ASR binary does not exist"),
      });
      expect(result.nextSteps.join("\n")).toContain("llama-mtmd-cli");
      await expect(readQwen3AsrValidationMetadata(workspace)).resolves.toMatchObject({
        status: "needs-runtime",
        packageName: "ambient-qwen3-asr",
      });
    } finally {
      restoreEnv("AMBIENT_QWEN3_ASR_BINARY", previousBinary);
      restoreEnv("AMBIENT_QWEN3_ASR_MODEL", previousModel);
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("repairs by binding a runtime binary, validates transcription, and merges validation into provider discovery", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-qwen-stt-setup-ready-"));
    const previousBinary = process.env.AMBIENT_QWEN3_ASR_BINARY;
    const previousFakeTranscript = process.env.AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT;
    const previousModel = process.env.AMBIENT_QWEN3_ASR_MODEL;
    try {
      delete process.env.AMBIENT_QWEN3_ASR_BINARY;
      delete process.env.AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT;
      process.env.AMBIENT_QWEN3_ASR_MODEL = "ggml-org/Qwen3-ASR-0.6B-GGUF:Q8_0";
      const fakeBinary = join(workspace, "fake-llama-mtmd-cli");
      await writeFakeLlamaBinary(fakeBinary);
      const audioPath = join(workspace, "validation.wav");
      await writeFile(audioPath, silentWav(250));

      const result = await setupQwen3AsrProvider(
        workspace,
        {
          provider: "qwen3-asr",
          action: "repair",
          runtimeBinaryPath: fakeBinary,
          validationAudioPath: audioPath,
          spokenLanguage: "English",
        },
        {
          bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          disableRuntimeAutoDetect: true,
          now: () => new Date("2026-05-10T00:00:01.000Z"),
        },
      );

      expect(result.status).toBe("ready");
      expect(result.selectedProvider).toMatchObject({
        packageName: "ambient-qwen3-asr",
        available: true,
        validation: expect.objectContaining({
          status: "passed",
          validationTranscript: "speech validation passed",
          binaryPath: expect.stringContaining("/[REDACTED]/fake-llama-mtmd-cli"),
          runtimeVersion: "version: fake-qwen3-asr",
        }),
      });
      expect(result.validation).toMatchObject({
        status: "passed",
        validationAudioPath: "validation.wav",
        validationTranscript: "speech validation passed",
      });

      const bindings = JSON.parse(await readFile(join(workspace, ".ambient", "cli-packages", "env-bindings.json"), "utf8"));
      expect(bindings.bindings).toEqual([
        {
          packageName: "ambient-qwen3-asr",
          envName: "AMBIENT_QWEN3_ASR_BINARY",
          filePath: "./.ambient/stt/qwen3-asr/env/AMBIENT_QWEN3_ASR_BINARY.value",
        },
      ]);

      const providers = mergeSttProvidersWithValidation(
        await discoverAmbientCliSttProviders(workspace),
        await readQwen3AsrValidationMetadata(workspace),
      );
      expect(providers[0]).toMatchObject({
        available: true,
        validation: expect.objectContaining({ status: "passed" }),
        diagnostics: expect.objectContaining({
          validation: expect.objectContaining({ validationTranscript: "speech validation passed" }),
        }),
      });
    } finally {
      restoreEnv("AMBIENT_QWEN3_ASR_BINARY", previousBinary);
      restoreEnv("AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT", previousFakeTranscript);
      restoreEnv("AMBIENT_QWEN3_ASR_MODEL", previousModel);
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("repairs by installing a runtime binary when Settings requests runtime install", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-qwen-stt-setup-installer-"));
    const previousBinary = process.env.AMBIENT_QWEN3_ASR_BINARY;
    const previousModel = process.env.AMBIENT_QWEN3_ASR_MODEL;
    try {
      delete process.env.AMBIENT_QWEN3_ASR_BINARY;
      process.env.AMBIENT_QWEN3_ASR_MODEL = "ggml-org/Qwen3-ASR-0.6B-GGUF:Q8_0";
      const fakeBinary = join(workspace, "runtime", "llama-mtmd-cli");
      const audioPath = join(workspace, "validation.wav");
      await writeFile(audioPath, silentWav(250));

      const result = await setupQwen3AsrProvider(
        workspace,
        {
          provider: "qwen3-asr",
          action: "repair",
          installRuntime: true,
          validationAudioPath: audioPath,
          spokenLanguage: "English",
        },
        {
          bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          disableRuntimeAutoDetect: true,
          runtimeInstaller: async () => {
            await writeFakeLlamaBinary(fakeBinary);
            return {
              attempted: true,
              status: "installed",
              manager: "homebrew",
              packageName: "llama.cpp",
              command: ["/opt/homebrew/bin/brew", "install", "llama.cpp"],
              binaryPath: fakeBinary,
              durationMs: 12,
              missingHints: [],
            };
          },
          now: () => new Date("2026-05-10T00:00:02.000Z"),
        },
      );

      expect(result.status).toBe("ready");
      expect(result.runtimeInstall).toMatchObject({
        attempted: true,
        status: "installed",
        manager: "homebrew",
        binaryPath: fakeBinary,
      });
      expect(result.runtimeCandidates).toContainEqual({ path: fakeBinary, source: "installer", available: true });
      expect(result.validation).toMatchObject({
        status: "passed",
        runtimeVersion: "version: fake-qwen3-asr",
        validationTranscript: "speech validation passed",
      });
    } finally {
      restoreEnv("AMBIENT_QWEN3_ASR_BINARY", previousBinary);
      restoreEnv("AMBIENT_QWEN3_ASR_MODEL", previousModel);
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

async function writeFakeLlamaBinary(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `#!/usr/bin/env node
if (process.argv.includes("--version")) {
  process.stdout.write("version: fake-qwen3-asr\\n");
  process.exit(0);
}
process.stdout.write("language English <|asr_text|>speech validation passed\\n");
`,
    "utf8",
  );
  await chmod(path, 0o755);
}

function silentWav(durationMs: number): Buffer {
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

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
