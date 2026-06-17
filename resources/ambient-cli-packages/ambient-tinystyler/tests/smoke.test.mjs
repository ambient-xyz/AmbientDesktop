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
      realRuntimeImplemented: false,
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
        embedding: {
          dimension: 768,
          values: [...Array.from({ length: 767 }, () => 0), "not-a-number"],
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
