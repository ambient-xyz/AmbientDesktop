import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const script = join(packageRoot, "scripts", "tinystyler_cli.py");

function styleProfile({ profileName = "real-style-profile", runtimeMode = "style-embedding-transformers" } = {}) {
  return {
    schemaVersion: "ambient.tinystyler.profile.v1",
    profileName,
    createdAt: "2026-06-17T00:00:00Z",
    sourceSummary: {
      exampleCount: 1,
      charCount: 31,
      rawTextPersisted: false,
      exactSourceVerifiersPersisted: false,
    },
    createdWith: {
      packageVersion: "0.1.0",
      tinystylerRevision: "2a879107b2ec342e57170b82cdc344d5179fa32b",
      styleEmbeddingRevision: "d7d0f5ca829316a8f5695e49dfce80b86db5e76c",
      t5Revision: "a98b0fcd0b8137ded40cdf0c0cf0ee884e7c9726",
      runtimeMode,
    },
    embedding: {
      model: "AnnaWegmann/Style-Embedding",
      dimension: 768,
      pooling: "mean",
      dtype: "float32",
      values: Array.from({ length: 768 }, () => 0.125),
    },
    generationDefaults: {
      model: "tinystyler/tinystyler",
      temperature: 1.0,
      topP: 1.0,
      maxNewTokens: 128,
    },
    safety: {
      impersonationWarningShown: true,
      intendedUse: "style adaptation",
    },
  };
}

describe("ambient-tinystyler package wrapper", () => {
  it("reports the pinned package and model-asset contract without downloads", async () => {
    const { stdout } = await execFileAsync("python3", [script, "doctor", "--json"], { cwd: packageRoot, timeout: 30_000 });
    const payload = JSON.parse(stdout);
    expect(payload).toMatchObject({
      packageName: "ambient-tinystyler",
      status: "contract_ready",
      contractReady: true,
      ready: false,
      nonMutating: true,
      realRuntimeImplemented: true,
      profileRuntimeImplemented: true,
      transferRuntimeImplemented: true,
      fakeRuntimeAvailable: true,
      revisions: {
        tinystyler: "2a879107b2ec342e57170b82cdc344d5179fa32b",
        styleEmbedding: "d7d0f5ca829316a8f5695e49dfce80b86db5e76c",
        t5: "a98b0fcd0b8137ded40cdf0c0cf0ee884e7c9726",
      },
    });
    expect(payload.modelAssets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "tinystyler-transfer-weights",
        expectedSizeBytes: 3136036422,
        sha256: "8b60d2c32bb46fc0ffe3329a48c3664a794f1c195257365d5dc3753732ea6acd",
      }),
      expect.objectContaining({
        name: "style-embedding-model-weights",
        expectedSizeBytes: 498669047,
      }),
      expect.objectContaining({
        name: "t5-v1_1-large-config",
        expectedSizeBytes: 607,
        sha256: "d0b3d0e585673b63c9218e0c526ac6f487e949c66c678e23172f2dbfa5ec73ee",
      }),
    ]));
    expect(typeof payload.pythonDependencies.torch).toBe("boolean");
    expect(typeof payload.pythonDependencies.transformers).toBe("boolean");
    expect(typeof payload.pythonDependencies.sentencepiece).toBe("boolean");
    expect(payload.styleEmbeddingRuntime.fixtureAvailable).toBe(true);
    expect(typeof payload.styleEmbeddingRuntime.assetsVerified).toBe("boolean");
    expect(payload.styleEmbeddingRuntime.ready).toBe(payload.styleEmbeddingRuntime.dependenciesReady && payload.styleEmbeddingRuntime.assetsVerified);
    if (!payload.styleEmbeddingRuntime.filesReady) {
      expect(payload.styleEmbeddingRuntime.assetsVerified).toBe(false);
      expect(payload.styleEmbeddingRuntime.assetVerificationError).toContain("Style-Embedding model cache is incomplete");
    }
    expect(payload.styleEmbeddingRuntime.requiredFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: expect.stringContaining("pytorch_model.bin") }),
      expect.objectContaining({ path: expect.stringContaining("config.json") }),
      expect.objectContaining({ path: expect.stringContaining("tokenizer.json") }),
      expect.objectContaining({ path: expect.stringContaining("tokenizer_config.json") }),
      expect.objectContaining({ path: expect.stringContaining("special_tokens_map.json") }),
    ]));
    expect(payload.transferRuntime.fixtureAvailable).toBe(true);
    expect(payload.transferRuntime.assetsVerified).toBe(false);
    expect(payload.transferRuntime.fullVerification).toBe("deferred-until-transfer");
    expect(payload.transferRuntime.preflightReady).toBe(payload.transferRuntime.dependenciesReady && payload.transferRuntime.filesReady);
    expect(payload.transferRuntime.ready).toBe(false);
    if (!payload.transferRuntime.filesReady) {
      expect(payload.transferRuntime.assetsVerified).toBe(false);
      expect(payload.transferRuntime.assetVerificationError).toContain("TinyStyler transfer model cache is incomplete");
    }
    expect(payload.transferRuntime.requiredFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: expect.stringContaining("tinystyler_model_weights.pt"), expectedSizeBytes: 3136036422 }),
      expect.objectContaining({ path: expect.stringContaining("google-t5-v1_1-large/pytorch_model.bin"), expectedSizeBytes: 3132858253 }),
      expect.objectContaining({ path: expect.stringContaining("google-t5-v1_1-large/config.json"), expectedSizeBytes: 607 }),
      expect.objectContaining({ path: expect.stringContaining("google-t5-v1_1-large/spiece.model"), expectedSizeBytes: 791656 }),
    ]));
  });

  it("schema forbids raw examples unless raw text persistence is explicit", async () => {
    const schema = JSON.parse(await readFile(join(packageRoot, "schemas", "style-profile.schema.json"), "utf8"));
    expect(schema.properties.sourceSummary.allOf).toEqual(expect.arrayContaining([
      expect.objectContaining({
        if: expect.objectContaining({
          properties: { rawTextPersisted: { const: false } },
        }),
        then: { not: { required: ["sourceExamples"] } },
      }),
      expect.objectContaining({
        if: expect.objectContaining({
          properties: { rawTextPersisted: { const: true } },
        }),
        then: { required: ["sourceExamples"] },
      }),
    ]));
    expect(schema.properties.embedding.properties.dimension).toEqual({ const: 768 });
    expect(schema.properties.embedding.properties.values).toMatchObject({
      minItems: 768,
      maxItems: 768,
    });
    expect(schema.properties.createdWith.required).toEqual(expect.arrayContaining(["runtimeMode"]));
  });

  it("creates fake profile and transfer artifacts without retaining raw examples by default", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tinystyler-smoke-"));
    try {
      const examplesPath = join(workspace, "examples.txt");
      const sourcePath = join(workspace, "source.txt");
      const profilePath = join(workspace, ".ambient", "tinystyler", "profiles", "support.json");
      const outputPath = join(workspace, ".ambient", "tinystyler", "outputs", "styled.txt");
      const sourceText = "  Please review the latest logs and summarize the next action.\n\n";
      await writeFile(examplesPath, "Thanks for the thoughtful report.\n\nI can help untangle this carefully.\n", "utf8");
      await writeFile(sourcePath, sourceText, "utf8");

      const env = { ...process.env, AMBIENT_WORKSPACE_PATH: workspace, AMBIENT_TINYSTYLER_FAKE_RUNTIME: "1" };
      const profile = await execFileAsync(
        "python3",
        [script, "profile", "--examples-file", examplesPath, "--output-profile", profilePath, "--profile-name", "support-replies", "--seed", "7", "--fake", "--json"],
        { cwd: packageRoot, env, timeout: 30_000 },
      );
      const profilePayload = JSON.parse(profile.stdout);
      expect(profilePayload).toMatchObject({
        packageName: "ambient-tinystyler",
        status: "profile_created",
        fake: true,
        profileName: "support-replies",
        sourceSummary: {
          exampleCount: 2,
          rawTextPersisted: false,
        },
      });

      const savedProfile = JSON.parse(await readFile(profilePath, "utf8"));
      expect(savedProfile).toMatchObject({
        schemaVersion: "ambient.tinystyler.profile.v1",
        profileName: "support-replies",
        embedding: {
          dimension: 768,
          values: expect.any(Array),
        },
      });
      expect(savedProfile.embedding.values).toHaveLength(768);
      expect(savedProfile.sourceSummary.exactSourceVerifiersPersisted).toBe(false);
      expect(savedProfile.sourceSummary).not.toHaveProperty("sourceHashes");
      expect(savedProfile.sourceSummary).not.toHaveProperty("sourceExamples");
      expect(JSON.stringify(savedProfile)).not.toContain("thoughtful report");

      const transfer = await execFileAsync(
        "python3",
        [script, "transfer", "--input-file", sourcePath, "--profile", profilePath, "--output-file", outputPath, "--seed", "7", "--fake", "--json"],
        { cwd: packageRoot, env, timeout: 30_000 },
      );
      const transferPayload = JSON.parse(transfer.stdout);
      expect(transferPayload).toMatchObject({
        packageName: "ambient-tinystyler",
        status: "transfer_created",
        fake: true,
        profileName: "support-replies",
      });
      expect(transferPayload.outputPath).toMatch(/styled\.txt$/);
      expect(transferPayload).not.toHaveProperty("textPreview");
      expect(existsSync(outputPath)).toBe(true);
      const outputText = await readFile(outputPath, "utf8");
      expect(outputText).toContain("support-replies style transfer");
      expect(outputText.endsWith(sourceText)).toBe(true);
      expect(transfer.stdout).not.toContain("thoughtful report");
      expect(transfer.stdout).not.toContain("latest logs");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("creates a fixture profile through the non-fake profile path and honors raw-text opt-in", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tinystyler-fixture-profile-"));
    try {
      const examplesPath = join(workspace, "examples.jsonl");
      const profilePath = join(workspace, ".ambient", "tinystyler", "profiles", "fixture.json");
      const exampleText = "I appreciate the crisp update and the careful next step.";
      await writeFile(examplesPath, `${JSON.stringify({ text: exampleText })}\n`, "utf8");

      const profile = await execFileAsync(
        "python3",
        [
          script,
          "profile",
          "--examples-file",
          examplesPath,
          "--output-profile",
          profilePath,
          "--profile-name",
          "fixture-profile",
          "--include-source-text",
          "true",
          "--json",
        ],
        {
          cwd: packageRoot,
          env: {
            ...process.env,
            AMBIENT_WORKSPACE_PATH: workspace,
            AMBIENT_TINYSTYLER_PROFILE_EMBEDDING_FIXTURE: "1",
          },
          timeout: 30_000,
        },
      );
      const payload = JSON.parse(profile.stdout);
      expect(payload).toMatchObject({
        packageName: "ambient-tinystyler",
        status: "profile_created",
        fake: false,
        profileName: "fixture-profile",
        metadata: {
          runtimeMode: "fixture-style-embedding",
          device: "fixture",
        },
      });
      expect(profile.stdout).not.toContain(exampleText);

      const savedProfile = JSON.parse(await readFile(profilePath, "utf8"));
      expect(savedProfile).toMatchObject({
        createdWith: {
          runtimeMode: "fixture-style-embedding",
        },
        sourceSummary: {
          rawTextPersisted: true,
          exactSourceVerifiersPersisted: false,
          sourceExamples: [exampleText],
        },
      });
      expect(savedProfile.embedding.values).toHaveLength(768);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("creates non-fake fixture transfer artifacts without leaking source or examples in stdout", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tinystyler-fixture-transfer-"));
    try {
      const examplesPath = join(workspace, "examples.jsonl");
      const sourcePath = join(workspace, "source.txt");
      const profilePath = join(workspace, ".ambient", "tinystyler", "profiles", "fixture.json");
      const outputPath = join(workspace, ".ambient", "tinystyler", "outputs", "profile-transfer.txt");
      const directOutputPath = join(workspace, ".ambient", "tinystyler", "outputs", "direct-transfer.txt");
      const exampleText = "Warm thanks for the thoughtful note and the clear next step.";
      const sourceText = "Please inspect the deployment notes and list the next action.";
      await writeFile(examplesPath, `${JSON.stringify({ text: exampleText })}\n`, "utf8");
      await writeFile(sourcePath, sourceText, "utf8");
      const env = {
        ...process.env,
        AMBIENT_WORKSPACE_PATH: workspace,
        AMBIENT_TINYSTYLER_PROFILE_EMBEDDING_FIXTURE: "1",
        AMBIENT_TINYSTYLER_TRANSFER_FIXTURE: "1",
      };

      await execFileAsync(
        "python3",
        [script, "profile", "--examples-file", examplesPath, "--output-profile", profilePath, "--profile-name", "fixture-profile", "--json"],
        { cwd: packageRoot, env, timeout: 30_000 },
      );

      const transfer = await execFileAsync(
        "python3",
        [script, "transfer", "--input-file", sourcePath, "--profile", profilePath, "--output-file", outputPath, "--seed", "5", "--json"],
        { cwd: packageRoot, env, timeout: 30_000 },
      );
      const payload = JSON.parse(transfer.stdout);
      expect(payload).toMatchObject({
        packageName: "ambient-tinystyler",
        status: "transfer_created",
        fake: false,
        profileName: "fixture-profile",
        metadata: {
          runtimeMode: "fixture-transfer",
          styleInput: "profile",
          styleRuntimeMode: "fixture-style-embedding",
        },
      });
      expect(transfer.stdout).not.toContain(exampleText);
      expect(transfer.stdout).not.toContain(sourceText);
      await expect(readFile(outputPath, "utf8")).resolves.toContain("fixture-profile TinyStyler fixture transfer");

      const directTransfer = await execFileAsync(
        "python3",
        [script, "transfer", "--text", sourceText, "--examples-file", examplesPath, "--output-file", directOutputPath, "--seed", "9", "--json"],
        { cwd: packageRoot, env, timeout: 30_000 },
      );
      const directPayload = JSON.parse(directTransfer.stdout);
      expect(directPayload).toMatchObject({
        packageName: "ambient-tinystyler",
        status: "transfer_created",
        fake: false,
        profileName: "direct-examples-1",
        metadata: {
          runtimeMode: "fixture-transfer",
          styleInput: "examples",
          styleRuntimeMode: "fixture-style-embedding",
        },
      });
      expect(directTransfer.stdout).not.toContain(exampleText);
      expect(directTransfer.stdout).not.toContain(sourceText);
      await expect(readFile(directOutputPath, "utf8")).resolves.toContain("direct-examples-1 TinyStyler fixture transfer");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails real profile extraction clearly when the local Style-Embedding cache is missing", async () => {
    const requiredFiles = ["pytorch_model.bin", "config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"].map((name) => join(packageRoot, "models", "style-embedding", name));
    if (requiredFiles.every((path) => existsSync(path))) return;
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tinystyler-real-profile-missing-"));
    try {
      const examplesPath = join(workspace, "examples.txt");
      const profilePath = join(workspace, ".ambient", "tinystyler", "profiles", "missing-model.json");
      await writeFile(examplesPath, "A short style example.\n", "utf8");
      await expect(
        execFileAsync(
          "python3",
          [script, "profile", "--examples-file", examplesPath, "--output-profile", profilePath, "--profile-name", "missing-model", "--json"],
          { cwd: packageRoot, env: { ...process.env, AMBIENT_WORKSPACE_PATH: workspace }, timeout: 30_000 },
        ),
      ).rejects.toMatchObject({
        stdout: "",
        stderr: expect.stringContaining("Style-Embedding model cache is incomplete"),
      });
      expect(existsSync(profilePath)).toBe(false);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails real transfer clearly when the local TinyStyler cache is missing", async () => {
    const requiredFiles = [
      join(packageRoot, "models", "tinystyler_model_weights.pt"),
      join(packageRoot, "models", "google-t5-v1_1-large", "pytorch_model.bin"),
      join(packageRoot, "models", "google-t5-v1_1-large", "config.json"),
      join(packageRoot, "models", "google-t5-v1_1-large", "spiece.model"),
      join(packageRoot, "models", "google-t5-v1_1-large", "tokenizer_config.json"),
      join(packageRoot, "models", "google-t5-v1_1-large", "special_tokens_map.json"),
    ];
    if (requiredFiles.every((path) => existsSync(path))) return;
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tinystyler-real-transfer-missing-"));
    try {
      const examplesPath = join(workspace, "examples.txt");
      const sourcePath = join(workspace, "source.txt");
      const profilePath = join(workspace, "real-shaped.json");
      const outputPath = join(workspace, ".ambient", "tinystyler", "outputs", "missing-model.txt");
      await writeFile(examplesPath, "A compact fixture style example.\n", "utf8");
      await writeFile(sourcePath, "Rewrite this through the real transfer runtime.", "utf8");
      await writeFile(profilePath, JSON.stringify(styleProfile({ profileName: "missing-transfer-cache" })), "utf8");

      await expect(
        execFileAsync(
          "python3",
          [script, "transfer", "--input-file", sourcePath, "--profile", profilePath, "--output-file", outputPath, "--json"],
          { cwd: packageRoot, env: { ...process.env, AMBIENT_WORKSPACE_PATH: workspace }, timeout: 30_000 },
        ),
      ).rejects.toMatchObject({
        stdout: "",
        stderr: expect.stringContaining("TinyStyler transfer model cache is incomplete"),
      });
      expect(existsSync(outputPath)).toBe(false);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects validation profiles before running real transfer", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tinystyler-real-profile-required-"));
    try {
      const examplesPath = join(workspace, "examples.txt");
      const sourcePath = join(workspace, "source.txt");
      const profilePath = join(workspace, ".ambient", "tinystyler", "profiles", "fixture.json");
      const outputPath = join(workspace, ".ambient", "tinystyler", "outputs", "rejected.txt");
      await writeFile(examplesPath, "A compact fixture style example.\n", "utf8");
      await writeFile(sourcePath, "Rewrite this with a validation profile.", "utf8");
      await execFileAsync(
        "python3",
        [script, "profile", "--examples-file", examplesPath, "--output-profile", profilePath, "--profile-name", "validation-profile", "--json"],
        {
          cwd: packageRoot,
          env: {
            ...process.env,
            AMBIENT_WORKSPACE_PATH: workspace,
            AMBIENT_TINYSTYLER_PROFILE_EMBEDDING_FIXTURE: "1",
          },
          timeout: 30_000,
        },
      );

      await expect(
        execFileAsync(
          "python3",
          [script, "transfer", "--input-file", sourcePath, "--profile", profilePath, "--output-file", outputPath, "--json"],
          { cwd: packageRoot, env: { ...process.env, AMBIENT_WORKSPACE_PATH: workspace }, timeout: 30_000 },
        ),
      ).rejects.toMatchObject({
        stdout: "",
        stderr: expect.stringContaining("requires a profile produced by real Style-Embedding extraction"),
      });
      expect(existsSync(outputPath)).toBe(false);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects over-limit source token counts before real transfer can truncate input", async () => {
    const code = `
import importlib.util
from collections import UserDict
from pathlib import Path
spec = importlib.util.spec_from_file_location("tinystyler_cli", Path("scripts/tinystyler_cli.py").resolve())
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class FakeTokenizer:
    def __call__(self, *_args, **_kwargs):
        return UserDict({"input_ids": list(range(module.SOURCE_MAX_TOKENS + 1))})
try:
    module.validate_transfer_source_length(FakeTokenizer(), "too long")
except module.UserFacingError as error:
    assert "too long for one TinyStyler transfer call" in str(error)
else:
    raise AssertionError("expected source length rejection")
`;
    await execFileAsync("python3", ["-c", code], { cwd: packageRoot, timeout: 30_000 });
  });

  it("requires a transfer output artifact", async () => {
    await expect(
      execFileAsync(
        "python3",
        [script, "transfer", "--text", "Summarize the status.", "--examples-file", "examples.txt", "--json"],
        { cwd: packageRoot, timeout: 30_000 },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("--output-file"),
    });
  });

  it("rejects non-finite transfer options before emitting JSON", async () => {
    await expect(
      execFileAsync(
        "python3",
        [script, "transfer", "--text", "Summarize the status.", "--examples-file", "examples.txt", "--output-file", "styled.txt", "--temperature", "NaN", "--fake", "--json"],
        { cwd: packageRoot, timeout: 30_000 },
      ),
    ).rejects.toMatchObject({
      stdout: "",
      stderr: expect.stringContaining("--temperature must be a finite number"),
    });
  });

  it("rejects blank profile names before writing artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tinystyler-profile-name-"));
    try {
      const examplesPath = join(workspace, "examples.txt");
      const profilePath = join(workspace, ".ambient", "tinystyler", "profiles", "blank.json");
      await writeFile(examplesPath, "A short style example.\n", "utf8");
      await expect(
        execFileAsync(
          "python3",
          [script, "profile", "--examples-file", examplesPath, "--output-profile", profilePath, "--profile-name", "   ", "--fake", "--json"],
          { cwd: packageRoot, env: { ...process.env, AMBIENT_WORKSPACE_PATH: workspace }, timeout: 30_000 },
        ),
      ).rejects.toMatchObject({
        stdout: "",
        stderr: expect.stringContaining("--profile-name must not be empty"),
      });
      expect(existsSync(profilePath)).toBe(false);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects binary and non-UTF-8 example files before writing profiles", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tinystyler-example-encoding-"));
    try {
      const binaryPath = join(workspace, "binary.txt");
      const invalidUtf8Path = join(workspace, "invalid.txt");
      const profilePath = join(workspace, ".ambient", "tinystyler", "profiles", "encoding.json");
      await writeFile(binaryPath, Buffer.from([0x41, 0x00, 0x42]));
      await writeFile(invalidUtf8Path, Buffer.from([0xff, 0xfe, 0xfd]));
      const env = { ...process.env, AMBIENT_WORKSPACE_PATH: workspace, AMBIENT_TINYSTYLER_PROFILE_EMBEDDING_FIXTURE: "1" };

      await expect(
        execFileAsync(
          "python3",
          [script, "profile", "--examples-file", binaryPath, "--output-profile", profilePath, "--profile-name", "binary", "--json"],
          { cwd: packageRoot, env, timeout: 30_000 },
        ),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("appears to be binary"),
      });
      expect(existsSync(profilePath)).toBe(false);

      await expect(
        execFileAsync(
          "python3",
          [script, "profile", "--examples-file", invalidUtf8Path, "--output-profile", profilePath, "--profile-name", "invalid", "--json"],
          { cwd: packageRoot, env, timeout: 30_000 },
        ),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("must be UTF-8 text"),
      });
      expect(existsSync(profilePath)).toBe(false);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects malformed profile embedding values before transfer", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tinystyler-bad-profile-"));
    try {
      const sourcePath = join(workspace, "source.txt");
      const profilePath = join(workspace, "bad-profile.json");
      const outputPath = join(workspace, "styled.txt");
      await writeFile(sourcePath, "Rewrite this without accepting a corrupt profile.", "utf8");
      await writeFile(profilePath, JSON.stringify({
        schemaVersion: "ambient.tinystyler.profile.v1",
        profileName: "bad-profile",
        createdAt: "2026-06-17T00:00:00Z",
        sourceSummary: {
          exampleCount: 1,
          charCount: 24,
          rawTextPersisted: false,
          exactSourceVerifiersPersisted: false,
        },
        createdWith: {
          packageVersion: "0.1.0",
          tinystylerRevision: "2a879107b2ec342e57170b82cdc344d5179fa32b",
          styleEmbeddingRevision: "d7d0f5ca829316a8f5695e49dfce80b86db5e76c",
          t5Revision: "a98b0fcd0b8137ded40cdf0c0cf0ee884e7c9726",
          runtimeMode: "fixture-style-embedding",
        },
        embedding: {
          dimension: 768,
          values: [...Array.from({ length: 767 }, () => 0), "not-a-number"],
        },
        generationDefaults: {
          model: "tinystyler/tinystyler",
          temperature: 1.0,
          topP: 1.0,
          maxNewTokens: 128,
        },
        safety: {
          impersonationWarningShown: true,
          intendedUse: "style adaptation",
        },
      }), "utf8");

      await expect(
        execFileAsync(
          "python3",
          [script, "transfer", "--input-file", sourcePath, "--profile", profilePath, "--output-file", outputPath, "--fake", "--json"],
          { cwd: packageRoot, env: { ...process.env, AMBIENT_WORKSPACE_PATH: workspace }, timeout: 30_000 },
        ),
      ).rejects.toMatchObject({
        stdout: "",
        stderr: expect.stringContaining("finite numbers"),
      });
      expect(existsSync(outputPath)).toBe(false);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects input and output paths outside the Ambient workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tinystyler-boundary-workspace-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-tinystyler-boundary-outside-"));
    try {
      const examplesPath = join(workspace, "examples.txt");
      const outsideInput = join(outside, "host-file.txt");
      const profilePath = join(workspace, ".ambient", "tinystyler", "profiles", "safe.json");
      const outsideProfile = join(outside, "unsafe-profile.json");
      await writeFile(examplesPath, "Keep this example inside the workspace.\n", "utf8");
      await writeFile(outsideInput, "host file should not be read\n", "utf8");
      const env = { ...process.env, AMBIENT_WORKSPACE_PATH: workspace, AMBIENT_TINYSTYLER_FAKE_RUNTIME: "1" };

      await expect(
        execFileAsync(
          "python3",
          [script, "profile", "--examples-file", outsideInput, "--output-profile", profilePath, "--profile-name", "unsafe-read", "--json"],
          { cwd: packageRoot, env, timeout: 30_000 },
        ),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("Input path must stay inside the Ambient workspace"),
      });

      await expect(
        execFileAsync(
          "python3",
          [script, "profile", "--examples-file", examplesPath, "--output-profile", outsideProfile, "--profile-name", "unsafe-write", "--json"],
          { cwd: packageRoot, env, timeout: 30_000 },
        ),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("Output path must stay inside the Ambient workspace"),
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
